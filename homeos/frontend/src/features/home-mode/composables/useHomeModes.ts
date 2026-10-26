/**
 * @file useHomeModes.ts
 * @module frontend/src/features/home-mode/composables
 *
 * 家庭模式（含多互斥组）的应用级共享状态。
 *
 * ## 为什么状态放在模块作用域，而不是 `useHomeModes()` 内部
 *
 * 这是**有意的应用级单例**：壳层 `HomeModeSwitcher`、设置页的模式编辑器、安防页读的是
 * 同一份模式列表和激活态。若改成每次调用各建一套 `ref`，三处会各自 fetch、也看不见
 * 彼此刚完成的切换结果（典型症状：壳层切了模式，编辑器仍显示旧激活项）。
 * `subscriberCount` 让首个订阅者负责拉数据、最后一个卸载时断开 WS 并复位。
 *
 * 所以本文件不适用「避免全局状态」这条规范 —— 改成工厂函数等于改语义，不是重构。
 */
import { ref, onMounted, onUnmounted } from 'vue'
import {
  fetchHomeModes,
  fetchActiveHomeMode,
  activateHomeMode,
  deactivateHomeMode,
  seedHomeModes,
  createHomeMode,
  updateHomeMode,
  deleteHomeMode,
} from '@/services/api/home-modes'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { normalizeCrudListResponse } from '@/shared/utils/core/crud-list.util'

interface HomeModeRow {
  id: string
  name?: string
  icon?: string
  isActive?: boolean
  [key: string]: unknown
}

interface HomeModeWsPayload {
  type?: string
  modeId?: string
  modeName?: string
  totalCount?: number
  successCount?: number
  exclusiveGroup?: string
  restored?: number
  skippedDomains?: string[]
  remainingActiveModeIds?: string[]
}

interface UseHomeModesOptions {
  autoSeed?: boolean
}

// ── 应用级单例状态：生命周期 = 页面会话，随最后一个订阅者卸载而复位 ──
const modes = ref<HomeModeRow[]>([])
const activeModes = ref<HomeModeRow[]>([])
const activeMode = ref<HomeModeRow | null>(null)
const loading = ref(false)
const loadError = ref<string>('')
const acting = ref(false)
let initialized = false
let wsStop: (() => void) | null = null
/** 当前挂载了 `useHomeModes()` 的组件数；归零时断开 WS。 */
let subscriberCount = 0

function syncModesActiveFlags(activeIds: string | string[] | null) {
  const ids = new Set(
    activeIds == null ? [] : Array.isArray(activeIds) ? activeIds.map(String) : [String(activeIds)],
  )
  modes.value = modes.value.map((mode) => ({ ...mode, isActive: ids.has(mode.id) }))
}

/** 用服务端返回的激活模式列表刷新本地状态（多互斥组可同时激活）。 */
function applyActiveModes(list: HomeModeRow[]) {
  activeModes.value = list
  activeMode.value = list[0] ?? null
  syncModesActiveFlags(list.map((mode) => mode.id))
}

// ── WS 事件分支：三个事件各自独立成函数，便于单测与按事件排错 ──

/** `home_mode_activated`：刷新激活列表，并按失败设备数选提示语气。 */
function handleModeActivated(data: HomeModeWsPayload) {
  fetchActive()
  if (data.modeId) {
    syncModesActiveFlags(data.modeId)
  }
  if (!data.modeName) return
  const total = data.totalCount ?? 0
  const success = data.successCount ?? 0
  const failedCount = total > 0 ? total - success : 0
  if (failedCount > 0) {
    useChromeStore().notify(
      `模式「${data.modeName}」已激活，${failedCount} 个设备执行失败`,
      'warning',
    )
    return
  }
  useChromeStore().notify(`模式已激活：${data.modeName}`, 'success')
}

