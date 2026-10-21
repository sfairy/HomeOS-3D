"""电量百分比归一化：0–100、保留两位小数。

`linkage.clamp_percent` 与 `normalize.normalize_level` 原本是两份逐句相同的函数（连
`isinstance(bool)` 剔除、NaN/Inf 拒绝、`round(x*100)/100` 的顺序都一致），只是命名与
docstring 不同。这里保留唯一实现，两个模块各自薄包装以维持公开名称与调用点不变。
"""

from __future__ import annotations

import math
from typing import Any


def normalize_percent(value: Any) -> float | None:
    """None/布尔/非数/NaN/Inf 返回 None，其余钳到 0–100 并保留两位小数。"""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return max(0.0, min(100.0, round(number * 100) / 100))
