/**
 * 设备分析仪表盘 Composable
 *
 * 模块：设备 / 分析仪表盘（总览）
 * 职责：
 *   - 根据时间窗口（days，默认 7 天）并行拉取设备使用统计摘要与事件统计。
 *   - 暴露 loading / error / summary / eventsStats 四个响应式状态。
 *   - 通过 createFetchSequence 串行化请求，过滤过期响应。
 *
 * 依赖：
 *   - @/services/api/system.fetchAdvisorUsageSummary：用量统计摘要接口。
 *   - @/services/api/entities.fetchEventStats：事件统计接口。
 *   - @/types/device.DeviceAnalyticsSummary / EventLogStats：返回类型。
 *   - @/utils/core/misc.util.createFetchSequence：请求序号守卫。
 */
import { ref, watch, type Ref } from 'vue'
import { fetchAdvisorUsageSummary } from '@/services/api/system'
import { fetchEventStats } from '@/services/api/entities'
import type { DeviceAnalyticsSummary, EventLogStats } from '@/types/device'
import { createFetchSequence } from '@/utils/core/misc.util'

// 空摘要常量，用于初始化与失败时复位
const EMPTY_SUMMARY: DeviceAnalyticsSummary = {
  topDevices: [],
  totalDevices: 0,
  days: 7,
  dailyTotals: [],
  domainBreakdown: [],
  anomalyHints: [],
  topDeviceDaily: [],
}

// 空事件统计常量
const EMPTY_EVENTS: EventLogStats = {
  total: 0,
  byDomain: {},
  topEntities: [],
}

/**
 * 设备分析仪表盘 Composable。
 *
 * @param days    时间窗口天数（响应式），变化时自动重新加载。
 * @param visible 可选的可见性开关；为 false 时跳过请求与 watch 自动触发。
 * @returns loading / error / summary / eventsStats / refresh。
 */
export function useDeviceAnalyticsDashboard(days: Ref<number>, visible?: Ref<boolean>) {
  const loading = ref(false)
  const error = ref('')
  const summary = ref<DeviceAnalyticsSummary>({ ...EMPTY_SUMMARY })
  const eventsStats = ref<EventLogStats>({ ...EMPTY_EVENTS })
  // 请求序号守卫，确保只有最新一次请求的结果会写入状态
  const seqGuard = createFetchSequence()

  /**
   * 刷新分析数据：并行拉取摘要与事件统计。
   *
   * 副作用：会修改 loading / error / summary / eventsStats；过期序号的响应会被丢弃。
   * 调用场景：
   *   - watch 监听 days / visible 时自动调用。
   *   - 外部组件通过返回的 refresh 手动刷新。
   */
  async function refresh() {
    if (visible && !visible.value) return
    const seq = seqGuard.next()
    loading.value = true
    error.value = ''
    try {
      // 时间窗口换算为小时，供事件统计接口使用
      const hours = days.value * 24
      const [summaryRes, eventsRes] = await Promise.all([
        fetchAdvisorUsageSummary({ days: days.value }),
        fetchEventStats({ hours }),
      ])
      if (!seqGuard.isCurrent(seq)) return
      summary.value = { ...EMPTY_SUMMARY, ...(summaryRes.data as DeviceAnalyticsSummary) }
      eventsStats.value = { ...EMPTY_EVENTS, ...(eventsRes.data as EventLogStats) }
    } catch {
      if (!seqGuard.isCurrent(seq)) return
      // 翻译：错误提示文案
      error.value = '加载分析数据失败，请稍后重试'
      // 复位时保留当前 days，避免 UI 显示与实际请求不一致
      summary.value = { ...EMPTY_SUMMARY, days: days.value }
      eventsStats.value = { ...EMPTY_EVENTS }
    } finally {
      if (seqGuard.isCurrent(seq)) loading.value = false
    }
  }

  // 监听时间窗口与可见性，任一变化即重新加载；immediate 保证初始化即拉取一次
  watch(
    [days, () => visible?.value],
    () => {
      if (visible && !visible.value) return
      void refresh()
    },
    { immediate: true },
  )

  return { loading, error, summary, eventsStats, refresh }
}