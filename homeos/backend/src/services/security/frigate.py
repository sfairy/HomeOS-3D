"""Frigate AI 摄像头集成（对齐 ``FrigateService``）。

监控 HA 中的 Frigate 实体，维护检测事件历史与摄像头在线状态；配置的布防模式下
将人物检测转换为 ``security.alarm``。检测历史写 Redis（48h TTL），已确认事件落 RuntimeKv。
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable
from typing import Any

from .bus import LocalEventBus
from .dismissed import load_dismissed_id_set, persist_dismissed_id_set

logger = logging.getLogger("homeos.security.frigate")

FRIGATE_DISMISSED_ID = "security-frigate-dismissed"
RECENT_EVENTS_KEY = "homeos:frigate:recentEvents"

_KNOWN_LABELS = [
    "person", "car", "dog", "cat", "bicycle", "motorcycle", "bus", "truck", "bird",
    "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
    "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard",
    "sports_ball", "kite", "baseball_bat", "baseball_glove", "skateboard", "surfboard",
    "tennis_racket", "bottle", "wine_glass", "cup", "fork", "knife", "spoon", "bowl",
    "banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot_dog", "pizza",
    "donut", "cake", "cell_phone", "mouse", "remote", "keyboard", "laptop", "microwave",
    "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors",
    "teddy_bear", "hair_drier", "toothbrush",
]


def parse_frigate_alarm_modes(raw: Any) -> list[str]:
    text = str(raw if raw is not None else "armed_away,armed_night").strip()
    if not text or text == "none":
        return []
    return [part.strip() for part in text.split(",") if part.strip()]


class FrigateService:
    def __init__(
        self,
        session_factory,
        bus: LocalEventBus,
        panel,
        config_reader: Callable[[], dict[str, Any]],
        redis,
    ) -> None:
        self._session_factory = session_factory
        self._bus = bus
        self._panel = panel
        self._config = config_reader
        self._redis = redis

        self._recent_events: list[dict[str, Any]] = []
        self._camera_status: dict[str, dict[str, Any]] = {}
        self._active_detections: dict[str, dict[str, Any]] = {}
        self._dedup_timestamps: dict[str, float] = {}
        self._dismissed_ids: set[str] = set()
        self._persist_task: asyncio.Task | None = None

    @property
    def _max_events(self) -> int:
        return int(self._config().get("frigateMaxEvents") or 50)

    @property
    def _dedup_ms(self) -> int:
        return int(self._config().get("frigateDedupMs") or 30_000)

    async def start(self) -> None:
        self._dismissed_ids = await asyncio.to_thread(
            load_dismissed_id_set, self._session_factory, FRIGATE_DISMISSED_ID
        )
        await self._restore_recent_events()

    async def _restore_recent_events(self) -> None:
        if not self._redis.is_ready():
            return
        try:
            raw = await self._redis.get(RECENT_EVENTS_KEY)
            if not raw:
                return
            parsed = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
            if not isinstance(parsed, list):
                return
            valid = [
                item
                for item in parsed
                if isinstance(item, dict)
                and isinstance(item.get("entityId"), str)
                and isinstance(item.get("timestamp"), str)
            ]
            if valid:
                self._recent_events = valid[: self._max_events]
                logger.info("已恢复 Frigate 检测历史: %s 条", len(self._recent_events))
        except Exception as exc:
            logger.debug("恢复 Frigate 检测历史失败: %s", exc)

    def _persist_recent_events(self) -> None:
        if self._persist_task is not None and not self._persist_task.done():
            return
        self._persist_task = asyncio.get_running_loop().create_task(self._flush_recent_events())

    async def _flush_recent_events(self) -> None:
        await asyncio.sleep(2)
        if not self._redis.is_ready():
            return
        try:
            await self._redis.set(
                RECENT_EVENTS_KEY,
                json.dumps(self._recent_events, ensure_ascii=False, default=str),
                48 * 3600,
            )
        except Exception as exc:
            logger.debug("Frigate 检测历史持久化失败: %s", exc)

    def _persist_dismissed(self) -> None:
        persist_dismissed_id_set(
            self._session_factory, "Frigate 已确认事件持久化", FRIGATE_DISMISSED_ID, self._dismissed_ids
        )

    async def handle_state_change(self, event: dict[str, Any]) -> None:
        entity_id = str(event.get("entity_id") or "")
        new_state = event.get("new_state") or {}
        state = new_state.get("state")
        attrs = new_state.get("attributes")
        if not state or not isinstance(attrs, dict):
            return

        lowered = entity_id.lower()
        if lowered.startswith("binary_sensor.") and "frigate" in lowered and state == "on":
            await self._process_detection(entity_id, attrs)
        if lowered.startswith("sensor.") and "frigate" in lowered and "score" in lowered:
            self._process_score_update(entity_id, state, attrs)
        if lowered.startswith("camera.") and "frigate" in lowered:
            camera_name = attrs.get("friendly_name") or entity_id
            self._camera_status[str(camera_name)] = {
                "online": state != "unavailable",
                "lastEvent": _iso_now(),
            }

    async def _process_detection(self, entity_id: str, attrs: dict[str, Any]) -> None:
        label = str(attrs.get("device_class") or self._extract_label(entity_id))
        score = _parse_float(attrs.get("confidence"))
        if score is None:
            score = _parse_float(attrs.get("score"))
        if score is None:
            score = _parse_float(attrs.get("top_score"))
        if score is None:
            score = 80.0
        import re

        camera = re.sub(
            r"_person$|_car$|_dog$|_cat$|_motion$", "", str(attrs.get("friendly_name") or entity_id)
        )

        dedup_key = f"{camera}:{label}"
        now = int(asyncio.get_running_loop().time() * 1000)
        last = self._dedup_timestamps.get(dedup_key)
        if last is not None and now - last < self._dedup_ms:
            return
        self._dedup_timestamps[dedup_key] = now

        snapshot = {
            "id": f"{camera}:{label}:{now}",
            "entityId": entity_id,
            "camera": camera,
            "label": label,
            "score": min(100.0, max(0.0, score)),
            "box": self._extract_box(attrs),
            "timestamp": _iso_now(),
            "snapshotUrl": attrs.get("entity_picture") or attrs.get("snapshot_url") or None,
            "clipUrl": attrs.get("clip_url") or None,
        }
        self._recent_events.insert(0, snapshot)
        if len(self._recent_events) > self._max_events:
            del self._recent_events[self._max_events :]
        self._persist_recent_events()
        self._active_detections[entity_id] = snapshot

        if score > 70:
            logger.info("Frigate 检测 [%s]: %s (%s%%)", camera, label, score)
            await self._bus.emit("frigate.detection", snapshot)

        if label == "person" and score > 75:
            current_mode = self._panel.get_mode()
            allowed = parse_frigate_alarm_modes(self._config().get("frigatePersonAlarmModes"))
            if not allowed or current_mode not in allowed:
                return
            await self._bus.emit(
                "security.alarm",
                {
                    "entityId": entity_id,
                    "friendlyName": f"{camera} 检测到人员",
                    "type": "frigate_person",
                    "zones": ["frigate"],
                    "zoneNames": f"{camera}",
                    "mode": current_mode,
                    "timestamp": snapshot["timestamp"],
                },
            )

    def _process_score_update(
        self, entity_id: str, state: Any, _attrs: dict[str, Any]
    ) -> None:
        detection_id = entity_id.replace("_score", "").replace("sensor.", "binary_sensor.")
        existing = self._active_detections.get(detection_id)
        if existing is not None:
            parsed = _parse_float(state)
            if parsed is not None:
                existing["score"] = parsed

    @staticmethod
    def _extract_label(entity_id: str) -> str:
        parts = entity_id.replace("binary_sensor.", "").split("_")
        for label in _KNOWN_LABELS:
            if label in parts:
                return label
        if "motion" in parts:
            return "motion"
        return parts[-1] if parts else "unknown"

    @staticmethod
    def _extract_box(attrs: dict[str, Any]) -> dict[str, float] | None:
        x = attrs.get("box_x", attrs.get("x", attrs.get("left")))
        y = attrs.get("box_y", attrs.get("y", attrs.get("top")))
        w = attrs.get("box_w", attrs.get("width", attrs.get("w")))
        h = attrs.get("box_h", attrs.get("height", attrs.get("h")))
        if x is not None and y is not None and w is not None and h is not None:
            return {"x": float(x), "y": float(y), "w": float(w), "h": float(h)}
        return None

    def ack_events(self, ids: list[str] | None) -> dict[str, Any]:
        count = 0
        for item in ids or []:
            value = str(item or "").strip()
            if value:
                self._dismissed_ids.add(value)
                count += 1
        self._persist_dismissed()
        return {"ok": True, "dismissed": count}

    def get_recent_events(self, limit: int = 20) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for event in self._recent_events:
            event_id = event.get("id") or f"{event.get('camera')}:{event.get('label')}:{event.get('timestamp')}"
            if event_id in self._dismissed_ids:
                continue
            out.append({**event, "id": event_id})
            if len(out) >= limit:
                break
        return out

    def get_active_detections(self) -> list[dict[str, Any]]:
        now = asyncio.get_running_loop().time() * 1000
        active: list[dict[str, Any]] = []
        for snapshot in self._active_detections.values():
            if now - _parse_iso_ms(snapshot.get("timestamp")) < 60_000:
                active.append(snapshot)
        return active

    def get_camera_summary(self) -> dict[str, Any]:
        cameras = [{"name": name, **status} for name, status in self._camera_status.items()]
        return {
            "cameras": cameras,
            "totalCameras": len(cameras),
            "onlineCount": sum(1 for c in cameras if c.get("online")),
            "recentDetections": self.get_recent_events(10),
        }


def _parse_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_iso_ms(value: Any) -> float:
    if not value:
        return 0.0
    from datetime import datetime

    try:
        return datetime.fromisoformat(str(value)).timestamp() * 1000
    except (TypeError, ValueError):
        return 0.0


def _iso_now() -> str:
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
