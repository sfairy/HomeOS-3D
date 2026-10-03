/**
 * @file smart-services.internals.ts
 * @module frontend/src/views
 */
/** composables：合并自智能服务 / 用量面板 / 顾问面板 */
import { deleteReminder as deleteReminderApi, snoozeReminder as snoozeReminderApi, updateReminder as updateReminderApi, applyReminderPreset, clearReminders, clearUsageReport, createReminder, fetchAllReminders, fetchDailyAdvisor, fetchDeviceLifespan, fetchReminderPresets, fetchUsageReport, speakDailyAdvisor } from '@/services/api/advisor'
import { useChromeStore } from '@/stores/chrome.store'
import { buildAdvisorOverview, normalizeAdvisorTipCategoryId, resolveUsageMaxCount, usageBarPercent } from '@/utils/advisor/advisor-tip-category.util'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { ADVISOR_TIP_CATEGORY_META } from '@/composables/advisor/hub-presence-advisor.internals'
import { Droplets, Leaf, Shield, Zap } from '@lucide/vue'
import type { Component, Ref } from 'vue'
import { computed, ref } from 'vue'

// ── useSmartServices ──
/** useSmartServices：函数，按签名入参返回处理结果。 */
export function useSmartServices() {
  const chrome = useChromeStore()
  const loading = ref(false)
  const advisorLoading = ref(false)
  const advisorError = ref<string>('')
  const lifespanError = ref<string>('')
  const remindersLoadError = ref<string>('')
  const lifespanLoading = ref(false)
  const dailyAdvice = ref<unknown>(null)
  const usageReport = ref<{
    topDevices?: unknown[]
    totalDevices?: number
    days?: number
    [key: string]: unknown
  } | null>(null)
  const lifespan = ref<unknown>(null)
  const reminders = ref<Record<string, unknown>[]>([])
  const schedulePresets = ref<Record<string, unknown>[]>([])
  const applyingPresetId = ref('')
  const clearingReminders = ref(false)
  const speakResult = ref<unknown>(null)
  const clearingUsage = ref(false)

  async function fetchAdvisor() {
    advisorLoading.value = true
    advisorError.value = ''
    const errors = []
    try {
      let daily = null
      let report = null
      try {
        daily = await fetchDailyAdvisor()
      } catch (e) {
        errors.push(getApiErrorMessage(e, '每日建议加载失败'))
      }
      try {
        report = await fetchUsageReport()
      } catch (e) {
        errors.push(getApiErrorMessage(e, '使用报告加载失败'))
      }
      dailyAdvice.value = daily
      usageReport.value = report
      if (errors.length) {
        advisorError.value = errors.join('；')
      } else if (!daily && !report) {
        advisorError.value = '无法加载顾问数据'
      }
    } catch (e) {
      dailyAdvice.value = null
      usageReport.value = null
      advisorError.value = getApiErrorMessage(e, '加载顾问数据失败')
    } finally {
      advisorLoading.value = false
    }
  }

  async function fetchLifespan() {
    lifespanLoading.value = true
    lifespanError.value = ''
    try {
      const data = await fetchDeviceLifespan()
      lifespan.value = data
      if (!data) lifespanError.value = '无法加载设备寿命数据'
    } catch (e) {
      lifespan.value = null
      lifespanError.value = getApiErrorMessage(e, '加载设备寿命失败')
    } finally {
      lifespanLoading.value = false
    }
  }

  async function fetchReminders() {
    remindersLoadError.value = ''
    try {
      const [allData, presetsData] = await Promise.all([
        fetchAllReminders(),
        fetchReminderPresets().catch(() => []),
      ])
      reminders.value = allData?.all || []
      schedulePresets.value = Array.isArray(presetsData) ? presetsData : []
    } catch (e) {
      reminders.value = []
      schedulePresets.value = []
      remindersLoadError.value = getApiErrorMessage(e, '加载日程提醒失败')
    }
  }

  async function refreshAll() {
    loading.value = true
    try {
      await Promise.all([fetchAdvisor(), fetchLifespan(), fetchReminders()])
    } finally {
      loading.value = false
    }
  }

  async function testDailySpeak() {
    speakResult.value = null
    const res = await speakDailyAdvisor().catch((e) => ({
      success: false,
      message: getApiErrorMessage(e, e.message || '操作失败'),
    }))
    speakResult.value = res
    if (res?.success) {
      chrome.notify('每日建议播报已触发', 'success')
    } else {
      chrome.notify(res?.message || '播报失败', 'error')
    }
    return res
  }

  async function addReminder(payload: Record<string, unknown>) {
    try {
      await createReminder(payload)
      await fetchReminders()
      chrome.notify('提醒已添加', 'success')
      return true
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '添加提醒失败'), 'error')
      return false
    }
  }

  async function updateReminder(id: string, payload: Record<string, unknown>) {
    try {
      await updateReminderApi(id, payload)
      await fetchReminders()
      chrome.notify('提醒已更新', 'success')
      return true
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '更新提醒失败'), 'error')
      return false
    }
  }

  async function deleteReminder(id: string) {
    try {
      const data = await deleteReminderApi(String(id))
      if (!data?.success) {
        throw new Error('删除失败')
      }
      await fetchReminders()
      chrome.notify('提醒已删除', 'success')
      return true
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '删除提醒失败'), 'error')
      return false
    }
  }

  async function snoozeReminder(id: string, minutes = 60) {
    try {
      await snoozeReminderApi(String(id), minutes)
      await fetchReminders()
      chrome.notify(`提醒已延后 ${minutes} 分钟`, 'success')
      return true
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '延后提醒失败'), 'error')
      return false
    }
  }

  async function applySchedulePreset(presetId: string) {
    applyingPresetId.value = presetId
    try {
      const data = await applyReminderPreset(presetId)
      await fetchReminders()
      return data
    } finally {
      applyingPresetId.value = ''
    }
  }

  async function clearAllReminders() {
    clearingReminders.value = true
    try {
      const data = await clearReminders()
      await fetchReminders()
      chrome.notify('已清空所有提醒', 'success')
      return data
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '清空提醒失败'), 'error')
      throw e
    } finally {
      clearingReminders.value = false
    }
  }

  async function clearUsageStats() {
    clearingUsage.value = true
    try {
      const data = await clearUsageReport()
      usageReport.value = { topDevices: [], totalDevices: 0, days: usageReport.value?.days ?? 7 }
      return data
    } finally {
      clearingUsage.value = false
    }
  }

  return {
    loading,
    advisorLoading,
    advisorError,
    lifespanError,
    remindersLoadError,
    lifespanLoading,
    dailyAdvice,
    usageReport,
    lifespan,
    reminders,
    schedulePresets,
    applyingPresetId,
    clearingReminders,
    speakResult,
    clearingUsage,
    refreshAll,
    testDailySpeak,
    clearUsageStats,
    clearAllReminders,
    applySchedulePreset,
    addReminder,
    updateReminder,
    deleteReminder,
    snoozeReminder,
  }
}

