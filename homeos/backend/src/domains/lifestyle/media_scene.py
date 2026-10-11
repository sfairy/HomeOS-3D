"""影音场景服务（对齐 ``MediaSceneService``）。

职责：
- 预设场景（观影 / 音乐 / 派对 / 睡眠 / 游戏 / 晨间 / 关闭）一键应用：调光 + 调音量 + 多房间同步；
- 播放列表管理：start / next / getPlaylist，持久化到 appConfig ``mediaPlaylists``；
- 多房间媒体同步：groupSync（join）/ unjoin。

JS 侧 ``errors: undefined`` 在 JSON 中会被省略，本实现同样按需省略该字段。
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("homeos.system.lifestyle.media")

#: 场景预设 ID → 是否自动打开播放器
PRESETS: list[dict[str, Any]] = [
    {"id": "movie", "label": "观影", "opensPlayer": True},
    {"id": "music", "label": "音乐", "opensPlayer": True},
    {"id": "party", "label": "派对", "opensPlayer": True},
    {"id": "gaming", "label": "游戏", "opensPlayer": True},
    {"id": "morning", "label": "晨间", "opensPlayer": False},
    {"id": "sleep", "label": "睡眠", "opensPlayer": False},
    {"id": "off", "label": "关闭", "opensPlayer": False},
]


class MediaSceneService:
    """影音场景编排：灯光 / 媒体播放器统一入口。"""

    def __init__(self, ha_connector: Any, app_config: Any) -> None:
        self._ha_connector = ha_connector
        self._app_config = app_config
        #: 播放器 entity_id → { items, index }
        self._playlists: dict[str, dict[str, Any]] = {}

    # ------------------------------------------------------------------ #
    # 生命周期
    # ------------------------------------------------------------------ #
    def start(self) -> None:
        """对齐 ``onModuleInit``：从 appConfig.mediaPlaylists 恢复播放列表。"""
        stored = self._app_config.get("mediaPlaylists") or {}
        if not isinstance(stored, dict):
            return
        for player, playlist in stored.items():
            items = (playlist or {}).get("items") if isinstance(playlist, dict) else None
            if items:
                self._playlists[player] = {
                    "items": items,
                    "index": (playlist.get("index") or 0),
                }

    async def _persist_playlists(self) -> None:
        out = {
            player: {"items": pl["items"], "index": pl["index"]}
            for player, pl in self._playlists.items()
        }
        try:
            await _maybe_await(self._app_config.update({"mediaPlaylists": out}))
        except Exception as err:
            logger.warning("播放列表持久化失败: %s", err)

    # ------------------------------------------------------------------ #
    # 场景
    # ------------------------------------------------------------------ #
    def list_presets(self) -> list[dict[str, Any]]:
        return [dict(preset) for preset in PRESETS]

    async def apply_scene(
        self, preset: str, opts: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        options = opts or {}
        players = options.get("mediaPlayers") or await self._all_players()
        lights: list[str] = options.get("lights") or []
        actions: list[str] = []
        errors: list[dict[str, Any]] = []

        if preset == "movie":
            for light in lights:
                errors += _collect(await self._safe("light", "turn_on", light, {"brightness_pct": 10}))
            for player in players:
                errors += _collect(
                    await self._safe("media_player", "volume_set", player, {"volume_level": 0.5})
                )
            actions += ["灯光调暗至10%", "媒体音量50%"]
        elif preset == "music":
            for light in lights:
                errors += _collect(await self._safe("light", "turn_on", light, {"brightness_pct": 60}))
            for player in players:
                errors += _collect(
                    await self._safe("media_player", "volume_set", player, {"volume_level": 0.4})
                )
            actions += ["灯光60%", "媒体音量40%"]
        elif preset == "party":
            for light in lights:
                errors += _collect(
                    await self._safe(
                        "light", "turn_on", light, {"brightness_pct": 100, "effect": "colorloop"}
                    )
                )
            for player in players:
                errors += _collect(
                    await self._safe("media_player", "volume_set", player, {"volume_level": 0.7})
                )
            sync = await self.group_sync(players)
            if not sync.get("ok") and sync.get("errors"):
                errors += sync["errors"]
            actions += ["灯光全亮+流光", "媒体音量70%", "多房间同步"]
        elif preset == "sleep":
            for player in players:
                errors += _collect(await self._safe("media_player", "media_pause", player, {}))
            for light in lights:
                errors += _collect(await self._safe("light", "turn_off", light, {}))
            actions += ["暂停媒体", "关闭灯光"]
        elif preset == "gaming":
            for light in lights:
                errors += _collect(
                    await self._safe(
                        "light", "turn_on", light, {"brightness_pct": 80, "rgb_color": [120, 90, 220]}
                    )
                )
            for player in players:
                errors += _collect(
                    await self._safe("media_player", "volume_set", player, {"volume_level": 0.6})
                )
            actions += ["灯光80%+冷色氛围", "媒体音量60%"]
        elif preset == "morning":
            for light in lights:
                errors += _collect(
                    await self._safe(
                        "light", "turn_on", light, {"brightness_pct": 100, "color_temp": 400}
                    )
                )
            for player in players:
                errors += _collect(
                    await self._safe("media_player", "volume_set", player, {"volume_level": 0.3})
                )
            actions += ["灯光全亮暖白", "媒体音量30%"]
        elif preset == "off":
            for player in players:
                errors += _collect(await self._safe("media_player", "turn_off", player, {}))
            actions += ["关闭所有媒体设备"]

        player_states = await self._snapshot_players(players)
        logger.info("影音场景[%s]已应用: %s", preset, ",".join(actions))
        result: dict[str, Any] = {
            "preset": preset,
            "players": players,
            "lights": lights,
            "actions": actions,
            "playerStates": player_states,
        }
        if errors:
            result["errors"] = errors
        return result

    async def _snapshot_players(self, players: list[str]) -> list[dict[str, Any]]:
        states: list[dict[str, Any]] = []
        for entity_id in players:
            try:
                entity = await self._ha_connector.fetch_entity_state(entity_id)
                if not entity:
                    continue
                attrs = entity.get("attributes") or {}
                state_entry: dict[str, Any] = {
                    "entity_id": entity_id,
                    "state": entity.get("state"),
                }
                if attrs.get("media_title") is not None:
                    state_entry["media_title"] = attrs.get("media_title")
                if attrs.get("volume_level") is not None:
                    state_entry["volume_level"] = attrs.get("volume_level")
                states.append(state_entry)
            except Exception as err:
                logger.debug("媒体播放器状态拉取跳过 %s: %s", entity_id, err)
        return states

    # ------------------------------------------------------------------ #
    # 播放列表
    # ------------------------------------------------------------------ #
    async def start_playlist(self, player: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        if not items:
            return {"ok": False, "reason": "播放列表为空"}
        self._playlists[player] = {"items": items, "index": 0}
        await self._persist_playlists()
        play_result = await self._play_current(player)
        result: dict[str, Any] = {
            "ok": play_result["ok"],
            "player": player,
            "total": len(items),
        }
        if play_result.get("error") is not None:
            result["error"] = play_result["error"]
        return result

    async def next_track(self, player: str) -> dict[str, Any]:
        playlist = self._playlists.get(player)
        if playlist is None:
            return {"ok": False, "reason": "没有活动的播放列表"}
        playlist["index"] = (playlist["index"] + 1) % len(playlist["items"])
        await self._persist_playlists()
        play_result = await self._play_current(player)
        result: dict[str, Any] = {
            "ok": play_result["ok"],
            "index": playlist["index"],
            "current": playlist["items"][playlist["index"]],
        }
        if play_result.get("error") is not None:
            result["error"] = play_result["error"]
        return result

    def get_playlist(self, player: str) -> dict[str, Any] | None:
        return self._playlists.get(player)

    # ------------------------------------------------------------------ #
    # 多房间同步
    # ------------------------------------------------------------------ #
    async def group_sync(self, players: list[str]) -> dict[str, Any]:
        if len(players) < 2:
            return {"ok": False, "reason": "至少需要 2 个播放器"}
        master, slaves = players[0], players[1:]
        result = await self._safe("media_player", "join", master, {"group_members": slaves})
        out: dict[str, Any] = {"ok": result["ok"], "master": master, "slaves": slaves}
        if not result["ok"]:
            out["errors"] = [result]
        return out

    async def unjoin(self, players: list[str]) -> dict[str, Any]:
        errors: list[dict[str, Any]] = []
        for player in players:
            errors += _collect(await self._safe("media_player", "unjoin", player, {}))
        out: dict[str, Any] = {"ok": not errors, "players": players}
        if errors:
            out["errors"] = errors
        return out

    # ------------------------------------------------------------------ #
    # 内部
    # ------------------------------------------------------------------ #
    async def _play_current(self, player: str) -> dict[str, Any]:
        playlist = self._playlists.get(player)
        if playlist is None:
            return {"ok": False, "error": "无播放列表"}
        item = playlist["items"][playlist["index"]]
        result = await self._safe(
            "media_player",
            "play_media",
            player,
            {
                "media_content_id": item.get("mediaContentId"),
                "media_content_type": item.get("mediaContentType"),
            },
        )
        if result["ok"]:
            logger.info(
                "播放列表 %s: %s (%s/%s)",
                player,
                item.get("title") or item.get("mediaContentId"),
                playlist["index"] + 1,
                len(playlist["items"]),
            )
        return {"ok": result["ok"], "error": result.get("error")}

    async def _all_players(self) -> list[str]:
        try:
            entities = await self._ha_connector.fetch_entities_by_domain("media_player")
            return [str(entity.get("entity_id")) for entity in entities]
        except Exception as err:
            logger.warning("获取 media_player 列表失败: %s", err)
            return []

    async def _safe(
        self, domain: str, service: str, entity_id: str, data: dict[str, Any]
    ) -> dict[str, Any]:
        """调用 HA 服务，异常转为 ``{ok: False, error}`` 由调用方聚合。"""
        try:
            await self._ha_connector.call_service(domain, service, entity_id, data)
            return {"ok": True, "domain": domain, "service": service, "entityId": entity_id}
        except Exception as err:
            logger.debug("媒体动作失败 [%s.%s %s]: %s", domain, service, entity_id, err)
            return {
                "ok": False,
                "domain": domain,
                "service": service,
                "entityId": entity_id,
                "error": str(err),
            }


def _collect(result: dict[str, Any]) -> list[dict[str, Any]]:
    """成功返回空列表，失败返回单元素列表（对齐 Nest ``if (!r.ok) errors.push(r)``）。"""
    return [] if result["ok"] else [result]


async def _maybe_await(value: Any) -> Any:
    if hasattr(value, "__await__"):
        return await value
    return value


__all__ = ["PRESETS", "MediaSceneService"]
