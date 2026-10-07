"""未配置 LLM 时的占位提供商。

职责：在生产环境（production）且未配置真实 API Key、且 AGENT_ALLOW_MOCK=false
 时由 ResolvingLlmProvider 选中，保证 ResolvingLlmProvider 永不返回 mock。
 任何 chat 调用均抛 CONFIG_ERROR，让上层感知「智能管家不可用」并提示用户配置 LLM。
依赖：llm_provider_interface（接口）、BusinessException / api_error（错误归一化）。
"""

from __future__ import annotations

from ....core.errors import BusinessException, ErrorCode, api_error
from .llm_provider_interface import (
    LlmChatOptions,
    LlmChatResult,
    LlmMessage,
    LlmProvider,
    LlmToolSchema,
)


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
