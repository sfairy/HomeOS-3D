/**
 * 组件：HeroSection.vue
 *
 * 所属模块：frontend / src / views / settings / automate / linkage
 * 职责：全屋联动概览 Hero。以统计卡片形式展示配置人员、当前在家人数等关键指标。
 * 关键依赖：SettingsFlowStat
 * 数据来源：父级透传的各项计数值
 */
<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/HeroSection 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'

// 入参：当前 Tab、人员模式/状态文案、联动启用数、预设数、人员统计、在家数、参数行数
defineProps({
  activeTab: { type: String, default: 'presence' },
  presenceModeLabel: { type: String, default: '' },
  presenceStatusLabel: { type: String, default: '' },
  linkageEnabledCount: { type: Number, default: 0 },
  linkagePresetsLength: { type: Number, default: 0 },
  personStatCount: { type: Number, default: 0 },
  atHomeCount: { type: Number, default: 0 },
  paramRowsLength: { type: Number, default: 0 },
})
</script>

<template>
  <div class="linkage-overview linkage-overview--stats-only">
    <div class="hub-stat-row settings-flow-overview__stats linkage-overview__stats">
      <SettingsFlowStat
        :label="'配置人员'"
        :value="personStatCount"
        tone="sky"
        val-tone="sky"
      />
      <SettingsFlowStat
        :label="'当前在家'"
        :value="atHomeCount"
        :tone="atHomeCount > 0 ? 'emerald' : 'secondary'"
        :val-tone="atHomeCount > 0 ? 'emerald' : 'secondary'"
      />
    </div>
  </div>
</template>

<style src="./styles/linkage.css"></style>
