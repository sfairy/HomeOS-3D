"""安防 P0/P1 回归：状态机、危险告警 fail-safe、Frigate 去重、紧急求助配置来源。

这些路径在隔离环境里很难手工复现（需要特定时序的 HA 事件、多项目布局切换），
所以用假 helper 把语义钉住：

1. 同模式换防区必须重算，0 区域必须拒绝布防；
2. 危险告警即使在旧「演习模式」标记下也必须关阀 / 排风；数值表计必须显式阈值；
3. Frigate 撤防期间的检测不能消费去重窗口；
4. 紧急求助读取当前激活项目的布局，非法 mode 回退默认。
"""

from __future__ import annotations

import asyncio
import time
import unittest
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"

# 后端是 `python -m src.run` 的 `src` 包；只把 backend 根目录放进 path。
import sys

sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.security import panel_helpers
from src.domains.security.frigate import FrigateService
from src.domains.security.panel import SecurityPanelService
from src.domains.security.panel_helpers import (
    SecurityAlarmHelper,
    SecurityEmergencyRunnerHelper,
    normalize_security_emergency,
)
from src.platform.core.http.errors import BusinessException


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

    def names(self) -> list[str]:
        return [name for name, _ in self.events]


class FakeConfigProvider:
    def __init__(self, values: dict[str, Any] | None = None) -> None:
        self.values = values or {}

    def get(self) -> dict[str, Any]:
        return self.values

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


OK_ACTIONS = {
    "executed": 1,
    "failed": 0,
    "failedItems": [],
    "appliedItems": [],
    "irreversibleItems": [],
}


class FakeLinkageHelper:
    def __init__(self, result: dict[str, Any] | None = None) -> None:
        self.result = result or dict(OK_ACTIONS)
        self.calls: list[tuple[str, set[str] | None]] = []

    async def execute_security_mode_actions(
        self, mode: str, skip_domains: set[str] | None = None
    ) -> dict[str, Any]:
        self.calls.append((mode, skip_domains))
        return dict(self.result)

    async def compensate_applied_actions(
        self, applied_items: list[dict[str, Any]], reason: str
    ) -> dict[str, Any]:
        return {"restored": 0, "failed": 0, "failedItems": []}


def build_panel(*, zones: int = 2, mode: str = "disarmed") -> tuple[SecurityPanelService, FakeStateHelper, FakeBus]:
    state = FakeStateHelper()
    bus = FakeBus()
    panel = SecurityPanelService(
        session_factory=cast(Any, lambda: None),
        ha_connector=cast(Any, None),
        bus=cast(Any, bus),
        cooldown=cast(Any, None),
        config_provider=cast(Any, FakeConfigProvider()),
    )
    panel._zones = [
        {
            "id": f"zone-{index}",
            "name": f"区域{index}",
            "sensors": [],
            "armed": mode != "disarmed",
            "zoneType": "all",
        }
        for index in range(zones)
    ]
    panel._mode = mode
    panel.state_helper = cast(Any, state)
    panel.linkage_helper = cast(Any, FakeLinkageHelper())
    return panel, state, bus


class ArmStateMachineTest(unittest.TestCase):
    def test_same_mode_with_new_zone_selection_recalculates(self) -> None:
        panel, _state, bus = build_panel()
        asyncio.run(panel.arm("armed_home", ["zone-0"]))
        first = {z["id"]: z["armed"] for z in panel.get_zones()}
        self.assertEqual(first, {"zone-0": True, "zone-1": False})

        result = asyncio.run(panel.arm("armed_home", ["zone-1"]))

        self.assertFalse(result.get("skipped"))
        self.assertEqual(
            {z["id"]: z["armed"] for z in panel.get_zones()},
            {"zone-0": False, "zone-1": True},
        )
        self.assertEqual(bus.names().count("security.modeChanged"), 2)

    def test_arm_with_zero_zones_is_rejected(self) -> None:
        panel, _state, _bus = build_panel(zones=0)
        with self.assertRaises(BusinessException):
            asyncio.run(panel.arm("armed_away"))
        self.assertEqual(panel.get_mode(), "disarmed")

    def test_configure_zones_empty_requires_explicit_confirm(self) -> None:
        panel, _state, _bus = build_panel()
        with self.assertRaises(BusinessException):
            asyncio.run(panel.configure_zones([]))
        self.assertEqual(len(panel.get_zones()), 2)

        asyncio.run(panel.configure_zones([], confirm_clear=True))
        self.assertEqual(panel.get_zones(), [])

    def test_new_zone_inherits_current_armed_mode(self) -> None:
        panel, _state, _bus = build_panel()
        asyncio.run(panel.arm("armed_home", ["zone-0"]))
        asyncio.run(
            panel.configure_zones(
                [
                    {"id": "zone-0", "name": "客厅", "sensors": [], "zoneType": "all"},
                    {"id": "zone-2", "name": "书房", "sensors": [], "zoneType": "all"},
                ],
                confirm_clear=False,
            )
        )
        armed = {z["id"]: z["armed"] for z in panel.get_zones()}
        self.assertTrue(armed["zone-0"])
        # 新区域必须继承当前布防模式，否则「已布防 + 新区域永不告警」。
        self.assertTrue(armed["zone-2"])


