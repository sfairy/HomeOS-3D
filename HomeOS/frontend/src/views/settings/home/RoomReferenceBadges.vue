<!--
组件：RoomReferenceBadges.vue
所属模块：frontend / src / views / settings / home
职责：房间引用范围徽章。按 key（env 环境 / mobile 竖屏 / agent 管家）渲染不同配色的徽章标签，
      用于在房间列表中标识该房间被哪些消费方引用。
关键依赖：无（纯展示组件）
数据来源：父级透传的 badges 数组（key/label/title）
-->
<script setup lang="ts">
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/RoomReferenceBadges 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
// 徽章 key 类型：env 环境 / mobile 竖屏 / agent 管家
type RoomRefBadgeKey = 'env' | 'mobile' | 'agent'

// 入参：徽章列表，每项含 key、显示文案与可选 title
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

.room-ref-badge--mobile {
  color: #c4b5fd;
  background: rgba(167, 139, 250, 0.12);
  border-color: rgba(167, 139, 250, 0.28);
}

.room-ref-badge--agent {
  color: #7dd3fc;
  background: rgba(56, 189, 248, 0.12);
  border-color: rgba(56, 189, 248, 0.28);
}
</style>
