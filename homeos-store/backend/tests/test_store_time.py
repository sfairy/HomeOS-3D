"""商店时间口径测试：UTC 存储、Z 后缀序列化、北京时间展示与自然日边界。

这些断言锁定的是协议契约：库里存 naive UTC，对外序列化必须带 Z，
给人看的时间必须是商店本地时区（Asia/Shanghai），且「今天」的边界只有一处定义。
"""

from __future__ import annotations

import sys
import unittest
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.commerce.delivery import _expires_text
from src.core.timeutil import (
    STORE_TIMEZONE,
    as_local,
    aware_now,
    format_local,
    local_day_bounds,
    local_day_key,
    to_naive_utc,
)
from src.security.security import iso_z


class TimezoneHelperTests(unittest.TestCase):
    """helper 本身的口径：naive=UTC，展示=北京时间。"""

    def test_store_timezone_is_shanghai(self) -> None:
        probe = datetime(2024, 1, 1, tzinfo=STORE_TIMEZONE)
        self.assertEqual(probe.utcoffset(), timedelta(hours=8))

    def test_as_local_treats_naive_as_utc(self) -> None:
        moment = as_local(datetime(2024, 1, 31, 23, 30))
        self.assertEqual(moment.utcoffset(), timedelta(hours=8))
        self.assertEqual(moment.strftime("%Y-%m-%d %H:%M"), "2024-02-01 07:30")

    def test_as_local_converts_aware_input(self) -> None:
        utc_moment = datetime(2024, 2, 1, 0, 0, tzinfo=UTC)
        self.assertEqual(as_local(utc_moment).strftime("%H:%M"), "08:00")

    def test_to_naive_utc_roundtrip(self) -> None:
        naive = datetime(2024, 2, 1, 0, 0)
        self.assertEqual(to_naive_utc(naive), naive)
        self.assertEqual(to_naive_utc(datetime(2024, 2, 1, 8, 0, tzinfo=timezone(timedelta(hours=8)))), naive)

    def test_aware_now_is_store_local(self) -> None:
        moment = aware_now()
        self.assertIsNotNone(moment.tzinfo)
        self.assertEqual(moment.utcoffset(), timedelta(hours=8))
        self.assertLess(abs((datetime.now(UTC) - moment.astimezone(UTC)).total_seconds()), 60)

    def test_format_local_crosses_day_boundary(self) -> None:
        # UTC 23:30 = 北京时间次日 07:30：这一条是「少 8 小时」缺陷的回归锁。
        self.assertEqual(format_local(datetime(2024, 1, 31, 23, 30)), "2024-02-01 07:30")
        self.assertEqual(format_local(None), "—")


class LocalDayBoundaryTests(unittest.TestCase):
    """自然日边界：北京时间 00:00 才是「今天」的开始，而不是 UTC 00:00。"""

    def test_local_day_key_uses_shanghai_midnight(self) -> None:
        self.assertEqual(local_day_key(datetime(2024, 1, 31, 15, 59)), "2024-01-31")  # 23:59 本地
        self.assertEqual(local_day_key(datetime(2024, 1, 31, 16, 0)), "2024-02-01")  # 00:00 本地
        self.assertEqual(local_day_key(None), "")

    def test_local_day_bounds_are_naive_utc(self) -> None:
        moment = datetime(2024, 2, 1, 7, 30)  # 本地 2024-02-01 15:30
        start, end = local_day_bounds(moment)
        self.assertIsNone(start.tzinfo)
        self.assertIsNone(end.tzinfo)
        self.assertEqual(start, datetime(2024, 1, 31, 16, 0))
        self.assertEqual(end, datetime(2024, 2, 1, 16, 0))
        self.assertLessEqual(start, moment)
        self.assertLess(moment, end)

    def test_day_bounds_and_key_agree(self) -> None:
        for moment in (datetime(2024, 2, 1, 7, 30), datetime(2024, 12, 31, 16, 0)):
            start, _ = local_day_bounds(moment)
            self.assertEqual(local_day_key(moment), as_local(start).date().isoformat())


class SerializationContractTests(unittest.TestCase):
    """对外序列化契约：带 Z 的 UTC 串，浏览器按 UTC 解析才不会偏 8 小时。"""

    def test_iso_z_has_suffix_and_parses_back_to_utc(self) -> None:
        value = datetime(2024, 1, 31, 23, 30)
        text = iso_z(value)
        self.assertIsNotNone(text)
        self.assertTrue(text.endswith("Z"))
        parsed = datetime.fromisoformat(text)
        self.assertEqual(parsed.utcoffset(), timedelta(0))
        self.assertEqual(parsed, value.replace(tzinfo=UTC))

    def test_iso_z_none(self) -> None:
        self.assertIsNone(iso_z(None))


class DeliveryExpiryTextTests(unittest.TestCase):
    """邮件里的到期文案统一走 format_local（北京时间）。"""

    def test_permanent_license(self) -> None:
        self.assertEqual(_expires_text(SimpleNamespace(access_expires_at=None)), "永久有效")

    def test_limited_license_renders_beijing_time(self) -> None:
        text = _expires_text(SimpleNamespace(access_expires_at=datetime(2024, 1, 31, 23, 30)))
        self.assertIn("2024-02-01 07:30", text)
        self.assertIn("北京时间", text)


if __name__ == "__main__":
    unittest.main()
