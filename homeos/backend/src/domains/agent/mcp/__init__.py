"""MCP 网关：JSON-RPC 2.0 协议（2025-03-26）与网关服务。"""

from __future__ import annotations

from .mcp_protocol import (
    MCP_PROTOCOL_VERSION,
    MCP_SERVER_NAME,
    MCP_SMART_HOME_TOOL,
    McpHandlerDeps,
    handle_mcp_json_rpc,
)
from .mcp_service import McpGatewayService

__all__ = [
    "MCP_PROTOCOL_VERSION",
    "MCP_SERVER_NAME",
    "MCP_SMART_HOME_TOOL",
    "McpGatewayService",
    "McpHandlerDeps",
    "handle_mcp_json_rpc",
]
