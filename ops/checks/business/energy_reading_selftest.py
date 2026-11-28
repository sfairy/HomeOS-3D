#!/usr/bin/env python3
"""能耗读数自检：``unavailable`` 不能被当成「本期读数为 0」。

## 为什么需要它

权威读数口径是「同一周期内取最大读数」。旧实现把 ``unavailable`` / ``unknown``
解析成 ``0.0``：一条连接抖动产生的不可用事件会把当天的 ``reading`` 写成 0，
而 ``reading`` 模式是**直接覆盖**库里的日/月行 —— 结果是仪表盘、预算与异常检测里
当天真实用电量凭空消失，直到下一次全量回填才可能恢复。
"""

from __future__ import annotations

from datetime import UTC, datetime

from _selftest_support import check, ensure_repo_on_path, report

ensure_repo_on_path()

from homeos.backend.src.domains.client_power.energy_meter import reading_kwh_or_none
from homeos.backend.src.domains.energy.aggregate import accumulate_energy_totals

PRIMARY = "sensor.house_power_total"
DAY_SOURCE = "sensor.house_energy_today"
ATTRS = {
    "device_class": "energy",
    "unit_of_measurement": "kWh",
    "state_class": "total_increasing",
}
WHEN = datetime(2026, 11, 28, 10, 0, tzinfo=UTC)


def reading(value: str) -> dict:
    return {"state": value, "attributes": dict(ATTRS)}


def test_reading_helper_distinguishes_unreadable() -> None:
    check("unavailable 返回 None", reading_kwh_or_none(reading("unavailable")) is None)
    check("unknown 返回 None", reading_kwh_or_none(reading("unknown")) is None)
    check("空状态返回 None", reading_kwh_or_none({}) is None)
    check("真实 0 保留为 0", reading_kwh_or_none(reading("0")) == 0.0)
    check("正常读数解析", reading_kwh_or_none(reading("12.5")) == 12.5)


def test_unavailable_does_not_zero_day_reading() -> None:
    batch = [
        {
            "entity_id": DAY_SOURCE,
            "old_state": reading("4.0"),
            "new_state": reading("5.0"),
            "created_at": WHEN,
        },
        # 同一周期内的不可用事件：旧实现会把它记成 0，覆盖掉上面的 5.0。
        {
            "entity_id": DAY_SOURCE,
            "old_state": reading("5.0"),
            "new_state": reading("unavailable"),
            "created_at": WHEN,
        },
    ]
    bindings = {"primary": PRIMARY, "scope": "total", "day": DAY_SOURCE}
    day_totals, _month, _hour, _resets = accumulate_energy_totals(batch, {PRIMARY}, bindings, "Asia/Shanghai")
    key = (PRIMARY, "2026-11-28")
    entry = day_totals.get(key)
    check("当天有读数行", entry is not None, str(day_totals))
    check("unavailable 不覆盖真实读数", entry is not None and entry["kwh"] == 5.0, str(entry))
    check("读数来源标记为 reading", entry is not None and entry["mode"] == "reading", str(entry))


def main() -> int:
    test_reading_helper_distinguishes_unreadable()
    test_unavailable_does_not_zero_day_reading()
    report("能耗读数")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
