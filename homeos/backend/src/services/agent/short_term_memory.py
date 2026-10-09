"""Agent 短时会话记忆服务（纯内存滑窗 + 短 TTL）。

职责：为「反问闭环 + 自然语言指代消解」提供极短时的上下文窗口——
 当管家上一轮反问「是否为您打开书房空调？」时，用户回答「打开吧 / 好 / 嗯 / 关了吧」，
 这些确认短语本身不含设备与房间信息，必须依赖上一轮 assistant 的提问才能消解指代。

与 AgentSessionStoreService 的分工（两者并存，互不替代）：
 - AgentSessionStoreService：10 分钟 TTL、最多 16 轮、Redis 持久化，负责长一点的连续对话上下文；
 - 本服务：45 秒 TTL、最多 2 轮微型滑窗、纯内存零持久化，专职「最近一次问答」的指代消解，
   且不做跨意图复用——快路径 / 缓存命中执行成功后由调用方 clear()，杜绝上一意图污染下一意图。

清理策略：
 - TTL：会话超过 SESSION_TTL_MS（45s）未活动即视为过期，读取 / 写入时惰性清理；
 - 窗口：单会话最多保留 MAX_TURNS 轮（user + assistant 各一条为 1 轮）；
 - 池上限：会话数达 MAX_SESSIONS 时按插入顺序批量淘汰最旧的 CLEANUP_BATCH 个。
依赖：无（不注入 Redis，保持零常驻开销）。
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

logger = logging.getLogger("homeos.agent.short_term_memory")

#: 会话有效期：45 秒内的连续对话才认为具备指代关系
SESSION_TTL_MS = 45_000
#: 单会话最多保留的轮数（1 轮 = 1 条 user + 1 条 assistant）
MAX_TURNS = 2
#: 会话池上限
MAX_SESSIONS = 200
#: 池满时一次性淘汰的会话数（按插入顺序取最旧）
CLEANUP_BATCH = 30


@dataclass
class ShortTermTurn:
    """单条短时记忆消息（与 LLM 消息结构对齐，便于直接透传）。"""

    role: str
    content: str


@dataclass
class ShortTermSession:
    """短时记忆会话条目。"""

    #: 微型滑窗内的消息（按时间正序）
    messages: list[ShortTermTurn] = field(default_factory=list)
    #: 最近一次活动时间戳（ms），用于 TTL 判定
    last_active: int = 0


def _now_ms() -> int:
    return int(time.time() * 1000)


class AgentShortTermMemoryService:
    """短时会话记忆服务。

    通过 get_history / append_turn / clear 管理「sessionId → 最近 2 轮问答」的微型滑窗。
    """

    def __init__(self) -> None:
        #: 会话表：dict 迭代顺序即插入顺序，池满时据此批量淘汰最旧会话
        self._sessions: dict[str, ShortTermSession] = {}

    def get_history(self, session_id: str = "default") -> list[ShortTermTurn]:
        """读取会话的短时历史（惰性清理过期会话）。"""
        session = self._sessions.get(session_id)
        if session is None:
            return []
        now = _now_ms()
        if now - session.last_active > SESSION_TTL_MS:
            logger.info(
                "短时会话超时(%ss > 45s)，自动重置: session=\"%s\"",
                round((now - session.last_active) / 1000),
                session_id,
            )
            self._sessions.pop(session_id, None)
            return []
        # 读取也刷新 LRU 次序：长期活跃的会话不会因为「插入得早」而被批量淘汰
        self._touch(session_id, session)
        return [ShortTermTurn(role=m.role, content=m.content) for m in session.messages]

    def _touch(self, session_id: str, session: ShortTermSession) -> None:
        """把已存在的 key 移到末尾（dict 重赋值不改变迭代顺序，故需先 delete）。"""
        self._sessions.pop(session_id, None)
        self._sessions[session_id] = session

    def _evict_if_needed(self) -> None:
        """池满时腾出配额：先清过期会话，仍不足再按 LRU 淘汰最旧的一批。

        顺序很重要——不能直接按插入顺序淘汰：dict 迭代顺序是「首次插入」而非「最近活跃」，
        直接取前 N 个会把整轮对话里持续活跃的那个会话（例如 MCP 的 ``mcp:<ip>``）连同窗口一起删掉，
        而它恰恰正是「反问 → 用户回『打开吧』」最需要保住上下文的会话。
        """
        if len(self._sessions) < MAX_SESSIONS:
            return
        now = _now_ms()
        expired = 0
        for key, session in list(self._sessions.items()):
            if now - session.last_active > SESSION_TTL_MS:
                self._sessions.pop(key, None)
                expired += 1
        if len(self._sessions) < MAX_SESSIONS:
            logger.info("短时会话池满(%s)，清理过期会话 %s 个", MAX_SESSIONS, expired)
            return
        lru_keys = list(self._sessions.keys())[:CLEANUP_BATCH]
        for key in lru_keys:
            self._sessions.pop(key, None)
        logger.info(
            "短时会话池满(%s)，清过期 %s 个后仍不足，按 LRU 淘汰 %s 个最旧会话",
            MAX_SESSIONS,
            expired,
            CLEANUP_BATCH,
        )

    def append_turn(
        self,
        session_id: str = "default",
        user_text: str = "",
        assistant_text: str = "",
    ) -> None:
        """追加一轮问答（user + assistant 各一条），超出滑窗时截断最旧消息。"""
        clean_user = str(user_text or "").strip()
        clean_assistant = str(assistant_text or "").strip()
        # 空回复（如纯执行成功且不朗读）不入窗，避免污染上下文
        if not clean_user or not clean_assistant:
            return

        if len(self._sessions) >= MAX_SESSIONS:
            self._evict_if_needed()

        now = _now_ms()
        session = self._sessions.get(session_id)
        if session is None or now - session.last_active > SESSION_TTL_MS:
            session = ShortTermSession(messages=[], last_active=now)
            self._sessions[session_id] = session
        else:
            # 活跃会话移到末尾，保证淘汰时优先命中真正的冷会话
            self._touch(session_id, session)
        session.last_active = now
        session.messages.append(ShortTermTurn(role="user", content=clean_user))
        session.messages.append(ShortTermTurn(role="assistant", content=clean_assistant))

        max_messages = MAX_TURNS * 2
        if len(session.messages) > max_messages:
            session.messages = session.messages[-max_messages:]

    def clear(self, session_id: str = "default") -> None:
        """清空会话短时记忆。

        用于「快路径 / 缓存命中执行成功」后重置上下文，以及用户主动清除记忆的场景，
        防止已完成的独立意图继续影响下一轮指代消解。
        """
        if self._sessions.pop(session_id, None) is not None:
            logger.info('已清空短时记忆: session="%s"', session_id)


__all__ = [
    "CLEANUP_BATCH",
    "MAX_SESSIONS",
    "MAX_TURNS",
    "SESSION_TTL_MS",
    "AgentShortTermMemoryService",
    "ShortTermSession",
    "ShortTermTurn",
]
