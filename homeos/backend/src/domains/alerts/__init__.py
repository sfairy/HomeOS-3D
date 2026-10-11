"""告警支撑工具包（对齐 backend/src/common/alert-support/*）。

提供与 Nest 完全一致的纯函数：通知渠道解析、免打扰窗口判定、告警条件求值、
消息模板插值、通知来源归一化与安防告警文案。
"""

from .channels import (
    LAN_NOTIFICATION_CHANNELS,
    resolve_alert_rule_channels,
    resolve_lan_channels,
    resolve_notification_fetch_limit,
)
from .condition import evaluate_condition
from .dnd import (
    DEFAULT_DND_END,
    DEFAULT_DND_START,
    dnd_duration_hours,
    is_dnd_active,
    is_dnd_active_now,
)
from .messages import format_security_alarm_message
from .sources import (
    is_life_safety_notification,
    normalize_notification_filter_key,
    normalize_notification_source,
    notification_source_label,
)
from .templates import apply_alert_template, format_alert_rule_message

__all__ = [
    "DEFAULT_DND_END",
    "DEFAULT_DND_START",
    "LAN_NOTIFICATION_CHANNELS",
    "apply_alert_template",
    "dnd_duration_hours",
    "evaluate_condition",
    "format_alert_rule_message",
    "format_security_alarm_message",
    "is_dnd_active",
    "is_dnd_active_now",
    "is_life_safety_notification",
    "normalize_notification_filter_key",
    "normalize_notification_source",
    "notification_source_label",
    "resolve_alert_rule_channels",
    "resolve_lan_channels",
    "resolve_notification_fetch_limit",
]
