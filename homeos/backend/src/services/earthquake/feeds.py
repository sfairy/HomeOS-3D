"""地震数据源解析工具（对齐 ``earthquake/feeds.util.ts``）。

- 解析 CENC（中国地震台网）目录：CEIC speedsearch 接口 + WolfX CENC 列表；
- 解析 USGS GeoJSON 全球地震目录；
- 解析 WolfX WebSocket EEW 消息为内部 :class:`EewRawMessage`；
- 统一地震时间字符串为 UTC 毫秒时间戳（JMA 源 UTC+9，中国源 UTC+8）。
"""

from __future__ import annotations

import json
import math
import re
from datetime import UTC, datetime
from typing import Any

from .geo import haversine_distance_km, is_valid_home_coordinate
from .types import EewRawMessage

# ── CENC feed ──────────────────────────────────────────────────────────
WOLFX_CENC_EQ_LIST_URL = "https://api.wolfx.jp/cenc_eqlist.json"
CEIC_SPEEDSEARCH_BASE = "http://www.ceic.ac.cn/ajax/speedsearch?num="

_PERIOD_MS = {
    "hour": 60 * 60 * 1000,
    "day": 24 * 60 * 60 * 1000,
    "week": 7 * 24 * 60 * 60 * 1000,
    "month": 30 * 24 * 60 * 60 * 1000,
}


def _now_ms() -> float:
    return datetime.now(UTC).timestamp() * 1000


def _resolve_ceic_speedsearch_num(period: str) -> int:
    if period in ("hour", "day"):
        return 1
    if period == "week":
        return 3
    if period == "month":
        return 4
    return 1


def resolve_ceic_speedsearch_url(period: str) -> str:
    return f"{CEIC_SPEEDSEARCH_BASE}{_resolve_ceic_speedsearch_num(period)}"


def _period_cutoff_ms(period: str, now: float | None = None) -> float:
    base = _now_ms() if now is None else now
    return base - _PERIOD_MS.get(period, _PERIOD_MS["day"])


def parse_ceic_speedsearch_text(text: str) -> list[dict[str, Any]]:
    """解析 CEIC speedsearch 的 JSONP 文本（外层括号包裹）。"""
    trimmed = str(text or "").strip()
    if not trimmed.startswith("(") or not trimmed.endswith(")"):
        return []
    try:
        inner = trimmed[1:-1]
        inner = re.sub(r',"page":"(.*?)","num":', ',"num":', inner, count=1)
        parsed = json.loads(inner)
        shuju = parsed.get("shuju") if isinstance(parsed, dict) else None
        if not isinstance(shuju, list):
            return []
        return [row for row in shuju if isinstance(row, dict)]
    except (ValueError, TypeError):
        return []


def parse_ceic_speedsearch(rows: list[dict[str, Any]], opts: dict[str, Any]) -> list[dict[str, Any]]:
    cutoff = _period_cutoff_ms(opts.get("period", "day"), opts.get("now"))
    items: list[dict[str, Any]] = []
    limit = int(opts.get("limit", 50))
    min_magnitude = float(opts.get("minMagnitude", 3))
    for row in rows:
        parsed = _parse_ceic_row(row, opts.get("homeLat"), opts.get("homeLon"))
        if not parsed:
            continue
        if parsed["originTime"] < cutoff:
            continue
        if parsed["magnitude"] < min_magnitude:
            continue
        items.append(parsed)
        if len(items) >= limit:
            break
    return items


