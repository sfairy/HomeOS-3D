"""智能管家路由（``/api/v1/agent/*``），对齐 Nest ``AgentController``。

职责：暴露 ``GET /agent/ping``、``POST /agent/chat``、``POST /agent/chat/stream``（SSE）。
鉴权：全部端点要求登录，并通过 ``@Roles('admin','adult')`` 限定角色。
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, model_validator

from ..dependencies import license_feature
from ..security.auth_context import require_roles
from ..services.agent.agent_actor import AgentActor
from ..services.license import features as feature_codes
from .router import NestRouter

router = NestRouter(
    prefix="/agent",
    tags=["agent"],
    dependencies=[license_feature(feature_codes.FEATURE_AGENT)],
)

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
        role=user.get("role"),
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


@router.get("/ping")
async def ping(
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    """健康检查：返回 LLM 提供商名与就绪状态。"""
    _ = user
    return {"ok": True, **(await _service(request).ping_provider())}


@router.post("/chat")
async def chat(
    dto: ChatDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    """自然语言对话 / 控制（支持 sessionId 实现连续对话）。"""
    from ..services.agent.service import AgentChatOptions

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
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    """流式对话（SSE：token / tool / done / error）。"""
    from ..services.agent.service import AgentChatOptions

    actor = _actor_from_user(user)
    history = _normalized_history(dto)
    service = _service(request)

    def _frame(event: str, data: Any) -> str:
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"

    async def event_stream():
        # 事件序列：token 增量（实时）→ tool 轨迹 → done（最终结果）/ error
        queue: asyncio.Queue[str | None] = asyncio.Queue()

        def on_progress(ev: dict[str, Any]) -> None:
            queue.put_nowait(_frame(str(ev.get("type") or "token"), ev))

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
            except Exception as exc:  # noqa: BLE001 - 对齐 Nest：异常也以 SSE error 帧返回
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
