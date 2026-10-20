"""MCP 网关服务（对齐 Nest ``mcp.service.ts``）。"""

from __future__ import annotations

import hmac
import json
import logging
import os
import time
from collections.abc import Mapping
from typing import Any

from starlette.exceptions import HTTPException as StarletteHTTPException

from .mcp_protocol import DEFAULT_SERVER_VERSION, McpHandlerDeps, handle_mcp_json_rpc
from ..agent_actor import AGENT_CONTROL_TOOLS, AgentActor
from ..tool_i18n import localize_tool_schemas
from ....config import environment_is_production_from
from ....platform.core.json_field import read_json_object
from ....platform.core.models import User
from ....platform.security.auth_context import resolve_restrictions

logger = logging.getLogger("homeos.agent.mcp")


def _js_stringify(value: Any) -> str:
    """对齐 JS ``JSON.stringify``（紧凑分隔符、不转义中文）。"""
    try:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)
    except (TypeError, ValueError):
        return ""


def _safe_equal_string(left: str, right: str) -> bool:
    """恒定时间字符串比较（MCP Key / 同类密钥）；长度不等直接拒绝。"""
    try:
        buf_a = left.encode()
        buf_b = right.encode()
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


def _too_many_requests(message: str) -> StarletteHTTPException:
    """MCP 客户端级限流：429（与路由级限流同语义）。"""
    return StarletteHTTPException(status_code=429, detail=message)


#: MCP 客户端标识最大长度
MAX_CLIENT_ID_LENGTH = 64


