/**
 * @file usePresenceHome.ts
 * @module composables/presence
 * @description 在家状态轮询 composable，定时拉取家庭成员的在家/离家状态。
 *   - 通过 loadPresenceHome 拉取成员列表与自动模式标记
 *   - 默认每 30 秒轮询一次，挂载时立即拉取一次
 *   - 卸载时清理定时器，避免内存泄漏与重复请求
 * @dependencies vue, @/composables/presence/load-presence-home
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { loadPresenceHome } from '@/composables/presence/load-presence-home'
import { schedulePoll } from '@/utils/core/poll-scheduler'

/**
 * 在家状态成员信息
 */
export interface PresenceHomeMember {
  /** 成员唯一标识 */
  id: string
  /** 成员显示名称 */
  name: string
  /** 数据来源（如 device_tracker / bluetooth 等） */
  source: string
  /** 是否在家 */
  atHome: boolean
  /** 最后一次检测到的时间戳（ISO 字符串） */
  lastSeen: string
}

/**
 * 按选中 ID 过滤成员列表
 * @param members 全量成员列表
 * @param selectedIds 选中的成员 ID 列表，为空则返回全量
 * @returns 过滤后的成员列表
 */
export function filterPresenceMembers(
  members: PresenceHomeMember[],
  selectedIds?: string[],
): PresenceHomeMember[] {
  // 未传选中 ID 时直接返回原列表，避免无谓的 Set 构建
  if (!selectedIds?.length) return members
  const set = new Set(selectedIds)
  return members.filter((m) => set.has(m.id))
}

/**
 * 在家状态轮询 composable
 * @param pollMs 轮询间隔毫秒数，默认 30 秒；传入 0 表示不轮询
 * @returns 响应式状态与手动刷新方法
 *   - loading: 初始加载标记
 *   - members: 成员列表
 *   - autoMode: 是否处于自动判定模式
 *   - refresh: 手动触发刷新
 */
export function usePresenceHome(pollMs = 30_000) {
  // 初始 loading 为 true，首次 refresh 完成后置 false
  const loading = ref(true)
  // 成员列表，初始为空数组
  const members = ref<PresenceHomeMember[]>([])
  // 自动模式标记，后端返回 autoMode !== false 时为 true
  const autoMode = ref(true)
  // 轮询任务取消函数（注册到全局调度器），卸载时用于清理
  let pollCancel: (() => void) | null = null

  /**
   * 拉取最新在家状态
   * @sideEffects 更新 members/autoMode/loading
   * @exceptions 捕获异常后将 members 置空，不向上抛出
   */
  async function refresh() {
    const data = await loadPresenceHome()
    // 后端可能返回非数组，做防御性处理；失败时清空成员，避免展示过期数据
    members.value = Array.isArray(data?.members) ? data.members : []
    // autoMode 显式为 false 时才关闭，缺省视为 true
    autoMode.value = data?.autoMode !== false
    loading.value = false
  }

  // 挂载时立即刷新一次，并按需注册全局调度器轮询（页面隐藏时自动暂停，恢复可见时立即刷新）
  onMounted(() => {
    void refresh()
    if (pollMs > 0)
      pollCancel = schedulePoll(
        'presence-home:poll',
        () => {
          void refresh()
        },
        pollMs,
      )
  })

  // 卸载时取消轮询，防止内存泄漏
  onUnmounted(() => {
    if (pollCancel) pollCancel()
  })

  return { loading, members, autoMode, refresh }
}