// ── useSmartServicesUsagePanel ──
type UiStore = ReturnType<typeof useChromeStore>

interface SmartServicesUsagePanelDeps {
  chrome: UiStore
  usageReport: Ref<{ topDevices?: Array<{ onCount?: number }>; totalDevices?: number } | null>
  clearUsageStats: () => Promise<{ deleted?: number }>
}

/** 智能服务 · 使用统计区块展示（SettingsSmartServicesPanel 拆分模块） */
export function useSmartServicesUsagePanel(deps: SmartServicesUsagePanelDeps) {
  const { chrome, usageReport, clearUsageStats } = deps

  const usageMaxCount = computed(() => resolveUsageMaxCount(usageReport.value?.topDevices))
  const hasUsageData = computed(() => (usageReport.value?.totalDevices ?? 0) > 0)

  function usageBarPercentFor(count: number | null | undefined) {
    return usageBarPercent(count, usageMaxCount.value)
  }

  async function onClearUsage() {
    const ok = await chrome.confirm(
      '将清除所有设备开关/启用次数统计（含数据库记录与内存缓存），此操作不可撤销。确定继续？',
      '清除使用统计',
      { type: 'danger', confirmText: '清除', cancelText: '取消' },
    )
    if (!ok) return
    try {
      const data = await clearUsageStats()
      chrome.notify(`已清除 ${data?.deleted ?? 0} 条统计记录`, 'success')
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '清除失败'), 'error')
    }
  }

  return {
    usageMaxCount,
    hasUsageData,
    usageBarPercent: usageBarPercentFor,
    onClearUsage,
  }
}

// ── useSmartServicesAdvisorPanel ──
const TIP_CATEGORY_ICONS: Record<string, Component> = {
  security: Shield,
  env: Leaf,
  energy: Zap,
  water: Droplets,
}

interface SmartServicesAdvisorPanelDeps {
  dailyAdvice: Ref<{ tips?: Array<{ category?: unknown }> } | null>
  testDailySpeak: () => Promise<void>
}

/** 智能服务 · 顾问区块展示（SettingsSmartServicesPanel 拆分模块） */
export function useSmartServicesAdvisorPanel(deps: SmartServicesAdvisorPanelDeps) {
  const { dailyAdvice, testDailySpeak } = deps
  const speaking = ref(false)

  const advisorOverview = computed(() =>
    buildAdvisorOverview(dailyAdvice.value?.tips, ADVISOR_TIP_CATEGORY_META),
  )

  function tipCategoryId(category: unknown) {
    return normalizeAdvisorTipCategoryId(category)
  }

  function tipCategoryIcon(category: unknown) {
    return TIP_CATEGORY_ICONS[tipCategoryId(category)] || Zap
  }

  function tipCategoryLabel(category: unknown) {
    const id = tipCategoryId(category)
    return ADVISOR_TIP_CATEGORY_META[id]?.label ?? String(category || '')
  }

  async function onTestSpeak() {
    speaking.value = true
    try {
      await testDailySpeak()
    } finally {
      speaking.value = false
    }
  }

  return {
    speaking,
    advisorOverview,
    tipCategoryId,
    tipCategoryIcon,
    tipCategoryLabel,
    onTestSpeak,
  }
}
