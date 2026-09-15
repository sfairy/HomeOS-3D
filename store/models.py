"""授权商店服务的数据模型。

全部主键使用 UUID4 字符串，时间统一存 naive UTC（SQLite 友好），
序列化时再按参考站风格格式化为 ISO 字符串。
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from store.database import Base
from store.security import new_uuid, utcnow


def _id() -> str:
    return new_uuid()


# --------------------------------------------------------------------------- #
# 站点配置
# --------------------------------------------------------------------------- #
class StoreSetting(Base):
    """站点级运行时配置（单例，id 固定为 1）。"""

    __tablename__ = "store_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    site_name: Mapped[str] = mapped_column(String(128), default="HomeOS 授权中心")
    site_title: Mapped[str] = mapped_column(String(256), default="HomeOS 授权中心")
    description: Mapped[str] = mapped_column(String(512), default="注册账号、购买授权与管理激活设备")
    announcement: Mapped[str] = mapped_column(Text, default="")
    support_email: Mapped[str] = mapped_column(String(255), default="")
    #: 默认值须与 site_settings.DEFAULT_LOGO_URL 保持一致（留空时回落到那里）
    logo_url: Mapped[str] = mapped_column(String(512), default="/store-static/homeos-mark.svg")
    maintenance_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    maintenance_message: Mapped[str] = mapped_column(String(512), default="系统正在升级维护，请稍后再试。")

    #: 空字符串 = 跟随 STORE_PAYMENT_PROVIDER；非空 = 在 /admin 里显式指定，优先级更高
    payment_provider: Mapped[str] = mapped_column(String(32), default="")
    payment_display_name: Mapped[str] = mapped_column(String(64), default="")
    payment_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    payment_transaction_description: Mapped[str] = mapped_column(String(128), default="HomeOS 授权")
    payment_merchant_order_template: Mapped[str] = mapped_column(String(128), default="{{time}}-{{email}}")

    referral_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    referral_rate_percent: Mapped[float] = mapped_column(default=10.0)
    referral_withdrawal_fee_percent: Mapped[float] = mapped_column(default=1.0)
    referral_withdrawal_min_points: Mapped[float] = mapped_column(default=100.0)
    referral_qq_group: Mapped[str] = mapped_column(String(64), default="")
    referral_qq_url: Mapped[str] = mapped_column(String(512), default="")

    device_release_cooldown_seconds: Mapped[int] = mapped_column(Integer, default=28800)

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


# --------------------------------------------------------------------------- #
# 账号
# --------------------------------------------------------------------------- #
class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_device_release_at: Mapped[datetime | None] = mapped_column(DateTime)
    referral_code: Mapped[str | None] = mapped_column(String(16), unique=True, index=True)
    referred_by_account_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("accounts.id", ondelete="SET NULL")
    )
    referral_bound_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    customer: Mapped["Customer | None"] = relationship(
        back_populates="account", uselist=False, cascade="all, delete-orphan"
    )


class AccountSession(Base):
    __tablename__ = "account_sessions"

    id_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    is_admin_session: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))


class EmailVerification(Base):
    __tablename__ = "email_verifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    email: Mapped[str] = mapped_column(String(255), index=True)
    purpose: Mapped[str] = mapped_column(String(32), default="register")
    code_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    __table_args__ = (Index("ix_email_verifications_email_purpose", "email", "purpose"),)


class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    scope: Mapped[str] = mapped_column(String(255), index=True)
    succeeded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


# --------------------------------------------------------------------------- #
# 客户（与账号 1:1，但保持独立实体，对齐参考站的 customerId）
# --------------------------------------------------------------------------- #
class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    account_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("accounts.id", ondelete="CASCADE"), unique=True, index=True
    )
    email: Mapped[str] = mapped_column(String(255), index=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    account: Mapped[Account] = relationship(back_populates="customer")


# --------------------------------------------------------------------------- #
# 商品
# --------------------------------------------------------------------------- #
class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    name: Mapped[str] = mapped_column(String(255))
    product_code: Mapped[str] = mapped_column(String(64), default="homeos", index=True)
    price_cents: Mapped[int] = mapped_column(Integer, default=0)
    original_price_cents: Mapped[int | None] = mapped_column(Integer)
    is_full_price: Mapped[bool] = mapped_column(Boolean, default=False)
    validity_days: Mapped[int | None] = mapped_column(Integer)
    #: base | module | package | addon
    product_type: Mapped[str] = mapped_column(String(32), default="base")
    feature_codes_json: Mapped[str] = mapped_column(Text, default="[]")
    included_product_ids_json: Mapped[str] = mapped_column(Text, default="[]")
    package_contents_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    note: Mapped[str | None] = mapped_column(String(512))
    display_description: Mapped[str | None] = mapped_column(String(512))
    badge_text: Mapped[str | None] = mapped_column(String(64))
    featured: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=100)
    #: automatic | manual
    fulfillment_mode: Mapped[str] = mapped_column(String(32), default="automatic")
    stock_quantity: Mapped[int | None] = mapped_column(Integer)
    reserved_stock: Mapped[int] = mapped_column(Integer, default=0)
    #: 增量包必须绑定在已有永久授权上
    requires_license: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )


class ProductImage(Base):
    __tablename__ = "product_images"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    product_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("products.id", ondelete="CASCADE"), unique=True, index=True
    )
    path: Mapped[str] = mapped_column(String(512))
    version: Mapped[str] = mapped_column(String(32), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    product: Mapped[Product] = relationship(back_populates="images")


# --------------------------------------------------------------------------- #
# 优惠码
# --------------------------------------------------------------------------- #
class Coupon(Base):
    __tablename__ = "coupons"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    description: Mapped[str] = mapped_column(String(255), default="")
    #: percent | fixed
    discount_type: Mapped[str] = mapped_column(String(16), default="percent")
    percent: Mapped[float] = mapped_column(default=0.0)
    amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    min_amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    max_redemptions: Mapped[int | None] = mapped_column(Integer)
    redeemed_count: Mapped[int] = mapped_column(Integer, default=0)
    per_account_limit: Mapped[int] = mapped_column(Integer, default=1)
    applicable_product_ids_json: Mapped[str] = mapped_column(Text, default="[]")
    starts_at: Mapped[datetime | None] = mapped_column(DateTime)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class CouponRedemption(Base):
    __tablename__ = "coupon_redemptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    coupon_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("coupons.id", ondelete="CASCADE"), index=True
    )
    account_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    order_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("orders.id", ondelete="SET NULL"))
    discount_cents: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


# --------------------------------------------------------------------------- #
# 订单
# --------------------------------------------------------------------------- #
class Order(Base):
    __tablename__ = "orders"

    #: pending | paid | fulfilled | expired | cancelled | refunded
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    order_no: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    lookup_token: Mapped[str] = mapped_column(String(64), default="", index=True)
    account_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("accounts.id", ondelete="SET NULL"), index=True
    )
    customer_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("customers.id", ondelete="SET NULL"), index=True
    )
    email: Mapped[str] = mapped_column(String(255), index=True)
    product_id: Mapped[str] = mapped_column(String(36), ForeignKey("products.id"), index=True)
    product_name: Mapped[str] = mapped_column(String(255), default="")
    product_type: Mapped[str] = mapped_column(String(32), default="base")
    #: base | addon | package
    order_type: Mapped[str] = mapped_column(String(32), default="base", index=True)
    #: issue | patch
    license_action: Mapped[str] = mapped_column(String(32), default="issue")
    target_license_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("licenses.id", ondelete="SET NULL")
    )
    license_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("licenses.id", ondelete="SET NULL"))
    original_amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    discount_cents: Mapped[int] = mapped_column(Integer, default=0)
    amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    coupon_code: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    fulfillment_mode: Mapped[str] = mapped_column(String(32), default="automatic")
    payment_provider: Mapped[str] = mapped_column(String(32), default="mock")
    payment_payload_json: Mapped[str] = mapped_column(Text, default="{}")
    payment_trade_no: Mapped[str | None] = mapped_column(String(128))
    referral_reward_points: Mapped[float] = mapped_column(default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime)
    fulfilled_at: Mapped[datetime | None] = mapped_column(DateTime)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime)

    #: Order 与 License 互相持有外键，必须显式指定 join 条件并用 post_update 打破写入循环
    license: Mapped["License | None"] = relationship(
        "License", foreign_keys=[license_id], post_update=True
    )


# --------------------------------------------------------------------------- #
# 授权与权益
# --------------------------------------------------------------------------- #
class License(Base):
    __tablename__ = "licenses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    activation_code: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    code_hint: Mapped[str] = mapped_column(String(32), default="")
    customer_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("customers.id", ondelete="CASCADE"), index=True
    )
    account_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("accounts.id", ondelete="SET NULL"), index=True
    )
    product_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("products.id", ondelete="SET NULL"))
    order_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("orders.id", ondelete="SET NULL"))
    product_name: Mapped[str] = mapped_column(String(255), default="")
    product_type: Mapped[str] = mapped_column(String(32), default="base")
    price_cents: Mapped[int] = mapped_column(Integer, default=0)
    validity_days: Mapped[int | None] = mapped_column(Integer)
    #: payment_automatic | manual
    issuance_source: Mapped[str] = mapped_column(String(32), default="payment_automatic")
    user_label: Mapped[str | None] = mapped_column(String(64))
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)
    lease_sequence: Mapped[int] = mapped_column(Integer, default=0)
    lease_id: Mapped[str | None] = mapped_column(String(36))
    issued_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    access_started_at: Mapped[datetime | None] = mapped_column(DateTime)
    access_expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    binding: Mapped["DeviceBinding | None"] = relationship(
        back_populates="license", uselist=False, cascade="all, delete-orphan"
    )
    entitlements: Mapped[list["Entitlement"]] = relationship(
        back_populates="license", cascade="all, delete-orphan"
    )


class Entitlement(Base):
    __tablename__ = "entitlements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    customer_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("customers.id", ondelete="CASCADE"), index=True
    )
    license_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("licenses.id", ondelete="CASCADE"), index=True
    )
    product_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("products.id", ondelete="SET NULL"))
    product_name: Mapped[str] = mapped_column(String(255), default="")
    product_type: Mapped[str] = mapped_column(String(32), default="module")
    feature_code: Mapped[str] = mapped_column(String(64), index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    license: Mapped[License] = relationship(back_populates="entitlements")


# --------------------------------------------------------------------------- #
# 设备绑定与租约
# --------------------------------------------------------------------------- #
class DeviceBinding(Base):
    __tablename__ = "device_bindings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    license_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("licenses.id", ondelete="CASCADE"), index=True
    )
    instance_id: Mapped[str] = mapped_column(String(128), index=True)
    client_version: Mapped[str] = mapped_column(String(32), default="")
    last_ip: Mapped[str | None] = mapped_column(String(64))
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    activated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime)
    released_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    license: Mapped[License] = relationship(back_populates="binding")

    __table_args__ = (
        UniqueConstraint("license_id", "instance_id", name="uq_device_bindings_license_instance"),
    )


class LicenseSession(Base):
    __tablename__ = "license_sessions"

    id_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(36), default=_id)
    binding_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("device_bindings.id", ondelete="CASCADE"), index=True
    )
    license_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("licenses.id", ondelete="CASCADE"), index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_used_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class RecoveryToken(Base):
    __tablename__ = "recovery_tokens"

    id_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    binding_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("device_bindings.id", ondelete="CASCADE"), index=True
    )
    license_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("licenses.id", ondelete="CASCADE"), index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class DeviceReleaseEvent(Base):
    __tablename__ = "device_release_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    license_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("licenses.id", ondelete="CASCADE"), index=True
    )
    account_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("accounts.id", ondelete="SET NULL"))
    instance_id: Mapped[str | None] = mapped_column(String(128))
    #: self_service | admin
    source: Mapped[str] = mapped_column(String(32), default="self_service")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


# --------------------------------------------------------------------------- #
# 邀请与积分
# --------------------------------------------------------------------------- #
class ReferralWallet(Base):
    __tablename__ = "referral_wallets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    account_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("accounts.id", ondelete="CASCADE"), unique=True, index=True
    )
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    balance: Mapped[float] = mapped_column(default=0.0)
    frozen: Mapped[float] = mapped_column(default=0.0)
    earned: Mapped[float] = mapped_column(default=0.0)
    withdrawn: Mapped[float] = mapped_column(default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class ReferralLedger(Base):
    __tablename__ = "referral_ledger"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    wallet_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("referral_wallets.id", ondelete="CASCADE"), index=True
    )
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id", ondelete="CASCADE"), index=True)
    #: reward | freeze | withdrawal | release | reversal
    kind: Mapped[str] = mapped_column(String(32), index=True)
    delta: Mapped[float] = mapped_column(default=0.0)
    frozen_delta: Mapped[float] = mapped_column(default=0.0)
    balance_after: Mapped[float] = mapped_column(default=0.0)
    frozen_after: Mapped[float] = mapped_column(default=0.0)
    note: Mapped[str] = mapped_column(String(255), default="")
    reference: Mapped[str | None] = mapped_column(String(128))
    order_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("orders.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class ReferralWithdrawal(Base):
    __tablename__ = "referral_withdrawals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    wallet_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("referral_wallets.id", ondelete="CASCADE"), index=True
    )
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id", ondelete="CASCADE"), index=True)
    request_key: Mapped[str] = mapped_column(String(64), unique=True)
    points: Mapped[float] = mapped_column(default=0.0)
    fee_percent: Mapped[float] = mapped_column(default=0.0)
    fee_points: Mapped[float] = mapped_column(default=0.0)
    net_points: Mapped[float] = mapped_column(default=0.0)
    qq: Mapped[str] = mapped_column(String(32), default="")
    #: pending | paid | rejected
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    note: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)


# --------------------------------------------------------------------------- #
# 版本发布与审计
# --------------------------------------------------------------------------- #
class Release(Base):
    __tablename__ = "releases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    product: Mapped[str] = mapped_column(String(64), default="homeos", index=True)
    channel: Mapped[str] = mapped_column(String(32), default="docker", index=True)
    version: Mapped[str] = mapped_column(String(32))
    release_date: Mapped[str] = mapped_column(String(32), default="")
    upgrade_notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    __table_args__ = (Index("ix_releases_product_channel_created", "product", "channel", "created_at"),)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    actor: Mapped[str] = mapped_column(String(255), default="system")
    action: Mapped[str] = mapped_column(String(64), index=True)
    target: Mapped[str] = mapped_column(String(255), default="")
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
