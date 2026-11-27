/**
 * 运维诊断面板的共享契约与组合逻辑：注入键、类型、摘要统计、性能指标、导出与运行时日志。
 *
 * 曾按 hooks 习惯拆成 8 个文件（含 1 行的常量与 17 行的注入键），
 * 但它们服务同一个面板、且互相引用同一套类型 —— 一个职责一个文件。
 */

import { inject, isRef, toRef, ref, computed, onMounted, onUnmounted, type Ref, watch, type ComputedRef } from 'vue'
import { formatFullDateTime, formatAuditTimestamp } from '@/kernel/format'
import {
  fetchConfigHealth,
  fetchSystemDiagnostics,
  fetchSystemHealth,
  clearRuntimeLogs,
  fetchRuntimeLogs,
  openRuntimeLogsStream,
  type RuntimeLogEntry,
  type RuntimeLogLevel,
  type RuntimeLogsResponse,
} from '@/kernel/http/index'
import { agentPing } from '@/domain/api/agent'
import { extractErrorMessage } from '@/kernel/core/error-message'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { useApiQuery } from '@/features/settings/use-api-query'
import { useSettingsHubRouteSection } from '@/features/settings/shared/hub'
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  PlugZap,
  Cpu,
  Radio,
  Layers,
  Timer,
  HardDrive,
  RefreshCw,
  HeartPulse,
  Archive,
} from '@lucide/vue'
import { SETTINGS_ROUTES } from '@/kernel/registry/settings-route'
import { getPageTraceId } from '@/kernel/telemetry/trace'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { useLayoutStore } from '@/domain/layout/store/layout.store'
import { fps, memoryMb, startFrontendPerfMonitor, stopFrontendPerfMonitor } from '@/kernel/perf/frontend-perf-monitor'
import { adaptiveTier } from '@/kernel/perf/adaptive-perf'
import { isFpsSchedulerRunning, isDiagnosticsFpsSamplingActive } from '@/kernel/perf/fps-scheduler'
import { getActiveSubscribeDomains } from '@/domain/entity/ws-subscription'
import { getMaxStateListeners } from '@/kernel/config/frontend-config'
import { copyTextWithNotify } from '@/kernel/ui/notify'
import {
  startPerfBaselineSampling,
  stopPerfBaselineSampling,
  isPerfBaselineSampling,
  getPerfBaselineSnapshot,
  exportPerfBaselineJson,
  tickPerfBaselineCounters,
  recordFpsSample,
} from '@/kernel/perf/baseline'
import { downloadBlob } from '@/kernel/core/misc'
import { schedulePoll } from '@/kernel/core/poll-scheduler'

/** 后端堆内存占 V8 上限超过此值时告警 */
export const BACKEND_MEM_WARN_PCT = 80

/** 设置诊断 API 负载共享类型定义 */

/** Home Assistant 连接信息 */
interface DiagnosticsHaInfo {
  /** HA 版本号 */
  version?: string
  /** 是否已连接 */
  connected?: boolean
  /** WebSocket 连接模式 */
  wsMode?: string
  /** 是否为 WS leader */
  wsLeader?: boolean
  /** 重连次数 */
  reconnectCount?: number
  /** 区域注册表是否可用 */
  registryAvailable?: boolean
}

/** 编排器同步状态 */
interface DiagnosticsOrchestratorSync {
  /** 错误数量 */
  errorCount?: number
  /** 近期错误列表 */
  recentErrors?: Array<{ scope?: string; message?: string }>
}

/** 漂移定时修复上次运行摘要 */
interface DiagnosticsDriftRepairLastRun {
  startedAt?: string | null
  finishedAt?: string | null
  repaired?: number
  failed?: number
  errorCount?: number
}

/** 数据保留策略配置 */
interface DiagnosticsRetention {
  /** 保留天数 */
  days?: number
  /** 是否跳过传感器时间线 */
  skipSensorTimeline?: boolean
}

/** 诊断信息完整数据结构 */
export interface DiagnosticsDiag {
  /** 复制文本内容 */
  copyText?: string
  /** 时间戳 */
  timestamp?: string | number | Date
  /** HA 连接信息 */
  ha?: DiagnosticsHaInfo
  /** 实体统计信息 */
  entities?: {
    count?: number
    estimatedEntityStoreMb?: number
    stale?: boolean
    syncedAt?: string | null
  }
  /** WebSocket 连接统计 */
  websocket?: { clients?: number }
  /** HA 同步管线阶段延迟（含前端上报） */
  haSyncLatency?: Array<{
    stage: string
    count: number
    p50: number
    p99: number
    max: number
  }>
  /** HA WS 延期队列过载丢弃总数 */
  haWsDeferredDroppedTotal?: number
  /** 数据保留配置 */
  retention?: DiagnosticsRetention
  /** 内存详情 */
  memoryDetail?: { estimatedEntityStoreMb?: number }
  /** 编排器同步状态 */
  orchestratorSync?: DiagnosticsOrchestratorSync
  /** 漂移定时修复上次运行 */
  driftRepairLastRun?: DiagnosticsDriftRepairLastRun | null
  /** 性能优化建议 */
  perfSuggestions?: string[]
  /** 其他扩展字段 */
  [key: string]: unknown
}

/** 系统健康状态 */
export interface DiagnosticsHealth {
  /** HA 连接信息 */
  ha?: DiagnosticsHaInfo
  /** CPU 使用率 */
  cpu?: number | string
  /** 内存使用率 */
  memory?: number | string
  /** 内存使用量（MB） */
  memoryMb?: number
  /** 内存限制（MB） */
  memoryLimitMb?: number
  /** 常驻内存（MB） */
  rssMb?: number
  /** 运行时长 */
  uptime?: string | number
  /** 其他扩展字段 */
  [key: string]: unknown
}

