"""事件日志持久化分级与记录过滤（对齐 event-log/util.ts 的 tier 部分）。

策略（与 Nest 一致）：
- **full**：用户可感知的控制/安防/编排域，全量存 state + attributes；
- **compact**：有意义的 binary_sensor / 计量类 sensor，仅存精简字段；
- **skip**：高频噪声域（camera/update/device_tracker/天气等）。
"""

from __future__ import annotations

import json
import random
from typing import Any

from .energy_sgcc import is_utility_account_entity
from ..client_power.energy_meter import is_cumulative_energy_meter
from ...platform.core.entity.entity_domain import get_entity_domain

TIER_FULL_DOMAINS = frozenset(
    {
        "light",
        "switch",
        "cover",
        "climate",
        "lock",
        "fan",
        "media_player",
        "alarm_control_panel",
        "vacuum",
        "water_heater",
        "valve",
        "scene",
        "script",
        "humidifier",
        "dehumidifier",
        "siren",
        "lawn_mower",
        "remote",
        "button",
        "input_boolean",
        "input_button",
        "input_select",
        "input_number",
        "person",
    }
)
TIER_CONDITIONAL_DOMAINS = frozenset({"sensor", "binary_sensor"})
TIER_SKIP_DOMAINS = frozenset(
    {
        "camera",
        "image",
        "update",
        "device_tracker",
        "event",
        "sun",
        "weather",
        "zone",
        "calendar",
        "todo",
        "conversation",
        "stt",
        "tts",
        "ai_task",
        "assist_satellite",
        "tag",
    }
)

METER_SENSOR_HINTS = (
    "energy",
    "power_meter",
    "power",
    "watt",
    "kwh",
    "electricity",
    "用电",
    "功耗",
    "_wattage",
    "gas_meter",
    "gas_consumption",
    "water_meter",
    "water_consumption",
)
TELEMETRY_SENSOR_HINTS = (
    "temperature",
    "humidity",
    "dewpoint",
    "pressure",
    "illuminance",
    "lux",
    "battery",
    "signal_strength",
    "rssi",
    "linkquality",
    "wifi",
    "pm25",
    "pm2_5",
    "pm10",
    "co2",
    "tvoc",
    "aqi",
    "voc",
)
MEANINGFUL_BINARY_HINTS = (
    "motion",
    "occupancy",
    "presence",
    "door",
    "window",
    "contact",
    "opening",
    "garage",
    "smoke",
    "gas",
    "carbon_monoxide",
    "co_",
    "_co",
    "fire",
    "moisture",
    "leak",
    "flood",
    "water_leak",
    "safety",
    "tamper",
    "vibration",
    "glass",
    "break",
    "intrusion",
)
ENERGY_METER_HINTS = ("energy", "power_meter", "kwh", "electricity")
#: 账单快照类 sensor：数值是「上月/上期总量」，一个月只跳一次，不是单调累计表。
#:
#: 按累计表差分会把整月用电记到跳变那一天（实测 ``last_month_ele_num=297`` 被写成
#: 11-02 单日 297 kWh）。这类实体只该被报表直接读取，不参与能耗累加。
SNAPSHOT_METER_HINTS = ("last_month", "lastmonth", "prev_month", "previous_month", "上个月", "上月")

DEFAULT_EVENT_LOG_RECORD_BLOCK_DOMAINS = (
    "camera",
    "image",
    "update",
    "device_tracker",
    "event",
    "sun",
    "weather",
    "zone",
)

ATTR_CHANGE_TRIGGERS: dict[str, tuple[str, ...]] = {
    "climate": (
        "temperature",
        "target_temp_high",
        "target_temp_low",
        "humidity",
        "fan_mode",
        "preset_mode",
        "swing_mode",
        "hvac_mode",
    ),
    "light": ("brightness", "color_temp", "color_temp_kelvin", "rgb_color", "hs_color", "effect"),
    "fan": ("percentage", "preset_mode", "oscillating", "direction"),
    "cover": ("current_position", "current_tilt_position"),
    "media_player": ("volume_level", "source"),
    "water_heater": ("temperature", "operation_mode"),
    # 注意尾逗号：`("fan_speed")` 是**字符串**，迭代它等于逐字符匹配，
    # 会让扫地机的任意属性名（含 f/a/n/_/s/p/e 之一）都被当成变化量上报。
    "vacuum": ("fan_speed",),
}

DOMAIN_RE = set("abcdefghijklmnopqrstuvwxyz0123456789_")


def _hints_match(text: str, hints: tuple[str, ...]) -> bool:
    return any(h in text for h in hints)


