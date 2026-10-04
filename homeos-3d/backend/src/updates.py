"""可选的版本发布发现功能，与授权和编辑器启动相互隔离。"""
from __future__ import annotations

import asyncio
import json
import os
import random
import re
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import httpx
from fastapi import APIRouter, Request, Response

from .dependencies import CurrentUser

router = APIRouter()
_VERSION_PATTERN = re.compile(r"[vV]?(0|[1-9][0-9]{0,8})(?:\.(0|[1-9][0-9]{0,8})){0,3}")
# 商店侧的更新查询路径（商店 API 的固定前缀，见 homeos-store 的 store.py）。
STORE_UPDATES_PATH = "/store/v1/updates/latest"
# 仅作 UpdateChecker 的兜底默认值：正常由 main.py 按 APP_UPDATE_ENDPOINTS（优先）
# 或 APP_STORE_URL 注入，分拆部署时才能指向中心商店，而不是客户机自己的回环。
RELEASE_ENDPOINTS = (f"http://127.0.0.1:8802{STORE_UPDATES_PATH}",)
CHECK_INTERVAL = 21600
MAX_CACHE_AGE = 86400
MAX_RESPONSE_BYTES = 32768


def parse_version(value: object) -> tuple[int, ...] | None:
    """把版本号解析成可比较的整数元组；非法格式返回 ``None``。

    允许 1~4 段纯数字，所以语义化 ``1.0.0`` 与 GitHub Release 的日期式
    ``2026.10.4.10`` 都能解析并按元组逐位比较（``1.0.0 < 2026.10.4.10``、
    ``2026.10.4 < 2026.10.4.10``）。
    """
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not _VERSION_PATTERN.fullmatch(text):
        return None
    return tuple(int(part) for part in text.lstrip("vV").split("."))


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
    if not isinstance(release, dict) or parse_version(release.get("version")) is None:
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
            and parse_version(self.version) is not None
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
            try:
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
            except (httpx.HTTPError, OSError, ValueError):
                pass
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
        current = parse_version(self.version)
        latest = parse_version(release["version"]) if release else None
        available = bool(current is not None and latest is not None and latest > current)
        return {
            "currentVersion": self.version,
            "channel": self.channel,
            "updateAvailable": available,
            "latestVersion": release["version"] if release else None,
            "checkedAt": datetime.fromtimestamp(self.checked_at, UTC).isoformat(),
        }


@router.get("/updates")
def update_status(
    request: Request,
    response: Response,
    _user: CurrentUser,
) -> dict:
    response.headers["Cache-Control"] = 'no-store'
    return request.app.state.update_checker.status()
