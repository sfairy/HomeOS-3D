/**
 * @file env-sensor-map.internals.ts
 * @module frontend/src/views
 */
/** 环境传感器映射组合式函数 */
import { useSettingsSave } from '@/composables/settings-kernel/save.internals'
import {
  fetchSystemConfigFresh,
  isSystemConfigConflictError,
  patchSystemConfig,
  useSystemConfig,
} from '@/composables/config/system-config-core.internals'
import { fetchAreasList } from '@/services/api/entities'
import { useChromeStore } from '@/stores/chrome.store'
import type { EntitiesMap } from '@/shared/types/entity-store'
import { reloadFrontendConfig } from '@/shared/utils/config/frontend-config'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { logger } from '@/shared/utils/core/logger'
import { invalidateSharedFetchPrefix } from '@/shared/utils/core/poll-scheduler'
import { ENV_IAQ_CACHE_PREFIX } from './env-iaq.constants'
import type { HaAreaRef } from '@homeos/shared'
import { buildRoomListFromHaAreas, filterEnvSensorMapToKnownAreas } from '@homeos/shared'
import { computed, ref } from 'vue'
import {
  buildRoomList,
  ensureSensorMap,
  exportEnvSensorMapCsv,
  getEnvSensorFields,
  importEnvSensorMapCsv,
  inferEnvSensorMap,
  normalizeEntry,
  serializeEnvSensorMapForPersist,
} from '@/features/settings/composables/env-sensor-map-util.internals'

// ── useEnvSensorMap ──
let envSensorMapSingleton: ReturnType<typeof createEnvSensorMapState> | null = null

