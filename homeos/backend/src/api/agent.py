"""智能管家路由（``/api/v1/agent/*``），对齐 Nest ``AgentController``。"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, model_validator

from .router import NestRouter
from ..dependencies import license_feature
from ..domains.agent.agent_actor import AgentActor
from ..domains.license import features as feature_codes
from ..platform.core.errors import BusinessException, ErrorCode
from ..platform.security.auth_context import require_user
from ..platform.security.limiter import rate_limit_authenticated

router = NestRouter(
    prefix="/agent",
    tags=["agent"],
    dependencies=[license_feature(feature_codes.FEATURE_AGENT)],
)

#: 对话限流：单用户单 IP 每 60 秒最多 N 次。
#: 一次请求最坏会跑满 MAX_ROUNDS 轮 tool-calling，按分钟级的宽松上限即可拦住
#: 「误触发唤醒词 / 客户端重试风暴」，正常对话（几秒一句）远不会命中。
_CHAT_RATE_LIMIT = 20
_CHAT_RATE_WINDOW_SECONDS = 60.0

#: 对话历史单条上限
_HISTORY_MAX = 16
#: message 最长字符数
_MESSAGE_MAX = 500
#: history[].content 最长字符数
_CONTENT_MAX = 2000
#: sessionId 最长字符数
_SESSION_ID_MAX = 64


class ChatDto(BaseModel):
    """``/agent/chat`` 请求体（校验文案与 Nest ``chat.dto.ts`` 逐字一致）。"""

    model_config = ConfigDict(extra="forbid")

    message: Any = None
    history: Any = None
    sessionId: Any = None

    @model_validator(mode="before")
    @classmethod
    def _validate_like_nest(cls, data: Any) -> Any:
        """复刻 Nest ValidationPipe 的字段校验与失败文案（首个失败即 400）。

        采用「模型级」校验，使 Pydantic 错误 ``loc`` 为空，
        从而由全局异常处理器输出与 Nest 完全一致的 message（不带 ``字段:`` 前缀）。
        """
        if not isinstance(data, dict):
            return data
        message = data.get("message")
        if not isinstance(message, str):
            raise ValueError("message 须为字符串")
        if message == "":
            raise ValueError("message 不能为空")
        if len(message) > _MESSAGE_MAX:
            raise ValueError(f"message 最长 {_MESSAGE_MAX} 字符")

        history = data.get("history")
        if history is not None:
            if not isinstance(history, list):
                raise ValueError("history 须为数组")
            if len(history) > _HISTORY_MAX:
                raise ValueError(f"history 最多 {_HISTORY_MAX} 条")
            for item in history:
                role = item.get("role") if isinstance(item, dict) else None
                content = item.get("content") if isinstance(item, dict) else None
                if role not in ("user", "assistant"):
                    raise ValueError("role 须为 user 或 assistant")
                if not isinstance(content, str):
                    raise ValueError("content 须为字符串")
                if content == "":
                    raise ValueError("content 不能为空")
                if len(content) > _CONTENT_MAX:
                    raise ValueError(f"content 最长 {_CONTENT_MAX} 字符")

        session_id = data.get("sessionId")
        if session_id is not None:
            if not isinstance(session_id, str):
                raise ValueError("sessionId 须为字符串")
            if len(session_id) > _SESSION_ID_MAX:
                raise ValueError(f"sessionId 最长 {_SESSION_ID_MAX} 字符")
        return data


def _service(request: Request):
    return request.app.state.agent_service


def _actor_from_user(user: dict[str, Any]) -> AgentActor:
    """把鉴权用户字典转为 Agent 执行身份（携带实体级 restrictions）。"""
    return AgentActor(
        restrictions=user.get("restrictions"),
        user_id=user.get("userId"),
        username=user.get("username"),
    )


def _normalized_history(dto: ChatDto) -> list[dict[str, str]]:
    history = dto.history if isinstance(dto.history, list) else []
    return [
        {"role": str(item.get("role")), "content": str(item.get("content"))}
        for item in history
        if isinstance(item, dict)
    ]


def _error_message(exc: BaseException) -> str:
    """对齐 Nest ``getErrorMessage``：取异常 message，空则用类名兜底。"""
    text = str(exc or "").strip()
    if not text:
        message = getattr(exc, "message", None)
        text = str(message or "").strip()
    return text or type(exc).__name__


class MemoryDto(BaseModel):
    """长期记忆写入请求（别名 / 偏好）。"""

    model_config = ConfigDict(extra="forbid")

    alias: Any = None
    value: Any = None
    kind: str = "alias"


def _memory_scope(user: dict[str, Any]) -> str:
    return f"user:{user.get('userId') or user.get('username') or 'anon'}"


@router.get("/memories")
async def list_memories(
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    """列出当前用户的长期记忆（设置页管理入口）。"""
    memory = getattr(request.app.state, "agent_memory", None)
    if memory is None:
        return {"items": []}
    return {"items": memory.list_memories(_memory_scope(user))}


@router.post("/memories")
async def remember(
    dto: MemoryDto,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    """新增 / 覆盖一条别名或偏好。"""
    memory = getattr(request.app.state, "agent_memory", None)
    if memory is None:
        raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "长期记忆未启用")
    alias = str(dto.alias or "").strip()
    value = str(dto.value or "").strip()
    kind = "preference" if dto.kind == "preference" else "alias"
    if len(alias) < 2 or len(alias) > 80 or not value or len(value) > 200:
        raise BusinessException(ErrorCode.VALIDATION_FAILED, "别名或记忆内容不合法")
    memory.remember(_memory_scope(user), alias, value, kind)
    return {"ok": True, "items": memory.list_memories(_memory_scope(user))}


@router.delete("/memories/{alias}")
async def forget(
    alias: str,
    request: Request,
    kind: str = "alias",
    user: dict[str, Any] = Depends(require_user),
):
    """忘记一条记忆。"""
    memory = getattr(request.app.state, "agent_memory", None)
    if memory is None:
        return {"ok": True}
    removed = memory.forget(_memory_scope(user), alias, "preference" if kind == "preference" else "alias")
    return {"ok": removed}


@router.get("/ping")
async def ping(
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    """健康检查：返回 LLM 提供商 / 模型 / 计价口径与今日用量。"""
    info = await _service(request).ping_provider()
    budget = getattr(request.app.state, "agent_budget", None)
    owner = str(user.get("userId") or user.get("username") or "anon")
    return {
        "ok": True,
        **info,
        "usageToday": budget.snapshot(owner) if budget is not None else None,
    }


@router.post("/chat")
async def chat(
    dto: ChatDto,
    request: Request,
    user: dict[str, Any] = Depends(
        rate_limit_authenticated(_CHAT_RATE_LIMIT, _CHAT_RATE_WINDOW_SECONDS)
    ),
):
    """自然语言对话 / 控制（支持 sessionId 实现连续对话）。"""
    from ..domains.agent.service import AgentChatOptions

    result = await _service(request).chat(
        dto.message,
        _normalized_history(dto),
        AgentChatOptions(actor=_actor_from_user(user), session_id=dto.sessionId),
    )
    return result.to_dict()


@router.post("/chat/stream")
async def chat_stream(
    dto: ChatDto,
    request: Request,
    user: dict[str, Any] = Depends(
        rate_limit_authenticated(_CHAT_RATE_LIMIT, _CHAT_RATE_WINDOW_SECONDS)
    ),
):
    """流式对话（SSE：token / tool / done / error）。"""
    from ..domains.agent.service import AgentChatOptions

    actor = _actor_from_user(user)
    history = _normalized_history(dto)
    service = _service(request)

    def _frame(event: str, data: Any) -> str:
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"

    async def event_stream():
        # 事件序列：token 增量（实时）→ tool 轨迹 → done（最终结果）/ error
        queue: asyncio.Queue[str | None] = asyncio.Queue()

        def on_progress(progress_event: dict[str, Any]) -> None:
            queue.put_nowait(_frame(str(progress_event.get("type") or "token"), progress_event))

        async def run() -> None:
            try:
                result = await service.chat(
                    dto.message,
                    history,
                    AgentChatOptions(
                        actor=actor, session_id=dto.sessionId, on_progress=on_progress
                    ),
                )
                queue.put_nowait(_frame("done", result.to_dict()))
            except Exception as exc:
                queue.put_nowait(_frame("error", {"message": _error_message(exc)}))
            finally:
                queue.put_nowait(None)

        task = asyncio.create_task(run())
        try:
            while True:
                frame = await queue.get()
                if frame is None:
                    break
                yield frame
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
        },
    )
