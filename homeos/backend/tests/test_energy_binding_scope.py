"""能源绑定角色与统计口径的回归测试。

锁住三件曾经会被静默算错的事：

- **功率不能当电表**：把 W 传感器填进主电表，日/月曲线会变成 0 或负数，保存前必须能识别；
- **口径识别与覆盖**：年/月/日累计的清零周期决定哪一档粒度能直接读表，猜错会让曲线成倍偏小；
- **只统计主电表**：同一块物理表常同时暴露日/月/年累计，叠加各回路表一起聚合会把电重复计费。
"""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from src.domains.client_power.energy_meter import (
    METER_SCOPES,
    classify_energy_entity,
    describe_energy_entity,
    describe_meter_scope,
    max_reading_per_grain,
    normalize_meter_scope,
    scope_supports_direct_grain,
    suggest_meter_scope,
)
from src.domains.logs.event_log import EventLogService
from src.platform.core.db.database import Base, Database
from src.platform.core.db.models import EnergyUsageDaily, EnergyUsageMonthly

ENERGY_ATTRS = {"device_class": "energy", "unit_of_measurement": "kWh"}
POWER_ATTRS = {"device_class": "power", "unit_of_measurement": "W"}


def _state(value: str, attributes: dict, changed: str) -> dict:
    return {"state": value, "attributes": dict(attributes), "last_updated": changed}


class EnergyEntityKindTest(unittest.TestCase):
    def test_cumulative_energy_and_power_are_distinguished(self) -> None:
        self.assertEqual(classify_energy_entity(ENERGY_ATTRS), "energy")
        self.assertEqual(classify_energy_entity(POWER_ATTRS), "power")
        self.assertEqual(classify_energy_entity({"unit_of_measurement": "Wh"}), "energy")
        self.assertEqual(classify_energy_entity(None), "other")

    def test_describe_keeps_only_binding_relevant_fields(self) -> None:
        info = describe_energy_entity({**ENERGY_ATTRS, "friendly_name": "总电量", "icon": "mdi:x"})
        self.assertEqual(info["kind"], "energy")
        self.assertEqual(info["unit"], "kWh")
        self.assertNotIn("friendly_name", info)


class MeterScopeTest(unittest.TestCase):
    def test_unknown_scope_falls_back_to_total(self) -> None:
        self.assertEqual(normalize_meter_scope("weekly"), "total")
        self.assertEqual(normalize_meter_scope(None), "total")
        for scope in METER_SCOPES:
            self.assertEqual(normalize_meter_scope(scope), scope)

    def test_scope_is_suggested_from_entity_text(self) -> None:
        self.assertEqual(suggest_meter_scope("sensor.daily_energy"), "day")
        self.assertEqual(suggest_meter_scope("sensor.monthly_energy"), "month")
        self.assertEqual(suggest_meter_scope("sensor.yearly_energy"), "year")
        self.assertEqual(suggest_meter_scope("sensor.zong_dian_liang_total"), "total")
        # 中文友好名同样要能命中，否则国内家庭的传感器一律退回默认口径
        self.assertEqual(suggest_meter_scope(None, "本月用电量"), "month")
        self.assertEqual(suggest_meter_scope(None, "今日用电"), "day")
        self.assertEqual(suggest_meter_scope("sensor.unknown"), "total")

    def test_direct_grains_follow_reset_period(self) -> None:
        self.assertTrue(scope_supports_direct_grain("day", "day"))
        self.assertFalse(scope_supports_direct_grain("day", "month"))
        self.assertTrue(scope_supports_direct_grain("month", "month"))
        self.assertFalse(scope_supports_direct_grain("total", "year"))
        self.assertEqual(describe_meter_scope("month")["resetLabel"], "每月 1 日清零")

    def test_max_reading_is_authoritative_for_matching_grain(self) -> None:
        """日累计表：当日用量 = 当日最大读数，不受清零时刻是否被观察到影响。"""
        points = [
            (datetime(2026, 11, 2, 1, tzinfo=UTC), 12.0),
            (datetime(2026, 11, 2, 10, tzinfo=UTC), 18.5),
            # 跨零点后只观察到新一天的 3.2（昨天最后那段读数没被采到）
            (datetime(2026, 11, 3, 1, tzinfo=UTC), 3.2),
        ]
        per_day = max_reading_per_grain(points, "day", "Asia/Shanghai")
        self.assertAlmostEqual(per_day["2026-11-02"], 18.5)
        self.assertAlmostEqual(per_day["2026-11-03"], 3.2)

    def test_max_reading_never_used_for_total_scope(self) -> None:
        """终身累计表的读数跨周期累加，取最大值会把整段历史当成一天。"""
        points = [(datetime(2026, 11, 2, 1, tzinfo=UTC), 1000.0)]
        self.assertEqual(max_reading_per_grain(points, "total", "Asia/Shanghai"), {})


