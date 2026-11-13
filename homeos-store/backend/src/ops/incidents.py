"""事故计数的门面（实现已下沉到 ``infra.incidents``）。"""

from __future__ import annotations

from ..infra.incidents import HEALTH_DEGRADED, HEALTH_OK, KINDS, clear, note, status

__all__ = ["HEALTH_DEGRADED", "HEALTH_OK", "KINDS", "clear", "note", "status"]
