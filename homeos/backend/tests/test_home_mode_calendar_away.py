"""日历外出联动回归：多互斥组下的「进入 / 退出外出模式」。

旧实现用内存指针（``get_active_mode_id``）判断「外出模式是否激活 / 该退哪一个」，
并且恢复先前模式只恢复一个 id：

- 指针指向的是优先级最高的激活模式，可能属于另一个互斥组（例如 comfort 组「睡眠」），
  于是外出模式已经激活却仍被判成未激活，重复走激活流程；
- 外出结束时 ``request_deactivate()`` 无参退的是指针主模式 —— 退掉睡眠、离家模式继续
  生效，房子停在离家场景；若指针恰好不是外出模式，则外出模式永远不退出。

因此这里锁定两条：激活态以数据库为准，退出必须点名目标模式。
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

from src.domains.home_mode.triggers import (
    HomeModeTriggersState,
    handle_home_mode_calendar_away,
)


def _mode(mode_id: str, name: str, *, group: str = "default", triggers: list[Any] | None = None) -> dict[str, Any]:
    return {
        "id": mode_id,
        "name": name,
        "exclusiveGroup": group,
        "priority": 50,
        "triggers": triggers or [],
    }


class _DepsStub:
    def __init__(self, modes: list[dict[str, Any]], active: list[dict[str, Any]]) -> None:
        self._modes = {str(mode["id"]): mode for mode in modes}
        self._active = list(active)
        self.calls: list[tuple[str, str | None]] = []

    def is_leader(self) -> bool:
        return True

    async def get_active_modes(self) -> list[dict[str, Any]]:
        return list(self._active)

    async def find_mode(self, mode_id: str) -> dict[str, Any] | None:
        return self._modes.get(str(mode_id))

    def get_active_mode_id(self) -> str | None:
        # 指针只记得「优先级最高的激活模式」，这里刻意让它指向另一个互斥组。
        return str(self._active[0]["id"]) if self._active else None

    def get_trigger_cooldown_ms(self) -> int:
        return 0

    def log(self, _message: str) -> None:
        return None

    def warn(self, _message: str) -> None:
        return None

    async def request_activate(self, mode_id: str, _meta: Any = None) -> None:
        self.calls.append(("activate", str(mode_id)))

    async def request_deactivate(self, mode_id: str | None = None) -> None:
        self.calls.append(("deactivate", None if mode_id is None else str(mode_id)))


_SLEEP = _mode("m_sleep", "睡眠模式", group="comfort")
_AWAY = _mode("m_away", "离家模式", group="default", triggers=[{"type": "calendar_away"}])


class CalendarAwayTest(unittest.TestCase):
    def test_away_end_exits_away_mode_even_when_pointer_points_elsewhere(self) -> None:
        deps = _DepsStub([_SLEEP, _AWAY], active=[_SLEEP, _AWAY])
        state = HomeModeTriggersState(cached_modes=[_SLEEP, _AWAY])
        state.calendar_away = True
        state.pre_away_mode_ids = ["m_sleep"]

        asyncio.run(handle_home_mode_calendar_away(state, deps, {"away": False}))

        self.assertEqual(deps.calls, [("deactivate", "m_away"), ("activate", "m_sleep")])
        self.assertEqual(state.pre_away_mode_ids, [])

    def test_away_start_skips_when_mode_already_active(self) -> None:
        deps = _DepsStub([_SLEEP, _AWAY], active=[_SLEEP, _AWAY])
        state = HomeModeTriggersState(cached_modes=[_SLEEP, _AWAY])

        asyncio.run(handle_home_mode_calendar_away(state, deps, {"away": True}))

        self.assertEqual(deps.calls, [])
        self.assertEqual(state.pre_away_mode_ids, ["m_away", "m_sleep"])

    def test_away_start_activates_mode_and_remembers_all_active_ids(self) -> None:
        deps = _DepsStub([_SLEEP, _AWAY], active=[_SLEEP])
        state = HomeModeTriggersState(cached_modes=[_SLEEP, _AWAY])

        asyncio.run(handle_home_mode_calendar_away(state, deps, {"away": True}))

        self.assertEqual(deps.calls, [("activate", "m_away")])
        self.assertEqual(state.pre_away_mode_ids, ["m_sleep"])


if __name__ == "__main__":
    unittest.main()
