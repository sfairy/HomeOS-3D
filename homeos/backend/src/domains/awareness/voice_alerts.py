"""语音告警（TTS）规则、目录与模板工具。

逐条对齐 ``packages/shared/src/notification/voice-alert.ts`` 与
``backend/src/common/alert-support/voice-alert.util.ts``：

- ``VOICE_ALERT_CATALOG``：前端设置页渲染用的告警类型目录（中文标签 / 描述 / 分组）；
- ``resolve_voice_alert_rules``：``ttsAlerts`` 与默认矩阵浅合并（非法输入回退默认）；
- ``normalize_wake_words``：唤醒词去重 trim，空时回退 ``['小智']``；
- ``normalize_custom_tts_alerts`` / ``normalize_entity_tts_alerts``：自定义播报规则归一化；
- ``apply_alert_template``：``{{key}}`` 变量替换；
- ``match_custom_entity_alert`` / ``match_entity_tts_alert``：实体状态变化命中判定。
"""

from __future__ import annotations

import re
import time
from typing import Any

from ..app_config.defaults import DEFAULT_VOICE_ALERT_RULES

#: 语音告警类型目录（key 必须是 ``DEFAULT_VOICE_ALERT_RULES`` 中除 enabled 外的布尔字段）
VOICE_ALERT_CATALOG: list[dict[str, str]] = [
    {
        "key": "securityZone",
        "label": "安防区域告警",
        "description": "人体/门磁等传感器触发布防区域",
        "group": "security",
    },
    {
        "key": "securityAnomaly",
        "label": "异常行为检测",
        "description": "长时间滞留、全屋无人异常等",
        "group": "security",
    },
    {
        "key": "safetySmoke",
        "label": "烟雾告警",
        "description": "烟雾传感器触发，联动关燃气阀/排风",
        "group": "security",
    },
    {"key": "safetyGas", "label": "燃气泄漏", "description": "燃气传感器触发", "group": "security"},
    {
        "key": "safetyWater",
        "label": "漏水告警",
        "description": "漏水传感器触发，联动关水阀",
        "group": "security",
    },
    {
        "key": "securityEmergency",
        "label": "紧急求救",
        "description": "安防面板 SOS / 紧急按钮",
        "group": "security",
    },
    {
        "key": "presenceLeft",
        "label": "全员离家",
        "description": "家人全部离开，自动布防提示",
        "group": "security",
    },
    {
        "key": "energyAnomaly",
        "label": "能耗异常",
        "description": "单设备功耗明显高于基线",
        "group": "life",
    },
    {
        "key": "energyBudget",
        "label": "能源预算超支",
        "description": "本月用能预计超出预算",
        "group": "life",
    },
    {
        "key": "waterAnomaly",
        "label": "用水异常",
        "description": "持续水流或日用水超阈值",
        "group": "life",
    },
    {
        "key": "envMoldRisk",
        "label": "霉菌风险",
        "description": "房间湿度/露点霉菌风险偏高",
        "group": "life",
    },
    {
        "key": "notificationDanger",
        "label": "危险通知",
        "description": "站内 danger 级通知同步语音播报",
        "group": "notify",
    },
    {
        "key": "notificationWarn",
        "label": "警告通知",
        "description": "站内 warn 级通知（易频繁，默认关）",
        "group": "notify",
    },
]

#: 语音告警分组 → 中文标题（前端设置页展示用）
VOICE_ALERT_GROUP_LABELS: dict[str, str] = {
    "security": "安防与安全",
    "life": "能源与环境",
    "notify": "通知同步",
}

#: 白天时段每日顾问播报默认话术
DEFAULT_DAILY_ADVISOR_TTS_DAYTIME = "智能家居小贴士：空调设定26度最省电哦"
#: 夜间时段每日顾问播报默认话术
DEFAULT_DAILY_ADVISOR_TTS_EVENING = (
    "晚上好，现在是{{hour}}点，请检查门窗是否关好，祝您晚安"
)

#: 默认唤醒词（``wakeWords`` 为空时回退）
DEFAULT_WAKE_WORD = "小智"

#: HA 精确实体 ID 格式（``domain.object_id``）
_EXACT_ENTITY_ID_RE = re.compile(r"^[a-z_]+\.[a-z0-9_]+$", re.IGNORECASE)
#: ``{{key}}`` 模板占位符
_TEMPLATE_RE = re.compile(r"\{\{\s*(\w+)\s*\}\}")


def resolve_voice_alert_rules(voice: dict[str, Any] | None = None) -> dict[str, bool]:
    """解析语音告警开关矩阵；``ttsAlerts`` 非法时返回默认矩阵浅拷贝。"""
    raw = (voice or {}).get("ttsAlerts") if isinstance(voice, dict) else None
    if not isinstance(raw, dict):
        return dict(DEFAULT_VOICE_ALERT_RULES)
    merged = dict(DEFAULT_VOICE_ALERT_RULES)
    for key, value in raw.items():
        if key in merged and isinstance(value, bool):
            merged[key] = value
    return merged


def merge_voice_alert_rules(raw: dict[str, Any] | None = None) -> dict[str, bool]:
    """语义糖：``partial → full``，直接委托 :func:`resolve_voice_alert_rules`。"""
    return resolve_voice_alert_rules({"ttsAlerts": raw})


