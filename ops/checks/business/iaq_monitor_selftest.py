#!/usr/bin/env python3
"""室内环境监测自检：霉菌（按房间、需持续）与 IAQ 阈值。

关键边界：
- 湿度必须 ``device_class: humidity`` —— 否则「窗帘开了 60%」会被当成湿度；
- 霉菌取**房间内最低湿度**，且需持续超过 ``moldHoldMinutes``；
- 冷却内不重复告警；
- 阈值以下不告警。
"""

from __future__ import annotations

import asyncio

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

from homeos.backend.src.domains.environment.iaq.monitor import (
    IAQ_THRESHOLD_EVENT,
    MOLD_RISK_EVENT,
    IaqMonitor,
    co2_reading,
    describe_iaq_config,
    humidity_reading,
    pm25_reading,
)


def humidity(entity_id, value, area_id="", area_name=""):
    attrs = {"device_class": "humidity", "unit_of_measurement": "%", "friendly_name": entity_id}
    if area_id:
        attrs["area_id"] = area_id
        attrs["area_name"] = area_name
    return {"entity_id": entity_id, "state": str(value), "attributes": attrs}


def build(entities, iaq_cfg):
    bus = FakeBus()
    monitor = IaqMonitor(
        state_store=FakeStore(entities),
        app_config=FakeSectionConfig("iaq", iaq_cfg),
        event_bus=bus,
        cooldown=FakeCooldown(),
    )
    return monitor, bus


def test_reading_filters() -> None:
    check("湿度读数", humidity_reading(humidity("sensor.h", 70)) == 70.0)
    check(
        "非 humidity device_class 不算湿度（避免窗帘开合度被当湿度）",
        humidity_reading({"entity_id": "sensor.cover_pos", "state": "60", "attributes": {"unit_of_measurement": "%"}})
        is None,
    )
    check("非 sensor 域不算湿度", humidity_reading({**humidity("binary_sensor.x", 70)}) is None)
    check(
        "PM2.5 读数",
        pm25_reading({"entity_id": "sensor.pm", "state": "80", "attributes": {"device_class": "pm25"}}) == 80.0,
    )
    check(
        "CO₂ 读数",
        co2_reading({"entity_id": "sensor.co2", "state": "1300", "attributes": {"device_class": "carbon_dioxide"}})
        == 1300.0,
    )
    check(
        "非 pm25 不算 PM2.5",
        pm25_reading({"entity_id": "sensor.x", "state": "80", "attributes": {"device_class": "temperature"}}) is None,
    )


def test_mold_requires_hold() -> None:
    cfg = {"moldHumidityThreshold": 65, "moldHoldMinutes": 60}
    monitor, bus = build([humidity("sensor.bath_humidity", 75, "bath", "卫生间")], cfg)
    asyncio.run(monitor.tick())
    check("刚开始高湿不告警", not bus.events, str(bus.events))
    for room_id in monitor._humid_since:
        monitor._humid_since[room_id] -= 61 * 60
    asyncio.run(monitor.tick())
    payload = next((payload for name, payload in bus.events if name == MOLD_RISK_EVENT), None)
    check("持续高湿后告警", payload is not None)
    check("带房间 ID", (payload or {}).get("roomId") == "bath", str(payload))
    bus.events.clear()
    asyncio.run(monitor.tick())
    check("冷却内不重复", not bus.events, str(bus.events))


def test_room_uses_wettest_reading() -> None:
    """一个角落长期潮湿就够长霉：房间内有干点也不能把风险平均掉。"""
    cfg = {"moldHumidityThreshold": 65, "moldHoldMinutes": 10}
    entities = [
        humidity("sensor.room_dry", 40, "bed", "卧室"),
        humidity("sensor.room_wet", 80, "bed", "卧室"),
    ]
    monitor, bus = build(entities, cfg)
    asyncio.run(monitor.tick())
    for room_id in monitor._humid_since:
        monitor._humid_since[room_id] -= 11 * 60
    asyncio.run(monitor.tick())
    payload = next((payload for name, payload in bus.events if name == MOLD_RISK_EVENT), None)
    check("房间内最湿测点超阈值就报", payload is not None, str(bus.events))
    check("事件湿度取最湿测点", (payload or {}).get("humidity") == 80.0, str(payload))


def test_dry_room_no_mold() -> None:
    cfg = {"moldHumidityThreshold": 65, "moldHoldMinutes": 5}
    monitor, bus = build([humidity("sensor.dry", 55, "living", "客厅")], cfg)
    asyncio.run(monitor.tick())
    for room_id in list(monitor._humid_since):
        monitor._humid_since[room_id] -= 10 * 60
    asyncio.run(monitor.tick())
    check("低于阈值不告警", not bus.events, str(bus.events))
    check("低于阈值时清掉计时", monitor._humid_since == {}, str(monitor._humid_since))


def test_iaq_thresholds() -> None:
    cfg = {"pm25Threshold": 75, "co2Threshold": 1200}
    entities = [
        {"entity_id": "sensor.pm", "state": "10", "attributes": {"device_class": "pm25"}},
        {"entity_id": "sensor.co2", "state": "500", "attributes": {"device_class": "carbon_dioxide"}},
    ]
    monitor, bus = build(entities, cfg)
    asyncio.run(monitor.tick())
    check("阈值以下不告警", not bus.events, str(bus.events))

    entities[0]["state"] = "80"
    entities[1]["state"] = "1300"
    monitor, bus = build(entities, cfg)
    asyncio.run(monitor.tick())
    names = [name for name, _payload in bus.events]
    check("PM2.5 越线告警", names.count(IAQ_THRESHOLD_EVENT) == 2, str(names))
    metrics = {payload.get("metric") for _name, payload in bus.events}
    check("两条指标都带上", metrics == {"pm25", "co2"}, str(metrics))


def test_config_normalization() -> None:
    cfg = describe_iaq_config({"moldHumidityThreshold": "0", "moldHoldMinutes": "0", "co2Threshold": "0"})
    check("湿度阈值下限 30", cfg["moldHumidityThreshold"] == 30.0, str(cfg))
    check("持续时长下限 5 分钟", cfg["moldHoldMinutes"] == 5.0, str(cfg))
    check("CO₂ 阈值下限 400", cfg["co2Threshold"] == 400.0, str(cfg))


def main() -> int:
    test_reading_filters()
    test_mold_requires_hold()
    test_room_uses_wettest_reading()
    test_dry_room_no_mold()
    test_iaq_thresholds()
    test_config_normalization()
    report("室内环境监测")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
