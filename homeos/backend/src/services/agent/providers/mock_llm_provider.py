"""Mock LLM 提供商（开发 / 未配置时回退）。

职责：在未配置真实 API Key 时提供一个“能跑通链路”的假 LLM。
 - 通过正则识别控制 / 查询意图，先调 search_entities 再调 control_device
 - 对工具结果做模板化回复，便于前端联调
 - 永远返回 is_ready=True，保证未配置时智能管家仍可演示
依赖：llm_provider_interface（接口）。
"""

from __future__ import annotations

import re

from src.core.entity_domain import get_entity_domain

from .llm_provider_interface import (
    LlmChatOptions,
    LlmChatResult,
    LlmMessage,
    LlmProvider,
    LlmToolCall,
    LlmToolSchema,
)

#: 控制意图：开 / 关 / 调节等关键词（中英文）
_CONTROL_INTENT = re.compile(
    r"(打开|关闭|开一?下|关一?下|开灯|关灯|turn on|turn off|开启|关掉|调|设为|设置)", re.I
)

#: 查询意图：状态 / 温度 / 是否等关键词
_QUERY_INTENT = re.compile(r"(状态|多少度|温度|查询|查一?下|怎么样|是否|开着吗|关着吗)")

#: “打开”类意图
_TURN_ON = re.compile(r"(打开|开启|开灯|turn on|开一?下)", re.I)

#: “关闭”类意图（反向词）
_TURN_OFF = re.compile(r"(关闭|关掉|关灯|turn off)")

#: 抽取名词时要去掉的动词 / 语气词 / 修饰词
_NOUN_NOISE = re.compile(
    r"(帮我|请|麻烦|一下|把|的|了|吗|呢|啊|打开|关闭|开启|关掉|开灯|关灯|查询|查看|状态|什么|怎么样|多少度|温度|是否|开着|关着|turn on|turn off)",
    re.I,
)

_ENTITY_ID_RE = re.compile(r'"entity_id"\s*:\s*"([^"]+)"')
_STATE_RE = re.compile(r'"state"\s*:\s*"([^"]+)"')
_BLOCKED_RE = re.compile(r'"blocked"\s*:\s*true[^}]*"message"\s*:\s*"([^"]+)"')
_SUCCESS_RE = re.compile(r'"success"\s*:\s*true')


class MockLlmProvider(LlmProvider):
    """Mock LLM 提供商：不需要凭证，is_ready 永远为 true。"""

    name = "mock"

    def is_ready(self) -> bool:
        """始终就绪，未配置真实 Key 时作为兜底。"""
        return True

    async def chat(
        self,
        messages: list[LlmMessage],
        _tools: list[LlmToolSchema],
        _opts: LlmChatOptions | None = None,
    ) -> LlmChatResult:
        """模拟一次 LLM 对话。

        根据最后一条消息的 role 与工具名给出模板化回复或下一步工具调用，
        串起 search_entities → control_device 的演示链路。
        """
        first_user = next((m.content or "" for m in messages if m.role == "user"), "")
        last = messages[-1] if messages else None

        # 工具结果回填：根据 control_device 的返回内容给出成功 / 失败 / 拦截回复
        if last is not None and last.role == "tool" and last.name == "control_device":
            content = last.content or ""
            blocked_match = _BLOCKED_RE.search(content)
            if blocked_match:
                return LlmChatResult(content=f"（Mock）{blocked_match.group(1)}")
            ok = bool(_SUCCESS_RE.search(content))
            return LlmChatResult(
                content=(
                    f"（Mock）好的，已经帮你处理「{self._extract_noun(first_user)}」了。"
                    if ok
                    else f"（Mock）抱歉，「{self._extract_noun(first_user)}」没有响应，请稍后再试。"
                )
            )

        # search_entities 结果回填：找到实体则继续 control_device，否则告知未找到
        if last is not None and last.role == "tool" and last.name == "search_entities":
            entity_id = self._pick_first_entity_id(last.content or "")
            if not entity_id:
                return LlmChatResult(
                    content=f"（Mock）没有找到和「{self._extract_noun(first_user)}」匹配的设备。"
                )
            if self._is_control_intent(first_user):
                on = self._is_turn_on(first_user)
                return LlmChatResult(
                    tool_calls=[
                        self._call(
                            "control_device",
                            {
                                "domain": get_entity_domain(entity_id),
                                "service": "turn_on" if on else "turn_off",
                                "entity_id": entity_id,
                            },
                        )
                    ]
                )
            state = self._pick_first_entity_state(last.content or "")
            return LlmChatResult(content=f"（Mock）{entity_id} 当前状态是：{state or '未知'}。")

        # 首轮：识别控制 / 查询意图，先发 search_entities
        if self._is_control_intent(first_user) or self._is_query_intent(first_user):
            return LlmChatResult(
                tool_calls=[self._call("search_entities", {"query": self._extract_noun(first_user)})]
            )

        return LlmChatResult(
            content=f"（Mock）我听到了：「{first_user}」。换上真实大模型后我就能真正理解并执行了。"
        )

    @staticmethod
    def _call(name: str, args: dict[str, object]) -> LlmToolCall:
        """构造一次工具调用，id 固定为 mock_<name>。"""
        return LlmToolCall(id=f"mock_{name}", name=name, arguments=dict(args))

    @staticmethod
    def _is_control_intent(text: str) -> bool:
        return bool(_CONTROL_INTENT.search(text))

    @staticmethod
    def _is_query_intent(text: str) -> bool:
        return bool(_QUERY_INTENT.search(text))

    @staticmethod
    def _is_turn_on(text: str) -> bool:
        return bool(_TURN_ON.search(text)) and not bool(_TURN_OFF.search(text))

    @staticmethod
    def _extract_noun(text: str) -> str:
        """从用户原话中抽取名词（去掉动词 / 语气词 / 修饰词），用于 mock 回复。"""
        return _NOUN_NOISE.sub("", text).strip() or text

    @staticmethod
    def _pick_first_entity_id(tool_result: str) -> str | None:
        match = _ENTITY_ID_RE.search(tool_result)
        return match.group(1) if match else None

    @staticmethod
    def _pick_first_entity_state(tool_result: str) -> str | None:
        match = _STATE_RE.search(tool_result)
        return match.group(1) if match else None
