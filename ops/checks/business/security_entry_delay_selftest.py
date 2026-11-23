#!/usr/bin/env python3
"""安防进入延时自检：布防后开门先进 pending、撤防取消、到点才真正告警。

三条断言对应三种真实误报/漏报：
- **不延迟**：人体传感器不进入延时（延迟它只会让报警滞后，不是减少误报）；
- **撤防取消**：用户赶在窗口内撤防 → 不得再响；
- **到点告警**：窗口内没撤防 → 必须真正派发（否则等于把安防关掉了）。
"""

from __future__ import annotations

import asyncio

from _selftest_support import FakeBus, check, ensure_repo_on_path, report

ensure_repo_on_path()

from homeos.backend.src.domains.security.panel_helpers import SecurityAlarmHelper


class FakeStateHelper:
    """只记录审计事件的假状态助手。"""

    def __init__(self) -> None:
        self.events: list[tuple] = []

    def schedule_security_event(self, *args, **kwargs) -> None:
        self.events.append((args, kwargs))

    def persist_panel_state(self):
        return {}


class CooldownRecorder:
    """记录区域冷却写入：用来断言「pending 期间不消费冷却」。"""

    def __init__(self) -> None:
        self.set_calls: list[str] = []
        self.active: set[str] = set()

    def is_in(self, zone_id: str) -> bool:
        return zone_id in self.active

    def set(self, zone_id: str, _minutes: float) -> None:
        self.set_calls.append(zone_id)
        self.active.add(zone_id)


def build(entry_delay: int, mode: str = "armed_away"):
    bus = FakeBus()
    cooldown = CooldownRecorder()
    helper = SecurityAlarmHelper(
        session_factory=lambda: None,
        bus=bus,
        ha_connector=type("HA", (), {"call_service": lambda *a, **k: None})(),
        state_helper=FakeStateHelper(),
        config_reader=lambda: {"entryDelaySeconds": entry_delay, "sensorAlertCooldownSec": 0},
        get_current_mode=lambda: mode,
        get_zones=list,
        get_armed_at=lambda: None,
        is_zone_alarm_in_cooldown=cooldown.is_in,
        set_zone_alarm_cooldown=cooldown.set,
    )
    return helper, bus, cooldown


DOOR = {
    "entity_id": "binary_sensor.front_door",
    "state": "on",
    "attributes": {"device_class": "door", "friendly_name": "入户门"},
}
MOTION = {
    "entity_id": "binary_sensor.hall_motion",
    "state": "on",
    "attributes": {"device_class": "motion", "friendly_name": "走廊人体"},
}


def test_door_starts_pending() -> None:
    async def scenario():
        helper, bus, _cooldown = build(30)
        started = helper.entry_delay.begin("binary_sensor.front_door", DOOR, "on", [{"id": "z1", "name": "玄关"}], 0)
        check("门磁触发进入 pending", started is True)
        names = [name for name, _payload in bus.events]
        check("发出 entryPending 事件", "security.entryPending" in names, str(names))
        payload = next(payload for name, payload in bus.events if name == "security.entryPending")
        check("pending 带倒计时秒数", payload.get("delaySeconds") == 30, str(payload))
        check("pending 期间不发 alarm", "security.alarm" not in names, str(names))
        helper.entry_delay.cancel("test")

    asyncio.run(scenario())


def test_motion_not_delayed() -> None:
    async def scenario():
        helper, bus, _cooldown = build(30)
        started = helper.entry_delay.begin("binary_sensor.hall_motion", MOTION, "on", [{"id": "z1", "name": "走廊"}], 0)
        check("人体传感器不进延时", started is False)
        check("没有 pending 事件", not bus.events, str(bus.events))

    asyncio.run(scenario())


def test_disarm_cancels() -> None:
    async def scenario():
        helper, bus, _cooldown = build(30)
        helper.entry_delay.begin("binary_sensor.front_door", DOOR, "on", [{"id": "z1", "name": "玄关"}], 0)
        bus.events.clear()
        cancelled = helper.entry_delay.cancel("已撤防")
        check("撤防能取消 pending", cancelled is True)
        check("取消后状态清空", helper.entry_delay.status() == {"pending": False}, str(helper.entry_delay.status()))
        # 到点回调不应再告警
        helper.entry_delay._on_deadline()
        check("取消后到点不告警", not bus.events, str(bus.events))

    asyncio.run(scenario())


