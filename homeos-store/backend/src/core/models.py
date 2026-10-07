"""授权商店服务的数据模型。
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
    and_,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .models_engagement import (
    DEFAULT_SUPPORT_EMAIL,
    AccountSession,
    AuditLog,
    Coupon,
    CouponRedemption,
    DeviceReleaseEvent,
    EmailVerification,
    LicenseNonce,
    LicenseSession,
    LoginAttempt,
    OrderRefund,
    RecoveryToken,
    ReferralLedger,
    ReferralWallet,
    ReferralWithdrawal,
    Release,
    StoreSetting,
    _id,
)
from ..core.database import Base
from ..security.security import utcnow


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    #: 登录用账号名（与主应用口径一致）；老账号可为空，仅靠邮箱登录。
    #: 购买 / 发码 / 授权归属仍以 ``email`` 为主线，账号名只用于登录与展示。
    username: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)
    referral_code: Mapped[str | None] = mapped_column(String(16), unique=True, index=True)
    referred_by_account_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("accounts.id", ondelete="SET NULL"), index=True
    )
    referral_bound_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    customer: Mapped[Customer | None] = relationship(
        back_populates="account", uselist=False, cascade="all, delete-orphan"
    )


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


class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    name: Mapped[str] = mapped_column(String(255))
    product_code: Mapped[str] = mapped_column(String(64), default="homeos", index=True)
    price_cents: Mapped[int] = mapped_column(Integer, default=0)
    original_price_cents: Mapped[int | None] = mapped_column(Integer)
    is_full_price: Mapped[bool] = mapped_column(Boolean, default=False)
    validity_days: Mapped[int | None] = mapped_column(Integer)
    product_type: Mapped[str] = mapped_column(String(32), default="base")
    #: 商品版本/版本名（如「家庭版」「专业版」）。版本的本质就是一组功能码 + 展示信息。
    edition: Mapped[str | None] = mapped_column(String(64))
    feature_codes_json: Mapped[str] = mapped_column(Text, default="[]")
    included_product_ids_json: Mapped[str] = mapped_column(Text, default="[]")
    package_contents_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    note: Mapped[str | None] = mapped_column(String(512))
    display_description: Mapped[str | None] = mapped_column(String(512))
    badge_text: Mapped[str | None] = mapped_column(String(64))
    featured: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=100)
    fulfillment_mode: Mapped[str] = mapped_column(String(32), default="automatic")
    stock_quantity: Mapped[int | None] = mapped_column(Integer)
    reserved_stock: Mapped[int] = mapped_column(Integer, default=0)
    requires_license: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    images: Mapped[list[ProductImage]] = relationship(
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


class Order(Base):
    __tablename__ = "orders"

    __table_args__ = (
        Index(
            "uq_orders_pending_per_account",
            "account_id",
            unique=True,
            sqlite_where=text("status = 'pending' AND account_id IS NOT NULL"),
        ),
        Index("ix_orders_status_expires", "status", "expires_at"),
        Index("ix_orders_status_product", "status", "product_id"),
    )

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
    order_type: Mapped[str] = mapped_column(String(32), default="base", index=True)
    license_action: Mapped[str] = mapped_column(String(32), default="issue")
    target_license_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("licenses.id", ondelete="SET NULL"), index=True
    )
    license_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("licenses.id", ondelete="SET NULL"), index=True
    )
    license_state_before_json: Mapped[str] = mapped_column(Text, default="")
    original_amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    discount_cents: Mapped[int] = mapped_column(Integer, default=0)
    amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    coupon_code: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    fulfillment_mode: Mapped[str] = mapped_column(String(32), default="automatic")
    payment_provider: Mapped[str] = mapped_column(String(32), default="", server_default="")
    payment_payload_json: Mapped[str] = mapped_column(Text, default="{}")
    payment_trade_no: Mapped[str | None] = mapped_column(String(128))
    refund_amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    refund_trade_no: Mapped[str | None] = mapped_column(String(128))
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)
    review_note: Mapped[str] = mapped_column(String(255), default="")
    manual_settlement: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    referral_reward_points_centi: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0"
    )
    license_email_sent_at: Mapped[datetime | None] = mapped_column(DateTime)
    license_email_error: Mapped[str] = mapped_column(
        String(255), default="", server_default=text("''")
    )
    license_email_attempts: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0"
    )
    fulfillment_attempts: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime)
    fulfilled_at: Mapped[datetime | None] = mapped_column(DateTime)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime)
    channel_closed_at: Mapped[datetime | None] = mapped_column(DateTime)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime)
    stock_reservation_released_at: Mapped[datetime | None] = mapped_column(DateTime)

    license: Mapped[License | None] = relationship(
        "License", foreign_keys=[license_id], post_update=True
    )


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
    order_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("orders.id", ondelete="SET NULL"), index=True
    )
    product_name: Mapped[str] = mapped_column(String(255), default="")
    product_type: Mapped[str] = mapped_column(String(32), default="base")
    #: 签发时固化的商品功能码快照；心跳/续租以此为准，不跟随商品后续 PATCH。
    feature_codes_json: Mapped[str] = mapped_column(
        Text, default="[]", server_default="[]"
    )
    price_cents: Mapped[int] = mapped_column(Integer, default=0)
    validity_days: Mapped[int | None] = mapped_column(Integer)
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

    __table_args__ = (
        Index("ix_licenses_product_active", "product_id", "active"),
    )

    binding: Mapped[DeviceBinding | None] = relationship(
        back_populates="license", uselist=False, cascade="all, delete-orphan"
    )
    entitlements: Mapped[list[Entitlement]] = relationship(
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
    product_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("products.id", ondelete="SET NULL"), index=True
    )
    product_name: Mapped[str] = mapped_column(String(255), default="")
    product_type: Mapped[str] = mapped_column(String(32), default="module")
    feature_code: Mapped[str] = mapped_column(String(64), index=True)
    source_order_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("orders.id", ondelete="SET NULL"), index=True
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    license: Mapped[License] = relationship(back_populates="entitlements")

    __table_args__ = (
        Index(
            "uq_entitlements_license_feature",
            "license_id",
            "feature_code",
            unique=True,
        ),
    )


class DeviceBinding(Base):
    __tablename__ = "device_bindings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    license_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("licenses.id", ondelete="CASCADE"), index=True
    )
    instance_id: Mapped[str] = mapped_column(String(128), index=True)
    client_version: Mapped[str] = mapped_column(String(32), default="")
    #: 激活时客户端上报的本机账号名（「授权用户增设账户名」）；旧客户端为空。
    account_name: Mapped[str | None] = mapped_column(String(255))
    last_ip: Mapped[str | None] = mapped_column(String(64))
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    activated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime)
    released_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    license: Mapped[License] = relationship(back_populates="binding")

    @property
    def is_live(self) -> bool:
        """这一行现在还算不算「绑定着这台设备」。
        """
        return bool(self.active) and self.released_at is None

    @classmethod
    def live_clause(cls):
        """``is_live`` 的 SQL 形态：属性不能在 ``WHERE`` 里判，查询用这个。
        """
        return and_(cls.active.is_(True), cls.released_at.is_(None))

    @classmethod
    def liveness_order(cls):
        """从多行绑定里**挑「当前那行」**的 ``ORDER BY`` 口径，按优先级从高到低。
        """
        return (
            cls.released_at.is_(None).desc(),
            cls.active.desc(),
            cls.activated_at.desc(),
        )

    __table_args__ = (
        Index(
            "uq_device_bindings_license_instance",
            "license_id",
            "instance_id",
            unique=True,
        ),
    )

__all__ = [
    'DEFAULT_SUPPORT_EMAIL',
    'Account',
    'AccountSession',
    'AuditLog',
    'Coupon',
    'CouponRedemption',
    'Customer',
    'DeviceBinding',
    'DeviceReleaseEvent',
    'EmailVerification',
    'Entitlement',
    'License',
    'LicenseNonce',
    'LicenseSession',
    'LoginAttempt',
    'Order',
    'OrderRefund',
    'Product',
    'ProductImage',
    'RecoveryToken',
    'ReferralLedger',
    'ReferralWallet',
    'ReferralWithdrawal',
    'Release',
    'StoreSetting',
    '_id',
]
