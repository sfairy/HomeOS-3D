"""MCP 网关服务（对齐 Nest ``mcp.service.ts``）。

职责：
 - MCP 网关密钥 / IP 白名单鉴权；
 - 把 AgentService 与 HomeToolsService 注入为 JSON-RPC 协议处理器的依赖回调；
 - 解析 MCP 绑定执行身份（agentConfig.mcpActorUserId → HomeOS 用户 ACL）。

约定：
 - 对外方法遇非法输入显式抛出 HttpException（403 / 401），响应结构与 Nest 一致。
"""

from __future__ import annotations

import copy
import hmac
import json
import logging
import os
from collections.abc import Mapping
from typing import Any

from starlette.exceptions import HTTPException as StarletteHTTPException

from .mcp_protocol import DEFAULT_SERVER_VERSION, McpHandlerDeps, handle_mcp_json_rpc
from ..agent_actor import MCP_GATEWAY_ACTOR, AgentActor
from ....core.json_field import read_json_object
from ....core.models import User
from ....security.auth_context import resolve_restrictions

logger = logging.getLogger("homeos.agent.mcp")


def _js_stringify(value: Any) -> str:
    """对齐 JS ``JSON.stringify``（紧凑分隔符、不转义中文）。"""
    try:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)
    except (TypeError, ValueError):
        return ""


def _safe_equal_string(a: str, b: str) -> bool:
    """恒定时间字符串比较（MCP Key / 同类密钥）；长度不等直接拒绝。"""
    try:
        buf_a = a.encode()
        buf_b = b.encode()
    except (UnicodeEncodeError, AttributeError):
        return False
    if len(buf_a) != len(buf_b):
        return False
    return hmac.compare_digest(buf_a, buf_b)


def _forbidden(message: str) -> StarletteHTTPException:
    """构造 Nest ``ForbiddenException`` 等价的 403（error='Forbidden'、errorCode=UNKNOWN）。"""
    return StarletteHTTPException(status_code=403, detail=message)


def _unauthorized(message: str) -> StarletteHTTPException:
    """构造 Nest ``UnauthorizedException`` 等价的 401（error='Unauthorized'、errorCode=UNKNOWN）。"""
    return StarletteHTTPException(status_code=401, detail=message)


