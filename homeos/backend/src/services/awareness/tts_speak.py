"""统一 HA TTS 播报服务（对齐 ``ha-connector/tts-speak.service.ts``）。

智能顾问 / 告警 / 手动触发共用，按音箱类型选择最佳 TTS 路径并逐级降级：

1. Xiaomi Home 官方集成（``media_player`` stem 以 ``xiaomi_cn_`` 开头）→ ``notify``/``text`` 的
   ``play_text`` 实体（参数为 ``["文本"]`` JSON 字符串）；
2. HA ``tts.speak`` 服务（需解析可用 tts 实体，优先非 cloud）；
3. Xiaomi Miot Auto 集成（``xiaomi_miot.intelligent_speaker``）；
4. 默认 tts 引擎（不指定 entity_id 的 ``tts.speak``，仅当不是 Xiaomi Home 音箱时）。

任一路径成功即返回；全部失败时返回汇总错误。配置变更（``external`` / ``voice`` 段）失效缓存。
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from ...core.errors import api_error, bad_request

logger = logging.getLogger("homeos.awareness.tts")


class TtsSpeakService:
    """统一 TTS 播报服务。"""

    def __init__(self, app_config: Any, ha_connector: Any) -> None:
        self._app_config = app_config
        self._ha_connector = ha_connector
        #: 缓存的 TTS 实体 ID（None=未查询，False=无可用，str=已找到）
        self._cached_tts_entity: str | bool | None = None
        #: Xiaomi Home play_text 实体缓存：mediaPlayer stem → entity_id / None
        self._cached_xiaomi_home_play_text: dict[str, str | None] = {}

    # ------------------------------------------------------------------ #
    # 配置
    # ------------------------------------------------------------------ #
    def _external(self) -> dict[str, Any]:
        value = self._app_config.get("external")
        return value if isinstance(value, dict) else {}

    def _voice(self) -> dict[str, Any]:
        value = self._app_config.get("voice")
        return value if isinstance(value, dict) else {}

    def get_configured_media_player(self) -> str:
        """配置的默认 TTS 播报实体 ID（单个，可能为空字符串）。"""
        return str(self._external().get("ttsMediaPlayerId") or "").strip()

    def get_configured_media_players(self) -> list[str]:
        """配置的 TTS 播报实体 ID 列表（优先数组，回退单个，元素 trim）。"""
        external = self._external()
        ids = external.get("ttsMediaPlayerIds")
        ids = ids if isinstance(ids, list) else []
        fallback = str(external.get("ttsMediaPlayerId") or "").strip()
        if ids:
            return [str(item) for item in ids if str(item or "").strip()]
        return [fallback] if fallback else []

    def clear_cache(self) -> None:
        """失效 TTS 实体与 Xiaomi Home play_text 实体缓存。"""
        self._cached_tts_entity = None
        self._cached_xiaomi_home_play_text.clear()

    def on_config_updated(self, sections: Any) -> None:
        """配置变更事件处理：``external`` 或 ``voice`` 段变更时失效缓存。"""
        if isinstance(sections, list) and any(s in ("external", "voice") for s in sections):
            self.clear_cache()

    # ------------------------------------------------------------------ #
    # 播报入口
    # ------------------------------------------------------------------ #
    async def speak(self, message: str, opts: dict[str, Any] | None = None) -> dict[str, Any]:
        """向单个默认音箱播报文本。"""
        text = str(message or "").strip()
        if not text:
            return {"success": False, "message": "播报内容为空"}
        media_player = str((opts or {}).get("mediaPlayer") or "").strip() or self.get_configured_media_player()
        if not media_player:
            logger.warning("TTS 跳过:未配置 TTS 播报实体 - %s", text[:48])
            return {
                "success": False,
                "message": "未配置 TTS 播报音箱，请在设置 → 语音中填写默认播报音箱",
            }
        return await self._speak_to_single(media_player, text)

    async def speak_to_multiple(
        self, message: str, opts: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """向多个音箱并行播报文本（部分成功时 message 描述成功数量）。"""
        text = str(message or "").strip()
        if not text:
            return {"success": False, "message": "播报内容为空"}
        players_opt = (opts or {}).get("mediaPlayers")
        if isinstance(players_opt, list):
            media_players = [str(p) for p in players_opt if str(p or "").strip()]
        else:
            media_players = self.get_configured_media_players()
        if not media_players:
            logger.warning("TTS 跳过:未配置 TTS 播报实体 - %s", text[:48])
            return {
                "success": False,
                "message": "未配置 TTS 播报音箱，请在设置 → 语音中填写默认播报音箱",
            }

        results = await asyncio.gather(
            *(self._speak_to_single(player_id, text) for player_id in media_players)
        )
        success_count = sum(1 for r in results if r.get("success"))
        if success_count == 0:
            errors = "；".join(str(r.get("message")) for r in results if r.get("message"))
            return {"success": False, "message": errors or "TTS 播报失败"}
        if success_count < len(media_players):
            logger.warning("TTS 部分成功:%s/%s", success_count, len(media_players))
        return {"success": True, "message": f"已播报到 {success_count} 个音箱"}

    async def _speak_to_single(self, media_player: str, text: str) -> dict[str, Any]:
        voice_lang = str(self._voice().get("language") or "zh-CN").strip()
        service_data: dict[str, Any] = {
            "message": text,
            "media_player_entity_id": media_player,
        }
        if voice_lang:
            service_data["language"] = voice_lang
        errors: list[str] = []

        # 路径 1：Xiaomi Home 官方集成
        if self._is_xiaomi_home_speaker(media_player):
            try:
                await self._speak_via_xiaomi_home(media_player, text)
                logger.info("TTS 已播报 [Xiaomi Home → %s]", media_player)
                return {"success": True, "message": "已播报"}
            except Exception as exc:  # noqa: BLE001
                errors.append(f"小米官方集成: {exc}")

        # 路径 2：HA tts 域 speak 服务
        tts_entity = await self._resolve_tts_entity()
        if tts_entity:
            try:
                await self._ha_connector.call_service_via_rest(
                    "tts", "speak", tts_entity, service_data, 30_000
                )
                logger.info("TTS 已播报 [%s → %s]", tts_entity, media_player)
                return {"success": True, "message": "已播报"}
            except Exception as exc:  # noqa: BLE001
                errors.append(f"tts 实体 {tts_entity}: {exc}")

        # 路径 3：Xiaomi Miot Auto 集成
        if self._is_xiaomi_miot_speaker(media_player):
            try:
                await self._speak_via_xiaomi_miot(media_player, text)
                logger.info("TTS 已播报 [Xiaomi Miot → %s]", media_player)
                return {"success": True, "message": "已播报"}
            except Exception as exc:  # noqa: BLE001
                errors.append(f"Xiaomi Miot: {exc}")

        # 路径 4：默认 tts 引擎（仅当不是 Xiaomi Home 音箱时，避免重复尝试）
        if not self._is_xiaomi_home_speaker(media_player):
            try:
                await self._ha_connector.call_service_via_rest(
                    "tts", "speak", None, service_data, 30_000
                )
                logger.info("TTS 已播报 [默认引擎 → %s]", media_player)
                return {"success": True, "message": "已播报"}
            except Exception as exc:  # noqa: BLE001
                errors.append(f"默认 TTS → {media_player}: {exc}")

        detail = "；".join(errors)
        logger.warning("TTS 播报失败: %s", detail)
        return {"success": False, "message": detail or "TTS 播报失败"}

    # ------------------------------------------------------------------ #
    # 音箱类型判定
    # ------------------------------------------------------------------ #
    @staticmethod
    def _media_player_stem(media_player: str) -> str:
        stem = str(media_player or "")
        if stem.lower().startswith("media_player."):
            stem = stem[len("media_player.") :]
        return stem.lower()

    def _is_xiaomi_home_speaker(self, media_player: str) -> bool:
        return self._media_player_stem(media_player).startswith("xiaomi_cn_")

    def _is_xiaomi_miot_speaker(self, media_player: str) -> bool:
        stem = self._media_player_stem(media_player)
        if stem.startswith("xiaomi_cn_"):
            return False
        return "xiaomi" in stem or "xiaoai" in stem

    # ------------------------------------------------------------------ #
    # 各路径实现
    # ------------------------------------------------------------------ #
    async def _speak_via_xiaomi_home(self, media_player: str, text: str) -> None:
        """小米官方集成播报：notify/text 域 ``play_text`` 实体，参数为 ``["文本"]``。"""
        payload = json.dumps([text], ensure_ascii=False)
        play_text_entity = await self._resolve_xiaomi_home_play_text_entity(media_player)
        if not play_text_entity:
            bad_request(api_error("TTS_XIAOMI_PLAY_TEXT_NOT_FOUND"))
        if play_text_entity.startswith("notify."):
            await self._ha_connector.call_service_via_rest(
                "notify", "send_message", play_text_entity, {"message": payload}, 30_000
            )
            return
        await self._ha_connector.call_service_via_rest(
            "text", "set_value", play_text_entity, {"value": payload}, 30_000
        )

    async def _resolve_xiaomi_home_play_text_entity(self, media_player: str) -> str | None:
        """在 notify / text 域匹配同时含 stem 与 ``play_text`` 的实体（带缓存）。"""
        stem = self._media_player_stem(media_player)
        if stem in self._cached_xiaomi_home_play_text:
            return self._cached_xiaomi_home_play_text.get(stem)

        def _match_play_text(entity_id: str) -> bool:
            lowered = str(entity_id).lower()
            return stem in lowered and "play_text" in lowered

        notifies = await self._ha_connector.fetch_entities_by_domain("notify")
        notify_entity = next(
            (e.get("entity_id") for e in notifies if _match_play_text(str(e.get("entity_id") or ""))),
            None,
        )
        if notify_entity:
            self._cached_xiaomi_home_play_text[stem] = notify_entity
            return notify_entity

        texts = await self._ha_connector.fetch_entities_by_domain("text")
        text_entity = next(
            (e.get("entity_id") for e in texts if _match_play_text(str(e.get("entity_id") or ""))),
            None,
        )
        self._cached_xiaomi_home_play_text[stem] = text_entity
        return text_entity

    async def _speak_via_xiaomi_miot(self, media_player: str, text: str) -> None:
        await self._ha_connector.call_service_via_rest(
            "xiaomi_miot",
            "intelligent_speaker",
            None,
            {"entity_id": media_player, "text": text, "execute": False},
            30_000,
        )

    async def _resolve_tts_entity(self) -> str | None:
        """解析可用 tts 实体（优先非 cloud），带缓存。"""
        if self._cached_tts_entity is not None:
            return self._cached_tts_entity if isinstance(self._cached_tts_entity, str) else None
        entities = await self._ha_connector.fetch_entities_by_domain("tts")
        preferred = next(
            (e for e in entities if "cloud" not in str(e.get("entity_id") or "")), None
        ) or next((e for e in entities if e.get("entity_id")), None)
        entity_id = str(preferred.get("entity_id")) if preferred else None
        self._cached_tts_entity = entity_id or False
        return entity_id


__all__ = ["TtsSpeakService"]
