/**
 * 极客自动化流程图模板：内置 + 浏览器本地「我的模板」
 *
 * 职责：
 * - 维护内置模板（设备 / 变量 / 流程 / 逻辑 分组）与本地自定义模板的存取。
 * - 提供模板列表查询、按 id 取模板、保存 / 更新 / 删除自定义模板、模板统计等工具。
 * - 安装模板时附带自动布局，确保画布非空。
 *
 * 依赖：
 * - ./graph-types 的 GeekGraph 与空图工厂。
 * - ./defaults 的触发/条件/动作节点工厂。
 * - ./canvas.util 的自动布局。
 * - @/utils/core/clone-plain.util 的深拷贝。
 *
 * 注意：
 * - `GeekTemplateGroup`（device / variable / flow / logic / custom）为分组 key，不翻译。
 * - `source`（builtin / custom）为来源标识，不翻译。
 * - 仅面向用户的 name / description / 分组标签使用简体中文。
 */
import { readLocalStorage, writeLocalStorageJson } from '@/utils/core/local-storage.util'

import { createEmptyGeekGraph, type GeekGraph } from './graph-types'
import { createGeekAction, createGeekCondition, createGeekTrigger } from './defaults'
import { layoutCanvasFromGraph } from './canvas.util'
import { clonePlain } from '@/utils/core/clone-plain.util'

/** GeekTemplateGroup：类型定义，字段语义见声明。 */
export type GeekTemplateGroup = 'device' | 'variable' | 'flow' | 'logic' | 'custom'

/** GeekBuiltinTemplate：类型定义，字段语义见声明。 */
export type GeekBuiltinTemplate = {
  id: string
  name: string
  description: string
  group: GeekTemplateGroup
  /** builtin = 内置；custom = 本地保存 */
  source?: 'builtin' | 'custom'
  updatedAt?: string
  graph: GeekGraph
}

/** GEEK_TEMPLATE_GROUP_LABELS：对象常量，字段 / 方法语义见定义处。 */
export const GEEK_TEMPLATE_GROUP_LABELS: Record<GeekTemplateGroup, string> = {
  device: '设备',
  variable: '变量',
  flow: '流程',
  logic: '逻辑',
  custom: '我的',
}

const CUSTOM_STORAGE_KEY = 'homeos_geek_custom_templates'

/** 为模板图附带自动布局，安装后画布非空 */
function withLayout(graph: GeekGraph): GeekGraph {
  const { nodes, edges } = layoutCanvasFromGraph(graph)
  return {
    ...graph,
    flowNodes: nodes as GeekGraph['flowNodes'],
    flowEdges: edges as GeekGraph['flowEdges'],
  }
}

function cloneGraph(graph: GeekGraph): GeekGraph {
  return clonePlain(graph)
}

