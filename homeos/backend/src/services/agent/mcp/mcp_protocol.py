"""MCP JSON-RPC 协议纯处理工具（无框架依赖）。

职责：把 MCP JSON-RPC 请求按方法路由到对应的处理分支，
 对接小智 ESP32 / 第三方 AI 等客户端。协议子集：2025-03-26。
 支持方法：initialize / notifications/* / ping / logging/setLevel /
 tools(/list / /call) / resources(/list / /templates/list / /read) / prompts(/list / /get)。
 以「smart_home.control」自然语言工具聚合 HomeToolsService 的细粒度工具。

对齐 Nest ``mcp-protocol.util.ts``（逐分支、逐文案、逐错误码一致）。
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

#: 协议版本号，与 MCP 标准对齐
MCP_PROTOCOL_VERSION = "2025-03-26"
#: MCP serverInfo 中的 name 字段，固定为 homeos
MCP_SERVER_NAME = "homeos"
#: 暴露给客户端的「自然语言控家」聚合工具名，转发到 AgentService.chat
MCP_SMART_HOME_TOOL = "smart_home.control"

#: 默认 serverInfo.version（对齐 ``process.env.npm_package_version || '0.0.0'``）
DEFAULT_SERVER_VERSION = "0.0.0"

#: MCP 资源声明：固定暴露「全屋状态 / 房间 / 场景」三类只读资源
MCP_RESOURCES: tuple[dict[str, str], ...] = (
    {
        "uri": "homeos://status",
        "name": "全屋状态",
        "description": "全屋状态概览（家庭模式、自动化数量、能耗）",
        "mimeType": "application/json",
    },
    {
        "uri": "homeos://areas",
        "name": "房间",
        "description": "房间列表",
        "mimeType": "application/json",
    },
    {
        "uri": "homeos://scenes",
        "name": "场景",
        "description": "已配置场景名称",
        "mimeType": "application/json",
    },
)

#: MCP 提示词声明：固定暴露「控家 / 全屋状态」两类预设提示词
MCP_PROMPTS: tuple[dict[str, Any], ...] = (
    {
        "name": "control_home",
        "description": "用自然语言控制家居",
        "arguments": [
            {"name": "instruction", "description": "用户指令，如打开客厅灯", "required": True}
        ],
    },
    {
        "name": "home_status",
        "description": "询问家里当前整体状态",
        "arguments": [],
    },
)

#: 自然语言聚合工具的 JSON Schema
_SMART_HOME_NL_TOOL: dict[str, Any] = {
    "name": MCP_SMART_HOME_TOOL,
    "description": (
        "控制智能家居设备，如开关灯、调节空调温度、开关窗帘、查询设备状态等。传入自然语言指令即可。"
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "message": {
                "type": "string",
                "description": '用户的自然语言指令，如"开客厅灯"、"把卧室空调调到26度"',
            },
        },
        "required": ["message"],
    },
}

#: JSON-RPC 标准错误码
PARSE_ERROR = -32700
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603
METHOD_NOT_FOUND = -32601


@dataclass
class McpHandlerDeps:
    """``handle_mcp_json_rpc`` 依赖注入集合，由 mcp service 提供具体实现。"""

    #: 列出细粒度工具 schema，作为 smart_home.control 之外的工具集
    list_fine_tools: Callable[[], list[Any]]
    #: 自然语言控家：转发到 AgentService.chat 并返回文本回复
    call_smart_home: Callable[[str], Awaitable[dict[str, Any]]]
    #: 调用细粒度工具：直接调 HomeToolsService.execute
    call_fine_tool: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]
    #: 读取 MCP 资源（homeos://status / areas / scenes 等）
    read_resource: Callable[[str], Awaitable[dict[str, Any]]] | None = None
    #: serverInfo.version，缺省 0.0.0
    server_version: str = ""
    #: 附加字段（保留扩展位，不参与协议分支）
    extra: dict[str, Any] = field(default_factory=dict)


def _field(tool: Any, name: str, default: Any = None) -> Any:
    """兼容 dataclass（LlmToolSchema）与 dict 两种工具 schema 形态。"""
    if isinstance(tool, dict):
        return tool.get(name, default)
    return getattr(tool, name, default)


def build_mcp_tool_list(fine_tools: list[Any]) -> list[dict[str, Any]]:
    """构造暴露给客户端的工具列表：自然语言工具 + 细粒度工具集。"""
    tools: list[dict[str, Any]] = [dict(_SMART_HOME_NL_TOOL)]
    for tool in fine_tools:
        parameters = _field(tool, "parameters") or {"type": "object", "properties": {}}
        tools.append(
            {
                "name": _field(tool, "name", ""),
                "description": _field(tool, "description", ""),
                "inputSchema": parameters,
            }
        )
    return tools


def ok(request_id: str | int | None, result: Any) -> dict[str, Any]:
    """构造成功响应。"""
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def err(request_id: str | int | None, code: int, message: str) -> dict[str, Any]:
    """构造错误响应（标准 JSON-RPC 错误码）。"""
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def prompt_messages(name: str, args: dict[str, Any]) -> dict[str, Any] | None:
    """构造 prompts/get 的 messages 数组；未知名返回 None。"""
    if name == "control_home":
        instruction = str(args.get("instruction") or "").strip() or "查看家里现在的状态"
        return {
            "description": "自然语言控家",
            "messages": [{"role": "user", "content": {"type": "text", "text": instruction}}],
        }
    if name == "home_status":
        return {
            "description": "全屋状态",
            "messages": [{"role": "user", "content": {"type": "text", "text": "家里现在什么状态？"}}],
        }
    return None


def _params(body: dict[str, Any]) -> dict[str, Any]:
    params = body.get("params")
    return params if isinstance(params, dict) else {}


async def handle_mcp_json_rpc(
    body: dict[str, Any],
    deps: McpHandlerDeps,
) -> dict[str, Any]:
    """MCP JSON-RPC 请求总入口，按 method 分发到对应处理分支。"""
    body = body if isinstance(body, dict) else {"method": ""}
    request_id = body.get("id")
    method = str(body.get("method") or "")

    # initialize：返回协议版本、能力声明与 serverInfo
    if method == "initialize":
        return ok(
            request_id,
            {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {
                    "tools": {},
                    "resources": {"subscribe": False},
                    "prompts": {},
                },
                "serverInfo": {
                    "name": MCP_SERVER_NAME,
                    "version": deps.server_version or DEFAULT_SERVER_VERSION,
                },
            },
        )

    # 通知类 / ping / 日志级别：客户端无需业务处理，统一回空 result
    if method in (
        "notifications/initialized",
        "notifications/cancelled",
        "ping",
        "logging/setLevel",
    ):
        return ok(request_id, {})

    # tools/list：暴露自然语言 + 细粒度工具
    if method == "tools/list":
        return ok(request_id, {"tools": build_mcp_tool_list(deps.list_fine_tools())})

    # resources/list：返回固定的三类只读资源
    if method == "resources/list":
        return ok(request_id, {"resources": list(MCP_RESOURCES)})

    # resources/templates/list：当前不支持参数化资源模板
    if method == "resources/templates/list":
        return ok(request_id, {"resourceTemplates": []})

    # resources/read：按 uri 读取资源文本
    if method == "resources/read":
        uri = str(_params(body).get("uri") or "").strip()
        if not uri:
            return err(request_id, INVALID_PARAMS, "缺少必需参数：uri")
        known = any(resource["uri"] == uri for resource in MCP_RESOURCES)
        if not known:
            return err(request_id, INVALID_PARAMS, f"未知资源：{uri}")
        if deps.read_resource is None:
            return err(request_id, INTERNAL_ERROR, "资源读取未就绪")
        try:
            result = await deps.read_resource(uri)
            mime = result.get("mimeType") or "application/json"
            return ok(
                request_id,
                {"contents": [{"uri": uri, "mimeType": mime, "text": result.get("text")}]},
            )
        except Exception:  # noqa: BLE001 - 对齐 Nest catch {} 兜底
            return err(request_id, INTERNAL_ERROR, "资源读取失败")

    # prompts/list：返回固定的两类预设提示词
    if method == "prompts/list":
        return ok(request_id, {"prompts": list(MCP_PROMPTS)})

    # prompts/get：按 name + arguments 构造提示词消息
    if method == "prompts/get":
        name = str(_params(body).get("name") or "").strip()
        args = _params(body).get("arguments")
        built = prompt_messages(name, args if isinstance(args, dict) else {})
        if built is None:
            return err(request_id, INVALID_PARAMS, f"未知提示词：{name or '(空)'}")
        return ok(request_id, built)

    # tools/call：按 name 分发到 smart_home.control 或细粒度工具
    if method == "tools/call":
        try:
            params = _params(body)
            name = str(params.get("name") or "")
            args = params.get("arguments")
            args = args if isinstance(args, dict) else {}
            # smart_home.control：转发到 AgentService.chat
            if name == MCP_SMART_HOME_TOOL:
                message = str(args.get("message") or "").strip()
                if not message:
                    return err(request_id, INVALID_PARAMS, "缺少必需参数：message")
                result = await deps.call_smart_home(message)
                return ok(
                    request_id,
                    {
                        "content": [{"type": "text", "text": result.get("text") or "已处理"}],
                        "isError": result.get("isError"),
                    },
                )
            # 细粒度工具：先校验是否在工具集中，再调用
            known = any(_field(tool, "name", "") == name for tool in deps.list_fine_tools())
            if not known:
                return err(request_id, METHOD_NOT_FOUND, f"未知工具：{name}")
            result = await deps.call_fine_tool(name, args)
            return ok(
                request_id,
                {
                    "content": [{"type": "text", "text": result.get("text")}],
                    "isError": result.get("isError"),
                },
            )
        except Exception:  # noqa: BLE001 - 对齐 Nest catch {} 兜底
            return err(request_id, INTERNAL_ERROR, "智能家居控制失败，请稍后重试")

    # 未匹配的方法：返回 -32601 method not found
    return err(request_id, METHOD_NOT_FOUND, f"未找到方法：{method}")


__all__ = [
    "DEFAULT_SERVER_VERSION",
    "INTERNAL_ERROR",
    "INVALID_PARAMS",
    "MCP_PROMPTS",
    "MCP_PROTOCOL_VERSION",
    "MCP_RESOURCES",
    "MCP_SERVER_NAME",
    "MCP_SMART_HOME_TOOL",
    "METHOD_NOT_FOUND",
    "McpHandlerDeps",
    "build_mcp_tool_list",
    "err",
    "handle_mcp_json_rpc",
    "ok",
    "prompt_messages",
]
