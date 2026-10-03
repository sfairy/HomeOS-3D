/**
 * @file bindings.internals.ts
 * @module frontend/src/views
 */
/** composables：合并自 HA 绑定 / 推荐 / 账户绑定区 / 生活账户 Hub */
import { afterLayoutCancelSync, syncGlobalLayoutPendingSnapshot, useRegisterSettingsTabPending, useSettingsHubPending } from '@/composables/settings/pending.internals'
import type { AccountBindingFieldMeta } from '@/constants/account-binding-meta'
import { ACCOUNT_BINDING_FIELD_META, ACCOUNT_BINDING_SOURCE_LABELS, ACCOUNT_BINDING_TABS } from '@/constants/account-binding-meta'
import { ENERGY_FIELD_DEFS, createDefaultEnergySource, getMappableFields, inferEnergyMapping, type EnergyCategory } from '@/constants/energy-fields'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import type { UILayoutConfig } from '@/types/layout'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { bootstrapAccountStructForMode, ensureAccountEntriesOnSource, ensureEntityAccountsOnSource, ensureMultiAccountsOnSource, hasEntityAccountConfig, hasMultiAccountConfig, multiAccountEntryLabel, resolveAccountEntityEntries, resolveAccountNumbers, resolveMultiAccountEntries, syncEntityAccounts, syncMultiAccounts } from '@/utils/energy/account.util'
import { clearDoorbellCamera, toggleDoorbellCamera } from '@/utils/layout/doorbell.util'
import type { BindingsRecommendEntity } from '@/utils/recommend/bindings-recommend.util'
import { buildBindingsRecommendations, collectBoundHazardIds } from '@/utils/recommend/bindings-recommend.util'
import type { RecommendChip } from '@/utils/recommend/types'
import { applyLifeAccountsLayoutSlice, liveLifeAccountsLayoutSlice, pickLifeAccountsLayoutSlice } from '../display/layout-dashboard.internals'
import { useSettingsSidebarReentryReset } from '@/composables/ui/hub-viewport.internals'
import { systemConfigRef } from '@/composables/config/system-config-core.internals'
import type { BindingGapItem } from '@homeos/shared'
import { collectBindingGaps, filterBindingGapsBySection, getEntityLeaf } from '@homeos/shared'
import type { BindingsRecommendSection } from '@/utils/recommend/bindings-recommend.util'
import type { Ref } from 'vue'
import { computed, ref, watch } from 'vue'

// ── useHaBindings ──
/** useHaBindings：函数，按签名入参返回处理结果。 */
export function useHaBindings(layoutConfig: Ref<UILayoutConfig>) {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()

  const securityCameras = computed({
    get: () => layoutConfig.value.haConfig.securityCameras || [],
    set: (v) => {
      layoutConfig.value.haConfig.securityCameras = v
    },
  })

  function addCamera() {
    if (!layoutStore.layoutConfig.haConfig.securityCameras) {
      layoutStore.layoutConfig.haConfig.securityCameras = []
    }
    layoutStore.layoutConfig.haConfig.securityCameras.push('')
  }

  function removeCamera(idx: number) {
    const list = [...securityCameras.value]
    const removed = list[idx]
    if (removed == null) return
    list.splice(idx, 1)
    securityCameras.value = list
    const hc = layoutStore.layoutConfig.haConfig
    if (removed) clearDoorbellCamera(hc, removed)
    if (hc.securityCamera === removed) hc.securityCamera = list[0] || ''
  }

  function toggleDoorbellCam(cam: string) {
    const ok = toggleDoorbellCamera(layoutStore.layoutConfig.haConfig, cam)
    if (!ok) {
      chrome.notify('请先在「安防传感器与门铃」中添加门铃路由，再指定门铃画面', 'warning')
    }
  }

  function setDefaultCamera(cam: string) {
    layoutStore.layoutConfig.haConfig.securityCamera = cam
  }

  return {
    securityCameras,
    addCamera,
    removeCamera,
    toggleDoorbellCam,
    setDefaultCamera,
  }
}

