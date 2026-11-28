"""计划任务的时间与 cron 计算（从 ``scheduler`` 抽出的纯函数部分）。

只做「时间字符串 / cron 表达式 → 下一次运行时间」这类无状态换算，
方便单测直接覆盖，也让 ``scheduler`` 只保留服务生命周期相关的逻辑。
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

logger = logging.getLogger("homeos.agent.scheduler")

#: cron 允许的字符集（挡住注入式的怪异表达式）
CRON_ALLOWED = set("0123456789*/-,? ")
#: 一次性任务最长延迟（分钟）：一年，挡住明显写错的超大值
MAX_DELAY_MINUTES = 60 * 24 * 365
#: 周期任务的最小间隔（分钟）。与参考实现的 ``MIN_RECURRING_INTERVAL_MINUTES`` 一致：
#: 低于这个值的 cron 会被接受但每分钟下发一次控制命令，实际是误配置。
MIN_RECURRING_INTERVAL_MINUTES = 5


def now_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def parse_iso(raw: Any) -> datetime | None:
    """解析 ISO / ``YYYY-MM-DD HH:MM`` 时间并统一成 UTC naive。"""
    if isinstance(raw, datetime):
        moment = raw
    elif isinstance(raw, str) and raw.strip():
        text = raw.strip().replace("Z", "+00:00")
        if "T" not in text and " " in text:
            text = text.replace(" ", "T", 1)
        try:
            moment = datetime.fromisoformat(text)
        except ValueError:
            logger.debug("ISO 时间格式非法: %s", text)
            return None
    else:
        return None
    if moment.tzinfo is not None:
        moment = moment.astimezone(UTC).replace(tzinfo=None)
    return moment


def localize(moment: datetime, timezone_name: str) -> datetime:
    """把 UTC naive 解释成家庭本地时区（用于 cron 计算）。"""
    aware = moment.replace(tzinfo=UTC)
    tz = resolve_zone(timezone_name)
    return aware.astimezone(tz) if tz is not None else aware


def resolve_zone(timezone_name: str) -> ZoneInfo | None:
    name = str(timezone_name or "").strip()
    if not name:
        return None
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):  # fmt: skip - 括号不能省，Cython 会把 PEP 758 形式误解析
        logger.debug("时区不可用，回退 UTC: %s", name)
        return None


def cron_trigger(cron: str, timezone_name: str) -> Any:
    """构造 CronTrigger；表达式非法时抛 ValueError（由调用方转成用户可读错误）。"""
    text = " ".join(str(cron or "").split())
    if not text or set(text) - CRON_ALLOWED:
        raise ValueError("cron 表达式不合法（需 5 段：分 时 日 月 周）")
    from apscheduler.triggers.cron import CronTrigger

    tz = resolve_zone(timezone_name) or UTC
    return CronTrigger.from_crontab(text, timezone=tz)


def next_cron_run(cron: str, timezone_name: str, after: datetime) -> datetime | None:
    """按 cron 计算下一次执行（UTC naive）；非法表达式返回 None。"""
    try:
        trigger = cron_trigger(cron, timezone_name)
    except Exception as exc:
        logger.info("cron 表达式无法解析: %s (%s)", cron, exc)
        return None
    start = localize(after, timezone_name)
    try:
        nxt = trigger.get_next_fire_time(None, start)
    except Exception as exc:  # pragma: no cover - APScheduler 内部异常
        logger.debug("计算下次执行失败: %s", exc)
        return None
    if nxt is None:
        return None
    return nxt.astimezone(UTC).replace(tzinfo=None)


def delay_minutes(value: Any) -> float | None:
    """把 ``delayMinutes`` 解析成夹紧后的分钟数；缺失或不可解析时返回 ``None``。

    显式挡掉 ``None`` / ``bool``：前者 ``float()`` 会抛 ``TypeError``，后者会被当成
    0 / 1 分钟这种「看起来合法其实不是用户本意」的值。
    """
    if value is None or isinstance(value, bool):
        return None
    try:
        minutes = float(value)
    except (TypeError, ValueError):  # fmt: skip - 括号不能省，Cython 会把 PEP 758 形式误解析
        logger.debug("delayMinutes 不是数字: %r", value)
        return None
    return max(0.0, min(MAX_DELAY_MINUTES, minutes))


def validate_recurring_interval(cron: str, timezone_name: str) -> str | None:
    """周期任务的最小间隔校验；返回给用户看的中文说明，``None`` 表示可以创建。

    为什么需要：``* * * * *`` 这类表达式语法完全合法，但每分钟真的去控制一次设备
    不是用户想要的（"开灯"这种幂等动作还好，空调调温会一直发）。参考实现同样限制
    ``MIN_RECURRING_INTERVAL_MINUTES``，这里只做「相邻两次触发的间隔」判定 ——
    比解析 cron 字段简单得多，也不会漏掉 ``*/2 * * * *`` 这种花式写法。

    取三次触发而不是两次：单看前两次，``0 0 1 * *``（每月 1 日）下次间隔可能是 28 或
    31 天，正常；而 ``0 23 * * *`` 的间隔恒为 24h。次数少一个就可能把「一年只触发一次」
    的边界误判成频繁。
    """
    try:
        trigger = cron_trigger(cron, timezone_name)
    except Exception:  # fmt: skip
        return "cron 表达式不合法（需 5 段：分 时 日 月 周）"
    start = localize(now_naive(), timezone_name)
    fire_times: list[datetime] = []
    moment = start
    try:
        for _ in range(3):
            # 第一个参数是「上一次触发时间」，必须传才能得到**严格晚于**它的下一次；
            # 传 ``None`` 时 APScheduler 只按 ``now`` 往上找，同一分钟内会一直返回同一次。
            nxt = trigger.get_next_fire_time(moment, moment)
            if nxt is None:
                break
            fire_times.append(nxt)
            moment = nxt
    except Exception as exc:  # pragma: no cover - APScheduler 内部异常
        logger.debug("计算周期任务间隔失败: %s", exc)
        return None
    if len(fire_times) < 2:
        return None
    gap = fire_times[1] - fire_times[0]
    if gap < timedelta(minutes=MIN_RECURRING_INTERVAL_MINUTES):
        return f"周期任务的最小间隔为 {MIN_RECURRING_INTERVAL_MINUTES} 分钟"
    return None


def normalize_cron(payload: dict[str, Any]) -> str:
    """把 ``HH:MM`` 这类日常写法规范成 cron；已经是 5 段则原样返回。"""
    raw = str(payload.get("cron") or "").strip()
    if not raw:
        # 允许只用 time 字段表达「每天这个点」
        raw = str(payload.get("time") or "").strip()
    if not raw:
        run_at = parse_iso(payload.get("runAt"))
        if run_at is not None:
            # runAt 存的是 UTC naive；转 cron 墙钟时分必须用家庭时区，
            # 否则 UTC+8 下「每天 22:00」会变成 cron `0 14 * * *`。
            tz_name = str(payload.get("timezone") or payload.get("tz") or "").strip()
            local = localize(run_at, tz_name) if tz_name else run_at
            return f"{local.minute} {local.hour} * * *"
        return ""
    if ":" in raw and " " not in raw:
        hour_text, minute_text = raw.split(":", 1)
        try:
            hour = int(hour_text)
            minute = int(minute_text)
        except ValueError as exc:
            raise ValueError("时间需形如 HH:MM 或 5 段 cron") from exc
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError("时间超出范围（00:00 ~ 23:59）")
        return f"{minute} {hour} * * *"
    return " ".join(raw.split())
