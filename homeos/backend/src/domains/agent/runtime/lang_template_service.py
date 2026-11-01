"""语言模板服务（热更新）。"""

from __future__ import annotations

import logging
from typing import Any

from .config_service import AgentConfigService
from .lang_templates import LangTemplate, get_lang_template
from ....platform.core.runtime.config_events import subscribe as subscribe_config_updates

logger = logging.getLogger("homeos.agent.lang_template")


class LangTemplateService:
    """语言模板热更新：配置变更后快路径 / 纠正口令 / 系统提示同步切换。"""

    def __init__(self, agent_config: AgentConfigService, event_bus: Any = None) -> None:
        self._agent_config = agent_config
        self._event_bus = event_bus
        #: 当前生效的语言模板，默认 zh
        self._template: LangTemplate = get_lang_template("zh")

    async def init(self) -> None:
        """模块初始化：先刷新一次，再订阅配置变更事件（对齐 ``onModuleInit``）。"""
        await self.refresh()
        if self._event_bus is not None:

            def on_system_config_updated(_payload: Any = None) -> Any:
                return self.refresh()

            subscribe_config_updates(self._event_bus, on_system_config_updated)

    @property
    def current(self) -> LangTemplate:
        """获取当前生效的语言模板（含正则、口令、系统提示）。"""
        return self._template

    async def refresh(self) -> None:
        """重新读取语言并刷新模板。"""
        lang = await self._agent_config.get_language()
        self._template = get_lang_template(lang)
        logger.debug("Agent 语言模板已就绪:%s", lang)


__all__ = ["LangTemplateService"]
