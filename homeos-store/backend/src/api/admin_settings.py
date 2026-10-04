"""运营后台的站点配置资源组：站点设置读取 / 更新，以及支付宝与邮件的连通性测试。
"""
from __future__ import annotations

import json
import logging
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request, status

from ..config import ALIPAY_ORDER_TTL_FLOOR_SECONDS
from ..core.deps import AdminAccount, DbSession, SettingsDep
from ..core.models import (
    DEFAULT_SUPPORT_EMAIL,
    StoreSetting,
)
from ..core.schemas import (
    AdminMailTestRequest,
    AdminSettingsRequest,
)
from ..ops import mail_settings, mailer
from ..ops import site_settings as site_config
from ..payments import (
    PROVIDER_NAMES,
    enabled_channel_names,
    is_known_provider,
    normalize_provider_name,
)
from ..payments import urls as payment_urls
from ..payments import wechat_signing as signing
from ..payments.base import PaymentError
from ..payments.credentials import (
    alipay_credentials_summary,
    resolve_secret_input,
    validate_callback_url,
    validate_gateway_url,
    validate_private_key_text,
    validate_public_key_text,
    wechat_credentials_summary,
)
from ..security.security import (
    is_valid_email,
    normalize_email,
    utcnow,
)

logger = logging.getLogger("src.admin")


from .admin_shared import (
    _admin_actor,
    _audit,
)

router = APIRouter()


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
        "deviceReleaseCooldownSeconds": setting.device_release_cooldown_override,
        "deviceReleaseCooldownEffectiveSeconds": site_config.resolve_device_release_cooldown(
            setting, settings
        ),
        "announcement": setting.announcement,
        "alipay": _alipay_settings_payload(settings, setting),
        "wechat": wechat_credentials_summary(settings, setting),
        "channels": list(enabled_channel_names(setting, settings)),
        "mail": _mail_settings_payload(settings, setting),
        "orderTtlSeconds": int(settings.order_ttl_seconds or 0),
        "orderTtlRecommendedSeconds": ALIPAY_ORDER_TTL_FLOOR_SECONDS,
        "deliveryEmailEnabled": bool(
            getattr(setting, "delivery_email_enabled", True)
        ),
    }


_NULL_MEANS_FOLLOW_ENV = frozenset(
    {
        "device_release_cooldown_override",
    }
)


_PLACEHOLDER_HOSTS = frozenset(
    {"example.com", "www.example.com", "xx.com", "www.xx.com", "your-domain.com", "domain.com"}
)


