"""运营后台的 products 资源组。
"""
from __future__ import annotations

import logging
import secrets

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status
from sqlalchemy import or_, select

from ..commerce import catalog
from ..core.deps import AdminAccount, DbSession, SettingsDep
from ..core.models import (
    Product,
    ProductImage,
)
from ..core.schemas import (
    AdminProductPatch,
    AdminProductRequest,
)
from ..core.serializers import (
    json_list,
    list_json,
)
from ..ops import features
from ..security.security import (
    utcnow,
)

logger = logging.getLogger("src.admin")


from .admin_shared import (
    _admin_actor,
    _admin_product_context,
    _audit,
    _count_rows,
    _page_bounds,
    _product_admin_payload,
    _product_delete_refs,
    _product_or_404,
    _safe_image_target,
)

router = APIRouter()

router_extra = APIRouter()


@router.get("/products")
def admin_list_products(
    session: DbSession,
    _admin: AdminAccount,
    keyword: str | None = None,
    status_filter: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    """商品列表（分页 + 筛选）。
    """
    base = select(Product)
    if keyword:
        like = f"%{keyword.strip()}%"
        base = base.where(
            or_(
                Product.name.like(like),
                Product.product_code.like(like),
                Product.edition.like(like),
                Product.feature_codes_json.like(like),
                Product.display_description.like(like),
            )
        )
    status_value = (status_filter or "").strip()
    if status_value == "active":
        base = base.where(Product.active.is_(True))
    elif status_value == "inactive":
        base = base.where(Product.active.is_(False))
    elif status_value == "soldout":
        base = base.where(
            Product.active.is_(True),
            Product.stock_quantity.is_not(None),
            Product.stock_quantity - Product.reserved_stock <= 0,
        )
    elif status_value == "lowstock":
        base = base.where(
            Product.active.is_(True),
            Product.stock_quantity.is_not(None),
            Product.stock_quantity - Product.reserved_stock <= 5,
        )

    size, skip = _page_bounds(limit, offset)
    total = _count_rows(session, base)
    rows = list(
        session.scalars(
            base.order_by(Product.sort_order, Product.created_at).limit(size).offset(skip)
        )
    )
    context = _admin_product_context(session, [product.id for product in rows])
    return {
        "items": [_product_admin_payload(session, product, context) for product in rows],
        "total": total,
        "limit": size,
        "offset": skip,
    }


def _assert_product_configuration(
    product_type: str,
    fulfillment_mode: str,
    feature_codes: list,
    included_product_ids: list,
    *,
    active: bool = True,
) -> None:
    """校验商品的可枚举字段，并拦下「卖得出去但激活不了」的配置。

    ``active`` 为假（草稿 / 已下架）时放行：运营可以先建一个还没配好功能码的商品，
    只要不把它上架。
    """
    try:
        catalog.validate_product_type(product_type)
        catalog.validate_fulfillment_mode(fulfillment_mode)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)
        ) from error

    codes = [str(code).strip() for code in (feature_codes or []) if str(code).strip()]
    unknown = sorted({code for code in codes if code not in features.FEATURE_CODES})
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                f"功能码 {'、'.join(unknown)} 不在能力目录里，客户端不会认它。"
                "请从「功能码」选择器里勾选。"
            ),
        )

    if not active:
        return
    if codes:
        return
    if [str(item).strip() for item in (included_product_ids or []) if str(item).strip()]:
        return
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=(
            "上架商品必须至少有一个功能码，或指定「套餐包含商品 ID」："
            "授权在激活时没有功能码会被直接拒绝，漏配的商品会让买家付款后拿到一张"
            "激活不了的码。"
        ),
    )


@router.post("/products")
def admin_create_product(
    payload: AdminProductRequest, session: DbSession, admin: AdminAccount
) -> dict:
    _assert_product_configuration(
        payload.product_type,
        payload.fulfillment_mode,
        payload.feature_codes,
        payload.included_product_ids,
        active=bool(payload.active),
    )
    product = Product(
        name=payload.name,
        product_code=payload.product_code or "homeos",
        price_cents=payload.price_cents,
        original_price_cents=payload.original_price_cents,
        is_full_price=payload.is_full_price,
        validity_days=payload.validity_days,
        product_type=payload.product_type,
        edition=payload.edition,
        feature_codes_json=list_json(payload.feature_codes),
        included_product_ids_json=list_json(payload.included_product_ids),
        package_contents_locked=payload.package_contents_locked,
        active=payload.active,
        note=payload.note,
        display_description=payload.display_description,
        badge_text=payload.badge_text,
        featured=payload.featured,
        sort_order=payload.sort_order,
        fulfillment_mode=payload.fulfillment_mode,
        stock_quantity=payload.stock_quantity,
        requires_license=payload.requires_license,
    )
    session.add(product)
    session.flush()
    _audit(session, _admin_actor(admin), "product.create", product.id, product.name)
    return _product_admin_payload(session, product)


@router.patch("/products/{product_id}")
def admin_update_product(
    product_id: str, payload: AdminProductPatch, session: DbSession, admin: AdminAccount
) -> dict:
    product = _product_or_404(session, product_id)
    mapping = {
        "name": "name",
        "product_code": "product_code",
        "price_cents": "price_cents",
        "original_price_cents": "original_price_cents",
        "is_full_price": "is_full_price",
        "validity_days": "validity_days",
        "product_type": "product_type",
        "edition": "edition",
        "package_contents_locked": "package_contents_locked",
        "active": "active",
        "note": "note",
        "display_description": "display_description",
        "badge_text": "badge_text",
        "featured": "featured",
        "sort_order": "sort_order",
        "fulfillment_mode": "fulfillment_mode",
        "stock_quantity": "stock_quantity",
        "requires_license": "requires_license",
    }
    data = payload.model_dump(exclude_unset=True)
    for field, column in mapping.items():
        if field in data:
            setattr(product, column, data[field])
    if not product.product_code:
        product.product_code = "homeos"
    if "feature_codes" in data:
        product.feature_codes_json = list_json(data["feature_codes"] or [])
    if "included_product_ids" in data:
        product.included_product_ids_json = list_json(data["included_product_ids"] or [])
    _assert_product_configuration(
        product.product_type,
        product.fulfillment_mode,
        json_list(product.feature_codes_json),
        json_list(product.included_product_ids_json),
        active=bool(product.active),
    )
    session.flush()
    _audit(session, _admin_actor(admin), "product.update", product.id)
    return _product_admin_payload(session, product)


