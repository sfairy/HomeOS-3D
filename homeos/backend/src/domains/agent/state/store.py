"""智能管家的跨进程共享状态（短时记忆 / 批量确认 / 日预算 / MCP 限流）。

为什么需要
----------
这四样状态原本都是进程内字典。单进程内语义没问题，一旦按 ``--workers 2`` 或多副本
部署就立刻走偏：

- 短时记忆：上一句在 worker A，下一句落到 worker B → 「把它关掉」解不出指代；
- 批量确认：确认提示由 A 发出、用户回「确认」落到 B → 计划丢失，或更糟：A 的计划
  在 B 上被当成「没有待确认内容」而重新走 LLM；
- 日预算：每个 worker 各记一份，实际可用的额度是配置值 × worker 数；
- MCP 限流：同上，限流阈值实际被放大。

设计
----
同一个 ``SharedStateStore`` 接口，两套实现：

- :class:`MemoryStateStore` —— 进程内字典。默认实现，测试与单进程部署行为不变。
- :class:`SqliteStateStore` —— ``<data_dir>/agent-state.sqlite3``，WAL + ``busy_timeout``，
  多进程共享；每次写入都在 ``BEGIN IMMEDIATE`` 事务里完成，避免读改写竞争。

TTL 与容量上限都由 store 承担（``ttl_seconds`` / ``prune``），服务层不再各写一份
「过期时间戳 + LRU 淘汰」的逻辑 —— 那份逻辑写两遍必然只改一处。
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

logger = logging.getLogger("homeos.agent.state")

#: 共享状态库文件名（在 ``<data_dir>`` 下）
STATE_DB_NAME = "agent-state.sqlite3"
#: 后端选择环境变量：``memory`` / ``sqlite``；留空按是否有 data_dir 自动选
ENV_STATE_BACKEND = "AGENT_STATE_BACKEND"
#: sqlite 锁等待上限（秒）：多 worker 并发写时不至于立刻抛 ``database is locked``
SQLITE_BUSY_TIMEOUT = 5.0

#: ``mutate`` 的返回值：(要写入的新值, 要返回给调用方的结果)；新值 None 表示删除
Mutator = Callable[[Any], tuple[Any | None, Any]]


class SharedStateStore:
    """键值存储接口（``namespace`` 用于隔离四类状态，互不干扰）。"""

    #: 是否跨进程共享（日志与 ping 用来说明当前口径）
    shared: bool = False

    def get(self, namespace: str, key: str) -> Any | None:
        raise NotImplementedError

    def set(self, namespace: str, key: str, value: Any, ttl_seconds: float | None = None) -> None:
        raise NotImplementedError

    def delete(self, namespace: str, key: str) -> None:
        raise NotImplementedError

    def entries(self, namespace: str) -> list[tuple[str, Any]]:
        """按「最近活跃」正序返回（最旧的在前），供 LRU 淘汰使用。"""
        raise NotImplementedError

    def mutate(self, namespace: str, key: str, mutator: Mutator, ttl_seconds: float | None = None) -> Any:
        """读改写一步完成；返回 ``mutator`` 给出的结果。

        单进程实现里这就是「读 → 改 → 写」；sqlite 实现放在 ``BEGIN IMMEDIATE`` 里，
        两个 worker 同时命中同一个键时只有一个能改成功，另一个看到改后的值。
        """
        raise NotImplementedError

    # 便捷方法
    def count(self, namespace: str) -> int:
        return len(self.entries(namespace))

    def prune(self, namespace: str, keep: int) -> int:
        """保留最近活跃的 ``keep`` 条；返回删除条数。"""
        rows = self.entries(namespace)
        excess = len(rows) - max(0, int(keep))
        if excess <= 0:
            return 0
        for key, _ in rows[:excess]:
            self.delete(namespace, key)
        return excess

    def hit(self, namespace: str, key: str, *, limit: int, window_seconds: float) -> bool:
        """滑动窗口限流：未超限时记一次并返回 True，超限返回 False。"""
        now = time.time()
        span = max(0.001, float(window_seconds))

        def _apply(old: Any) -> tuple[list[float], bool]:
            stamps = [float(item) for item in old if isinstance(item, (int, float))] if isinstance(old, list) else []
            recent = [stamp for stamp in stamps if now - stamp < span]
            if len(recent) >= limit:
                return recent, False
            recent.append(now)
            return recent, True

        return bool(self.mutate(namespace, key, _apply, ttl_seconds=span))


class MemoryStateStore(SharedStateStore):
    """进程内字典实现（默认；单进程部署与测试用）。"""

    shared = False

    def __init__(self) -> None:
        #: namespace → key → (value, expires_at | None, touched_at)
        self._data: dict[str, dict[str, tuple[Any, float | None, float]]] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _expired(expires_at: float | None, now: float) -> bool:
        return expires_at is not None and expires_at <= now

    def get(self, namespace: str, key: str) -> Any | None:
        with self._lock:
            bucket = self._data.get(namespace) or {}
            entry = bucket.get(key)
            if entry is None:
                return None
            now = time.time()
            value, expires_at, _ = entry
            if self._expired(expires_at, now):
                bucket.pop(key, None)
                return None
            # 读取刷活跃时间：LRU 淘汰据 touched_at 决定先后
            bucket[key] = (value, expires_at, now)
            return value

    def set(self, namespace: str, key: str, value: Any, ttl_seconds: float | None = None) -> None:
        now = time.time()
        expires_at = None if ttl_seconds is None else now + max(0.0, float(ttl_seconds))
        with self._lock:
            bucket = self._data.setdefault(namespace, {})
            bucket[key] = (value, expires_at, now)

    def delete(self, namespace: str, key: str) -> None:
        with self._lock:
            bucket = self._data.get(namespace)
            if bucket is not None:
                bucket.pop(key, None)

    def entries(self, namespace: str) -> list[tuple[str, Any]]:
        now = time.time()
        with self._lock:
            bucket = self._data.get(namespace) or {}
            alive = [(key, entry) for key, entry in bucket.items() if not self._expired(entry[1], now)]
            dead = [key for key in bucket if key not in {item[0] for item in alive}]
            for key in dead:
                bucket.pop(key, None)
        alive.sort(key=lambda item: item[1][2])
        return [(key, entry[0]) for key, entry in alive]

    def mutate(self, namespace: str, key: str, mutator: Mutator, ttl_seconds: float | None = None) -> Any:
        with self._lock:
            bucket = self._data.get(namespace) or {}
            now = time.time()
            entry = bucket.get(key)
            current = None
            if entry is not None and not self._expired(entry[1], now):
                current = entry[0]
            new_value, result = mutator(current)
            if new_value is None:
                bucket.pop(key, None)
            else:
                expires_at = None if ttl_seconds is None else now + max(0.0, float(ttl_seconds))
                bucket[key] = (new_value, expires_at, now)
            self._data.setdefault(namespace, bucket)
            return result


class SqliteStateStore(SharedStateStore):
    """文件型 sqlite 实现：多个 worker / 副本共享同一份状态。"""

    shared = True

    def __init__(self, path: Path) -> None:
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(
            str(self._path),
            timeout=SQLITE_BUSY_TIMEOUT,
            check_same_thread=False,
            isolation_level=None,
        )
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute(f"PRAGMA busy_timeout={int(SQLITE_BUSY_TIMEOUT * 1000)}")
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_state (
                namespace TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                expires_at REAL,
                touched_at REAL NOT NULL,
                PRIMARY KEY (namespace, key)
            )
            """
        )
        self._conn.execute("CREATE INDEX IF NOT EXISTS idx_agent_state_touched ON agent_state (namespace, touched_at)")

    @property
    def path(self) -> Path:
        return self._path

    def close(self) -> None:
        with self._lock:
            try:
                self._conn.close()
            except sqlite3.Error as exc:
                logger.debug("关闭共享状态库失败: %s", exc)

    # 内部：在事务里执行一段操作
    def _transaction(self, action):
        with self._lock:
            try:
                self._conn.execute("BEGIN IMMEDIATE")
                result = action()
                self._conn.execute("COMMIT")
                return result
            except sqlite3.Error as exc:
                logger.warning("共享状态库操作失败，本次按未命中处理: %s", exc)
                try:
                    self._conn.execute("ROLLBACK")
                except sqlite3.Error as rollback_exc:
                    logger.debug("共享状态库回滚失败: %s", rollback_exc)
                return None

    @staticmethod
    def _decode(raw: str) -> Any:
        try:
            return json.loads(raw)
        except ValueError as exc:
            logger.debug("共享状态值不是合法 JSON，已忽略: %s", exc)
            return None

    @staticmethod
    def _is_expired(expires_at: float | None, now: float) -> bool:
        return expires_at is not None and expires_at <= now

    def get(self, namespace: str, key: str) -> Any | None:
        def _action():
            now = time.time()
            row = self._conn.execute(
                "SELECT value, expires_at FROM agent_state WHERE namespace = ? AND key = ?",
                (namespace, key),
            ).fetchone()
            if row is None:
                return None
            if self._is_expired(row[1], now):
                self._conn.execute("DELETE FROM agent_state WHERE namespace = ? AND key = ?", (namespace, key))
                return None
            self._conn.execute(
                "UPDATE agent_state SET touched_at = ? WHERE namespace = ? AND key = ?",
                (now, namespace, key),
            )
            return self._decode(row[0])

        return self._transaction(_action)

    def set(self, namespace: str, key: str, value: Any, ttl_seconds: float | None = None) -> None:
        now = time.time()
        expires_at = None if ttl_seconds is None else now + max(0.0, float(ttl_seconds))
        payload = json.dumps(value, ensure_ascii=False)

        def _action():
            self._conn.execute(
                """
                INSERT INTO agent_state (namespace, key, value, expires_at, touched_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(namespace, key) DO UPDATE SET
                    value = excluded.value,
                    expires_at = excluded.expires_at,
                    touched_at = excluded.touched_at
                """,
                (namespace, key, payload, expires_at, now),
            )

        self._transaction(_action)

    def delete(self, namespace: str, key: str) -> None:
        self._transaction(
            lambda: self._conn.execute("DELETE FROM agent_state WHERE namespace = ? AND key = ?", (namespace, key))
        )

    def entries(self, namespace: str) -> list[tuple[str, Any]]:
        def _action():
            now = time.time()
            self._conn.execute(
                "DELETE FROM agent_state WHERE namespace = ? AND expires_at IS NOT NULL AND expires_at <= ?",
                (namespace, now),
            )
            return self._conn.execute(
                "SELECT key, value FROM agent_state WHERE namespace = ? ORDER BY touched_at ASC",
                (namespace,),
            ).fetchall()

        rows = self._transaction(_action) or []
        decoded: list[tuple[str, Any]] = []
        for key, raw in rows:
            value = self._decode(raw)
            if value is not None:
                decoded.append((str(key), value))
        return decoded

    def mutate(self, namespace: str, key: str, mutator: Mutator, ttl_seconds: float | None = None) -> Any:
        now = time.time()
        expires_at = None if ttl_seconds is None else now + max(0.0, float(ttl_seconds))

        def _action():
            row = self._conn.execute(
                "SELECT value, expires_at FROM agent_state WHERE namespace = ? AND key = ?",
                (namespace, key),
            ).fetchone()
            current = None
            if row is not None and not self._is_expired(row[1], now):
                current = self._decode(row[0])
            new_value, result = mutator(current)
            if new_value is None:
                self._conn.execute("DELETE FROM agent_state WHERE namespace = ? AND key = ?", (namespace, key))
                return result
            self._conn.execute(
                """
                INSERT INTO agent_state (namespace, key, value, expires_at, touched_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(namespace, key) DO UPDATE SET
                    value = excluded.value,
                    expires_at = excluded.expires_at,
                    touched_at = excluded.touched_at
                """,
                (namespace, key, json.dumps(new_value, ensure_ascii=False), expires_at, now),
            )
            return result

        return self._transaction(_action)


def build_shared_store(data_dir: Path | None, env: Mapping[str, str] | None = None) -> SharedStateStore:
    """按环境选择实现：``AGENT_STATE_BACKEND=memory`` 强制进程内，否则用文件库。"""
    environ = env if env is not None else {}
    backend = str(environ.get(ENV_STATE_BACKEND, "")).strip().lower()
    if backend in ("memory", "process", "local"):
        logger.info("智能管家共享状态：进程内（%s=%s）", ENV_STATE_BACKEND, backend)
        return MemoryStateStore()
    if data_dir is None:
        return MemoryStateStore()
    try:
        store = SqliteStateStore(Path(data_dir) / STATE_DB_NAME)
    except (sqlite3.Error, OSError) as exc:
        logger.warning("共享状态库打开失败，回退进程内状态: %s", exc)
        return MemoryStateStore()
    logger.info("智能管家共享状态：%s（%s）", store.path, "跨进程共享" if store.shared else "进程内")
    return store


__all__ = [
    "ENV_STATE_BACKEND",
    "STATE_DB_NAME",
    "MemoryStateStore",
    "SharedStateStore",
    "SqliteStateStore",
    "build_shared_store",
]
