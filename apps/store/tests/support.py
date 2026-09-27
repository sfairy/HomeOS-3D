"""测试用的种子数据与签名助手。"""

from __future__ import annotations

from datetime import timedelta

from apps.store.core.models import Account, Customer, Order, Product
from apps.store.security.security import hash_password, new_order_no, new_token, utcnow


def create_account(
    database, *, email: str, password: str = "pw123456", admin: bool = False, verified: bool = True
) -> str:
    """直接建一个可用账号（含 1:1 的客户档案行）。返回账号 id。"""
    with database.session() as session:
        account = Account(
            email=email,
            password_hash=hash_password(password),
            is_admin=admin,
            email_verified_at=utcnow() if verified else None,
        )
        session.add(account)
        session.flush()
        session.add(Customer(account_id=account.id, email=email, name=email))
        return account.id


def first_product(database) -> str:
    with database.session() as session:
        product = session.query(Product).filter(Product.active.is_(True)).first()
        assert product is not None, "默认商品目录没有补齐"
        return product.id


def create_order(
    database,
    *,
    account_id: str,
    product_id: str,
    provider: str = "alipay",
    status: str = "pending",
    amount_cents: int | None = None,
) -> tuple[str, str]:
    """建一笔订单，返回 (order_no, order_id)。"""
    with database.session() as session:
        account = session.get(Account, account_id)
        product = session.get(Product, product_id)
        amount = int(product.price_cents if amount_cents is None else amount_cents)
        order = Order(
            order_no=new_order_no(account.email),
            lookup_token=new_token(24),
            account_id=account.id,
            customer_id=account.customer.id,
            email=account.email,
            product_id=product.id,
            product_name=product.name,
            product_type=product.product_type,
            order_type="base",
            license_action="issue",
            original_amount_cents=amount,
            amount_cents=amount,
            status=status,
            fulfillment_mode=product.fulfillment_mode,
            payment_provider=provider,
            expires_at=utcnow() + timedelta(minutes=15),
        )
        session.add(order)
        session.flush()
        return order.order_no, order.id


def generate_rsa_keypair() -> tuple[str, str]:
    """生成一对 RSA 2048 密钥 (私钥 PEM, 公钥 PEM)。"""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode("utf-8")
    public_pem = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    return private_pem, public_pem


def generate_alipay_keypair() -> tuple[str, str]:
    """生成一对 RSA2 密钥：私钥给「支付宝」用它签名，公钥配给商店验签。"""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode("utf-8")
    public_pem = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    return private_pem, public_pem


def sign_notify(fields: dict, private_pem: str) -> dict:
    """按支付宝异步通知的规则签名（排除 sign 与 sign_type、跳过空值）。"""
    from apps.store.payments.alipay_signing import sign_params

    payload = {key: value for key, value in fields.items() if value not in (None, "")}
    payload["sign"] = sign_params(payload, private_pem)
    return payload
