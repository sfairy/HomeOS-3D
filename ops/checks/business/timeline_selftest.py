#!/usr/bin/env python3
"""设备时序自检：钉住三条「静默失真」的回归（不需要 pytest）。

1. **批内连续变化必须结算上一条**（P3）
   旧实现逐行「查未结束行 → add → flush」，而会话工厂是 ``autoflush=False``：
   不 flush 时下一条看不到刚 add 的行，于是同实体连续变化永远留下前一条
   ``endedAt IS NULL``（实测生产库 929 条、单实体最多 70 条）。现在改成「一次查询 +
   内存链式结算 + 一次 add_all」，本用例同时钉住「批内三条同实体只留一条未结束」。

2. **数值节流不能吞掉真实突变**（P21）
   旧实现只看「距上次落库的时间间隔」，300 秒内 0 → 3000W 的功率跳变直接丢弃；
   排查「为什么跳闸 / 为什么全功率」时恰好缺那一条。

3. **区域归因失败要有信号**（P15）
   索引未就绪时 ``areaId`` / ``peerSnapshot`` 整列写空却不报错 —— 这是「因果复盘」
   在真实库里 100% 空白的根因。

用法：
    node ops/lib/py.mjs ops/checks/timeline_selftest.py
"""

from __future__ import annotations

import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from homeos.backend.src.domains.agent.memory.timeline import AgentTimelineService, _numeric_jump
from homeos.backend.src.platform.core.db import models  # noqa: F401
from homeos.backend.src.platform.core.db.models import AgentContextTimeline
from homeos.backend.src.platform.core.db.schema import create_all_schemas

CHECKS: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if not condition:
        raise AssertionError(f"{name} 失败{('：' + detail) if detail else ''}")
    CHECKS.append(name)


def build(tmp: Path) -> tuple[AgentTimelineService, Any]:
    tmp.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        f"sqlite+pysqlite:///{tmp / 'timeline.db'}",
        connect_args={"check_same_thread": False},
    )
    create_all_schemas(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    # state_store / enrichment 都不给：本自检只关心写入结算与节流。
    return AgentTimelineService(factory, None), factory


def row(entity: str, old: str, new: str, at: datetime) -> dict[str, Any]:
    """构造一条 ``_prepare`` 已经归一过的行（``_state_of`` 已把状态压成文本）。"""
    return {
        "entity_id": entity,
        "domain": entity.split(".", 1)[0],
        "area_id": "",
        "area_name": "",
        "old_state": old,
        "new_state": new,
        "changed_at": at,
        "trigger_source": "EXTERNAL_DEVICE",
        "actor": "",
        "context": {},
        "peer_snapshot": {},
    }


def test_batch_closes_previous_row(tmp: Path) -> None:
    service, factory = build(tmp)
    base = datetime(2026, 11, 22, 10, 0, 0)
    service._write_many_sync(
        [
            row("light.a", "off", "on", base),
            row("light.a", "on", "off", base + timedelta(seconds=30)),
            row("light.a", "off", "on", base + timedelta(seconds=90)),
        ]
    )
    with factory() as session:
        rows = list(session.execute(select(AgentContextTimeline).order_by(AgentContextTimeline.changed_at)).scalars())
    check("三条都已落库", len(rows) == 3, str(len(rows)))
    open_rows = [item for item in rows if item.ended_at is None]
    check("只有最新一条保持未结束", len(open_rows) == 1, str(len(open_rows)))
    check("最新一条就是最后写入的那条", open_rows[0].new_state == "on", str(open_rows[0].new_state))
    check("第一条被下一条结算", rows[0].ended_at == base + timedelta(seconds=30), str(rows[0].ended_at))
    check("第一条时长 30 秒", rows[0].duration_seconds == 30, str(rows[0].duration_seconds))
    check("第二条时长 60 秒", rows[1].duration_seconds == 60, str(rows[1].duration_seconds))
    check("最新一条没有时长", rows[2].duration_seconds is None, str(rows[2].duration_seconds))


def test_batch_keeps_entities_independent(tmp: Path) -> None:
    service, factory = build(tmp)
    base = datetime(2026, 11, 22, 11, 0, 0)
    service._write_many_sync(
        [
            row("light.a", "off", "on", base),
            row("light.b", "off", "on", base),
        ]
    )
    with factory() as session:
        open_count = len(
            list(session.execute(select(AgentContextTimeline).where(AgentContextTimeline.ended_at.is_(None))).scalars())
        )
    check("不同实体各留一条未结束", open_count == 2, str(open_count))


def test_numeric_jump() -> None:
    check("0 → 3000 视为突变", _numeric_jump("0", "3000"))
    check("100 → 102 视为抖动", not _numeric_jump("100", "102"))
    check("100 → 150 超过 10% 视为突变", _numeric_jump("100", "150"))
    check("跨零视为突变", _numeric_jump("-5", "5"))
    check("非数值不算突变", not _numeric_jump("on", "off"))


def test_throttle_keeps_jumps(tmp: Path) -> None:
    service, _factory = build(tmp)
    first = {"entity_id": "sensor.power", "old_state": "100", "new_state": "102"}
    check("首次记录不被节流", not service._should_skip_numeric(dict(first)))
    jitter = {"entity_id": "sensor.power", "old_state": "102", "new_state": "103"}
    check("小幅抖动被节流", service._should_skip_numeric(dict(jitter)))
    jump = {"entity_id": "sensor.power", "old_state": "0", "new_state": "3000"}
    check("真实突变不被节流", not service._should_skip_numeric(dict(jump)))
    clock = {"entity_id": "sensor.time", "old_state": "10:00", "new_state": "10:01"}
    check("纯时间刻度永远丢弃", service._should_skip_numeric(dict(clock)))


def test_context_is_slimmed(tmp: Path) -> None:
    """context 只保留归因字段：HA 的逐事件唯一 `id` 不落库。

    实测 227 万行里 context 平均 72 字节、去重后仍是 227 万条 —— 几乎全是那个从没被
    读过的 ULID。写入侧收敛后新行只存 user_id / parent_id（都为空时就是 {}）。
    """
    from homeos.backend.src.domains.agent.memory.timeline import _slim_context

    check("context 只留 id 时收敛为空", _slim_context({"id": "01ABC", "parent_id": None, "user_id": None}) == {})
    check(
        "归因字段保留",
        _slim_context({"id": "01ABC", "parent_id": "p1", "user_id": "u1"}) == {"user_id": "u1", "parent_id": "p1"},
    )
    check("非 dict 收敛为空", _slim_context(None) == {})
    check("空串归因字段被丢弃", _slim_context({"user_id": "", "parent_id": ""}) == {})


def test_area_failure_is_counted(tmp: Path) -> None:
    service, _factory = build(tmp)

    class BrokenEnrichment:
        is_ready = False

        def enrich_entity_sync(self, entity):
            raise RuntimeError("index not loaded")

    class Store:
        def get(self, _entity_id):
            return {"entity_id": "light.c"}

    service._enrichment = BrokenEnrichment()
    service._state_store = Store()
    area = service._area_of("light.c", {})
    check("归因失败返回空", area == ("", ""), str(area))
    check("归因失败被计数（否则整列空掉也没人知道）", service._area_warn_count == 1, str(service._area_warn_count))


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        test_batch_closes_previous_row(base / "a")
        test_batch_keeps_entities_independent(base / "b")
        test_numeric_jump()
        test_throttle_keeps_jumps(base / "c")
        test_context_is_slimmed(base / "e")
        test_area_failure_is_counted(base / "d")
    print(f"设备时序自检通过：{len(CHECKS)} 项")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
