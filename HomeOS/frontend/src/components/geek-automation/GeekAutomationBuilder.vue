<!--
  自动化：沉浸式全幅画布 + 选中后右侧属性抽屉
-->
<template>
  <div class="geek-builder orch-builder-workspace">
    <GeekBuilderChrome
      v-model:name="graph.name"
      :name-placeholder="'给这条自动化起个名字'"
      :manage-active="showManage"
      :settings-active="showSettings"
      :yaml-active="showYaml"
      :saving="saving"
      :save-disabled="saving"
      :save-label="saving ? '保存中…' : editingId ? '保存' : '创建并保存'"
      :dismiss-label="embedded ? '清除' : '关闭'"
      :dismiss-title="embedded ? '清空当前编辑，回到新建空白画布' : '关闭编辑器'"
      @manage="openManageDrawer"
      @settings="openSettingsDrawer"
      @save="save"
      @yaml="openYamlDrawer"
      @dismiss="onChromeDismiss"
    >
      <template #main>
        <em v-if="traceHint" class="geek-builder__trace">{{ traceHint }}</em>
        <div v-if="approximateHintParts.length" class="geek-builder__warn-wrap">
          <em class="geek-builder__warn">{{ approximateHintParts[0] }}</em>
          <ul v-if="approximateHintParts.length > 1" class="geek-builder__warn-list">
            <li v-for="(h, i) in approximateHintParts.slice(1)" :key="i">{{ h }}</li>
          </ul>
        </div>
      </template>
      <template #actions-mid>
        <button
          type="button"
          class="list-page__btn"
          :class="showVars && 'is-active'"
          @click="openVarsDrawer"
        >
          {{ '变量' }}
        </button>
        <button
          type="button"
          class="list-page__btn"
          :class="showTemplates && 'is-active'"
          :disabled="saving"
          @click="openTemplatesDrawer"
        >
          {{ '模板' }}
        </button>
        <button
          v-if="editingId"
          type="button"
          class="list-page__btn"
          :class="enabled ? 'is-on' : 'is-off'"
          :disabled="actionBusy"
          :title="enabled ? '点击禁用' : '点击启用'"
          @click="toggleEnabled"
        >
          {{ enabled ? '已启用' : '已停用' }}
        </button>
        <button
          v-if="editingId"
          type="button"
          class="list-page__btn"
          :disabled="actionBusy || saving || !enabled"
          :title="enabled ? '手动触发一次' : '请先启用'"
          @click="triggerCurrent"
        >
          {{ actionBusy ? '触发中…' : '触发' }}
        </button>
        <button
          type="button"
          class="list-page__btn"
          :class="showDryRun && 'is-active'"
          :disabled="dryRunBusy"
          :title="'试运行：按当前状态评估触发与条件，不执行动作'"
          @click="runDryRun"
        >
          {{ dryRunBusy ? '评估中…' : '试运行' }}
        </button>
        <button
          type="button"
          class="list-page__btn"
          :disabled="duplicateBusy"
          :title="'查重：检测是否已存在触发器/条件/动作相同的自动化'"
          @click="runDuplicateCheck"
        >
          {{ duplicateBusy ? '查重中…' : '查重' }}
        </button>
        <button type="button" class="list-page__btn" @click="canvasRef?.removeSelected()">
          {{ '删除节点' }}
        </button>
        <button
          type="button"
          class="list-page__btn"
          :disabled="!canvasCanUndo"
          :title="'撤销（Ctrl+Z）'"
          @click="canvasRef?.undo?.()"
        >
          {{ '撤销' }}
        </button>
        <button
          type="button"
          class="list-page__btn"
          :disabled="!canvasCanRedo"
          :title="'重做（Ctrl+Shift+Z）'"
          @click="canvasRef?.redo?.()"
        >
          {{ '重做' }}
        </button>
      </template>
      <template #actions-after>
        <button
          v-if="canUseSimpleWizard"
          type="button"
          class="list-page__btn"
          @click="openSimpleWizard"
        >
          {{ '向导' }}
        </button>
      </template>
    </GeekBuilderChrome>

    <OrchestratorExecutionEngineBadge
      v-if="haExecutionNeeds && !runOnHa"
      class="geek-builder__ha-banner"
      :needs-ha="haExecutionNeeds"
      :run-on-ha="runOnHa"
      :reasons="haExecutionReasons"
      @enable-ha="enableHaExecution"
    />

    <OrchestratorSyncAlert
      v-if="showManage || showSettings"
      class="geek-builder__sync-alert"
      :items="savedList"
      :sync-status-map="syncStatusMap"
      :syncing="syncing"
      :repair-progress="repairProgress"
      :is-admin="isAdmin"
      :entity-label="'自动化'"
      @sync-all="doSyncAll"
      @repair-all="doRepairAll"
    />

    <p v-if="resultMsg" :class="['geek-builder__msg', resultOk ? 'is-ok' : 'is-err']">
      {{ resultMsg }}
    </p>

    <GeekAutomationSettingsDrawer
      :open="showSettings"
      :ha-execution-needs="haExecutionNeeds"
      :run-on-ha="runOnHa"
      :ha-execution-reasons="haExecutionReasons"
      :mode="graph.mode"
      :enabled="enabled"
      :saving="saving"
      :editing-id="editingId"
      :action-busy="actionBusy"
      :last-trace="lastTrace"
      :trace-step="traceStep"
      @close="showSettings = false"
      @enable-ha="enableHaExecution"
      @update:mode="graph.mode = $event"
      @update:enabled="enabled = $event"
      @update:runOnHa="runOnHa = $event"
      @start-new="startNew"
      @reset="reset"
      @delete-current="confirmDeleteCurrent"
      @trace-prev="traceStepPrev"
      @trace-next="traceStepNext"
      @trace-reset="traceStepReset"
    />

    <GeekVarsDrawer
      :open="showVars"
      aria-label="变量管理"
      title="变量"
      subtitle="声明、改值，并快速投放到画布"
      @close="showVars = false"
    >
      <AutomationVariablesPanel
        ref="varsPanelRef"
        hide-title
        :rule-id="editingId || ''"
        geek-actions
        :open-create="varsOpenCreate"
        @pick="onVarPick"
        @insert="onVarInsert"
        @loaded="onVarsLoaded"
      />
      <template #footer>
        <p v-if="!editingId" class="geek-builder__vars-hint">
          {{ '未保存自动化时只能建全局变量；保存后即可使用本规则变量。' }}
        </p>
      </template>
    </GeekVarsDrawer>

    <GeekAutomationManageDrawer
      :open="showManage"
      :map-auto-history="mapAutoHistory"
      :automation-engine-sections="automationEngineSections"
      :engine-caps="engineCaps"
      :saved-list="savedList"
      :ha-import-list="haImportList"
      :sync-status-map="syncStatusMap"
      :is-admin="isAdmin"
      :syncing="syncing"
      :deleting-ha-id="deletingHaId"
      :drift-count="driftCount"
      :batch-busy="batchBusy"
      :batch-exporting="batchExporting"
      :batch-importing="batchImporting"
      :import-flow-importing="importFlowImporting"
      :cloning-id="cloningId"
      :automation-run-state="automationRunState"
      @close="showManage = false"
      @start-new="startNew"
      @sync-all="doSyncAll"
      @repair-all="doRepairAll"
      @edit="openSavedItem"
      @delete="confirmDelete"
      @discover="discoverHA"
      @pull-all="doPullAll"
      @import="doImport"
      @ha-delete="confirmHaDelete"
      @batch-toggle-all="batchToggleAll"
      @confirm-batch-toggle="confirmBatchToggle"
      @batch-export-json="batchExportJson"
      @batch-export-yaml="batchExportYaml"
      @batch-pick-import="batchPickImportFile"
      @open-paste-yaml="openPasteYaml"
      @bulk-import-discovered="bulkImportDiscovered"
      @toggle-item="toggleItem"
      @repair="doRepair"
      @sync="doSync"
      @clone="cloneItem"
      @trigger-item="triggerItem"
    />

    <GeekTemplatesDrawer
      :open="showTemplates"
      aria-label="模板库"
      @close="showTemplates = false"
    >
      <GeekTemplatesPanel
        ref="templatesPanelRef"
        hide-title
        :current-graph="graph"
        :open-save="templatesOpenSave"
        :server-groups="automationTemplateGroups"
        :installing-id="installingTpl"
        :installing-secondary-id="installingBp"
        @apply="onApplyTemplate"
        @saved="onTemplateSaved"
        @removed="onTemplateRemoved"
        @install-server="onAutomationTemplateInstall"
      />
      <template #footer>
        <p class="geek-builder__vars-hint geek-builder__vars-hint--muted">
          {{ '应用会替换当前画布；含 *_placeholder 的实体可在保存后用占位向导替换。' }}
        </p>
      </template>
    </GeekTemplatesDrawer>

    <GeekYamlPreviewDrawer
      :open="showYaml"
      subtitle="由当前画布实时编译；保存时写入自动化记录"
      :yaml-html="yamlHtml"
      @close="showYaml = false"
      @copy="copyYaml"
    />

    <GeekWideDrawer
      :open="showDryRun"
      aria-label="试运行评估"
      title="试运行评估"
      subtitle="按当前实体状态与时刻评估触发就绪与条件满足；不会执行任何动作"
      @close="closeDryRun"
    >
      <template #head-actions>
        <button
          type="button"
          class="list-page__btn"
          :disabled="dryRunBusy"
          @click="runDryRun"
        >
          {{ dryRunBusy ? '评估中…' : '重新评估' }}
        </button>
      </template>
      <GeekDryRunPanel
        :busy="dryRunBusy"
        :error="dryRunError"
        :result="dryRunResult"
        @rerun="runDryRun"
      />
    </GeekWideDrawer>

    <GeekWideDrawer
      :open="showDuplicate"
      aria-label="规则查重结果"
      title="规则查重结果"
      subtitle="按触发器 / 条件 / 动作签名检测语义重复的自动化"
      @close="closeDuplicate"
    >
      <template #head-actions>
        <button
          type="button"
          class="list-page__btn"
          :disabled="duplicateBusy"
          @click="runDuplicateCheck"
        >
          {{ duplicateBusy ? '查重中…' : '重新查重' }}
        </button>
      </template>
      <GeekDuplicatePanel
        :busy="duplicateBusy"
        :error="duplicateError"
        :result="duplicateResult"
        @rerun="runDuplicateCheck"
      />
    </GeekWideDrawer>

    <div class="geek-builder__stage">
      <GeekTraceRail
        v-if="lastTrace.length"
        :trace="lastTrace"
        :success="lastSuccess"
        :step="traceStep"
        @prev="traceStepPrev"
        @next="traceStepNext"
        @reset="traceStepReset"
        @jump="jumpTraceStep"
      />

      <GeekFlowCanvas
        :key="canvasKey"
        ref="canvasRef"
        palette-mode="automation"
        :graph="graph"
        v-model:selected-node-id="selectedNodeId"
        :last-trace="playbackTrace"
        :last-success="lastSuccess"
        :variable-values="variableValues"
        :engine-caps="engineCaps"
        @update:graph="onGraphFromCanvas"
        @select="onSelectNode"
        @hint="onCanvasHint"
      />

      <GeekNodeInspector
        ref="nodeInspectorRef"
        :selected-payload="selectedPayload"
        :selected-node-id="selectedNodeId"
        :graph="graph"
        :selected-trace-detail="selectedTraceDetail"
        :engine-caps="engineCaps"
        :variable-list="variableList"
        :editing-id="editingId"
        @refresh-selected="refreshSelected"
        @clear-selection="clearSelection"
        @bump-canvas="bumpCanvas"
        @open-yaml-drawer="openYamlDrawer"
        @declare-var="onDeclareVar"
        @append-device-assign="appendDeviceAssignFromTrigger"
        @notify="onInspectorNotify"
      />
    </div>

    <OrchestratorPlaceholderWizard
      :open="phWizardOpen"
      :loading="phWizardLoading"
      :saving="phWizardSaving"
      :automation-name="phWizardName"
      kind-label="自动化"
      :rows="phWizardRows"
      v-model:replacements="phWizardReplacements"
      @close="closePlaceholderWizard"
      @apply="onApplyPlaceholders"
    />

    <Teleport :to="overlayTeleportTo" :disabled="overlayTeleportDisabled">
      <SimpleAutomationWizard
        v-if="showSimpleWizard"
        :open="true"
        @close="closeSimpleWizard"
        @applied="onSimpleWizardApplied"
      />
    </Teleport>

    <OrchestratorDriftDiffModal />

    <Teleport :to="overlayTeleportTo" :disabled="overlayTeleportDisabled">
      <Transition name="wr-modal">
        <div v-if="pasteYamlOpen" class="wr-modal-shade" @click.self="closePasteYaml">
          <div class="wr-modal-box wr-modal-box--wide">
            <h4 class="wr-modal-title">{{ '粘贴自动化 YAML' }}</h4>
            <p class="wr-modal-desc">
              {{ '粘贴 triggers / conditions / actions 完整 YAML，将创建新自动化记录。' }}
            </p>
            <input
              v-model="pasteYamlName"
              class="wr-input-name wr-input-name--block"
              :placeholder="'名称（如：夜间关灯）'"
            />
            <textarea
              v-model="pasteYamlText"
              class="wr-yaml-edit"
              rows="16"
              spellcheck="false"
              placeholder="triggers:&#10;  - platform: time&#10;    at: '23:00'"
            ></textarea>
            <div class="wr-modal-actions">
              <button
                class="wr-btn-primary wr-btn-primary--ghost"
                type="button"
                @click="closePasteYaml"
              >
                {{ '取消' }}
              </button>
              <button
                class="wr-btn-primary"
                type="button"
                :disabled="importFlowImporting"
                @click="submitPasteYaml"
              >
                {{ importFlowImporting ? '导入中…' : '导入' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
      <Transition name="wr-modal">
        <div v-if="showDeleteConfirm" class="wr-modal-shade" @click.self="closeDeleteConfirm">
          <div class="wr-modal-box">
            <div class="wr-modal-icon">⚠️</div>
            <h4 class="wr-modal-title">{{ '确认删除' }}</h4>
            <p class="wr-modal-desc">
              {{ deleteMode === 'ha' ? deleteHaMessage : deleteLocalMessage }}
            </p>
            <div class="wr-modal-actions">
              <button
                class="wr-btn-primary wr-btn-primary--ghost"
                type="button"
                :disabled="deletingLocal || !!deletingHaId"
                @click="closeDeleteConfirm"
              >
                {{ '取消' }}
              </button>
              <button
                class="wr-btn-primary wr-btn-primary--danger"
                type="button"
                :disabled="deletingLocal || !!deletingHaId"
                @click="executeDelete"
              >
                {{ deletingLocal || deletingHaId ? '删除中…' : '确认删除' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { getEntityLeaf } from '@homeos/shared'
import { computed, reactive, ref, watch } from 'vue'
import { useOrchestratorDriftFocus } from '@/composables/orchestrator/useOrchestratorDriftFocus'
import '@/components/dashboard/styles/AutomationBuilder.css'
import '@/components/geek-automation/styles/geek-builder-shared.css'
import AutomationVariablesPanel from '@/components/dashboard/AutomationVariablesPanel.vue'
import OrchestratorPlaceholderWizard from '@/components/dashboard/OrchestratorPlaceholderWizard.vue'
import OrchestratorSyncAlert from '@/components/dashboard/OrchestratorSyncAlert.vue'
import OrchestratorExecutionEngineBadge from '@/components/dashboard/OrchestratorExecutionEngineBadge.vue'
import OrchestratorDriftDiffModal from '@/components/dashboard/OrchestratorDriftDiffModal.vue'
import SimpleAutomationWizard from '@/components/dashboard/SimpleAutomationWizard.vue'
import GeekFlowCanvas from './GeekFlowCanvas.vue'
import GeekNodeInspector from './GeekNodeInspector.vue'
import GeekTemplatesPanel from './GeekTemplatesPanel.vue'
import GeekTemplatesDrawer from './GeekTemplatesDrawer.vue'
import GeekYamlPreviewDrawer from './GeekYamlPreviewDrawer.vue'
import GeekAutomationSettingsDrawer from './GeekAutomationSettingsDrawer.vue'
import GeekAutomationManageDrawer from './GeekAutomationManageDrawer.vue'
import GeekVarsDrawer from './GeekVarsDrawer.vue'
import GeekWideDrawer from './GeekWideDrawer.vue'
import GeekBuilderChrome from './GeekBuilderChrome.vue'
import GeekDryRunPanel from './GeekDryRunPanel.vue'
import GeekDuplicatePanel from './GeekDuplicatePanel.vue'
import GeekTraceRail from './GeekTraceRail.vue'
import {
  createEmptyGeekGraph,
  geekTemplateStats,
  getGeekTemplate,
  isGeekGraphNonEmpty,
  layoutCanvasFromGraph,
  actionSummary,
  conditionSummary,
  triggerSummary,
} from '@/utils/geek-automation'
import { clonePlain } from '@/utils/core/clone-plain.util'
import { variableValuesMap } from '@/utils/geek-automation/variable-status.util'
import {
  fetchAutomationVariables,
  createOrchestratorItem,
} from '@/services/api/orchestrator'
import { useGeekYamlPreview } from '@/composables/orchestrator/useGeekYamlPreview'
import { useOrchestratorBatchIo } from '@/composables/orchestrator/useOrchestratorBatchIo'
import { useGeekAutomationShell } from '@/composables/orchestrator/useGeekAutomationShell'
import { useGeekDryRunCheck } from '@/composables/orchestrator/useGeekDryRunCheck'
import { useGeekTracePlayback } from '@/composables/orchestrator/useGeekTracePlayback'
import { useGeekBuilderDrawerChrome } from '@/composables/orchestrator/useGeekBuilderDrawerChrome'
import { splitGeekRestoreHint } from '@/utils/orchestrator/geek-restore-hint.util'
import { useChromeStore } from '@/stores/chrome.store'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
import { hasOrchestratorBuilderDirty } from '@/composables/settings/hub-backup-orchestrator.internals'

const { teleportTarget: overlayTeleportTo, shellTeleportPending } = useShellTeleportTarget()
const overlayTeleportDisabled = shellTeleportPending

const props = defineProps({
  visible: { type: Boolean, default: true },
  embedded: { type: Boolean, default: false },
  initialEditId: { type: String, default: null },
  openPlaceholderWizard: { type: Boolean, default: false },
  initialLocalTemplate: { type: Object, default: null },
})

const emit = defineEmits(['close', 'saved', 'local-template-consumed'])

const chrome = useChromeStore()

const graph = reactive(createEmptyGeekGraph({ name: '自动化' }))
const editingId = ref(null)
const enabled = ref(true)
const runOnHa = ref(false)
const actionBusy = ref(false)
const approximateHintLocal = ref('')
const {
  showSettings,
  showVars,
  showTemplates,
  showYaml,
  showManage,
  showDryRun,
  varsOpenCreate,
  templatesOpenSave,
  closeAllDrawers,
  openSettingsDrawer,
  openVarsDrawer,
  openTemplatesDrawer,
  openManageDrawer: openManageDrawerFlags,
  openYamlDrawer: openYamlDrawerFlags,
} = useGeekBuilderDrawerChrome()

const selectedNodeId = ref(null)
const selectedPayload = ref(null)

/** 执行轨迹回放（最近一次执行：加载 / 逐步回放 / 选中详情） */
const {
  lastTrace,
  lastSuccess,
  traceStep,
  playbackTrace,
  traceHint,
  selectedTraceDetail,
  traceStepPrev,
  traceStepNext,
  traceStepReset,
  jumpTraceStep,
  loadHistory,
} = useGeekTracePlayback()
const canvasRef = ref(null)
const nodeInspectorRef = ref(null)
const varsPanelRef = ref(null)
const templatesPanelRef = ref(null)
const variableList = ref([])

/** 画布撤销/重做可用态（读子组件暴露的响应式 computed ref） */
const canvasCanUndo = computed(() => Boolean(canvasRef.value?.canUndo?.value))
const canvasCanRedo = computed(() => Boolean(canvasRef.value?.canRedo?.value))

/** 克隆进行中的自动化 id */
const cloningId = ref('')
const canvasKey = ref(0)

function formSignature() {
  return JSON.stringify({
    name: graph.name,
    mode: graph.mode,
    triggerLogic: graph.triggerLogic,
    triggerAndTimeout: graph.triggerAndTimeout,
    condRootLogic: graph.condRootLogic,
    triggers: graph.triggers,
    conditions: graph.conditions,
    triggerGroups: graph.triggerGroups,
    conditionGroups: graph.conditionGroups,
    actions: graph.actions,
    enabled: enabled.value,
    runOnHa: runOnHa.value,
  })
}

function applyGraphFromShell({ graph: next, approximateHint: hint }) {
  Object.assign(graph, createEmptyGeekGraph(next))
  if (!graph.flowNodes?.length) {
    const laid = layoutCanvasFromGraph(graph)
    graph.flowNodes = laid.nodes
    graph.flowEdges = laid.edges
  }
  approximateHintLocal.value = hint || ''
  selectedNodeId.value = null
  selectedPayload.value = null
  bumpCanvas()
  if (editingId.value) void loadHistory(String(editingId.value))
  void refreshVariableList()
}

function resetGraphCore() {
  Object.assign(graph, createEmptyGeekGraph({ name: '自动化' }))
  const laid = layoutCanvasFromGraph(graph)
  graph.flowNodes = laid.nodes
  graph.flowEdges = laid.edges
  editingId.value = null
  enabled.value = true
  runOnHa.value = false
  selectedNodeId.value = null
  selectedPayload.value = null
  approximateHintLocal.value = ''
  lastTrace.value = []
  lastSuccess.value = null
  traceStep.value = -1
  bumpCanvas()
}

const shell = useGeekAutomationShell({
  props,
  graph,
  editingId,
  enabled,
  runOnHa,
  formSignature,
  applyGraph: applyGraphFromShell,
  resetGraph: resetGraphCore,
  getCanvasError: () => canvasRef.value?.validate?.() || null,
  commitCanvas: () => canvasRef.value?.commit?.(),
  onSaved: () => emit('saved'),
})

const {
  isAdmin,
  saving,
  resultMsg,
  resultOk,
  savedList,
  haImportList,
  syncStatusMap,
  syncing,
  deletingHaId,
  driftCount,
  repairProgress,
  showDeleteConfirm,
  deleteMode,
  deletingLocal,
  deleteLocalMessage,
  deleteHaMessage,
  pasteYamlOpen,
  pasteYamlText,
  pasteYamlName,
  importFlowImporting,
  showSimpleWizard,
  canUseSimpleWizard,
  openSimpleWizard,
  closeSimpleWizard,
  engineCaps,
  automationEngineSections,
  automationTemplateGroups,
  installingTpl,
  installingBp,
  haExecutionNeeds,
  haExecutionReasons,
  enableHaExecution,
  mapAutoHistory,
  approximateHint: shellApproximateHint,
  copyYaml,
  startNew: shellStartNew,
  loadItem,
  editItem,
  saveAutomation,
  toggleItem,
  toggleCurrent,
  triggerItem,
  executeDelete,
  openPasteYaml,
  closePasteYaml,
  submitPasteYaml,
  bulkImportDiscovered,
  onAutomationTemplateInstall,
  onSimpleWizardApplied,
  loadList,
  discoverHA,
  doSync,
  doRepair,
  doSyncAll,
  doRepairAll,
  doPullAll,
  doImport,
  confirmHaDelete,
  confirmDelete,
  closeDeleteConfirm,
  phWizardOpen,
  phWizardLoading,
  phWizardSaving,
  phWizardName,
  phWizardRows,
  phWizardReplacements,
  closePlaceholderWizard,
  applyPlaceholderReplacements,
  yamlPreview,
} = shell

/** 试运行评估 + 规则查重（抽屉开关 / 加载态 / 结果 / 错误集中管理） */
const showDuplicate = ref(false)

const {
  dryRunBusy,
  dryRunError,
  dryRunResult,
  duplicateBusy,
  duplicateResult,
  duplicateError,
  runDryRun,
  closeDryRun,
  runDuplicateCheck,
  closeDuplicate,
} = useGeekDryRunCheck({
  graph,
  canvasRef,
  editingId,
  yamlPreview,
  showDryRun,
  showDuplicate,
  notify: (ok, msg) => {
    resultOk.value = ok
    resultMsg.value = msg
  },
})

/** 批量启停 + 导入导出 */
const {
  batchBusy,
  exporting: batchExporting,
  importing: batchImporting,
  batchToggleAll,
  exportJson: batchExportJson,
  exportYaml: batchExportYaml,
  pickImportFile: batchPickImportFile,
} = useOrchestratorBatchIo({
  kind: 'automation',
  entityLabel: '自动化',
  getItems: () => savedList.value,
  refresh: async () => {
    await loadList()
  },
  notify: (ok, msg) => {
    resultOk.value = ok
    resultMsg.value = msg
  },
})

/** 批量启停：停用全部时先二次确认（度假模式级操作） */
async function confirmBatchToggle(enabled) {
  if (!enabled && savedList.value.length) {
    const ok = await chrome.confirm(
      `确定停用全部 ${savedList.value.length} 条自动化吗？可随时重新启用。`,
      '停用全部自动化',
      { type: 'warning', confirmText: '停用全部' },
    )
    if (!ok) return
  }
  batchToggleAll(enabled)
}

const yamlHtml = useGeekYamlPreview(
  computed(() => String(yamlPreview.value || '').trim() || '（暂无 YAML：请添加触发与动作）'),
)

const approximateHint = computed(
  () => approximateHintLocal.value || shellApproximateHint.value || '',
)
const approximateHintParts = computed(() => splitGeekRestoreHint(approximateHint.value))

/**
 * 自动化运行状态判定（列表展示用）。
 * 后端无 running 记录，采用近似判定：
 *  - lastTriggered 距今 < RECENT_MIN 分钟 → 运行中（刚触发，可能仍在执行）；
 *  - 否则 HA 实体 state=on → 等待中（已启用，监听触发中）；
 *  - 其余（未关联 HA / 已停用 / 从未触发）→ idle 不展示标记。
 */
const AUTOMATION_RUN_RECENT_MIN = 5
function automationRunState(item) {
  const ts = item?.lastTriggered
  if (ts) {
    const diffMin = (Date.now() - new Date(ts).getTime()) / 60000
    if (Number.isFinite(diffMin) && diffMin < AUTOMATION_RUN_RECENT_MIN) return 'running'
  }
  return item?.haState === 'on' ? 'waiting' : 'idle'
}

async function onApplyPlaceholders() {
  if (typeof applyPlaceholderReplacements !== 'function') return
  const ok = await applyPlaceholderReplacements()
  if (ok && editingId.value) await loadItem(editingId.value)
}

const variableValues = computed(() =>
  variableValuesMap(variableList.value, editingId.value || ''),
)

function flushChooseBeforeLeave() {
  const prevId = selectedNodeId.value
  nodeInspectorRef.value?.flush?.()
  if (prevId && selectedPayload.value) {
    refreshSelectedFor(prevId)
  }
}

function clearSelection() {
  flushChooseBeforeLeave()
  selectedNodeId.value = null
  selectedPayload.value = null
}

function bumpCanvas() {
  canvasKey.value += 1
}

function onCanvasHint(msg) {
  resultMsg.value = String(msg || '')
  resultOk.value = false
}

function onVarsLoaded(list) {
  variableList.value = Array.isArray(list) ? list : []
}

async function refreshVariableList() {
  try {
    const { data } = await fetchAutomationVariables()
    const list = Array.isArray(data) ? data : data?.items || []
    const ruleId = editingId.value || ''
    variableList.value = list.filter((v) => {
      if (v.scope === 'global') return true
      if (!ruleId) return v.scope !== 'rule'
      return v.scope === 'rule' && String(v.ruleId || '') === String(ruleId)
    })
  } catch {
    /* 画布状态条可选；失败时静默 */
  }
}

function onVarPick(payload) {
  const k = String(typeof payload === 'string' ? payload : payload?.key || '').trim()
  const scope = (typeof payload === 'object' && payload?.scope === 'rule' ? 'rule' : 'global')
  if (!k) return
  const p = selectedPayload.value
  if (!p) {
    resultOk.value = false
    resultMsg.value = '请先选中一个触发 / 条件 / 变量节点，再点「填入」'
    return
  }
  if (p.kind === 'trigger' && p.trigger) {
    if (p.trigger.type !== 'variable') {
      p.trigger.type = 'variable'
    }
    p.trigger.varKey = k
    p.trigger.varScope = scope
  } else if (p.kind === 'condition' && p.condition) {
    if (!String(p.condition.operator || '').startsWith('var_')) {
      p.condition.operator = 'var_lt'
    }
    p.condition.varKey = k
    p.condition.varScope = scope
  } else if (p.kind === 'action' && p.action) {
    const t = p.action.type
    if (['variable_set', 'var_math', 'var_concat', 'var_fn'].includes(t)) {
      p.action.varKey = k
      p.action.varScope = scope
    } else {
      p.action.type = 'variable_set'
      p.action.varKey = k
      p.action.varScope = scope
    }
  } else {
    resultOk.value = false
    resultMsg.value = '当前节点不支持填入变量'
    return
  }
  nodeInspectorRef.value?.syncFromSelection?.()
  refreshSelected()
  resultOk.value = true
  resultMsg.value = `已填入 ${k}（${scope === 'rule' ? '本规则' : '全局'}）`
}

function onVarInsert(payload) {
  const key = String(payload?.key || '').trim()
  if (!key || !canvasRef.value?.addAtCenter) return
  const scope = payload.scope === 'rule' ? 'rule' : 'global'
  if (payload.kind === 'write') {
    canvasRef.value.addAtCenter({
      key: 'var_set',
      kind: 'action',
      label: '变量值更新',
      actionType: 'variable_set',
      varKey: key,
      varScope: scope,
    })
  } else if (payload.kind === 'trigger') {
    canvasRef.value.addAtCenter({
      key: 'trig_var',
      kind: 'trigger',
      label: '变量变更',
      preset: 'variable',
      varKey: key,
      varScope: scope,
    })
  } else if (payload.kind === 'condition') {
    canvasRef.value.addAtCenter({
      key: 'cond_var',
      kind: 'condition',
      label: '查询变量值',
      preset: 'var_eq',
      varKey: key,
      varScope: scope,
    })
  }
}

function openManageDrawer() {
  openManageDrawerFlags()
  void loadList()
  void discoverHA()
}

useOrchestratorDriftFocus(() => {
  openManageDrawer()
})

function openYamlDrawer() {
  openYamlDrawerFlags(() => {
    canvasRef.value?.commit?.()
  })
}

function startNew() {
  shellStartNew()
  showManage.value = false
  showSettings.value = true
}

/** 顶栏退出：嵌入模式用「清除」重置画布（不打开设置）；浮层模式关闭编辑器 */
async function onChromeDismiss() {
  if (hasOrchestratorBuilderDirty()) {
    const ok = await chrome.confirm(
      '当前联动有未保存的修改，继续将丢弃更改。是否继续？',
      '未保存的修改',
      { confirmText: '丢弃并继续', cancelText: '继续编辑', type: 'warning' },
    )
    if (!ok) return
  }
  if (props.embedded) {
    shellStartNew()
    closeAllDrawers()
  }
  emit('close')
}

async function openSavedItem(item) {
  if (!item?.id) return
  showManage.value = false
  await editItem(item)
}

async function toggleEnabled() {
  actionBusy.value = true
  try {
    await toggleCurrent()
  } finally {
    actionBusy.value = false
  }
}

async function triggerCurrent() {
  if (!editingId.value) return
  if (!enabled.value) {
    resultOk.value = false
    resultMsg.value = '请先启用自动化'
    return
  }
  actionBusy.value = true
  try {
    await triggerItem({ id: editingId.value })
    await loadHistory(String(editingId.value || ''))
  } finally {
    actionBusy.value = false
  }
}

/** 克隆整条自动化：复制 yaml + 默认停用，避免重复触发；新副本不推 HA */
async function cloneItem(item) {
  const id = String(item?.id || '')
  const yaml = String(item?.yaml || '').trim()
  if (!id || !yaml) {
    resultOk.value = false
    resultMsg.value = '该自动化缺少可克隆的配置'
    return
  }
  cloningId.value = id
  try {
    const payload = {
      name: `${item.name || '自动化'}（副本）`,
      yaml,
      enabled: false,
    }
    if (item?.geekGraph) payload.geekGraph = item.geekGraph
    const created = await createOrchestratorItem('automation', payload)
    resultOk.value = true
    resultMsg.value = `已克隆为「${created?.data?.name || '副本'}」，默认停用，可在列表中启用`
    await loadList()
  } catch (e) {
    resultOk.value = false
    resultMsg.value = String(e?.response?.data?.message || e?.message || '克隆失败')
  } finally {
    cloningId.value = ''
  }
}

function confirmDeleteCurrent() {
  if (!editingId.value) return
  const row =
    savedList.value.find((i) => String(i.id) === String(editingId.value)) || {
      id: editingId.value,
      name: graph.name,
    }
  confirmDelete(row)
}

function onTemplateSaved(row) {
  resultOk.value = true
  resultMsg.value = `已保存模板：${row?.name || ''}`
}

function onTemplateRemoved() {
  resultOk.value = true
  resultMsg.value = '已删除我的模板'
}

function onApplyTemplate(tpl) {
  applyTemplate(tpl?.id || tpl)
}

async function onDeclareVar({ key, scope }) {
  if (!showVars.value) {
    varsOpenCreate.value = false
    showVars.value = true
    await Promise.resolve()
  }
  const row = await varsPanelRef.value?.ensureDeclared?.({
    key,
    scope: scope === 'rule' ? 'rule' : 'global',
  })
  if (row) {
    resultOk.value = true
    resultMsg.value = `已声明变量 ${key}`
    await refreshVariableList()
  } else if (!editingId.value && scope === 'rule') {
    resultOk.value = false
    resultMsg.value = '请先保存自动化，再创建本规则变量'
    openVarsDrawer({ create: true })
  }
}

function onGraphFromCanvas(next) {
  Object.assign(graph, next)
  if (!selectedNodeId.value) return
  // 优先绑定画布内活引用，避免面板改顶层字段后被下一轮 commit 覆盖
  const live = canvasRef.value?.getNodeData?.(selectedNodeId.value)
  const snap = next.flowNodes?.find((x) => x.id === selectedNodeId.value)?.data
  if (live || snap) {
    selectedPayload.value = live || snap
    nodeInspectorRef.value?.syncFromSelection?.()
  }
}

function onSelectNode(node) {
  flushChooseBeforeLeave()
  selectedPayload.value = node?.data || null
  nodeInspectorRef.value?.syncFromSelection?.()
}

function appendDeviceAssignFromTrigger() {
  const t = selectedPayload.value?.trigger
  if (!t?.entityId || !canvasRef.value?.addAtCenter) return
  const leaf = getEntityLeaf(t.entityId) || 'device_value'
  canvasRef.value.addAtCenter({
    key: 'var_from_dev',
    kind: 'action',
    label: '设备赋值',
    actionType: 'variable_set',
    varFromDevice: true,
    varKey: `last_${leaf}`,
    varScope: 'global',
    varSourceEntityId: t.entityId,
    varSourceAttribute: t.attribute || '',
  })
  resultOk.value = true
  resultMsg.value = `已追加写变量节点（来源 ${t.entityId}）`
}

function onInspectorNotify({ ok, msg }) {
  resultOk.value = !!ok
  resultMsg.value = String(msg || '')
}

function refreshSelected() {
  refreshSelectedFor(selectedNodeId.value)
}

/** 写回指定节点（离开旧节点时用，避免竞态写到新 id） */
function refreshSelectedFor(nodeId) {
  const data = selectedPayload.value
  if (!data || !nodeId) {
    canvasRef.value?.commit?.()
    return
  }
  if (data.kind === 'trigger' && data.trigger) {
    const s = triggerSummary(data.trigger)
    data.label = s.label
    data.detail = s.detail
  } else if (data.kind === 'condition' && data.condition) {
    const s = conditionSummary(data.condition)
    data.label = s.label
    data.detail = s.detail
  } else if (data.kind === 'note') {
    data.label = '注释'
    data.detail = data.noteText || '注释'
  } else if (data.kind === 'trigger_group' || data.kind === 'condition_group') {
    data.detail = data.groupLogic === 'or' ? '组内任一' : '组内全部'
  } else if (data.kind === 'action' && data.action) {
    const s = actionSummary(data.action)
    data.label = s.label
    data.detail = s.detail
  }
  canvasRef.value?.patchNodeData?.(nodeId, data)
  if (graph.flowNodes) {
    const idx = graph.flowNodes.findIndex((n) => n.id === nodeId)
    if (idx >= 0) {
      graph.flowNodes[idx] = { ...graph.flowNodes[idx], data }
    }
  }
  canvasRef.value?.commit?.()
}

function reset() {
  resetGraphCore()
  approximateHintLocal.value = ''
  resultMsg.value = ''
  showDryRun.value = false
  dryRunResult.value = null
  dryRunError.value = ''
}

async function applyTemplate(idOrTpl) {
  const id = typeof idOrTpl === 'string' ? idOrTpl : idOrTpl?.id
  const tpl = typeof idOrTpl === 'object' && idOrTpl?.graph ? idOrTpl : getGeekTemplate(id)
  if (!tpl?.graph) {
    resultOk.value = false
    resultMsg.value = '无法应用模板：缺少流程图数据'
    return
  }
  if (isGeekGraphNonEmpty(graph)) {
    const ok = await chrome.confirm(
      `应用「${tpl.name}」将替换当前画布内容，是否继续？`,
      '应用模板',
      { type: 'warning', confirmText: '替换并应用' },
    )
    if (!ok) return
  }
  Object.assign(graph, createEmptyGeekGraph(clonePlain(tpl.graph)))
  const laid = layoutCanvasFromGraph(graph)
  graph.flowNodes = laid.nodes
  graph.flowEdges = laid.edges
  showTemplates.value = false
  selectedNodeId.value = null
  selectedPayload.value = null
  const ph = geekTemplateStats(graph).placeholders
  resultMsg.value = ph.length
    ? `已载入模板：${tpl.name}（含 ${ph.length} 个占位实体，保存后可用占位向导替换）`
    : `已载入模板：${tpl.name}`
  resultOk.value = true
  bumpCanvas()
}

watch(
  () => props.initialLocalTemplate,
  (tpl) => {
    if (!tpl?.graph) return
    applyTemplate(tpl)
    emit('local-template-consumed')
  },
  { immediate: true },
)

async function save() {
  await saveAutomation()
}

</script>

<style scoped>
:deep(.geek-builder__settings-drawer) {
  width: min(440px, calc(96vw / var(--hos-scale, 1)));
}
:deep(.geek-builder__settings-body) {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-content: start;
}
.gmp-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 12px;
}
.gmp-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 140px;
}
.gmp-search-ico {
  position: absolute;
  left: 8px;
  opacity: 0.45;
  font-size: var(--premium-fs-micro);
  pointer-events: none;
}
.gmp-search {
  width: 100%;
  padding: 6px 8px 6px 24px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.55);
  color: inherit;
  font-size: var(--premium-fs-micro);
}
.gmp-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gmp-card {
  padding: 10px 12px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gmp-card.is-current {
  border-color: rgba(96, 165, 250, 0.45);
  background: rgba(59, 130, 246, 0.1);
}
.gmp-card-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.gmp-name {
  font-size: var(--premium-fs-caption);
  font-weight: 600;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gmp-badge {
  font-size: var(--premium-fs-micro);
  padding: 2px 6px;
  border-radius: var(--hos-radius-pill);
  border: 1px solid transparent;
}
.gmp-badge.is-on {
  color: #6ee7b7;
  background: rgba(16, 185, 129, 0.14);
  border-color: rgba(52, 211, 153, 0.28);
}
.gmp-badge.is-off {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(248, 113, 113, 0.28);
}
.gmp-badge.is-ha {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.14);
  border-color: rgba(96, 165, 250, 0.28);
}
.gmp-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.gmp-chip {
  height: 26px;
  padding: 0 9px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(30, 41, 59, 0.7);
  color: #cbd5e1;
  font-size: var(--premium-fs-micro);
  cursor: pointer;
}
.gmp-chip:hover:not(:disabled) {
  background: rgba(51, 65, 85, 0.9);
  color: #f8fafc;
}
.gmp-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.gmp-chip.is-danger {
  border-color: rgba(248, 113, 113, 0.35);
  color: #fca5a5;
}
.gmp-empty {
  padding: 28px 12px;
  text-align: center;
  color: #94a3b8;
  font-size: var(--premium-fs-caption);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.gmp-empty p {
  margin: 0;
}
.geek-builder__timeout {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
}
.geek-builder__timeout input {
  width: 72px;
  padding: 8px 10px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(2, 6, 23, 0.35);
  color: inherit;
}
.geek-builder__playback {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  padding-top: 4px;
  border-top: 1px solid rgba(148, 163, 184, 0.14);
}
.geek-builder__playback-label {
  flex: 1 0 100%;
  font-size: var(--premium-fs-micro);
  color: #94a3b8;
}
.geek-builder__dryrun-drawer {
  width: min(680px, calc(96vw / var(--hos-scale, 1))) !important;
}
.geek-builder__dryrun-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: auto;
  padding: 0 12px 16px !important;
}
</style>
