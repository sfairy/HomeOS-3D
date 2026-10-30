"""命令代理服务（对齐 CommandProxyService 的核心行为）。

作为 HA 连接器的上层封装，保留：
- HA 未连接时拦截高风险操作（``is_dangerous_ha_control``）；
- 幂等键去重（进程内 Map + TTL 剪枝，失败释放）；
- 历史查询 / 连通性探测 / 媒体图像与流透传 / 断连队列查询与重试。
"""

from __future__ import annotations

import logging
import random
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from .command_proxy_auth import is_dangerous_ha_control
from .verification import describe_service_verification
from ...platform.core.app_config import load_raw_config
from ...platform.core.errors import BusinessException, ErrorCode, api_error, bad_request
from ...platform.core.json_field import object_field

logger = logging.getLogger("homeos.command_proxy")

DEFAULT_COMMAND_PROXY = {"idempotencyTtlMs": 3000, "idempotencyCleanupIntervalMs": 60_000}

#: 幂等表条目上限（超过即按 TTL 剪枝，避免长期运行无界增长）。
_IDEMPOTENCY_MAX_ENTRIES = 512
#: 「已完成」结果的保留时长：网络重试往往在几秒后才到达，只记 3s 会重复执行。
_IDEMPOTENCY_RESULT_TTL_MS = 30_000


@dataclass
class _IdempotencyEntry:
    """幂等键条目。

    旧实现把值存成「首次请求时间戳」，重复键直接返回 ``success: True`` —— 既没有
    等待首次结果，也可能在首次请求失败时伪造成功。现在区分
    ``inflight``（下发中，重复请求返回 pending）与 ``done``（复用首次真实结果）。
    """

    state: str
    created_at: float
    result: dict[str, Any] | None = None


def _idempotency_scope(entity_id: str, domain: str, service: str, key: str) -> str:
    """键作用域：``entity_id:domain:service:key``。

    同一个前端键可能在多个实体 / 服务上复用（批量场景），不带作用域会互相吞掉。
    """
    return f"{entity_id}:{domain}:{service}:{key}"


def _load_section(session, key: str, defaults: dict[str, Any]) -> dict[str, Any]:
    raw = load_raw_config(session)
    candidate = raw.get(key)
    section: dict[str, Any] = dict(candidate) if isinstance(candidate, dict) else {}
    return {**defaults, **section}


