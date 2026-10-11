"""未配置 LLM 时的占位提供商。"""

from __future__ import annotations

from .llm_provider_interface import (
    LlmChatOptions,
    LlmChatResult,
    LlmMessage,
    LlmProvider,
    LlmToolSchema,
)
from ....platform.core.errors import BusinessException, ErrorCode, api_error


class UnavailableLlmProvider(LlmProvider):
    """占位 LLM 提供商。

    永远 not ready，任何 chat 调用均抛异常，确保生产环境未配置时不静默回退到 mock。
    """

    @property
    def name(self) -> str:
        """提供商名，固定为 unavailable。"""
        return "unavailable"

    def is_ready(self) -> bool:
        """永不就绪：让上层 AgentService 在 ping_provider / get_provider_info 时直接暴露状态。"""
        return False

    async def chat(
        self,
        _messages: list[LlmMessage],
        _tools: list[LlmToolSchema],
        _opts: LlmChatOptions | None = None,
    ) -> LlmChatResult:
        """直接抛 CONFIG_ERROR 业务异常。

        :raises BusinessException: ErrorCode.CONFIG_ERROR + AGENT_LLM_NOT_CONFIGURED
        """
        raise BusinessException(ErrorCode.CONFIG_ERROR, api_error("AGENT_LLM_NOT_CONFIGURED"))
