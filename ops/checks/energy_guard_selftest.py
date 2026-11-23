#!/usr/bin/env python3
"""用能监测自检：日用量异常 / 月度预算 / 预付费余额。

三条硬边界都在这里钉死：
- **基线不足不报**（新装机的头几天没有「日均」，报异常只会让用户关掉功能）；
- **配置为 0 时不做预算告警**（0 = 未设置，而不是「预算为零元」）；
- **余额只在跌破时提醒一次**（每小时重复「余额仍然不足」没有信息量）。
"""

from __future__ import annotations

import asyncio
import tempfile
from datetime import UTC, datetime, timedelta
from pathlib import Path

from _selftest_support import (
    FakeBus,
    FakeCooldown,
    FakeSectionConfig,
    FakeStore,
    check,
    ensure_repo_on_path,
    report,
)

ensure_repo_on_path()

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from homeos.backend.src.domains.energy.monitor import (
    ENERGY_ANOMALY_EVENT,
    ENERGY_BALANCE_EVENT,
    ENERGY_BUDGET_EVENT,
    EnergyMonitor,
    describe_energy_config,
)
from homeos.backend.src.platform.core.db import models  # noqa: F401
from homeos.backend.src.platform.core.db.database import Base
from homeos.backend.src.platform.core.db.models import EnergyUsageDaily

MONITOR_ID = "sensor.ele_main"


class FakeDatabase:
    def __init__(self, session_factory) -> None:
        self.session_factory = session_factory


def build_db(tmp: Path):
    engine = create_engine(f"sqlite:///{tmp / 'energy.db'}", future=True)
    Base.metadata.create_all(engine)
    return FakeDatabase(sessionmaker(bind=engine, expire_on_commit=False))


def seed_days(db, values: dict[str, float]):
    with db.session_factory() as session:
        for day, value in values.items():
            session.add(EnergyUsageDaily(entity_id=MONITOR_ID, day=day, kwh=value, sample_count=1))
        session.commit()


def build(db, energy_cfg, entities=None, cooldown=None):
    bus = FakeBus()
    monitor = EnergyMonitor(
        database=db,
        state_store=FakeStore(entities or {}),
        app_config=FakeSectionConfig("energy", energy_cfg),
        event_bus=bus,
        cooldown=cooldown or FakeCooldown(),
        primary_entities=lambda: {MONITOR_ID},
    )
    return monitor, bus


def day_key(offset_days: int) -> str:
    return (datetime.now(UTC).date() - timedelta(days=offset_days)).isoformat()


def test_anomaly_requires_baseline() -> None:
    with tempfile.TemporaryDirectory() as raw:
        db = build_db(Path(raw))
        # 只有 2 天历史，learningPeriodDays=7 → 基线不足
        seed_days(db, {day_key(1): 5.0, day_key(2): 5.0, day_key(0): 50.0})
        monitor, bus = build(db, {"learningPeriodDays": 7, "anomalyRatio": 2.0})
        asyncio.run(monitor.tick())
        check("基线天数不足不报异常", not bus.events, str(bus.events))


def test_anomaly_fires_with_baseline() -> None:
    with tempfile.TemporaryDirectory() as raw:
        db = build_db(Path(raw))
        seed_days(db, {**{day_key(i): 5.0 for i in range(1, 8)}, day_key(0): 50.0})
        monitor, bus = build(db, {"learningPeriodDays": 7, "anomalyRatio": 2.0})
        asyncio.run(monitor.tick())
        payload = next((payload for name, payload in bus.events if name == ENERGY_ANOMALY_EVENT), None)
        check("今日 10 倍于基线时报异常", payload is not None, str(bus.events))
        check("异常事件带比值", (payload or {}).get("ratio") == 10.0, str(payload))
        # 冷却内不重复
        bus.events.clear()
        asyncio.run(monitor.tick())
        check("冷却内不重复", not bus.events, str(bus.events))


def test_no_budget_no_alert() -> None:
    with tempfile.TemporaryDirectory() as raw:
        db = build_db(Path(raw))
        seed_days(db, {day_key(0): 500.0})
        monitor, bus = build(db, {"monthlyBudgetKwh": 0, "budgetWarnRatio": 1.0})
        asyncio.run(monitor.tick())
        names = [name for name, _payload in bus.events]
        check("未设置预算时不发预算告警", ENERGY_BUDGET_EVENT not in names, str(names))


def test_budget_fires() -> None:
    with tempfile.TemporaryDirectory() as raw:
        db = build_db(Path(raw))
        today = datetime.now(UTC).date()
        # 本月已有 150 kWh，预算 100 → 超预算比例触发
        seed_days(db, {today.replace(day=1).isoformat(): 150.0})
        monitor, bus = build(db, {"monthlyBudgetKwh": 100, "budgetWarnRatio": 1.0})
        asyncio.run(monitor.tick())
        payload = next((payload for name, payload in bus.events if name == ENERGY_BUDGET_EVENT), None)
        check("超过预算时报", payload is not None, str(bus.events))
        check("带已用量", (payload or {}).get("used") == 150.0, str(payload))


def test_balance_fires_once() -> None:
    with tempfile.TemporaryDirectory() as raw:
        db = build_db(Path(raw))
        entities = {
            "sensor.balance": {
                "entity_id": "sensor.balance",
                "state": "8.5",
                "attributes": {"friendly_name": "电费余额"},
            }
        }
        monitor, bus = build(
            db,
            {"balanceEntityId": "sensor.balance", "balanceLowThreshold": 20},
            entities=entities,
        )
        asyncio.run(monitor.tick())
        names = [name for name, _payload in bus.events]
        check("余额不足告警", ENERGY_BALANCE_EVENT in names, str(names))
        bus.events.clear()
        asyncio.run(monitor.tick())
        check("同一低余额不重复提醒", not bus.events, str(bus.events))

        # 充值回升 → 再次跌破应重新提醒
        entities["sensor.balance"]["state"] = "100"
        asyncio.run(monitor.tick())
        entities["sensor.balance"]["state"] = "5"
        asyncio.run(monitor.tick())
        check("回升后再次跌破会重新提醒", any(name == ENERGY_BALANCE_EVENT for name, _ in bus.events))


def test_config_normalization() -> None:
    cfg = describe_energy_config({"monthlyBudgetKwh": "-5", "budgetWarnRatio": "0.1", "anomalyRatio": "0.1"})
    check("负预算按未设置处理", cfg["budgetKwh"] == 0.0, str(cfg))
    check("预算比例下限 0.5", cfg["budgetWarnRatio"] == 0.5, str(cfg))
    check("异常倍数下限 1.2", cfg["anomalyRatio"] == 1.2, str(cfg))


def main() -> int:
    test_anomaly_requires_baseline()
    test_anomaly_fires_with_baseline()
    test_no_budget_no_alert()
    test_budget_fires()
    test_balance_fires_once()
    test_config_normalization()
    report("用能监测")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
