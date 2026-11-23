#!/usr/bin/env python3
"""昼夜节律自检：色温插值 +「绝不开灯」硬约束。

最需要钉死的一条是**绝不开灯**：节律引擎只处理已经亮着的灯，半夜把卧室灯打开是这类
功能最容易招致卸载的行为。其次是不改亮度（除非显式开启）与只处理配置里点名的灯。
"""

from __future__ import annotations

import asyncio

from _selftest_support import FakeSectionConfig, FakeStore, check, ensure_repo_on_path, report

ensure_repo_on_path()

from homeos.backend.src.domains.circadian.engine import (
    DAY_ELEVATION,
    NIGHT_ELEVATION,
    CircadianEngine,
    describe_circadian_config,
    target_kelvin,
)


class FakeProxy:
    """记录下发的假命令代理（只关心 ``light.turn_on`` 的参数）。"""

    def __init__(self, fail: bool = False) -> None:
        self.calls: list[tuple[dict, str]] = []
        self.fail = fail

    async def call_service(self, dto, *, policy="http"):
        if self.fail:
            raise RuntimeError("HA 拒绝")
        self.calls.append((dto, policy))
        return {"success": True}


def light(entity_id, state="on", kelvin=None):
    attrs = {"friendly_name": entity_id}
    if kelvin is not None:
        attrs["color_temp_kelvin"] = kelvin
    return {"entity_id": entity_id, "state": state, "attributes": attrs}


def build(entities, cfg, proxy=None):
    proxy = proxy or FakeProxy()
    engine = CircadianEngine(
        state_store=FakeStore(entities),
        app_config=FakeSectionConfig("circadian", cfg),
        command_proxy=proxy,
    )
    return engine, proxy


def test_target_kelvin() -> None:
    check("夜间端点取夜间色温", target_kelvin(NIGHT_ELEVATION, 5000, 2700) == 2700)
    check("日间端点取日间色温", target_kelvin(DAY_ELEVATION, 5000, 2700) == 5000)
    check("读不到太阳高度按白天处理", target_kelvin(None, 5000, 2700) == 5000)
    middle = target_kelvin(0.0, 5000, 2700)
    check("中间高度落在两端之间", 2700 < middle < 5000, str(middle))


def test_never_turns_on_light() -> None:
    cfg = {"lightEntityIds": ["light.bed"], "dayKelvin": 5000, "nightKelvin": 2700}
    entities = {
        "sun.sun": {"entity_id": "sun.sun", "attributes": {"elevation": 40}},
        "light.bed": light("light.bed", state="off"),
    }
    engine, proxy = build(entities, cfg)
    asyncio.run(engine.tick())
    check("关着的灯不收到任何命令", not proxy.calls, str(proxy.calls))


def test_only_listed_lights() -> None:
    cfg = {"lightEntityIds": ["light.bed"], "dayKelvin": 5000, "nightKelvin": 2700}
    entities = {
        "sun.sun": {"entity_id": "sun.sun", "attributes": {"elevation": -20}},
        "light.bed": light("light.bed"),
        "light.mood": light("light.mood"),
    }
    engine, proxy = build(entities, cfg)
    asyncio.run(engine.tick())
    targets = [dto["entity_id"] for dto, _policy in proxy.calls]
    check("只调整配置里点名的灯", targets == ["light.bed"], str(targets))
    check("夜间下发夜间色温", proxy.calls[0][0]["service_data"]["color_temp_kelvin"] == 2700, str(proxy.calls[0][0]))


def test_brightness_only_when_enabled() -> None:
    cfg = {"lightEntityIds": ["light.bed"], "dayKelvin": 5000, "nightKelvin": 2700}
    entities = {"sun.sun": {"entity_id": "sun.sun", "attributes": {"elevation": -20}}, "light.bed": light("light.bed")}
    engine, proxy = build(entities, cfg)
    asyncio.run(engine.tick())
    data = proxy.calls[0][0]["service_data"]
    check("默认不改亮度", "brightness_pct" not in data, str(data))

    cfg2 = {**cfg, "applyBrightness": True, "nightBrightnessPct": 20}
    engine2, proxy2 = build(entities, cfg2)
    asyncio.run(engine2.tick())
    data2 = proxy2.calls[0][0]["service_data"]
    check("显式开启后才改亮度", data2.get("brightness_pct") == 20, str(data2))


