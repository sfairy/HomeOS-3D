"""Agent 执行体封装。

职责：
 - 定义 Agent / MCP / 渠道执行身份（AgentActor），与 command-proxy 的鉴权用户对齐；
 - 声明需要实体 ACL 的控制类工具集合。
约定：
 - 对外方法遇非法输入显式抛错。
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class AgentActor:
    """Agent / MCP / 渠道执行身份。

    与 command-proxy 的鉴权用户对齐，供工具层做同一套实体 ACL。
    """

    role: str | None = None
    restrictions: list[str] | None = None
    user_id: str | None = None
    username: str | None = None

    def to_auth_user(self) -> dict[str, object]:
        """转换为 ``assert_command_proxy_authorized`` 期望的用户字典（camelCase）。"""
        return {
            "role": self.role,
            "restrictions": self.restrictions,
            "userId": self.user_id,
            "username": self.username,
        }


#: MCP 网关密钥已校验时的执行身份。
#: 未绑定真实用户时不带 role，控制类工具会拒绝（「未绑定执行身份」）。
#: 生产环境请在 agentConfig.mcpActorUserId 绑定 HomeOS 用户。
MCP_GATEWAY_ACTOR = AgentActor(username="mcp-gateway")

#: 控制类工具：无有效执行身份时一律拒绝
AGENT_CONTROL_TOOLS = frozenset(
    {
        "control_device",
        "control_room",
        "activate_scene",
        "activate_home_mode",
        "set_light_brightness",
        "set_cover_position",
        "media_control",
    }
)


__all__ = ["AGENT_CONTROL_TOOLS", "MCP_GATEWAY_ACTOR", "AgentActor"]
