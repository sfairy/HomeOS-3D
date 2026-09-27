"""运营后台的 products 资源组（从 api/admin.py 拆出）。

路由在原文件里是分散的（2 段），因此本模块有两个子路由：
第一段用 router、其余段用 router_extra —— 父路由在各自原来的位置分别 include，
以此保持路由注册顺序（FastAPI 按注册序匹配）。
"""
from __future__ import annotations

from __future__ import annotations

import logging
import secrets

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status
from sqlalchemy import or_, select

from apps.store.ops import features
from apps.store.commerce import catalog
from apps.store.core.deps import AdminAccount, DbSession, SettingsDep
from apps.store.core.models import (
    Product,
    ProductImage,
)
from apps.store.core.schemas import (
    AdminProductPatch,
    AdminProductRequest,
)
from apps.store.security.security import (
    utcnow,
)  # noqa: F401
from apps.store.core.serializers import (
    json_list,
    list_json,
)

logger = logging.getLogger("apps.store.admin")


# 共享助手在 admin_shared.py；这里再导入一次，
# 于是本文件剩下的 57 条路由不用改任何一处调用。
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

    删除守卫的依据（授权数 / 订单数）仍然按**全量**商品统计：它决定「能真删还是
    只能下架」，随分页变化会让确认弹窗的预告跟实际行为不一致。
    """
    base = select(Product)
    if keyword:
        like = f"%{keyword.strip()}%"
        base = base.where(
            or_(
                Product.name.like(like),
                Product.product_code.like(like),
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
        # 「低库存」没有全局阈值，这里取「可售 ≤ 5」这一运营常用口径；
        # 真实的分级预警在概览页按可售升序展示。
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
) -> None:
    """校验商品的可枚举字段，并拦下「什么都不会发放」的套餐配置。
    枚举值（``product_type`` / ``fulfillment_mode`` / 功能码）写错一个字母不会报错但会静默走错分支，
    必须按 ``apps.store.commerce.catalog`` 校验。功能码为空时用户付了钱却拿不到任何功能码，激活会因空
    功能集被 422 拒绝；该检查只对 ``package`` 强制（单卖商品允许先建后补功能码）。
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
        # 能力码清单在主项目（``apps/server/license/service.py``）与
        # ``apps/store/ops/features.py`` 里各有一份、必须同步；抄错的码不会让任何一步报错，
        # 只会在客户端被静默拦截，所以宁可在这里拒绝。
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                f"功能码 {'、'.join(unknown)} 不在能力目录里，客户端不会认它。"
                "请从「功能码」选择器里勾选。"
            ),
        )

    if str(product_type or "").strip() != "package":
        return
    if codes:
        return
    if [str(item).strip() for item in (included_product_ids or []) if str(item).strip()]:
        return
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail="套餐必须填写功能码，或指定「套餐包含商品 ID」，否则发货后客户端拿不到任何能力。",
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
    )
    product = Product(
        name=payload.name,
        product_code=payload.product_code or "homeos",
        price_cents=payload.price_cents,
        original_price_cents=payload.original_price_cents,
        is_full_price=payload.is_full_price,
        validity_days=payload.validity_days,
        product_type=payload.product_type,
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
    # product_code 是结算与授权里的产品标识，绝不能留空（留空会让下游按空标识建授权）
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
    )
    session.flush()
    _audit(session, _admin_actor(admin), "product.update", product.id)
    return _product_admin_payload(session, product)


