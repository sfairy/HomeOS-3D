"""告警规则 Helper（对齐 ``modules/notification/rules.helper.ts``）。

- 规则缓存：仅保留启用的规则，CRUD 后刷新；
- 边沿触发：同一规则+实体从「未匹配→匹配」时才通知，持续匹配不重复；
- 冷却：触发后进入冷却期，期内不重复触发；
- DND：非 danger 级别在免打扰时段不触发（除非 ``security.alertBypassDnd``）；
- 修订历史：条件变更时记录旧条件，持久化到 RuntimeKv。
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import time
from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy import select

from .stats import parse_json_array
from ..alerts.channels import resolve_alert_rule_channels
from ..alerts.condition import evaluate_condition
from ..alerts.lifecycle import AlertLifecycle
from ..alerts.templates import format_alert_rule_message
from ..ha.config.ha_filters import AlertRuleWatchIndex
from ...platform.core.db.models import AlertRule
from ...platform.core.db.runtime_kv import load_runtime_kv, persist_runtime_kv
from ...platform.core.http.errors import api_error, bad_request
from ...platform.core.runtime.params import non_negative_seconds

logger = logging.getLogger("homeos.notification.rules")

RULE_REVISIONS_ID = "alert-rule-revisions"
MAX_REVISIONS_PER_RULE = 20
MAX_RULES = 500


#: 告警规则冷却时间默认值（分钟）：配置缺失或非法时使用。
DEFAULT_COOLDOWN_MINUTES = 60


def _finite_number(raw_value: Any) -> float | None:
    """有限数值 → ``float``；``bool`` / ``None`` / 非数字 / 非有限数 → ``None``。

    返回解析结果而非「是否是数值」的布尔：调用点因此不必再 ``float(value)`` 解析一遍，
    也不会出现「判据通过、解析对象却是另一次读取」的错位（类型检查同样收不窄）。
    """
    if isinstance(raw_value, bool) or raw_value is None:
        return None
    try:
        number = float(raw_value)
    except (TypeError, ValueError):  # fmt: skip
        return None
    return number if math.isfinite(number) else None


def _cooldown_minutes(raw_value: Any) -> float:
    """冷却分钟数：非法值回落 :data:`DEFAULT_COOLDOWN_MINUTES`，负数夹到 0。"""
    parsed = _finite_number(raw_value)
    return max(0.0, parsed) if parsed is not None else float(DEFAULT_COOLDOWN_MINUTES)




def _monotonic() -> float:
    """单调时钟（秒）。单测替换这一个函数即可推进时间，不影响 asyncio 的事件循环时钟。"""
    return time.monotonic()


class NotificationRulesHelper:
    def __init__(
        self,
        *,
        session_factory: Callable[[], Any],
        alert_rule_watch_index: AlertRuleWatchIndex,
        is_dnd_active: Callable[[], bool],
        is_alert_bypass_dnd: Callable[[], bool],
        is_in_cooldown: Callable[[str], bool],
        set_cooldown: Callable[[str, float], None],
        notify: Callable[..., Awaitable[Any]],
    ) -> None:
        self._session_factory = session_factory
        self._watch_index = alert_rule_watch_index
        self._is_dnd_active = is_dnd_active
        self._is_alert_bypass_dnd = is_alert_bypass_dnd
        self._is_in_cooldown = is_in_cooldown
        self._set_cooldown = set_cooldown
        self._notify = notify

        self.rules_cache: list[dict[str, Any]] = []
        self.rules_cache_stale = False
        self._condition_history: dict[str, list[dict[str, str]]] = {}
        self._match_state: dict[str, bool] = {}
        #: 「条件开始成立」的时刻（monotonic 秒）：用于 ``forSeconds`` 持续判定。
        self._pending_since: dict[str, float] = {}
        #: 「条件开始不成立」的时刻：用于 ``clearDelaySeconds`` 回落去抖。
        self._clear_since: dict[str, float] = {}
        #: 已报出但未恢复的告警（未确认抑制 / 恢复 / 升级）。
        self.lifecycle = AlertLifecycle()

    def _confirm_duration(self, rule: dict[str, Any], edge_key: str) -> bool:
        """条件需连续成立 ``forSeconds`` 秒；未满足时记下起点并返回 ``False``。"""
        required = non_negative_seconds(rule.get("forSeconds"))
        if required <= 0:
            self._pending_since.pop(edge_key, None)
            return True
        now = _monotonic()
        started = self._pending_since.setdefault(edge_key, now)
        if now - started < required:
            return False
        # 满足时长：清掉起点，后续走冷却 / 免打扰 / 推送。
        self._pending_since.pop(edge_key, None)
        return True

    def _release_edge(self, rule: dict[str, Any], edge_key: str) -> None:
        """条件不成立时解除锁存（带 ``clearDelaySeconds`` 去抖）。

        抖动抑制的关键：边界附近来回跳变时，只要「不成立」没有持续足够久就不解锁存，
        因此不会反复告警。延迟为 0 时与原行为一致（立即解除）。

        只做状态判定，不发通知；需要补 ``resolved`` 时用 :meth:`_release_edge_async`。
        """
        self._pending_since.pop(edge_key, None)
        if self._match_state.get(edge_key) is not True:
            return
        delay = non_negative_seconds(rule.get("clearDelaySeconds"))
        if delay <= 0:
            self._clear_since.pop(edge_key, None)
            self._match_state[edge_key] = False
            return
        now = _monotonic()
        started = self._clear_since.setdefault(edge_key, now)
        if now - started >= delay:
            self._clear_since.pop(edge_key, None)
            self._match_state[edge_key] = False

    async def _release_edge_async(self, rule: dict[str, Any], edge_key: str) -> None:
        """解除锁存，并在真正解除时补一条 ``resolved``（仅对已报出的告警）。"""
        was_latched = self._match_state.get(edge_key) is True
        self._release_edge(rule, edge_key)
        if not was_latched or self._match_state.get(edge_key) is True:
            return
        alert = self.lifecycle.resolve(edge_key)
        if alert is None:
            return
        # 用户已经确认过的告警不再补恢复通知：确认动作本身就代表「我知道这件事」。
        # 未确认的才需要一条明确的「已经恢复」，否则列表里会一直留着一条已报警。
        if alert.acknowledged:
            return
        try:
            await self._notify(
                "info",
                f"已恢复：{alert.message}",
                "alert-rule",
                alert.entity_id,
                {"channels": ["in_app"], "title": alert.title, "resolved": True},
            )
        except Exception as exc:
            logger.debug("告警恢复通知失败: %s", exc)

    # 初始化
    async def load_condition_history(self) -> None:
        def _read() -> Any:
            with self._session_factory() as session:
                return load_runtime_kv(session, RULE_REVISIONS_ID)

        try:
            data = await asyncio.to_thread(_read)
        except Exception as exc:
            logger.debug("加载告警规则修订历史失败: %s", exc)
            return
        if isinstance(data, dict):
            for rule_id, revisions in data.items():
                if isinstance(revisions, list):
                    self._condition_history[str(rule_id)] = [
                        item for item in revisions[:MAX_REVISIONS_PER_RULE] if isinstance(item, dict)
                    ]

    def _persist_condition_history(self) -> None:
        payload = dict(self._condition_history.items())
        try:
            persist_runtime_kv(self._session_factory, RULE_REVISIONS_ID, payload)
        except Exception as exc:
            logger.debug("告警规则修订历史持久化失败: %s", exc)

    # 规则缓存
    async def refresh_rules_cache(self) -> None:
        """刷新告警规则缓存（仅保留启用的规则），并更新 HA 实体订阅索引。"""
        try:
            all_rules = await asyncio.to_thread(self._fetch_rules_from_db)
            self._apply_rules_cache(all_rules)
            logger.info("告警规则已加载: %s 条启用", len(self.rules_cache))
        except Exception as exc:
            self.rules_cache_stale = True
            logger.warning(
                "刷新告警规则缓存失败,保留旧缓存 %s 条(标记 stale): %s",
                len(self.rules_cache),
                exc,
            )

    def refresh_rules_cache_sync(self) -> None:
        """同步刷新（供线程池里的删除/解绑路径调用）。

        没有同步入口时，实体解绑删除规则只能去刷新**另一个**索引实例，而真正参与
        求值的 ``rules_cache`` 保持原样 —— 用户看到的就是「规则已经删了却还在告警」。
        """
        try:
            all_rules = self._fetch_rules_from_db()
            self._apply_rules_cache(all_rules)
        except Exception as exc:
            self.rules_cache_stale = True
            logger.warning("同步刷新告警规则缓存失败,保留旧缓存 %s 条: %s", len(self.rules_cache), exc)

    def _apply_rules_cache(self, all_rules: list[dict[str, Any]]) -> None:
        """把 DB 读出的规则写进缓存与 watch 索引（异步/同步两条路径共用）。"""
        self.rules_cache = [rule for rule in all_rules if rule.get("enabled")]
        self._watch_index.update_from_rules(self.rules_cache)
        self.rules_cache_stale = False
        # 已消失的规则留下的边沿锁存必须一并清掉，否则同一个 rule id 被重建后会因为
        # 「上次已经是 True」而静默不触发。
        alive = {str(rule.get("id") or rule.get("name")) for rule in self.rules_cache}
        for edge_key in [key for key in self._match_state if key.split(":", 1)[0] not in alive]:
            del self._match_state[edge_key]

    def _fetch_rules_from_db(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            rows = (
                session.execute(select(AlertRule).order_by(AlertRule.created_at.desc()).limit(MAX_RULES))
                .scalars()
                .all()
            )
            return [_rule_row(row) for row in rows]

    def _push_condition_history(self, rule_id: str, condition: str) -> None:
        revisions = self._condition_history.get(rule_id) or []
        revisions.insert(0, {"condition": condition, "at": _iso_now()})
        self._condition_history[rule_id] = revisions[:MAX_REVISIONS_PER_RULE]
        self._persist_condition_history()

    def get_rule_condition_history(self, rule_id: str) -> list[dict[str, str]]:
        return list(self._condition_history.get(rule_id) or [])

    # 条件求值（边沿触发）
    async def evaluate_rules(
        self,
        entity_id: str,
        state: str,
        attributes: dict[str, Any] | None = None,
    ) -> None:
        if not self.rules_cache:
            return
        attributes = attributes or {}
        bypass_dnd_config: bool | None = None
        dnd_active_config: bool | None = None
        for rule in list(self.rules_cache):
            rule_entity_id = rule.get("entityId")
            if rule_entity_id and rule_entity_id != entity_id:
                continue
            try:
                matched = evaluate_condition(rule.get("condition") or "", state, attributes)
            except Exception:
                logger.debug("evaluate_rules 忽略异常", exc_info=True)
                matched = False
            rule_key = rule.get("id") or rule.get("name")
            edge_key = f"{rule_key}:{entity_id}"
            if not matched:
                await self._release_edge_async(rule, edge_key)
                continue
            # 电平持续匹配时不重复通知，仅在边沿（未匹配→匹配）触发
            if self._match_state.get(edge_key) is True:
                continue
            # 持续判定：条件需连续成立 ``forSeconds`` 才告警。抖动会被这里吃掉 ——
            # 每次不成立都会清掉起点，所以「闪一下又回落」永远不满足。
            if not self._confirm_duration(rule, edge_key):
                continue
            # 第二层抑制（冷却之外）：这条告警已经报过、用户还没确认时不再重复推送。
            # 「没处理的事」由升级负责再提醒，而不是靠冷却到期后反复刷屏。
            if self.lifecycle.is_open_unacked(edge_key):
                continue

            # 冷却 / 免打扰在锁存边沿之前判定：未通过时不锁存边沿。
            cooldown_key = f"rule:{rule_key}:{entity_id}"
            if self._is_in_cooldown(cooldown_key):
                continue
            if rule.get("level") == "danger":
                bypass_dnd = True
            else:
                if bypass_dnd_config is None:
                    bypass_dnd_config = await asyncio.to_thread(self._is_alert_bypass_dnd)
                bypass_dnd = bypass_dnd_config
            if dnd_active_config is None:
                dnd_active_config = await asyncio.to_thread(self._is_dnd_active)
            if dnd_active_config and not bypass_dnd:
                continue

            self._match_state[edge_key] = True
            delivered = await self._deliver_rule_alert(
                rule,
                rule_key=str(rule_key),
                entity_id=entity_id,
                state=state,
                attributes=attributes,
                bypass_dnd=bypass_dnd,
            )
            if delivered:
                self._set_cooldown(cooldown_key, _cooldown_minutes(rule.get("cooldownMinutes")))
            else:
                # 通知未投递：回滚边沿匹配状态，保证条件持续匹配期间可重试。
                self._match_state[edge_key] = False

    async def _deliver_rule_alert(
        self,
        rule: dict[str, Any],
        *,
        rule_key: str,
        entity_id: str,
        state: str,
        attributes: dict[str, Any],
        bypass_dnd: bool,
    ) -> bool:
        """投递一条规则告警并登记生命周期；返回是否成功投递。

        成功才登记「已报未确认」—— 投递失败时登记会让后续匹配被抑制，
        而用户其实什么都没收到。
        """
        friendly_name = attributes.get("friendly_name") or entity_id
        unit = attributes.get("unit_of_measurement") or ""
        message = format_alert_rule_message(
            rule.get("messageTemplate"),
            {
                "entity_id": entity_id,
                "entity": entity_id,
                "state": state,
                "value": state,
                "unit": unit,
                "name": friendly_name,
                "friendly_name": friendly_name,
                "rule": rule.get("name"),
            },
        )
        channels = list(resolve_alert_rule_channels(rule.get("channels")))
        try:
            delivered = await self._notify(
                rule.get("level") or "info",
                message,
                "alert-rule",
                entity_id,
                {
                    # 空渠道语义为「仅站内 + 实时」，避免落库为 [] 时被当作全渠道外发。
                    "channels": channels,
                    "title": rule.get("title"),
                    "bypassDnd": True if (bypass_dnd and rule.get("level") != "danger") else None,
                },
            )
        except Exception as exc:
            logger.warning("告警规则通知失败: %s", exc)
            return False
        if not delivered:
            return False
        self.lifecycle.open_alert(
            rule_key=rule_key,
            entity_id=entity_id,
            level=str(rule.get("level") or "info"),
            message=message,
            channels=channels,
            title=rule.get("title"),
        )
        return True

    # CRUD
    async def get_rules(self) -> list[dict[str, Any]]:
        try:
            return await asyncio.to_thread(self._fetch_rules_from_db)
        except Exception as exc:
            logger.warning("读取告警规则失败: %s", exc)
            return []

    async def add_rule(self, rule: dict[str, Any]) -> dict[str, Any]:
        name = str(rule.get("name") or "").strip()
        condition = str(rule.get("condition") or "").strip()
        if not name:
            bad_request(api_error("ALERT_RULE_NAME_REQUIRED"))
        if not condition:
            bad_request(api_error("ALERT_RULE_CONDITION_REQUIRED"))
        entity_id = str(rule.get("entityId") or "").strip() or None
        cooldown_minutes = int(_cooldown_minutes(rule.get("cooldownMinutes")))
        channels = rule.get("channels") if isinstance(rule.get("channels"), list) else []

        def _insert() -> dict[str, Any]:
            with self._session_factory() as session:
                duplicate_filter = [AlertRule.condition == condition]
                if entity_id is None:
                    duplicate_filter.append(AlertRule.entity_id.is_(None))
                else:
                    duplicate_filter.append(AlertRule.entity_id == entity_id)
                duplicate = session.execute(select(AlertRule.id).where(*duplicate_filter)).first()
                if duplicate:
                    bad_request(api_error("ALERT_RULE_DUPLICATE"))
                record = AlertRule(
                    name=name,
                    entity_id=entity_id,
                    condition=condition,
                    level=str(rule.get("level") or "warn"),
                    channels=json.dumps(channels, ensure_ascii=False),
                    cooldown_minutes=cooldown_minutes,
                    enabled=rule.get("enabled") is not False,
                    message_template=str(rule.get("messageTemplate") or "").strip() or None,
                    title=str(rule.get("title") or "").strip() or None,
                    for_seconds=int(non_negative_seconds(rule.get("forSeconds"))),
                    clear_delay_seconds=int(non_negative_seconds(rule.get("clearDelaySeconds"))),
                )
                session.add(record)
                session.commit()
                session.refresh(record)
                return _rule_row(record)

        created = await asyncio.to_thread(_insert)
        await self.refresh_rules_cache()
        return created

    async def update_rule(self, rule_id: str, partial: dict[str, Any]) -> dict[str, Any] | None:
        def _update() -> tuple[dict[str, Any] | None, str | None]:
            with self._session_factory() as session:
                existing = session.get(AlertRule, rule_id)
                if existing is None:
                    return None, None
                old_condition = str(existing.condition or "")
                if "name" in partial and not str(partial.get("name") or "").strip():
                    bad_request(api_error("ALERT_RULE_NAME_REQUIRED"))
                if "condition" in partial and not str(partial.get("condition") or "").strip():
                    bad_request(api_error("ALERT_RULE_CONDITION_REQUIRED"))

                _apply_rule_fields(existing, partial, old_condition)

                previous_condition: str | None = None
                if "condition" in partial and partial["condition"] != old_condition:
                    previous_condition = old_condition
                session.commit()
                session.refresh(existing)
                result = _rule_row(existing)
                if previous_condition is not None:
                    result["previousCondition"] = previous_condition
                return result, previous_condition

        result, previous_condition = await asyncio.to_thread(_update)
        if result is None:
            return None
        if previous_condition is not None:
            self._push_condition_history(rule_id, previous_condition)
            self._reset_rule_edge(rule_id)
        await self.refresh_rules_cache()
        return result

    def _reset_rule_edge(self, rule_id: str) -> None:
        """清掉该规则的所有边沿锁存。

        条件被编辑后，实体可能**一直**处于新条件成立的状态。锁存不复位的话，
        「未匹配 → 匹配」这条边永远不会再来一次，规则会静默失效到实体下一次
        从成立变回不成立为止。共享契约里的 ``previousCondition`` 就是为这件事留的。
        """
        prefix = f"{rule_id}:"
        for key in [key for key in self._match_state if key.startswith(prefix)]:
            del self._match_state[key]

    def prime_latches(self, states: dict[str, tuple[str, dict[str, Any] | None]]) -> None:
        """启动时静默锁存：只记录当前匹配态，**不发通知**。

        没有这一步，「启动时条件已经成立」与「条件从成立变为不成立再成立」看起来一样：
        前者永远不会触发（锁存为空 → 第一次变化才建立边沿）。但启动就补发一轮通知
        又会在每次重启时刷屏，所以这里只建立基线，真正推送仍走边沿。
        """
        for rule in list(self.rules_cache):
            rule_key = rule.get("id") or rule.get("name")
            condition = rule.get("condition") or ""
            rule_entity_id = rule.get("entityId")
            targets = [rule_entity_id] if rule_entity_id else list(states)
            for entity_id in targets:
                if not entity_id:
                    continue
                row = states.get(str(entity_id))
                if row is None:
                    continue
                state_value, attributes = row
                try:
                    matched = evaluate_condition(condition, state_value, attributes or {})
                except Exception:  # 非法条件：按不匹配锁存，避免重启后反复尝试
                    logger.debug("prime_latches 忽略条件异常: rule=%s", rule_key, exc_info=True)
                    matched = False
                self._match_state[f"{rule_key}:{entity_id}"] = matched

    def test_condition(
        self,
        condition: str,
        state: str,
        attributes: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return {
            "matched": evaluate_condition(condition, state, attributes),
            "state": state,
            "condition": condition,
        }

    async def delete_rule(self, rule_id: str) -> dict[str, Any]:
        def _delete() -> bool:
            with self._session_factory() as session:
                existing = session.get(AlertRule, rule_id)
                if existing is None:
                    return False
                session.delete(existing)
                session.commit()
                return True

        try:
            deleted = await asyncio.to_thread(_delete)
        except Exception as exc:
            logger.warning("删除告警规则失败: %s", exc)
            return {"success": False}
        if deleted:
            await self.refresh_rules_cache()
        return {"success": True}

    # 告警生命周期
    def acknowledge(self, rule_id: str, entity_id: str) -> bool:
        """确认一条在册告警（此后不再重复推送，恢复时也不补 resolved）。"""
        return self.lifecycle.acknowledge(rule_id, entity_id)

    def active_alerts(self) -> list[dict[str, Any]]:
        return self.lifecycle.snapshot()

    async def run_escalations(self) -> int:
        """把到期待升级的告警再推一次（级别提到 danger，渠道用全部已配置渠道）。

        返回本轮升级条数。升级只发生一次：``AlertLifecycle`` 打标后不再重复。
        """
        minutes_of = {
            str(rule.get("id") or rule.get("name")): non_negative_seconds(rule.get("escalationMinutes")) / 60
            for rule in self.rules_cache
        }
        due = self.lifecycle.due_escalations(minutes_of)
        escalated = 0
        for alert in due:
            try:
                delivered = await self._notify(
                    "danger",
                    f"仍未处理：{alert.message}",
                    "alert-rule",
                    alert.entity_id,
                    {
                        # 升级必须能穿透免打扰：它就是「用户还没看到」的补救手段。
                        "channels": alert.channels or ["in_app"],
                        "title": alert.title,
                        "bypassDnd": True,
                    },
                )
            except Exception as exc:
                logger.warning("告警升级推送失败: %s", exc)
                continue
            if delivered:
                escalated += 1
        return escalated


#: 部分更新时每个对外字段 → ORM 列赋值函数。
#:
#: 用表驱动而不是十几个 ``if``：字段集合是纯数据，逐个分支堆在函数里会同时抬高圈复杂度
#: 与分支数，加一个字段就要再动一次判定逻辑。
_RULE_FIELD_APPLIERS: dict[str, Any] = {
    "name": lambda row, value: setattr(row, "name", str(value).strip()),
    "entityId": lambda row, value: setattr(row, "entity_id", value),
    "condition": lambda row, value: setattr(row, "condition", value),
    "level": lambda row, value: setattr(row, "level", value),
    "channels": lambda row, value: setattr(row, "channels", json.dumps(value, ensure_ascii=False)),
    "cooldownMinutes": lambda row, value: setattr(row, "cooldown_minutes", int(_cooldown_minutes(value))),
    "enabled": lambda row, value: setattr(row, "enabled", bool(value)),
    "messageTemplate": lambda row, value: setattr(row, "message_template", str(value).strip() or None),
    "title": lambda row, value: setattr(row, "title", str(value).strip() or None),
    "forSeconds": lambda row, value: setattr(row, "for_seconds", int(non_negative_seconds(value))),
    "clearDelaySeconds": lambda row, value: setattr(row, "clear_delay_seconds", int(non_negative_seconds(value))),
    "escalationMinutes": lambda row, value: setattr(row, "escalation_minutes", int(non_negative_seconds(value) / 60)),
}


def _apply_rule_fields(existing: AlertRule, partial: dict[str, Any], old_condition: str) -> None:
    """把一次部分更新写进 ORM 行（字段名与对外 DTO 一致）。"""
    del old_condition  # 旧条件只用于「是否记修订历史」，由调用方判断
    for field, apply_field in _RULE_FIELD_APPLIERS.items():
        if field in partial:
            apply_field(existing, partial[field])


def _rule_row(record: AlertRule) -> dict[str, Any]:
    """把 AlertRule 行映射为对外规则视图（空值省略，对齐 JS ``undefined``）。"""
    payload: dict[str, Any] = {
        "id": record.id,
        "name": record.name,
    }
    if record.entity_id:
        payload["entityId"] = record.entity_id
    payload["condition"] = record.condition
    payload["level"] = record.level
    payload["channels"] = parse_json_array(record.channels)
    payload["cooldownMinutes"] = record.cooldown_minutes
    payload["enabled"] = bool(record.enabled)
    if record.message_template:
        payload["messageTemplate"] = record.message_template
    if record.title:
        payload["title"] = record.title
    # 两个新字段始终返回（含 0），前端控件据 0 判断「未启用」，不需要额外缺省逻辑。
    payload["forSeconds"] = int(record.for_seconds or 0)
    payload["clearDelaySeconds"] = int(record.clear_delay_seconds or 0)
    payload["escalationMinutes"] = int(record.escalation_minutes or 0)
    return payload


def _iso_now() -> str:
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


__all__ = ["RULE_REVISIONS_ID", "NotificationRulesHelper"]
