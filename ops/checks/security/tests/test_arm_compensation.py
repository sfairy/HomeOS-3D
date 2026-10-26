"""安防布防失败补偿（P0-5）的单元级回归。

为什么需要它：这条分支只有在「联动执行部分成功、部分失败」时才走到，而隔离/本地环境里
既没有真 HA、也没有配置好的联动动作 —— 端到端只能观测到 `executed=0 / failed=0` 的正常
路径（见 `ops/perf/manual-baseline.md` B3）。半布防状态是最不能靠人肉试的路径，所以这里
用假的联动 helper 直接把三种语义钉住：

1. 有失败 → 必须补偿已执行的联动，且如实返回 `success=false / degraded=true`；
2. 补偿也失败 → 二次告警，绝不静默（`arm_compensation_failed`）；
3. 全部成功 → 直接提交模式，不触发补偿。
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"

# 后端是 `python -m src.run` 的 `src` 包（`src.platform.*` / `src.domains.*`），
# 把 `homeos/backend` 放进 path 即可；不要把 `src` 本身放进去 —— 那样后端自己的
# `platform` 包会遮住 stdlib 的 `platform`，第三方库在导入期就会崩。
sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.security.panel import SecurityPanelService


class FakeBus:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []
        self.handlers: dict[str, list[Any]] = {}

    async def emit(self, name: str, payload: dict[str, Any]) -> None:
        self.events.append((name, payload))

    def emit_soon(self, name: str, payload: dict[str, Any]) -> None:
        self.events.append((name, payload))

    def on(self, name: str, handler: Any) -> None:
        self.handlers.setdefault(name, []).append(handler)

    def off(self, name: str, handler: Any) -> None:
        self.handlers.get(name, []).remove(handler)


class FakeConfigProvider:
    def get(self) -> dict[str, Any]:
        return {}

    def refresh(self) -> None:
        return None


class FakeStateHelper:
    def __init__(self, persisted: bool = True) -> None:
        self.events: list[tuple[str, str, dict[str, Any]]] = []
        self.persisted = persisted

    def schedule_security_event(self, kind: str, message: str, **kwargs: Any) -> None:
        self.events.append((kind, message, kwargs))

    def persist_panel_state(self) -> bool:
        return self.persisted

    async def load_persisted_state(self) -> None:
        return None

    def kind_names(self) -> list[str]:
        return [event[0] for event in self.events]


class FakeLinkageHelper:
    """按预设返回联动结果；记录补偿调用，供断言。"""

    def __init__(
        self, action_result: dict[str, Any], compensation: dict[str, Any] | None = None
    ) -> None:
        self.action_result = action_result
        self.compensation = compensation or {"restored": 0, "failed": 0, "failedItems": []}
        self.compensated: list[tuple[list[dict[str, Any]], str]] = []

    async def execute_security_mode_actions(self, mode: str) -> dict[str, Any]:
        return self.action_result

    async def compensate_applied_actions(
        self, applied_items: list[dict[str, Any]], reason: str
    ) -> dict[str, Any]:
        self.compensated.append((applied_items, reason))
        return self.compensation


@dataclass
class Harness:
    """持有服务与假 helper。服务属性是具体类型，替身必须经 `cast` 塞进去。"""

    panel: SecurityPanelService
    state: FakeStateHelper = field(default_factory=FakeStateHelper)
    linkages: list[FakeLinkageHelper] = field(default_factory=list)

    def use_linkage(
        self, action_result: dict[str, Any], compensation: dict[str, Any] | None = None
    ) -> FakeLinkageHelper:
        helper = FakeLinkageHelper(action_result, compensation)
        self.panel.linkage_helper = cast(Any, helper)
        self.linkages.append(helper)
        return helper


def build_panel(*, zones: int = 2) -> Harness:
    state = FakeStateHelper()
    panel = SecurityPanelService(
        session_factory=cast(Any, lambda: None),
        ha_connector=cast(Any, None),
        bus=cast(Any, FakeBus()),
        cooldown=cast(Any, None),
        config_provider=cast(Any, FakeConfigProvider()),
    )
    panel._zones = [
        {"id": f"zone-{index}", "name": f"区域{index}", "sensors": [], "armed": False}
        for index in range(zones)
    ]
    panel._mode = "disarmed"
    panel.state_helper = cast(Any, state)
    return Harness(panel=panel, state=state)


FAILED_ACTION_RESULT = {
    "executed": 2,
    "failed": 1,
    "failedItems": [{"entityId": "lock.da_men", "error": "unavailable"}],
    "appliedItems": [{"entityId": "switch.water_valve", "service": "turn_off"}],
    "irreversibleItems": [],
}


class ArmCompensationTest(unittest.TestCase):
    def test_partial_failure_compensates_and_reports_honestly(self) -> None:
        harness = build_panel()
        linkage = harness.use_linkage(
            FAILED_ACTION_RESULT, {"restored": 1, "failed": 0, "failedItems": []}
        )

        result = asyncio.run(harness.panel.arm("armed_away"))

        self.assertFalse(result["success"])
        self.assertTrue(result["degraded"])
        self.assertEqual(result["requestedMode"], "armed_away")
        self.assertEqual(result["compensated"], 1)
        self.assertEqual(result["failedItems"], FAILED_ACTION_RESULT["failedItems"])
        # 补偿必须针对「已经执行成功」的那些动作，而不是全部动作。
        self.assertEqual(len(linkage.compensated), 1)
        self.assertEqual(linkage.compensated[0][0], FAILED_ACTION_RESULT["appliedItems"])
        # 模式不提交：面板留在切换前的状态，不能假装布防成功。
        self.assertEqual(harness.panel.get_mode(), "disarmed")
        self.assertFalse(any(zone["armed"] for zone in harness.panel.get_zones()))
        self.assertIn("arm_failed", harness.state.kind_names())

    def test_compensation_failure_is_reported_a_second_time(self) -> None:
        harness = build_panel()
        harness.use_linkage(
            FAILED_ACTION_RESULT,
            {
                "restored": 0,
                "failed": 1,
                "failedItems": [{"entityId": "switch.water_valve", "error": "timeout"}],
            },
        )

        result = asyncio.run(harness.panel.arm("armed_away"))

        self.assertFalse(result["success"])
        self.assertEqual(
            result["compensationFailures"], [{"entityId": "switch.water_valve", "error": "timeout"}]
        )
        kinds = harness.state.kind_names()
        self.assertIn("arm_failed", kinds)
        self.assertIn("arm_compensation_failed", kinds)
        self.assertEqual(harness.panel.get_mode(), "disarmed")

    def test_success_commits_without_compensation(self) -> None:
        harness = build_panel(zones=3)
        linkage = harness.use_linkage(
            {
                "executed": 2,
                "failed": 0,
                "failedItems": [],
                "appliedItems": [{"entityId": "switch.water_valve", "service": "turn_off"}],
                "irreversibleItems": [],
            }
        )

        result = asyncio.run(harness.panel.arm("armed_away"))

        self.assertTrue(result["success"])
        self.assertFalse(result["degraded"])
        self.assertTrue(result["persisted"])
        self.assertEqual(harness.panel.get_mode(), "armed_away")
        self.assertEqual(sum(1 for zone in harness.panel.get_zones() if zone["armed"]), 3)
        self.assertEqual(linkage.compensated, [])
        self.assertEqual(harness.state.kind_names(), ["arm"])

    def test_disarm_reports_degraded_without_claiming_success(self) -> None:
        harness = build_panel()
        harness.panel._mode = "armed_away"
        for zone in harness.panel._zones:
            zone["armed"] = True
        harness.use_linkage(
            {
                "executed": 1,
                "failed": 1,
                "failedItems": [{"entityId": "switch.water_valve", "error": "unavailable"}],
                "appliedItems": [],
            }
        )

        result = asyncio.run(harness.panel.disarm())

        self.assertEqual(result["mode"], "disarmed")
        self.assertTrue(result["degraded"])
        self.assertFalse(result["success"])
        self.assertEqual(harness.panel.get_mode(), "disarmed")


if __name__ == "__main__":
    unittest.main()
