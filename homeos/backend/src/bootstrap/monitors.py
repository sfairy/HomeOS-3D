"""业务监测服务的装配（用水 / 用能 / IAQ / 昼夜节律 / 设备倒计时）。

从 ``lifespan`` 拆出来的理由与 :mod:`bootstrap.energy_wiring` 相同：``lifespan`` 是受文件
规模棘轮约束的超长文件，而这一组服务有**共同的前置条件**（状态仓 + 配置 + 事件总线 +
冷却已经就绪），放在一起才看得出它们必须同时满足。

装配失败只降级对应功能：某个监测器起不来不该让整机启动失败（那是「少个告警」而不是
「用不了」），但必须有明确的错误日志 —— 静默跳过等于又造出一个「配置里有、功能不存在」。
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("homeos.bootstrap.monitors")


def build_monitors(app: Any, startup: Any) -> dict[str, Any]:
    """构造（不启动）四个监测器与三个按需服务，挂到 ``app.state``。"""
    from ..domains.circadian.engine import CircadianEngine
    from ..domains.device_timer.service import DeviceTimerService
    from ..domains.energy.monitor import EnergyMonitor
    from ..domains.iaq.monitor import IaqMonitor
    from ..domains.water.monitor import WaterMonitor
    from ..domains.water.usage import WaterUsageStore
    from ..domains.water.valve import WaterValveService

    database = app.state.database
    state_store = startup.state_store
    bus = startup.security_bus
    cooldown = startup.cooldown
    config = startup.app_config
    notification = getattr(startup, "notification", None)
    # 通知在 channels_notification 阶段才装配，监测器在之后启动时再取一次。
    notification = getattr(app.state, "notification", None) or notification

    usage_store = WaterUsageStore(database.session_factory)
    app.state.water_usage = usage_store

    monitors: dict[str, Any] = {}
    try:
        monitors["water_monitor"] = WaterMonitor(
            state_store=state_store,
            app_config=config,
            event_bus=bus,
            cooldown=cooldown,
            presence=getattr(startup, "presence", None),
            usage=usage_store,
        )
    except Exception:
        logger.warning("用水监测器构造失败，用水安全功能不可用", exc_info=True)
    try:
        monitors["energy_monitor"] = EnergyMonitor(
            database=database,
            state_store=state_store,
            app_config=config,
            event_bus=bus,
            cooldown=cooldown,
            primary_entities=startup.event_log_service.energy_primary_entities,
        )
    except Exception:
        logger.warning("用能监测器构造失败，能耗异常/预算告警不可用", exc_info=True)
    try:
        monitors["iaq_monitor"] = IaqMonitor(
            state_store=state_store,
            app_config=config,
            event_bus=bus,
            cooldown=cooldown,
        )
    except Exception:
        logger.warning("室内环境监测器构造失败，霉菌/IAQ 告警不可用", exc_info=True)
    try:
        monitors["circadian"] = CircadianEngine(
            state_store=state_store,
            app_config=config,
            command_proxy=app.state.command_proxy,
        )
    except Exception:
        logger.warning("昼夜节律引擎构造失败（不影响其它功能）", exc_info=True)

    # 按需服务（随请求使用，不需要后台循环）。
    app.state.water_valve = WaterValveService(
        app_config=config,
        command_proxy=app.state.command_proxy,
        session_factory=database.session_factory,
        notification=notification,
        event_bus=bus,
    )
    app.state.device_timer = DeviceTimerService(
        database=database,
        command_proxy=app.state.command_proxy,
        notification=notification,
        event_bus=bus,
    )

    for name, service in monitors.items():
        setattr(app.state, name, service)
    return monitors


def diagnostics(app: Any) -> dict[str, Any]:
    """监测器存活状态（排错用：一眼看出「告警为什么没响」）。"""
    out: dict[str, Any] = {}
    for name in ("water_monitor", "energy_monitor", "iaq_monitor", "circadian"):
        service = getattr(app.state, name, None)
        probe = getattr(service, "diagnostics", None)
        out[name] = probe() if callable(probe) else None
    timer = getattr(app.state, "device_timer", None)
    out["device_timer"] = {"tasks": len(getattr(timer, "_tasks", {}) or {}) if timer is not None else None}
    return out


__all__ = ["build_monitors", "diagnostics"]
