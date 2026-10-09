"""「已确认 ID 集合」加载 / 持久化（对齐 ``common/crud/dismissed-id-set-persist.util.ts``）。"""

from __future__ import annotations

import logging

from ...core.runtime_kv import load_runtime_kv, persist_runtime_kv

logger = logging.getLogger("homeos.security.dismissed")


def load_dismissed_id_set(session_factory, config_id: str) -> set[str]:
    with session_factory() as session:
        data = load_runtime_kv(session, config_id)
    out: set[str] = set()
    if isinstance(data, dict) and isinstance(data.get("ids"), list):
        for item in data["ids"]:
            out.add(str(item))
    return out


def persist_dismissed_id_set(
    session_factory, label: str, config_id: str, ids: set[str]
) -> None:
    try:
        persist_runtime_kv(session_factory, config_id, {"ids": list(ids)})
    except Exception as exc:
        logger.warning("%s 失败: %s", label, exc)
