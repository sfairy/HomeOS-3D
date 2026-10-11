"""地震模块（EEW / 台网目录）类型与常量（对齐 ``modules/earthquake/types.ts``）。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

#: EEW 事件名常量（用于事件总线广播）。
EEW_EVENTS: dict[str, str] = {
    "ALERT": "earthquake.alert",
    "CONFIRMATION": "earthquake.confirmation",
}

#: CENC 目录事件通知的冷却键前缀。
EEW_CATALOG_COOLDOWN_PREFIX = "earthquake_cenc:"


def eew_catalog_cooldown_key(event_id: str) -> str:
    """构造 CENC 目录事件的通知冷却键。"""
    return f"{EEW_CATALOG_COOLDOWN_PREFIX}{event_id}"


@dataclass
class EewRawMessage:
    """EEW 原始消息：WolfX WebSocket / HTTP JSON 解析归一化结果。"""

    event_id: str
    origin_time: float
    latitude: float
    longitude: float
    magnitude: float
    depth: float = 0.0
    epicenter: str = "未知震中"
    type: str = "eew"
    source: str | None = None
    report_id: float = 0.0
    max_intensity: str | None = None


@dataclass
class EarthquakeRuntimeConfig:
    """EEW 运行时配置：由项目 layout 解析而来。"""

    enabled: bool = False
    home_lat: float | None = None
    home_lon: float | None = None
    max_distance: float = 500
    min_magnitude: float = 3
    min_local_intensity: float = 2
    countdown_lead_sec: int = 60


@dataclass
class EarthquakeAlertPayload:
    """下发给前端 / 通知的预警载荷。"""

    eventId: str
    latitude: float
    longitude: float
    originTime: float
    magnitude: float
    depth: float
    epicenter: str
    distance: float
    countdown: float
    localIntensity: float
    maxIntensity: str | None = None
    alertKind: str | None = None
    source: str | None = None

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "eventId": self.eventId,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "originTime": self.originTime,
            "magnitude": self.magnitude,
            "depth": self.depth,
            "epicenter": self.epicenter,
            "distance": self.distance,
            "countdown": self.countdown,
            "localIntensity": self.localIntensity,
        }
        if self.maxIntensity is not None:
            payload["maxIntensity"] = self.maxIntensity
        if self.alertKind is not None:
            payload["alertKind"] = self.alertKind
        if self.source is not None:
            payload["source"] = self.source
        return payload

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> EarthquakeAlertPayload:
        return cls(
            eventId=str(data.get("eventId") or ""),
            latitude=float(data.get("latitude") or 0),
            longitude=float(data.get("longitude") or 0),
            originTime=float(data.get("originTime") or 0),
            magnitude=float(data.get("magnitude") or 0),
            depth=float(data.get("depth") or 0),
            epicenter=str(data.get("epicenter") or "未知震中"),
            distance=float(data.get("distance") or 0),
            countdown=float(data.get("countdown") or 0),
            localIntensity=float(data.get("localIntensity") or 0),
            maxIntensity=data.get("maxIntensity"),
            alertKind=data.get("alertKind"),
            source=data.get("source"),
        )


@dataclass
class EewEventFingerprint:
    """跨源去重指纹。"""

    eventId: str
    originTime: float
    latitude: float
    longitude: float
    magnitude: float


@dataclass
class EewDedupeState:
    """EEW 去重状态：当前激活事件 + 最近跨源指纹。"""

    activeEventId: str = ""
    lastMagnitude: float = 0
    recent: list[EewEventFingerprint] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "activeEventId": self.activeEventId,
            "lastMagnitude": self.lastMagnitude,
            "recent": [
                {
                    "eventId": fp.eventId,
                    "originTime": fp.originTime,
                    "latitude": fp.latitude,
                    "longitude": fp.longitude,
                    "magnitude": fp.magnitude,
                }
                for fp in self.recent
            ],
        }


__all__ = [
    "EEW_CATALOG_COOLDOWN_PREFIX",
    "EEW_EVENTS",
    "EarthquakeAlertPayload",
    "EarthquakeRuntimeConfig",
    "EewDedupeState",
    "EewEventFingerprint",
    "EewRawMessage",
    "eew_catalog_cooldown_key",
]
