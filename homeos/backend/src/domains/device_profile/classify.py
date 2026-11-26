"""设备画像的纯规则层：分类、别名归一与「在线 / 可用」判定。

这些函数只依赖实体快照（``{entity_id, state, attributes}``），不碰数据库与会话，
因此从 :mod:`service` 抽出：服务自身的职责是编排读写，规则变更不应该让它继续变胖。

术语：

- **在线**（:func:`is_reachable`）：HA 里还在、状态不是 ``unavailable`` / ``unknown``；
- **可用**（:func:`is_usable_profile`）：在线 **且** 已确认或置信达标 —— 只有可用画像
  才会被语音 / 管家自动选中。两者分开，面板才不会把「待确认」误标成「不可用」。
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from typing import Any

MEDIA_KINDS = ("apple_tv", "tv", "speaker", "receiver", "unknown")
CLIMATE_KINDS = (
    "ac_split",
    "ac_central",
    "boiler",
    "floor_heating",
    "water_heater",
    "bath_heater",
    "unknown",
)
#: HA 原生 ``water_heater`` 域只区分「热水器 / 未定」：形态（储水 / 燃气 / 热泵）由用户确认。
WATER_HEATER_KINDS = ("water_heater", "unknown")
#: kind → 前端渲染形态（3D 面板 / 控制弹窗只有三种形态）。
#:
#: 这张表是「分类结论 → UI 形态」的唯一换算，必须与
#: ``packages/shared/src/entity/device-kind.ts`` 的 ``CLIMATE_RENDER_TYPE_BY_KIND``
#: 逐条相等 —— 由 ``ops/checks/check_device_kinds_parity.py`` 断言。
#: 供暖类（``boiler`` / ``floor_heating``）复用空调面板：温度 + 模式的交互同构，
#: 单开第四套 UI 只会让四份气候代码变成五份。
CLIMATE_RENDER_TYPE_BY_KIND: dict[str, str] = {
    "ac_split": "air-conditioner",
    "ac_central": "air-conditioner",
    "boiler": "air-conditioner",
    "floor_heating": "air-conditioner",
    "water_heater": "water-heater",
    "bath_heater": "bath-heater",
    "unknown": "air-conditioner",
}
DEFAULT_MEDIA_KINDS = ("speaker", "apple_tv", "tv")
#: 可用阈值：confirmed 或 confidence >= 0.85 才算「可自动选目标」。
AVAILABLE_CONFIDENCE = 0.85
#: 分类规则版本：规则变更时递增，让存量画像在下一次刷新时重新分类。
#: rule-v2：climate 的形态推断从「恒 unknown」改为「低置信推断 + 仍需确认」，
#: 与前端旧启发式逐条等价（结论统一到这里，前端不再自己猜）。
CLASSIFIER_VERSION = "rule-v2"
#: 画像关心的实体域
PROFILE_DOMAINS = ("media_player", "climate", "water_heater")
#: 域 → 允许的 kind（写入校验的唯一口径）
ALLOWED_KINDS: dict[str, tuple[str, ...]] = {
    "media_player": MEDIA_KINDS,
    "climate": CLIMATE_KINDS,
    "water_heater": WATER_HEATER_KINDS,
}
#: 别名约束
MAX_ALIASES = 30
MAX_ALIAS_CHARS = 60
#: 属性指纹只取会影响分类的字段
_HASH_FIELDS = (
    "device_class",
    "friendly_name",
    "source_list",
    "source",
    "app_name",
    "supported_features",
    "hvac_modes",
    "operation_list",
    "preset_modes",
    "min_temp",
    "max_temp",
)
#: Apple TV 佐证规则里要求出现的内容源
_APPLE_TV_CORROBORATING_SOURCES = ("infuse",)


def text(value: Any) -> str:
    return str(value or "").strip()


def attr_map(entity: dict[str, Any] | None) -> dict[str, Any]:
    attributes = (entity or {}).get("attributes")
    return attributes if isinstance(attributes, dict) else {}


def attributes_hash(entity: dict[str, Any] | None) -> str:
    attrs = attr_map(entity)
    payload = json.dumps({key: attrs.get(key) for key in _HASH_FIELDS}, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def normalize_text(value: Any) -> str:
    """别名 / 目标描述的比较口径：小写并去掉空白、下划线、连字符。"""
    return re.sub(r"[\s_-]+", "", text(value).lower())


def alias_hit(alias: str, needle: str) -> bool:
    """别名命中：双向包含（「客厅冷气」↔「冷气」），短串不参与避免误判。"""
    normalized = normalize_text(alias)
    if len(normalized) < 2 or len(needle) < 2:
        return False
    return normalized in needle or needle in normalized


def _apple_app_count(sources: list[str]) -> int:
    apple_names = ("app store", "netflix", "youtube", "disney", "spotify", "infuse")
    return sum(1 for item in sources if any(name in item.lower() for name in apple_names))


def classify(entity: dict[str, Any]) -> dict[str, Any]:
    """按规则给一台设备分类；返回 ``{kind, confidence, evidence}``。"""
    entity_id = text(entity.get("entity_id"))
    domain = entity_id.split(".", 1)[0]
    attrs = attr_map(entity)
    if domain in ("climate", "water_heater"):
        return _classify_climate(domain, attrs, entity)
    if domain != "media_player":
        return {"kind": "unknown", "confidence": 0.0, "evidence": ["unsupported_domain"]}
    raw_sources = attrs.get("source_list")
    sources = [str(item) for item in raw_sources] if isinstance(raw_sources, list) else []
    supported = attrs.get("supported_features")
    return _classify_media(
        name=text(attrs.get("friendly_name") or entity_id).lower(),
        device_class=text(attrs.get("device_class")).lower(),
        sources=sources,
        supported_flags=int(supported) if isinstance(supported, (int, float)) else 0,
    )


def normalize_mode_key(raw: Any) -> str:
    """模式名归一，与前端 ``normalizeClimateModeKey`` 同口径。

    HA 集成的模式名来自各家厂商：``preset_mode`` 可能是 ``Quick Heat`` /
    ``quickHeat`` / ``quick_heat``，中文集成则直接给「快速取暖」。判据必须在同一口径上
    比较，否则「浴霸」与「空调」的结论会随集成实现漂移。
    """
    value = unicodedata.normalize("NFKC", text(raw))
    value = re.sub(r"([a-z\d])([A-Z])", r"\1_\2", value)
    value = value.replace("+", "_and_").replace("&", "_and_")
    value = value.lower()
    value = re.sub(r"[\s./-]+", "_", value)
    value = re.sub(r"_+", "_", value).strip("_")
    return value


#: 浴霸（风暖）独有的运行模式：出现任意一个就说明它不是普通空调。
#:
#: 与前端旧启发式逐条一致（含中文别名）：换气 / 吹风 / 除雾 / 干燥这些档位普通空调没有。
BATH_HEATER_MODE_KEYS = frozenset(
    {
        "vent",
        "ventilate",
        "ventilation",
        "exhaust",
        "air_exchange",
        "defog",
        "quick_heat",
        "quick_defog",
        "drying",
        "取暖",
        "吹风",
        "换气",
        "除雾",
        "干燥",
    }
)
#: 名称里出现这些词即可判定浴霸（中文集成普遍只在 friendly_name 里体现形态）。
_BATH_HEATER_NAME_PATTERN = re.compile(r"(浴霸|风暖|暖风|浴室取暖|bath.?heater)", re.IGNORECASE)
#: 形态推断的置信度：全部低于 ``AVAILABLE_CONFIDENCE``，因此**永远不会**被语音 / 管家
#: 自动选中 —— 只是让面板一开始就画对形态，仍需用户确认后才算可用画像。
_INFERRED_KIND_CONFIDENCE = 0.55
_INFERRED_KIND_WEAK_CONFIDENCE = 0.45


def _classify_climate(domain: str, attrs: dict[str, Any], entity: dict[str, Any] | None = None) -> dict[str, Any]:
    """空调 / 浴霸 / 热水器的形态推断。

    ``climate`` 域的形态无法从 HA 属性直接读出（``hvac_modes`` 只说明能力，不说明是
    分体空调还是浴霸），因此这里做**低置信推断**：结论只用于选面板形态，不用于自动
    选目标。判不出来的保持 ``unknown`` + ``requires_confirmation``。

    此前这段推断只存在于前端（``resolveClimateDeviceType()`` 按设备中文名正则 +
    ``hvac_modes`` 启发式），后端一律回 ``unknown``：于是 3D 面板按猜测画、语音与
    自动化按确认状态选，同一台设备两套结论。规则搬到这里之后只有一处结论。
    """
    modes = attrs.get("hvac_modes" if domain == "climate" else "operation_list")
    mode_list = [str(item) for item in modes] if isinstance(modes, list) else []
    capability = ",".join(mode_list) or "unknown"
    if domain == "water_heater":
        # 形态（储水 / 燃气 / 热泵）不在 HA 属性里，且 kind 只有 water_heater 一个取值，
        # 因此仍要求人工确认：``water_heater`` 域本身不足以推进 ``usable`` 状态。
        return {
            "kind": "unknown",
            "confidence": 0.0,
            "evidence": [f"water_heater_modes:{capability}", "water_heater_requires_confirmation"],
        }

    friendly_name = text(attr_map(entity).get("friendly_name"))
    normalized_modes = [normalize_mode_key(item) for item in mode_list if str(item).strip()]
    preset_modes = attrs.get("preset_modes")
    normalized_presets = (
        [normalize_mode_key(item) for item in preset_modes if str(item).strip()]
        if isinstance(preset_modes, list)
        else []
    )

    evidence = [f"climate_capabilities:{capability}"]
    if _BATH_HEATER_NAME_PATTERN.search(friendly_name):
        return {
            "kind": "bath_heater",
            "confidence": _INFERRED_KIND_CONFIDENCE,
            "evidence": [*evidence, "name:bath_heater", "climate_requires_confirmation"],
        }
    if any(key in BATH_HEATER_MODE_KEYS for key in (*normalized_modes, *normalized_presets)):
        return {
            "kind": "bath_heater",
            "confidence": _INFERRED_KIND_CONFIDENCE,
            "evidence": [*evidence, "mode:bath_heater", "climate_requires_confirmation"],
        }
    if any(key in ("cool", "heat_cool") for key in normalized_modes):
        return {
            "kind": "ac_split",
            "confidence": _INFERRED_KIND_CONFIDENCE,
            "evidence": [*evidence, "mode:cool", "climate_requires_confirmation"],
        }
    active_heat_modes = [key for key in normalized_modes if key != "off"]
    if active_heat_modes == ["heat"]:
        # 只有一个制热档、没有制冷：浴霸的典型形态（普通空调必有 cool）。
        return {
            "kind": "bath_heater",
            "confidence": _INFERRED_KIND_WEAK_CONFIDENCE,
            "evidence": [*evidence, "mode:heat_only", "climate_requires_confirmation"],
        }
    return {
        "kind": "unknown",
        "confidence": 0.0,
        "evidence": [*evidence, "climate_requires_confirmation"],
    }


def _classify_media(
    *,
    name: str,
    device_class: str,
    sources: list[str],
    supported_flags: int,
) -> dict[str, Any]:
    """播放器：按「App Store 源 > 设备类 > 名称 + 应用数」的强弱顺序判定。"""
    lowered_sources = [item.lower() for item in sources]
    if "app store" in lowered_sources:
        return {"kind": "apple_tv", "confidence": 0.93, "evidence": ["source_list:app_store"]}
    if "apple tv" in name and "tv" in name and _apple_app_count(sources) >= 3 and supported_flags & 2048:
        return {"kind": "apple_tv", "confidence": 0.90, "evidence": ["name:apple_tv", "select_source"]}
    if device_class == "tv":
        return {"kind": "tv", "confidence": 0.96, "evidence": ["device_class:tv"]}
    if device_class == "speaker":
        return {"kind": "speaker", "confidence": 0.96, "evidence": ["device_class:speaker"]}
    if device_class == "receiver":
        return {"kind": "receiver", "confidence": 0.94, "evidence": ["device_class:receiver"]}
    if ("apple tv" in name or "appletv" in name) and _apple_app_count(sources) >= 2:
        return {"kind": "apple_tv", "confidence": 0.76, "evidence": ["name:apple_tv", "apps>=2"]}
    if any(word in name for word in ("homepod", "speaker", "音箱", "音响")):
        return {"kind": "speaker", "confidence": 0.68, "evidence": ["name:speaker"]}
    return {"kind": "unknown", "confidence": 0.0, "evidence": ["no_rule_matched"]}


def has_corroborated_apple_tv(entity: dict[str, Any], kind: str, confidence: float) -> bool:
    """「低置信 Apple TV」的唯一例外：名字 + 内容源佐证，且不是音箱/功放。"""
    if kind != "apple_tv" or confidence < 0.76:
        return False
    attrs = attr_map(entity)
    name = text(attrs.get("friendly_name")).lower()
    if "apple tv" not in name:
        return False
    device_class = text(attrs.get("device_class")).lower()
    if device_class in ("speaker", "receiver"):
        return False
    raw_sources = attrs.get("source_list")
    sources = [str(item).lower() for item in raw_sources] if isinstance(raw_sources, list) else []
    return any(source in sources for source in _APPLE_TV_CORROBORATING_SOURCES)


def is_reachable(entity: dict[str, Any] | None) -> bool:
    """设备在 HA 里是否还活着（与「能否自动选它」是两件事）。"""
    if entity is None:
        return False
    return text(entity.get("state")).lower() not in ("", "unavailable", "unknown")


def is_usable_profile(row: dict[str, Any], entity: dict[str, Any] | None) -> bool:
    """能否被管家 / 语音自动选中：在线，且已确认或置信达标（Apple TV 另有佐证例外）。"""
    if entity is None or not is_reachable(entity):
        return False
    if row.get("confirmed"):
        return True
    confidence = float(row.get("confidence") or 0.0)
    if confidence >= AVAILABLE_CONFIDENCE:
        return True
    return has_corroborated_apple_tv(entity, str(row.get("kind")), confidence)


def normalize_aliases(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        raise ValueError("aliases 须为数组")
    seen: list[str] = []
    seen_keys: set[str] = set()
    for item in raw:
        if not isinstance(item, str):
            raise ValueError("aliases 每项须为字符串")
        value = item.strip()
        if not value:
            continue
        if len(value) > MAX_ALIAS_CHARS:
            raise ValueError(f"别名过长（最多 {MAX_ALIAS_CHARS} 字）")
        # 大小写 / 空白不敏感去重：「Netflix」与「netflix」对匹配等价，留着只会让面板出现两条。
        key = normalize_text(value)
        if key and key not in seen_keys:
            seen_keys.add(key)
            seen.append(value)
    if len(seen) > MAX_ALIASES:
        raise ValueError(f"别名最多 {MAX_ALIASES} 条")
    return seen


__all__ = [
    "ALLOWED_KINDS",
    "AVAILABLE_CONFIDENCE",
    "CLASSIFIER_VERSION",
    "CLIMATE_KINDS",
    "CLIMATE_RENDER_TYPE_BY_KIND",
    "DEFAULT_MEDIA_KINDS",
    "MAX_ALIASES",
    "MAX_ALIAS_CHARS",
    "MEDIA_KINDS",
    "PROFILE_DOMAINS",
    "WATER_HEATER_KINDS",
    "alias_hit",
    "attr_map",
    "attributes_hash",
    "classify",
    "has_corroborated_apple_tv",
    "is_reachable",
    "is_usable_profile",
    "normalize_aliases",
    "normalize_mode_key",
    "normalize_text",
    "text",
]
