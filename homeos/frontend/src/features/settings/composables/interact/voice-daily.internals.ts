/**
 * @file voice-daily.internals.ts
 * @module frontend/src/features/settings/composables/interact
 */
/** 语音设置：每日顾问文案预设面板 */

import { computed, ref, type Ref } from 'vue'
import {
  dailyPresetTemplate,
  detectDailyPreset,
  getDailyAdvisorDayPresets,
  getDailyAdvisorEveningPresets,
} from '@/shared/voice/utils/speech.util'

interface VoiceDailyFields {
  dailyAdvisorTtsDaytime?: string
  dailyAdvisorTtsEvening?: string
}

export function useVoiceDailyAdvisorPanel(voice: Ref<VoiceDailyFields>) {
  const dailyDayPreset = ref('default')
  const dailyDayCustom = ref('')
  const dailyEveningPreset = ref('default')
  const dailyEveningCustom = ref('')

  const dailyAdvisorDayPresets = computed(() => getDailyAdvisorDayPresets())
  const dailyAdvisorEveningPresets = computed(() => getDailyAdvisorEveningPresets())

  const dailyDayTemplate = computed(() =>
    dailyPresetTemplate(dailyDayPreset.value, 'day', dailyDayCustom.value),
  )
  const dailyEveningTemplate = computed(() =>
    dailyPresetTemplate(dailyEveningPreset.value, 'evening', dailyEveningCustom.value),
  )

  function syncDailyFromVoice() {
    dailyDayPreset.value = detectDailyPreset('day', voice.value.dailyAdvisorTtsDaytime)
    dailyDayCustom.value =
      dailyDayPreset.value === 'custom' ? voice.value.dailyAdvisorTtsDaytime || '' : ''
    dailyEveningPreset.value = detectDailyPreset('evening', voice.value.dailyAdvisorTtsEvening)
    dailyEveningCustom.value =
      dailyEveningPreset.value === 'custom' ? voice.value.dailyAdvisorTtsEvening || '' : ''
  }

  function syncDailyDay() {
    voice.value.dailyAdvisorTtsDaytime = dailyPresetTemplate(
      dailyDayPreset.value,
      'day',
      dailyDayCustom.value,
    )
  }

  function syncDailyEvening() {
    voice.value.dailyAdvisorTtsEvening = dailyPresetTemplate(
      dailyEveningPreset.value,
      'evening',
      dailyEveningCustom.value,
    )
  }

  function onDailyDayPreset(id: string) {
    dailyDayPreset.value = id
    syncDailyDay()
  }

  function onDailyEveningPreset(id: string) {
    dailyEveningPreset.value = id
    syncDailyEvening()
  }

  return {
    dailyDayPreset,
    dailyDayCustom,
    dailyEveningPreset,
    dailyEveningCustom,
    dailyAdvisorDayPresets,
    dailyAdvisorEveningPresets,
    dailyDayTemplate,
    dailyEveningTemplate,
    syncDailyFromVoice,
    syncDailyDay,
    syncDailyEvening,
    onDailyDayPreset,
    onDailyEveningPreset,
  }
}
