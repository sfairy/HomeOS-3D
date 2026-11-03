"""能耗实体识别与历史回填的回归测试。

锁住两件曾经静默出错的事：
- 只有 ``device_class=energy`` / 单位 kWh 的电量传感器（名字里没有 energy/kwh）必须入库；
- 历史回填按自然日差分、只增不减地合并进日/月聚合，重复执行不能翻倍。
"""

from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest import mock

from sqlalchemy import select
from src.domains.logs.energy_backfill import (
    EnergyBackfillService,
    discover_energy_entities,
    split_history_daily,
    split_statistics_daily,
)
from src.domains.logs.event_log import EventLogService
from src.domains.logs.event_log_tier import (
    is_energy_meter_state,
    resolve_event_log_tier,
    serialize_event_log_states,
)
from src.platform.core.db.database import Base, Database
from src.platform.core.db.models import EnergyCandidateEntity, EnergyUsageDaily, EnergyUsageMonthly, EventLog

ENERGY_ATTRS = {"device_class": "energy", "unit_of_measurement": "kWh"}


def _state(value: str, attributes: dict | None = None, changed: str | None = None) -> dict:
    state = {"state": value, "attributes": attributes if attributes is not None else dict(ENERGY_ATTRS)}
    if changed:
        state["last_changed"] = changed
        state["last_updated"] = changed
    return state


class EnergyEntityRecognitionTest(unittest.TestCase):
    """名字不含关键字、只有 device_class 的电量表也要被识别为计量实体。"""

    def test_device_class_energy_sensor_without_name_hint_is_logged(self) -> None:
        tier = resolve_event_log_tier(
            "sensor.zong_dian_liang",
            old_state=_state("100"),
            new_state=_state("101"),
        )
        self.assertEqual(tier, "compact")
        # 没有 attributes 时仍按旧口径跳过（避免把未知 sensor 全量写库）。
        self.assertEqual(resolve_event_log_tier("sensor.zong_dian_liang"), "skip")

    def test_power_sensor_is_still_skipped(self) -> None:
        power_attrs = {"device_class": "power", "unit_of_measurement": "W"}
        self.assertEqual(
            resolve_event_log_tier(
                "sensor.zong_gong_lv",
                old_state={"state": "10", "attributes": power_attrs},
                new_state={"state": "12", "attributes": power_attrs},
            ),
            "skip",
        )

    def test_wh_unit_counts_as_energy_meter(self) -> None:
        wh_attrs = {"unit_of_measurement": "Wh"}
        self.assertEqual(
            resolve_event_log_tier(
                "sensor.dian_biao",
                old_state={"state": "1000", "attributes": wh_attrs},
                new_state={"state": "1200", "attributes": wh_attrs},
            ),
            "compact",
        )

    def test_compact_serialization_keeps_meter_unit(self) -> None:
        event = {
            "entity_id": "sensor.zong_dian_liang",
            "old_state": _state("100"),
            "new_state": _state("102.5"),
        }
        old_state, new_state = serialize_event_log_states(event, "compact")
        self.assertEqual(old_state["state"], "100")
        self.assertEqual(new_state["state"], "102.5")
        self.assertEqual(new_state["attributes"]["unit_of_measurement"], "kWh")

    def test_name_hint_still_works_as_fallback(self) -> None:
        self.assertTrue(is_energy_meter_state("sensor.house_energy", {"state": "1"}))
        self.assertTrue(is_energy_meter_state("sensor.dian_biao", {"state": "1"}, _state("2")))
        self.assertFalse(is_energy_meter_state("light.kitchen", _state("2")))


class EnergyDiscoveryTest(unittest.TestCase):
    def test_discovery_prefers_attributes(self) -> None:
        found = discover_energy_entities(
            [
                {"entity_id": "sensor.zong_dian_liang", "attributes": dict(ENERGY_ATTRS)},
                {
                    "entity_id": "sensor.total_consumption",
                    "attributes": {"device_class": "energy", "unit_of_measurement": "Wh"},
                },
                {
                    "entity_id": "sensor.zong_gong_lv",
                    "attributes": {"device_class": "power", "unit_of_measurement": "W"},
                },
                {"entity_id": "light.kitchen", "attributes": {"friendly_name": "灯"}},
                {"entity_id": "sensor.house_energy", "attributes": {}},
            ]
        )
        self.assertIn("sensor.zong_dian_liang", found)
        self.assertIn("sensor.total_consumption", found)
        self.assertIn("sensor.house_energy", found)
        self.assertNotIn("sensor.zong_gong_lv", found)
        self.assertNotIn("light.kitchen", found)