class PrimaryMeterAggregationTest(unittest.TestCase):
    """绑定主电表后，只有它能进日/月聚合（日/月/年累计与回路表都不再重复计入）。"""

    database: Database

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        path = Path(self._tmp.name) / "energy.db"
        self.database = Database(f"sqlite+pysqlite:///{path}")
        Base.metadata.create_all(self.database.engine)

    def tearDown(self) -> None:
        self.database.dispose()
        self._tmp.cleanup()

    def _rows(self) -> dict[str, float]:
        with self.database.session_factory() as session:
            return {row.entity_id: row.kwh for row in session.scalars(select(EnergyUsageDaily))}

    def _batch(self) -> list[dict]:
        # 同一块表的三档口径 + 一路回路表，读数各自增长 1 kWh
        return [
            {
                "entity_id": entity_id,
                "old_state": _state("100", ENERGY_ATTRS, "2026-11-03T01:00:00+00:00"),
                "new_state": _state("101", ENERGY_ATTRS, "2026-11-03T02:00:00+00:00"),
            }
            for entity_id in (
                "sensor.zong_dian_liang",
                "sensor.month_dian_liang",
                "sensor.day_dian_liang",
                "sensor.circuit_kitchen",
            )
        ]

    def test_only_bound_meter_contributes_when_configured(self) -> None:
        service = EventLogService(
            self.database,
            energy_primary_entities=lambda: {"sensor.zong_dian_liang"},
        )
        service.handle_state_change_batch(self._batch())
        asyncio.run(service.flush())
        rows = self._rows()
        self.assertEqual(set(rows), {"sensor.zong_dian_liang"})
        self.assertAlmostEqual(rows["sensor.zong_dian_liang"], 1.0)

    def test_unbound_install_keeps_full_discovery(self) -> None:
        service = EventLogService(self.database)
        service.handle_state_change_batch(self._batch())
        asyncio.run(service.flush())
        rows = self._rows()
        self.assertEqual(len(rows), 4)
        self.assertAlmostEqual(sum(rows.values()), 4.0)

    def test_backfill_respects_bound_meter(self) -> None:
        service = EventLogService(
            self.database,
            energy_primary_entities=lambda: {"sensor.zong_dian_liang"},
        )
        service.apply_energy_backfill(
            {
                "sensor.zong_dian_liang": {"2026-11-03": 2.0},
                "sensor.month_dian_liang": {"2026-11-03": 2.0},
            }
        )
        self.assertEqual(set(self._rows()), {"sensor.zong_dian_liang"})


