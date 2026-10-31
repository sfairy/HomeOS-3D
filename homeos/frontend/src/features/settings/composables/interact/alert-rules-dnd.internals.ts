/**
 * @file alert-rules-dnd.internals.ts
 * @module frontend/src/features/settings/composables/interact
 */
/** 告警规则面板：免打扰时段编辑 */

import { computed, ref, watch, type Ref } from 'vue'
import { useChromeStore } from '@/stores/chrome.store'
import {
  fetchNotificationSettings,
  updateNotificationSettings,
} from '@/services/api/notifications'
import type { DndPreset, NotificationSettingsParsed } from '@/shared/types/alert-rules'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { formatLocaleTime } from '@/shared/utils/format/locale-format.util'
import {
  DEFAULT_DND_END,
  DEFAULT_DND_START,
  DND_PRESETS,
  dndDurationHours,
  dndRangeLabel,
  dndRangeStyle,
  formatHour,
  isHourInDnd,
  parseNotificationSettings,
} from '@/shared/notifications/utils/dnd.util'

/** 告警规则面板：免打扰时段编辑 */
export function useAlertRulesPanelDnd(options: { alertSection: Ref<string> }) {
  const chrome = useChromeStore()
  const dndSettings = ref<NotificationSettingsParsed | null>(null)
  const dndForm = ref({ dndStart: DEFAULT_DND_START, dndEnd: DEFAULT_DND_END })
  const dndLoading = ref(false)
  const dndLoadError = ref('')
  const dndSaving = ref(false)

  const dndPresets = computed(() => DND_PRESETS)
  const currentHour = computed(() => new Date().getHours())
  const currentTimeLabel = computed(() => {
    const now = new Date()
    return formatLocaleTime(now, { hour: '2-digit', minute: '2-digit', hour12: false })
  })
  const dndPreviewActive = computed(() =>
    isHourInDnd(currentHour.value, dndForm.value.dndStart, dndForm.value.dndEnd),
  )
  const dndDurationHoursComputed = computed(() =>
    dndDurationHours(dndForm.value.dndStart, dndForm.value.dndEnd),
  )
  const dndDirty = computed(() => {
    if (!dndSettings.value) return false
    return (
      dndForm.value.dndStart !== dndSettings.value.dndStart ||
      dndForm.value.dndEnd !== dndSettings.value.dndEnd
    )
  })

  async function loadDndSettings(silent = false) {
    if (!silent) {
      dndLoading.value = true
      dndLoadError.value = ''
    }
    try {
      const res = await fetchNotificationSettings()
      const parsed = parseNotificationSettings(res.data)
      dndSettings.value = parsed
      dndForm.value = { dndStart: parsed.dndStart, dndEnd: parsed.dndEnd }
    } catch (error) {
      dndSettings.value = null
      if (!silent) {
        dndLoadError.value = getApiErrorMessage(error, '免打扰配置加载失败')
      }
    } finally {
      if (!silent) dndLoading.value = false
    }
  }

  function isDndPresetActive(preset: DndPreset) {
    return dndForm.value.dndStart === preset.start && dndForm.value.dndEnd === preset.end
  }

  function applyDndPreset(preset: DndPreset) {
    dndForm.value = { dndStart: preset.start, dndEnd: preset.end }
  }

  async function saveDnd() {
    dndSaving.value = true
    try {
      const body = {
        dndStart: Math.max(0, Math.min(23, Math.floor(dndForm.value.dndStart))),
        dndEnd: Math.max(0, Math.min(23, Math.floor(dndForm.value.dndEnd))),
      }
      const res = await updateNotificationSettings(body)
      const parsed = parseNotificationSettings(res.data)
      dndSettings.value = parsed
      dndForm.value = { dndStart: parsed.dndStart, dndEnd: parsed.dndEnd }
      chrome.notify('免打扰设置已保存', 'success')
    } catch (error) {
      chrome.notify(getApiErrorMessage(error, '保存失败（需 admin）'), 'error')
    } finally {
      dndSaving.value = false
    }
  }

  /** 静默回滚免打扰草稿（离开设置页 / 切 Tab 确认后调用，不弹提示） */
  function revertDndDraft() {
    if (!dndSettings.value) return
    dndForm.value = {
      dndStart: dndSettings.value.dndStart,
      dndEnd: dndSettings.value.dndEnd,
    }
  }

  function cancelDndChanges() {
    if (!dndDirty.value || !dndSettings.value) return
    revertDndDraft()
    chrome.notify('已取消修改', 'info')
  }

  function dndHourTitle(hour: number) {
    let title = formatHour(hour)
    if (isHourInDnd(hour, dndForm.value.dndStart, dndForm.value.dndEnd)) title += ' · 静默'
    if (hour === currentHour.value) title += ' · 当前'
    return title
  }

  function dndTimelineAria() {
    return `静默时段 ${dndRangeLabel(dndForm.value.dndStart, dndForm.value.dndEnd)}`
  }

  watch(options.alertSection, (section) => {
    if (section === 'dnd' && !dndSettings.value && !dndLoading.value) void loadDndSettings()
  })

  return {
    dndSettings,
    dndForm,
    dndLoading,
    dndLoadError,
    dndSaving,
    dndPresets,
    currentHour,
    currentTimeLabel,
    dndPreviewActive,
    dndDurationHours: dndDurationHoursComputed,
    dndDirty,
    formatHour,
    dndRangeLabel,
    isHourInDnd,
    dndRangeStyle,
    isDndPresetActive,
    applyDndPreset,
    loadDndSettings,
    saveDnd,
    cancelDndChanges,
    revertDndDraft,
    dndHourTitle,
    dndTimelineAria,
  }
}
