/**
 * 后端 API 错误文案集中定义
 *
 * 所属模块：backend/src/common/errors
 * 职责：将所有业务错误码与对应中文文案集中维护在一个常量对象中，
 *   便于：
 *   - 业务代码通过 badRequest(API_ERROR.XXX) 抛出统一格式异常；
 *   - 前端通过错误码（key）做 i18n 或精细化提示；
 *   - 单元测试与日志检索按 key 而非文案匹配。
 * 用法：badRequest(API_ERROR.SCENE_NOT_FOUND)
 *
 * 字段约定：
 *   - 静态文案为字符串；
 *   - 动态文案为 (...args) => string 工厂函数，占位符须用模板字符串。
 *   - key 命名采用 <MODULE>_<ACTION>_<REASON> 大写下划线风格，禁止翻译 key 本身。
 */
export const API_ERROR = {
  // === auth：账户鉴权、登录、MFA、访客短码等 ===
  AUTH_ACCOUNT_LOCKED: '账户已锁定，请稍后再试', // 登录连续失败触发账户锁定
  AUTH_CANNOT_DELETE_LAST_ADMIN: '不能删除最后一个管理员',
  AUTH_CANNOT_DELETE_SELF: '不能删除当前登录用户',
  AUTH_CANNOT_MODIFY_ADMIN: '无权修改管理员账户',
  AUTH_GUEST_TOKEN_INVALID: '访客凭证无效或已过期',
  AUTH_GUEST_SHARE_CODE_MISSING: '缺少访客短码',
  AUTH_GUEST_SHARE_CODE_INVALID: '访客短码无效或已过期',
  AUTH_GUEST_SHARE_CODE_PAYLOAD_INVALID: '访客短码数据无效',
  AUTH_GUEST_SHARE_CODE_REVOKED: '访客短码已失效，请重新获取',
  AUTH_INVALID_CREDENTIALS: '凭据无效',
  AUTH_INVALID_ROLE: '无效角色',
  AUTH_MFA_ADMIN_ONLY: '仅管理员可配置 MFA',
  AUTH_MFA_NOT_ENABLED: '该账户未启用 MFA',
  AUTH_MFA_SETUP_REQUIRED: '请先发起 MFA 设置',
  AUTH_MFA_TOTP_INVALID: '验证码无效',
  AUTH_MFA_RELOGIN_REQUIRED: '已启用 MFA，请使用验证码重新登录',
  AUTH_NEED_CURRENT_PASSWORD: '修改密码需提供当前密码',
  AUTH_NOT_GUEST_TOKEN: '非访客凭证',
  AUTH_PASSWORD_WRONG: '当前密码不正确',
  AUTH_SESSION_EXPIRED: '会话已失效，请重新登录',
  AUTH_SYSTEM_INITIALIZED: '系统已初始化',
  AUTH_USER_EXISTS: '用户名已存在',
  AUTH_USER_NOT_FOUND: '用户不存在',
  AUTH_USER_OR_SESSION_INVALID: '用户不存在或会话已失效',
  AUTH_USERNAME_REQUIRED: '用户名不能为空',

  // === access / guards：角色权限、设备访问控制、Guard 拦截 ===
  ACCESS_CHILD_NO_WHITELIST: '儿童账户未配置设备白名单，无法操作设备', // 儿童角色缺少设备白名单
  ACCESS_ENTITY_DENIED: '当前账户无权操作该设备',
  TARGET_LABEL_UNRESOLVED: (ids: string) =>
    `未能通过标签 ID（${ids}）解析到实体，请改用 entity_id，或确认 HA 实体已打上对应标签`,
  ACCESS_ENTITY_FORBIDDEN: '无权访问该实体',
  ACCESS_GUEST_DEVICE_DENIED: '访客账户无权控制设备',
  ACCESS_GUEST_READ_ONLY: '访客账户仅可查看，无权修改',
  ACCESS_GUEST_SCENE_DENIED: '访客无权执行该场景',
  ACCESS_GROUP_PARTIAL_DENIED: '当前账户无权操作分组内部分设备',
  ACCESS_LOGIN_REQUIRED: '需要登录用户',
  ACCESS_NOTIFY_DND_ADMIN: '仅管理员可修改免打扰时段',
  ACCESS_ROLE_DEVICE_DENIED: '当前角色无权操作此设备类型',

  // === config / backup：系统配置、备份包导入校验 ===
  CONFIG_JSON_OBJECT_REQUIRED: '配置须为 JSON 对象', // 配置导入时根节点非 JSON 对象
  /** 数据保留策略包含未知表键（PUT /system/config/retention 白名单校验） */
  RETENTION_KEYS_INVALID: '包含无效的数据保留策略配置项',
  BACKUP_BUNDLE_CONFIRM_REQUIRED: '完整备份还原需 confirm: true',
  BACKUP_BUNDLE_INVALID_JSON: '无效的备份包 JSON',
  BACKUP_BUNDLE_INVALID_STRUCTURE: '备份包结构无效（缺少必要字段或字段类型错误）',
  BACKUP_BUNDLE_UI_LAYOUT_INVALID: '备份包中 UI 布局为空或格式无效',
  BACKUP_FILE_INVALID_NAME: '无效的备份文件名（仅允许 homeos-bundle-*.json）',
  BACKUP_FILE_NOT_FOUND: '备份文件不存在',
  BACKUP_CONFIG_CONFIRM_REQUIRED: '全量替换需 confirm: true',
  BACKUP_CONFIG_MISSING: '缺少 config 对象',
  BACKUP_ORCHESTRATOR_CONFIRM_REQUIRED:
    '联动器全量导入需 confirm: true（将清空并替换现有自动化/场景/脚本等）',
  BACKUP_ORCHESTRATOR_EMPTY: '联动器备份为空或格式无效',
  BACKUP_BUNDLE_SECTIONS_INVALID: '备份包分区无效', // 导入分区不在白名单（ui/orchestrator/appConfig/users）

  // === ui-config：UI 配置文件上传/图标/路径校验 ===
  UI_CONFIG_SVG_ONLY: '仅支持 SVG 格式', // 自定义图标仅允许 SVG
  UI_CONFIG_DEFAULT_DELETE_DENIED: '不能删除默认配置',
  UI_CONFIG_PATH_TRAVERSAL: '检测到目录遍历攻击',
  UI_CONFIG_DIR_EXISTS: '目录已存在',
  UI_CONFIG_FILE_TYPE_DENIED: (ext: string) => `不允许的文件类型 "${ext}"。`,
  UI_CONFIG_FILE_NOT_FOUND: '文件或目录未找到',
  UI_CONFIG_ICON_NOT_FOUND: '图标文件不存在',

  // === ha-sync discovery：与 Home Assistant 同步自动化/场景/脚本 ===
  HA_DISCOVER_AUTOMATIONS_FAILED: (detail: string) => `发现自动化失败: ${detail}`, // 拉取 HA 自动化失败
  HA_DISCOVER_SCENES_FAILED: (detail: string) => `发现场景失败: ${detail}`,
  HA_DISCOVER_SCRIPTS_FAILED: (detail: string) => `发现脚本失败: ${detail}`,
  HA_NOT_CONFIGURED: 'HA 未配置',
  HA_NOT_CONNECTED: 'HA 未连接',
  HA_SCENE_EXEC_FAILED: (detail: string) => `HA 场景执行失败: ${detail}`,
  HA_SCRIPT_EXEC_FAILED: (detail: string) => `HA 脚本执行失败: ${detail}`,
  HA_SCENE_NOT_CONNECTED: 'HA 未连接，无法执行场景',
  HA_SCRIPT_NOT_CONNECTED: 'HA 未连接，无法执行脚本',
  HA_SCENE_NOT_SYNCED: '已勾选由 HA 执行，但尚未同步到 Home Assistant，请先推送后再执行',
  HA_SCRIPT_NOT_SYNCED: '已勾选由 HA 执行，但尚未同步到 Home Assistant，请先推送后再执行',
  SCRIPT_LOCAL_UNSUPPORTED:
    '本地执行仅支持 call_service 与数值 delay；请勾选「由 HA 执行」并同步后执行',
  HA_BATCH_NOT_CONNECTED: 'HA 未连接，无法执行批量控制',
  HA_MEDIA_PATH_INVALID: '非法的媒体路径',
  HA_REST_API_FAILED: (status: number | string, detail: string) =>
    `HA REST 接口 ${status}: ${detail}`,
  HA_REST_RESPONSE_FAILED: (status: number | string) => `HA 返回 ${status}`,
  HA_WS_NOT_CONNECTED: 'WebSocket 未连接',
  HA_COMMAND_BRIDGE_UNAVAILABLE: 'Redis 不可用，HA 命令桥接未就绪',
  HA_COMMAND_BRIDGE_TIMEOUT: 'HA 命令桥接超时',
  HA_CONFIG_SYNC_FAILED: (component: string, status: number | string, detail: string) =>
    `HA ${component} 同步失败 ${status}: ${detail}`,
  HA_CONFIG_DELETE_FAILED: (component: string, status: number | string, hint = '') =>
    `HA ${component} 删除失败 ${status}${hint}`,
  HA_FLOW_FAILED: (status: number | string, message: string) =>
    `HA Flow 失败 ${status}: ${message}`,
  HA_TEMPLATE_OPTIONS_FLOW_START_FAILED: '无法启动 template options flow',
  HA_TEMPLATE_CONFIG_FLOW_START_FAILED: '无法启动 template config flow',
  HA_TEMPLATE_ENTRY_ID_MISSING: 'template helper 创建完成但未返回 entry_id',
  HA_FLOW_ABORTED: (reason: string) => `HA Flow 已中止: ${reason}`,
  HA_FLOW_STEP_UNSUPPORTED: (type: string) => `不支持的 Flow 步骤类型: ${type}`,
  HA_FLOW_MAX_STEPS: (maxSteps: number | string) => `HA Flow 超过 ${maxSteps} 步仍未完成`,
  HA_FLOW_MENU_CHOICE_REQUIRED: (options: string) =>
    `需要选择实体类型 (next_step_id)，可选: ${options}`,
  HA_FLOW_FORM_VALIDATION_FAILED: (detail: string) => `表单校验失败: ${detail}`,
  TTS_XIAOMI_PLAY_TEXT_NOT_FOUND:
    '未找到「播放文本」实体，请在 HA → Xiaomi Home 集成配置中开启 Action 调试模式',

  // === alerts：告警规则配置校验 ===
  ALERT_RULE_NAME_REQUIRED: '规则名称不能为空', // 规则名称缺失
  ALERT_RULE_CONDITION_REQUIRED: '触发条件不能为空',
  ALERT_RULE_DUPLICATE: '已存在相同实体与条件的告警规则',

  // === schedule / lifestyle：日程、生活模式预设 ===
  SCHEDULE_PRESET_NOT_FOUND: (presetId: string) => `未知预设: ${presetId}`, // 预设 ID 不存在

  // === agent / llm：智能助手调用 DeepSeek 等大模型 ===
  AGENT_LLM_NOT_CONFIGURED:
    'DEEPSEEK_API_KEY 未配置，无法调用 DeepSeek。请在设置或 .env 填入，或改用 LLM_PROVIDER=mock',
  AGENT_LLM_UPSTREAM_ERROR: (status: number | string, detail: string) =>
    `DeepSeek 接口错误 ${status}${detail ? `: ${detail}` : ''}`,
  AGENT_LLM_RESPONSE_INVALID: 'DeepSeek 返回结构异常，无 choices[0].message',

  // === voice：语音识别（STT）、对话、HomeOS 语音命令 ===
  VOICE_AUDIO_EMPTY: '音频数据为空', // 上传音频为空
  VOICE_STT_NOT_CONFIGURED:
    '未配置 STT 实体，请在设置 → 语音中配置 STT 实体或确保 HA 已启用 STT 集成',
  VOICE_STT_NO_TEXT: 'HA STT 未返回识别文本',
  VOICE_STT_FAILED: (detail: string) => `HA 语音识别失败: ${detail}`,
  VOICE_HA_CONVERSATION_FAILED: (status: number | string, detail: string) =>
    `HA 对话接口 HTTP ${status}${detail ? `: ${detail}` : ''}`,
  VOICE_HOMEOS_TARGET_MISSING: '未配置 HomeOS 目标 ID',
  VOICE_AUTOMATION_TRIGGER_FAILED: (detail: string) => detail || '自动化触发失败',
  VOICE_HOME_MODE_FAILED: (detail: string) => detail || '家庭模式激活失败',
  VOICE_UNKNOWN_COMMAND_TYPE: '未知 HomeOS 语音命令类型',

  // === home mode：家庭模式（在家/离家/睡眠等）切换与预设 ===
  HOME_MODE_CONFIG_PARSE_FAILED: '模式配置解析失败', // 模式配置 JSON 解析失败
  HOME_MODE_NOT_FOUND: '模式不存在',
  HOME_MODE_PRESET_ACTIONS_EMPTY: '预设动作为空，请检查实体映射',
  HOME_MODE_PRESET_NOT_FOUND: '预设不存在',
  HOME_MODE_LINKAGE_BLOCKED: (reason: string) =>
    reason ? `家庭模式联动已拦截：${reason}` : '家庭模式联动已拦截',

  // === orchestrator：联动器（场景/自动化/脚本统一编排）类型校验 ===
  ORCHESTRATOR_TYPE_INVALID: (types: string) => `type 须为: ${types}`, // 联动器 type 字段非法
  ORCHESTRATOR_UNKNOWN_TYPE: (type: string) => `未知联动器类型: ${type}`,

  // === automation：自动化模板与 YAML 校验 ===
  AUTOMATION_BUILTIN_TEMPLATE_NOT_FOUND: '模板不存在', // 内置模板 ID 未找到
  AUTOMATION_NOT_FOUND: '自动化不存在',
  AUTOMATION_LOCAL_UNSUPPORTED: (detail: string) =>
    `本地引擎不支持以下内容，请勾选「由 HA 执行」或移除后重试: ${detail}`,
  AUTOMATION_RUN_ON_HA_HOMEOS_EXTENSIONS:
    'YAML 含 HomeOS 本地扩展或裸 UUID 实体，不可 runOnHa；请改用本地引擎',
  ORCHESTRATOR_PLACEHOLDERS_PENDING:
    '仍有占位实体未映射，请先完成实体替换后再启用或执行',
  ORCHESTRATOR_YAML_PARSE_FAILED: 'YAML 解析失败',

  // === template market：内置模板库分享导出/导入 ===
  TEMPLATE_SHARE_KIND_INVALID:
    '不是 HomeOS 内置模板分享 JSON（需 kind=homeos-template-share）',
  TEMPLATE_SHARE_INVALID_JSON: '无效的模板分享 JSON',
  TEMPLATE_SHARE_SCHEMA_TOO_NEW: (
    payloadVersion: number | string,
    currentVersion: number | string,
  ) => `模板分享 JSON 版本过新（${payloadVersion}），当前仅支持到 ${currentVersion}`,
  TEMPLATE_SHARE_GROUP_INVALID:
    '模板分享 JSON 中 groups 结构无效（type 仅允许 automation / scene / script）',
  TEMPLATE_SHARE_ITEM_INVALID: '模板分享 JSON 中存在无效模板条目（缺少 id 或 name）',

  // === scene / script：场景与脚本的配置/YAML 校验 ===
  SCENE_CONFIG_PARSE_FAILED: '场景实体配置解析失败', // 场景配置 JSON 解析失败
  SCENE_NOT_FOUND: '场景不存在',
  SCENE_CANCEL_NO_SNAPSHOT:
    '该场景没有可取消的执行：未标记叠加执行，或快照已过期/已取消', // 叠加执行快照不存在或已失效
  SCENE_SCHEDULE_INVALID: '场景定时配置无效：cron 与 at 至少填一项', // 定时条目缺触发方式
  SCENE_SCHEDULE_INVALID_CRON: 'cron 表达式格式无效（需 5 段：分 时 日 月 周）',
  SCENE_SCHEDULE_INVALID_AT: 'at 时间格式无效（需 HH:mm，24 小时制）',
  SCENE_SCHEDULE_INVALID_DAYS: 'days 须为 0-6 的星期数组（0=周日 … 6=周六）',
  SCENE_SCHEDULE_NOT_FOUND: '该场景未配置定时',
  SCENE_SCHEDULE_PERSIST_FAILED: '场景定时配置保存失败',
  SCRIPT_NO_ACTIONS: '脚本无动作序列',
  SCRIPT_NOT_FOUND: '脚本不存在',
  SCRIPT_YAML_PARSE_FAILED: '脚本 YAML 解析失败',

  // === template entity：HA template helper 实体同步 ===
  TEMPLATE_ENTITY_NOT_FOUND: '模板实体不存在', // 模板实体 ID 未找到
  TEMPLATE_DEFINITION_NOT_FOUND: '未找到可同步的 template 定义',

  // === system / proxy：系统配置、API 路径、图片 URL、布局、分页 ===
  SYSTEM_CONFIG_NOT_FOUND: '未找到系统配置', // systemConfig 表对应记录不存在
  SYSTEM_INVALID_API_PATH: '无效的 API 路径',
  SYSTEM_INVALID_IMAGE_URL: '无效或不安全的图片 URL',
  SYSTEM_INVALID_LAYOUT: '无效的布局配置',
  SYSTEM_PAGINATION_REQUIRED: '请提供 page 与 limit 查询参数',

  // === ui-config：UI 配置数据/项目/方案/profile 校验 ===
  UI_CONFIG_DATA_INVALID: '无效的配置数据', // 配置数据格式无效
  UI_CONFIG_FILE_REQUIRED: '没有上传文件',
  UI_CONFIG_PATH_REQUIRED: '需要提供路径',
  UI_CONFIG_PROJECT_ID_REQUIRED: 'projectId 不能为空',
  UI_CONFIG_CLIENT_ID_REQUIRED: 'clientId 不能为空',
  UI_CONFIG_PROFILE_ID_REQUIRED: 'profileId 不能为空',
  UI_CONFIG_TERMINAL_DEFAULT_INVALID: 'newTerminalDefault 须为 activeProfile 或 default',
  UI_CONFIG_PROFILE_NOT_FOUND: (projectId: string) => `配置方案 "${projectId}" 不存在`,
  UI_CONFIG_TERMINAL_BINDING_FORBIDDEN: '无权修改该终端绑定', // 非 admin 仅可修改自己创建的绑定

  // === command proxy：HA 命令代理（透传 service call）参数校验 ===
  PROXY_ENTITY_IDS_REQUIRED: '需要提供 entity_ids 查询参数', // 缺少 entity_ids 查询参数
  PROXY_ENTITY_IDS_MAX: 'entity_ids 最多 15 个',
  PROXY_ENTITY_ID_REQUIRED: 'entity_id 必填',
  PROXY_HOURS_RANGE: 'hours 须在 1–168 之间',
  PROXY_PATH_REQUIRED: '需要提供 path 查询参数',
  PROXY_TOKEN_REQUIRED: '需要提供 token',
  PROXY_URL_REQUIRED: '需要提供 url',
  PROXY_HA_SERVICE_FAILED: (detail: string) => `Home Assistant 服务错误：${detail || '未知错误'}`,

  // === common validation：通用参数校验（entityId/id/数组项等） ===
  VALIDATION_ENTITY_ID_QUERY_REQUIRED: '缺少 entityId 查询参数', // 缺少 entityId 查询参数
  VALIDATION_ENTITY_ID_REQUIRED: '缺少 entityId 参数',
  VALIDATION_PARAMS_REQUIRED: '缺少参数',
  VALIDATION_CIRCUIT_MAP_REQUIRED: '缺少 circuitMap',
  VALIDATION_ID_REQUIRED: '缺少 id',
  VALIDATION_CAMERA_ENTITY_REQUIRED: 'entity_id 须为 camera 实体',
  VALIDATION_OFFER_REQUIRED: 'offer 不能为空',
  VALIDATION_CONFIG_SECTION_INVALID: (section: string) => `无效的配置分区: ${section}`,
  VALIDATION_EXECUTION_TYPE_INVALID: '无效的执行历史类型',
  VALIDATION_JSON_ARRAY_REQUIRED: (label: string) => `${label} 须为合法 JSON 数组`,
  VALIDATION_JSON_ARRAY_TYPE: (label: string) => `${label} 须为 JSON 数组`,
  VALIDATION_ARRAY_ITEM_INVALID: (label: string, index: number) =>
    `${label} 第 ${index + 1} 项无效`,
  VALIDATION_ARRAY_ITEM_ENTITY_ID: (label: string, index: number) =>
    `${label} 第 ${index + 1} 项缺少 entity_id`,
  VALIDATION_ARRAY_ITEM_TYPE: (label: string, index: number) =>
    `${label} 第 ${index + 1} 项缺少 type`,
  VALIDATION_ARRAY_ITEM_TIME: (label: string, index: number) =>
    `${label} 第 ${index + 1} 项时间格式无效（需 HH:mm）`,
  VALIDATION_ARRAY_ITEM_LOCK_ENTITY: (label: string, index: number) =>
    `${label} 第 ${index + 1} 项门锁触发需指定 entityId`,
  VALIDATION_ARRAY_ITEM_STATE_ENTITY: (label: string, index: number) =>
    `${label} 第 ${index + 1} 项状态触发需指定 entityId`,
  VALIDATION_ARRAY_ITEM_STATE_TO: (label: string, index: number) =>
    `${label} 第 ${index + 1} 项状态触发需指定 to`,

  // === domain not-found / auth extras：领域对象未找到与少量鉴权补充 ===
  ENTITY_NOT_FOUND: (entityId: string) => `实体未找到: ${entityId}`, // 实体 ID 不存在于 HA
  RECOMMENDATION_NOT_FOUND: '推荐不存在',
  AUTH_CANNOT_DEMOTE_LAST_ADMIN: '不能降级最后一个管理员',
  SECURITY_ZONE_ID_NAME_REQUIRED: '安防区域 id 与 name 不能为空',
  SECURITY_ZONE_ID_DUPLICATE: (id: string) => `安防区域 id 重复: ${id}`,
  SECURITY_ZONE_NOT_FOUND: '布防区域未匹配到任何已配置区域',
  EMBED_NOT_FOUND: (embedId: string) => `内嵌页「${embedId}」未配置或不存在`,
  EMBED_URL_MISSING: '内嵌地址未配置',
  EMBED_URL_INVALID: '内嵌地址格式无效',
  EMBED_URL_PROTOCOL: '内嵌地址须以 http:// 或 https:// 开头',
  EMBED_URL_LOCALHOST: '内嵌地址不能使用 localhost 或 127.0.0.1',
  EMBED_URL_LAN_ONLY: '内嵌反代仅允许局域网地址',
  EMBED_MOVIEPILOT_URL_MISSING: 'MoviePilot 内嵌地址未配置',
  /** 反代上游不可达（超时 / 拒绝连接 / DNS 失败等） */
  EMBED_UPSTREAM_UNREACHABLE: (url: string) =>
    `无法连接内嵌目标 ${url}。请确认该服务在线，且本机/容器网络可达该局域网地址`,
  EMBED_UPSTREAM_TIMEOUT: (url: string) =>
    `连接内嵌目标 ${url} 超时。请确认该服务在线，且本机/容器网络可达该局域网地址`,
  SECURITY_SENSOR_ENTITY_INVALID: (sid: string) => `传感器 entity_id 格式无效: ${sid}`,
  MOVIEPILOT_URL_NOT_CONFIGURED: 'MoviePilot URL 未在仪表板设置中配置',
  MOVIEPILOT_PROXY_IMAGE_FAILED: '无法通过 MoviePilot 代理获取远程图像',
  SCHEDULE_UPDATE_FAILED: '更新日程提醒失败，记录可能已不存在',
  SCHEDULE_DELETE_FAILED: '删除日程提醒失败，记录可能已不存在',
  SETUP_WIZARD_STEPS_PENDING: (pending: string) => `请先完成向导步骤：${pending}`,
  GUEST_PASS_LIMIT: (max: number) => `临时密码数量已达上限 (${max})，请先撤销旧密码`,
  GUEST_PASS_CRYPTO_SECRET_MISSING:
    'GUEST_PASS_SECRET 或 JWT_SECRET 未配置，无法加密访客密码',
  GUEST_PASS_CRYPTO_DECRYPT_FAILED: '访客密码解密失败',
  GUEST_PASS_LOCK_WRITE_FAILED:
    '门锁写入临时密码失败，请检查门锁集成是否支持 set_usercode，未创建访客通行',

  // === device group：设备分组调用 HA service 校验 ===
  DEVICE_GROUP_DOMAIN_SERVICE_REQUIRED: '必须指定 domain 和 service', // 缺少 domain 或 service 参数

  // === infra：CSRF、分布式锁等基础设施层错误 ===
  CSRF_INVALID: 'CSRF token 无效或缺失', // CSRF token 校验失败

  // === license：商业授权门禁 ===
  LICENSE_INACTIVE: '系统未激活，请导入商业授权许可证。',
  LICENSE_BYPASS_FORBIDDEN_IN_PRODUCTION:
    'HOMEOS_LICENSE_BYPASS 禁止在 production 使用。请移除该环境变量。',

  // === channels / wecom：企业微信通道 ===
  WECOM_CREDENTIALS_MISSING: '企业微信 CorpId/CorpSecret 未配置',
  WECOM_GET_TOKEN_FAILED: (detail: string) => `企业微信获取 access_token 失败: ${detail}`,
  WECOM_SEND_FAILED: (detail: string) => `企业微信发送消息失败: ${detail}`,
  WECOM_DECRYPT_FAILED: (detail: string) => `企业微信消息解密失败: ${detail}`,
  CHANNEL_WEBPUSH_ENDPOINT_INVALID: 'WebPush 订阅地址无效（须为 https 公网推送服务地址）',

  LOCK_BUSY: '资源正在被其他同步任务占用，请稍后重试',
  LOCK_REDIS_UNAVAILABLE: 'Redis 已配置但未就绪，拒绝获取分布式锁',

  // === schema version (dynamic)：备份包 schema 版本兼容性校验 ===
  // 备份包 schema 版本高于当前程序支持版本，需升级程序后才能还原
  BACKUP_SCHEMA_TOO_NEW: (payloadVersion: number | string, currentVersion: number | string) =>
    `备份 schema ${payloadVersion} 高于当前 ${currentVersion}`,
  BUNDLE_SCHEMA_TOO_NEW: (bundleVersion: number | string, currentVersion: number | string) =>
    `备份包 schema ${bundleVersion} 高于当前 ${currentVersion}`,

  // === ha-connector：HA 命令调用、队列、WebRTC 与 WS 协议错误 ===
  HA_CALL_SERVICE_TIMEOUT: (domain: string, service: string) =>
    `服务调用超时：${domain}.${service}`,
  HA_CALL_SERVICE_DEPS_NOT_READY: 'HA call_service 依赖未初始化',
  HA_COMMAND_QUEUE_FULL: 'HA 未连接且命令队列已满',
  HA_COMMAND_QUEUE_TTL_EXPIRED: 'HA 命令队列已过期（TTL）',
  HA_COMMAND_QUEUE_EMPTY: '没有可重试的丢弃指令',
  HA_COMMAND_QUEUE_INSTANCE_STOPPING: '实例关闭，未下发指令已转入可重试列表',
  AUTOMATION_WEBHOOK_FOLLOWER: '当前实例不是 HA WebSocket Leader，无法触发 webhook',
  HA_COMMAND_BRIDGE_FAILED: 'HA 命令桥接失败',
  HA_COMMAND_BRIDGE_PUBLISH_FAILED: (detail: string) =>
    `HA 命令桥接请求发布失败: ${detail}`,
  HA_COMMAND_BRIDGE_SUBSCRIBE_FAILED: (detail: string) =>
    `HA 命令桥接订阅失败: ${detail}`,
  HA_WS_CONNECTION_CLOSED: 'WebSocket 连接已关闭',
  HA_WS_REQUEST_TIMEOUT: (type: string) => `WebSocket 请求超时：${type}`,
  HA_WS_REQUEST_FAILED: 'HA WebSocket 请求失败',
  HA_GET_STATES_TIMEOUT: 'get_states 请求超时',
  HA_GET_STATES_INVALID_RESPONSE: 'get_states 返回无效响应',
  HA_SUBSCRIBE_EVENTS_TIMEOUT: 'subscribe_events 超时',
  HA_SUBSCRIBE_ENTITY_REGISTRY_TIMEOUT: 'subscribe_events（entity_registry_updated）超时',
  HA_SUBSCRIBE_AUTOMATION_TIMEOUT: 'subscribe_events（automation.triggered）超时',
  HA_WEBRTC_NO_RESULT: 'WebRTC 协商无结果',
  HA_WEBRTC_TIMEOUT: 'WebRTC 协商超时',
  HA_WEBRTC_ERROR: 'WebRTC 错误',
  HA_WEBRTC_OFFER_ACK_TIMEOUT: 'WebRTC offer 确认超时',
  HA_UNSUBSCRIBE_TIMEOUT: 'unsubscribe 超时',
  HA_WEBRTC_NOT_CONNECTED: 'Home Assistant 未连接，无法建立 WebRTC',
  HA_STATE_RESYNC_FAILED: (detail: string) =>
    `HA 状态同步失败: ${detail || '未知错误'}`,

  // === area：房间区域 ===
  AREA_NOT_FOUND: (id: string) => `区域 ${id} 不存在`,

  // === automation variable：自动化持久变量 ===
  AUTOMATION_VARIABLE_NOT_FOUND: '变量不存在',
  AUTOMATION_VARIABLE_NOT_FOUND_BY_KEY: (key: string) => `变量不存在: ${key}`,
  AUTOMATION_VARIABLE_KEY_INVALID: '变量 key 仅允许字母、数字与下划线',
  AUTOMATION_VARIABLE_RULE_ID_REQUIRED: '本规则变量必须指定 ruleId',
  AUTOMATION_VARIABLE_CREATE_FAILED: '变量已存在或创建失败',
  AUTOMATION_VARIABLE_ADD_INVALID_NUMBER: 'add 操作需要有效数字',

  // === ui-config：配置加载失败 ===
  UI_CONFIG_LOAD_FAILED: (detail: string) =>
    `无法加载配置。请确认已执行数据库初始化：${detail}`,
} as const;
