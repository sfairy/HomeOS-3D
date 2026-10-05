"""生活方式域（``modules/system/lifestyle`` 的 Python 等价实现）。

当前覆盖：
- 访客临时密码（``GuestAccessService``）与 AES-256-GCM 密文工具；
- 影音场景（``MediaSceneService``）。
语音（voice）属感知域，Phase 6 接入 ``AwarenessModule`` 后挂载同一 router。
"""

from __future__ import annotations

from .guest_access import GuestAccessService
from .media_scene import MediaSceneService

__all__ = ["GuestAccessService", "MediaSceneService"]
