"""站点级运行时配置（``store_settings`` 单例）的读写与序列化。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from store.config import StoreSettings
from store.core.models import DEFAULT_SUPPORT_EMAIL, StoreSetting
from store.payments.credentials import merge_alipay_settings
from store.security.security import iso, utcnow

#: 默认品牌标识。必须与 ``models.StoreSetting.logo_url`` 的默认值一致：该字段留空时
#: 回落到这里，而不是写空串进库（否则 ``<img src="">`` 会让标识位塌掉）。
DEFAULT_LOGO_URL = "/store-static/homeos-mark.svg"

#: 账号中心「一键部署」的脚本清单（标签, 相对基础地址的路径）。目前只有官方源一条 ——
#: 保留成清单是为了多一条时前端不必改结构。
#: 脚本名是这套部署的对外契约，只写在这里：前端再存一份的话，改动时必有一侧漏掉，
#: 而漏掉的症状是「页面上的命令 curl 出来是个 404」，很难从界面上看出来。
DEPLOY_SCRIPTS: tuple[tuple[str, str], ...] = (
    ("OFFICIAL-SCRIPT（官方源）", "install.sh"),
)


def _deploy_base_url(setting: StoreSetting) -> str:
    """部署脚本地址的唯一口径：去空白、去结尾斜杠。

    结尾斜杠必须去掉：下面按 ``<地址>/install.sh`` 拼接，留着它命令就成了双斜杠。
    存储层不强制（后台可能手粘带斜杠的地址），所以**读取侧**以本函数为唯一口径；
    写入路径（``api/admin.py``）也顺手规范化一次，让落在库里的值本身就是干净的。
    """
    return (setting.deploy_base_url or "").strip().rstrip("/")


def resolve_device_release_cooldown(setting: StoreSetting | None, settings: StoreSettings) -> int:
    """解绑冷却秒数的**唯一**取值口径：站点配置优先，未配置时回落到环境变量。

    口径必须唯一：账号中心与客户端协议侧各读一份配置，会出现后台改成 0 后客户端
    仍被按旧值挡住、报错里的剩余秒数与后台显示对不上。

    「未配置」是 ``NULL``，不是某个具体秒数（``0`` 表示显式不限间隔）。这一点以前
    在库里表达不出来：旧列是 NOT NULL 且把默认值写成了 28800，于是 ``raw is None``
    永远不成立、环境变量一次都进不来 —— 见 ``ops.cooldown_migration``。
    """
    raw = setting.device_release_cooldown_override if setting is not None else None
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
    deploy_base = _deploy_base_url(setting)
    return {
        "siteName": setting.site_name,
        "siteTitle": setting.site_title,
        "description": setting.description,
        "announcement": setting.announcement,
        # 与 logo_url 同款口径：留空回落到默认值，而不是把空串报给前端（空串在页面上
        # 表现为「这个站没有客服邮箱」，而生效的默认值一直在那儿）。
        "supportEmail": setting.support_email or DEFAULT_SUPPORT_EMAIL,
        "logoUrl": setting.logo_url,
        #: 账号中心「一键部署」区块。基础地址由后台配置，未配置时 deployScripts 为空、
        #: 前台整块不渲染（没有合理默认地址可回落）。
        "deployBaseUrl": deploy_base,
        "deployScripts": [
            {"label": label, "command": f"curl -sSL {deploy_base}/{path} | bash"}
            for label, path in DEPLOY_SCRIPTS
        ]
        if deploy_base
        else [],
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

    ``include_credentials`` 是**必填的关键字参数**：前台（匿名可读）有它就成了白送
    侦察材料，后台则需要看到 ``appId``/网关/「密钥配没配」。必填而非默认 True，是
    为了让每个调用点都必须表态。
    """
    # 空串 = 尚未配置渠道，**不是** mock：把「没配渠道」当成模拟收银台会让前台报
    # 「支付可用」，实际点一下就白送授权。
    provider = (setting.payment_provider or settings.payment_provider or "").lower()
    if provider == "alipay":
        # 必须用**合并站点配置后**的凭据（与 ``resolve_provider`` 注入的同一份）。只读启动时
        # 的 ``settings`` 等于只看环境变量，后台填了商户号的部署会误报「支付不可用」。
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
        # 模拟收银台只有服务端显式打开才算「可用」：否则下单会 503。
        channel_ready = bool(getattr(settings, "allow_mock_payments", False))
    else:
        # 没配渠道：如实报「不可用」，让前台收起支付入口，而不是给一个点了会失败的按钮。
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
            #: 交易标题的「来源」标记：留空即跟随环境变量，前端只回填来源为后台的值
            #: （否则运营随手保存一次就会把它固化进库，之后改环境变量再也不生效）。
            "transactionDescriptionFromDatabase": bool(
                (setting.payment_transaction_description or "").strip()
            ),
            #: 模拟收银台在服务端是否被显式开启（STORE_ALLOW_MOCK_PAYMENTS）。后台要据此
            #: 说清「mock 现在是能下单还是点一下就 503」，只看下拉框是不够的。
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
