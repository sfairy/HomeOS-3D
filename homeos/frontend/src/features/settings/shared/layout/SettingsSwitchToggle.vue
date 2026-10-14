<!--
  通用布尔开关（设置页复用）。
  原为天气特效专用的 WeatherEffectsSwitch，天气特效下线后提升为共享组件，
  供锁屏屏保等区块沿用同一视觉。
-->
<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="ariaLabel || (modelValue ? '关闭' : '开启')"
    :class="[
      'settings-switch-toggle',
      size === 'sm' && 'settings-switch-toggle--sm',
      modelValue && 'settings-switch-toggle--on',
    ]"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span
      :class="['settings-switch-toggle__knob', modelValue && 'settings-switch-toggle__knob--on']"
    />
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

<style scoped>
.settings-switch-toggle {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  width: 44px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: var(--hos-radius-pill);
  background: var(--hos-surface-3);
  cursor: pointer;
  transition:
    background 0.22s ease,
    box-shadow 0.22s ease;
}

.settings-switch-toggle--sm {
  width: 40px;
  height: 24px;
}

.settings-switch-toggle--on {
  background: rgba(var(--premium-accent-cyan-rgb), 0.42);
  box-shadow: none;
}

.settings-switch-toggle__knob {
  display: block;
  width: 20px;
  height: 20px;
  margin-left: 3px;
  border-radius: 50%;
  background: var(--hos-text-strong);
  box-shadow: var(--hos-shadow-card);
  transform: translateX(0);
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.settings-switch-toggle--sm .settings-switch-toggle__knob {
  width: 18px;
  height: 18px;
}

.settings-switch-toggle__knob--on {
  transform: translateX(18px);
}

.settings-switch-toggle--sm .settings-switch-toggle__knob--on {
  transform: translateX(16px);
}
</style>
