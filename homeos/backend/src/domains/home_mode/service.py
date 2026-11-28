"""家庭模式服务（对齐 HomeModeService）。"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from typing import Any

from sqlalchemy import func, select, update

from . import presets as presets_module
from .actions import (
    HomeModeActivateResult,
    HomeModeActivateState,
    HomeModeDeactivateResult,
    HomeModeSnapshotOutcome,
    activate_home_mode,
    deactivate_home_mode,
)
from .activation import resolve_execution_mode, run_with_execution_mode
from .deps import HomeModeDeps
from .linkage import HomeModeLinkageArbiter
from .notify_dispatch import apply_security_mode_or_fail, dispatch_home_mode_notify
from .persistence import (
    apply_mode_fields,
    build_mode_row,
    coerce_int_field,
    mode_to_dict,
    normalize_mode_fields,
)
from .policy import (
    HOME_MODE_DEFAULT_CONFIG,
    SECURITY_DEFAULT_CONFIG,
    call_service_via_proxy,
    compute_baseline_settling,
    seconds_until_next_minute,
)
from .presence_rules import evict_other_modes
from .restore import summarize_pending_restore
from .runtime import (
    HomeModeRuntimeLogStore,
    clamp_int,
)
from .settle import settle_home_mode
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
from ...platform.core.db.db_exec import run_db
from ...platform.core.db.models import HomeMode
from ...platform.core.http.errors import api_error, bad_request, not_found
from ...platform.core.runtime.app_config import load_raw_config
from ...platform.core.runtime.background_tasks import background_tasks

logger = logging.getLogger("homeos.home_mode")


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
        get_security_mode=None,
        is_away_simulated_entity=None,
        emit_event=None,
        is_leader=None,
        jobs=None,
        command_proxy=None,
        is_anyone_home=None,
    ) -> None:
        self._session_factory = session_factory
        self._ha_connector = ha_connector
        self._state_store = state_store
        self._notification = notification
        self._security_mode_setter = set_security_mode
        self._security_mode_getter = get_security_mode
        self._away_sim_entity_matcher = is_away_simulated_entity
        self._is_anyone_home = is_anyone_home
        self._emit_event = emit_event
        self._is_leader = is_leader or (lambda: True)
        self._jobs = jobs
        #: 命令通道；缺省时退回直连连接器（单测 / 早期启动）。
        self._command_proxy = command_proxy

        self.linkage_arbiter = HomeModeLinkageArbiter()
        self._active_mode_id: str | None = None
        self._timer: asyncio.Task | None = None
        self._transition_lock = asyncio.Lock()
        #: 「当前正在执行的激活任务」槽（单元素列表，供 restart 模式取消旧的）。
        self._activation_slot: list[asyncio.Task | None] = [None]
        #: 过渡模式的自动回落定时器（mode_id → task）。
        self._settle_tasks: dict[str, asyncio.Task[Any]] = {}
        self._runtime_logs = HomeModeRuntimeLogStore(session_factory, self._runtime_limits)
        self._trigger_state = HomeModeTriggersState()
        self._home_mode_cfg: dict[str, Any] = dict(HOME_MODE_DEFAULT_CONFIG)
        self._security_cfg: dict[str, Any] = dict(SECURITY_DEFAULT_CONFIG)
        self._home_timezone: str | None = None
        self._deps = HomeModeDeps(self)
        self._activate_state = HomeModeActivateState(lambda: self._active_mode_id, self._set_active_mode_id)

    # 生命周期
    def _set_active_mode_id(self, mode_id: str | None) -> None:
        self._active_mode_id = mode_id

    async def start(self) -> None:
        await run_db(self._load_config)
        active = await run_db(self._load_active_mode_row)
        self._active_mode_id = active["id"] if active is not None else None
        if active is not None:
            logger.info("已恢复激活家庭模式: %s", active["name"])
            # 过渡模式（如「回家」）在重启后重新计时：丢失的时间戳无法可靠还原，
            # 而让一次进门动作永久挂在 header 上才是真问题。
            self._schedule_settle(active)
        await self.reload_trigger_bindings()
        await self._runtime_logs.load()
        self._timer = asyncio.create_task(self._time_trigger_loop(), name="home-mode-time-triggers")

    # 自动回落（过渡模式）
    def _cancel_settle(self, mode_id: str | None = None) -> None:
        """取消回落定时器；``mode_id`` 为空时清全部。"""
        targets = [mode_id] if mode_id else list(self._settle_tasks)
        for key in targets:
            task = self._settle_tasks.pop(key, None)
            if task is not None and not task.done():
                task.cancel()

    def _schedule_settle(self, mode: dict[str, Any] | None) -> None:
        """为 ``settleMinutes > 0`` 的模式安排一次自动回落（0 = 不回落）。"""
        if not isinstance(mode, dict):
            return
        mode_id = str(mode.get("id") or "")
        minutes = int(mode.get("settleMinutes") or 0)
        self._cancel_settle(mode_id)
        if not mode_id or minutes <= 0:
            return
        # 走受管后台任务：异常统一落日志、停机时统一取消（裸 create_task 会丢异常）。
        self._settle_tasks[mode_id] = background_tasks.spawn(
            self._settle_after(mode_id, float(minutes)), label=f"home-mode.settle.{mode_id}"
        )

    async def _settle_after(self, mode_id: str, minutes: float) -> None:
        """到期后回落；异常只影响这一次回落，不能拖垮进程。"""
        try:
            await asyncio.sleep(minutes * 60)
            async with self._transition_lock:
                result = await settle_home_mode(self._activate_state, self._deps, mode_id)
            if isinstance(result, dict) and result.get("settled"):
                await self._notify("info", str(result.get("message") or "模式已自动回落"), "home-mode")
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # 回落失败不能静默：否则模式会一直挂着
            logger.warning("模式自动回落失败(%s): %s", mode_id, exc)
        finally:
            # 只在字典里仍是「本次任务」时才移除：直接 pop(mode_id) 会把重新激活时
            # 登记的新定时器一起删掉，之后第三次激活就再也取消不到那个活着的旧定时器，
            # 旧定时器到点会把刚重新激活的模式提前回落。
            if self._settle_tasks.get(mode_id) is asyncio.current_task():
                self._settle_tasks.pop(mode_id, None)

    def _load_active_mode_row(self) -> dict[str, Any] | None:
        """读取当前激活模式（同步；由 :meth:`start` 放进线程池）。

        排序必须与 :meth:`get_active_modes` 一致（priority 降序、sort_order 升序），
        否则重启后指针指向的是「另一条」激活模式，无参 :meth:`deactivate` 会和前端错位。
        """
        with self._session_factory() as session:
            active = session.execute(
                select(HomeMode)
                .where(HomeMode.is_active.is_(True))
                .order_by(HomeMode.priority.desc(), HomeMode.sort_order.asc())
                .limit(1)
            ).scalar_one_or_none()
        return mode_to_dict(active) if active is not None else None

    async def stop(self) -> None:
        self._cancel_settle()
        if self._timer is not None:
            self._timer.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._timer
            self._timer = None
        await self._runtime_logs.flush_now()

    async def _time_trigger_loop(self) -> None:
        while True:
            delay = seconds_until_next_minute()
            await asyncio.sleep(delay)
            try:
                if self._jobs is None:
                    await check_home_mode_time_triggers(self._trigger_state, self._deps)
                else:
                    await self._jobs.run(
                        "home-mode-time-triggers",
                        {
                            "description": "家庭模式定时触发检查",
                            "intervalMs": round(delay * 1000),
                        },
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
        # 先绑定再判类型：重复 `raw.get(K)` 时收窄不会传递到第二次读取，类型里会一直挂着 None。
        home_mode_source = raw.get("homeMode")
        home_mode: dict[str, Any] = home_mode_source if isinstance(home_mode_source, dict) else {}
        security_source = raw.get("security")
        security: dict[str, Any] = security_source if isinstance(security_source, dict) else {}
        self._home_mode_cfg = {**HOME_MODE_DEFAULT_CONFIG, **home_mode}
        self._security_cfg = {**SECURITY_DEFAULT_CONFIG, **security}
        ops_source = raw.get("ops")
        ops: dict[str, Any] = ops_source if isinstance(ops_source, dict) else {}
        tz = ops.get("homeTimezone")
        self._home_timezone = tz.strip() if isinstance(tz, str) and tz.strip() else None

    def on_config_updated(self, sections: list[str] | None = None) -> None:
        """``app.config.updated`` 热更新：重算 homeMode / security / ops 三份缓存。

        三段都要看：``_home_timezone`` 来自 ``ops.homeTimezone``、``_security_cfg`` 来自
        ``security``（联动去重要用），只认 ``homeMode`` 会让改时区 / 改联动开关后仍按
        启动时的旧值跑 —— 定时触发器最多偏 8 小时，而且没有日志可查。
        """
        if sections and not ({"homeMode", "security", "ops"} & set(sections)):
            return
        self._load_config()
        self._runtime_logs.trim_to_limits()

    def _runtime_limits(self) -> dict[str, int]:
        return {
            "maxTriggerLogs": int(self._home_mode_cfg.get("maxTriggerLogs") or 50),
            "maxExecHistory": int(self._home_mode_cfg.get("maxExecHistory") or 100),
        }

    async def reload_trigger_bindings(self) -> None:
        # 不再限制前 N 个模式：达到上限后第 N+1 个模式的定时 / 状态触发器会静默失效。
        modes = await run_db(self._load_mode_dicts)
        self._trigger_state.cached_modes = modes
        self._trigger_state.trigger_bindings = parse_home_mode_trigger_bindings(modes)
        prune_home_mode_trigger_cooldown(self._trigger_state.trigger_cooldown)
        logger.debug("全屋模式触发器已加载: %s 条", len(self._trigger_state.trigger_bindings))

    def _load_mode_dicts(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            modes = session.execute(select(HomeMode).order_by(HomeMode.sort_order.asc())).scalars().all()
        return [mode_to_dict(mode) for mode in modes]

    # CRUD
    def find_all(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            modes = session.execute(select(HomeMode).order_by(HomeMode.sort_order.asc()).limit(200)).scalars().all()
        return [mode_to_dict(mode) for mode in modes]

    def find_all_paginated(self, page: int = 1, page_size: int = 50) -> dict[str, Any]:
        page = max(int(page or 1), 1)
        page_size = clamp_int(page_size, 5, 200)
        with self._session_factory() as session:
            total = int(session.execute(select(func.count()).select_from(HomeMode)).scalar() or 0)
            rows = (
                session.execute(
                    select(HomeMode).order_by(HomeMode.sort_order.asc()).offset((page - 1) * page_size).limit(page_size)
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

    def _find_mode_by_name(self, name: str) -> dict[str, Any] | None:
        with self._session_factory() as session:
            mode = session.execute(select(HomeMode).where(HomeMode.name == name).limit(1)).scalar_one_or_none()
        return mode_to_dict(mode) if mode is not None else None

    def _count_modes(self) -> int:
        with self._session_factory() as session:
            return int(session.execute(select(func.count()).select_from(HomeMode)).scalar() or 0)

    def _max_sort_order(self) -> int:
        with self._session_factory() as session:
            return int(session.execute(select(func.max(HomeMode.sort_order))).scalar() or 0)

    def get_active(self) -> dict[str, Any] | None:
        """返回 priority 最高的 active 模式（多互斥组同时激活时只取第一个）。"""
        active = self.get_active_modes()
        return active[0] if active else None

    def get_active_modes(self) -> list[dict[str, Any]]:
        """所有激活中的模式（不同互斥组可以同时激活），按 priority 降序 / sort_order 升序。

        此前 ``get_active`` 只 ``limit(1)`` 取 SQLite 的第一行：多互斥组同时激活时，
        返回哪个模式取决于行序，前端 header 也只显示一个，另一个「隐形激活」。
        """
        with self._session_factory() as session:
            modes = (
                session.execute(
                    select(HomeMode)
                    .where(HomeMode.is_active.is_(True))
                    .order_by(HomeMode.priority.desc(), HomeMode.sort_order.asc())
                    .limit(50)
                )
                .scalars()
                .all()
            )
        return [mode_to_dict(mode) for mode in modes]

    def get_active_response(self) -> dict[str, Any] | None:
        """``GET /active`` 的响应：只给 ``activeModes``（可同时激活多个模式）。"""
        active_modes = self.get_active_modes()
        if not active_modes:
            return None
        return {"activeModes": active_modes}

    async def create(self, data: dict[str, Any]) -> dict[str, Any]:
        fields = normalize_mode_fields(data)
        mode_snapshot = await run_db(self._insert_mode_row, fields)
        await self.reload_trigger_bindings()
        return mode_snapshot

    def _insert_mode_row(self, fields: dict[str, Any]) -> dict[str, Any]:
        mode = HomeMode(**build_mode_row(fields))
        with self._session_factory() as session:
            session.add(mode)
            session.commit()
            session.refresh(mode)
            return mode_to_dict(mode)

    async def update(self, mode_id: str, data: dict[str, Any]) -> dict[str, Any]:
        mode_snapshot = self.update_sync(mode_id, data)
        await self.reload_trigger_bindings()
        return mode_snapshot

    def update_sync(self, mode_id: str, data: dict[str, Any]) -> dict[str, Any]:
        """``update`` 的同步写库部分（供 executor 线程里的实体解绑调用）。

        实体解绑跑在线程池里，无法 ``await``；调用方负责随后的
        :meth:`reload_trigger_bindings`（那一步要用事件循环）。
        """
        fields = normalize_mode_fields(data)
        with self._session_factory() as session:
            mode = session.get(HomeMode, mode_id)
            if mode is None:
                not_found(api_error("HOME_MODE_NOT_FOUND"))
            apply_mode_fields(mode, fields)
            session.commit()
            session.refresh(mode)
            return mode_to_dict(mode)

    async def remove(self, mode_id: str) -> dict[str, Any]:
        mode = await run_db(self.find_one, mode_id)
        if mode is None:
            not_found(api_error("HOME_MODE_NOT_FOUND"))
        if mode.get("isActive") or self._active_mode_id == mode_id:
            outcome = await self.deactivate(mode_id)
            # 停用未完成（restoreIncomplete）时模式仍是激活态、快照仍保留：此时删行会把
            # 唯一的恢复依据（快照）和重试入口一起删掉，设备停在半恢复状态且无从补救。
            if isinstance(outcome, dict) and outcome.get("restoreIncomplete"):
                bad_request(api_error("HOME_MODE_RESTORE_INCOMPLETE", mode.get("name") or mode_id))
        mode_snapshot = await run_db(self._delete_mode_row, mode_id)
        await self.reload_trigger_bindings()
        return mode_snapshot

    def _delete_mode_row(self, mode_id: str) -> dict[str, Any]:
        with self._session_factory() as session:
            mode = session.get(HomeMode, mode_id)
            if mode is None:
                not_found(api_error("HOME_MODE_NOT_FOUND"))
            mode_snapshot = mode_to_dict(mode)
            session.delete(mode)
            session.commit()
            return mode_snapshot

    async def duplicate(self, mode_id: str) -> dict[str, Any]:
        source = await run_db(self.find_one, mode_id)
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
                "settleMinutes": source.get("settleMinutes"),
            }
        )

    async def reorder(self, order_entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
        order_by_id = {
            str(entry.get("id")): coerce_int_field(entry.get("sortOrder"), "sortOrder", 0)
            for entry in order_entries
            if isinstance(entry, dict) and entry.get("id")
        }
        if order_by_id:
            # 一次性 IN 查询取回全部目标模式：逐条 `session.get` 会让拖拽排序 N 个模式
            # 产生 N 次往返（N+1）。
            await run_db(self._apply_reorder, order_by_id)
        await self.reload_trigger_bindings()
        return await run_db(self.find_all)

    def _apply_reorder(self, order_by_id: dict[str, int]) -> None:
        with self._session_factory() as session:
            modes = session.execute(select(HomeMode).where(HomeMode.id.in_(tuple(order_by_id)))).scalars()
            for mode in modes:
                target = order_by_id.get(str(mode.id))
                if target is not None:
                    mode.sort_order = target
            session.commit()

    async def seed_defaults(self) -> dict[str, Any]:
        count = await run_db(self._count_modes)
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
                    "settleMinutes": mode.get("settleMinutes"),
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
            mode_pairs = session.execute(select(HomeMode.id, HomeMode.name).limit(200)).all()
        existing = [{"id": mode_id, "name": mode_name} for mode_id, mode_name in mode_pairs]
        return presets_module.enrich_home_mode_presets(entity_ids, existing)

    async def install_preset(
        self, preset_id: str, entity_overrides: dict[str, str] | None = None, merge: bool = False
    ) -> dict[str, Any]:
        entity_ids = [entity["entity_id"] for entity in self._state_store.get_all()]
        plan = presets_module.build_home_mode_preset_install_plan(preset_id, entity_ids, entity_overrides or {})
        preset = plan["preset"]
        existing_dict = await run_db(self._find_mode_by_name, str(preset["name"]))

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
                    "settleMinutes": preset.get("settleMinutes"),
                }
            )
            return {**mode_snapshot, "unresolvedActions": plan["unresolvedActions"]}

        max_order = await run_db(self._max_sort_order)
        mode_snapshot = await self.create(
            {
                "name": preset["name"],
                "icon": preset["icon"],
                "config": plan["config"],
                "triggers": plan["triggersJson"],
                "sortOrder": int(max_order or 0) + 1,
                "exclusiveGroup": preset.get("exclusiveGroup"),
                "priority": preset.get("priority"),
                "settleMinutes": preset.get("settleMinutes"),
            }
        )
        return {**mode_snapshot, "unresolvedActions": plan["unresolvedActions"]}

    # 激活 / 停用
    async def activate(self, mode_id: str, meta: dict[str, Any] | None = None) -> HomeModeActivateResult:
        """按模式的 ``executionMode`` 编排这次激活（queued / single / restart）。

        编排策略住在 ``activation.run_with_execution_mode``：这里只负责取模式配置、
        提供锁与「当前任务槽」。
        """
        execution_mode = await resolve_execution_mode(self.find_one_async, mode_id)
        result = await run_with_execution_mode(
            mode_id,
            execution_mode=execution_mode,
            lock=self._transition_lock,
            current_task_holder=self._activation_slot,
            run=lambda: activate_home_mode(self._activate_state, self._deps, mode_id, meta),
        )
        # 单选（默认）：家只有一个当前状态，新模式生效后其它模式退场。
        # 离家/度假即使在关掉单选时也要退场（家里没人时睡眠、影音不该继续存在）。
        # 锁已在此刻释放，退出操作才能拿到同一把锁；设备冲突由归属仲裁兜底。
        # ``alreadyActive`` 不再退场：重复激活一个已生效的模式不应顺手杀掉叠加活动。
        if isinstance(result, dict) and result.get("active") and not result.get("alreadyActive"):
            await evict_other_modes(
                mode_id,
                self.find_one_async,
                self._deps.get_active_modes,
                self.deactivate,
                self._notify,
                self._home_mode_cfg,
            )
        # 过渡模式（如「回家」，settleMinutes > 0）安排一次自动回落：
        # 到期只清激活标记、不还原设备 —— 进门开的灯不该因为模式结束而关掉。
        if isinstance(result, dict) and result.get("active"):
            self._schedule_settle(await self.find_one_async(mode_id))
        return result

    async def find_one_async(self, mode_id: str) -> dict[str, Any] | None:
        """异步取单个模式（把同步 DB 读放进线程池）。"""
        return await run_db(self.find_one, mode_id)

    async def deactivate(self, mode_id: str | None = None, *, force: bool = False) -> HomeModeDeactivateResult:
        # 先撤回落定时器：用户主动退出后不该再有一次「自动回落」通知。
        self._cancel_settle(mode_id)
        async with self._transition_lock:
            return await deactivate_home_mode(self._activate_state, self._deps, mode_id, force=force)

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

    def get_execution_by_run_id(self, run_id: str) -> dict[str, Any] | None:
        """按 runId 取单次激活（含逐动作 trace）；找不到返回 ``None``。"""
        if not run_id:
            return None
        return self._runtime_logs.find_execution_by_run_id(run_id)

    def get_mode_context(self) -> dict[str, Any]:
        last = self._runtime_logs.find_execution_by_mode_id(self._active_mode_id) if self._active_mode_id else None
        return {
            "calendarAway": self._trigger_state.calendar_away,
            "activeModeId": self._active_mode_id,
            "triggerBindingsCount": len(self._trigger_state.trigger_bindings),
            "triggerLogs": self.get_trigger_logs(8),
            "recentExecutions": self.get_execution_history(5),
            "lastActivation": last or self._runtime_logs.get_latest_execution(),
            # 存量数据里可能还有写时校验上线之前存的非白名单动作：运行时会被拒下发，
            # 但用户看不到「为什么这个模式不生效」。这里给出计数供界面提示，
            # **不自动改用户数据**（改配置必须由人来确认）。
            "invalidActions": self.count_invalid_actions(),
            # 停用态但还留着设备快照 = 上次顶替 / 强制退出的恢复没做完，给前端重试入口。
            "pendingRestore": summarize_pending_restore(self._load_mode_dicts()),
        }

    def count_invalid_actions(self) -> int:
        """统计已加载模式里不合法的动作条数（只读诊断，供 ``/modes/context``）。"""
        from .validation import is_action_permitted

        total = 0
        for mode in self._trigger_state.cached_modes:
            for action in mode.get("config") or []:
                if isinstance(action, dict) and not is_action_permitted(action):
                    total += 1
        return total

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
        return self.get_active_modes()

    def _find_first_active(self) -> dict[str, Any] | None:
        # 与 get_active_modes 的排序保持一致：无参停用优先锁定 UI 展示的主模式。
        with self._session_factory() as session:
            mode = session.execute(
                select(HomeMode)
                .where(HomeMode.is_active.is_(True))
                .order_by(HomeMode.priority.desc(), HomeMode.sort_order.asc())
                .limit(1)
            ).scalar_one_or_none()
        return mode_to_dict(mode) if mode is not None else None

    def _switch_active_group(
        self,
        conflicting_modes: list[dict[str, Any]],
        conflict_restore: dict[str, HomeModeSnapshotOutcome],
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
                session.execute(update(HomeMode).where(HomeMode.id == active["id"]).values(**values))
            session.execute(
                update(HomeMode)
                .where(HomeMode.id == mode_id)
                .values(
                    is_active=True,
                    device_snapshot=json.dumps(snapshot, ensure_ascii=False),
                )
            )
            session.commit()

    def _deactivate_in_db(
        self,
        mode_id: str,
        *,
        keep_snapshot: bool = False,
        snapshot: dict[str, Any] | None = None,
    ) -> None:
        with self._session_factory() as session:
            mode = session.get(HomeMode, mode_id)
            if mode is not None:
                mode.is_active = False
                if snapshot is not None:
                    # 激活失败且回滚不完整：把**这一次**的快照写进去。只 keep 不清
                    # 会让用户拿到上一次激活残留的快照（或 NULL），提示说「已保留」
                    # 但库里根本没有可恢复的内容。
                    mode.device_snapshot = json.dumps(snapshot, ensure_ascii=False)
                elif not keep_snapshot:
                    mode.device_snapshot = None
                session.commit()

    def _clear_group_active(self, group_ids: list[str], incomplete: bool) -> None:
        with self._session_factory() as session:
            values: dict[str, Any] = {"is_active": False}
            if not incomplete:
                values["device_snapshot"] = None
            session.execute(update(HomeMode).where(HomeMode.id.in_(group_ids)).values(**values))
            session.commit()

    async def _notify(self, level: str, message: str, source: str) -> Any:
        """发送通知；返回通知结果。DND/关闭/失败返回 ``None``，调用方不得当成功。"""
        return await dispatch_home_mode_notify(self._notification, level, message, source)

    async def _call_service(self, domain: str, service: str, entity_id: str, data: dict[str, Any]) -> Any:
        return await call_service_via_proxy(self._command_proxy, self._ha_connector, domain, service, entity_id, data)

    async def _fetch_entity_state(self, entity_id: str) -> dict[str, Any] | None:
        entity = self._state_store.get(entity_id)
        if entity is None:
            return None
        return {"state": entity.get("state"), "attributes": entity.get("attributes") or {}}

    async def _apply_security_mode(self, mode: str, source: str) -> bool:
        return await apply_security_mode_or_fail(self._security_mode_setter, mode, source)

    async def _read_security_mode(self) -> str | None:
        """读取当前安防模式，用于家庭模式激活失败时回滚安防动作。"""
        if self._security_mode_getter is None:
            return None
        result = self._security_mode_getter()
        if asyncio.iscoroutine(result):
            result = await result
        return str(result) if result else None

    def is_away_simulated_entity(self, entity_id: str) -> bool:
        """该实体的状态变化是否由离家模拟自己制造（家庭模式触发器据此抑制）。"""
        if self._away_sim_entity_matcher is None:
            return False
        try:
            return bool(self._away_sim_entity_matcher(entity_id))
        except Exception:
            # 这里是旁路判断（抑制离家模拟自造的状态），失败时按「不是模拟」继续，
            # 但要留痕：抑制逻辑整体失效时不能毫无线索。
            logger.debug("离家模拟实体匹配失败: %s", entity_id, exc_info=True)
            return False

    def is_baseline_settling(self) -> bool:
        """HA 刚连上/刚启动的静置期内返回真（触发器应整体跳过）。

        窗口长度取 ``HOMEOS_HOME_MODE_TRIGGER_SETTLE_MS``（默认 30s，设 0 关闭）。
        语义与安防的「重连基线预热」一致：这段时间内收到的状态是快照补齐或首轮上报，
        不能当成「旧态 → 新态」的边沿。状态存储没接（单测）时按「不在静置期」处理。
        """
        return compute_baseline_settling(self._state_store)

    async def _emit_home_mode_event(self, name: str, payload: dict[str, Any]) -> None:
        if self._emit_event is None:
            return
        result = self._emit_event(name, payload)
        if asyncio.iscoroutine(result):
            await result
