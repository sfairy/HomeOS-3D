"""实体反向引用查询与解绑（对齐 ``state-store/entity-references*.ts``）。

职责：
- 本地资源（告警规则 / 家庭模式）由倒排索引覆盖（一次全表扫描服务多次查询）；
- 布局 / 系统配置引用按实体补扫；
- 倒排索引 + 60s TTL 缓存抑制面板重复扫描；
- ``remove_reference`` 按 kinds 分发到具体配置中安全移除实体引用。

依赖：``session_factory``（Prisma 等价）、``app_config``、``ui_config``、
``alert_rule_watch_index``，以及可选 ``update_home_mode`` / ``delete_alert_rule`` 回调。
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from collections.abc import Callable
from typing import Any

logger = logging.getLogger("homeos.state_store.entity_references")

#: 引用类型（kind）全集 —— 对齐 ``@homeos/shared`` ``EntityReferenceKind``。
ENTITY_REFERENCE_KINDS = (
    "automation",
    "scene",
    "script",
    "template",
    "home_mode",
    "alert_rule",
    "favorite",
    "hotspot",
    "widget",
    "binding",
    "security_mode",
    "security_zone",
    "env_sensor",
    "system_config",
    "footer",
    "whole_home_off",
    "media",
    "other",
)

#: 引用角色 —— 对齐 ``EntityReferenceRole``。
ENTITY_REFERENCE_ROLES = (
    "trigger",
    "condition",
    "action",
    "member",
    "watch",
    "binding",
    "display",
    "favorite",
    "config",
    "reference",
)


# ---------------------------------------------------------------------- #
# 工具函数（对齐 entity-references.util.ts）
# ---------------------------------------------------------------------- #
def _escape_regexp(text: str) -> str:
    return re.escape(text)


def text_contains_entity_id(text: str, entity_id: str) -> bool:
    """文本是否包含完整 entity_id（避免 light.a 命中 light.abc）。"""
    if not text or not entity_id:
        return False
    if text == entity_id:
        return True
    pattern = re.compile(
        r"(?:^|[^A-Za-z0-9_])" + _escape_regexp(entity_id) + r"(?:[^A-Za-z0-9_]|$)"
    )
    return bool(pattern.search(text))


def safe_parse_json(raw: Any) -> Any:
    """安全解析 JSON（对象 / 数组直通；字符串尝试解析；其余 → None）。"""
    if raw is None:
        return None
    if isinstance(raw, (dict, list)):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (ValueError, TypeError):
            return None
    return None


def collect_entity_paths(
    value: Any,
    entity_id: str,
    path: str = "",
    out: list[str] | None = None,
    mode: str = "exact",
) -> list[str]:
    """在任意 JSON 值中收集命中路径（mode=exact|contains）。"""
    if out is None:
        out = []
    if value is None:
        return out

    if isinstance(value, str):
        hit = value == entity_id or (mode == "contains" and text_contains_entity_id(value, entity_id))
        if hit:
            out.append(path or "value")
        return out

    if isinstance(value, list):
        for index, item in enumerate(value):
            child_path = f"{path}[{index}]" if path else f"[{index}]"
            collect_entity_paths(item, entity_id, child_path, out, mode)
        return out

    if isinstance(value, dict):
        for key, child in value.items():
            next_path = f"{path}.{key}" if path else str(key)
            collect_entity_paths(child, entity_id, next_path, out, mode)
    return out


def path_looks_like_trigger(path: str) -> bool:
    return bool(re.search("trigger", path, re.IGNORECASE))


def path_looks_like_action(path: str) -> bool:
    return bool(re.search("action|service|call", path, re.IGNORECASE))


#: 实体承载字段名集合：对象中出现这些 key 且值匹配 entityId 时，视为以实体为主键。
_ENTITY_FIELD_KEYS = ("entity_id", "entityId", "entityIds", "entity_ids", "id", "target")


def _is_entity_bearing_object(value: Any, entity_id: str) -> bool:
    if not isinstance(value, dict):
        return False
    for key in _ENTITY_FIELD_KEYS:
        v = value.get(key)
        if isinstance(v, str) and v == entity_id:
            return True
        if isinstance(v, list) and any(str(x) == entity_id for x in v):
            return True
    return False


def remove_entity_from_json_value(value: Any, entity_id: str) -> tuple[Any, bool]:
    """从 JSON 值中移除实体引用，返回 ``(新值, 是否变更)``。"""
    if value is None:
        return value, False

    if isinstance(value, str):
        if value == entity_id:
            return "", True
        return value, False

    if isinstance(value, list):
        changed = False
        next_items: list[Any] = []
        for item in value:
            if isinstance(item, str):
                if item == entity_id:
                    changed = True
                    continue
                next_items.append(item)
                continue
            if _is_entity_bearing_object(item, entity_id):
                changed = True
                continue
            nested_value, nested_changed = remove_entity_from_json_value(item, entity_id)
            if nested_changed:
                changed = True
            next_items.append(nested_value)
        return next_items, changed

    if isinstance(value, dict):
        out: dict[str, Any] = {}
        changed = False
        for key, child in value.items():
            if key in ("entity_id", "entityId", "id") and isinstance(child, str) and child == entity_id:
                out[key] = ""
                changed = True
                continue
            if key in ("entityIds", "entity_ids") and isinstance(child, list):
                filtered = [x for x in child if str(x) != entity_id]
                if len(filtered) != len(child):
                    changed = True
                out[key] = filtered
                continue
            nested_value, nested_changed = remove_entity_from_json_value(child, entity_id)
            if nested_changed:
                changed = True
            out[key] = nested_value
        return out, changed

    return value, False


# ---------------------------------------------------------------------- #
# 倒排索引（对齐 entity-references-index.ts）
# ---------------------------------------------------------------------- #
def _push_reference(
    mapping: dict[str, list[dict[str, Any]]], entity_id: str, item: dict[str, Any]
) -> None:
    bucket = mapping.setdefault(entity_id, [])
    key = f"{item['kind']}:{item['id']}:{item['role']}:{item.get('detail') or ''}"
    if any(
        f"{x['kind']}:{x['id']}:{x['role']}:{x.get('detail') or ''}" == key for x in bucket
    ):
        return
    bucket.append(item)


def build_entity_references_inverted_index(session_factory: Any) -> dict[str, list[dict[str, Any]]]:
    """一次扫描本地资源（告警规则 / 家庭模式），构建 entityId → references 倒排索引。"""
    from ...core.models import AlertRule, HomeMode

    mapping: dict[str, list[dict[str, Any]]] = {}
    with session_factory() as session:
        alerts = session.query(AlertRule).limit(500).all()
        home_modes = session.query(HomeMode).limit(200).all()

        alert_rows = [
            {"id": r.id, "name": r.name, "entityId": r.entity_id, "enabled": r.enabled}
            for r in alerts
        ]
        home_mode_rows = [
            {"id": r.id, "name": r.name, "config": r.config, "triggers": r.triggers}
            for r in home_modes
        ]

    for row in alert_rows:
        eid = str(row.get("entityId") or "").strip()
        if "." not in eid:
            continue
        _push_reference(
            mapping,
            eid,
            {
                "kind": "alert_rule",
                "id": row["id"],
                "name": row.get("name") or "未命名告警",
                "role": "watch",
                "enabled": bool(row.get("enabled")),
                "path": "/settings?tab=alerts",
            },
        )

    def _collect_ids(node: Any, ids: set[str]) -> None:
        if not node:
            return
        if isinstance(node, str) and "." in node:
            ids.add(node)
        if isinstance(node, list):
            for x in node:
                _collect_ids(x, ids)
            return
        if isinstance(node, dict):
            for v in node.values():
                _collect_ids(v, ids)

    for row in home_mode_rows:
        config_obj = safe_parse_json(row.get("config"))
        trigger_obj = safe_parse_json(row.get("triggers"))
        walk_ids: set[str] = set()
        _collect_ids(config_obj, walk_ids)
        _collect_ids(trigger_obj, walk_ids)
        for eid in walk_ids:
            if "." not in eid:
                continue
            config_paths = collect_entity_paths(config_obj, eid)
            trigger_paths = collect_entity_paths(trigger_obj, eid)
            if trigger_paths or path_looks_like_trigger(trigger_paths[0] if trigger_paths else ""):
                role = "trigger"
            elif config_paths and path_looks_like_action(config_paths[0]):
                role = "action"
            elif config_paths:
                role = "config"
            else:
                role = "reference"
            _push_reference(
                mapping,
                eid,
                {
                    "kind": "home_mode",
                    "id": row["id"],
                    "name": row.get("name") or "家庭模式",
                    "role": role,
                    "path": f"/settings?tab=home-mode&id={row['id']}",
                },
            )
    return mapping


# ---------------------------------------------------------------------- #
# 布局 / 系统配置扫描（对齐 entity-references-scanners.helper.ts）
# ---------------------------------------------------------------------- #
def _push(items: list[dict[str, Any]], item: dict[str, Any], seen: set[str]) -> None:
    key = f"{item['kind']}:{item['id']}:{item['role']}:{item.get('detail') or ''}"
    if key in seen:
        return
    seen.add(key)
    items.append(item)


def scan_layout_and_system(deps: dict[str, Any], entity_id: str, items: list[dict[str, Any]]) -> None:
    """扫描布局配置（projectConfig.layout）与系统配置（app_config）中的实体引用。"""
    seen = {f"{i['kind']}:{i['id']}:{i['role']}:{i.get('detail') or ''}" for i in items}
    try:
        layout = deps["load_layout"]()
        if isinstance(layout, dict) and layout:
            _scan_layout_object(entity_id, layout, items, seen)
    except Exception as exc:  # noqa: BLE001
        logger.warning("扫描布局引用失败: %s", exc)

    try:
        _scan_system_config(deps, entity_id, items, seen)
    except Exception as exc:  # noqa: BLE001
        logger.warning("扫描系统配置引用失败: %s", exc)


def _scan_layout_object(
    entity_id: str, layout: dict[str, Any], items: list[dict[str, Any]], seen: set[str]
) -> None:
    # 收藏
    favorites = layout.get("favoriteEntities")
    if isinstance(favorites, dict):
        for domain, value in favorites.items():
            if isinstance(value, list) and any(str(x) == entity_id for x in value):
                _push(
                    items,
                    {
                        "kind": "favorite",
                        "id": f"favorite:{domain}",
                        "name": f"收藏 · {domain}",
                        "role": "favorite",
                        "path": "/settings?tab=favorites",
                    },
                    seen,
                )

    # 户型图热点（widget.id = entity_id）
    floors = layout.get("floors") if isinstance(layout.get("floors"), list) else []
    for floor_idx, floor in enumerate(floors):
        if not isinstance(floor, dict):
            continue
        floor_name = str(floor.get("name") or floor.get("id") or f"楼层{floor_idx + 1}")
        widgets = floor.get("widgets") if isinstance(floor.get("widgets"), list) else []
        for widget_idx, widget in enumerate(widgets):
            if not isinstance(widget, dict):
                continue
            if str(widget.get("id") or "") != entity_id:
                continue
            _push(
                items,
                {
                    "kind": "hotspot",
                    "id": f"hotspot:{floor_idx}:{widget_idx}",
                    "name": f"{floor_name} · 热点",
                    "role": "display",
                    "detail": str(widget.get("label") or entity_id),
                    "path": "/settings?tab=layout",
                },
                seen,
            )

    # 右侧 / 浮动面板组件
    panel_widgets = [
        *(layout.get("rightPanelWidgets") if isinstance(layout.get("rightPanelWidgets"), list) else []),
        *(layout.get("floatingWidgets") if isinstance(layout.get("floatingWidgets"), list) else []),
    ]
    for idx, widget in enumerate(panel_widgets):
        if not isinstance(widget, dict):
            continue
        paths = collect_entity_paths(widget, entity_id)
        if not paths:
            continue
        widget_type = str(widget.get("type") or "widget")
        config = widget.get("config") if isinstance(widget.get("config"), dict) else {}
        config_title = str(config.get("title") or "") if isinstance(config, dict) else ""
        _push(
            items,
            {
                "kind": "widget",
                "id": str(widget.get("id") or f"widget:{idx}"),
                "name": config_title or widget_type,
                "role": "display",
                "detail": paths[0],
                "path": "/settings?tab=widgets",
            },
            seen,
        )

    # HA 绑定
    ha_config = layout.get("haConfig") if isinstance(layout.get("haConfig"), dict) else {}
    _scan_ha_bindings(entity_id, ha_config, items, seen)

    # 页脚
    footer = layout.get("dashboardFooter")
    if footer:
        paths = collect_entity_paths(footer, entity_id)
        if paths:
            _push(
                items,
                {
                    "kind": "footer",
                    "id": "dashboard-footer",
                    "name": "仪表盘页脚",
                    "role": "display",
                    "detail": paths[0],
                    "path": "/settings?tab=general&section=footer",
                },
                seen,
            )

    # 全屋关闭
    whole_home_off = layout.get("wholeHomeOff")
    if whole_home_off:
        paths = collect_entity_paths(whole_home_off, entity_id)
        if paths:
            _push(
                items,
                {
                    "kind": "whole_home_off",
                    "id": "whole-home-off",
                    "name": "全屋关闭",
                    "role": "config",
                    "detail": paths[0],
                    "path": "/settings?tab=general",
                },
                seen,
            )

    # 安防模式动作
    security_modes = layout.get("securityModes") if isinstance(layout.get("securityModes"), list) else []
    for idx, mode in enumerate(security_modes):
        if not isinstance(mode, dict):
            continue
        paths = collect_entity_paths(mode, entity_id)
        if not paths:
            continue
        _push(
            items,
            {
                "kind": "security_mode",
                "id": str(mode.get("key") or f"security-mode:{idx}"),
                "name": str(mode.get("name") or mode.get("key") or "安防模式"),
                "role": "action" if path_looks_like_action(paths[0]) else "config",
                "detail": paths[0],
                "path": "/settings?tab=security-modes",
            },
            seen,
        )

    # 紧急配置 / 离家模拟灯池 / 统计传感器 / 移动端房间统计
    simple_bindings = (
        ("securityEmergency", "紧急配置", "/settings?tab=security-modes", "security_mode"),
        ("awaySimulationLightPool", "离家模拟灯池", "/settings?tab=params", "binding"),
        ("statsSensors", "统计传感器", "/settings?tab=bindings", "binding"),
        ("mobileRoomStats", "移动端房间统计", "/settings?tab=rooms", "binding"),
    )
    for key, label, path, kind in simple_bindings:
        value = layout.get(key)
        if not value:
            continue
        paths = collect_entity_paths(value, entity_id)
        if not paths:
            continue
        _push(
            items,
            {"kind": kind, "id": key, "name": label, "role": "config", "detail": paths[0], "path": path},
            seen,
        )

    # 安防区域：layout.securityZones 与 haConfig.zones 双源
    layout_zones = layout.get("securityZones") if isinstance(layout.get("securityZones"), list) else []
    ha_zones = ha_config.get("zones") if isinstance(ha_config.get("zones"), list) else []
    if layout_zones and ha_zones:
        zone_lists = [layout_zones, ha_zones]
    else:
        zone_lists = [layout_zones or ha_zones]
    for zone_list in zone_lists:
        for idx, zone in enumerate(zone_list):
            if not isinstance(zone, dict):
                continue
            paths = collect_entity_paths(zone, entity_id)
            if not paths:
                continue
            _push(
                items,
                {
                    "kind": "security_zone",
                    "id": str(zone.get("id") or zone.get("name") or f"zone:{idx}"),
                    "name": str(zone.get("name") or zone.get("id") or f"安防区域 {idx + 1}"),
                    "role": "watch",
                    "detail": paths[0],
                    "path": "/settings?tab=bindings&section=security",
                },
                seen,
            )


def _scan_ha_bindings(
    entity_id: str, ha_config: dict[str, Any], items: list[dict[str, Any]], seen: set[str]
) -> None:
    binding_labels = (
        (("securityCamera", "securityCameras"), "安防摄像头"),
        (("weatherEntityId",), "天气实体"),
        (("motionSensorEntityId",), "人体传感器"),
        (("hazardSmokeEntityIds",), "烟感绑定"),
        (("hazardGasEntityIds",), "燃气绑定"),
        (("hazardLeakEntityIds",), "水浸绑定"),
        (("hazardGasValveEntityId",), "燃气阀"),
        (("hazardWaterValveEntityId",), "水阀"),
        (("hazardExhaustFanEntityIds",), "排风"),
    )
    for keys, label in binding_labels:
        for key in keys:
            value = ha_config.get(key)
            paths = collect_entity_paths(value, entity_id)
            if not paths and isinstance(value, str) and value == entity_id:
                paths.append(key)
            if not paths:
                continue
            _push(
                items,
                {
                    "kind": "binding",
                    "id": f"ha:{key}",
                    "name": label,
                    "role": "binding",
                    "detail": key,
                    "path": "/settings?tab=bindings",
                },
                seen,
            )
            break

    doorbells = ha_config.get("doorbells") if isinstance(ha_config.get("doorbells"), list) else []
    for idx, bell in enumerate(doorbells):
        paths = collect_entity_paths(bell, entity_id)
        if not paths:
            continue
        b = bell if isinstance(bell, dict) else {}
        _push(
            items,
            {
                "kind": "binding",
                "id": f"doorbell:{idx}",
                "name": str(b.get("name") or f"门铃 {idx + 1}"),
                "role": "binding",
                "detail": paths[0],
                "path": "/settings?tab=bindings",
            },
            seen,
        )


def _scan_system_config(
    deps: dict[str, Any], entity_id: str, items: list[dict[str, Any]], seen: set[str]
) -> None:
    cfg = deps["app_config"].get_all_raw() or {}

    for room_id, room in (cfg.get("envSensorMap") or {}).items():
        if not isinstance(room, dict):
            continue
        paths = collect_entity_paths(room, entity_id)
        if not paths:
            continue
        label = room.get("label") or room_id
        _push(
            items,
            {
                "kind": "env_sensor",
                "id": f"env:{room_id}",
                "name": f"环境映射 · {label}",
                "role": "binding",
                "detail": paths[0],
                "path": "/settings?tab=bindings&section=environment",
            },
            seen,
        )

    security = cfg.get("security") if isinstance(cfg.get("security"), dict) else {}
    for person in security.get("presencePersons") or []:
        if not isinstance(person, dict) or entity_id not in (person.get("entityIds") or []):
            continue
        _push(
            items,
            {
                "kind": "system_config",
                "id": f"presence:{person.get('id')}",
                "name": f"在家判定 · {person.get('name') or person.get('id')}",
                "role": "watch",
                "path": "/settings?tab=bindings&section=security",
            },
            seen,
        )

    circadian = cfg.get("circadian") if isinstance(cfg.get("circadian"), dict) else {}
    water = cfg.get("water") if isinstance(cfg.get("water"), dict) else {}
    energy = cfg.get("energy") if isinstance(cfg.get("energy"), dict) else {}
    voice = cfg.get("voice") if isinstance(cfg.get("voice"), dict) else {}
    simple_bindings = (
        (circadian.get("weatherEntityId") == entity_id, "circadian-weather", "昼夜节律 · 天气", "/settings?tab=bindings", None),
        (water.get("mainValveEntityId") == entity_id, "water-main-valve", "用水 · 总阀", "/settings?tab=bindings", None),
        (energy.get("meterEntityId") == entity_id, "energy-meter", "能源 · 主电表", "/settings?tab=bindings", None),
        (
            entity_id in (energy.get("circuitEntityIds") or []),
            "energy-circuit",
            "能源 · 分路",
            "/settings?tab=bindings",
            None,
        ),
        (voice.get("sttEntityId") == entity_id, "voice-stt", "语音 · STT", "/settings?tab=voice", None),
    )
    for hit, item_id, name, path, kind in simple_bindings:
        if not hit:
            continue
        _push(
            items,
            {
                "kind": kind or "system_config",
                "id": item_id,
                "name": name,
                "role": "binding",
                "path": path,
            },
            seen,
        )

    for rule in voice.get("entityTtsAlerts") or []:
        if not isinstance(rule, dict) or rule.get("entityId") != entity_id:
            continue
        _push(
            items,
            {
                "kind": "system_config",
                "id": f"tts-alert:{rule.get('entityId')}",
                "name": "语音 · 实体播报",
                "role": "watch",
                "path": "/settings?tab=voice",
            },
            seen,
        )

    client_power = cfg.get("clientPower") if isinstance(cfg.get("clientPower"), dict) else {}
    for client in client_power.get("clients") or []:
        if not isinstance(client, dict) or client.get("chargerSwitchEntityId") != entity_id:
            continue
        _push(
            items,
            {
                "kind": "system_config",
                "id": f"client-power:{client.get('id')}",
                "name": f"客户端电源 · {client.get('label') or client.get('id')}",
                "role": "binding",
                "path": "/settings?tab=smart-charge",
            },
            seen,
        )

    media_playlists = cfg.get("mediaPlaylists")
    if isinstance(media_playlists, dict) and entity_id in media_playlists:
        _push(
            items,
            {
                "kind": "media",
                "id": f"playlist:{entity_id}",
                "name": "影音播放列表",
                "role": "config",
                "path": "/settings?tab=widgets",
            },
            seen,
        )

    ops = cfg.get("ops") if isinstance(cfg.get("ops"), dict) else {}
    block_list = ops.get("eventLogRecordBlockEntityIds")
    if isinstance(block_list, list) and entity_id in block_list:
        _push(
            items,
            {
                "kind": "system_config",
                "id": "event-log-block",
                "name": "事件日志屏蔽",
                "role": "config",
                "path": "/settings?tab=connection",
            },
            seen,
        )


# ---------------------------------------------------------------------- #
# 解绑执行器（对齐 entity-references-unlink.ts）
# ---------------------------------------------------------------------- #
def _fail(message: str) -> dict[str, Any]:
    return {"ok": False, "message": message}


def _ok(action: str, message: str | None = None, layout_touched: bool = False) -> dict[str, Any]:
    return {"ok": True, "action": action, "message": message, "layoutTouched": layout_touched}


def _unlink_home_mode(deps: dict[str, Any], mode_id: str, entity_id: str) -> dict[str, Any]:
    from ...core.models import HomeMode

    with deps["session_factory"]() as session:
        row = session.get(HomeMode, mode_id)
        if row is None:
            return _fail("家庭模式不存在")
        config_parsed = safe_parse_json(row.config) or []
        triggers_parsed = safe_parse_json(row.triggers) or []
    config_next, config_changed = remove_entity_from_json_value(config_parsed, entity_id)
    triggers_next, triggers_changed = remove_entity_from_json_value(triggers_parsed, entity_id)
    if not config_changed and not triggers_changed:
        return _fail("家庭模式中未找到该实体")

    update_home_mode = deps.get("update_home_mode")
    if update_home_mode is not None:
        update_home_mode(mode_id, {"config": config_next, "triggers": triggers_next})
    else:
        with deps["session_factory"]() as session:
            row = session.get(HomeMode, mode_id)
            if row is not None:
                row.config = json.dumps(config_next, ensure_ascii=False)
                row.triggers = json.dumps(triggers_next, ensure_ascii=False)
                session.commit()
    return _ok("filtered", "已从家庭模式动作/触发中移除")


def _unlink_alert_rule(deps: dict[str, Any], rule_id: str) -> dict[str, Any]:
    from ...core.models import AlertRule

    delete_alert_rule = deps.get("delete_alert_rule")
    if delete_alert_rule is not None:
        res = delete_alert_rule(rule_id)
        if not (isinstance(res, dict) and res.get("success")):
            return _fail("删除告警规则失败")
        return _ok("deleted_rule", "已删除告警规则")

    try:
        with deps["session_factory"]() as session:
            row = session.get(AlertRule, rule_id)
            if row is None:
                return _fail("告警规则不存在或删除失败")
            session.delete(row)
            session.commit()
    except Exception:  # noqa: BLE001
        return _fail("告警规则不存在或删除失败")

    watch_index = deps.get("alert_rule_watch_index")
    if watch_index is not None:
        with deps["session_factory"]() as session:
            remaining = session.query(AlertRule).filter(AlertRule.enabled.is_(True)).limit(1000).all()
        watch_index.update_from_rules(
            [{"entityId": r.entity_id, "enabled": r.enabled} for r in remaining]
        )
    return _ok("deleted_rule", "已删除告警规则")


def _unlink_favorite(deps: dict[str, Any], item_id: str, entity_id: str) -> dict[str, Any]:
    layout = dict(deps["load_layout"]())
    favorites = layout.get("favoriteEntities")
    favorites = dict(favorites) if isinstance(favorites, dict) else {}
    domain = item_id[len("favorite:") :] if item_id.startswith("favorite:") else ""
    changed = False
    if domain and isinstance(favorites.get(domain), list):
        current = favorites[domain]
        filtered = [x for x in current if str(x) != entity_id]
        if len(filtered) != len(current):
            favorites[domain] = filtered
            changed = True
    else:
        for key, value in list(favorites.items()):
            if not isinstance(value, list):
                continue
            filtered = [x for x in value if str(x) != entity_id]
            if len(filtered) != len(value):
                favorites[key] = filtered
                changed = True
    if not changed:
        return _fail("收藏中未找到该实体")
    layout["favoriteEntities"] = favorites
    deps["save_layout"](layout)
    return _ok("filtered", "已从收藏移除", True)


def _unlink_hotspot(deps: dict[str, Any], item_id: str, entity_id: str) -> dict[str, Any]:
    layout = dict(deps["load_layout"]())
    floors = list(layout.get("floors")) if isinstance(layout.get("floors"), list) else []
    changed = False
    match = re.fullmatch(r"hotspot:(\d+):(\d+)", item_id)
    next_floors: list[Any] = []
    for floor_idx, floor in enumerate(floors):
        if not isinstance(floor, dict):
            next_floors.append(floor)
            continue
        f = dict(floor)
        widgets = list(f.get("widgets")) if isinstance(f.get("widgets"), list) else []
        next_widgets: list[Any] = []
        for widget_idx, widget in enumerate(widgets):
            if not isinstance(widget, dict):
                next_widgets.append(widget)
                continue
            if match is not None:
                keep = not (floor_idx == int(match.group(1)) and widget_idx == int(match.group(2)))
                if not keep:
                    changed = True
                if keep:
                    next_widgets.append(widget)
                continue
            if str(widget.get("id") or "") == entity_id:
                changed = True
                continue
            next_widgets.append(widget)
        f["widgets"] = next_widgets
        next_floors.append(f)
    if not changed:
        return _fail("未找到对应热点")
    layout["floors"] = next_floors
    deps["save_layout"](layout)
    return _ok("deleted_widget", "已移除户型图热点", True)


def _unlink_layout_json_field(
    deps: dict[str, Any], kind: str, item_id: str, entity_id: str
) -> dict[str, Any]:
    layout = dict(deps["load_layout"]())
    changed = False

    if kind == "widget":
        widget_index_match = re.fullmatch(r"widget:(\d+)", item_id)
        combined_idx = 0

        def strip_widgets(source: list[Any]) -> list[Any]:
            nonlocal combined_idx, changed
            out: list[Any] = []
            for widget in source:
                current_idx = combined_idx
                combined_idx += 1
                if not isinstance(widget, dict):
                    out.append(widget)
                    continue
                widget_key = str(widget.get("id") or f"widget:{current_idx}")
                targeted = widget_key == item_id or (
                    widget_index_match is not None and current_idx == int(widget_index_match.group(1))
                )
                if not targeted:
                    out.append(widget)
                    continue
                if str(widget.get("id") or "") == entity_id:
                    changed = True
                    continue
                nested_value, nested_changed = remove_entity_from_json_value(widget, entity_id)
                if not nested_changed:
                    out.append(widget)
                    continue
                changed = True
                out.append(nested_value)
            return out

        if isinstance(layout.get("rightPanelWidgets"), list):
            layout["rightPanelWidgets"] = strip_widgets(list(layout["rightPanelWidgets"]))
        if isinstance(layout.get("floatingWidgets"), list):
            layout["floatingWidgets"] = strip_widgets(list(layout["floatingWidgets"]))
    elif kind == "binding":
        ha = dict(layout.get("haConfig")) if isinstance(layout.get("haConfig"), dict) else {}
        if item_id.startswith("ha:"):
            key = item_id[3:]
            if key in ha:
                nested_value, nested_changed = remove_entity_from_json_value(ha[key], entity_id)
                if nested_changed:
                    ha[key] = nested_value
                    changed = True
        elif item_id.startswith("doorbell:"):
            idx = item_id[len("doorbell:") :]
            doorbells = list(ha.get("doorbells")) if isinstance(ha.get("doorbells"), list) else []
            if idx.isdigit() and 0 <= int(idx) < len(doorbells):
                i = int(idx)
                nested_value, nested_changed = remove_entity_from_json_value(doorbells[i], entity_id)
                if nested_changed:
                    doorbells[i] = nested_value
                    ha["doorbells"] = doorbells
                    changed = True
        elif item_id in ("statsSensors", "awaySimulationLightPool", "mobileRoomStats"):
            nested_value, nested_changed = remove_entity_from_json_value(layout.get(item_id), entity_id)
            if nested_changed:
                layout[item_id] = nested_value
                changed = True
        else:
            nested_value, nested_changed = remove_entity_from_json_value(ha, entity_id)
            if nested_changed and isinstance(nested_value, dict):
                ha = nested_value
                changed = True
        layout["haConfig"] = ha
    elif kind == "footer" and layout.get("dashboardFooter"):
        nested_value, nested_changed = remove_entity_from_json_value(layout["dashboardFooter"], entity_id)
        if nested_changed:
            layout["dashboardFooter"] = nested_value
            changed = True
    elif kind == "whole_home_off" and layout.get("wholeHomeOff"):
        nested_value, nested_changed = remove_entity_from_json_value(layout["wholeHomeOff"], entity_id)
        if nested_changed:
            layout["wholeHomeOff"] = nested_value
            changed = True
    elif kind == "security_mode":
        if item_id == "securityEmergency" and layout.get("securityEmergency"):
            nested_value, nested_changed = remove_entity_from_json_value(layout["securityEmergency"], entity_id)
            if nested_changed:
                layout["securityEmergency"] = nested_value
                changed = True
        else:
            modes = list(layout.get("securityModes")) if isinstance(layout.get("securityModes"), list) else []
            next_modes: list[Any] = []
            for mode in modes:
                if not isinstance(mode, dict) or str(mode.get("key") or "") != item_id:
                    next_modes.append(mode)
                    continue
                nested_value, nested_changed = remove_entity_from_json_value(mode, entity_id)
                if nested_changed:
                    changed = True
                    next_modes.append(nested_value)
                else:
                    next_modes.append(mode)
            layout["securityModes"] = next_modes
    elif kind == "security_zone":
        ha = dict(layout.get("haConfig")) if isinstance(layout.get("haConfig"), dict) else {}

        def _unlink_zone_list(zone_list: list[Any]) -> tuple[list[Any], bool]:
            out: list[Any] = []
            touched = False
            for idx, zone in enumerate(zone_list):
                if not isinstance(zone, dict):
                    out.append(zone)
                    continue
                zone_key = str(zone.get("id") or zone.get("name") or f"zone:{idx}")
                if zone_key != item_id:
                    out.append(zone)
                    continue
                nested_value, nested_changed = remove_entity_from_json_value(zone, entity_id)
                if nested_changed:
                    touched = True
                    out.append(nested_value)
                else:
                    out.append(zone)
            return out, touched

        if isinstance(layout.get("securityZones"), list):
            zoned, touched = _unlink_zone_list(list(layout["securityZones"]))
            layout["securityZones"] = zoned
            changed = changed or touched
        if isinstance(ha.get("zones"), list):
            zoned, touched = _unlink_zone_list(list(ha["zones"]))
            ha["zones"] = zoned
            layout["haConfig"] = ha
            changed = changed or touched

    if not changed:
        return _fail("未找到可移除的布局引用")
    deps["save_layout"](layout)
    action = "deleted_widget" if kind in ("hotspot", "widget") else "cleared"
    return _ok(action, "已从布局配置移除", True)


def _unlink_system_config(
    deps: dict[str, Any], kind: str, item_id: str, entity_id: str
) -> dict[str, Any]:
    cfg = deps["app_config"].get_all_raw() or {}
    patch: dict[str, Any] = {}

    if kind == "env_sensor" and item_id.startswith("env:"):
        room_id = item_id[4:]
        room = dict((cfg.get("envSensorMap") or {}).get(room_id) or {})
        nested_value, nested_changed = remove_entity_from_json_value(room, entity_id)
        if not nested_changed:
            return _fail("环境映射中未找到该实体")
        patch["envSensorMap"] = {**(cfg.get("envSensorMap") or {}), room_id: nested_value}
    elif kind == "media" and item_id.startswith("playlist:"):
        playlists = dict(cfg.get("mediaPlaylists") or {})
        if entity_id not in playlists:
            return _fail("未找到影音播放列表")
        playlists.pop(entity_id, None)
        patch["mediaPlaylists"] = playlists
    elif kind == "system_config":
        security = dict(cfg.get("security") or {})
        voice = dict(cfg.get("voice") or {})
        energy = dict(cfg.get("energy") or {})
        if item_id.startswith("presence:"):
            person_id = item_id[len("presence:") :]
            persons = [
                (
                    {**p, "entityIds": [x for x in (p.get("entityIds") or []) if x != entity_id]}
                    if p.get("id") == person_id
                    else p
                )
                for p in (security.get("presencePersons") or [])
            ]
            patch["security"] = {**security, "presencePersons": persons}
        elif item_id == "circadian-weather":
            patch["circadian"] = {**dict(cfg.get("circadian") or {}), "weatherEntityId": ""}
        elif item_id == "water-main-valve":
            patch["water"] = {**dict(cfg.get("water") or {}), "mainValveEntityId": ""}
        elif item_id == "energy-meter":
            patch["energy"] = {**energy, "meterEntityId": ""}
        elif item_id == "energy-circuit":
            patch["energy"] = {
                **energy,
                "circuitEntityIds": [x for x in (energy.get("circuitEntityIds") or []) if x != entity_id],
            }
        elif item_id == "voice-stt":
            patch["voice"] = {**voice, "sttEntityId": ""}
        elif item_id.startswith("tts-alert:"):
            patch["voice"] = {
                **voice,
                "entityTtsAlerts": [
                    r for r in (voice.get("entityTtsAlerts") or []) if r.get("entityId") != entity_id
                ],
            }
        elif item_id.startswith("client-power:"):
            client_id = item_id[len("client-power:") :]
            client_power = dict(cfg.get("clientPower") or {})
            patch["clientPower"] = {
                **client_power,
                "clients": [
                    {**c, "chargerSwitchEntityId": ""} if c.get("id") == client_id else c
                    for c in (client_power.get("clients") or [])
                ],
            }
        elif item_id == "event-log-block":
            ops = dict(cfg.get("ops") or {})
            patch["ops"] = {
                **ops,
                "eventLogRecordBlockEntityIds": [
                    x for x in (ops.get("eventLogRecordBlockEntityIds") or []) if x != entity_id
                ],
            }
        else:
            return _fail("暂不支持移除此系统配置项")
    else:
        return _fail("暂不支持移除此引用类型")

    deps["app_config"].update(patch)
    return _ok("cleared", "已从系统配置移除")


def unlink_entity_reference(
    deps: dict[str, Any], entity_id: str, req: dict[str, Any]
) -> dict[str, Any]:
    """执行单条引用移除，按 kind 分发。"""
    item_id = str(req.get("id") or "").strip()
    kind = req.get("kind")
    if "." not in entity_id or not item_id or not kind:
        return _fail("参数无效")

    if kind == "home_mode":
        return _unlink_home_mode(deps, item_id, entity_id)
    if kind == "alert_rule":
        return _unlink_alert_rule(deps, item_id)
    if kind == "favorite":
        return _unlink_favorite(deps, item_id, entity_id)
    if kind == "hotspot":
        return _unlink_hotspot(deps, item_id, entity_id)
    if kind in ("widget", "binding", "footer", "whole_home_off", "security_mode", "security_zone"):
        return _unlink_layout_json_field(deps, kind, item_id, entity_id)
    if kind in ("env_sensor", "system_config", "media"):
        return _unlink_system_config(deps, kind, item_id, entity_id)
    return _fail("暂不支持移除此引用类型")


class EntityReferencesService:
    """实体反向引用服务（倒排索引 + 60s TTL 缓存）。"""

    REF_CACHE_TTL_MS = 60_000
    INDEX_TTL_MS = 60_000

    def __init__(
        self,
        session_factory: Any,
        app_config: Any,
        ui_config: Any,
        alert_rule_watch_index: Any = None,
        *,
        update_home_mode: Callable[[str, dict[str, Any]], Any] | None = None,
        delete_alert_rule: Callable[[str], Any] | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._app_config = app_config
        self._ui_config = ui_config
        self._watch_index = alert_rule_watch_index
        self._update_home_mode = update_home_mode
        self._delete_alert_rule = delete_alert_rule
        self._ref_cache: dict[str, dict[str, Any]] = {}
        self._inverted_index: dict[str, list[dict[str, Any]]] | None = None
        self._inverted_index_at = 0.0

    def _deps(self) -> dict[str, Any]:
        return {
            "session_factory": self._session_factory,
            "app_config": self._app_config,
            "ui_config": self._ui_config,
            "alert_rule_watch_index": self._watch_index,
            "update_home_mode": self._update_home_mode,
            "delete_alert_rule": self._delete_alert_rule,
            "load_layout": self._load_layout,
            "save_layout": self._save_layout,
        }

    def _load_layout(self) -> dict[str, Any]:
        from ...core.models import ProjectConfig

        with self._session_factory() as session:
            row = (
                session.query(ProjectConfig)
                .filter(ProjectConfig.project_id == "default")
                .one_or_none()
            )
            raw = row.layout if row is not None else None
        parsed = safe_parse_json(raw)
        return parsed if isinstance(parsed, dict) else {}

    def _save_layout(self, layout: dict[str, Any]) -> None:
        self._ui_config.save_config("default", layout)

    async def _ensure_inverted_index(self) -> None:
        if self._inverted_index is not None and (
            time.monotonic() * 1000 - self._inverted_index_at < self.INDEX_TTL_MS
        ):
            return
        loop = asyncio.get_running_loop()
        try:
            self._inverted_index = await loop.run_in_executor(
                None, build_entity_references_inverted_index, self._session_factory
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("实体引用倒排索引构建失败: %s", exc)
            self._inverted_index = self._inverted_index or {}
        self._inverted_index_at = time.monotonic() * 1000

    @staticmethod
    def _to_response(entity_id: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        ordered = sorted(items, key=lambda i: (str(i.get("kind") or ""), str(i.get("name") or "")))
        counts: dict[str, int] = {}
        for item in ordered:
            counts[item["kind"]] = counts.get(item["kind"], 0) + 1
        return {"entityId": entity_id, "total": len(ordered), "counts": counts, "items": ordered}

    async def find_references(self, entity_id: str) -> dict[str, Any]:
        ident = str(entity_id or "").strip()
        if not ident or "." not in ident:
            return {"entityId": ident, "total": 0, "counts": {}, "items": []}

        cached = self._ref_cache.get(ident)
        if cached and time.monotonic() * 1000 - cached["at"] < self.REF_CACHE_TTL_MS:
            return cached["data"]

        await self._ensure_inverted_index()
        items = list((self._inverted_index or {}).get(ident, []))
        await asyncio.get_running_loop().run_in_executor(
            None, scan_layout_and_system, self._deps(), ident, items
        )

        result = self._to_response(ident, items)
        self._ref_cache[ident] = {"at": time.monotonic() * 1000, "data": result}
        return result

    def _invalidate_reference_index(self) -> None:
        self._ref_cache.clear()
        self._inverted_index = None
        self._inverted_index_at = 0.0

    async def remove_reference(self, entity_id: str, req: dict[str, Any]) -> dict[str, Any]:
        ident = str(entity_id or "").strip()
        loop = asyncio.get_running_loop()
        outcome = await loop.run_in_executor(
            None, unlink_entity_reference, self._deps(), ident, req
        )
        self._invalidate_reference_index()
        remaining = await self.find_references(ident)
        return {
            "entityId": ident,
            "ok": bool(outcome.get("ok")),
            "action": outcome.get("action"),
            "message": outcome.get("message"),
            "remaining": remaining,
        }


__all__ = [
    "ENTITY_REFERENCE_KINDS",
    "ENTITY_REFERENCE_ROLES",
    "EntityReferencesService",
    "build_entity_references_inverted_index",
    "collect_entity_paths",
    "path_looks_like_action",
    "path_looks_like_trigger",
    "remove_entity_from_json_value",
    "safe_parse_json",
    "scan_layout_and_system",
    "text_contains_entity_id",
    "unlink_entity_reference",
]
