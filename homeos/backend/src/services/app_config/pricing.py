"""电价计费解析工具（对齐 ``shared/app-config/pricing-config.util.ts``）。

阶梯 / 固定单价 / 分时峰谷平三种模式统一入口。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from ...core.zoned_time import zoned_date_parts

TimePeriod = Literal["peak", "valley", "flat"]


def _to_minutes(t: str) -> int:
    parts = str(t or "").split(":")
    hour = int(parts[0]) if len(parts) > 0 and str(parts[0]).strip().isdigit() else 0
    minute = int(parts[1]) if len(parts) > 1 and str(parts[1]).strip().isdigit() else 0
    return hour * 60 + minute


def _in_time_range(now: str, start: str, end: str) -> bool:
    n = _to_minutes(now)
    s = _to_minutes(start)
    e = _to_minutes(end)
    if s <= e:
        return s <= n < e
    return n >= s or n < e


def _hhmm(now: datetime, time_zone: str | None = None) -> str:
    parts = zoned_date_parts(now, time_zone)
    return f"{int(parts['hour']):02d}:{int(parts['minute']):02d}"


def _is_time_of_use_enabled(cfg: dict[str, Any]) -> bool:
    return cfg.get("timeOfUseEnabled") is not False


def _resolve_base_unit_price(cfg: dict[str, Any], ctx: dict[str, Any]) -> float:
    if ctx.get("pricingMode") == "fixed":
        fixed = _num(cfg.get("fixedPrice"))
        return fixed if fixed > 0 else (_num(ctx.get("fixedPrice")) or _num(ctx.get("tierUnitPrice")))
    return _num(ctx.get("tierUnitPrice"))


def _num(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def is_peak_time(now: datetime, cfg: dict[str, Any], time_zone: str | None = None) -> bool:
    if not _is_time_of_use_enabled(cfg):
        return False
    hm = _hhmm(now, time_zone)
    return _in_time_range(
        hm, str(cfg.get("peakStart1") or ""), str(cfg.get("peakEnd1") or "")
    ) or _in_time_range(hm, str(cfg.get("peakStart2") or ""), str(cfg.get("peakEnd2") or ""))


def _is_valley_time(now: datetime, cfg: dict[str, Any], time_zone: str | None = None) -> bool:
    if not _is_time_of_use_enabled(cfg):
        return False
    start = str(cfg.get("valleyStart") or "23:00").strip() or "23:00"
    end = str(cfg.get("valleyEnd") or "07:00").strip() or "07:00"
    return _in_time_range(_hhmm(now, time_zone), start, end)


def get_time_period(
    now: datetime, cfg: dict[str, Any], time_zone: str | None = None
) -> TimePeriod | None:
    if not _is_time_of_use_enabled(cfg):
        return None
    if is_peak_time(now, cfg, time_zone):
        return "peak"
    if _is_valley_time(now, cfg, time_zone):
        return "valley"
    return "flat"


def resolve_tou_unit_prices(cfg: dict[str, Any], ctx: dict[str, Any]) -> dict[str, float]:
    t1 = _num(cfg.get("tier1Price")) if _num(cfg.get("tier1Price")) > 0 else _num(ctx.get("tier1Price"))
    t2 = _num(cfg.get("tier2Price")) if _num(cfg.get("tier2Price")) > 0 else _num(ctx.get("tier2Price"))
    fixed_cfg = _num(cfg.get("fixedPrice"))
    base_fixed = (
        fixed_cfg
        if fixed_cfg > 0
        else (_num(ctx.get("fixedPrice")) or _num(ctx.get("tierUnitPrice")) or t1)
    )
    flat_base = base_fixed if ctx.get("pricingMode") == "fixed" else t1
    peak_base = base_fixed if ctx.get("pricingMode") == "fixed" else t2
    valley_base = base_fixed * 0.63 if ctx.get("pricingMode") == "fixed" else flat_base * 0.63

    peak = _num(cfg.get("peakPrice")) if _num(cfg.get("peakPrice")) > 0 else peak_base
    valley = _num(cfg.get("valleyPrice")) if _num(cfg.get("valleyPrice")) > 0 else valley_base
    flat = _num(cfg.get("flatPrice")) if _num(cfg.get("flatPrice")) > 0 else flat_base
    return {"peak": peak, "valley": valley, "flat": flat}


def get_period_unit_price(
    now: datetime,
    cfg: dict[str, Any],
    ctx: dict[str, Any],
    time_zone: str | None = None,
) -> dict[str, Any]:
    base_unit_price = _resolve_base_unit_price(cfg, ctx)
    if not _is_time_of_use_enabled(cfg):
        return {
            "timeOfUseEnabled": False,
            "period": None,
            "pricePerKwh": base_unit_price,
            "tierUnitPrice": base_unit_price,
            "periodPrices": None,
        }
    period_prices = resolve_tou_unit_prices(cfg, ctx)
    period = get_time_period(now, cfg, time_zone) or "flat"
    return {
        "timeOfUseEnabled": True,
        "period": period,
        "pricePerKwh": period_prices[period],
        "tierUnitPrice": base_unit_price,
        "periodPrices": period_prices,
    }


def time_period_label(period: str | None) -> str:
    if period == "peak":
        return "峰段"
    if period == "valley":
        return "谷段"
    if period == "flat":
        return "平段"
    return ""


__all__ = [
    "get_period_unit_price",
    "get_time_period",
    "is_peak_time",
    "resolve_tou_unit_prices",
    "time_period_label",
]
