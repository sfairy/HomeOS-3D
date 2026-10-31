"""地震预警状态管理工具（对齐 ``earthquake/state.util.ts``）。

合并持久化、运行时配置解析、通知格式化三部分：
 - 持久化：预警历史写入 / 读取（PostgreSQL / SQLite）；
 - 运行时配置：从项目 layout 解析 EEW 阈值与家庭坐标；
 - 通知格式化：EEW / 目录速报文案与通知级别。
"""

from __future__ import annotations

import logging
import math
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select

from .feeds import is_valid_home_coordinate
from .geo import compute_s_wave_countdown, is_eew_simulation_event_id, normalize_eew_countdown_lead
from .threshold import evaluate_local_quake_thresholds
from .types import EarthquakeAlertPayload, EarthquakeRuntimeConfig
from ..notification.push_time import format_time_only
from ...platform.core.db.models import EarthquakeAlertHistory

logger = logging.getLogger("homeos.earthquake")

EEW_PRISMA_HISTORY_MAX = 200


def _now_ms() -> float:
    return datetime.now(UTC).timestamp() * 1000


def is_simulation_alert_record(record: dict[str, Any]) -> bool:
    """是否为模拟演练历史（source=test 或 eventId 以 test_ 开头）。"""
    if str(record.get("source") or "").strip() == "test":
        return True
    return is_eew_simulation_event_id(record.get("eventId"))


# ── 持久化：预警历史（SQLite / PostgreSQL） ────────────────────────────


def append_alert_history_prisma(session_factory: Any, event: EarthquakeAlertPayload) -> None:
    """将预警写入历史表，并清理超出上限的旧记录（单次最多 500 条）。"""
    with session_factory() as session:
        session.add(
            EarthquakeAlertHistory(
                event_id=event.eventId,
                epicenter=event.epicenter,
                magnitude=event.magnitude,
                depth=event.depth,
                latitude=event.latitude,
                longitude=event.longitude,
                origin_time=int(event.originTime),
                distance=event.distance,
                countdown=int(event.countdown),
                local_intensity=event.localIntensity,
                max_intensity=event.maxIntensity,
                alert_kind=event.alertKind,
                source=str(event.source) if event.source else None,
            )
        )
        session.commit()

        overflow = (
            session.execute(
                select(EarthquakeAlertHistory.id)
                .order_by(EarthquakeAlertHistory.saved_at.desc())
                .offset(EEW_PRISMA_HISTORY_MAX)
                .limit(500)
            )
            .scalars()
            .all()
        )
        if overflow:
            session.execute(
                delete(EarthquakeAlertHistory).where(EarthquakeAlertHistory.id.in_(list(overflow)))
            )
            session.commit()


def load_alert_history_prisma(session_factory: Any, limit: int = 50) -> list[dict[str, Any]]:
    capped = max(1, min(limit, EEW_PRISMA_HISTORY_MAX))
    with session_factory() as session:
        rows = (
            session.execute(
                select(EarthquakeAlertHistory)
                .order_by(EarthquakeAlertHistory.saved_at.desc())
                .limit(capped)
            )
            .scalars()
            .all()
        )
    return [
        {
            "eventId": row.event_id,
            "epicenter": row.epicenter,
            "magnitude": row.magnitude,
            "depth": row.depth,
            "latitude": row.latitude,
            "longitude": row.longitude,
            "originTime": float(row.origin_time),
            "distance": row.distance,
            "countdown": float(row.countdown),
            "localIntensity": row.local_intensity,
            "maxIntensity": row.max_intensity or None,
            "alertKind": row.alert_kind or None,
            "source": row.source or None,
            "savedAt": _to_ms(row.saved_at),
        }
        for row in rows
    ]