/** 配置健康度检查结果 */
export interface DiagnosticsConfigHealth {
  /** 占位符自动化数量 */
  placeholderAutomationCount?: number
  /** 占位符场景数量 */
  placeholderSceneCount?: number
  /** 是否跳过传感器时间线 */
  skipSensorTimeline?: boolean
  /** 健康度评分 */
  score?: number
  /** 绑定缺口数量 */
  bindingGapCount?: number
  /** 其他扩展字段 */
  [key: string]: unknown
}

/** 诊断面板的 provide/inject 契约键：由注入方（useDiagnosticsSection）持有。 */
export const DIAGNOSTICS_KEY = Symbol('diagnostics')

/** @param {string[]} keys */
export function useDiagnosticsSection(keys: string[]) {
  const ctx = inject(DIAGNOSTICS_KEY)
  if (!ctx) throw new Error('缺少诊断上下文')
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    const v = (ctx as Record<string, unknown>)[key]
    // panel 是普通对象：ref/computed 与函数须直接透传，否则 toRef 会包错层
    out[key] = isRef(v) || typeof v === 'function' ? v : toRef(ctx as Record<string, unknown>, key)
  }
  return out
}

function useDiagnosticsFetch() {
  const lastFetched = ref<string>('')
  const health = ref<DiagnosticsHealth | null>(null)
  const configHealth = ref<DiagnosticsConfigHealth | null>(null)
  const diag = ref<DiagnosticsDiag | null>(null)
  const agentStatus = ref<{ provider?: string; ready?: boolean } | null>(null)

  const chrome = useChromeStore()

  const query = useApiQuery(
    async () => {
      const partialErrors: string[] = []
      const [h, ch, d, ag] = await Promise.all([
        fetchSystemHealth().catch((e) => {
          partialErrors.push(extractErrorMessage(e))
          return { data: health.value }
        }),
        fetchConfigHealth().catch((e) => {
          partialErrors.push(extractErrorMessage(e))
          return { data: null }
        }),
        fetchSystemDiagnostics().catch((e) => {
          partialErrors.push(extractErrorMessage(e))
          return { data: diag.value }
        }),
        agentPing().catch(() => null),
      ])
      if (h?.data) health.value = h.data
      if (ch?.data != null) configHealth.value = ch.data
      if (d?.data) diag.value = d.data
      if (ag) agentStatus.value = ag
      lastFetched.value = formatFullDateTime(new Date())
      if (partialErrors.length && !health.value && !diag.value) {
        throw new Error(partialErrors[0] || '诊断数据加载失败')
      }
      if (partialErrors.length) {
        chrome.notify('诊断数据部分加载失败', 'warning')
      }
      return {
        data: { ok: true },
        meta: {
          degraded: partialErrors.length > 0,
          reason: partialErrors[0] || undefined,
        },
      }
    },
    { immediate: false },
  )

  async function fetchAll() {
    await query.execute()
  }

  /** 子 Tab（作业/运行日志）注册自己的刷新函数，页头刷新时优先调用 */
  const sectionRefreshHandler = ref<null | (() => void | Promise<void>)>(null)
  const sectionRefreshing = ref(false)

  function registerSectionRefresh(fn: null | (() => void | Promise<void>)) {
    sectionRefreshHandler.value = fn
  }

  async function refreshCurrentSection() {
    if (sectionRefreshHandler.value) {
      sectionRefreshing.value = true
      try {
        await sectionRefreshHandler.value()
      } finally {
        sectionRefreshing.value = false
      }
      return
    }
    await fetchAll()
  }

  const loading = computed(() => query.loading.value || sectionRefreshing.value)

  return {
    loadError: query.error,
    loading,
    degraded: query.degraded,
    lastFetched,
    health,
    configHealth,
    diag,
    agentStatus,
    fetchAll,
    refreshCurrentSection,
    registerSectionRefresh,
    retry: query.retry,
  }
}

function useDiagnosticsData() {
  const fetch = useDiagnosticsFetch()
  const summary = useDiagnosticsSummary(fetch)
  const exportApi = useDiagnosticsExport({
    diag: fetch.diag,
    health: fetch.health,
    lastFetched: fetch.lastFetched,
    haOk: summary.haOk,
    entityCount: summary.entityCount,
    wsClients: summary.wsClients,
    cpuPct: summary.cpuPct,
    memPct: summary.memPct,
    memLabel: summary.memLabel,
    pageTraceId: summary.pageTraceId,
    retentionDays: summary.retentionDays,
  })

  return {
    ...fetch,
    ...summary,
    ...exportApi,
  }
}

