"""临时探针：库存口径与退款/取消的预留释放（跑完即删）。"""

from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path

import httpx
from sqlalchemy import select

from store.app import create_app
from store.config import load_settings
from store.models import Account, Customer, Product, utcnow
from store.security import hash_password
from store.tools.seed import seed_products, seed_release, seed_settings

RESULTS: list[tuple[str, bool, str]] = []


def check(name: str, cond: bool, detail: str = "") -> bool:
    RESULTS.append((name, bool(cond), detail))
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""), flush=True)
    return bool(cond)


async def main() -> int:
    workdir = Path(tempfile.mkdtemp(prefix="hb-biz-probe-"))
    settings = load_settings(
        data_dir=workdir / "data",
        license_keys_dir=workdir / "keys",
        mail_mode="echo",
        expose_verification_code=True,
        payment_provider="mock",
        order_ttl_seconds=600,
    )
    app = create_app(settings)
    database = app.state.database

    admin_email, user_email = "a@biz.local", "u@biz.local"
    password = "probe-password-2026"
    with database.session() as session:
        seed_settings(session)
        seed_release(session)
        seed_products(session)
        admin = Account(
            email=admin_email, password_hash=hash_password(password),
            email_verified_at=utcnow(), is_admin=True, is_active=True,
        )
        user = Account(
            email=user_email, password_hash=hash_password(password),
            email_verified_at=utcnow(), is_active=True,
        )
        session.add_all([admin, user])
        session.flush()
        session.add(Customer(account_id=user.id, email=user.email, name=user.email))
        limited = Product(
            name="限量测试商品", product_type="base", price_cents=100_00,
            validity_days=365, stock_quantity=1, fulfillment_mode="automatic",
            active=True, feature_codes_json="[]",
        )
        session.add(limited)
        session.flush()
        limited_id = limited.id

    def product_state() -> tuple:
        with database.session() as session:
            row = session.get(Product, limited_id)
            return int(row.stock_quantity), int(row.reserved_stock or 0)

    def order_status(order_no: str) -> str:
        from store.models import Order

        with database.session() as session:
            order = session.scalars(select(Order).where(Order.order_no == order_no)).first()
            return order.status if order else "?"

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://store.test", follow_redirects=True
    ) as client:
        admin_login = await client.post(
            "/store/v1/auth/login", json={"email": admin_email, "password": password}
        )
        check("管理员登录", admin_login.status_code == 200, str(admin_login.status_code))
        A = "/store-admin/v1"

        # ================= 1. 履约后库存是否真的被消耗 =================
        user_client = httpx.AsyncClient(
            transport=transport, base_url="http://store.test", follow_redirects=True
        )
        user_login = await user_client.post(
            "/store/v1/auth/login", json={"email": user_email, "password": password}
        )
        check("用户登录", user_login.status_code == 200, str(user_login.status_code))

        first = await user_client.post("/store/v1/orders", json={"productId": limited_id})
        check("限量 1 件：首单创建成功", first.status_code == 201, str(first.status_code))
        first_no = first.json()["orderNo"]
        stock, reserved = product_state()
        check(
            "首单占用后可用库存为 0",
            stock - reserved == 0,
            f"stock={stock} reserved={reserved}",
        )

        second = await user_client.post("/store/v1/orders", json={"productId": limited_id})
        check(
            "限量 1 件：第二单被售罄拦住",
            second.status_code == 409,
            f"{second.status_code} {second.text[:60]}",
        )

        await client.post(f"{A}/orders/{first_no}/mark-paid")
        fulfilled = await client.post(f"{A}/orders/{first_no}/fulfill")
        check("首单已履约", fulfilled.status_code == 200, str(fulfilled.status_code))
        stock, reserved = product_state()
        check(
            "履约后预留已释放",
            reserved == 0,
            f"stock={stock} reserved={reserved}",
        )
        check(
            "【关键】履约后剩余库存应为 0（唯一一件已卖出）",
            stock - reserved == 0,
            f"stock_quantity={stock} reserved={reserved} → available={stock - reserved}",
        )

        third = await user_client.post("/store/v1/orders", json={"productId": limited_id})
        check(
            "【关键】已售罄商品不应再放行新订单",
            third.status_code == 409,
            f"实际 {third.status_code}；若为 201 说明同一件库存可无限次卖出",
        )

        # ================= 2. 退款是否释放预留 =================
        # 先把上面可能残留的待支付单清掉，否则「同账号待支付单」守卫会挡住下单
        pending = (await client.get(f"{A}/orders?status=pending")).json()["items"]
        for row in pending:
            await client.post(f"{A}/orders/{row['orderNo']}/cancel", json={"note": "探针清理"})
        check("清空残留待支付单", True, f"取消 {len(pending)} 笔")

        with database.session() as session:
            second_limited = Product(
                name="退款预留测试", product_type="base", price_cents=100_00,
                validity_days=365, stock_quantity=2, fulfillment_mode="manual",
                active=True, feature_codes_json="[]",
            )
            session.add(second_limited)
            session.flush()
            refund_product_id = second_limited.id

        order_a = await user_client.post("/store/v1/orders", json={"productId": refund_product_id})
        check("手动发卡商品可下单", order_a.status_code == 201, str(order_a.status_code))
        order_a_no = order_a.json()["orderNo"]
        # 手动发卡商品走真实支付时只会停在 paid（settle_paid_order 尊重 fulfillment_mode），
        # 直接照着这个终态造数据，避免用 admin mark-paid 那条会顺带履约的路径。
        from store.models import Order

        with database.session() as session:
            row = session.scalars(select(Order).where(Order.order_no == order_a_no)).first()
            row.status = "paid"
            row.paid_at = utcnow()
            session.flush()
        with database.session() as session:
            row = session.get(Product, refund_product_id)
            check(
                "已支付未发码的订单仍占预留",
                int(row.reserved_stock or 0) == 1,
                f"reserved_stock={int(row.reserved_stock or 0)}",
            )

        refunded = await client.post(
            f"{A}/orders/{order_a_no}/refund", json={"note": "探针退款"}
        )
        check("paid 订单可退款", refunded.status_code == 200, str(refunded.status_code))
        with database.session() as session:
            row = session.get(Product, refund_product_id)
            reserved = int(row.reserved_stock or 0)
        check(
            "【关键】退款后应释放库存预留",
            reserved == 0,
            f"reserved_stock={reserved}（非 0 表示这一件库存被永久占用，可用库存虚低）",
        )

    print("\n" + "=" * 60)
    failed = [name for name, ok, _ in RESULTS if not ok]
    print(f"共 {len(RESULTS)} 项，失败 {len(failed)} 项")
    for name in failed:
        print(f"  · {name}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
