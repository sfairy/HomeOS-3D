/**
 * @file useLinkageHub.ts
 * @module frontend/src/composables
 */
import { ref, computed, watch, onMounted, onActivated, onDeactivated } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  createOrchestratorItem,
  deleteOrchestratorItem,
  executeScene,
  executeScript,
  fetchOrchestratorBuiltinTemplates,
  fetchOrchestratorItem,
  installOrchestratorBuiltinTemplate,
  toggleAutomation,
  triggerOrchestratorItem,
  type OrchestratorKind,
} from '@/services/api/orchestrator'
import { useChromeStore } from '@/stores/chrome.store'
import { useAuthStore } from '@/stores/auth.store'
import { notifyError } from '@/services/notify'
import { useEntitiesStore } from '@/stores/entities.store'
import { domainIndexToArray } from '@/utils/entity/derived.util'
import { logger } from '@/utils/core/logger'
import { SETTINGS_ROUTES, settingsRoute } from '@/utils/registry/settings-route.util'
import { useOrchestratorListPage } from '@/composables/orchestrator/useOrchestratorListPage'
import {
  orchestratorHasPlaceholder,
  orchestratorItemHasDrift,
  isIncompleteOrchestratorItem,
  type OrchestratorListItem,
} from '@/utils/orchestrator/list.util'
import {
  buildScriptExecVariables,
  initScriptExecVars,
  type ScriptExecField,
} from '@/utils/orchestrator/script-crud.util'
import { parseScriptYamlToForm } from '@/utils/orchestrator/script-yaml-parser.util'
import {
  LINKAGE_HUB_KIND_META,
  LINKAGE_HUB_OVERVIEW_META,
  parseLinkageHubTab,
  isLinkageHubKind,
  linkageOrchestratorApiKind,
  type LinkageHubTab,
  type LinkageHubKind,
  type LinkageHubTrack,
} from '@/composables/orchestrator/linkage-hub.types'
import { useLinkageHubOverview } from '@/composables/orchestrator/useLinkageHubOverview'
import { useLinkageHubSync } from '@/composables/orchestrator/useLinkageHubSync'
import {
  hasOrchestratorBuilderDirty,
  clearOrchestratorBuilderDirty,
} from '@/composables/settings/hub-backup-orchestrator.internals'

const HUB_TAB_ACCENTS: Record<LinkageHubTab, string> = {
  overview: '#5fd4ff',
  scene: '#38bdf8',
  automation: '#fbbf24',
  script: '#34d399',
  template: '#a78bfa',
}

function linkageOrchestratorKind(tab: LinkageHubKind): OrchestratorKind {
  return linkageOrchestratorApiKind(tab)
}

