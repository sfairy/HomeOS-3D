/**
 * @file ListPageHero.vue
 * @module common/list-page
 * @description 列表页顶部 Hero
 *  职责：
 *    - 默认单行布局（标题·描述），不再用两行占高；
 *    - 通过 tone 切换强调色（应用于 accent 条与 glow 装饰）；
 *    - 提供 icon / aside / stats / toolbar 四个具名插槽。
 *  依赖：vue computed。
 */
<template>
  <header
    class="premium-head premium-head--card premium-head--inline hos-panel hos-panel--hero hos-panel--glass list-page__hero"
    :style="{ '--head-accent': accentColor }"
  >
    <div class="premium-head__accent" aria-hidden="true" />
    <div class="premium-head__glow" aria-hidden="true" />
    <div class="list-page__hero-body">
      <div class="list-page__head-row">
        <div class="premium-head__main">
          <div class="premium-head__orb">
            <slot name="icon" />
          </div>
          <div class="premium-head__text premium-head__text--inline">
            <h1 class="premium-head__title">{{ title }}</h1>
            <p v-if="hint" class="premium-head__desc premium-head__desc--inline" :title="hint">
              {{ hint }}
            </p>
          </div>
        </div>
        <div v-if="$slots.aside" class="premium-head__actions list-page__hero-aside">
          <slot name="aside" />
        </div>
      </div>
      <div v-if="$slots.stats" class="list-page__stats">
        <slot name="stats" />
      </div>
      <div v-if="$slots.toolbar" class="list-page__toolbar-block">
        <slot name="toolbar" />
      </div>
    </div>
  </header>
</template>

<script setup>
/**
 * 职责：实现 ListPageHero 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed } from 'vue'

const props = defineProps({
  /** 主标题 */
  title: { type: String, required: true },
  /** 描述文案（单行省略） */
  hint: { type: String, default: '' },
  /** 色调：sky | cyan | orange | pink | amber | red | violet | slate | emerald */
  tone: { type: String, default: 'sky' },
})

/** tone → 强调色映射表 */
const TONE_ACCENTS = {
  sky: '#38bdf8',
  cyan: '#5fd4ff',
  orange: '#fb923c',
  pink: '#f472b6',
  amber: '#fbbf24',
  red: '#f87171',
  violet: '#a78bfa',
  slate: '#94a3b8',
  emerald: '#34d399',
}

/** 当前强调色：按 tone 取值，未匹配回退 sky */
const accentColor = computed(() => TONE_ACCENTS[props.tone] || TONE_ACCENTS.sky)
</script>

<style scoped>
/* 单行 Hero：标题与 hint 超出省略，避免两行占高 */
.premium-head__title,
.premium-head__desc--inline {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
