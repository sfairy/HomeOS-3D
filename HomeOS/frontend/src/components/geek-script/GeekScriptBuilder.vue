<!--
  GeekScriptBuilder.vue
  职责：geek-script 脚本编辑器的顶层组件。
       复用 geek-automation 的画布（GeekFlowCanvas）编辑纯动作序列（无触发/条件），
       组合 管理/设置/模板/YAML 等抽屉，负责脚本的创建、编辑、保存、执行，
       以及与 HA 的同步/修复/占位实体向导与运行模式/输入变量配置。
  所属模块：geek-script。
  关键依赖：
    - GeekFlowCanvas（动作序列画布，paletteMode=script）、GeekFlowActionInspector（动作属性检视器）。
    - GeekBuilderChrome / GeekScriptManageDrawer / GeekScriptSettingsDrawer / GeekTemplatesDrawer / GeekYamlPreviewDrawer：编辑器外壳与抽屉。
    - GeekVarMathPanel / GeekVarConcatPanel / GeekCfgCard / OrchestratorActionEditor：动作字段编辑子组件。
    - OrchestratorPlaceholderWizard / OrchestratorSyncAlert / OrchestratorExecutionEngineBadge / OrchestratorTemplateLibrary / OrchestratorLocalTemplatesPanel：业务子组件。
    - useGeekScriptShell / useGeekYamlPreview / useGeekBuilderDrawerChrome / useOrchestratorBatchIo / useOrchestratorTeleport / useOrchestratorDriftFocus：组合式逻辑。
    - geek-automation util（createEmptyGeekGraph / layoutCanvasFromGraph / actionSummary / syncChooseBranchConditionAt）。
    - entities.store / chrome.store：实体索引与全局确认弹窗。
  Props：
    - visible：是否可见。
    - embedded：嵌入式模式（关闭按钮变为「清除」）。
    - showEmbeddedClose：嵌入式下是否展示关闭按钮。
    - initialEditId：初始编辑的脚本 id。
    - openPlaceholderWizard：打开时直接进入占位实体向导。
    - initialLocalTemplate：Hub 本机模板待应用对象。
  Emits：
    - close：关闭编辑器。
    - saved：保存成功（带回脚本信息）。
    - local-template-consumed：本机模板已消费（用于外部清理）。
  关键交互：
    - 顶部 chrome 提供 模板/执行/粘贴 YAML 等动作；脚本无触发/条件，画布仅编排动作序列。
    - 设置抽屉配置运行模式（single/restart/queued/parallel）、HA 执行开关与输入变量字段。
    - HA 执行横幅在检测到需要 HA 时展示，并可一键启用「由 HA 执行」。
    - 漂移/同步告警联动 OrchestratorSyncAlert，支持同步/修复；支持批量导入导出 JSON/YAML。