// ── useBindingsRecommend ──
/** useBindingsRecommend：函数，按签名入参返回处理结果。 */
export function useBindingsRecommend(serverGaps: () => BindingGapItem[]) {
  const entitiesStore = useEntitiesStore()
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()

  const bindingGapItems = computed(() => {
    const layout = layoutStore.layoutConfig
    const vacuumEntityIds = Object.keys(entitiesStore.entities).filter((id) =>
      id.startsWith('vacuum.'),
    )
    const local = collectBindingGaps({
      haConfig: layout.haConfig || {},
      statsSensors: layout.statsSensors || {},
      envSensorMap: systemConfigRef.value?.envSensorMap || {},
      dashboardFooterItems: layout.dashboardFooter?.items,
      formatEnergyLabel: (cat) => ACCOUNT_BINDING_SOURCE_LABELS[cat] || cat,
      vacuumEntityIds,
    })
    const merged = new Map<string, BindingGapItem>()
    for (const gap of [...serverGaps(), ...local]) {
      if (gap?.id) merged.set(gap.id, gap)
    }
    return [...merged.values()]
  })

  const recommendEntities = computed(() =>
    Object.values(entitiesStore.entities).flatMap((ent): BindingsRecommendEntity[] => {
      const entityId = String(ent?.entity_id || '').trim()
      return entityId ? [{ entity_id: entityId, attributes: ent?.attributes }] : []
    }),
  )

  function bindingGapItemsFor(section: BindingsRecommendSection) {
    return filterBindingGapsBySection(bindingGapItems.value, section)
  }

  function recommendationsFor(section: BindingsRecommendSection) {
    return buildBindingsRecommendations({
      gaps: bindingGapItems.value,
      entities: recommendEntities.value,
      boundHazardIds: collectBoundHazardIds(layoutStore.layoutConfig.haConfig),
      section,
      includeGapChips: false,
      includeHazardChips: section === 'overview' || section === 'security',
    })
  }

  /** 概览默认推荐（全量缺口 meta + 危险传感器 chips，不含缺口 chips） */
  const recommendations = computed(() => recommendationsFor('overview'))

  function applyChip(chip: Pick<RecommendChip, 'label' | 'payload'> & { route?: string }) {
    const kind = String(chip.payload?.kind || '')
    const entityId = String(chip.payload?.entityId || '').trim()
    if (!entityId || !kind) return false
    const hc = layoutStore.layoutConfig.haConfig
    const key =
      kind === 'smoke'
        ? 'hazardSmokeEntityIds'
        : kind === 'gas'
          ? 'hazardGasEntityIds'
          : 'hazardLeakEntityIds'
    if (!Array.isArray(hc[key])) hc[key] = []
    if (hc[key].includes(entityId)) return false
    hc[key].push(entityId)
    chrome.notify(`已添加 ${chip.label || entityId}`, 'success')
    return true
  }

  function applyAll() {
    const chips = (recommendationsFor('security').groups || [])
      .filter((g) => g.id === 'hazard-sensors')
      .flatMap((g) => g.chips)
    let added = 0
    for (const chip of chips) {
      if (applyChip(chip)) added++
    }
    if (added > 0) chrome.notify(`已添加 ${added} 个传感器绑定`, 'success')
  }

  return {
    bindingGapItems,
    bindingGapItemsFor,
    recommendations,
    recommendationsFor,
    applyChip,
    applyAll,
  }
}

// ── useBindingsAccountSection ──
type EnergySource = ReturnType<typeof createDefaultEnergySource>

interface BindingsAccountSectionProps {
  modeOptions: Ref<Array<{ id: string; label: string }>>
  compositeEntityAttrs: Ref<string[]>
}

