"""Socket.IO 单帧缓冲自适应（对齐 Nest ``modules/ws-push/ws-buffer.util.ts``）。

依据 state-store 实体数量在 8MB ~ 50MB 之间分档，避免默认 1MB 不足以推送大型 HA
实例的全量 ``initial_states``；环境变量 ``WS_PUSH_MAX_BUFFER_MB``（8~50）优先。
"""

from __future__ import annotations

import math
import os

WS_BUFFER_MIN_BYTES = 8 * 1024 * 1024
WS_BUFFER_MAX_BYTES = 50 * 1024 * 1024
WS_BUFFER_ENV = "WS_PUSH_MAX_BUFFER_MB"


def compute_ws_max_buffer_bytes(entity_count: int = 0) -> int:
    """按实体数量分档：500 / 2000 / 5000 三段阈值，超出取最大值。"""
    if entity_count <= 500:
        return WS_BUFFER_MIN_BYTES
    if entity_count <= 2000:
        return 16 * 1024 * 1024
    if entity_count <= 5000:
        return 32 * 1024 * 1024
    return WS_BUFFER_MAX_BYTES


def resolve_ws_max_buffer_bytes(entity_count: int = 0) -> int:
    """环境变量 ``WS_PUSH_MAX_BUFFER_MB`` 优先（需在 8~50 范围），否则按实体数分档。"""
    raw = os.getenv(WS_BUFFER_ENV)
    if raw is not None and raw.strip():
        try:
            env_mb = float(raw.strip())
        except ValueError:
            env_mb = float("nan")
        if not math.isnan(env_mb) and 8 <= env_mb <= 50:
            return round(env_mb * 1024 * 1024)
    return compute_ws_max_buffer_bytes(entity_count)


__all__ = [
    "WS_BUFFER_ENV",
    "WS_BUFFER_MAX_BYTES",
    "WS_BUFFER_MIN_BYTES",
    "compute_ws_max_buffer_bytes",
    "resolve_ws_max_buffer_bytes",
]