/** `home_mode_deactivated`：多互斥组只移除对应项，另一个组的激活态必须保留。 */
function handleModeDeactivated(data: HomeModeWsPayload) {
  const hasRemaining = Array.isArray(data.remainingActiveModeIds)
  const hasModeId = typeof data.modeId === 'string' && data.modeId.length > 0
  if (!hasRemaining && !hasModeId) {
    applyActiveModes([])
    return
  }
  const remaining = hasRemaining
    ? (data.remainingActiveModeIds as string[]).map(String)
    : activeModes.value.filter((mode) => mode.id !== data.modeId).map((mode) => mode.id)
  const remainingSet = new Set(remaining)
  activeModes.value = activeModes.value.filter((mode) => remainingSet.has(mode.id))
  activeMode.value = activeModes.value[0] ?? null
  syncModesActiveFlags(remaining)
}

/** `home_mode_restore_incomplete`：停用后部分设备不支持恢复，提示可排查的域。 */
function handleRestoreIncomplete(data: HomeModeWsPayload) {
  const domains = Array.isArray(data.skippedDomains) ? data.skippedDomains : []
  if (domains.length === 0) return
  useChromeStore().notify(
    `模式已停用，${domains.length} 类设备不支持状态恢复（${domains.join('/')}）`,
    'info',
  )
}

/** WS 事件入口：只做类型路由。 */
function handleWsHomeMode(payload: unknown) {
  const data = payload as HomeModeWsPayload | null | undefined
  if (!data?.type) return
  if (data.type === 'home_mode_activated') {
    handleModeActivated(data)
  } else if (data.type === 'home_mode_deactivated') {
    handleModeDeactivated(data)
  } else if (data.type === 'home_mode_restore_incomplete') {
    handleRestoreIncomplete(data)
  }
}

async function fetchModes(options: { silent?: boolean } = {}) {
  const showLoading = !options.silent && modes.value.length === 0
  if (showLoading) {
    loading.value = true
    loadError.value = ''
  }
  try {
    const { data } = await fetchHomeModes()
    modes.value = normalizeCrudListResponse(data).rows as HomeModeRow[]
    if (activeMode.value?.id) {
      syncModesActiveFlags(activeMode.value.id)
    }
  } catch (e) {
    if (showLoading || modes.value.length === 0) {
      modes.value = []
      loadError.value = getApiErrorMessage(e, '家庭模式列表加载失败')
    }
  } finally {
    if (showLoading) loading.value = false
  }
}

async function fetchActive() {
  try {
    const { data } = await fetchActiveHomeMode()
    const payload = (data ?? null) as
      | (HomeModeRow & { activeModes?: HomeModeRow[]; activeMode?: HomeModeRow | null })
      | null
    if (!payload) {
      applyActiveModes([])
      return
    }
    const list = Array.isArray(payload.activeModes)
      ? payload.activeModes.filter(Boolean)
      : payload.id
        ? [payload]
        : payload.activeMode
          ? [payload.activeMode]
          : []
    applyActiveModes(list)
  } catch {
    applyActiveModes([])
  }
}

async function activate(modeId: string | number) {
  if (acting.value) return null
  const entities = useEntitiesStore()
  if (!entities.connected || entities.entitiesStale || entities.reconnecting) {
    useChromeStore().notify('Home Assistant 未就绪，暂不可切换家庭模式', 'warning')
    return null
  }
  acting.value = true
  try {
    const targetId = String(modeId)
    const { data } = await activateHomeMode(targetId)
    await fetchActive()
    // 仅以服务端 active / fetchActive 结果为准，避免 HA 离线时误标激活。
    // fetchActive 已带回全部激活模式（多互斥组），这里只按需补一条「响应说激活但列表还没同步」。
    if (data?.active === true) {
      const ids = new Set(activeModes.value.map((mode) => mode.id))
      ids.add(String(data?.modeId ?? targetId))
      syncModesActiveFlags([...ids])
    }

    if (data?.success === false) {
      if (data?.active === true) {
        const failed = Number(data?.failedCount ?? 0)
        useChromeStore().notify(
          data?.error ||
            (failed > 0 ? `模式已激活，${failed} 个设备执行失败` : '模式已激活，但部分设备执行失败'),
          'warning',
        )
        return data
      }
      useChromeStore().notify(data?.error || getApiErrorMessage(null, '模式激活失败'), 'error')
      return null
    }
    return data
  } catch (e) {
    useChromeStore().notify(getApiErrorMessage(e, '模式激活失败'), 'error')
    return null
  } finally {
    acting.value = false
  }
}

