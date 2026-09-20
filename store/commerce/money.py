"""积分与金额的分币运算：唯一的口径来源。

``centi`` = **0.01 积分**（厘），与订单侧的 ``*_cents``（0.01 元）同构。内存里所有
积分都是 ``int`` 厘，加减与比较都是整数运算，不产生舍入。

不能用 ``float`` 存积分：SQLite 的 ``round()`` 是 half-away、Python 是 half-even，
金额落在 ``.xx5`` 上时两处给出不同分币值，提现的并发比对会误报冲突、余额与流水之和
也会差 1 厘。本模块只负责两件事：把外部输入（用户填的 ``"10.05"``、比例 ``5.0%``）
**解析**成整数，以及把整数**渲染**回两位小数字符串 —— 两者必须用同一个舍入规则。
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

#: 1 积分 = 100 厘。
CENTI_PER_POINT = 100

#: 百分比 → 基点（basis point）的倍数：5.0% = 500 bps。
BPS_PER_PERCENT = 100


def _decimal(value: object) -> Decimal:
    """把外部输入规范化成 ``Decimal``。

    ``float`` 一律先过 ``str()``：``Decimal(0.145)`` 展开成 ``0.144999999999...``，
    再舍入会得到 0.14，而人写 ``0.145`` 想表达的是 0.15。
    """
    if value is None:
        return Decimal(0)
    if isinstance(value, Decimal):
        candidate = value
    elif isinstance(value, bool):
        # bool 是 int 的子类，但 ``True`` 当金额用一定是调用方的 bug
        raise ValueError("金额不接受布尔值")
    elif isinstance(value, int):
        candidate = Decimal(value)
    elif isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):
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

    入参语义是**人写的那个数**：``0.145`` 会被当成精确的 ``0.145`` 进到 ``0.15``。
    用于用户输入、比例换算这类需要保留最近一厘的场景。
    """
    scaled = _decimal(value).scaleb(2)  # 积分 → 厘
    return int(scaled.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def from_centi(centi: int) -> Decimal:
    """整数厘 → ``Decimal`` 积分（如 ``1005`` → ``Decimal("10.05")``）。"""
    if isinstance(centi, bool) or not isinstance(centi, int):
        raise ValueError(f"厘必须是 int（不再接受 float），收到 {type(centi).__name__}")
    return Decimal(centi) / Decimal(CENTI_PER_POINT)


def format_centi(centi: int) -> str:
    """把**已经是厘**的整数渲染成两位小数字符串（``1005`` → ``"10.05"``）。

    入参就是库里的整数厘，**不要**再传积分。对外契约保持「两位小数字符串」不变：
    厘是 1/100，两位小数**无损**，既不用改前端，也不会把精度问题推给调用方。
    """
    return f"{from_centi(centi):.2f}"


def percent_to_bps(percent: object) -> int:
    """百分比 → 基点（``5.0`` → ``500``），四舍五入到整数基点。"""
    return to_centi(percent)  # 百分比 × 100 与「积分 → 厘」是同一个 ×100


def apply_rate_floor_cents(amount_cents: int, rate_percent: object) -> int:
    """按比例算奖励，返回**厘**；不足一厘舍去。

    ``amount_cents`` 是订单实付的**元分**。推导：``amount_cents × bps / 10000``，
    全程整数乘除。舍去是产品规则（与参考站说明一致），换成四舍五入会静默多给一点。
    """
    base = int(amount_cents)
    if base <= 0:
        return 0
    bps = percent_to_bps(rate_percent)
    if bps <= 0:
        return 0
    return base * bps // (CENTI_PER_POINT * CENTI_PER_POINT)


def withdraw_fee_centi(gross_centi: int, fee_percent: object) -> tuple[int, int]:
    """返回 ``(手续费厘, 实际到账厘)``；手续费不足一厘舍去（与产品规则一致）。"""
    gross = int(gross_centi)
    if gross <= 0:
        return 0, gross
    bps = percent_to_bps(fee_percent)
    if bps <= 0:
        return 0, gross
    if bps >= 100 * BPS_PER_PERCENT:
        # 100% 以上手续费属于配置错误：全部扣掉而不是给出负的到账额
        return gross, 0
    fee = gross * bps // (BPS_PER_PERCENT * BPS_PER_PERCENT)
    return fee, gross - fee


def discount_centi(price_cents: int, percent: object) -> int:
    """按百分比算折扣金额（**元分**），不足一分舍去。

    整数基点运算避免浮点误差：``price * percent`` 在两位数的万元分上可能落到无法精确
    表示的浮点，恰好差一个 ULP 时 ``floor`` 会少算一分。
    """
    base = int(price_cents)
    if base <= 0:
        return 0
    bps = percent_to_bps(percent)
    if bps <= 0:
        return 0
    return base * bps // (BPS_PER_PERCENT * BPS_PER_PERCENT)
