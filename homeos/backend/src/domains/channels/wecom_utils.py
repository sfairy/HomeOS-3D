"""企业微信文本格式化与分片工具集（对齐 ``wecom/wecom.utils.ts``）。

- Markdown → 企微纯文本（去语法符号 + 标题前缀）
- 按企微单条消息 2000 字节上限对长文本进行自然断点分片
"""

from __future__ import annotations

import re

#: 企微单条文本消息的字节上限（与官方文档一致）
WECOM_TEXT_BYTE_LIMIT = 2000


def get_byte_length(text: str) -> int:
    """计算字符串在 UTF-8 编码下的字节长度（企微按字节计限）。"""
    return len(str(text).encode("utf-8"))


_CODE_BLOCK_RE = re.compile(r"```(\w*)\n([\s\S]*?)```")
_INLINE_CODE_RE = re.compile(r"`([^`]+)`")
_H3_RE = re.compile(r"^### (.+)$", re.MULTILINE)
_H2_RE = re.compile(r"^## (.+)$", re.MULTILINE)
_H1_RE = re.compile(r"^# (.+)$", re.MULTILINE)
_BOLD3_RE = re.compile(r"\*\*\*([^*]+)\*\*\*")
_BOLD_RE = re.compile(r"\*\*([^*]+)\*\*")
_ITALIC_RE = re.compile(r"\*([^*]+)\*")
_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_LIST_RE = re.compile(r"^[-*] ", re.MULTILINE)
_HR_RE = re.compile(r"^[-*_]{3,}$", re.MULTILINE)
_IMAGE_RE = re.compile(r"!\[([^\]]*)\]\([^)]+\)")


def markdown_to_wecom_text(markdown: str) -> str:
    """将 Markdown 转换为企微可读纯文本。"""
    if not markdown:
        return markdown
    text = markdown

    def _code_block(match: re.Match[str]) -> str:
        lang, code = match.group(1), match.group(2)
        lines = "\n".join(f"  {line}" for line in code.strip().split("\n"))
        return f"[{lang}]\n{lines}" if lang else lines

    text = _CODE_BLOCK_RE.sub(_code_block, text)
    text = _INLINE_CODE_RE.sub(r"\1", text)
    text = _H3_RE.sub(r"▸ \1", text)
    text = _H2_RE.sub(r"■ \1", text)
    text = _H1_RE.sub(r"◆ \1", text)
    text = _BOLD3_RE.sub(r"\1", text)
    text = _BOLD_RE.sub(r"\1", text)
    text = _ITALIC_RE.sub(r"\1", text)
    text = _LINK_RE.sub(r"\1 (\2)", text)
    text = _LIST_RE.sub("• ", text)
    text = _HR_RE.sub("────────────", text)
    text = _IMAGE_RE.sub(r"[图片: \1]", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_wecom_text(text: str, byte_limit: int = WECOM_TEXT_BYTE_LIMIT) -> list[str]:
    """按字节上限对长文本进行自然断点分片（对齐 TS 实现）。"""
    if get_byte_length(text) <= byte_limit:
        return [text]
    chunks: list[str] = []
    remaining = text
    while remaining:
        if get_byte_length(remaining) <= byte_limit:
            chunks.append(remaining)
            break
        low, high = 1, len(remaining)
        while low < high:
            mid = (low + high + 1) // 2
            if get_byte_length(remaining[:mid]) <= byte_limit:
                low = mid
            else:
                high = mid - 1
        split_index = low
        search_start = max(0, split_index - 200)
        search_text = remaining[search_start:split_index]
        natural_break = search_text.rfind("\n\n")
        if natural_break == -1:
            natural_break = search_text.rfind("\n")
        if natural_break == -1:
            natural_break = search_text.rfind("。")
            if natural_break != -1:
                natural_break += 1
        if natural_break != -1 and natural_break > 0:
            split_index = search_start + natural_break
        if split_index <= 0:
            split_index = min(len(remaining), byte_limit // 3)
        chunks.append(remaining[:split_index].strip())
        remaining = remaining[split_index:]
    return chunks


__all__ = ["WECOM_TEXT_BYTE_LIMIT", "get_byte_length", "markdown_to_wecom_text", "split_wecom_text"]
