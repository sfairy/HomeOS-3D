"""命令代理服务（对齐 CommandProxyService 的核心行为）。

作为 HA 连接器的上层封装，保留：
- HA 未连接时拦截高风险操作（``is_dangerous_ha_control``）；
- 幂等键去重（进程内 Map + TTL 剪枝，失败释放）；
- 历史查询 / 连通性探测 / 媒体图像与流透传 / 断连队列查询与重试。
"""

from __future__ import annotations

import hashlib
import json
import logging
import random
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from .command_proxy_auth import is_dangerous_ha_control
from .verification import describe_service_verification
from ...platform.core.db.json_field import object_field
from ...platform.core.ha.service_payload_rules import (
    ServicePayloadRejected,
    validate_service_payload,
)
from ...platform.core.http.errors import BusinessException, ErrorCode, api_error, bad_request
from ...platform.core.runtime.app_config import load_raw_config

logger = logging.getLogger("homeos.command_proxy")

DEFAULT_COMMAND_PROXY = {"idempotencyTtlMs": 3000, "idempotencyCleanupIntervalMs": 60_000}

#: 幂等表条目上限（超过即按 TTL 剪枝，避免长期运行无界增长）。
_IDEMPOTENCY_MAX_ENTRIES = 512
#: 「已完成」结果的保留时长：网络重试往往在几秒后才到达，只记 3s 会重复执行。
_IDEMPOTENCY_RESULT_TTL_MS = 30_000
#: 「下发中」条目的最短保留时长。
#:
#: 必须明显大于慢服务超时（``SLOW_SERVICE_TIMEOUT = 115s``：AI 生成 / 语音提问 / 固件安装）。
#: 旧实现对 inflight 也套用 ``idempotencyTtlMs``（默认 3s），于是首次请求还在跑、条目已被
#: 剪枝，同键重试会重新认领并**再下发一次** —— 幂等键在最需要它的慢路径上完全失效。
_IDEMPOTENCY_INFLIGHT_TTL_MS = 180_000


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


def _idempotency_scope(
    entity_id: str,
    domain: str,
    service: str,
    key: str,
    service_data: dict[str, Any] | None = None,
) -> str:
    """键作用域：``entity_id:domain:service:<参数摘要>:key``。

    同一前端键可能在多个实体 / 服务上复用（批量场景），不带作用域会互相吞掉。

    参数摘要同样必须进作用域：调用方用**同一个** ``idempotency_key`` 连调两次
    ``climate.set_temperature``（只是温度不同）时，旧作用域会把第二次判定为重复，
    直接返回第一次的结果并标 ``replayed`` —— 命令根本没下发，界面却显示成功。
    """
    digest = ""
    if service_data:
        try:
            digest = hashlib.sha256(
                json.dumps(service_data, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
            ).hexdigest()[:16]
        except (TypeError, ValueError) as exc:
            # 参数无法序列化时退化为「不含摘要」：宁可多执行一次，也不要吞掉一次真实下发。
            logger.debug("幂等摘要生成失败，作用域退化为不含参数: %s", exc)
            digest = ""
    return f"{entity_id}:{domain}:{service}:{digest}:{key}"


def is_control_success(result: Any) -> bool:
    """控制类调用的**统一**成功判定。

    为什么不直接看 ``success``：``call_service`` 的 ``success`` 只表示「HA 收下了这条请求」，
    真正的结论在三态字段 ``verification.verified``：

    - ``True``  —— 目标实体确实变成了期望状态；
    - ``False``  —— HA 返回 200 但状态没变（实体 unavailable / 服务被忽略 / 状态不符）；
    - ``None``  —— 无法校验（无状态可比、异步设备等）。

    旧实现让每个消费方各自解释：家庭模式专门判 ``verified``，管家与计划任务只看
    ``success`` —— 于是灯在 ``unavailable`` 时助手照样回答「已打开」、计划任务记
    ``status=success`` 且不发失败通知。判定必须只有一份。
    """
    if not isinstance(result, dict):
        return False
    if result.get("success") is not True:
        return False
    verification = result.get("verification")
    if isinstance(verification, dict) and verification.get("verified") is False:
        return False
    # 子字段可能被单独透传（部分工具只回 verified）
    return result.get("verified") is not False


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
        # inflight 条目不能按请求 TTL 剪枝：慢服务（AI 生成 / 固件安装）要跑上百秒，
        # 期间条目一旦被剪掉，同键重试会被当成首次请求再下发一次。
        inflight_ttl = max(request_ttl, float(_IDEMPOTENCY_INFLIGHT_TTL_MS))
        if len(self._idempotency) < _IDEMPOTENCY_MAX_ENTRIES and (now - self._idempotency_pruned_at < 1000.0):
            return
        self._idempotency = {
            key: entry
            for key, entry in self._idempotency.items()
            if now - entry.created_at < (result_ttl if entry.state == "done" else inflight_ttl)
        }
        self._idempotency_pruned_at = now

    async def _begin_idempotency(self, key: str) -> tuple[bool, _IdempotencyEntry | None]:
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

    @staticmethod
    def _assert_service_policy(dto: dict[str, Any], policy: str | None) -> None:
        """准入闸门：白名单判据只有一份（``service_payload_rules``）。

        ``policy=None`` 表示调用方已在同一请求内校验过（且需要放行更宽字段集的内部路径），
        这里直接放行；分支放在闸门内部，让唯一下发出口保持「无参数即最严」。
        """
        if policy is None:
            return
        try:
            validate_service_payload(
                dto.get("domain"),
                dto.get("service"),
                object_field(dto, "service_data"),
                dto.get("entity_id") or "",
                policy=policy,
            )
        except ServicePayloadRejected as rejected:
            code = ErrorCode.FORBIDDEN if rejected.status_code == 403 else ErrorCode.VALIDATION_FAILED
            raise BusinessException(code, rejected.detail) from rejected

    async def call_service(self, dto: dict[str, Any], *, policy: str | None = "http") -> dict[str, Any]:
        """唯一下发出口。

        ``policy`` 是准入策略，默认 ``"http"``（服务白名单 + 字段白名单 + 域匹配）：
        **新增一条下发通道时不需要记得加校验** —— 忘传参数即按最严格的口径校验。
        已在上游用 ``agent_service_allowed`` + ``sanitize_service_data`` 校验过的
        管家 / 语音通道显式传 ``policy="agent"``（只复检服务键，字段口径由上游负责）。
        ``policy=None`` 仅供已在同一请求内校验过、且需要放行更宽字段集的内部路径使用。
        """
        self._assert_service_policy(dto, policy)
        raw_key = dto.get("idempotency_key")
        idempotency_key = str(raw_key) if raw_key else ""
        domain = str(dto.get("domain") or "")
        service = str(dto.get("service") or "")
        entity_id = str(dto.get("entity_id") or "")
        scope = (
            _idempotency_scope(
                entity_id,
                domain,
                service,
                idempotency_key,
                object_field(dto, "service_data"),
            )
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
            logger.debug(
                "[命令] %s.%s → %s | id: %s%s", domain, service, entity_id, message_id, " | queued" if queued else ""
            )
            # 后置校验：HA 对「实体被跳过」也返回 200，只看状态码会把没执行当成功。
            # 这里把请求目标与响应里的实际状态比对，三态上报（true / false / null=未知）。
            verification = describe_service_verification(domain, service, entity_id, service_data, data)
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
                # success=HA 已受理；controlSuccess=设备侧是否真正到位（与 is_control_success 同口径）
                "controlSuccess": verification["verified"] is not False,
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
