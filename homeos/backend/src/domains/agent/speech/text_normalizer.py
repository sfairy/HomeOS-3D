"""播报文本规范化：把给眼睛看的回复改写成给耳朵听的句子。

对齐编译产物 ``tts/tts-text-normalizer.js``。模型回复里常见的 Markdown 记号、
emoji、``℃`` ``%`` ``m³/h`` 这类符号直接朗读会变成噪音（"百分号""摄氏度字母 C"），
所以进合成前统一口语化。

**长度上限 200 字**：超过的部分朗读体验极差（用户早已看完屏幕），因此截断到
最后一个句末标点并补一句「详细内容已为您显示在屏幕上」，让用户知道被截过。
"""

from __future__ import annotations

import re

#: 播报文本上限（字符）
MAX_SPEECH_CHARS = 200

#: 截断后追加的提示语
TRUNCATED_SUFFIX = "，详细内容已为您显示在屏幕上。"

#: 代码块 / 行内代码 / 图片 / 链接
_RE_CODE_BLOCK = re.compile(r"```[\s\S]*?```")
_RE_INLINE_CODE = re.compile(r"`([^`]+)`")
_RE_IMAGE = re.compile(r"!\[([^\]]*)\]\([^)]*\)")
_RE_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
#: 标题 / 引用 / 列表符号
_RE_HEADING = re.compile(r"^#{1,6}\s+", re.MULTILINE)
_RE_QUOTE = re.compile(r"^>\s+", re.MULTILINE)
_RE_BULLET = re.compile(r"^\s*[-*+]\s+", re.MULTILINE)
_RE_ORDERED = re.compile(r"^\s*\d+\.\s+", re.MULTILINE)
#: 强调记号
_RE_BOLD = re.compile(r"\*\*([^*]+)\*\*")
_RE_ITALIC = re.compile(r"\*([^*]+)\*")
_RE_UNDER_BOLD = re.compile(r"__([^_]+)__")
_RE_UNDER_ITALIC = re.compile(r"_([^_]+)_")
_RE_STRIKE = re.compile(r"~~([^~]+)~~")

#: emoji / 变体选择符 / 零宽连接符：朗读出来是「太阳」甚至直接报错
_RE_EMOJI = re.compile(
    "[\U0001f300-\U0001f9ff\U00002600-\U000026ff\U00002700-\U000027bf"
    "\U0001f1e0-\U0001f1ff\U0001fa00-\U0001faff\U0001f000-\U0001f02f"
    "\U0001f0a0-\U0001f0ff\ufe00-\ufe0f\u200d]"
)

#: 单位口语化（顺序敏感：先处理复合单位，再处理单符号）
_RE_UNIT_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(\d+)#"), r"\1号"),
    (re.compile(r"(-?\d+(?:\.\d+)?)\s*(?:℃|°C)", re.IGNORECASE), r"\1度"),
    (re.compile(r"(\d+(?:\.\d+)?)\s*%"), r"百分之\1"),
    (re.compile(r"元\s*/\s*(?:升|L)", re.IGNORECASE), "元每升"),
    (re.compile(r"\bkm/h\b", re.IGNORECASE), "千米每小时"),
    (re.compile(r"\bm³/h\b", re.IGNORECASE), "立方米每小时"),
    (re.compile(r"(?:μg|ug)\s*/\s*m[³3]", re.IGNORECASE), "微克每立方米"),
    (re.compile(r"\bPM2\.5\b", re.IGNORECASE), "PM二点五"),
    (re.compile(r"(?:m²|㎡)", re.IGNORECASE), "平方米"),
)

_RE_CRLF = re.compile(r"\r\n")
_RE_NEWLINES = re.compile(r"\n+")
_RE_SPACES = re.compile(r"\s+")
_RE_REPEATED_COMMA = re.compile(r"[，,]{2,}")
#: 最后一个句末标点之后没有别的句末标点 —— 用来找「可以安全截断的边界」
_RE_LAST_SENTENCE_PUNCT = re.compile(r"[。！？；!?;][^。！？；!?;]*$")


