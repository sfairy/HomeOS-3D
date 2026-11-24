"""Home Assistant 集成的主接口面：连接配置、目录查询、历史、同步与设备控制，按 api / ha.control / ha.sync / ha.configure 四档能力码放行。"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
import traceback
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from anyio import CancelScope, create_task_group
from fastapi import APIRouter, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from fastapi.responses import Response
from sqlalchemy import func, or_, select

from ...config import DEFAULT_RUNTIME_ACCESS_CACHE_SECONDS
from ...dependencies import (
    DatabaseSession,
    LicensedUser,
    LicensedViewer,
    ViewerPrincipal,
    viewer_entity_ids,
)
from ...domains.agent.runtime.attribution import mark_local_control_for_request
from ...domains.ha.integration.area_admin import (
    persist_area_delete,
    persist_area_entity_order,
    persist_area_sort,
    persist_area_update,
    persist_area_upsert,
)
from ...domains.ha.integration.client import HAClientError
from ...domains.ha.integration.connection_admin import (
    connection_access_token,
    connection_verify_flags,
    create_connection_row,
    log_connection_address_change,
    log_connection_endpoint_warnings,
    probe_connection_endpoints,
    resolved_connection_targets,
    update_connection_row,
)
from ...domains.ha.integration.connection_query import active_connection, load_active_connection_snapshot
from ...domains.ha.integration.connection_setup import (
    failed_endpoint_summary,
    probe_endpoints,
)
from ...domains.ha.integration.crypto import CredentialCipherError
from ...domains.ha.integration.endpoints import endpoint_candidates
from ...domains.ha.integration.errors import connection_error_message
from ...domains.ha.integration.numeric_sources import numeric_sources
from ...domains.ha.integration.percentage_sources import percentage_sources
from ...domains.ha.integration.runtime_frames import (
    diff_runtime_states,
    drain_runtime_queue,
    drain_runtime_queue_now,
    merge_runtime_state_events,
    runtime_queue_put,
)
from ...domains.ha.integration.service_call import (
    ServiceCallRejected,
    execute_service_call,
    load_ha_entity_context,
)
from ...domains.license import features as feature_codes
from ...domains.logs.global_log import event_context
from ...platform.core.db.database import Database
from ...platform.core.db.db_exec import run_db
from ...platform.core.db.models import (
    HAArea,
    HAAreaEntityOrder,
    HAConnection,
    HADevice,
    HAEntity,
    HASyncState,
    LoginSession,
    User,
)
from ...platform.core.http.errors import BusinessException, ErrorCode, api_error
from ...platform.core.http.fast_json import dumps_text, json_response
from ...platform.security.request_origin import browser_origin_allowed
from ...platform.security.session_store import session_token_hash
from ...platform.security.viewer_scope import require_viewer_entity
from ...schemas import (
    HAAreaCreateRequest,
    HAAreaEntitiesRequest,
    HAAreaEntitySortRequest,
    HAAreaSortRequest,
    HAAreaUpdateRequest,
    HABrowseMediaRequest,
    HAConnectionInput,
    HAServiceCallRequest,
    HATestRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ha", tags=["home-assistant"])
runtime_router = APIRouter(tags=["runtime"])
MAX_RUNTIME_ENTITIES = 1000
# 实时连接的授权复检间隔（秒）：连接建立后授权仍可能到期或被吊销，
# 长连必须周期性回看，否则一份过期授权可以靠一条已建立的连接无限用下去。
RUNTIME_LICENSE_CHECK_SECONDS = 30


def _runtime_access_cache_seconds(websocket: WebSocket) -> float:
    """实时连接出站帧复用授权复检结果的秒数；非法值回落到默认 30 秒。"""
    settings = getattr(websocket.app.state, "settings", None)
    value = getattr(settings, "runtime_access_cache_seconds", DEFAULT_RUNTIME_ACCESS_CACHE_SECONDS)
    try:
        seconds = float(value)
    except (TypeError, ValueError):  # fmt: skip
        return DEFAULT_RUNTIME_ACCESS_CACHE_SECONDS
    return seconds if seconds >= 0 else DEFAULT_RUNTIME_ACCESS_CACHE_SECONDS


def load_translation_context(database_manager: Database) -> tuple[HAConnection | None, set[str]]:
    with database_manager.session_factory() as database:
        connection = active_connection(database)
        if connection is None:
            return None, set()
        integrations = {
            platform
            for platform in database.scalars(
                select(HAEntity.platform)
                .where(
                    HAEntity.connection_id == connection.id,
                    HAEntity.sync_status == "active",
                    HAEntity.platform.is_not(None),
                    HAEntity.translation_key.is_not(None),
                )
                .distinct()
            )
            if platform is not None
        }
        database.expunge(connection)
        return connection, integrations


def load_authorized_entity_context(
    database_manager: Database,
    viewer: ViewerPrincipal,
    entity_id: str,
    enabled_only: bool = False,
) -> tuple[HAConnection | None, bool]:
    """连接 + 实体是否可用（带查看者 ACL）。

    默认**不**排除已禁用实体（0.7.8 的 `enabled_only=False`）：配置校验时，
    绑定了稍后被禁用的实体不应该让保存失败（否则用户连"把这台设备删掉"都做不到），
    只要实体在库里存在且未被删除即可。
    需要严格"实体存在、已启用且未失联"的运行时控制路径，显式传 `enabled_only=True`。

    判定条件本身在 ``service_call.ha_entity_conditions`` —— 本函数只做「把查看者
    ACL 注入进去」，不再自带一份 SQL 条件（旧实现三处各写一遍，容易漂移）。
    """
    return load_ha_entity_context(
        database_manager,
        entity_id,
        access_check=lambda database, target: require_viewer_entity(database, viewer, target),
        enabled_only=enabled_only,
    )


def connection_payload(connection: HAConnection | None, request: Request) -> dict[str, Any]:
    connector = request.app.state.studio_ha
    live_error = None if connector.connected else connector.runtime_error
    if connection is None:
        return {
            "configured": False,
            "hasToken": False,
            "connected": False,
            "baseUrl": "",
            "externalBaseUrl": None,
            "activeEndpoint": None,
            "activeBaseUrl": None,
            "name": "Home Assistant",
            "verifyTls": True,
            "externalVerifyTls": True,
            "version": None,
            "lastConnectedAt": None,
            "lastError": connection_error_message(live_error),
        }
    return {
        "configured": True,
        "hasToken": bool(connection.encrypted_access_token),
        "connected": connector.connected,
        "baseUrl": connection.base_url,
        "externalBaseUrl": connection.external_base_url,
        "activeEndpoint": connector.endpoint_kind or connection.active_endpoint,
        "activeBaseUrl": connector.active_base_url or connection.base_url,
        "name": connection.name,
        "verifyTls": connection.verify_tls,
        "externalVerifyTls": connection.external_verify_tls,
        "version": connection.ha_version,
        "lastConnectedAt": connection.last_connected_at,
        "lastError": None if connector.connected else connection_error_message(live_error or connection.last_error),
    }


@router.get("/connection")
def get_connection(request: Request, database: DatabaseSession, _user: LicensedUser) -> dict[str, Any]:
    return connection_payload(active_connection(database), request)


@router.delete("/connection", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(request: Request, database: DatabaseSession, _user: LicensedUser) -> None:
    connection = active_connection(database)
    if connection is None:
        raise BusinessException(ErrorCode.NOT_FOUND, api_error("HA_CONNECTION_NOT_FOUND"))
    connector = request.app.state.studio_ha
    await connector.stop()
    try:

        def _delete_connection_row() -> None:
            database.delete(connection)
            database.commit()

        await run_db(_delete_connection_row)
        # 唯一重置入口（见 domains/ha/integration/state_reset 的模块说明）：
        # 这里只需要表达「断开后清空」，Hub / L1 的成对清理与广播都在里面。
        from ...domains.ha.integration.state_reset import reset_ha_state_models

        await reset_ha_state_models(request.app.state, connector, reason="connection-deleted")
    except Exception:
        database.rollback()
        raise
    finally:
        await connector.restart()
    await request.app.state.global_log.append_async(
        "warning", "Home Assistant", "连接", "Home Assistant 连接配置已删除"
    )


@router.post("/test")
async def test_connection(
    command: HATestRequest,
    request: Request,
    database: DatabaseSession,
    _user: LicensedUser,
) -> dict[str, Any]:
    connection = active_connection(database)
    try:
        token = command.access_token or (
            request.app.state.studio_ha.cipher.decrypt(connection.encrypted_access_token) if connection else None
        )
        if not token:
            raise HAClientError("首次连接必须输入 Home Assistant 访问令牌。")
        # 与「保存连接」走同一个开关推导：未显式提交就沿用已保存值，
        # 避免测试连接和保存后的实际连接用两套 TLS 口径。
        verify_tls, external_verify_tls = connection_verify_flags(command, connection)
        endpoints = endpoint_candidates(command.base_url, verify_tls, command.external_base_url, external_verify_tls)
        results = await probe_endpoints(endpoints, token, request.app.state.settings.ha_request_timeout_seconds)
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=connection_error_message(error),
        ) from error
    reachable = [item for item in results if item["ok"]]
    if not reachable:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=failed_endpoint_summary(results),
        )
    primary = reachable[0]
    return {
        "ok": True,
        "endpoints": results,
        "baseUrl": primary["baseUrl"],
        "version": primary.get("version"),
        "locationName": primary.get("locationName"),
    }


@router.put("/connection")
async def save_connection(
    command: HAConnectionInput,
    request: Request,
    database: DatabaseSession,
    _user: LicensedUser,
) -> dict[str, Any]:
    if not request.app.state.license_service.allows(feature_codes.FEATURE_HA_CONFIGURE):
        raise BusinessException(ErrorCode.FORBIDDEN, api_error("HA_CONFIGURE_NOT_LICENSED"))
    connector = request.app.state.studio_ha
    connection = active_connection(database)
    verify_tls, external_verify_tls = connection_verify_flags(command, connection)
    endpoints = endpoint_candidates(command.base_url, verify_tls, command.external_base_url, external_verify_tls)
    new_addresses = (command.base_url, command.external_base_url)
    previous_addresses = (connection.base_url, connection.external_base_url) if connection is not None else None
    token = connection_access_token(command, connection, connector, new_addresses, previous_addresses)
    test_results = await probe_connection_endpoints(request, endpoints, token)
    targets = resolved_connection_targets(test_results, command)

    def _persist_connection() -> HAConnection:
        row = connection
        if row is None:
            row = create_connection_row(command, connector, token, verify_tls, external_verify_tls, targets)
            database.add(row)
        else:
            update_connection_row(row, command, connector, verify_tls, external_verify_tls, targets)
        database.commit()
        database.refresh(row)
        return row

    connection = await run_db(_persist_connection)
    await connector.restart()
    await log_connection_address_change(request, command, previous_addresses, connection)
    await log_connection_endpoint_warnings(request, test_results, connection)
    return {**connection_payload(connection, request), "test": targets.tested, "endpoints": test_results}


@router.get("/entities")
def list_entities(
    database: DatabaseSession,
    viewer: LicensedViewer,
    search: str | None = Query(None, max_length=128),
    domain: str | None = Query(None, max_length=64),
    area_id: str | None = Query(None, alias="areaId", max_length=255),
    sync_status: str | None = Query(None, alias="status", max_length=32),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    connection = active_connection(database)
    if connection is None:
        return {"items": [], "total": 0, "limit": limit, "offset": offset}
    filters = [HAEntity.connection_id == connection.id]
    allowed_entity_ids = viewer_entity_ids(database, viewer)
    if allowed_entity_ids is not None:
        if not allowed_entity_ids:
            return {"items": [], "total": 0, "limit": limit, "offset": offset}
        filters.append(HAEntity.entity_id.in_(allowed_entity_ids))
    if search:
        pattern = f"%{search.strip()}%"
        filters.append(or_(HAEntity.entity_id.ilike(pattern), HAEntity.name.ilike(pattern)))
    if domain:
        filters.append(HAEntity.domain == domain)
    if area_id:
        filters.append(HAEntity.area_id == area_id)
    if sync_status:
        filters.append(HAEntity.sync_status == sync_status)
    query = select(HAEntity).where(*filters)
    if area_id:
        # 房间内按本地顺序覆盖排序；没有覆盖的实体排在后面（再按域 + 实体名）。
        # 用子查询而不是整表 join：只取当前房间的行，避免大户型下 join 全表。
        order_sub = (
            select(HAAreaEntityOrder.entity_id, HAAreaEntityOrder.sort_order)
            .where(HAAreaEntityOrder.connection_id == connection.id, HAAreaEntityOrder.area_id == area_id)
            .subquery()
        )
        query = query.outerjoin(order_sub, order_sub.c.entity_id == HAEntity.entity_id).order_by(
            func.coalesce(order_sub.c.sort_order, 1_000_000),
            HAEntity.domain,
            HAEntity.entity_id,
        )
    else:
        query = query.order_by(HAEntity.domain, HAEntity.entity_id)
    rows = database.execute(query.offset(offset).limit(limit)).scalars().all()
    # 独立的 COUNT 而不是 ``count() OVER ()``：窗口函数会让 SQLite 先物化**整个匹配集合**
    # 再排序取页；分开查询时 COUNT 只走 WHERE 的索引、排序只作用于当前页。
    # 代价是多一条语句（分页请求本来就有 2 条），换来大户型下（700+ 实体、搜索时全表）
    # 不再为「取 200 行」把上千行连同属性一起读出来。
    total = int(database.scalar(select(func.count()).select_from(HAEntity).where(*filters)) or 0)
    return {
        "items": [
            {
                "entityId": item.entity_id,
                "domain": item.domain,
                "name": item.name,
                "icon": item.icon,
                "deviceId": item.device_id,
                "areaId": item.area_id,
                "platform": item.platform,
                "translationKey": item.translation_key,
                "hasEntityName": item.has_entity_name,
                "uniqueId": item.unique_id,
                "originalName": item.original_name,
                "displayPrecision": item.display_precision,
                "suggestedDisplayPrecision": item.suggested_display_precision,
                "disabledBy": item.disabled_by,
                "status": item.sync_status,
                "lastSeenAt": item.last_seen_at,
                "missingSince": item.missing_since,
            }
            for item in rows
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


#: ``/history`` 的短期结果缓存：图表会被反复打开，而 168h 的 HA 历史是一次数 MB 的
#: JSON（每次都是新 TCP + 全量解析）。15s 足够吸收「打开 → 关掉 → 再打开」，
#: 又不至于让曲线看起来停滞。
HISTORY_CACHE_TTL_SECONDS = 15.0
HISTORY_CACHE_MAX_ENTRIES = 64
_history_cache: dict[tuple[str, int, str], tuple[float, list[dict[str, Any]]]] = {}
_history_cache_lock = threading.Lock()


def _history_cache_get(key: tuple[str, int, str]) -> list[dict[str, Any]] | None:
    with _history_cache_lock:
        entry = _history_cache.get(key)
        if entry is None:
            return None
        expires_at, points = entry
        if expires_at <= time.monotonic():
            _history_cache.pop(key, None)
            return None
        return points


def _history_cache_put(key: tuple[str, int, str], points: list[dict[str, Any]]) -> None:
    with _history_cache_lock:
        if len(_history_cache) >= HISTORY_CACHE_MAX_ENTRIES and key not in _history_cache:
            # 简单清理：先摘过期的，仍满就丢最早写入的那一条。
            now = time.monotonic()
            for stale_key in [k for k, (exp, _) in _history_cache.items() if exp <= now]:
                _history_cache.pop(stale_key, None)
            if len(_history_cache) >= HISTORY_CACHE_MAX_ENTRIES:
                _history_cache.pop(next(iter(_history_cache)), None)
        _history_cache[key] = (time.monotonic() + HISTORY_CACHE_TTL_SECONDS, points)


def _live_states(request: Request) -> list[dict[str, Any]] | None:
    """StateStore 里的实时全量状态；尚未收到首帧快照时返回 ``None``。

    ``/ha/percentage-sources``、``/ha/numeric-sources`` 只是对全量状态做过滤。
    以前每次请求都新建一条 HA WebSocket 并 ``get_states`` 全量 dump：一次 TCP+TLS
    握手加多 MB JSON 解析，而同一份数据已经由实时管道常驻在 StateStore 里
    （``/entities`` 就走它）。首帧未到（刚启动）时才回退到直连。
    """
    store = getattr(getattr(request.app.state, "realtime", None), "state_store", None)
    if store is None:
        return None
    states = store.get_all()
    return states or None


async def _source_states(request: Request, connection: Any) -> list[dict[str, Any]]:
    """状态源列表的数据来源：优先 StateStore，首帧未到时回退一次直连 HA。"""
    states = _live_states(request)
    if states is not None:
        return states
    try:
        return await (await request.app.state.studio_ha.client_for(connection)).fetch_all_states()
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.get("/percentage-sources")
async def list_percentage_sources(
    request: Request,
    database: DatabaseSession,
    _user: LicensedUser,
) -> dict[str, Any]:
    connection = await asyncio.to_thread(active_connection, database)
    if connection is None:
        return {"items": []}
    allowed_ids = await run_db(
        lambda: set(
            database.scalars(
                select(HAEntity.entity_id).where(
                    HAEntity.connection_id == connection.id,
                    HAEntity.sync_status != "missing",
                    HAEntity.disabled_by.is_(None),
                )
            ).all()
        )
    )
    states = await _source_states(request, connection)
    return {"items": percentage_sources(states, allowed_ids)}


@router.get("/numeric-sources")
async def list_numeric_sources(
    request: Request,
    database: DatabaseSession,
    _user: LicensedUser,
) -> dict[str, Any]:
    connection = await asyncio.to_thread(active_connection, database)
    if connection is None:
        return {"items": []}
    allowed_ids = await run_db(
        lambda: set(
            database.scalars(
                select(HAEntity.entity_id).where(
                    HAEntity.connection_id == connection.id,
                    HAEntity.sync_status.notin_(["missing", "disabled"]),
                    HAEntity.disabled_by.is_(None),
                    HAEntity.domain.in_(["sensor", "number", "input_number"]),
                )
            ).all()
        )
    )
    states = await _source_states(request, connection)
    return {"items": numeric_sources(states, allowed_ids)}


@router.get("/weather/forecast")
async def weather_forecast(
    request: Request,
    database: DatabaseSession,
    viewer: LicensedViewer,
    entity_id: str = Query(alias="entityId", min_length=3, max_length=255),
    forecast_type: str = Query("auto", alias="type", max_length=16),
) -> Response:
    """只读天气预报。

    ``no-store`` 是硬要求：预报本身有有效期，任何中间层缓存都会让用户看到过期天气，
    而"过期天气"在界面上与"实时天气"完全无法区分。
    """
    connection = await asyncio.to_thread(active_connection, database)
    if connection is None:
        raise BusinessException(ErrorCode.CONFLICT, api_error("HA_CONNECTION_REQUIRED"))
    require_viewer_entity(database, viewer, entity_id)
    if forecast_type not in ("auto", "daily", "hourly", "twice_daily"):
        raise BusinessException(ErrorCode.VALIDATION_FAILED, api_error("HA_FORECAST_TYPE_INVALID"))
    try:
        payload = await request.app.state.studio_ha.fetch_weather_forecast(connection, entity_id, forecast_type)
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    # 预报载荷常有几百个点：用 orjson 直接编码，绕开 jsonable_encoder 的递归复制。
    return json_response(payload, headers={"Cache-Control": "no-store"})


@router.get("/translations")
async def entity_translations(
    request: Request,
    _database: DatabaseSession,
    _viewer: LicensedViewer,
) -> dict[str, Any]:
    connection, integrations = await asyncio.to_thread(load_translation_context, request.app.state.database)
    if connection is None:
        return {"language": "zh-Hans", "resources": {}}
    try:
        resources = await request.app.state.studio_ha.entity_translations(
            connection,
            integrations,
            language="zh-Hans",
        )
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    return {"language": "zh-Hans", "resources": resources}


@router.get("/history")
async def entity_history(
    request: Request,
    _database: DatabaseSession,
    viewer: LicensedViewer,
    entity_id: str = Query(alias="entityId", min_length=3, max_length=255),
    hours: int = Query(24, ge=1, le=168),
) -> dict[str, Any]:
    connection, entity_exists = await asyncio.to_thread(
        load_authorized_entity_context,
        request.app.state.database,
        viewer,
        entity_id,
    )
    if connection is None:
        raise BusinessException(ErrorCode.CONFLICT, api_error("HA_CONNECTION_REQUIRED"))
    if not entity_exists:
        raise BusinessException(ErrorCode.NOT_FOUND, api_error("HA_ENTITY_UNAVAILABLE"))
    cache_key = (str(connection.id), int(hours), entity_id)
    cached = _history_cache_get(cache_key)
    if cached is not None:
        return {"entityId": entity_id, "hours": hours, "points": cached}
    start_time = (datetime.now(UTC) - timedelta(hours=hours)).isoformat()
    try:
        history = await request.app.state.studio_ha.fetch_history(connection, entity_id, start_time, hours)
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    points = []
    for item in history:
        value = history_state_value(item.get("state"))
        if value is None:
            continue
        timestamp = item.get("last_updated") or item.get("last_changed")
        if not timestamp:
            continue
        points.append({"timestamp": str(timestamp), "value": value})
    if len(points) > 480:
        step = len(points) / 480
        points = [points[min(len(points) - 1, int(index * step))] for index in range(480)]
    _history_cache_put(cache_key, points)
    return {"entityId": entity_id, "hours": hours, "points": points}


def history_state_value(raw_state: Any) -> float | str | None:
    try:
        return float(raw_state)
    except (TypeError, ValueError):  # fmt: skip
        value = str(raw_state or "").strip()
        return value or None


@router.get("/areas")
def list_areas(database: DatabaseSession, _user: LicensedUser) -> dict[str, Any]:
    connection = active_connection(database)
    if connection is None:
        return {"items": []}
    areas = database.scalars(
        select(HAArea)
        .where(HAArea.connection_id == connection.id, HAArea.sync_status == "active")
        .order_by(HAArea.sort_order, HAArea.name)
    )
    return {
        "items": [
            {
                "areaId": item.area_id,
                "name": item.name,
                "icon": item.icon or "",
                "sortOrder": int(item.sort_order or 0),
                "aliases": json.loads(item.aliases_json),
                "status": item.sync_status,
            }
            for item in areas
        ]
    }


@router.post("/areas")
async def create_area(
    payload: HAAreaCreateRequest,
    request: Request,
    database: DatabaseSession,
    _user: LicensedUser,
) -> dict[str, Any]:
    """在 HA 建房间，并同步写入本地目录（不必等下一次全量同步）。"""
    connector = request.app.state.studio_ha
    created = await connector.create_area(payload.name.strip(), payload.icon.strip(), payload.aliases)
    area_id = str(created.get("area_id") or created.get("id") or "")
    connection = active_connection(database)
    if connection is not None and area_id:
        await asyncio.to_thread(
            persist_area_upsert,
            database,
            connection.id,
            area_id,
            str(created.get("name") or payload.name).strip(),
            str(created.get("icon") or payload.icon or "") or None,
        )
    return {"success": True, "data": {"areaId": area_id, **created}}


@router.put("/areas/sort")
def sort_areas(payload: HAAreaSortRequest, database: DatabaseSession, _user: LicensedUser) -> dict[str, Any]:
    """房间排序：按数组顺序写本地 ``sortOrder``（HA 区域 registry 没有顺序字段）。"""
    connection = active_connection(database)
    if connection is None:
        return {"success": False, "message": "Home Assistant 未配置"}
    # 一次 IN 查询代替逐行 SELECT（原实现是每个 area_id 一条语句）。
    # 本路由是同步 `def`：FastAPI 已在线程池里执行，不需要再 to_thread。
    persist_area_sort(database, connection.id, payload.area_ids)
    return {"success": True, "count": len(payload.area_ids)}


@router.put("/areas/{area_id}/entities/sort")
async def sort_area_entities(
    area_id: str,
    payload: HAAreaEntitySortRequest,
    database: DatabaseSession,
    _user: LicensedUser,
) -> dict[str, Any]:
    """房间内实体排序：按数组顺序写本地覆盖（HA 实体注册表没有顺序字段）。"""
    connection = active_connection(database)
    if connection is None:
        return {"success": False, "message": "Home Assistant 未配置"}
    await asyncio.to_thread(persist_area_entity_order, database, connection.id, area_id, payload.entity_ids)
    return {"success": True, "count": len(payload.entity_ids)}


@router.put("/areas/{area_id}")
async def update_area(
    area_id: str,
    payload: HAAreaUpdateRequest,
    request: Request,
    database: DatabaseSession,
    _user: LicensedUser,
) -> dict[str, Any]:
    """改名 / 换图标：写 HA，再更新本地目录。"""
    connector = request.app.state.studio_ha
    updated = await connector.update_area(
        area_id,
        name=payload.name.strip() if payload.name is not None else None,
        icon=payload.icon.strip() if payload.icon is not None else None,
    )
    connection = active_connection(database)
    if connection is not None:
        await asyncio.to_thread(
            persist_area_update,
            database,
            connection.id,
            area_id,
            payload.name.strip() if payload.name is not None else None,
            payload.icon.strip() if payload.icon is not None else None,
        )
    return {"success": True, "data": updated}


@router.delete("/areas/{area_id}")
async def delete_area(area_id: str, request: Request, database: DatabaseSession, _user: LicensedUser) -> dict[str, Any]:
    """删除房间：先删 HA，再清本地目录。"""
    connector = request.app.state.studio_ha
    await connector.delete_area(area_id)
    connection = active_connection(database)
    if connection is not None:
        await asyncio.to_thread(persist_area_delete, database, connection.id, area_id)
    return {"success": True}


@router.put("/areas/{area_id}/entities")
async def set_area_entities(
    area_id: str,
    payload: HAAreaEntitiesRequest,
    request: Request,
    database: DatabaseSession,
    _user: LicensedUser,
) -> dict[str, Any]:
    """批量把实体归入房间（逐个调用 HA ``config/entity_registry/update``）。"""
    connector = request.app.state.studio_ha
    updated = 0
    failed: list[str] = []
    for entity_id in payload.entity_ids:
        try:
            await connector.update_entity_area(entity_id, area_id)
            updated += 1
        except Exception as exc:
            logger.debug("归区失败 entity=%s: %s", entity_id, exc)
            failed.append(entity_id)
    await asyncio.to_thread(database.commit)
    return {"success": not failed, "updated": updated, "failed": failed}


@router.get("/devices")
def list_devices(database: DatabaseSession, viewer: LicensedViewer) -> dict[str, Any]:
    connection = active_connection(database)
    if connection is None:
        return {"items": []}
    filters = [
        HADevice.connection_id == connection.id,
        HADevice.sync_status == "active",
        HADevice.disabled_by.is_(None),
    ]
    allowed_entity_ids = viewer_entity_ids(database, viewer)
    if allowed_entity_ids is not None:
        if not allowed_entity_ids:
            return {"items": []}
        allowed_device_ids = select(HAEntity.device_id).where(
            HAEntity.connection_id == connection.id,
            HAEntity.entity_id.in_(allowed_entity_ids),
            HAEntity.device_id.is_not(None),
        )
        filters.append(HADevice.device_id.in_(allowed_device_ids))
    devices = database.scalars(select(HADevice).where(*filters).order_by(HADevice.name_by_user, HADevice.name))
    return {
        "items": [
            {
                "deviceId": item.device_id,
                "name": item.name_by_user or item.name,
                "manufacturer": item.manufacturer,
                "model": item.model,
                **(
                    {"registryMetadata": json.loads(item.registry_metadata_json)} if item.registry_metadata_json else {}
                ),
                "areaId": item.area_id,
                "status": item.sync_status,
            }
            for item in devices
        ]
    }


@router.get("/sync/status")
def sync_status(request: Request, database: DatabaseSession, _viewer: LicensedViewer) -> dict[str, Any]:
    connection = active_connection(database)
    if connection is None:
        return {"configured": False, "status": "not_configured", "connected": False}
    state = database.get(HASyncState, connection.id)
    return {
        "configured": True,
        "connected": request.app.state.studio_ha.connected,
        "status": state.status if state else "idle",
        "phase": state.phase if state else None,
        "lastFullSyncAt": state.last_full_sync_at if state else None,
        "lastIncrementalAt": state.last_incremental_at if state else None,
        "lastReconciledAt": state.last_reconciled_at if state else None,
        "catalogRevision": state.catalog_revision if state else 0,
        "counts": {
            "entities": state.entity_count if state else 0,
            "devices": state.device_count if state else 0,
            "areas": state.area_count if state else 0,
        },
        "lastError": None
        if request.app.state.studio_ha.connected
        else connection_error_message(
            request.app.state.studio_ha.runtime_error or (state.last_error if state else None)
        ),
    }


@router.post("/sync")
async def run_sync(request: Request, _database: DatabaseSession, _user: LicensedUser) -> dict[str, Any]:
    if not request.app.state.license_service.allows(feature_codes.FEATURE_HA_SYNC):
        raise BusinessException(ErrorCode.FORBIDDEN, api_error("HA_SYNC_NOT_LICENSED"))
    connection = await asyncio.to_thread(load_active_connection_snapshot, request.app.state.database)
    if connection is None:
        raise BusinessException(ErrorCode.CONFLICT, api_error("HA_CONNECTION_REQUIRED"))
    try:
        counts = await request.app.state.studio_ha.sync_once(connection.id, reconciled=True)
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    return {"ok": True, "counts": counts}


@router.get("/health")
def ha_health(request: Request, _database: DatabaseSession, _viewer: LicensedViewer) -> dict[str, Any]:
    connection = active_connection(_database)
    connected = request.app.state.studio_ha.connected
    return {
        "configured": connection is not None,
        "connected": connected,
        "lastError": None
        if connected
        else connection_error_message(
            request.app.state.studio_ha.runtime_error or (connection.last_error if connection else None)
        ),
    }


@router.post("/services/call")
async def call_service(
    command: HAServiceCallRequest,
    request: Request,
    _database: DatabaseSession,
    viewer: LicensedViewer,
) -> dict[str, Any]:
    # 校验与下发全部住在 ``domains/ha/integration/service_call.py``（唯一出口）：
    # HTTP 语义只在这一行转换，状态码与 detail 文案保持字节级不变。
    try:
        result = await execute_service_call(
            request,
            command,
            access_check=lambda database, entity_id: require_viewer_entity(database, viewer, entity_id),
        )
    except ServiceCallRejected as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error
    _mark_agent_local_control(request, command.entity_id)
    return result


def _mark_agent_local_control(request: Request, entity_id: str) -> None:
    """把 App / 网页下发的控制标记成「手动操作」（实现见 agent.runtime.attribution）。"""
    mark_local_control_for_request(request, entity_id)


@router.post("/media/browse")
async def browse_media(
    command: HABrowseMediaRequest,
    request: Request,
    _database: DatabaseSession,
    viewer: LicensedViewer,
) -> dict[str, Any]:
    if not request.app.state.license_service.allows(feature_codes.FEATURE_HA_CONTROL):
        raise BusinessException(ErrorCode.FORBIDDEN, api_error("HA_CONTROL_NOT_LICENSED"))
    entity_domain = command.entity_id.partition(".")[0]
    if entity_domain != "media_player":
        raise BusinessException(ErrorCode.VALIDATION_FAILED, api_error("HA_MEDIA_BROWSE_DOMAIN_INVALID"))
    connection, entity_exists = await asyncio.to_thread(
        load_authorized_entity_context,
        request.app.state.database,
        viewer,
        command.entity_id,
    )
    if connection is None:
        raise BusinessException(ErrorCode.CONFLICT, api_error("HA_CONNECTION_REQUIRED"))
    if not entity_exists:
        raise BusinessException(ErrorCode.NOT_FOUND, api_error("HA_ENTITY_UNAVAILABLE"))
    try:
        client = await request.app.state.studio_ha.client_for(connection)
        browse = client.browse_player_media if command.player_library else client.browse_media
        result = await browse(
            command.entity_id,
            command.media_content_id,
            command.media_content_type or None,
        )
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    return {"ok": True, "result": result}


def websocket_viewer(websocket: WebSocket) -> ViewerPrincipal | None:
    settings = websocket.app.state.settings
    token = websocket.cookies.get(settings.cookie_name, "")
    with websocket.app.state.database.session_factory() as database:
        if not token:
            return None
        record = database.scalar(select(LoginSession).where(LoginSession.id_hash == session_token_hash(token)))
        now = datetime.now(UTC)
        if record is None or record.expires_at.replace(tzinfo=UTC) <= now:
            return None
        user = database.get(User, record.user_id)
        if user is None or not user.is_active:
            return None
        database.expunge(user)
        return ViewerPrincipal(user=user)


def websocket_origin_allowed(websocket: WebSocket) -> bool:
    """要求浏览器 WebSocket 必须源自本应用。

    判据统一到 :func:`platform.security.request_origin.browser_origin_allowed`：
    除了 ``APP_BASE_URL`` 与本次请求的 Host，还会认「额外公开访问来源」，并且容忍
    反代把 Host 的端口摘掉（这是「自定义域名/端口反代时实时状态连不上」的根因）。
    """
    return browser_origin_allowed(websocket, websocket=True)


@runtime_router.websocket("/ws/runtime")
async def runtime_websocket(websocket: WebSocket) -> None:
    context = {
        "requestId": uuid4().hex,
        "path": "/api/v1/ws/runtime",
        "method": "WEBSOCKET",
    }
    token = event_context.set(context)
    try:
        await _runtime_websocket(websocket, context)
    except Exception as error:
        await _runtime_log(
            websocket,
            "error",
            f"实时连接异常：{error}",
            context,
            details=traceback.format_exc(),
        )
        raise
    finally:
        event_context.reset(token)


async def _runtime_log(
    websocket: WebSocket,
    level: str,
    message: str,
    context: dict,
    *,
    details: str | None = None,
) -> None:
    log = getattr(websocket.app.state, "global_log", None)
    if log is not None:
        source = "展示设备" if context.get("displayId") else ("仪表盘编辑器" if context.get("actor") else "系统后台")
        await log.append_async(level, source, "实时连接", message, context=context, details=details)


async def _runtime_send_json(websocket: WebSocket, command: dict) -> None:
    try:
        # 文本帧 + orjson：``send_json`` 走 stdlib ``json.dumps``，而这一条路径上首帧是
        # 几百个实体的全量快照、批量帧可达 200 条 —— 实测（bench_json）orjson 约为
        # stdlib 的 8 倍。帧类型仍是 text，客户端解析方式不变。
        await websocket.send({"type": "websocket.send", "text": dumps_text(command)})
    except RuntimeError as error:
        if str(error) in {
            'Cannot call "send" once a close message has been sent.',
            "Unexpected ASGI message 'websocket.send', after sending 'websocket.close'.",
            "Unexpected ASGI message 'websocket.send', after sending 'websocket.close' or response already completed.",
        }:
            raise WebSocketDisconnect(code=1006) from error
        raise


async def _runtime_close_with_log(
    websocket: WebSocket, context: dict, code: int, reason: str, *, send_reason: bool = True
) -> None:
    # 关闭原因码 → 人话。日志里只出现原因码对排查毫无帮助，而这段文案会进入全局日志导出。
    close_explanations = {
        "origin not allowed": "页面来源未获允许",
        "authentication required": "需要登录或重新配对",
        "authentication expired": "登录会话已失效，请重新登录",
        "license restricted": "授权不可用或已到期",
        "subscribe message required": "未收到有效的实体订阅消息",
        "too many entities": "订阅实体数量超过上限",
    }
    await _runtime_log(
        websocket,
        "warning",
        f"实时连接已关闭：{close_explanations.get(reason, reason)}",
        {**context, "code": str(code), "phase": "rejected"},
    )
    await websocket.close(code=code, reason=reason if send_reason else None)


async def _runtime_authorize(websocket: WebSocket, context: dict) -> ViewerPrincipal | None:
    """来源 / 登录 / 授权三重校验；未通过时按原样关闭连接并返回 None。"""
    if not websocket_origin_allowed(websocket):
        await _runtime_close_with_log(websocket, context, 4403, "origin not allowed")
        return None
    viewer = await asyncio.to_thread(websocket_viewer, websocket)
    if viewer is None:
        await _runtime_close_with_log(websocket, context, 4401, "authentication required", send_reason=False)
        return None
    if viewer.user is not None:
        context["actor"] = getattr(viewer.user, "username", None)
    if not await asyncio.to_thread(websocket.app.state.license_service.allows, feature_codes.FEATURE_RUNTIME_WEBSOCKET):
        await _runtime_close_with_log(websocket, context, 4403, "license restricted", send_reason=False)
        return None
    return viewer


class _RuntimeSubscriptionState:
    """运行时长连的订阅状态：事件队列、订阅实体与是否已建立订阅。"""

    def __init__(self, queue: Any) -> None:
        self.queue = queue
        self.entity_ids: set[str] = set()
        self.watching = False
        #: 客户端是否声明能处理 ``state_changed_batch``（新前端在 subscribe 帧里带上）。
        #: 旧的 SPA 缓存不认识批量帧，所以批量下发必须显式协商，否则会静默不更新。
        self.supports_state_batch = False


async def _send_runtime_state_frames(
    states: list[dict], subscription: _RuntimeSubscriptionState, send_licensed
) -> bool:
    """把一批 hub 状态按协商结果下发：能批量就一帧，否则逐条。

    返回 ``False`` 表示连接已不可写（调用方应结束推送）。
    """
    if not states:
        return True
    if len(states) >= 2 and subscription.supports_state_batch:
        return await send_licensed({"type": "state_changed_batch", "events": states})
    for state in states:
        if not await send_licensed(state):
            return False
    return True


async def _runtime_subscribe_and_stream(
    websocket: WebSocket,
    context: dict,
    subscription: _RuntimeSubscriptionState,
    close_with_log,
    send_licensed,
) -> None:
    """等订阅帧 → 建立订阅 → 持续推送，直到两路协作任务任一路结束。"""
    subscribe = await asyncio.wait_for(websocket.receive_json(), timeout=30)
    if (
        not isinstance(subscribe, dict)
        or subscribe.get("type") != "subscribe"
        or not isinstance(subscribe.get("entityIds"), list)
    ):
        await close_with_log(4400, "subscribe message required")
        return
    entity_ids = {str(value) for value in subscribe["entityIds"] if isinstance(value, str)}
    subscription.entity_ids = entity_ids
    subscription.supports_state_batch = subscribe.get("supportsStateBatch") is True
    if len(entity_ids) > MAX_RUNTIME_ENTITIES:
        await close_with_log(4400, "too many entities")
        return
    websocket.app.state.studio_ha.state_hub.set_subscription_entities(subscription.queue, entity_ids)
    await websocket.app.state.studio_ha.add_runtime_entity_watch(entity_ids, ensure_states=False)
    subscription.watching = True

    async def apply_subscription_update(payload: dict) -> None:
        """订阅集合增量更新：不重连、不重下整包快照。

        旧实现（前端）在实体集合变化时断开重连：墙屏每改一次统计/弹窗就会重下一份
        全量快照并重建所有组件状态。这里只换订阅集合 + 补一份快照，连接与授权上下文
        都保留。
        """
        raw_ids = payload.get("entityIds")
        if not isinstance(raw_ids, list):
            return
        next_ids = {str(value) for value in raw_ids if isinstance(value, str)}
        if len(next_ids) > MAX_RUNTIME_ENTITIES:
            await close_with_log(4400, "too many entities")
            return
        added = next_ids - subscription.entity_ids
        removed = subscription.entity_ids - next_ids
        if not added and not removed:
            return
        if payload.get("supportsStateBatch") is not None:
            subscription.supports_state_batch = payload.get("supportsStateBatch") is True
        studio_ha = websocket.app.state.studio_ha
        subscription.entity_ids = next_ids
        # set_subscription_entities 会顺带清空握手期残留帧：随后的快照才是权威数据。
        studio_ha.state_hub.set_subscription_entities(subscription.queue, next_ids)
        if removed:
            await studio_ha.remove_runtime_entity_watch(removed)
        if added:
            await studio_ha.add_runtime_entity_watch(added, ensure_states=False)
        runtime_queue_put(
            subscription.queue,
            {"type": "snapshot", "states": await studio_ha.state_hub.snapshot(next_ids)},
        )
        await _runtime_log(
            websocket,
            "info",
            "实时订阅已更新",
            {**context, "phase": "subscribe_update", "added": len(added), "removed": len(removed)},
        )

    async def send_updates() -> None:
        """推送初始快照，然后持续转发状态事件并保活。"""
        # 先清握手期残留帧再取快照：快照本身已经包含它们。
        drain_runtime_queue_now(subscription.queue)
        initial_snapshot = await websocket.app.state.studio_ha.state_hub.snapshot(entity_ids)
        if not await send_licensed({"type": "snapshot", "states": initial_snapshot}):
            return
        # 首个状态帧必须无条件下发（不依赖订阅队列里是否残留过事件）：墙屏需要立刻知道
        # 中枢此刻是否在线，否则「HA 掉线」与「设备关着」在界面上完全一样。
        connector = websocket.app.state.studio_ha
        if not await send_licensed(
            {
                "type": "ha_status",
                "status": "connected" if connector.connected else "disconnected",
            }
        ):
            return
        # 状态补全是「尽力而为」：初始快照已经发出，补全失败不该拆掉整条实时推送。
        # ensure_entity_states 内部已逐实体容错并带退避重试，这里再兜一层，防的是
        # 未预期的异常（如取连接 / 合并阶段出错）把 send_updates 整体带崩。
        try:
            await websocket.app.state.studio_ha.ensure_entity_states(entity_ids)
        except Exception:
            await _runtime_log(
                websocket,
                "warning",
                "实时连接初始状态补全失败，继续转发事件",
                {**context, "phase": "hydrate"},
                details=traceback.format_exc(),
            )
        # 补全只会「新增 / 更新」少量实体：只推差异帧，不再整包重发一份快照。
        # 整包重发要前端整表替换 + 逐组件重绘，而差异通常只有个位数。
        hydrated_snapshot = await websocket.app.state.studio_ha.state_hub.snapshot(entity_ids)
        changed = diff_runtime_states(hydrated_snapshot, initial_snapshot)
        if changed and not await _send_runtime_state_frames(changed, subscription, send_licensed):
            return
        while True:
            try:
                event = await asyncio.wait_for(subscription.queue.get(), timeout=25)
            except TimeoutError:
                if not await send_licensed({"type": "ping"}):
                    return
                continue
            # 出站合并：一次场景切换/全屋开关会在同一瞬间产生几十上百条状态事件，
            # 逐条一帧会让墙屏解析 + 逐组件重绘的成本被放大同样的倍数。
            # 这里只等一个 12ms 的网络抖动级窗口（比一帧 16ms 还短），
            # 然后按实体取最后一条，把「N 条同一实体的中间态」压成一条。
            batch = [event] + await drain_runtime_queue(subscription.queue)
            merged = merge_runtime_state_events(batch)
            state_events = [item for item in merged if item.get("type") == "state_changed"]
            for item in merged:
                if item.get("type") == "state_changed":
                    continue
                if not await send_licensed(item):
                    return
            if len(state_events) >= 2 and subscription.supports_state_batch:
                if not await send_licensed({"type": "state_changed_batch", "events": state_events}):
                    return
                continue
            for item in state_events:
                if not await send_licensed(item):
                    return
        return

    async def receive_client_messages() -> None:
        """感知客户端断开，并处理订阅增量更新帧。"""
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                raise WebSocketDisconnect(code=message.get("code", 1000))
            raw_text = message.get("text")
            if not raw_text:
                continue
            try:
                payload = json.loads(raw_text)
            except (TypeError, ValueError):  # fmt: skip
                logger.debug("实时连接收到非 JSON 客户端消息，已跳过")
                continue
            if isinstance(payload, dict) and payload.get("type") == "update_subscription":
                await apply_subscription_update(payload)

    # 收包任务同时承担两件事：感知断开、处理订阅增量更新帧。
    async def receive_disconnect() -> None:
        await receive_client_messages()

    async def run_until_closed(operation) -> None:
        """跑一路任务，结束后取消另一路，并把真正的异常留给外层分流。"""
        nonlocal failure
        try:
            await operation()
        except Exception as error:
            if failure is None or not isinstance(error, WebSocketDisconnect):
                failure = error
        finally:
            tasks.cancel_scope.cancel()

    failure = None
    # shield=True：这一段的收尾（推送尾包 / 摘除订阅）不能被外层的取消打断，
    # 否则连接断开时会把内存里的订阅登记留成孤儿。
    with CancelScope(shield=True):
        async with create_task_group() as tasks:
            tasks.start_soon(run_until_closed, send_updates)
            tasks.start_soon(run_until_closed, receive_disconnect)
    if failure is not None:
        raise failure


async def _runtime_run_until_closed(
    websocket: WebSocket,
    context: dict,
    subscription: _RuntimeSubscriptionState,
    monitor_access,
    subscribe_and_stream,
) -> None:
    """三路任务编排：订阅推送、授权周期复检、连接断开感知；并处理断开与超时。"""
    failure = None
    try:
        async with create_task_group() as tasks:
            # 三路：订阅并推送、授权周期复检、连接断开感知。任一路结束都会取消其余两路。
            async def run_until_closed(operation) -> None:
                nonlocal failure
                try:
                    await operation()
                except Exception as error:
                    if failure is None or not isinstance(error, WebSocketDisconnect):
                        failure = error
                finally:
                    tasks.cancel_scope.cancel()

            tasks.start_soon(run_until_closed, monitor_access)
            tasks.start_soon(run_until_closed, subscribe_and_stream)
        if failure is not None:
            raise failure
    except WebSocketDisconnect as error:
        if error.code not in {1000, 1001, 1005}:
            await _runtime_log(
                websocket,
                "warning",
                "实时连接异常断开",
                {**context, "code": str(error.code), "phase": "disconnected"},
            )
    except TimeoutError:
        await _runtime_log(
            websocket,
            "warning",
            "实时连接等待订阅超时",
            {**context, "code": "SUBSCRIBE_TIMEOUT", "phase": "subscribe"},
        )
    finally:
        try:
            if subscription.watching:
                await websocket.app.state.studio_ha.remove_runtime_entity_watch(subscription.entity_ids)
        finally:
            websocket.app.state.studio_ha.state_hub.unsubscribe(subscription.queue)


async def _runtime_websocket(websocket: WebSocket, context: dict) -> None:
    viewer = await _runtime_authorize(websocket, context)
    if viewer is None:
        return
    await websocket.accept()
    await _runtime_log(websocket, "info", "实时连接已建立", {**context, "phase": "accepted"})
    subscription = _RuntimeSubscriptionState(websocket.app.state.studio_ha.state_hub.subscribe())
    # 授权与登录态在长连期间仍会变化：access_closed 记住「已经因为授权/登录问题关过连接」，
    # 之后所有发送一律短路，避免在关闭途中继续往外推数据。
    access_closed = False
    # 授权复检缓存：_runtime_authorize 刚刚做过「授权 + 登录会话」的权威校验，先 seed 缓存。
    # 稳态下每条出站帧不再 to_thread 查库；周期复检任务仍按 RUNTIME_LICENSE_CHECK_SECONDS
    # 做权威复检，因此吊销 / 会话失效的收敛延迟上限 = 缓存窗口 + 该间隔。
    access_cache_seconds = _runtime_access_cache_seconds(websocket)
    access_checked_at = time.monotonic()

    async def recheck_access() -> bool:
        """权威复检：能力码仍有效，且登录会话还是同一个人；失败即关闭连接。"""
        nonlocal access_closed, access_checked_at
        if access_closed:
            return False
        allowed = await asyncio.to_thread(
            websocket.app.state.license_service.allows, feature_codes.FEATURE_RUNTIME_WEBSOCKET
        )
        if not allowed:
            if not access_closed:
                access_closed = True
                await close_with_log(4403, "license restricted", send_reason=False)
            return False
        if access_closed:
            return False
        current = await asyncio.to_thread(websocket_viewer, websocket)
        if current is None or current.user is None or current.user.id != viewer.user.id:
            if not access_closed:
                access_closed = True
                await close_with_log(4401, "authentication expired", send_reason=False)
            return False
        access_checked_at = time.monotonic()
        return True

    async def access_allowed() -> bool:
        """出站帧的授权判定：缓存窗口内直接放行，过期后回落到权威复检。"""
        if access_closed:
            return False
        if (
            access_cache_seconds > 0
            and access_checked_at > 0
            and time.monotonic() - access_checked_at < access_cache_seconds
        ):
            return True
        return await recheck_access()

    async def send_licensed(command: dict) -> bool:
        """所有出站消息的唯一出口：先确认还有效，再发送。"""
        if not await access_allowed():
            return False
        await _runtime_send_json(websocket, command)
        return True

    async def monitor_access() -> None:
        """单独一路任务周期性复检授权，断开已经失效的长连（不复用缓存）。"""
        if not await recheck_access():
            return
        while True:
            await asyncio.sleep(RUNTIME_LICENSE_CHECK_SECONDS)
            if not await recheck_access():
                return

    async def close_with_log(code: int, reason: str, *, send_reason: bool = True) -> None:
        await _runtime_close_with_log(websocket, context, code, reason, send_reason=send_reason)

    async def subscribe_and_stream() -> None:
        """等订阅帧 → 建立订阅 → 持续推送。"""
        await _runtime_subscribe_and_stream(websocket, context, subscription, close_with_log, send_licensed)

    await _runtime_run_until_closed(websocket, context, subscription, monitor_access, subscribe_and_stream)
    return
