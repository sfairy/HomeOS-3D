<!--
  GeekSceneNode.vue
  职责：geek-scene 星形画布中节点的统一渲染组件（基于 VueFlow 的自定义节点）。
       根据 data.kind 渲染 sceneRoot（场景根节点，四向 source）或 sceneEntity（实体节点，四向 target），
       展示图标/标题/实体 ID/目标/实时状态行，并按选中/搜索命中/需 HA 等态切换样式。
  所属模块：geek-scene。
  关键依赖：
    - @vue-flow/core 的 Handle / Position：绘制连线锚点（root 用 source，entity 用 target）。
    - useEntitiesStore + getEntityDisplayName：实体显示名与实时状态解析。
  Props：
    - data：节点数据（kind / label / entityId / detail / targetSide / needsHa / searchHit 等）。
    - selected：是否处于选中态（高亮）。
  关键交互：
    - sceneRoot 节点四向绘制 source handle；sceneEntity 节点四向绘制 target handle，并按 targetSide 高亮当前激活侧。
    - 实体节点展示实时 state（从 entitiesStore 取）；needsHa 时显示 HA 徽标并在 hover 说明中提示。
    - searchHit 态高亮边框，便于搜索定位时视觉聚焦。
-->
<template>
  <div
    :class="[
      'gsn',
      `gsn--${data.kind}`,
      selected && 'is-selected',
      data.needsHa && 'gsn--needs-ha',
      data.searchHit && 'is-search-hit',
      liveStatusLine && 'has-status',
    ]"
    :title="hoverTitle"
  >
    <!-- 实体：四个方向都可作 target，按布局启用对应一侧 -->
    <template v-if="data.kind === 'sceneEntity'">
      <Handle
        v-for="side in handleSides"
        :id="`tgt-${side}`"
        :key="`tgt-${side}`"
        type="target"
        :position="positionOf(side)"
        :class="['gsn-handle', targetSide === side && 'is-active']"
      />
    </template>

    <span v-if="data.needsHa" class="gsn-ha-badge" title="部分属性需 HA 执行完整快照">HA</span>
    <div class="gsn-icon" aria-hidden="true">{{ kindIcon }}</div>
    <div class="gsn-body">
      <span class="gsn-kind">{{ kindText }}</span>
      <strong class="gsn-title">{{ displayTitle }}</strong>
      <span v-if="entityIdLine" class="gsn-eid">{{ entityIdLine }}</span>
      <span v-if="data.detail" class="gsn-detail" :title="'目标：' + data.detail">
        {{ '目标 · ' + data.detail }}
      </span>
    </div>
    <div
      v-if="liveStatusLine"
      class="gsn-status"
      :class="data.searchHit && 'is-hit'"
      :title="liveStatusLine"
    >
      {{ liveStatusLine }}
    </div>

    <!-- 根节点：四向 source，边按 sourceHandle 选用 -->
    <template v-if="data.kind === 'sceneRoot'">
      <Handle
        v-for="side in handleSides"
        :id="`src-${side}`"
        :key="`src-${side}`"
        type="source"
        :position="positionOf(side)"
        class="gsn-handle"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useEntitiesStore } from '@/stores/entities.store'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

const props = defineProps({
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false },
})

const entitiesStore = useEntitiesStore()
const handleSides = ['top', 'right', 'bottom', 'left']

const kindIcon = computed(() => (props.data?.kind === 'sceneRoot' ? '🎬' : '◎'))
const kindText = computed(() => (props.data?.kind === 'sceneRoot' ? '场景' : '实体'))

const targetSide = computed(() => props.data?.targetSide || 'top')

function positionOf(side: string) {
  if (side === 'right') return Position.Right
  if (side === 'bottom') return Position.Bottom
  if (side === 'left') return Position.Left
  return Position.Top
}

const entityId = computed(() => {
  if (props.data?.kind !== 'sceneEntity') return ''
  return String(props.data?.entityId || props.data?.label || '').trim()
})

