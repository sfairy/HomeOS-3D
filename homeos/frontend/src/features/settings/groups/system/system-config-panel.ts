/**
 * 高级参数面板：偏好、字段渲染、导航、搜索、导入导出。
 *
 * 曾按 hooks 习惯拆成 6 个 .internals.ts（文件名只说「内部实现」，不说做什么），
 * 它们服务同一个面板 → 合并为一个实现文件。
 */

import { readLocalStorageFlag, writeLocalStorage } from '@/kernel/core/local-storage'
import type {
  EditableConfigField,
  EditableConfigSection,
  SystemConfig,
  SystemConfigLoadOptions,
} from '@/kernel/system-config'
import {
  resolveSystemConfigFieldLabel,
  systemConfigFieldHint,
  systemConfigFieldMatchesQuery,
  filterSectionsForExpert,
} from '@/kernel/config/system-config'
import {
  getSectionLabels,
  categoryForSection,
  fetchSystemConfigFresh,
  handleSystemConfigPatchError,
  useSystemConfig,
} from '@/domain/layout/system-config-core'
import { nextTick, type Ref, computed, ref, watch } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import {
  filterPricingSectionFields,
  applyEditableSnapshotToSections,
  fromEditableSectionsPending,
  countSystemConfigPendingChanges,
  fromEditableSections,
  getSystemConfigPendingFieldKeys,
  getSystemConfigSectionPendingMap,
  toEditableSections,
} from '@/domain/layout/system-config-edit'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { resetSystemConfig, fetchConfigAudit } from '@/kernel/http/index'
import { reloadFrontendConfig } from '@/kernel/config/frontend-config'
import { getApiErrorMessage } from '@/kernel/core/error-message'
import { logger } from '@/kernel/core/logger'
import { useSettingsHubRouteSection, useAppConfigBackup } from '@/features/settings/shared/hub'
import { useSettingsSave } from '@/domain/layout/settings-save'

/**
 * @file system-config-panel-prefs.internals.ts
 * @module frontend/src/views
 */
/** 高级参数面板：专家模式 / 开发键本地偏好 */

const EXPERT_MODE_STORAGE_KEY = 'homeos_params_expert_mode'
export const DEV_KEYS_STORAGE_KEY = 'homeos_params_show_dev_keys'

export function readExpertModePref() {
  try {
    return readLocalStorageFlag(EXPERT_MODE_STORAGE_KEY)
  } catch {
    return false
  }
}

export function readDevKeysPref() {
  try {
    return readLocalStorageFlag(DEV_KEYS_STORAGE_KEY)
  } catch {
    return false
  }
}

export function writeExpertModePref(on: boolean) {
  try {
    writeLocalStorage(EXPERT_MODE_STORAGE_KEY, on ? '1' : '0')
  } catch {
    /* 忽略 */
  }
}

/**
 * @file system-config-panel-fields.internals.ts
 * @module frontend/src/views
 */
/** 高级参数面板：字段标签 / 提示 / DOM id */

export function createSystemConfigFieldHelpers(getActiveSectionKey: () => string | undefined) {
  function sectionLabel(key: string) {
    return getSectionLabels()[key] || '运行参数'
  }

  function fieldLabel(field: EditableConfigField, sectionKey?: string) {
    const sk = sectionKey || getActiveSectionKey()
    return resolveSystemConfigFieldLabel(field.key, sk)
  }

  function fieldHint(field: EditableConfigField, sectionKey?: string) {
    const sk = sectionKey || getActiveSectionKey()
    return systemConfigFieldHint(field.key, sk)
  }

  function fieldId(field: EditableConfigField) {
    return `${getActiveSectionKey()}-${field.key}`
  }

  function searchFieldId(item: { section: EditableConfigSection; field: EditableConfigField }) {
    return `search-${item.section.key}-${item.field.key}`
  }

  return { sectionLabel, fieldLabel, fieldHint, fieldId, searchFieldId }
}

/**
 * @file system-config-panel-nav.internals.ts
 * @module frontend/src/views
 */
