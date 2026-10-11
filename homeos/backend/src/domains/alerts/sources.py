"""通知来源归一化 / 标签 / 生命安全识别（对齐 ``@homeos/shared`` notification/source.ts）。

仅移植后端所需子集：``normalizeNotificationSource`` / ``normalizeNotificationFilterKey`` /
``isLifeSafetyNotification`` / ``notificationSourceLabel`` / ``buildNotificationSourceDbFilter``。
"""

from __future__ import annotations

from typing import Any, TypedDict

#: 通知来源 → 简短中文标签。
NOTIFICATION_SOURCE_SHORT_LABELS: dict[str, str] = {
    "alert-rule": "告警",
    "system": "系统",
    "energy": "能耗",
    "energy-budget": "预算",
    "energy-anomaly": "能耗",
    "water-monitor": "用水",
    "device-monitor": "设备",
    "emergency": "紧急",
    "home-mode": "模式",
    "automation": "自动化",
    "environment-health": "环境",
    "earthquake-eew": "地震预警",
    "earthquake-catalog": "震情",
    "earthquake": "地震",
    "security": "安防",
    "advisor": "智能顾问",
    "hazard": "隐患",
    "drill": "演习",
    "voice": "语音",
    "presence": "人员",
}

_ADVISOR_CATEGORY_LABELS: dict[str, str] = {
    "security": "安防顾问",
    "env": "环境顾问",
    "energy": "能源顾问",
    "water": "用水顾问",
    "tip": "智能顾问",
}

#: 筛选 Tab 排序（不含 all）。
NOTIFICATION_FILTER_PRIORITY: tuple[str, ...] = (
    "alert-rule",
    "security",
    "environment-health",
    "earthquake",
    "energy-anomaly",
    "energy-budget",
    "energy",
    "advisor",
    "device-monitor",
    "water-monitor",
    "home-mode",
    "automation",
    "voice",
    "system",
)


class NotificationSourceDbFilter(TypedDict, total=False):
    """后端 source 过滤 DSL（exact / startsWith / or）。"""

    kind: str
    value: str
    clauses: list[dict[str, str]]


def _text(source: Any) -> str:
    return str(source or "").strip()


def normalize_notification_source(source: Any) -> str:
    """统计图表用：合并相近来源。"""
    src = _text(source)
    if not src or src == "system":
        return "system"
    if src == "alert-rule" or src.startswith("alert-rule"):
        return "alert-rule"
    if src.startswith("earthquake"):
        return "earthquake"
    if src.startswith("advisor-"):
        return "advisor"
    if src == "energy-budget":
        return "energy-budget"
    if src.startswith("energy"):
        return "energy"
    if src == "emergency" or src.startswith(("security", "hazard", "drill")):
        return "security"
    if src.startswith("environment"):
        return "environment-health"
    if src.startswith("device"):
        return "device-monitor"
    if src.startswith("water"):
        return "water-monitor"
    if src.startswith("home-mode"):
        return "home-mode"
    if src.startswith("voice"):
        return "voice"
    return src


def normalize_notification_filter_key(source: Any) -> str:
    """筛选 Tab 用：保留更细粒度（如 energy-anomaly）。"""
    src = _text(source)
    if not src or src == "system":
        return "system"
    if src == "alert-rule" or src.startswith("alert-rule"):
        return "alert-rule"
    if src.startswith("earthquake"):
        return "earthquake"
    if src.startswith("advisor-"):
        return "advisor"
    if src == "energy-budget":
        return "energy-budget"
    if src == "energy-anomaly":
        return "energy-anomaly"
    if src.startswith("energy"):
        return "energy"
    if src == "emergency" or src.startswith(("security", "hazard", "drill")):
        return "security"
    if src.startswith("environment"):
        return "environment-health"
    if src.startswith("device"):
        return "device-monitor"
    if src.startswith("water"):
        return "water-monitor"
    if src.startswith("home-mode"):
        return "home-mode"
    if src == "automation":
        return "automation"
    if src.startswith("voice"):
        return "voice"
    return "system"


def is_life_safety_notification(level: Any, source: Any) -> bool:
    """生命安全 / 紧急类通知：不受「重要通知」开关与普通 DND 静音。"""
    if str(level or "").lower() == "danger":
        return True
    src = _text(source).lower()
    if not src:
        return False
    if src in ("emergency", "security", "water-monitor"):
        return True
    if src.startswith(("security", "hazard", "drill")):
        return True
    if src.startswith("earthquake"):
        return True
    return bool(src.startswith("water"))


def _advisor_source_label(source: str) -> str | None:
    if not source.startswith("advisor-"):
        return None
    category = source[len("advisor-") :]
    return _ADVISOR_CATEGORY_LABELS.get(category, "智能顾问")


def notification_source_label(source: Any) -> str:
    """返回通知来源的简短中文标签；空/未知源兜底为「系统」。"""
    src = _text(source)
    if not src:
        return "系统"
    if src in NOTIFICATION_SOURCE_SHORT_LABELS:
        return NOTIFICATION_SOURCE_SHORT_LABELS[src]
    advisor = _advisor_source_label(src)
    if advisor:
        return advisor
    if src.startswith("alert-rule"):
        return "告警"
    if src.startswith("earthquake"):
        return "地震"
    if src.startswith("energy"):
        return "能耗"
    if src.startswith("security") or "linkage" in src:
        return "安防"
    if src.startswith("environment"):
        return "环境"
    if src.startswith("device"):
        return "设备"
    if src.startswith("water"):
        return "用水"
    if src.startswith("home-mode"):
        return "模式"
    if src.startswith("voice"):
        return "语音"
    if src.startswith("hazard"):
        return "隐患"
    if src.startswith("drill"):
        return "演习"
    if src.startswith("advisor"):
        return "智能顾问"
    return "系统"


def build_notification_source_db_filter(filter_key: str) -> NotificationSourceDbFilter | None:
    """构建 source 过滤 DSL；``all`` / 空返回 None。"""
    if not filter_key or filter_key == "all":
        return None
    if filter_key == "earthquake":
        return {"kind": "startsWith", "value": "earthquake"}
    if filter_key == "advisor":
        return {"kind": "startsWith", "value": "advisor-"}
    if filter_key == "energy":
        return {"kind": "startsWith", "value": "energy"}
    if filter_key == "security":
        return {
            "kind": "or",
            "clauses": [
                {"startsWith": "security"},
                {"exact": "emergency"},
                {"startsWith": "hazard"},
                {"startsWith": "drill"},
            ],
        }
    if filter_key == "device-monitor":
        return {"kind": "startsWith", "value": "device"}
    if filter_key == "environment-health":
        return {"kind": "startsWith", "value": "environment"}
    if filter_key == "water-monitor":
        return {"kind": "startsWith", "value": "water"}
    if filter_key == "home-mode":
        return {"kind": "startsWith", "value": "home-mode"}
    if filter_key == "voice":
        return {"kind": "startsWith", "value": "voice"}
    if filter_key == "system":
        return {"kind": "exact", "value": "system"}
    return {"kind": "exact", "value": filter_key}


__all__ = [
    "NOTIFICATION_FILTER_PRIORITY",
    "NOTIFICATION_SOURCE_SHORT_LABELS",
    "NotificationSourceDbFilter",
    "build_notification_source_db_filter",
    "is_life_safety_notification",
    "normalize_notification_filter_key",
    "normalize_notification_source",
    "notification_source_label",
]
