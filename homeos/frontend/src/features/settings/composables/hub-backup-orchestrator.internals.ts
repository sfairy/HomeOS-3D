/**
 * @file hub-backup-orchestrator.internals.ts
 * @module frontend/src/views
 */
/** composables：自 hub.internals.ts 拆出 — 配置与档案备份、天气特效配置 */
import { handleSystemConfigPatchError, patchSystemConfig } from '@/composables/config/system-config-core.internals'
import { exportBackupBundle, exportSystemConfig, fetchBackupBundleSummary, importBackupBundle, importSystemConfig } from '@/services/api/system'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { configEpoch, getConfigSection, reloadFrontendConfig } from '@/utils/config/frontend-config'
import { downloadBlob } from '@/utils/core/misc.util'
import { extractErrorMessage, getApiErrorMessage } from '@/utils/core/error-message'
import { logger } from '@/utils/core/logger'
import { clonePlain } from '@/utils/core/clone-plain.util'
import { formatRangeDisplayValue } from '@/utils/settings/range-steps.util'
import {
  WEATHER_DISPLAY_ROUTE_GROUPS,
  getWeatherDisplayRouteLabel,
  normalizeDisplayRoutes,
} from '@/utils/weather/display-routes.util'
import {
  DEFAULT_WEATHER_EFFECTS_CONFIG,
  PRESET_BASE,
  pruneEmptySceneOverrides,
  type WeatherEffectPreset,
  type WeatherEffectsConfig,
} from '@/utils/weather/effect-presets.util'
import {
  globalSliders,
  presetOptions,
  sceneGroups,
} from '@/utils/weather/effects-ui.constants'
import type { NotifyType } from '@/types/notify'
import { computed, ref, watch } from 'vue'

// ── useAppConfigBackup ──
/** AppConfig 备份③：导出 / 导入（与 SystemConfigPanel 共用 API） */
export function useAppConfigBackup(options: { notify?: boolean } = {}) {
  const { notify = true } = options
  const chrome = useChromeStore()
  const appConfigExporting = ref(false)
  const appConfigImporting = ref(false)

  function tip(message: string, type: NotifyType, duration?: number) {
    if (notify) chrome.notify(message, type, duration)
  }

  async function exportAppConfig() {
    appConfigExporting.value = true
    try {
      const { data } = await exportSystemConfig()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      downloadBlob(blob, `homeos-appconfig-${new Date().toISOString().slice(0, 10)}.json`)
      tip('系统参数已导出', 'success')
      return true
    } catch (e) {
      tip(getApiErrorMessage(e, '系统参数导出失败'), 'error')
      return false
    } finally {
      appConfigExporting.value = false
    }
  }

  async function importAppConfigFromText(raw: unknown) {
    const text = String(raw || '').trim()
    if (!text) {
      tip('请选择备份文件或粘贴 JSON', 'warning')
      return false
    }
    appConfigImporting.value = true
    try {
      const payload = JSON.parse(text)
      const config = payload.config || payload
      const replace = await chrome.confirm(
        '选择「确定」= 全量替换（需 confirm）；「取消」= 合并更新已有分区',
        '系统参数导入',
        { type: 'danger' },
      )
      const body = replace
        ? { config, schemaVersion: payload.schemaVersion, mode: 'replace', confirm: true }
        : { config, schemaVersion: payload.schemaVersion, mode: 'merge' }
      await importSystemConfig(body)
      await reloadFrontendConfig()
      tip(replace ? '系统参数已全量导入' : '系统参数已合并导入', 'success', 5000)
      return replace ? 'replace' : 'merge'
    } catch (e) {
      const msg = getApiErrorMessage(e, '')
      tip(typeof msg === 'string' ? msg.slice(0, 120) : '系统参数导入失败', 'error')
      return false
    } finally {
      appConfigImporting.value = false
    }
  }

  return {
    appConfigExporting,
    appConfigImporting,
    exportAppConfig,
    importAppConfigFromText,
  }
}

/**
 * 完整备份包还原后的统一副作用：重载前端配置、方案列表与运行配置。
 * 客户端整包导入与服务器备份包还原共用，确保还原后界面即时反映最新状态。
 */
