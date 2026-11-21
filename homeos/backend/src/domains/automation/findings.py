"""自动化草案的只读发现与冲突扫描。

发现源：HA ``automation.*`` 实体、本机计划任务、家规。冲突判定刻意保守：

- ``certain``：同一实体 + 对向动作；
- ``possible``：同一实体同动作（可能重复）、家规按「区域 + 域」自动关灯；
- ``unknown``：来源不透明（HA 明细不可见）或目标未解析。

本模块不碰数据库、不写任何状态，调用方（``AutomationDraftService``）负责提供实体元数据。
"""

from __future__ import annotations

import asyncio
import inspect
import logging
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from .spec import action_verb, opposite, text

logger = logging.getLogger("homeos.automation")

MAX_CANDIDATES = 5


def await_sync(value: Any) -> Any:
    """把可等待对象同步化（计划任务 / 家规的读取口是协程，草案服务是同步接口）。

    - 普通线程里直接 ``asyncio.run``；
    - 调用方已在事件循环里时放到一次性线程，避免 ``asyncio.run`` 抛
      “cannot be called from a running event loop”。
    """
    if not inspect.isawaitable(value):
        return value
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        try:
            return asyncio.run(value)
        except Exception as exc:  # fmt: skip
            logger.debug("读取异步规则失败: %s", exc)
            return None
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, value).result()
    except Exception as exc:  # fmt: skip
        logger.debug("读取异步规则失败: %s", exc)
        return None


