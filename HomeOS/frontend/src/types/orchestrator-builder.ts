/**
 * 联动器 Builder / YAML 预览 / 模板实体 共享类型。
 * 依赖：vue（Ref / WritableComputedRef）。
 */
import type { Ref, WritableComputedRef } from 'vue'

/** 可写 ref 或 plain 值（flash / copy 共用） */
export type WritableRefLike<T> = Ref<T> | WritableComputedRef<T> | { value: T }

/** call_service 参数面板（与 orchestrator-service-data.util 结构对齐） */
export interface ServiceDataPanel {
  brightness_pct?: number // 亮度百分比（0-100）
  color_temp?: number // 色温（mired）
  transition?: number // 过渡时长（秒）
  rgb_color?: string // RGB 颜色（字符串形式）
  effect?: string // 特效名
  temperature?: number // 温度
  position?: number // 位置百分比（0-100）
  volume_level?: number // 音量（0-1）
  percentage?: number // 百分比（风扇等）
  humidity?: number // 湿度
  hvac_mode?: string // 空调模式
  code?: string // 验证码（门锁等）
  value?: number // 通用数值
  option?: string // 下拉选项值
}

/** 联动器服务动作 */
export interface OrchestratorServiceAction {
  domain?: string // HA 服务域
  service?: string // HA 服务名
  data?: string // 服务数据（YAML 字符串）
  entityId?: string // 目标实体 ID
  [showParamsKey: string]: unknown // 动态参数键
}

/** 已保存联动器条目（列表行最小形状） */
export interface OrchestratorSavedItem {
  id: string // 联动器唯一 ID
  name?: string // 联动器名称
  entity_id?: string // 模板实体 ID
  yaml?: string // YAML 内容
  runOnHa?: boolean // 是否在 HA 上运行
  enabled?: boolean // 是否启用
  haConfigId?: string // HA 配置 ID（驼峰）
  ha_config_id?: string // HA 配置 ID（下划线）
  haSyncedAt?: string | null // HA 同步时间（驼峰）
  ha_synced_at?: string | null // HA 同步时间（下划线）
  haEntityId?: string // HA 实体 ID
  blockedReason?: string // 被阻止原因
  type?: string // 类型（automation / script / template）
  yamlComplete?: boolean // YAML 是否完整
  trigger_entity_id?: string // 触发实体 ID（下划线）
  triggerEntityId?: string // 触发实体 ID（驼峰）
  [key: string]: unknown // 其它扩展字段
}

/** 自动化触发器表单行 */
export interface AutomationTriggerForm {
  type: string // 触发器类型
  entityId: string // 触发实体 ID
  /** 多实体（任一变化）；有值时优先于 entityId */
  entityIds?: string[]
  /** 监听属性（空=状态） */
  attribute?: string
  stateFrom: string // 状态变化前值
  stateTo: string // 状态变化后值
  forSeconds: string | number // 持续时长（秒）
  at: string // 定时触发时间
  /** 定时触发星期过滤 0=周日…6=周六（空/缺省=每天） */
  days?: number[]
  sunEvent: string // 日出日落事件
  sunOffset: number // 日出日落偏移（分钟，可负）
  numOp: string // 数值比较操作符
  numValue: string | number // 数值比较目标值
  /** numeric 同时含 above+below 时的上界 below（可选） */
  numBelow?: string | number
  haEvent: string // HA 事件类型
  eventType: string // 事件类型
  eventDataKey: string // 事件数据 key
  eventDataVal: string // 事件数据 value
  presenceKind?: string // 在家状态类型
  zoneId: string // 区域 ID
  zoneEvent: string // 区域事件
  calendarEvent: string // 日历事件
  /** 事件序列步骤（type=sequence） */
  sequenceSteps?: AutomationTriggerForm[]
  sequenceTimeout?: number
  /** 循环间隔秒数（type=interval） */
  intervalSeconds?: number
  loopControlVar?: string
  /** 变量变更触发（type=variable） */
  varKey?: string
  /** 变量变为某值时触发（可选） */
  varValue?: string
  [key: string]: unknown // 其它扩展字段
}

