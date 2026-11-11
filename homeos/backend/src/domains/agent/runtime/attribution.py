"""控制来源归因（App / 3D 面板 → 管家时序）。

智能管家把状态翻转归因为「手动操作」还是「外部设备」，靠的是下发前后打标记。三条控制
入口（``/services/call``、``/ha/services/call``、``/modules/interaction3d/control``）必须
**都**打，否则最常见的实体卡片点击会被记成外部变化，时序里就会出现「没人动过灯却变了」。

标记本身是旁路观测：时序服务未装配或打标记失败时静默跳过，绝不能影响控制结果。
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("homeos.agent.attribution")


def mark_local_control(app_state: Any, entity_id: str) -> None:
    """把一次本机下发标记成「手动操作」（失败只记 debug）。"""
    if not entity_id:
        return
    timeline = getattr(app_state, "agent_timeline", None)
    marker = getattr(timeline, "mark_local_control", None)
    if not callable(marker):
        return
    try:
        marker(entity_id)
    except Exception:  # 归因属旁路观测：失败不能影响控制结果
        logger.debug("本地控制归因标记失败: %s", entity_id, exc_info=True)


def mark_local_control_for_request(request: Any, entity_id: str) -> None:
    """``mark_local_control`` 的请求版本（从 ``request.app.state`` 取时序服务）。"""
    app = getattr(request, "app", None)
    mark_local_control(getattr(app, "state", None), entity_id)


__all__ = ["mark_local_control", "mark_local_control_for_request"]