-->
<template>
  <div class="geek-builder geek-script-builder orch-builder-workspace">
    <GeekBuilderChrome
      v-model:name="graph.name"
      :name-placeholder="'脚本名称'"
      :manage-active="showManage"
      :settings-active="showSettings"
      :yaml-active="showYaml"
      :saving="saving"
      :save-label="saving ? '保存中…' : editingId ? '保存' : '创建并保存'"
      :dismiss-label="embedded ? '清除' : '关闭'"
      :dismiss-title="embedded ? '清空当前编辑' : '关闭'"
      @manage="openManageDrawer"
      @settings="openSettingsDrawer"
      @save="saveScript"
      @yaml="openYamlDrawer"
      @dismiss="onDismiss"
    >
      <template #main>
        <input
          v-model="scriptDesc"
          class="geek-builder__desc"
          :placeholder="'描述（可选）'"
        />
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
          :class="showTemplates && 'is-active'"
          :disabled="saving"
          :title="'打开模板库'"
          @click="openTemplatesDrawer"
        >
          {{ '模板' }}
        </button>
        <button
          v-if="editingId"
          type="button"
          class="list-page__btn"
          :disabled="execRunning"
          :title="'执行脚本'"
          @click="promptExecute({ id: editingId, name: graph.name })"
        >
          {{ execRunning ? '执行中…' : '执行' }}
        </button>
        <button
          v-if="isAdmin"
          type="button"
          class="list-page__btn"
          @click="openPasteYaml"
        >
          {{ '粘贴 YAML' }}
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
      :entity-label="'脚本'"
      @sync-all="doSyncAll"
      @repair-all="doRepairAll"
    />

    <p v-if="resultMsg" :class="['geek-builder__msg', resultOk ? 'is-ok' : 'is-err']">
      {{ resultMsg }}
    </p>

    <GeekScriptManageDrawer
      :open="showManage"
      :map-script-history="mapScriptHistory"
      :script-engine-sections="scriptEngineSections"
      :engine-caps="engineCaps"
      :saved-list="savedList"
      :ha-import-list="haImportList"
      :sync-status-map="syncStatusMap"
      :is-admin="isAdmin"
      :syncing="syncing"
      :deleting-ha-id="deletingHaId"
      :drift-count="driftCount"
      :batch-exporting="batchExporting"
      :batch-importing="batchImporting"
      :import-flow-importing="importFlowImporting"
      :cloning-id="cloningId"
      @close="showManage = false"
      @start-new="onManageStartNew"
      @sync-all="doSyncAll"
      @repair-all="doRepairAll"
      @edit="openSavedItem"
      @delete="confirmDelete"
      @discover="discoverHA"
      @pull-all="doPullAll"
      @import="doImport"
      @ha-delete="confirmHaDelete"
      @batch-export-json="batchExportJson"
      @batch-export-yaml="batchExportYaml"
      @batch-pick-import="batchPickImportFile"
      @open-paste-yaml="openPasteYaml"
      @bulk-import-discovered="bulkImportDiscovered"
      @clone="cloneItem"
      @prompt-execute="promptExecute"
      @repair="doRepair"
      @sync="doSync"
    />

    <GeekTemplatesDrawer
      :open="showTemplates"
      aria-label="脚本模板库"
      @close="showTemplates = false"
    >
      <OrchestratorTemplateLibrary
        title="脚本模板库"
        :templates="builtinTemplates"
        :installing-id="installingTpl"
        storage-key="homeos_orch_tpl_geek_script"
        :default-collapsed="false"
        @install="onInstallTemplate"
      />
      <OrchestratorLocalTemplatesPanel
        kind="script"
        title="我的模板"
        name-placeholder="例如：回家开灯序列"
        empty-hint="当前画布没有动作，无法保存"
        :current-graph="graph"
        :current-meta="localTemplateMeta"
        @apply="onApplyLocalTemplate"
        @saved="onLocalTemplateSaved"
        @removed="onLocalTemplateRemoved"
      />
      <template #footer>
        <p class="geek-builder__vars-hint geek-builder__vars-hint--muted">
          {{ '应用会替换当前画布；含 *_placeholder 的实体可在保存后用占位向导替换。' }}
        </p>
      </template>
    </GeekTemplatesDrawer>

    <GeekScriptSettingsDrawer
      :open="showSettings"
      v-model:mode="graph.mode"
      v-model:run-on-ha="runOnHa"
      :ha-execution-needs="haExecutionNeeds"
      :ha-execution-reasons="haExecutionReasons"
      :saving="saving"
      :exec-running="execRunning"
      :editing-id="editingId"
      :fields="fields"
      @close="showSettings = false"
      @enable-ha="enableHaExecution"
      @start-new="startNew"
      @reset-canvas="resetCanvasKeepEdit"
      @delete-current="confirmDeleteCurrent"
      @add-field="addField"
      @remove-field="(fi) => fields.splice(fi, 1)"
    />

    <GeekYamlPreviewDrawer
      :open="showYaml"
      subtitle="由当前画布实时编译；保存时写入脚本记录"
      :yaml-html="yamlHtml"
      @close="showYaml = false"
      @copy="copyYaml"
    />

    <div class="geek-builder__stage">
      <GeekFlowCanvas
        :key="canvasKey"
        ref="canvasRef"
        palette-mode="script"
        :graph="graph"
        v-model:selected-node-id="selectedNodeId"
        :engine-caps="engineCaps"
        @update:graph="onGraphFromCanvas"
        @select="onSelectNode"
        @hint="onCanvasHint"
      />

      <aside
        :class="['geek-builder__inspector', showInspector && 'is-open']"
        aria-label="节点配置"
      >
        <header class="geek-builder__inspector-head">
          <div>
            <p class="geek-builder__inspector-kicker">{{ '配置节点' }}</p>
            <h4>{{ inspectorTitle }}</h4>
          </div>
          <button type="button" class="list-page__link-btn" @click="clearSelection">
            {{ '收起' }}
          </button>
        </header>
        <div v-if="showInspector" :key="selectedNodeId || 'none'" class="geek-builder__inspector-body">
          <div class="geek-insp-stack">
          <p v-if="actionUnsupportedHint" class="geek-hint geek-hint--warn">{{ actionUnsupportedHint }}</p>
          <template v-if="selectedPayload?.kind === 'note'">
            <GeekCfgCard title="注释" accent desc="仅画布说明，不会编译进可执行 YAML。">
              <label class="geek-field">
                <span>{{ '注释内容' }}</span>
                <textarea
                  v-model="selectedPayload.noteText"
                  rows="4"
                  class="geek-textarea"
                  @change="refreshSelectedNote"
                />
              </label>
            </GeekCfgCard>
          </template>
          <template v-else-if="selectedPayload?.action?.type === 'note'">
            <GeekCfgCard title="注释" accent desc="仅画布说明，不会编译进可执行 YAML。">
              <label class="geek-field">
                <span>{{ '注释内容' }}</span>
                <textarea
                  v-model="selectedPayload.action.noteText"
                  rows="4"
                  class="geek-textarea"
                  @change="refreshSelectedAction"
                />
              </label>
            </GeekCfgCard>
          </template>
          <template
            v-else-if="
              selectedPayload?.action &&
              ['stop', 'repeat', 'parallel', 'choose'].includes(selectedPayload.action.type)
            "
          >
            <button
              type="button"
              class="wr-btn-add wr-btn-add--subtle"
              title="在画布上追加一个动作节点"
              @click="onAddCanvasAction"
            >
              {{ '+ 添加下一个动作' }}
            </button>
            <GeekFlowActionInspector
              ref="flowInspectorRef"
              v-model="selectedPayload.action"
              @change="refreshSelectedAction"
            />
          </template>
          <template
            v-else-if="
              selectedPayload?.action &&
              ['var_math', 'var_concat'].includes(selectedPayload.action.type)
            "
          >
            <button
              type="button"
              class="wr-btn-add wr-btn-add--subtle"
              title="在画布上追加一个动作节点"
              @click="onAddCanvasAction"
            >
              {{ '+ 添加下一个动作' }}
            </button>
            <div class="geek-switch-row">
              <div class="geek-switch-row__label">
                <strong>{{ '失败后继续' }}</strong>
                <span>{{ '出错时是否跳过并执行后续动作' }}</span>
              </div>
              <div class="geek-seg" role="group" aria-label="失败后继续">
                <button
                  type="button"
                  :class="['geek-seg__btn', !selectedPayload.action.continueOnError && 'is-on']"
                  @click="onScriptContinueOnError('0')"
                >
                  {{ '中止' }}
                </button>
                <button
                  type="button"
                  :class="['geek-seg__btn', 'is-warn', selectedPayload.action.continueOnError && 'is-on']"
                  @click="onScriptContinueOnError('1')"
                >
                  {{ '继续' }}
                </button>
              </div>
            </div>
            <GeekVarMathPanel
              v-if="selectedPayload.action.type === 'var_math'"
              v-model="selectedPayload.action"
              @change="refreshSelectedAction"
            />
            <GeekVarConcatPanel
              v-else
              v-model="selectedPayload.action"
              @change="refreshSelectedAction"
            />
          </template>
          <OrchestratorActionEditor
            v-else-if="editorActions.length"
            :key="selectedNodeId || 'action-editor'"
            v-model:actions="editorActions"
            v-model:service-panel="sbData"
            variant="script"
            canvas-fold-branches
            :scene-options="sceneOptions"
            :script-options="scriptOptions"
            :home-modes="homeModes"
            :all-domains="allDomains"
            :services-for-domain="servicesForDomain"
            :is-action-unsupported="isActionUnsupported"
            show-params-key="_showSbParams"
            @add="onAddCanvasAction"
            @apply-service-data="applySbDataBuilderHandler"
            @sync-service-data="syncSbFromDataHandler"
            @reset-service-data="resetSbDataHandler"
          />
          </div>
          <button type="button" class="list-page__link-btn geek-yaml-open" @click="openYamlDrawer">
            {{ '打开 YAML 预览' }}
          </button>
        </div>
      </aside>
    </div>

    <Teleport :to="teleportTarget" :disabled="teleportDisabled">
      <Transition name="wr-modal">
        <div v-if="pasteYamlOpen" class="wr-modal-shade" @click.self="closePasteYaml">
          <div class="wr-modal-box wr-modal-box--wide">
            <h4 class="wr-modal-title">{{ '粘贴脚本 YAML' }}</h4>
            <p class="wr-modal-desc">
              {{ '粘贴 alias / sequence 完整 YAML，将创建新脚本记录。' }}
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
              placeholder="alias: 夜间关灯&#10;sequence:&#10;  - delay: 00:00:02"
            />
            <div class="wr-modal-actions">
              <button class="wr-btn-primary wr-btn-primary--ghost" type="button" @click="closePasteYaml">
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
    </Teleport>

    <OrchestratorPlaceholderWizard
      :open="phWizardOpen"
      :loading="phWizardLoading"
      :saving="phWizardSaving"
      :automation-name="phWizardName"
      kind-label="脚本"
      :rows="phWizardRows"
      v-model:replacements="phWizardReplacements"
      @close="closePlaceholderWizard"
      @apply="onApplyPlaceholders"
    />

    <Teleport :to="teleportTarget" :disabled="teleportDisabled">
      <Transition name="wr-modal">
        <div v-if="showExecModal" class="wr-modal-shade" @click.self="showExecModal = false">
          <div class="wr-modal-box">
            <h4 class="wr-modal-title">{{ `执行脚本 · ${execTarget?.name || ''}` }}</h4>
            <p v-if="!execFields.length" class="wr-modal-desc">{{ '确认立即执行此脚本？' }}</p>
            <div v-else class="wr-exec-fields">
              <div v-for="(f, fi) in execFields" :key="fi" class="wr-line">
                <span class="wr-label">{{ f.name }}</span>
                <input
                  v-if="f.selector !== 'boolean'"
                  v-model="execVars[f.name]"
                  class="wr-num wr-num--w180"
                  :type="f.selector === 'number' ? 'number' : 'text'"
                  :placeholder="f.description || f.name"
                />
                <HosSelect v-else v-model="execVars[f.name]" variant="orchestrator" size="xs" fit>
                  <option value="true">{{ '是' }}</option>
                  <option value="false">{{ '否' }}</option>
                </HosSelect>
              </div>
            </div>
            <div class="wr-modal-actions">
              <button
                class="wr-btn-primary wr-btn-primary--ghost"
                type="button"
                @click="showExecModal = false"
              >
                {{ '取消' }}
              </button>
              <button
                class="wr-btn-primary"
                type="button"
                :disabled="execRunning"
                @click="confirmExecute"
              >
                {{ execRunning ? '执行中…' : '确认执行' }}
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
import { computed, onMounted, reactive, ref, watch } from 'vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import GeekFlowCanvas from '@/components/geek-automation/GeekFlowCanvas.vue'
import GeekFlowActionInspector from '@/components/geek-automation/GeekFlowActionInspector.vue'
import GeekVarMathPanel from '@/components/geek-automation/GeekVarMathPanel.vue'
import GeekVarConcatPanel from '@/components/geek-automation/GeekVarConcatPanel.vue'
import GeekCfgCard from '@/components/geek-automation/GeekCfgCard.vue'
import GeekYamlPreviewDrawer from '@/components/geek-automation/GeekYamlPreviewDrawer.vue'
import GeekTemplatesDrawer from '@/components/geek-automation/GeekTemplatesDrawer.vue'
import GeekBuilderChrome from '@/components/geek-automation/GeekBuilderChrome.vue'
import GeekScriptManageDrawer from '@/components/geek-script/GeekScriptManageDrawer.vue'
import GeekScriptSettingsDrawer from '@/components/geek-script/GeekScriptSettingsDrawer.vue'
import OrchestratorActionEditor from '@/components/dashboard/OrchestratorActionEditor.vue'
import { createOrchestratorItem, fetchOrchestratorList } from '@/services/api/orchestrator'
import { useOrchestratorBatchIo } from '@/composables/orchestrator/useOrchestratorBatchIo'
import { fetchHomeModes } from '@/services/api/home-modes'
import { normalizeCrudListResponse } from '@/utils/orchestrator/sync-issues.util'
import OrchestratorExecutionEngineBadge from '@/components/dashboard/OrchestratorExecutionEngineBadge.vue'
import OrchestratorPlaceholderWizard from '@/components/dashboard/OrchestratorPlaceholderWizard.vue'
import OrchestratorSyncAlert from '@/components/dashboard/OrchestratorSyncAlert.vue'
import OrchestratorTemplateLibrary from '@/components/dashboard/OrchestratorTemplateLibrary.vue'
import OrchestratorLocalTemplatesPanel from '@/components/dashboard/OrchestratorLocalTemplatesPanel.vue'
import '@/components/dashboard/styles/AutomationBuilder.css'
import '@/components/geek-automation/styles/geek-builder-shared.css'
import { useGeekScriptShell } from '@/composables/orchestrator/useGeekScriptShell'
import { useGeekYamlPreview } from '@/composables/orchestrator/useGeekYamlPreview'
import { useGeekBuilderDrawerChrome } from '@/composables/orchestrator/useGeekBuilderDrawerChrome'
import { useOrchestratorTeleport } from '@/composables/orchestrator/useOrchestratorTeleport'
import { useOrchestratorDriftFocus } from '@/composables/orchestrator/useOrchestratorDriftFocus'
import { hasOrchestratorBuilderDirty } from '@/composables/settings/hub-backup-orchestrator.internals'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { createEmptyGeekGraph } from '@/utils/geek-automation/graph-types'
import { layoutCanvasFromGraph, actionSummary } from '@/utils/geek-automation/canvas.util'
import {
  isLocalCanvasGraphNonEmpty,
  localCanvasTemplateStats,
} from '@/utils/orchestrator/local-canvas-templates.util'
import { allEntityDomains } from '@/utils/entity/state-options.util'
import { servicesForDomainBuilder } from '@/utils/registry/widget-catalog'
import { isFormActionUnsupportedForScript } from '@/utils/orchestrator/automation-local-engine.util'
import { splitGeekRestoreHint } from '@/utils/orchestrator/geek-restore-hint.util'
import { syncChooseBranchConditionAt } from '@/utils/orchestrator/choose-branch-condition.util'