/** 自动化条件表单行 */
export interface AutomationConditionForm {
  entityId?: string // 条件实体 ID
  operator: string // 比较操作符
  state?: string | number // 比较目标值
  /** 比较属性（空=状态） */
  attribute?: string
  /** 状态已持续秒数（state_for / numeric for） */
  forSeconds?: string | number
  /** between 上界 */
  stateTo?: string | number
  /** 星期过滤 0=周日…6=周六 */
  days?: number[]
  /** 日出/日落偏移（分钟，可负；sun_after → after_offset） */
  sunOffset?: number
  /** 变量条件 key */
  varKey?: string
  /** 变量作用域 global | rule */
  varScope?: string
  /**
   * 逻辑取反：编译为 HA `condition: not` 包裹本条件。
   * 与 operator=neq（不等于某状态）不同；二者不应同时为真语义叠加。
   */
  negated?: boolean
  [key: string]: unknown // 其它扩展字段
}

/** 触发器分组（含逻辑连接） */
export interface AutomationTriggerGroup {
  logic: 'and' | 'or' | string // 组内逻辑：and=且，or=或
  triggers: AutomationTriggerForm[] // 触发器列表
}

/** 条件分组（含逻辑连接） */
export interface AutomationConditionGroup {
  logic: 'and' | 'or' | string // 组内逻辑：and=且，or=或
  conditions: AutomationConditionForm[] // 条件列表
}

/** choose 分支内动作 */
export interface OrchestratorBranchAction {
  type: string // 动作类型
  entityId?: string // 目标实体 ID
  seconds?: number // 延迟秒数
  message?: string // 消息内容
  domain?: string // HA 服务域
  service?: string // HA 服务名
  notifySvc?: string // 通知服务
  notifyMsg?: string // 通知消息
  eventType?: string // 事件类型
  eventData?: string // 事件数据
  sceneId?: string // 场景 ID
  scriptId?: string // 脚本 ID
  [key: string]: unknown // 其它扩展字段
}

/** choose 分支 */
export interface OrchestratorChooseBranch {
  condEntityId?: string // 条件实体 ID
  condOp?: string // 条件操作符
  condState?: string // 条件目标状态
  /** between 上界 */
  condStateTo?: string
  /** 比较属性（空=状态） */
  condAttribute?: string
  /** 变量条件 key */
  condVarKey?: string
  /** 变量作用域 */
  condVarScope?: string
  /** 持续秒数 */
  condForSeconds?: string | number
  /** 星期过滤 */
  condDays?: number[]
  /** 日出/日落偏移（分钟） */
  condSunOffset?: number
  /** 外层逻辑取反（condition: not） */
  condNegated?: boolean
  /** 分支内多条件逻辑（默认 and；列表多项时 HA 亦为 and） */
  condLogic?: 'and' | 'or'
  /** 分支条件列表（优先于扁平 cond*；为空时从扁平合成） */
  conditions?: AutomationConditionForm[]
  isDefault?: boolean // 是否为默认分支
  actions: OrchestratorBranchAction[] // 分支动作列表
  [key: string]: unknown // 其它扩展字段
}