def _parse_ceic_row(
    row: dict[str, Any], home_lat: Any, home_lon: Any
) -> dict[str, Any] | None:
    magnitude = _num(row.get("M"))
    latitude = _num(row.get("EPI_LAT"))
    longitude = _num(row.get("EPI_LON"))
    if not (math.isfinite(magnitude) and math.isfinite(latitude) and math.isfinite(longitude)):
        return None

    origin_time = parse_wolfx_time_ms(row.get("O_TIME"), "cenc")
    report_time = parse_wolfx_time_ms(row.get("SAVE_TIME") or row.get("O_TIME"), "cenc")
    depth = _num(row.get("EPI_DEPTH"))
    new_did = str(row.get("NEW_DID")).strip() if row.get("NEW_DID") is not None else ""
    place = str(row.get("LOCATION_C") or "未知位置").strip()
    event_id = new_did or f"{origin_time}-{latitude}-{longitude}"

    return {
        "id": event_id,
        "magnitude": round(magnitude * 10) / 10,
        "magType": "M",
        "place": place,
        "latitude": latitude,
        "longitude": longitude,
        "depth": round(depth * 10) / 10 if math.isfinite(depth) else 0,
        "originTime": origin_time,
        "updatedTime": report_time or origin_time,
        "url": f"https://www.ceic.ac.cn/{new_did}.html" if new_did else "",
        "tsunami": False,
        "status": "reviewed",
        "intensity": None,
        "distanceKm": _distance_km(home_lat, home_lon, latitude, longitude),
    }


