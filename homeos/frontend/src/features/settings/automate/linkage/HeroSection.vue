<!--
 * 组件：HeroSection.vue
 *
 * 所属模块：frontend / src / features / settings / automate / linkage
 * 职责：全屋联动概览 Hero。以统计卡片形式展示配置人员、当前在家人数等关键指标。
 * 关键依赖：SettingsFlowStat
 * 数据来源：父级透传的各项计数值
-->
<script setup>
/**
 * 所属模块：frontend/features/settings/automate/linkage
 * 职责：渲染全屋联动概览统计，整合子组件与业务数据。
 * 关键依赖：SettingsFlowStat。
 * 约定：纯展示组件，数据全部由父级透传。
 */
import SettingsFlowStat from '@/features/settings/shared/layout/SettingsFlowStat.vue'

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
