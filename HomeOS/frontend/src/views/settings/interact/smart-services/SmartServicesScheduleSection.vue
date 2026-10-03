<!--
组件：SmartServicesScheduleSection.vue
所属模块：frontend / src / views / settings / interact / smart-services
职责：循环日程提醒区段。展示提醒列表与一键导入的生活预设方案，支持提醒的增删改、类型/频率/图标配置、
      模板预览与预设导入进度。与 Dashboard「今日日程」部件同源。
Props：
  - canManageReminders：是否可管理提醒
  - remindersLoadError：提醒加载错误
  - reminders：提醒列表
  - schedulePresets：生活预设方案
  - applyingPresetId：正在导入的预设 id
  - clearingReminders：是否正在清空提醒
  - addReminder / updateReminder / deleteReminder / clearAllReminders：提醒增删改清
  - applySchedulePreset：导入预设
  - refreshAll：刷新全部区段数据
关键依赖：
  - SettingsCard / SettingsFlowBand / SettingsFlowStat：卡片与流程概览
  - HosSelect：频率/类型下拉
  - SmartServicesLoadError：加载错误提示
  - useScheduleReminderEditor：提醒编辑聚合（表单/校验/预览）
  - useChromeStore：notify
数据来源：父级 SettingsSmartServicesPanel 透传的 reminders / schedulePresets 等
-->
<template>
  <div class="settings-hub-section schedule-hub settings-hub-section--fill">
    <SettingsCard extra-class="svc-workspace svc-workspace--schedule svc-workspace--scrollable" static>
      <div class="svc-head-band svc-head-band--schedule">
        <div class="svc-head">
          <div class="svc-head__orb svc-orb--schedule">
            <Calendar class="w-5 h-5 svc-icon--schedule" />
          </div>
          <div class="min-w-0">
            <h3 class="svc-head__title">{{ '循环日程提醒' }}</h3>
            <p class="svc-head__desc">
              {{ '与 Dashboard「今日日程」部件同源；可在此统一管理' }}
            </p>
          </div>
        </div>
      </div>

      <SettingsFlowBand
        :steps="scheduleFlowSteps"
        class="schedule-flow-band"
        collapsible
        default-collapsed
        toggle-label="流程概览"
        :collapsed-summary="scheduleFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'提醒'"
            :value="reminders.length"
            tone="accent"
            val-tone="accent"
          />
          <SettingsFlowStat
            :label="'预设'"
            :value="schedulePresets.length"
            tone="sky"
            val-tone="sky"
          />
        </template>
      </SettingsFlowBand>

      <div class="svc-body svc-body--scroll">
        <SmartServicesLoadError
          v-if="remindersLoadError"
          title="日程提醒加载失败"
          :message="remindersLoadError"
          :on-retry="refreshAll"
        />

        <template v-else>
          <section v-if="canManageReminders && schedulePresets.length" class="schedule-section">
          <header class="schedule-section__head">
            <div>
              <p class="schedule-section__eyebrow">{{ '快速预设' }}</p>
              <h3 class="schedule-section__title">{{ '一键导入生活场景' }}</h3>
            </div>
            <span class="schedule-section__badge">{{ `${schedulePresets.length} 套方案` }}</span>
          </header>
          <div class="schedule-presets__grid">
            <article
              v-for="preset in schedulePresets"
              :key="preset.id"
              :class="[
                'schedule-preset-card',
                preset.appliedCount >= preset.itemCount && 'schedule-preset-card--done',
              ]"
              :style="{ '--preset-accent': presetAccent(preset.id) }"
            >
              <div class="schedule-preset-card__glow" aria-hidden="true" />
              <header class="schedule-preset-card__head">
                <div class="schedule-preset-card__icon">{{ presetMeta(preset.id).emoji }}</div>
                <div class="schedule-preset-card__meta">
                  <span class="schedule-preset-card__name">{{ preset.name }}</span>
                  <span class="schedule-preset-card__stat">
                    {{ `${preset.appliedCount}/${preset.itemCount} 已添加` }}
                  </span>
                </div>
              </header>
              <div class="schedule-preset-card__progress" aria-hidden="true">
                <span
                  class="schedule-preset-card__progress-bar"
                  :style="{ width: `${presetProgress(preset)}%` }"
                />
              </div>
              <p class="schedule-preset-card__desc">{{ preset.description }}</p>
              <ul v-if="preset.items?.length" class="schedule-preset-card__items">
                <li v-for="item in preset.items" :key="item.label">
                  <span class="schedule-preset-card__item-icon">{{ item.icon }}</span>
                  <span class="schedule-preset-card__item-copy">
                    <span class="schedule-preset-card__item-name">{{ item.label }}</span>
                    <span class="schedule-preset-card__item-freq">{{
                      item.scheduleLabel || presetItemSchedule(item)
                    }}</span>
                  </span>
                  <span
                    :class="[
                      'schedule-preset-card__item-state',
                      item.alreadyApplied && 'schedule-preset-card__item-state--done',
                    ]"
                  >
                    {{ item.alreadyApplied ? '已有' : '待加' }}
                  </span>
                </li>
              </ul>
              <button
                type="button"
                class="schedule-preset-card__apply"
                :disabled="
                  applyingPresetId === preset.id || preset.appliedCount >= preset.itemCount
                "
                @click="onApplyPreset(preset)"
              >
                <Sparkles
                  v-if="applyingPresetId !== preset.id && preset.appliedCount < preset.itemCount"
                  class="w-3.5 h-3.5"
                />
                <RefreshCw
                  v-else-if="applyingPresetId === preset.id"
                  class="w-3.5 h-3.5 animate-spin"
                />
                {{
                  applyingPresetId === preset.id
                    ? '应用中…'
                    : preset.appliedCount >= preset.itemCount
                      ? '已全部添加'
                      : '应用预设'
                }}
              </button>
            </article>
          </div>
        </section>

        <section class="schedule-section">
          <header class="schedule-section__head">
            <div>
              <p class="schedule-section__eyebrow">{{ '我的提醒' }}</p>
              <h3 class="schedule-section__title">{{ '已添加的日程' }}</h3>
            </div>
            <button
              v-if="canManageReminders && reminders.length"
              type="button"
              class="schedule-list__clear"
              :disabled="clearingReminders"
              @click="onClearAllReminders"
            >
              <Trash2 :class="['w-3.5 h-3.5', clearingReminders && 'animate-pulse']" />
              {{ clearingReminders ? '清除中…' : '一键清除' }}
            </button>
          </header>

          <div v-if="reminders.length" class="schedule-list__grid">
            <article
              v-for="item in reminders"
              :key="item.id"
              :class="[
                'schedule-list__item',
                editingReminderId === item.id && 'schedule-list__item--editing',
              ]"
              :style="{ '--item-accent': item.color || 'var(--page-accent)' }"
            >
              <div class="schedule-list__accent" aria-hidden="true" />
              <div class="schedule-list__icon-orb">
                <span>{{ item.icon || '📌' }}</span>
              </div>
              <div class="schedule-list__body">
                <div class="schedule-list__title-row">
                  <span class="schedule-list__label">{{ item.label }}</span>
                  <span class="schedule-list__type">{{ reminderTypeLabel(item.type) }}</span>
                </div>
                <span class="schedule-list__freq">{{ freqLabel(item) }}</span>
              </div>
              <div v-if="canManageReminders" class="schedule-list__actions">
                <button
                  type="button"
                  :class="[
                    'schedule-list__edit',
                    editingReminderId === item.id && 'schedule-list__edit--active',
                  ]"
                  @click="startEditReminder(item)"
                >
                  <Pencil class="w-3 h-3" />
                  <span class="schedule-list__edit-label">{{
                    editingReminderId === item.id ? '编辑中' : '编辑'
                  }}</span>
                </button>
                <button
                  type="button"
                  class="schedule-list__delete"
                  :aria-label="'删除日程提醒'"
                  @click="onDelete(item.id)"
                >
                  <Trash2 class="w-3 h-3" />
                </button>
              </div>
            </article>
          </div>

          <div v-else-if="!canManageReminders" class="schedule-empty">
            <CalendarClock class="schedule-empty__icon" />
            <p class="schedule-empty__title">{{ '当前账号仅可查看' }}</p>
            <p class="schedule-empty__desc">{{ '日程提醒由管理员或成人账号维护' }}</p>
          </div>
          <div v-else class="schedule-empty">
            <CalendarClock class="schedule-empty__icon" />
            <p class="schedule-empty__title">{{ '还没有日程提醒' }}</p>
            <p class="schedule-empty__desc">{{ '从上方预设一键导入，或在下方自定义添加' }}</p>
          </div>
        </section>

        <section
          v-if="canManageReminders"
          :class="['schedule-section schedule-add', editingReminderId && 'schedule-add--editing']"
        >
          <header class="schedule-add__head">
            <div>
              <p class="schedule-section__eyebrow">
                {{ editingReminderId ? '正在编辑' : '自定义' }}
              </p>
              <h3 class="schedule-add__title">
                {{ editingReminderId ? '编辑提醒' : '添加新提醒' }}
              </h3>
            </div>
            <p class="schedule-add__subtitle">
              {{
                editingReminderId
                  ? '修改后点击「保存修改」；取消将放弃未保存的更改'
                  : '填写表单或使用快捷模板，实时预览将显示在底部'
              }}
            </p>
          </header>

          <div v-if="!editingReminderId" class="schedule-add__quick">
            <span class="schedule-add__quick-label">{{ '快捷填入' }}</span>
            <div class="schedule-add__quick-chips">
              <button
                v-for="tpl in quickTemplates"
                :key="tpl.label"
                type="button"
                class="schedule-add__quick-chip"
                @click="applyQuickTemplate(tpl)"
              >
                {{ tpl.icon }} {{ tpl.label }}
              </button>
            </div>
          </div>

          <div class="schedule-add__grid">
            <label class="schedule-add__field schedule-add__field--wide">
              <span class="schedule-add__label">{{ '提醒名称' }}</span>
              <input
                v-model="newReminder.label"
                class="settings-field"
                :placeholder="'如：周末大扫除、净水器滤芯'"
              />
            </label>

            <label class="schedule-add__field">
              <span class="schedule-add__label">{{ '类别' }}</span>
              <HosSelect
                variant="settings"
                block
                v-model="newReminder.type"
                @change="onReminderTypeChange"
              >
                <option v-for="t in reminderTypes" :key="t.id" :value="t.id">{{ t.label }}</option>
              </HosSelect>
            </label>

            <div class="schedule-add__field schedule-add__field--wide">
              <span class="schedule-add__label">{{ '重复频率' }}</span>
              <div class="schedule-freq-pills" role="group" aria-label="重复频率">
                <button
                  v-for="opt in FREQ_OPTIONS"
                  :key="opt.value"
                  type="button"
                  :class="[
                    'schedule-freq-pill',
                    newReminder.frequency === opt.value && 'schedule-freq-pill--active',
                  ]"
                  @click="newReminder.frequency = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <label class="schedule-add__field">
              <span class="schedule-add__label">{{ '提醒时间' }}</span>
              <input
                v-model="newReminder.time"
                type="time"
                class="settings-field"
                :max="'23:59'"
              />
            </label>

            <div class="schedule-add__cycle schedule-add__field--wide">
              <span class="schedule-add__label">{{ '周期详情' }}</span>

              <p v-if="newReminder.frequency === 'daily'" class="schedule-add__cycle-hint">
                <Repeat class="w-3.5 h-3.5 shrink-0" />
                {{ '每天提醒，无需选择星期或日期号。' }}
              </p>

              <label
                v-else-if="
                  newReminder.frequency === 'weekly' || newReminder.frequency === 'biweekly'
                "
                class="schedule-add__cycle-row"
              >
                <span class="schedule-add__cycle-row-label">{{ '星期' }}</span>
                <div class="schedule-dow-pills">
                  <button
                    v-for="(name, idx) in DOW_LABELS"
                    :key="idx"
                    type="button"
                    :class="[
                      'schedule-dow-pill',
                      newReminder.dayOfWeek === idx && 'schedule-dow-pill--active',
                    ]"
                    @click="newReminder.dayOfWeek = idx"
                  >
                    {{ name.replace('周', '') }}
                  </button>
                </div>
              </label>

              <div v-else-if="newReminder.frequency === 'monthly'" class="schedule-add__monthly">
                <label class="schedule-add__cycle-row">
                  <span class="schedule-add__cycle-row-label">{{ '每月几号' }}</span>
                  <input
                    v-model="newReminder.customDaysText"
                    class="settings-field"
                    inputmode="numeric"
                    :placeholder="'如 1 或 1,15,28'"
                  />
                </label>
                <p class="schedule-add__cycle-hint">
                  {{ '可填多个日期，用逗号分隔；与预设中「每月 15 号」等形式一致。' }}
                </p>
                <div class="schedule-add__monthly-chips">
                  <button
                    v-for="day in MONTH_DAY_QUICK"
                    :key="day"
                    type="button"
                    :class="[
                      'schedule-add__monthly-chip',
                      isMonthDaySelected(day) && 'schedule-add__monthly-chip--active',
                    ]"
                    @click="toggleMonthDay(day)"
                  >
                    {{ `${day} 号` }}
                  </button>
                </div>
              </div>
            </div>

            <div class="schedule-add__field schedule-add__field--wide">
              <span class="schedule-add__label">{{ '图标' }}</span>
              <div class="schedule-add__icons">
                <button
                  v-for="icon in iconOptions"
                  :key="icon"
                  type="button"
                  :class="[
                    'schedule-add__icon-btn',
                    newReminder.icon === icon && 'schedule-add__icon-btn--active',
                  ]"
                  @click="newReminder.icon = icon"
                >
                  {{ icon }}
                </button>
              </div>
            </div>
          </div>

          <div class="schedule-add__footer">
            <div v-if="newReminderPreview" class="schedule-add__preview">
              <span class="schedule-add__preview-icon">{{ newReminder.icon || '📌' }}</span>
              <span class="schedule-add__preview-text">
                {{ newReminder.label.trim() || '未命名提醒' }}
                <span class="schedule-add__preview-freq">· {{ newReminderPreview }}</span>
              </span>
            </div>
            <div class="schedule-add__actions">
              <button
                v-if="editingReminderId"
                type="button"
                class="settings-btn-ghost schedule-add__cancel"
                :disabled="savingReminder"
                @click="cancelEditReminder"
              >
                {{ '取消' }}
              </button>
              <button
                type="button"
                class="settings-btn-accent schedule-add__submit"
                :disabled="savingReminder || !canSubmitReminder"
                @click="onSaveReminder"
              >
                <component :is="editingReminderId ? Save : Plus" class="w-3.5 h-3.5" />
                {{
                  savingReminder
                    ? editingReminderId
                      ? '保存中…'
                      : '添加中…'
                    : editingReminderId
                      ? '保存修改'
                      : '添加提醒'
                }}
              </button>
            </div>
          </div>
        </section>
      </template>
      </div>
    </SettingsCard>
  </div>
