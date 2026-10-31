/**
 * @file hub-env.internals.ts
 * @module frontend/src/views
 */
/** rooms / env-health Hub */
import { getEnvSensorFields, useEnvSensorMap } from './env-sensor-map.internals'
import { useRegisterSettingsTabPending, useSettingsHubPending } from '@/composables/settings-kernel/pending.internals'
import { useSettingsSidebarReentryReset } from '@/composables/ui/hub-viewport.internals'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { downloadBlob } from '@/shared/utils/core/misc.util'
import { envRoomTabEmoji } from '@/shared/utils/settings/tab-emoji.util'
import { clonePlain } from '@/shared/utils/core/clone-plain.util'
import { computed, nextTick, ref, watch } from 'vue'

// ── useSettingsEnvHub ──
type SettingsEnvHubTabId = 'rooms' | 'env-health'

/** rooms / env-health 共享 pending 基线，避免双 Tab 各自快照导致状态不一致 */
const sharedEnvSnapshot = ref<Record<string, unknown> | null>(null)

interface UseSettingsEnvHubOptions {
  tabId: SettingsEnvHubTabId
  activeTab: () => string
  saveSuccessMessage: string
}

export function useSettingsEnvHub(options: UseSettingsEnvHubOptions) {
  const { tabId, activeTab, saveSuccessMessage } = options
  const chrome = useChromeStore()
  const entitiesStore = useEntitiesStore()
  const roomsSection = ref('catalog')
  const bindingsEnvTab = ref('rooms')
  const envRoomTab = ref('')

  const envSensorFieldList = computed(() =>
    Object.values(getEnvSensorFields()).map((field) => ({
      ...field,
      shortLabel:
        field.key === 'temperature'
          ? '温度'
          : field.key === 'humidity'
            ? '湿度'
            : field.key === 'pm25'
              ? 'PM2.5'
              : field.key === 'co2'
                ? 'CO₂'
                : 'TVOC',
    })),
  )

  const {
    sensorMap,
    roomList: envRoomList,
    loading: envLoading,
    saving: envSaving,
    load: loadEnvMap,
    save: saveEnvMap,
    applyInference,
    removeRoom: removeEnvRoom,
    restoreHiddenRooms,
    hiddenRoomCount,
    exportCsv: exportEnvCsvFn,
    importCsv: importEnvCsvFn,
    refreshHaAreas,
    registryDegraded,
    registryError,
  } = useEnvSensorMap()

  const {
    pendingCount: envPendingChanges,
    takeSnapshot: takeEnvSnapshot,
    confirmAndRevert,
    revertSilently: revertEnvSilently,
    runHubMount,
  } = useSettingsHubPending({
    snapshot: sharedEnvSnapshot,
    current: () => sensorMap.value,
    ready: () => sharedEnvSnapshot.value != null,
    applyBaseline: (baseline) => {
      const next = clonePlain(baseline || {})
      for (const key of Object.keys(sensorMap.value)) {
        delete sensorMap.value[key]
      }
      Object.assign(sensorMap.value, next)
    },
  })

  // 第三参数：确认离开后真正回滚房间映射草稿
  useRegisterSettingsTabPending(tabId, () => envPendingChanges.value > 0, revertEnvSilently)

  const bindingsEnvTabs = computed(() => [
    {
      id: 'rooms',
      label: '房间传感器',
      emoji: '📍',
      accent: '#34d399',
      count: envRoomList.value.length || undefined,
    },
    { id: 'io', label: '导入导出', emoji: '✨', accent: '#fbbf24' },
  ])

  const envRoomTabs = computed(() =>
    envRoomList.value.map((room) => ({
      id: room.id,
      label: sensorMap.value[room.id]?.label?.trim() || room.defaultLabel,
      emoji: envRoomTabEmoji(room.id),
      accent: room.fixed ? '#34d399' : '#38bdf8',
    })),
  )

  const activeEnvRoom = computed(() => envRoomList.value.find((room) => room.id === envRoomTab.value))

  const roomsSubnavSections = computed(() => [
    {
      id: 'catalog',
      label: '房间目录',
      emoji: '📋',
      accent: '#34d399',
      badge: envRoomList.value.length || '',
    },
    { id: 'scopes', label: '应用范围', emoji: '🔗', accent: '#38bdf8' },
  ])

  watch(envRoomTabs, (tabs) => {
    if (!tabs.length) {
      if (envRoomTab.value) envRoomTab.value = ''
      return
    }
    if (!tabs.some((tabEntry) => tabEntry.id === envRoomTab.value)) {
      envRoomTab.value = tabs[0].id
    }
  })

  function focusEnvRoomTab(roomId: string | undefined) {
    const tabs = envRoomList.value
    if (!tabs.length) {
      envRoomTab.value = ''
      return
    }
    if (roomId && tabs.some((tabEntry) => tabEntry.id === roomId)) {
      envRoomTab.value = roomId
      return
    }
    envRoomTab.value = tabs[0].id
  }

  function resetEnvHubTabs() {
    if (tabId === 'rooms') roomsSection.value = 'catalog'
    bindingsEnvTab.value = 'rooms'
    focusEnvRoomTab(envRoomList.value[0]?.id)
  }

  useSettingsSidebarReentryReset(activeTab, tabId, resetEnvHubTabs)

  function snapshotEnvConfig() {
    takeEnvSnapshot(sensorMap.value)
  }

  async function handleRemoveEnvRoom(roomId: string | undefined) {
    const room = envRoomList.value.find((candidateRoom) => candidateRoom.id === (roomId || activeEnvRoom.value?.id))
    if (!room) return
    const label = sensorMap.value[room.id]?.label?.trim() || room.defaultLabel
    const ok = await chrome.confirm(
      `确定隐藏房间「${label}」？隐藏后可通过「恢复隐藏」找回，传感器绑定会保留。`,
      '隐藏房间',
      { confirmText: '隐藏', type: 'danger' },
    )
    if (!ok) return
    const removedId = room.id
    const removedIdx = envRoomList.value.findIndex((roomEntry) => roomEntry.id === removedId)
    if (!removeEnvRoom(removedId)) return
    await nextTick()
    const tabs = envRoomList.value
    if (!tabs.length) {
      envRoomTab.value = ''
    } else {
      const nextIdx = Math.min(removedIdx >= 0 ? removedIdx : 0, tabs.length - 1)
      envRoomTab.value = tabs[nextIdx].id
    }
    chrome.notify(`已隐藏房间「${label}」`, 'info')
  }

  function handleRestoreHiddenRooms() {
    const restoredCount = restoreHiddenRooms()
    if (!restoredCount) {
      chrome.notify('没有可恢复的隐藏房间', 'info')
      return
    }
    focusEnvRoomTab(envRoomList.value[0]?.id)
    chrome.notify(`已恢复 ${restoredCount} 个隐藏房间`, 'success')
  }

  function inferEnvMap() {
    const { matchedCount } = applyInference(entitiesStore.entities)
    chrome.notify(
      matchedCount
        ? `智能推断完成，已自动匹配 ${matchedCount} 个实体（含环境传感器与快捷规则设备），请核对后保存`
        : '未找到可匹配的实体，可尝试检查实体的 area_id 或 device_class 属性',
      matchedCount ? 'success' : 'info',
    )
  }

  function exportEnvCsv() {
    const blob = new Blob([exportEnvCsvFn()], { type: 'text/csv;charset=utf-8' })
    downloadBlob(blob, `env-sensors-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  async function onEnvCsvFile(ev: Event) {
    const input = ev.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      const importedCount = importEnvCsvFn(await file.text())
      chrome.notify(`已导入 ${importedCount} 个房间映射，请核对后保存`, 'success')
    } catch (error) {
      chrome.notify((error as { message?: string })?.message || 'CSV 解析失败', 'error')
    }
  }

  async function cancelEnvChanges() {
    await confirmAndRevert(chrome, (baseline) => {
      const next = clonePlain(baseline || {})
      for (const key of Object.keys(sensorMap.value)) {
        delete sensorMap.value[key]
      }
      Object.assign(sensorMap.value, next)
      focusEnvRoomTab(envRoomList.value[0]?.id)
    })
  }

  async function saveEnvMapWithNotify() {
    const ok = await saveEnvMap()
    if (ok) snapshotEnvConfig()
    chrome.notify(ok ? saveSuccessMessage : '保存失败，请稍后重试', ok ? 'success' : 'error')
    return ok
  }

  runHubMount({
    mountKey: 'env-hub',
    syncLayout: 'first-only',
    init: async () => {
      await loadEnvMap()
      focusEnvRoomTab(envRoomTab.value)
    },
    afterMount: () => {
      if (sharedEnvSnapshot.value == null) {
        snapshotEnvConfig()
      }
    },
  })

  async function refreshHaAreasFromHa() {
    const count = await refreshHaAreas()
    chrome.notify(
      count ? `已同步 ${count} 个 HA 区域` : '未能获取 HA 区域列表',
      count ? 'success' : 'warning',
    )
  }

  return {
    roomsSection,
    bindingsEnvTab,
    envRoomTab,
    envLoading,
    envSaving,
    envPendingChanges,
    envRoomList,
    bindingsEnvTabs,
    envRoomTabs,
    activeEnvRoom,
    sensorMap,
    envSensorFieldList,
    roomsSubnavSections,
    hiddenRoomCount,
    handleRemoveEnvRoom,
    handleRestoreHiddenRooms,
    inferEnvMap,
    exportEnvCsv,
    onEnvCsvFile,
    saveEnvMapWithNotify,
    cancelEnvChanges,
    refreshHaAreas: refreshHaAreasFromHa,
    registryDegraded,
    registryError,
  }
}

