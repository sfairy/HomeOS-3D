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
        self, cleaned: str, original_text: str
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

    async def try_parse(self, text: str) -> dict[str, Any] | None:
        """尝试用规则解析用户文本为工具调用。

        解析顺序：场景 / 脚本（白名单内）→ 设温度（空调）→ 开/关动作 → 房间 / 全屋 / 全局设备匹配。
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

        # 2–6) 开 / 关与房间 / 设备匹配
        return await self._try_parse_device_control(cleaned, text)

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
