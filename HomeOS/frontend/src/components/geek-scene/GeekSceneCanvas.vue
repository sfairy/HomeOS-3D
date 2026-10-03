<!--
  GeekSceneCanvas.vue
  职责：geek-scene 场景编辑器的「星形画布」组件，基于 VueFlow 实现。
       左侧实体投放栏（空实体/批量添加）+ 全幅舞台 + sceneRoot 居中、实体圆周分布的节点布局。
       支持搜索定位、Ctrl+多选、Del 删除、←→ 切换选中、右键菜单、DnD 拖拽投放。
  所属模块：geek-scene。
  关键依赖：
    - @vue-flow/core（VueFlow / useVueFlow）：节点画布主体。
    - @vue-flow/background / @vue-flow/controls：背景网格与缩放控件。
    - GeekCanvasShell：左投放栏 + 舞台外壳。
    - GeekSceneNode：自定义节点渲染（sceneRoot / sceneEntity）。
    - useGeekPaletteDnd：投放拖拽；useExclusiveDropdown：右键菜单独占。
    - useVueFlowParentScaleFix / safeGeekFitView：缩放与自适应适配。
    - geek-scene/layout（ensureSceneGraphLayout）：图 ↔ 画布互转与星形布局。
    - entities.store：实体显示名解析。
  Props：
    - graph：场景图数据（含 sceneRoot 与 entities 列表）。
    - selectedNodeId：当前选中节点 id（双向）。
    - allowPasteYaml：是否允许「粘贴 YAML」入口。
  Emits：
    - update:graph / update:selectedNodeId：图与选中节点变更。
    - select-entity / update:multi-count / remove-entities / copy-selected / paste-entity / duplicate-selected：选中与多选/复制/粘贴/删除。
    - add-entity / open-batch / open-paste-yaml：投放栏动作。
    - clear-selection / hint：清空选中与提示。
  关键交互：
    - 投放栏 pointerdown 启动 DnD，click 触发 rail 模式插入；空画布提供 CTA 按钮。
    - 搜索框匹配实体名/ID，Enter 跳到下一个匹配并高亮 searchHit。
    - 节点点击单选、Ctrl+点击多选、Del 删除、←→ 在实体间切换、空白点击取消选中。
    - 右键菜单（节点/边/空白）通过 Teleport 渲染到合适容器。
    - defineExpose 暴露画布操作能力，供父组件命令式调用。
