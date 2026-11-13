"""邮件配置合并的门面（实现已下沉到 ``infra.mail_settings``）。"""

from __future__ import annotations

from ..infra.mail_settings import (
    DEFAULT_SMTP_PORTS,
    MAIL_MODES,
    SMTP_PRESETS,
    SMTP_SECURITY_MODES,
    effective_verification_window,
    mail_delivery_summary,
    mail_presets_payload,
    merge_mail_settings,
    validate_verification_window,
)

__all__ = [
    "DEFAULT_SMTP_PORTS",
    "MAIL_MODES",
    "SMTP_PRESETS",
    "SMTP_SECURITY_MODES",
    "effective_verification_window",
    "mail_delivery_summary",
    "mail_presets_payload",
    "merge_mail_settings",
    "validate_verification_window",
]
