<!--
  GeekFlowCanvas.vue
  职责：geek-automation 编辑器的核心画布组件，基于 VueFlow 实现自动化/脚本的可视化编排。
       承载节点投放栏（米家式分组）+ 全幅舞台 + DnD 拖拽 + 撤销重做 + 复制粘贴 + 键盘操作。
  所属模块：geek-automation。
  关键依赖：
    - @vue-flow/core（VueFlow / MarkerType / useVueFlow）：节点画布主体。
    - @vue-flow/background / @vue-flow/controls：背景网格与缩放控件。
    - GeekCanvasShell：左投放栏 + 舞台外壳。
    - GeekFlowNode：自定义节点渲染。
    - canvas.util：图 ↔ 画布互转、节点增删、连线校验、布局排版等核心工具。
    - useGeekPaletteDnd / useGeekCanvasHistory：投放拖拽与撤销重做。
    - 各种 presets.util：触发器/条件预设与取反。
    - palette.util / flow-node-ha.util：投放栏数据与节点 HA 徽标。
  Props：
    - graph：自动化/脚本的图数据（triggers / conditions / actions / flowNodes / flowEdges）。
    - selectedNodeId：当前选中节点 id（双向）。
    - lastTrace / lastSuccess：执行轨迹与成功态，用于节点高亮。
    - variableValues：变量键值映射，用于变量节点状态条。
    - paletteMode：automation / script，控制投放条与连线校验差异。
    - engineCaps：本地引擎能力清单，用于节点「需 HA」徽标。
  Emits：update:graph / select / update:selectedNodeId / hint。
  关键交互：
    - 投放栏分组可折叠；按 pointerdown 启动 DnD 拖拽，click 触发 rail 模式插入。
    - onConnect 校验连线合法性（自动应用组归属、避免环、限制条件→动作等）。
    - 节点点击 / 边点击 / 空白点击分别处理选中与取消；选中节点支持 Del / Ctrl+C/V / 方向键。
    - script 模式下追加动作会寻找链尾挂接；choose/parallel/sequence/repeat 节点支持 bundle 插入。
    - 撤销重做基于画布结构状态栈；onNodeDragStart 拖拽前快照位置以便恢复。
    - mounted 后绑定 keydown，离开时移除。
-->
<!--
  真·节点画布：全幅舞台 + 左侧可收缩投放栏（米家式分组）。
-->
<template>
  <GeekCanvasShell
    root-class="geek-canvas"
    :set-stage-ref="bindStageRef"
    :set-root-ref="bindRootRef"
    rail-aria-label="添加节点"
    rail-title="节点"
    storage-key="homeos.geek.railCollapsed"
    :tip="
      paletteMode === 'script'
        ? 'Del 删除 · 从「开始」连动作 · Ctrl+C/V 复制'
        : 'Del 删除 · Ctrl+C/V 复制节点'
    "
    expand-title="展开节点栏"
    collapse-title="收起节点栏"
    tabindex="0"
    @layout="relayout"
  >
    <template #rail="{ collapsed }">
      <section v-for="g in paletteGroups" :key="g" class="geek-canvas-shell__rail-section">
        <button
          v-if="!collapsed"
          type="button"
          class="geek-canvas-shell__rail-group geek-canvas__rail-group"
          @click="toggleGroup(g)"
        >
          <span>{{ g }}</span>
          <em>{{ openGroups[g] === false ? '+' : '−' }}</em>
        </button>
        <em v-else class="geek-canvas-shell__rail-group-mini" :title="g">{{ g.slice(0, 1) }}</em>
        <div
          v-show="collapsed || openGroups[g] !== false"
          class="geek-canvas-shell__rail-items geek-canvas__rail-items"
        >
          <button
            v-for="item in palette.filter((p) => p.group === g)"
            :key="item.key"
            type="button"
            :class="[
              'geek-canvas-shell__rail-item',
              'geek-canvas__rail-item',
              paletteItemNeedsHaHint(item, paletteMode) && 'is-ha-only',
            ]"
            :data-kind="item.kind || 'action'"
            :title="paletteItemTitle(item, paletteMode)"
            @pointerdown="onPalettePointerDown($event, item)"
            @click="onRailClick(item)"
          >
            <i>{{ item.badge }}</i>
            <span v-if="!collapsed">{{ item.label }}</span>
            <em
              v-if="!collapsed && paletteItemNeedsHaHint(item, paletteMode)"
              class="geek-canvas-shell__rail-ha geek-canvas__rail-ha"
            >{{ 'HA' }}</em>
          </button>
        </div>
      </section>
    </template>

    <div v-if="paletteMode === 'script' && !hasScriptActions" class="geek-canvas__empty">
      <p>{{ '从左侧投放动作节点' }}</p>
      <span>{{ '拖入「执行操作」「延迟」等，或点顶部「模板」' }}</span>
    </div>
    <VueFlow
      :id="flowId"
      v-model:nodes="nodes"
      v-model:edges="edges"
      :node-types="nodeTypes"
      :default-viewport="{ zoom: 0.78, x: 32, y: 32 }"
      :min-zoom="0.25"
      :max-zoom="1.6"
      :snap-to-grid="true"
      :snap-grid="[12, 12]"
      :nodes-draggable="!dnd.active"
      :fit-view-on-init="false"
      @node-click="onNodeClick"
      @edge-click="onEdgeClick"
      @pane-click="onPaneClick"
      @connect="onConnect"
      @connect-end="onConnectEnd"
      @node-drag-start="onNodeDragStart"
      @node-drag-stop="scheduleCommit"
      @edges-change="scheduleCommit"
    >
      <Background :gap="20" :size="1" pattern-color="rgba(95, 212, 255, 0.09)" />
      <Controls position="top-right" />
    </VueFlow>

    <template #overlay>
      <Teleport to="body">
        <div
          v-if="dnd.active && dnd.item"
          class="geek-dnd-ghost"
          :data-kind="dnd.item.kind || 'action'"
          :style="{ transform: `translate(${dnd.x}px, ${dnd.y}px) translate(-50%, -50%)` }"
        >
          <i>{{ dnd.item.badge || '◎' }}</i>
          <span>{{ dnd.item.label || '节点' }}</span>
        </div>
      </Teleport>
    </template>
  </GeekCanvasShell>
