"""国网 / 电费账户实体的日、月用电列表解析。

一个户号在 HA 里可能以两种形态出现，两种都要认：

1. **厂商 state_grid 集成**：
   - ``sensor.state_grid_<userId>_recent_30_daily_ele_list``：近 30 天日用电，
     ``attributes.graph[]`` 每项 ``{day: "YYYYMMDD", ele, p_ele, v_ele, n_ele, t_ele}``；
   - ``sensor.state_grid_<userId>_recent_12_monthly_ele_list``：同形状，``day`` 为 ``YYYYMM``；
   - ``sensor.state_grid_<userId>_balance``：当前余额。
2. **本项目约定命名的账户家族**（前端 ``ENERGY_FIELD_DEFS.grid`` 的 conventionSuffix，
   实测装机就是这套）：``sensor.ele_<户号后四位>_{daily,month,year}_ele_num``，
   列表数据在 ``daylist`` / ``monthlist`` / ``yearlist`` 属性里，字段
   ``{day, dayEleNum}`` / ``{month, monthEleNum}`` / ``{year, yearEleNum}``。

这些实体都不是累计电表（state 是列表/余额），不能走 ``is_cumulative_energy_meter``
的差分链路；列表本身已经是「区间内用了多少度」的成品数据。

与厂商 NestJS 版（``源代码/编译后的源码/dist/modules/energy``）的差异，是有意保留：

- **不建独立历史表**：本项目用 ``EnergyUsageDaily`` / ``EnergyUsageMonthly``，
  账户数据落库后与实时电表共用同一套报表 / Agent 口径。
- **不落分时电价与余额**：``p_ele`` / ``v_ele`` / ``n_ele`` / ``t_ele`` 与余额由前端直接
  读 HA 属性展示，聚合表没有这些列；硬搬只会留下永不读写的死字段。
- **不被当作累计表**：``is_utility_account_entity`` 把这类实体从实时差分链路里排除，
  否则列表属性会被当成读数做差。
- **账单级数据双向覆盖**：国网给的日/月用量是结算口径，比「读数差分」可信；
  历史日直接覆盖（含下调），当天取最大（避免与实时增量互相叠加）。
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any

from .units import normalize_unit, unit_for_entity

logger = logging.getLogger("homeos.energy_sgcc")

ENTITY_PREFIX = "sensor.state_grid_"
DAILY_SUFFIX = "_recent_30_daily_ele_list"
MONTHLY_SUFFIX = "_recent_12_monthly_ele_list"
BALANCE_SUFFIX = "_balance"

#: 记录陈旧阈值：最新一天比今天早超过这个天数，就把「账户列表停更」记进日志。
STALE_DAYS = 2

#: 账户家族的已知字段后缀：把同一户的多个实体归成一个账户。
#:
#: 前两条来自集成原始的列表实体命名（``sensor.ele_8107_recent_30_daily_ele_list``），
#: 其余与前端 conventionSuffix 同源。两者都要收：实测装机里同一户同时存在
#: ``_recent_30_daily_ele_list`` 与 ``_daily_ele_num``，不归族就会被当成两个账户。
ACCOUNT_FIELD_SUFFIXES = (
    DAILY_SUFFIX,
    MONTHLY_SUFFIX,
    "_daily_ele_num",
    "_daily_ele_cost",
    "_month_ele_num",
    "_month_ele_cost",
    "_last_month_ele_num",
    "_last_month_ele_cost",
    "_year_ele_num",
    "_year_ele_cost",
    "_daily_lasted_date",
    "_refresh_time",
    "_remaining_days",
    "_balance",
)
#: 列表属性 → (标签字段, 用量字段)，顺序即优先级。
LIST_SPECS: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "daylist": (("day", "date"), ("dayEleNum", "ele")),
    "monthlist": (("month", "date"), ("monthEleNum", "ele")),
    "yearlist": (("year", "date"), ("yearEleNum", "ele")),
}
#: 电的常见单位（换算在读数归一里完成，这里只判「是不是电」）。
_ELECTRIC_UNITS = frozenset({"kwh", "wh", "mwh"})
#: 燃气 / 水的单位（立方米）。
_UTILITY_VOLUME_UNITS = frozenset({"m³", "m3", "m^3", "立方米"})


def _text(value: Any) -> str:
    return str(value or "").strip()


def sgcc_user_id(entity_id: str | None) -> str | None:
    """从列表实体名里取账户标识；不是列表命名时返回 ``None``。

    **不要求** ``sensor.state_grid_`` 前缀：实测装机用的是
    ``sensor.ele_8107_recent_30_daily_ele_list``，只认厂商前缀会把真实账户全丢掉。
    有前缀时剥掉前缀，否则剥掉 ``sensor.`` 域名。
    """
    text = _text(entity_id)
    for suffix in (DAILY_SUFFIX, MONTHLY_SUFFIX, BALANCE_SUFFIX):
        if not text.endswith(suffix):
            continue
        user_id = text[: -len(suffix)]
        if user_id.startswith(ENTITY_PREFIX):
            user_id = user_id[len(ENTITY_PREFIX) :]
        elif user_id.startswith("sensor."):
            user_id = user_id[len("sensor.") :]
        return user_id or None
    return None


def is_sgcc_daily(entity_id: str | None) -> bool:
    return _text(entity_id).endswith(DAILY_SUFFIX)


def is_sgcc_monthly(entity_id: str | None) -> bool:
    return _text(entity_id).endswith(MONTHLY_SUFFIX)


def is_sgcc_list(entity_id: str | None) -> bool:
    """是否为国网日/月列表（成品数据），用于把累计表的发现逻辑排除在外。"""
    return is_sgcc_daily(entity_id) or is_sgcc_monthly(entity_id)


def account_family_key(entity_id: str | None) -> str:
    """账户家族键：``sensor.ele_8107_daily_ele_num`` → ``sensor.ele_8107``。

    同一户的日/月/年/上月/余额/列表实体共享同一个键，报表按家族去重时也用它。
    """
    text = _text(entity_id)
    for suffix in ACCOUNT_FIELD_SUFFIXES:
        if text.endswith(suffix):
            return text[: -len(suffix)]
    return text


def account_identity_key(entity_id: str | None) -> str:
    """账户的**身份**键：同一户号的不同命名（厂商 / 约定）归到同一个键。

    ``sensor.ele_8107_daily_ele_num``、``sensor.ele_8107_recent_30_daily_ele_list`` 与
    ``sensor.state_grid_8107_*`` 是同一块表的三套实体命名。按家族键归并只能合并前两者
    （后缀不同、前缀相同），户号段才是跨命名唯一稳定的标识。

    只对「账户家族成员」按户号段归并：``sensor.xiaomi_..._p_3_1`` 这类回路表的末段
    是 ``1``，按户号段归并会把所有回路坍成一个，所以它们保持原样。
    """
    text = _text(entity_id)
    family = account_family_key(text)
    if family != text or is_sgcc_list(text):
        return f"account:{account_leaf(family)}"
    return text


def account_leaf(entity_id: str | None) -> str:
    """家族键的户号段：``sensor.ele_8107`` → ``8107``。

    同一个户在 HA 里可能同时有厂商命名（``sensor.state_grid_8107_*``）和约定命名
    （``sensor.ele_8107_*``）两套实体：家族键不同、户号段相同。户号段是唯一能跨命名
    对齐两者的标识，用它判断「这个账户是不是主电表所在的户」。
    """
    key = account_family_key(entity_id)
    return key.rsplit("_", 1)[-1] if "_" in key else key


#: 家族内选谁当「账户代表」：日表 > 月表 > 年表 > 余额。
#:
#: 日表的日行就是「当天用了多少」，不依赖差分；月/年表在实时链路里只能靠读数差分，
#: 更容易被首次读数跳变污染。报表未绑主表时按这个顺序只取一个成员，避免同一度电
#: 在 daily/month/year 三个实体上各算一遍。集成原始的列表实体同样按「日 > 月」排序，
#: 否则 ``_recent_12_monthly_ele_list`` 会因为字典序更小而成为代表，落库实体名会
#: 变成「月列表」—— 排查时非常反直觉。
_MEMBER_PREFERENCE = (
    "_daily_ele_num",
    DAILY_SUFFIX,
    "_month_ele_num",
    MONTHLY_SUFFIX,
    "_year_ele_num",
    "_balance",
)


def account_member_rank(entity_id: str | None) -> tuple[int, str]:
    """家族成员的确定性排序键（越小越优先）。"""
    text = _text(entity_id)
    for index, suffix in enumerate(_MEMBER_PREFERENCE):
        if text.endswith(suffix):
            return index, text
    return len(_MEMBER_PREFERENCE), text


def pick_account_source(members: list[str] | set[str]) -> str:
    """从账户家族成员里挑一个稳定的代表实体（避免按快照顺序随机落点）。"""
    return min((_text(item) for item in members if _text(item)), key=account_member_rank)


def _list_values(attributes: Any) -> dict[str, list[dict[str, Any]]]:
    """取出非空的 ``daylist`` / ``monthlist`` / ``yearlist``（兼容 JSON 字符串）。"""
    if not isinstance(attributes, dict):
        return {}
    found: dict[str, list[dict[str, Any]]] = {}
    for key in LIST_SPECS:
        raw = attributes.get(key)
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except (TypeError, ValueError):  # fmt: skip
                continue
        if isinstance(raw, list) and raw:
            items = [item for item in raw if isinstance(item, dict)]
            if items:
                found[key] = items
    return found


def is_utility_account_entity(entity_id: str | None, attributes: Any = None) -> bool:
    """是否为「带成品列表的电费账户实体」（任一列表属性非空即算）。"""
    if is_sgcc_list(entity_id):
        return True
    return bool(_list_values(attributes))


def account_unit(entity_id: str, attributes: dict[str, Any]) -> str:
    """账户实体 → 用能单位（``kWh`` / ``m³``）。

    之前这里只放行电（``_is_electric_account``），燃气/水账户被整批丢掉 —— 生活账户面板
    支持绑定燃气与水务，但它们**永远不会有趋势**。现在按单位分类：

    - 属性里有 ``unit_of_measurement`` 以它为准（最可靠）；
    - 没有单位时按命名约定兜底（``sensor.gas_*`` / ``sensor.water_*`` → m³）；
    - 剩下的按电处理（历史行为）。
    """
    return unit_for_entity(entity_id, attributes)


def is_utility_account_name(entity_id: str, attributes: dict[str, Any]) -> bool:
    """是否可能是「某类账户」（电 / 燃气 / 水）——用于排除无关的列表型实体。

    属性带单位时只需单位可识别；否则要求名字里出现账户族线索。
    """
    if normalize_unit(attributes.get("unit_of_measurement")) is not None:
        return True
    text = entity_id.lower()
    hints = ("_ele", "electric", "state_grid", "_gas", "gas_", "_water", "water_")
    return any(hint in text for hint in hints)


def _graph(attributes: Any) -> list[dict[str, Any]]:
    """取 ``attributes.graph``；非列表一律视为空。"""
    if not isinstance(attributes, dict):
        return []
    graph = attributes.get("graph")
    if isinstance(graph, str):
        try:
            graph = json.loads(graph)
        except (TypeError, ValueError):  # fmt: skip
            return []
    if not isinstance(graph, list):
        return []
    return [item for item in graph if isinstance(item, dict)]


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):  # fmt: skip
        return None


def _normalize_day(raw: Any) -> str | None:
    """``20260121`` / ``"2026-01-21"`` → ``"2026-01-21"``；非法日期返回 ``None``。"""
    text = _text(raw).replace("-", "").replace("/", "")
    if len(text) != 8 or not text.isdigit():
        return None
    try:
        parsed = datetime.strptime(text, "%Y%m%d")
    except ValueError:
        return None
    return parsed.strftime("%Y-%m-%d")


def _normalize_month(raw: Any) -> str | None:
    """``202601`` / ``"2026-01"`` → ``"2026-01"``。"""
    text = _text(raw).replace("-", "").replace("/", "")
    if len(text) != 6 or not text.isdigit():
        return None
    month = int(text[4:6])
    if not 1 <= month <= 12:
        return None
    return f"{text[:4]}-{text[4:6]}"


def parse_daily_graph(attributes: Any) -> dict[str, float]:
    """``graph[]`` → ``{day: kwh}``；同日取最大值（重复上报不累加）。"""
    per_day: dict[str, float] = {}
    for item in _graph(attributes):
        day = _normalize_day(item.get("day") or item.get("date"))
        value = _number(item.get("ele"))
        if day is None or value is None or value <= 0:
            continue
        per_day[day] = max(per_day.get(day, 0.0), value)
    return per_day


def parse_monthly_graph(attributes: Any) -> dict[str, float]:
    """月度 ``graph[]`` → ``{month: kwh}``。"""
    per_month: dict[str, float] = {}
    for item in _graph(attributes):
        month = _normalize_month(item.get("day") or item.get("month") or item.get("date"))
        value = _number(item.get("ele"))
        if month is None or value is None or value <= 0:
            continue
        per_month[month] = max(per_month.get(month, 0.0), value)
    return per_month


def _first_value(item: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if item.get(key) not in (None, ""):
            return item.get(key)
    return None


def parse_list_attribute(items: list[dict[str, Any]] | None, list_key: str) -> dict[str, float]:
    """``daylist`` / ``monthlist`` → ``{label: kwh}``；同日/同月重复项取最大值。

    ``daylist`` 的标签是日（``YYYY-MM-DD``），``monthlist`` 是月（``YYYY-MM``）。
    """
    labels, usages = LIST_SPECS.get(list_key, ((), ()))
    if not labels or not items:
        return {}
    normalize = _normalize_month if list_key == "monthlist" else _normalize_day
    parsed: dict[str, float] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        label = normalize(_first_value(item, labels))
        value = _number(_first_value(item, usages))
        if label is None or value is None or value <= 0:
            continue
        parsed[label] = max(parsed.get(label, 0.0), value)
    return parsed


def latest_day(per_day: dict[str, float]) -> str | None:
    return max(per_day) if per_day else None


def is_stale(
    per_day: dict[str, float],
    *,
    today: date | None = None,
    stale_days: int = STALE_DAYS,
) -> bool:
    """最新一天早于 ``today - stale_days``（或不足 2 条）→ 账户列表可能停更。

    ``today`` 必须由调用方按**家庭时区**给出：用 UTC 日期比较会让东八区 0–8 点
    整体差一天，停更判定随之提前/滞后。
    """
    if len(per_day) < 2:
        return True
    newest = latest_day(per_day)
    if newest is None:
        return True
    try:
        newest_date = datetime.strptime(newest, "%Y-%m-%d").date()
    except ValueError:
        return True
    resolved_today = today or datetime.now(UTC).date()
    return (resolved_today - newest_date) > timedelta(days=stale_days)


@dataclass(frozen=True)
class UtilityAccount:
    """一个户号的日/月用电序列（列表缺失的一侧为空表）。"""

    key: str
    family_key: str
    source_entity_id: str
    daily: dict[str, float] = field(default_factory=dict)
    monthly: dict[str, float] = field(default_factory=dict)
    user_id: str | None = None
    #: 用能单位（``kWh`` / ``m³``）：同户号的日/月列表一定是同一单位。
    unit: str = "kWh"


def discover_utility_accounts(entities: list[dict[str, Any]] | None) -> dict[str, UtilityAccount]:
    """从全量快照里挑出电费账户 → ``{accountKey: UtilityAccount}``。

    只按**家族键**归并：同一户的日/月列表实体与约定命名的 ``daily/month/year/balance``
    实体共享一个键，无论属性是 ``graph[]`` 还是 ``daylist/monthlist`` 都并到同一个账户。
    这样不会因为命名不同（``state_grid`` 前缀 / 无前缀 / 约定后缀）把同一户拆成两个账户。
    """
    merged: dict[str, dict[str, Any]] = {}
    for entity in entities or []:
        if not isinstance(entity, dict):
            continue
        entity_id = _text(entity.get("entity_id"))
        attributes = entity.get("attributes")
        if not entity_id or not isinstance(attributes, dict):
            continue
        is_list_entity = is_sgcc_list(entity_id)
        lists = _list_values(attributes)
        if not is_list_entity and not lists:
            continue
        if not is_list_entity and not is_utility_account_name(entity_id, attributes):
            continue
        identity = account_identity_key(entity_id)
        record = merged.setdefault(
            identity,
            {
                "members": set(),
                "daily": {},
                "monthly": {},
                "user_id": sgcc_user_id(entity_id),
                "unit": account_unit(entity_id, attributes),
            },
        )
        record["members"].add(entity_id)
        if record["user_id"] is None:
            record["user_id"] = sgcc_user_id(entity_id)
        # 同一份数据可能同时以 graph[] 和 daylist 出现；两边都解析后按同键取最大。
        _merge_series(record["daily"], parse_daily_graph(attributes))
        _merge_series(record["daily"], parse_list_attribute(lists.get("daylist"), "daylist"))
        _merge_series(record["monthly"], parse_monthly_graph(attributes))
        _merge_series(record["monthly"], parse_list_attribute(lists.get("monthlist"), "monthlist"))
    accounts: dict[str, UtilityAccount] = {}
    for identity, record in merged.items():
        daily = record["daily"]
        monthly = record["monthly"]
        if not daily and not monthly:
            continue
        source = pick_account_source(record["members"])
        accounts[identity] = UtilityAccount(
            key=identity,
            family_key=account_family_key(source),
            source_entity_id=source,
            daily=dict(daily),
            monthly=dict(monthly),
            user_id=record["user_id"],
            unit=str(record.get("unit") or "kWh"),
        )
    return accounts


def resolve_account_target(account: UtilityAccount, primary_entities: set[str] | None) -> str:
    """账户数据落到哪个实体名下（必须与报表读取口径一致）。

    - **与主电表同户**（家族键相同，或户号段相同）：补到主表名下 —— 账户账单就是这块表
      的结算口径，写到账户实体自己身上时报表按主表过滤会把它们整批丢掉。
    - **与主电表不同户**：落到自己的家族代表实体，**不计入主表总量**。
      实测装有 ``ele_8107`` 与 ``ele_6104`` 两个户号；把陌生户号加进主表会让
      「本月用电」凭空多出一户，而报表只有一个主表位，无法表达多住宅合计。
    - 未绑定主电表：用账户实体自身当口径（老装机回退全量识别）。
    """
    primary = {str(item).strip() for item in (primary_entities or ()) if str(item).strip()}
    if not primary:
        return account.source_entity_id
    same_family = sorted(item for item in primary if account_family_key(item) == account.family_key)
    if same_family:
        return same_family[0]
    leaf = account_leaf(account.family_key)
    same_leaf = sorted(item for item in primary if account_leaf(item) == leaf)
    if same_leaf:
        return same_leaf[0]
    return account.source_entity_id


def _days_in_month(month: str, today: date) -> list[str]:
    """返回该月「已经发生」的全部日期（当月只到 ``today``，未来日期不算缺）。"""
    year, month_number = int(month[:4]), int(month[5:7])
    start = date(year, month_number, 1)
    if month_number == 12:
        end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(year, month_number + 1, 1) - timedelta(days=1)
    limit = min(end, today)
    if limit < start:
        return []
    return [(start + timedelta(days=offset)).isoformat() for offset in range((limit - start).days + 1)]


def _month_value(account: UtilityAccount, month: str, today: date) -> float | None:
    """该月应写入的账单级总量：优先月列表，其次「日列表覆盖整月」的求和。"""
    explicit = account.monthly.get(month)
    if explicit is not None and explicit > 0:
        return explicit
    expected = _days_in_month(month, today)
    if not expected or any(day not in account.daily for day in expected):
        return None
    return sum(account.daily[day] for day in expected)


def _months_fully_covered(per_day: dict[str, float], today: str) -> set[str]:
    """日列表覆盖到「整月」的月份集合（当月按截至今天计算）。"""
    if not per_day:
        return set()
    today_date = date.fromisoformat(today)
    return {
        month
        for month in {day[:7] for day in per_day}
        if all(day in per_day for day in _days_in_month(month, today_date))
    }


@dataclass(frozen=True)
class UtilitySeries:
    """账户序列按目标实体聚合后、按落库语义分档的结果。"""

    #: 历史日（< 今天）：账单级权威值，双向覆盖日行。
    authoritative_days: dict[str, dict[str, float]]
    #: 今天：与实时增量并存，只取最大值，避免两边叠加。
    today_days: dict[str, dict[str, float]]
    #: 月总量（月列表 / 整月覆盖的日行求和）：双向覆盖月行。
    authoritative_months: dict[str, dict[str, float]]
    #: 参与聚合的账户数（日志用）。
    accounts: int
    #: 目标实体 → 用能单位（``kWh`` / ``m³``）：报表按单位分组返回必须靠它。
    units: dict[str, str] = field(default_factory=dict)


def collect_utility_series(
    accounts: dict[str, UtilityAccount],
    primary_entities: set[str] | None,
    *,
    today: str,
) -> UtilitySeries:
    """账户序列 → 按目标实体聚合的三档结果（历史日 / 今天 / 月）。"""
    auth_days: dict[str, dict[str, float]] = {}
    today_days: dict[str, dict[str, float]] = {}
    auth_months: dict[str, dict[str, float]] = {}
    today_date = date.fromisoformat(today)
    seen_series: set[tuple[Any, ...]] = set()
    target_accounts: dict[str, list[str]] = {}
    units: dict[str, str] = {}
    for account in accounts.values():
        # 同一户可能同时以 state_grid 列表和约定命名的 daylist 出现（用户换过集成）。
        # 两份数据完全相同时按一份算：否则 daily 会相加成双倍。
        fingerprint = (
            tuple(sorted(account.daily.items())),
            tuple(sorted(account.monthly.items())),
        )
        if fingerprint in seen_series:
            logger.info("电费账户 %s 与其它来源数据完全相同，本轮跳过（避免重复计费）", account.key)
            continue
        seen_series.add(fingerprint)
        logger.debug(
            "电费账户 %s：日列表 %s 天 / 月列表 %s 个月（来源 %s）",
            account.key,
            len(account.daily),
            len(account.monthly),
            account.source_entity_id,
        )
        target = resolve_account_target(account, primary_entities)
        target_accounts.setdefault(target, []).append(account.family_key)
        units.setdefault(target, unit_for_entity(target))
        for day, kwh in account.daily.items():
            if day > today:
                continue
            bucket = today_days if day == today else auth_days
            per_day = bucket.setdefault(target, {})
            per_day[day] = per_day.get(day, 0.0) + kwh
        months = set(account.monthly)
        months.update(_months_fully_covered(account.daily, today))
        for month in months:
            value = _month_value(account, month, today_date)
            if value is None or value <= 0:
                continue
            per_month = auth_months.setdefault(target, {})
            per_month[month] = per_month.get(month, 0.0) + value
    for target, keys in target_accounts.items():
        if len(keys) > 1:
            # 多个账户归到同一实体时按天相加（多户号合计才是这块表的总量）。
            # 但如果它们其实是同一户的两套命名，相加就会翻倍 —— 值得人工确认一次。
            logger.info("目标实体 %s 合并了 %s 个电费账户：%s", target, len(keys), ", ".join(keys))
    return UtilitySeries(
        authoritative_days=auth_days,
        today_days=today_days,
        authoritative_months=auth_months,
        accounts=len(accounts),
        units=units,
    )


def _merge_series(target: dict[str, float], series: dict[str, float]) -> None:
    """同一份数据的多个来源合并：同键取最大值（重复上报不累加）。"""
    for key, value in series.items():
        target[key] = max(target.get(key, 0.0), value)


__all__ = [
    "ACCOUNT_FIELD_SUFFIXES",
    "BALANCE_SUFFIX",
    "DAILY_SUFFIX",
    "ENTITY_PREFIX",
    "LIST_SPECS",
    "MONTHLY_SUFFIX",
    "STALE_DAYS",
    "UtilityAccount",
    "UtilitySeries",
    "account_family_key",
    "account_identity_key",
    "account_leaf",
    "account_member_rank",
    "collect_utility_series",
    "discover_utility_accounts",
    "is_sgcc_daily",
    "is_sgcc_list",
    "is_sgcc_monthly",
    "is_stale",
    "is_utility_account_entity",
    "latest_day",
    "parse_daily_graph",
    "parse_list_attribute",
    "parse_monthly_graph",
    "pick_account_source",
    "resolve_account_target",
    "sgcc_user_id",
]
