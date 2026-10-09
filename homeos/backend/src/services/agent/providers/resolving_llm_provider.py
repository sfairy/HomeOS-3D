"""解析型 LLM 提供商（运行时切换）。

职责：作为 LLM_PROVIDER 的实际实现，在 mock 与 DeepseekLlmProvider 间按配置切换。
 - bind_events 时先 refresh 一次，并订阅 SYSTEM_CONFIG_UPDATED 事件
 - chat 时若仍为 mock 则再 refresh 一次（兜底配置刚保存的场景）
 refresh 会先使 AgentConfigService 缓存失效，避免读到旧 mock
依赖：AgentConfigService（配置）、LocalEventBus（事件）、DeepseekLlmProvider / MockLlmProvider。
"""

from __future__ import annotations

import logging
from typing import Any

from .deepseek_llm_provider import DeepseekLlmProvider
from .llm_provider_interface import (
    LlmChatOptions,
    LlmChatResult,
    LlmMessage,
    LlmToolSchema,
)
from .mock_llm_provider import MockLlmProvider
from .unavailable_llm_provider import UnavailableLlmProvider
from ..config_service import AgentConfigService, is_mock_allowed

logger = logging.getLogger("homeos.agent.resolving_llm")


class ResolvingLlmProvider:
    """按最新 agentConfig / 环境变量解析 LLM，配置变更后自动切换。"""

    def __init__(self, agent_config: AgentConfigService, event_bus: Any = None) -> None:
        self._agent_config = agent_config
        self._event_bus = event_bus
        #: 当前实际持有的提供商实现，默认 mock
        self._inner: Any = MockLlmProvider()
        self._unavailable = UnavailableLlmProvider()

    # ------------------------------------------------------------------ #
    # 事件绑定
    # ------------------------------------------------------------------ #
    def bind_events(self) -> None:
        """模块初始化：刷新一次并订阅配置变更事件（对齐 ``onModuleInit``）。"""
        if self._event_bus is not None:

            def on_system_config_updated(_payload: Any = None) -> Any:
                return self.refresh()

            self._event_bus.on("SYSTEM_CONFIG_UPDATED", on_system_config_updated)

    # ------------------------------------------------------------------ #
    # LlmProvider 接口
    # ------------------------------------------------------------------ #
    @property
    def name(self) -> str:
        """透出当前内部提供商名。"""
        return str(self._inner.name)

    def is_ready(self) -> bool:
        """透出当前内部提供商的就绪状态。"""
        return bool(self._inner.is_ready())

    async def chat(
        self,
        messages: list[LlmMessage],
        tools: list[LlmToolSchema],
        opts: LlmChatOptions | None = None,
    ) -> LlmChatResult:
        """执行一次对话。

        若当前仍是 mock / unavailable 则再刷新一次，
        兜底“配置刚保存但事件尚未触发”的场景。
        """
        if self._inner.name in ("mock", "unavailable"):
            await self.refresh()
        return await self._inner.chat(messages, tools, opts)

    # ------------------------------------------------------------------ #
    # 刷新
    # ------------------------------------------------------------------ #
    async def refresh(self) -> None:
        """重新读取配置并切换内部提供商。

        - 配置了 provider != mock 且 apiKey 非空 → 使用 DeepseekLlmProvider（复用已有实例 / 新建）
        - 否则 → 回退到 MockLlmProvider（开发 / AGENT_ALLOW_MOCK=true）或 UnavailableLlmProvider
        """
        # 先清缓存，避免与 SYSTEM_CONFIG_UPDATED 监听顺序竞态读到旧 mock
        self._agent_config.invalidate_cache()
        cfg = await self._agent_config.get_config()
        if cfg.provider != "mock" and cfg.api_key:
            if isinstance(self._inner, DeepseekLlmProvider):
                # 已是 DeepSeek 实例，原地更新配置即可
                self._inner.update_config(
                    {
                        "apiKey": cfg.api_key,
                        "baseUrl": cfg.api_base,
                        "model": cfg.model,
                    }
                )
            else:
                # 从 mock 切到 DeepSeek，新建实例
                self._inner = DeepseekLlmProvider(
                    {
                        "apiKey": cfg.api_key,
                        "baseUrl": cfg.api_base,
                        "model": cfg.model,
                    }
                )
            logger.info("LLM 提供商已就绪:%s,模型=%s", cfg.provider, cfg.model)
            return

        if not is_mock_allowed(self._agent_config.env):
            self._inner = self._unavailable
            logger.warning("LLM 未配置且 AGENT_ALLOW_MOCK=false,智能管家不可用")
            return

        self._inner = MockLlmProvider()
        logger.info("LLM 提供商:mock(模拟)")


__all__ = ["ResolvingLlmProvider"]
