"""公开商品目录的进程内读缓存 + 强 ETag。

/store/v1/products 是商店首页每次冷启动都会拉的公开端点，但一次响应要跑 4 条查询：
商品图映射、套餐包含映射、在售商品、销量/客户数聚合。商店是单进程部署，SQLite 又是
本机文件库，所以这里用「短 TTL + 写入口精确失效」而不是外部缓存：

- TTL 默认 5s，只吸收同一时刻的重复读与首页并发；超过 TTL 的首次读会重新查库，
  因此订单/授权变化最多延迟一个 TTL 反映到销量数字（不影响任何授权判定）。
- 商品增删改、图片上传/删除在 commit 之后立即失效（见 mark_products_changed 与
  after_commit 监听），不依赖 TTL。
- 缓存的是「最终响应字节」，所以 ETag 与 200 响应的 body 严格一致；条件请求命中时
  直接返回 304，不解析文档、不查库。
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from dataclasses import dataclass
from typing import Any

from sqlalchemy import event, select
from sqlalchemy.orm import Session

from .store_catalog import _bundled_map, _image_map, _product_stats
from ..core.models import Product
from ..core.serializers import product_payload

#: 在 Session.info 里标记「本次事务改过商品目录」，提交后统一失效。
_DIRTY_KEY = "store_products_cache_dirty"


@dataclass(frozen=True)
class ProductsPayload:
    """一次 /products 响应的可复用字节与校验器。"""

    payload: dict[str, Any]
    body: bytes
    etag: str


_lock = threading.Lock()
_entry: ProductsPayload | None = None
_entry_expires_at = 0.0
_generation = 0


def _build(session: Session) -> ProductsPayload:
    images = _image_map(session)
    bundled = _bundled_map(session)
    products = session.scalars(
        select(Product)
        .where(Product.active.is_(True))
        .order_by(Product.sort_order, Product.created_at)
    ).all()
    stats = _product_stats(session, [product.id for product in products])
    payload = {
        "items": [
            product_payload(
                product,
                images.get(product.id),
                bundled=bundled,
                customer_count=int(stats["customer"].get(product.id, 0)),
                purchase_count=int(stats["purchase"].get(product.id, 0)),
            )
            for product in products
        ]
    }
    body = json.dumps(
        payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")
    ).encode("utf-8")
    # 强 ETag：body 不变则 ETag 不变。只取 32 个 hex（128 bit），足够区分内容。
    etag = '"' + hashlib.sha256(body).hexdigest()[:32] + '"'
    return ProductsPayload(payload=payload, body=body, etag=etag)


def get_products_payload(session: Session, ttl_seconds: float) -> ProductsPayload:
    """取商品目录响应；TTL 内复用同一份字节，过期后重建。

    构建放在锁内是有意的：冷缓存时 32 个并发只会有一个线程查库，其余等待后直接命中，
    避免「缓存刚过期就被并发打穿」。单次构建是 4 条本机 SQLite 查询，锁窗口很小。
    """
    global _entry, _entry_expires_at
    ttl = max(0.0, float(ttl_seconds))
    with _lock:
        if _entry is not None and _entry_expires_at > time.monotonic():
            return _entry
        generation = _generation
        entry = _build(session)
        if ttl > 0 and generation == _generation:
            _entry = entry
            _entry_expires_at = time.monotonic() + ttl
        else:
            _entry = None
            _entry_expires_at = 0.0
        return entry


def invalidate_products_cache() -> None:
    """立即让缓存失效；下一次读会重新查库。"""
    global _entry, _entry_expires_at, _generation
    with _lock:
        _generation += 1
        _entry = None
        _entry_expires_at = 0.0


def mark_products_changed(session: Session) -> None:
    """在写事务里标记商品目录已变化；commit 后由监听器失效缓存。

    必须在写操作成功（flush 之后）调用：如果事务回滚，标记会被丢弃，缓存保持不变。
    """
    session.info[_DIRTY_KEY] = True


def etag_matches(if_none_match: str | None, etag: str) -> bool:
    """RFC 9110 If-None-Match 匹配（支持逗号列表、W/ 前缀与 *）。"""
    if not if_none_match:
        return False
    normalized = etag.removeprefix("W/")
    return any(
        value == "*" or value.removeprefix("W/") == normalized
        for value in (part.strip() for part in if_none_match.split(","))
    )


@event.listens_for(Session, "after_commit")
def _invalidate_after_commit(session: Session) -> None:  # pyright: ignore[reportUnusedFunction]
    if session.info.pop(_DIRTY_KEY, False):
        invalidate_products_cache()


@event.listens_for(Session, "after_rollback")
def _discard_marker_after_rollback(session: Session) -> None:  # pyright: ignore[reportUnusedFunction]
    session.info.pop(_DIRTY_KEY, None)
