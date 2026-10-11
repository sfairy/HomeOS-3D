/** 由多个 VSkeleton 组合而成，提供与最终布局一致的加载态视觉。 */
<template>
  <div class="v-panel-skeleton" role="status" :aria-label="ariaLabel || '加载中…'">
    <!-- 标题占位 -->
    <VSkeleton variant="title" width="42%" />
    <!-- 文本行占位 -->
    <VSkeleton variant="text" />
    <VSkeleton variant="text" width="72%" />
    <!-- 主体卡片占位 -->
    <VSkeleton variant="card" :height="bodyHeight" />
  </div>
</template>

<script setup>
import VSkeleton from './VSkeleton.vue'
defineProps({
  /** 主体卡片高度（数字按像素，字符串原样使用） */
  bodyHeight: { type: [String, Number], default: 72 },
  /** 无障碍标签，默认"加载中…" */
  ariaLabel: { type: String, default: '' },
})
</script>

<style scoped>
.v-panel-skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  padding: 4px 0;
}
</style>