</template>

<script setup>
import { computed, getCurrentInstance, markRaw, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { VueFlow, MarkerType, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@/components/geek-automation/styles/geek-dnd-ghost.css'
import GeekCanvasShell from '@/components/geek-automation/GeekCanvasShell.vue'
import GeekFlowNode from './GeekFlowNode.vue'
import { useGeekPaletteDnd } from '@/composables/orchestrator/useGeekPaletteDnd'
import { safeGeekFitView } from '@/composables/orchestrator/safeGeekFitView'
import { useEntitiesStore } from '@/stores/entities.store'
import { useVueFlowParentScaleFix } from '@/composables/ui/useVueFlowParentScaleFix'
import {
  applyGroupMembershipOnConnect,
  applyTraceHits,
  actionSummary,
  canvasFromGeekGraph,
  cloneGeekCanvasNode,
  conditionSummary,
  createCanvasNode,
  getGeekNodeClipboard,
  isValidGeekConnection,
  layoutCanvasFromGraph,
  reassignMembersAfterGroupDelete,
  setGeekNodeClipboard,
  syncGraphFromCanvas,
  triggerSummary,
  validateGeekCanvasConnectivity,
} from '@/utils/geek-automation/canvas.util'
import { applyTriggerPreset } from '@/utils/geek-automation/trigger-presets.util'
import { applyConditionPreset, invertConditionForm } from '@/utils/geek-automation/condition-presets.util'
import {
  varKeyFromCanvasData,
  variableStatusText,
} from '@/utils/geek-automation/variable-status.util'
import {
  GEEK_PALETTE,
  GEEK_SCRIPT_PALETTE,
  geekPaletteGroups,
  paletteItemNeedsHaHint,
  paletteItemTitle,
} from '@/utils/geek-automation/palette.util'
import { flowNodeNeedsHa } from '@/utils/geek-automation/flow-node-ha.util'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { clonePlain } from '@/utils/core/clone-plain.util'
import { useGeekCanvasHistory } from '@/composables/orchestrator/useGeekCanvasHistory'

const props = defineProps({
  graph: { type: Object, required: true },
  selectedNodeId: { type: String, default: null },
  lastTrace: { type: Array, default: () => [] },
  lastSuccess: { type: Boolean, default: null },
  /** key → 当前值，用于变量节点状态条 */
  variableValues: { type: Object, default: () => ({}) },
  /** automation | script：控制投放条与连线校验 */
  paletteMode: { type: String, default: 'automation' },
  /** 引擎能力清单（用于节点「需 HA」徽标） */
  engineCaps: { type: Object, default: null },
})

const emit = defineEmits(['update:graph', 'select', 'update:selectedNodeId', 'hint'])

const entitiesStore = useEntitiesStore()

const nodeTypes = {
  geekStart: markRaw(GeekFlowNode),
  geekTrigger: markRaw(GeekFlowNode),
  geekCondition: markRaw(GeekFlowNode),
  geekAction: markRaw(GeekFlowNode),
  geekNote: markRaw(GeekFlowNode),
  geekGroup: markRaw(GeekFlowNode),
}

const nodes = ref([])
const edges = ref([])
/** 脚本画布：尚无动作节点时显示投放提示（须在 useVueFlow 前定义，避免 HMR 半更新） */
const hasScriptActions = computed(() =>
  (nodes.value || []).some((n) => n.type === 'geekAction' || n?.data?.kind === 'action'),
)
/**
 * 每个画布实例用独立 Vue Flow store id。
 * KeepAlive 缓存多份构建器、或 canvasKey 重挂载时，固定 id 会复用/抢销毁全局 store，
 * 触发 “No store instance found for id … in storage”。
 */
const flowId = `geek-flow-${props.paletteMode === 'script' ? 'script' : 'automation'}-${getCurrentInstance()?.uid ?? 0}`
const stageRef = ref(null)
const canvasRootRef = ref(null)
function bindStageRef(el) {
  stageRef.value = el || null
}
function bindRootRef(el) {
  canvasRootRef.value = el || null
}
const selectedEdgeId = ref(null)
let syncingFromProps = false
let commitTimer = null

const { screenToFlowCoordinate, viewport, fitView, setViewport, getNodes } =
  useVueFlow(flowId)
const { screenToFlow, refresh: refreshFlowScaleFix } = useVueFlowParentScaleFix(flowId)

const DEFAULT_VIEWPORT = { zoom: 0.78, x: 32, y: 32 }

function finitePos(pos) {
  const x = Number(pos?.x)
  const y = Number(pos?.y)
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  }
}

function sanitizeLaidNodes(list) {
  return (list || []).map((n) => ({
    ...n,
    position: finitePos(n?.position),
  }))
}

/** fitView 在节点未测到宽高 / 容器为 0 时会产出 NaN 视口，污染 Background pattern */
async function safeFitView() {
  await safeGeekFitView({
    stageEl: stageRef.value,
    nodes: nodes.value,
    getNodes,
    fitView,
    setViewport,
    viewport,
    refreshScaleFix: refreshFlowScaleFix,
    sanitizeNodes: sanitizeLaidNodes,
    applySanitized: (list) => {
      nodes.value = list
    },
    defaultViewport: DEFAULT_VIEWPORT,
    requirePositiveZoom: true,
  })
}

const { dnd, onPalettePointerDown, consumeRailClickSkip } = useGeekPaletteDnd({
  stageRef,
  screenToFlow,
  screenToFlowCoordinate,
  viewport,
  onDrop: (item, pos) => addNode(item, pos),
  dropOffset: { w: 132, h: 40 },
})

const palette = computed(() =>
  props.paletteMode === 'script' ? GEEK_SCRIPT_PALETTE : GEEK_PALETTE,
)

const paletteGroups = computed(() => geekPaletteGroups(palette.value))

const openGroups = reactive({})
watch(
  paletteGroups,
  (groups) => {
    for (const g of groups) {
      if (!(g in openGroups)) openGroups[g] = true
    }
  },
  { immediate: true },
)

function toggleGroup(g) {
  openGroups[g] = openGroups[g] === false
}

function edgeMeta(edge) {
  const h = edge.sourceHandle
  if (h === 'then' || h === 'pass' || h === 'body' || /^then:\d+$/.test(String(h || ''))) {
    const m = /^then:(\d+)$/.exec(String(h || ''))
    const label = m ? `满足${Number(m[1]) + 1}` : h === 'body' ? '循环体' : '满足'
    return { label, stroke: '#34d399' }
  }
  if (h === 'else' || h === 'fail' || h === 'default') {
    return { label: h === 'fail' ? '不满足' : '否则', stroke: '#f87171' }
  }
  if (h === 'done') return { label: '完成后', stroke: '#a78bfa' }
  return { label: edge.label, stroke: '#94a3b8' }
}

function decorateEdges(list) {
  return list.map((edge) => {
    const meta = edgeMeta(edge)
    const selected = edge.id === selectedEdgeId.value
    return {
      ...edge,
      label: meta.label || edge.label,
      markerEnd: MarkerType.ArrowClosed,
      animated: hIsBranch(edge.sourceHandle),
      style: {
        stroke: selected ? '#a78bfa' : meta.stroke,
        strokeWidth: selected ? 2.5 : 1.8,
      },
    }
  })
}

function hIsBranch(h) {
  const s = String(h || '')
  return (
    ['then', 'else', 'default', 'pass', 'fail', 'body', 'done'].includes(s) ||
    /^then:\d+$/.test(s)
  )
}

function enrichLiveStatus(list) {
  let changed = false
  const next = list.map((n) => {
    const needsHa = flowNodeNeedsHa(n.data, props.paletteMode, props.engineCaps)
    const varKey = varKeyFromCanvasData(n.data)
    const varStatus = varKey ? variableStatusText(varKey, props.variableValues) : ''
    if (varStatus) {
      if (n.data?.statusText === varStatus && Boolean(n.data?.needsHa) === needsHa) return n
      changed = true
      return {
        ...n,
        data: {
          ...n.data,
          needsHa,
          statusText: varStatus,
        },
      }
    }
    const eid =
      n.data?.trigger?.entityId ||
      n.data?.condition?.entityId ||
      n.data?.action?.entityId ||
      ''
    if (!eid || n.data?.kind === 'note' || n.data?.kind === 'start') {
      if (Boolean(n.data?.needsHa) === needsHa) return n
      changed = true
      return { ...n, data: { ...n.data, needsHa } }
    }
    const ent = entitiesStore.getEntity?.(eid) || entitiesStore.entities?.[eid]
    if (!ent) {
      if (Boolean(n.data?.needsHa) === needsHa) return n
      changed = true
      return { ...n, data: { ...n.data, needsHa } }
    }
    const name = getEntityDisplayName(eid, ent) || eid
    const st = ent.state != null ? String(ent.state) : ''
    if (!st) {
      if (Boolean(n.data?.needsHa) === needsHa) return n
      changed = true
      return { ...n, data: { ...n.data, needsHa } }
    }
    const statusText = `${name}: ${st}`
    if (n.data?.statusText === statusText && Boolean(n.data?.needsHa) === needsHa) return n
    changed = true
    return {
      ...n,
      data: {
        ...n.data,
        needsHa,
        statusText,
      },
    }
  })
  return changed ? next : list
}

function paintNodes(list) {
  return enrichLiveStatus(applyTraceHits(list, props.lastTrace, props.lastSuccess))
}

/** 与父级 selectedNodeId 对齐 Vue Flow 的 selected，避免高亮与属性卡脱节 */
function applyNodeSelectionFlags(list) {
  const id = props.selectedNodeId
  let changed = false
  const next = (list || []).map((n) => {
    const selected = Boolean(id && n.id === id)
    if (Boolean(n.selected) === selected) return n
    changed = true
    return { ...n, selected }
  })
  return changed ? next : list
}

function loadFromGraph(g) {
  syncingFromProps = true
  const { nodes: n, edges: e } = canvasFromGeekGraph(g)
  nodes.value = applyNodeSelectionFlags(paintNodes(n))
  edges.value = decorateEdges(e)
  syncingFromProps = false
}

loadFromGraph(props.graph)

watch(
  () => props.selectedNodeId,
  () => {
    nodes.value = applyNodeSelectionFlags(nodes.value)
  },
)

watch(
  () => [props.lastTrace, props.lastSuccess],
  () => {
    nodes.value = paintNodes(nodes.value)
  },
)

watch(
  () => entitiesStore.totalCount,
  () => {
    if (!nodes.value.length) return
    const next = enrichLiveStatus(nodes.value)
    if (next !== nodes.value) nodes.value = next
  },
)

watch(
  () => props.variableValues,
  () => {
    if (!nodes.value.length) return
    const next = enrichLiveStatus(nodes.value)
    if (next !== nodes.value) nodes.value = next
  },
  { deep: true },
)

watch(
  () => props.engineCaps,
  () => {
    if (!nodes.value.length) return
    const next = enrichLiveStatus(nodes.value)
    if (next !== nodes.value) nodes.value = next
  },
)

function commit() {
  if (syncingFromProps) return
  const next = syncGraphFromCanvas(props.graph, nodes.value, edges.value)
  emit('update:graph', next)
}

/** 属性面板写回：保持与画布 node.data 同一引用，避免 commit 后改动丢失 */
function getNodeData(id) {
  return nodes.value.find((n) => n.id === id)?.data || null
}

/**
 * 仅允许同引用写回。跨对象 Object.assign 会在「先改 selectedNodeId、再 flush 旧 payload」
 * 的竞态下把旧节点配置合并进新节点，导致属性卡卡住。
 */
function patchNodeData(id, data) {
  if (!id || !data) return false
  const idx = nodes.value.findIndex((n) => n.id === id)
  if (idx < 0) return false
  const node = nodes.value[idx]
  if (node.data != null && node.data !== data) return false
  nodes.value = paintNodes(
    nodes.value.map((n, i) => (i === idx ? { ...n, data } : n)),
  )
  return true
}

/** 先 select 再改 id：父级 flush 时 selectedNodeId 仍指向旧节点 */
function emitNodeSelection(node) {
  emit('select', node)
  emit('update:selectedNodeId', node?.id ?? null)
}

function scheduleCommit() {
  if (syncingFromProps) return
  clearTimeout(commitTimer)
  commitTimer = setTimeout(commit, 100)
}

// ── 撤销 / 重做：画布结构状态栈 ──
const { pushHistory, undo, redo, canUndo, canRedo } = useGeekCanvasHistory({
  clone: clonePlain,
  getSnapshot: () => ({ nodes: nodes.value, edges: edges.value }),
  applySnapshot: (snap) => {
    nodes.value = snap.nodes
    edges.value = snap.edges
    selectedEdgeId.value = null
    emitNodeSelection(null)
    scheduleCommit()
  },
  isPaused: () => syncingFromProps,
  onHint: (message) => emit('hint', message),
})

function onConnect(params) {
  const sourceNode = nodes.value.find((n) => n.id === params.source)
  const targetNode = nodes.value.find((n) => n.id === params.target)
  if (
    !isValidGeekConnection({
      sourceNode,
      targetNode,
      sourceHandle: params.sourceHandle,
    })
  ) {
    emit(
      'hint',
      props.paletteMode === 'script'
        ? '不能这样连：请从「开始」串动作序列；分支/重复请用对应端口'
        : '不能这样连：请按 开始→触发→条件→动作；分支/重复请用对应端口',
    )
    return
  }
  pushHistory()
  const membership = applyGroupMembershipOnConnect(nodes.value, params.source, params.target)
  if (membership.changed) {
    nodes.value = paintNodes(membership.nodes)
    if (membership.hint) emit('hint', membership.hint)
  }
  const meta = edgeMeta({ sourceHandle: params.sourceHandle })
  edges.value = decorateEdges([
    ...edges.value,
    {
      ...params,
      id: `e-${params.source}-${params.target}-${params.sourceHandle || 'out'}-${Date.now()}`,
      label: meta.label,
    },
  ])
  scheduleCommit()
}

function onConnectEnd() {
  /* 松手未连上时静默 */
}

function onNodeClick({ node }) {
  selectedEdgeId.value = null
  edges.value = decorateEdges(edges.value)
  emitNodeSelection(node)
}

/** 拖拽前快照一次位置，便于 Ctrl+Z 恢复拖动前的布局 */
function onNodeDragStart() {
  pushHistory()
}

function onEdgeClick({ edge }) {
  selectedEdgeId.value = edge.id
  edges.value = decorateEdges(edges.value)
  emitNodeSelection(null)
}

function onPaneClick() {
  selectedEdgeId.value = null
  edges.value = decorateEdges(edges.value)
  emitNodeSelection(null)
}

function onRailClick(item) {
  if (consumeRailClickSkip()) return
  addAtCenter(item)
}

/** 对选中条件取反；条件组则德摩根：组逻辑对偶 + 各成员取反 */
function applyInvertToSelection() {
  const selected = nodes.value.find((n) => n.id === props.selectedNodeId)
  if (selected?.data?.kind === 'condition' && selected.data.condition) {
    invertConditionForm(selected.data.condition)
    const s = conditionSummary(selected.data.condition)
    selected.data.label = s.label
    selected.data.detail = s.detail
    nodes.value = [...nodes.value]
    emitNodeSelection(selected)
    emit('hint', '已对该条件取反')
    scheduleCommit()
    return
  }
  if (selected?.data?.kind === 'condition_group') {
    const gid = selected.id
    const condGroupCount = nodes.value.filter((n) => n.data?.kind === 'condition_group').length
    const members = nodes.value.filter((n) => {
      if (n.data?.kind !== 'condition' || !n.data?.condition) return false
      if (n.data.groupId === gid) return true
      // 单条件组时：无 groupId 的孤儿一并纳入取反，并回填归属
      return !n.data.groupId && condGroupCount === 1
    })
    if (!members.length) {
      emit('hint', '条件组内没有条件可取反')
      return
    }
    const logic = selected.data.groupLogic === 'or' ? 'and' : 'or'
    selected.data.groupLogic = logic
    selected.data.detail = logic === 'or' ? '组内任一' : '组内全部'
    for (const m of members) {
      if (!m.data.groupId) m.data.groupId = gid
      invertConditionForm(m.data.condition)
      const s = conditionSummary(m.data.condition)
      m.data.label = s.label
      m.data.detail = s.detail
    }
    nodes.value = [...nodes.value]
    emitNodeSelection(selected)
    emit('hint', '已对条件组取反（组逻辑对偶 + 各条件取反）')
    scheduleCommit()
    return
  }
  emit('hint', '请先选中一个条件或条件组，再点「条件取反」')
}

function addAtCenter(item) {
  addNode(item, { x: 320 + Math.random() * 48, y: 100 + Math.random() * 100 })
}

function addNode(item, position) {
  pushHistory()
  if (item.kind === 'invert') {
    applyInvertToSelection()
    return
  }

  if (item.kind === 'bundle' || item.bundle) {
    addBundle(item, position)
    return
  }

  if (item.kind === 'note') {
    const node = createCanvasNode('note', position, { noteText: '在这里写说明…' })
    nodes.value = [...nodes.value, node]
    emitNodeSelection(node)
    scheduleCommit()
    return
  }

  if (item.kind === 'trigger_group' || item.kind === 'condition_group') {
    const isTrig = item.kind === 'trigger_group'
    const logic =
      item.groupLogic === 'and' || item.groupLogic === 'or'
        ? item.groupLogic
        : isTrig
          ? 'or'
          : 'and'
    const detail = isTrig
      ? logic === 'and'
        ? '组内全部'
        : '组内任一'
      : logic === 'or'
        ? '组内任一'
        : '组内全部'

    // 带明确 groupLogic 的快捷项：已选中同类型组时只改逻辑；空白组始终新建
    const selected = nodes.value.find((n) => n.id === props.selectedNodeId)
    if (item.groupLogic && selected?.data?.kind === item.kind) {
      selected.data.groupLogic = logic
      selected.data.detail = detail
      if (item.label) selected.data.label = item.label
      nodes.value = [...nodes.value]
      emitNodeSelection(selected)
      emit('hint', `已将${isTrig ? '触发组' : '条件组'}设为：${detail}`)
      scheduleCommit()
      return
    }

    const id = `${isTrig ? 'tg' : 'cg'}_${Math.random().toString(36).slice(2, 8)}`
    const node = {
      id,
      type: 'geekGroup',
      position,
      data: {
        kind: item.kind,
        label: item.label || (isTrig ? '触发组' : '条件组'),
        detail,
        groupLogic: logic,
        groupId: id,
      },
    }
    nodes.value = [...nodes.value, node]
    // 组头接入开始，便于后续成员走 开始→组→成员
    if (!edges.value.some((e) => e.source === 'start' && e.target === id)) {
      edges.value = decorateEdges([
        ...edges.value,
        { id: `e-start-${id}`, source: 'start', target: id },
      ])
    }
    emitNodeSelection(node)
    emit(
      'hint',
      isTrig
        ? `已添加触发组（${detail}）：选中它再投放触发，或把触发连到该组`
        : `已添加条件组（${detail}）：选中它再投放条件，或把条件连到该组`,
    )
    scheduleCommit()
    return
  }

  let built
  if (item.kind === 'condition') {
    built = createCanvasNode('condition', position)
    if (item.preset && built.data.condition) {
      applyConditionPreset(built.data.condition, item.preset)
      if (item.varKey) built.data.condition.varKey = item.varKey
      const s = conditionSummary(built.data.condition)
      built.data.label = item.label || s.label
      built.data.detail = s.detail
    } else if (item.label) {
      built.data.label = item.label
    }
  } else if (item.kind === 'trigger' || item.preset) {
    built = createCanvasNode('trigger', position)
  } else {
    built = createCanvasNode('action', position, { actionType: item.actionType })
  }

  // 落入选中组，或自动新建组
  if (built.data.kind === 'trigger' || built.data.kind === 'condition') {
    const want = built.data.kind === 'trigger' ? 'trigger_group' : 'condition_group'
    const selected = nodes.value.find((n) => n.id === props.selectedNodeId)
    let gid =
      selected?.data?.kind === want
        ? selected.id
        : selected?.data?.groupId &&
            nodes.value.find((n) => n.id === selected.data.groupId)?.data?.kind === want
          ? selected.data.groupId
          : nodes.value.find((n) => n.data?.kind === want)?.id
    if (!gid) {
      gid = `${built.data.kind === 'trigger' ? 'tg' : 'cg'}_${Math.random().toString(36).slice(2, 8)}`
      const isTrig = built.data.kind === 'trigger'
      nodes.value = [
        ...nodes.value,
        {
          id: gid,
          type: 'geekGroup',
          position: { x: position.x - 8, y: position.y - 36 },
          data: {
            kind: want,
            label: isTrig ? '触发组' : '条件组',
            detail: isTrig ? '组内任一' : '组内全部',
            groupLogic: isTrig ? 'or' : 'and',
            groupId: gid,
          },
        },
      ]
    }
    built.data.groupId = gid
  }
  const memberEdges = []
  if (
    (built.data.kind === 'trigger' || built.data.kind === 'condition') &&
    built.data.groupId
  ) {
    const gid = built.data.groupId
    if (!edges.value.some((e) => e.source === 'start' && e.target === gid)) {
      memberEdges.push({ id: `e-start-${gid}`, source: 'start', target: gid })
    }
    memberEdges.push({ id: `e-${gid}-${built.id}`, source: gid, target: built.id })
  }
  if (built.data.kind === 'trigger' && item.preset && built.data.trigger) {
    applyTriggerPreset(built.data.trigger, item.preset)
    if (item.varKey) built.data.trigger.varKey = item.varKey
    if (item.varScope) built.data.trigger.varScope = item.varScope
    if (item.key === 'custom_state' && built.data.trigger) {
      built.data.trigger.eventType = built.data.trigger.eventType || 'homeos.custom_state'
    }
    const s = triggerSummary(built.data.trigger)
    built.data.label = item.label || s.label
    built.data.detail = s.detail
  }
  if (built.data.kind === 'condition' && built.data.condition) {
    if (item.varKey) built.data.condition.varKey = item.varKey
    if (item.varScope) built.data.condition.varScope = item.varScope
  }
  if (built.data.kind === 'action' && built.data.action) {
    if (item.varKey) built.data.action.varKey = item.varKey
    if (item.varScope) built.data.action.varScope = item.varScope
    if (item.label) built.data.label = item.label
    if (item.varFromDevice) {
      built.data.action.varOp = 'set'
      built.data.action.varType = 'number'
      built.data.action.varKey = built.data.action.varKey || 'device_value'
      built.data.action.varSourceEntityId = item.varSourceEntityId || ''
      built.data.action.varSourceAttribute = item.varSourceAttribute || ''
      built.data.label = item.label || '查询设备并赋值'
      built.data.detail = built.data.action.varSourceEntityId
        ? `${built.data.action.varSourceEntityId} → ${built.data.action.varKey}`
        : '选择设备后写入变量'
    }
  }
  const scriptLink =
    props.paletteMode === 'script' && built.data.kind === 'action'
      ? findScriptChainTail(built.id)
      : null
  nodes.value = paintNodes([...nodes.value, built])
  if (memberEdges.length) {
    // 有组时走 开始→组→成员；无组时触发仍直连开始
    edges.value = decorateEdges([...edges.value, ...memberEdges])
  } else if (built.data.kind === 'trigger') {
    edges.value = decorateEdges([
      ...edges.value,
      {
        id: `e-start-${built.id}`,
        source: 'start',
        target: built.id,
      },
    ])
  } else if (scriptLink && !edges.value.some((e) => e.target === built.id)) {
    // 脚本：自动接到「开始」或当前动作链尾，避免孤立节点无法保存
    edges.value = decorateEdges([
      ...edges.value,
      {
        id: `e-${scriptLink.source}-${built.id}`,
        source: scriptLink.source,
        target: built.id,
        sourceHandle: scriptLink.sourceHandle,
      },
    ])
  }
  emitNodeSelection(built)
  scheduleCommit()
}

/** 脚本模式：找到可挂接新动作的链尾（优先选中节点；excludeId 为即将加入的节点） */
function findScriptChainTail(excludeId) {
  const actionNodes = (nodes.value || []).filter(
    (n) =>
      n.id !== 'start' &&
      n.id !== excludeId &&
      (n.type === 'geekAction' || n.data?.kind === 'action'),
  )
  if (!actionNodes.length) {
    return { source: 'start', sourceHandle: undefined }
  }
  const selected = nodes.value.find((n) => n.id === props.selectedNodeId)
  if (
    selected &&
    selected.id !== excludeId &&
    (selected.id === 'start' ||
      selected.type === 'geekAction' ||
      selected.data?.kind === 'action')
  ) {
    const t = selected.data?.action?.type
    if (t === 'choose' || t === 'repeat' || t === 'parallel') {
      return { source: selected.id, sourceHandle: 'done' }
    }
    return { source: selected.id, sourceHandle: undefined }
  }
  // 无主链出边的动作优先（链尾）；choose/repeat/parallel 的 then/body/else 不算主链
  const tails = actionNodes.filter((n) => {
    const outs = (edges.value || []).filter((e) => {
      if (e.source !== n.id) return false
      const h = e.sourceHandle
      if (h === 'fail' || h === 'else' || h === 'body') return false
      if (h === 'then' || /^then:\d+$/.test(String(h || ''))) return false
      return true
    })
    return outs.length === 0
  })
  const pick = tails[tails.length - 1] || actionNodes[actionNodes.length - 1]
  if (!pick) return { source: 'start', sourceHandle: undefined }
  const t = pick.data?.action?.type
  if (t === 'choose' || t === 'repeat' || t === 'parallel') {
    return { source: pick.id, sourceHandle: 'done' }
  }
  return { source: pick.id, sourceHandle: undefined }
}

function addBundle(item, position) {
  const baseX = position?.x ?? 320
  const baseY = position?.y ?? 120
  if (item.bundle === 'device_trigger_assign') {
    let tgId = nodes.value.find((n) => n.data?.kind === 'trigger_group')?.id
    const extra = []
    if (!tgId) {
      tgId = `tg_${Math.random().toString(36).slice(2, 8)}`
      extra.push({
        id: tgId,
        type: 'geekGroup',
        position: { x: baseX - 8, y: baseY - 36 },
        data: {
          kind: 'trigger_group',
          label: '触发组',
          detail: '组内任一',
          groupLogic: 'or',
          groupId: tgId,
        },
      })
    }
    const trig = createCanvasNode('trigger', { x: baseX, y: baseY })
    applyTriggerPreset(trig.data.trigger, 'device_any')
    trig.data.groupId = tgId
    trig.data.label = '事件发生或状态更新'
    const s1 = triggerSummary(trig.data.trigger)
    trig.data.detail = s1.detail
    const act = createCanvasNode('action', { x: baseX + 156, y: baseY }, {
      actionType: 'variable_set',
    })
    act.data.action.varOp = 'set'
    act.data.action.varType = 'number'
    act.data.action.varKey = 'device_value'
    act.data.action.varSourceEntityId = ''
    act.data.label = '设备触发赋值'
    act.data.detail = '与触发设备联动写入变量'
    nodes.value = paintNodes([...nodes.value, ...extra, trig, act])
    edges.value = decorateEdges([
      ...edges.value,
      { id: `e-start-${trig.id}`, source: 'start', target: trig.id },
      {
        id: `e-${trig.id}-${act.id}`,
        source: trig.id,
        target: act.id,
      },
    ])
    emitNodeSelection(act)
    emit('hint', '已投放：设备触发 + 写变量。请选同一设备。')
    scheduleCommit()
    return
  }
  if (item.bundle === 'max_n_times') {
    let gid = nodes.value.find((n) => n.data?.kind === 'condition_group')?.id
    const extra = []
    if (!gid) {
      gid = `cg_${Math.random().toString(36).slice(2, 8)}`
      extra.push({
        id: gid,
        type: 'geekGroup',
        position: { x: baseX - 8, y: baseY - 36 },
        data: {
          kind: 'condition_group',
          label: '条件组',
          detail: '组内全部',
          groupLogic: 'and',
          groupId: gid,
        },
      })
    }
    const cond = createCanvasNode('condition', { x: baseX, y: baseY })
    applyConditionPreset(cond.data.condition, 'var_lt')
    cond.data.condition.varKey = 'run_count'
    cond.data.condition.state = '5'
    cond.data.groupId = gid
    cond.data.label = '最多触发指定次数'
    const sc = conditionSummary(cond.data.condition)
    cond.data.detail = sc.detail
    const act = createCanvasNode('action', { x: baseX + 156, y: baseY }, {
      actionType: 'variable_set',
    })
    act.data.action.varKey = 'run_count'
    act.data.action.varScope = 'global'
    act.data.action.varOp = 'add'
    act.data.action.varType = 'number'
    act.data.action.varValue = '1'
    act.data.label = '计数 +1'
    act.data.detail = actionSummary(act.data.action)

    // 接到已有触发出口，否则从开始进入，保证保存校验可达
    const outs = new Map()
    for (const e of edges.value) {
      if (!outs.has(e.source)) outs.set(e.source, [])
      outs.get(e.source).push(e.target)
    }
    const reach = new Set()
    const stack = ['start']
    while (stack.length) {
      const id = stack.pop()
      if (reach.has(id)) continue
      reach.add(id)
      for (const t of outs.get(id) || []) stack.push(t)
    }
    const attachFrom =
      [...nodes.value]
        .reverse()
        .find((n) => n.data?.kind === 'trigger' && reach.has(n.id))?.id || 'start'

    nodes.value = paintNodes([...nodes.value, ...extra, cond, act])
    edges.value = decorateEdges([
      ...edges.value,
      { id: `e-${attachFrom}-${cond.id}`, source: attachFrom, target: cond.id },
      {
        id: `e-${cond.id}-${act.id}`,
        source: cond.id,
        target: act.id,
        sourceHandle: 'pass',
      },
    ])
    emitNodeSelection(cond)
    emit('hint', '已投放：run_count < 5 时继续，并自增计数。可在设置里改阈值。')
    scheduleCommit()
  }
}

function relayout() {
  pushHistory()
  const noteNodes = nodes.value.filter((n) => n.data?.kind === 'note')
  const g = syncGraphFromCanvas(props.graph, nodes.value, edges.value)
  if (!Array.isArray(g.actions)) g.actions = []
  const { nodes: laidNodes, edges: laidEdges } = layoutCanvasFromGraph(g)

  // 注释不参与主流程排版，靠右保留
  const maxX = laidNodes.reduce((m, n) => Math.max(m, Number(n.position?.x) || 0), 0) + 200
  let noteY = 40
  for (const note of noteNodes) {
    laidNodes.push({
      ...note,
      position: { x: maxX, y: noteY },
      selected: false,
    })
    noteY += 88
  }

  syncingFromProps = true
  nodes.value = paintNodes(sanitizeLaidNodes(laidNodes))
  edges.value = decorateEdges(laidEdges)
  syncingFromProps = false
  scheduleCommit()
  void safeFitView()
}

function collectContainerDescendantIds(rootId) {
  const t = nodes.value.find((n) => n.id === rootId)?.data?.action?.type
  if (t !== 'choose' && t !== 'repeat' && t !== 'parallel') return new Set()
  const out = new Set()
  const stack = []
  for (const e of edges.value) {
    if (e.source !== rootId) continue
    const h = e.sourceHandle == null || e.sourceHandle === '' ? 'out' : String(e.sourceHandle)
    if (h === 'done' || h === 'fail') continue
    stack.push(e.target)
  }
  while (stack.length) {
    const id = stack.pop()
    if (!id || out.has(id) || id === rootId) continue
    out.add(id)
    for (const e of edges.value) {
      if (e.source !== id) continue
      stack.push(e.target)
    }
  }
  return out
}

function removeSelected() {
  pushHistory()
  if (selectedEdgeId.value) {
    edges.value = edges.value.filter((e) => e.id !== selectedEdgeId.value)
    selectedEdgeId.value = null
    scheduleCommit()
    return
  }
  const id = props.selectedNodeId
  if (!id || id === 'start') return
  const target = nodes.value.find((n) => n.id === id)
  let nextNodes = nodes.value
  if (
    target?.data?.kind === 'trigger_group' ||
    target?.data?.kind === 'condition_group'
  ) {
    const reassigned = reassignMembersAfterGroupDelete(nextNodes, id)
    nextNodes = reassigned.nodes
    if (reassigned.moved > 0) {
      emit(
        'hint',
        reassigned.fallbackGroupId
          ? `已删除组，${reassigned.moved} 个成员已并入其余组`
          : `已删除组，${reassigned.moved} 个成员待重新归组`,
      )
    }
  }
  // choose/repeat/parallel：一并删除分支子图，避免孤立动作无法保存
  const cascade = collectContainerDescendantIds(id)
  const removeIds = new Set([id, ...cascade])
  nodes.value = paintNodes(nextNodes.filter((n) => !removeIds.has(n.id)))
  edges.value = edges.value.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target))
  if (cascade.size) {
    emit('hint', `已删除节点及 ${cascade.size} 个分支内动作`)
  }
  emitNodeSelection(null)
  scheduleCommit()
}