@router.delete("/products/{product_id}")
def admin_delete_product(
    product_id: str, session: DbSession, admin: AdminAccount, settings: SettingsDep
) -> dict:
    product = _product_or_404(session, product_id)

    license_counts, order_counts = _product_delete_refs(session)
    license_count = int(license_counts.get(product.id, 0))
    order_count = int(order_counts.get(product.id, 0))

    if license_count or order_count:
        product.active = False
        parts = []
        if license_count:
            parts.append(f"{license_count} 条授权")
        if order_count:
            parts.append(f"{order_count} 笔订单")
        reason = "、".join(parts) + "引用该商品，改为下架"
        session.flush()
        _audit(session, _admin_actor(admin), "product.deactivate", product.id, reason)
        return {
            "id": product.id,
            "deleted": False,
            "deactivated": True,
            "licenses": license_count,
            "orders": order_count,
            "reason": reason,
        }

    image_paths = [
        image.path
        for image in session.scalars(
            select(ProductImage).where(ProductImage.product_id == product.id)
        )
        if image.path
    ]

    session.delete(product)
    session.flush()
    image_root = settings.product_images_dir.resolve()
    for raw_path in image_paths:
        target = _safe_image_target(image_root, raw_path)
        if target is None:
            logger.warning("商品图片路径越界，跳过文件删除：%s", raw_path)
            continue
        try:
            target.unlink(missing_ok=True)
        except OSError:
            logger.warning("商品图文件删除失败：%s", target)

    _audit(session, _admin_actor(admin), "product.delete", product.id, product.name)
    return {"id": product_id, "deleted": True, "deactivated": False}


IMAGE_MAX_BYTES = 8 * 1024 * 1024


def _image_suffix(content: bytes) -> str | None:
    """按**字节**判断图片格式，返回落盘用的后缀（不认识就 ``None``）。
    """
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if content.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if content[:6] in {b"GIF87a", b"GIF89a"}:
        return ".gif"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return ".webp"
    return None


@router.post("/products/{product_id}/image")
def admin_upload_product_image(
    product_id: str,
    request: Request,
    session: DbSession,
    admin: AdminAccount,
    file: UploadFile = File(...),
) -> dict:
    """上传商品自定义图片（同步端点，跑在线程池里）。
    """
    product = _product_or_404(session, product_id)
    settings = request.app.state.settings
    folder = settings.product_images_dir
    folder.mkdir(parents=True, exist_ok=True)

    content = file.file.read(IMAGE_MAX_BYTES + 1)
    if len(content) > IMAGE_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="图片不能超过 8MB。",
        )

    suffix = _image_suffix(content)
    if suffix is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "只支持 PNG / JPEG / WebP / GIF 图片（按文件内容识别，与文件名无关）。"
                "SVG 不支持：它是能内嵌脚本的 XML，而商品图是按原样回给浏览器的同源资源。"
            ),
        )

    relative = f"{product.id}{suffix}"
    target = folder / relative

    image = session.scalars(
        select(ProductImage).where(ProductImage.product_id == product.id)
    ).first()
    if image is not None and image.path != relative:
        stale = _safe_image_target(folder, image.path)
        if stale is not None and stale.is_file():
            try:
                stale.unlink()
            except OSError as exc:
                logger.warning("清理旧商品图失败 %s：%s", stale, exc)

    target.write_bytes(content)

    version = secrets.token_hex(6)
    if image is None:
        image = ProductImage(product_id=product.id, path=relative, version=version)
        session.add(image)
    else:
        image.path = relative
        image.version = version
    image.updated_at = utcnow()
    session.flush()
    _audit(session, _admin_actor(admin), "product.image", product.id, relative)
    return {"id": product.id, "imageUrl": f"/store/v1/product-images/{product.id}"}


@router_extra.delete("/products/{product_id}/image")
def admin_delete_product_image(
    product_id: str, request: Request, session: DbSession, admin: AdminAccount
) -> dict:
    """移除商品自定义图片（含磁盘文件），回落到默认标识。"""
    product = _product_or_404(session, product_id)
    images = list(
        session.scalars(select(ProductImage).where(ProductImage.product_id == product.id))
    )
    if not images:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="该商品没有自定义图片。"
        )

    settings = request.app.state.settings
    root = settings.product_images_dir.resolve()
    removed: list[str] = []
    missing: list[str] = []
    for image in images:
        target = _safe_image_target(root, image.path)
        if target is None:
            logger.warning("商品图片路径越界，跳过文件删除：%s", image.path)
            missing.append(image.path)
        elif target.is_file():
            try:
                target.unlink()
                removed.append(image.path)
            except OSError as exc:
                logger.warning("删除商品图片文件失败 %s：%s", target, exc)
                missing.append(image.path)
        else:
            missing.append(image.path)
        session.delete(image)

    session.flush()
    _audit(session, _admin_actor(admin), "product.image_delete", product.id, ",".join(image_path for image_path in removed))
    return {"id": product.id, "removed": removed, "missing": missing, "imageUrl": None}