def normalize_wake_words(voice: dict[str, Any] | None = None) -> list[str]:
    """唤醒词归一化（去重 + trim + 空过滤），空时回退 ``['小智']``。"""
    words = (voice or {}).get("wakeWords") if isinstance(voice, dict) else None
    if isinstance(words, list):
        seen: list[str] = []
        for word in words:
            text = str(word).strip()
            if text and text not in seen:
                seen.append(text)
        if seen:
            return seen
    return [DEFAULT_WAKE_WORD]


def is_exact_entity_id(value: Any) -> bool:
    """是否为 ``domain.object_id`` 形式的 HA 精确实体 ID。"""
    text = str(value or "").strip()
    if not text or text.endswith("."):
        return False
    return bool(_EXACT_ENTITY_ID_RE.match(text))


def apply_alert_template(
    template: Any, variables: dict[str, Any] | None = None
) -> str:
    """替换模板变量 ``{{key}}``；值为 None 时替换为空串。"""
    variables = variables or {}

    def _replace(match: re.Match[str]) -> str:
        value = variables.get(match.group(1))
        return "" if value is None else str(value)

    return _TEMPLATE_RE.sub(_replace, str(template)).strip()


def normalize_entity_tts_alerts(raw: Any) -> list[dict[str, Any]]:
    """按实体精确匹配的 TTS 规则归一化（同实体仅保留首条）。"""
    if not isinstance(raw, list):
        return []
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for item in raw:
        rule = item if isinstance(item, dict) else {}
        entity_id = str(rule.get("entityId") or "").strip()
        message_template = str(rule.get("messageTemplate") or "").strip()
        if not entity_id or not is_exact_entity_id(entity_id) or not message_template:
            continue
        if entity_id in seen:
            continue
        seen.add(entity_id)
        state_to = str(rule.get("stateTo") or "").strip()
        entry: dict[str, Any] = {
            "id": str(rule.get("id") or f"entity_tts_{entity_id}").strip(),
            "entityId": entity_id,
            "enabled": rule.get("enabled") is not False,
            "messageTemplate": message_template,
        }
        if state_to:
            entry["stateTo"] = state_to
        out.append(entry)
    return out


def normalize_custom_tts_alerts(raw: Any) -> list[dict[str, Any]]:
    """自定义 TTS 规则归一化（``messageTemplate`` 为空则整条丢弃）。"""
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for index, item in enumerate(raw):
        rule = item if isinstance(item, dict) else {}
        trigger = "notification" if rule.get("trigger") == "notification" else "entity_state"
        message_template = str(rule.get("messageTemplate") or "").strip()
        if not message_template:
            continue
        entity_match = str(rule.get("entityMatch") or "").strip()
        state_to = str(rule.get("stateTo") or "").strip()
        message_contains = str(rule.get("messageContains") or "").strip()
        source_contains = str(rule.get("sourceContains") or "").strip()
        label = str(rule.get("label") or "").strip() or "自定义规则"
        entry: dict[str, Any] = {
            "id": str(rule.get("id") or f"custom_{index}_{int(time.time() * 1000)}").strip(),
            "label": label,
            "enabled": rule.get("enabled") is not False,
            "trigger": trigger,
            "notificationLevel": rule.get("notificationLevel") or "",
            "messageTemplate": message_template,
        }
        if entity_match:
            entry["entityMatch"] = entity_match
        if state_to:
            entry["stateTo"] = state_to
        if message_contains:
            entry["messageContains"] = message_contains
        if source_contains:
            entry["sourceContains"] = source_contains
        out.append(entry)
    return out


def match_entity_tts_alert(
    entity_id: str, new_state: str, old_state: str | None, rule: dict[str, Any]
) -> bool:
    """实体级 TTS 规则是否命中（精确实体 + 目标状态 + 状态确有变化）。"""
    if not rule or rule.get("enabled") is False:
        return False
    rule_entity = str(rule.get("entityId") or "").strip()
    if not rule_entity or entity_id != rule_entity:
        return False
    target = str(rule.get("stateTo") or "").strip()
    if target and new_state != target:
        return False
    return old_state != new_state


def match_custom_entity_alert(
    entity_id: str, new_state: str, old_state: str | None, rule: dict[str, Any]
) -> bool:
    """自定义实体状态告警是否命中（前缀/精确匹配 + 目标状态 + 状态确有变化）。"""
    if not rule or rule.get("enabled") is False or rule.get("trigger") != "entity_state":
        return False
    match = str(rule.get("entityMatch") or "").strip()
    if not match:
        return False
    if not entity_id.startswith(match) and entity_id != match:
        return False
    target = str(rule.get("stateTo") or "").strip()
    if target and new_state != target:
        return False
    return old_state != new_state


__all__ = [
    "DEFAULT_DAILY_ADVISOR_TTS_DAYTIME",
    "DEFAULT_DAILY_ADVISOR_TTS_EVENING",
    "DEFAULT_WAKE_WORD",
    "VOICE_ALERT_CATALOG",
    "VOICE_ALERT_GROUP_LABELS",
    "apply_alert_template",
    "is_exact_entity_id",
    "match_custom_entity_alert",
    "match_entity_tts_alert",
    "merge_voice_alert_rules",
    "normalize_custom_tts_alerts",
    "normalize_entity_tts_alerts",
    "normalize_wake_words",
    "resolve_voice_alert_rules",
]
