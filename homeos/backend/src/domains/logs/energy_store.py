"""能耗聚合的持久化与回填（从 ``event_log`` 拆出）。

这一层只做「把已经算好的日/月总量写进 ``EnergyUsageDaily`` / ``EnergyUsageMonthly``」，
包括三类写入语义：

- **实时增量**：读数差分累加，带数量级护栏（首次读数跳变不能当用电）；
- **历史回填**：只增不减，补上漏掉的部分；
- **账单口径**（国网/电费账户列表）：历史日与月双向覆盖，允许下调 —— 只增不减无法
  修掉「4209 kWh/天」这类由基线缺失写进去的脏值。

拆出的原因：``event_log.py`` 已贴着 ``check:file-size`` 的棘轮上限，而这三类写入
共享同一套「主电表过滤 / 候选登记 / 落库」口径，放在一起才看得出它们必须一致。
"""

from __future__ import annotations

import logging
from statistics import median
from typing import Any

from sqlalchemy import delete, func, select

from .energy_aggregate import (
    _merge_backfill_daily,
    _merge_backfill_monthly,
    _normalize_backfill_months,
    _normalize_backfill_totals,
    _register_backfill_candidates,
    accumulate_energy_totals,
)
from .energy_guard import drop_implausible_days, is_implausible_day, is_implausible_month, load_day_peers
from .energy_units import unit_for_entity
from .event_log_report import _resolve_ops_timezone_name
from .event_log_tier import is_billing_snapshot_entity, is_energy_meter_state
from ..client_power.energy_meter import normalize_meter_scope
from ...platform.core.db.models import (
    EnergyCandidateEntity,
    EnergyUsageDaily,
    EnergyUsageHourly,
    EnergyUsageMonthly,
)

logger = logging.getLogger("homeos.event_log")


