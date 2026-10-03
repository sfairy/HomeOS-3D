<!--
  GeekFlowNode.vue
  职责：geek-automation 画布中各类节点的统一渲染组件（基于 VueFlow 的自定义节点）。
       根据节点 kind 与 action.type 渲染图标、标题、详情、状态条，并按节点类型绘制不同的 source handles。
  所属模块：geek-automation。
  关键依赖：@vue-flow/core 的 Handle / Position（绘制连线锚点）。
  Props：
    - data：节点数据（kind / label / detail / action / hit / statusText / needsHa 等）。
    - selected：是否处于选中态（高亮）。
  关键交互：
    - 节点类型包括 start / trigger / condition / trigger_group / condition_group / note / action。
    - 流程型动作 choose/repeat/sequence/parallel/condition 各自渲染多 source 端口；
      choose 端口数随分支数动态变化，节点高度随之调整。
    - 命中/未命中态通过 hit 字段在最近执行轨迹中突出显示（绿/红边框）。
-->
<template>
  <div
    :class="[
      'gfn',
      `gfn--${data.kind}`,
      data.action?.type && `gfn-action--${data.action.type}`,
      data.hit === true && 'is-hit',
      data.hit === false && 'is-miss',
      selected && 'is-selected',
    ]"
    :style="chooseNodeStyle"
  >
    <Handle
      v-if="showTarget"
      type="target"
      :position="Position.Left"
      class="gfn-handle"
    />
    <div class="gfn-icon" aria-hidden="true">{{ kindIcon }}</div>
    <div class="gfn-body">
      <span class="gfn-kind">
        {{ kindText }}
        <em v-if="data.needsHa" class="gfn-ha" title="需 HA 执行">{{ 'HA' }}</em>
      </span>
      <strong class="gfn-title">{{ data.label }}</strong>
      <span class="gfn-detail">{{ data.detail || '点击配置' }}</span>
    </div>

    <template v-if="isChoose">
      <Handle
        v-for="p in choosePorts"
        :id="p.id"
        :key="p.id"
        type="source"
        :position="Position.Right"
        :style="{ top: p.top }"
        :class="['gfn-handle', p.cls]"
      />
      <div class="gfn-ports">
        <span v-for="p in choosePorts" :key="`lab-${p.id}`">{{ p.label }}</span>
      </div>
    </template>
    <template v-else-if="isRepeat">
      <Handle
        id="body"
        type="source"
        :position="Position.Right"
        :style="{ top: '32%' }"
        class="gfn-handle gfn-handle--body"
      />
      <Handle
        id="done"
        type="source"
        :position="Position.Right"
        :style="{ top: '72%' }"
        class="gfn-handle gfn-handle--done"
      />
      <div class="gfn-ports"><span>循环体</span><span>完成后</span></div>
    </template>
    <template v-else-if="isSequence">
      <Handle
        id="body"
        type="source"
        :position="Position.Right"
        :style="{ top: '32%' }"
        class="gfn-handle gfn-handle--body"
      />
      <Handle
        id="done"
        type="source"
        :position="Position.Right"
        :style="{ top: '72%' }"
        class="gfn-handle gfn-handle--done"
      />
      <div class="gfn-ports"><span>步骤</span><span>完成后</span></div>
    </template>
    <template v-else-if="isParallel">
      <Handle
        id="out"
        type="source"
        :position="Position.Right"
        :style="{ top: '32%' }"
        class="gfn-handle"
      />
      <Handle
        id="done"
        type="source"
        :position="Position.Right"
        :style="{ top: '72%' }"
        class="gfn-handle gfn-handle--done"
      />
      <div class="gfn-ports"><span>并行分支</span><span>完成后</span></div>
    </template>
    <template v-else-if="isCondition">
      <Handle
        id="pass"
        type="source"
        :position="Position.Right"
        :style="{ top: '32%' }"
        class="gfn-handle gfn-handle--pass"
      />
      <Handle
        id="fail"
        type="source"
        :position="Position.Right"
        :style="{ top: '72%' }"
        class="gfn-handle gfn-handle--fail"
      />
      <div class="gfn-ports"><span>满足</span><span>不满足</span></div>
    </template>
    <Handle
      v-else-if="showSource"
      type="source"
      :position="Position.Right"
      class="gfn-handle"
    />

    <div v-if="statusLine" class="gfn-status" :title="statusLine">{{ statusLine }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'

const props = defineProps({
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false },
})

