<!-- eslint-disable vue/no-mutating-props --><!-- 节点 payload/graph 由父组件持有，检视器就地改嵌套字段 -->
<!--
  GeekNodeInspector.vue
  职责：geek-automation 画布右侧的「节点属性检视器」组件。
       根据选中节点的 kind 渲染对应的表单（开始 / 注释 / 触发组 / 条件组 / 触发 / 条件 / 动作），
       并就地修改 payload 与 graph 的嵌套字段后通知父级刷新。
  所属模块：geek-automation。
  关键依赖：
    - GeekCfgCard：通用配置卡片外壳。
    - GeekTriggerNodeForm / GeekConditionNodeForm / GeekActionNodeForm：各类型节点的字段表单。
  Props：
    - selectedPayload：当前选中节点的数据对象（含 kind / trigger / condition / action / groupLogic 等）。
    - selectedNodeId：当前选中节点 id（用于 :key 强制重建表单）。
    - graph：自动化图数据，用于读写组间逻辑与 triggerAndTimeout 等顶层字段。
    - selectedTraceDetail：选中节点的执行轨迹详情文本。
    - engineCaps：本地引擎能力清单，透传给子表单。
    - variableList：已声明变量列表，透传给子表单。
    - editingId：当前编辑自动化 id，透传给子表单。
  Emits：
    - refresh-selected：字段变更时通知父级写回选中节点。
    - clear-selection：收起检视器。
    - bump-canvas：强制画布重建（用于结构变更后刷新）。
    - open-yaml-drawer：打开 YAML 预览抽屉。
    - declare-var：声明新变量。
    - append-device-assign：从触发节点追加写变量节点。
    - notify：弹出提示。
  关键交互：
    - 不同 kind 渲染不同表单组件，并通过 ref 在选中切换时调用 syncFromSelection 同步子组件状态。
    - 组节点支持切换组内逻辑；只有一组时同时联动根级 triggerLogic/condRootLogic。
    - flush 在离开节点前调用子表单的 flush 以同步未提交字段。
