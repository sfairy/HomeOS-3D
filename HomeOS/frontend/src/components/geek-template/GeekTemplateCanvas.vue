<!--
  GeekTemplateCanvas.vue
  职责：geek-template 模板实体编辑器的画布组件，基于 VueFlow 实现。
       左侧操作投放栏（选择类型/配置面板/添加映射/粘贴 YAML）+ 全幅舞台，
       根据 mode 渲染模板节点（root/slot/trigger/logic/sensor/yaml）并支持点击定位右侧配置段。
       pick_type 模式下画布禁用并提示先选类型。
  所属模块：geek-template。
  关键依赖：
    - @vue-flow/core（VueFlow / useVueFlow）：节点画布主体。
    - @vue-flow/background / @vue-flow/controls：背景网格与缩放控件。
    - GeekCanvasShell：左投放栏 + 舞台外壳。
    - GeekTemplateNode：自定义节点渲染。
    - useVueFlowParentScaleFix / safeGeekFitView：缩放与自适应适配。
  Props：
    - nodes / edges：画布节点与边数据。
    - selectedNodeId：当前选中节点 id（双向）。
    - mode：当前模板模式（pick_type / appliance / trigger_sensor / yaml_import）。
    - allowPasteYaml：是否允许「粘贴 YAML」入口。
  Emits：
    - update:selectedNodeId：选中节点变更。
    - select-slot / select-root / select-section：点击节点时按 kind 定位右侧配置（槽位/根/段）。
    - add-slot / open-settings / open-paste-yaml：投放栏动作。
    - clear-selection / hint：清空选中与提示。
  关键交互：
    - 节点点击按 data.kind 路由到不同事件（slot→select-slot、root→select-root、trigger/logic/sensor→select-section）。
    - relayout 重新套用布局坐标并适配视口；defineExpose 暴露 relayout 与 fitView 供父组件调用。
    - 实例级 FLOW_ID 避免 KeepAlive / 重挂载时与全局固定 id 抢销毁。
-->
<template>
  <GeekCanvasShell
    root-class="geek-template-canvas"
    :set-stage-ref="bindStageRef"
    rail-aria-label="模板操作"
    rail-title="操作"
    :tip="mode === 'pick_type' ? '先选类型，再映射实体' : '点节点编辑 · 右侧 Inspector'"
    :layout-disabled="mode === 'pick_type'"
    expand-title="展开操作栏"
    collapse-title="收起操作栏"
    @layout="relayout"
  >
    <template #rail="{ collapsed }">
      <section class="geek-canvas-shell__rail-section">
        <em v-if="collapsed" class="geek-canvas-shell__rail-group-mini" title="类型">类</em>
        <button
          v-else
          type="button"
          class="geek-canvas-shell__rail-group"
          disabled
        >
          <span>{{ '类型与映射' }}</span>
        </button>
        <div class="geek-canvas-shell__rail-items">
          <button
            type="button"
            class="geek-canvas-shell__rail-item"
            title="选择 / 切换模板类型"
            @click="$emit('open-settings')"
          >
            <i>{{ '◈' }}</i>
            <span v-if="!collapsed">{{ '选择类型' }}</span>
          </button>
          <button
            v-if="mode !== 'pick_type'"
            type="button"
            class="geek-canvas-shell__rail-item"
            title="打开右侧配置面板"
            @click="$emit('select-root')"
          >
            <i>{{ '▣' }}</i>
            <span v-if="!collapsed">{{ '配置面板' }}</span>
          </button>
          <button
            v-if="mode === 'appliance'"
            type="button"
            class="geek-canvas-shell__rail-item"
            title="添加实体映射槽位"
            @click="$emit('add-slot')"
          >
            <i>{{ '+' }}</i>
            <span v-if="!collapsed">{{ '添加映射' }}</span>
          </button>
          <button
            v-if="allowPasteYaml"
            type="button"
            class="geek-canvas-shell__rail-item"
            title="粘贴 configuration.yaml"
            @click="$emit('open-paste-yaml')"
          >
            <i>{{ '☰' }}</i>
            <span v-if="!collapsed">{{ '粘贴 YAML' }}</span>
          </button>
        </div>
      </section>
    </template>

    <div v-if="mode === 'pick_type'" class="geek-template-canvas__empty">
      <p>{{ '请先选择模板类型' }}</p>
      <span>{{ '家电映射 · 触发式传感器 · YAML 导入' }}</span>
      <button
        type="button"
        class="list-page__btn list-page__btn--primary"
        @click="$emit('open-settings')"
      >
        {{ '选择类型' }}
      </button>
    </div>
    <VueFlow
      v-else
      :id="FLOW_ID"
      v-model:nodes="localNodes"
      v-model:edges="localEdges"
      :node-types="nodeTypes"
      :default-viewport="{ zoom: 0.85, x: 24, y: 24 }"
      :min-zoom="0.35"
      :max-zoom="1.4"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :elements-selectable="true"
      :pan-on-drag="true"
      :zoom-on-scroll="true"
      fit-view-on-init
      @node-click="onNodeClick"
      @pane-click="onPaneClick"
    >
      <Background pattern-color="rgba(95, 212, 255, 0.08)" :gap="20" :size="1" />
      <Controls position="top-right" />
    </VueFlow>
  </GeekCanvasShell>
