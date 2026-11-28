"""语音会话的标识工具。

为什么单独一个模块：会话 key 的构造规则同时被 ``api/agent.py``（语音接口）和
``api/voice_device.py``（设备鉴权）需要。放在其中任何一边都会让两个路由模块互相 import
（`check:deps` 的 B4/B5 会直接判环）。这里只依赖标准库，谁都能引。
"""

from __future__ import annotations

import hashlib


def voice_session_key(grant_id: str, user_id: str, conversation_id: str) -> str:
    """语音会话 key：按音箱 + 账号 + 对话隔离。

    - 不能只用 ``conversationId``：两台音箱各自有独立的 ``c1``，共用一份历史会让 A 的追问
      落到 B 的上下文里；
    - 不能只用账号：同一账号的 web 对话与音箱对话要分开；
    - 对话 id 做摘要而不是原样拼：它由音箱侧生成，长度与字符集都不受本项目控制。
    """
    digest = hashlib.sha256(f"{grant_id}|{conversation_id}".encode()).hexdigest()[:16]
    return f"voice:{user_id}:{digest}"


__all__ = ["voice_session_key"]
