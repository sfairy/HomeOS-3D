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

**慢，而不是断**：这条链路的常见故障是「握手成功但首帧再也不来」，而不是快速报错。
顺序重试在这种情况下毫无意义 —— 用户要先白等一整个超时（实测 6 秒的超时被取消时的
close 握手拖成 16 秒）才轮到第二次。因此：首发 ``HEDGE_DELAY_SECONDS`` 内没有结果就
并发补发一次，取先回来的（:meth:`EdgeTtsProvider._hedged`）；整体再由
``TOTAL_BUDGET_SECONDS`` 封顶，保证任何一个音频请求都不会挂几十秒。

明确拒绝（401/403）**不**对冲：同样的请求再发一次结果一样，退避重试才有意义。
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from collections.abc import Awaitable, Callable, Mapping
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
#: 代理覆盖入口；留空时交给 ``websockets`` 按 ``HTTPS_PROXY`` / ``ALL_PROXY`` 自行判断
PROXY_ENV = "AGENT_TTS_EDGE_PROXY"

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
#: 发帧超时：TLS 写同样会卡住，不能只靠外层兜底
SEND_TIMEOUT_SECONDS = 3.0
#: 单次合成的重试轮数。跨境链路偶发丢包时重试一次比让整轮对话失声划算
RETRY_ATTEMPTS = 2
#: 重试之间的退避（秒）；用户正在等这句话，只做短退避
RETRY_BACKOFF_SECONDS = 0.3
#: 对冲延迟：首发这么久还没结果，就并发补发一次，谁先回来用谁
HEDGE_DELAY_SECONDS = 2.5
#: 单个候选最多并发几次（含首发）。只补一次：再差也还有外层重试
HEDGE_ATTEMPTS = 2
#: 取消慢任务时的等待上限。取消握手本身也可能卡住，死等会把对冲省下的时间赔回去
CANCEL_GRACE_SECONDS = 0.5
#: 单次合成的总预算（跨候选 / 对冲 / 重试），保证接口不会挂着等几十秒
TOTAL_BUDGET_SECONDS = 14.0

#: 令牌版本 → 生成函数
_GEC_GENERATORS = {
    PLAIN_GEC_VERSION: plain_gec_token,
    OBFUSCATED_GEC_VERSION: obfuscated_gec_token,
}


class EdgeTtsError(RuntimeError):
    """edge-tts 合成失败（网络 / 403 / 空音频）。"""


def _consume_exception(task: asyncio.Task[Any]) -> None:
    """消费掉任务的异常，避免被丢弃的对冲任务刷 "Task exception was never retrieved"。"""
    if task.cancelled():
        return
    task.exception()


def _settle(task: asyncio.Task[bytes]) -> bytes | Exception:
    """从已完成的任务里取出音频；失败时把异常交回，由调用方决定要不要再来一次。"""
    if task.cancelled():
        return EdgeTtsError("尝试被取消")
    error = task.exception()
    if error is not None:
        # CancelledError 是 BaseException，换成普通异常，别让它穿透到 HTTP 层取消整个请求
        return error if isinstance(error, Exception) else EdgeTtsError(str(error))
    audio = task.result()
    if audio:
        return audio
    return EdgeTtsError("空音频")


