"""ORM → 参考站风格 JSON 的序列化。

字段命名与 ``pay.habridge.cn`` 实测响应保持逐字段一致（camelCase）。
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta

from store.config import StoreSettings
from store.core.models import (
    Account,
    Customer,
    DeviceBinding,
    Entitlement,
    License,
    Order,
    Product,
    ProductImage,
    StoreSetting,
)
from store.commerce.order_status import order_status_label, refundable_cents
from store.security.security import iso, iso_z, utcnow
from store.ops.site_settings import resolve_device_release_cooldown

def json_list(value: str | None) -> list:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except (ValueError, TypeError):
        return []
    return parsed if isinstance(parsed, list) else []


def _now(reference: datetime | None = None) -> datetime:
    return reference or utcnow()


def list_json(values) -> str:
    return json.dumps(list(values), ensure_ascii=False, separators=(",", ":"))


# 商品
def available_stock_units(product: Product) -> int | None:
    """可售数量；``None`` 表示不限量（未设库存）。"""
    if product.stock_quantity is None:
        return None
    return max(0, int(product.stock_quantity) - int(product.reserved_stock or 0))


def is_sold_out(product: Product) -> bool:
    """是否售罄 —— **全站唯一**的售罄判据。

    单独抽出来是因为它被下单热路径用到，而那里过去为了拿到这一位，把
    ``_product_stats``（对全表 fulfilled 订单 ``GROUP BY``）和 ``_bundled_map``
    （全表商品）都算了一遍 —— 那两个数只用于商品卡片展示，与售罄无关（审计 S50）。
    判据留一份，也不会出现「前台显示可买、后端判定售罄」这种两侧各写一遍的偏差。
    """
    stock = available_stock_units(product)
    return stock is not None and stock <= 0


def product_payload(
    product: Product,
    image: ProductImage | None = None,
    *,
    bundled: dict[str, Product] | None = None,
    customer_count: int = 0,
    purchase_count: int = 0,
) -> dict:
    feature_codes = [str(code) for code in json_list(product.feature_codes_json)]
    included_ids = [str(item) for item in json_list(product.included_product_ids_json)]

    package_items = []
    for product_id in included_ids:
        bundled_product = (bundled or {}).get(product_id)
        if bundled_product is None:
            continue
        package_items.append(
            {
                "productId": bundled_product.id,
                "name": bundled_product.name,
                "productType": bundled_product.product_type,
                "featureCodes": [str(code) for code in json_list(bundled_product.feature_codes_json)],
            }
        )

    reserved = int(product.reserved_stock or 0)
    available_stock = available_stock_units(product)
    sold_out = is_sold_out(product)

    image_url = None
    if image is not None and image.path:
        version = image.version or ""
        image_url = f"/store/v1/product-images/{product.id}"
        if version:
            image_url = f"{image_url}?v={version}"

    return {
        "id": product.id,
        "name": product.name,
        "productCode": product.product_code,
        "priceCents": int(product.price_cents or 0),
        "validityDays": product.validity_days,
        "productType": product.product_type,
        "featureCodes": feature_codes,
        "includedProductIds": included_ids,
        "packageItems": package_items,
        "packageContentsLocked": bool(product.package_contents_locked),
        "isFullPrice": bool(product.is_full_price),
        "active": bool(product.active),
        "note": product.note,
        "displayDescription": product.display_description,
        "imageUrl": image_url,
        "badgeText": product.badge_text,
        "featured": bool(product.featured),
        "sortOrder": int(product.sort_order or 0),
        "fulfillmentMode": product.fulfillment_mode,
        "stockQuantity": product.stock_quantity,
        "reservedStock": reserved,
        "availableStock": available_stock,
        "soldOut": sold_out,
        "customerCount": int(customer_count or 0),
        "purchaseCount": int(purchase_count or 0),
        "createdAt": iso(product.created_at),
        "updatedAt": iso(product.updated_at),
    }


# 账号
def account_payload(account: Account) -> dict:
    return {
        "id": account.id,
        "email": account.email,
        # 邮箱是否已验证。未验证的账号会被 ``_require_verified`` 挡在「查看订单 /
        # 下单」之外，前端必须能看出来并给出「去验证」的入口，否则用户只会看到
        # 一个无法解释的 401。
        "emailVerified": account.email_verified_at is not None,
        "emailVerifiedAt": iso_z(account.email_verified_at),
        # 库内时间列都是 naive UTC，序列化必须带 Z 后缀：裸 ISO 串会被浏览器
        # ``new Date()`` 当成本地时间解析，东八区直接偏早 8 小时（授权显示
        # "已到期"、解绑冷却少算 8 小时）。
        "createdAt": iso_z(account.created_at),
        "lastLoginAt": iso_z(account.last_login_at),
        "lastDeviceReleaseAt": iso_z(account.last_device_release_at),
    }


def account_state_payload(
    account: Account, *, has_permanent: bool, has_temporary: bool, has_used_trial: bool = False
) -> dict:
    return {
        "account": account_payload(account),
        "hasLicense": bool(has_permanent or has_temporary),
        "hasPermanentLicense": bool(has_permanent),
        "hasTemporaryLicense": bool(has_temporary),
        "hasUsedTrial": bool(has_used_trial),
    }


def binding_version(binding: DeviceBinding | None) -> str | None:
    if binding is None:
        return None
    seed = f"{binding.id}:{binding.instance_id}:{iso(binding.activated_at)}"
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()


def device_payload(binding: DeviceBinding | None) -> dict | None:
    if binding is None:
        return None
    return {
        "bindingId": binding.id,
        "bindingVersion": binding_version(binding),
        "instanceId": binding.instance_id,
        "clientVersion": binding.client_version,
        "lastIp": binding.last_ip,
        "activatedAt": iso_z(binding.activated_at),
        "lastHeartbeatAt": iso_z(binding.last_heartbeat_at),
    }


def device_release_policy(
    *,
    cooldown_seconds: int,
    last_released_at: datetime | None,
    now: datetime | None = None,
) -> dict:
    moment = _now(now)
    if last_released_at is None:
        return {
            "cooldownSeconds": int(cooldown_seconds),
            "lastReleasedAt": None,
            "nextAllowedAt": None,
            "remainingSeconds": 0,
        }
    next_allowed = last_released_at + timedelta(seconds=int(cooldown_seconds))
    remaining = int(max(0, (next_allowed - moment).total_seconds()))
    return {
        "cooldownSeconds": int(cooldown_seconds),
        "lastReleasedAt": iso_z(last_released_at),
        "nextAllowedAt": iso_z(next_allowed) if remaining > 0 else None,
        "remainingSeconds": remaining,
    }


def license_payload(
    license: License,
    *,
    customer: Customer | None,
    binding: DeviceBinding | None,
    cooldown_seconds: int,
    last_released_at: datetime | None,
    now: datetime | None = None,
) -> dict:
    moment = _now(now)
    access_expires = license.access_expires_at
    active = bool(license.active) and (
        access_expires is None or access_expires > moment
    )
    return {
        "activationCode": license.activation_code,
        "activationCodeId": license.id,
        "codeHint": license.code_hint,
        "customerId": license.customer_id,
        # 前台需要它来判断「这个商品我是不是已经买过」，用于重复购买的二次确认。
        "productId": license.product_id,
        "customerName": customer.name if customer is not None else "",
        "accountEmail": customer.email if customer is not None else "",
        "productName": license.product_name,
        "productType": license.product_type,
        "priceCents": int(license.price_cents or 0),
        "validityDays": license.validity_days,
        "issuanceSource": license.issuance_source,
        "userLabel": license.user_label,
        "active": active,
        # 全部走 iso_z：见 account_payload 里的说明（裸 ISO 串在浏览器里会偏 8 小时）。
        "createdAt": iso_z(license.created_at),
        "issuedAt": iso_z(license.issued_at),
        "accessStartedAt": iso_z(license.access_started_at),
        "accessExpiresAt": iso_z(access_expires),
        "device": device_payload(binding),
        "deviceReleasePolicy": device_release_policy(
            cooldown_seconds=cooldown_seconds,
            last_released_at=last_released_at,
            now=moment,
        ),
    }


def entitlement_payload(entitlement: Entitlement, *, now: datetime | None = None) -> dict:
    moment = _now(now)
    expired = entitlement.expires_at is not None and entitlement.expires_at <= moment
    return {
        "id": entitlement.id,
        "customerId": entitlement.customer_id,
        "licenseId": entitlement.license_id,
        "productId": entitlement.product_id,
        "productName": entitlement.product_name,
        "productType": entitlement.product_type,
        "featureCode": entitlement.feature_code,
        "startsAt": iso_z(entitlement.starts_at),
        "expiresAt": iso_z(entitlement.expires_at),
        "active": bool(entitlement.active) and not expired,
    }


# 订单
def order_payload(order: Order) -> dict:
    payment = {}
    try:
        payment = json.loads(order.payment_payload_json or "{}")
    except (ValueError, TypeError):
        payment = {}
    return {
        "orderNo": order.order_no,
        "lookupToken": order.lookup_token,
        "email": order.email,
        "customerId": order.customer_id,
        "productName": order.product_name,
        "productType": order.product_type,
        "orderType": order.order_type,
        "licenseAction": order.license_action,
        "licenseId": order.license_id,
        "targetLicenseId": order.target_license_id,
        "originalAmountCents": int(order.original_amount_cents or 0),
        "discountCents": int(order.discount_cents or 0),
        "amountCents": int(order.amount_cents or 0),
        "couponCode": order.coupon_code,
        "status": order.status,
        "statusLabel": order_status_label(order.status),
        "fulfillmentMode": order.fulfillment_mode,
        "payment": payment,
        "refundAmountCents": int(order.refund_amount_cents or 0),
        #: 还能退多少（分）。支持多次部分退款之后，后台必须知道「剩余可退」，
        #: 否则第二次退款只能靠运营自己心算已退金额。
        "refundableCents": refundable_cents(
            order.amount_cents, order.refund_amount_cents
        ),
        "refundTradeNo": order.refund_trade_no,
        "needsReview": bool(order.needs_review),
        "reviewNote": order.review_note or "",
        #: 这笔订单的「已支付」是人工补记的（S8）：照常发码，但**不计入营收**。
        #: 后台必须能看见它，否则「营收比订单少」就成了一处没有解释的偏差。
        "manualSettlement": bool(order.manual_settlement),
        #: 这一单是否改过一张**已有**授权（升级 / 增量包履约前留下的快照非空）。
        #: 后台「删除订单」的守卫之一：前端必须用同一口径，否则会出现「按钮能点但
        #: 后端 409」的错位。注意与 ``targetLicenseId`` 的区别——后者在下单时就写入，
        #: 只表示「打算改谁」，不能当删除判据（见 admin_delete_order）。
        "targetLicenseModified": bool(order.license_state_before_json),
        "codeHint": order.license.code_hint if order.license is not None else None,
        "createdAt": iso_z(order.created_at),
        "expiresAt": iso_z(order.expires_at),
        "paidAt": iso_z(order.paid_at),
        "fulfilledAt": iso_z(order.fulfilled_at),
        "cancelledAt": iso_z(order.cancelled_at),
        "refundedAt": iso_z(order.refunded_at),
        "archivedAt": iso_z(order.archived_at),
    }


def account_center_payload(
    *,
    account: Account,
    setting: StoreSetting,
    settings: StoreSettings,
    licenses: list[License],
    license_meta: dict[str, dict],
    entitlements: list[Entitlement],
    orders: list[Order],
    orders_total: int | None = None,
    has_used_trial: bool = False,
    now: datetime | None = None,
) -> dict:
    moment = _now(now)
    cooldown = resolve_device_release_cooldown(setting, settings)
    license_items = []
    for license in licenses:
        meta = license_meta.get(license.id, {})
        license_items.append(
            license_payload(
                license,
                customer=meta.get("customer"),
                binding=meta.get("binding"),
                cooldown_seconds=cooldown,
                last_released_at=meta.get("last_released_at"),
                now=moment,
            )
        )
    return {
        "account": account_payload(account),
        "deviceReleasePolicy": {"cooldownSeconds": cooldown},
        "licenses": license_items,
        "entitlements": [entitlement_payload(item, now=moment) for item in entitlements],
        "orders": [order_payload(order) for order in orders],
        #: 订单总数与 ``orders`` 的长度可能不同：账号中心只取最近若干单，
        #: 没有这个数字前端就只能显示「已加载的」条数，用户看到第 50 单封顶
        #: 会以为更早的订单丢了（过去连「还有更多」的提示都没有）。
        "ordersTotal": int(orders_total if orders_total is not None else len(orders)),
        # 前台靠它决定「试用还能不能买」。这个字段过去从来没人赋值，
        # 于是 store.js 里那条规则是死代码。
        "hasUsedTrial": bool(has_used_trial),
        "serverTime": iso_z(moment),
    }
