"""告警规则删除后刷新 watch_index（从 entity_references 拆出）。"""

from __future__ import annotations

from typing import Any


def refresh_alert_rule_watch_index(deps: dict[str, Any]) -> None:
    """注入删除路径也必须刷新 watch_index，否则已删规则仍留在内存索引里。"""
    from ...platform.core.db.models import AlertRule

    watch_index = deps.get("alert_rule_watch_index")
    if watch_index is None:
        return
    # 实体关注索引是全量的：加 limit 会让超出的规则被静默漏掉，告警触发因此丢事件。
    with deps["session_factory"]() as session:
        remaining_rules = session.query(AlertRule).filter(AlertRule.enabled.is_(True)).all()
    watch_index.update_from_rules([{"entityId": rule.entity_id, "enabled": rule.enabled} for rule in remaining_rules])