def _attributes_of(*states: Any) -> dict[str, Any] | None:
    """取首个带非空 attributes 的状态（HA 事件里的 old/new state 都可）。"""
    for state in states:
        if not isinstance(state, dict):
            continue
        attributes = state.get("attributes")
        if isinstance(attributes, dict) and attributes:
            return attributes
    return None


def is_energy_related_sensor(entity_id: str, attributes: dict[str, Any] | None = None) -> bool:
    """是否值得入库的计量类 sensor。

    优先按 attributes 判定（``device_class=energy`` / 单位 kWh|Wh|MWh），关键字只作兜底：
    实体名是用户可改的（``sensor.zong_dian_liang``、``sensor.total_consumption`` 都很常见），
    只认 ``energy``/``kwh`` 这类英文子串会把真实电表整条丢掉。
    """
    if get_entity_domain(entity_id) != "sensor":
        return False
    if is_cumulative_energy_meter(attributes):
        return True
    text = entity_id.lower()
    if _hints_match(text, TELEMETRY_SENSOR_HINTS) and not _hints_match(text, METER_SENSOR_HINTS):
        return False
    return _hints_match(text, METER_SENSOR_HINTS)


def is_billing_snapshot_entity(entity_id: str | None) -> bool:
    """账单/用量快照类 sensor（上月总量、上期用量）：不是单调累计表，不能做差分。

    判定只看名字：这些实体的 ``device_class``/单位与真实累计表完全一样，属性层没有
    任何可区分特征；而它们的后缀在集成里是固定契约（前端 ``conventionSuffix`` 同源）。
    """
    return _hints_match(str(entity_id or "").strip().lower(), SNAPSHOT_METER_HINTS)


def is_energy_meter_entity(entity_id: str) -> bool:
    """按 entity_id 关键字猜测电表（仅兜底，权威判定见 :func:`is_energy_meter_state`）。"""
    if get_entity_domain(entity_id) != "sensor":
        return False
    return _hints_match(entity_id.lower(), ENERGY_METER_HINTS)


def is_energy_meter_state(entity_id: str, *states: Any) -> bool:
    """是否为**可累加**的电量计量实体：attributes 优先（设备类/单位），名字关键字兜底。

    两类实体必须排除，否则「看起来是电量、实际不是读数」：

    - 账单快照（``*_last_month_ele_num``）：数值是「上月总量」，差分会把整月用电
      记到跳变当天；
    - 账户列表（``daylist`` / ``monthlist`` 属性，含 ``*_recent_30_daily_ele_list``）：
      state 不是累计读数，做成品的日/月用量由账户解析链路负责。
    """
    if get_entity_domain(entity_id) != "sensor":
        return False
    if is_billing_snapshot_entity(entity_id):
        return False
    attributes = _attributes_of(*states)
    if is_utility_account_entity(entity_id, attributes):
        return False
    if is_energy_meter_entity(entity_id):
        return True
    return is_cumulative_energy_meter(attributes)


def _is_meaningful_sensor(entity_id: str, attributes: dict[str, Any] | None = None) -> bool:
    domain = get_entity_domain(entity_id)
    text = entity_id.lower()
    if domain == "binary_sensor":
        return _hints_match(text, MEANINGFUL_BINARY_HINTS)
    if domain == "sensor":
        return is_energy_related_sensor(entity_id, attributes)
    return False


def resolve_event_log_tier(
    entity_id: str,
    *,
    enabled: bool = True,
    tier_c_sample_rate: float = 0.0,
    old_state: Any = None,
    new_state: Any = None,
) -> str:
    if not enabled:
        return "full"
    domain = get_entity_domain(entity_id)
    if domain in TIER_SKIP_DOMAINS:
        if tier_c_sample_rate <= 0:
            return "skip"
        return "compact" if random.random() < tier_c_sample_rate else "skip"
    if domain in TIER_FULL_DOMAINS:
        return "full"
    if domain in TIER_CONDITIONAL_DOMAINS:
        attributes = _attributes_of(old_state, new_state)
        return "compact" if _is_meaningful_sensor(entity_id, attributes) else "skip"
    return "compact"


