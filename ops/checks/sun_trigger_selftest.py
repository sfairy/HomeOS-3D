#!/usr/bin/env python3
"""日出/日落触发自检：时刻解析、偏移、星期过滤、以及「读不到太阳时间就不猜」。

最关键的一条：``sun.sun`` 不可用时**必须跳过**，不能退回「06:00 / 18:00」这类猜测 ——
冬夏差两小时，猜错就是天没黑就开灯。这里用固定 ``sun.sun`` 属性与固定「现在」验证，
不依赖真实时间与网络。
"""

from __future__ import annotations

from datetime import UTC, datetime

from _selftest_support import check, ensure_repo_on_path, report

ensure_repo_on_path()

from homeos.backend.src.domains.home_mode.triggers import (
    HomeModeTriggerBinding,
    _time_binding_due,
    sun_event_hhmm,
)
from homeos.backend.src.platform.core.runtime.zoned_time import zoned_date_parts

# 固定家庭时区为 UTC：断言不依赖运行机器的本地时区（容器里常常是 UTC+8）。
TZ = "UTC"


SUN = {
    "entity_id": "sun.sun",
    "state": "above_horizon",
    "attributes": {
        "next_dawn": "2026-11-23T22:41:00+00:00",
        "next_dusk": "2026-11-23T09:12:00+00:00",
    },
}

# 固定「现在」：2026-11-23 09:15 UTC → 家庭时区 UTC 下就是 09:15。
NOW = datetime(2026, 11, 23, 9, 15, tzinfo=UTC)
PARTS = zoned_date_parts(NOW, TZ)
WEEKDAY = PARTS["weekday"]


def binding(trigger: dict) -> HomeModeTriggerBinding:
    return HomeModeTriggerBinding(mode_id="mode-1", mode_name="傍晚", trigger=trigger)


def test_sun_time_parsing() -> None:
    check(
        "日出取 next_dawn",
        sun_event_hhmm(SUN, "sunrise", 0, TZ) == "22:41",
        str(sun_event_hhmm(SUN, "sunrise", 0, TZ)),
    )
    check("日落取 next_dusk", sun_event_hhmm(SUN, "sunset", 0, TZ) == "09:12")
    check("负偏移 = 提前", sun_event_hhmm(SUN, "sunset", -30, TZ) == "08:42")
    check("正偏移 = 推后", sun_event_hhmm(SUN, "sunset", 30, TZ) == "09:42")
    check("缺失属性返回 None", sun_event_hhmm({"attributes": {}}, "sunset", 0, TZ) is None)
    check("非 dict 返回 None", sun_event_hhmm(None, "sunset", 0, TZ) is None)


def test_sunrise_due_window() -> None:
    trigger = {"type": "sun", "event": "sunset", "offsetMinutes": 0}
    # 日落 09:12，现在 09:15 → 在 10 分钟宽限内，应到期
    due = _time_binding_due(binding(trigger), NOW, PARTS, WEEKDAY, TZ, SUN)
    check("日落 3 分钟后仍在宽限窗口内", due is not None, str(due))
    check("到期时刻是解析出的日落时间", (due or ("",))[0] == "09:12", str(due))
    check("occurrence 带 sun 标记（与定时触发不冲突）", "sun:sunset@" in (due or ("", ""))[1], str(due))


def test_outside_window() -> None:
    trigger = {"type": "sun", "event": "sunset", "offsetMinutes": 0}
    later = datetime(2026, 11, 23, 9, 40, tzinfo=UTC)
    parts = zoned_date_parts(later, TZ)
    due = _time_binding_due(binding(trigger), later, parts, WEEKDAY, TZ, SUN)
    check("超出 10 分钟宽限不触发", due is None, str(due))


def test_missing_sun_skips() -> None:
    trigger = {"type": "sun", "event": "sunset", "offsetMinutes": 0}
    due = _time_binding_due(binding(trigger), NOW, PARTS, WEEKDAY, TZ, None)
    check("读不到太阳时间时不猜、直接跳过", due is None)
    check("空属性同样跳过", _time_binding_due(binding(trigger), NOW, PARTS, WEEKDAY, TZ, {"attributes": {}}) is None)


def test_weekday_filter() -> None:
    other_day = (WEEKDAY + 3) % 7
    trigger = {"type": "sun", "event": "sunset", "offsetMinutes": 0, "days": [other_day]}
    due = _time_binding_due(binding(trigger), NOW, PARTS, WEEKDAY, TZ, SUN)
    check("星期不在列表内不触发", due is None, str(due))
    trigger_ok = {**trigger, "days": [WEEKDAY]}
    check(
        "星期命中则触发",
        _time_binding_due(binding(trigger_ok), NOW, PARTS, WEEKDAY, TZ, SUN) is not None,
    )


def test_regular_time_still_works() -> None:
    """回归：新增 sun 类型不能破坏原有的固定时刻触发。"""
    trigger = {"type": "time", "at": "09:14"}
    due = _time_binding_due(binding(trigger), NOW, PARTS, WEEKDAY, TZ, SUN)
    check("固定时刻仍按原口径触发", due is not None and due[0] == "09:14", str(due))


def test_offset_clamped() -> None:
    trigger = {"type": "sun", "event": "sunset", "offsetMinutes": 99999}
    due = _time_binding_due(binding(trigger), NOW, PARTS, WEEKDAY, TZ, SUN)
    # 偏移被夹到 +180 分钟：日落 09:12 → 12:12，现在 09:15 不在窗口内
    check("超大偏移被夹到 ±180", due is None, str(due))


def main() -> int:
    test_sun_time_parsing()
    test_sunrise_due_window()
    test_outside_window()
    test_missing_sun_skips()
    test_weekday_filter()
    test_regular_time_still_works()
    test_offset_clamped()
    report("日出日落触发")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
