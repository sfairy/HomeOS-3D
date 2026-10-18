/**
 * @file home-mode-editor.internals.ts
 * @module frontend/src/views
 */
/** composables：自 home-mode.internals.ts 拆出 — 合并自 home-mode-panel.context / useHomeModeActionsSection / useHomeModeEditor 等 */
import { getEntityLeaf } from '@homeos/shared'
import { useEntitiesStore } from '@/stores/entities.store'
import { domainIndexToArray } from '@/shared/entity/utils/derived.util'
import { resolveHomeModeTabEmoji } from '@/shared/utils/settings/tab-emoji.util'
import { DOMAIN_SERVICES, servicesForDomain } from '@/shared/utils/registry/widget-catalog'
import type { ComputedRef, Ref } from 'vue'
import { computed, ref, shallowRef, watch } from 'vue'
import {
  buildSaveBody,
  emptyHomeModeDraft,
  isDraftDirty,
  modeRecordToDraft,
  validateModeDraft,
  type ActionTemplate,
  type HomeModeRecord,
  type ModeDraft,
} from './draft.internals'
import { useHomeModeEditorBatch } from './editor-batch.internals'
import { useHomeModeActionsSection } from './editor-actions.internals'
export { useHomeModeActionsSection }
export {
  useHomeModeItemExpansion,
  useHomeModeItemFocus,
} from './editor-expansion.internals'

// ── home-mode-panel.context ──
interface HomeModePanelBridge {
  pendingCount: Ref<number> | ComputedRef<number>
  saving: Ref<boolean>
  onSave: () => void | Promise<void>
  onCancel: () => void
  showModeToolbar: ComputedRef<boolean>
  activeTab: Ref<string>
  displayModeTabs: ComputedRef<Array<Record<string, unknown>>>
  switchTab: (id: string) => void | Promise<void>
  onModeReorder: (payload: unknown) => void
  handleSeed: () => void
  handleCreate: () => void
  exportModesJson: () => void
  onImportFile: (ev: Event) => void
}

/** shallowRef：避免深层 reactive 解包嵌套 Ref/Computed，导致外层 .value 读到 undefined */
const bridge = shallowRef<HomeModePanelBridge | null>(null)

export function setHomeModePanelBridge(ctx: HomeModePanelBridge | null) {
  bridge.value = ctx
}

export function useHomeModePanelBridge() {
  return bridge
}

// ── useHomeModeActionsSection ──


// ── useHomeModeEditor ──
function tabIconFields(icon: string | null | undefined) {
  return { emoji: resolveHomeModeTabEmoji(icon) }
}

