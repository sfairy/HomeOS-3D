"""语音命令解析与执行规划工具。

逐条对齐 ``backend/src/common/alert-support/voice-command.util.ts``：

- ``extract_room_from_text``：从自然语言提取房间（label 精确优先，其次 keywords 小写别名）；
- ``plan_voice_commands``：匹配语音命令映射，展开为针对具体 HA 实体的动作或 HomeOS 目标动作；
- ``extract_ha_assist_speech`` / ``ha_assist_succeeded``：解析 HA Assist 响应、判定是否真正处理；
- ``DEFAULT_WHOLE_HOME_VOICE_COMMANDS``：全屋默认语音命令（设置页一键导入）。
"""

from __future__ import annotations

import re
from typing import Any

from ..app_config.room_meta import default_voice_rooms

#: 语音命令类型：``entity``=HA 实体控制，其余三种为 HomeOS 内部目标
VOICE_COMMAND_KINDS = ("entity", "homeos_scene", "homeos_automation", "homeos_mode")

#: 全屋默认语音房间列表（与 envSensorMap 默认目录一致）
VOICE_ROOMS: list[dict[str, Any]] = default_voice_rooms()

#: Assist 兜底话术（未理解意图）正则
_ASSIST_FALLBACK_RE = re.compile(
    r"sorry|don'?t understand|didn'?t understand|no intent|not sure|can you rephrase"
    r"|抱歉|没有理解|听不懂|无法处理|没听清|再说一遍|不太明白",
    re.IGNORECASE,
)


def extract_room_from_text(
    text: str, rooms: list[dict[str, Any]] | None = None
) -> dict[str, Any] | None:
    """从文本中提取房间：先 label 精确匹配（区分大小写），再 keywords 小写别名匹配。"""
    rooms = rooms if rooms is not None else VOICE_ROOMS
    raw = str(text or "")
    lower = raw.lower()
    for room in rooms:
        label = str(room.get("label") or "")
        if label and label in raw:
            return room
        keywords = room.get("keywords") or []
        if any(str(k).lower() in lower for k in keywords if str(k)):
            return room
    return None


def entity_matches_room(entity: dict[str, Any], room: dict[str, Any]) -> bool:
    """实体是否属于指定房间（搜索空间：entity_id + friendly_name + area_id）。"""
    attrs = entity.get("attributes") or {}
    if not isinstance(attrs, dict):
        attrs = {}
    hay = f"{entity.get('entity_id') or ''} {attrs.get('friendly_name') or ''} {attrs.get('area_id') or ''}".lower()
    label = str(room.get("label") or "")
    if label and label.lower() in hay:
        return True
    return any(str(k).lower() in hay for k in (room.get("keywords") or []) if str(k))


def find_matching_command(
    text: str, mappings: list[dict[str, Any]]
) -> tuple[dict[str, Any], str] | None:
    """查找命中的语音命令映射及命中短语（按 mappings 顺序返回首个命中）。"""
    lower = str(text or "").lower()
    for mapping in mappings or []:
        for phrase in mapping.get("phrases") or []:
            p = str(phrase).strip().lower()
            if p and p in lower:
                return mapping, str(phrase).strip()
    return None


