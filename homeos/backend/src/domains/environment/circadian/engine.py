"""昼夜节律照明：按太阳高度把已开的灯逐步调到符合时段的白光色温。

## 之前是什么状况

``circadian`` 分区只存了一个 ``weatherEntityId``，前端把它当成「统一天气实体」复用，
**没有任何调光逻辑**；而设置页却有一个「昼夜节律照明」入口。用户以为开了之后灯会跟着
日落变暖，实际什么都不会发生。

## 设计取舍（三条硬约束）

1. **绝不开灯**：只处理 ``state == "on"`` 的灯。半夜把卧室灯打开是最容易招致卸载的行为。
2. **默认不改亮度**：只调色温。亮度由用户/场景决定，节律调节亮度的收益远小于它带来的
   突兀感；需要时用 ``applyBrightness`` 显式开启。
3. **只动配置里点名的灯**：``lightEntityIds`` 为空时整段不执行 —— 全局改所有灯的色温
   会把用户精心调过的氛围灯一起毁掉。

色温插值用太阳高度（``sun.sun`` 的 ``elevation``）：它比「现在几点」更贴近真实昼夜，
跨季节不需要调参。-6°（民用暮光）到 +30° 之间线性插值，之外取端点。
"""

from __future__ import annotations

import logging
from typing import Any

from ....platform.core.runtime.periodic_monitor import PeriodicMonitor

logger = logging.getLogger("homeos.circadian.engine")

#: 太阳高度低于此值 → 完全夜间色温。
NIGHT_ELEVATION = -6.0
#: 太阳高度高于此值 → 完全日间色温。
DAY_ELEVATION = 30.0

#: 支持色温的 ``supported_color_modes`` 取值。
_COLOR_TEMP_MODES = frozenset({"color_temp", "color_temp_kelvin", "hs", "xy", "rgb", "rgbw", "rgbww"})

#: 色温变化小于此值就不下发：连续微调只会让灯频繁闪烁，用户看到的是「灯在抖」。
KELVIN_DEADBAND = 120


def supports_color_temp(attributes: dict[str, Any]) -> bool:
    """灯是否支持色温调节。

    判据是 ``supported_color_modes``（HA 的权威能力位）：

    - 上报了且**不含**色温模式 → 跳过（例如 ``onoff`` / 纯亮度灯，下发必定报错）；
    - 上报了且含色温模式 → 参与；
    - **没上报**（自研集成、状态里没有该属性）→ 仍然尝试一次。

    最后一条是刻意的：能力位缺失不等于不支持，静默跳过会让自研灯「配置了却毫无反应」，
    而真正不支持的灯在第一次失败后就会被 ``_applied`` + 死区挡住，不会反复刷日志。
    """
    modes = attributes.get("supported_color_modes")
    if isinstance(modes, list) and modes:
        return any(str(mode).lower() in _COLOR_TEMP_MODES for mode in modes)
    return True


def describe_circadian_config(cfg: dict[str, Any]) -> dict[str, Any]:
    try:
        day_kelvin = int(float(cfg.get("dayKelvin") or 5000))
    except (TypeError, ValueError):  # fmt: skip
        logger.debug("dayKelvin 非法，按 5000K 处理: %r", cfg.get("dayKelvin"))
        day_kelvin = 5000
    try:
        night_kelvin = int(float(cfg.get("nightKelvin") or 2700))
    except (TypeError, ValueError):  # fmt: skip
        logger.debug("nightKelvin 非法，按 2700K 处理: %r", cfg.get("nightKelvin"))
        night_kelvin = 2700
    try:
        night_brightness = int(float(cfg.get("nightBrightnessPct") or 30))
    except (TypeError, ValueError):  # fmt: skip
        logger.debug("nightBrightnessPct 非法，按 30%% 处理: %r", cfg.get("nightBrightnessPct"))
        night_brightness = 30
    raw_lights = cfg.get("lightEntityIds")
    lights = raw_lights if isinstance(raw_lights, list) else []
    return {
        "enabled": cfg.get("enabled") is not False,
        "lightEntityIds": [str(item).strip() for item in lights if str(item).strip().startswith("light.")],
        "dayKelvin": max(2000, min(10000, day_kelvin)),
        "nightKelvin": max(1800, min(6500, night_kelvin)),
        "applyBrightness": cfg.get("applyBrightness") is True,
        "nightBrightnessPct": max(1, min(100, night_brightness)),
    }


