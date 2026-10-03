<!--
  CalendarWidget.vue / components/widgets/system
  日历系统微件：系统 Hub 或浮动面板下展示 HA 日历实体未来事件，
  支持按 entity 下拉切换日历、新建提醒、跳转设置绑定默认日历实体。
  Props: embedded 嵌入态时隐藏头部图标栏与刷新按钮 / poll-interval-ms 轮询周期
  依赖：services/api/system calendar.list/create 接口；
        composables: useApiQuery REST 异步加载；
        Pinia: useEntitiesStore 扫描 calendar 域 + useAuthStore 权限过滤创建按钮
              + useChromeStore；
        HosSelect 日历选择器 + ApiQueryState 包装加载错误态；
        SETTINGS_ROUTES 跳转系统参数绑定默认日历。
  注意: 新建表单仅在 authStore 权限下可操作；时间按 locale-format 本地化。
-->
<template>
  <div class="cal-card widget-glass-card">
    <div class="cal-header" :class="{ 'cal-header--embedded': embedded }">
      <template v-if="!embedded">
        <Calendar class="w-3.5 h-3.5 cal-icon" />
        <span class="cal-title">{{ '今日日程' }}</span>
      </template>
      <button
        v-if="canEdit"
        class="cal-add-btn"
        :class="{ 'cal-add-btn--solo': embedded }"
        :title="showForm ? '收起' : '添加循环提醒'"
        :aria-label="'添加'"
        @click="showForm = !showForm"
      >
        +
      </button>
    </div>
    <div v-if="showForm && canEdit" class="cal-form">
      <input v-model="newReminder.label" class="cal-input" :placeholder="'提醒名称'" />
      <input v-model="newReminder.icon" class="cal-input cal-input--icon" :placeholder="'图标'" />
      <HosSelect variant="inline" trigger-class="cal-input" v-model="newReminder.frequency">
        <option value="daily">{{ '每天' }}</option>
        <option value="weekly">{{ '每周' }}</option>
        <option value="monthly">{{ '每月' }}</option>
      </HosSelect>
      <HosSelect
        variant="inline"
        trigger-class="cal-input"
        v-if="newReminder.frequency === 'weekly'"
        v-model.number="newReminder.dayOfWeek"
      >
        <option :value="0">{{ '周日' }}</option>
        <option :value="1">{{ '周一' }}</option>
        <option :value="2">{{ '周二' }}</option>
        <option :value="3">{{ '周三' }}</option>
        <option :value="4">{{ '周四' }}</option>
        <option :value="5">{{ '周五' }}</option>
        <option :value="6">{{ '周六' }}</option>
      </HosSelect>
      <button class="cal-submit" :disabled="saving" @click="addReminder">
        {{ saving ? '…' : '添加' }}
      </button>
    </div>
    <div class="cal-body">
      <ApiQueryState
        :loading="calendarLoading"
        :error="calendarError || ''"
        tone="indigo"
        error-title="日程加载失败"
        @retry="reloadCalendar"
      >
        <VEmptyState v-if="events.length === 0" compact tone="indigo" :title="'今日无日程'" />
        <div v-else class="cal-list">
          <div v-for="ev in events" :key="ev.id" class="cal-item">
            <div class="cal-dot" :class="ev.allDay ? 'cal-dot--allday' : 'cal-dot--timed'" />
            <div class="cal-content">
              <span class="cal-name">{{ ev.summary }}</span>
              <span class="cal-time">{{ ev.timeStr }}</span>
            </div>
            <div v-if="ev.scheduleId" class="flex items-center gap-1">
              <button
                v-if="canEdit"
                class="cal-snooze"
                :title="'推迟 1 小时'"
                :aria-label="'推迟 1 小时'"
                @click="snoozeReminder(ev.scheduleId)"
              >
                {{ '推迟' }}
              </button>
              <button
                v-if="canEdit"
                class="cal-snooze cal-snooze--del"
                :title="'删除'"
                :aria-label="'删除'"
                @click="deleteReminder(ev.scheduleId)"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </ApiQueryState>
    </div>
  </div>
</template>

<script setup>
/**
 * @file CalendarWidget.vue
 * @module widgets/system
 * @description 日程提醒部件：展示当日日程提醒与外部日历事件，支持创建/推迟/删除提醒，
 *              按日期筛选与分类展示。
 * @dependencies
 *  - vue: computed/ref 响应式
 *  - @lucide/vue: Calendar 图标
 *  - @/components/common/base/HosSelect.vue: 下拉选择
 *  - @/components/common/ApiQueryState.vue: 查询状态容器
 *  - @/stores/entities.store: 实体状态
 *  - @/stores/auth.store: 鉴权状态
 *  - @/stores/chrome.store: 全局通知
 *  - @/services/api/system: 日程提醒与外部日历接口
 *  - @/utils/format/locale-format.util: 本地时间格式化
 */
