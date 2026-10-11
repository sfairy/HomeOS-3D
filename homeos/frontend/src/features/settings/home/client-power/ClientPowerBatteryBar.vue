<!--
  客户端电量条。展示当前电量百分比、充电进度条与低/高阈值标记。
-->
<script setup>
import {
  batteryBarClass,
  batteryBarStyle,
  batteryLabelStyle,
} from '@/shared/client/utils/power-battery-display.util'

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
