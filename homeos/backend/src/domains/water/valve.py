"""主水阀关闭服务（「一键关阀」，**不自动关**）。

为什么不自动：见 :mod:`.monitor` 的模块说明 —— 误关一次全屋断水，代价远大于晚提醒几十秒。
这里只提供「用户确认后关阀」这一步，复用命令代理的全部保护（幂等、许可门禁、三态后置校验），
并写一条安防事件做审计：关阀是**破坏性**动作，事后必须能查到是谁、什么时候、因为什么。
"""

from __future__ import annotations

import logging
from typing import Any

from ...platform.core.http.errors import BusinessException, ErrorCode, api_error

logger = logging.getLogger("homeos.water.valve")

#: 允许关闭的域：``valve`` 与 ``switch``（很多用户把水阀接在智能插座/继电器上）。
_VALVE_DOMAINS = frozenset({"valve", "switch"})


class WaterValveService:
    """关闭/打开主水阀（仅主水阀一个实体，不做批量）。"""

    def __init__(
        self,
        *,
        app_config: Any,
        command_proxy: Any,
        session_factory: Any,
        notification: Any = None,
        event_bus: Any = None,
    ) -> None:
        self._config = app_config
        self._proxy = command_proxy
        self._session_factory = session_factory
        self._notification = notification
        self._bus = event_bus

    def resolve_valve(self) -> str:
        cfg = self._config.get("water") or {}
        entity_id = str(cfg.get("mainValveEntityId") or "").strip()
        if not entity_id:
            raise BusinessException(
                ErrorCode.BAD_REQUEST,
                str(api_error("WATER_VALVE_NOT_CONFIGURED")),
            )
        if not _is_valve_entity(entity_id):
            raise BusinessException(
                ErrorCode.BAD_REQUEST,
                str(api_error("WATER_VALVE_INVALID", entity_id)),
            )
        return entity_id

    async def set_state(self, *, close: bool, actor: str | None = None) -> dict[str, Any]:
        """关阀（``close=True``）/ 开阀。用户显式操作才走到这里。"""
        entity_id = self.resolve_valve()
        domain = entity_id.split(".", 1)[0]
        service = _service_for(domain, close)
        result = await self._proxy.call_service(
            {
                "domain": domain,
                "service": service,
                "entity_id": entity_id,
                "service_data": {},
                # 幂等键：连点两次只下发一次；换分钟再点仍然生效（用户可能就是
                # 想再关一次确认）。
                "idempotency_key": f"water-valve:{'close' if close else 'open'}:{entity_id}",
            },
            policy="http",
        )
        self._audit(close, entity_id, actor)
        await self._notify(close, entity_id)
        return {"success": True, "entityId": entity_id, "service": f"{domain}.{service}", "result": result}

    def _audit(self, close: bool, entity_id: str, actor: str | None) -> None:
        """写安防事件：破坏性动作必须可追溯。"""
        try:
            from ..security.layout import schedule_security_event_silent

            schedule_security_event_silent(
                self._session_factory,
                "water_valve_closed" if close else "water_valve_opened",
                f"主水阀{'关闭' if close else '打开'}：{entity_id}",
                entity_id=entity_id,
                source="manual",
                actor=actor,
            )
        except Exception:  # 审计写失败不能把已经执行的动作变成 500
            logger.warning("写入水阀操作审计失败（动作已执行）: %s", entity_id, exc_info=True)

    async def _notify(self, close: bool, entity_id: str) -> None:
        if self._notification is None:
            return
        try:
            await self._notification.notify(
                "info",
                f"🛑 已{'关闭' if close else '打开'}主水阀（{entity_id}）",
                "water-monitor",
                entity_id,
            )
        except Exception:
            logger.debug("水阀操作通知发送失败", exc_info=True)


def _is_valve_entity(entity_id: str) -> bool:
    domain = entity_id.split(".", 1)[0]
    return domain in _VALVE_DOMAINS and "." in entity_id


def _service_for(domain: str, close: bool) -> str:
    if domain == "valve":
        return "close_valve" if close else "open_valve"
    return "turn_off" if close else "turn_on"


__all__ = ["WaterValveService"]
