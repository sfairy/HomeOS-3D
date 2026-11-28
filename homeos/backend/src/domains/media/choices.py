"""点歌「候选槽」：多版本同名歌曲的二次选择。

为什么需要：一次点歌可能搜到多首同名（不同专辑 / 现场版），参考实现此时会把候选存进
会话记忆，用户下一句说「播放第二个版本」即可确定，不必重新描述。没有这个槽，用户只能
再完整说一遍歌名，而且快路径仍会撞回同一个歧义。

语义（逐条对齐参考实现）：

- 槽按**会话**存，90 秒后失效（与短时记忆同一窗口）；
- 命中「第 N 个 / 首 / 版本」时按 1-based 取；越界明确告知有几个候选；
- 播放成功后清槽（避免「再说一次第二个」重复下发）；
- 只存 ``uri`` / ``name`` 与房间名，不存整个搜索响应。
"""

from __future__ import annotations

import re
import time
from typing import Any

#: 候选有效期（毫秒）：与参考 ``MUSIC_CHOICE_TTL_MS`` 一致。
CHOICE_TTL_MS = 90_000
#: 共享状态命名空间
STORE_NAMESPACE = "media.choices"

#: 「播放第二个版本」「选第 2 首」这类口令（整句匹配，避免劫持普通语句）。
#:
#: 只认带「个 / 首 / 版本」的形式：光说一个数字（「2」）在别的场景里太常见，
#: 把它当点歌选择会误伤。
_CHOICE_RE = re.compile(
    r"^(?:(?:请|請|帮我|幫我|给我|給我|那就|让他|讓他|我选|我選))*(?:播放|播|选|選)?第"
    r"([一二两兩三四五六七八九十]|\d{1,2})(?:(?:个|個|首)(?:版本)?|版本)(?:吧|就好)?[。！？.!?]*$",
    re.UNICODE,
)

_CN_DIGITS = "〇一二三四五六七八九十"


def parse_choice_index(text: str) -> int | None:
    """解析「第 N 个」→ 1-based 序号；不匹配返回 ``None``。

    中文数字只支持 1–10（够用：候选最多 4 个）；``十一`` 这类不认，交给 LLM。
    """
    normalized = re.sub(r"\s+", "", str(text or ""))
    match = _CHOICE_RE.match(normalized)
    if match is None:
        return None
    raw = match.group(1)
    if raw.isdigit():
        index = int(raw)
    else:
        # 繁体「兩」与简体「两」都按「二」处理：两种键盘输入都常见。
        normalized_char = raw.replace("两", "二").replace("兩", "二")
        if len(normalized_char) != 1:
            return None
        index = _CN_DIGITS.index(normalized_char)
    return index if index >= 1 else None


class MediaChoiceSlot:
    """按会话保存最近一次点歌的候选（进程内 + 可注入共享存储）。"""

    def __init__(self, store: Any = None) -> None:
        self._store = store
        #: 无共享存储时的进程内兜底：``session_id -> payload``
        self._local: dict[str, dict[str, Any]] = {}

    def set(self, session_id: str, choices: list[dict[str, str]], area_name: str = "") -> None:
        """保存候选（只留 ``uri`` / ``name``）；空候选视为清空。"""
        key = str(session_id or "").strip()
        if not key:
            return
        cleaned = [
            {"uri": str(item.get("uri") or ""), "name": str(item.get("name") or "")}
            for item in choices
            if isinstance(item, dict) and str(item.get("uri") or "").strip()
        ]
        if not cleaned:
            self.clear(key)
            return
        payload = {
            "choices": cleaned[:5],
            "areaName": str(area_name or ""),
            "expiresAt": int(time.time() * 1000) + CHOICE_TTL_MS,
        }
        if self._store is not None:
            self._store.set(STORE_NAMESPACE, key, payload, ttl_seconds=CHOICE_TTL_MS / 1000)
        else:
            self._local[key] = payload

    def get(self, session_id: str) -> dict[str, Any] | None:
        key = str(session_id or "").strip()
        if not key:
            return None
        payload = self._store.get(STORE_NAMESPACE, key) if self._store is not None else self._local.get(key)
        if not isinstance(payload, dict):
            return None
        expires_at = payload.get("expiresAt")
        if isinstance(expires_at, (int, float)) and expires_at <= int(time.time() * 1000):
            self.clear(key)
            return None
        choices = payload.get("choices")
        if not isinstance(choices, list) or not choices:
            return None
        return {
            "choices": [item for item in choices if isinstance(item, dict)],
            "areaName": str(payload.get("areaName") or ""),
        }

    def clear(self, session_id: str) -> None:
        key = str(session_id or "").strip()
        if not key:
            return
        if self._store is not None:
            self._store.delete(STORE_NAMESPACE, key)
        else:
            self._local.pop(key, None)


__all__ = [
    "CHOICE_TTL_MS",
    "STORE_NAMESPACE",
    "MediaChoiceSlot",
    "parse_choice_index",
]
