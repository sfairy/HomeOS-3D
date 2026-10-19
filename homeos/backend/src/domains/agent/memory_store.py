"""Agent 长期记忆：设备 / 房间别名与用户偏好。

- **别名**：用户说「记住主灯是客厅主灯」后，快路径会先把「主灯」展开成
  「客厅主灯」再解析，从而命中确定性控制；LLM 路径也能从系统提示里看到偏好；
- **偏好**：如「记住我的偏好是晚上客厅灯火不要太亮」，以补充说明形式拼进系统提示；
- **作用域**：按登录用户隔离；未绑定身份时落到会话 / anon，不跨用户共享；
- **降级**：数据库不可用时退回进程内字典，不影响对话主流程。

数据表见 ``platform.core.models.AgentMemoryRow``。
"""

from __future__ import annotations

import logging
import re
import time
from typing import Any

from sqlalchemy import delete, select

from ...platform.core.models import AgentMemoryRow

logger = logging.getLogger("homeos.agent.memory")

#: 别名 / 偏好缓存有效期（避免每轮对话都查库）
CACHE_TTL_MS = 60_000
#: 记住：「记住主灯就是客厅主灯」/「把主灯叫做客厅主灯」
REMEMBER_PATTERNS = (
    re.compile(
        r"^(?:请)?记住[:：]?(?P<alias>[^，,。]{1,40}?)(?:就是|是|=|叫做|叫)(?P<target>[^。]{1,80})$"
    ),
    re.compile(r"^把(?P<alias>[^，,。]{1,40}?)(?:叫做|称为|记作)(?P<target>[^。]{1,80})$"),
)
#: 偏好：「记住我的偏好是 …」
PREFERENCE_PATTERN = re.compile(
    r"^(?:请)?记住[:：]?(?:我|我的)?(?:偏好|习惯)(?:是|为|[:：])?(?P<value>.+)$"
)
#: 忘记：「忘记主灯」/「忘掉别名 主灯」
FORGET_PATTERN = re.compile(
    r"^(?:请)?(?:忘记|忘掉|删除记忆)[:：]?(?:别名)?[:：]?(?P<alias>.+)$"
)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _norm(value: str) -> str:
    return str(value or "").strip().lower()


