"""实体 domain 工具（对齐 @homeos/shared 的 domain 解析工具）。"""

from __future__ import annotations


def get_entity_domain(entity_id: str) -> str:
    text = str(entity_id or "")
    dot = text.find(".")
    return text[:dot] if dot > 0 else ""
