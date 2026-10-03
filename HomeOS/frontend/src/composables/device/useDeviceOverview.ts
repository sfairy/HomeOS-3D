/**
 * 设备概览 Composable
 *
 * 模块：设备详情 / 概览
 * 职责：
 *   - 并行拉取单个设备的 7 天用量报告与最近 8 条事件。
 *   - 暴露 usageLoading / eventsLoading / usageReport / recentEvents / recentTotal。
 *   - 通过 createFetchSequence 串行化请求，过滤过期响应。
 *
 * 依赖：
 *   - @/services/api/system.fetchAdvisorUsage：HomeAdvisor 用量接口。
 *   - @/services/api/entities.fetchEvents：事件列表接口。
 *   - @/types/device.DeviceUsageReport：用量报告类型。
 *   - @/composables/device/useDeviceStateHistory.DeviceStateHistoryEvent：事件类型。
 *   - @/utils/core/misc.util.createFetchSequence：请求序号守卫。
 */
import { ref, watch, type Ref } from 'vue'
import { fetchAdvisorUsage } from '@/services/api/system'
import { fetchEvents } from '@/services/api/entities'
import type { DeviceUsageReport } from '@/types/device'
import type { DeviceStateHistoryEvent } from '@/composables/device/useDeviceStateHistory'
import { createFetchSequence } from '@/utils/core/misc.util'

/**
 * 设备概览 Composable。
 *
 * @param entityId 目标实体 ID（响应式）。
 * @param visible  可见性开关；为 false 时跳过请求与 watch 自动触发。
 * @returns usageLoading / eventsLoading / usageReport / recentEvents / recentTotal / refresh。
 */
export function useDeviceOverview(entityId: Ref<string>, visible: Ref<boolean>) {
  // 用量报告加载状态
  const usageLoading = ref(false)
  // 事件列表加载状态
  const eventsLoading = ref(false)
  // 用量报告；无 entity_id 或失败时为 null
  const usageReport = ref<DeviceUsageReport | null>(null)
  // 最近事件列表
  const recentEvents = ref<DeviceStateHistoryEvent[]>([])
  // 最近事件总数（用于显示「还有 N 条」）
  const recentTotal = ref(0)
  // 请求序号守卫，确保只有最新一次请求的结果会写入状态
  const seqGuard = createFetchSequence()

  /**
   * 拉取用量报告（7 天窗口）。
   *
   * @param seq 当前请求序号，过期响应会被丢弃。
   * 副作用：修改 usageLoading / usageReport。
   */
  async function fetchUsage(seq: number) {
    const id = entityId.value?.trim()
    if (!id) {
      usageReport.value = null
      return
    }
    usageLoading.value = true
    try {
      const { data } = await fetchAdvisorUsage(id, { days: 7 })
      if (!seqGuard.isCurrent(seq)) return
      usageReport.value = data as DeviceUsageReport
    } catch {
      if (!seqGuard.isCurrent(seq)) return
      usageReport.value = null
    } finally {
      if (seqGuard.isCurrent(seq)) usageLoading.value = false
    }
  }

  /**
   * 拉取最近事件（168 小时窗口内最多 8 条）。
   *
   * @param seq 当前请求序号，过期响应会被丢弃。
   * 副作用：修改 eventsLoading / recentEvents / recentTotal。
   */
  async function fetchRecentEvents(seq: number) {
    const id = entityId.value?.trim()
    if (!id) {
      recentEvents.value = []
      recentTotal.value = 0
      return
    }
    eventsLoading.value = true
    try {
      const { data } = await fetchEvents({
        entity_id: id,
        hours: 168,
        limit: 8,
        page: 1,
      })
      if (!seqGuard.isCurrent(seq)) return
      recentEvents.value = (data?.events || []) as DeviceStateHistoryEvent[]
      recentTotal.value = Number(data?.total) || recentEvents.value.length
    } catch {
      if (!seqGuard.isCurrent(seq)) return
      recentEvents.value = []
      recentTotal.value = 0
    } finally {
      if (seqGuard.isCurrent(seq)) eventsLoading.value = false
    }
  }

  /**
   * 同时刷新用量与最近事件。
   *
   * 副作用：发起两个并行请求，序号一致以统一过滤。
   * 调用场景：
   *   - watch 监听 entityId / visible 时自动调用。
   *   - 外部组件通过返回的 refresh 手动刷新。
   */
  async function refresh() {
    if (!visible.value) return
    const seq = seqGuard.next()
    await Promise.all([fetchUsage(seq), fetchRecentEvents(seq)])
  }

  // 监听 entityId 与 visible；仅在有 id 且可见时刷新；immediate 保证初始化即拉取一次
  watch(
    [entityId, visible],
    ([id, isVisible]) => {
      if (id && isVisible) void refresh()
    },
    { immediate: true },
  )

  return {
    usageLoading,
    eventsLoading,
    usageReport,
    recentEvents,
    recentTotal,
    refresh,
  }
}