export async function refreshAfterBundleRestore(
  layoutStore: ReturnType<typeof useLayoutStore>,
  sections: string[] = [],
) {
  const chrome = useChromeStore()
  await reloadFrontendConfig()
  await layoutStore.fetchProfiles()
  await layoutStore.loadConfig()
  chrome.notify(
    sections.length ? `完整备份包已还原：${sections.join('、')}` : '完整备份包已还原',
    'success',
    6000,
  )
}

// ── useProfileBackup ──
export function useProfileBackup() {
  const authStore = useAuthStore()
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const { appConfigExporting, appConfigImporting, exportAppConfig, importAppConfigFromText } =
    useAppConfigBackup()

  const showCreateProfile = ref(false)
  const showImport = ref(false)
  const newProfileName = ref<string>('')
  const importFileInput = ref<HTMLInputElement | null>(null)
  const importFile = ref<File | null>(null)
  const importJsonText = ref<string>('')
  const selectedFileName = ref<string>('')
  const isImporting = ref(false)
  const bundleExporting = ref(false)
  /** 完整备份包导入分区多选（仅布局 / 仅系统参数） */
  const importSections = ref<Array<'ui' | 'appConfig'>>(['ui', 'appConfig'])
  const backupSummary = ref<Record<string, unknown> | null>(null)
  const backupSummaryLoading = ref(false)

  async function switchToProfile(id: string) {
    if (!authStore.isAuthenticated) return
    const name = id === 'default' ? '默认系统方案' : id
    const confirmed = await chrome.confirm(
      `确定要切换到方案 "${name}" 吗？切换后页面可能需要重新加载。`,
      '切换显示方案',
    )
    if (confirmed) {
      try {
        await layoutStore.switchProfile(id)
        chrome.notify(`已成功加载方案: ${name}`, 'success')
      } catch (e) {
        chrome.notify(getApiErrorMessage(e, '切换方案失败'), 'error')
      }
    }
  }

  async function onDeleteProfile(id: string) {
    const name = id === 'default' ? '默认系统方案' : id
    const confirmed = await chrome.confirm(
      `确定要彻底删除方案 "${name}" 吗？此操作不可撤销！`,
      '危险操作',
      { type: 'danger' },
    )
    if (confirmed && authStore.isAuthenticated) {
      try {
        await layoutStore.deleteProfile(id)
        chrome.notify(`方案 ${name} 已被移除`, 'success')
      } catch (e) {
        chrome.notify(getApiErrorMessage(e, '删除方案失败'), 'error')
      }
    }
  }

  async function createNewProfile() {
    if (!newProfileName.value.trim()) {
      chrome.notify('请输入方案 ID', 'warning')
      return
    }
    if (authStore.isAuthenticated) {
      try {
        await layoutStore.createProfile(newProfileName.value.trim())
        newProfileName.value = ''
        showCreateProfile.value = false
      } catch (e) {
        chrome.notify(getApiErrorMessage(e, '创建方案失败'), 'error')
      }
    }
  }

  function exportBackup() {
    if (authStore.isAuthenticated) return layoutStore.exportFullBackup()
    return Promise.resolve()
  }

  function resetImportState() {
    importFile.value = null
    importJsonText.value = ''
    selectedFileName.value = ''
    isImporting.value = false
    if (importFileInput.value) importFileInput.value.value = ''
  }

  watch(showImport, (val) => {
    if (!val) resetImportState()
  })

  async function handleFileSelect(e: Event) {
    const file = (e.target as HTMLInputElement | null)?.files?.[0]
    if (!file) return
    importFile.value = file
    selectedFileName.value = file.name
    try {
      importJsonText.value = await file.text()
    } catch (e) {
      logger.warn('读取配置文件备份失败', e)
      chrome.notify('读取文件失败', 'error')
      resetImportState()
    }
  }

  async function handleImport(backupType = 'ui') {
    if (!authStore.isAuthenticated) return
    const raw = importJsonText.value.trim()
    if (!raw) {
      chrome.notify('请选择备份文件或粘贴 JSON 代码', 'warning')
      return
    }
    if (backupType === 'appconfig') {
      isImporting.value = true
      try {
        const ok = await importAppConfigFromText(raw)
        if (ok) {
          showImport.value = false
          resetImportState()
        }
      } finally {
        isImporting.value = false
      }
      return
    }
    if (backupType === 'bundle') {
      isImporting.value = true
      try {
        const ok = await importBundleFromText(raw, [...importSections.value])
        if (ok) {
          showImport.value = false
          resetImportState()
        }
      } finally {
        isImporting.value = false
      }
      return
    }
    const confirmed = await chrome.confirm(
      '将覆盖数据库中的 UI 布局方案（ProjectConfig）。不含自动化与用户账号。确定继续？',
      'UI 布局还原确认',
      { type: 'danger' },
    )
    if (!confirmed) return
    isImporting.value = true
    try {
      const parsed = JSON.parse(raw)
      const success = await layoutStore.importFullBackup(parsed)
      if (success) {
        showImport.value = false
        resetImportState()
      } else {
        chrome.notify('导入失败，请检查文件内容', 'error')
      }
    } catch (e) {
      logger.warn('配置文件备份导入失败', e)
      chrome.notify('导入失败，请检查文件格式', 'error')
    } finally {
      isImporting.value = false
    }
  }

  async function exportBundleBackup() {
    bundleExporting.value = true
    try {
      const { data } = await exportBackupBundle()
      const bundle = data?.data ?? data
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
      downloadBlob(blob, `homeos-bundle-${new Date().toISOString().slice(0, 10)}.json`)
      chrome.notify('完整备份包已导出（① UI + ② 系统参数）', 'success', 5000)
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '完整备份包导出失败'), 'error')
      throw e
    } finally {
      bundleExporting.value = false
    }
  }

  async function importBundleFromText(
    raw: unknown,
    sections: string[] = ['ui', 'appConfig'],
  ) {
    const text = String(raw || '').trim()
    if (!text) {
      chrome.notify('请选择备份包文件或粘贴 JSON', 'warning')
      return false
    }
    const proceed = await chrome.confirm(
      `将按所选分区还原完整备份包（${sections.join('、')}，默认不含用户账号与数据库）。所选分区将被全量替换，未选分区保持当前配置不变，请确认已备份当前环境。`,
      '完整备份还原',
      { type: 'danger' },
    )
    if (!proceed) return false
    const replaceAppConfig = await chrome.confirm(
      '系统参数：确定 = 全量替换；取消 = 合并更新（推荐从本机导出的包）',
      '系统参数导入方式',
      { type: 'danger' },
    )
    try {
      const parsed = JSON.parse(text)
      const bundle = parsed?.data ?? parsed
      const res = await importBackupBundle({
        bundle,
        confirm: true,
        appConfigMode: replaceAppConfig ? 'replace' : 'merge',
        sections,
      })
      await refreshAfterBundleRestore(layoutStore, res.data?.sections ?? [])
      return true
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '完整备份包导入失败'), 'error', 8000)
      return false
    }
  }

  async function exportAllJsonBackups() {
    await exportBackup()
    await exportAppConfig()
    chrome.notify('①② JSON 备份已全部导出', 'success', 4000)
  }

  async function fetchBackupSummaries() {
    if (!authStore.isAuthenticated) {
      backupSummary.value = null
      return
    }
    backupSummaryLoading.value = true
    try {
      const { data } = await fetchBackupBundleSummary()
      backupSummary.value = data?.data ?? data
    } catch (e) {
      logger.warn('备份摘要加载失败', extractErrorMessage(e))
      backupSummary.value = null
      chrome.notify(getApiErrorMessage(e, '备份摘要加载失败'), 'warning')
    } finally {
      backupSummaryLoading.value = false
    }
  }

  return {
    showCreateProfile,
    showImport,
    newProfileName,
    importFileInput,
    importJsonText,
    selectedFileName,
    isImporting,
    importSections,
    switchToProfile,
    onDeleteProfile,
    createNewProfile,
    exportBackup,
    handleFileSelect,
    handleImport,
    appConfigExporting,
    appConfigImporting,
    exportAppConfig,
    bundleExporting,
    exportBundleBackup,
    importBundleFromText,
    exportAllJsonBackups,
    backupSummary,
    backupSummaryLoading,
    fetchBackupSummaries,
  }
}