export function useDiagnosticsPanel() {
  const section = ref('overview')
  const overviewTab = ref('summary')

  const data = useDiagnosticsData()
  const perf = useDiagnosticsPerf()

  const subnavSections = computed(() => [
    { id: 'overview', label: '系统概览', emoji: '📊', accent: 'var(--hos-color-accent-strong)' },
    { id: 'runtime', label: '运行日志', emoji: '🖥️', accent: 'var(--hos-color-accent)' },
    { id: 'jobs', label: '调度作业', emoji: '⏱️', accent: 'var(--hos-color-accent)' },
    { id: 'log', label: '诊断导出', emoji: '📄', accent: 'var(--hos-color-accent)' },
  ])

  useSettingsHubRouteSection(section, subnavSections, { tabId: 'diagnostics' })

  const overviewTabs = computed(() => [
    {
      id: 'summary',
      label: '健康总览',
      emoji: '💚',
      accent:
        data.overallStatus.value.tone === 'bad'
          ? 'var(--hos-color-danger-text, #f87171)'
          : data.overallStatus.value.tone === 'warn'
            ? 'var(--hos-color-warning-text, #fbbf24)'
            : 'var(--hos-color-accent-strong)',
    },
    {
      id: 'connect',
      label: '连接同步',
      emoji: '🔌',
      accent: data.haOk.value ? 'var(--hos-color-accent-strong)' : 'var(--hos-color-danger-text, #f87171)',
    },
    {
      id: 'runtime',
      label: '后端进程',
      emoji: '🗄️',
      accent: 'var(--hos-color-accent)',
      count: data.cpuPct.value >= 85 || data.memPct.value >= BACKEND_MEM_WARN_PCT ? '!' : undefined,
      countClass: 'settings-orch-count--alert',
    },
    {
      id: 'perf',
      label: '前端性能',
      emoji: '⚡',
      accent: 'var(--hos-color-accent)',
    },
  ])

  onMounted(() => {
    perf.startPerfMonitoring()
    data.fetchAll()
  })

  onUnmounted(() => {
    perf.stopPerfMonitoring()
  })

  return {
    section,
    overviewTab,
    subnavSections,
    overviewTabs,
    ...data,
    ...perf,
  }
}

