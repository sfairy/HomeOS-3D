<!--
组件：SecurityOverviewCommandBar.vue
所属模块：frontend / src / views / security
职责：安防总览顶部命令栏。展示当前安防状态、模式切换按钮、紧急求助（带二次确认
      与冷却倒计时）、联动失败查看入口，以及告警/传感器分类 chip。
关键依赖：
  - useChromeStore：调用 confirm 弹窗做紧急求助二次确认
  - schedulePoll：SOS 冷却倒计时（页面隐藏时暂停）
  - ShieldCheck / Shield / Loader2 / Siren / AlertTriangle / WifiOff 图标来自 @lucide/vue
数据来源：父级 Overview 透传的安防模式、状态、告警、传感器 chip、布防区域等状态
-->
<template>
  <section
    class="sec-dash-command glass-shine"
    :class="alertCount > 0 && 'sec-dash-command--alert'"
  >
    <p v-if="armSelectionHint" class="sec-dash-arm-hint">
      <Shield class="w-3.5 h-3.5 shrink-0 opacity-70" />
      <span>{{ armSelectionHint }}</span>
    </p>

    <div
      v-if="linkageFailureRecent.length"
      class="sec-dash-command-linkfail"
      role="status"
    >
      <WifiOff class="w-3.5 h-3.5 shrink-0" />
      <span>{{ `近 24h ${linkageFailureRecent.length} 条联动失败` }}</span>
      <button type="button" class="sec-dash-notice-link" @click="$emit('view-linkage')">
        {{ '查看详情' }}
      </button>
    </div>

    <div class="sec-dash-command-body">
      <div class="sec-dash-command-main">
        <div
          :class="[
            'sec-dash-status',
            `sec-dash-status--${modeStatusClass}`,
            isArmed && 'sec-dash-status--armed',
          ]"
          :style="{ '--ring': modeAccentFor(secCurrentMode) }"
          :title="sensorCooldownSec ? `告警冷却 ${sensorCooldownSec}s` : secCurrentName"
        >
          <div class="sec-dash-status-ring" aria-hidden="true" />
          <div class="sec-dash-status-icon-wrap">
            <ShieldCheck :class="['sec-dash-status-icon', secModeColor]" />
          </div>
          <div class="sec-dash-status-copy">
            <span class="sec-dash-status-label">{{ '安防状态' }}</span>
            <div class="sec-dash-status-row">
              <span class="sec-dash-status-name">{{ secCurrentName }}</span>
              <button
                v-if="sensorCooldownSec"
                type="button"
                class="sec-dash-inline-link"
                @click="$emit('go-security-params')"
              >
                {{ `冷却 ${sensorCooldownSec}s` }}
              </button>
            </div>
            <span v-if="presenceSummary" class="sec-dash-status-meta">{{ presenceSummary }}</span>
            <span
              v-if="secCurrentMode === 'armed_home'"
              class="sec-dash-status-meta sec-dash-status-meta--warn"
            >
              {{ '居家布防中：部分区域仍受监控，并非撤防' }}
            </span>
          </div>
        </div>

        <div class="sec-dash-mode-bar">
          <button
            v-for="mode in securityModes"
            :key="mode.key"
            type="button"
            :class="[
              'sec-dash-mode-btn',
              secCurrentMode === mode.key && 'sec-dash-mode-btn--active',
            ]"
            :style="
              secCurrentMode === mode.key ? { '--mode-accent': modeAccentFor(mode.key) } : undefined
            "
            :disabled="secArming === mode.key"
            @click="$emit('arm', mode.key)"
          >
            <Loader2 v-if="secArming === mode.key" class="animate-spin" />
            <component v-else :is="secIconMap[mode.icon] || Shield" />
            <span>{{ mode.name }}</span>
          </button>

          <button
            type="button"
            class="sec-dash-sos sec-dash-sos--distinct"
            :disabled="emergencyBusy || sosCooldownLeft > 0"
            @click="onEmergencyClick"
          >
            <Siren />
            <span>{{ sosLabel }}</span>
          </button>
        </div>
      </div>

      <div class="sec-dash-command-side">
        <div v-if="alertCount > 0" class="sec-dash-command-alerts" role="status">
          <AlertTriangle class="sec-dash-command-alerts__icon" />
          <span class="sec-dash-command-alerts__text">{{ `${alertCount} 项告警` }}</span>
        </div>

        <div v-if="sideChips.length" class="sec-dash-command-chips">
          <button
            v-for="chip in sideChips"
            :key="chip.key"
            type="button"
            :class="[
              'sec-dash-chip',
              chip.alert && 'sec-dash-chip--alert',
              sensorFilter === chip.key && 'sec-dash-chip--on',
            ]"
            @click="$emit('toggle-sensor-filter', chip.key)"
          >
            <component v-if="chip.icon" :is="chip.icon" class="sec-dash-chip__icon" />
            <span>{{ chip.label }}</span>
            <span class="sec-dash-chip__count">{{ chip.count }}</span>
          </button>
        </div>

        <div v-if="alertCount > 0" class="sec-dash-command-actions">
          <button
            type="button"
            class="sec-dash-btn sec-dash-btn--primary"
            @click="$emit('acknowledge')"
          >
            {{ '确认告警' }}
          </button>
          <button
            type="button"
            class="sec-dash-btn sec-dash-btn--ghost-warn"
            :disabled="reducingSensitivity"
            @click="$emit('false-alarm')"
          >
            {{ reducingSensitivity ? '处理中…' : '误报降敏' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onUnmounted, ref } from 'vue'
import { ShieldCheck, Shield, Loader2, Siren, AlertTriangle, WifiOff } from '@lucide/vue'
import { useChromeStore } from '@/stores/chrome.store'
import { schedulePoll } from '@/utils/core/poll-scheduler'

const chrome = useChromeStore()

// 入参：安防模式列表、当前模式/名称/颜色、冷却秒数、布防中标记、图标映射、传感器 chip、告警等
const props = defineProps({
  securityModes: { type: Array, default: () => [] },
  secCurrentMode: { type: String, default: 'disarmed' },
  secCurrentName: { type: String, default: '' },
  secModeColor: { type: String, default: '' },
  sensorCooldownSec: { type: Number, default: null },
  secArming: { type: String, default: null },
  secIconMap: { type: Object, default: () => ({}) },
  modeAccentFor: { type: Function, required: true },
  statCards: { type: Array, default: () => [] },
  sensorFilter: { type: String, default: 'all' },
  emergencyBusy: Boolean,
  presenceSummary: { type: String, default: '' },
  armZoneSelection: { type: Array, default: () => [] },
  liveZoneCount: { type: Number, default: 0 },
  alertCount: { type: Number, default: 0 },
  activeAlertChips: { type: Array, default: () => [] },
  linkageFailureRecent: { type: Array, default: () => [] },
  reducingSensitivity: Boolean,
})

// 对外事件：布防/撤防、紧急求助、切换传感器筛选、跳转参数、查看联动、确认告警、误报降敏
const emit = defineEmits([
  'arm',
  'emergency',
  'toggle-sensor-filter',
  'go-security-params',
  'view-linkage',
  'acknowledge',
  'false-alarm',
])

// SOS 触发后冷却秒数：冷却期内按钮置灰不可点
const SOS_COOLDOWN_SEC = 30
// 冷却剩余秒数
const sosCooldownLeft = ref(0)
// 冷却倒计时轮询任务的取消函数
let sosCooldownCancel = null

/** SOS 按钮文案：冷却期显示剩余秒数 */
const sosLabel = computed(() =>
  sosCooldownLeft.value > 0 ? `紧急求助 (${sosCooldownLeft.value}s)` : '紧急求助',
)

/**
 * 处理紧急求助点击：先弹出危险样式二次确认，确认后才触发并进入冷却
 * @sideEffects 确认后 $emit('emergency') 并启动冷却倒计时
 */
async function onEmergencyClick() {
  if (props.emergencyBusy || sosCooldownLeft.value > 0) return
  const ok = await chrome.confirm(
    '紧急求助将触发联动（全屋声光/重点区域/静默通知），是否继续？',
    '紧急求助',
    { type: 'danger', confirmText: '确认触发' },
  )
  if (!ok) return
  // 触发成功后进入冷却，期间按钮置灰不可点
  sosCooldownLeft.value = SOS_COOLDOWN_SEC
  // 冷却倒计时经全局调度器每秒递减（页面隐藏时暂停，恢复可见后继续递减）
  sosCooldownCancel = schedulePoll('security:sos-cooldown', () => {
    sosCooldownLeft.value -= 1
    if (sosCooldownLeft.value <= 0) {
      if (sosCooldownCancel) {
        sosCooldownCancel()
        sosCooldownCancel = null
      }
    }
  }, 1000)
  emit('emergency')
}

// 组件卸载时清理冷却轮询任务
onUnmounted(() => {
  if (sosCooldownCancel) sosCooldownCancel()
})

// 安防模式到状态样式后缀的映射，用于切换状态视觉态
const MODE_STATUS_CLASS = {
  disarmed: 'disarmed',
  armed_home: 'home',
  armed_away: 'away',
  armed_night: 'night',
}

// 当前模式对应的样式后缀；未匹配时回退到 disarmed
const modeStatusClass = computed(() => MODE_STATUS_CLASS[props.secCurrentMode] || 'disarmed')
// 是否处于已布防状态（任意 armed_* 模式）
const isArmed = computed(() => props.secCurrentMode !== 'disarmed')

// 撤防态下根据已选区域数量提示布防范围；非撤防态或未选时返回空串
const armSelectionHint = computed(() => {
  const selected = props.armZoneSelection?.length || 0
  const total = props.liveZoneCount || 0
  if (!selected || !total || props.secCurrentMode !== 'disarmed') return ''
  if (selected >= total) return `将全部 ${total} 个区域布防`
  return `已选 ${selected}/${total} 个区域，切换模式时仅布防所选区域`
})

/** 有告警时只展示告警 chip；无告警时展示传感器分类汇总，避免与告警条重复 */
const sideChips = computed(() => {
  if (props.alertCount > 0) {
    const byLabel = new Map(
      (props.statCards || []).map((c) => [c.label, c]),
    )
    return (props.activeAlertChips || []).map((chip) => {
      const card = byLabel.get(chip.label)
      return {
        key: card?.key || chip.label,
        label: chip.label,
        count: chip.count,
        icon: card?.icon,
        alert: true,
      }
    })
  }
  return (props.statCards || []).map((card) => ({
    key: card.key,
    label: card.label,
    count: card.total,
    icon: card.icon,
    alert: false,
  }))
})
</script>
