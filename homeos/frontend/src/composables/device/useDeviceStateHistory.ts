/**
 * 设备状态历史 Composable
 *
 * 模块：设备详情 / 状态历史
 * 职责：
 *   - 根据 entity_id 与时间范围拉取状态变更事件列表。
 *   - 暴露 loading / error / events / total / truncated 五个响应式状态。
 *   - 通过 createFetchSequence 串行化请求，过滤过期响应。
 *
 * 依赖：
 *   - @/services/api/entities.fetchEvents：事件列表接口。
 *   - @/utils/core/misc.util.createFetchSequence：请求序号守卫。
 */
import { ref, watch, type Ref } from 'vue'
import { fetchEvents } from '@/services/api/entities'
import { createFetchSequence } from '@/utils/core/misc.util'

/**
 * 设备状态历史事件结构。
 */
export interface DeviceStateHistoryEvent {
  id: number
  entityId: string
  state: string
  oldState: string
  attrText: string | null
  stateDiff: string | null
  createdAt: string
}

// 时间范围预设：value 用于持久化/UI 选择，hours 用于接口请求
// 注意：实际可选范围须按 EventLog 保留期裁剪（见 availableDeviceHistoryRanges）
const DEVICE_HISTORY_RANGES = [
  { value: '6h', label: '6小时', hours: 6 },
  { value: '24h', label: '24小时', hours: 24 },
  { value: '7d', label: '7天', hours: 168 },
  { value: '30d', label: '30天', hours: 720 },
] as const

// 时间范围 value 联合类型
export type DeviceHistoryRange = (typeof DEVICE_HISTORY_RANGES)[number]['value']

type DeviceHistoryRangeOption = (typeof DEVICE_HISTORY_RANGES)[number]

// 单次拉取的事件数上限（用于性能保护，超出时设置 truncated 标记）
const DEVICE_HISTORY_SAMPLE_LIMIT = 200

/**
 * 将时间范围 value 映射为小时数；未匹配时回退到 24 小时。
 *
 * @param range 时间范围 value（如 '6h' / '24h' / '7d' / '30d'）。
 * @returns 对应的小时数。
 */
export function hoursForRange(range: string): number {
  return DEVICE_HISTORY_RANGES.find((r) => r.value === range)?.hours ?? 24
}

/**
 * 按 EventLog 最大可查询小时数裁剪时间范围按钮。
 * 后端会对 hours 做 retention clamp；超出保留期的选项不应出现在 UI。
 */
export function availableDeviceHistoryRanges(maxQueryHours: number): DeviceHistoryRangeOption[] {
  const max = Number.isFinite(maxQueryHours) && maxQueryHours > 0 ? maxQueryHours : 24
  const fitted = DEVICE_HISTORY_RANGES.filter((r) => r.hours <= max)
  if (fitted.length) return [...fitted]
  // 极短保留期（<6h）：仍展示最短档，实际查询由后端 clamp
  return [DEVICE_HISTORY_RANGES[0]]
}

/** 若当前选择超出可查询窗口，回退到最大可用档位 */
export function clampDeviceHistoryRange(
  range: DeviceHistoryRange,
  maxQueryHours: number,
): DeviceHistoryRange {
  const opts = availableDeviceHistoryRanges(maxQueryHours)
  if (opts.some((r) => r.value === range)) return range
  return opts[opts.length - 1]?.value ?? '24h'
}

/**
 * 设备状态历史 Composable。
 *
 * @param entityId 目标实体 ID（响应式）。
 * @param range    时间范围 value（响应式），变化时自动重新加载。
 * @param visible  可选的可见性开关；为 false 时跳过请求与 watch 自动触发。
 * @returns loading / error / events / total / truncated / refresh。
 */
export function useDeviceStateHistory(
  entityId: Ref<string>,
  range: Ref<DeviceHistoryRange>,
  visible?: Ref<boolean>,
) {
  const loading = ref(false)
  const error = ref('')
  const events = ref<DeviceStateHistoryEvent[]>([])
  // 服务端事件总数（可能大于返回的 events 长度）
  const total = ref(0)
  // 是否被截断：total > events.length 时为 true
  const truncated = ref(false)
  // 请求序号守卫，确保只有最新一次请求的结果会写入状态
  const seqGuard = createFetchSequence()

  /**
   * 拉取状态历史事件。
   *
   * 副作用：修改 loading / error / events / total / truncated；过期序号的响应会被丢弃。
   * 调用场景：
   *   - watch 监听 entityId / range / visible 时自动调用。
   *   - 外部组件通过返回的 refresh 手动刷新。
   */
  async function refresh() {
    if (visible && !visible.value) return
    const id = entityId.value?.trim()
    const seq = seqGuard.next()
    if (!id) {
      events.value = []
      total.value = 0
      truncated.value = false
      return
    }

    loading.value = true
    error.value = ''
    try {
      const hours = hoursForRange(range.value)
      const { data } = await fetchEvents({
        entity_id: id,
        hours,
        limit: DEVICE_HISTORY_SAMPLE_LIMIT,
        page: 1,
      })
      if (!seqGuard.isCurrent(seq)) return
      events.value = (data?.events || []) as DeviceStateHistoryEvent[]
      total.value = Number(data?.total) || events.value.length
      // 实际返回数量小于总数时标记为截断，UI 提示「仅展示前 N 条」
      truncated.value = total.value > events.value.length
    } catch {
      if (!seqGuard.isCurrent(seq)) return
      // 翻译：错误提示文案
      error.value = '加载状态历史失败'
      events.value = []
      total.value = 0
      truncated.value = false
    } finally {
      if (seqGuard.isCurrent(seq)) loading.value = false
    }
  }

  // 监听关键依赖：entityId、时间范围、可见性，任一变化即重新加载；immediate 保证初始化即拉取一次
  watch(
    [entityId, range, () => visible?.value],
    () => {
      if (visible && !visible.value) return
      void refresh()
    },
    { immediate: true },
  )

  return { loading, error, events, total, truncated, refresh }
}