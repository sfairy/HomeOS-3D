"""家庭模式触发器优先级：只和**同互斥组**的激活模式比较。

旧实现拿全局主模式（``get_active_mode()``）当对手。多互斥组下全局主模式可能属于
另一个组，判定结果直接反转：

- default 组「回家」是主模式（优先级 100），comfort 组「睡眠」也在生效（60）；
- 此时 comfort 组「影音」（40）的触发器应当让位给睡眠；
- 旧逻辑看到的是「回家（不同组）」→ 跳过让位 → 影音顶掉睡眠。

反过来，同组高优先级模式也必须能正常接管。
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
    HomeModeTriggerBinding,
    HomeModeTriggersState,
    _fire_triggered_home_mode,
)


def _mode(mode_id: str, group: str, priority: int | None) -> dict[str, Any]:
    return {
        "id": mode_id,
        "name": mode_id,
        "exclusiveGroup": group,
        "priority": priority,
    }


class _DepsStub:
    def __init__(
        self,
        modes: dict[str, dict[str, Any]],
        active: list[dict[str, Any]],
    ) -> None:
        self._modes = modes
        self._active = active
        self.activated: list[tuple[str, dict[str, Any]]] = []

    async def find_mode(self, mode_id: str) -> dict[str, Any] | None:
        return self._modes.get(mode_id)

    async def get_active_modes(self) -> list[dict[str, Any]]:
        return list(self._active)

    def get_active_mode_id(self) -> str | None:
        # 全局主模式：跨组时这里返回的可能是另一个组的高优先级模式。
        return self._active[0]["id"] if self._active else None

    def get_trigger_cooldown_ms(self) -> int:
        return 0

    def log(self, _message: str) -> None:
        return None

    async def request_activate(self, mode_id: str, meta: dict[str, Any] | None = None) -> None:
        self.activated.append((mode_id, dict(meta or {})))


def _fire(incoming: dict[str, Any], active: list[dict[str, Any]]) -> _DepsStub:
    deps = _DepsStub({incoming["id"]: incoming}, active)
    state = HomeModeTriggersState()
    binding = HomeModeTriggerBinding(
        mode_id=incoming["id"],
        mode_name=incoming["id"],
        trigger={"type": "state", "entityId": "binary_sensor.any"},
    )
    asyncio.run(_fire_triggered_home_mode(state, deps, binding, "状态变化"))
    return deps


class TriggerPriorityTest(unittest.TestCase):
    def test_yields_to_higher_priority_mode_in_same_group_even_if_primary_is_elsewhere(
        self,
    ) -> None:
        movie = _mode("movie", "comfort", 40)
        deps = _fire(
            movie,
            [_mode("home", "default", 100), _mode("sleep", "comfort", 60)],
        )
        self.assertEqual(deps.activated, [])

    def test_same_group_higher_priority_mode_can_take_over(self) -> None:
        movie_hi = _mode("movie_hi", "comfort", 80)
        deps = _fire(
            movie_hi,
            [_mode("home", "default", 100), _mode("sleep", "comfort", 60)],
        )
        self.assertEqual([mode_id for mode_id, _meta in deps.activated], ["movie_hi"])

    def test_mode_in_empty_group_still_activates(self) -> None:
        movie = _mode("movie", "comfort", 40)
        deps = _fire(movie, [_mode("home", "default", 100)])
        self.assertEqual([mode_id for mode_id, _meta in deps.activated], ["movie"])


if __name__ == "__main__":
    unittest.main()
