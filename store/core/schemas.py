"""请求体模型。响应统一使用参考站风格的 camelCase dict。"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class _Camel(BaseModel):
    #: ``allow_inf_nan=False`` 覆盖**所有** float 字段：pydantic 默认放行 ``Infinity`` /
    #: ``NaN``，而 JSON 里 ``1e999`` 就能造出 ``Infinity``。``Field(gt=0)`` 拦不住它
    #: （``inf > 0`` 为真），随后 ``money.to_centi`` 抛 ``ValueError`` 无人接管 —— 攻击者
    #: 用一个字段就换到一个 500。让它在校验层变成 422 才是正确的位置。
    model_config = ConfigDict(populate_by_name=True, extra="ignore", allow_inf_nan=False)


# 账号
class VerificationRequest(_Camel):
    email: str = Field(min_length=3, max_length=255)
    #: register / reset 无需登录；verify / change_email 必须带登录态
    #: （见 ``store.api.store._PURPOSES_REQUIRING_ACCOUNT``）
    purpose: str = Field(
        default="register", pattern="^(register|reset|verify|change_email)$"
    )


class ChangeEmailRequest(_Camel):
    """把账号邮箱换成一个新地址。

    必须凭**发到新地址**的验证码才能改：只校验旧邮箱的话，账号一旦被他人登录，
    对方就能把邮箱换走、随后用「忘记密码」彻底夺走账号。
    """

    email: str = Field(min_length=3, max_length=255)
    code: str = Field(min_length=4, max_length=12)
    password: str = Field(default="", min_length=0, max_length=128)


class ChangePasswordRequest(_Camel):
    """已登录账号修改密码。

    必须凭当前登录密码确认身份（挡住会话被劫持的最后一道锁）；改密后其它设备上的
    会话全部踢下线，只保留当前这一个。
    """

    old_password: str = Field(min_length=1, max_length=128, alias="oldPassword")
    new_password: str = Field(min_length=8, max_length=128, alias="newPassword")
    confirm_password: str = Field(min_length=8, max_length=128, alias="confirmPassword")


class VerifyEmailRequest(_Camel):
    """用验证码把「当前账号绑定的邮箱」标记为已验证。"""

    email: str = Field(min_length=3, max_length=255)
    code: str = Field(min_length=4, max_length=12)


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
    #: 乐观锁：前端打开「解除绑定」弹窗时记下当时的绑定快照，提交时回传；期间授权可能
    #: 已在别的标签页重绑。这些字段必须显式声明，schema 不认就会丢弃、校验形同不存在。
    expected_binding_id: str | None = Field(default=None, alias="expectedBindingId", max_length=64)
    expected_activated_at: datetime | None = Field(default=None, alias="expectedActivatedAt")
    expected_binding_version: str | None = Field(
        default=None, alias="expectedBindingVersion", max_length=128
    )


# 订单
class CreateOrderRequest(_Camel):
    product_id: str = Field(alias="productId", min_length=1, max_length=64)
    coupon_code: str | None = Field(default=None, alias="couponCode", max_length=64)
    #: 增量包需要指定要追加到哪一份授权（授权主键 ``License.id``）。
    target_license_id: str | None = Field(
        default=None,
        alias="targetLicenseId",
        max_length=64,
    )
    #: 「试用授权升级为永久」的既有授权：命中时不再另发新码，而是就地升级这张授权。
    upgrade_license_id: str | None = Field(
        default=None, alias="upgradeLicenseId", max_length=64
    )


class CouponPreviewRequest(_Camel):
    product_id: str = Field(alias="productId", min_length=1, max_length=64)
    coupon_code: str = Field(alias="couponCode", min_length=1, max_length=64)


# 邀请
class WithdrawalRequest(_Camel):
    points: float = Field(gt=0)
    request_key: str = Field(alias="requestKey", min_length=8, max_length=64)
    expected_fee_percent: float | None = Field(default=None, alias="expectedFeePercent")


# 管理后台
class _AdminBase(BaseModel):
    """后台请求体基类：**未知字段直接报 422**。

    商店侧 ``_Camel`` 用 ``extra="ignore"`` 容忍客户端多传字段；但后台是自己人用的界面，
    静默丢弃字段的代价是运营以为改动生效了（接口 200、库里没变），所以收紧成显式报错。
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

    字段与 ``AdminCouponRequest`` 对齐：优惠码发出去就很难收回，运营需要能改门槛、
    折扣、有效期与适用范围。``max_redemptions`` 允许下调，但不允许改成 0 或负数。
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
    # ---- 支付宝凭据（后台可改，免重启） ---------------------------------- #
    #: 留空 = 清掉站点配置、跟随环境变量；不传 = 保持不变。传回 GET 拿到的打码值
    #: （``••••`` 开头）同样视为「保持不变」，否则会把真密钥覆盖成 `••••abcd`。
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
    alipay_sandbox: bool | None = Field(default=None, alias="alipaySandbox")

    # ---- 注册邮箱验证码（后台可改，免重启） ------------------------------ #
    #: 与支付宝凭据同一套「留空即跟随环境变量」口径。
    mail_mode: str | None = Field(default=None, alias="mailMode", max_length=16)
    mail_from: str | None = Field(default=None, alias="mailFrom", max_length=255)
    smtp_host: str | None = Field(default=None, alias="smtpHost", max_length=255)
    #: 0 = 跟随环境变量 / 该加密方式的标准端口
    smtp_port: int | None = Field(default=None, alias="smtpPort", ge=0, le=65535)
    smtp_username: str | None = Field(default=None, alias="smtpUsername", max_length=255)
    #: 留空 = 不改动；传空串 = 清空（跟随环境变量）；传打码值 = 不改动
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
    #: 三态：不传 / null = 跟随环境变量，true / false = 显式覆盖
    expose_verification_code: bool | None = Field(
        default=None, alias="exposeVerificationCode"
    )
    #: 前端「清除已保存的授权码」勾选框走这个独立字段，避免和「留空不改动」打架。
    smtp_clear_password: bool | None = Field(default=None, alias="smtpClearPassword")


