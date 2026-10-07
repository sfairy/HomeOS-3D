"""DeepSeek LLM 提供商。

职责：把 LlmProvider 接口适配到 DeepSeek 兼容的 OpenAI 风格 /chat/completions 接口。
 - 把 LlmMessage 转成 OpenAI 消息格式（含 tool_calls / tool 结果）
 - 把 LlmToolSchema 转成 OpenAI function tool 描述
 - 解析 choices / usage，归一化返回 LlmChatResult
 - 支持 prompt 缓存命中 token 统计（用于成本估算）
 - 显式超时 + 有限重试（超时 / 连接失败 / 408 / 429 / 5xx），避免单次上游抖动
   把整轮工具循环拖死；流式已输出 token 后不再重试，防止重复播报
依赖：llm_provider_interface（接口）、BusinessException / api_error（错误归一化）。
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import httpx

from ....core.errors import BusinessException, ErrorCode, api_error

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
#: 此前为 ``timeout=None``（无超时），一次上游卡死会让整轮 tool-calling 永久挂起。
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


def safe_parse(raw: str | None) -> dict[str, Any]:
    """容错解析 LLM 返回的 tool_call arguments 字符串。

    解析失败时返回空对象，避免单个调用 JSON 非法导致整轮对话崩溃。
    """
    try:
        parsed = json.loads(raw or "{}")
    except (ValueError, TypeError):
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

    #: 提供商名，固定为 deepseek
    name = "deepseek"

    def __init__(
        self,
        cfg: dict[str, Any] | None = None,
    ) -> None:
        cfg = cfg or {}
        self.api_key: str = cfg.get("apiKey") or cfg.get("api_key") or ""
        self.model: str = cfg.get("model") or _DEFAULT_MODEL
        self.base_url: str = cfg.get("baseUrl") or cfg.get("base_url") or _DEFAULT_BASE_URL

    def update_config(self, cfg: dict[str, Any] | None = None) -> None:
        """配置热更新（SYSTEM_CONFIG_UPDATED 后重建时使用）。"""
        cfg = cfg or {}
        self.api_key = cfg.get("apiKey") or cfg.get("api_key") or ""
        self.model = cfg.get("model") or _DEFAULT_MODEL
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

        openai_tools = _to_openai_tools(tools)
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": _to_openai_messages(messages),
        }
        if openai_tools:
            payload["tools"] = openai_tools
            payload["tool_choice"] = "auto"
        payload["temperature"] = 0.3
        streaming = bool(opts and opts.on_token)
        payload["stream"] = streaming

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        on_token = opts.on_token if opts else None
        timeout = httpx.Timeout(
            connect=LLM_CONNECT_TIMEOUT,
            read=LLM_READ_TIMEOUT,
            write=LLM_WRITE_TIMEOUT,
            pool=LLM_POOL_TIMEOUT,
        )

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
                logger.warning(
                    "LLM 上游异常(第%s次),%s 秒后重试: %s", attempt + 1, delay, exc.detail
                )
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
        raise BusinessException(
            ErrorCode.EXTERNAL_ERROR, api_error("AGENT_LLM_UPSTREAM_ERROR", "unknown", "")
        )

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
        """
        url = f"{self.base_url}/chat/completions"
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                if streaming:
                    async with client.stream(
                        "POST", url, headers=headers, json=payload
                    ) as resp:
                        if resp.status_code >= 400:
                            text = (await resp.aread()).decode(errors="replace")
                            raise self._upstream_error(resp.status_code, text[:300])
                        return await self._consume_chat_stream(resp, on_token)

                resp = await client.post(url, headers=headers, json=payload)
            except httpx.TimeoutException as exc:
                raise RetryableUpstreamError(
                    api_error("AGENT_LLM_UPSTREAM_ERROR", "timeout", str(exc) or "")
                ) from exc
            except httpx.TransportError as exc:
                raise RetryableUpstreamError(
                    api_error("AGENT_LLM_UPSTREAM_ERROR", "network", str(exc) or "")
                ) from exc
            if resp.status_code >= 400:
                # 对齐 Nest：截断上游错误正文，避免超长 message 污染响应
                raise self._upstream_error(resp.status_code, resp.text[:300])
            try:
                data = resp.json()
            except ValueError:
                data = None

        return self._parse_completion(data)

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

        tool_calls = [
            LlmToolCall(id=item["id"] or item["name"], name=item["name"], arguments=safe_parse(item["arguments"]))
            for item in tool_acc.values()
            if item["name"]
        ]
        if tool_calls:
            return LlmChatResult(content=content or None, usage=usage, tool_calls=tool_calls)
        return LlmChatResult(content=content, usage=usage)