async def _cancel_all(tasks: set[asyncio.Task[Any]]) -> None:
    """取消仍在跑的任务，但只做有限等待。

    取消时的 close 握手本身也可能卡住（实测把 6 秒的超时拖成 16 秒），死等它会把
    对冲省下的时间又赔回去。没能在宽限期内收尾的任务交给事件循环回收。
    """
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.wait(tasks, timeout=CANCEL_GRACE_SECONDS)


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
        try:
            # 总预算兜住「取消握手又卡 10 秒」这类连环等待：单次超时管不住整体时长
            async with asyncio.timeout(TOTAL_BUDGET_SECONDS):
                for attempt in range(RETRY_ATTEMPTS):
                    if attempt:
                        await asyncio.sleep(RETRY_BACKOFF_SECONDS * attempt)
                    for endpoint, version in self._variants():
                        try:
                            audio = await self._hedged(
                                # 默认参数绑定当轮的 endpoint/version：缺了会闭包捕获循环变量
                                lambda ep=endpoint, ver=version: self._attempt(connect, Origin, ep, ver, ssml)
                            )
                        except Exception as exc:
                            failures.append(f"{endpoint}@{version}: {type(exc).__name__} {exc}")
                            logger.debug("edge-tts 候选失败 %s@%s: %s", endpoint, version, exc)
                            continue
                        if audio:
                            self._preferred = (endpoint, version)
                            return audio
                        failures.append(f"{endpoint}@{version}: 空音频")
        except TimeoutError as exc:
            raise EdgeTtsError(f"edge-tts 合成超过总预算 {TOTAL_BUDGET_SECONDS}s") from exc
        # 重试会把同一条错误重复记下来，去重后再截断，别让 503 的文案自己刷屏
        raise EdgeTtsError("edge-tts 合成失败：" + "；".join(list(dict.fromkeys(failures))[:3]))

    async def _hedged(self, attempt: Callable[[], Awaitable[bytes]]) -> bytes:
        """先只发一次；``HEDGE_DELAY_SECONDS`` 内没有结果就并发补发一次，谁先回来用谁。

        这条链路的故障形态是「握手 / 首帧无响应」，不是「快速报错」：只做顺序重试的话，
        用户得先白等一整个超时（实测 16 秒）才轮到第二次。对冲把最坏等待压到
        「对冲延迟 + 一次正常合成」。

        快速报错（401/403）**不**对冲 —— 那是明确拒绝，同样的请求再发一次结果一样，
        交给上层重试循环决定要不要退避重来。
        """
        in_flight: set[asyncio.Task[bytes]] = set()
        failures: list[Exception] = []

        def start() -> None:
            task = asyncio.create_task(attempt())
            task.add_done_callback(_consume_exception)
            in_flight.add(task)

        start()
        hedged = False
        try:
            while in_flight:
                done, _ = await asyncio.wait(
                    in_flight,
                    # 还没对冲过就只等一个对冲窗口，之后一直等到有人完成（由总预算兜底）
                    timeout=None if hedged else HEDGE_DELAY_SECONDS,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in done:
                    in_flight.discard(task)
                    outcome = _settle(task)
                    if isinstance(outcome, bytes):
                        return outcome
                    failures.append(outcome)
                if done:
                    continue
                if hedged:
                    # 两个都在冲且已过对冲窗口：不再干等，交给上层决定重试
                    failures.append(EdgeTtsError("合成超时"))
                    break
                hedged = True
                logger.debug("edge-tts 首发 %.1fs 无响应,并发补发一次", HEDGE_DELAY_SECONDS)
                start()
        finally:
            await _cancel_all(in_flight)
        if failures:
            raise failures[-1]
        raise EdgeTtsError("合成未产生结果")

    def _connect_extra(self) -> dict[str, Any]:
        """显式配置了代理才传 ``proxy``，否则交给 ``websockets`` 读标准代理环境变量。"""
        proxy = str(self._env.get(PROXY_ENV, "") or "").strip()
        return {"proxy": proxy} if proxy else {}

    async def _attempt(self, connect: Any, origin_type: Any, endpoint: str, version: str, ssml: str) -> bytes:
        """单次尝试：握手 → 发两帧 → 收音频。"""
        async with asyncio.timeout(self._timeout):
            async with connect(
                self._build_uri(endpoint, version),
                additional_headers=self._headers(),
                origin=origin_type(ORIGIN),
                open_timeout=OPEN_TIMEOUT_SECONDS,
                max_size=None,
                **self._connect_extra(),
            ) as socket:
                # TLS 写同样会卡住，单独设超时，别指望外层兜底能及时收场
                await asyncio.wait_for(socket.send(_speech_config_message()), SEND_TIMEOUT_SECONDS)
                await asyncio.wait_for(socket.send(_ssml_message(ssml)), SEND_TIMEOUT_SECONDS)
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
    "HEDGE_DELAY_SECONDS",
    "OUTPUT_FORMAT",
    "PROXY_ENV",
    "RETRY_ATTEMPTS",
    "TOTAL_BUDGET_SECONDS",
    "USER_AGENT",
    "EdgeTtsError",
    "EdgeTtsProvider",
    "default_endpoints",
    "default_versions",
]
