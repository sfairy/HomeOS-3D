"""命令代理路由（``/api/v1/services/*``、``/api/v1/audit/*``、``/api/v1/ha/*``）。

逐条对齐 Nest CommandProxyController：授权（role/白名单/儿童模式 ACL）→ 执行 → 审计。
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, Query, Request
from fastapi.responses import Response, StreamingResponse

from ..core.errors import api_error, bad_request
from ..security.auth_context import require_roles, require_user
from ..services import command_audit
from ..services.command_proxy_auth import (
    assert_command_proxy_authorized,
    assert_ha_media_path_authorized,
    assert_history_authorized,
    assert_webrtc_authorized,
)
from ..services.ha_config import describe_ha_url_for_deploy_error
from ..services.ha_media_path import (
    is_ha_m3u8_path,
    resolve_ha_media_proxy_cache_control,
    rewrite_ha_m3u8_for_proxy,
    validate_ha_stream_path,
)
from .router import NestRouter
from .schemas.command_proxy import (
    CallServiceDto,
    HaTestConnectionDto,
    WebRtcCandidateDto,
    WebRtcCloseDto,
    WebRtcNegotiateDto,
)

router = NestRouter(tags=["connect"])

def _proxy(request: Request):
    return request.app.state.command_proxy

def _gate(request: Request):
    return request.app.state.child_mode_gate

def _connector(request: Request):
    return request.app.state.ha_connector

def _webrtc(request: Request):
    return request.app.state.ha_webrtc

def _session_factory(request: Request):
    return request.app.state.database.session_factory

class _TargetResolver:
    """间接目标解析：注册表（area/device/label） + 状态内存（属性谓词）。"""

    def __init__(self, request: Request) -> None:
        self._request = request

    async def get_registry(self) -> list[dict[str, Any]]:
        return await _connector(self._request).fetch_entity_registry()

    def find_entity_ids(self, predicate) -> list[str]:
        gateway = getattr(self._request.app.state, "realtime", None)
        store = getattr(gateway, "state_store", None)
        if store is None:
            return []
        return [
            entity["entity_id"]
            for entity in store.get_all()
            if entity.get("entity_id") and predicate(entity.get("attributes") or {})
        ]

def _parse_int(value: str | None, fallback: int) -> int:
    if value is None or value == "":
        return fallback
    try:
        return int(value, 10)
    except (TypeError, ValueError):
        return fallback

# ---------------------------------------------------------------------- #
# services/call
# ---------------------------------------------------------------------- #
@router.post("/services/call")
async def call_service(
    payload: CallServiceDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult", "child")),
):
    dto = payload.model_dump()
    try:
        await assert_command_proxy_authorized(dto, user, _gate(request), _TargetResolver(request))
    except Exception as err:  # noqa: BLE001 - 授权拒绝同样入审计
        command_audit.log_command_audit(_session_factory(request), user, dto, False, f"授权拒绝: {err}")
        raise
    try:
        result = await _proxy(request).call_service(dto)
        command_audit.log_command_audit(_session_factory(request), user, dto, True)
        return result
    except Exception as err:  # noqa: BLE001
        command_audit.log_command_audit(_session_factory(request), user, dto, False, str(err))
        raise

# ---------------------------------------------------------------------- #
# audit/commands
# ---------------------------------------------------------------------- #
@router.get("/audit/commands")
async def get_command_audit(
    request: Request,
    limit: str | None = Query(default=None),
    skip: str | None = Query(default=None),
    page: str | None = Query(default=None),
    entityId: str | None = Query(default=None),
    username: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    with _session_factory(request)() as session:
        return command_audit.list_command_audit(
            session, limit=limit, skip=skip, page=page, entity_id=entityId, username=username
        )

@router.delete("/audit/commands")
async def clear_command_audit(
    request: Request,
    entityId: str | None = Query(default=None),
    username: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    with _session_factory(request)() as session:
        return command_audit.clear_command_audit(session, entityId, username)

# ---------------------------------------------------------------------- #
# ha/test-connection
# ---------------------------------------------------------------------- #
@router.post("/ha/test-connection")
async def test_ha_connection(
    payload: HaTestConnectionDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    url = payload.url.strip()
    url_error = describe_ha_url_for_deploy_error(url)
    if url_error:
        return {"ok": False, "message": url_error}
    return await _proxy(request).test_ha_connection(url, payload.token.strip())

# ---------------------------------------------------------------------- #
# ha/history
# ---------------------------------------------------------------------- #
@router.get("/ha/history")
async def get_history(
    request: Request,
    entity_ids: str | None = Query(default=None),
    hours: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    if not entity_ids:
        bad_request(api_error("PROXY_ENTITY_IDS_REQUIRED"))
    ids = [item.strip() for item in entity_ids.split(",") if item.strip()]
    if len(ids) > 15:
        bad_request(api_error("PROXY_ENTITY_IDS_MAX"))
    assert_history_authorized(ids, user, _gate(request))
    parsed_hours = _parse_int(hours, 24)
    if parsed_hours < 1 or parsed_hours > 168:
        bad_request(api_error("PROXY_HOURS_RANGE"))
    return await _proxy(request).fetch_history(ids, parsed_hours)

# ---------------------------------------------------------------------- #
# ha/queue/*
# ---------------------------------------------------------------------- #
@router.get("/ha/queue/dropped")
async def get_dropped_ha_commands(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin"))
):
    return {"dropped": _proxy(request).get_dropped_commands()}

@router.post("/ha/queue/retry")
async def retry_dropped_ha_commands(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin"))
):
    return await _proxy(request).retry_dropped_commands()

# ---------------------------------------------------------------------- #
# ha/webrtc/*
# ---------------------------------------------------------------------- #
@router.get("/ha/webrtc/client-config")
async def webrtc_client_config(
    request: Request,
    entity_id: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    if not entity_id or not entity_id.strip():
        bad_request(api_error("PROXY_ENTITY_ID_REQUIRED"))
    assert_webrtc_authorized(entity_id.strip(), user, _gate(request))
    return await _webrtc(request).get_client_config(entity_id.strip())

@router.get("/ha/webrtc/ice-servers")
async def webrtc_ice_servers(request: Request, user: dict[str, Any] = Depends(require_user)):
    return {"iceServers": _webrtc(request).get_merged_ice_servers()}

@router.post("/ha/webrtc/negotiate")
async def webrtc_negotiate(
    payload: WebRtcNegotiateDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult", "child")),
):
    assert_webrtc_authorized(payload.entity_id.strip(), user, _gate(request))
    return await _webrtc(request).negotiate_offer(payload.entity_id.strip(), payload.offer.strip())

@router.post("/ha/webrtc/candidate")
async def webrtc_candidate(
    payload: WebRtcCandidateDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult", "child")),
):
    assert_webrtc_authorized(payload.entity_id.strip(), user, _gate(request))
    await _webrtc(request).add_candidate(
        payload.entity_id.strip(), payload.session_id.strip(), payload.candidate
    )
    return {"ok": True}

@router.post("/ha/webrtc/close")
async def webrtc_close(
    payload: WebRtcCloseDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult", "child")),
):
    assert_webrtc_authorized(payload.entity_id.strip(), user, _gate(request))
    await _webrtc(request).close_session(int(payload.subscription_id))
    return {"ok": True}

# ---------------------------------------------------------------------- #
# ha/camera-hls
# ---------------------------------------------------------------------- #
@router.get("/ha/camera-hls")
async def camera_hls(
    request: Request,
    entity_id: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    if not entity_id or not entity_id.strip():
        bad_request(api_error("PROXY_ENTITY_ID_REQUIRED"))
    assert_webrtc_authorized(entity_id.strip(), user, _gate(request))
    return await _webrtc(request).get_hls_stream_path(entity_id.strip())

# ---------------------------------------------------------------------- #
# ha/media-proxy
# ---------------------------------------------------------------------- #
@router.get("/ha/media-proxy")
async def proxy_media(
    request: Request,
    path: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    if not path:
        bad_request(api_error("PROXY_PATH_REQUIRED"))
    assert_ha_media_path_authorized(path, user, _gate(request))
    try:
        data, content_type = await _proxy(request).fetch_media_image(path)
    except Exception:  # noqa: BLE001
        return Response(content="网关错误：无法从 HA 获取图像", status_code=502, media_type="text/plain")
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": resolve_ha_media_proxy_cache_control(path)},
    )

# ---------------------------------------------------------------------- #
# ha/stream-proxy
# ---------------------------------------------------------------------- #
@router.get("/ha/stream-proxy")
async def proxy_stream(
    request: Request,
    path: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    if not path:
        bad_request(api_error("PROXY_PATH_REQUIRED"))
    assert_ha_media_path_authorized(path, user, _gate(request))
    client = None
    try:
        client, upstream_request = _proxy(request).open_media_stream(path)
        response = await client.send(upstream_request, stream=True)
    except Exception:  # noqa: BLE001
        if client is not None:
            await client.aclose()
        return Response(content="网关错误：无法从 HA 获取媒体流", status_code=502, media_type="text/plain")
    if response.status_code >= 400:
        await response.aclose()
        await client.aclose()
        return Response(content="网关错误：无法从 HA 获取媒体流", status_code=502, media_type="text/plain")

    content_type = response.headers.get("content-type") or "application/octet-stream"
    if is_ha_m3u8_path(path, content_type):
        text = (await response.aread()).decode("utf-8", errors="replace")
        await response.aclose()
        await client.aclose()
        return Response(
            content=rewrite_ha_m3u8_for_proxy(text, validate_ha_stream_path(path)),
            media_type=content_type,
            headers={"Cache-Control": "no-cache"},
        )

    async def _generator():
        try:
            async for chunk in response.aiter_bytes():
                yield chunk
        finally:
            await response.aclose()
            await client.aclose()

    return StreamingResponse(
        _generator(),
        media_type=content_type,
        headers={"Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no"},
    )
