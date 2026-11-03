"""待办 / 购物清单工具族：``manage_todo``。

为什么单独一族：HA 的 ``todo`` 域在服务白名单里，``todo.get_items`` 也在需要
``?return_response`` 的服务列表里，但管家此前没有任何入口 —— 用户说「把牛奶加到购物
清单」时模型只能拒绝。写操作（add / complete / remove）统一走 ``_control_device``，
复用服务白名单、实体 ACL、高危判定与审计；读操作走 ``CommandProxy`` 的响应体通道。

多清单歧义：家里可能同时有「购物清单」「待办事项」。未指定 ``entity_id`` 且解析到多台时
返回候选让模型追问，而不是随便挑一个写进去。
"""

from __future__ import annotations

from typing import Any

from .home_tools_base import HomeToolsHost
from .home_tools_primitives import _error_message, _or, _s, logger

#: 清单条目文本上限（HA 侧没有硬限制，但列表展示会撑破，先收敛）
MAX_ITEM_CHARS = 200
#: 单次返回条目上限
MAX_ITEMS = 100

#: 动作 → HA 服务
_ACTION_SERVICE: dict[str, str] = {
    "add": "add_item",
    "remove": "remove_item",
    "complete": "update_item",
}


def _todo_entities(state_store: Any) -> list[dict[str, Any]]:
    """从状态快照里取全部 todo.* 实体（保持 HA 顺序）。"""
    try:
        entities = state_store.get_all() or []
    except Exception as exc:  # pragma: no cover - 状态库自身防御
        logger.warning("读取待办实体失败: %s", exc)
        return []
    return [
        entity
        for entity in entities
        if isinstance(entity, dict) and str(entity.get("entity_id") or "").startswith("todo.")
    ]


def _friendly_name(entity: dict[str, Any]) -> str:
    attributes = entity.get("attributes")
    if isinstance(attributes, dict):
        return str(_or(attributes.get("friendly_name"), entity.get("entity_id")))
    return str(entity.get("entity_id") or "")


def _todo_request(args: dict[str, Any]) -> tuple[str, str, str, dict[str, Any] | None]:
    """解析 action/item/due；返回 (action, item, due, 错误结果)。"""
    action = _s(args.get("action")).strip().lower() or "list"
    if action not in ("list", "add", "remove", "complete", "clear_completed"):
        return "", "", "", {"error": "action 须为 list/add/complete/remove/clear_completed"}
    item = _s(args.get("item")).strip()
    if action in ("add", "remove", "complete") and not item:
        return "", "", "", {"error": f"{action} 需要 item（条目内容）"}
    if len(item) > MAX_ITEM_CHARS:
        return "", "", "", {"error": f"条目内容过长（最多 {MAX_ITEM_CHARS} 字）"}
    due = _s(args.get("due")).strip()
    if due and action != "add":
        # 只有新增条目能带截止时间；完成 / 删除时传 due 会被 HA 忽略，
        # 与其静默丢弃不如明确告诉模型参数用错了位置。
        return "", "", "", {"error": "due 只用于 add（新增条目）"}
    return action, item, due, None


def _todo_service_data(action: str, item: str, due: str) -> dict[str, Any] | None:
    """拼 HA 服务参数；空字典回 None，避免把空 service_data 传下去。"""
    service_data: dict[str, Any] = {}
    if item:
        service_data["item"] = item
    if action == "complete":
        service_data["status"] = "completed"
    if action == "add" and due:
        # HA 用两个字段区分全天 / 定时：带冒号或 T 的按时间点，其余按日期
        key = "due_datetime" if (":" in due or "T" in due) else "due_date"
        service_data[key] = due
    return service_data or None


