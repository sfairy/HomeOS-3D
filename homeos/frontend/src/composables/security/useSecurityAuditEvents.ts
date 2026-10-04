/**
 * @file useSecurityAuditEvents.ts
 * @module composables/security
 * @description 安防审计事件日志 composable：会话内即时事件 + 后端审计事件的合并、过滤与拉取。
 *   - 从 SecurityOverview.vue 抽出，便于复用与单测
 *   - 维护会话事件队列（最多 30 条）与后端审计事件列表
 *   - 提供按类型/区域的过滤选项，并按时间戳倒序合并裁剪到上限
 *   - 暴露 addSecEvent 供外部推送即时事件，fetchSecAuditEvents 拉取后端日志
 * @dependencies vue, @/services/api/security, @/utils/core/logger, @/utils/config/frontend-config, @/utils/security/security-event-display.util, @/utils/format/locale-format.util, @lucide/vue
 */
import { formatSecurityTime } from '@/utils/format/locale-format.util'
import { ref, computed, type Ref } from 'vue'
import { fetchSecurityPanelEvents } from '@/services/api/security'
import { logger } from '@/utils/core/logger'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { useChromeStore } from '@/stores/chrome.store'
import { getMaxRemoteNotifications } from '@/utils/config/frontend-config'
import {
  mapSecurityEventRow,
  filterSecurityEvents,
  recentLinkageFailures,
} from '@/utils/security/event-display.util'
import {
  Shield,
  ShieldOff,
  ShieldCheck,
  AlertTriangle,
  Siren,
  Bell,
  WifiOff,
  Activity,
} from '@lucide/vue'
import type { Component } from 'vue'
import type { SecurityEventDisplayItem } from '@/utils/security/event-display.util'

/**
 * 会话内即时事件结构
 */
interface SecSessionEvent {
  /** 事件唯一 ID（基于时间戳与自增序列） */
  id: string
  /** 图标组件 */
  icon: Component
  /** 事件文案 */
  label: string
  /** 本地化时间字符串 */
  time: string
  /** CSS 类名 */
  css: string
  /** 时间戳（毫秒） */
  ts: number
  /** 关联区域 ID 列表 */
  zoneIds?: string[]
}

/**
 * 安防审计事件日志：会话内即时事件 + 后端审计事件的合并、过滤与拉取。
 * 从 SecurityOverview.vue 抽出，便于复用与单测。
 * @param liveZones 实时区域列表，用于生成区域过滤项
 * @returns 响应式状态与操作方法
 */
export function useSecurityAuditEvents(
  liveZones: Ref<Array<{ id: string; name: string }>> = ref([]),
) {
  const chrome = useChromeStore()
  // 会话内即时事件队列，最多保留 30 条
  const secSessionEvents = ref<SecSessionEvent[]>([])
  // 后端审计事件列表
  const secDbEvents = ref<SecurityEventDisplayItem[]>([])
  // 当前过滤项：all / hazard / linkage / false_alarm_feedback / zone:{id}
  const secEventFilter = ref('all')
  // 审计事件加载中标记
  const secAuditLoading = ref(false)
  const secAuditError = ref('')
  // 事件类型到图标组件的映射
  const secEventIconMap: Record<string, Component> = {
    shield: Shield,
    shieldOff: ShieldOff,
    shieldCheck: ShieldCheck,
    alert: AlertTriangle,
    siren: Siren,
    bell: Bell,
    wifiOff: WifiOff,
    activity: Activity,
  }
  // 过滤选项列表：基础类型 + 最多 8 个区域过滤项
  const secEventFilters = computed(() => {
    const base = [
      { key: 'all', label: '全部' },
      { key: 'hazard', label: '危险传感器' },
      { key: 'linkage', label: '联动失败' },
      { key: 'false_alarm_feedback', label: '误报' },
    ]
    // 仅保留有 id 与 name 的区域，最多取前 8 个，避免过滤栏过长
    const zoneFilters = (liveZones.value || [])
      .filter((z) => z.id && z.name)
      .slice(0, 8)
      .map((z) => ({ key: `zone:${z.id}`, label: z.name }))
    return zoneFilters.length ? [...base, ...zoneFilters] : base
  })
  // 合并会话事件与后端事件，按时间戳倒序后裁剪到上限
  const secEvents = computed(() => {
    const cap = getMaxRemoteNotifications()
    return [...secSessionEvents.value, ...secDbEvents.value]
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, cap)
  })
  // 按当前过滤项过滤后的事件列表
  const displayedSecEvents = computed(() =>
    filterSecurityEvents(secEvents.value as SecurityEventDisplayItem[], secEventFilter.value),
  )
  // 最近的联动失败事件，用于提示用户
  const linkageFailureRecent = computed(() => recentLinkageFailures(secDbEvents.value))
  // 会话事件自增序列，配合时间戳生成唯一 ID
  let secSessionEventSeq = 0

  /**
   * 推送一条会话内即时事件
   * @param icon 图标组件
   * @param label 事件文案
   * @param css CSS 类名
   * @param meta.zoneIds 关联区域 ID 列表
   * @sideEffects 在队列头部插入新事件，超过 30 条时裁剪
   */
  function addSecEvent(
    icon: Component,
    label: string,
    css: string,
    meta?: { zoneIds?: string[] },
  ) {
    const ts = Date.now()
    const time = formatSecurityTime(ts)
    secSessionEvents.value.unshift({
      id: `session-${ts}-${++secSessionEventSeq}`,
      icon,
      label,
      time,
      css,
      ts,
      zoneIds: meta?.zoneIds,
    })
    // 会话事件最多保留 30 条，超出部分截断
    if (secSessionEvents.value.length > 30) secSessionEvents.value.length = 30
  }

  /**
   * 拉取后端审计事件
   * @sideEffects 更新 secDbEvents/secAuditLoading
   * @exceptions 捕获异常后 toast 并记录 error 日志，不向上抛出
   */
  async function fetchSecAuditEvents() {
    secAuditLoading.value = true
    secAuditError.value = ''
    try {
      const { data } = await fetchSecurityPanelEvents({ limit: getMaxRemoteNotifications() })
      // 后端返回非数组时回退为空数组
      secDbEvents.value = (Array.isArray(data) ? data : []).map(mapSecurityEventRow)
    } catch (e) {
      logger.error('加载安防审计日志失败', e)
      secAuditError.value = getApiErrorMessage(e, '加载安防审计日志失败')
      chrome.notify(secAuditError.value, 'error')
    } finally {
      secAuditLoading.value = false
    }
  }

  return {
    secSessionEvents,
    secDbEvents,
    secEventFilter,
    secAuditLoading,
    secAuditError,
    secEventIconMap,
    secEventFilters,
    secEvents,
    displayedSecEvents,
    linkageFailureRecent,
    addSecEvent,
    fetchSecAuditEvents,
  }
}