"""地震预警状态管理工具（对齐 ``earthquake/state.util.ts``）。

合并 Redis 状态、Prisma 持久化、运行时配置解析、通知格式化四部分：
 - Redis 状态：最新预警、历史列表、已关闭事件、WolfX 主节点活跃标记、去重状态；
 - Prisma 持久化：预警历史写入 / 读取（PostgreSQL / SQLite）；
 - 运行时配置：从项目 layout 解析 EEW 阈值与家庭坐标；
 - 通知格式化：EEW / 目录速报文案与通知级别。
"""

from __future__ import annotations

import json
import logging
import math
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select

from ...core.models import EarthquakeAlertHistory
from ..push_time import format_time_only
from .feeds import is_valid_home_coordinate
from .geo import compute_s_wave_countdown, is_eew_simulation_event_id, normalize_eew_countdown_lead
from .threshold import evaluate_local_quake_thresholds
from .types import EarthquakeAlertPayload, EarthquakeRuntimeConfig, EewDedupeState, EewEventFingerprint

logger = logging.getLogger("homeos.earthquake")

# ── Redis 键名 ─────────────────────────────────────────────────────────
EEW_REDIS = {
    "latest": "homeos:eew:latest",
    "history": "homeos:eew:history",
    "dismissedPrefix": "homeos:eew:dismissed:",
    "wolfxActive": "homeos:eew:wolfx-active",
    "dedupe": "homeos:eew:dedupe",
}

LATEST_TTL_SEC = 300
DISMISSED_TTL_SEC = 3600
DEDUPE_TTL_SEC = 120
WOLFX_ACTIVE_TTL_SEC = 30
EEW_REDIS_HISTORY_MAX = 50
HISTORY_TTL_SEC = 86400 * 30
EEW_PRISMA_HISTORY_MAX = 200

#: 去重状态写入 Lua 脚本：时间戳保护，防止旧实例覆盖新实例状态。
DEDUPE_SET_SCRIPT = """
local existing = redis.call("get", KEYS[1])
if existing then
  local ok, parsed = pcall(cjson.decode, existing)
  if ok and type(parsed) == "table" and parsed.updatedAt and parsed.updatedAt > tonumber(ARGV[2]) then
    return 0
  end
end
redis.call("set", KEYS[1], ARGV[1], "ex", tonumber(ARGV[3]))
return 1
"""


def _now_ms() -> float:
    return datetime.now(UTC).timestamp() * 1000


def is_simulation_alert_record(record: dict[str, Any]) -> bool:
    """是否为模拟演练历史（source=test 或 eventId 以 test_ 开头）。"""
    if str(record.get("source") or "").strip() == "test":
        return True
    return is_eew_simulation_event_id(record.get("eventId"))


# ── Redis：最新预警 / 历史 / 已关闭 / 主节点活跃 / 去重 ────────────────


async def save_latest_alert_redis(redis: Any, payload: EarthquakeAlertPayload) -> None:
    if redis is None or not redis.is_ready():
        return
    data = {"payload": payload.to_dict(), "savedAt": _now_ms()}
    await redis.set(EEW_REDIS["latest"], json.dumps(data), LATEST_TTL_SEC)
    await _append_alert_history_redis(redis, payload)


async def _append_alert_history_redis(redis: Any, payload: EarthquakeAlertPayload) -> None:
    client = redis.get_client()
    if client is None:
        return
    entry = {"payload": payload.to_dict(), "savedAt": _now_ms()}
    await client.lpush(EEW_REDIS["history"], json.dumps(entry))
    await client.ltrim(EEW_REDIS["history"], 0, EEW_REDIS_HISTORY_MAX - 1)
    await client.expire(EEW_REDIS["history"], HISTORY_TTL_SEC)


async def load_alert_history_redis(redis: Any, limit: int = 30) -> list[dict[str, Any]]:
    if redis is None:
        return []
    client = redis.get_client()
    if client is None:
        return []
    raw = await client.lrange(EEW_REDIS["history"], 0, max(0, limit - 1))
    out: list[dict[str, Any]] = []
    for row in raw:
        try:
            parsed = json.loads(row)
        except (ValueError, TypeError):
            continue
        payload = parsed.get("payload") if isinstance(parsed, dict) else None
        if isinstance(payload, dict) and payload.get("eventId"):
            out.append(parsed)
    return out


