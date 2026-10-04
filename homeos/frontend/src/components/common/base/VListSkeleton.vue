<template>
  <div
    class="v-list-skeleton"
    role="status"
    :aria-label="ariaLabel || '加载中…'"
    :style="{ '--v-list-skeleton-rows': rows }"
  >
    <div v-for="n in rows" :key="n" class="v-list-skeleton__row">
      <VSkeleton variant="title" width="28%" :pulse="pulse" />
      <VSkeleton variant="text" width="86%" :pulse="pulse" />
      <VSkeleton variant="text" width="54%" :pulse="pulse" />
    </div>
  </div>
</template>

<script setup>
/**
 * @file VListSkeleton.vue
 * @module components/common/base
 * @description 列表型骨架屏：按行重复「标题 + 两行文本」占位，贴合通知 / 告警 / 设备等列表项
 *   的真实排版。用于替代面板型 VPanelSkeleton 在列表场景下「只有一个大色块」的失真表现。
 *  依赖：VSkeleton 子组件。
 */
import VSkeleton from './VSkeleton.vue'

defineProps({
  /** 占位行数（列表首屏常见 4–6 行） */
  rows: { type: Number, default: 5 },
  /** 是否启用脉冲动画 */
  pulse: { type: Boolean, default: true },
  /** 无障碍标签，默认"加载中…" */
  ariaLabel: { type: String, default: '' },
})
</script>

<style scoped>
.v-list-skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.v-list-skeleton__row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: var(--hos-radius-card, 12px);
  border: var(--hos-hairline, 1px) solid var(--premium-border-subtle, rgba(255, 255, 255, 0.08));
  background: var(--premium-glass-bg, rgba(255, 255, 255, 0.04));
}

/* 触控/窄屏下减少行数带来的高度浪费 */
@media (max-width: 639px) {
  .v-list-skeleton__row:nth-child(n + 4) {
    display: none;
  }
}
</style>
