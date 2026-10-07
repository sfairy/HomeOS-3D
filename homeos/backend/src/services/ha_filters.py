"""Cold Path 状态变更预过滤（对齐 ``shared/ha/state-change-filter.util.ts`` +
``HaStateChangeRouterService`` + ``AlertRuleWatchIndexService``）。

核心路径（state-store / ws-push / event-log / security）仍接收全量事件；
本模块仅服务于 Cold Path 上的副作用消费者（通知健康 / 告警规则）。
"""

from __future__ import annotations

from typing import Any, Literal

from ..core.entity_domain import get_entity_domain

ColdPathConsumer = Literal[
    "automation",
    "alert_rules",
    "notification_health",
    "energy",
    "water",
    "environment",
    "camera",
    "smart_advisor_usage",
]

_ENERGY_DOMAINS = frozenset({"sensor", "switch", "climate", "fan", "light"})
_ADVISOR_DOMAINS = frozenset({"light", "climate", "media_player", "switch", "fan"})


def _new_state(event: dict[str, Any] | None) -> dict[str, Any] | None:
    value = (event or {}).get("new_state")
    return value if isinstance(value, dict) else None


def is_device_health_state_change(event: dict[str, Any] | None) -> bool:
    """是否涉及设备离线或低电量（通知健康检查用）。"""
    state_obj = _new_state(event)
    if state_obj is None:
        return False
    state = state_obj.get("state")
    if state in ("unavailable", "unknown"):
        return True
    battery = (state_obj.get("attributes") or {}).get("battery_level")
    return isinstance(battery, (int, float)) and not isinstance(battery, bool) and battery < 20


def is_energy_relevant_state_change(entity_id: str) -> bool:
    return get_entity_domain(entity_id) in _ENERGY_DOMAINS


def is_water_relevant_state_change(entity_id: str) -> bool:
    return get_entity_domain(entity_id) in ("sensor", "binary_sensor")


def is_environment_relevant_state_change(entity_id: str) -> bool:
    return get_entity_domain(entity_id) in ("sensor", "climate", "binary_sensor")


def is_camera_relevant_state_change(entity_id: str) -> bool:
    domain = get_entity_domain(entity_id)
    return domain in ("camera", "binary_sensor") or str(entity_id).startswith("sensor.frigate")


def is_advisor_usage_entity(entity_id: str) -> bool:
    return get_entity_domain(entity_id) in _ADVISOR_DOMAINS


class AlertRuleWatchIndex:
    """告警规则 entity 预过滤索引（``AlertRuleWatchIndexService`` 等价）。"""

    def __init__(self) -> None:
        self._watched: set[str] = set()
        self._has_global = False

    def update_from_rules(self, rules: list[dict[str, Any]]) -> None:
        watched: set[str] = set()
        has_global = False
        for rule in rules:
            if rule.get("enabled") is False:
                continue
            entity_id = str(rule.get("entityId") or "").strip()
            if not entity_id:
                has_global = True
            else:
                watched.add(entity_id)
        self._watched = watched
        self._has_global = has_global

    def should_process_entity(self, entity_id: str) -> bool:
        if not self._has_global and not self._watched:
            return False
        if self._has_global:
            return True
        return entity_id in self._watched

    def get_watched_count(self) -> int:
        return len(self._watched) + (1 if self._has_global else 0)


class HaStateChangeRouter:
    """轻量状态变更路由（``HaStateChangeRouterService.shouldProcess`` 等价子集）。"""

    def __init__(self, alert_rule_watch_index: AlertRuleWatchIndex) -> None:
        self._alert_rule_watch_index = alert_rule_watch_index

    def should_process(self, consumer: str, event: dict[str, Any] | None) -> bool:
        entity_id = str((event or {}).get("entity_id") or "")
        if not entity_id:
            return False
        if consumer == "alert_rules":
            return self._alert_rule_watch_index.should_process_entity(entity_id)
        if consumer == "notification_health":
            return is_device_health_state_change(event)
        if consumer == "energy":
            return is_energy_relevant_state_change(entity_id)
        if consumer == "water":
            return is_water_relevant_state_change(entity_id)
        if consumer == "environment":
            return is_environment_relevant_state_change(entity_id)
        if consumer == "camera":
            return is_camera_relevant_state_change(entity_id)
        if consumer == "smart_advisor_usage":
            return is_advisor_usage_entity(entity_id)
        # 未注册消费者兜底返回 True：未知消费者不丢事件。
        return True


__all__ = [
    "ColdPathConsumer",
    "AlertRuleWatchIndex",
    "HaStateChangeRouter",
    "is_device_health_state_change",
    "is_energy_relevant_state_change",
    "is_water_relevant_state_change",
    "is_environment_relevant_state_change",
    "is_camera_relevant_state_change",
    "is_advisor_usage_entity",
]
