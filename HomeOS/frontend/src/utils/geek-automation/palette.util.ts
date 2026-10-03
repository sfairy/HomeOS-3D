/**
 * 极客自动化节点投放条（米家式对齐）
 *
 * 职责：
 * - 维护画布节点面板的分组 / 文案 / 节点映射（GEEK_PALETTE）。
 * - 维护分组顺序（GEEK_PALETTE_GROUP_ORDER）与分组查询工具。
 * - 区分本地 / HA-only 动作，避免本地引擎不支持的节点误投放。
 *
 * 依赖：@/utils/orchestrator/automation-local-engine.util 的 SCRIPT_LOCAL_HA_ONLY_ACTIONS。
 *
 * 注意：
 * - `kind`（trigger / condition / action / note）与 `group` 为标识符，不翻译。
 * - 仅面向用户的 label / badge 使用简体中文。
 */
import { SCRIPT_LOCAL_HA_ONLY_ACTIONS } from '@/utils/orchestrator/automation-local-engine.util'

/** GeekPaletteItem：类型定义，字段语义见声明。 */
export type GeekPaletteItem = {
  key: string
  label: string
  badge: string
  group: string
  kind:
    | 'trigger'
    | 'condition'
    | 'action'
    | 'note'
    | 'bundle'
    | 'trigger_group'
    | 'condition_group'
    /** 对选中条件/条件组取反（不新增节点） */
    | 'invert'
  /** 触发/条件预设 id */
  preset?: string
  actionType?: string
  /** 写变量：查询设备并赋值 */
  varFromDevice?: boolean
  /**
   * 静态标记：投放后通常需「由 HA 执行」（不依赖 engine caps）。
   * 脚本侧仍会叠加 SCRIPT_LOCAL_HA_ONLY_ACTIONS（deviceAction / trigger_automation）。
   */
  haOnly?: boolean
  /**
   * 投放触发组/条件组时的组内逻辑。
   * - 有值：逻辑侧栏项；已选中同类型组时只改逻辑
   * - 缺省：空白组，始终新建
   */
  groupLogic?: 'and' | 'or'
  /** 一次投放多个节点 */
  bundle?: 'device_trigger_assign' | 'max_n_times'
  varKey?: string
  varScope?: string
  varSourceEntityId?: string
  varSourceAttribute?: string
}

/** 米家顺序：设备 → 时间 → 流程 → 逻辑 → 其他 → 变量；末尾保留 HomeOS 扩展 */
const GEEK_PALETTE_GROUP_ORDER = [
  '设备',
  '时间',
  '流程',
  '逻辑',
  '其他',
  '变量',
  '通知调试',
] as const

