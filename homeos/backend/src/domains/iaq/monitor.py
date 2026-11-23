"""室内环境监测：霉菌风险（按房间湿度）与 IAQ 阈值。

## 之前是什么状况

``iaq`` 分区只有 ``moldAlertCooldownMin``，而通知端挂了 ``env.moldRisk`` /
``env.iaqThreshold`` 两个处理器、语音矩阵里也有 ``envMoldRisk`` 开关 —— **没有检测器**。
「霉菌风险」在界面上是已配置状态，永远不会触发。

## 判据

- **霉菌**：同一房间内**最湿的那个测点**持续 ≥ ``moldHumidityThreshold``（默认 65%）
  超过 ``moldHoldMinutes``（默认 60 分钟）。取最大值而不是平均值：一个角落长期 75%
  就足以长霉，平均值（甚至最小值）会被同房间的干燥测点稀释掉。
- **IAQ**：PM2.5 ≥ ``pm25Threshold``（默认 75 μg/m³）或 CO₂ ≥ ``co2Threshold``
  （默认 1200 ppm）。两项都是「单点越线即报」，不需要持续判定 —— 它们是瞬时值。

房间归属来自状态仓的区域补全（``attributes.area_name``）；没有房间信息的传感器按
「全屋」聚合，避免因为没配房间就完全不监测。
"""

from __future__ import annotations

import logging
import time
from typing import Any

from ...platform.core.runtime.monitor_emit import MonitorEmitMixin
from ...platform.core.runtime.periodic_monitor import PeriodicMonitor

logger = logging.getLogger("homeos.iaq.monitor")

MOLD_RISK_EVENT = "env.moldRisk"
IAQ_THRESHOLD_EVENT = "env.iaqThreshold"

_COOLDOWN_NAMESPACE = "iaq"

#: 房间键：没有区域信息时统一落到这个桶（前端会显示为「全屋」）。
GLOBAL_ROOM = "global"


def _num(raw: Any) -> float | None:
    if isinstance(raw, bool) or raw is None:
        return None
    try:
        return float(str(raw).strip())
    except (TypeError, ValueError):  # fmt: skip
        logger.debug("传感器读数不是数值，按缺失处理: %r", raw)
        return None


def _attributes(entity: dict[str, Any]) -> dict[str, Any]:
    attrs = entity.get("attributes")
    return attrs if isinstance(attrs, dict) else {}


def _bounded(raw: Any, default: float, low: float, high: float) -> float:
    """缺省用默认值，给了数值就夹到区间内。

    刻意**不**用 ``value or default``：0 是用户明确填的值（哪怕不合理），静默回退到
    默认值会让人以为配置生效了。夹到下限至少是可见、可解释的行为。
    """
    value = _num(raw)
    if value is None:
        return default
    return max(low, min(high, value))


def describe_iaq_config(cfg: dict[str, Any]) -> dict[str, Any]:
    return {
        "moldHumidityThreshold": _bounded(cfg.get("moldHumidityThreshold"), 65.0, 30.0, 95.0),
        "moldHoldMinutes": _bounded(cfg.get("moldHoldMinutes"), 60.0, 5.0, 1440.0),
        "pm25Threshold": _bounded(cfg.get("pm25Threshold"), 75.0, 1.0, 1000.0),
        "co2Threshold": _bounded(cfg.get("co2Threshold"), 1200.0, 400.0, 10000.0),
        "cooldownMinutes": _bounded(cfg.get("moldAlertCooldownMin"), 10.0, 1.0, 1440.0),
    }


def humidity_reading(entity: dict[str, Any]) -> float | None:
    """湿度读数（%）。只认 ``sensor.*`` 且 ``device_class: humidity``。

    不接受任意 ``%`` 传感器（电量、开合度也是 %）：那会把「窗帘开了 60%」当成湿度。
    """
    entity_id = str(entity.get("entity_id") or "")
    if not entity_id.startswith("sensor."):
        return None
    attrs = _attributes(entity)
    if str(attrs.get("device_class") or "").strip().lower() != "humidity":
        return None
    value = _num(entity.get("state"))
    if value is None or not (0 <= value <= 100):
        return None
    return value


def pm25_reading(entity: dict[str, Any]) -> float | None:
    attrs = _attributes(entity)
    if str(attrs.get("device_class") or "").strip().lower() != "pm25":
        return None
    return _num(entity.get("state"))


def co2_reading(entity: dict[str, Any]) -> float | None:
    attrs = _attributes(entity)
    if str(attrs.get("device_class") or "").strip().lower() != "carbon_dioxide":
        return None
    return _num(entity.get("state"))


def room_key(entity: dict[str, Any]) -> tuple[str, str]:
    """``(roomId, roomName)``：来自区域补全；缺失时落到「全屋」。"""
    attrs = _attributes(entity)
    room_id = str(attrs.get("area_id") or "").strip()
    room_name = str(attrs.get("area_name") or "").strip()
    if not room_id:
        return GLOBAL_ROOM, "全屋"
    return room_id, room_name or room_id