import HosSelect from '@/components/common/base/HosSelect.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { computed, ref } from 'vue'
import { Calendar } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import {
  createScheduleReminder,
  deleteScheduleReminder,
  fetchExternalCalendarEvents,
  fetchScheduleReminders,
  snoozeScheduleReminder,
} from '@/services/api/system'
import { formatLocaleTime } from '@/utils/format/locale-format.util'
import { notifyError } from '@/services/notify'
import { domainIndexToArray } from '@/utils/entity/derived.util'
import { useApiQuery } from '@/composables/api/useApiQuery'

defineProps({
  embedded: { type: Boolean, default: false },
})

const entitiesStore = useEntitiesStore()
const authStore = useAuthStore()
const chrome = useChromeStore()
const canEdit = computed(() => ['admin', 'adult'].includes(authStore.role))
const showForm = ref(false)
const saving = ref(false)
const newReminder = ref({
  type: 'custom',
  label: '',
  icon: '📌',
  frequency: 'weekly',
  dayOfWeek: 1,
  customDays: [],
  color: '#f97316',
})

function todayDateStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const calendarQuery = useApiQuery(async () => {
  const [remindersRes, eventsRes] = await Promise.all([
    fetchScheduleReminders(),
    fetchExternalCalendarEvents(),
  ])
  const todayStr = todayDateStr()
  return {
    data: {
      reminders: remindersRes.data?.today || [],
      events: (eventsRes.data?.events || []).filter((e) => e.start?.slice(0, 10) === todayStr),
    },
  }
})

const calendarLoading = calendarQuery.loading
const calendarError = calendarQuery.error
const scheduleToday = computed(() => calendarQuery.data?.value?.reminders || [])
const externalEvents = computed(() => calendarQuery.data?.value?.events || [])

async function reloadCalendar() {
  await calendarQuery.retry()
}

async function loadReminders() {
  await reloadCalendar()
}

async function addReminder() {
  if (!newReminder.value.label.trim()) return
  saving.value = true
  try {
    await createScheduleReminder({
      ...newReminder.value,
    })
    newReminder.value.label = ''
    showForm.value = false
    await loadReminders()
  } catch (e) {
    notifyError(e, '操作失败')
  } finally {
    saving.value = false
  }
}

async function snoozeReminder(id) {
  try {
    await snoozeScheduleReminder(id, 60)
    await loadReminders()
  } catch (e) {
    notifyError(e, '操作失败')
  }
}

async function deleteReminder(id) {
  const ok = await chrome.confirm('确定删除该日程提醒？', '删除', {
    type: 'danger',
    confirmText: '删除',
  })
  if (!ok) return
  try {
    await deleteScheduleReminder(id)
    await loadReminders()
  } catch (e) {
    notifyError(e, '操作失败')
  }
}

const events = computed(() => {
  void entitiesStore.getDomainEpoch('calendar')
  const list = []
  for (const item of scheduleToday.value) {
    list.push({
      id: 'sched_' + item.id,
      scheduleId: item.id,
      summary: `${item.icon || ''} ${item.label}`.trim(),
      timeStr: '今日提醒',
      allDay: true,
      start: new Date(),
    })
  }
  for (const ev of externalEvents.value) {
    list.push({
      id: 'cal_' + ev.uid,
      summary: ev.title,
      timeStr: ev.isAllDay ? '全天' : formatTime(new Date(ev.start)),
      allDay: ev.isAllDay,
      start: new Date(ev.start),
    })
  }
  for (const key of domainIndexToArray(entitiesStore.domainEntityIndex.get('calendar'))) {
    const e = entitiesStore.entities[key]
    if (!e) continue
    const attrs = e.attributes || {}
    if (attrs.start_time && attrs.summary) {
      const start = new Date(attrs.start_time)
      const end = attrs.end_time ? new Date(attrs.end_time) : null
      const today = new Date()
      const isToday = start.toDateString() === today.toDateString()
      if (isToday) {
        const allDay = attrs.all_day || false
        list.push({
          id: key + '_' + start.getTime(),
          summary: attrs.summary,
          start,
          end,
          allDay,
          timeStr: allDay ? '全天' : formatTime(start) + (end ? ' - ' + formatTime(end) : ''),
        })
      }
    } else if (attrs.message) {
      list.push({
        id: key,
        summary: attrs.message,
        timeStr: attrs.next_trigger
          ? formatLocaleTime(attrs.next_trigger, { hour: '2-digit', minute: '2-digit' })
          : '',
        allDay: false,
      })
    }
  }
  list.sort((a, b) => (a.start || 0) - (b.start || 0))
  return list
})

function formatTime(d) {
  return formatLocaleTime(d, { hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped src="./styles/CalendarWidget.css"></style>
