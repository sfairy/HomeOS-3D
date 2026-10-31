"""Agent 会话上下文存储（内存 LRU + TTL）。"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import UTC
from typing import Any

from sqlalchemy import delete, select

from ....platform.core.db.models import AgentSessionRow

logger = logging.getLogger("homeos.agent.session_store")

#: 会话数量上限，超过后按 LRU 淘汰
MAX_SESSIONS = 200
#: 会话上下文有效期（10 分钟）：免唤醒窗口结束后后端仍保留一段时间供 LLM 引用
SESSION_TTL_MS = 10 * 60_000
#: 单会话保留的历史条数上限（与 LLM 上下文截取上限一致）
MAX_TURNS = 16
#: 「已尝试回填」会话 id 的记忆上限：仅用于避免重复查库，不能无界增长
MAX_LOADED_SESSIONS = MAX_SESSIONS * 4


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

    def __init__(self, session_factory: Any = None) -> None:
        #: 会话表：dict 迭代顺序即插入顺序，配合 last_at 实现 LRU 淘汰
        self._sessions: dict[str, AgentSessionEntry] = {}
        #: 数据库会话工厂；None 时保持纯内存
        self._session_factory = session_factory
        #: 已尝试从数据库回填过的会话
        self._loaded: set[str] = set()

    # 持久化
    def _load_from_db(self, session_id: str) -> AgentSessionEntry | None:
        """内存未命中时从数据库恢复最近历史（过期会话不恢复）。"""
        if self._session_factory is None or session_id in self._loaded:
            return None
        self._loaded.add(session_id)
        if len(self._loaded) > MAX_LOADED_SESSIONS:
            # 会话 id 来自客户端，不能无界累积；超限整体清空（最坏退化为多查一次库）
            self._loaded.clear()
            self._loaded.add(session_id)
        try:
            with self._session_factory() as session:
                rows = list(
                    session.execute(
                        select(AgentSessionRow)
                        .where(AgentSessionRow.session_id == session_id)
                        .order_by(AgentSessionRow.created_at.desc(), AgentSessionRow.id.desc())
                        .limit(MAX_TURNS)
                    ).scalars()
                )
        except Exception as exc:  # pragma: no cover - 依赖真实数据库
            logger.warning("会话历史回填失败(保持内存): %s", exc)
            return None
        if not rows:
            return None
        newest = rows[0].created_at
        if newest is not None:
            aware = newest if newest.tzinfo is not None else newest.replace(tzinfo=UTC)
            if _now_ms() - int(aware.timestamp() * 1000) > SESSION_TTL_MS:
                return None
        entry = AgentSessionEntry(
            history=[
                AgentSessionTurn(role=row.role, content=row.content)
                for row in reversed(rows)
            ],
            last_at=_now_ms(),
        )
        self._sessions[session_id] = entry
        return entry

    def _append_persisted(self, session_id: str, role: str, content: str) -> None:
        """追加一条历史并裁剪旧记录（best-effort）。"""
        if self._session_factory is None:
            return
        try:
            with self._session_factory() as session:
                session.add(AgentSessionRow(session_id=session_id, role=role, content=content))
                session.flush()
                keep_ids = select(AgentSessionRow.id).where(
                    AgentSessionRow.session_id == session_id
                ).order_by(
                    AgentSessionRow.created_at.desc(), AgentSessionRow.id.desc()
                ).limit(MAX_TURNS)
                session.execute(
                    delete(AgentSessionRow).where(
                        AgentSessionRow.session_id == session_id,
                        AgentSessionRow.id.not_in(keep_ids),
                    )
                )
                session.commit()
        except Exception as exc:  # pragma: no cover
            logger.warning("会话历史落库失败: %s", exc)

    # 读取 / 写入
    def get(self, session_id: str) -> list[AgentSessionTurn]:
        """读取会话历史（惰性清理过期会话），截取最近 MAX_TURNS 条。"""
        if not session_id:
            return []
        self.purge_expired()
        entry = self._sessions.get(session_id)
        if entry is None:
            entry = self._load_from_db(session_id)
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
                    # 淘汰后必须允许再次从数据库回填，否则历史记录会永久丢失
                    self._loaded.discard(oldest_key)
                    logger.info("会话数量超限,淘汰最久未使用会话: %s", oldest_key)
            entry = AgentSessionEntry(history=[], last_at=_now_ms())
            self._sessions[session_id] = entry
        entry.last_at = _now_ms()
        entry.history.append(AgentSessionTurn(role="user", content=user_message))
        self._append_persisted(session_id, "user", user_message)
        if assistant_content and assistant_content.strip():
            entry.history.append(
                AgentSessionTurn(role="assistant", content=assistant_content.strip())
            )
            self._append_persisted(session_id, "assistant", assistant_content.strip())
        # 超限截断：仅保留最近 MAX_TURNS 条
        if len(entry.history) > MAX_TURNS:
            entry.history = entry.history[-MAX_TURNS:]

    def clear(self, session_id: str) -> None:
        """删除指定会话（对应「清除记忆」口令 / 前端结束连续对话时）。"""
        if not session_id:
            return
        self._sessions.pop(session_id, None)
        self._loaded.discard(session_id)
        if self._session_factory is None:
            return
        try:
            with self._session_factory() as session:
                session.execute(
                    delete(AgentSessionRow).where(AgentSessionRow.session_id == session_id)
                )
                session.commit()
        except Exception as exc:  # pragma: no cover
            logger.warning("会话历史删除失败: %s", exc)

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
            self._loaded.discard(session_id)


__all__ = [
    "MAX_LOADED_SESSIONS",
    "MAX_SESSIONS",
    "MAX_TURNS",
    "SESSION_TTL_MS",
    "AgentSessionEntry",
    "AgentSessionStoreService",
    "AgentSessionTurn",
]
