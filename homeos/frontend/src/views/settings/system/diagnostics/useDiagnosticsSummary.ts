/**
 * 文件：useDiagnosticsSummary.ts
 * 职责：诊断摘要 composable。聚合系统健康总览 KPI、流水线节点、连接服务卡片、配置健康评分与缺口、
 *       Redis 健康视图等，供 OverviewSection 展示。
 * 关键依赖：
 *   - vue 的 computed / Ref
 *   - useEntitiesStore：实体数量
 *   - mergeRedisHealthView：Redis 健康视图合并
 *   - SETTINGS_ROUTES / LINKAGE_HUB_ROUTES：跳转路由
 */
import { computed, type Ref } from 'vue'
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  PlugZap,
  Cpu,
  Database,
  Radio,
  Layers,
  Timer,
  HardDrive,
  RefreshCw,
} from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import {
  mergeRedisHealthView,
  redisStatusToLabel,
  redisStatusClass as getRedisStatusClass,
} from '@/utils/telemetry/redis-status'
import { getPageTraceId } from '@/utils/telemetry/trace.util'
import { formatAuditTimestamp } from '@/utils/format/locale-format.util'
import { BACKEND_MEM_WARN_PCT } from './constants'
import type { DiagnosticsConfigHealth, DiagnosticsDiag, DiagnosticsHealth } from './types'

export function useDiagnosticsSummary(deps: {
  loadError: Ref<string | null>
  loading: Ref<boolean>
  health: Ref<DiagnosticsHealth | null>
  configHealth: Ref<DiagnosticsConfigHealth | null>
  diag: Ref<DiagnosticsDiag | null>
  agentStatus?: Ref<{ provider?: string; ready?: boolean } | null>
}) {
  const { loadError, loading, health, configHealth, diag, agentStatus } = deps
  const entitiesStore = useEntitiesStore()

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

  const redisDisplay = computed(() =>
    mergeRedisHealthView(entitiesStore.redisStatus, diag.value?.redis),
  )

  const redisStatusLabel = computed(() => redisStatusToLabel(redisDisplay.value))
  const redisStatusClass = computed(() => getRedisStatusClass(redisDisplay.value))

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
    { key: 'entities', label: '实体数', value: entityCount.value, icon: Layers, accent: 'var(--module-accent-admin-sub)' },
    { key: 'ws', label: 'WS 客户端', value: wsClients.value, icon: Radio, accent: 'var(--module-accent-devices)' },
    {
      key: 'uptime',
      label: '运行时间',
      value: health.value?.uptime ?? '—',
      icon: Timer,
      accent: 'var(--module-accent-events)',
      small: true,
    },
    {
      key: 'retention',
      label: '历史保留',
      value: retentionDays.value,
      suffix: retentionDays.value !== '—' ? '天' : '',
      icon: HardDrive,
      accent: 'var(--module-accent-life)',
    },
  ])

  const runtimeKpis = computed(() => [
    { key: 'entities', label: '实体数', value: entityCount.value, icon: Layers, accent: 'var(--module-accent-admin-sub)' },
    {
      key: 'uptime',
      label: '运行时间',
      value: health.value?.uptime ?? '—',
      icon: Timer,
      accent: 'var(--module-accent-devices)',
      small: true,
    },
    {
      key: 'retention',
      label: '历史保留',
      value: retentionDays.value,
      suffix: retentionDays.value !== '—' ? '天' : '',
      icon: HardDrive,
      accent: 'var(--module-accent-events)',
    },
    {
      key: 'version',
      label: '后端版本',
      value: health.value?.version ?? '—',
      icon: Cpu,
      accent: 'var(--module-accent-life)',
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
    const redis = redisDisplay.value
    let redisTone = 'neutral'
    if (!redis?.loading && redis?.configured) redisTone = redis.ok ? 'ok' : 'bad'

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
        id: 'redis',
        label: 'Redis',
        icon: Database,
        tone: redisTone,
        primary: redisStatusLabel.value,
        secondary: redis?.configured ? '能源 · 实时推送' : '未配置',
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
    const redis = redisDisplay.value
    let redisTone = 'neutral'
    if (redis?.loading) redisTone = 'neutral'
    else if (!redis?.configured) redisTone = 'neutral'
    else redisTone = redis.ok ? 'ok' : 'bad'

    return [
      {
        id: 'ha',
        icon: PlugZap,
        label: 'Home Assistant',
        meta: haOk.value
          ? `${diag.value?.ha?.version || '已连接'} · ${haWsModeLabel.value}`
          : '未连接',
        tone: haOk.value ? 'ok' : 'bad',
      },
      {
        id: 'redis',
        icon: Database,
        label: 'Redis',
        meta: redisStatusLabel.value,
        tone: redisTone,
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
    const redisBad =
      redisDisplay.value?.configured && !redisDisplay.value?.ok && !redisDisplay.value?.loading
    if (redisBad) {
      return {
        tone: 'bad',
        label: 'Redis 异常',
        detail: '缓存服务已配置但未就绪，能源趋势与实时推送已降级',
        icon: AlertTriangle,
      }
    }
    const attention =
      Boolean(diag.value?.entities?.stale) ||
      cpuPct.value >= 85 ||
      memPct.value >= BACKEND_MEM_WARN_PCT
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
    if (redisDisplay.value?.configured && !redisDisplay.value?.ok && !redisDisplay.value?.loading) {
      hints.push({
        tone: 'amber',
        text: '缓存服务已配置但未就绪：请检查连接配置与同机缓存进程。能耗趋势将尝试回退 HA 历史。',
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
    if (diag.value?.retention?.skipSensorTimeline === true) {
      hints.push({
        tone: 'sky',
        text: '传感器功率趋势优先走缓存；不可用时前端会回退 HA 历史。',
        linkTo: SETTINGS_ROUTES.connection(),
        linkLabel: '连接与运维',
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
    if ((diag.value?.ha?.queueDroppedTotal ?? 0) > 0) {
      hints.push({
        tone: 'amber',
        text: '命令队列已丢弃 {n} 条，可在高级参数调大队列或排查 HA 延迟。'.replace(
          '{n}',
          String(diag.value?.ha?.queueDroppedTotal ?? 0),
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
    redisDisplay,
    redisStatusLabel,
    redisStatusClass,
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
