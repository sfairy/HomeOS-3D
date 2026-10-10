"""实体执行前访问控制（对齐 common/http-security/entity-execute-acl.util.ts）。

在「按实体下发动作」的执行入口（家庭模式动作、语音命令、Agent 工具等）前，对目标实体
做实体级白名单（``restrictions``）校验。

角色维度**已移除**：HomeOS 是单一管理员模型，库里不存在 guest / child 账号，因此原先的
「儿童域黑名单」「child 无白名单直接拒绝」等分支都不可达，已一并删除。剩下的白名单当前
也恒为空（见 ``security.auth_context.resolve_restrictions``），故实际恒放行；保留实现以便
将来接入白名单时无需改调用点。
"""

from __future__ import annotations

from typing import Any

from ..core.entity_domain import get_entity_domain
from ..core.errors import api_error, forbidden
from ..realtime.access import is_entity_allowed


def _dedup_targets(targets: list[dict[str, Any]] | None) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for target in targets or []:
        entity_id = (target or {}).get("entityId")
        if not entity_id:
            continue
        domain = (target or {}).get("domain") or get_entity_domain(entity_id)
        key = f"{entity_id}|{domain}"
        if key in seen:
            continue
        seen.add(key)
        out.append((entity_id, domain))
    return out


def assert_entity_targets_execute_authorized(
    targets: list[dict[str, Any]] | None,
    actor: dict[str, Any] | None,
) -> None:
    """实体级白名单校验（当前恒放行，见模块 docstring）。"""
    if not actor:
        return
    restrictions = actor.get("restrictions")
    restrictions = restrictions if isinstance(restrictions, list) else []
    if not restrictions:
        return

    dedup = _dedup_targets(targets)
    if dedup and not all(is_entity_allowed(entity_id, restrictions) for entity_id, _ in dedup):
        forbidden(api_error("ACCESS_ENTITY_DENIED"))
