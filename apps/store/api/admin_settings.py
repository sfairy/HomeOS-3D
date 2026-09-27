"""运营后台的站点配置资源组：站点设置读取 / 更新，以及支付宝与邮件的连通性测试。
"""
from __future__ import annotations

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request, status

from apps.store.ops import site_settings as site_config
from apps.store.ops import mail_settings, mailer
from apps.store.core.deps import AdminAccount, DbSession, SettingsDep
from apps.store.payments import PROVIDER_NAMES, is_known_provider, normalize_provider_name
from apps.store.payments.base import PaymentError
from apps.store.payments.credentials import (
    alipay_credentials_summary,
    resolve_secret_input,
    validate_callback_url,
    validate_gateway_url,
    validate_private_key_text,
    validate_public_key_text,
)
from apps.store.core.models import (
    DEFAULT_SUPPORT_EMAIL,
    StoreSetting,
)
from apps.store.core.schemas import (
    AdminMailTestRequest,
    AdminSettingsRequest,
)
from apps.store.security.security import (
    is_valid_email,
    normalize_email,
    utcnow,
)  # noqa: F401

logger = logging.getLogger("apps.store.admin")


# 共享助手在 admin_shared.py；这里再导入一次，
from .admin_shared import (
    _admin_actor,
    _audit,
)

router = APIRouter()


# 站点配置
def _alipay_settings_payload(settings: SettingsDep, setting) -> dict:
    return alipay_credentials_summary(settings, setting)


def _mail_settings_payload(settings: SettingsDep, setting) -> dict:
    return mail_settings.mail_delivery_summary(settings, setting)


def _settings_response(setting, settings: SettingsDep) -> dict:
    """``GET/PUT /settings`` 的统一响应体。
    """
    return site_config.site_configuration_payload(
        setting, settings, include_credentials=True
    ) | {
        "referral": site_config.referral_settings_payload(setting),
        # 库里那一列的原始值：``None`` = 跟随环境变量（后台输入框显示为空）。
        "deviceReleaseCooldownSeconds": setting.device_release_cooldown_override,
        # 实际生效值。与原始值分开放：``None`` 时输入框是空的，运营需要看到
        "deviceReleaseCooldownEffectiveSeconds": site_config.resolve_device_release_cooldown(
            setting, settings
        ),
        "announcement": setting.announcement,
        #: 支付宝凭据概览（不含明文）。与 ``payment_provider`` 分开放：
        "alipay": _alipay_settings_payload(settings, setting),
        #: 注册邮箱验证码配置概览（不含 SMTP 授权码明文）。
        "mail": _mail_settings_payload(settings, setting),
    }


_NULL_MEANS_FOLLOW_ENV = frozenset(
    {
        # 验证码回显：NULL = 跟随环境变量，False = 生产上显式关掉。
        "expose_verification_code",
        # 解绑冷却：NULL = 跟随环境变量，0 = 显式不限间隔。
        "device_release_cooldown_override",
    }
)


@router.get("/settings")
def admin_get_settings(session: DbSession, _admin: AdminAccount, settings: SettingsDep) -> dict:
    setting = site_config.get_setting(session)
    return _settings_response(setting, settings)


