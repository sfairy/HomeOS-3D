"""智能音箱域：配对授权 + 唤醒词网关。

对齐参考实现的 ``agent/voice-device.service`` / ``voice-wake-word.service`` /
``wake-word-config.service`` 三个模块，但按本项目「SQLAlchemy + 应用配置」的形态重写：

- :class:`VoiceDeviceService`：一次性配对码 → 设备凭证 → 15 分钟访问令牌的完整生命周期；
  以及「允许语音加唤醒词」「默认推送接收人」两项按音箱的授权。
- :class:`WakeWordGateway`：唤醒词的真源在**音箱网关**（部署时配置），本项目只做
  带版本 CAS 的读写与本地镜像；网关未配置时明确报 503，而不是静默写本地配置。
- :func:`parse_notify_member_ids`：``notifyMemberIds`` 列的解析（去重 + 丢非字符串）。
"""

from .service import (
    VoiceDeviceError,
    VoiceDeviceService,
    parse_notify_member_ids,
)
from .wake_words import WakeWordError, WakeWordGateway

__all__ = [
    "VoiceDeviceError",
    "VoiceDeviceService",
    "WakeWordError",
    "WakeWordGateway",
    "parse_notify_member_ids",
]
