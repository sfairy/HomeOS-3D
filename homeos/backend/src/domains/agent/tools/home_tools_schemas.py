"""智能管家 LLM 工具 schema 定义（纯数据，从 HomeToolsService 抽离）。"""

from __future__ import annotations

from ..providers.llm_provider_interface import LlmToolSchema


def _search_and_control_schemas() -> list[LlmToolSchema]:
    """搜索 / 查状态 / 控制设备 / 列房间这几类基础工具的 schema。"""
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
                        "description": (
                            '附加参数，如 {"temperature": 24}。'
                            '安防布防（alarm_control_panel.alarm_arm_*）可传 {"code": "1234"}；'
                            "code 只对安防 / 门锁域生效，其它域会被过滤。"
                        ),
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
    ]


def _room_and_mode_schemas() -> list[LlmToolSchema]:
    """房间快照 / 按房间批量控制 / 场景 / 家庭模式这几类工具 schema。"""
    return [
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
                '出于安全考虑，只有用户在"场景语音控制"允许清单中显式勾选过的场景 / 脚本才能执行；'
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
    ]


def _status_and_scene_schemas() -> list[LlmToolSchema]:
    """全屋状态 / 天气 / 日历 / 场景列表 / 家庭模式列表这几类查询工具 schema。"""
    return [
        LlmToolSchema(
            name="get_home_status",
            description=(
                "获取全屋整体状态概览：当前家庭模式、实体总数、开灯数、开启中的设备、"
                '门窗/窗帘状态、安防状态、平均温湿度、今日用电。当用户问"家里现在什么状态"'
                '"整体情况怎么样""家里有没有异常"时使用。无需参数。'
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
    ]


def _device_detail_schemas() -> list[LlmToolSchema]:
    """亮度 / 窗帘位置 / 媒体控制 / 摄像头查询这几类细粒度工具 schema。"""
    return [
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
                        "enum": ["play", "pause", "stop", "next", "previous", "volume"],
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


def _insight_schemas() -> list[LlmToolSchema]:
    """能耗 / 历史 / 通知 / 天气预报这几类只读洞察工具 schema。"""
    return [
        LlmToolSchema(
            name="get_energy_usage",
            description=(
                "查询家庭用电：近 N 天总用电、今日用电、本月用电、每日曲线与用电最多的设备。"
                '当用户问"这个月用了多少电""今天耗电多少""哪个设备最费电"时使用。'
                "数据来自能耗日聚合表；未配置电表时返回 0。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "days": {
                        "type": "integer",
                        "description": "回溯天数，1-90，默认 7",
                        "minimum": 1,
                        "maximum": 90,
                    },
                },
            },
        ),
        LlmToolSchema(
            name="query_events",
            description=(
                "查询设备状态变更历史（谁在什么时候从什么状态变成什么状态）。"
                '当用户问"刚才谁开了灯""客厅灯什么时候开的""今天有哪些设备变过"时使用。'
                "最新在前；可按实体 ID 或设备类型过滤。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "hours": {
                        "type": "integer",
                        "description": "回溯小时数，1-168，默认 24",
                        "minimum": 1,
                        "maximum": 168,
                    },
                    "limit": {
                        "type": "integer",
                        "description": "最多返回条数，1-50，默认 20",
                        "minimum": 1,
                        "maximum": 50,
                    },
                    "entity_id": {
                        "type": "string",
                        "description": "可选：只看某个设备，如 light.living_room",
                    },
                    "domain": {
                        "type": "string",
                        "description": "可选：只看某类设备，如 light、switch、binary_sensor",
                    },
                },
            },
        ),
        LlmToolSchema(
            name="get_notifications",
            description=(
                "查询通知中心：未读数量 + 最近通知（含级别、来源、关联设备、时间）。"
                '当用户问"有什么通知""有没有未读消息""刚才报警了吗"时使用。'
            ),
            parameters={
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "最多返回条数，1-50，默认 10",
                        "minimum": 1,
                        "maximum": 50,
                    },
                    "unread_only": {
                        "type": "boolean",
                        "description": "只返回未读通知，默认 false",
                    },
                },
            },
        ),
        LlmToolSchema(
            name="get_weather_forecast",
            description=(
                "查询未来天气预报（约 3 小时一个时段：温度、天气、降水概率）。"
                '当用户问"今天会下雨吗""明天天气怎么样""需要带伞吗"时使用。'
                "与 get_weather（当前天气）互补。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "count": {
                        "type": "integer",
                        "description": "返回时段数，1-24，默认 8（约 24 小时）",
                        "minimum": 1,
                        "maximum": 24,
                    },
                },
            },
        ),
    ]


