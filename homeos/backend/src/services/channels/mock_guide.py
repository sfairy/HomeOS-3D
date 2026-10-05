"""Agent 处于 Mock（演示）模式时向 IM 通道回发的固定引导文案。

对齐 ``channels/mock-guide.ts``。
"""

#: 通道在 Agent Mock 时的固定引导文案
MOCK_AGENT_CONFIG_GUIDE = (
    "智能管家当前为演示模式（未配置有效 API Key），无法执行远程控家。"
    "请在 HomeOS「设置 → 智能管家 → 模型配置」填写 API Key 并保存后再试。"
)

__all__ = ["MOCK_AGENT_CONFIG_GUIDE"]