def test_deadline_fires_alarm() -> None:
    async def scenario():
        helper, bus, _cooldown = build(1)
        helper.entry_delay.begin("binary_sensor.front_door", DOOR, "on", [{"id": "z1", "name": "玄关"}], 0)
        bus.events.clear()
        helper.entry_delay._on_deadline()
        # 到点任务异步派发，给它一个调度机会
        await asyncio.sleep(0)
        names = [name for name, _payload in bus.events]
        check("到点仍未撤防 → 真正告警", "security.alarm" in names, str(names))

    asyncio.run(scenario())


def test_deadline_disarmed_skips() -> None:
    async def scenario():
        helper, bus, _cooldown = build(1, mode="disarmed")
        helper.entry_delay.begin("binary_sensor.front_door", DOOR, "on", [{"id": "z1", "name": "玄关"}], 0)
        bus.events.clear()
        helper.entry_delay._on_deadline()
        await asyncio.sleep(0)
        check("到点时已撤防则不告警", not bus.events, str(bus.events))

    asyncio.run(scenario())


def test_cooldown_not_consumed_while_pending() -> None:
    """撤防取消了 pending，区域冷却就**不能**已经被消耗。

    旧顺序在 ``entry_delay.begin`` 之前就写了区域冷却：正常回家并撤防之后，
    冷却窗口内的一次真实入侵会被静默吞掉 —— 这是「进入延时」最危险的副作用。
    """

    async def scenario():
        helper, bus, cooldown = build(30, mode="armed_away")
        armed_zone = {
            "id": "z1",
            "name": "玄关",
            "armed": True,
            "sensors": ["binary_sensor.front_door"],
            "zoneType": "entry",
        }
        helper._get_zones = lambda: [armed_zone]
        await helper.handle_sensor_trigger(
            {
                "entity_id": "binary_sensor.front_door",
                "old_state": {"state": "off"},
                "new_state": dict(DOOR),
            }
        )
        check("门磁触发后进入 pending", helper.entry_delay.status()["pending"] is True)
        check("pending 期间没有写入区域冷却", cooldown.set_calls == [], str(cooldown.set_calls))
        helper.entry_delay.cancel("已撤防")
        check("撤防后仍没有写入区域冷却", cooldown.set_calls == [], str(cooldown.set_calls))

        helper.entry_delay.begin("binary_sensor.front_door", DOOR, "on", [armed_zone], 60)
        helper.entry_delay._on_deadline()
        await asyncio.sleep(0)
        check("真正告警时才消费区域冷却", cooldown.set_calls == ["z1"], str(cooldown.set_calls))
        check("告警事件已发出", "security.alarm" in bus.names(), str(bus.names()))

    asyncio.run(scenario())


def test_disabled_when_zero() -> None:
    async def scenario():
        helper, bus, _cooldown = build(0)
        started = helper.entry_delay.begin("binary_sensor.front_door", DOOR, "on", [{"id": "z1", "name": "玄关"}], 0)
        check("entryDelaySeconds=0 时不启用延时", started is False)
        check("也没有 pending 事件", not bus.events, str(bus.events))

    asyncio.run(scenario())


def test_lock_unlock_counts_as_entry() -> None:
    async def scenario():
        helper, _bus, _cooldown = build(30)
        helper.entry_delay.begin("lock.front_door", {"state": "unlocked"}, "unlocked", [{"id": "z1"}], 0)
        check("门锁解锁算进门（进入延时生效）", helper.entry_delay.status()["pending"] is True)
        helper.entry_delay.cancel("test")

    asyncio.run(scenario())


def main() -> int:
    test_door_starts_pending()
    test_motion_not_delayed()
    test_disarm_cancels()
    test_cooldown_not_consumed_while_pending()
    test_deadline_fires_alarm()
    test_deadline_disarmed_skips()
    test_disabled_when_zero()
    test_lock_unlock_counts_as_entry()
    report("安防进入延时")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
