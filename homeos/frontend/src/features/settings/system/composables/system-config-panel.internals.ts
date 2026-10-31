/**
 * @file system-config-panel.internals.ts
 * @module frontend/src/views
 */
/** composables：useSystemConfigPanel */
import { writeLocalStorage } from '@/shared/utils/core/local-storage.util'
import {
  DEV_KEYS_STORAGE_KEY,
  readDevKeysPref,
  readExpertModePref,
  writeExpertModePref,
} from '@/features/settings/system/composables/system-config-panel-prefs.internals'
import { useSettingsHubRouteSection } from '@/features/settings/shared/composables/hub-ui.internals'
import { useSettingsSave } from '@/composables/settings-kernel/save.internals'
import { fetchConfigAudit } from '@/services/api/system'
import { useChromeStore } from '@/stores/chrome.store'
import type { SystemConfig, SystemConfigLoadOptions } from '@/shared/types/system-config'
import type { EditableConfigSection } from '@/shared/types/system-config-editor'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { logger } from '@/shared/utils/core/logger'
import { useAppConfigBackup } from '@/features/settings/shared/composables/hub-backup-orchestrator.internals'
import { countSystemConfigPendingChanges, fromEditableSections, getSystemConfigPendingFieldKeys, getSystemConfigSectionPendingMap, toEditableSections } from '@/composables/config/system-config-edit.util'
import { filterSectionsForExpert } from '@/shared/utils/config/system-config/expert.util'
import type { Ref } from 'vue'
import { computed, ref, watch } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { categoryForSection, useSystemConfig } from '@/composables/config/system-config-core.internals'
import { createSystemConfigFieldHelpers } from '@/features/settings/system/composables/system-config-panel-fields.internals'
import { useSystemConfigPanelIo } from '@/features/settings/system/composables/system-config-panel-io.internals'
import { createSystemConfigPanelNav } from '@/features/settings/system/composables/system-config-panel-nav.internals'
import { useSystemConfigPanelSearch } from '@/features/settings/system/composables/system-config-panel-search.internals'

type ConfigAuditEntry = {
  at?: string
  action?: string
  sections?: string[]
  [key: string]: unknown
}

type ConfigValidationError = {
  section: string
  key: string
  message?: string
}

type SystemConfigPanelParams = {
  route: RouteLocationNormalizedLoaded
  paramsDockRef: Ref<{ selectSection: (section: string) => void } | null | undefined>
}

