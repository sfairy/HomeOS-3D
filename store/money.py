"""积分与金额的分币运算：唯一的口径来源。

单位约定
--------
``centi`` = **0.01 积分**（厘），与订单侧的 ``*_cents``（0.01 元）同构。
内存里所有积分都是 ``int`` 厘，所以加减就是整数加减、比较就是整数比较 ——
不产生舍入，也就不存在「两边舍入方式不同」这类问题。

为什么必须收口到这一层
----------------------
邀请积分此前用 ``float`` 存库，而正确性建立在一个**不成立**的前提上：
「SQL 侧 ``round()`` 与 Python 侧 ``round()`` 结果一致」。实际上
SQLite 的 ``round()`` 是 half-away-from-zero（``round(0.125, 2) = 0.13``），
Python 内建 ``round()`` 是 half-even（``round(0.125, 2) = 0.12``）。一旦金额正好
落在 ``.xx5`` 上，两处给出不同的分币值，于是：

- ``create_withdrawal`` 里「用 round 后的值比对冻结额是否被并发改过」的条件 UPDATE
  会把**没有并发**的情况误判成冲突，用户看到凭空的「请重试」；
- 余额与流水之和会相差 1 厘，对账时无法解释。

改为整数厘之后，``_apply_wallet_delta`` 不再需要 ``round``（整数加法天然精确），
条件 UPDATE 变成整数相等比较 —— 两个缺陷同时消失。

只有两处仍需本模块：把外部输入（用户填的 ``"10.05"``、比例 ``5.0%``）**解析**成
整数，以及把整数**渲染**回两位小数字符串。这两件事都必须用同一个舍入规则。
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_FLOOR, ROUND_HALF_UP

#: 1 积分 = 100 厘。
CENTI_PER_POINT = 100

#: 百分比 → 基点（basis point）的倍数：5.0% = 500 bps。
BPS_PER_PERCENT = 100


def _decimal(value: object) -> Decimal:
    """把外部输入规范化成 ``Decimal``。

    ``float`` 一律先过 ``str()``：``Decimal(0.145)`` 会展开成
    ``0.14499999999999999...``（二进制浮点的真实值），再舍入会得到 0.14，
    而人写 ``0.145`` 想表达的是 0.15。``Decimal(str(0.145))`` 才是「人写的那个数」。
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

    用于用户输入、比例换算等「需要保留最近一厘」的场景。

    注意入参的语义是**人写的那个数**，而不是它的二进制浮点近似：``0.145`` 会被当成
    精确的 ``0.145`` 进到 ``0.15``，而 SQLite 的 ``round(0.145, 2)`` 因为先把字面量
    读成 ``0.1449999...`` 会给出 ``0.14``。回填**不会**因此改变任何存量金额：
    存量列里的值都是 ``round(..., 2)`` 的结果，这种浮点的 ``str()`` 恰好就是它显示的
    两位小数（``4.99`` → ``'4.99'``），所以逐行还原得到的就是原来显示的那个数 ——
    迁移脚本正是拿「回填后渲染值 == 回填前显示值」做逐行对账的。
    """
    scaled = _decimal(value).scaleb(2)  # 积分 → 厘
    return int(scaled.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def floor_centi(value: object) -> int:
    """解析成整数厘，**向下取整**（不足一厘的部分直接舍去）。

    奖励计算的口径是「不足 0.01 的部分直接舍去」（与参考站说明一致），
    因此那一条路径必须用这个，而不是 :func:`to_centi`：两者在正数上只差
    「是否进位」，但「舍去」是产品规则，不能悄悄换成四舍五入。
    """
    scaled = _decimal(value).scaleb(2)
    return int(scaled.quantize(Decimal(1), rounding=ROUND_FLOOR))


def from_centi(centi: int) -> Decimal:
    """整数厘 → ``Decimal`` 积分（如 ``1005`` → ``Decimal("10.05")``）。"""
    if isinstance(centi, bool) or not isinstance(centi, int):
        raise ValueError(f"厘必须是 int（不再接受 float），收到 {type(centi).__name__}")
    return Decimal(centi) / Decimal(CENTI_PER_POINT)


def format_centi(centi: int) -> str:
    """把**已经是厘**的整数渲染成两位小数字符串（``1005`` → ``"10.05"``）。

    入参就是库里的整数厘，**不要**再传积分：早先这里误写成先过 ``to_centi``
    （那是「积分 → 厘」的换算），结果 ``1005`` 被当成 1005 积分渲染成 ``"1005.00"``,
    —— 少写一个数量级，而且只有靠断言才抓得出来。

    对外契约刻意保持「两位小数字符串」不变：厘是 1/100，两位小数**无损**，
    既不用改前端，也不会把精度问题推给调用方。
    """
    return f"{from_centi(centi):.2f}"


def percent_to_bps(percent: object) -> int:
    """百分比 → 基点（``5.0`` → ``500``），四舍五入到整数基点。"""
    return to_centi(percent)  # 百分比 × 100 与「积分 → 厘」是同一个 ×100


def apply_rate_floor_cents(amount_cents: int, rate_percent: object) -> int:
    """按比例算奖励，返回**厘**；不足一厘舍去。

    ``amount_cents`` 是订单实付的**元分**。推导：奖励积分 = 实付元 × 比例%，
    换成厘即 ``(amount_cents / 100) × (bps / 100) × 100 = amount_cents × bps / 10000``。
    全程整数乘除，避免 ``float(amount_cents) / 100.0`` 那一步引入的二进制误差。
    """
    base = int(amount_cents)
    if base <= 0:
        return 0
    bps = percent_to_bps(rate_percent)
    if bps <= 0:
        return 0
    return base * bps // (CENTI_PER_POINT * CENTI_PER_POINT)


def withdraw_fee_centi(gross_centi: int, fee_percent: object) -> tuple[int, int]:
    """返回 ``(手续费厘, 实际到账厘)``；手续费不足一厘舍去。

    与旧实现的差异只在**计算方式**：旧代码先 ``int(round(points * 100))`` 把积分
    转成分，再用 ``fee_cents * bps // 10000``；新代码全程用厘，少一次「积分 ↔ 分」
    的来回，也就少一次舍入机会。取整方向与产品规则一致（舍去）。
    """
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

    旧写法是 ``int(math.floor(price * float(percent) / 100.0))``：``price`` 一大
    （比如两位数的万元分），``price * percent`` 就可能落到无法精确表示的浮点上，
    恰好差一个 ULP 时 ``floor`` 会少算一分。整数基点运算没有这个问题。
    """
    base = int(price_cents)
    if base <= 0:
        return 0
    bps = percent_to_bps(percent)
    if bps <= 0:
        return 0
    return base * bps // (BPS_PER_PERCENT * BPS_PER_PERCENT)
