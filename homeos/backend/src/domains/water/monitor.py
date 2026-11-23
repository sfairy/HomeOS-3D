"""用水安全监测：漏水、长流水、离家期间用水。

## 之前是什么状况

``water`` 分区早就有 ``anomalyCooldownMin`` 与 ``mainValveEntityId``，通知与语音两侧也都
订阅了 ``water.anomaly``，唯独**没有任何地方发布这个事件**。用户勾了「用水安全」之后，
漏水、忘关龙头都不会有任何提示 —— 配置在界面上看起来是「已启用」。

## 这一版能判什么、不能判什么（必须与文案一致）

能判：

1. **长流水**：流量传感器换算到 L/min 后持续高于阈值超过 ``longFlowMinutes``；
2. **离家用水**：在场判定为「家中无人」时仍有流量。

**不判瞬时水浸**：``device_class`` 为 ``water`` / ``moisture`` 的漏水传感器由安防危险联动
（``security/panel_helpers.handle_safety_sensor``）负责 —— 那条链路会按 3D 布局绑定**自动关阀 /
排风**并发出 ``security.alarm``。两个模块各发一条会给同一处漏水产生两条文案不同的告警，
所以这里刻意让出，只做「安防链路不覆盖」的持续用水判定。

**不能判**：日用量异常（超学习期基线 N 倍）。水表没有像电表那样的 ``EnergyUsageDaily``
归集，进程重启就没有当日累计基线；用「进程内首读差值」冒充只会得到「重启当天必报」的
假告警。这一条等用水历史归集接入后再做，界面上也不写「已覆盖全部漏水情况」。

## 为什么不自动关阀

自动关阀的误报代价极高（洗马桶、给鱼缸换水都是持续大流量），而误关一次就是全屋断水。
产品决定是「只告警 + 一键关阀」：通知里带主水阀实体，大屏给确认按钮。要改成自动，
必须先有误报保护（短时大流量白名单、水浸传感器去抖），不能只加一行 ``call_service``。
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from .usage import MAX_SINGLE_DELTA_M3, business_day, meter_reading_m3
from ...platform.core.runtime.monitor_emit import MonitorEmitMixin
from ...platform.core.runtime.periodic_monitor import PeriodicMonitor

logger = logging.getLogger("homeos.water.monitor")

#: 事件名（通知与语音两侧已在监听）。
WATER_ANOMALY_EVENT = "water.anomaly"

#: 流量单位 → L/min 的换算因子。
_FLOW_UNIT_FACTORS: dict[str, float] = {
    "l/min": 1.0,
    "l/m": 1.0,
    "l/h": 1.0 / 60.0,
    "m³/h": 1000.0 / 60.0,
    "m3/h": 1000.0 / 60.0,
    "ml/s": 0.06,
}

#: 冷却键里「按实体」的分类：同一根管子持续流水只提醒一次，不刷屏。
_COOLDOWN_NAMESPACE = "water"


def _num(raw: Any) -> float | None:
    if isinstance(raw, bool) or raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    try:
        return float(str(raw).strip())
    except (TypeError, ValueError):  # fmt: skip
        logger.debug("流量读数不是数值，按缺失处理: %r", raw)
        return None


def _attributes(entity: dict[str, Any]) -> dict[str, Any]:
    attrs = entity.get("attributes")
    return attrs if isinstance(attrs, dict) else {}


#: 名字里带这些片段的是燃气/暖通回路，绝不能被当成「用水」：
#: 燃气锅炉的 ``m³/h`` 流量传感器与水管单位相同，误判会触发「漏水」并建议关水阀。
_NOT_WATER_HINTS = ("gas", "燃气", "天然气", "steam", "蒸汽")


def flow_lpm(entity: dict[str, Any]) -> float | None:
    """把流量传感器的读数换算成 L/min；不是流量传感器时返回 ``None``。"""
    entity_id = str(entity.get("entity_id") or "").lower()
    if any(hint in entity_id for hint in _NOT_WATER_HINTS):
        return None
    attrs = _attributes(entity)
    device_class = str(attrs.get("device_class") or "").strip().lower()
    unit = str(attrs.get("unit_of_measurement") or "").strip().lower()
    factor = _FLOW_UNIT_FACTORS.get(unit)
    if device_class != "volume_flow_rate" and factor is None:
        return None
    if factor is None:
        # 声明了 volume_flow_rate 但单位不认识：按 L/min 解释（HA 的默认单位）。
        factor = 1.0
    value = _num(entity.get("state"))
    if value is None or value < 0:
        return None
    return value * factor


def _bounded(raw: Any, default: float, low: float, high: float) -> float:
    """缺省用默认值；给了数值就夹到区间内（0 是用户明确填的，不回退默认）。"""
    value = _num(raw)
    if value is None:
        return default
    return max(low, min(high, value))


def describe_water_config(cfg: dict[str, Any]) -> dict[str, Any]:
    """归一化 ``water`` 分区（监测与自检共用一份解释）。"""
    try:
        long_flow_minutes = float(cfg.get("longFlowMinutes") or 30)
    except (TypeError, ValueError):  # fmt: skip
        logger.debug("longFlowMinutes 非法，按 30 分钟处理: %r", cfg.get("longFlowMinutes"))
        long_flow_minutes = 30.0
    try:
        rate = float(cfg.get("longFlowRateLpm") or 0.5)
    except (TypeError, ValueError):  # fmt: skip
        logger.debug("longFlowRateLpm 非法，按 0.5 L/min 处理: %r", cfg.get("longFlowRateLpm"))
        rate = 0.5
    try:
        cooldown = float(cfg.get("anomalyCooldownMin") or 30)
    except (TypeError, ValueError):  # fmt: skip
        logger.debug("anomalyCooldownMin 非法，按 30 分钟处理: %r", cfg.get("anomalyCooldownMin"))
        cooldown = 30.0
    return {
        "longFlowMinutes": max(1.0, long_flow_minutes),
        "longFlowRateLpm": max(0.05, rate),
        "cooldownMinutes": max(1.0, cooldown),
        "mainValveEntityId": str(cfg.get("mainValveEntityId") or "").strip(),
        "flowEntityId": str(cfg.get("flowEntityId") or "").strip(),
        "meterEntityId": str(cfg.get("meterEntityId") or "").strip(),
        # 日用量异常：今日 ≥ 历史日均 × 该倍数即告警。
        "dailyAnomalyRatio": _bounded(cfg.get("dailyAnomalyRatio"), 2.0, 1.2, 20.0),
        "usageLearningDays": int(_bounded(cfg.get("usageLearningDays"), 7, 3, 30)),
    }


class WaterMonitor(MonitorEmitMixin, PeriodicMonitor):
    """用水安全监测器（默认每 60 秒一轮）。"""

    name = "water-monitor"

    def __init__(
        self,
        *,
        state_store: Any,
        app_config: Any,
        event_bus: Any,
        cooldown: Any,
        presence: Any = None,
        usage: Any = None,
        interval_seconds: float = 60.0,
        boot_delay_seconds: float = 15.0,
    ) -> None:
        super().__init__(interval_seconds=interval_seconds, boot_delay_seconds=boot_delay_seconds)
        self._store = state_store
        self._config = app_config
        self._bus = event_bus
        self._cooldown = cooldown
        self._presence = presence
        #: 用水日用量存储（可选）：没有它时只做流量类判定，日用量异常静默跳过。
        self._usage = usage
        #: 水表最后一次读数（m³）。**不落库**：重启后第一轮无基线就跳过，
        #: 而不是凭空造一个「从 0 到当前读数」的假用量。
        self._last_reading: dict[str, float] = {}
        #: 每个流量实体「从什么时候开始持续流水」（``time.monotonic``）。
        #: 回落清零；只在内存里，进程重启后重新计时（宁可晚一轮，也不误报）。
        self._flowing_since: dict[str, float] = {}

    # ---- 求值 ----
    async def tick(self) -> None:
        cfg = describe_water_config(self._config.get("water") or {})
        entities = self._store.get_all()
        now = time.monotonic()
        meters = await self._collect_usage(entities, cfg)
        self._check_flow(entities, cfg, now)
        await self._check_daily_usage(meters, cfg)

    def _check_flow(self, entities: list[dict[str, Any]], cfg: dict[str, Any], now: float) -> None:
        threshold = cfg["longFlowRateLpm"]
        hold_seconds = cfg["longFlowMinutes"] * 60.0
        away = self._is_away()
        seen: set[str] = set()
        for entity in entities:
            rate = flow_lpm(entity)
            if rate is None:
                continue
            entity_id = str(entity.get("entity_id") or "")
            seen.add(entity_id)
            if rate < threshold:
                self._flowing_since.pop(entity_id, None)
                continue
            since = self._flowing_since.setdefault(entity_id, now)
            name = str(_attributes(entity).get("friendly_name") or entity_id)
            if away:
                # 离家状态下的用水本来就反常，不必等满 longFlowMinutes。
                self._emit(
                    entity_id,
                    name,
                    "away_flow",
                    "danger",
                    f"家中无人但检测到持续用水（{name}，{rate:.1f} L/min），请确认是否漏水",
                    cfg,
                )
                continue
            if now - since >= hold_seconds:
                self._emit(
                    entity_id,
                    name,
                    "long_flow",
                    "warn",
                    f"{name} 已持续用水超过 {int(cfg['longFlowMinutes'])} 分钟（{rate:.1f} L/min）",
                    cfg,
                )
        # 实体消失（集成重载 / 被删除）时清掉计时，避免重新出现时沿用旧起点。
        for stale in set(self._flowing_since) - seen:
            self._flowing_since.pop(stale, None)

    def _is_away(self) -> bool:
        probe = getattr(self._presence, "is_anyone_home", None)
        if not callable(probe):
            return False
        try:
            return not bool(probe())
        except Exception:  # 判定失败按「有人在家」处理：宁可少报，不可误报
            logger.debug("读取在场状态失败，按有人在家处理", exc_info=True)
            return False

    # ---- 日用量（累计水表差分） ----
    async def _collect_usage(self, entities: list[dict[str, Any]], cfg: dict[str, Any]) -> list[str]:
        """把累计水表的增量写进当天；返回参与统计的水表实体 id。"""
        if self._usage is None:
            return []
        readings: dict[str, float] = {}
        for entity in entities:
            entity_id = str(entity.get("entity_id") or "")
            if cfg["meterEntityId"] and entity_id != cfg["meterEntityId"]:
                continue
            value = meter_reading_m3(entity)
            if value is not None:
                readings[entity_id] = value
        if not readings:
            return []
        day = business_day(timezone_name=self._home_timezone())
        deltas: dict[str, float] = {}
        for entity_id, value in readings.items():
            previous = self._last_reading.get(entity_id)
            self._last_reading[entity_id] = value
            if previous is None or value <= previous:
                # 首次观测 / 换表归零：只更新基线，不记增量（差值为负会把当天用量算成负数）。
                continue
            delta = value - previous
            if delta > MAX_SINGLE_DELTA_M3:
                logger.debug("水表单次增量异常（%.2f m³），判为换表或单位错配，不计账: %s", delta, entity_id)
                continue
            deltas[entity_id] = delta
        if deltas:
            await asyncio.to_thread(self._record_deltas, deltas, day)
        return sorted(readings)

    def _record_deltas(self, deltas: dict[str, float], day: str) -> None:
        for entity_id, delta in deltas.items():
            self._usage.record_delta(entity_id, day, delta)

    def _home_timezone(self) -> str | None:
        probe = getattr(self._config, "get_home_timezone", None)
        if callable(probe):
            try:
                return probe()
            except Exception:
                logger.debug("读取家庭时区失败，日切按本机时区", exc_info=True)
        return None

    async def _check_daily_usage(self, entity_ids: list[str], cfg: dict[str, Any]) -> None:
        """今日用水异常（超历史日均 N 倍）。

        基线天数不足 ``usageLearningDays`` 时**不报**：新装水表的头几天没有可比对象，
        报「异常」只会让用户关掉这个功能。
        """
        if self._usage is None or not entity_ids:
            return
        day = business_day(timezone_name=self._home_timezone())
        today, baseline, samples = await asyncio.to_thread(self._measure_daily, entity_ids, day, cfg)
        if baseline is None or samples < cfg["usageLearningDays"] or baseline <= 0:
            return
        ratio = today / baseline
        if ratio < cfg["dailyAnomalyRatio"]:
            return
        detail = f"今日用水 {today:.2f} m³，约为近期日均 {baseline:.2f} m³ 的 {ratio:.1f} 倍"
        self._emit(entity_ids[0], "今日用水", "daily_high", "warn", detail, cfg)

    def _measure_daily(self, entity_ids: list[str], day: str, cfg: dict[str, Any]) -> tuple[float, float | None, int]:
        today = self._usage.today_total(entity_ids, day)
        baseline, samples = self._usage.baseline(entity_ids, day, cfg["usageLearningDays"])
        return today, baseline, samples

    def _emit(
        self,
        entity_id: str,
        name: str,
        kind: str,
        level: str,
        detail: str,
        cfg: dict[str, Any],
    ) -> None:
        if self.in_cooldown(_COOLDOWN_NAMESPACE, f"{kind}:{entity_id}", cfg["cooldownMinutes"]):
            return
        logger.info("用水异常 [%s] %s: %s", kind, entity_id, detail)
        self.publish(
            WATER_ANOMALY_EVENT,
            {
                "entityId": entity_id,
                "friendlyName": name,
                "type": kind,
                "level": level,
                "detail": detail,
                # 通知跳转与「一键关阀」都要用它；没有主水阀时前端隐藏按钮。
                "valveEntityId": cfg["mainValveEntityId"],
            },
        )


__all__ = [
    "WATER_ANOMALY_EVENT",
    "WaterMonitor",
    "describe_water_config",
    "flow_lpm",
]
