"""智能管家域的服务装配（跨进程状态 / 记忆 / 预算 / LLM / TTS）。

`lifespan.py` 是启动阶段的总装线，本身已经很长；管家域这一串服务互相依赖、
但装配顺序与其余域无关，放在这里既能让 lifespan 保持「阶段 + 顺序」的骨架，
也方便单独测试装配结果。重型依赖（DB / LLM / TTS 模块）仍在函数内按需导入，
避免把 `import src.app` 的启动成本提前。
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI


async def build_agent_shared_state(
    app: FastAPI,
    startup: Any,
    agent_config: Any,
    home_tools: Any,
) -> tuple[Any, Any, Any, Any]:
    """装配跨进程状态 / 记忆 / 预算 / LLM / TTS。

    ``startup`` 是 ``lifespan._StartupContext``，但这里不 import 它（类型注解一律 ``Any``）：
    ``lifespan → agent_services`` 是真实依赖，反过来再加一条即使只在 ``TYPE_CHECKING``
    里也会被 ``check:backend-deps`` 判成文件级循环（B5）。

    返回 ``(agent_memory, llm_provider, agent_tts, agent_state_store)``；其余服务挂到
    ``app.state``，由 ``lifespan._build_agent_domain`` 组装 ``AgentService`` 时读取。
    """
    from ..domains.agent.memory.memory_store import AgentMemoryService
    from ..domains.agent.memory.session_store import AgentSessionStoreService
    from ..domains.agent.memory.short_term_memory import AgentShortTermMemoryService
    from ..domains.agent.policy.budget import AgentBudgetService
    from ..domains.agent.providers.resolving_llm_provider import ResolvingLlmProvider
    from ..domains.agent.speech import TtsService
    from ..domains.agent.state.store import build_shared_store

    # 跨进程共享状态（短时记忆 / 批量确认 / 日预算 / MCP 限流共用一份）
    # 默认落在 <data_dir>/agent-state.sqlite3；AGENT_STATE_BACKEND=memory 可退回进程内
    agent_state_store = build_shared_store(startup.app_settings.data_dir, env=os.environ)
    app.state.agent_state_store = agent_state_store

    # 会话记忆分两层：10 分钟长会话（内存 LRU + DB 持久化）+ 45s 短时滑窗（共享状态）
    app.state.agent_sessions = AgentSessionStoreService(app.state.database.session_factory)
    app.state.agent_short_term = AgentShortTermMemoryService(agent_state_store)
    # 长期记忆：设备 / 房间别名与用户偏好
    agent_memory = AgentMemoryService(app.state.database.session_factory)
    app.state.agent_memory = agent_memory
    # 工具层与对话链路共用同一份记忆：偏好学习工具写、系统提示与别名展开读
    home_tools.bind_memory(agent_memory)
    # 每日用量预算（token / 成本，按登录用户累计；环境变量可调）
    app.state.agent_budget = AgentBudgetService(store=agent_state_store)

    llm_provider = ResolvingLlmProvider(agent_config, event_bus=startup.security_bus)
    llm_provider.bind_events()
    await llm_provider.refresh()
    app.state.agent_llm_provider = llm_provider

    # 服务端 TTS：对话只签 URL，浏览器取音频时才合成（详见 speech/service.py）
    agent_tts = TtsService(startup.app_config, startup.app_settings.data_dir, env=os.environ)
    app.state.agent_tts = agent_tts
    return agent_memory, llm_provider, agent_tts, agent_state_store