function copySelectedNode() {
  const id = props.selectedNodeId
  if (!id || id === 'start') return false
  const node = nodes.value.find((n) => n.id === id)
  if (!node) return false
  if (node.data?.kind === 'trigger_group' || node.data?.kind === 'condition_group') {
    emit('hint', '组节点请用左侧投放栏新建；可复制组内的触发/条件节点')
    return false
  }
  setGeekNodeClipboard(node)
  emit('hint', `已复制「${node.data?.label || '节点'}」，Ctrl+V 粘贴`)
  return true
}

function pasteClipboardNode() {
  const clip = getGeekNodeClipboard()
  if (!clip) {
    emit('hint', '剪贴板为空，请先选中节点后 Ctrl+C')
    return false
  }
  pushHistory()
  const clone = cloneGeekCanvasNode(clip)
  if (!clone) {
    emit('hint', '无法粘贴该类型节点')
    return false
  }
  // 组已不存在时挂到同类型剩余组
  if (
    (clone.data.kind === 'trigger' || clone.data.kind === 'condition') &&
    clone.data.groupId &&
    !nodes.value.some((n) => n.id === clone.data.groupId)
  ) {
    const want = clone.data.kind === 'trigger' ? 'trigger_group' : 'condition_group'
    clone.data.groupId = nodes.value.find((n) => n.data?.kind === want)?.id
  }
  if (
    (clone.data.kind === 'trigger' || clone.data.kind === 'condition') &&
    !clone.data.groupId
  ) {
    const want = clone.data.kind === 'trigger' ? 'trigger_group' : 'condition_group'
    let gid = nodes.value.find((n) => n.data?.kind === want)?.id
    if (!gid) {
      gid = `${clone.data.kind === 'trigger' ? 'tg' : 'cg'}_${Math.random().toString(36).slice(2, 8)}`
      nodes.value = paintNodes([
        ...nodes.value,
        {
          id: gid,
          type: 'geekGroup',
          position: {
            x: (clone.position?.x || 0) - 8,
            y: (clone.position?.y || 0) - 36,
          },
          data: {
            kind: want,
            label: clone.data.kind === 'trigger' ? '触发组' : '条件组',
            detail: clone.data.kind === 'trigger' ? '组内任一' : '组内全部',
            groupLogic: clone.data.kind === 'trigger' ? 'or' : 'and',
            groupId: gid,
          },
        },
      ])
    }
    clone.data.groupId = gid
  }
  const scriptLink =
    props.paletteMode === 'script' && clone.data.kind === 'action'
      ? findScriptChainTail(clone.id)
      : null
  nodes.value = paintNodes([...nodes.value, clone])
  if (clone.data.kind === 'trigger') {
    edges.value = decorateEdges([
      ...edges.value,
      { id: `e-start-${clone.id}`, source: 'start', target: clone.id },
    ])
  } else if (scriptLink && !edges.value.some((e) => e.target === clone.id)) {
    edges.value = decorateEdges([
      ...edges.value,
      {
        id: `e-${scriptLink.source}-${clone.id}`,
        source: scriptLink.source,
        target: clone.id,
        sourceHandle: scriptLink.sourceHandle,
      },
    ])
  }
  // 连续粘贴时错开：更新剪贴板锚点位置
  setGeekNodeClipboard({
    ...clip,
    position: {
      x: Number(clone.position?.x) || 0,
      y: Number(clone.position?.y) || 0,
    },
  })
  emitNodeSelection(clone)
  emit('hint', `已粘贴「${clone.data?.label || '节点'}」`)
  scheduleCommit()
  return true
}

