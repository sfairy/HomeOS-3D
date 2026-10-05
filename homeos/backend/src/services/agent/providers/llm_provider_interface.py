"""LLM 提供商接口与消息类型定义。

职责：定义智能管家与大语言模型之间的统一抽象（LlmProvider），
 让 AgentService 不感知具体是 deepseek 还是 mock，由 ResolvingLlmProvider 在运行时切换。
依赖：被 deepseek_llm_provider / mock_llm_provider / resolving_llm_provider 实现。
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

#: 消息角色
LlmRole = Literal["system", "user", "assistant", "tool"]

#: 流式 token 回调
OnToken = Callable[[str], None]


@dataclass
class LlmToolCall:
    """一次工具调用请求：模型生成，由 AgentService 执行后回填结果。"""

    #: 调用 ID，用于把工具结果关联回这次调用
    id: str
    #: 工具名，如 control_device / search_entities
    name: str
    #: 工具入参（已解析的对象）
    arguments: dict[str, Any] = field(default_factory=dict)


@dataclass
class LlmMessage:
    """LLM 对话消息（OpenAI 风格 role 区分）。

    - system / user：普通文本消息
    - assistant：可带 tool_calls 数组，表示模型要求调用工具
    - tool：工具执行结果回填，需带 tool_call_id 关联到对应调用
    """

    role: LlmRole
    content: str | None = None
    tool_calls: list[LlmToolCall] | None = None
    tool_call_id: str | None = None
    name: str | None = None


@dataclass
class LlmToolSchema:
    """工具的 JSON Schema 描述，暴露给 LLM 供其选择调用。"""

    #: 工具名
    name: str
    #: 工具用途说明，供 LLM 理解何时调用
    description: str
    #: JSON Schema 形态的入参定义
    parameters: dict[str, Any] = field(default_factory=dict)


@dataclass
class LlmUsage:
    """单次对话的 token 用量统计，用于成本估算。"""

    #: 输入 token 数（含 system prompt 与历史）
    prompt_tokens: int = 0
    #: 输出 token 数
    completion_tokens: int = 0
    #: 命中提供商 prompt 缓存的 token 数（计费更便宜）
    cached_tokens: int = 0


@dataclass
class LlmChatResult:
    """一次 chat 调用的返回：文本回复 + 可选工具调用 + 用量统计。"""

    #: 模型文本回复，无工具调用时必填
    content: str | None = None
    #: 模型要求执行的工具调用列表
    tool_calls: list[LlmToolCall] | None = None
    #: token 用量
    usage: LlmUsage | None = None


@dataclass
class LlmChatOptions:
    """chat 调用的可选参数。"""

    #: 流式 token 回调；提供时实现方可走 SSE
    on_token: OnToken | None = None


class LlmProvider(Protocol):
    """LLM 提供商统一接口。

    实现方需暴露 name / is_ready / chat，由 ResolvingLlmProvider 在 mock 与真实提供商间切换。
    """

    @property
    def name(self) -> str:  # pragma: no cover - 协议声明
        ...

    def is_ready(self) -> bool:  # pragma: no cover - 协议声明
        ...

    async def chat(
        self,
        messages: list[LlmMessage],
        tools: list[LlmToolSchema],
        opts: LlmChatOptions | None = None,
    ) -> LlmChatResult:  # pragma: no cover - 协议声明
        ...


#: 兼容异步调用签名（供类型标注使用）
LlmChatCallable = Callable[
    [list[LlmMessage], list[LlmToolSchema], LlmChatOptions | None],
    Awaitable[LlmChatResult],
]