const props = defineProps({
  visible: { type: Boolean, default: true },
  embedded: { type: Boolean, default: false },
  showEmbeddedClose: { type: Boolean, default: false },
  initialEditId: { type: String, default: null },
  openPlaceholderWizard: { type: Boolean, default: false },
  /** Hub 本机模板待应用 */
  initialLocalTemplate: { type: Object, default: null },
})

const emit = defineEmits(['close', 'saved', 'local-template-consumed'])

const entitiesStore = useEntitiesStore()
const chrome = useChromeStore()
const { teleportTarget, teleportDisabled } = useOrchestratorTeleport()

const graph = reactive(createEmptyGeekGraph({ name: '脚本' }))
const scriptDesc = ref('')
const fields = ref([])
const editingId = ref(null)
const runOnHa = ref(false)
const {
  showSettings,
  showYaml,
  showManage,
  showTemplates,
  openManageDrawer: openManageDrawerFlags,
  openYamlDrawer: openYamlDrawerFlags,
  openSettingsDrawer,
  openTemplatesDrawer: openTemplatesDrawerFlags,
} = useGeekBuilderDrawerChrome()
const selectedNodeId = ref(null)
const selectedPayload = ref(null)
const canvasRef = ref(null)
const flowInspectorRef = ref(null)
const canvasKey = ref(0)
const editorActions = ref([])

