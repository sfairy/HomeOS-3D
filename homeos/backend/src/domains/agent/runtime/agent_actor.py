"""Agent 执行体封装。"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class AgentActor:
    """Agent / MCP / 渠道执行身份。

    与 command-proxy 的鉴权用户对齐，供工具层做同一套实体 ACL。
    """

    restrictions: list[str] | None = None
    user_id: str | None = None
    username: str | None = None
    #: 音箱授权 id（仅语音通道携带）：`send_notification` 的「发到手机」未点名时，
    #: 取该音箱配置的默认接收人；web / 渠道对话恒为 None。
    voice_grant_id: str | None = None
    #: 账号角色（``ADMIN`` / ``MEMBER``）：工具层据此判定「全屋广播」这类管理员动作。
    #: 缺省 None 由调用方按 ADMIN 处理（单账号部署下的历史调用点）。
    role: str | None = None

    def to_auth_user(self) -> dict[str, object]:
        """转换为 ``assert_command_proxy_authorized`` 期望的用户字典（camelCase）。"""
        return {
            "restrictions": self.restrictions,
            "userId": self.user_id,
            "username": self.username,
        }


#: 控制类工具：无有效执行身份（``actor is None``）时一律拒绝
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


__all__ = ["AGENT_CONTROL_TOOLS", "AgentActor"]
