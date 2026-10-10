"""ORM → 参考站风格 JSON 的序列化。
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta

from ..commerce.order_status import order_status_label, refundable_cents
from ..config import StoreSettings
from ..core.models import (
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
from ..ops.site_settings import resolve_device_release_cooldown
from ..security.security import iso, iso_z, utcnow


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


def available_stock_units(product: Product) -> int | None:
    """可售数量；``None`` 表示不限量（未设库存）。"""
    if product.stock_quantity is None:
        return None
    return max(0, int(product.stock_quantity) - int(product.reserved_stock or 0))


def is_sold_out(product: Product) -> bool:
    """是否售罄 —— **全站唯一**的售罄判据。
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
        image_url = f"/store/v1/product-images/{product.id}"

    return {
        "id": product.id,
        "name": product.name,
        "productCode": product.product_code,
        "priceCents": int(product.price_cents or 0),
        "validityDays": product.validity_days,
        "productType": product.product_type,
        "edition": product.edition,
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


def account_payload(account: Account) -> dict:
    return {
        "id": account.id,
        "username": account.username,
        "email": account.email,
        "isAdmin": bool(account.is_admin),
        "emailVerified": account.email_verified_at is not None,
        "emailVerifiedAt": iso_z(account.email_verified_at),
        "createdAt": iso_z(account.created_at),
        "lastLoginAt": iso_z(account.last_login_at),
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
    if binding is None or not binding.is_live:
        return None
    return {
        "bindingId": binding.id,
        "bindingVersion": binding_version(binding),
        "instanceId": binding.instance_id,
        "clientVersion": binding.client_version,
        "accountName": binding.account_name,
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


ISSUANCE_SOURCE_LABELS: dict[str, str] = {
    "manual": "后台手动发卡",
    "payment_automatic": "支付后自动发卡",
}


def issuance_source_label(source: str | None) -> str:
    """来源码 → 中文名；未知值返回空串，由前台回落到「后台发放」。"""
    return ISSUANCE_SOURCE_LABELS.get((source or "").strip(), "")


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
        "productId": license.product_id,
        "customerName": customer.name if customer is not None else "",
        "accountEmail": customer.email if customer is not None else "",
        "productName": license.product_name,
        "productType": license.product_type,
        "priceCents": int(license.price_cents or 0),
        "validityDays": license.validity_days,
        "issuanceSource": license.issuance_source,
        "issuanceSourceLabel": issuance_source_label(license.issuance_source),
        "manuallyIssued": license.issuance_source == "manual",
        "userLabel": license.user_label,
        "active": active,
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
        "refundableCents": refundable_cents(
            order.amount_cents, order.refund_amount_cents
        ),
        "refundTradeNo": order.refund_trade_no,
        "needsReview": bool(order.needs_review),
        "reviewNote": order.review_note or "",
        "manualSettlement": bool(order.manual_settlement),
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
        "ordersTotal": int(orders_total if orders_total is not None else len(orders)),
        "hasUsedTrial": bool(has_used_trial),
        "serverTime": iso_z(moment),
    }
