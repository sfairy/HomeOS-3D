#!/usr/bin/env python3
"""本地开发：给商店里**已注册的账号**人工签发一条授权。

为什么需要它：本地把授权门禁开起来（``LICENSE_REQUIRED=1``）才能测「注册 → 登录 →
激活」。但开发库里的商店通常是空的（``licenses=0``），后台又要求先登录管理员会话才
能签发，脚本化测试没有会话。本脚本等价于后台的 ``POST /store-admin/v1/licenses``，
只是免去 HTTP + 管理员会话，直接走商店自己的代码路径（``fulfill.insert_license_with_unique_code``），
因此激活码唯一性、``code_hint``、``access_expires_at`` 的口径与后台完全一致。

用法（必须指定 ``STORE_DATA_DIR`` 指向运行中商店的数据目录，否则会写到另一个库）：

    STORE_DATA_DIR=homeos-store/data \
      .venv-store/bin/python homeos-store/scripts/issue_dev_license.py --email me@example.com

可选参数：
    --product-id ID     指定商品；缺省选第一个 active 的 ``edition_full``，其次任意 active
    --validity-days N   有效期天数；缺省沿用商品配置（通常为「永久」）
    --list-products     只列出商品，不签发

输出：单行 JSON（``activationCode`` / ``activationCodeId`` / ``email`` / ``productName``）。
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import timedelta
from pathlib import Path

STORE_BACKEND = Path(__file__).resolve().parents[1] / "backend"
if str(STORE_BACKEND) not in sys.path:
    sys.path.insert(0, str(STORE_BACKEND))

from sqlalchemy import func, select
from src.commerce import fulfill
from src.config import load_settings
from src.core.database import Database
from src.core.models import Account, Customer, License, Product
from src.security.security import activation_code_hint, utcnow


def _pick_product(session, product_id: str | None) -> Product:
    """选商品：显式 ID > 第一个 active 的 edition_full > 第一个 active 的商品。"""
    if product_id:
        product = session.get(Product, product_id)
        if product is None:
            raise SystemExit(f"找不到商品 {product_id}")
        return product
    for product_type in ("edition_full", None):
        query = select(Product).where(Product.active.is_(True))
        if product_type:
            query = query.where(Product.product_type == product_type)
        product = session.scalars(query.order_by(Product.created_at)).first()
        if product is not None:
            return product
    raise SystemExit("商店里没有任何 active 商品，先在后台建一个再签发。")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="本地开发：人工签发一条商店授权")
    parser.add_argument("--email", help="已注册的商店账号邮箱")
    parser.add_argument("--product-id", default=None)
    parser.add_argument("--validity-days", type=int, default=None)
    parser.add_argument("--list-products", action="store_true")
    options = parser.parse_args(argv)

    settings = load_settings()
    database = Database(settings)

    try:
        with database.session() as session:
            if options.list_products:
                rows = session.scalars(select(Product).order_by(Product.created_at)).all()
                for product in rows:
                    print(
                        f"{product.id}  {product.name}  type={product.product_type} "
                        f"active={product.active} validity_days={product.validity_days}"
                    )
                return 0

            if not options.email:
                raise SystemExit("缺少 --email（商店里必须先注册该邮箱的账号）")

            email = options.email.strip().lower()
            product = _pick_product(session, options.product_id)

            account = session.scalars(
                select(Account).where(func.lower(Account.email) == email)
            ).first()
            if account is None:
                raise SystemExit(f"该邮箱尚未在商店注册账号：{email}")

            customer = session.scalars(
                select(Customer).where(Customer.account_id == account.id)
            ).first()
            if customer is None:
                customer = Customer(account_id=account.id, email=email, name=email)
                session.add(customer)
                session.flush()

            moment = utcnow()
            validity_days = (
                options.validity_days if options.validity_days is not None else product.validity_days
            )

            def build(code: str) -> License:
                return License(
                    activation_code=code,
                    code_hint=activation_code_hint(code),
                    customer_id=customer.id,
                    account_id=account.id,
                    product_id=product.id,
                    product_name=product.name,
                    product_type=product.product_type,
                    price_cents=product.price_cents,
                    validity_days=validity_days,
                    issuance_source="manual",
                    active=True,
                    issued_at=moment,
                    access_started_at=moment,
                    access_expires_at=(
                        moment + timedelta(days=int(validity_days)) if validity_days else None
                    ),
                )

            license_row = fulfill.insert_license_with_unique_code(session, build)

            print(
                json.dumps(
                    {
                        "activationCode": license_row.activation_code,
                        "activationCodeId": license_row.id,
                        "email": email,
                        "productName": license_row.product_name,
                        "validityDays": validity_days,
                        "accessExpiresAt": (
                            license_row.access_expires_at.isoformat()
                            if license_row.access_expires_at
                            else None
                        ),
                    },
                    ensure_ascii=False,
                )
            )
            return 0
    finally:
        database.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