const GEEK_BUILTIN_TEMPLATES: GeekBuiltinTemplate[] = [
  {
    id: 'geek_occupancy_illuminance',
    name: '人在且昏暗开灯',
    description: '有人触发 + 照度低于阈值时开灯',
    group: 'device',
    source: 'builtin',
    graph: withLayout(
      createEmptyGeekGraph({
        name: '人在且昏暗开灯',
        mode: 'single',
        triggerLogic: 'or',
        triggers: [
          createGeekTrigger({
            type: 'state',
            entityId: 'binary_sensor.motion_placeholder',
            stateTo: 'on',
          }),
        ],
        conditions: [
          createGeekCondition({
            operator: 'lt',
            entityId: 'sensor.illuminance_placeholder',
            state: '50',
          }),
        ],
        actions: [
          createGeekAction('callService'),
        ].map((a, i) => {
          if (i === 0) {
            a.domain = 'light'
            a.service = 'turn_on'
            a.entityId = 'light.placeholder'
            a.data = JSON.stringify({ brightness_pct: 60 })
          }
          return a
        }),
      }),
    ),
  },
  {
    id: 'geek_var_counter_limit',
    name: '变量限次通知',
    description: '告警触发且计数未超限时通知并累加',
    group: 'variable',
    source: 'builtin',
    graph: withLayout(
      createEmptyGeekGraph({
        name: '变量限次通知',
        mode: 'single',
        triggerLogic: 'or',
        triggers: [
          createGeekTrigger({
            type: 'state',
            entityId: 'binary_sensor.alert_placeholder',
            stateTo: 'on',
          }),
        ],
        conditions: [
          createGeekCondition({
            operator: 'var_lt',
            varKey: 'alert_count',
            state: '3',
          }),
        ],
        actions: [
          (() => {
            const a = createGeekAction('variable_set')
            a.varKey = 'alert_count'
            a.varScope = 'global'
            a.varOp = 'add'
            a.varType = 'number'
            a.varValue = '1'
            return a
          })(),
          (() => {
            const a = createGeekAction('notify_homeos')
            a.notifyMsg = '告警通知（未超限）'
            return a
          })(),
        ],
      }),
    ),
  },
  {
    id: 'geek_only_n_times',
    name: '最多执行 N 次',
    description: '用变量计数，达到上限后不再执行（需先创建全局变量 run_count）',
    group: 'variable',
    source: 'builtin',
    graph: withLayout(
      createEmptyGeekGraph({
        name: '最多执行N次',
        mode: 'single',
        triggerLogic: 'or',
        triggers: [
          createGeekTrigger({
            type: 'state',
            entityId: 'binary_sensor.trigger_placeholder',
            stateTo: 'on',
          }),
        ],
        conditions: [
          createGeekCondition({
            operator: 'var_lt',
            varKey: 'run_count',
            state: '5',
          }),
        ],
        actions: [
          (() => {
            const a = createGeekAction('variable_set')
            a.varKey = 'run_count'
            a.varScope = 'global'
            a.varOp = 'add'
            a.varType = 'number'
            a.varValue = '1'
            return a
          })(),
          (() => {
            const a = createGeekAction('callService')
            a.domain = 'light'
            a.service = 'turn_on'
            a.entityId = 'light.placeholder'
            return a
          })(),
        ],
      }),
    ),
  },
  {
    id: 'geek_sequence_door_then_motion',
    name: '先开门后有人',
    description: '顺序：门开 → 等待人体 → 开灯',
    group: 'flow',
    source: 'builtin',
    graph: withLayout(
      createEmptyGeekGraph({
        name: '先开门后有人',
        mode: 'restart',
        triggerLogic: 'or',
        triggerAndTimeout: 60,
        triggers: [
          createGeekTrigger({
            type: 'sequence',
            sequenceTimeout: 60,
            sequenceSteps: [
              createGeekTrigger({
                type: 'state',
                entityId: 'binary_sensor.door_placeholder',
                stateTo: 'on',
              }),
              createGeekTrigger({
                type: 'state',
                entityId: 'binary_sensor.motion_placeholder',
                stateTo: 'on',
              }),
            ],
          }),
        ],
        conditions: [],
        actions: [
          (() => {
            const a = createGeekAction('callService')
            a.domain = 'light'
            a.service = 'turn_on'
            a.entityId = 'light.placeholder'
            return a
          })(),
        ],
      }),
    ),
  },
  {
    id: 'geek_and_triggers',
    name: '门窗同时触发',
    description: '触发全部满足（AND）后执行',
    group: 'logic',
    source: 'builtin',
    graph: withLayout(
      createEmptyGeekGraph({
        name: '门窗同时触发',
        mode: 'single',
        triggerLogic: 'and',
        triggerAndTimeout: 90,
        triggers: [
          createGeekTrigger({
            type: 'state',
            entityId: 'binary_sensor.door_placeholder',
            stateTo: 'on',
          }),
          createGeekTrigger({
            type: 'state',
            entityId: 'binary_sensor.window_placeholder',
            stateTo: 'on',
          }),
        ],
        conditions: [],
        actions: [
          (() => {
            const a = createGeekAction('notify_homeos')
            a.notifyMsg = '门与窗均已打开'
            return a
          })(),
        ],
      }),
    ),
  },
  {
    id: 'geek_attr_illuminance_light',
    name: '属性照度开灯',
    description: '传感器照度属性低于阈值时开灯',
    group: 'device',
    source: 'builtin',
    graph: withLayout(
      createEmptyGeekGraph({
        name: '属性照度开灯',
        mode: 'single',
        triggerLogic: 'or',
        triggers: [
          createGeekTrigger({
            type: 'numeric',
            entityId: 'sensor.multi_placeholder',
            attribute: 'illuminance',
            numOp: 'below',
            numValue: '30',
          }),
        ],
        conditions: [],
        actions: [
          (() => {
            const a = createGeekAction('callService')
            a.domain = 'light'
            a.service = 'turn_on'
            a.entityId = 'light.placeholder'
            return a
          })(),
        ],
      }),
    ),
  },
  {
    id: 'geek_math_temp_diff',
    name: '温差运算控空调',
    description: '读取温度写入变量 → 运算温差 → round → 分支通知',
    group: 'variable',
    source: 'builtin',
    graph: withLayout(
      createEmptyGeekGraph({
        name: '温差运算控空调',
        mode: 'single',
        triggerLogic: 'or',
        triggers: [
          createGeekTrigger({
            type: 'numeric',
            entityId: 'sensor.indoor_temp_placeholder',
            numOp: 'above',
            numValue: '0',
          }),
        ],
        conditions: [],
        actions: [
          (() => {
            const a = createGeekAction('variable_set')
            a.varKey = 'indoor_temp'
            a.varScope = 'global'
            a.varOp = 'set'
            a.varType = 'number'
            a.varSourceEntityId = 'sensor.indoor_temp_placeholder'
            return a
          })(),
          (() => {
            const a = createGeekAction('var_math')
            a.varKey = 'temp_diff'
            a.varScope = 'global'
            a.mathOp = '-'
            a.mathLhsVar = 'indoor_temp'
            a.mathRhs = '24'
            return a
          })(),
          (() => {
            const a = createGeekAction('var_fn')
            a.varKey = 'temp_diff'
            a.fnName = 'round'
            a.fnArgVar = 'temp_diff'
            a.fnDigits = 1
            return a
          })(),
          (() => {
            const a = createGeekAction('notify_homeos')
            a.notifyMsg = '室内相对目标温差已更新'
            return a
          })(),
        ],
      }),
    ),
  },
  {
    id: 'geek_concat_notify',
    name: '文本拼接通知',
    description: '拼接文案到变量后发送 HomeOS 通知',
    group: 'variable',
    source: 'builtin',
    graph: withLayout(
      createEmptyGeekGraph({
        name: '文本拼接通知',
        mode: 'single',
        triggerLogic: 'or',
        triggers: [
          createGeekTrigger({
            type: 'state',
            entityId: 'binary_sensor.alert_placeholder',
            stateTo: 'on',
          }),
        ],
        conditions: [],
        actions: [
          (() => {
            const a = createGeekAction('variable_set')
            a.varKey = 'alert_msg'
            a.varScope = 'global'
            a.varOp = 'set'
            a.varType = 'string'
            a.varValue = '告警：'
            return a
          })(),
          (() => {
            const a = createGeekAction('var_concat')
            a.varKey = 'alert_msg'
            a.concatParts = '检测到异常，请检查'
            return a
          })(),
          (() => {
            const a = createGeekAction('notify_homeos')
            a.notifyMsg = '告警文案已写入变量 alert_msg'
            return a
          })(),
        ],
      }),
    ),
  },
  {
    id: 'geek_device_to_var',
    name: '设备触发→写变量',
    description: '传感器状态变化时，把当前值写入持久变量（米家「查询设备并赋值」）',
    group: 'device',
    source: 'builtin',
    graph: withLayout(
      createEmptyGeekGraph({
        name: '设备触发→写变量',
        mode: 'single',
        triggerLogic: 'or',
        triggers: [
          createGeekTrigger({
            type: 'state',
            entityId: 'sensor.temp_placeholder',
            stateTo: 'any',
          }),
        ],
        conditions: [],
        actions: [
          (() => {
            const a = createGeekAction('variable_set')
            a.varKey = 'last_temp'
            a.varScope = 'global'
            a.varOp = 'set'
            a.varType = 'number'
            a.varSourceEntityId = 'sensor.temp_placeholder'
            a.varSourceAttribute = ''
            return a
          })(),
          (() => {
            const a = createGeekAction('notify_homeos')
            a.notifyMsg = '已把传感器值写入变量 last_temp'
            return a
          })(),
        ],
      }),
    ),
  },
]

