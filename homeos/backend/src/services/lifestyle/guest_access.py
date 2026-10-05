"""访客临时密码服务（对齐 ``GuestAccessService``）。

为智能门锁生成有时效的临时密码（写入指定 HA lock 槽位），到期或手动撤销时清除；
密文与元数据落库（``guest_passes``），重启后 hydrate 恢复。

与 Nest 的差异仅为调度实现：Node ``setTimeout`` 换为 ``loop.call_later``，
定时精度与「到期即撤销」语义保持一致。
"""

from __future__ import annotations

import asyncio
import logging
import secrets
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select

from ...core.errors import BusinessException, ErrorCode, api_error, bad_request
from ...core.models import GuestPass as GuestPassRow
from .guest_pass_crypto import (
    decrypt_guest_pass_code,
    encrypt_guest_pass_code,
    ensure_guest_pass_crypto_key,
)

logger = logging.getLogger("homeos.system.lifestyle.guest")

#: 同时有效的临时密码上限（含 DB 与内存两侧判定）
MAX_ACTIVE_GUEST_PASSES = 100
#: 门锁用户码起始槽位
FIRST_SLOT = 10
#: 单次延时上限（Node setTimeout 的 32 位上限）
MAX_TIMEOUT_MS = 2_147_483_647


def _iso(dt: datetime) -> str:
    """与 JS ``Date.toISOString()`` 一致（UTC + 毫秒 + Z 后缀）。"""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _to_naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(UTC).replace(tzinfo=None)
    return dt


