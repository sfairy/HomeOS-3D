"""IM 通道回复格式化（对齐 ``channels/reply.util.ts``）。

将 AgentService 的对话结果（AgentChatResponse）转换为 IM 通道口语化回复。

设计要点：
- 成功但 Agent 未给出明确文案时，从 SUCCESS_REPLIES 随机选一句短确认，避免冷场。
- 失败且无文案时，从 FAIL_REPLIES 随机选一句，语气更自然。
- 支持注入 pick 函数以便单测确定性取值。
"""

from __future__ import annotations

import random
import re
from collections.abc import Callable
from typing import Any

#: 成功时的短确认语料库（Agent 静默成功时随机选一句回发）
SUCCESS_REPLIES: tuple[str, ...] = (
    "搞定了",
    "收到",
    "好的",
    "已处理",
    "没问题",
    "安排上了",
    "完成",
    "好了",
    "OK",
    "办妥了",
    "处理好了",
    "照你说的做了",
    "搞定",
    "这就好",
    "行",
    "收到了",
    "好嘞",
    "得令",
    "马上去办",
    "来了",
)

#: 失败时的短回复语料库（Agent 失败且无文案时随机选一句回发）
FAIL_REPLIES: tuple[str, ...] = (
    "没成功，请重试",
    "出了点问题，再试一下",
    "没反应，换个说法试试",
    "没搞定，再试一次",
    "好像不太对，重试一下",
    "没办成，再试试看",
    "没反应，设备可能不在线",
    "出了点状况，请重试",
)

#: 安全拦截且 Agent 未给出文案时的默认提示
BLOCKED_DEFAULT_REPLY = "出于安全考虑，这个操作被拦截了。"

_CODE_BLOCK = re.compile(r"```(\w*)\n([\s\S]*?)```")
_INLINE_CODE = re.compile(r"`([^`]+)`")
_HEADING = re.compile(r"^#{1,3}\s+(.+)$", re.M)
_BOLD_ITALIC = re.compile(r"\*\*\*([^*]+)\*\*\*")
_BOLD = re.compile(r"\*\*([^*]+)\*\*")
_ITALIC = re.compile(r"\*([^*]+)\*")
_LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_EXTRA_BLANK_LINES = re.compile(r"\n{3,}")


def strip_markdown_for_channel(text: str) -> str:
    """去除回复中的 Markdown 噪音，便于企微 / MCP / 硬件屏展示。"""
    if not text:
        return text
    out = text

    def _code_block(match: re.Match[str]) -> str:
        lang = match.group(1)
        code = match.group(2)
        lines = "\n".join(f"  {line}" for line in code.strip().split("\n"))
        return f"[{lang}]\n{lines}" if lang else lines

    out = _CODE_BLOCK.sub(_code_block, out)
    out = _INLINE_CODE.sub(r"\1", out)
    out = _HEADING.sub(r"\1", out)
    out = _BOLD_ITALIC.sub(r"\1", out)
    out = _BOLD.sub(r"\1", out)
    out = _ITALIC.sub(r"\1", out)
    out = _LINK.sub(r"\1", out)
    out = _EXTRA_BLANK_LINES.sub("\n\n", out)
    return out.strip()


def pick_one(arr: tuple[str, ...] | list[str]) -> str:
    """从数组中随机取一项。"""
    return arr[random.randrange(len(arr))]


def format_channel_reply(
    result: Any,
    opts: dict[str, Any] | None = None,
) -> str:
    """将 Agent 结果转为 IM 口语回复；success 静默时可返回短确认语。

    转换规则：
    - ``success``：优先返回 Agent 给出的 reply；为空时随机选一句短确认。
    - ``answer``：直接回答类，必须返回 reply（无则退化为短确认）。
    - ``blocked``：被安全策略拦截，返回 reply 或默认拦截提示。
    - ``failed`` / 其他：返回 reply 或随机一句失败提示。
    """
    choose: Callable[[Any], str] = (opts or {}).get("pick") or pick_one
    outcome = result.get("outcome") if isinstance(result, dict) else getattr(result, "outcome", "")
    reply = (result.get("reply") if isinstance(result, dict) else getattr(result, "reply", "")) or ""
    if not isinstance(reply, str):
        reply = str(reply)

    if outcome == "success":
        # 有明确文案就用，否则随机短确认
        raw = reply.strip() or choose(SUCCESS_REPLIES)
    elif outcome == "answer":
        raw = reply or choose(SUCCESS_REPLIES)
    elif outcome == "blocked":
        # 安全拦截：保留 Agent 文案，否则用默认提示
        raw = reply or BLOCKED_DEFAULT_REPLY
    else:
        raw = reply or choose(FAIL_REPLIES)
    return strip_markdown_for_channel(raw)


__all__ = [
    "BLOCKED_DEFAULT_REPLY",
    "FAIL_REPLIES",
    "SUCCESS_REPLIES",
    "format_channel_reply",
    "pick_one",
    "strip_markdown_for_channel",
]
