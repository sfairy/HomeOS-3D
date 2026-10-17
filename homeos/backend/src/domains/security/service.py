"""安防服务（对齐 ``SecurityService``）：门铃抓拍事件抓取与 eventsPath 连通性校验。"""

from __future__ import annotations

import asyncio
import heapq
import json
import logging
import time
from typing import Any

import httpx

from .config import load_security_config, parse_optional_int
from ..ha.config.ha_config import load_active_ha_endpoints
from ...platform.core.app_config import load_raw_config
from ...platform.core.json_field import object_field
from ...platform.core.models import ProjectConfig

logger = logging.getLogger("homeos.security.service")

#: 单次返回的事件条数上限。HA 侧的 `events.jsonl` 行数**没有上界**（它是滚动追加的文件），
#: 而这条路由是同步解析 + 排序的：全量进出会把 worker 的 CPU 与内存吃满，同进程的实时通道
#: 也跟着卡。上限既约束返回值，也约束解析期内存（用定长小顶堆，只留最新的 N 条）。
MAX_EVENTS = 500


def resolve_events_limit(raw: Any) -> int:
    """把查询参数解析成 ``[1, MAX_EVENTS]`` 内的条数上限（缺省/非法 = 上限）。"""
    parsed = parse_optional_int(raw, MAX_EVENTS)
    if parsed is None:
        return MAX_EVENTS
    return max(1, min(parsed, MAX_EVENTS))


