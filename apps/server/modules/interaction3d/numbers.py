"""把外部上报 / 传入的值解析成有限浮点数。

这个判断在 3D 控件模组里原本手写了四份（窗帘两处、空调一处、配置校验一处），
口径已经不一致：HA 的**属性**常把数值上报成数字字符串，而**服务调用参数**是前端发来的
JSON 值，字符串应当直接拒绝。统一到这里，由 ``from_text`` 明确区分这两种契约，
避免以后再各写一份、各漂移一点。
"""
from __future__ import annotations

import math


def as_finite_number(value, *, from_text: bool = True) -> float | None:
    """把 value 解析成有限浮点数；解析不出（或不是有限值）时返回 None。

    参数:
        from_text: 是否接受数字字符串（``"12.5"``）。读 HA 属性时为 True —— 集成常把
            数值上报成字符串；校验服务调用参数时为 False —— 前端传来字符串说明调用方
            用错了类型，不能悄悄替它转换。

    约定:
        - bool 是 int 的子类，必须单独排除，否则 ``True`` 会被当成 1 参与比较；
        - NaN / inf 一律归为 None（拿它做比较会得出无意义的结论）;
        - 字符串解析失败、超大整数转 float 溢出，都按「没有这个值」处理，不向上抛。
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