class EnergyStoreMixin:
    """能耗副作用与历史回填（宿主注入 ``_database`` 与两个绑定回调）。"""

    #: 宿主装配期注入（见 ``EventLogService.__init__``）。
    _database: Any
    _energy_primary_entities: Any
    _energy_bindings: Any

    def _resolve_energy_primary_entities(self) -> set[str]:
        """本次应计入总耗的电表集合；未绑定主电表时返回空集合（调用方回退全量）。"""
        try:
            return {str(item).strip() for item in (self._energy_primary_entities() or ()) if str(item).strip()}
        except Exception as error:  # 配置读取失败不该带塌能耗聚合
            logger.debug("能耗主电表读取失败，回退全量识别: %s", error)
            return set()

    def _resolve_energy_circuit_entities(self) -> set[str]:
        """分回路电量表集合；读取失败按空集处理（回路排行只是增强）。"""
        try:
            return {str(item).strip() for item in (self._energy_circuit_entities() or ()) if str(item).strip()}
        except Exception as error:
            logger.debug("分回路配置读取失败，按无回路处理: %s", error)
            return set()

    def circuit_entity_ids(self) -> set[str]:
        """公开只读口径（回填旁路要把回路表也纳入候选）。"""
        return self._resolve_energy_circuit_entities()

    def _resolve_energy_bindings(self) -> dict[str, str]:
        """能源绑定全貌：``{primary, scope, day, month}``。

        未注入 bindings 时只保留主表集合（老调用方/测试），口径按 ``total`` 处理、
        不启用日/月权威表 —— 行为与只有主表时完全一致。
        """
        if self._energy_bindings is None:
            primary = self._resolve_energy_primary_entities()
            only = next(iter(primary)) if len(primary) == 1 else ""
            return {"primary": only, "scope": "total", "day": "", "month": ""}
        try:
            raw = self._energy_bindings() or {}
        except Exception as error:  # 配置读取失败时退回「只有主表」的保守口径
            logger.debug("能耗绑定读取失败，按主表保守处理: %s", error)
            raw = {}
        return {
            "primary": str(raw.get("primary") or "").strip(),
            "scope": normalize_meter_scope(raw.get("scope")),
            "day": str(raw.get("day") or "").strip(),
            "month": str(raw.get("month") or "").strip(),
        }

    def _apply_energy_side_effects(self, batch: list[dict[str, Any]]) -> None:
        """把本批的电表读数并入日/月聚合。

        **整个函数体一个字都不能漏在 try 之外**。这条路径的调用方
        （``EventLogService._write_batch``）此时**已经提交了显示行**，任何冒泡出去的异常
        都会被 ``flush`` 当成「整批没写成」回灌，于是下一轮把同一批显示行再写一遍。
        11-18 → 11-21 的 1200 万行重复正是这样产生的：``accumulate_energy_totals`` 因
        缺少 ``created_at`` 抛 KeyError，而它当时位于 try 之外，每轮 flush 重写一遍显示行、
        再因同一个 KeyError 回灌，如此循环三天半。

        换句话说：这里失败只应损失一次能耗记账的精度，绝不能让事件日志重复。
        """
        try:
            self._merge_energy_totals(batch)
        except Exception as error:
            logger.warning("能源副作用维护失败（已隔离，不影响事件日志批次）: %s", error, exc_info=True)

    def _merge_energy_totals(self, batch: list[dict[str, Any]]) -> None:
        energy_ids = sorted(
            {
                row["entity_id"]
                for row in batch
                if is_energy_meter_state(row["entity_id"], row["old_state"], row["new_state"])
                and row["old_state"]
                and row["new_state"]
            }
        )
        # 日切/月切跟随家庭时区（ops.homeTimezone），与前端报表口径一致。
        timezone_name = _resolve_ops_timezone_name(self._ops)
        # 绑定了主电表就只聚它：HA 里同表的日/月/年累计与各回路电量表都算进来，
        # 会让「今日用电」凭空翻几倍。未绑定时（老装机）保持全量识别。
        day_totals, month_totals, hour_totals, reset_count = accumulate_energy_totals(
            batch,
            self._resolve_energy_primary_entities(),
            self._resolve_energy_bindings(),
            timezone_name,
            self._resolve_energy_circuit_entities(),
        )
        _log_meter_resets(reset_count)
        if not energy_ids and not day_totals and not month_totals and not hour_totals:
            return
        with self._database.session_factory() as session:
            _register_energy_candidates(session, energy_ids)
            # 一次取回本批涉及的日/月聚合行：旧实现对每个 (实体, 日) 各查一次，
            # 一次同步几十个实体 × 多个自然日就是几十次数据库往返。
            daily_rows = _load_daily_rows(session, day_totals)
            monthly_rows = _load_monthly_rows(session, month_totals)
            accepted, rejected = _guard_realtime_days(session, day_totals, daily_rows)
            _write_daily_rows(session, accepted, daily_rows)
            monthly_totals = _guard_month_readings(session, month_totals)
            _write_monthly_rows(session, monthly_totals, monthly_rows, rejected)
            # 小时行只服务峰谷计价，量级是日行的 24 倍 —— 单独一张表、单独写入，
            # 且**不受**月度护栏影响（护栏判的是「整月总量跳变」，与小时无关）。
            _write_hourly_rows(session, hour_totals)
            session.commit()

    # ---- 能耗历史回填 ----
    def ops_timezone_name(self) -> str | None:
        """家庭业务时区（能耗日切/月切口径，取自 ``ops.homeTimezone``）。"""
        return _resolve_ops_timezone_name(self._ops)

    def energy_primary_entities(self) -> set[str]:
        """能耗绑定的主电表集合（回填与报表共用的只读口径）。

        公开出来供回填旁路决定「国网账户数据该归到哪个实体」：报表 / Agent 只读主表，
        写到别处等于永远不展示。
        """
        return self._resolve_energy_primary_entities()

    def purge_billing_snapshot_rows(self) -> dict[str, int]:
        """清掉账单快照实体在日/月聚合表里的历史脏行（一次性自愈）。

        ``*_last_month_ele_num`` 曾被当成累计表差分，把整月总量写成某一天的用量
        （实测 ``297 kWh`` 落在 11-02）。新链路已经不再采集这类实体，但旧库里的行
        不会自己消失；报表虽然已按白名单剔除，直接查库 / 后续改口径时仍会被它误导。
        返回值是删除行数，全为 0 时调用方不必记日志。
        """
        try:
            with self._database.session_factory() as session:
                entity_ids = [
                    str(entity_id) for (entity_id,) in session.execute(select(EnergyCandidateEntity.entity_id)).all()
                ]
                stale = [entity_id for entity_id in entity_ids if is_billing_snapshot_entity(entity_id)]
                if not stale:
                    return {"daily": 0, "monthly": 0, "entities": 0}
                daily = session.execute(delete(EnergyUsageDaily).where(EnergyUsageDaily.entity_id.in_(stale)))
                monthly = session.execute(delete(EnergyUsageMonthly).where(EnergyUsageMonthly.entity_id.in_(stale)))
                session.execute(delete(EnergyCandidateEntity).where(EnergyCandidateEntity.entity_id.in_(stale)))
                session.commit()
        except Exception as error:
            logger.warning("清理账单快照用量行失败: %s", error)
            return {"daily": 0, "monthly": 0, "entities": 0}
        return {
            "daily": int(daily.rowcount or 0),
            "monthly": int(monthly.rowcount or 0),
            "entities": len(stale),
        }

    def apply_energy_backfill(
        self,
        totals: dict[str, dict[str, float]],
        *,
        monthly: dict[str, dict[str, float]] | None = None,
        authoritative_days: dict[str, dict[str, float]] | None = None,
        authoritative_months: dict[str, dict[str, float]] | None = None,
    ) -> dict[str, int]:
        """把历史回填的日/月用电量合并进聚合表。

        两种口径刻意分开：

        - ``totals`` / ``monthly``：**只增不减**（``max``）。实时链路可能已经为同一天写过
          一部分增量，回填只补漏掉的部分，重复执行不会把用电量翻倍。月份总量在日行落库后
          按**当月全部日行**重新求和 —— 回填窗口常常只覆盖当月的一部分天。
        - ``authoritative_days`` / ``authoritative_months``：**账单级双向覆盖**。国网给的
          日/月用量是结算口径，真实值可能比库里已经写进去的更小（例如由「首次读数跳变」
          算出的 4209 kWh/天）。只增不减永远修不掉这种脏值，所以权威来源直接改写，
          包括下调；重复执行仍然幂等（写入同一个值）。

        两类写入前都会过一遍数量级护栏（:mod:`energy_guard`）：非权威值若超过同实体
        近 30 天中位数的 20 倍且绝对值 > 300 kWh，判为「基线缺失」丢弃并告警。
        """
        day_values = _normalize_backfill_totals(totals)
        month_values = _normalize_backfill_months(monthly)
        forced_days = set(_normalize_backfill_totals(authoritative_days))
        forced_months = set(_normalize_backfill_months(authoritative_months))
        # 权威值并进同一张表：同一 (实体, 日) 两边都有时以账单为准。
        day_values.update(_normalize_backfill_totals(authoritative_days))
        month_values.update(_normalize_backfill_months(authoritative_months))
        if not day_values and not month_values:
            return {"daily": 0, "monthly": 0, "entities": 0}
        # 回填同样只认主电表，否则「日/月/年累计 + 各回路表」会被各写一份日行，
        # 与实时链路口径不一致、也让报表总量重复。国网账户在调用方已归到目标实体
        # （主表或账户实体），因此这里不再需要「跳过主表过滤」的特殊开关。
        primary_entities = self._resolve_energy_primary_entities()
        circuits = self._resolve_energy_circuit_entities()
        if primary_entities:
            # 账单级权威值即使不在主表名下也照写：那是另一个户号自己的账户历史，
            # 存在它自己的实体行上，报表按主表过滤时自然不会计入合计。丢掉它等于
            # 用户换绑/补绑主表时又要重新等一次集成刷新。
            day_values = {
                key: value
                for key, value in day_values.items()
                if key[0] in primary_entities or key[0] in circuits or key in forced_days
            }
            month_values = {
                key: value
                for key, value in month_values.items()
                if key[0] in primary_entities or key[0] in circuits or key in forced_months
            }
            forced_days = {key for key in forced_days if key in day_values}
            forced_months = {key for key in forced_months if key in month_values}
            if not day_values and not month_values:
                return {"daily": 0, "monthly": 0, "entities": 0}
        try:
            with self._database.session_factory() as session:
                if day_values:
                    peers = load_day_peers(
                        session,
                        {entity_id for entity_id, _ in day_values},
                        exclude_days=set(day_values),
                    )
                    day_values = drop_implausible_days(day_values, peers, keep_keys=forced_days)
                entities = sorted({entity_id for entity_id, _ in day_values} | {e for e, _ in month_values})
                if not entities:
                    return {"daily": 0, "monthly": 0, "entities": 0}
                days = sorted({day for _, day in day_values})
                months = sorted({month for _, month in month_values} | {day[:7] for day in days})
                # 本月日行被账单口径改写过的月份：日行落库后必须重算月表，
                # 否则「日行已修正、月行仍是 4626」会长期存在。
                refresh_months = {(entity_id, day[:7]) for entity_id, day in forced_days}
                _register_backfill_candidates(session, entities)
                daily_written = _merge_backfill_daily(session, day_values, entities, days, forced_days)
                session.flush()
                monthly_written = _merge_backfill_monthly(
                    session, entities, months, month_values, forced_months, refresh_months
                )
                session.commit()
        except Exception as error:
            logger.warning("能耗历史回填落库失败: %s", error)
            return {"daily": 0, "monthly": 0, "entities": 0}
        return {"daily": daily_written, "monthly": monthly_written, "entities": len(entities)}