export function useHomeModeEditor(modesRef: Ref<HomeModeRecord[] | null | undefined>) {
  const entitiesStore = useEntitiesStore()

  const triggerTypeOptions = computed(() => [
    { id: 'manual', label: '仅手动', desc: '仅通过顶栏或本页按钮切换' },
    { id: 'arrive_home', label: '有人到家', desc: '成员到家时自动激活（适合回家模式）' },
    { id: 'lock_unlock', label: '门锁解锁', desc: '指定门锁解锁时自动激活' },
    { id: 'all_leave', label: '全员离家', desc: '检测到所有人离开家时激活' },
    {
      id: 'calendar_away',
      label: '日历离家',
      desc: '外部日历标记「外出/away」时自动匹配；无需填写实体',
    },
    { id: 'time', label: '定时', desc: '每天指定时刻自动激活（HH:mm）' },
    { id: 'state', label: '实体状态', desc: '某实体变为指定状态时激活' },
  ])

  const actionKindOptions = computed(() => [
    { id: 'entity', label: '单实体', desc: '调用 HA 服务控制单个实体' },
    { id: 'scene', label: '场景', desc: '激活 scene.* 场景' },
    { id: 'script', label: '脚本', desc: '运行 script.* 脚本' },
    { id: 'notify', label: '应用通知', desc: '写入 HomeOS 通知中心' },
    { id: 'security', label: '安防模式', desc: '撤防 / 在家布防 / 外出布防 / 夜间布防' },
  ])

  const exclusiveGroupOptions = [
    { value: 'default', label: '默认（日常模式互斥）' },
    { value: 'comfort', label: '舒适（睡眠/影音等互斥）' },
  ]

  const homeModeIconOptions = computed(() => [
    { value: '🏠', label: '家 🏠' },
    { value: '🚪', label: '门 🚪' },
    { value: '🌙', label: '睡眠 🌙' },
    { value: '🎬', label: '影音 🎬' },
    { value: '🍽', label: '用餐 🍽' },
    { value: '🌴', label: '度假 🌴' },
    { value: '🚗', label: '外出 🚗' },
    { value: 'door-open', label: '开门' },
    { value: 'door-closed', label: '关门' },
    { value: 'moon', label: '月亮' },
    { value: 'film', label: '胶片' },
    { value: 'utensils', label: '餐具' },
    { value: 'palmtree', label: '棕榈' },
  ])

  const activeTab = ref<string>('')
  const drafts = ref<Record<string, ModeDraft>>({})

  const actionFocusEpoch = ref(0)
  const actionFocusIndex = ref<number | null>(null)
  const triggerFocusEpoch = ref(0)
  const triggerFocusIndex = ref<number | null>(null)

  function focusActionAt(index: number) {
    if (index < 0) return
    actionFocusIndex.value = index
    actionFocusEpoch.value += 1
  }

  function focusTriggerAt(index: number) {
    if (index < 0) return
    triggerFocusIndex.value = index
    triggerFocusEpoch.value += 1
  }

  const allDomains = computed(() => {
    const staticDomains = Object.keys(DOMAIN_SERVICES).sort()
    const entityDomains = [...entitiesStore.domains].sort()
    return [...new Set([...staticDomains, ...entityDomains])].sort()
  })

  const modeTabs = computed(() => {
    const tabs = []
    for (const m of modesRef.value || []) {
      const d = drafts.value[m.id]
      tabs.push({
        id: m.id,
        label: d?.name || m.name,
        ...tabIconFields(d?.icon || m.icon),
        accent: '#818cf8',
      })
    }
    for (const [id, dRaw] of Object.entries(drafts.value)) {
      const d = dRaw
      if (!id.startsWith('draft_') || !d.isNew) continue
      tabs.push({
        id,
        label: d.name || '新模式',
        emoji: '✨',
        accent: '#59d3c0',
      })
    }
    return tabs
  })

  function resolveTabAfterRemove(removedId: string) {
    const tabs = modeTabs.value
    const idx = tabs.findIndex((t) => t.id === removedId)
    if (idx >= 0) {
      const neighbor = tabs[idx + 1] || (idx > 0 ? tabs[idx - 1] : null)
      if (neighbor) return neighbor.id
    }
    const remaining = tabs.filter((t) => t.id !== removedId)
    return remaining[0]?.id || ''
  }

  function ensureValidActiveTab() {
    const validIds = new Set([
      ...(modesRef.value || []).map((m) => m.id),
      ...Object.keys(drafts.value).filter((k) => k.startsWith('draft_') && drafts.value[k]?.isNew),
    ])
    if (!validIds.size) {
      activeTab.value = ''
      return
    }
    if (!activeTab.value || !validIds.has(activeTab.value)) {
      activeTab.value = resolveTabAfterRemove(activeTab.value) || [...validIds][0] || ''
    }
  }

  function syncDrafts() {
    const next: Record<string, ModeDraft> = { ...drafts.value }
    const ids = new Set<string>()
    for (const m of modesRef.value || []) {
      ids.add(m.id)
      const existing = next[m.id]
      if (!existing) {
        next[m.id] = modeRecordToDraft(m)
      } else if (!existing.isNew) {
        next[m.id] = existing
      }
    }
    for (const id of Object.keys(next)) {
      if (id.startsWith('draft_') && !ids.has(id)) continue
      if (!ids.has(id) && !id.startsWith('draft_')) delete next[id]
    }
    drafts.value = next
    ensureValidActiveTab()
  }

  watch(
    () => {
      const list = modesRef.value || []
      return `${list.length}:${list.map((m) => m.id).join(',')}`
    },
    syncDrafts,
    { immediate: true },
  )

  const activeDraft = computed(() => {
    const id = activeTab.value
    if (!id) return null
    return drafts.value[id] || null
  })

  const activeDraftDirty = computed(() => {
    const draft = activeDraft.value
    if (!draft) return false
    if (draft.isNew) return true
    const mode = (modesRef.value || []).find((m) => m.id === activeTab.value)
    return isDraftDirty(draft, mode)
  })

  const batchEditor = useHomeModeEditorBatch({ activeDraft, focusActionAt })

  function refreshDraftFromMode(id: string) {
    const mode = (modesRef.value || []).find((m) => m.id === id)
    if (!mode) return
    drafts.value = { ...drafts.value, [id]: modeRecordToDraft(mode) }
  }

  function createDraft() {
    const id = `draft_${Date.now()}`
    drafts.value = {
      ...drafts.value,
      [id]: emptyHomeModeDraft(),
    }
    activeTab.value = id
    return id
  }

  function removeDraft(id: string, nextTabId: string) {
    const next: Record<string, ModeDraft> = { ...drafts.value }
    delete next[id]
    drafts.value = next
    if (activeTab.value === id) {
      activeTab.value = nextTabId ?? resolveTabAfterRemove(id)
      ensureValidActiveTab()
    }
  }

  function addAction() {
    const d = activeDraft.value
    if (!d) return -1
    d.actions.push({
      kind: 'entity',
      entity_id: '',
      domain: '',
      service: '',
      delay: 0,
      service_data: '',
    })
    const index = d.actions.length - 1
    focusActionAt(index)
    return index
  }

  function resolveTemplateEntityId(tpl: ActionTemplate): string {
    const kind = tpl?.kind || 'entity'
    if (kind === 'notify') {
      return String(tpl.placeholder || tpl.entity_id || '模式已切换')
    }
    if (kind === 'security') {
      return String(tpl.entity_id || tpl.placeholder || 'disarmed')
    }
    const domain = String(tpl?.domain || '').trim()
    if (domain) {
      const ids = domainIndexToArray(entitiesStore.domainEntityIndex.get(domain)) || []
      if (ids.length === 1) return ids[0]
      if (ids.length > 1) {
        const ph = String(tpl.placeholder || '')
        const hinted = ph.match(/([a-z_]+\.[a-z0-9_.]+)/i)?.[1]
        if (hinted && ids.includes(hinted)) return hinted
        const partial = ids.find((id) => hinted && id.includes(getEntityLeaf(hinted) || ''))
        if (partial) return partial
        return ids[0]
      }
    }
    const ph = String(tpl.placeholder || '')
    const match = ph.match(/([a-z_]+\.[a-z0-9_.]+)/i)
    return match?.[1] || ph.split(/\s+/)[0] || ''
  }

  function applyTemplate(tpl: ActionTemplate) {
    const d = activeDraft.value
    if (!d || !tpl) return
    const sd = tpl.service_data ? JSON.stringify(tpl.service_data, null, 2) : ''
    const kind = tpl.kind || 'entity'
    d.actions.push({
      kind,
      entity_id: resolveTemplateEntityId(tpl),
      domain: tpl.domain || (kind === 'notify' ? 'notify' : kind === 'security' ? 'security' : ''),
      service: tpl.service || 'turn_on',
      delay: 0,
      service_data: sd,
    })
    focusActionAt(d.actions.length - 1)
  }

  function addTrigger() {
    const d = activeDraft.value
    if (!d) return -1
    if (!d.triggers) d.triggers = []
    d.triggers.push({ type: 'manual', entityId: '', at: '', to: '', from: '' })
    const index = d.triggers.length - 1
    focusTriggerAt(index)
    return index
  }

  function isTabDirty(tabId: string) {
    const draft = drafts.value[tabId]
    if (!draft) return false
    if (draft.isNew) return true
    const mode = (modesRef.value || []).find((m) => m.id === tabId)
    return isDraftDirty(draft, mode)
  }

  return {
    activeTab,
    drafts,
    modeTabs,
    activeDraft,
    activeDraftDirty,
    refreshDraftFromMode,
    isTabDirty,
    allDomains,
    ...batchEditor,
    servicesForDomain,
    createDraft,
    removeDraft,
    resolveTabAfterRemove,
    ensureValidActiveTab,
    addAction,
    addTrigger,
    buildSaveBody,
    validateModeDraft,
    applyTemplate,
    actionFocusEpoch,
    actionFocusIndex,
    triggerFocusEpoch,
    triggerFocusIndex,
    focusActionAt,
    focusTriggerAt,
    triggerTypeOptions,
    actionKindOptions,
    homeModeIconOptions,
    exclusiveGroupOptions,
  }
}