def _strip_markdown(text: str) -> str:
    text = _RE_CODE_BLOCK.sub("", text)
    text = _RE_INLINE_CODE.sub(r"\1", text)
    text = _RE_IMAGE.sub("", text)
    text = _RE_LINK.sub(r"\1", text)
    text = _RE_HEADING.sub("", text)
    text = _RE_QUOTE.sub("", text)
    text = _RE_BULLET.sub("", text)
    text = _RE_ORDERED.sub("", text)
    text = _RE_BOLD.sub(r"\1", text)
    text = _RE_ITALIC.sub(r"\1", text)
    text = _RE_UNDER_BOLD.sub(r"\1", text)
    text = _RE_UNDER_ITALIC.sub(r"\1", text)
    text = _RE_STRIKE.sub(r"\1", text)
    return _RE_EMOJI.sub("", text)


def _oralize_units(text: str) -> str:
    for pattern, replacement in _RE_UNIT_RULES:
        text = pattern.sub(replacement, text)
    return text


def _collapse_whitespace(text: str) -> str:
    text = _RE_CRLF.sub("\n", text)
    # 换行在朗读里等价于停顿，用逗号比留白更稳（SSML 里连续空白会被忽略）
    text = _RE_NEWLINES.sub("，", text)
    text = _RE_SPACES.sub(" ", text)
    text = _RE_REPEATED_COMMA.sub("，", text)
    return text.strip()


def _truncate(text: str, max_len: int) -> str:
    """超长时截到最后一个句末标点；找不到合适边界就硬截。

    只在句末标点落在窗口尾部 50 字以内时才用它 —— 太靠前会把正文砍掉大半，
    反而不如直接截满 200 字。两种情形都补一句「详情看屏幕」。
    """
    window = text[:max_len]
    match = _RE_LAST_SENTENCE_PUNCT.search(window)
    if match and match.start() > max_len - 50:
        window = window[: match.start() + 1]
    return f"{window}{TRUNCATED_SUFFIX}"


def normalize_for_speech(raw_text: object, max_len: int = MAX_SPEECH_CHARS) -> str:
    """把回复正文改写成适合朗读的一句话；无内容时返回空串。"""
    if not isinstance(raw_text, str):
        return ""
    text = raw_text.strip()
    if not text:
        return ""
    text = _collapse_whitespace(_oralize_units(_strip_markdown(text)))
    if not text:
        return ""
    if len(text) > max_len:
        text = _truncate(text, max_len)
    return text


def escape_xml(unsafe: object) -> str:
    """SSML 转义：``&`` 必须最先替换，否则会把后续实体再转一遍。"""
    if not isinstance(unsafe, str) or not unsafe:
        return ""
    return (
        unsafe.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _format_rate(rate: int) -> str:
    return f"+{rate}%" if rate >= 0 else f"{rate}%"


def _format_pitch(pitch: int) -> str:
    return f"+{pitch}Hz" if pitch >= 0 else f"{pitch}Hz"


def build_ssml(
    text: str,
    voice: str = "zh-CN-XiaoxiaoNeural",
    rate: int = 0,
    pitch: int = 0,
    lang: str = "zh-CN",
) -> str:
    """构造 SSML；``rate`` 为百分比整数，``pitch`` 为 Hz 整数。"""
    return (
        f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='{escape_xml(lang)}'>"
        f"<voice name='{escape_xml(voice)}'>"
        f"<prosody pitch='{_format_pitch(pitch)}' rate='{_format_rate(rate)}'>{escape_xml(text)}</prosody>"
        "</voice></speak>"
    )


__all__ = [
    "MAX_SPEECH_CHARS",
    "TRUNCATED_SUFFIX",
    "build_ssml",
    "escape_xml",
    "normalize_for_speech",
]
