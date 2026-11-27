import { getEntityDomain, DEFAULT_VOICE_ALERT_RULES, VOICE_ALERT_CATALOG, VOICE_ALERT_GROUP_LABELS, DEFAULT_DAILY_ADVISOR_TTS_DAYTIME, DEFAULT_DAILY_ADVISOR_TTS_EVENING, mergeVoiceAlertRules, normalizeWakeWords, normalizeCustomTtsAlerts, normalizeEntityTtsAlerts, getDefaultVoiceRoomLabels } from '@homeos/shared'
import { resolveSceneValues, type SceneValues } from '@homeos/shared/scene/scene-values'
import { type LayoutWithWholeHomeOff, type WholeHomeOffConfig } from '@/kernel/types/whole-home-off'

/**
 * 智能管家快捷指令预设（对话面板底部 chips）
 *
 * 设计口径：
 * - 一条只覆盖一个智能家居支柱：灯光 / 温控 / 窗帘 / 家庭模式 / 全屋感知 / 能耗，
 *   让用户从面板上就能看出管家「能管什么」，而不是只看到几句闲聊。
 * - `label` 是按钮上的短文案（折合不超过 6 个汉字宽，数字按半宽算），保证 300px 窄栏里
 *   一行放下三条、两行放完全部；`prompt` 才是真正发给管家的完整指令，按钮 `title` 上悬浮可见，
 *   避免短标签丢信息。
 * - `prompt` 全部按后端快路径（`runtime/fast_path.py`）与工具 schema 的既有说法书写，
 *   点了就有确定结果：全关灯 / 设温度 / 窗帘半开 / 家庭模式 / 全屋状态 / 用电统计。
 *
 * 这份常量只是**内置默认**。真正生效的清单来自 `ui.agentQuickPrompts`（见
 * `shared/agent/utils/quick-prompts.util.ts`）：用户在设置里改过就用配置，
 * 没配过（字段缺省）才回落到这里。
 */

/** 单条快捷指令：短标签 + 完整指令 */
export type AgentQuickPrompt = {
  /** 按钮文案（短，保证不换行、不撑破窄栏） */
  label: string
  /** 点击后真正发送的指令 */
  prompt: string
  /** 无障碍补充说明（读屏用，说明这条指令管的是什么） */
  hint: string
}

/**
 * 快捷指令的规模上限，与后端 `AGENT_QUICK_PROMPT_*` 同值。
 *
 * 前端也判一次：配置可能经导入 / 手改接口绕过设置页，超长文案或几十条指令会把这排
 * 按钮从「快捷入口」变成半屏清单，必须在渲染前收敛掉。
 */
export const AGENT_QUICK_PROMPT_LIMITS = {
  /** 条数上限：一行三条、四行封顶 */
  maxItems: 12,
  /** 按钮文案上限（字） */
  label: 12,
  /** 完整指令上限（字） */
  prompt: 120,
  /** 悬浮提示上限（字） */
  hint: 60,
} as const

/** 面板底部展示的默认快捷指令，顺序即从左到右、从上到下的展示顺序 */
export const AGENT_QUICK_PROMPTS: readonly AgentQuickPrompt[] = [
  { label: '全关所有灯', prompt: '把家里所有开着的灯都关掉', hint: '灯光：一键关闭全屋照明' },
  { label: '空调调到25度', prompt: '把客厅空调调到25度', hint: '温控：设定客厅空调温度' },
  { label: '窗帘开一半', prompt: '把客厅窗帘打开一半', hint: '窗帘：按比例开合' },
  { label: '开启睡眠模式', prompt: '切换到睡眠模式', hint: '家庭模式：一键切换全屋场景' },
  { label: '家里什么状态', prompt: '家里现在什么状态', hint: '全屋感知：灯、温湿度、安防概览' },
  { label: '今天耗电多少', prompt: '今天用了多少电', hint: '能耗：今日用电统计' },
] as const

/** 按字数上限裁剪并去掉首尾空白；空串按「没填」处理 */
function clipText(value: unknown, max: number): string {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}

/**
 * 把一条配置项归一成可渲染的快捷指令；不可用时返回 null。
 *
 * 允许字符串简写（`"今天用了多少电"`）：手改配置或导入时只写一句指令最省事，
 * 此时按钮文案直接用指令本身。
 */
function normalizeItem(raw: unknown): AgentQuickPrompt | null {
  if (typeof raw === 'string') {
    const prompt = clipText(raw, AGENT_QUICK_PROMPT_LIMITS.prompt)
    return prompt ? { label: prompt, prompt, hint: '' } : null
  }
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const prompt = clipText(record.prompt, AGENT_QUICK_PROMPT_LIMITS.prompt)
  if (!prompt) return null
  const label = clipText(record.label, AGENT_QUICK_PROMPT_LIMITS.label) || prompt
  return { label, prompt, hint: clipText(record.hint, AGENT_QUICK_PROMPT_LIMITS.hint) }
}

/**
 * 归一化 `ui.agentQuickPrompts`。
 *
 * @param raw 配置里的原始值（可能缺省、可能是脏数据）
 * @returns 数组 = 用户显式配置（可能是空数组，语义是「不要快捷入口」）；
 *          null = 字段缺省 / 不是数组，调用方应回落到内置默认。
 */
export function normalizeAgentQuickPrompts(raw: unknown): AgentQuickPrompt[] | null {
  if (!Array.isArray(raw)) return null
  const seen = new Set<string>()
  const out: AgentQuickPrompt[] = []
  for (const entry of raw) {
    const item = normalizeItem(entry)
    // 同一条指令重复出现没有意义，保留第一条（人工编辑配置时很常见）
    if (!item || seen.has(item.prompt)) continue
    seen.add(item.prompt)
    out.push(item)
    if (out.length >= AGENT_QUICK_PROMPT_LIMITS.maxItems) break
  }
  return out
}

/** 场景模板 ID（仅本文件内用于约束预设清单，无需对外导出） */
type AlertRulePresetId = 'doorbell' | 'wind' | 'door_window' | 'leak' | 'battery'

/** 单条告警规则场景模板：与 AlertRule 字段一一对应，供编辑弹窗直接套用 */
export interface AlertRulePreset {
  /** 模板唯一 ID */
  id: AlertRulePresetId
  /** 模板展示名称（弹窗 chip 文案） */
  label: string
  /** 模板用途说明 */
  description: string
  /** 规则名称 */
  name: string
  /** 示例触发实体 ID */
  entityId: string
  /** 触发条件表达式（后端 evaluateCondition 语法） */
  condition: string
  /** 告警级别，统一沿用现有三档 */
  level: 'info' | 'warn' | 'danger'
  /** 防抖冷却（分钟）：分钟级用于高频传感器，小时级以 60 的倍数表达 */
  cooldownMinutes: number
  /** 通知标题模板 */
  title: string
  /** 通知正文模板，支持 {{state}} / {{val}} / {{name}} / {{unit}} */
  messageTemplate: string
}

