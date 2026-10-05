"""智能管家 LLM 工具 schema 定义（纯数据，从 HomeToolsService 抽离）。

职责：集中维护暴露给 LLM 的工具描述与参数 JSON Schema；不含任何运行时依赖。
"""

from __future__ import annotations

from ..providers.llm_provider_interface import LlmToolSchema


def build_home_tool_schemas() -> list[LlmToolSchema]:
    """返回暴露给 LLM 的工具 schema 列表。

    包含搜索、查状态、控制设备、列房间、房间快照、按房间批量控制等工具。
    """
    return [
        LlmToolSchema(
            name="search_entities",
            description=(
                "按名称或类型搜索智能家居设备，返回匹配的设备列表（含 entity_id、名称、当前状态）。"
                "搜索范围是 HomeOS 房间绑定与 HA 区域并集，以及常用监控列表。"
                "控制或查询设备前，先用它找到 entity_id。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索关键词，如 客厅灯、空调、温度",
                    },
                },
                "required": ["query"],
            },
        ),
        LlmToolSchema(
            name="get_entity_state",
            description="查询单个设备的当前状态（开/关、温度值等）。",
            parameters={
                "type": "object",
                "properties": {
                    "entity_id": {
                        "type": "string",
                        "description": "设备唯一ID，如 light.living_room",
                    },
                },
                "required": ["entity_id"],
            },
        ),
        LlmToolSchema(
            name="control_device",
            description=(
                "控制智能家居设备，如开关灯、开关空调、调温度、toggle 虚拟开关。"
                "高危设备（门锁/安防/燃气）会被安全策略拒绝。input_boolean 类开关用 service=toggle。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "domain": {
                        "type": "string",
                        "description": "设备域，如 light, switch, climate",
                    },
                    "service": {
                        "type": "string",
                        "description": "动作，如 turn_on, turn_off, set_temperature",
                    },
                    "entity_id": {"type": "string", "description": "设备唯一ID"},
                    "service_data": {
                        "type": "object",
                        "description": '附加参数，如 {"temperature": 24}',
                    },
                },
                "required": ["domain", "service", "entity_id"],
            },
        ),
        LlmToolSchema(
            name="list_areas",
            description="列出所有房间/区域。",
            parameters={"type": "object", "properties": {}},
        ),
        LlmToolSchema(
            name="get_area_snapshot",
            description=(
                '获取某个房间内所有设备的当前状态快照，用于理解"客厅现在几度、灯开没开"这类环境感知问题。'
            ),
            parameters={
                "type": "object",
                "properties": {
                    "area_id": {"type": "string", "description": "房间ID"},
                },
                "required": ["area_id"],
            },
        ),
        LlmToolSchema(
            name="control_room",
            description=(
                '按房间批量控制设备。当用户说"打开书房所有灯""把客厅的灯都关了""开卧室空调"这类'
                "【针对整个房间/区域】的指令时，优先用它，一步到位。房间用名称即可（如 书房、客厅）。"
                "设备来自 HomeOS 房间绑定与 HA 区域并集。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "room": {
                        "type": "string",
                        "description": "房间名称或ID，如 书房、客厅",
                    },
                    "domain": {
                        "type": "string",
                        "description": (
                            "只控制该类设备，如 light(灯)、climate(空调)、fan(风扇)；"
                            "不填则控制房间内全部可控设备"
                        ),
                    },
                    "service": {
                        "type": "string",
                        "description": "动作，如 turn_on, turn_off",
                    },
                    "service_data": {
                        "type": "object",
                        "description": '附加参数，如 {"temperature": 24}',
                    },
                },
                "required": ["room", "service"],
            },
        ),
        LlmToolSchema(
            name="activate_scene",
            description=(
                '触发 Home Assistant 的场景（scene.*）或脚本（script.*）。当用户说"执行回家场景"'
                '"运行××脚本""激活××模式"，且 list_scenes 返回的 ha_scenes 中存在对应项时使用。'
                "出于安全考虑，只有用户在\"场景语音控制\"允许清单中显式勾选过的场景 / 脚本才能执行；"
                "未授权时会被拦截，需如实告知用户去设置里勾选，不要改用控制设备绕开限制。"
                "可用 entity_id 精确指定，或只给名称由系统解析。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "scene": {
                        "type": "string",
                        "description": "场景 / 脚本名称（如 回家、观影模式）或 entity_id 前缀关键词",
                    },
                    "entity_id": {
                        "type": "string",
                        "description": "可选：精确的 scene.* / script.* 实体 ID，优先于名称匹配",
                    },
                },
                "required": ["scene"],
            },
        ),
        LlmToolSchema(
            name="activate_home_mode",
            description=(
                '切换家庭模式（如 在家/离家/睡眠/度假）。当用户说"切换到离家模式""开启睡眠模式"'
                '"设为度假模式"这类【整体模式切换】的指令时使用。'
            ),
            parameters={
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "家庭模式名称或ID",
                    },
                },
                "required": ["name"],
            },
        ),
        LlmToolSchema(
            name="get_home_status",
            description=(
                '获取全屋整体状态概览：当前家庭模式与实体总数。当用户问"家里现在什么状态"'
                '"整体情况怎么样"时使用。无需参数。'
            ),
            parameters={"type": "object", "properties": {}},
        ),
        LlmToolSchema(
            name="get_weather",
            description=(
                '查询室外当前天气（温度、天气状况）。当用户问"今天外面几度""外面冷吗"'
                '"今天天气怎么样"时使用。无需参数。'
            ),
            parameters={"type": "object", "properties": {}},
        ),
        LlmToolSchema(
            name="get_calendar",
            description=(
                '查询日历外出安排：当前是否处于外出时段、接下来何时外出。当用户问"今天要出门吗"'
                '"什么时候外出"时使用。无需参数。'
            ),
            parameters={"type": "object", "properties": {}},
        ),
        LlmToolSchema(
            name="list_scenes",
            description=(
                "列出 Home Assistant 侧可用场景（ha_scenes，含 scene.* / script.*，"
                "其中 allowed 表示是否已授权语音执行）。当用户问有哪些场景、想执行场景但不确定名字时先调用。"
            ),
            parameters={"type": "object", "properties": {}},
        ),
        LlmToolSchema(
            name="list_home_modes",
            description="列出家庭模式名称（在家/离家/睡眠等）。切换模式前可先列出。",
            parameters={"type": "object", "properties": {}},
        ),
        LlmToolSchema(
            name="set_light_brightness",
            description="设置灯的亮度（0-100）。需要 entity_id。",
            parameters={
                "type": "object",
                "properties": {
                    "entity_id": {"type": "string", "description": "灯实体 ID，如 light.living_room"},
                    "brightness": {"type": "number", "description": "亮度 0-100"},
                },
                "required": ["entity_id", "brightness"],
            },
        ),
        LlmToolSchema(
            name="set_cover_position",
            description="设置窗帘/遮阳开合位置（0 全关，100 全开）。",
            parameters={
                "type": "object",
                "properties": {
                    "entity_id": {"type": "string", "description": "cover 实体 ID"},
                    "position": {"type": "number", "description": "开合百分比 0-100"},
                },
                "required": ["entity_id", "position"],
            },
        ),
        LlmToolSchema(
            name="media_control",
            description="控制媒体播放器：play / pause / stop / next / previous / volume。",
            parameters={
                "type": "object",
                "properties": {
                    "entity_id": {"type": "string", "description": "media_player 实体 ID"},
                    "action": {
                        "type": "string",
                        "description": "play、pause、stop、next、previous、volume",
                    },
                    "volume": {"type": "number", "description": "音量 0-1，仅 action=volume 时需要"},
                },
                "required": ["entity_id", "action"],
            },
        ),
        LlmToolSchema(
            name="query_camera",
            description="查询摄像头当前状态（是否录像/是否运动）。不返回画面。",
            parameters={
                "type": "object",
                "properties": {
                    "entity_id": {"type": "string", "description": "camera 实体 ID"},
                },
                "required": ["entity_id"],
            },
        ),
    ]