-->
<template>
  <GeekCanvasShell
    root-class="geek-scene-canvas"
    :set-stage-ref="bindStageRef"
    rail-aria-label="添加实体"
    rail-title="实体"
    tip="Del 删除 · Ctrl+点多选 · ←→ 切换 · 右键菜单"
    storage-key="homeos.geek.scene.railCollapsed"
    :hydrate-on-mount="true"
    tabindex="0"
    @layout="relayout"
  >
    <template #rail="{ collapsed }">
      <section class="geek-canvas-shell__rail-section">
        <em v-if="collapsed" class="geek-canvas-shell__rail-group-mini" title="添加">添</em>
        <p v-else class="geek-canvas-shell__rail-group-label">{{ '添加' }}</p>
        <div class="geek-canvas-shell__rail-items geek-scene-canvas__rail-items">
          <button
            v-for="item in railItems"
            :key="item.key"
            type="button"
            class="geek-canvas-shell__rail-item geek-scene-canvas__rail-item"
            :data-kind="item.kind"
            :title="item.title"
            @pointerdown="onPalettePointerDown($event, item)"
            @click="onRailClick(item)"
          >
            <i>{{ item.badge }}</i>
            <span v-if="!collapsed">{{ item.label }}</span>
          </button>
        </div>
      </section>
    </template>

    <template #main-before>
      <div v-if="graph.entities.length" class="geek-scene-canvas__search">
        <input
          v-model="searchQuery"
          type="search"
          class="geek-scene-canvas__search-input"
          :placeholder="'搜索实体名 / ID'"
          @keydown.enter.prevent="focusNextSearchHit"
        />
        <span v-if="searchQuery.trim()" class="geek-scene-canvas__search-meta">
          {{ searchHits.length ? `${searchHitIndex + 1}/${searchHits.length}` : '无匹配' }}
        </span>
        <button
          v-if="searchHits.length > 1"
          type="button"
          class="geek-scene-canvas__search-next"
          title="下一个匹配"
          @click="focusNextSearchHit"
        >
          {{ '下一个' }}
        </button>
      </div>
    </template>

    <div v-if="!graph.entities.length" class="geek-scene-canvas__empty">
      <p class="geek-scene-canvas__empty-hint">
        {{ '从左侧投放实体，或批量添加 / 粘贴 YAML' }}
      </p>
      <div class="geek-scene-canvas__empty-actions">
        <button type="button" class="geek-scene-canvas__cta" @click="emitAddEntity()">
          {{ '添加实体' }}
        </button>
        <button type="button" class="geek-scene-canvas__cta" @click="emit('open-batch')">
          {{ '批量添加' }}
        </button>
        <button
          v-if="allowPasteYaml"
          type="button"
          class="geek-scene-canvas__cta geek-scene-canvas__cta--ghost"
          @click="emit('open-paste-yaml')"
        >
          {{ '粘贴 YAML' }}
        </button>
      </div>
    </div>
    <VueFlow
      :id="flowId"
      v-model:nodes="nodes"
      v-model:edges="edges"
      :node-types="nodeTypes"
      :default-viewport="{ zoom: 0.85, x: 24, y: 24 }"
      :min-zoom="0.35"
      :max-zoom="1.4"
      :snap-to-grid="true"
      :snap-grid="[12, 12]"
      :nodes-connectable="false"
      :edges-updatable="false"
      :nodes-draggable="!dnd.active"
      :fit-view-on-init="true"
      :selection-key-code="false"
      :multi-selection-key-code="false"
      @node-click="onNodeClick"
      @pane-click="onPaneClick"
      @node-context-menu="onNodeContextMenu"
      @pane-context-menu="onPaneContextMenu"
      @node-drag-stop="onDragStop"
    >
      <Background :gap="20" :size="1" pattern-color="rgba(95, 212, 255, 0.09)" />
      <Controls position="top-right" />
    </VueFlow>

    <template #overlay>
      <Teleport to="body">
        <div
          v-if="dnd.active && dnd.item"
          class="geek-dnd-ghost"
          :data-kind="dnd.item.kind || 'entity'"
          :style="{ transform: `translate(${dnd.x}px, ${dnd.y}px) translate(-50%, -50%)` }"
        >
          <i>{{ dnd.item.badge || '◎' }}</i>
          <span>{{ dnd.item.label || '实体' }}</span>
        </div>
      </Teleport>

      <Teleport :to="ctxTeleportTo" :disabled="ctxTeleportDisabled">
        <div
          v-if="ctx.open"
          class="geek-scene-ctx-overlay"
          @click="closeCtx"
          @contextmenu.prevent="closeCtx"
        >
          <div
            class="geek-scene-ctx"
            :style="{ left: `${ctx.x}px`, top: `${ctx.y}px` }"
            role="menu"
            @click.stop
          >
            <template v-if="ctx.kind === 'entity'">
              <button type="button" class="geek-scene-ctx__item" @click="ctxAct('configure')">
                {{ '配置' }}
              </button>
              <button type="button" class="geek-scene-ctx__item" @click="ctxAct('copy')">
                {{ '复制' }}
              </button>
              <button type="button" class="geek-scene-ctx__item" @click="ctxAct('duplicate')">
                {{ '再制' }}
              </button>
              <button type="button" class="geek-scene-ctx__item" @click="ctxAct('focus')">
                {{ '定位' }}
              </button>
              <button
                type="button"
                class="geek-scene-ctx__item geek-scene-ctx__item--danger"
                @click="ctxAct('delete')"
              >
                {{ multiCount > 1 ? `删除 ${multiCount} 个` : '删除' }}
              </button>
            </template>
            <template v-else>
              <button type="button" class="geek-scene-ctx__item" @click="ctxAct('add')">
                {{ '添加实体' }}
              </button>
              <button type="button" class="geek-scene-ctx__item" @click="ctxAct('paste')">
                {{ '粘贴' }}
              </button>
              <button type="button" class="geek-scene-ctx__item" @click="ctxAct('batch')">
                {{ '批量添加' }}
              </button>
              <button
                v-if="allowPasteYaml"
                type="button"
                class="geek-scene-ctx__item"
                @click="ctxAct('yaml')"
              >
                {{ '粘贴 YAML' }}
              </button>
            </template>
          </div>
        </div>
      </Teleport>
    </template>
  </GeekCanvasShell>