def _changed_attr_keys(entity_id: str, old_attrs: dict[str, Any], new_attrs: dict[str, Any]) -> set[str]:
    """本次翻转里真正变化、且属于「该域受控属性」的键集合。

    只保留变化键而不是整份 attributes：``light`` 的 attributes 常带
    ``supported_color_modes`` / ``effect_list`` / ``rgb_color`` 等十几个字段
    （0.7–2 KB），而查询侧只读 ``stateDiff``（见 ``map_history_row``）——
    整份照存等于每行白写一两 KB，百万行就是 GB 级。
    """
    triggers = ATTR_CHANGE_TRIGGERS.get(get_entity_domain(entity_id))
    if not triggers:
        return set()
    return {key for key in triggers if _format_attr(old_attrs.get(key)) != _format_attr(new_attrs.get(key))}


def serialize_event_log_states(event: dict[str, Any], tier: str) -> tuple[Any, Any]:
    if tier == "skip":
        return None, None
    if tier == "full":
        old_state = event.get("old_state") or None
        new_state = event.get("new_state") or None
        if not old_state and not new_state:
            return None, None
        entity_id = str(event.get("entity_id") or "")
        old_attrs = (old_state or {}).get("attributes") or {}
        new_attrs = (new_state or {}).get("attributes") or {}
        # 只存「变化了的受控属性」：语义翻转（on/off）本身已由 stateDiff 表达，
        # 属性维度只需要知道哪一个变了、变成什么。
        changed_keys = _changed_attr_keys(entity_id, old_attrs, new_attrs)
        return (
            {"state": old_state["state"], "attributes": {k: old_attrs.get(k) for k in changed_keys}}
            if old_state
            else None,
            {"state": new_state["state"], "attributes": {k: new_attrs.get(k) for k in changed_keys}}
            if new_state
            else None,
        )
    if is_energy_meter_state(event.get("entity_id", ""), event.get("old_state"), event.get("new_state")):

        def _pick(state: dict[str, Any] | None) -> dict[str, Any] | None:
            if not state:
                return None
            attrs = state.get("attributes") or {}
            return {
                "state": state.get("state"),
                "attributes": {
                    "device_class": attrs.get("device_class"),
                    "unit_of_measurement": attrs.get("unit_of_measurement"),
                },
            }

        return _pick(event.get("old_state")), _pick(event.get("new_state"))
    new_state = event.get("new_state")
    return None, ({"_diff": True, "state": new_state.get("state")} if new_state else None)


def _format_attr(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return str(value)


def get_changed_control_attr(
    entity_id: str, old_state: dict[str, Any] | None, new_state: dict[str, Any] | None
) -> str | None:
    if not old_state or not new_state:
        return None
    triggers = ATTR_CHANGE_TRIGGERS.get(get_entity_domain(entity_id))
    if not triggers:
        return None
    old_attrs = old_state.get("attributes") or {}
    new_attrs = new_state.get("attributes") or {}
    for key in triggers:
        if _format_attr(old_attrs.get(key)) != _format_attr(new_attrs.get(key)):
            return f"{key}:{_format_attr(old_attrs.get(key))}→{_format_attr(new_attrs.get(key))}"
    return None


# 记录过滤（域黑白名单 + 实体屏蔽）
def _normalize_domain_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for raw in value:
        domain = str(raw or "").strip().lower()
        if not domain or any(ch not in DOMAIN_RE for ch in domain) or domain in seen:
            continue
        seen.add(domain)
        out.append(domain)
    return out


def _normalize_entity_id_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for raw in value:
        entity_id = str(raw or "").strip()
        if not entity_id or "." not in entity_id or entity_id in seen:
            continue
        seen.add(entity_id)
        out.append(entity_id)
    return out


def build_record_filter(ops: dict[str, Any] | None) -> dict[str, Any]:
    ops = ops or {}
    return {
        "enabled": ops.get("eventLogRecordFilterEnabled") is True,
        "mode": "allow_domains" if ops.get("eventLogRecordFilterMode") == "allow_domains" else "block",
        "blockDomains": _normalize_domain_list(ops.get("eventLogRecordBlockDomains")),
        "allowDomains": _normalize_domain_list(ops.get("eventLogRecordAllowDomains")),
        "blockEntityIds": _normalize_entity_id_list(ops.get("eventLogRecordBlockEntityIds")),
    }


def is_event_log_recordable(entity_id: str, cfg: dict[str, Any] | None) -> bool:
    cfg = cfg or {}
    if not cfg.get("enabled"):
        return True
    entity_id = str(entity_id or "").strip()
    if not entity_id:
        return False
    if entity_id in (cfg.get("blockEntityIds") or []):
        return False
    domain = get_entity_domain(entity_id)
    if cfg.get("mode") == "allow_domains":
        allow = cfg.get("allowDomains") or []
        return bool(allow) and domain in allow
    return domain not in (cfg.get("blockDomains") or [])
