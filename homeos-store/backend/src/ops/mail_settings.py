"""注册邮箱验证码配置解析：站点配置（后台可改）优先，环境变量兜底。
"""

from __future__ import annotations

from dataclasses import replace

from ..config import StoreSettings
from ..core.models import DEFAULT_SUPPORT_EMAIL, StoreSetting
from ..security.secret_fields import mask_secret

#: 后台可选的邮件投递方式。"" 表示跟随环境变量，不是投递方式。
#: **没有 echo**：那个模式会把验证码明文回给调用方，而它只在「请求来自本机」时才生效 ——
#: 一道依赖对端 IP 与转发头的判定，部署形态一变就可能失效，失效的后果是任何人都能读到
#: 别人的验证码。本地联调请用 log（写服务端日志）或直接配 SMTP。
MAIL_MODES = ("log", "smtp")

SMTP_SECURITY_MODES = ("ssl", "starttls", "plain")

#: 各加密方式的行业标准端口。填了加密方式但没填端口时按它推导 ——
DEFAULT_SMTP_PORTS: dict[str, int] = {"ssl": 465, "starttls": 587, "plain": 25}


#: 常见服务商的 SMTP 接入参数（后台「注册邮箱验证码 → 邮箱预设」的一键填充源）。四个字段
SMTP_PRESETS: tuple[dict[str, object], ...] = (
    {
        "id": "qq",
        "label": "QQ 邮箱 / Foxmail",
        "domains": ("qq.com", "vip.qq.com", "foxmail.com"),
        "smtpHost": "smtp.qq.com",
        "smtpPort": 465,
        "smtpSecurity": "ssl",
        "hint": "先在 QQ 邮箱「设置 → 账户」开启 SMTP 服务，授权码用开启时发的那串，不是登录密码。",
    },
    {
        "id": "163",
        "label": "网易 163 邮箱",
        "domains": ("163.com", "vip.163.com"),
        "smtpHost": "smtp.163.com",
        "smtpPort": 465,
        "smtpSecurity": "ssl",
        "hint": "在「设置 → POP3/SMTP/IMAP」开启服务后生成授权码，登录密码在这里不生效。",
    },
    {
        "id": "126",
        "label": "网易 126 邮箱",
        "domains": ("126.com", "yeah.net", "vip.126.com"),
        "smtpHost": "smtp.126.com",
        "smtpPort": 465,
        "smtpSecurity": "ssl",
        "hint": "yeah.net 请把服务器改成 smtp.yeah.net；授权码在「设置 → POP3/SMTP/IMAP」里生成。",
    },
    {
        "id": "aliyun",
        "label": "阿里云邮箱",
        "domains": ("aliyun.com", "mxhichina.com"),
        "smtpHost": "smtp.aliyun.com",
        "smtpPort": 465,
        "smtpSecurity": "ssl",
        "hint": "企业邮箱（自有域名）的服务器是 smtp.mxhichina.com，账号要填完整邮箱地址。",
    },
    {
        "id": "exmail",
        "label": "腾讯企业邮箱",
        "domains": ("exmail.qq.com",),
        "smtpHost": "smtp.exmail.qq.com",
        "smtpPort": 465,
        "smtpSecurity": "ssl",
        "hint": "用自己的域名接进来时，域名不会命中预设，请手动把服务器改成 smtp.exmail.qq.com。",
    },
    {
        "id": "sina",
        "label": "新浪邮箱",
        "domains": ("sina.com", "sina.cn"),
        "smtpHost": "smtp.sina.com",
        "smtpPort": 465,
        "smtpSecurity": "ssl",
        "hint": "需要先在网页版开启 SMTP 服务，否则连接会成功但登录被拒。",
    },
    {
        "id": "gmail",
        "label": "Gmail",
        "domains": ("gmail.com", "googlemail.com"),
        "smtpHost": "smtp.gmail.com",
        "smtpPort": 465,
        "smtpSecurity": "ssl",
        "hint": "账号要开两步验证并生成「应用专用密码」，直接用网页登录密码会被拒。",
    },
    {
        "id": "outlook",
        "label": "Outlook / Hotmail",
        "domains": ("outlook.com", "hotmail.com", "live.com", "outlook.cn"),
        "smtpHost": "smtp.office365.com",
        "smtpPort": 587,
        "smtpSecurity": "starttls",
        "hint": "发件人必须是同一个账号；企业版 365 可能需要管理员先开启 SMTP AUTH。",
    },
)