/** 画布撤销/重做可用态（读子组件暴露的响应式 computed ref） */
const canvasCanUndo = computed(() => Boolean(canvasRef.value?.canUndo?.value))
const canvasCanRedo = computed(() => Boolean(canvasRef.value?.canRedo?.value))

const allDomains = computed(() => allEntityDomains(entitiesStore))
const servicesForDomain = servicesForDomainBuilder

function formSignature() {
  return JSON.stringify({
    name: graph.name,
    mode: graph.mode,
    scriptDesc: scriptDesc.value,
    fields: fields.value,
    actions: graph.actions,
    runOnHa: runOnHa.value,
  })
}

const localTemplateMeta = computed(() => ({
  fields: fields.value,
  scriptDesc: scriptDesc.value,
  runOnHa: runOnHa.value,
}))

function applyLoaded({ graph: next, scriptDesc: desc, fields: f }) {
  Object.assign(graph, createEmptyGeekGraph(next))
  if (!graph.flowNodes?.length) {
    const laid = layoutCanvasFromGraph(graph)
    graph.flowNodes = laid.nodes
    graph.flowEdges = laid.edges
  }
  scriptDesc.value = desc || ''
  fields.value = f || []
  selectedNodeId.value = null
  selectedPayload.value = null
  bumpCanvas()
}