class IaqMonitor(MonitorEmitMixin, PeriodicMonitor):
    """室内环境监测器（默认每 5 分钟一轮）。"""

    name = "iaq-monitor"

    def __init__(
        self,
        *,
        state_store: Any,
        app_config: Any,
        event_bus: Any,
        cooldown: Any,
        interval_seconds: float = 300.0,
        boot_delay_seconds: float = 30.0,
    ) -> None:
        super().__init__(interval_seconds=interval_seconds, boot_delay_seconds=boot_delay_seconds)
        self._store = state_store
        self._config = app_config
        self._bus = event_bus
        self._cooldown = cooldown
        #: 房间 → 湿度首次达到阈值的时间（``time.monotonic``）。回落即清除。
        self._humid_since: dict[str, float] = {}

    async def tick(self) -> None:
        cfg = describe_iaq_config(self._config.get("iaq") or {})
        entities = self._store.get_all()
        now = time.monotonic()
        self._check_mold(entities, cfg, now)
        self._check_iaq(entities, cfg)

    # ---- 霉菌 ----
    def _check_mold(self, entities: list[dict[str, Any]], cfg: dict[str, Any], now: float) -> None:
        room_wettest: dict[str, float] = {}
        room_name: dict[str, str] = {}
        for entity in entities:
            value = humidity_reading(entity)
            if value is None:
                continue
            room_id, name = room_key(entity)
            room_name[room_id] = name
            current = room_wettest.get(room_id)
            # 取同房间**最湿**测点：一个角落长期潮就足以长霉；平均值或最小值会被
            # 同房间的干燥测点稀释掉（卧室里床头 80% / 窗边 40%，平均值只有 60%）。
            room_wettest[room_id] = value if current is None else max(current, value)

        threshold = cfg["moldHumidityThreshold"]
        hold_seconds = cfg["moldHoldMinutes"] * 60.0
        seen: set[str] = set()
        for room_id, value in room_wettest.items():
            if value < threshold:
                self._humid_since.pop(room_id, None)
                continue
            seen.add(room_id)
            since = self._humid_since.setdefault(room_id, now)
            if now - since < hold_seconds:
                continue
            self._emit_mold(room_id, room_name.get(room_id) or "全屋", value, cfg)
        for stale in set(self._humid_since) - seen:
            self._humid_since.pop(stale, None)

    def _emit_mold(self, room_id: str, name: str, humidity: float, cfg: dict[str, Any]) -> None:
        if self.in_cooldown(_COOLDOWN_NAMESPACE, f"mold:{room_id}", cfg["cooldownMinutes"]):
            return
        detail = f"{name} 湿度持续 {humidity:.0f}%（阈值 {cfg['moldHumidityThreshold']:.0f}%），存在霉变风险"
        logger.info("霉菌风险：%s", detail)
        self.publish(
            MOLD_RISK_EVENT,
            {
                "roomId": room_id,
                "roomName": name,
                "humidity": round(humidity, 1),
                "threshold": cfg["moldHumidityThreshold"],
                "level": 2,
                "message": detail,
            },
        )

    # ---- IAQ ----
    def _check_iaq(self, entities: list[dict[str, Any]], cfg: dict[str, Any]) -> None:
        for entity in entities:
            pm25 = pm25_reading(entity)
            co2 = co2_reading(entity)
            if pm25 is not None and pm25 >= cfg["pm25Threshold"]:
                self._emit_iaq(entity, "pm25", pm25, cfg["pm25Threshold"], "PM2.5", cfg)
            if co2 is not None and co2 >= cfg["co2Threshold"]:
                self._emit_iaq(entity, "co2", co2, cfg["co2Threshold"], "二氧化碳", cfg)

    def _emit_iaq(
        self,
        entity: dict[str, Any],
        metric: str,
        value: float,
        threshold: float,
        label: str,
        cfg: dict[str, Any],
    ) -> None:
        entity_id = str(entity.get("entity_id") or "")
        room_id, room_name = room_key(entity)
        if self.in_cooldown(_COOLDOWN_NAMESPACE, f"iaq:{room_id}:{metric}", cfg["cooldownMinutes"]):
            return
        detail = f"{room_name} {label} 达到 {value:.0f}（阈值 {threshold:.0f}），建议通风或开启净化"
        logger.info("空气质量越线：%s", detail)
        self.publish(
            IAQ_THRESHOLD_EVENT,
            {
                "roomId": room_id,
                "roomName": room_name,
                "entityId": entity_id,
                "metric": metric,
                "value": round(value, 1),
                "threshold": threshold,
                "message": detail,
            },
        )


__all__ = [
    "GLOBAL_ROOM",
    "IAQ_THRESHOLD_EVENT",
    "MOLD_RISK_EVENT",
    "IaqMonitor",
    "co2_reading",
    "describe_iaq_config",
    "humidity_reading",
    "pm25_reading",
    "room_key",
]
