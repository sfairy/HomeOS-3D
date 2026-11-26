"""生活方式域（``modules/system/lifestyle`` 的 Python 等价实现）。

当前覆盖影音场景（``MediaSceneService``）。
语音（voice）属感知域，Phase 6 接入 ``AwarenessModule`` 后挂载同一 router。
"""

from __future__ import annotations

from .media_scene import MediaSceneService

__all__ = ["MediaSceneService"]
