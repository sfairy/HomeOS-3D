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


# 账号
class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)
    referral_code: Mapped[str | None] = mapped_column(String(16), unique=True, index=True)
    referred_by_account_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("accounts.id", ondelete="SET NULL")
    )
    referral_bound_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    customer: Mapped[Customer | None] = relationship(
        back_populates="account", uselist=False, cascade="all, delete-orphan"
    )





# 客户（与账号 1:1，但保持独立实体，对齐参考站的 customerId）
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


# 商品
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




# 订单


class Order(Base):
    __tablename__ = "orders"

    #: **每账号最多一笔待支付订单**，由数据库兜底：「先 SELECT 再 INSERT」在并发下
    __table_args__ = (
        Index(
            "uq_orders_pending_per_account",
            "account_id",
            unique=True,
            sqlite_where=text("status = 'pending' AND account_id IS NOT NULL"),
        ),
        #: 过期批扫按 ``status='pending'`` + ``expires_at`` 取最老前 N 条
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
    #: issue | patch | upgrade（同上；``fulfill.py`` 按它决定发新码还是改既有授权）。
    license_action: Mapped[str] = mapped_column(String(32), default="issue")
    target_license_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("licenses.id", ondelete="SET NULL")
    )
    license_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("licenses.id", ondelete="SET NULL"))
    #: 升级 / 增量包履约**之前**那张目标授权的快照（JSON）。它改的是用户**原先
    license_state_before_json: Mapped[str] = mapped_column(Text, default="")
    original_amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    discount_cents: Mapped[int] = mapped_column(Integer, default=0)
    amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    coupon_code: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    fulfillment_mode: Mapped[str] = mapped_column(String(32), default="automatic")
    #: 下单时**冻结**在本行上的支付渠道名。默认值必须是「没有渠道」而不是某个具体渠道：
    payment_provider: Mapped[str] = mapped_column(String(32), default="", server_default="")
    payment_payload_json: Mapped[str] = mapped_column(Text, default="{}")
    payment_trade_no: Mapped[str | None] = mapped_column(String(128))
    #: **累计**已退回到用户的金额（分）。后台退款会真的调用支付渠道，这里是对账依据；
    refund_amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    refund_trade_no: Mapped[str | None] = mapped_column(String(128))
    #: 需要人工复核：目前唯一的来源是「订单已超时关闭后支付才到账」——钱收了、
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)
    review_note: Mapped[str] = mapped_column(String(255), default="")
    #: 这笔订单的「已支付」是**人拍的板**：后台「标记支付 / 履约」会给未收款订单
    manual_settlement: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    #: 这笔订单给邀请人发的奖励，单位**厘**（1 积分 = 100 厘），与钱包/流水同一口径。
    referral_reward_points_centi: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0"
    )
    #: 发码邮件的投递标记。``license_email_sent_at`` 非空 = 激活码已经发到买家邮箱；
    #: 领取标记靠 attempts 的条件自增实现（见 commerce/delivery.py），所以异步通知、
    #: 前端轮询、后台巡检同时触发时也只会真发一封。
    license_email_sent_at: Mapped[datetime | None] = mapped_column(DateTime)
    license_email_error: Mapped[str] = mapped_column(
        String(255), default="", server_default=text("''")
    )
    license_email_attempts: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0"
    )
    #: 履约失败后被巡检自动重试的次数（见 payments/reconcile.py）。
    fulfillment_attempts: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime)
    fulfilled_at: Mapped[datetime | None] = mapped_column(DateTime)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime)
    #: 渠道侧交易已关闭的时刻（``alipay.trade.close`` 成功或确认交易已不存在）。
    channel_closed_at: Mapped[datetime | None] = mapped_column(DateTime)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime)
    #: 这一单占用的库存**是否已经归还**（归还时刻）。空值 = 仍然占着。必须持久化：
    stock_reservation_released_at: Mapped[datetime | None] = mapped_column(DateTime)

    #: Order 与 License 互相持有外键，必须显式指定 join 条件并用 post_update 打破写入循环
    license: Mapped[License | None] = relationship(
        "License", foreign_keys=[license_id], post_update=True
    )


# 授权与权益
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
    #: 被这张授权「改过」的那张订单。退款流程按它反查（``License.order_id == order.id``），
    order_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("orders.id", ondelete="SET NULL"), index=True
    )
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

    __table_args__ = (
        #: 商品统计的「拥有客户数」是 ``WHERE active = 1 GROUP BY product_id`` 上的
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
    product_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("products.id", ondelete="SET NULL"))
    product_name: Mapped[str] = mapped_column(String(255), default="")
    product_type: Mapped[str] = mapped_column(String(32), default="module")
    feature_code: Mapped[str] = mapped_column(String(64), index=True)
    #: 授予这条权益的那张订单。退款按它精确撤销：只看 (product_id, license_id) 的话，
    #: 同一主授权上重复购买同一增量包时，退第二单会误杀第一单（仍然有效）的权益。
    source_order_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("orders.id", ondelete="SET NULL")
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    license: Mapped[License] = relationship(back_populates="entitlements")

    __table_args__ = (
        # 同一张授权下同一个功能码只能有一条：``features_for`` 是「任一条生效就放行」，
        Index(
            "uq_entitlements_license_feature",
            "license_id",
            "feature_code",
            unique=True,
        ),
    )


# 设备绑定与租约
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
        # 用 unique Index 而不是 UniqueConstraint：表级约束在存量库上补不了
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