class GuestAccessService:
    """访客临时密码：创建 / 撤销 / 延期 / 到期联动。"""

    def __init__(
        self,
        ha_connector: Any,
        event_bus: Any,
        app_config: Any,
        session_factory: Any,
    ) -> None:
        self._ha_connector = ha_connector
        self._event_bus = event_bus
        self._app_config = app_config
        self._session_factory = session_factory
        self._passes: dict[str, dict[str, Any]] = {}
        self._timers: dict[str, asyncio.TimerHandle] = {}
        self._loop: asyncio.AbstractEventLoop | None = None

    # ------------------------------------------------------------------ #
    # 生命周期
    # ------------------------------------------------------------------ #
    async def start(self) -> None:
        """对齐 ``onModuleInit``：预热密钥 + 从 DB 恢复有效密码。"""
        self._loop = asyncio.get_running_loop()
        try:
            ensure_guest_pass_crypto_key()
        except Exception as err:  # noqa: BLE001 - 密钥缺失不阻塞启动
            logger.error("访客密码加密密钥初始化失败: %s", err)
        await self.hydrate_from_db()

    async def stop(self) -> None:
        """对齐 ``onModuleDestroy``：清除全部到期定时器。"""
        for handle in self._timers.values():
            handle.cancel()
        self._timers.clear()

    # ------------------------------------------------------------------ #
    # 事件联动
    # ------------------------------------------------------------------ #
    def bind_events(self) -> None:
        """订阅「全员离家」与「日历外出」事件（对齐 ``@OnEvent``）。"""
        if self._event_bus is None:
            return
        self._event_bus.on("presence.everyoneLeft", self._on_everyone_left)
        self._event_bus.on("calendar.awayChanged", self._on_calendar_away)

    async def _on_everyone_left(self, _payload: Any = None) -> None:
        await self.revoke_all_on_away("全员离家")

    async def _on_calendar_away(self, data: Any = None) -> None:
        if not isinstance(data, dict) or not data.get("away"):
            return
        await self.revoke_all_on_away("日历外出")

    async def revoke_all_on_away(self, reason: str) -> None:
        """全员离家 / 日历外出联动：撤销所有有效访客临时密码。"""
        if not (self._other_config().get("guestPassRevokeOnAway")):
            return
        ids = list(self._passes.keys())
        if not ids:
            return
        ok = 0
        for pass_id in ids:
            try:
                result = await self.revoke_pass(pass_id)
                if result.get("ok"):
                    ok += 1
            except Exception as err:  # noqa: BLE001 - 单条失败不阻塞其余撤销
                logger.debug("离家联动撤销访客密码失败 [%s]: %s", pass_id, err)
        if ok > 0:
            self._emit("guest.passRevokedOnAway", {"reason": reason, "count": ok})
            logger.info("%s:已联动撤销 %s/%s 条访客临时密码", reason, ok, len(ids))

    # ------------------------------------------------------------------ #
    # 配置读取
    # ------------------------------------------------------------------ #
    def _other_config(self) -> dict[str, Any]:
        value = self._app_config.get("other")
        return value if isinstance(value, dict) else {}

    def _guest_default_hours(self) -> float:
        hours = self._other_config().get("guestPassDefaultHours")
        return hours if isinstance(hours, (int, float)) and hours > 0 else 24

    def _guest_extend_hours(self) -> float:
        hours = self._other_config().get("guestPassExtendHours")
        return hours if isinstance(hours, (int, float)) and hours > 0 else 24

    def _clamp_duration_hours(self, raw: Any) -> float:
        fallback = self._guest_default_hours()
        hours = float(raw) if isinstance(raw, (int, float)) else float(fallback)
        return min(168.0, max(1.0, hours))

    def _clamp_extend_hours(self, raw: Any) -> float:
        hours = float(raw) if isinstance(raw, (int, float)) and raw > 0 else self._guest_extend_hours()
        return min(168.0, max(1.0, hours))

    # ------------------------------------------------------------------ #
    # 恢复
    # ------------------------------------------------------------------ #
    async def hydrate_from_db(self) -> None:
        try:
            with self._session_factory() as session:
                rows = session.scalars(
                    select(GuestPassRow)
                    .where(GuestPassRow.active.is_(True), GuestPassRow.expires_at > datetime.now(UTC).replace(tzinfo=None))
                    .limit(500)
                ).all()
            for row in rows:
                try:
                    code = decrypt_guest_pass_code(
                        {"cipher": row.code_cipher, "iv": row.code_iv, "tag": row.code_tag}
                    )
                except Exception as err:  # noqa: BLE001 - 解密失败标记失效
                    logger.warning("访客密码 %s 解密失败,标记失效: %s", row.id, err)
                    self._mark_inactive(row.id)
                    continue
                guest_pass = {
                    "id": row.id,
                    "name": row.name,
                    "code": code,
                    "lockEntityId": row.lock_entity_id,
                    "slot": row.slot,
                    "createdAt": _iso(row.created_at),
                    "expiresAt": _iso(row.expires_at),
                    "active": True,
                }
                self._passes[guest_pass["id"]] = guest_pass
                self._schedule_expiry(guest_pass)
            logger.info("已从数据库恢复 %s 条访客临时密码", len(self._passes))
        except Exception as err:  # noqa: BLE001 - hydrate 失败仅告警
            logger.error("访客密码 hydrate 失败: %s", err)

    def _mark_inactive(self, pass_id: str) -> None:
        try:
            with self._session_factory() as session:
                row = session.get(GuestPassRow, pass_id)
                if row is not None:
                    row.active = False
                    session.commit()
        except Exception:  # noqa: BLE001 - 标记失败不影响主流程
            pass

    # ------------------------------------------------------------------ #
    # 创建 / 撤销 / 延期
    # ------------------------------------------------------------------ #
    async def create_pass(self, opts: dict[str, Any]) -> dict[str, Any]:
        with self._session_factory() as session:
            active_count = session.scalar(
                select(func.count()).select_from(GuestPassRow).where(GuestPassRow.active.is_(True))
            )
        if (active_count or 0) >= MAX_ACTIVE_GUEST_PASSES or len(self._passes) >= MAX_ACTIVE_GUEST_PASSES:
            raise _guest_pass_limit_error()

        pass_id = f"guest_{uuid.uuid4()}"
        code = str(opts.get("code") or (secrets.randbelow(900_000) + 100_000))
        lock_entity_id = str(opts.get("lockEntityId") or "")
        raw_slot = opts.get("slot")
        slot = int(raw_slot) if isinstance(raw_slot, (int, float)) else await self._next_free_slot(lock_entity_id)
        duration_hours = self._clamp_duration_hours(opts.get("durationHours"))
        now = datetime.now(UTC)
        expires_at = now + timedelta(hours=duration_hours)
        sealed = encrypt_guest_pass_code(code)

        guest_pass = {
            "id": pass_id,
            "name": str(opts.get("name") or ""),
            "code": code,
            "lockEntityId": lock_entity_id,
            "slot": slot,
            "createdAt": _iso(now),
            "expiresAt": _iso(expires_at),
            "active": True,
        }

        with self._session_factory() as session:
            session.add(
                GuestPassRow(
                    id=pass_id,
                    name=guest_pass["name"],
                    lock_entity_id=lock_entity_id,
                    slot=slot,
                    code_cipher=sealed["cipher"],
                    code_iv=sealed["iv"],
                    code_tag=sealed["tag"],
                    created_at=_to_naive_utc(now),
                    expires_at=_to_naive_utc(expires_at),
                    active=True,
                )
            )
            session.commit()

        try:
            await self._set_lock_code(guest_pass)
        except Exception:
            with self._session_factory() as session:
                row = session.get(GuestPassRow, pass_id)
                if row is not None:
                    session.delete(row)
                    session.commit()
            logger.warning(
                "临时密码门锁写入失败已回滚: %s (%s)", guest_pass["name"], lock_entity_id
            )
            raise

        self._passes[pass_id] = guest_pass
        self._schedule_expiry(guest_pass)
        self._emit(
            "guest.passCreated",
            {"id": pass_id, "name": guest_pass["name"], "expiresAt": guest_pass["expiresAt"]},
        )
        logger.info(
            "临时密码已创建: %s (槽位%s, 有效至 %s)", guest_pass["name"], slot, guest_pass["expiresAt"]
        )
        return {**self._redact(guest_pass), "code": code}

    async def revoke_pass(self, pass_id: str) -> dict[str, Any]:
        guest_pass = self._passes.get(pass_id) or await self._load_pass_from_db(pass_id)
        if guest_pass is None:
            return {"ok": False, "reason": "未找到"}
        await self._clear_lock_code(guest_pass)
        guest_pass["active"] = False
        self._clear_timer(pass_id)
        self._passes.pop(pass_id, None)
        self._mark_inactive(pass_id)
        self._emit("guest.passRevoked", {"id": pass_id, "name": guest_pass["name"]})
        logger.info("临时密码已撤销: %s", guest_pass["name"])
        return {"ok": True, "id": pass_id}

    async def extend_pass(self, pass_id: str, hours: Any = None) -> dict[str, Any]:
        extend_hours = self._clamp_extend_hours(hours)
        guest_pass = self._passes.get(pass_id) or await self._load_pass_from_db(pass_id)
        if guest_pass is None or not guest_pass.get("active"):
            return {"ok": False, "reason": "未找到"}
        base = max(_now_ms(), _parse_iso_ms(guest_pass["expiresAt"]))
        guest_pass["expiresAt"] = _iso(datetime.fromtimestamp((base + extend_hours * 3_600_000) / 1000, UTC))
        self._clear_timer(pass_id)
        self._schedule_expiry(guest_pass)
        self._passes[pass_id] = guest_pass
        try:
            with self._session_factory() as session:
                row = session.get(GuestPassRow, pass_id)
                if row is not None:
                    row.expires_at = _parse_iso_naive(guest_pass["expiresAt"])
                    row.active = True
                    session.commit()
        except Exception as err:  # noqa: BLE001 - 持久化失败不阻塞内存延期
            logger.debug("访客密码延期持久化失败 [%s]: %s", pass_id, err)
        self._emit(
            "guest.passExtended",
            {"id": pass_id, "name": guest_pass["name"], "expiresAt": guest_pass["expiresAt"]},
        )
        return {"ok": True, "pass": self._redact(guest_pass)}

    async def extend_many(self, ids: list[str], hours: Any = None) -> list[dict[str, Any]]:
        extend_hours = self._clamp_extend_hours(hours)
        results: list[dict[str, Any]] = []
        for pass_id in ids:
            results.append(await self.extend_pass(pass_id, extend_hours))
        return results

    async def list(self) -> list[dict[str, Any]]:
        with self._session_factory() as session:
            rows = session.scalars(
                select(GuestPassRow)
                .where(GuestPassRow.active.is_(True))
                .order_by(GuestPassRow.created_at.desc())
                .limit(500)
            ).all()
        out: list[dict[str, Any]] = []
        for row in rows:
            mem = self._passes.get(row.id)
            if mem is not None:
                out.append(self._redact(mem))
                continue
            try:
                code = decrypt_guest_pass_code(
                    {"cipher": row.code_cipher, "iv": row.code_iv, "tag": row.code_tag}
                )
            except Exception:  # noqa: BLE001 - 解密失败降级为掩码返回
                out.append(
                    {
                        "id": row.id,
                        "name": row.name,
                        "lockEntityId": row.lock_entity_id,
                        "slot": row.slot,
                        "codeMasked": "******",
                        "createdAt": _iso(row.created_at),
                        "expiresAt": _iso(row.expires_at),
                        "active": row.active,
                    }
                )
                continue
            out.append(
                self._redact(
                    {
                        "id": row.id,
                        "name": row.name,
                        "code": code,
                        "lockEntityId": row.lock_entity_id,
                        "slot": row.slot,
                        "createdAt": _iso(row.created_at),
                        "expiresAt": _iso(row.expires_at),
                        "active": row.active,
                    }
                )
            )
        return out

    # ------------------------------------------------------------------ #
    # 内部工具
    # ------------------------------------------------------------------ #
    async def _load_pass_from_db(self, pass_id: str) -> dict[str, Any] | None:
        with self._session_factory() as session:
            row = session.get(GuestPassRow, pass_id)
        if row is None or not row.active:
            return None
        try:
            code = decrypt_guest_pass_code(
                {"cipher": row.code_cipher, "iv": row.code_iv, "tag": row.code_tag}
            )
        except Exception:  # noqa: BLE001 - 解密失败等同找不到
            return None
        guest_pass = {
            "id": row.id,
            "name": row.name,
            "code": code,
            "lockEntityId": row.lock_entity_id,
            "slot": row.slot,
            "createdAt": _iso(row.created_at),
            "expiresAt": _iso(row.expires_at),
            "active": row.active,
        }
        self._passes[pass_id] = guest_pass
        return guest_pass

    @staticmethod
    def _redact(guest_pass: dict[str, Any]) -> dict[str, Any]:
        code = str(guest_pass.get("code") or "")
        masked = "*" * max(0, len(code) - 2) + code[-2:] if code else ""
        return {
            "id": guest_pass["id"],
            "name": guest_pass["name"],
            "lockEntityId": guest_pass["lockEntityId"],
            "slot": guest_pass["slot"],
            "codeMasked": masked,
            "createdAt": guest_pass["createdAt"],
            "expiresAt": guest_pass["expiresAt"],
            "active": guest_pass["active"],
        }

    async def _next_free_slot(self, lock_entity_id: str) -> int:
        used: set[int] = set()
        for guest_pass in self._passes.values():
            if guest_pass["lockEntityId"] == lock_entity_id:
                used.add(int(guest_pass["slot"]))
        with self._session_factory() as session:
            rows = session.scalars(
                select(GuestPassRow.slot)
                .where(GuestPassRow.lock_entity_id == lock_entity_id, GuestPassRow.active.is_(True))
                .limit(200)
            ).all()
        used.update(int(slot) for slot in rows)
        slot = FIRST_SLOT
        while slot in used:
            slot += 1
        return slot

    def _schedule_expiry(self, guest_pass: dict[str, Any]) -> None:
        delay_ms = _parse_iso_ms(guest_pass["expiresAt"]) - _now_ms()
        if delay_ms <= 0:
            self._fire_and_forget(self.revoke_pass(guest_pass["id"]))
            return
        self._clear_timer(guest_pass["id"])
        loop = self._loop or asyncio.get_running_loop()
        handle = loop.call_later(
            min(delay_ms, MAX_TIMEOUT_MS) / 1000,
            lambda pid=guest_pass["id"]: self._fire_and_forget(self.revoke_pass(pid)),
        )
        self._timers[guest_pass["id"]] = handle

    def _clear_timer(self, pass_id: str) -> None:
        handle = self._timers.pop(pass_id, None)
        if handle is not None:
            handle.cancel()

    def _fire_and_forget(self, coro: Any) -> None:
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        loop.create_task(coro)  # noqa: RUF006 - 到期撤销为 fire-and-forget

    def _emit(self, name: str, payload: dict[str, Any]) -> None:
        if self._event_bus is None:
            return
        try:
            emit_soon = getattr(self._event_bus, "emit_soon", None)
            if callable(emit_soon):
                emit_soon(name, payload)
                return
            emit = getattr(self._event_bus, "emit", None)
            if callable(emit):
                result = emit(name, payload)
                if asyncio.iscoroutine(result):
                    self._fire_and_forget(result)
        except Exception as err:  # noqa: BLE001 - 事件广播失败不影响主流程
            logger.debug("访客事件广播失败 [%s]: %s", name, err)

    async def _try_lock_code(self, guest_pass: dict[str, Any], action: str) -> bool:
        data = (
            {"code_slot": guest_pass["slot"], "usercode": guest_pass["code"]}
            if action == "set_usercode"
            else {"code_slot": guest_pass["slot"]}
        )
        try:
            await self._ha_connector.call_service(
                "lock", action, guest_pass["lockEntityId"], data
            )
            return True
        except Exception as err:  # noqa: BLE001 - 门锁集成可能不支持 usercode
            logger.debug("lock.%s 失败: %s", action, err)
        label = "写入" if action == "set_usercode" else "清除"
        logger.warning(
            "临时密码%s门锁失败(%s),请检查门锁集成是否支持 usercode 服务",
            label,
            guest_pass["lockEntityId"],
        )
        return False

    async def _set_lock_code(self, guest_pass: dict[str, Any]) -> None:
        if not await self._try_lock_code(guest_pass, "set_usercode"):
            bad_request(str(api_error("GUEST_PASS_LOCK_WRITE_FAILED")))

    async def _clear_lock_code(self, guest_pass: dict[str, Any]) -> None:
        # 撤销时清除失败仅告警：本地仍须标记失效，避免「假 active」
        await self._try_lock_code(guest_pass, "clear_usercode")


def _guest_pass_limit_error() -> Exception:
    return BusinessException(
        ErrorCode.VALIDATION_FAILED, api_error("GUEST_PASS_LIMIT", MAX_ACTIVE_GUEST_PASSES)
    )


def _now_ms() -> float:
    return time.time() * 1000


def _parse_iso_ms(value: Any) -> float:
    text = str(value or "").strip()
    if not text:
        return 0.0
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return 0.0
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.timestamp() * 1000


def _parse_iso_naive(value: Any) -> datetime:
    text = str(value or "").strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(UTC).replace(tzinfo=None)
    return parsed


__all__ = ["GuestAccessService", "MAX_ACTIVE_GUEST_PASSES"]
