"""T3 回归：布防中清空防区必须被拒绝（不允许零防区布防）。

审查发现 configure_zones 的清空分支只校验 confirmClear，不校验当前是否已布防：
布防中清空防区会留下「mode=armed_away、zones=[]」的面板状态，之后任何传感器
都不会触发告警（安防静默失效），而 arm() 自己明确拒绝零防区布防。
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from typing import Any, cast

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"

# 后端是 python -m src.run 的 src 包；只把 backend 根目录放进 path。
sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.security.panel import SecurityPanelService
from src.platform.core.http.errors import BusinessException


class FakeBus:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []

    async def emit(self, name: str, payload: dict[str, Any]) -> None:
        self.events.append((name, payload))

    def emit_soon(self, name: str, payload: dict[str, Any]) -> None:
        self.events.append((name, payload))

    def on(self, name: str, handler: Any) -> None:
        return None


class FakeConfigProvider:
    def get(self) -> dict[str, Any]:
        return {}

    def refresh(self) -> None:
        return None


class FakeStateHelper:
    def persist_panel_state(self) -> bool:
        return True

    def schedule_security_event(self, kind: str, message: str, **kwargs: Any) -> None:
        return None

    async def load_persisted_state(self) -> None:
        return None


class FakeLinkageHelper:
    async def execute_security_mode_actions(
        self, mode: str, skip_domains: set[str] | None = None
    ) -> dict[str, Any]:
        return {
            "executed": 0,
            "failed": 0,
            "failedItems": [],
            "appliedItems": [],
            "irreversibleItems": [],
        }

    async def compensate_applied_actions(
        self, applied_items: list[dict[str, Any]], reason: str
    ) -> dict[str, Any]:
        return {"restored": 0, "failed": 0, "failedItems": []}


def build_panel(*, zones: int = 2, mode: str = "disarmed") -> SecurityPanelService:
    panel = SecurityPanelService(
        session_factory=cast(Any, lambda: None),
        ha_connector=cast(Any, None),
        bus=cast(Any, FakeBus()),
        cooldown=cast(Any, None),
        config_provider=cast(Any, FakeConfigProvider()),
    )
    panel._zones = [
        {
            "id": f"zone-{index}",
            "name": f"区域{index}",
            "sensors": [],
            "armed": mode != "disarmed",
            "zoneType": "all",
        }
        for index in range(zones)
    ]
    panel._mode = mode
    panel._armed_at = 1 if mode != "disarmed" else None
    panel.state_helper = cast(Any, FakeStateHelper())
    panel.linkage_helper = cast(Any, FakeLinkageHelper())
    return panel


class ClearZonesWhileArmedTest(unittest.TestCase):
    def test_clearing_zones_while_disarmed_is_allowed(self) -> None:
        panel = build_panel()
        asyncio.run(panel.configure_zones([], confirm_clear=True))
        self.assertEqual(panel.get_zones(), [])
        self.assertEqual(panel.get_mode(), "disarmed")

    def test_clearing_zones_while_armed_is_rejected(self) -> None:
        panel = build_panel(mode="armed_away")
        with self.assertRaises(BusinessException):
            asyncio.run(panel.configure_zones([], confirm_clear=True))
        # 拒绝必须无副作用：模式与防区列表保持原样（不能先清空再报错）。
        self.assertEqual(panel.get_mode(), "armed_away")
        self.assertEqual(len(panel.get_zones()), 2)
        self.assertTrue(all(zone["armed"] for zone in panel.get_zones()))

    def test_clearing_zones_while_armed_still_requires_confirm(self) -> None:
        panel = build_panel(mode="armed_home")
        with self.assertRaises(BusinessException):
            asyncio.run(panel.configure_zones([]))
        self.assertEqual(panel.get_mode(), "armed_home")
        self.assertEqual(len(panel.get_zones()), 2)


if __name__ == "__main__":
    unittest.main()
