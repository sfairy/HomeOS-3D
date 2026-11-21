"""快路径：确定性属性族（亮度 / 色温 / 窗帘 / 风速 / 空调模式 / 相对温度）。

从 ``fast_path.py`` 拆出：这些解析器都只做「正则命中 → 解析目标 → 组装工具调用」，
不参与房间 / 开关匹配的主链路，因此可以独立成 mixin。
"""

from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger("homeos.agent.fast_path.attributes")

#: 中文数字 → 阿拉伯数字（只覆盖常见调整幅度）
_CN_DIGITS = {"一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5}

#: 灯光亮度绝对值：「客厅灯亮度调到 50%」
_BRIGHTNESS_SET = re.compile(
    r"^(?P<target>.*?)(?:的)?(?:亮度)?(?:调到|设为|设置|调成|调至)\s*(?P<value>\d{1,3})\s*(?:%|百分比)?$"
)
#: 灯光亮度相对调整：「调亮一点 / 太暗了」
_BRIGHTNESS_REL = re.compile(r"(调亮|亮一点|亮一些|太暗了|调暗|暗一点|暗一些|太亮了)")
#: 色温绝对值：「色温调到 4000K」
_COLOR_TEMP_SET = re.compile(r"(?:色温)?(?:调到|设为|设置|调成|调至)\s*(?P<value>\d{3,5})\s*[kK]\s*$")
#: 色温相对调整：「暖一点 / 冷一点」
_COLOR_TEMP_REL = re.compile(r"(调暖|暖一点|暖一些|调冷|冷一点|冷一些)")
#: 窗帘位置：「窗帘开到 30% / 打开一半」
_COVER_POSITION = re.compile(
    r"^(?P<target>.*?)(?:窗帘|遮光帘|卷帘|百叶窗|帘子)?"
    r"(?:开到|调到|设为|设置|调成|调至|打开到)\s*(?P<value>\d{1,3})\s*%?$"
)
#: 窗帘半开
_COVER_HALF = re.compile(r"(一半|半开)")
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


class AttributeFastPathMixin:
    """确定性属性控制（宿主需提供 ``_resolve_single_device`` / ``_entity_attributes`` 等）。"""

    _state_store: Any = None
    _strip_target_prefix: Any = None
    _resolve_single_device: Any = None
    _entity_attributes: Any = None
    _entity_state: Any = None

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

    async def _try_parse_fan(self, cleaned: str, original_text: str, hints: list[str] | None) -> dict[str, Any] | None:
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


__all__ = ["AttributeFastPathMixin"]