function onKeyDown(ev) {
  const root = canvasRootRef.value
  // 仅画布聚焦或其子树内响应，避免全局 Delete 误删
  if (root && document.activeElement && !root.contains(document.activeElement)) return
  const tag = (ev.target && ev.target.tagName) || ''
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
  if (ev.target?.isContentEditable) return
  const mod = ev.ctrlKey || ev.metaKey
  if (ev.key === 'Escape') {
    emit('update:selectedNodeId', null)
    emit('select', null)
    return
  }
  if (mod && ev.key === 'z') {
    ev.preventDefault()
    if (ev.shiftKey) redo()
    else undo()
    return
  }
  if (mod && (ev.key === 'y' || ev.key === 'Y')) {
    ev.preventDefault()
    redo()
    return
  }
  if (mod && (ev.key === 'c' || ev.key === 'C')) {
    if (copySelectedNode()) ev.preventDefault()
    return
  }
  if (mod && (ev.key === 'v' || ev.key === 'V')) {
    if (pasteClipboardNode()) ev.preventDefault()
    return
  }
  if (!mod && (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp')) {
    ev.preventDefault()
    cycleSelectedNode(-1)
    return
  }
  if (!mod && (ev.key === 'ArrowRight' || ev.key === 'ArrowDown')) {
    ev.preventDefault()
    cycleSelectedNode(1)
    return
  }
  if (ev.key !== 'Delete' && ev.key !== 'Backspace') return
  if (!props.selectedNodeId) return
  ev.preventDefault()
  removeSelected()
}

function cycleSelectedNode(dir) {
  const list = nodes.value.filter((n) => n.id && n.type !== 'geekStart')
  if (!list.length) return
  const cur = props.selectedNodeId
  let idx = list.findIndex((n) => n.id === cur)
  if (idx < 0) idx = dir > 0 ? -1 : 0
  const next = list[(idx + dir + list.length) % list.length]
  if (!next) return
  emit('update:selectedNodeId', next.id)
  emit('select', next)
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})