/** 高级参数：分区跳转 / 校验定位 */

export function createSystemConfigPanelNav(opts: {
  route: RouteLocationNormalizedLoaded
  globalSearch: Ref<string>
  sectionList: Ref<EditableConfigSection[]>
  visibleSectionList: Ref<EditableConfigSection[]>
  expertMode: Ref<boolean>
  activeSection: Ref<string>
  activeCategory: Ref<string>
  setExpertMode: (on: boolean) => Promise<void>
}) {
  const {
    route,
    globalSearch,
    sectionList,
    visibleSectionList,
    expertMode,
    activeSection,
    activeCategory,
    setExpertMode,
  } = opts
  async function navigateToValidationError(err: { section: string; key: string }) {
    if (!err?.section || !err?.key) return
    globalSearch.value = ''
    await applyParamsSection(err.section)
    await nextTick()
    const el = document.querySelector(`[data-field-id="${err.section}-${err.key}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    if (el instanceof HTMLElement) {
      el.classList.add('params-cell--focus')
      setTimeout(() => el.classList.remove('params-cell--focus'), 2200)
    }
    const input = el?.querySelector('input, textarea, select, button.toggle-btn') as HTMLElement | null
    input?.focus({ preventScroll: true })
  }

  async function applyParamsSection(section: string) {
    if (!sectionList.value.some((s) => s.key === section)) return
    if (!expertMode.value && !visibleSectionList.value.some((s) => s.key === section)) {
      await setExpertMode(true)
      // 用户取消切专家模式时，不要硬切到不可见分区
      if (!expertMode.value && !visibleSectionList.value.some((s) => s.key === section)) return
    }
    activeSection.value = section
    activeCategory.value = categoryForSection(section)
    // 不二次调用 paramsDock.selectSection：侧栏会通过 activeSection watch 展开分类；
    // 路由 onApply 再调 selectSection 会造成「展开又被拽回」的回环感
  }

  async function applySectionFromRoute() {
    const section = route.query.section
    if (typeof section === 'string' && section) await applyParamsSection(section)
  }

  return { navigateToValidationError, applyParamsSection, applySectionFromRoute }
}

/**
 * @file system-config-panel-search.internals.ts
 * @module frontend/src/views
 */
/** 高级参数面板：搜索与字段过滤派生 */

export function useSystemConfigPanelSearch(opts: {
  globalSearch: Ref<string>
  sectionFilter: Ref<string>
  visibleSectionList: Ref<EditableConfigSection[]>
  currentSection: Ref<EditableConfigSection | null>
}) {
  const { globalSearch, sectionFilter, visibleSectionList, currentSection } = opts
  const isSearchMode = computed(() => globalSearch.value.trim().length > 0)

  const searchResults = computed(() => {
    const q = globalSearch.value.trim().toLowerCase()
    if (!q) return []
    const results = []
    for (const section of visibleSectionList.value) {
      for (const field of section.fields) {
        if (systemConfigFieldMatchesQuery(field, q, section.key)) {
          results.push({ section, field })
        }
      }
    }
    return results
  })

  const searchMatchMap = computed(() => {
    const map: Record<string, number> = {}
    for (const item of searchResults.value) {
      const sk = item.section.key
      map[sk] = (map[sk] || 0) + 1
    }
    return map
  })

  const displayFields = computed(() => currentSection.value?.fields || [])

  const filteredSectionFields = computed(() => {
    const q = sectionFilter.value.trim().toLowerCase()
    const sectionKey = currentSection.value?.key
    let fields = filterPricingSectionFields(displayFields.value, sectionKey)
    if (!q || !sectionKey) return fields
    return fields.filter((f) => systemConfigFieldMatchesQuery(f, q, sectionKey))
  })

  return {
    isSearchMode,
    searchResults,
    searchMatchMap,
    displayFields,
    filteredSectionFields,
  }
}

/**
 * @file system-config-panel-io.internals.ts
 * @module frontend/src/views
 */
/** 高级参数：重载 / 导入导出 / 保存 / 恢复默认 */

type ConfigValidationError = { section: string; key: string; message?: string }
type ChromeStore = ReturnType<typeof useChromeStore>
type SystemConfigPatchSave = ReturnType<typeof useSystemConfig>['save']

export function useSystemConfigPanelIo(opts: {
  chrome: ChromeStore
  runSave: (fn: () => unknown, hooks?: { onError?: (e: unknown) => unknown }) => Promise<unknown>
  load: (opts?: { force?: boolean }) => Promise<void>
  getLoaded: () => boolean
  setLoaded: (v: boolean) => void
  invalidateSystemConfig: () => void
  saveSystemConfig: SystemConfigPatchSave
  loadAudit: (fallback: unknown) => Promise<void>
  captureSnapshot: () => void
  sectionLabel: (key: string) => string
  sectionList: Ref<EditableConfigSection[]>
  pendingChanges: Ref<number>
  pendingFieldKeys: Ref<Set<string>> | { value: Set<string> }
  validationErrors: Ref<ConfigValidationError[]>
  savedTip: Ref<string>
  savedTipOk: Ref<boolean>
  loadError: Ref<string>
  savedSnapshot: Ref<string | null>
  exportAppConfig: () => Promise<boolean>
  importAppConfigFromText: (text: string) => Promise<'replace' | 'merge' | false | null | undefined>
}) {
  const {
    chrome,
    runSave,
    load,
    getLoaded,
    setLoaded,
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
  } = opts
  const configConflict = ref(false)

  async function reload() {
    setLoaded(false)
    configConflict.value = false
    loadError.value = ''
    invalidateSystemConfig()
    await load({ force: true })
  }

  function ensureLoaded(activeTab: string) {
    if (activeTab === 'params' && !getLoaded()) return load()
    return undefined
  }

  async function exportConfig() {
    savedTip.value = ''
    const ok = await exportAppConfig()
    savedTipOk.value = ok
    savedTip.value = ok ? '已导出' : '导出失败'
    if (savedTip.value)
      setTimeout(() => {
        savedTip.value = ''
      }, 2800)
  }

  async function onImportFileFromBar(file: File | null | undefined) {
    if (!file) return
    savedTip.value = ''
    try {
      const mode = await importAppConfigFromText(await file.text())
      if (mode) {
        await reload()
        savedTipOk.value = true
        savedTip.value = mode === 'replace' ? '已全量导入' : '已合并导入'
        setTimeout(() => {
          savedTip.value = ''
        }, 2800)
      } else {
        savedTipOk.value = false
        savedTip.value = '导入失败'
      }
    } catch (e) {
      logger.error('导入系统参数失败', e)
      savedTipOk.value = false
      savedTip.value = '导入失败'
    }
  }

  async function save() {
    savedTip.value = ''
    validationErrors.value = []
    configConflict.value = false
    await runSave(
      async () => {
        const pending = pendingFieldKeys.value
        let patch
        try {
          patch = fromEditableSectionsPending(sectionList.value, pending)
        } catch (e) {
          const msg = String((e as { message?: string })?.message || '')
          const match = /^([\w]+)\.([\w]+)\s+JSON/.exec(msg)
          if (match) {
            validationErrors.value = [{ section: match[1], key: match[2], message: 'JSON 格式无效' }]
            savedTipOk.value = false
            savedTip.value = 'JSON 格式无效'
            return
          }
          throw e
        }
        await fetchSystemConfigFresh()
        const data = await saveSystemConfig(patch)
        captureSnapshot()
        await loadAudit(data?._configAudit)
        await reloadFrontendConfig()
        savedTipOk.value = true
        savedTip.value = '已保存'
        setTimeout(() => {
          savedTip.value = ''
        }, 2800)
      },
      {
        onError: async (e) => {
          logger.error('保存系统参数失败', e)
          savedTipOk.value = false
          const err = e as {
            message?: string
            response?: { status?: number; data?: { fieldErrors?: ConfigValidationError[] } }
          }
          const fe = err?.response?.data?.fieldErrors
          if (Array.isArray(fe) && fe.length) {
            validationErrors.value = fe
            savedTip.value = '校验失败，请查看下方错误列表'
          } else if (err?.response?.status === 409) {
            const handled = await handleSystemConfigPatchError(e, chrome)
            configConflict.value = !handled
            savedTip.value = handled
              ? '配置已被其他终端修改，已重新加载'
              : getApiErrorMessage(e, '配置已被他人修改，请刷新后重试')
            if (handled) await load({ force: true })
          } else {
            savedTip.value = err?.message?.includes('JSON') ? err.message : getApiErrorMessage(e, '保存失败')
          }
        },
      },
    )
  }

  async function onResetSection(key: string) {
    const label = sectionLabel(key)
    const ok = await chrome.confirm(`确定将「${label}」恢复为默认值？`, '恢复默认')
    if (!ok) return
    try {
      await resetSystemConfig(key)
      await reload()
      await reloadFrontendConfig()
      chrome.notify(`「${label}」已恢复默认`, 'success')
    } catch (e) {
      logger.error('恢复分区默认失败', e)
      chrome.notify(getApiErrorMessage(e, '恢复默认失败'), 'error')
    }
  }

  async function onResetAll() {
    const ok = await chrome.confirm('确定将全部运行参数恢复为默认值？此操作不可撤销。', '恢复默认')
    if (!ok) return
    try {
      await resetSystemConfig()
      await reload()
      await reloadFrontendConfig()
      chrome.notify('全部运行参数已恢复默认', 'success')
    } catch (e) {
      logger.error('恢复全部默认失败', e)
      chrome.notify(getApiErrorMessage(e, '恢复默认失败'), 'error')
    }
  }

  async function cancelChanges() {
    if (pendingChanges.value === 0) return
    const ok = await chrome.confirm('确定放弃未保存的更改？此操作不可撤销。', '放弃更改', {
      type: 'danger',
      confirmText: '放弃更改',
      cancelText: '继续编辑',
    })
    if (!ok) return
    if (!applyEditableSnapshotToSections(sectionList.value, savedSnapshot.value)) return
    validationErrors.value = []
    chrome.notify('已取消修改', 'info')
  }

  return {
    configConflict,
    reload,
    ensureLoaded,
    exportConfig,
    onImportFileFromBar,
    save,
    onResetSection,
    onResetAll,
    cancelChanges,
  }
}

/**
 * @file system-config-panel.internals.ts
 * @module frontend/src/views
 */
/** composables：useSystemConfigPanel */

type ConfigAuditEntry = {
  at?: string
  action?: string
  sections?: string[]
  [key: string]: unknown
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
  const { load: loadSystemConfig, save: saveSystemConfig, invalidate: invalidateSystemConfig } = useSystemConfig()
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

  const visibleSectionList = computed(() => filterSectionsForExpert(sectionList.value, expertMode.value))

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

  const { sectionLabel, fieldLabel, fieldHint, fieldId, searchFieldId } = createSystemConfigFieldHelpers(
    () => currentSection.value?.key,
  )

  const { isSearchMode, searchResults, searchMatchMap, filteredSectionFields } = useSystemConfigPanelSearch({
    globalSearch,
    sectionFilter,
    visibleSectionList,
    currentSection,
  })

  const booleanFields = computed(() => filteredSectionFields.value.filter((field) => field.type === 'boolean'))
  const inputFields = computed(() => filteredSectionFields.value.filter((field) => field.type !== 'boolean'))

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

  const pendingChanges = computed(() => countSystemConfigPendingChanges(sectionList.value, savedSnapshot.value))

  const pendingFieldKeys = computed(() => getSystemConfigPendingFieldKeys(sectionList.value, savedSnapshot.value))

  const sectionPendingMap = computed(() => getSystemConfigSectionPendingMap(sectionList.value, savedSnapshot.value))

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

  const { navigateToValidationError, applyParamsSection, applySectionFromRoute } = createSystemConfigPanelNav({
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
      if (!route.query.section && !visibleSectionList.value.some((section) => section.key === activeSection.value)) {
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
