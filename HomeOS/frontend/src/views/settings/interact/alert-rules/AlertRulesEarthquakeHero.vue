<!--
组件：AlertRulesEarthquakeHero.vue
所属模块：frontend / src / views / settings / interact / alert-rules
职责：地震预警 · 主开关与链路概览。通过 FlowBand 展示「数据源 → 阈值 → 震中距 → 全屏倒计时」流程，
      用 FeatureMaster 提供启用开关与刷新入口，并汇总 Wolfx 连接、坐标配置、启用状态三项指标。
Props：
  - enabled / pending / statusLoading / statusConnected / statusConnecting：启用与连接状态
  - coordsConfigured：家庭坐标是否就绪
  - enableTts：是否启用 TTS 播报
  - wolfxStatusLabel：Wolfx 连接状态文案
  - minMagnitude / maxDistance / minLocalIntensity：触发阈值
Emits：
  - refresh：点击「刷新状态」时触发
  - update:enabled：切换启用开关时回传新值
关键依赖：
  - SettingsCard / SettingsFlowBand / SettingsFlowStat / SettingsFeatureMaster：卡片与流程组件
  - SettingsFlowStep：流程步骤类型
数据来源：父级 AlertRulesEarthquakeSection 透传的 props
-->
<template>
  <SettingsCard
    static
    :extra-class="`alert-eew-workspace ${enabled ? 'alert-eew-workspace--live' : 'alert-eew-workspace--idle'}`"
  >
    <SettingsFlowBand
      :steps="eewFlowSteps"
      collapsible
      default-collapsed
      toggle-label="流程概览"
      :collapsed-summary="eewFlowSummary"
    >
      <template #stats>
        <SettingsFlowStat
          label="Wolfx"
          :value="wolfxStatusLabel"
          :tone="wolfxStatTone"
          :val-tone="wolfxStatTone"
        />
        <SettingsFlowStat
          label="家庭坐标"
          :value="coordsConfigured ? '已配置' : '待配置'"
          :tone="coordsConfigured ? 'amber' : 'rose'"
          :val-tone="coordsConfigured ? 'amber' : 'rose'"
        />
        <SettingsFlowStat
          label="预警"
          :value="enabled ? '已启用' : '已关闭'"
          :tone="enabled ? 'amber' : 'secondary'"
          :val-tone="enabled ? 'amber' : 'secondary'"
        />
      </template>
    </SettingsFlowBand>

    <SettingsFeatureMaster
      class="settings-feature-master--stack"
      :icon="TriangleAlert"
      tone="amber"
      :active="enabled"
      title="启用地震预警"
    >
      <template #hint>
        {{
          enabled
            ? '双源速报接入中 · 满足阈值后全屏倒计时预警'
            : '关闭后不再连接数据源，也不弹出全屏预警'
        }}
        <span v-if="pending" class="eew-c-warn-soft">（未保存）</span>
      </template>
      <template #actions>
        <button
          type="button"
          class="alert-eew-link-btn"
          :disabled="statusLoading"
          @click="$emit('refresh')"
        >
          <Loader2 v-if="statusLoading" class="w-3 h-3 animate-spin inline" />
          刷新状态
        </button>
        <router-link to="/earthquake-history" class="alert-eew-link-btn">地震信息</router-link>
        <label class="alert-eew-toggle" title="启用地震预警">
          <input
            :checked="enabled"
            type="checkbox"
            @change="$emit('update:enabled', ($event.target as HTMLInputElement).checked)"
          />
          <span class="alert-eew-toggle__track" :class="{ 'alert-eew-toggle__track--on': enabled }">
            <span class="alert-eew-toggle__thumb" />
          </span>
        </label>
      </template>
    </SettingsFeatureMaster>

    <ul class="alert-eew-ready-row" aria-label="就绪检查">
      <li :class="['alert-eew-ready-chip', enabled ? 'is-ok' : 'is-off']">
        <span class="alert-eew-ready-chip__dot" />
        {{ enabled ? '预警已开' : '预警关闭' }}
      </li>
      <li :class="['alert-eew-ready-chip', statusConnected ? 'is-ok' : statusConnecting ? 'is-warn' : 'is-off']">
        <span class="alert-eew-ready-chip__dot" />
        {{ wolfxStatusLabel }}
      </li>
      <li :class="['alert-eew-ready-chip', coordsConfigured ? 'is-ok' : 'is-warn']">
        <span class="alert-eew-ready-chip__dot" />
        {{ coordsConfigured ? '坐标就绪' : '坐标待配' }}
      </li>
      <li :class="['alert-eew-ready-chip', enableTts ? 'is-ok' : 'is-off']">
        <span class="alert-eew-ready-chip__dot" />
        {{ enableTts ? 'TTS 开' : 'TTS 关' }}
      </li>
    </ul>
  </SettingsCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  Loader2,
  Radio,
  Filter,
  MapPin,
  Monitor,
  Volume2,
  TriangleAlert,
} from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import type { SettingsFlowStep } from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import SettingsFeatureMaster from '@/views/settings/shared/layout/SettingsFeatureMaster.vue'

const props = defineProps<{
  enabled: boolean
  pending: boolean
  statusLoading: boolean
  statusConnected: boolean
  statusConnecting: boolean
  coordsConfigured: boolean
  enableTts: boolean
  wolfxStatusLabel: string
  minMagnitude: number | string
  maxDistance: number | string
  minLocalIntensity?: number | string
}>()

defineEmits<{
  refresh: []
  'update:enabled': [value: boolean]
}>()

const wolfxStatTone = computed(() => {
  if (props.statusConnected) return 'emerald' as const
  if (props.statusConnecting) return 'amber' as const
  return 'rose' as const
})

const eewFlowSummary = computed(() => {
  const coords = props.coordsConfigured ? '坐标已配' : '坐标待配'
  const on = props.enabled ? '已启用' : '已关闭'
  return `${on} · ${props.wolfxStatusLabel} · ${coords}`
})

const eewFlowSteps = computed((): SettingsFlowStep[] => [
  {
    label: '数据源',
    meta: props.wolfxStatusLabel,
    icon: Radio,
    tone: props.statusConnected || props.statusConnecting ? 'amber' : 'secondary',
  },
  {
    label: '阈值',
    meta: `M${props.minMagnitude} · ${props.maxDistance}km · ${props.minLocalIntensity ?? '—'}度`,
    icon: Filter,
    tone: props.enabled ? 'amber' : 'secondary',
  },
  {
    label: '震中距',
    meta: props.coordsConfigured ? 'Haversine' : '待配置',
    icon: MapPin,
    tone: props.coordsConfigured ? 'exec' : 'secondary',
  },
  {
    label: '全屏',
    meta: props.enabled ? '倒计时' : '关闭',
    icon: Monitor,
    tone: props.enabled ? 'exec' : 'secondary',
  },
  {
    label: 'TTS',
    meta: props.enableTts ? 'Web Speech' : '关闭',
    icon: Volume2,
    tone: props.enableTts ? 'out' : 'secondary',
  },
])
</script>