/** useLinkageHub：函数，按签名入参返回处理结果。 */
export function useLinkageHub() {
  const route = useRoute()
  const router = useRouter()
  const chrome = useChromeStore()
  const authStore = useAuthStore()
  const entitiesStore = useEntitiesStore()

  const isAdmin = computed(() => authStore.role === 'admin')
  /** 新建 / 模板库 / 同步修复：admin 与 adult */
  const canManageOrchestrator = computed(
    () => authStore.role === 'admin' || authStore.role === 'adult',
  )

  const sceneList = useOrchestratorListPage('scene', '场景加载失败')
  const automationList = useOrchestratorListPage('automation', '自动化加载失败')
  const scriptList = useOrchestratorListPage('script', '脚本加载失败')
  const templateList = useOrchestratorListPage('template-entity', '模板实体加载失败')

  const overview = useLinkageHubOverview({
    scene: sceneList,
    automation: automationList,
    script: scriptList,
    template: templateList,
  })

  /** 本地 Tab；点击时同步写回 URL，深链/激活时按 query 读入（不清 dirty 的 force） */
  const activeTab = ref<LinkageHubTab>(parseLinkageHubTab(route.query.tab))
  /** 丢弃未保存后递增，迫使抽屉内 KeepAlive 重建 */
  const builderRemountEpoch = ref(0)
  /** 防止快速连点时多次 confirm / 过期的 apply 回写 */
  let tabApplySeq = 0
  /** 本地写 URL 后短暂忽略 route→local，避免 replace 乱序把 Tab 打回 */
  let suppressRouteTabSyncUntil = 0

  const activeKind = computed<LinkageHubKind | null>(() =>
    isLinkageHubKind(activeTab.value) ? activeTab.value : null,
  )

  function writeHubTabToUrl(tab: LinkageHubTab) {
    const cur = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab
    const nextTab = tab === 'overview' ? undefined : tab
    const query = { ...route.query }
    // 切 tab 时清掉深链 edit，避免用新 tab 的 builder 打开旧 id
    delete query.edit
    delete query.wizard
    delete query.orchTab
    if (nextTab) query.tab = nextTab
    else delete query.tab
    const curEdit = Array.isArray(route.query.edit) ? route.query.edit[0] : route.query.edit
    if (
      String(cur || '') === String(nextTab || '') &&
      !curEdit &&
      route.query.wizard == null &&
      route.query.orchTab == null
    ) {
      return
    }
    suppressRouteTabSyncUntil = Date.now() + 500
    void router.replace({ query }).catch(() => {
      /* 导航被取消时忽略 */
    })
  }

  async function applyHubTabLocal(
    next: LinkageHubTab,
    opts?: { force?: boolean; syncUrl?: boolean; closeDrawer?: boolean },
  ) {
    const seq = ++tabApplySeq
    if (activeTab.value === next) {
      if (opts?.syncUrl) writeHubTabToUrl(next)
      return true
    }
    // 仅抽屉打开且有未保存修改时拦截；抽屉已关但 dirty 残留则静默清理，避免「点了没反应」
    if (!opts?.force && hasOrchestratorBuilderDirty()) {
      if (!builderDrawerOpen.value) {
        clearOrchestratorBuilderDirty()
      } else {
        const ok = await chrome.confirm(
          '当前联动有未保存的修改，切换将丢弃更改。是否继续？',
          '未保存的修改',
          { confirmText: '丢弃并切换', cancelText: '继续编辑', type: 'warning' },
        )
        if (seq !== tabApplySeq) return false
        if (!ok) return false
        clearOrchestratorBuilderDirty()
        builderRemountEpoch.value += 1
      }
    }
    if (seq !== tabApplySeq) return false
    activeTab.value = next
    if (next === 'template') trackFilter.value = 'homeos'
    if (opts?.closeDrawer !== false) {
      forceCloseBuilderDrawer()
      dismissTransientOverlays()
    } else {
      dismissTransientOverlays()
    }
    resetFilters()
    if (opts?.syncUrl) writeHubTabToUrl(next)
    void loadActiveTabIfNeeded()
    return true
  }

  /** 从路由同步 Tab：仅当 query.tab 有值且与本地不同；不 force，尊重 dirty */
  function syncHubTabFromRoute() {
    if (Date.now() < suppressRouteTabSyncUntil) return
    const raw = route.query.tab
    if (raw == null || raw === '') {
      // URL 无 tab 表示总览；仅在本地不是 overview 时回写（浏览器后退等）
      if (activeTab.value !== 'overview') {
        void applyHubTabLocal('overview', { closeDrawer: true })
      }
      return
    }
    const next = parseLinkageHubTab(raw)
    if (next === activeTab.value) return
    void applyHubTabLocal(next, { closeDrawer: true })
  }

  function resolveDeepLinkKind(): LinkageHubKind | null {
    const orchRaw = Array.isArray(route.query.orchTab)
      ? route.query.orchTab[0]
      : route.query.orchTab
    if (orchRaw != null && String(orchRaw).trim()) {
      const parsed = parseLinkageHubTab(orchRaw)
      if (isLinkageHubKind(parsed)) return parsed
    }
    const tabRaw = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab
    if (tabRaw != null && String(tabRaw).trim()) {
      const parsed = parseLinkageHubTab(tabRaw)
      if (isLinkageHubKind(parsed)) return parsed
    }
    if (isLinkageHubKind(activeTab.value)) return activeTab.value
    return null
  }

  /**
   * 打开 URL 深链指定的 editId（仅在 URL 含 ?edit= 时生效）。
   * 供 onMounted 在列表加载完后调用，避免打开抽屉时对应类型列表尚未加载导致 builder 取不到数据。
   */
  async function openDeepLinkEdit(): Promise<void> {
    const editParam = route.query.edit
    if (!editParam) return
    const editId = Array.isArray(editParam) ? editParam[0] : editParam
    const kind = resolveDeepLinkKind()
    if (!kind) return
    const ok =
      kind === activeTab.value || (await applyHubTabLocal(kind, { syncUrl: true }))
    if (ok) openBuilderDrawer(String(editId), false, kind)
  }

  /**
   * 单一路由观察器：合并「tab 同步」与「深链 edit 打开」，
   * 避免之前两个 watcher 重复 applyHubTabLocal（会把 edit 从 URL 清掉）。
   * 顺序：先切 tab（若需要），再打开 edit 深链。
   */
  watch(
    () => [route.query.tab, route.query.orchTab, route.query.edit] as const,
    async () => {
      // 1) 本地 tab 与 URL 不同步时先对齐（尊重 dirty 拦截）
      syncHubTabFromRoute()

      // 2) 有 edit 深链：确保对应 kind 已激活后再打开 drawer
      if (!route.query.edit) return
      const editId = Array.isArray(route.query.edit)
        ? route.query.edit[0]
        : route.query.edit
      const kind = resolveDeepLinkKind()
      if (!kind) return
      const ok =
        kind === activeTab.value || (await applyHubTabLocal(kind, { syncUrl: true }))
      if (ok) openBuilderDrawer(String(editId), false, kind)
    },
  )

  function onActiveTabChange(tabId: string) {
    void applyHubTabLocal(parseLinkageHubTab(tabId), { syncUrl: true })
  }

  async function refreshActiveTabInBackground() {
    if (activeTab.value === 'overview') {
      await overview.reloadOverview({ background: true })
      return
    }
    await listState.value.loadList({ background: true })
  }

  onActivated(() => {
    syncHubTabFromRoute()
    void refreshActiveTabInBackground()
  })

  onDeactivated(() => {
    // 保留抽屉与 dirty；仅关闭瞬态弹层
    dismissTransientOverlays()
  })

  const trackFilter = ref<LinkageHubTrack>('homeos')
  const searchQuery = ref('')
  const sourceFilter = ref('all')
  const placeholderFilter = ref('all')
  const healthFilter = ref('all')
  const enabledFilter = ref('all')

  const actionId = ref<string | null>(null)
  const importingDemo = ref(false)
  const templatePickerOpen = ref(false)
  const templateLoading = ref(false)
  const templates = ref<Array<{ id: string; name: string; description?: string }>>([])
  const installingTemplateId = ref<string | null>(null)

  const builderDrawerOpen = ref(false)
  const builderEditId = ref<string | null>(null)
  const builderOpenWizard = ref(false)
  const builderKindOverride = ref<LinkageHubKind | null>(null)
  const builderDrawerKind = computed(
    () => builderKindOverride.value || activeKind.value || 'scene',
  )

  const scriptExecOpen = ref(false)
  const scriptExecTarget = ref<OrchestratorListItem | null>(null)
  const scriptExecFields = ref<ScriptExecField[]>([])
  const scriptExecVars = ref<Record<string, unknown>>({})
  const scriptExecRunning = ref(false)

  const tabMeta = computed(() => {
    if (activeTab.value === 'overview') return LINKAGE_HUB_OVERVIEW_META
    return LINKAGE_HUB_KIND_META[activeTab.value]
  })

  const listState = computed(() => {
    if (activeTab.value === 'overview') return sceneList
    if (activeTab.value === 'automation') return automationList
    if (activeTab.value === 'script') return scriptList
    if (activeTab.value === 'template') return templateList
    return sceneList
  })

  const items = computed(() => {
    return listState.value.items.value
  })
  const loading = computed(() => listState.value.loading.value)
  const listInitialLoading = computed(() => loading.value && !items.value.length)
  const error = computed(() => listState.value.error.value)
  const syncLoading = computed(() => listState.value.syncLoading.value)
  const syncStatusMap = computed(() => listState.value.syncStatusMap.value)
  const driftCount = computed(() => listState.value.driftCount.value)

  const sourceFilters = [
    { key: 'all', label: '全部来源' },
    { key: 'local', label: '本地引擎' },
    { key: 'ha', label: 'HA 执行' },
  ]
  const placeholderFilters = [
    { key: 'all', label: '全部实体' },
    { key: 'placeholder', label: '含占位符' },
  ]
  const healthFilters = computed(() => {
    if (activeTab.value === 'template') {
      return [
        { key: 'all', label: '全部' },
        { key: 'attention', label: '需关注' },
        { key: 'drift', label: '漂移' },
      ]
    }
    return [
      { key: 'all', label: '全部状态' },
      { key: 'attention', label: '需关注' },
      { key: 'drift', label: '漂移' },
    ]
  })
  const enabledFilters = [
    { key: 'all', label: '全部' },
    { key: 'enabled', label: '已启用' },
    { key: 'disabled', label: '已禁用' },
  ]

  const hasActiveFilters = computed(
    () =>
      Boolean(searchQuery.value) ||
      sourceFilter.value !== 'all' ||
      placeholderFilter.value !== 'all' ||
      healthFilter.value !== 'all' ||
      (activeTab.value === 'automation' &&
        enabledFilter.value !== 'all'),
  )

  function applyChipFilters(list: OrchestratorListItem[]) {
    const meta = itemFilterMeta.value
    let result = list
    if (activeTab.value === 'template') {
      if (healthFilter.value === 'attention') {
        result = result.filter((item) => meta.get(String(item.id ?? ''))?.needsAttention)
      } else if (healthFilter.value === 'drift') {
        result = result.filter((item) => meta.get(String(item.id ?? ''))?.hasDrift)
      }
      return result
    }
    if (activeTab.value === 'automation') {
      if (enabledFilter.value === 'enabled') result = result.filter((i) => i.enabled)
      else if (enabledFilter.value === 'disabled') result = result.filter((i) => !i.enabled)
    }
    if (sourceFilter.value === 'ha') result = result.filter((i) => i.runOnHa)
    else if (sourceFilter.value === 'local') result = result.filter((i) => !i.runOnHa)
    if (placeholderFilter.value === 'placeholder') {
      result = result.filter((item) => meta.get(String(item.id ?? ''))?.hasPlaceholder)
    }
    if (healthFilter.value === 'attention') {
      result = result.filter((item) => meta.get(String(item.id ?? ''))?.needsAttention)
    } else if (healthFilter.value === 'drift') {
      result = result.filter((item) => meta.get(String(item.id ?? ''))?.hasDrift)
    }
    return result
  }

  const itemFilterMeta = computed(() => {
    const sync = syncStatusMap.value
    const map = new Map<
      string,
      { hasPlaceholder: boolean; hasDrift: boolean; needsAttention: boolean }
    >()
    for (const item of items.value) {
      const id = String(item.id ?? '')
      if (!id) continue
      const hasPlaceholder = orchestratorHasPlaceholder(item)
      const hasDrift = orchestratorItemHasDrift(item, sync)
      const templateAttention =
        activeTab.value === 'template' && Boolean(item.needsAttention || item.stubYaml)
      map.set(id, {
        hasPlaceholder,
        hasDrift,
        needsAttention: Boolean(
          templateAttention ||
            item.blockedReason ||
            isIncompleteOrchestratorItem(item) ||
            hasPlaceholder ||
            hasDrift,
        ),
      })
    }
    return map
  })

  const filterScopedItems = computed(() => applyChipFilters(items.value))

  const filteredItems = computed(() => {
    const list = filterScopedItems.value
    const q = searchQuery.value.toLowerCase()
    if (!q) return list
    if (activeTab.value === 'template') {
      return list.filter(
        (item) =>
          (item.name || '').toLowerCase().includes(q) ||
          String(item.entityId || item.entity_id || '')
            .toLowerCase()
            .includes(q),
      )
    }
    return list.filter((item) => (item.name || '').toLowerCase().includes(q))
  })

  const searchOptions = computed(() =>
    filterScopedItems.value
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh'))
      .map((item) => {
        const id = String(item.id ?? '')
        const meta = itemFilterMeta.value.get(id)
        const hints: string[] = []
        if (activeTab.value === 'template') {
          if (item.stubYaml) hints.push('需补全')
          else if (item.needsAttention) hints.push('需关注')
          if (meta?.hasDrift) hints.push('漂移')
        } else {
          if (item.runOnHa) hints.push('HA 执行')
          else hints.push('本地引擎')
          if (meta?.hasPlaceholder) hints.push('含占位符')
          if (meta?.hasDrift) hints.push('漂移')
          else if (meta?.needsAttention) hints.push('需关注')
        }
        return {
          value: id,
          label: String(item.name || item.id || ''),
          hint: hints.join(' · '),
        }
      })
      .filter((opt) => opt.value),
  )

  const placeholderItemCount = computed(() => {
    if (activeTab.value === 'overview') {
      return (
        sceneList.items.value.filter((i) => orchestratorHasPlaceholder(i)).length +
        automationList.items.value.filter((i) => orchestratorHasPlaceholder(i)).length +
        scriptList.items.value.filter((i) => orchestratorHasPlaceholder(i)).length
      )
    }
    if (activeTab.value === 'template') return 0
    return items.value.filter((item) => orchestratorHasPlaceholder(item)).length
  })

  const enabledCount = computed(
    () => items.value.filter((i) => i.enabled && !i.runOnHa && !i.blockedReason).length,
  )

  const kindAttentionCount = computed(() => {
    const syncMap = syncStatusMap.value
    const kind = activeKind.value
    if (!kind) return 0
    return items.value.filter((item) => {
      if (orchestratorItemHasDrift(item, syncMap)) return true
      if (orchestratorHasPlaceholder(item)) return true
      if (item.blockedReason) return true
      if (kind === 'template' && (item.needsAttention || item.stubYaml)) return true
      return false
    }).length
  })

  const kindExec24h = computed(() => {
    const kind = activeKind.value
    if (!kind || kind === 'template') return 0
    const byType = overview.executionSummary.value.byType || {}
    return Number(byType[kind] || 0)
  })

  const statCells = computed(() => {
    if (activeTab.value === 'overview') return overview.kpiCells.value
    const meta = tabMeta.value
    const kind = activeTab.value
    const filtering = hasActiveFilters.value
    const total = items.value.length
    const attention = kindAttentionCount.value
    const drift = driftCount.value
    const exec24 = kindExec24h.value

    if (kind === 'template') {
      const stubCount = items.value.filter((i) => i.stubYaml).length
      return [
        {
          key: 'total',
          label: '模板实体',
          value: String(total),
          tone: total ? meta.tone : 'muted',
        },
        {
          key: 'attention',
          label: '需关注',
          value: String(attention),
          tone: attention ? 'amber' : 'muted',
        },
        {
          key: 'drift',
          label: '配置漂移',
          value: String(drift),
          tone: drift ? 'amber' : 'muted',
        },
        {
          key: 'stub',
          label: 'Stub 片段',
          value: String(stubCount),
          tone: stubCount ? 'sky' : 'muted',
        },
        {
          key: 'visible',
          label: filtering ? '筛选结果' : '当前列表',
          value: String(filteredItems.value.length),
          tone: filtering ? 'emerald' : meta.tone,
        },
      ]
    }

    const fifth =
      kind === 'automation'
        ? {
            key: 'triggerable',
            label: '可触发自动化',
            value: String(enabledCount.value),
            tone: 'emerald' as const,
          }
        : {
            key: 'visible',
            label: filtering ? '筛选结果' : '当前列表',
            value: String(filteredItems.value.length),
            tone: (filtering ? 'emerald' : meta.tone) as string,
          }

    return [
      {
        key: 'total',
        label: meta.label,
        value: String(total),
        tone: total ? meta.tone : 'muted',
      },
      {
        key: 'attention',
        label: '需关注',
        value: String(attention),
        tone: attention ? 'amber' : 'muted',
      },
      {
        key: 'drift',
        label: '配置漂移',
        value: String(drift),
        tone: drift ? 'amber' : 'muted',
      },
      {
        key: 'exec',
        label: '24H 执行',
        value: String(exec24),
        tone: exec24 ? 'sky' : 'muted',
      },
      fifth,
    ]
  })

  const hubTabs = computed(() => {
    const attention = overview.attentionItems.value.length
    const tabs = [
      {
        id: 'overview',
        label: LINKAGE_HUB_OVERVIEW_META.label,
        emoji: LINKAGE_HUB_OVERVIEW_META.emoji,
        accent: HUB_TAB_ACCENTS.overview,
        count: attention > 0 ? attention : undefined,
      },
      ...(['scene', 'automation', 'script', 'template'] as LinkageHubKind[]).map((id) => {
        const count =
          id === 'scene'
            ? sceneList.items.value.length
            : id === 'automation'
              ? automationList.items.value.length
              : id === 'script'
                  ? scriptList.items.value.length
                  : templateList.items.value.length
        return {
          id,
          label: LINKAGE_HUB_KIND_META[id].label,
          emoji: LINKAGE_HUB_KIND_META[id].emoji,
          accent: HUB_TAB_ACCENTS[id],
          count: count > 0 ? count : undefined,
        }
      }),
    ]
    return tabs
  })

  function resetFilters() {
    searchQuery.value = ''
    sourceFilter.value = 'all'
    placeholderFilter.value = 'all'
    healthFilter.value = 'all'
    enabledFilter.value = 'all'
  }

  async function reloadActiveList() {
    await listState.value.loadList({ background: false })
  }

  const { hubSyncBusy, hubSyncBusyLabel, hubSyncAllToHa, hubRepairAllDrift } = useLinkageHubSync({
    canManageOrchestrator,
    activeTab,
    listState,
    items,
    reloadActiveList,
  })

  async function reloadAllLists() {
    await Promise.all([
      sceneList.loadList(),
      automationList.loadList(),
      scriptList.loadList(),
      templateList.loadList(),
    ])
  }

  async function loadActiveTabIfNeeded() {
    if (activeTab.value === 'overview') {
      await overview.reloadOverview({ background: false })
      return
    }
    const state = listState.value
    const tasks: Promise<void>[] = []
    if (!state.items.value.length && !state.loading.value) {
      tasks.push(state.loadList({ background: false }))
    }
    // 保证头卡片 KPI 所需的其余列表与执行历史可用
    if (!sceneList.items.value.length && activeTab.value !== 'scene') {
      tasks.push(sceneList.loadList({ background: true }))
    }
    if (
      !automationList.items.value.length &&
      activeTab.value !== 'automation'
    ) {
      tasks.push(automationList.loadList({ background: true }))
    }
    if (!scriptList.items.value.length && activeTab.value !== 'script') {
      tasks.push(scriptList.loadList({ background: true }))
    }
    if (!templateList.items.value.length && activeTab.value !== 'template') {
      tasks.push(templateList.loadList({ background: true }))
    }
    tasks.push(overview.loadExecutionHistory({ silent: true }))
    await Promise.all(tasks)
  }

  function navigateToKind(kind: LinkageHubKind) {
    onActiveTabChange(kind)
  }

  function openOverviewItem(kind: LinkageHubKind, itemId: string) {
    onActiveTabChange(kind)
    openBuilderDrawer(itemId)
  }

  function orchestratorRoute(editId?: string) {
    const kind = activeKind.value
    const orchTab =
      kind === 'template' ? 'template' : kind || undefined
    return SETTINGS_ROUTES.orchestrator(orchTab, editId)
  }

  const pendingLocalTemplate = ref<unknown>(null)

  function openBuilderDrawer(
    editId?: string | null,
    openWizard = false,
    kindOverride: LinkageHubKind | null = null,
  ) {
    builderEditId.value = editId || null
    builderOpenWizard.value = openWizard
    builderKindOverride.value = kindOverride
    builderDrawerOpen.value = true
  }

  function forceCloseBuilderDrawer() {
    const wasTemplate = activeTab.value === 'template'
    builderDrawerOpen.value = false
    builderEditId.value = null
    builderOpenWizard.value = false
    builderKindOverride.value = null
    pendingLocalTemplate.value = null
    if (wasTemplate) void reloadActiveList()
  }

  /** 仅关瞬态弹层，不关 Builder 抽屉（keep-alive 失活时用） */
  function dismissTransientOverlays() {
    templatePickerOpen.value = false
    templates.value = []
    installingTemplateId.value = null
    scriptExecOpen.value = false
    scriptExecTarget.value = null
    scriptExecFields.value = []
    scriptExecVars.value = {}
  }

  /** 应用本机「我的模板」：打开新建抽屉，由 Builder 消费 pendingLocalTemplate */
  async function applyLocalTemplateFromHub(tpl: unknown) {
    if (!tpl || typeof tpl !== 'object') return
    if (builderDrawerOpen.value && hasOrchestratorBuilderDirty()) {
      const ok = await chrome.confirm(
        '当前联动有未保存的修改，应用模板将丢弃更改并打开新建画布。是否继续？',
        '未保存的修改',
        { confirmText: '丢弃并应用', cancelText: '继续编辑', type: 'warning' },
      )
      if (!ok) return
      clearOrchestratorBuilderDirty()
      builderRemountEpoch.value += 1
    }
    templatePickerOpen.value = false
    pendingLocalTemplate.value = tpl
    openBuilderDrawer(null, false)
  }

  function clearPendingLocalTemplate() {
    pendingLocalTemplate.value = null
  }

  async function closeBuilderDrawer() {
    if (hasOrchestratorBuilderDirty()) {
      const ok = await chrome.confirm(
        '当前联动有未保存的修改，关闭将丢弃更改。是否继续？',
        '未保存的修改',
        { confirmText: '丢弃并关闭', cancelText: '继续编辑', type: 'warning' },
      )
      if (!ok) return
      clearOrchestratorBuilderDirty()
      builderRemountEpoch.value += 1
    }
    forceCloseBuilderDrawer()
  }

  async function onBuilderSaved() {
    forceCloseBuilderDrawer()
    await reloadActiveList()
  }

  function itemEditRoute(item: OrchestratorListItem) {
    const kind = activeKind.value
    if (!kind) return SETTINGS_ROUTES.orchestrator()
    const needsWizard = orchestratorHasPlaceholder(item)
    const orchTab = kind === 'template' ? 'template' : kind
    return settingsRoute({
      tab: 'orchestrator',
      orchTab,
      edit: item.id,
      ...(needsWizard ? { wizard: 1 } : {}),
    })
  }

  function canPrimaryAction(item: OrchestratorListItem): boolean {
    if (activeTab.value === 'template') return true
    if (orchestratorHasPlaceholder(item)) return false
    if (orchestratorItemHasDrift(item, syncStatusMap.value)) return false
    if (item.blockedReason) return false
    if (activeTab.value === 'script' && !canManageOrchestrator.value) return false
    if (activeTab.value === 'automation') {
      return Boolean(item.enabled)
    }
    return true
  }

  function primaryActionDisabledReason(item: OrchestratorListItem): string {
    if (orchestratorHasPlaceholder(item)) return '含占位符，请先完成配置'
    if (item.blockedReason) return String(item.blockedReason)
    if (orchestratorItemHasDrift(item, syncStatusMap.value)) return '存在 HA 漂移，请先修复'
    if (activeTab.value === 'script' && !canManageOrchestrator.value) {
      return '仅管理员或成人可执行脚本'
    }
    if (activeTab.value === 'automation') {
      if (!item.enabled) return '自动化已禁用'
      if (item.runOnHa) return '由 HA 执行，点击切换到 HA 轨'
    }
    return ''
  }

  async function runPrimaryAction(item: OrchestratorListItem) {
    if (activeTab.value === 'template') {
      openBuilderDrawer(String(item.id ?? ''))
      return
    }
    if (!canPrimaryAction(item)) return
    const itemId = String(item.id ?? '')
    if (!itemId) return

    if (activeTab.value === 'automation' && item.runOnHa) {
      trackFilter.value = 'ha'
      chrome.notify('该自动化由 HA 执行，已切换到 HA 轨', 'info')
      return
    }

    actionId.value = itemId
    try {
      if (activeTab.value === 'scene') {
        const { data } = await executeScene(itemId)
        if (data?.success === false) {
          chrome.notify(data?.message || '部分设备执行失败', 'warning')
        } else {
          chrome.notify(`场景「${item.name}」已执行`, 'success')
        }
      } else if (activeTab.value === 'automation') {
        await triggerOrchestratorItem('automation', itemId)
        chrome.notify(`自动化「${item.name}」已触发`, 'success')
      } else {
        await runScriptExecute(item)
      }
    } catch (e) {
      notifyError(
        e,
        activeTab.value === 'automation' ? '触发失败' : '执行失败',
      )
    } finally {
      actionId.value = null
    }
  }

  async function runScriptExecute(item: OrchestratorListItem) {
    scriptExecTarget.value = item
    scriptExecFields.value = []
    scriptExecVars.value = {}
    try {
      const { data } = await fetchOrchestratorItem('script', String(item.id))
      const form = parseScriptYamlToForm(data.yaml || '')
      scriptExecFields.value = (form.fields || []).filter((f: { name?: string }) => f.name)
      scriptExecVars.value = initScriptExecVars(scriptExecFields.value)
    } catch (e) {
      notifyError(e, '加载脚本字段失败')
      return
    }
    // 无论是否有 fields，均二次确认（与 Geek 脚本 builder 一致）
    scriptExecOpen.value = true
  }

  async function confirmScriptExecute() {
    const item = scriptExecTarget.value
    const itemId = String(item?.id ?? '')
    if (!itemId) return
    const itemName = item?.name ?? itemId
    scriptExecRunning.value = true
    actionId.value = itemId
    const vars = buildScriptExecVariables(scriptExecFields.value, scriptExecVars.value)
    try {
      const { data } = await executeScript(itemId, {
        variables: Object.keys(vars).length ? vars : undefined,
      })
      if (data?.success === false) {
        chrome.notify(data?.message || '脚本执行失败', 'warning')
      } else {
        chrome.notify(`脚本「${itemName}」已执行`, 'success')
      }
      scriptExecOpen.value = false
    } catch (e) {
      notifyError(e, '执行失败')
    } finally {
      scriptExecRunning.value = false
      actionId.value = null
    }
  }

  async function toggleAutomationEnabled(item: OrchestratorListItem) {
    try {
      await toggleAutomation(String(item.id))
      chrome.notify(`自动化「${item.name}」已${item.enabled ? '禁用' : '启用'}`, 'success')
      await reloadActiveList()
    } catch (e) {
      notifyError(e, '切换失败')
    }
  }

  async function deleteItem(item: OrchestratorListItem) {
    if (!isAdmin.value) {
      chrome.notify('仅管理员可删除', 'warning')
      return
    }
    const kind = activeKind.value
    if (!kind) return
    try {
      await deleteOrchestratorItem(linkageOrchestratorKind(kind), String(item.id))
      chrome.notify(`「${item.name}」已删除`, 'success')
      await reloadActiveList()
    } catch (e) {
      notifyError(e, '删除失败')
    }
  }

  async function openTemplatePicker() {
    if (!canManageOrchestrator.value) {
      chrome.notify('仅管理员或成人账号可安装内置模板', 'warning')
      return
    }
    const kind = activeKind.value
    if (!kind || kind === 'template') return
    templates.value = []
    templatePickerOpen.value = true
    templateLoading.value = true
    try {
      const { data } = await fetchOrchestratorBuiltinTemplates(linkageOrchestratorKind(kind))
      templates.value = Array.isArray(data) ? data : []
    } catch (e) {
      notifyError(e, '加载模板失败')
      templatePickerOpen.value = false
    } finally {
      templateLoading.value = false
    }
  }

  /** 跳到含占位的 kind，并打开第一条的占位向导 */
  async function focusPlaceholders() {
    const kinds: LinkageHubKind[] = ['scene', 'automation', 'script']
    let targetKind: LinkageHubKind | null = null
    let targetItem: OrchestratorListItem | null = null

    if (activeKind.value && activeKind.value !== 'template') {
      const hit = items.value.find((i) => orchestratorHasPlaceholder(i))
      if (hit) {
        targetKind = activeKind.value
        targetItem = hit
      }
    }
    if (!targetKind) {
      for (const kind of kinds) {
        const list =
          kind === 'scene'
            ? sceneList.items.value
            : kind === 'automation'
              ? automationList.items.value
              : scriptList.items.value
        const hit = list.find((i) => orchestratorHasPlaceholder(i))
        if (hit) {
          targetKind = kind
          targetItem = hit
          break
        }
      }
    }
    if (!targetKind || !targetItem) {
      chrome.notify('当前没有含占位符的规则', 'info')
      return
    }
    const ok = await applyHubTabLocal(targetKind, { syncUrl: true })
    if (!ok) return
    placeholderFilter.value = 'placeholder'
    openBuilderDrawer(String(targetItem.id), true, targetKind)
  }

  async function installTemplate(templateId: string) {
    if (!canManageOrchestrator.value) {
      chrome.notify('仅管理员或成人账号可安装内置模板', 'warning')
      return
    }
    const kind = activeKind.value
    if (!kind) return
    installingTemplateId.value = templateId
    try {
      const { data } = await installOrchestratorBuiltinTemplate(
        linkageOrchestratorKind(kind),
        templateId,
      )
      const placeholders = data?.placeholders?.length || 0
      chrome.notify(`${tabMeta.value.label}「${data?.name || templateId}」已安装`, 'success')
      templatePickerOpen.value = false
      await reloadActiveList()
      openBuilderDrawer(data?.id, placeholders > 0)
    } catch (e) {
      notifyError(e, '安装失败')
    } finally {
      installingTemplateId.value = null
    }
  }

  function pickDemoLights(limit = 8) {
    const ids = domainIndexToArray(entitiesStore.domainEntityIndex.get('light')) || []
    return ids.slice(0, limit)
  }

  async function importDemoScenes() {
    if (importingDemo.value) return
    const lights = pickDemoLights()
    if (!lights.length) {
      chrome.notify('未发现灯光实体，无法生成示例场景', 'warning')
      return
    }
    importingDemo.value = true
    const presets = [
      {
        name: '回家模式',
        entities: lights.map((id) => ({ entityId: id, state: 'on', brightness: 100 })),
      },
      { name: '离家', entities: lights.map((id) => ({ entityId: id, state: 'off' })) },
      {
        name: '观影模式',
        entities: lights.map((id) => ({ entityId: id, state: 'on', brightness: 15 })),
      },
    ]
    try {
      const { decompileToSceneGeekGraph } = await import('@/utils/geek-scene/decompile')
      const { compileSceneGeekGraphToYaml } = await import('@/utils/geek-scene/compile')
      const { fingerprintSceneYaml } = await import('@homeos/shared')
      let created = 0
      for (const preset of presets) {
        try {
          const { graph } = decompileToSceneGeekGraph({
            name: preset.name,
            entities: preset.entities,
          })
          const yaml = compileSceneGeekGraphToYaml(graph)
          graph.yamlDigest = fingerprintSceneYaml(yaml)
          await createOrchestratorItem('scene', {
            name: preset.name,
            entities: JSON.stringify(preset.entities),
            yaml,
            geekSceneGraph: graph,
          })
          created += 1
        } catch (e) {
          logger.warn('演示场景创建失败', e)
        }
      }
      if (created > 0) {
        chrome.notify(`已导入 ${created} 个示例场景`, 'success')
        await sceneList.loadList()
      } else {
        chrome.notify('示例场景导入失败', 'error')
      }
    } finally {
      importingDemo.value = false
    }
  }

  onMounted(async () => {
    // 首次进入：按 URL 对齐本地 Tab（含空 → overview）
    const initial = parseLinkageHubTab(route.query.tab)
    if (initial !== activeTab.value) {
      activeTab.value = initial
      if (initial === 'template') trackFilter.value = 'homeos'
    }
    if (activeTab.value === 'overview') {
      await overview.reloadOverview({ background: false })
      openDeepLinkEdit()
      return
    }
    const active = activeTab.value
    await listState.value.loadList({ background: false })
    void Promise.all([
      active !== 'scene' ? sceneList.loadList({ background: true }) : Promise.resolve(),
      active !== 'automation'
        ? automationList.loadList({ background: true })
        : Promise.resolve(),
      active !== 'script' ? scriptList.loadList({ background: true }) : Promise.resolve(),
      active !== 'template' ? templateList.loadList({ background: true }) : Promise.resolve(),
      overview.loadExecutionHistory({ silent: true }),
    ])
    openDeepLinkEdit()
  })

  return {
    SETTINGS_ROUTES,
    isAdmin,
    canManageOrchestrator,
    activeTab,
    activeKind,
    onActiveTabChange,
    tabMeta,
    hubTabs,
    overview,
    navigateToKind,
    openOverviewItem,
    trackFilter,
    searchQuery,
    sourceFilter,
    placeholderFilter,
    healthFilter,
    enabledFilter,
    sourceFilters,
    placeholderFilters,
    healthFilters,
    enabledFilters,
    items,
    filteredItems,
    filterScopedItems,
    searchOptions,
    placeholderItemCount,
    loading,
    listInitialLoading,
    error,
    syncLoading,
    syncStatusMap,
    driftCount,
    statCells,
    hasActiveFilters,
    actionId,
    importingDemo,
    templatePickerOpen,
    templateLoading,
    templates,
    installingTemplateId,
    builderDrawerOpen,
    builderEditId,
    builderOpenWizard,
    builderRemountEpoch,
    builderDrawerKind,
    scriptExecOpen,
    scriptExecTarget,
    scriptExecFields,
    scriptExecVars,
    scriptExecRunning,
    reloadActiveList,
    reloadAllLists,
    resetFilters,
    orchestratorRoute,
    openBuilderDrawer,
    closeBuilderDrawer,
    onBuilderSaved,
    itemEditRoute,
    canPrimaryAction,
    primaryActionDisabledReason,
    runPrimaryAction,
    confirmScriptExecute,
    toggleAutomationEnabled,
    deleteItem,
    openTemplatePicker,
    installTemplate,
    applyLocalTemplateFromHub,
    clearPendingLocalTemplate,
    pendingLocalTemplate,
    importDemoScenes,
    focusPlaceholders,
    hubSyncBusy,
    hubSyncBusyLabel,
    hubSyncAllToHa,
    hubRepairAllDrift,
  }
}
