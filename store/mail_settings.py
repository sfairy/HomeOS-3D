"""注册邮箱验证码配置解析：站点配置（后台可改）优先，环境变量兜底。

为什么需要单独一层：``StoreSettings`` 是启动时装配好的**不可变**对象，而
``StoreSetting`` 是运行时可变、由后台改写的。SMTP 授权码、验证码有效期这些
必须每次现算，不能在启动时烘焙进 settings —— 否则运营在后台换了授权码，
进程不重启就不生效，而「免重启改配置」恰恰是后台提供这几个字段的全部意义。

优先级规则与站点里其它配置保持一致（见 ``resolve_device_release_cooldown``、
``payments.credentials.merge_alipay_settings``）：
**站点配置非空（或非 0）则覆盖环境变量，留空表示跟随环境变量**。

一个刻意的例外是验证码有效期 / 重发冷却：它们用 ``0`` 而不是空串表示
「跟随环境变量」，因为 ``0`` 在这里不是合法的业务值（有效期 0 秒的验证码
没有任何意义），拿它当哨兵不会和真实配置撞车。
"""

from __future__ import annotations

from dataclasses import replace

from store.config import StoreSettings
from store.models import StoreSetting
from store.secret_fields import mask_secret

#: 后台可选的邮件投递方式。``""`` 表示跟随环境变量，不是投递方式。
MAIL_MODES = ("log", "echo", "smtp")

#: ``smtp`` 模式下接口是否回显验证码由 ``expose_verification_code`` 单独决定；
#: ``echo`` 模式天然回显。这两个模式名与 ``mailer`` 里的分支一一对应。
#:
#: SMTP 连接加密方式。刻意收成一个三选一的枚举，而不是沿用环境变量里的两个
#: 布尔开关（``smtp_use_ssl`` / ``smtp_starttls``）：两个裸布尔只能表达 4 种组合，
#: 其中「两个都开」是非法组合，而「没配过」这种状态根本表达不出来 —— 而后台
#: 最需要的恰恰是「留空 = 跟随环境变量」。一个下拉框同时解决这两件事。
SMTP_SECURITY_MODES = ("ssl", "starttls", "plain")

#: 各加密方式的行业标准端口。填了加密方式但没填端口时按它推导 ——
#: 否则会沿用环境变量的 465，于是「STARTTLS + 465」这种连不上的组合
#: 会以一个笼统的超时表现出来，运营想不到问题出在端口上。
DEFAULT_SMTP_PORTS: dict[str, int] = {"ssl": 465, "starttls": 587, "plain": 25}

#: 验证码有效期的上下限（秒）。下限 60 秒是「用户来得及复制粘贴」的底线；
#: 上限 1 小时是因为再长就等于给了一个长期有效的口令。
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
        # 不在这里抛异常：读路径在注册动线上，让用户注册失败来暴露一个后台配置
        # 问题是本末倒置。写入口（admin）已经严格校验，非法值根本进不来。
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
    expose = getattr(setting, "expose_verification_code", None)

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
        expose_verification_code=(
            settings.expose_verification_code if expose is None else bool(expose)
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

    单独拎出来是为了让校验（保存配置时）和运行（发码时）用同一口径：
    两边各算一遍的话，出现「保存时校验通过、运行时却越界」只是时间问题。

    ``ttl_override`` / ``cooldown_override`` 供配置接口在**落库之前**试算：
    叠一层本次提交的值，其余仍按「站点配置优先、环境变量兜底」解析。
    ``None`` 与 ``0`` 都表示「本次没给新值」，与库里的同款哨兵语义一致。
    """
    merged = merge_mail_settings(settings, setting)
    ttl = int(ttl_override or 0) or int(merged.verification_ttl_seconds or 0)
    cooldown = int(cooldown_override or 0) or int(
        merged.verification_cooldown_seconds or 0
    )
    return max(1, ttl), max(0, cooldown)


def validate_verification_window(ttl_seconds: int, cooldown_seconds: int) -> None:
    """校验有效期与冷却的取值（不合法时抛 ``ValueError``，由调用方转 422）。

    两条规则都不是凑数的：

    1. **有效期下限。** 60 秒以内用户根本来不及切换到邮箱复制验证码，表现为
       「刚点发送就说已过期」，而这种工单看起来像发信坏了，实际上配置写错了。
    2. **冷却必须短于有效期。** 否则用户拿到的验证码已经过期、却又被冷却锁住
       无法重新获取 —— 他在 ``冷却 - 有效期`` 这段时间里**完全无法注册**。
       这是纯配置就能触发的死锁，必须在保存时拦下。
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


def mail_delivery_summary(
    settings: StoreSettings, setting: StoreSetting | None
) -> dict:
    """给后台用的邮件配置概览。**绝不包含 SMTP 授权码明文**。"""
    merged = merge_mail_settings(settings, setting)
    ttl, cooldown = effective_verification_window(settings, setting)
    database_password = _text(getattr(setting, "smtp_password", ""))
    expose_override = getattr(setting, "expose_verification_code", None)

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
        #: 回显开关是三态：None=跟随环境变量。前端据此把下拉框停在「跟随环境变量」。
        "exposeVerificationCode": bool(merged.expose_verification_code),
        "exposeVerificationCodeFromDatabase": expose_override is not None,
        #: 当前配置下验证码邮件到底能不能真的发出去。这是整个区块最该一眼看到的信息：
        #: 「填了 SMTP 但授权码漏了」过去只会安静地退化成写日志，用户收不到邮件，
        #: 而界面上每一样看起来都填好了。
        "smtpReady": bool(merged.smtp_ready),
        "smtpMisconfigured": bool(merged.smtp_misconfigured),
        "deliveryEnabled": bool(merged.mail_delivery_enabled),
    }