@router.put("/settings")
def admin_update_settings(
    payload: AdminSettingsRequest,
    session: DbSession,
    admin: AdminAccount,
    settings: SettingsDep,
) -> dict:
    data = payload.model_dump(exclude_unset=True)
    mapping = {
        "site_name": "site_name",
        "site_title": "site_title",
        "description": "description",
        "announcement": "announcement",
        "support_email": "support_email",
        # logo_url 留空表示回到默认标识（见 site_settings.DEFAULT_LOGO_URL）
        "logo_url": "logo_url",
        # 留空 = 不显示部署块（与 logo_url 不同，这里**没有**可回落的默认地址）
        "deploy_base_url": "deploy_base_url",
        "maintenance_mode": "maintenance_mode",
        "maintenance_message": "maintenance_message",
        "payment_provider": "payment_provider",
        "payment_display_name": "payment_display_name",
        "payment_enabled": "payment_enabled",
        "payment_transaction_description": "payment_transaction_description",
        "referral_enabled": "referral_enabled",
        "referral_rate_percent": "referral_rate_percent",
        "referral_withdrawal_fee_percent": "referral_withdrawal_fee_percent",
        "referral_withdrawal_min_points": "referral_withdrawal_min_points",
        "device_release_cooldown_seconds": "device_release_cooldown_override",
        # ---- 注册邮箱验证码 ----
        "mail_mode": "mail_mode",
        "mail_from": "mail_from",
        "smtp_host": "smtp_host",
        "smtp_port": "smtp_port",
        "smtp_username": "smtp_username",
        "smtp_security": "smtp_security",
        "verification_ttl_seconds": "verification_ttl_seconds",
        "verification_cooldown_seconds": "verification_cooldown_seconds",
    }
    updates = {column: data[field] for field, column in mapping.items() if field in data}
    if "payment_provider" in updates:
        # 渠道名写错一个字符就会让商店静默切到模拟收银台（本地点一下就发码），
        candidate = updates["payment_provider"]
        if not is_known_provider(candidate):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"支付渠道「{candidate}」不受支持，可选值为 "
                    f"{'、'.join(PROVIDER_NAMES)}，留空表示跟随环境变量。"
                ),
            )
        updates["payment_provider"] = normalize_provider_name(candidate)
    if "logo_url" in updates:
        updates["logo_url"] = (
            str(updates["logo_url"] or "").strip() or site_config.DEFAULT_LOGO_URL
        )
    if "deploy_base_url" in updates:
        # 结尾斜杠在这里就去掉：前台按 ``<地址>/install.sh`` 拼接，留着它就是双斜杠。
        updates["deploy_base_url"] = str(updates["deploy_base_url"] or "").strip().rstrip("/")
    if "support_email" in updates:
        # 与 logo_url 同一口径：这个字段**没有「空着」这个状态**。
        updates["support_email"] = (
            str(updates["support_email"] or "").strip() or DEFAULT_SUPPORT_EMAIL
        )
    updates |= _alipay_settings_updates(data)
    updates |= _mail_settings_updates(data, current=site_config.get_setting(session), settings=settings)
    cleared = [
        key
        for key in _NULL_MEANS_FOLLOW_ENV
        if key in updates and updates[key] is None
    ]
    for key in cleared:
        del updates[key]
    setting = site_config.update_setting(session, **updates)
    if cleared:
        for key in cleared:
            setattr(setting, key, None)
        setting.updated_at = utcnow()
        session.flush()
    audited = sorted(set(updates) | set(cleared))
    _audit(session, _admin_actor(admin), "settings.update", "1", ",".join(audited))
    return _settings_response(setting, settings)


#: 支付宝的纯文本配置项（前端字段名 == 数据库列名，故只列一次）。留空即清空、跟随环境变量。
_ALIPAY_TEXT_FIELDS: tuple[str, ...] = (
    "alipay_app_id",
    "alipay_seller_id",
    "alipay_gateway_url",
    "alipay_notify_url",
    "alipay_return_url",
)

#: 回调地址的字段名 → 中文标签，仅用于报错文案。
_ALIPAY_CALLBACK_LABELS = {
    "alipay_notify_url": "异步通知地址",
    "alipay_return_url": "同步跳转地址",
}


def _alipay_settings_updates(data: dict) -> dict:
    """校验并归一化后台提交的支付宝凭据字段，返回待写入的 updates。
    """
    updates: dict = {}
    try:
        for field in _ALIPAY_TEXT_FIELDS:
            if field in data:
                updates[field] = str(data[field] or "").strip()
        if updates.get("alipay_gateway_url"):
            validate_gateway_url(updates["alipay_gateway_url"])
        for field, label in _ALIPAY_CALLBACK_LABELS.items():
            if updates.get(field):
                validate_callback_url(updates[field], label=label)

        private_key = resolve_secret_input(data.get("alipay_app_private_key"))
        if private_key is not None:
            if private_key:
                validate_private_key_text(private_key)
            updates["alipay_app_private_key"] = private_key

        public_key = resolve_secret_input(data.get("alipay_public_key"))
        if public_key is not None:
            if public_key:
                validate_public_key_text(public_key)
            updates["alipay_public_key"] = public_key

        if "alipay_sandbox" in data:
            updates["alipay_sandbox"] = bool(data["alipay_sandbox"])
    except PaymentError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)
        ) from error
    return updates


