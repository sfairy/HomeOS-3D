"""智能管家计划任务：一次性 / 周期（cron）执行工具动作。

对齐 Nest ``AgentSchedulerService``：

- 后台 10 秒 tick（通过 ``jobs`` 纳入作业监控）；
- ``ONCE`` 支持「延迟 N 分钟」或精确到点；``RECURRING`` 用 5 段 cron（按家庭时区），
  也接受 ``HH:MM`` 这种「每天这个点」的简写；
- 执行前校验前置条件（``entityId`` + ``expectedState``），已满足则跳过，避免重复下发；
- 动作统一走 ``HomeToolsService.execute``，即实体 ACL / 服务白名单 / 高危 denylist
  全部照常生效；任务只保存创建者快照，执行期还原身份
  （身份失效 / 权限被收回时按失败记录，不会静默提权）；
- 每次执行写一条 ``AgentTaskExecutionLog``，失败额外发一条通知。
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select

from .policy import actor_from_snapshot, actor_label, actor_snapshot, touch_editor
from .scheduler_action import run_action
from .scheduler_payload import apply_schedule, apply_task_fields
from .scheduler_result import task_result_ok
from .scheduler_schema import (
    ALLOWED_ACTION_TOOLS,
    LOG_RETENTION_DAYS,
    MAX_LOG_ROWS,
    MAX_NAME_CHARS,
    MAX_TASKS,
    PRUNE_INTERVAL_SECONDS,
    SYSTEM_NOTIFY_ACTOR,
    TICK_SECONDS,
    json_dump,
    serialize_log,
    serialize_task,
)
from .scheduler_time import (
    cron_trigger,
    delay_minutes,
    next_cron_run,
    normalize_cron,
    now_naive,
    parse_iso,
    validate_recurring_interval,
)
from ..runtime.service_support import apply_device_allowlist
from ....platform.core.db.db_exec import run_db
from ....platform.core.db.json_field import read_json_object
from ....platform.core.db.models import AgentScheduledTask, AgentTaskExecutionLog
from ....platform.core.runtime.background import spawn_background

logger = logging.getLogger("homeos.agent.scheduler")


def _task_result_ok(result: dict[str, Any]) -> bool:
    """计划任务的动作是否真的生效（判定口径见 ``scheduler_result``）。"""
    return task_result_ok(result)


class AgentSchedulerService:
    """计划任务调度器（默认不启动后台循环，由装配层显式 ``start``）。"""

    def __init__(
        self,
        session_factory: Any = None,
        tools: Any = None,
        notification: Any = None,
        jobs: Any = None,
        timezone_provider: Any = None,
        agent_config: Any = None,
    ) -> None:
        self._session_factory = session_factory
        self._tools = tools
        self._notification = notification
        self._jobs = jobs
        self._timezone_provider = timezone_provider
        #: Agent 配置：执行前读取设备白名单，与对话链路同一份权限口径
        self._agent_config = agent_config
        self._task: asyncio.Task[None] | None = None
        self._stop_event: asyncio.Event | None = None
        self._running: set[str] = set()
        #: 上次清理执行日志的 monotonic 时间戳（0 = 还没清过，首轮就清）
        self._last_prune_at = 0.0

    # 装配
    def bind_tools(self, tools: Any) -> None:
        """延迟绑定工具服务（HomeToolsService 先于调度器构造，避免循环依赖）。"""
        self._tools = tools

    def bind_notification(self, notification: Any) -> None:
        self._notification = notification

    def bind_agent_config(self, agent_config: Any) -> None:
        """延迟绑定 Agent 配置：到期执行时据此叠加设备白名单。"""
        self._agent_config = agent_config

    def _timezone(self) -> str:
        getter = self._timezone_provider
        if callable(getter):
            try:
                return str(getter() or "")
            except Exception as exc:
                logger.debug("读取家庭时区失败: %s", exc)
                return ""
        return ""

    # 生命周期
    async def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._stop_event = asyncio.Event()
        self._task = asyncio.create_task(self._loop(), name="agent-scheduler")

    async def stop(self) -> None:
        if self._stop_event is not None:
            self._stop_event.set()
        task = self._task
        self._task = None
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):  # fmt: skip - 括号不能省，Cython 会把 PEP 758 形式误解析
                logger.debug("计划任务循环已退出", exc_info=True)

    async def _loop(self) -> None:
        # 启动时先把「已过期的一次性任务」与「缺失 nextRunAt 的周期任务」补齐
        try:
            await self._recover_next_runs()
        except Exception:
            logger.warning("计划任务启动自检失败", exc_info=True)
        while True:
            stop_event = self._stop_event
            if stop_event is None:
                return
            try:
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.warning("计划任务 tick 失败", exc_info=True)
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=TICK_SECONDS)
            except TimeoutError:
                # 正常节拍：等满一个 tick 就进入下一轮扫描
                logger.debug("计划任务 tick 结束，进入下一轮")
                continue
            return

    # 查询
    def _load_tasks(self) -> list[AgentScheduledTask]:
        if self._session_factory is None:
            return []
        with self._session_factory() as session:
            return list(
                session.execute(select(AgentScheduledTask).order_by(AgentScheduledTask.created_at.desc())).scalars()
            )

    async def list_tasks(self) -> list[dict[str, Any]]:
        try:
            rows = await run_db(self._load_tasks)
        except Exception as exc:
            logger.warning("读取计划任务失败: %s", exc)
            return []
        return [serialize_task(row) for row in rows]

    async def list_logs(self, task_id: str = "", limit: int = 20) -> list[dict[str, Any]]:
        capped = max(1, min(MAX_LOG_ROWS, int(limit or 20)))
        try:
            rows = await run_db(self._load_logs, task_id, capped)
        except Exception as exc:
            logger.warning("读取任务执行日志失败: %s", exc)
            return []
        return [serialize_log(row) for row in rows]

    def _load_logs(self, task_id: str, limit: int) -> list[AgentTaskExecutionLog]:
        if self._session_factory is None:
            return []
        with self._session_factory() as session:
            query = select(AgentTaskExecutionLog)
            if task_id:
                query = query.where(AgentTaskExecutionLog.task_id == task_id)
            return list(session.execute(query.order_by(AgentTaskExecutionLog.started_at.desc()).limit(limit)).scalars())

    # 写入
    def _create_sync(self, payload: dict[str, Any], actor: Any) -> dict[str, Any]:
        if self._session_factory is None:
            return {"ok": False, "message": "数据库未就绪，无法创建计划任务"}
        action_tool = str(payload.get("actionTool") or "").strip()
        if not action_tool:
            return {"ok": False, "message": "缺少要执行的动作（actionTool）"}
        if action_tool not in ALLOWED_ACTION_TOOLS:
            return {"ok": False, "message": f"计划任务不支持动作: {action_tool}"}
        schedule_type = "RECURRING" if str(payload.get("scheduleType") or "").upper() == "RECURRING" else "ONCE"
        timezone_name = str(payload.get("timezone") or "").strip() or self._timezone()
        cron = ""
        run_at: datetime | None = None
        if schedule_type == "RECURRING":
            try:
                # 确保 runAt→cron 能读到家庭时区（normalize_cron 从 payload 取 timezone）
                cron = normalize_cron({**payload, "timezone": timezone_name})
                cron_trigger(cron, timezone_name)
            except Exception as exc:
                logger.info("周期任务表达式不合法: %s", exc)
                return {"ok": False, "message": str(exc)}
            # 最小间隔：`* * * * *` 语法合法但每分钟下发一次控制命令，属于误配置。
            interval_error = validate_recurring_interval(cron, timezone_name)
            if interval_error is not None:
                return {"ok": False, "message": interval_error}
            next_run = next_cron_run(cron, timezone_name, now_naive())
            if next_run is None:
                return {"ok": False, "message": "cron 表达式无法计算下次执行时间"}
        else:
            run_at = parse_iso(payload.get("runAt"))
            if run_at is None:
                delay = delay_minutes(payload.get("delayMinutes"))
                if delay is None:
                    logger.info("一次性任务缺少 runAt / delayMinutes: %r", payload.get("delayMinutes"))
                    return {"ok": False, "message": "一次性任务需要 runAt 或 delayMinutes"}
                run_at = now_naive() + timedelta(minutes=delay)
            next_run = run_at
        with self._session_factory() as session:
            count = len(list(session.execute(select(AgentScheduledTask.id)).scalars()))
            if count >= MAX_TASKS:
                return {"ok": False, "message": f"计划任务数量已达上限（{MAX_TASKS} 条）"}
            row = AgentScheduledTask(
                name=str(payload.get("name") or "").strip()[:MAX_NAME_CHARS] or action_tool,
                enabled=payload.get("enabled") is not False,
                schedule_type=schedule_type,
                run_at=run_at,
                cron=cron,
                timezone=timezone_name,
                action_tool=action_tool,
                action_args=json_dump(payload.get("actionArgs")),
                precondition=json_dump(payload.get("precondition")),
                actor=json_dump(actor_snapshot(actor)),
                next_run_at=next_run if payload.get("enabled") is not False else None,
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return {"ok": True, "task": serialize_task(row)}

    async def create_task(self, payload: dict[str, Any], actor: Any = None) -> dict[str, Any]:
        try:
            return await run_db(self._create_sync, payload, actor)
        except Exception as exc:
            logger.warning("创建计划任务失败: %s", exc)
            return {"ok": False, "message": f"创建计划任务失败: {exc}"}

    def _update_sync(self, task_id: str, payload: dict[str, Any], actor: Any = None) -> dict[str, Any]:
        if self._session_factory is None:
            return {"ok": False, "message": "数据库未就绪"}
        with self._session_factory() as session:
            row = session.execute(select(AgentScheduledTask).where(AgentScheduledTask.id == task_id)).scalars().first()
            if row is None:
                return {"ok": False, "message": "计划任务不存在"}
            fields_error = apply_task_fields(row, payload)
            if fields_error is not None:
                return fields_error
            timezone_name = str(payload.get("timezone") or row.timezone or "").strip() or self._timezone()
            row.timezone = timezone_name
            schedule_error = apply_schedule(row, payload, timezone_name)
            if schedule_error is not None:
                return schedule_error
            if "enabled" in payload:
                row.enabled = payload.get("enabled") is not False
                if not row.enabled:
                    row.next_run_at = None
                elif row.next_run_at is None:
                    row.next_run_at = self._compute_next(row, now_naive())
            touch_editor(row, actor)
            session.commit()
            session.refresh(row)
            return {"ok": True, "task": serialize_task(row)}

    async def update_task(self, task_id: str, payload: dict[str, Any], actor: Any = None) -> dict[str, Any]:
        try:
            return await run_db(self._update_sync, task_id, payload, actor)
        except Exception as exc:
            logger.warning("更新计划任务失败: %s", exc)
            return {"ok": False, "message": f"更新计划任务失败: {exc}"}

    def _toggle_sync(self, task_id: str, enabled: bool | None, actor: Any = None) -> dict[str, Any]:
        if self._session_factory is None:
            return {"ok": False, "message": "数据库未就绪"}
        with self._session_factory() as session:
            row = session.execute(select(AgentScheduledTask).where(AgentScheduledTask.id == task_id)).scalars().first()
            if row is None:
                return {"ok": False, "message": "计划任务不存在"}
            row.enabled = (not bool(row.enabled)) if enabled is None else bool(enabled)
            if not row.enabled:
                row.next_run_at = None
            else:
                # 启用前再校验一次最小间隔：老任务可能是这条规则上线前建的（或由备份导入），
                # 只在创建时检查会让它们永久绕过限制、每分钟真的下发一次。
                if str(row.schedule_type or "").upper() == "RECURRING":
                    interval_error = validate_recurring_interval(
                        str(row.cron or ""), str(row.timezone or "") or self._timezone()
                    )
                    if interval_error is not None:
                        row.enabled = False
                        return {"ok": False, "message": interval_error}
                next_run = self._compute_next(row, now_naive())
                if next_run is None:
                    # 启用一个算不出下次触发的任务（cron 永不成立 / 一次性任务没有时间）
                    # 只会得到一个永远不跑的「已启用」任务，这里直接拒绝并保持原状。
                    return {
                        "ok": False,
                        "message": "任务的下次执行时间无法计算（cron 表达式不成立或缺少 runAt），无法启用",
                    }
                row.next_run_at = next_run
            touch_editor(row, actor)
            session.commit()
            session.refresh(row)
            return {"ok": True, "task": serialize_task(row)}

    async def toggle_task(self, task_id: str, enabled: bool | None = None, actor: Any = None) -> dict[str, Any]:
        try:
            return await run_db(self._toggle_sync, task_id, enabled, actor)
        except Exception as exc:
            logger.warning("切换计划任务状态失败: %s", exc)
            return {"ok": False, "message": f"切换计划任务状态失败: {exc}"}

    def _delete_sync(self, task_id: str, actor: Any = None) -> dict[str, Any]:
        if self._session_factory is None:
            return {"ok": False, "message": "数据库未就绪"}
        with self._session_factory() as session:
            row = session.execute(select(AgentScheduledTask).where(AgentScheduledTask.id == task_id)).scalars().first()
            if row is None:
                return {"ok": False, "message": "计划任务不存在"}
            name = row.name
            session.delete(row)
            session.commit()
        # 记录已删，只能写日志留痕（表里不会再有这行）
        logger.info("删除计划任务 %s「%s」，操作者 %s", task_id, name, actor_label(actor))
        return {"ok": True}

    async def delete_task(self, task_id: str, actor: Any = None) -> dict[str, Any]:
        try:
            return await run_db(self._delete_sync, task_id, actor)
        except Exception as exc:
            logger.warning("删除计划任务失败: %s", exc)
            return {"ok": False, "message": f"删除计划任务失败: {exc}"}

    # 调度
    @staticmethod
    def _compute_next(row: AgentScheduledTask, after: datetime) -> datetime | None:
        if row.schedule_type == "RECURRING":
            return next_cron_run(row.cron or "", row.timezone or "", after)
        return row.run_at

    async def _recover_next_runs(self) -> None:
        """启动自检：周期任务缺 nextRunAt 时补算；一次性任务保留原定时间（过期即立刻执行）。"""
        if self._session_factory is None:
            return
        await run_db(self._recover_sync)

    def _recover_sync(self) -> None:
        if self._session_factory is None:
            return
        now = now_naive()
        with self._session_factory() as session:
            rows = list(
                session.execute(select(AgentScheduledTask).where(AgentScheduledTask.enabled.is_(True))).scalars()
            )
            changed = False
            for row in rows:
                if row.next_run_at is not None:
                    continue
                nxt = self._compute_next(row, now)
                if nxt is not None:
                    row.next_run_at = nxt
                    changed = True
            if changed:
                session.commit()

    async def tick(self) -> list[dict[str, Any]]:
        """执行所有到期任务；返回本轮执行结果（供测试与手动触发复用）。"""
        if self._session_factory is None:
            return []
        await self._maybe_prune_logs()
        due = await run_db(self._due_tasks, now_naive())
        results: list[dict[str, Any]] = []
        for task in due:
            task_id = str(task.get("id") or "")
            if not task_id or task_id in self._running:
                continue
            self._running.add(task_id)
            try:
                results.append(await self._execute_task(task))
            finally:
                self._running.discard(task_id)
        return results

    def _claim_sync(self, task_id: str, now: datetime) -> dict[str, Any] | None:
        """执行前复核并 CAS 推进 ``next_run_at``，返回最新参数快照，否则 ``None``。

        ``tick`` 是先快照 ``enabled=1`` 的任务再逐个 ``await`` 执行的。期间用户完全可能
        把任务停用、改动作参数或改 cron，而旧实现会拿快照里的旧参数照跑一遍。
        更关键的是：若 ``_finish_sync`` 写库失败，旧实现不推进 ``next_run_at``，任务会
        约每 tick（~10s）被重新领取并重复执行同一控制。这里在领取时就推进下次时间
        （周期→下一次 cron；一次性→停用），即使 finish 失败也不会无限重跑。
        """
        if self._session_factory is None:
            return None
        with self._session_factory() as session:
            row = session.execute(select(AgentScheduledTask).where(AgentScheduledTask.id == task_id)).scalars().first()
            if row is None or not bool(row.enabled):
                return None
            # 仍须到期：同一进程用 _running 去重，但手动 tick 与后台 tick 可能交错，
            # 上一轮已经把 next_run_at 推到未来的任务不能再跑一次。
            if row.next_run_at is None or row.next_run_at > now:
                return None
            snapshot = {
                "id": row.id,
                "name": row.name,
                "scheduleType": row.schedule_type,
                "cron": row.cron,
                "timezone": row.timezone,
                "runAt": row.run_at,
                "actionTool": row.action_tool,
                "actionArgs": read_json_object(row.action_args, {}),
                "precondition": read_json_object(row.precondition, {}),
                "actor": read_json_object(row.actor, {}),
            }
            # CAS：领取即推进，防止 finish 失败后同一到期任务被反复重领。
            if row.schedule_type == "RECURRING":
                next_run = next_cron_run(row.cron or "", row.timezone or "", now)
                if next_run is None:
                    # 算不出下次则禁用，避免卡在「永远到期」上狂跑。
                    logger.warning("周期任务 %s claim 时无法计算下次执行，已禁用", task_id)
                    row.enabled = False
                    row.next_run_at = None
                    row.last_error = "claim 时 cron 无法计算下次执行时间"
                else:
                    row.next_run_at = next_run
            else:
                row.enabled = False
                row.next_run_at = None
            row.updated_at = datetime.now(UTC)
            session.commit()
            return snapshot

    async def _claim_task(self, task_id: str) -> dict[str, Any] | None:
        try:
            return await run_db(self._claim_sync, task_id, now_naive())
        except Exception as exc:
            logger.warning("复核计划任务状态失败: %s", exc)
            return None

    # 日志保留
    async def _maybe_prune_logs(self) -> None:
        """每小时最多清理一次过期执行日志（首轮启动即清）。"""
        now = time.monotonic()
        if self._last_prune_at and now - self._last_prune_at < PRUNE_INTERVAL_SECONDS:
            return
        self._last_prune_at = now
        cutoff = now_naive() - timedelta(days=LOG_RETENTION_DAYS)
        try:
            removed = await run_db(self._prune_logs_sync, cutoff)
        except Exception:
            logger.warning("清理计划任务执行日志失败", exc_info=True)
            return
        if removed:
            logger.info("已清理 %s 条过期计划任务执行日志（保留 %s 天）", removed, LOG_RETENTION_DAYS)

    def _prune_logs_sync(self, cutoff: datetime) -> int:
        if self._session_factory is None:
            return 0
        with self._session_factory() as session:
            result = session.execute(delete(AgentTaskExecutionLog).where(AgentTaskExecutionLog.started_at < cutoff))
            session.commit()
            return int(result.rowcount or 0)

    def _due_tasks(self, now: datetime) -> list[dict[str, Any]]:
        if self._session_factory is None:
            return []
        with self._session_factory() as session:
            rows = list(
                session.execute(select(AgentScheduledTask).where(AgentScheduledTask.enabled.is_(True))).scalars()
            )
        out: list[dict[str, Any]] = []
        for row in rows:
            if row.next_run_at is None:
                continue
            if row.next_run_at > now:
                continue
            out.append(
                {
                    "id": row.id,
                    "name": row.name,
                    "scheduleType": row.schedule_type,
                    "cron": row.cron,
                    "timezone": row.timezone,
                    "runAt": row.run_at,
                    "actionTool": row.action_tool,
                    "actionArgs": read_json_object(row.action_args, {}),
                    "precondition": read_json_object(row.precondition, {}),
                    "actor": read_json_object(row.actor, {}),
                }
            )
        return out

    async def _perform_action(
        self,
        task: dict[str, Any],
        actor: Any,
    ) -> tuple[str, str, dict[str, Any]]:
        """执行任务动作，返回 ``(status, message, result)``（不含落库 / 排程推进）。"""
        action_tool = str(task.get("actionTool") or "")
        raw_args = task.get("actionArgs")
        action_args = raw_args if isinstance(raw_args, dict) else {}
        status = "success"
        message = ""
        result: dict[str, Any] = {}
        try:
            skipped, reason = await self._precondition_met(task.get("precondition"))
            if skipped:
                return "skipped", reason, {}
            if self._tools is None:
                return "failed", "工具服务未就绪", {}
            if action_tool == "send_notification":
                # 提醒是「系统到点投递」：创建者解绑后仍然应该送达，否则用户设的闹钟
                # 会因为没有绑定身份而静默消失。send_notification 自身仍要求非空身份。
                notify_actor = actor or SYSTEM_NOTIFY_ACTOR
                raw = await self._tools.execute(action_tool, action_args, notify_actor)
                result = raw if isinstance(raw, dict) else {"raw": raw}
                status = "success" if _task_result_ok(result) else "failed"
                message = str(result.get("message") or result.get("error") or "")[:500]
            elif actor is None:
                return "failed", "创建者身份已失效，无法执行控制类动作", {}
            else:
                raw = await run_action(self._tools, action_tool, action_args, actor)
                result = raw if isinstance(raw, dict) else {"raw": raw}
                status = "success" if _task_result_ok(result) else "failed"
                message = str(result.get("message") or result.get("error") or "")[:500]
        except Exception as exc:
            logger.warning("执行计划任务失败: %s", task.get("name"), exc_info=True)
            return "failed", str(exc)[:500], {}
        return status, message, result

    async def _execute_task(self, task: dict[str, Any]) -> dict[str, Any]:
        task_id = str(task.get("id") or "")
        # 快照可能已过期：执行前重读一次，停用/删除/改期的一律不跑，改参的用新参数跑。
        claimed = await self._claim_task(task_id)
        if claimed is None:
            logger.info("计划任务 %s 已停用、已删除或已改期，跳过本轮执行", task_id)
            return {
                "taskId": task_id,
                "name": task.get("name"),
                "status": "skipped",
                "message": "任务已停用、已删除或已改期，跳过本次执行",
            }
        task = claimed
        started_at = now_naive()
        actor = actor_from_snapshot(task.get("actor"))
        # 与对话链路同一份「设备范围」：到期执行时也要叠加 Agent 白名单，
        # 否则设置页里限制过的设备仍然能被定时任务控制。
        actor = await apply_device_allowlist(self._agent_config, actor)
        status, message, result = await self._perform_action(task, actor)
        finished_at = now_naive()
        try:
            await run_db(
                self._finish_sync,
                task_id,
                {
                    "started_at": started_at,
                    "finished_at": finished_at,
                    "status": status,
                    "message": message,
                    "result": result,
                    "schedule_type": task.get("scheduleType"),
                    "cron": task.get("cron"),
                    "timezone": task.get("timezone"),
                },
            )
        except Exception as exc:
            # claim 已推进 next_run_at；此处仅丢日志。再告警一次，避免静默丢审计。
            logger.warning("记录任务执行结果失败（租约已推进，不会重跑）: %s", exc)
            await self._notify_failure(task, f"执行结果落库失败（不会自动重跑）: {exc}")
        if status == "failed":
            await self._notify_failure(task, message)
        return {
            "taskId": task_id,
            "name": task.get("name"),
            "status": status,
            "message": message,
        }

    async def _precondition_met(self, raw: Any) -> tuple[bool, str]:
        """前置条件已满足 → 视为冗余操作，跳过本次执行。"""
        data = raw if isinstance(raw, dict) else {}
        entity_id = str(data.get("entityId") or "").strip()
        expected = str(data.get("expectedState") or "").strip().lower()
        if not entity_id or not expected or self._tools is None:
            return False, ""
        try:
            current = await self._tools.execute("get_entity_state", {"entity_id": entity_id}, None)
        except Exception as exc:
            logger.debug("读取前置状态失败，按未满足处理: %s (%s)", entity_id, exc)
            return False, ""
        state = str((current or {}).get("state") or "").strip().lower()
        if state and state == expected:
            return True, f"{entity_id} 已处于 {expected}，跳过本次执行"
        return False, ""

    async def run_task_now(self, task_id: str, actor: Any = None) -> dict[str, Any]:
        """手动执行一次任务（不改排程）。

        用于「设置 → 计划任务 → 执行一次」验证动作是否可用：与到点执行走同一套
        权限 / 服务白名单 / 高危拦截，并以**操作者**身份执行（比创建者更严），
        执行结果照常写执行日志，但不推进 next_run_at，也不影响一次性任务的启用状态。
        """
        task = await run_db(self._load_task_payload, task_id)
        if task is None:
            return {"ok": False, "message": "计划任务不存在"}
        run_actor = actor if actor is not None else actor_from_snapshot(task.get("actor"))
        run_actor = await apply_device_allowlist(self._agent_config, run_actor)
        started_at = now_naive()
        status, message, result = await self._perform_action(task, run_actor)
        finished_at = now_naive()
        try:
            await run_db(
                self._record_manual_sync,
                task_id,
                {
                    "started_at": started_at,
                    "finished_at": finished_at,
                    "status": status,
                    "message": message,
                    "result": result,
                },
            )
        except Exception as exc:
            logger.warning("记录手动执行结果失败: %s", exc)
        if status == "failed":
            await self._notify_failure(task, message)
        return {"ok": status != "failed", "status": status, "message": message, "result": result}

    def _load_task_payload(self, task_id: str) -> dict[str, Any] | None:
        """读取单条任务的可执行快照（与 ``_due_tasks`` 同形状）。"""
        if self._session_factory is None:
            return None
        with self._session_factory() as session:
            row = session.execute(select(AgentScheduledTask).where(AgentScheduledTask.id == task_id)).scalars().first()
            if row is None:
                return None
            return {
                "id": row.id,
                "name": row.name,
                "scheduleType": row.schedule_type,
                "cron": row.cron,
                "timezone": row.timezone,
                "runAt": row.run_at,
                "actionTool": row.action_tool,
                "actionArgs": read_json_object(row.action_args, {}),
                "precondition": read_json_object(row.precondition, {}),
                "actor": read_json_object(row.actor, {}),
            }

    def _record_manual_sync(self, task_id: str, info: dict[str, Any]) -> None:
        """手动执行的落库：只更新 last_* 与日志，**不动** next_run_at / enabled。"""
        if self._session_factory is None:
            return
        with self._session_factory() as session:
            row = session.execute(select(AgentScheduledTask).where(AgentScheduledTask.id == task_id)).scalars().first()
            if row is None:
                return
            row.last_run_at = info["finished_at"]
            row.last_status = info["status"]
            row.last_error = info["message"] if info["status"] == "failed" else ""
            row.run_count = int(row.run_count or 0) + 1
            row.updated_at = datetime.now(UTC)
            session.add(
                AgentTaskExecutionLog(
                    task_id=task_id,
                    started_at=info["started_at"],
                    finished_at=info["finished_at"],
                    status=info["status"],
                    message=f"手动执行：{info['message']}" if info["message"] else "手动执行",
                    result=json_dump(info["result"]),
                )
            )
            session.commit()

    def _finish_sync(self, task_id: str, info: dict[str, Any]) -> None:
        if self._session_factory is None:
            return
        with self._session_factory() as session:
            row = session.execute(select(AgentScheduledTask).where(AgentScheduledTask.id == task_id)).scalars().first()
            if row is None:
                return
            row.last_run_at = info["finished_at"]
            row.last_status = info["status"]
            row.last_error = info["message"] if info["status"] == "failed" else ""
            row.run_count = int(row.run_count or 0) + 1
            # next_run_at / enabled 已在 _claim_sync 推进；此处仅在用户执行中途停用时清排程，
            # 或对仍启用的周期任务用 finished_at 再校准一次下次时间（与 claim 一致则幂等）。
            if not bool(row.enabled):
                row.next_run_at = None
            elif row.schedule_type == "RECURRING":
                next_run = next_cron_run(row.cron or "", row.timezone or "", info["finished_at"])
                if next_run is None:
                    logger.warning("周期任务 %s 的 cron 无法计算下次执行时间: %r", task_id, row.cron)
                    row.enabled = False
                    row.next_run_at = None
                else:
                    row.next_run_at = next_run
            else:
                row.enabled = False
                row.next_run_at = None
            session.add(
                AgentTaskExecutionLog(
                    task_id=task_id,
                    started_at=info["started_at"],
                    finished_at=info["finished_at"],
                    status=info["status"],
                    message=info["message"],
                    result=json_dump(info["result"]),
                )
            )
            row.updated_at = datetime.now(UTC)
            session.commit()

    async def _notify_failure(self, task: dict[str, Any], message: str) -> None:
        if self._notification is None:
            return
        name = str(task.get("name") or task.get("id") or "计划任务")
        try:
            await self._notification.notify(
                "warning", f"计划任务「{name}」执行失败：{message or '未知原因'}", "agent-scheduler"
            )
        except Exception:
            logger.debug("计划任务失败通知发送失败", exc_info=True)

    def run_due_soon(self) -> None:
        """手动触发一轮 tick（API / 工具用，不阻塞调用方）。"""
        spawn_background(self.tick())


__all__ = [
    "MAX_TASKS",
    "TICK_SECONDS",
    "AgentSchedulerService",
    "serialize_log",
    "serialize_task",
]
