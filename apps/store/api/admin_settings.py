"""运营后台的站点配置资源组：站点设置读取 / 更新，以及支付宝与邮件的连通性测试。
"""
from __future__ import annotations

from __future__ import annotations

import json
import logging
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request, status

from apps.store.config import ALIPAY_ORDER_TTL_FLOOR_SECONDS
from apps.store.ops import site_settings as site_config
from apps.store.ops import mail_settings, mailer
from apps.store.core.deps import AdminAccount, DbSession, SettingsDep
from apps.store.payments import (
    PROVIDER_NAMES,
    enabled_channel_names,
    is_known_provider,
    normalize_provider_name,
)
from apps.store.payments.base import PaymentError
from apps.store.payments import urls as payment_urls
from apps.store.payments import wechat_signing as signing
from apps.store.payments.credentials import (
    alipay_credentials_summary,
    resolve_secret_input,
    validate_callback_url,
    validate_gateway_url,
    validate_private_key_text,
    validate_public_key_text,
    wechat_credentials_summary,
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
        #: 微信支付的凭据概览（同样只有打码值与布尔，没有明文）。
        "wechat": wechat_credentials_summary(settings, setting),
        #: **已启用**的渠道清单。后台据此勾选复选框；前台据此决定要不要让顾客选。
        "channels": list(enabled_channel_names(setting, settings)),
        #: 注册邮箱验证码配置概览（不含 SMTP 授权码明文）。
        "mail": _mail_settings_payload(settings, setting),
        #: 生效的订单有效期（秒）。后台据此提示「与支付宝二维码寿命不匹配」——
        #: 那个不匹配的表现是「用户扫码稍慢就变成复活单，每笔都要人工核对」。
        "orderTtlSeconds": int(settings.order_ttl_seconds or 0),
        # 支付宝二维码在渠道侧约 2 小时有效，低于这个阈值就值得提示。
        "orderTtlRecommendedSeconds": ALIPAY_ORDER_TTL_FLOOR_SECONDS,
        #: 发货邮件（支付成功后把激活码发到买家邮箱）总开关。
        "deliveryEmailEnabled": bool(
            getattr(setting, "delivery_email_enabled", True)
        ),
    }


_NULL_MEANS_FOLLOW_ENV = frozenset(
    {
        # 验证码回显：NULL = 跟随环境变量，False = 生产上显式关掉。
        # 解绑冷却：NULL = 跟随环境变量，0 = 显式不限间隔。
        "device_release_cooldown_override",
    }
)


#: 占位域名白名单：这些地址能保存进库，但前台只会把整块「一键部署」藏掉 ——
#: 一条 curl 到 example.com 的命令比没有命令更糟，用户会真的去执行它。
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
        # logo_url 留空表示回到默认标识（见 site_settings.DEFAULT_LOGO_URL）
        "logo_url": "logo_url",
        # 留空 = 不显示部署块（与 logo_url 不同，这里**没有**可回落的默认地址）
        "deploy_base_url": "deploy_base_url",
        "maintenance_mode": "maintenance_mode",
        "maintenance_message": "maintenance_message",
        "payment_provider": "payment_provider",
        "payment_display_name": "payment_display_name",
        # 启用的渠道清单（JSON 数组）。空数组 = 跟随 payment_provider 的单渠道语义。
        "payment_channels": "payment_channels_json",
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
        "verification_global_hourly_limit": "verification_global_hourly_limit",
        # 发货邮件开关：支付成功后是否把激活码发到买家邮箱（默认开）。
        "delivery_email_enabled": "delivery_email_enabled",
    }
    updates = {column: data[field] for field, column in mapping.items() if field in data}
    if "payment_channels_json" in updates:
        # 渠道清单直接来自复选框：逐个核对是受支持的渠道，写错一个字符就会让前台
        # 画出一个点下去 400 的按钮。存成 JSON 数组（``["alipay","wechat"]``）。
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
        # 渠道名写错一个字符就会让商店落到一个不存在的渠道（下单 503），
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
    if "payment_display_name" in updates:
        # 「模拟支付」已经不是一个存在的渠道。把它写进显示名，顾客会在二维码弹窗上
        # 看到「模拟支付」而实际要付真钱 —— 保存时就拦住（读取侧另有归一，见
        # ops/site_settings.py 的 RETIRED_DISPLAY_NAMES）。
        name = str(updates["payment_display_name"] or "").strip()
        if name in site_config.RETIRED_DISPLAY_NAMES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"支付显示名不能是「{name}」：模拟收银台已删除，这个渠道不存在。"
                    "留空会用「支付宝」。"
                ),
            )
        updates["payment_display_name"] = name
    if "site_name" in updates:
        # 站点名会进邮件主题。空值仍然允许（发信时回落到默认名），但换行必须拒掉。
        problem = mailer.header_text_error(
            str(updates["site_name"] or ""), label="站点名称", allow_empty=True
        )
        if problem:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=problem
            )
    if "delivery_email_enabled" in updates:
        # 布尔：前台可能传任意 JSON，显式归一，避免把字符串 "false" 存成真值。
        updates["delivery_email_enabled"] = bool(updates["delivery_email_enabled"])
    if "deploy_base_url" in updates:
        # 结尾斜杠在这里就去掉：前台按 <地址>/install.sh 拼接，留着它就是双斜杠。
        deploy_url = str(updates["deploy_base_url"] or "").strip().rstrip("/")
        _validate_deploy_base_url(deploy_url)
        updates["deploy_base_url"] = deploy_url
    if "support_email" in updates:
        # 与 logo_url 同一口径：这个字段**没有「空着」这个状态**。
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


