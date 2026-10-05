"""智能管家配置服务。

职责：读取并缓存 LLM 配置（provider / apiKey / apiBase / model / language / systemPrompt），
 以及 HA 场景 / 脚本语音控制允许清单（layout.agentConfig.sceneVoiceControl，默认全禁）。
 读取顺序：数据库 ProjectConfig.layout.agentConfig → .env 回退 → 默认 mock。
 监听 SYSTEM_CONFIG_UPDATED 事件自动失效缓存，下次 get_config 重新读 DB。
依赖：Database.SessionFactory（DB）、环境变量、LocalEventBus（事件）。
"""

from __future__ import annotations

import logging
import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select

from src.core.json_field import read_json_object
from src.core.models import ProjectConfig

from ..app_config.constants import CONFIG_MASK_PLACEHOLDER
from ..app_config.mask import is_masked_value

logger = logging.getLogger("homeos.agent.config")

_DEFAULT_API_BASE = "https://api.deepseek.com"
_DEFAULT_DB_MODEL = "deepseek-v4-flash"
_DEFAULT_ENV_MODEL = "deepseek-chat"


@dataclass
class AgentLlmConfig:
    """LLM 运行配置：包含 provider 与凭证等敏感字段，供 ResolvingLlmProvider 初始化提供商。"""

    #: 提供商名：deepseek / mock
    provider: str = "mock"
    #: API Key，未配置时为空串（仅运行时内部使用，勿经 API 下发）
    api_key: str = ""
    #: API 基地址，如 https://api.deepseek.com
    api_base: str = ""
    #: 模型名，如 deepseek-chat
    model: str = ""
    #: 语言代码，zh / en，决定快路径模板与系统提示
    language: str = "zh"
    #: 用户自定义系统提示，追加到默认 systemPrompt 之后
    system_prompt: str | None = None


@dataclass
class AgentPublicConfig:
    """对外可安全暴露的 Agent 配置摘要（不含明文 Key）。"""

    provider: str = "mock"
    api_base: str = ""
    model: str = ""
    language: str = "zh"
    system_prompt: str | None = None
    #: 是否已配置可用 API Key（DB 明文或 .env）
    api_key_configured: bool = False


@dataclass
class SceneVoiceControlConfig:
    """HA 场景 / 脚本的语音控制允许清单。

    默认全禁（fail-closed）：``scene.*`` / ``script.*`` 内部动作无法静态审计，
    只有用户在设置里显式启用并逐个勾选实体后，语音 / LLM 链路才允许触发。
    """

    #: 是否启用场景语音控制总开关
    enabled: bool = False
    #: 允许语音触发的实体 ID 白名单（scene.* / script.*）
    allow: list[str] = field(default_factory=list)


def is_mock_allowed(env: Mapping[str, str] | None = None) -> bool:
    """AGENT_ALLOW_MOCK 未显式配置时，非 production 环境允许 mock。"""
    source = env if env is not None else os.environ
    flag = str(source.get("AGENT_ALLOW_MOCK", "")).strip().lower()
    if flag == "true":
        return True
    if flag == "false":
        return False
    return str(source.get("NODE_ENV", "")).strip().lower() != "production"


