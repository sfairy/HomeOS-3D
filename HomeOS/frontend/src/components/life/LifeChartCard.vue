<!--
组件：LifeChartCard.vue
所属模块：frontend / components / life
职责：生活域图表卡片头 + 内容（纯展示）；不产生包裹元素（header 与默认插槽平铺），
  右侧动作三选一：hint 提示 / RouterLink（link-to）/ button（link-click），
  特殊形态（徽标 chip 等）通过 action 插槽覆盖，样式全部复用 life-view.css
-->
<template>
  <header :class="`${headPrefix}__chart-head`">
    <span :class="`${headPrefix}__chart-title`">{{ title }}</span>
    <slot name="action">
      <span v-if="hint" :class="`${headPrefix}__chart-hint`">{{ hint }}</span>
      <RouterLink v-else-if="linkTo" :class="linkClass" :to="linkTo">{{ linkText }}</RouterLink>
      <button
        v-else-if="linkText"
        type="button"
        :class="linkClass"
        @click="emit('link-click')"
        >{{ linkText }}</button
      >
    </slot>
  </header>
  <slot />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'

const props = withDefaults(
  defineProps<{
    /** 卡片头标题 */
    title: string
    /** class 前缀变体：module → life-module__chart-*；overview → life-overview__chart-* */
    variant?: 'module' | 'overview'
    /** 右侧提示文案（渲染为 chart-hint，优先于链接） */
    hint?: string
    /** 链接文案（button 或 RouterLink 形态） */
    linkText?: string
    /** 路由目标：传入则渲染 RouterLink，否则渲染 button 并抛出 link-click */
    linkTo?: RouteLocationRaw
    /** 动作元素 class（各模块类名不同，如 life-care__link / life-module__chart-link） */
    linkClass?: string
  }>(),
  { variant: 'module' },
)

const emit = defineEmits<{ 'link-click': [] }>()

const headPrefix = computed(() => (props.variant === 'overview' ? 'life-overview' : 'life-module'))
</script>
