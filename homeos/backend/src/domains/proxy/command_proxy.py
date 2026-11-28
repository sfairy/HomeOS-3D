"""命令代理服务（对齐 CommandProxyService 的核心行为）。

作为 HA 连接器的上层封装，保留：
- HA 未连接时拦截高风险操作（``is_dangerous_ha_control``）；
- 幂等键去重（进程内 Map + TTL 剪枝，失败释放）；
- 统一的控制结果归一（``build_control_result``：``ok`` / ``pending`` / ``skipped`` / ``verified``）。
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import random
import time
from collections import OrderedDict
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from .command_proxy_auth import is_dangerous_ha_control
from .verification import describe_service_verification
from ..license import features as feature_codes
from ...platform.core.db.json_field import object_field
from ...platform.core.ha.service_payload_rules import (
    ServicePayloadRejected,
    validate_service_payload,
)
from ...platform.core.http.errors import BusinessException, ErrorCode, api_error
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
#: 按实体串行锁的数量上限（LRU 淘汰空闲锁，避免大户型把锁表撑大）。
_ENTITY_LOCK_MAX_ENTRIES = 512

#: 离线待下发队列：条目上限 / 有效期 / 可安全重放的域。
#:
#: 只收「幂等且用户意图明确」的控制命令：灯、开关、风扇、窗帘、空调模式、媒体暂停。
#: 同一实体反复操作只保留**最后一条意图**（「开→关→开」最终就是开），所以队列长度
#: 与设备数同阶而不是与点击次数同阶。
_OFFLINE_MAX_ENTRIES = 200
_OFFLINE_TTL_SECONDS = 600.0
_OFFLINE_REPLAY_DOMAINS = frozenset({"light", "switch", "fan", "cover", "climate", "media_player", "humidifier"})
#: 即使域在可重放名单里，这些 service 也不排队（非幂等 / 有一次性副作用）。
_OFFLINE_REPLAY_EXCLUDED_SERVICES = frozenset(
    {"toggle", "media_next_track", "media_previous_track", "play_media", "set_playlist"}
)


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

    def __init__(
        self,
        session_factory,
        connector,
        license_service: Any = None,
        event_bus: Any = None,
    ) -> None:
        self._session_factory = session_factory
        self._connector = connector
        #: 事件总线（可选）：离线队列丢命令时要发 ``automation.dropped``，否则用户
        #: 按下的「关灯」会**无声消失** —— 界面显示成功，灯一直亮着。
        self._event_bus = event_bus
        #: 授权服务（可选）：唯一出口自己校验 ``ha.control``，不依赖各入口是否记得加门禁。
        self._license_service = license_service
        self._idempotency: dict[str, _IdempotencyEntry] = {}
        self._idempotency_pruned_at = 0.0
        #: 幂等请求 TTL 的内存副本：启动时用默认值，之后由 ``refresh_idempotency_ttl``
        #: 在线程池里从配置刷新（剪枝路径绝不读库）。
        self._idempotency_ttl_cache = float(DEFAULT_COMMAND_PROXY["idempotencyTtlMs"])
        self._idempotency_ttl_refreshed_at = 0.0
        self._command_proxy_cfg = DEFAULT_COMMAND_PROXY
        #: 按实体的串行锁（LRU 上限，见 ``_entity_lock``）。
        self._entity_locks: OrderedDict[str, asyncio.Lock] = OrderedDict()
        #: 离线待下发队列：``entityId → (入队时刻, dto)``；同一实体只留最后一条意图。
        self._offline_queue: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()

    def attach_event_bus(self, event_bus: Any) -> None:
        """延迟注入事件总线：总线在命令代理之后装配（见 ``bootstrap/lifespan``）。"""
        self._event_bus = event_bus

    async def _preflight_offline(
        self,
        dto: dict[str, Any],
        status: dict[str, Any],
        domain: str,
        service: str,
        entity_id: str,
        scope: str,
    ) -> dict[str, Any] | None:
        """下发的第一道判据：连上了就返回 ``None``（照常下发）。

        未连接时：高风险命令直接拒绝（门锁 / 阀门 / 警报不能被排队延后执行），
        幂等控制命令进待下发队列，其余按原路径尝试。
        """
        if status.get("connected"):
            return None
        if is_dangerous_ha_control(domain, service, entity_id):
            raise BusinessException(
                ErrorCode.SERVICE_UNAVAILABLE,
                f"Home Assistant 未连接，已拦截高风险操作（{entity_id}）。请恢复 HA 连接后再试。",
            )
        return self._queue_when_disconnected(dto, domain, service, entity_id, scope)

    def _queue_when_disconnected(
        self,
        dto: dict[str, Any],
        domain: str,
        service: str,
        entity_id: str,
        scope: str,
    ) -> dict[str, Any] | None:
        """HA 未连接时把可重放的幂等命令记成「待下发」。

        返回 ``None`` 表示不适用（不可重放 / 非幂等），调用方按原路径继续尝试下发 ——
        高风险命令（lock/unlock）已在上游拦截，这里不做二次判断。

        为什么值得排队：HA 重启 / 断网通常只有几十秒，期间点灯直接失败会让用户以为
        面板坏了，连点又产生一串失败请求。队列按实体去重，长度与设备数同阶。
        """
        if not self._enqueue_offline(dto, domain, service, entity_id):
            logger.info("HA 未连接，尝试直接下发，可能失败：%s.%s → %s", domain, service, entity_id)
            return None
        result = _offline_queued_result(f"{int(time.time() * 1000)}-{_rand_suffix()}", entity_id)
        if scope:
            self._finish_idempotency(scope, result)
        return result

    def _enqueue_offline(self, dto: dict[str, Any], domain: str, service: str, entity_id: str) -> bool:
        """把一条幂等控制命令记成「待下发」；不适用时返回 ``False``（调用方按原路径失败）。"""
        if not entity_id or domain not in _OFFLINE_REPLAY_DOMAINS:
            return False
        if service in _OFFLINE_REPLAY_EXCLUDED_SERVICES:
            return False
        now = time.monotonic()
        # 惰性过期：队列很小，每次入队顺手清一遍，不需要单独定时器。
        stale = [
            key for key, (queued_at, _dto) in self._offline_queue.items() if now - queued_at > _OFFLINE_TTL_SECONDS
        ]
        for key in stale:
            dropped = self._offline_queue.pop(key, None)
            if dropped is not None:
                self._emit_dropped(key, dropped[1], "expired")
        # 同一实体只保留最后一条意图（「开→关→开」补发开即可）。
        self._offline_queue.pop(entity_id, None)
        self._offline_queue[entity_id] = (now, dict(dto))
        while len(self._offline_queue) > _OFFLINE_MAX_ENTRIES:
            key, entry = self._offline_queue.popitem(last=False)
            self._emit_dropped(key, entry[1], "overflow")
        logger.info(
            "HA 未连接，命令已入待下发队列：%s.%s → %s（队列 %s）", domain, service, entity_id, len(self._offline_queue)
        )
        return True

    def _emit_dropped(self, entity_id: str, dto: dict[str, Any], reason: str) -> None:
        """离线队列丢命令时告知用户（``expired`` / ``overflow`` / ``rejected``）。

        静默丢弃是这里最坏的失败模式：用户在面板上看到「已关闭」，实际命令从未下发，
        而设备会一直保持原状态直到下一次有人操作。
        """
        if self._event_bus is None:
            return
        self._event_bus.emit_soon(
            "automation.dropped",
            {
                "entityId": entity_id,
                "domain": dto.get("domain"),
                "service": dto.get("service"),
                "reason": reason,
            },
        )

    async def replay_offline(self) -> int:
        """HA 重连后按入队顺序补发待下发命令，返回成功条数。

        只在下发成功（或 HA 明确拒绝该实体）时出队；连接再次中断就停下，把剩余条目
        留给下一次重连 —— 否则一次失败会把整队意图丢掉。
        """
        if not self._offline_queue:
            return 0
        entries = list(self._offline_queue.items())
        replayed = 0
        now = time.monotonic()
        for entity_id, (queued_at, dto) in entries:
            if now - queued_at > _OFFLINE_TTL_SECONDS:
                self._offline_queue.pop(entity_id, None)
                continue
            try:
                await self.call_service(dict(dto), policy="agent")
            except BusinessException as exc:
                if exc.error_code is ErrorCode.SERVICE_UNAVAILABLE:
                    # HA 又断了：停止本轮，剩余条目等下次重连。
                    logger.info("补发中断（HA 再次不可用），剩余 %s 条待下发", len(self._offline_queue))
                    break
                logger.warning("补发被拒，丢弃该条：%s → %s（%s）", dto.get("domain"), entity_id, exc.message)
                self._offline_queue.pop(entity_id, None)
                self._emit_dropped(entity_id, dto, "rejected")
                continue
            except Exception:
                logger.warning("补发失败，丢弃该条：%s", entity_id, exc_info=True)
                self._offline_queue.pop(entity_id, None)
                continue
            self._offline_queue.pop(entity_id, None)
            replayed += 1
        if replayed:
            logger.info("HA 重连后补发 %s 条待下发命令", replayed)
        return replayed

    def offline_pending_count(self) -> int:
        """当前待下发条数（诊断页 / 测试用）。"""
        return len(self._offline_queue)

    async def _assert_ha_control_allowed(self) -> None:
        """唯一出口的授权自检：``ha.control`` 不通过时任何通道都不能下发。

        各 HTTP 入口仍保留自己的快速失败（错误形状不同），这里是最后一道闸门：
        管家 / 语音 / MCP / 3D 控制面板最终都走 ``call_service``，入口漏挂能力码
        也不会越权控制设备。
        """
        service = self._license_service
        if service is None:
            return
        try:
            allowed = await asyncio.to_thread(service.allows, feature_codes.FEATURE_HA_CONTROL)
            if not allowed:
                # 租约刚过期（宽限窗口内）：设备控制是「本机中控」的核心用途，继续放行；
                # 超出窗口或关闭开关时 ``expired_grace_active`` 恒 False，行为回到全量拦截。
                allowed = await asyncio.to_thread(service.expired_grace_active)
        except Exception:
            # 校验本身炸掉时按「不允许」处理：宁可拒绝一次控制，也不静默放行。
            logger.warning("授权校验失败，按「不允许控制」处理", exc_info=True)
            allowed = False
        if not allowed:
            raise BusinessException(ErrorCode.FORBIDDEN, "当前授权不允许控制 Home Assistant。")

    def _config(self) -> dict[str, Any]:
        try:
            with self._session_factory() as session:
                self._command_proxy_cfg = _load_section(session, "commandProxy", DEFAULT_COMMAND_PROXY)
        except Exception:
            logger.debug("_config 忽略异常", exc_info=True)
            self._command_proxy_cfg = DEFAULT_COMMAND_PROXY
        return self._command_proxy_cfg

    def _idempotency_ttl_ms(self) -> float:
        """幂等请求 TTL（毫秒）——**只读内存**。

        剪枝跑在 ``call_service`` 的异步热路径上；旧实现每个请求（至少每 1 秒一次）
        在这里开一次同步 SQLite 会话读配置，等于把一次连接池 checkout 塞进事件循环，
        期间所有 HA 状态写入与 WS 广播都排队。TTL 从 3s 变成 5s 并不影响正确性，
        因此改用启动时读一次、之后由异步路径按需刷新。
        """
        return self._idempotency_ttl_cache

    async def refresh_idempotency_ttl(self) -> None:
        """从配置刷新幂等 TTL（在**线程池**里读库，绝不占事件循环）。"""
        try:
            cfg = await asyncio.to_thread(self._config)
        except Exception:
            logger.debug("刷新幂等 TTL 失败，沿用旧值", exc_info=True)
            return
        try:
            self._idempotency_ttl_cache = float(max(int(cfg.get("idempotencyTtlMs") or 3000), 1))
        except (TypeError, ValueError):  # fmt: skip
            logger.debug("idempotencyTtlMs 非法，沿用旧值: %r", cfg.get("idempotencyTtlMs"))

    def _prune_idempotency(self, now: float) -> None:
        """按 TTL 惰性剪枝（替代 Nest 的 setInterval 定期清理）。"""
        if not self._idempotency:
            return
        # 纯内存判定：这里不读配置、不开数据库会话（见 ``_idempotency_ttl_ms``）。
        if len(self._idempotency) < _IDEMPOTENCY_MAX_ENTRIES and (now - self._idempotency_pruned_at < 1000.0):
            return
        request_ttl = self._idempotency_ttl_ms()
        result_ttl = max(request_ttl, float(_IDEMPOTENCY_RESULT_TTL_MS))
        # inflight 条目不能按请求 TTL 剪枝：慢服务（AI 生成 / 固件安装）要跑上百秒，
        # 期间条目一旦被剪掉，同键重试会被当成首次请求再下发一次。
        inflight_ttl = max(request_ttl, float(_IDEMPOTENCY_INFLIGHT_TTL_MS))
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

    async def _call_connector_serialized(
        self,
        domain: str,
        service: str,
        entity_id: str,
        service_data: dict[str, Any],
        return_response: bool,
        idempotency_key: str | None,
    ) -> Any:
        """按实体串行下发。

        同一实体的两条命令并发下发时，最终状态取决于**网络返回顺序**，而多条命令可能
        在 HA 侧交错执行（例如「开窗帘 30%」和「关窗帘」几乎同时到达）。按实体排队后，
        用户连点两次的结果等于「后一次生效」，与界面上的乐观更新一致。

        不同实体仍然并发：批量开灯不能被一个慢设备拖住。
        """
        if not entity_id:
            return await self._connector.call_service(
                domain, service, entity_id, service_data, return_response, idempotency_key
            )
        lock = self._entity_lock(entity_id)
        async with lock:
            return await self._connector.call_service(
                domain, service, entity_id, service_data, return_response, idempotency_key
            )

    def _entity_lock(self, entity_id: str) -> asyncio.Lock:
        """取（或建）该实体的串行锁；超出上限时淘汰最久未用的空闲锁。"""
        lock = self._entity_locks.get(entity_id)
        if lock is not None:
            self._entity_locks.move_to_end(entity_id)
            return lock
        if len(self._entity_locks) >= _ENTITY_LOCK_MAX_ENTRIES:
            for key in list(self._entity_locks):
                candidate = self._entity_locks[key]
                if not candidate.locked():
                    del self._entity_locks[key]
                    break
        lock = asyncio.Lock()
        self._entity_locks[entity_id] = lock
        return lock

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
        await self._assert_ha_control_allowed()
        # 幂等 TTL 每 60s 从配置刷新一次（线程池读库，不占事件循环）。
        if time.monotonic() - self._idempotency_ttl_refreshed_at > 60.0:
            self._idempotency_ttl_refreshed_at = time.monotonic()
            await self.refresh_idempotency_ttl()
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
                # 注意：``skipped`` 必须为 False。pending 的语义是「首次请求还在下发」，
                # 这条命令并没有被跳过。早期这里填 True，前端（与批量执行器）据
                # ``skipped`` 回滚乐观态，于是「连点两次」会先恢复再跳变。
                return {
                    "success": False,
                    "pending": True,
                    "message_id": f"idem-{idempotency_key}",
                    "timestamp": _iso_now(),
                    "queued": False,
                    "skipped": False,
                    "data": {"skipped": False, "reason": "idempotency_inflight"},
                }
        service_data = object_field(dto, "service_data")
        return_response = bool(dto.get("return_response"))
        try:
            status = await self._connector.get_status()
            queued_result = await self._preflight_offline(dto, status, domain, service, entity_id, scope)
            if queued_result is not None:
                return queued_result

            data = await self._call_connector_serialized(
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
            # 上游（HA / 连接器）失败统一按「外部依赖错误」→ 502。以前这里抛
            # VALIDATION_FAILED（400），同一个失败在 ``/ha/services/call`` 是 502：
            # 客户端按 4xx 判定「参数写错了」，实际是设备侧/网关问题。
            raise BusinessException(ErrorCode.EXTERNAL_ERROR, api_error("PROXY_HA_SERVICE_FAILED", message)) from exc

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


def build_control_result(envelope: Any) -> dict[str, Any]:
    """把命令通道信封归一成**三条入口共用**的控制响应。

    成功语义只有一个来源，避免「同一个 DTO 换个入口就换一种成功」：

    - ``success``：HA 是否受理（历史字段，保持不变）；
    - ``ok``：调用方**可以按成功展示**的严格判据 —— 已受理、非 pending、非 skipped、
      且后置校验没有明确判定不一致（``verified is not False``）；
    - ``pending`` / ``skipped`` / ``verified`` / ``queued`` 原样透传，供 UI 分别处理。

    以前 ``ok`` 是各入口自己拍的（``/ha/services/call`` 恒为 ``True``），结果
    「幂等键命中仍在下发」被当成成功，前端据此不再重试。
    """
    if not isinstance(envelope, dict):
        return {"ok": False, "success": False, "data": envelope}
    pending = bool(envelope.get("pending"))
    skipped = bool(envelope.get("skipped"))
    verified = envelope.get("verified")
    accepted = bool(envelope.get("success"))
    return {
        **envelope,
        "ok": accepted and not pending and not skipped and verified is not False,
        "pending": pending,
        "skipped": skipped,
    }


def _format_service_call_error(error: Exception) -> str:
    message = str(error or "").strip()
    if message:
        return message
    name = error.__class__.__name__
    return name if name != "Exception" else "未知错误"


def _offline_queued_result(message_id: str, entity_id: str) -> dict[str, Any]:
    """HA 未连接、命令已入待下发队列时的响应。

    ``queued=True`` + ``pending=True``：前端据此显示「已排队，重连后下发」，
    与 ``build_control_result`` 的 ``ok`` 判据（pending 不算成功）保持一致。
    """
    return {
        "success": True,
        "message_id": message_id,
        "timestamp": _iso_now(),
        "queued": True,
        "pending": True,
        "skipped": False,
        "verified": None,
        "controlSuccess": False,
        "data": {
            "queued": True,
            "pending": True,
            "reason": "ha_disconnected_queued",
            "entityId": entity_id,
        },
    }


def _iso_now() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def _rand_suffix() -> str:
    alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
    return "".join(random.choice(alphabet) for _ in range(8))
