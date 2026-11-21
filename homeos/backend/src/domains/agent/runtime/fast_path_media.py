"""快路径：媒体族（媒体动作 / 点歌 / 电视应用）。

从 ``fast_path.py`` 拆出：媒体相关的正则、kind 推断与三个解析器。都是纯解析 +
一次画像查询，不含房间匹配逻辑，因此可以独立放进 mixin。
"""

from __future__ import annotations

import asyncio
import logging
import re
import unicodedata
from typing import Any

logger = logging.getLogger("homeos.agent.fast_path.media")

#: 媒体动作（顺序敏感：先匹配「暂停播放」再匹配「播放」）
MEDIA_ACTIONS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"暂停(播放)?"), "pause"),
    (re.compile(r"(继续|恢复|接着)(播放)?"), "play"),
    (re.compile(r"停止(播放)?"), "stop"),
    (re.compile(r"(下一首|下一曲|下一集|切歌)"), "next"),
    (re.compile(r"(上一首|上一曲|上一集)"), "previous"),
)
#: 媒体音量绝对值：「音量调到 40%」
MEDIA_VOLUME = re.compile(r"音量(?:调到|设为|设置|调成|调至|开到)?\s*(?P<value>\d{1,3})\s*%?")
#: 媒体音量相对调整：「音量调大 / 小一点」
MEDIA_VOLUME_REL = re.compile(r"音量(调大|大一点|大一些|调小|小一点|小一些)")

#: 电视应用：「打开电视上的 Netflix」/「在电视上打开 B站」
TV_APP_PATTERNS = (
    re.compile(r"^(?:在)?(?:电视|苹果电视|apple\s*tv)\s*上\s*(?:打开|开启|启动|播放)\s*(.+?)$", re.IGNORECASE),
    re.compile(r"^(?:打开|开启|启动|播放)\s*(?:电视|苹果电视|apple\s*tv)\s*上的?\s*(.+?)$", re.IGNORECASE),
)
#: 含这些词的句子属于规则 / 延时，不是「现在打开应用」
TV_APP_BLOCKERS = re.compile(r"分钟|小时|稍后|明天|如果|以后|之后|然后|[,，;；]")
TV_APP_INVALID_NAMES = frozenset({"机", "的", "上", "一下", "吧", "谢谢"})

#: 点歌口令
MUSIC_REQUEST = re.compile(r"^(?:点歌|点播|播放歌曲|播放音乐|播放一首)\s*[《<]?(?P<track>.+?)[》>]?$")
MUSIC_QUOTED = re.compile(r"^播放[《<](?P<track>.+?)[》>]$")
#: 带房间限定的点歌：「在客厅点歌 稻香」「卧室播放歌曲 晴天」
MUSIC_ROOM_REQUEST = re.compile(
    r"^(?:在)?(?P<room>[^，。,.!?《<]{1,12}?)(?:里|中|的)?\s*"
    r"(?:点歌|点播|播放歌曲|播放音乐|播放一首)\s*[《<]?(?P<track>.+?)[》>]?$"
)
#: 房间词里常见的非房间前缀（避免把「给我」当成房间）
_MUSIC_ROOM_STOPWORDS = ("给我", "帮我", "请", "麻烦", "替我", "来一首", "来首")
#: 点歌时排除的规则 / 延时词
_MUSIC_BLOCKERS = ("每天", "每次", "如果", "分钟", "小时", "明天", "之后", "提醒")

#: 媒体 kind 推断：说「电视」时优先 tv / apple_tv；说「音箱」时优先 speaker / receiver
_MEDIA_TV_WORDS = ("电视", "apple tv", "appletv", "苹果电视")
_MEDIA_SPEAKER_WORDS = ("音箱", "音响", "speaker", "homepod", "功放", "回音壁", "soundbar")


def normalize_app_name(value: str) -> str:
    """应用名归一：NFKC + 去空白 + 小写（与设备画像的 app 比较口径一致）。"""
    return unicodedata.normalize("NFKC", str(value or "")).replace(" ", "").strip().lower()


def strip_play_politeness(text: str) -> str:
    """点歌专用礼貌前缀：``请 / 帮我 / 麻烦 / 给我``（不影响其它快路径的既有前缀表）。"""
    return re.sub(r"^(?:请|帮我|麻烦|给我|替我)\s*", "", str(text or "").strip())


