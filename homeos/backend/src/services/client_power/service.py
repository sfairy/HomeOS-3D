"""客户端系统信息与充电器开关滞回联动服务（对齐 ``client-power/service.ts``）。

职责：
 - 接收客户端上报系统信息（含电量），归一化后落内存态并周期持久化到 RuntimeKv；
 - 通过 reportToken 实现配对鉴权：未配对终端仅入待配对列表，已配对校验 token 后才允许联动；
 - 电量低于低阈值 / 达到高阈值时，调用 HaConnector 执行开关滞回联动；
 - 维护在线状态、待配对记录的发现 / 清除，并发布电量事件供通知模块消费。
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import inspect
import logging
from datetime import UTC, datetime
from typing import Any

from .linkage import evaluate_self_charge_actions
from .normalize import normalize_client_system_report
from .types import (
    CLIENT_POWER_RUNTIME_CONFIG_ID,
    DEFAULT_CLIENT_POWER_SELF_CHARGE,
    ClientPowerConfig,
    ClientSystemState,
    PendingClientState,
    SwitchLinkageAction,
)
from ..app_config.pricing import is_peak_time
from ..app_config.service import APP_CONFIG_UPDATED
from ..security.layout import schedule_security_event
from ...core.runtime_kv import load_runtime_kv, persist_runtime_kv

logger = logging.getLogger("homeos.client_power")

#: 周期持久化间隔（秒），对齐 Nest 15s
PERSIST_INTERVAL_SECONDS = 15
#: 周期刷新在线标志间隔（秒），对齐 Nest 30s
STALE_CHECK_INTERVAL_SECONDS = 30
#: 待配对记录最大条数（防异常/恶意客户端持续上报随机 clientId 导致内存无限增长）
MAX_PENDING = 100
#: 待配对记录最长保留时间（毫秒）
PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000

#: 事件名常量（对齐 HOMEOS_EVENTS）
CLIENT_POWER_REPORTED = "clientPower.reported"
CLIENT_POWER_LOW = "clientPower.low"
CLIENT_POWER_CHARGED = "clientPower.charged"
CLIENT_POWER_LINKAGE_FAILED = "clientPower.linkageFailed"


def _iso_now() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def _parse_iso_ms(value: Any) -> float:
    """解析 ISO 时间字符串为毫秒时间戳；非法返回 NaN 等价的 ``-1``。"""
    if not isinstance(value, str) or not value:
        return -1.0
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return -1.0
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.timestamp() * 1000


class ClientPowerService:
    """客户端系统信息服务。"""

    def __init__(
        self,
        app_config: Any,
        session_factory: Any,
        ha_connector: Any,
        event_bus: Any,
        cooldown_service: Any,
        jobs: Any = None,
    ) -> None:
        self._app_config = app_config
        self._session_factory = session_factory
        self._ha = ha_connector
        self._bus = event_bus
        self._cooldown = cooldown_service
        self._jobs = jobs
        #: clientId → 最新上报状态
        self._states: dict[str, ClientSystemState] = {}
        #: clientId → 待配对发现记录
        self._pending: dict[str, PendingClientState] = {}
        #: 内存态是否已变更，下一轮 flush 时需写库
        self._dirty = False
        #: 本实例已清除的运行时 id（flush 时从 KV merge 结果删除，避免重启复活）
        self._purged_runtime_ids: set[str] = set()
        self._persist_task: asyncio.Task[None] | None = None
        self._stale_task: asyncio.Task[None] | None = None

    # ------------------------------------------------------------------ #
    # 生命周期
    # ------------------------------------------------------------------ #
    async def start(self) -> None:
        """加载持久化状态、对账待配对、刷新在线标志并启动周期任务。"""
        if self._bus is not None:
            self._bus.on(APP_CONFIG_UPDATED, self.on_config_updated)
            self._bus.on(CLIENT_POWER_REPORTED, self.handle_reported_event)
        await self._load_persisted_runtime()
        self._reconcile_pending_with_config()
        self._refresh_online_flags()
        self._persist_task = asyncio.create_task(self._persist_loop(), name="client-power-persist")
        self._stale_task = asyncio.create_task(self._stale_loop(), name="client-power-online")
        logger.info("客户端系统信息服务已启动")

    async def stop(self) -> None:
        """停止定时任务并同步最后一次状态到数据库。"""
        for task in (self._persist_task, self._stale_task):
            if task is not None and not task.done():
                task.cancel()
        self._persist_task = None
        self._stale_task = None
        await self.flush_persisted_runtime()

    async def _persist_loop(self) -> None:
        while True:
            await asyncio.sleep(PERSIST_INTERVAL_SECONDS)
            await self._run_job(
                "client-power-persist",
                {"description": "客户端电量状态落库", "intervalMs": 15_000},
                self.flush_persisted_runtime,
            )

    async def _stale_loop(self) -> None:
        while True:
            await asyncio.sleep(STALE_CHECK_INTERVAL_SECONDS)
            await self._run_job(
                "client-power-online",
                {"description": "客户端在线状态刷新", "intervalMs": 30_000},
                self._refresh_online_flags,
            )

    async def _run_job(self, name: str, options: dict[str, Any], fn: Any) -> None:
        if self._jobs is None:
            try:
                result = fn()
                if inspect.isawaitable(result):
                    await result
            except Exception as exc:
                logger.warning("客户端电量作业失败 [%s]: %s", name, exc)
            return
        try:
            await self._jobs.run(name, options, fn)
        except Exception as exc:
            logger.warning("客户端电量作业失败 [%s]: %s", name, exc)

    # ------------------------------------------------------------------ #
    # 配置
    # ------------------------------------------------------------------ #
    def cfg(self) -> ClientPowerConfig:
        raw = self._app_config.get("clientPower")
        raw = raw if isinstance(raw, dict) else {}
        clients = raw.get("clients") if isinstance(raw.get("clients"), list) else []
        return ClientPowerConfig(
            enabled=raw.get("enabled") is True,
            report_interval_sec=int(raw.get("reportIntervalSec") or 10),
            stale_timeout_sec=int(raw.get("staleTimeoutSec") or 300),
            cooldown_min=float(raw.get("cooldownMin") or 5),
            linkage_retry_count=int(raw.get("linkageRetryCount") or 0),
            linkage_retry_delay_ms=int(raw.get("linkageRetryDelayMs") or 0),
            clients=[c for c in clients if isinstance(c, dict)],
        )

    def _find_client_config(self, client_id: str) -> dict[str, Any] | None:
        for client in self.cfg().clients:
            if client.get("id") == client_id:
                return client
        return None

    def _is_configured(self, client_id: str) -> bool:
        return self._find_client_config(client_id) is not None

    def on_config_updated(self, sections: Any) -> None:
        """监听 ``app.config.updated``：clientPower 更新后重新对账待配对列表。"""
        keys = sections if isinstance(sections, list) else []
        if "clientPower" in keys:
            self._reconcile_pending_with_config()

    # ------------------------------------------------------------------ #
    # reportToken 鉴权
    # ------------------------------------------------------------------ #
    @staticmethod
    def _tokens_match(expected: str, provided: str) -> bool:
        """常量时间比较两个 token，避免时序侧信道泄露。"""
        left, right = expected.encode("utf-8"), provided.encode("utf-8")
        if len(left) != len(right):
            return False
        return hmac.compare_digest(left, right)

    @staticmethod
    def _hash_token(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def _resolve_report_auth(
        self,
        client_id: str,
        report_token: Any,
        client_cfg: dict[str, Any] | None,
        prev: ClientSystemState | None,
    ) -> dict[str, Any]:
        """校验终端上报密钥；仅在 token 已轮换或首次配对时下发 expected。"""
        if not client_cfg:
            return {"linkageAllowed": False}

        expected = str(client_cfg.get("reportToken") or "").strip()
        if not expected:
            return {"linkageAllowed": False}

        provided = str(report_token or "").strip()
        if provided and self._tokens_match(expected, provided):
            return {"linkageAllowed": True}

        # provided 不匹配时：若 prev 哈希仍等于当前 expected，说明 token 未轮换 →
        # 视为非法请求，不重发（防攻击者用错误 token 探测）；否则重发供合法终端重新配对。
        expected_hash = self._hash_token(expected)
        if prev is not None and prev.report_token_hash and prev.report_token_hash == expected_hash:
            return {"linkageAllowed": False}

        return {"linkageAllowed": False, "deliverToken": expected}

    # ------------------------------------------------------------------ #
    # 上报处理
    # ------------------------------------------------------------------ #
    async def report(self, dto: dict[str, Any]) -> dict[str, Any]:
        """处理客户端系统信息上报。"""
        client_id = str((dto or {}).get("clientId") or "").strip()
        if not client_id:
            return {"accepted": False, "configured": False}

        normalized = normalize_client_system_report(dto)
        now = _iso_now()
        system_info = normalized["systemInfo"]
        level = normalized["level"]
        charging = normalized["charging"]
        charging_time = normalized["chargingTime"]
        discharging_time = normalized["dischargingTime"]
        battery_supported = normalized["batterySupported"]

        client_cfg = self._find_client_config(client_id)
        configured = client_cfg is not None

        if not configured:
            existing_pending = self._pending.get(client_id)
            self._pending[client_id] = PendingClientState(
                client_id=client_id,
                system_info=system_info,
                first_seen_at=existing_pending.first_seen_at if existing_pending else now,
                last_report_at=now,
            )
            self._prune_pending()
        else:
            self._pending.pop(client_id, None)

        prev = self._states.get(client_id)
        auth = self._resolve_report_auth(client_id, dto.get("reportToken"), client_cfg, prev)
        expected_token = str(client_cfg.get("reportToken") or "").strip() if client_cfg else ""
        state = ClientSystemState(
            client_id=client_id,
            system_info=system_info,
            level=level,
            charging=charging,
            charging_time=charging_time,
            discharging_time=discharging_time,
            battery_supported=battery_supported,
            last_report_at=now,
            online=True,
            label=client_cfg.get("label") if client_cfg else None,
            pending=not configured,
            report_token_acknowledged=bool(auth.get("linkageAllowed")),
            report_token_hash=(
                self._hash_token(expected_token)
                if auth.get("linkageAllowed") and expected_token
                else (prev.report_token_hash if prev else None)
            ),
        )
        self._states[client_id] = state
        self._dirty = True

        await self._emit(
            CLIENT_POWER_REPORTED,
            {
                "clientId": client_id,
                "level": level,
                "charging": charging,
                "chargingTime": charging_time,
                "dischargingTime": discharging_time,
                "batterySupported": battery_supported,
                "configured": configured,
                "systemInfo": system_info,
                "label": client_cfg.get("label") if client_cfg else None,
                "lastReportAt": now,
                "reportTokenAcknowledged": bool(auth.get("linkageAllowed")),
                "reportTokenHash": state.report_token_hash,
            },
        )

        # 仅在电量跨过阈值时触发低电量 / 充满事件，避免重复告警
        if level is not None:
            self_charge = client_cfg.get("selfCharge") if client_cfg else None
            self_charge = self_charge if isinstance(self_charge, dict) else {}
            low_threshold = float(
                self_charge.get("lowPercent") or DEFAULT_CLIENT_POWER_SELF_CHARGE["lowPercent"]
            )
            high_threshold = float(
                self_charge.get("highPercent") or DEFAULT_CLIENT_POWER_SELF_CHARGE["highPercent"]
            )
            if prev is not None and prev.level is not None and prev.level >= low_threshold and level < low_threshold:
                await self._emit(CLIENT_POWER_LOW, {"clientId": client_id, "level": level})
            elif prev is None and level < low_threshold and configured and auth.get("linkageAllowed"):
                # 首次上报即低于低阈值：仅对已配对（token 确认）终端触发一次
                await self._emit(CLIENT_POWER_LOW, {"clientId": client_id, "level": level})
            if (
                prev is not None
                and prev.level is not None
                and prev.level < high_threshold
                and level >= high_threshold
            ):
                await self._emit(CLIENT_POWER_CHARGED, {"clientId": client_id, "level": level})

        if self.cfg().enabled and auth.get("linkageAllowed"):
            await self._evaluate_and_execute(state)

        result: dict[str, Any] = {"accepted": True, "configured": configured}
        if auth.get("deliverToken"):
            result["deliverToken"] = auth["deliverToken"]
        return result

    async def _emit(self, name: str, payload: dict[str, Any]) -> None:
        if self._bus is None:
            return
        try:
            await self._bus.emit(name, payload)
        except Exception as exc:
            logger.debug("广播事件失败 [%s]: %s", name, exc)

    # ------------------------------------------------------------------ #
    # 跨实例同步
    # ------------------------------------------------------------------ #
    async def handle_reported_event(self, payload: dict[str, Any] | None) -> None:
        """跨实例同步客户端上报状态（幂等 + 防旧事件覆盖）。"""
        if not isinstance(payload, dict):
            return
        client_id = str(payload.get("clientId") or "").strip()
        if not client_id:
            return

        existing = self._states.get(client_id)
        last_report_at = payload.get("lastReportAt") or _iso_now()
        # 幂等 + 防旧事件覆盖：本地已有 >= 该时间戳的状态则跳过
        if existing is not None and existing.last_report_at >= last_report_at:
            return

        if payload.get("configured"):
            self._pending.pop(client_id, None)
        else:
            existing_pending = self._pending.get(client_id)
            self._pending[client_id] = PendingClientState(
                client_id=client_id,
                system_info=payload.get("systemInfo"),
                first_seen_at=existing_pending.first_seen_at if existing_pending else last_report_at,
                last_report_at=last_report_at,
            )
            self._prune_pending()

        self._states[client_id] = ClientSystemState(
            client_id=client_id,
            system_info=payload.get("systemInfo"),
            level=payload.get("level"),
            charging=payload.get("charging"),
            charging_time=payload.get("chargingTime"),
            discharging_time=payload.get("dischargingTime"),
            battery_supported=bool(payload.get("batterySupported")),
            last_report_at=last_report_at,
            online=True,
            label=payload.get("label"),
            pending=not payload.get("configured"),
            report_token_acknowledged=bool(payload.get("reportTokenAcknowledged")),
            report_token_hash=payload.get("reportTokenHash"),
        )
        self._dirty = True

    # ------------------------------------------------------------------ #
    # 状态查询
    # ------------------------------------------------------------------ #
    def get_status_snapshot(self) -> dict[str, Any]:
        """返回所有客户端状态快照与待配对列表，供前端状态面板渲染。"""
        cfg = self.cfg()
        stale_ms = cfg.stale_timeout_sec * 1000
        now = _now_ms()
        pending = self._collect_pending_clients()
        clients = []
        for state in self._states.values():
            snapshot = state.to_public()
            last_ms = _parse_iso_ms(state.last_report_at)
            snapshot["online"] = last_ms >= 0 and (now - last_ms) <= stale_ms
            clients.append(snapshot)
        configured_clients = [
            {k: v for k, v in client.items() if k != "reportToken"} for client in cfg.clients
        ]
        return {
            "enabled": cfg.enabled,
            "clients": clients,
            "pending": pending,
            "configuredClients": configured_clients,
        }

    def get_pending_clients(self) -> list[dict[str, Any]]:
        """返回待配对终端列表（已按最近上报时间倒序）。"""
        return self._collect_pending_clients()

    def _collect_pending_clients(self) -> list[dict[str, Any]]:
        self._reconcile_pending_with_config()
        configured_ids = {c.get("id") for c in self.cfg().clients}
        rows = [
            pending for pending in self._pending.values() if pending.client_id not in configured_ids
        ]
        rows.sort(key=lambda p: p.last_report_at, reverse=True)
        return [row.to_public() for row in rows]

    # ------------------------------------------------------------------ #
    # 待配对清除
    # ------------------------------------------------------------------ #
    def _try_dismiss_pending_record(self, client_id: str) -> dict[str, Any]:
        if not client_id:
            return {"dismissed": False, "reason": "invalid"}
        if self._is_configured(client_id):
            return {"dismissed": False, "reason": "configured"}
        state = self._states.get(client_id)
        if state is not None:
            stale_ms = self.cfg().stale_timeout_sec * 1000
            last_ms = _parse_iso_ms(state.last_report_at)
            if last_ms >= 0 and (_now_ms() - last_ms) <= stale_ms:
                return {"dismissed": False, "reason": "online"}
        had_pending = self._pending.pop(client_id, None) is not None
        had_state = self._states.pop(client_id, None) is not None
        if not had_pending and not had_state:
            return {"dismissed": False, "reason": "not_found"}
        self._purged_runtime_ids.add(client_id)
        return {"dismissed": True}

    async def dismiss_pending(self, client_id: str) -> dict[str, Any]:
        """清除指定离线待配对终端的发现记录并立即落库。"""
        target = str(client_id or "").strip()
        result = self._try_dismiss_pending_record(target)
        if result.get("dismissed"):
            self._dirty = True
            await self.flush_persisted_runtime()
            logger.info("已清除离线待配对终端发现记录: %s", target)
        return result

    async def dismiss_all_offline_pending(self) -> dict[str, Any]:
        """批量清除所有离线待配对终端的发现记录（跳过仍在线的终端）。"""
        self._reconcile_pending_with_config()
        candidates = [cid for cid in list(self._pending.keys()) if not self._is_configured(cid)]
        dismissed: list[str] = []
        for cid in candidates:
            if self._try_dismiss_pending_record(cid).get("dismissed"):
                dismissed.append(cid)
        if dismissed:
            self._dirty = True
            await self.flush_persisted_runtime()
            logger.info("已批量清除 %s 个离线待配对终端发现记录", len(dismissed))
        return {"dismissed": len(dismissed), "clientIds": dismissed}

    # ------------------------------------------------------------------ #
    # 对账 / 在线刷新 / 容量控制
    # ------------------------------------------------------------------ #
    def _reconcile_pending_with_config(self) -> None:
        """将已注册终端移出 pending，未注册但有上报记录的终端恢复为待配对。"""
        configured_ids = {c.get("id") for c in self.cfg().clients}
        for cid in configured_ids:
            self._pending.pop(cid, None)

        changed = False
        for state in self._states.values():
            client_cfg = self._find_client_config(state.client_id)
            configured = client_cfg is not None
            if state.pending != (not configured) or state.label != (client_cfg.get("label") if client_cfg else None):
                state.pending = not configured
                state.label = client_cfg.get("label") if client_cfg else None
                changed = True
            if configured:
                continue
            existing = self._pending.get(state.client_id)
            self._pending[state.client_id] = PendingClientState(
                client_id=state.client_id,
                system_info=state.system_info if state.system_info is not None else (existing.system_info if existing else None),
                first_seen_at=existing.first_seen_at if existing else state.last_report_at,
                last_report_at=state.last_report_at,
            )
            changed = True
        if changed:
            self._dirty = True

    def _prune_pending(self, now_ms: float | None = None) -> None:
        """限制待配对记录内存增长：淘汰超 TTL 的旧条目，超上限时淘汰最旧条目。"""
        now = _now_ms() if now_ms is None else now_ms
        pruned = False
        for cid, pending in list(self._pending.items()):
            last_ms = _parse_iso_ms(pending.last_report_at)
            if last_ms < 0 or (now - last_ms) > PENDING_TTL_MS:
                self._pending.pop(cid, None)
                if not self._is_configured(cid):
                    self._states.pop(cid, None)
                self._purged_runtime_ids.add(cid)
                pruned = True
        if len(self._pending) > MAX_PENDING:
            ordered = sorted(
                self._pending.items(),
                key=lambda item: _parse_iso_ms(item[1].last_report_at),
                reverse=True,
            )
            for cid, _ in ordered[MAX_PENDING:]:
                self._pending.pop(cid, None)
                if not self._is_configured(cid):
                    self._states.pop(cid, None)
                self._purged_runtime_ids.add(cid)
                pruned = True
        if pruned:
            self._dirty = True

    def _refresh_online_flags(self) -> None:
        """周期刷新在线标志：超过 staleTimeoutSec 未上报视为离线。"""
        stale_ms = self.cfg().stale_timeout_sec * 1000
        now = _now_ms()
        changed = False
        for state in self._states.values():
            last_ms = _parse_iso_ms(state.last_report_at)
            online = last_ms >= 0 and (now - last_ms) <= stale_ms
            if state.online != online:
                state.online = online
                changed = True
        self._prune_pending(now)
        if changed:
            self._dirty = True

    # ------------------------------------------------------------------ #
    # 联动执行
    # ------------------------------------------------------------------ #
    def _in_cooldown(self, key: str) -> bool:
        return bool(self._cooldown.is_in_cooldown("clientPower", key))

    def _mark_cooldown(self, key: str) -> None:
        self._cooldown.set_cooldown("clientPower", key, self.cfg().cooldown_min)

    async def _execute_action(self, action: SwitchLinkageAction) -> None:
        """执行单个联动动作：先检查冷却，再调用 HA 服务（失败按配置重试）。"""
        if self._in_cooldown(action.cooldown_key):
            return
        cfg = self.cfg()
        retry_count = max(0, int(cfg.linkage_retry_count or 0))
        retry_delay_ms = max(0, int(cfg.linkage_retry_delay_ms or 0))
        last_error: BaseException | None = None
        for attempt in range(retry_count + 1):
            if attempt > 0 and retry_delay_ms > 0:
                await asyncio.sleep(retry_delay_ms / 1000)
            try:
                await self._ha.call_service(action.domain, action.service, action.entity_id)
                self._mark_cooldown(action.cooldown_key)
                logger.info(
                    "客户端电量联动:%s %s(%s)", action.entity_id, action.service, action.reason
                )
                return
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "客户端电量联动失败 [%s] 第 %s/%s 次: %s",
                    action.entity_id,
                    attempt + 1,
                    retry_count + 1,
                    exc,
                )
        error_message = str(last_error or "").strip() or type(last_error).__name__
        detail = f"客户端电量联动失败 [{action.entity_id}]: {error_message}"
        logger.warning(detail)
        schedule_security_event(
            self._session_factory,
            "client_power_linkage_failed",
            detail,
            entity_id=action.entity_id,
        )
        await self._emit(
            CLIENT_POWER_LINKAGE_FAILED,
            {"entityId": action.entity_id, "reason": action.reason, "error": error_message},
        )

    async def _evaluate_and_execute(self, state: ClientSystemState) -> None:
        """评估并执行客户端的滞回联动动作。"""
        client_cfg = self._find_client_config(state.client_id)
        if not client_cfg or not client_cfg.get("enabled"):
            return
        pricing = self._app_config.get("pricing")
        pricing = pricing if isinstance(pricing, dict) else {}
        is_peak = is_peak_time(datetime.now(UTC), pricing, self._app_config.get_home_timezone())
        actions = evaluate_self_charge_actions(
            client_cfg,
            state,
            is_peak=is_peak,
            time_of_use_active=pricing.get("timeOfUseEnabled") is not False,
        )
        for action in actions:
            await self._execute_action(action)

    # ------------------------------------------------------------------ #
    # 持久化
    # ------------------------------------------------------------------ #
    async def _load_persisted_runtime(self) -> None:
        try:
            data = await asyncio.to_thread(self._read_runtime_kv)
            if not data:
                return
            for cid, state in (data.get("states") or {}).items():
                if not isinstance(state, dict):
                    continue
                self._states[cid] = ClientSystemState(
                    client_id=cid,
                    system_info=state.get("systemInfo"),
                    level=state.get("level"),
                    charging=state.get("charging"),
                    charging_time=state.get("chargingTime"),
                    discharging_time=state.get("dischargingTime"),
                    battery_supported=bool(state.get("batterySupported")),
                    last_report_at=str(state.get("lastReportAt") or ""),
                    online=False,
                    label=state.get("label"),
                    pending=bool(state.get("pending")),
                    report_token_acknowledged=bool(state.get("reportTokenAcknowledged")),
                    report_token_hash=state.get("reportTokenHash"),
                )
            for cid, pending in (data.get("pending") or {}).items():
                if not isinstance(pending, dict):
                    continue
                self._pending[cid] = PendingClientState(
                    client_id=cid,
                    system_info=pending.get("systemInfo"),
                    first_seen_at=str(
                        pending.get("firstSeenAt") or pending.get("lastReportAt") or _iso_now()
                    ),
                    last_report_at=str(pending.get("lastReportAt") or _iso_now()),
                )
        except Exception as exc:
            logger.warning("加载客户端系统信息运行时状态失败: %s", exc)

    def _read_runtime_kv(self) -> Any:
        with self._session_factory() as session:
            return load_runtime_kv(session, CLIENT_POWER_RUNTIME_CONFIG_ID)

    async def flush_persisted_runtime(self) -> None:
        """将内存态 states/pending 合并持久化到 RuntimeKv（仅 dirty 时执行）。"""
        if not self._dirty:
            return
        self._dirty = False
        flushed_purge_ids = list(self._purged_runtime_ids)
        try:
            existing = await asyncio.to_thread(self._read_runtime_kv)
            existing = existing if isinstance(existing, dict) else {}
            states: dict[str, Any] = dict(existing.get("states") or {})
            for cid, state in self._states.items():
                states[cid] = state.to_persist()
            pending: dict[str, Any] = dict(existing.get("pending") or {})
            for cid, row in self._pending.items():
                pending[cid] = row.to_public()
            drop_state = {cid for cid in flushed_purge_ids if cid not in self._states}
            drop_pending = {cid for cid in flushed_purge_ids if cid not in self._pending}
            next_states = {k: v for k, v in states.items() if k not in drop_state}
            next_pending = {k: v for k, v in pending.items() if k not in drop_pending}
            await asyncio.to_thread(
                persist_runtime_kv,
                self._session_factory,
                CLIENT_POWER_RUNTIME_CONFIG_ID,
                {"states": next_states, "pending": next_pending},
            )
            for cid in flushed_purge_ids:
                self._purged_runtime_ids.discard(cid)
        except Exception as exc:
            self._dirty = True
            logger.warning("持久化客户端系统信息状态失败: %s", exc)


def _now_ms() -> float:
    return datetime.now(UTC).timestamp() * 1000


__all__ = [
    "CLIENT_POWER_CHARGED",
    "CLIENT_POWER_LINKAGE_FAILED",
    "CLIENT_POWER_LOW",
    "CLIENT_POWER_REPORTED",
    "ClientPowerService",
]
