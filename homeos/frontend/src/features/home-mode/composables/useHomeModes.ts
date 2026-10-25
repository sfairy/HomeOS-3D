/**
 * @file useHomeModes.ts
 * @module frontend/src/composables
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

const modes = ref<HomeModeRow[]>([])
const activeModes = ref<HomeModeRow[]>([])
const activeMode = ref<HomeModeRow | null>(null)
const loading = ref(false)
const loadError = ref<string>('')
const acting = ref(false)
let initialized = false
let wsStop: (() => void) | null = null
let subscriberCount = 0

function syncModesActiveFlags(activeIds: string | string[] | null) {
  const ids = new Set(
    activeIds == null ? [] : Array.isArray(activeIds) ? activeIds.map(String) : [String(activeIds)],
  )
  modes.value = modes.value.map((m) => ({ ...m, isActive: ids.has(m.id) }))
}

/** 用服务端返回的激活模式列表刷新本地状态（多互斥组可同时激活）。 */
function applyActiveModes(list: HomeModeRow[]) {
  activeModes.value = list
  activeMode.value = list[0] ?? null
  syncModesActiveFlags(list.map((m) => m.id))
}

function handleWsHomeMode(payload: unknown) {
  const data = payload as HomeModeWsPayload | null | undefined
  if (!data?.type) return
  if (data.type === 'home_mode_activated') {
    fetchActive()
    if (data.modeId) {
      syncModesActiveFlags(data.modeId)
    }
    if (data.modeName) {
      const total = data.totalCount ?? 0
      const success = data.successCount ?? 0
      const failedCount = total > 0 ? total - success : 0
      if (failedCount > 0) {
        useChromeStore().notify(
          `模式「${data.modeName}」已激活，${failedCount} 个设备执行失败`,
          'warning',
        )
      } else {
        useChromeStore().notify(`模式已激活：${data.modeName}`, 'success')
      }
    }
  } else if (data.type === 'home_mode_deactivated') {
    // 多互斥组：只移除对应项，另一个组的激活态必须保留。
    const hasRemaining = Array.isArray(data.remainingActiveModeIds)
    const hasModeId = typeof data.modeId === 'string' && data.modeId.length > 0
    if (!hasRemaining && !hasModeId) {
      applyActiveModes([])
    } else {
      const remaining = hasRemaining
        ? (data.remainingActiveModeIds as string[]).map(String)
        : activeModes.value.filter((m) => m.id !== data.modeId).map((m) => m.id)
      const remainingSet = new Set(remaining)
      activeModes.value = activeModes.value.filter((m) => remainingSet.has(m.id))
      activeMode.value = activeModes.value[0] ?? null
      syncModesActiveFlags(remaining)
    }
  } else if (data.type === 'home_mode_restore_incomplete') {
    const domains = Array.isArray(data.skippedDomains) ? data.skippedDomains : []
    if (domains.length > 0) {
      useChromeStore().notify(
        `模式已停用，${domains.length} 类设备不支持状态恢复（${domains.join('/')}）`,
        'info',
      )
    }
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

async function activate(id: string | number) {
  if (acting.value) return null
  const entities = useEntitiesStore()
  if (!entities.connected || entities.entitiesStale || entities.reconnecting) {
    useChromeStore().notify('Home Assistant 未就绪，暂不可切换家庭模式', 'warning')
    return null
  }
  acting.value = true
  try {
    const modeId = String(id)
    const { data } = await activateHomeMode(modeId)
    await fetchActive()
    // 仅以服务端 active / fetchActive 结果为准，避免 HA 离线时误标激活。
    // fetchActive 已带回全部激活模式（多互斥组），这里只按需补一条「响应说激活但列表还没同步」。
    if (data?.active === true) {
      const ids = new Set(activeModes.value.map((m) => m.id))
      ids.add(String(data?.modeId ?? modeId))
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
      activeModes.value = activeModes.value.filter((m) => m.id !== removedId)
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

async function updateMode(id: string, body: Record<string, unknown>) {
  const { data } = await updateHomeMode(id, body)
  await fetchModes({ silent: true })
  if (activeModes.value.some((m) => m.id === id)) {
    await fetchActive()
  }
  return data
}

async function deleteMode(id: string) {
  await deleteHomeMode(id)
  await fetchModes({ silent: true })
  if (activeModes.value.some((m) => m.id === id)) {
    activeModes.value = activeModes.value.filter((m) => m.id !== id)
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
