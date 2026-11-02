"""WS 客户端订阅解析与实体可见性判定（对齐 subscription.util.ts）。"""

from __future__ import annotations

from typing import Any

from ..platform.core.entity.entity_domain import get_entity_domain


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
    """该连接是否应该收到这个实体的状态（增量路径的订阅口径）。

    ``pinned``（布局 / 弹窗里被引用的实体）必须**无条件**可见：它是前端明确声明的关注
    集合，与域订阅是两条独立通道。旧实现把它放在 ``cold_on_demand`` 分支里，于是
    ``wsPush.coldEntityOnDemand=false`` 时钉选完全失效 —— 布局里绑定的实体只要所属域不在
    ``subscribeDomains`` 里，就再也收不到状态（初态有、之后永不更新）。

    ``cold_on_demand=False`` 的语义是「不做冷实体按需过滤，全部推送」：此时不能再按
    ``subscribeDomains`` 收窄，否则前端明明关了冷实体按需，却还是只能收到部分域 ——
    与 ``initial_states`` 下发全量的口径也不一致。
    """
    if pinned and entity_id in pinned:
        return True
    if not cold_on_demand:
        return True
    return _is_entity_domain_subscribed(entity_id, subscribed, critical_domains)

