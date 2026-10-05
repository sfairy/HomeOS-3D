"""DeepSeek LLM 提供商。

职责：把 LlmProvider 接口适配到 DeepSeek 兼容的 OpenAI 风格 /chat/completions 接口。
 - 把 LlmMessage 转成 OpenAI 消息格式（含 tool_calls / tool 结果）
 - 把 LlmToolSchema 转成 OpenAI function tool 描述
 - 解析 choices / usage，归一化返回 LlmChatResult
 - 支持 prompt 缓存命中 token 统计（用于成本估算）
依赖：llm_provider_interface（接口）、BusinessException / api_error（错误归一化）。
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from src.core.errors import BusinessException, ErrorCode, api_error

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
        """调用 DeepSeek 对话接口。

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

        # Nest 版 fetch 无显式超时，此处保持 timeout=None 以行为一致
        async with httpx.AsyncClient(timeout=None) as client:
            if streaming and on_token is not None:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                ) as resp:
                    if resp.status_code >= 400:
                        text = (await resp.aread()).decode(errors="replace")
                        raise BusinessException(
                            ErrorCode.EXTERNAL_ERROR,
                            api_error("AGENT_LLM_UPSTREAM_ERROR", resp.status_code, text[:300]),
                        )
                    return await self._consume_chat_stream(resp, on_token)

            resp = await client.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
            )
            if resp.status_code >= 400:
                # 对齐 Nest：截断上游错误正文，避免超长 message 污染响应
                detail = resp.text[:300]
                raise BusinessException(
                    ErrorCode.EXTERNAL_ERROR,
                    api_error("AGENT_LLM_UPSTREAM_ERROR", resp.status_code, detail),
                )
            try:
                data = resp.json()
            except ValueError:
                data = None

        return self._parse_completion(data)

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