class EnergyHistorySplitTest(unittest.TestCase):
    def test_statistics_buckets_are_bucketed_in_family_timezone(self) -> None:
        self.assertEqual(split_statistics_daily([], "Asia/Shanghai"), {})
        per_day = split_statistics_daily(
            [
                # UTC 15:00 = 东八区 23:00，仍属 11-02
                {"start": "2026-11-02T15:00:00+00:00", "change": 1.0},
                # UTC 23:00 = 东八区次日 07:00，归 11-03
                {"start": "2026-11-02T23:00:00+00:00", "change": 0.5},
                {"start": "2026-11-03T01:00:00+00:00", "change": None},
            ],
            "Asia/Shanghai",
        )
        self.assertAlmostEqual(per_day["2026-11-02"], 1.0)
        self.assertAlmostEqual(per_day["2026-11-03"], 0.5)

    def test_statistics_respect_since_day_and_unit(self) -> None:
        per_day = split_statistics_daily(
            [
                {"start": "2026-11-01T01:00:00+00:00", "change": 500},
                {"start": "2026-11-02T01:00:00+00:00", "change": 2000},
            ],
            "Asia/Shanghai",
            since_day="2026-11-02",
            attributes={"unit_of_measurement": "Wh"},
        )
        self.assertEqual(sorted(per_day), ["2026-11-02"])
        self.assertAlmostEqual(per_day["2026-11-02"], 2.0)

    def test_history_deltas_are_daily_and_reset_aware(self) -> None:
        per_day = split_history_daily(
            [
                {"state": "100", "last_updated": "2026-11-01T15:00:00+00:00"},
                {"state": "110", "last_updated": "2026-11-02T15:00:00+00:00"},
                {"state": "112", "last_updated": "2026-11-02T15:30:00+00:00"},
                # 表底重置：新读数小于旧读数时按重置后累积量计入
                {"state": "5", "last_updated": "2026-11-03T01:00:00+00:00"},
                {"state": "8", "last_updated": "2026-11-03T02:00:00+00:00"},
            ],
            "Asia/Shanghai",
        )
        self.assertAlmostEqual(per_day["2026-11-02"], 12.0)
        self.assertAlmostEqual(per_day["2026-11-03"], 5.0 + 3.0)


class EnergyBackfillStorageTest(unittest.TestCase):
    """日/月聚合的合并口径：只增不减、月总量按当月日行求和。"""

    database: Database  # pyright: ignore[reportUninitializedInstanceVariable]
    _tmp: tempfile.TemporaryDirectory[str]  # pyright: ignore[reportUninitializedInstanceVariable]
    service: EventLogService  # pyright: ignore[reportUninitializedInstanceVariable]

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        path = Path(self._tmp.name) / "energy.db"
        self.database = Database(f"sqlite+pysqlite:///{path}")
        Base.metadata.create_all(self.database.engine)
        self.service = EventLogService(self.database)

    def tearDown(self) -> None:
        self.database.dispose()
        self._tmp.cleanup()

    def _daily(self) -> dict[str, float]:
        with self.database.session_factory() as session:
            return {
                row.day: row.kwh
                for row in session.scalars(
                    select(EnergyUsageDaily).where(EnergyUsageDaily.entity_id == "sensor.zong_dian_liang")
                )
            }

    def _monthly(self) -> dict[str, float]:
        with self.database.session_factory() as session:
            return {
                row.month: row.kwh
                for row in session.scalars(
                    select(EnergyUsageMonthly).where(EnergyUsageMonthly.entity_id == "sensor.zong_dian_liang")
                )
            }

    def test_backfill_never_shrinks_and_recomputes_month(self) -> None:
        self.service.apply_energy_backfill({"sensor.zong_dian_liang": {"2026-11-01": 1.5, "2026-11-02": 2.0}})
        self.service.apply_energy_backfill(
            {"sensor.zong_dian_liang": {"2026-11-01": 1.0, "2026-11-02": 3.0, "2026-11-03": 0.5}}
        )
        daily = self._daily()
        self.assertAlmostEqual(daily["2026-11-01"], 1.5)
        self.assertAlmostEqual(daily["2026-11-02"], 3.0)
        self.assertAlmostEqual(daily["2026-11-03"], 0.5)
        self.assertAlmostEqual(self._monthly()["2026-11"], 5.0)
        with self.database.session_factory() as session:
            candidates = set(
                session.scalars(
                    select(EnergyCandidateEntity.entity_id).where(
                        EnergyCandidateEntity.entity_id == "sensor.zong_dian_liang"
                    )
                )
            )
        self.assertEqual(candidates, {"sensor.zong_dian_liang"})

    def test_live_event_for_device_class_only_meter_creates_daily_row(self) -> None:
        self.service.handle_state_change_batch(
            [
                {
                    "entity_id": "sensor.zong_dian_liang",
                    "old_state": _state("100", changed="2026-11-03T01:00:00+00:00"),
                    "new_state": _state("102.5", changed="2026-11-03T01:05:00+00:00"),
                }
            ]
        )
        asyncio.run(self.service.flush())
        self.assertAlmostEqual(self._daily()["2026-11-03"], 2.5)

    def test_power_sensor_event_does_not_produce_energy(self) -> None:
        power_attrs = {"device_class": "power", "unit_of_measurement": "W"}
        self.service.handle_state_change_batch(
            [
                {
                    "entity_id": "sensor.zong_gong_lv",
                    "old_state": _state("10", power_attrs, "2026-11-03T01:00:00+00:00"),
                    "new_state": _state("900", power_attrs, "2026-11-03T01:05:00+00:00"),
                }
            ]
        )
        asyncio.run(self.service.flush())
        self.assertEqual(self._daily(), {})

    def test_report_keeps_wh_meter_in_kwh_scale(self) -> None:
        """Wh 电表在事件日志里是 Wh 读数，报表必须折算成 kWh，否则图表放大 1000 倍。"""
        attrs_wh = {"device_class": "energy", "unit_of_measurement": "Wh"}
        with self.database.session_factory() as session:
            for value, created_at in (("1000", datetime(2026, 11, 1, 10, 0)), ("3000", datetime(2026, 11, 2, 10, 0))):
                session.add(
                    EventLog(
                        entity_id="sensor.zong_dian_liang",
                        domain="sensor",
                        old_state="0",
                        new_state=json.dumps({"state": value, "attributes": attrs_wh}),
                        state_diff=f"0→{value}",
                        created_at=created_at,
                    )
                )
            session.commit()
            rows = self.service._read_energy_deltas(
                session,
                {
                    "start": datetime(2026, 11, 1, tzinfo=UTC),
                    "end": datetime(2026, 11, 4, tzinfo=UTC),
                },
                ["sensor.zong_dian_liang"],
            )
        per_day = {row["date"]: row["delta"] for row in rows}
        self.assertAlmostEqual(per_day["2026-11-02"], 2.0)