/**
 * 内置场景模板列表（顺序即弹窗展示顺序）。
 *
 * 冷却周期设计：
 * - 门铃访客：0（事件型，不做抑制，确保每次按下都通知）
 * - 门窗安防：5 分钟（防止门窗反复开合刷屏）
 * - 水浸/烟雾：10 分钟
 * - 大风预警：30 分钟
 * - 设备低电量：720 分钟（12 小时，小时级冷却示例）
 */
export const ALERT_RULE_PRESETS: AlertRulePreset[] = [
  {
    id: 'doorbell',
    label: '门铃访客',
    description: '有人按门铃时立即通知，可联动摄像头查看实时画面',
    name: '门铃按下通知',
    entityId: 'binary_sensor.doorbell',
    condition: 'on',
    level: 'info',
    cooldownMinutes: 0,
    title: '访客来访',
    messageTemplate: '有人按下了门铃，请注意查看。',
  },
  {
    id: 'wind',
    label: '大风预警',
    description: '风速超过阈值时提醒关窗收物，数值型传感器条件',
    name: '户外大风预警',
    entityId: 'sensor.outdoor_wind_speed',
    condition: '> 12',
    level: 'warn',
    cooldownMinutes: 30,
    title: '户外大风预警',
    messageTemplate: '当前风速已达 {{state}} {{unit}}，请关好门窗并收回户外物品。',
  },
  {
    id: 'door_window',
    label: '门窗安防',
    description: '门窗磁被打开时提醒确认安全',
    name: '大门开启提醒',
    entityId: 'binary_sensor.front_door_contact',
    condition: 'on',
    level: 'warn',
    cooldownMinutes: 5,
    title: '门窗开启提醒',
    messageTemplate: '{{name}} 已被打开，请确认安全。',
  },
  {
    id: 'leak',
    label: '水浸/烟雾',
    description: '水浸或烟雾传感器触发时紧急告警',
    name: '水浸异常报警',
    entityId: 'binary_sensor.water_leak_sensor',
    condition: 'on',
    level: 'danger',
    cooldownMinutes: 10,
    title: '紧急水浸告警',
    messageTemplate: '检测到 {{name}} 发生异常浸水，请立即检查处理。',
  },
  {
    id: 'battery',
    label: '设备低电量',
    description: '电量低于阈值时提醒充电或换电池，小时级冷却',
    name: '智能门锁低电量',
    entityId: 'sensor.door_lock_battery',
    condition: '< 20',
    level: 'warn',
    cooldownMinutes: 720,
    title: '设备低电量提醒',
    messageTemplate: '{{name}} 当前剩余电量仅 {{val}} {{unit}}，请及时充电或更换电池。',
  },
]

/** 通知模板可用变量（点击插入到模板输入框） */
export const ALERT_TEMPLATE_VARIABLES: { key: string; hint: string }[] = [
  { key: '{{state}}', hint: '当前状态值' },
  { key: '{{val}}', hint: '数值型当前值' },
  { key: '{{name}}', hint: '设备名称' },
  { key: '{{unit}}', hint: '单位' },
]

/**
 * @file api-error-codes.ts
 * @module @/shared/constants/api-error-codes
 * @description 后端稳定 `apiErrorCode` 的前端常量表（studio3d / interaction3d / 显示图片 / HA）。
 *
 * 为什么要有这张表：后端把「中文文案」本地化后，`apiErrorCode` 是唯一稳定的判定依据
 * （见 `backend/src/platform/core/http/errors.py` 的 `API_ERROR` 码表）。前端若用
 * `message.includes('…')` 判定，改一句文案就换一次接口语义 —— `check:error-contract`
 * 正是为了按住这种写法。这里集中列出本仓库会消费的码，供 `switch`/映射使用。
 *
 * 收录范围：只收「前端需要按码分支」的码。仅用于展示的文案仍走后端 `message`。
 */

/** studio3d 装饰模型库 / 柔光范围 / 绑定冲突。 */
export const STUDIO3D_ERROR_CODES = {
  /** 模型本身不合法（结构、网格、内嵌贴图、尺寸等）；具体原因在 `message` 里。 */
  modelInvalid: 'STUDIO3D_MODEL_INVALID',
  /** 模型超过体积上限。 */
  modelTooLarge: 'STUDIO3D_MODEL_TOO_LARGE',
  /** 引用的模型不存在（可能已删除）。 */
  modelNotFound: 'STUDIO3D_MODEL_NOT_FOUND',
  /** 当前户型没有任何可用的静态装饰。 */
  sceneModelMissing: 'STUDIO3D_SCENE_MODEL_MISSING',
  /** 保存时发现场景引用的装饰已被删除。 */
  bindingConflict: 'STUDIO3D_BINDING_CONFLICT',
  /** 保存的户型来源无法读取。 */
  sceneUnavailable: 'STUDIO3D_SCENE_UNAVAILABLE',
  /** 柔光范围校验失败。 */
  lightRangeInvalid: 'STUDIO3D_LIGHT_RANGE_INVALID',
} as const

/** interaction3d 配置诊断。 */
export const INTERACTION3D_ERROR_CODES = {
  /** 配置存在无法保存的设置；用诊断接口取 `findings` 定位。 */
  configInvalid: 'INTERACTION3D_CONFIG_INVALID',
  /** 配置包含当前版本无法识别的字段（版本过高或字段已废弃）。 */
  configUnsupported: 'INTERACTION3D_CONFIG_UNSUPPORTED',
  /** 未保存户型前就编辑柔光范围。 */
  sceneRequired: 'INTERACTION3D_SCENE_REQUIRED',
} as const

/** 显示图片按需缩放。 */
export const DISPLAY_IMAGE_ERROR_CODES = {
  /** 不支持的图片格式（svg 直通，不走缩放）。 */
  unsupported: 'DISPLAY_IMAGE_UNSUPPORTED',
  /** 源图超过像素/边长上限。 */
  tooLarge: 'DISPLAY_IMAGE_TOO_LARGE',
} as const

/** HA 连接身份切换（0.8.9：换 HA 后旧画面/旧操作必须失效）。 */
export const HA_ERROR_CODES = {
  /** 请求携带的 `expectedHaSource` 与当前连接不一致。 */
  sourceChanged: 'HA_SOURCE_CHANGED',
} as const

/** 全部错误码的联合类型（便于穷举式映射）。 */
export type KnownApiErrorCode =
  | (typeof STUDIO3D_ERROR_CODES)[keyof typeof STUDIO3D_ERROR_CODES]
  | (typeof INTERACTION3D_ERROR_CODES)[keyof typeof INTERACTION3D_ERROR_CODES]
  | (typeof DISPLAY_IMAGE_ERROR_CODES)[keyof typeof DISPLAY_IMAGE_ERROR_CODES]
  | (typeof HA_ERROR_CODES)[keyof typeof HA_ERROR_CODES]

