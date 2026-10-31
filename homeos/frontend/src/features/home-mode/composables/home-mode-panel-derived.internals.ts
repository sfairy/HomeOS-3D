/**
 * @file home-mode-panel-derived.internals.ts
 * @module frontend/src/features/home-mode
 */
/** 家庭模式面板派生状态 */
import { computed, ref } from 'vue'
import { CalendarDays, Link2, Radio, Users, Zap } from '@lucide/vue'
import type { ActionTemplate, ModeActionDraft } from './draft.internals'
import type { useHomeModeEditor } from './editor.internals'
import type { useHomeModePanelContext } from './home-mode-panel-context.internals'
import type { useHomeModes } from './useHomeModes'
import type { useChromeStore } from '@/stores/chrome.store'

export type HomeModeTabs = ReturnType<typeof useHomeModeEditor>['modeTabs']
export type HomeModeEditor = ReturnType<typeof useHomeModeEditor>
export type HomeModeContextApi = ReturnType<typeof useHomeModePanelContext>
export type HomeModesApi = ReturnType<typeof useHomeModes>
export type ChromeStore = ReturnType<typeof useChromeStore>

/** Tab / section / context pill 派生 */
export function createHomeModePanelDerived(d: {
  modeTabs: HomeModeTabs
  activeMode: HomeModesApi['activeMode']
  isTabDirty: HomeModeEditor['isTabDirty']
  activeDraft: HomeModeEditor['activeDraft']
  triggerLogs: HomeModeContextApi['triggerLogs']
  execHistory: HomeModeContextApi['execHistory']
  exclusiveGroupOptions: HomeModeEditor['exclusiveGroupOptions']
  presenceLabel: HomeModeContextApi['presenceLabel']
  modeContext: HomeModeContextApi['modeContext']
  addAction: () => void
  addTrigger: () => void
  applyTemplate: (tpl: ActionTemplate) => void
}) {
  const {
    modeTabs,
    activeMode,
    isTabDirty,
    activeDraft,
    triggerLogs,
    execHistory,
    exclusiveGroupOptions,
    presenceLabel,
    modeContext,
    addAction,
    addTrigger,
    applyTemplate,
  } = d

const activeSection = ref('basic')

const anyModeDraftDirty = computed(() => modeTabs.value.some((tab) => isTabDirty(tab.id)))

const pendingModeChanges = computed(
  () => modeTabs.value.filter((tab) => isTabDirty(tab.id)).length,
)

const displayModeTabs = computed(() =>
  modeTabs.value.map((tab) => {
    const isLive = activeMode.value?.id === tab.id
    const dirty = isTabDirty(tab.id)
    return {
      ...tab,
      label: dirty
        ? `${String(tab.label).replace(/ \*$/, '')} *`
        : String(tab.label).replace(/ \*$/, ''),
      countTitle: dirty ? '有未保存修改' : undefined,
      accent: isLive ? '#34d399' : tab.accent,
    }
  }),
)

const sectionTabs = computed(() => {
  const d = activeDraft.value
  const logCount = triggerLogs.value.length + execHistory.value.length
  return [
    { id: 'basic', label: '基本配置', emoji: '⚙️' },
    { id: 'actions', label: '全屋动作', emoji: '⚡', count: d?.actions?.length || 0 },
    { id: 'triggers', label: '自动触发', emoji: '⏰', count: d?.triggers?.length || 0 },
    { id: 'logs', label: '运行日志', emoji: '📋', count: logCount || undefined },
  ]
})

const contextPills = computed(() => {
  const group = activeDraft.value?.exclusiveGroup || 'default'
  const groupLabel = exclusiveGroupOptions.find((o) => o.value === group)?.label || group
  return [
    {
      id: 'presence',
      icon: Users,
      label: '在场',
      value: presenceLabel.value,
    },
    {
      id: 'calendar',
      icon: CalendarDays,
      label: '日历',
      value: modeContext.value.calendarAway ? '外出中' : '在家',
      tone: modeContext.value.calendarAway ? 'warn' : '',
    },
    {
      id: 'triggers',
      icon: Radio,
      label: '自动触发',
      value: '{n} 条'.replace('{n}', String(modeContext.value.triggerBindingsCount ?? 0)),
      section: 'triggers',
    },
    {
      id: 'actions',
      icon: Zap,
      label: '全屋动作',
      value: '{n} 条'.replace('{n}', String(activeDraft.value?.actions?.length ?? 0)),
      section: 'actions',
    },
    {
      id: 'linkage',
      icon: Link2,
      label: '联动',
      value: `快照恢复 · ${groupLabel} · 优先级 ${activeDraft.value?.priority ?? 50}`,
      section: 'basic',
    },
  ]
})

function focusSection(sectionId: string) {
  if (['basic', 'actions', 'triggers', 'logs'].includes(sectionId)) {
    activeSection.value = sectionId
  }
}

function handleAddAction() {
  activeSection.value = 'actions'
  addAction()
}

function handleAddTrigger() {
  activeSection.value = 'triggers'
  addTrigger()
}

function handleApplyTemplate(tpl: ActionTemplate) {
  activeSection.value = 'actions'
  applyTemplate(tpl)
}

function onKindChange(act: ModeActionDraft) {
  act.entity_id = ''
  if (act.kind === 'scene') {
    act.domain = 'scene'
    act.service = 'turn_on'
  } else if (act.kind === 'script') {
    act.domain = 'script'
    act.service = 'turn_on'
  } else if (act.kind === 'notify') {
    act.domain = 'notify'
    act.service = 'send_message'
  } else if (act.kind === 'security') {
    act.domain = 'security'
    act.service = 'arm'
  }
}

  return {
    activeSection,
    anyModeDraftDirty,
    pendingModeChanges,
    displayModeTabs,
    sectionTabs,
    contextPills,
    focusSection,
    handleAddAction,
    handleAddTrigger,
    handleApplyTemplate,
    onKindChange,
  }
}

/** 保存 / 激活 / 删除等面板操作 */
