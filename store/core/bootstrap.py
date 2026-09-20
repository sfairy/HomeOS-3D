"""启动时幂等补齐的默认数据：商品目录、站点配置。

只处理「不影响运营决策」的基础设施：商品目录是客户端授权校验的硬依赖（feature_codes
对不上就无法下单），站点配置缺了后台和支付渠道全跑不起来。**管理员账号不在此**——部署者
必须通过 /setup 页面显式创建，绝不能用硬编码默认口令。

幂等契约：每条数据只在「库里完全不存在」时写入，不覆盖已有行的任何字段。并发契约：每条
各用一句 ``INSERT ... SELECT ... WHERE NOT EXISTS``，判断与插入由数据库在同一条语句里
完成（「先 select 再 insert」在两个进程同时启动时会各插一份，而这是**启动路径**）。刻意
**不给 ``product_type`` 加唯一索引**：``addon``/``module`` 按设计可有多条。
"""

from __future__ import annotations

import logging

from sqlalchemy import exists, insert, literal, null, select
from sqlalchemy.orm import Session

from store.ops.features import BASE_PRODUCT_FEATURES, MODULE_3D_FEATURES
from store.core.models import Product, StoreSetting
from store.core.serializers import list_json

logger = logging.getLogger("store.core.bootstrap")

# 商品
#: 功能码清单的唯一出处是 :mod:`store.ops.features`（这里另抄一份，两份顺序会不一致）。


def _value(expression):
    """把 Python 值写成 SQL 字面量（``None`` 要写成 NULL，不能用 ``literal``）。"""
    return null() if expression is None else literal(expression)


def _insert_product_if_absent(
    session: Session, product_type: str, fields: dict
) -> bool:
    """「库里没有这个 ``product_type`` 的商品时才插入」，压成一条语句。

    返回是否真的插入了（``rowcount`` 为 0 表示并发的另一个进程刚插过）。必须**一条**
    语句：先读后写在 SQLite 上挡不住两个进程交错（只保证写串行）；压成
    ``INSERT ... SELECT ... WHERE NOT EXISTS`` 后判断与插入同属一次写事务。
    ``fields`` 未列出的列由 SQLAlchemy 的列默认值在编译期内联成绑定参数。
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

    # 套餐要指向「实际存在的那条 module」的 id。上面的插入可能是**别的进程**完成的
    # （我们的语句一行没插），造出来的 id 会指向不存在的商品；读回真实的那一行才安全。
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
