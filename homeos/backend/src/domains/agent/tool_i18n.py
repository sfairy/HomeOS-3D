"""Agent 工具描述与错误文案的 zh/en 本地化。

工具 schema 的中文描述是权威来源；英文只覆盖顶层 ``description``（模型选择工具真正
依赖的字段），参数描述保留中文，避免维护两份易漂移的长文本。
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any

#: 工具名 → 英文描述（缺失时回落中文）
TOOL_DESCRIPTIONS_EN: dict[str, str] = {
    "search_entities": (
        "Search smart-home devices by name or type; returns matches with entity_id, "
        "friendly name and current state. Searches HomeOS room bindings, HA areas and "
        "favorites. Use it to find entity_id before controlling or querying a device."
    ),
    "get_entity_state": "Get the current state of one device (on/off, temperature, etc.).",
    "control_device": (
        "Control a smart-home device: lights, switches, climate, toggles. Door locks, "
        "alarms and gas valves are refused by safety policy. Use service=toggle for input_boolean."
    ),
    "list_areas": "List all rooms/areas.",
    "get_area_snapshot": (
        "Get a snapshot of all devices in one room, for questions like "
        "\"what's the temperature in the living room and are the lights on\"."
    ),
    "control_room": (
        "Batch-control devices in one room. Prefer this for whole-room intents such as "
        "\"turn on all study lights\" or \"turn off the living room lights\". Room name is enough."
    ),
    "activate_scene": (
        "Run a Home Assistant scene (scene.*) or script (script.*). Only scenes/scripts "
        "explicitly allowed in the scene voice-control allowlist may run; if blocked, tell the "
        "user to enable it in settings instead of bypassing the restriction."
    ),
    "activate_home_mode": (
        "Switch home mode (home/away/sleep/vacation) for whole-home mode changes."
    ),
    "get_home_status": (
        "Whole-home overview: active mode, entity counts, lights on, open covers/doors, "
        "lock and alarm state, average temperature/humidity, unavailable devices and today's "
        "energy. Use for \"how is the house doing\" or \"anything abnormal\"."
    ),
    "get_weather": "Get current outdoor weather (temperature and condition).",
    "get_calendar": (
        "Check calendar away periods: whether the user is away now and when the next away "
        "period starts."
    ),
    "list_scenes": (
        "List available Home Assistant scenes (ha_scenes, including scene.* / script.* with "
        "an `allowed` flag for voice execution)."
    ),
    "list_home_modes": "List home mode names. Call before switching modes if unsure.",
    "set_light_brightness": "Set light brightness (0-100). Requires entity_id.",
    "set_cover_position": "Set cover/blind position (0 closed, 100 open).",
    "media_control": "Control a media player: play / pause / stop / next / previous / volume.",
    "query_camera": "Query camera status (recording/motion). Does not return video frames.",
    "get_energy_usage": (
        "Query electricity usage: last N days total, today, this month, daily curve and "
        "top-consuming devices. Returns 0 when no meter is configured."
    ),
    "query_events": (
        "Query device state-change history (who changed what and when). Supports entity_id "
        "or domain filters; newest first."
    ),
    "get_notifications": (
        "Query the notification center: unread count plus recent notifications with level, "
        "source, related entity and time."
    ),
    "get_weather_forecast": (
        "Get the weather forecast in ~3-hour slots (temperature, condition, precipitation "
        "probability). Complements get_weather (current conditions)."
    ),
}

#: 常见错误 / 系统回复的中英文案
AGENT_MESSAGES: dict[str, tuple[str, str]] = {
    "tool_timeout": ("工具执行超时（>{seconds:g}s）", "Tool timed out (>{seconds:g}s)"),
    "tool_error": ("工具执行异常: {detail}", "Tool failed: {detail}"),
    "budget_exhausted": (
        (
            "今天的智能管家对话额度（{limit}）已经用完，{used}。"
            "开灯、调温、场景等常用指令仍可直接说；大模型对话明天会自动恢复。"
        ),
        (
            "Today's assistant quota ({limit}) is used up ({used}). "
            "Common commands like lights, temperature and scenes still work; LLM chat resumes tomorrow."
        ),
    ),
    "alias_too_short": ("这条记忆太短了，请说得具体一些。", "That memory is too short — please be more specific."),
    "memory_cleared": (
        "已经把所有学到的指令与记忆忘掉了，像刚认识一样。",
        "I've forgotten all learned commands and memories, as if we just met.",
    ),
    "undo_partial": (
        "已恢复 {ok}/{total} 台设备，其余请手动确认。",
        "Restored {ok}/{total} devices; please verify the rest manually.",
    ),
}


def localize_tool_schemas(schemas: list[Any], lang: str | None = None) -> list[Any]:
    """按语言替换工具顶层描述；非英文直接返回原对象列表。"""
    if not str(lang or "").lower().startswith("en"):
        return schemas
    localized: list[Any] = []
    for schema in schemas:
        name = getattr(schema, "name", "")
        description = TOOL_DESCRIPTIONS_EN.get(name)
        if description:
            localized.append(replace(schema, description=description))
        else:
            localized.append(schema)
    return localized


def agent_text(key: str, lang: str | None = None, **kwargs: Any) -> str:
    """取本地化文案并做占位符替换；未知 key 返回空串。"""
    pair = AGENT_MESSAGES.get(key)
    if pair is None:
        return ""
    template = pair[1] if str(lang or "").lower().startswith("en") else pair[0]
    try:
        return template.format(**kwargs)
    except (KeyError, ValueError):
        return template


__all__ = [
    "AGENT_MESSAGES",
    "TOOL_DESCRIPTIONS_EN",
    "agent_text",
    "localize_tool_schemas",
]
