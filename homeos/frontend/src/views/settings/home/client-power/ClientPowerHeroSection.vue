<!--
组件：ClientPowerHeroSection.vue
所属模块：frontend / src / views / settings / home / client-power
职责：智能充放电总览区段。展示流程概览（终端电量→滞回阈值→Switch 控制）、
      总开关、本机 ID（可复制）、电量读取提示（HTTPS/Battery API）与心跳间隔设置。
关键依赖：
  - SettingsCard / SettingsSectionHead / SettingsFlowBand / SettingsFlowStat：卡片与流程
  - lucide 图标
数据来源：父级透传的 config / 各类统计数 / localClientId / copyClientId
-->
<script setup>
/**
 * 职责：渲染 views/ClientPowerHeroSection 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed } from 'vue'
import {
  Activity,
  BatteryCharging,
  Copy,
  PlugZap,
  RefreshCw,
} from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsSectionHead from '@/views/settings/shared/layout/SettingsSectionHead.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'

// 入参：配置对象、加载/保存状态、各类统计数、本机 ID 与电量提示、复制函数
const props = defineProps({
  config: { type: Object, required: true },
  loading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  statusLoading: { type: Boolean, default: false },
  registeredCount: { type: Number, default: 0 },
  enabledCount: { type: Number, default: 0 },
  onlineCount: { type: Number, default: 0 },
  pendingCount: { type: Number, default: 0 },
  localClientId: { type: String, default: '' },
  localBatteryHint: { type: String, default: '' },
  localNeedsHttpsForBattery: { type: Boolean, default: false },
  copyClientId: { type: Function, required: true },
})

// 对外事件：补丁配置（总开关/心跳间隔）、刷新状态
const emit = defineEmits(['patch-config', 'refresh-status'])

// 充电流程步骤：终端电量 → 滞回阈值 → Switch 控制（联动状态随总开关切换）
const chargeFlowSteps = computed(() => [
  { label: '终端电量', meta: '实时监测', icon: Activity, tone: 'in' },
  { label: '滞回阈值', meta: '低开 · 高关', icon: BatteryCharging, tone: 'amber' },
  {
    label: 'Switch 控制',
    meta: props.config.enabled ? '联动运行中' : '总开关关闭',
    icon: PlugZap,
    tone: props.config.enabled ? 'exec' : 'secondary',
  },
])

// 流程折叠态摘要：注册数 + 在线数 + 联动开关
const chargeFlowSummary = computed(() => {
  const run = props.config.enabled ? '联动开' : '联动关'
  return `${props.registeredCount} 注册 · ${props.onlineCount} 在线 · ${run}`
})

// 心跳间隔输入：数值合法时向上抛出 patch-config
function onReportIntervalInput(e) {
  const value = Number(e.target.value)
  if (Number.isFinite(value)) emit('patch-config', { reportIntervalSec: value })
}
</script>

<template>
  <div class="charge-hero-stack">
    <SettingsCard full static extra-class="charge-overview-card charge-overview-workspace">
      <SettingsFlowBand
        :steps="chargeFlowSteps"
        collapsible
        default-collapsed
        toggle-label="流程概览"
        :collapsed-summary="chargeFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'注册设备'"
            :value="registeredCount"
            tone="emerald"
            val-tone="emerald"
          />
          <SettingsFlowStat
            :label="'当前在线'"
            :value="onlineCount"
            :tone="onlineCount > 0 ? 'sky' : 'secondary'"
            :val-tone="onlineCount > 0 ? 'sky' : 'secondary'"
          />
        </template>
      </SettingsFlowBand>
    </SettingsCard>

    <SettingsCard
      full
      static
      extra-class="charge-control-card"
      :class="!config.enabled && 'charge-control-card--off'"
    >
      <SettingsSectionHead
        icon-key="smart-charge"
        icon-class="charge-control-head__icon"
        orb-class="charge-control-head__orb"
        title="智能充放电总开关"
        description="墙面板电量采集依赖浏览器 Battery API，且通常需 HTTPS（或 localhost）。HTTP 局域网与部分 Safari 可能读不到电量。"
        bordered
      >
        <template #actions>
          <div class="charge-control-actions">
            <button
              type="button"
              class="settings-btn-ghost charge-control-actions__refresh"
              :disabled="statusLoading"
              @click="emit('refresh-status')"
            >
              <RefreshCw :class="['w-3.5 h-3.5', statusLoading && 'animate-spin']" />
              {{ '刷新状态' }}
            </button>
            <button
              type="button"
              class="toggle-btn charge-control-actions__toggle"
              :class="{ on: config.enabled }"
              :aria-label="'启用智能充放电'"
              @click="emit('patch-config', { enabled: !config.enabled })"
            >
              <div class="toggle-dot" :class="{ on: config.enabled }" />
            </button>
          </div>
        </template>
      </SettingsSectionHead>

      <div class="charge-control-meta">
        <div class="charge-control-meta__item">
          <span class="charge-control-meta__label">{{ '本机 ID' }}</span>
          <div class="charge-control-meta__value">
            <code class="charge-control-meta__id">{{ localClientId }}</code>
            <button
              type="button"
              class="charge-id-copy"
              :title="'复制本机 ID'"
              :aria-label="'复制本机 ID'"
              @click="copyClientId(localClientId)"
            >
              <Copy class="w-3 h-3" />
            </button>
            <span v-if="localNeedsHttpsForBattery" class="charge-id-note__tag">{{
              '电量：需 HTTPS + Battery API'
            }}</span>
            <span v-if="localBatteryHint" class="charge-id-note__hint"
              >· {{ localBatteryHint }}</span
            >
          </div>
        </div>

        <div class="charge-control-meta__item">
          <span class="charge-control-meta__label">{{ '心跳间隔' }}</span>
          <label class="charge-poll-setting">
            <input
              :value="config.reportIntervalSec"
              type="number"
              min="5"
              max="600"
              step="1"
              class="charge-poll-setting__input"
              @input="onReportIntervalInput"
            />
            <span class="charge-poll-setting__unit">{{ '秒' }}</span>
            <span class="charge-poll-setting__hint">{{ '电量变化时立即上报' }}</span>
          </label>
        </div>
      </div>
    </SettingsCard>
  </div>
</template>

<style scoped src="./styles/client-power.css"></style>
