"""地震早期预警（EEW）评估工具（对齐 ``earthquake/eew-eval.util.ts``）。

按家庭坐标、震级、距离、烈度、倒计时等阈值判定是否触发预警；
处理同一事件重复上报与跨源（SC/CENC/Wolfx/USGS）指纹去重；
``countdown < -60`` 时改为「确认通报」而非丢弃。
"""

from __future__ import annotations

from typing import Any

from .geo import compute_s_wave_countdown, haversine_distance_km
from .threshold import evaluate_local_quake_thresholds
from .types import (
    EarthquakeAlertPayload,
    EarthquakeRuntimeConfig,
    EewDedupeState,
    EewEventFingerprint,
    EewRawMessage,
)

#: 同一事件两次预警之间震级变化的最小阈值（M）
MAGNITUDE_MERGE_THRESHOLD = 0.5
#: 跨源指纹：发震时刻窗口（秒）
CROSS_SOURCE_TIME_WINDOW_SEC = 120
#: 跨源指纹：震中距上限（km）
CROSS_SOURCE_DIST_KM = 50
#: 保留的最近指纹条数
RECENT_FINGERPRINT_MAX = 12


def _matches_cross_source_fingerprint(eew: EewRawMessage, fp: EewEventFingerprint) -> bool:
    if fp.eventId == eew.event_id:
        return False
    dt_sec = abs(eew.origin_time - fp.originTime) / 1000
    if dt_sec > CROSS_SOURCE_TIME_WINDOW_SEC:
        return False
    if abs(eew.magnitude - fp.magnitude) > MAGNITUDE_MERGE_THRESHOLD:
        return False
    dist = haversine_distance_km(eew.latitude, eew.longitude, fp.latitude, fp.longitude)
    return dist <= CROSS_SOURCE_DIST_KM


def _push_fingerprint(
    recent: list[EewEventFingerprint] | None, fp: EewEventFingerprint
) -> list[EewEventFingerprint]:
    next_list = [row for row in (recent or []) if row.eventId != fp.eventId]
    next_list.append(fp)
    return next_list[-RECENT_FINGERPRINT_MAX:]


def _fingerprint_of(eew: EewRawMessage) -> EewEventFingerprint:
    return EewEventFingerprint(
        eventId=eew.event_id,
        originTime=eew.origin_time,
        latitude=eew.latitude,
        longitude=eew.longitude,
        magnitude=eew.magnitude,
    )


def evaluate_eew_for_alert(
    eew: EewRawMessage,
    cfg: EarthquakeRuntimeConfig,
    dedupe: EewDedupeState,
    magnitude_merge_threshold: float = MAGNITUDE_MERGE_THRESHOLD,
) -> dict[str, Any]:
    """评估 EEW 是否应触发预警（不含 Redis / 已关闭事件等外部状态）。"""
    if not (eew.origin_time > 0):
        return {"kind": "skip", "message": f"⚠️ EEW originTime 无效 eventId={eew.event_id}"}

    if cfg.home_lat is None or cfg.home_lon is None:
        return {"kind": "skip", "message": "⚠️ 收到 EEW 但未设置家庭坐标"}

    prev_magnitude = dedupe.lastMagnitude
    magnitude_delta = abs(eew.magnitude - prev_magnitude)

    if eew.event_id == dedupe.activeEventId:
        if magnitude_delta <= magnitude_merge_threshold:
            # 保留既有 activeEventId 与「上次预警震级」：抑制上报不得污染震级升级基线。
            return {
                "kind": "suppress_duplicate",
                "message": "[去重] 震级变化 <= 0.5,抑制重复预警",
                "nextDedupe": dedupe,
            }

    for fp in dedupe.recent or []:
        if _matches_cross_source_fingerprint(eew, fp):
            return {
                "kind": "suppress_duplicate",
                "message": (
                    f"[跨源去重] 与 {fp.eventId} 时空相近,抑制重复预警"
                    f"(source={eew.source or eew.type or '?'})"
                ),
                # 保留原事件为 activeEventId（不把去重状态改绑到重复源），仅并入本事件指纹。
                "nextDedupe": EewDedupeState(
                    activeEventId=dedupe.activeEventId,
                    lastMagnitude=dedupe.lastMagnitude,
                    recent=_push_fingerprint(dedupe.recent, _fingerprint_of(eew)),
                ),
            }

    gate = evaluate_local_quake_thresholds(
        {
            "magnitude": eew.magnitude,
            "latitude": eew.latitude,
            "longitude": eew.longitude,
        },
        {
            "minMagnitude": cfg.min_magnitude,
            "maxDistanceKm": cfg.max_distance,
            "minLocalIntensity": cfg.min_local_intensity,
            "homeLat": cfg.home_lat,
            "homeLon": cfg.home_lon,
        },
    )
    distance = gate["distanceKm"]
    local_intensity = gate["localIntensity"]
    countdown = compute_s_wave_countdown(distance, eew.origin_time, _now_ms())

    analysis_log = f"📊 EEW 分析:距离={distance:.1f}km 倒计时={countdown:.1f}s 烈度={local_intensity}"

    if not gate["pass"]:
        return {"kind": "skip", "message": f"{gate['reason']},已跳过"}

    # 迟到台网数据：不再丢弃，改为确认通报（不全屏倒计时）
    alert_kind = "confirmation" if countdown < -60 else "early"
    late_log = (
        f"确认通报:倒计时 {countdown:.1f}s 已过 -60s(台网延迟到达)"
        if alert_kind == "confirmation"
        else ""
    )

    source = eew.source or (
        "cenc_eew"
        if eew.type and "cenc" in eew.type
        else "sc_eew"
        if eew.type and "sc" in eew.type
        else "wolfx"
    )

    alert_payload = EarthquakeAlertPayload(
        eventId=eew.event_id,
        latitude=eew.latitude,
        longitude=eew.longitude,
        originTime=eew.origin_time,
        magnitude=eew.magnitude,
        depth=eew.depth,
        epicenter=eew.epicenter,
        distance=round(distance * 10) / 10,
        countdown=round(countdown * 10) / 10,
        localIntensity=local_intensity,
        maxIntensity=eew.max_intensity or None,
        alertKind=alert_kind,
        source=source,
    )

    dedupe_log = (
        f"[去重] 震级变化 > 0.5({prev_magnitude} → {eew.magnitude}),重新触发预警"
        if eew.event_id == dedupe.activeEventId and magnitude_delta > magnitude_merge_threshold
        else ""
    )

    message = "\n".join(part for part in (dedupe_log, late_log, analysis_log) if part)

    return {
        "kind": "alert",
        "message": message,
        "alert": alert_payload,
        "nextDedupe": EewDedupeState(
            activeEventId=eew.event_id,
            lastMagnitude=eew.magnitude,
            recent=_push_fingerprint(dedupe.recent, _fingerprint_of(eew)),
        ),
    }


def _now_ms() -> float:
    from datetime import UTC, datetime

    return datetime.now(UTC).timestamp() * 1000


__all__ = [
    "CROSS_SOURCE_DIST_KM",
    "CROSS_SOURCE_TIME_WINDOW_SEC",
    "MAGNITUDE_MERGE_THRESHOLD",
    "RECENT_FINGERPRINT_MAX",
    "evaluate_eew_for_alert",
]
