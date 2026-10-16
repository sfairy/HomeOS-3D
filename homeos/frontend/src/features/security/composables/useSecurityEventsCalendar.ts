/**
 * @file useSecurityEventsCalendar.ts
 * @module frontend/src/features/security/composables
 */
/** 安防页门禁事件日历：按月网格、按日筛选、视频预览、缩略图滚动 */

import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import { logger } from '@/shared/utils/core/logger'
import { fetchSecurityEvents, validateSecurityEvents } from '@/services/api/security'
import { useYamlValidation } from '@/features/security/composables/useYamlValidation'
import { formatLocaleDate } from '@/shared/utils/format/locale-format.util'
import {
  buildSecurityCalendarDays,
  isSameCalendarDay,
} from '@/features/security/composables/security-view-calendar.internals'
import {
  resolveSecurityEventVideo,
  type SecurityDoorEvent,
} from '@/features/security/composables/security-view-events.internals'

export function useSecurityEventsCalendar(eventsPath: Ref<string> | ComputedRef<string>) {
  const weekdayLabels = computed(() => '日,一,二,三,四,五,六'.split(','))
  const hasEvents = computed(() => !!eventsPath.value.trim())
  const loadingEvents = ref(false)
  const eventsValidation = useYamlValidation({
    method: 'get',
    endpoint: '/security/events/validate',
    request: async () => {
      const { data } = await validateSecurityEvents()
      return (data || {}) as Record<string, unknown>
    },
    mapMessage: (data: { message?: string } | undefined, ok: boolean) =>
      data?.message || (ok ? '连通正常' : '校验失败'),
  })
  const validatingEvents = eventsValidation.validating
  const eventsValidateMsg = eventsValidation.message
  const eventsValidateOk = eventsValidation.valid

  async function validateEventsPath() {
    await eventsValidation.validate('')
  }

  const events = ref<SecurityDoorEvent[]>([])
  const selectedDate = ref(new Date())
  const selectedEventIdx = ref(0)
  const isFullscreenViewer = ref(false)
  const eventShowVideo = ref(false)
  const videoError = ref(false)
  const thumbnailsContainerRef = ref<HTMLElement | null>(null)

  const currentYear = computed(() => selectedDate.value.getFullYear())
  const currentMonth = computed(() => selectedDate.value.getMonth())
  const calendarDays = computed(() =>
    buildSecurityCalendarDays(currentYear.value, currentMonth.value),
  )
  const isSameDay = isSameCalendarDay

  const selectedDateStr = computed(() =>
    formatLocaleDate(
      selectedDate.value,
      { year: 'numeric', month: '2-digit', day: '2-digit' },
      'en-CA',
    ),
  )
  const dayEvents = computed(() => events.value.filter((event) => event.date === selectedDateStr.value))
  const currentEventVideo = computed(() =>
    resolveSecurityEventVideo(dayEvents.value[selectedEventIdx.value]),
  )

  function clampSelectedEventIdx() {
    const max = Math.max(0, dayEvents.value.length - 1)
    if (selectedEventIdx.value > max) selectedEventIdx.value = max
  }

  function prevMonth() {
    selectedDate.value = new Date(currentYear.value, currentMonth.value - 1, 1)
  }

  function nextMonth() {
    selectedDate.value = new Date(currentYear.value, currentMonth.value + 1, 1)
  }

  function selectDate(date: Date) {
    selectedDate.value = date
    selectedEventIdx.value = 0
  }

  function onEventClick(idx: number) {
    selectedEventIdx.value = idx
    eventShowVideo.value = !!resolveSecurityEventVideo(dayEvents.value[idx])
    videoError.value = false
  }

  watch(
    () => [selectedEventIdx.value, currentEventVideo.value, selectedDateStr.value],
    () => {
      videoError.value = false
    },
  )

  watch(selectedEventIdx, () => {
    if (thumbnailsContainerRef.value) {
      const imgs = thumbnailsContainerRef.value.querySelectorAll('img')
      const target = imgs[selectedEventIdx.value] as HTMLElement | undefined
      if (target) {
        thumbnailsContainerRef.value.scrollTo({
          left:
            target.offsetLeft -
            thumbnailsContainerRef.value.offsetWidth / 2 +
            target.offsetWidth / 2,
          behavior: 'smooth',
        })
      }
    }
  })

  watch(dayEvents, () => {
    clampSelectedEventIdx()
  })

  async function fetchEvents() {
    const path = eventsPath.value.trim()
    if (!path) {
      events.value = []
      return
    }
    loadingEvents.value = true
    try {
      const res = await fetchSecurityEvents()
      events.value = res.data || []
      if (!events.value.length) {
        eventsValidateOk.value = false
        eventsValidateMsg.value = '路径可读但暂无事件记录'
      }
    } catch (error) {
      logger.error('获取安全事件失败', error)
      events.value = []
      eventsValidateOk.value = false
      eventsValidateMsg.value = '拉取事件失败，请点击「测试连通」检查 eventsPath'
    } finally {
      loadingEvents.value = false
      clampSelectedEventIdx()
    }
  }

  return {
    hasEvents,
    loadingEvents,
    validatingEvents,
    eventsValidateMsg,
    eventsValidateOk,
    validateEventsPath,
    weekdayLabels,
    currentYear,
    currentMonth,
    calendarDays,
    isSameDay,
    selectedDate,
    selectedEventIdx,
    dayEvents,
    currentEventVideo,
    isFullscreenViewer,
    eventShowVideo,
    videoError,
    thumbnailsContainerRef,
    prevMonth,
    nextMonth,
    selectDate,
    onEventClick,
    fetchEvents,
  }
}
