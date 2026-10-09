"""语音服务（对齐 ``awareness/voice.service.ts``）。

聚合 STT 转写、HA Assist 对话、命令执行与 TTS 播报：

- STT 转写 / HA 对话委托 :mod:`voice_stt`；
- 命令执行委托 :mod:`voice_command_execute`（家庭模式 / 命令代理下发）；
- TTS 播报委托 :class:`TtsSpeakService`；
- 全屋命令按 :func:`resolve_voice_rooms` 解析目标房间；
- 命令映射未命中且开启 ``agentFallback`` 时回落智能管家（Agent LLM）。
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from .tts_speak import TtsSpeakService
from .voice_alerts import (
    VOICE_ALERT_CATALOG,
    normalize_wake_words,
    resolve_voice_alert_rules,
)
from .voice_command_execute import VoiceCommandExecuteDeps, execute_voice_command
from .voice_commands import DEFAULT_WHOLE_HOME_VOICE_COMMANDS
from .voice_stt import (
    VoiceSttConfig,
    VoiceSttDeps,
    process_ha_conversation,
    resolve_stt_entity,
    transcribe_voice_audio,
)
from ..app_config.room_meta import resolve_voice_rooms

logger = logging.getLogger("homeos.awareness.voice")


class VoiceService:
    """语音服务（STT / 对话 / 命令执行 / TTS 播报 / 元信息）。"""

    def __init__(
        self,
        *,
        app_config: Any,
        ha_connector: Any,
        command_proxy: Any,
        home_mode: Any,
        state_store: Any,
        entity_area: Any,
        tts_speak: TtsSpeakService,
        session_factory: Any,
        agent_service: Any = None,
        get_ha_rest_config: Callable[[], Any] | None = None,
        version: str = "",
    ) -> None:
        self._app_config = app_config
        self._ha_connector = ha_connector
        self._command_proxy = command_proxy
        self._home_mode = home_mode
        self._state_store = state_store
        self._entity_area = entity_area
        self._tts_speak = tts_speak
        self._session_factory = session_factory
        self._agent_service = agent_service
        self._get_ha_rest_config = get_ha_rest_config
        self._version = version

    # ------------------------------------------------------------------ #
    # 配置访问
    # ------------------------------------------------------------------ #
    def _voice(self) -> dict[str, Any]:
        value = self._app_config.get("voice")
        return value if isinstance(value, dict) else {}

    def _stt_config(self) -> VoiceSttConfig:
        voice = self._voice()
        return VoiceSttConfig(
            language=str(voice.get("language") or "zh-CN"),
            stt_mode=str(voice.get("sttMode") or "auto"),
            stt_entity_id=str(voice.get("sttEntityId") or ""),
            use_ha_conversation=voice.get("useHaConversation") is not False,
        )

    def _stt_deps(self) -> VoiceSttDeps:
        return VoiceSttDeps(
            ha_connector=self._ha_connector,
            get_voice_config=self._stt_config,
            list_stt_providers=self._list_stt_providers_brief,
            get_ha_rest_config=self._get_ha_rest_config,
            logger=logger,
        )

    # ------------------------------------------------------------------ #
    # STT
    # ------------------------------------------------------------------ #
    async def _list_stt_providers_brief(self) -> list[dict[str, Any]]:
        entities = await self._ha_connector.fetch_entities_by_domain("stt")
        return [
            {"entity_id": e.get("entity_id"), "state": e.get("state")} for e in entities
        ]

    async def list_stt_providers(self) -> list[dict[str, Any]]:
        """列出 HA 可用的 STT 实体（含 friendly_name）。"""
        entities = await self._ha_connector.fetch_entities_by_domain("stt")
        out: list[dict[str, Any]] = []
        for entity in entities:
            attrs = entity.get("attributes") or {}
            out.append(
                {
                    "entity_id": entity.get("entity_id"),
                    "name": attrs.get("friendly_name") or entity.get("entity_id"),
                    "state": entity.get("state"),
                }
            )
        return out

    def get_stt_status(self) -> dict[str, Any]:
        voice = self._voice()
        return {
            "sttMode": voice.get("sttMode"),
            "language": voice.get("language"),
            "sttEntityId": voice.get("sttEntityId") or "",
            "useHaConversation": voice.get("useHaConversation"),
        }

    async def transcribe(self, audio_base64: str, format: str = "webm") -> dict[str, Any]:
        return await transcribe_voice_audio(audio_base64, format, self._stt_deps())

    async def process_conversation(self, text: str) -> dict[str, Any]:
        return await process_ha_conversation(text, self._stt_deps())

    async def auto_detect_stt_entity(self) -> str | None:
        return await resolve_stt_entity(self._stt_deps())

    # ------------------------------------------------------------------ #
    # 房间 / 命令
    # ------------------------------------------------------------------ #
    def voice_rooms(self) -> list[dict[str, Any]]:
        try:
            ha_areas = self._entity_area.get_cached_ha_areas()
        except Exception:
            ha_areas = []
        return resolve_voice_rooms(self._app_config.get("envSensorMap"), ha_areas)

    def get_command_presets(self) -> list[dict[str, Any]]:
        """全屋默认语音命令模板（深拷贝）。"""
        return [_deep_copy(item) for item in DEFAULT_WHOLE_HOME_VOICE_COMMANDS]

    # ------------------------------------------------------------------ #
    # TTS
    # ------------------------------------------------------------------ #
    async def speak(self, message: str, media_player: str | None = None) -> dict[str, Any]:
        return await self._tts_speak.speak(message, {"mediaPlayer": media_player})

    async def speak_multiple(
        self, message: str, media_players: list[str] | None = None
    ) -> dict[str, Any]:
        return await self._tts_speak.speak_to_multiple(message, {"mediaPlayers": media_players})

    # ------------------------------------------------------------------ #
    # 元信息
    # ------------------------------------------------------------------ #
    async def get_voice_meta(self) -> dict[str, Any]:
        await self._entity_area.ensure_loaded()
        stt_providers = await self.list_stt_providers()
        detected_stt = await resolve_stt_entity(self._stt_deps())
        tts_entities = await self._ha_connector.fetch_entities_by_domain("tts")
        media_players = [
            entity
            for entity in (self._state_store.get_all() if self._state_store is not None else [])
            if str(entity.get("entity_id") or "").startswith("media_player.")
        ]
        commands = self._app_config.get("voiceCommands")
        commands = commands if isinstance(commands, list) else []
        voice = self._voice()
        rooms = self.voice_rooms()
        custom_alerts = voice.get("customTtsAlerts")
        entity_alerts = voice.get("entityTtsAlerts")
        return {
            "rooms": [r.get("label") for r in rooms],
            "commandCount": len(commands),
            "defaultCommandCount": len(DEFAULT_WHOLE_HOME_VOICE_COMMANDS),
            "ttsMediaPlayerId": self._tts_speak.get_configured_media_player(),
            "stt": {
                **self.get_stt_status(),
                "providers": stt_providers,
                "detectedEntityId": detected_stt,
            },
            "ttsProviders": [e.get("entity_id") for e in tts_entities],
            "mediaPlayerCount": len(media_players),
            "ttsAlerts": resolve_voice_alert_rules(voice),
            "alertCatalog": [_deep_copy(item) for item in VOICE_ALERT_CATALOG],
            "wakeWords": normalize_wake_words(voice),
            "customAlertCount": (
                len(custom_alerts) if isinstance(custom_alerts, list) else 0
            )
            + (len(entity_alerts) if isinstance(entity_alerts, list) else 0),
        }

    # ------------------------------------------------------------------ #
    # 命令执行
    # ------------------------------------------------------------------ #
    async def execute_command(
        self, text: str, user: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        await self._entity_area.ensure_loaded()
        deps = VoiceCommandExecuteDeps(
            session_factory=self._session_factory,
            command_proxy=self._command_proxy,
            home_mode=self._home_mode,
            get_voice_commands=self._get_voice_commands,
            get_entities=lambda: self._state_store.get_all() if self._state_store is not None else [],
            get_rooms=self.voice_rooms,
            use_ha_conversation=lambda: self._stt_config().use_ha_conversation,
            process_conversation=self.process_conversation,
            logger=logger,
        )
        result = await execute_voice_command(text, user, deps)

        # 映射未命中且开启回落：交由智能管家（Agent LLM）理解并执行
        if result.get("source") == "none" and self._voice().get("agentFallback") and self._agent_service:
            return await self._agent_fallback(text, user)
        return result

    def _get_voice_commands(self) -> list[dict[str, Any]]:
        commands = self._app_config.get("voiceCommands")
        return commands if isinstance(commands, list) else []

    async def _agent_fallback(
        self, text: str, user: dict[str, Any] | None
    ) -> dict[str, Any]:
        from ..agent.agent_actor import AgentActor
        from ..agent.service import AgentChatOptions

        session_id = f"voice:{(user or {}).get('userId') or 'anon'}"
        try:
            agent = await self._agent_service.chat(
                text,
                [],
                AgentChatOptions(
                    actor=AgentActor(
                        role=(user or {}).get("role"),
                        restrictions=(user or {}).get("restrictions"),
                        user_id=(user or {}).get("userId"),
                        username=(user or {}).get("username"),
                    ),
                    session_id=session_id,
                ),
            )
            message = (agent.reply or "").strip() or "已由智能管家理解，但未生成可执行动作"
            return {
                "ok": agent.outcome in ("success", "answer"),
                "message": message,
                "source": "agent",
                "room": None,
                "count": len(agent.tool_calls or []),
            }
        except Exception as exc:
            logger.warning("语音回落智能管家失败: %s", exc)
            return {
                "ok": False,
                "message": str(exc) or "智能管家暂时不可用",
                "source": "agent",
            }


def _deep_copy(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _deep_copy(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_deep_copy(item) for item in value]
    return value


__all__ = ["VoiceService"]
