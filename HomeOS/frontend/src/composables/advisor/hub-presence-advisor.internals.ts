/**
 * @file hub-presence-advisor.internals.ts
 * @module frontend/src/views
 */
/** composables：自 hub.internals.ts 拆出 — 在家状态展示/配置、日程提醒、顾问 tip 动作 */
import { handleSystemConfigPatchError, patchSystemConfig, useSystemConfig } from '@/composables/config/system-config-core.internals'
import { fetchHomeModes } from '@/services/api/home-modes'
import { fetchOrchestratorList } from '@/services/api/orchestrator'
import { loadPresenceHome } from '@/composables/presence/load-presence-home'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { withBackendBootRetry } from '@/utils/core/api-boot-retry.util'
import { getApiErrorMessage, isBackendUnreachableError } from '@/utils/core/error-message'
import { logger } from '@/utils/core/logger'
import { REMINDER_DOW_LABELS, REMINDER_FREQ_OPTIONS, REMINDER_ICON_OPTIONS, REMINDER_MONTH_DAY_QUICK, REMINDER_QUICK_TEMPLATES, REMINDER_TYPES, buildScheduleStats, canSubmitReminderForm, defaultReminderFormState, formatReminderCustomDaysText, parseReminderCustomDays, reminderFormFromItem, reminderFreqLabel, reminderPayloadFromForm, reminderPresetAccent, reminderPresetMeta, reminderPresetProgress, reminderTypeLabel } from '@/utils/advisor/schedule-reminder-form.util'
import { formatPresenceDetailSummary } from '@/utils/presence/display.util'
import { invalidateAndReloadPresenceEntityIds } from '@/utils/presence/entity-filter.util'
import { computePersonAtHome, createEmptyPresencePerson, getPresencePersonsFromSecurity, sanitizePresencePersonsForSave } from '@/utils/presence/person.util'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { computed, ref, toValue, watch } from 'vue'

// ── usePresenceEntitiesDisplay ──
/** usePresenceEntitiesDisplay：函数，按签名入参返回处理结果。 */
export function usePresenceEntitiesDisplay(options: {
  presencePersons: MaybeRefOrGetter<unknown[]>
  autoMode: MaybeRefOrGetter<boolean>
  presencePreview: MaybeRefOrGetter<object | null | undefined>
  loading: MaybeRefOrGetter<boolean>
}) {
  const entitiesStore = useEntitiesStore()

  const configuredPersons = computed(() =>
    sanitizePresencePersonsForSave(toValue(options.presencePersons)),
  )

  const previewMembers = computed(() => {
    const autoMode = toValue(options.autoMode)
    const presencePreview = toValue(options.presencePreview) as { members?: unknown[] } | null
    const apiMembers = presencePreview?.members
    if (!autoMode && Array.isArray(apiMembers) && apiMembers.length > 0) {
      return apiMembers
    }
    if (autoMode) {
      return apiMembers ?? []
    }
    return configuredPersons.value.map((person) => ({
      id: `person:${person.id}`,
      name: person.name,
      atHome: computePersonAtHome(person, (entityId) => {
        const entity = entitiesStore.getEntity(entityId)
        return entity?.state === 'home'
      }),
    }))
  })

  const personStatusMap = computed(() => {
    const map: Record<string, boolean> = {}
    if (toValue(options.autoMode)) return map
    for (const person of configuredPersons.value) {
      const member = previewMembers.value.find(
        (m) => (m as { id?: string }).id === `person:${person.id}`,
      ) as { atHome?: boolean } | undefined
      if (member) map[person.id] = !!member.atHome
    }
    return map
  })

  const atHomeCount = computed(
    () => previewMembers.value.filter((m) => (m as { atHome?: boolean }).atHome).length,
  )

  const showHomeSummaryStyle = computed(
    () => !toValue(options.loading) && atHomeCount.value > 0,
  )

  const personRowCount = computed(() => {
    const arr = Array.isArray(toValue(options.presencePersons))
      ? (toValue(options.presencePersons) as unknown[])
      : []
    return arr.length || 1
  })

  const summaryText = computed(() =>
    formatPresenceDetailSummary(previewMembers.value, {
      loading: toValue(options.loading),
      autoMode: toValue(options.autoMode),
      personCount: configuredPersons.value.length,
    }),
  )

  const modeHint = computed(() =>
    toValue(options.autoMode)
      ? '自动跟踪 · 添加并保存后切换为自定义'
      : `自定义 · ${configuredPersons.value.length || personRowCount.value} 位人员`,
  )

  return {
    configuredPersons,
    previewMembers,
    personStatusMap,
    atHomeCount,
    showHomeSummaryStyle,
    summaryText,
    modeHint,
  }
}

