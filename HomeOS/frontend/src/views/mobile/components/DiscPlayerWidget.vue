<!--
  竖屏 HomeKit 风格：圆盘媒体播放器（包装 MediaMini）
  组件：DiscPlayerWidget.vue
  所属模块：frontend / src / views / mobile / components
  职责：移动端首页「碟机」卡片——左侧旋转光盘视觉 + 右侧复用 MediaMini 控制。
  数据来源：媒体实体状态来自 useEntitiesStore；playerEntities 由父级 config 传入。
  Props：
    - config：{ playerEntities?: string }，与桌面 MiniWidget 同结构，指定受控媒体实体 ID。
  关键交互：光盘仅在实体 state === 'playing' 时旋转，避免常亮屏空转耗电。
-->
<script setup lang="ts">
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/DiscPlayerWidget 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed } from 'vue'
import MediaMiniWidget from '@/components/widgets/media/MiniWidget.vue'
import { useEntitiesStore } from '@/stores/entities.store'

const props = defineProps<{
  config: { playerEntities?: string }
}>()

const entitiesStore = useEntitiesStore()

/** 仅当媒体实体处于 playing 时旋转光盘，避免中控常亮屏空转耗电 */
const playing = computed(() => {
  const eid = props.config?.playerEntities || ''
  return !!eid && entitiesStore.entities[eid]?.state === 'playing'
})
</script>

<template>
  <div class="m-hk-disc">
    <div class="m-hk-disc__plate" :class="{ 'm-hk-disc__plate--spinning': playing }" aria-hidden="true">
      <span class="m-hk-disc__ring" />
      <span class="m-hk-disc__hub" />
    </div>
    <div class="m-hk-disc__body">
      <p class="m-page__card-label">碟机</p>
      <MediaMiniWidget compact :config="config" />
    </div>
  </div>
</template>

<style scoped>
.m-hk-disc {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border-radius: var(--hos-radius-panel, 20px);
  border: var(--hos-hairline, 1px) solid rgba(255, 255, 255, 0.1);
  background:
    radial-gradient(ellipse 60% 80% at 0% 50%, rgba(167, 139, 250, 0.16), transparent 55%),
    rgba(0, 0, 0, 0.22);
}

.m-hk-disc__plate {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: conic-gradient(from 210deg, #2a3344, #1a2030, #3b4560, #1a2030);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.12),
    0 8px 20px rgba(0, 0, 0, 0.35);
}

.m-hk-disc__plate--spinning {
  animation: m-hk-spin 14s linear infinite;
}

.m-hk-disc__ring {
  position: absolute;
  inset: 10px;
  border-radius: 50%;
  border: 1px dashed rgba(255, 255, 255, 0.18);
}

.m-hk-disc__hub {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  border-radius: 50%;
  background: #0b0f16;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.12);
}

.m-hk-disc__body {
  min-width: 0;
}

.m-hk-disc__body :deep(.media-mini),
.m-hk-disc__body :deep(.mm-root) {
  background: transparent;
  border: 0;
  box-shadow: none;
  padding: 0;
}

@keyframes m-hk-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .m-hk-disc__plate {
    animation: none;
  }

  .m-hk-disc__plate--spinning {
    animation: none;
  }
}
</style>
