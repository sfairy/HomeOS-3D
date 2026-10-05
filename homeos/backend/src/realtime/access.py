"""实体访问控制（对齐 @homeos/shared/entity/access.ts 与 sync-priority.ts）。"""

from __future__ import annotations

from typing import Any

from ..core.entity_domain import get_entity_domain

DEFAULT_CRITICAL_DOMAINS = ("light", "switch", "cover", "climate", "media_player", "fan")
WS_PUSH_CRITICAL_DOMAINS = (*DEFAULT_CRITICAL_DOMAINS, "lock")


def resolve_entity_restrictions(user: dict[str, Any] | None) -> list[str] | None:
    """解析实体可见性限制：``None`` 无限制；``[]`` 无可见实体；``[..]`` 前缀列表。"""
    if not user or not user.get("role") or user.get("role") == "admin":
        return None
    restrictions = user.get("restrictions")
    if isinstance(restrictions, list) and restrictions:
        return [str(item) for item in restrictions]
    if user.get("role") in ("guest", "child"):
        return []
    return None


def is_entity_allowed(entity_id: str, user_or_restrictions: Any) -> bool:
    restrictions = (
        user_or_restrictions
        if isinstance(user_or_restrictions, list)
        else resolve_entity_restrictions(user_or_restrictions)
    )
    if restrictions is None:
        return True
    if not entity_id or not restrictions:
        return False
    if len(restrictions) <= 4:
        for prefix in restrictions:
            if "." in prefix:
                if prefix.endswith("."):
                    if entity_id.startswith(prefix):
                        return True
                elif entity_id == prefix:
                    return True
            elif get_entity_domain(entity_id) == prefix:
                return True
        return False
    domain = get_entity_domain(entity_id)
    for prefix in restrictions:
        if "." in prefix:
            if prefix.endswith("."):
                if entity_id.startswith(prefix):
                    return True
            elif entity_id == prefix:
                return True
        elif domain == prefix:
            return True
    return False


def is_entity_allowed_by_restrictions(entity_id: str, restrictions: list[str]) -> bool:
    """对齐 ``isEntityAllowedByRestrictions``：restrictions 为空视为不限制。"""
    if not restrictions:
        return True
    return is_entity_allowed(entity_id, restrictions)


def filter_entities_by_access(
    entities: list[dict[str, Any]], user: dict[str, Any] | None
) -> list[dict[str, Any]]:
    restrictions = resolve_entity_restrictions(user)
    if restrictions is None:
        return entities
    if not restrictions:
        return []
    if len(restrictions) > 4:
        domain_set = {r for r in restrictions if "." not in r}
        exact_set = {r for r in restrictions if "." in r}
        prefix_set = {r for r in exact_set if r.endswith(".")}
        return [
            entity
            for entity in entities
            if entity.get("entity_id") in exact_set
            or get_entity_domain(str(entity.get("entity_id", ""))) in domain_set
            or any(str(entity.get("entity_id", "")).startswith(p) for p in prefix_set)
        ]
    return [entity for entity in entities if is_entity_allowed(str(entity.get("entity_id", "")), restrictions)]


def can_control_entity(entity_id: str, user: dict[str, Any] | None) -> bool:
    role = (user or {}).get("role")
    if not role or role == "guest":
        return False
    if role == "child" and not (user or {}).get("restrictions"):
        return False
    return is_entity_allowed(entity_id, user)


def sort_entities_by_sync_priority(
    entities: list[dict[str, Any]], critical_domains: list[str] | tuple[str, ...] | None = None
) -> list[dict[str, Any]]:
    if not entities or len(entities) <= 1:
        return list(entities or [])
    critical = set(critical_domains or DEFAULT_CRITICAL_DOMAINS)
    high: list[dict[str, Any]] = []
    low: list[dict[str, Any]] = []
    for entity in entities:
        if get_entity_domain(str(entity.get("entity_id", ""))) in critical:
            high.append(entity)
        else:
            low.append(entity)
    return high + low if low else high