</template>

<script setup>
import { computed, getCurrentInstance, markRaw, ref, watch, onMounted, onUnmounted, reactive, toRef } from 'vue'
import { useExclusiveDropdown } from '@/composables/ui/useExclusiveDropdown'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@/components/geek-automation/styles/geek-dnd-ghost.css'
import GeekCanvasShell from '@/components/geek-automation/GeekCanvasShell.vue'
import GeekSceneNode from './GeekSceneNode.vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useVueFlowParentScaleFix } from '@/composables/ui/useVueFlowParentScaleFix'
import { useGeekPaletteDnd } from '@/composables/orchestrator/useGeekPaletteDnd'
import { safeGeekFitView } from '@/composables/orchestrator/safeGeekFitView'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { ensureSceneGraphLayout } from '@/utils/geek-scene/layout'
import {
  viewportPointToPopupAnchor,
} from '@/composables/ui/usePopupPosition'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
import { getTeleportContainerSize } from '@/utils/ui/popup-position-shared.util'

const DEFAULT_VIEWPORT = { x: 24, y: 24, zoom: 0.85 }

const props = defineProps({
  graph: { type: Object, required: true },
  selectedNodeId: { type: String, default: null },
  allowPasteYaml: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:graph',
  'update:selectedNodeId',
  'select-entity',
  'update:multi-count',
  'remove-entities',
  'copy-selected',
  'paste-entity',
  'duplicate-selected',
  'add-entity',
  'open-batch',
  'open-paste-yaml',
  'clear-selection',
  'hint',
])

const entitiesStore = useEntitiesStore()
const nodeTypes = { sceneNode: markRaw(GeekSceneNode) }
const nodes = ref([])
const edges = ref([])
const syncing = ref(false)
const stageRef = ref(null)
function bindStageRef(el) {
  stageRef.value = el || null
}
const searchQuery = ref('')
const searchHitIndex = ref(0)
/** 多选节点 id（含主选中） */
const multiIds = ref([])
const ctx = reactive({
  open: false,
  x: 0,
  y: 0,
  kind: 'pane',
  nodeId: null,
})
useExclusiveDropdown(toRef(ctx, 'open'))
const { teleportTarget: ctxTeleportTo, shellTeleportPending, refreshShellTeleport } =
  useShellTeleportTarget()
const ctxTeleportDisabled = shellTeleportPending

const railItems = [
  {
    key: 'empty',
    kind: 'entity',
    badge: '◎',
    label: '空实体',
    title: '点击添加，或拖到画布落点',
    action: 'add',
  },
  {
    key: 'batch',
    kind: 'batch',
    badge: '⊞',
    label: '批量添加',
    title: '从设备列表批量加入',
    action: 'batch',
  },
]

/** 实例级 store id，避免 KeepAlive / 重挂载时与全局固定 id 抢销毁 */
const flowId = `geek-scene-flow-${getCurrentInstance()?.uid ?? 0}`
const { fitView, getNodes, viewport, setViewport, screenToFlowCoordinate } =
  useVueFlow(flowId)
const { screenToFlow, refresh: refreshFlowScaleFix } = useVueFlowParentScaleFix(flowId)

const { dnd, onPalettePointerDown, consumeRailClickSkip } = useGeekPaletteDnd({
  stageRef,
  screenToFlow,
  screenToFlowCoordinate,
  viewport,
  canStart: (item) => item.action === 'add',
  onDrop: (_item, pos) => emitAddEntity(pos),
  dropOffset: { w: 180, h: 72 },
})

