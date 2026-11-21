"""智能管家 LLM 工具 schema 定义（纯数据，从 HomeToolsService 抽离）。"""

from __future__ import annotations

from .home_tools_schemas_automation import _automation_draft_schemas, _automation_schemas
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
            description=('获取某个房间内所有设备的当前状态快照，用于理解"客厅现在几度、灯开没开"这类环境感知问题。'),
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
                            "只控制该类设备，如 light(灯)、climate(空调)、fan(风扇)；不填则控制房间内全部可控设备"
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
                "门窗/窗帘状态、安防状态、平均温湿度、今日用电，以及是否有人在家、"
                '在家几人、哪些房间有人。当用户问"家里现在什么状态"'
                '"整体情况怎么样""家里有没有异常""家里有人吗""哪个房间有人"时使用。无需参数。'
            ),
            parameters={"type": "object", "properties": {}},
        ),
        LlmToolSchema(
            name="get_weather",
            description=(
                '查询室外当前天气（温度、天气状况）。当用户问"今天外面几度""外面冷吗""今天天气怎么样"时使用。无需参数。'
            ),
            parameters={"type": "object", "properties": {}},
        ),
        LlmToolSchema(
            name="get_calendar",
            description=(
                '查询日历外出安排：当前是否处于外出时段、接下来何时外出。当用户问"今天要出门吗"'
                '"什么时候外出"时使用。只回答「是否外出」，具体日历事件（明天有什么安排、'
                "帮我在日历里加一条）请用 manage_calendar。无需参数。"
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
            description=(
                "控制媒体播放器，或点歌 / 打开电视应用。"
                "on/off/play/pause/stop/next/previous/volume 需要 entity_id（Apple TV 的 off 走待机）；"
                "search_music/play_music/play_track 用 artist + track（走 Music Assistant）；"
                "open_tv_app 用 entity_id + app（走设备画像）。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "entity_id": {"type": "string", "description": "media_player 实体 ID（点歌可省略）"},
                    "action": {
                        "type": "string",
                        "description": "动作类型",
                        "enum": [
                            "on",
                            "off",
                            "play",
                            "pause",
                            "stop",
                            "next",
                            "previous",
                            "volume",
                            "search_music",
                            "play_music",
                            "play_track",
                            "open_tv_app",
                        ],
                    },
                    "volume": {"type": "number", "description": "音量 0-1，仅 action=volume 时需要"},
                    "artist": {"type": "string", "description": "歌手（点歌用）"},
                    "track": {"type": "string", "description": "歌曲名（点歌用）"},
                    "app": {"type": "string", "description": "电视应用名（open_tv_app 用）"},
                    "area_id": {
                        "type": "string",
                        "description": "房间 ID（点歌默认音箱 / open_tv_app 选电视用）",
                    },
                },
                "required": ["action"],
            },
        ),
        LlmToolSchema(
            name="query_camera",
            description=(
                "查询摄像头当前状态（是否录像/是否运动）并返回一张最新快照图片。"
                "回答「看看客厅摄像头」「门口有人吗」时使用；受限账号或未授权摄像头会被拒绝。"
            ),
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
                "电表按 device_class=energy / 单位 kWh|Wh|MWh 自动发现（实体名不需要含 energy），"
                "接入时会用 HA 统计/历史回填近 7 天；家里确实没有电量实体时才返回 0。"
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
                "查询通知中心：未读数量 + 最近通知（含级别、来源、关联设备、时间）；"
                "action=mark_all_read 可把全部未读标记为已读。"
                '当用户问"有什么通知""有没有未读消息""刚才报警了吗"时使用；'
                '说"都标记已读""清掉未读"时用 mark_all_read。'
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "description": "list 查询（默认）/ mark_all_read 全部标记已读",
                        "enum": ["list", "mark_all_read"],
                    },
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


