/**
 * 文件：useDiagnosticsExport.ts
 * 职责：诊断导出 composable。组装诊断快照文本（diag.copyText），提供复制、下载 txt、
 *       导出字段/同步错误/引导行数等导出辅助。
 * 关键依赖：
 *   - vue 的 computed / ComputedRef / Ref
 *   - formatFullDateTime：时间格式化
 *   - useChromeStore：notify
 *   - downloadBlob / copyTextWithNotify：下载与复制
 *   - RedisHealthView / DiagnosticsDiag / DiagnosticsHealth：数据类型
 */
import { computed, type ComputedRef, type Ref } from 'vue'
import { HeartPulse, Archive } from '@lucide/vue'
import { formatFullDateTime } from '@/utils/format/locale-format.util'
import { useChromeStore } from '@/stores/chrome.store'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { downloadBlob } from '@/utils/core/misc.util'
import { copyTextWithNotify } from '@/services/notify'
import type { RedisHealthView } from '@/types/redis-status'
import { BACKEND_MEM_WARN_PCT } from './constants'
import type { DiagnosticsDiag, DiagnosticsHealth } from './types'

export function useDiagnosticsExport(deps: {
  diag: Ref<DiagnosticsDiag | null>
  health: Ref<DiagnosticsHealth | null>
  lastFetched: Ref<string>
  haOk: ComputedRef<boolean>
  entityCount: ComputedRef<unknown>
  wsClients: ComputedRef<unknown>
  redisStatusLabel: ComputedRef<string>
  redisDisplay: ComputedRef<RedisHealthView>
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
    redisStatusLabel,
    redisDisplay,
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
        key: 'redis',
        label: 'Redis',
        value: redisStatusLabel.value,
        tone:
          redisDisplay.value?.configured && !redisDisplay.value?.ok && !redisDisplay.value?.loading
            ? 'bad'
            : null,
      },
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

  const diagExportSyncErrors = computed(
    () => diag.value?.orchestratorSync?.recentErrors?.slice(0, 5) ?? [],
  )

  const diagExportGuides = [
    {
      id: 'health',
      icon: HeartPulse,
      accent: 'var(--module-accent-admin-sub)',
      title: '健康轮询',
      desc: '外部探针可轮询健康接口，响应含缓存状态与基础资源占用。',
      codes: ['GET /health', 'GET /api/v1/system/health'],
    },
    {
      id: 'backup',
      icon: Archive,
      accent: 'var(--module-accent-template)',
      title: '完整备份包',
      desc: '导出 UI 布局、联动器 YAML 与系统参数（不含数据库实体快照）。',
      linkTo: SETTINGS_ROUTES.profiles('backup'),
      linkLabel: '前往备份与还原',
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