def test_skips_lights_without_color_temp() -> None:
    """只有 RGB / 固定色温的灯收 ``color_temp_kelvin`` 会直接报错，必须跳过。"""
    cfg = {"lightEntityIds": ["light.fixed"], "dayKelvin": 5000, "nightKelvin": 2700}
    entities = {
        "sun.sun": {"entity_id": "sun.sun", "attributes": {"elevation": -20}},
        "light.fixed": {
            "entity_id": "light.fixed",
            "state": "on",
            "attributes": {"supported_color_modes": ["onoff"]},
        },
    }
    engine, proxy = build(entities, cfg)
    asyncio.run(engine.tick())
    check("显式声明 onoff 的灯不下发", not proxy.calls, str(proxy.calls))

    entities["light.fixed"]["attributes"] = {"supported_color_modes": ["color_temp"]}
    engine2, proxy2 = build(entities, cfg)
    asyncio.run(engine2.tick())
    check("声明支持色温的灯正常下发", len(proxy2.calls) == 1, str(proxy2.calls))

    # 没上报能力位（自研集成）→ 仍然尝试：静默跳过会让「配了却没反应」难以排查。
    entities["light.fixed"]["attributes"] = {}
    engine3, proxy3 = build(entities, cfg)
    asyncio.run(engine3.tick())
    check("未上报能力位时按尝试处理", len(proxy3.calls) == 1, str(proxy3.calls))


def test_deadband_skips_noop() -> None:
    cfg = {"lightEntityIds": ["light.bed"], "dayKelvin": 5000, "nightKelvin": 2700}
    entities = {
        "sun.sun": {"entity_id": "sun.sun", "attributes": {"elevation": -20}},
        "light.bed": light("light.bed", kelvin=2750),
    }
    engine, proxy = build(entities, cfg)
    asyncio.run(engine.tick())
    check("色温差在死区内不下发", not proxy.calls, str(proxy.calls))


def test_no_lights_configured() -> None:
    cfg = {"lightEntityIds": [], "dayKelvin": 5000, "nightKelvin": 2700}
    entities = {"sun.sun": {"entity_id": "sun.sun", "attributes": {"elevation": -20}}, "light.bed": light("light.bed")}
    engine, proxy = build(entities, cfg)
    asyncio.run(engine.tick())
    check("未配置灯时整段不执行", not proxy.calls, str(proxy.calls))


def test_failure_isolated() -> None:
    cfg = {"lightEntityIds": ["light.a", "light.b"], "dayKelvin": 5000, "nightKelvin": 2700}
    entities = {
        "sun.sun": {"entity_id": "sun.sun", "attributes": {"elevation": -20}},
        "light.a": light("light.a"),
        "light.b": light("light.b"),
    }
    engine, _proxy = build(entities, cfg, proxy=FakeProxy(fail=True))
    asyncio.run(engine.tick())
    check("下发失败不抛出（由 PeriodicMonitor 节流记录）", True)


def test_config_normalization() -> None:
    cfg = describe_circadian_config({"lightEntityIds": ["light.a", "switch.b", ""], "dayKelvin": "99999"})
    check("只接受 light.* 实体", cfg["lightEntityIds"] == ["light.a"], str(cfg))
    check("日间色温上限 10000K", cfg["dayKelvin"] == 10000, str(cfg))


def main() -> int:
    test_target_kelvin()
    test_never_turns_on_light()
    test_only_listed_lights()
    test_brightness_only_when_enabled()
    test_skips_lights_without_color_temp()
    test_deadband_skips_noop()
    test_no_lights_configured()
    test_failure_isolated()
    test_config_normalization()
    report("昼夜节律")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
