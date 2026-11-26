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

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from datetime import UTC, datetime, timedelta

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from homeos.backend.src.db_models import create_all_schemas
from homeos.backend.src.domains.logs import event_log as event_log_module
from homeos.backend.src.domains.logs import event_log_report as report_module
from homeos.backend.src.domains.logs.event_log import EventLogService
from homeos.backend.src.platform.core.db import models  # noqa: F401
from homeos.backend.src.platform.core.db.models import EventLog

# 时间点必须**相对当前时刻**算：查询窗口上限是保留天数（默认 7 天），
# 写死某一天会让这条自检在几天后无声变成「窗口内 0 条」—— 2026-11-18 的常量
# 就是这样在 11-26 起持续失败（产品代码没问题，是夹具过期）。
_AT_BASE = datetime.now(UTC).replace(minute=2, second=38, microsecond=72132)
AT_A = _AT_BASE - timedelta(hours=2)
AT_B = AT_A + timedelta(seconds=1)

CHECKS: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if not condition:
        raise AssertionError(f"{name} 失败{('：' + detail) if detail else ''}")
    CHECKS.append(name)


class FakeDatabase:
    def __init__(self, factory: Any) -> None:
        self.session_factory = factory


def build_factory(tmp: Path) -> Any:
    tmp.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        f"sqlite+pysqlite:///{tmp / 'events.db'}",
        connect_args={"check_same_thread": False},
    )
    create_all_schemas(engine)
    return sessionmaker(bind=engine)


def build_service(tmp: Path) -> tuple[EventLogService, Any]:
    factory = build_factory(tmp)
    service = EventLogService(FakeDatabase(factory))
    return service, factory


def test_constructor_matches_lifespan() -> None:
    """构造签名必须与 ``bootstrap/lifespan`` 传的关键字一致。

    这条断言存在的理由：``lifespan`` 里传了 ``energy_circuit_entities``，而
    ``EventLogService.__init__`` 曾漏掉该参数 —— 静态门禁与其余自检全都通过，
    只有**真正启动应用**时才会炸 ``TypeError: unexpected keyword argument``，
    开发服务器因此静默退出了 6 小时（浏览器看到的是 vite 代理的 503）。
    """
    with tempfile.TemporaryDirectory() as raw:
        factory = build_factory(Path(raw))
        constructed = EventLogService(
            FakeDatabase(factory),
            # 与 lifespan 传的是同一种「零参数回调」：这里直接给可调用对象即可。
            energy_primary_entities=set,
            energy_bindings=lambda: {"primary": "", "scope": "total", "day": "", "month": ""},
            energy_circuit_entities=set,
        )
    check("按 lifespan 的关键字构造 EventLogService", constructed is not None)
    check(
        "分回路提供方被接受并落地",
        constructed._resolve_energy_circuit_entities() == set(),
    )


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

    # 回灌重试 5 轮：同一 (实体, 时刻, 变化) 现在由**库级唯一索引**挡住，
    # 跨批次重放也只保留 1 行（此前只有批内去重，每轮会再写一遍，事故里是 12614 轮）。
    for _ in range(5):
        service._write_batch(batch, service._clear_epoch)
    after_retries = count_rows(factory)
    check(
        "重试不会叠加显示行（跨批次同一事件只留 1 行）",
        after_retries == 1,
        f"实际 {after_retries} 行",
    )


def test_stats_rollup(tmp: Path) -> None:
    """小时汇总：只统计真正落库的行，且清空时一并清掉。

    报表读汇总表而不是原始行（P14）。这里钉住两条容易出错的语义：

    1. 跨批次重放被唯一索引挡掉后，汇总**不能**跟着翻倍（否则只是把「原始表爆表」
       换成「汇总虚高」）；
    2. 清空事件日志必须同时清空汇总，否则报表继续显示已删除的旧数据。
    """
    service, factory = build_service(tmp / "rollup")
    row = {
        "entity_id": "light.a",
        "old_state": {"state": "off"},
        "new_state": {"state": "on"},
        "state_diff": "off→on",
        "created_at": AT_A,
    }
    service._write_batch([row], service._clear_epoch)
    stats = service.get_stats(24 * 30)
    check("汇总统计到 1 条", stats["total"] == 1, str(stats["total"]))

    # 重放 3 次：唯一索引挡住原始行，汇总也不应变大
    for _ in range(3):
        service._write_batch([row], service._clear_epoch)
    stats = service.get_stats(24 * 30)
    check("重放不放大汇总", stats["total"] == 1, str(stats["total"]))
    check("按域名分组也正确", stats["byDomain"] == {"light": 1}, str(stats["byDomain"]))

    # 清空：原始行与汇总都要归零
    service.clear_all_records()
    stats = service.get_stats(24 * 30)
    check("清空后汇总归零", stats["total"] == 0, str(stats["total"]))
    check("清空后原始行归零", count_rows(factory) == 0)


