"""Redis 封装（可缺省）。

自托管家居场景 Redis 往往是可选项：未配置时全部能力降级为「进程内内存」实现，
语义与 Nest ``RedisService`` 的降级路径一致（会话吊销依赖 tokenVersion 兜底）。
"""

from __future__ import annotations

import asyncio
import inspect
import json
from typing import Any

try:  # pragma: no cover - 依赖存在时导入
    import redis.asyncio as aioredis
except Exception:  # noqa: BLE001
    aioredis = None  # type: ignore[assignment]


class RedisService:
    """薄封装：连接、读写、发布/订阅，全部在未配置/不可用时安全降级。"""

    def __init__(self, url: str = "") -> None:
        self.url = url
        self._client: Any | None = None
        self._ready = False

    # ---- 生命周期 ----
    async def connect(self) -> None:
        if not self.url or aioredis is None:
            return
        try:
            self._client = aioredis.from_url(self.url, decode_responses=False)
            await self._client.ping()
            self._ready = True
        except Exception:  # noqa: BLE001 - 连接失败即降级为内存模式
            self._client = None
            self._ready = False

    async def close(self) -> None:
        if self._client is not None:
            try:
                await self._client.aclose()
            except Exception:  # noqa: BLE001
                pass
        self._client = None
        self._ready = False

    # ---- 状态 ----
    def is_configured(self) -> bool:
        return bool(self.url)

    def is_ready(self) -> bool:
        return self._ready

    def get_client(self) -> Any | None:
        return self._client

    # ---- 读写 ----
    async def get(self, key: str) -> bytes | None:
        if not self._ready or self._client is None:
            return None
        return await self._client.get(key)

    async def set(self, key: str, value: str, ttl_seconds: int | None = None) -> bool:
        if not self._ready or self._client is None:
            return False
        if ttl_seconds is not None:
            await self._client.set(key, value, ex=max(1, int(ttl_seconds)))
        else:
            await self._client.set(key, value)
        return True

    async def publish(self, channel: str, message: Any) -> None:
        """发布消息；``message`` 为 dict/list 时自动 JSON 序列化（对齐 Nest publish 语义）。"""
        if not self._ready or self._client is None:
            return
        try:
            payload = (
                json.dumps(message, ensure_ascii=False, default=str)
                if not isinstance(message, (str, bytes))
                else message
            )
            await self._client.publish(channel, payload)
        except Exception:  # noqa: BLE001
            pass

    async def subscribe(
        self, channel: str, callback: Any
    ) -> Any | None:
        """订阅频道并分发 JSON 消息（解析失败静默丢弃，对齐 Nest ``subscribe``）。

        返回取消订阅回调；Redis 未就绪或订阅失败时返回 ``None``。
        """
        if not self._ready or self._client is None:
            return None
        try:
            pubsub = self._client.pubsub()
            await pubsub.subscribe(channel)
        except Exception:  # noqa: BLE001
            return None

        async def _listen() -> None:
            try:
                async for message in pubsub.listen():
                    if not isinstance(message, dict) or message.get("type") != "message":
                        continue
                    raw = message.get("data")
                    if isinstance(raw, (bytes, bytearray)):
                        raw = raw.decode("utf-8", "ignore")
                    try:
                        parsed = json.loads(raw)
                    except (TypeError, ValueError):
                        continue
                    try:
                        result = callback(parsed)
                        if inspect.isawaitable(result):
                            await result
                    except Exception:  # noqa: BLE001 - 单个回调失败不影响订阅循环
                        pass
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                pass

        task = asyncio.create_task(_listen())

        def _unsubscribe() -> None:
            task.cancel()
            try:
                asyncio.get_running_loop().create_task(pubsub.close())
            except RuntimeError:
                pass

        return _unsubscribe
