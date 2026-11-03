"""能耗实体发现与历史回填。

旧口径有两处硬伤，会让「今天用了多少电」长期读成 0：

1. **实体识别只看名字**。事件日志分级与能耗副作用都只匹配 ``entity_id`` 里的
   ``energy``/``kwh``/``electricity`` 子串，``sensor.zong_dian_liang``、
   ``sensor.dian_biao`` 这类中文拼音名（以及只有 ``device_class: energy`` 的实体）
   在入库的第一步就被判成 ``skip``，后面再怎么聚合都是 0。
2. **数据只靠实时事件累积**。没有任何回填：今天才接入的家庭，「近 7 天 / 本月」
   必然是 0，而用户问的往往正是历史。

这里补上「发现 + 回填」两个环节：

- 发现：按 ``attributes``（``device_class=energy`` / 单位 kWh|Wh|MWh）识别电量实体，
  名字关键字退化成兜底（与 ``event_log_tier.is_energy_meter_state`` 同一口径）；
- 回填：优先读 HA 长期统计（``recorder/statistics_during_period``，按小时取回后按
  家庭时区归并到自然日），没有统计的实体回退到 ``/api/history/period`` 读数差分。

回填结果经 ``EventLogService.apply_energy_backfill`` 落库，合并口径「只增不减」，
因此可以周期性重复执行，不会和实时增量重复计费。
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime, timedelta
from typing import Any

from .event_log_tier import is_energy_meter_entity
from ..client_power.energy_meter import (
    business_day_key,
    compute_meter_delta,
    is_cumulative_energy_meter,
    reading_to_kwh,
)
from ...platform.core.db.db_exec import run_db
from ...platform.core.ha.statistics import fetch_statistics

logger = logging.getLogger("homeos.energy_backfill")

#: 回填窗口（自然日，含今天）。与前端能耗页的近 7 天口径一致。
BACKFILL_DAYS = 7
#: 单轮回填的实体上限：每个实体都要向 HA 取一次历史，避免大户型把 HA 打满。
MAX_BACKFILL_ENTITIES = 64
#: 两次回填之间的最小间隔（秒）。周期对账快照很密集，回填没必要跟着跑。
MIN_RUN_INTERVAL_SECONDS = 1800
#: HA 尚未连上 / 本轮异常时的重试间隔（秒），免得把「还没准备好」当成「已完成」。
RETRY_INTERVAL_SECONDS = 120
#: 没有长期统计时，退回历史状态差分的窗口上限（天）。原始状态流比统计大两三个数量级，
#: 窗口太长会把 HA 与内存都拖垮 —— 实时链路从本次修复起已经能自己累积。
HISTORY_FALLBACK_DAYS = 3


def _to_number(raw: Any) -> float | None:
    """把 HA 返回值转成浮点数（``None`` / 不可解析一律返回 ``None``）。"""
    if raw is None or isinstance(raw, bool):
        return None
    try:
        return float(raw)
    # `# fmt: skip`：括号不能省，否则 ruff format（target py314）会按 PEP 758
    # 改写成无括号形式，而 Cython 3.3.0 会把后者按 `except A as B:` 误解析。
    except (TypeError, ValueError):  # fmt: skip
        # 电量实体的历史里混着 ``unknown`` / ``unavailable`` 是常态，跳过但留痕。
        logger.debug("能耗回填：跳过非数值读数 %r", raw)
        return None


def _parse_history_time(raw: Any) -> datetime | None:
    text = str(raw or "").strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        logger.debug("能耗回填：无法解析的时间戳 %r", raw)
        return None
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)


def discover_energy_entities(
    entities: list[dict[str, Any]] | None,
    *,
    limit: int = MAX_BACKFILL_ENTITIES,
) -> dict[str, dict[str, Any]]:
    """从 HA 全量快照里挑出可回填的电量实体（entity_id → attributes）。

    ``attributes`` 存在时以 ``device_class``/``unit_of_measurement`` 为准（功率、电流、
    电压这类瞬时量会被 ``is_cumulative_energy_meter`` 拒掉）；缺失时才退回名字关键字，
    与实时链路的判定保持一致。
    """
    found: dict[str, dict[str, Any]] = {}
    for entity in entities or []:
        if not isinstance(entity, dict):
            continue
        entity_id = str(entity.get("entity_id") or "").strip()
        if not entity_id:
            continue
        attributes = entity.get("attributes")
        attrs = attributes if isinstance(attributes, dict) else {}
        if attrs:
            if not is_cumulative_energy_meter(attrs):
                continue
        elif not is_energy_meter_entity(entity_id):
            continue
        found[entity_id] = attrs
    if len(found) > limit:
        logger.info(
            "能耗回填：识别到 %s 个电量实体，本轮只处理前 %s 个（其余留待下一轮）",
            len(found),
            limit,
        )
        found = dict(sorted(found.items())[:limit])
    return found


def split_statistics_daily(
    statistics: list[dict[str, Any]] | None,
    timezone_name: str | None,
    *,
    since_day: str | None = None,
    attributes: dict[str, Any] | None = None,
) -> dict[str, float]:
    """把 HA 统计桶（``change`` 增量）按家庭时区归并成自然日用电量。"""
    per_day: dict[str, float] = {}
    for item in statistics or []:
        if not isinstance(item, dict):
            continue
        when = _parse_history_time(item.get("start") or item.get("end"))
        if when is None:
            continue
        day = business_day_key(when, timezone_name)
        if since_day is not None and day < since_day:
            continue
        change = _to_number(item.get("change"))
        if change is None or change <= 0:
            continue
        per_day[day] = per_day.get(day, 0.0) + reading_to_kwh(change, attributes)
    return per_day


def split_history_daily(
    history: list[dict[str, Any]] | None,
    timezone_name: str | None,
    *,
    since_day: str | None = None,
    attributes: dict[str, Any] | None = None,
) -> dict[str, float]:
    """把原始状态历史按「相邻读数差分」折算成自然日用电量。

    表底重置按 ``compute_meter_delta`` 的既有口径（重置后首段取重置后读数）计入，
    与实时链路同源，避免两条链路算出两套数字。
    """
    points: list[tuple[datetime, float]] = []
    for item in history or []:
        if not isinstance(item, dict):
            continue
        value = _to_number(item.get("state"))
        if value is None:
            continue
        when = _parse_history_time(item.get("last_updated") or item.get("last_changed"))
        if when is None:
            continue
        points.append((when, value))
    points.sort(key=lambda point: point[0])
    resolved_attrs = attributes or {"device_class": "energy", "unit_of_measurement": "kWh"}
    per_day: dict[str, float] = {}
    previous: float | None = None
    for when, value in points:
        if previous is not None:
            delta = compute_meter_delta(
                {"state": previous, "attributes": resolved_attrs},
                {"state": value, "attributes": resolved_attrs},
            )
            if delta > 0:
                day = business_day_key(when, timezone_name)
                if since_day is None or day >= since_day:
                    per_day[day] = per_day.get(day, 0.0) + delta
        previous = value
    return per_day


class EnergyBackfillService:
    """在全量快照到达后触发一次「发现电量实体 + 回填近 N 天」的旁路任务。"""

    def __init__(self, *, event_log: Any, ha: Any) -> None:
        self._event_log = event_log
        self._ha = ha
        self._loop: asyncio.AbstractEventLoop | None = None
        self._task: asyncio.Task[None] | None = None
        self._next_allowed_at = 0.0
        self._running = False

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def on_full_snapshot(self, entities: list[dict[str, Any]] | None) -> None:
        """快照到达：按节流策略排一次回填（同步调用，绝不阻塞快照处理）。"""
        if not entities or self._running:
            return
        now = time.monotonic()
        if now < self._next_allowed_at:
            return
        self._next_allowed_at = now + MIN_RUN_INTERVAL_SECONDS
        loop = self._loop
        if loop is None:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                logger.debug("能耗回填跳过：没有可用的事件循环")
                return
        self._task = self._spawn(loop, self._run(entities))

    def _allow_retry(self) -> None:
        """本轮没真正跑成（HA 未连接等）：把下一轮提前到几十秒后。"""
        self._next_allowed_at = min(self._next_allowed_at, time.monotonic() + RETRY_INTERVAL_SECONDS)

    def _spawn(self, loop: asyncio.AbstractEventLoop, coro) -> asyncio.Task[None] | None:
        try:
            if asyncio.get_running_loop() is loop:
                return loop.create_task(coro)
            loop.call_soon_threadsafe(lambda: loop.create_task(coro))
        except RuntimeError:
            logger.debug("能耗回填任务未调度：事件循环不可用")
        return None

    async def _run(self, entities: list[dict[str, Any]]) -> None:
        self._running = True
        try:
            connection = await asyncio.to_thread(self._ha.active_connection)
            if connection is None:
                logger.debug("能耗回填跳过：未配置 Home Assistant 连接")
                self._allow_retry()
                return
            candidates = discover_energy_entities(entities)
            if not candidates:
                logger.debug("能耗回填跳过：快照里没有累计型电量实体")
                return
            timezone_name = await asyncio.to_thread(self._event_log.ops_timezone_name)
            totals = await self._collect(connection, candidates, timezone_name)
            if not totals:
                logger.info("能耗回填：%s 个电量实体在窗口内没有可用读数", len(candidates))
                return
            written = await run_db(self._event_log.apply_energy_backfill, totals)
            logger.info(
                "能耗回填完成：实体 %s/%s，日行 %s，月行 %s",
                written.get("entities"),
                len(candidates),
                written.get("daily"),
                written.get("monthly"),
            )
        except asyncio.CancelledError:
            raise
        except Exception as error:  # 回填属旁路增强，失败不得影响状态管道
            logger.warning("能耗回填失败: %s", error, exc_info=True)
            self._allow_retry()
        finally:
            self._running = False

    async def _collect(
        self,
        connection: Any,
        candidates: dict[str, dict[str, Any]],
        timezone_name: str | None,
    ) -> dict[str, dict[str, float]]:
        now = datetime.now(UTC)
        since_day = business_day_key(now - timedelta(days=BACKFILL_DAYS - 1), timezone_name)
        totals: dict[str, dict[str, float]] = {}

        statistics = await self._fetch_statistics(connection, sorted(candidates))
        for entity_id, per_day in self._statistics_totals(statistics, candidates, timezone_name, since_day).items():
            if per_day:
                totals[entity_id] = per_day

        missing = [entity_id for entity_id in candidates if entity_id not in totals]
        if missing:
            totals.update(await self._history_totals(connection, missing, candidates, timezone_name, since_day, now))
        return totals

    async def _fetch_statistics(self, connection: Any, entity_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
        """取长期统计；命令不可用（旧版 HA / recorder 未开统计）时返回空表。"""
        start_time = (datetime.now(UTC) - timedelta(days=BACKFILL_DAYS + 1)).isoformat()
        try:
            client = await self._ha.client_for(connection)
            return await fetch_statistics(client, entity_ids, start_time, period="hour")
        except Exception as error:
            logger.debug("能耗回填：长期统计不可用，回退历史差分（%s）", error)
            return {}

    def _statistics_totals(
        self,
        statistics: dict[str, list[dict[str, Any]]],
        candidates: dict[str, dict[str, Any]],
        timezone_name: str | None,
        since_day: str,
    ) -> dict[str, dict[str, float]]:
        totals: dict[str, dict[str, float]] = {}
        for entity_id, buckets in statistics.items():
            if entity_id not in candidates:
                continue
            per_day = split_statistics_daily(
                buckets,
                timezone_name,
                since_day=since_day,
                attributes=candidates[entity_id],
            )
            if per_day:
                totals[entity_id] = per_day
        return totals

    async def _history_totals(
        self,
        connection: Any,
        entity_ids: list[str],
        candidates: dict[str, dict[str, Any]],
        timezone_name: str | None,
        since_day: str,
        now: datetime,
    ) -> dict[str, dict[str, float]]:
        fallback_days = min(HISTORY_FALLBACK_DAYS, BACKFILL_DAYS)
        hours = (fallback_days + 1) * 24
        start_time = (now - timedelta(hours=hours)).isoformat()
        # 多取一天做差分基线，只保留回退窗口内的自然日。
        fallback_since = business_day_key(now - timedelta(days=fallback_days - 1), timezone_name)
        totals: dict[str, dict[str, float]] = {}
        for entity_id in entity_ids:
            try:
                history = await self._ha.fetch_history(connection, entity_id, start_time, hours)
            except Exception as error:
                logger.debug("能耗回填历史读取失败 entity=%s: %s", entity_id, error)
                continue
            per_day = split_history_daily(
                history,
                timezone_name,
                since_day=min(fallback_since, since_day),
                attributes=candidates[entity_id],
            )
            if per_day:
                totals[entity_id] = per_day
        return totals


__all__ = [
    "BACKFILL_DAYS",
    "EnergyBackfillService",
    "discover_energy_entities",
    "split_history_daily",
    "split_statistics_daily",
]
