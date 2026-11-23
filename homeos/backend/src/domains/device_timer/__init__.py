"""设备倒计时域。"""

from __future__ import annotations

from .service import ALLOWED_SERVICES, MAX_SECONDS, DeviceTimerService, validate_timer_request

__all__ = ["ALLOWED_SERVICES", "MAX_SECONDS", "DeviceTimerService", "validate_timer_request"]
