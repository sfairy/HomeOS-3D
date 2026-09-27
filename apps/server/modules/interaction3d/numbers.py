"""把外部上报 / 传入的值解析成有限浮点数。
"""
from __future__ import annotations

import math


def as_finite_number(value, *, from_text: bool = True) -> float | None:
    """把 value 解析成有限浮点数；解析不出（或不是有限值）时返回 None。
    """
    if isinstance(value, bool):
        return None
    if from_text:
        if not isinstance(value, (str, int, float)):
            return None
    elif not isinstance(value, (int, float)):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return parsed if math.isfinite(parsed) else None