def build_home_tool_schemas() -> list[LlmToolSchema]:
    """返回暴露给 LLM 的工具 schema 列表。

    包含搜索、查状态、控制设备、列房间、房间快照、按房间批量控制等工具。
    只读洞察工具（能耗 / 历史 / 通知 / 预报）单独一组，便于后续按配置裁剪。
    """
    return [
        *_search_and_control_schemas(),
        *_room_and_mode_schemas(),
        *_status_and_scene_schemas(),
        *_device_detail_schemas(),
        *_insight_schemas(),
        *_automation_schemas(),
    ]


def _automation_schemas() -> list[LlmToolSchema]:
    """自动化族：设备时序 / 主动巡检 / 诊断日志 / 家规 / 计划任务 / 联网搜索。"""
    return [
        LlmToolSchema(
            name="query_device_timeline",
            description=(
                "查询设备状态翻转时序：某设备最近何时被打开/关闭、持续多久、由谁触发"
                "（手动 App / HA 自动化 / 外部设备）。回答“空调用几小时了”“灯什么时候开的”时使用。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "entity_id": {
                        "type": "string",
                        "description": "设备实体 ID，如 light.living_room；与 area_id 二选一",
                    },
                    "area_id": {
                        "type": "string",
                        "description": "区域 ID 或房间名，如 客厅；按房间查全部设备的翻转记录",
                    },
                    "hours": {
                        "type": "number",
                        "description": "回溯小时数，默认 24，最大 1440",
                        "minimum": 1,
                        "maximum": 1440,
                    },
                    "limit": {
                        "type": "integer",
                        "description": "最多返回多少条翻转记录，默认 20，最大 100",
                        "minimum": 1,
                        "maximum": 100,
                    },
                },
            },
        ),
        LlmToolSchema(
            name="run_proactive_patrol",
            description=(
                "立即执行一次主动巡检：检查无人房间的常开设备与能耗浪费。"
                "自动关停默认关闭，只有用户开启且家规允许时才会关灯/关风扇等低危设备。"
            ),
            parameters={"type": "object", "properties": {}},
        ),
        LlmToolSchema(
            name="query_system_logs",
            description=("查询系统诊断日志：设备离线/恢复、低电量、连接异常。回答“哪些设备掉线了”“谁电量低”时使用。"),
            parameters={
                "type": "object",
                "properties": {
                    "kind": {
                        "type": "string",
                        "description": "诊断类型过滤：设备离线 / 恢复 / 低电量 / 连接异常",
                        "enum": [
                            "DEVICE_OFFLINE",
                            "DEVICE_RECOVERED",
                            "LOW_BATTERY",
                            "CONNECTIVITY",
                        ],
                    },
                    "search": {"type": "string", "description": "按设备、区域或消息关键字过滤"},
                    "level": {
                        "type": "string",
                        "description": "日志级别过滤，如 warning / error",
                        "enum": ["info", "success", "warning", "error"],
                    },
                    "limit": {
                        "type": "integer",
                        "description": "最多返回条数，默认 20，最大 50",
                        "minimum": 1,
                        "maximum": 50,
                    },
                },
            },
        ),
        LlmToolSchema(
            name="manage_user_policy",
            description=(
                "管理用户家规：创建 / 列出 / 启用停用 / 删除。家规描述“无人多久后关闭哪些设备”。"
                "创建时会检测与既有规则的冲突，冲突需用户确认后用 forceOverride 覆盖。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "description": "create 新建 / list 列出 / toggle 启停 / delete 删除",
                        "enum": ["create", "list", "toggle", "delete"],
                    },
                    "name": {"type": "string", "description": "家规名称（create 必填）"},
                    "description": {"type": "string", "description": "家规说明"},
                    "area": {
                        "type": "string",
                        "description": "目标区域名称或 ID；留空表示全屋",
                    },
                    "domains": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "目标设备域，仅支持 light / switch / fan / climate",
                    },
                    "idle_minutes": {
                        "type": "number",
                        "description": "无人后多少分钟触发，默认 30",
                        "minimum": 1,
                        "maximum": 1440,
                    },
                    "auto_close": {
                        "type": "boolean",
                        "description": "是否自动关闭命中的低危设备，默认 false（仅提醒）",
                    },
                    "rule_id": {"type": "string", "description": "toggle / delete 时的家规 ID"},
                    "force_override": {
                        "type": "boolean",
                        "description": "检测到冲突时是否强制写入",
                    },
                },
                "required": ["action"],
            },
        ),
        LlmToolSchema(
            name="schedule_task",
            description=(
                "创建计划任务（一次性或周期）。动作只能是 control_device / activate_scene / "
                "activate_home_mode；执行时会重新校验权限与高危拦截。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "任务名称，如「睡前关客厅灯」"},
                    "schedule_type": {
                        "type": "string",
                        "description": "ONCE（一次性）或 RECURRING（周期，默认每天）",
                        "enum": ["ONCE", "RECURRING"],
                    },
                    "delay_minutes": {
                        "type": "number",
                        "description": "一次性任务：多少分钟后执行（与 run_at 二选一）",
                        "minimum": 1,
                        "maximum": 43200,
                    },
                    "run_at": {
                        "type": "string",
                        "description": "一次性任务：执行时间，ISO 或「YYYY-MM-DD HH:MM」",
                    },
                    "time": {
                        "type": "string",
                        "description": "周期任务：每天几点执行，形如 22:00",
                    },
                    "cron": {
                        "type": "string",
                        "description": "周期任务：5 段 cron 表达式，如 0 22 * * *",
                    },
                    "entity_id": {"type": "string", "description": "要控制的设备实体 ID"},
                    "domain": {
                        "type": "string",
                        "description": "设备域，留空时按 entity_id 前缀推断",
                    },
                    "service": {
                        "type": "string",
                        "description": "服务名，如 turn_off / turn_on / set_temperature",
                    },
                    "service_data": {"type": "object", "description": "服务附加参数"},
                    "expected_state": {
                        "type": "string",
                        "description": "可选前置状态：设备已是该状态时跳过本次执行（如 off）",
                    },
                },
                "required": ["name", "entity_id", "service"],
            },
        ),
        LlmToolSchema(
            name="list_scheduled_tasks",
            description="列出已创建的计划任务及其下次执行时间、最近执行结果。",
            parameters={"type": "object", "properties": {}},
        ),
        LlmToolSchema(
            name="cancel_scheduled_task",
            description="删除计划任务。",
            parameters={
                "type": "object",
                "properties": {
                    "task_id": {"type": "string", "description": "计划任务 ID"},
                    "name": {"type": "string", "description": "或按任务名称关键词删除"},
                },
            },
        ),
        LlmToolSchema(
            name="web_search",
            description=(
                "联网搜索（受用户开关与域名白名单约束）。查天气、新闻、常识或家政技巧时使用；"
                "只返回网页摘要，不要把搜索结果当作设备状态。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"},
                    "count": {
                        "type": "integer",
                        "description": "返回结果数，默认 5，最大 8",
                        "minimum": 1,
                        "maximum": 8,
                    },
                },
                "required": ["query"],
            },
        ),
    ]
