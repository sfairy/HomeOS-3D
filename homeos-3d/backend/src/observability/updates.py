"""版本更新检查：可选的发布发现，与授权、编辑器启动完全隔离。
"""
from __future__ import annotations

import asyncio
import json
import os
import random
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID

import httpx
from fastapi import APIRouter, Request, Response

from ..http.http_cache import NO_STORE
from ..security.dependencies import CurrentUser

router = APIRouter()
RELEASE_ENDPOINTS = (
    "https://pay.habridge.cn/store/v1/updates/latest",
    "https://pay2.habridge.cn/store/v1/updates/latest",
)
# 更新说明页，status() 会带上本次发布 id 拼出直达链接。
WIKI_URL = "https://wiki.habridge.cn/updates.html"
# 成功后 6 小时检查一次。
CHECK_INTERVAL = 21600
# 缓存超过 24 小时即视为过期，status() 会退化成"没有可用更新"。
MAX_CACHE_AGE = 86400
# 响应体上限 32 KiB：发布信息只是一个小 JSON，超出说明端点异常。
MAX_RESPONSE_BYTES = 32768


def stable_version(value: str | None) -> tuple[int, int, int] | None:
    """把 "1.2.3" / "v1.2.3" 解析成可比较的元组；非稳定版返回 None。
    """
    if not isinstance(value, str) or not re.fullmatch(
        r"v?(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})", value
    ):
        return None
    parts = value.removeprefix("v").split(".")
    return (int(parts[0]), int(parts[1]), int(parts[2]))


def release_value(payload: dict, channel: str) -> dict | None:
    """校验并归一发布信息；无发布时返回 None。
    """
    # 产品标识按「同一产品线」放行两种写法：自建商店返回 "homeos"，而内置厂商端点
    if (
        not isinstance(payload, dict)
        or payload.get("product") not in {"homeos", "ha-bridge"}
        or payload.get("channel") != channel
        or "release" not in payload
    ):
        raise ValueError("Unexpected release response")
    release = payload["release"]
    if release is None:
        return None
    # id 必须是合法 UUID：它会被拼进 status() 返回的链接里。
    if not isinstance(release, dict) or stable_version(release.get("version")) is None:
        raise ValueError("Invalid release version")
    entry_id = str(UUID(release["id"]))
    return {"id": entry_id, "version": release["version"]}


def endpoint_hosts(endpoints=RELEASE_ENDPOINTS) -> str:
    """把发布端点收敛成主机名列表，供启动日志说明「这条外发请求发给谁」。
    """
    hosts = []
    for endpoint in endpoints:
        host = urlsplit(endpoint).hostname
        if host and host not in hosts:
            hosts.append(host)
    return ", ".join(hosts)


class UpdateChecker:
    """后台更新检查器：定时拉取发布信息，缓存到数据目录。
    """

    def __init__(
        self,
        data_dir: Path,
        version: str,
        channel: str,
        *,
        enabled=True,
        transport=None,
        endpoints=RELEASE_ENDPOINTS,
        wiki_url=WIKI_URL,
        clock=time.time,
    ):
        """初始化检查器并尝试读取上一次的缓存结果（enabled=False 时完全不联网，只留缓存）。"""
        self.version, self.channel, self.enabled = version, channel, enabled
        # 端点留空即回落到内置厂商端点：配置层与调用层都不必各写一份默认值。
        self.transport, self.clock = transport, clock
        self.endpoints = tuple(endpoints) or RELEASE_ENDPOINTS
        self.wiki_url = wiki_url or WIKI_URL
        self.path = data_dir / "cache" / "update-check.json"
        self.release = None
        self.checked_at = 0
        self.task = None
        self.lock = asyncio.Lock()
        try:
            # 缓存是纯优化，任何异常（文件缺失、损坏、字段缺失）都静默忽略，
            if self.path.stat().st_size <= MAX_RESPONSE_BYTES:
                payload = json.loads(self.path.read_text())
                checked = float(payload["checkedAt"])
                if 0 <= self.clock() - checked <= MAX_CACHE_AGE:
                    self.release = release_value(payload, channel)
                    self.checked_at = checked
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            pass

    def start(self):
        """按需启动后台检查任务。
        """
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
            # cancel() 之后 await 抛 CancelledError 正是要等的结果（任务已退场），不是错误。
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            self.task = None

    async def _run(self):
        """后台循环：成功则等 6 小时，失败则 1 小时后重试。
        """
        while True:
            success = await self.check_once()
            await asyncio.sleep((CHECK_INTERVAL if success else 3600) + random.uniform(0, 600))

    async def check_once(self) -> bool:
        """尝试所有端点，任一成功即写缓存并返回 True。
        """
        async with self.lock, httpx.AsyncClient(
            timeout=5, transport=self.transport, follow_redirects=False
        ) as client:
            for endpoint in self.endpoints:
                # 这一轮取发布信息失败（网络异常 / 结构不符）：跳过，等下一个检查周期。
                try:
                    async with client.stream(
                        "GET",
                        endpoint,
                        params={"channel": self.channel},
                        headers={"Accept": "application/json"},
                    ) as response:
                        response.raise_for_status()
                        # 用流式读取并逐块累计长度：不等整包落地就能
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
        """原子写入缓存文件；失败静默忽略（缓存丢了下次重查即可）。"""
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
        """给前端的更新状态。
        """
        fresh = bool(self.checked_at and 0 <= self.clock() - self.checked_at <= MAX_CACHE_AGE)
        release = self.release if fresh else None
        current = stable_version(self.version)
        latest = stable_version(release["version"]) if release else None
        available = bool(current is not None and latest is not None and latest > current)
        return {
            "currentVersion": self.version,
            "channel": self.channel,
            # enabled 也返回：界面据此区分「服务端暂时没查到」与「本部署关掉了外发检查」，
            "enabled": bool(self.enabled),
            "updateAvailable": available,
            "latestVersion": release["version"] if release else None,
            "checkedAt": datetime.fromtimestamp(self.checked_at, timezone.utc).isoformat()
            if fresh
            else None,
            "logUrl": f"{self.wiki_url}?release={release['id']}#changelog"
            if release and available
            else f"{self.wiki_url}#changelog",
        }


@router.get("/updates")
def update_status(
    request: Request,
    response: Response,
    _user: CurrentUser,
) -> dict:
    """查询当前更新状态；只读缓存，不触发联网检查。
    """
    response.headers["Cache-Control"] = NO_STORE
    return request.app.state.update_checker.status()
