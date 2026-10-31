/**
 * @file bindings.internals.ts
 * @module frontend/src/views
 */
/** 绑定 Hub：能源/生活账户 */
import {
  type AccountBindingFieldMeta,
  ACCOUNT_BINDING_FIELD_META,
  ACCOUNT_BINDING_TABS,
} from '@/shared/constants/account-binding-meta'
import {
  ENERGY_FIELD_DEFS,
  createDefaultEnergySource,
  getMappableFields,
  inferEnergyMapping,
  type EnergyCategory,
} from '@/shared/energy/constants/energy-fields'
import {
  afterLayoutCancelSync,
  syncGlobalLayoutPendingSnapshot,
  useRegisterSettingsTabPending,
  useSettingsHubPending,
} from '@/composables/settings-kernel/pending.internals'
import { useSettingsSidebarReentryReset } from '@/composables/ui/hub-viewport.internals'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import {
  bootstrapAccountStructForMode,
  ensureAccountEntriesOnSource,
  ensureEntityAccountsOnSource,
  ensureMultiAccountsOnSource,
  syncEntityAccounts,
  syncMultiAccounts,
} from '@/shared/energy/utils/account.util'
import {
  applyLifeAccountsLayoutSlice,
  liveLifeAccountsLayoutSlice,
  pickLifeAccountsLayoutSlice,
} from "../../display/composables/layout-dashboard.internals"
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import type { UILayoutConfig } from '@/shared/types/layout'
import { computed, ref } from 'vue'

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
    revertSilently: revertLayoutSilently,
    runHubMount,
  } = useSettingsHubPending({
    snapshot: initialLayoutConfig,
    current: () => liveLifeAccountsLayoutSlice(layoutStore.layoutConfig),
    ready: () => layoutStore.isConfigLoaded,
    applyBaseline: (baseline) => {
      applyLifeAccountsLayoutSlice(
        layoutStore.layoutConfig,
        baseline as ReturnType<typeof pickLifeAccountsLayoutSlice>,
      )
      afterLayoutCancelSync(layoutStore.layoutConfig)
    },
  })

  // 第三参数：确认离开后真正回滚布局切片草稿
  useRegisterSettingsTabPending(options.settingsTabId, () => pendingChanges.value > 0, revertLayoutSilently)

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
export function useSettingsLifeAccountsHub(activeTab: () => string) {
  return useSettingsAccountBindingsHub(activeTab, {
    settingsTabId: 'life-accounts',
    defaultCategory: 'grid',
    categories: ACCOUNT_BINDING_TABS.map((t) => t.id),
    fieldMeta: ACCOUNT_BINDING_FIELD_META,
    tabs: ACCOUNT_BINDING_TABS,
  })
}

export { useBindingsAccountSection } from '@/features/settings/connect/composables/bindings-account.internals'
export { useHaBindings } from '@/features/settings/connect/composables/bindings-ha.internals'
export { useBindingsRecommend } from '@/features/settings/connect/composables/bindings-recommend.internals'
