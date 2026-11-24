"""事件日志路由（``/api/v1/events/*``），逐条对齐 Nest EventLogController。"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import Depends, Query, Request

from .router import NestRouter
from ..dependencies import require_license_feature
from ..domains.license import features as feature_codes
from ..platform.core.http.errors import forbidden
from ..platform.security.auth_context import require_user
from ..platform.security.entity_access import is_entity_allowed, resolve_entity_restrictions

router = NestRouter(prefix="/events", tags=["connect"])


def _service(request: Request):
    return request.app.state.event_log


def _parse_int(value: str | None, fallback: int) -> int:
    if value is None or value == "":
        return fallback
    try:
        return int(value, 10)
    except (TypeError, ValueError):  # fmt: skip
        # 与 Nest parseIntParam 宽松语义一致：非法数字得到 NaN；Python 侧用 fallback 兜底
        return fallback


def _parse_bool(value: str | None) -> bool:
    return (value or "").strip().lower() in ("1", "true")


@router.get("/meta")
def get_meta(request: Request, user: dict[str, Any] = Depends(require_user)):
    # 保留天数要读一次 ``system_configs.data`` 全量 JSON；在事件循环里跑会和
    # Socket.IO 状态广播抢同一个线程。同步 def 由 FastAPI 放进线程池执行。
    return _service(request).get_query_meta()


@router.get("")
def get_history(
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
def get_timeline(
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
def get_stats(
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
def get_report_compare(
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


@router.get("/reports/energy/history")
def get_energy_history(
    request: Request,
    range: str | None = Query(default=None),
    entity_ids: str | None = Query(default=None),
    unit: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    """能耗历史：``W`` 近 7 天 / ``M`` 近 30 天 / ``Y`` 近 12 个月（直接读日/月聚合表）。

    SGCC 日列表与实时累计表都落在这两张表里，因此国网账户不依赖 HA 历史即可出图。

    ``unit`` 声明要哪种能源的量（``kWh`` 电 / ``m³`` 气与水）。聚合表里两类行并存，
    不传就等于求混合和 —— 电力卡会凭空多出燃气的数字。前端按能源卡类别显式传。
    """
    require_license_feature(request, feature_codes.FEATURE_ENERGY)
    restrictions = resolve_entity_restrictions(user)
    ids = [part.strip() for part in (entity_ids or "").split(",") if part.strip()] or None
    if ids and restrictions is not None:
        for entity_id in ids:
            if not is_entity_allowed(entity_id, restrictions):
                forbidden("无权查看该实体的报表数据")
    return _service(request).query_energy_history(range, ids, restrictions, unit)


@router.get("/reports/energy/circuits")
def get_energy_circuits(
    request: Request,
    range: str | None = Query(default=None),
    entity_ids: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    """分回路用电排行（``energy.circuitEntityIds`` 的实际消费方）。

    未显式传 ``entity_ids`` 时读配置里的回路集合；两者都为空时返回空排行而不是 404 ——
    「没配回路」是正常的，不该被当成错误。
    """
    require_license_feature(request, feature_codes.FEATURE_ENERGY)
    restrictions = resolve_entity_restrictions(user)
    ids = [part.strip() for part in (entity_ids or "").split(",") if part.strip()] or None
    if ids and restrictions is not None:
        for entity_id in ids:
            if not is_entity_allowed(entity_id, restrictions):
                forbidden("无权查看该实体的报表数据")
    return _service(request).query_energy_circuits(range, ids)


@router.delete("")
async def clear_all(request: Request, user: dict[str, Any] = Depends(require_user)):
    # 清空是全表分批删除（上限 500 批 × 默认 800 行），在事件循环里同步跑会把其它请求
    # 一起卡住（这与 ui_config / license 等路由的做法一致，统一走线程池）。
    return await asyncio.to_thread(_service(request).clear_all_records)
