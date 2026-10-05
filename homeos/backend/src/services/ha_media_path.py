"""HA 媒体/流路径校验与 m3u8 改写（对齐 shared/ha/media-path.util.ts）。"""

from __future__ import annotations

import re
from urllib.parse import quote, urljoin, urlparse, urlsplit

from ..core.errors import api_error, bad_request

HA_MEDIA_PATH_ALLOWLIST = (
    "/api/camera_proxy",
    "/api/media_player_proxy",
    "/api/image_proxy",
    "/api/tts_proxy",
    "/local/",
    "/media/",
)
HA_STREAM_PATH_ALLOWLIST = ("/api/camera_proxy_stream", "/api/hls")


def _validate_ha_path(path: str, allowlist: tuple[str, ...]) -> str:
    clean_path = path if path.startswith("/") else f"/{path}"
    if (
        "://" in clean_path
        or clean_path.startswith("//")
        or ".." in clean_path
        or not any(clean_path.startswith(prefix) for prefix in allowlist)
    ):
        bad_request(api_error("HA_MEDIA_PATH_INVALID"))
    return clean_path


def validate_ha_media_path(path: str) -> str:
    return _validate_ha_path(path, HA_MEDIA_PATH_ALLOWLIST)


def validate_ha_stream_path(path: str) -> str:
    return _validate_ha_path(path, HA_STREAM_PATH_ALLOWLIST)


def build_ha_stream_fetch_headers(path: str) -> dict[str, str]:
    if _clean_path(path).startswith("/api/camera_proxy_stream"):
        return {"Accept": "multipart/x-mixed-replace, image/jpeg, */*"}
    return {}


def resolve_ha_media_proxy_cache_control(path: str) -> str:
    if _clean_path(path).startswith("/api/camera_proxy"):
        return "no-cache, no-store, must-revalidate"
    return "public, max-age=3600"


def is_ha_m3u8_path(path: str, content_type: str | None = None) -> bool:
    if re.search(r"\.m3u8(\?|$)", path, re.I):
        return True
    ct = (content_type or "").lower()
    return "mpegurl" in ct or "m3u8" in ct


def _clean_path(path: str) -> str:
    return (path if path.startswith("/") else f"/{path}").split("?")[0]


def _to_stream_proxy_url(ha_path: str) -> str:
    return f"/api/v1/ha/stream-proxy?path={quote(ha_path, safe='')}"


def _resolve_ha_hls_playlist_uri(uri: str, playlist_path: str) -> str | None:
    trimmed = uri.strip()
    if not trimmed:
        return None
    if trimmed.startswith(("http://", "https://")):
        parsed = urlparse(trimmed)
        if not parsed.path.startswith("/api/hls"):
            return None
        return f"{parsed.path}?{parsed.query}" if parsed.query else parsed.path
    if trimmed.startswith("/api/hls"):
        return trimmed
    if not playlist_path.startswith("/api/hls"):
        return None
    try:
        resolved = urljoin(f"http://ha.invalid{playlist_path}", trimmed)
        parsed = urlsplit(resolved)
        if not parsed.path.startswith("/api/hls"):
            return None
        query = parsed.query or (urlsplit(f"http://ha.invalid{playlist_path}").query)
        return f"{parsed.path}?{query}" if query else parsed.path
    except ValueError:
        return None


_URI_RE = re.compile(r'URI=(["\'])([^"\']+)\1', re.I)


def rewrite_ha_m3u8_for_proxy(playlist: str, playlist_path: str = "") -> str:
    out_lines: list[str] = []
    for line in playlist.split("\n"):
        trimmed = line.strip()
        if not trimmed:
            out_lines.append(line)
            continue
        if trimmed.startswith("#"):
            def _replace(match: re.Match[str]) -> str:
                ha_path = _resolve_ha_hls_playlist_uri(match.group(2), playlist_path)
                return f"URI={match.group(1)}{_to_stream_proxy_url(ha_path)}{match.group(1)}" if ha_path else match.group(0)

            out_lines.append(_URI_RE.sub(_replace, line))
            continue
        ha_path = _resolve_ha_hls_playlist_uri(trimmed, playlist_path)
        out_lines.append(_to_stream_proxy_url(ha_path) if ha_path else line)
    return "\n".join(out_lines)
