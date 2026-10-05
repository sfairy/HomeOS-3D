"""实体状态路由（``/api/v1/entities/*``）。

逐条对齐 Nest ``StateStoreController``：

- ``GET  entities``：实体列表（page/limit 或 cursor/limit 分页 + 500ms 短时缓存）；
- ``GET  entities/changed``：增量变更（基于 recentChanges 环形缓冲）；
- ``GET  entities/areas/list``：HA 区域列表（area_registry）；
- ``GET  entities/:entity_id/references``：查询引用该实体的功能配置；
- ``POST entities/:entity_id/references/unlink``：移除引用（admin/adult）；
- ``POST entities/batch/get``：批量冷补全；
- ``POST entities/batch/area``：批量更新实体房间（admin/adult）；
- ``GET  entities/:entity_id``：单实体（refresh=ha 时从 HA 拉取最新并回写缓存）。
"""

from __future__ import annotations

import time
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import Depends, Query, Request
from pydantic import BaseModel, BeforeValidator, ConfigDict

from ..core.booleans import parse_boolean_query
from ..core.errors import api_error, forbidden, not_found
from ..core.pagination import parse_crud_pagination
from ..realtime.access import (
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
from ..security.auth_context import require_roles, require_user
from .router import NestRouter

router = NestRouter(prefix="/entities", tags=["connect"])

#: ``GET /entities`` 单槽短时缓存（对齐 Nest 控制器实例字段 ``restCache``）。
_REST_CACHE: dict[str, Any] = {"key": None, "data": None, "at": 0.0}


class StrictModel(BaseModel):
    """等价 Nest ``ValidationPipe({ whitelist, forbidNonWhitelisted })``：拒绝未知字段。"""

    model_config = ConfigDict(extra="forbid")


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


EntityIdsField = Annotated[
    list[str], BeforeValidator(_string_list("entity_ids 须为数组", "entity_ids 每项须为字符串"))
]
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


def _rest_cache_ttl_ms(request: Request) -> int:
    try:
        section = request.app.state.app_config.get("stateStore") or {}
        return int(section.get("restCacheTtlMs", 500))
    except Exception:  # noqa: BLE001
        return 500


def _restrictions_cache_key(user: dict[str, Any]) -> str:
    restrictions = resolve_entity_restrictions(user)
    if restrictions is None:
        return "*"
    if not restrictions:
        return ""
    return ",".join(sorted(str(item) for item in restrictions))


def _iso_now() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


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
):
    role = user.get("role") or "anon"
    cache_key = "|".join(
        [
            role,
            _restrictions_cache_key(user),
            domain or "",
            search or "",
            status or "",
            area or "",
            sort or "",
            controllable or "",
            page or "",
            limit or "",
            cursor or "",
        ]
    )
    now_ms = time.monotonic() * 1000
    cached = _REST_CACHE
    if cached["key"] == cache_key and now_ms - cached["at"] < _rest_cache_ttl_ms(request):
        return cached["data"]

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

    entities = await _entity_area(request).enrich_entities(entities)

    entities = filter_entities_by_query(
        entities,
        status=normalize_entity_status_filter(status),
        area=str(area or "").strip(),
        sort=normalize_entity_sort_filter(sort) or "name_asc",
        controllable=parse_boolean_query(controllable),
    )

    paging = parse_crud_pagination(page, limit, max_size=2000)
    page_num = paging["pageNum"]
    page_size = paging["pageSize"]
    use_cursor = page_size > 0 and (cursor is not None or page_num <= 0)

    if use_cursor:
        sliced = slice_entities_by_cursor(entities, cursor or None, page_size)
        result: dict[str, Any] = {
            "count": len(sliced["entities"]),
            "total": sliced["total"],
            "cursor": cursor or None,
            "nextCursor": sliced["nextCursor"],
            "pageSize": page_size,
            "entities": sliced["entities"],
            "haSynced": store.is_ha_synced(),
            "storeTotal": store.get_count(),
        }
    else:
        total = len(entities)
        effective_page = max(1, page_num)
        if page_size > 0 and effective_page > 0:
            skip = (effective_page - 1) * page_size
            slice_ = entities[skip : skip + page_size]
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
                "entities": entities,
                "haSynced": store.is_ha_synced(),
                "storeTotal": store.get_count(),
            }

    _REST_CACHE.update({"key": cache_key, "data": result, "at": now_ms})
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
    except (TypeError, ValueError):
        since_ms = 0.0
    try:
        min_id = int(lastEventId) if lastEventId else 0
    except (TypeError, ValueError):
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


@router.get("/areas/list")
async def list_areas(
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    ha_connector = request.app.state.ha_connector
    areas = await ha_connector.fetch_area_registry()
    degraded = bool(ha_connector.is_registry_degraded())
    return {
        "areas": [
            {"id": str(a.get("area_id") or ""), "name": str(a.get("name") or a.get("area_id") or "")}
            for a in areas
        ],
        "registryDegraded": degraded,
        "registryError": ha_connector.get_registry_degraded_reason() if degraded else None,
    }


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
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
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
    payload: StateStoreQueryDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    entity_ids = [i for i in (payload.entity_ids or []) if i]
    area_id = str(payload.area_id or "").strip()
    if not entity_ids:
        return {"success": False, "message": "未指定实体", "updated": 0}

    ha_connector = request.app.state.ha_connector
    restrictions = resolve_entity_restrictions(user)
    updated = 0
    errors: list[str] = []
    updated_ids: list[str] = []
    for entity_id in entity_ids:
        if not is_entity_allowed(entity_id, restrictions):
            errors.append(entity_id)
            continue
        try:
            await ha_connector.update_entity_area(entity_id, area_id)
            updated += 1
            updated_ids.append(entity_id)
        except Exception:  # noqa: BLE001
            errors.append(entity_id)

    _REST_CACHE["key"] = None
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
