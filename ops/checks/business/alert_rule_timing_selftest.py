#!/usr/bin/env python3
"""告警规则时序自检：``forSeconds`` 与 ``clearDelaySeconds`` 必须靠定时器收尾。

## 为什么需要它

规则评估只发生在「实体状态变化」时。正常传感器只发两次状态（``on`` → ``off``），因此：

- ``forSeconds``（持续 N 秒才报）：``on`` 之后没有后一次事件，旧实现永远等不到那次评估，
  「门开 5 分钟」「燃气持续 5 分钟」这类规则实际上从不触发；
- ``clearDelaySeconds``（回落去抖）：解锁只在「再一次不成立事件」里做，``off`` 之后没有
  后一次事件，锁存永远不放，下一次 ``on`` 被当成「还在告警中」永久跳过 —— 第二条
  燃气 / CO / 烟雾事件永远不会通知。

两条都是静默的安全回归（不报错、不告警），只能靠自检钉住。
"""

from __future__ import annotations

import asyncio

from _selftest_support import check, ensure_repo_on_path, report

ensure_repo_on_path()

from homeos.backend.src.domains.notification.rules import NotificationRulesHelper

ENTITY = "binary_sensor.gas_kitchen"


class Recorder:
    """记录 ``notify`` 调用（返回 True 表示投递成功）。"""

    def __init__(self) -> None:
        self.calls: list[tuple] = []

    async def __call__(self, level, message, kind, entity_id, meta=None) -> bool:
        self.calls.append((level, message, kind, entity_id, meta))
        return True

    def alerts(self) -> list[tuple]:
        """只数真实告警（排除「已恢复」这类 info 通知）。"""
        return [call for call in self.calls if call[0] != "info"]


def build(*, for_seconds: float = 0, clear_delay: float = 0) -> tuple[NotificationRulesHelper, Recorder]:
    recorder = Recorder()
    helper = NotificationRulesHelper(
        session_factory=lambda: None,
        alert_rule_watch_index=type("Idx", (), {"get": lambda self, _e: None})(),
        is_dnd_active=lambda: False,
        is_alert_bypass_dnd=lambda: False,
        is_in_cooldown=lambda _key: False,
        set_cooldown=lambda _key, _minutes: None,
        notify=recorder,
    )
    helper.rules_cache = [
        {
            "id": "rule-gas",
            "name": "燃气",
            "entityId": ENTITY,
            "condition": "== on",
            "level": "danger",
            "forSeconds": for_seconds,
            "clearDelaySeconds": clear_delay,
            "cooldownMinutes": 0,
        }
    ]
    return helper, recorder


def test_for_seconds_fires_without_further_events() -> None:
    async def scenario():
        helper, recorder = build(for_seconds=0.05)
        await helper.evaluate_rules(ENTITY, "on", {"friendly_name": "厨房燃气"})
        check("未到持续时长不告警", recorder.alerts() == [], str(recorder.calls))
        await asyncio.sleep(0.15)
        check("到点自动复评并告警一次", len(recorder.alerts()) == 1, str(recorder.calls))
        # 复核不应把自己当成新边沿再报一次
        await asyncio.sleep(0.1)
        check("持续匹配期间不重复告警", len(recorder.alerts()) == 1, str(recorder.calls))

    asyncio.run(scenario())


def test_for_seconds_aborted_by_falling_edge() -> None:
    async def scenario():
        helper, recorder = build(for_seconds=0.08)
        await helper.evaluate_rules(ENTITY, "on", {})
        await helper.evaluate_rules(ENTITY, "off", {})
        await asyncio.sleep(0.15)
        check("回落取消持续判定，不告警", recorder.alerts() == [], str(recorder.calls))

    asyncio.run(scenario())


def test_clear_delay_releases_without_second_event() -> None:
    async def scenario():
        helper, recorder = build(clear_delay=0.05)
        await helper.evaluate_rules(ENTITY, "on", {})
        check("首次 on 告警", len(recorder.alerts()) == 1, str(recorder.calls))
        await helper.evaluate_rules(ENTITY, "off", {})
        await asyncio.sleep(0.15)
        check("去抖窗口到时自动解锁", helper._match_state.get(f"rule-gas:{ENTITY}") is False, str(helper._match_state))
        await helper.evaluate_rules(ENTITY, "on", {})
        check("解锁后第二次 on 能再次告警", len(recorder.alerts()) == 2, str(recorder.calls))

    asyncio.run(scenario())


def test_clear_delay_survives_brief_blip() -> None:
    """去抖窗口内的短抖动不应解锁，也不应重复告警。"""

    async def scenario():
        helper, recorder = build(clear_delay=0.1)
        await helper.evaluate_rules(ENTITY, "on", {})
        await helper.evaluate_rules(ENTITY, "off", {})
        await asyncio.sleep(0.02)
        await helper.evaluate_rules(ENTITY, "on", {})
        await asyncio.sleep(0.15)
        check("抖动未解锁", helper._match_state.get(f"rule-gas:{ENTITY}") is True, str(helper._match_state))
        check("抖动不重复告警", len(recorder.alerts()) == 1, str(recorder.calls))

    asyncio.run(scenario())


def main() -> int:
    test_for_seconds_fires_without_further_events()
    test_for_seconds_aborted_by_falling_edge()
    test_clear_delay_releases_without_second_event()
    test_clear_delay_survives_brief_blip()
    report("告警规则时序")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