def _business_schemas() -> list[LlmToolSchema]:
    """业务能力族：通知推送 / 待办清单 / 日历事件 / 偏好记忆。"""
    return [
        LlmToolSchema(
            name="send_notification",
            description=(
                "给家人或自己发一条通知（站内 + 已配置的 WebPush / 企微 / 邮件）。"
                '当用户说"告诉爸妈我晚点到""发消息提醒大家关火""通知一下我在忙"时使用。'
                "只能走系统已配置的通道，不能指定手机号或链接；只发一条，不要连续刷屏。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "message": {"type": "string", "description": "消息正文（1-500 字）"},
                    "title": {"type": "string", "description": "标题（可选，最多 120 字）"},
                    "level": {
                        "type": "string",
                        "description": "普通 info（默认）/ 需要强调的 warn",
                        "enum": ["info", "warn"],
                    },
                    "channels": {
                        "type": "array",
                        "items": {"type": "string", "enum": ["in_app", "socket", "webpush", "wecom", "email"]},
                        "description": "投递渠道子集；不填走通知中心默认通道",
                    },
                },
                "required": ["message"],
            },
        ),
        LlmToolSchema(
            name="manage_todo",
            description=(
                "管理待办 / 购物清单：列出条目、添加、完成、删除、清理已完成。"
                '当用户说"把牛奶加到购物清单""购物清单还有什么""完成牛奶""删掉鸡蛋"时使用。'
                "有多个清单且未指定时先返回候选，需追问用户。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "description": "list 列出 / add 添加 / complete 完成 / remove 删除 / clear_completed 清理已完成",
                        "enum": ["list", "add", "complete", "remove", "clear_completed"],
                    },
                    "entity_id": {"type": "string", "description": "清单实体 ID（todo.*）；只有一个清单时可省略"},
                    "item": {"type": "string", "description": "条目内容（add / complete / remove 必填）"},
                    "due": {
                        "type": "string",
                        "description": "add：截止时间，YYYY-MM-DD（全天）或 YYYY-MM-DD HH:MM（定时），可选",
                    },
                },
                "required": ["action"],
            },
        ),
        LlmToolSchema(
            name="manage_calendar",
            description=(
                "查询或创建 HA 日历事件。list 查某段时间的安排；create 新建事件。"
                '用户说"明天下午有什么安排""帮我加个周五下午三点的会"时使用；'
                "只问是否外出时段请用 get_calendar。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "description": "list 查询 / create 创建",
                        "enum": ["list", "create"],
                    },
                    "entity_id": {"type": "string", "description": "日历实体 ID（calendar.*）；只有一个日历时可省略"},
                    "summary": {"type": "string", "description": "create：事件标题"},
                    "start": {"type": "string", "description": "开始时间（ISO 或 YYYY-MM-DD HH:MM）；list 时默认现在"},
                    "end": {
                        "type": "string",
                        "description": "结束时间；list 时默认 7 天后，create 时默认开始后 1 小时",
                    },
                    "all_day": {"type": "boolean", "description": "create：是否全天事件"},
                    "location": {"type": "string", "description": "create：地点（可选）"},
                    "description": {"type": "string", "description": "create：备注（可选）"},
                },
                "required": ["action"],
            },
        ),
        LlmToolSchema(
            name="manage_memory",
            description=(
                "记住或忘记用户的长期偏好（如「我睡觉喜欢灯调到 20%」「我不喜欢空调直吹」）。"
                "只在用户表达**长期**偏好时使用；一次性指令、设备当前状态、访客信息、"
                "密码/证件等敏感内容不要写入。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "description": "remember 记住 / forget 忘记",
                        "enum": ["remember", "forget"],
                    },
                    "content": {"type": "string", "description": "偏好内容（<=200 字）"},
                },
                "required": ["action", "content"],
            },
        ),
        LlmToolSchema(
            name="manage_learning",
            description=(
                "管理设备别名、房间默认设备与习惯候选。"
                "用户明确说「以后叫它 X」「客厅默认开这台空调」时用 teach_alias / teach_area_default；"
                "撤销错误学习用 revert；查看已学内容用 list；处理习惯提示用 habit_*。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "description": "操作类型",
                        "enum": [
                            "teach_alias",
                            "teach_area_default",
                            "list",
                            "revert",
                            "pause",
                            "resume",
                            "delete",
                            "habit_list",
                            "habit_dismiss",
                            "habit_accept",
                            "habit_reset",
                        ],
                    },
                    "alias": {"type": "string", "description": "别名（teach_alias 用，<=60 字）"},
                    "area_id": {"type": "string", "description": "房间 ID（teach_area_default 用）"},
                    "domain": {"type": "string", "description": "设备域，如 light / climate（teach_area_default 用）"},
                    "entity_id": {"type": "string", "description": "目标实体 ID"},
                    "config_id": {"type": "string", "description": "学习配置 ID（revert/pause/resume/delete 用）"},
                    "revision": {"type": "integer", "description": "期望 revision（revert 时防覆盖）"},
                    "candidate_id": {"type": "string", "description": "习惯候选 ID"},
                    "status": {"type": "string", "description": "习惯候选状态过滤（habit_list 用）"},
                    "scope": {"type": "string", "description": "作用域过滤（list 用）"},
                },
                "required": ["action"],
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
        *_business_schemas(),
        *_automation_schemas(),
        *_automation_draft_schemas(),
    ]
