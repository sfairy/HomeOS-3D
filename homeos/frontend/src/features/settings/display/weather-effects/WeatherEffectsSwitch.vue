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
defineProps({
  modelValue: { type: Boolean, default: false },
  size: { type: String, default: 'md' },
  ariaLabel: { type: String, default: '' },
})

defineEmits(['update:modelValue'])
</script>

<style scoped src="./styles/weather-effects.css"></style>
