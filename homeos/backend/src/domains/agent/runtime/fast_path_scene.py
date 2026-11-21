"""快路径：场景 / 脚本族。

从 ``fast_path.py`` 拆出：场景意图判定、名称匹配与白名单闸门。
安全约束（fail-closed）不变：候选实体必须同时满足总开关启用且实体 ID 在允许清单内。
"""

from __future__ import annotations

import logging
import re
from typing import Any

from ..tools.high_risk_denylist import SceneVoiceControlGate, is_scene_voice_allowed
from ....platform.core.entity.entity_domain import get_entity_domain

logger = logging.getLogger("homeos.agent.fast_path.scene")

#: 整句为「晚安」等纯口令
SCENE_WHOLE_PHRASES = re.compile(r"^(晚安|我睡了|出门了|我出门了)$")
#: 出现「模式 / 场景 / 脚本」字样
SCENE_INTENT_WORDS = re.compile(r"(模式|场景|脚本)")
#: 以执行类动词开头
SCENE_INTENT_VERBS = re.compile(r"^(执行|激活|启动|运行|触发)")
#: 动作词 + 常见场景口令词
SCENE_INTENT_PHRASES = re.compile(
    r"^(开启|打开|关闭|关掉|进入)(回家|离家|观影|睡眠|起床|会客|就餐|就寝|离开|晚安|上班|度假)"
)
#: 词干提取：剥离句首动作词
SCENE_ACTION_PREFIX = re.compile(
    r"^(执行|激活|启动|运行|触发|开启|打开|关闭|关掉|进入|run|activate|start|execute|turn on)\s*"
)
#: 词干提取：剥离句尾「场景 / 模式 / 脚本」等类别后缀
SCENE_CATEGORY_SUFFIX = re.compile(r"(场景|模式|脚本|scene|script|mode)\s*$")


def looks_like_scene_intent(text: str) -> bool:
    """判断是否像场景 / 脚本触发指令（避免对普通开关做场景匹配）。"""
    cleaned = str(text or "").strip()
    if not cleaned:
        return False
    if SCENE_WHOLE_PHRASES.match(cleaned):
        return True
    if SCENE_INTENT_VERBS.match(cleaned):
        return True
    if SCENE_INTENT_PHRASES.match(cleaned):
        return True
    return bool(SCENE_INTENT_WORDS.search(cleaned))


class SceneFastPathMixin:
    """场景 / 脚本快路径（宿主需提供 ``_state_store`` / ``_agent_config``）。"""

    _state_store: Any = None
    _agent_config: Any = None

    async def _match_scene_fast_path(self, text: str) -> dict[str, Any] | None:
        """场景 / 脚本快路径：把「执行回家模式」这类指令直接解析为 activate_scene 调用。

        安全约束（fail-closed）：候选实体必须同时满足总开关启用且实体 ID 在允许清单内。
        """
        if not looks_like_scene_intent(text):
            return None
        candidates = [
            e for e in self._state_store.get_all() if str(e.get("entity_id") or "").startswith(("scene.", "script."))
        ]
        if not candidates:
            return None

        cfg = None
        if self._agent_config is not None:
            try:
                cfg = await self._agent_config.get_scene_voice_control()
            except Exception as exc:  # 配置读取失败按全禁处理（fail-closed）
                logger.debug("读取场景语音控制配置失败，按全禁处理: %s", exc)
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
        每一级抽成独立小函数，便于单独读与单独改。
        """
        lower = text.lower()
        exact = _first_by(allowed, lambda entity: _name_of(entity) == lower)
        if exact is not None:
            return exact

        stem = _stem_of(lower)
        if stem is None:
            return None
        for probe in (
            lambda entity: _name_of(entity) == stem,
            lambda entity: str(entity.get("entity_id") or "").lower() == stem,
            lambda entity: _name_of(entity).endswith(stem),
            lambda entity: stem.endswith(_name_of(entity)) and len(_name_of(entity)) >= 2,
            lambda entity: stem in _name_of(entity),
        ):
            hit = _first_by(allowed, probe)
            if hit is not None:
                return hit
        return None


def _name_of(entity: dict[str, Any]) -> str:
    """场景实体的展示名（friendly_name 优先，回落 entity_id），小写。"""
    attributes = entity.get("attributes")
    friendly = (attributes or {}).get("friendly_name") if isinstance(attributes, dict) else None
    return str(friendly if friendly is not None else entity.get("entity_id") or "").lower()


def _stem_of(lower: str) -> str | None:
    """剥离动作词与类别后缀得到词干；过短（<2 字）视为无法匹配。"""
    stem = SCENE_ACTION_PREFIX.sub("", lower, count=1)
    stem = SCENE_CATEGORY_SUFFIX.sub("", stem, count=1).strip()
    return stem if len(stem) >= 2 else None


def _first_by(allowed: list[dict[str, Any]], predicate: Any) -> dict[str, Any] | None:
    return next((entity for entity in allowed if predicate(entity)), None)


__all__ = ["SCENE_CATEGORY_SUFFIX", "SceneFastPathMixin", "looks_like_scene_intent"]
