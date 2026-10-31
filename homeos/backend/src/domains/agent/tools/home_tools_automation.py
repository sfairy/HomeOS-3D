"""自动化工具族：计划任务 / 家规 / 时序 / 诊断 / 巡检 / 联网搜索。

与其它工具族的两点差异：

- **会改变系统状态**（创建任务 / 家规）。因此都要求 ``actor``：没有执行身份时不写入，
  避免通过无身份通道（如未绑定用户的 Webhook）给系统留下「将来会自动执行」的动作；
- **不直接控设备**。自动关停 / 定时控设备都由调度器与看门狗在到期时调用
  ``control_device``，权限判定与高危拦截依旧是同一套。
"""

from __future__ import annotations

import logging
from typing import Any

from .home_tools_base import HomeToolsHost
from .home_tools_primitives import _error_message, _s

logger = logging.getLogger("homeos.agent.tools.automation")

#: 自动化族工具名（宿主 ``execute`` 据此一次性分发）
AUTOMATION_TOOL_NAMES = frozenset(
    {
        "query_device_timeline",
        "run_proactive_patrol",
        "query_system_logs",
        "manage_user_policy",
        "schedule_task",
        "list_scheduled_tasks",
        "cancel_scheduled_task",
        "web_search",
    }
)

#: 查询时序 / 诊断的默认与上限
DEFAULT_TIMELINE_ROWS = 20
MAX_TIMELINE_HOURS = 24 * 60
DEFAULT_LOG_ROWS = 20
MAX_LOG_ROWS = 50


def _clamped_int(raw: Any, default: int, minimum: int, maximum: int) -> int:
    """把 LLM 传入的任意值收敛到 ``[minimum, maximum]``；布尔与非法值回退默认。"""
    if isinstance(raw, bool):
        return default
    try:
        value = int(float(raw))
    except TypeError, ValueError:
        logger.debug("工具参数不是数字，回退默认值 %s: %r", default, raw)
        return default
    return max(minimum, min(maximum, value))


