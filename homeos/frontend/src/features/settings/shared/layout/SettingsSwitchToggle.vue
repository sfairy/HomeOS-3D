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
  width: var(--hos-switch-w-md);
  height: var(--hos-switch-h-md);
  padding: 0;
  border: none;
  border-radius: var(--hos-r-pill);
  background: var(--hos-bg-tint-3);
  cursor: pointer;
  transition:
    background 0.22s ease,
    box-shadow 0.22s ease;
}

.settings-switch-toggle--sm {
  width: var(--hos-switch-w-sm);
  height: var(--hos-switch-h-sm);
}

.settings-switch-toggle--on {
  background: rgba(var(--hos-color-accent-strong-rgb), 0.42);
  box-shadow: none;
}

.settings-switch-toggle__knob {
  display: block;
  width: var(--hos-switch-knob-md);
  height: var(--hos-switch-knob-md);
  margin-left: var(--hos-switch-inset);
  border-radius: 50%;
  background: var(--hos-fg-1);
  box-shadow: var(--hos-shadow-2);
  transform: translateX(0);
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.settings-switch-toggle--sm .settings-switch-toggle__knob {
  width: var(--hos-switch-knob-sm);
  height: var(--hos-switch-knob-sm);
}

/* 行程由 --hos-switch-travel-* 统一给出（md: 44−20−6 = 18px），改档位自动跟随，不会一侧贴边。 */
.settings-switch-toggle__knob--on {
  transform: translateX(var(--hos-switch-travel-md));
}

.settings-switch-toggle--sm .settings-switch-toggle__knob--on {
  transform: translateX(var(--hos-switch-travel-sm));
}
</style>