@dataclass
class FakeHA:
    calls: list[tuple[str, str, str]] = field(default_factory=list)
    connected: bool = True

    async def call_service_via_rest(self, domain: str, service: str, entity_id: str, data: Any = None) -> None:
        self.calls.append((domain, service, entity_id))

    async def call_service(self, domain: str, service: str, entity_id: str, data: Any = None) -> None:
        self.calls.append((domain, service, entity_id))

    async def get_status(self) -> dict[str, Any]:
        return {"connected": self.connected}

    async def fetch_entities_by_domain(self, domain: str) -> list[dict[str, Any]]:
        return []


def build_alarm_helper(
    *,
    config: dict[str, Any] | None = None,
    mode: str = "armed_away",
    zones: list[dict[str, Any]] | None = None,
    armed_at: int | None = None,
) -> tuple[SecurityAlarmHelper, FakeHA, FakeStateHelper, FakeBus]:
    ha = FakeHA()
    state = FakeStateHelper()
    bus = FakeBus()
    helper = SecurityAlarmHelper(
        session_factory=cast(Any, lambda: None),
        bus=cast(Any, bus),
        ha_connector=cast(Any, ha),
        state_helper=cast(Any, state),
        config_reader=lambda: config or {},
        get_current_mode=lambda: mode,
        get_zones=lambda: zones or [],
        get_armed_at=lambda: armed_at,
        is_zone_alarm_in_cooldown=lambda _zone_id: False,
        set_zone_alarm_cooldown=lambda _zone_id, _minutes: None,
    )
    return helper, ha, state, bus


HAZARD_LAYOUT = {
    "haConfig": {
        "hazardGasEntityIds": ["binary_sensor.gas_leak", "sensor.gas_meter"],
        "hazardGasValveEntityId": "valve.gas_main",
        "hazardExhaustFanEntityIds": "fan.exhaust",
        "hazardNumericThresholds": {"sensor.gas_meter": 5.0},
        # 旧版持久演习开关：必须不再拦截真实告警。
        "hazardDrillMode": True,
    }
}


class HazardFailSafeTest(unittest.TestCase):
    def _run(self, helper: SecurityAlarmHelper, entity_id: str, old: Any, new: Any) -> None:
        with patch.object(
            panel_helpers,
            "load_active_project_layout",
            lambda _sf: ("default", HAZARD_LAYOUT),
        ):
            asyncio.run(
                helper.handle_safety_sensor(
                    {
                        "entity_id": entity_id,
                        "old_state": {"state": old} if old is not None else None,
                        "new_state": {"state": new, "attributes": {}},
                    }
                )
            )

    def _run_trigger(
        self, helper: SecurityAlarmHelper, entity_id: str, old: Any, new: Any
    ) -> None:
        asyncio.run(
            helper.handle_sensor_trigger(
                {
                    "entity_id": entity_id,
                    "old_state": {"state": old} if old is not None else None,
                    "new_state": {"state": new, "attributes": {}},
                }
            )
        )

    def test_real_gas_alarm_still_closes_valve_despite_legacy_drill_flag(self) -> None:
        helper, ha, state, bus = build_alarm_helper()
        self._run(helper, "binary_sensor.gas_leak", "off", "on")

        self.assertIn(("valve", "turn_off", "valve.gas_main"), ha.calls)
        self.assertIn(("fan", "turn_on", "fan.exhaust"), ha.calls)
        self.assertIn("security.alarm", bus.names())
        self.assertIn("hazard", state.kind_names())

    def test_numeric_meter_below_threshold_does_not_act(self) -> None:
        helper, ha, state, _bus = build_alarm_helper()
        self._run(helper, "sensor.gas_meter", "0.01", "0.05")

        self.assertEqual(ha.calls, [])
        self.assertEqual(state.kind_names(), [])

    def test_numeric_meter_above_threshold_acts(self) -> None:
        helper, ha, _state, _bus = build_alarm_helper()
        self._run(helper, "sensor.gas_meter", "0.01", "6.0")

        self.assertIn(("valve", "turn_off", "valve.gas_main"), ha.calls)

    def test_exit_grace_covers_all_sensor_types(self) -> None:
        now_ms = int(time.time() * 1000)
        helper, _ha, state, bus = build_alarm_helper(
            config={"armExitGraceSeconds": 30},
            armed_at=now_ms,
            zones=[{"id": "z1", "name": "门厅", "zoneType": "all", "armed": True, "sensors": ["binary_sensor.front_door"]}],
        )
        self._run_trigger(helper, "binary_sensor.front_door", "off", "on")

        self.assertNotIn("security.alarm", bus.names())
        self.assertEqual(state.kind_names(), [])

    def test_alarm_fires_after_exit_grace_expires(self) -> None:
        helper, _ha, state, bus = build_alarm_helper(
            config={"armExitGraceSeconds": 30},
            armed_at=int(time.time() * 1000) - 60_000,
            zones=[{"id": "z1", "name": "门厅", "zoneType": "all", "armed": True, "sensors": ["binary_sensor.front_door"]}],
        )
        self._run_trigger(helper, "binary_sensor.front_door", "off", "on")

        self.assertIn("security.alarm", bus.names())
        self.assertIn("alarm", state.kind_names())


