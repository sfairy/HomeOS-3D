"""邮箱验证码投递。

``STORE_MAIL_MODE`` 三种模式：

- ``log``  —— 只写日志（默认，本地联调）
- ``echo`` —— 写日志并在接口响应里回显验证码明文（**仅限本地**）
- ``smtp`` —— 真实发信
"""

from __future__ import annotations

import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage

from store.config import StoreSettings
from store.models import StoreSetting

logger = logging.getLogger("store.mailer")

PURPOSE_LABELS = {
    "register": "注册账号",
    "reset": "重置登录密码",
}


@dataclass(frozen=True)
class MailResult:
    delivered: bool
    exposed_code: str | None = None


def _render(code: str, purpose: str, setting: StoreSetting) -> tuple[str, str]:
    label = PURPOSE_LABELS.get(purpose, "验证账号")
    site = setting.site_name or "HomeOS 授权中心"
    subject = f"{site} - {label}验证码"
    body = (
        f"您好，\n\n"
        f"您正在{label}，验证码为：{code}\n\n"
        f"验证码 10 分钟内有效，请勿转发给他人。\n"
        f"如果这不是您本人的操作，请忽略本邮件。\n\n"
        f"{site}\n"
    )
    return subject, body


def send_verification_email(
    settings: StoreSettings,
    setting: StoreSetting,
    *,
    email: str,
    code: str,
    purpose: str,
) -> MailResult:
    subject, body = _render(code, purpose, setting)
    mode = (settings.mail_mode or "log").lower()

    if settings.smtp_misconfigured:
        logger.error(
            "STORE_MAIL_MODE=smtp 但凭据不全（host=%r username=%r password=%s），"
            "本次改为日志/回显投递，注册流程不会中断",
            settings.smtp_host,
            settings.smtp_username,
            "已设置" if settings.smtp_password else "缺失",
        )

    if settings.smtp_ready:
        if _send_smtp(settings, email=email, subject=subject, body=body):
            # 若同时打开了回显开关（本地联调），仍然回显
            exposed = code if settings.expose_verification_code else None
            return MailResult(delivered=True, exposed_code=exposed)
        logger.error("验证码邮件发送失败，回退为日志模式：%s", email)

    logger.warning(
        "[验证码] 收件人=%s 用途=%s 验证码=%s（mail_mode=%s）", email, purpose, code, mode
    )
    if mode == "echo" or settings.expose_verification_code:
        return MailResult(delivered=False, exposed_code=code)
    return MailResult(delivered=False, exposed_code=None)


def _send_smtp(settings: StoreSettings, *, email: str, subject: str, body: str) -> bool:
    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = email
    message["Subject"] = subject
    message.set_content(body)

    try:
        if settings.smtp_use_ssl:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(
                settings.smtp_host, settings.smtp_port, context=context, timeout=15
            ) as client:
                if settings.smtp_username:
                    client.login(settings.smtp_username, settings.smtp_password)
                client.send_message(message)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as client:
                client.ehlo()
                if settings.smtp_starttls:
                    client.starttls(context=ssl.create_default_context())
                    client.ehlo()
                if settings.smtp_username:
                    client.login(settings.smtp_username, settings.smtp_password)
                client.send_message(message)
    except (OSError, smtplib.SMTPException) as error:
        logger.error("SMTP 发送失败：%s", error)
        return False
    return True