/** 从任意错误对象里安全读取 `apiErrorCode`（Axios / fetch 两种形状都覆盖）。 */
export function readApiErrorCode(error: unknown): string | null {
  const code = (error as { response?: { data?: { apiErrorCode?: unknown } } })?.response?.data?.apiErrorCode
  return typeof code === 'string' && code ? code : null
}

/**
 * 气候 / 热水器 / 浴霸的展示标签（叶子常量，无任何 import）。
 *
 * 为什么集中在这里
 * ----------------
 * 这套表原本长在 `studio/app/shared/device/climate.ts`（那个文件同时包含能力归一、温度
 * 回填、命令构造与图标选择），而 `shared/constants/climate-labels.ts` 又有一份
 * `HVAC_MODE_LABELS` 与它部分重叠。同一个模式名在两处出现两个值，就等于「下拉里写制冷、
 * 弹窗里写冷气」这类不一致有了生长空间。
 *
 * 现在：
 * - 通用空调模式以 `HVAC_MODE_LABELS` 为底（与控件下拉一致），`CLIMATE_MODE_LABELS` 只补它
 *   没有的键；
 * - 浴霸 / 热水器是**另一套语义**（同一个 `heat` 在浴霸上是「取暖」、在热水器上是「加热」），
 *   必须各自独立成表，不能合并；
 * - 摆风与位置的文案只服务渲染层，一并放这里，避免它们在设备逻辑文件里继续膨胀。
 *
 * 判据（是否要做业务判断）不要读这些文案：文案是展示层，模式判定走 `normalizeClimateModeKey`
 * 与能力位。
 */

/** 通用空调 hvac 模式（与控件下拉、属性格式化共用）。 */
export const HVAC_MODE_LABELS: Record<string, string> = {
  auto: '自动',
  cool: '制冷',
  dry: '除湿',
  fan_only: '送风',
  heat: '制热',
  off: '关闭',
}

/** 风速档位。 */
export const FAN_MODE_LABELS: Record<string, string> = {
  auto: '自动',
  high: '高风',
  low: '低风',
  medium: '中风',
}

/** 预设模式。 */
export const PRESET_MODE_LABELS: Record<string, string> = {
  activity: '活动',
  anti_freeze: '防冻',
  away: '离家',
  boost: '强力',
  comfort: '舒适',
  eco: '节能',
  home: '在家',
  none: '无',
  sleep: '睡眠',
}

/**
 * 空调面板 / 弹窗上的模式文案：`HVAC_MODE_LABELS` 的超集。
 *
 * 多出来的键是 HA 集成常见但不在标准 hvac 列表里的取值（`fan` / `heat_cool` / 预设）以及
 * 离线态占位。以底表展开而不是重抄一遍，保证「同一个模式在两处永远同一个词」。
 */
export const CLIMATE_MODE_LABELS: Record<string, string> = {
  ...HVAC_MODE_LABELS,
  fan: '送风',
  heat_cool: '冷暖自动',
  unavailable: '不可用',
  unknown: '未知',
  idle: '待机',
  none: '无',
  eco: '节能',
  boost: '强劲',
  performance: '强劲',
  silent: '静音',
  sleep: '睡眠',
  comfort: '舒适',
  away: '离家',
  mold_prev: '防霉',
  eco_and_mold_prev: '节能＋防霉',
  eco_mold_prev: '节能＋防霉',
}

/**
 * 浴霸模式文案。
 *
 * 浴霸的 `heat` 是「取暖」而不是「制热」，`fan_only` 是「吹风」而不是「送风」——
 * 与空调同键不同义，**不能**复用 `HVAC_MODE_LABELS`。中文键是各家集成直接下发的模式名。
 */
export const BATH_HEATER_MODE_LABELS: Record<string, string> = {
  off: '关闭',
  heat: '取暖',
  heating: '取暖',
  fan_only: '吹风',
  fan: '吹风',
  ventilation: '换气',
  ventilate: '换气',
  vent: '换气',
  exhaust: '换气',
  air_exchange: '换气',
  defog: '除雾',
  defogging: '除雾',
  demist: '除雾',
  anti_fog: '除雾',
  quick_heat: '快速取暖',
  rapid_heat: '快速取暖',
  fast_heat: '快速取暖',
  quick_defog: '快速除雾',
  rapid_defog: '快速除雾',
  fast_defog: '快速除雾',
  dry: '干燥',
  drying: '干燥',
  auto: '自动',
  unavailable: '不可用',
  unknown: '未知',
  idle: '待机',
  standby: '待机',
  none: '无',
  eco: '节能',
  boost: '强劲',
  performance: '强劲',
  silent: '静音',
  sleep: '睡眠',
  mold_prev: '防霉',
  eco_and_mold_prev: '节能＋防霉',
  eco_mold_prev: '节能＋防霉',
  制热: '取暖',
  暖风: '取暖',
  取暖: '取暖',
  吹风: '吹风',
  换气: '换气',
  除雾: '除雾',
  干燥: '干燥',
  待机: '待机',
}

/** 热水器模式文案（HA `water_heater` 域的 operation 取值）。 */
export const WATER_HEATER_MODE_LABELS: Record<string, string> = {
  off: '关闭',
  normal: '普通',
  standard: '普通',
  eco: '节能',
  adaptive: '自适温',
  auto: '自适温',
  heat_pump: '热泵',
  electric: '电加热',
  gas: '燃气',
  performance: '强力',
  vacation: '假期',
  普通: '普通',
  自适温: '自适温',
  节能: '节能',
  加热: '加热',
  保温: '保温',
}

/** 上下摆风档位。 */
export const VERTICAL_SWING_LABELS: Record<string, string> = {
  off: '关闭',
  auto: '自动',
  default: '默认',
  full_swing: '全范围摆动',
  vertical: '上下摆动',
  horizontal: '左右摆动',
  both: '上下左右',
  fixed_upper: '固定上方',
  fixed_upper_middle: '固定中上',
  fixed_middle: '固定中间',
  fixed_lower_middle: '固定中下',
  fixed_lower: '固定下方',
  swing_upper: '上方摆动',
  swing_upper_middle: '中上摆动',
  swing_middle: '中间摆动',
  swing_lower_middle: '中下摆动',
  swing_lower: '下方摆动',
}

/** 左右摆风档位。 */
export const HORIZONTAL_SWING_LABELS: Record<string, string> = {
  off: '关闭',
  auto: '自动',
  default: '默认',
  full_swing: '全范围摆动',
  left: '固定左侧',
  left_center: '固定中左',
  center: '固定居中',
  right_center: '固定中右',
  right: '固定右侧',
}