class _FakeWebSocket:
    async def close(self) -> None:
        return None


class _FakeClient:
    """只实现统计读取需要的那两条接口。"""

    def __init__(self, buckets: dict[str, list[dict]]) -> None:
        self._buckets = buckets
        self.commands: list[tuple[str, dict]] = []

    async def connect_websocket(self) -> _FakeWebSocket:
        return _FakeWebSocket()

    async def command(self, _ws: object, _message_id: int, command_type: str, **payload: object) -> object:
        self.commands.append((command_type, payload))
        return self._buckets


class _FakeHa:
    def __init__(self, buckets: dict[str, list[dict]], history: dict[str, list[dict]] | None = None) -> None:
        self.client = _FakeClient(buckets)
        self._history = history or {}
        self.history_calls: list[str] = []

    def active_connection(self) -> object:
        return object()

    async def client_for(self, _connection: object) -> _FakeClient:
        return self.client

    async def fetch_history(self, _connection: object, entity_id: str, _start: str, _hours: int) -> list[dict]:
        self.history_calls.append(entity_id)
        return self._history.get(entity_id, [])


class _FakeEventLog:
    def __init__(self) -> None:
        self.written: dict[str, dict[str, float]] = {}

    def ops_timezone_name(self) -> str:
        return "Asia/Shanghai"

    def apply_energy_backfill(self, totals: dict[str, dict[str, float]]) -> dict[str, int]:
        self.written = totals
        return {"daily": len(totals), "monthly": len(totals), "entities": len(totals)}


class _FixedDatetime(datetime):
    """把「现在」钉在 2026-11-02T01:00Z（东八区 11-02 09:00），让自然日断言可复现。"""

    @classmethod
    def now(cls, tz=None):
        return datetime(2026, 11, 2, 1, 0, tzinfo=UTC).astimezone(tz) if tz else datetime(2026, 11, 2, 1, 0, tzinfo=UTC)


class EnergyBackfillServiceTest(unittest.TestCase):
    """统计优先、没有统计的实体回退历史差分，两条路径都要落到回填结果里。"""

    def test_statistics_first_and_history_fallback(self) -> None:
        day_key = "2026-11-02"
        ha = _FakeHa(
            {"sensor.zong_dian_liang": [{"start": "2026-11-02T00:00:00+00:00", "change": 3.0}]},
            history={
                "sensor.dian_biao": [
                    {"state": "100", "last_updated": "2026-11-01T22:00:00+00:00"},
                    {"state": "104.5", "last_updated": "2026-11-02T00:30:00+00:00"},
                ]
            },
        )
        event_log = _FakeEventLog()
        service = EnergyBackfillService(event_log=event_log, ha=ha)
        with mock.patch("src.domains.logs.energy_backfill.datetime", _FixedDatetime):
            asyncio.run(
                service._run(
                    [
                        {"entity_id": "sensor.zong_dian_liang", "attributes": dict(ENERGY_ATTRS)},
                        {"entity_id": "sensor.dian_biao", "attributes": dict(ENERGY_ATTRS)},
                    ]
                )
            )
        self.assertIn("sensor.zong_dian_liang", event_log.written)
        self.assertAlmostEqual(event_log.written["sensor.zong_dian_liang"][day_key], 3.0)
        # 没有统计的实体走历史差分
        self.assertIn("sensor.dian_biao", event_log.written)
        self.assertAlmostEqual(event_log.written["sensor.dian_biao"][day_key], 4.5)
        self.assertEqual(ha.history_calls, ["sensor.dian_biao"])
        self.assertEqual(ha.client.commands[0][0], "recorder/statistics_during_period")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
