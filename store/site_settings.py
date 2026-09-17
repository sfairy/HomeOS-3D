"""站点级运行时配置（``store_settings`` 单例）的读写与序列化。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from store.config import StoreSettings
from store.models import DEFAULT_SUPPORT_EMAIL, StoreSetting
from store.payments.credentials import merge_alipay_settings
from store.security import iso, utcnow

#: 默认品牌标识。必须与 ``models.StoreSetting.logo_url`` 的默认值一致：
#: 后台把该字段留空时回落到这里，而不是写一个空串进库（否则页面上
#: ``<img src="">`` 会让整个标识位塌掉）。
DEFAULT_LOGO_URL = "/store-static/homeos-mark.svg"


def resolve_device_release_cooldown(setting: StoreSetting | None, settings: StoreSettings) -> int:
    """解绑冷却秒数的**唯一**取值口径：站点配置优先，未配置时回落到环境变量。

    这个函数存在的理由：冷却值曾经有三处实现 —— 账号中心接口读站点配置，
    而客户端协议侧（``LicenseAuthority.release_remaining_seconds``）只读环境变量。
    运营在后台把冷却从 7 天改成 0（关掉限制），账号中心立刻放行，但客户端
    仍然被按 7 天挡住，且报错里的剩余秒数与后台显示完全对不上。
    """
    raw = setting.device_release_cooldown_seconds if setting is not None else None
    if raw is None:
        raw = settings.device_release_cooldown_seconds
    return max(0, int(raw or 0))


def effective_device_release_cooldown(session: Session, settings: StoreSettings) -> int:
    """按会话内的站点配置解析冷却秒数（供没有现成 setting 对象的调用方使用）。"""
    return resolve_device_release_cooldown(get_setting(session), settings)


def get_setting(session: Session) -> StoreSetting:
    """读取单例配置，不存在时创建默认值。"""
    setting = session.get(StoreSetting, 1)
    if setting is None:
        setting = StoreSetting(id=1)
        session.add(setting)
        session.flush()
    return setting


def update_setting(session: Session, **fields) -> StoreSetting:
    setting = get_setting(session)
    for key, value in fields.items():
        if value is None or not hasattr(setting, key):
            continue
        setattr(setting, key, value)
    setting.updated_at = utcnow()
    session.flush()
    return setting


def store_configuration_payload(setting: StoreSetting) -> dict:
    return {
        "siteName": setting.site_name,
        "siteTitle": setting.site_title,
        "description": setting.description,
        "announcement": setting.announcement,
        # 与 logo_url 同款口径：留空回落到默认值，而不是把空串报给前端 ——
        # 空串在页面上表现为「这个站没有客服邮箱」，而实际生效的默认值一直在那儿。
        "supportEmail": setting.support_email or DEFAULT_SUPPORT_EMAIL,
        "logoUrl": setting.logo_url,
        "maintenanceMode": bool(setting.maintenance_mode),
        "maintenanceMessage": setting.maintenance_message,
        "updatedAt": iso(setting.updated_at),
    }


def _mask_secret(configured: bool) -> bool:
    return bool(configured)


def payment_configuration_payload(
    setting: StoreSetting, settings: StoreSettings, *, include_credentials: bool
) -> dict:
    """支付配置的序列化。

    ``include_credentials`` 是**必填的关键字参数**，不是默认值 —— 这个字段决定了
    要不要把商户凭据信息放进响应里，而两份响应的受众完全不同：

    - 后台（``/store-admin/v1/settings``）需要 ``appId`` / 网关 / 「密钥配没配」，
      否则运营没法确认自己填的东西到底有没有生效；
    - 前台（``/store/v1/configuration``）是**匿名可读**的，把商户号、网关地址、
      「密钥尚未配置」这类信息报出去没有任何用处，只是白送一份侦察材料
      （攻击者据此判断这个站值不值得下手，以及支付是否处于未配置的脆弱状态）。

    所以这里不做「默认给全量、需要时再裁剪」：那种默认迟早会有人在新增调用点时
    忘记裁剪，而且忘了也不会有任何报错。必填参数让每个调用点都必须表态。
    """
    # 空串 = 尚未配置渠道（不是 mock）。旧写法 ``or "mock"`` 会把「没配渠道」当成
    # 模拟收银台，于是前台报「支付可用」、实际点一下就白送授权。
    provider = (setting.payment_provider or settings.payment_provider or "").lower()
    if provider == "alipay":
        # 必须用**合并站点配置后**的凭据（与 ``resolve_provider`` 注入 provider 的是
        # 同一份）。这里过去读的是启动时的 ``settings``，也就是只有环境变量：
        # 后台填了商户号/密钥的部署里 ``settings.alipay_app_id`` 是空的，于是
        # ``configured`` / ``available`` 报 false —— 前台看到「支付不可用」，
        # 而真实支付通道其实是好的；后台也看不到自己填的值到底生效没有。
        merged = merge_alipay_settings(settings, setting)
        app_id = merged.alipay_app_id
        # 密钥可能来自文件而不是内联环境变量，这里必须用解析后的值
        private_configured = bool(merged.alipay_private_key_text)
        public_configured = bool(merged.alipay_public_key_text)
        gateway = merged.alipay_gateway_url
        display_name = setting.payment_display_name or "支付宝"
        icon = "alipay"
        channel_ready = bool(app_id) and private_configured and public_configured
    elif provider == "mock":
        app_id = ""
        private_configured = True
        public_configured = True
        gateway = ""
        display_name = setting.payment_display_name or "模拟支付"
        icon = "mock"
        # 模拟收银台只有在服务端显式打开时才算「可用」：否则下单会 503，
        # 前台不该显示成一个能付款的渠道。
        channel_ready = bool(getattr(settings, "allow_mock_payments", False))
    else:
        # 没配渠道：如实报「不可用」，让前台把支付入口收起来，而不是给出一个
        # 点了会失败的按钮（更不该悄悄变成模拟收银台）。
        app_id = ""
        private_configured = False
        public_configured = False
        gateway = ""
        display_name = setting.payment_display_name or "未配置支付渠道"
        icon = "mock"
        channel_ready = False

    configured = bool(setting.payment_enabled) and channel_ready
    payload = {
        "provider": provider,
        "enabled": bool(setting.payment_enabled),
        "displayName": display_name,
        "icon": icon,
        "transactionDescription": setting.payment_transaction_description
        or settings.alipay_transaction_description,
        "configured": configured,
        "available": configured,
        "updatedAt": iso(setting.updated_at),
    }
    if include_credentials:
        payload |= {
            "appId": app_id,
            "applicationPrivateKeyConfigured": _mask_secret(private_configured),
            "alipayPublicKeyConfigured": _mask_secret(public_configured),
            "gatewayUrl": gateway,
            #: 交易标题的「来源」标记：留空即跟随环境变量。前端只回填来源为后台的
            #: 值，否则运营随手保存一次站点名就会把环境变量的值固化进数据库，
            #: 之后改环境变量再也不生效（与 ``alipay_credentials_summary`` 同款处理）。
            "transactionDescriptionFromDatabase": bool(
                (setting.payment_transaction_description or "").strip()
            ),
            #: 模拟收银台在服务端是否被显式开启（STORE_ALLOW_MOCK_PAYMENTS）。
            #: 后台要据此把「mock 现在是能下单还是点一下就 503」说清楚 —— 只看
            #: 下拉框选了什么是不够的。
            "mockPaymentsAllowed": bool(getattr(settings, "allow_mock_payments", False)),
        }
    return payload


def site_configuration_payload(
    setting: StoreSetting, settings: StoreSettings, *, include_credentials: bool
) -> dict:
    return {
        "store": store_configuration_payload(setting),
        "payment": payment_configuration_payload(
            setting, settings, include_credentials=include_credentials
        ),
    }


def referral_settings_payload(setting: StoreSetting) -> dict:
    return {
        "enabled": bool(setting.referral_enabled),
        "ratePercent": float(setting.referral_rate_percent or 0.0),
        "withdrawalFeePercent": float(setting.referral_withdrawal_fee_percent or 0.0),
        "withdrawalMinPoints": float(setting.referral_withdrawal_min_points or 0.0),
    }
