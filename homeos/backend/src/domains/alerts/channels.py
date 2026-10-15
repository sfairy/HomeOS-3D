"""LAN 站内通知渠道与列表拉取条数工具。

逐条对齐 ``common/alert-support/notification-channels.util.ts``：
- ``resolveLanChannels``：空数组视为全选；
- ``resolveAlertRuleChannels``：空数组收敛为「仅站内 + 实时」；
- ``resolveNotificationFetchLimit``：clamp 到 ``[1, maxNotifications]``。
"""

from __future__ import annotations

from typing import Any

# 转出（非本地定义）：列入 ``__all__`` 即视为有意重导出。
from ...platform.core.numbers import resolve_notification_fetch_limit

# ``resolve_notification_fetch_limit`` 直接从共享实现转出：该口径原先在本模块与
# ``domains.security.config`` 各写一份（连默认值 100/500 都重复），非法值处理已经漂移。
# 调用方沿用 ``from ..alerts.channels import resolve_notification_fetch_limit``。

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




__all__ = [
    "LAN_NOTIFICATION_CHANNELS",
    "resolve_alert_rule_channels",
    "resolve_lan_channels",
    "resolve_notification_fetch_limit",
]
