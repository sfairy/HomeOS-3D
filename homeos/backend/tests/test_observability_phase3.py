"""Phase 3 观测：事件循环延迟采样、数据库语句计数与 /metrics 输出。"""

from __future__ import annotations

import asyncio
import unittest

from src.platform.core.database import Database
from src.platform.core.observability import (
    EventLoopLagMonitor,
    LoopLagSnapshot,
    format_homeos_prometheus_metrics,
    get_db_query_counts,
)


class PrometheusMetricsTest(unittest.TestCase):
    def test_loop_lag_and_db_query_metrics_are_exported(self) -> None:
        body = format_homeos_prometheus_metrics(
            ha_connected=True,
            entity_count=12,
            socket_clients=3,
            uptime_seconds=9,
            latency=[],
            ha_ws_deferred_dropped_total=4,
            loop_lag=LoopLagSnapshot(p50=1.25, p99=8.5, max=12.0, count=7),
            db_query_counts={"select": 11, "write": 2, "other": 1},
            startup_duration_ms=123.4,
        )
        self.assertIn('homeos_event_loop_lag_ms{quantile="p50"} 1.25', body)
        self.assertIn('homeos_event_loop_lag_ms{quantile="p99"} 8.5', body)
        self.assertIn('homeos_event_loop_lag_ms{quantile="max"} 12', body)
        self.assertIn("homeos_event_loop_lag_samples 7", body)
        self.assertIn('homeos_db_queries_total{kind="select"} 11', body)
        self.assertIn('homeos_db_queries_total{kind="write"} 2', body)
        self.assertIn('homeos_db_queries_total{kind="other"} 1', body)
        self.assertIn("homeos_startup_duration_ms 123.4", body)

    def test_metrics_default_to_zero_without_samples(self) -> None:
        body = format_homeos_prometheus_metrics(
            ha_connected=False,
            entity_count=0,
            socket_clients=0,
            uptime_seconds=0,
            latency=[],
            ha_ws_deferred_dropped_total=0,
        )
        self.assertIn("homeos_event_loop_lag_samples 0", body)
        self.assertIn('homeos_event_loop_lag_ms{quantile="p99"} 0', body)
        self.assertIn("homeos_startup_duration_ms 0", body)


class EventLoopLagMonitorTest(unittest.IsolatedAsyncioTestCase):
    async def test_monitor_collects_samples_and_stops(self) -> None:
        monitor = EventLoopLagMonitor(interval_seconds=0.01, window=8)
        await monitor.start()
        await asyncio.sleep(0.06)
        snapshot = monitor.snapshot()
        self.assertGreaterEqual(snapshot.count, 1)
        self.assertGreaterEqual(snapshot.p99, 0.0)
        await monitor.stop()
        self.assertEqual(monitor.snapshot().count, snapshot.count)


class DatabaseQueryCounterTest(unittest.TestCase):
    def test_select_statement_increments_counter(self) -> None:
        before = get_db_query_counts()["select"]
        database = Database("sqlite+pysqlite:///:memory:")
        try:
            with database.engine.connect() as connection:
                connection.exec_driver_sql("SELECT 1")
        finally:
            database.dispose()
        self.assertGreaterEqual(get_db_query_counts()["select"], before + 1)
