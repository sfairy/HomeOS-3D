"""设备时序表的清理/节流/保留期回归。

历史缺陷：``_prune_sync`` 是一条无 ``LIMIT`` 的 ``DELETE``（数十万过期行时长时间持有
写锁），写入侧每条状态变更一个后台任务、且数值传感器的读数抖动全部落库（实测单机
11 天 208 万行 / 900MB 库）。
"""

from __future__ import annotations

import os
import sqlite3
import sys
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from src.domains.agent.memory import timeline as timeline_module
from src.domains.agent.memory.timeline import AgentTimelineService
from src.platform.core.db.migrations import _fix_alert_rule_escalation_units
from src.platform.core.db.models import AgentContextTimeline, Base

from homeos_shared.schema_migrate import MigrationContext


class _Harness:
    """一次性内存库 + 服务实例（``addCleanup`` 负责 dispose，避免 ResourceWarning）。"""

    def __init__(self, case: unittest.TestCase) -> None:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
        Base.metadata.create_all(engine)
        case.addCleanup(engine.dispose)
        self.factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        self.service = AgentTimelineService(self.factory)


class PruneBatchTest(unittest.TestCase):
    def __init__(self, methodName: str = "runTest") -> None:
        # 实例属性在 ``__init__`` 里建：unittest 每个方法一个新实例，天然隔离；
        # 只在 ``setUp`` 里赋值会被 basedpyright 判成「未初始化实例变量」。
        super().__init__(methodName)
        self.harness = _Harness(self)

    def test_prune_deletes_only_expired_rows_in_batches(self) -> None:
        factory = self.harness.factory
        now = datetime.now(UTC).replace(tzinfo=None)
        old = now - timedelta(days=90)
        fresh = now - timedelta(days=1)
        with factory() as session:
            for index in range(5):
                session.add(_row(f"old.{index}", old))
            for index in range(3):
                session.add(_row(f"fresh.{index}", fresh))
            session.commit()

        removed = self.harness.service._prune_sync(old + timedelta(days=1))
        self.assertEqual(removed, 5)

        with factory() as session:
            remaining = [row.entity_id for row in session.query(AgentContextTimeline).all()]
        self.assertEqual(sorted(remaining), ["fresh.0", "fresh.1", "fresh.2"])

    def test_prune_stops_at_batch_cap(self) -> None:
        factory = self.harness.factory
        now = datetime.now(UTC).replace(tzinfo=None)
        old = now - timedelta(days=90)
        total = timeline_module.PRUNE_BATCH_SIZE * 2 + 1
        with factory() as session:
            session.add_all([_row(f"old.{index}", old) for index in range(total)])
            session.commit()

        removed = self.harness.service._prune_sync(now)
        # 单轮最多 PRUNE_MAX_BATCHES 批、每批 PRUNE_BATCH_SIZE 行
        self.assertLessEqual(removed, timeline_module.PRUNE_BATCH_SIZE * timeline_module.PRUNE_MAX_BATCHES)
        self.assertGreater(removed, 0)


class NumericThrottleTest(unittest.TestCase):
    def __init__(self, methodName: str = "runTest") -> None:
        # 只验证纯内存判据，不建库；``session_factory=None`` 时不会触库。
        super().__init__(methodName)
        self.service = AgentTimelineService(None)

    def test_numeric_sensor_is_throttled(self) -> None:
        first = {"entity_id": "sensor.power", "old_state": "10", "new_state": "11"}
        second = {"entity_id": "sensor.power", "old_state": "11", "new_state": "12"}
        self.assertFalse(self.service._should_skip_numeric(first))
        self.assertTrue(self.service._should_skip_numeric(second))

    def test_state_flip_is_never_throttled(self) -> None:
        service = self.service
        service._should_skip_numeric({"entity_id": "sensor.power", "old_state": "10", "new_state": "11"})
        self.assertFalse(
            service._should_skip_numeric({"entity_id": "sensor.power", "old_state": "11", "new_state": "unavailable"})
        )

    def test_non_numeric_domain_is_never_throttled(self) -> None:
        self.assertFalse(
            self.service._should_skip_numeric({"entity_id": "light.hall", "old_state": "on", "new_state": "off"})
        )

    def test_clock_entities_are_skipped(self) -> None:
        """纯时间刻度每天 1,440 行且毫无因果价值，必须直接丢弃。"""
        for entity_id in ("sensor.time", "sensor.time_utc", "sensor.date_time", "sensor.uptime"):
            self.assertTrue(
                self.service._should_skip_numeric({"entity_id": entity_id, "old_state": "10:01", "new_state": "10:02"}),
                entity_id,
            )

    def test_numeric_throttle_window(self) -> None:
        service = self.service
        self.assertFalse(
            service._should_skip_numeric({"entity_id": "sensor.power", "old_state": "1", "new_state": "2"})
        )
        # 窗口内第二条被节流
        self.assertTrue(service._should_skip_numeric({"entity_id": "sensor.power", "old_state": "2", "new_state": "3"}))
        self.assertGreaterEqual(timeline_module.NUMERIC_THROTTLE_SECONDS, 60.0)


class RetentionDaysTest(unittest.TestCase):
    def test_env_override(self) -> None:
        original = os.environ.get(timeline_module.RETENTION_DAYS_ENV)
        os.environ[timeline_module.RETENTION_DAYS_ENV] = "7"
        try:
            self.assertEqual(timeline_module._resolve_retention_days(), 7)
        finally:
            _restore_env(original)

    def test_invalid_env_falls_back(self) -> None:
        original = os.environ.get(timeline_module.RETENTION_DAYS_ENV)
        os.environ[timeline_module.RETENTION_DAYS_ENV] = "abc"
        try:
            self.assertEqual(timeline_module._resolve_retention_days(), timeline_module.RETENTION_DAYS)
        finally:
            _restore_env(original)


class EscalationMigrationTest(unittest.TestCase):
    def test_multiplies_legacy_values_and_keeps_zero(self) -> None:
        connection = sqlite3.connect(":memory:")
        try:
            connection.execute('CREATE TABLE alert_rules (id INTEGER PRIMARY KEY, "escalationMinutes" INTEGER)')
            connection.execute('INSERT INTO alert_rules (id, "escalationMinutes") VALUES (1, 1), (2, 2), (3, 0)')
            _fix_alert_rule_escalation_units(connection, _migration_context())
            rows = dict(connection.execute('SELECT id, "escalationMinutes" FROM alert_rules').fetchall())
            self.assertEqual(rows[1], 60)
            self.assertEqual(rows[2], 120)
            self.assertEqual(rows[3], 0)
        finally:
            connection.close()


def _migration_context() -> MigrationContext:
    """迁移函数只读 ``logger``；其余字段给内存库占位值即可。"""
    return MigrationContext(app="homeos", database_path=Path(":memory:"), data_dir=Path("."))


def _row(entity_id: str, changed_at: datetime) -> AgentContextTimeline:
    return AgentContextTimeline(
        entity_id=entity_id,
        domain=entity_id.split(".", 1)[0],
        area_id="",
        area_name="",
        old_state="off",
        new_state="on",
        changed_at=changed_at,
        trigger_source="EXTERNAL_DEVICE",
        actor="",
        context="{}",
        peer_snapshot="{}",
    )


def _restore_env(value: str | None) -> None:
    if value is None:
        os.environ.pop(timeline_module.RETENTION_DAYS_ENV, None)
    else:
        os.environ[timeline_module.RETENTION_DAYS_ENV] = value


if __name__ == "__main__":
    unittest.main()
