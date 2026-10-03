/**
 * @file linkage-hub.types.ts
 * @module frontend/src/composables
 */
export type LinkageHubKind = 'scene' | 'automation' | 'script' | 'template'

/** 含历史 `geek` query，解析时归一到 automation */
export type LinkageHubTab = 'overview' | LinkageHubKind

/** LinkageHubTrack：类型定义，字段语义见声明。 */
export type LinkageHubTrack = 'homeos' | 'ha'

interface LinkageHubTabMeta {
  id: LinkageHubKind
  label: string
  emoji: string
  accent: string
  accentSub: string
  hint: string
  tone: string
  searchPlaceholder: string
  emptyTitle: string
  emptyDescription: string
  haTitle: string
  primaryAction: 'execute' | 'trigger'
  primaryActionLabel: string
}

interface LinkageHubOverviewMeta {
  id: 'overview'
  label: string
  emoji: string
  hint: string
  tone: string
}

/** LINKAGE_HUB_OVERVIEW_META：对象常量，字段 / 方法语义见定义处。 */
export const LINKAGE_HUB_OVERVIEW_META: LinkageHubOverviewMeta = {
  id: 'overview',
  label: '联动总览',
  emoji: '📊',
  hint: '场景、自动化、脚本与模板实体的健康状态与执行概况',
  tone: 'cyan',
}

/** LINKAGE_HUB_KIND_META：对象常量，字段 / 方法语义见定义处。 */
export const LINKAGE_HUB_KIND_META: Record<LinkageHubKind, LinkageHubTabMeta> = {
  scene: {
    id: 'scene',
    label: '场景',
    emoji: '✨',
    accent: '#38bdf8',
    accentSub: '#7dd3fc',
    hint: '一键切换全屋设备状态，HomeOS 本地引擎与 HA 双轨执行',
    tone: 'sky',
    searchPlaceholder: '搜索场景…',
    emptyTitle: '暂无 HomeOS 场景',
    emptyDescription: '创建场景或使用模板快速体验智能家居',
    haTitle: 'Home Assistant 场景',
    primaryAction: 'execute',
    primaryActionLabel: '执行',
  },
  automation: {
    id: 'automation',
    label: '自动化',
    emoji: '⚡',
    accent: '#fbbf24',
    accentSub: '#f59e0b',
    hint: '可视化流程编辑：触发 → 条件 → 动作，支持本地引擎与 HA 同步',
    tone: 'amber',
    searchPlaceholder: '搜索自动化…',
    emptyTitle: '暂无自动化',
    emptyDescription: '创建规则让家居自动响应你的生活习惯',
    haTitle: 'Home Assistant 自动化',
    primaryAction: 'trigger',
    primaryActionLabel: '触发',
  },
  script: {
    id: 'script',
    label: '脚本',
    emoji: '📜',
    accent: '#34d399',
    accentSub: '#2dd4bf',
    hint: '可重复调用的多步骤动作序列，支持变量与条件分支',
    tone: 'emerald',
    searchPlaceholder: '搜索脚本…',
    emptyTitle: '暂无脚本',
    emptyDescription: '创建脚本封装复杂操作流程',
    haTitle: 'Home Assistant 脚本',
    primaryAction: 'execute',
    primaryActionLabel: '执行',
  },
  template: {
    id: 'template',
    label: '模板实体',
    emoji: '📦',
    accent: '#a78bfa',
    accentSub: '#c4b5fd',
    hint: 'HomeOS 模板传感器/开关与 HA configuration.yaml 同步',
    tone: 'violet',
    searchPlaceholder: '搜索模板实体…',
    emptyTitle: '暂无模板实体',
    emptyDescription: '新建模板实体并编辑 YAML；也可在设置编排中发现并导入 HA configuration.yaml',
    haTitle: 'Home Assistant 模板实体',
    primaryAction: 'execute',
    primaryActionLabel: '编辑',
  },
}

/** isLinkageHubKind：函数，按签名入参返回处理结果。 */
export function isLinkageHubKind(tab: LinkageHubTab): tab is LinkageHubKind {
  return tab !== 'overview'
}

/** parseLinkageHubTab：函数，按签名入参返回处理结果。 */
export function parseLinkageHubTab(raw: unknown): LinkageHubTab {
  const v = Array.isArray(raw) ? raw[0] : raw
  const s = String(v ?? '').trim()
  if (!s || s === 'overview') return 'overview'
  if (s === 'automation' || s === 'script' || s === 'template') return s
  return 'scene'
}

/** linkageOrchestratorApiKind：函数，按签名入参返回处理结果。 */
export function linkageOrchestratorApiKind(
  tab: LinkageHubKind,
): 'scene' | 'automation' | 'script' | 'template-entity' {
  if (tab === 'template') return 'template-entity'
  return tab
}

const GRAPH_META_KEYS = new Set([
  'version',
  'name',
  'mode',
  'yamlDigest',
  'triggerLogic',
  'triggerAndTimeout',
  'condRootLogic',
])

/** 排除仅 meta / 空数组的 stub，避免误显示「图」徽章 */
function hasNonEmptyGraphPayload(g: unknown): boolean {
  if (!g) return false
  if (typeof g === 'string') return g.trim().length > 2
  if (typeof g !== 'object') return false
  const o = g as Record<string, unknown>
  if (Array.isArray(o.actions) && o.actions.length > 0) return true
  if (Array.isArray(o.entities) && o.entities.length > 0) return true
  if (Array.isArray(o.triggers) && o.triggers.length > 0) return true
  if (Array.isArray(o.flowNodes) && o.flowNodes.length > 1) return true
  for (const [k, v] of Object.entries(o)) {
    if (GRAPH_META_KEYS.has(k)) continue
    if (Array.isArray(v) && v.length > 0) return true
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0) return true
    if (typeof v === 'string' && v.trim()) return true
  }
  return false
}

/** 列表项是否已存图（自动化/脚本 geekGraph，场景 geekSceneGraph） */
export function itemHasGeekGraph(
  item: { geekGraph?: unknown; geekSceneGraph?: unknown } | null | undefined,
): boolean {
  return hasNonEmptyGraphPayload(item?.geekGraph) || hasNonEmptyGraphPayload(item?.geekSceneGraph)
}
