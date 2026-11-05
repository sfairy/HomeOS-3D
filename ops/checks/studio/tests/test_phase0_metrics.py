"""Phase 0 观测契约：`/metrics` 必须能证明「微批生效」「翻转数」「写事务耗时」。

为什么这些断言值钱
------------------
路线图 Phase 0 要求新增 ``db_write_tx_total`` / ``db_write_ms`` / ``ha_flip_total``。
没有它们，「每个 flip 一次写事务」变成「每批一次」这件事只能靠读代码相信；
有了它们，``ha_flip_total / db_write_tx_total`` 就是可算的比值。

这里同时钉住三条容易写错的口径：

1. 只读会话也算一次 commit，但**不是**写事务 —— 不能计入；
2. 一批 5 条 ORM 写入 + 一个 Core 批量 INSERT 各自只算 **1** 次事务（这正是微批的收益）；
3. 回滚结束事务但不计入（否则会产生一条假的超长样本）。
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from src.platform.core.db.database import Database
from src.platform.core.runtime.observability import (
    DB_WRITE_MS_BUCKETS,
    LoopLagSnapshot,
    format_homeos_prometheus_metrics,
    get_db_write_snapshot,
    get_ha_flip_total,
    record_ha_flip,
)


class _Base(DeclarativeBase):
    pass


class _Probe(_Base):
    __tablename__ = "phase0_probe"

    id: Mapped[int] = mapped_column(primary_key=True)
    value: Mapped[str] = mapped_column(default="")


class Phase0MetricsTest(unittest.TestCase):
    """写事务 / 翻转计数指标的行为契约。"""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        db_path = os.path.join(self._tmpdir.name, "metrics.db")
        self.database = Database(f"sqlite:///{db_path}")
        self.addCleanup(self.database.dispose)
        _Base.metadata.create_all(self.database.engine)

    def _tx_total(self) -> int:
        return int(get_db_write_snapshot()["total"])  # type: ignore[arg-type]

    def test_read_only_session_is_not_a_write_transaction(self) -> None:
        before = self._tx_total()
        with self.database.session_factory() as session:
            session.execute(text("SELECT 1"))
            session.commit()
        self.assertEqual(self._tx_total(), before)

    def test_orm_batch_of_five_rows_is_one_transaction(self) -> None:
        """微批的核心断言：5 条 INSERT 走同一个 commit 只记 1 次。"""
        before = self._tx_total()
        with self.database.session_factory() as session:
            for index in range(5):
                session.add(_Probe(value=f"orm-{index}"))
            session.commit()
        self.assertEqual(self._tx_total() - before, 1)

    def test_core_batch_is_one_transaction(self) -> None:
        """`session.execute(insert(...))` 不走 ORM flush，连接级埋点也必须覆盖。"""
        before = self._tx_total()
        with self.database.session_factory() as session:
            session.execute(text("INSERT INTO phase0_probe (value) VALUES ('a')"))
            session.execute(text("INSERT INTO phase0_probe (value) VALUES ('b')"))
            session.commit()
        self.assertEqual(self._tx_total() - before, 1)

    def test_rollback_does_not_count(self) -> None:
        before = self._tx_total()
        session = self.database.session_factory()
        try:
            session.add(_Probe(value="rolled-back"))
            session.flush()
            session.rollback()
        finally:
            session.close()
        self.assertEqual(self._tx_total(), before)

    def test_histogram_is_cumulative_and_consistent(self) -> None:
        with self.database.session_factory() as session:
            session.add(_Probe(value="one"))
            session.commit()
        snapshot = get_db_write_snapshot()
        buckets = list(snapshot["buckets"])  # type: ignore[arg-type]
        self.assertEqual(len(buckets), len(DB_WRITE_MS_BUCKETS))
        # Prometheus 口径：各桶单调不减，最后一个桶等于总数
        self.assertEqual(buckets, sorted(buckets))
        self.assertEqual(buckets[-1], int(snapshot["total"]))  # type: ignore[arg-type]
        self.assertGreaterEqual(float(snapshot["sum_ms"]), 0.0)  # type: ignore[arg-type]

    def test_metrics_text_exposes_phase0_series(self) -> None:
        record_ha_flip()
        record_ha_flip()
        body = format_homeos_prometheus_metrics(
            ha_connected=True,
            entity_count=0,
            socket_clients=0,
            uptime_seconds=1,
            latency=[],
            loop_lag=LoopLagSnapshot(0.0, 0.0, 0.0, 0),
        )
        self.assertIn("homeos_db_write_tx_total", body)
        self.assertIn("homeos_db_write_ms_bucket", body)
        self.assertIn('homeos_db_write_ms_bucket{le="+Inf"}', body)
        self.assertIn("homeos_db_write_ms_count", body)
        self.assertIn("homeos_ha_flip_total", body)
        self.assertGreaterEqual(get_ha_flip_total(), 2)
        # 直方图必须比计数器晚出现（渲染顺序固定，抓取端按行拼接）
        self.assertLess(body.index("homeos_db_write_tx_total"), body.index("homeos_db_write_ms_count"))


if __name__ == "__main__":
    unittest.main()