def normalize_client_id(raw: Any) -> str:
    """收敛 MCP 客户端标识：只保留安全字符并截断。

    客户端标识会进入会话 key 与日志，不能允许换行 / 分隔符注入；空值返回空串，
    由调用方回退到 IP 或 ``anon``。
    """
    text = str(raw or "").strip()
    if not text:
        return ""
    safe = "".join(ch for ch in text if ch.isalnum() or ch in "._:-")
    return safe[:MAX_CLIENT_ID_LENGTH]


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
        is_production: bool | None = None,
        lang_templates: Any = None,
    ) -> None:
        self._agent_service = agent_service
        self._tools = tools
        self._agent_config = agent_config
        self._lang_templates = lang_templates
        self._session_factory = session_factory
        self._env = env
        #: 生产标记：优先用应用装配注入的 ``settings.is_production``（唯一真源）；
        #: 未注入时按同一口径从 env 映射推导，避免这里再写一份「NODE_ENV == production」。
        self._is_production = (
            is_production
            if is_production is not None
            else environment_is_production_from(env if env is not None else os.environ)
        )
        #: serverInfo.version（缺省 0.0.0，由 app 装配时注入应用版本）
        self._server_version = server_version
        #: 密钥轮换提醒只输出一次，避免每个请求刷告警
        self._key_reminder_logged = False
        #: 「白名单未配置」告警同样只输出一次（非生产放行分支）。
        self._allowlist_warning_logged = False
        #: 客户端维度限流窗口（clientId → 时间戳列表）
        self._client_hits: dict[str, list[float]] = {}

    @property
    def _env_map(self) -> Mapping[str, str]:
        return self._env if self._env is not None else os.environ

    def _env_get(self, name: str) -> str:
        return str(self._env_map.get(name) or "")

    # IP 白名单
    def _resolve_ip_allowlist(self) -> list[str]:
        """MCP_GATEWAY_ALLOW_IPS 白名单（逗号分隔，支持精确 IP 与网段前缀，如 192.168.1.）。"""
        raw = self._env_get("MCP_GATEWAY_ALLOW_IPS")
        return [entry.strip() for entry in raw.split(",") if entry.strip()]

    def assert_ip_allowed(self, ip: str | None) -> None:
        """IP 白名单校验（**fail-closed**）。

        生产环境必须配置 ``MCP_GATEWAY_ALLOW_IPS``，否则拒绝全部 MCP 请求 ——
        留空即「谁都能访问 MCP 网关」，那不是宽容而是把网关变成未鉴权入口。

        非生产环境未配置白名单时放行（本地开发便利），但仍打一条告警：这个分支曾经因为
        ``NODE_ENV`` 在容器里从未设置而**在生产里也生效**，静默地把网关敞开。告警让
        「以为配了、其实没配」在日志里可见。
        """
        allow = self._resolve_ip_allowlist()
        if not allow:
            if self._is_production:
                raise _forbidden(
                    "生产环境必须配置 MCP_GATEWAY_ALLOW_IPS（逗号分隔的 IP 或网段前缀）"
                )
            if not self._allowlist_warning_logged:
                self._allowlist_warning_logged = True
                logger.warning(
                    "MCP 网关未配置 MCP_GATEWAY_ALLOW_IPS：非生产环境放行全部来源。"
                    "生产环境（APP_ENVIRONMENT=production）下这一项未配置会直接拒绝全部请求。"
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

    # 网关密钥
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

    # 执行身份
    async def resolve_mcp_actor(self) -> AgentActor | None:
        """绑定 agentConfig.mcpActorUserId 对应的真实用户；未绑定则返回 ``None``。

        返回 ``None`` 表示「无执行身份」，控制类工具据此拒绝（「未绑定执行身份」）。
        """
        user_id = await self._agent_config.get_mcp_actor_user_id()
        if not user_id:
            return None
        try:
            with self._session_factory() as session:
                user = session.get(User, user_id)
            if user is None:
                logger.warning("MCP 绑定用户不存在: %s", user_id)
                return None
            prefs = read_json_object(user.preferences)
            return AgentActor(
                user_id=user.id,
                username=user.username,
                restrictions=resolve_restrictions(prefs),
            )
        except Exception as exc:
            logger.warning("解析 MCP 执行身份失败: %s", exc)
            return None

    # JSON-RPC 入口
    def _resolve_client_id(
        self, body: dict[str, Any], ip_address: str | None, header_client_id: str | None
    ) -> str:
        """确定 MCP 客户端标识：请求头 → initialize.clientInfo.name → IP。

        同一 NAT 后面的多个 Agent 过去都落在 ``mcp:<ip>``，会共享会话上下文；
        加上客户端标识后按客户端隔离，取不到时保持原有 IP 语义。
        """
        client = normalize_client_id(header_client_id)
        if client:
            return client
        params = body.get("params") if isinstance(body, dict) else None
        if isinstance(params, dict):
            client_info = params.get("clientInfo")
            if isinstance(client_info, dict):
                client = normalize_client_id(client_info.get("name"))
        if client:
            return client
        return normalize_client_id(ip_address) or "anon"

    def _check_client_rate(self, client_id: str) -> None:
        """客户端级限流（默认 60 次 / 60 秒，MCP_CLIENT_RATE_LIMIT 可调；0 关闭）。"""
        raw_limit = self._env_get("MCP_CLIENT_RATE_LIMIT").strip()
        try:
            limit = int(float(raw_limit)) if raw_limit else 60
        except ValueError:
            limit = 60
        if limit <= 0:
            return
        try:
            window = float(self._env_get("MCP_CLIENT_RATE_WINDOW_SECONDS") or 60.0)
        except ValueError:
            window = 60.0
        now = time.monotonic()
        hits = [stamp for stamp in self._client_hits.get(client_id, []) if now - stamp < window]
        if len(hits) >= limit:
            self._client_hits[client_id] = hits
            raise _too_many_requests(f"MCP 客户端 {client_id} 请求过于频繁，请稍后再试")
        hits.append(now)
        self._client_hits[client_id] = hits

    def _read_env_map(self, name: str) -> dict[str, Any]:
        """读取 JSON 对象型环境变量；格式非法时按未配置处理（不让坏配置锁死网关）。"""
        raw = self._env_get(name).strip()
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
        except (TypeError, ValueError):
            logger.warning("%s 不是合法 JSON，已忽略", name)
            return {}
        return parsed if isinstance(parsed, dict) else {}

    def _authorize_client(self, client_id: str, client_key: str | None) -> None:
        """可选的按客户端密钥校验（``MCP_CLIENT_KEYS``）。

        未配置该变量时保持原有「网关密钥即可」的行为；一旦配置则**只放行**清单内
        且密钥匹配的客户端，避免一把网关密钥被所有第三方 Agent 共享。
        """
        keys = self._read_env_map("MCP_CLIENT_KEYS")
        if not keys:
            return
        expected = keys.get(client_id)
        if not isinstance(expected, str) or not expected:
            raise _unauthorized(f"MCP 客户端 {client_id} 未授权：请配置 MCP_CLIENT_KEYS")
        provided = str(client_key or "")
        if not provided or not _safe_equal_string(provided, expected):
            raise _unauthorized(f"MCP 客户端 {client_id} 密钥无效")

    def _client_scopes(self, client_id: str) -> set[str] | None:
        """可选的按客户端作用域（``MCP_CLIENT_SCOPES``）。

        ``None`` = 未配置，不限制；配置后未列出的客户端默认只有 ``read``，
        需要控制设备必须显式授予 ``control``。
        """
        raw = self._read_env_map("MCP_CLIENT_SCOPES")
        if not raw:
            return None
        scopes = raw.get(client_id)
        if not isinstance(scopes, list):
            return {"read"}
        return {str(item) for item in scopes if str(item) in ("read", "control")}

    async def handle(
        self,
        body: dict[str, Any],
        ip: str | None = None,
        client_id: str | None = None,
        client_key: str | None = None,
    ) -> dict[str, Any]:
        """处理一次 MCP JSON-RPC 请求。

        - 记录客户端标识 / 来源 IP / 方法 / 工具名到日志，便于第三方 Agent 异常排查
        - 客户端级限流与会话隔离（``mcp:<clientId>``）
        - 把 HomeToolsService / AgentService 注入为 handle_mcp_json_rpc 的依赖回调
        """
        from ...channels.reply import format_channel_reply

        payload = body if isinstance(body, dict) else {}
        resolved_client = self._resolve_client_id(payload, ip, client_id)
        self._authorize_client(resolved_client, client_key)
        self._check_client_rate(resolved_client)
        scopes = self._client_scopes(resolved_client)
        method = str(payload.get("method") or "")
        params = payload.get("params")
        tool_name = ""
        if isinstance(params, dict) and "name" in params:
            tool_name = str(params.get("name") or "")
        # 操作审计：记录客户端标识 / IP / 方法与被调用的工具，便于排查第三方 Agent 异常调用
        logger.info(
            "[MCP] 客户端=%s 方法=%s%s IP=%s 作用域=%s",
            resolved_client,
            method,
            f" 工具={tool_name}" if tool_name else "",
            ip or "-",
            ",".join(sorted(scopes)) if scopes is not None else "all",
        )

        def list_fine_tools() -> list[Any]:
            lang = getattr(getattr(self._lang_templates, "current", None), "lang", "zh")
            return localize_tool_schemas(self._tools.get_tool_schemas(), lang)

        async def call_smart_home(message: str) -> dict[str, Any]:
            from ..service import AgentChatOptions

            if scopes is not None and "control" not in scopes:
                raise _forbidden(f"MCP 客户端 {resolved_client} 只有只读作用域，禁止执行自然语言控制")
            actor = await self.resolve_mcp_actor()
            result = await self._agent_service.chat(
                message,
                [],
                AgentChatOptions(
                    actor=actor,
                    session_id=f"mcp:{resolved_client}",
                    entry="mcp",
                ),
            )
            text_reply = format_channel_reply(result.to_dict() if hasattr(result, "to_dict") else result)
            if result.outcome == "success" and not text_reply:
                text_reply = f"已成功执行「{message}」"
            return {
                "text": text_reply or "已处理",
                "isError": result.outcome in ("failed", "blocked"),
            }

        async def call_fine_tool(name: str, args: dict[str, Any]) -> dict[str, Any]:
            if scopes is not None and "control" not in scopes and name in AGENT_CONTROL_TOOLS:
                raise _forbidden(f"MCP 客户端 {resolved_client} 只有只读作用域，禁止调用控制工具 {name}")
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


__all__ = ["MAX_CLIENT_ID_LENGTH", "McpGatewayService", "normalize_client_id"]
