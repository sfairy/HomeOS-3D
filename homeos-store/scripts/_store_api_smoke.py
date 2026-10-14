"""商店后端 API 冒烟：真起商店 app、真打端点（TestClient + 临时 data 目录）。

覆盖的是**只有 HTTP 层才看得见**的那部分：后台鉴权闸门、支付回调验签与入账、优惠码
CRUD/试算、提现账务语义、审计清理、邮件测试链路。既有的几个商店冒烟是静态/AST 断言或
在库上直接调函数，端点层（依赖注入、Cookie 会话、同源闸门、状态码与文案）没有任何覆盖，
而商店是全仓唯一真实收款面 —— 「验签逻辑对了但端点回错格式」这类改动不会有门禁变红。

几处刻意为之的取舍：

* **部分订单按 ``create_order`` 的字段口径直接落库**，不走 ``POST /store/v1/orders``：
  那条路会真连网关（支付宝 ``trade.precreate`` / 微信 native 下单），CI 无外网必然失败，
  而「回调能不能入账」与「网关能不能下单」是两件事。下单端点本身仍有覆盖：0 元单
  （100% 优惠码）不碰网关、走真端点；未知渠道 400 也在内。
* **凭据写站点配置表**：微信凭据没有环境变量入口（``config.py`` 只认库里的
  ``store_settings``），支付宝走同一张表，免得两条配置路径分叉出两种行为。
* **密钥现生成**：支付宝通知用「应用私钥」签、用「支付宝公钥」验 —— 这里生成一对自签
  密钥分别填进这两个字段，于是冒烟能造出**签名合法**的通知（现实里那两把是一对）；
  篡改用例只改签名尾部，保证「验签失败」确实来自验签而不是解析。
"""

from __future__ import annotations

import base64
import json
import os
import secrets
import time
from datetime import timedelta
from urllib.parse import urlencode

from _smoke_harness import (
    bootstrap_env,
    check,
    expect,
    expect_true,
    report,
)

# ── 1) 环境必须在 import src.* 之前落位（StoreSettings 在导入期构造）──────────────
DATA_DIR = bootstrap_env(prefix="homeos-store-api-smoke-")

ORIGIN = "http://testserver"
SETUP_TOKEN = "smoke-setup-token"
ADMIN_EMAIL = "smoke-admin@example.test"
ADMIN_PASSWORD = "SmokeAdminPass123"
CUSTOMER_EMAIL = "smoke-customer@example.test"
CUSTOMER_USERNAME = "smokecustomer"
CUSTOMER_PASSWORD = "SmokeCustomerPass123"
REGISTER_CODE = "778899"

ALIPAY_APP_ID = "2021000000000000"
ALIPAY_SELLER_ID = "2088000000000000"
WECHAT_MCH_ID = "1900000001"
WECHAT_APP_ID = "wx0000000000000000"
WECHAT_SERIAL_NO = "4F1A2B3C4D5E6F70"
#: 必须**恰好** 32 个字符（AES-256-GCM 的密钥，商店侧会校验长度）。
WECHAT_API_V3_KEY = "smoke-store-api-v3-key-32-chars!"

API = "/store/v1"
ADMIN_API = "/store-admin/v1"
ALIPAY_NOTIFY = f"{API}/payments/alipay/notify"
WECHAT_NOTIFY = f"{API}/payments/wechat/notify"


def _rsa_keypair() -> tuple[str, str]:
    """现生成一对 2048 位 RSA 密钥，返回 ``(私钥 PEM, 公钥 PEM)``。

    商店侧两处都要求「可解析且 ≥2048 位」，写死一份测试密钥既没必要（生成只要 ~0.1s），
    也不该进仓库。
    """
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("ascii")
    public_pem = (
        key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode("ascii")
    )
    return private_pem, public_pem


ALIPAY_PRIVATE_KEY, ALIPAY_PUBLIC_KEY = _rsa_keypair()
WECHAT_MERCHANT_KEY, WECHAT_PLATFORM_PUBLIC_KEY = _rsa_keypair()

os.environ.update(
    {
        # 同源闸门按「Host 头推出来的 scheme://host」比对，TestClient 的 Host 就是 testserver。
        "STORE_BASE_URL": ORIGIN,
        "STORE_COOKIE_SECURE": "0",
        "STORE_SETUP_TOKEN": SETUP_TOKEN,
        "STORE_MAIL_MODE": "log",
        # 授权密钥写临时目录：默认值指向仓库的 keys/local，冒烟不该往里写。
        "STORE_LICENSE_KEYS_DIR": str(DATA_DIR / "keys"),
        # 后台循环只制造噪声（真实网络请求），这里让它们在这轮里不会触发。
        "STORE_PAYMENT_SWEEP_INTERVAL_SECONDS": "3600",
        "STORE_RELEASE_SYNC_INTERVAL_SECONDS": "0",
    }
)

# ── 2) 现在才 import 商店 app ────────────────────────────────────────────────
from fastapi.testclient import TestClient
from sqlalchemy import select
from src.api.store_shared import _customer_for
from src.app import create_app
from src.commerce import money, referrals
from src.core.models import (
    Account,
    AuditLog,
    EmailVerification,
    License,
    Order,
    Product,
    ReferralWithdrawal,
    StoreSetting,
)
from src.ops import site_settings as site_config
from src.payments.alipay_signing import build_sign_content
from src.payments.wechat_signing import sign as rsa_sha256_sign
from src.security.security import (
    code_hash,
    hash_password,
    new_code_salt,
    new_order_no,
    new_token,
    utcnow,
)

