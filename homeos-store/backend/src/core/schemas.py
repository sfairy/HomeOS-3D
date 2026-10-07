"""请求体模型。响应统一使用参考站风格的 camelCase dict。"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..security.security import normalize_username


class _Camel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore", allow_inf_nan=False)


class VerificationRequest(_Camel):
    email: str = Field(min_length=3, max_length=255)
    purpose: str = Field(
        default="register", pattern="^(register|reset|verify|change_email|homeos_register)$"
    )


class VerifyCodeRequest(_Camel):
    """服务端/客户端通用验码请求（不依赖已登录账号）。

    主应用（homeos）首装注册用它校验并消费发到注册邮箱的验证码：``purpose`` 限定为
    ``homeos_register``，避免这个公开端点被拿去替商店自身账号流程验码。
    """

    email: str = Field(min_length=3, max_length=255)
    code: str = Field(min_length=4, max_length=12)
    purpose: str = Field(default="homeos_register", max_length=32)


class ChangeEmailRequest(_Camel):
    """把账号邮箱换成一个新地址。
    """

    email: str = Field(min_length=3, max_length=255)
    code: str = Field(min_length=4, max_length=12)
    password: str = Field(default="", min_length=0, max_length=128)


class ChangePasswordRequest(_Camel):
    """已登录账号修改密码。
    """

    old_password: str = Field(min_length=1, max_length=128, alias="oldPassword")
    new_password: str = Field(min_length=8, max_length=128, alias="newPassword")
    confirm_password: str = Field(min_length=8, max_length=128, alias="confirmPassword")


class VerifyEmailRequest(_Camel):
    """用验证码把「当前账号绑定的邮箱」标记为已验证。"""

    email: str = Field(min_length=3, max_length=255)
    code: str = Field(min_length=4, max_length=12)


class RegisterRequest(_Camel):
    """商店注册：账号 + 邮箱 + 验证码 + 密码。

    购买 / 授权归属仍以邮箱为主线；账号名与主应用一致，用于登录与展示。
    """

    username: str = Field(min_length=3, max_length=64)
    email: str = Field(min_length=3, max_length=255)
    code: str = Field(min_length=4, max_length=12)
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(default="", alias="confirmPassword", max_length=128)
    referral_code: str | None = Field(default=None, alias="referralCode", max_length=16)

    @model_validator(mode="after")
    def validate_register(self) -> RegisterRequest:
        self.username = normalize_username(self.username)
        self.email = self.email.strip().lower()
        return self


class LoginRequest(_Camel):
    """登录：``account`` 可填账号名或注册邮箱；兼容旧客户端仍传 ``email``。"""

    account: str | None = Field(default=None, min_length=1, max_length=255)
    email: str | None = Field(default=None, min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=128)

    @model_validator(mode="after")
    def resolve_account(self) -> LoginRequest:
        key = (self.account or self.email or "").strip()
        if not key:
            raise ValueError("请填写账号或邮箱。")
        self.account = key
        return self


class PasswordResetRequest(_Camel):
    email: str = Field(min_length=3, max_length=255)
    code: str = Field(min_length=4, max_length=12)
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(default="", alias="confirmPassword", max_length=128)


class LabelRequest(_Camel):
    label: str | None = Field(default=None, max_length=50)


class ReleaseDeviceRequest(_Camel):
    password: str = Field(min_length=1, max_length=128)
    expected_binding_id: str | None = Field(default=None, alias="expectedBindingId", max_length=64)
    expected_activated_at: datetime | None = Field(default=None, alias="expectedActivatedAt")
    expected_binding_version: str | None = Field(
        default=None, alias="expectedBindingVersion", max_length=128
    )


class CreateOrderRequest(_Camel):
    product_id: str = Field(alias="productId", min_length=1, max_length=64)
    coupon_code: str | None = Field(default=None, alias="couponCode", max_length=64)
    target_license_id: str | None = Field(
        default=None,
        alias="targetLicenseId",
        max_length=64,
    )
    upgrade_license_id: str | None = Field(
        default=None, alias="upgradeLicenseId", max_length=64
    )
    payment_channel: str | None = Field(
        default=None, alias="paymentChannel", max_length=32
    )


class CouponPreviewRequest(_Camel):
    product_id: str = Field(alias="productId", min_length=1, max_length=64)
    coupon_code: str = Field(alias="couponCode", min_length=1, max_length=64)


class WithdrawalRequest(_Camel):
    points: float = Field(gt=0)
    request_key: str = Field(alias="requestKey", min_length=8, max_length=64)
    expected_fee_percent: float | None = Field(default=None, alias="expectedFeePercent")


class _AdminBase(BaseModel):
    """后台请求体基类：**未知字段直接报 422**。
    """

    model_config = ConfigDict(populate_by_name=True, extra="forbid", allow_inf_nan=False)


class AdminProductRequest(_AdminBase):
    name: str = Field(min_length=1, max_length=255)
    product_code: str = Field(default="homeos", alias="productCode", max_length=64)
    price_cents: int = Field(default=0, alias="priceCents", ge=0)
    original_price_cents: int | None = Field(default=None, alias="originalPriceCents", ge=0)
    is_full_price: bool = Field(default=False, alias="isFullPrice")
    validity_days: int | None = Field(default=None, alias="validityDays", ge=1)
    product_type: str = Field(default="base", alias="productType", max_length=32)
    edition: str | None = Field(default=None, max_length=64)
    feature_codes: list[str] = Field(default_factory=list, alias="featureCodes")
    included_product_ids: list[str] = Field(default_factory=list, alias="includedProductIds")
    package_contents_locked: bool = Field(default=False, alias="packageContentsLocked")
    active: bool = True
    note: str | None = Field(default=None, max_length=512)
    display_description: str | None = Field(default=None, alias="displayDescription", max_length=512)
    badge_text: str | None = Field(default=None, alias="badgeText", max_length=64)
    featured: bool = False
    sort_order: int = Field(default=100, alias="sortOrder")
    fulfillment_mode: str = Field(default="automatic", alias="fulfillmentMode", max_length=32)
    stock_quantity: int | None = Field(default=None, alias="stockQuantity", ge=0)
    requires_license: bool = Field(default=False, alias="requiresLicense")


class AdminProductPatch(_AdminBase):
    name: str | None = Field(default=None, max_length=255)
    product_code: str | None = Field(default=None, alias="productCode", max_length=64)
    price_cents: int | None = Field(default=None, alias="priceCents", ge=0)
    original_price_cents: int | None = Field(default=None, alias="originalPriceCents", ge=0)
    is_full_price: bool | None = Field(default=None, alias="isFullPrice")
    validity_days: int | None = Field(default=None, alias="validityDays", ge=1)
    product_type: str | None = Field(default=None, alias="productType", max_length=32)
    edition: str | None = Field(default=None, max_length=64)
    feature_codes: list[str] | None = Field(default=None, alias="featureCodes")
    included_product_ids: list[str] | None = Field(default=None, alias="includedProductIds")
    package_contents_locked: bool | None = Field(default=None, alias="packageContentsLocked")
    active: bool | None = None
    note: str | None = Field(default=None, max_length=512)
    display_description: str | None = Field(default=None, alias="displayDescription", max_length=512)
    badge_text: str | None = Field(default=None, alias="badgeText", max_length=64)
    featured: bool | None = None
    sort_order: int | None = Field(default=None, alias="sortOrder")
    fulfillment_mode: str | None = Field(default=None, alias="fulfillmentMode", max_length=32)
    stock_quantity: int | None = Field(default=None, alias="stockQuantity", ge=0)
    requires_license: bool | None = Field(default=None, alias="requiresLicense")


class AdminCouponRequest(_AdminBase):
    code: str = Field(min_length=2, max_length=64)
    description: str = Field(default="", max_length=255)
    discount_type: str = Field(default="percent", alias="discountType", max_length=16)
    percent: float = Field(default=0.0, ge=0, le=100)
    amount_cents: int = Field(default=0, alias="amountCents", ge=0)
    min_amount_cents: int = Field(default=0, alias="minAmountCents", ge=0)
    max_redemptions: int | None = Field(default=None, alias="maxRedemptions", ge=1)
    per_account_limit: int = Field(default=1, alias="perAccountLimit", ge=0)
    applicable_product_ids: list[str] = Field(default_factory=list, alias="applicableProductIds")
    starts_at: datetime | None = Field(default=None, alias="startsAt")
    expires_at: datetime | None = Field(default=None, alias="expiresAt")
    active: bool = True


class AdminCouponPatch(_AdminBase):
    """优惠码的部分更新。
    """

    description: str | None = Field(default=None, max_length=255)
    discount_type: str | None = Field(default=None, alias="discountType", max_length=16)
    percent: float | None = Field(default=None, ge=0, le=100)
    amount_cents: int | None = Field(default=None, alias="amountCents", ge=0)
    min_amount_cents: int | None = Field(default=None, alias="minAmountCents", ge=0)
    max_redemptions: int | None = Field(default=None, alias="maxRedemptions", ge=1)
    per_account_limit: int | None = Field(default=None, alias="perAccountLimit", ge=0)
    applicable_product_ids: list[str] | None = Field(default=None, alias="applicableProductIds")
    starts_at: datetime | None = Field(default=None, alias="startsAt")
    expires_at: datetime | None = Field(default=None, alias="expiresAt")
    active: bool | None = None


class AdminSettingsRequest(_AdminBase):
    site_name: str | None = Field(default=None, alias="siteName", max_length=128)
    site_title: str | None = Field(default=None, alias="siteTitle", max_length=256)
    description: str | None = Field(default=None, max_length=512)
    announcement: str | None = None
    support_email: str | None = Field(default=None, alias="supportEmail", max_length=255)
    logo_url: str | None = Field(default=None, alias="logoUrl", max_length=512)
    deploy_base_url: str | None = Field(default=None, alias="deployBaseUrl", max_length=512)
    maintenance_mode: bool | None = Field(default=None, alias="maintenanceMode")
    maintenance_message: str | None = Field(default=None, alias="maintenanceMessage", max_length=512)
    payment_provider: str | None = Field(default=None, alias="paymentProvider", max_length=32)
    payment_enabled: bool | None = Field(default=None, alias="paymentEnabled")
    payment_transaction_description: str | None = Field(
        default=None, alias="paymentTransactionDescription", max_length=128
    )
    referral_enabled: bool | None = Field(default=None, alias="referralEnabled")
    referral_rate_percent: float | None = Field(default=None, alias="referralRatePercent", ge=0, le=100)
    referral_withdrawal_fee_percent: float | None = Field(
        default=None, alias="referralWithdrawalFeePercent", ge=0, le=100
    )
    referral_withdrawal_min_points: float | None = Field(
        default=None, alias="referralWithdrawalMinPoints", ge=0
    )
    device_release_cooldown_seconds: int | None = Field(
        default=None, alias="deviceReleaseCooldownSeconds", ge=0
    )
    alipay_app_id: str | None = Field(default=None, alias="alipayAppId", max_length=64)
    alipay_seller_id: str | None = Field(default=None, alias="alipaySellerId", max_length=64)
    alipay_app_private_key: str | None = Field(
        default=None, alias="alipayAppPrivateKey", max_length=8192
    )
    alipay_public_key: str | None = Field(
        default=None, alias="alipayPublicKey", max_length=8192
    )
    alipay_gateway_url: str | None = Field(
        default=None, alias="alipayGatewayUrl", max_length=255
    )
    alipay_notify_url: str | None = Field(
        default=None, alias="alipayNotifyUrl", max_length=512
    )
    alipay_return_url: str | None = Field(
        default=None, alias="alipayReturnUrl", max_length=512
    )

    payment_channels: list[str] | None = Field(default=None, alias="paymentChannels")

    wechat_mch_id: str | None = Field(default=None, alias="wechatMchId", max_length=64)
    wechat_app_id: str | None = Field(default=None, alias="wechatAppId", max_length=64)
    wechat_merchant_serial_no: str | None = Field(
        default=None, alias="wechatMerchantSerialNo", max_length=64
    )
    wechat_api_v3_key: str | None = Field(
        default=None, alias="wechatApiV3Key", max_length=64
    )
    wechat_merchant_private_key: str | None = Field(
        default=None, alias="wechatMerchantPrivateKey", max_length=8192
    )
    wechat_platform_public_key: str | None = Field(
        default=None, alias="wechatPlatformPublicKey", max_length=8192
    )
    wechat_platform_public_key_id: str | None = Field(
        default=None, alias="wechatPlatformPublicKeyId", max_length=64
    )
    wechat_gateway_url: str | None = Field(
        default=None, alias="wechatGatewayUrl", max_length=255
    )
    wechat_notify_url: str | None = Field(
        default=None, alias="wechatNotifyUrl", max_length=512
    )

    mail_mode: str | None = Field(default=None, alias="mailMode", max_length=16)
    mail_from: str | None = Field(default=None, alias="mailFrom", max_length=255)
    smtp_host: str | None = Field(default=None, alias="smtpHost", max_length=255)
    smtp_port: int | None = Field(default=None, alias="smtpPort", ge=0, le=65535)
    smtp_username: str | None = Field(default=None, alias="smtpUsername", max_length=255)
    smtp_password: str | None = Field(default=None, alias="smtpPassword", max_length=512)
    smtp_security: str | None = Field(
        default=None, alias="smtpSecurity", max_length=16
    )
    verification_ttl_seconds: int | None = Field(
        default=None, alias="verificationTtlSeconds", ge=0, le=3600
    )
    verification_cooldown_seconds: int | None = Field(
        default=None, alias="verificationCooldownSeconds", ge=0, le=3600
    )
    verification_global_hourly_limit: int | None = Field(
        default=None, alias="verificationGlobalHourlyLimit", ge=0, le=100_000
    )
    delivery_email_enabled: bool | None = Field(
        default=None, alias="deliveryEmailEnabled"
    )
    smtp_clear_password: bool | None = Field(default=None, alias="smtpClearPassword")


class AdminMailTestRequest(_AdminBase):
    """「邮件诊断 / 发送测试邮件」的收件人。
    """

    email: str | None = Field(default=None, min_length=3, max_length=255)


class AdminLicenseRequest(_AdminBase):
    email: str = Field(min_length=3, max_length=255)
    product_id: str = Field(alias="productId", min_length=1, max_length=64)
    validity_days: int | None = Field(default=None, alias="validityDays", ge=1)
    note: str | None = Field(default=None, max_length=255)


class AdminLicensePatch(_AdminBase):
    """授权的后台修正。
    """

    user_label: str | None = Field(default=None, alias="userLabel", max_length=64)
    validity_days: int | None = Field(default=None, alias="validityDays", ge=1)
    access_started_at: datetime | None = Field(default=None, alias="accessStartedAt")
    access_expires_at: datetime | None = Field(default=None, alias="accessExpiresAt")
    extend_days: int | None = Field(default=None, alias="extendDays", ge=1)


class AdminEntitlementRequest(_AdminBase):
    """手工补一条权益（决定客户端功能开关的那张表）。"""

    license_id: str = Field(alias="licenseId", min_length=1, max_length=64)
    feature_code: str = Field(alias="featureCode", min_length=1, max_length=64)
    product_id: str | None = Field(default=None, alias="productId", max_length=64)
    product_name: str = Field(default="", alias="productName", max_length=255)
    product_type: str = Field(default="module", alias="productType", max_length=32)
    active: bool = True
    starts_at: datetime | None = Field(default=None, alias="startsAt")
    expires_at: datetime | None = Field(default=None, alias="expiresAt")


class AdminEntitlementPatch(_AdminBase):
    feature_code: str | None = Field(default=None, alias="featureCode", max_length=64)
    product_name: str | None = Field(default=None, alias="productName", max_length=255)
    active: bool | None = None
    starts_at: datetime | None = Field(default=None, alias="startsAt")
    expires_at: datetime | None = Field(default=None, alias="expiresAt")


class AdminAccountPatch(_AdminBase):
    """账号维护。``new_password`` 只能由管理员在这里重置，不接受明文回显。"""

    username: str | None = Field(default=None, min_length=3, max_length=64)
    email: str | None = Field(default=None, min_length=3, max_length=255)
    is_admin: bool | None = Field(default=None, alias="isAdmin")
    is_active: bool | None = Field(default=None, alias="isActive")
    email_verified: bool | None = Field(default=None, alias="emailVerified")
    new_password: str | None = Field(default=None, alias="newPassword", min_length=8, max_length=128)


class AdminWalletAdjustRequest(_AdminBase):
    """邀请积分人工调账。
    """

    delta: float = Field(description="余额变动，可为负")
    frozen_delta: float = Field(default=0.0, alias="frozenDelta")
    note: str = Field(default="", max_length=255)


class AdminWithdrawalResolveRequest(_AdminBase):
    approve: bool = True
    note: str = Field(default="", max_length=255)


class AdminOrderActionRequest(_AdminBase):
    note: str = Field(default="", max_length=255)
    offline: bool = False
    amount_cents: int | None = Field(default=None, alias="amountCents", gt=0)


class AdminOrderReviewRequest(_AdminBase):
    """「标记已处理」的复核结论。
    """

    note: str = Field(default="", max_length=200)