async def delete_simulation_history_redis(redis: Any, event_id: str | None = None) -> int:
    if redis is None:
        return 0
    client = redis.get_client()
    if client is None:
        return 0
    raw = await client.lrange(EEW_REDIS["history"], 0, -1)
    if not raw:
        return 0

    keep: list[Any] = []
    removed = 0
    target_id = (event_id or "").strip()
    for row in raw:
        try:
            parsed = json.loads(row)
            payload = parsed.get("payload") if isinstance(parsed, dict) else None
            if not isinstance(payload, dict) or not payload.get("eventId"):
                keep.append(row)
                continue
            match = (
                payload["eventId"] == target_id and is_simulation_alert_record(payload)
                if target_id
                else is_simulation_alert_record(payload)
            )
            if match:
                removed += 1
                continue
            keep.append(row)
        except (ValueError, TypeError):
            keep.append(row)

    if not removed:
        return 0
    await client.delete(EEW_REDIS["history"])
    if keep:
        for row in reversed(keep):
            await client.lpush(EEW_REDIS["history"], row)
        await client.expire(EEW_REDIS["history"], HISTORY_TTL_SEC)
    return removed


async def load_latest_alert_redis(redis: Any) -> dict[str, Any] | None:
    if redis is None or not redis.is_ready():
        return None
    raw = await redis.get(EEW_REDIS["latest"])
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (ValueError, TypeError):
        return None
    payload = parsed.get("payload") if isinstance(parsed, dict) else None
    if not isinstance(payload, dict) or not payload.get("eventId"):
        return None
    return parsed


async def is_event_dismissed_redis(redis: Any, event_id: str) -> bool:
    if redis is None or not redis.is_ready() or not event_id:
        return False
    val = await redis.get(f"{EEW_REDIS['dismissedPrefix']}{event_id}")
    if isinstance(val, bytes):
        val = val.decode("utf-8", "ignore")
    return val == "1"


async def mark_event_dismissed_redis(redis: Any, event_id: str) -> None:
    if redis is None or not redis.is_ready() or not event_id:
        return
    await redis.set(f"{EEW_REDIS['dismissedPrefix']}{event_id}", "1", DISMISSED_TTL_SEC)


async def clear_latest_alert_redis(redis: Any, event_id: str) -> None:
    if redis is None or not redis.is_ready():
        return
    stored = await load_latest_alert_redis(redis)
    payload = stored.get("payload") if isinstance(stored, dict) else None
    if isinstance(payload, dict) and payload.get("eventId") == event_id:
        client = redis.get_client()
        if client is not None:
            await client.delete(EEW_REDIS["latest"])


async def touch_wolfx_leader_active(redis: Any) -> None:
    if redis is None or not redis.is_ready():
        return
    await redis.set(EEW_REDIS["wolfxActive"], str(int(_now_ms())), WOLFX_ACTIVE_TTL_SEC)


async def is_wolfx_cluster_active(redis: Any) -> bool:
    if redis is None or not redis.is_ready():
        return False
    val = await redis.get(EEW_REDIS["wolfxActive"])
    if isinstance(val, bytes):
        val = val.decode("utf-8", "ignore")
    return val is not None and val != ""


async def load_dedupe_state_redis(redis: Any) -> EewDedupeState | None:
    if redis is None or not redis.is_ready():
        return None
    raw = await redis.get(EEW_REDIS["dedupe"])
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (ValueError, TypeError):
        return None
    if not isinstance(parsed, dict):
        return None
    if not isinstance(parsed.get("activeEventId"), str) or parsed["activeEventId"] == "":
        return None
    last_magnitude = _num(parsed.get("lastMagnitude"))
    recent: list[EewEventFingerprint] = []
    if isinstance(parsed.get("recent"), list):
        for row in parsed["recent"]:
            if (
                isinstance(row, dict)
                and isinstance(row.get("eventId"), str)
                and math.isfinite(_num(row.get("originTime")))
                and math.isfinite(_num(row.get("latitude")))
                and math.isfinite(_num(row.get("longitude")))
                and math.isfinite(_num(row.get("magnitude")))
            ):
                recent.append(
                    EewEventFingerprint(
                        eventId=row["eventId"],
                        originTime=_num(row.get("originTime")),
                        latitude=_num(row.get("latitude")),
                        longitude=_num(row.get("longitude")),
                        magnitude=_num(row.get("magnitude")),
                    )
                )
    return EewDedupeState(
        activeEventId=parsed["activeEventId"],
        lastMagnitude=last_magnitude if math.isfinite(last_magnitude) else 0,
        recent=recent,
    )


async def save_dedupe_state_redis(
    redis: Any, state: EewDedupeState, updated_at: float | None = None
) -> None:
    if redis is None:
        return
    client = redis.get_client()
    if client is None:
        return
    stamp = _now_ms() if updated_at is None else updated_at
    value = json.dumps({**state.to_dict(), "updatedAt": stamp})
    try:
        await client.eval(
            DEDUPE_SET_SCRIPT, 1, EEW_REDIS["dedupe"], value, str(int(stamp)), str(DEDUPE_TTL_SEC)
        )
    except Exception:  # noqa: BLE001 - 老版本 Redis 无 eval/cjson 时降级为普通 set
        await redis.set(EEW_REDIS["dedupe"], value, DEDUPE_TTL_SEC)