def _log_meter_resets(reset_count: dict[str, int]) -> None:
    if not reset_count:
        return
    logger.info(
        "检测到电量表底重置: %s（该区间按重置后累积量计入日/月用电）",
        ", ".join(f"{entity_id}×{count}" for entity_id, count in reset_count.items()),
    )


def _register_energy_candidates(session: Any, energy_ids: list[str]) -> None:
    """把本批出现的电表登记为能耗候选（报表按这张白名单筛实体）。"""
    if not energy_ids:
        return
    known_ids = set(
        session.scalars(select(EnergyCandidateEntity.entity_id).where(EnergyCandidateEntity.entity_id.in_(energy_ids)))
    )
    session.add_all(
        EnergyCandidateEntity(entity_id=entity_id) for entity_id in energy_ids if entity_id not in known_ids
    )


def _load_daily_rows(
    session: Any, day_totals: dict[tuple[str, str], dict[str, Any]]
) -> dict[tuple[Any, Any], EnergyUsageDaily]:
    if not day_totals:
        return {}
    return {
        (row.entity_id, row.day): row
        for row in session.scalars(
            select(EnergyUsageDaily).where(
                EnergyUsageDaily.entity_id.in_({entity_id for entity_id, _ in day_totals}),
                EnergyUsageDaily.day.in_({day for _, day in day_totals}),
            )
        )
    }


