"""Optional release discovery, isolated from licensing and editor startup."""

from __future__ import annotations

import asyncio
import json
import os
import random
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

import httpx
from fastapi import APIRouter, Request, Response

from .dependencies import CurrentUser

router = APIRouter()
RELEASE_ENDPOINTS = (
    "https://pay.habridge.cn/store/v1/updates/latest",
    "https://pay2.habridge.cn/store/v1/updates/latest",
)
WIKI_URL = "https://wiki.habridge.cn/updates.html"
CHECK_INTERVAL = 21600
MAX_CACHE_AGE = 86400
MAX_RESPONSE_BYTES = 32768


def stable_version(value: str) -> tuple[int, int, int] | None:
    if not isinstance(value, str) or not re.fullmatch(
        r"v?(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})", value
    ):
        return None
    return tuple(map(int, value.removeprefix("v").split(".")))


def release_value(payload: dict, channel: str) -> dict | None:
    if (
        not isinstance(payload, dict)
        or payload.get("product") != "homeos"
        or payload.get("channel") != channel
        or "release" not in payload
    ):
        raise ValueError("Unexpected release response")
    release = payload["release"]
    if release is None:
        return None
    if not isinstance(release, dict) or stable_version(release.get("version")) is None:
        raise ValueError("Invalid release version")
    entry_id = str(UUID(release["id"]))
    return {"id": entry_id, "version": release["version"]}


class UpdateChecker:
    def __init__(
        self,
        data_dir: Path,
        version: str,
        channel: str,
        *,
        enabled=True,
        transport=None,
        endpoints=RELEASE_ENDPOINTS,
        clock=time.time,
    ):
        self.version, self.channel, self.enabled = version, channel, enabled
        self.transport, self.endpoints, self.clock = transport, endpoints, clock
        self.path = data_dir / "cache" / "update-check.json"
        self.release = None
        self.checked_at = 0
        self.task = None
        self.lock = asyncio.Lock()
        try:
            if self.path.stat().st_size <= MAX_RESPONSE_BYTES:
                payload = json.loads(self.path.read_text())
                checked = float(payload["checkedAt"])
                if 0 <= self.clock() - checked <= MAX_CACHE_AGE:
                    self.release = release_value(payload, channel)
                    self.checked_at = checked
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            pass

    def start(self):
        if (
            self.enabled
            and self.channel in {"addon", "docker"}
            and stable_version(self.version) is not None
            and self.task is None
        ):
            self.task = asyncio.create_task(self._run(), name="release-update-check")

    async def stop(self):
        if self.task is not None:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            self.task = None

    async def _run(self):
        while True:
            success = await self.check_once()
            await asyncio.sleep((CHECK_INTERVAL if success else 3600) + random.uniform(0, 600))

    async def check_once(self) -> bool:
        async with self.lock:
            async with httpx.AsyncClient(
                timeout=5, transport=self.transport, follow_redirects=False
            ) as client:
                for endpoint in self.endpoints:
                    try:
                        async with client.stream(
                            "GET",
                            endpoint,
                            params={"channel": self.channel},
                            headers={"Accept": "application/json"},
                        ) as response:
                            response.raise_for_status()
                            body = bytearray()
                            async for chunk in response.aiter_bytes():
                                body.extend(chunk)
                                if len(body) > MAX_RESPONSE_BYTES:
                                    raise ValueError("Release response too large")
                        release = release_value(json.loads(body), self.channel)
                    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
                        continue
                    self.release, self.checked_at = release, self.clock()
                    self._save_cache()
                    return True
        return False

    def _save_cache(self):
        temporary = self.path.with_suffix(".tmp")
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            data = {
                "product": "homeos",
                "channel": self.channel,
                "release": self.release,
                "checkedAt": self.checked_at,
            }
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(descriptor, "w") as output:
                json.dump(data, output)
            os.replace(temporary, self.path)
        except OSError:
            pass

    def status(self) -> dict:
        fresh = bool(self.checked_at and 0 <= self.clock() - self.checked_at <= MAX_CACHE_AGE)
        release = self.release if fresh else None
        current = stable_version(self.version)
        latest = stable_version(release["version"]) if release else None
        available = bool(current is not None and latest is not None and latest > current)
        return {
            "currentVersion": self.version,
            "channel": self.channel,
            "updateAvailable": available,
            "latestVersion": release["version"] if release else None,
            "checkedAt": datetime.fromtimestamp(self.checked_at, timezone.utc).isoformat()
            if fresh
            else None,
            "logUrl": f"{WIKI_URL}?release={release['id']}#changelog"
            if available
            else f"{WIKI_URL}#changelog",
        }


@router.get("/updates")
def update_status(
    request: Request,
    response: Response,
    _user: CurrentUser,
) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return request.app.state.update_checker.status()