class HomeToolsListsMixin(HomeToolsHost):
    """待办 / 购物清单工具族。"""

    async def _manage_todo(self, args: dict[str, Any], actor: Any = None) -> dict[str, Any]:
        """列出 / 添加 / 完成 / 删除待办条目。"""
        action, item, due, invalid = _todo_request(args)
        if invalid:
            return invalid

        resolved = self._resolve_todo_entity(args, actor)
        if resolved.get("error"):
            return resolved

        entity_id = str(resolved["entity_id"])
        if action == "list":
            return await self._list_todo_items(entity_id, actor)

        result = await self._control_device(
            {
                "domain": "todo",
                "service": _ACTION_SERVICE.get(action, "remove_completed_items"),
                "entity_id": entity_id,
                "service_data": _todo_service_data(action, item, due),
            },
            actor,
        )
        if isinstance(result, dict):
            result.setdefault("entity_id", entity_id)
            result.setdefault("name", resolved.get("name"))
            result.setdefault("action", action)
            result.setdefault("item", item or None)
        return result

    def _resolve_todo_entity(self, args: dict[str, Any], actor: Any = None) -> dict[str, Any]:
        """解析目标清单：显式 entity_id 优先，否则要求唯一可读清单。"""
        explicit = _s(args.get("entity_id")).strip()
        if explicit:
            if not explicit.startswith("todo."):
                return {"error": "entity_id 须为 todo.*"}
            if not self._may_read(explicit, actor):
                return {"error": f"当前账号无权查看清单 {explicit}"}
            entity = self._state_store.get(explicit)
            if entity is None:
                return {"error": f"未找到清单 {explicit}"}
            return {"entity_id": explicit, "name": _friendly_name(entity)}
        candidates = [
            entity
            for entity in _todo_entities(self._state_store)
            if self._may_read(str(entity.get("entity_id") or ""), actor)
        ]
        if not candidates:
            return {"error": "家里没有可用的待办 / 购物清单（HA 未配置 todo 实体）"}
        if len(candidates) > 1:
            return {
                "error": "有多个待办清单，请先确认要操作哪一个",
                "candidates": [
                    {"entity_id": entity.get("entity_id"), "name": _friendly_name(entity)} for entity in candidates[:10]
                ],
            }
        entity = candidates[0]
        return {"entity_id": str(entity.get("entity_id")), "name": _friendly_name(entity)}

    async def _list_todo_items(self, entity_id: str, actor: Any = None) -> dict[str, Any]:
        """读取清单条目（HA 的 ``todo.get_items`` 需要 ``return_response``）。"""
        try:
            result = await self._command_proxy.call_service(
                {
                    "domain": "todo",
                    "service": "get_items",
                    "entity_id": entity_id,
                    "return_response": True,
                }
            )
        except Exception as exc:
            logger.warning("读取待办清单失败: %s", _error_message(exc))
            return {"error": f"读取清单失败: {_error_message(exc, '未知错误')}"}
        if not isinstance(result, dict) or result.get("success") is not True:
            message = ""
            if isinstance(result, dict):
                message = _s(result.get("error") or result.get("message"))
            return {"error": message or "读取清单失败"}
        items = _extract_todo_items(result.get("data"))
        return {
            "entity_id": entity_id,
            "count": len(items),
            "items": items[:MAX_ITEMS],
        }


def _extract_todo_items(data: Any) -> list[dict[str, Any]]:
    """兼容 ``{"items": [...]}`` 与 ``{"todo.xxx": {"items": [...]}}`` 两种响应形状。"""
    if not isinstance(data, dict):
        return []
    raw = data.get("items")
    if not isinstance(raw, list):
        # HA 服务响应按实体 ID 分组：取第一个带 items 的实体
        for value in data.values():
            if isinstance(value, dict) and isinstance(value.get("items"), list):
                raw = value["items"]
                break
    if not isinstance(raw, list):
        return []
    items: list[dict[str, Any]] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        items.append(
            {
                "uid": entry.get("uid"),
                "summary": _s(entry.get("summary") or entry.get("item")),
                "status": _s(entry.get("status") or "needs_action"),
                "due": entry.get("due"),
                "description": entry.get("description"),
            }
        )
    return items


__all__ = ["MAX_ITEM_CHARS", "HomeToolsListsMixin"]