// 节点图标：根据 kind 与 action.type 选择对应 emoji / 符号
const kindIcon = computed(() => {
  const k = props.data?.kind
  if (k === 'start') return '▶'
  if (k === 'trigger') return '⚡'
  if (k === 'condition') return '?'
  if (k === 'trigger_group') return '⧉'
  if (k === 'condition_group') return '⧉'
  if (k === 'note') return '✎'
  const t = props.data?.action?.type
  if (t === 'debug') return '◉'
  if (t === 'repeat') return '↻'
  if (t === 'choose') return '⑂'
  if (t === 'parallel') return '⇉'
  if (t === 'sequence') return '⇉'
  return '◎'
})

// 节点类型中文标签
const kindText = computed(() => {
  const k = props.data?.kind
  if (k === 'start') return '开始'
  if (k === 'trigger') return '触发'
  if (k === 'condition') return '条件'
  if (k === 'trigger_group') return '触发组'
  if (k === 'condition_group') return '条件组'
  if (k === 'note') return '注释'
  const t = props.data?.action?.type
  if (t === 'debug') return '调试'
  if (t === 'repeat') return '重复'
  if (t === 'choose') return '分支'
  if (t === 'parallel') return '并行'
  if (t === 'sequence') return '顺序'
  return '执行'
})

// 是否为 choose 流程节点（动态多分支端口）
const isChoose = computed(
  () => props.data?.kind === 'action' && props.data?.action?.type === 'choose',
)
// 是否为 repeat 流程节点（循环体 + 完成后双端口）
const isRepeat = computed(
  () => props.data?.kind === 'action' && props.data?.action?.type === 'repeat',
)
// 是否为 sequence 顺序节点（步骤 + 完成后双端口）
const isSequence = computed(
  () => props.data?.kind === 'action' && props.data?.action?.type === 'sequence',
)
// 是否为 parallel 并行节点（并行分支 + 完成后双端口）
const isParallel = computed(
  () => props.data?.kind === 'action' && props.data?.action?.type === 'parallel',
)
// 是否为 condition 节点（满足 / 不满足双端口）
const isCondition = computed(() => props.data?.kind === 'condition')
// start 与 note 节点不显示 target handle
const showTarget = computed(() => props.data?.kind !== 'start' && props.data?.kind !== 'note')
// note 节点不显示 source handle
const showSource = computed(() => props.data?.kind !== 'note')

// choose 节点的端口配置：非默认分支 + else + done，按数量均分纵向位置
const choosePorts = computed(() => {
  if (!isChoose.value) return []
  const branches = props.data?.action?.branches || []
  const nonDefault = branches.filter((b) => !b.isDefault)
  const count = Math.max(1, nonDefault.length)
  const ports = []
  for (let i = 0; i < count; i++) {
    ports.push({
      id: i === 0 ? 'then' : `then:${i}`,
      label: i === 0 ? '满足' : `满足${i + 1}`,
      cls: 'gfn-handle--then',
    })
  }
  ports.push({ id: 'else', label: '否则', cls: 'gfn-handle--else' })
  ports.push({ id: 'done', label: '完成后', cls: 'gfn-handle--done' })
  return ports.map((p, i, arr) => ({
    ...p,
    top: `${((i + 1) / (arr.length + 1)) * 100}%`,
  }))
})

// choose 节点动态高度：随分支端口数调整 minHeight，保证端口均匀分布
const chooseNodeStyle = computed(() => {
  if (!isChoose.value) return undefined
  const n = choosePorts.value.length
  return { minHeight: `${Math.max(52, 24 + n * 20)}px` }
})

// 节点底部状态行：优先用 statusText，否则按 hit 推导「命中 / 未通过」
const statusLine = computed(() => {
  if (props.data?.statusText) return String(props.data.statusText)
  if (props.data?.hit === true) return '最近：命中'
  if (props.data?.hit === false) return '最近：未通过'
  return ''
})
</script>