function nodeMatchesQuery(node, q) {
  if (!q || node?.data?.kind !== 'sceneEntity') return false
  const eid = String(node.data?.entityId || '').toLowerCase()
  const label = String(node.data?.label || '').toLowerCase()
  const live = eid ? entitiesStore.entities?.[eid] : null
  const name = eid ? String(getEntityDisplayName(eid, live) || '').toLowerCase() : ''
  return eid.includes(q) || label.includes(q) || name.includes(q)
}

function withSearchFlags(list) {
  const q = searchQuery.value.trim().toLowerCase()
  return (list || []).map((n) => {
    const hit = Boolean(q && nodeMatchesQuery(n, q))
    if (Boolean(n.data?.searchHit) === hit) return n
    return { ...n, data: { ...n.data, searchHit: hit } }
  })
}

const searchHits = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return []
  return (nodes.value || []).filter((n) => nodeMatchesQuery(n, q)).map((n) => n.id)
})

const multiCount = computed(() => {
  return multiIds.value.filter((id) => {
    const n = nodes.value.find((x) => x.id === id)
    return n?.data?.kind === 'sceneEntity'
  }).length
})

function selectionSet() {
  const set = new Set(multiIds.value)
  if (props.selectedNodeId) set.add(props.selectedNodeId)
  return set
}

function emitMultiCount() {
  emit('update:multi-count', multiCount.value)
}

function applySelectionFlags(list) {
  const set = selectionSet()
  return (list || []).map((n) => ({
    ...n,
    selected: set.has(n.id),
  }))
}

function syncFromGraph() {
  syncing.value = true
  const g = props.graph
  const laid = g.flowNodes?.length ? g : ensureSceneGraphLayout(g)
  const valid = new Set((laid.flowNodes || []).map((n) => n.id))
  multiIds.value = multiIds.value.filter((id) => valid.has(id))
  const base = applySelectionFlags(laid.flowNodes || [])
  nodes.value = withSearchFlags(base)
  edges.value = [...(laid.flowEdges || [])]
  syncing.value = false
  emitMultiCount()
}

function setPrimarySelection(nodeId, entityIndex) {
  emit('update:selectedNodeId', nodeId)
  emit('select-entity', entityIndex)
}

function setExclusiveSelection(nodeId, entityIndex) {
  multiIds.value = nodeId ? [nodeId] : []
  setPrimarySelection(nodeId, entityIndex)
  nodes.value = applySelectionFlags(nodes.value)
  emitMultiCount()
}

function toggleMultiSelection(nodeId, entityIndex) {
  const set = new Set(multiIds.value)
  if (props.selectedNodeId) set.add(props.selectedNodeId)
  if (set.has(nodeId)) {
    set.delete(nodeId)
    multiIds.value = [...set]
    if (props.selectedNodeId === nodeId) {
      const next = multiIds.value.find((id) => {
        const n = nodes.value.find((x) => x.id === id)
        return n?.data?.kind === 'sceneEntity'
      })
      if (next) {
        const n = nodes.value.find((x) => x.id === next)
        setPrimarySelection(next, n?.data?.entityIndex ?? null)
      } else {
        setPrimarySelection(null, null)
      }
    }
  } else {
    set.add(nodeId)
    multiIds.value = [...set]
    setPrimarySelection(nodeId, entityIndex)
  }
  nodes.value = applySelectionFlags(nodes.value)
  emitMultiCount()
}

function getSelectedEntityIndices() {
  const set = selectionSet()
  const indices = []
  for (const n of nodes.value) {
    if (!set.has(n.id) || n.data?.kind !== 'sceneEntity') continue
    if (n.data.entityIndex != null) indices.push(n.data.entityIndex)
  }
  return indices.sort((a, b) => a - b)
}

function closeCtx() {
  ctx.open = false
  ctx.nodeId = null
}

function openCtx(ev, kind, nodeId = null) {
  ev?.preventDefault?.()
  ev?.stopPropagation?.()
  refreshShellTeleport()
  const pad = 8
  const w = 168
  const h = kind === 'entity' ? 220 : 180
  const { cw, ch } = getTeleportContainerSize()
  const { anchorX, anchorY } = viewportPointToPopupAnchor(
    Number(ev?.clientX || 0),
    Number(ev?.clientY || 0),
  )
  let x = anchorX
  let y = anchorY
  if (x + w > cw - pad) x = cw - w - pad
  if (y + h > ch - pad) y = ch - h - pad
  ctx.open = true
  ctx.x = Math.max(pad, x)
  ctx.y = Math.max(pad, y)
  ctx.kind = kind
  ctx.nodeId = nodeId
}

