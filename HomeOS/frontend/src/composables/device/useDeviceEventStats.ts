/**
 * 设备事件统计 Composable
 *
 * 模块：设备详情 / 事件统计
 * 职责：
 *   - 根据 entity_id 与时间窗口（默认 168 小时 = 7 天）拉取事件统计与原始事件。
 *   - 将原始事件按小时（0~23）分桶，得到 24 维的 hourlyBuckets 数组供图表展示。
 *   - 通过 createFetchSequence 串行化请求，过滤过期响应。
 *
 * 依赖：
 *   - @/services/api/entities.fetchEventStats / fetchEvents：事件统计 / 原始事件接口。
 *   - @/types/device.EventLogStats：事件统计返回类型。
 *   - @/utils/core/misc.util.createFetchSequence：请求序号守卫。
 */
import { ref, watch, type Ref } from 'vue'
import { fetchEventStats, fetchEvents } from '@/services/api/entities'
import type { EventLogStats } from '@/types/device'
import { createFetchSequence } from '@/utils/core/misc.util'

/**
 * 设备事件统计 Composable。
 *
 * @param entityId 目标实体 ID（响应式）。
 * @param hours    统计时间窗口（小时），默认 168（7 天）。
 * @param visible  可选的可见性开关；为 false 时跳过请求。
 * @returns loading / error / stats / hourlyBuckets / refresh（refresh 等价于 fetchStats）。
 */
export function useDeviceEventStats(
  entityId: Ref<string>,
  hours: Ref<number> = ref(168),
  visible?: Ref<boolean>,
) {
  // 是否正在加载中
  const loading = ref(false)
  // 错误信息（空串表示无错误）
  const error = ref('')
  // 事件统计结果；无 entity_id 或加载失败时为 null
  const stats = ref<EventLogStats | null>(null)
  // 24 维小时分桶数组，索引 0~23 对应 0~23 点的事件数
  const hourlyBuckets = ref<number[]>([])
  // 请求序号守卫，确保只有最新一次请求的结果会写入状态
  const seqGuard = createFetchSequence()

  /**
   * 拉取事件统计数据并构建小时分桶。
   *
   * 副作用：会修改 loading / error / stats / hourlyBuckets；过期序号的响应会被丢弃。
   * 调用场景：
   *   - watch 监听 entityId / hours / visible 时自动调用。
   *   - 外部组件通过返回的 refresh 手动刷新。
   */
  async function fetchStats() {
    if (visible && !visible.value) return
    const id = entityId.value?.trim()
    const seq = seqGuard.next()
    if (!id) {
      stats.value = null
      hourlyBuckets.value = []
      return
    }
    loading.value = true
    error.value = ''
    try {
      // 并行拉取统计数据与原始事件，提升首屏速度
      const [statsRes, eventsRes] = await Promise.all([
        fetchEventStats({ hours: hours.value, entity_id: id }),
        fetchEvents({ entity_id: id, hours: hours.value, limit: 500 }),
      ])
      if (!seqGuard.isCurrent(seq)) return
      stats.value = statsRes.data as EventLogStats

      // 初始化 24 个桶为 0
      const buckets = new Array(24).fill(0)
      const events = eventsRes.data?.events || []
      for (const ev of events) {
        // 优先使用 createdAt，回退到 last_changed，再回退到当前时间
        const ts = new Date(ev.createdAt || ev.last_changed || Date.now())
        // 用事件发生时刻的小时数作为桶下标
        buckets[ts.getHours()]++
      }
      hourlyBuckets.value = buckets
    } catch {
      if (!seqGuard.isCurrent(seq)) return
      // 翻译：错误提示文案
      error.value = '加载事件统计失败'
      stats.value = null
      hourlyBuckets.value = []
    } finally {
      if (seqGuard.isCurrent(seq)) loading.value = false
    }
  }

  // 监听关键依赖：entityId、时间窗口、可见性，任一变化即重新加载
  watch(
    [entityId, hours, () => visible?.value],
    () => {
      if (visible && !visible.value) return
      void fetchStats()
    },
    { immediate: true },
  )

  return { loading, error, stats, hourlyBuckets, refresh: fetchStats }
}