export function useDiagnosticsSummary(deps: {
  loadError: Ref<string | null>
  loading: Ref<boolean>
  health: Ref<DiagnosticsHealth | null>
  configHealth: Ref<DiagnosticsConfigHealth | null>
  diag: Ref<DiagnosticsDiag | null>
  agentStatus?: Ref<{ provider?: string; ready?: boolean } | null>
}) {
  const { loadError, loading, health, configHealth, diag, agentStatus } = deps

  const agentReadyHint = computed(() => {
    const st = agentStatus?.value
    if (!st) return null
    const provider = String(st.provider || '').toLowerCase()
    if (provider === 'mock' || st.ready === false) {
      return {
        tone: 'amber' as const,
        text: '智能管家未就绪（演示/Mock 模式）：对话已禁用，请在设置中配置 API Key。',
        linkTo: SETTINGS_ROUTES.agent(),
        linkLabel: '智能管家',
      }
    }
    return null
  })

  const haOk = computed(() => Boolean(diag.value?.ha?.connected))
  const haWsModeLabel = computed(() => {
    const mode = diag.value?.ha?.wsMode || 'standalone'
    if (mode === 'leader') return 'Leader（本实例连 HA WS）'
    if (mode === 'follower') return 'Follower（REST 代理）'
    return 'Standalone（单实例）'
  })
  const haWsModeClass = computed(() => {
    const mode = diag.value?.ha?.wsMode || 'standalone'
    if (mode === 'leader') return 'text-emerald-400'
    if (mode === 'follower') return 'text-amber-400'
    return 'text-gray-400'
  })
  const entityCount = computed(() => diag.value?.entities?.count ?? '—')
  const wsClients = computed(() => diag.value?.websocket?.clients ?? 0)
  const retentionDays = computed(() => diag.value?.retention?.days ?? '—')
  const pageTraceId = computed(() => getPageTraceId())
  const pageTraceIdShort = computed(() => {
    const id = pageTraceId.value
    if (!id) return '—'
    if (id.length <= 16) return id
    return `${id.slice(0, 8)}…${id.slice(-8)}`
  })
  const cpuPct = computed(() => Number(health.value?.cpu) || 0)
  const memPct = computed(() => Number(health.value?.memory) || 0)
  const memLabel = computed(() => {
    const h = health.value
    if (h?.memoryMb != null && h?.memoryLimitMb != null) {
      return `${h.memoryMb} / ${h.memoryLimitMb} MB`
    }
    if (h?.rssMb != null) return `RSS ${h.rssMb} MB`
    return '—'
  })

  const memoryDetail = computed(() => diag.value?.memoryDetail ?? null)

  const summaryKpis = computed(() => [
    {
      key: 'entities',
      label: '实体数',
      value: entityCount.value,
      icon: Layers,
      accent: 'var(--hos-color-accent-strong)',
    },
    { key: 'ws', label: 'WS 客户端', value: wsClients.value, icon: Radio, accent: 'var(--hos-color-accent)' },
    {
      key: 'uptime',
      label: '运行时间',
      value: health.value?.uptime ?? '—',
      icon: Timer,
      accent: 'var(--hos-color-accent)',
      small: true,
    },
    {
      key: 'retention',
      label: '历史保留',
      value: retentionDays.value,
      suffix: retentionDays.value !== '—' ? '天' : '',
      icon: HardDrive,
      accent: 'var(--hos-color-accent)',
    },
  ])

  const runtimeKpis = computed(() => [
    {
      key: 'entities',
      label: '实体数',
      value: entityCount.value,
      icon: Layers,
      accent: 'var(--hos-color-accent-strong)',
    },
    {
      key: 'uptime',
      label: '运行时间',
      value: health.value?.uptime ?? '—',
      icon: Timer,
      accent: 'var(--hos-color-accent)',
      small: true,
    },
    {
      key: 'retention',
      label: '历史保留',
      value: retentionDays.value,
      suffix: retentionDays.value !== '—' ? '天' : '',
      icon: HardDrive,
      accent: 'var(--hos-color-accent)',
    },
    {
      key: 'version',
      label: '后端版本',
      value: health.value?.version ?? '—',
      icon: Cpu,
      accent: 'var(--hos-color-accent)',
      small: true,
    },
  ])

  const runtimeMemoryLabel = computed(() => {
    const h = health.value
    if (h?.memoryMb != null && h?.memoryLimitMb != null) {
      return `堆 ${h.memoryMb} / ${h.memoryLimitMb} MB · RSS ${h.rssMb ?? '—'} MB`
    }
    return '— / —'
  })

  const connectServiceCards = computed(() => {
    const drift = diag.value?.driftRepairLastRun
    let driftTone = 'neutral'
    let driftPrimary = '尚无记录'
    let driftSecondary = '定时从 HA 拉回漂移配置'
    if (drift?.finishedAt) {
      const failed = Number(drift.failed) || 0
      driftTone = failed > 0 ? 'bad' : 'ok'
      driftPrimary = `修复 ${Number(drift.repaired) || 0}`
      try {
        const t = new Date(drift.finishedAt)
        driftSecondary = `${formatAuditTimestamp(t)}${failed ? ` · 失败 ${failed}` : ''}`
      } catch {
        driftSecondary = drift.finishedAt
      }
    }

    return [
      {
        id: 'ha',
        label: 'Home Assistant',
        icon: PlugZap,
        tone: !haOk.value ? 'bad' : diag.value?.entities?.stale ? 'warn' : 'ok',
        primary: !haOk.value ? '离线' : diag.value?.entities?.stale ? '已连接 · 缓存陈旧' : '在线',
        secondary: diag.value?.ha?.version || haWsModeLabel.value,
      },
      {
        id: 'ws',
        label: 'WebSocket',
        icon: Radio,
        tone: wsClients.value > 0 ? 'ok' : 'neutral',
        primary: `${wsClients.value} 客户端`,
        secondary: '实体状态实时推送',
      },
      {
        id: 'drift-repair',
        label: '漂移修复',
        icon: RefreshCw,
        tone: driftTone,
        primary: driftPrimary,
        secondary: driftSecondary,
        linkTo: SETTINGS_ROUTES.params('haConnector'),
      },
    ]
  })

  const pipelineNodes = computed(() => {
    return [
      {
        id: 'ha',
        icon: PlugZap,
        label: 'Home Assistant',
        meta: haOk.value ? `${diag.value?.ha?.version || '已连接'} · ${haWsModeLabel.value}` : '未连接',
        tone: haOk.value ? 'ok' : 'bad',
      },
      {
        id: 'ws',
        icon: Radio,
        label: 'WebSocket',
        meta: `${wsClients.value} ${'客户端'}`,
        tone: wsClients.value > 0 ? 'ok' : 'neutral',
      },
    ]
  })

  const overallStatus = computed(() => {
    if (loadError.value) {
      return {
        tone: 'bad',
        label: '后端不可达',
        detail: loadError.value,
        icon: ShieldAlert,
      }
    }
    if (loading.value && !diag.value && !health.value) {
      return {
        tone: 'neutral',
        label: '加载中…',
        detail: '正在拉取健康与诊断数据',
        icon: Activity,
      }
    }
    if (!diag.value && !health.value) {
      return {
        tone: 'neutral',
        label: '暂无数据',
        detail: '请点击刷新或检查后端服务',
        icon: Activity,
      }
    }
    if (!haOk.value) {
      return {
        tone: 'bad',
        label: '需要关注',
        detail: 'Home Assistant 未连接，自动化与实体同步不可用',
        icon: ShieldAlert,
      }
    }
    const attention = Boolean(diag.value?.entities?.stale) || cpuPct.value >= 85 || memPct.value >= BACKEND_MEM_WARN_PCT
    if (attention) {
      return {
        tone: 'warn',
        label: '基本正常',
        detail: '核心服务在线，下方提示列有可优化项',
        icon: AlertTriangle,
      }
    }
    return {
      tone: 'ok',
      label: '运行良好',
      detail: 'HA、WebSocket 与后端进程状态正常',
      icon: CheckCircle2,
    }
  })

  const issueHints = computed(() => {
    const hints = []
    if (loadError.value) {
      hints.push({ tone: 'amber', text: loadError.value })
    }
    if (!haOk.value) {
      hints.push({
        tone: 'amber',
        text: 'HA 未连接：请检查 ',
        linkTo: SETTINGS_ROUTES.connection(),
        linkLabel: 'HA 连接',
        suffix: ' 中的地址与 Token，并确认本机网络可访问 HA。',
      })
    }
    if (diag.value?.ha?.registryAvailable === false) {
      hints.push({
        tone: 'amber',
        text: 'HA 区域注册表不可用，房间/环境数据可能不完整：请前往 ',
        linkTo: SETTINGS_ROUTES.rooms('catalog'),
        linkLabel: '房间配置',
        suffix: ' 重试同步区域。',
      })
    }
    if (diag.value?.entities?.stale) {
      const synced = diag.value?.entities?.syncedAt
      hints.push({
        tone: 'amber',
        text: synced
          ? `实体缓存可能陈旧（上次同步 ${synced}），请确认 HA 连接与状态推送。`
          : '实体缓存可能陈旧，请确认 HA 连接与状态推送。',
        linkTo: SETTINGS_ROUTES.connection(),
        linkLabel: 'HA 连接',
      })
    }
    const retentionDaysNum = Number(diag.value?.retention?.days)
    if (Number.isFinite(retentionDaysNum) && retentionDaysNum > 0) {
      hints.push({
        tone: 'sky',
        text: `历史数据保留 ${retentionDaysNum} 天。设备历史、环境趋势若选择更长窗口，图表只覆盖保留期内的数据。`,
        linkTo: SETTINGS_ROUTES.retention(),
        linkLabel: '数据保留',
      })
    }
    const drift = diag.value?.driftRepairLastRun
    if (drift && (Number(drift.failed) || 0) > 0) {
      hints.push({
        tone: 'amber',
        text: `漂移定时修复上次失败 ${drift.failed} 项（修复 ${Number(drift.repaired) || 0}）。`,
        linkTo: SETTINGS_ROUTES.params('haConnector'),
        linkLabel: 'HA连接运维',
      })
    }
    if ((diag.value?.ha?.reconnectCount ?? 0) > 5) {
      hints.push({
        tone: 'amber',
        text: 'HA 累计断连 {n} 次。若频繁出现请检查 HA 稳定性与网络。'.replace(
          '{n}',
          String(diag.value?.ha?.reconnectCount ?? 0),
        ),
      })
    }
    if (memPct.value >= BACKEND_MEM_WARN_PCT) {
      const est = memoryDetail.value?.estimatedEntityStoreMb
      hints.push({
        tone: 'amber',
        text:
          est != null
            ? `后端堆内存 ${memPct.value}%（${memLabel.value}），实体 L1 缓存估算 ~${est} MB；可重启 backend 或调低 maxRecentChanges。`
            : `后端堆内存 ${memPct.value}%（${memLabel.value}），若持续偏高可重启 backend 进程。`,
      })
    }
    for (const tip of diag.value?.perfSuggestions || []) {
      hints.push({ tone: 'sky', text: tip })
    }
    const ch = configHealth.value
    if (ch && typeof ch.score === 'number' && ch.score < 70) {
      const sceneN = Number(ch.placeholderSceneCount) || 0
      const scenePart = sceneN > 0 ? `、占位场景 ${sceneN} 条` : ''
      hints.push({
        tone: 'amber',
        text: `配置健康分 ${ch.score}/100：绑定缺口 ${ch.bindingGapCount ?? 0} 项、占位自动化 ${ch.placeholderAutomationCount ?? 0} 条${scenePart}。`,
        linkTo: SETTINGS_ROUTES.bindings(),
        linkLabel: '绑定配置',
      })
    }
    if ((ch?.placeholderAutomationCount ?? 0) > 0) {
      hints.push({
        tone: 'sky',
        text: `有 ${ch?.placeholderAutomationCount ?? 0} 条自动化仍含占位实体，请改用 HA 自动化完成实体替换。`,
      })
    }
    if (agentReadyHint.value) {
      hints.push(agentReadyHint.value)
    }
    return hints
  })

  const configHealthScore = computed(() => {
    const s = configHealth.value?.score
    return typeof s === 'number' ? s : null
  })

  const configHealthTone = computed(() => {
    const s = configHealthScore.value
    if (s == null) return 'neutral'
    if (s >= 85) return 'ok'
    if (s >= 70) return 'warn'
    return 'bad'
  })

  const configHealthGaps = computed(() => {
    const gaps = configHealth.value?.gaps
    return Array.isArray(gaps) ? gaps : []
  })

  return {
    haOk,
    haWsModeLabel,
    haWsModeClass,
    entityCount,
    wsClients,
    retentionDays,
    pageTraceId,
    pageTraceIdShort,
    cpuPct,
    memPct,
    memLabel,
    memoryDetail,
    summaryKpis,
    runtimeKpis,
    runtimeMemoryLabel,
    connectServiceCards,
    pipelineNodes,
    overallStatus,
    issueHints,
    configHealthScore,
    configHealthTone,
    configHealthGaps,
    configHealth,
  }
}

