"""快路径解析服务（免 LLM 直接控制）。"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any

from .area_service import AgentAreaService
from .config_service import AgentConfigService
from .fast_path_attributes import AttributeFastPathMixin
from .fast_path_media import MediaFastPathMixin
from .fast_path_profile import ProfileFastPathMixin
from .fast_path_scene import SceneFastPathMixin, looks_like_scene_intent
from .lang_template_service import LangTemplateService
from ....platform.core.entity.entity_domain import get_entity_domain
from ....platform.core.runtime.config_events import CONFIG_UPDATED

logger = logging.getLogger("homeos.agent.fast_path")

_AREA_CACHE_INVALIDATION_EVENTS = (
    CONFIG_UPDATED,
    "area.updated",
    "ha.entity_registry_updated",
    "ha.device_registry_updated",
    "ha.area_registry_updated",
)

#: 房间 / 实体缓存 TTL（秒）：事件丢失时（老版本后端不发事件、事件总线异常）
#: 也必须保证新增房间 / 实体在 60s 内对语音快路径可见。
_AREA_CACHE_TTL_SECONDS = 60.0

#: 设温度分支内显式中止（如多空调消歧），与「未命中、继续开 / 关」区分。
_FAST_PATH_ABORT = object()

#: 中文数字 → 阿拉伯数字（只覆盖常见调整幅度）
_CN_DIGITS = {"一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5}
#: 指代词：「把它关掉 / 打开它 / 调亮它」
_PRONOUN_TARGETS = frozenset({"它", "他", "她", "这个", "那个", "它们", "这些", "那些"})


class FastPathService(SceneFastPathMixin, MediaFastPathMixin, AttributeFastPathMixin, ProfileFastPathMixin):
    """快路径服务：订阅配置 / 实体注册表变更事件以清空房间缓存。

    三个族拆到独立 mixin：场景 / 脚本、媒体（动作 / 点歌 / 电视应用）、
    确定性属性（亮度 / 色温 / 窗帘 / 风速 / 空调模式 / 相对温度）。
    本模块只保留「设温度 + 开关与房间匹配」的主链路与房间缓存。
    """

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
        #: 缓存代际号：失效时 +1，避免失效前发出的查询在返回时把旧结果写回缓存
        self._area_cache_generation = 0
        #: 缓存写入时刻（monotonic），超过 TTL 视为过期
        self._area_cache_loaded_at = 0.0
        self._area_entities_cache_loaded_at = 0.0
        #: 设备画像（Apple TV / 电视 / 音箱）；未注入时电视应用类指令不解析
        self._device_profiles: Any = None
        #: 学习体系（房间默认设备）；未注入时不做默认目标消歧
        self._learning: Any = None

    def bind_learning(self, learning: Any = None) -> None:
        """注入学习体系：房间内多台同域设备时按学到的默认目标解析。"""
        self._learning = learning

    def bind_device_profiles(self, device_profiles: Any = None) -> None:
        """注入设备画像：用于「打开电视上的 Netflix」这类应用指令选目标。"""
        self._device_profiles = device_profiles

    def invalidate_area_cache(self) -> None:
        """房间 / 实体缓存失效：清空两份缓存并推进代际号。"""
        self._area_cache_generation += 1
        self._area_cache = []
        self._area_entities_cache = None
        self._area_cache_loaded_at = 0.0
        self._area_entities_cache_loaded_at = 0.0

    def bind_events(self) -> None:
        """模块初始化：订阅配置 / 实体注册表更新事件，清空房间缓存。"""

        def clear_area_cache(_payload: Any = None) -> None:
            # 修复：此前只清 ``_area_cache``，带实体的 ``_area_entities_cache``
            # 一直留着旧房间，新增「书房灯」后语音指令始终找不到设备。
            self.invalidate_area_cache()

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
        # 上限放到 80：热水器的目标温度常见 40–70，旧口径 10–35 会把它整条拒掉。
        if len(before) < 2 or not 5 <= temperature_celsius <= 80:
            return None
        candidates = await self._climate_candidates(before, temperature_celsius)
        if candidates is None:
            return None
        if len(candidates) > 1:
            logger.info('快路径跳过(多空调消歧): "%s" → %s 台', original_text, len(candidates))
            return _FAST_PATH_ABORT
        if not candidates:
            return None
        entity_id = candidates[0]["entityId"]
        logger.info('快路径命中(set_temp): "%s" → %s  %s°C', original_text, entity_id, temperature_celsius)
        return {
            "kind": "device",
            "service": "set_temperature",
            "entityId": entity_id,
            "serviceData": {"temperature": temperature_celsius},
        }

    def _climate_keyword(self) -> Any | None:
        """语言模板里的 climate 关键词（含开 / 关服务映射）。"""
        return next((item for item in self._L.domain_keywords if item.domain == "climate"), None)

    async def _climate_candidates(self, before: str, temperature: int) -> list[dict[str, Any]] | None:
        """取本次设温度的候选空调 / 热水器；不构成温控意图时返回 ``None``。

        说「空调 / 热水器」关键词、说中设备名或已确认画像的别名（如「冷气」）都算意图；
        提到的设备再按别名 / 设备名 / 温度范围消歧。没有房间限定时在全屋范围内找。
        """
        keywords = self._temperature_keywords()
        if not keywords:
            return None
        room = self._resolve_room(before, await self._get_areas())
        devices = await self._temperature_devices(room)
        if not devices:
            return None
        hint = self._climate_hint(before, room, keywords)
        has_keyword = any(word in before for word in keywords)
        if not has_keyword and not await self._room_alias_hit(hint, devices):
            return None
        if len(devices) > 1:
            devices = await self._narrow_climate_devices(devices, hint, temperature, before)
        return devices

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
        kinds: tuple[str, ...] | None = None,
    ) -> str | None:
        """在「房间 → 房间内设备 → 全局设备 → 指代提示」之间解析唯一目标。

        ``kinds`` 是设备画像的允许类型（如电视 → ``tv`` / ``apple_tv``）：
        给了就用画像收窄候选，避免「打开电视」在同时有音箱与 Apple TV 时被判成歧义。
        无法确定唯一设备时返回 None（交给 LLM 消歧），避免误控同房间多台设备。
        """
        text = str(description or "").strip()
        if text:
            # 用户提到房间时别名只在房间内生效，避免「卧室冷气」命中客厅的同名设备。
            room = self._resolve_room(text, await self._get_areas())
            resolved = await self._resolve_described_device(text, domain, kinds, room)
            if resolved is not None:
                return resolved
        hinted = [eid for eid in (hints or []) if str(eid).startswith(f"{domain}.")]
        if len(hinted) == 1:
            return hinted[0]
        if text:
            return None
        # 描述为空时允许「全屋唯一设备」兜底（如只有一台空调 / 一个窗帘）
        return await self._resolve_sole_device(domain)

    async def _resolve_described_device(
        self, text: str, domain: str, kinds: tuple[str, ...] | None, room: dict[str, Any] | None
    ) -> str | None:
        """有目标描述时：房间内别名 / 名称 → 全屋别名 / 名称。"""
        if room is None:
            alias_id = await self._profile_alias_target(text, domain, kinds)
            return alias_id or await self._find_device_globally(text, domain)
        devices = await self._profile_filtered(self._get_room_devices(room["id"], domain), kinds)
        if not devices:
            return None
        alias_id = await self._profile_alias_target(text, domain, kinds)
        if alias_id and any(device["entityId"] == alias_id for device in devices):
            return alias_id
        exact = [device for device in devices if device["name"] and device["name"] in text]
        if len(exact) == 1:
            return exact[0]["entityId"]
        if len(exact) > 1:
            ids = {device["entityId"] for device in exact}
            exact.sort(key=lambda device: -len(device["name"]))
            return exact[0]["entityId"] if len(ids) == 1 else None
        if len(devices) == 1:
            return devices[0]["entityId"]
        # 「客厅默认开这台空调」这类教学结果：房间内多台同域设备时按学到的默认目标命中。
        # 以前只在 teach_area_default 里写入、从未被读取，用户教了也不生效。
        return await self._area_default_target(str(room["id"]), domain, devices)

    async def _area_default_target(
        self,
        area_id: str,
        domain: str,
        devices: list[dict[str, Any]],
    ) -> str | None:
        """房间内多台同域设备时的默认目标；不在候选里则视为没设过。

        先查设备画像的房间默认（电视 / Apple TV 由面板与 `teach_area_default` 共同写入），
        再退回学习表的通用默认（灯 / 窗帘等其它域）。
        """
        if not area_id:
            return None
        target = await self._profile_default_target(area_id, devices)
        if target:
            return target
        learning = self._learning
        if learning is None:
            return None
        try:
            entity_id = await asyncio.to_thread(learning.resolve_area_default, area_id, domain)
        except Exception as exc:  # 学习表读取失败退回「交给 LLM」
            logger.debug("读取房间默认设备失败: %s (%s)", area_id, exc)
            return None
        target = str(entity_id or "").strip()
        if not target:
            return None
        return target if any(device["entityId"] == target for device in devices) else None

    async def _profile_default_target(self, area_id: str, devices: list[dict[str, Any]]) -> str | None:
        """设备画像里的房间默认实体（``speaker`` 走 MA 播放器 id，不参与实体匹配）。"""
        profiles = self._device_profiles
        lister = getattr(profiles, "defaults", None)
        if not callable(lister):
            return None
        rows: Any = []
        try:
            rows = await asyncio.to_thread(lister, area_id)
        except Exception as exc:
            logger.debug("读取画像默认设备失败: %s", exc)
            return None
        ids = {str(row.get("entityId")) for row in (rows or []) if isinstance(row, dict) and row.get("entityId")}
        matched = [device for device in devices if device["entityId"] in ids]
        return matched[0]["entityId"] if len(matched) == 1 else None

    async def _resolve_sole_device(self, domain: str) -> str | None:
        """描述为空：全屋恰好一台该域设备时才兜底（避免「开灯」误开乱灯）。"""
        all_devices: list[dict[str, str]] = []
        for area in await self._get_areas_with_entities():
            all_devices.extend(await self._get_room_devices(area.id, domain))
        return all_devices[0]["entityId"] if len(all_devices) == 1 else None

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

    def _parse_pronoun_control(self, target: str, is_on: bool, hints: list[str] | None) -> dict[str, Any] | None:
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
            logger.info('快路径命中(全屋fallback): "%s" → 全屋/%s/%s', original_text, domain, service)
            return {"kind": "room", "service": service, "roomName": "全屋", "domain": domain}
        if len(target) >= 3:
            global_exact = await self._find_device_globally(target, domain)
            if global_exact:
                logger.info('快路径命中(全局设备): "%s" → %s/%s', original_text, global_exact, service)
                return {"kind": "device", "service": service, "entityId": global_exact}
        return None

    #: 「一盏灯」语义：无房间不命中，房间内恰好 1 盏可用灯才下发
    _SINGLE_LIGHT_RE = re.compile(r"一[盏盞][灯燈]")

    @classmethod
    def _requests_single_light(cls, text: str) -> bool:
        return bool(cls._SINGLE_LIGHT_RE.search(str(text or "")))

    async def _resolve_single_light(
        self,
        *,
        original_text: str,
        target: str,
        service: str,
        explicit_all: bool,
        is_on: bool,
    ) -> dict[str, Any] | None:
        """「开一盏灯」：点了房间才处理，房间内可用灯恰好 1 盏才下发。

        没有房间 → 返回 ``None`` 交给 LLM（多房间无从判断）；
        「所有灯」与「一盏灯」语义冲突 → 同样交给 LLM；
        房间内多于 1 盏 → 返回 ``ambiguous`` + 候选，绝不静默全开。
        """
        if explicit_all:
            return None
        stripped = self._SINGLE_LIGHT_RE.sub("", target).strip()
        areas = await self._get_areas()
        room = self._resolve_room(stripped, areas) if stripped else None
        if room is None:
            return None
        devices = await self._get_room_devices(room["id"], "light")
        available = [device for device in devices if self._is_available_device(device)]
        if len(available) == 1:
            logger.info('快路径命中(单盏灯): "%s" → %s/%s', original_text, available[0]["name"], service)
            return {"kind": "device", "service": service, "entityId": available[0]["entityId"]}
        names = [device["name"] for device in available[:5]]
        logger.info('快路径跳过(单盏灯歧义): "%s" → %s 盏', original_text, len(available))
        return {
            "kind": "ambiguous",
            "reason": "single_light_ambiguous",
            "roomName": room["name"],
            "action": "on" if is_on else "off",
            "candidates": names,
        }

    def _is_available_device(self, device: dict[str, Any]) -> bool:
        """实体是否可用（state 非空且非 unavailable/unknown）。"""
        state = self._entity_state(device.get("entityId"))
        return bool(state) and state not in ("unavailable", "unknown")

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
            exact_hits = [device for device in devices if device["name"] and device["name"] == target]
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
        pronoun_hit = self._pronoun_control_hit(rest, is_on, hints, original_text)
        if pronoun_hit is not None:
            return pronoun_hit

        # 按关键词匹配设备域；多域命中（"灯和空调"这种）交给 LLM
        hit_domains = [
            domain_kw for domain_kw in self._L.domain_keywords if any(kw in rest for kw in domain_kw.keywords)
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
        whole_house = self._whole_house_control(explicit_all, target, service, domain_kw.domain, original_text)
        if whole_house is not None:
            return whole_house

        if len(target) < 1:
            return None

        return await self._resolve_domain_target(
            original_text=original_text,
            rest=rest,
            target=target,
            service=service,
            domain=domain_kw.domain,
            explicit_all=explicit_all,
            is_on=is_on,
        )

    async def _resolve_domain_target(
        self,
        *,
        original_text: str,
        rest: str,
        target: str,
        service: str,
        domain: str,
        explicit_all: bool,
        is_on: bool,
    ) -> dict[str, Any] | None:
        """按域定位目标：单盏灯语义 → 房间内 → 全屋 / 全局设备。"""
        # 「开一盏灯」：必须点明房间，且房间内恰好 1 盏可用灯才下发；
        # 无房间直接交给 LLM（多房间无从判断），房间内多盏时返回候选而不是全开。
        if domain == "light" and self._requests_single_light(target):
            return await self._resolve_single_light(
                original_text=original_text,
                target=target,
                service=service,
                explicit_all=explicit_all,
                is_on=is_on,
            )

        areas = await self._get_areas()
        room = self._resolve_room(target, areas)
        if room is None:
            return await self._resolve_control_without_room(
                original_text=original_text,
                rest=rest,
                target=target,
                service=service,
                domain=domain,
                explicit_all=explicit_all,
            )
        return await self._resolve_control_in_room(
            original_text=original_text,
            room=room,
            target=target,
            service=service,
            domain=domain,
            explicit_all=explicit_all,
        )

    @staticmethod
    def _whole_house_control(
        explicit_all: bool,
        target: str,
        service: str,
        domain: str,
        original_text: str,
    ) -> dict[str, Any] | None:
        """「把灯全关了」这种无具体目标的全屋指令；有目标时返回 ``None`` 继续解析。"""
        if not explicit_all or target:
            return None
        logger.info('快路径命中(全屋): "%s" → 全屋/%s/%s', original_text, domain, service)
        return {"kind": "room", "service": service, "roomName": "全屋", "domain": domain}

    def _pronoun_control_hit(
        self, rest: str, is_on: bool, hints: list[str] | None, original_text: str
    ) -> dict[str, Any] | None:
        """指代消解结果与命中日志（「把它关掉」只看最近一次控制目标）。"""
        pronoun_target = self._L.strip_pattern.sub("", rest).strip()
        hit = self._parse_pronoun_control(pronoun_target, is_on, hints)
        if hit is None:
            return None
        logger.info(
            '快路径命中(指代): "%s" → %s/%s',
            original_text,
            hit["entityId"],
            hit["service"],
        )
        return hit

    async def _try_parse_attribute_control(
        self, cleaned: str, text: str, hints: list[str] | None
    ) -> dict[str, Any] | None:
        """确定性属性控制（亮度 / 色温 / 窗帘 / 媒体 / 风速 / 模式），按固定顺序命中即返回。"""
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
        return None

    async def try_parse(self, text: str, hints: list[str] | None = None) -> dict[str, Any] | None:
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

        # 0) 场景 / 脚本 / 温度 / 点歌 / 电视应用：命中即返回
        early = await self._preparse_hit(cleaned, text, hints)
        if early is not None:
            return early

        # 2) 确定性属性控制：相对温度 / 亮度 / 色温 / 窗帘位置 / 媒体 / 风速 / 空调模式
        attribute_hit = await self._try_parse_attribute_control(cleaned, text, hints)
        if attribute_hit is not None:
            return attribute_hit

        # 3) 开 / 关与房间 / 设备匹配（含指代消解）
        return await self._try_parse_device_control(cleaned, text, hints)

    async def _preparse_hit(self, cleaned: str, text: str, hints: list[str] | None) -> dict[str, Any] | None:
        """精确匹配族：场景 / 脚本、设温度、点歌、电视应用（顺序即优先级）。"""
        scene_hit = await self._match_scene_fast_path(cleaned)
        if scene_hit:
            return scene_hit
        temp_hit = await self._try_parse_temperature(cleaned, text)
        if temp_hit is not None:
            return temp_hit
        music_hit = await self._try_parse_music_request(cleaned)
        if music_hit is not None:
            return music_hit
        return await self._try_parse_tv_app(cleaned, hints)

    async def _try_parse_temperature(self, cleaned: str, text: str) -> dict[str, Any] | None:
        """设温度：「调到 24 度」；无匹配或条件不足（多台空调）时返回 ``None`` 继续后续解析。"""
        temp_match = self._L.set_temperature.search(cleaned)
        if not temp_match:
            return None
        temp_hit = await self._try_parse_set_temperature(cleaned, text, temp_match)
        if temp_hit is _FAST_PATH_ABORT:
            return None
        return temp_hit  # pyright: ignore[reportReturnType]

    # 场景 / 脚本
    async def _get_areas(self) -> list[dict[str, str]]:
        """获取房间列表（带缓存 + TTL）。"""
        if len(self._area_cache) == 0 or self._area_cache_expired(self._area_cache_loaded_at):
            generation = self._area_cache_generation
            areas = (await self._get_areas_with_entities()) or []
            # 失效发生在查询途中时不写回，避免旧结果覆盖新缓存
            if generation == self._area_cache_generation:
                self._area_cache = [{"id": a.id, "name": str(a.name or "")} for a in areas]
                self._area_cache_loaded_at = time.monotonic()
        return self._area_cache

    async def _get_areas_with_entities(self) -> list[Any]:
        """带实体的房间缓存（事件失效 + 60s TTL 双保险）。"""
        if self._area_entities_cache is None or self._area_cache_expired(self._area_entities_cache_loaded_at):
            generation = self._area_cache_generation
            try:
                loaded = await self._area_service.find_all()
            except Exception:
                loaded = []
            if generation != self._area_cache_generation:
                # 期间收到注册表变更事件：本次结果可能已过期，只返回不写缓存
                return loaded
            self._area_entities_cache = loaded
            self._area_entities_cache_loaded_at = time.monotonic()
        return self._area_entities_cache

    @staticmethod
    def _area_cache_expired(loaded_at: float) -> bool:
        return loaded_at <= 0.0 or (time.monotonic() - loaded_at) >= _AREA_CACHE_TTL_SECONDS

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
        ids = [str(ae.entity_id) for ae in entities if str(ae.entity_id).startswith(f"{domain}.")]
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