async function deactivate(modeId?: string | number) {
  if (acting.value) return null
  acting.value = true
  try {
    const { data } = await deactivateHomeMode(modeId ? String(modeId) : undefined)
    if (data?.restoreIncomplete) {
      // 恢复不完整：服务端仍把模式标为激活并保留快照，界面上不能假装已经退出，
      // 否则用户既看不到「还有设备没恢复」，也失去了重试入口。
      await fetchActive()
      useChromeStore().notify(
        data?.message || '停用未完成：部分设备恢复失败，已保留快照，可重试',
        'warning',
      )
      return data
    }
    // 多互斥组：只移除本条，其余组仍保持激活；最终以服务端列表为准。
    const removedId = String(data?.modeId ?? modeId ?? '')
    if (removedId) {
      activeModes.value = activeModes.value.filter((mode) => mode.id !== removedId)
      activeMode.value = activeModes.value[0] ?? null
    }
    await fetchActive()
    useChromeStore().notify(data?.message || '已退出当前模式', 'info')
    return data
  } catch (e) {
    useChromeStore().notify(getApiErrorMessage(e, '退出模式失败'), 'error')
    return null
  } finally {
    acting.value = false
  }
}

async function seedDefaults() {
  const { data } = await seedHomeModes()
  await fetchModes({ silent: true })
  return data
}

async function createMode(body: Record<string, unknown>) {
  const { data } = await createHomeMode(body)
  await fetchModes({ silent: true })
  return data
}

async function updateMode(modeId: string, body: Record<string, unknown>) {
  const { data } = await updateHomeMode(modeId, body)
  await fetchModes({ silent: true })
  if (activeModes.value.some((mode) => mode.id === modeId)) {
    await fetchActive()
  }
  return data
}

async function deleteMode(modeId: string) {
  await deleteHomeMode(modeId)
  await fetchModes({ silent: true })
  if (activeModes.value.some((mode) => mode.id === modeId)) {
    activeModes.value = activeModes.value.filter((mode) => mode.id !== modeId)
    activeMode.value = activeModes.value[0] ?? null
  }
}

function ensureInitialized() {
  if (initialized) return
  initialized = true
  const entitiesStore = useEntitiesStore()
  wsStop = entitiesStore.onHomeModeEvent?.(handleWsHomeMode) || null
}

export function useHomeModes(options: UseHomeModesOptions = {}) {
  onMounted(async () => {
    ensureInitialized()
    const shouldFetch = subscriberCount === 0
    subscriberCount++
    if (shouldFetch) {
      await Promise.all([fetchModes(), fetchActive()])
    }
    if (options.autoSeed && modes.value.length === 0) {
      try {
        await seedDefaults()
      } catch {
        /* 忽略 */
      }
    }
  })

  onUnmounted(() => {
    subscriberCount = Math.max(0, subscriberCount - 1)
    if (subscriberCount <= 0 && wsStop) {
      wsStop()
      wsStop = null
      initialized = false
      subscriberCount = 0
    }
  })

  return {
    modes,
    activeMode,
    activeModes,
    loading,
    loadError,
    acting,
    fetchModes,
    fetchActive,
    activate,
    deactivate,
    seedDefaults,
    createMode,
    updateMode,
    deleteMode,
  }
}
