"""事件日志路由（``/api/v1/events/*``），逐条对齐 Nest EventLogController。"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, Query, Request

from ..core.errors import forbidden
from ..dependencies import require_license_feature
from ..realtime.access import is_entity_allowed, resolve_entity_restrictions
from ..security.auth_context import require_roles, require_user
from ..services.license import features as feature_codes
from .router import NestRouter

router = NestRouter(prefix="/events", tags=["connect"])

def _service(request: Request):
    return request.app.state.event_log

def _parse_int(value: str | None, fallback: int) -> int:
    if value is None or value == "":
        return fallback
    try:
        return int(value, 10)
    except (TypeError, ValueError):
        # 与 Nest parseIntParam 宽松语义一致：非法数字得到 NaN；Python 侧用 fallback 兜底
        return fallback

def _parse_bool(value: str | None) -> bool:
    return (value or "").strip().lower() in ("1", "true")

@router.get("/meta")
async def get_meta(request: Request, user: dict[str, Any] = Depends(require_user)):
    return _service(request).get_query_meta()

@router.get("")
async def get_history(
    request: Request,
    entity_id: str | None = Query(default=None),
    domain: str | None = Query(default=None),
    hours: str | None = Query(default=None),
    limit: str | None = Query(default=None),
    page: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    service = _service(request)
    restrictions = resolve_entity_restrictions(user)
    if entity_id and not is_entity_allowed(entity_id, restrictions):
        forbidden("无权查看该实体的事件")
    meta = service.get_query_meta()
    return service.query_history(
        entity_id,
        _parse_int(hours, meta["maxQueryHours"]),
        _parse_int(limit, 20),
        _parse_int(page, 1),
        restrictions,
        (domain or "").strip() or None,
    )

@router.get("/timeline")
async def get_timeline(
    request: Request,
    entity_ids: str = Query(default=""),
    hours: str | None = Query(default=None),
    limit: str | None = Query(default=None),
    includeFullState: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    service = _service(request)
    restrictions = resolve_entity_restrictions(user)
    ids = [part.strip() for part in (entity_ids or "").split(",") if part.strip()]
    meta = service.get_query_meta()
    return service.query_timeline_events(
        ids,
        _parse_int(hours, meta["timelineHours"]),
        _parse_int(limit, meta["timelineLimit"]),
        restrictions,
        _parse_bool(includeFullState),
    )

@router.get("/stats")
async def get_stats(
    request: Request,
    hours: str | None = Query(default=None),
    entity_id: str | None = Query(default=None),
    domain: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    service = _service(request)
    restrictions = resolve_entity_restrictions(user)
    meta = service.get_query_meta()
    if entity_id and not is_entity_allowed(entity_id, restrictions):
        forbidden("无权查看该实体的事件统计")
    return service.get_stats(
        _parse_int(hours, meta["maxQueryHours"]),
        restrictions,
        entity_id,
        (domain or "").strip() or None,
    )

@router.get("/reports/compare")
async def get_report_compare(
    request: Request,
    metric: str | None = Query(default=None),
    granularity: str | None = Query(default=None),
    entity_ids: str | None = Query(default=None),
    field: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    resolved_metric = metric if metric in ("energy", "environment", "device") else "events"
    if resolved_metric == "energy":
        require_license_feature(request, feature_codes.FEATURE_ENERGY)
    restrictions = resolve_entity_restrictions(user)
    ids = [part.strip() for part in (entity_ids or "").split(",") if part.strip()] or None
    if ids and restrictions is not None:
        for entity_id in ids:
            if not is_entity_allowed(entity_id, restrictions):
                forbidden("无权查看该实体的报表数据")
    return _service(request).report_compare(
        {
            "metric": resolved_metric,
            "granularity": "month" if granularity == "month" else "week",
            "entityIds": ids,
            "field": field if field in ("humidity", "iaq") else "temperature",
            "restrictions": restrictions,
        }
    )

@router.delete("")
async def clear_all(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin"))
):
    return _service(request).clear_all_records()