#: 微信支付的纯文本配置项（前端字段名 == 数据库列名，故只列一次）。留空即清空、跟随环境变量。
_WECHAT_TEXT_FIELDS: tuple[str, ...] = (
    "wechat_mch_id",
    "wechat_app_id",
    "wechat_merchant_serial_no",
    "wechat_platform_public_key_id",
    "wechat_gateway_url",
    "wechat_notify_url",
)

#: 需要按「密钥」处理（允许打码值回填、单独清除）的字段。
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

    # 网关只允许 https：微信不存在 http 网关，写了也是打不通。
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
        # 归一成大写：微信自己回的是大写，人工抄进来的常常是小写。
        updates["wechat_merchant_serial_no"] = serial.upper()

    notify = updates.get("wechat_notify_url")
    if notify:
        #: 地址校验抛的是 payments 层的 ``PaymentError``，必须在这里翻译成 422 ——
        #: 不翻译的话它会被当成未处理异常变成 500，运营看到的是「服务器错误」
        #: 而不是「这个地址不能填」。
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
            # 打码值原样回填：说明运营没改它，保持库里既有的值。
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

        # 沙箱开关已删除：只有生产网关可配。历史请求里带的 alipaySandbox 会被忽略。
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

    if "mail_from" in updates:
        # 发件人会进邮件头。带换行时 email 库会**在构造阶段抛 ValueError**，而那时
        # 已经在给用户发验证码的路上了 —— 表现是「点获取验证码 → 服务器内部错误」。
        # 在这里拦下来，配错的人当场就知道。
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
        ("verification_global_hourly_limit", "verification_global_hourly_limit"),
    ):
        if field in data:
            updates[column] = int(data[field] or 0)

    global_limit = int(updates.get("verification_global_hourly_limit", 0) or 0)
    if global_limit and not 1 <= global_limit <= 100_000:
        # 0 是合法的（= 跟随环境变量）；其余取值与 config.py 的范围校验同一口径。
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="全站小时上限要在 1 ~ 100000 之间，或留 0 表示跟随环境变量。",
        )

    # 三态回显开关：字段在请求里就代表运营做了选择，显式传 null 表示清回「跟随环境变量」
    # 验证码回显开关（expose_verification_code）已整块删除，见 config.py 的说明：
    # 它依赖「请求来自本机」这道判定，部署形态一变就可能失效，失效即任何人都能读码。

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

    ``channel`` 留空＝当前默认渠道（历史行为）；显式指定时按名字解析 ——
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
            f"未真正发信：当前投递方式是 {merged.mail_mode}（只写日志），"
            "验证码不会离开服务器。要真正发信请把投递方式改为 smtp。"
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