/** GEEK_PALETTE：常量集合，成员语义见定义处。 */
export const GEEK_PALETTE: GeekPaletteItem[] = [
  // —— 逻辑（空白组放前；带 groupLogic 的为快捷项）——
  {
    key: 'trig_group',
    kind: 'trigger_group',
    label: '空白触发组',
    badge: '⧉',
    group: '逻辑',
  },
  {
    key: 'cond_group',
    kind: 'condition_group',
    label: '空白条件组',
    badge: '⧉',
    group: '逻辑',
  },
  {
    key: 'logic_any_trig',
    kind: 'trigger_group',
    label: '当任一事件发生',
    badge: '∨',
    groupLogic: 'or',
    group: '逻辑',
  },
  {
    key: 'logic_all_trig',
    kind: 'trigger_group',
    label: '当全部事件发生',
    badge: '∧',
    groupLogic: 'and',
    group: '逻辑',
  },
  {
    key: 'logic_any_cond',
    kind: 'condition_group',
    label: '满足任一条件',
    badge: '∨',
    groupLogic: 'or',
    group: '逻辑',
  },
  {
    key: 'logic_all_cond',
    kind: 'condition_group',
    label: '满足全部条件',
    badge: '∧',
    groupLogic: 'and',
    group: '逻辑',
  },
  {
    key: 'logic_invert',
    kind: 'invert',
    label: '条件取反',
    badge: '¬',
    group: '逻辑',
  },

  // —— 设备 ——
  {
    key: 'dev_event',
    kind: 'trigger',
    label: '实体状态任意变化',
    badge: '⚡',
    preset: 'device_any',
    group: '设备',
  },
  {
    key: 'dev_query',
    kind: 'condition',
    label: '查询当前状态',
    badge: '?',
    preset: 'eq_on',
    group: '设备',
  },
  {
    key: 'dev_action',
    kind: 'action',
    label: '执行操作',
    badge: '◎',
    actionType: 'callService',
    group: '设备',
  },
  {
    key: 'dev_device_action',
    kind: 'action',
    label: 'HA 设备动作',
    badge: '⎔',
    actionType: 'deviceAction',
    haOnly: true,
    group: '设备',
  },
  {
    key: 'dev_ha_device_trig',
    kind: 'trigger',
    label: 'HA 设备触发',
    badge: '⎔',
    preset: 'ha_device',
    haOnly: true,
    group: '设备',
  },

  // —— 时间 ——
  {
    key: 'time_at',
    kind: 'trigger',
    label: '定时',
    badge: '⏱',
    preset: 'time_at',
    group: '时间',
  },
  {
    key: 'time_interval',
    kind: 'trigger',
    label: '周期性',
    badge: '↻',
    preset: 'interval',
    group: '时间',
  },
  {
    key: 'time_window',
    kind: 'condition',
    label: '时间段',
    badge: '▭',
    preset: 'time_after',
    group: '时间',
  },
  {
    key: 'delay',
    kind: 'action',
    label: '延时',
    badge: '…',
    actionType: 'delay',
    group: '时间',
  },
  {
    key: 'state_held',
    kind: 'trigger',
    label: '状态维持了一段时间',
    badge: '⌛',
    preset: 'state_held',
    group: '时间',
  },
  {
    key: 'sequence',
    kind: 'trigger',
    label: '事件先后发生',
    badge: '⇉',
    preset: 'sequence',
    group: '时间',
  },

  // —— 流程 ——
  {
    key: 'when_if_then',
    kind: 'action',
    label: '当-如果-就',
    badge: '⑂',
    actionType: 'choose',
    group: '流程',
  },
  {
    key: 'loop',
    kind: 'action',
    label: '循环',
    badge: '↻',
    actionType: 'repeat',
    group: '流程',
  },
  {
    key: 'max_n',
    kind: 'bundle',
    label: '最多触发指定次数',
    badge: 'N',
    bundle: 'max_n_times',
    group: '流程',
  },
  {
    key: 'count_reached',
    kind: 'trigger',
    label: '达到指定次数时',
    badge: '=',
    preset: 'var_reached',
    group: '流程',
  },
  {
    key: 'home_mode',
    kind: 'action',
    label: '模式切换',
    badge: '⌂',
    actionType: 'home_mode',
    group: '流程',
  },
  {
    key: 'wait',
    kind: 'action',
    label: '等待事件',
    badge: '◎',
    actionType: 'wait_for_trigger',
    group: '流程',
  },
  {
    key: 'wait_template',
    kind: 'action',
    label: '等待模板',
    badge: '{…}',
    actionType: 'wait_template',
    group: '流程',
  },
  {
    key: 'parallel',
    kind: 'action',
    label: '并行',
    badge: '⇉',
    actionType: 'parallel',
    group: '流程',
  },
  {
    key: 'stop',
    kind: 'action',
    label: '停止',
    badge: '■',
    actionType: 'stop',
    group: '流程',
  },
  {
    key: 'runtime_vars',
    kind: 'action',
    label: '运行时变量',
    badge: '{ }',
    actionType: 'variables',
    group: '流程',
  },
  {
    key: 'fire_event',
    kind: 'action',
    label: '自定义事件',
    badge: '⚡',
    actionType: 'fire_event',
    group: '流程',
  },
  {
    key: 'trigger_automation',
    kind: 'action',
    label: '触发自动化',
    badge: '↯',
    actionType: 'trigger_automation',
    group: '流程',
  },
  {
    key: 'loop_start',
    kind: 'action',
    label: '启动循环',
    badge: '▶↻',
    actionType: 'loop_start',
    group: '流程',
  },
  {
    key: 'loop_stop',
    kind: 'action',
    label: '停止循环',
    badge: '■↻',
    actionType: 'loop_stop',
    group: '流程',
  },

  // —— 其他 ——
  {
    key: 'custom_state',
    kind: 'trigger',
    label: '自定义状态',
    badge: '◇',
    preset: 'event',
    group: '其他',
  },
  {
    key: 'onload',
    kind: 'trigger',
    label: '本自动化启用时',
    badge: '⏻',
    preset: 'onload',
    group: '其他',
  },

  // —— 变量 ——
  {
    key: 'var_trig_assign',
    kind: 'bundle',
    label: '设备触发赋值',
    badge: '⇌',
    bundle: 'device_trigger_assign',
    group: '变量',
  },
  {
    key: 'var_from_dev',
    kind: 'action',
    label: '查询设备并赋值',
    badge: '⤵',
    actionType: 'variable_set',
    varFromDevice: true,
    group: '变量',
  },
  {
    key: 'var_set',
    kind: 'action',
    label: '变量值更新',
    badge: '≡',
    actionType: 'variable_set',
    group: '变量',
  },
  {
    key: 'var_query',
    kind: 'condition',
    label: '查询变量值',
    badge: '?',
    preset: 'var_eq',
    group: '变量',
  },
  {
    key: 'var_math',
    kind: 'action',
    label: '数值运算',
    badge: '∑',
    actionType: 'var_math',
    group: '变量',
  },
  {
    key: 'var_concat',
    kind: 'action',
    label: '文本拼接',
    badge: '⛓',
    actionType: 'var_concat',
    group: '变量',
  },
  {
    key: 'var_fn',
    kind: 'action',
    label: '变量函数',
    badge: 'ƒ',
    actionType: 'var_fn',
    group: '变量',
  },
  {
    key: 'trig_var',
    kind: 'trigger',
    label: '变量变更',
    badge: '≡',
    preset: 'variable',
    group: '变量',
  },

  // —— HomeOS 扩展 ——
  {
    key: 'scene',
    kind: 'action',
    label: '场景',
    badge: '★',
    actionType: 'scene',
    group: '通知调试',
  },
  {
    key: 'script',
    kind: 'action',
    label: '脚本',
    badge: '▷',
    actionType: 'script',
    group: '通知调试',
  },
  {
    key: 'notify',
    kind: 'action',
    label: 'HomeOS通知',
    badge: '✉',
    actionType: 'notify_homeos',
    group: '通知调试',
  },
  {
    key: 'ha_notify',
    kind: 'action',
    label: 'HA通知',
    badge: '📢',
    actionType: 'notify',
    group: '通知调试',
  },
  {
    key: 'debug',
    kind: 'action',
    label: '调试点',
    badge: '◉',
    actionType: 'debug',
    group: '通知调试',
  },
  {
    key: 'note',
    kind: 'note',
    label: '注释',
    badge: '✎',
    actionType: 'note',
    group: '通知调试',
  },
]

