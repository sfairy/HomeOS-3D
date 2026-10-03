<!--
  竖屏 HomeKit 风格：自适应温控（包装 ClimateCard）
  组件：AdaptiveThermostatWidget.vue
  所属模块：frontend / src / views / mobile / components
  职责：移动端首页「智能温控」卡片——外壳样式 + 复用桌面 ClimateCard（embedded 模式）。
  数据来源：温控实体与控制能力由 ClimateCard 内部从 store 获取，本组件仅做样式包装。
  说明：纯包装组件，无 props/emits/外部交互。
-->
<script setup lang="ts">
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/AdaptiveThermostatWidget 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import ClimateCard from '@/components/widgets/climate/Card.vue'
</script>

<template>
  <div class="m-hk-thermo">
    <p class="m-page__card-label">智能温控</p>
    <ClimateCard embedded />
  </div>
</template>

<style scoped>
.m-hk-thermo {
  padding: 12px;
  border-radius: var(--hos-radius-panel, 20px);
  border: var(--hos-hairline, 1px) solid rgba(56, 189, 248, 0.22);
  background:
    radial-gradient(ellipse 70% 60% at 100% 0%, rgba(56, 189, 248, 0.14), transparent 55%),
    rgba(0, 0, 0, 0.22);
}

.m-hk-thermo :deep(.climate-card) {
  background: transparent;
  border: 0;
  box-shadow: none;
  padding: 0;
}
</style>
