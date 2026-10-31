"""指令缓存服务（学习式）。"""

from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import delete, select

from ....platform.core.db.models import AgentCommandCacheRow

logger = logging.getLogger("homeos.agent.command_cache")

#: 缓存条目上限，超过则按 FIFO 清理一批旧条目
MAX_SIZE = 500
#: 触发清理时一次删除的条目数
CLEANUP_SIZE = 50
#: 自动纠正的时间窗口：最近一次操作后 30 秒内同房间重做视为纠正
CORRECTION_WINDOW = 30_000
#: 未登录 / 匿名场景的兜底缓存命名空间
ANONYMOUS_SCOPE = "global"
#: 同一句原话学到两组不同参数后的封禁时长：期间不再缓存，让每次请求重新走语义解析。
#: 参数不同说明它依赖上下文（省略的房间、当前亮度），把它当成「这句话的唯一含义」就会
#: 重放到错的设备上 —— 宁可少命中几次。
UNSTABLE_TTL_MS = 10 * 60 * 1000
#: 封禁的原话条数上限（防止被海量不同原话撑爆内存）
UNSTABLE_MAX = 500
#: 命中计数每累计这么多次才写一次库：命中在异步热路径上，逐次落库会阻塞事件循环
HIT_PERSIST_EVERY = 20

#: 只剔除**纯语气词**。绝不能把「全部 / 所有 / 一点 / 都 / 掉 / 整个」当语气词删掉：
#: 它们承载作用域与幅度（``关掉全部灯`` vs ``关掉灯``、``调亮一点`` vs ``调亮``），
#: 删掉后两种意图会落到同一个缓存 key，命中即执行到错的设备 / 错的幅度上。
_FILLER_WORDS = re.compile(r"[的吗呢啊哦呀呗]+")
_SOFT_WORDS = re.compile(r"一下")
#: 参数名以这些词结尾表示「增量」而非绝对值：重放语义不变，不参与「数字必须出现在原话里」的校验
_RELATIVE_ARG_RE = re.compile(r"(delta|step|increment|offset|by)$", re.IGNORECASE)


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


def _iter_absolute_numbers(value: Any) -> Iterator[float]:
    """收集参数里的**绝对**数字（跳过 bool 与 ``xxxDelta`` 这类增量字段）。"""
    if isinstance(value, dict):
        for key, item in value.items():
            if _RELATIVE_ARG_RE.search(str(key)):
                continue
            yield from _iter_absolute_numbers(item)
        return
    if isinstance(value, (list, tuple, set, frozenset)):
        for item in value:
            yield from _iter_absolute_numbers(item)
        return
    if isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        yield float(value)


def _number_token(number: float) -> str:
    """数字在原文里的常见写法（``70`` / ``70.5``）；避免 ``:g`` 把大整数写成 ``1e+06``。"""
    return str(int(number)) if number.is_integer() else f"{number:g}"


