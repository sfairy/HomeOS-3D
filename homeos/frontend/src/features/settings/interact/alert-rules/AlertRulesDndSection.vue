<!--
组件：AlertRulesDndSection.vue
所属模块：frontend / src / views / settings / interact / alert-rules
职责：告警规则 · 免打扰（DND）区段。展示当前静默状态与时间线，配置静默时段（起止小时）、
      按预设快速套用，并在未保存时挂起保存条。仅在静默时段内抑制 info/warn 级别告警。
关键依赖：
  - ApiQueryState：免打扰配置加载态/错误重试
  - SettingsCard / SettingsOrchTabs / SettingsFlowBand / SettingsFlowStat：卡片、流程概览与状态指标
  - SettingsRangeField：小时范围滑杆
  - SettingsPendingSaveAction：未保存修改的保存/取消条
  - useAlertRulesSection：从告警规则上下文注入 dnd 相关状态与方法
数据来源：useAlertRulesSection() 返回的 dndSettings / dndForm / dndPreviewActive 等
-->
<template>
  <div class="settings-hub-section alert-dnd-section">
    <p v-if="dndDirty" class="settings-note-callout settings-note-callout--amber">
      <span class="settings-note-callout__label">未保存</span>
      <span>免打扰有未保存修改，请点击下方「保存免打扰」使配置生效。</span>
    </p>
    <div v-if="dndDirty" class="alert-hub-save-bar">
      <SettingsPendingSaveAction
        :pending="dndDirty ? 1 : 0"
        :saving="dndSaving"
        save-text="保存免打扰"
        saving-text="保存中…"
        @save="saveDnd"
        @cancel="cancelDndChanges"
      />
    </div>
    <ApiQueryState
      :loading="dndLoading"
      :error="dndLoadError"
      error-title="免打扰配置加载失败"
      tone="indigo"
      @retry="loadDndSettings"
    >
      <SettingsCard v-if="dndSettings" extra-class="ard-workspace" static>
        <div
          :class="[
            'ard-status-band',
            dndPreviewActive ? 'ard-status-band--active' : 'ard-status-band--idle',
          ]"
        >
          <div class="hub-hero-bar">
            <div class="hub-hero-bar__main">
              <div class="hub-hero-bar__orb alert-dnd-hero__orb">
                <Moon v-if="dndPreviewActive" class="w-4 h-4" />
                <Sun v-else class="w-4 h-4" />
              </div>
              <div class="min-w-0">
                <p class="hub-hero-bar__eyebrow">{{ '当前状态 ·' }} {{ currentTimeLabel }}</p>
                <h3 class="hub-hero-bar__title">
                  {{ dndPreviewActive ? '免打扰时段内' : '正常接收告警' }}
                </h3>
                <p class="hub-hero-bar__desc">
                  {{ dndRangeLabel(dndForm.dndStart, dndForm.dndEnd) }}
                  {{ `· 共 ${dndDurationHours} 小时` }}
                  <span v-if="dndDirty" class="ard-text-warn">{{ '（未保存预览）' }}</span>
                </p>
              </div>
            </div>
            <div
              class="hub-hero-bar__badge"
              :class="dndPreviewActive ? 'alert-dnd-hero__badge--on' : 'alert-dnd-hero__badge--off'"
            >
              {{ dndPreviewActive ? '静默中' : '可通知' }}
            </div>
          </div>
        </div>

        <SettingsFlowBand
          :steps="dndFlowSteps"
          class="ard-flow-band"
          collapsible
          default-collapsed
          toggle-label="流程概览"
          :collapsed-summary="dndFlowSummary"
        >
          <template #stats>
            <SettingsFlowStat
              :label="'当前状态'"
              :value="dndPreviewActive ? '静默中' : '可通知'"
              :tone="dndPreviewActive ? 'amber' : 'emerald'"
              :val-tone="dndPreviewActive ? 'amber' : 'emerald'"
            />
            <SettingsFlowStat
              :label="'静默时段'"
              :value="`${dndDurationHours}h`"
              tone="sky"
              val-tone="sky"
            />
          </template>
        </SettingsFlowBand>

        <div class="ard-tabs-rail">
          <SettingsOrchTabs v-model="alertDndTab" :tabs="alertDndTabs" plain />
        </div>

        <div class="ard-body">
          <div v-show="alertDndTab === 'schedule'">
            <div class="ard-section-intro">
              <h3 class="ard-section-intro__title">{{ '静默时段' }}</h3>
              <p class="ard-section-intro__desc">
                {{ '拖动滑块或点选快捷预设；跨午夜时段（如 22→7）自动识别' }}
              </p>
            </div>

            <div class="alert-dnd-timeline">
              <div class="alert-dnd-timeline__labels">
                <span>0</span><span>6</span><span>12</span><span>18</span><span>24</span>
              </div>
              <div class="alert-dnd-timeline__track" role="img" :aria-label="dndTimelineAria()">
                <div
                  v-for="h in 24"
                  :key="h - 1"
                  :class="[
                    'alert-dnd-timeline__seg',
                    isHourInDnd(h - 1, dndForm.dndStart, dndForm.dndEnd) &&
                      'alert-dnd-timeline__seg--quiet',
                    h - 1 === currentHour && 'alert-dnd-timeline__seg--now',
                  ]"
                  :title="dndHourTitle(h - 1)"
                />
                <div
                  v-if="currentHour >= 0"
                  class="alert-dnd-timeline__needle"
                  :style="{ left: `${((currentHour + 0.5) / 24) * 100}%` }"
                />
              </div>
              <div class="alert-dnd-timeline__legend">
                <span class="alert-dnd-legend-item">
                  <i class="alert-dnd-legend-dot alert-dnd-legend-dot--quiet" />{{ '静默' }}
                </span>
                <span class="alert-dnd-legend-item">
                  <i class="alert-dnd-legend-dot alert-dnd-legend-dot--now" />{{ '当前时刻' }}
                </span>
              </div>
            </div>

            <div class="ard-sliders-grid">
              <div class="ard-slider-cell">
                <SettingsRangeField
                  v-model="dndForm.dndStart"
                  :label="'开始时间'"
                  :min="0"
                  :max="23"
                  :step="SETTINGS_RANGE_STEP.hour"
                  variant="plain"
                  range-class="alert-dnd-range"
                  :format-display="formatHour"
                />
              </div>
              <div class="ard-slider-cell">
                <SettingsRangeField
                  v-model="dndForm.dndEnd"
                  :label="'结束时间'"
                  :min="0"
                  :max="23"
                  :step="SETTINGS_RANGE_STEP.hour"
                  variant="plain"
                  range-class="alert-dnd-range"
                  :format-display="formatHour"
                />
              </div>
            </div>

            <div class="alert-dnd-presets">
              <p class="alert-dnd-presets__label">{{ '快捷预设' }}</p>
              <div class="alert-dnd-presets__grid">
                <button
                  v-for="preset in dndPresets"
                  :key="preset.id"
                  type="button"
                  :class="[
                    'alert-dnd-preset',
                    isDndPresetActive(preset) && 'alert-dnd-preset--active',
                  ]"
                  @click="applyDndPreset(preset)"
                >
                  <Moon class="w-3.5 h-3.5 shrink-0 opacity-70" />
                  <span class="alert-dnd-preset__name">{{ preset.label }}</span>
                  <span class="alert-dnd-preset__range">{{
                    dndRangeLabel(preset.start, preset.end)
                  }}</span>
                </button>
              </div>
            </div>
          </div>

          <div v-show="alertDndTab === 'impact'" class="ard-impact">
            <div class="ard-section-intro">
              <h3 class="ard-section-intro__title">{{ '影响说明' }}</h3>
              <p class="ard-section-intro__desc">
                {{ '静默时段内普通告警会暂停；SOS / 安防 / 地震等生命安全通知仍会送达' }}
              </p>
            </div>

            <div class="ard-impact-band">
              <section class="ard-impact-block ard-impact-block--mute">
                <header class="ard-impact-block__head">
                  <div class="ard-impact-block__orb">
                    <BellOff class="w-4 h-4" />
                  </div>
                  <div class="min-w-0">
                    <h4 class="ard-impact-block__title">{{ '静默期间暂停' }}</h4>
                    <p class="ard-impact-block__sub">{{ '以下通道在静默时段不会推送' }}</p>
                  </div>
                </header>
                <div class="ard-impact-chips">
                  <span class="ard-impact-chip ard-impact-chip--warn">{{ '信息 / 警告级应用内规则' }}</span>
                  <span class="ard-impact-chip ard-impact-chip--warn">{{ '音箱 TTS 语音告警' }}</span>
                </div>
              </section>

              <div class="ard-impact-band__split" aria-hidden="true" />

              <section class="ard-impact-block ard-impact-block--pass">
                <header class="ard-impact-block__head">
                  <div class="ard-impact-block__orb">
                    <ShieldAlert class="w-4 h-4" />
                  </div>
                  <div class="min-w-0">
                    <h4 class="ard-impact-block__title">{{ '紧急仍送达' }}</h4>
                    <p class="ard-impact-block__sub">{{ '生命安全与危险级链路不受静默影响' }}</p>
                  </div>
                </header>
                <div class="ard-impact-chips">
                  <span class="ard-impact-chip ard-impact-chip--danger">{{ '危险级规则' }}</span>
                  <span class="ard-impact-chip ard-impact-chip--danger">{{ 'SOS / 安防 / 地震预警' }}</span>
                  <span class="ard-impact-chip ard-impact-chip--pass">{{ '通知中心历史记录保留' }}</span>
                  <span class="ard-impact-chip ard-impact-chip--pass">{{ '实时推送提醒不受影响' }}</span>
                </div>
              </section>
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard v-else-if="!dndLoading" static>
        <div class="settings-premium-empty settings-premium-empty--amber">
          <Moon class="settings-premium-empty__icon" />
          <p class="settings-premium-empty__title">{{ '无法加载免打扰设置' }}</p>
          <p class="settings-premium-empty__desc">{{ '请确认已登录 admin 账户，或稍后重试' }}</p>
          <div class="settings-premium-empty__actions">
            <button
              type="button"
              class="settings-premium-empty__btn settings-premium-empty__btn--accent"
              @click="loadDndSettings"
            >
              {{ '重新加载' }}
            </button>
          </div>
        </div>
      </SettingsCard>
    </ApiQueryState>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { BellOff, Clock, Filter, Moon, ShieldAlert, Sun } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsOrchTabs from '@/features/settings/shared/layout/SettingsOrchTabs.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/features/settings/shared/layout/SettingsFlowStat.vue'