/**
 * 横向摆风位置的文案（组合档位用，如 `horizontal_leftmost_and_vertical_swing`）。
 *
 * 与 `HORIZONTAL_SWING_LABELS` 分开：这里是**位置**（固定最左），那边是**摆风动作**（固定左侧），
 * 合成显示时会拼上「＋上下摆动」。
 */
export const HORIZONTAL_POSITION_LABELS: Record<string, string> = {
  horizontal_leftmost: '固定最左',
  horizontal_middle_left: '固定左中',
  horizontal_middle_right: '固定右中',
  horizontal_rightmost: '固定最右',
}

/** Device-group domain / monitor id leaf constants. */

export const MONITORED_ENTITY_IDS = [
  '_consumption',
  '_uptime',
  '_cpu_',
  '_memory_',
  '_version',
  '_ip_',
  '_monitor',
  '_num',
  '_count',
]

export const DOMAIN_LIST = [
  'light',
  'switch',
  'sensor',
  'binary_sensor',
  'climate',
  'lock',
  'cover',
  'fan',
  'water_heater',
  'vacuum',
  'camera',
  'media_player',
]

/** HA 实体域（domain）元数据 */
export const ENTITY_DOMAIN_LABELS = {
  alarm_control_panel: '安防',
  automation: '自动化',
  binary_sensor: '二元',
  button: '按钮',
  camera: '摄像头',
  climate: '空调',
  cover: '窗帘',
  device_tracker: '位置',
  event: '事件',
  fan: '风扇',
  humidifier: '加湿器',
  input_boolean: '虚拟开关',
  input_number: '输入值',
  input_select: '输入选择',
  light: '灯光',
  lock: '门锁',
  media_player: '多媒体',
  number: '数值',
  person: '人员',
  remote: '遥控',
  scene: '场景',
  script: '脚本',
  select: '选择',
  sensor: '传感器',
  siren: '警报',
  switch: '开关',
  update: '更新',
  vacuum: '吸尘器',
  valve: '阀门',
  water_heater: '热水器',
  weather: '天气',
}
/** 域 → 主题色（HEX）映射，用于图标 / 徽章 / 浮动控制卡着色 */
export const ENTITY_DOMAIN_COLORS: Record<string, string> = {
  light: '#fbbf24',
  switch: '#60a5fa',
  input_boolean: '#38bdf8',
  button: '#60a5fa',
  input_button: '#60a5fa',
  climate: '#38bdf8',
  fan: '#22d3ee',
  water_heater: '#fb923c',
  cover: '#a78bfa',
  humidifier: '#38bdf8',
  lock: '#fbbf24',
  vacuum: '#c084fc',
  camera: '#fb7185',
  media_player: '#c084fc',
  remote: '#94a3b8',
  sensor: '#34d399',
  binary_sensor: '#4ade80',
  number: '#67e8f9',
  input_number: '#67e8f9',
  select: '#a78bfa',
  input_select: '#a78bfa',
  alarm_control_panel: '#f87171',
  siren: '#fb7185',
  valve: '#2dd4bf',
  scene: '#fbbf24',
  script: '#2dd4bf',
  automation: '#f59e0b',
  device_tracker: '#4ade80',
  person: '#34d399',
  weather: '#38bdf8',
  update: '#94a3b8',
  event: '#22d3ee',
  timer: '#60a5fa',
  counter: '#67e8f9',
}

const DOMAIN_COLOR_FALLBACK = '#94a3b8'

/**
 * 查询 HA 域默认语义色。
 *
 * @param domain - HA 实体域名（如 `light`、`climate`）。
 * @returns HEX 颜色；未收录时回退中性灰。
 */
export function entityDomainColor(domain: string | null | undefined): string {
  if (!domain) return DOMAIN_COLOR_FALLBACK
  return ENTITY_DOMAIN_COLORS[domain] || DOMAIN_COLOR_FALLBACK
}
/**
 * 根据 HA 域名查询中文显示名。
 *
 * @param key - HA 实体域名（如 `light`、`sensor`）。
 * @returns 对应的中文标签；未命中时回退为原始 key。
 */
export function entityDomainLabel(key: string) {
  return (ENTITY_DOMAIN_LABELS as Record<string, string>)[key] ?? key
}


/** HA 实体 state → 中文标签工具函数 */

/** 实体弹窗：按域展示的更完整状态文案 */
const POPUP_DOMAIN_STATE_LABELS = {
  lock: {
    locked: '已上锁',
    unlocked: '已解锁',
    locking: '上锁中',
    unlocking: '解锁中',
    jammed: '卡住',
  },
  cover: {
    open: '已打开',
    closed: '已关闭',
    opening: '打开中',
    closing: '关闭中',
  },
  valve: {
    open: '已打开',
    closed: '已关闭',
    opening: '打开中',
    closing: '关闭中',
  },
  vacuum: {
    cleaning: '清扫中',
    docked: '已回充',
    returning: '返回中',
    idle: '空闲',
    paused: '已暂停',
    off: '关闭',
    error: '异常',
  },
}

/**
 * 事件日志：传感器与开关类实体区分文案
 *
 * 对 on/off、open/closed、unavailable 等常见 state 做传感器 / 开关区分翻译，
 * 其余 state 走 `entityStateLabel`。
 *
 * @param entityId - HA 实体 ID，用于判断是否为 sensor 类。
 * @param state - HA 实体 state 值。
 * @returns 事件日志展示用的中文文案。
 */
function formatEventLogStateLabel(entityId: string | null | undefined, state: string | null | undefined): string {
  if (state === 'on' || state === 'open') {
    return entityId?.includes('sensor') ? '触发' : '开启'
  }
  if (state === 'off' || state === 'closed') {
    return entityId?.includes('sensor') ? '恢复' : '关闭'
  }
  if (state === 'unavailable') return '离线'
  return entityStateLabel(state)
}

/**
 * 查询指定域的弹窗状态文案。
 *
 * @param domain - HA 实体域名（如 `lock`、`cover`）。
 * @param state - HA 实体 state 值。
 * @returns 域专属中文文案；未命中时回退到通用标签，再回退到原始 state；state 为空时返回 `--`。
 */
export function popupDomainStateLabel(domain: string, state: string | null | undefined): string {
  if (!state) return '--'
  const domainLabels = POPUP_DOMAIN_STATE_LABELS[domain as keyof typeof POPUP_DOMAIN_STATE_LABELS]
  return domainLabels?.[state as keyof typeof domainLabels] ?? entityStateLabel(state) ?? state
}

/** 拥有专属弹窗状态文案的域集合 */
const POPUP_STATE_DOMAINS = new Set(['lock', 'cover', 'valve', 'vacuum'])

