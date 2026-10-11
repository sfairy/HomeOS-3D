<!--
  房间引用范围徽章。按 key（env 环境）渲染不同配色的徽章标签，
  用于在房间列表中标识该房间被哪些消费方引用。
-->
<script setup lang="ts">
// 徽章 key 类型：env 环境
type RoomRefBadgeKey = 'env'

defineProps<{
  badges: Array<{ key: RoomRefBadgeKey; label: string; title?: string }>
}>()
</script>

<template>
  <span v-if="badges?.length" class="room-ref-badges" aria-label="引用范围">
    <span
      v-for="b in badges"
      :key="b.key"
      class="room-ref-badge"
      :class="`room-ref-badge--${b.key}`"
      :title="b.title || b.label"
    >
      {{ b.label }}
    </span>
  </span>
</template>

<style scoped>
.room-ref-badges {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-left: 6px;
  vertical-align: middle;
}

.room-ref-badge {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  padding: 0 6px;
  border-radius: 6px;
  font-size: var(--set-fs-micro, 12px);
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
  border: 1px solid transparent;
}

.room-ref-badge--env {
  color: #6ee7b7;
  background: rgba(52, 211, 153, 0.12);
  border-color: rgba(52, 211, 153, 0.28);
}
</style>