async def clear_dedupe_state_redis(redis: Any, event_id: str) -> None:
    if redis is None or not redis.is_ready() or not event_id:
        return
    state = await load_dedupe_state_redis(redis)
    if state is not None and state.activeEventId == event_id:
        client = redis.get_client()
        if client is not None:
            await client.delete(EEW_REDIS["dedupe"])


# ── 持久化：预警历史（SQLite / PostgreSQL） ────────────────────────────


def append_alert_history_prisma(session_factory: Any, payload: EarthquakeAlertPayload) -> None:
    """将预警写入历史表，并清理超出上限的旧记录（单次最多 500 条）。"""
    with session_factory() as session:
        session.add(
            EarthquakeAlertHistory(
                event_id=payload.eventId,
                epicenter=payload.epicenter,
                magnitude=payload.magnitude,
                depth=payload.depth,
                latitude=payload.latitude,
                longitude=payload.longitude,
                origin_time=int(payload.originTime),
                distance=payload.distance,
                countdown=int(payload.countdown),
                local_intensity=payload.localIntensity,
                max_intensity=payload.maxIntensity,
                alert_kind=payload.alertKind,
                source=str(payload.source) if payload.source else None,
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


def format_eew_notify_message(payload: dict[str, Any] | Any) -> str:
    """格式化 EEW 预警 / 官方速报通知消息（面向用户）。"""
    data = payload.to_dict() if isinstance(payload, EarthquakeAlertPayload) else (payload or {})
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


def format_catalog_notify_message(item: dict[str, Any]) -> str:
    """格式化地震目录新增事件通知消息。"""
    magnitude = _num(item.get("magnitude"))
    mag_text = f"{magnitude:.1f}" if math.isfinite(magnitude) else "?"
    place = item.get("place") or "未知位置"
    depth = f"{item.get('depth')} km" if item.get("depth") is not None else "—"
    distance = f"，距家 {item.get('distanceKm')} km" if item.get("distanceKm") is not None else ""
    intensity = f"，烈度 {item.get('intensity')}" if item.get("intensity") is not None else ""
    origin = format_time_only(item.get("originTime"), "—")
    return (
        f"🌍 地震速报（官方正式测定·非预警）：发震时间 {origin}，{place} M{mag_text}，"
        f"深度 {depth}{distance}{intensity}"
    )


def resolve_catalog_notify_level(item: dict[str, Any]) -> str:
    """根据震级、烈度、距离判定目录通知级别。"""
    magnitude = _num(item.get("magnitude"))
    intensity = _num(item.get("intensity"))
    if (math.isfinite(magnitude) and magnitude >= 6) or (
        math.isfinite(intensity) and intensity >= 7
    ):
        return "danger"
    distance = item.get("distanceKm")
    if (
        (math.isfinite(magnitude) and magnitude >= 4.5)
        or (math.isfinite(intensity) and intensity >= 5)
        or (distance is not None and distance <= 200)
    ):
        return "warn"
    return "info"


def should_notify_catalog_event(item: dict[str, Any], opts: dict[str, Any]) -> bool:
    """判断目录事件是否应触发通知 / 记入本地预警。"""
    if opts.get("mode") == "aligned":
        return bool(
            evaluate_local_quake_thresholds(
                {
                    "magnitude": item.get("magnitude"),
                    "latitude": item.get("latitude"),
                    "longitude": item.get("longitude"),
                    "distanceKm": item.get("distanceKm"),
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

    magnitude = _num(item.get("magnitude"))
    if not math.isfinite(magnitude) or magnitude < float(opts["minMagnitude"]):
        return False
    if not opts.get("homeConfigured") or opts.get("maxDistanceKm") is None:
        return True
    distance = item.get("distanceKm")
    if distance is None:
        return magnitude >= 4.5
    if distance <= opts["maxDistanceKm"]:
        return True
    return magnitude >= 5


def s_wave_countdown_for(item: dict[str, Any]) -> float:
    """基于目录事件计算横波倒计时（秒）。"""
    return compute_s_wave_countdown(float(item.get("distanceKm") or 0), float(item.get("originTime") or 0), _now_ms())


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
    "EEW_REDIS",
    "append_alert_history_prisma",
    "clear_dedupe_state_redis",
    "clear_latest_alert_redis",
    "delete_simulation_history_prisma",
    "delete_simulation_history_redis",
    "format_catalog_notify_message",
    "format_eew_notify_message",
    "is_event_dismissed_redis",
    "is_simulation_alert_record",
    "is_wolfx_cluster_active",
    "load_alert_history_prisma",
    "load_alert_history_redis",
    "load_dedupe_state_redis",
    "load_latest_alert_redis",
    "mark_event_dismissed_redis",
    "parse_earthquake_layout",
    "resolve_catalog_notify_level",
    "save_dedupe_state_redis",
    "save_latest_alert_redis",
    "should_notify_catalog_event",
    "s_wave_countdown_for",
    "touch_wolfx_leader_active",
]
