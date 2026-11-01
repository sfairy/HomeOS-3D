"""环境上下文与农历换算的回归。

锁住四件容易悄悄坏掉的事：

1. 农历年表的锚点（春节、闰月、中秋）—— 表里错一位，模型就会说出错的日期；
2. 城市推断三层兜底（实体名 → 实体 id → 家庭坐标），都不中时用「本地」；
3. 三日预报：只要未来三天、只问一次 HA（TTL 缓存），拉不到就降级不抛异常；
4. 时间铁律必须真的出现在提示里 —— 这是模型不产生日期幻觉的唯一依据。

运行：node ops/lib/py.mjs -m unittest discover -s homeos/backend/tests -t homeos/backend -v
"""

from __future__ import annotations

import sys
import unittest
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.agent.runtime import lunar_calendar
from src.domains.agent.runtime.env_context import HomeEnvironmentContextService

SHANGHAI = ZoneInfo("Asia/Shanghai")


class _Store:
    """``state_store`` 替身：只实现 ``get_all`` / ``get``。"""

    def __init__(self, entities: list[dict]) -> None:
        self._by_id = {str(item["entity_id"]): item for item in entities}

    def get_all(self) -> list[dict]:
        return list(self._by_id.values())

    def get(self, entity_id: str) -> dict | None:
        return self._by_id.get(entity_id)

    def fail(self) -> None:
        raise RuntimeError("状态库不可用")


class _Config:
    def __init__(self, sections: dict[str, dict]) -> None:
        self._sections = sections

    def get(self, name: str) -> dict:
        return dict(self._sections.get(name) or {})


class _Proxy:
    """``command_proxy`` 替身：返回固定预报，可按需失败。"""

    def __init__(self, response: dict | None = None, fail: Exception | None = None) -> None:
        self.response = response if response is not None else {}
        self.fail = fail
        self.calls: list[dict] = []

    async def call_service(self, dto: dict, *, policy: str | None = None) -> dict:
        self.calls.append({"dto": dto, "policy": policy})
        if self.fail is not None:
            raise self.fail
        return self.response


def _forecast_response(entity_id: str, days: list[dict]) -> dict:
    return {"success": True, "data": {"service_response": {entity_id: {"forecast": days}}}}


def _weather_entity(**overrides) -> dict:
    attributes = {
        "friendly_name": "成都天气",
        "temperature": 21,
        "temphigh": 24,
        "templow": 15,
        "humidity": 55,
    }
    attributes.update(overrides.pop("attributes", {}))
    entity = {"entity_id": "weather.chengdu", "state": "sunny", "attributes": attributes}
    entity.update(overrides)
    return entity


NOW = datetime(2026, 11, 1, 16, 35, tzinfo=SHANGHAI)


def _service(
    *,
    entities: list[dict] | None = None,
    sections: dict[str, dict] | None = None,
    proxy=None,
) -> HomeEnvironmentContextService:
    config = _Config(sections if sections is not None else {"ops": {"homeTimezone": "Asia/Shanghai"}})
    return HomeEnvironmentContextService(_Store(entities or []), config, command_proxy=proxy)


class LunarCalendarTest(unittest.TestCase):
    def test_spring_festival_anchors(self) -> None:
        anchors = {
            2020: date(2020, 1, 25),
            2021: date(2021, 2, 12),
            2022: date(2022, 2, 1),
            2023: date(2023, 1, 22),
            2024: date(2024, 2, 10),
            2025: date(2025, 1, 29),
            2026: date(2026, 2, 17),
        }
        for year, expected in anchors.items():
            with self.subTest(year=year):
                lunar = lunar_calendar.solar_to_lunar(expected)
                self.assertEqual((lunar.month, lunar.day, lunar.is_leap), (1, 1, False))
                # 春节前一天必须仍是上一年的腊月
                eve = lunar_calendar.solar_to_lunar(date.fromordinal(expected.toordinal() - 1))
                self.assertEqual((eve.month, eve.day), (12, 30) if eve.day == 30 else (12, 29))

    def test_leap_months(self) -> None:
        self.assertEqual(lunar_calendar.leap_month(2023), 2)
        self.assertEqual(lunar_calendar.leap_month(2025), 6)
        self.assertEqual(lunar_calendar.leap_month(2026), 0)
        leap = lunar_calendar.solar_to_lunar(date(2023, 3, 22))
        self.assertTrue(leap.is_leap)
        self.assertEqual((leap.month, leap.day), (2, 1))
        self.assertEqual(leap.month_name, "闰二月")

    def test_mid_autumn(self) -> None:
        lunar = lunar_calendar.solar_to_lunar(date(2024, 9, 17))
        self.assertEqual((lunar.month, lunar.day, lunar.is_leap), (8, 15, False))

    def test_zodiac_and_ganzhi(self) -> None:
        lunar = lunar_calendar.solar_to_lunar(date(2025, 1, 29))
        self.assertEqual(lunar.ganzhi, "乙巳")
        self.assertEqual(lunar.zodiac, "蛇")
        self.assertEqual(lunar_calendar.solar_to_lunar(date(2026, 11, 1)).zodiac, "马")

    def test_year_lengths_are_plausible(self) -> None:
        for year in range(1900, 2101):
            with self.subTest(year=year):
                self.assertTrue(353 <= lunar_calendar.year_days(year) <= 385)
                for month in range(1, 13):
                    self.assertIn(lunar_calendar.month_days(year, month), (29, 30))

    def test_out_of_range_dates_degrade_to_empty(self) -> None:
        self.assertEqual(lunar_calendar.lunar_text(date(1800, 1, 1)), "")
        self.assertEqual(lunar_calendar.lunar_text(date(2200, 1, 1)), "")


