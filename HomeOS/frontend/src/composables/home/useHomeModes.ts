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
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { normalizeCrudListResponse } from '@/utils/orchestrator/sync-issues.util'

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
}

interface UseHomeModesOptions {
  autoSeed?: boolean
}

const modes = ref<HomeModeRow[]>([])
const activeMode = ref<HomeModeRow | null>(null)
const loading = ref(false)
const loadError = ref<string>('')
const acting = ref(false)
let initialized = false
let wsStop: (() => void) | null = null
let subscriberCount = 0

function syncModesActiveFlags(activeId: string | null) {
  modes.value = modes.value.map((m) => ({
    ...m,
    isActive: activeId != null && m.id === activeId,
  }))
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
    activeMode.value = null
    syncModesActiveFlags(null)
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
    activeMode.value = (data as HomeModeRow) || null
  } catch {
    activeMode.value = null
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
    // 仅以服务端 active / fetchActive 结果为准，避免 HA 离线时误标激活
    const resolvedId =
      data?.active === true
        ? (activeMode.value?.id ?? data?.modeId ?? modeId)
        : (activeMode.value?.id ?? null)
    syncModesActiveFlags(resolvedId)

    if (data?.success === false) {
      if (data?.active === true) {
        useChromeStore().notify(
          data?.error || '模式已激活，但部分设备执行失败',
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

async function deactivate() {
  if (acting.value) return null
  acting.value = true
  try {
    const { data } = await deactivateHomeMode()
    activeMode.value = null
    syncModesActiveFlags(null)
    useChromeStore().notify('已退出当前模式', 'info')
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
  if (activeMode.value?.id === id) {
    await fetchActive()
  }
  return data
}

async function deleteMode(id: string) {
  await deleteHomeMode(id)
  await fetchModes({ silent: true })
  if (activeMode.value?.id === id) {
    activeMode.value = null
  }
}

function ensureInitialized() {
  if (initialized) return
  initialized = true
  const entitiesStore = useEntitiesStore()
  wsStop = entitiesStore.onHomeModeEvent?.(handleWsHomeMode) || null
}

/** useHomeModes：函数，按签名入参返回处理结果。 */
export function useHomeModes(options: UseHomeModesOptions = {}) {
  const auth = useAuthStore()
  const canControl = () => auth.canManageHousehold()

  onMounted(async () => {
    ensureInitialized()
    const shouldFetch = subscriberCount === 0
    subscriberCount++
    if (shouldFetch) {
      await Promise.all([fetchModes(), fetchActive()])
    }
    if (options.autoSeed && modes.value.length === 0 && auth.role === 'admin') {
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
    loading,
    loadError,
    acting,
    canControl,
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