</template>

<script setup>
import HosSelect from '@/components/common/base/HosSelect.vue'
import { computed, toRef } from 'vue'
import {
  Calendar,
  CalendarClock,
  Repeat,
  Trash2,
  Plus,
  Pencil,
  Save,
  Sparkles,
  RefreshCw,
  Bell,
  Monitor,
} from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import SmartServicesLoadError from './SmartServicesLoadError.vue'
import { useScheduleReminderEditor } from '@/composables/advisor/hub-presence-advisor.internals'
import { useChromeStore } from '@/stores/chrome.store'

const props = defineProps({
  canManageReminders: { type: Boolean, default: false },
  remindersLoadError: { type: String, default: '' },
  reminders: { type: Array, default: () => [] },
  schedulePresets: { type: Array, default: () => [] },
  applyingPresetId: { type: String, default: null },
  clearingReminders: { type: Boolean, default: false },
  addReminder: { type: Function, required: true },
  updateReminder: { type: Function, required: true },
  deleteReminder: { type: Function, required: true },
  clearAllReminders: { type: Function, required: true },
  applySchedulePreset: { type: Function, required: true },
  refreshAll: { type: Function, required: true },
})

const chrome = useChromeStore()
const reminders = toRef(props, 'reminders')

const {
  reminderTypes,
  iconOptions,
  quickTemplates,
  freqOptions: FREQ_OPTIONS,
  monthDayQuick: MONTH_DAY_QUICK,
  dowLabels: DOW_LABELS,
  savingReminder,
  editingReminderId,
  newReminder,
  scheduleStats,
  newReminderPreview,
  canSubmitReminder,
  freqLabel,
  presetMeta,
  presetProgress,
  presetAccent,
  reminderTypeLabel,
  isMonthDaySelected,
  toggleMonthDay,
  onReminderTypeChange,
  applyQuickTemplate,
  startEditReminder,
  cancelEditReminder,
  onSaveReminder,
  onDeleteReminder: onDelete,
  onClearAllReminders,
  onApplyPreset,
} = useScheduleReminderEditor({
  chrome,
  reminders,
  addReminder: (p) => props.addReminder(p),
  updateReminder: (id, p) => props.updateReminder(id, p),
  deleteReminder: (id) => props.deleteReminder(id),
  clearAllReminders: () => props.clearAllReminders(),
  applySchedulePreset: (id) => props.applySchedulePreset(id),
})

function presetItemSchedule(item) {
  return freqLabel(item)
}

const scheduleFlowSteps = computed(() => [
  {
    label: '生活预设',
    meta: `${props.schedulePresets.length} 套`,
    icon: Sparkles,
    tone: 'in',
  },
  {
    label: '定义提醒',
    meta: `${props.reminders.length} 条`,
    icon: CalendarClock,
    tone: 'sky',
  },
  {
    label: 'Cron/频率',
    meta: scheduleStats.value?.byFreq?.daily
      ? `每天 ${scheduleStats.value.byFreq.daily}`
      : '周期调度',
    icon: Repeat,
    tone: 'mid',
  },
  { label: '大屏', meta: '今日日程', icon: Monitor, tone: 'exec' },
  { label: '到点通知', meta: '循环提醒', icon: Bell, tone: 'out' },
])

const scheduleFlowSummary = computed(
  () => `${props.reminders.length} 提醒 · ${props.schedulePresets.length} 预设`,
)
</script>

<style scoped src="./styles/smart-services.css"></style>
