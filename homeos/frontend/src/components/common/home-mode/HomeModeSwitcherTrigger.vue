/**
 * @file HomeModeSwitcherTrigger.vue
 * @module common/home-mode
 * @description 家居模式切换器的触发按钮组件。
 *   展示当前模式图标与标签，支持加载、操作中、只读等多种状态。
 *   点击后通过 toggle 事件通知父组件展开/收起下拉菜单。
 * @dependencies @lucide/vue（ChevronDown 下拉箭头，Loader2 加载旋转图标）
 */
<script setup>
/**
 * 导入依赖：
 * - ChevronDown：下拉箭头图标，提示用户可点击展开
 * - Loader2：操作进行中的旋转加载图标
 */
import { ChevronDown, Loader2 } from '@lucide/vue'

/**
 * 组件 props 定义
 * @property {Object|null} activeMode - 当前激活的模式对象，无激活模式时为 null（影响激活态样式）
 * @property {boolean} loading - 是否处于加载态（加载时禁用按钮）
 * @property {boolean} acting - 是否正在执行模式切换操作（展示旋转图标）
 * @property {boolean} readonly - 是否只读（影响只读态样式）
 * @property {string} label - 按钮展示的文案
 * @property {Object|Function} modeIcon - 当前模式图标组件或渲染函数
 */
defineProps({
  activeMode: { type: [Object, null], default: null },
  loading: { type: Boolean, required: true },
  acting: { type: Boolean, required: true },
  readonly: { type: Boolean, required: true },
  label: { type: String, required: true },
  modeIcon: { type: [Object, Function], required: true },
})

/**
 * 组件事件定义
 * @event toggle - 点击按钮时触发，通知父组件切换菜单展开/收起
 */
const emit = defineEmits(['toggle'])
</script>

<template>
  <!-- 触发按钮：根据激活态/只读态切换样式，加载时禁用，点击冒泡阻止后派发 toggle -->
  <button
    type="button"
    class="home-mode-switcher__btn"
    :class="{
      'home-mode-switcher__btn--active': !!activeMode,
      'home-mode-switcher__btn--readonly': readonly,
    }"
    :disabled="loading"
    @click.stop="emit('toggle')"
  >
    <component :is="modeIcon" class="home-mode-switcher__icon w-3.5 h-3.5 shrink-0" />
    <span class="home-mode-switcher__label">{{ label }}</span>
    <!-- 操作进行中展示旋转图标，否则展示下拉箭头 -->
    <Loader2 v-if="acting" class="w-3.5 h-3.5 animate-spin opacity-60" />
    <ChevronDown v-else class="w-3.5 h-3.5 opacity-50" />
  </button>
</template>