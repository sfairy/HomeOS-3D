"""家庭模式服务（对齐 HomeModeService）。

职责：家庭模式 CRUD、激活 / 停用、设备快照恢复、触发器绑定与自动触发、预设包安装、
运行日志缓冲与防抖持久化。激活 / 停用经进程内串行锁串行化，避免并发切换导致互斥组与
快照状态错乱。
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from typing import Any

from sqlalchemy import func, select, update

from ...core.app_config import load_raw_config
from ...core.errors import api_error, not_found
from ...core.models import HomeMode
from . import presets as presets_module
from .actions import HomeModeActivateState, activate_home_mode, deactivate_home_mode
from .linkage import HomeModeLinkageArbiter
from .runtime import (
    HomeModeRuntimeLogStore,
    clamp_int,
    normalize_home_mode_json_array,
)
from .triggers import (
    HomeModeTriggersState,
    check_home_mode_time_triggers,
    handle_home_mode_calendar_away,
    handle_home_mode_everyone_left,
    handle_home_mode_presence_arrive,
    handle_home_mode_state_trigger,
    parse_home_mode_trigger_bindings,
    prune_home_mode_trigger_cooldown,
)

logger = logging.getLogger("homeos.home_mode")

TIME_CHECK_INTERVAL_SECONDS = 30

HOME_MODE_DEFAULT_CONFIG: dict[str, Any] = {
    "triggerCooldownMs": 60_000,
    "applyMaxRetries": 2,
    "maxTriggerLogs": 50,
    "maxExecHistory": 100,
    "showAwayButton": True,
    "showHomeMode": True,
    "manualLockTtlMin": 30,
    "linkageClaimTtlMin": 15,
}

SECURITY_DEFAULT_CONFIG: dict[str, Any] = {
    "autoArmOnEveryoneLeft": False,
    "autoUpgradeToAwayOnEveryoneLeft": False,
    "autoDisarmOnFirstHome": False,
}


def _iso(value) -> str | None:
    if value is None:
        return None
    return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


def _parse_json(raw: Any, fallback: Any) -> Any:
    if raw is None or raw == "":
        return fallback
    if isinstance(raw, (list, dict)):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return fallback


def mode_to_dict(row: HomeMode) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "icon": row.icon,
        "config": _parse_json(row.config, []),
        "triggers": _parse_json(row.triggers, None),
        "isActive": bool(row.is_active),
        "deviceSnapshot": _parse_json(row.device_snapshot, None),
        "sortOrder": row.sort_order,
        "exclusiveGroup": row.exclusive_group,
        "priority": row.priority,
        "createdAt": _iso(row.created_at),
        "updatedAt": _iso(row.updated_at),
    }


class HomeModeService:
    def __init__(
        self,
        session_factory,
        ha_connector,
        state_store,
        *,
        notification=None,
        set_security_mode=None,
        emit_event=None,
        is_leader=None,
        jobs=None,
    ) -> None:
        self._session_factory = session_factory
        self._ha_connector = ha_connector
        self._state_store = state_store
        self._notification = notification
        self._security_mode_setter = set_security_mode
        self._emit_event = emit_event
        self._is_leader = is_leader or (lambda: True)
        self._jobs = jobs

        self.linkage_arbiter = HomeModeLinkageArbiter()
        self._active_mode_id: str | None = None
        self._timer: asyncio.Task | None = None
        self._transition_lock = asyncio.Lock()
        self._runtime_logs = HomeModeRuntimeLogStore(
            session_factory, self._runtime_limits
        )
        self._trigger_state = HomeModeTriggersState()
        self._home_mode_cfg: dict[str, Any] = dict(HOME_MODE_DEFAULT_CONFIG)
        self._security_cfg: dict[str, Any] = dict(SECURITY_DEFAULT_CONFIG)
        self._home_timezone: str | None = None
        self._deps = _HomeModeDeps(self)
        self._activate_state = HomeModeActivateState(
            lambda: self._active_mode_id, self._set_active_mode_id
        )

    # ------------------------------------------------------------------ #
    # 生命周期
    # ------------------------------------------------------------------ #
    def _set_active_mode_id(self, mode_id: str | None) -> None:
        self._active_mode_id = mode_id

    async def start(self) -> None:
        self._load_config()
        with self._session_factory() as session:
            active = session.execute(
                select(HomeMode).where(HomeMode.is_active.is_(True)).limit(1)
            ).scalar_one_or_none()
            self._active_mode_id = active.id if active is not None else None
            if active is not None:
                logger.info("已恢复激活家庭模式: %s", active.name)
        await self.reload_trigger_bindings()
        await self._runtime_logs.load()
        self._timer = asyncio.create_task(self._time_trigger_loop(), name="home-mode-time-triggers")

    async def stop(self) -> None:
        if self._timer is not None:
            self._timer.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._timer
            self._timer = None
        await self._runtime_logs.flush_now()

    async def _time_trigger_loop(self) -> None:
        while True:
            await asyncio.sleep(TIME_CHECK_INTERVAL_SECONDS)
            try:
                if self._jobs is None:
                    await check_home_mode_time_triggers(self._trigger_state, self._deps)
                else:
                    await self._jobs.run(
                        "home-mode-time-triggers",
                        {"description": "家庭模式定时触发检查", "intervalMs": 30_000},
                        lambda: check_home_mode_time_triggers(self._trigger_state, self._deps),
                    )
            except Exception as exc:  # noqa: BLE001
                logger.warning("时间触发器检查失败: %s", exc)

    def _load_config(self) -> None:
        try:
            with self._session_factory() as session:
                raw = load_raw_config(session)
        except Exception:  # noqa: BLE001
            raw = {}
        home_mode = raw.get("homeMode") if isinstance(raw.get("homeMode"), dict) else {}
        security = raw.get("security") if isinstance(raw.get("security"), dict) else {}
        self._home_mode_cfg = {**HOME_MODE_DEFAULT_CONFIG, **home_mode}
        self._security_cfg = {**SECURITY_DEFAULT_CONFIG, **security}
        tz = raw.get("homeTimezone")
        self._home_timezone = tz.strip() if isinstance(tz, str) and tz.strip() else None

    def on_config_updated(self, sections: list[str] | None = None) -> None:
        if sections and "homeMode" not in sections:
            return
        self._load_config()
        self._runtime_logs.trim_to_limits()

    def _runtime_limits(self) -> dict[str, int]:
        return {
            "maxTriggerLogs": int(self._home_mode_cfg.get("maxTriggerLogs") or 50),
            "maxExecHistory": int(self._home_mode_cfg.get("maxExecHistory") or 100),
        }

    async def reload_trigger_bindings(self) -> None:
        with self._session_factory() as session:
            rows = (
                session.execute(select(HomeMode).order_by(HomeMode.sort_order.asc()).limit(200))
                .scalars()
                .all()
            )
        modes = [mode_to_dict(row) for row in rows]
        self._trigger_state.cached_modes = modes
        self._trigger_state.trigger_bindings = parse_home_mode_trigger_bindings(modes)
        prune_home_mode_trigger_cooldown(self._trigger_state.trigger_cooldown)
        logger.info("全屋模式触发器已加载: %s 条", len(self._trigger_state.trigger_bindings))

    # ------------------------------------------------------------------ #
    # CRUD
    # ------------------------------------------------------------------ #
    def find_all(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            rows = (
                session.execute(select(HomeMode).order_by(HomeMode.sort_order.asc()).limit(200))
                .scalars()
                .all()
            )
        return [mode_to_dict(row) for row in rows]

    def find_all_paginated(self, page: int = 1, page_size: int = 50) -> dict[str, Any]:
        page = max(int(page or 1), 1)
        page_size = clamp_int(page_size, 5, 200)
        with self._session_factory() as session:
            total = int(session.execute(select(func.count()).select_from(HomeMode)).scalar() or 0)
            rows = (
                session.execute(
                    select(HomeMode)
                    .order_by(HomeMode.sort_order.asc())
                    .offset((page - 1) * page_size)
                    .limit(page_size)
                )
                .scalars()
                .all()
            )
        items = [mode_to_dict(row) for row in rows]
        return {
            "items": items,
            "total": total,
            "page": page,
            "pageSize": page_size,
            "totalPages": max(1, -(-total // page_size)),
        }

    def find_one(self, mode_id: str) -> dict[str, Any] | None:
        with self._session_factory() as session:
            row = session.get(HomeMode, mode_id)
        return mode_to_dict(row) if row is not None else None

    def get_active(self) -> dict[str, Any] | None:
        with self._session_factory() as session:
            row = session.execute(
                select(HomeMode).where(HomeMode.is_active.is_(True)).limit(1)
            ).scalar_one_or_none()
        return mode_to_dict(row) if row is not None else None

    async def create(self, data: dict[str, Any]) -> dict[str, Any]:
        payload = dict(data)
        if "config" in payload:
            payload["config"] = normalize_home_mode_json_array(payload["config"], "config", True)
        if "triggers" in payload:
            payload["triggers"] = normalize_home_mode_json_array(payload["triggers"], "triggers", False)
        row = HomeMode(
            name=str(payload.get("name") or ""),
            icon=payload.get("icon") or "home",
            config=json.dumps(payload.get("config") or [], ensure_ascii=False),
            triggers=(
                json.dumps(payload["triggers"], ensure_ascii=False)
                if payload.get("triggers") is not None
                else None
            ),
            sort_order=int(payload.get("sortOrder") or 0),
            exclusive_group=payload.get("exclusiveGroup") or "default",
            priority=int(payload.get("priority") if payload.get("priority") is not None else 50),
        )
        with self._session_factory() as session:
            session.add(row)
            session.commit()
            session.refresh(row)
            result = mode_to_dict(row)
        await self.reload_trigger_bindings()
        return result

    async def update(self, mode_id: str, data: dict[str, Any]) -> dict[str, Any]:
        payload = dict(data)
        if "config" in payload:
            payload["config"] = normalize_home_mode_json_array(payload["config"], "config", True)
        if "triggers" in payload:
            payload["triggers"] = normalize_home_mode_json_array(payload["triggers"], "triggers", False)
        with self._session_factory() as session:
            row = session.get(HomeMode, mode_id)
            if row is None:
                not_found(api_error("HOME_MODE_NOT_FOUND"))
            if "name" in payload:
                row.name = str(payload["name"])
            if "icon" in payload:
                row.icon = payload["icon"]
            if "config" in payload:
                row.config = json.dumps(payload["config"] or [], ensure_ascii=False)
            if "triggers" in payload:
                row.triggers = (
                    json.dumps(payload["triggers"], ensure_ascii=False)
                    if payload["triggers"] is not None
                    else None
                )
            if "sortOrder" in payload:
                row.sort_order = int(payload["sortOrder"] or 0)
            if "exclusiveGroup" in payload:
                row.exclusive_group = payload["exclusiveGroup"] or "default"
            if "priority" in payload:
                row.priority = int(payload["priority"] if payload["priority"] is not None else 50)
            session.commit()
            session.refresh(row)
            result = mode_to_dict(row)
        await self.reload_trigger_bindings()
        return result

    async def remove(self, mode_id: str) -> dict[str, Any]:
        with self._session_factory() as session:
            row = session.get(HomeMode, mode_id)
        if row is None:
            not_found(api_error("HOME_MODE_NOT_FOUND"))
        if row.is_active or self._active_mode_id == mode_id:
            await self.deactivate(mode_id)
        with self._session_factory() as session:
            row = session.get(HomeMode, mode_id)
            if row is None:
                not_found(api_error("HOME_MODE_NOT_FOUND"))
            result = mode_to_dict(row)
            session.delete(row)
            session.commit()
        await self.reload_trigger_bindings()
        return result

    async def duplicate(self, mode_id: str) -> dict[str, Any]:
        source = self.find_one(mode_id)
        if source is None:
            not_found(api_error("HOME_MODE_NOT_FOUND"))
        return await self.create(
            {
                "name": f"{source['name']} 副本",
                "icon": source["icon"],
                "config": source["config"],
                "triggers": source["triggers"] or None,
                "sortOrder": (source.get("sortOrder") or 0) + 1,
                "exclusiveGroup": source.get("exclusiveGroup"),
                "priority": source.get("priority"),
            }
        )

    async def reorder(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            for item in items:
                row = session.get(HomeMode, item.get("id"))
                if row is not None:
                    row.sort_order = int(item.get("sortOrder") or 0)
            session.commit()
        await self.reload_trigger_bindings()
        return self.find_all()

    async def seed_defaults(self) -> dict[str, Any]:
        with self._session_factory() as session:
            count = int(session.execute(select(func.count()).select_from(HomeMode)).scalar() or 0)
        if count > 0:
            return {"created": 0}
        for mode in presets_module.HOME_MODE_DEFAULT_MODES:
            await self.create(
                {
                    "name": mode["name"],
                    "icon": mode["icon"],
                    "config": mode["config"],
                    "triggers": mode.get("triggers"),
                    "sortOrder": mode.get("sortOrder"),
                    "exclusiveGroup": mode.get("exclusiveGroup"),
                    "priority": mode.get("priority"),
                }
            )
        logger.info("已创建 %s 个默认全屋模式", len(presets_module.HOME_MODE_DEFAULT_MODES))
        return {"created": len(presets_module.HOME_MODE_DEFAULT_MODES)}

    # ------------------------------------------------------------------ #
    # 预设 / 模板
    # ------------------------------------------------------------------ #
    def get_action_templates(self) -> list[dict[str, Any]]:
        return presets_module.HOME_MODE_ACTION_TEMPLATES

    def get_presets(self) -> list[dict[str, Any]]:
        entity_ids = [entity["entity_id"] for entity in self._state_store.get_all()]
        with self._session_factory() as session:
            rows = (
                session.execute(select(HomeMode.id, HomeMode.name).limit(200)).all()
            )
        existing = [{"id": row[0], "name": row[1]} for row in rows]
        return presets_module.enrich_home_mode_presets(entity_ids, existing)

    async def install_preset(
        self, preset_id: str, entity_overrides: dict[str, str] | None = None, merge: bool = False
    ) -> dict[str, Any]:
        entity_ids = [entity["entity_id"] for entity in self._state_store.get_all()]
        plan = presets_module.build_home_mode_preset_install_plan(
            preset_id, entity_ids, entity_overrides or {}
        )
        preset = plan["preset"]
        with self._session_factory() as session:
            existing = session.execute(
                select(HomeMode).where(HomeMode.name == preset["name"]).limit(1)
            ).scalar_one_or_none()
            existing_dict = mode_to_dict(existing) if existing is not None else None

        if existing_dict is not None and merge:
            row = await self.update(
                existing_dict["id"],
                {"icon": preset["icon"], "config": plan["config"], "triggers": plan["triggersJson"]},
            )
            return {**row, "unresolvedActions": plan["unresolvedActions"]}

        if existing_dict is not None:
            row = await self.create(
                {
                    "name": f"{preset['name']}（预设）",
                    "icon": preset["icon"],
                    "config": plan["config"],
                    "triggers": plan["triggersJson"],
                    "sortOrder": (existing_dict.get("sortOrder") or 0) + 1,
                    "exclusiveGroup": preset.get("exclusiveGroup"),
                    "priority": preset.get("priority"),
                }
            )
            return {**row, "unresolvedActions": plan["unresolvedActions"]}

        with self._session_factory() as session:
            max_order = session.execute(select(func.max(HomeMode.sort_order))).scalar()
        row = await self.create(
            {
                "name": preset["name"],
                "icon": preset["icon"],
                "config": plan["config"],
                "triggers": plan["triggersJson"],
                "sortOrder": int(max_order or 0) + 1,
                "exclusiveGroup": preset.get("exclusiveGroup"),
                "priority": preset.get("priority"),
            }
        )
        return {**row, "unresolvedActions": plan["unresolvedActions"]}

    # ------------------------------------------------------------------ #
    # 激活 / 停用
    # ------------------------------------------------------------------ #
    async def activate(self, mode_id: str, meta: dict[str, Any] | None = None) -> dict[str, Any]:
        async with self._transition_lock:
            return await activate_home_mode(self._activate_state, self._deps, mode_id, meta)

    async def deactivate(self, mode_id: str | None = None) -> dict[str, Any]:
        async with self._transition_lock:
            return await deactivate_home_mode(self._activate_state, self._deps, mode_id)

    def get_active_mode_id(self) -> str | None:
        return self._active_mode_id

    # ------------------------------------------------------------------ #
    # 运行日志
    # ------------------------------------------------------------------ #
    def get_trigger_logs(self, limit: int = 20) -> list[dict[str, Any]]:
        return self._runtime_logs.get_trigger_logs(limit)

    def get_trigger_logs_paginated(
        self, page: int = 1, page_size: int = 20, filters: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        return self._runtime_logs.get_trigger_logs_paginated(page, page_size, filters or {})

    def get_execution_history(self, limit: int = 30) -> list[dict[str, Any]]:
        return self._runtime_logs.get_execution_history(limit)

    def clear_execution_history(self) -> dict[str, int]:
        return self._runtime_logs.clear_execution_history()

    def get_mode_context(self) -> dict[str, Any]:
        last = (
            self._runtime_logs.find_execution_by_mode_id(self._active_mode_id)
            if self._active_mode_id
            else None
        )
        return {
            "calendarAway": self._trigger_state.calendar_away,
            "activeModeId": self._active_mode_id,
            "triggerBindingsCount": len(self._trigger_state.trigger_bindings),
            "triggerLogs": self.get_trigger_logs(8),
            "recentExecutions": self.get_execution_history(5),
            "lastActivation": last or self._runtime_logs.get_latest_execution(),
        }

    # ------------------------------------------------------------------ #
    # 触发器事件入口
    # ------------------------------------------------------------------ #
    async def handle_state_trigger(self, event: dict[str, Any]) -> None:
        await handle_home_mode_state_trigger(self._trigger_state, self._deps, event)

    async def handle_presence_arrive(self, data: dict[str, Any]) -> None:
        await handle_home_mode_presence_arrive(self._trigger_state, self._deps, data)

    async def handle_calendar_away(self, data: dict[str, Any]) -> None:
        await handle_home_mode_calendar_away(self._trigger_state, self._deps, data)

    async def handle_everyone_left(self) -> None:
        await handle_home_mode_everyone_left(self._trigger_state, self._deps)

    async def handle_activate_request(self, data: dict[str, Any]) -> None:
        mode_id = data.get("mode_id") or data.get("modeId")
        if not mode_id:
            return
        try:
            await self.activate(mode_id, {"source": "manual", "reason": "automation"})
        except Exception as exc:  # noqa: BLE001
            logger.warning("自动化请求激活家庭模式失败: %s", exc)

    # ------------------------------------------------------------------ #
    # 底层数据库操作（供 deps 调用）
    # ------------------------------------------------------------------ #
    def _find_mode_row(self, mode_id: str) -> dict[str, Any] | None:
        return self.find_one(mode_id)

    def _list_active_modes(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            rows = (
                session.execute(select(HomeMode).where(HomeMode.is_active.is_(True)).limit(50))
                .scalars()
                .all()
            )
        return [mode_to_dict(row) for row in rows]

    def _find_first_active(self) -> dict[str, Any] | None:
        with self._session_factory() as session:
            row = session.execute(
                select(HomeMode)
                .where(HomeMode.is_active.is_(True))
                .order_by(HomeMode.sort_order.asc())
                .limit(1)
            ).scalar_one_or_none()
        return mode_to_dict(row) if row is not None else None

    def _switch_active_group(
        self,
        conflicting_modes: list[dict[str, Any]],
        conflict_restore: dict[str, dict[str, Any]],
        mode_id: str,
        snapshot: dict[str, Any],
    ) -> None:
        # 先逐条停用旧模式再激活新模式：SQLite 部分唯一索引
        # ``home_modes_exclusive_active_uidx`` 要求同互斥组至多一条 isActive=1，
        # 故必须保证更新顺序（Core 语句立即执行，避免 ORM 工作单元重排）。
        with self._session_factory() as session:
            for active in conflicting_modes:
                outcome = conflict_restore.get(active["id"])
                values: dict[str, Any] = {"is_active": False}
                if outcome and not outcome.get("incomplete"):
                    values["device_snapshot"] = None
                session.execute(
                    update(HomeMode).where(HomeMode.id == active["id"]).values(**values)
                )
            session.execute(
                update(HomeMode)
                .where(HomeMode.id == mode_id)
                .values(
                    is_active=True,
                    device_snapshot=json.dumps(snapshot, ensure_ascii=False),
                )
            )
            session.commit()

    def _deactivate_in_db(self, mode_id: str) -> None:
        with self._session_factory() as session:
            row = session.get(HomeMode, mode_id)
            if row is not None:
                row.is_active = False
                row.device_snapshot = None
                session.commit()

    def _clear_group_active(self, group_ids: list[str], incomplete: bool) -> None:
        with self._session_factory() as session:
            values: dict[str, Any] = {"is_active": False}
            if not incomplete:
                values["device_snapshot"] = None
            session.execute(update(HomeMode).where(HomeMode.id.in_(group_ids)).values(**values))
            session.commit()

    async def _notify(self, level: str, message: str, source: str) -> None:
        if self._notification is None:
            logger.info("[notify:%s] %s (%s)", level, message, source)
            return
        try:
            result = self._notification.notify(level, message, source)
            if asyncio.iscoroutine(result):
                await result
        except Exception as exc:  # noqa: BLE001
            logger.warning("家庭模式通知发送失败: %s", exc)

    async def _call_service(
        self, domain: str, service: str, entity_id: str, data: dict[str, Any]
    ) -> Any:
        return await self._ha_connector.call_service(domain, service, entity_id, data)

    async def _fetch_entity_state(self, entity_id: str) -> dict[str, Any] | None:
        entity = self._state_store.get(entity_id)
        if entity is None:
            return None
        return {"state": entity.get("state"), "attributes": entity.get("attributes") or {}}

    async def _apply_security_mode(self, mode: str, source: str) -> bool:
        if self._security_mode_setter is None:
            return True
        result = self._security_mode_setter(mode, source)
        if asyncio.iscoroutine(result):
            result = await result
        if isinstance(result, dict):
            return bool(result.get("success", True))
        return bool(result)

    async def _emit_home_mode_event(self, name: str, payload: dict[str, Any]) -> None:
        if self._emit_event is None:
            return
        result = self._emit_event(name, payload)
        if asyncio.iscoroutine(result):
            await result

    # ------------------------------------------------------------------ #
    # deps 视图
    # ------------------------------------------------------------------ #
    @property
    def deps(self) -> _HomeModeDeps:
        return self._deps

    @property
    def trigger_state(self) -> HomeModeTriggersState:
        return self._trigger_state


class _HomeModeDeps:
    """激活 / 触发编排所需依赖集合（对齐 actions.internals / triggers.internals 的 deps）。"""

    def __init__(self, service: HomeModeService) -> None:
        self._service = service

    # 日志
    def log(self, message: str) -> None:
        logger.info(message)

    def warn(self, message: str) -> None:
        logger.warning(message)

    # 数据访问
    async def find_mode(self, mode_id: str) -> dict[str, Any] | None:
        return self._service._find_mode_row(mode_id)

    async def list_active_modes(self) -> list[dict[str, Any]]:
        return self._service._list_active_modes()

    async def find_first_active(self) -> dict[str, Any] | None:
        return self._service._find_first_active()

    async def switch_active_group(
        self,
        conflicting_modes: list[dict[str, Any]],
        conflict_restore: dict[str, dict[str, Any]],
        mode_id: str,
        snapshot: dict[str, Any],
    ) -> None:
        self._service._switch_active_group(conflicting_modes, conflict_restore, mode_id, snapshot)

    async def deactivate_in_db(self, mode_id: str) -> None:
        self._service._deactivate_in_db(mode_id)

    async def clear_group_active(self, group_ids: list[str], incomplete: bool) -> None:
        self._service._clear_group_active(group_ids, incomplete)

    async def get_active_mode(self) -> dict[str, Any] | None:
        return self._service.get_active()

    def get_active_mode_id(self) -> str | None:
        return self._service.get_active_mode_id()

    # 执行 / 集成
    async def call_service(
        self, domain: str, service: str, entity_id: str, data: dict[str, Any]
    ) -> Any:
        return await self._service._call_service(domain, service, entity_id, data)

    async def fetch_entity_state(self, entity_id: str) -> dict[str, Any] | None:
        return await self._service._fetch_entity_state(entity_id)

    async def get_ha_status(self) -> dict[str, Any]:
        return await self._service._ha_connector.get_status()

    async def notify(self, level: str, message: str, source: str) -> None:
        await self._service._notify(level, message, source)

    async def set_security_mode(self, mode: str, source: str) -> bool:
        return await self._service._apply_security_mode(mode, source)

    async def emit_home_mode_event(self, name: str, payload: dict[str, Any]) -> None:
        await self._service._emit_home_mode_event(name, payload)

    def push_trigger_log(self, entry: dict[str, Any]) -> None:
        self._service._runtime_logs.push_trigger_log(entry)

    def record_execution(self, entry: dict[str, Any]) -> None:
        self._service._runtime_logs.record_execution(entry)

    # 配置 / 触发器
    @property
    def linkage_arbiter(self) -> HomeModeLinkageArbiter:
        return self._service.linkage_arbiter

    def get_home_mode_config(self) -> dict[str, Any]:
        return self._service._home_mode_cfg

    def get_security_config(self) -> dict[str, Any]:
        return self._service._security_cfg

    def get_apply_max_retries(self) -> int:
        return int(self._service._home_mode_cfg.get("applyMaxRetries") or 0)

    def get_trigger_cooldown_ms(self) -> int:
        return int(self._service._home_mode_cfg.get("triggerCooldownMs") or 60_000)

    def get_home_timezone(self) -> str | None:
        return self._service._home_timezone

    def is_leader(self) -> bool:
        return bool(self._service._is_leader())

    async def activate(self, mode_id: str, meta: dict[str, Any] | None = None) -> Any:
        return await self._service.activate(mode_id, meta)

    async def deactivate(self) -> Any:
        return await self._service.deactivate()