class HomeToolsAutomationMixin(HomeToolsHost):
    """计划任务 / 家规 / 时序诊断 / 巡检 / 联网搜索。"""

    async def _automation_dispatch(self, name: str, args: dict[str, Any], actor: Any) -> dict[str, Any]:
        """自动化族统一分发（宿主 ``execute`` 只保留一个分支）。"""
        handlers = {
            "query_device_timeline": lambda: self._query_device_timeline(args, actor),
            "run_proactive_patrol": lambda: self._run_proactive_patrol(args, actor),
            "query_system_logs": lambda: self._query_system_logs(args, actor),
            "manage_user_policy": lambda: self._manage_user_policy(args, actor),
            "schedule_task": lambda: self._schedule_task(args, actor),
            "list_scheduled_tasks": self._list_scheduled_tasks,
            "cancel_scheduled_task": lambda: self._cancel_scheduled_task(args, actor),
            "web_search": lambda: self._web_search(args),
        }
        handler = handlers.get(name)
        if handler is None:
            return {"error": f"未知工具: {name}"}
        return await handler()

    # 通用
    async def _resolve_area(self, raw: str) -> tuple[str, str]:
        """房间名 / ID → ``(area_id, area_name)``；找不到返回空串。"""
        text = _s(raw).strip()
        if not text or self._area_service is None:
            return "", ""
        try:
            summary = await self._area_service.find_one(text)
        except Exception as exc:
            logger.debug("解析房间失败: %s (%s)", text, exc)
            return "", ""
        if summary is None:
            return "", ""
        return str(summary.id or ""), str(summary.name or "")

    @staticmethod
    def _requires_actor(actor: Any) -> dict[str, Any] | None:
        if actor is None:
            return {
                "ok": False,
                "message": "未绑定执行身份，无法创建计划任务或家规。请在通道配置中绑定 HomeOS 用户。",
            }
        return None

    # 时序
    async def _query_device_timeline(self, args: dict[str, Any], actor: Any = None) -> dict[str, Any]:
        timeline = self._timeline
        if timeline is None:
            return {"error": "设备时序未启用"}
        denied = self._read_denied(actor)
        if denied is not None:
            return denied
        entity_id = _s(args.get("entity_id")).strip()
        area_id = _s(args.get("area_id")).strip()
        if area_id and "." not in area_id:
            resolved, _name = await self._resolve_area(area_id)
            area_id = resolved or area_id
        hours = _clamped_int(args.get("hours"), 24, 1, MAX_TIMELINE_HOURS)
        limit = _clamped_int(args.get("limit"), DEFAULT_TIMELINE_ROWS, 1, 100)
        rows = await timeline.query(entity_id=entity_id, area_id=area_id, hours=hours, limit=limit)
        visible = [item for item in rows if self._may_read(str(item.get("entityId") or ""), actor)]
        return {"hours": hours, "count": len(visible), "events": visible}

    # 巡检
    async def _run_proactive_patrol(self, args: dict[str, Any], actor: Any = None) -> dict[str, Any]:
        del args
        watchdog = self._watchdog
        if watchdog is None:
            return {"error": "看门狗未启用"}
        try:
            result = await watchdog.run_once(actor=actor)
        except Exception as exc:
            logger.warning("手动巡检失败: %s", _error_message(exc))
            return {"error": f"巡检暂不可用: {_error_message(exc)}"}
        return result if isinstance(result, dict) else {"ok": True, "result": result}

    # 诊断日志
    async def _query_system_logs(self, args: dict[str, Any], actor: Any = None) -> dict[str, Any]:
        diagnostics = self._diagnostics
        if diagnostics is None:
            return {"error": "诊断日志未启用"}
        denied = self._read_denied(actor)
        if denied is not None:
            return denied
        limit = _clamped_int(args.get("limit"), DEFAULT_LOG_ROWS, 1, MAX_LOG_ROWS)
        items = diagnostics.query(
            level=_s(args.get("level")).strip(),
            kind=_s(args.get("kind")).strip(),
            search=_s(args.get("search")).strip(),
            limit=limit,
            may_read=lambda entity_id: self._may_read(entity_id, actor),
        )
        return {"count": len(items), "logs": items}

    # 家规
    async def _manage_user_policy(self, args: dict[str, Any], actor: Any = None) -> dict[str, Any]:
        policy = self._policy
        if policy is None:
            return {"error": "家规服务未启用"}
        action = _s(args.get("action")).strip().lower() or "list"
        if action == "list":
            return {"rules": await policy.list_rules()}

        guard = self._requires_actor(actor)
        if guard is not None:
            return guard

        if action == "create":
            return await self._create_policy(policy, args, actor)
        rule_id = _s(args.get("rule_id")).strip()
        if not rule_id:
            return {"ok": False, "message": "缺少 rule_id"}
        if action == "delete":
            return await policy.delete_rule(rule_id, actor=actor)
        if action == "toggle":
            return await policy.toggle_rule(rule_id, actor=actor)
        if action == "update":
            return await self._update_policy(policy, rule_id, args, actor)
        return {"ok": False, "message": f"不支持的 action: {action}"}

    async def _create_policy(self, policy: Any, args: dict[str, Any], actor: Any) -> dict[str, Any]:
        area_id, area_name = await self._resolve_area(_s(args.get("area")))
        payload = {
            "name": _s(args.get("name")).strip(),
            "areaId": area_id,
            "areaName": area_name,
            "targetDomains": args.get("domains"),
            "idleMinutes": args.get("idle_minutes"),
            "autoClose": args.get("auto_close") is True,
        }
        if not payload["name"]:
            payload["name"] = f"{area_name or '全屋'}无人空转规则"
        return await policy.create_rule(payload, actor, force_override=args.get("force_override") is True)

    async def _update_policy(
        self, policy: Any, rule_id: str, args: dict[str, Any], actor: Any = None
    ) -> dict[str, Any]:
        """只把显式给出的字段交给更新，未给出的保持原值。"""
        payload: dict[str, Any] = {}
        if _s(args.get("name")).strip():
            payload["name"] = _s(args.get("name")).strip()
        if _s(args.get("area")).strip():
            area_id, area_name = await self._resolve_area(_s(args.get("area")))
            payload["areaId"] = area_id
            payload["areaName"] = area_name
        if args.get("domains") is not None:
            payload["targetDomains"] = args.get("domains")
        if args.get("idle_minutes") is not None:
            payload["idleMinutes"] = args.get("idle_minutes")
        if args.get("auto_close") is not None:
            payload["autoClose"] = args.get("auto_close") is True
        return await policy.update_rule(
            rule_id, payload, force_override=args.get("force_override") is True, actor=actor
        )

    # 计划任务
    async def _schedule_task(self, args: dict[str, Any], actor: Any = None) -> dict[str, Any]:
        scheduler = self._scheduler
        if scheduler is None:
            return {"error": "计划任务未启用"}
        guard = self._requires_actor(actor)
        if guard is not None:
            return guard
        entity_id = _s(args.get("entity_id")).strip()
        service = _s(args.get("service")).strip()
        if not entity_id or not service:
            return {"error": "需要 entity_id 与 service"}
        domain = _s(args.get("domain")).strip() or entity_id.split(".", 1)[0]
        action_args: dict[str, Any] = {
            "domain": domain,
            "service": service,
            "entity_id": entity_id,
        }
        if isinstance(args.get("service_data"), dict):
            action_args["service_data"] = args.get("service_data")
        precondition: dict[str, Any] = {}
        expected = _s(args.get("expected_state")).strip()
        if expected:
            precondition = {"entityId": entity_id, "expectedState": expected}
        payload = {
            "name": _s(args.get("name")).strip(),
            "scheduleType": _s(args.get("schedule_type")).strip().upper() or "ONCE",
            "delayMinutes": args.get("delay_minutes"),
            "runAt": args.get("run_at"),
            "time": args.get("time"),
            "cron": args.get("cron"),
            "actionTool": "control_device",
            "actionArgs": action_args,
            "precondition": precondition,
        }
        if not payload["name"]:
            payload["name"] = f"{entity_id} {service}"
        return await scheduler.create_task(payload, actor)

    async def _list_scheduled_tasks(self) -> dict[str, Any]:
        scheduler = self._scheduler
        if scheduler is None:
            return {"error": "计划任务未启用"}
        return {"tasks": await scheduler.list_tasks()}

    async def _cancel_scheduled_task(self, args: dict[str, Any], actor: Any = None) -> dict[str, Any]:
        scheduler = self._scheduler
        if scheduler is None:
            return {"error": "计划任务未启用"}
        task_id = _s(args.get("task_id")).strip()
        name = _s(args.get("name")).strip()
        if not task_id and name:
            tasks = await scheduler.list_tasks()
            lowered = name.lower()
            match = next(
                (item for item in tasks if lowered in str(item.get("name") or "").lower()),
                None,
            )
            if match is None:
                return {"ok": False, "message": f"没有找到名称包含「{name}」的计划任务"}
            task_id = str(match.get("id") or "")
        if not task_id:
            return {"ok": False, "message": "需要 task_id 或 name"}
        return await scheduler.delete_task(task_id, actor=actor)

    # 联网搜索
    async def _web_search(self, args: dict[str, Any]) -> dict[str, Any]:
        search = self._web_search_service
        if search is None:
            return {"error": "联网搜索未启用"}
        enabled = True
        getter = getattr(self._agent_config, "get_web_search_enabled", None)
        if callable(getter):
            try:
                enabled = bool(await getter())
            except Exception as exc:
                logger.debug("读取联网搜索开关失败，按开启处理: %s", exc)
                enabled = True
        search.set_enabled(enabled)
        count = _clamped_int(args.get("count"), 5, 1, 8)
        result = await search.search(_s(args.get("query")), count)
        if not result.get("ok"):
            return {
                "ok": False,
                "message": result.get("message") or "没有搜索到结果",
                "results": [],
            }
        return {
            "ok": True,
            "provider": result.get("provider"),
            "query": result.get("query"),
            "results": result.get("results") or [],
        }


__all__ = ["AUTOMATION_TOOL_NAMES", "HomeToolsAutomationMixin"]
