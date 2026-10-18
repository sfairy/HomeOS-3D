"""智能顾问用量统计：增量合并为单事务写库，读写语义保持不变。"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from sqlalchemy import select
from src.domains.awareness.advisor_usage import SmartAdvisorUsageHelper
from src.platform.core.models import DeviceUsageStat

from tests.studio3d_helpers import dispose, new_database


class _StateRouter:
    @staticmethod
    def should_process(_consumer: str, _event: dict) -> bool:
        return True


def _make_helper(session_factory) -> SmartAdvisorUsageHelper:
    return SmartAdvisorUsageHelper(
        {
            "app_config": {"voice": {"enabled": False}},
            "ha_connector": object(),
            "state_store": object(),
            "state_router": _StateRouter(),
            "session_factory": session_factory,
            "ha_areas": list,
            "push_tip": lambda *args: None,
            "room_label": lambda room: room,
            "voice_config": dict,
            "entity_tts_alerts": list,
            "custom_alerts": list,
            "queue_speak": lambda *args: None,
        }
    )


def _rows(session_factory) -> list[DeviceUsageStat]:
    with session_factory() as session:
        return list(session.execute(select(DeviceUsageStat)).scalars().all())


def _on(event_id: str = "light.kitchen") -> dict:
    return {"entity_id": event_id, "new_state": {"state": "on"}, "old_state": {"state": "off"}}


class AdvisorUsageCoalesceTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        # 落盘走线程池，必须用文件库：sqlite:// 每个连接一个独立内存库
        self._tmp = tempfile.TemporaryDirectory()
        self.factory = new_database(Path(self._tmp.name) / "usage.db")
        self.helper = _make_helper(self.factory)

    def tearDown(self) -> None:
        dispose(self.factory)
        self._tmp.cleanup()

    async def test_state_changes_are_coalesced_into_single_row(self) -> None:
        for _ in range(3):
            await self.helper.handle_state_change(_on())
        self.assertEqual(_rows(self.factory), [])
        await self.helper.flush_usage_stats()
        rows = _rows(self.factory)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].entity_id, "light.kitchen")
        self.assertEqual(rows[0].on_count, 3)
        self.assertIsNotNone(rows[0].last_on)
        self.assertEqual(self.helper._pending_usage, {})

    async def test_runtime_accumulates_and_read_flushes_pending(self) -> None:
        await self.helper.handle_state_change(_on())
        await self.helper.handle_state_change(
            {"entity_id": "light.kitchen", "new_state": {"state": "off"}, "old_state": {"state": "on"}}
        )
        self.assertEqual(_rows(self.factory), [])
        report = await self.helper.get_entity_usage("light.kitchen", 7)
        rows = _rows(self.factory)
        self.assertEqual(len(rows), 1)
        self.assertGreaterEqual(rows[0].total_runtime_ms, 0)
        self.assertEqual(report["summary"]["onCount"], 1)
        self.assertEqual(len(report["daily"]), 1)

    async def test_stop_flushes_and_cancels_scheduled_flush(self) -> None:
        await self.helper.handle_state_change(_on())
        self.assertIsNotNone(self.helper._usage_flush_task)
        await self.helper.stop_usage_writer()
        rows = _rows(self.factory)
        self.assertEqual(len(rows), 1)
        self.assertEqual(self.helper._pending_usage, {})
        self.assertIsNone(self.helper._usage_flush_task)
        await self.helper.stop_usage_writer()  # 幂等


if __name__ == "__main__":
    unittest.main()
