<!--
组件：ClientPowerBatteryBar.vue
所属模块：frontend / src / views / settings / home / client-power
职责：客户端电量条。展示当前电量百分比、充电进度条与低/高阈值标记。
关键依赖：
  - batteryBarClass / batteryBarStyle / batteryLabelStyle：电量条样式派生
数据来源：父级透传的 percent / charging / lowPercent / highPercent
-->
<script setup>
/**
 * 职责：渲染 views/ClientPowerBatteryBar 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import {
  batteryBarClass,
  batteryBarStyle,
  batteryLabelStyle,
} from '@/utils/client/power-battery-display.util'

// 入参：电量百分比、是否充电中、低/高阈值
defineProps({
  percent: { type: Number, default: null },
  charging: { type: Boolean, default: false },
  lowPercent: { type: Number, default: 20 },
  highPercent: { type: Number, default: 80 },
})
</script>

<template>
  <div :class="['charge-battery', charging && 'charge-battery--charging']">
    <div class="charge-battery__track">
      <div
        class="charge-battery__fill"
        :class="batteryBarClass(percent, lowPercent, highPercent)"
        :style="{
          width: percent + '%',
          ...batteryBarStyle(percent, charging),
        }"
      />
      <span
        class="charge-battery__marker charge-battery__marker--low"
        :style="{ left: lowPercent + '%' }"
      />
      <span
        class="charge-battery__marker charge-battery__marker--high"
        :style="{ left: highPercent + '%' }"
      />
    </div>
    <div class="charge-battery__labels">
      <span>{{ '低 ' }}{{ lowPercent }}%</span>
      <span class="charge-battery__label-current" :style="batteryLabelStyle(percent, charging)"
        >{{ percent }}%</span
      >
      <span>{{ '高 ' }}{{ highPercent }}%</span>
    </div>
  </div>
</template>
<style src="./styles/client-power.css"></style>
