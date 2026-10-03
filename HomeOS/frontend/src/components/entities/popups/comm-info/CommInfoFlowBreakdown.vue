/**
 * @file CommInfoFlowBreakdown.vue
 * @module components/entities/popups/comm-info
 * @brief 流量明细区块
 *
 * 职责：
 * - 展示通用/专用/其他流量分项的剩余、已用、总量与超量
 * - 纯展示组件，rows 通过 props 透传
 *
 * 依赖：无外部依赖。
 */
<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 CommInfoFlowBreakdown 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
defineProps({
  rows: { type: Array, default: () => [] },
})
</script>

<template>
  <section v-if="rows.length" class="comm-flow-break">
    <h3 class="comm-flow-break__title">{{ '流量明细' }}</h3>
    <div class="comm-flow-break__list">
      <div v-for="row in rows" :key="row.id" class="comm-flow-break__row">
        <span class="comm-flow-break__label">{{ row.label }}</span>
        <span class="comm-flow-break__vals">
          <template v-if="row.remaining !== '--'">
            <em>{{ '剩余' }}</em>
            <strong>{{ row.remaining }}</strong>
            <small>GB</small>
          </template>
          <template v-if="row.used !== '--'">
            <em>{{ '已用' }}</em>
            <strong>{{ row.used }}</strong>
            <small v-if="row.total !== '--'">/ {{ row.total }} GB</small>
            <small v-else>GB</small>
          </template>
          <template v-else-if="row.total !== '--'">
            <em>{{ '总量' }}</em>
            <strong>{{ row.total }}</strong>
            <small>GB</small>
          </template>
          <template v-if="row.over && row.over !== '--'">
            <em class="comm-flow-break__warn">{{ '超量' }}</em>
            <strong class="comm-flow-break__warn">{{ row.over }}</strong>
            <small class="comm-flow-break__warn">GB</small>
          </template>
        </span>
      </div>
    </div>
  </section>
</template>