function resetGraphCore() {
  Object.assign(graph, createEmptyGeekGraph({ name: '脚本' }))
  const laid = layoutCanvasFromGraph(graph)
  graph.flowNodes = laid.nodes
  graph.flowEdges = laid.edges
  scriptDesc.value = ''
  fields.value = []
  editingId.value = null
  runOnHa.value = false
  selectedNodeId.value = null
  selectedPayload.value = null
  bumpCanvas()
}

const shell = useGeekScriptShell({
  props,
  graph,
  scriptDesc,
  fields,
  editingId,
  runOnHa,
  formSignature,
  applyLoaded,
  resetGraph: resetGraphCore,
  getCanvasError: () => canvasRef.value?.validate?.() || null,
  commitCanvas: () => canvasRef.value?.commit?.(),
  onSaved: () => emit('saved'),
})

const {
  isAdmin,
  saving,
  yamlPreview,
  approximateHint,
  haExecutionNeeds,
  haExecutionReasons,
  enableHaExecution,
  saveScript,
  startNew,
  copyYaml,
  openPasteYaml,
  closePasteYaml,
  submitPasteYaml,
  pasteYamlOpen,
  pasteYamlText,
  pasteYamlName,
  importFlowImporting,
  sbData,
  applySbDataBuilder,
  syncSbFromData,
  resetSbData,
  engineCaps,
  scriptEngineSections,
  mapScriptHistory,
  builtinTemplates,
  installingTpl,
  installTemplate,
  savedList,
  haImportList,
  syncStatusMap,
  syncing,
  deletingHaId,
  driftCount,
  repairProgress,
  loadList,
  discoverHA,
  doSync,
  doRepair,
  doSyncAll,
  doRepairAll,
  doPullAll,
  doImport,
  bulkImportDiscovered,
  confirmHaDelete,
  confirmDelete,
  closeDeleteConfirm,
  executeDelete,
  editItem,
  loadItem,
  resultMsg,
  resultOk,
  showDeleteConfirm,
  deleteMode,
  deletingLocal,
  deleteLocalMessage,
  deleteHaMessage,
  showExecModal,
  execTarget,
  execFields,
  execVars,
  execRunning,
  promptExecute,
  confirmExecute,
  phWizardOpen,
  phWizardLoading,
  phWizardSaving,
  phWizardName,
  phWizardRows,
  phWizardReplacements,
  closePlaceholderWizard,
  applyPlaceholderReplacements,
} = shell

