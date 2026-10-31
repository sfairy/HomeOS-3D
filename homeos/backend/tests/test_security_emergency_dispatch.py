"""紧急求助派发的回归：状态标志同步置位、任务持强引用。

旧实现是裸 ``loop.create_task(...)``：任务对象没有任何强引用，CPython 里可能被 GC
直接回收 —— 丢掉的偏偏是「警笛 + 全屋灯亮」这条救命序列；而 ``_last_emergency_at``
已经写上了，冷却期还会把用户的重试挡回去。另外 ``_emergency_running`` 是在协程体里
才置位的，同一个 tick 里的第二次调用会照样回 ``queued: true``，然后被协程里的守卫
静默丢弃。
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

from src.domains.security import panel as panel_module
from src.domains.security.panel import SecurityPanelService
from src.platform.core.runtime import background


class _ConfigStub:
    def __init__(self, values: dict[str, Any]) -> None:
        self._values = values

    def get(self) -> dict[str, Any]:
        return self._values


class _BusStub:
    def __init__(self) -> None:
        self.emitted: list[tuple[str, dict[str, Any]]] = []

    async def emit(self, name: str, payload: dict[str, Any]) -> None:
        self.emitted.append((name, payload))


class _StateHelperStub:
    def __init__(self) -> None:
        self.events: list[tuple[str, str]] = []

    def schedule_security_event(self, event_type: str, detail: str, **_kwargs: Any) -> None:
        self.events.append((event_type, detail))


class _BlockingRunnerStub:
    """跑到 ``release`` 之前一直挂着，方便观察「任务已被调度」这一瞬间的状态。"""

    def __init__(self) -> None:
        self.release = asyncio.Event()
        self.calls = 0

    async def run_emergency_actions(self) -> None:
        self.calls += 1
        await self.release.wait()


def _panel(runner: Any) -> SecurityPanelService:
    panel = SecurityPanelService.__new__(SecurityPanelService)
    panel._emergency_running = False
    panel._last_emergency_at = 0
    panel._config = _ConfigStub({"emergencyCooldownSec": 0})
    panel._bus = _BusStub()
    panel.state_helper = _StateHelperStub()
    panel.emergency_runner = runner
    return panel


class EmergencyDispatchTest(unittest.TestCase):
    def test_flag_is_set_before_return_and_task_is_tracked(self) -> None:
        runner = _BlockingRunnerStub()
        panel = _panel(runner)

        async def scenario() -> tuple[dict[str, Any], dict[str, Any], bool, int]:
            first = await panel.trigger_emergency("panic")
            # 同一 tick 内的第二次调用必须被识别为「进行中」
            second = await panel.trigger_emergency("panic")
            running = panel._emergency_running
            tracked = len(background._tasks)
            for task in list(background._tasks):
                task.cancel()
            await asyncio.gather(*list(background._tasks), return_exceptions=True)
            return first, second, running, tracked

        first, second, running, tracked = asyncio.run(scenario())

        self.assertTrue(first["queued"])
        self.assertFalse(second["queued"])
        self.assertEqual(second["reason"], "in_progress")
        self.assertTrue(running, "状态标志必须在返回前同步置位")
        self.assertGreaterEqual(tracked, 1, "任务必须由 spawn_background 持强引用")

    def test_runner_failure_does_not_leak_running_flag(self) -> None:
        class _FailingRunner:
            async def run_emergency_actions(self) -> None:
                raise RuntimeError("HA 断连")

        panel = _panel(_FailingRunner())

        async def scenario() -> bool:
            await panel.trigger_emergency("panic")
            # 让被调度的任务跑完
            for _ in range(5):
                await asyncio.sleep(0)
            return panel._emergency_running

        self.assertFalse(asyncio.run(scenario()))

    def test_dispatch_uses_spawn_background(self) -> None:
        """回归级检查：不要再退回裸 ``create_task``。"""
        import inspect

        source = inspect.getsource(SecurityPanelService.trigger_emergency)
        self.assertIn("spawn_background(self._run_emergency())", source)
        self.assertNotIn(".create_task(", source)
        self.assertIs(panel_module.spawn_background, background.spawn_background)


if __name__ == "__main__":
    unittest.main()
