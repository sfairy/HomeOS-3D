"""Socket.IO 单帧缓冲自适应（对齐 Nest ``modules/ws-push/ws-buffer.util.ts``）。

依据 state-store 实体数量在 8MB ~ 50MB 之间分档，避免默认 1MB 不足以推送大型 HA
实例的全量 ``initial_states``；环境变量 ``WS_PUSH_MAX_BUFFER_MB``（8~50）优先。

同时给出单连接写队列的背压帧上限（默认 512，环境变量
``HOMEOS_WS_PUSH_BACKPRESSURE_FRAMES`` 可覆盖）：超过该帧数即视为该连接已堵塞，
广播时跳过它而不是继续往无界队列灌数据。
"""

from __future__ import annotations

import logging
import math
import os

logger = logging.getLogger("homeos.realtime.ws_buffer")

WS_BUFFER_MIN_BYTES = 8 * 1024 * 1024
WS_BUFFER_MAX_BYTES = 50 * 1024 * 1024
WS_BUFFER_ENV = "WS_PUSH_MAX_BUFFER_MB"

#: 单连接写队列背压帧上限（Koa/engineio 的 queue + write_buffer 帧数）。
WS_PUSH_BACKPRESSURE_FRAMES_ENV = "HOMEOS_WS_PUSH_BACKPRESSURE_FRAMES"
WS_PUSH_BACKPRESSURE_FRAMES_DEFAULT = 512
WS_PUSH_BACKPRESSURE_FRAMES_MIN = 16
WS_PUSH_BACKPRESSURE_FRAMES_MAX = 65536


def compute_ws_max_buffer_bytes(entity_count: int = 0) -> int:
    """按实体数量分档：500 / 2000 / 5000 三段阈值，超出取最大值。

    重连改为「优先只发增量回放」后，全量 ``initial_states`` 不再每次都推送，
    2000 档从 16MB 收紧到 8MB（705 实体实例约 1MB 全量，仍有 8 倍余量）。
    """
    if entity_count <= 2000:
        return WS_BUFFER_MIN_BYTES
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


def resolve_ws_push_backpressure_frames() -> int:
    """单连接写队列背压帧上限：环境变量优先，非法值回退 512，并夹进安全区间。

    下限 16 防止配置成 0 后每条变更都触发「丢包 + 建议重同步」的风暴；上限 65536
    防止误配成天文数字把内存保护变成无界队列。
    """
    raw = os.getenv(WS_PUSH_BACKPRESSURE_FRAMES_ENV)
    if raw is not None and raw.strip():
        try:
            frames = int(float(raw.strip()))
        except ValueError:
            logger.debug(
                "背压帧上限配置非法,回退默认 %s: %r", WS_PUSH_BACKPRESSURE_FRAMES_DEFAULT, raw
            )
            frames = WS_PUSH_BACKPRESSURE_FRAMES_DEFAULT
        if frames < WS_PUSH_BACKPRESSURE_FRAMES_MIN or frames > WS_PUSH_BACKPRESSURE_FRAMES_MAX:
            frames = WS_PUSH_BACKPRESSURE_FRAMES_DEFAULT
        return frames
    return WS_PUSH_BACKPRESSURE_FRAMES_DEFAULT


__all__ = [
    "WS_BUFFER_ENV",
    "WS_BUFFER_MAX_BYTES",
    "WS_BUFFER_MIN_BYTES",
    "WS_PUSH_BACKPRESSURE_FRAMES_DEFAULT",
    "WS_PUSH_BACKPRESSURE_FRAMES_ENV",
    "WS_PUSH_BACKPRESSURE_FRAMES_MAX",
    "WS_PUSH_BACKPRESSURE_FRAMES_MIN",
    "compute_ws_max_buffer_bytes",
    "resolve_ws_max_buffer_bytes",
    "resolve_ws_push_backpressure_frames",
]
