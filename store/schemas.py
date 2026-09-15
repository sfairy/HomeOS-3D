"""请求体模型。响应统一使用参考站风格的 camelCase dict。"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class _Camel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")


# --------------------------------------------------------------------------- #
# 账号
# --------------------------------------------------------------------------- #
class VerificationRequest(_Camel):
    email: str = Field(min_length=3, max_length=255)
    purpose: str = Field(default="register", pattern="^(register|reset)$")


class RegisterRequest(_Camel):
    email: str = Field(min_length=3, max_length=255)
    code: str = Field(min_length=4, max_length=12)
    password: str = Field(min_length=6, max_length=128)
    confirm_password: str = Field(default="", alias="confirmPassword", max_length=128)
    referral_code: str | None = Field(default=None, alias="referralCode", max_length=16)


class LoginRequest(_Camel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class PasswordResetRequest(_Camel):
    email: str = Field(min_length=3, max_length=255)
    code: str = Field(min_length=4, max_length=12)
    password: str = Field(min_length=6, max_length=128)
    confirm_password: str = Field(default="", alias="confirmPassword", max_length=128)


class LabelRequest(_Camel):
    label: str | None = Field(default=None, max_length=50)


class ReleaseDeviceRequest(_Camel):
    password: str = Field(min_length=1, max_length=128)


# --------------------------------------------------------------------------- #
# 订单
# --------------------------------------------------------------------------- #
class CreateOrderRequest(_Camel):
    product_id: str = Field(alias="productId", min_length=1, max_length=64)
    coupon_code: str | None = Field(default=None, alias="couponCode", max_length=64)
    #: 增量包需要指定要追加到哪一份授权
    target_license_id: str | None = Field(default=None, alias="customerId", max_length=64)


class CouponPreviewRequest(_Camel):
    product_id: str = Field(alias="productId", min_length=1, max_length=64)
    coupon_code: str = Field(alias="couponCode", min_length=1, max_length=64)


class OrderLookupRequest(_Camel):
    order_no: str = Field(alias="orderNo", min_length=4, max_length=64)


# --------------------------------------------------------------------------- #
# 邀请
# --------------------------------------------------------------------------- #
class WithdrawalRequest(_Camel):
    points: float = Field(gt=0)
    qq: str = Field(min_length=5, max_length=20)
    request_key: str = Field(alias="requestKey", min_length=8, max_length=64)
    expected_fee_percent: float | None = Field(default=None, alias="expectedFeePercent")


# --------------------------------------------------------------------------- #
# 管理后台
# --------------------------------------------------------------------------- #
class _AdminBase(BaseModel):
    """后台请求体基类：**未知字段直接报 422**。

    商店侧 ``_Camel`` 用 ``extra="ignore"`` 是为了容忍客户端多传字段；但后台
    是我们自己的界面，把「字段名写错 / 后端漏映射」静默丢弃的代价是运营以为
    改动生效了——接口返回 200，库里却一点没变（改折扣率、改 logo 都踩过）。
    这里收紧成显式报错，让漏映射当场暴露。
    """

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class AdminProductRequest(_AdminBase):
    name: str = Field(min_length=1, max_length=255)
    product_code: str = Field(default="homeos", alias="productCode", max_length=64)
    price_cents: int = Field(default=0, alias="priceCents", ge=0)
    original_price_cents: int | None = Field(default=None, alias="originalPriceCents", ge=0)
    is_full_price: bool = Field(default=False, alias="isFullPrice")
    validity_days: int | None = Field(default=None, alias="validityDays", ge=1)
    product_type: str = Field(default="base", alias="productType", max_length=32)
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

    字段必须与 ``AdminCouponRequest`` 对齐：优惠码一旦发出去就很难收回，
    运营需要能改门槛、折扣、有效期和适用范围，而不是只能启用 / 停用。
    ``max_redemptions`` 允许下调（改小即收紧名额），但不允许改成 0 或负数。
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
    #: 品牌标识；留空则回落到系统默认的 homeos-mark.svg
    logo_url: str | None = Field(default=None, alias="logoUrl", max_length=512)
    maintenance_mode: bool | None = Field(default=None, alias="maintenanceMode")
    maintenance_message: str | None = Field(default=None, alias="maintenanceMessage", max_length=512)
    payment_provider: str | None = Field(default=None, alias="paymentProvider", max_length=32)
    payment_display_name: str | None = Field(default=None, alias="paymentDisplayName", max_length=64)
    payment_enabled: bool | None = Field(default=None, alias="paymentEnabled")
    payment_transaction_description: str | None = Field(
        default=None, alias="paymentTransactionDescription", max_length=128
    )
    #: 商户订单号模板，支持 {{time}} / {{email}} / {{orderNo}} 占位符
    payment_merchant_order_template: str | None = Field(
        default=None, alias="paymentMerchantOrderTemplate", max_length=128
    )
    referral_enabled: bool | None = Field(default=None, alias="referralEnabled")
    referral_rate_percent: float | None = Field(default=None, alias="referralRatePercent", ge=0, le=100)
    referral_withdrawal_fee_percent: float | None = Field(
        default=None, alias="referralWithdrawalFeePercent", ge=0, le=100
    )
    referral_withdrawal_min_points: float | None = Field(
        default=None, alias="referralWithdrawalMinPoints", ge=0
    )
    referral_qq_group: str | None = Field(default=None, alias="referralQqGroup", max_length=64)
    referral_qq_url: str | None = Field(default=None, alias="referralQqUrl", max_length=512)
    device_release_cooldown_seconds: int | None = Field(
        default=None, alias="deviceReleaseCooldownSeconds", ge=0
    )


class AdminLicenseRequest(_AdminBase):
    email: str = Field(min_length=3, max_length=255)
    product_id: str = Field(alias="productId", min_length=1, max_length=64)
    validity_days: int | None = Field(default=None, alias="validityDays", ge=1)
    note: str | None = Field(default=None, max_length=255)


class AdminLicensePatch(_AdminBase):
    """授权的后台修正。

    这几个字段过去完全没有入口，客服遇到「客户要延期 / 备注写错」只能改库。
    ``extend_days`` 与 ``access_expires_at`` 互斥：前者在现有到期时间上顺延
    （永久授权会以当前时刻为起点重新计时），后者直接指定绝对时间。
    ``access_expires_at`` 显式传 null 表示改为永久有效。
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

    email: str | None = Field(default=None, min_length=3, max_length=255)
    is_admin: bool | None = Field(default=None, alias="isAdmin")
    is_active: bool | None = Field(default=None, alias="isActive")
    email_verified: bool | None = Field(default=None, alias="emailVerified")
    new_password: str | None = Field(default=None, alias="newPassword", min_length=6, max_length=128)


