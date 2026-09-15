"""临时探针：验证商店后台新增的数据维护入口（跑完即删）。"""

from __future__ import annotations

import asyncio
import tempfile
from datetime import timedelta
from pathlib import Path

import httpx
from sqlalchemy import func, select

from store.app import create_app
from store.config import load_settings
from store.models import (
    Account,
    AccountSession,
    AuditLog,
    Coupon,
    Customer,
    DeviceBinding,
    Entitlement,
    License,
    LicenseSession,
    Product,
    ProductImage,
    RecoveryToken,
    ReferralLedger,
    Release,
    utcnow,
)
from store.security import hash_password, new_uuid, token_hash
from store.tools.seed import seed_products, seed_release, seed_settings

RESULTS: list[tuple[str, bool, str]] = []


def check(name: str, cond: bool, detail: str = "") -> bool:
    RESULTS.append((name, bool(cond), detail))
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""), flush=True)
    return bool(cond)


async def main() -> int:
    workdir = Path(tempfile.mkdtemp(prefix="hb-admin-probe-"))
    settings = load_settings(
        data_dir=workdir / "data",
        license_keys_dir=workdir / "keys",
        mail_mode="echo",
        expose_verification_code=True,
        payment_provider="mock",
        order_ttl_seconds=120,
        device_release_cooldown_seconds=28800,
    )
    app = create_app(settings)
    database = app.state.database

    admin_email, user_email, victim_email = "a@probe.local", "u@probe.local", "v@probe.local"
    password = "probe-password-2026"
    with database.session() as session:
        seed_settings(session)
        seed_release(session)
        products = seed_products(session)
        base = products["base"]
        admin = Account(
            email=admin_email, password_hash=hash_password(password),
            email_verified_at=utcnow(), is_admin=True, is_active=True,
        )
        user = Account(
            email=user_email, password_hash=hash_password(password),
            email_verified_at=utcnow(), is_active=True,
        )
        victim = Account(
            email=victim_email, password_hash=hash_password(password),
            email_verified_at=utcnow(), is_active=True,
        )
        session.add_all([admin, user, victim])
        session.flush()
        admin_id, user_id, victim_id = admin.id, user.id, victim.id
        for account in (user, victim):
            session.add(Customer(account_id=account.id, email=account.email, name=account.email))
        session.flush()
        victim_customer = session.scalars(
            select(Customer).where(Customer.account_id == victim_id)
        ).first()
        lic = License(
            activation_code="PROBE-AAAA-BBBB-CCCC",
            code_hint="PROBE-****-CCCC",
            customer_id=victim_customer.id,
            account_id=victim_id,
            product_id=base.id,
            product_name=base.name,
            product_type=base.product_type,
            price_cents=base.price_cents,
            validity_days=365,
            issuance_source="manual",
            active=True,
            issued_at=utcnow(),
            access_started_at=utcnow(),
            access_expires_at=utcnow() + timedelta(days=365),
        )
        session.add(lic)
        session.flush()
        license_id = lic.id
        base_product_id = base.id

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://store.test", follow_redirects=True
    ) as client:
        login = await client.post(
            "/store/v1/auth/login", json={"email": admin_email, "password": password}
        )
        check("管理员登录", login.status_code == 200, str(login.status_code))
        A = "/store-admin/v1"

        # ---------------- A. 站点配置 ----------------
        r = await client.put(f"{A}/settings", json={"siteName": "探针店", "bogusField": 1})
        check("配置接口拒绝未知字段(不再静默丢弃)", r.status_code == 422, str(r.status_code))

        r = await client.put(f"{A}/settings", json={"logoUrl": ""})
        logo = (await client.get(f"{A}/settings")).json()["store"]["logoUrl"]
        check("logoUrl 留空回落默认标识", r.status_code == 200 and logo.endswith("homeos-mark.svg"), logo)

        r = await client.put(f"{A}/settings", json={"paymentMerchantOrderTemplate": "HB-{order_no}"})
        got = (await client.get(f"{A}/settings")).json()["payment"]
        check(
            "paymentMerchantOrderTemplate 可写入",
            r.status_code == 200 and got.get("merchantOrderTemplate") == "HB-{order_no}",
            str(got.get("merchantOrderTemplate")),
        )

        # ---------------- B. 优惠码全字段编辑 ----------------
        r = await client.post(
            f"{A}/coupons",
            json={"code": "probe10", "discountType": "percent", "percent": 10,
                  "maxRedemptions": 5, "perAccountLimit": 1, "description": "初版"},
        )
        check("新建优惠码", r.status_code == 200, str(r.status_code))
        coupon_id = r.json()["id"]

        r = await client.patch(
            f"{A}/coupons/{coupon_id}",
            json={"percent": 25, "maxRedemptions": 50, "description": "改过",
                  "expiresAt": (utcnow() + timedelta(days=30)).isoformat()},
        )
        body = r.json()
        check(
            "优惠码可改折扣/名额/有效期/说明",
            r.status_code == 200 and body["percent"] == 25 and body["maxRedemptions"] == 50
            and body["description"] == "改过" and body.get("expiresAt"),
            str({k: body.get(k) for k in ("percent", "maxRedemptions", "description", "expiresAt")}),
        )

        r = await client.patch(f"{A}/coupons/{coupon_id}", json={"discountType": "nonsense"})
        check("优惠码拒绝非法折扣类型", r.status_code == 400, str(r.status_code))

        r = await client.patch(
            f"{A}/coupons/{coupon_id}",
            json={"startsAt": (utcnow() + timedelta(days=10)).isoformat(),
                  "expiresAt": (utcnow() + timedelta(days=1)).isoformat()},
        )
        check("优惠码拒绝开始晚于结束", r.status_code == 400, str(r.status_code))

        # ---------------- C. 账号维护 ----------------
        r = await client.patch(f"{A}/accounts/{admin_id}", json={"isAdmin": False})
        check("不能取消自己的管理员权限", r.status_code == 400, str(r.status_code))
        r = await client.patch(f"{A}/accounts/{admin_id}", json={"isActive": False})
        check("不能停用自己", r.status_code == 400, str(r.status_code))

        r = await client.patch(f"{A}/accounts/{user_id}", json={"email": victim_email})
        check("改邮箱撞车返回冲突", r.status_code == 409, str(r.status_code))

        r = await client.patch(f"{A}/accounts/{user_id}", json={"email": "renamed@probe.local"})
        check(
            "可改账号邮箱",
            r.status_code == 200 and r.json()["email"] == "renamed@probe.local",
            str(r.json().get("email")),
        )
        r = await client.patch(f"{A}/accounts/{user_id}", json={"newPassword": "brand-new-password"})
        check("可重置密码", r.status_code == 200, str(r.status_code))
        with database.session() as session:
            audits = list(session.scalars(select(AuditLog).where(AuditLog.action == "account.update")))
        check(
            "重置密码写入审计且不含明文",
            any("new_password" in (a.detail or "") for a in audits)
            and not any("brand-new-password" in (a.detail or "") for a in audits),
            f"{len(audits)} 条",
        )

        r = await client.patch(f"{A}/accounts/{user_id}", json={"isAdmin": True})
        check("可提升为管理员", r.status_code == 200 and r.json()["isAdmin"] is True)
        r = await client.patch(f"{A}/accounts/{user_id}", json={"isAdmin": False})
        check("可收回管理员(还有别的管理员在)", r.status_code == 200 and r.json()["isAdmin"] is False)

        with database.session() as session:
            session.add(
                AccountSession(
                    id_hash=token_hash("probe-session-token"), account_id=user_id,
                    is_admin_session=False, expires_at=utcnow() + timedelta(days=7),
                    last_seen_at=utcnow(), ip_address="127.0.0.1", user_agent="probe",
                )
            )
        r = await client.patch(f"{A}/accounts/{user_id}", json={"isActive": False})
        with database.session() as session:
            left = session.execute(
                select(func.count(AccountSession.id_hash)).where(
                    AccountSession.account_id == user_id
                )
            ).scalar_one()
        check("停用账号时清空其登录会话", r.status_code == 200 and left == 0, f"剩余 {left}")

        r = await client.delete(f"{A}/accounts/{victim_id}")
        check("有业务数据的账号拒绝删除", r.status_code == 409, f"{r.status_code} {r.text[:120]}")
        r = await client.delete(f"{A}/accounts/{admin_id}")
        check("不能删除自己", r.status_code == 400, str(r.status_code))
        with database.session() as session:
            session.add(
                Account(
                    email="clean@probe.local", password_hash=hash_password(password),
                    email_verified_at=utcnow(), is_active=True,
                )
            )
            session.flush()
            clean_id = session.scalars(
                select(Account.id).where(Account.email == "clean@probe.local")
            ).first()
        r = await client.delete(f"{A}/accounts/{clean_id}")
        check("干净账号可硬删", r.status_code == 200 and r.json()["deleted"] is True, str(r.status_code))

        # ---------------- D. 授权修正 ----------------
        before = (await client.get(f"{A}/licenses")).json()["items"][0]["accessExpiresAt"]
        r = await client.patch(f"{A}/licenses/{license_id}", json={"extendDays": 30})
        check("extendDays 可顺延到期时间", r.status_code == 200, str(r.status_code))
        after = r.json()["accessExpiresAt"]
        check("顺延确实推后了到期时间", after > before, f"{before} -> {after}")

        r = await client.patch(
            f"{A}/licenses/{license_id}", json={"extendDays": 10, "accessExpiresAt": None}
        )
        check("顺延与绝对到期互斥", r.status_code == 400, str(r.status_code))

        r = await client.patch(f"{A}/licenses/{license_id}", json={"accessExpiresAt": None})
        check("到期时间可置空改为永久", r.status_code == 200 and r.json()["accessExpiresAt"] is None)

        r = await client.patch(f"{A}/licenses/{license_id}", json={"validityDays": 30})
        body = r.json()
        check(
            "改 validityDays 会按开始时间重算到期",
            r.status_code == 200 and body["validityDays"] == 30 and body["accessExpiresAt"],
            f"{body['validityDays']} / {body['accessExpiresAt']}",
        )
        r = await client.patch(f"{A}/licenses/{license_id}", json={"userLabel": "客服备注A"})
        check("可改授权备注", r.status_code == 200 and r.json()["userLabel"] == "客服备注A")

        # ---------------- E. 权益 CRUD ----------------
        r = await client.post(
            f"{A}/entitlements", json={"licenseId": license_id, "featureCode": "module.3d_interaction"}
        )
        check("可新建权益", r.status_code == 200, f"{r.status_code} {r.text[:160]}")
        ent_id = r.json()["id"]

        r = await client.post(
            f"{A}/entitlements", json={"licenseId": license_id, "featureCode": "module.3d_interaction"}
        )
        check("同授权重复功能码被拒", r.status_code == 409, str(r.status_code))

        r = await client.patch(f"{A}/entitlements/{ent_id}", json={"active": False})
        check(
            "可停用权益",
            r.status_code == 200 and r.json()["active"] is False and r.json()["activeFlag"] is False,
        )
        r = await client.patch(f"{A}/entitlements/{ent_id}", json={"active": True, "expiresAt": None})
        check("权益可改回启用并置为永久", r.status_code == 200 and r.json()["expiresAt"] is None)

        r = await client.get(f"{A}/entitlements?license_id={license_id}")
        check("权益列表可按授权过滤", r.status_code == 200 and len(r.json()["items"]) == 1)
        r = await client.delete(f"{A}/entitlements/{ent_id}")
        check("可删除权益", r.status_code == 200 and r.json()["deleted"] is True)

        # ---------------- F. 积分人工调账 ----------------
        r = await client.post(
            f"{A}/referral-wallets/{victim_id}/adjust", json={"delta": 100, "note": "客服补偿"}
        )
        body = r.json()
        check("可人工加分", r.status_code == 200 and body["balance"] == "100.00", str(body))
        with database.session() as session:
            entry = session.scalars(
                select(ReferralLedger).where(ReferralLedger.account_id == victim_id)
            ).first()
            wallet_balance = float(
                session.execute(
                    select(ReferralLedger.balance_after)
                    .where(ReferralLedger.account_id == victim_id)
                    .order_by(ReferralLedger.created_at.desc())
                ).scalars().first()
                or 0
            )
        check(
            "调账写入账本且流水余额一致",
            entry is not None and entry.kind == "manual_adjust" and wallet_balance == 100.0,
            f"{entry.kind if entry else None} / {wallet_balance}",
        )

        r = await client.post(f"{A}/referral-wallets/{victim_id}/adjust", json={"delta": 5})
        check("调账必须填备注", r.status_code == 400, str(r.status_code))
        r = await client.post(
            f"{A}/referral-wallets/{victim_id}/adjust", json={"delta": -500, "note": "扣回"}
        )
        check("调账不允许变成负余额", r.status_code == 400, str(r.status_code))
        r = await client.post(
            f"{A}/referral-wallets/{victim_id}/adjust", json={"delta": 0, "note": "空操作"}
        )
        check("调账拒绝 0 变动", r.status_code == 400, str(r.status_code))

        # ---------------- G. 商品图片删除 ----------------
        png = bytes.fromhex(
            "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
            "1f15c4890000000a49444154789c6300010000050001"
            "0d0a2db40000000049454e44ae426082"
        )
        r = await client.post(
            f"{A}/products/{base_product_id}/image",
            files={"file": ("p.png", png, "image/png")},
        )
        check("上传商品图片", r.status_code == 200, str(r.status_code))
        with database.session() as session:
            image = session.scalars(
                select(ProductImage).where(ProductImage.product_id == base_product_id)
            ).first()
            disk_path = settings.product_images_dir / image.path
        check("图片文件已落盘", disk_path.is_file(), str(disk_path))
        r = await client.delete(f"{A}/products/{base_product_id}/image")
        check(
            "可删除商品图片",
            r.status_code == 200 and r.json()["removed"] and not disk_path.exists(),
            str(r.json()),
        )
        r = await client.delete(f"{A}/products/{base_product_id}/image")
        check("重复删除返回 404", r.status_code == 404, str(r.status_code))

        # ---------------- H. 绑定删除与级联 ----------------
        with database.session() as session:
            binding = DeviceBinding(
                license_id=license_id, instance_id="probe-instance-0001",
                client_version="0.6.0", activated_at=utcnow(),
            )
            session.add(binding)
            session.flush()
            binding_id = binding.id
            session.add(
                LicenseSession(
                    id_hash=token_hash("ls"), session_id=new_uuid(), binding_id=binding_id,
                    license_id=license_id, expires_at=utcnow() + timedelta(days=1),
                    last_used_at=utcnow(),
                )
            )
            session.add(
                RecoveryToken(
                    id_hash=token_hash("rt"), binding_id=binding_id, license_id=license_id,
                    expires_at=utcnow() + timedelta(days=1),
                )
            )
        r = await client.delete(f"{A}/bindings/{binding_id}")
        with database.session() as session:
            sess_left = session.execute(
                select(func.count(LicenseSession.id_hash)).where(
                    LicenseSession.binding_id == binding_id
                )
            ).scalar_one()
            tok_left = session.execute(
                select(func.count(RecoveryToken.id_hash)).where(
                    RecoveryToken.binding_id == binding_id
                )
            ).scalar_one()
        check(
            "可删除绑定并级联清理会话/找回令牌",
            r.status_code == 200 and sess_left == 0 and tok_left == 0,
            f"{r.status_code} / 会话{sess_left} 令牌{tok_left}",
        )

        # ---------------- I. 版本记录修正 ----------------
        with database.session() as session:
            rel = session.scalars(select(Release).limit(1)).first()
            release_id = rel.id
        r = await client.patch(
            f"{A}/releases/{release_id}", json={"version": "0.6.1", "upgradeNotes": "修正说明"}
        )
        check(
            "可修正版本记录",
            r.status_code == 200 and r.json()["version"] == "0.6.1"
            and r.json()["upgradeNotes"] == "修正说明",
            str(r.json().get("version")),
        )

        # ---------------- J. 只读数据面 ----------------
        for path, label in [
            ("/sessions", "会话"), ("/referral-ledger", "积分流水"),
            ("/coupon-redemptions", "优惠码核销"), ("/customers", "客户档案"),
            ("/login-attempts", "登录尝试"), ("/email-verifications", "邮箱验证"),
            ("/device-release-events", "解绑历史"),
        ]:
            r = await client.get(f"{A}{path}")
            check(f"只读列表 {path}（{label}）", r.status_code == 200 and "items" in r.json(),
                  str(r.status_code))

        r = await client.get(f"{A}/login-attempts?limit=5")
        body = r.json()
        check(
            "登录尝试不泄露密码字段",
            body["items"] and all(
                set(item) == {"id", "scope", "succeeded", "createdAt"} for item in body["items"]
            ),
            str(body["items"][:1]),
        )
        r = await client.get(f"{A}/sessions")
        items = r.json()["items"]
        check(
            "会话列表只给出哈希前 12 位",
            all(len(item["idHashHint"]) <= 12 for item in items),
            str([i["idHashHint"] for i in items][:2]),
        )

    failed = [name for name, ok, _ in RESULTS if not ok]
    print("\n" + "=" * 60)
    print(f"共 {len(RESULTS)} 项，失败 {len(failed)} 项")
    for name in failed:
        print(f"  ✗ {name}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
