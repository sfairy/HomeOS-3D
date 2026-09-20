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
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from store.core.database import Base
from store.security.security import new_uuid, utcnow


def _id() -> str:
    return new_uuid()


#: 本部署的默认邮箱：客服邮箱默认值，也是注册验证码预填 SMTP 账号 / 测试
#: 收件人 / 发件人的来源（见 ``mail_settings.SMTP_PRESETS``）。
#:
#: 放在模型层：models 是 ``site_settings`` 与 ``mail_settings`` 共同的上游，
#: 定义在下游任一边，另一边都得反向 import，迟早漂移出两份字面量。
DEFAULT_SUPPORT_EMAIL = "156120718@qq.com"


# 站点配置
class StoreSetting(Base):
    """站点级运行时配置（单例，id 固定为 1）。"""

    __tablename__ = "store_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    site_name: Mapped[str] = mapped_column(String(128), default="HomeOS 授权中心")
    site_title: Mapped[str] = mapped_column(String(256), default="HomeOS 授权中心")
    description: Mapped[str] = mapped_column(String(512), default="注册账号、购买授权与管理激活设备")
    announcement: Mapped[str] = mapped_column(Text, default="")
    #: 客服邮箱。默认给本部署的邮箱（见 DEFAULT_SUPPORT_EMAIL），后台留空时
    #: 回落到它 —— 与 logo_url 同款口径：这个字段在页面上永远是「有个地址」的状态。
    support_email: Mapped[str] = mapped_column(String(255), default=DEFAULT_SUPPORT_EMAIL)
    #: 默认值须与 site_settings.DEFAULT_LOGO_URL 保持一致（留空时回落到那里）
    logo_url: Mapped[str] = mapped_column(String(512), default="/store-static/homeos-mark.svg")
    maintenance_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    maintenance_message: Mapped[str] = mapped_column(String(512), default="系统正在升级维护，请稍后再试。")

    #: 空字符串 = 跟随 STORE_PAYMENT_PROVIDER；非空 = 在 /admin 里显式指定，优先级更高
    payment_provider: Mapped[str] = mapped_column(String(32), default="")
    payment_display_name: Mapped[str] = mapped_column(String(64), default="")
    payment_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    #: 留空表示跟随 STORE_ALIPAY_TRANSACTION_DESCRIPTION。刻意不给非空默认值：
    #: 那样会把环境变量永远盖住，运营在 .env 改了交易标题界面却还是旧的，还想不到
    #: 是库里那行默认值作祟。
    payment_transaction_description: Mapped[str] = mapped_column(String(128), default="")

    # ---- 支付宝凭据（可选） ----
    #: 全部留空表示「跟随 STORE_ALIPAY_* 环境变量」，非空则站点配置优先。
    #: 有了这几个字段，运营换商户号/切沙箱不必改容器环境变量再重启。
    alipay_app_id: Mapped[str] = mapped_column(String(64), default="")
    #: 商户 uid，用来核验异步通知确实是推给本商户的
    alipay_seller_id: Mapped[str] = mapped_column(String(64), default="")
    #: 应用私钥。**明文入库**是刻意取舍：它与 STORE_ALIPAY_APP_PRIVATE_KEY_PATH
    #: 指向的文件同机同层磁盘权限，安全性等价，换来不用重启即可换密钥。接口层
    #: 一律不回显（只报「是否已配置」）、不写日志；要求不落库就留空用环境变量。
    alipay_app_private_key: Mapped[str] = mapped_column(Text, default="")
    #: 支付宝公钥（验签用）。注意不是应用公钥，两者填反是最高频的配置错误。
    alipay_public_key: Mapped[str] = mapped_column(Text, default="")
    #: 自定义网关；留空时按 alipay_sandbox 在正式/沙箱网关之间选
    alipay_gateway_url: Mapped[str] = mapped_column(String(255), default="")
    #: 沙箱开关。为真时强制使用沙箱网关，联调完把开关关掉即可回到生产
    alipay_sandbox: Mapped[bool] = mapped_column(Boolean, default=False)
    #: 异步通知 / 同步跳转地址。留空时按 STORE_ALIPAY_* 环境变量、再按 STORE_BASE_URL 推导。
    #: 必须能在这里配的原因：内网穿透的域名和 STORE_BASE_URL 常常不是同一个，
    #: 而它恰恰是「用户付了钱订单不到账」的第一嫌疑人，改它不该需要重启容器。
    alipay_notify_url: Mapped[str] = mapped_column(String(512), default="")
    alipay_return_url: Mapped[str] = mapped_column(String(512), default="")

    referral_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    referral_rate_percent: Mapped[float] = mapped_column(default=10.0)
    referral_withdrawal_fee_percent: Mapped[float] = mapped_column(default=1.0)
    referral_withdrawal_min_points: Mapped[float] = mapped_column(default=100.0)

    device_release_cooldown_seconds: Mapped[int] = mapped_column(Integer, default=28800)

    # ---- 注册邮箱验证码（可选） ----
    #: 留空 / 0 = 跟随 STORE_* 环境变量，非空则站点配置优先 —— 验证码邮件是注册
    #: 动线上唯一的外部依赖，SMTP 授权码过期/被限流是常态，必须能不重启店铺更换。
    mail_mode: Mapped[str] = mapped_column(String(16), default="")
    mail_from: Mapped[str] = mapped_column(String(255), default="")
    smtp_host: Mapped[str] = mapped_column(String(255), default="")
    #: 0 = 跟随环境变量；显式填端口时才覆盖
    smtp_port: Mapped[int] = mapped_column(Integer, default=0)
    smtp_username: Mapped[str] = mapped_column(String(255), default="")
    #: SMTP 授权码。**明文入库**的理由与 alipay_app_private_key 相同：
    #: 它与 .env 在同一台机器、同一层磁盘权限之下，安全性等价，换来的是
    #: 「不用重启就能换授权码」。接口层只报「是否已配置」，不打码回显、不写日志。
    smtp_password: Mapped[str] = mapped_column(Text, default="")
    #: 连接加密方式：ssl / starttls / plain；留空表示跟随环境变量的两个布尔开关。
    #: 刻意不用两个裸布尔列：那样「未配置」与「显式关掉」在库里无法区分，
    #: 而「跟随环境变量」正是这里最需要的第三种状态。
    smtp_security: Mapped[str] = mapped_column(String(16), default="")
    #: 验证码有效期 / 重发冷却（秒）。0 = 跟随环境变量。
    verification_ttl_seconds: Mapped[int] = mapped_column(Integer, default=0)
    verification_cooldown_seconds: Mapped[int] = mapped_column(Integer, default=0)
    #: 是否在接口响应里回显验证码（仅本地联调）。NULL = 跟随环境变量，
    #: 因为「显式关闭」和「没配过」是两件事：前者是生产上的安全决定，不该被
    #: 一个环境变量默认值悄悄翻转。
    expose_verification_code: Mapped[bool | None] = mapped_column(Boolean)

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


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
    #: 逐条随机盐（十六进制）。验证码只有 6 位，不加盐时同一个码处处同哈希，
    #: 拿到读权限即可预算 10⁶ 个哈希还原所有近期验证码；加盐后必须按行重算。
    #: 空串专指本列引入前的旧记录，其哈希口径与当时一致（见 ``code_hash``）。
    code_salt: Mapped[str] = mapped_column(String(32), default="")
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    #: 投递结果：None = 本次未真实发信（log/echo），True = SMTP 已收下，
    #: False = 发信失败（已回退日志模式）。必须落库：只回前端就丢了，事后无法
    #: 回答「用户说没收到，那封信到底发没发」——只能翻会轮转的日志。
    delivered: Mapped[bool | None] = mapped_column(Boolean)
    #: 实际生效的投递方式（smtp / log / echo），用于区分「真发了」和「只记了日志」
    delivery_mode: Mapped[str] = mapped_column(String(16), default="")
    #: 失败原因（异常文本，已截断）
    delivery_error: Mapped[str] = mapped_column(String(255), default="")
    #: SMTP 实际尝试次数；>1 说明是重试后才成功/失败的
    delivery_attempts: Mapped[int] = mapped_column(Integer, default=0)
    #: 投递完成时刻（无论成败），便于算「从请求到发出」的耗时
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime)

    __table_args__ = (Index("ix_email_verifications_email_purpose", "email", "purpose"),)


