"""HA 实时链路的三级合并窗口（毫秒）：全部可用 `HOMEOS_HA_*` 环境变量覆盖。

端到端延迟不是单层决定的，而是三层窗口叠加：

1. `live_events` 的批窗（HA WS → L1 + 广播）：把一次事件风暴压成一次落库事务；
2. `state_ingress_coalesce` 的入口微窗（HA WS → 领域事件总线）：吸收场景切换、
   全屋开关这种「同一瞬间到达」的突发；
3. `/ws/runtime` 的出站合批窗（领域事件 → 一帧）：同一帧内多条变更只发一条消息。

旧默认值（50ms + 8ms + 12ms）单看每一层都「合理」，叠起来却让一次点灯最多晚
~70ms 才出现在墙屏上。这里统一降到帧级（16ms + 4ms + 4ms）：仍保留合批能力，
但把「同一次操作的多实体变化」收在一帧内，而不是让用户手势等两个墙屏帧。

代价：窗口越小，事务/帧次数越多，大户型（数千传感器）极端刷屏时 CPU 更高。
所以缺省值按「705 实体、常规家庭」标定，部署侧可用环境变量按规模再调：

- `HOMEOS_HA_LIVE_EVENT_BATCH_WINDOW_MS`（默认 16）
- `HOMEOS_HA_LIVE_EVENT_CRITICAL_WINDOW_MS`（默认 4，关键控制域）
- `HOMEOS_HA_INGRESS_COALESCE_WINDOW_MS`（默认 4）
- `HOMEOS_HA_RUNTIME_STATE_BATCH_WINDOW_MS`（默认 4）

非法值（非数字 / 负数 / 非有限值）一律回退默认，绝不让配错把窗口变成负数或忙等；
显式配 `0` 表示关闭该层合批（入口微窗 0 即 `call_soon`）。
"""

from __future__ import annotations

import logging
import math
import os
from typing import Any

logger = logging.getLogger("homeos.ha.perf_windows")

#: 批窗默认（毫秒）：一个墙屏帧 16ms，合批最多多等一帧。
DEFAULT_LIVE_EVENT_BATCH_WINDOW_MS = 16.0
#: 关键控制域批窗默认（毫秒）：用户手势的直接反馈，只收拢同一次操作的多实体变化。
DEFAULT_LIVE_EVENT_CRITICAL_WINDOW_MS = 4.0
#: 入口微窗默认（毫秒）：吸收场景切换/全屋开关的瞬时突发，不跨帧。
DEFAULT_INGRESS_COALESCE_WINDOW_MS = 4.0
#: 出站合批窗默认（毫秒）：同一帧内到达的领域事件合成一条 WS 消息。
DEFAULT_RUNTIME_STATE_BATCH_WINDOW_MS = 4.0

LIVE_EVENT_BATCH_WINDOW_ENV = "HOMEOS_HA_LIVE_EVENT_BATCH_WINDOW_MS"
LIVE_EVENT_CRITICAL_WINDOW_ENV = "HOMEOS_HA_LIVE_EVENT_CRITICAL_WINDOW_MS"
INGRESS_COALESCE_WINDOW_ENV = "HOMEOS_HA_INGRESS_COALESCE_WINDOW_MS"
RUNTIME_STATE_BATCH_WINDOW_ENV = "HOMEOS_HA_RUNTIME_STATE_BATCH_WINDOW_MS"


def _parse_window_ms(value: Any) -> float | None:
    """把候选窗口解析成非负有限毫秒数；非法（含负数/NaN/Inf）返回 `None`。"""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):  # fmt: skip
        logger.debug("HA 窗口配置不是有效数字,按缺省处理: %r", value)
        return None
    if not math.isfinite(number) or number < 0:
        return None
    return number


def _env_window_ms(env_name: str) -> float | None:
    """读环境变量窗口；未设置或非法返回 `None`（交给下一级回退）。"""
    raw = os.getenv(env_name)
    if raw is None or not raw.strip():
        return None
    return _parse_window_ms(raw)


def resolve_env_window_ms(env_name: str, default_ms: float) -> float:
    """`env` → 默认值 的两级解析（模块级常量用：启动后不再变化）。"""
    parsed = _env_window_ms(env_name)
    return parsed if parsed is not None else default_ms


def live_event_batch_window_ms() -> float:
    """HA → L1/广播的批窗（毫秒）：`env` 优先，否则帧级默认。"""
    return resolve_env_window_ms(LIVE_EVENT_BATCH_WINDOW_ENV, DEFAULT_LIVE_EVENT_BATCH_WINDOW_MS)


def live_event_critical_window_ms() -> float:
    """关键控制域批窗（毫秒）：`env` 优先，否则关键域默认。"""
    return resolve_env_window_ms(LIVE_EVENT_CRITICAL_WINDOW_ENV, DEFAULT_LIVE_EVENT_CRITICAL_WINDOW_MS)


def resolve_live_event_batch_window_seconds(configured: Any = None) -> float:
    """按「env > 配置 > 默认」解析批窗秒数（`haConnector.liveEventBatchWindowMs`）。

    环境变量优先级最高：它代表部署侧的显式覆盖，运维改窗口不需要再动库里配置。
    """
    env_ms = _env_window_ms(LIVE_EVENT_BATCH_WINDOW_ENV)
    if env_ms is not None:
        return env_ms / 1000.0
    parsed = _parse_window_ms(configured)
    if parsed is not None:
        return parsed / 1000.0
    return DEFAULT_LIVE_EVENT_BATCH_WINDOW_MS / 1000.0


def resolve_ingress_coalesce_window_ms(configured: Any = None) -> float:
    """按「env > 配置 > 默认」解析入口微窗毫秒（`haConnector.ingressCoalesceWindowMs`）。"""
    env_ms = _env_window_ms(INGRESS_COALESCE_WINDOW_ENV)
    if env_ms is not None:
        return env_ms
    parsed = _parse_window_ms(configured)
    if parsed is not None:
        return parsed
    return DEFAULT_INGRESS_COALESCE_WINDOW_MS


def runtime_state_batch_window_ms() -> float:
    """`/ws/runtime` 出站合批窗（毫秒）：`env` 优先，否则帧级默认。"""
    return resolve_env_window_ms(RUNTIME_STATE_BATCH_WINDOW_ENV, DEFAULT_RUNTIME_STATE_BATCH_WINDOW_MS)


__all__ = [
    "DEFAULT_INGRESS_COALESCE_WINDOW_MS",
    "DEFAULT_LIVE_EVENT_BATCH_WINDOW_MS",
    "DEFAULT_LIVE_EVENT_CRITICAL_WINDOW_MS",
    "DEFAULT_RUNTIME_STATE_BATCH_WINDOW_MS",
    "INGRESS_COALESCE_WINDOW_ENV",
    "LIVE_EVENT_BATCH_WINDOW_ENV",
    "LIVE_EVENT_CRITICAL_WINDOW_ENV",
    "RUNTIME_STATE_BATCH_WINDOW_ENV",
    "live_event_batch_window_ms",
    "live_event_critical_window_ms",
    "resolve_env_window_ms",
    "resolve_ingress_coalesce_window_ms",
    "resolve_live_event_batch_window_seconds",
    "runtime_state_batch_window_ms",
]
