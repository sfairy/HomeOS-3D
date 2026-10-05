"""指令缓存服务（学习式）。

职责：把“用户原话 → 工具调用”的映射缓存起来，下次同句直接命中执行，跳过 LLM 调用。
 采用“二次确认”策略：LLM 学到的指令需再次命中相同映射才标记为 confirmed；
 快路径学到的指令默认 confirmed（规则可信）。
 支持用户纠正（“不对/学错了”）删除最近一条，以及 30 秒窗口内同房间重新操作的自动纠正。
依赖：RedisService（重启后恢复学过的指令）。
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any

from src.core.redis import RedisService

logger = logging.getLogger("homeos.agent.command_cache")

#: 缓存条目上限，超过则按 FIFO 清理一批旧条目
MAX_SIZE = 500
#: 触发清理时一次删除的条目数
CLEANUP_SIZE = 50
#: 自动纠正的时间窗口：最近一次操作后 30 秒内同房间重做视为纠正
CORRECTION_WINDOW = 30_000
#: 持久化防抖延迟（秒）
PERSIST_DEBOUNCE_SECONDS = 0.2
#: 缓存持久化 Redis 键
REDIS_KEY = "homeos:agent:cmd-cache"
#: 缓存持久化 TTL（秒）
REDIS_TTL_SECONDS = 7 * 24 * 3600
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

    def __init__(self, redis: RedisService | None = None) -> None:
        self._redis = redis
        #: 原话规范化后的缓存表
        self._cache: dict[str, CacheEntry] = {}
        #: 最近一次操作，用于纠正逻辑
        self._last_action: LastAction | None = None
        self._persist_handle: Any = None

    async def init(self) -> None:
        """从 Redis 恢复缓存（对齐 ``onModuleInit``）。"""
        await self.restore()

    async def restore(self) -> None:
        if self._redis is None:
            return
        try:
            raw = await self._redis.get(REDIS_KEY)
            if not raw:
                return
            text = raw.decode() if isinstance(raw, bytes) else str(raw)
            parsed = json.loads(text)
            if not isinstance(parsed, dict):
                return
            entries = parsed.get("entries")
            if isinstance(entries, dict):
                for key, entry in entries.items():
                    if key and isinstance(entry, dict) and entry.get("toolName"):
                        self._cache[key] = CacheEntry(
                            tool_name=str(entry.get("toolName")),
                            tool_args=entry.get("toolArgs") if isinstance(entry.get("toolArgs"), dict) else {},
                            hit_count=int(entry.get("hitCount") or 0),
                            confirmed=bool(entry.get("confirmed")),
                        )
            last = parsed.get("lastAction")
            if isinstance(last, dict) and last.get("rawText"):
                self._last_action = LastAction(
                    timestamp=int(last.get("timestamp") or 0),
                    raw_text=str(last.get("rawText")),
                    tool_name=str(last.get("toolName") or ""),
                    tool_args=last.get("toolArgs") if isinstance(last.get("toolArgs"), dict) else {},
                    user_id=(str(last["userId"]).strip() if last.get("userId") else None),
                )
            if self._cache:
                logger.info("已恢复指令缓存: %s 条", len(self._cache))
        except Exception as exc:  # noqa: BLE001
            logger.debug("恢复指令缓存失败: %s", exc)

    def persist(self) -> None:
        """防抖 200ms 后写入 Redis（对齐 Nest ``setTimeout`` + fire-and-forget）。"""
        if self._redis is None:
            return
        payload = _dump(
            {
                "entries": {
                    key: {
                        "toolName": entry.tool_name,
                        "toolArgs": entry.tool_args,
                        "hitCount": entry.hit_count,
                        "confirmed": entry.confirmed,
                    }
                    for key, entry in self._cache.items()
                },
                "lastAction": (
                    {
                        "timestamp": self._last_action.timestamp,
                        "rawText": self._last_action.raw_text,
                        "toolName": self._last_action.tool_name,
                        "toolArgs": self._last_action.tool_args,
                        "userId": self._last_action.user_id,
                    }
                    if self._last_action is not None
                    else None
                ),
            }
        )

        async def _write() -> None:
            try:
                await self._redis.set(REDIS_KEY, payload, REDIS_TTL_SECONDS)
            except Exception as exc:  # noqa: BLE001
                logger.debug("指令缓存持久化失败: %s", exc)

        def _fire() -> None:
            self._persist_handle = None
            try:
                asyncio.get_running_loop().create_task(_write())
            except RuntimeError:
                pass

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        if self._persist_handle is not None:
            self._persist_handle.cancel()
        self._persist_handle = loop.call_later(PERSIST_DEBOUNCE_SECONDS, _fire)

    # ------------------------------------------------------------------ #
    # key
    # ------------------------------------------------------------------ #
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

    # ------------------------------------------------------------------ #
    # 读写
    # ------------------------------------------------------------------ #
    def get(self, text: str, user_id: str | None = None) -> CacheEntry | None:
        """查询缓存（含未确认条目，由调用方检查 confirmed 决定是否执行）。"""
        key = self.key_of(text, user_id)
        entry = self._cache.get(key)
        if entry is not None:
            if not entry.confirmed:
                logger.info('缓存命中(待确认): "%s" → %s', key, entry.tool_name)
                return entry
            entry.hit_count += 1
            logger.info(
                '缓存命中(已确认,第%s次): "%s" → %s(%s)',
                entry.hit_count,
                key,
                entry.tool_name,
                _dump(entry.tool_args),
            )
            self.persist()
        return entry

    def confirm(self, text: str, user_id: str | None = None) -> bool:
        """将指定原话对应的缓存条目提升为已确认状态。"""
        key = self.key_of(text, user_id)
        entry = self._cache.get(key)
        if entry is not None and not entry.confirmed:
            entry.confirmed = True
            logger.info('缓存已确认(用户再说一次确认): "%s"', key)
            self.persist()
            return True
        return False

    def set(  # noqa: A003 - 对齐 Nest 方法名
        self,
        text: str,
        tool_name: str,
        tool_args: dict[str, Any],
        from_fast_path: bool,
        user_id: str | None = None,
    ) -> None:
        """写入缓存。若与已有条目完全一致且未确认，则提升为 confirmed（二次验证通过）。"""
        if len(self._cache) >= MAX_SIZE:
            keys = list(self._cache.keys())[:CLEANUP_SIZE]
            for key in keys:
                self._cache.pop(key, None)
            logger.info("缓存满(%s),清理了%s条", MAX_SIZE, CLEANUP_SIZE)
        key = self.key_of(text, user_id)
        existing = self._cache.get(key)
        is_same = (
            existing is not None
            and existing.tool_name == tool_name
            and _dump(existing.tool_args) == _dump(tool_args)
        )

        if existing is not None and is_same and not existing.confirmed:
            existing.confirmed = True
            existing.hit_count += 1
            logger.info('缓存自动确认(二次验证通过): "%s"', key)
        else:
            self._cache[key] = CacheEntry(
                tool_name=tool_name,
                tool_args=dict(tool_args or {}),
                hit_count=(existing.hit_count + 1 if existing is not None and is_same else 0),
                confirmed=from_fast_path,
            )
            if existing is None:
                logger.info(
                    '缓存学习(%s): "%s" → %s',
                    "快路径·已确认" if from_fast_path else "LLM·待确认",
                    key,
                    tool_name,
                )

        self._last_action = LastAction(
            timestamp=_now_ms(),
            raw_text=text,
            tool_name=tool_name,
            tool_args=dict(tool_args or {}),
            user_id=(user_id or "").strip() or None,
        )
        self.persist()

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
        logger.info('用户纠正: %s "%s"', "已删除" if deleted else "无缓存", key)
        self._last_action = None
        self.persist()
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
            logger.info('自动纠正: 30s内重新操作同房间/同类型,删除旧缓存 "%s"', prev_key)
            self.persist()
            return True
        return False

    def delete(self, text: str, user_id: str | None = None) -> None:
        """删除指定原话对应的缓存（用于缓存执行失败后清理），按用户隔离。"""
        self._cache.pop(self.key_of(text, user_id), None)
        self.persist()

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
            logger.info("缓存已清空(%s条)", count)
            self.persist()
            return
        removed = 0
        for key in list(self._cache.keys()):
            if key.startswith(f"{scope}::"):
                self._cache.pop(key, None)
                removed += 1
        if self._last_action is not None and self._last_action.user_id == scope:
            self._last_action = None
        logger.info("用户 [%s] 缓存已清空(%s条)", scope, removed)
        self.persist()


__all__ = [
    "ANONYMOUS_SCOPE",
    "CORRECTION_WINDOW",
    "CacheEntry",
    "CommandCacheService",
    "LastAction",
    "MAX_SIZE",
    "REDIS_KEY",
]
