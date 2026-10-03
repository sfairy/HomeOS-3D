<!--
  GeekTemplateNode.vue
  职责：geek-template 模板画布中节点的统一渲染组件（基于 VueFlow 的自定义节点）。
       根据 data.kind 渲染 root/slot/trigger/logic/sensor/yaml 等节点类型，
       展示图标/类型标签/标题/详情，并按 kind 决定是否绘制 target/source handle。
  所属模块：geek-template。
  关键依赖：@vue-flow/core 的 Handle / Position（绘制连线锚点）。
  Props：
    - data：节点数据（kind / label / detail / icon / empty / required 等）。
    - selected：是否处于选中态（高亮）。
  关键交互：
    - 非 root 节点绘制左侧 target handle；root/trigger/logic 节点绘制右侧 source handle。
    - empty + required 节点高亮为警告色（提示必填未填）；empty 非必填节点降低不透明度。
    - 图标与类型标签按 kind 映射（root→🧩模板、slot→槽位、trigger→⚡触发、logic→⚙逻辑、sensor→📡输出、yaml→📄YAML）。
-->
<template>
  <div
    :class="[
      'gtn',
      `gtn--${data.kind}`,
      data.empty && 'gtn--empty',
      data.required && data.empty && 'gtn--required-empty',
      selected && 'is-selected',
    ]"
  >
    <Handle v-if="data.kind !== 'root'" type="target" :position="Position.Left" class="gtn-handle" />
    <div class="gtn-icon" aria-hidden="true">{{ data.icon || kindIcon }}</div>
    <div class="gtn-body">
      <span class="gtn-kind">{{ kindText }}</span>
      <strong class="gtn-title">{{ data.label }}</strong>
      <span class="gtn-detail">{{ data.detail || '点击配置' }}</span>
    </div>
    <Handle
      v-if="data.kind === 'root' || data.kind === 'trigger' || data.kind === 'logic'"
      type="source"
      :position="Position.Right"
      class="gtn-handle"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'

const props = defineProps({
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false },
})

const kindIcon = computed(() => {
  const k = props.data?.kind
  if (k === 'root') return '🧩'
  if (k === 'trigger') return '⚡'
  if (k === 'logic') return '⚙'
  if (k === 'sensor') return '📡'
  if (k === 'yaml') return '📄'
  return '📌'
})

const kindText = computed(() => {
  const k = props.data?.kind
  if (k === 'root') return '模板'
  if (k === 'slot') return '槽位'
  if (k === 'trigger') return '触发'
  if (k === 'logic') return '逻辑'
  if (k === 'sensor') return '输出'
  if (k === 'yaml') return 'YAML'
  return '节点'
})
</script>

<style scoped>
.gtn {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 148px;
  max-width: 196px;
  padding: 10px 12px;
  border-radius: var(--hos-radius-card);
  background: rgba(12, 16, 24, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.gtn.is-selected,
.gtn:hover {
  border-color: rgba(168, 85, 247, 0.45);
  box-shadow: 0 0 0 1px rgba(168, 85, 247, 0.2);
}
.gtn--root {
  min-width: 160px;
  border-color: rgba(168, 85, 247, 0.35);
  background: linear-gradient(145deg, rgba(168, 85, 247, 0.12), rgba(12, 16, 24, 0.95));
}
.gtn--required-empty {
  border-color: rgba(251, 191, 36, 0.45);
  background: rgba(251, 191, 36, 0.06);
}
.gtn--empty:not(.gtn--required-empty) {
  opacity: 0.88;
}
.gtn-icon {
  font-size: 20px;
  line-height: 1;
  flex-shrink: 0;
}
.gtn-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.gtn-kind {
  font-size: var(--premium-fs-micro);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--hos-text-secondary);
}
.gtn-title {
  font-size: var(--premium-fs-caption);
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.25;
}
.gtn-detail {
  font-size: var(--premium-fs-micro);
  color: var(--hos-text-secondary);
  line-height: 1.35;
  word-break: break-all;
}
.gtn-handle {
  width: 8px;
  height: 8px;
  background: #a855f7;
  border: 2px solid rgba(10, 13, 20, 0.9);
}
</style>