_PASSWORD_HASH = ""
_STATE: dict[str, str] = {}


def _hash() -> str:
    """口令哈希只算一次：一堆冒烟账号用同一个口令，重复算纯属浪费（每次约 0.1s）。"""
    global _PASSWORD_HASH
    if not _PASSWORD_HASH:
        _PASSWORD_HASH = hash_password(ADMIN_PASSWORD)
    return _PASSWORD_HASH


# ── 库内直读直写的小工具（全部走 app 自己的 Database，与端点同一份库）────────────
def _base_product(session) -> Product:
    product = session.scalars(
        select(Product).where(Product.product_type == "base").order_by(Product.sort_order)
    ).first()
    if product is None:
        raise SystemExit("默认商品缺失：create_app 的 ensure_default_products 没跑？")
    return product


def _seed_site_settings(app) -> None:
    """按「后台保存站点配置」的口径把两个渠道的凭据写进库。"""
    with app.state.database.session() as session:
        setting = session.get(StoreSetting, 1)
        if setting is None:
            setting = site_config.get_setting(session)
        setting.payment_provider = "alipay"
        setting.payment_channels_json = json.dumps(["alipay", "wechat"])
        setting.payment_enabled = True
        setting.alipay_app_id = ALIPAY_APP_ID
        setting.alipay_seller_id = ALIPAY_SELLER_ID
        setting.alipay_app_private_key = ALIPAY_PRIVATE_KEY
        # 自签：把「支付宝公钥」设成应用私钥那一对的公钥，冒烟才能造出合法通知（见模块 docstring）。
        setting.alipay_public_key = ALIPAY_PUBLIC_KEY
        setting.wechat_mch_id = WECHAT_MCH_ID
        setting.wechat_app_id = WECHAT_APP_ID
        setting.wechat_api_v3_key = WECHAT_API_V3_KEY
        setting.wechat_merchant_private_key = WECHAT_MERCHANT_KEY
        setting.wechat_merchant_serial_no = WECHAT_SERIAL_NO
        setting.wechat_platform_public_key = WECHAT_PLATFORM_PUBLIC_KEY


def _seed_verification(app, *, email: str, purpose: str, code: str) -> None:
    """造一条**已知明文**的验证码记录。

    端点的发码路径会把随机码只发给邮件（log 模式连日志里都不落明文），冒烟拿不到它，
    所以按同一套 ``code_hash(code, salt)`` 口径自己插一条 —— 校验逻辑本身仍是被测对象。
    """
    salt = new_code_salt()
    with app.state.database.session() as session:
        session.add(
            EmailVerification(
                email=email,
                purpose=purpose,
                code_hash=code_hash(code, salt),
                code_salt=salt,
                expires_at=utcnow() + timedelta(minutes=10),
            )
        )


def _seed_account(app, tag: str) -> str:
    """造一个已验证的顾客账号（连带 Customer 行）；返回 account_id。"""
    with app.state.database.session() as session:
        account = Account(
            username=f"smoke-{tag}",
            email=f"smoke-{tag}@example.test",
            password_hash=_hash(),
            email_verified_at=utcnow(),
        )
        session.add(account)
        session.flush()
        _customer_for(session, account)
        return account.id


def _seed_pending_order(app, *, tag: str, provider: str, amount_cents: int) -> tuple[str, str]:
    """按 ``create_order`` 的字段口径造一笔待支付订单，返回 ``(order_no, account_id)``。

    ``orders`` 上有一条「每账号最多一笔 pending」的部分唯一索引，所以每个标签各自建账号。
    """
    account_id = _seed_account(app, tag)
    with app.state.database.session() as session:
        account = session.get(Account, account_id)
        product = _base_product(session)
        order = Order(
            order_no=new_order_no(account.email),
            lookup_token=new_token(24),
            account_id=account.id,
            customer_id=_customer_for(session, account).id,
            email=account.email,
            product_id=product.id,
            product_name=product.name,
            product_type=product.product_type,
            order_type="base",
            license_action="issue",
            original_amount_cents=amount_cents,
            amount_cents=amount_cents,
            status="pending",
            fulfillment_mode=product.fulfillment_mode,
            payment_provider=provider,
            expires_at=utcnow() + timedelta(seconds=3600),
        )
        session.add(order)
        session.flush()
        return order.order_no, account_id


def _order_snapshot(app, order_no: str) -> dict:
    with app.state.database.session() as session:
        order = session.scalars(select(Order).where(Order.order_no == order_no)).first()
        if order is None:
            return {}
        return {
            "status": order.status,
            "licenseId": order.license_id or "",
            "tradeNo": order.payment_trade_no or "",
        }


def _license_activation_code(app, license_id: str) -> str:
    with app.state.database.session() as session:
        row = session.get(License, license_id)
        return (row.activation_code or "") if row is not None else ""