class McpGatewayService:
    """MCP 网关服务：JSON-RPC 协议路由 + 鉴权 + 执行身份解析。"""

    def __init__(
        self,
        agent_service: Any,
        tools: Any,
        agent_config: Any,
        session_factory: Any,
        env: Mapping[str, str] | None = None,
        server_version: str = "",
    ) -> None:
        self._agent_service = agent_service
        self._tools = tools
        self._agent_config = agent_config
        self._session_factory = session_factory
        self._env = env
        #: serverInfo.version（缺省 0.0.0，由 app 装配时注入应用版本）
        self._server_version = server_version
        #: 密钥轮换提醒只输出一次，避免每个请求刷告警
        self._key_reminder_logged = False

    @property
    def _env_map(self) -> Mapping[str, str]:
        return self._env if self._env is not None else os.environ

    def _env_get(self, name: str) -> str:
        return str(self._env_map.get(name) or "")

    # ------------------------------------------------------------------ #
    # IP 白名单
    # ------------------------------------------------------------------ #
    def _resolve_ip_allowlist(self) -> list[str]:
        """MCP_GATEWAY_ALLOW_IPS 白名单（逗号分隔，支持精确 IP 与网段前缀，如 192.168.1.）。"""
        raw = self._env_get("MCP_GATEWAY_ALLOW_IPS")
        return [entry.strip() for entry in raw.split(",") if entry.strip()]

    def assert_ip_allowed(self, ip: str | None) -> None:
        """IP 白名单校验。

        生产环境必须配置 MCP_GATEWAY_ALLOW_IPS，否则拒绝全部 MCP 请求。
        配置后仅放行白名单来源（精确 IP 或网段前缀，如 192.168.1.）。
        """
        allow = self._resolve_ip_allowlist()
        is_prod = (
            self._env_get("NODE_ENV") == "production"
            or os.environ.get("NODE_ENV") == "production"
        )
        if not allow:
            if is_prod:
                raise _forbidden(
                    "生产环境必须配置 MCP_GATEWAY_ALLOW_IPS（逗号分隔的 IP 或网段前缀）"
                )
            return
        normalized = (ip or "").strip()
        normalized = normalized.removeprefix("::ffff:")
        matched = False
        for entry in allow:
            candidate = entry.strip()
            candidate = candidate.removeprefix("::ffff:")
            if candidate == normalized or (candidate.endswith(".") and normalized.startswith(candidate)):
                matched = True
                break
        if not matched:
            raise _forbidden("MCP 网关 IP 不在白名单")

    # ------------------------------------------------------------------ #
    # 网关密钥
    # ------------------------------------------------------------------ #
    async def assert_gateway_key(self, api_key: str | None) -> None:
        """校验 MCP 网关密钥。

        优先 env MCP_GATEWAY_SECRET，其次 layout.agentConfig.mcpGatewaySecret。
        仅首次调用时输出密钥轮换提醒（弱密钥 / 未走环境变量）。
        """
        env_key = self._env_get("MCP_GATEWAY_SECRET").strip()
        layout_key = await self._agent_config.get_mcp_gateway_secret()
        expected = env_key or layout_key
        if not expected:
            raise _unauthorized(
                "MCP 网关未配置密钥：请设置环境变量 MCP_GATEWAY_SECRET 或 agentConfig.mcpGatewaySecret"
            )
        if not api_key or not _safe_equal_string(api_key, expected):
            raise _unauthorized("MCP 网关密钥无效")
        if len(expected) < 16:
            raise _unauthorized("MCP 网关密钥过短：请使用 ≥16 位随机字符串并定期轮换")
        if not self._key_reminder_logged:
            self._key_reminder_logged = True
            if not env_key:
                logger.warning(
                    "MCP 网关使用 agentConfig.mcpGatewaySecret 而非环境变量 MCP_GATEWAY_SECRET;"
                    "建议优先使用环境变量并定期轮换密钥"
                )

    # ------------------------------------------------------------------ #
    # 执行身份
    # ------------------------------------------------------------------ #
    async def resolve_mcp_actor(self) -> AgentActor:
        """绑定 agentConfig.mcpActorUserId 对应的真实用户；未绑定则无 role，控制类工具拒绝。"""
        fallback_actor = copy.copy(MCP_GATEWAY_ACTOR)
        user_id = await self._agent_config.get_mcp_actor_user_id()
        if not user_id:
            return fallback_actor
        try:
            with self._session_factory() as session:
                user = session.get(User, user_id)
            if user is None:
                logger.warning("MCP 绑定用户不存在: %s", user_id)
                return fallback_actor
            prefs = read_json_object(user.preferences)
            role = user.role
            return AgentActor(
                role=role,
                user_id=user.id,
                username=user.username,
                restrictions=resolve_restrictions(role, prefs),
            )
        except Exception as exc:
            logger.warning("解析 MCP 执行身份失败: %s", exc)
            return fallback_actor

    # ------------------------------------------------------------------ #
    # JSON-RPC 入口
    # ------------------------------------------------------------------ #
    async def handle(self, body: dict[str, Any], ip: str | None = None) -> dict[str, Any]:
        """处理一次 MCP JSON-RPC 请求。

        - 记录来源 IP / 方法 / 工具名到日志，便于第三方 Agent 异常排查
        - 把 HomeToolsService / AgentService 注入为 handle_mcp_json_rpc 的依赖回调
        """
        from ...channels.reply import format_channel_reply

        payload = body if isinstance(body, dict) else {}
        method = str(payload.get("method") or "")
        params = payload.get("params")
        tool_name = ""
        if isinstance(params, dict) and "name" in params:
            tool_name = str(params.get("name") or "")
        # 操作审计：记录来源 IP、方法与被调用的工具，便于排查第三方 Agent 异常调用
        logger.info(
            "[MCP] 方法=%s%s IP=%s",
            method,
            f" 工具={tool_name}" if tool_name else "",
            ip or "-",
        )

        def list_fine_tools() -> list[Any]:
            return self._tools.get_tool_schemas()

        async def call_smart_home(message: str) -> dict[str, Any]:
            from ..service import AgentChatOptions

            actor = await self.resolve_mcp_actor()
            result = await self._agent_service.chat(
                message,
                [],
                AgentChatOptions(actor=actor, session_id=f"mcp:{ip or 'anon'}"),
            )
            text_reply = format_channel_reply(result.to_dict() if hasattr(result, "to_dict") else result)
            if result.outcome == "success" and not text_reply:
                text_reply = f"已成功执行「{message}」"
            return {
                "text": text_reply or "已处理",
                "isError": result.outcome in ("failed", "blocked"),
            }

        async def call_fine_tool(name: str, args: dict[str, Any]) -> dict[str, Any]:
            actor = await self.resolve_mcp_actor()
            tool_result = await self._tools.execute(name, args, actor)
            is_error = bool(
                isinstance(tool_result, dict)
                and "error" in tool_result
                and tool_result.get("error")
            )
            return {"text": _js_stringify(tool_result), "isError": is_error}

        async def read_resource(uri: str) -> dict[str, Any]:
            actor = await self.resolve_mcp_actor()
            tool = (
                "get_home_status"
                if uri == "homeos://status"
                else "list_areas"
                if uri == "homeos://areas"
                else "list_scenes"
                if uri == "homeos://scenes"
                else ""
            )
            if not tool:
                return {"text": "{}", "mimeType": "application/json", "isError": True}
            tool_result = await self._tools.execute(tool, {}, actor)
            return {"text": _js_stringify(tool_result), "mimeType": "application/json"}

        deps = McpHandlerDeps(
            list_fine_tools=list_fine_tools,
            call_smart_home=call_smart_home,
            call_fine_tool=call_fine_tool,
            read_resource=read_resource,
            server_version=self._server_version or DEFAULT_SERVER_VERSION,
        )
        return await handle_mcp_json_rpc(payload or {"method": ""}, deps)


__all__ = ["McpGatewayService"]
