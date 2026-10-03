/**
 * 极客自动化图 → Automation YAML 编译
 *
 * 职责：
 * - 把 GeekGraph 编译为 HA Automation YAML，复用 buildAutomationYaml。
 * - 提供图的规范化（normalizeGeekGraph），补齐扁平字段与默认值。
 *
 * 依赖：
 * - @/utils/orchestrator/automation-yaml-builder.util 的 buildAutomationYaml。
 * - @/types/orchestrator-builder 的分组类型。
 * - ./graph-types 的 GeekGraph 与派生工具。
 *
 * 注意：
 * - 编译产出的 YAML key 与 HA 自动化字段对齐，不翻译。
 */
import { buildAutomationYaml } from '@/utils/orchestrator/automation-yaml-builder.util'
import type { AutomationConditionGroup, AutomationTriggerGroup } from '@/types/orchestrator-builder'
import {
  createEmptyGeekGraph,
  deriveGeekGraphFlatFields,
  isGeekGraph,
  type GeekGraph,
} from './graph-types'

/** compileGeekGraphToYaml：函数，按签名入参返回处理结果。 */
export function compileGeekGraphToYaml(graph: GeekGraph, automationId?: string | null): string {
  const g = deriveGeekGraphFlatFields({
    ...graph,
    triggerGroups: [...(graph.triggerGroups || [])],
    conditionGroups: [...(graph.conditionGroups || [])],
  })
  const triggerGroups: AutomationTriggerGroup[] = Array.isArray(g.triggerGroups)
    ? g.triggerGroups.filter((grp) => (grp.triggers?.length || 0) > 0)
    : []
  const conditionGroups: AutomationConditionGroup[] = Array.isArray(g.conditionGroups)
    ? g.conditionGroups.filter((grp) => (grp.conditions?.length || 0) > 0)
    : []

  return buildAutomationYaml({
    automationName: g.name || '自动化',
    automationMode: g.mode || 'single',
    triggerGroups,
    conditionGroups,
    condRootLogic: g.condRootLogic || 'and',
    actions: g.actions,
    abData: null,
    triggerLogic: g.triggerLogic || 'or',
    triggerAndTimeout: g.triggerAndTimeout || 60,
    automationId: automationId || '',
  })
}

/** 规范化 API / 本地存储中的 geekGraph（仅接受 v2 groups） */
export function normalizeGeekGraph(raw: unknown): GeekGraph | null {
  if (!raw) return null
  if (typeof raw === 'string') {
    try {
      return normalizeGeekGraph(JSON.parse(raw))
    } catch {
      return null
    }
  }
  if (!isGeekGraph(raw)) return null
  const g = raw as GeekGraph
  return createEmptyGeekGraph({
    ...g,
    version: 2,
    triggerGroups: g.triggerGroups,
    conditionGroups: g.conditionGroups,
    actions: [...(g.actions || [])],
    flowNodes: Array.isArray(g.flowNodes) ? [...g.flowNodes] : undefined,
    flowEdges: Array.isArray(g.flowEdges) ? [...g.flowEdges] : undefined,
  })
}