def _wallet_snapshot(app, account_id: str) -> tuple[int, int]:
    with app.state.database.session() as session:
        wallet = session.scalars(
            select(referrals.ReferralWallet).where(referrals.ReferralWallet.account_id == account_id)
        ).first()
        if wallet is None:
            return (0, 0)
        return (int(wallet.balance_centi or 0), int(wallet.frozen_centi or 0))


def _withdrawal_status(app, withdrawal_id: str) -> str:
    with app.state.database.session() as session:
        row = session.get(ReferralWithdrawal, withdrawal_id)
        return row.status if row is not None else ""


def _seed_wallet(app, account_id: str, balance_centi: int) -> None:
    with app.state.database.session() as session:
        account = session.get(Account, account_id)
        wallet = referrals.get_or_create_wallet(session, account)
        wallet.balance_centi = balance_centi
        wallet.frozen_centi = 0


def _seed_old_audit_row(app, *, action: str) -> str:
    with app.state.database.session() as session:
        row = AuditLog(
            actor="smoke",
            action=action,
            target="",
            detail="三天前的旧审计行（用于验证按天数清理的截止线）",
            created_at=utcnow() - timedelta(days=3),
        )
        session.add(row)
        session.flush()
        return row.id


def _audit_actions(app) -> list[str]:
    with app.state.database.session() as session:
        return [str(action) for action in session.scalars(select(AuditLog.action).order_by(AuditLog.created_at))]


# ── 支付宝通知构造 ────────────────────────────────────────────────────────
def _alipay_fields(
    *,
    order_no: str,
    amount_cents: int,
    tamper_signature: bool = False,
    trade_status: str = "TRADE_SUCCESS",
) -> dict[str, str]:
    fields = {
        "app_id": ALIPAY_APP_ID,
        "seller_id": ALIPAY_SELLER_ID,
        "out_trade_no": order_no,
        "trade_no": f"2026101322000{order_no[-6:]}",
        "trade_status": trade_status,
        "total_amount": money.format_centi(amount_cents),
        "gmt_payment": "2026-10-13 22:00:00",
        "sign_type": "RSA2",
    }
    content = build_sign_content(fields, excluded=frozenset({"sign", "sign_type"}))
    signature = rsa_sha256_sign(content, ALIPAY_PRIVATE_KEY)
    if tamper_signature:
        # 只动尾部：保持长度合法（否则失败可能来自 base64 解析而不是验签）。
        signature = signature[:-4] + ("AAAA" if not signature.endswith("AAAA") else "BBBB")
    fields["sign"] = signature
    return fields


# ── 微信通知构造 ─────────────────────────────────────────────────────────
def _wechat_notify(
    *,
    order_no: str,
    amount_cents: int,
    tamper_signature: bool = False,
    stale_timestamp: bool = False,
    app_id: str = WECHAT_APP_ID,
    wrong_api_key: bool = False,
) -> tuple[str, dict[str, str]]:
    """造一条微信 v3 通知：AES-256-GCM 加密的 resource + RSA 签名的三段头。"""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    plaintext = json.dumps(
        {
            "mchid": WECHAT_MCH_ID,
            "appid": app_id,
            "out_trade_no": order_no,
            "transaction_id": f"4200001{order_no[-8:]}",
            "trade_state": "SUCCESS",
            "amount": {"total": amount_cents, "payer_total": amount_cents},
        },
        ensure_ascii=False,
    ).encode("utf-8")

    nonce = secrets.token_urlsafe(9)[:12]
    associated_data = "transaction"
    key = WECHAT_API_V3_KEY if not wrong_api_key else "wrong-store-api-v3-key-32-chars!"
    ciphertext = AESGCM(key.encode("utf-8")).encrypt(nonce.encode("utf-8"), plaintext, associated_data.encode("utf-8"))
    body_text = json.dumps(
        {
            "id": secrets.token_hex(16),
            "create_time": "2026-10-13T22:00:00+08:00",
            "event_type": "TRANSACTION.SUCCESS",
            "resource_type": "encrypt-resource",
            "resource": {
                "algorithm": "AEAD_AES_256_GCM",
                "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
                "nonce": nonce,
                "associated_data": associated_data,
            },
        },
        ensure_ascii=False,
    )

    timestamp = str(int(time.time()) - (3600 if stale_timestamp else 0))
    nonce_header = secrets.token_urlsafe(12)
    # 商户私钥与「平台公钥」是同一对（见模块 docstring）：微信那侧签名用的是平台私钥，
    # 冒烟没有平台私钥，就把这一对同时充当「商户密钥」与「平台密钥」。
    signature = rsa_sha256_sign(f"{timestamp}\n{nonce_header}\n{body_text}\n", WECHAT_MERCHANT_KEY)
    if tamper_signature:
        signature = signature[:-4] + ("AAAA" if not signature.endswith("AAAA") else "BBBB")
    headers = {
        "Content-Type": "application/json",
        "Wechatpay-Timestamp": timestamp,
        "Wechatpay-Nonce": nonce_header,
        "Wechatpay-Signature": signature,
        "Wechatpay-Serial": WECHAT_SERIAL_NO,
    }
    return body_text, headers


def _generic_base_product_id(app) -> str:
    with app.state.database.session() as session:
        return _base_product(session).id


