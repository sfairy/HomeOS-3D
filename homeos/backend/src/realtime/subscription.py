"""WS 客户端订阅解析与实体可见性判定（对齐 subscription.util.ts）。"""

from __future__ import annotations

from typing import Any

from ..platform.core.entity_domain import get_entity_domain


def resolve_user_room_key(user: dict[str, Any], fallback_id: str | None = None) -> str:
    value = user.get("userId") or user.get("username") or fallback_id or "anon"
    return f"user:{value}"


def _is_entity_domain_subscribed(
    entity_id: str, subscribed: set[str] | None, critical_domains: Any
) -> bool:
    if not subscribed:
        return True
    domain = get_entity_domain(entity_id)
    critical = critical_domains if isinstance(critical_domains, set) else set(critical_domains)
    if domain in critical:
        return True
    return domain in subscribed


def is_entity_visible_to_client(
    entity_id: str,
    subscribed: set[str] | None,
    pinned: set[str] | None,
    critical_domains: Any,
    cold_on_demand: bool,
) -> bool:
    if cold_on_demand:
        if pinned and entity_id in pinned:
            return True
        return _is_entity_domain_subscribed(entity_id, subscribed, critical_domains)
    return _is_entity_domain_subscribed(entity_id, subscribed, critical_domains)