def plan_voice_commands(
    text: str,
    mappings: list[dict[str, Any]],
    entities: list[dict[str, Any]],
    rooms: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """规划语音命令执行计划（含匹配状态、房间、动作列表、用户可见消息）。

    1. 提取房间（可能为 None=全屋）。
    2. 查找匹配的命令映射；未匹配则 ``matched=False``。
    3. 非 entity 类型（场景/自动化/模式）：直接生成单条动作，需 ``targetId``。
    4. entity 类型：按 ``entityMatch`` 前缀过滤实体，排除 unavailable，按房间过滤。
    5. 生成用户可见中文消息。
    """
    rooms = rooms if rooms is not None else VOICE_ROOMS
    room = extract_room_from_text(text, rooms)
    hit = find_matching_command(text, mappings)
    if hit is None:
        return {
            "matched": False,
            "room": room,
            "phrase": None,
            "actions": [],
            "message": "未匹配到语音命令",
            "count": 0,
        }

    mapping, phrase = hit
    kind = mapping.get("kind") or "entity"

    if kind != "entity":
        target_id = str(mapping.get("targetId") or "").strip()
        if not target_id:
            return {
                "matched": True,
                "room": room,
                "phrase": phrase,
                "actions": [],
                "message": "语音命令未配置 HomeOS 目标 ID",
                "count": 0,
            }
        label = (
            "场景"
            if kind == "homeos_scene"
            else "自动化"
            if kind == "homeos_automation"
            else "家庭模式"
        )
        return {
            "matched": True,
            "room": room,
            "phrase": phrase,
            "actions": [
                {
                    "kind": kind,
                    "domain": mapping.get("domain") or "",
                    "service": mapping.get("service") or "",
                    "entityId": "",
                    "targetId": target_id,
                }
            ],
            "message": f"已触发 HomeOS {label}（{phrase}）",
            "count": 1,
        }

    prefix = mapping.get("entityMatch") or f"{mapping.get('domain') or ''}."
    actions: list[dict[str, Any]] = []
    for entity in entities or []:
        entity_id = str((entity or {}).get("entity_id") or "")
        if not entity_id or not entity_id.startswith(prefix):
            continue
        if entity.get("state") == "unavailable":
            continue
        if room is not None and not entity_matches_room(entity, room):
            continue
        action: dict[str, Any] = {
            "domain": mapping.get("domain") or "",
            "service": mapping.get("service") or "",
            "entityId": entity_id,
        }
        if mapping.get("serviceData") is not None:
            action["serviceData"] = mapping.get("serviceData")
        actions.append(action)

    scope = str(room.get("label")) if room else "全屋"
    if actions:
        message = f"已执行 {scope} {len(actions)} 个设备（{phrase}）"
    elif room:
        message = f"{scope}未找到匹配设备"
    else:
        message = "未找到匹配设备"

    return {
        "matched": True,
        "room": room,
        "phrase": phrase,
        "actions": actions,
        "message": message,
        "count": len(actions),
    }


def extract_ha_assist_speech(response: dict[str, Any] | None) -> str:
    """从 HA Assist 响应中提取语音回复文本（顶层 speech / 嵌套 response.speech）。"""
    if not isinstance(response, dict):
        return ""
    speech = response.get("speech")
    if isinstance(speech, dict):
        plain = speech.get("plain")
        if isinstance(plain, dict) and plain.get("speech"):
            return str(plain["speech"]).strip()
    resp = response.get("response")
    if isinstance(resp, dict):
        speech = resp.get("speech")
        if isinstance(speech, dict):
            plain = speech.get("plain")
            if isinstance(plain, dict) and plain.get("speech"):
                return str(plain["speech"]).strip()
    return ""


def is_ha_assist_fallback_speech(speech: str) -> bool:
    """Assist 兜底话术（未理解意图）不当作成功，以便回落短语 / 智能管家。"""
    s = str(speech or "").strip().lower()
    if not s:
        return True
    return bool(_ASSIST_FALLBACK_RE.search(s))


def ha_assist_succeeded(response: dict[str, Any] | None) -> bool:
    """HA Assistant 是否已成功处理（``action_done`` 或带有效语音的 ``query_answer``）。"""
    if not isinstance(response, dict):
        return False
    resp_type = str(response.get("response_type") or "")
    if resp_type in ("error", "no_intent_matched"):
        return False
    if resp_type == "action_done":
        return True
    if resp_type == "query_answer":
        speech = extract_ha_assist_speech(response)
        if not speech:
            return False
        return not is_ha_assist_fallback_speech(speech)
    data = response.get("data")
    if isinstance(data, dict):
        if data.get("code") == "no_intent" or data.get("failed") is True:
            return False
    return False


#: 全屋智能默认语音命令（设置页可一键导入）
DEFAULT_WHOLE_HOME_VOICE_COMMANDS: list[dict[str, Any]] = [
    {"phrases": ["开灯", "打开灯", "亮灯"], "domain": "light", "service": "turn_on", "entityMatch": "light."},
    {"phrases": ["关灯", "关闭灯", "关掉灯"], "domain": "light", "service": "turn_off", "entityMatch": "light."},
    {
        "phrases": ["打开空调", "开空调"],
        "domain": "climate",
        "service": "set_hvac_mode",
        "entityMatch": "climate.",
        "serviceData": {"hvac_mode": "cool"},
    },
    {
        "phrases": ["关闭空调", "关空调"],
        "domain": "climate",
        "service": "set_hvac_mode",
        "entityMatch": "climate.",
        "serviceData": {"hvac_mode": "off"},
    },
    {"phrases": ["打开窗帘", "拉开窗帘"], "domain": "cover", "service": "open_cover", "entityMatch": "cover."},
    {
        "phrases": ["关闭窗帘", "拉上窗帘", "关窗帘"],
        "domain": "cover",
        "service": "close_cover",
        "entityMatch": "cover.",
    },
    {"phrases": ["打开风扇", "开风扇"], "domain": "fan", "service": "turn_on", "entityMatch": "fan."},
    {"phrases": ["关闭风扇", "关风扇"], "domain": "fan", "service": "turn_off", "entityMatch": "fan."},
    {"phrases": ["打开插座", "开插座"], "domain": "switch", "service": "turn_on", "entityMatch": "switch."},
    {"phrases": ["关闭插座", "关插座"], "domain": "switch", "service": "turn_off", "entityMatch": "switch."},
    {
        "phrases": ["暂停音乐", "停止播放"],
        "domain": "media_player",
        "service": "media_pause",
        "entityMatch": "media_player.",
    },
]


__all__ = [
    "DEFAULT_WHOLE_HOME_VOICE_COMMANDS",
    "VOICE_COMMAND_KINDS",
    "VOICE_ROOMS",
    "entity_matches_room",
    "extract_ha_assist_speech",
    "extract_room_from_text",
    "find_matching_command",
    "ha_assist_succeeded",
    "is_ha_assist_fallback_speech",
    "plan_voice_commands",
]