class AdminWalletAdjustRequest(_AdminBase):
    """邀请积分人工调账。

    ``delta`` 可为负（扣减）。调账一律走 ledger，保证流水与余额永远对得上，
    不允许直接改余额绕过账本。
    """

    delta: float = Field(description="余额变动，可为负")
    frozen_delta: float = Field(default=0.0, alias="frozenDelta")
    note: str = Field(default="", max_length=255)


class AdminReleaseRequest(_AdminBase):
    product: str = Field(default="homeos", max_length=64)
    channel: str = Field(default="docker", max_length=32)
    version: str = Field(min_length=1, max_length=32)
    release_date: str = Field(default="", alias="releaseDate", max_length=32)
    upgrade_notes: str = Field(default="", alias="upgradeNotes")


class AdminReleasePatch(_AdminBase):
    product: str | None = Field(default=None, max_length=64)
    channel: str | None = Field(default=None, max_length=32)
    version: str | None = Field(default=None, max_length=32)
    release_date: str | None = Field(default=None, alias="releaseDate", max_length=32)
    upgrade_notes: str | None = Field(default=None, alias="upgradeNotes")


class AdminWithdrawalResolveRequest(_AdminBase):
    approve: bool = True
    note: str = Field(default="", max_length=255)


class AdminOrderActionRequest(_AdminBase):
    note: str = Field(default="", max_length=255)