function onNodeContextMenu({ event, node }) {
  if (node?.data?.kind === 'sceneEntity') {
    const set = selectionSet()
    if (!set.has(node.id)) {
      setExclusiveSelection(node.id, node.data.entityIndex ?? null)
    } else {
      setPrimarySelection(node.id, node.data.entityIndex ?? null)
    }
    openCtx(event, 'entity', node.id)
    return
  }
  openCtx(event, 'pane', null)
}

function onPaneContextMenu({ event }) {
  openCtx(event, 'pane', null)
}

function ctxAct(action) {
  const nodeId = ctx.nodeId
  closeCtx()
  if (action === 'configure' && nodeId) {
    focusNode(nodeId)
    return
  }
  if (action === 'copy') {
    emit('copy-selected')
    return
  }
  if (action === 'duplicate') {
    emit('duplicate-selected')
    return
  }
  if (action === 'focus' && nodeId) {
    focusNode(nodeId)
    return
  }
  if (action === 'delete') {
    removeSelected()
    return
  }
  if (action === 'add') {
    emitAddEntity()
    return
  }
  if (action === 'paste') {
    emit('paste-entity')
    return
  }
  if (action === 'batch') {
    emit('open-batch')
    return
  }
  if (action === 'yaml') {
    emit('open-paste-yaml')
  }
}

function entityNodesSorted() {
  return (nodes.value || [])
    .filter((n) => n.data?.kind === 'sceneEntity')
    .slice()
    .sort((a, b) => Number(a.data?.entityIndex ?? 0) - Number(b.data?.entityIndex ?? 0))
}

function cycleEntity(delta) {
  const list = entityNodesSorted()
  if (!list.length) return
  const curId = props.selectedNodeId
  let idx = list.findIndex((n) => n.id === curId)
  if (idx < 0) idx = delta > 0 ? -1 : 0
  const next = list[(idx + delta + list.length) % list.length]
  if (!next) return
  setExclusiveSelection(next.id, next.data?.entityIndex ?? null)
  void safeFitView({ nodeIds: [next.id], padding: 0.45, maxZoom: 1.15 })
}

function commitLayoutPositions() {
  if (syncing.value) return
  const g = { ...props.graph }
  g.flowNodes = nodes.value.map((n) => ({
    id: n.id,
    type: n.type,
    position: { ...n.position },
    data: { ...n.data, searchHit: undefined },
    draggable: n.draggable,
  }))
  g.flowEdges = edges.value.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    animated: e.animated,
  }))
  emit('update:graph', g)
}

async function safeFitView(opts = {}) {
  await safeGeekFitView({
    stageEl: stageRef.value,
    nodes: nodes.value,
    getNodes,
    fitView,
    setViewport,
    viewport,
    refreshScaleFix: refreshFlowScaleFix,
    defaultViewport: DEFAULT_VIEWPORT,
    requirePositiveZoom: false,
    fit: {
      padding: opts.padding ?? 0.22,
      duration: opts.duration ?? 220,
      maxZoom: opts.maxZoom ?? 1.05,
      ...(opts.nodeIds?.length ? { nodeIds: opts.nodeIds } : {}),
    },
  })
}

function relayout() {
  const next = ensureSceneGraphLayout(props.graph)
  emit('update:graph', next)
  void safeFitView()
  emit('hint', '已重新排版')
}

function onNodeClick({ node, event }) {
  closeCtx()
  if (node.data?.kind === 'sceneEntity' && node.data.entityIndex != null) {
    const mod = event?.ctrlKey || event?.metaKey
    if (mod) {
      toggleMultiSelection(node.id, node.data.entityIndex)
    } else {
      setExclusiveSelection(node.id, node.data.entityIndex)
    }
    return
  }
  setExclusiveSelection(node.id, null)
}

function onPaneClick() {
  closeCtx()
  multiIds.value = []
  setPrimarySelection(null, null)
  nodes.value = applySelectionFlags(nodes.value)
  emitMultiCount()
}