#: 邮件的纯文本配置项（前端字段名 == 数据库列名，故只列一次）。留空即清空、跟随环境变量。
_MAIL_TEXT_FIELDS: tuple[str, ...] = (
    "mail_from",
    "smtp_host",
    "smtp_username",
)


def _mail_settings_updates(data: dict, *, current: StoreSetting, settings: SettingsDep) -> dict:
    """校验并归一化后台提交的邮件 / 验证码字段，返回待写入的 updates。
    """
    updates: dict = {}
    for field in _MAIL_TEXT_FIELDS:
        if field in data:
            updates[field] = str(data[field] or "").strip()

    if "mail_mode" in data:
        mode = str(data["mail_mode"] or "").strip().lower()
        if mode and mode not in mail_settings.MAIL_MODES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"邮件投递方式「{mode}」不受支持，可选值为 "
                    f"{'、'.join(mail_settings.MAIL_MODES)}，留空表示跟随环境变量。"
                ),
            )
        updates["mail_mode"] = mode

    if "smtp_security" in data:
        security = str(data["smtp_security"] or "").strip().lower()
        if security and security not in mail_settings.SMTP_SECURITY_MODES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"SMTP 加密方式「{security}」不受支持，可选值为 "
                    f"{'、'.join(mail_settings.SMTP_SECURITY_MODES)}，留空表示跟随环境变量。"
                ),
            )
        updates["smtp_security"] = security

    if "smtp_port" in data:
        updates["smtp_port"] = int(data["smtp_port"] or 0)

    # 授权码：空串=清空、打码值/未提交=不改动、其它=新授权码。
    if data.get("smtp_clear_password"):
        updates["smtp_password"] = ""
    else:
        password = resolve_secret_input(data.get("smtp_password"))
        if password is not None:
            updates["smtp_password"] = password

    for field, column in (
        ("verification_ttl_seconds", "verification_ttl_seconds"),
        ("verification_cooldown_seconds", "verification_cooldown_seconds"),
    ):
        if field in data:
            updates[column] = int(data[field] or 0)

    # 三态回显开关：字段在请求里就代表运营做了选择，显式传 null 表示清回「跟随环境变量」
    if "expose_verification_code" in data:
        value = data["expose_verification_code"]
        updates["expose_verification_code"] = None if value is None else bool(value)

    _validate_verification_window(updates, current=current, settings=settings)
    return updates


def _validate_verification_window(
    updates: dict, *, current: StoreSetting, settings: SettingsDep
) -> None:
    """校验「有效期 / 冷却」的联动关系。
    """
    touched = {
        "verification_ttl_seconds",
        "verification_cooldown_seconds",
    } & set(updates)
    if not touched:
        return
    ttl, cooldown = mail_settings.effective_verification_window(
        settings,
        current,
        ttl_override=updates.get("verification_ttl_seconds"),
        cooldown_override=updates.get("verification_cooldown_seconds"),
    )
    try:
        mail_settings.validate_verification_window(ttl, cooldown)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)
        ) from error


