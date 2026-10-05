"""HA REST 客户端（对齐 HaRestClientService 的核心端点）。

作为 WebSocket 连接器的功能等价实现（HTTP 契约一致），用于：
- ``services/call`` 命令下发（``POST /api/services/{domain}/{service}``）；
- 实体历史（``GET /api/history/period/{start}``）；
- 全量状态 / 实体注册表（WebSocket 不可用时的 REST 回退）；
- 连通性探测（``GET /api/``）；
- 媒体图像 / 流代理透传。
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from ..core.errors import api_error, bad_request
from .ha_config import HaEndpoints, normalize_ha_url

logger = logging.getLogger("homeos.ha_rest")


class HaRestClient:
    """无状态 HA REST 客户端（每次调用读取最新端点）。"""

    def __init__(self, endpoint_loader) -> None:
        self._endpoint_loader = endpoint_loader

    def _resolve(self) -> HaEndpoints:
        return self._endpoint_loader()

    async def call_service_via_rest(
        self,
        domain: str,
        service: str,
        entity_id: str | None = None,
        service_data: dict[str, Any] | None = None,
        timeout_ms: int = 10_000,
    ) -> Any:
        endpoints = self._resolve()
        if not endpoints.ha_url_primary or not endpoints.token:
            bad_request(api_error("HA_NOT_CONFIGURED"))
        data = dict(service_data or {})
        return_response = data.pop("return_response", False) is True
        qs = "?return_response" if return_response else ""
        url = f"{endpoints.ha_url_primary}/api/services/{domain}/{service}{qs}"
        body = dict(data)
        if entity_id:
            body["entity_id"] = entity_id
        async with httpx.AsyncClient(timeout=timeout_ms / 1000) as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {endpoints.token}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
        if response.status_code >= 400:
            detail = response.text or response.reason_phrase
            try:
                parsed = json.loads(response.text)
                detail = parsed.get("message") or parsed.get("error") or detail
            except (TypeError, ValueError):
                pass
            bad_request(api_error("HA_REST_API_FAILED", response.status_code, detail))
        payload: Any
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        if return_response and isinstance(payload, dict):
            if payload.get("response") is None and payload.get("service_response") is not None:
                payload = {**payload, "response": payload["service_response"]}
        return payload

    async def fetch_history(self, entity_ids: list[str], hours: int) -> Any:
        endpoints = self._resolve()
        if not endpoints.ha_url_primary or not endpoints.token:
            bad_request(api_error("HA_NOT_CONFIGURED"))
        start = (datetime.now(UTC) - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        encoded = ",".join(entity_ids)
        url = (
            f"{endpoints.ha_url_primary}/api/history/period/{start}"
            f"?filter_entity_id={encoded}&minimal_response=true"
        )
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(
                    url,
                    headers={
                        "Authorization": f"Bearer {endpoints.token}",
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                    },
                )
        except httpx.HTTPError:
            return []
        if response.status_code >= 400:
            bad_request(api_error("HA_REST_RESPONSE_FAILED", response.status_code))
        try:
            return response.json()
        except ValueError:
            return []

    async def fetch_all_states(self, timeout: float = 60) -> list[dict[str, Any]]:
        endpoints = self._resolve()
        if not endpoints.ha_url_primary or not endpoints.token:
            return []
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(
                    f"{normalize_ha_url(endpoints.ha_url_primary)}/api/states",
                    headers={
                        "Authorization": f"Bearer {endpoints.token}",
                        "Content-Type": "application/json",
                    },
                )
        except httpx.HTTPError:
            return []
        if response.status_code >= 400:
            return []
        try:
            payload = response.json()
        except ValueError:
            return []
        return payload if isinstance(payload, list) else []

    async def fetch_entity_registry(self, timeout: float = 30) -> list[dict[str, Any]]:
        endpoints = self._resolve()
        if not endpoints.ha_url_primary or not endpoints.token:
            return []
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(
                    f"{normalize_ha_url(endpoints.ha_url_primary)}/api/config/entity_registry/list",
                    headers={
                        "Authorization": f"Bearer {endpoints.token}",
                        "Content-Type": "application/json",
                    },
                )
        except httpx.HTTPError:
            return []
        if response.status_code in (404, 405):
            return []
        if response.status_code >= 400:
            return []
        try:
            payload = response.json()
        except ValueError:
            return []
        return payload if isinstance(payload, list) else []

    async def fetch_entity_state(self, entity_id: str) -> dict[str, Any] | None:
        """拉取单个实体的实时状态（对齐 Nest ``fetchEntityState``）；失败返回 ``None``。"""
        endpoints = self._resolve()
        if not endpoints.ha_url_primary or not endpoints.token:
            return None
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.get(
                    f"{normalize_ha_url(endpoints.ha_url_primary)}/api/states/{entity_id}",
                    headers={
                        "Authorization": f"Bearer {endpoints.token}",
                        "Content-Type": "application/json",
                    },
                )
        except httpx.HTTPError as error:
            logger.error("获取实体状态失败 [%s]: %s", entity_id, error)
            return None
        if response.status_code >= 400:
            return None
        try:
            payload = response.json()
        except ValueError:
            return None
        return payload if isinstance(payload, dict) else None

    async def test_connection(self, url: str, token: str) -> dict[str, Any]:
        base = normalize_ha_url((url or "").strip())
        if not base:
            return {"ok": False, "message": "HA 地址不能为空"}
        if not (token or "").strip():
            return {"ok": False, "message": "访问令牌不能为空"}
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                response = await client.get(
                    f"{base}/api/", headers={"Authorization": f"Bearer {token.strip()}"}
                )
        except httpx.HTTPError as error:
            return {"ok": False, "message": f"无法连接 HA：{error}"}
        if response.status_code in (401, 403):
            return {"ok": False, "message": f"认证失败（HTTP {response.status_code}），请检查令牌"}
        if response.status_code >= 400:
            text = response.text[:120]
            suffix = f": {text}" if text else ""
            return {"ok": False, "message": f"无法连接 HA（HTTP {response.status_code}）{suffix}"}
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        return {
            "ok": True,
            "message": payload.get("message") or "连接成功",
            "ha_version": payload.get("version"),
        }

    async def fetch_media_image(self, path: str) -> tuple[bytes, str]:
        from .ha_media_path import validate_ha_media_path

        endpoints = self._resolve()
        if not endpoints.ha_url_primary or not endpoints.token:
            bad_request(api_error("HA_NOT_CONFIGURED"))
        clean = validate_ha_media_path(path)
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                f"{normalize_ha_url(endpoints.ha_url_primary)}{clean}",
                headers={"Authorization": f"Bearer {endpoints.token}"},
            )
        if response.status_code >= 400:
            raise RuntimeError(f"HA image proxy failed: {response.status_code}")
        return response.content, response.headers.get("content-type", "image/jpeg")

    def open_media_stream(self, path: str):
        """返回 ``(client, request)``，由路由层发送并负责关闭 client。"""
        from .ha_media_path import build_ha_stream_fetch_headers, validate_ha_stream_path

        endpoints = self._resolve()
        if not endpoints.ha_url_primary or not endpoints.token:
            bad_request(api_error("HA_NOT_CONFIGURED"))
        clean = validate_ha_stream_path(path)
        client = httpx.AsyncClient(timeout=None)
        request = client.build_request(
            "GET",
            f"{normalize_ha_url(endpoints.ha_url_primary)}{clean}",
            headers={
                "Authorization": f"Bearer {endpoints.token}",
                **build_ha_stream_fetch_headers(clean),
            },
        )
        return client, request