def _validate_deploy_base_url(value: str) -> None:
    """校验一键部署的脚本托管地址。空串合法（表示整块不显示）。

    这里只拦「明显不能用」的写法。localhost / 内网地址**允许**保存：本地联调与
    内网部署是真实存在的用法（支付宝回调地址另有更严的校验，因为那是渠道要来访问的）。
    """
    if not value:
        return
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="一键部署脚本地址必须是完整的 http(s):// 地址，留空表示不显示这块。",
        )
    host = (parsed.hostname or "").strip().lower()
    if host in _PLACEHOLDER_HOSTS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                f"「{host}」是文档占位域名，不是你的服务器。请填写真正托管 install.sh 的地址，"
                "或留空以隐藏「一键部署」整块。"
            ),
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
        "logo_url": "logo_url",
        "deploy_base_url": "deploy_base_url",
        "maintenance_mode": "maintenance_mode",
        "maintenance_message": "maintenance_message",
        "payment_provider": "payment_provider",
        "payment_channels": "payment_channels_json",
        "payment_enabled": "payment_enabled",
        "payment_transaction_description": "payment_transaction_description",
        "referral_enabled": "referral_enabled",
        "referral_rate_percent": "referral_rate_percent",
        "referral_withdrawal_fee_percent": "referral_withdrawal_fee_percent",
        "referral_withdrawal_min_points": "referral_withdrawal_min_points",
        "device_release_cooldown_seconds": "device_release_cooldown_override",
        "mail_mode": "mail_mode",
        "mail_from": "mail_from",
        "smtp_host": "smtp_host",
        "smtp_port": "smtp_port",
        "smtp_username": "smtp_username",
        "smtp_security": "smtp_security",
        "verification_ttl_seconds": "verification_ttl_seconds",
        "verification_cooldown_seconds": "verification_cooldown_seconds",
        "verification_global_hourly_limit": "verification_global_hourly_limit",
        "delivery_email_enabled": "delivery_email_enabled",
    }
    updates = {column: data[field] for field, column in mapping.items() if field in data}
    if "payment_channels_json" in updates:
        raw = updates["payment_channels_json"] or []
        if not isinstance(raw, list):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="支付渠道清单必须是数组。",
            )
        names: list[str] = []
        for item in raw:
            name = normalize_provider_name(str(item))
            if not is_known_provider(name) or not name:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=(
                        f"不支持的支付渠道「{item}」："
                        f"可选 {'、'.join(PROVIDER_NAMES)}。"
                    ),
                )
            if name not in names:
                names.append(name)
        updates["payment_channels_json"] = json.dumps(names, ensure_ascii=False)
    if "payment_provider" in updates:
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
    if "site_name" in updates:
        problem = mailer.header_text_error(
            str(updates["site_name"] or ""), label="站点名称", allow_empty=True
        )
        if problem:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=problem
            )
    if "delivery_email_enabled" in updates:
        updates["delivery_email_enabled"] = bool(updates["delivery_email_enabled"])
    if "deploy_base_url" in updates:
        deploy_url = str(updates["deploy_base_url"] or "").strip().rstrip("/")
        _validate_deploy_base_url(deploy_url)
        updates["deploy_base_url"] = deploy_url
    if "support_email" in updates:
        updates["support_email"] = (
            str(updates["support_email"] or "").strip() or DEFAULT_SUPPORT_EMAIL
        )
    updates |= _alipay_settings_updates(data)
    updates |= _wechat_settings_updates(data)
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


_ALIPAY_TEXT_FIELDS: tuple[str, ...] = (
    "alipay_app_id",
    "alipay_seller_id",
    "alipay_gateway_url",
    "alipay_notify_url",
    "alipay_return_url",
)

_ALIPAY_CALLBACK_LABELS = {
    "alipay_notify_url": "异步通知地址",
    "alipay_return_url": "同步跳转地址",
}


_WECHAT_TEXT_FIELDS: tuple[str, ...] = (
    "wechat_mch_id",
    "wechat_app_id",
    "wechat_merchant_serial_no",
    "wechat_platform_public_key_id",
    "wechat_gateway_url",
    "wechat_notify_url",
)

_WECHAT_SECRET_FIELDS: tuple[str, ...] = (
    "wechat_api_v3_key",
    "wechat_merchant_private_key",
    "wechat_platform_public_key",
)


