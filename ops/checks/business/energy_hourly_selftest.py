#!/usr/bin/env python3
"""能耗小时聚合与**精确峰谷计价**自检。

为什么必须单独测：峰谷金额是「看起来对但算错」最难发现的一类缺陷。用日总量 × 时段占比
估算，在家庭负荷集中在峰段时会系统性偏低 20%+，而界面上只是一个合理的小数。这里用
固定的小时输入逐项核对，并钉死两条边界：

- 小时覆盖不足（老库只有日行）时**必须回退到估算**并标 ``estimated``，不能假装精确；
- 小时桶与日桶必须同口径（同一时区解析），否则跨零点那一小时会算错时段。
"""

from __future__ import annotations

from datetime import UTC, datetime

from _selftest_support import check, ensure_repo_on_path, report

ensure_repo_on_path()

from homeos.backend.src.domains.logs.energy_aggregate import accumulate_energy_totals
from homeos.backend.src.domains.logs.energy_cost import (
    cost_from_hourly,
    cost_of,
    hour_period,
    resolve_prices,
)

TZ = "Asia/Shanghai"

#: 峰 08–11 与 18–23、谷 23–07、其余为平；单价峰 1.0 / 平 0.6 / 谷 0.3。
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
    "fixedPrice": 0.5,
}


def _row(entity: str, old: str, new: str, at: datetime) -> dict:
    return {
        "entity_id": entity,
        "old_state": {"state": old, "attributes": {"device_class": "energy", "unit_of_measurement": "kWh"}},
        "new_state": {"state": new, "attributes": {"device_class": "energy", "unit_of_measurement": "kWh"}},
        "created_at": at,
        "old_state_ts": at,
        "new_state_ts": at,
    }


def test_hour_keys_and_totals() -> None:
    """小时桶按家庭时区落键，且与日桶加总一致。"""
    # 东八区 10:00 与 10:30 各用 1 kWh；同日 23:30 再用 2 kWh（跨到谷段）
    rows = [
        _row("sensor.ele", "100.0", "101.0", datetime(2026, 11, 20, 2, 0, tzinfo=UTC)),
        _row("sensor.ele", "101.0", "102.0", datetime(2026, 11, 20, 2, 30, tzinfo=UTC)),
        _row("sensor.ele", "102.0", "104.0", datetime(2026, 11, 20, 15, 30, tzinfo=UTC)),
    ]
    day, _month, hour, resets = accumulate_energy_totals(rows, set(), {"primary": "", "scope": "total"}, TZ)
    hours = {key: value["kwh"] for (_eid, key), value in hour.items()}
    check("小时键按东八区落点", set(hours) == {"2026-11-20 10", "2026-11-20 23"}, str(sorted(hours)))
    check("同一小时多批累加", abs(hours.get("2026-11-20 10", 0) - 2.0) < 1e-9, str(hours))
    check("小时合计等于日合计", abs(sum(hours.values()) - 4.0) < 1e-9, str(hours))
    check("日桶仍然正确", abs(sum(v["kwh"] for v in day.values()) - 4.0) < 1e-9, str(day))
    check("月桶也一并产出", abs(sum(v["kwh"] for v in _month.values()) - 4.0) < 1e-9, str(_month))
    check("没有表底重置", resets == {}, str(resets))


def test_hour_period_mapping() -> None:
    check("09 点属于峰段", hour_period("2026-11-20 09", TOU_CFG) == "peak")
    check("20 点属于峰段", hour_period("2026-11-20 20", TOU_CFG) == "peak")
    check("02 点属于谷段", hour_period("2026-11-20 02", TOU_CFG) == "valley")
    check("23 点属于谷段", hour_period("2026-11-20 23", TOU_CFG) == "valley")
    check("14 点属于平段", hour_period("2026-11-20 14", TOU_CFG) == "flat")
    check("只有日键时按平段", hour_period("2026-11-20", TOU_CFG) == "flat")


def test_exact_vs_estimated() -> None:
    """同样的总量：逐小时计价与按时长占比估算会给出不同结果，前者才是真值。"""
    prices = resolve_prices(TOU_CFG)
    # 6 kWh 全部发生在峰段（09 点）
    hourly = [("2026-11-20 09", 6.0)]
    exact = cost_from_hourly(hourly, TOU_CFG, prices=prices)
    check("峰段电量按峰价计", abs(exact["cost"] - 6.0) < 1e-9, str(exact))
    check("逐小时计价不是估算", exact["estimated"] is False)
    check("峰段明细正确", exact["byPeriod"]["peak"] == 6.0, str(exact["byPeriod"]))

    estimated = cost_of(6.0, TOU_CFG, prices=prices)
    check("按时长占比估算会明显偏低", estimated["cost"] < exact["cost"], f"{estimated['cost']} vs {exact['cost']}")
    check("估算必须标记 estimated", estimated["estimated"] is True)


def test_mixed_periods() -> None:
    prices = resolve_prices(TOU_CFG)
    hourly = [("2026-11-20 09", 2.0), ("2026-11-20 02", 4.0), ("2026-11-20 14", 1.0)]
    result = cost_from_hourly(hourly, TOU_CFG, prices=prices)
    # 2×1.0 + 4×0.3 + 1×0.6 = 3.8
    check("跨时段金额逐段累加", abs(result["cost"] - 3.8) < 1e-9, str(result))
    check("峰段金额", result["byPeriod"]["peak"] == 2.0, str(result["byPeriod"]))
    check("谷段金额", result["byPeriod"]["valley"] == 1.2, str(result["byPeriod"]))
    check("平段金额", result["byPeriod"]["flat"] == 0.6, str(result["byPeriod"]))


def test_fixed_mode_needs_no_hourly() -> None:
    """固定单价本来就是精确的：不需要小时数据，也不该被标记成估算。"""
    cfg = {"pricingMode": "fixed", "fixedPrice": 0.5, "timeOfUseEnabled": False}
    result = cost_of(10.0, cfg)
    check("固定单价金额", abs(result["cost"] - 5.0) < 1e-9, str(result))
    check("固定单价不是估算", result["estimated"] is False)


def main() -> int:
    test_hour_keys_and_totals()
    test_hour_period_mapping()
    test_exact_vs_estimated()
    test_mixed_periods()
    test_fixed_mode_needs_no_hourly()
    report("能耗小时聚合")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