// ── usePresenceEntityConfig ──
/** 人员在线判定配置（security.presencePersons） */
export function usePresenceEntityConfig() {
  const chrome = useChromeStore()
  const { load: loadSystemConfig } = useSystemConfig()
  const loading = ref(false)
  const saving = ref(false)
  const presencePersons = ref([createEmptyPresencePerson()])
  const presencePreview = ref<Record<string, unknown> | null>(null)

  const autoMode = computed(() => {
    const cleaned = sanitizePresencePersonsForSave(presencePersons.value)
    return cleaned.length === 0
  })

  let presenceLoaded = false

  async function refresh({
    bootRetry = false,
    silent = false,
  }: { bootRetry?: boolean; silent?: boolean } = {}) {
    const showLoading = !silent && !presenceLoaded
    if (showLoading) loading.value = true
    try {
      const fetchConfig = () => loadSystemConfig({ force: true })
      const configPromise = bootRetry ? withBackendBootRetry(fetchConfig) : fetchConfig()
      const [cfg, presence] = await Promise.all([
        configPromise,
        loadPresenceHome().then((data) => {
          if (!data) logger.warn('拉取人存在预览失败')
          return data
        }),
      ])
      const persons = getPresencePersonsFromSecurity(cfg?.security)
      presencePersons.value = persons.length ? persons : [createEmptyPresencePerson()]
      presencePreview.value = presence
      await invalidateAndReloadPresenceEntityIds()
      presenceLoaded = true
    } catch (e) {
      if (isBackendUnreachableError(e)) {
        logger.warn('刷新人存在人员配置失败(后端不可用)', e)
      } else {
        logger.warn('刷新人存在人员配置失败', e)
      }
      if (!silent && (showLoading || !presenceLoaded)) {
        chrome.notify(getApiErrorMessage(e, '加载人存在配置失败'), 'error')
      }
    } finally {
      if (showLoading) loading.value = false
    }
  }

  async function save() {
    saving.value = true
    try {
      const cleaned = sanitizePresencePersonsForSave(presencePersons.value)
      await patchSystemConfig({
        security: {
          presencePersons: cleaned,
        },
      })
      presencePersons.value = cleaned.length ? cleaned : [createEmptyPresencePerson()]
      await invalidateAndReloadPresenceEntityIds()
      const presence = await loadPresenceHome()
      if (!presence) logger.warn('保存后人存在预览拉取失败')
      presencePreview.value = presence
      chrome.notify('人员在线判定已保存', 'success')
      return true
    } catch (e) {
      if (await handleSystemConfigPatchError(e, chrome)) return false
      logger.warn('保存人存在人员配置失败', e)
      chrome.notify(getApiErrorMessage(e, '保存失败'), 'error')
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    loading,
    saving,
    presencePersons,
    autoMode,
    presencePreview,
    refresh,
    save,
  }
}

// ── useScheduleReminderEditor ──
type UiStore = ReturnType<typeof useChromeStore>

interface ScheduleReminderEditorDeps {
  chrome: UiStore
  reminders: Ref<Array<{ id: string; frequency?: string; label?: string }>>
  addReminder: (payload: ReturnType<typeof reminderPayloadFromForm>) => Promise<void>
  updateReminder: (id: string, payload: ReturnType<typeof reminderPayloadFromForm>) => Promise<void>
  deleteReminder: (id: string) => Promise<void>
  clearAllReminders: () => Promise<{ deleted?: number }>
  applySchedulePreset: (id: string) => Promise<{ added?: unknown[]; skipped?: unknown[] }>
}

/** 智能服务 · 日程提醒表单（SettingsSmartServicesPanel 拆分模块） */
export function useScheduleReminderEditor(deps: ScheduleReminderEditorDeps) {
  const {
    chrome,
    reminders,
    addReminder,
    updateReminder,
    deleteReminder,
    clearAllReminders,
    applySchedulePreset,
  } = deps

  const savingReminder = ref(false)
  const editingReminderId = ref<string | null>(null)
  const newReminder = ref(defaultReminderFormState())

  const scheduleStats = computed(() => buildScheduleStats(reminders.value))
  const newReminderPreview = computed(() =>
    reminderFreqLabel({
      frequency: newReminder.value.frequency,
      dayOfWeek: newReminder.value.dayOfWeek,
      customDays:
        newReminder.value.frequency === 'monthly'
          ? parseReminderCustomDays(newReminder.value.customDaysText)
          : [],
      time: newReminder.value.time,
    }),
  )
  const canSubmitReminder = computed(() => canSubmitReminderForm(newReminder.value))

  watch(
    () => newReminder.value.frequency,
    (freq, prev) => {
      if (freq === 'monthly' && !parseReminderCustomDays(newReminder.value.customDaysText).length) {
        newReminder.value.customDaysText = '1'
      }
      if (prev === 'monthly' && freq !== 'monthly') {
        newReminder.value.customDaysText = ''
      }
    },
  )

  function isMonthDaySelected(day: number) {
    return parseReminderCustomDays(newReminder.value.customDaysText).includes(day)
  }

  function toggleMonthDay(day: number) {
    const current = parseReminderCustomDays(newReminder.value.customDaysText)
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day]
    newReminder.value.customDaysText = formatReminderCustomDaysText(next)
  }

  function onReminderTypeChange() {
    const meta = REMINDER_TYPES.find((t) => t.id === newReminder.value.type)
    if (meta) newReminder.value.color = meta.color
  }

  function applyQuickTemplate(tpl: (typeof REMINDER_QUICK_TEMPLATES)[number]) {
    newReminder.value = {
      ...newReminder.value,
      label: tpl.label,
      icon: tpl.icon,
      type: tpl.type,
      frequency: tpl.frequency,
      dayOfWeek: tpl.dayOfWeek ?? 1,
      customDaysText: tpl.customDaysText || '',
      color: tpl.color,
    }
  }

  function resetNewReminder() {
    newReminder.value = defaultReminderFormState()
  }

  function startEditReminder(item: Parameters<typeof reminderFormFromItem>[0] & { id: string }) {
    if (editingReminderId.value === item.id) return
    editingReminderId.value = item.id
    newReminder.value = reminderFormFromItem(item)
    requestAnimationFrame(() => {
      document
        .querySelector('.schedule-add')
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  function cancelEditReminder() {
    editingReminderId.value = null
    resetNewReminder()
  }

  async function onSaveReminder() {
    savingReminder.value = true
    try {
      const freq = newReminder.value.frequency
      const customDays =
        freq === 'monthly' ? parseReminderCustomDays(newReminder.value.customDaysText) : []
      if (freq === 'monthly' && !customDays.length) {
        chrome.notify('请填写每月提醒日期（如 1,15）', 'error')
        return
      }
      const payload = reminderPayloadFromForm(newReminder.value)
      if (editingReminderId.value) {
        await updateReminder(editingReminderId.value, payload)
        chrome.notify('日程提醒已更新', 'success')
        cancelEditReminder()
      } else {
        await addReminder(payload)
        resetNewReminder()
        chrome.notify('日程提醒已添加', 'success')
      }
    } catch (e) {
      chrome.notify(
        getApiErrorMessage(e, editingReminderId.value ? '保存失败' : '添加提醒失败'),
        'error',
      )
    } finally {
      savingReminder.value = false
    }
  }

  async function onDeleteReminder(id: string) {
    const ok = await chrome.confirm('确定删除该日程提醒？', '删除日程')
    if (!ok) return
    try {
      if (editingReminderId.value === id) cancelEditReminder()
      await deleteReminder(id)
      chrome.notify('日程提醒已删除', 'success')
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '删除失败'), 'error')
    }
  }

  async function onClearAllReminders() {
    const ok = await chrome.confirm(
      `将清除全部 ${reminders.value.length} 条日程提醒，此操作不可撤销。确定继续？`,
      '一键清除提醒',
      { type: 'danger', confirmText: '全部清除', cancelText: '取消' },
    )
    if (!ok) return
    try {
      const data = await clearAllReminders()
      chrome.notify(`已清除 ${data?.deleted ?? 0} 条日程提醒`, 'success')
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '清除失败'), 'error')
    }
  }

  async function onApplyPreset(preset: {
    id: string
    name: string
    itemCount: number
    appliedCount: number
  }) {
    if (preset.appliedCount >= preset.itemCount) return
    const ok = await chrome.confirm(
      `将添加预设「${preset.name}」中尚未存在的 ${preset.itemCount - preset.appliedCount} 条提醒（同名项会自动跳过）。确定应用？`,
      '应用日程预设',
      { confirmText: '应用', cancelText: '取消' },
    )
    if (!ok) return
    try {
      const data = await applySchedulePreset(preset.id)
      const added = data?.added?.length ?? 0
      const skipped = data?.skipped?.length ?? 0
      if (added > 0) {
        chrome.notify(
          skipped > 0
            ? `已添加 ${added} 条提醒，跳过 ${skipped} 条同名项`
            : `已添加 ${added} 条提醒`,
          'success',
        )
      } else {
        chrome.notify('预设中的提醒已全部存在，未添加新项', 'info')
      }
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '应用预设失败'), 'error')
    }
  }

  return {
    reminderTypes: REMINDER_TYPES,
    iconOptions: REMINDER_ICON_OPTIONS,
    quickTemplates: REMINDER_QUICK_TEMPLATES,
    freqOptions: REMINDER_FREQ_OPTIONS,
    monthDayQuick: REMINDER_MONTH_DAY_QUICK,
    dowLabels: REMINDER_DOW_LABELS,
    savingReminder,
    editingReminderId,
    newReminder,
    scheduleStats,
    newReminderPreview,
    canSubmitReminder,
    freqLabel: reminderFreqLabel,
    presetMeta: reminderPresetMeta,
    presetProgress: reminderPresetProgress,
    presetAccent: reminderPresetAccent,
    reminderTypeLabel,
    isMonthDaySelected,
    toggleMonthDay,
    onReminderTypeChange,
    applyQuickTemplate,
    resetNewReminder,
    startEditReminder,
    cancelEditReminder,
    onSaveReminder,
    onDeleteReminder,
    onClearAllReminders,
    onApplyPreset,
  }
}

