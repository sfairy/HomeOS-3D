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
)
from sqlalchemy.orm import Mapped, mapped_column

from apps.store.core.database import Base
from apps.store.security.security import new_uuid, utcnow


def _id() -> str:
    return new_uuid()
#: 本部署的默认邮箱：客服邮箱默认值，也是注册验证码预填 SMTP 账号 / 测试
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
    support_email: Mapped[str] = mapped_column(String(255), default=DEFAULT_SUPPORT_EMAIL)
    #: 默认值须与 site_settings.DEFAULT_LOGO_URL 保持一致（留空时回落到那里）
    logo_url: Mapped[str] = mapped_column(String(512), default="/store-static/homeos-mark.svg")
    maintenance_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    maintenance_message: Mapped[str] = mapped_column(String(512), default="系统正在升级维护，请稍后再试。")
    #: 「一键部署」指令的脚本托管地址（基础 URL，无结尾斜杠）。空串 = 未配置，
    deploy_base_url: Mapped[str] = mapped_column(String(512), default="")

    #: 空字符串 = 跟随 STORE_PAYMENT_PROVIDER；非空 = 在 /admin 里显式指定，优先级更高。
    #: 多渠道并存后，它是**默认渠道**（顾客没选时用它），而启用集合见 payment_channels_json。
    payment_provider: Mapped[str] = mapped_column(String(32), default="")
    #: 已启用的支付渠道（JSON 数组，如 ["alipay","wechat"]）。
    #: 空数组 = 跟随 payment_provider（老部署的语义，保持不变）。
    payment_channels_json: Mapped[str] = mapped_column(Text, default="[]")
    payment_display_name: Mapped[str] = mapped_column(String(64), default="")
    payment_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    payment_transaction_description: Mapped[str] = mapped_column(String(128), default="")

    # ---- 支付宝凭据（可选） ----
    alipay_app_id: Mapped[str] = mapped_column(String(64), default="")
    #: 商户 uid，用来核验异步通知确实是推给本商户的
    alipay_seller_id: Mapped[str] = mapped_column(String(64), default="")
    alipay_app_private_key: Mapped[str] = mapped_column(Text, default="")
    #: 支付宝公钥（验签用）。注意不是应用公钥，两者填反是最高频的配置错误。
    alipay_public_key: Mapped[str] = mapped_column(Text, default="")
    #: 自定义网关。留空即生产网关。
    alipay_gateway_url: Mapped[str] = mapped_column(String(255), default="")
    alipay_notify_url: Mapped[str] = mapped_column(String(512), default="")
    alipay_return_url: Mapped[str] = mapped_column(String(512), default="")

    # ---- 微信支付凭据（可选） ----
    #: 商户号。微信的「商户身份」，与 appid（应用身份）不是一回事。
    wechat_mch_id: Mapped[str] = mapped_column(String(64), default="")
    #: 公众号/应用 appid（Native 支付要在下单时一起提交）。
    wechat_app_id: Mapped[str] = mapped_column(String(64), default="")
    #: APIv3 密钥（恰好 32 字符）：解密回调资源用。**明文入库**的理由与支付宝私钥相同：
    #: 回调解密必须拿到原文；它只用于本地加解密，不外发。
    wechat_api_v3_key: Mapped[str] = mapped_column(String(64), default="")
    #: 商户 API 私钥（apiclient_key.pem 内容）：签名每个请求。
    wechat_merchant_private_key: Mapped[str] = mapped_column(Text, default="")
    #: 商户 API 证书序列号：放进 Authorization 头，可从 apiclient_cert.pem 算出。
    wechat_merchant_serial_no: Mapped[str] = mapped_column(String(64), default="")
    #: 微信支付公钥（或平台证书）：验回调签名。
    wechat_platform_public_key: Mapped[str] = mapped_column(Text, default="")
    #: 公钥 ID（用「微信支付公钥」模式时微信会在回调头里回它）。
    wechat_platform_public_key_id: Mapped[str] = mapped_column(String(64), default="")
    wechat_notify_url: Mapped[str] = mapped_column(String(512), default="")

    referral_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    referral_rate_percent: Mapped[float] = mapped_column(default=10.0)
    referral_withdrawal_fee_percent: Mapped[float] = mapped_column(default=1.0)
    referral_withdrawal_min_points: Mapped[float] = mapped_column(default=100.0)

    #: 两次**解绑**之间的最小间隔（秒）—— 约束的是「下一次解绑」，不是激活。
    device_release_cooldown_override: Mapped[int | None] = mapped_column(Integer)

    # ---- 注册邮箱验证码（可选） ----
    mail_mode: Mapped[str] = mapped_column(String(16), default="")
    mail_from: Mapped[str] = mapped_column(String(255), default="")
    smtp_host: Mapped[str] = mapped_column(String(255), default="")
    #: 0 = 跟随环境变量；显式填端口时才覆盖
    smtp_port: Mapped[int] = mapped_column(Integer, default=0)
    smtp_username: Mapped[str] = mapped_column(String(255), default="")
    #: SMTP 授权码。**明文入库**的理由与 alipay_app_private_key 相同：
    smtp_password: Mapped[str] = mapped_column(Text, default="")
    #: 连接加密方式：ssl / starttls / plain；留空表示跟随环境变量的两个布尔开关。
    smtp_security: Mapped[str] = mapped_column(String(16), default="")
    #: 验证码有效期 / 重发冷却（秒）。0 = 跟随环境变量。
    verification_ttl_seconds: Mapped[int] = mapped_column(Integer, default=0)
    verification_cooldown_seconds: Mapped[int] = mapped_column(Integer, default=0)
    #: 全站每小时的发信上限。0 = 跟随环境变量。触顶时所有用户都收不到验证码，
    #: 所以它必须能在后台调 —— 不然运营只能改环境变量并重启。
    verification_global_hourly_limit: Mapped[int] = mapped_column(Integer, default=0)
    #: 验证码回显开关（expose_verification_code）随回显通道一并删除，见 config.py。
    #: 发货邮件（支付成功后把激活码发到买家邮箱）总开关。默认开：
    delivery_email_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="1"
    )

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
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
    code_salt: Mapped[str] = mapped_column(String(32), default="")
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    #: 投递结果：None = 本次未真实发信（log/echo），True = SMTP 已收下，
    delivered: Mapped[bool | None] = mapped_column(Boolean)
    #: 实际生效的投递方式（smtp / log / echo），用于区分「真发了」和「只记了日志」
    delivery_mode: Mapped[str] = mapped_column(String(16), default="")
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
    voided_at: Mapped[datetime | None] = mapped_column(DateTime)
    #: 作废人/来源。不写就无法回答「这个名额是谁放开的」。
    void_reason: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
class OrderRefund(Base):
    """一次退款动作的流水（含被渠道拒绝的尝试）。
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
    status: Mapped[str] = mapped_column(String(16), default="succeeded", index=True)
    #: 渠道退款单号 / 交易号；线下退款为空
    trade_no: Mapped[str | None] = mapped_column(String(128))
    detail: Mapped[str] = mapped_column(String(255), default="")
    reason: Mapped[str] = mapped_column(String(255), default="")
    #: 是否线下退款：没有渠道资金流，如实标注，不伪造交易号
    offline: Mapped[bool] = mapped_column(Boolean, default=False)
    operator: Mapped[str] = mapped_column(String(255), default="system")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
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
# 邀请与积分
class ReferralWallet(Base):
    __tablename__ = "referral_wallets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    account_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("accounts.id", ondelete="CASCADE"), unique=True, index=True
    )
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
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