function readCustomRaw(): GeekBuiltinTemplate[] {
  try {
    const raw = readLocalStorage(CUSTOM_STORAGE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list
      .filter((t) => t && typeof t.id === 'string' && t.graph)
      .map((t) => ({
        id: String(t.id),
        name: String(t.name || '未命名模板'),
        description: String(t.description || ''),
        group: 'custom' as const,
        source: 'custom' as const,
        updatedAt: t.updatedAt ? String(t.updatedAt) : undefined,
        graph: cloneGraph(t.graph),
      }))
  } catch {
    return []
  }
}

function writeCustomRaw(list: GeekBuiltinTemplate[]) {
  const payload = list.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    group: 'custom',
    source: 'custom',
    updatedAt: t.updatedAt || new Date().toISOString(),
    graph: t.graph,
  }))
  writeLocalStorageJson(CUSTOM_STORAGE_KEY, payload)
}

/** 内置 + 本地自定义 */
export function listGeekTemplates(): GeekBuiltinTemplate[] {
  return [
    ...GEEK_BUILTIN_TEMPLATES.map((t) => ({ ...t, source: 'builtin' as const })),
    ...readCustomRaw(),
  ]
}

/** getGeekTemplate：函数，按签名入参返回处理结果。 */
export function getGeekTemplate(id: string): GeekBuiltinTemplate | undefined {
  return listGeekTemplates().find((t) => t.id === id)
}

