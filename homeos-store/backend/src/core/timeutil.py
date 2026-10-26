"""商店统一时间工具：时区换算与展示格式化。

约定（与 core.models.utcnow / security.security.utcnow 一致）：
- 库里存的一律是 naive UTC，比较与排序都按 UTC 做；
- 对外序列化用带 Z 后缀的 ISO-8601（见 security.security.iso_z），让浏览器按 UTC 解析，避免 8 小时偏移；
- 只给「人看」的地方（邮件正文、后台文案、订单号时间戳）才换算到商店本地时区；
- 业务代码不要自己写 datetime.now() / date.today()，也不要各处手算 +timedelta(hours=8)，
  统一走本模块，才能保证时区口径只有一处定义。
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

STORE_TIMEZONE_NAME = "Asia/Shanghai"


def _resolve_store_timezone() -> tzinfo:
    """读取商店本地时区；运行环境缺 tzdata 时退化成固定 +08:00。"""
    try:
        return ZoneInfo(STORE_TIMEZONE_NAME)
    except (ZoneInfoNotFoundError, ModuleNotFoundError, ValueError):  # pragma: no cover - 仅缺 tzdata 的环境
        return timezone(timedelta(hours=8), "CST")


STORE_TIMEZONE = _resolve_store_timezone()


def as_local(moment: datetime, tz: tzinfo = STORE_TIMEZONE) -> datetime:
    """把任意时刻换算成商店本地的 aware datetime；naive 值按 UTC 理解（库里的口径）。"""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.astimezone(tz)


def aware_now(tz: tzinfo = STORE_TIMEZONE) -> datetime:
    """当前时刻的本地 aware 版本：只用于展示/编号，不要写库。"""
    return datetime.now(UTC).astimezone(tz)


def format_local(moment: datetime | None, fmt: str = "%Y-%m-%d %H:%M", tz: tzinfo = STORE_TIMEZONE) -> str:
    """把 naive UTC 时刻格式化成商店本地时区文本；None 返回破折号。"""
    if moment is None:
        return "—"
    return as_local(moment, tz).strftime(fmt)