// ── useAdvisorTipActions ──
/** ADVISOR_TIP_CATEGORIES：常量集合，成员语义见定义处。 */
export const ADVISOR_TIP_CATEGORIES = ['security', 'env', 'energy', 'water'] as const

type AdvisorTipCategory = (typeof ADVISOR_TIP_CATEGORIES)[number]

/** ADVISOR_TIP_CATEGORY_META：对象常量，字段 / 方法语义见定义处。 */
export const ADVISOR_TIP_CATEGORY_META: Record<
  AdvisorTipCategory,
  { label: string; hint: string }
> = {
  security: { label: '安防', hint: '入夜门窗检查等' },
  env: { label: '环境', hint: '空气质量、防潮提醒' },
  energy: { label: '能源', hint: '预算预警、节能贴士' },
  water: { label: '用水', hint: '持续用水异常关阀建议' },
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  home_mode: '切换家庭模式',
  scene: '执行场景',
}

function normalizeList(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: Array<Record<string, unknown>> }).items
  }
  return []
}

function emptyRow() {
  return { type: '', id: '' }
}

function buildDefaultRows() {
  return Object.fromEntries(ADVISOR_TIP_CATEGORIES.map((cat) => [cat, emptyRow()]))
}

function normalizeActionType(type: unknown): 'home_mode' | 'scene' | '' {
  if (type === 'home_mode' || type === 'scene') return type
  return ''
}

