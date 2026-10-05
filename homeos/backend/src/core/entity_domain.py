"""实体 domain 工具（对齐 @homeos/shared 的 domain / child-restricted-domains）。"""

from __future__ import annotations

#: 儿童受限域：锁 / 报警面板 / 警报器 / 阀门（物理安全高危）。
CHILD_RESTRICTED_DOMAIN_LIST = ("lock", "alarm_control_panel", "siren", "valve")
CHILD_RESTRICTED_DOMAINS = frozenset(CHILD_RESTRICTED_DOMAIN_LIST)


def get_entity_domain(entity_id: str) -> str:
    text = str(entity_id or "")
    dot = text.find(".")
    return text[:dot] if dot > 0 else ""


def get_entity_leaf(entity_id: str) -> str:
    text = str(entity_id or "")
    dot = text.rfind(".")
    if dot < 0:
        return text
    leaf = text[dot + 1 :]
    return leaf or text


def is_child_restricted_domain(domain: str) -> bool:
    return str(domain or "").strip().lower() in CHILD_RESTRICTED_DOMAINS


def is_child_domain_access_denied(role: str | None, domain: str) -> bool:
    return role in {"child", "guest"} and is_child_restricted_domain(domain)