function onDragStop() {
  commitLayoutPositions()
}

function selectedIsEntity() {
  const id = props.selectedNodeId
  if (!id || id === 'scene_root') return false
  const node = nodes.value.find((n) => n.id === id)
  return node?.data?.kind === 'sceneEntity'
}

function removeSelected() {
  const indices = getSelectedEntityIndices()
  if (!indices.length) {
    emit('hint', '请先选中实体节点', false)
    return false
  }
  emit('remove-entities', indices)
  multiIds.value = []
  emitMultiCount()
  return true
}

function focusNode(nodeId) {
  if (!nodeId) return
  const node = nodes.value.find((n) => n.id === nodeId)
  if (node?.data?.kind === 'sceneEntity') {
    setExclusiveSelection(nodeId, node.data.entityIndex ?? null)
  } else {
    setExclusiveSelection(nodeId, null)
  }
  void safeFitView({ nodeIds: [nodeId], padding: 0.45, maxZoom: 1.15 })
}

function selectAllEntities() {
  const list = entityNodesSorted()
  if (!list.length) {
    emit('hint', '暂无实体可全选', false)
    return
  }
  multiIds.value = list.map((n) => n.id)
  const primary = list[list.length - 1]
  setPrimarySelection(primary.id, primary.data?.entityIndex ?? null)
  nodes.value = applySelectionFlags(nodes.value)
  emitMultiCount()
  emit('hint', `已选中 ${list.length} 个实体`)
}

function focusNextSearchHit() {
  const hits = searchHits.value
  if (!hits.length) {
    emit('hint', '没有匹配的实体', false)
    return
  }
  searchHitIndex.value = (searchHitIndex.value + 1) % hits.length
  focusNode(hits[searchHitIndex.value])
}

function emitAddEntity(position) {
  emit('add-entity', position || null)
}

function onRailClick(item) {
  if (consumeRailClickSkip()) return
  if (item.action === 'batch') {
    emit('open-batch')
    return
  }
  if (item.action === 'add') {
    emitAddEntity()
  }
}

function onKeyDown(ev) {
  const tag = (ev.target && ev.target.tagName) || ''
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
  if (ev.target?.isContentEditable) return
  const mod = ev.ctrlKey || ev.metaKey
  if (ev.key === 'Escape') {
    closeCtx()
    multiIds.value = []
    emit('clear-selection')
    nodes.value = applySelectionFlags(nodes.value)
    emitMultiCount()
    return
  }
  if (mod && (ev.key === 'a' || ev.key === 'A')) {
    ev.preventDefault()
    selectAllEntities()
    return
  }
  if (mod && (ev.key === 'c' || ev.key === 'C')) {
    if (selectedIsEntity() || multiCount.value > 0) {
      ev.preventDefault()
      emit('copy-selected')
    }
    return
  }
  if (mod && (ev.key === 'v' || ev.key === 'V')) {
    ev.preventDefault()
    emit('paste-entity')
    return
  }
  if (mod && (ev.key === 'd' || ev.key === 'D')) {
    if (selectedIsEntity()) {
      ev.preventDefault()
      emit('duplicate-selected')
    }
    return
  }
  if (!mod && (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp')) {
    ev.preventDefault()
    cycleEntity(-1)
    return
  }
  if (!mod && (ev.key === 'ArrowRight' || ev.key === 'ArrowDown')) {
    ev.preventDefault()
    cycleEntity(1)
    return
  }
  if (ev.key !== 'Delete' && ev.key !== 'Backspace') return
  if (!selectedIsEntity() && multiCount.value < 1) return
  ev.preventDefault()
  removeSelected()
}

watch(
  () => [
    props.graph.entities,
    props.graph.entities?.map((e) => e?.entityId).join('\0'),
    props.graph.name,
    props.graph.flowNodes?.length,
    props.graph.flowEdges,
  ],
  () => syncFromGraph(),
  { deep: true, immediate: true },
)

watch(
  () => props.selectedNodeId,
  (id) => {
    if (id && !multiIds.value.includes(id)) {
      multiIds.value = [id]
    }
    if (!id) multiIds.value = []
    nodes.value = applySelectionFlags(nodes.value)
    emitMultiCount()
  },
)

watch(searchQuery, () => {
  searchHitIndex.value = 0
  nodes.value = withSearchFlags(nodes.value)
})

watch(searchHits, (hits) => {
  if (searchHitIndex.value >= hits.length) searchHitIndex.value = 0
})

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('resize', closeCtx)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('resize', closeCtx)
  closeCtx()
})

