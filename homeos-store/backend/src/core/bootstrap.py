"""启动时幂等补齐的默认数据：商品目录、站点配置。
"""

from __future__ import annotations

import logging

from sqlalchemy import exists, insert, literal, null, select
from sqlalchemy.orm import Session

from ..ops.features import BASE_PRODUCT_FEATURES, MODULE_3D_FEATURES
from ..core.models import Product, StoreSetting
from ..core.serializers import list_json

logger = logging.getLogger("src.core.bootstrap")

# 商品


def _value(expression):
    return null() if expression is None else literal(expression)


def _insert_product_if_absent(
    session: Session, product_type: str, fields: dict
) -> bool:
    """「库里没有这个 ``product_type`` 的商品时才插入」，压成一条语句。
    """
    guard = ~exists(select(Product.id).where(Product.product_type == product_type))
    statement = insert(Product).from_select(
        [*fields, "product_type"],
        select(*[_value(value) for value in fields.values()], literal(product_type)).where(
            guard
        ),
    )
    return bool(session.execute(statement).rowcount)  # type: ignore[reportAttributeAccessIssue]  # SQLAlchemy CursorResult.rowcount 动态属性


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
    if session.execute(statement).rowcount:  # type: ignore[reportAttributeAccessIssue]  # SQLAlchemy CursorResult.rowcount 动态属性
        logger.info("已补齐默认站点配置。")
