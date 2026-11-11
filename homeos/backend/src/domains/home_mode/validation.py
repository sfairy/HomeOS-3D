"""家庭模式动作的准入校验（写时拒绝 + 运行时兜底）。

背景：家庭模式的动作列表原先由 API **原样落库**，运行时又直接调
``ha_connector.call_service``（绕过 ``CommandProxyService`` 的服务白名单）。结果是
「通过 API 创建的模式可以执行 ``shell_command.*`` / ``lock.unlock``，并在定时或
在场触发时**无人值守**执行」—— 这正是管家 / 语音通道被明确拦截的那类动作。

本模块把判据收敛成一处，供两个时机复用：

- **写时**（``HomeModeService.create`` / ``update_sync``）：不合法直接拒绝，错误里带
  动作序号，便于前端定位；
- **运行时**（``_execute_home_mode_action``）：兜住历史存量数据 —— 老配置里可能已经
  存了非白名单服务，不能因为校验晚到就放行。

判据来源只有 ``platform/core/ha/service_payload_rules.validate_service_payload``
（与命令代理出口、语音、管家工具同一份），这里不另写一套白名单。
"""

from __future__ import annotations

import logging
import re
from typing import Any

from .presets import resolve_action_kind
from ...platform.core.ha.service_payload_rules import ServicePayloadRejected, validate_service_payload

logger = logging.getLogger("homeos.home_mode.validation")

#: 只允许「设备类」实体的合法形态：``domain.object_id``，小写 + 数字 + 下划线。
#: 不收空格 / 大写 / 中文，避免把自由文本（旧版通知消息）当实体下发。
_ENTITY_ID_RE = re.compile(r"^[a-z0-9_]+\.[a-z0-9_]+$")

#: 这些 kind 不是设备动作：notify 用消息文本、security 用布防档位，
#: 二者都不该走 HA 服务白名单。
_NON_SERVICE_KINDS = frozenset({"notify", "security"})

#: 家庭模式允许执行的域（在服务白名单之上的额外收窄）。
#:
#: 白名单本身已经排除了 ``shell_command`` / ``python_script`` 这类任意执行服务，
#: 但 ``script.*`` / ``scene.*`` / ``automation.*`` 仍在白名单里（它们有合法用途）。
#: 家庭模式是**无人值守**执行的，所以这里再挡一层：脚本与自动化只能由人显式触发，
#: 不能被一个定时模式带起来。
_FORBIDDEN_ACTION_DOMAINS = frozenset({"shell_command", "python_script", "automation", "command_line"})


class ModeActionRejected(ValueError):
    """模式动作不合法。``index`` 是动作在 ``config`` 里的下标（-1 表示整体）。"""

    def __init__(self, index: int, detail: str) -> None:
        super().__init__(detail)
        self.index = index
        self.detail = detail

    def message(self) -> str:
        if self.index < 0:
            return self.detail
        return f"第 {self.index + 1} 个动作不合法：{self.detail}"


def _action_entity_id(action: dict[str, Any]) -> str:
    return str(action.get("entity_id") or "").strip()


def validate_mode_action(action: Any, *, index: int = -1) -> None:
    """校验单个动作；不合法抛 :class:`ModeActionRejected`。"""
    if not isinstance(action, dict):
        raise ModeActionRejected(index, "动作必须是对象。")

    kind = resolve_action_kind(action)
    if kind in _NON_SERVICE_KINDS:
        # 通知 / 安防不经过 HA 服务通道，由各自的实现校验（见 actions.py）。
        return

    entity_id = _action_entity_id(action)
    if not entity_id:
        raise ModeActionRejected(index, "缺少目标实体。")

    domain = str(action.get("domain") or entity_id.partition(".")[0] or "").strip().lower()
    service = str(action.get("service") or "turn_on").strip()

    if domain in _FORBIDDEN_ACTION_DOMAINS:
        raise ModeActionRejected(index, f"家庭模式不允许执行 {domain}.* 服务。")

    if kind == "entity" or kind == "scene" or kind == "script":
        if not _ENTITY_ID_RE.match(entity_id):
            raise ModeActionRejected(index, f"实体 id 形态不合法：{entity_id}")

    data = action.get("service_data") or {}
    try:
        validate_service_payload(domain, service, data, entity_id, policy="http")
    except ServicePayloadRejected as rejected:
        raise ModeActionRejected(index, rejected.detail) from rejected


def validate_mode_actions(config: Any) -> None:
    """校验整份动作列表；遇到第一个不合法项即抛错（带序号）。"""
    if config is None:
        return
    if not isinstance(config, list):
        raise ModeActionRejected(-1, "config 必须是动作数组。")
    for index, action in enumerate(config):
        validate_mode_action(action, index=index)


def is_action_permitted(action: dict[str, Any]) -> bool:
    """运行时兜底判据：动作是否允许下发（不抛错，供存量数据使用）。"""
    try:
        validate_mode_action(action)
    except ModeActionRejected as rejected:
        logger.debug("存量模式动作被拒绝: %s", rejected.message())
        return False
    return True


__all__ = [
    "ModeActionRejected",
    "is_action_permitted",
    "validate_mode_action",
    "validate_mode_actions",
]