class FakePanelMode:
    def __init__(self, mode: str = "disarmed") -> None:
        self.mode = mode

    def get_mode(self) -> str:
        return self.mode


class FrigateDedupTest(unittest.TestCase):
    def test_detection_while_disarmed_does_not_consume_dedup_window(self) -> None:
        bus = FakeBus()
        panel = FakePanelMode("disarmed")
        service = FrigateService(
            session_factory=cast(Any, lambda: None),
            bus=cast(Any, bus),
            panel=cast(Any, panel),
            config_reader=lambda: {
                "frigateDedupMs": 30_000,
                "frigatePersonAlarmModes": "armed_away",
            },
        )
        attrs = {"friendly_name": "Driveway Person", "device_class": "person", "confidence": 90}

        with patch("src.domains.security.layout.schedule_security_event_silent"):
            asyncio.run(service._process_detection("binary_sensor.frigate_driveway_person", attrs))
            self.assertNotIn("security.alarm", bus.names())

            panel.mode = "armed_away"
            asyncio.run(service._process_detection("binary_sensor.frigate_driveway_person", attrs))
            alarms = [payload for name, payload in bus.events if name == "security.alarm"]
            self.assertEqual(len(alarms), 1)
            self.assertEqual(alarms[0]["type"], "frigate_person")
            self.assertEqual(alarms[0]["source"], "frigate")

            # 真告警之后去重窗口才生效：立刻再来一帧不应重复告警。
            asyncio.run(service._process_detection("binary_sensor.frigate_driveway_person", attrs))
            self.assertEqual(
                len([name for name, _ in bus.events if name == "security.alarm"]), 1
            )


class FakeArm:
    def __init__(self) -> None:
        self.calls: list[tuple[str, list[str] | None, dict[str, Any]]] = []

    async def __call__(self, mode: str, zone_ids: list[str] | None, opts: dict[str, Any]) -> dict[str, Any]:
        self.calls.append((mode, zone_ids, opts))
        return {"success": True}


class EmergencyLayoutTest(unittest.TestCase):
    def _runner(self) -> tuple[SecurityEmergencyRunnerHelper, FakeArm]:
        arm = FakeArm()
        runner = SecurityEmergencyRunnerHelper(
            session_factory=cast(Any, lambda: None),
            bus=cast(Any, FakeBus()),
            ha_connector=cast(Any, FakeHA()),
            linkage=cast(Any, FakeLinkageHelper()),
            arm=cast(Any, arm),
        )
        return runner, arm

    def test_reads_active_project_not_hardcoded_default(self) -> None:
        runner, _arm = self._runner()
        layout = {
            "awaySimulationLightPool": ["light.hall"],
            "securityEmergency": {"mode": "key_areas", "autoArmAway": False},
        }
        with patch.object(
            panel_helpers,
            "load_active_project_layout",
            lambda _sf: ("proj-2", layout),
        ):
            cfg, pool = asyncio.run(runner.load_emergency_layout())

        self.assertEqual(cfg["mode"], "key_areas")
        self.assertEqual(pool, ["light.hall"])

    def test_invalid_mode_falls_back_to_default(self) -> None:
        cfg = normalize_security_emergency({"mode": "panic_everything"})
        self.assertEqual(cfg["mode"], "full_home")

    def test_auto_arm_skips_only_siren_and_light_domains(self) -> None:
        runner, arm = self._runner()
        layout = {"securityEmergency": {"mode": "notify_only", "autoArmAway": True}}
        with patch.object(
            panel_helpers,
            "load_active_project_layout",
            lambda _sf: ("default", layout),
        ):
            asyncio.run(runner.run_emergency_actions())

        self.assertEqual(len(arm.calls), 1)
        _mode, _zones, opts = arm.calls[0]
        self.assertEqual(set(opts.get("skipActionDomains") or []), {"siren", "light"})
        self.assertNotIn("skipActions", opts)


if __name__ == "__main__":
    unittest.main()