@router.delete("/products/{product_id}")
def admin_delete_product(
    product_id: str, session: DbSession, admin: AdminAccount, settings: SettingsDep
) -> dict:
    product = _product_or_404(session, product_id)

    # 有历史授权或订单的商品只下架，不做物理删除：Order.product_id 是 NOT NULL 外键且无
    # ondelete，SQLite 又开了 foreign_keys=ON，物理删除会撞 FK 约束直接 500。
    # 计数复用 _product_delete_refs，保证与列表接口的 licenseCount / orderCount 同一口径。
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

    # 物理删除：数据库里 product_images 是 ON DELETE CASCADE，但磁盘上的图片文件
    # 不会被连带清理，这里先把路径收集出来，删完行之后再把文件删掉。
    # 路径必须过 _safe_image_target —— 这是本函数原先唯一漏掉边界校验的文件操作。
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
        except OSError:  # pragma: no cover - 文件被占用/权限问题时不该影响删除结果
            logger.warning("商品图文件删除失败：%s", target)

    _audit(session, _admin_actor(admin), "product.delete", product.id, product.name)
    return {"id": product_id, "deleted": True, "deactivated": False}


#: 商品图上传的体积上限。
IMAGE_MAX_BYTES = 8 * 1024 * 1024


def _image_suffix(content: bytes) -> str | None:
    """按**字节**判断图片格式，返回落盘用的后缀（不认识就 ``None``）。
    只看文件名后缀不行：后缀是调用方随便写的，SVG 改名成 ``.png`` 就绕过白名单，而静态目录是按
    后缀回 ``Content-Type`` 的。按内容派生后缀而非校验一致性，是为了不把「一张 JPEG 存成 logo.png」
    变成报错。只认四种有明确签名的格式，刻意**不含 SVG** —— 它能内嵌 ``<script>``，等于同源 XSS 落点。
    """
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if content.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if content[:6] in {b"GIF87a", b"GIF89a"}:
        return ".gif"
    # WebP 是 RIFF 容器：0-4 是 "RIFF"，8-12 是 "WEBP"（中间 4 字节是长度）
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

    写成同步 ``def``：读文件、校验大小、落盘、写库全是阻塞操作，而这个端点的
    上传上限是 8MB —— 放事件循环上，一次慢盘写入就能卡住整个服务。
    同步端点里用 ``file.file``（底层 SpooledTemporaryFile）同步读取即可，
    不需要 ``await file.read()``。
    """
    product = _product_or_404(session, product_id)
    settings = request.app.state.settings
    folder = settings.product_images_dir
    folder.mkdir(parents=True, exist_ok=True)

    # 先按上限 + 1 字节读：超限时我们已经知道「超了」，不需要把整个文件读进内存。
    # 读满上限才可能落盘，所以这一次 read 的内存占用被硬封顶。
    content = file.file.read(IMAGE_MAX_BYTES + 1)
    if len(content) > IMAGE_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="图片不能超过 8MB。",
        )

    # 格式**按内容判定**，不看文件名 —— 见 ``_image_suffix`` 的说明。
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
    # 换格式（png → jpg）时旧文件名不再被引用，先删掉，否则磁盘上会留孤儿文件。
    # 路径是上传时自己按 product.id + 白名单后缀拼的，但仍然按目录边界校验一次
    # （与另外两处删除点共用同一份判定，见 _safe_image_target）。
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
    return {"id": product.id, "imageUrl": f"/store/v1/product-images/{product.id}?v={version}"}


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
        # 防目录穿越：库里的 path 是上传时自己拼的文件名，但不排除被改过，
        # 越界的路径只清记录、不碰文件。
        if target is None:
            logger.warning("商品图片路径越界，跳过文件删除：%s", image.path)
            missing.append(image.path)
        elif target.is_file():
            try:
                target.unlink()
                removed.append(image.path)
            except OSError as exc:
                # 文件删不掉也要把记录清掉，否则列表里会挂着一张点不开的图
                logger.warning("删除商品图片文件失败 %s：%s", target, exc)
                missing.append(image.path)
        else:
            missing.append(image.path)
        session.delete(image)

    session.flush()
    _audit(session, _admin_actor(admin), "product.image_delete", product.id, ",".join(image_path for image_path in removed))
    return {"id": product.id, "removed": removed, "missing": missing, "imageUrl": None}
