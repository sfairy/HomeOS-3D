"""实体状态路由（``/api/v1/entities/*``）。

逐条对齐 Nest ``StateStoreController``：

- ``GET  entities``：实体列表（page/limit、cursor/limit 或 offset/limit 分页，直读 StateStore 单读模型）；
- ``GET  entities/changed``：增量变更（基于 recentChanges 环形缓冲）；
- ``GET  entities/areas/list``：HA 区域列表（area_registry）；
- ``GET  entities/:entity_id/references``：查询引用该实体的功能配置；
- ``POST entities/:entity_id/references/unlink``：移除引用（admin/adult）；
- ``POST entities/batch/get``：批量冷补全；
- ``POST entities/batch/area``：批量更新实体房间（admin/adult）；
- ``GET  entities/:entity_id``：单实体（refresh=ha 时从 HA 拉取最新并回写缓存）。
"""

from __future__ import annotations

import asyncio
import inspect
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import Depends, Query, Request
from pydantic import BeforeValidator
from sqlalchemy import select

from .router import NestRouter
from .schemas.base import StrictModel
from ..domains.ha.integration.connection_query import active_connection
from ..platform.core.db.models import HAArea, HAAreaEntityOrder
from ..platform.core.db.pagination import (
    MAX_SAFE_INTEGER,
    clamp_int,
    parse_bounded_limit,
    parse_crud_pagination,
    parse_int_10,
)
from ..platform.core.http.errors import api_error, forbidden, not_found
from ..platform.core.runtime.booleans import parse_boolean_query
from ..platform.security.auth_context import require_user
from ..platform.security.entity_access import (
    filter_entities_by_access,
    is_entity_allowed,
    resolve_entity_restrictions,
)
from ..realtime.state_store import (
    filter_entities_by_query,
    normalize_entity_sort_filter,
    normalize_entity_status_filter,
    slice_entities_by_cursor,
)

router = NestRouter(prefix="/entities", tags=["connect"])

logger = logging.getLogger(__name__)


def _string_value(message: str):
    def check(value: Any) -> Any:
        if value is None or isinstance(value, str):
            return value
        raise ValueError(message)

    return check


def _string_list(array_message: str, item_message: str):
    def check(value: Any) -> Any:
        if value is None:
            return value
        if not isinstance(value, list):
            raise ValueError(array_message)
        if any(not isinstance(item, str) for item in value):
            raise ValueError(item_message)
        return value

    return check


EntityIdsField = Annotated[list[str], BeforeValidator(_string_list("entity_ids 须为数组", "entity_ids 每项须为字符串"))]
AreaIdField = Annotated[str, BeforeValidator(_string_value("area_id 须为字符串"))]
KindField = Annotated[str, BeforeValidator(_string_value("kind 须为字符串"))]
IdField = Annotated[str, BeforeValidator(_string_value("id 须为字符串"))]
DetailField = Annotated[str, BeforeValidator(_string_value("detail 须为字符串"))]


class StateStoreQueryDto(StrictModel):
    entity_ids: EntityIdsField | None = None
    area_id: AreaIdField | None = None


class UnlinkEntityReferenceDto(StrictModel):
    kind: KindField | None = None
    id: IdField | None = None
    detail: DetailField | None = None


def _store(request: Request):
    return request.app.state.realtime.state_store


def _entity_area(request: Request):
    return request.app.state.entity_area


def _references(request: Request):
    return request.app.state.entity_references


def _iso_now() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