/**
 * 设备页 / 事件列表：实体 ID + 原始 state → 中文展示（数值类 state 保持原样）
 *
 * 对弹窗专属域优先使用域文案，其余走事件日志文案；state 为空时返回 `—`。
 *
 * @param entityId - HA 实体 ID。
 * @param state - HA 实体 state 值（数值类保持原样）。
 * @returns 面向用户的中文展示文案。
 */
export function displayEntityStateLabel(entityId: string | null | undefined, state: string | null | undefined): string {
  if (state == null || state === '') return '—'
  const domain = entityId ? getEntityDomain(entityId) : ''
  if (domain && POPUP_STATE_DOMAINS.has(domain)) {
    const label = popupDomainStateLabel(domain, state)
    if (label !== '--') return label
  }
  return formatEventLogStateLabel(entityId, state) || state
}

/**
 * climate / water_heater：state 是设定模式，hvac_action 才是压缩机实际动作。
 * 仅展示模式时，室温远高于设定却显示「制冷」+「待机」会让人误以为逻辑错误。
 */
export function displayClimateOperatingLabel(
  state: string | null | undefined,
  attrs?: Record<string, unknown> | null,
  actionLabels?: Record<string, string>,
  modeLabels?: Record<string, string>,
): string {
  const mode = String(state || '')
    .trim()
    .toLowerCase()
  if (!mode) return '—'
  if (mode === 'unavailable') return '离线'
  if (mode === 'unknown') return '未知'
  if (mode === 'off') return '关闭'

  const modeLabel = modeLabels?.[mode] || entityStateLabel(mode) || mode
  const action = String(attrs?.hvac_action ?? '')
    .trim()
    .toLowerCase()
  if (!action) return modeLabel

  const actionLabel = actionLabels?.[action]
  if (action !== 'idle' && action !== 'off' && actionLabel) return actionLabel
  if (action === 'idle') return `${modeLabel} · 待机`
  if (action === 'off') return `${modeLabel} · 未运转`
  return actionLabel || modeLabel
}

/** HA 实体 state → 中文标签 + 语义色单表映射 */

/** HA 实体 state 元信息：中文短标签 + 可选语义色 */
interface EntityStateMeta {
  label: string
  color?: string
}

/** HA 实体 state → { label, color } 单表 */
const ENTITY_STATE_META: Record<string, EntityStateMeta> = {
  any: { label: '任意' },
  on: { label: '开启', color: '#FFD60A' },
  off: { label: '关闭', color: '#64748B' },
  open: { label: '开', color: '#34D399' },
  closed: { label: '关', color: '#64748B' },
  opening: { label: '开中', color: '#818CF8' },
  closing: { label: '关中', color: '#A78BFA' },
  cool: { label: '制冷', color: '#0A84FF' },
  heat: { label: '制热', color: '#FF9F0A' },
  heat_cool: { label: '冷暖' },
  auto: { label: '自动', color: '#30D158' },
  dry: { label: '除湿', color: '#5AC8FA' },
  fan_only: { label: '送风', color: '#64D2FF' },
  locked: { label: '已锁', color: '#FFD60A' },
  unlocked: { label: '已解锁', color: '#30D158' },
  locking: { label: '上锁中', color: '#FF9F0A' },
  unlocking: { label: '解锁中', color: '#64D2FF' },
  jammed: { label: '卡住', color: '#FF453A' },
  cleaning: { label: '清扫', color: '#BF5AF2' },
  docked: { label: '回充', color: '#64D2FF' },
  returning: { label: '返回', color: '#A78BFA' },
  idle: { label: '空闲', color: '#94A3B8' },
  paused: { label: '暂停', color: '#F5A623' },
  playing: { label: '播放', color: '#BF5AF2' },
  error: { label: '异常', color: '#FF453A' },
  triggered: { label: '已触发', color: '#FF453A' },
  armed_away: { label: '离家', color: '#FF453A' },
  armed_home: { label: '居家', color: '#FF9F0A' },
  armed_night: { label: '夜间', color: '#7C3AED' },
  disarmed: { label: '撤防', color: '#30D158' },
  sounding: { label: '鸣响中', color: '#FF453A' },
  gas: { label: '燃气', color: '#F5A623' },
  detected: { label: '检测到', color: '#FF453A' },
  clear: { label: '正常', color: '#30D158' },
  home: { label: '在家', color: '#30D158' },
  not_home: { label: '外出', color: '#64748B' },
  streaming: { label: '直播中', color: '#F472B6' },
  recording: { label: '录制中', color: '#EF4444' },
  charging: { label: '充电中', color: '#34D399' },
  unavailable: { label: '离线', color: '#475569' },
  unknown: { label: '未知', color: '#64748B' },
}

/**
 * 根据 HA 实体 state 值查询中文短标签。
 *
 * @param state - HA 实体 state 值（如 `on`、`locked`、`unavailable`）。
 * @returns 对应的中文短标签；未命中映射或 state 为空时返回空字符串，
 *          再退而返回原始 state。
 */
export function entityStateLabel(state: string | null | undefined): string {
  if (!state) return ''
  return ENTITY_STATE_META[state]?.label ?? state
}

/**
 * 本机中控入户页（注册 / 登录 / 授权激活 / 授权恢复）的场景壳文案。
 *
 * 字段名与取值规则（`SceneShell` / `SceneValues` / `resolveSceneValues`）在共享包
 * `@homeos/shared/scene/scene-values` 里单点化：商店那侧是**同一套形状、另一套文案**，
 * 只有把形状也共享了，「某侧字段改名导致另一侧左栏整块空掉」这类错误才可能在类型层被抓到。
 * 文案是各域的内容，留在本文件。
 */

/** 所有入户页共享的壳信息。 */
const SHARED = {
  SHELL_TITLE: 'HomeOS 本机中控',
  SHELL_NAME: '本机中控',
  LOGO_SRC: '/static/assets/icons/homeos-mark-white-orange.svg',
} as const

