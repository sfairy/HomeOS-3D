/**
 * 画布共享基础：节点类型 / 摘要 / 端口句柄 / 基础工具。
 *
 * 供 canvas-layout / canvas-topology / canvas-fold / canvas-groups /
 * canvas-connectivity / canvas-sync 等独立模块复用，避免交叉重复定义。
 */
import type { Edge, Node } from '@vue-flow/core'
import type {
  AutomationConditionForm,
  AutomationTriggerForm,
  OrchestratorActionForm,
} from '@/types/orchestrator-builder'
import { clonePlain } from '@/utils/core/clone-plain.util'
import {
  GEEK_ACTION_LABELS,
  GEEK_CONDITION_LABELS,
  GEEK_TRIGGER_LABELS,
} from './graph-types'
import { friendlyTriggerDetail } from './trigger-presets.util'
import { friendlyConditionDetail } from './condition-presets.util'
import { friendlyActionDetail } from './capabilities.util'

/** GeekCanvasKind：类型定义，字段语义见声明。 */
export type GeekCanvasKind =
  | 'start'
  | 'trigger'
  | 'condition'
  | 'action'
  | 'note'
  | 'trigger_group'
  | 'condition_group'

type GeekCanvasNodeData = {
  kind: GeekCanvasKind
  label: string
  detail: string
  trigger?: AutomationTriggerForm
  condition?: AutomationConditionForm
  action?: OrchestratorActionForm
  /** 所属触发/条件组 id（组节点自身的 id） */
  groupId?: string
  /** 组内逻辑 */
  groupLogic?: 'and' | 'or' | string
  /** 注释节点正文 */
  noteText?: string
  /** 实时状态条（Node-RED 式） */
  statusText?: string
  hit?: boolean | null
  /** 展示用：本地引擎可能不支持（不持久化） */
  needsHa?: boolean
}

/** 写回 geekGraph / 剪贴板时去掉运行时展示字段 */
export function stripEphemeralNodeData<T extends Record<string, unknown>>(data: T): T {
  const next = { ...data }
  delete next.hit
  delete next.statusText
  delete next.needsHa
  return next
}

/** GeekCanvasNode：类型定义，字段语义见声明。 */
export type GeekCanvasNode = Omit<Node<GeekCanvasNodeData>, 'data'> & {
  data: GeekCanvasNodeData
}
/** GeekCanvasEdge：类型定义，字段语义见声明。 */
export type GeekCanvasEdge = Edge

/** COL：对象常量，字段 / 方法语义见定义处。 */
export const COL = { start: 32, trigger: 210, condition: 420, action: 640 }
/** 节点卡片（含详情行）实际高度约 56–68，行距需大于此值 */
export const ROW = 88
/** 组头卡片下方留白，避免与首个成员重叠 */
export const GROUP_HEAD = 80
/** GROUP_TAIL：常量，取值语义见定义处。 */
export const GROUP_TAIL = 36
/** BRANCH_X：常量，取值语义见定义处。 */
export const BRANCH_X = 220

/** uid：函数，按签名入参返回处理结果。 */
export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

/** cloneAction：函数，按签名入参返回处理结果。 */
export function cloneAction(a: OrchestratorActionForm): OrchestratorActionForm {
  return clonePlain(a)
}

/** triggerSummary：函数，按签名入参返回处理结果。 */
export function triggerSummary(t: AutomationTriggerForm) {
  const presetLabel =
    t.type === 'state' && t.stateTo === 'on'
      ? '设备打开'
      : t.type === 'state' && t.stateTo === 'off'
        ? '设备关闭'
        : GEEK_TRIGGER_LABELS[t.type] || t.type
  return { label: presetLabel, detail: friendlyTriggerDetail(t) }
}

/** conditionSummary：函数，按签名入参返回处理结果。 */
export function conditionSummary(c: AutomationConditionForm) {
  const lab = GEEK_CONDITION_LABELS[c.operator] || c.operator || '条件'
  return {
    label: c.negated ? `非·${lab}` : lab,
    detail: friendlyConditionDetail(c),
  }
}

/** actionSummary：函数，按签名入参返回处理结果。 */
export function actionSummary(a: OrchestratorActionForm) {
  const lab = GEEK_ACTION_LABELS[a.type] || a.type || '动作'
  return { label: lab, detail: friendlyActionDetail(a) }
}

/** choose 满足口：第 0 支为 `then`，其后为 `then:1`… */
export function thenHandleId(index: number): string {
  return index <= 0 ? 'then' : `then:${index}`
}

/** thenHandleLabel：函数，按签名入参返回处理结果。 */
export function thenHandleLabel(index: number): string {
  return index <= 0 ? '满足' : `满足${index + 1}`
}

/** 解析 then / then:N；无法识别返回 null */
export function thenHandleIndex(handle?: string | null): number | null {
  if (handle === 'then') return 0
  const m = /^then:(\d+)$/.exec(String(handle))
  if (!m) return null
  return Number(m[1])
}

/** isChooseElseHandle：函数，按签名入参返回处理结果。 */
export function isChooseElseHandle(handle?: string | null): boolean {
  return handle === 'else' || handle === 'default'
}
