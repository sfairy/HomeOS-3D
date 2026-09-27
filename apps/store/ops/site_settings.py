"""站点级运行时配置（``store_settings`` 单例）的读写与序列化。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from apps.store.config import StoreSettings
from apps.store.core.models import DEFAULT_SUPPORT_EMAIL, StoreSetting
from apps.store.payments.channels import (
    RETIRED_DISPLAY_NAMES,
    default_channel_name,
    display_name_for,
    enabled_channel_names,
)
from apps.store.payments.credentials import merge_alipay_settings, merge_wechat_settings
from apps.store.payments.wechat import WeChatPayProvider
from apps.store.security.security import iso, utcnow

#: 已删除渠道留下的显示名规则住在 payments/channels.py（显示名在那儿解析）；
#: 这里重新导出，让 api/admin_settings.py 的保存时校验继续从同一处拿。


#: 默认品牌标识。必须与 ``models.StoreSetting.logo_url`` 的默认值一致：该字段留空时
DEFAULT_LOGO_URL = "/store-static/homeos-mark.svg"

#: 账号中心「一键部署」的脚本清单（标签, 相对基础地址的路径）。目前只有官方源一条 ——
DEPLOY_SCRIPTS: tuple[tuple[str, str], ...] = (
    ("OFFICIAL-SCRIPT（官方源）", "install.sh"),
)


def _deploy_base_url(setting: StoreSetting) -> str:
    """部署脚本地址的唯一口径：去空白、去结尾斜杠。
    """
    return (setting.deploy_base_url or "").strip().rstrip("/")


def resolve_device_release_cooldown(setting: StoreSetting | None, settings: StoreSettings) -> int:
    """解绑冷却秒数的**唯一**取值口径：站点配置优先，未配置时回落到环境变量。
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
        "supportEmail": setting.support_email or DEFAULT_SUPPORT_EMAIL,
        "logoUrl": setting.logo_url,
        #: 账号中心「一键部署」区块。基础地址由后台配置，未配置时 deployScripts 为空、
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


def _display_name(setting: StoreSetting, *, fallback: str) -> str:
    """支付显示名。已删除渠道留下的名字（「模拟支付」）不再生效，回落到渠道默认名。"""
    name = (setting.payment_display_name or "").strip()
    if name and name not in RETIRED_DISPLAY_NAMES:
        return name
    return fallback

def _channel_credentials(
    name: str, setting: StoreSetting, settings: StoreSettings
) -> StoreSettings:
    """某个渠道**合并站点配置后**的凭据集合（与 ``resolve_provider`` 注入的是同一份）。

    只读启动时的环境变量合并进来，否则自检会报「未配置」而实际能收款。
    """
    if name == "wechat":
        return merge_wechat_settings(settings, setting)
    return merge_alipay_settings(settings, setting)


def _channel_ready(name: str, merged: StoreSettings) -> bool:
    """这个渠道的凭据是否齐全（齐全 = 能真的收到钱）。"""
    if name == "wechat":
        return not WeChatPayProvider.missing_credentials(merged)
    return bool(merged.alipay_app_id) and bool(merged.alipay_private_key_text) and bool(
        merged.alipay_public_key_text
    )


def _channel_note(name: str) -> str:
    """付款页给顾客的一句话。措辞必须与渠道一致 —— 让用户拿微信扫支付宝的码是
    最常见的收银台事故。"""
    if name == "wechat":
        return "请用微信扫一扫支付，付款后本页会自动确认。"
    return "打开支付宝「扫一扫」完成付款，付款后本页会自动确认。"


def payment_channels_payload(
    setting: StoreSetting, settings: StoreSettings
) -> list[dict]:
    """**已启用**的渠道清单（含各自的可用性）。前台据此决定「直接出码」还是「先让顾客选」。

    每个渠道各报各的 ``available``：一个渠道凭据不齐不该把另一个也藏起来。
    """
    enabled = enabled_channel_names(setting, settings)
    default_name = default_channel_name(setting, settings)
    channels: list[dict] = []
    for name in enabled:
        merged = _channel_credentials(name, setting, settings)
        ready = _channel_ready(name, merged)
        channels.append(
            {
                "provider": name,
                "displayName": display_name_for(name, setting, settings),
                "icon": name,
                "note": _channel_note(name),
                #: 凭据齐全 **且** 运营开了收款开关，才允许顾客选它。
                "configured": ready,
                "available": bool(setting.payment_enabled) and ready,
                "isDefault": name == default_name,
            }
        )
    return channels


def payment_configuration_payload(
    setting: StoreSetting, settings: StoreSettings, *, include_credentials: bool
) -> dict:
    """支付配置的序列化。

    顶层字段（provider / displayName / available / configured）保持单渠道时代的语义，
    取**默认渠道**的值 —— 老前台JS与后台都不必改就能继续工作；新增的 ``channels``
    数组才是多渠道的信息来源。
    """
    channels = payment_channels_payload(setting, settings)
    default_name = default_channel_name(setting, settings)
    chosen = next(
        (item for item in channels if item["provider"] == default_name),
        channels[0] if channels else None,
    )

    # 一个可用渠道都没有：如实报「不可用」，让前台收起支付入口，而不是给一个点了会
    # 失败的按钮。这里的 displayName 是给**后台**看的诊断文案（前台不会显示它）。
    if chosen is None:
        provider = ""
        display_name = _display_name(setting, fallback="未配置支付渠道")
        icon = "alipay"
        available = False
        configured = False
    else:
        provider = chosen["provider"]
        display_name = chosen["displayName"]
        icon = chosen["icon"]
        available = chosen["available"]
        configured = bool(setting.payment_enabled) and chosen["configured"]

    transaction_description = (
        setting.payment_transaction_description
        or settings.alipay_transaction_description
        or settings.wechat_transaction_description
    )
    payload = {
        "provider": provider,
        "enabled": bool(setting.payment_enabled),
        "displayName": display_name,
        "icon": icon,
        "transactionDescription": transaction_description,
        "configured": configured,
        "available": available,
        #: 多渠道清单。单个渠道时前台不显示选择器，行为与从前完全一致。
        "channels": channels,
        "updatedAt": iso(setting.updated_at),
    }
    if include_credentials:
        alipay_merged = merge_alipay_settings(settings, setting)
        payload |= {
            "appId": alipay_merged.alipay_app_id,
            "applicationPrivateKeyConfigured": _mask_secret(
                bool(alipay_merged.alipay_private_key_text)
            ),
            "alipayPublicKeyConfigured": _mask_secret(
                bool(alipay_merged.alipay_public_key_text)
            ),
            "gatewayUrl": alipay_merged.alipay_gateway_url,
            #: 交易标题的「来源」标记：留空即跟随环境变量，前端只回填来源为后台的值
            "transactionDescriptionFromDatabase": bool(
                (setting.payment_transaction_description or "").strip()
            ),
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
