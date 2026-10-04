/**
 * 文件：internals.ts
 * 职责：诊断面板 internals。聚合常量、数据拉取（configHealth / systemDiagnostics / systemHealth / agentPing / license）、
 *       数据聚合与面板入口（useDiagnosticsPanel）。较大的 Summary / Export / Perf 为同目录独立文件。
 * 关键依赖：
 *   - vue 的 ref / computed / onMounted / onUnmounted
 *   - fetchConfigHealth / fetchSystemDiagnostics / fetchSystemHealth / agentPing：诊断 API
 *   - getLicenseStatus：许可证状态
 *   - useApiQuery：API 查询
 *   - useSettingsHubRouteSection：子导航路由同步
 *   - useDiagnosticsSummary / useDiagnosticsExport / useDiagnosticsPerf：聚合子模块
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { formatFullDateTime } from '@/utils/format/locale-format.util'
import { fetchConfigHealth, fetchSystemDiagnostics, fetchSystemHealth } from '@/services/api/system'
import { agentPing } from '@/services/api/agent'
import { getLicenseStatus, type LicenseStatus } from '@/services/api/license'
import { extractErrorMessage } from '@/utils/core/error-message'
import { useChromeStore } from '@/stores/chrome.store'
import { useApiQuery } from '@/composables/api/useApiQuery'
import { useSettingsHubRouteSection } from '@/composables/settings/hub-ui.internals'
import { BACKEND_MEM_WARN_PCT } from './constants'
import { useDiagnosticsSummary } from './useDiagnosticsSummary'
import { useDiagnosticsExport } from './useDiagnosticsExport'
import { useDiagnosticsPerf } from './useDiagnosticsPerf'
import type { DiagnosticsConfigHealth, DiagnosticsDiag, DiagnosticsHealth } from './types'

function useDiagnosticsFetch() {
  const lastFetched = ref<string>('')
  const health = ref<DiagnosticsHealth | null>(null)
  const configHealth = ref<DiagnosticsConfigHealth | null>(null)
  const diag = ref<DiagnosticsDiag | null>(null)
  const agentStatus = ref<{ provider?: string; ready?: boolean } | null>(null)
  const licenseStatus = ref<LicenseStatus | null>(null)

  const chrome = useChromeStore()

  const query = useApiQuery(
    async () => {
      const partialErrors: string[] = []
      const [h, ch, d, ag, lic] = await Promise.all([
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
        getLicenseStatus().catch(() => null),
      ])
      if (h?.data) health.value = h.data
      if (ch?.data != null) configHealth.value = ch.data
      if (d?.data) diag.value = d.data
      if (ag) agentStatus.value = ag
      if (lic?.data) licenseStatus.value = lic.data
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
          redisReady: d?.data?.redis?.ok === true || d?.data?.redis?.configured === false,
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
    licenseStatus,
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
    redisStatusLabel: summary.redisStatusLabel,
    redisDisplay: summary.redisDisplay,
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
    { id: 'overview', label: '系统概览', emoji: '📊', accent: 'var(--module-accent-admin-sub)' },
    { id: 'runtime', label: '运行日志', emoji: '🖥️', accent: 'var(--module-accent-devices)' },
    { id: 'jobs', label: '调度作业', emoji: '⏱️', accent: 'var(--module-accent-events)' },
    { id: 'log', label: '诊断导出', emoji: '📄', accent: 'var(--module-accent-automation)' },
  ])

  useSettingsHubRouteSection(section, subnavSections, { tabId: 'diagnostics' })

  const overviewTabs = computed(() => [
    {
      id: 'summary',
      label: '健康总览',
      emoji: '💚',
      accent:
        data.overallStatus.value.tone === 'bad'
          ? 'var(--set-danger, #f87171)'
          : data.overallStatus.value.tone === 'warn'
            ? 'var(--set-warn, #fbbf24)'
            : 'var(--module-accent-admin-sub)',
    },
    {
      id: 'connect',
      label: '连接同步',
      emoji: '🔌',
      accent: data.haOk.value ? 'var(--module-accent-admin-sub)' : 'var(--set-danger, #f87171)',
    },
    {
      id: 'runtime',
      label: '后端进程',
      emoji: '🗄️',
      accent: 'var(--module-accent-events)',
      count: data.cpuPct.value >= 85 || data.memPct.value >= BACKEND_MEM_WARN_PCT ? '!' : undefined,
      countClass: 'settings-orch-count--alert',
    },
    {
      id: 'perf',
      label: '前端性能',
      emoji: '⚡',
      accent: 'var(--module-accent-devices)',
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