def _wechat_settings_updates(data: dict) -> dict:
    """校验并归一化后台提交的微信支付字段，返回待写入的 updates。

    校验放在这里而不是等到下单：APIv3 密钥长度不对、私钥解不开、公钥填成了证书以外的东西，
    这三件事都会在**顾客付款那一刻**才炸，而且报的是「签名错误」这种看不出所以然的话。
    """
    updates: dict = {}

    for field in _WECHAT_TEXT_FIELDS:
        if field in data:
            updates[field] = str(data.get(field) or "").strip()

    gateway = updates.get("wechat_gateway_url")
    if gateway:
        if not gateway.lower().startswith("https://"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="微信支付网关必须以 https:// 开头。",
            )
        if "?" in gateway or "#" in gateway:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="微信支付网关不能带查询参数，只填到域名（如 https://api.mch.weixin.qq.com）。",
            )

    serial = updates.get("wechat_merchant_serial_no")
    if serial:
        problem = signing.merchant_serial_no_error(serial)
        if problem:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=problem
            )
        updates["wechat_merchant_serial_no"] = serial.upper()

    notify = updates.get("wechat_notify_url")
    if notify:
        try:
            payment_urls.validate_callback_url(
                notify, label="微信异步通知地址", channel="微信支付"
            )
        except PaymentError as error:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)
            ) from error

    for field in _WECHAT_SECRET_FIELDS:
        if field not in data:
            continue
        value = resolve_secret_input(data.get(field))
        if value is None:
            continue
        updates[field] = value

    api_v3_key = updates.get("wechat_api_v3_key")
    if api_v3_key:
        problem = signing.api_v3_key_error(api_v3_key)
        if problem:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=problem
            )

    private_key = updates.get("wechat_merchant_private_key")
    if private_key:
        problem = signing.merchant_private_key_error(private_key)
        if problem:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=problem
            )

    public_key = updates.get("wechat_platform_public_key")
    if public_key:
        problem = signing.platform_public_key_error(public_key)
        if problem:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=problem
            )

    return updates

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

    except PaymentError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)
        ) from error
    return updates


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

    if "mail_from" in updates:
        problem = mailer.mail_from_error(updates["mail_from"])
        if problem:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=problem
            )

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

    if data.get("smtp_clear_password"):
        updates["smtp_password"] = ""
    else:
        password = resolve_secret_input(data.get("smtp_password"))
        if password is not None:
            updates["smtp_password"] = password

    for field, column in (
        ("verification_ttl_seconds", "verification_ttl_seconds"),
        ("verification_cooldown_seconds", "verification_cooldown_seconds"),
        ("verification_global_hourly_limit", "verification_global_hourly_limit"),
    ):
        if field in data:
            updates[column] = int(data[field] or 0)

    global_limit = int(updates.get("verification_global_hourly_limit", 0) or 0)
    if global_limit and not 1 <= global_limit <= 100_000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="全站小时上限要在 1 ~ 100000 之间，或留 0 表示跟随环境变量。",
        )

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
    channel: str | None = None,
) -> dict:
    """测试某个支付渠道的凭据与回调配置，逐项给出结论。

    ``channel`` 留空＝当前默认渠道；显式指定时按名字解析 ——
    后台每个渠道各有「测试凭据」按钮，测的必须是**它自己**那套凭据，
    而不是「现在默认收款的是哪个」。
    """
    setting = site_config.get_setting(session)
    requested = normalize_provider_name(channel) or None
    if requested is not None and not is_known_provider(requested):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"不支持的支付渠道「{channel}」。",
        )
    try:
        provider = request.app.state.resolve_payment_provider(setting, name=requested)
    except PaymentError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    diagnose = getattr(provider, "diagnose_credentials", None)
    if diagnose is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="当前支付渠道不支持凭据自检，请把支付渠道切换为 alipay 后再试。",
        )

    base_url = settings.public_base_url
    notify = provider.notify_url(settings, base_url) if hasattr(provider, "notify_url") else ""
    callback = provider.return_url(settings, base_url) if hasattr(provider, "return_url") else ""

    ok, message, checks = diagnose(settings, notify_url=notify, return_url=callback)
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
            f"未真正发信：当前投递方式是 {merged.mail_mode}（只写日志），"
            "验证码不会离开服务器。要真正发信请把投递方式改为 smtp。"
        )
    else:
        message = f"发信失败（已尝试 {result.attempts} 次）：{result.error or '未返回具体原因'}"

    _audit(
        session,
        _admin_actor(admin),
        "settings.mail_probe",
        "1",
        f"{email}：{'已投递' if result.delivered else '未投递'}（{result.mode}）"[:255],
    )
    return {
        "ok": result.delivered,
        "email": email,
        "mode": result.mode,
        "attempts": result.attempts,
        "message": message,
        "checks": checks,
    }