const PERF_MODE_LABELS: Record<string, string> = {
  high: '华丽',
  medium: '均衡',
  low: '省电',
  auto: '自适应',
}

function perfModeLabel(mode: string): string {
  return PERF_MODE_LABELS[mode] || mode
}

export function useDiagnosticsPerf() {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const entitiesStore = useEntitiesStore()

  const frontendFps = computed(() => fps.value || '—')
  const baselineSampling = ref(isPerfBaselineSampling())
  const baselineSnapshot = ref(isPerfBaselineSampling() ? getPerfBaselineSnapshot() : null)
  /** 采样中定时刷新，驱动预览响应式更新 */
  const baselineTick = ref(0)
  let baselinePreviewTimer: ReturnType<typeof setInterval> | null = null

  const canCopyBaseline = computed(() => baselineSampling.value || Boolean(baselineSnapshot.value?.recordedAt))

  const baselinePreview = computed(() => {
    void baselineTick.value
    return baselineSampling.value ? getPerfBaselineSnapshot() : baselineSnapshot.value
  })

  function stopBaselinePreviewTimer() {
    if (baselinePreviewTimer) {
      clearInterval(baselinePreviewTimer)
      baselinePreviewTimer = null
    }
  }

  function startBaselinePreviewTimer() {
    stopBaselinePreviewTimer()
    baselinePreviewTimer = setInterval(() => {
      baselineTick.value += 1
    }, 500)
  }

  function toggleBaselineSampling() {
    if (baselineSampling.value) {
      stopBaselinePreviewTimer()
      baselineSnapshot.value = stopPerfBaselineSampling()
      baselineSampling.value = false
      chrome.notify('基线采样已停止，可复制 JSON 保存结果', 'success')
    } else {
      baselineSnapshot.value = startPerfBaselineSampling()
      baselineSampling.value = true
      startBaselinePreviewTimer()
      chrome.notify('基线采样已开始，请保持页面运行约 30 秒', 'info')
    }
  }

  async function copyBaselineJson() {
    if (!canCopyBaseline.value) {
      chrome.notify('请先开始基线采样', 'warning')
      return
    }
    if (baselineSampling.value) {
      baselineSnapshot.value = getPerfBaselineSnapshot()
    }
    await copyTextWithNotify(exportPerfBaselineJson(), {
      successMessage: '基线 JSON 已成功复制',
      errorMessage: '复制失败，请检查浏览器剪贴板权限',
    })
  }

  const frontendMemoryLabel = computed(() => (memoryMb.value != null ? `${memoryMb.value} MB` : '不可用'))

  /** 依赖 perfStats / fps，避免静态快照不刷新 */
  const listenerStatsLabel = computed(() => {
    void entitiesStore.perfStats
    void fps.value
    const s = entitiesStore.getStateListenerStats()
    const limit = getMaxStateListeners()
    return `${s.total}/${limit}（全局 ${s.global} · 索引 ${s.indexed} · 桶 ${s.indexBuckets}）`
  })

  const subscribeDomainsLabel = computed(() => {
    void entitiesStore.perfStats
    const domains = getActiveSubscribeDomains()
    if (!domains?.length) return '全部 domain'
    return domains.length > 8 ? `${domains.slice(0, 8).join(', ')}…+${domains.length - 8}` : domains.join(', ')
  })

  const fpsSchedulerLabel = computed(() => {
    void fps.value
    void baselineTick.value
    const parts = []
    if (isFpsSchedulerRunning()) parts.push('rAF 运行')
    if (isDiagnosticsFpsSamplingActive()) parts.push('诊断采样')
    return parts.length ? parts.join(' · ') : '未启动'
  })

  const perfHeroMetrics = computed(() => {
    const fpsNum = Number(fps.value)
    let fpsAccent = 'var(--hos-color-accent)'
    if (Number.isFinite(fpsNum)) {
      if (fpsNum >= 55) fpsAccent = 'var(--hos-color-accent-strong)'
      else if (fpsNum >= 45) fpsAccent = 'var(--hos-color-warning-text, #fbbf24)'
      else fpsAccent = 'var(--hos-color-danger-text, #f87171)'
    }
    const userMode = layoutStore.layoutConfig.performanceMode || 'high'
    const adaptive = adaptiveTier.value !== 'high' ? `自适应 ${perfModeLabel(adaptiveTier.value)}` : null
    return [
      { label: 'FPS', value: frontendFps.value, accent: fpsAccent },
      { label: 'JS 堆内存', value: frontendMemoryLabel.value, accent: 'var(--hos-color-accent)' },
      {
        label: '性能档位',
        value: perfModeLabel(userMode),
        sub: adaptive,
        accent: 'var(--hos-color-accent)',
      },
    ]
  })

  let stopFpsWatch: (() => void) | null = null
  let stopPerfStatsWatch: (() => void) | null = null

  function startPerfMonitoring() {
    startFrontendPerfMonitor()
    stopFpsWatch = watch(fps, (v) => {
      if (v) recordFpsSample(v)
    })
    stopPerfStatsWatch = watch(
      () => entitiesStore.perfStats,
      (s) => tickPerfBaselineCounters(s),
      { deep: true },
    )
    if (baselineSampling.value) startBaselinePreviewTimer()
  }

  function stopPerfMonitoring() {
    stopFrontendPerfMonitor()
    stopFpsWatch?.()
    stopPerfStatsWatch?.()
    stopFpsWatch = null
    stopPerfStatsWatch = null
    stopBaselinePreviewTimer()
    if (baselineSampling.value) {
      stopPerfBaselineSampling()
      baselineSampling.value = false
    }
  }

  onUnmounted(() => {
    stopBaselinePreviewTimer()
  })

  return {
    frontendFps,
    baselineSampling,
    baselineSnapshot,
    canCopyBaseline,
    baselinePreview,
    toggleBaselineSampling,
    copyBaselineJson,
    frontendMemoryLabel,
    listenerStatsLabel,
    subscribeDomainsLabel,
    fpsSchedulerLabel,
    perfHeroMetrics,
    startPerfMonitoring,
    stopPerfMonitoring,
  }
}