def _load_hourly_rows(
    session: Any, hour_totals: dict[tuple[str, str], dict[str, Any]]
) -> dict[tuple[Any, Any], EnergyUsageHourly]:
    if not hour_totals:
        return {}
    return {
        (row.entity_id, row.hour): row
        for row in session.scalars(
            select(EnergyUsageHourly).where(
                EnergyUsageHourly.entity_id.in_({entity_id for entity_id, _ in hour_totals}),
                EnergyUsageHourly.hour.in_({hour for _, hour in hour_totals}),
            )
        )
    }


def _write_hourly_rows(
    session: Any,
    hour_totals: dict[tuple[str, str], dict[str, Any]],
) -> None:
    """小时增量累加（只增不减：同一小时可能分多批到达）。

    与日行的差别：小时行**不做**权威读数覆盖 —— 权威表只有日/月两种口径，
    没有「本小时最大值」这种东西，硬套会把这个小时写成累计量。
    """
    if not hour_totals:
        return
    existing = _load_hourly_rows(session, hour_totals)
    for (entity_id, hour), value in hour_totals.items():
        kwh = float(value.get("kwh") or 0.0)
        if kwh <= 0:
            continue
        row = existing.get((entity_id, hour))
        if row is None:
            session.add(
                EnergyUsageHourly(
                    entity_id=entity_id,
                    hour=hour,
                    kwh=kwh,
                    unit=unit_for_entity(entity_id),
                    sample_count=int(value.get("count") or 0),
                )
            )
        else:
            row.kwh += kwh
            row.sample_count += int(value.get("count") or 0)


