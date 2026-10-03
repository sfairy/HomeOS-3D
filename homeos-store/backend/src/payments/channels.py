"""支付渠道的名字、启用集合与显示名 —— 多渠道并存时的**唯一口径**。

抽成独立模块的原因很具体：渠道名与「哪些渠道启用」同时被支付层（provider 自己要知道
该不该用运营自定义的显示名）、站点配置序列化、下单校验和后台表单四处读取。
写在 ``payments/__init__.py`` 里会与 provider 形成循环导入，写在 provider 里则会各写一份。
"""

from __future__ import annotations

import json

from ..config import StoreSettings
from ..core.models import StoreSetting

PROVIDER_NAMES: tuple[str, ...] = ("alipay", "wechat")

CHANNEL_LABELS: dict[str, str] = {"alipay": "支付宝", "wechat": "微信支付"}

_FOLLOW_ENV = ""


def normalize_provider_name(name: str | None) -> str:
    return (name or "").strip().lower()


def is_known_provider(name: str | None) -> bool:
    """``None`` / 空串表示「跟随环境变量」，同样算合法配置值。"""
    normalized = normalize_provider_name(name)
    return normalized == _FOLLOW_ENV or normalized in PROVIDER_NAMES


def _json_array(raw: object) -> list:
    """把库里的 JSON 数组解析成 list。解析不了就当空。

    **刻意不 import core.serializers.json_list**：那条链是
    serializers → ops.site_settings → payments.credentials → payments.alipay → 本模块，
    从本模块反过来引它就是一个循环导入（真实踩过：它让整个测试收集阶段直接失败）。
    """
    if not isinstance(raw, str) or not raw.strip():
        return []
    try:
        value = json.loads(raw)
    except ValueError:
        return []
    return value if isinstance(value, list) else []


SPECIAL_PROVIDER_LABELS: dict[str, str] = {"manual": "人工/线下"}


def provider_label(name: str) -> str:
    """订单/配置上的渠道名 → 中文名。**唯一口径**：后台表格与报错文案都用它。

    认不出来的名字（历史数据里的已删除渠道，如 ``mock``）原样返回：那正是运营需要
    看到的事实，不该被吞成一个「未知」。
    """
    normalized = normalize_provider_name(name)
    if not normalized:
        return ""
    return (
        CHANNEL_LABELS.get(normalized)
        or SPECIAL_PROVIDER_LABELS.get(normalized)
        or normalized
    )


def enabled_channel_names(setting: StoreSetting | None, settings: StoreSettings) -> tuple[str, ...]:
    """当前**启用**的渠道列表（顺序即前台展示顺序）。空 = 一个都没启用 → 拒绝建单。
    """
    raw = _json_array(getattr(setting, "payment_channels_json", "")) if setting else []
    names: list[str] = []
    for item in raw:
        name = normalize_provider_name(str(item))
        if name in PROVIDER_NAMES and name not in names:
            names.append(name)
    return tuple(names)


def default_channel_name(
    setting: StoreSetting | None, settings: StoreSettings
) -> str:
    """默认渠道：顾客没选时用哪个。取不到启用集合时返回空串。"""
    configured = normalize_provider_name(
        (getattr(setting, "payment_provider", None) or "") if setting else ""
    )
    enabled = enabled_channel_names(setting, settings)
    if configured in enabled:
        return configured
    return enabled[0] if enabled else ""


def display_name_for(
    channel: str, setting: StoreSetting | None, settings: StoreSettings
) -> str:
    """某个渠道的显示名（顾客在二维码弹窗上看到的名字）。"""
    name = normalize_provider_name(channel)
    return CHANNEL_LABELS.get(name, name or "支付")


__all__ = [
    "CHANNEL_LABELS",
    "PROVIDER_NAMES",
    "SPECIAL_PROVIDER_LABELS",
    "default_channel_name",
    "display_name_for",
    "enabled_channel_names",
    "is_known_provider",
    "normalize_provider_name",
    "provider_label",
]
