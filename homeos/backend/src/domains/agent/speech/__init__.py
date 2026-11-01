"""智能管家语音子系统。

把一段回复文本变成可播放的音频 URL：文本规范化 → 缓存键 → HMAC 签名 URL →
命中原生合成结果或按需合成（edge-tts / OpenAI 兼容）→ 磁盘缓存回读。

设计要点（对齐编译产物 ``dist/modules/agent/tts``）：

- **签发与合成解耦**：``chat`` 只签 URL（纯计算，微秒级），真正的合成发生在
  浏览器 ``GET /agent/tts/audio/{key}`` 时才做。这样对话永远不会因为上游 TTS
  慢或不可用而变慢，前端拿不到音频时静默回落本机播报。
- **合成失败的代价可承受**：连续失败 3 次打开熔断 5 分钟，期间不再签发 URL，
  前端直接走既有播报链路。
- **待合成参数落盘**：签名 URL 活 10 分钟，可能横跨进程重启；参数写 sidecar
  文件而不是进程内字典，重启后旧 URL 仍可合成。
"""

from __future__ import annotations

from .service import TtsService, TtsSynthesisError, TtsUrlResult
from .text_normalizer import build_ssml, escape_xml, normalize_for_speech

__all__ = [
    "TtsService",
    "TtsSynthesisError",
    "TtsUrlResult",
    "build_ssml",
    "escape_xml",
    "normalize_for_speech",
]