-->
<template>
      <aside
        :class="['geek-builder__inspector', selectedPayload && 'is-open']"
        aria-label="节点属性"
      >
        <header class="geek-builder__inspector-head">
          <div class="geek-builder__inspector-titles">
            <p class="geek-builder__inspector-kicker">{{ '配置节点' }}</p>
            <h4>{{ inspectorTitle }}</h4>
            <em v-if="selectedTraceDetail" class="geek-builder__trace-detail">{{
              selectedTraceDetail
            }}</em>
          </div>
          <button type="button" class="list-page__link-btn" @click="clearSelection">
            {{ '收起' }}
          </button>
        </header>
        <div class="geek-builder__inspector-body">
        <div v-if="selectedPayload" :key="selectedNodeId || 'none'" class="geek-insp-stack">
          <template v-if="selectedPayload.kind === 'start'">
            <GeekCfgCard
              title="开始"
              accent
              desc="流程入口。触发/条件怎么组合，在画布「触发组 / 条件组」上改；多组时才在这里设组间关系。"
            >
              <div v-if="triggerGroupCount > 1" class="geek-field">
                <span>{{ '触发组之间' }}</span>
                <div class="geek-seg" role="group" aria-label="触发组间逻辑">
                  <button
                    type="button"
                    :class="['geek-seg__btn', graph.triggerLogic !== 'and' && 'is-on']"
                    @click="onRootTriggerLogicChange('or')"
                  >
                    {{ '任一组' }}
                  </button>
                  <button
                    type="button"
                    :class="['geek-seg__btn', graph.triggerLogic === 'and' && 'is-on']"
                    @click="onRootTriggerLogicChange('and')"
                  >
                    {{ '全部组' }}
                  </button>
                </div>
              </div>
              <label
                v-if="graph.triggerLogic === 'and'"
                class="geek-field"
              >
                <span>{{ '全局 AND 等待秒' }}</span>
                <input
                  v-model.number="graph.triggerAndTimeout"
                  type="number"
                  min="1"
                  @change="bumpCanvas"
                />
              </label>
              <p v-if="graph.triggerLogic === 'and'" class="geek-hint">
                {{ '组间「全部」时，后续触发的等待超时；与「顺序触发」步骤超时相互独立。' }}
              </p>
              <div v-if="conditionGroupCount > 1" class="geek-field">
                <span>{{ '条件组之间' }}</span>
                <div class="geek-seg" role="group" aria-label="条件组间逻辑">
                  <button
                    type="button"
                    :class="['geek-seg__btn', graph.condRootLogic !== 'or' && 'is-on']"
                    @click="onRootCondLogicChange('and')"
                  >
                    {{ '全部组' }}
                  </button>
                  <button
                    type="button"
                    :class="['geek-seg__btn', graph.condRootLogic === 'or' && 'is-on']"
                    @click="onRootCondLogicChange('or')"
                  >
                    {{ '任一组' }}
                  </button>
                </div>
              </div>
              <p v-if="triggerGroupCount <= 1 && conditionGroupCount <= 1" class="geek-hint">
                {{ '只有一组时，逻辑看组上的「全部满足 / 满足任一」即可。' }}
              </p>
            </GeekCfgCard>
          </template>

          <template v-else-if="selectedPayload.kind === 'note'">
            <GeekCfgCard title="注释" accent desc="仅画布说明，不会编译进可执行 YAML。">
              <label class="geek-field">
                <span>{{ '注释内容' }}</span>
                <textarea
                  v-model="selectedPayload.noteText"
                  rows="4"
                  class="geek-textarea"
                  @change="refreshSelected"
                />
              </label>
            </GeekCfgCard>
          </template>

          <template
            v-else-if="
              selectedPayload.kind === 'trigger_group' || selectedPayload.kind === 'condition_group'
            "
          >
            <GeekCfgCard
              :title="selectedPayload.kind === 'trigger_group' ? '触发组' : '条件组'"
              accent
              :desc="
                selectedPayload.kind === 'trigger_group'
                  ? '选中本组再投放触发，或把触发连到本组即可归入。'
                  : '选中本组再投放条件，或把条件连到本组即可归入。'
              "
            >
              <label class="geek-field">
                <span>{{ '组名称' }}</span>
                <input v-model="selectedPayload.label" @change="refreshSelected" />
              </label>
              <div class="geek-field">
                <span>{{ '组内逻辑' }}</span>
                <div class="geek-seg" role="group" aria-label="组内逻辑">
                  <button
                    type="button"
                    :class="['geek-seg__btn', selectedPayload.groupLogic !== 'or' && 'is-on']"
                    @click="onGroupLogicChange('and')"
                  >
                    {{ '全部满足' }}
                  </button>
                  <button
                    type="button"
                    :class="['geek-seg__btn', selectedPayload.groupLogic === 'or' && 'is-on']"
                    @click="onGroupLogicChange('or')"
                  >
                    {{ '满足任一' }}
                  </button>
                </div>
              </div>
              <label
                v-if="
                  selectedPayload.kind === 'trigger_group' && selectedPayload.groupLogic === 'and'
                "
                class="geek-field"
              >
                <span>{{ '全局 AND 等待秒（组间/组内全部共用）' }}</span>
                <input
                  v-model.number="graph.triggerAndTimeout"
                  type="number"
                  min="1"
                  @change="bumpCanvas"
                />
              </label>
            </GeekCfgCard>
          </template>

          <GeekTriggerNodeForm
            v-else-if="selectedPayload.kind === 'trigger' && selectedPayload.trigger"
            ref="triggerFormRef"
            :selected-payload="selectedPayload"
            :engine-caps="engineCaps"
            :variable-list="variableList"
            :editing-id="editingId"
            @refresh-selected="refreshSelected"
            @declare-var="onDeclareVar"
            @append-device-assign="appendDeviceAssignFromTrigger"
          />
          <GeekConditionNodeForm
            v-else-if="selectedPayload.kind === 'condition' && selectedPayload.condition"
            ref="conditionFormRef"
            :selected-payload="selectedPayload"
            :engine-caps="engineCaps"
            :variable-list="variableList"
            :editing-id="editingId"
            @refresh-selected="refreshSelected"
            @declare-var="onDeclareVar"
          />
          <GeekActionNodeForm
            v-else-if="selectedPayload.kind === 'action' && selectedPayload.action"
            ref="actionFormRef"
            :selected-payload="selectedPayload"
            :graph="graph"
            :engine-caps="engineCaps"
            :variable-list="variableList"
            :editing-id="editingId"
            @refresh-selected="refreshSelected"
            @declare-var="onDeclareVar"
            @notify="onNotify"
          />
        </div>
        <p v-else class="geek-hint">
          {{ '从底部添加节点，拖圆点连线；点选节点在此配置。' }}
        </p>

        <button type="button" class="list-page__link-btn geek-yaml-open" @click="openYamlDrawer">
          {{ '打开 YAML 预览' }}
        </button>
        </div>
      </aside>
</template>


<script setup>
import { computed, ref } from 'vue'
import '@/components/geek-automation/styles/geek-builder-shared.css'
import '@/components/geek-automation/styles/geek-var-panel.css'
import GeekCfgCard from './GeekCfgCard.vue'
import GeekTriggerNodeForm from './GeekTriggerNodeForm.vue'
import GeekConditionNodeForm from './GeekConditionNodeForm.vue'
import GeekActionNodeForm from './GeekActionNodeForm.vue'

/* 节点 payload / graph 由父组件持有；检视器就地改嵌套字段并 refresh，与拆分前行为一致 */
/* eslint-disable vue/no-mutating-props -- 嵌套字段就地写入，与父组件共享同一对象引用 */

const props = defineProps({
  selectedPayload: { type: Object, default: null },
  selectedNodeId: { type: [String, Number], default: null },
  graph: { type: Object, required: true },
  selectedTraceDetail: { type: String, default: '' },
  engineCaps: { type: Object, default: null },
  variableList: { type: Array, default: () => [] },
  editingId: { type: [String, Number], default: null },
})