export function useDiagnosticsExport(deps: {
  diag: Ref<DiagnosticsDiag | null>
  health: Ref<DiagnosticsHealth | null>
  lastFetched: Ref<string>
  haOk: ComputedRef<boolean>
  entityCount: ComputedRef<unknown>
  wsClients: ComputedRef<unknown>
  cpuPct: ComputedRef<number>
  memPct: ComputedRef<number>
  memLabel: ComputedRef<string>
  pageTraceId: ComputedRef<string>
  retentionDays: ComputedRef<unknown>
}) {
  const {
    diag,
    health,
    lastFetched,
    haOk,
    entityCount,
    wsClients,
    cpuPct,
    memPct,
    memLabel,
    pageTraceId,
    retentionDays,
  } = deps

  const chrome = useChromeStore()

  async function copyDiag() {
    await copyTextWithNotify(diag.value?.copyText ?? '', {
      successMessage: '诊断文本已成功复制',
      errorMessage: '复制失败，请手动选择文本',
      emptyMessage: '暂无可复制的诊断内容',
    })
  }

  function downloadDiagTxt() {
    const text = diag.value?.copyText
    if (!text) {
      chrome.notify('暂无诊断文本可下载', 'warning')
      return
    }
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      downloadBlob(blob, `homeos-diag-${stamp}.txt`)
      chrome.notify('诊断 TXT 已开始下载', 'success')
    } catch {
      chrome.notify('下载失败，请改用复制', 'error')
    }
  }

  const diagExportTimestamp = computed(() => {
    if (diag.value?.timestamp) {
      try {
        return formatFullDateTime(diag.value.timestamp)
      } catch {
        /* 落入下一分支 */
      }
    }
    return lastFetched.value || '—'
  })

  const diagExportLineCount = computed(
    () => (diag.value?.copyText || '').split('\n').filter((line) => line.trim()).length,
  )

  const diagExportFields = computed(() => {
    const h = health.value
    const d = diag.value
    if (!d?.copyText && !h) return []
    return [
      {
        key: 'ha',
        label: 'HA 状态',
        value: haOk.value ? `已连接${d?.ha?.version ? ` · ${d.ha.version}` : ''}` : '未连接',
        tone: haOk.value ? 'ok' : 'bad',
      },
      { key: 'entities', label: '实体数', value: entityCount.value },
      { key: 'ws', label: 'WS 客户端', value: wsClients.value },
      {
        key: 'cpu',
        label: 'CPU',
        value: h?.cpu != null ? `${h.cpu}%` : '—',
        tone: cpuPct.value >= 85 ? 'warn' : null,
      },
      {
        key: 'mem',
        label: '内存',
        value: h?.memory != null ? `${h.memory}% · ${memLabel.value}` : '—',
        tone: memPct.value >= BACKEND_MEM_WARN_PCT ? 'warn' : null,
      },
      { key: 'uptime', label: '运行时间', value: h?.uptime ?? '—' },
      { key: 'db', label: '数据库', value: h?.dbSize ?? '—', mono: true },
      {
        key: 'retention',
        label: '历史保留',
        value: retentionDays.value !== '—' ? `${retentionDays.value} 天` : '—',
      },
      { key: 'trace', label: '当前 Trace', value: pageTraceId.value || '—', mono: true },
    ]
  })

  const diagExportSyncErrors = computed(() => diag.value?.orchestratorSync?.recentErrors?.slice(0, 5) ?? [])

  const diagExportGuides = [
    {
      id: 'health',
      icon: HeartPulse,
      accent: 'var(--hos-color-accent-strong)',
      title: '健康轮询',
      desc: '外部探针可轮询健康接口，响应含缓存状态与基础资源占用。',
      codes: ['GET /health', 'GET /api/v1/system/health'],
    },
    {
      id: 'backup',
      icon: Archive,
      accent: 'var(--hos-color-accent)',
      title: '全量备份（含数据库）',
      desc: '一键导出整库（全部数据表、账号与授权）与数据目录（含 HA 密钥、素材、3D 场景）。',
      linkTo: SETTINGS_ROUTES.profiles('backup'),
      linkLabel: '前往备份与恢复',
    },
  ]

  return {
    copyDiag,
    downloadDiagTxt,
    diagExportTimestamp,
    diagExportLineCount,
    diagExportFields,
    diagExportSyncErrors,
    diagExportGuides,
  }
}

