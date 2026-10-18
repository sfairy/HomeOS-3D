/** 可按 tone 切换配色主题（sky/violet/emerald/amber/rose/indigo/neutral）。 */
<template>
  <div
    :class="['v-empty', compact && 'v-empty--compact', resolvedTone && `v-empty--${resolvedTone}`]"
    role="group"
  >
    <!-- 图标区：优先渲染 Lucide 图标组件（iconComponent），否则渲染 emoji/字符（icon） -->
    <div v-if="iconComponent || icon" class="v-empty__icon" aria-hidden="true">
      <component :is="iconComponent" v-if="iconComponent" class="v-empty__icon-svg" />
      <template v-else>{{ icon }}</template>
    </div>
    <!-- 标题与描述：放入 aria-live 区域，屏幕阅读器可感知内容变化；
         容器自身为 group，避免将内部的交互按钮暴露为 status 朗读 -->
    <div v-if="title || description" aria-live="polite">
      <p v-if="title" class="v-empty__title">{{ title }}</p>
      <p v-if="description" class="v-empty__desc">{{ description }}</p>
    </div>
    <!-- 操作区插槽：放置按钮等交互元素 -->
    <div v-if="$slots.action" class="v-empty__action">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** 图标内容（emoji 或字符），为空则不渲染图标区 */
  icon: { type: String, default: '' },
  /** 图标组件（如 Lucide 图标）；与 icon 同时传入时优先使用本项 */
  iconComponent: { type: [Object, Function], default: null },
  /** 标题文本 */
  title: { type: String, default: '' },
  /** 描述文本 */
  description: { type: String, default: '' },
  /** 是否使用紧凑布局（减小间距） */
  compact: { type: Boolean, default: false },
  /** 色调：accent | info | success | warning | danger | neutral（旧 tone 名继续映射到语义色） */
  tone: { type: String, default: 'accent' },
})

// 解析色调：空值或 'default' 统一回退为品牌暖铜
const resolvedTone = computed(() => {
  const t = props.tone?.trim()
  if (!t || t === 'default') return 'accent'
  return t
})
</script>

<style scoped src="./styles/VEmptyState.css"></style>