// ── useSystemConfigPanel ──
/** 高级运行参数面板：加载 / 保存 / 导入导出 / 重置 / 搜索派生 */
export function useSystemConfigPanel({ route, paramsDockRef }: SystemConfigPanelParams) {
  const chrome = useChromeStore()
  const { saving, runSave } = useSettingsSave()
  const {
    load: loadSystemConfig,
    save: saveSystemConfig,
    invalidate: invalidateSystemConfig,
  } = useSystemConfig()
  const configAudit = ref<ConfigAuditEntry[]>([])
  const validationErrors = ref<ConfigValidationError[]>([])
  const loading = ref(false)
  const loadError = ref('')
  const savedTip = ref<string>('')
  const savedTipOk = ref(true)
  const sectionList = ref<EditableConfigSection[]>([])
  const savedSnapshot = ref<string | null>(null)
  const activeSection = ref('frontend')
  const activeCategory = ref('display')
  const globalSearch = ref<string>('')
  const sectionFilter = ref<string>('')
  const showDevKeys = ref(readDevKeysPref())
  const expertMode = ref(readExpertModePref())

  watch(showDevKeys, (enabled) => {
    try {
      writeLocalStorage(DEV_KEYS_STORAGE_KEY, enabled ? '1' : '0')
    } catch {
      /* 忽略 */
    }
  })
  let loaded = false

  const visibleSectionList = computed(() =>
    filterSectionsForExpert(sectionList.value, expertMode.value),
  )

  const paramsSectionNav = computed(() =>
    visibleSectionList.value.map((section) => ({ id: section.key, label: section.label })),
  )

  const {
    appConfigExporting: exporting,
    appConfigImporting: importing,
    exportAppConfig,
    importAppConfigFromText,
  } = useAppConfigBackup({ notify: false })

  const totalFields = computed(() =>
    visibleSectionList.value.reduce((total, section) => total + section.fields.length, 0),
  )

  const currentSection = computed(
    () =>
      visibleSectionList.value.find((section) => section.key === activeSection.value) ||
      visibleSectionList.value[0] ||
      null,
  )

  const { sectionLabel, fieldLabel, fieldHint, fieldId, searchFieldId } =
    createSystemConfigFieldHelpers(() => currentSection.value?.key)

  const { isSearchMode, searchResults, searchMatchMap, filteredSectionFields } = useSystemConfigPanelSearch({
    globalSearch,
    sectionFilter,
    visibleSectionList,
    currentSection,
  })

  const booleanFields = computed(() =>
    filteredSectionFields.value.filter((field) => field.type === 'boolean'),
  )
  const inputFields = computed(() =>
    filteredSectionFields.value.filter((field) => field.type !== 'boolean'),
  )

  const groupedDisplayFields = computed(() => {
    const rows = []
    if (booleanFields.value.length) {
      rows.push({ kind: 'header', key: 'hdr-bool', label: '功能开关' })
      for (const field of booleanFields.value) {
        rows.push({ kind: 'field', key: field.key, field })
      }
    }
    if (inputFields.value.length) {
      if (booleanFields.value.length) {
        rows.push({ kind: 'header', key: 'hdr-input', label: '数值与配置' })
      }
      for (const field of inputFields.value) {
        rows.push({ kind: 'field', key: field.key, field })
      }
    }
    return rows
  })

  const pendingChanges = computed(() =>
    countSystemConfigPendingChanges(sectionList.value, savedSnapshot.value),
  )

  const pendingFieldKeys = computed(() =>
    getSystemConfigPendingFieldKeys(sectionList.value, savedSnapshot.value),
  )

  const sectionPendingMap = computed(() =>
    getSystemConfigSectionPendingMap(sectionList.value, savedSnapshot.value),
  )

  const visibleSectionPendingMap = computed(() => {
    const visibleKeys = new Set(visibleSectionList.value.map((section) => section.key))
    const map: Record<string, number> = {}
    for (const [sk, count] of Object.entries(sectionPendingMap.value)) {
      if (visibleKeys.has(sk)) map[sk] = count
    }
    return map
  })

  const hiddenPendingCount = computed(() => {
    const standardSections = filterSectionsForExpert(sectionList.value, false)
    const visibleFieldKeys = new Set(
      standardSections.flatMap((section) => section.fields.map((field) => `${section.key}:${field.key}`)),
    )
    let count = 0
    for (const key of pendingFieldKeys.value) {
      if (!visibleFieldKeys.has(key)) count++
    }
    return count
  })

  const pendingChangesHint = computed(() => {
    if (!expertMode.value && hiddenPendingCount.value > 0) {
      return `含 ${hiddenPendingCount.value} 项专家参数（开启专家模式可见）`
    }
    return '仅提交已修改的分区，未改动的分区不会被覆盖'
  })

  const sectionNavIndex = computed(() =>
    visibleSectionList.value.findIndex((section) => section.key === activeSection.value),
  )

  const hasPrevSection = computed(() => sectionNavIndex.value > 0)
  const hasNextSection = computed(
    () => sectionNavIndex.value >= 0 && sectionNavIndex.value < visibleSectionList.value.length - 1,
  )

  function isFieldPending(sectionKey: string, fieldKey: string) {
    return pendingFieldKeys.value.has(`${sectionKey}:${fieldKey}`)
  }

  function navigateSection(delta: number) {
    const list = visibleSectionList.value
    const idx = list.findIndex((section) => section.key === activeSection.value)
    const next = list[idx + delta]
    if (!next) return
    sectionFilter.value = ''
    paramsDockRef.value?.selectSection(next.key)
  }

  function goPrevSection() {
    navigateSection(-1)
  }

  function goNextSection() {
    navigateSection(1)
  }

  watch(activeSection, () => {
    sectionFilter.value = ''
  })

  async function setExpertMode(enabled: boolean) {
    if (!enabled && expertMode.value && hiddenPendingCount.value > 0) {
      const ok = await chrome.confirm(
        `还有 ${hiddenPendingCount.value} 项专家参数未保存，切换后将无法在侧栏直接看到这些修改。是否继续？`,
        '切换为标准模式',
        { confirmText: '继续', cancelText: '留在专家模式' },
      )
      if (!ok) return
    }
    expertMode.value = enabled
    writeExpertModePref(enabled)
    if (!visibleSectionList.value.some((section) => section.key === activeSection.value)) {
      activeSection.value = visibleSectionList.value[0]?.key || ''
      activeCategory.value = categoryForSection(activeSection.value)
    }
  }

  const { navigateToValidationError, applyParamsSection, applySectionFromRoute } =
    createSystemConfigPanelNav({
      route,
      globalSearch,
      sectionList,
      visibleSectionList,
      expertMode,
      activeSection,
      activeCategory,
      setExpertMode,
    })

  useSettingsHubRouteSection(activeSection, paramsSectionNav, {
    tabId: 'params',
    when: () => loaded && !loading.value,
    onApply: applyParamsSection,
  })

  async function loadAudit(fallbackFromConfig: unknown) {
    if (Array.isArray(fallbackFromConfig)) {
      configAudit.value = fallbackFromConfig as ConfigAuditEntry[]
      return
    }
    try {
      const { data } = await fetchConfigAudit()
      configAudit.value = Array.isArray(data) ? data : []
    } catch (error) {
      logger.warn('加载配置审计日志失败', error)
      configAudit.value = []
      chrome.notify(getApiErrorMessage(error, '加载配置审计日志失败'), 'warning')
    }
  }

  function captureSnapshot() {
    savedSnapshot.value = JSON.stringify(fromEditableSections(sectionList.value))
  }

  async function load({ force = false }: SystemConfigLoadOptions = {}) {
    loading.value = true
    loadError.value = ''
    try {
      const data = await loadSystemConfig({ force })
      sectionList.value = toEditableSections(data as SystemConfig)
      await loadAudit(data?._configAudit)
      captureSnapshot()
      loaded = true
      if (
        !route.query.section &&
        !visibleSectionList.value.some((section) => section.key === activeSection.value)
      ) {
        activeSection.value =
          visibleSectionList.value.find((section) => section.key === 'screensaver')?.key ||
          visibleSectionList.value.find((section) => section.key === 'ui')?.key ||
          visibleSectionList.value[0]?.key ||
          ''
      }
      activeCategory.value = categoryForSection(activeSection.value)
    } catch (error) {
      logger.error('加载系统参数失败', error)
      sectionList.value = []
      loaded = false
      loadError.value = getApiErrorMessage(error, '加载系统参数失败')
    } finally {
      loading.value = false
    }
    if (loaded && route.query.section) {
      await applySectionFromRoute()
    }
  }

  const {
    configConflict,
    reload,
    ensureLoaded,
    exportConfig,
    onImportFileFromBar,
    save,
    onResetSection,
    onResetAll,
    cancelChanges,
  } = useSystemConfigPanelIo({
    chrome,
    runSave,
    load,
    getLoaded: () => loaded,
    setLoaded: (value) => {
      loaded = value
    },
    invalidateSystemConfig,
    saveSystemConfig,
    loadAudit,
    captureSnapshot,
    sectionLabel,
    sectionList,
    pendingChanges,
    pendingFieldKeys,
    validationErrors,
    savedTip,
    savedTipOk,
    loadError,
    savedSnapshot,
    exportAppConfig,
    importAppConfigFromText,
  })

  return {
    configAudit,
    validationErrors,
    loading,
    loadError,
    saving,
    savedTip,
    savedTipOk,
    configConflict,
    sectionList,
    visibleSectionList,
    activeSection,
    activeCategory,
    globalSearch,
    sectionFilter,
    showDevKeys,
    expertMode,
    exporting,
    importing,
    totalFields,
    currentSection,
    isSearchMode,
    searchResults,
    searchMatchMap,
    booleanFields,
    inputFields,
    filteredSectionFields,
    groupedDisplayFields,
    pendingChanges,
    pendingFieldKeys,
    sectionPendingMap,
    visibleSectionPendingMap,
    hiddenPendingCount,
    pendingChangesHint,
    hasPrevSection,
    hasNextSection,
    isFieldPending,
    goPrevSection,
    goNextSection,
    sectionLabel,
    fieldLabel,
    fieldHint,
    fieldId,
    searchFieldId,
    load,
    reload,
    save,
    cancelChanges,
    exportConfig,
    onImportFileFromBar,
    onResetSection,
    onResetAll,
    setExpertMode,
    navigateToValidationError,
    ensureLoaded,
  }
}