const emit = defineEmits([
  'refresh-selected',
  'clear-selection',
  'bump-canvas',
  'open-yaml-drawer',
  'declare-var',
  'append-device-assign',
  'notify',
])

const triggerFormRef = ref(null)
const conditionFormRef = ref(null)
const actionFormRef = ref(null)

// 触发组数量：优先从画布节点统计，回退到 graph.triggerGroups
const triggerGroupCount = computed(() => {
  const nodes = props.graph?.flowNodes || []
  const fromFlow = nodes.filter((n) => n.data?.kind === 'trigger_group').length
  if (fromFlow) return fromFlow
  const groups = props.graph?.triggerGroups
  if (Array.isArray(groups) && groups.length) return groups.length
  return 0
})
// 条件组数量：同上，回退到 graph.conditionGroups
const conditionGroupCount = computed(() => {
  const nodes = props.graph?.flowNodes || []
  const fromFlow = nodes.filter((n) => n.data?.kind === 'condition_group').length
  if (fromFlow) return fromFlow
  const groups = props.graph?.conditionGroups
  if (Array.isArray(groups) && groups.length) return groups.length
  return 0
})

// 检视器标题：按选中节点的 kind 与 label 推导
const inspectorTitle = computed(() => {
  const p = props.selectedPayload
  if (!p) return '未选中'
  if (p.kind === 'start') return '开始'
  if (p.kind === 'trigger_group') return p.label || '触发组'
  if (p.kind === 'condition_group') return p.label || '条件组'
  if (p.kind === 'trigger') return p.label || '触发'
  if (p.kind === 'condition') return p.label || '条件'
  return p.label || '执行'
})

function refreshSelected() {
  emit('refresh-selected')
}

function clearSelection() {
  emit('clear-selection')
}

function bumpCanvas() {
  emit('bump-canvas')
}

function openYamlDrawer() {
  emit('open-yaml-drawer')
}

function onDeclareVar(payload) {
  emit('declare-var', payload)
}

function appendDeviceAssignFromTrigger() {
  emit('append-device-assign')
}

function onNotify(payload) {
  emit('notify', payload)
}

// 组节点逻辑切换：写入 groupLogic 与 detail，单组时联动根级 logic
function onGroupLogicChange(logic) {
  const p = props.selectedPayload
  if (!p) return
  const next = logic === 'and' ? 'and' : 'or'
  p.groupLogic = next
  p.detail =
    p.kind === 'condition_group'
      ? next === 'or'
        ? '组内任一'
        : '组内全部'
      : next === 'and'
        ? '组内全部'
        : '组内任一'
  if (p.kind === 'trigger_group' && triggerGroupCount.value <= 1) {
    props.graph.triggerLogic = next
  }
  if (p.kind === 'condition_group' && conditionGroupCount.value <= 1) {
    props.graph.condRootLogic = next
  }
  refreshSelected()
}

// 根级触发组间逻辑切换：and=全部组，or=任一组
function onRootTriggerLogicChange(logic) {
  props.graph.triggerLogic = logic === 'and' ? 'and' : 'or'
  bumpCanvas()
}

// 根级条件组间逻辑切换：and=全部组，or=任一组
function onRootCondLogicChange(logic) {
  props.graph.condRootLogic = logic === 'or' ? 'or' : 'and'
  bumpCanvas()
}

// 离开节点前 flush：调用子动作表单的 flush 以同步未提交字段
function flush() {
  actionFormRef.value?.flush?.()
}

// 选中节点切换时同步子表单状态（如下拉选中态、预设匹配等）
function syncFromSelection() {
  triggerFormRef.value?.syncFromSelection?.()
  conditionFormRef.value?.syncFromSelection?.()
  actionFormRef.value?.syncFromSelection?.()
}

defineExpose({
  flush,
  syncFromSelection,
})
</script>

<style scoped>
.geek-builder__inspector {
  position: absolute;
  top: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 6;
  display: flex;
  flex-direction: column;
  transform: translateX(110%);
  opacity: 0;
  pointer-events: none;
  transition:
    transform 0.24s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.2s ease;
}
/* 打开态必须用 none：translateX(0) 仍会创建 containing block，导致 fixed 下拉错位 */
.geek-builder__inspector.is-open {
  transform: none;
  opacity: 1;
  pointer-events: auto;
}
.geek-builder__inspector-body {
  /* 视觉样式在 geek-builder-shared；此处仅保留布局兜底 */
}
.geek-builder__trace-detail {
  display: block;
  margin-top: 4px;
  color: #93c5fd;
  font-size: 0.75rem;
  font-style: normal;
}
/* 整页缩放时画布为设计稿宽度，勿按真实视口切到手机底栏 Inspector */
@media (max-width: 720px) {
  .app-shell:not(.app-shell--scaling) .geek-builder__inspector {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    max-height: calc(52vh / var(--hos-scale, 1));
    border-radius: 18px 18px 0 0;
    transform: translateY(110%);
  }
  .app-shell:not(.app-shell--scaling) .geek-builder__inspector.is-open {
    transform: none;
  }
}
</style>