def main() -> None:
    app = create_app()
    _seed_site_settings(app)
    _seed_verification(app, email=CUSTOMER_EMAIL, purpose="register", code=REGISTER_CODE)

    # Origin 头是 Cookie 会话下改状态请求的 CSRF 闸门要求（与浏览器行为一致）。
    with TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN}) as client:
        _run(client, app)

    if not _STATE.get("done"):
        print("  FAIL 冒烟未跑完（见上面第一条失败项）")
        raise SystemExit(1)
    report("SMOKE OK — 商店端点层：鉴权闸门 / 回调验签入账 / 优惠码 / 提现账务 / 审计清理")


def _run(client: TestClient, app) -> None:
    product_id = _generic_base_product_id(app)

    # ── 1. 健康检查与后台鉴权闸门 ──────────────────────────────────────────
    print("1) 后台鉴权闸门：无会话 401、伪造 Cookie 401、顾客会话 403、管理员会话 200")

    check("GET /healthz 200", lambda: expect(client.get("/healthz").status_code, 200, "healthz"))

    def _anon_admin_denied() -> None:
        with TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN}) as anon:
            for path in ("orders", "coupons", "withdrawals", "audit-logs", "settings"):
                response = anon.get(f"{ADMIN_API}/{path}")
                expect(
                    response.status_code,
                    401,
                    f"未登录访问 {ADMIN_API}/{path} 必须 401，实际 {response.status_code} {response.text[:120]}",
                )

    check("未登录访问后台 → 401", _anon_admin_denied)

    def _forged_cookie_denied() -> None:
        client.cookies.set("homeos_store_session", "forged-session-token")
        try:
            response = client.get(f"{ADMIN_API}/orders")
            expect(
                response.status_code,
                401,
                f"伪造会话 Cookie 必须 401，实际 {response.status_code} {response.text[:120]}",
            )
        finally:
            client.cookies.clear()

    check("伪造会话 Cookie → 401", _forged_cookie_denied)

    # ── 2. 首次初始化：引导密钥 ───────────────────────────────────────────
    print("2) 首次初始化：错密钥 403、对密钥 201 并拿到管理员会话、重复初始化 409")

    def _wrong_token() -> None:
        response = client.post(
            f"{API}/setup/admin",
            json={
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD,
                "confirm_password": ADMIN_PASSWORD,
                "setup_token": "not-the-token",
            },
        )
        expect(response.status_code, 403, f"{response.status_code} {response.text[:120]}")

    check("错误引导密钥被拒（403）", _wrong_token)

    def _create_admin() -> None:
        response = client.post(
            f"{API}/setup/admin",
            json={
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD,
                "confirm_password": ADMIN_PASSWORD,
                "setup_token": SETUP_TOKEN,
            },
        )
        expect(
            response.status_code,
            201,
            f"{response.status_code} {response.text[:200]}",
        )
        expect_true(response.json().get("isAdmin") is True, f"响应未标管理员：{response.text[:200]}")
        expect_true(
            client.cookies.get("homeos_store_session") is not None,
            "初始化后没有会话 Cookie",
        )
        _STATE["done"] = "1"

    check("正确引导密钥 → 201 + 管理员会话", _create_admin)

    def _duplicate_admin() -> None:
        response = client.post(
            f"{API}/setup/admin",
            json={
                "email": "second-admin@example.test",
                "password": ADMIN_PASSWORD,
                "confirm_password": ADMIN_PASSWORD,
                "setup_token": SETUP_TOKEN,
            },
        )
        expect(response.status_code, 409, f"{response.status_code} {response.text[:120]}")

    check("重复初始化被拒（409）", _duplicate_admin)

    admin_client = client

    # ── 3. 优惠码 CRUD ───────────────────────────────────────────────────
    print("3) 优惠码 CRUD：创建 / 重码 409 / 非法折扣类型 400 / 停用与启用 / 列表")

    def _create_coupon() -> None:
        response = admin_client.post(
            f"{ADMIN_API}/coupons",
            json={
                "code": "smoke100",
                "description": "冒烟：整单免单",
                "discountType": "percent",
                "percent": 100,
                "maxRedemptions": 1,
                "perAccountLimit": 1,
            },
        )
        expect(response.status_code, 200, f"{response.status_code} {response.text[:200]}")
        payload = response.json()
        expect(payload.get("code"), "SMOKE100", "优惠码入库应统一大写")
        expect(payload.get("discountType"), "percent", "折扣类型回显")
        _STATE["coupon100"] = str(payload.get("id"))

    check("创建 100% 优惠码", _create_coupon)

    def _create_preview_coupon() -> None:
        response = admin_client.post(
            f"{ADMIN_API}/coupons",
            json={
                "code": "SMOKE10",
                "description": "冒烟：九折",
                "discountType": "percent",
                "percent": 10,
                "perAccountLimit": 1,
            },
        )
        expect(response.status_code, 200, f"{response.status_code} {response.text[:200]}")
        _STATE["coupon10"] = str(response.json().get("id"))

    check("创建 10% 优惠码", _create_preview_coupon)

    def _duplicate_coupon() -> None:
        response = admin_client.post(
            f"{ADMIN_API}/coupons",
            json={"code": "SMOKE100", "discountType": "percent", "percent": 5},
        )
        expect(response.status_code, 409, f"{response.status_code} {response.text[:120]}")

    check("重复优惠码 → 409", _duplicate_coupon)

    def _bad_discount_type() -> None:
        response = admin_client.post(
            f"{ADMIN_API}/coupons",
            json={"code": "SMOKEBAD", "discountType": "bogus", "percent": 5},
        )
        expect(response.status_code, 400, f"{response.status_code} {response.text[:120]}")

    check("非法折扣类型 → 400", _bad_discount_type)

    def _toggle_coupon() -> None:
        coupon_id = _STATE.get("coupon10", "")
        expect_true(bool(coupon_id), "前置失败：10% 优惠码未创建")
        off = admin_client.patch(f"{ADMIN_API}/coupons/{coupon_id}", json={"active": False})
        expect(off.status_code, 200, f"{off.status_code} {off.text[:120]}")
        expect(off.json().get("active"), False, "停用后 active 应为 false")
        on = admin_client.patch(f"{ADMIN_API}/coupons/{coupon_id}", json={"active": True})
        expect(on.json().get("active"), True, "重新启用后 active 应为 true")

    check("停用 / 启用优惠码", _toggle_coupon)

    def _coupon_listed() -> None:
        response = admin_client.get(f"{ADMIN_API}/coupons", params={"keyword": "SMOKE10"})
        expect(response.status_code, 200, f"{response.status_code} {response.text[:120]}")
        payload = response.json()
        codes = [item.get("code") for item in payload.get("items", [])]
        # 关键字是 LIKE 子串匹配，SMOKE100 也会命中；这里断言的是「筛得到的包含它」。
        expect_true("SMOKE10" in codes, f"按关键字筛不到 SMOKE10：{codes}")
        expect_true(int(payload.get("total") or 0) >= 1, f"total 应至少 1：{payload.get('total')}")

    check("后台列表可筛到优惠码", _coupon_listed)

    # ── 4. 顾客注册与 0 元下单 ────────────────────────────────────────────
    print("4) 顾客注册 → 优惠码试算 → 0 元单直接开通（不碰网关）")

    customer = TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN})

    def _register_customer() -> None:
        response = customer.post(
            f"{API}/auth/register",
            json={
                "username": CUSTOMER_USERNAME,
                "email": CUSTOMER_EMAIL,
                "code": REGISTER_CODE,
                "password": CUSTOMER_PASSWORD,
            },
        )
        expect(response.status_code, 200, f"{response.status_code} {response.text[:200]}")
        expect_true(
            customer.cookies.get("homeos_store_session") is not None,
            "注册后没有会话 Cookie",
        )

    check("注册（用库内已知验证码）", _register_customer)

    def _preview_discount() -> None:
        response = customer.post(
            f"{API}/coupons/preview",
            json={"productId": product_id, "couponCode": "SMOKE10"},
        )
        expect(response.status_code, 200, f"{response.status_code} {response.text[:200]}")
        payload = response.json()
        # 默认基础版 4990 分，九折 → 折扣 499 分（不足一分舍去）。
        expect(payload.get("discountCents"), 499, "折扣试算（不足一分舍去）")
        expect(payload.get("amountCents"), 4491, "折后应付")

    check("优惠码试算口径", _preview_discount)

    def _preview_unknown_code() -> None:
        response = customer.post(
            f"{API}/coupons/preview",
            json={"productId": product_id, "couponCode": "NOSUCHCODE"},
        )
        expect(response.status_code, 404, f"{response.status_code} {response.text[:120]}")

    check("未知优惠码 → 404", _preview_unknown_code)

    def _unknown_channel_rejected() -> None:
        response = customer.post(
            f"{API}/orders",
            json={"productId": product_id, "paymentChannel": "paypal"},
        )
        expect(response.status_code, 400, f"{response.status_code} {response.text[:120]}")

    check("未知支付渠道 → 400", _unknown_channel_rejected)

    def _free_order() -> None:
        response = customer.post(
            f"{API}/orders",
            json={
                "productId": product_id,
                "couponCode": "SMOKE100",
                "paymentChannel": "alipay",
            },
        )
        expect(response.status_code, 201, f"{response.status_code} {response.text[:300]}")
        payload = response.json()
        expect(payload.get("amountCents"), 0, "100% 优惠码后应付应为 0")
        # 0 元单不走网关，直接入账并履约（自动履约模式下状态会继续走到 fulfilled）。
        expect_true(
            payload.get("status") in {"paid", "fulfilled"},
            f"0 元单应直接入账，实际 status={payload.get('status')!r}",
        )
        expect_true(bool(payload.get("paidAt")), "0 元单应记下支付时间")
        expect_true(bool(payload.get("licenseId")), "0 元单应已签发授权")
        _STATE["free_order"] = str(payload.get("orderNo"))
        _STATE["free_license"] = str(payload.get("licenseId"))

    check("0 元单直接开通（201 + paid）", _free_order)

    def _free_order_license() -> None:
        license_id = _STATE.get("free_license", "")
        expect_true(bool(_license_activation_code(app, license_id)), "已入账订单的授权没有激活码")

    check("0 元单授权真的有激活码", _free_order_license)

    def _coupon_exhausted() -> None:
        response = customer.post(
            f"{API}/coupons/preview",
            json={"productId": product_id, "couponCode": "SMOKE100"},
        )
        expect(
            response.status_code,
            400,
            f"用过的优惠码应被拒（400），实际 {response.status_code} {response.text[:120]}",
        )

    check("用过的优惠码再试算 → 400", _coupon_exhausted)

    def _orders_listed() -> None:
        response = customer.get(f"{API}/orders")
        expect(response.status_code, 200, f"{response.status_code} {response.text[:120]}")
        order_nos = [item.get("orderNo") for item in response.json().get("items", [])]
        expect_true(_STATE.get("free_order") in order_nos, f"账号订单列表里没有刚才那单：{order_nos}")

    check("账号订单列表包含新单", _orders_listed)

    def _customer_is_not_admin() -> None:
        response = customer.get(f"{ADMIN_API}/orders")
        expect(
            response.status_code,
            403,
            f"顾客会话访问后台必须 403，实际 {response.status_code} {response.text[:120]}",
        )

    check("顾客会话访问后台 → 403", _customer_is_not_admin)

    # ── 5. 支付宝回调 ────────────────────────────────────────────────────
    print("5) 支付宝回调：合法签名入账；篡改签名 / 金额不符 / 陌生单 / 跨渠道 / 错 Content-Type 全部拒")

    alipay_order, _ = _seed_pending_order(app, tag="alipay-ok", provider="alipay", amount_cents=3990)
    alipay_trap_order, _ = _seed_pending_order(app, tag="alipay-trap", provider="alipay", amount_cents=3990)
    wechat_trap_order, _ = _seed_pending_order(app, tag="wechat-trap", provider="wechat", amount_cents=1990)

    def _alipay_ok() -> None:
        response = client.post(
            ALIPAY_NOTIFY,
            data=_alipay_fields(order_no=alipay_order, amount_cents=3990),
        )
        expect(response.status_code, 200, f"{response.status_code} {response.text[:200]}")
        expect(response.text, "success", "合法通知必须回 success 文本")
        snapshot = _order_snapshot(app, alipay_order)
        expect(snapshot.get("status"), "fulfilled", "入账后应完成履约")
        expect_true(bool(snapshot.get("tradeNo")), "入账应记下 gateway 交易号")
        expect_true(bool(snapshot.get("licenseId")), "入账应签发授权")

    check("合法签名 → success + 入账发码", _alipay_ok)

    def _alipay_tampered() -> None:
        response = client.post(
            ALIPAY_NOTIFY,
            data=_alipay_fields(order_no=alipay_trap_order, amount_cents=3990, tamper_signature=True),
        )
        expect(response.text, "failure", f"篡改签名必须回 failure，实际 {response.text[:120]}")
        expect(_order_snapshot(app, alipay_trap_order).get("status"), "pending", "验签失败不得入账")

    check("篡改签名 → failure 且不入账", _alipay_tampered)

    def _alipay_amount_mismatch() -> None:
        response = client.post(
            ALIPAY_NOTIFY,
            data=_alipay_fields(order_no=alipay_trap_order, amount_cents=100),
        )
        expect(response.text, "failure", f"金额不符必须回 failure，实际 {response.text[:120]}")
        expect(_order_snapshot(app, alipay_trap_order).get("status"), "pending", "金额不符不得入账")

    check("金额不符 → failure 且不入账", _alipay_amount_mismatch)

    def _alipay_unknown_order() -> None:
        response = client.post(
            ALIPAY_NOTIFY,
            data=_alipay_fields(order_no="HOMEOS-NOSUCHORDER", amount_cents=3990),
        )
        expect(response.text, "failure", f"陌生订单必须回 failure，实际 {response.text[:120]}")

    check("陌生订单 → failure", _alipay_unknown_order)

    def _alipay_foreign_order() -> None:
        response = client.post(
            ALIPAY_NOTIFY,
            data=_alipay_fields(order_no=wechat_trap_order, amount_cents=1990),
        )
        expect(response.text, "failure", f"跨渠道订单必须回 failure，实际 {response.text[:120]}")
        expect(_order_snapshot(app, wechat_trap_order).get("status"), "pending", "跨渠道不得入账")

    check("支付宝通知指向微信订单 → failure", _alipay_foreign_order)

    def _alipay_wrong_content_type() -> None:
        # 用表单编码的 body 配 text/plain：端点能拿到字节（不会先被 FastAPI 的 JSON 校验拦掉），
        # 于是测到的正是「Content-Type 不是表单」这一条分支。
        fields = _alipay_fields(order_no=alipay_trap_order, amount_cents=3990)
        response = client.post(
            ALIPAY_NOTIFY,
            content=urlencode(fields).encode("utf-8"),
            headers={"Content-Type": "text/plain"},
        )
        expect(
            response.text,
            "failure",
            f"非表单 Content-Type 必须回 failure，实际 {response.text[:120]}",
        )

    check("非表单 Content-Type → failure", _alipay_wrong_content_type)

    # ── 6. 微信回调 ─────────────────────────────────────────────────────
    print("6) 微信回调：验签 + AES-GCM 解密后入账；篡改签名 / 过期时间戳 / 错密钥 / 错 appid 全部拒")

    wechat_order, _ = _seed_pending_order(app, tag="wechat-ok", provider="wechat", amount_cents=1990)

    def _wechat_ok() -> None:
        body, headers = _wechat_notify(order_no=wechat_order, amount_cents=1990)
        response = client.post(WECHAT_NOTIFY, content=body.encode("utf-8"), headers=headers)
        expect(response.status_code, 200, f"{response.status_code} {response.text[:200]}")
        expect(response.json().get("code"), "SUCCESS", "合法通知必须回 SUCCESS")
        snapshot = _order_snapshot(app, wechat_order)
        expect(snapshot.get("status"), "fulfilled", "入账后应完成履约")
        expect_true(bool(snapshot.get("licenseId")), "入账应签发授权")

    check("合法签名 + 可解密 → SUCCESS + 入账发码", _wechat_ok)

    def _wechat_tampered() -> None:
        body, headers = _wechat_notify(order_no=wechat_trap_order, amount_cents=1990, tamper_signature=True)
        response = client.post(WECHAT_NOTIFY, content=body.encode("utf-8"), headers=headers)
        expect(response.status_code, 400, f"验签失败必须非 200，实际 {response.status_code}")
        expect(response.json().get("code"), "FAIL", "验签失败必须回 FAIL")
        expect(_order_snapshot(app, wechat_trap_order).get("status"), "pending", "验签失败不得入账")

    check("篡改签名 → 400 FAIL 且不入账", _wechat_tampered)

    def _wechat_stale_timestamp() -> None:
        body, headers = _wechat_notify(order_no=wechat_trap_order, amount_cents=1990, stale_timestamp=True)
        response = client.post(WECHAT_NOTIFY, content=body.encode("utf-8"), headers=headers)
        expect(response.status_code, 400, f"过期时间戳必须非 200，实际 {response.status_code}")
        expect(response.json().get("code"), "FAIL", "过期时间戳必须回 FAIL")

    check("过期时间戳（超容忍窗口）→ 400 FAIL", _wechat_stale_timestamp)

    def _wechat_wrong_api_key() -> None:
        body, headers = _wechat_notify(order_no=wechat_trap_order, amount_cents=1990, wrong_api_key=True)
        response = client.post(WECHAT_NOTIFY, content=body.encode("utf-8"), headers=headers)
        expect(
            response.status_code,
            400,
            f"密钥不符（解密认证失败）必须非 200，实际 {response.status_code}",
        )
        expect(
            _order_snapshot(app, wechat_trap_order).get("status"),
            "pending",
            "解密失败不得入账",
        )

    check("APIv3 密钥不符（解密失败）→ 拒绝且不入账", _wechat_wrong_api_key)

    def _wechat_wrong_app_id() -> None:
        body, headers = _wechat_notify(order_no=wechat_trap_order, amount_cents=1990, app_id="wxWRONGAPPID000000")
        response = client.post(WECHAT_NOTIFY, content=body.encode("utf-8"), headers=headers)
        expect(response.status_code, 400, f"appid 不符必须非 200，实际 {response.status_code}")
        expect(response.json().get("code"), "FAIL", "appid 不符必须回 FAIL")

    check("appid 不符 → 400 FAIL", _wechat_wrong_app_id)

    # ── 7. 提现账务语义 ──────────────────────────────────────────────────
    print("7) 提现账务：申请冻结 → 通过扣账 / 驳回退回；低于门槛 422；重复申请 409")

    with app.state.database.session() as session:
        customer_account_id = str(session.scalars(select(Account.id).where(Account.email == CUSTOMER_EMAIL)).one())
    _seed_wallet(app, customer_account_id, 50_000)  # 500.00 积分

    def _withdraw_freeze() -> None:
        response = customer.post(
            f"{API}/referrals/withdrawals",
            json={"points": 100.0, "requestKey": "smoke-withdraw-0001"},
        )
        expect(response.status_code, 200, f"{response.status_code} {response.text[:200]}")
        payload = response.json()
        _STATE["withdrawal_1"] = str(payload.get("id"))
        expect(payload.get("status"), "pending", "新申请应为待审核")
        expect(
            _wallet_snapshot(app, customer_account_id),
            (50_000, 10_000),
            "申请提现应只冻结、不动余额",
        )

    check("申请提现 → 只冻结余额（balance 不变）", _withdraw_freeze)

    def _withdraw_second_blocked() -> None:
        response = customer.post(
            f"{API}/referrals/withdrawals",
            json={"points": 100.0, "requestKey": "smoke-withdraw-0002"},
        )
        expect(
            response.status_code,
            409,
            f"已有在途申请时再申请应 409，实际 {response.status_code} {response.text[:120]}",
        )

    check("在途申请期间再申请 → 409", _withdraw_second_blocked)

    def _withdraw_below_minimum() -> None:
        # 先清掉冻结，否则会被 409 提前拦下、测不到 422。
        referral_id = _STATE.get("withdrawal_1", "")
        admin_client.post(f"{ADMIN_API}/withdrawals/{referral_id}/resolve", json={"approve": False, "note": "冒烟"})
        response = customer.post(
            f"{API}/referrals/withdrawals",
            json={"points": 1.0, "requestKey": "smoke-withdraw-0003"},
        )
        expect(
            response.status_code,
            422,
            f"低于最低提现额应 422，实际 {response.status_code} {response.text[:120]}",
        )

    check("低于最低提现额 → 422", _withdraw_below_minimum)

    def _wallet_after_reject() -> None:
        referral_id = _STATE.get("withdrawal_1", "")
        expect(_withdrawal_status(app, referral_id), "rejected", "驳回后状态应为 rejected")
        expect(
            _wallet_snapshot(app, customer_account_id),
            (50_000, 0),
            "驳回应把冻结退回，且不动余额",
        )

    check("驳回 → 状态 rejected 且冻结退回", _wallet_after_reject)

    def _withdraw_ledger_kinds() -> None:
        response = customer.get(f"{API}/referrals/history", params={"kind": "ledger"})
        expect(response.status_code, 200, f"{response.status_code} {response.text[:120]}")
        kinds = [item.get("kind") for item in response.json().get("items", [])]
        expect_true(
            "freeze" in kinds and "release" in kinds,
            f"流水里应同时有申请冻结与驳回退回两条：{kinds[:6]}",
        )

    check("积分流水记录 freeze / release", _withdraw_ledger_kinds)

    def _withdraw_approve() -> None:
        created = customer.post(
            f"{API}/referrals/withdrawals",
            json={"points": 100.0, "requestKey": "smoke-withdraw-0004"},
        )
        expect(created.status_code, 200, f"{created.status_code} {created.text[:200]}")
        referral_id = str(created.json().get("id"))
        _STATE["withdrawal_2"] = referral_id
        resolved = admin_client.post(
            f"{ADMIN_API}/withdrawals/{referral_id}/resolve",
            json={"approve": True, "note": "冒烟：通过"},
        )
        expect(resolved.status_code, 200, f"{resolved.status_code} {resolved.text[:200]}")
        expect(resolved.json().get("status"), "paid", "通过后状态应为 paid")
        expect(
            _wallet_snapshot(app, customer_account_id),
            (40_000, 0),
            "通过应从余额里扣掉并清空冻结",
        )

    check("通过 → 扣余额并清空冻结", _withdraw_approve)

    def _withdraw_delete_rules() -> None:
        referral_id = _STATE.get("withdrawal_2", "")
        expect_true(bool(referral_id), "前置失败：通过的提现申请不存在")
        # 已结算（paid）的申请应当可删；再删一次则应 404。
        first = admin_client.delete(f"{ADMIN_API}/withdrawals/{referral_id}")
        expect(first.status_code, 200, f"{first.status_code} {first.text[:120]}")
        second = admin_client.delete(f"{ADMIN_API}/withdrawals/{referral_id}")
        expect(second.status_code, 404, f"{second.status_code} {second.text[:120]}")

    check("已结算申请可删、重复删 404", _withdraw_delete_rules)

    # ── 8. 审计与邮件测试链路 ────────────────────────────────────────────
    print("8) 审计：列表可见 → 邮件测试留痕 → 按天数清理只清旧行，0 天被拒")

    def _mail_probe() -> None:
        response = admin_client.post(f"{ADMIN_API}/settings/mail/test", json={"email": "ops@example.test"})
        expect(response.status_code, 200, f"{response.status_code} {response.text[:200]}")
        payload = response.json()
        expect(payload.get("mode"), "log", "log 模式应如实回报投递方式")
        expect(payload.get("ok"), False, "log 模式没有真正发信，ok 必须为 false")
        expect_true(
            "未真正发信" in str(payload.get("message")),
            f"文案应说明没有真正发信：{payload.get('message')!r}",
        )

    check("邮件测试（log 模式）→ 如实回报未投递", _mail_probe)

    def _audit_visible() -> None:
        response = admin_client.get(f"{ADMIN_API}/audit-logs", params={"limit": 100})
        expect(response.status_code, 200, f"{response.status_code} {response.text[:120]}")
        actions = {item.get("action") for item in response.json().get("items", [])}
        for wanted in ("coupon.create", "settings.mail_probe"):
            expect_true(wanted in actions, f"审计里缺少 {wanted}：{sorted(actions)[:8]}")

    check("审计列表含优惠码与邮件测试留痕", _audit_visible)

    old_audit_id = _seed_old_audit_row(app, action="smoke.legacy")
    expect_true(bool(old_audit_id), "前置失败：旧审计行没有写入")

    def _audit_purge_zero_rejected() -> None:
        response = admin_client.delete(f"{ADMIN_API}/audit-logs", params={"older_than_days": 0})
        expect(response.status_code, 400, f"{response.status_code} {response.text[:120]}")

    check("older_than_days=0 → 400", _audit_purge_zero_rejected)

    def _audit_purge_cutoff() -> None:
        response = admin_client.delete(f"{ADMIN_API}/audit-logs", params={"older_than_days": 1})
        expect(response.status_code, 200, f"{response.status_code} {response.text[:200]}")
        expect_true(int(response.json().get("deleted") or 0) >= 1, "应至少清掉那条三天前的旧行")
        actions = _audit_actions(app)
        expect_true("smoke.legacy" not in actions, "三天前的旧审计行应被清掉")
        expect_true("audit.purge" in actions, "清理动作本身必须留痕")
        expect_true("settings.mail_probe" in actions, "清理截止线之前的近期行不得被误删")

    check("按天数清理：清旧行、留近期行、自身留痕", _audit_purge_cutoff)


if __name__ == "__main__":
    main()