/** saveGeekCustomTemplate：函数，按签名入参返回处理结果。 */
export function saveGeekCustomTemplate(input: {
  id?: string
  name: string
  description?: string
  graph: GeekGraph
}): GeekBuiltinTemplate {
  const name = String(input.name || '').trim() || '我的模板'
  const description = String(input.description || '').trim()
  const list = readCustomRaw()
  const id =
    String(input.id || '').trim() ||
    `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  const graph = withLayout(cloneGraph(input.graph))
  graph.name = name
  const row: GeekBuiltinTemplate = {
    id,
    name,
    description,
    group: 'custom',
    source: 'custom',
    updatedAt: new Date().toISOString(),
    graph,
  }
  const idx = list.findIndex((t) => t.id === id)
  if (idx >= 0) list[idx] = row
  else list.unshift(row)
  writeCustomRaw(list)
  return row
}

/** updateGeekCustomTemplateMeta：函数，按签名入参返回处理结果。 */
export function updateGeekCustomTemplateMeta(
  id: string,
  patch: { name?: string; description?: string },
): GeekBuiltinTemplate | null {
  const list = readCustomRaw()
  const idx = list.findIndex((t) => t.id === id)
  if (idx < 0) return null
  const cur = list[idx]
  if (patch.name != null) {
    cur.name = String(patch.name).trim() || cur.name
    cur.graph = { ...cur.graph, name: cur.name }
  }
  if (patch.description != null) cur.description = String(patch.description).trim()
  cur.updatedAt = new Date().toISOString()
  list[idx] = cur
  writeCustomRaw(list)
  return cur
}

/** deleteGeekCustomTemplate：函数，按签名入参返回处理结果。 */
export function deleteGeekCustomTemplate(id: string): boolean {
  const list = readCustomRaw()
  const next = list.filter((t) => t.id !== id)
  if (next.length === list.length) return false
  writeCustomRaw(next)
  return true
}

/** GeekTemplateStats：类型定义，字段语义见声明。 */
export type GeekTemplateStats = {
  triggers: number
  conditions: number
  actions: number
  placeholders: string[]
}

/** geekTemplateStats：函数，按签名入参返回处理结果。 */
export function geekTemplateStats(graph: GeekGraph | null | undefined): GeekTemplateStats {
  const g = graph || createEmptyGeekGraph()
  const raw = JSON.stringify(g)
  const found = raw.match(/[a-z][a-z0-9_]*\.[a-z0-9_]*placeholder[a-z0-9_]*/gi) || []
  const placeholders = [...new Set(found.map((s) => s.toLowerCase()))].sort()
  return {
    triggers: Array.isArray(g.triggers) ? g.triggers.length : 0,
    conditions: Array.isArray(g.conditions) ? g.conditions.length : 0,
    actions: Array.isArray(g.actions) ? g.actions.length : 0,
    placeholders,
  }
}

/** isGeekGraphNonEmpty：函数，按签名入参返回处理结果。 */
export function isGeekGraphNonEmpty(graph: GeekGraph | null | undefined): boolean {
  if (!graph) return false
  const t = Array.isArray(graph.triggers) ? graph.triggers.length : 0
  const c = Array.isArray(graph.conditions) ? graph.conditions.length : 0
  const a = Array.isArray(graph.actions) ? graph.actions.length : 0
  return t + c + a > 0
}