def delete_simulation_history_prisma(session_factory: Any, event_id: str | None = None) -> int:
    target_id = (event_id or "").strip()
    with session_factory() as session:
        if target_id:
            if not is_eew_simulation_event_id(target_id):
                return 0
            result = session.execute(
                delete(EarthquakeAlertHistory).where(EarthquakeAlertHistory.event_id == target_id)
            )
            session.commit()
            return int(result.rowcount or 0)

        result = session.execute(
            delete(EarthquakeAlertHistory).where(
                (EarthquakeAlertHistory.source == "test")
                | (EarthquakeAlertHistory.event_id.like("test_%"))
            )
        )
        session.commit()
        return int(result.rowcount or 0)


# ── 运行时配置 ─────────────────────────────────────────────────────────


def parse_earthquake_layout(layout: dict[str, Any]) -> EarthquakeRuntimeConfig:
    """从项目 layout 解析 EEW 运行时配置。"""
    nested_raw = layout.get("earthquakeConfig")
    nested = nested_raw if isinstance(nested_raw, dict) else {}
    enabled = nested.get("enabled") is True

    lat_raw = nested.get("latitude") if nested.get("latitude") is not None else layout.get("latitude")
    lon_raw = nested.get("longitude") if nested.get("longitude") is not None else layout.get("longitude")

    home_lat_raw = _num_or_none(lat_raw)
    home_lon_raw = _num_or_none(lon_raw)
    valid = is_valid_home_coordinate(home_lat_raw, home_lon_raw)

    max_distance = _num_or(nested.get("maxDistance"), _num_or(layout.get("eewMaxDistance"), 500))
    min_magnitude = _num_or(nested.get("minMagnitude"), _num_or(layout.get("eewMinMagnitude"), 3))
    min_local_intensity = _num_or(
        nested.get("minLocalIntensity"), _num_or(layout.get("eewMinLocalIntensity"), 2)
    )
    countdown_lead_raw = (
        nested.get("countdownLeadSec")
        if nested.get("countdownLeadSec") is not None
        else layout.get("eewCountdownLeadSec")
    )

    return EarthquakeRuntimeConfig(
        enabled=enabled,
        home_lat=home_lat_raw if valid else None,
        home_lon=home_lon_raw if valid else None,
        max_distance=max_distance if math.isfinite(max_distance) else 500,
        min_magnitude=min_magnitude if math.isfinite(min_magnitude) else 3,
        min_local_intensity=min_local_intensity if math.isfinite(min_local_intensity) else 2,
        countdown_lead_sec=normalize_eew_countdown_lead(countdown_lead_raw),
    )


# ── 通知格式化 ─────────────────────────────────────────────────────────


def format_eew_notify_message(event: dict[str, Any] | Any) -> str:
    """格式化 EEW 预警 / 官方速报通知消息（面向用户）。"""
    data = event.to_dict() if isinstance(event, EarthquakeAlertPayload) else (event or {})
    magnitude = _num(data.get("magnitude"))
    mag_text = f"{magnitude:.1f}" if math.isfinite(magnitude) else "?"
    place = data.get("epicenter") or "未知震中"
    distance = f"{data.get('distance')} km" if data.get("distance") is not None else "—"
    intensity = f"{data.get('localIntensity')} 度" if data.get("localIntensity") is not None else "—"
    origin = format_time_only(data.get("originTime"), "—")
    if data.get("alertKind") == "confirmation":
        return (
            f"🌍 地震速报（官方正式测定·非预警）：发震时间 {origin}，{place} "
            f"M{mag_text}，距您 {distance}，预估烈度 {intensity}"
        )
    countdown = f"{data.get('countdown')}s" if data.get("countdown") is not None else "—"
    return (
        f"🌍 地震预警：发震时间 {origin}，{place} M{mag_text}，距您 {distance}，"
        f"横波约 {countdown} 后到达，预估烈度 {intensity}"
    )


