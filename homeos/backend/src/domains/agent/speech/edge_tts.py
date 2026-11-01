"""edge-tts 客户端：不依赖第三方包，直接用 ``websockets`` 说微软的合成协议。

协议三步：

1. 连 ``wss://…/edge/v1?TrustedClientToken=…&Sec-MS-GEC=…&Sec-MS-GEC-Version=…&ConnectionId=…``
   （``Sec-MS-GEC`` 见 :mod:`drm`，300 秒一格，过期即 403）；
2. 先发 ``Path:speech.config``（声明输出格式），再发 ``Path:ssml``（真正要念的文本）；
3. 收二进制帧：头 2 字节是大端头长，随后是文本头，头里含 ``Path:audio`` 的帧负载即音频；
   收到文本帧且含 ``Path:turn.end`` 表示合成结束。

端点与令牌版本都可能随云端调整，两者都做成可覆盖：环境变量优先，代码里保留一组
「已知可用」的候选，按顺序尝试，成功过的组合在进程内记住，下次先用它。

2026-11 的 403 排查结论（三条缺一不可，任何一条不对都是握手阶段 403，不是合成报错）：

- 端点：只有 ``speech.platform.bing.com`` 能握手，``api.msedgeservices.com`` 恒定 403；
- 令牌：只认版本 2（``2-<Chromium 完整版本>``），版本 1 已被淘汰；
- UA：必须 ``Chrome/<主版本>.0.0.0 … Edg/<主版本>.0.0.0``（带 ``Edg/`` 且只到主版本），
  写成完整版本号或 ``Ed/`` 都会 403 —— 与令牌版本的主版本别搞混。
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from collections.abc import Mapping
from typing import Any

from .drm import (
    CHROMIUM_MAJOR_VERSION,
    OBFUSCATED_GEC_VERSION,
    PLAIN_GEC_VERSION,
    TRUSTED_CLIENT_TOKEN,
    generate_muid,
    obfuscated_gec_token,
    plain_gec_token,
)
from .text_normalizer import build_ssml

logger = logging.getLogger("homeos.agent.tts.edge")

#: 首选端点（经典 Edge 朗读入口）；2026-11 实测唯一可握手的入口
ENDPOINT_PRIMARY = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1"
#: 备选端点（Azure 边缘新入口）；2026-11 起握手恒定 403，只能靠环境变量显式启用
ENDPOINT_FALLBACK = "wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1"

#: 端点覆盖入口（逗号分隔可覆盖整张候选表）
ENDPOINT_ENV = "AGENT_TTS_EDGE_ENDPOINT"
#: 令牌版本覆盖入口（逗号分隔；缺省只用服务端当前认可的版本 2）
VERSION_ENV = "AGENT_TTS_EDGE_GEC_VERSION"

#: 浏览器扩展的 Origin：服务端会校验它，缺了直接 403
ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold"

#: 握手 UA：**主版本号 + ``Edg/``** 是关键。完整版本号（``143.0.3650.75``）或拼错的
#: ``Ed/`` 都会被判成非 Edge 浏览器而 403，即使 token 完全正确。
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    f"(KHTML, like Gecko) Chrome/{CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 "
    f"Edg/{CHROMIUM_MAJOR_VERSION}.0.0.0"
)

#: 输出格式：24kHz / 48kbps 单声道 mp3，体积与清晰度的常用折中
OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3"

#: 单次合成的整体超时（连接 + 合成）。参考实现用 6 秒
SYNTHESIS_TIMEOUT_SECONDS = 6.0
#: 握手超时
OPEN_TIMEOUT_SECONDS = 5.0
#: 首帧之前的静默兜底（防止云端不关闭连接也不发数据）
FIRST_FRAME_TIMEOUT_SECONDS = 4.0

#: 令牌版本 → 生成函数
_GEC_GENERATORS = {
    PLAIN_GEC_VERSION: plain_gec_token,
    OBFUSCATED_GEC_VERSION: obfuscated_gec_token,
}


class EdgeTtsError(RuntimeError):
    """edge-tts 合成失败（网络 / 403 / 空音频）。"""


def default_endpoints() -> tuple[str, ...]:
    """候选端点：环境变量覆盖优先，否则只用首选端点。"""
    override = str(os.environ.get(ENDPOINT_ENV, "") or "").strip()
    if override:
        return tuple(item.strip() for item in override.split(",") if item.strip())
    return (ENDPOINT_PRIMARY,)


def default_versions() -> tuple[str, ...]:
    """候选令牌版本：只留版本 2（版本 1 已被服务端淘汰，试了也是白等一次 403）。"""
    override = str(os.environ.get(VERSION_ENV, "") or "").strip()
    if override:
        allowed = tuple(item.strip() for item in override.split(",") if item.strip() in _GEC_GENERATORS)
        if allowed:
            return allowed
    return (OBFUSCATED_GEC_VERSION,)


def _audio_payload(frame: bytes) -> bytes:
    """从二进制帧里取出音频负载；不是音频帧时返回空。"""
    if len(frame) < 2:
        return b""
    header_len = int.from_bytes(frame[:2], "big")
    if len(frame) < 2 + header_len:
        return b""
    header = frame[2 : 2 + header_len].decode("utf-8", "ignore")
    if "Path:audio" not in header:
        return b""
    return frame[2 + header_len :]


def _speech_config_message() -> str:
    payload = {
        "context": {
            "synthesis": {
                "audio": {
                    "metadataoptions": {"sentenceBoundaryEnabled": "false", "wordBoundaryEnabled": "false"},
                    "outputFormat": OUTPUT_FORMAT,
                }
            }
        }
    }
    return (
        "Content-Type:application/json;charset=utf-8\r\nPath:speech.config\r\n\r\n"
        f"{json.dumps(payload, ensure_ascii=False)}\r\n"
    )


def _ssml_message(ssml: str) -> str:
    request_id = uuid.uuid4().hex
    return f"X-RequestId:{request_id}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n{ssml}"


class EdgeTtsProvider:
    """无状态合成器；唯一的进程内状态是「上次成功的端点 + 令牌版本」。"""

    id = "edge"

    def __init__(self, *, env: Mapping[str, str] | None = None, timeout: float = SYNTHESIS_TIMEOUT_SECONDS) -> None:
        self._env = env if env is not None else os.environ
        self._timeout = max(1.0, float(timeout))
        self._preferred: tuple[str, str] | None = None

    # —— 候选组合 ——
    def _variants(self) -> list[tuple[str, str]]:
        variants = [(endpoint, version) for endpoint in default_endpoints() for version in default_versions()]
        if self._preferred in variants:
            variants.remove(self._preferred)
            variants.insert(0, self._preferred)
        return variants

    def _build_uri(self, endpoint: str, version: str) -> str:
        token = _GEC_GENERATORS[version]()
        connection_id = uuid.uuid4().hex
        separator = "&" if "?" in endpoint else "?"
        return (
            f"{endpoint}{separator}TrustedClientToken={TRUSTED_CLIENT_TOKEN}"
            f"&Sec-MS-GEC={token}&Sec-MS-GEC-Version={version}&ConnectionId={connection_id}"
        )

    @staticmethod
    def _headers() -> dict[str, str]:
        return {
            "Pragma": "no-cache",
            "Cache-Control": "no-cache",
            "User-Agent": USER_AGENT,
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            # 扩展每次握手都会带一个随机 MUID；缺了会被当成异常客户端
            "Cookie": f"muid={generate_muid()};",
        }

    # —— 合成 ——
    async def synthesize(
        self,
        text: str,
        *,
        voice: str,
        rate: int = 0,
        pitch: int = 0,
        lang: str = "zh-CN",
    ) -> bytes:
        """把文本合成为 mp3 字节；全部候选都失败时抛 :class:`EdgeTtsError`。"""
        from websockets.asyncio.client import connect
        from websockets.typing import Origin

        ssml = build_ssml(text, voice=voice, rate=rate, pitch=pitch, lang=lang)
        failures: list[str] = []
        for endpoint, version in self._variants():
            try:
                audio = await self._attempt(connect, Origin, endpoint, version, ssml)
            except Exception as exc:
                failures.append(f"{endpoint}@{version}: {type(exc).__name__} {exc}")
                logger.debug("edge-tts 候选失败 %s@%s: %s", endpoint, version, exc)
                continue
            if audio:
                self._preferred = (endpoint, version)
                return audio
            failures.append(f"{endpoint}@{version}: 空音频")
        raise EdgeTtsError("edge-tts 合成失败：" + "；".join(failures[:3]))

    async def _attempt(self, connect: Any, origin_type: Any, endpoint: str, version: str, ssml: str) -> bytes:
        """单次尝试：握手 → 发两帧 → 收音频。"""
        async with asyncio.timeout(self._timeout):
            async with connect(
                self._build_uri(endpoint, version),
                additional_headers=self._headers(),
                origin=origin_type(ORIGIN),
                open_timeout=OPEN_TIMEOUT_SECONDS,
                max_size=None,
            ) as socket:
                await socket.send(_speech_config_message())
                await socket.send(_ssml_message(ssml))
                return await self._collect(socket)

    async def _collect(self, socket: Any) -> bytes:
        """读到 ``Path:turn.end`` 为止，期间拼接所有音频帧。"""
        chunks: list[bytes] = []
        while True:
            try:
                message = await asyncio.wait_for(socket.recv(), timeout=FIRST_FRAME_TIMEOUT_SECONDS)
            except TimeoutError as exc:
                if chunks:
                    # 已经拿到音频但迟迟没有 turn.end：按成功处理，避免丢掉整段语音
                    break
                raise EdgeTtsError("等待首帧超时") from exc
            if isinstance(message, str):
                if "Path:turn.end" in message:
                    break
                continue
            payload = _audio_payload(bytes(message))
            if payload:
                chunks.append(payload)
        if not chunks:
            raise EdgeTtsError("未收到音频数据")
        return b"".join(chunks)


__all__ = [
    "ENDPOINT_FALLBACK",
    "ENDPOINT_PRIMARY",
    "OUTPUT_FORMAT",
    "USER_AGENT",
    "EdgeTtsError",
    "EdgeTtsProvider",
    "default_endpoints",
    "default_versions",
]