def _load_monthly_rows(
    session: Any, month_totals: dict[tuple[str, str], dict[str, Any]]
) -> dict[tuple[Any, Any], EnergyUsageMonthly]:
    if not month_totals:
        return {}
    return {
        (row.entity_id, row.month): row
        for row in session.scalars(
            select(EnergyUsageMonthly).where(
                EnergyUsageMonthly.entity_id.in_({entity_id for entity_id, _ in month_totals}),
                EnergyUsageMonthly.month.in_({month for _, month in month_totals}),
            )
        )
    }


def _guard_realtime_days(
    session: Any,
    day_totals: dict[tuple[str, str], dict[str, Any]],
    daily_rows: dict[tuple[Any, Any], EnergyUsageDaily],
) -> tuple[dict[tuple[str, str], dict[str, Any]], dict[tuple[str, str], float]]:
    """数量级护栏：把「当天累计」推到中位数 × 20 且 > 300 kWh 的增量丢掉。

    日/月两档来自同一条读数跳变：日行被丢弃后，月行必须把同一笔增量扣掉，
    否则「日表干净、月表 4398」—— 实测过这个组合。
    返回（放行的日行, 按月份累计的被丢弃增量）。
    """
    peers = load_day_peers(session, {entity_id for entity_id, _ in day_totals}, exclude_days=set(day_totals))
    accepted: dict[tuple[str, str], dict[str, Any]] = {}
    rejected: dict[tuple[str, str], float] = {}
    for (entity_id, day), value in day_totals.items():
        row = daily_rows.get((entity_id, day))
        candidate = _day_candidate(value, row)
        if not is_implausible_day(candidate, peers.get(entity_id, [])):
            accepted[(entity_id, day)] = value
            continue
        logger.warning(
            "能耗：丢弃数量级异常的单日增量 entity=%s day=%s 累计=%.0f kWh（疑似首次读数/基线缺失）",
            entity_id,
            day,
            candidate,
        )
        if value.get("mode") != "reading":
            month_key = (entity_id, day[:7])
            rejected[month_key] = rejected.get(month_key, 0.0) + float(value["kwh"])
    return accepted, rejected


def _day_candidate(value: dict[str, Any], row: EnergyUsageDaily | None) -> float:
    """这一笔写入后的「当天累计」；读数模式直接看读数，差分模式叠加已有行。"""
    if value.get("mode") == "reading":
        return float(value["kwh"])
    if row is None:
        return float(value["kwh"])
    return float(row.kwh or 0.0) + float(value["kwh"])


def _guard_month_readings(
    session: Any,
    month_totals: dict[tuple[str, str], dict[str, Any]],
) -> dict[tuple[str, str], dict[str, Any]]:
    """月表「权威读数」的数量级护栏（``meterScope=month`` 时才会走到）。

    月读数是整月表底（例如 4217 kWh），一旦来自首次读数跳变，它会**覆盖**整月总量，
    日行护栏拦不住 —— 实测这种组合会让 Y 窗口直接显示 4217。基线只能是「该月已有的
    日行之和」（两者语义上应当相等）或其它月份的中位数；两者都没有时不拦（无从判断）。
    """
    readings = {key: value for key, value in month_totals.items() if value.get("mode") == "reading"}
    if not readings:
        return month_totals
    kept = dict(month_totals)
    for (entity_id, month), value in readings.items():
        baseline = _month_baselines(session, entity_id, month)
        if not is_implausible_month(float(value["kwh"]), baseline):
            continue
        logger.warning(
            "能耗：丢弃数量级异常的月度读数 entity=%s month=%s value=%.0f kWh baseline=%.0f（疑似首次读数/基线缺失）",
            entity_id,
            month,
            float(value["kwh"]),
            baseline,
        )
        del kept[(entity_id, month)]
    return kept


