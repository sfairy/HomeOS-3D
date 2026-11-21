"""自动化草案的规范归一化、风险判定与展示描述（与持久化 / 发现解耦）。

Agent 真正传进来的形状很杂：``targets:["light.x"]`` / ``[{entityId}]`` / ``entity_id``、
``action:"light.turn_off"`` / ``{service}``、``trigger`` / ``triggers``、``intent_text`` 等。
这里统一收敛成一种 spec，后续的澄清、预览、冲突扫描与哈希只看归一化结果。
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

INTENT_SUMMARY_MAX = 160
TRIGGER_DESCRIPTION_MAX = 120
MAX_CANDIDATES = 5

#: 禁止出现在动作服务 / 目标里的模板语法
_TEMPLATE_TOKEN = "{{"
#: 高危域 / 服务（与 Agent 高危名单同源，但这里按「草案落地」再拦一次）
_HIGH_RISK_SERVICES = frozenset({"lock", "unlock", "alarm_disarm", "alarm_trigger"})
#: 高危目标域：无论动作是什么，门锁 / 安防面板都不进草案
_HIGH_RISK_DOMAINS = frozenset({"lock", "alarm_control_panel"})
_GARAGE_HINTS = ("garage", "che_ku", "车库", "gate", "da_men", "大门", "yuan_men", "院门", "men_kai")
_GAS_HINTS = ("gas", "valve", "燃气", "阀门", "总闸")

#: 归一化时接受的字段别名（camelCase / snake_case / 参考实现的字段名）
_ENTITY_ID_KEYS = ("entityId", "entity_id", "entity", "id")
_NAME_KEYS = ("name", "friendlyName", "friendly_name", "alias", "label")
_ACTION_KEYS = ("service", "actionService", "action_service", "serviceName", "service_name")
_DATA_KEYS = ("data", "actionData", "action_data", "service_data", "serviceData")
_SUMMARY_KEYS = ("intentSummary", "intent_summary", "intent_text", "intentText", "summary")
_RAW_PROMPT_KEYS = ("rawPrompt", "raw_prompt", "intent_text", "intentText")


def text(value: Any) -> str:
    return str(value or "").strip()


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC).isoformat()


def naive_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def first(source: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = source.get(key)
        if value not in (None, "", [], {}):
            return value
    return None


def as_list(value: Any) -> list[Any]:
    """把单个值 / 列表 / 字典统一成列表；``None`` 变成空列表。"""
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def sanitize_untrusted_text(value: Any, limit: int) -> str:
    collapsed = " ".join(text(value).replace("\r", " ").replace("\n", " ").replace("\t", " ").split())
    return collapsed[: limit - 1] + "…" if len(collapsed) > limit else collapsed


def is_high_risk(spec: dict[str, Any]) -> list[str]:
    """返回命中的高危理由（空数组 = 通过）。"""
    reasons: list[str] = []
    raw_action = spec.get("action")
    action: dict[str, Any] = raw_action if isinstance(raw_action, dict) else {}
    base_service = text(action.get("service")).lower()
    if "." in base_service:
        base_service = base_service.rsplit(".", 1)[-1]
    if base_service in _HIGH_RISK_SERVICES:
        reasons.append(f"service:{base_service}")
    raw_targets = spec.get("targets")
    targets: list[Any] = raw_targets if isinstance(raw_targets, list) else []
    for target in targets:
        if isinstance(target, dict):
            entity_id = text(first(target, _ENTITY_ID_KEYS) or target.get("name")).lower()
        else:
            entity_id = text(target).lower()
        if not entity_id:
            continue
        if entity_id.split(".", 1)[0] in _HIGH_RISK_DOMAINS:
            reasons.append(f"entity:{entity_id}")
        if any(hint in entity_id for hint in _GAS_HINTS):
            reasons.append(f"gas:{entity_id}")
        if base_service == "open_cover" and any(hint in entity_id for hint in _GARAGE_HINTS):
            reasons.append(f"garage:{entity_id}")
    return sorted(set(reasons))


def contains_template(spec: dict[str, Any]) -> bool:
    return _TEMPLATE_TOKEN in json.dumps(spec, ensure_ascii=False)


def spec_hash(spec: dict[str, Any]) -> str:
    canonical = json.dumps(spec, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def action_verb(service: str) -> str:
    """服务名 → 对向动作（ON / OFF / 其它）。"""
    base = text(service).lower()
    if "." in base:
        base = base.rsplit(".", 1)[-1]
    if base in ("turn_on", "open_cover", "open", "start", "unlock", "activate"):
        return "ON"
    if base in ("turn_off", "close_cover", "close", "stop", "lock", "deactivate"):
        return "OFF"
    return base


def opposite(left: str, right: str) -> bool:
    return {left, right} == {"ON", "OFF"}


def describe_trigger(trigger: dict[str, Any]) -> str:
    """按触发器字段生成一句人话，供预览与冲突报告阅读。"""
    kind = text(trigger.get("type")) or "time"
    at = text(trigger.get("at"))
    entity_id = text(trigger.get("entityId"))
    from_state = text(trigger.get("from"))
    to_state = text(trigger.get("to"))
    days = text(trigger.get("days")) or text(trigger.get("weekday"))
    if kind == "time" and at:
        prefix = f"每周 {days} " if days and not days.isdigit() else "每天 "
        return f"{prefix}{at}"
    if kind == "state" and entity_id:
        transition = f"{from_state} → {to_state}" if from_state or to_state else "状态变化"
        return f"当 {entity_id} {transition}"
    if kind == "cron":
        cron = text(trigger.get("cron"))
        return f"按 cron 计划 {cron}" if cron else "按 cron 计划"
    return text(trigger.get("description")) or kind


def normalize_spec(
    spec: dict[str, Any],
    *,
    resolve_name: Callable[[str], str],
    entity_name: Callable[[str], str],
) -> dict[str, Any]:
    """把任意输入形状收敛成持久化 spec。"""
    source = spec if isinstance(spec, dict) else {}
    raw_targets = first(source, ("targets", "targetEntities", "entities", "entity_ids", "entityIds"))
    if raw_targets is None:
        raw_targets = source.get("target") or source.get("entity")
    if isinstance(raw_targets, str):
        # "light.a, light.b" / "客厅灯、厨房灯" 这类连写拆成多个目标
        raw_targets = [part for part in re.split(r"[,，、\s]+", raw_targets) if part]
    targets = [_normalize_target(item, resolve_name, entity_name) for item in as_list(raw_targets)]
    targets = [item for item in targets if item is not None]

    raw_triggers = first(source, ("triggers", "trigger", "when"))
    triggers = [_normalize_trigger(item) for item in as_list(raw_triggers)]
    triggers = [item for item in triggers if item is not None]

    action = _normalize_action(source.get("action"), first(source, _DATA_KEYS))
    if not action["service"]:
        # action 为空对象时，顶层 actionService / service 仍然有效
        action = _normalize_action(first(source, _ACTION_KEYS), first(source, _DATA_KEYS))
    if action["service"] and "." not in action["service"]:
        # "turn_off" 这类省略域的服务名：从目标实体补出 light.turn_off
        action["service"] = _qualify_service(action["service"], targets)

    summary = first(source, _SUMMARY_KEYS) or first(source, _RAW_PROMPT_KEYS) or ""
    conditions = as_list(first(source, ("conditions", "condition")))
    return {
        "targetBackend": text(source.get("targetBackend") or source.get("target_backend")) or "HA",
        "targets": targets,
        "triggers": triggers,
        "action": action,
        "conditions": [item for item in conditions if isinstance(item, (dict, str))],
        "forDuration": text(first(source, ("forDuration", "for_duration", "duration"))),
        "mode": text(source.get("mode")) or "single",
        "timezone": text(source.get("timezone")) or "Asia/Shanghai",
        "intentSummary": sanitize_untrusted_text(summary, INTENT_SUMMARY_MAX),
    }


def merge_spec(current: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    """修订合并：trigger 浅合并，其余字段替换。"""
    merged = {**current}
    for key, value in (patch or {}).items():
        if key in ("trigger", "triggers") and isinstance(value, (dict, list)):
            incoming = value if isinstance(value, list) else [value]
            current_triggers = merged.get("triggers") if isinstance(merged.get("triggers"), list) else []
            if isinstance(value, dict) and current_triggers and isinstance(current_triggers[0], dict):
                merged["triggers"] = [{**current_triggers[0], **value}, *current_triggers[1:]]
            else:
                merged["triggers"] = incoming
            merged.pop("trigger", None)
        elif key == "action" and isinstance(value, str):
            merged["action"] = {"service": value}
        elif key == "action" and isinstance(value, dict) and isinstance(merged.get("action"), dict):
            merged["action"] = {**merged["action"], **value}
        else:
            merged[key] = value
    return merged


def _normalize_target(
    item: Any,
    resolve_name: Callable[[str], str],
    entity_name: Callable[[str], str],
) -> dict[str, Any] | None:
    if isinstance(item, str):
        raw = text(item)
        entity_id = raw if "." in raw else ""
        name = "" if entity_id else raw
    elif isinstance(item, dict):
        entity_id = text(first(item, _ENTITY_ID_KEYS))
        name = text(first(item, _NAME_KEYS))
        if not entity_id and name and "." in name:
            entity_id, name = name, ""
        if entity_id and "." not in entity_id:
            # 把 "客厅灯" 误填进 entityId 时按名字处理
            name = name or entity_id
            entity_id = ""
    else:
        return None
    if not entity_id and not name:
        return None
    if not entity_id:
        entity_id = resolve_name(name)
    resolved_name = name
    if entity_id:
        resolved_name = resolved_name or text(entity_name(entity_id)) or entity_id
    return {"entityId": entity_id, "name": sanitize_untrusted_text(resolved_name, 80)}


def _normalize_trigger(item: Any) -> dict[str, Any] | None:
    if isinstance(item, str):
        description = text(item)
        return (
            {"type": "time", "description": sanitize_untrusted_text(description, TRIGGER_DESCRIPTION_MAX)}
            if description
            else None
        )
    if not isinstance(item, dict):
        return None
    kind = text(item.get("type") or item.get("trigger") or "time") or "time"
    trigger: dict[str, Any] = {"type": kind}
    for key, aliases in (
        ("at", ("at", "time")),
        ("entityId", ("entityId", "entity_id", "entity")),
        ("from", ("from", "from_state", "fromState")),
        ("to", ("to", "to_state", "toState")),
        ("cron", ("cron",)),
        ("days", ("days", "weekday", "weekdays")),
        ("service", ("service",)),
    ):
        value = first(item, aliases)
        if value not in (None, "", [], {}):
            trigger[key] = value if isinstance(value, (list, dict)) else text(value)
        elif key == "entityId" and kind == "state":
            trigger[key] = ""
    # 结构化字段（at / cron / state 实体）优先于模型写的描述：修订只改 at 时，
    # 不能让预览继续显示旧的「每天 22:00」。
    structural = bool(trigger.get("at") or trigger.get("cron") or (kind == "state" and trigger.get("entityId")))
    description = describe_trigger(trigger) if structural else text(item.get("description"))
    trigger["description"] = sanitize_untrusted_text(description or describe_trigger(trigger), TRIGGER_DESCRIPTION_MAX)
    return trigger


def _normalize_action(raw: Any, raw_data: Any = None) -> dict[str, Any]:
    service = ""
    data: dict[str, Any] = {}
    if isinstance(raw, str):
        service = text(raw)
    elif isinstance(raw, dict):
        service = text(first(raw, _ACTION_KEYS))
        payload = raw.get("data")
        if isinstance(payload, dict):
            data = payload
    if isinstance(raw_data, dict):
        data = raw_data
    return {"service": service, "data": data}


def _qualify_service(service: str, targets: list[dict[str, Any]]) -> str:
    value = text(service)
    if not value or "." in value:
        return value
    for target in targets:
        entity_id = text(target.get("entityId"))
        if "." in entity_id:
            return f"{entity_id.split('.', 1)[0]}.{value}"
    return value


__all__ = [
    "INTENT_SUMMARY_MAX",
    "MAX_CANDIDATES",
    "TRIGGER_DESCRIPTION_MAX",
    "action_verb",
    "as_list",
    "contains_template",
    "describe_trigger",
    "first",
    "is_high_risk",
    "iso",
    "merge_spec",
    "naive_now",
    "normalize_spec",
    "opposite",
    "sanitize_untrusted_text",
    "spec_hash",
    "text",
]