/** 创建环境传感器映射单例状态：聚合 HA 区域列表、传感器映射表、房间列表与持久化能力，供 rooms / env-health / 首装向导共享 */
function createEnvSensorMapState() {
  const haAreas = ref<HaAreaRef[]>([])
  const registryDegraded = ref(false)
  const registryError = ref<string | null>(null)
  const sensorFields = computed(() => getEnvSensorFields())
  const sensorMap = ref(ensureSensorMap({}))
  const roomList = ref(buildRoomList({}))
  const initialized = ref(false)

  function syncRoomList() {
    roomList.value = buildRoomList(sensorMap.value, haAreas.value)
    sensorMap.value = ensureSensorMap(sensorMap.value, roomList.value)
  }

  async function refreshHaAreas() {
    try {
      const { data } = await fetchAreasList<{
        areas?: HaAreaRef[]
        registryDegraded?: boolean
        registryError?: string | null
      }>()
      const rows = Array.isArray(data?.areas) ? data.areas : []
      registryDegraded.value = Boolean(data?.registryDegraded)
      registryError.value = data?.registryError ? String(data.registryError) : null
      haAreas.value = rows
        .map((row) => ({
          id: String(row.id || '').trim(),
          name: String(row.name || row.id || '').trim(),
        }))
        .filter((row) => row.id)
      if (data?.registryDegraded && !rows.length) {
        logger.warn('HA 区域注册表不可用,环境传感器映射将缺少 HA 区域列表')
      }
      sensorMap.value = ensureSensorMap(
        filterEnvSensorMapToKnownAreas(sensorMap.value, haAreas.value),
      )
      syncRoomList()
      return haAreas.value.length
    } catch {
      haAreas.value = []
      return 0
    }
  }

  const loading = ref(false)
  const chrome = useChromeStore()
  const { saving, runSave } = useSettingsSave()
  const { load: loadSystemConfig } = useSystemConfig()

  async function load(opts?: { force?: boolean }) {
    if (initialized.value && !opts?.force) return
    loading.value = true
    try {
      await refreshHaAreas()
      const data = await loadSystemConfig({ force: Boolean(opts?.force) })
      const filtered = filterEnvSensorMapToKnownAreas(data?.envSensorMap || {}, haAreas.value)
      sensorMap.value = ensureSensorMap(filtered, buildRoomListFromHaAreas(haAreas.value, filtered))
      syncRoomList()
      initialized.value = true
    } catch (e) {
      logger.error('加载环境传感器映射失败', e)
      chrome.notify(getApiErrorMessage(e, '加载环境传感器映射失败'), 'error')
      sensorMap.value = ensureSensorMap({})
      syncRoomList()
    } finally {
      loading.value = false
    }
  }

  function applyInference(entities: EntitiesMap) {
    const { result, matchedCount } = inferEnvSensorMap(entities, sensorMap.value, haAreas.value)
    sensorMap.value = result
    syncRoomList()
    return { sensorMap: sensorMap.value, matchedCount }
  }

  function hideRoom(roomId: string) {
    const room = roomList.value.find((r) => r.id === roomId)
    if (!room) return false
    sensorMap.value = {
      ...sensorMap.value,
      [roomId]: {
        ...normalizeEntry(sensorMap.value[roomId] || {}, room.defaultLabel),
        _hidden: true,
      },
    }
    syncRoomList()
    return true
  }

  function removeRoom(roomId: string) {
    return hideRoom(roomId)
  }

  function restoreHiddenRooms() {
    const next = { ...sensorMap.value }
    let restored = 0
    for (const [roomId, entryRaw] of Object.entries(next)) {
      const entry = entryRaw
      if (!entry?._hidden) continue
      const room = haAreas.value.find((area) => area.id === roomId)
      next[roomId] = normalizeEntry({}, room?.name || entry?.label || roomId)
      restored++
    }
    if (!restored) return 0
    sensorMap.value = ensureSensorMap(next, buildRoomList(next, haAreas.value))
    syncRoomList()
    return restored
  }

  const hiddenRoomCount = computed(
    () => Object.values(sensorMap.value).filter((entry) => entry?._hidden === true).length,
  )

  const activeRoom = computed(() => roomList.value)

  async function save() {
    return runSave(
      async () => {
        const persist = async () => {
          const filtered = filterEnvSensorMapToKnownAreas(sensorMap.value, haAreas.value)
          const cleaned = serializeEnvSensorMapForPersist(filtered)
          await patchSystemConfig({ envSensorMap: cleaned })
          sensorMap.value = ensureSensorMap(cleaned, buildRoomListFromHaAreas(haAreas.value, cleaned))
          syncRoomList()
          invalidateSharedFetchPrefix(ENV_IAQ_CACHE_PREFIX)
          void reloadFrontendConfig().catch((err) => logger.debug('环境传感器保存后刷新配置失败', err))
          return true
        }
        try {
          return await persist()
        } catch (e) {
          // HA 后台同步等会 bump revision：保留本地编辑，仅刷新乐观锁后重试一次
          if (!isSystemConfigConflictError(e)) throw e
          const localMap = serializeEnvSensorMapForPersist(
            filterEnvSensorMapToKnownAreas(sensorMap.value, haAreas.value),
          )
          await fetchSystemConfigFresh()
          await patchSystemConfig({ envSensorMap: localMap })
          sensorMap.value = ensureSensorMap(localMap, buildRoomListFromHaAreas(haAreas.value, localMap))
          syncRoomList()
          invalidateSharedFetchPrefix(ENV_IAQ_CACHE_PREFIX)
          void reloadFrontendConfig().catch((err) => logger.debug('环境传感器保存后刷新配置失败', err))
          return true
        }
      },
      {
        onError: async (e: unknown) => {
          if (isSystemConfigConflictError(e)) {
            await load({ force: true })
            return
          }
          chrome.notify(getApiErrorMessage(e, '保存环境传感器映射失败'), 'error')
          logger.error('保存环境传感器映射失败', e)
        },
      },
    )
  }

  function exportCsv() {
    return exportEnvSensorMapCsv(roomList.value, sensorMap.value)
  }

  function importCsv(text: string) {
    const {
      sensorMap: nextMap,
      roomList: nextList,
      count,
    } = importEnvSensorMapCsv(text, sensorMap.value, haAreas.value)
    sensorMap.value = nextMap
    roomList.value = nextList
    return count
  }

  function syncRoomEntries() {
    sensorMap.value = ensureSensorMap(sensorMap.value, roomList.value)
  }

  return {
    sensorMap,
    roomList,
    haAreas,
    registryDegraded,
    registryError,
    activeRoom,
    loading,
    saving,
    initialized,
    load,
    save,
    applyInference,
    removeRoom,
    hideRoom,
    restoreHiddenRooms,
    hiddenRoomCount,
    exportCsv,
    importCsv,
    syncRoomEntries,
    refreshHaAreas,
    sensorFields,
  }
}

/** rooms / env-health / 首装向导共享同一 envSensorMap 实例，避免 Tab 切换时状态分裂 */
export function useEnvSensorMap() {
  if (!envSensorMapSingleton) {
    envSensorMapSingleton = createEnvSensorMapState()
  }
  return envSensorMapSingleton
}

export {
  getEnvSensorFields,
  getQuickRuleFields,
} from '@/features/settings/composables/env-sensor-map-util.internals'
