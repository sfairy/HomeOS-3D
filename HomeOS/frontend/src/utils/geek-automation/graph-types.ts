/**
 * 极客自动化流程图模型（编辑源真相；编译为 Automation YAML）
 *
 * 职责：
 * - 定义自动化流程图数据模型（GeekGraph）及其节点 / 边类型。
 * - 提供空图工厂、图合法性判定、扁平字段派生等工具。
 * - v2：多组触发/条件（triggerGroups / conditionGroups），与经典编辑器一致。
 *
 * 依赖：@/types/orchestrator-builder 的触发/条件/动作表单类型。
 *
 * 注意：
 * - `GEEK_GRAPH_VERSION` 为图模型版本号，不翻译。
 * - 节点 kind（trigger / condition / action / note）为标识符，不翻译。
 */
import type {
  AutomationConditionForm,
  AutomationConditionGroup,
  AutomationTriggerForm,
  AutomationTriggerGroup,
  OrchestratorActionForm,
} from '@/types/orchestrator-builder'

const GEEK_GRAPH_VERSION = 2 as const

/** GeekGraph：类型定义，字段语义见声明。 */
export interface GeekGraph {
  version: typeof GEEK_GRAPH_VERSION
  name: string
  mode: 'single' | 'restart' | 'queued' | 'parallel' | string
  /** 组间触发逻辑 */
  triggerLogic: 'and' | 'or' | string
  triggerAndTimeout: number
  /** 组间条件逻辑 */
  condRootLogic: 'and' | 'or' | string
  /** v2 多组触发；组内 logic + 组间 triggerLogic */
  triggerGroups: AutomationTriggerGroup[]
  /** v2 多组条件；组内 logic + 组间 condRootLogic */
  conditionGroups: AutomationConditionGroup[]
  /**
   * 由 triggerGroups 派生的扁平视图（仅内存/UI；不以扁平字段作为持久化真相）。
   */
  triggers: AutomationTriggerForm[]
  /** 由 conditionGroups 派生的扁平视图（仅内存/UI） */
  conditions: AutomationConditionForm[]
  actions: OrchestratorActionForm[]
  /** Vue Flow 画布节点快照（含坐标与载荷） */
  flowNodes?: Array<{
    id: string
    type?: string
    position: { x: number; y: number }
    data: Record<string, unknown>
    parentNode?: string
    extent?: 'parent' | string
    style?: Record<string, unknown>
    draggable?: boolean
  }>
  /** Vue Flow 边快照 */
  flowEdges?: Array<{
    id: string
    source: string
    target: string
    sourceHandle?: string | null
    targetHandle?: string | null
    label?: string
    animated?: boolean
  }>
  /**
   * 与之配套的 YAML 指纹（fingerprintAutomationYaml）。
   * 打开时若与当前 yaml 不一致，则丢弃陈旧图改从 YAML 还原。
   */
  yamlDigest?: string
}

/** createEmptyGeekGraph：函数，按签名入参返回处理结果。 */
export function createEmptyGeekGraph(partial?: Partial<GeekGraph>): GeekGraph {
  const baseTriggerGroups = partial?.triggerGroups
  const baseConditionGroups = partial?.conditionGroups
  const triggerGroups = baseTriggerGroups
    ? baseTriggerGroups.map((g) => ({
        logic: g.logic || 'or',
        triggers: [...(g.triggers || [])],
      }))
    : partial?.triggers?.length
      ? [
          {
            logic: (partial.triggerLogic === 'and' ? 'and' : 'or') as string,
            triggers: [...partial.triggers],
          },
        ]
      : []
  const conditionGroups = baseConditionGroups
    ? baseConditionGroups.map((g) => ({
        logic: g.logic || 'and',
        conditions: [...(g.conditions || [])],
      }))
    : partial?.conditions?.length
      ? [
          {
            logic: (partial.condRootLogic === 'or' ? 'or' : 'and') as string,
            conditions: [...partial.conditions],
          },
        ]
      : []
  const { triggerGroups: _tg, conditionGroups: _cg, triggers: _t, conditions: _c, version: _v, ...rest } =
    partial || {}
  return deriveGeekGraphFlatFields({
    name: '',
    mode: 'single',
    triggerLogic: 'or',
    triggerAndTimeout: 60,
    condRootLogic: 'and',
    actions: [],
    ...rest,
    version: GEEK_GRAPH_VERSION,
    triggerGroups,
    conditionGroups,
    triggers: [],
    conditions: [],
  })
}

/** 仅从 groups 派生扁平 triggers/conditions（不写回 groups） */
export function deriveGeekGraphFlatFields(graph: GeekGraph): GeekGraph {
  if (!Array.isArray(graph.triggerGroups)) graph.triggerGroups = []
  if (!Array.isArray(graph.conditionGroups)) graph.conditionGroups = []
  graph.triggers = graph.triggerGroups.flatMap((g) => g.triggers || [])
  graph.conditions = graph.conditionGroups.flatMap((g) => g.conditions || [])
  return graph
}

/** isGeekGraph：函数，按签名入参返回处理结果。 */
export function isGeekGraph(raw: unknown): raw is GeekGraph {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const g = raw as Record<string, unknown>
  if (Number(g.version) !== GEEK_GRAPH_VERSION) return false
  return (
    Array.isArray(g.triggerGroups) &&
    Array.isArray(g.conditionGroups) &&
    Array.isArray(g.actions)
  )
}

/** 动作类型 → 节点展示标签 */
export const GEEK_ACTION_LABELS: Record<string, string> = {
  callService: '调用服务',
  delay: '延时',
  notify: '通知',
  scene: '场景',
  script: '脚本',
  fire_event: '事件',
  wait_for_trigger: '等待条件',
  wait_template: '等待模板',
  choose: '条件分支',
  repeat: '重复',
  variables: '运行时变量',
  variable_set: '持久变量',
  var_math: '数值运算',
  var_concat: '文本拼接',
  var_fn: '变量函数',
  parallel: '并行',
  sequence: '顺序动作',
  home_mode: '家庭模式',
  notify_homeos: 'HomeOS 通知',
  note: '注释',
  debug: '调试点',
  loop_start: '启动循环',
  loop_stop: '停止循环',
  deviceAction: 'HA 设备动作',
  trigger_automation: '触发自动化',
  stop: '停止',
}

/** GEEK_TRIGGER_LABELS：对象常量，字段 / 方法语义见定义处。 */
export const GEEK_TRIGGER_LABELS: Record<string, string> = {
  state: '状态变化',
  numeric: '数值',
  time: '定时',
  sun: '日出日落',
  homeassistant: 'HA 事件',
  event: '自定义事件',
  presence: '在家状态',
  zone: '区域',
  calendar: '日历',
  onload: '启用时',
  interval: '循环间隔',
  sequence: '顺序触发',
  variable: '变量变更',
  device: 'HA 设备触发',
}

/** GEEK_CONDITION_LABELS：对象常量，字段 / 方法语义见定义处。 */
export const GEEK_CONDITION_LABELS: Record<string, string> = {
  eq: '等于',
  neq: '不等于',
  gt: '大于',
  lt: '小于',
  gte: '大于等于',
  lte: '小于等于',
  contains: '包含',
  between: '介于',
  state_for: '持续状态',
  time_after: '时间段',
  time_before: '早于时刻',
  sun_after: '太阳之后',
  sun_before: '太阳之前',
  var_eq: '查询变量值',
  var_neq: '变量不等于',
  var_gt: '变量大于',
  var_gte: '变量大于等于',
  var_lt: '变量小于',
  var_lte: '变量小于等于',
  weekday: '生效星期',
}
