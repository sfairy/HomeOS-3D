"""画像相关的快路径解析：别名 / kind 收窄、调温候选消歧、房间默认目标。

从 ``fast_path`` 拆出：主链路越来越大（文件规模棘轮 800 行），而这一族的方法只依赖
「房间 + 实体快照 + 画像」三样东西，可以独立验证。
"""

from __future__ import annotations

import asyncio
import logging
import math
import re
from typing import Any

logger = logging.getLogger("homeos.agent.fast_path.profile")


def _normalize_target(value: str) -> str:
    """设备名 / 别名比较口径：小写并去掉空白、下划线、连字符。"""
    return re.sub(r"[\s_-]+", "", str(value or "").lower())


def _name_hit(name: str, text: str) -> bool:
    """设备名是否与描述互相包含（归一后比较；短名不参与避免误判）。"""
    needle = _normalize_target(text)
    target = _normalize_target(name)
    if len(target) < 2 or len(needle) < 2:
        return False
    return target in needle or needle in target


def _as_number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):  # fmt: skip
        logger.debug("温度属性不是数字: %r", value)
        return None
    return number if math.isfinite(number) else None


def _temperature_in_range(attributes: dict[str, Any], value: int) -> bool:
    """温度是否落在实体的 min_temp / max_temp 内；属性缺失时 fail-open。"""
    minimum = _as_number(attributes.get("min_temp"))
    maximum = _as_number(attributes.get("max_temp"))
    if minimum is not None and value < minimum:
        return False
    return not (maximum is not None and value > maximum)