def mail_presets_payload() -> list[dict]:
    """预设清单的 JSON 形态（供后台渲染下拉框 / 填充表单）。"""
    return [
        {
            "id": str(preset["id"]),
            "label": str(preset["label"]),
            "domains": [str(domain) for domain in preset["domains"]],  # type: ignore[union-attr]
            "smtpHost": str(preset["smtpHost"]),
            "smtpPort": int(preset["smtpPort"]),  # type: ignore[call-overload]
            "smtpSecurity": str(preset["smtpSecurity"]),
            "hint": str(preset["hint"]),
        }
        for preset in SMTP_PRESETS
    ]

#: 验证码有效期的上下限（秒）。下限 60 秒是「用户来得及复制粘贴」的底线；
MIN_TTL_SECONDS = 60
MAX_TTL_SECONDS = 3600


def _text(value: object) -> str:
    return (value or "").strip() if isinstance(value, str) else ""


def merge_mail_settings(
    settings: StoreSettings, setting: StoreSetting | None
) -> StoreSettings:
    """把站点配置里的邮件 / 验证码字段合并进 settings，返回新的不可变对象。"""
    if setting is None:
        return settings

    mode = _text(getattr(setting, "mail_mode", "")).lower()
    if mode not in MAIL_MODES:
        # 库里的脏数据（人工改库、旧版本写坏）按「未配置」处理，跟随环境变量。
        mode = ""

    security = _text(getattr(setting, "smtp_security", "")).lower()
    if security not in SMTP_SECURITY_MODES:
        security = ""

    if security:
        use_ssl = security == "ssl"
        starttls = security == "starttls"
        port = int(getattr(setting, "smtp_port", 0) or 0) or DEFAULT_SMTP_PORTS[security]
    else:
        # 没选加密方式：两个布尔开关与端口都跟随环境变量
        use_ssl = settings.smtp_use_ssl
        starttls = settings.smtp_starttls
        port = int(getattr(setting, "smtp_port", 0) or 0) or settings.smtp_port

    ttl = int(getattr(setting, "verification_ttl_seconds", 0) or 0)
    cooldown = int(getattr(setting, "verification_cooldown_seconds", 0) or 0)
    global_limit = int(getattr(setting, "verification_global_hourly_limit", 0) or 0)

    return replace(
        settings,
        mail_mode=mode or settings.mail_mode,
        mail_from=_text(getattr(setting, "mail_from", "")) or settings.mail_from,
        smtp_host=_text(getattr(setting, "smtp_host", "")) or settings.smtp_host,
        smtp_port=port,
        smtp_username=(
            _text(getattr(setting, "smtp_username", "")) or settings.smtp_username
        ),
        smtp_password=(
            _text(getattr(setting, "smtp_password", "")) or settings.smtp_password
        ),
        smtp_use_ssl=use_ssl,
        smtp_starttls=starttls,
        verification_ttl_seconds=ttl or settings.verification_ttl_seconds,
        verification_cooldown_seconds=(
            cooldown or settings.verification_cooldown_seconds
        ),
        verification_global_hourly_limit=(
            global_limit or settings.verification_global_hourly_limit
        ),

    )


def effective_verification_window(
    settings: StoreSettings,
    setting: StoreSetting | None,
    *,
    ttl_override: int | None = None,
    cooldown_override: int | None = None,
) -> tuple[int, int]:
    """按站点配置解析出 ``(有效期秒数, 重发冷却秒数)``。
    """
    merged = merge_mail_settings(settings, setting)
    ttl = int(ttl_override or 0) or int(merged.verification_ttl_seconds or 0)
    cooldown = int(cooldown_override or 0) or int(
        merged.verification_cooldown_seconds or 0
    )
    return max(1, ttl), max(0, cooldown)


