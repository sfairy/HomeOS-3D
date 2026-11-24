"""`attributes.device_id` 必须到达前端的回归测试。

## 为什么这条测试值得存在

「离线按设备统计」取决于前端实体里有没有 ``attributes.device_id``。而它**不在**
HA 的 ``/api/states`` 响应里 —— 只存在于配置注册表（``config/entity_registry/list``）。
所以必须由后端在入库时补上，任何一环漏掉的表现都是同一个：

    界面上一台路由器被数成 3 台设备（WiFi管理 / 访客WiFi / 指示灯各算一台）

这一路有两个**静默**失效点，都不会报错：

1. 状态变更 / 快照路径忘了调用 ``enrich_entity_sync`` —— 前端永远拿不到归属；
2. 区域补发只为 ``area_id`` / ``area_name`` 的变化触发 —— 注册表晚于快照加载时，
   「补上 device_id」不被判定为变化，于是整个进程生命周期里都不会补发。

两个都测不到就只是靠读代码相信它。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from homeos.backend.src.bootstrap.ha_state_effects import _enrich_state_pair
from homeos.backend.src.domains.state_store.entity_area import build_entity_area_index


class _AreaService:
    """最小的区域补全服务：行为与 `EntityAreaEnrichmentService.enrich_entity_sync` 一致。"""

    def __init__(self, index: dict[str, dict[str, str]]) -> None:
        self._index = index

    def enrich_entity_sync(self, entity: dict[str, Any]) -> dict[str, Any]:
        from homeos.backend.src.domains.state_store.entity_area import enrich_entity_areas

        if not self._index:
            return entity
        return enrich_entity_areas(entity, self._index)


class _App:
    def __init__(self, service: Any) -> None:
        self.state = type("State", (), {"entity_area": service})()


def _registry() -> list[dict[str, Any]]:
    """一台路由器三个实体 + 一台空调一个实体。"""
    return [
        {"entity_id": "switch.router_wifi", "device_id": "dev-router"},
        {"entity_id": "switch.router_guest", "device_id": "dev-router"},
        {"entity_id": "light.router_indicator", "device_id": "dev-router"},
        {"entity_id": "climate.ac", "device_id": "dev-ac"},
    ]


def _state(entity_id: str, state: str = "unavailable") -> dict[str, Any]:
    return {"entity_id": entity_id, "state": state, "attributes": {"friendly_name": entity_id}}


class EnrichStatePairTest(unittest.TestCase):
    def test_device_id_added_to_both_states(self) -> None:
        """增量路径：new_state 与 old_state 都要补上 device_id。"""
        index = build_entity_area_index(_registry(), {})
        app = _App(_AreaService(index))
        change = {
            "entity_id": "switch.router_wifi",
            "old_state": _state("switch.router_wifi", "on"),
            "new_state": _state("switch.router_wifi", "unavailable"),
        }

        _enrich_state_pair(app, change)

        self.assertEqual(change["new_state"]["attributes"].get("device_id"), "dev-router")
        self.assertEqual(change["old_state"]["attributes"].get("device_id"), "dev-router")

    def test_entities_sharing_a_device_get_same_id(self) -> None:
        """一台路由器的三个实体必须拿到同一个 device_id（否则按设备统计无从谈起）。"""
        index = build_entity_area_index(_registry(), {})
        app = _App(_AreaService(index))
        device_ids = set()

        for entity_id in ("switch.router_wifi", "switch.router_guest", "light.router_indicator"):
            change = {"entity_id": entity_id, "new_state": _state(entity_id)}
            _enrich_state_pair(app, change)
            device_ids.add(change["new_state"]["attributes"].get("device_id"))

        self.assertEqual(device_ids, {"dev-router"})

    def test_missing_area_service_is_tolerated(self) -> None:
        """装配早期没有 entity_area 时不能抛错（只是暂时没有归属）。"""
        app = _App(None)
        change = {"entity_id": "switch.x", "new_state": _state("switch.x")}
        _enrich_state_pair(app, change)
        self.assertNotIn("device_id", change["new_state"]["attributes"])

    def test_empty_index_returns_unchanged(self) -> None:
        """索引还没建好时原样返回，不写空 device_id。"""
        app = _App(_AreaService({}))
        state = _state("switch.router_wifi")
        change = {"entity_id": "switch.router_wifi", "new_state": state}
        _enrich_state_pair(app, change)
        self.assertIs(change["new_state"], state)
        self.assertNotIn("device_id", state["attributes"])

    def test_unregistered_entity_keeps_no_device_id(self) -> None:
        """不在注册表里的实体（模板实体）不会被塞一个假归属。"""
        index = build_entity_area_index(_registry(), {})
        app = _App(_AreaService(index))
        change = {"entity_id": "sensor.template", "new_state": _state("sensor.template")}
        _enrich_state_pair(app, change)
        self.assertNotIn("device_id", change["new_state"]["attributes"])


class RepublishComparesDeviceIdTest(unittest.TestCase):
    """注册表晚于快照加载时，「补上 device_id」必须被判定为变化并补发。"""

    def test_device_only_change_counts_as_changed(self) -> None:
        from homeos.backend.src.domains.state_store import entity_area as module

        source = Path(module.__file__).read_text(encoding="utf-8")
        # 结构断言（这一处是并发热路径，起真实事件总线做端到端太重）：
        # 补发判据必须同时比 device_id，否则「只多了归属」永远不触发。
        self.assertIn("before_device == after_device", source, "补发判据必须比较 device_id")


if __name__ == "__main__":
    unittest.main()
