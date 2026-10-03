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

from ..core.database import Base
from ..security.security import new_uuid, utcnow


def _id() -> str:
    return new_uuid()
DEFAULT_SUPPORT_EMAIL = "156120718@qq.com"
class StoreSetting(Base):
    """站点级运行时配置（单例，id 固定为 1）。"""

    __tablename__ = "store_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    site_name: Mapped[str] = mapped_column(String(128), default="HomeOS 授权中心")
    site_title: Mapped[str] = mapped_column(String(256), default="HomeOS 授权中心")
    description: Mapped[str] = mapped_column(String(512), default="注册账号、购买授权与管理激活设备")
    announcement: Mapped[str] = mapped_column(Text, default="")
    support_email: Mapped[str] = mapped_column(String(255), default=DEFAULT_SUPPORT_EMAIL)
    logo_url: Mapped[str] = mapped_column(String(512), default="/store-static/homeos-mark.svg")
    maintenance_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    maintenance_message: Mapped[str] = mapped_column(String(512), default="系统正在升级维护，请稍后再试。")
    deploy_base_url: Mapped[str] = mapped_column(String(512), default="")

    payment_provider: Mapped[str] = mapped_column(String(32), default="")
    payment_channels_json: Mapped[str] = mapped_column(Text, default="[]")
    payment_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    payment_transaction_description: Mapped[str] = mapped_column(String(128), default="")

    alipay_app_id: Mapped[str] = mapped_column(String(64), default="")
    alipay_seller_id: Mapped[str] = mapped_column(String(64), default="")
    alipay_app_private_key: Mapped[str] = mapped_column(Text, default="")
    alipay_public_key: Mapped[str] = mapped_column(Text, default="")
    alipay_gateway_url: Mapped[str] = mapped_column(String(255), default="")
    alipay_notify_url: Mapped[str] = mapped_column(String(512), default="")
    alipay_return_url: Mapped[str] = mapped_column(String(512), default="")

    wechat_mch_id: Mapped[str] = mapped_column(String(64), default="")
    wechat_app_id: Mapped[str] = mapped_column(String(64), default="")
    wechat_api_v3_key: Mapped[str] = mapped_column(String(64), default="")
    wechat_merchant_private_key: Mapped[str] = mapped_column(Text, default="")
    wechat_merchant_serial_no: Mapped[str] = mapped_column(String(64), default="")
    wechat_platform_public_key: Mapped[str] = mapped_column(Text, default="")
    wechat_platform_public_key_id: Mapped[str] = mapped_column(String(64), default="")
    wechat_notify_url: Mapped[str] = mapped_column(String(512), default="")

    referral_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    referral_rate_percent: Mapped[float] = mapped_column(default=10.0)
    referral_withdrawal_fee_percent: Mapped[float] = mapped_column(default=1.0)
    referral_withdrawal_min_points: Mapped[float] = mapped_column(default=100.0)

    device_release_cooldown_override: Mapped[int | None] = mapped_column(Integer)

    mail_mode: Mapped[str] = mapped_column(String(16), default="")
    mail_from: Mapped[str] = mapped_column(String(255), default="")
    smtp_host: Mapped[str] = mapped_column(String(255), default="")
    smtp_port: Mapped[int] = mapped_column(Integer, default=0)
    smtp_username: Mapped[str] = mapped_column(String(255), default="")
    smtp_password: Mapped[str] = mapped_column(Text, default="")
    smtp_security: Mapped[str] = mapped_column(String(16), default="")
    verification_ttl_seconds: Mapped[int] = mapped_column(Integer, default=0)
    verification_cooldown_seconds: Mapped[int] = mapped_column(Integer, default=0)
    verification_global_hourly_limit: Mapped[int] = mapped_column(Integer, default=0)
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
    code_salt: Mapped[str] = mapped_column(String(32), default="")
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    delivered: Mapped[bool | None] = mapped_column(Boolean)
    delivery_mode: Mapped[str] = mapped_column(String(16), default="")
    delivery_error: Mapped[str] = mapped_column(String(255), default="")
    delivery_attempts: Mapped[int] = mapped_column(Integer, default=0)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime)

    __table_args__ = (Index("ix_email_verifications_email_purpose", "email", "purpose"),)
class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    scope: Mapped[str] = mapped_column(String(255), index=True)
    succeeded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
class Coupon(Base):
    __tablename__ = "coupons"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    description: Mapped[str] = mapped_column(String(255), default="")
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
    voided_at: Mapped[datetime | None] = mapped_column(DateTime)
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
    out_request_no: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="succeeded", index=True)
    trade_no: Mapped[str | None] = mapped_column(String(128))
    detail: Mapped[str] = mapped_column(String(255), default="")
    reason: Mapped[str] = mapped_column(String(255), default="")
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
    source: Mapped[str] = mapped_column(String(32), default="self_service")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
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
    kind: Mapped[str] = mapped_column(String(32), index=True)
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
    points_centi: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    fee_bps: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    fee_points_centi: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    net_points_centi: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    note: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)
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
