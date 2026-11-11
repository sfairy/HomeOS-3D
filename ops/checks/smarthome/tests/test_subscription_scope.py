"""E3 回归：按区域 / 设备订阅。

三条判据必须同时成立：

1. 未声明范围（``None``）= 旧行为，不额外收窄；
2. 声明了范围 = 只有范围内的实体可见，**钉选仍例外**（显式点名关注）；
3. 声明了但范围内没有实体（空集合）→ 只推钉选，**不能退回全推**。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.state_store.entity_area import EntityAreaEnrichmentService, build_entity_area_index
from src.realtime.subscription import is_entity_visible_to_client


class VisibilityScopeTests(unittest.TestCase):
    def _visible(self, entity_id: str, *, scope: set[str] | None, pinned: set[str] | None = None) -> bool:
        return is_entity_visible_to_client(
            entity_id,
            {"light", "switch"},
            pinned,
            {"binary_sensor", "lock"},
            True,
            scope,
        )

    def test_no_scope_keeps_old_behaviour(self) -> None:
        self.assertTrue(self._visible("light.a", scope=None))
        self.assertFalse(self._visible("climate.a", scope=None))  # 域不在订阅里

    def test_scope_narrows(self) -> None:
        scope = {"light.a"}
        self.assertTrue(self._visible("light.a", scope=scope))
        self.assertFalse(self._visible("light.b", scope=scope))

    def test_pinned_bypasses_scope(self) -> None:
        """布局里点名的实体不能被区域范围挡掉，否则墙屏会缺控件状态。"""
        scope = {"light.a"}
        self.assertTrue(self._visible("light.b", scope=scope, pinned={"light.b"}))

    def test_empty_scope_does_not_fall_back_to_all(self) -> None:
        self.assertFalse(self._visible("light.a", scope=set()))
        # 钉选仍然可见
        self.assertTrue(self._visible("light.a", scope=set(), pinned={"light.a"}))


class ScopeResolutionTests(unittest.TestCase):
    def _service(self, index: dict[str, dict[str, str]]) -> EntityAreaEnrichmentService:
        # 只测「索引 → 实体集合」的纯解析，不启动加载流程（构造参数用替身即可）。
        service = EntityAreaEnrichmentService(connector=MagicMock(), session_factory=MagicMock())
        service._index = index
        return service

    def test_resolve_by_area(self) -> None:
        service = self._service(
            {
                "light.a": {"area_id": "living", "area_name": "客厅"},
                "light.b": {"area_id": "kitchen", "area_name": "厨房"},
            }
        )
        self.assertEqual(service.resolve_scope_entities(["living"], None), {"light.a"})

    def test_resolve_by_device(self) -> None:
        service = self._service(
            {
                "switch.a": {"area_id": "living", "device_id": "dev1"},
                "sensor.a": {"area_id": "living", "device_id": "dev1"},
                "switch.b": {"area_id": "living", "device_id": "dev2"},
            }
        )
        self.assertEqual(service.resolve_scope_entities(None, ["dev1"]), {"switch.a", "sensor.a"})

    def test_no_scope_declared_returns_none(self) -> None:
        service = self._service({})
        self.assertIsNone(service.resolve_scope_entities(None, None))
        self.assertIsNone(service.resolve_scope_entities([], []))

    def test_declared_but_empty_returns_empty_set(self) -> None:
        """声明了范围但查不到实体：必须是空集合而不是 None（否则会退回全推）。"""
        service = self._service({"light.a": {"area_id": "living"}})
        self.assertEqual(service.resolve_scope_entities(["garage"], None), set())

    def test_index_builds_device_and_area(self) -> None:
        index = build_entity_area_index(
            [
                {"entity_id": "light.a", "area_id": "living", "device_id": "dev1"},
                {"entity_id": "light.b", "area_id": "", "device_id": "dev2"},
            ],
            {"living": "客厅"},
            {"dev2": "kitchen"},
        )
        self.assertEqual(index["light.a"]["area_id"], "living")
        # 实体自己没有区域时，按设备所属区域补齐
        self.assertEqual(index["light.b"]["area_id"], "kitchen")


if __name__ == "__main__":
    unittest.main()