class TimeSectionTest(unittest.IsolatedAsyncioTestCase):
    async def test_today_and_tomorrow_carry_lunar_and_iron_law(self) -> None:
        text = await _service().build("zh", NOW)
        self.assertIn("公历 2026年11月01日 周日", text)
        self.assertIn("农历丙午年（马年）九月廿三", text)
        self.assertIn("明日预知", text)
        self.assertIn("农历丙午年（马年）九月廿四", text)
        self.assertIn("时间感知铁律", text)

    async def test_month_boundary_rolls_into_next_month(self) -> None:
        text = await _service().build("zh", datetime(2026, 11, 30, 23, 50, tzinfo=SHANGHAI))
        self.assertIn("公历 2026年12月01日", text)
        self.assertIn("明日预知", text)

    async def test_english_variant_has_no_chinese_time_label(self) -> None:
        text = await _service().build("en", NOW)
        self.assertIn("[Objective reference time & calendar]", text)
        self.assertIn("2026-11-01 (Sun)", text)
        self.assertIn("Time rule:", text)

    async def test_missing_timezone_falls_back_without_crashing(self) -> None:
        service = _service(sections={})
        text = await service.build("zh", NOW)
        self.assertIn("今日时间", text)


class CityInferenceTest(unittest.TestCase):
    def test_city_from_friendly_name(self) -> None:
        service = _service(entities=[_weather_entity()])
        self.assertEqual(service.resolve_city(), "成都")

    def test_city_from_entity_id_suffix(self) -> None:
        entity = _weather_entity(entity_id="weather.wuhan", attributes={"friendly_name": "实况"})
        service = _service(entities=[entity])
        self.assertEqual(service.resolve_city(), "武汉")

    def test_city_from_home_coordinates(self) -> None:
        entity = _weather_entity(entity_id="weather.home", attributes={"friendly_name": "天气"})
        service = _service(
            entities=[entity],
            sections={
                "ops": {"homeTimezone": "Asia/Shanghai"},
                "layout": {"earthquakeConfig": {"latitude": 31.23, "longitude": 121.47}},
            },
        )
        self.assertEqual(service.resolve_city(), "上海")

    def test_unknown_city_returns_empty(self) -> None:
        entity = _weather_entity(entity_id="weather.home", attributes={"friendly_name": "Weather"})
        service = _service(
            entities=[entity],
            sections={"ops": {"homeTimezone": "Asia/Shanghai"}, "layout": {"earthquakeConfig": {}}},
        )
        self.assertEqual(service.resolve_city(), "")

    def test_configured_weather_entity_wins(self) -> None:
        other = {"entity_id": "weather.beijing", "state": "sunny", "attributes": {"friendly_name": "北京天气"}}
        service = _service(
            entities=[other, _weather_entity()],
            sections={
                "ops": {"homeTimezone": "Asia/Shanghai"},
                "circadian": {"weatherEntityId": "weather.beijing"},
            },
        )
        self.assertEqual(service.resolve_city(), "北京")

    def test_prefers_chinese_named_weather_entity(self) -> None:
        """未绑定时按参考实现口径挑中文名实体 —— 英文名 ``forecast_home`` 不能抢走。"""
        english = {"entity_id": "weather.forecast_home", "state": "sunny", "attributes": {"friendly_name": "Home"}}
        service = _service(entities=[english, _weather_entity()])
        self.assertEqual(service._weather_entity()["entity_id"], "weather.chengdu")
        self.assertEqual(service.resolve_city(), "成都")

    def test_falls_back_to_first_weather_entity_without_chinese_name(self) -> None:
        only = {"entity_id": "weather.home", "state": "rainy", "attributes": {"friendly_name": "Home"}}
        service = _service(entities=[only])
        self.assertEqual(service._weather_entity()["entity_id"], "weather.home")