class SecurityService:
    def __init__(self, session_factory, *, cipher=None) -> None:
        self._session_factory = session_factory
        # 凭证解密器（可选）：HA 令牌只以密文存在连接记录里，注入后这里才能取到明文令牌。
        self._cipher = cipher
        self._cache: dict[str, Any] | None = None
        self._cache_at = 0.0

    def _config_cache_ttl_ms(self) -> int:
        with self._session_factory() as session:
            return int(load_security_config(session).get("configCacheTtlMs") or 60_000)

    def _dynamic_config(self) -> dict[str, Any]:
        import os

        with self._session_factory() as session:
            # 跟随连接器的活跃端点，否则安防事件在「内网不可达已切外网」时会取不到。
            endpoints = load_active_ha_endpoints(session, cipher=self._cipher)
            live_url = (
                endpoints.ha_url_primary or os.getenv("HA_URL", "") or "http://localhost:8123"
            ).rstrip("/")

            ttl_ms = int(load_security_config(session).get("configCacheTtlMs") or 60_000)
            cached = self._cache
            if cached is not None and (time.monotonic() - self._cache_at) * 1000 < ttl_ms:
                return {**cached, "haUrl": live_url, "token": endpoints.token}

            # 未配置 eventsPath 时保持为空：由 fetch_events 提前返回，不去请求一个
            # 不存在的路径，否则必然 404 并打出误导性告警。
            events_path = ""
            try:
                raw = load_raw_config(session)
                profiles = object_field(raw, "profiles")
                active_profile_id = str(profiles.get("activeProfileId") or "").strip() or "default"
                from sqlalchemy import select

                record = session.execute(
                    select(ProjectConfig).where(ProjectConfig.project_id == active_profile_id)
                ).scalar_one_or_none()
                if record is not None and record.layout:
                    layout = (
                        record.layout
                        if isinstance(record.layout, dict)
                        else json.loads(record.layout)
                    )
                    ha_config = layout.get("haConfig") if isinstance(layout, dict) else None
                    if isinstance(ha_config, dict) and "eventsPath" in ha_config:
                        events_path = str(ha_config.get("eventsPath") or "").strip()
            except Exception as exc:
                logger.error("读取动态安全配置出错:%s", exc)

        self._cache = {"haUrl": live_url, "eventsPath": events_path}
        self._cache_at = time.monotonic()
        return {**self._cache, "token": endpoints.token}

    async def _get_events_file(self, url: str, token: str) -> httpx.Response:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        async with httpx.AsyncClient(timeout=10) as client:
            return await client.get(url, headers=headers)

    async def fetch_events(self, limit: int = MAX_EVENTS) -> list[dict[str, Any]]:
        """拉取门禁事件，按时间倒序返回**最多** ``limit`` 条。

        解析期只保留最新的 ``limit`` 条（定长小顶堆），所以内存与返回量都跟上限挂钩，
        与上游文件行数无关。
        """
        effective = max(1, min(int(limit), MAX_EVENTS))
        try:
            config = await asyncio.to_thread(self._dynamic_config)
            ha_url = config["haUrl"]
            events_path = config["eventsPath"]
            if not events_path:
                return []
            events_url = f"{ha_url}{events_path}"
            response = await self._get_events_file(events_url, config["token"])
            if response.status_code == 404:
                logger.warning("在 HA 中未找到 events.jsonl.假设尚无事件.")
                return []
            if response.status_code != 200:
                # 不能静默返回空列表：上游 5xx / 反代 502 时界面会显示「路径可读但暂无事件」，
                # 用户被引去改 eventsPath，真正的原因却没有任何地方留下痕迹。
                logger.warning(
                    "从 HA 获取事件返回非 200：HTTP %s（%s）", response.status_code, events_url
                )
                return []
            text = response.text

            def _sort_key(item: dict[str, Any]) -> float:
                from datetime import datetime

                try:
                    return datetime.fromisoformat(
                        f"{item.get('date')}T{item.get('time')}"
                    ).timestamp()
                except (TypeError, ValueError):
                    return 0.0

            # 小顶堆：(排序键, 行号, 事件)。行号只做同键时的确定性兜底，避免堆比较落到 dict 上。
            newest: list[tuple[float, int, dict[str, Any]]] = []
            index = 0
            for line in text.split("\n"):
                if not line.strip():
                    continue
                try:
                    event = json.loads(line)
                except (TypeError, ValueError):
                    continue
                if not isinstance(event, dict):
                    continue
                for key in ("img", "video", "clip", "mp4", "recording"):
                    value = event.get(key)
                    if isinstance(value, str) and value.startswith("/local/"):
                        event[key] = f"{ha_url}{value}"
                if not event.get("video") and event.get("clip"):
                    event["video"] = event["clip"]
                if not event.get("video") and event.get("mp4"):
                    event["video"] = event["mp4"]
                if not event.get("video") and event.get("recording"):
                    event["video"] = event["recording"]
                index += 1
                heapq.heappush(newest, (_sort_key(event), index, event))
                if len(newest) > effective:
                    heapq.heappop(newest)

            # 同键时按行号升序（= 文件里的先后），保持与旧「稳定排序」一致的展示顺序。
            ordered = sorted(newest, key=lambda item: (-item[0], item[1]))
            return [event for _key, _index, event in ordered]
        except Exception as exc:
            logger.error("从 HA 获取事件失败:%s", exc)
            return []

    async def validate_events_path(self) -> dict[str, Any]:
        config = await asyncio.to_thread(self._dynamic_config)
        ha_url = config["haUrl"]
        events_path = config["eventsPath"]
        if not events_path or not events_path.strip():
            return {
                "ok": False,
                "configured": False,
                "message": "未配置 eventsPath，请在集成绑定中填写抓拍记录路径",
            }
        events_url = f"{ha_url}{events_path}"
        try:
            response = await self._get_events_file(events_url, config["token"])
            if response.status_code == 404:
                return {
                    "ok": False,
                    "configured": True,
                    "url": events_url,
                    "message": "HA 上未找到该路径文件",
                }
            lines = [line for line in str(response.text or "").split("\n") if line.strip()]
            parsed = 0
            for line in lines[:5]:
                try:
                    json.loads(line)
                    parsed += 1
                except (TypeError, ValueError):
                    continue
            return {
                "ok": parsed > 0 or len(lines) == 0,
                "configured": True,
                "url": events_url,
                "lineCount": len(lines),
                "message": (
                    "文件为空，尚无事件" if len(lines) == 0 else f"连通正常，约 {len(lines)} 条记录"
                ),
            }
        except Exception as exc:
            return {"ok": False, "configured": True, "url": events_url, "message": str(exc)}