def parse_cenc_wolfx_eqlist(body: Any, opts: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(body, dict):
        return []
    entries = [val for key, val in body.items() if key != "md5" and isinstance(val, dict)]
    entries.sort(key=lambda row: parse_wolfx_time_ms(row.get("time"), "cenc"), reverse=True)

    cutoff = _period_cutoff_ms(opts.get("period", "day"), opts.get("now"))
    items: list[dict[str, Any]] = []
    limit = int(opts.get("limit", 50))
    min_magnitude = float(opts.get("minMagnitude", 3))
    for row in entries:
        parsed = _parse_cenc_wolfx_row(row, opts.get("homeLat"), opts.get("homeLon"))
        if not parsed:
            continue
        if parsed["originTime"] < cutoff:
            continue
        if parsed["magnitude"] < min_magnitude:
            continue
        items.append(parsed)
        if len(items) >= limit:
            break
    return items


def _parse_cenc_wolfx_row(
    row: dict[str, Any], home_lat: Any, home_lon: Any
) -> dict[str, Any] | None:
    magnitude = _num(row.get("magnitude"))
    latitude = _num(row.get("latitude"))
    longitude = _num(row.get("longitude"))
    if not (math.isfinite(magnitude) and math.isfinite(latitude) and math.isfinite(longitude)):
        return None

    origin_time = parse_wolfx_time_ms(row.get("time"), "cenc")
    updated_time = parse_wolfx_time_ms(row.get("ReportTime") or row.get("time"), "cenc")
    depth = _num(row.get("depth"))
    event_id = str(row.get("EventID") or "").strip()
    place = str(row.get("location") if row.get("location") is not None else row.get("placeName") or "未知位置").strip()
    intensity_raw = row.get("intensity")
    intensity = (
        _num(intensity_raw)
        if intensity_raw is not None and str(intensity_raw).strip() != ""
        else None
    )

    return {
        "id": event_id or f"{origin_time}-{latitude}-{longitude}",
        "magnitude": round(magnitude * 10) / 10,
        "magType": "M",
        "place": place,
        "latitude": latitude,
        "longitude": longitude,
        "depth": round(depth * 10) / 10 if math.isfinite(depth) else 0,
        "originTime": origin_time,
        "updatedTime": updated_time or origin_time,
        "url": "https://news.ceic.ac.cn/",
        "tsunami": False,
        "status": str(row.get("type") or "reviewed"),
        "intensity": intensity if intensity is not None and math.isfinite(intensity) else None,
        "distanceKm": _distance_km(home_lat, home_lon, latitude, longitude),
    }


# ── USGS global feed ───────────────────────────────────────────────────
USGS_FEED_BASE = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary"
_PERIOD_PATH = {
    "hour": "all_hour.geojson",
    "day": "all_day.geojson",
    "week": "all_week.geojson",
}


def resolve_usgs_feed_url(period: str, min_magnitude: float = 4) -> str:
    if period == "month":
        mag = min_magnitude if math.isfinite(_num(min_magnitude)) else 4
        tier = "4.5" if mag >= 4.5 else "2.5" if mag >= 2.5 else "1.0"
        return f"{USGS_FEED_BASE}/{tier}_month.geojson"
    return f"{USGS_FEED_BASE}/{_PERIOD_PATH.get(period, _PERIOD_PATH['day'])}"


def normalize_global_period(raw: Any) -> str:
    value = str(raw or "day").lower()
    if value in ("hour", "day", "week", "month"):
        return value
    return "day"


def normalize_global_source(raw: Any) -> str:
    return "usgs" if str(raw or "cenc").lower() == "usgs" else "cenc"


def parse_usgs_geojson(body: Any, opts: dict[str, Any]) -> list[dict[str, Any]]:
    features = body.get("features") if isinstance(body, dict) else None
    if not isinstance(features, list):
        return []
    items: list[dict[str, Any]] = []
    limit = int(opts.get("limit", 50))
    min_magnitude = float(opts.get("minMagnitude", 4))
    for feature in features:
        parsed = _parse_usgs_feature(feature, opts.get("homeLat"), opts.get("homeLon"))
        if not parsed:
            continue
        if parsed["magnitude"] < min_magnitude:
            continue
        items.append(parsed)
        if len(items) >= limit:
            break
    return items


def _parse_usgs_feature(feature: Any, home_lat: Any, home_lon: Any) -> dict[str, Any] | None:
    if not isinstance(feature, dict):
        return None
    props = feature.get("properties")
    geometry = feature.get("geometry") if isinstance(feature.get("geometry"), dict) else {}
    coords = geometry.get("coordinates") if isinstance(geometry, dict) else None
    if not isinstance(props, dict) or not isinstance(coords, list) or len(coords) < 2:
        return None

    magnitude = _num(props.get("mag"))
    if not math.isfinite(magnitude):
        return None

    longitude = _num(coords[0])
    latitude = _num(coords[1])
    depth = _num(coords[2]) if len(coords) > 2 else 0
    if not (math.isfinite(latitude) and math.isfinite(longitude)):
        return None

    origin_time = _num(props.get("time"))
    updated_time = _num(props.get("updated")) if props.get("updated") is not None else origin_time
    event_id = str(feature.get("id") or props.get("code") or props.get("ids") or f"{origin_time}-{latitude}").strip()

    return {
        "id": event_id,
        "magnitude": round(magnitude * 10) / 10,
        "magType": str(props.get("magType") or "ml"),
        "place": str(props.get("place") or props.get("title") or "未知位置"),
        "latitude": latitude,
        "longitude": longitude,
        "depth": round(depth * 10) / 10 if math.isfinite(depth) else 0,
        "originTime": origin_time if math.isfinite(origin_time) else 0,
        "updatedTime": updated_time if math.isfinite(updated_time) else origin_time,
        "url": str(props.get("url") or ""),
        "tsunami": _num(props.get("tsunami")) == 1,
        "status": str(props.get("status") or ""),
        "intensity": None,
        "distanceKm": _distance_km(home_lat, home_lon, latitude, longitude),
    }


# ── WolfX parse ────────────────────────────────────────────────────────
JMA_EEW_TYPES = {"jma_eew"}
_DATE_TIME_RE = re.compile(
    r"^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[:\s]+(\d{1,2}):(\d{2}):(\d{2})$"
)


def read_bool(value: Any) -> bool:
    return value is True or value == "true" or value == 1 or value == "1"


def parse_wolfx_time_ms(value: Any, kind: str) -> float:
    """解析 Wolfx OriginTime / ReportTime 为 UTC 毫秒时间戳。"""
    if value is None or value == "":
        return 0

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        num = float(value)
        if not math.isfinite(num):
            return 0
        if num > 1e12:
            return round(num)
        if num > 1e9:
            return round(num * 1000)
        return 0

    text = str(value).strip()
    if not text:
        return 0

    match = _DATE_TIME_RE.match(text)
    if match:
        year, month, day, hour, minute, second = (int(part) for part in match.groups())
        offset_hours = 9 if str(kind).lower() in JMA_EEW_TYPES else 8
        moment = datetime(year, month, day, hour, minute, second, tzinfo=UTC)
        return (moment.timestamp() - offset_hours * 3600) * 1000

    try:
        iso = datetime.fromisoformat(text)
        if iso.tzinfo is None:
            iso = iso.replace(tzinfo=UTC)
        return iso.timestamp() * 1000
    except ValueError:
        pass

    num = _num(text)
    if not math.isfinite(num):
        return 0
    if num > 1e12:
        return round(num)
    if num > 1e9:
        return round(num * 1000)
    return 0


def is_wolfx_cancelled(msg: dict[str, Any]) -> bool:
    return (
        read_bool(msg.get("isCancel"))
        or read_bool(msg.get("IsCancel"))
        or read_bool(msg.get("cancel"))
        or "cancel" in str(msg.get("Issue.Status") or "").lower()
    )


def _is_wolfx_training(msg: dict[str, Any]) -> bool:
    if read_bool(msg.get("isTraining")) or read_bool(msg.get("IsTraining")) or read_bool(msg.get("isDrill")):
        return True
    status = str(msg.get("Issue.Status") or msg.get("issueStatus") or msg.get("CodeType") or "").lower()
    return any(token in status for token in ("training", "train", "试验", "训练", "演练"))


def read_number(value: Any) -> float:
    num = _num(value)
    return num if math.isfinite(num) else 0


def _read_epicenter(msg: dict[str, Any]) -> str:
    raw = (
        msg.get("epicenter")
        if msg.get("epicenter") is not None
        else msg.get("Epicenter")
        if msg.get("Epicenter") is not None
        else msg.get("HypoCenter")
        if msg.get("HypoCenter") is not None
        else msg.get("hypoCenter")
        if msg.get("hypoCenter") is not None
        else msg.get("location")
        if msg.get("location") is not None
        else msg.get("region")
        if msg.get("region") is not None
        else msg.get("Title")
    )
    text = str(raw).strip() if raw is not None else ""
    return text or "未知震中"


def _read_max_intensity(msg: dict[str, Any]) -> str | None:
    raw = msg.get("maxIntensity")
    if raw is None:
        raw = msg.get("MaxIntensity")
    if raw is None:
        raw = msg.get("intensity")
    if raw is None or raw == "":
        return None
    return str(raw)


def _infer_wolfx_source(type_lower: str) -> str:
    if "cenc" in type_lower:
        return "cenc_eew"
    if "sc_" in type_lower or type_lower == "sc_eew" or "sichuan" in type_lower:
        return "sc_eew"
    if "usgs" in type_lower:
        return "usgs"
    return "wolfx"


def parse_wolfx_message(msg: dict[str, Any]) -> EewRawMessage | None:
    """将 WolfX WebSocket JSON 转为内部 :class:`EewRawMessage`。"""
    kind = str(msg.get("type") if msg.get("type") is not None else "eew")
    type_lower = kind.lower()

    if type_lower in ("heartbeat", "pong"):
        return None

    event_id = str(
        msg.get("eventId")
        if msg.get("eventId") is not None
        else msg.get("event_id")
        if msg.get("event_id") is not None
        else msg.get("EventID")
        or ""
    ).strip()
    if not event_id:
        return None

    if is_wolfx_cancelled(msg) or _is_wolfx_training(msg):
        return None

    hypocenter = msg.get("hypocenter") if isinstance(msg.get("hypocenter"), dict) else {}

    origin_time = parse_wolfx_time_ms(
        msg.get("originTime")
        if msg.get("originTime") is not None
        else msg.get("origin_time")
        if msg.get("origin_time") is not None
        else msg.get("OriginTime"),
        type_lower,
    )
    latitude = read_number(
        msg.get("latitude")
        if msg.get("latitude") is not None
        else msg.get("Latitude")
        if msg.get("Latitude") is not None
        else hypocenter.get("latitude")
    )
    longitude = read_number(
        msg.get("longitude")
        if msg.get("longitude") is not None
        else msg.get("Longitude")
        if msg.get("Longitude") is not None
        else hypocenter.get("longitude")
    )
    magnitude = read_number(
        msg.get("magnitude")
        if msg.get("magnitude") is not None
        else msg.get("Magnitude")
        if msg.get("Magnitude") is not None
        else msg.get("mag")
        if msg.get("mag") is not None
        else msg.get("Magunitude")
    )
    depth_raw = (
        msg.get("depth")
        if msg.get("depth") is not None
        else msg.get("Depth")
        if msg.get("Depth") is not None
        else hypocenter.get("depth")
    )
    depth = 0.0 if depth_raw is None else read_number(depth_raw)

    if not (math.isfinite(origin_time) and origin_time > 0):
        return None
    if abs(latitude) > 90 or abs(longitude) > 180:
        return None
    if magnitude <= 0:
        return None

    return EewRawMessage(
        type=kind,
        event_id=event_id,
        report_id=read_number(
            msg.get("reportId")
            if msg.get("reportId") is not None
            else msg.get("report_id")
            if msg.get("report_id") is not None
            else msg.get("ReportNum")
            if msg.get("ReportNum") is not None
            else msg.get("Serial")
        ),
        origin_time=origin_time,
        latitude=latitude,
        longitude=longitude,
        magnitude=magnitude,
        depth=depth,
        epicenter=_read_epicenter(msg),
        max_intensity=_read_max_intensity(msg),
        source=_infer_wolfx_source(type_lower),
    )


def parse_wolfx_eew_http_json(body: Any, source: str) -> EewRawMessage | None:
    """Wolfx SC / CENC EEW HTTP JSON → :class:`EewRawMessage`。"""
    if not isinstance(body, dict):
        return None
    if not body:
        return None
    with_type = {**body, "type": str(body.get("type") or source)}
    parsed = parse_wolfx_message(with_type)
    if not parsed:
        return None
    parsed.source = source
    parsed.type = source
    return parsed


def parse_usgs_feature_as_eew(feature: Any) -> EewRawMessage | None:
    """USGS GeoJSON feature → :class:`EewRawMessage`（兜底）。"""
    if not isinstance(feature, dict):
        return None
    props = feature.get("properties")
    geometry = feature.get("geometry") if isinstance(feature.get("geometry"), dict) else {}
    coords = geometry.get("coordinates") if isinstance(geometry, dict) else None
    if not isinstance(props, dict) or not isinstance(coords, list) or len(coords) < 2:
        return None

    magnitude = _num(props.get("mag"))
    longitude = _num(coords[0])
    latitude = _num(coords[1])
    depth = _num(coords[2]) if len(coords) > 2 else 0
    origin_time = _num(props.get("time"))
    if not (math.isfinite(magnitude) and magnitude > 0):
        return None
    if not (math.isfinite(latitude) and math.isfinite(longitude)):
        return None
    if not (math.isfinite(origin_time) and origin_time > 0):
        return None

    event_id = str(feature.get("id") or props.get("code") or f"{origin_time}-{latitude}").strip()
    if not event_id:
        return None

    return EewRawMessage(
        type="usgs",
        source="usgs",
        event_id=f"usgs_{event_id}",
        origin_time=origin_time,
        latitude=latitude,
        longitude=longitude,
        magnitude=round(magnitude * 10) / 10,
        depth=round(depth * 10) / 10 if math.isfinite(depth) else 0,
        epicenter=str(props.get("place") or props.get("title") or "未知震中"),
    )


def _distance_km(home_lat: Any, home_lon: Any, latitude: float, longitude: float) -> float | None:
    if home_lat is None or home_lon is None:
        return None
    lat_f, lon_f = _num(home_lat), _num(home_lon)
    if not (math.isfinite(lat_f) and math.isfinite(lon_f)):
        return None
    return round(haversine_distance_km(lat_f, lon_f, latitude, longitude))


def _num(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float("nan")


__all__ = [
    "WOLFX_CENC_EQ_LIST_URL",
    "is_valid_home_coordinate",
    "is_wolfx_cancelled",
    "normalize_global_period",
    "normalize_global_source",
    "parse_ceic_speedsearch",
    "parse_ceic_speedsearch_text",
    "parse_cenc_wolfx_eqlist",
    "parse_usgs_feature_as_eew",
    "parse_usgs_geojson",
    "parse_wolfx_eew_http_json",
    "parse_wolfx_message",
    "parse_wolfx_time_ms",
    "read_bool",
    "read_number",
    "resolve_ceic_speedsearch_url",
    "resolve_usgs_feed_url",
]
