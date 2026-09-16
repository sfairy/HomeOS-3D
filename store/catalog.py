"""商品目录口径：类型与履约方式的合法取值（服务端唯一来源）。

后台的商品表单是几个 ``<select>``，但**表单是前端拼的、接口是公开的**：
POST / PATCH 的请求体可以带任意字符串。这两个字段过去完全没有校验，于是：

* ``fulfillment_mode`` 写错一个字母（``Manual`` / ``auto`` / 留空）不会报错，
  而履约代码只认 ``== "manual"``：想手工发卡的商品会被静默当成自动发卡 ——
  用户一付款就自动出码，运营完全没机会核对；
* ``product_type`` 写错会让下单流程走错分支。``module`` / ``template`` 被判成
  增量包（必须选一张目标主授权才能买），``package`` 走套餐分支，**其余一律按
  基础授权处理**（``store/api/store.py`` 的 ``_checkout``）。一个拼错的类型
  会让「只能追加到已有授权的增量包」变成可以直接买走的基础授权。

取值清单必须与 ``store/templates/admin.html`` 里两个 ``<select>`` 的选项一致
（smoke 里有断言盯着），新增取值要两边同时改。
"""

from __future__ import annotations

#: 商品类型 → 中文名。列表页展示用的映射前端也有一份（``admin.html`` 的
#: ``PRODUCT_TYPE``），这里这份是**校验**用的唯一来源。
#:
#: ``template`` / ``bundle`` 不在后台下拉里，但历史上确实存过这两个值
#: （``store.py`` 把 template 算作增量包，前端标签表里也留着 bundle 的文案），
#: 所以它们必须合法 —— 否则一条老数据的备注都改不了。
PRODUCT_TYPE_LABELS: dict[str, str] = {
    "base": "基础授权",
    "module": "增量包",
    "template": "模板",
    "package": "套餐",
    "bundle": "全授权",
}

PRODUCT_TYPES: frozenset[str] = frozenset(PRODUCT_TYPE_LABELS)

#: 履约方式 → 中文名。
#:
#: ``automatic`` 付款即发码；``manual`` 只把订单标记成已付款，等运营在后台
#: 核对后手工发码（``settle_paid_order`` 与 ``create_license_for_order`` 都只
#: 认这一个字面量）。
FULFILLMENT_MODE_LABELS: dict[str, str] = {
    "automatic": "自动发码",
    "manual": "人工发码",
}

FULFILLMENT_MODES: frozenset[str] = frozenset(FULFILLMENT_MODE_LABELS)


def validate_product_type(value: str) -> str:
    """归一化并校验商品类型，非法取值返回可读的中文清单。"""
    normalized = str(value or "").strip()
    if normalized not in PRODUCT_TYPES:
        options = "、".join(PRODUCT_TYPE_LABELS)
        raise ValueError(
            f"商品类型「{value}」不是受支持的取值（可选：{options}）。"
        )
    return normalized


def validate_fulfillment_mode(value: str) -> str:
    """归一化并校验履约方式。

    这里必须**拒绝**而不是兜底成 ``automatic``：猜错的代价是「本该人工核对的
    订单被自动发码」，一个不可撤销的发放动作；让接口报错的代价只是运营改一下
    配置。
    """
    normalized = str(value or "").strip()
    if normalized not in FULFILLMENT_MODES:
        options = "、".join(FULFILLMENT_MODE_LABELS)
        raise ValueError(
            f"履约方式「{value}」不是受支持的取值（可选：{options}）。"
        )
    return normalized
