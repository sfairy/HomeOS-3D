"""订单状态枚举与中文口径（服务端唯一来源）。

前端（``admin.html`` / ``store.js``）各有一份展示用的映射，但**服务端**必须只有
一份：后台接口返回的中文文案与列表页自己渲染的文案一旦不一致，就会出现
「弹窗说已取消、列表说已过期」这种同一状态两套说法。

状态机
------
::

    pending ──支付成功──> paid ──履约──> fulfilled
       │                   │              │
       │超时/取消           │部分退款       │部分退款
       ▼                   ▼              ▼
    expired/cancelled   partially_refunded
       │                   │              │
       │支付渠道拒单         │退完          │退完
       ▼                   ▼              ▼
    payment_failed       refunded <──── refunded

``partially_refunded`` 是「退过钱但没退完」：授权与邀请奖励都保留，只记录
资金流出；累积退款金额达到订单金额时才转入 ``refunded`` 并回收授权。

    pending/paid ──履约抛异常──> fulfillment_failed（等人工重试或退款）

``payment_failed`` 与 ``expired`` / ``cancelled`` 一样属于「预留已归还」的终态：
进入这些状态时库存预留与优惠码名额都已经还回去了，所以**不能再入账并履约**，
否则扣的是别人待支付订单的预留（见 ``fulfill.RESERVING_STATUSES``）。

``fulfillment_failed`` 相反：履约中途失败时它的写入会被回滚，预留与名额**仍然
挂着**，所以它同时出现在 ``RESERVING_STATUSES`` 与 ``FULFILLABLE_STATUSES`` 里，
允许人工重试或退款。这个状态过去只存在于文案映射里（而且被错译成「处理中」），
没有任何代码会产生或消费它。
"""

from __future__ import annotations

#: 会占用库存预留与优惠码名额的状态。与 ``fulfill.RESERVING_STATUSES`` 必须一致，
#: 两边都在这里取值，避免「一个模块放行、另一个模块已释放」的错配。
#:
#: ``fulfillment_failed`` 也在其中：发货抛异常时履约写入会被回滚（见
#: ``admin_fulfill`` 的 SAVEPOINT），订单仍然占着那一件预留和那个优惠码名额，
#: 等人工重试或退款。
RESERVING_STATUSES: tuple[str, ...] = ("pending", "paid", "fulfillment_failed")

#: 允许被「入账 / 标记支付 / 履约」的状态。终态订单一律拒绝——
#: cancelled / expired 的库存与优惠码名额早已释放，refunded 的授权也已收回，
#: 对它们履约等于凭空发一张可用授权，还会重复扣减预留并造成超卖。
#: 钱确实到账的「复活」场景由支付宝结算路径处理（``settle_paid_order``），
#: 不走后台接口。
#:
#: ``partially_refunded`` 同样不在列：部分退款后授权仍然有效、库存也已随发码
#: 扣减过，再「履约」一次会重复发码。
FULFILLABLE_STATUSES: tuple[str, ...] = ("pending", "paid", "fulfillment_failed")

#: 允许发起退款的状态。
#:
#: ``partially_refunded`` 必须在列：还有余额没退，必须能退第二次。
#: 而 ``pending`` / ``expired`` / ``cancelled`` / ``payment_failed`` 一律不可退 ——
#: 那些状态压根没有资金入账（或已原路退回），退出去就是凭空送钱。
REFUNDABLE_STATUSES: tuple[str, ...] = (
    "paid",
    "fulfilled",
    "fulfillment_failed",
    "partially_refunded",
)

#: 状态 → 中文。所有下拉、筛选、弹窗都用它，避免各处自己拼字符串。
ORDER_STATUS_LABELS: dict[str, str] = {
    "pending": "待付款",
    "paid": "已付款",
    "fulfilled": "已完成",
    "cancelled": "已取消",
    "expired": "已过期",
    "payment_failed": "支付失败",
    "fulfillment_failed": "发货失败",
    #: 退过钱但没退完。与 ``refunded`` 分开的原因是两者的授权处置不同：
    #: 部分退款保留授权与邀请奖励，全额退款才会收回。
    "partially_refunded": "部分退款",
    "refunded": "已退款",
}

#: 可在后台筛选器里选择的状态（保持与状态机的展示顺序一致）。
ORDER_STATUS_CHOICES: tuple[str, ...] = tuple(ORDER_STATUS_LABELS)

#: 需要人工介入的状态 —— 「必须有人看一眼」的唯一定义。
#:
#: 后台概览的「待办」区按它逐项计数（``fulfillment_failed`` = 自动发货炸了、
#: ``payment_failed`` = 付款没成功但要核对渠道账单），``smoke.py`` 会断言每一项
#: 都在概览响应里露了面 —— 否则新增一个状态就只改了这里，界面照旧岁月静好。
ORDER_ATTENTION_STATUSES: tuple[str, ...] = ("payment_failed", "fulfillment_failed")


def order_status_label(status: str | None) -> str:
    """把状态码翻成中文；未知状态原样返回，方便发现新值没登记。"""
    text = (status or "").strip()
    if not text:
        return ""
    return ORDER_STATUS_LABELS.get(text, text)


def refundable_cents(amount_cents: int | None, refunded_cents: int | None) -> int:
    """还能退多少钱（分）。必须夹到 0，绝不返回负数。

    退款金额是**累计**值（``Order.refund_amount_cents`` 会随每次部分退款叠加），
    所以可退余额是「订单金额 − 累计已退」。两个来源都可能是 None（老数据没有这
    两列），None 一律当 0 处理。

    历史数据里存在「累计已退 > 订单金额」的脏值（老版本用单次退款金额覆盖写，
    或者订单被人工改过金额），减法会得出负数。负数一旦流到接口上，后台就会显示
    「可退 -30 元」，而按这个数去发起退款又会把负数传进渠道。这里夹到 0，
    让脏数据表现为「已无可退」，而不是一个会引发二次故障的负数。
    """
    return max(0, int(amount_cents or 0) - int(refunded_cents or 0))