</template>

<script setup>
import { getCurrentInstance, markRaw, ref, watch } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import GeekCanvasShell from '@/components/geek-automation/GeekCanvasShell.vue'
import GeekTemplateNode from './GeekTemplateNode.vue'
import { useVueFlowParentScaleFix } from '@/composables/ui/useVueFlowParentScaleFix'
import { safeGeekFitView } from '@/composables/orchestrator/safeGeekFitView'

/** 实例级 store id，避免 KeepAlive / 重挂载时与全局固定 id 抢销毁 */
const FLOW_ID = `geek-template-flow-${getCurrentInstance()?.uid ?? 0}`
const DEFAULT_VIEWPORT = { x: 24, y: 24, zoom: 0.85 }

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  edges: { type: Array, default: () => [] },
  selectedNodeId: { type: String, default: '' },
  /** pick_type | appliance | trigger_sensor | yaml_import */
  mode: { type: String, default: 'pick_type' },
  allowPasteYaml: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:selectedNodeId',
  'select-slot',
  'select-root',
  'select-section',
  'add-slot',
  'open-settings',
  'open-paste-yaml',
  'clear-selection',
  'hint',
])

const nodeTypes = { template: markRaw(GeekTemplateNode) }
const localNodes = ref([])
const localEdges = ref([])
const stageRef = ref(null)
function bindStageRef(el) {
  stageRef.value = el || null
}

const { fitView, setViewport, getNodes, viewport } = useVueFlow(FLOW_ID)
const { refresh: refreshFlowScaleFix } = useVueFlowParentScaleFix(FLOW_ID)

function syncGraphFromProps() {
  localNodes.value = (props.nodes || []).map((n) => ({
    ...n,
    selected: n.id === props.selectedNodeId,
  }))
  localEdges.value = props.edges || []
}

watch(
  () => [props.nodes, props.edges, props.selectedNodeId],
  () => {
    syncGraphFromProps()
  },
  { immediate: true, deep: true },
)

async function safeFitView() {
  await safeGeekFitView({
    stageEl: stageRef.value,
    nodes: localNodes.value,
    getNodes,
    fitView,
    setViewport,
    viewport,
    refreshScaleFix: refreshFlowScaleFix,
    defaultViewport: DEFAULT_VIEWPORT,
    requirePositiveZoom: false,
    fit: { padding: 0.22, duration: 220, maxZoom: 1.05 },
  })
}

function relayout() {
  if (props.mode === 'pick_type') return
  // 重新套用布局坐标并适配视口（与场景/自动化「排版」一致）
  syncGraphFromProps()
  void safeFitView()
  emit('hint', '已重新排版')
}

function onNodeClick({ node }) {
  emit('update:selectedNodeId', node.id)
  if (node.data?.kind === 'slot' && node.data.slotKey) {
    emit('select-slot', node.data.slotKey)
    return
  }
  if (node.data?.kind === 'root' || node.id === 'template_root') {
    emit('select-root')
    return
  }
  // trigger_sensor 链：按节点 kind 定位右侧对应配置段
  if (['trigger', 'logic', 'sensor'].includes(node.data?.kind)) {
    emit('select-section', node.data.kind)
  }
}

function onPaneClick() {
  emit('clear-selection')
}

defineExpose({ relayout, fitView: safeFitView })
</script>

<style scoped>
.geek-template-canvas__empty {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgba(226, 232, 240, 0.55);
  pointer-events: none;
}
.geek-template-canvas__empty p {
  margin: 0;
  font-size: var(--premium-fs-body);
  font-weight: 650;
  color: rgba(241, 245, 249, 0.82);
}
.geek-template-canvas__empty span {
  font-size: var(--premium-fs-micro);
}
.geek-template-canvas__empty .list-page__btn {
  pointer-events: auto;
  margin-top: 6px;
}
</style>