def format_catalog_notify_message(quake: dict[str, Any]) -> str:
    """格式化地震目录新增事件通知消息。"""
    magnitude = _num(quake.get("magnitude"))
    mag_text = f"{magnitude:.1f}" if math.isfinite(magnitude) else "?"
    place = quake.get("place") or "未知位置"
    depth = f"{quake.get('depth')} km" if quake.get("depth") is not None else "—"
    distance = f"，距家 {quake.get('distanceKm')} km" if quake.get("distanceKm") is not None else ""
    intensity = f"，烈度 {quake.get('intensity')}" if quake.get("intensity") is not None else ""
    origin = format_time_only(quake.get("originTime"), "—")
    return (
        f"🌍 地震速报（官方正式测定·非预警）：发震时间 {origin}，{place} M{mag_text}，"
        f"深度 {depth}{distance}{intensity}"
    )


def resolve_catalog_notify_level(quake: dict[str, Any]) -> str:
    """根据震级、烈度、距离判定目录通知级别。"""
    magnitude = _num(quake.get("magnitude"))
    intensity = _num(quake.get("intensity"))
    if (math.isfinite(magnitude) and magnitude >= 6) or (
        math.isfinite(intensity) and intensity >= 7
    ):
        return "danger"
    distance = quake.get("distanceKm")
    if (
        (math.isfinite(magnitude) and magnitude >= 4.5)
        or (math.isfinite(intensity) and intensity >= 5)
        or (distance is not None and distance <= 200)
    ):
        return "warn"
    return "info"


def should_notify_catalog_event(quake: dict[str, Any], opts: dict[str, Any]) -> bool:
    """判断目录事件是否应触发通知 / 记入本地预警。"""
    if opts.get("mode") == "aligned":
        return bool(
            evaluate_local_quake_thresholds(
                {
                    "magnitude": quake.get("magnitude"),
                    "latitude": quake.get("latitude"),
                    "longitude": quake.get("longitude"),
                    "distanceKm": quake.get("distanceKm"),
                    "depthKm": quake.get("depth"),
                },
                {
                    "minMagnitude": opts["minMagnitude"],
                    "maxDistanceKm": opts["maxDistanceKm"],
                    "minLocalIntensity": opts["minLocalIntensity"],
                    "homeLat": opts["homeLat"],
                    "homeLon": opts["homeLon"],
                },
            )["pass"]
        )

    magnitude = _num(quake.get("magnitude"))
    if not math.isfinite(magnitude) or magnitude < float(opts["minMagnitude"]):
        return False
    if not opts.get("homeConfigured") or opts.get("maxDistanceKm") is None:
        return True
    distance = quake.get("distanceKm")
    if distance is None:
        return magnitude >= 4.5
    if distance <= opts["maxDistanceKm"]:
        return True
    return magnitude >= 5


def s_wave_countdown_for(quake: dict[str, Any]) -> float:
    """基于目录事件计算横波倒计时（秒）。"""
    return compute_s_wave_countdown(float(quake.get("distanceKm") or 0), float(quake.get("originTime") or 0), _now_ms())


# ── 内部工具 ───────────────────────────────────────────────────────────


def _to_ms(value: Any) -> float:
    if isinstance(value, datetime):
        moment = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
        return moment.timestamp() * 1000
    return 0


def _num(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float("nan")


def _num_or(value: Any, fallback: float) -> float:
    if value is None or value == "":
        return fallback
    num = _num(value)
    return num if math.isfinite(num) else fallback


def _num_or_none(value: Any) -> float | None:
    if value is None or str(value).strip() == "":
        return None
    num = _num(value)
    return num if math.isfinite(num) else None


__all__ = [
    "append_alert_history_prisma",
    "delete_simulation_history_prisma",
    "format_catalog_notify_message",
    "format_eew_notify_message",
    "is_simulation_alert_record",
    "load_alert_history_prisma",
    "parse_earthquake_layout",
    "resolve_catalog_notify_level",
    "s_wave_countdown_for",
    "should_notify_catalog_event",
]
