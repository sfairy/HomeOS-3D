"""跨进程共享状态的回归：短时记忆 / 批量确认 / 日预算 / MCP 限流。

这些状态本来是进程内字典，多 worker 部署时各自记一份 —— 指代解不出、确认丢失、
额度翻倍、限流放大。这里校验的是「换成共享后端后语义不变、且真的能跨实例看见」。

刻意不联网、不依赖真实 sqlite 连接池以外的任何外部服务。

运行：node ops/lib/py.mjs -m unittest discover -s homeos/backend/tests -t homeos/backend -v
"""

from __future__ import annotations

import sys
import tempfile
import time
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.agent.memory.short_term_memory import (
    SESSION_TTL_MS,
    AgentShortTermMemoryService,
)
from src.domains.agent.policy.budget import (
    AgentBudgetConfig,
    AgentBudgetService,
)
from src.domains.agent.runtime.batch_ops import BatchOperationService
from src.domains.agent.state.store import (
    ENV_STATE_BACKEND,
    MemoryStateStore,
    SqliteStateStore,
    build_shared_store,
)


class _TempStoreMixin:
    """给每个用例一个独立的 sqlite 状态库。"""

    def make_stores(self) -> tuple[SqliteStateStore, SqliteStateStore, tempfile.TemporaryDirectory]:
        tmp = tempfile.TemporaryDirectory()
        path = Path(tmp.name) / "agent-state.sqlite3"
        first = SqliteStateStore(path)
        second = SqliteStateStore(path)
        self.addCleanup(tmp.cleanup)
        self.addCleanup(first.close)
        self.addCleanup(second.close)
        return first, second, tmp


class StoreContractTest(_TempStoreMixin, unittest.TestCase):
    """两个实现必须满足同一份契约。"""

    def _stores(self):
        return [MemoryStateStore(), SqliteStateStore(Path(tempfile.mkdtemp()) / "state.sqlite3")]

    def test_set_get_delete(self) -> None:
        for store in self._stores():
            with self.subTest(store=type(store).__name__):
                store.set("ns", "k", {"a": 1})
                self.assertEqual(store.get("ns", "k"), {"a": 1})
                store.delete("ns", "k")
                self.assertIsNone(store.get("ns", "k"))

    def test_ttl_expiry(self) -> None:
        for store in self._stores():
            with self.subTest(store=type(store).__name__):
                store.set("ns", "k", "v", ttl_seconds=0.05)
                self.assertEqual(store.get("ns", "k"), "v")
                time.sleep(0.08)
                self.assertIsNone(store.get("ns", "k"))

    def test_entries_ordered_by_recent_activity(self) -> None:
        for store in self._stores():
            with self.subTest(store=type(store).__name__):
                store.set("ns", "a", 1)
                time.sleep(0.01)
                store.set("ns", "b", 2)
                time.sleep(0.01)
                # 读取 a 后，a 变成最近活跃，淘汰时应保住它
                store.get("ns", "a")
                self.assertEqual([key for key, _ in store.entries("ns")], ["b", "a"])

    def test_prune_keeps_newest(self) -> None:
        for store in self._stores():
            with self.subTest(store=type(store).__name__):
                for index in range(5):
                    store.set("ns", f"k{index}", index)
                    time.sleep(0.01)
                self.assertEqual(store.prune("ns", 2), 3)
                self.assertEqual([key for key, _ in store.entries("ns")], ["k3", "k4"])

    def test_mutate_returns_result_and_persists(self) -> None:
        for store in self._stores():
            with self.subTest(store=type(store).__name__):
                store.set("ns", "k", 1)
                result = store.mutate("ns", "k", lambda old: ((old or 0) + 1, "done"))
                self.assertEqual(result, "done")
                self.assertEqual(store.get("ns", "k"), 2)

    def test_hit_limits_within_window(self) -> None:
        for store in self._stores():
            with self.subTest(store=type(store).__name__):
                self.assertTrue(store.hit("rate", "c", limit=2, window_seconds=30))
                self.assertTrue(store.hit("rate", "c", limit=2, window_seconds=30))
                self.assertFalse(store.hit("rate", "c", limit=2, window_seconds=30))


