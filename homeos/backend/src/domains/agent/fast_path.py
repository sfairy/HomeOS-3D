"""快路径解析服务（免 LLM 直接控制）。"""

from __future__ import annotations

import logging
import re
from typing import Any

from .area_service import AgentAreaService
from .config_service import AgentConfigService
from .lang_template_service import LangTemplateService
from .tools.high_risk_denylist import SceneVoiceControlGate, is_scene_voice_allowed
from ...platform.core.entity_domain import get_entity_domain

logger = logging.getLogger("homeos.agent.fast_path")

#: 场景 / 脚本快路径意图判定：整句为「晚安」等纯口令
SCENE_WHOLE_PHRASES = re.compile(r"^(晚安|我睡了|出门了|我出门了)$")
#: 场景 / 脚本快路径意图判定：出现「模式 / 场景 / 脚本」字样
SCENE_INTENT_WORDS = re.compile(r"(模式|场景|脚本)")
#: 场景 / 脚本快路径意图判定：以执行类动词开头
SCENE_INTENT_VERBS = re.compile(r"^(执行|激活|启动|运行|触发)")
#: 场景 / 脚本快路径意图判定：动作词 + 常见场景口令词
SCENE_INTENT_PHRASES = re.compile(
    r"^(开启|打开|关闭|关掉|进入)(回家|离家|观影|睡眠|起床|会客|就餐|就寝|离开|晚安|上班|度假)"
)
#: 词干提取：剥离句首动作词
SCENE_ACTION_PREFIX = re.compile(
    r"^(执行|激活|启动|运行|触发|开启|打开|关闭|关掉|进入|run|activate|start|execute|turn on)\s*"
)
#: 词干提取：剥离句尾「场景 / 模式 / 脚本」等类别后缀
SCENE_CATEGORY_SUFFIX = re.compile(r"(场景|模式|脚本|scene|script|mode)\s*$")

#: 配置 / 区域 / 实体注册表变更事件名（与 Nest HOMEOS_EVENTS / HA 事件对齐）
_AREA_CACHE_INVALIDATION_EVENTS = (
    "SYSTEM_CONFIG_UPDATED",
    "area.updated",
    "ha.entity_registry_updated",
)

#: 设温度分支内显式中止（如多空调消歧），与「未命中、继续开 / 关」区分。
_FAST_PATH_ABORT = object()

