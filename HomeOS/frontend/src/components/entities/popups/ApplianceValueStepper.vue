/**
 * @file ApplianceValueStepper.vue
 * @module components/entities/popups
 * @brief 家电弹窗共用数值步进器
 *
 * 职责：
 * - 以大字号居中展示当前数值（温度/湿度等），两侧提供增/减按钮
 * - 增减交互仅向父组件发出 decrease/increase 事件，具体步进与服务调用由父组件决定
 *
 * 依赖：
 * - @lucide/vue（Minus/Plus 图标）
 *
 * 使用场景：HumidifierControlPopup 目标湿度调节、其他需数值 ± 调节的家电弹窗
 */
<template>
  <div class="flex items-center justify-between w-full px-1">
    <!-- 减小按钮：通过 aria-label 暴露无障碍描述 -->
    <button
      type="button"
      class="temp-adjust-btn"
      :aria-label="decreaseLabel"
      @click.stop="$emit('decrease')"
    >
      <Minus class="w-5 h-5" />
    </button>
    <!-- 中间大号数值与单位标签 -->
    <div class="flex flex-col items-center">
      <span
        class="text-[44px] font-bold text-white tabular-nums tracking-tighter drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]"
        >{{ value }}</span
      >
      <span class="text-xs font-bold leading-normal pb-px" :class="labelClass">{{ label }}</span>
    </div>
    <!-- 增大按钮：通过 aria-label 暴露无障碍描述 -->
    <button
      type="button"
      class="temp-adjust-btn"
      :aria-label="increaseLabel"
      @click.stop="$emit('increase')"
    >
      <Plus class="w-5 h-5" />
    </button>
  </div>
</template>

<script setup>
/**
 * 家电弹窗共用：大号数值 + 左右 ± 调节按钮
 *
 * 职责：
 * - 以大字号居中展示当前数值，两侧提供增/减按钮
 * - 增减交互仅向父组件发出事件，具体步进与服务调用由父组件决定
 *
 * 依赖：
 * - @lucide/vue: Minus / Plus 图标
 *
 * 使用场景：
 * - HumidifierControlPopup 的目标湿度调节
 * - 其他需要数值 ± 调节的家电弹窗
 */
import { Minus, Plus } from '@lucide/vue'

defineProps({
  // 当前展示的数值（温度/湿度等）
  value: { type: [Number, String], required: true },
  // 数值下方的单位/说明文案
  label: { type: String, required: true },
  // 标签附加类名，用于配色定制
  labelClass: { type: String, default: '' },
  // 减小按钮的无障碍标签
  decreaseLabel: { type: String, default: '减小' },
  // 增大按钮的无障碍标签
  increaseLabel: { type: String, default: '增大' },
})

// 增/减事件：父组件据此执行步进逻辑与服务调用
defineEmits(['decrease', 'increase'])
</script>