class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    scope: Mapped[str] = mapped_column(String(255), index=True)
    succeeded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


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


# 优惠码
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
    order_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("orders.id", ondelete="SET NULL"), index=True
    )
    discount_cents: Mapped[int] = mapped_column(Integer, default=0)
    #: 作废时间（软删除）。这张表既是 ``per_account_limit`` 的判定依据，也是
    #: 「谁何时用掉哪个码、减了多少钱」的唯一凭证，物理删除会让审计查不回折扣额
    #: 与账号。非空即已作废、不再占名额，本体留原位供对账。
    voided_at: Mapped[datetime | None] = mapped_column(DateTime)
    #: 作废人/来源。不写就无法回答「这个名额是谁放开的」。
    void_reason: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


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
        #: （``store/commerce/expiry.py`` 的 ``ORDER BY expires_at LIMIT n``）。有它
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
    #: base | addon | package
    order_type: Mapped[str] = mapped_column(String(32), default="base", index=True)
    #: issue | patch
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
    payment_provider: Mapped[str] = mapped_column(String(32), default="mock")
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
    #: 营收 KPI（``store/api/admin.py:_billable_money_filter``），后台列表标注。
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


class OrderRefund(Base):
    """一次退款动作的流水（含被渠道拒绝的尝试）。
    必须单独一张表：``out_request_no`` 是**幂等键**，同值重复提交会被网关当成「同一笔退款」直接返回
    上次结果；若按订单号写死，「先退 30%、再退 70%」的第二次会被静默去重 —— 钱没退出去而本地已标成
    已退款，账面与资金流对不上且没有任何报错。故每次退款先生成流水（自带 UUID）并在其中留痕全部要素。
    """

    __tablename__ = "order_refunds"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    order_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    order_no: Mapped[str] = mapped_column(String(64), default="", index=True)
    #: 提交给渠道的幂等键，由本行 id 派生，全局唯一（重复即会被渠道去重）
    out_request_no: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    #: 本次实际退回的金额（分）
    amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    #: succeeded | failed —— 失败也要留痕，否则「退了几次都没成功」查不出来
    status: Mapped[str] = mapped_column(String(16), default="succeeded", index=True)
    #: 渠道退款单号 / 交易号；线下退款为空
    trade_no: Mapped[str | None] = mapped_column(String(128))
    #: 渠道返回的说明或失败原因
    detail: Mapped[str] = mapped_column(String(255), default="")
    reason: Mapped[str] = mapped_column(String(255), default="")
    #: 是否线下退款：没有渠道资金流，如实标注，不伪造交易号
    offline: Mapped[bool] = mapped_column(Boolean, default=False)
    operator: Mapped[str] = mapped_column(String(255), default="system")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


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

    __table_args__ = (
        # 用 unique Index 而不是 UniqueConstraint：表级约束在存量库上补不了
        # （SQLite 不支持 ALTER 追加），而 ``CREATE UNIQUE INDEX IF NOT EXISTS``
        # 能补 —— 见 ``store/security/schema_guard.py`` 顶部的说明。语义相同，可维护性差很多。
        Index(
            "uq_device_bindings_license_instance",
            "license_id",
            "instance_id",
            unique=True,
        ),
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


class CashierTicket(Base):
    """模拟收银台的短时票据。
    收银台地址要被扫码打开、扫码方没有登录态，所以页面凭证只能跟着 URL 走；若直接用订单的
    ``lookup_token``（长期有效且能查订单详情的 bearer 凭据）会进访问日志、``Referer`` 与浏览器历史，
    漏一次泄漏的不只是这张页面而是整个订单查询入口。票据只承载「打开这笔订单的收银台」一个用途
    （30 分钟、非查询凭证），且刻意不做一次性作废，否则「扫完关掉再扫」「F5」全部失效。
    """

    __tablename__ = "cashier_tickets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    order_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    #: 票据本身的 SHA-256（库里不留明文：日志/备份漏出也换不回票据）
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
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


# 邀请与积分
class ReferralWallet(Base):
    __tablename__ = "referral_wallets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    account_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("accounts.id", ondelete="CASCADE"), unique=True, index=True
    )
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    #: 以下聚合值单位都是**厘**（1 积分 = 100 厘），整数存储。不用 ``Float`` 是因为
    #: SQLite half-away、Python half-even 在 .xx5 上分币值不同，会让提现的并发比对
    #: 误报、余额与流水差 1 厘；列名带 ``_centi`` 则是让漏改点直接炸在测试里。
    balance_centi: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0"
    )
    frozen_centi: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    earned_centi: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    withdrawn_centi: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
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
    #: 单位同钱包：厘。``*_after`` 记的是**数据库里算出来的**结果。
    delta_centi: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    frozen_delta_centi: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    balance_after_centi: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    frozen_after_centi: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    note: Mapped[str] = mapped_column(String(255), default="")
    reference: Mapped[str | None] = mapped_column(String(128))
    order_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("orders.id", ondelete="SET NULL"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class ReferralWithdrawal(Base):
    __tablename__ = "referral_withdrawals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    wallet_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("referral_wallets.id", ondelete="CASCADE"), index=True
    )
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id", ondelete="CASCADE"), index=True)
    request_key: Mapped[str] = mapped_column(String(64), unique=True)
    #: 申请金额，单位厘。
    points_centi: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    #: 手续费**比例**，单位基点（5.0% → 500）。比例不是金额，不适用千分位口径，
    #: 用 bps 整数是为了让 ``gross_centi * bps // 10000`` 全程整数运算。
    fee_bps: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    fee_points_centi: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    net_points_centi: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    #: pending | paid | rejected
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    note: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)


# 版本发布与审计
class Release(Base):
    __tablename__ = "releases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    product: Mapped[str] = mapped_column(String(64), default="homeos", index=True)
    channel: Mapped[str] = mapped_column(String(32), default="docker", index=True)
    version: Mapped[str] = mapped_column(String(32))
    release_date: Mapped[str] = mapped_column(String(32), default="")
    upgrade_notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    __table_args__ = (
        Index("ix_releases_product_channel_created", "product", "channel", "created_at"),
        # 同一个 (product, channel, version) 只应有一条：客户端查更新时不该看到同一
        # 版本的两种说法（换了 upgrade_notes / release_date 的「半新半旧」行）。
        Index(
            "uq_releases_product_channel_version",
            "product",
            "channel",
            "version",
            unique=True,
        ),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    actor: Mapped[str] = mapped_column(String(255), default="system")
    action: Mapped[str] = mapped_column(String(64), index=True)
    target: Mapped[str] = mapped_column(String(255), default="")
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
