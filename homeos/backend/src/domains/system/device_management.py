"""设备管理与僵尸绑定清理服务（对齐 ``modules/system/device/device-management.service.ts``）。

扫描范围（与设置页「僵尸绑定清理」文案一一对应）：

- ``layoutWidget``：右侧 / 浮动面板部件（含多实体部件）+ 常用设备收藏；
- ``room``：系统配置 ``envSensorMap`` 的房间环境映射；
- ``stats``：布局里的统计传感器（含能源数据源 / 属性映射 / 多账户）；
- ``haConfig``：布局里的 HA 实体绑定（安防摄像头、门铃、扫地机地图、烟感 / 燃气 / 水浸等）；
- ``alertRule``：告警规则绑定的实体。

``GET system/devices`` 同时返回 ``scan`` 状态：HA 未完成同步时扫描会被跳过，
前端必须把「跳过了」和「扫过了、没有僵尸」区分开，否则空列表会被误读成「一切正常」。
"""

from __future__ import annotations

import asyncio
import copy
import logging
from typing import Any

from sqlalchemy import select

from .zombie_scan import (
    BindingPath,
    build_alive_entity_id_set,
    decode_path,
    encode_path,
    is_entity_id,
    iter_entity_refs,
    remove_entity_at_path,
    should_skip_zombie_scan,
)
from ...platform.core.db.db_exec import run_db
from ...platform.core.db.json_field import object_field
from ...platform.core.db.models import AlertRule, ProjectConfig

logger = logging.getLogger("homeos.system.device_management")

#: 告警规则扫描上限（等价 Prisma ``take: 2000``）
ALERT_RULE_SCAN_LIMIT = 2000
#: 注册表缺失时补拉友好名的实体数量上限
FRIENDLY_NAME_FALLBACK_LIMIT = 30

#: 参与扫描的来源（顺序固定，前端按同一顺序分组）
ZOMBIE_SOURCES = ("layoutWidget", "room", "stats", "haConfig", "alertRule")
#: 存在布局行里的来源：一次重读 + 一次保存，避免逐条写库
LAYOUT_SOURCES = frozenset({"layoutWidget", "stats", "haConfig"})

#: 面板部件两处挂载点：布局键 → 展示位置
WIDGET_LISTS: tuple[tuple[str, str], ...] = (
    ("rightPanelWidgets", "右侧"),
    ("floatingWidgets", "浮动"),
)

ROOM_FIELD_LABELS = {
    "temperature": "温度传感器",
    "humidity": "湿度传感器",
    "pm25": "PM2.5 传感器",
    "co2": "CO₂ 传感器",
    "tvoc": "TVOC 传感器",
    "motion": "人体感应",
    "light": "灯光",
    "climate": "空调",
}
STATS_FIELD_LABELS = {
    "lights": "灯具统计",
    "climates": "空调统计",
    "battery": "电池统计",
    "offline": "离线统计",
}
HA_FIELD_LABELS = {
    "securityCamera": "安防摄像头",
    "weatherEntityId": "天气实体",
    "motionSensorEntityId": "人体传感器",
    "hazardSmokeEntityIds": "烟感",
    "hazardGasEntityIds": "燃气传感器",
    "hazardLeakEntityIds": "水浸传感器",
    "hazardEmergencySceneId": "紧急场景",
    "hazardGasValveEntityId": "燃气关阀",
    "hazardWaterValveEntityId": "漏水关阀",
    "hazardExhaustFanEntityIds": "排风设备",
    "vacuumMaps": "扫地机地图",
    "doorbells": "门铃",
}
HA_NESTED_FIELD_LABELS = {
    "entityId": "摄像头实体",
    "lockEntityId": "门锁",
    "triggerEntityId": "门铃按键",
    "cameraEntityId": "摄像头",
    "vacuumEntityId": "扫地机",
    "mapCameraEntityId": "地图摄像头",
}


