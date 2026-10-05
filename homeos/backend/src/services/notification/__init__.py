"""通知域（notification）：通知查询/统计/偏好/告警规则。

对齐 Nest ``modules/notification``，对外暴露 ``/api/v1/notifications/*``。
"""

from .service import ALERT_EDGE_REDIS_KEY, NotificationService

__all__ = ["NotificationService", "ALERT_EDGE_REDIS_KEY"]