def target_kelvin(elevation: float | None, day_kelvin: int, night_kelvin: int) -> int:
    """按太阳高度插值目标色温（端点外取端点）。"""
    if elevation is None:
        # 读不到太阳高度时按「白天」处理：宁可贴近日间色温，也不要半夜突然变暖。
        return day_kelvin
    if elevation <= NIGHT_ELEVATION:
        return night_kelvin
    if elevation >= DAY_ELEVATION:
        return day_kelvin
    span = DAY_ELEVATION - NIGHT_ELEVATION
    ratio = (elevation - NIGHT_ELEVATION) / span
    return round(night_kelvin + (day_kelvin - night_kelvin) * ratio)


class CircadianEngine(PeriodicMonitor):
    """昼夜节律引擎（默认每 10 分钟一轮）。"""

    name = "circadian"

    def __init__(
        self,
        *,
        state_store: Any,
        app_config: Any,
        command_proxy: Any,
        interval_seconds: float = 600.0,
        boot_delay_seconds: float = 60.0,
    ) -> None:
        super().__init__(interval_seconds=interval_seconds, boot_delay_seconds=boot_delay_seconds)
        self._store = state_store
        self._config = app_config
        self._proxy = command_proxy
        self._applied: dict[str, int] = {}

    async def tick(self) -> None:
        cfg = describe_circadian_config(self._config.get("circadian") or {})
        if not cfg["enabled"] or not cfg["lightEntityIds"]:
            return
        sun = self._store.get("sun.sun")
        elevation = None
        if isinstance(sun, dict):
            attrs = sun.get("attributes")
            if isinstance(attrs, dict) and isinstance(attrs.get("elevation"), (int, float)):
                elevation = float(attrs["elevation"])
        kelvin = target_kelvin(elevation, cfg["dayKelvin"], cfg["nightKelvin"])
        for entity_id in cfg["lightEntityIds"]:
            entity = self._store.get(entity_id)
            if not isinstance(entity, dict) or str(entity.get("state") or "").lower() != "on":
                # 灯没开就什么都不做 —— 节律不能替用户开灯。
                continue
            attrs = entity.get("attributes") if isinstance(entity.get("attributes"), dict) else {}
            if not supports_color_temp(attrs):
                # 只有 RGB / 固定色温的灯收到 ``color_temp_kelvin`` 会直接报错。
                # 每轮重试一次没有意义，且会把日志刷满；这里直接跳过。
                continue
            current = attrs.get("color_temp_kelvin")
            if isinstance(current, (int, float)) and abs(float(current) - kelvin) < KELVIN_DEADBAND:
                continue
            if self._applied.get(entity_id) == kelvin:
                continue
            await self._apply(entity_id, kelvin, cfg)

    async def _apply(self, entity_id: str, kelvin: int, cfg: dict[str, Any]) -> None:
        data: dict[str, Any] = {"color_temp_kelvin": kelvin}
        if cfg["applyBrightness"]:
            data["brightness_pct"] = cfg["nightBrightnessPct"]
        try:
            await self._proxy.call_service(
                {
                    "domain": "light",
                    "service": "turn_on",
                    "entity_id": entity_id,
                    "service_data": data,
                    # 幂等键含色温：同色温重复不会重复下发，换色温则是新命令。
                    "idempotency_key": f"circadian:{kelvin}",
                },
                policy="http",
            )
        except Exception as error:
            # 单个灯的失败不影响其余灯；日志节流由 PeriodicMonitor 负责。
            logger.debug("昼夜节律下发失败: %s (%s)", entity_id, error)
            return
        self._applied[entity_id] = kelvin


__all__ = ["CircadianEngine", "describe_circadian_config", "supports_color_temp", "target_kelvin"]