def test_stats_and_compare_share_rollup(tmp: Path) -> None:
    """``/events/stats`` 与 ``/reports/compare?metric=events`` 读同一张汇总表。

    「现在」必须钉死：周口径的当前周期从本周一 00:00 起算，若用真实时间，周一凌晨跑
    自检会有 3 条事件落到上周，断言偶尔失败（真实踩过：周一 00:05 跑出 4 vs 1）。
    钉死到周三 12:00 UTC，四条事件（间隔 1 小时）全部落在本周内。
    """
    service, _factory = build_service(tmp / "compare")
    frozen = datetime(2026, 11, 18, 12, 0, tzinfo=UTC)
    originals = (event_log_module._report_now, report_module._report_now)
    event_log_module._report_now = lambda _ops: frozen
    report_module._report_now = lambda _ops: frozen
    try:
        batch = [
            {
                "entity_id": "light.c",
                "old_state": {"state": "off"},
                "new_state": {"state": "on"},
                "state_diff": f"off→on{i}",
                "created_at": frozen.replace(tzinfo=None) - timedelta(hours=i),
            }
            for i in range(4)
        ]
        service._write_batch(batch, service._clear_epoch)
        stats = service.get_stats(24 * 30)
        report = service.report_compare({"metric": "events", "granularity": "week"})
    finally:
        event_log_module._report_now, report_module._report_now = originals
    series_total = sum(point["value"] for point in report["series"]["current"])
    check("统计与报表同源", stats["total"] == series_total == 4, f"{stats['total']} vs {series_total}")
    check("报表按实体给出对比行", any(row["key"] == "light.c" for row in report["byEntity"]), str(report["byEntity"]))


def test_full_tier_stores_only_changed_attrs() -> None:
    """``tier=full`` 只存「变化了的受控属性」，不存整份 attributes（P41）。"""
    from homeos.backend.src.domains.logs.event_log_tier import serialize_event_log_states

    event = {
        "entity_id": "light.ke_wei",
        "old_state": {"state": "off", "attributes": {"brightness": 0, "effect_list": ["a", "b"]}},
        "new_state": {"state": "on", "attributes": {"brightness": 180, "effect_list": ["a", "b"]}},
    }
    _old, new = serialize_event_log_states(event, "full")
    check("保留变化后的属性值", new["attributes"] == {"brightness": 180}, str(new["attributes"]))
    check("不存未变化的属性", "effect_list" not in new["attributes"])
    check(
        "不随 attributes 数量增长（未变化字段一律不带）",
        set(new["attributes"]) == {"brightness"},
        str(new["attributes"]),
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

    # 同实体同变化但不同时刻 = 真实的不同事件，不能折叠。
    # （同一条 ``row`` 已在上一批写过，库级唯一索引会忽略它 —— 所以新增的是 1 行。）
    row2 = dict(row, created_at=AT_B)
    service._write_batch([row, row2], service._clear_epoch)
    check("不同时刻不算重复", count_rows(factory) == 2, f"实际 {count_rows(factory)} 行")


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
    test_constructor_matches_lifespan()
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        test_energy_failure_does_not_duplicate(base)
        test_internal_isolation(base)
        test_batch_dedup(base)
        test_stats_rollup(base)
        test_stats_and_compare_share_rollup(base)
        test_full_tier_stores_only_changed_attrs()
        test_clear_epoch(base)
        test_retention_wiring()
    print(f"事件日志自检通过：{len(CHECKS)} 项")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
