"""为后台界面联调准备一份可登录的演示数据（跑完即删）。"""

from __future__ import annotations

import os
import sys
from datetime import timedelta

from sqlalchemy import select

from store.app import create_app
from store.config import load_settings
from store.models import (
    Account,
    Coupon,
    CouponRedemption,
    Customer,
    DeviceBinding,
    DeviceReleaseEvent,
    EmailVerification,
    Entitlement,
    License,
    LicenseSession,
    LoginAttempt,
    Order,
    Product,
    ReferralLedger,
    ReferralWallet,
    RecoveryToken,
    utcnow,
)
from store.security import hash_password, new_uuid, token_hash
from store.tools.seed import seed_products, seed_release, seed_settings

ADMIN_EMAIL = "sfairy@homeos.local"
ADMIN_PASSWORD = "fcx6041246"
USER_EMAIL = "user@homeos.local"


def main() -> int:
    data_dir = os.environ["STORE_DATA_DIR"]
    settings = load_settings()
    app = create_app(settings)
    database = app.state.database

    with database.session() as session:
        if session.get(Product, "seed-skip") is None:
            seed_settings(session)
            seed_release(session)
        products = list(session.scalars(select(Product).order_by(Product.sort_order)))
        if not products:
            products = list(seed_products(session).values())
        base = products[0]

        def ensure_account(email: str, *, admin: bool) -> Account:
            account = session.scalars(select(Account).where(Account.email == email)).first()
            if account is None:
                account = Account(
                    email=email, password_hash=hash_password(ADMIN_PASSWORD),
                    email_verified_at=utcnow(), is_admin=admin, is_active=True,
                )
                session.add(account)
                session.flush()
            return account

        admin = ensure_account(ADMIN_EMAIL, admin=True)
        user = ensure_account(USER_EMAIL, admin=False)
        for account in (user, admin):
            if session.scalars(
                select(Customer).where(Customer.account_id == account.id)
            ).first() is None:
                session.add(Customer(account_id=account.id, email=account.email, name=account.email))
        session.flush()
        customer = session.scalars(
            select(Customer).where(Customer.account_id == user.id)
        ).first()

        license_row = session.scalars(
            select(License).where(License.account_id == user.id)
        ).first()
        if license_row is None:
            license_row = License(
                activation_code="HOME-DEMO-0000-0001",
                code_hint="HOME-****-0001",
                customer_id=customer.id,
                account_id=user.id,
                product_id=base.id,
                product_name=base.name,
                product_type=base.product_type,
                price_cents=base.price_cents,
                validity_days=365,
                issuance_source="manual",
                user_label="演示授权",
                active=True,
                issued_at=utcnow(),
                access_started_at=utcnow(),
                access_expires_at=utcnow() + timedelta(days=365),
            )
            session.add(license_row)
            session.flush()
        if session.scalars(
            select(Entitlement).where(Entitlement.license_id == license_row.id)
        ).first() is None:
            session.add(
                Entitlement(
                    customer_id=customer.id, license_id=license_row.id,
                    product_id=base.id, product_name=base.name,
                    product_type=base.product_type,
                    feature_code="module.3d_interaction",
                    active=True, starts_at=utcnow(),
                    expires_at=utcnow() + timedelta(days=365),
                )
            )
        binding = session.scalars(
            select(DeviceBinding).where(DeviceBinding.license_id == license_row.id)
        ).first()
        if binding is None:
            binding = DeviceBinding(
                license_id=license_row.id, instance_id="demo-instance-000000000001",
                client_version="0.6.0", activated_at=utcnow(), last_heartbeat_at=utcnow(),
                last_ip="127.0.0.1", active=True,
            )
            session.add(binding)
            session.flush()
            session.add(
                LicenseSession(
                    id_hash=token_hash("demo-license-session"), session_id=new_uuid(),
                    binding_id=binding.id, license_id=license_row.id,
                    expires_at=utcnow() + timedelta(days=7), last_used_at=utcnow(),
                )
            )
            session.add(
                RecoveryToken(
                    id_hash=token_hash("demo-recovery"), binding_id=binding.id,
                    license_id=license_row.id, expires_at=utcnow() + timedelta(days=1),
                )
            )
        if session.scalars(select(Order).limit(1)).first() is None:
            session.add(
                Order(
                    order_no="DEMO202609150001", account_id=user.id, customer_id=customer.id,
                    email=USER_EMAIL, lookup_token=new_uuid(),
                    product_id=base.id, product_name=base.name, product_type=base.product_type,
                    amount_cents=base.price_cents, status="fulfilled", target_license_id=license_row.id,
                    paid_at=utcnow(), fulfilled_at=utcnow(),
                )
            )
        if session.scalars(select(Coupon).limit(1)).first() is None:
            coupon = Coupon(
                code="DEMO20", description="演示用 8 折码", discount_type="percent",
                percent=20, max_redemptions=100, per_account_limit=1, active=True,
                expires_at=utcnow() + timedelta(days=30),
            )
            session.add(coupon)
            session.flush()
            session.add(
                CouponRedemption(coupon_id=coupon.id, account_id=user.id, discount_cents=0)
            )
        wallet = session.scalars(
            select(ReferralWallet).where(ReferralWallet.account_id == user.id)
        ).first()
        if wallet is None:
            wallet = ReferralWallet(account_id=user.id, code="DEMOREF", balance=12.5, earned=12.5)
            session.add(wallet)
            session.flush()
            session.add(
                ReferralLedger(
                    wallet_id=wallet.id, account_id=user.id, kind="order_reward",
                    delta=12.5, balance_after=12.5, note="演示奖励",
                )
            )
        if session.scalars(select(LoginAttempt).limit(1)).first() is None:
            session.add(LoginAttempt(scope=f"login:{USER_EMAIL}", succeeded=True))
            session.add(LoginAttempt(scope=f"login:{USER_EMAIL}", succeeded=False))
        if session.scalars(select(EmailVerification).limit(1)).first() is None:
            session.add(
                EmailVerification(
                    email=USER_EMAIL, purpose="register", code_hash=token_hash("000000"),
                    expires_at=utcnow() + timedelta(minutes=10),
                )
            )
        if session.scalars(select(DeviceReleaseEvent).limit(1)).first() is None:
            session.add(
                DeviceReleaseEvent(
                    license_id=license_row.id, account_id=user.id,
                    instance_id="demo-released-0001", source="user",
                )
            )

    print(f"演示数据就绪：{data_dir}")
    print(f"  管理员 {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
