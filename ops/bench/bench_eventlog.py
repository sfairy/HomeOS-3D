#!/usr/bin/env python3
"""事件日志写入基准：从 ``handle_state_change_batch`` 到落盘的每行成本。

驱动真实 ``EventLogService``，落在临时 SQLite 上，量与维度和产品一致：

- ``rows_per_batch`` / ``iterations``：一批多少条、跑多少批（每批独立 entity_id，
  避免唯一索引把重复行挡掉让结果失真）；
- ``with_old_state``：是否保留「非电表行也写 ``oldState``」的旧行为。当前实现按
  ``eventLogMaxBuffer`` 决定一次 flush 的行数，基准显式把它拉高以测「单批写入」本身。

输出：每批耗时 p50/p95、每秒行数、库文件与 WAL 增长、**每行平均字节**（``JSON`` 列
的实际占用，用 ``length(oldState) + length(newState)`` 统计，能直接反映瘦身效果）。

用法：
    node ops/lib/py.mjs ops/bench/bench_eventlog.py
    node ops/lib/py.mjs ops/bench/bench_eventlog.py --rows 1000 --iterations 10
"""

from __future__ import annotations

import argparse
import asyncio
import tempfile
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from _support import measure, report, timing_summary
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from homeos.backend.src.domains.logs.event_log import EventLogService
from homeos.backend.src.platform.core.db import models  # noqa: F401  # 注册模型到 Base.metadata
from homeos.backend.src.platform.core.db.models import EventLog
from homeos.backend.src.platform.core.db.schema import create_all_schemas


class FakeDatabase:
    """``EventLogService`` 只要求 ``database.session_factory``。"""

    def __init__(self, factory: Any) -> None:
        self.session_factory = factory


def build_service(directory: Path) -> tuple[EventLogService, Any, Path]:
    db_path = directory / "events.db"
    engine = create_engine(
        f"sqlite+pysqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    create_all_schemas(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    service = EventLogService(FakeDatabase(factory))
    # 一批一次提交：基准测的是「单批写入成本」，而不是缓冲区阈值触发时机。
    service._ops["eventLogMaxBuffer"] = 10**9
    service._ops["eventLogMaxRequeueBuffer"] = 10**9
    return service, factory, db_path


def build_changes(count: int, batch_index: int) -> list[dict[str, Any]]:
    base = datetime(2026, 11, 24, 12, 0, 0, tzinfo=UTC) + timedelta(minutes=batch_index)
    changes: list[dict[str, Any]] = []
    for index in range(count):
        entity_id = f"light.bench_{batch_index}_{index}"
        stamp = (base + timedelta(milliseconds=index)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        changes.append(
            {
                "entity_id": entity_id,
                "old_state": {
                    "entity_id": entity_id,
                    "state": "off",
                    "attributes": {
                        "brightness": 120,
                        "color_mode": "color_temp",
                        "supported_color_modes": ["rgb", "color_temp", "hs"],
                        "effect_list": ["rainbow", "colorloop", "random", "none"],
                        "friendly_name": f"设备 {index}",
                    },
                    "last_changed": stamp,
                    "last_updated": stamp,
                },
                "new_state": {
                    "entity_id": entity_id,
                    "state": "on",
                    "attributes": {
                        "brightness": 200,
                        "color_mode": "color_temp",
                        "supported_color_modes": ["rgb", "color_temp", "hs"],
                        "effect_list": ["rainbow", "colorloop", "random", "none"],
                        "friendly_name": f"设备 {index}",
                    },
                    "last_changed": stamp,
                    "last_updated": stamp,
                },
            }
        )
    return changes


def _row_bytes(factory: Any) -> tuple[int, int]:
    """返回 ``(行数, oldState+newState 的总字符数)``。"""
    with factory() as session:
        row_count = int(session.execute(select(func.count()).select_from(EventLog)).scalar_one())
        state_bytes = int(
            session.execute(
                select(
                    func.coalesce(func.sum(func.length(EventLog.old_state)), 0)
                    + func.coalesce(func.sum(func.length(EventLog.new_state)), 0)
                )
            ).scalar_one()
        )
    return row_count, state_bytes


def run(rows: int, iterations: int) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as raw:
        directory = Path(raw)
        service, factory, db_path = build_service(directory)
        batches = [build_changes(rows, index) for index in range(iterations + 2)]

        def once(index_holder: list[int]) -> None:
            index = index_holder[0]
            index_holder[0] += 1
            changes = batches[index]
            service.handle_state_change_batch({"changes": changes})
            asyncio.run(service.flush())

        holder = [0]
        started = time.perf_counter()
        once(holder)
        warmup_ms = (time.perf_counter() - started) * 1000.0

        index_holder = [holder[0]]
        samples = measure(lambda: once(index_holder), iterations, warmup=0)
        total_rows, state_bytes = _row_bytes(factory)
        total_ms = sum(samples) or 1e-9
        db_size = db_path.stat().st_size if db_path.exists() else 0
        wal = db_path.with_name(db_path.name + "-wal")
        wal_size = wal.stat().st_size if wal.exists() else 0

        return {
            "rows_per_batch": rows,
            "iterations": iterations,
            "batch_latency_ms": timing_summary(samples),
            "warmup_batch_ms": round(warmup_ms, 3),
            "rows_written": total_rows,
            "rows_per_second": round(total_rows / (total_ms / 1000.0), 1),
            "state_chars_per_row": round(state_bytes / total_rows, 1) if total_rows else 0.0,
            "db_bytes": db_size,
            "wal_bytes": wal_size,
            "bytes_per_row_on_disk": round(db_size / total_rows, 1) if total_rows else 0.0,
        }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="事件日志写入基准")
    parser.add_argument("--rows", type=int, default=500, help="每批行数")
    parser.add_argument("--iterations", type=int, default=8)
    args = parser.parse_args(argv)
    report("eventlog", run(args.rows, args.iterations))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
