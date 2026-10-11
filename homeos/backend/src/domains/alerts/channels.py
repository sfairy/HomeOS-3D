"""LAN 站内通知渠道与列表拉取条数工具。

逐条对齐 ``common/alert-support/notification-channels.util.ts``：
- ``resolveLanChannels``：空数组视为全选；
- ``resolveAlertRuleChannels``：空数组收敛为「仅站内 + 实时」；
- ``resolveNotificationFetchLimit``：clamp 到 ``[1, maxNotifications]``。
"""

from __future__ import annotations

from typing import Any

#: 全部可用渠道的有序列表（空数组过滤参数视为全选）。
LAN_NOTIFICATION_CHANNELS: list[str] = [
    "in_app",
    "socket",
    "tts",
    "email",
    "webpush",
    "wecom",
]


def resolve_lan_channels(channels: Any) -> list[str]:
    """解析渠道过滤参数；空/全非法输入回退为全渠道。"""
    raw = [c for c in channels if c] if isinstance(channels, list) else []
    if not raw:
        return list(LAN_NOTIFICATION_CHANNELS)
    resolved: list[str] = []
    for channel in raw:
        if channel in LAN_NOTIFICATION_CHANNELS and channel not in resolved:
            resolved.append(channel)
    return resolved or list(LAN_NOTIFICATION_CHANNELS)


def resolve_alert_rule_channels(channels: Any) -> list[str]:
    """解析告警规则渠道；空/全非法输入回退为 ``['in_app', 'socket']``。"""
    raw = [c for c in channels if c] if isinstance(channels, list) else []
    if not raw:
        return ["in_app", "socket"]
    resolved: list[str] = []
    for channel in raw:
        if channel in LAN_NOTIFICATION_CHANNELS and channel not in resolved:
            resolved.append(channel)
    return resolved or ["in_app", "socket"]


def _positive_number(value: Any) -> bool:
    try:
        return float(value) > 0
    except (TypeError, ValueError):
        return False


def resolve_notification_fetch_limit(
    limit: Any,
    frontend: dict[str, Any] | None,
    notification: dict[str, Any] | None,
) -> int:
    """计算通知列表 API 的安全拉取条数（对齐 ``resolveNotificationFetchLimit``）。"""
    frontend = frontend or {}
    notification = notification or {}
    default_fetch = (
        int(frontend.get("maxRemoteNotifications"))
        if _positive_number(frontend.get("maxRemoteNotifications"))
        else 100
    )
    storage_cap = (
        int(notification.get("maxNotifications"))
        if _positive_number(notification.get("maxNotifications"))
        else 500
    )
    parsed = int(limit) if limit is not None and _positive_number(limit) else default_fetch
    return min(max(parsed, 1), storage_cap)


__all__ = [
    "LAN_NOTIFICATION_CHANNELS",
    "resolve_alert_rule_channels",
    "resolve_lan_channels",
    "resolve_notification_fetch_limit",
]
