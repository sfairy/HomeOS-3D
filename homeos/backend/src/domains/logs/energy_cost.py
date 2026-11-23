"""电费计算：把 kWh 换算成「元」，用 ``pricing`` 分区里用户已经配好的电价。

## 之前是什么状况

``pricing``（阶梯 / 固定 / 峰谷）在界面上有完整表单，但后端只有两个消费方：智能充放电判断
「当前是不是峰段」、动态电价同步。**没有任何地方把它算成钱**。能耗报表只返回 kWh，底栏的
``dailyCost`` / ``monthCost`` 与用电弹窗的单价全部读国网账户属性的「平均单价」——
没接国网账户的用户配好了电价，看到的永远是 ``--``。

## 精度必须如实标注

``EnergyUsageDaily`` 只有**日**粒度。峰谷电价的正确算法需要「每个小时用了多少度」，日粒度
只能按「当日峰/谷/平段时长占比」把日总量拆成三段 —— 这是一个**估算**，不是账单。

因此所有结果都带 ``estimated: true``（峰谷模式下恒为真）。真实的峰谷账单要等小时级归集
表（另开一项），在那之前不允许在界面上把估算值展示成「本月电费」而不加说明。
"""

from __future__ import annotations

import logging
from typing import Any

from ..app_config.pricing import resolve_tou_unit_prices

logger = logging.getLogger("homeos.energy_cost")

#: 一天的总分钟数（峰谷占比的分母）。
_MINUTES_PER_DAY = 1440


def _num(raw: Any, default: float = 0.0) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError):  # fmt: skip
        logger.debug("电价配置值不是数值，按缺省处理: %r", raw)
        return default
    return value if value >= 0 else default


def _to_minutes(raw: Any) -> int | None:
    text = str(raw or "").strip()
    if ":" not in text:
        return None
    hour_text, _, minute_text = text.partition(":")
    try:
        hour, minute = int(hour_text), int(minute_text)
    except (TypeError, ValueError):  # fmt: skip
        logger.debug("时段起止时间无法解析，该段按 0 分钟计: %r", raw)
        return None
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return hour * 60 + minute


def _window_minutes(start: Any, end: Any) -> int:
    begin, finish = _to_minutes(start), _to_minutes(end)
    if begin is None or finish is None or begin == finish:
        return 0
    return (finish - begin) % _MINUTES_PER_DAY


def tou_minute_shares(cfg: dict[str, Any]) -> dict[str, float]:
    """峰 / 谷 / 平三段在一天里的时长占比（峰谷重叠按「峰优先」裁剪）。

    与 :func:`app_config.pricing.get_time_period` 的判定顺序一致（先峰后谷，其余为平），
    因此占比与实际下单时段永远不会互相矛盾。
    """
    peak = _window_minutes(cfg.get("peakStart1"), cfg.get("peakEnd1")) + _window_minutes(
        cfg.get("peakStart2"), cfg.get("peakEnd2")
    )
    valley = _window_minutes(cfg.get("valleyStart"), cfg.get("valleyEnd"))
    peak = min(peak, _MINUTES_PER_DAY)
    valley = min(valley, _MINUTES_PER_DAY - peak)
    flat = max(0, _MINUTES_PER_DAY - peak - valley)
    return {
        "peak": peak / _MINUTES_PER_DAY,
        "valley": valley / _MINUTES_PER_DAY,
        "flat": flat / _MINUTES_PER_DAY,
    }


def resolve_prices(cfg: dict[str, Any]) -> dict[str, Any]:
    """电价归一：``{"mode", "fixed", "tier1Kwh", "tierPrices", "tou"}``。"""
    mode = "fixed" if str(cfg.get("pricingMode") or "").strip() == "fixed" else "tiered"
    tou_enabled = cfg.get("timeOfUseEnabled") is not False
    tou = resolve_tou_unit_prices(cfg, {"pricingMode": mode}) if tou_enabled else None
    # 阶梯阈值是**年度**口径（配置默认 2880 = 240 × 12），按月估算时要除以 12。
    tier1_kwh = _num(cfg.get("tier1Kwh"), 0.0)
    monthly_tier1 = tier1_kwh / 12.0 if tier1_kwh > 0 else 0.0
    return {
        "mode": mode,
        "fixed": _num(cfg.get("fixedPrice"), 0.0),
        "monthlyTier1Kwh": monthly_tier1,
        "tierPrices": (
            _num(cfg.get("tier1Price"), 0.0),
            _num(cfg.get("tier2Price"), 0.0),
            _num(cfg.get("tier3Price"), 0.0),
        ),
        "tou": tou,
    }


def _tiered_cost(kwh: float, prices: dict[str, Any]) -> float:
    """阶梯电价：按**月**总量跨档累加（第一档上限取年度阈值 / 12）。"""
    if kwh <= 0:
        return 0.0
    t1, t2, t3 = prices["tierPrices"]
    limit1 = prices["monthlyTier1Kwh"]
    if limit1 <= 0:
        return kwh * (t1 or prices["fixed"])
    remaining = kwh
    cost = 0.0
    first = min(remaining, limit1)
    cost += first * t1
    remaining -= first
    if remaining <= 0:
        return cost
    # 第二档上限在配置里没有独立字段：按电力行业惯例取第一档的两倍。
    second_limit = limit1
    second = min(remaining, second_limit)
    cost += second * t2
    remaining -= second
    if remaining > 0:
        cost += remaining * t3
    return cost