#: 灯光亮度绝对值：「客厅灯亮度调到 50%」
_BRIGHTNESS_SET = re.compile(
    r"^(?P<target>.*?)(?:的)?(?:亮度)?(?:调到|设为|设置|调成|调至)\s*(?P<value>\d{1,3})\s*(?:%|百分比)?$"
)
#: 灯光亮度相对调整：「调亮一点 / 太暗了」
_BRIGHTNESS_REL = re.compile(r"(调亮|亮一点|亮一些|太暗了|调暗|暗一点|暗一些|太亮了)")
#: 色温绝对值：「色温调到 4000K」
_COLOR_TEMP_SET = re.compile(
    r"(?:色温)?(?:调到|设为|设置|调成|调至)\s*(?P<value>\d{3,5})\s*[kK]\s*$"
)
#: 色温相对调整：「暖一点 / 冷一点」
_COLOR_TEMP_REL = re.compile(r"(调暖|暖一点|暖一些|调冷|冷一点|冷一些)")
#: 窗帘位置：「窗帘开到 30% / 打开一半」
_COVER_POSITION = re.compile(
    r"^(?P<target>.*?)(?:窗帘|遮光帘|卷帘|百叶窗|帘子)?"
    r"(?:开到|调到|设为|设置|调成|调至|打开到)\s*(?P<value>\d{1,3})\s*%?$"
)
#: 窗帘半开
_COVER_HALF = re.compile(r"(一半|半开)")
#: 媒体动作（顺序敏感：先匹配「暂停播放」再匹配「播放」）
_MEDIA_ACTIONS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"暂停(播放)?"), "pause"),
    (re.compile(r"(继续|恢复|接着)(播放)?"), "play"),
    (re.compile(r"停止(播放)?"), "stop"),
    (re.compile(r"(下一首|下一曲|下一集|切歌)"), "next"),
    (re.compile(r"(上一首|上一曲|上一集)"), "previous"),
)
#: 媒体音量绝对值：「音量调到 40%」
_MEDIA_VOLUME = re.compile(
    r"音量(?:调到|设为|设置|调成|调至|开到)?\s*(?P<value>\d{1,3})\s*%?"
)
#: 媒体音量相对调整：「音量调大 / 小一点」
_MEDIA_VOLUME_REL = re.compile(r"音量(调大|大一点|大一些|调小|小一点|小一些)")
#: 风扇百分比：「风扇调到 60%」
_FAN_PERCENT = re.compile(r"(?:风速|风扇)(?:调到|设为|调成|调至|开到)?\s*(?P<value>\d{1,3})\s*%")
#: 风扇档位：「风速调到 3 档」
_FAN_LEVEL = re.compile(r"(?:风速|风扇)(?:调到|设为|调成|调至)?\s*(?P<level>[一二三四五1-5])\s*档")
#: 风扇相对调整：「风大一点 / 调小」
_FAN_REL = re.compile(r"(风大一点|风小一点|风速调大|风速调小|风量大一点|风量小一点)")
#: 空调模式
_CLIMATE_MODES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"制冷|冷风"), "cool"),
    (re.compile(r"制热|加热|暖风"), "heat"),
    (re.compile(r"除湿"), "dry"),
    (re.compile(r"送风"), "fan_only"),
    (re.compile(r"自动"), "auto"),
)
#: 温度相对调整：「调高两度 / 低一点」
_TEMP_REL = re.compile(
    r"(?:温度)?(调高|调低|升高|降低|高一点|低一点|高一些|低一些)\s*(?P<delta>\d+|[一二两三四五])?\s*[度°]?"
)
#: 中文数字 → 阿拉伯数字（只覆盖常见调整幅度）
_CN_DIGITS = {"一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5}
#: 指代词：「把它关掉 / 打开它 / 调亮它」
_PRONOUN_TARGETS = frozenset({"它", "他", "她", "这个", "那个", "它们", "这些", "那些"})


def looks_like_scene_intent(text: str) -> bool:
    """判断是否具备场景 / 脚本快路径的意图特征。

    仅在命中时才去扫描实体表，避免每条指令都做无谓开销。
    """
    return bool(
        SCENE_WHOLE_PHRASES.search(text)
        or SCENE_INTENT_WORDS.search(text)
        or SCENE_INTENT_VERBS.search(text)
        or SCENE_INTENT_PHRASES.search(text)
    )


class FastPathService:
    """快路径服务：订阅配置 / 实体注册表变更事件以清空房间缓存。"""

    def __init__(
        self,
        area_service: AgentAreaService,
        state_store: Any,
        lang_templates: LangTemplateService,
        event_bus: Any = None,
        agent_config: AgentConfigService | None = None,
    ) -> None:
        self._area_service = area_service
        self._state_store = state_store
        self._lang_templates = lang_templates
        self._event_bus = event_bus
        self._agent_config = agent_config
        #: 房间列表缓存，事件触发后清空以便下次重新拉取
        self._area_cache: list[dict[str, str]] = []
        #: 带实体的房间缓存，避免 find_device_globally / get_room_devices 逐房 find_one
        self._area_entities_cache: list[Any] | None = None

    def bind_events(self) -> None:
        """模块初始化：订阅配置 / 实体注册表更新事件，清空房间缓存。"""

        def clear_area_cache(_payload: Any = None) -> None:
            self._area_cache = []

        if self._event_bus is None:
            return
        for event in _AREA_CACHE_INVALIDATION_EVENTS:
            self._event_bus.on(event, clear_area_cache)

    @property
    def _L(self) -> Any:
        """当前语言模板（正则、关键词等）。"""
        return self._lang_templates.current

    async def _try_parse_set_temperature(
        self, cleaned: str, original_text: str, temp_match: Any
    ) -> dict[str, Any] | object | None:
        """设温度快路径（调用方已确认 ``set_temperature`` 正则命中）。

        返回命中 dict、``_FAST_PATH_ABORT``（多空调等显式中止）、或 None（条件未满足，继续开 / 关）。
        """
        before = cleaned[: cleaned.index(temp_match.group(0))]
        before = self._L.strip_pattern.sub("", before).strip()
        temperature_celsius = int(temp_match.group(2))
        if len(before) >= 2 and 10 <= temperature_celsius <= 35:
            # 仅在描述命中 climate（空调）关键词时才走设温度
            ac_dk = next(
                (
                    domain_kw
                    for domain_kw in self._L.domain_keywords
                    if any(kw in before for kw in domain_kw.keywords)
                    and domain_kw.domain == "climate"
                ),
                None,
            )
            if ac_dk is not None:
                areas = await self._get_areas()
                room = self._resolve_room(before, areas)
                if room is not None:
                    # 取房间内第一个 climate 设备作为控制对象
                    climate_devices = await self._get_room_devices(room["id"], "climate")
                    if len(climate_devices) > 1:
                        logger.info(
                            '快路径跳过(多空调消歧): "%s" → %s 台',
                            original_text,
                            len(climate_devices),
                        )
                        return _FAST_PATH_ABORT
                    climate_entity = climate_devices[0]["entityId"] if climate_devices else None
                    if climate_entity:
                        logger.info(
                            '快路径命中(set_temp): "%s" → %s  %s°C',
                            original_text,
                            climate_entity,
                            temperature_celsius,
                        )
                        return {
                            "kind": "device",
                            "service": "set_temperature",
                            "entityId": climate_entity,
                            "serviceData": {"temperature": temperature_celsius},
                        }
        return None

    def _domain_keyword_for(self, domain: str) -> Any:
        """按设备域取语言模板里的开 / 关服务映射。"""
        return next(
            (dk for dk in self._L.domain_keywords if dk.domain == domain),
            None,
        )

    def _strip_target_prefix(self, target: str) -> str:
        """去掉宾语标记、动作词与语气词，得到「客厅灯」这类目标描述。"""
        text = str(target or "").strip()
        marker = self._L.object_marker
        if marker and text.startswith(marker):
            text = text[len(marker) :].strip()
        if text.startswith("把"):
            text = text[1:].strip()
        text = re.sub(r"(打开|开启|关闭|关掉)$", "", text).strip()
        return self._L.strip_pattern.sub("", text).strip()

    async def _resolve_single_device(
        self,
        description: str,
        domain: str,
        hints: list[str] | None = None,
    ) -> str | None:
        """在「房间 → 房间内设备 → 全局设备 → 指代提示」之间解析唯一目标。

        无法确定唯一设备时返回 None（交给 LLM 消歧），避免误控同房间多台设备。
        """
        text = str(description or "").strip()
        if text:
            areas = await self._get_areas()
            room = self._resolve_room(text, areas)
            if room is not None:
                devices = await self._get_room_devices(room["id"], domain)
                if not devices:
                    return None
                exact = [device for device in devices if device["name"] and device["name"] in text]
                if len(exact) == 1:
                    return exact[0]["entityId"]
                if len(exact) > 1:
                    names = {device["entityId"] for device in exact}
                    exact.sort(key=lambda device: -len(device["name"]))
                    return exact[0]["entityId"] if len(names) == 1 else None
                if len(devices) == 1:
                    return devices[0]["entityId"]
                return None
            global_id = await self._find_device_globally(text, domain)
            if global_id:
                return global_id
        hinted = [eid for eid in (hints or []) if str(eid).startswith(f"{domain}.")]
        if len(hinted) == 1:
            return hinted[0]
        if text:
            return None
        # 描述为空时允许「全屋唯一设备」兜底（如只有一台空调 / 一个窗帘）
        all_devices: list[dict[str, str]] = []
        for area in await self._get_areas_with_entities():
            all_devices.extend(await self._get_room_devices(area.id, domain))
        if len(all_devices) == 1:
            return all_devices[0]["entityId"]
        return None

    def _entity_attributes(self, entity_id: str | None) -> dict[str, Any]:
        """读取实体 attributes（缺失时返回空 dict）。"""
        if not entity_id:
            return {}
        entity = self._state_store.get(entity_id)
        attributes = entity.get("attributes") if isinstance(entity, dict) else None
        return attributes if isinstance(attributes, dict) else {}

    def _entity_state(self, entity_id: str | None) -> str:
        if not entity_id:
            return ""
        entity = self._state_store.get(entity_id)
        return str(entity.get("state") or "").lower() if isinstance(entity, dict) else ""

    async def _try_parse_light_brightness(
        self, cleaned: str, original_text: str, hints: list[str] | None
    ) -> dict[str, Any] | None:
        """灯光亮度（绝对值 / 相对调整）。"""
        has_light = "灯" in cleaned or "亮度" in cleaned
        hinted_light = any(str(eid).startswith("light.") for eid in (hints or []))
        if not (has_light or hinted_light):
            return None

        match = _BRIGHTNESS_SET.search(cleaned)
        if match:
            value = int(match.group("value"))
            if not 1 <= value <= 100:
                return None
            target = self._strip_target_prefix(match.group("target"))
            entity_id = await self._resolve_single_device(target, "light", hints)
            if not entity_id:
                return None
            logger.info('快路径命中(亮度): "%s" → %s %s%%', original_text, entity_id, value)
            return {
                "kind": "tool",
                "tool": "set_light_brightness",
                "args": {"entity_id": entity_id, "brightness": value},
                "summary": f"把亮度调到 {value}%",
            }

        match = _BRIGHTNESS_REL.search(cleaned)
        if match:
            target = self._strip_target_prefix(cleaned[: match.start()])
            entity_id = await self._resolve_single_device(target, "light", hints)
            if not entity_id:
                return None
            attributes = self._entity_attributes(entity_id)
            raw = attributes.get("brightness")
            if isinstance(raw, (int, float)):
                current = round(float(raw) / 255 * 100)
            else:
                current = 100 if self._entity_state(entity_id) == "on" else 0
            step = 20
            up = match.group(0) in ("调亮", "亮一点", "亮一些", "太暗了")
            value = max(1, min(100, current + step if up else current - step))
            logger.info('快路径命中(相对亮度): "%s" → %s %s%%', original_text, entity_id, value)
            return {
                "kind": "tool",
                "tool": "set_light_brightness",
                "args": {"entity_id": entity_id, "brightness": value},
                "summary": f"把亮度调到 {value}%",
            }
        return None

    async def _try_parse_color_temp(
        self, cleaned: str, original_text: str, hints: list[str] | None
    ) -> dict[str, Any] | None:
        """灯光色温（K 绝对值 / 暖冷相对调整）。"""
        if "色温" not in cleaned and not _COLOR_TEMP_REL.search(cleaned):
            return None

        match = _COLOR_TEMP_SET.search(cleaned)
        if match:
            kelvin = int(match.group("value"))
            if not 2000 <= kelvin <= 6500:
                return None
            target = self._strip_target_prefix(
                cleaned[: cleaned.find("色温")] if "色温" in cleaned else cleaned[: match.start()]
            )
            entity_id = await self._resolve_single_device(target, "light", hints)
            if not entity_id:
                return None
            logger.info('快路径命中(色温): "%s" → %s %sK', original_text, entity_id, kelvin)
            return {
                "kind": "device",
                "service": "turn_on",
                "entityId": entity_id,
                "serviceData": {"color_temp_kelvin": kelvin},
                "summary": f"把色温调到 {kelvin}K",
            }

        match = _COLOR_TEMP_REL.search(cleaned)
        if not match:
            return None
        target = self._strip_target_prefix(cleaned[: match.start()])
        entity_id = await self._resolve_single_device(target, "light", hints)
        if not entity_id:
            return None
        attributes = self._entity_attributes(entity_id)
        kelvin = attributes.get("color_temp_kelvin")
        if not isinstance(kelvin, (int, float)):
            mired = attributes.get("color_temp")
            kelvin = 1_000_000 / float(mired) if isinstance(mired, (int, float)) and mired else 3500
        warm = match.group(0) in ("调暖", "暖一点", "暖一些")
        value = max(2000, min(6500, int(kelvin) - 500 if warm else int(kelvin) + 500))
        logger.info('快路径命中(相对色温): "%s" → %s %sK', original_text, entity_id, value)
        return {
            "kind": "device",
            "service": "turn_on",
            "entityId": entity_id,
            "serviceData": {"color_temp_kelvin": value},
            "summary": f"把色温调到 {value}K",
        }

    async def _try_parse_cover_position(
        self, cleaned: str, original_text: str, hints: list[str] | None
    ) -> dict[str, Any] | None:
        """窗帘位置（0-100），支持「打开一半」。"""
        if not ("窗帘" in cleaned or "帘" in cleaned):
            return None

        match = _COVER_POSITION.search(cleaned)
        if match:
            position = int(match.group("value"))
        else:
            half = _COVER_HALF.search(cleaned)
            if not half:
                return None
            position = 50
            match = half
        if not 0 <= position <= 100:
            return None
        target = self._strip_target_prefix(cleaned[: match.start()])
        entity_id = await self._resolve_single_device(target, "cover", hints)
        if not entity_id:
            return None
        logger.info('快路径命中(窗帘位置): "%s" → %s %s%%', original_text, entity_id, position)
        return {
            "kind": "tool",
            "tool": "set_cover_position",
            "args": {"entity_id": entity_id, "position": position},
            "summary": f"把窗帘调到 {position}%",
        }

    async def _try_parse_media(
        self, cleaned: str, original_text: str, hints: list[str] | None
    ) -> dict[str, Any] | None:
        """媒体控制：播放 / 暂停 / 切歌 / 音量。"""
        media_words = ("电视", "音响", "音箱", "播放器", "媒体", "音乐")
        hinted_media = any(str(eid).startswith("media_player.") for eid in (hints or []))
        if not (any(word in cleaned for word in media_words) or hinted_media):
            return None

        for pattern, action in _MEDIA_ACTIONS:
            match = pattern.search(cleaned)
            if not match:
                continue
            target = self._strip_target_prefix(cleaned[: match.start()])
            entity_id = await self._resolve_single_device(target, "media_player", hints)
            if not entity_id:
                return None
            logger.info('快路径命中(媒体): "%s" → %s %s', original_text, entity_id, action)
            return {
                "kind": "tool",
                "tool": "media_control",
                "args": {"entity_id": entity_id, "action": action},
                "summary": f"媒体 {action}",
            }

        match = _MEDIA_VOLUME_REL.search(cleaned)
        if match:
            target = self._strip_target_prefix(cleaned[: match.start()])
            entity_id = await self._resolve_single_device(target, "media_player", hints)
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

        match = _MEDIA_VOLUME.search(cleaned)
        if match:
            value = int(match.group("value"))
            if not 0 <= value <= 100:
                return None
            target = self._strip_target_prefix(cleaned[: match.start()])
            entity_id = await self._resolve_single_device(target, "media_player", hints)
            if not entity_id:
                return None
            logger.info('快路径命中(音量): "%s" → %s %s%%', original_text, entity_id, value)
            return {
                "kind": "tool",
                "tool": "media_control",
                "args": {
                    "entity_id": entity_id,
                    "action": "volume",
                    "volume": round(value / 100, 2),
                },
                "summary": f"音量调到 {value}%",
            }
        return None

    async def _try_parse_fan(
        self, cleaned: str, original_text: str, hints: list[str] | None
    ) -> dict[str, Any] | None:
        """风扇风速（百分比 / 档位 / 相对调整）。"""
        if "风扇" not in cleaned and "风速" not in cleaned and "风量" not in cleaned:
            return None

        match = _FAN_PERCENT.search(cleaned) or _FAN_LEVEL.search(cleaned)
        if match:
            if match.re is _FAN_LEVEL:
                level = match.group("level")
                value = (_CN_DIGITS.get(level) or int(level)) * 20
            else:
                value = int(match.group("value"))
            if not 1 <= value <= 100:
                return None
            target = self._strip_target_prefix(cleaned[: match.start()])
            entity_id = await self._resolve_single_device(target, "fan", hints)
            if not entity_id:
                return None
            logger.info('快路径命中(风速): "%s" → %s %s%%', original_text, entity_id, value)
            return {
                "kind": "device",
                "service": "set_percentage",
                "entityId": entity_id,
                "serviceData": {"percentage": value},
                "summary": f"把风速调到 {value}%",
            }

        match = _FAN_REL.search(cleaned)
        if not match:
            return None
        target = self._strip_target_prefix(cleaned[: match.start()])
        entity_id = await self._resolve_single_device(target, "fan", hints)
        if not entity_id:
            return None
        raw = self._entity_attributes(entity_id).get("percentage")
        current = int(raw) if isinstance(raw, (int, float)) else (50 if self._entity_state(entity_id) == "on" else 0)
        up = "大" in match.group(0)
        value = max(1, min(100, current + (20 if up else -20)))
        logger.info('快路径命中(相对风速): "%s" → %s %s%%', original_text, entity_id, value)
        return {
            "kind": "device",
            "service": "set_percentage",
            "entityId": entity_id,
            "serviceData": {"percentage": value},
            "summary": f"把风速调到 {value}%",
        }

    async def _try_parse_climate_mode(
        self, cleaned: str, original_text: str, hints: list[str] | None
    ) -> dict[str, Any] | None:
        """空调模式：制冷 / 制热 / 除湿 / 送风 / 自动。"""
        climate_keywords = ("空调", "冷气", "暖气", "hvac")
        if not any(word in cleaned for word in climate_keywords):
            return None
        for pattern, mode in _CLIMATE_MODES:
            match = pattern.search(cleaned)
            if not match:
                continue
            # 模式词必须落在句尾（允许「制冷模式」），避免「自动打开…」被误判
            tail = cleaned[match.end() :].strip()
            if tail not in ("", "模式"):
                continue
            target = self._strip_target_prefix(cleaned[: match.start()])
            target = target.replace("空调", "").replace("的", "").strip()
            entity_id = await self._resolve_single_device(target, "climate", hints)
            if not entity_id:
                return None
            logger.info('快路径命中(空调模式): "%s" → %s %s', original_text, entity_id, mode)
            return {
                "kind": "device",
                "service": "set_hvac_mode",
                "entityId": entity_id,
                "serviceData": {"hvac_mode": mode},
                "summary": f"切换到 {mode} 模式",
            }
        return None

    async def _try_parse_relative_temperature(
        self, cleaned: str, original_text: str, hints: list[str] | None
    ) -> dict[str, Any] | None:
        """温度相对调整：「调高两度 / 低一点」。"""
        match = _TEMP_REL.search(cleaned)
        if not match:
            return None
        if "音量" in cleaned:
            return None
        if not ("空调" in cleaned or "温度" in cleaned or "冷气" in cleaned or "暖气" in cleaned):
            return None
        target = self._strip_target_prefix(cleaned[: match.start()])
        target = target.replace("空调", "").replace("温度", "").strip()
        entity_id = await self._resolve_single_device(target, "climate", hints)
        if not entity_id:
            return None
        attributes = self._entity_attributes(entity_id)
        current = attributes.get("temperature")
        if not isinstance(current, (int, float)):
            return None
        raw_delta = match.group("delta")
        delta = _CN_DIGITS.get(raw_delta or "", 0) or (int(raw_delta) if raw_delta and raw_delta.isdigit() else 1)
        up = match.group(1) in ("调高", "升高", "高一点", "高一些")
        value = max(10, min(35, round(float(current) + (delta if up else -delta))))
        logger.info('快路径命中(相对温度): "%s" → %s %s°C', original_text, entity_id, value)
        return {
            "kind": "device",
            "service": "set_temperature",
            "entityId": entity_id,
            "serviceData": {"temperature": value},
            "summary": f"温度调到 {value}°C",
        }

    def _parse_pronoun_control(
        self, target: str, is_on: bool, hints: list[str] | None
    ) -> dict[str, Any] | None:
        """「把它关掉」：用最近一次控制目标解析指代（仅唯一目标时命中）。"""
        cleaned = target.strip().strip("的").strip()
        if cleaned not in _PRONOUN_TARGETS:
            return None
        candidates = [str(eid) for eid in (hints or []) if str(eid).strip()]
        if len(candidates) != 1:
            return None
        entity_id = candidates[0]
        domain_keyword = self._domain_keyword_for(get_entity_domain(entity_id))
        if domain_keyword is None:
            return None
        return {
            "kind": "device",
            "service": domain_keyword.service_on if is_on else domain_keyword.service_off,
            "entityId": entity_id,
        }

    def _parse_on_off_rest(self, cleaned: str) -> tuple[bool, str] | None:
        """开 / 关动作判定：优先匹配动作后缀，再匹配前缀；无法判定时返回 None。"""
        on_end = self._L.turn_on_end.search(cleaned)
        off_end = self._L.turn_off_end.search(cleaned)
        if on_end:
            return True, cleaned[: cleaned.rindex(on_end.group(0))].strip()
        if off_end:
            return False, cleaned[: cleaned.rindex(off_end.group(0))].strip()
        if self._L.turn_on_start.search(cleaned):
            return True, self._L.turn_on_start.sub("", cleaned, count=1)
        if self._L.turn_off_start.search(cleaned):
            return False, self._L.turn_off_start.sub("", cleaned, count=1)
        return None

    async def _resolve_control_without_room(
        self,
        *,
        original_text: str,
        rest: str,
        target: str,
        service: str,
        domain: str,
        explicit_all: bool,
    ) -> dict[str, Any] | None:
        """房间未匹配时：全屋兜底或全局精确设备名。"""
        if explicit_all or self._L.whole_home.search(rest):
            logger.info(
                '快路径命中(全屋fallback): "%s" → 全屋/%s/%s', original_text, domain, service
            )
            return {"kind": "room", "service": service, "roomName": "全屋", "domain": domain}
        if len(target) >= 3:
            global_exact = await self._find_device_globally(target, domain)
            if global_exact:
                logger.info(
                    '快路径命中(全局设备): "%s" → %s/%s', original_text, global_exact, service
                )
                return {"kind": "device", "service": service, "entityId": global_exact}
        return None

    async def _resolve_control_in_room(
        self,
        *,
        original_text: str,
        room: dict[str, str],
        target: str,
        service: str,
        domain: str,
        explicit_all: bool,
    ) -> dict[str, Any] | None:
        """房间内查找该域设备；非「所有」时优先精确匹配设备名。"""
        devices = await self._get_room_devices(room["id"], domain)
        if not devices:
            return None

        if not explicit_all:
            exact_hits = [
                device for device in devices if device["name"] and device["name"] == target
            ]
            if len(exact_hits) == 1:
                logger.info(
                    '快路径命中(精确设备): "%s" → %s/%s',
                    original_text,
                    exact_hits[0]["name"],
                    service,
                )
                return {
                    "kind": "device",
                    "service": service,
                    "entityId": exact_hits[0]["entityId"],
                }
            if len(exact_hits) > 1:
                return None

        # 兜底：整房间该域设备批量控制
        logger.info(
            '快路径命中(整房间): "%s" → %s/%s/%s',
            original_text,
            room["name"],
            domain,
            service,
        )
        return {
            "kind": "room",
            "service": service,
            "roomName": room["name"],
            "domain": domain,
        }

    async def _try_parse_device_control(
        self, cleaned: str, original_text: str, hints: list[str] | None = None
    ) -> dict[str, Any] | None:
        """开 / 关类指令：房间 / 全屋 / 全局设备匹配。"""
        parsed = self._parse_on_off_rest(cleaned)
        if parsed is None:
            return None
        is_on, rest = parsed

        # 去掉"把"字宾语标记
        if self._L.object_marker and rest.startswith(self._L.object_marker):
            rest = rest[len(self._L.object_marker) :].strip()

        explicit_all = bool(self._L.all_keywords.search(rest))
        # 复合指令（含"和/然后"等连词）或第二动作交给 LLM，避免误判
        if self._L.conjunctions.search(rest):
            return None
        if self._L.second_action.search(rest):
            return None

        # 指代消解：「把它关掉」按最近一次控制目标还原（仅唯一目标）
        pronoun_target = self._L.strip_pattern.sub("", rest).strip()
        pronoun_hit = self._parse_pronoun_control(pronoun_target, is_on, hints)
        if pronoun_hit is not None:
            logger.info(
                '快路径命中(指代): "%s" → %s/%s',
                original_text,
                pronoun_hit["entityId"],
                pronoun_hit["service"],
            )
            return pronoun_hit

        # 按关键词匹配设备域；多域命中（"灯和空调"这种）交给 LLM
        hit_domains = [
            domain_kw
            for domain_kw in self._L.domain_keywords
            if any(kw in rest for kw in domain_kw.keywords)
        ]
        distinct = {domain_kw.domain for domain_kw in hit_domains}
        if len(distinct) == 0:
            return None
        if len(distinct) > 1:
            return None

        domain_kw = hit_domains[0]
        service = domain_kw.service_on if is_on else domain_kw.service_off
        target = self._L.strip_pattern.sub("", rest).strip()

        # 显式"所有"且无具体目标 → 全屋控制
        if explicit_all and len(target) == 0:
            logger.info(
                '快路径命中(全屋): "%s" → 全屋/%s/%s', original_text, domain_kw.domain, service
            )
            return {
                "kind": "room",
                "service": service,
                "roomName": "全屋",
                "domain": domain_kw.domain,
            }

        if len(target) < 1:
            return None

        areas = await self._get_areas()
        room = self._resolve_room(target, areas)
        if room is None:
            return await self._resolve_control_without_room(
                original_text=original_text,
                rest=rest,
                target=target,
                service=service,
                domain=domain_kw.domain,
                explicit_all=explicit_all,
            )
        return await self._resolve_control_in_room(
            original_text=original_text,
            room=room,
            target=target,
            service=service,
            domain=domain_kw.domain,
            explicit_all=explicit_all,
        )

    async def try_parse(
        self, text: str, hints: list[str] | None = None
    ) -> dict[str, Any] | None:
        """尝试用规则解析用户文本为工具调用。

        解析顺序：场景 / 脚本（白名单内）→ 设温度 / 温度相对调整 → 灯光亮度 / 色温
        → 窗帘位置 → 媒体 → 风速 → 空调模式 → 开 / 关动作 → 房间 / 全屋 / 全局设备匹配。
        ``hints`` 为最近一次控制命中的实体 ID，用于「把它关掉」这类指代消解。
        无法确定时返回 None（交由 LLM 兜底）。
        """
        cleaned = str(text or "").strip()
        # 过短 / 过长的文本不进快路径，避免误匹配
        if not cleaned or len(cleaned) < 2 or len(cleaned) > 80:
            return None
        # 去掉"帮我 / 请 / 麻烦"等礼貌前缀
        cleaned = self._L.polite_prefix.sub("", cleaned, count=1).strip()
        if not cleaned or len(cleaned) < 2:
            return None

        # 0) 场景 / 脚本：白名单内的 HA scene.* / script.* 直接触发
        scene_hit = await self._match_scene_fast_path(cleaned)
        if scene_hit:
            return scene_hit

        # 1) 设温度：提取「调到 24 度」；未命中或条件不足时继续开 / 关
        temp_match = self._L.set_temperature.search(cleaned)
        if temp_match:
            temp_hit = await self._try_parse_set_temperature(cleaned, text, temp_match)
            if temp_hit is _FAST_PATH_ABORT:
                return None
            if temp_hit is not None:
                return temp_hit  # type: ignore[return-value]

        # 2) 确定性属性控制：相对温度 / 亮度 / 色温 / 窗帘位置 / 媒体 / 风速 / 空调模式
        for parser in (
            self._try_parse_relative_temperature,
            self._try_parse_light_brightness,
            self._try_parse_color_temp,
            self._try_parse_cover_position,
            self._try_parse_media,
            self._try_parse_fan,
            self._try_parse_climate_mode,
        ):
            hit = await parser(cleaned, text, hints)
            if hit is not None:
                return hit

        # 3) 开 / 关与房间 / 设备匹配（含指代消解）
        return await self._try_parse_device_control(cleaned, text, hints)

    # 场景 / 脚本
    async def _match_scene_fast_path(self, text: str) -> dict[str, Any] | None:
        """场景 / 脚本快路径：把「执行回家模式」这类指令直接解析为 activate_scene 调用。

        安全约束（fail-closed）：候选实体必须同时满足总开关启用且实体 ID 在允许清单内。
        """
        if not looks_like_scene_intent(text):
            return None
        candidates = [
            e
            for e in self._state_store.get_all()
            if str(e.get("entity_id") or "").startswith(("scene.", "script."))
        ]
        if not candidates:
            return None

        cfg = None
        if self._agent_config is not None:
            try:
                cfg = await self._agent_config.get_scene_voice_control()
            except Exception:
                cfg = None
        if cfg is None or not cfg.enabled or not cfg.allow:
            return None
        gate = SceneVoiceControlGate(
            enabled=True,
            allow=frozenset(ident for ident in (id_.strip().lower() for id_ in cfg.allow) if ident),
        )

        allowed = [
            e
            for e in candidates
            if is_scene_voice_allowed(
                get_entity_domain(str(e.get("entity_id") or "")), str(e.get("entity_id") or ""), gate
            )
        ]
        if not allowed:
            return None

        hit = self._match_scene_by_text(allowed, text)
        if hit is None:
            return None
        entity_id = str(hit.get("entity_id") or "")
        domain = get_entity_domain(entity_id) or "scene"
        if not is_scene_voice_allowed(domain, entity_id, gate):
            return None
        logger.info('快路径命中(场景): "%s" → %s', text, entity_id)
        attributes = hit.get("attributes")
        friendly = (attributes or {}).get("friendly_name") if isinstance(attributes, dict) else None
        return {
            "kind": "scene",
            "entityId": entity_id,
            "sceneName": str(friendly if friendly is not None else entity_id),
            "domain": domain,
        }

    @staticmethod
    def _match_scene_by_text(allowed: list[dict[str, Any]], text: str) -> dict[str, Any] | None:
        """在允许清单内的场景 / 脚本中按名称匹配用户意图。

        逐级放宽：整句精确 → 词干精确 → friendly_name 后缀 → friendly_name 包含。
        """
        lower = text.lower()

        def name_of(entity: dict[str, Any]) -> str:
            attributes = entity.get("attributes")
            friendly = (attributes or {}).get("friendly_name") if isinstance(attributes, dict) else None
            return str(friendly if friendly is not None else entity.get("entity_id") or "").lower()

        # 1) 整句即场景名（如「晚安」）
        for entity in allowed:
            if name_of(entity) == lower:
                return entity

        # 2) 剥离动作词与类别后缀得到词干
        stem = SCENE_ACTION_PREFIX.sub("", lower, count=1)
        stem = SCENE_CATEGORY_SUFFIX.sub("", stem, count=1).strip()
        if len(stem) < 2:
            return None
        for entity in allowed:
            if name_of(entity) == stem:
                return entity
        for entity in allowed:
            if str(entity.get("entity_id") or "").lower() == stem:
                return entity
        for entity in allowed:
            if name_of(entity).endswith(stem):
                return entity
        for entity in allowed:
            name = name_of(entity)
            if stem.endswith(name) and len(name) >= 2:
                return entity
        for entity in allowed:
            if stem in name_of(entity):
                return entity
        return None

    # 房间 / 设备
    async def _get_areas(self) -> list[dict[str, str]]:
        """获取房间列表（带缓存）。"""
        if len(self._area_cache) == 0:
            areas = (await self._get_areas_with_entities()) or []
            self._area_cache = [{"id": a.id, "name": str(a.name or "")} for a in areas]
        return self._area_cache

    async def _get_areas_with_entities(self) -> list[Any]:
        """带实体的房间缓存（对齐 Nest：仅在为空时拉取）。"""
        if self._area_entities_cache is None:
            try:
                self._area_entities_cache = await self._area_service.find_all()
            except Exception:
                self._area_entities_cache = []
        return self._area_entities_cache

    @staticmethod
    def _resolve_room(target: str, areas: list[dict[str, str]]) -> dict[str, str] | None:
        """在房间列表中匹配目标房间。按名称长度倒序，优先匹配长名（避免"卧"误匹配"卧室"）。"""
        t = target.lower()
        for area in sorted(areas, key=lambda a: -len(a["name"])):
            name = area["name"].lower()
            if name == t or name in t:
                return area
        return None

    async def _get_room_devices(self, room_id: str, domain: str) -> list[dict[str, str]]:
        """获取某房间内指定域的设备列表（含 friendly_name）。"""
        areas = await self._get_areas_with_entities()
        full = next((a for a in areas if a.id == room_id), None)
        entities = (full.entities if full is not None else None) or []
        ids = [
            str(ae.entity_id)
            for ae in entities
            if str(ae.entity_id).startswith(f"{domain}.")
        ]
        out: list[dict[str, str]] = []
        for entity_id in ids:
            entity = self._state_store.get(entity_id)
            attributes = entity.get("attributes") if isinstance(entity, dict) else None
            friendly = (attributes or {}).get("friendly_name") if isinstance(attributes, dict) else None
            out.append({"entityId": entity_id, "name": str(friendly if friendly is not None else "")})
        return out

    async def _find_device_globally(self, name: str, domain: str) -> str | None:
        """在所有房间中按名称查找某域的设备（精确 → 包含匹配）。"""
        areas = await self._get_areas_with_entities()
        exact: list[str] = []
        fuzzy: list[str] = []
        for area in areas:
            devices = await self._get_room_devices(area.id, domain)
            for device in devices:
                if device["name"] == name:
                    exact.append(device["entityId"])
                elif device["name"] and (name in device["name"] or device["name"] in name):
                    fuzzy.append(device["entityId"])
        if len(exact) == 1:
            return exact[0]
        if len(exact) > 1:
            return None
        if len(fuzzy) == 1:
            return fuzzy[0]
        return None


__all__ = ["FastPathService", "looks_like_scene_intent"]
