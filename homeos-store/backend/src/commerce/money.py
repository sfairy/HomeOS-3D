"""积分与金额的分币运算：唯一的口径来源。
"""

from __future__ import annotations

import math
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

CENTI_PER_POINT = 100

BPS_PER_PERCENT = 100


def _decimal(value: object) -> Decimal:
    """把外部输入规范化成 ``Decimal``。
    """
    if value is None:
        return Decimal(0)
    if isinstance(value, Decimal):
        candidate = value
    elif isinstance(value, bool):
        raise ValueError("金额不接受布尔值")
    elif isinstance(value, int):
        candidate = Decimal(value)
    elif isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            raise ValueError(f"金额不是有限数：{value!r}")
        candidate = Decimal(str(value))
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            return Decimal(0)
        try:
            candidate = Decimal(text)
        except InvalidOperation as error:
            raise ValueError(f"无法解析金额：{value!r}") from error
        if not candidate.is_finite():
            raise ValueError(f"金额不是有限数：{value!r}")
    else:
        raise ValueError(f"不支持的金额类型：{type(value).__name__}")

    if not candidate.is_finite():
        raise ValueError(f"金额不是有限数：{value!r}")
    return candidate


def to_centi(value: object) -> int:
    """解析成整数厘，**四舍五入**（half-up，与 SQLite ``round()`` 同向）。
    """
    scaled = _decimal(value).scaleb(2)
    return int(scaled.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def from_centi(centi: int) -> Decimal:
    if isinstance(centi, bool) or not isinstance(centi, int):
        raise ValueError(f"厘必须是 int（不再接受 float），收到 {type(centi).__name__}")
    return Decimal(centi) / Decimal(CENTI_PER_POINT)


def format_centi(centi: int) -> str:
    """把**已经是厘**的整数渲染成两位小数字符串（``1005`` → ``"10.05"``）。
    """
    return f"{from_centi(centi):.2f}"


def percent_to_bps(percent: object) -> int:
    """百分比 → 基点（``5.0`` → ``500``），四舍五入到整数基点。"""
    return to_centi(percent)


def _scaled_floor(base: int, percent: object, divisor: int) -> int:
    """``floor(base * 基点 / divisor)``；非正基数、非正比例都返回 0。

    两份积分类实现（奖励与折扣）只有除数常量不同，算术与短路顺序完全一致：
    先取整基数、再转基点、再整除，不足一个最小单位的部分一律舍去。
    """
    amount = int(base)
    if amount <= 0:
        return 0
    bps = percent_to_bps(percent)
    if bps <= 0:
        return 0
    return amount * bps // divisor


def apply_rate_floor_cents(amount_cents: int, rate_percent: object) -> int:
    """按比例算奖励，返回**厘**；不足一厘舍去。
    """
    return _scaled_floor(amount_cents, rate_percent, CENTI_PER_POINT * CENTI_PER_POINT)


def withdraw_fee_centi(gross_centi: int, fee_percent: object) -> tuple[int, int]:
    """返回 ``(手续费厘, 实际到账厘)``；手续费不足一厘舍去（与产品规则一致）。"""
    gross = int(gross_centi)
    if gross <= 0:
        return 0, gross
    bps = percent_to_bps(fee_percent)
    if bps <= 0:
        return 0, gross
    if bps >= 100 * BPS_PER_PERCENT:
        return gross, 0
    fee = gross * bps // (BPS_PER_PERCENT * BPS_PER_PERCENT)
    return fee, gross - fee


def discount_centi(price_cents: int, percent: object) -> int:
    """按百分比算折扣金额（**元分**），不足一分舍去。
    """
    return _scaled_floor(price_cents, percent, BPS_PER_PERCENT * BPS_PER_PERCENT)