class AgentConfigService:
    """Agent 配置服务：缓存 + 事件失效 + 布局读取。"""

    def __init__(
        self,
        session_factory: Any,
        app_config: Any,
        event_bus: Any = None,
        env: Mapping[str, str] | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._app_config = app_config
        self._event_bus = event_bus
        self._env = env
        #: 内存缓存，命中则直接返回，避免每次都查 DB
        self._cached_config: AgentLlmConfig | None = None
        #: 场景语音控制允许清单缓存（随配置更新事件失效）
        self._cached_scene_voice_control: SceneVoiceControlConfig | None = None

    @property
    def env(self) -> Mapping[str, str]:
        """配置来源（默认进程环境变量，测试可注入）。"""
        return self._env if self._env is not None else os.environ

    # ------------------------------------------------------------------ #
    # 事件绑定
    # ------------------------------------------------------------------ #
    def bind_events(self) -> None:
        """订阅系统配置更新事件，使缓存失效（对齐 ``onModuleInit``）。"""
        if self._event_bus is None:
            return

        def on_system_config_updated(_payload: Any = None) -> None:
            logger.info("检测到配置更新,正在使 Agent 配置缓存失效")
            self.invalidate_cache()

        self._event_bus.on("SYSTEM_CONFIG_UPDATED", on_system_config_updated)

    # ------------------------------------------------------------------ #
    # 缓存
    # ------------------------------------------------------------------ #
    def invalidate_cache(self) -> None:
        """强制下次 get_config 重新读 DB / .env。"""
        self._cached_config = None
        self._cached_scene_voice_control = None

    # ------------------------------------------------------------------ #
    # 配置读取
    # ------------------------------------------------------------------ #
    async def get_config(self) -> AgentLlmConfig:
        return await self.get_runtime_config()

    async def get_runtime_config(self) -> AgentLlmConfig:
        """运行时明文配置（供 LLM / MCP / 通道内部使用，永不返回给前端）。"""
        if self._cached_config is not None:
            return self._cached_config

        db = self._read_from_db()
        if db is not None and db.api_key and not self._is_unconfigured_key(db.api_key):
            logger.info("使用数据库配置:提供商=%s,模型=%s", db.provider, db.model)
            self._cached_config = db
            return db

        env = self._read_from_env()
        if env.api_key and not self._is_unconfigured_key(env.api_key):
            logger.info("使用 .env 回退配置:提供商=%s,模型=%s", env.provider, env.model)
            # DB 有非密钥字段时合并（provider/model 等），密钥用 env
            if db is not None:
                self._cached_config = AgentLlmConfig(
                    provider=db.provider or env.provider,
                    api_key=env.api_key,
                    api_base=db.api_base or env.api_base,
                    model=db.model or env.model,
                    language=db.language or env.language,
                    system_prompt=db.system_prompt,
                )
                return self._cached_config
            self._cached_config = env
            return env

        logger.info("未配置 API Key,默认使用 mock 提供商")
        self._cached_config = AgentLlmConfig(
            provider="mock",
            api_key="",
            api_base=(db.api_base if db is not None else "") or "",
            model=(db.model if db is not None else "") or "",
            language=(db.language if db is not None else "") or env.language,
            system_prompt=db.system_prompt if db is not None else None,
        )
        return self._cached_config

    async def get_public_config(self) -> AgentPublicConfig:
        """对外安全摘要：不含明文 apiKey，仅暴露 apiKeyConfigured。"""
        cfg = await self.get_runtime_config()
        return AgentPublicConfig(
            provider=cfg.provider,
            api_base=cfg.api_base,
            model=cfg.model,
            language=cfg.language,
            system_prompt=cfg.system_prompt,
            api_key_configured=bool(cfg.api_key and not self._is_unconfigured_key(cfg.api_key)),
        )

    async def get_language(self) -> str:
        """获取当前语言代码（默认 zh）。"""
        cfg = await self.get_config()
        return cfg.language or "zh"

    # ------------------------------------------------------------------ #
    # MCP 网关
    # ------------------------------------------------------------------ #
    async def get_mcp_gateway_secret(self) -> str:
        """读取 MCP 网关专用密钥（明文，仅服务端校验用）。"""
        agent = self._read_agent_config()
        if not agent:
            return ""
        secret = agent.get("mcpGatewaySecret")
        if secret is None or self._is_unconfigured_key(secret):
            return ""
        return str(secret).strip()

    async def get_mcp_actor_user_id(self) -> str:
        """MCP 网关绑定的 HomeOS 用户 ID（控制类工具走该用户 ACL）。"""
        agent = self._read_agent_config()
        if not agent:
            return ""
        ident = agent.get("mcpActorUserId")
        return "" if ident is None else str(ident).strip()

    # ------------------------------------------------------------------ #
    # 场景语音控制
    # ------------------------------------------------------------------ #
    async def get_scene_voice_control(self) -> SceneVoiceControlConfig:
        """读取 HA 场景 / 脚本的语音控制允许清单（layout.agentConfig.sceneVoiceControl）。

        fail-closed 语义：任何读取失败、字段缺失或格式非法都退化为「未启用 + 空清单」，
        由调用方据此拒绝 ``scene.*`` / ``script.*`` 的语音触发。
        """
        if self._cached_scene_voice_control is not None:
            return self._cached_scene_voice_control
        fallback = SceneVoiceControlConfig(enabled=False, allow=[])
        try:
            agent = self._read_agent_config()
            raw = agent.get("sceneVoiceControl") if agent else None
            if not isinstance(raw, dict):
                self._cached_scene_voice_control = fallback
                return fallback
            raw_allow = raw.get("allow")
            allow = (
                [
                    str(item if item is not None else "").strip()
                    for item in raw_allow
                    if str(item if item is not None else "")
                    .strip()
                    .startswith(("scene.", "script."))
                ]
                if isinstance(raw_allow, list)
                else []
            )
            resolved = SceneVoiceControlConfig(enabled=raw.get("enabled") is True, allow=allow)
            self._cached_scene_voice_control = resolved
            return resolved
        except Exception as exc:  # noqa: BLE001
            logger.warning("读取场景语音控制配置失败,按全禁处理: %s", exc)
            return fallback

    # ------------------------------------------------------------------ #
    # 内部工具
    # ------------------------------------------------------------------ #
    def resolve_active_project_id(self) -> str:
        """当前激活 display profile（与 HA / UI 保存目标一致）。"""
        try:
            profiles = self._app_config.get("profiles") or {}
            return str(profiles.get("activeProfileId") or "").strip() or "default"
        except Exception:  # noqa: BLE001
            return "default"

    def _read_layout(self) -> dict[str, Any]:
        """读取激活项目布局对象；失败返回空对象。"""
        try:
            with self._session_factory() as session:
                row = session.execute(
                    select(ProjectConfig).where(
                        ProjectConfig.project_id == self.resolve_active_project_id()
                    )
                ).scalar_one_or_none()
            if row is None or not row.layout:
                return {}
            return read_json_object(row.layout, {})
        except Exception:  # noqa: BLE001
            return {}

    def _read_agent_config(self) -> dict[str, Any]:
        layout = self._read_layout()
        agent = layout.get("agentConfig") if isinstance(layout, dict) else None
        return agent if isinstance(agent, dict) else {}

    @staticmethod
    def _is_unconfigured_key(api_key: Any) -> bool:
        """判断 apiKey 是否属于“未配置 / 脱敏占位”状态。"""
        if api_key is None or api_key == "":
            return True
        key = str(api_key)
        return key == CONFIG_MASK_PLACEHOLDER or is_masked_value(key)

    def _read_from_db(self) -> AgentLlmConfig | None:
        """从数据库 ProjectConfig.layout.agentConfig 读取配置。

        仅当 apiKey 非空且非脱敏占位符时才返回有效配置，否则返回 None。
        """
        try:
            agent = self._read_agent_config()
            if not agent or self._is_unconfigured_key(agent.get("apiKey")):
                if agent.get("apiKey") and self._is_unconfigured_key(agent.get("apiKey")):
                    logger.warning("数据库 agentConfig.apiKey 为掩码/占位符,视为未配置")
                return None
            system_prompt = agent.get("systemPrompt")
            return AgentLlmConfig(
                provider=str(agent.get("provider") or "deepseek"),
                api_key=str(agent.get("apiKey")),
                api_base=str(agent.get("apiBase") or _DEFAULT_API_BASE),
                model=str(agent.get("model") or _DEFAULT_DB_MODEL),
                language=str(agent.get("language") or "zh"),
                system_prompt=str(system_prompt) if system_prompt else None,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("从数据库读取 Agent 配置失败: %s", exc)
            return None

    def _env_get(self, name: str) -> str:
        return str(self.env.get(name) or "")

    def _read_from_env(self) -> AgentLlmConfig:
        """从 .env 环境变量读取回退配置。

        读取 LLM_PROVIDER / DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL / DEEPSEEK_MODEL / LLM_LANG。
        """
        return AgentLlmConfig(
            provider=(self._env_get("LLM_PROVIDER") or "mock").lower(),
            api_key=self._env_get("DEEPSEEK_API_KEY"),
            api_base=self._env_get("DEEPSEEK_BASE_URL") or _DEFAULT_API_BASE,
            model=self._env_get("DEEPSEEK_MODEL") or _DEFAULT_ENV_MODEL,
            language=self._env_get("LLM_LANG") or "zh",
        )


__all__ = [
    "AgentConfigService",
    "AgentLlmConfig",
    "AgentPublicConfig",
    "SceneVoiceControlConfig",
    "is_mock_allowed",
]