/** 批量导出 / 导入 */
const {
  exporting: batchExporting,
  importing: batchImporting,
  exportJson: batchExportJson,
  exportYaml: batchExportYaml,
  pickImportFile: batchPickImportFile,
} = useOrchestratorBatchIo({
  kind: 'script',
  entityLabel: '脚本',
  getItems: () => savedList.value,
  refresh: async () => {
    await loadList()
  },
  notify: (ok, msg) => {
    resultOk.value = ok
    resultMsg.value = msg
  },
})

const approximateHintParts = computed(() => splitGeekRestoreHint(approximateHint.value))

const yamlHtml = useGeekYamlPreview(yamlPreview)

const sceneOptions = ref([])
const scriptOptions = ref([])
const homeModes = ref([])

const showInspector = computed(() => {
  const p = selectedPayload.value
  if (!p) return false
  if (p.kind === 'note') return true
  if (p.kind === 'action' && p.action) return true
  return false
})

const inspectorTitle = computed(() => {
  const p = selectedPayload.value
  if (!p) return '节点'
  if (p.kind === 'note' || p.action?.type === 'note') return '注释'
  return p.label || '动作'
})

async function loadOrchestratorPickers() {
  try {
    const [scenes, scripts, modes] = await Promise.all([
      fetchOrchestratorList('scene'),
      fetchOrchestratorList('script'),
      fetchHomeModes().catch(() => null),
    ])
    sceneOptions.value = normalizeCrudListResponse(scenes?.data).rows
    scriptOptions.value = normalizeCrudListResponse(scripts?.data).rows
    homeModes.value = normalizeCrudListResponse(modes?.data).rows
  } catch {
    /* 选择器失败不阻断编辑 */
  }
}

function bumpCanvas() {
  canvasKey.value += 1
}

function onGraphFromCanvas(next) {
  Object.assign(graph, next)
}

function flushChooseBeforeLeave() {
  const prevId = selectedNodeId.value
  flowInspectorRef.value?.flush?.()
  if (!prevId || !selectedPayload.value) return
  if (selectedPayload.value.kind === 'note') {
    refreshSelectedNote()
    return
  }
  refreshSelectedActionFor(prevId)
}

/** 走 OrchestratorActionEditor 的动作才写入 editorActions（避免 choose 等触发 deep watch 递归） */
const FLOW_INSPECTOR_ACTION_TYPES = new Set(['stop', 'repeat', 'parallel', 'sequence', 'choose'])

function onSelectNode(node) {
  flushChooseBeforeLeave()
  selectedPayload.value = node?.data || null
  const action = selectedPayload.value?.action
  if (
    selectedPayload.value?.kind === 'action' &&
    action &&
    action.type !== 'note' &&
    !FLOW_INSPECTOR_ACTION_TYPES.has(action.type) &&
    !['var_math', 'var_concat'].includes(action.type)
  ) {
    editorActions.value = [action]
    // 先清空再按需回填，避免服务参数面板残留上一个节点的值
    resetSbData()
    if (action.type === 'callService') syncSbFromData(action)
  } else {
    editorActions.value = []
    resetSbData()
  }
}

