"""设备倒计时（「30 分钟后关灯」）服务的校验与调度。

## 为什么要有它

智能家居里最常见的诉求之一是「过一会儿帮我关掉」，而此前全仓没有任何倒计时实现：
用户只能去 HA 里建一条自动化，或者自己记着。3D 弹窗里也没有这个入口。

## 设计要点

- **服务端是唯一真源**：计时器落库，进程重启继续计时（已过期的启动时立即补发）。
  前端只负责展示剩余时间与取消，不自己跑 ``setTimeout`` —— 浏览器切后台 / 平板息屏
  会让前端计时器漂移，用户回来看到「还剩 2 分钟」而灯其实早该灭了。
- **同一实体同一服务只保留一条**：再点一次「30 分钟」是覆盖而不是叠加（后者在设备上
  表现为「按最晚的那个关」，不是用户预期）。
- 到点通过命令代理下发，复用幂等与三态校验；HA 离线时**不静默丢弃**，而是通知用户。
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select

from ...platform.core.db.models import DeviceTimer

logger = logging.getLogger("homeos.device_timer")

#: 单次倒计时上限（24 小时）：更长的需求应交给家庭模式 / HA 自动化。
MAX_SECONDS = 24 * 3600

#: 允许定时的服务：**成对的开/关**，且都是幂等的状态切换。
#:
#: 为什么不做「任意服务」：一个能延时调用任意服务的接口等于「任意定时执行器」，
#: 而定时器的语义是「到点把设备切到某个状态」，不是「到点跑一条脚本」。
#: 锁/开锁、排风、布防这类动作一律不收 —— 它们要么是一次性副作用，要么必须有人确认。
ALLOWED_SERVICES: dict[str, frozenset[str]] = {
    "light": frozenset({"turn_off", "turn_on"}),
    "switch": frozenset({"turn_off", "turn_on"}),
    "fan": frozenset({"turn_off", "turn_on"}),
    "climate": frozenset({"turn_off", "turn_on"}),
    "media_player": frozenset({"turn_off", "turn_on", "media_pause", "media_play"}),
    "humidifier": frozenset({"turn_off", "turn_on"}),
    "cover": frozenset({"close_cover", "open_cover"}),
    "valve": frozenset({"close_valve", "open_valve"}),
    "water_heater": frozenset({"turn_off", "turn_on"}),
}

#: 「到点关闭」类服务（前端默认预设用）。
CLOSING_SERVICES: dict[str, str] = {
    "light": "turn_off",
    "switch": "turn_off",
    "fan": "turn_off",
    "climate": "turn_off",
    "media_player": "turn_off",
    "humidifier": "turn_off",
    "cover": "close_cover",
    "valve": "close_valve",
    "water_heater": "turn_off",
}

#: 「到点开启」类服务。
OPENING_SERVICES: dict[str, str] = {
    "light": "turn_on",
    "switch": "turn_on",
    "fan": "turn_on",
    "climate": "turn_on",
    "media_player": "turn_on",
    "humidifier": "turn_on",
    "cover": "open_cover",
    "valve": "open_valve",
    "water_heater": "turn_on",
}


def resolve_service(entity_id: str, action: str | None) -> str:
    """``action="on"|"off"`` → 该域对应的服务名；``None`` 时用关闭类。"""
    domain = str(entity_id or "").split(".", 1)[0]
    table = OPENING_SERVICES if action == "on" else CLOSING_SERVICES
    return table.get(domain) or CLOSING_SERVICES.get(domain) or "turn_off"


def naive_utc(moment: datetime) -> datetime:
    return moment.astimezone(UTC).replace(tzinfo=None) if moment.tzinfo else moment


def iso_utc(moment: datetime) -> str:
    aware = moment.replace(tzinfo=UTC) if moment.tzinfo is None else moment.astimezone(UTC)
    return aware.strftime("%Y-%m-%dT%H:%M:%S.") + f"{aware.microsecond // 1000:03d}Z"


def validate_timer_request(entity_id: str, service: str, seconds: Any) -> tuple[str, str, int]:
    """校验并归一化一条倒计时请求；返回 ``(domain, service, seconds)``。"""
    entity = str(entity_id or "").strip()
    if "." not in entity:
        raise ValueError("entity_id 无效")
    domain = entity.split(".", 1)[0]
    allowed = ALLOWED_SERVICES.get(domain)
    if allowed is None:
        raise ValueError(f"不支持为 {domain} 域设置倒计时")
    name = str(service or "turn_off").strip() or "turn_off"
    if name not in allowed:
        raise ValueError(f"{domain} 域不支持倒计时服务 {name}")
    try:
        value = int(float(seconds))
    except (TypeError, ValueError):  # fmt: skip
        raise ValueError("倒计时秒数无效") from None
    if value <= 0:
        raise ValueError("倒计时秒数须大于 0")
    return domain, name, min(MAX_SECONDS, value)


class DeviceTimerService:
    """倒计时的增删查与到点执行（单进程内调度，数据库是唯一真源）。"""

    def __init__(
        self,
        *,
        database: Any,
        command_proxy: Any,
        notification: Any = None,
        event_bus: Any = None,
    ) -> None:
        self._database = database
        self._proxy = command_proxy
        self._notification = notification
        self._bus = event_bus
        self._tasks: dict[str, asyncio.Task[Any]] = {}

    # ---- 生命周期 ----
    async def start(self) -> None:
        """载入未过期的计时器；已过期的立即补发（不能静默丢）。"""
        rows = await asyncio.to_thread(self._load_rows)
        now = datetime.now(UTC).replace(tzinfo=None)
        for row in rows:
            fire_at = row["fireAt"]
            if fire_at <= now:
                await self._fire(row["entityId"], row["service"], row["serviceData"], overdue=True)
                await asyncio.to_thread(self._delete, row["id"])
                continue
            self._schedule(row["id"], row["entityId"], row["service"], row["serviceData"], fire_at)
        if rows:
            logger.info("已恢复 %s 条设备倒计时", len(rows))

    async def stop(self) -> None:
        for task in list(self._tasks.values()):
            task.cancel()
        self._tasks.clear()

    # ---- 对外操作 ----
    async def set_timer(
        self,
        *,
        entity_id: str,
        service: str = "turn_off",
        seconds: Any,
        service_data: dict[str, Any] | None = None,
        created_by: str | None = None,
    ) -> dict[str, Any]:
        domain, name, value = validate_timer_request(entity_id, service, seconds)
        entity = entity_id.strip()
        fire_at = datetime.now(UTC).replace(tzinfo=None) + timedelta(seconds=value)
        payload = json.dumps(service_data or {}, ensure_ascii=False)
        timer_id = await asyncio.to_thread(self._upsert, entity, domain, name, payload, fire_at, created_by)
        existing = self._tasks.pop(entity, None)
        if existing is not None:
            existing.cancel()
        self._schedule(timer_id, entity, name, payload, fire_at)
        return {
            "id": timer_id,
            "entityId": entity,
            "service": f"{domain}.{name}",
            "fireAt": iso_utc(fire_at),
            "seconds": value,
        }

    async def cancel(self, entity_id: str) -> bool:
        entity = str(entity_id or "").strip()
        if not entity:
            return False
        task = self._tasks.pop(entity, None)
        if task is not None:
            task.cancel()
        return await asyncio.to_thread(self._delete_by_entity, entity)

    async def list_timers(self) -> list[dict[str, Any]]:
        rows = await asyncio.to_thread(self._load_rows)
        now = datetime.now(UTC).replace(tzinfo=None)
        return [
            {
                "id": row["id"],
                "entityId": row["entityId"],
                "domain": row["domain"],
                "service": row["service"],
                "fireAt": iso_utc(row["fireAt"]),
                "remainingSeconds": max(0, int((row["fireAt"] - now).total_seconds())),
            }
            for row in rows
        ]

    # ---- 调度 ----
    def _schedule(self, timer_id: str, entity_id: str, service: str, service_data: str, fire_at: datetime) -> None:
        delay = max(0.0, (fire_at - datetime.now(UTC).replace(tzinfo=None)).total_seconds())
        self._tasks[entity_id] = asyncio.create_task(
            self._wait_and_fire(timer_id, entity_id, service, service_data, delay)
        )

    async def _wait_and_fire(
        self, timer_id: str, entity_id: str, service: str, service_data: str, delay: float
    ) -> None:
        try:
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            raise
        self._tasks.pop(entity_id, None)
        await self._fire(entity_id, service, service_data)
        await asyncio.to_thread(self._delete, timer_id)

    async def _fire(self, entity_id: str, service: str, service_data: str, *, overdue: bool = False) -> None:
        domain = entity_id.split(".", 1)[0]
        try:
            data = json.loads(service_data) if service_data else {}
            if not isinstance(data, dict):
                data = {}
        except ValueError:
            logger.warning("倒计时服务参数不是合法 JSON，按空参数下发: %r", service_data)
            data = {}
        try:
            await self._proxy.call_service(
                {
                    "domain": domain,
                    "service": service,
                    "entity_id": entity_id,
                    "service_data": data,
                    # 幂等键带分钟：同一条计时器只执行一次，重启补发也不会重复下发。
                    "idempotency_key": f"timer:{entity_id}:{service}:{datetime.now(UTC):%Y%m%d%H%M}",
                },
                policy="http",
            )
        except Exception as error:
            logger.warning("设备倒计时执行失败: %s.%s → %s", domain, service, entity_id, exc_info=True)
            await self._notify(
                "warning",
                f"设备倒计时执行失败（{entity_id}）：{error}"
                + ("；该计时器在停机期间已到期，已补发一次" if overdue else ""),
                entity_id,
            )
            return
        logger.info("设备倒计时已执行: %s.%s → %s%s", domain, service, entity_id, "（补发）" if overdue else "")
        if self._bus is not None:
            self._bus.emit_soon(
                "deviceTimer.fired",
                {"entityId": entity_id, "service": f"{domain}.{service}", "overdue": overdue},
            )

    async def _notify(self, level: str, message: str, entity_id: str) -> None:
        if self._notification is None:
            return
        try:
            await self._notification.notify(level, message, "device-timer", entity_id)
        except Exception:
            logger.debug("倒计时失败通知发送失败", exc_info=True)

    # ---- 数据库 ----
    def _load_rows(self) -> list[dict[str, Any]]:
        with self._database.session_factory() as session:
            rows = session.scalars(select(DeviceTimer).order_by(DeviceTimer.fire_at)).all()
            return [
                {
                    "id": row.id,
                    "entityId": row.entity_id,
                    "domain": row.domain,
                    "service": row.service,
                    "serviceData": row.service_data or "{}",
                    "fireAt": row.fire_at,
                }
                for row in rows
            ]

    def _upsert(
        self,
        entity_id: str,
        domain: str,
        service: str,
        service_data: str,
        fire_at: datetime,
        created_by: str | None,
    ) -> str:
        with self._database.session_factory() as session:
            existing = session.scalars(
                select(DeviceTimer).where(DeviceTimer.entity_id == entity_id, DeviceTimer.service == service)
            ).first()
            # 同一实体只保留**一条**定时：``1h 后关 + 8h 后开`` 这种组合在设备上是
            # 「关掉又被打开」，用户真正要的是「切到某个状态」。新设定直接顶掉旧的，
            # 与前端「一个设备一个倒计时」的呈现一致。
            session.execute(
                delete(DeviceTimer).where(DeviceTimer.entity_id == entity_id, DeviceTimer.service != service)
            )
            if existing is not None:
                existing.fire_at = naive_utc(fire_at)
                existing.service_data = service_data
                existing.domain = domain
                existing.created_by = created_by
                session.commit()
                return existing.id
            row = DeviceTimer(
                entity_id=entity_id,
                domain=domain,
                service=service,
                service_data=service_data,
                fire_at=naive_utc(fire_at),
                created_by=created_by,
            )
            session.add(row)
            session.commit()
            return row.id

    def _delete(self, timer_id: str) -> None:
        with self._database.session_factory() as session:
            session.execute(delete(DeviceTimer).where(DeviceTimer.id == timer_id))
            session.commit()

    def _delete_by_entity(self, entity_id: str) -> bool:
        with self._database.session_factory() as session:
            result = session.execute(delete(DeviceTimer).where(DeviceTimer.entity_id == entity_id))
            session.commit()
            return bool(result.rowcount)


__all__ = [
    "ALLOWED_SERVICES",
    "CLOSING_SERVICES",
    "MAX_SECONDS",
    "OPENING_SERVICES",
    "DeviceTimerService",
    "resolve_service",
    "validate_timer_request",
]