// ── useWeatherEffectsConfig ──
function cloneDefaults(): WeatherEffectsConfig {
  return structuredClone(DEFAULT_WEATHER_EFFECTS_CONFIG)
}

function loadForm(): WeatherEffectsConfig {
  const section = getConfigSection('weatherEffects') as unknown as
    | Partial<WeatherEffectsConfig>
    | undefined
  const base = cloneDefaults()
  const merged: WeatherEffectsConfig = {
    ...base,
    ...section,
    scenes: pruneEmptySceneOverrides({
      ...base.scenes,
      ...(section?.scenes || {}),
    }) as WeatherEffectsConfig['scenes'],
    displayRoutes: normalizeDisplayRoutes(section?.displayRoutes ?? base.displayRoutes),
  }
  for (const g of sceneGroups) {
    const key = g.key as keyof WeatherEffectsConfig['scenes']
    const next = {
      ...(base.scenes[key] || {}),
      ...(merged.scenes[key] || {}),
    }
    merged.scenes[key] = (
      Object.keys(next).length ? next : {}
    ) as WeatherEffectsConfig['scenes'][typeof key]
  }
  return merged
}

/** useWeatherEffectsConfig：天气特效配置表单与保存逻辑（数据最终来自系统配置）。 */
export function useWeatherEffectsConfig() {
  const chrome = useChromeStore()

  const saving = ref(false)
  const activeScene = ref('clearDay')
  const form = ref<WeatherEffectsConfig>(loadForm())
  /** 上次加载/保存的基线，用于 dirty 判定 */
  const baseline = ref<WeatherEffectsConfig>(clonePlain(form.value) as WeatherEffectsConfig)

  const isDirty = computed(() => {
    try {
      return JSON.stringify(form.value) !== JSON.stringify(baseline.value)
    } catch {
      return true
    }
  })

  function syncBaseline() {
    baseline.value = clonePlain(form.value) as WeatherEffectsConfig
  }

  const sceneTabs = computed(() =>
    sceneGroups.map((g) => ({
      id: g.key,
      label: g.label,
      emoji: g.emoji,
      accent: g.accent,
    })),
  )

  const activeSceneGroup = computed(() => sceneGroups.find((g) => g.key === activeScene.value))

  const routeSummary = computed(() => {
    const routes = form.value.displayRoutes || []
    if (routes.includes('all')) return '全部页面'
    if (!routes.length) return getWeatherDisplayRouteLabel('dashboard')
    const labels = routes.map((id: string) => getWeatherDisplayRouteLabel(id)).filter(Boolean)
    return labels.join(' · ')
  })

  function presetScene() {
    const preset = form.value.preset as WeatherEffectPreset
    return (PRESET_BASE[preset] || PRESET_BASE.realistic).scene
  }

  function getSceneField(sceneKey: keyof WeatherEffectsConfig['scenes'], fieldKey: string) {
    const patch = form.value.scenes[sceneKey] as Record<string, number | boolean | undefined>
    const v = patch?.[fieldKey]
    if (typeof v === 'number') return v
    const fallback = (presetScene() as unknown as Record<string, number | boolean>)[fieldKey]
    return typeof fallback === 'number' ? fallback : Number(fallback)
  }

  function setSceneField(
    sceneKey: keyof WeatherEffectsConfig['scenes'],
    fieldKey: string,
    val: number,
  ) {
    const patch = (form.value.scenes[sceneKey] ?? {}) as Record<string, number | boolean>
    patch[fieldKey] = val
    form.value.scenes[sceneKey] = patch as WeatherEffectsConfig['scenes'][typeof sceneKey]
  }

  function formatSceneField(
    sceneKey: keyof WeatherEffectsConfig['scenes'],
    field: { key: string; min: number; max: number; step: number },
  ) {
    const v = getSceneField(sceneKey, field.key)
    if (field.key.endsWith('Ms')) return `${Math.round(v)} ms`
    if (field.max === 1 && field.min === 0) return `${Math.round(v * 100)}%`
    return formatRangeDisplayValue(v, field.min, field.max, field.step)
  }

  function hasSceneOverrides(sceneKey: keyof WeatherEffectsConfig['scenes']) {
    const patch = form.value.scenes?.[sceneKey]
    return patch && Object.keys(patch).length > 0
  }

  function resetScene(sceneKey: keyof WeatherEffectsConfig['scenes']) {
    form.value.scenes[sceneKey] = {}
  }

  watch(
    () => form.value.preset,
    (preset, oldPreset) => {
      if (oldPreset === undefined || preset === oldPreset) return
      const base = PRESET_BASE[preset as WeatherEffectPreset] || PRESET_BASE.realistic
      form.value.densityMultiplier = base.densityMultiplier
      form.value.windMultiplier = base.windMultiplier
      form.value.attributeBlend = base.attributeBlend
      form.value.starCount = base.starCount
      form.value.cloudLayers = base.cloudLayers
      form.value.shootingStarRate = base.shootingStarRate
      form.value.scenes = cloneDefaults().scenes
    },
  )

  const puddleEnabled = computed({
    get: () => {
      const v = form.value.scenes?.rain?.puddle
      if (v !== undefined) return Number(v) !== 0
      return Boolean(presetScene().puddle)
    },
    set: (v: boolean) => {
      if (!form.value.scenes.rain) form.value.scenes.rain = {}
      form.value.scenes.rain.puddle = v
    },
  })

  function isRouteActive(id: string) {
    if (id === 'all') return form.value.displayRoutes?.includes('all')
    return form.value.displayRoutes?.includes(id)
  }

  function toggleRoute(id: string) {
    let routes = [...(form.value.displayRoutes || [])]
    if (id === 'all') {
      routes = routes.includes('all') ? ['dashboard'] : ['all']
    } else {
      routes = routes.filter((r) => r !== 'all')
      const idx = routes.indexOf(id)
      if (idx >= 0) {
        routes.splice(idx, 1)
        if (!routes.length) routes = ['dashboard']
      } else {
        routes.push(id)
      }
    }
    form.value.displayRoutes = routes
  }

  async function save(): Promise<boolean> {
    saving.value = true
    try {
      const payload = clonePlain(form.value) as WeatherEffectsConfig
      payload.scenes = pruneEmptySceneOverrides(payload.scenes) as WeatherEffectsConfig['scenes']
      payload.displayRoutes = normalizeDisplayRoutes(payload.displayRoutes)
      const sleet = payload.scenes?.sleet
      if (sleet && typeof sleet.rainRatio === 'number' && typeof sleet.snowRatio === 'number') {
        const sum = sleet.rainRatio + sleet.snowRatio
        if (sum > 0) {
          sleet.rainRatio = sleet.rainRatio / sum
          sleet.snowRatio = sleet.snowRatio / sum
        }
      }
      await patchSystemConfig({ weatherEffects: payload as unknown as Record<string, unknown> })
      await reloadFrontendConfig()
      form.value = loadForm()
      syncBaseline()
      chrome.notify('天气特效配置已保存', 'success')
      return true
    } catch (e: unknown) {
      if (await handleSystemConfigPatchError(e, chrome)) return false
      chrome.notify(getApiErrorMessage(e, '保存失败'), 'error')
      return false
    } finally {
      saving.value = false
    }
  }

  function resetToDefaults() {
    form.value = cloneDefaults()
  }

  watch(configEpoch, () => {
    form.value = loadForm()
    syncBaseline()
  })

  return {
    form,
    saving,
    isDirty,
    activeScene,
    presetOptions,
    routeOptionGroups: WEATHER_DISPLAY_ROUTE_GROUPS,
    globalSliders,
    sceneTabs,
    activeSceneGroup,
    routeSummary,
    puddleEnabled,
    getSceneField,
    setSceneField,
    formatSceneField,
    hasSceneOverrides,
    resetScene,
    isRouteActive,
    toggleRoute,
    save,
    resetToDefaults,
  }
}
