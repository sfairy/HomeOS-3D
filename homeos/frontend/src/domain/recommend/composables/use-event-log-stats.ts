/* ── 原 useEventLogStats.ts 的实现 ── */
import { ref } from 'vue'
import { fetchEventStats } from '@/domain/api/entities'
import { logger } from '@/kernel/utils/core'
import { getEventLogConfig } from '@/kernel/config/frontend-config'
import type { EventLogStatsSnapshot } from '@/domain/recommend/types/recommend.types'

/**
 * 事件日志统计 composable
 * @returns 响应式状态与加载方法
 *   - statsLoading: 加载中标记
 *   - statsHours: 当前查询窗口（小时）
 *   - eventStats: 统计快照，可能为 null
 *   - loadStats: 加载方法
 */
export function useEventLogStats() {
  const statsLoading = ref(false)
  // 当前查询窗口（小时数），默认 24
  const statsHours = ref(24)
  // 事件统计快照，加载失败时为 null
  const eventStats = ref<EventLogStatsSnapshot | null>(null)

  /**
   * 加载事件统计
   * @param hours 查询窗口小时数，缺省回退到前端配置 maxQueryHours 或 24
   * @sideEffects 更新 statsHours/eventStats/statsLoading
   * @exceptions 捕获异常后置 eventStats 为 null，不向上抛出
   */
  async function loadStats(hours?: number) {
    statsLoading.value = true
    try {
      // 窗口优先级：传入参数 > 前端配置 > 默认 24
      const windowHours = hours || getEventLogConfig().maxQueryHours || 24
      statsHours.value = windowHours
      const { data } = await fetchEventStats({ hours: windowHours })
      // 防御性构造快照：确保字段类型符合 EventLogStatsSnapshot
      eventStats.value =
        data && typeof data === 'object'
          ? {
              total: Number(data.total) || 0,
              byDomain: data.byDomain && typeof data.byDomain === 'object' ? data.byDomain : {},
              topEntities: Array.isArray(data.topEntities) ? data.topEntities : [],
            }
          : null
    } catch (e) {
      // 加载失败仅记日志，快照置空避免展示脏数据
      logger.debug('事件统计加载失败', e)
      eventStats.value = null
    } finally {
      statsLoading.value = false
    }
  }

  return { statsLoading, statsHours, eventStats, loadStats }
}
