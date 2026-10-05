"""WebRTC ICE 服务器构造与合并（对齐 common/utils/webrtc-ice.util.ts）。"""

from __future__ import annotations

import json
import re
from typing import Any

DEFAULT_STUN_SERVERS: list[dict[str, Any]] = [{"urls": "stun:stun.l.google.com:19302"}]


def _parse_ice_urls(ice_urls: str | None) -> list[str]:
    if not ice_urls or not ice_urls.strip():
        return []
    return [part.strip() for part in re.split(r"[,;\n]+", ice_urls) if part.strip()]


def build_ice_servers_from_config(webrtc: dict[str, Any] | None) -> list[dict[str, Any]]:
    config = webrtc if isinstance(webrtc, dict) else {}
    urls = _parse_ice_urls(config.get("iceUrls"))
    if not urls:
        return []
    username = (config.get("iceUsername") or "").strip() or None
    credential = (config.get("iceCredential") or "").strip() or None
    if username:
        entry: dict[str, Any] = {"urls": urls, "username": username}
        if credential:
            entry["credential"] = credential
        return [entry]
    return [{"urls": url} for url in urls]


def merge_ice_servers(*lists: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for entries in lists:
        for entry in entries or []:
            if not isinstance(entry, dict) or not entry.get("urls"):
                continue
            key = json.dumps(entry, sort_keys=True, ensure_ascii=False)
            if key in seen:
                continue
            seen.add(key)
            out.append(entry)
    return out


def extract_ha_ice_servers(ha_config: dict[str, Any]) -> list[dict[str, Any]]:
    conf = ha_config.get("configuration")
    if not isinstance(conf, dict):
        return []
    servers = conf.get("iceServers")
    if not isinstance(servers, list):
        return []
    return [entry for entry in servers if isinstance(entry, dict)]


def merge_ha_client_config_with_ice(
    ha_config: dict[str, Any], extra_ice: list[dict[str, Any]]
) -> dict[str, Any]:
    merged = merge_ice_servers(extract_ha_ice_servers(ha_config), extra_ice, DEFAULT_STUN_SERVERS)
    prev_conf = ha_config.get("configuration")
    configuration = {**(prev_conf if isinstance(prev_conf, dict) else {}), "iceServers": merged}
    return {**ha_config, "configuration": configuration}