/** useBindingsAccountSection：函数，按签名入参返回处理结果。 */
export function useBindingsAccountSection(
  categoryTab: Ref<string>,
  props: BindingsAccountSectionProps,
) {
  const layoutStore = useLayoutStore()
  const entitiesStore = useEntitiesStore()
  const editingMultiAccountIndex = ref(0)
  const editingMultiAccountKey = ref('0')
  const editingEntityAccountIndex = ref(0)
  const editingEntityAccountKey = ref('0')

  const activeSource = computed((): EnergySource => {
    const stats = layoutStore.layoutConfig.statsSensors
    if (!stats.energySources) stats.energySources = {}
    const cat = categoryTab.value
    if (!stats.energySources[cat]) {
      stats.energySources[cat] = createDefaultEnergySource()
    }
    const src = stats.energySources[cat] as EnergySource
    bootstrapAccountStructForMode(src)
    return src
  })

  watch(editingMultiAccountKey, (key) => {
    const idx = Number.parseInt(String(key), 10)
    if (!Number.isNaN(idx)) editingMultiAccountIndex.value = idx
  })

  watch(editingEntityAccountKey, (key) => {
    const idx = Number.parseInt(String(key), 10)
    if (!Number.isNaN(idx)) editingEntityAccountIndex.value = idx
  })

  watch(
    () => activeSource.value?.mode,
    () => {
      editingMultiAccountIndex.value = 0
      editingMultiAccountKey.value = '0'
      editingEntityAccountIndex.value = 0
      editingEntityAccountKey.value = '0'
    },
  )

  const entityAccountEditTabs = computed(() => {
    const src = activeSource.value
    if (!src || src.mode !== 'entity') return []
    return resolveAccountEntityEntries(src).map((row, index) => ({
      id: String(index),
      label: (row.label?.trim() || getEntityLeaf(row.entityId) || `账户 ${index + 1}`).slice(
        0,
        12,
      ),
      emoji: index === (src.primaryAccountIndex ?? 0) ? '★' : '○',
      accent:
        index === (src.primaryAccountIndex ?? 0)
          ? 'var(--module-accent-bindings-sub)'
          : 'var(--set-neutral)',
    }))
  })

  const activeEntityAccountRow = computed(() => {
    const src = activeSource.value
    const rows = src?.accountEntities
    if (!Array.isArray(rows) || !rows.length) {
      return { entityId: '', label: '' }
    }
    const idx = Math.min(editingEntityAccountIndex.value, rows.length - 1)
    return rows[idx] || rows[0]
  })

  const compositeEntityAttrsForEdit = computed(() => {
    const src = activeSource.value
    if (!src || src.mode !== 'entity') return props.compositeEntityAttrs.value
    const eid = activeEntityAccountRow.value?.entityId?.trim()
    if (!eid) return []
    const ent = entitiesStore.entities[eid]
    if (!ent?.attributes) return []
    return Object.keys(ent.attributes).filter((k) => !k.startsWith('friendly_'))
  })

  watch(
    () => activeSource.value?.accountEntities?.length,
    (len) => {
      if (len == null || len <= 0) return
      if (editingEntityAccountIndex.value >= len) {
        editingEntityAccountIndex.value = 0
        editingEntityAccountKey.value = '0'
      }
    },
  )

  watch(
    editingMultiAccountIndex,
    (idx) => {
      const row = activeSource.value?.multiAccounts?.[idx]
      if (row && !row.entityMap) row.entityMap = {}
    },
    { immediate: true },
  )

  const multiAccountEditTabs = computed(() => {
    const src = activeSource.value
    if (!src || src.mode !== 'multi') return []
    return resolveMultiAccountEntries(src).map((row, index) => ({
      id: String(index),
      label: multiAccountEntryLabel(row, index).slice(0, 12),
      emoji: index === (src.primaryAccountIndex ?? 0) ? '★' : '○',
      accent:
        index === (src.primaryAccountIndex ?? 0)
          ? 'var(--module-accent-bindings-sub)'
          : 'var(--set-neutral)',
    }))
  })

  const activeMultiAccountRow = computed(() => {
    const src = activeSource.value
    const rows = src?.multiAccounts
    if (!Array.isArray(rows) || !rows.length) {
      return { entityId: '', label: '', entityMap: {} }
    }
    const idx = Math.min(editingMultiAccountIndex.value, rows.length - 1)
    return rows[idx] || rows[0]
  })

  watch(
    () => activeSource.value?.multiAccounts?.length,
    (len) => {
      if (len == null || len <= 0) return
      if (editingMultiAccountIndex.value >= len) {
        editingMultiAccountIndex.value = 0
        editingMultiAccountKey.value = '0'
      }
    },
  )

  const activeMultiAccountLabel = computed(() =>
    multiAccountEntryLabel(activeMultiAccountRow.value, editingMultiAccountIndex.value),
  )

  function syncMultiFromUi() {
    const row = activeMultiAccountRow.value
    if (row && !row.entityMap) row.entityMap = {}
    syncMultiAccounts(activeSource.value)
  }

  const activeModeLabel = computed(() => {
    const mode = activeSource.value?.mode
    return props.modeOptions.value.find((m) => m.id === mode)?.label || mode || '—'
  })

  const isConfigured = computed(() => {
    const src = activeSource.value
    if (!src) return false
    if (src.mode === 'convention') return resolveAccountNumbers(src).length > 0
    if (src.mode === 'entity') return hasEntityAccountConfig(src)
    if (src.mode === 'multi') return hasMultiAccountConfig(src)
    if (src.entityId?.trim()) return true
    const map = src.entityMap || {}
    return Object.values(map).some((v) => typeof v === 'string' && v.trim())
  })

  return {
    editingMultiAccountIndex,
    editingMultiAccountKey,
    editingEntityAccountIndex,
    editingEntityAccountKey,
    activeSource,
    entityAccountEditTabs,
    activeEntityAccountRow,
    compositeEntityAttrsForEdit,
    multiAccountEditTabs,
    activeMultiAccountRow,
    activeMultiAccountLabel,
    syncMultiFromUi,
    activeModeLabel,
    isConfigured,
  }
}

