"""邮件投递的门面（实现已下沉到 ``infra.mailer``）。

``commerce.delivery``（发货通知）与 ``api`` 都曾从这里 import，而 ``ops`` 又依赖
``payments`` —— 三方构成包级环。投递本是与业务无关的基础设施，搬到 ``infra`` 后
``commerce`` / ``payments`` 只依赖 ``infra`` 与 ``core``，环消失。

调用点不必改；新代码请直接 ``from ..infra import mailer``。
"""

from __future__ import annotations

from ..infra.mailer import (
    MAX_SEND_WALL_SECONDS,
    MailResult,
    diagnose_mail,
    header_text_error,
    mail_from_error,
    send_license_email,
    send_test_email,
    send_verification_email,
)

__all__ = [
    "MAX_SEND_WALL_SECONDS",
    "MailResult",
    "diagnose_mail",
    "header_text_error",
    "mail_from_error",
    "send_license_email",
    "send_test_email",
    "send_verification_email",
]
