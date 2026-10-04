/** * 通信账户套餐配额卡片 * 环形进度展示剩余流量/用量及超额信息 */
<script setup>
/**
 * 职责：实现 CommInfoQuotaPack 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
defineProps({
  pack: { type: Object, required: true },
})
</script>

<template>
  <article
    :class="['comm-pack', `comm-pack--${pack.id}`]"
    :style="{
      '--pack-accent': pack.accent,
      '--pack-accent-soft': pack.accentSoft,
    }"
  >
    <div
      class="comm-pack__ring"
      :style="{
        '--pack-pct': pack.pct + '%',
        '--pack-accent': pack.accent,
        '--pack-accent-soft': pack.accentSoft,
      }"
    >
      <div class="comm-pack__ring-track" />
      <div class="comm-pack__ring-fill" />
      <div class="comm-pack__ring-core">
        <span :class="['comm-pack__remain-val', `comm-pack__remain-val--${pack.sizeTier}`]">{{
          pack.remaining
        }}</span>
        <span class="comm-pack__remain-u">{{ pack.unitShort }}</span>
      </div>
    </div>

    <div class="comm-pack__info">
      <component :is="pack.icon" class="comm-pack__info-icon" />
      <span class="comm-pack__title">{{ pack.shortTitle }}</span>
      <span v-if="pack.rate !== '--'" class="comm-pack__rate">{{ pack.rate }}%</span>
    </div>

    <div class="comm-pack__foot">
      <span class="comm-pack__foot-label">{{ pack.usedLabel }}</span>
      <span class="comm-pack__foot-val">{{ pack.used }}</span>
      <template v-if="pack.total !== '--'">
        <span class="comm-pack__foot-sep">/</span>
        <span class="comm-pack__foot-val">{{ pack.total }}</span>
      </template>
    </div>

    <div v-if="pack.over !== '--'" class="comm-pack__over">
      {{ pack.overLabel }} {{ pack.over }}{{ pack.unit }}
    </div>
    <div v-if="pack.note" class="comm-pack__note">{{ pack.note }}</div>
  </article>
</template>