class AgentMemoryService:
    """长期记忆服务（DB 优先，内存降级）。"""

    def __init__(self, session_factory: Any = None) -> None:
        self._session_factory = session_factory
        #: 纯内存降级：scope → {(kind, key): value}
        self._local: dict[str, dict[tuple[str, str], str]] = {}
        #: scope → (loadedAt, {(kind, key): value})
        self._cache: dict[str, tuple[int, dict[tuple[str, str], str]]] = {}

    # 读写
    def remember(self, scope: str, alias: str, value: str, kind: str = "alias") -> bool:
        """写入 / 覆盖一条记忆；空值或空 key 返回 False。"""
        scope = str(scope or "").strip() or "anon"
        key = _norm(alias)
        text = str(value or "").strip()
        if len(key) < 2 or not text:
            return False
        if self._session_factory is None:
            self._local.setdefault(scope, {})[(kind, key)] = text
            self._invalidate(scope)
            return True
        try:
            with self._session_factory() as session:
                row = session.execute(
                    select(AgentMemoryRow).where(
                        AgentMemoryRow.scope == scope,
                        AgentMemoryRow.kind == kind,
                        AgentMemoryRow.memory_key == key,
                    )
                ).scalars().first()
                if row is None:
                    session.add(
                        AgentMemoryRow(
                            scope=scope,
                            kind=kind,
                            memory_key=key,
                            value=text,
                            confidence=1.0,
                        )
                    )
                else:
                    row.value = text
                    row.confidence = 1.0
                session.commit()
        except Exception as exc:  # pragma: no cover - 真实数据库防御分支
            logger.warning("长期记忆落库失败,退回内存: %s", exc)
            self._local.setdefault(scope, {})[(kind, key)] = text
        self._invalidate(scope)
        return True

    def forget(self, scope: str, alias: str, kind: str = "alias") -> bool:
        """删除一条别名 / 偏好。"""
        scope = str(scope or "").strip() or "anon"
        key = _norm(alias)
        removed = self._local.get(scope, {}).pop((kind, key), None) is not None
        if self._session_factory is not None:
            try:
                with self._session_factory() as session:
                    result = session.execute(
                        delete(AgentMemoryRow).where(
                            AgentMemoryRow.scope == scope,
                            AgentMemoryRow.kind == kind,
                            AgentMemoryRow.memory_key == key,
                        )
                    )
                    session.commit()
                    removed = removed or bool(result.rowcount)
            except Exception as exc:  # pragma: no cover
                logger.warning("长期记忆删除失败: %s", exc)
        self._invalidate(scope)
        return removed

    def clear(self, scope: str) -> None:
        """清空某个用户的全部长期记忆（「清除记忆」口令）。"""
        scope = str(scope or "").strip() or "anon"
        self._local.pop(scope, None)
        if self._session_factory is not None:
            try:
                with self._session_factory() as session:
                    session.execute(delete(AgentMemoryRow).where(AgentMemoryRow.scope == scope))
                    session.commit()
            except Exception as exc:  # pragma: no cover
                logger.warning("长期记忆清空失败: %s", exc)
        self._invalidate(scope)

    def list_memories(self, scope: str) -> list[dict[str, str]]:
        """列出某个用户的全部记忆（供设置页 / API 管理）。"""
        scope = str(scope or "").strip() or "anon"
        items = self._load(scope)
        return [
            {"kind": kind, "key": key, "value": value}
            for (kind, key), value in sorted(items.items())
        ]

    # 读取 / 缓存
    def _invalidate(self, scope: str) -> None:
        self._cache.pop(scope, None)

    def _load(self, scope: str) -> dict[tuple[str, str], str]:
        cached = self._cache.get(scope)
        if cached is not None and _now_ms() - cached[0] < CACHE_TTL_MS:
            return cached[1]
        items: dict[tuple[str, str], str] = dict(self._local.get(scope, {}))
        if self._session_factory is not None:
            try:
                with self._session_factory() as session:
                    rows = list(
                        session.execute(
                            select(AgentMemoryRow).where(AgentMemoryRow.scope == scope)
                        ).scalars()
                    )
            except Exception as exc:  # pragma: no cover
                logger.warning("长期记忆读取失败(使用内存): %s", exc)
                rows = []
            for row in rows:
                items[(row.kind, row.memory_key)] = row.value
        self._cache[scope] = (_now_ms(), items)
        return items

    def alias_map(self, scope: str) -> dict[str, str]:
        """返回 ``{别名: 目标名称}``（仅 alias 类记忆）。"""
        return {
            key: value
            for (kind, key), value in self._load(scope).items()
            if kind == "alias"
        }

    def preference_text(self, scope: str) -> str:
        """拼出用户的偏好补充说明（注入系统提示）。"""
        values = [
            value for (kind, _key), value in self._load(scope).items() if kind == "preference"
        ]
        return "；".join(values)

    @staticmethod
    def expand(text: str, aliases: dict[str, str]) -> str:
        """按别名长度倒序替换原话（长别名优先，避免「主灯」先吃掉「客厅主灯」）。"""
        out = str(text or "")
        for alias in sorted(aliases, key=len, reverse=True):
            if len(alias) < 2:
                continue
            out = out.replace(alias, aliases[alias])
        return out


def parse_memory_command(text: str) -> tuple[str, str, str] | None:
    """解析「记住 / 忘记」口令，返回 ``(action, alias, value)``。

    action 取 ``alias`` / ``preference`` / ``forget``。
    """
    raw = str(text or "").strip()
    if not raw:
        return None
    match = PREFERENCE_PATTERN.match(raw)
    if match:
        return "preference", f"pref:{_norm(match.group('value'))[:40]}", match.group("value").strip()
    for pattern in REMEMBER_PATTERNS:
        match = pattern.match(raw)
        if match:
            return "alias", match.group("alias").strip(), match.group("target").strip()
    match = FORGET_PATTERN.match(raw)
    if match:
        return "forget", match.group("alias").strip(), ""
    return None


__all__ = ["AgentMemoryService", "parse_memory_command"]
