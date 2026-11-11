"""E4 回归：批量控制的限流、逐项结果与取消语义。"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.proxy.batch import (
    DEFAULT_BATCH_CONCURRENCY,
    MAX_BATCH_CONCURRENCY,
    _concurrency,
    run_batch,
)


def _run(coro):
    return asyncio.run(coro)


class _Proxy:
    """记录并发峰值；可让指定实体失败。"""

    def __init__(self, fail_entities: set[str] | None = None, delay: float = 0.01) -> None:
        self.fail_entities = fail_entities or set()
        self.delay = delay
        self.active = 0
        self.peak = 0
        self.calls: list[str] = []

    async def call_service(self, dto: dict[str, Any], *, policy: str | None = "http"):
        self.active += 1
        self.peak = max(self.peak, self.active)
        try:
            self.calls.append(dto["entity_id"])
            await asyncio.sleep(self.delay)
            if dto["entity_id"] in self.fail_entities:
                raise RuntimeError("boom")
            return {"success": True, "verified": True, "data": []}
        finally:
            self.active -= 1


def _items(count: int) -> list[dict[str, Any]]:
    return [
        {"domain": "light", "service": "turn_off", "entity_id": f"light.{index}", "service_data": {}}
        for index in range(count)
    ]


class ConcurrencyTests(unittest.TestCase):
    def test_default_and_bounds(self) -> None:
        self.assertEqual(_concurrency(None), DEFAULT_BATCH_CONCURRENCY)
        self.assertEqual(_concurrency(0), 1)
        self.assertEqual(_concurrency(999), MAX_BATCH_CONCURRENCY)
        self.assertEqual(_concurrency("abc"), DEFAULT_BATCH_CONCURRENCY)

    def test_peak_concurrency_respects_limit(self) -> None:
        proxy = _Proxy(delay=0.02)
        result = _run(run_batch(proxy, _items(20), concurrency=3))

        self.assertLessEqual(proxy.peak, 3)
        self.assertEqual(result["total"], 20)
        self.assertEqual(result["succeeded"], 20)
        self.assertTrue(result["ok"])


class ResultReportingTests(unittest.TestCase):
    def test_partial_failure_is_reported_per_item(self) -> None:
        proxy = _Proxy(fail_entities={"light.3"})
        result = _run(run_batch(proxy, _items(5), concurrency=2))

        self.assertFalse(result["ok"])
        self.assertEqual(result["failed"], 1)
        self.assertEqual(result["succeeded"], 4)
        failed = [item for item in result["results"] if not item["ok"]]
        self.assertEqual(failed[0]["entityId"], "light.3")
        self.assertIn("boom", failed[0]["error"])

    def test_results_keep_request_order(self) -> None:
        proxy = _Proxy()
        result = _run(run_batch(proxy, _items(6), concurrency=4))
        self.assertEqual([item["index"] for item in result["results"]], list(range(6)))
        self.assertEqual([item["entityId"] for item in result["results"]], [f"light.{i}" for i in range(6)])

    def test_pending_is_not_counted_as_success(self) -> None:
        class _PendingProxy:
            async def call_service(self, dto, *, policy=None):
                return {"success": False, "pending": True, "skipped": True}

        result = _run(run_batch(_PendingProxy(), _items(2)))
        self.assertFalse(result["ok"])
        self.assertEqual(result["succeeded"], 0)


class CancelTests(unittest.TestCase):
    def test_cancel_on_error_stops_new_items(self) -> None:
        proxy = _Proxy(fail_entities={"light.0"}, delay=0.01)
        result = _run(run_batch(proxy, _items(30), concurrency=1, cancel_on_error=True))

        # 第一条失败后不再有新下发；剩余项标记为已取消。
        self.assertEqual(len(proxy.calls), 1)
        cancelled = [item for item in result["results"] if item.get("error") == "batch_cancelled"]
        self.assertEqual(len(cancelled), 29)
        self.assertFalse(result["ok"])

    def test_without_cancel_all_items_run(self) -> None:
        proxy = _Proxy(fail_entities={"light.0"}, delay=0.001)
        result = _run(run_batch(proxy, _items(10), concurrency=2, cancel_on_error=False))

        self.assertEqual(len(proxy.calls), 10)
        self.assertEqual(result["failed"], 1)


if __name__ == "__main__":
    unittest.main()
