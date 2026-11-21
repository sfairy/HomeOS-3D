"""DeepSeek LLM 提供商。"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import httpx

from ..shared_http import shared_http_client
from ....platform.core.http.errors import BusinessException, ErrorCode, api_error

logger = logging.getLogger("homeos.agent.llm.deepseek")

from .llm_provider_interface import (
    LlmChatOptions,
    LlmChatResult,
    LlmMessage,
    LlmProvider,
    LlmToolCall,
    LlmToolSchema,
    LlmUsage,
)

_DEFAULT_MODEL = "deepseek-chat"
_DEFAULT_BASE_URL = "https://api.deepseek.com"

#: 网络超时（秒）：连接/写入/取连接池都短；读取给足 LLM 生成时间。
#: 无超时时一次上游卡死会让整轮 tool-calling 永久挂起，故必须设置。
LLM_CONNECT_TIMEOUT = 10.0
LLM_READ_TIMEOUT = 60.0
LLM_WRITE_TIMEOUT = 15.0
LLM_POOL_TIMEOUT = 10.0

#: 最大重试次数（不含首次请求）
LLM_MAX_RETRIES = 2
#: 重试退避基数（秒）：第 n 次重试等待 ``base * n``
LLM_RETRY_BACKOFF_SECONDS = 0.6

#: 可重试的 HTTP 状态码（其余 4xx 属于请求本身错误，重试无意义）
RETRYABLE_STATUS_CODES = frozenset({408, 425, 429})


class RetryableUpstreamError(Exception):
    """可重试的上游错误（超时 / 连接失败 / 408 / 429 / 5xx）。

    仅在 ``chat`` 内部用于驱动重试；重试耗尽后统一归一化为 BusinessException。
    """

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class _StreamOptionsRejected(Exception):
    """上游不认识 ``stream_options``（OpenAI 扩展字段）——去掉它重发一次即可。"""


def safe_parse(raw: str | None) -> dict[str, Any]:
    """容错解析 LLM 返回的 tool_call arguments 字符串。

    解析失败时返回空对象，避免单个调用 JSON 非法导致整轮对话崩溃。
    """
    try:
        parsed = json.loads(raw or "{}")
    except (ValueError, TypeError):  # fmt: skip - 括号不能省，Cython 会把 PEP 758 形式误解析
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _to_openai_messages(messages: list[LlmMessage]) -> list[dict[str, Any]]:
    """把内部消息转换为 OpenAI 风格消息体。"""
    out: list[dict[str, Any]] = []
    for message in messages:
        if message.role == "assistant" and message.tool_calls:
            out.append(
                {
                    "role": "assistant",
                    "content": message.content or "",
                    "tool_calls": [
                        {
                            "id": call.id,
                            "type": "function",
                            "function": {
                                "name": call.name,
                                "arguments": json.dumps(call.arguments, ensure_ascii=False),
                            },
                        }
                        for call in message.tool_calls
                    ],
                }
            )
            continue
        if message.role == "tool":
            out.append(
                {
                    "role": "tool",
                    "tool_call_id": message.tool_call_id,
                    "content": message.content,
                }
            )
            continue
        out.append({"role": message.role, "content": message.content})
    return out


def _to_openai_tools(tools: list[LlmToolSchema]) -> list[dict[str, Any]]:
    """把工具 schema 转换为 OpenAI function tool 描述。"""
    return [
        {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters,
            },
        }
        for tool in tools
    ]


def _parse_usage(raw: Any) -> LlmUsage | None:
    """解析 usage 字段（含 prompt 缓存命中 token）。"""
    if not isinstance(raw, dict):
        return None
    details = raw.get("prompt_tokens_details")
    cached = raw.get("prompt_cache_hit_tokens")
    if cached is None and isinstance(details, dict):
        cached = details.get("cached_tokens")
    return LlmUsage(
        prompt_tokens=raw.get("prompt_tokens") or 0,
        completion_tokens=raw.get("completion_tokens") or 0,
        cached_tokens=cached or 0,
    )


class DeepseekLlmProvider(LlmProvider):
    """DeepSeek LLM 提供商。

    由 ResolvingLlmProvider 在配置了真实 API Key 时创建 / 更新。
    """

    @property
    def name(self) -> str:
        """提供商名：取配置里的 ``provider``（同为 OpenAI 兼容协议的不同厂商）。"""
        return self._provider_name

    @property
    def model(self) -> str:
        """当前使用的模型名（供 ping / 成本展示）。"""
        return self.model_name

    def __init__(
        self,
        cfg: dict[str, Any] | None = None,
    ) -> None:
        cfg = cfg or {}
        self._provider_name: str = str(cfg.get("provider") or "deepseek")
        self.api_key: str = cfg.get("apiKey") or cfg.get("api_key") or ""
        self.model_name: str = cfg.get("model") or _DEFAULT_MODEL
        self.base_url: str = cfg.get("baseUrl") or cfg.get("base_url") or _DEFAULT_BASE_URL

    def update_config(self, cfg: dict[str, Any] | None = None) -> None:
        """配置热更新（app.config.updated 后重建时使用）。"""
        cfg = cfg or {}
        self._provider_name = str(cfg.get("provider") or self._provider_name or "deepseek")
        self.api_key = cfg.get("apiKey") or cfg.get("api_key") or ""
        self.model_name = cfg.get("model") or _DEFAULT_MODEL
        self.base_url = cfg.get("baseUrl") or cfg.get("base_url") or _DEFAULT_BASE_URL

    def is_ready(self) -> bool:
        """是否就绪：API Key 非空即视为就绪。"""
        return len(self.api_key) > 0

    async def chat(
        self,
        messages: list[LlmMessage],
        tools: list[LlmToolSchema],
        opts: LlmChatOptions | None = None,
    ) -> LlmChatResult:
        """调用 DeepSeek 对话接口（显式超时 + 有限重试）。

        :raises BusinessException: CONFIG_ERROR（未配置）/ EXTERNAL_ERROR（上游错误 / 响应非法）
        """
        if not self.is_ready():
            raise BusinessException(ErrorCode.CONFIG_ERROR, api_error("AGENT_LLM_NOT_CONFIGURED"))

        streaming = bool(opts and opts.on_token)
        payload, headers, timeout = self._build_request(messages, tools, streaming)
        on_token = opts.on_token if opts else None

        for attempt in range(LLM_MAX_RETRIES + 1):
            # 流式重试保护：已经吐出的 token 无法回滚，重试会重复播报。
            # ``emitted`` 每次尝试独立；用默认参数绑定，避免闭包捕获循环变量（ruff B023）。
            emitted = [False]

            def _on_token(text: str, _emitted: list[bool] = emitted) -> None:
                _emitted[0] = True
                if on_token is not None:
                    on_token(text)

            try:
                return await self._request(payload, headers, timeout, streaming, _on_token)
            except RetryableUpstreamError as exc:
                last_attempt = attempt >= LLM_MAX_RETRIES
                if emitted[0] or last_attempt:
                    raise BusinessException(
                        ErrorCode.EXTERNAL_ERROR,
                        exc.detail or api_error("AGENT_LLM_UPSTREAM_ERROR", "unknown", ""),
                    ) from exc
                delay = LLM_RETRY_BACKOFF_SECONDS * (attempt + 1)
                logger.warning("LLM 上游异常(第%s次),%s 秒后重试: %s", attempt + 1, delay, exc.detail)
                await asyncio.sleep(delay)
            except httpx.TimeoutException as exc:
                # _request 已把 httpx 异常转换为 RetryableUpstreamError，这里仅兜底
                if attempt >= LLM_MAX_RETRIES:
                    raise BusinessException(
                        ErrorCode.EXTERNAL_ERROR,
                        api_error("AGENT_LLM_UPSTREAM_ERROR", "timeout", str(exc) or ""),
                    ) from exc
                await asyncio.sleep(LLM_RETRY_BACKOFF_SECONDS * (attempt + 1))

        # 理论不可达：循环内要么 return，要么抛错
        raise BusinessException(ErrorCode.EXTERNAL_ERROR, api_error("AGENT_LLM_UPSTREAM_ERROR", "unknown", ""))

    def _build_request(
        self,
        messages: list[LlmMessage],
        tools: list[LlmToolSchema],
        streaming: bool,
    ) -> tuple[dict[str, Any], dict[str, str], httpx.Timeout]:
        """组装上游请求：payload / 请求头 / 超时。

        单独成方法是为了让 ``chat`` 的循环只关心「发一次 + 失败怎么退避」，而不是
        混着字段拼装 —— 两者各自都不长，合起来会让重试逻辑难以一眼看清。
        """
        payload: dict[str, Any] = {
            "model": self.model_name,
            "messages": _to_openai_messages(messages),
        }
        openai_tools = _to_openai_tools(tools)
        if openai_tools:
            payload["tools"] = openai_tools
            payload["tool_choice"] = "auto"
        payload["temperature"] = 0.3
        payload["stream"] = streaming
        if streaming:
            # OpenAI 兼容协议里，流式响应默认不带 usage；不显式要求 include_usage 时，
            # 上游最后一个 chunk 只有 finish_reason，token 计数与费用会全部记成 0，
            # 日预算 / 设置页「今日用量」随之失效（SSE 是主对话链路，影响面最大）。
            payload["stream_options"] = {"include_usage": True}
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        timeout = httpx.Timeout(
            connect=LLM_CONNECT_TIMEOUT,
            read=LLM_READ_TIMEOUT,
            write=LLM_WRITE_TIMEOUT,
            pool=LLM_POOL_TIMEOUT,
        )
        return payload, headers, timeout

    async def _request(
        self,
        payload: dict[str, Any],
        headers: dict[str, str],
        timeout: httpx.Timeout,
        streaming: bool,
        on_token: Any,
    ) -> LlmChatResult:
        """发起一次上游请求。

        - 网络层异常（超时 / 连接失败）→ RetryableUpstreamError
        - 408 / 429 / 5xx → RetryableUpstreamError
        - 其余 >=400 → BusinessException（不可重试）

        ``stream_options`` 是 OpenAI 的扩展字段：极少数兼容实现会直接 400。
        这里识别该字段被拒的情况后去掉它重发一次 —— 拿不到 usage 总比整轮对话失败好。
        """
        try:
            return await self._send_once(payload, headers, timeout, streaming, on_token)
        except _StreamOptionsRejected:
            logger.info("上游不接受 stream_options，已去掉后重试（本轮无 usage）")
            fallback = {key: value for key, value in payload.items() if key != "stream_options"}
            return await self._send_once(fallback, headers, timeout, streaming, on_token)

    async def _send_once(
        self,
        payload: dict[str, Any],
        headers: dict[str, str],
        timeout: httpx.Timeout,
        streaming: bool,
        on_token: Any,
    ) -> LlmChatResult:
        """真正发一次请求；仅把「stream_options 不被接受」单独分类，其余照旧。"""
        url = f"{self.base_url}/chat/completions"
        # 复用进程级连接池；超时按请求传入，保持每个调用方各自的超时语义。
        client = shared_http_client()
        try:
            if streaming:
                async with client.stream("POST", url, headers=headers, json=payload, timeout=timeout) as resp:
                    if resp.status_code >= 400:
                        text = (await resp.aread()).decode(errors="replace")
                        self._raise_upstream(resp.status_code, text, payload)
                    return await self._consume_chat_stream(resp, on_token)

            resp = await client.post(url, headers=headers, json=payload, timeout=timeout)
        except httpx.TimeoutException as exc:
            raise RetryableUpstreamError(api_error("AGENT_LLM_UPSTREAM_ERROR", "timeout", str(exc) or "")) from exc
        except httpx.TransportError as exc:
            raise RetryableUpstreamError(api_error("AGENT_LLM_UPSTREAM_ERROR", "network", str(exc) or "")) from exc
        if resp.status_code >= 400:
            # 对齐 Nest：截断上游错误正文，避免超长 message 污染响应
            self._raise_upstream(resp.status_code, resp.text, payload)
        try:
            data = resp.json()
        except ValueError:
            data = None

        return self._parse_completion(data)

    @staticmethod
    def _raise_upstream(status_code: int, text: str, payload: dict[str, Any]) -> None:
        """按状态码抛错；stream_options 被 4xx 拒绝时抛专用异常供上层重试。"""
        if status_code in (400, 422) and "stream_options" in payload and "stream_options" in str(text or "").lower():
            raise _StreamOptionsRejected()
        raise DeepseekLlmProvider._upstream_error(status_code, str(text or "")[:300])

    @staticmethod
    def _upstream_error(status_code: int, detail: str) -> Exception:
        """构造上游错误：可重试状态码返回 RetryableUpstreamError，其余返回 BusinessException。"""
        message = api_error("AGENT_LLM_UPSTREAM_ERROR", status_code, detail)
        if status_code in RETRYABLE_STATUS_CODES or status_code >= 500:
            return RetryableUpstreamError(message)
        return BusinessException(ErrorCode.EXTERNAL_ERROR, message)

    @staticmethod
    def _parse_completion(data: Any) -> LlmChatResult:
        """解析非流式响应。"""
        choices = data.get("choices") if isinstance(data, dict) else None
        message = choices[0].get("message") if choices and isinstance(choices[0], dict) else None
        if not isinstance(message, dict):
            raise BusinessException(ErrorCode.EXTERNAL_ERROR, api_error("AGENT_LLM_RESPONSE_INVALID"))

        usage = _parse_usage(data.get("usage") if isinstance(data, dict) else None)
        raw_calls = message.get("tool_calls")
        if raw_calls:
            return LlmChatResult(
                content=message.get("content"),
                usage=usage,
                tool_calls=[
                    LlmToolCall(
                        id=call.get("id") or "",
                        name=(call.get("function") or {}).get("name") or "",
                        arguments=safe_parse((call.get("function") or {}).get("arguments")),
                    )
                    for call in raw_calls
                ],
            )
        return LlmChatResult(content=message.get("content") or "", usage=usage)

    @staticmethod
    async def _consume_chat_stream(resp: Any, on_token: Any) -> LlmChatResult:
        """消费 OpenAI 风格 SSE 流，边回调 token 边累积工具调用。"""
        content = ""
        tool_acc: dict[int, dict[str, str]] = {}
        usage: LlmUsage | None = None

        def flush_line(line: str) -> None:
            nonlocal content, usage
            trimmed = line.strip()
            if not trimmed.startswith("data:"):
                return
            raw = trimmed[5:].strip()
            if not raw or raw == "[DONE]":
                return
            try:
                payload = json.loads(raw)
            except ValueError:
                return
            if not isinstance(payload, dict):
                return
            choices = payload.get("choices")
            delta = choices[0].get("delta") if choices and isinstance(choices[0], dict) else None
            if isinstance(delta, dict):
                chunk = delta.get("content")
                if chunk:
                    content += chunk
                    on_token(chunk)
                for call in delta.get("tool_calls") or []:
                    index = call.get("index", 0)
                    prev = tool_acc.setdefault(index, {"id": "", "name": "", "arguments": ""})
                    if call.get("id"):
                        prev["id"] = call["id"]
                    function = call.get("function") or {}
                    if function.get("name"):
                        prev["name"] += function["name"]
                    if function.get("arguments"):
                        prev["arguments"] += function["arguments"]
            if payload.get("usage"):
                usage = _parse_usage(payload.get("usage"))

        async for line in resp.aiter_lines():
            flush_line(line)

        # 按 index 排序：并行工具调用可能乱序到达，执行顺序需与模型给出的序号一致
        tool_calls = [
            LlmToolCall(id=item["id"] or item["name"], name=item["name"], arguments=safe_parse(item["arguments"]))
            for _index, item in sorted(tool_acc.items())
            if item["name"]
        ]
        if tool_calls:
            return LlmChatResult(content=content or None, usage=usage, tool_calls=tool_calls)
        return LlmChatResult(content=content, usage=usage)
