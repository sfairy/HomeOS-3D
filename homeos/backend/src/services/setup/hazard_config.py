"""危险传感器（烟感 / 燃气 / 水浸）绑定解析与安防告警消息构造。

对齐 ``@homeos/shared/setup/hazard-config.util``：
- 仅识别复数数组字段（hazardSmokeEntityIds / hazardGasEntityIds / hazardLeakEntityIds）；
- 关阀 / 排风字段为单值或逗号分隔字符串，由本模块归一化为数组。
"""

from __future__ import annotations

import re
from typing import Any, Literal

HazardSensorKind = Literal["smoke", "gas", "leak"]

HAZARD_BINDING_FIELDS: tuple[tuple[HazardSensorKind, str], ...] = (
    ("smoke", "hazardSmokeEntityIds"),
    ("gas", "hazardGasEntityIds"),
    ("leak", "hazardLeakEntityIds"),
)

_SPLIT_RE = re.compile(r"[,;\s]+")


def parse_hazard_entity_id_list(ha_config: dict[str, Any] | None, plural_key: str) -> list[str]:
    """从 haConfig 中解析指定复数数组字段为去空 trim 后的 entityId 列表。"""
    ha = ha_config or {}
    raw = ha.get(plural_key)
    if not isinstance(raw, list):
        return []
    return [str(item if item is not None else "").strip() for item in raw if str(item or "").strip()]


def collect_hazard_binding_summary(ha_config: dict[str, Any] | None) -> dict[str, list[str]]:
    """汇总三类危险传感器的绑定实体（烟/燃气/水浸）。"""
    summary: dict[str, list[str]] = {"smoke": [], "gas": [], "leak": []}
    for kind, plural in HAZARD_BINDING_FIELDS:
        summary[kind] = parse_hazard_entity_id_list(ha_config, plural)
    return summary


def build_hazard_binding_map(ha_config: dict[str, Any] | None) -> dict[str, str]:
    """构建 entityId → 绑定类别（烟/燃气/水浸）的快速查找表。"""
    mapping: dict[str, str] = {}
    summary = collect_hazard_binding_summary(ha_config)
    for kind in ("smoke", "gas", "leak"):
        for entity_id in summary[kind]:
            mapping[entity_id] = kind
    return mapping


def has_any_hazard_sensor_binding(ha_config: dict[str, Any] | None) -> bool:
    summary = collect_hazard_binding_summary(ha_config)
    return bool(summary["smoke"] or summary["gas"] or summary["leak"])


def format_hazard_binding_summary_text(ha_config: dict[str, Any] | None) -> str:
    """格式化为一行中文摘要（如「烟感 3、燃气 2」）。"""
    summary = collect_hazard_binding_summary(ha_config)
    parts: list[str] = []
    if summary["smoke"]:
        parts.append(f"烟感 {len(summary['smoke'])}")
    if summary["gas"]:
        parts.append(f"燃气 {len(summary['gas'])}")
    if summary["leak"]:
        parts.append(f"水浸 {len(summary['leak'])}")
    return "、".join(parts)


def format_security_alarm_message(data: dict[str, Any] | None) -> str:
    """根据安防告警事件参数构造中文告警消息文本。"""
    payload = data or {}
    name = payload.get("friendlyName") or payload.get("entityId") or "传感器"
    alarm_type = payload.get("type")
    if alarm_type == "smoke":
        base = f"烟雾告警：{name} 检测到烟雾，请立即检查"
    elif alarm_type == "gas_leak":
        base = f"燃气泄漏：{name} 触发告警，请立即通风并检查燃气阀"
    elif alarm_type == "water_leak":
        base = f"漏水告警：{name} 检测到漏水，水阀已尝试自动关闭"
    elif payload.get("message"):
        base = str(payload["message"])
    else:
        zone = f" ({payload['zoneNames']})" if payload.get("zoneNames") else ""
        base = f"{name} 触发告警{zone}"
    failures = payload.get("actionFailures")
    if isinstance(failures, list) and failures:
        base += f"（联动失败：{'、'.join(str(f) for f in failures)}）"
    return base


def detect_hazard_binding_conflicts(ha_config: dict[str, Any] | None) -> list[dict[str, Any]]:
    """检测同一实体被绑定到多个危险传感器类别的配置冲突。"""
    summary = collect_hazard_binding_summary(ha_config)
    kind_by_entity: dict[str, list[str]] = {}
    for kind in ("smoke", "gas", "leak"):
        for entity_id in summary[kind]:
            kind_by_entity.setdefault(entity_id, []).append(kind)
    return [
        {"entityId": entity_id, "kinds": kinds}
        for entity_id, kinds in kind_by_entity.items()
        if len(kinds) > 1
    ]


def collect_hazard_watched_entity_ids(ha_config: dict[str, Any] | None) -> list[str]:
    """收集安防页需实时订阅的 HA 实体 ID（传感器 + 关阀 + 排风，去重）。"""
    ha = ha_config or {}
    ids: list[str] = []
    seen: set[str] = set()

    def _add(value: str) -> None:
        if value and value not in seen:
            seen.add(value)
            ids.append(value)

    summary = collect_hazard_binding_summary(ha)
    for key in ("smoke", "gas", "leak"):
        for entity_id in summary[key]:
            _add(entity_id)
    _add(str(ha.get("hazardGasValveEntityId") or "").strip())
    _add(str(ha.get("hazardWaterValveEntityId") or "").strip())
    for fan in _SPLIT_RE.split(str(ha.get("hazardExhaustFanEntityIds") or "")):
        _add(fan.strip())
    return ids


def summarize_hazard_action_failures(results: list[dict[str, Any]] | None) -> list[str]:
    """汇总联动动作执行结果，返回失败项的人类可读描述列表。"""
    out: list[str] = []
    for item in results or []:
        if not isinstance(item, dict) or item.get("ok"):
            continue
        action = "关阀" if item.get("action") == "close_valve" else "排风"
        out.append(f"{item.get('target')}({action})")
    return out


__all__ = [
    "HAZARD_BINDING_FIELDS",
    "HazardSensorKind",
    "build_hazard_binding_map",
    "collect_hazard_binding_summary",
    "collect_hazard_watched_entity_ids",
    "detect_hazard_binding_conflicts",
    "format_hazard_binding_summary_text",
    "format_security_alarm_message",
    "has_any_hazard_sensor_binding",
    "parse_hazard_entity_id_list",
    "summarize_hazard_action_failures",
]