/** 脚本画布允许的动作类型（含 wait_for_trigger / wait_template；排除 trigger_automation 等自动化专属项） */
const GEEK_SCRIPT_ACTION_TYPES = new Set([
  'callService',
  'deviceAction',
  'delay',
  'choose',
  'repeat',
  'parallel',
  'stop',
  'variables',
  'fire_event',
  'scene',
  'script',
  'home_mode',
  'notify_homeos',
  'notify',
  'debug',
  'variable_set',
  'var_math',
  'var_concat',
  'var_fn',
  'wait_template',
  'wait_for_trigger',
])

/** 脚本画布：精简动作 + 注释（不含触发/条件） */
export const GEEK_SCRIPT_PALETTE = GEEK_PALETTE.filter(
  (p) =>
    p.kind === 'note' ||
    (p.kind === 'action' && (!p.actionType || GEEK_SCRIPT_ACTION_TYPES.has(p.actionType))),
)

/**
 * 侧栏「需 HA」提示：静态 haOnly，或脚本本地明确不支持的动作类型。
 * 不依赖 engine caps（caps 未加载时仍应给出提示）。
 */
export function paletteItemNeedsHaHint(
  item: GeekPaletteItem,
  mode: 'automation' | 'script' | string = 'automation',
): boolean {
  if (item.haOnly) return true
  if (mode === 'script' && item.kind === 'action' && item.actionType) {
    return SCRIPT_LOCAL_HA_ONLY_ACTIONS.has(item.actionType)
  }
  return false
}

/** 投放条 title：附带 HA / 画布组 / 取反提示文案 */
export function paletteItemTitle(
  item: GeekPaletteItem,
  mode: 'automation' | 'script' | string = 'automation',
): string {
  if (item.kind === 'trigger_group' || item.kind === 'condition_group') {
    const logic =
      item.groupLogic === 'and' ? '组内全部' : item.groupLogic === 'or' ? '组内任一' : ''
    const base = logic ? `${item.label}（画布组 · ${logic}）` : `${item.label}（画布组）`
    return base
  }
  if (item.kind === 'invert') {
    return `${item.label}（对选中的条件或条件组取反）`
  }
  if (!paletteItemNeedsHaHint(item, mode)) return item.label
  return `${item.label}（需 HA 执行）`
}

/** geekPaletteGroups：函数，按签名入参返回处理结果。 */
export function geekPaletteGroups(items: GeekPaletteItem[] = GEEK_PALETTE): string[] {
  const present = new Set(items.map((p) => p.group || '其它'))
  const ordered: string[] = GEEK_PALETTE_GROUP_ORDER.filter((g) => present.has(g))
  for (const g of present) {
    if (!ordered.includes(g)) ordered.push(g)
  }
  return ordered
}
