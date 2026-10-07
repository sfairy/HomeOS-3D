"""实体执行前访问控制（对齐 common/http-security/entity-execute-acl.util.ts）。

在「按实体下发动作」的执行入口（家庭模式动作、语音命令、Agent 工具等）前，
对目标实体做与 command-proxy 一致的 ACL：
- 儿童域黑名单（is_child_domain_access_denied）；
- child 无白名单直接拒绝；
- restrictions 白名单（全部命中才放行）。

关键：使用传入的 ``domain``（而非从 entity_id 推导）判断角色限制，避免 domain 覆写越权。
"""

from __future__ import annotations

from typing import Any

from ..core.entity_domain import get_entity_domain, is_child_domain_access_denied
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
    if not actor:
        return
    role = actor.get("role")
    if role == "admin":
        return

    restrictions = actor.get("restrictions")
    restrictions = restrictions if isinstance(restrictions, list) else []
    if role == "child" and not restrictions:
        forbidden(api_error("ACCESS_CHILD_NO_WHITELIST"))

    dedup = _dedup_targets(targets)
    for _entity_id, domain in dedup:
        if is_child_domain_access_denied(role, domain):
            forbidden(api_error("ACCESS_ROLE_DEVICE_DENIED"))

    if restrictions and dedup:
        if not all(is_entity_allowed(entity_id, restrictions) for entity_id, _ in dedup):
            forbidden(api_error("ACCESS_ENTITY_DENIED"))
