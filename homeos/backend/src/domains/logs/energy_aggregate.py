"""能耗聚合：把事件流的读数折成「日/月用量」并落库前的合并规则。

从 ``event_log`` 拆出来只想清楚一件事：这一层是**纯计算 + 少量批量 SQL**，
不含订阅、缓冲、清空世代等运行时职责。也正因为口径规则（哪一档粒度由哪块表提供）
集中在这里，向导/报表只消费结论，不再各自实现一遍。

两路数据来源，同一周期只取一个值：

- **权威读数**：绑定的日/月累计表（或口径本身就是日/月的主表）在周期内的最大读数。
  清零后读数就是该周期用量，跨零点没采到也不影响。
- **差分**：主表相邻读数的正向增量之和。作为没有权威读数时的兜底（表掉线仍有数）。
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import func, select

from .event_log_tier import is_energy_meter_state
from ..client_power.energy_meter import (
    business_day_key,
    business_month_key,
    compute_meter_delta,
    is_cumulative_energy_meter,
    is_meter_reset,
    latest_reading_kwh,
)
from ...platform.core.db.models import (
    EnergyCandidateEntity,
    EnergyUsageDaily,
    EnergyUsageMonthly,
)

logger = logging.getLogger(__name__)


def _next_month_key(month: str) -> str:
    """``"2026-12"`` → ``"2027-01"``（用于月范围的右开边界）。"""
    year_text, month_text = month.split("-")[:2]
    year, month_number = int(year_text), int(month_text)
    return f"{year + 1}-01" if month_number >= 12 else f"{year}-{month_number + 1:02d}"


def _normalize_backfill_totals(
    totals: dict[str, dict[str, float]] | None,
) -> dict[tuple[str, str], float]:
    """把 ``{entity: {day: kwh}}`` 摊平成 ``(entity, day) → kwh``：丢非法值、同日取最大。"""
    day_values: dict[tuple[str, str], float] = {}
    for entity_id, per_day in (totals or {}).items():
        if not isinstance(per_day, dict):
            continue
        for day, kwh in per_day.items():
            try:
                value = float(kwh)
            # `# fmt: skip`：括号不能省，否则 ruff format（target py314）会按 PEP 758
            # 改写成无括号形式，而 Cython 3.3.0 会把后者按 `except A as B:` 误解析。
            except (TypeError, ValueError):  # fmt: skip
                logger.debug("能耗回填：跳过非法用电量 %r", kwh)
                continue
            if value <= 0:
                continue
            key = (str(entity_id), str(day))
            day_values[key] = max(day_values.get(key, 0.0), value)
    return day_values


def _register_backfill_candidates(session: Any, entities: list[str]) -> None:
    """把回填命中的实体登记为能耗候选（报表按这张白名单筛实体）。"""
    known_ids = set(
        session.scalars(select(EnergyCandidateEntity.entity_id).where(EnergyCandidateEntity.entity_id.in_(entities)))
    )
    session.add_all(EnergyCandidateEntity(entity_id=entity_id) for entity_id in entities if entity_id not in known_ids)


def _merge_backfill_daily(
    session: Any,
    day_values: dict[tuple[str, str], float],
    entities: list[str],
    days: list[str],
) -> int:
    """按 (实体, 日) 合并日行：缺失则插入，已有只在更大时覆盖（只增不减）。"""
    daily_rows = {
        (row.entity_id, row.day): row
        for row in session.scalars(
            select(EnergyUsageDaily).where(
                EnergyUsageDaily.entity_id.in_(entities),
                EnergyUsageDaily.day.in_(days),
            )
        )
    }
    written = 0
    for (entity_id, day), value in day_values.items():
        row = daily_rows.get((entity_id, day))
        if row is None:
            session.add(EnergyUsageDaily(entity_id=entity_id, day=day, kwh=value, sample_count=1))
            written += 1
        elif value > float(row.kwh or 0.0) + 1e-9:
            row.kwh = value
            written += 1
    return written


def _merge_backfill_monthly(session: Any, entities: list[str], months: list[str]) -> int:
    """月行按当月全部日行求和后合并：跨月窗口不会被写成「窗口内总量」。"""
    month_start = f"{months[0]}-01"
    month_end = f"{_next_month_key(months[-1])}-01"
    monthly_rows = {
        (row.entity_id, row.month): row
        for row in session.scalars(
            select(EnergyUsageMonthly).where(
                EnergyUsageMonthly.entity_id.in_(entities),
                EnergyUsageMonthly.month.in_(months),
            )
        )
    }
    month_sums = session.execute(
        select(
            EnergyUsageDaily.entity_id,
            func.substr(EnergyUsageDaily.day, 1, 7),
            func.sum(EnergyUsageDaily.kwh),
        )
        .where(
            EnergyUsageDaily.entity_id.in_(entities),
            EnergyUsageDaily.day >= month_start,
            EnergyUsageDaily.day < month_end,
        )
        .group_by(EnergyUsageDaily.entity_id, func.substr(EnergyUsageDaily.day, 1, 7))
    ).all()
    written = 0
    for entity_id, month, total in month_sums:
        if month not in months:
            continue
        value = max(float(total or 0.0), 0.0)
        row = monthly_rows.get((entity_id, month))
        if row is None:
            session.add(EnergyUsageMonthly(entity_id=entity_id, month=month, kwh=value, sample_count=1))
            written += 1
        elif value > float(row.kwh or 0.0) + 1e-9:
            row.kwh = value
            written += 1
    return written


def _reading_kwh(row: dict[str, Any]) -> float:
    """取一条状态变更后的表底读数（折算成 kWh）；无效或非累计电量返回 0。"""
    new_state = row["new_state"]
    attrs = new_state.get("attributes") if isinstance(new_state, dict) else None
    if not is_cumulative_energy_meter(attrs if isinstance(attrs, dict) else None):
        return 0.0
    return latest_reading_kwh(new_state)


def _merge_grain_totals(
    delta_totals: dict[str, dict[str, float]],
    reading_totals: dict[str, float],
) -> dict[str, dict[str, Any]]:
    """合并「差分求和」与「直接读表」两种来源，每档粒度只出一个值。

    有权威读数的周期用读数（账本级精度，不受跨零点离线影响），没有读数的周期
    回退到差分 —— 权威表掉线时仍然有数，而不是整天是 0。
    """
    merged: dict[str, dict[str, Any]] = {}
    for key, entry in delta_totals.items():
        merged[key] = {"kwh": entry["kwh"], "count": entry["count"], "mode": "delta"}
    for key, kwh in reading_totals.items():
        # 读数覆盖差分：同一周期内读数是单调的真值，覆盖比累加安全；
        # 也避免用户中途补绑权威表时，当天已有的差分增量被再叠一次。
        merged[key] = {
            "kwh": kwh,
            "count": max(int(merged.get(key, {}).get("count", 1)), 1),
            "mode": "reading",
        }
    return merged


def _accumulate_per_entity(
    batch: list[dict[str, Any]],
    primary_entities: set[str],
    timezone_name: str | None,
) -> tuple[
    dict[tuple[str, str], dict[str, Any]],
    dict[tuple[str, str], dict[str, Any]],
    dict[str, int],
]:
    """未绑定主电表时的回退路径：每一块识别到的电量表各写一份增量（老装机不丢数据）。"""
    day_totals: dict[tuple[str, str], dict[str, Any]] = {}
    month_totals: dict[tuple[str, str], dict[str, Any]] = {}
    reset_count: dict[str, int] = {}
    for row in batch:
        entity_id = row["entity_id"]
        if not is_energy_meter_state(entity_id, row["old_state"], row["new_state"]):
            continue
        if primary_entities and entity_id not in primary_entities:
            continue
        if is_meter_reset(row["old_state"], row["new_state"]):
            reset_count[entity_id] = reset_count.get(entity_id, 0) + 1
        delta = compute_meter_delta(row["old_state"], row["new_state"])
        if delta <= 0:
            continue
        created_at = row["created_at"]
        day_entry = day_totals.setdefault(
            (entity_id, business_day_key(created_at, timezone_name)),
            {"kwh": 0.0, "count": 0, "mode": "delta"},
        )
        day_entry["kwh"] += delta
        day_entry["count"] += 1
        month_entry = month_totals.setdefault(
            (entity_id, business_month_key(created_at, timezone_name)),
            {"kwh": 0.0, "count": 0, "mode": "delta"},
        )
        month_entry["kwh"] += delta
        month_entry["count"] += 1
    return day_totals, month_totals, reset_count


def accumulate_energy_totals(
    batch: list[dict[str, Any]],
    primary_entities: set[str],
    bindings: dict[str, str],
    timezone_name: str | None,
) -> tuple[
    dict[tuple[str, str], dict[str, Any]],
    dict[tuple[str, str], dict[str, Any]],
    dict[str, int],
]:
    """把一批状态变更折成 (实体, 日) / (实体, 月) 用量与表底重置计数。

    ``primary_entities`` 非空时只有这些表参与差分：一块物理表常同时暴露日/月/年累计，
    再叠加各回路电量表，全部累加会把同一度电重复计费。为空（老装机未绑定）时全量识别。

    ``bindings`` 决定每一档粒度的权威来源：绑了日累计表就用它的周期内最大读数当当日用量，
    绑了月累计表同理；没有权威表的粒度仍走主表差分求和。两种来源在同一周期只取一个值，
    不会重复计费。
    """
    scope = bindings.get("scope") or "total"
    primary = bindings.get("primary") or ""
    if not primary:
        return _accumulate_per_entity(batch, primary_entities, timezone_name)
    # 权威读数来源：主表口径匹配时主表本身就是权威表，佐证表优先于「口径不匹配的主表」。
    day_sources = {source for source in (bindings.get("day"), primary if scope == "day" else "") if source}
    month_sources = {source for source in (bindings.get("month"), primary if scope == "month" else "") if source}
    day_deltas, month_deltas, day_readings, month_readings, reset_count = _collect_bound_points(
        batch, primary, primary_entities, day_sources, month_sources, timezone_name
    )
    # 读数统一记在主表名下：报表按主表过滤、by_entity 语义都不变，
    # 否则日/月表会作为独立实体再被求和一次。
    return (
        {(primary, key): value for key, value in _merge_grain_totals(day_deltas, day_readings).items()},
        {(primary, key): value for key, value in _merge_grain_totals(month_deltas, month_readings).items()},
        reset_count,
    )


def _collect_bound_points(
    batch: list[dict[str, Any]],
    primary: str,
    primary_entities: set[str],
    day_sources: set[str],
    month_sources: set[str],
    timezone_name: str | None,
) -> tuple[
    dict[str, dict[str, float]],
    dict[str, dict[str, float]],
    dict[str, float],
    dict[str, float],
    dict[str, int],
]:
    """逐条变更收集「权威读数」与「主表差分」两路数据。"""
    day_deltas: dict[str, dict[str, float]] = {}
    month_deltas: dict[str, dict[str, float]] = {}
    day_readings: dict[str, float] = {}
    month_readings: dict[str, float] = {}
    reset_count: dict[str, int] = {}
    for row in batch:
        entity_id = row["entity_id"]
        if not is_energy_meter_state(entity_id, row["old_state"], row["new_state"]):
            continue
        created_at = row["created_at"]
        # 权威读数：与差分互斥，只在该表确实是本粒度的权威来源时收集。
        if entity_id in day_sources:
            _bump_reading(day_readings, business_day_key(created_at, timezone_name), row)
        if entity_id in month_sources:
            _bump_reading(month_readings, business_month_key(created_at, timezone_name), row)
        # 绑定模式下差分只认主表：佐证表的读数是「月内/日内累计」，当增量累加会
        # 把整月电量摊进当天（月表 155 kWh 会被当成今天用了 35 kWh）。
        if entity_id != primary:
            continue
        if primary_entities and entity_id not in primary_entities:
            continue
        _accumulate_primary_delta(day_deltas, month_deltas, reset_count, row, entity_id, created_at, timezone_name)
    return day_deltas, month_deltas, day_readings, month_readings, reset_count


def _bump_reading(readings: dict[str, float], key: str, row: dict[str, Any]) -> None:
    """同一周期内取最大读数：读数单调递增，最大值即该周期的完整用量。"""
    readings[key] = max(readings.get(key, 0.0), _reading_kwh(row))


def _accumulate_primary_delta(
    day_deltas: dict[str, dict[str, float]],
    month_deltas: dict[str, dict[str, float]],
    reset_count: dict[str, int],
    row: dict[str, Any],
    entity_id: str,
    created_at: Any,
    timezone_name: str | None,
) -> None:
    """把主表一条变更的增量累加进日/月桶（跨零点离线时作为权威读数的兜底）。"""
    if is_meter_reset(row["old_state"], row["new_state"]):
        # 表底重置会让该区间增量等于「重置后累积量」，属预期口径，
        # 但必须留下痕迹，避免报表出现无法解释的用电跳变时无据可查。
        reset_count[entity_id] = reset_count.get(entity_id, 0) + 1
    delta = compute_meter_delta(row["old_state"], row["new_state"])
    if delta <= 0:
        return
    day_entry = day_deltas.setdefault(business_day_key(created_at, timezone_name), {"kwh": 0.0, "count": 0})
    day_entry["kwh"] += delta
    day_entry["count"] += 1
    month_entry = month_deltas.setdefault(business_month_key(created_at, timezone_name), {"kwh": 0.0, "count": 0})
    month_entry["kwh"] += delta
    month_entry["count"] += 1


__all__ = [
    "accumulate_energy_totals",
]