function onScriptContinueOnError(value) {
  const a = selectedPayload.value?.action
  if (!a) return
  a.continueOnError = String(value) === '1'
  refreshSelectedAction()
}

/** 写回当前选中动作（供 @change 使用，勿把事件值当成 nodeId） */
function refreshSelectedAction() {
  refreshSelectedActionFor(selectedNodeId.value)
}

/** 写回指定节点（离开旧节点时用） */
function refreshSelectedActionFor(nodeId) {
  const data = selectedPayload.value
  if (!data?.action || !nodeId) return
  if (
    editorActions.value[0] &&
    editorActions.value[0] !== data.action &&
    !['var_math', 'var_concat'].includes(data.action.type)
  ) {
    Object.assign(data.action, editorActions.value[0])
  }
  // choose：单条件时扁平 → conditions[0]；多条件由 GeekFlowActionInspector 自行维护
  if (data.action.type === 'choose' && Array.isArray(data.action.branches)) {
    for (const br of data.action.branches) {
      if (!br || br.isDefault) continue
      if (Array.isArray(br.conditions) && br.conditions.length > 1) continue
      syncChooseBranchConditionAt(br, 0)
    }
  }
  const s = actionSummary(data.action)
  data.label = s.label
  data.detail = s.detail
  canvasRef.value?.patchNodeData?.(nodeId, data)
  canvasRef.value?.commit?.()
}

function refreshSelectedNote() {
  const data = selectedPayload.value
  const nodeId = selectedNodeId.value
  if (!data || data.kind !== 'note' || !nodeId) return
  data.detail = data.noteText || '注释'
  canvasRef.value?.patchNodeData?.(nodeId, data)
  canvasRef.value?.commit?.()
}

watch(
  editorActions,
  (list) => {
    const t = list?.[0]?.type
    if (!list?.length || !t) return
    // choose/repeat 等由 Inspector @change 刷新；此处 deep watch 再 sync 会递归更新
    if (FLOW_INSPECTOR_ACTION_TYPES.has(t) || t === 'var_math' || t === 'var_concat') return
    refreshSelectedAction()
  },
  { deep: true },
)

function clearSelection() {
  flushChooseBeforeLeave()
  selectedNodeId.value = null
  selectedPayload.value = null
  editorActions.value = []
  resetSbData()
}

/** Inspector「添加动作」→ 画布追加节点（接在链尾），不改当前节点表单数组 */
function onAddCanvasAction() {
  canvasRef.value?.addAtCenter?.({
    key: 'svc',
    kind: 'action',
    label: '执行操作',
    badge: '◎',
    actionType: 'callService',
  })
}

onMounted(() => {
  void loadOrchestratorPickers()
})

function onCanvasHint(msg) {
  if (!msg) return
  resultMsg.value = String(msg)
  resultOk.value = false
}

function addField() {
  fields.value.push({ name: '', description: '', selector: 'text', default: '' })
}

