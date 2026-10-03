/**
 * @file useSetupChecklist.ts
 * @module composables/settings
 * @description 安装引导清单 composable：拉取后端设置清单并控制横幅展示。
 *
 * 职责：
 * - 拉取后端 SetupChecklist 状态（条目 / 完成数 / 总数 / 是否可见）；
 * - 仅管理员角色展示横幅，并支持本地"7 天暂缓"dismiss；
 * - 暴露 showBanner 是否展示、progressText 进度文案、refresh 重新拉取、dismiss 暂缓。
 *
 * 依赖：
 * - vue（ref、computed、onMounted）
 * - @/services/api/system（fetchSetupChecklist）
 * - @/stores/auth.store（角色判断）
 * - @/utils/core/logger（失败日志）
 */
import { readLocalStorage, writeLocalStorage } from '@/utils/core/local-storage.util'

import { ref, computed, onMounted } from 'vue'
import { fetchSetupChecklist } from '@/services/api/system'
import { useAuthStore } from '@/stores/auth.store'
import { logger } from '@/utils/core/logger'

/** 单个清单条目：id / 标签 / 是否完成 / 提示 / 跳转路由 */
interface SetupChecklistItem {
  id: string
  label: string
  done: boolean
  hint: string
  route?: string
}

/** 清单整体状态：条目列表 + 完成进度 + 是否被服务端关闭 + 是否可见 */
interface SetupChecklistState {
  items: SetupChecklistItem[]
  completed: number
  total: number
  dismissed: boolean
  visible: boolean
}

// 本地暂缓存储 key 与 7 天时长
const SNOOZE_KEY = 'homeos_setup_checklist_snooze_until'
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 读取本地暂缓到期时间戳；读取失败返回 0（视为未暂缓）。
 */
function readSnoozeUntil(): number {
  try {
    const raw = readLocalStorage(SNOOZE_KEY)
    const n = raw ? Number(raw) : 0
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

/** 当前是否处于本地暂缓期内 */
function isSnoozed(): boolean {
  return Date.now() < readSnoozeUntil()
}

/**
 * 安装引导清单 composable。
 *
 * @returns loading 加载中标志；checklist 清单状态；showBanner 是否展示横幅；progressText 进度文案；refresh 重新拉取；dismiss 暂缓 7 天
 */
export function useSetupChecklist() {
  const authStore = useAuthStore()
  const loading = ref(false)
  const checklist = ref<SetupChecklistState | null>(null)
  // 本地暂缓状态（与 localStorage 同步）
  const snoozedLocally = ref(isSnoozed())

  // 横幅展示条件：管理员 + 服务端可见 + 未被本地或服务端暂缓
  const showBanner = computed(
    () =>
      authStore.role === 'admin' &&
      Boolean(checklist.value?.visible) &&
      !snoozedLocally.value &&
      !isSnoozed(),
  )

  // 进度文案：completed/total
  const progressText = computed(() => {
    if (!checklist.value) return ''
    return `${checklist.value.completed}/${checklist.value.total}`
  })

  /**
   * 重新拉取清单：非管理员直接清空；管理员同步暂缓状态后请求后端。
   * 失败时静默清空（debug 日志），不阻塞页面。
   */
  async function refresh() {
    if (authStore.role !== 'admin') {
      checklist.value = null
      return
    }
    snoozedLocally.value = isSnoozed()
    loading.value = true
    try {
      const { data } = await fetchSetupChecklist<SetupChecklistState>()
      checklist.value = data
    } catch (e) {
      logger.debug('设置清单加载失败', e)
      checklist.value = null
    } finally {
      loading.value = false
    }
  }

  /**
   * 7 天本地暂缓，不永久关闭服务端清单。
   * 写入 localStorage 暂缓到期时间，并把本地 visible 置为 false。
   */
  function dismiss() {
    const until = Date.now() + SNOOZE_MS
    try {
      writeLocalStorage(SNOOZE_KEY, String(until))
    } catch {
      /* 忽略配额 */
    }
    snoozedLocally.value = true
    if (checklist.value) {
      checklist.value = { ...checklist.value, visible: false }
    }
  }

  // 挂载时自动拉取一次清单
  onMounted(refresh)

  return {
    loading,
    checklist,
    showBanner,
    progressText,
    refresh,
    dismiss,
  }
}
