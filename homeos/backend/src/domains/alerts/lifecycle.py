"""告警生命周期（未确认抑制 / 恢复 / 升级）。

这里回答三个「告警发出去之后」的问题，而冷却只管「多久内别再发」：

1. **未确认抑制**：同一条规则对同一个实体已经报过、用户还没确认时，不再重复推送。
   冷却是有时限的（分钟级），而「家里没人的时候燃气一直在漏」需要的是「没处理就别刷屏，
   但也别让它被忘掉」—— 后者由升级承担。
2. **恢复**：条件回落（且过了回落去抖）时补一条 ``resolved``，让用户知道事情结束了。
   没有这条时，告警列表里永远留着一条「已报警」，用户无法区分「还在漏」和「早好了」。
3. **升级**：超过 ``escalationMinutes`` 仍未确认时再推一次（提高到 danger 级 + 全部渠道），
   只升级一次，避免把升级本身变成刷屏。

状态全部在进程内（单进程部署）。进程重启后未确认的告警会丢失 —— 这是已知边界，
与冷却持久化的取舍不同：告警条目本身已落库，重启后用户仍能在通知中心看到，
丢的只是「是否已确认」这一位。
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ActiveAlert:
    """一条「已报出但还没恢复」的告警。"""

    rule_key: str
    entity_id: str
    level: str
    message: str
    channels: list[str] = field(default_factory=list)
    title: str | None = None
    triggered_at: float = 0.0
    acknowledged: bool = False
    escalated: bool = False

    @property
    def edge_key(self) -> str:
        return f"{self.rule_key}:{self.entity_id}"


def _now() -> float:
    """单调时钟（秒）。单测替换这一个函数即可推进时间。"""
    return time.monotonic()


class AlertLifecycle:
    """未确认告警的登记簿（纯状态机，不做 IO）。"""

    def __init__(self) -> None:
        self._alerts: dict[str, ActiveAlert] = {}

    def __len__(self) -> int:
        return len(self._alerts)

    def is_open_unacked(self, edge_key: str) -> bool:
        """该实体当前是否有「已报未确认」的告警（第二层抑制判据）。"""
        alert = self._alerts.get(edge_key)
        return alert is not None and not alert.acknowledged

    def get(self, edge_key: str) -> ActiveAlert | None:
        return self._alerts.get(edge_key)

    def open_alert(
        self,
        *,
        rule_key: str,
        entity_id: str,
        level: str,
        message: str,
        channels: list[str],
        title: str | None = None,
    ) -> ActiveAlert:
        """登记一次已成功投递的告警。同键重复登记时保留最早的触发时间（升级计时不重置）。"""
        edge_key = f"{rule_key}:{entity_id}"
        existing = self._alerts.get(edge_key)
        if existing is not None:
            existing.level = level
            existing.message = message
            existing.channels = channels
            existing.title = title
            return existing
        alert = ActiveAlert(
            rule_key=rule_key,
            entity_id=entity_id,
            level=level,
            message=message,
            channels=channels,
            title=title,
            triggered_at=_now(),
        )
        self._alerts[edge_key] = alert
        return alert

    def acknowledge(self, rule_key: str, entity_id: str) -> bool:
        """标记已确认；返回是否命中了一条在册告警。"""
        alert = self._alerts.get(f"{rule_key}:{entity_id}")
        if alert is None:
            return False
        alert.acknowledged = True
        return True

    def resolve(self, edge_key: str) -> ActiveAlert | None:
        """条件恢复：摘掉登记并返回它（调用方据此决定是否发 ``resolved``）。"""
        return self._alerts.pop(edge_key, None)

    def resolve_all(self) -> list[ActiveAlert]:
        alerts = list(self._alerts.values())
        self._alerts.clear()
        return alerts

    def due_escalations(self, escalation_minutes_of: dict[str, float]) -> list[ActiveAlert]:
        """挑出到期待升级的告警并标记为已升级（每条只升级一次）。

        ``escalation_minutes_of`` 是 ``rule_key → 分钟``；缺省或 <=0 视为不升级。
        """
        now = _now()
        due: list[ActiveAlert] = []
        for alert in self._alerts.values():
            if alert.acknowledged or alert.escalated:
                continue
            minutes = float(escalation_minutes_of.get(alert.rule_key) or 0)
            if minutes <= 0:
                continue
            if now - alert.triggered_at < minutes * 60:
                continue
            alert.escalated = True
            due.append(alert)
        return due

    def snapshot(self) -> list[dict[str, Any]]:
        """对外视图（``GET /notifications/alerts/active``）。"""
        now = _now()
        return [
            {
                "ruleId": alert.rule_key,
                "entityId": alert.entity_id,
                "level": alert.level,
                "message": alert.message,
                "acknowledged": alert.acknowledged,
                "escalated": alert.escalated,
                "ageSeconds": round(max(0.0, now - alert.triggered_at)),
            }
            for alert in sorted(self._alerts.values(), key=lambda item: item.triggered_at)
        ]


__all__ = ["AlertLifecycle"]
