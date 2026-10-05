"""设备快照恢复调用构建（对齐 shared/home-exec/snapshot-restore.util.ts）。

根据激活前采集的实体 state+attributes 计算出恢复时应下发的 HA 服务调用序列；
不可用 / 未知状态返回空列表（避免对 unknown 实体下发无效服务）。
"""

from __future__ import annotations

from typing import Any

from ...core.entity_domain import get_entity_domain

#: 支持 turn_on / turn_off 的域（默认分支可用）；其余域无此服务，跳过恢复。
SWITCHABLE_DOMAINS = frozenset(
    {
        "switch",
        "fan",
        "humidifier",
        "air_purifier",
        "dehumidifier",
        "siren",
        "water_heater",
        "vacuum",
        "remote",
        "script",
        "scene",
        "automation",
        "input_boolean",
    }
)


def _call(domain: str, service: str, entity_id: str, data: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"domain": domain, "service": service, "entityId": entity_id, "data": data or {}}


def build_snapshot_restore_calls(entity_id: str, snap: dict[str, Any] | None) -> list[dict[str, Any]]:
    snapshot = snap if isinstance(snap, dict) else {}
    domain = get_entity_domain(entity_id)
    state = snapshot.get("state")
    attrs = snapshot.get("attributes") if isinstance(snapshot.get("attributes"), dict) else {}

    if not state or state in ("unavailable", "unknown"):
        return []

    if domain == "light":
        if state == "off":
            return [_call("light", "turn_off", entity_id)]
        data: dict[str, Any] = {}
        if attrs.get("brightness") is not None:
            data["brightness"] = attrs["brightness"]
        if attrs.get("color_temp") is not None:
            data["color_temp"] = attrs["color_temp"]
        if attrs.get("rgb_color"):
            data["rgb_color"] = attrs["rgb_color"]
        if attrs.get("kelvin") is not None:
            data["kelvin"] = attrs["kelvin"]
        return [_call("light", "turn_on", entity_id, data)]

    if domain == "climate":
        if state == "off":
            return [_call("climate", "set_hvac_mode", entity_id, {"hvac_mode": "off"})]
        calls: list[dict[str, Any]] = []
        restore_mode = attrs.get("hvac_mode") or state
        if restore_mode:
            calls.append(_call("climate", "set_hvac_mode", entity_id, {"hvac_mode": restore_mode}))
        if attrs.get("temperature") is not None:
            calls.append(
                _call("climate", "set_temperature", entity_id, {"temperature": attrs["temperature"]})
            )
        return calls

    if domain == "cover":
        if attrs.get("current_position") is not None:
            return [
                _call("cover", "set_cover_position", entity_id, {"position": attrs["current_position"]})
            ]
        service = "close_cover" if state in ("closed", "off", "closing") else "open_cover"
        return [_call("cover", service, entity_id)]

    if domain == "media_player":
        if state in ("off", "idle", "standby"):
            return [_call("media_player", "turn_off", entity_id)]
        calls = [_call("media_player", "turn_on", entity_id)]
        if attrs.get("volume_level") is not None:
            calls.append(
                _call("media_player", "volume_set", entity_id, {"volume_level": attrs["volume_level"]})
            )
        return calls

    if domain not in SWITCHABLE_DOMAINS:
        return []
    service = "turn_off" if state in ("off", "closed") else "turn_on"
    return [_call(domain, service, entity_id)]
