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
    and_,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.store.core.database import Base
from apps.store.security.security import utcnow

from .models_engagement import (
    AccountSession,
    AuditLog,
    CashierTicket,
    Coupon,
    CouponRedemption,
    DEFAULT_SUPPORT_EMAIL,
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

    customer: Mapped["Customer | None"] = relationship(
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




# 订单


class Order(Base):
    __tablename__ = "orders"

    #: **每账号最多一笔待支付订单**，由数据库兜底：「先 SELECT 再 INSERT」在并发下
    #: 会同时看到 ``pending`` 为空而开出两笔单。用**部分**唯一索引只覆盖
    #: ``status='pending'``（历史订单允许多笔）；游客单 ``account_id`` 为 NULL 不受约束。
    __table_args__ = (
        Index(
            "uq_orders_pending_per_account",
            "account_id",
            unique=True,
            sqlite_where=text("status = 'pending' AND account_id IS NOT NULL"),
        ),
        #: 过期批扫按 ``status='pending'`` + ``expires_at`` 取最老前 N 条
        #: （``apps/store/commerce/expiry.py`` 的 ``ORDER BY expires_at LIMIT n``）。有它
        #: LIMIT 才是真「取够就走」，否则 SQLite 要读全部 pending 行排序。
        Index("ix_orders_status_expires", "status", "expires_at"),
        #: 商品统计 ``WHERE status='fulfilled' GROUP BY product_id`` 的覆盖索引，
        #: 过滤列与分组列都在索引里，聚合不必回表。不替换 ``product_id`` 单列索引：
        #: 存量库上删索引不是 ``schema_guard``（只做 IF NOT EXISTS）的职责。
        Index("ix_orders_status_product", "status", "product_id"),
    )

    #: pending | paid | fulfilled | expired | cancelled | refunded | payment_failed
    #: 另有 ``fulfillment_failed``：履约过程中抛异常时由管理端标记，等待人工处理。
    #: ``refundAmountCents`` / ``refundTradeNo`` / ``needsReview`` 见 order_payload。
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
    #: base | addon | upgrade | package（值域见 ``apps/store/api/store.py`` 下单时的分支）。
    order_type: Mapped[str] = mapped_column(String(32), default="base", index=True)
    #: issue | patch | upgrade（同上；``fulfill.py`` 按它决定发新码还是改既有授权）。
    license_action: Mapped[str] = mapped_column(String(32), default="issue")
    target_license_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("licenses.id", ondelete="SET NULL")
    )
    license_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("licenses.id", ondelete="SET NULL"))
    #: 升级 / 增量包履约**之前**那张目标授权的快照（JSON）。它改的是用户**原先
    #: 买过还在用**的授权，而 ``License.order_id`` 仍指着最早那单，退款按
    #: ``order_id == order.id`` 找不到；有快照才能还原而非整张作废。空串 = 没改过。
    license_state_before_json: Mapped[str] = mapped_column(Text, default="")
    original_amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    discount_cents: Mapped[int] = mapped_column(Integer, default=0)
    amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    coupon_code: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    fulfillment_mode: Mapped[str] = mapped_column(String(32), default="automatic")
    #: 下单时**冻结**在本行上的支付渠道名。默认值必须是「没有渠道」而不是 ``"mock"``：
    #: 模拟收银台按这一列判定订单能否被标记支付/取消（``api/pages.py:_ensure_mock_order``），
    #: 一旦有代码路径漏填而吃到 ``"mock"`` 默认值，就等于为这笔订单免费发码。
    #: 现网写入点只有 ``api/store.py`` 下单处，显式取自站点配置（默认同为 ``""``）。
    payment_provider: Mapped[str] = mapped_column(String(32), default="", server_default="")
    payment_payload_json: Mapped[str] = mapped_column(Text, default="{}")
    payment_trade_no: Mapped[str | None] = mapped_column(String(128))
    #: **累计**已退回到用户的金额（分）。后台退款会真的调用支付渠道，这里是对账依据；
    #: 只改状态、不留金额记录的话，账目与真实资金流对不上。
    #: 支持多次部分退款后它只增不减，明细见 ``order_refunds``。
    refund_amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    refund_trade_no: Mapped[str | None] = mapped_column(String(128))
    #: 需要人工复核：目前唯一的来源是「订单已超时关闭后支付才到账」——钱收了、
    #: 码也发了，但这件库存早已还给别人，属于刻意保留的例外，必须让运营看到。
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)
    review_note: Mapped[str] = mapped_column(String(255), default="")
    #: 这笔订单的「已支付」是**人拍的板**：后台「标记支付 / 履约」会给未收款订单
    #: 盖上 ``paid_at``，按它汇总营收就凭空多出一笔。置位后仍照常发码但不计入
    #: 营收 KPI（``apps/store/api/admin.py:_billable_money_filter``），后台列表标注。
    manual_settlement: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    #: 这笔订单给邀请人发的奖励，单位**厘**（1 积分 = 100 厘），与钱包/流水同一口径。
    referral_reward_points_centi: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime)
    fulfilled_at: Mapped[datetime | None] = mapped_column(DateTime)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime)
    #: 渠道侧交易已关闭的时刻（``alipay.trade.close`` 成功或确认交易已不存在）。
    #: 本地订单过期/取消**不等于**渠道那笔预下单结束：不主动关单，旧二维码仍能
    #: 付款，钱进来时本地已 expired，只能走「复活单 + 人工复核」。此列兼防重复关单。
    channel_closed_at: Mapped[datetime | None] = mapped_column(DateTime)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime)
    #: 这一单占用的库存**是否已经归还**（归还时刻）。空值 = 仍然占着。必须持久化：
    #: 只看 ``order.status`` 反推，expired 复活成 paid 时会再释放一次，扣掉**别人**
    #: 的预留（放开超卖），``recompute_reserved_stock`` 也会误算；此列是唯一事实来源。
    stock_reservation_released_at: Mapped[datetime | None] = mapped_column(DateTime)

    #: Order 与 License 互相持有外键，必须显式指定 join 条件并用 post_update 打破写入循环
    license: Mapped["License | None"] = relationship(
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
    #: 所以与 ``CouponRedemption`` / ``ReferralLedger`` 的同类列一样需要索引：不加就是
    #: 每次退款扫一遍全表授权。
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
        #: ``COUNT(DISTINCT customer_id)``。``product_id`` 无单列索引，只靠它聚合要
        #: 全表扫；复合索引让过滤列与分组列都进索引（回表只剩 ``customer_id``）。
        Index("ix_licenses_product_active", "product_id", "active"),
    )

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

    __table_args__ = (
        # 同一张授权下同一个功能码只能有一条：``features_for`` 是「任一条生效就放行」，
        # 允许重复行会让「这条功能什么时候到期」失去唯一答案。后台新增权益时也查重，
        # 但那是 check-then-act（并发下挡不住），唯一性必须由库来兜。
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

        判据单点收在这里，是因为读侧原先分成了两套：心跳与租约恢复判的是
        ``active AND released_at IS NULL``，而 ``device_payload`` 只判 ``active``。
        正常路径上两个字段一起动（``release`` 两个都写、``ensure_binding`` 两个都复位），
        所以一直没出问题；但重复绑定被合并时（``schema_guard._DEDUPE_BEFORE_UNIQUE``
        用的是 ``active=any_true`` + ``released_at=latest``）两套判据可以分叉，症状是
        「后台说绑着、客户端却已被吊销」—— 与「解绑了还显示绑着」是同一个 bug 的两面。

        判据改动只发生在这一处：要收紧或放宽都改这里，别在调用点各判各的。
        """
        return bool(self.active) and self.released_at is None

    @classmethod
    def live_clause(cls):
        """``is_live`` 的 SQL 形态：属性不能在 ``WHERE`` 里判，查询用这个。

        与上面的属性必须同步：一处改了另一处没改，就会出现「列表里是活跃的、
        单条详情说不是」这类对不上的读数。
        """
        return and_(cls.active.is_(True), cls.released_at.is_(None))

    @classmethod
    def liveness_order(cls):
        """从多行绑定里**挑「当前那行」**的 ``ORDER BY`` 口径，按优先级从高到低。

        同一张授权可能留下多行绑定（``release`` 只把 ``active`` 置 False，行留作历史），
        所以「哪一行代表这台授权的现状」必须由排序定死 —— 不带 ``ORDER BY`` 的
        ``.first()`` 挑哪一行取决于引擎返回顺序，同一个库换个版本就可能换一行。
        排序规则收在这里而不是在每个查询里各写一遍：三个调用点
        （``licensing.ensure_binding``、``api.store.release_device``、
        ``api.store._license_meta``）必须挑中同一行，各写一遍就等于留了三条会走散的
        口径 —— 而「挑错行」的症状正是「解绑成功但设备还绑着」。

        第一关键字是 ``is_live`` 而不是 ``active``：一行 ``active`` 但已 ``released``
        的绑定（判据见 ``is_live``）不算「现在绑着」，把它排在存活行前面会让上面三个
        调用点一起挑中一行已经失效的记录。SQLite 里 ``x IS NULL`` 求值为 1/0，
        ``.desc()`` 即「非 NULL 的排后面」。
        """
        return (
            cls.released_at.is_(None).desc(),
            cls.active.desc(),
            cls.activated_at.desc(),
        )

    __table_args__ = (
        # 用 unique Index 而不是 UniqueConstraint：表级约束在存量库上补不了
        # （SQLite 不支持 ALTER 追加），而 ``CREATE UNIQUE INDEX IF NOT EXISTS``
        # 能补 —— 见 ``apps/store/security/schema_guard.py`` 顶部的说明。语义相同，可维护性差很多。
        Index(
            "uq_device_bindings_license_instance",
            "license_id",
            "instance_id",
            unique=True,
        ),
    )

__all__ = [
    'Account',
    'AccountSession',
    'AuditLog',
    'CashierTicket',
    'Coupon',
    'CouponRedemption',
    'Customer',
    'DEFAULT_SUPPORT_EMAIL',
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