def _args_replayable(text: str, args: Any) -> bool:
    """参数里的绝对数字必须能在原话里找到，否则它是从设备当前状态推出来的。

    ``调亮一点`` → ``{"brightness": 70}``：70 来自「当前 60 + 10」。把这条缓存学下来，
    下次灯已经在 90 时再命中，就会被硬调回 70（看起来像「调暗」）。这类参数不可重放，
    直接不学。
    """
    return all(_number_token(number) in text for number in _iter_absolute_numbers(args))


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
        #: 「同一句原话学到不同参数」的封禁表：key → 解禁时间(ms)
        self._unstable: dict[str, int] = {}

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
        """规范化原话为缓存 key：去空白 / 去语气词。

        “帮我把客厅的灯打开一下”与“帮我把客厅灯打开”因此落到同一个 key；但**保留**承载
        作用域与幅度词的「全部 / 所有 / 一点 / 都 / 掉 / 整个」——删掉它们会让“关掉全部灯”
        和“关掉灯”共用一条缓存，命中即操作到错的设备。
        """
        out = re.sub(r"\s+", " ", str(text or "").strip())
        out = _FILLER_WORDS.sub("", out)
        return _SOFT_WORDS.sub("", out)

    # 「同一句话对应多组参数」封禁
    def _is_unstable(self, key: str) -> bool:
        until = self._unstable.get(key)
        if until is None:
            return False
        if until <= _now_ms():
            self._unstable.pop(key, None)
            return False
        return True

    def _mark_unstable(self, key: str) -> None:
        if len(self._unstable) >= UNSTABLE_MAX:
            now = _now_ms()
            expired = [item for item, until in self._unstable.items() if until <= now]
            for item in expired:
                self._unstable.pop(item, None)
            while len(self._unstable) >= UNSTABLE_MAX:
                self._unstable.pop(next(iter(self._unstable)), None)
        self._unstable[key] = _now_ms() + UNSTABLE_TTL_MS

    def _forget(self, key: str) -> bool:
        """删除一条缓存（内存 + 落库），返回此前是否存在。"""
        existed = self._cache.pop(key, None) is not None
        self._delete_persisted(key)
        return existed

    # 读写
    def get(self, text: str, user_id: str | None = None) -> CacheEntry | None:
        """查询缓存（含未确认条目，由调用方检查 confirmed 决定是否执行）。"""
        key = self.key_of(text, user_id)
        if self._is_unstable(key):
            logger.info('缓存已封禁(同一句话曾对应多组参数): "%s"', key)
            return None
        self._ensure_loaded(self._split_key(key)[0])
        entry = self._cache.get(key)
        if entry is not None:
            if not entry.confirmed:
                logger.info('缓存命中(待确认): "%s" → %s', key, entry.tool_name)
                return entry
            entry.hit_count += 1
            # 命中在异步热路径上：逐次写库会阻塞事件循环，按固定间隔抽样落库
            if entry.hit_count % HIT_PERSIST_EVERY == 0:
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
        - 映射新增 → 以本次来源（快路径 / LLM）决定 confirmed，hit_count 归零；
        - 同一句话学到**另一组参数** → 说明参数依赖上下文，删缓存并短期封禁，绝不覆盖。
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
        self._record_last_action(text, tool_name, tool_args, user_id)

        if self._is_unstable(key):
            logger.info('缓存不学习(已封禁): "%s" → %s', key, tool_name)
            return
        if not _args_replayable(text, tool_args):
            # 参数里的数字不在原话里：它来自设备当前状态，重放会把设备拉回旧值
            logger.info('缓存不学习(参数含推断值): "%s" → %s(%s)', key, tool_name, _dump(tool_args))
            self._forget(key)
            return

        if existing is None:
            self._cache[key] = CacheEntry(
                tool_name=tool_name,
                tool_args=dict(tool_args or {}),
                hit_count=0,
                confirmed=from_fast_path,
            )
            logger.info(
                '缓存学习(%s): "%s" → %s',
                "快路径·已确认" if from_fast_path else "LLM·待确认",
                key,
                tool_name,
            )
            self._persist(key, self._cache[key])
            return

        is_same = existing.tool_name == tool_name and _dump(existing.tool_args) == _dump(tool_args)
        if not is_same:
            # 同一句话对应两组不同参数：谁都不该被当成「这句话的唯一含义」，
            # 后写方覆盖先写方就等于把上一台的设备 / 幅度偷换掉。丢缓存并封禁一段时间。
            self._forget(key)
            self._mark_unstable(key)
            logger.warning(
                '缓存冲突(同一句话对应不同参数),已删除并封禁%ss: "%s" 原=%s(%s) 现=%s(%s)',
                UNSTABLE_TTL_MS // 1000,
                key,
                existing.tool_name,
                _dump(existing.tool_args),
                tool_name,
                _dump(tool_args),
            )
            return

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
        self._persist(key, existing)

    def _record_last_action(
        self,
        text: str,
        tool_name: str,
        tool_args: dict[str, Any],
        user_id: str | None,
    ) -> None:
        """记录最近一次操作（无论是否学进缓存），供纠正逻辑使用。"""
        self._last_action = LastAction(
            timestamp=_now_ms(),
            raw_text=text,
            tool_name=tool_name,
            tool_args=dict(tool_args or {}),
            user_id=(user_id or "").strip() or None,
        )

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
            self._forget(prev_key)
            logger.info('自动纠正: 30s内重新操作同房间/同类型,删除旧缓存 "%s"', prev_key)
            return True
        return False

    def delete(self, text: str, user_id: str | None = None) -> None:
        """删除指定原话对应的缓存（用于缓存执行失败后清理），按用户隔离。

        同时解除封禁：这是「设备变了、重建缓存」的入口，继续封禁会让它永远学不回来。
        """
        key = self.key_of(text, user_id)
        self._forget(key)
        self._unstable.pop(key, None)

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
            self._unstable.clear()
            self._last_action = None
            self._clear_persisted(None)
            logger.info("缓存已清空(%s条)", count)
            return
        removed = 0
        for key in list(self._cache.keys()):
            if key.startswith(f"{scope}::"):
                self._cache.pop(key, None)
                removed += 1
        for key in [item for item in self._unstable if item.startswith(f"{scope}::")]:
            self._unstable.pop(key, None)
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
    "HIT_PERSIST_EVERY",
    "MAX_SIZE",
    "UNSTABLE_MAX",
    "UNSTABLE_TTL_MS",
    "CacheEntry",
    "CommandCacheService",
    "LastAction",
]