def _field_label(path: BindingPath) -> str:
    """取路径里最后一个字段名（跳过数组下标）。"""
    for segment in reversed(path):
        if isinstance(segment, str):
            return segment
    return ""


class DeviceManagementService:
    def __init__(
        self,
        session_factory: Any,
        state_store: Any,
        ui_config: Any,
        ha_connector: Any,
        app_config: Any = None,
    ) -> None:
        self._session_factory = session_factory
        self._state_store = state_store
        self._ui_config = ui_config
        self._ha_connector = ha_connector
        self._app_config = app_config

    # 总览
    async def get_devices_overview(self) -> dict[str, Any]:
        zombies, scan = await self.collect_zombie_bindings()
        return {"zombieBindings": zombies, "scan": scan}

    async def collect_zombie_bindings(self) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        """收集各类来源的僵尸绑定：本地引用 −（状态库 ∪ HA 注册表）= 差集。

        返回值第二项是扫描状态：前端据此区分「真的没有僵尸」与「这次没扫」。
        """
        store_ids = [str(e.get("entity_id") or "") for e in self._state_store.get_all()]
        ha_synced = bool(self._state_store.is_ha_synced())
        registry: list[dict[str, Any]] = []
        registry_available = True
        try:
            registry = await self._ha_connector.fetch_entity_registry()
        except Exception as err:
            registry_available = False
            logger.warning("加载 HA 实体注册表失败，僵尸扫描将仅对照状态库: %s", err)

        store_count = len(store_ids)
        registry_count = len(registry)
        if should_skip_zombie_scan({"storeCount": store_count, "registryCount": registry_count, "haSynced": ha_synced}):
            logger.info("跳过僵尸绑定扫描：Home Assistant 尚未完成同步，暂无法判断实体是否仍存在")
            return [], {
                "status": "skipped",
                "reason": "Home Assistant 尚未完成同步，本次没有检查任何绑定",
                "haSynced": ha_synced,
                "storeCount": store_count,
                "registryCount": registry_count,
                "registryAvailable": registry_available,
                "aliveCount": 0,
                "scanned": {},
            }

        alive = build_alive_entity_id_set(store_ids, [str(entry.get("entity_id") or "") for entry in registry])
        layout = await run_db(self._load_project_layout)

        items: list[dict[str, Any]] = []
        self.collect_layout_widget_bindings(items, layout)
        self.collect_room_bindings(items)
        self.collect_stats_bindings(items, layout)
        self.collect_ha_config_bindings(items, layout)
        self.collect_alert_rule_bindings(items)

        scanned: dict[str, int] = {}
        for item in items:
            source = str(item.get("source") or "")
            scanned[source] = scanned.get(source, 0) + 1

        zombies = [item for item in items if item["entityId"] not in alive]
        if zombies:
            name_by_entity = await self.load_zombie_friendly_name_map([z["entityId"] for z in zombies], registry)
            for zombie in zombies:
                zombie["entityName"] = self.resolve_zombie_entity_name(
                    zombie["entityId"], zombie.get("entityName"), name_by_entity
                )
            by_source: dict[str, int] = {}
            for zombie in zombies:
                by_source[zombie["source"]] = by_source.get(zombie["source"], 0) + 1
            logger.info(
                "僵尸绑定扫描: %s",
                ", ".join(f"{source}={count}" for source, count in by_source.items()),
            )

        if ha_synced and registry_available:
            status, reason = "ok", ""
        elif registry_available:
            status, reason = "partial", "HA 状态库尚未同步，本次按实体注册表判断，结果基本完整"
        else:
            status, reason = "partial", "HA 实体注册表读取失败，本次仅对照状态库，可能存在误报"

        return zombies, {
            "status": status,
            "reason": reason,
            "haSynced": ha_synced,
            "storeCount": store_count,
            "registryCount": registry_count,
            "registryAvailable": registry_available,
            "aliveCount": len(alive),
            "scanned": scanned,
        }

    # 僵尸绑定收集
    def collect_layout_widget_bindings(self, items: list[dict[str, Any]], layout: dict[str, Any]) -> None:
        """布局 Widget 实体绑定：右侧/浮动面板部件、常用设备收藏。"""
        for list_name, position in WIDGET_LISTS:
            widget_list = layout.get(list_name)
            if not isinstance(widget_list, list):
                continue
            for widget_idx, widget in enumerate(widget_list):
                if not isinstance(widget, dict):
                    continue
                cfg = object_field(widget, "config")
                title = str(cfg.get("title") or "")
                type_label = str(widget.get("type") or "部件")
                widget_id = widget.get("id")
                key = (
                    f"widget:{widget_id}"
                    if isinstance(widget_id, str) and widget_id
                    else f"widget:{list_name}:{widget_idx}"
                )
                label = f"面板部件 · {title or type_label}（{position}）"
                primary = self.extract_widget_entity_id(widget)
                if primary:
                    items.append(
                        {
                            "source": "layoutWidget",
                            "entityId": primary,
                            "entityName": title,
                            "refId": key,
                            "location": label,
                        }
                    )
                # 多实体部件（图表 / 媒体 / 安防面板）：config 里每个实体引用都单独登记
                for path, entity_id in iter_entity_refs(cfg):
                    if primary and path in {("entityId",), ("entity",)} and entity_id == primary:
                        continue
                    items.append(
                        {
                            "source": "layoutWidget",
                            "entityId": entity_id,
                            "entityName": title,
                            "refId": f"{key}#{encode_path(path)}",
                            "location": f"{label} · {_field_label(path)}",
                        }
                    )

        # 收藏：favoriteEntities[domain] = entityId[]
        favorites = layout.get("favoriteEntities")
        if isinstance(favorites, dict):
            for domain, entity_list in favorites.items():
                if not isinstance(entity_list, list):
                    continue
                for entity_id in entity_list:
                    if not is_entity_id(entity_id):
                        continue
                    items.append(
                        {
                            "source": "layoutWidget",
                            "entityId": entity_id,
                            "entityName": "",
                            "refId": f"favorite:{domain}",
                            "location": f"常用设备 · {domain} 域收藏",
                        }
                    )

    def collect_room_bindings(self, items: list[dict[str, Any]]) -> None:
        """房间环境映射（系统配置 ``envSensorMap``）。"""
        raw_map = self._app_config.get("envSensorMap") if self._app_config is not None else None
        if not isinstance(raw_map, dict):
            return
        for room_id, room in raw_map.items():
            if not isinstance(room, dict):
                continue
            room_label = str(room.get("label") or room_id)
            for path, entity_id in iter_entity_refs(room):
                field = _field_label(path)
                if field in ("", "label", "_hidden"):
                    continue
                items.append(
                    {
                        "source": "room",
                        "entityId": entity_id,
                        "entityName": "",
                        "refId": f"room:{room_id}#{encode_path(path)}",
                        "location": f"房间「{room_label}」· {ROOM_FIELD_LABELS.get(field, field)}",
                    }
                )

    def collect_stats_bindings(self, items: list[dict[str, Any]], layout: dict[str, Any]) -> None:
        """统计传感器（``statsSensors``：灯具 / 空调 / 电池 / 离线 / 能源数据源）。"""
        stats = layout.get("statsSensors")
        if not isinstance(stats, dict):
            return
        for path, entity_id in iter_entity_refs(stats):
            top = str(path[0]) if path else ""
            label = STATS_FIELD_LABELS.get(top) or (
                "能源数据源" if top == "energySources" else f"统计配置 · {_field_label(path)}"
            )
            items.append(
                {
                    "source": "stats",
                    "entityId": entity_id,
                    "entityName": "",
                    "refId": f"stats:{encode_path(path)}",
                    "location": f"统计传感器 · {label}",
                }
            )

    def collect_ha_config_bindings(self, items: list[dict[str, Any]], layout: dict[str, Any]) -> None:
        """布局 ``haConfig`` 里的 HA 实体绑定（摄像头 / 门铃 / 扫地机 / 安防传感器）。"""
        cfg = layout.get("haConfig")
        if not isinstance(cfg, dict):
            return
        # 摄像头列表：没有 go2rtc 地址时整个条目就是空壳，直接删条目；
        # 有 go2rtc 地址的条目仍可独立播放，只清掉失效的 HA 实体而不是删掉整条。
        cameras = cfg.get("securityCameras")
        if isinstance(cameras, list):
            for index, camera in enumerate(cameras):
                if not isinstance(camera, dict) or not is_entity_id(camera.get("entityId")):
                    continue
                go2rtc_url = camera.get("go2rtcUrl")
                keep_entry = isinstance(go2rtc_url, str) and bool(go2rtc_url.strip())
                path = ("securityCameras", index, "entityId") if keep_entry else ("securityCameras", index)
                items.append(
                    {
                        "source": "haConfig",
                        "entityId": camera["entityId"],
                        "entityName": "",
                        "refId": f"haconfig:{encode_path(path)}",
                        "location": f"HA 配置 · 安防摄像头（第 {index + 1} 个）",
                    }
                )
        rest = {key: value for key, value in cfg.items() if key != "securityCameras"}
        for path, entity_id in iter_entity_refs(rest):
            top = str(path[0]) if path else ""
            nested = _field_label(path)
            if top in HA_FIELD_LABELS and nested != top:
                label = f"{HA_FIELD_LABELS[top]} · {HA_NESTED_FIELD_LABELS.get(nested, nested)}"
            else:
                label = HA_FIELD_LABELS.get(top, f"HA 配置 · {nested}")
            items.append(
                {
                    "source": "haConfig",
                    "entityId": entity_id,
                    "entityName": "",
                    "refId": f"haconfig:{encode_path(path)}",
                    "location": f"HA 配置 · {label}",
                }
            )

    def collect_alert_rule_bindings(self, items: list[dict[str, Any]]) -> None:
        """告警规则（AlertRule.entityId 非空）。"""
        try:
            with self._session_factory() as session:
                rows = session.execute(
                    select(AlertRule.id, AlertRule.name, AlertRule.entity_id, AlertRule.enabled)
                    .where(AlertRule.entity_id.is_not(None))
                    .limit(ALERT_RULE_SCAN_LIMIT)
                ).all()
            for rule_id, name, entity_id, enabled in rows:
                if not entity_id:
                    continue
                items.append(
                    {
                        "source": "alertRule",
                        "entityId": entity_id,
                        "entityName": "",
                        "refId": rule_id,
                        "location": f"告警规则「{name or '未命名规则'}」{'' if enabled else '（已停用）'}",
                    }
                )
        except Exception as err:
            logger.warning("扫描告警规则绑定失败: %s", err)

    # 批量解绑
    async def unbind_zombies(self, req: dict[str, Any] | None) -> dict[str, Any]:
        """批量解绑僵尸绑定。

        幂等：目标已不存在时记为 skipped；单条失败记为 failed 不阻断其余。
        布局类来源（部件 / 统计 / HA 配置）重读一次 layout、一次保存；
        房间映射走系统配置；告警规则逐条删除。
        """
        raw_items = req.get("items") if isinstance(req, dict) else None
        items = [item for item in (raw_items if isinstance(raw_items, list) else []) if isinstance(item, dict)]
        results: list[dict[str, Any] | None] = [None] * len(items)
        layout_entries: list[tuple[int, dict[str, Any]]] = []

        for index, item in enumerate(items):
            source = str(item.get("source") or "")
            if source in LAYOUT_SOURCES:
                layout_entries.append((index, item))
            elif source == "room":
                results[index] = await self.unbind_room_binding(item)
            else:
                results[index] = self.unbind_non_layout(item)

        if layout_entries:
            for index, result in await self.unbind_layout_bindings(layout_entries):
                results[index] = result

        final = [result for result in results if result is not None]

        def count(status: str) -> int:
            return sum(1 for result in final if result["status"] == status)

        return {
            "processed": len(final),
            "unbound": count("unbound"),
            "skipped": count("skipped"),
            "failed": count("failed"),
            "results": final,
        }

    async def unbind_layout_bindings(
        self, entries: list[tuple[int, dict[str, Any]]]
    ) -> list[tuple[int, dict[str, Any]]]:
        """在最新 layout 上批量摘除绑定，最多保存一次。"""
        try:
            row = await run_db(self._load_project_layout_row)
            layout = self.parse_layout(row)
            changed = False
            results: list[tuple[int, dict[str, Any]]] = []
            for index, item in entries:
                removed, message = self.remove_binding_from_layout(layout, item)
                changed = changed or removed
                base = self.result_base(item)
                if removed:
                    results.append((index, {**base, "status": "unbound"}))
                else:
                    results.append((index, {**base, "status": "skipped", "message": message or "布局中已不存在该绑定"}))
            if changed:
                self._ui_config.save_config("default", layout)
            return results
        except Exception as err:
            logger.warning("移除布局绑定失败: %s", err)
            return [
                (
                    index,
                    {
                        **self.result_base(item),
                        "status": "failed",
                        "message": "布局保存失败，请重试",
                    },
                )
                for index, item in entries
            ]

    def remove_binding_from_layout(self, layout: dict[str, Any], item: dict[str, Any]) -> tuple[bool, str]:
        """按 ``refId`` 从 layout 对象中摘除一条绑定（原地修改）。"""
        source = str(item.get("source") or "")
        if source == "layoutWidget":
            return self.remove_widget_binding(layout, item), ""
        root_key = "statsSensors" if source == "stats" else "haConfig" if source == "haConfig" else ""
        if not root_key:
            return False, f"不支持的来源: {source}"
        ref_id = str(item.get("refId") or "")
        prefix = f"{'stats' if source == 'stats' else 'haconfig'}:"
        if not ref_id.startswith(prefix):
            return False, "绑定定位信息无效"
        root = layout.get(root_key)
        if not isinstance(root, dict):
            return False, "布局中已不存在该配置"
        if not remove_entity_at_path(root, decode_path(ref_id[len(prefix) :]), item.get("entityId")):
            return False, "布局中已不存在该绑定"
        return True, ""

    def remove_widget_binding(self, layout: dict[str, Any], item: dict[str, Any]) -> bool:
        """移除部件绑定：主实体删整个部件，多实体只摘掉命中的那一个引用。"""
        ref_id = str(item.get("refId") or "")
        entity_id = item.get("entityId")

        if ref_id.startswith("favorite:"):
            return self.remove_favorite_binding(layout, ref_id, entity_id)
        if not ref_id.startswith("widget:"):
            return False

        key, _, encoded = ref_id[len("widget:") :].partition("#")
        slot = self.find_widget_slot(layout, key)
        if slot is None:
            return False
        list_name, index = slot
        widget_list = layout.get(list_name)
        if not isinstance(widget_list, list) or not 0 <= index < len(widget_list):
            return False
        widget = widget_list[index]
        if not isinstance(widget, dict):
            return False
        if encoded:
            return remove_entity_at_path(object_field(widget, "config"), decode_path(encoded), entity_id)
        # 按 index 定位时校验确为引用该实体的部件，防误删
        if self.extract_widget_entity_id(widget) != entity_id:
            return False
        widget_list.pop(index)
        return True

    @staticmethod
    def remove_favorite_binding(layout: dict[str, Any], ref_id: str, entity_id: Any) -> bool:
        """常用设备收藏：只从对应域的列表里摘掉这一个实体。"""
        domain = ref_id[len("favorite:") :]
        favorites = layout.get("favoriteEntities")
        if not isinstance(favorites, dict):
            return False
        entity_list = favorites.get(domain)
        if not isinstance(entity_list, list):
            return False
        try:
            entity_list.remove(entity_id)
        except ValueError:
            return False
        return True

    @staticmethod
    def find_widget_slot(layout: dict[str, Any], key: str) -> tuple[str, int] | None:
        """按 ``{id}`` 或 ``{listName}:{index}`` 定位部件所在的列表与下标。"""
        for list_name, _position in WIDGET_LISTS:
            widget_list = layout.get(list_name)
            if not isinstance(widget_list, list):
                continue
            for index, widget in enumerate(widget_list):
                if isinstance(widget, dict) and isinstance(widget.get("id"), str) and widget["id"] == key:
                    return list_name, index
        list_name, _, raw_index = key.partition(":")
        if list_name in {name for name, _ in WIDGET_LISTS} and raw_index.isdigit():
            return list_name, int(raw_index)
        return None

    async def unbind_room_binding(self, item: dict[str, Any]) -> dict[str, Any]:
        """清空房间环境映射里的单条实体绑定（``envSensorMap``）。"""
        base = self.result_base(item)
        if self._app_config is None:
            return {**base, "status": "failed", "message": "系统配置未就绪"}
        ref_id = str(item.get("refId") or "")
        if not ref_id.startswith("room:"):
            return {**base, "status": "failed", "message": "绑定定位信息无效"}
        room_id, _, encoded = ref_id[len("room:") :].partition("#")
        if not room_id or not encoded:
            return {**base, "status": "failed", "message": "绑定定位信息无效"}
        try:
            mapping = copy.deepcopy(self._app_config.get("envSensorMap") or {})
            room = mapping.get(room_id)
            if not isinstance(room, dict):
                return {**base, "status": "skipped", "message": "房间映射已不存在"}
            if not remove_entity_at_path(room, decode_path(encoded), item.get("entityId")):
                return {**base, "status": "skipped", "message": "房间映射中已不存在该绑定"}
            cleaned = {key: value for key, value in room.items() if not (isinstance(value, str) and not value.strip())}
            if cleaned:
                mapping[room_id] = cleaned
            else:
                mapping.pop(room_id, None)
            await asyncio.to_thread(self._app_config.update, {"envSensorMap": mapping})
            return {**base, "status": "unbound"}
        except Exception as err:
            logger.warning("清除房间映射失败 [%s/%s]: %s", room_id, item.get("entityId"), err)
            return {**base, "status": "failed", "message": "房间映射保存失败，请重试"}

    def unbind_non_layout(self, item: dict[str, Any]) -> dict[str, Any]:
        """解绑非布局来源（告警规则），单条幂等处理。"""
        base = self.result_base(item)
        try:
            if item.get("source") == "alertRule":
                with self._session_factory() as session:
                    row = session.execute(
                        select(AlertRule).where(AlertRule.id == item.get("refId"))
                    ).scalar_one_or_none()
                    if row is None:
                        return {**base, "status": "skipped", "message": "告警规则已不存在"}
                    session.delete(row)
                    session.commit()
                return {**base, "status": "unbound"}
            return {**base, "status": "failed", "message": f"不支持的来源: {item.get('source')}"}
        except Exception as err:
            logger.warning(
                "解绑失败 [%s/%s/%s]: %s",
                item.get("source"),
                item.get("refId"),
                item.get("entityId"),
                err,
            )
            return {**base, "status": "failed", "message": "解绑失败，请重试"}

    @staticmethod
    def result_base(item: dict[str, Any]) -> dict[str, Any]:
        return {
            "source": item.get("source"),
            "entityId": item.get("entityId"),
            "refId": item.get("refId"),
        }

    # 展示名
    async def load_zombie_friendly_name_map(
        self, entity_ids: list[str], registry_rows: list[dict[str, Any]] | None = None
    ) -> dict[str, str]:
        """从 HA 注册表收集 entityId → 中文友好名（注册表缺失时回退到实时状态）。"""
        name_map: dict[str, str] = {}

        def put(entity_id: str, name: Any) -> None:
            if entity_id in name_map:
                return
            usable = self.usable_friendly_name(entity_id, name)
            if usable:
                name_map[entity_id] = usable

        try:
            registry = registry_rows if registry_rows is not None else await self._ha_connector.fetch_entity_registry()
            for entry in registry or []:
                put(
                    str(entry.get("entity_id") or ""),
                    entry.get("name") or entry.get("original_name"),
                )
        except Exception as err:
            logger.warning("加载 HA 实体注册表名称失败: %s", err)

        still_missing = [entity_id for entity_id in entity_ids if entity_id not in name_map][
            :FRIENDLY_NAME_FALLBACK_LIMIT
        ]
        for entity_id in still_missing:
            try:
                state = await self._ha_connector.fetch_entity_state(entity_id)
                attributes = state.get("attributes") if isinstance(state, dict) else None
                name = str((attributes or {}).get("friendly_name") or "")
            except Exception:
                logger.debug("load_zombie_friendly_name_map 忽略异常", exc_info=True)
                name = ""
            put(entity_id, name)
        return name_map

    def usable_friendly_name(self, entity_id: str, raw: Any) -> str:
        """不是 entity_id / object_id 的展示名才采用（HA 中文 friendly_name）。"""
        name = str(raw or "").strip()
        if not name:
            return ""
        if name == entity_id:
            return ""
        dot = entity_id.find(".")
        object_id = entity_id[dot + 1 :] if dot >= 0 else entity_id
        if name == object_id:
            return ""
        return name

    def resolve_zombie_entity_name(self, entity_id: str, hint: Any, names: dict[str, str]) -> str:
        """实体展示名：优先 HA 属性/注册表中文名，不要用 object_id 冒充。"""
        return self.usable_friendly_name(entity_id, hint) or names.get(entity_id, "") or ""

    # 工具
    def _load_project_layout_row(self) -> Any:
        """读取 default 项目的 layout 列（同步；由调用方放进线程池）。"""
        with self._session_factory() as session:
            return session.execute(
                select(ProjectConfig.layout).where(ProjectConfig.project_id == "default")
            ).scalar_one_or_none()

    def _load_project_layout(self) -> dict[str, Any]:
        """同步读取并解析 default 项目的 layout（由 ``run_db`` 放进线程池）。"""
        return self.parse_layout(self._load_project_layout_row())

    @staticmethod
    def parse_layout(layout: Any) -> dict[str, Any]:
        """解析 layout 字段为对象（JSON TEXT 列读出值可能为字符串）。"""
        if isinstance(layout, dict):
            return layout
        if isinstance(layout, str) and layout.strip():
            import json

            try:
                parsed = json.loads(layout)
            except (TypeError, ValueError):  # fmt: skip
                return {}
            return parsed if isinstance(parsed, dict) else {}
        return {}

    @staticmethod
    def extract_widget_entity_id(widget: dict[str, Any]) -> str | None:
        """从面板部件中提取其主实体 ID（config.entityId / entity / 顶层 / id 兜底）。"""
        cfg = widget.get("config") if isinstance(widget.get("config"), dict) else None
        candidates = [
            (cfg or {}).get("entityId"),
            (cfg or {}).get("entity"),
            widget.get("entityId"),
            widget.get("entity"),
        ]
        for candidate in candidates:
            if isinstance(candidate, str) and "." in candidate:
                return candidate
        widget_id = widget.get("id")
        if isinstance(widget_id, str) and "." in widget_id:
            return widget_id
        return None


__all__ = ["ALERT_RULE_SCAN_LIMIT", "ZOMBIE_SOURCES", "DeviceManagementService"]
