/**
 * @file CommInfoQuotaSection.vue
 * @module components/entities/popups/comm-info
 * @brief 套餐区块
 *
 * 职责：
 * - 渲染套餐标题与 CommInfoQuotaPack 卡片列表
 * - 纯展示组件，quotaCards 通过 props 透传
 *
 * 依赖：./CommInfoQuotaPack
 */
<script setup>
/**
 * 职责：实现 CommInfoQuotaSection 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import CommInfoQuotaPack from './CommInfoQuotaPack.vue'

defineProps({
  quotaCards: { type: Array, default: () => [] },
})
</script>

<template>
  <section class="comm-quota">
    <h3 class="comm-quota__title">{{ '套餐' }}</h3>
    <div class="comm-packages">
      <CommInfoQuotaPack v-for="pack in quotaCards" :key="pack.id" :pack="pack" />
    </div>
  </section>
</template>