// ── useSettingsAccountBindingsHub ──
interface SettingsAccountBindingsHubOptions {
  settingsTabId: string
  defaultCategory: string
  categories: readonly string[]
  fieldMeta: Record<string, AccountBindingFieldMeta>
  tabs: ReadonlyArray<{ id: string; label: string; emoji: string; accent: string }>
}

function useSettingsAccountBindingsHub(
  activeTab: () => string,
  options: SettingsAccountBindingsHubOptions,
) {
  const categoryTab = ref(options.defaultCategory)
  const layoutSaving = ref(false)
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const entitiesStore = useEntitiesStore()

  const categoryFields = computed(() => options.fieldMeta)

  const categoryTabs = computed(() => [...options.tabs])

  const modeOptions = computed(() => [
    { id: 'convention', label: '约定命名' },
    { id: 'entity', label: '综合实体' },
    { id: 'multi', label: '多实体' },
  ])

  const activeMeta = computed(
    () => (categoryFields.value as Record<string, AccountBindingFieldMeta>)[categoryTab.value],
  )

  const activeSource = computed((): ReturnType<typeof createDefaultEnergySource> | undefined => {
    ensureSourcesStruct()
    return layoutStore.layoutConfig.statsSensors?.energySources?.[categoryTab.value] as
      | ReturnType<typeof createDefaultEnergySource>
      | undefined
  })

  const activeMappableFields = computed(() => getMappableFields(categoryTab.value as EnergyCategory))

  const activeChartFields = computed(() =>
    ((ENERGY_FIELD_DEFS as Record<string, (typeof ENERGY_FIELD_DEFS)[EnergyCategory]>)[
      categoryTab.value
    ] || []).filter((f) => f.type === 'list' || f.type === 'object'),
  )

  const compositeEntityAttrs = computed(() => {
    const eid = activeSource.value?.entityId?.trim()
    if (!eid) return []
    const ent = entitiesStore.entities[eid]
    if (!ent?.attributes) return []
    return Object.keys(ent.attributes).filter((k) => !k.startsWith('friendly_'))
  })

  function ensureSourcesStruct() {
    const stats = layoutStore.layoutConfig.statsSensors as UILayoutConfig['statsSensors'] & {
      energySources?: Record<string, ReturnType<typeof createDefaultEnergySource>>
    }
    if (!stats) return
    if (!stats.energySources) stats.energySources = {}
    for (const cat of options.categories) {
      if (!stats.energySources[cat]) {
        stats.energySources[cat] = {
          ...createDefaultEnergySource(),
          attrMap: {},
          entityMap: {},
        }
      }
      if (!stats.energySources[cat].attrMap) stats.energySources[cat].attrMap = {}
      if (!stats.energySources[cat].entityMap) stats.energySources[cat].entityMap = {}
      bootstrapAccountStructForMode(stats.energySources[cat])
    }
  }

  function setBindingMode(mode: string) {
    ensureSourcesStruct()
    const src = layoutStore.layoutConfig.statsSensors.energySources![
      categoryTab.value
    ] as ReturnType<typeof createDefaultEnergySource>
    src.mode = mode
    if (mode === 'convention') ensureAccountEntriesOnSource(src)
    if (mode === 'entity') ensureEntityAccountsOnSource(src)
    if (mode === 'multi') ensureMultiAccountsOnSource(src)
  }

  function fillDefaultAttrs() {
    ensureSourcesStruct()
    const src = layoutStore.layoutConfig.statsSensors.energySources![
      categoryTab.value
    ] as ReturnType<typeof createDefaultEnergySource>
    if (!src.attrMap) src.attrMap = {}
    const attrMap = src.attrMap as Record<string, string>
    for (const field of [...activeMappableFields.value, ...activeChartFields.value]) {
      if (!attrMap[field.key]?.trim()) {
        attrMap[field.key] = field.defaultAttr
      }
    }
  }

  function inferFromEntity(mode: string, accountIndex = 0) {
    ensureSourcesStruct()
    const cat = categoryTab.value
    const src = layoutStore.layoutConfig.statsSensors.energySources![
      cat
    ] as ReturnType<typeof createDefaultEnergySource>
    if (mode === 'multi') {
      ensureMultiAccountsOnSource(src)
      const idx = Math.max(0, Math.min(accountIndex, (src.multiAccounts?.length || 1) - 1))
      const row = src.multiAccounts[idx]
      const eid = row?.entityId?.trim()
      if (!eid) return
      const { entityMap, matched } = inferEnergyMapping(
        cat as EnergyCategory,
        eid,
        entitiesStore.entities,
        mode as 'convention' | 'entity' | 'multi',
      )
      row.entityMap = { ...row.entityMap, ...entityMap }
      if (!(row.entityMap as Record<string, string>).balance) {
        ;(row.entityMap as Record<string, string>).balance = eid
      }
      syncMultiAccounts(src)
      chrome.notify(
        matched
          ? `已为账户 ${idx + 1} 推断匹配 ${matched} 个字段`
          : '未找到可匹配的字段，请检查实体前缀或手动映射',
        matched ? 'success' : 'info',
      )
      return
    }
    if (mode === 'entity') {
      ensureEntityAccountsOnSource(src)
      const idx = Math.max(0, Math.min(accountIndex, (src.accountEntities?.length || 1) - 1))
      const row = src.accountEntities[idx]
      const eid = row?.entityId?.trim()
      if (!eid) return
      const { attrMap, entityMap, matched } = inferEnergyMapping(
        cat as EnergyCategory,
        eid,
        entitiesStore.entities,
        mode as 'convention' | 'entity' | 'multi',
      )
      src.attrMap = { ...src.attrMap, ...attrMap }
      src.entityMap = { ...src.entityMap, ...entityMap }
      syncEntityAccounts(src)
      chrome.notify(
        matched
          ? `已为账户 ${idx + 1} 推断匹配 ${matched} 个字段`
          : '未找到可匹配的字段，请检查实体前缀或手动映射',
        matched ? 'success' : 'info',
      )
      return
    }
    const eid = src.entityId?.trim()
    if (!eid) return
    const { entityMap, matched } = inferEnergyMapping(
      cat as EnergyCategory,
      eid,
      entitiesStore.entities,
      mode as 'convention' | 'entity' | 'multi',
    )
    src.entityMap = { ...src.entityMap, ...entityMap }
    if (!(src.entityMap as Record<string, string>).balance) {
      ;(src.entityMap as Record<string, string>).balance = eid
    }
    chrome.notify(
      matched ? `已推断匹配 ${matched} 个字段` : '未找到可匹配的字段，请检查实体前缀或手动映射',
      matched ? 'success' : 'info',
    )
  }

  const initialLayoutConfig = ref<unknown>(null)

  const {
    pendingCount: pendingChanges,
    takeSnapshot: takeLayoutSnapshot,
    confirmAndRevert,
    runHubMount,
  } = useSettingsHubPending({
    snapshot: initialLayoutConfig,
    current: () => liveLifeAccountsLayoutSlice(layoutStore.layoutConfig),
    ready: () => layoutStore.isConfigLoaded,
  })

  useRegisterSettingsTabPending(options.settingsTabId, () => pendingChanges.value > 0)

  function snapshotConfig() {
    takeLayoutSnapshot(pickLifeAccountsLayoutSlice(layoutStore.layoutConfig))
  }

  function resetCategoryTabs() {
    categoryTab.value = options.defaultCategory
  }

  useSettingsSidebarReentryReset(activeTab, options.settingsTabId, resetCategoryTabs)

  async function saveLayoutConfig() {
    layoutSaving.value = true
    try {
      const ok = await layoutStore.saveLayout(true)
      if (!ok) return
      chrome.notify('已保存', 'success')
      snapshotConfig()
      syncGlobalLayoutPendingSnapshot(layoutStore.layoutConfig)
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '保存失败，请稍后重试'), 'error')
    } finally {
      layoutSaving.value = false
    }
  }

  async function cancelLayoutChanges() {
    await confirmAndRevert(
      chrome,
      (baseline) => {
        applyLifeAccountsLayoutSlice(
          layoutStore.layoutConfig,
          baseline as ReturnType<typeof pickLifeAccountsLayoutSlice>,
        )
      },
      { onReverted: () => afterLayoutCancelSync(layoutStore.layoutConfig) },
    )
  }

  runHubMount({
    syncLayout: true,
    init: () => {
      ensureSourcesStruct()
    },
    afterMount: () => {
      snapshotConfig()
    },
  })

  return {
    categoryTab,
    categoryTabs,
    modeOptions,
    activeMeta,
    activeMappableFields,
    activeChartFields,
    compositeEntityAttrs,
    pendingChanges,
    layoutSaving,
    setBindingMode,
    fillDefaultAttrs,
    inferFromEntity,
    saveLayoutConfig,
    cancelLayoutChanges,
  }
}

// ── useSettingsLifeAccountsHub ──
/** useSettingsLifeAccountsHub：函数，按签名入参返回处理结果。 */
export function useSettingsLifeAccountsHub(activeTab: () => string) {
  return useSettingsAccountBindingsHub(activeTab, {
    settingsTabId: 'life-accounts',
    defaultCategory: 'grid',
    categories: ACCOUNT_BINDING_TABS.map((t) => t.id),
    fieldMeta: ACCOUNT_BINDING_FIELD_META,
    tabs: ACCOUNT_BINDING_TABS,
  })
}
