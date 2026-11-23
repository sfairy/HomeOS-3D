#!/usr/bin/env python3
"""电价计费自检：峰谷/固定/阶梯三种口径的**算式断言**。

为什么必须是算式：金额是「看起来对但算错」最难发现的一类缺陷 —— 数字永远是一个合理的
小数，界面上没人能看出它错了 30%。这里用固定输入逐项核对，并对「估算」标记做断言：
日粒度无法还原小时分布，峰谷模式必须标 ``estimated=True``，不允许假装精确。
"""

from __future__ import annotations

from _selftest_support import check, ensure_repo_on_path, report

ensure_repo_on_path()

from homeos.backend.src.domains.logs.energy_cost import (
    annotate_series,
    cost_of,
    resolve_prices,
    tou_minute_shares,
)

FIXED_CFG = {"pricingMode": "fixed", "fixedPrice": 0.5, "timeOfUseEnabled": False}

# 峰谷：8–11 与 18–23 为峰（共 8 小时 = 480 分钟），23–7 为谷（480 分钟），
# 其余（1440-480-480=480 分钟）为平 —— 三段各占 1/3，正好用来验算。
TOU_CFG = {
    "pricingMode": "fixed",
    "timeOfUseEnabled": True,
    "peakStart1": "08:00",
    "peakEnd1": "11:00",
    "peakStart2": "18:00",
    "peakEnd2": "23:00",
    "valleyStart": "23:00",
    "valleyEnd": "07:00",
    "peakPrice": 1.0,
    "valleyPrice": 0.3,
    "flatPrice": 0.6,
}

TIER_CFG = {
    "pricingMode": "tiered",
    "timeOfUseEnabled": False,
    "tier1Kwh": 1200,
    "tier1Price": 0.5,
    "tier2Price": 0.6,
    "tier3Price": 0.9,
    "fixedPrice": 0.5,
}


def test_fixed_cost() -> None:
    result = cost_of(100, FIXED_CFG)
    check("固定单价按电量乘单价", abs(result["cost"] - 50.0) < 1e-6, str(result))
    check("固定单价不是估算", result["estimated"] is False)


def test_tou_shares() -> None:
    shares = tou_minute_shares(TOU_CFG)
    check("峰段占比 1/3", abs(shares["peak"] - 1 / 3) < 1e-6, str(shares))
    check("谷段占比 1/3", abs(shares["valley"] - 1 / 3) < 1e-6, str(shares))
    check("平段占比 1/3", abs(shares["flat"] - 1 / 3) < 1e-6, str(shares))


def test_tou_cost() -> None:
    result = cost_of(300, TOU_CFG)
    # 100 度 × 1.0 + 100 度 × 0.3 + 100 度 × 0.6 = 190
    check("峰谷费用按占比拆分", abs(result["cost"] - 190.0) < 0.02, str(result))
    check("峰谷模式必须标记为估算（日粒度无法还原小时分布）", result["estimated"] is True)
    by_period = result["byPeriod"] or {}
    check("分时段明细齐全", set(by_period) == {"peak", "valley", "flat"}, str(by_period))


def test_tiered_cost() -> None:
    prices = resolve_prices(TIER_CFG)
    # 年度第一档 1200 kWh → 月度 100 kWh。用 150 kWh 验证跨档：
    # 100 × 0.5 + 50 × 0.6 = 80
    check("阶梯月度阈值按年度阈值 / 12", abs(prices["monthlyTier1Kwh"] - 100.0) < 1e-6, str(prices))
    result = cost_of(150, TIER_CFG)
    check("阶梯跨档累加", abs(result["cost"] - 80.0) < 1e-6, str(result))


def test_daily_tiered_is_not_priced() -> None:
    """阶梯口径的日曲线不给金额（逐日套用会恒落在第一档，得到偏低的假数字）。"""
    series = [{"date": "2026-11-01", "label": "11/1", "value": 10}]
    result = annotate_series(series, TIER_CFG, monthly=False)
    check("阶梯日曲线不报价", result["cost"] is None, str(result["cost"]))
    check("阶梯日曲线逐点 cost 为 None", result["series"][0]["cost"] is None)
    monthly = annotate_series(series, TIER_CFG, monthly=True)
    check("阶梯月曲线报价", abs((monthly["cost"] or 0) - 5.0) < 1e-6, str(monthly["cost"]))


def main() -> int:
    test_fixed_cost()
    test_tou_shares()
    test_tou_cost()
    test_tiered_cost()
    test_daily_tiered_is_not_priced()
    report("电价计费")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
