"""mmWave 毫米波雷达房间存在检测（对齐 ``MmWavePresenceService``）。

同房间多传感器：任一传感器 occupied → 房间有人（OR 融合）；离场带 30s 防抖。
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from typing import Any

from .bus import LocalEventBus
from .catalog import infer_room_id_from_entity_id

logger = logging.getLogger("homeos.security.mmwave")

OCCUPIED_TIMEOUT_SECONDS = 30.0


class MmWavePresenceService:
    def __init__(self, bus: LocalEventBus) -> None:
        self._bus = bus
        self._sensors: dict[str, dict[str, Any]] = {}
        self._off_timers: dict[str, asyncio.Task] = {}

    async def stop(self) -> None:
        for task in self._off_timers.values():
            task.cancel()
        for task in list(self._off_timers.values()):
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        self._off_timers.clear()
        self._sensors.clear()

    async def handle_state_change(self, event: dict[str, Any]) -> None:
        entity_id = str(event.get("entity_id") or "")
        new_state = event.get("new_state") or {}
        state = new_state.get("state")
        attrs = new_state.get("attributes")
        if not state or not isinstance(attrs, dict):
            return

        model = self._identify_model(entity_id, attrs)
        if not model:
            return

        room = self._infer_room(entity_id, attrs)
        now = time.time()
        occupied = state in ("on", "detected", "occupied", "home")
        moving = (
            attrs.get("moving") is True
            or attrs.get("motion_detected") is True
            or state in ("moving", "motion")
        )
        stationary = (
            attrs.get("stationary") is True
            or attrs.get("still") is True
            or state in ("stationary", "still")
        )
        distance = _parse_float(attrs.get("distance"))
        if distance is None:
            distance = _parse_float(attrs.get("target_distance"))
        energy = _parse_float(attrs.get("motion_energy"))
        if energy is None:
            energy = _parse_float(attrs.get("energy"))
        if energy is None:
            energy = 100.0 if moving else 0.0

        raw_occupied = occupied or moving or stationary
        existing = self._sensors.get(entity_id)
        was_room_occupied = self._is_room_occupied(room)
        self._clear_off_timer(entity_id)

        if raw_occupied:
            duration = float(existing.get("occupiedDuration") or 0) if existing else 0.0
            if existing and existing.get("lastChanged") and existing.get("rawOccupied"):
                duration += now - existing["lastChanged"]
            self._sensors[entity_id] = {
                "room": room,
                "entityId": entity_id,
                "sensorModel": model,
                "rawOccupied": True,
                "occupied": True,
                "stationary": stationary,
                "moving": moving,
                "distance": distance,
                "energy": energy,
                "lastChanged": now,
                "occupiedDuration": duration,
            }
            if not was_room_occupied:
                logger.info("👤 %s 人员入场 (%s)", room, model)
                await self._bus.emit(
                    "presence.roomChanged", {"room": room, "occupied": True, "sensor": model}
                )
            return

        self._sensors[entity_id] = {
            "room": room,
            "entityId": entity_id,
            "sensorModel": model,
            "rawOccupied": False,
            "occupied": True,
            "stationary": False,
            "moving": False,
            "distance": distance,
            "energy": 0.0,
            "lastChanged": now,
            "occupiedDuration": float(existing.get("occupiedDuration") or 0) if existing else 0.0,
        }
        self._off_timers[entity_id] = asyncio.get_running_loop().create_task(
            self._off_timeout(entity_id, room, model)
        )

    async def _off_timeout(self, entity_id: str, room: str, model: str) -> None:
        try:
            await asyncio.sleep(OCCUPIED_TIMEOUT_SECONDS)
        except asyncio.CancelledError:
            return
        current = self._sensors.get(entity_id)
        if not current or current.get("rawOccupied"):
            return
        current["occupied"] = False
        current["occupiedDuration"] = 0.0
        self._sensors[entity_id] = current
        self._off_timers.pop(entity_id, None)
        if not self._is_room_occupied(room):
            logger.info("🚶 %s 人员离场 (%s)", room, model)
            await self._bus.emit(
                "presence.roomChanged", {"room": room, "occupied": False, "sensor": model}
            )

    def _clear_off_timer(self, entity_id: str) -> None:
        task = self._off_timers.pop(entity_id, None)
        if task is not None:
            task.cancel()

    def _is_room_occupied(self, room: str) -> bool:
        return any(s.get("room") == room and s.get("occupied") for s in self._sensors.values())

    def _fuse_room(self, room: str) -> dict[str, Any] | None:
        in_room = [s for s in self._sensors.values() if s.get("room") == room]
        if not in_room:
            return None
        occupied = any(s.get("occupied") for s in in_room)
        primary = max(in_room, key=lambda s: s.get("lastChanged") or 0)
        return {
            "occupied": occupied,
            "stationary": occupied and any(s.get("stationary") for s in in_room),
            "moving": occupied and any(s.get("moving") for s in in_room),
            "sensorModel": primary.get("sensorModel"),
            "distance": primary.get("distance"),
            "duration": round(max(float(s.get("occupiedDuration") or 0) for s in in_room)),
            "sensorCount": len(in_room),
        }

    @staticmethod
    def _identify_model(entity_id: str, attrs: dict[str, Any]) -> str | None:
        lowered = entity_id.lower()
        device_class = str(attrs.get("device_class") or "")
        model = str(attrs.get("model") or "").lower()

        if "ld2450" in lowered or "ld2450" in model:
            return "ld2450"
        if "ld2410" in lowered or "ld2410" in model or "hlk" in model:
            return "ld2410"
        if "ld1115" in lowered or "ld1115" in model:
            return "ld1115"
        if "fp2" in lowered or "fp2" in model or ("aqara" in lowered and "fp" in lowered):
            return "aqara_fp2"
        if "fp1" in lowered or "fp1" in model or "aqara_fp" in model:
            return "aqara_fp1"
        if "tuya" in lowered and (
            "presence" in lowered or "mmwave" in lowered or "人体" in entity_id
        ):
            return "tuya_mmwave"
        if "mmwave" in lowered or "presence_sensor" in lowered or "人体存在" in entity_id:
            if device_class in ("motion", "occupancy", "presence"):
                return "generic_mmwave"
        return None

    @staticmethod
    def _infer_room(entity_id: str, _attrs: dict[str, Any]) -> str:
        from_catalog = infer_room_id_from_entity_id(entity_id)
        if from_catalog:
            return from_catalog
        import re

        sensor_name = re.sub(r"^(binary_sensor|sensor)\.", "", entity_id)
        return re.sub(
            r"_(presence|mmwave|occupancy|motion|ld2410|ld2450|fp1|fp2)$", "", sensor_name, flags=re.IGNORECASE
        )

    def get_all_room_presence(self) -> dict[str, dict[str, Any]]:
        rooms = {s.get("room") for s in self._sensors.values()}
        result: dict[str, dict[str, Any]] = {}
        for room in rooms:
            fused = self._fuse_room(str(room))
            if fused:
                result[str(room)] = fused
        return result

    def get_room_presence(self, room: str) -> dict[str, Any] | None:
        return self._fuse_room(room)

    def get_summary(self) -> dict[str, Any]:
        all_rooms = self.get_all_room_presence()
        occupied = [room for room, value in all_rooms.items() if value.get("occupied")]
        return {
            "totalRooms": len(all_rooms),
            "occupiedRooms": len(occupied),
            "vacantRooms": len(all_rooms) - len(occupied),
            "rooms": all_rooms,
            "homeOccupied": len(occupied) > 0,
            "timestamp": _iso_now(),
        }


def _parse_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _iso_now() -> str:
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
