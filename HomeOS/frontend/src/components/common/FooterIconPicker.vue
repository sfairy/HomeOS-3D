<!--
  组件文件：FooterIconPicker.vue
  所属模块：frontend/src/components/common
  组件职责：底栏 / 表单用 emoji 图标选择器。触发器显示当前图标 + 文字标签「图标」（紧凑模式隐藏标签）+
    ChevronDown；点击展开后 Teleport 传送图标网格面板（minWidth 248px，maxHeight 280px），
    网格内预置图标列表 DASHBOARD_FOOTER_ICONS 可点击选择，末尾自定义 emoji 输入（最多 8 字符）。
  主要 props / emits：
    - props.modelValue：当前 emoji（v-model 绑定），默认 '⚡'；
      props.compact：紧凑模式（隐藏「图标」文字）；props.icons：自定义图标列表；
      props.fallbackIcon：modelValue 为空时的回退图标，默认 '⚡'。
    - emit update:modelValue：选择网格项或自定义输入时回传 emoji 字符串。
  依赖关系：vue computed/ref；@lucide/vue ChevronDown；constants/dashboard-footer DASHBOARD_FOOTER_ICONS；
    composables：useClickOutside（外部点击关闭面板）、useDropdownPosition（智能定位面板防止溢出视口，
    根据触发器位置计算 dropdownStyle 与 teleportTarget）。
-->
<template>
  <div ref="rootRef" class="ef-icon-picker" :class="compact && 'ef-icon-picker--compact'">
    <button
      type="button"
      class="ef-icon-picker__trigger"
      :title="'选择图标'"
      @click.stop="open = !open"
    >
      <span class="ef-icon-picker__value">{{ modelValue || fallbackIcon }}</span>
      <span v-if="!compact" class="ef-icon-picker__label">{{ '图标' }}</span>
      <ChevronDown :class="['ef-icon-picker__chev', open && 'ef-icon-picker__chev--open']" />
    </button>
    <Teleport :to="teleportTarget" :disabled="teleportDisabled">
      <Transition name="ef-picker-pop">
        <div
          v-if="open"
          ref="panelRef"
          :class="['ef-icon-picker__panel', placement === 'top' && 'ef-icon-picker__panel--top']"
          :style="dropdownStyle"
          @click.stop
        >
          <div class="ef-icon-picker__grid">
            <button
              v-for="ic in iconList"
              :key="ic"
              type="button"
              :class="['ef-icon-picker__opt', modelValue === ic && 'ef-icon-picker__opt--active']"
              @click="pick(ic)"
            >
              {{ ic }}
            </button>
          </div>
          <div class="ef-icon-picker__custom">
            <input
              :value="modelValue"
              class="ef-icon-picker__input"
              maxlength="8"
              :placeholder="'自定义 emoji'"
              @input="onCustomInput"
            />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
/**
 * @file FooterIconPicker.vue
 * @module common/FooterIconPicker
 * @description 底栏图标选择器（v-model 双向绑定 emoji）
 *  职责：
 *    - 触发器展示当前 emoji 与下拉箭头；
 *    - 点击展开图标网格（默认使用底栏图标集 DASHBOARD_FOOTER_ICONS）；
 *    - 支持自定义 emoji 输入（最多 8 字符）；
 *    - 通过 useDropdownPosition 智能定位面板，useClickOutside 实现外部点击关闭。
 *  依赖：vue computed/ref，@lucide/vue ChevronDown，constants/dashboard-footer，
 *    composables/ui 的 useClickOutside 与 useDropdownPosition。
 */
import { computed, ref } from 'vue'
import { ChevronDown } from '@lucide/vue'
import { DASHBOARD_FOOTER_ICONS } from '@/constants/dashboard-footer'
import { useClickOutside } from '@/composables/ui/useClickOutside'
import { useDropdownPosition } from '@/composables/ui/useDropdownPosition'

const props = defineProps({
  /** 当前选中的 emoji，v-model 绑定值 */
  modelValue: { type: String, default: '⚡' },
  /** 隐藏触发器上的「图标」文字，适合表单 label 已单独展示的场景 */
  compact: { type: Boolean, default: false },
  /** 自定义可选图标；默认用底栏图标集 */
  icons: { type: Array, default: null },
  /** modelValue 为空时显示的回退 emoji */
  fallbackIcon: { type: String, default: '⚡' },
})

const emit = defineEmits(['update:modelValue'])

/** 面板是否展开 */
const open = ref(false)
/** 触发器根节点引用，用于定位面板与外部点击判定 */
const rootRef = ref(null)
/** 面板节点引用，用于外部点击判定 */
const panelRef = ref(null)
/** 可选图标列表：优先使用自定义 icons，否则回退到底栏图标集 */
const iconList = computed(() =>
  Array.isArray(props.icons) && props.icons.length ? props.icons : DASHBOARD_FOOTER_ICONS,
)

// 智能定位：根据触发器位置计算面板样式与传送目标，避免溢出视口
const { dropdownStyle, teleportTarget, teleportDisabled, placement } = useDropdownPosition(
  rootRef,
  open,
  {
    minWidth: 248,
    maxHeight: 280,
    chromeHeight: 48,
    minListHeight: 96,
    minRowHeight: 36,
    dropdownRef: panelRef,
  },
)

/**
 * 选中某个图标：向父级 emit 新值并关闭面板
 * @param {string} ic 选中的 emoji
 */
function pick(ic) {
  emit('update:modelValue', ic)
  open.value = false
}

/**
 * 自定义输入回调：将输入值直接 emit 给父级
 * @param {Event} e input 事件对象
 */
function onCustomInput(e) {
  emit('update:modelValue', e.target.value)
}

// 点击触发器与面板之外的区域时关闭面板
useClickOutside(() => [rootRef.value, panelRef.value].filter(Boolean), () => {
  open.value = false
})
</script>

<style scoped src="./styles/FooterIconPicker.css"></style>
