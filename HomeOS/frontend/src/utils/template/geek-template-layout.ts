/**
 * 模板实体画布布局：星形槽位与 trigger 链
 *
 * 职责：
 * - 为模板实体画布生成星形槽位布局（root + slot + trigger + logic + sensor + yaml 节点）。
 * - 提供 trigger 链布局算法，供模板编辑器渲染画布节点与边。
 *
 * 依赖：@vue-flow/core 的 Node / Edge 类型。
 *
 * 注意：
 * - `TemplateCanvasNodeKind`（root / slot / trigger / logic / sensor / yaml）为节点类型标识符，不翻译。
 * - 坐标 / 偏移为运行时数值，不翻译。
 */
import type { Edge, Node } from '@vue-flow/core'

type TemplateCanvasNodeKind = 'root' | 'slot' | 'trigger' | 'logic' | 'sensor' | 'yaml'

/** TemplateCanvasNodeData：类型定义，字段语义见声明。 */
export type TemplateCanvasNodeData = {
  kind: TemplateCanvasNodeKind
  slotKey?: string
  label: string
  detail: string
  required?: boolean
  empty?: boolean
  icon?: string
}

type TemplateStarSlot = {
  key: string
  label: string
  hint?: string
  icon?: string
  required?: boolean
}

const DEFAULT_CENTER = { x: 360, y: 280 }
const DEFAULT_RADIUS = 200

function slotDetail(value: string | undefined, hint?: string) {
  const v = String(value || '').trim()
  if (v) return v
  return hint ? `选择 ${hint}` : '点击分配实体'
}

/** 家电类型：中心 templateRoot + 叶节点槽位星形布局 */
export function layoutApplianceStarGraph(params: {
  typeLabel: string
  typeIcon?: string
  slots: TemplateStarSlot[]
  slotValues: Record<string, string>
  center?: { x: number; y: number }
  radius?: number
}): { nodes: Node<TemplateCanvasNodeData>[]; edges: Edge[] } {
  const center = params.center ?? DEFAULT_CENTER
  const radius = params.radius ?? DEFAULT_RADIUS
  const slots = params.slots || []
  const nodes: Node<TemplateCanvasNodeData>[] = []
  const edges: Edge[] = []

  const rootId = 'template_root'
  nodes.push({
    id: rootId,
    type: 'template',
    position: { x: center.x - 72, y: center.y - 36 },
    data: {
      kind: 'root',
      label: params.typeLabel || '模板实体',
      detail: `${slots.length} 个槽位`,
      icon: params.typeIcon || '🧩',
    },
  })

  const n = slots.length
  slots.forEach((slot, i) => {
    const angle = n <= 1 ? -Math.PI / 2 : (2 * Math.PI * i) / n - Math.PI / 2
    const x = center.x + radius * Math.cos(angle) - 80
    const y = center.y + radius * Math.sin(angle) - 28
    const nodeId = `slot_${slot.key}`
    const value = params.slotValues[slot.key]
    const empty = !String(value || '').trim()
    nodes.push({
      id: nodeId,
      type: 'template',
      position: { x, y },
      data: {
        kind: 'slot',
        slotKey: slot.key,
        label: slot.label,
        detail: slotDetail(value, slot.hint),
        required: slot.required,
        empty,
        icon: slot.icon || '📌',
      },
    })
    edges.push({
      id: `e_root_${slot.key}`,
      source: rootId,
      target: nodeId,
      type: 'smoothstep',
      animated: empty && !!slot.required,
    })
  })

  return { nodes, edges }
}

/** trigger_sensor：触发 → 逻辑 → 传感器 三节点链 */
export function layoutTriggerSensorChain(params: {
  triggerLabel?: string
  triggerDetail?: string
  logicLabel?: string
  logicDetail?: string
  sensorLabel?: string
  sensorDetail?: string
}): { nodes: Node<TemplateCanvasNodeData>[]; edges: Edge[] } {
  const col = { trigger: 40, logic: 280, sensor: 520 }
  const y = 120
  const nodes: Node<TemplateCanvasNodeData>[] = [
    {
      id: 'trig',
      type: 'template',
      position: { x: col.trigger, y },
      data: {
        kind: 'trigger',
        label: params.triggerLabel || '触发',
        detail: params.triggerDetail || 'state / homeassistant',
        icon: '⚡',
      },
    },
    {
      id: 'logic',
      type: 'template',
      position: { x: col.logic, y },
      data: {
        kind: 'logic',
        label: params.logicLabel || '状态逻辑',
        detail: params.logicDetail || '功率阈值 / Jinja',
        icon: '⚙',
      },
    },
    {
      id: 'sensor',
      type: 'template',
      position: { x: col.sensor, y },
      data: {
        kind: 'sensor',
        label: params.sensorLabel || '模板传感器',
        detail: params.sensorDetail || 'sensor / binary_sensor',
        icon: '📡',
      },
    },
  ]
  const edges: Edge[] = [
    { id: 'e_trig_logic', source: 'trig', target: 'logic', type: 'smoothstep' },
    { id: 'e_logic_sensor', source: 'logic', target: 'sensor', type: 'smoothstep' },
  ]
  return { nodes, edges }
}

/** 纯 YAML 模式占位节点 */
export function layoutYamlImportPlaceholder(): { nodes: Node<TemplateCanvasNodeData>[]; edges: Edge[] } {
  return {
    nodes: [
      {
        id: 'yaml_mode',
        type: 'template',
        position: { x: 280, y: 160 },
        data: {
          kind: 'yaml',
          label: '纯 YAML 模式',
          detail: '直接编辑 configuration.yaml 原文',
          icon: '📄',
        },
      },
    ],
    edges: [],
  }
}