/** 自动化 / 脚本动作表单行 */
export interface OrchestratorActionForm extends OrchestratorServiceAction {
  type: string // 动作类型
  domain?: string // HA 服务域
  service?: string // HA 服务名
  entityId?: string // 目标实体 ID
  data?: string // 服务数据（YAML 字符串）
  seconds?: number // 延迟秒数
  message?: string // 消息内容
  notifyMsg?: string // 通知消息
  notifySvc?: string // 通知服务
  eventType?: string // 事件类型
  eventData?: string // 事件数据
  waitTimeout?: string | number // 等待超时（秒）
  /** wait_for_trigger / wait_template：超时后是否继续 */
  continueOnTimeout?: boolean
  /** wait_template 的 Jinja 模板 */
  waitTemplate?: string
  waitTriggerType?: string
  waitStateTo?: string
  waitEventType?: string
  waitAttribute?: string
  waitEventDataKey?: string
  waitEventDataVal?: string
  waitNumOp?: string
  waitNumValue?: string | number
  branches?: OrchestratorChooseBranch[] // choose 分支列表
  /** HA continue_on_error */
  continueOnError?: boolean
  repeatCount?: number // 重复次数
  repeatType?: string // 重复类型
  /** repeatType=for_each 时的列表/模板（YAML 文本） */
  repeatForEach?: string
  repeatEntityId?: string // 重复条件实体 ID
  repeatCondState?: string // 重复条件状态
  repeatActions?: OrchestratorBranchAction[] // 重复动作列表
  sceneId?: string // 场景 ID
  scriptId?: string // 脚本 ID
  modeId?: string // 安防模式 ID
  /** 运行时 variables / 持久变量 */
  varKey?: string
  varScope?: 'global' | 'rule' | string
  varOp?: 'set' | 'add' | 'concat' | string
  varValue?: string
  varType?: 'number' | 'string' | string
  varSourceEntityId?: string
  varSourceAttribute?: string
  varSourceVar?: string
  /** 持久变量取值来源 literal|var|device */
  varSourceKind?: string
  variablesMap?: string
  parallelActions?: OrchestratorBranchAction[]
  /** 并行分支（每路可多步；优先于 parallelActions） */
  parallelBranches?: OrchestratorActionForm[][]
  /** wait_for_trigger：除首个外的额外触发器（原样往返） */
  waitExtraTriggers?: Record<string, unknown>[]
  /** call_service target：area / device / label（可与 entityId 并存） */
  targetAreaId?: string
  targetDeviceId?: string
  targetLabelId?: string
  /** 数值运算 */
  mathOp?: string
  mathLhs?: string | number
  mathRhs?: string | number
  mathLhsVar?: string
  mathRhsVar?: string
  /** UI：左/右操作数模式 literal|var（避免 commit 回写把空变量模式打回字面） */
  mathLhsKind?: string
  mathRhsKind?: string
  /** 文本拼接 */
  concatParts?: string
  concatSourceVar?: string
  concatSourceKind?: string
  /** 变量函数 */
  fnName?: string
  fnArg?: string
  fnArgVar?: string
  fnArgKind?: string
  fnDigits?: number
  _showParams?: boolean // 是否展示参数面板（UI 态）
  _showSbParams?: boolean // 是否展示脚本参数面板（UI 态）
}
/** 联动器动作变体：automation=自动化，script=脚本 */
export type OrchestratorActionVariant = 'automation' | 'script'

/** YAML 动作解析上下文 */
export interface YamlActionParseContext {
  defaultAction: () => OrchestratorActionForm // 默认动作工厂
  parseForSeconds?: (raw: unknown) => string // for 字段解析器
  variant: OrchestratorActionVariant // 动作变体
}

/** 动作 YAML 行生成上下文 */
export interface OrchestratorActionYamlContext {
  dataPanel: ServiceDataPanel | Record<string, unknown> | null | undefined // 参数面板值
  panelOpen: boolean // 参数面板是否展开
  variant: OrchestratorActionVariant // 动作变体
  indent?: string // 缩进字符串
  /** 嵌套 loop_start/stop 写入 automation_id 时的回落 */
  automationId?: string | null
}