<style scoped>
.gfn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 132px;
  min-height: 40px;
  padding: 6px 8px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(160deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98));
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  cursor: grab;
  color: #e2e8f0;
}
.gfn.is-selected {
  border-color: rgba(96, 165, 250, 0.85);
  box-shadow:
    0 0 0 2px rgba(59, 130, 246, 0.28),
    0 6px 16px rgba(0, 0, 0, 0.3);
}
.gfn.is-hit {
  border-color: rgba(52, 211, 153, 0.9);
}
.gfn.is-miss {
  border-color: rgba(248, 113, 113, 0.9);
}
.gfn--start {
  background: linear-gradient(145deg, #3b82f6, #1d4ed8);
  border-color: transparent;
  width: 108px;
  min-height: 36px;
  padding: 5px 8px;
}
.gfn--start .gfn-kind,
.gfn--start .gfn-detail {
  color: rgba(255, 255, 255, 0.8);
}
.gfn--note {
  background: linear-gradient(160deg, rgba(69, 58, 32, 0.95), rgba(30, 24, 12, 0.98));
  border-color: rgba(251, 191, 36, 0.35);
  width: 124px;
}
.gfn--trigger_group,
.gfn--condition_group {
  width: 118px;
  min-height: 34px;
  border-style: dashed;
  border-color: rgba(167, 139, 250, 0.45);
  background: linear-gradient(160deg, rgba(76, 29, 149, 0.35), rgba(15, 23, 42, 0.95));
}
.gfn--trigger_group .gfn-icon,
.gfn--condition_group .gfn-icon {
  color: #c4b5fd;
}
.gfn-action--choose,
.gfn-action--repeat {
  min-height: 52px;
  padding-right: 34px;
  align-items: flex-start;
  padding-top: 7px;
  padding-bottom: 7px;
}
.gfn--trigger .gfn-icon {
  background: rgba(52, 211, 153, 0.18);
  color: #6ee7b7;
}
.gfn--condition .gfn-icon {
  background: rgba(56, 189, 248, 0.18);
  color: #7dd3fc;
}
.gfn--action .gfn-icon {
  background: rgba(251, 191, 36, 0.18);
  color: #fcd34d;
}
.gfn-action--debug .gfn-icon {
  background: rgba(167, 139, 250, 0.2);
  color: #c4b5fd;
}
.gfn-icon {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  font-size: var(--premium-fs-micro);
  background: rgba(147, 197, 253, 0.15);
  color: #93c5fd;
}
.gfn-body {
  min-width: 0;
  flex: 1;
}
.gfn-kind {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--premium-fs-micro);
  letter-spacing: 0.03em;
  text-transform: uppercase;
  opacity: 0.5;
  margin-bottom: 0;
  line-height: 1.15;
}
.gfn-ha {
  flex: 0 0 auto;
  margin: 0;
  padding: 0 4px;
  border-radius: var(--hos-radius-pill);
  font-size: var(--premium-fs-micro);
  font-style: normal;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: none;
  opacity: 1;
  color: #fde68a;
  background: rgba(245, 158, 11, 0.28);
  border: 1px solid rgba(251, 191, 36, 0.4);
}
.gfn-title {
  display: block;
  font-size: var(--premium-fs-micro);
  font-weight: 650;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gfn-detail {
  margin-top: 1px;
  font-size: var(--premium-fs-micro);
  line-height: 1.25;
  opacity: 0.62;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.gfn-ports {
  position: absolute;
  right: 8px;
  top: 22%;
  bottom: 22%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-size: var(--premium-fs-micro);
  opacity: 0.55;
  pointer-events: none;
}
.gfn-handle {
  width: 8px !important;
  height: 8px !important;
  background: #60a5fa !important;
  border: 1.5px solid #0f172a !important;
}
.gfn-handle--then,
.gfn-handle--pass,
.gfn-handle--body {
  background: #34d399 !important;
}
.gfn-handle--else,
.gfn-handle--fail {
  background: #f87171 !important;
}
.gfn-handle--done {
  background: #a78bfa !important;
}
.gfn-status {
  position: absolute;
  left: 6px;
  right: 6px;
  bottom: 2px;
  font-size: var(--premium-fs-micro);
  line-height: 1.15;
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #94a3b8;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
  padding-top: 1px;
}
.gfn:has(.gfn-status) {
  padding-bottom: 14px;
}
</style>
