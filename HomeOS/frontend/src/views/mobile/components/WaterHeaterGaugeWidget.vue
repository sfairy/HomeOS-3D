<!--
  竖屏 HomeKit 风格：水准仪度盘热水器
  组件：WaterHeaterGaugeWidget.vue
  所属模块：frontend / src / views / mobile / components
  职责：移动端首页「热水器」卡片——竖向度盘可视化水位/温度 + 右侧数值与实体 ID。
  数据来源：温度与百分比由父级计算后透传（基于 water_heater 实体的 max/min/current 属性）。
  Props：
    - entityId：热水器实体 ID（未绑定时按钮禁用）。
    - current：当前温度，未绑定时显示「未绑定」。
    - pct：水位百分比，驱动度盘填充高度与气泡位置。
    - bound：是否已绑定实体，控制按钮可点击性与文案。
  Emits：
    - open：点击卡片时抛出，父级打开实体控制弹层。
-->
<script setup lang="ts">
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/WaterHeaterGaugeWidget 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
defineProps<{
  entityId: string
  current: number | string
  pct: number
  bound: boolean
}>()

defineEmits<{ open: [] }>()
</script>

<template>
  <button
    type="button"
    class="m-hk-heater"
    :disabled="!bound"
    @click="$emit('open')"
  >
    <div class="m-hk-heater__gauge" :style="{ '--level': `${pct}%` }" aria-hidden="true">
      <span class="m-hk-heater__bubble" />
      <span class="m-hk-heater__ticks" />
    </div>
    <div class="m-hk-heater__copy">
      <p class="m-page__card-label">热水器</p>
      <p class="m-hk-heater__value">{{ bound ? `${current || '—'}°` : '未绑定' }}</p>
      <p v-if="bound" class="m-hk-heater__id">{{ entityId }}</p>
    </div>
  </button>
</template>

<style scoped>
.m-hk-heater {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px;
  border-radius: var(--hos-radius-panel, 20px);
  border: var(--hos-hairline, 1px) solid rgba(251, 146, 60, 0.28);
  background:
    radial-gradient(ellipse 60% 70% at 0% 100%, rgba(251, 146, 60, 0.16), transparent 55%),
    rgba(0, 0, 0, 0.22);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.m-hk-heater:disabled {
  opacity: 0.5;
  cursor: default;
}

.m-hk-heater__gauge {
  position: relative;
  width: 28px;
  height: 72px;
  border-radius: var(--hos-radius-pill);
  border: 1.5px solid rgba(255, 255, 255, 0.22);
  background: linear-gradient(
    to top,
    rgba(251, 146, 60, 0.95) 0%,
    rgba(251, 146, 60, 0.95) var(--level, 40%),
    rgba(255, 255, 255, 0.06) var(--level, 40%),
    rgba(255, 255, 255, 0.06) 100%
  );
  overflow: hidden;
  flex-shrink: 0;
}

.m-hk-heater__ticks {
  position: absolute;
  inset: 8px 4px;
  background: repeating-linear-gradient(
    to top,
    transparent 0,
    transparent 9px,
    rgba(255, 255, 255, 0.12) 9px,
    rgba(255, 255, 255, 0.12) 10px
  );
  pointer-events: none;
}

.m-hk-heater__bubble {
  position: absolute;
  left: 50%;
  bottom: max(6px, calc(var(--level, 40%) - 6px));
  width: 10px;
  height: 10px;
  margin-left: -5px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 0 8px rgba(251, 146, 60, 0.65);
}

.m-hk-heater__value {
  margin: 4px 0 0;
  font-size: 18px;
  font-weight: 750;
}

.m-hk-heater__id {
  margin: 2px 0 0;
  font-size: var(--premium-fs-micro);
  color: var(--hos-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
