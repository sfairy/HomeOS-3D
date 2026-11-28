#!/usr/bin/env python3
"""电费账户「本月」口径自检：当月账单是**月内累计**，不能用它覆盖实时月行。

## 为什么需要它

国网 12 个月列表里的当月值是「到昨天为止」的累计。旧实现把它和历史月一样当成
账单级权威值（双向覆盖）：实时链路刚写入的、包含今天用电的月行会被这个更小的数
**下调**，每跑一次回填就丢一次今天的用量。日列表那条路径早就用
``_months_fully_covered`` 防住了，只有月列表这条没有。

本自检钉住：
1. 当月值进 ``current_months``（max 合并），不进 ``authoritative_months``（双向覆盖）；
2. 历史月仍进 ``authoritative_months``；
3. 当月若日列表已覆盖到昨天，也不会把「月内累计」误当成完整月。
"""

from __future__ import annotations

from _selftest_support import check, ensure_repo_on_path, report

ensure_repo_on_path()

from homeos.backend.src.domains.energy.sgcc import UtilityAccount, collect_utility_series

TODAY = "2026-11-28"
PRIMARY = "sensor.house_ele_total"


def build_account() -> UtilityAccount:
    return UtilityAccount(
        key="8107",
        family_key="8107",
        source_entity_id=PRIMARY,
        # 日列表只到昨天（国网常见口径），不含今天
        daily={"2026-11-26": 5.0, "2026-11-27": 4.0},
        monthly={"2026-10": 300.0, "2026-11": 110.0},
    )


def test_current_month_is_soft() -> None:
    series = collect_utility_series({"8107": build_account()}, {PRIMARY}, today=TODAY)
    check("当月进入 current_months", series.current_months.get(PRIMARY, {}).get("2026-11") == 110.0, str(series.current_months))
    check(
        "当月不再进 authoritative_months（否则会下调实时月行）",
        "2026-11" not in series.authoritative_months.get(PRIMARY, {}),
        str(series.authoritative_months),
    )


def test_history_month_stays_authoritative() -> None:
    series = collect_utility_series({"8107": build_account()}, {PRIMARY}, today=TODAY)
    check(
        "历史月仍是账单级权威值",
        series.authoritative_months.get(PRIMARY, {}).get("2026-10") == 300.0,
        str(series.authoritative_months),
    )


def test_current_month_uses_explicit_value_not_partial_sum() -> None:
    """当月日列表只有两天：不能因为「读到几天」就把月总量算成那两天之和。"""
    series = collect_utility_series({"8107": build_account()}, {PRIMARY}, today=TODAY)
    month_value = series.current_months.get(PRIMARY, {}).get("2026-11")
    check("当月取月列表值而不是日行求和", month_value == 110.0, str(series.current_months))


def test_yesterday_still_authoritative_day() -> None:
    series = collect_utility_series({"8107": build_account()}, {PRIMARY}, today=TODAY)
    check(
        "昨天仍是权威日",
        series.authoritative_days.get(PRIMARY, {}).get("2026-11-27") == 4.0,
        str(series.authoritative_days),
    )
    check("今天不在权威日里", "2026-11-28" not in series.authoritative_days.get(PRIMARY, {}), str(series.authoritative_days))


def main() -> int:
    test_current_month_is_soft()
    test_history_month_stays_authoritative()
    test_current_month_uses_explicit_value_not_partial_sum()
    test_yesterday_still_authoritative_day()
    report("电费账户当月口径")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
