"""长期记忆工具族：``manage_memory``（偏好自动学习 / 遗忘）。

此前只有「记住……」口令能写记忆，用户随口说「我睡觉喜欢把灯调到 20%」不会被学习。
这里给模型一个显式写入入口，但仍守住三条边界：

- **只写偏好**：``kind`` 固定 ``preference``，别名仍走口令，避免模型把设备名改乱；
- **必须有身份**：无登录用户时拒绝写匿名记忆（匿名记忆会在所有人之间串味）；
- **有上限**：单用户最多 :data:`MAX_PREFERENCES` 条，防止模型每轮都写一条把系统提示撑爆。

作用域与对话链路共用 ``user:{id}`` 口径，写完后下一次对话的系统提示会带上。
"""

from __future__ import annotations

from typing import Any

from .home_tools_base import HomeToolsHost
from .home_tools_primitives import _s, logger
from ..memory.memory_store import MAX_PREFERENCES

#: 单条偏好内容长度上限（系统提示里会逐条拼接，太长会挤占工具 schema）
MAX_CONTENT_CHARS = 200


def _memory_scope(actor: Any) -> str | None:
    """与 ``AgentService._memory_scope`` 对齐：登录用户优先，无身份返回 None。"""
    if actor is None:
        return None
    user_id = str(getattr(actor, "user_id", "") or "").strip()
    username = str(getattr(actor, "username", "") or "").strip()
    if user_id or username:
        return f"user:{user_id or username}"
    return None


def _preference_key(content: str) -> str:
    """偏好 key：内容归一化后的前 40 字，重复内容覆盖而不是累计。"""
    return f"pref:{content.strip().lower()[:40]}"


class HomeToolsMemoryMixin(HomeToolsHost):
    """长期记忆工具族。"""

    async def _manage_memory(self, args: dict[str, Any], actor: Any = None) -> dict[str, Any]:
        """记住 / 遗忘一条长期偏好。"""
        memory = self._memory
        if memory is None:
            return {"error": "长期记忆未启用"}
        scope = _memory_scope(actor)
        if scope is None:
            return {
                "success": False,
                "blocked": True,
                "message": "未绑定执行身份，无法写入长期记忆。请在通道配置中绑定 HomeOS 用户。",
            }
        action = _s(args.get("action")).strip().lower()
        if action not in ("remember", "forget"):
            return {"error": "action 须为 remember 或 forget"}
        content = _s(args.get("content")).strip()
        if not content:
            return {"error": "content 不能为空"}
        if len(content) > MAX_CONTENT_CHARS:
            return {"error": f"内容过长（最多 {MAX_CONTENT_CHARS} 字）"}
        key = _preference_key(content)

        if action == "forget":
            removed = memory.forget(scope, key, kind="preference")
            return {
                "success": True,
                "removed": removed,
                "message": "已忘记这条偏好。" if removed else "没有找到这条偏好。",
            }

        existing = [item for item in memory.list_memories(scope) if item.get("kind") == "preference"]
        if len(existing) >= MAX_PREFERENCES and all(item.get("key") != key for item in existing):
            return {
                "success": False,
                "blocked": True,
                "message": f"偏好记忆已满（最多 {MAX_PREFERENCES} 条），请先删除一些再记新的。",
            }
        if not memory.remember(scope, key, content, kind="preference"):
            return {"success": False, "message": "这条偏好太短或内容为空，没有记住。"}
        logger.info("写入用户偏好: scope=%s key=%s", scope, key)
        return {
            "success": True,
            "content": content,
            "count": min(len(existing) + 1, MAX_PREFERENCES),
            "message": "好的，我记住了您的偏好。",
        }


__all__ = ["MAX_CONTENT_CHARS", "MAX_PREFERENCES", "HomeToolsMemoryMixin"]