function validate() {
  return validateGeekCanvasConnectivity(nodes.value, edges.value, {
    mode: props.paletteMode === 'script' ? 'script' : 'automation',
  })
}

defineExpose({
  removeSelected,
  relayout,
  commit,
  validate,
  addAtCenter,
  addNode,
  getNodeData,
  patchNodeData,
  copySelectedNode,
  pasteClipboardNode,
  undo,
  redo,
  canUndo,
  canRedo,
})
</script>

<style scoped>
.geek-canvas__rail-section + .geek-canvas__rail-section,
.geek-canvas-shell__rail-section + .geek-canvas-shell__rail-section {
  margin-top: 10px;
}
@media (hover: hover) {
  .geek-canvas__rail-group:hover {
    background: rgba(95, 212, 255, 0.08);
    color: rgba(241, 247, 251, 0.9);
  }
}
.geek-canvas__rail-items {
  gap: 2px;
  margin-top: 4px;
}
:deep(.geek-canvas.is-rail-collapsed) .geek-canvas__rail-items {
  align-items: center;
}
.geek-canvas__rail-item {
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.geek-canvas__rail-item span {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.geek-canvas__rail-item.is-ha-only {
  opacity: 0.92;
}
.geek-canvas__rail-ha {
  flex: 0 0 auto;
  margin: 0;
  padding: 1px 5px;
  border-radius: var(--hos-radius-pill);
  font-size: var(--premium-fs-micro);
  font-style: normal;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #fde68a;
  background: rgba(245, 158, 11, 0.22);
  border: 1px solid rgba(251, 191, 36, 0.35);
}
.geek-canvas__rail-item i {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  font-style: normal;
  font-size: var(--premium-fs-caption);
  background: rgba(96, 165, 250, 0.16);
  color: #93c5fd;
}
.geek-canvas__rail-item[data-kind='trigger'] i {
  background: rgba(52, 211, 153, 0.16);
  color: #6ee7b7;
}
.geek-canvas__rail-item[data-kind='condition'] i {
  background: rgba(56, 189, 248, 0.16);
  color: #7dd3fc;
}
.geek-canvas__rail-item[data-kind='action'] i {
  background: rgba(251, 191, 36, 0.16);
  color: #fcd34d;
}
.geek-canvas__rail-item[data-kind='settings'] i {
  background: rgba(167, 139, 250, 0.16);
  color: #c4b5fd;
}
.geek-canvas__rail-item[data-kind='invert'] i {
  background: rgba(251, 146, 60, 0.18);
  color: #fdba74;
}
.geek-canvas__rail-item[data-kind='bundle'] i {
  background: rgba(244, 114, 182, 0.16);
  color: #f9a8d4;
}
.geek-canvas__empty {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgba(148, 163, 184, 0.85);
  text-align: center;
  pointer-events: none;
}
.geek-canvas__empty p {
  margin: 0;
  font-size: var(--premium-fs-body);
  font-weight: 600;
  color: rgba(226, 232, 240, 0.9);
}
.geek-canvas__empty span {
  font-size: var(--premium-fs-micro);
}
</style>
