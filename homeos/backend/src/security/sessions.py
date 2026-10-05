"""单会话吊销（jti 黑名单）与 tokenVersion 鉴权快照缓存。

等价移植 Nest ``session-revocation.service`` 与 ``token-version-cache.service``：
- 未配置 Redis 时吊销表不启用（返回 False），由 ``tokenVersion`` 兜底全设备失效；
- 两者均带「正向缓存」（仅缓存未吊销 / 未失效），已吊销永不缓存，避免误放行窗口。
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass

from ..core.redis import RedisService

REVOKED_PREFIX = "auth:revoked:"
REVOKE_INVALIDATE_CHANNEL = "homeos:session-revocation:invalidate"

#: 「未吊销」正向缓存 TTL（毫秒）。
NOT_REVOKED_TTL_MS = 30_000
NOT_REVOKED_MAX = 2000

TOKEN_VERSION_TTL_MS = 60_000


class SessionRevocation:
    def __init__(self, redis: RedisService) -> None:
        self.redis = redis
        self._not_revoked: dict[str, float] = {}

    async def revoke(self, jti: str | None, ttl_seconds: float) -> bool:
        if not jti:
            return False
        if self.redis.get_client() is None:
            return False
        ttl = max(1, int(ttl_seconds))
        try:
            ok = await self.redis.set(f"{REVOKED_PREFIX}{jti}", "1", ttl)
            self._not_revoked.pop(jti, None)
            if ok:
                await self.redis.publish(REVOKE_INVALIDATE_CHANNEL, json.dumps({"jti": jti}))
            return ok
        except Exception:  # noqa: BLE001
            return False

    async def is_revoked(self, jti: str | None) -> bool:
        if not jti:
            return False
        if not self.redis.is_configured():
            return False
        cached_at = self._not_revoked.get(jti)
        if cached_at is not None and (time.monotonic() * 1000 - cached_at) < NOT_REVOKED_TTL_MS:
            return False
        if not self.redis.is_ready() or self.redis.get_client() is None:
            return False
        try:
            revoked = (await self.redis.get(f"{REVOKED_PREFIX}{jti}")) is not None
        except Exception:  # noqa: BLE001 - 查询异常保守拒绝（fail-closed）
            return True
        if revoked:
            self._not_revoked.pop(jti, None)
        else:
            self._not_revoked[jti] = time.monotonic() * 1000
            if len(self._not_revoked) > NOT_REVOKED_MAX:
                self._not_revoked.clear()
        return revoked


@dataclass
class AuthSnapshot:
    token_version: int
    username: str
    role: str
    preferences: dict | None
    at: float


class TokenVersionCache:
    def __init__(self, redis: RedisService) -> None:
        self.redis = redis
        self._cache: dict[str, AuthSnapshot] = {}

    def get_snapshot(self, user_id: str) -> AuthSnapshot | None:
        row = self._cache.get(user_id)
        if row is None:
            return None
        if (time.monotonic() * 1000 - row.at) > TOKEN_VERSION_TTL_MS:
            self._cache.pop(user_id, None)
            return None
        return row

    def set_snapshot(
        self,
        user_id: str,
        *,
        token_version: int,
        username: str,
        role: str,
        preferences: dict | None,
    ) -> None:
        self._cache[user_id] = AuthSnapshot(
            token_version=token_version,
            username=username,
            role=role,
            preferences=preferences,
            at=time.monotonic() * 1000,
        )

    def invalidate(self, user_id: str) -> None:
        self._cache.pop(user_id, None)

    def clear(self) -> None:
        self._cache.clear()
