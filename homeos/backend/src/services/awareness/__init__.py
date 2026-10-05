"""感知域（``modules/awareness`` 的 Python 等价实现）。

当前覆盖：
- 语音告警目录 / 规则归一化 / 模板（``voice-alert.util``）；
- 语音命令解析与执行规划（``voice-command.util``）；
- STT 转写与 HA Assist 对话（``voice-stt.helper``）；
- 语音命令执行（``voice-command-execute.helper``）；
- TTS 统一播报（``ha-connector/tts-speak.service``）；
- 语音服务聚合（``VoiceService``）与智能顾问设备用量统计（``SmartAdvisorUsage``）。
"""

from __future__ import annotations

from .advisor_usage import AdvisorUsageService, SmartAdvisorUsageHelper
from .tts_speak import TtsSpeakService
from .voice_alerts import (
    VOICE_ALERT_CATALOG,
    normalize_wake_words,
    resolve_voice_alert_rules,
)
from .voice_commands import (
    DEFAULT_WHOLE_HOME_VOICE_COMMANDS,
    extract_room_from_text,
    plan_voice_commands,
)
from .voice_service import VoiceService

__all__ = [
    "DEFAULT_WHOLE_HOME_VOICE_COMMANDS",
    "VOICE_ALERT_CATALOG",
    "AdvisorUsageService",
    "SmartAdvisorUsageHelper",
    "TtsSpeakService",
    "VoiceService",
    "extract_room_from_text",
    "normalize_wake_words",
    "plan_voice_commands",
    "resolve_voice_alert_rules",
]
