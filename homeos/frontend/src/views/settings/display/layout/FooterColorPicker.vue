<!--
组件：FooterColorPicker.vue
所属模块：frontend / src / views / settings / display / layout
职责：底部信息栏项配色选择器。弹出面板展示预设色板，选中后向上抛出 update:modelValue。
关键依赖：
  - DASHBOARD_FOOTER_COLORS / DASHBOARD_FOOTER_COLOR_ACCENT：色板与强调色常量
  - useClickOutside：点击外部关闭
  - useDropdownPosition：下拉位置计算（含 Teleport）
数据来源：父级透传的 modelValue（v-model）
-->
<template>
  <div ref="rootRef" class="ef-color-picker">
    <button
      type="button"
      class="ef-color-picker__trigger"
      :title="'选择配色'"
      :style="{ '--swatch': currentAccent, '--swatch-glow': currentGlow }"
      @click.stop="open = !open"
    >
      <span class="ef-color-picker__swatch" />
      <span class="ef-color-picker__label">{{ colorLabel(modelValue) }}</span>
      <ChevronDown :class="['ef-color-picker__chev', open && 'ef-color-picker__chev--open']" />
    </button>
    <Teleport :to="teleportTarget" :disabled="teleportDisabled">
      <Transition name="ef-picker-pop">
        <div
          v-if="open"
          ref="panelRef"
          :class="['ef-color-picker__panel', placement === 'top' && 'ef-color-picker__panel--top']"
          :style="dropdownStyle"
          @click.stop
        >
          <div class="ef-color-picker__grid">
            <button
              v-for="c in colors"
              :key="c"
              type="button"
              :class="['ef-color-picker__chip', modelValue === c && 'ef-color-picker__chip--active']"
              :title="colorLabel(c)"
              :style="{ '--swatch': accent(c), '--swatch-glow': glow(c) }"
              @click="pick(c)"
            >
              <span class="ef-color-picker__chip-fill" />
              <span v-if="modelValue === c" class="ef-color-picker__check">✓</span>
              <span class="ef-color-picker__chip-name">{{ colorLabel(c) }}</span>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ChevronDown } from '@lucide/vue'
import {
  DASHBOARD_FOOTER_COLORS,
  DASHBOARD_FOOTER_COLOR_ACCENT,
} from '@/constants/dashboard-footer'
import { useClickOutside } from '@/composables/ui/useClickOutside'
import { useDropdownPosition } from '@/composables/ui/useDropdownPosition'

// 颜色 key → 中文标签映射
const COLOR_LABELS = {
  blue: '蓝色',
  cyan: '青色',
  gold: '金色',
  green: '绿色',
  orange: '橙色',
  purple: '紫色',
  rose: '玫红',
  teal: '蓝绿',
  yellow: '黄色',
}

const props = defineProps({
  modelValue: { type: String, default: 'yellow' },
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const rootRef = ref(null)
const panelRef = ref(null)
const colors = DASHBOARD_FOOTER_COLORS

const { dropdownStyle, teleportTarget, teleportDisabled, placement } = useDropdownPosition(
  rootRef,
  open,
  {
    minWidth: 228,
    maxHeight: 320,
    chromeHeight: 0,
    minListHeight: 120,
    minRowHeight: 48,
    dropdownRef: panelRef,
  },
)

// 取颜色对应的强调色（缺失回退为 yellow）
function accent(key) {
  return DASHBOARD_FOOTER_COLOR_ACCENT[key] || DASHBOARD_FOOTER_COLOR_ACCENT.yellow
}

// 取颜色对应的辉光色（强调色 + 55 透明度）
function glow(key) {
  return `${accent(key)}55`
}

const currentAccent = computed(() => accent(props.modelValue))
const currentGlow = computed(() => glow(props.modelValue))

// 取颜色中文标签（缺失回退为 key 本身）
function colorLabel(key) {
  return COLOR_LABELS[key] ?? key
}

// 选中颜色后抛出并关闭面板
function pick(c) {
  emit('update:modelValue', c)
  open.value = false
}

useClickOutside(() => [rootRef.value, panelRef.value].filter(Boolean), () => {
  open.value = false
})
</script>

<style scoped src="./styles/FooterColorPicker.css"></style>
