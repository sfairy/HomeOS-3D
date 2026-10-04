/**
 * 设备使用统计 Composable
 *
 * 模块：设备详情 / 使用统计
 * 职责：
 *   - 根据 entity_id 与时间窗口（默认 7 天）拉取设备使用报告（DeviceUsageReport）。
 *   - 暴露 loading / error / report 三个响应式状态供组件消费。
 *   - 通过 createFetchSequence 串行化请求，避免快速切换设备时旧请求覆盖新结果。
 *
 * 依赖：
 *   - @/services/api/system.fetchAdvisorUsage：HomeAdvisor 用量统计接口。
 *   - @/utils/core/misc.util.createFetchSequence：请求序号守卫，过滤过期响应。
 *   - @/types/device.DeviceUsageReport：用量统计返回类型。
 */
import { ref, watch, type Ref } from 'vue'
import { fetchAdvisorUsage } from '@/services/api/system'
import type { DeviceUsageReport } from '@/types/device'
import { createFetchSequence } from '@/utils/core/misc.util'

/**
 * 设备使用统计 Composable。
 *
 * @param entityId  目标实体 ID（响应式），变化时自动重新加载。
 * @param days      统计窗口天数，默认 7。
 * @param visible   可选的可见性开关；为 false 时跳过请求（用于隐藏 Tab 时的懒加载）。
 * @returns loading / error / report / refresh（refresh 等价于内部 fetchUsage）。
 */
export function useDeviceUsageStats(
  entityId: Ref<string>,
  days: Ref<number> = ref(7),
  visible?: Ref<boolean>,
) {
  // 是否正在加载中
  const loading = ref(false)
  // 错误信息（空串表示无错误）
  const error = ref('')
  // 用量统计报告；加载失败或无 entity_id 时为 null
  const report = ref<DeviceUsageReport | null>(null)
  // 请求序号守卫，确保只有最新一次请求的结果会写入状态
  const seqGuard = createFetchSequence()

  /**
   * 拉取设备使用统计数据。
   *
   * 副作用：会修改 loading / error / report；非当前序号的响应会被丢弃。
   * 调用场景：
   *   - watch 监听 entityId / days / visible 时自动调用。
   *   - 外部组件通过返回的 refresh 手动刷新。
   */
  async function fetchUsage() {
    // 不可见时跳过请求，避免隐藏 Tab 中的浪费请求
    if (visible && !visible.value) return
    const id = entityId.value?.trim()
    const seq = seqGuard.next()
    if (!id) {
      // 无 entity_id 时清空状态
      report.value = null
      return
    }
    loading.value = true
    error.value = ''
    try {
      const { data } = await fetchAdvisorUsage(id, { days: days.value })
      // 序号过期则丢弃响应，避免旧请求覆盖新数据
      if (!seqGuard.isCurrent(seq)) return
      report.value = data as DeviceUsageReport
    } catch {
      if (!seqGuard.isCurrent(seq)) return
      // 翻译：错误提示文案
      error.value = '加载使用统计失败'
      report.value = null
    } finally {
      if (seqGuard.isCurrent(seq)) loading.value = false
    }
  }

  // 监听关键依赖：entityId、天数、可见性，任一变化即重新加载
  watch(
    [entityId, days, () => visible?.value],
    () => {
      if (visible && !visible.value) return
      void fetchUsage()
    },
    { immediate: true },
  )

  return { loading, error, report, refresh: fetchUsage }
}