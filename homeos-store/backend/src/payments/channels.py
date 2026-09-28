"""支付渠道的名字、启用集合与显示名 —— 多渠道并存时的**唯一口径**。

抽成独立模块的原因很具体：渠道名与「哪些渠道启用」同时被支付层（provider 自己要知道
该不该用运营自定义的显示名）、站点配置序列化、下单校验和后台表单四处读取。
写在 ``payments/__init__.py`` 里会与 provider 形成循环导入，写在 provider 里则会各写一份。
"""

from __future__ import annotations

import json

from ..config import StoreSettings
from ..core.models import StoreSetting

#: 受支持的支付渠道。
PROVIDER_NAMES: tuple[str, ...] = ("alipay", "wechat")

#: 历史渠道显示名：读取时归一、后台禁止写回。
RETIRED_DISPLAY_NAMES = frozenset({"模拟支付", "mock", "模拟"})

#: 各渠道的默认显示名（顾客在二维码弹窗上看到的名字）。
CHANNEL_LABELS: dict[str, str] = {"alipay": "支付宝", "wechat": "微信支付"}

#: 空值表示「跟随环境变量」，不是渠道名。
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


#: 不是渠道、但会出现在订单 ``payment_provider`` 上的标记。
#: ``manual`` 是「人工补记/线下入账」—— 它没有走任何渠道，运营在订单表上要能一眼
#: 看出这笔钱**不是**在线收的，所以必须给它一个中文名，而不是显示一个英文单词。
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


def channel_label(name: str) -> str:
    """渠道的中文名（报错文案用）。与 :func:`provider_label` 同一份口径。"""
    return provider_label(name)


def enabled_channel_names(setting: StoreSetting | None, settings: StoreSettings) -> tuple[str, ...]:
    """当前**启用**的渠道列表（顺序即前台展示顺序）。空 = 一个都没启用 → 拒绝建单。

    ``payment_channels_json`` 非空时以它为准；为空则回落到单渠道时代的 ``payment_provider``，
    这样老部署升级后行为完全不变（不需要人工去勾一遍）。
    """
    raw = _json_array(getattr(setting, "payment_channels_json", "")) if setting else []
    names = tuple(
        name
        for name in (normalize_provider_name(str(item)) for item in raw)
        if name in PROVIDER_NAMES
    )
    if names:
        seen: list[str] = []
        for name in names:
            if name not in seen:
                seen.append(name)
        return tuple(seen)
    single = normalize_provider_name(
        (getattr(setting, "payment_provider", None) or "") if setting else ""
    ) or normalize_provider_name(settings.payment_provider)
    return (single,) if single in PROVIDER_NAMES else ()


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
    """某个渠道的显示名。

    ``payment_display_name`` 是**单渠道时代**的字段：只有「这个渠道正是默认渠道」或
    「默认渠道没配」时才采用它。否则同时在跑支付宝与微信时，运营给支付宝起的名字
    （或历史遗留的「模拟支付」）会挂到微信的二维码弹窗上。
    """
    name = normalize_provider_name(channel)
    fallback = CHANNEL_LABELS.get(name, name or "支付")
    custom = (getattr(setting, "payment_display_name", "") or "").strip() if setting else ""
    if not custom or custom in RETIRED_DISPLAY_NAMES:
        return fallback
    is_default = default_channel_name(setting, settings) in ("", name)
    return custom if is_default else fallback


__all__ = [
    "CHANNEL_LABELS",
    "PROVIDER_NAMES",
    "RETIRED_DISPLAY_NAMES",
    "SPECIAL_PROVIDER_LABELS",
    "channel_label",
    "default_channel_name",
    "display_name_for",
    "enabled_channel_names",
    "is_known_provider",
    "normalize_provider_name",
    "provider_label",
]