class AdminMailTestRequest(_AdminBase):
    """「邮件诊断 / 发送测试邮件」的收件人。

    刻意显式传参而不是发给当前管理员：排障常要往客户那个收不到验证码的邮箱发一封。
    留空表示**只做连接诊断**（域名解析、TCP/TLS、登录握手），不发任何邮件。
    """

    email: str | None = Field(default=None, min_length=3, max_length=255)


class AdminLicenseRequest(_AdminBase):
    email: str = Field(min_length=3, max_length=255)
    product_id: str = Field(alias="productId", min_length=1, max_length=64)
    validity_days: int | None = Field(default=None, alias="validityDays", ge=1)
    note: str | None = Field(default=None, max_length=255)


class AdminLicensePatch(_AdminBase):
    """授权的后台修正。

    ``extend_days`` 与 ``access_expires_at`` 互斥：前者在现有到期时间上顺延（永久授权
    以当前时刻重新计时），后者直接指定绝对时间；``access_expires_at`` 传 null 表示永久。
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
    #: 只对退款有意义：显式声明「这笔钱是在线下退的」。后台手动标记支付的订单没有
    #: 支付渠道交易，走网关必然失败，此时可勾选离线退款并如实记录金额与备注。
    offline: bool = False
    #: 只对退款有意义：本次退多少（分），留空表示退掉**剩余全部可退金额**。部分退款后
    #: 同一订单可退多次，每次都生成独立 ``order_refunds`` 流水并带唯一渠道幂等请求号。
    amount_cents: int | None = Field(default=None, alias="amountCents", gt=0)


class AdminOrderReviewRequest(_AdminBase):
    """「标记已处理」的复核结论。

    备注可选，但强烈建议填写：``review_note`` 是「这单为什么被标出来、为什么放行」的
    唯一记录，只有时间戳的条目事后等于没有信息。
    """

    note: str = Field(default="", max_length=200)
