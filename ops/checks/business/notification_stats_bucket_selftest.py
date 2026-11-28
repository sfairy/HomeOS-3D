#!/usr/bin/env python3
"""通知统计分桶自检：横向时间轴必须按**家庭时区**，不是 UTC。

## 为什么需要它

`created_at` 落库是 UTC 文本，旧实现用 `substr(created_at, 1, 13)` 直接分桶：
东八区家庭 23:30 的通知被画进 15:00 的桶，按天分桶的日界落在本地 16:00。
图表与同一页面所有其它时间（家庭时区）互相矛盾，且表达不了 DST 与半小时时区。

本自检钉住：
1. 小时桶按本地墙上时钟取整并标注（23:30 CN → ``23:00``）；
2. 日桶的日界是本地午夜，不是 UTC 午夜；
3. 空窗补齐后 ``ts`` 单调递增（前端按它排序 / 对齐）。
"""

from __future__ import annotations

from datetime import UTC, datetime

from _selftest_support import check, ensure_repo_on_path, report

ensure_repo_on_path()

from homeos.backend.src.domains.notification.stats import build_notification_time_series_in_zone

TZ = "Asia/Shanghai"


def ts_ms(text: str) -> int:
    return int(datetime.strptime(text, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=UTC).timestamp() * 1000)


def bucket_for(series: list[dict], timestamp_ms: int) -> dict | None:
    return next((item for item in series if item["ts"] == timestamp_ms), None)


def test_hour_bucket_uses_home_timezone() -> None:
    # 2026-01-01T15:30Z = 东八区 23:30，必须落在本地 23:00 的桶。
    now = ts_ms("2026-01-01T16:00:00")  # 本地 2026-01-02 00:00
    series = build_notification_time_series_in_zone(["2026-01-01T15:30:00.123Z"], 6, TZ, now_ms=now)
    labels = [item["label"] for item in series]
    check("最后一个桶是本地午夜 00:00", labels[-1] == "00:00", str(labels))
    check("23:30 的通知落在本地 23:00 桶", labels[-2] == "23:00", str(labels))
    target = bucket_for(series, ts_ms("2026-01-01T15:00:00"))
    check("本地 23:00 桶计数为 1", target is not None and target["count"] == 1, str(series))


def test_utc_bucketing_would_have_been_wrong() -> None:
    """反向断言：按 UTC 取整会落到 15:00，本实现不得出现该桶。"""
    now = ts_ms("2026-01-01T16:00:00")
    series = build_notification_time_series_in_zone(["2026-01-01T15:30:00Z"], 6, TZ, now_ms=now)
    labels = [item["label"] for item in series]
    check("不出现 UTC 的 15:00 桶", "15:00" not in labels, str(labels))


def test_day_bucket_boundary_is_local_midnight() -> None:
    # 2026-01-01T16:30Z = 本地 2026-01-02 00:30，属于**本地 1 月 2 日**。
    now = ts_ms("2026-01-03T00:00:00")
    series = build_notification_time_series_in_zone(["2026-01-01T16:30:00Z"], 72, TZ, now_ms=now)
    labels = [item["label"] for item in series]
    check("本地跨日后归到 1/2", labels[-2] == "1/2", str(labels))


def test_series_is_monotonic_and_filled() -> None:
    # 本地 21:00 为「现在」，取 4 小时窗口：桶 17:00…21:00（5 个）。
    now = ts_ms("2026-01-01T13:00:00")  # 东八区 21:00
    series = build_notification_time_series_in_zone(
        ["2026-01-01T10:00:00Z", "2026-01-01T12:00:00Z"], 4, TZ, now_ms=now
    )
    stamps = [item["ts"] for item in series]
    check("桶按时间升序", stamps == sorted(stamps), str(stamps))
    check("补齐空桶（4 小时窗口 → 5 个桶）", len(series) == 5, str(len(series)))
    check("总计等于输入条数", sum(item["count"] for item in series) == 2, str(series))
    check("窗口外的时间戳不补刻度", len({item["ts"] for item in series}) == 5, str(stamps))


def test_invalid_timestamp_is_ignored() -> None:
    now = ts_ms("2026-01-01T13:00:00")  # 东八区 21:00
    series = build_notification_time_series_in_zone(["not-a-time", None, "2026-01-01T10:00:00Z"], 4, TZ, now_ms=now)
    check("脏数据不计数也不抛错", sum(item["count"] for item in series) == 1, str(series))


def main() -> int:
    test_hour_bucket_uses_home_timezone()
    test_utc_bucketing_would_have_been_wrong()
    test_day_bucket_boundary_is_local_midnight()
    test_series_is_monotonic_and_filled()
    test_invalid_timestamp_is_ignored()
    report("通知统计分桶")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
