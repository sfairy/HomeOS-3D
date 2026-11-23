#!/usr/bin/env python3
"""通知静音与免打扰自检：按来源静音、危险级穿透、DND 星期过滤。

为什么值得单独测：静音写错会产生**两类**严重后果 ——
- 过于宽松：静音了安防告警，真正的危险被吞掉；
- 过于严格：静音了模式切换却顺手静音了整类通知，用户以为「没配置」。
这里钉死「danger / 生命安全永不静音」与「前缀只按同族匹配」。
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from _selftest_support import FakeBus, check, ensure_repo_on_path, report

ensure_repo_on_path()

from homeos.backend.src.domains.alerts.dnd import is_dnd_active_now
from homeos.backend.src.domains.notification.dispatch import (
    NotificationDispatchHelper,
    _is_muted_source,
)


def make_helper(cfg: dict) -> tuple[NotificationDispatchHelper, FakeBus]:
    bus = FakeBus()
    helper = NotificationDispatchHelper(
        session_factory=lambda: None,
        event_bus=bus,
        get_cfg=lambda: cfg,
        schedule_prune=lambda: None,
        channels_service=None,
        get_timezone=lambda: "UTC",
        dedupe=None,
    )

    async def _build(meta):
        # 只验证「静音判定发生在入库之前」：这里给出一个最小 payload，避免触碰数据库。
        return {"id": "n1", "level": meta["level"], "source": meta["source"], "message": meta["message"]}

    helper._build_notification = _build
    return helper, bus


def test_source_matching() -> None:
    cfg = {"mutedSources": ["home-mode", "energy"]}
    check("精确命中", _is_muted_source(cfg, "home-mode") is True)
    check("同族前缀命中", _is_muted_source(cfg, "energy-anomaly") is True)
    check("不同族不命中", _is_muted_source(cfg, "security-alarm") is False)
    check("空来源不命中", _is_muted_source(cfg, "") is False)
    check("相似但不同族不命中（避免误伤）", _is_muted_source({"mutedSources": ["energy"]}, "energyx") is False)
    check("未配置时不静音", _is_muted_source({}, "home-mode") is False)
    check("非列表配置不静音", _is_muted_source({"mutedSources": "home-mode"}, "home-mode") is False)


def test_dispatch_mutes_info_but_not_danger() -> None:
    async def scenario():
        cfg = {"globalNotifyEnabled": True, "mutedSources": ["home-mode"]}
        helper, bus = make_helper(cfg)
        muted = await helper.notify("info", "切换到离家模式", "home-mode")
        check("被静音的来源不投递", muted is None, str(muted))
        check("也没有发事件", not bus.events, str(bus.events))

        danger_cfg = {"globalNotifyEnabled": True, "mutedSources": ["security"]}
        helper2, _bus2 = make_helper(danger_cfg)
        # danger 级永不静音：静音一个来源不能连带吞掉真正的告警
        result = await helper2.notify("danger", "燃气泄漏", "security")
        check("danger 级穿透静音", result is not None, str(result))

    asyncio.run(scenario())


def test_life_safety_passes_mute() -> None:
    async def scenario():
        cfg = {"globalNotifyEnabled": True, "mutedSources": ["energy"]}
        helper, _bus = make_helper(cfg)
        result = await helper.notify("warn", "生命安全的告警", "emergency")
        check("生命安全来源不受静音影响", result is not None, str(result))

    asyncio.run(scenario())


def test_voice_matrix() -> None:
    """语音播报矩阵按来源生效（否则那 14 个开关只是渲染出来的）。"""
    from homeos.backend.src.platform.core.runtime.voice_alert_keys import voice_alert_key

    check("用水告警映射到漏水播报", voice_alert_key("water-monitor", "danger") == "safetyWater")
    check("能耗异常映射到能耗播报", voice_alert_key("energy-anomaly", "warn") == "energyAnomaly")
    check("余额不足复用预算开关", voice_alert_key("energy-balance", "danger") == "energyBudget")
    check("环境健康映射到霉菌风险", voice_alert_key("environment-health", "warn") == "envMoldRisk")
    check("模式切换不参与语音播报", voice_alert_key("home-mode", "info") is None)
    check("未知来源的 danger 按危险通知播报", voice_alert_key("unknown", "danger") == "notificationDanger")


def test_announce_gated_by_matrix() -> None:
    """关掉开关后不再发 ``tts.speak``（这是「开关真的生效」的唯一可验证证据）。"""

    async def scenario():
        cfg = {
            "globalNotifyEnabled": True,
            "voice": {"ttsAlerts": {"enabled": True, "waterAnomaly": False}},
        }
        helper, bus = make_helper(cfg)
        await helper.notify("danger", "检测到漏水", "water")
        spoken = [name for name, _payload in bus.events if name == "tts.speak"]
        check("矩阵关闭时不播报", not spoken, str(bus.events))

        cfg2 = {
            "globalNotifyEnabled": True,
            "voice": {"ttsAlerts": {"enabled": True, "waterAnomaly": True}},
        }
        helper2, bus2 = make_helper(cfg2)
        await helper2.notify("danger", "检测到漏水", "water")
        spoken2 = [name for name, _payload in bus2.events if name == "tts.speak"]
        check("矩阵开启时播报", len(spoken2) == 1, str(bus2.events))

        cfg3 = {"globalNotifyEnabled": True, "voice": {"ttsAlerts": {"enabled": False}}}
        helper3, bus3 = make_helper(cfg3)
        await helper3.notify("danger", "检测到漏水", "water")
        check("总开关关闭时不播报", all(name != "tts.speak" for name, _ in bus3.events), str(bus3.events))

    asyncio.run(scenario())


def test_dnd_suppresses_speech() -> None:
    """免打扰要连语音一起停。

    语音播报同样是一种「打扰」。旧实现把播报放在 ``deferred`` 判断之前，
    静音时段的告警只会被拦下外部推送，却照样被念出来 —— 与用户按下「免打扰」的意图相反。
    """
    from datetime import UTC, datetime

    hour = datetime.now(UTC).hour
    cfg = {
        "globalNotifyEnabled": True,
        "dndStart": hour,
        "dndEnd": (hour + 1) % 24,
        "voice": {"ttsAlerts": {"enabled": True, "energyAnomaly": True}},
    }

    async def scenario():
        helper, bus = make_helper(cfg)
        # 用 warn 级验证：danger 本就刻意穿透免打扰（含语音），不是这条断言的场景。
        await helper.notify("warn", "能耗异常", "energy-anomaly")
        spoken = [name for name, _payload in bus.events if name == "tts.speak"]
        check("免打扰期间不播报", not spoken, str(bus.events))

    asyncio.run(scenario())


def test_hazard_voice_keys() -> None:
    """烟雾/燃气/漏水三个语音开关必须能被安防告警命中。

    安防告警的 ``source`` 恒为 ``security``（前端按它聚合筛选），而语音矩阵把三类危险
    拆成了独立开关。事件处理器会带 ``opts.voiceKey`` 覆盖来源映射 —— 这条断言钉住它，
    否则那三个开关又只是「渲染出来的」。
    """

    async def scenario():
        cfg = {"globalNotifyEnabled": True, "voice": {"ttsAlerts": {"enabled": True, "safetyGas": True}}}
        helper, bus = make_helper(cfg)
        await helper.notify("danger", "燃气泄漏", "security", None, {"bypassDnd": True, "voiceKey": "safetyGas"})
        check("voiceKey 覆盖来源映射后可播报", any(name == "tts.speak" for name, _ in bus.events), str(bus.events))

        cfg_off = {"globalNotifyEnabled": True, "voice": {"ttsAlerts": {"enabled": True, "safetyGas": False}}}
        helper2, bus2 = make_helper(cfg_off)
        await helper2.notify("danger", "燃气泄漏", "security", None, {"bypassDnd": True, "voiceKey": "safetyGas"})
        check("对应开关关闭时不播报", all(name != "tts.speak" for name, _ in bus2.events), str(bus2.events))

    asyncio.run(scenario())


def test_dnd_weekdays() -> None:
    # 2026-11-23 是周一（weekday=1，0=周日）
    monday = datetime(2026, 11, 23, 23, 30, tzinfo=UTC)
    base = {"dndStart": 22, "dndEnd": 8}
    check("未配置星期时每天生效", is_dnd_active_now(base, now=monday, timezone_name="UTC") is True)
    check(
        "只在周一生效时命中",
        is_dnd_active_now({**base, "dndWeekdays": [1]}, now=monday, timezone_name="UTC") is True,
    )
    check(
        "只在周末生效时不命中",
        is_dnd_active_now({**base, "dndWeekdays": [0, 6]}, now=monday, timezone_name="UTC") is False,
    )
    check(
        "非法星期数组回退为每天生效",
        is_dnd_active_now({**base, "dndWeekdays": ["x"]}, now=monday, timezone_name="UTC") is True,
    )


def main() -> int:
    test_source_matching()
    test_dispatch_mutes_info_but_not_danger()
    test_life_safety_passes_mute()
    test_voice_matrix()
    test_announce_gated_by_matrix()
    test_dnd_suppresses_speech()
    test_hazard_voice_keys()
    test_dnd_weekdays()
    report("通知静音")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
