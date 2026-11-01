"""智能管家控制类动作的判定口径：谁算控制、算不算成功、审计写什么。

这三件事此前散在 ``service.py`` 里各自为政，造成两种失真：

1. **审计只覆盖 3 个工具**。``set_light_brightness`` / ``set_cover_position`` /
   ``media_control`` / ``activate_home_mode`` 同样真实改变设备状态，却既不写审计，
   也不参与「一轮里 ≥2 个控制调用先跟用户确认」的保护。
2. **成功判定只有两态**。HA 对「实体被跳过 / 正在离线」同样回 200，响应里可能
   根本没有该实体 —— 此时 ``verification.verified is None``，既不是成功也不是失败。
   按两态记成「成功」，审计就会把「没执行」写成「已执行」，事后无法复盘。

口径集中在这里：:data:`CONTROL_TOOL_NAMES` 是唯一名单（与「无执行身份一律拒绝」
共用同一份定义），:func:`control_outcome` 给四态结论，:func:`audit_target` 说明
「动了什么」。调用方不再各自解释 ``success`` / ``verified`` / ``blocked``。
"""

from __future__ import annotations

from typing import Any

from .agent_actor import AGENT_CONTROL_TOOLS
from ...proxy.command_proxy import is_control_success

#: 控制类工具名单。直接复用「无有效执行身份一律拒绝」用的那份，
#: 避免两处名单各改一半（此前审计名单只有 3 个，ACL 名单有 7 个）。
CONTROL_TOOL_NAMES = AGENT_CONTROL_TOOLS

#: 结论四态。写审计 ``status``，也是日志里区分「下发 ≠ 生效」的唯一依据。
OUTCOME_SUCCESS = "success"
OUTCOME_UNVERIFIED = "unverified"
OUTCOME_FAILED = "failed"
OUTCOME_BLOCKED = "blocked"

#: 走 ``CommandProxy`` 的控制工具：结果里带 ``success`` + 三态 ``verification``。
_PROXY_CONTROL_TOOLS = frozenset(
    {
        "control_device",
        "set_light_brightness",
        "set_cover_position",
        "media_control",
        "activate_home_mode",
    }
)


def _is_number(value: Any) -> bool:
    """对齐 JS ``typeof value === 'number'``（布尔不算数字）。"""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def is_blocked(result: Any) -> bool:
    """结果里是否含被安全策略拦截的设备（含批量 ``results`` 子项）。"""
    if not isinstance(result, dict) or not result:
        return False
    if result.get("blocked") is True:
        return True
    results = result.get("results")
    return isinstance(results, list) and any(isinstance(item, dict) and item.get("blocked") for item in results)


def is_unverified(result: Any) -> bool:
    """请求被 HA 接受，但响应里没有该实体的状态 —— 既非成功也非失败。

    只认 ``supported=True`` 且 ``verified is None``：``supported=False`` 表示这类
    服务本来就没有可比对的目标态（``button.press`` / ``script.*``），不是「未确认」。
    """
    if not isinstance(result, dict):
        return False
    if result.get("unverified") is True:
        return True
    verification = result.get("verification")
    if isinstance(verification, dict):
        return verification.get("supported") is True and verification.get("verified") is None
    return "verified" in result and result.get("verified") is None and result.get("supported") is not False


def control_succeeded(tool_name: str, result: Any) -> bool:
    """一次控制调用是否可以对外宣称「做成了」。"""
    if not isinstance(result, dict) or not result or result.get("error"):
        return False
    if tool_name == "control_room":
        total, affected = result.get("total"), result.get("affected")
        return _is_number(total) and total > 0 and _is_number(affected) and affected == total
    if tool_name in _PROXY_CONTROL_TOOLS:
        return is_control_success(result)
    if tool_name == "activate_scene":
        return is_control_success(result) and result.get("blocked") is not True
    return False


def control_outcome(tool_name: str, result: Any) -> str:
    """四态结论：已拦截 / 失败 / 已下发未确认 / 成功。

    顺序有意义 —— 被拦截的结果往往同时 ``success: False``，先判拦截才不会
    把「安全策略拦下了」写成「执行失败」，两者对用户的含义完全不同。
    """
    if is_blocked(result):
        return OUTCOME_BLOCKED
    if not control_succeeded(tool_name, result):
        return OUTCOME_FAILED
    return OUTCOME_UNVERIFIED if is_unverified(result) else OUTCOME_SUCCESS


def audit_target(tool_name: str, args: dict[str, Any]) -> str:
    """审计里的「动作对象」：实体 / 房间 / 场景 / 家庭模式。"""
    if tool_name == "control_room":
        area = str(args.get("area_id") or args.get("room") or "")
        domain = str(args.get("domain") or "")
        return f"{area} {domain}".strip()
    if tool_name == "activate_scene":
        return str(args.get("scene_id") or args.get("scene") or args.get("entity_id") or "")
    if tool_name == "activate_home_mode":
        return str(args.get("name") or args.get("mode") or args.get("mode_id") or "")
    return str(args.get("entity_id") or "")


def describe_plan(calls: list[tuple[str, dict[str, Any]]]) -> str:
    """把 LLM 的批量计划压成一句可朗读的描述（确认提示用）。"""
    parts: list[str] = []
    for name, args in calls:
        parts.append(_describe_call(name, args))
    joined = "、".join(parts[:6])
    return f"{joined} 等 {len(parts)} 项" if len(parts) > 6 else joined


def _describe_call(name: str, args: dict[str, Any]) -> str:
    entity_id = str(args.get("entity_id") or "设备")
    if name == "control_room":
        return (
            f"{args.get('room') or args.get('area_id') or '房间'}的"
            f"{args.get('domain') or '设备'}（{args.get('service')}）"
        )
    if name == "control_device":
        return entity_id
    if name == "set_light_brightness":
        return f"{entity_id} 亮度 {args.get('brightness')}%"
    if name == "set_cover_position":
        return f"{entity_id} 开合 {args.get('position')}%"
    if name == "media_control":
        return f"{entity_id}（{args.get('service')}）"
    if name == "activate_scene":
        return f"场景 {args.get('scene') or args.get('sceneName') or args.get('entity_id')}"
    if name == "activate_home_mode":
        return f"家庭模式 {args.get('name') or args.get('mode') or args.get('mode_id')}"
    return name


__all__ = [
    "CONTROL_TOOL_NAMES",
    "OUTCOME_BLOCKED",
    "OUTCOME_FAILED",
    "OUTCOME_SUCCESS",
    "OUTCOME_UNVERIFIED",
    "audit_target",
    "control_outcome",
    "control_succeeded",
    "describe_plan",
    "is_blocked",
    "is_unverified",
]