function resetCanvasKeepEdit() {
  const id = editingId.value
  const name = graph.name
  const mode = graph.mode
  const ha = runOnHa.value
  const keepFields = fields.value
  const keepDesc = scriptDesc.value
  Object.assign(graph, createEmptyGeekGraph({ name, mode }))
  const laid = layoutCanvasFromGraph(graph)
  graph.flowNodes = laid.nodes
  graph.flowEdges = laid.edges
  fields.value = keepFields
  scriptDesc.value = keepDesc
  runOnHa.value = ha
  editingId.value = id
  selectedNodeId.value = null
  selectedPayload.value = null
  editorActions.value = []
  bumpCanvas()
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

function applySbDataBuilderHandler(action) {
  const target = action || editorActions.value[0]
  if (!target) return
  applySbDataBuilder(target)
  refreshSelectedAction()
}

function syncSbFromDataHandler(action) {
  const target = action || editorActions.value[0]
  if (!target) return
  syncSbFromData(target)
  refreshSelectedAction()
}

function resetSbDataHandler() {
  resetSbData()
  refreshSelectedAction()
}

function isActionUnsupported(type) {
  return isFormActionUnsupportedForScript(type, shell.engineCaps.value)
}

const actionUnsupportedHint = computed(() => {
  const t = selectedPayload.value?.action?.type
  if (!t || t === 'note') return ''
  if (!isFormActionUnsupportedForScript(t, engineCaps.value)) return ''
  return '当前动作本地脚本引擎不支持执行；请勾选「由 HA 执行」后再保存或运行。'
})

function onDismiss() {
  void dismissEditor()
}

async function dismissEditor() {
  if (hasOrchestratorBuilderDirty()) {
    const ok = await chrome.confirm(
      '当前脚本有未保存的修改，继续将丢弃更改。是否继续？',
      '未保存的修改',
      { confirmText: '丢弃并继续', cancelText: '继续编辑', type: 'warning' },
    )
    if (!ok) return
  }
  if (props.embedded) {
    startNew()
  }
  emit('close')
}

function openManageDrawer() {
  openManageDrawerFlags()
  void loadList()
  void discoverHA()
}

function openYamlDrawer() {
  openYamlDrawerFlags()
}

function openTemplatesDrawer() {
  openTemplatesDrawerFlags()
}

useOrchestratorDriftFocus(() => {
  openManageDrawer()
})

function onManageStartNew() {
  startNew()
  showManage.value = false
}

async function openSavedItem(item) {
  if (!item?.id) return
  showManage.value = false
  await editItem(item)
}

/** 克隆整条脚本：复制 yaml 内容，新副本不推 HA */
const cloningId = ref('')
async function cloneItem(item) {
  const id = String(item?.id || '')
  const yaml = String(item?.yaml || '').trim()
  if (!id || !yaml) {
    resultOk.value = false
    resultMsg.value = '该脚本缺少可克隆的配置'
    return
  }
  cloningId.value = id
  try {
    const payload = {
      name: `${item.name || '脚本'}（副本）`,
      yaml,
    }
    if (item?.geekGraph) payload.geekGraph = item.geekGraph
    const created = await createOrchestratorItem('script', payload)
    resultOk.value = true
    resultMsg.value = `已克隆为「${created?.data?.name || '副本'}」`
    await loadList()
  } catch (e) {
    resultOk.value = false
    resultMsg.value = String(e?.response?.data?.message || e?.message || '克隆失败')
  } finally {
    cloningId.value = ''
  }
}

async function onInstallTemplate(tpl) {
  await installTemplate(tpl)
  showTemplates.value = false
}

async function onApplyLocalTemplate(tpl) {
  if (!tpl?.graph) {
    resultOk.value = false
    resultMsg.value = '无法应用模板：缺少流程图数据'
    return
  }
  if (isLocalCanvasGraphNonEmpty('script', graph)) {
    const ok = await chrome.confirm(
      `应用「${tpl.name}」将替换当前画布内容，是否继续？`,
      '应用模板',
      { type: 'warning', confirmText: '替换并应用' },
    )
    if (!ok) return
  }
  applyLoaded({
    graph: tpl.graph,
    scriptDesc: tpl.meta?.scriptDesc || '',
    fields: Array.isArray(tpl.meta?.fields) ? tpl.meta.fields : [],
  })
  if (typeof tpl.meta?.runOnHa === 'boolean') runOnHa.value = tpl.meta.runOnHa
  approximateHint.value = ''
  showTemplates.value = false
  const ph = localCanvasTemplateStats('script', graph).placeholders
  resultMsg.value = ph.length
    ? `已载入模板：${tpl.name}（含 ${ph.length} 个占位实体，保存后可用占位向导替换）`
    : `已载入模板：${tpl.name}`
  resultOk.value = true
}

watch(
  () => props.initialLocalTemplate,
  (tpl) => {
    if (!tpl?.graph) return
    onApplyLocalTemplate(tpl)
    emit('local-template-consumed')
  },
  { immediate: true },
)

function onLocalTemplateSaved(row) {
  resultOk.value = true
  resultMsg.value = `已保存模板：${row?.name || ''}`
}

function onLocalTemplateRemoved() {
  resultOk.value = true
  resultMsg.value = '已删除我的模板'
}

async function onApplyPlaceholders() {
  if (typeof applyPlaceholderReplacements !== 'function') return
  const ok = await applyPlaceholderReplacements()
  if (ok && editingId.value) await loadItem(editingId.value)
}

// 初始化空白画布布局
const laid = layoutCanvasFromGraph(graph)
graph.flowNodes = laid.nodes
graph.flowEdges = laid.edges
</script>

<style scoped>
.geek-builder__desc {
  flex: 1;
  max-width: 280px;
  min-width: 140px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  color: inherit;
}
:deep(.geek-builder__settings-drawer) {
  width: min(440px, calc(96vw / var(--hos-scale, 1)));
}
:deep(.geek-builder__settings-body) {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-content: start;
}
.geek-script-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.geek-script-fields__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.geek-script-fields__row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}
.geek-script-fields__input {
  flex: 1;
  min-width: 80px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
  color: inherit;
}
.geek-script-fields__input--wide {
  flex: 1 1 100%;
  min-width: 140px;
}
</style>