const VALUES: Record<string, SceneValues> = {
  register: {
    STATUS_LABEL: '尚未初始化',
    TITLE: '这台机器还没有主人',
    TAGLINE: '先注册本机唯一账号：账号、密码、邮箱与邮箱验证码，注册完即是这台机器的主人',
    DOSSIER_LABEL: '注册档案',
    DOSSIER: [
      ['账号', '本机唯一账号，注册后关闭注册入口'],
      ['邮箱', '验证码由授权商店发送与校验'],
      ['口令', '只存本机数据库，不随项目导出'],
      ['之后', '登录这台中控并检测授权'],
    ],
  },
  login: {
    STATUS_LABEL: '本机服务就绪',
    TITLE: '中控在等你回来',
    TAGLINE: '一次登录，把灯光、空调、窗帘与影音收进同一个画面',
    DOSSIER_LABEL: '本机档案',
    DOSSIER: [
      ['账号', '用户名或注册邮箱登录'],
      ['会话', '只留在本机，可服务端吊销'],
      ['网络', '不依赖公网，仅本机网段可达'],
      ['之后', '检测本机授权状态'],
    ],
  },
  reset: {
    STATUS_LABEL: '邮箱验证',
    TITLE: '把钥匙重新配一把',
    TAGLINE: '用注册邮箱收一枚验证码，验证通过即可重设本机管理员密码',
    DOSSIER_LABEL: '找回档案',
    DOSSIER: [
      ['凭据', '注册邮箱收到的 6 位验证码'],
      ['范围', '只重置本机账号，不影响商店账号'],
      ['会话', '重置成功后旧会话全部失效'],
      ['之后', '用新密码重新登录本机'],
    ],
  },
  activate: {
    STATUS_LABEL: '等待授权',
    TITLE: '给这台机器一枚授权',
    TAGLINE: '用购买时收到的激活码与邮箱完成绑定，授权随账号走、可自助换机',
    DOSSIER_LABEL: '授权档案',
    DOSSIER: [
      ['绑定', '一机一码，绑定本机唯一账号名'],
      ['离线', '签名租约本地验签，断网仍可用'],
      ['续租', '后台心跳续租，过期前自动刷新'],
      ['售后', '账号中心可自助解绑换机'],
    ],
  },
  recovery: {
    STATUS_LABEL: '连接异常',
    TITLE: '授权连接需要恢复',
    // 这张页现在只服务「授权仍在、只是暂时连不上 / 租约待重续」。
    // 未激活（UNACTIVATED）不再落到这里 —— 见 App.vue 的 licenseRecoveryVisible。
    TAGLINE: '本机授权凭证已保留，正在自动重连授权后台',
    DOSSIER_LABEL: '恢复档案',
    DOSSIER: [
      ['状态', '本地授权凭证保留，不因掉线被清除'],
      ['动作', '先自动重连，长时间失败再重新激活'],
      ['凭证', '本机保存的激活凭证仅本机可解'],
      ['兜底', '仍不可用时可回激活页重新填码'],
    ],
  },
}

/** 取某页的壳信息 + 文案；未登记的 `page` 回落到登录页。 */
export function sceneValues(page: string | undefined) {
  return resolveSceneValues(SHARED, VALUES, page, 'login')
}

/**
 * 屏保几何 / 显示默认值（唯一真源）。
 *
 * 两个消费方原本各抄了一份 25 个键：`composables/ui/screensaver/screensaver.defaults.ts`
 * （面板草稿的兜底）与 `shared/utils/config/frontend-config.ts`（公开配置拉取前的兜底）。
 * 抄两份的后果是「改了字号只改一处」—— 面板预览和真实配置从此不一致。
 *
 * 放在 `shared/constants` 而不是 composables：`shared/**` 不允许反向引用 composables，
 * 而配置兜底必须能在面板之外（无 UI 的启动路径）拿到同一份数字。
 */

/** 屏保默认配置（与配置文件合并使用） */
export const SS_DEFAULTS = {
  scale: 1.35,
  defaultMode: 'random',
  enableWeatherMode: false,
  instantEnter: true,
  instantLeave: true,
  brightness: 1,
  showBrand: true,
  showSeconds: true,
  showGregorianDate: true,
  showLunar: true,
  showWeatherIcon: true,
  showWeatherDesc: true,
  showWeatherStats: true,
  showWeatherMeta: true,
  timeSizeVw: 24,
  sepSizeVw: 17,
  secSizeVw: 7,
  metaSizeVw: 3,
  subMetaSizeVw: 2,
  brandSizePx: 22,
  weatherTempSizeVw: 22,
  weatherIconSizeVw: 10,
  weatherStatsSizePx: 15,
  brandTopVh: 5,
  contentShiftVh: 0,
} as const

export type ScreensaverDefaults = typeof SS_DEFAULTS

/**
 * 安防跨模块联动预设与开关行。
 *
 * 职责：
 * - 提供安防跨模块联动的一键启用预设（写入 AppConfig.security）。
 * - 提供联动页集中开关行定义（含 presence 联动）。
 * - 提供全屋联动页的入口行定义（本页开关 + 跳转高级参数）。
 *
 * 依赖：无外部依赖，纯静态预设定义。
 *
 * 注意：
 * - `configKey` / `key` 为 AppConfig.security 中的字段名，属于配置 key，不翻译。
 * - `icon` 为 @lucide/vue 图标名，`theme` 为主题色名，均不翻译。
 * - `route` 为前端路由名，不翻译。
 */

/** 安防跨模块联动一键启用预设项 */
type SecurityLinkagePreset = {
  id: string
  icon: string
  theme: string
  title: string
  description: string
  configKey: string
  config: Record<string, boolean>
  offConfig: Record<string, boolean>
  successMessage: string
  offMessage: string
}

/** 联动开关行（写入 AppConfig.security） */
type SecurityLinkageFlagRow = { key: string; label: string; desc: string }

/** 全屋联动页入口行（跳转本页或高级参数） */
type SecurityLinkageParamRow = {
  key: string
  label: string
  desc: string
  route: string
  theme: string
}

/**
 * 安防跨模块联动一键启用预设（写入 AppConfig.security；保留供程序化启用）
 *
 * @returns 预设数组，每项包含图标、主题、标题、描述、开关配置与启停成功提示文案。
 */
export function getSecurityLinkagePresets(): SecurityLinkagePreset[] {
  return [
    {
      id: 'away_sim',
      icon: 'Lamp',
      theme: 'amber',
      title: '离家布防 → 离家模拟',
      description: '离家布防时自动启用灯光/空调模拟，与布局「离家模拟」灯池配合。',
      configKey: 'linkAwaySimOnArmAway',
      config: { linkAwaySimOnArmAway: true },
      offConfig: { linkAwaySimOnArmAway: false },
      successMessage: '已启用：离家布防时启动离家模拟',
      offMessage: '已关闭：离家布防联动模拟',
    },
    {
      id: 'home_mode_sync',
      icon: 'Home',
      theme: 'emerald',
      title: '布防/撤防 → 家庭模式',
      description: '按对照表或名称规则联动：居家↔回家、离家↔离家、夜间↔睡眠；撤防默认退出家庭模式。',
      configKey: 'linkHomeModeOnSecurityChange',
      config: { linkHomeModeOnSecurityChange: true },
      offConfig: { linkHomeModeOnSecurityChange: false },
      successMessage: '已启用：安防状态变更联动家庭模式',
      offMessage: '已关闭：安防联动家庭模式',
    },
  ]
}

/**
 * 联动页集中开关行定义（含 presence；写入 AppConfig.security）
 *
 * @returns 开关行数组，每项包含配置 key、中文标签与描述文案。
 */
