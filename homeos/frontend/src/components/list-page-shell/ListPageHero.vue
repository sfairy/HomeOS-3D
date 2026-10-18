/** - 默认单行布局（标题·描述），不再用两行占高； */
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
import { computed } from 'vue'

const props = defineProps({
  /** 主标题 */
  title: { type: String, required: true },
  /** 描述文案（单行省略） */
  hint: { type: String, default: '' },
  /**
   * 语义色调：accent | info | success | warning | danger | neutral。
   * 页面 hero 默认用暖铜；状态色只用于危险/警示语义，不再按模块分色。
   */
  tone: { type: String, default: 'accent' },
})

/** tone → canonical 令牌（不再出现裸 hex） */
const TONE_ACCENTS = {
  accent: 'var(--hos-color-accent)',
  info: 'var(--hos-color-info)',
  success: 'var(--hos-color-success)',
  warning: 'var(--hos-color-warning)',
  danger: 'var(--hos-color-danger)',
  neutral: 'var(--hos-fg-2)',
}

/** 当前强调色：语义 tone 未命中时回退暖铜 */
const accentColor = computed(() => TONE_ACCENTS[props.tone] || TONE_ACCENTS.accent)
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
