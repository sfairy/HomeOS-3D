"""家庭环境上下文：把「现在几点 / 天气如何 / 何时日落」注入系统提示。

对齐 Nest ``getHomeEnvironmentContext()``。模型不能读时钟，缺少这段上下文时
「半小时后关灯」「天黑了再开窗帘」这类相对时间指令只能靠猜；天气 / 太阳实体
缺失时安静降级，绝不因为某个实体不存在就让整轮对话失败。
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from ....platform.core.json_field import object_field

logger = logging.getLogger("homeos.agent.env_context")

#: 星期名（中文 / 英文）
_WEEKDAYS_ZH = ("周一", "周二", "周三", "周四", "周五", "周六", "周日")
_WEEKDAYS_EN = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def _zone(timezone_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(str(timezone_name or "").strip() or "UTC")
    except ZoneInfoNotFoundError, ValueError:
        logger.debug("家庭时区不可用，回退 UTC: %s", timezone_name)
        return ZoneInfo("UTC")


def _fmt_time(raw: Any) -> str:
    """把 HA 的 ISO 时间压成 ``HH:MM``；非法值原样返回空串。"""
    text = str(raw or "").strip()
    if not text:
        return ""
    try:
        moment = datetime.fromisoformat(text)
    except ValueError:
        logger.debug("天气 / 太阳时间格式非法: %s", text)
        return ""
    return moment.strftime("%H:%M")


class HomeEnvironmentContextService:
    """拼装系统提示里的环境段落（纯内存读取，不做 IO）。"""

    def __init__(self, state_store: Any = None, app_config: Any = None) -> None:
        self._state_store = state_store
        self._app_config = app_config

    def timezone_name(self) -> str:
        """家庭时区（``ops.homeTimezone``）；配置不可用时交由调用方决定。"""
        try:
            ops = self._app_config.get("ops") if self._app_config is not None else None
            return str((ops or {}).get("homeTimezone") or "").strip()
        except Exception as exc:
            logger.debug("读取家庭时区失败: %s", exc)
            return ""

    def _find_first(self, domain: str) -> dict[str, Any] | None:
        if self._state_store is None:
            return None
        try:
            entities = self._state_store.get_all()
        except Exception as exc:
            logger.debug("读取实体列表失败: %s", exc)
            return None
        for entity in entities or []:
            if not isinstance(entity, dict):
                continue
            entity_id = str(entity.get("entity_id") or "")
            if entity_id.startswith(f"{domain}."):
                return entity
        return None

    def _weather(self) -> tuple[str, str]:
        entity = self._find_first("weather")
        if entity is None:
            return "", ""
        attrs = object_field(entity, "attributes")
        temperature = attrs.get("temperature")
        state = str(entity.get("state") or "").strip()
        temp_text = ""
        if isinstance(temperature, (int, float)) and not isinstance(temperature, bool):
            temp_text = f"{round(float(temperature))}°C"
        return state, temp_text

    def _sun(self) -> tuple[str, str]:
        entity = self._find_first("sun")
        attrs = object_field(entity, "attributes") if entity else {}
        return _fmt_time(attrs.get("next_dawn")), _fmt_time(attrs.get("next_dusk"))

    def build(self, lang: str = "zh", now: datetime | None = None) -> str:
        """生成环境段落；无任何有效信息时返回空串。"""
        timezone_name = self.timezone_name()
        tz = _zone(timezone_name)
        moment = (now or datetime.now(tz)).astimezone(tz)
        weekday = (
            _WEEKDAYS_EN[moment.weekday()] if str(lang).lower().startswith("en") else _WEEKDAYS_ZH[moment.weekday()]
        )
        weather_state, temperature = self._weather()
        dawn, dusk = self._sun()

        if str(lang).lower().startswith("en"):
            parts = [f"Now {moment.strftime('%Y-%m-%d %H:%M')} ({weekday})"]
            if timezone_name:
                parts.append(f"timezone {timezone_name}")
            if temperature or weather_state:
                parts.append("outdoor " + " ".join(item for item in (temperature, weather_state) if item))
            if dawn and dusk:
                parts.append(f"sunrise {dawn}, sunset {dusk}")
            return "[Current environment] " + ". ".join(parts) + "."

        parts = [f"现在 {moment.strftime('%Y-%m-%d %H:%M')}（{weekday}）"]
        if timezone_name:
            parts.append(f"家庭时区 {timezone_name}")
        if temperature or weather_state:
            parts.append("室外 " + " ".join(item for item in (temperature, weather_state) if item))
        if dawn and dusk:
            parts.append(f"日出 {dawn}，日落 {dusk}")
        return "【当前环境】" + "；".join(parts) + "。"


__all__ = ["HomeEnvironmentContextService"]
