"""删除级联清理（历史位置）：实现已迁到 domains/studio3d/cleanup.py。

保留本模块只为已有导入路径继续可用；新代码请直接用 domains.studio3d.cleanup。
"""

from __future__ import annotations

from ...domains.studio3d.cleanup import (
    COLLECTIONS,
    binding_key,
    collection,
    confirmation_token,
    identities,
    plan_cleanup,
)

__all__ = [
    "COLLECTIONS",
    "binding_key",
    "collection",
    "confirmation_token",
    "identities",
    "plan_cleanup",
]
