<!--
组件：SettingsBindingsOverviewSection.vue
所属模块：frontend / src / views / settings / connect / bindings
职责：绑定概览分区。以流程概览展示全局绑定状态（天气、监控、安防、完整性缺口），
      并提示用户进入对应子页完成配置。
关键依赖：
  - SettingsFlowBand / SettingsFlowStat：流程概览
  - SettingsCard：卡片容器
数据来源：父级透传的 weatherBound / cameraCount / doorbellCount / gapCount
-->
<template>
  <div class="settings-hub-section bindings-overview-hub">
    <SettingsCard static>
      <SettingsFlowBand
        :steps="overviewFlowSteps"
        class="bindings-overview-flow"
        collapsible
        default-collapsed
        toggle-label="流程概览"
        :collapsed-summary="overviewFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            label="天气"
            :value="weatherBound ? '已绑定' : '未绑定'"
            :tone="weatherBound ? 'emerald' : 'amber'"
            :val-tone="weatherBound ? 'emerald' : 'amber'"
          />
          <SettingsFlowStat
            label="缺口"
            :value="gapCount ? `${gapCount} 项` : '无'"
            :tone="gapCount ? 'rose' : 'emerald'"
            :val-tone="gapCount ? 'rose' : 'emerald'"
          />
        </template>
      </SettingsFlowBand>

      <p class="settings-note-callout settings-note-callout--sky mt-2.5">
        <span class="settings-note-callout__label">{{ '提示' }}</span>
        <span>{{
          '在此查看全局绑定状态与推荐；天气、监控、安防请进入对应子页配置。环境与生活账户在各自设置页完成。'
        }}</span>
      </p>
    </SettingsCard>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { LayoutDashboard, CloudSun, Video, Bell, ListChecks } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'

// 入参：天气是否绑定、监控路数、门铃路数、完整性缺口数
const props = defineProps({
  weatherBound: { type: Boolean, default: false },
  cameraCount: { type: Number, default: 0 },
  doorbellCount: { type: Number, default: 0 },
  gapCount: { type: Number, default: 0 },
})

// 流程概览折叠态摘要文案：天气状态 · 缺口状态
const overviewFlowSummary = computed(() => {
  const weather = props.weatherBound ? '天气已绑定' : '天气未绑定'
  const gap = props.gapCount ? `${props.gapCount} 项缺口` : '无缺口'
  return `${weather} · ${gap}`
})

// 流程概览步骤：概览 → 天气 → 监控 → 安防 → 完整性
const overviewFlowSteps = computed(() => [
  { label: '概览', meta: '全局状态', icon: LayoutDashboard, tone: 'in' },
  {
    label: '天气',
    meta: props.weatherBound ? '已绑定' : '待绑定',
    icon: CloudSun,
    tone: 'sky',
  },
  {
    label: '监控',
    meta: props.cameraCount ? `${props.cameraCount} 路` : '待配置',
    icon: Video,
    tone: 'mid',
  },
  {
    label: '安防',
    meta: props.doorbellCount ? `${props.doorbellCount} 门铃` : '待配置',
    icon: Bell,
    tone: 'exec',
  },
  {
    label: '完整性',
    meta: props.gapCount ? `${props.gapCount} 缺口` : '完整',
    icon: ListChecks,
    tone: 'out',
  },
])
</script>