def hour_period(hour_key: str, cfg: dict[str, Any]) -> str:
    """``"YYYY-MM-DD HH"`` → ``peak`` / ``valley`` / ``flat``。

    判定顺序与 :func:`app_config.pricing.get_time_period` 完全一致（先峰后谷，其余为平），
    否则「按小时累加」与「按当前时刻判断」会给出互相矛盾的结论。
    """
    text = str(hour_key or "").strip()
    if len(text) < 13 or ":" in text:
        # 只有日键（``YYYY-MM-DD``）时没有时段可言，按平段处理。
        return "flat"
    try:
        hour = int(text[11:13])
    except ValueError:  # fmt: skip
        logger.debug("小时键无法解析，按时段缺失处理: %r", hour_key)
        return "flat"
    minute = hour * 60
    for start, end in (
        (cfg.get("peakStart1"), cfg.get("peakEnd1")),
        (cfg.get("peakStart2"), cfg.get("peakEnd2")),
    ):
        if _in_window(minute, start, end):
            return "peak"
    if _in_window(minute, cfg.get("valleyStart"), cfg.get("valleyEnd")):
        return "valley"
    return "flat"


def _in_window(minute: int, start: Any, end: Any) -> bool:
    begin, finish = _to_minutes(start), _to_minutes(end)
    if begin is None or finish is None or begin == finish:
        return False
    if begin < finish:
        return begin <= minute < finish
    # 跨午夜（23:00 → 07:00）
    return minute >= begin or minute < finish


def cost_from_hourly(
    hours: list[tuple[str, float]], cfg: dict[str, Any], *, prices: dict[str, Any] | None = None
) -> dict[str, Any]:
    """用**真实的逐小时电量**算峰谷电费（精确，不是估算）。

    ``hours`` 是 ``(hourKey, kwh)`` 列表，hourKey 为家庭时区的 ``YYYY-MM-DD HH``。
    返回 ``{cost, byPeriod, estimated: False}`` —— 调用方只有在确认小时数据覆盖完整时
    才应该用它，覆盖不完整时必须回退到 :func:`cost_of` 的估算口径。
    """
    resolved = prices or resolve_prices(cfg)
    tou = resolved["tou"]
    if tou is None:
        total = sum(float(kwh or 0.0) for _hour, kwh in hours)
        return cost_of(total, cfg, prices=resolved)
    by_period = {"peak": 0.0, "valley": 0.0, "flat": 0.0}
    for hour_key, kwh in hours:
        value = float(kwh or 0.0)
        if value <= 0:
            continue
        by_period[hour_period(hour_key, cfg)] += value * tou[hour_period(hour_key, cfg)]
    return {
        "cost": round(sum(by_period.values()), 2),
        "byPeriod": {key: round(value, 2) for key, value in by_period.items()},
        "estimated": False,
    }


def cost_of(kwh: float, cfg: dict[str, Any], *, prices: dict[str, Any] | None = None) -> dict[str, Any]:
    """把一个周期内的用电量换算成金额（元）。返回 ``{cost, byPeriod, estimated}``。"""
    resolved = prices or resolve_prices(cfg)
    tou = resolved["tou"]
    if tou is not None:
        shares = tou_minute_shares(cfg)
        by_period = {period: round(kwh * shares[period] * tou[period], 2) for period in ("peak", "valley", "flat")}
        return {
            "cost": round(sum(by_period.values()), 2),
            "byPeriod": by_period,
            # 日粒度无法还原真实的小时分布，这一项永远是估算。
            "estimated": True,
        }
    if resolved["mode"] == "fixed":
        return {"cost": round(kwh * resolved["fixed"], 2), "byPeriod": None, "estimated": False}
    return {"cost": round(_tiered_cost(kwh, resolved), 2), "byPeriod": None, "estimated": True}


def annotate_series(
    series: list[dict[str, Any]],
    cfg: dict[str, Any],
    *,
    monthly: bool = False,
) -> dict[str, Any]:
    """给能耗曲线逐点补 ``cost`` 并给出合计。

    ``monthly=True`` 时按阶梯口径逐月计算（阶梯本来就是月/年累计口径）；
    日曲线在阶梯模式下逐日套用会产生「每天都按第一档」的偏低结果，因此日曲线只在
    峰谷 / 固定模式下逐点计价，阶梯模式返回 ``cost=None`` 并让调用方只展示电量。
    """
    prices = resolve_prices(cfg)
    tou = prices["tou"]
    points: list[dict[str, Any]] = []
    total = 0.0
    estimated = False
    priced = False
    for item in series:
        value = float(item.get("value") or 0.0)
        if tou is not None or prices["mode"] == "fixed" or monthly:
            computed = cost_of(value, cfg, prices=prices)
            cost: float | None = computed["cost"]
            total += computed["cost"]
            estimated = estimated or bool(computed["estimated"])
            priced = True
        else:
            # 阶梯口径必须按月累计：逐日套用会让每天都落在第一档，得到一个恒偏低的数。
            # 与其给错数字，不如不给（调用方据 ``cost is None`` 只展示电量）。
            cost = None
        points.append({**item, "cost": cost})
    return {
        "series": points,
        "cost": round(total, 2) if priced else None,
        "currency": "CNY",
        "estimated": estimated,
        "unit": "元",
    }


__all__ = [
    "annotate_series",
    "cost_from_hourly",
    "cost_of",
    "hour_period",
    "resolve_prices",
    "tou_minute_shares",
]
