"""指令缓存服务（学习式）。"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import delete, select

from ...platform.core.models import AgentCommandCacheRow

logger = logging.getLogger("homeos.agent.command_cache")

#: 缓存条目上限，超过则按 FIFO 清理一批旧条目
MAX_SIZE = 500
#: 触发清理时一次删除的条目数
CLEANUP_SIZE = 50
#: 自动纠正的时间窗口：最近一次操作后 30 秒内同房间重做视为纠正
CORRECTION_WINDOW = 30_000
#: 未登录 / 匿名场景的兜底缓存命名空间
ANONYMOUS_SCOPE = "global"

_FILLER_WORDS = re.compile(r"[的吗了呢啊哦呀呗]+")
_SOFT_WORDS = re.compile(r"一下|一点|所有|全部|整个|都|掉")


@dataclass
class CacheEntry:
    """缓存条目：工具名 + 参数 + 命中次数 + 是否已确认。"""

    tool_name: str = ""
    tool_args: dict[str, Any] = field(default_factory=dict)
    hit_count: int = 0
    confirmed: bool = False


@dataclass
class LastAction:
    """最近一次操作的快照，用于纠正 / 自动纠正判定。"""

    #: 操作时间戳（ms）
    timestamp: int = 0
    #: 用户原话（未规范化）
    raw_text: str = ""
    tool_name: str = ""
    tool_args: dict[str, Any] = field(default_factory=dict)
    #: 操作者用户 ID（纠正逻辑按用户隔离）
    user_id: str | None = None


def _now_ms() -> int:
    return int(time.time() * 1000)


def _dump(value: Any) -> str:
    """对齐 JS ``JSON.stringify`` 的对象比较语义（保序、不转义中文）。"""
    try:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    except (TypeError, ValueError):
        return ""


class CommandCacheService:
    """指令缓存服务。

    通过 get / set / correct_last / try_auto_correct / clear 管理“原话 → 工具”映射。
    缓存按用户 ID 隔离：同一原话在不同用户账户下独立学习 / 命中，避免共享串号。
    """

    def __init__(self, session_factory: Any = None) -> None:
        #: 原话规范化后的缓存表
        self._cache: dict[str, CacheEntry] = {}
        #: 最近一次操作，用于纠正逻辑
        self._last_action: LastAction | None = None
        #: 数据库会话工厂；None 时保持纯内存（单测 / 精简装配）
        self._session_factory = session_factory
        #: 已从数据库加载过的用户命名空间
        self._loaded_scopes: set[str] = set()

    # 持久化
    @staticmethod
    def _split_key(key: str) -> tuple[str, str]:
        """把 ``scope::原话`` 拆成 (scope, 规范化原话)。"""
        scope, _, normalized = key.partition("::")
        return scope or ANONYMOUS_SCOPE, normalized

    def _ensure_loaded(self, scope: str) -> None:
        """首次访问某用户时从数据库回填缓存（DB 不可用时静默降级）。"""
        if self._session_factory is None or scope in self._loaded_scopes:
            return
        self._loaded_scopes.add(scope)
        try:
            with self._session_factory() as session:
                rows = list(
                    session.execute(
                        select(AgentCommandCacheRow)
                        .where(AgentCommandCacheRow.scope == scope)
                        .order_by(AgentCommandCacheRow.updated_at.desc())
                        .limit(MAX_SIZE)
                    ).scalars()
                )
        except Exception as exc:  # pragma: no cover - 依赖真实数据库的防御分支
            logger.warning("指令缓存回填失败(保持内存): %s", exc)
            return
        for row in rows:
            if len(self._cache) >= MAX_SIZE:
                break
            try:
                args = json.loads(row.tool_args or "{}")
            except (TypeError, ValueError):
                args = {}
            key = f"{scope}::{row.cache_key}"
            self._cache.setdefault(
                key,
                CacheEntry(
                    tool_name=row.tool_name,
                    tool_args=args if isinstance(args, dict) else {},
                    hit_count=int(row.hit_count or 0),
                    confirmed=bool(row.confirmed),
                ),
            )

    def _persist(self, key: str, entry: CacheEntry) -> None:
        """把单条缓存 upsert 到数据库（best-effort，失败不影响内存语义）。"""
        if self._session_factory is None:
            return
        scope, normalized = self._split_key(key)
        payload = _dump(entry.tool_args) or "{}"
        try:
            with self._session_factory() as session:
                row = session.execute(
                    select(AgentCommandCacheRow).where(
                        AgentCommandCacheRow.scope == scope,
                        AgentCommandCacheRow.cache_key == normalized,
                    )
                ).scalars().first()
                if row is None:
                    session.add(
                        AgentCommandCacheRow(
                            scope=scope,
                            cache_key=normalized,
                            tool_name=entry.tool_name,
                            tool_args=payload,
                            hit_count=entry.hit_count,
                            confirmed=entry.confirmed,
                        )
                    )
                else:
                    row.tool_name = entry.tool_name
                    row.tool_args = payload
                    row.hit_count = entry.hit_count
                    row.confirmed = entry.confirmed
                session.commit()
        except Exception as exc:  # pragma: no cover - 依赖真实数据库的防御分支
            logger.warning("指令缓存落库失败: %s", exc)

    def _delete_persisted(self, key: str) -> None:
        if self._session_factory is None:
            return
        scope, normalized = self._split_key(key)
        try:
            with self._session_factory() as session:
                session.execute(
                    delete(AgentCommandCacheRow).where(
                        AgentCommandCacheRow.scope == scope,
                        AgentCommandCacheRow.cache_key == normalized,
                    )
                )
                session.commit()
        except Exception as exc:  # pragma: no cover
            logger.warning("指令缓存删除落库失败: %s", exc)

    # key
    def key_of(self, text: str, user_id: str | None = None) -> str:
        """用户级缓存 key：``scope::原话``，未提供用户时退化为全局命名空间。"""
        scope = (user_id or "").strip() or ANONYMOUS_SCOPE
        return f"{scope}::{self.normalize(text)}"

    @staticmethod
    def normalize(text: str) -> str:
        """规范化原话为缓存 key：去空白 / 去语气词 / 去修饰词。

        让“帮我把客厅的灯打开一下”与“客厅灯打开”命中同一缓存。
        """
        out = re.sub(r"\s+", " ", str(text or "").strip())
        out = _FILLER_WORDS.sub("", out)
        return _SOFT_WORDS.sub("", out)

    # 读写
    def get(self, text: str, user_id: str | None = None) -> CacheEntry | None:
        """查询缓存（含未确认条目，由调用方检查 confirmed 决定是否执行）。"""
        key = self.key_of(text, user_id)
        self._ensure_loaded(self._split_key(key)[0])
        entry = self._cache.get(key)
        if entry is not None:
            if not entry.confirmed:
                logger.info('缓存命中(待确认): "%s" → %s', key, entry.tool_name)
                return entry
            entry.hit_count += 1
            self._persist(key, entry)
            logger.info(
                '缓存命中(已确认,第%s次): "%s" → %s(%s)',
                entry.hit_count,
                key,
                entry.tool_name,
                _dump(entry.tool_args),
            )
        return entry

    def confirm(self, text: str, user_id: str | None = None) -> bool:
        """将指定原话对应的缓存条目提升为已确认状态。"""
        key = self.key_of(text, user_id)
        self._ensure_loaded(self._split_key(key)[0])
        entry = self._cache.get(key)
        if entry is not None and not entry.confirmed:
            entry.confirmed = True
            self._persist(key, entry)
            logger.info('缓存已确认(用户再说一次确认): "%s"', key)
            return True
        return False

    def set(
        self,
        text: str,
        tool_name: str,
        tool_args: dict[str, Any],
        from_fast_path: bool,
        user_id: str | None = None,
    ) -> None:
        """写入缓存。

        规则（严格单调，只升不降）：
        - 映射一致 → 标记 confirmed 并累加 hit_count（首次提升日志「二次验证通过」）；
        - 映射新增 / 变更 → 以本次来源（快路径 / LLM）决定 confirmed，hit_count 归零。
        已确认条目**不会**因为 LLM 兜底重复命中而被改回未确认。
        """
        if len(self._cache) >= MAX_SIZE:
            keys = list(self._cache.keys())[:CLEANUP_SIZE]
            for key in keys:
                self._cache.pop(key, None)
            logger.info("缓存满(%s),清理了%s条", MAX_SIZE, CLEANUP_SIZE)
        key = self.key_of(text, user_id)
        self._ensure_loaded(self._split_key(key)[0])
        existing = self._cache.get(key)
        is_same = (
            existing is not None
            and existing.tool_name == tool_name
            and _dump(existing.tool_args) == _dump(tool_args)
        )

        if existing is not None and is_same:
            # 映射一致：二次命中即确认（含 LLM 兜底路径，保留原有「二次验证」语义），
            # 且**永不**把已确认条目降级为未确认——否则 LLM 兜底会把快路径学到的
            # 可信缓存打回待确认，用户每次都要再确认一遍。
            just_confirmed = not existing.confirmed
            existing.confirmed = True
            existing.hit_count += 1
            if just_confirmed:
                logger.info('缓存自动确认(二次验证通过): "%s"', key)
            else:
                logger.info(
                    '缓存命中(已确认·映射一致,第%s次): "%s" → %s(%s)',
                    existing.hit_count,
                    key,
                    existing.tool_name,
                    _dump(existing.tool_args),
                )
        else:
            # 映射新增，或映射发生变化（信任度重置：以本次来源决定是否已确认）
            self._cache[key] = CacheEntry(
                tool_name=tool_name,
                tool_args=dict(tool_args or {}),
                hit_count=0,
                confirmed=from_fast_path,
            )
            if existing is None:
                logger.info(
                    '缓存学习(%s): "%s" → %s',
                    "快路径·已确认" if from_fast_path else "LLM·待确认",
                    key,
                    tool_name,
                )
            else:
                logger.info(
                    '缓存更新(映射变更·%s): "%s" → %s(原: %s)',
                    "快路径·已确认" if from_fast_path else "LLM·待确认",
                    key,
                    tool_name,
                    existing.tool_name,
                )

        self._last_action = LastAction(
            timestamp=_now_ms(),
            raw_text=text,
            tool_name=tool_name,
            tool_args=dict(tool_args or {}),
            user_id=(user_id or "").strip() or None,
        )
        if key in self._cache:
            self._persist(key, self._cache[key])

    def correct_last(self, user_id: str | None = None) -> str | None:
        """用户主动纠正：删除最近一条缓存并返回其原话，供上层用新指令重新执行。"""
        last = self._last_action
        if last is None:
            return None
        if (user_id or "").strip() and last.user_id and last.user_id != (user_id or "").strip():
            return None
        raw_text = last.raw_text
        key = self.key_of(raw_text, last.user_id)
        deleted = self._cache.pop(key, None) is not None
        self._delete_persisted(key)
        logger.info('用户纠正: %s "%s"', "已删除" if deleted else "无缓存", key)
        self._last_action = None
        return raw_text if deleted else None

    def try_auto_correct(
        self,
        text: str,
        tool_name: str,
        tool_args: dict[str, Any],
        user_id: str | None = None,
    ) -> bool:
        """自动纠正：30 秒内对同房间 / 同类型重新操作时，删除旧的错误缓存。"""
        last = self._last_action
        if last is None:
            return False
        if (user_id or "").strip() and last.user_id and last.user_id != (user_id or "").strip():
            return False
        if _now_ms() - last.timestamp > CORRECTION_WINDOW:
            return False
        if tool_name != last.tool_name:
            return False
        same = _dump(tool_args) == _dump(last.tool_args)
        if not same:
            prev_key = self.key_of(last.raw_text, last.user_id)
            self._cache.pop(prev_key, None)
            self._delete_persisted(prev_key)
            logger.info('自动纠正: 30s内重新操作同房间/同类型,删除旧缓存 "%s"', prev_key)
            return True
        return False

    def delete(self, text: str, user_id: str | None = None) -> None:
        """删除指定原话对应的缓存（用于缓存执行失败后清理），按用户隔离。"""
        key = self.key_of(text, user_id)
        self._cache.pop(key, None)
        self._delete_persisted(key)

    @property
    def size(self) -> int:
        """当前缓存条目数。"""
        return len(self._cache)

    def clear(self, user_id: str | None = None) -> None:
        """清空指定用户（或全部）缓存与最近操作记录（对应“清除记忆”口令）。"""
        scope = (user_id or "").strip() or ANONYMOUS_SCOPE
        if scope == ANONYMOUS_SCOPE:
            count = len(self._cache)
            self._cache.clear()
            self._last_action = None
            self._clear_persisted(None)
            logger.info("缓存已清空(%s条)", count)
            return
        removed = 0
        for key in list(self._cache.keys()):
            if key.startswith(f"{scope}::"):
                self._cache.pop(key, None)
                removed += 1
        if self._last_action is not None and self._last_action.user_id == scope:
            self._last_action = None
        self._clear_persisted(scope)
        logger.info("用户 [%s] 缓存已清空(%s条)", scope, removed)

    def _clear_persisted(self, scope: str | None) -> None:
        """删除数据库中的缓存（scope=None 表示全部）。"""
        if self._session_factory is None:
            return
        try:
            with self._session_factory() as session:
                stmt = delete(AgentCommandCacheRow)
                if scope is not None:
                    stmt = stmt.where(AgentCommandCacheRow.scope == scope)
                session.execute(stmt)
                session.commit()
        except Exception as exc:  # pragma: no cover
            logger.warning("指令缓存清空落库失败: %s", exc)


__all__ = [
    "ANONYMOUS_SCOPE",
    "CORRECTION_WINDOW",
    "MAX_SIZE",
    "CacheEntry",
    "CommandCacheService",
    "LastAction",
]