import SettingsRangeField from '@/features/settings/shared/layout/SettingsRangeField.vue'
import SettingsPendingSaveAction from '@/features/settings/shared/SettingsPendingSaveAction.vue'
import { SETTINGS_RANGE_STEP } from '@/utils/settings/range-steps.util'
import { useAlertRulesSection } from './context'

const {
  dndSettings,
  dndForm,
  dndLoading,
  dndLoadError,
  dndPresets,
  currentHour,
  currentTimeLabel,
  dndPreviewActive,
  dndDurationHours,
  dndDirty,
  dndSaving,
  formatHour,
  dndRangeLabel,
  isHourInDnd,
  isDndPresetActive,
  applyDndPreset,
  loadDndSettings,
  saveDnd,
  cancelDndChanges,
  dndHourTitle,
  dndTimelineAria,
  alertDndTab,
  alertDndTabs,
} = useAlertRulesSection([
  'dndSettings',
  'dndForm',
  'dndLoading',
  'dndLoadError',
  'dndPresets',
  'currentHour',
  'currentTimeLabel',
  'dndPreviewActive',
  'dndDurationHours',
  'dndDirty',
  'dndSaving',
  'formatHour',
  'dndRangeLabel',
  'isHourInDnd',
  'isDndPresetActive',
  'applyDndPreset',
  'loadDndSettings',
  'saveDnd',
  'cancelDndChanges',
  'dndHourTitle',
  'dndTimelineAria',
  'alertDndTab',
  'alertDndTabs',
])

const dndFlowSteps = computed(() => [
  {
    label: '时段设定',
    meta: dndRangeLabel(dndForm.value.dndStart, dndForm.value.dndEnd),
    icon: Clock,
    tone: 'in',
  },
  {
    label: '规则匹配',
    meta: dndPreviewActive.value ? '静默时段内' : '时段外',
    icon: Filter,
    tone: dndPreviewActive.value ? 'amber' : 'sky',
  },
  {
    label: '告警静默',
    meta: '信息 / 警告',
    icon: BellOff,
    tone: 'exec',
  },
  {
    label: '危险例外',
    meta: 'danger 仍推送',
    icon: ShieldAlert,
    tone: 'out',
  },
])

const dndFlowSummary = computed(() => {
  const status = dndPreviewActive.value ? '静默中' : '可通知'
  return `${status} · ${dndDurationHours.value}h`
})
</script>

<style scoped src="./styles/alert-rules.css"></style>