export function getSecurityLinkageFlagRows(): SecurityLinkageFlagRow[] {
  return [
    {
      key: 'linkHomeModeOnSecurityChange',
      label: '布防变更 → 家庭模式',
      desc: '开启后按对照表/名称激活家庭模式；撤防默认退出模式',
    },
    {
      key: 'linkAwaySimOnArmAway',
      label: '离家布防 → 离家模拟',
      desc: '外出布防时启用灯光模拟，离开外出布防时自动关闭',
    },
    {
      key: 'autoArmOnEveryoneLeft',
      label: '全员离家自动布防',
      desc: '全员离家且当前为撤防时，自动切离家布防',
    },
    {
      key: 'autoUpgradeToAwayOnEveryoneLeft',
      label: '居家/夜间升级为离家',
      desc: '全员离家时，若当前为居家或夜间则升级为离家布防',
    },
    {
      key: 'calendarArmOnAway',
      label: '日历外出自动布防',
      desc: '日历标记外出且当前撤防时，自动切离家布防',
    },
    {
      key: 'calendarUpgradeToAway',
      label: '日历外出升级为离家',
      desc: '日历标记外出时，若当前为居家或夜间则升级为离家布防（与全员离家升级独立）',
    },
    {
      key: 'autoDisarmOnFirstHome',
      label: '首人到家自动切居家',
      desc: '首人到家时切安防「居家」（不是全撤防），与回家模式一致',
    },
  ]
}

/**
 * 全屋联动页相关入口行：本页人员判定 + 仍需在高级参数调节的阈值。
 * presence 自动布防/切居家开关已在 getSecurityLinkageFlagRows，勿再指向高级参数。
 */
export function getSecurityLinkageParamRows(): SecurityLinkageParamRow[] {
  return [
    {
      key: 'security.presencePersons',
      label: '人员在线判定',
      desc: '手动定义人员并关联多个判定实体',
      route: 'linkage',
      theme: 'sky',
    },
    {
      key: 'security.awayConfirmMin',
      label: '离家确认等待',
      desc: '全员离家后等待分钟数再触发布防，避免误触发',
      route: 'params',
      theme: 'amber',
    },
  ]
}

/** 安防模式全屋预设 */
type SecurityModePresetMeta = { name: string; description: string }
/** 安防模式预设动作：对应一条 HA service 调用 */
type SecurityModePresetAction = {
  service?: string
  entity_id?: string
  service_data?: Record<string, unknown>
  [key: string]: unknown
}

/** 各安防模式的预设元数据（中文名 + 说明文案），key 为 HA alarm state */
const PRESET_META: Record<string, SecurityModePresetMeta> = {
  armed_away: {
    name: '标准离家',
    description: '设备情景由「家庭模式·离家」负责；此处仅适合外围设备（警号、摄像等）',
  },
  armed_home: {
    name: '标准居家',
    description: '设备情景由「家庭模式·回家」负责；此处仅适合外围设备（室内区需设为 interior）',
  },
  armed_night: {
    name: '标准夜间',
    description: '设备情景由「家庭模式·睡眠」负责；此处仅适合外围设备',
  },
  disarmed: {
    name: '标准撤防',
    description: '关闭安防告警；回家请用「居家」。设备情景交给家庭模式，勿在此重复配置',
  },
}
/** 生活方式动作已迁至家庭模式；安防场景预设默认空，避免双写 */
const PRESET_ACTIONS: Record<string, SecurityModePresetAction[]> = {
  armed_away: [],
  armed_home: [],
  armed_night: [],
  disarmed: [],
}
/** 模式 key → 预设 ID 映射，用于写入 layout 时的唯一标识 */
const PRESET_IDS: Record<string, string> = {
  armed_away: 'standard_away',
  armed_home: 'standard_home',
  armed_night: 'standard_night',
  disarmed: 'standard_disarm',
}
/**
 * 四模式全屋预设（layout.securityModes[].actions 模板；默认空，避免与家庭模式重复）
 *
 * 遍历四种安防模式，组装预设对象（id / name / description / actions）。
 * 动作数组中的 `service_data` 会被浅拷贝，避免外部修改污染内部常量。
 *
 * @returns 模式 key → 预设对象 的映射表。
 */
export function getSecurityModePresets() {
  const presets: Record<
    string,
    {
      id: string
      name: string
      description: string
      actions: SecurityModePresetAction[]
    }
  > = {}
  for (const modeKey of Object.keys(PRESET_ACTIONS)) {
    presets[modeKey] = {
      id: PRESET_IDS[modeKey],
      name: PRESET_META[modeKey].name,
      description: PRESET_META[modeKey].description,
      actions: PRESET_ACTIONS[modeKey].map((a) => ({
        ...a,
        service_data: a.service_data ? { ...a.service_data } : undefined,
      })),
    }
  }
  return presets
}


/** 语音播报警报目录与工厂 */
export {
  DEFAULT_VOICE_ALERT_RULES,
  mergeVoiceAlertRules,
  normalizeWakeWords,
  normalizeCustomTtsAlerts,
  normalizeEntityTtsAlerts,
}
/**
 * 获取语音播报警报分组标签表的浅拷贝。
 *
 * @returns 分组 key → 中文分组标签的对象（浅拷贝，避免外部修改内部常量）。
 */
export function getVoiceAlertGroups() {
  return { ...VOICE_ALERT_GROUP_LABELS }
}
/**
 * 获取语音播报警报规则目录（引用，只读使用）。
 *
 * @returns 语音播报警报目录对象，包含可配置的规则项定义。
 */
export function getVoiceAlertCatalog() {
  return VOICE_ALERT_CATALOG
}
/**
 * 获取默认的「白天每日播报」TTS 模板。
 *
 * @returns 默认白天每日播报配置对象（引用）。
 */
export function getDefaultDailyAdvisorTtsDaytime() {
  return DEFAULT_DAILY_ADVISOR_TTS_DAYTIME
}
/**
 * 获取默认的「傍晚每日播报」TTS 模板。
 *
 * @returns 默认傍晚每日播报配置对象（引用）。
 */
export function getDefaultDailyAdvisorTtsEvening() {
  return DEFAULT_DAILY_ADVISOR_TTS_EVENING
}
/**
 * 把唤醒词文本解析为去重后的唤醒词数组。
 *
 * 按中英文逗号分隔、去除首尾空白、过滤空串，并去重。
 *
 * @param text - 用户输入的唤醒词文本，可包含中英文逗号分隔的多个词。
 * @returns 去重后的唤醒词字符串数组（保持插入顺序）。
 */
