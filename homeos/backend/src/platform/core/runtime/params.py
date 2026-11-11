"""参数归一的小工具（跨域复用，纯函数）。

为什么单独成模块：``home_mode`` 与 ``notification`` 各自写过一份「非负秒数」解析，
语义相同但实现细节不同（一个用 ``float()`` + ``math.isfinite``，一个用 ``_finite_number``）。
两份同名函数最容易出现的漂移是「一处接受 ``"30"``，另一处返回 0」—— 表现为
「同一个配置在触发器上生效、在告警上不生效」。

这里只放**没有领域含义**的数值归一；带默认值的领域逻辑（如冷却分钟数回落到 60）
仍留在各自的域内。
"""

from __future__ import annotations

import logging
import math
from typing import Any

logger = logging.getLogger("homeos.params")


def non_negative_seconds(raw: Any) -> float:
    """把任意输入归一成「非负秒数」；非法值 / 非有限值 / 负数一律返回 ``0.0``。

    返回 ``0.0`` 的语义是「不启用」：调用方把 ``0`` 当旧行为（立即触发 / 立即解除），
    因此这里不需要区分「没填」与「填错」—— 两者都不该启用。
    """
    if isinstance(raw, bool):
        # bool 是 int 的子类：``True`` 会被解析成 1 秒，几乎必然是配置错误。
        return 0.0
    try:
        value = float(raw)
    except (TypeError, ValueError):  # fmt: skip
        logger.debug("秒数参数无法解析，按 0（不启用）处理: %r", raw)
        return 0.0
    if not math.isfinite(value):
        return 0.0
    return max(0.0, value)


__all__ = ["non_negative_seconds"]
