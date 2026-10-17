"""家庭模式服务（对齐 HomeModeService）。"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from typing import Any

from sqlalchemy import func, select, update

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
from ...platform.core.app_config import load_raw_config
from ...platform.core.errors import api_error, bad_request, not_found
from ...platform.core.models import HomeMode

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


def _parse_json_loud(raw: Any, fallback: Any, *, field: str, mode_id: str) -> Any:
    """与 :func:`_parse_json` 同口径，但解析失败会**留下日志**，不再静默返回兜底值。

    `config` 解析失败 = 这个模式的动作全丢了（激活后什么都不会发生）；`triggers` 解析失败 =
    自动化静默失效。若悄悄变成 `[]`/`None`，界面上完全看不出异常，用户只会觉得「这个模式
    坏了」却拿不到任何线索。

    这里刻意**不抛异常**：列表接口会被一行脏数据整体打挂（连删掉它的机会都没有），
    所以改成点名 id 与字段的错误日志 —— 真要在写前拦，走 `normalize_home_mode_json_array`。
    """
    if raw is None or raw == "":
        return fallback
    if isinstance(raw, (list, dict)):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError) as error:
        logger.error(
            "家庭模式 %s 的 %s 字段不是合法 JSON（%s），已按空值处理：请修复或重建该模式",
            mode_id,
            field,
            error,
        )
        return fallback


def _coerce_int_field(fields: dict[str, Any], key: str, default: int) -> int:
    """把请求体里的可选整数字段解析成 int；非法值给 **400** 而不是让 `int()` 炸成 500。

    不能用裸 `int(fields.get("sortOrder") or 0)`：客户端传 `"abc"`（或对象、小数串）时
    会在服务里抛 ValueError，被全局处理器当未知异常 —— 一个「参数不对」的错误看起来像
    服务端崩了。
    """
    raw = fields.get(key)
    if raw is None or raw == "":
        return default
    if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
        bad_request(f"{key} 须为整数")
    try:
        return int(str(raw).strip()) if isinstance(raw, str) else int(raw)
    except (TypeError, ValueError):
        bad_request(f"{key} 须为整数")
    return default


def mode_to_dict(mode: HomeMode) -> dict[str, Any]:
    return {
        "id": mode.id,
        "name": mode.name,
        "icon": mode.icon,
        "config": _parse_json_loud(mode.config, [], field="config", mode_id=str(mode.id)),
        "triggers": _parse_json_loud(mode.triggers, None, field="triggers", mode_id=str(mode.id)),
        "isActive": bool(mode.is_active),
        "deviceSnapshot": _parse_json(mode.device_snapshot, None),
        "sortOrder": mode.sort_order,
        "exclusiveGroup": mode.exclusive_group,
        "priority": mode.priority,
        "createdAt": _iso(mode.created_at),
        "updatedAt": _iso(mode.updated_at),
    }


class HomeModeService:
    """家庭模式服务 —— 本域**唯一的对外门面**。

    API 路由、agent 工具、realtime 事件都从这里进；域内 `actions` / `triggers` 拿到的
    `_HomeModeDeps` 是服务给出的窄接口（见其 docstring），不是第二条入口。
    状态真源只有一处：`_active_mode_id` + `HomeMode` 表。
    """
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

    # 生命周期
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
            except Exception as exc:
                logger.warning("时间触发器检查失败: %s", exc)

    def _load_config(self) -> None:
        try:
            with self._session_factory() as session:
                raw = load_raw_config(session)
        except Exception:
            raw = {}
        # 先绑定再判类型：重复 `raw.get(K)` 时收窄不会传递到第二次读取，类型里会一直挂着 None，
        # 字典解包因此被判成「可能不是映射」。
        home_mode_source = raw.get("homeMode")
        home_mode: dict[str, Any] = (
            home_mode_source if isinstance(home_mode_source, dict) else {}
        )
        security_source = raw.get("security")
        security: dict[str, Any] = security_source if isinstance(security_source, dict) else {}
        self._home_mode_cfg = {**HOME_MODE_DEFAULT_CONFIG, **home_mode}
        self._security_cfg = {**SECURITY_DEFAULT_CONFIG, **security}
        ops_source = raw.get("ops")
        ops: dict[str, Any] = ops_source if isinstance(ops_source, dict) else {}
        tz = ops.get("homeTimezone")
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
            modes = (
                session.execute(select(HomeMode).order_by(HomeMode.sort_order.asc()).limit(200))
                .scalars()
                .all()
            )
        modes = [mode_to_dict(mode) for mode in modes]
        self._trigger_state.cached_modes = modes
        self._trigger_state.trigger_bindings = parse_home_mode_trigger_bindings(modes)
        prune_home_mode_trigger_cooldown(self._trigger_state.trigger_cooldown)
        logger.info("全屋模式触发器已加载: %s 条", len(self._trigger_state.trigger_bindings))

    # CRUD
    def find_all(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            modes = (
                session.execute(select(HomeMode).order_by(HomeMode.sort_order.asc()).limit(200))
                .scalars()
                .all()
            )
        return [mode_to_dict(mode) for mode in modes]

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
        mode_items = [mode_to_dict(mode) for mode in rows]
        return {
            "items": mode_items,
            "total": total,
            "page": page,
            "pageSize": page_size,
            "totalPages": max(1, -(-total // page_size)),
        }

    def find_one(self, mode_id: str) -> dict[str, Any] | None:
        with self._session_factory() as session:
            mode = session.get(HomeMode, mode_id)
        return mode_to_dict(mode) if mode is not None else None

    def get_active(self) -> dict[str, Any] | None:
        with self._session_factory() as session:
            mode = session.execute(
                select(HomeMode).where(HomeMode.is_active.is_(True)).limit(1)
            ).scalar_one_or_none()
        return mode_to_dict(mode) if mode is not None else None

    async def create(self, data: dict[str, Any]) -> dict[str, Any]:
        fields = dict(data)
        if "config" in fields:
            fields["config"] = normalize_home_mode_json_array(fields["config"], "config", True)
        if "triggers" in fields:
            fields["triggers"] = normalize_home_mode_json_array(fields["triggers"], "triggers", False)
        mode = HomeMode(
            name=str(fields.get("name") or ""),
            icon=fields.get("icon") or "home",
            config=json.dumps(fields.get("config") or [], ensure_ascii=False),
            triggers=(
                json.dumps(fields["triggers"], ensure_ascii=False)
                if fields.get("triggers") is not None
                else None
            ),
            sort_order=_coerce_int_field(fields, "sortOrder", 0),
            exclusive_group=fields.get("exclusiveGroup") or "default",
            priority=_coerce_int_field(fields, "priority", 50),
        )
        with self._session_factory() as session:
            session.add(mode)
            session.commit()
            session.refresh(mode)
            mode_snapshot = mode_to_dict(mode)
        await self.reload_trigger_bindings()
        return mode_snapshot

    async def update(self, mode_id: str, data: dict[str, Any]) -> dict[str, Any]:
        fields = dict(data)
        if "config" in fields:
            fields["config"] = normalize_home_mode_json_array(fields["config"], "config", True)
        if "triggers" in fields:
            fields["triggers"] = normalize_home_mode_json_array(fields["triggers"], "triggers", False)
        with self._session_factory() as session:
            mode = session.get(HomeMode, mode_id)
            if mode is None:
                not_found(api_error("HOME_MODE_NOT_FOUND"))
            if "name" in fields:
                mode.name = str(fields["name"])
            if "icon" in fields:
                mode.icon = fields["icon"]
            if "config" in fields:
                mode.config = json.dumps(fields["config"] or [], ensure_ascii=False)
            if "triggers" in fields:
                mode.triggers = (
                    json.dumps(fields["triggers"], ensure_ascii=False)
                    if fields["triggers"] is not None
                    else None
                )
            if "sortOrder" in fields:
                mode.sort_order = _coerce_int_field(fields, "sortOrder", 0)
            if "exclusiveGroup" in fields:
                mode.exclusive_group = fields["exclusiveGroup"] or "default"
            if "priority" in fields:
                mode.priority = _coerce_int_field(fields, "priority", 50)
            session.commit()
            session.refresh(mode)
            mode_snapshot = mode_to_dict(mode)
        await self.reload_trigger_bindings()
        return mode_snapshot

    async def remove(self, mode_id: str) -> dict[str, Any]:
        with self._session_factory() as session:
            mode = session.get(HomeMode, mode_id)
        if mode is None:
            not_found(api_error("HOME_MODE_NOT_FOUND"))
        if mode.is_active or self._active_mode_id == mode_id:
            await self.deactivate(mode_id)
        with self._session_factory() as session:
            mode = session.get(HomeMode, mode_id)
            if mode is None:
                not_found(api_error("HOME_MODE_NOT_FOUND"))
            mode_snapshot = mode_to_dict(mode)
            session.delete(mode)
            session.commit()
        await self.reload_trigger_bindings()
        return mode_snapshot

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

    async def reorder(self, order_entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
        # 一次性 IN 查询取回全部目标模式：逐条 `session.get` 会让拖拽排序 N 个模式
        # 产生 N 次往返（N+1）。
        order_by_id = {
            str(entry.get('id')): _coerce_int_field(entry, "sortOrder", 0)
            for entry in order_entries
            if isinstance(entry, dict) and entry.get('id')
        }
        if order_by_id:
            with self._session_factory() as session:
                modes = session.execute(select(HomeMode).where(HomeMode.id.in_(tuple(order_by_id)))).scalars()
                for mode in modes:
                    target = order_by_id.get(str(mode.id))
                    if target is not None:
                        mode.sort_order = target
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

    # 预设 / 模板
    def get_action_templates(self) -> list[dict[str, Any]]:
        return presets_module.HOME_MODE_ACTION_TEMPLATES

    def get_presets(self) -> list[dict[str, Any]]:
        entity_ids = [entity["entity_id"] for entity in self._state_store.get_all()]
        with self._session_factory() as session:
            mode_pairs = (
                session.execute(select(HomeMode.id, HomeMode.name).limit(200)).all()
            )
        existing = [{"id": mode_id, "name": mode_name} for mode_id, mode_name in mode_pairs]
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
            mode_snapshot = await self.update(
                existing_dict["id"],
                {"icon": preset["icon"], "config": plan["config"], "triggers": plan["triggersJson"]},
            )
            return {**mode_snapshot, "unresolvedActions": plan["unresolvedActions"]}

        if existing_dict is not None:
            mode_snapshot = await self.create(
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
            return {**mode_snapshot, "unresolvedActions": plan["unresolvedActions"]}

        with self._session_factory() as session:
            max_order = session.execute(select(func.max(HomeMode.sort_order))).scalar()
        mode_snapshot = await self.create(
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
        return {**mode_snapshot, "unresolvedActions": plan["unresolvedActions"]}

    # 激活 / 停用
    async def activate(self, mode_id: str, meta: dict[str, Any] | None = None) -> dict[str, Any]:
        async with self._transition_lock:
            return await activate_home_mode(self._activate_state, self._deps, mode_id, meta)

    async def deactivate(self, mode_id: str | None = None) -> dict[str, Any]:
        async with self._transition_lock:
            return await deactivate_home_mode(self._activate_state, self._deps, mode_id)

    def get_active_mode_id(self) -> str | None:
        return self._active_mode_id

    # 运行日志
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

    # 触发器事件入口
    async def handle_state_trigger(self, event: dict[str, Any]) -> None:
        await handle_home_mode_state_trigger(self._trigger_state, self._deps, event)

    async def handle_presence_arrive(self, data: dict[str, Any]) -> None:
        await handle_home_mode_presence_arrive(self._trigger_state, self._deps, data)

    async def handle_calendar_away(self, data: dict[str, Any]) -> None:
        await handle_home_mode_calendar_away(self._trigger_state, self._deps, data)

    async def handle_everyone_left(self) -> None:
        await handle_home_mode_everyone_left(self._trigger_state, self._deps)

    async def handle_activate_request(self, data: dict[str, Any]) -> None:
        """外部自动化（HA / Node-RED / 事件总线）请求激活家庭模式。

        固定以 ``automation`` 来源记账：若记成 ``manual`` 会误占 30 分钟用户锁，
        导致其后安防 / 天气 / 作息等低优先级联动全部被仲裁器拦截。
        """
        mode_id = data.get("mode_id") or data.get("modeId")
        if not mode_id:
            return
        try:
            await self.activate(
                mode_id,
                {"source": "automation", "reason": data.get("reason") or "自动化请求"},
            )
        except Exception as exc:
            logger.warning("自动化请求激活家庭模式失败: %s", exc)

    # 底层数据库操作（供 deps 调用）
    def _find_mode_row(self, mode_id: str) -> dict[str, Any] | None:
        return self.find_one(mode_id)

    def _list_active_modes(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            modes = (
                session.execute(select(HomeMode).where(HomeMode.is_active.is_(True)).limit(50))
                .scalars()
                .all()
            )
        return [mode_to_dict(mode) for mode in modes]

    def _find_first_active(self) -> dict[str, Any] | None:
        with self._session_factory() as session:
            mode = session.execute(
                select(HomeMode)
                .where(HomeMode.is_active.is_(True))
                .order_by(HomeMode.sort_order.asc())
                .limit(1)
            ).scalar_one_or_none()
        return mode_to_dict(mode) if mode is not None else None

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

    def _deactivate_in_db(self, mode_id: str, *, keep_snapshot: bool = False) -> None:
        with self._session_factory() as session:
            mode = session.get(HomeMode, mode_id)
            if mode is not None:
                mode.is_active = False
                if not keep_snapshot:
                    mode.device_snapshot = None
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
        except Exception as exc:
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

class _HomeModeDeps:
    """激活 / 触发编排所需依赖集合（对齐 actions.internals / triggers.internals 的 deps）。

    它不是第二个服务门面，而是 `HomeModeService` 交给 actions / triggers 的**窄接口**：
    需要的动作以具名方法暴露，状态读写仍然只有服务一个真源。

    `request_activate` / `request_deactivate` 是**回调进服务**（转换锁与「同组互斥 +
    快照恢复」那套编排只在服务里）：命名刻意带 `request_` —— 写成 `activate` 时，调用方
    很容易以为这是「另一条独立的激活通路」。
    """

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

    async def deactivate_in_db(self, mode_id: str, *, keep_snapshot: bool = False) -> None:
        self._service._deactivate_in_db(mode_id, keep_snapshot=keep_snapshot)

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

    async def request_activate(self, mode_id: str, meta: dict[str, Any] | None = None) -> Any:
        """触发器路径请求激活：回调进服务的 `activate`（那里有转换锁与同组互斥编排）。"""
        return await self._service.activate(mode_id, meta)

    async def request_deactivate(self) -> Any:
        """触发器路径请求停用：回调进服务的 `deactivate`。"""
        return await self._service.deactivate()
