"""自动化族与自动化草案的工具 schema（从 home_tools_schemas 拆出，避免单文件继续膨胀）。"""

from __future__ import annotations

from ..providers.llm_provider_interface import LlmToolSchema


def _automation_draft_schemas() -> list[LlmToolSchema]:
    """自动化草案（Phase 1）：发现 / 创建 / 修订 / 读取。"""
    return [
        LlmToolSchema(
            name="automation_discover",
            description=(
                "列出已有自动化：HA 的 automation.*、本机计划任务与家规。"
                "在用户说「新建一个自动化」前先查重，避免重复规则。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "sources": {
                        "type": "array",
                        "items": {"type": "string", "enum": ["ha", "aura"]},
                        "description": "要查询的来源，缺省为全部",
                    }
                },
            },
        ),
        LlmToolSchema(
            name="automation_draft_create",
            description=(
                "生成一份自动化草案（只预览，不写入 HA、不执行）。"
                'spec 形状：{"intentSummary":"每天 22:00 关闭客厅主灯",'
                '"targets":[{"entityId":"light.living_room"}],'
                '"trigger":{"type":"time","at":"22:00"},'
                '"action":{"service":"light.turn_off"}}。'
                'targets 也接受字符串实体 ID 或设备中文名（会自动解析）；action 也可直接写 "light.turn_off"；'
                "trigger 与 triggers 等价，可为 time（at/cron/days）或 state（entityId/from/to）。"
                "动作或目标含 {{ }} 模板会被拒绝；lock / alarm_disarm / 车库门 / 燃气阀属高危，永不就绪。"
                "用户要求「每天/每周/长期自动执行」时先用本工具生成预览，再在回复里告诉用户去"
                "「设置 → 自动化与安防 → 自动化草案」查看；需要真正生效时再用 schedule_task 落地。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "spec": {
                        "type": "object",
                        "description": (
                            "自动化规范：targets / trigger（或 triggers）/ action / conditions / "
                            "forDuration / mode / timezone / intentSummary"
                        ),
                    },
                    "rawPrompt": {"type": "string", "description": "用户原话（用于审计与解释）"},
                    "sessionKey": {"type": "string", "description": "会话 key（幂等与隔离用；缺省由系统注入）"},
                    "utterance_kind": {
                        "type": "string",
                        "enum": ["RULE", "AMBIGUOUS"],
                        "description": "AMBIGUOUS 时先问「一次性还是长期规则」",
                    },
                },
                "required": ["spec"],
            },
        ),
        LlmToolSchema(
            name="automation_draft_revise",
            description="在已有草案上追加一版修改（触发条件浅合并，其余字段替换）。",
            parameters={
                "type": "object",
                "properties": {
                    "draftId": {"type": "string", "description": "草案 ID"},
                    "patch": {"type": "object", "description": "要修改的字段"},
                },
                "required": ["draftId", "patch"],
            },
        ),
        LlmToolSchema(
            name="automation_draft_get",
            description="读取草案的最新规范与预览（含冲突与盲区报告）。",
            parameters={
                "type": "object",
                "properties": {"draftId": {"type": "string", "description": "草案 ID"}},
                "required": ["draftId"],
            },
        ),
        LlmToolSchema(
            name="automation_draft_list",
            description=(
                "列出待确认的自动化草案（含 ID、状态、摘要、目标与过期时间）。"
                "用户问「有哪些自动化草案 / 刚才那个规则呢」时使用。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "最多返回条数（默认 10，上限 50）"},
                    "sessionKey": {"type": "string", "description": "可选：只看指定会话"},
                },
            },
        ),
        LlmToolSchema(
            name="automation_draft_apply",
            description=(
                "把待确认草案落成一条本机计划任务（不写 HA）。"
                "只有用户明确说「就按这个执行 / 确认生成 / 正式生效」时才调用；"
                "草案包含多个目标或非时间触发时需要先 revise 拆分或改用 schedule_task。"
                "存在确定性冲突时必须带 acknowledge_conflicts=true，且要先向用户确认。"
            ),
            parameters={
                "type": "object",
                "properties": {
                    "draftId": {"type": "string", "description": "草案 ID"},
                    "acknowledge_conflicts": {
                        "type": "boolean",
                        "description": "用户已知晓并同意跳过确定性冲突警告",
                    },
                },
                "required": ["draftId"],
            },
        ),
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
                "创建计划任务（一次性或周期）。四种动作选一种："
                "①提醒消息（message/标题 title，到点推送通知，如“10 分钟后提醒我关火”）；"
                "②控制设备（entity_id + service）；③激活场景（scene）；"
                "④切换家庭模式（mode）。执行时会重新校验权限与高危拦截。"
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
                    "entity_id": {"type": "string", "description": "要控制的设备实体 ID（或场景实体 ID）"},
                    "domain": {
                        "type": "string",
                        "description": "设备域，留空时按 entity_id 前缀推断",
                    },
                    "service": {
                        "type": "string",
                        "description": "服务名，如 turn_off / turn_on / set_temperature",
                    },
                    "service_data": {"type": "object", "description": "服务附加参数"},
                    "scene": {"type": "string", "description": "场景名称（与 entity_id + service 三选一）"},
                    "mode": {"type": "string", "description": "家庭模式名称（与上面几种动作选一种）"},
                    "message": {
                        "type": "string",
                        "description": "提醒动作：到点要推送的消息内容（1-500 字），如「该关火了」",
                    },
                    "title": {"type": "string", "description": "提醒动作：通知标题（可选，最多 120 字）"},
                    "channels": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "提醒动作：投递渠道子集（in_app/socket/webpush/wecom/email），不填走默认通道",
                    },
                    "expected_state": {
                        "type": "string",
                        "description": "可选前置状态：设备已是该状态时跳过本次执行（如 off）；只对设备控制生效",
                    },
                },
                "required": ["name"],
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
                "返回标题、摘要，必要时附前几条结果的网页正文。不要把搜索结果当作设备状态。"
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
                    "detail": {
                        "type": "integer",
                        "description": "需要正文摘取的结果条数，默认 2；0 表示只要摘要，最大 3",
                        "minimum": 0,
                        "maximum": 3,
                    },
                },
                "required": ["query"],
            },
        ),
    ]
