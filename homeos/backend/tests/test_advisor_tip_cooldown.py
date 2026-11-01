"""顾问提示的冷却窗口必须与「0 = 不限制」的校验口径一致。

历史写法 ``float(other.get("tipCooldownHours") or 2)`` 把 ``0`` 当成「未配置」，
于是界面里选「0（不限制）」实际仍被锁 2 小时 —— 一个看得见、改不动的配置。
这里逐条钉住：正数 → 生效；0 → 不设冷却；缺失 / 非法 → 回落 2 小时。

运行：node ops/lib/py.mjs -m unittest discover -s homeos/backend/tests -t homeos/backend -v
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.notification.event_handlers import NotificationEventHandlersHelper

TIP_EVENT = {"title": "空调长时间运行", "message": "建议开窗通风", "category": "energy"}


def _noop_async(*_args: Any, **_kwargs: Any) -> Any:
    async def _coro() -> None:
        return None

    return _coro()


def _build(
    other: dict[str, Any],
    *,
    sent: bool = True,
    in_cooldown: bool = False,
) -> tuple[NotificationEventHandlersHelper, list[tuple[str, float]]]:
    """只装配 ``handle_advisor_tip`` 用得到的依赖，其余给空实现。"""
    cooldowns: list[tuple[str, float]] = []

    async def notify(*_args: Any, **_kwargs: Any) -> bool:
        return sent

    helper = NotificationEventHandlersHelper(
        state_router=object(),  # type: ignore[arg-type]
        notify=notify,
        is_in_cooldown=lambda _key: in_cooldown,
        set_cooldown=lambda key, minutes: cooldowns.append((key, minutes)),
        check_device_offline=_noop_async,
        check_low_battery=_noop_async,
        evaluate_rules=_noop_async,
        resolve_room_label=lambda room: str(room or ""),
        get_security_cfg=dict,
        get_energy_cfg=dict,
        get_water_cfg=dict,
        get_iaq_cfg=dict,
        get_other_cfg=lambda: dict(other),
    )
    return helper, cooldowns


def _run(helper: NotificationEventHandlersHelper) -> None:
    asyncio.run(helper.handle_advisor_tip(TIP_EVENT))


class AdvisorTipCooldownTest(unittest.TestCase):
    def test_positive_hours_become_minutes(self) -> None:
        helper, cooldowns = _build({"tipCooldownHours": 2})
        _run(helper)
        self.assertEqual(cooldowns, [("tip:空调长时间运行:energy", 120)])

    def test_zero_means_unlimited(self) -> None:
        helper, cooldowns = _build({"tipCooldownHours": 0})
        _run(helper)
        # 0 是「不限制」：不写冷却记录，下一条同类提示立即可发
        self.assertEqual(cooldowns, [])

    def test_missing_value_defaults_to_two_hours(self) -> None:
        helper, cooldowns = _build({})
        _run(helper)
        self.assertEqual(cooldowns, [("tip:空调长时间运行:energy", 120)])

    def test_invalid_value_defaults_to_two_hours(self) -> None:
        helper, cooldowns = _build({"tipCooldownHours": "abc"})
        _run(helper)
        self.assertEqual(cooldowns, [("tip:空调长时间运行:energy", 120)])

    def test_no_cooldown_written_when_notify_fails(self) -> None:
        helper, cooldowns = _build({"tipCooldownHours": 2}, sent=False)
        _run(helper)
        # 没发出去就不该占用冷却窗口，否则用户永远等不到这条提示
        self.assertEqual(cooldowns, [])

    def test_in_cooldown_short_circuits(self) -> None:
        helper, cooldowns = _build({"tipCooldownHours": 2}, in_cooldown=True)
        _run(helper)
        self.assertEqual(cooldowns, [])


if __name__ == "__main__":
    unittest.main()
