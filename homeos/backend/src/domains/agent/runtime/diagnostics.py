"""智能管家诊断日志：设备离线 / 恢复 / 低电量 / HA 连接状态。

对齐 Nest ``AgentLoggerService``，但落点复用本项目已有的全局日志
（``app.state.global_log``，``/api/v1/logs`` 与「系统后台」共用同一份），
不再单独写一份滚动文件：

- 分类固定为「诊断」，具体类型放在 ``context.kind``，便于工具与设置页过滤；
- 同一实体离线 / 低电量只记一次，避免 HA 抖屏时刷满日志；
- 查询走 ``global_log.list_events``，并对实体做可见性过滤（受限账号看不到不可见设备）。
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from ....platform.core.db.json_field import object_field

logger = logging.getLogger("homeos.agent.diagnostics")

#: 全局日志里的分类名
DIAG_CATEGORY = "诊断"
#: 低电量阈值（%）
LOW_BATTERY_PERCENT = 15
#: 去重表上限：超过后整体清空，避免长跑后只增不减
MAX_TRACKED = 500
#: 单次查询上限
MAX_QUERY_ROWS = 100

KIND_OFFLINE = "DEVICE_OFFLINE"
KIND_RECOVERED = "DEVICE_RECOVERED"
KIND_LOW_BATTERY = "LOW_BATTERY"
KIND_CONNECTIVITY = "CONNECTIVITY"


def _state_of(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("state") or "").strip().lower()
    if isinstance(value, str):
        return value.strip().lower()
    return ""


class AgentDiagnosticsService:
    """诊断事件记录与查询（写全局日志，读全局日志）。"""

    def __init__(
        self,
        global_log: Any = None,
        state_store: Any = None,
        event_bus: Any = None,
    ) -> None:
        self._global_log = global_log
        self._state_store = state_store
        self._event_bus = event_bus
        #: 当前处于离线状态的实体
        self._offline: dict[str, str] = {}
        #: 已报过低电量的实体 → 日期键（每天最多一次）
        self._low_battery: dict[str, str] = {}

    # 事件绑定
    def bind_events(self) -> None:
        if self._event_bus is None:
            return
        self._event_bus.on("ha.state_changed", self._on_single)
        self._event_bus.on("ha.state_changed.batch", self._on_batch)
        self._event_bus.on("ha.connected", self._on_connected)
        self._event_bus.on("ha.disconnected", self._on_disconnected)

    def _on_single(self, payload: Any) -> None:
        if isinstance(payload, dict) and payload.get("entity_id"):
            self._handle_change(payload)

    def _on_batch(self, payload: Any) -> None:
        changes = payload.get("changes") if isinstance(payload, dict) else None
        if not isinstance(changes, list):
            return
        for change in changes:
            if isinstance(change, dict) and change.get("entity_id"):
                self._handle_change(change)

    def _on_connected(self, _payload: Any = None) -> None:
        self._write(
            "success",
            "Home Assistant 连接已恢复",
            {"kind": KIND_CONNECTIVITY, "event": "connected"},
        )

    def _on_disconnected(self, payload: Any = None) -> None:
        reason = ""
        if isinstance(payload, dict):
            reason = str(payload.get("reason") or "")
        self._write(
            "error",
            f"Home Assistant 连接断开{f'（{reason}）' if reason else ''}",
            {"kind": KIND_CONNECTIVITY, "event": "disconnected", "reason": reason},
        )

    def _handle_change(self, change: dict[str, Any]) -> None:
        entity_id = str(change.get("entity_id") or "")
        if not entity_id:
            return
        new_state = change.get("new_state")
        state = _state_of(new_state)
        if not state:
            return
        attributes = object_field(new_state, "attributes") if isinstance(new_state, dict) else {}
        name = str(attributes.get("friendly_name") or entity_id)

        if state in ("unavailable", "unknown"):
            if self._offline.get(entity_id) == state:
                return
            self._track(self._offline, entity_id, state)
            self._write(
                "warning",
                f"{name} 离线（{state}）",
                {"kind": KIND_OFFLINE, "entityId": entity_id, "state": state},
                entity_id=entity_id,
            )
        elif entity_id in self._offline:
            self._offline.pop(entity_id, None)
            self._write(
                "success",
                f"{name} 已恢复（{state}）",
                {"kind": KIND_RECOVERED, "entityId": entity_id, "state": state},
                entity_id=entity_id,
            )

        battery = attributes.get("battery_level")
        if battery is None:
            return
        try:
            level = float(battery)
        except TypeError, ValueError:
            logger.debug("电量字段不可解析，跳过: %s=%r", entity_id, battery)
            return
        if level > LOW_BATTERY_PERCENT:
            return
        day = datetime.now(UTC).strftime("%Y-%m-%d")
        if self._low_battery.get(entity_id) == day:
            return
        self._track(self._low_battery, entity_id, day)
        self._write(
            "warning",
            f"{name} 电量低（{round(level)}%）",
            {
                "kind": KIND_LOW_BATTERY,
                "entityId": entity_id,
                "batteryLevel": round(level),
            },
            entity_id=entity_id,
        )

    @staticmethod
    def _track(table: dict[str, str], key: str, value: str) -> None:
        if len(table) >= MAX_TRACKED:
            table.clear()
        table[key] = value

    def _write(
        self,
        level: str,
        message: str,
        context: dict[str, Any],
        *,
        entity_id: str = "",
    ) -> None:
        """写一条诊断日志；日志服务缺失时只打 DEBUG，不影响主流程。"""
        log = self._global_log
        if log is None:
            logger.debug("诊断（无全局日志）: %s", message)
            return
        payload = {**context, "source": "agent-diagnostics"}
        if entity_id:
            payload["entityId"] = entity_id
        try:
            log.append(level, "智能管家", DIAG_CATEGORY, message, context=payload)
        except Exception as exc:  # pragma: no cover - 日志失败绝不能影响状态分发
            logger.debug("写入诊断日志失败: %s (%s)", message, exc)

    # 查询
    def query(
        self,
        *,
        level: str = "",
        category: str = "",
        search: str = "",
        kind: str = "",
        limit: int = 50,
        may_read: Any = None,
    ) -> list[dict[str, Any]]:
        """读取诊断日志（最新在前）。

        :param may_read: 可选的实体可见性判定函数 ``(entity_id) -> bool``；
            受限账号查不到不可见设备的诊断记录。
        """
        log = self._global_log
        if log is None:
            return []
        capped = max(1, min(MAX_QUERY_ROWS, int(limit or 50)))
        try:
            events = log.list_events(
                level=level or None,
                category=category or DIAG_CATEGORY,
                search=search or None,
                limit=None,
            )
        except Exception as exc:
            logger.warning("读取诊断日志失败: %s", exc)
            return []
        items: list[dict[str, Any]] = []
        for event in events:
            context = event.get("context")
            context = context if isinstance(context, dict) else {}
            event_kind = str(context.get("kind") or "")
            if kind and event_kind != kind:
                continue
            entity_id = str(context.get("entityId") or "")
            if entity_id and callable(may_read) and not may_read(entity_id):
                continue
            items.append(
                {
                    "id": event.get("id"),
                    "level": event.get("level"),
                    "message": event.get("message"),
                    "timestamp": event.get("lastTimestamp") or event.get("timestamp"),
                    "kind": event_kind,
                    "entityId": entity_id,
                    "context": context,
                }
            )
            if len(items) >= capped:
                break
        return items


__all__ = [
    "DIAG_CATEGORY",
    "KIND_CONNECTIVITY",
    "KIND_LOW_BATTERY",
    "KIND_OFFLINE",
    "KIND_RECOVERED",
    "LOW_BATTERY_PERCENT",
    "AgentDiagnosticsService",
]
