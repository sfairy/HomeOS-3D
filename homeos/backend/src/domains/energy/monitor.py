"""用能监测：异常用量、月度预算、预付费余额不足。

## 之前是什么状况

``energy`` 分区有 ``anomalyCooldownMin`` / ``budgetAlertCooldownMin``，``DEFAULT_VOICE_ALERT_RULES``
里有 ``energyAnomaly`` / ``energyBudget``，通知端也挂了 ``handle_energy_anomaly`` /
``handle_budget_exceeded`` —— 但**没有任何代码发布这两个事件**。于是「能耗异常」与
「预算超支」在界面上是已启用状态，实际永远不会响。

预付费余额更彻底：只在弹窗里展示，欠费断电前没有任何提醒。

## 判据（都用库里已有的数据，不猜）

- **异常**：今日累计 kWh 高于「前 N 个完整日的日均」的 ``anomalyRatio`` 倍。前 N 天数据
  不足 ``learningPeriodDays`` 时**不报**（新装机的头几天本来就没有基线）。
- **预算**：月累计 kWh 达到 ``monthlyBudgetKwh`` 的 ``budgetWarnRatio`` 倍；或按当前速率
  外推的月末用量超预算。两条都要求配置了预算（0 = 未设，不告警）。
- **余额**：余额实体读数低于 ``balanceLowThreshold`` 时提醒，**只在跌破时**发一次
  （回升后复位），避免每小时重复。
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select

from ...platform.core.db.models import EnergyUsageDaily
from ...platform.core.runtime.monitor_emit import MonitorEmitMixin
from ...platform.core.runtime.periodic_monitor import PeriodicMonitor

logger = logging.getLogger("homeos.energy.monitor")

ENERGY_ANOMALY_EVENT = "energy.anomaly"
ENERGY_BUDGET_EVENT = "energy.budgetExceeded"
ENERGY_BALANCE_EVENT = "energy.balanceLow"

_COOLDOWN_NAMESPACE = "energy"


def _no_primary_entities() -> set[str]:
    """未注入主电表提供方时的缺省：没有候选，整轮求值直接跳过。"""
    return set()


def _num(raw: Any) -> float | None:
    if isinstance(raw, bool) or raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):  # fmt: skip
        logger.debug("配置值不是数值，按缺省处理: %r", raw)
        return None


def describe_energy_config(cfg: dict[str, Any]) -> dict[str, Any]:
    """归一化 ``energy`` 分区里监测需要的那几个键。"""
    learning = int(_num(cfg.get("learningPeriodDays")) or 7)
    return {
        "learningDays": max(3, min(30, learning)),
        "anomalyRatio": max(1.2, _num(cfg.get("anomalyRatio")) or 2.0),
        "anomalyCooldownMin": max(1.0, _num(cfg.get("anomalyCooldownMin")) or 60.0),
        "budgetKwh": max(0.0, _num(cfg.get("monthlyBudgetKwh")) or 0.0),
        "budgetWarnRatio": max(0.5, _num(cfg.get("budgetWarnRatio")) or 1.0),
        "budgetCooldownMin": max(30.0, _num(cfg.get("budgetAlertCooldownMin")) or 720.0),
        "balanceEntityId": str(cfg.get("balanceEntityId") or "").strip(),
        "balanceLowThreshold": max(0.0, _num(cfg.get("balanceLowThreshold")) or 20.0),
    }


class EnergyMonitor(MonitorEmitMixin, PeriodicMonitor):
    """用能监测器（默认每 30 分钟一轮：日用量与预算都不需要分钟级精度）。"""

    name = "energy-monitor"

    def __init__(
        self,
        *,
        database: Any,
        state_store: Any,
        app_config: Any,
        event_bus: Any,
        cooldown: Any,
        primary_entities: Any = None,
        interval_seconds: float = 1800.0,
        boot_delay_seconds: float = 90.0,
    ) -> None:
        super().__init__(interval_seconds=interval_seconds, boot_delay_seconds=boot_delay_seconds)
        self._database = database
        self._store = state_store
        self._config = app_config
        self._bus = event_bus
        self._cooldown = cooldown
        self._primary_entities = primary_entities or _no_primary_entities
        #: 余额「已跌破」标记：只在跨越阈值那一次提醒，回升后复位。
        self._balance_below: bool = False

    async def tick(self) -> None:
        cfg = describe_energy_config(self._config.get("energy") or {})
        self._check_balance(cfg)
        ids = self._resolve_primary()
        if not ids:
            return
        today, average, samples = await self._read_today_and_baseline(ids, cfg["learningDays"])
        # 异常判定需要「今日已用量」；预算判定只看本月累计，不要求今天已有记录
        # （月初第一天、或今天还没产生增量时，本月累计照样可能已经超预算）。
        if today is not None:
            self._check_anomaly(cfg, ids, today, average, samples)
        await self._check_budget(cfg, ids, average)

    # ---- 数据 ----
    def _resolve_primary(self) -> list[str]:
        try:
            return sorted({str(item).strip() for item in (self._primary_entities() or ()) if str(item).strip()})
        except Exception:  # 配置读失败：不报异常，但要留线索
            logger.debug("读取主电表集合失败，本轮跳过用能监测", exc_info=True)
            return []

    def _business_today(self) -> datetime:
        """家庭时区的「今天」（日键是家庭时区墙钟，与聚合写入口径一致）。"""
        try:
            timezone_name = (self._config.get("ops") or {}).get("homeTimezone")
        except Exception:
            logger.debug("读取家庭时区失败，按 UTC 计算日键", exc_info=True)
            timezone_name = None
        now = datetime.now(UTC)
        if timezone_name:
            try:
                from zoneinfo import ZoneInfo

                return now.astimezone(ZoneInfo(str(timezone_name)))
            except Exception:
                logger.debug("家庭时区无效，按 UTC 计算日键: %s", timezone_name)
        return now

    async def _read_today_and_baseline(
        self, ids: list[str], learning_days: int
    ) -> tuple[float | None, float | None, int]:
        """返回 ``(今日累计, 前 N 天日均, 有效天数)``。

        全是同步 SQLite 读，但本方法在 ``PeriodicMonitor`` 的异步循环里被调用 —— 必须
        ``asyncio.to_thread``，否则每次求值都会卡住事件循环（WS 推送同时在进行）。
        """

        def _query() -> tuple[float | None, float | None, int]:
            today = self._business_today().date()
            start = today - timedelta(days=learning_days)
            with self._database.session_factory() as session:
                today_total = session.scalar(
                    select(func.sum(EnergyUsageDaily.kwh)).where(
                        EnergyUsageDaily.entity_id.in_(ids),
                        EnergyUsageDaily.day == today.isoformat(),
                    )
                )
                rows = session.execute(
                    select(EnergyUsageDaily.day, func.sum(EnergyUsageDaily.kwh))
                    .where(
                        EnergyUsageDaily.entity_id.in_(ids),
                        EnergyUsageDaily.day >= start.isoformat(),
                        EnergyUsageDaily.day < today.isoformat(),
                    )
                    .group_by(EnergyUsageDaily.day)
                ).all()
            # 只算「有数据的天」：把没记录的日子当 0 会把基线压得过低，轻微超用也报警。
            values = [float(value or 0.0) for _day, value in rows if float(value or 0.0) > 0]
            average = sum(values) / len(values) if values else None
            return (
                None if today_total is None else float(today_total),
                average,
                len(values),
            )

        return await asyncio.to_thread(_query)

    # ---- 判定 ----
    def _check_anomaly(
        self,
        cfg: dict[str, Any],
        ids: list[str],
        today: float,
        average: float | None,
        samples: int,
    ) -> None:
        if average is None or samples < cfg["learningDays"] or average <= 0:
            # 基线不足：明确不报（新装机头几天报「异常」只会让用户关掉这个功能）。
            return
        ratio = today / average
        if ratio < cfg["anomalyRatio"]:
            return
        if self.in_cooldown(_COOLDOWN_NAMESPACE, "anomaly", cfg["anomalyCooldownMin"]):
            return
        logger.info("用能异常：今日 %.2f kWh，基线 %.2f kWh（%.1f 倍）", today, average, ratio)
        self.publish(
            ENERGY_ANOMALY_EVENT,
            {
                "entityId": ids[0] if len(ids) == 1 else None,
                "type": "daily_high",
                "current": round(today, 2),
                "average": round(average, 2),
                "ratio": round(ratio, 2),
            },
        )

    async def _check_budget(self, cfg: dict[str, Any], ids: list[str], average: float | None) -> None:
        budget = cfg["budgetKwh"]
        if budget <= 0:
            return
        now = self._business_today()
        month_start = now.date().replace(day=1)
        # 同步 SQLite 读必须离开事件循环：本方法由 ``PeriodicMonitor`` 的异步循环调用，
        # 同一时刻事件循环正在推 WS 状态。与 ``_read_today_and_baseline`` 同一条理由。
        month_total = await asyncio.to_thread(self._month_total, ids, month_start.isoformat(), now.date().isoformat())
        # 外推只看**完整天数**：把「今天这半天」当一整天会系统性高估（00:30 用了 3 kWh
        # 就外推成 90 kWh/月，月初必然误报）。当月还没过完一天时退回历史日均基线。
        completed_days = max(0, (now.date() - month_start).days)
        if completed_days > 0 and month_total > 0:
            daily = month_total / completed_days
        else:
            daily = average or 0.0
        days_in_month = ((month_start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)).day
        projected = daily * days_in_month if daily > 0 else 0.0
        triggered = month_total >= budget * cfg["budgetWarnRatio"] or projected >= budget
        if not triggered:
            return
        if self.in_cooldown(_COOLDOWN_NAMESPACE, "budget", cfg["budgetCooldownMin"]):
            return
        detail = (
            f"本月已用 {month_total:.1f} kWh（预算 {budget:.0f} kWh）"
            if month_total >= budget * cfg["budgetWarnRatio"]
            else f"按当前用量预计月末 {projected:.0f} kWh，将超出预算 {budget:.0f} kWh"
        )
        logger.info("能源预算告警：%s", detail)
        self.publish(
            ENERGY_BUDGET_EVENT,
            {
                "message": detail,
                "used": round(month_total, 2),
                "budget": round(budget, 2),
                "projected": round(projected, 2),
            },
        )

    def _month_total(self, ids: list[str], start_day: str, end_day: str) -> float:
        try:
            with self._database.session_factory() as session:
                value = session.scalar(
                    select(func.sum(EnergyUsageDaily.kwh)).where(
                        EnergyUsageDaily.entity_id.in_(ids),
                        EnergyUsageDaily.day >= start_day,
                        EnergyUsageDaily.day <= end_day,
                    )
                )
        except Exception:
            logger.debug("读取本月用能失败", exc_info=True)
            return 0.0
        return float(value or 0.0)

    def _check_balance(self, cfg: dict[str, Any]) -> None:
        entity_id = cfg["balanceEntityId"]
        if not entity_id:
            return
        entity = self._store.get(entity_id)
        if not isinstance(entity, dict):
            return
        balance = _num(entity.get("state"))
        if balance is None:
            return
        threshold = cfg["balanceLowThreshold"]
        if balance > threshold:
            self._balance_below = False
            return
        if self._balance_below:
            # 已经在阈值下方：不重复提醒（每小时一条「余额仍然不足」没有信息量）。
            return
        self._balance_below = True
        name = str((entity.get("attributes") or {}).get("friendly_name") or entity_id)
        logger.info("预付费余额不足：%s 余额 %.2f，阈值 %.2f", entity_id, balance, threshold)
        self.publish(
            ENERGY_BALANCE_EVENT,
            {
                "entityId": entity_id,
                "friendlyName": name,
                "balance": round(balance, 2),
                "threshold": threshold,
                "detail": f"{name} 余额仅剩 {balance:.2f}，请及时充值以免断电",
            },
        )


__all__ = [
    "ENERGY_ANOMALY_EVENT",
    "ENERGY_BALANCE_EVENT",
    "ENERGY_BUDGET_EVENT",
    "EnergyMonitor",
    "describe_energy_config",
]
