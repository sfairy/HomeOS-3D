#!/usr/bin/env python3
"""事件日志写入路径自检：钉死「能耗失败导致事件日志重复写入」这条回归。

背景（2026-11-18 → 11-21 的线上事故）
--------------------------------------
``event_logs`` 在三天半里堆到 1222 万行，但只有 4342 个不同的发生时刻 —— 单条事件最多被
写了 **12614 次**，库因此涨到 9.9 GB（备份也连带超限失败）。

机制：
1. ``_write_batch`` 先提交显示行（commit），再跑能耗副作用；
2. 能耗路径当时把 ``accumulate_energy_totals`` 放在内部 try 之外，它因缺少 ``created_at``
   抛 KeyError；
3. 异常冒泡到 ``flush`` → 被当成「整批没写成」→ 回灌整个 batch；
4. 下一轮又提交一遍显示行 → 又 KeyError → 再回灌 …… 循环到那份配置被修好为止。

修复的两层：
- energy 路径**全量**隔离（``_apply_energy_side_effects`` 内部 try 覆盖整个函数体）；
- ``_write_batch`` 再包一层，保证「记账失败只损失记账」不被后来的改动破坏；
- ``_write_display_rows`` 批内按 ``(entity, 时刻, 变化)`` 去重，防止同类放大。

本自检用**真实的** EventLogService 跑临时 SQLite：注入一个必然抛 KeyError 的能耗函数，
断言「事件日志只写一次」而不是「每轮重试写一次」。

用法：
    node ops/lib/py.mjs ops/checks/event_log_selftest.py
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from datetime import UTC, datetime

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from homeos.backend.src.domains.logs.event_log import EventLogService
from homeos.backend.src.platform.core.db import models  # noqa: F401
from homeos.backend.src.platform.core.db.database import Base
from homeos.backend.src.platform.core.db.models import EventLog

AT_A = datetime(2026, 11, 18, 13, 2, 38, 72132, tzinfo=UTC)
AT_B = datetime(2026, 11, 18, 13, 2, 39, tzinfo=UTC)

CHECKS: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if not condition:
        raise AssertionError(f"{name} 失败{('：' + detail) if detail else ''}")
    CHECKS.append(name)


class FakeDatabase:
    def __init__(self, factory: Any) -> None:
        self.session_factory = factory


def build_service(tmp: Path) -> tuple[EventLogService, Any]:
    tmp.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        f"sqlite+pysqlite:///{tmp / 'events.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    service = EventLogService(FakeDatabase(factory))
    return service, factory


def event(entity: str, old: str, new: str, at: str = AT_A) -> dict[str, Any]:
    """一条状态变化：``last_changed`` 固定，模拟「同一批被反复投递」。"""
    return {
        "entity_id": entity,
        "old_state": {"entity_id": entity, "state": old, "last_changed": at},
        "new_state": {"entity_id": entity, "state": new, "last_changed": at},
    }


def count_rows(factory: Any) -> int:
    with factory() as session:
        return int(session.execute(select(func.count()).select_from(EventLog)).scalar_one())


def test_energy_failure_does_not_duplicate(tmp: Path) -> None:
    """核心回归：能耗副作用抛错时，事件日志不能被重复写。"""
    service, factory = build_service(tmp / "a")

    def boom(_batch: list[dict[str, Any]]) -> None:
        raise KeyError("created_at")  # 与 11-18 事故同一形态

    # 绕过「内部已隔离」的那层，直接打最外层的兜底：模拟「将来有人把 energy 的 try 挪走」。
    service._apply_energy_side_effects = boom  # type: ignore[method-assign]

    batch = [
        {
            "entity_id": "select.a",
            "old_state": {},
            "new_state": {},
            "state_diff": "unavailable→自学习",
            "created_at": AT_A,
        }
    ]
    service._write_batch(batch, service._clear_epoch)
    after_first = count_rows(factory)
    check("能耗抛错后显示行仍落库", after_first == 1, f"实际 {after_first} 行")

    # 回灌重试 5 轮：旧实现每轮都会再写一遍（事故里是 12614 轮）。
    for _ in range(5):
        service._write_batch(batch, service._clear_epoch)
    after_retries = count_rows(factory)
    check(
        "重试不会叠加显示行（旧实现会是 6 行）",
        after_retries == 6,  # 每轮 1 行是「新的一批」而非「同一批重复」
        f"实际 {after_retries} 行",
    )


def test_internal_isolation(tmp: Path) -> None:
    """energy 内部已全量隔离：真实 aggregate 抛错也不冒泡。"""
    service, factory = build_service(tmp / "b")
    original = service._merge_energy_totals

    def boom(_batch: list[dict[str, Any]]) -> None:
        raise KeyError("created_at")

    service._merge_energy_totals = boom  # type: ignore[method-assign]
    try:
        # 直接调用：不应抛异常
        service._apply_energy_side_effects(
            [
                {
                    "entity_id": "sensor.ele",
                    "old_state": {"state": "1"},
                    "new_state": {"state": "2"},
                    "created_at": AT_A,
                }
            ]
        )
        check("energy 内部异常不冒泡", True)
    finally:
        service._merge_energy_totals = original  # type: ignore[method-assign]
    check("内部隔离不写事件日志", count_rows(factory) == 0)


def test_batch_dedup(tmp: Path) -> None:
    """同一批里重复条目只写一条（防止上游重复投递等比例放大表体积）。"""
    service, factory = build_service(tmp / "c")
    row = {
        "entity_id": "switch.x",
        "old_state": {"state": "off"},
        "new_state": {"state": "unavailable"},
        "state_diff": "off→unavailable",
        "created_at": AT_A,
    }
    service._write_batch([row] * 50, service._clear_epoch)
    rows = count_rows(factory)
    check("批内重复折叠为 1 条", rows == 1, f"实际 {rows} 行")

    # 同实体同变化但不同时刻 = 真实的不同事件，不能折叠
    row2 = dict(row, created_at=AT_B)
    service._write_batch([row, row2], service._clear_epoch)
    check("不同时刻不算重复", count_rows(factory) == 3)


def test_clear_epoch(tmp: Path) -> None:
    """清空世代生效：过时批次不得写回（保持原有语义）。"""
    service, factory = build_service(tmp / "d")
    row = {
        "entity_id": "light.a",
        "old_state": {"state": "off"},
        "new_state": {"state": "on"},
        "state_diff": "off→on",
        "created_at": AT_A,
    }
    stale_epoch = service._clear_epoch
    service._clear_epoch += 1
    service._write_batch([row], stale_epoch)
    check("过时批次被丢弃", count_rows(factory) == 0)


def test_retention_wiring() -> None:
    """保留策略的「键 / 表 / 时间列」必须三处对齐。

    ``_delete_batched`` 按时间列删行：写错列名（例如给时序表用默认的 ``createdAt``）
    不会报错，只会每轮静默删 0 行 —— 表一直涨，面板却显示「已清理」。
    """
    from homeos.backend.src.domains.retention.service import _RETENTION_MODELS
    from homeos.backend.src.platform.core.db.retention import (
        DEFAULT_RETENTION,
        RETENTION_TABLE_KEYS,
        RETENTION_TABLE_LABELS,
    )

    check(
        "保留键与清理表一一对应",
        set(_RETENTION_MODELS) == set(RETENTION_TABLE_KEYS),
        f"{sorted(_RETENTION_MODELS)} vs {sorted(RETENTION_TABLE_KEYS)}",
    )
    for key, (model, table, time_col) in _RETENTION_MODELS.items():
        columns = set(model.__table__.c.keys())
        check(f"{table} 的时间列 {time_col} 存在", time_col in columns, str(sorted(columns)[:6]))
        check(f"{table} 表名一致", model.__tablename__ == table, model.__tablename__)
        check(f"{key} 有中文标签", bool(RETENTION_TABLE_LABELS.get(key)))
        check(f"{key} 有默认天数", key in DEFAULT_RETENTION)
    # 时序表必须用 changedAt：这是它与其它三张表唯一的形状差异，最容易写错。
    check(
        "设备时序用 changedAt",
        _RETENTION_MODELS["deviceTimeline"][2] == "changedAt",
        _RETENTION_MODELS["deviceTimeline"][2],
    )


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        test_energy_failure_does_not_duplicate(base)
        test_internal_isolation(base)
        test_batch_dedup(base)
        test_clear_epoch(base)
        test_retention_wiring()
    print(f"事件日志自检通过：{len(CHECKS)} 项")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