class ProfileFastPathMixin:
    """宿主需提供房间 / 实体查询与画像、状态库。"""

    _device_profiles: Any = None
    _state_store: Any = None
    _get_areas: Any = None
    _get_areas_with_entities: Any = None
    _resolve_room: Any = None
    _get_room_devices: Any = None
    _entity_attributes: Any = None
    #: 语言模板（``_L`` 由宿主提供为 property）
    _L: Any = None

    async def _room_alias_hit(self, hint: str, devices: list[dict[str, Any]]) -> bool:
        """hint 是否指向房间内某台设备 —— 别名或设备名任一命中即可。

        「客厅地暖调到 26 度」不含「空调」关键词，但「地暖」既是设备名也可能是用户教的别名，
        两种都该认为是气候意图；都不命中才交回后续解析。
        """
        if not hint:
            return False
        needle = _normalize_target(hint)
        if any(needle and needle in _normalize_target(str(device.get("name") or "")) for device in devices):
            return True
        matched = set(await self._profile_alias_targets(hint, None))
        return any(str(device.get("entityId")) in matched for device in devices)

    async def _temperature_devices(self, room: dict[str, Any] | None) -> list[dict[str, Any]]:
        """房间内（或全屋）可调温的设备：``climate`` + ``water_heater``。"""
        if room is not None:
            return [
                *await self._get_room_devices(room["id"], "climate"),
                *await self._get_room_devices(room["id"], "water_heater"),
            ]
        devices: list[dict[str, Any]] = []
        for area in await self._get_areas_with_entities():
            devices.extend(await self._get_room_devices(area.id, "climate"))
            devices.extend(await self._get_room_devices(area.id, "water_heater"))
        return devices

    def _temperature_keywords(self) -> list[str]:
        """可用于「调温度」的设备关键词（空调 + 热水器）。"""
        words: list[str] = []
        for domain in ("climate", "water_heater"):
            keyword = next((item for item in self._L.domain_keywords if item.domain == domain), None)
            if keyword is not None:
                words.extend(str(item) for item in keyword.keywords)
        return words

    async def _profile_alias_targets(
        self, description: str, domain: str | None = None, kinds: tuple[str, ...] | None = None
    ) -> list[str]:
        """命中「已确认画像别名」的实体 ID 列表（去重保序）。"""
        if self._device_profiles is None or not str(description or "").strip():
            return []
        try:
            hits = await asyncio.to_thread(self._device_profiles.match_aliases, description, domain, kinds)
        except Exception as exc:
            logger.debug("读取设备画像别名失败: %s", exc)
            return []
        return list(dict.fromkeys(str(item) for item in (hits or [])))

    async def _profile_alias_target(
        self, description: str, domain: str, kinds: tuple[str, ...] | None = None
    ) -> str | None:
        """按别名解析唯一目标；多台命中时返回 None，交给房间 / 名称匹配消歧。"""
        unique = await self._profile_alias_targets(description, domain, kinds)
        return unique[0] if len(unique) == 1 else None

    def _climate_hint(self, before: str, room: dict[str, Any] | None, keywords: Any) -> str:
        """从「客厅空调」里剥掉房间名与领域关键词，得到用于别名匹配的修饰词。"""
        hint = str(before or "").strip()
        marker = self._L.object_marker
        if marker and hint.startswith(marker):
            hint = hint[len(marker) :].strip()
        room_name = str((room or {}).get("name") or "").strip()
        if room_name:
            hint = hint.replace(room_name, "")
        for keyword in keywords or ():
            if str(keyword).lower() in hint.lower():
                hint = re.sub(re.escape(str(keyword)), "", hint, flags=re.IGNORECASE)
        return self._L.strip_pattern.sub("", hint).strip()

    async def _narrow_climate_devices(
        self, devices: list[dict[str, Any]], hint: str, temperature: int, before: str = ""
    ) -> list[dict[str, Any]]:
        """多台可调温设备消歧：画像别名 → 设备名 → 温度是否落在 min/max 内。

        ``hint`` 是剥掉房间 / 关键词后的修饰词；它为空时（「客厅空调」整句就是设备名）
        再用整段描述比设备名，否则两台空调都会被当成候选。
        """
        target = hint or before
        if target:
            alias_ids = set(await self._profile_alias_targets(target, None))
            named = [device for device in devices if device["entityId"] in alias_ids] or [
                device for device in devices if _name_hit(device["name"], target)
            ]
            if named:
                devices = named
        if len(devices) <= 1:
            return devices
        in_range = [
            device
            for device in devices
            if _temperature_in_range(self._entity_attributes(device["entityId"]), temperature)
        ]
        return in_range or devices

    async def _profile_filtered(self, devices: Any, kinds: tuple[str, ...] | None) -> list[dict[str, Any]]:
        """按设备画像的 kind / 可用性收窄候选。

        只有「完全没有画像」时才 fail-open 回退原列表；一旦有画像但都不自动可用
        （类型未确认 / 离线），就返回空列表，让调用方反问，而不是靠名字瞎选一台。
        """
        items = await devices if asyncio.iscoroutine(devices) else devices
        rows = [item for item in (items or []) if isinstance(item, dict)]
        if not kinds or self._device_profiles is None:
            return rows
        try:
            profiles = await asyncio.to_thread(self._device_profiles.list)
        except Exception as exc:
            logger.debug("读取设备画像失败，按全部候选处理: %s", exc)
            return rows
        by_entity = {
            str(item.get("entityId")): (str(item.get("kind") or ""), bool(item.get("usable")))
            for item in (profiles or [])
            if isinstance(item, dict)
        }
        if not any(str(item.get("entityId")) in by_entity for item in rows):
            # 完全没有画像（新装机）：保持原候选，让名称 / 房间匹配正常工作。
            return rows
        narrowed = [item for item in rows if by_entity.get(str(item.get("entityId")), ("", False))[0] in kinds]
        usable = [item for item in narrowed if by_entity.get(str(item.get("entityId")), ("", False))[1]]
        # 有画像但都不可用 / 类型未确认：**不再**退回全部候选 —— 那正是画像要拦住的误控
        # （房间两台空调都没确认时，靠名字瞎选一台比反问更糟）。空列表让调用方走歧义/反问。
        return usable