defineExpose({
  relayout,
  fitView: safeFitView,
  removeSelected,
  focusNode,
  selectAllEntities,
  getSelectedEntityIndices,
})
</script>

<style scoped>
.geek-scene-canvas__rail-items {
  gap: 2px;
}
:deep(.geek-scene-canvas.is-rail-collapsed) .geek-scene-canvas__rail-items {
  align-items: center;
}
.geek-scene-canvas__rail-item {
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.geek-scene-canvas__rail-item span {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (hover: hover) {
  .geek-scene-canvas__rail-item:hover {
    background: rgba(148, 163, 184, 0.14);
  }
}
.geek-scene-canvas__rail-item i {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  font-style: normal;
  font-size: var(--premium-fs-caption);
  background: rgba(251, 191, 36, 0.16);
  color: #fcd34d;
}
.geek-scene-canvas__rail-item[data-kind='batch'] i {
  background: rgba(96, 165, 250, 0.16);
  color: #93c5fd;
}
.geek-scene-canvas__search {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(15, 23, 42, 0.55);
  z-index: 2;
}
.geek-scene-canvas__search-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(30, 41, 59, 0.9);
  color: #e2e8f0;
  font-size: var(--premium-fs-micro);
}
.geek-scene-canvas__search-input::placeholder {
  color: rgba(148, 163, 184, 0.55);
}
.geek-scene-canvas__search-meta {
  flex: 0 0 auto;
  font-size: var(--premium-fs-micro);
  color: rgba(148, 163, 184, 0.8);
  white-space: nowrap;
}
.geek-scene-canvas__search-next {
  flex: 0 0 auto;
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid rgba(56, 189, 248, 0.35);
  background: rgba(14, 116, 144, 0.25);
  color: #bae6fd;
  font-size: var(--premium-fs-micro);
  cursor: pointer;
}
.geek-scene-canvas__empty {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  transform: translateY(72px);
  color: rgba(148, 163, 184, 0.85);
  text-align: center;
  pointer-events: none;
}
.geek-scene-canvas__empty-hint {
  margin: 0;
  max-width: 280px;
  font-size: var(--premium-fs-micro);
  line-height: 1.4;
  color: rgba(148, 163, 184, 0.8);
}
.geek-scene-canvas__empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  pointer-events: auto;
}
.geek-scene-canvas__cta {
  padding: 7px 14px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(96, 165, 250, 0.45);
  background: rgba(59, 130, 246, 0.22);
  color: #dbeafe;
  font-size: var(--premium-fs-micro);
  font-weight: 500;
  cursor: pointer;
}
@media (hover: hover) {
  .geek-scene-canvas__cta:hover {
    background: rgba(59, 130, 246, 0.35);
  }
  .geek-scene-canvas__cta--ghost:hover {
    background: rgba(51, 65, 85, 0.95);
  }
}
.geek-scene-canvas__cta--ghost {
  border-color: rgba(148, 163, 184, 0.28);
  background: rgba(30, 41, 59, 0.85);
  color: #e2e8f0;
}
</style>

<style>
.geek-scene-ctx-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-notification);
  background: transparent;
}
.geek-scene-ctx {
  position: fixed;
  min-width: 148px;
  padding: 6px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(15, 23, 42, 0.98);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.geek-scene-ctx__item {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #e2e8f0;
  font-size: var(--premium-fs-micro);
  text-align: left;
  cursor: pointer;
}
@media (hover: hover) {
  .geek-scene-ctx__item:hover {
    background: rgba(148, 163, 184, 0.16);
  }
  .geek-scene-ctx__item--danger:hover {
    background: rgba(239, 68, 68, 0.16);
  }
}
.geek-scene-ctx__item--danger {
  color: #fca5a5;
}
</style>
