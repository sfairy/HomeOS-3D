"""Agent 会话上下文存储（内存 LRU + TTL）。

职责：为「连续对话」提供服务端会话上下文——前端在唤醒后一段时间内免重复唤醒，
 后续指令携带同一 sessionId，本服务按会话保存多轮 user/assistant 历史，
 使 LLM 能基于上一轮的实体 / 意图补全当前指令（如「开灯」后「再调暗一点」）。
清理策略：
 - TTL：会话超过 SESSION_TTL_MS（10 分钟）未活动即视为过期，读取 / 写入时惰性清理；
 - LRU：会话数超过 MAX_SESSIONS 时淘汰最久未使用的会话；
 - 单会话历史最多保留 MAX_TURNS 条，避免上下文无限膨胀。
依赖：RedisService（重启 / Leader 切换后恢复会话上下文）。
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field

from ...core.redis import RedisService

logger = logging.getLogger("homeos.agent.session_store")

#: 会话数量上限，超过后按 LRU 淘汰
MAX_SESSIONS = 200
#: 会话上下文有效期（10 分钟）：免唤醒窗口结束后后端仍保留一段时间供 LLM 引用
SESSION_TTL_MS = 10 * 60_000
#: 单会话保留的历史条数上限（与 LLM 上下文截取上限一致）
MAX_TURNS = 16
#: 会话持久化 Redis 键
SESSIONS_KEY = "homeos:agent:sessions"
#: 会话持久化兜底 TTL（秒）
SESSIONS_TTL_SECONDS = 48 * 3600


@dataclass
class AgentSessionTurn:
    """单条会话历史（与 ChatHistoryItemDto 对齐，供 AgentService 直接透传给 LLM）。"""

    role: str
    content: str


@dataclass
class AgentSessionEntry:
    """会话上下文条目。"""

    #: 多轮历史（不含当前轮）
    history: list[AgentSessionTurn] = field(default_factory=list)
    #: 最近一次活动时间戳（ms），用于 TTL 与 LRU 淘汰
    last_at: int = 0


def _now_ms() -> int:
    return int(time.time() * 1000)


class AgentSessionStoreService:
    """Agent 会话上下文存储服务。

    通过 get / push_turn / clear 管理「sessionId → 多轮历史」映射。
    """

    def __init__(self, redis: RedisService | None = None) -> None:
        self._redis = redis
        #: 会话表：dict 迭代顺序即插入顺序，配合 last_at 实现 LRU 淘汰
        self._sessions: dict[str, AgentSessionEntry] = {}

    async def init(self) -> None:
        """从 Redis 恢复会话（对齐 ``onModuleInit``）。"""
        await self.restore()

    async def restore(self) -> None:
        """从 Redis 恢复会话（过滤过期 / 无效条目）。"""
        if self._redis is None:
            return
        try:
            raw = await self._redis.get(SESSIONS_KEY)
            if not raw:
                return
            text = raw.decode() if isinstance(raw, bytes) else str(raw)
            parsed = json.loads(text)
            if not isinstance(parsed, dict):
                return
            now = _now_ms()
            for session_id, entry in parsed.items():
                if not session_id or not isinstance(entry, dict):
                    continue
                history = entry.get("history")
                last_at = entry.get("lastAt")
                if not isinstance(history, list) or not isinstance(last_at, (int, float)):
                    continue
                if now - int(last_at) > SESSION_TTL_MS:
                    continue
                self._sessions[session_id] = AgentSessionEntry(
                    history=[
                        AgentSessionTurn(role=str(turn.get("role")), content=str(turn.get("content")))
                        for turn in history[-MAX_TURNS:]
                        if isinstance(turn, dict)
                    ],
                    last_at=int(last_at),
                )
            if self._sessions:
                logger.info("已恢复 Agent 会话上下文: %s 个", len(self._sessions))
        except Exception as exc:  # noqa: BLE001
            logger.debug("恢复 Agent 会话上下文失败: %s", exc)

    def persist(self) -> None:
        """将有效会话写入 Redis（TTL 48h 兜底，写入前清理过期条目）。"""
        if self._redis is None:
            return
        self.purge_expired()
        payload = json.dumps(
            {
                session_id: {
                    "history": [
                        {"role": turn.role, "content": turn.content} for turn in entry.history
                    ],
                    "lastAt": entry.last_at,
                }
                for session_id, entry in self._sessions.items()
            },
            ensure_ascii=False,
        )

        async def _write() -> None:
            try:
                await self._redis.set(SESSIONS_KEY, payload, SESSIONS_TTL_SECONDS)
            except Exception as exc:  # noqa: BLE001
                logger.debug("Agent 会话持久化失败: %s", exc)

        # 对齐 Nest 的 fire-and-forget（void this.redis.set(...)）
        try:
            asyncio.get_running_loop().create_task(_write())
        except RuntimeError:
            pass

    # ------------------------------------------------------------------ #
    # 读取 / 写入
    # ------------------------------------------------------------------ #
    def get(self, session_id: str) -> list[AgentSessionTurn]:
        """读取会话历史（惰性清理过期会话），截取最近 MAX_TURNS 条。"""
        if not session_id:
            return []
        self.purge_expired()
        entry = self._sessions.get(session_id)
        if entry is None:
            return []
        entry.last_at = _now_ms()
        # 刷新 LRU 顺序：删除后重新插入，使其成为最新
        self._sessions.pop(session_id, None)
        self._sessions[session_id] = entry
        return entry.history[-MAX_TURNS:]

    def push_turn(
        self,
        session_id: str,
        user_message: str,
        assistant_content: str | None = None,
    ) -> None:
        """记录一轮对话（用户消息 + 管家回复摘要），并滚动更新会话时间。"""
        if not session_id:
            return
        self.purge_expired()
        entry = self._sessions.get(session_id)
        if entry is None:
            # 会话数超限：淘汰最久未使用的会话（dict 首项即最早插入）
            if len(self._sessions) >= MAX_SESSIONS:
                oldest_key = next(iter(self._sessions), None)
                if oldest_key:
                    self._sessions.pop(oldest_key, None)
                    logger.info("会话数量超限,淘汰最久未使用会话: %s", oldest_key)
            entry = AgentSessionEntry(history=[], last_at=_now_ms())
            self._sessions[session_id] = entry
        entry.last_at = _now_ms()
        entry.history.append(AgentSessionTurn(role="user", content=user_message))
        if assistant_content and assistant_content.strip():
            entry.history.append(
                AgentSessionTurn(role="assistant", content=assistant_content.strip())
            )
        # 超限截断：仅保留最近 MAX_TURNS 条
        if len(entry.history) > MAX_TURNS:
            entry.history = entry.history[-MAX_TURNS:]
        self.persist()

    def clear(self, session_id: str) -> None:
        """删除指定会话（对应「清除记忆」口令 / 前端结束连续对话时）。"""
        if not session_id:
            return
        self._sessions.pop(session_id, None)
        self.persist()

    @property
    def size(self) -> int:
        """当前会话数量。"""
        return len(self._sessions)

    def purge_expired(self) -> None:
        """惰性清理过期会话（每次读取 / 写入前调用）。"""
        now = _now_ms()
        expired = [
            session_id
            for session_id, entry in self._sessions.items()
            if now - entry.last_at > SESSION_TTL_MS
        ]
        for session_id in expired:
            self._sessions.pop(session_id, None)


__all__ = [
    "AgentSessionEntry",
    "AgentSessionStoreService",
    "AgentSessionTurn",
    "MAX_SESSIONS",
    "MAX_TURNS",
    "SESSION_TTL_MS",
]