const POLL_MS = 4000
const MAX_CLIENT_LINES = 1500
// SSE 可能逐行高频推送：攒 50ms 批量落地，降低大列表重渲染次数（视觉上仍即时）
const APPEND_FLUSH_MS = 50

const LEVEL_OPTIONS: Array<{ id: string; label: string; levels?: RuntimeLogLevel[] }> = [
  { id: 'all', label: '全部' },
  { id: 'error', label: '错误', levels: ['error'] },
  { id: 'warn', label: '警告+', levels: ['error', 'warn'] },
  { id: 'log', label: '日志+', levels: ['error', 'warn', 'log'] },
]

type RuntimeLogLiveMode = 'sse' | 'poll' | 'off'

export function useRuntimeLogs(active: () => boolean) {
  const chrome = useChromeStore()
  const items = ref<RuntimeLogEntry[]>([])
  const loading = ref(false)
  const loadError = ref('')
  const live = ref(true)
  const liveMode = ref<RuntimeLogLiveMode>('off')
  const levelFilter = ref('all')
  const query = ref('')
  const capacity = ref(0)
  const buffered = ref(0)
  const dropped = ref(0)
  const newestId = ref(0)
  let pollCancel: (() => void) | null = null
  let stream: EventSource | null = null
  let inFlight = false
  let streamFailCount = 0
  // 增量日志的内存缓冲：pending 待落地行、seen 去重集合、retry SSE 重连 timer、disposed 卸载标记
  let pendingRows: RuntimeLogEntry[] = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let seenIds = new Set<number>()
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const levelParam = computed(() => {
    const opt = LEVEL_OPTIONS.find((o) => o.id === levelFilter.value)
    return opt?.levels?.join(',')
  })

  function applyMeta(meta: Partial<RuntimeLogsResponse>) {
    if (typeof meta.capacity === 'number') capacity.value = meta.capacity
    if (typeof meta.buffered === 'number') buffered.value = meta.buffered
    if (typeof meta.dropped === 'number') dropped.value = meta.dropped
    if (typeof meta.newestId === 'number' && meta.newestId > newestId.value) {
      newestId.value = meta.newestId
    }
  }

  function clearRetryTimer() {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  function flushPending() {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    if (!pendingRows.length) return
    const rows = pendingRows
    pendingRows = []
    let next = items.value.concat(rows)
    if (next.length > MAX_CLIENT_LINES) {
      next = next.slice(-MAX_CLIENT_LINES)
      // 被裁掉的行不再阻止后续同 id 行落地：按裁剪后的窗口重建去重集合
      seenIds = new Set(next.map((e) => e.id))
    }
    items.value = next
    const last = next[next.length - 1]
    if (last?.id) newestId.value = Math.max(newestId.value, last.id)
  }

  function scheduleFlush() {
    if (disposed || flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      flushPending()
    }, APPEND_FLUSH_MS)
  }

  function resetItems() {
    pendingRows = []
    seenIds = new Set<number>()
    items.value = []
  }

  function mergeItems(incoming: RuntimeLogEntry[], mode: 'replace' | 'append') {
    if (mode === 'replace') {
      // 快照替换：丢弃尚未落地的增量，保持「以服务端快照为准」的语义
      pendingRows = []
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      seenIds = new Set(incoming.map((e) => e.id))
      items.value = incoming
    } else if (incoming.length) {
      let appended = false
      for (const row of incoming) {
        if (!row?.id || seenIds.has(row.id)) continue
        seenIds.add(row.id)
        pendingRows.push(row)
        appended = true
        // 立即推进 newestId，避免 50ms 窗口内 afterId 重复拉取同批日志
        if (row.id > newestId.value) newestId.value = row.id
      }
      if (appended) scheduleFlush()
    }
    const last = items.value[items.value.length - 1]
    if (last?.id) newestId.value = Math.max(newestId.value, last.id)
  }

  async function fetchLogs(opts?: { incremental?: boolean }) {
    if (inFlight) return
    inFlight = true
    const incremental = Boolean(opts?.incremental && newestId.value > 0)
    if (!incremental) loading.value = true
    try {
      const { data } = await fetchRuntimeLogs({
        limit: incremental ? 200 : 400,
        level: levelParam.value,
        q: query.value.trim() || undefined,
        afterId: incremental ? newestId.value : undefined,
      })
      applyMeta(data)
      mergeItems(data.items || [], incremental ? 'append' : 'replace')
      loadError.value = ''
    } catch (e) {
      loadError.value = extractErrorMessage(e)
      if (!incremental) resetItems()
    } finally {
      loading.value = false
      inFlight = false
    }
  }

  function stopPoll() {
    if (pollCancel) {
      pollCancel()
      pollCancel = null
    }
  }

  function stopStream() {
    if (stream) {
      stream.close()
      stream = null
    }
  }

  function stopLive() {
    stopPoll()
    stopStream()
    clearRetryTimer()
    liveMode.value = 'off'
  }

  function startPoll() {
    stopPoll()
    clearRetryTimer()
    if (!live.value || !active()) return
    liveMode.value = 'poll'
    // 经全局调度器轮询：页面隐藏时自动暂停，恢复可见时立即刷新
    pollCancel = schedulePoll(
      'runtime-logs:poll',
      () => {
        if (!live.value || !active()) return
        void fetchLogs({ incremental: true })
      },
      POLL_MS,
    )
  }

  function startStream() {
    stopStream()
    if (!live.value || !active()) return
    if (typeof EventSource === 'undefined') {
      startPoll()
      return
    }

    stream = openRuntimeLogsStream({
      level: levelParam.value,
      q: query.value.trim() || undefined,
      afterId: newestId.value > 0 ? newestId.value : undefined,
    })
    liveMode.value = 'sse'

    // 三个 handler 都挂在**本次** EventSource 上：stopStream() 会 stream.close()，
    // 监听随连接对象一起回收，无需逐个摘除（也不会跨连接累积）。
    stream.addEventListener('log', (ev) => {
      try {
        const row = JSON.parse((ev as MessageEvent).data) as RuntimeLogEntry
        if (!row?.id) return
        mergeItems([row], 'append')
        streamFailCount = 0
      } catch {
        // 忽略格式异常的 SSE 日志行
      }
    })

    stream.addEventListener('meta', (ev) => {
      try {
        applyMeta(JSON.parse((ev as MessageEvent).data) as RuntimeLogsResponse)
      } catch {
        // 忽略 meta/ping 解析失败
      }
    })

    stream.addEventListener('ping', (ev) => {
      try {
        applyMeta(JSON.parse((ev as MessageEvent).data) as RuntimeLogsResponse)
        streamFailCount = 0
      } catch {
        // 忽略 meta/ping 解析失败
      }
    })

    stream.onerror = () => {
      streamFailCount += 1
      stopStream()
      // 连续失败时降级轮询，避免 EventSource 自动重连风暴
      if (live.value && active()) {
        if (streamFailCount >= 2) {
          startPoll()
        } else {
          // 短暂后重试 SSE：登记 timer，stopLive/卸载时取消，避免卸载后重连
          clearRetryTimer()
          retryTimer = setTimeout(() => {
            retryTimer = null
            if (!disposed && live.value && active() && !stream && liveMode.value !== 'poll') {
              startStream()
            }
          }, 1500)
        }
      }
    }
  }

  function startLive() {
    stopLive()
    if (!live.value || !active()) return
    streamFailCount = 0
    startStream()
  }

  async function refresh() {
    newestId.value = 0
    const wantLive = live.value && active()
    stopLive()
    await fetchLogs({ incremental: false })
    if (wantLive && live.value && active()) startLive()
  }

  async function clearLogs() {
    const ok = await chrome.confirm('确定清空当前进程内的运行日志缓冲？', '清空运行日志')
    if (!ok) return
    try {
      await clearRuntimeLogs()
      resetItems()
      newestId.value = 0
      buffered.value = 0
      chrome.notify('运行日志已清空', 'success')
    } catch (e) {
      chrome.notify(extractErrorMessage(e), 'error')
    }
  }

  watch(
    () => [active(), live.value] as const,
    ([isActive, isLive]) => {
      if (!isActive) {
        stopLive()
        return
      }
      void (async () => {
        newestId.value = 0
        stopLive()
        await fetchLogs({ incremental: false })
        if (isLive && live.value && active()) startLive()
      })()
    },
    { immediate: true },
  )

  let queryTimer: ReturnType<typeof setTimeout> | null = null

  watch(levelFilter, () => {
    if (!active()) return
    void refresh()
  })

  watch(query, () => {
    if (!active()) return
    if (queryTimer) clearTimeout(queryTimer)
    queryTimer = setTimeout(() => {
      void refresh()
    }, 320)
  })

  onUnmounted(() => {
    disposed = true
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    pendingRows = []
    clearRetryTimer()
    stopLive()
    if (queryTimer) clearTimeout(queryTimer)
  })

  return {
    items,
    loading,
    loadError,
    live,
    liveMode,
    levelFilter,
    query,
    capacity,
    buffered,
    dropped,
    levelOptions: LEVEL_OPTIONS,
    refresh,
    clearLogs,
  }
}