@router.get("/domains")
async def get_domains(
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    """域汇总：``{domain, count}`` 按数量倒序（前端 domain 筛选条用）。"""
    store = _store(request)
    entities = filter_entities_by_access(store.get_all(), user)
    counts: dict[str, int] = {}
    for entity in entities:
        domain = str(entity.get("entity_id") or "").split(".", 1)[0]
        if domain:
            counts[domain] = counts.get(domain, 0) + 1
    return {
        "domains": [
            {"domain": domain, "count": count}
            for domain, count in sorted(counts.items(), key=lambda item: item[1], reverse=True)
        ]
    }


@router.get("")
async def get_all_entities(
    request: Request,
    user: dict[str, Any] = Depends(require_user),
    domain: str | None = Query(default=None),
    search: str | None = Query(default=None),
    status: str | None = Query(default=None),
    area: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    controllable: str | None = Query(default=None),
    page: str | None = Query(default=None),
    limit: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    offset: str | None = Query(default=None),
):
    # 单读模型：不做 REST 层缓存，直接由 StateStore（唯一事实源）实时组装，
    # 避免出现「缓存与状态库各持一份」的双读模型与陈旧响应。
    store = _store(request)
    entities = filter_entities_by_access(store.get_all(domain), user)

    if search:
        lowered = str(search).lower()
        entities = [
            e
            for e in entities
            if lowered in str(e.get("entity_id") or "").lower()
            or lowered in str((e.get("attributes") or {}).get("friendly_name") or "").lower()
        ]

    area_filter_value = str(area or "").strip()
    enrich_service = _entity_area(request)
    if area_filter_value:
        # 区域过滤依赖注册表补全（area_id / area_name 来自注册表索引）；
        # 其它查询把补全推迟到分页之后，只对当前页做，避免为被丢弃的实体白建一份 attributes。
        entities = await enrich_service.enrich_entities(entities)

    entities = filter_entities_by_query(
        entities,
        status=normalize_entity_status_filter(status),
        area=area_filter_value,
        sort=normalize_entity_sort_filter(sort) or "name_asc",
        controllable=parse_boolean_query(controllable),
    )
    if area_filter_value:
        # 房间内按本地顺序覆盖重排：`sort` 显式给了非默认值时不覆盖（用户明确要求别的排序）。
        entities = await asyncio.to_thread(_apply_entity_order, request, area_filter_value, entities, sort)

    paging = parse_crud_pagination(page, limit, max_size=2000)
    page_num = paging["pageNum"]
    page_size = paging["pageSize"]
    # 未传 limit 时不再默认全量 dump（~705 实体风暴）；显式 limit=0 仍表示全量。
    # REST 回退客户端已按 limit+cursor/page 翻页，不受影响。
    if page_size <= 0 and limit is None and cursor is None and offset is None:
        page_size = 200
        page_num = max(1, page_num)
    use_cursor = page_size > 0 and (cursor is not None or page_num <= 0)

    async def page_of(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """补全区域信息：带区域过滤时整表已补全过，这里只对当前页补。"""
        return items if area_filter_value else await enrich_service.enrich_entities(items)

    # 可选 offset 分页（B13）：显式传 offset 才启用，limit 独立解析（默认 200、上限 1000），
    # 响应额外带 limit/offset/has_more/next_offset 元信息；不传 offset 时下面 page / cursor /
    # 无参三种响应形状保持完全不变，老前端零改动。
    if offset is not None:
        offset_value = clamp_int(parse_int_10(offset) or 0, 0, MAX_SAFE_INTEGER)
        window_limit = parse_bounded_limit(limit, 200, minimum=1, maximum=1000)
        total = len(entities)
        sliced_items = entities[offset_value : offset_value + window_limit]
        page_items = await page_of(sliced_items)
        has_more = offset_value + len(sliced_items) < total
        return {
            "count": len(page_items),
            "total": total,
            "entities": page_items,
            "haSynced": store.is_ha_synced(),
            "storeTotal": store.get_count(),
            "limit": window_limit,
            "offset": offset_value,
            "has_more": has_more,
            "next_offset": offset_value + len(sliced_items) if has_more else None,
        }

    if use_cursor:
        sliced = slice_entities_by_cursor(entities, cursor or None, page_size)
        page_items = await page_of(sliced["entities"])
        result: dict[str, Any] = {
            "count": len(page_items),
            "total": sliced["total"],
            "cursor": cursor or None,
            "nextCursor": sliced["nextCursor"],
            "pageSize": page_size,
            "entities": page_items,
            "haSynced": store.is_ha_synced(),
            "storeTotal": store.get_count(),
        }
    else:
        total = len(entities)
        effective_page = max(1, page_num)
        if page_size > 0 and effective_page > 0:
            skip = (effective_page - 1) * page_size
            slice_ = await page_of(entities[skip : skip + page_size])
            result = {
                "count": len(slice_),
                "total": total,
                "page": effective_page,
                "pageSize": page_size,
                "totalPages": -(-total // page_size),
                "entities": slice_,
                "haSynced": store.is_ha_synced(),
                "storeTotal": store.get_count(),
            }
        else:
            result = {
                "count": total,
                "entities": await page_of(entities),
                "haSynced": store.is_ha_synced(),
                "storeTotal": store.get_count(),
            }

    return result


@router.get("/changed")
async def get_changed_entities(
    request: Request,
    user: dict[str, Any] = Depends(require_user),
    since: str | None = Query(default=None),
    lastEventId: str | None = Query(default=None),
):
    store = _store(request)
    try:
        since_ms = float(int(since)) if since else 0.0
    except (TypeError, ValueError):  # fmt: skip
        since_ms = 0.0
    try:
        min_id = int(lastEventId) if lastEventId else 0
    except (TypeError, ValueError):  # fmt: skip
        min_id = 0

    changes = store.get_recent_changes_since(since_ms, min_id)
    live = [c.get("new_state") for c in changes if isinstance(c.get("new_state"), dict)]
    entities = filter_entities_by_access(live, user)
    entities = await _entity_area(request).enrich_entities(entities)
    return {
        "count": len(entities),
        "lastEventId": store.get_latest_change_id(),
        "timestamp": _iso_now(),
        "haSynced": store.is_ha_synced(),
        "entities": entities,
    }


async def _safe_call(label: str, fn: Callable[[], Any], fallback: Any) -> Any:
    """读路径的降级包裹：失败只留痕并返回 ``fallback``，不向上抛。

    区域清单的契约是「只读且永不 500」，可这条路径要碰 HA、本机目录表、本地排序表
    三处外部状态；任何一处抖动都该退化成 ``registryDegraded`` 而不是整块变 500。
    """
    try:
        result = fn()
        if inspect.isawaitable(result):
            result = await result
    except Exception as exc:
        logger.warning("%s失败，使用降级值：%s", label, exc)
        return fallback
    return result


@router.get("/areas/list")
async def list_areas(
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    """HA 区域清单。

    读路径必须是**只读且永不 500**：前端把这个接口当作房间下拉/筛选的数据源，
    失败时它已经准备好回退到实体属性里的 ``area_id``。所以这里：

    1. 优先向 HA 拉最新 registry（名称以 HA 为准）；
    2. 拉取失败（HA 断连、反代的 WebSocket 返回 500、令牌过期等）时，
       回退到本机 ``ha_areas`` 目录 —— 与区域索引/时序归因同一份数据，
       离线也能把房间列全；
    3. 两条路都不行才返回空列表，并用 ``registryDegraded`` + ``registryError``
       让调用方说明原因，而不是抛出去变成一个带着堆栈的 500。

    本地顺序覆盖（``ha_areas.sortOrder``）在任何分支都照常应用。
    """
    ha_connector = request.app.state.ha_connector
    areas: list[dict[str, Any]] = []
    registry_error: str | None = None
    try:
        areas = await ha_connector.fetch_area_registry()
        # 连接器内部对 HA 异常做了缓存/沿用，失败原因需要单独取：
        # 直接抛异常只是其中一种情况（例如门面客户端解析就失败了）。
        # getattr 兜底：测试里的连接器替身不一定实现该方法。
        registry_error = getattr(ha_connector, "registry_error", lambda: None)()
    except Exception as exc:
        registry_error = str(exc) or "拉取 Home Assistant 区域注册表失败。"
        logger.warning("读取 HA 区域注册表失败，回退到本地目录：%s", registry_error)
    if not areas:
        catalog_error = registry_error
        # 本机 `ha_areas` 目录：与区域索引 / 时序归因同一份单读模型，
        # 由连接器的 registry 同步写入，离线也能把房间列全。
        catalog = await _safe_call(
            "读取本机区域目录", lambda: asyncio.to_thread(_entity_area(request).get_cached_ha_areas), []
        )
        areas = [{"area_id": row.get("id"), "name": row.get("name")} for row in catalog]
        # 本地目录命中时仍要标记降级：名称可能是上次同步的快照，
        # 但「能用旧数据」比「返回 500 让界面空掉」更接近真实状态。
        if areas and not catalog_error:
            catalog_error = "HA 区域注册表暂不可用，已使用本机同步的区域目录。"
        registry_error = catalog_error
    # 名称与成员以 HA registry 为准，顺序用本地 `ha_areas.sortOrder` 覆盖：
    # HA 区域没有排序字段，`PUT /ha/areas/sort` 只写本地，读路径必须在这里应用，
    # 否则设置页的「上移 / 下移」只是改库、界面看不到效果。
    order = await _safe_call("读取本地房间顺序", lambda: asyncio.to_thread(_local_area_order, request), {})
    rows = [{"id": str(a.get("area_id") or ""), "name": str(a.get("name") or a.get("area_id") or "")} for a in areas]
    rows = [row for row in rows if row["id"]]
    rows.sort(key=lambda row: (order.get(row["id"], 1 << 30), row["name"]))
    # 连接器自己也可能因为「未连接」而返回空列表（此时上方没有异常）。
    degraded = bool(await _safe_call("读取区域降级状态", ha_connector.is_registry_degraded, False)) or bool(
        registry_error
    )
    if degraded and not registry_error:
        registry_error = await _safe_call("读取区域降级原因", ha_connector.get_registry_degraded_reason, None)
    return {
        "areas": rows,
        "registryDegraded": degraded,
        "registryError": registry_error,
    }


#: 用户显式要求「别的排序」的取值：与房间自定义顺序是互斥意图。
#: ``name_asc`` 是默认值（设备页总会带上它），**不**算显式 —— 把它也算进来会让
#: 设置页保存的房间内顺序在设备列表里永远失效。
_EXPLICIT_ENTITY_SORTS = frozenset({"name_desc", "status", "last_changed"})


def entity_order_override_applies(sort: str | None) -> bool:
    """本地房间顺序是否应生效；``name_asc`` / 空值都生效，其余显式排序让位。"""
    return normalize_entity_sort_filter(sort) not in _EXPLICIT_ENTITY_SORTS


def sort_entities_by_local_order(
    entities: list[dict[str, Any]], order: dict[str, int]
) -> list[dict[str, Any]]:
    """按本地顺序表稳定重排；没有记录的实体保持原相对顺序，排在已排序实体之后。"""
    if not order:
        return entities
    fallback = len(order) + 1_000_000
    return sorted(
        entities,
        key=lambda item: order.get(str(item.get("entity_id") or ""), fallback),
    )


def _apply_entity_order(
    request: Request, area_id: str, entities: list[dict[str, Any]], sort: str | None
) -> list[dict[str, Any]]:
    """按本地 ``ha_area_entity_order`` 重排房间内实体。

    ``name_desc`` / ``status`` / ``last_changed`` 时不动：用户已经用查询参数表达了
    别的排序意图。``name_asc``（前端默认值）与空值都应用本地顺序 —— 否则设备页
    总会带上默认 ``sort=name_asc``，设置页里保存的房间内顺序等于形同虚设。

    没有覆盖记录的实体保持原有相对顺序，排在已排序实体之后（稳定排序保证这一点）。
    """
    if not entity_order_override_applies(sort):
        return entities
    with request.app.state.database.session_factory() as database:
        connection = active_connection(database)
        if connection is None:
            return entities
        rows = database.execute(
            select(HAAreaEntityOrder.entity_id, HAAreaEntityOrder.sort_order).where(
                HAAreaEntityOrder.connection_id == connection.id,
                HAAreaEntityOrder.area_id == area_id,
            )
        ).all()
    if not rows:
        return entities
    order = {str(entity_id): int(sort_order or 0) for entity_id, sort_order in rows}
    return sort_entities_by_local_order(entities, order)


def _local_area_order(request: Request) -> dict[str, int]:
    """本地房间顺序覆盖（``areaId → sortOrder``）；未配置的房间不出现。"""
    with request.app.state.database.session_factory() as database:
        connection = active_connection(database)
        if connection is None:
            return {}
        rows = database.execute(
            select(HAArea.area_id, HAArea.sort_order).where(HAArea.connection_id == connection.id)
        ).all()
        return {str(area_id): int(sort_order or 0) for area_id, sort_order in rows if int(sort_order or 0) != 0}


@router.get("/{entity_id}/references")
async def get_entity_references(
    entity_id: str,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    if not is_entity_allowed(entity_id, resolve_entity_restrictions(user)):
        forbidden(api_error("ACCESS_ENTITY_FORBIDDEN"))
    return await _references(request).find_references(entity_id)


@router.post("/{entity_id}/references/unlink")
async def unlink_entity_reference_route(
    entity_id: str,
    payload: UnlinkEntityReferenceDto,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    if not is_entity_allowed(entity_id, resolve_entity_restrictions(user)):
        forbidden(api_error("ACCESS_ENTITY_FORBIDDEN"))
    return await _references(request).remove_reference(
        entity_id,
        {"kind": payload.kind, "id": str(payload.id or ""), "detail": payload.detail},
    )


@router.post("/batch/get")
async def batch_get_entities(
    payload: StateStoreQueryDto,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    store = _store(request)
    raw_ids = payload.entity_ids if isinstance(payload.entity_ids, list) else []
    seen: dict[str, None] = {}
    for raw in raw_ids:
        ident = str(raw or "").strip()
        if ident:
            seen.setdefault(ident, None)
    entity_ids = list(seen)[:100]
    restrictions = resolve_entity_restrictions(user)

    found: list[dict[str, Any]] = []
    missing: list[str] = []
    forbidden_ids: list[str] = []
    for entity_id in entity_ids:
        if not is_entity_allowed(entity_id, restrictions):
            forbidden_ids.append(entity_id)
            continue
        entity = store.get(entity_id)
        if entity is None:
            missing.append(entity_id)
            continue
        found.append(entity)

    entities = await _entity_area(request).enrich_entities(found) if found else []
    return {"count": len(entities), "entities": entities, "missing": missing, "forbidden": forbidden_ids}


@router.post("/batch/area")
async def batch_update_entity_area(
    body: StateStoreQueryDto,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    entity_ids = [i for i in (body.entity_ids or []) if i]
    area_id = str(body.area_id or "").strip()
    if not entity_ids:
        return {"success": False, "message": "未指定实体", "updated": 0}

    ha_connector = request.app.state.ha_connector
    restrictions = resolve_entity_restrictions(user)

    async def _update_one(entity_id: str) -> tuple[str, bool]:
        if not is_entity_allowed(entity_id, restrictions):
            return entity_id, False
        try:
            await ha_connector.update_entity_area(entity_id, area_id)
            return entity_id, True
        except Exception:
            return entity_id, False

    results = await asyncio.gather(*[_update_one(entity_id) for entity_id in entity_ids])
    updated_ids = [entity_id for entity_id, ok in results if ok]
    errors = [entity_id for entity_id, ok in results if not ok]
    updated = len(updated_ids)

    entity_area = _entity_area(request)
    entity_area.invalidate()
    await entity_area.publish_entity_area_updates(updated_ids)
    return {"success": updated > 0, "updated": updated, "failed": len(errors), "errors": errors[:10]}


async def _refresh_entity_from_ha(request: Request, entity_id: str) -> dict[str, Any] | None:
    """从 HA 实时拉取单实体并回写状态库。

    返回富化后的实体；以下情形返回 ``None``（调用方据此 404）：
    - HA 未配置 / 请求失败 / 实体在 HA 中不存在（``fetch_entity_state`` 返回 ``None``）；
    - 实体属禁用/隐藏（同步过滤判定不可同步），与 ``refresh=ha`` 的既有语义一致。
    """
    live = await request.app.state.ha_connector.fetch_entity_state(entity_id)
    if not live:
        return None
    sync_filter = getattr(request.app.state, "entity_sync_filter", None)
    if sync_filter is not None and not sync_filter.is_entity_syncable(entity_id):
        return None
    store = _store(request)
    cached = store.get(entity_id)
    [enriched] = await _entity_area(request).enrich_entities([live])
    store.apply_state_changed_hot(
        {
            "entity_id": entity_id,
            "old_state": cached,
            "new_state": enriched,
            "changed_at": _iso_now(),
        }
    )
    return enriched


@router.get("/{entity_id}")
async def get_entity(
    entity_id: str,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
    refresh: str | None = Query(default=None),
):
    restrictions = resolve_entity_restrictions(user)
    if not is_entity_allowed(entity_id, restrictions):
        forbidden(api_error("ACCESS_ENTITY_FORBIDDEN"))

    store = _store(request)
    entity_area = _entity_area(request)
    should_refresh = refresh in ("ha", "1")
    if should_refresh:
        refreshed = await _refresh_entity_from_ha(request, entity_id)
        if refreshed is not None:
            return refreshed
        # 实时拉取失败（或实体不可同步）→ 退回本地缓存判断

    entity = store.get(entity_id)
    if entity is None:
        # 冷缺兜底：HA WS 的全量快照（ha.initial_states）未到达时状态库会整个为空，
        # 表现为「HA 中存在的实体全部 404」。单实体查询在此回退到 HA 实时接口；
        # 禁用/隐藏实体经同步过滤后仍为 None → 照旧 404，语义与 refresh=ha 一致。
        live = await _refresh_entity_from_ha(request, entity_id)
        if live is None:
            not_found(api_error("ENTITY_NOT_FOUND", entity_id))
        return live

    [enriched] = await entity_area.enrich_entities([entity])
    return enriched
