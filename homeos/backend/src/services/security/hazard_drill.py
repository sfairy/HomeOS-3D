"""安全演习服务（对齐 ``HazardDrillService``）。

模拟烟雾 / 燃气 / 漏水告警：仅触发通知与紧急场景，不执行关阀 / 排风自动动作。
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from ...core.entity_domain import get_entity_domain
from .bus import LocalEventBus
from .layout import load_active_project_layout, parse_hazard_layout_bindings

logger = logging.getLogger("homeos.security.drill")

_HAZARD_LABELS = {"smoke": "烟雾", "gas": "燃气", "leak": "漏水"}


class HazardDrillService:
    def __init__(self, session_factory, bus: LocalEventBus, ha_connector) -> None:
        self._session_factory = session_factory
        self._bus = bus
        self._ha = ha_connector

    async def run_drill(self, kind: str = "smoke") -> dict[str, Any]:
        _, layout = await asyncio.to_thread(load_active_project_layout, self._session_factory)
        bindings = parse_hazard_layout_bindings(layout)
        label = _HAZARD_LABELS.get(kind, "安全")

        bound_ids = (
            bindings.smoke_entity_ids
            if kind == "smoke"
            else bindings.gas_entity_ids
            if kind == "gas"
            else bindings.leak_entity_ids
        )
        if not bound_ids:
            return {
                "success": False,
                "drillMode": True,
                "kind": kind,
                "sceneTriggered": False,
                "message": f"未绑定{label}传感器，请先在集成绑定中配置后再演习",
            }

        await self._bus.emit(
            "security.alarm",
            {
                "entityId": f"drill.{kind}",
                "friendlyName": f"{label}演习",
                "type": "smoke" if kind == "smoke" else ("gas_leak" if kind == "gas" else "water_leak"),
                "autoActions": False,
                "drillMode": True,
                "actionResults": [],
                "actionFailures": [],
                "zones": [],
                "zoneNames": f"{label}演习",
                "mode": "safety",
                "timestamp": _iso_now(),
            },
        )

        scene_ids = bindings.emergency_scene_ids
        for scene_id in scene_ids:
            try:
                await self._ha.call_service(
                    get_entity_domain(scene_id) or "scene", "turn_on", scene_id, {}
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("演习触发紧急场景失败 [%s]: %s", scene_id, exc)

        return {
            "success": True,
            "drillMode": True,
            "kind": kind,
            "boundCount": len(bound_ids),
            "sceneTriggered": len(scene_ids) > 0,
            "message": (
                f"已触发{label}演习：通知 + {len(scene_ids)} 个紧急场景"
                f"（{len(bound_ids)} 个绑定实体，未关阀/排风）"
                if scene_ids
                else f"已触发{label}演习通知"
                f"（{len(bound_ids)} 个绑定实体，未配置紧急场景，未关阀/排风）"
            ),
        }


def _iso_now() -> str:
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
