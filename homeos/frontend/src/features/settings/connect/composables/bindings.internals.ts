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
import { logger } from '@/shared/utils/core/logger'
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
} from '../../display/composables/layout-dashboard.internals'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import type { UILayoutConfig } from '@/shared/types/layout'
import {
  buildEnergyConfigPatch,
  isCumulativeEnergyMeter,
  readConfigEnergyMeter,
  readPanelEnergyBinding,
  seedPanelEnergyMeter,
} from '@/shared/energy/utils/binding-bridge.util'
import {
  handleSystemConfigPatchError,
  useSystemConfig,
} from '@/composables/config/system-config-core.internals'
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
  const { load: loadSystemConfig, save: saveSystemConfig, getCached: getCachedSystemConfig } =
    useSystemConfig()
  /** 系统配置里的主电表（能耗聚合实际使用的实体）；用于差异提示 */
  const configEnergyMeter = ref('')

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

  /**
   * 面板主电表不能交给能耗统计时的原因（空串表示可以）。
   *
   * 生活账户的综合实体状态常常是「余额」（¥），能耗聚合要的是累计电量；
   * 把余额表写进 `config.energy` 会让曲线恒为 0，所以提前拦住并说清原因。
   */
  function panelMeterRejection(): string {
    const binding = readPanelEnergyBinding(layoutStore.layoutConfig.statsSensors)
    if (!binding.expressible || !binding.meterEntityId) return ''
    const meter = binding.meterEntityId
    const attrs = entitiesStore.entities[meter]?.attributes
    // 实体还没同步到本地时放行：后端保存时会用同一口径再校验一次
    if (!attrs || isCumulativeEnergyMeter(attrs)) return ''
    return `所选的 ${meter} 不是累计电量（kWh/Wh）传感器，能耗统计仍读取原电表`
  }

  /**
   * 把本页的主电表写进系统配置（面板 → 配置）并返回失败原因。
   *
   * 沿用天气实体的既有约定：界面侧（布局）是操作真源，系统配置是给后端能耗聚合的投影，
   * 保存时布局 → 配置、挂载时配置 → 空布局。反过来让配置赢会在用户毫不知情的情况下
   * 把统计指向另一块表，所以保存方向固定为「本页为准」。
   */
  async function pushEnergyMeterToConfig(): Promise<string | null> {
    const rejected = panelMeterRejection()
    if (rejected) return rejected
    // 不看当前激活的分类：布局是整份保存的，用户可能在电表页改完又切到燃气再点保存。
    const patch = buildEnergyConfigPatch(layoutStore.layoutConfig.statsSensors)
    if (!patch) return null // 约定命名 / 多账户 / 未绑定：没有唯一主表可写
    const next = patch.energy.meterEntityId
    const current = configEnergyMeter.value || readConfigEnergyMeter(getCachedSystemConfig()?.energy)
    if (current === next) return null
    try {
      await saveSystemConfig(patch)
      configEnergyMeter.value = next
      return null
    } catch (error) {
      if (await handleSystemConfigPatchError(error, chrome)) return null
      logger.warn('能耗主电表同步到系统配置失败', error)
      return getApiErrorMessage(error, '系统配置写入失败')
    }
  }

  /**
   * 挂载时把系统配置的主电表补进还没绑定的面板，并记下当前值用于差异提示。
   *
   * 只在面板完全没有实体时写入：用户已有选择不覆盖（那是本页的真源）。
   * 在 `init` 里执行（pending 检测被暂停），补完之后由 `afterMount` 统一拍快照，
   * 避免挂载瞬间闪出「1 项已修改」。
   */
  async function bootstrapEnergyMeter(): Promise<void> {
    try {
      const config = await loadSystemConfig()
      const meter = readConfigEnergyMeter(config?.energy)
      configEnergyMeter.value = meter
      if (!seedPanelEnergyMeter(layoutStore.layoutConfig.statsSensors, meter)) return
      if (!(await layoutStore.saveLayout(true))) return
      syncGlobalLayoutPendingSnapshot(layoutStore.layoutConfig)
    } catch (error) {
      logger.warn('系统配置的主电表回填面板失败', error)
    }
  }

  /**
   * 面板选择的电表与能耗统计实际使用的电表不一致时的提示文案（空串表示一致/无需提示）。
   *
   * 两份配置各存一处，差异本身不是错误，但必须当场说清楚 —— 否则用户会在
   * 「向导里绑过」和「本页绑过」之间反复试探，却看不出统计到底读哪块表。
   */
  const energyBindingNotice = computed(() => {
    if (categoryTab.value !== 'grid') return ''
    const rejected = panelMeterRejection()
    if (rejected) return `${rejected}；换成累计电量表后保存即可交给统计。`
    const configured = configEnergyMeter.value
    if (!configured) return '' // 统计还没绑表，没有「统计读哪块」需要解释
    const panel = readPanelEnergyBinding(layoutStore.layoutConfig.statsSensors)
    if (panel.blockedBy === 'multi-account') {
      return '多账户模式绑定了多块表，能耗统计只跟随主电表；需要整户统计请在首装向导里单独绑定一次。'
    }
    if (!panel.expressible || !panel.meterEntityId) return ''
    if (configured === panel.meterEntityId) return ''
    return `能耗统计当前使用 ${configured}，与本页所选 ${panel.meterEntityId} 不一致；保存后会改用本页所选实体。`
  })

  async function saveLayoutConfig() {
    layoutSaving.value = true
    try {
      const ok = await layoutStore.saveLayout(true)
      if (!ok) return
      const energySyncError = await pushEnergyMeterToConfig()
      if (energySyncError) {
        chrome.notify(`布局已保存，但能耗统计未同步：${energySyncError}`, 'warning')
      } else {
        chrome.notify('已保存', 'success')
      }
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
    init: async () => {
      ensureSourcesStruct()
      // 配置 → 空白面板的回填放在暂停 pending 的窗口内，避免挂载时闪出待保存
      await bootstrapEnergyMeter()
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
    energyBindingNotice,
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
