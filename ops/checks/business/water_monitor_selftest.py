#!/usr/bin/env python3
"""用水监测自检：长流水 / 漏水 / 离家用水，以及「配置关闭时不触发」。

用真实 ``WaterMonitor`` + 假状态仓跑：时间由注入的 ``now`` 推进（监测器内部按
``time.monotonic`` 计时，这里直接用 ``_flowing_since`` 回填起点模拟「已经流了 N 分钟」），
避免测试真的 sleep。
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

from homeos.backend.src.domains.water.monitor import (
    WATER_ANOMALY_EVENT,
    WaterMonitor,
    describe_water_config,
    flow_lpm,
)


class FakeUsage:
    """内存版用水日用量存储（语义与 ``WaterUsageStore`` 一致：`(entity, day)` 累加）。"""

    def __init__(self, history: dict[str, float] | None = None):
        self.rows: dict[tuple[str, str], float] = {}
        self.history = history or {}

    def record_delta(self, entity_id: str, day: str, delta_m3: float) -> None:
        if delta_m3 <= 0:
            return
        key = (entity_id, day)
        self.rows[key] = self.rows.get(key, 0.0) + float(delta_m3)

    def today_total(self, entity_ids, day):
        return sum(self.rows.get((entity_id, day), 0.0) for entity_id in entity_ids)

    def baseline(self, entity_ids, day, learning_days):
        values = [value for value in self.history.values() if value > 0]
        if not values:
            return None, 0
        return sum(values) / len(values), len(values)


class FakePresence:
    def __init__(self, anyone_home=True):
        self.anyone_home = anyone_home

    def is_anyone_home(self):
        return self.anyone_home


FLOW_ENTITY = {
    "entity_id": "sensor.water_flow",
    "state": "1.2",
    "attributes": {"device_class": "volume_flow_rate", "unit_of_measurement": "L/min", "friendly_name": "水流量"},
}
LEAK_ENTITY = {
    "entity_id": "binary_sensor.bath_water_leak",
    "state": "on",
    "attributes": {"device_class": "moisture", "friendly_name": "卫生间漏水"},
}


METER_ENTITY = {
    "entity_id": "sensor.water_meter",
    "state": "120.00",
    "attributes": {"device_class": "water", "unit_of_measurement": "m³", "friendly_name": "水表"},
}


def _meter(value: float) -> dict:
    return {**METER_ENTITY, "state": f"{value:.3f}"}


def build(entities, water_cfg, anyone_home=True, usage=None):
    bus = FakeBus()
    monitor = WaterMonitor(
        state_store=FakeStore(entities),
        app_config=FakeSectionConfig("water", water_cfg),
        event_bus=bus,
        cooldown=FakeCooldown(),
        presence=FakePresence(anyone_home),
        usage=usage,
    )
    return monitor, bus


def test_unit_conversion() -> None:
    check("L/min 原样", abs((flow_lpm(FLOW_ENTITY) or 0) - 1.2) < 1e-6)
    m3h = {"entity_id": "sensor.f", "state": "3.6", "attributes": {"unit_of_measurement": "m³/h"}}
    # 3.6 m³/h = 60 L/min
    check("m³/h 换算到 L/min", abs((flow_lpm(m3h) or 0) - 60.0) < 1e-6, str(flow_lpm(m3h)))
    check("非流量传感器不被误判", flow_lpm({"entity_id": "sensor.t", "state": "20", "attributes": {}}) is None)
    gas_flow = {
        "entity_id": "sensor.gas_boiler_flow",
        "state": "2",
        "attributes": {"unit_of_measurement": "m³/h"},
    }
    check("燃气流量不计入用水（单位相同也不能误判）", flow_lpm(gas_flow) is None, str(flow_lpm(gas_flow)))


def test_leak_sensor_not_double_reported() -> None:
    """水浸传感器只由安防危险联动告警，用水监测不再重复发一条。

    同一处漏水收到「安全告警：漏水（已自动关阀）」和「检测到漏水，可一键关阀」两条，
    会让用户以为出现了两处问题。
    """
    monitor, bus = build([LEAK_ENTITY], {"mainValveEntityId": "valve.main"})
    asyncio.run(monitor.tick())
    check("用水监测不为水浸传感器发事件", not bus.events, str(bus.events))


def test_long_flow_requires_duration() -> None:
    cfg = {"longFlowMinutes": 30, "longFlowRateLpm": 0.5}
    monitor, bus = build([FLOW_ENTITY], cfg)
    asyncio.run(monitor.tick())
    check("刚开始流水不告警", not bus.events, str(bus.events))
    # 回填起点：模拟已持续 31 分钟
    for entity_id in monitor._flowing_since:
        monitor._flowing_since[entity_id] -= 31 * 60
    asyncio.run(monitor.tick())
    payload = next((payload for name, payload in bus.events if name == WATER_ANOMALY_EVENT), None)
    check("超过时长后告警", payload is not None)
    check("类型为 long_flow", (payload or {}).get("type") == "long_flow", str(payload))


def test_flow_below_threshold_resets() -> None:
    cfg = {"longFlowMinutes": 30, "longFlowRateLpm": 5.0}
    monitor, bus = build([FLOW_ENTITY], cfg)
    asyncio.run(monitor.tick())
    check("低于阈值不计时", monitor._flowing_since == {}, str(monitor._flowing_since))
    check("低于阈值不告警", not bus.events)


def test_away_flow_immediate() -> None:
    monitor, bus = build([FLOW_ENTITY], {"longFlowMinutes": 30, "longFlowRateLpm": 0.5}, anyone_home=False)
    asyncio.run(monitor.tick())
    payload = next((payload for name, payload in bus.events if name == WATER_ANOMALY_EVENT), None)
    check("离家期间有水流量立即告警", payload is not None)
    check("类型为 away_flow", (payload or {}).get("type") == "away_flow", str(payload))


def test_config_normalization() -> None:
    cfg = describe_water_config({"longFlowMinutes": "0", "longFlowRateLpm": "0", "anomalyCooldownMin": "0"})
    check("时长下限 1 分钟", cfg["longFlowMinutes"] == 1.0, str(cfg))
    check("流量下限 0.05 L/min", abs(cfg["longFlowRateLpm"] - 0.05) < 1e-9, str(cfg))
    check("冷却下限 1 分钟", cfg["cooldownMinutes"] == 1.0, str(cfg))


def test_usage_delta_accounting() -> None:
    """累计水表差分：首次无基线不计账；回落视为换表；超大增量不计账。"""

    async def scenario():
        usage = FakeUsage()
        cfg = {"usageLearningDays": 3, "dailyAnomalyRatio": 2.0}
        monitor, _bus = build([_meter(100.0)], cfg, usage=usage)
        await monitor.tick()
        check("首次观测不产生用量", usage.rows == {}, str(usage.rows))

        monitor._store = FakeStore([_meter(100.4)])
        await monitor.tick()
        recorded = list(usage.rows.values())
        check("读数增加记 0.4 m³", recorded and abs(recorded[0] - 0.4) < 1e-6, str(usage.rows))

        # 换表：读数归零后继续增长，不能把负差当成负用量
        monitor._store = FakeStore([_meter(0.05)])
        await monitor.tick()
        total_after_reset = sum(usage.rows.values())
        check("读数回落只更新基线、不记负数", abs(total_after_reset - 0.4) < 1e-6, str(usage.rows))

        monitor._store = FakeStore([_meter(0.30)])
        await monitor.tick()
        check("重置后继续按新基线累计", abs(sum(usage.rows.values()) - 0.65) < 1e-6, str(usage.rows))

        # 集成补发历史（一次跳 8 m³）：判为单位错配 / 换表，不计账
        before = sum(usage.rows.values())
        monitor._store = FakeStore([_meter(8.30)])
        await monitor.tick()
        check("超大增量不计账", abs(sum(usage.rows.values()) - before) < 1e-6, str(usage.rows))

    asyncio.run(scenario())


def test_daily_usage_needs_baseline() -> None:
    """基线天数不足时不报：新装水表头几天没有可比对象。"""

    async def scenario():
        usage = FakeUsage()
        usage.record_delta("sensor.water_meter", "2099-01-01", 5.0)
        # 只有 2 天历史，usageLearningDays=7 → 不报
        history = {"2099-01-01": 0.1, "2099-01-02": 0.1}
        usage.history = history
        monitor, bus = build([_meter(100.0)], {"usageLearningDays": 7, "dailyAnomalyRatio": 2.0}, usage=usage)
        await monitor.tick()
        check("基线天数不足不报日用量异常", not bus.events, str(bus.events))

    asyncio.run(scenario())


def test_daily_usage_anomaly_fires() -> None:
    """今日远超历史日均 → 告警，类型为 ``daily_high``。"""

    async def scenario():
        usage = FakeUsage({"d1": 0.2, "d2": 0.2, "d3": 0.2, "d4": 0.2})
        monitor, bus = build([_meter(100.0)], {"usageLearningDays": 3, "dailyAnomalyRatio": 2.0}, usage=usage)
        await monitor.tick()
        # 直接往「今天」灌 2 m³（= 日均 0.2 的 10 倍）
        from homeos.backend.src.domains.water.usage import business_day

        usage.record_delta("sensor.water_meter", business_day(), 2.0)
        await monitor.tick()
        payload = next((payload for name, payload in bus.events if name == WATER_ANOMALY_EVENT), None)
        check("日用量异常告警", payload is not None, str(bus.events))
        check("类型为 daily_high", (payload or {}).get("type") == "daily_high", str(payload))

    asyncio.run(scenario())


def main() -> int:
    test_unit_conversion()
    test_leak_sensor_not_double_reported()
    test_long_flow_requires_duration()
    test_flow_below_threshold_resets()
    test_away_flow_immediate()
    test_config_normalization()
    test_usage_delta_accounting()
    test_daily_usage_needs_baseline()
    test_daily_usage_anomaly_fires()
    report("用水监测")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