class MediaFastPathMixin:
    """媒体相关解析器（宿主需提供 ``_resolve_single_device`` / ``_entity_attributes`` 等）。"""

    _state_store: Any = None
    _device_profiles: Any = None
    _strip_target_prefix: Any = None
    _resolve_single_device: Any = None
    _entity_attributes: Any = None
    _get_areas: Any = None

    @staticmethod
    def _media_kinds_of(text: str) -> tuple[str, ...] | None:
        """从用户措辞推断媒体 kind（电视 vs 音箱）；都没有提及时返回 None（不收窄）。"""
        lowered = str(text or "").lower()
        if any(word in lowered for word in _MEDIA_TV_WORDS):
            return ("tv", "apple_tv")
        if any(word in lowered for word in _MEDIA_SPEAKER_WORDS):
            return ("speaker", "receiver")
        return None

    async def _try_parse_media(
        self, cleaned: str, original_text: str, hints: list[str] | None
    ) -> dict[str, Any] | None:
        """媒体控制：播放 / 暂停 / 切歌 / 音量。"""
        media_words = ("电视", "音响", "音箱", "播放器", "媒体", "音乐")
        hinted_media = any(str(eid).startswith("media_player.") for eid in (hints or []))
        if not (any(word in cleaned for word in media_words) or hinted_media):
            return None
        kinds = self._media_kinds_of(cleaned)

        for pattern, action in MEDIA_ACTIONS:
            match = pattern.search(cleaned)
            if not match:
                continue
            target = self._strip_target_prefix(cleaned[: match.start()])
            entity_id = await self._resolve_single_device(target, "media_player", hints, kinds=kinds)
            if not entity_id:
                return None
            logger.info('快路径命中(媒体): "%s" → %s %s', original_text, entity_id, action)
            return {
                "kind": "tool",
                "tool": "media_control",
                "args": {"entity_id": entity_id, "action": action},
                "summary": f"媒体 {action}",
            }

        match = MEDIA_VOLUME_REL.search(cleaned)
        if match:
            target = self._strip_target_prefix(cleaned[: match.start()])
            entity_id = await self._resolve_single_device(target, "media_player", hints, kinds=kinds)
            if not entity_id:
                return None
            raw = self._entity_attributes(entity_id).get("volume_level")
            current = float(raw) if isinstance(raw, (int, float)) else 0.3
            up = "大" in match.group(0)
            volume = max(0.0, min(1.0, current + (0.1 if up else -0.1)))
            logger.info('快路径命中(相对音量): "%s" → %s %.0f%%', original_text, entity_id, volume * 100)
            return {
                "kind": "tool",
                "tool": "media_control",
                "args": {"entity_id": entity_id, "action": "volume", "volume": round(volume, 2)},
                "summary": f"音量调到 {round(volume * 100)}%",
            }

        match = MEDIA_VOLUME.search(cleaned)
        if match:
            value = int(match.group("value"))
            if not 0 <= value <= 100:
                return None
            target = self._strip_target_prefix(cleaned[: match.start()])
            entity_id = await self._resolve_single_device(target, "media_player", hints, kinds=kinds)
            if not entity_id:
                return None
            logger.info('快路径命中(音量): "%s" → %s %s%%', original_text, entity_id, value)
            return {
                "kind": "tool",
                "tool": "media_control",
                "args": {"entity_id": entity_id, "action": "volume", "volume": round(value / 100, 2)},
                "summary": f"音量调到 {value}%",
            }
        return None

    async def _try_parse_tv_app(self, text: str, hints: list[str] | None = None) -> dict[str, Any] | None:
        """打开电视上的某个应用：``打开电视上的 Netflix`` / ``在电视上打开 B站``。

        目标优先级：会话临时选择 → 房间默认 → ``source_list`` 唯一含该 app 的画像 → 唯一画像。
        含时间 / 条件词（``分钟``、``以后``…）一律跳过，避免把规则当动作。
        """
        if self._device_profiles is None:
            return None
        room_name, cleaned = await self._split_tv_app_room(text)
        match = self._match_tv_app_text(cleaned)
        if match is None:
            return None
        app = match.strip(" 《》<>\"'")
        if not app or len(app) > 80 or app in TV_APP_INVALID_NAMES:
            return None
        candidates = await self._tv_app_candidates(app, hints, room_name)
        if isinstance(candidates, list):
            if len(candidates) == 1:
                entity_id, name = candidates[0]
                logger.info('快路径命中(电视应用): "%s" → %s/%s', text, name, app)
                return {
                    "kind": "tool",
                    "tool": "media_control",
                    "args": {"action": "open_tv_app", "entity_id": entity_id, "app": app},
                }
            return {
                "kind": "ambiguous",
                "reason": "tv_app_ambiguous",
                "roomName": room_name or "",
                "action": "on",
                "candidates": [name for _, name in candidates[:5]],
            }
        # 无可用目标（画像为空 / 读取失败 / 指定房间没有电视）：交给 LLM，不猜
        return None

    async def _split_tv_app_room(self, text: str) -> tuple[str | None, str]:
        """剥离房间限定：「在客厅的电视上打开 Netflix」「打开卧室电视上的 Netflix」。

        房间名来自 HA 区域名（长名优先），只认「紧挨着电视」的那一次出现 —— 否则
        「打开小客厅灯」这类句子里的房间名会把无关指令改写掉。
        """
        raw = str(text or "").strip()
        try:
            areas = await self._get_areas()
        except Exception as exc:
            logger.debug("读取房间失败: %s", exc)
            return None, raw
        for area in sorted(areas, key=lambda item: -len(str(item.get("name") or ""))):
            name = str(area.get("name") or "").strip()
            if not name:
                continue
            identifier = str(area.get("id") or name)
            index = raw.find(name)
            while index != -1:
                rest = raw[index + len(name) :].lstrip("的")
                if rest.lower().startswith(("电视", "苹果电视", "apple tv", "appletv")):
                    stripped = (raw[:index] + rest).strip()
                    return identifier, stripped
                index = raw.find(name, index + 1)
        return None, raw

    @staticmethod
    def _match_tv_app_text(text: str) -> str | None:
        cleaned = str(text or "").strip()
        if not cleaned or TV_APP_BLOCKERS.search(cleaned):
            return None
        for pattern in TV_APP_PATTERNS:
            match = pattern.match(cleaned)
            if match:
                return match.group(1).strip()
        return None

    async def _tv_app_candidates(
        self, app: str, hints: list[str] | None, room: str | None = None
    ) -> list[tuple[str, str]] | dict[str, Any]:
        """返回候选 ``[(entityId, name)]``；无可用目标时返回带 ``error`` 的字典。"""
        try:
            profiles = await asyncio.to_thread(self._device_profiles.list)
        except Exception as exc:
            logger.debug("读取设备画像失败: %s", exc)
            return {"error": "profile_unavailable"}
        tv_like = [
            item
            for item in (profiles or [])
            if isinstance(item, dict) and item.get("kind") in ("apple_tv", "tv") and item.get("usable")
        ]
        if room:
            # 指定了房间就只在该房间内选：跨房间兜底等于控制错设备。
            tv_like = [
                item
                for item in tv_like
                if str(item.get("areaId") or "") == room or str(item.get("areaName") or "") == room
            ]
            if not tv_like:
                logger.info("电视应用: 房间 %s 内没有可用电视，交回 LLM", room)
                return {"error": "room_no_tv"}
        hinted = [eid for eid in (hints or []) if str(eid).startswith("media_player.")]
        if len(hinted) == 1:
            hit = next((item for item in tv_like if item.get("entityId") == hinted[0]), None)
            if hit is not None:
                return [(str(hit["entityId"]), str(hit.get("name") or hit["entityId"]))]
        # 只有一台电视明确列出了这个应用时，它比「房间默认」更精确。
        with_source = [item for item in tv_like if self._source_list_has(item.get("entityId"), app)]
        if len(with_source) == 1:
            return [(str(with_source[0]["entityId"]), str(with_source[0].get("name") or with_source[0]["entityId"]))]
        default_target = await self._tv_default_target(tv_like)
        if default_target is not None:
            return [(str(default_target["entityId"]), str(default_target.get("name") or default_target["entityId"]))]
        chosen = with_source or tv_like
        return [(str(item["entityId"]), str(item.get("name") or item["entityId"])) for item in chosen]

    async def _tv_default_target(self, tv_like: list[dict[str, Any]]) -> dict[str, Any] | None:
        """房间默认设备里唯一的电视 / Apple TV；多条默认时不擅自替用户选。"""
        try:
            defaults = await asyncio.to_thread(self._device_profiles.defaults)
        except Exception as exc:
            logger.debug("读取房间默认设备失败: %s", exc)
            return None
        ids = {
            str(row.get("entityId"))
            for row in (defaults or [])
            if isinstance(row, dict) and row.get("kind") in ("tv", "apple_tv") and row.get("entityId")
        }
        matched = [item for item in tv_like if str(item.get("entityId")) in ids]
        return matched[0] if len(matched) == 1 else None

    def _source_list_has(self, entity_id: Any, app: str) -> bool:
        sources = self._entity_attributes(str(entity_id or "")).get("source_list")
        if not isinstance(sources, list):
            return False
        target = normalize_app_name(app)
        return any(normalize_app_name(str(item)) == target for item in sources)

    async def _try_parse_music_request(self, text: str) -> dict[str, Any] | None:
        """点歌：「点歌 稻香」「在客厅点歌 稻香」「播放歌曲 周杰伦的稻香」。

        动态意图（「每天」「分钟后」）在 ``try_parse`` 入口已由 IntentGate / 长度约束挡住；
        这里再排一次时间/条件词，避免把规则当成点歌。房间限定会解析成 ``area_id``，
        多房间各配了默认音箱时不再反问「在哪个房间」。
        """
        cleaned = strip_play_politeness(text)
        if any(word in cleaned for word in _MUSIC_BLOCKERS):
            return None
        matched = self._match_music_case(cleaned)
        if matched is None:
            return None
        body, room_text = matched
        parts = self._split_music_body(body)
        if parts is None:
            return None
        artist, track = parts
        args: dict[str, Any] = {"action": "play_music", "artist": artist, "track": track}
        if room_text:
            area_id = await self._resolve_area_id(room_text)
            if area_id:
                args["area_id"] = area_id
        return {"kind": "tool", "tool": "media_control", "args": args}

    @staticmethod
    def _match_music_case(cleaned: str) -> tuple[str, str] | None:
        """返回 ``(曲目片段, 房间词)``；不是点歌口令返回 ``None``。"""
        match = MUSIC_QUOTED.match(cleaned)
        if match is not None:
            return match.group("track").strip(), ""
        room_match = MUSIC_ROOM_REQUEST.match(cleaned)
        if room_match is not None:
            room_text = room_match.group("room").strip()
            if any(word in room_text for word in _MUSIC_ROOM_STOPWORDS):
                room_text = ""
            return room_match.group("track").strip(), room_text
        plain = MUSIC_REQUEST.match(cleaned)
        return (plain.group("track").strip(), "") if plain is not None else None

    @staticmethod
    def _split_music_body(body: str) -> tuple[str, str] | None:
        """把「周杰伦的稻香」拆成 ``(artist, track)``；空曲目或过长返回 ``None``。"""
        if not body or len(body) > 80:
            return None
        artist = ""
        track = body
        for separator in ("的《", "的", " - ", "—"):
            if separator in body:
                artist, track = body.split(separator, 1)
                track = track.strip(" 《》<>")
                break
        track = track.strip()
        return (artist.strip(), track) if track else None

    async def _resolve_area_id(self, text: str) -> str:
        """房间名 → area id（长名优先；识别不到返回空串，由后端给「请说明房间」）。"""
        try:
            areas = await self._get_areas()
        except Exception as exc:
            logger.debug("点歌解析房间失败: %s", exc)
            return ""
        lowered = str(text or "").lower()
        for area in sorted(areas, key=lambda item: -len(str(item.get("name") or ""))):
            name = str(area.get("name") or "").strip()
            if name and (name.lower() == lowered or name.lower() in lowered or lowered in name.lower()):
                return str(area.get("id") or name)
        return ""


__all__ = [
    "MEDIA_ACTIONS",
    "MEDIA_VOLUME",
    "MEDIA_VOLUME_REL",
    "MediaFastPathMixin",
    "normalize_app_name",
    "strip_play_politeness",
]
