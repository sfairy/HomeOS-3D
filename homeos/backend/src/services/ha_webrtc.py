"""HA WebRTC 信令转发服务（对齐 HaWebrtcSignalService）。

经 HomeOS → HA WebSocket 转发 ``camera/webrtc/*`` 信令，HTTPS 页面无需直连 HA；
同时负责 ICE Server 配置合并（用户配置 + 默认 STUN）。
"""

from __future__ import annotations

import re
from typing import Any

from ..core.app_config import load_raw_config
from ..core.errors import BusinessException, ErrorCode, api_error, bad_request
from .webrtc_ice import (
    DEFAULT_STUN_SERVERS,
    build_ice_servers_from_config,
    merge_ha_client_config_with_ice,
    merge_ice_servers,
)

_INFRA_ERROR_RE = re.compile(r"超时|timeout|未连接|not connected", re.I)


def _is_ha_infra_request_error(error: Exception) -> bool:
    return bool(_INFRA_ERROR_RE.search(str(error)))


class HaWebrtcSignalService:
    def __init__(self, ws_client, session_factory) -> None:
        self._ws = ws_client
        self._session_factory = session_factory

    # ------------------------------------------------------------------ #
    # ICE 配置
    # ------------------------------------------------------------------ #
    def get_configured_ice_servers(self) -> list[dict[str, Any]]:
        try:
            with self._session_factory() as session:
                raw = load_raw_config(session)
            webrtc = raw.get("webrtc") if isinstance(raw.get("webrtc"), dict) else {}
        except Exception:  # noqa: BLE001
            webrtc = {}
        return build_ice_servers_from_config(webrtc)

    def get_merged_ice_servers(self) -> list[dict[str, Any]]:
        return merge_ice_servers(self.get_configured_ice_servers(), DEFAULT_STUN_SERVERS)

    def _ensure_connected(self) -> None:
        if not self._ws.is_connected():
            raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, api_error("HA_WEBRTC_NOT_CONNECTED"))

    # ------------------------------------------------------------------ #
    # 信令
    # ------------------------------------------------------------------ #
    async def get_client_config(self, entity_id: str) -> dict[str, Any]:
        self._ensure_connected()
        if not entity_id.startswith("camera."):
            bad_request(api_error("VALIDATION_CAMERA_ENTITY_REQUIRED"))
        try:
            payload = await self._ws.send_request(
                "camera/webrtc/get_client_config", {"entity_id": entity_id}, 10_000
            )
        except Exception as exc:  # noqa: BLE001
            if _is_ha_infra_request_error(exc):
                raise
            payload = {}
        return merge_ha_client_config_with_ice(
            payload if isinstance(payload, dict) else {}, self.get_configured_ice_servers()
        )

    async def negotiate_offer(self, entity_id: str, offer: str) -> dict[str, Any]:
        self._ensure_connected()
        if not entity_id.startswith("camera."):
            bad_request(api_error("VALIDATION_CAMERA_ENTITY_REQUIRED"))
        if not offer or not offer.strip():
            bad_request(api_error("VALIDATION_OFFER_REQUIRED"))
        result = await self._ws.subscribe_webrtc_offer(entity_id, offer.strip())
        return {
            "session_id": result.session_id,
            "answer": result.answer,
            "candidates": result.candidates,
            "subscription_id": result.subscription_id,
        }

    async def add_candidate(
        self, entity_id: str, session_id: str, candidate: dict[str, Any]
    ) -> None:
        self._ensure_connected()
        await self._ws.send_request(
            "camera/webrtc/candidate",
            {"entity_id": entity_id, "session_id": session_id, "candidate": candidate},
            10_000,
        )

    async def close_session(self, subscription_id: int) -> None:
        self._ensure_connected()
        await self._ws.unsubscribe(subscription_id)

    async def get_hls_stream_path(self, entity_id: str) -> dict[str, str]:
        self._ensure_connected()
        if not entity_id.startswith("camera."):
            bad_request(api_error("VALIDATION_CAMERA_ENTITY_REQUIRED"))
        try:
            result = await self._ws.send_request(
                "camera/stream", {"entity_id": entity_id, "format": "hls"}, 20_000
            )
        except Exception as exc:  # noqa: BLE001
            if _is_ha_infra_request_error(exc):
                raise
            return {"path": ""}
        raw = str((result or {}).get("url") or "").strip() if isinstance(result, dict) else ""
        if not raw:
            return {"path": ""}
        if raw.startswith(("http://", "https://")):
            from urllib.parse import urlsplit

            parsed = urlsplit(raw)
            path = f"{parsed.path}?{parsed.query}" if parsed.query else parsed.path
            return {"path": path}
        return {"path": raw if raw.startswith("/") else f"/{raw}"}
