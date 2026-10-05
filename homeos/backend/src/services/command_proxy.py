"""命令代理服务（对齐 CommandProxyService 的核心行为）。

作为 HA 连接器的上层封装，保留：
- HA 未连接时拦截高风险操作（``is_dangerous_ha_control``）；
- 幂等键去重（Redis SET NX 优先，内存 Map 回退，失败释放）；
- 历史查询 / 连通性探测 / 媒体图像与流透传 / 断连队列查询与重试。
"""

from __future__ import annotations

import logging
import random
import time
from datetime import UTC, datetime
from typing import Any

from ..core.app_config import load_raw_config
from ..core.errors import BusinessException, ErrorCode, api_error, bad_request
from .command_proxy_auth import is_dangerous_ha_control

logger = logging.getLogger("homeos.command_proxy")

DEFAULT_COMMAND_PROXY = {"idempotencyTtlMs": 3000, "idempotencyCleanupIntervalMs": 60_000}


def _load_section(session, key: str, defaults: dict[str, Any]) -> dict[str, Any]:
    raw = load_raw_config(session)
    section = raw.get(key) if isinstance(raw.get(key), dict) else {}
    return {**defaults, **section}


class CommandProxyService:
    def __init__(self, session_factory, connector, redis=None) -> None:
        self._session_factory = session_factory
        self._connector = connector
        self._redis = redis
        self._idempotency: dict[str, float] = {}
        self._command_proxy_cfg = DEFAULT_COMMAND_PROXY

    def _config(self) -> dict[str, Any]:
        try:
            with self._session_factory() as session:
                self._command_proxy_cfg = _load_section(session, "commandProxy", DEFAULT_COMMAND_PROXY)
        except Exception:  # noqa: BLE001
            self._command_proxy_cfg = DEFAULT_COMMAND_PROXY
        return self._command_proxy_cfg

    async def _claim_idempotency_key(self, key: str) -> bool:
        ttl = int(self._config().get("idempotencyTtlMs") or 3000)
        if self._redis is not None and self._redis.is_ready():
            client = self._redis.get_client()
            if client is not None:
                try:
                    ok = await client.set(f"homeos:cmd-idem:{key}", "1", px=ttl, nx=True)
                    return bool(ok)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Redis 幂等键写入失败,回退内存: %s", exc)
        now = time.time() * 1000
        # 惰性清理：内存回退路径的条目按 TTL 剪枝，替代 Nest 的 setInterval 定期清理，
        # 避免长期运行（Redis 未就绪）时幂等键表无界增长。
        if len(self._idempotency) >= 512:
            cutoff = now - max(ttl, int(self._config().get("idempotencyTtlMs") or ttl))
            self._idempotency = {k: v for k, v in self._idempotency.items() if v > cutoff}
        last = self._idempotency.get(key)
        if last and now - last < ttl:
            return False
        self._idempotency[key] = now
        return True

    async def _release_idempotency_key(self, key: str) -> None:
        self._idempotency.pop(key, None)
        if self._redis is not None and self._redis.is_ready():
            client = self._redis.get_client()
            if client is not None:
                try:
                    await client.delete(f"homeos:cmd-idem:{key}")
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Redis 幂等键释放失败: %s", exc)

    async def call_service(self, dto: dict[str, Any]) -> dict[str, Any]:
        idempotency_key = dto.get("idempotency_key")
        if idempotency_key:
            claimed = await self._claim_idempotency_key(str(idempotency_key))
            if not claimed:
                logger.debug("幂等键命中,跳过重复命令: %s", idempotency_key)
                return {
                    "success": True,
                    "message_id": f"idem-{idempotency_key}",
                    "timestamp": _iso_now(),
                    "queued": False,
                    "skipped": True,
                    "data": {"skipped": True, "reason": "duplicate_idempotency_key"},
                }
        domain = str(dto.get("domain") or "")
        service = str(dto.get("service") or "")
        entity_id = str(dto.get("entity_id") or "")
        service_data = dto.get("service_data") if isinstance(dto.get("service_data"), dict) else {}
        return_response = bool(dto.get("return_response"))
        try:
            status = await self._connector.get_status()
            if not status.get("connected") and is_dangerous_ha_control(domain, service, entity_id):
                raise BusinessException(
                    ErrorCode.SERVICE_UNAVAILABLE,
                    f"Home Assistant 未连接，已拦截高风险操作（{entity_id}）。请恢复 HA 连接后再试。",
                )
            if not status.get("connected"):
                logger.warning("HA 未连接，命令将入队等待重连: %s.%s → %s", domain, service, entity_id)

            data = await self._connector.call_service(
                domain, service, entity_id, service_data, return_response, idempotency_key and str(idempotency_key)
            )
            queued = bool(data.get("queued")) if isinstance(data, dict) and not isinstance(data, list) else False
            message_id = f"{int(time.time() * 1000)}-{_rand_suffix()}"
            logger.debug("[命令] %s.%s → %s | id: %s%s", domain, service, entity_id, message_id, " | queued" if queued else "")
            return {
                "success": True,
                "message_id": message_id,
                "timestamp": _iso_now(),
                "queued": queued,
                "skipped": False,
                "data": data,
            }
        except BusinessException:
            if idempotency_key:
                await self._release_idempotency_key(str(idempotency_key))
            raise
        except Exception as exc:  # noqa: BLE001
            if idempotency_key:
                await self._release_idempotency_key(str(idempotency_key))
            message = _format_service_call_error(exc)
            if message in ("HA not connected", "HA 未连接", "WebSocket 未连接"):
                raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, api_error("HA_NOT_CONNECTED")) from exc
            logger.error("[命令错误] %s.%s → %s 失败: %s", domain, service, entity_id, message)
            bad_request(api_error("PROXY_HA_SERVICE_FAILED", message))

    async def fetch_history(self, entity_ids: list[str], hours: int) -> Any:
        return await self._connector.fetch_history(entity_ids, hours)

    async def test_ha_connection(self, url: str, token: str) -> dict[str, Any]:
        return await self._connector.test_ha_connection(url, token)

    async def fetch_media_image(self, path: str) -> tuple[bytes, str]:
        return await self._connector.fetch_media_image(path)

    def open_media_stream(self, path: str):
        return self._connector.open_media_stream(path)

    def get_dropped_commands(self) -> list[dict[str, Any]]:
        return self._connector.get_dropped_commands()

    async def retry_dropped_commands(self) -> dict[str, int]:
        return await self._connector.retry_dropped_commands()


def _format_service_call_error(error: Exception) -> str:
    message = str(error or "").strip()
    if message:
        return message
    name = error.__class__.__name__
    return name if name != "Exception" else "未知错误"


def _iso_now() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def _rand_suffix() -> str:
    alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
    return "".join(random.choice(alphabet) for _ in range(8))