def validate_verification_window(ttl_seconds: int, cooldown_seconds: int) -> None:
    """校验有效期与冷却的取值（不合法时抛 ``ValueError``，由调用方转 422）。
    """
    if ttl_seconds < MIN_TTL_SECONDS:
        raise ValueError(f"验证码有效期不能短于 {MIN_TTL_SECONDS} 秒（用户来不及输入）。")
    if ttl_seconds > MAX_TTL_SECONDS:
        raise ValueError(f"验证码有效期不能超过 {MAX_TTL_SECONDS} 秒（太长等于长期口令）。")
    if cooldown_seconds < 0:
        raise ValueError("重发冷却不能为负数。")
    if cooldown_seconds >= ttl_seconds:
        raise ValueError(
            f"重发冷却（{cooldown_seconds} 秒）必须短于有效期（{ttl_seconds} 秒）："
            "否则验证码过期后用户仍被冷却挡住，无法重新获取，也就没法完成注册。"
        )


def _enabled_flag(value: object) -> bool:
    """三态布尔的口径：``None``（库里的 NULL / 未落库的默认）按**开**处理。"""
    return True if value is None else bool(value)


def mail_delivery_summary(
    settings: StoreSettings, setting: StoreSetting | None
) -> dict:
    """给后台用的邮件配置概览。**绝不包含 SMTP 授权码明文**。"""
    merged = merge_mail_settings(settings, setting)
    ttl, cooldown = effective_verification_window(settings, setting)
    database_password = _text(getattr(setting, "smtp_password", ""))

    return {
        "mode": merged.mail_mode,
        "modeFromDatabase": bool(_text(getattr(setting, "mail_mode", "")).lower()),
        "fromAddress": merged.mail_from,
        "fromAddressFromDatabase": bool(_text(getattr(setting, "mail_from", ""))),
        "smtpHost": merged.smtp_host,
        "smtpHostFromDatabase": bool(_text(getattr(setting, "smtp_host", ""))),
        "smtpPort": merged.smtp_port,
        "smtpPortFromDatabase": bool(int(getattr(setting, "smtp_port", 0) or 0)),
        "smtpUsername": merged.smtp_username,
        "smtpUsernameFromDatabase": bool(_text(getattr(setting, "smtp_username", ""))),
        #: 授权码永不回显，只报「有没有」和打码值（确认换没换成）。
        "smtpPasswordConfigured": bool(merged.smtp_password),
        "smtpPasswordMasked": mask_secret(database_password),
        "smtpPasswordFromDatabase": bool(database_password),
        "smtpSecurity": (
            _text(getattr(setting, "smtp_security", "")).lower()
            or ("ssl" if merged.smtp_use_ssl else "starttls" if merged.smtp_starttls else "plain")
        ),
        "smtpSecurityFromDatabase": bool(_text(getattr(setting, "smtp_security", ""))),
        "verificationTtlSeconds": ttl,
        "verificationTtlFromDatabase": bool(
            int(getattr(setting, "verification_ttl_seconds", 0) or 0)
        ),
        "verificationCooldownSeconds": cooldown,
        "verificationCooldownFromDatabase": bool(
            int(getattr(setting, "verification_cooldown_seconds", 0) or 0)
        ),
        #: 全站小时上限：触顶时**所有**用户都收不到码，所以后台必须能看到当前值。
        "verificationGlobalHourlyLimit": int(merged.verification_global_hourly_limit or 0),
        "verificationGlobalHourlyLimitFromDatabase": bool(
            int(getattr(setting, "verification_global_hourly_limit", 0) or 0)
        ),
        #: 发货邮件与验证码共用 SMTP；NULL 视为开启。
        "deliveryEmailEnabled": _enabled_flag(
            getattr(setting, "delivery_email_enabled", None)
        ),
        "smtpReady": bool(merged.smtp_ready),
        "smtpMisconfigured": bool(merged.smtp_misconfigured),
        "deliveryEnabled": bool(merged.mail_delivery_enabled),
        #: 本部署的默认邮箱。后台拿它预填「测试收件邮箱」、SMTP 账号与发件人，
        "defaultEmail": DEFAULT_SUPPORT_EMAIL,
        #: 服务商预设清单。放在**服务端**而不是前端硬编码：这张表同时是默认值的
        "presets": mail_presets_payload(),
    }