const displayTitle = computed(() => {
  if (props.data?.kind === 'sceneRoot') {
    return String(props.data?.label || '场景')
  }
  const id = entityId.value
  if (!id) return String(props.data?.label || '实体')
  const ent = entitiesStore.entities?.[id]
  return getEntityDisplayName(id, ent) || id
})

const entityIdLine = computed(() => {
  if (props.data?.kind !== 'sceneEntity') return ''
  const id = entityId.value
  if (!id) return ''
  if (displayTitle.value === id) return ''
  return id
})

const liveStatusLine = computed(() => {
  if (props.data?.kind !== 'sceneEntity') return ''
  const id = entityId.value
  if (!id) return '当前 · 未选设备'
  const ent = entitiesStore.entities?.[id]
  const st = ent?.state != null && String(ent.state) !== '' ? String(ent.state) : 'unavailable'
  return `当前 · ${st}`
})

const hoverTitle = computed(() => {
  if (props.data?.kind === 'sceneRoot') return displayTitle.value
  const id = entityId.value
  const title = displayTitle.value
  const base = !id ? title : title === id ? id : `${title}\n${id}`
  const lines = [base]
  if (props.data?.detail) lines.push(`目标：${props.data.detail}`)
  if (liveStatusLine.value) lines.push(liveStatusLine.value)
  if (props.data?.needsHa) {
    lines.push('部分属性未能完整还原，建议勾选「由 HA 执行」')
  }
  return lines.join('\n')
})
</script>

<style scoped>
.gsn {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 156px;
  max-width: 240px;
  padding: 10px 12px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(15, 23, 42, 0.94);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  color: #e2e8f0;
  font-size: var(--premium-fs-micro);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.gsn--needs-ha {
  border-color: rgba(251, 146, 60, 0.55);
}
.gsn-ha-badge {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: var(--premium-fs-micro);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #fdba74;
  background: rgba(154, 52, 18, 0.45);
  border: 1px solid rgba(251, 146, 60, 0.45);
  border-radius: 4px;
  padding: 1px 4px;
  line-height: 1.2;
}
.gsn.is-selected {
  border-color: rgba(251, 191, 36, 0.75);
  box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.22), 0 10px 28px rgba(0, 0, 0, 0.35);
}
.gsn--sceneRoot {
  min-width: 168px;
  border-color: rgba(167, 139, 250, 0.45);
  background: linear-gradient(145deg, rgba(76, 29, 149, 0.35), rgba(15, 23, 42, 0.95));
}
.gsn--sceneEntity {
  border-color: rgba(251, 191, 36, 0.35);
}
.gsn-icon {
  flex: 0 0 auto;
  font-size: 16px;
  line-height: 1;
}
.gsn-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.gsn-kind {
  font-size: var(--premium-fs-micro);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.85);
}
.gsn-title {
  font-size: var(--premium-fs-caption);
  font-weight: 600;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gsn-eid {
  font-size: var(--premium-fs-micro);
  line-height: 1.25;
  color: rgba(148, 163, 184, 0.72);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gsn-detail {
  font-size: var(--premium-fs-micro);
  color: rgba(148, 163, 184, 0.9);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gsn.is-search-hit {
  border-color: rgba(56, 189, 248, 0.85);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.28), 0 10px 28px rgba(0, 0, 0, 0.35);
}
.gsn.has-status {
  padding-bottom: 18px;
}
.gsn-status {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 4px;
  font-size: var(--premium-fs-micro);
  line-height: 1.2;
  color: rgba(148, 163, 184, 0.85);
  border-top: 1px solid rgba(148, 163, 184, 0.12);
  padding-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gsn-status.is-hit {
  color: #7dd3fc;
}
.gsn-handle {
  width: 8px !important;
  height: 8px !important;
  background: rgba(251, 191, 36, 0.35) !important;
  border: 1px solid rgba(15, 23, 42, 0.9) !important;
  opacity: 0.35;
}
.gsn-handle.is-active {
  background: rgba(251, 191, 36, 0.9) !important;
  opacity: 1;
}
.gsn--sceneRoot .gsn-handle {
  background: rgba(167, 139, 250, 0.75) !important;
  opacity: 0.85;
}
</style>