class WeatherSectionTest(unittest.IsolatedAsyncioTestCase):
    async def test_current_weather_translates_machine_state(self) -> None:
        text = await _service(entities=[_weather_entity()]).build("zh", NOW)
        self.assertIn("当前本地实时气象：晴", text)
        self.assertIn("当前气温 21°C", text)
        self.assertIn("今日 15~24°C", text)
        self.assertIn("湿度 55%", text)

    async def test_three_day_forecast_is_fetched_and_cached(self) -> None:
        days = [
            {"datetime": "2026-11-01T00:00:00+08:00", "condition": "sunny", "temperature": 24, "templow": 15},
            {"datetime": "2026-11-02T00:00:00+08:00", "condition": "rainy", "temperature": 20, "templow": 14},
            {"datetime": "2026-11-03T00:00:00+08:00", "condition": "cloudy", "temperature": 18, "templow": 12},
            {"datetime": "2026-11-04T00:00:00+08:00", "condition": "snowy", "temperature": 5, "templow": -1},
        ]
        proxy = _Proxy(_forecast_response("weather.chengdu", days))
        service = _service(entities=[_weather_entity()], proxy=proxy)

        text = await service.build("zh", NOW)
        self.assertIn("今日(11-01)", text)
        self.assertIn("明天(11-02)", text)
        self.assertIn("后天(11-03)", text)
        self.assertNotIn("11-04", text, "只取未来三天")
        self.assertIn("晴", text)

        await service.build("zh", NOW)
        self.assertEqual(len(proxy.calls), 1, "TTL 内不应重复询问 HA")
        self.assertEqual(proxy.calls[0]["dto"]["service"], "get_forecasts")
        self.assertTrue(proxy.calls[0]["dto"]["return_response"])

    async def test_past_forecast_days_are_dropped(self) -> None:
        days = [
            {"datetime": "2026-10-30T00:00:00+08:00", "condition": "rainy", "temperature": 20, "templow": 14},
            {"datetime": "2026-11-02T00:00:00+08:00", "condition": "cloudy", "temperature": 20, "templow": 14},
        ]
        proxy = _Proxy(_forecast_response("weather.chengdu", days))
        text = await _service(entities=[_weather_entity()], proxy=proxy).build("zh", NOW)
        self.assertNotIn("10-30", text)
        self.assertIn("明天(11-02)", text)

    async def test_forecast_failure_degrades_silently(self) -> None:
        proxy = _Proxy(fail=RuntimeError("HA 未连接"))
        service = _service(entities=[_weather_entity()], proxy=proxy)
        text = await service.build("zh", NOW)
        self.assertIn("当前气温 21°C", text, "实况仍在，只是没有多日预报")
        self.assertNotIn("本地未来多日预报", text)
        # 失败结果只缓存 1 分钟，别让一次抖动影响整段会话
        await service.build("zh", NOW)
        self.assertEqual(len(proxy.calls), 1)

    async def test_no_weather_entity_still_produces_time_section(self) -> None:
        text = await _service(entities=[]).build("zh", NOW)
        self.assertIn("今日时间", text)
        self.assertIn("家庭所在城市：本地", text)

    async def test_state_store_failure_returns_empty(self) -> None:
        class _Boom:
            """状态库读失败时必须只丢天气段，时间段照常输出。"""

            def get_all(self):
                raise RuntimeError("库挂了")

            def get(self, entity_id: str):
                raise RuntimeError("库挂了")

        service = HomeEnvironmentContextService(
            _Boom(),
            _Config({"ops": {"homeTimezone": "Asia/Shanghai"}}),
            command_proxy=_Proxy(),
        )
        text = await service.build("zh", NOW)
        self.assertIn("今日时间", text)

    async def test_sunrise_and_sunset_are_reported(self) -> None:
        sun = {
            "entity_id": "sun.sun",
            "state": "above_horizon",
            "attributes": {
                "next_dawn": "2026-11-02T06:52:00+08:00",
                "next_dusk": "2026-11-01T17:18:00+08:00",
            },
        }
        text = await _service(entities=[_weather_entity(), sun]).build("zh", NOW)
        self.assertIn("日出 06:52", text)
        self.assertIn("日落 17:18", text)


if __name__ == "__main__":
    unittest.main()