export function parseWakeWordsText(text: string | null | undefined) {
  return [
    ...new Set(
      String(text || '')
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ]
}
/**
 * 创建一条新的自定义 TTS 警报规则（用于 UI 新增按钮）。
 *
 * @returns 默认启用的自定义 TTS 警报规则对象，id 基于时间戳生成。
 */
export function newCustomTtsAlert() {
  return {
    id: `custom_${Date.now()}`,
    label: '自定义规则',
    enabled: true,
    trigger: 'notification',
    entityMatch: '',
    stateTo: '',
    notificationLevel: '',
    messageContains: '',
    sourceContains: '',
    messageTemplate: '{{message}}',
  }
}
/**
 * 创建一条新的实体 TTS 警报规则（按实体 state 变化触发播报）。
 *
 * @param entityId - 关联的 HA 实体 ID（如 `binary_sensor.door`）；默认空字符串。
 * @returns 默认启用的实体 TTS 警报规则对象，触发条件为 state 变为 `on`。
 */
export function newEntityTtsAlert(entityId: string = '') {
  return {
    id: `entity_tts_${Date.now()}`,
    entityId: String(entityId || '').trim(),
    enabled: true,
    stateTo: 'on',
    messageTemplate: '{{name}} 已触发',
  }
}
/** 实体播报快捷筛选（EntityInput domain 过滤） */
export function getEntityTtsQuickDomains() {
  return [
    { id: 'binary_sensor', label: '门磁/人体', emoji: '🚪' },
    { id: 'sensor', label: '传感器', emoji: '📡' },
    { id: 'switch', label: '开关', emoji: '🔌' },
    { id: 'button', label: '按钮', emoji: '🔘' },
    { id: 'lock', label: '门锁', emoji: '🔐' },
    { id: 'cover', label: '窗帘', emoji: '🪟' },
  ]
}

/** 语音房间标签常量 */

let cachedVoiceRoomLabels: string[] | null = null

/**
 * 语音房间标签回退（优先使用配置 voice.rooms / envSensorMap）。
 *
 * 不能在模块顶层直接取 `getDefaultVoiceRoomLabels()`：本模块与 `@homeos/shared`
 * 的房间目录可能被 rolldown 分到互相 import 的 shared-* chunk（跨 chunk 环），
 * 环内先求值的一侧读到的 `DEFAULT_ROOM_CATALOG` 仍是 `var` 的 undefined 初值，
 * 于是目录函数在 `.map` 上抛 `TypeError: ... is not iterable / undefined`，
 * 使整条懒加载路由 chunk 求值失败（Uncaught (in promise)）。
 * 延迟到首次使用时构建，彻底摆脱 chunk 求值顺序依赖。
 */
export function getVoiceRoomLabels(): string[] {
  return (cachedVoiceRoomLabels ??= getDefaultVoiceRoomLabels())
}

/** 全屋关闭配置常量与工具函数 */
/** 全屋关闭默认配置（layout.wholeHomeOff） */
const DEFAULT_WHOLE_HOME_OFF: WholeHomeOffConfig = {
  /** 总开关：顶栏按钮入口 */
  enabled: true,
  /** 是否关闭灯光 */
  lights: true,
  /** 是否关闭窗帘（拉合） */
  covers: true,
  /** 是否关闭空调 / 风扇 */
  climate: true,
  /** 是否关闭通用开关（默认关闭以避免误关冰箱等设备） */
  switches: false,
  /** 始终排除的 entity_id */
  excludeEntities: [],
  /** 非空时仅操作列表内实体（按域过滤） */
  entityIds: [],
}
/**
 * 创建一份全屋关闭默认配置（深拷贝数组字段，避免共享引用）。
 *
 * @returns 独立的默认 WholeHomeOffConfig 对象。
 */
export function createDefaultWholeHomeOff(): WholeHomeOffConfig {
  return {
    ...DEFAULT_WHOLE_HOME_OFF,
    excludeEntities: [],
    entityIds: [],
  }
}
/**
 * 规范化全屋关闭配置：合并默认值、校验数组字段。
 *
 * @param raw - 用户输入的部分配置；为空时使用全部默认值。
 * @returns 合并并清洗后的完整 WholeHomeOffConfig。
 */
export function normalizeWholeHomeOff(raw: Partial<WholeHomeOffConfig> = {}): WholeHomeOffConfig {
  return {
    enabled: raw.enabled !== false,
    lights: raw.lights !== false,
    covers: raw.covers !== false,
    climate: raw.climate !== false,
    switches: raw.switches === true,
    excludeEntities: Array.isArray(raw.excludeEntities) ? raw.excludeEntities.filter(Boolean) : [],
    entityIds: Array.isArray(raw.entityIds) ? raw.entityIds.filter(Boolean) : [],
  }
}
/**
 * 从布局对象中读取并规范化全屋关闭配置。
 *
 * @param layout - 布局对象；为空时返回默认配置。
 * @returns 规范化后的 WholeHomeOffConfig。
 */
export function getWholeHomeOffConfig(layout: LayoutWithWholeHomeOff | null | undefined): WholeHomeOffConfig {
  return normalizeWholeHomeOff(layout?.wholeHomeOff)
}
/**
 * 判定「全屋关闭」当前是否可用。
 *
 * 只由 `enabled` 决定：HomeOS 是单一管理员模型，不存在按角色收窄的路径
 * （能力边界由后端登录会话（`require_user`）把关，前端不再重复做可伪造的角色判断）。
 *
 * @param layout - 布局对象，用于读取配置。
 * @returns 功能已启用时返回 true。
 */
export function canUseWholeHomeOff(layout: LayoutWithWholeHomeOff | null | undefined): boolean {
  return getWholeHomeOffConfig(layout).enabled
}
/** 关闭域 key → 中文显示名（用于确认文案） */
const DOMAIN_LABELS: Record<string, string> = {
  lights: '灯光',
  covers: '窗帘',
  climate: '空调/风扇',
  switches: '开关',
}
/** 全屋关闭支持的设备域 key 联合类型 */
type WholeHomeOffDomainKey = 'lights' | 'covers' | 'climate' | 'switches'
/**
 * 当前启用的关闭域（用于确认文案）
 *
 * @param cfg - 全屋关闭配置。
 * @returns 已启用域的中文标签数组，按 lights → covers → climate → switches 顺序。
 */
function getWholeHomeOffDomainLabels(cfg: WholeHomeOffConfig): string[] {
  const labels: string[] = []
  for (const key of ['lights', 'covers', 'climate', 'switches'] as const satisfies WholeHomeOffDomainKey[]) {
    if (cfg[key]) labels.push(DOMAIN_LABELS[key])
  }
  return labels
}
/**
 * 生成全屋关闭确认提示文案。
 *
 * @param cfg - 全屋关闭配置。
 * @returns 形如「将关闭灯光、窗帘、空调/风扇，确定继续？」的文案；无启用域时返回提示。
 */
export function buildWholeHomeOffConfirmText(cfg: WholeHomeOffConfig): string {
  const labels = getWholeHomeOffDomainLabels(cfg)
  if (!labels.length) return '当前未启用任何关闭域，无法执行。'
  return `将关闭${labels.join('、')}，确定继续？`
}
