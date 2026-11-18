"""家庭模式同优先级互斥回归。

历史缺陷：让位判定写成 ``incoming <= active``，而两个预置模式（回家 / 离家）都没配
``priority``（默认 50）且同属 ``default`` 互斥组。结果是「离家模式」激活后，回家开锁
的触发器被判为让位并消费冷却 —— 家里保持关灯 + 布防，下一次移动直接触发入侵告警。
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


class _Deps:
    """最小依赖桩：只实现被判为让位/激活所需的接口。"""

    def __init__(self, incoming: dict[str, Any], active: list[dict[str, Any]]) -> None:
        self.incoming = incoming
        self.active = active
        self.activate_calls: list[str] = []
        self.logs: list[str] = []
        self.warnings: list[str] = []

    async def get_active_modes(self) -> list[dict[str, Any]]:
        return self.active

    def get_trigger_cooldown_ms(self) -> int:
        return 0

    async def find_mode(self, mode_id: str) -> dict[str, Any] | None:
        return self.incoming if mode_id == self.incoming["id"] else None

    def log(self, message: str) -> None:
        self.logs.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    async def request_activate(self, mode_id: str, meta: dict[str, Any]) -> dict[str, Any]:
        self.activate_calls.append(mode_id)
        return {"success": True}


def _run(binding: HomeModeTriggerBinding, deps: _Deps) -> tuple[bool, _Deps]:
    state = HomeModeTriggersState()
    result = asyncio.run(_fire_triggered_home_mode(state, deps, binding, "测试"))
    return result, deps


class HomeModePriorityTest(unittest.TestCase):
    def _binding(self) -> HomeModeTriggerBinding:
        return HomeModeTriggerBinding(
            mode_id="home",
            mode_name="回家模式",
            trigger={"type": "lock_unlock", "entityId": "lock.da_men"},
        )

    def test_equal_priority_takes_over(self) -> None:
        incoming = {"id": "home", "name": "回家模式", "priority": 50, "exclusiveGroup": "default"}
        active = [{"id": "away", "name": "离家模式", "priority": 50, "exclusiveGroup": "default"}]
        result, deps = _run(self._binding(), _Deps(incoming, active))
        self.assertTrue(result)
        self.assertEqual(deps.activate_calls, ["home"])

    def test_missing_priority_defaults_are_equal(self) -> None:
        incoming = {"id": "home", "name": "回家模式"}
        active = [{"id": "away", "name": "离家模式"}]
        _, deps = _run(self._binding(), _Deps(incoming, active))
        self.assertEqual(deps.activate_calls, ["home"])

    def test_lower_priority_yields(self) -> None:
        incoming = {"id": "home", "name": "回家模式", "priority": 40}
        active = [{"id": "away", "name": "离家模式", "priority": 60}]
        _, deps = _run(self._binding(), _Deps(incoming, active))
        self.assertEqual(deps.activate_calls, [])

    def test_higher_priority_wins(self) -> None:
        incoming = {"id": "home", "name": "回家模式", "priority": 70}
        active = [{"id": "away", "name": "离家模式", "priority": 60}]
        _, deps = _run(self._binding(), _Deps(incoming, active))
        self.assertEqual(deps.activate_calls, ["home"])

    def test_other_exclusive_group_does_not_block(self) -> None:
        incoming = {"id": "home", "name": "回家模式", "priority": 10}
        active = [{"id": "sleep", "name": "睡眠模式", "priority": 90, "exclusiveGroup": "night"}]
        _, deps = _run(self._binding(), _Deps(incoming, active))
        self.assertEqual(deps.activate_calls, ["home"])


if __name__ == "__main__":
    unittest.main()
