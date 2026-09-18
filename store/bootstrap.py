"""启动时幂等补齐的默认数据：商品目录、站点配置。

与 ``store.tools.seed`` 的区别：这里只处理「不影响运营决策」的基础设施——
商品目录是客户端授权校验的硬依赖（feature_codes 对不上就无法下单），站点配置
缺了后台和支付渠道全跑不起来。**管理员账号不在此**——部署者必须通过 /setup
页面显式创建，绝不能用硬编码默认口令。

幂等契约：每条数据都只在「库里完全不存在」时写入，不覆盖已有行的任何字段。
运营在后台改了价格/商品名之后重启服务，改动不会被踢回去。

并发契约（S29）：这份数据是**每条一句 ``INSERT ... SELECT ... WHERE NOT EXISTS``**
写进去的，判断与插入由数据库放在同一条语句里完成。原来的「先 ``select`` 数一遍、
再逐条 ``insert``」在两个进程同时启动时会各看到「库里没有」，然后各插一份 ——
于是商品目录出现两条 ``base``、两份默认配置，而这是**启动路径**，一旦发生就是
每次重启都再叠一份。注意这里刻意**不给 ``product_type`` 加唯一索引**：
``addon`` 按设计可以有任意多条，而 ``module`` 也不是「只能一条」——
唯一性只属于「首次启动要补齐的那几条默认数据」，把它做成全表约束会顺手改掉
后台建商品的自由。
"""

from __future__ import annotations

import logging

from sqlalchemy import exists, insert, literal, null, select
from sqlalchemy.orm import Session

from store.features import BASE_PRODUCT_FEATURES, MODULE_3D_FEATURES
from store.models import Product, StoreSetting
from store.serializers import list_json

logger = logging.getLogger("store.bootstrap")

# --------------------------------------------------------------------------- #
# 商品
# --------------------------------------------------------------------------- #
#: 功能码清单的唯一出处是 :mod:`store.features`（S58：这里过去另抄了一份，两份顺序
#: 还不一样）。播种时按目录给的顺序写进 ``feature_codes_json``。


def _value(expression):
    """把 Python 值写成 SQL 字面量（``None`` 要写成 NULL，不能用 ``literal``）。"""
    return null() if expression is None else literal(expression)


def _insert_product_if_absent(
    session: Session, product_type: str, fields: dict
) -> bool:
    """「库里没有这个 ``product_type`` 的商品时才插入」，压成一条语句。

    返回是否真的插入了（``rowcount`` 为 0 表示并发的另一个进程刚插过）。

    为什么必须是**一条**语句：写成「先 ``select`` 再 ``insert``」时，两个进程都会
    在自己的读里看到「没有」，然后各自插入；SQLite 只保证「写」串行，挡不住这种
    先读后写的交错。压成 ``INSERT ... SELECT ... WHERE NOT EXISTS`` 之后，
    判断与插入在数据库的同一次写事务里完成，第二个进程的 ``NOT EXISTS`` 必然看到
    第一个进程已提交的行。

    ``fields`` 里没列出的列（``id`` / ``created_at`` / ``updated_at`` 等）由
    SQLAlchemy 的列默认值补上 —— 它在编译期把 Python 侧默认值内联成 SELECT 里的
    绑定参数，所以主键仍是每条新行一个 UUID。
    """
    guard = ~exists(select(Product.id).where(Product.product_type == product_type))
    statement = insert(Product).from_select(
        [*fields, "product_type"],
        select(*[_value(value) for value in fields.values()], literal(product_type)).where(
            guard
        ),
    )
    return bool(session.execute(statement).rowcount)


def ensure_default_products(session: Session) -> None:
    """补齐三条默认商品（base / module / package）。已存在的跳过。"""
    inserted = []
    if _insert_product_if_absent(
        session,
        "base",
        {
            "name": "编辑器+绘制工具",
            "product_code": "homeos",
            "price_cents": 4990,
            "validity_days": None,
            "feature_codes_json": list_json(BASE_PRODUCT_FEATURES),
            "included_product_ids_json": list_json([]),
            "active": True,
            "display_description": "如需3D交互可后续再账号中心升级",
            "sort_order": 100,
            "fulfillment_mode": "automatic",
        },
    ):
        inserted.append("base")
    if _insert_product_if_absent(
        session,
        "module",
        {
            "name": "3D交互包",
            "product_code": "homeos",
            "price_cents": 3990,
            "validity_days": None,
            "feature_codes_json": list_json(MODULE_3D_FEATURES),
            "included_product_ids_json": list_json([]),
            "active": True,
            "sort_order": 100,
            "fulfillment_mode": "automatic",
            "requires_license": True,
        },
    ):
        inserted.append("module")

    # 套餐要指向「实际存在的那条 module」的 id。这里读回来而不是自己造一个：
    # 上面的插入可能是**别的进程**完成的（我们的语句一行没插），造出来的 id
    # 就会指向一个不存在的商品。读与上面的写同属一个事务、同一个快照，
    # 所以两种情形（自己插的 / 别人插的）都能拿到真实存在的那一行。
    module_id = session.scalar(
        select(Product.id).where(Product.product_type == "module").limit(1)
    )
    if _insert_product_if_absent(
        session,
        "package",
        {
            "name": "编辑器+绘制工具+3D交互",
            "product_code": "homeos",
            "price_cents": 7990,
            "validity_days": None,
            "feature_codes_json": list_json(BASE_PRODUCT_FEATURES + MODULE_3D_FEATURES),
            "included_product_ids_json": list_json([module_id] if module_id else []),
            "active": True,
            "sort_order": 100,
            "fulfillment_mode": "automatic",
        },
    ):
        inserted.append("package")

    if inserted:
        logger.info("已补齐默认商品：%s", "、".join(inserted))


def ensure_default_settings(session: Session) -> None:
    """补齐默认站点配置（id=1）。已存在的跳过。"""
    statement = insert(StoreSetting).from_select(
        ["id"],
        select(literal(1)).where(~exists(select(StoreSetting.id).where(StoreSetting.id == 1))),
    )
    if session.execute(statement).rowcount:
        logger.info("已补齐默认站点配置。")