/** 构建自动化 YAML 的输入 */
export interface BuildAutomationYamlInput {
  automationName: string // 自动化名称
  automationMode: string // 自动化模式（single / restart / queued）
  triggerGroups: AutomationTriggerGroup[] // 触发器分组列表
  conditionGroups: AutomationConditionGroup[] // 条件分组列表
  condRootLogic: string // 条件根逻辑（and / or）
  actions: OrchestratorActionForm[] // 动作列表
  abData: ServiceDataPanel | Record<string, unknown> | null | undefined // 自动化参数面板值
  /** 组间触发逻辑；and 时编译为 wait_for_trigger 链 */
  triggerLogic?: string
  /** AND 链中每个 wait 的超时秒数 */
  triggerAndTimeout?: number
  /** 当前编辑规则 ID；用于 loop_start/stop 默认写入 automation_id */
  automationId?: string | null
}

/** 自动化表单解析结果 */
export interface AutomationFormParsed {
  automationName: string // 自动化名称
  automationMode: string // 自动化模式
  triggerGroups: AutomationTriggerGroup[] // 触发器分组列表
  conditionGroups: AutomationConditionGroup[] // 条件分组列表
  condRootLogic: 'and' | 'or' | string // 条件根逻辑
  triggerLogic?: 'and' | 'or' | string
  triggerAndTimeout?: number
  actions: OrchestratorActionForm[] // 动作列表
  [key: string]: unknown // 其它扩展字段
}

/** 脚本字段表单行 */
export interface ScriptFieldForm {
  name: string // 字段名
  description?: string // 字段描述
  selector: string // 选择器类型
  /** 复杂 selector 嵌套选项（如 entity.domain），往返保留 */
  selectorOptions?: Record<string, unknown> | null
  default?: string // 默认值
  [key: string]: unknown // 其它扩展字段
}

/** 构建脚本 YAML 的输入 */
export interface BuildScriptYamlInput {
  scriptName: string // 脚本名称
  scriptDesc?: string // 脚本描述
  scriptMode: string // 脚本模式
  fields: ScriptFieldForm[] // 字段列表
  actions: OrchestratorActionForm[] // 动作列表
  sbData: ServiceDataPanel | Record<string, unknown> | null | undefined // 脚本参数面板值
}

/** 脚本表单解析结果 */
export interface ScriptFormParsed {
  scriptName: string // 脚本名称
  scriptDesc: string // 脚本描述
  scriptMode: string // 脚本模式
  fields: ScriptFieldForm[] // 字段列表
  actions: OrchestratorActionForm[] // 动作列表
  [key: string]: unknown // 其它扩展字段
}

/** 场景实体表单行 */
export interface SceneEntityForm {
  entityId: string // 实体 ID
  state: string // 目标状态
  customState?: string // 自定义状态值
  _show?: boolean // 是否展开详情（UI 态）
  brightness?: number | null // 亮度百分比（0-100）
  colorTemp?: number | null // 色温（mired）
  rgbColor?: string // RGB 颜色
  transition?: number | null // 过渡时长（秒）
  effect?: string // 特效名
  position?: number | null // 位置百分比（0-100）
  temperature?: number | null // 温度
  hvacMode?: string // 空调模式
  volume?: number | null // 音量（0-1）
  source?: string // 音源
  percentage?: number | null // 百分比（风扇等）
  code?: string // 验证码
  option?: string // 下拉选项值
  value?: number | null // 通用数值
  humidity?: number | null // 湿度
  fanSpeed?: string // 风扇转速
  [key: string]: unknown // 其它扩展字段
}

/** 构建场景 YAML 的输入 */
export interface BuildSceneYamlInput {
  sceneName: string // 场景名称
  entities: SceneEntityForm[] // 实体列表
}

/** Builder toast 反馈 */
export interface BuilderFeedbackResult {
  ok: boolean // 是否成功
  message?: string // 反馈消息
}

/** 同步反馈选项 */
export interface WithSyncFeedbackOptions {
  reload?: () => Promise<void> | void // 成功后重新加载回调
  ttlMs?: number // toast 展示时长（毫秒）
  after?: (r: BuilderFeedbackResult) => Promise<void> | void // 完成后回调
}

