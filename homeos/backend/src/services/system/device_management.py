"""设备管理与僵尸绑定清理服务（对齐 ``modules/system/device/device-management.service.ts``）。

职责：
- 扫描「HA 中已不存在但仍被引用」的僵尸绑定，来源覆盖：
    layoutWidget —— 仪表板布局 Widget（户型图热点 / 右侧与浮动面板部件 / 收藏）
    alertRule    —— 告警规则（AlertRule.entityId）
  存活判定 = 状态库 ∪ HA 实体注册表（含禁用/隐藏）。不得只用过滤后的状态库，
  否则「仅同步已启用实体」会把隐藏诊断实体全部误判成僵尸。
- 提供批量解绑（删除或清理对应绑定，幂等，单条失败不阻断其余）。

依赖：Session 工厂、状态库（现有实体集合）、UiConfigService（布局读写）、
     HaConnectorService（注册表中文名）。
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select

from ...core.models import AlertRule, ProjectConfig
from .zombie_scan import build_alive_entity_id_set, should_skip_zombie_scan

logger = logging.getLogger("homeos.system.device_management")

#: 告警规则扫描上限（等价 Prisma ``take: 2000``）
ALERT_RULE_SCAN_LIMIT = 2000
#: 注册表缺失时补拉友好名的实体数量上限
FRIENDLY_NAME_FALLBACK_LIMIT = 30


class DeviceManagementService:
    def __init__(
        self,
        session_factory: Any,
        state_store: Any,
        ui_config: Any,
        ha_connector: Any,
    ) -> None:
        self._session_factory = session_factory
        self._state_store = state_store
        self._ui_config = ui_config
        self._ha_connector = ha_connector

    # ------------------------------------------------------------------ #
    # 总览
    # ------------------------------------------------------------------ #
    async def get_devices_overview(self) -> dict[str, Any]:
        return {"zombieBindings": await self.collect_zombie_bindings()}

    async def collect_zombie_bindings(self) -> list[dict[str, Any]]:
        """收集各类来源的僵尸绑定：本地引用 −（状态库 ∪ HA 注册表）= 差集。

        HA 未同步完成时跳过，避免把全部绑定标成僵尸。
        """
        store_ids = [str(e.get("entity_id") or "") for e in self._state_store.get_all()]
        registry: list[dict[str, Any]] = []
        try:
            registry = await self._ha_connector.fetch_entity_registry()
        except Exception as err:  # noqa: BLE001 - 注册表不可用仅降级比对
            logger.warning("加载 HA 实体注册表失败，僵尸扫描将仅对照状态库: %s", err)

        if should_skip_zombie_scan(
            {
                "storeCount": len(store_ids),
                "registryCount": len(registry),
                "haSynced": self._state_store.is_ha_synced(),
            }
        ):
            logger.warning("跳过僵尸绑定扫描: Home Assistant 尚未同步，无法判断实体是否仍存在")
            return []

        alive = build_alive_entity_id_set(
            store_ids, [str(entry.get("entity_id") or "") for entry in registry]
        )

        items: list[dict[str, Any]] = []
        self.collect_layout_widget_bindings(items)
        self.collect_alert_rule_bindings(items)

        zombies = [item for item in items if item["entityId"] not in alive]
        if zombies:
            name_by_entity = await self.load_zombie_friendly_name_map(
                [z["entityId"] for z in zombies], registry
            )
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
        return zombies

    # ------------------------------------------------------------------ #
    # 僵尸绑定收集
    # ------------------------------------------------------------------ #
    def collect_layout_widget_bindings(self, items: list[dict[str, Any]]) -> None:
        """布局 Widget 实体绑定：户型图热点（floors[].widgets）、右侧/浮动面板部件、收藏。"""
        try:
            with self._session_factory() as session:
                row = session.execute(
                    select(ProjectConfig.layout).where(ProjectConfig.project_id == "default")
                ).scalar_one_or_none()
            if not row:
                return
            layout = self.parse_layout(row)

            # 户型图热点：widget.id = entity_id
            floors = layout.get("floors")
            if not isinstance(floors, list):
                floors = []
            for floor_idx, floor in enumerate(floors):
                if not isinstance(floor, dict):
                    continue
                floor_name = str(floor.get("name") or floor.get("id") or f"楼层{floor_idx + 1}")
                widgets = floor.get("widgets")
                if not isinstance(widgets, list):
                    continue
                for widget_idx, widget in enumerate(widgets):
                    if not isinstance(widget, dict):
                        continue
                    entity_id = str(widget.get("id") or "")
                    if "." not in entity_id:
                        continue
                    label = widget.get("label")
                    items.append(
                        {
                            "source": "layoutWidget",
                            "entityId": entity_id,
                            "entityName": str(label or ""),
                            "refId": f"floor:{floor_idx}:{widget_idx}",
                            "location": (
                                f"仪表板布局 · {floor_name}热点"
                                + (f"「{label}」" if label else "")
                            ),
                        }
                    )

            # 右侧 / 浮动面板部件
            for list_name in ("rightPanelWidgets", "floatingWidgets"):
                widget_list = layout.get(list_name)
                if not isinstance(widget_list, list):
                    continue
                for widget_idx, widget in enumerate(widget_list):
                    if not isinstance(widget, dict):
                        continue
                    entity_id = self.extract_widget_entity_id(widget)
                    if not entity_id:
                        continue
                    type_label = str(widget.get("type") or "部件")
                    cfg = widget.get("config") if isinstance(widget.get("config"), dict) else {}
                    title = str(cfg.get("title") or "")
                    ref_id = (
                        f"widget:{widget['id']}"
                        if isinstance(widget.get("id"), str) and widget.get("id")
                        else f"widget:{list_name}:{widget_idx}"
                    )
                    position = "右侧" if list_name == "rightPanelWidgets" else "浮动"
                    items.append(
                        {
                            "source": "layoutWidget",
                            "entityId": entity_id,
                            "entityName": title,
                            "refId": ref_id,
                            "location": f"面板部件 · {title or type_label}（{position}）",
                        }
                    )

            # 收藏：favoriteEntities[domain] = entityId[]
            favorites = layout.get("favoriteEntities")
            if isinstance(favorites, dict):
                for domain, entity_list in favorites.items():
                    if not isinstance(entity_list, list):
                        continue
                    for entity_id in entity_list:
                        if not isinstance(entity_id, str) or "." not in entity_id:
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
        except Exception as err:  # noqa: BLE001 - 单来源扫描失败不阻断其余来源
            logger.warning("扫描布局 Widget 绑定失败: %s", err)

    def collect_alert_rule_bindings(self, items: list[dict[str, Any]]) -> None:
        """告警规则（AlertRule.entityId 非空）。"""
        try:
            with self._session_factory() as session:
                rows = (
                    session.execute(
                        select(
                            AlertRule.id, AlertRule.name, AlertRule.entity_id, AlertRule.enabled
                        )
                        .where(AlertRule.entity_id.is_not(None))
                        .limit(ALERT_RULE_SCAN_LIMIT)
                    )
                    .all()
                )
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
        except Exception as err:  # noqa: BLE001 - 单来源扫描失败不阻断其余来源
            logger.warning("扫描告警规则绑定失败: %s", err)

    # ------------------------------------------------------------------ #
    # 批量解绑
    # ------------------------------------------------------------------ #
    async def unbind_zombies(self, req: dict[str, Any] | None) -> dict[str, Any]:
        """批量解绑僵尸绑定。

        幂等：目标已不存在时记为 skipped；单条失败记为 failed 不阻断其余。
        布局 Widget 删除聚合为一次 layout 重写保存（避免逐条写库）。
        """
        items = req.get("items") if isinstance(req, dict) else None
        items = items if isinstance(items, list) else []
        results: list[dict[str, Any]] = []
        layout_removals: list[dict[str, Any]] = []

        for item in items:
            if not isinstance(item, dict):
                continue
            if item.get("source") == "layoutWidget":
                layout_removals.append(item)
                continue
            results.append(self.unbind_non_layout(item))

        if layout_removals:
            results.extend(await self.unbind_layout_widgets(layout_removals))

        def count(status: str) -> int:
            return sum(1 for r in results if r["status"] == status)

        return {
            "processed": len(results),
            "unbound": count("unbound"),
            "skipped": count("skipped"),
            "failed": count("failed"),
            "results": results,
        }

    def unbind_non_layout(self, item: dict[str, Any]) -> dict[str, Any]:
        """解绑非布局来源（告警规则），单条幂等处理。"""
        base = {
            "source": item.get("source"),
            "entityId": item.get("entityId"),
            "refId": item.get("refId"),
        }
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
        except Exception as err:  # noqa: BLE001 - 单条失败不阻断其余
            logger.warning(
                "解绑失败 [%s/%s/%s]: %s",
                item.get("source"),
                item.get("refId"),
                item.get("entityId"),
                err,
            )
            return {**base, "status": "failed", "message": "解绑失败，请重试"}

    async def unbind_layout_widgets(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """批量移除布局 Widget 绑定：重读最新 layout，一次定位删除后单次保存。"""
        if not items:
            return []
        try:
            with self._session_factory() as session:
                row = session.execute(
                    select(ProjectConfig.layout).where(ProjectConfig.project_id == "default")
                ).scalar_one_or_none()
            layout = self.parse_layout(row)
            changed = False

            # 同一列表多个条目批量删除时 index 会随删除漂移；
            # 按 index 降序处理可保证先删尾部、前部索引仍然有效（id / favorite 形态不受影响）。
            def parse_pos(ref_id: str) -> tuple[str, str, int] | None:
                parts = str(ref_id or "").split(":")
                if len(parts) == 3 and parts[0] in ("floor", "widget") and parts[2].isdigit():
                    return parts[0], parts[1], int(parts[2])
                return None

            def sort_key(item: dict[str, Any]) -> tuple[str, str, int]:
                pos = parse_pos(item.get("refId"))
                return (pos[0], pos[1], -pos[2]) if pos else ("", "", 0)

            sorted_items = sorted(items, key=sort_key)
            results: list[dict[str, Any]] = []
            for item in sorted_items:
                removed = self.remove_widget_from_layout(layout, item)
                changed = changed or removed
                base = {
                    "source": item.get("source"),
                    "entityId": item.get("entityId"),
                    "refId": item.get("refId"),
                }
                results.append(
                    {**base, "status": "unbound"}
                    if removed
                    else {**base, "status": "skipped", "message": "布局中已不存在该绑定"}
                )

            if changed:
                self._ui_config.save_config("default", layout)

            return results
        except Exception as err:  # noqa: BLE001 - 保存失败整批标记失败
            logger.warning("移除布局 Widget 失败: %s", err)
            return [
                {
                    "source": item.get("source"),
                    "entityId": item.get("entityId"),
                    "refId": item.get("refId"),
                    "status": "failed",
                    "message": "布局保存失败，请重试",
                }
                for item in items
            ]

    def remove_widget_from_layout(self, layout: dict[str, Any], item: dict[str, Any]) -> bool:
        """按 refId 从 layout 对象中移除对应 Widget 引用（原地修改）。

        支持：``floor:{fi}:{wi}`` 热点、``widget:{id 或 listName:idx}`` 面板部件、
        ``favorite:{domain}`` 收藏。
        """
        ref_id = str(item.get("refId") or "")
        entity_id = item.get("entityId")

        if ref_id.startswith("floor:"):
            parts = ref_id.split(":")
            floors = layout.get("floors")
            floors = floors if isinstance(floors, list) else []
            try:
                floor = floors[int(parts[1])]
            except (IndexError, ValueError):
                return False
            if not isinstance(floor, dict) or not isinstance(floor.get("widgets"), list):
                return False
            widgets = floor["widgets"]

            def matches_entity(widget: Any) -> bool:
                return isinstance(widget, dict) and str(widget.get("id") or "") == str(entity_id)

            try:
                idx = int(parts[2])
            except (IndexError, ValueError):
                idx = -1
            target_idx = idx if 0 <= idx < len(widgets) and matches_entity(widgets[idx]) else None
            if target_idx is None:
                target_idx = next(
                    (i for i, widget in enumerate(widgets) if matches_entity(widget)), -1
                )
            if target_idx < 0:
                return False
            widgets.pop(target_idx)
            return True

        if ref_id.startswith("favorite:"):
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

        if ref_id.startswith("widget:"):
            key = ref_id[len("widget:") :]
            # 面板部件跨 rightPanelWidgets / floatingWidgets 两列表，按 id 或 index 定位
            for list_name in ("rightPanelWidgets", "floatingWidgets"):
                widget_list = layout.get(list_name)
                if not isinstance(widget_list, list):
                    continue
                target_idx = next(
                    (
                        i
                        for i, widget in enumerate(widget_list)
                        if isinstance(widget, dict)
                        and isinstance(widget.get("id"), str)
                        and widget.get("id")
                        and widget.get("id") == key
                    ),
                    -1,
                )
                idx = target_idx
                if idx < 0:
                    tail = key.split(":")[1] if ":" in key else key
                    try:
                        idx = int(tail)
                    except ValueError:
                        idx = -1
                if 0 <= idx < len(widget_list):
                    # 按 index 定位时校验确为引用该实体的部件，防误删
                    widget = widget_list[idx]
                    if isinstance(widget, dict) and self.extract_widget_entity_id(widget) == entity_id:
                        widget_list.pop(idx)
                        return True
            return False

        return False

    # ------------------------------------------------------------------ #
    # 展示名
    # ------------------------------------------------------------------ #
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
            registry = (
                registry_rows
                if registry_rows is not None
                else await self._ha_connector.fetch_entity_registry()
            )
            for entry in registry or []:
                put(
                    str(entry.get("entity_id") or ""),
                    entry.get("name") or entry.get("original_name"),
                )
        except Exception as err:  # noqa: BLE001 - 名称缺失时保留空串展示
            logger.warning("加载 HA 实体注册表名称失败: %s", err)

        still_missing = [entity_id for entity_id in entity_ids if entity_id not in name_map][
            :FRIENDLY_NAME_FALLBACK_LIMIT
        ]
        for entity_id in still_missing:
            try:
                state = await self._ha_connector.fetch_entity_state(entity_id)
                attributes = state.get("attributes") if isinstance(state, dict) else None
                name = str((attributes or {}).get("friendly_name") or "")
            except Exception:  # noqa: BLE001 - 单实体拉取失败忽略
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

    def resolve_zombie_entity_name(
        self, entity_id: str, hint: Any, names: dict[str, str]
    ) -> str:
        """实体展示名：优先 HA 属性/注册表中文名，不要用 object_id 冒充。"""
        return self.usable_friendly_name(entity_id, hint) or names.get(entity_id, "") or ""

    # ------------------------------------------------------------------ #
    # 工具
    # ------------------------------------------------------------------ #
    @staticmethod
    def parse_layout(layout: Any) -> dict[str, Any]:
        """解析 layout 字段为对象（JSON TEXT 列读出值可能为字符串）。"""
        if isinstance(layout, dict):
            return layout
        if isinstance(layout, str) and layout.strip():
            import json  # noqa: PLC0415 - 仅解析失败路径需要

            try:
                parsed = json.loads(layout)
            except (TypeError, ValueError):
                return {}
            return parsed if isinstance(parsed, dict) else {}
        return {}

    @staticmethod
    def extract_widget_entity_id(widget: dict[str, Any]) -> str | None:
        """从面板部件中提取其绑定的实体 ID（config.entityId / entity / 顶层 / id 兜底）。"""
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


__all__ = ["ALERT_RULE_SCAN_LIMIT", "DeviceManagementService"]