class CommandProxyService:
    """homeos 命令通道：ACL/去重/队列 + 唯一 HA 下发出口。

    ``/services/call``、``/ha/services/call`` 与 ``/modules/interaction3d/control``
    三条 HTTP 入口不各自实现下发逻辑，统一走 ``dispatch`` —— 校验（鉴权、服务白名单、
    实体授权）留在各入口，执行只此一处：幂等去重 → HA 未连接时拦截高风险 → 连接器下发。
    """

    def __init__(self, session_factory, connector) -> None:
        self._session_factory = session_factory
        self._connector = connector
        self._idempotency: dict[str, _IdempotencyEntry] = {}
        self._idempotency_pruned_at = 0.0
        self._command_proxy_cfg = DEFAULT_COMMAND_PROXY

    def _config(self) -> dict[str, Any]:
        try:
            with self._session_factory() as session:
                self._command_proxy_cfg = _load_section(session, "commandProxy", DEFAULT_COMMAND_PROXY)
        except Exception:
            self._command_proxy_cfg = DEFAULT_COMMAND_PROXY
        return self._command_proxy_cfg

    def _prune_idempotency(self, now: float) -> None:
        """按 TTL 惰性剪枝（替代 Nest 的 setInterval 定期清理）。"""
        if not self._idempotency:
            return
        request_ttl = float(max(int(self._config().get("idempotencyTtlMs") or 3000), 1))
        result_ttl = max(request_ttl, float(_IDEMPOTENCY_RESULT_TTL_MS))
        if len(self._idempotency) < _IDEMPOTENCY_MAX_ENTRIES and (
            now - self._idempotency_pruned_at < 1000.0
        ):
            return
        self._idempotency = {
            key: entry
            for key, entry in self._idempotency.items()
            if now - entry.created_at < (result_ttl if entry.state == "done" else request_ttl)
        }
        self._idempotency_pruned_at = now

    async def _begin_idempotency(
        self, key: str
    ) -> tuple[bool, _IdempotencyEntry | None]:
        """认领幂等键。

        返回 ``(True, None)`` 表示本次是首个请求；``(False, entry)`` 表示键命中的既有条目，
        调用方据 ``entry.state`` 决定「复用真实结果」还是「返回 pending」。
        """
        now = time.time() * 1000
        self._prune_idempotency(now)
        existing = self._idempotency.get(key)
        if existing is not None:
            return False, existing
        self._idempotency[key] = _IdempotencyEntry(state="inflight", created_at=now)
        return True, None

    def _finish_idempotency(self, key: str, result: dict[str, Any] | None) -> None:
        """下发结束：成功保留结果供重复键复用，失败立刻释放以便重试。"""
        entry = self._idempotency.get(key)
        if entry is None:
            return
        if result is None:
            self._idempotency.pop(key, None)
            return
        entry.state = "done"
        entry.result = result
        entry.created_at = time.time() * 1000

    async def call_service(self, dto: dict[str, Any]) -> dict[str, Any]:
        raw_key = dto.get("idempotency_key")
        idempotency_key = str(raw_key) if raw_key else ""
        domain = str(dto.get("domain") or "")
        service = str(dto.get("service") or "")
        entity_id = str(dto.get("entity_id") or "")
        scope = (
            _idempotency_scope(entity_id, domain, service, idempotency_key)
            if idempotency_key
            else ""
        )
        if scope:
            claimed, existing = await self._begin_idempotency(scope)
            if not claimed and existing is not None:
                if existing.state == "done" and existing.result is not None:
                    # 复用首次的真实结果：重试拿到的是「真做过什么」，不是一句成功。
                    logger.debug("幂等键命中，复用首次结果: %s", idempotency_key)
                    return {**existing.result, "replayed": True}
                # 首次请求还在下发中：如实返回 pending，让调用方稍后再查，而不是伪造成功。
                # success=False 是契约的一部分：这条命令没有执行完成，调用方不能按成功处理。
                logger.debug("幂等键命中，首次命令仍在下发: %s", idempotency_key)
                return {
                    "success": False,
                    "pending": True,
                    "message_id": f"idem-{idempotency_key}",
                    "timestamp": _iso_now(),
                    "queued": False,
                    "skipped": True,
                    "data": {"skipped": True, "reason": "idempotency_inflight"},
                }
        service_data = object_field(dto, "service_data")
        return_response = bool(dto.get("return_response"))
        try:
            status = await self._connector.get_status()
            if not status.get("connected") and is_dangerous_ha_control(domain, service, entity_id):
                raise BusinessException(
                    ErrorCode.SERVICE_UNAVAILABLE,
                    f"Home Assistant 未连接，已拦截高风险操作（{entity_id}）。请恢复 HA 连接后再试。",
                )
            if not status.get("connected"):
                # 门面没有离线队列：HA 未连接时调用会立刻失败（高风险命令已在上面拦截）。
                # 旧文案写「已入队，重连后自动发送」与行为不符，排障时会把「没下发」
                # 误判成「排队中」。
                logger.info("HA 未连接，尝试直接下发，可能失败：%s.%s → %s", domain, service, entity_id)

            data = await self._connector.call_service(
                domain, service, entity_id, service_data, return_response, idempotency_key or None
            )
            queued = bool(data.get("queued")) if isinstance(data, dict) and not isinstance(data, list) else False
            message_id = f"{int(time.time() * 1000)}-{_rand_suffix()}"
            logger.debug("[命令] %s.%s → %s | id: %s%s", domain, service, entity_id, message_id, " | queued" if queued else "")
            # 后置校验：HA 对「实体被跳过」也返回 200，只看状态码会把没执行当成功。
            # 这里把请求目标与响应里的实际状态比对，三态上报（true / false / null=未知）。
            verification = describe_service_verification(
                domain, service, entity_id, service_data, data
            )
            logger.debug(
                "[命令校验] entity=%s service=%s.%s supported=%s verified=%s reason=%s "
                "target=%s observed=%s respondedEntities=%s",
                entity_id,
                domain,
                service,
                verification["supported"],
                verification["verified"],
                verification["reason"],
                verification["target"],
                verification["observedState"],
                verification["respondedEntities"],
            )
            result = {
                "success": True,
                "message_id": message_id,
                "timestamp": _iso_now(),
                "queued": queued,
                "skipped": False,
                "verified": verification["verified"],
                "verification": verification,
                "data": data,
            }
            if scope:
                self._finish_idempotency(scope, result)
            return result
        except BusinessException:
            if scope:
                self._finish_idempotency(scope, None)
            raise
        except Exception as exc:
            if scope:
                self._finish_idempotency(scope, None)
            message = _format_service_call_error(exc)
            if message in ("HA not connected", "HA 未连接", "WebSocket 未连接"):
                raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, api_error("HA_NOT_CONNECTED")) from exc
            logger.error("[命令错误] %s.%s → %s 失败: %s", domain, service, entity_id, message)
            bad_request(api_error("PROXY_HA_SERVICE_FAILED", message))

    async def test_ha_connection(self, url: str, token: str) -> dict[str, Any]:
        return await self._connector.test_ha_connection(url, token)


def build_service_call_dto(
    *,
    domain: str,
    service: str,
    entity_id: str,
    service_data: dict[str, Any] | None = None,
    return_response: bool = False,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """构造命令通道 DTO（三条 HTTP 入口共用的规范化形状）。"""
    return {
        "domain": str(domain or ""),
        "service": str(service or ""),
        "entity_id": str(entity_id or ""),
        "service_data": dict(service_data or {}),
        "return_response": bool(return_response),
        "idempotency_key": idempotency_key,
    }


async def dispatch_service_call(proxy: Any, dto: dict[str, Any]) -> dict[str, Any]:
    """唯一 HA 下发出口：DTO → ``CommandProxyService.call_service``。"""
    return await proxy.call_service(dto)


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