/** 复制 Builder YAML 的选项 */
export type CopyBuilderYamlOptions = {
  ttlMs?: number // toast 展示时长（毫秒）
  dismissAfter?: (ms?: number) => void // 延迟关闭回调
}
/** 导入流程 */
export interface OrchestratorImportFlowOptions {
  /** 宽松：兼容 Pinia chrome store（notify 签名因 store 版本可能不同） */
  chrome?: unknown
  validateYaml?: (yaml: string) => Promise<{ valid?: boolean; message?: string } | null | undefined> // YAML 校验函数
  onImported?: (created: unknown) => void | Promise<void> // 导入成功回调
  entityLabel?: string // 实体标签
}

/** 粘贴 YAML 提交选项 */
export interface SubmitPasteYamlOptions {
  createFn: (yaml: string) => Promise<unknown> // 创建函数
  yaml?: string // YAML 内容
  /** 导入成功附加提示；非空时以 warning 展示并拼到成功文案后 */
  successHint?: (yaml: string) => string | null
}

/** 执行导入选项 */
export interface DoImportOptions {
  fetchFn: () => Promise<unknown[] | null | undefined> // 拉取函数
  mapRow?: (row: unknown) => unknown // 行映射函数
  onEach?: (mapped: unknown, row: unknown) => void | Promise<void> // 每行回调
  /**
   * 自定义成功通知。
   * - 返回 null：不弹通知（由调用方自行汇总）
   * - 返回 { message, type }：使用自定义文案
   * - 省略：默认「已导入 N 个…」
   */
  successNotify?: (ctx: {
    count: number
    items: unknown[]
  }) => { message: string; type?: string } | null
}

/** 同步问题汇总 */
export interface OrchestratorSyncStatusEntry {
  drift?: boolean // 是否漂移（HA 端与本地不一致）
  synced?: boolean // 是否已同步
  lastSyncError?: string | null // 最近同步错误
  unknown?: boolean // 拉取失败，状态未知
  [key: string]: unknown // 其它扩展字段
}

/** 同步问题类型：drift=漂移，missing=缺失，pending=待同步，blocked=被阻止 */
export type SyncIssueType = 'drift' | 'missing' | 'pending' | 'blocked'

/** 单个同步问题 */
export interface OrchestratorSyncIssue {
  id: string // 联动器 ID
  name: string // 联动器名称
  type: SyncIssueType | string // 问题类型
  label: string // 问题标签
  message: string // 问题描述
}

/** 同步问题汇总 */
export interface OrchestratorSyncIssueSummary {
  issues: OrchestratorSyncIssue[] // 问题列表
  byType: Record<string, OrchestratorSyncIssue[]> // 按类型分组
  driftCount: number // 漂移数
  missingCount: number // 缺失数
  pendingCount: number // 待同步数
  blockedCount: number // 被阻止数
  hasIssues: boolean // 是否存在问题
}

/** CRUD 列表归一化结果 */
export interface CrudListNormalized {
  rows: Array<Record<string, unknown>> // 行列表
  total: number // 总数
}

/** 模板实体上下文选项 */
export interface TemplateEntityContextOptions {
  remote?: boolean // 是否远程
  haConfigReadable?: boolean // HA 配置是否可读
  apiGet?: (url: string, cfg?: Record<string, unknown>) => Promise<{ data?: Record<string, unknown> }> // GET 请求函数
  entities?: Record<string, unknown> // 实体映射表
}

/** 同步导入模板选项 */
export interface SyncImportedTemplateOptions {
  apiGet: (url: string, cfg?: Record<string, unknown>) => Promise<{ data?: Record<string, unknown> }> // GET 请求函数
  apiPut: (url: string, body: Record<string, unknown>) => Promise<unknown> // PUT 请求函数
  haConfigReadable?: boolean // HA 配置是否可读
  entities?: Record<string, unknown> // 实体映射表
}

/** 模板实体上下文结果 */
export interface TemplateEntityContextResult {
  yaml: string // YAML 内容
  triggerEntityId: string // 触发实体 ID
  [key: string]: unknown // 其它扩展字段
}