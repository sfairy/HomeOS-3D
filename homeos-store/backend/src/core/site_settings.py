"""站点级运行时配置（``store_settings`` 单例）的读取与非支付序列化。

为什么下沉到 ``core``
--------------------
``core.serializers`` 需要「设备解绑冷却」这一条口径，而它原先住在
``ops.site_settings``；``ops`` 又依赖 ``core`` —— 于是 ``core`` 反向依赖 ``ops``，包级
强连通又多一条边。站点配置的**读取**本身就是数据层职责（一行单例 + 几个纯函数），
下沉后 ``ops`` 只剩「支付凭据合并」这类真正依赖 ``payments`` 的部分。

支付相关的序列化仍在 ``ops.payment_settings``；``ops.site_settings`` 保留门面，向后兼容。
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from .clock import iso, utcnow
from .models import DEFAULT_SUPPORT_EMAIL, StoreSetting
from ..config import StoreSettings

DEFAULT_LOGO_URL = "/store-static/homeos-mark.svg"


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


def resolve_device_release_cooldown(setting: StoreSetting | None, settings: StoreSettings) -> int:
    """解绑冷却秒数的**唯一**取值口径：站点配置优先，未配置时回落到环境变量。"""
    raw = setting.device_release_cooldown_override if setting is not None else None
    if raw is None:
        raw = settings.device_release_cooldown_seconds
    return max(0, int(raw or 0))


def effective_device_release_cooldown(session: Session, settings: StoreSettings) -> int:
    """按会话内的站点配置解析冷却秒数（供没有现成 setting 对象的调用方使用）。"""
    return resolve_device_release_cooldown(get_setting(session), settings)


def _deploy_base_url(setting: StoreSetting) -> str:
    """部署脚本地址的唯一口径：去空白、去结尾斜杠。"""
    return (setting.deploy_base_url or "").strip().rstrip("/")


#: 账号中心「一键部署」面板展示的指令：(标签, 托管目录下的文件名, 组装模板)。
#: 客户机侧的交付物就是仓库根那份 docker-compose.app.yml（自包含，值写死在文件里），
#: 托管在站点配置的 deployBaseUrl 指向的静态目录；指令下载它并直接起容器。
DEPLOY_SCRIPTS: tuple[tuple[str, str, str], ...] = (
    (
        "OFFICIAL-COMPOSE（官方源）",
        "docker-compose.app.yml",
        "curl -sSL {base}/{path} -o docker-compose.app.yml && docker compose -f docker-compose.app.yml up -d",
    ),
)


def store_configuration_payload(setting: StoreSetting) -> dict:
    deploy_base = _deploy_base_url(setting)
    return {
        "siteName": setting.site_name,
        "siteTitle": setting.site_title,
        "description": setting.description,
        "announcement": setting.announcement,
        "supportEmail": setting.support_email or DEFAULT_SUPPORT_EMAIL,
        "logoUrl": setting.logo_url,
        "deployBaseUrl": deploy_base,
        "deployScripts": [
            {"label": label, "command": template.format(base=deploy_base, path=path)}
            for label, path, template in DEPLOY_SCRIPTS
        ]
        if deploy_base
        else [],
        "maintenanceMode": bool(setting.maintenance_mode),
        "maintenanceMessage": setting.maintenance_message,
        "updatedAt": iso(setting.updated_at),
    }


def referral_settings_payload(setting: StoreSetting) -> dict:
    return {
        "enabled": bool(setting.referral_enabled),
        "ratePercent": float(setting.referral_rate_percent or 0.0),
        "withdrawalFeePercent": float(setting.referral_withdrawal_fee_percent or 0.0),
        "withdrawalMinPoints": float(setting.referral_withdrawal_min_points or 0.0),
    }


__all__ = [
    "DEFAULT_LOGO_URL",
    "DEPLOY_SCRIPTS",
    "effective_device_release_cooldown",
    "get_setting",
    "referral_settings_payload",
    "resolve_device_release_cooldown",
    "store_configuration_payload",
    "update_setting",
]