class MeterScopeAuthorityTest(unittest.TestCase):
    """日/月累计表是各自粒度的权威读数，且不能与主表差分叠加。"""

    database: Database

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        path = Path(self._tmp.name) / "energy.db"
        self.database = Database(f"sqlite+pysqlite:///{path}")
        Base.metadata.create_all(self.database.engine)

    def tearDown(self) -> None:
        self.database.dispose()
        self._tmp.cleanup()

    def _service(self, **bindings: str) -> EventLogService:
        payload = {"primary": "sensor.zong", "scope": "total", "day": "", "month": ""}
        payload.update(bindings)
        service = EventLogService(self.database, energy_bindings=lambda: payload)
        service._ops = {**service._ops, "homeTimezone": "Asia/Shanghai"}
        return service

    def _daily(self) -> dict[str, float]:
        with self.database.session_factory() as session:
            return {row.day: row.kwh for row in session.scalars(select(EnergyUsageDaily))}

    def _monthly(self) -> dict[str, float]:
        with self.database.session_factory() as session:
            return {row.month: row.kwh for row in session.scalars(select(EnergyUsageMonthly))}

    def _run(self, service: EventLogService, rows: list[dict]) -> None:
        service.handle_state_change_batch(rows)
        asyncio.run(service.flush())

    def test_day_meter_reading_wins_and_does_not_double_count(self) -> None:
        """日表读数 18.5 与主表增量 1.0 同一天 → 当日用量取 18.5，不是 19.5。"""
        service = self._service(day="sensor.day")
        self._run(
            service,
            [
                {
                    "entity_id": "sensor.zong",
                    "old_state": _state("100", ENERGY_ATTRS, "2026-11-03T01:00:00+00:00"),
                    "new_state": _state("101", ENERGY_ATTRS, "2026-11-03T02:00:00+00:00"),
                },
                {
                    "entity_id": "sensor.day",
                    "old_state": _state("5", ENERGY_ATTRS, "2026-11-03T01:30:00+00:00"),
                    "new_state": _state("18.5", ENERGY_ATTRS, "2026-11-03T02:00:00+00:00"),
                },
            ],
        )
        self.assertAlmostEqual(self._daily()["2026-11-03"], 18.5)

    def test_day_meter_offline_falls_back_to_primary_delta(self) -> None:
        """日表当天没有读数（掉线/未上报）时用主表差分兜底，避免当天为 0。"""
        service = self._service(day="sensor.day")
        self._run(
            service,
            [
                {
                    "entity_id": "sensor.zong",
                    "old_state": _state("100", ENERGY_ATTRS, "2026-11-03T01:00:00+00:00"),
                    "new_state": _state("101.4", ENERGY_ATTRS, "2026-11-03T02:00:00+00:00"),
                }
            ],
        )
        self.assertAlmostEqual(self._daily()["2026-11-03"], 1.4)

    def test_month_meter_reading_is_month_authority(self) -> None:
        """月表读数直接作为月总量；日曲线仍由主表差分提供。"""
        service = self._service(month="sensor.month")
        self._run(
            service,
            [
                {
                    "entity_id": "sensor.zong",
                    "old_state": _state("100", ENERGY_ATTRS, "2026-11-03T01:00:00+00:00"),
                    "new_state": _state("102", ENERGY_ATTRS, "2026-11-03T02:00:00+00:00"),
                },
                {
                    "entity_id": "sensor.month",
                    "old_state": _state("120", ENERGY_ATTRS, "2026-11-03T01:00:00+00:00"),
                    "new_state": _state("155.2", ENERGY_ATTRS, "2026-11-03T02:00:00+00:00"),
                },
            ],
        )
        self.assertAlmostEqual(self._monthly()["2026-11"], 155.2)
        self.assertAlmostEqual(self._daily()["2026-11-03"], 2.0)

    def test_main_meter_with_day_scope_reads_its_own_reading(self) -> None:
        """主表本身就是日累计表时，当日用量取它的最大读数而不是累加增量。"""
        service = self._service(scope="day")
        self._run(
            service,
            [
                {
                    "entity_id": "sensor.zong",
                    "old_state": _state("0.5", ENERGY_ATTRS, "2026-11-03T01:00:00+00:00"),
                    "new_state": _state("9.9", ENERGY_ATTRS, "2026-11-03T02:00:00+00:00"),
                }
            ],
        )
        self.assertAlmostEqual(self._daily()["2026-11-03"], 9.9)