/** 智能顾问建议 category → 一键执行动作（home_mode / scene） */
export function useAdvisorTipActions() {
  const chrome = useChromeStore()
  const { load: loadSystemConfig, invalidate } = useSystemConfig()
  const loading = ref(false)
  const saving = ref(false)
  const rows = ref<Record<string, { type: string; id: string }>>(buildDefaultRows())
  const baselineJson = ref(JSON.stringify(rows.value))
  const homeModes = ref<Array<{ id: string; name?: string }>>([])
  const scenes = ref<Array<{ id: string; name?: string }>>([])

  const isDirty = computed(() => JSON.stringify(rows.value) !== baselineJson.value)

  function syncBaseline() {
    baselineJson.value = JSON.stringify(rows.value)
  }

  function categoryLabel(cat: string) {
    return ADVISOR_TIP_CATEGORY_META[cat as AdvisorTipCategory]?.label ?? cat
  }

  function categoryHint(cat: string) {
    return ADVISOR_TIP_CATEGORY_META[cat as AdvisorTipCategory]?.hint ?? ''
  }

  function actionTypeLabel(type: string) {
    return ACTION_TYPE_LABELS[type] ?? type
  }

  function targetOptions(type: string) {
    if (type === 'home_mode') {
      return homeModes.value.map((m) => ({ id: m.id, label: m.name || m.id }))
    }
    if (type === 'scene') {
      return scenes.value.map((s) => ({ id: s.id, label: s.name || s.id }))
    }
    return []
  }

  function targetLabel(cat: string) {
    const row = rows.value[cat]
    if (!row?.type || !row?.id) return ''
    const opt = targetOptions(row.type).find((o) => o.id === row.id)
    return opt?.label || row.id
  }

  function isRowBound(cat: string) {
    const row = rows.value[cat]
    return Boolean(row?.type && row?.id)
  }

  function isRowIncomplete(cat: string) {
    const row = rows.value[cat]
    return Boolean(row?.type && !row?.id)
  }

  function isRowInvalid(cat: string) {
    const row = rows.value[cat]
    if (!row?.type || !row?.id) return false
    return !targetOptions(row.type).some((o) => o.id === row.id)
  }

  const boundCount = computed(() => ADVISOR_TIP_CATEGORIES.filter((cat) => isRowBound(cat)).length)

  const invalidCategories = computed(() =>
    ADVISOR_TIP_CATEGORIES.filter((cat) => isRowInvalid(cat)),
  )

  const summaryText = computed(() => {
    if (loading.value) return '加载中…'
    const bound = boundCount.value
    if (!bound) return '尚未绑定一键执行'
    return `已绑定 ${bound} / ${ADVISOR_TIP_CATEGORIES.length} 类建议`
  })

  let advisorLoaded = false

  async function load(options: { silent?: boolean } = {}) {
    const showLoading = !options.silent && !advisorLoaded
    if (showLoading) loading.value = true
    try {
      const [cfg, modesRes, scenesRes] = await Promise.all([
        loadSystemConfig({ force: false }),
        fetchHomeModes().catch((err) => {
          logger.warn('顾问面板拉取居家模式失败', err)
          return { data: [] }
        }),
        fetchOrchestratorList('scene').catch((err) => {
          logger.warn('顾问面板拉取场景列表失败', err)
          return { data: [] }
        }),
      ])
      const raw = cfg?.other?.advisorTipActions || {}
      const next: Record<string, { type: string; id: string }> = {}
      for (const cat of ADVISOR_TIP_CATEGORIES) {
        const action = raw[cat]
        const type = normalizeActionType(action?.type)
        next[cat] = type && action?.id ? { type, id: String(action.id) } : emptyRow()
      }
      rows.value = next
      syncBaseline()
      homeModes.value = normalizeList(modesRes.data).map((m) => ({
        id: String(m.id ?? ''),
        name: m.name != null ? String(m.name) : undefined,
      }))
      scenes.value = normalizeList(scenesRes.data).map((m) => ({
        id: String(m.id ?? ''),
        name: m.name != null ? String(m.name) : undefined,
      }))
      advisorLoaded = true
    } catch (e) {
      rows.value = buildDefaultRows()
      syncBaseline()
      chrome.notify(getApiErrorMessage(e, '加载顾问绑定失败'), 'error')
    } finally {
      if (showLoading) loading.value = false
    }
  }

  function onTypeChange(cat: string) {
    const row = rows.value[cat]
    if (!row) return
    row.id = ''
  }

  async function save() {
    const incomplete = ADVISOR_TIP_CATEGORIES.filter((cat) => isRowIncomplete(cat))
    if (incomplete.length) {
      chrome.notify(`请为「${incomplete.map(categoryLabel).join('、')}」选择执行目标`, 'warning')
      return
    }

    const invalid = invalidCategories.value
    if (invalid.length) {
      chrome.notify(
        `「${invalid.map(categoryLabel).join('、')}」绑定的目标已不存在，请重新选择`,
        'warning',
      )
      return
    }

    saving.value = true
    try {
      const advisorTipActions: Record<string, { type: 'home_mode' | 'scene'; id: string }> = {}
      for (const cat of ADVISOR_TIP_CATEGORIES) {
        const row = rows.value[cat]
        if (row?.type === 'home_mode' || row?.type === 'scene') {
          if (row.id) advisorTipActions[cat] = { type: row.type, id: row.id }
        }
      }
      await patchSystemConfig({ other: { advisorTipActions } })
      invalidate()
      await load({ silent: true })
      chrome.notify('建议一键执行已保存', 'success')
    } catch (e) {
      if (await handleSystemConfigPatchError(e, chrome)) return
      chrome.notify(getApiErrorMessage(e, '保存失败'), 'error')
    } finally {
      saving.value = false
    }
  }

  return {
    loading,
    saving,
    rows,
    isDirty,
    boundCount,
    summaryText,
    categoryLabel,
    categoryHint,
    actionTypeLabel,
    load,
    save,
    onTypeChange,
    targetOptions,
    targetLabel,
    isRowBound,
    isRowIncomplete,
    isRowInvalid,
  }
}
