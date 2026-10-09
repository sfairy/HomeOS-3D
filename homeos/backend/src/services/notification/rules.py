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
from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy import select

from .stats import parse_json_array
from ..alerts.channels import resolve_alert_rule_channels
from ..alerts.condition import evaluate_condition
from ..alerts.templates import format_alert_rule_message
from ..ha_filters import AlertRuleWatchIndex
from ...core.errors import api_error, bad_request
from ...core.models import AlertRule
from ...core.runtime_kv import load_runtime_kv, persist_runtime_kv

logger = logging.getLogger("homeos.notification.rules")

RULE_REVISIONS_ID = "alert-rule-revisions"
MAX_REVISIONS_PER_RULE = 20
MAX_RULES = 500


def _is_finite_number(value: Any) -> bool:
    if isinstance(value, bool) or value is None:
        return False
    try:
        number = float(value)
    except (TypeError, ValueError):
        return False
    return math.isfinite(number)


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
        persist_edge_state: Callable[[list[str]], None] | None = None,
        restore_edge_state: Callable[[], Awaitable[list[str]]] | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._watch_index = alert_rule_watch_index
        self._is_dnd_active = is_dnd_active
        self._is_alert_bypass_dnd = is_alert_bypass_dnd
        self._is_in_cooldown = is_in_cooldown
        self._set_cooldown = set_cooldown
        self._notify = notify
        self._persist_edge_state = persist_edge_state
        self._restore_edge_state = restore_edge_state

        self.rules_cache: list[dict[str, Any]] = []
        self.rules_cache_stale = False
        self._condition_history: dict[str, list[dict[str, str]]] = {}
        self._match_state: dict[str, bool] = {}

    # ------------------------------------------------------------------ #
    # 初始化
    # ------------------------------------------------------------------ #
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

    async def load_edge_state(self) -> None:
        if self._restore_edge_state is None:
            return
        try:
            keys = await self._restore_edge_state()
        except Exception as exc:
            logger.debug("恢复告警边沿状态失败: %s", exc)
            return
        if not keys:
            return
        self._match_state.clear()
        for key in keys:
            if key:
                self._match_state[key] = True

    def _persist_edge_state_now(self) -> None:
        if self._persist_edge_state is None:
            return
        matched = [key for key, is_on in self._match_state.items() if is_on]
        self._persist_edge_state(matched)

    def _persist_condition_history(self) -> None:
        payload = dict(self._condition_history.items())
        try:
            persist_runtime_kv(self._session_factory, RULE_REVISIONS_ID, payload)
        except Exception as exc:
            logger.debug("告警规则修订历史持久化失败: %s", exc)

    # ------------------------------------------------------------------ #
    # 规则缓存
    # ------------------------------------------------------------------ #
    async def refresh_rules_cache(self) -> None:
        """刷新告警规则缓存（仅保留启用的规则），并更新 HA 实体订阅索引。"""
        try:
            all_rules = await asyncio.to_thread(self._fetch_rules_from_db)
            self.rules_cache = [rule for rule in all_rules if rule.get("enabled")]
            self._watch_index.update_from_rules(self.rules_cache)
            self.rules_cache_stale = False
            logger.info("告警规则已加载: %s 条启用", len(self.rules_cache))
        except Exception as exc:
            self.rules_cache_stale = True
            logger.warning(
                "刷新告警规则缓存失败,保留旧缓存 %s 条(标记 stale): %s",
                len(self.rules_cache),
                exc,
            )

    def _fetch_rules_from_db(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            rows = (
                session.execute(
                    select(AlertRule).order_by(AlertRule.created_at.desc()).limit(MAX_RULES)
                )
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

    # ------------------------------------------------------------------ #
    # 条件求值（边沿触发）
    # ------------------------------------------------------------------ #
    async def evaluate_rules(
        self,
        entity_id: str,
        state: str,
        attributes: dict[str, Any] | None = None,
    ) -> None:
        if not self.rules_cache:
            return
        attributes = attributes or {}
        for rule in list(self.rules_cache):
            rule_entity_id = rule.get("entityId")
            if rule_entity_id and rule_entity_id != entity_id:
                continue
            try:
                matched = evaluate_condition(rule.get("condition") or "", state, attributes)
            except Exception:
                matched = False
            rule_key = rule.get("id") or rule.get("name")
            edge_key = f"{rule_key}:{entity_id}"
            if not matched:
                if self._match_state.get(edge_key) is True:
                    self._match_state[edge_key] = False
                    self._persist_edge_state_now()
                continue
            # 电平持续匹配时不重复通知，仅在边沿（未匹配→匹配）触发
            if self._match_state.get(edge_key) is True:
                continue

            # 冷却 / 免打扰在锁存边沿之前判定：未通过时不锁存边沿。
            cooldown_key = f"rule:{rule_key}:{entity_id}"
            if self._is_in_cooldown(cooldown_key):
                continue
            bypass_dnd = rule.get("level") == "danger" or self._is_alert_bypass_dnd()
            if self._is_dnd_active() and not bypass_dnd:
                continue

            self._match_state[edge_key] = True
            self._persist_edge_state_now()

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
            delivered: Any = None
            try:
                delivered = await self._notify(
                    rule.get("level") or "info",
                    message,
                    "alert-rule",
                    entity_id,
                    {
                        # 空渠道语义为「仅站内 + 实时」，避免落库为 [] 时被当作全渠道外发。
                        "channels": resolve_alert_rule_channels(rule.get("channels")),
                        "title": rule.get("title"),
                        "bypassDnd": True if (bypass_dnd and rule.get("level") != "danger") else None,
                    },
                )
            except Exception as exc:
                logger.warning("告警规则通知失败: %s", exc)
            if delivered:
                cooldown_minutes = rule.get("cooldownMinutes")
                if _is_finite_number(cooldown_minutes):
                    minutes = max(0.0, float(cooldown_minutes))
                else:
                    minutes = 60.0
                self._set_cooldown(cooldown_key, minutes)
            else:
                # 通知未投递：回滚边沿匹配状态，保证条件持续匹配期间可重试。
                self._match_state[edge_key] = False
                self._persist_edge_state_now()

    # ------------------------------------------------------------------ #
    # CRUD
    # ------------------------------------------------------------------ #
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
        cooldown = rule.get("cooldownMinutes")
        cooldown_minutes = (
            int(max(0.0, float(cooldown))) if _is_finite_number(cooldown) else 60
        )
        channels = rule.get("channels") if isinstance(rule.get("channels"), list) else []

        def _insert() -> dict[str, Any]:
            with self._session_factory() as session:
                duplicate_filter = [AlertRule.condition == condition]
                if entity_id is None:
                    duplicate_filter.append(AlertRule.entity_id.is_(None))
                else:
                    duplicate_filter.append(AlertRule.entity_id == entity_id)
                duplicate = session.execute(
                    select(AlertRule.id).where(*duplicate_filter)
                ).first()
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

                if "name" in partial:
                    existing.name = str(partial["name"]).strip()
                if "entityId" in partial:
                    existing.entity_id = partial["entityId"]
                if "condition" in partial:
                    existing.condition = partial["condition"]
                if "level" in partial:
                    existing.level = partial["level"]
                if "channels" in partial:
                    existing.channels = json.dumps(partial["channels"], ensure_ascii=False)
                if "cooldownMinutes" in partial:
                    cooldown = partial["cooldownMinutes"]
                    if _is_finite_number(cooldown):
                        existing.cooldown_minutes = int(max(0.0, float(cooldown)))
                    else:
                        existing.cooldown_minutes = 60
                if "enabled" in partial:
                    existing.enabled = bool(partial["enabled"])
                if "messageTemplate" in partial:
                    existing.message_template = (
                        str(partial["messageTemplate"]).strip() or None
                    )
                if "title" in partial:
                    existing.title = str(partial["title"]).strip() or None

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
        await self.refresh_rules_cache()
        return result

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
    return payload


def _iso_now() -> str:
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


__all__ = ["RULE_REVISIONS_ID", "NotificationRulesHelper"]