class WizardEnergyStatusTest(unittest.TestCase):
    """向导状态里的「直接读表」结论必须与 energy_meter 的单一真源一致。"""

    def _status(self, energy: dict) -> dict:
        from src.domains.setup.wizard import SetupWizardService

        service = SetupWizardService.__new__(SetupWizardService)
        return service._build_energy_binding_status(energy)

    def test_lifetime_meter_never_claims_year_is_direct(self) -> None:
        status = self._status({"meterEntityId": "sensor.zong", "meterScope": "total"})
        self.assertNotIn("year", status["directGrains"])
        self.assertEqual(status["grains"]["year"]["source"], "derived")

    def test_aux_meters_fill_their_own_grain(self) -> None:
        status = self._status(
            {
                "meterEntityId": "sensor.zong",
                "meterScope": "total",
                "dayMeterEntityId": "sensor.day",
                "monthMeterEntityId": "sensor.month",
            }
        )
        self.assertEqual(status["grains"]["day"]["source"], "aux")
        self.assertEqual(status["grains"]["month"]["source"], "aux")
        self.assertTrue(status["grains"]["month"]["available"])


class EnergyRoleValidationTest(unittest.TestCase):
    """服务端必须自己拦「主表填功率」：向导之外还有设置页 / API / 配置文件三条写入路径。"""

    @staticmethod
    def _errors(touched: dict, merged: dict, attrs: dict[str, dict]) -> list[dict]:
        from src.domains.app_config.validate.energy_roles import energy_role_errors

        return energy_role_errors(touched, merged, attrs.get)

    def test_power_sensor_cannot_be_primary_meter(self) -> None:
        errors = self._errors(
            {"meterEntityId": "sensor.power"},
            {"meterEntityId": "sensor.power"},
            {"sensor.power": POWER_ATTRS},
        )
        self.assertEqual([e["key"] for e in errors], ["meterEntityId"])

    def test_energy_sensor_cannot_be_power_binding(self) -> None:
        errors = self._errors(
            {"mainPowerEntityId": "sensor.kwh"},
            {"mainPowerEntityId": "sensor.kwh"},
            {"sensor.kwh": ENERGY_ATTRS},
        )
        self.assertEqual([e["key"] for e in errors], ["mainPowerEntityId"])

    def test_aux_meter_cannot_duplicate_primary(self) -> None:
        errors = self._errors(
            {"monthMeterEntityId": "sensor.zong"},
            {"meterEntityId": "sensor.zong", "monthMeterEntityId": "sensor.zong"},
            {"sensor.zong": ENERGY_ATTRS},
        )
        self.assertEqual([e["key"] for e in errors], ["monthMeterEntityId"])

    def test_unknown_entity_is_not_treated_as_wrong(self) -> None:
        """实体还没同步到状态仓时放行，避免「查不到」挡住保存。"""
        errors = self._errors(
            {"meterEntityId": "sensor.ghost"},
            {"meterEntityId": "sensor.ghost"},
            {},
        )
        self.assertEqual(errors, [])

    def test_untouched_fields_are_not_checked(self) -> None:
        """存量配置里已有的错误值不该锁死「改电价」这类无关操作。"""
        errors = self._errors(
            {"pricingMode": "fixed"},
            {"meterEntityId": "sensor.power"},
            {"sensor.power": POWER_ATTRS},
        )
        self.assertEqual(errors, [])

    def test_service_raises_field_error_before_persist(self) -> None:
        from src.domains.app_config.service import AppConfigService
        from src.domains.app_config.validate import AppConfigValidationError

        service = AppConfigService.__new__(AppConfigService)
        service._config = {"energy": {"meterEntityId": ""}}
        service._energy_attrs = {"sensor.power": POWER_ATTRS}.get
        with self.assertRaises(AppConfigValidationError) as ctx:
            service._validate_energy_roles({"energy": {"meterEntityId": "sensor.power"}})
        self.assertEqual(ctx.exception.field_errors[0]["key"], "meterEntityId")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
