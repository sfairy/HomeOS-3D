"""MCP JSON-RPC 网关路由（``/api/v1/mcp``），对齐 Nest ``McpGatewayController``。

暴露：
 - ``POST /api/v1/mcp``：处理一次 JSON-RPC 请求（initialize / ping / tools / resources / prompts）
 - ``GET  /api/v1/mcp/sse``：SSE 传输（先推送 endpoint，再每 15s 心跳 ping）

鉴权：IP 白名单 + ``x-homeos-mcp-key``（不走 JWT/CSRF，见 csrf 豁免表）。
限流：POST 60/min、SSE 20/min（对齐 Nest ``@Throttle``）。
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import Body, Depends, Request
from fastapi.responses import StreamingResponse

from .router import NestRouter
from ..security.limiter import rate_limit

router = NestRouter(prefix="/mcp", tags=["mcp"])

#: SSE 心跳间隔（毫秒），对齐 Nest ``interval(15_000)``
SSE_HEARTBEAT_MS = 15_000
#: SSE 首帧推送的 MCP 接入端点
MCP_ENDPOINT = "/api/v1/mcp"


def _service(request: Request):
    return request.app.state.mcp_gateway


def _client_ip(request: Request) -> str | None:
    """与 Express ``req.ip`` 对齐的客户端 IP（优先 X-Forwarded-For 首个地址）。"""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@router.post("", status_code=200, dependencies=[Depends(rate_limit(60))])
async def handle_mcp_request(
    request: Request,
    body: dict[str, Any] | None = Body(default=None),
):
    """处理一次 MCP JSON-RPC 请求（鉴权顺序：IP 白名单 → MCP 网关密钥）。"""
    mcp = _service(request)
    ip = _client_ip(request)
    mcp.assert_ip_allowed(ip)
    await mcp.assert_gateway_key(request.headers.get("x-homeos-mcp-key"))
    return await mcp.handle(body or {"method": ""}, ip)


@router.get("/sse", dependencies=[Depends(rate_limit(20))])
async def handle_mcp_sse(request: Request):
    """建立 MCP SSE 传输通道：先推送 endpoint，再每 15s 推送心跳 ping。"""
    mcp = _service(request)
    ip = _client_ip(request)
    mcp.assert_ip_allowed(ip)
    await mcp.assert_gateway_key(request.headers.get("x-homeos-mcp-key"))

    def _frame(event_id: int, event_type: str, data: str) -> str:
        # 对齐 Nest SseStream：event → id → data → 空行；data 为字符串时逐行前缀
        return f"event: {event_type}\nid: {event_id}\ndata: {data}\n\n"

    async def event_stream():
        # Nest ``SseStream.commitHeaders`` 在首帧前写入一个空行
        yield "\n"
        cursor = 0
        # 对齐 Nest ``merge(of(endpoint), interval(15s).pipe(map(ping)))``
        yield _frame(cursor, "endpoint", MCP_ENDPOINT)
        while True:
            try:
                await asyncio.sleep(SSE_HEARTBEAT_MS / 1000)
            except asyncio.CancelledError:  # 客户端断开
                raise
            cursor += 1
            yield _frame(cursor, "ping", "{}")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Content-Type": "text/event-stream",
            "Connection": "keep-alive",
            "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0, no-transform",
            "Pragma": "no-cache",
            "Expire": "0",
            "X-Accel-Buffering": "no",
        },
    )
