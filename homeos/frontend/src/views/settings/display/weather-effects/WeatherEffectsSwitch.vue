/** * 天气特效开关组件：自定义样式的布尔切换按钮（支持 sm/md 尺寸）。 */
<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="ariaLabel || (modelValue ? '关闭' : '开启')"
    :class="[
      'weather-fx-switch',
      size === 'sm' && 'weather-fx-switch--sm',
      modelValue && 'weather-fx-switch--on',
    ]"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span :class="['weather-fx-switch__knob', modelValue && 'weather-fx-switch__knob--on']" />
  </button>
</template>

<script setup>
/**
 * 职责：渲染 views/WeatherEffectsSwitch 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
defineProps({
  modelValue: { type: Boolean, default: false },
  size: { type: String, default: 'md' },
  ariaLabel: { type: String, default: '' },
})

defineEmits(['update:modelValue'])
</script>

<style scoped src="./styles/weather-effects.css"></style>