def read_ha_automations(entities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """HA ``automation.*`` 实体 → 规则条目（明细不可见，标为 BLIND）。"""
    rules: list[dict[str, Any]] = []
    for item in entities:
        if not isinstance(item, dict):
            continue
        raw_attrs = item.get("attributes")
        attrs: dict[str, Any] = raw_attrs if isinstance(raw_attrs, dict) else {}
        entity_id = text(item.get("entity_id"))
        if not entity_id:
            continue
        rules.append(
            {
                "id": entity_id,
                "source": "HA",
                "name": text(attrs.get("friendly_name")),
                "entityIds": [entity_id],
                "targets": [],
                "verbs": [],
                "visibility": "BLIND",
                "blindspots": ["HA 自动化配置明细不可见"],
            }
        )
    return rules


def read_scheduled_rules(scheduler: Any) -> list[dict[str, Any]]:
    """本机计划任务 → 规则条目（目标实体 + 动作动词可见）。"""
    if scheduler is None:
        return []
    lister = getattr(scheduler, "list_tasks", None)
    if not callable(lister):
        return []
    try:
        tasks = await_sync(lister()) or []
    except Exception as exc:  # fmt: skip
        logger.debug("读取计划任务失败: %s", exc)
        return []
    rules: list[dict[str, Any]] = []
    for task in tasks:
        if not isinstance(task, dict):
            continue
        action_args = task.get("actionArgs")
        if not isinstance(action_args, dict):
            action_args = {}
        entity_id = text(action_args.get("entity_id") or action_args.get("entityId"))
        service = text(action_args.get("service"))
        rules.append(
            {
                "id": text(task.get("id")),
                "source": "AURA",
                "name": text(task.get("name") or task.get("title")),
                "entityIds": [entity_id] if entity_id else [],
                "verbs": [action_verb(service)] if service else [],
                "visibility": "FULL",
            }
        )
    return rules


def read_policy_rules(policy: Any) -> list[dict[str, Any]]:
    """家规 → 规则条目（按区域 + 设备域生效，动作是自动关停）。"""
    if policy is None:
        return []
    lister = getattr(policy, "list_rules", None)
    if not callable(lister):
        return []
    try:
        rows = await_sync(lister()) or []
    except Exception as exc:  # fmt: skip
        logger.debug("读取家规失败: %s", exc)
        return []
    rules: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        rules.append(
            {
                "id": text(row.get("id")),
                "source": "AURA_POLICY",
                "name": text(row.get("name")),
                "areaId": text(row.get("areaId")),
                "areaName": text(row.get("areaName")),
                "targetDomains": [str(item) for item in (row.get("targetDomains") or []) if str(item)],
                "entityIds": [],
                "verbs": ["OFF"] if bool(row.get("autoClose")) else [],
                "visibility": "PARTIAL",
            }
        )
    return rules


def scan_conflicts(
    *,
    spec: dict[str, Any],
    entity_meta: Callable[[str], dict[str, Any]],
    scheduled: list[dict[str, Any]],
    policies: list[dict[str, Any]],
    ha_rules: list[dict[str, Any]],
) -> dict[str, Any]:
    """扫描草案与已有规则的冲突 / 盲区。"""
    raw_action = spec.get("action")
    action: dict[str, Any] = raw_action if isinstance(raw_action, dict) else {}
    proposed_service = text(action.get("service"))
    proposed_verb = action_verb(proposed_service)
    raw_targets = spec.get("targets")
    targets = [item for item in (raw_targets if isinstance(raw_targets, list) else []) if isinstance(item, dict)]
    by_entity = {text(item.get("entityId")): item for item in targets if text(item.get("entityId"))}

    certain, scheduled_possible = _scheduled_conflicts(proposed_verb, proposed_service, by_entity, scheduled)
    possible = [*scheduled_possible, *_policy_conflicts(proposed_verb, by_entity, policies, entity_meta)]
    unknown = _blindspots(targets, by_entity, entity_meta, ha_rules)
    return {"certain": certain, "possible": possible, "unknown": unknown}


def _scheduled_conflicts(
    proposed_verb: str,
    proposed_service: str,
    by_entity: dict[str, dict[str, Any]],
    scheduled: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    certain: list[dict[str, Any]] = []
    possible: list[dict[str, Any]] = []
    for rule in scheduled:
        entity_ids = [str(item) for item in (rule.get("entityIds") or []) if str(item)]
        verbs = [str(item) for item in (rule.get("verbs") or []) if str(item)]
        for entity_id in entity_ids:
            if entity_id not in by_entity:
                continue
            if any(opposite(proposed_verb, verb) for verb in verbs):
                certain.append(
                    {
                        "kind": "opposite_action",
                        "entityId": entity_id,
                        "existingId": rule.get("id"),
                        "existingSource": rule.get("source"),
                        "existingName": rule.get("name"),
                        "existingAction": verbs,
                        "proposedAction": proposed_service,
                        "reason": f"同实体 {entity_id} 已有计划任务执行对向动作",
                    }
                )
            elif proposed_verb and proposed_verb in verbs:
                possible.append(
                    {
                        "kind": "same_action",
                        "entityId": entity_id,
                        "existingId": rule.get("id"),
                        "existingSource": rule.get("source"),
                        "reason": f"同实体 {entity_id} 已有相同动作的计划任务，可能重复执行",
                    }
                )
    return certain, possible


def _policy_conflicts(
    proposed_verb: str,
    by_entity: dict[str, dict[str, Any]],
    policies: list[dict[str, Any]],
    entity_meta: Callable[[str], dict[str, Any]],
) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for rule in policies:
        area_id = text(rule.get("areaId"))
        domains = {str(item) for item in (rule.get("targetDomains") or []) if str(item)}
        verbs = {str(item) for item in (rule.get("verbs") or []) if str(item)}
        if not area_id or not domains or not proposed_verb:
            continue
        for entity_id in by_entity:
            meta = entity_meta(entity_id)
            if text(meta.get("areaId")) != area_id or entity_id.split(".", 1)[0] not in domains:
                continue
            if not any(opposite(proposed_verb, verb) for verb in verbs):
                continue
            found.append(
                {
                    "kind": "policy_auto_close",
                    "entityId": entity_id,
                    "existingId": rule.get("id"),
                    "existingSource": rule.get("source"),
                    "existingName": rule.get("name"),
                    "reason": f"家规「{rule.get('name') or rule.get('id')}」会在该区域无人时自动关闭同类设备",
                }
            )
    return found


def _blindspots(
    targets: list[dict[str, Any]],
    by_entity: dict[str, dict[str, Any]],
    entity_meta: Callable[[str], dict[str, Any]],
    ha_rules: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    unknown: list[dict[str, Any]] = []
    if ha_rules:
        unknown.append(
            {
                "kind": "unreadable_source",
                "source": "HA",
                "count": len(ha_rules),
                "reason": "HA 自动化的触发/动作明细不可见，无法静态判断是否与草案冲突",
                "refs": [rule.get("id") for rule in ha_rules[:MAX_CANDIDATES] if rule.get("id")],
            }
        )
    for entity_id, target in by_entity.items():
        if not entity_meta(entity_id).get("resolved", True):
            unknown.append(
                {
                    "kind": "unresolved_target",
                    "entityId": entity_id,
                    "reason": "目标实体当前不在 HA 状态里，落地后可能找不到设备",
                    "name": text(target.get("name")),
                }
            )
    for item in targets:
        if not text(item.get("entityId")):
            unknown.append(
                {
                    "kind": "ambiguous_target",
                    "name": text(item.get("name")),
                    "reason": "目标未解析为实体 ID，无法判断与已有规则的冲突",
                }
            )
    return unknown


__all__ = [
    "await_sync",
    "read_ha_automations",
    "read_policy_rules",
    "read_scheduled_rules",
    "scan_conflicts",
]