@router.post("/settings/alipay/test")
def admin_test_alipay_credentials(
    request: Request,
    session: DbSession,
    admin: AdminAccount,
    settings: SettingsDep,
) -> dict:
    """测试**当前支付渠道**的凭据与回调配置，逐项给出结论。
    """
    setting = site_config.get_setting(session)
    try:
        provider = request.app.state.resolve_payment_provider(setting)
    except PaymentError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    diagnose = getattr(provider, "diagnose_credentials", None)
    if diagnose is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="当前支付渠道不支持凭据自检，请把支付渠道切换为 alipay 后再试。",
        )

    # 回调地址取**实际生效**的那一份（后台配置 / 环境变量 / 按 STORE_BASE_URL 推导），
    base_url = settings.public_base_url
    notify = provider.notify_url(settings, base_url) if hasattr(provider, "notify_url") else ""
    callback = provider.return_url(settings, base_url) if hasattr(provider, "return_url") else ""

    ok, message, checks = diagnose(settings, notify_url=notify, return_url=callback)
    #: 把探测结论也写进审核日志：凭据是否通过验证是排障时的关键事实，
    _audit(
        session,
        _admin_actor(admin),
        "settings.alipay_probe",
        "1",
        f"{'通过' if ok else '未通过'}：{message}"[:255],
    )
    return {
        "ok": ok,
        "message": message,
        "checks": checks,
        "provider": getattr(provider, "name", ""),
        "sandbox": bool(setting.alipay_sandbox),
    }


@router.post("/settings/mail/test")
def admin_test_mail_delivery(
    payload: AdminMailTestRequest,
    session: DbSession,
    admin: AdminAccount,
    settings: SettingsDep,
) -> dict:
    """按当前（已保存）邮件配置做一次诊断；给了收件人就再真发一封。
    """
    email = normalize_email(payload.email or "")
    if email and not is_valid_email(email):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="请输入有效的邮箱地址。"
        )

    setting = site_config.get_setting(session)
    #: 必须用合并后的配置：直接拿 ``app.state.settings`` 只会读到环境变量，
    merged = mail_settings.merge_mail_settings(settings, setting)
    diagnosed, checks = mailer.diagnose_mail(merged)

    if not email:
        failures = [item for item in checks if item["level"] == "fail"]
        if diagnosed:
            message = "连接诊断全部通过（未发送邮件）。填写收件邮箱可以再验证一次真实投递。"
        elif failures:
            message = "连接诊断未通过：" + "；".join(
                f"{item['label']} —— {item['detail']}" for item in failures
            )
        else:
            message = (
                f"未做真实投递：当前投递方式是 {merged.mail_mode}"
                "（验证码不会离开服务器），因此只报告了配置层面的结论。"
            )
        _audit(
            session,
            _admin_actor(admin),
            "settings.mail_probe",
            "1",
            f"仅连接诊断：{'通过' if diagnosed else '未通过'}"[:255],
        )
        return {
            "ok": diagnosed,
            "email": "",
            "mode": merged.mail_mode,
            "attempts": 0,
            "message": message,
            "checks": checks,
        }

    result = mailer.send_test_email(settings, setting, email=email)

    if result.delivered:
        message = f"测试邮件已通过 SMTP 投递到 {email}（第 {result.attempts} 次尝试成功）。"
    elif merged.smtp_misconfigured:
        message = (
            f"未真正发信：投递方式选了 smtp，但凭据不全（缺服务器地址或授权码），"
            f"本次已退化为 {result.mode} 模式。请补全后重试。"
        )
    elif merged.mail_mode != "smtp":
        message = (
            f"未真正发信：当前投递方式是 {merged.mail_mode}（只写日志"
            f"{'并回显' if merged.mail_mode == 'echo' else ''}），验证码不会离开服务器。"
            "要真正发信请把投递方式改为 smtp。"
        )
    else:
        message = f"发信失败（已尝试 {result.attempts} 次）：{result.error or '未返回具体原因'}"

    #: 结论写进审核日志：和支付宝探活同理，「谁在什么时候确认过邮件链路可用」
    _audit(
        session,
        _admin_actor(admin),
        "settings.mail_probe",
        "1",
        f"{email}：{'已投递' if result.delivered else '未投递'}（{result.mode}）"[:255],
    )
    return {
        #: 带收件人时以**真实投递结果**为准：此时它才是「这条路通不通」的直接证据，
        "ok": result.delivered,
        "email": email,
        "mode": result.mode,
        "attempts": result.attempts,
        "message": message,
        "checks": checks,
    }


# 账号