class SqliteSharingTest(_TempStoreMixin, unittest.TestCase):
    """两个独立实例（模拟两个 worker）必须看到同一份状态。"""

    def test_short_term_memory_cross_instance(self) -> None:
        store_a, store_b, _ = self.make_stores()
        worker_a = AgentShortTermMemoryService(store_a)
        worker_b = AgentShortTermMemoryService(store_b)

        worker_a.append_turn("s1", "打开客厅灯", "好的，已打开。")
        history = worker_b.get_history("s1")
        self.assertEqual([turn.content for turn in history], ["打开客厅灯", "好的，已打开。"])

        worker_a.remember_targets("s1", ["light.living"])
        self.assertEqual(worker_b.get_last_targets("s1"), ["light.living"])

    def test_short_term_memory_ttl_reset(self) -> None:
        store, _, _ = self.make_stores()
        service = AgentShortTermMemoryService(store)
        service.append_turn("s1", "开灯", "好")
        # 把 lastActive 拨回到 TTL 之外，模拟「45 秒没说话」
        payload = store.get("agent.short_term", "s1")
        payload["lastActive"] = int(time.time() * 1000) - SESSION_TTL_MS - 1000
        store.set("agent.short_term", "s1", payload)
        self.assertEqual(service.get_history("s1"), [])

    def test_batch_pending_cross_instance(self) -> None:
        store_a, store_b, _ = self.make_stores()
        stage_side = BatchOperationService(store_a)
        confirm_side = BatchOperationService(store_b)

        stage_side.stage("s1", [("control_device", {"entity_id": "light.a"})], "客厅灯")
        pending = confirm_side.peek_pending("s1")
        self.assertIsNotNone(pending)
        assert pending is not None
        self.assertEqual(pending.summary, "客厅灯")

        popped = confirm_side.pop_pending("s1")
        self.assertIsNotNone(popped)
        # 一次性语义：第二个 worker 再取已经是空
        self.assertIsNone(stage_side.pop_pending("s1"))

    def test_batch_undo_cross_instance(self) -> None:
        store_a, store_b, _ = self.make_stores()
        BatchOperationService(store_a).remember_undo(
            "s1",
            [{"entity_id": "light.a", "domain": "light", "state": "off"}],
            "关灯",
        )
        record = BatchOperationService(store_b).pop_undo("s1")
        self.assertIsNotNone(record)
        assert record is not None
        self.assertEqual(record.snapshot[0]["entity_id"], "light.a")

    def test_budget_counts_once_across_workers(self) -> None:
        store_a, store_b, _ = self.make_stores()
        worker_a = AgentBudgetService(store=store_a)
        worker_b = AgentBudgetService(store=store_b)
        worker_a.configure(AgentBudgetConfig(daily_token_budget=60))
        worker_b.configure(AgentBudgetConfig(daily_token_budget=60))

        worker_a.record("u1", prompt_tokens=30, completion_tokens=10, cost_cny=0.01)
        # 40 < 60：还没到额度，另一个 worker 看到的也是 40
        self.assertTrue(worker_b.check("u1").allowed)
        self.assertEqual(worker_b.snapshot("u1")["totalTokens"], 40)

        worker_b.record("u1", prompt_tokens=30, completion_tokens=10, cost_cny=0.01)
        snapshot = worker_a.snapshot("u1")
        self.assertEqual(snapshot["totalTokens"], 80)
        self.assertEqual(snapshot["llmRuns"], 2)
        # 额度是全屋共享的一份，不是「配置值 × worker 数」
        self.assertFalse(worker_a.check("u1").allowed)


class BuildStoreTest(unittest.TestCase):
    """装配口径：默认用文件库，``AGENT_STATE_BACKEND=memory`` 可强制退回进程内。"""

    def test_memory_backend_forces_process_local(self) -> None:
        store = build_shared_store(Path(tempfile.mkdtemp()), env={ENV_STATE_BACKEND: "memory"})
        self.assertIsInstance(store, MemoryStateStore)
        self.assertFalse(store.shared)

    def test_default_uses_sqlite_when_data_dir_present(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        store = build_shared_store(Path(tmp.name), env={})
        self.assertIsInstance(store, SqliteStateStore)
        self.assertTrue(store.shared)
        store.close()

    def test_missing_data_dir_falls_back_to_memory(self) -> None:
        store = build_shared_store(None, env={})
        self.assertIsInstance(store, MemoryStateStore)


if __name__ == "__main__":
    unittest.main()