def _month_baselines(session: Any, entity_id: str, month: str) -> float:
    """该月可比的基线：同月日行之和，或其它月份月行的中位数（取较大者）。"""
    day_sum = session.execute(
        select(func.coalesce(func.sum(EnergyUsageDaily.kwh), 0.0)).where(
            EnergyUsageDaily.entity_id == entity_id,
            EnergyUsageDaily.day >= f"{month}-01",
            EnergyUsageDaily.day <= f"{month}-31",
        )
    ).scalar()
    others = session.scalars(
        select(EnergyUsageMonthly.kwh).where(
            EnergyUsageMonthly.entity_id == entity_id,
            EnergyUsageMonthly.month != month,
        )
    ).all()
    candidates = [float(day_sum or 0.0)]
    positive = [float(item) for item in others if float(item or 0.0) > 0]
    if positive:
        candidates.append(float(median(positive)))
    return max(candidates)


def _write_daily_rows(
    session: Any,
    accepted: dict[tuple[str, str], dict[str, Any]],
    daily_rows: dict[tuple[Any, Any], EnergyUsageDaily],
) -> None:
    for (entity_id, day), value in accepted.items():
        row = daily_rows.get((entity_id, day))
        if row is None:
            row = EnergyUsageDaily(
                entity_id=entity_id,
                day=day,
                kwh=value["kwh"],
                unit=unit_for_entity(entity_id),
                sample_count=int(value["count"]),
            )
            daily_rows[(entity_id, day)] = row
            session.add(row)
        elif value.get("mode") == "reading":
            # 权威读数直接覆盖：同一周期内读数单调递增，覆盖不会丢量，
            # 也不会把「先差分、后补绑权威表」的当天用量叠加成两倍。
            row.kwh = value["kwh"]
            row.sample_count = max(row.sample_count, int(value["count"]))
        else:
            row.kwh += value["kwh"]
            row.sample_count += int(value["count"])


def _write_monthly_rows(
    session: Any,
    month_totals: dict[tuple[str, str], dict[str, Any]],
    monthly_rows: dict[tuple[Any, Any], EnergyUsageMonthly],
    rejected_kwh: dict[tuple[str, str], float],
) -> None:
    for (entity_id, month), value in month_totals.items():
        accepted = _month_after_rejection(entity_id, month, value, rejected_kwh)
        if accepted is None:
            continue
        row = monthly_rows.get((entity_id, month))
        if row is None:
            row = EnergyUsageMonthly(
                entity_id=entity_id,
                month=month,
                kwh=accepted["kwh"],
                unit=unit_for_entity(entity_id),
                sample_count=int(accepted["count"]),
            )
            monthly_rows[(entity_id, month)] = row
            session.add(row)
        elif accepted.get("mode") == "reading":
            row.kwh = accepted["kwh"]
            row.sample_count = max(row.sample_count, int(accepted["count"]))
        else:
            row.kwh += accepted["kwh"]
            row.sample_count += int(accepted["count"])


def _month_after_rejection(
    entity_id: str,
    month: str,
    value: dict[str, Any],
    rejected_kwh: dict[tuple[str, str], float],
) -> dict[str, Any] | None:
    """扣掉本月被护栏丢弃的增量；整月都来自跳变时返回 ``None``（一个字都不写）。"""
    rejected = rejected_kwh.get((entity_id, month), 0.0)
    if rejected <= 0 or value.get("mode") == "reading":
        return value
    remaining = float(value["kwh"]) - rejected
    if remaining <= 0:
        return None
    return {**value, "kwh": remaining}
