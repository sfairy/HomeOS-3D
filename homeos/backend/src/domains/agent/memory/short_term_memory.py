"""Agent 短时会话记忆服务（滑窗 + 短 TTL，可跨进程共享）。

状态放在 :class:`~..state.store.SharedStateStore` 里而不是进程内字典：多 worker
部署时，上一句可能落在 A、下一句落在 B，指代消解必须看到同一份窗口。默认仍是
进程内实现（单进程部署与测试行为不变），装配到文件库后自动跨进程。
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

from ..state.store import MemoryStateStore, SharedStateStore

logger = logging.getLogger("homeos.agent.short_term_memory")

#: 会话有效期：45 秒内的连续对话才认为具备指代关系
SESSION_TTL_MS = 45_000
#: 单会话最多保留的轮数（1 轮 = 1 条 user + 1 条 assistant）
MAX_TURNS = 2
#: 会话池上限
MAX_SESSIONS = 200
#: 池满时一次性淘汰的会话数（按最近活跃取最旧）
CLEANUP_BATCH = 30
#: 共享状态命名空间
STORE_NAMESPACE = "agent.short_term"


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
    #: 最近一次控制命中的实体 ID（供「把它关掉」这类指代消解使用）
    last_targets: list[str] = field(default_factory=list)
    #: 最近一次活动时间戳（ms），用于 TTL 判定
    last_active: int = 0

    def to_payload(self) -> dict[str, Any]:
        return {
            "messages": [{"role": m.role, "content": m.content} for m in self.messages],
            "targets": list(self.last_targets),
            "lastActive": self.last_active,
        }

    @classmethod
    def from_payload(cls, payload: Any) -> ShortTermSession | None:
        """把共享存储里的 JSON 还原成会话对象；结构不符时按缺失处理。"""
        if not isinstance(payload, dict):
            return None
        raw_messages = payload.get("messages")
        messages: list[ShortTermTurn] = []
        for item in raw_messages if isinstance(raw_messages, list) else []:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role") or "")
            content = str(item.get("content") or "")
            if role and content:
                messages.append(ShortTermTurn(role=role, content=content))
        raw_targets = payload.get("targets")
        targets = [str(eid) for eid in raw_targets if str(eid or "")] if isinstance(raw_targets, list) else []
        last_active = payload.get("lastActive")
        return cls(
            messages=messages,
            last_targets=targets,
            last_active=int(last_active) if isinstance(last_active, (int, float)) else 0,
        )


def _now_ms() -> int:
    return int(time.time() * 1000)


class AgentShortTermMemoryService:
    """短时会话记忆服务。

    通过 get_history / append_turn / clear 管理「sessionId → 最近 2 轮问答」的微型滑窗。
    """

    def __init__(self, store: SharedStateStore | None = None) -> None:
        #: 共享状态后端；缺省进程内（行为与旧实现一致）
        self._store = store or MemoryStateStore()
        #: namespace 前缀：同一份库被多实例共用时也能隔离（如 MCP 与对话各一份）
        self._ns = STORE_NAMESPACE

    @property
    def shared(self) -> bool:
        """当前是否跨进程共享（ping / 日志用）。"""
        return bool(getattr(self._store, "shared", False))

    def _ttl_seconds(self) -> float:
        return SESSION_TTL_MS / 1000.0

    def _load(self, session_id: str) -> ShortTermSession | None:
        session = ShortTermSession.from_payload(self._store.get(self._ns, session_id))
        if session is None:
            return None
        if _now_ms() - session.last_active > SESSION_TTL_MS:
            self._store.delete(self._ns, session_id)
            return None
        return session

    def _save(self, session_id: str, session: ShortTermSession) -> None:
        session.last_active = _now_ms()
        self._store.set(self._ns, session_id, session.to_payload(), ttl_seconds=self._ttl_seconds())

    def _make_room(self) -> None:
        """池满时先清过期，再按最近活跃淘汰最旧的一批。

        顺序很重要——不能直接按插入顺序淘汰：整轮对话里持续活跃的那个会话
        （例如 MCP 的 ``mcp:<ip>``）恰恰是「反问 → 用户回『打开吧』」最需要保住上下文
        的那个，必须靠 touched_at 保住。过期条目由 store 的 TTL 自动过滤。
        """
        if self._store.count(self._ns) < MAX_SESSIONS:
            return
        removed = self._store.prune(self._ns, MAX_SESSIONS - CLEANUP_BATCH)
        logger.info("短时会话池满(%s)，按 LRU 淘汰 %s 个最旧会话", MAX_SESSIONS, removed)

    def get_history(self, session_id: str = "default") -> list[ShortTermTurn]:
        """读取会话的短时历史（惰性清理过期会话）。"""
        session = self._load(session_id)
        if session is None:
            return []
        # 读取也刷新活跃时间：长期活跃的会话不会因为「创建得早」而被淘汰
        self._save(session_id, session)
        return [ShortTermTurn(role=m.role, content=m.content) for m in session.messages]

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

        session = self._load(session_id)
        if session is None:
            self._make_room()
            session = ShortTermSession()
        session.messages.append(ShortTermTurn(role="user", content=clean_user))
        session.messages.append(ShortTermTurn(role="assistant", content=clean_assistant))

        max_messages = MAX_TURNS * 2
        if len(session.messages) > max_messages:
            session.messages = session.messages[-max_messages:]
        self._save(session_id, session)

    def clear(self, session_id: str = "default") -> None:
        """清空会话短时记忆。

        用于「快路径 / 缓存命中执行成功」后重置上下文，以及用户主动清除记忆的场景，
        防止已完成的独立意图继续影响下一轮指代消解。
        """
        existed = self._store.get(self._ns, session_id) is not None
        self._store.delete(self._ns, session_id)
        if existed:
            logger.info('已清空短时记忆: session="%s"', session_id)

    def remember_targets(self, session_id: str, entity_ids: list[str]) -> None:
        """记录本轮控制命中的实体，供 45 秒内的「它」指代消解。

        只保留字符串 ID 并去重；空列表视为「明确没有目标」，用于清掉旧目标。
        """
        if not session_id:
            return
        unique = list(dict.fromkeys(str(eid) for eid in entity_ids if str(eid or "").strip()))
        session = self._load(session_id)
        if session is None:
            if not unique:
                return
            self._make_room()
            session = ShortTermSession()
        session.last_targets = unique
        self._save(session_id, session)

    def get_last_targets(self, session_id: str) -> list[str]:
        """读取最近一次控制目标；会话过期时返回空列表。"""
        session = self._load(session_id)
        return list(session.last_targets) if session is not None else []


__all__ = [
    "CLEANUP_BATCH",
    "MAX_SESSIONS",
    "MAX_TURNS",
    "SESSION_TTL_MS",
    "STORE_NAMESPACE",
    "AgentShortTermMemoryService",
    "ShortTermSession",
    "ShortTermTurn",
]
