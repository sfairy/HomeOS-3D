"""语音端「添加唤醒词」对话流（对齐参考 ``voice-wake-word.service.js``）。

为什么这一小段要单独成一个服务：它是**多轮确认**语义（说要点 → 再确认），而普通对话是
一次问答。混进 Agent 主链路会让「确认添加」这句纯口令被当成闲聊，LLM 无从知道上一轮
到底在等什么。

规则（逐条对齐参考实现）：

- 只有开了「允许语音添加唤醒词」的音箱能进这套流，否则回权限文案；
- 「添加/新增/设置唤醒词 X」→ 先预览并要确认，不能立刻写；
- 确认窗口 45 秒，且必须**同一段对话**、**不同一轮**（同一轮里说「确认」是误触发）；
- 同一段对话里重新提出添加 = 取消旧的待确认项；
- 词表是**追加**，不是替换；1–10 个上限、大小写去重；
- 网关词表在提出时读一次并记下 ``version``，确认时要校验它没变（CAS）。
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from typing import Any

from .service import VoiceDeviceError, VoiceDeviceService
from .wake_words import MAX_WORDS, WakeWordError, WakeWordGateway, normalize_words

logger = logging.getLogger("homeos.voice_device.wake_word_flow")

#: 待确认窗口（秒）。
CONFIRM_TTL_SECONDS = 45
#: 「添加唤醒词」触发式：可带礼貌前缀；捕获组是候选词。
_ADD_COMMAND = re.compile(
    r"^(?:(?:我想|我要|请(?:帮我)?|帮我)\s*)?(?:添加|新增|增加|设置|加)(?:一个)?(?:新的?)?唤醒词\s*[:：,，]?\s*(.*)$",
    re.UNICODE,
)
_CONFIRMS = frozenset({"确认", "确认添加", "确定添加"})
_CANCELS = frozenset({"取消", "取消添加", "不用了"})
#: 与网关同一份词形规则。
_WORD_SHAPE = re.compile(r"^[\u4e00-\u9fffA-Za-z0-9 ]{1,20}$", re.UNICODE)


@dataclass
class _Pending:
    conversation_id: str
    turn_id: str
    word: str
    version: int
    expires_at: float


def spoken(reply: str, outcome: str = "answer") -> dict[str, Any]:
    """构造一条「只有语音回复」的响应（不经过 LLM，轮数与工具都是 0）。"""
    return {
        "reply": reply,
        "speak": True,
        "outcome": outcome,
        "earcon": None,
        "provider": "system",
        "model": "",
        "rounds": 0,
        "toolCalls": [],
        "timing": {"llmMs": 0, "toolMs": 0, "totalMs": 0},
        "usage": {"promptTokens": 0, "completionTokens": 0, "cachedTokens": 0, "estimatedCostCNY": 0},
    }


def parse_add_command(text: str) -> str | None:
    """命中「添加唤醒词」时返回候选词（可能为空串），否则 ``None``。"""
    match = _ADD_COMMAND.match(text.strip())
    if match is None:
        return None
    return match.group(1) or ""


class VoiceWakeWordFlow:
    """待确认槽 + 落地动作。槽按 ``grantId`` 存（一台音箱一份，互不干扰）。"""

    def __init__(self, devices: VoiceDeviceService, gateway: WakeWordGateway) -> None:
        self._devices = devices
        self._gateway = gateway
        self._pending: dict[str, _Pending] = {}

    def clear(self, grant_id: str) -> None:
        self._pending.pop(grant_id, None)

    def handle(
        self,
        message: str,
        grant_id: str,
        voice: dict[str, Any],
        is_current: Any = None,
    ) -> dict[str, Any] | None:
        """尝试处理这一句；``None`` 表示不受理，交回 Agent 主链路。"""
        text = (message or "").strip().rstrip("。！!？?").strip()
        conversation_id = str(voice.get("conversationId") or "")
        turn_id = str(voice.get("turnId") or "")
        previous = self._pending.get(grant_id)
        same_conversation = previous is not None and previous.conversation_id == conversation_id
        candidate = parse_add_command(text)

        # 换会话 / 过期 / 重新提出添加 → 旧的待确认项作废。
        if previous is not None and (
            previous.expires_at <= time.time() or not same_conversation or candidate is not None
        ):
            self._pending.pop(grant_id, None)
            previous = None

        if text in _CONFIRMS and same_conversation and previous is not None:
            return self._confirm(grant_id, previous, turn_id, is_current)
        if previous is not None and same_conversation and text in _CANCELS:
            self._pending.pop(grant_id, None)
            return spoken("已取消添加唤醒词。")
        if candidate is None:
            return spoken("本次会话没有待确认的唤醒词。") if text in _CONFIRMS else None
        return self._propose(grant_id, candidate, conversation_id, turn_id, is_current)

    # ── 提出 ─────────────────────────────────────────────────
    def _propose(
        self,
        grant_id: str,
        candidate: str,
        conversation_id: str,
        turn_id: str,
        is_current: Any,
    ) -> dict[str, Any]:
        word = " ".join(candidate.strip().strip('「」『』“"').split())
        if not _WORD_SHAPE.match(word):
            return spoken("请说添加唤醒词，再说一个最多二十个字符的中文或英文词。")
        try:
            self._devices.require_wake_word_permission(grant_id)
        except VoiceDeviceError as error:
            return spoken(error.message, "blocked")
        try:
            current = self._gateway.read()
        except WakeWordError:
            # 网关读不到就不能承诺「已添加」：这时一律按失败回，让用户去看语音模块。
            return spoken("现在无法读取唤醒词，请检查语音模块的网关连接。", "failed")
        if not self._still_current(is_current):
            return spoken("本次添加请求已结束，请重新提出添加。", "blocked")
        if any(item.lower() == word.lower() for item in current["words"]):
            return spoken(f"「{word}」已经是唤醒词。")
        if len(current["words"]) >= MAX_WORDS:
            return spoken("唤醒词已满，请在语音模块调整词表。", "blocked")
        self._pending[grant_id] = _Pending(
            conversation_id=conversation_id,
            turn_id=turn_id,
            word=word,
            version=int(current["version"]),
            expires_at=time.time() + CONFIRM_TTL_SECONDS,
        )
        return spoken(f"要添加唤醒词「{word}」吗？原来的唤醒词仍然可用。请说确认添加，或取消。")

    # ── 确认 ─────────────────────────────────────────────────
    def _confirm(
        self,
        grant_id: str,
        pending: _Pending,
        turn_id: str,
        is_current: Any,
    ) -> dict[str, Any]:
        if pending.expires_at <= time.time() or pending.turn_id == turn_id:
            # 同一轮里说「确认」= 误触发（一句话里既有添加又有确认），要求重说。
            self._pending.pop(grant_id, None)
            return spoken("请重新说一遍要添加的唤醒词。")

        def before_write() -> None:
            self._devices.require_wake_word_permission(grant_id)
            if not self._still_current(is_current):
                raise VoiceDeviceError("词表或当前会话已变化，请重新提出添加。", 409)

        try:
            # 返回值不用：网关已经写进本地镜像（见 WakeWordGateway._mirror），
            # 这里只关心「有没有成功」，回话里的词就是 pending.word。
            self._gateway.update("add", [pending.word], pending.version, before_write=before_write)
        except VoiceDeviceError as error:
            self._pending.pop(grant_id, None)
            return spoken(error.message, "blocked")
        except WakeWordError as error:
            self._pending.pop(grant_id, None)
            # 400 = 网关的词形规则比本地更严；503 = 网关没能确认结果。文案分开，便于排查。
            if error.status == 400:
                return spoken("网关无法使用这个唤醒词，请换一个词再试。", "failed")
            if error.status == 409:
                return spoken("词表或当前会话已变化，请重新提出添加。", "blocked")
            return spoken("未能确认唤醒词更新结果，请在语音模块查看当前词表。", "failed")
        self._pending.pop(grant_id, None)
        logger.info("音箱 %s 添加唤醒词成功：%s", grant_id, pending.word)
        return spoken(f"已添加唤醒词「{pending.word}」，原来的唤醒词仍然可用。", "success")

    @staticmethod
    def _still_current(is_current: Any) -> bool:
        if is_current is None:
            return True
        try:
            return bool(is_current())
        except Exception:  # pragma: no cover - 回调自身异常不该打断对话
            return True


def validate_words_for_api(raw: Any) -> list[str]:
    """``PUT /agent/wake-words`` 的词表校验（复用网关同一份规则）。"""
    try:
        return normalize_words(raw)
    except WakeWordError as error:
        raise WakeWordError(error.message, 400) from None


__all__ = [
    "CONFIRM_TTL_SECONDS",
    "VoiceWakeWordFlow",
    "parse_add_command",
    "spoken",
    "validate_words_for_api",
]
