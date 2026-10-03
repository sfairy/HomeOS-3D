<!--
  GeekSceneBuilder.vue
  职责：geek-scene 场景编辑器的顶层组件。
       组合 星形画布（GeekSceneCanvas）+ 实体参数编辑面板 + 管理/设置/模板/YAML 等抽屉，
       负责场景的创建、编辑、保存、执行、叠加执行与取消恢复，以及与 HA 的同步/修复/占位实体向导。
  所属模块：geek-scene。
  关键依赖：
    - GeekSceneCanvas（星形画布）、SceneEntityParamsPanel（实体参数编辑）、GeekDeviceCatalog（实体选择）。
    - GeekBuilderChrome / GeekManageDrawer / GeekManagePanel / GeekSettingsDrawer / GeekTemplatesDrawer / GeekYamlPreviewDrawer：编辑器外壳与抽屉。
    - SceneBatchPickerModal / OrchestratorPlaceholderWizard / OrchestratorSyncAlert / OrchestratorExecutionEngineBadge / OrchestratorTemplateLibrary / OrchestratorLocalTemplatesPanel：业务子组件。
    - useGeekSceneShell / useGeekYamlPreview / useGeekBuilderDrawerChrome / useOrchestratorBatchIo / useOrchestratorTeleport / useOrchestratorDriftFocus / useSceneBatchPicker：组合式逻辑。
    - geek-scene util（createEmptySceneGeekGraph / entityNodeId / reconcileSceneGraphLayout / syncSceneGraphNodeData）。
    - entities.store / chrome.store：实体索引与全局确认弹窗。
  Props：
    - visible：是否可见。
    - embedded：嵌入式模式（关闭按钮变为「清除」）。
    - showEmbeddedClose：嵌入式下是否展示关闭按钮。
    - initialEditId：初始编辑的场景 id。
    - openPlaceholderWizard：打开时直接进入占位实体向导。
    - initialLocalTemplate：初始载入的本机模板对象。
  Emits：
    - close：关闭编辑器。
    - saved：保存成功（带回场景信息）。
    - local-template-consumed：本机模板已消费（用于外部清理）。
  关键交互：
    - 顶部 chrome 提供 模板/执行/取消执行/添加实体/批量添加/粘贴 YAML/删除实体 等动作。
    - 选中实体时联动 SceneEntityParamsPanel 编辑参数；多选时支持批量删除。
    - 叠加执行（overlay）前采集快照，可通过「取消执行」恢复到执行前状态。
    - HA 执行横幅在检测到需要 HA 时展示，并可一键启用「由 HA 执行」。
    - 漂移/同步告警联动 OrchestratorSyncAlert，支持同步/修复。
-->
<template>
  <div class="geek-builder geek-scene-builder orch-builder-workspace">
    <GeekBuilderChrome
      v-model:name="graph.name"
      :name-placeholder="'场景名称'"
      :manage-active="showManage"
      :settings-active="showSettings"
      :yaml-active="showYaml"
      :saving="saving"
      :save-label="saving ? '保存中…' : editingId ? '保存' : '创建并保存'"
      :dismiss-label="embedded ? '清除' : '关闭'"
      :dismiss-title="embedded ? '清空当前编辑' : '关闭'"
      @manage="openManageDrawer"
      @settings="openSettingsDrawer"
      @save="saveScene"
      @yaml="() => openYamlDrawer()"
      @dismiss="onDismiss"
    >
      <template #main>
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
          :title="'执行场景'"
          @click="executeScene({ id: editingId, name: graph.name })"
        >
          {{ '执行' }}
        </button>
        <button
          v-if="cancelableSceneId"
          type="button"
          class="list-page__btn"
          :title="'取消最近一次叠加执行（恢复到执行前快照）'"
          @click="cancelScene()"
        >
          {{ '取消执行' }}
        </button>
        <button type="button" class="list-page__btn" :title="'添加一个空实体节点'" @click="addEntity">
          {{ '添加实体' }}
        </button>
        <button type="button" class="list-page__btn" @click="showBatchPicker = true">
          {{ '批量添加' }}
        </button>
        <button v-if="isAdmin" type="button" class="list-page__btn" @click="openPasteYaml">
          {{ '粘贴 YAML' }}
        </button>
        <button
          v-if="selectedEntityIndex != null || selectedMultiCount > 1"
          type="button"
          class="list-page__btn"
          @click="canvasRef?.removeSelected?.() ?? removeSelectedEntity()"
        >
          {{ selectedMultiCount > 1 ? `删除 ${selectedMultiCount} 个` : '删除实体' }}
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
      :entity-label="'场景'"
      @sync-all="doSyncAll"
      @repair-all="doRepairAll"
    />

    <p v-if="resultMsg" :class="['geek-builder__msg', resultOk ? 'is-ok' : 'is-err']">
      {{ resultMsg }}
    </p>

    <GeekManageDrawer
      :open="showManage"
      aria-label="场景管理"
      title="管理"
      subtitle="全部场景：打开、推送 HA、修复漂移、执行、粘贴 YAML"
      @close="showManage = false"
    >
      <GeekManagePanel
        history-title="场景执行"
        history-endpoint="/scene/history/executions"
        :history-map-record="mapSceneHistory"
        history-storage-key="homeos_orch_exec_geek_scene"
        engine-title="执行说明"
        engine-storage-key="homeos_orch_engine_geek_scene"
        :engine-sections="sceneEngineSections"
        :engine-limitations="engineCaps?.limitations || []"
        :show-engine-caps="!!engineCaps"
        :saved-list="savedList"
        :ha-import-list="haImportList"
        :sync-status-map="syncStatusMap"
        :is-admin="isAdmin"
        :syncing="syncing"
        :deleting-ha-id="deletingHaId"
        :drift-count="driftCount"
        saved-title="HomeOS · 场景"
        empty-saved-text="暂无保存的场景"
        ha-empty-text="连接 HA 后自动发现场景"
        @start-new="onManageStartNew"
        @sync-all="doSyncAll"
        @repair-all="doRepairAll"
        @edit="openSavedItem"
        @delete="confirmDelete"
        @discover="discoverHA"
        @pull-all="doPullAll"
        @import="doImport"
        @ha-delete="confirmHaDelete"
      >
            <template #saved-toolbar-extra>
              <button
                v-if="isAdmin"
                class="wr-btn-add wr-btn-add--xs"
                type="button"
                :disabled="batchExporting || batchImporting"
                :title="'导出全部为 JSON'"
                @click="batchExportJson"
              >
                {{ batchExporting ? '导出中…' : '导出 JSON' }}
              </button>
              <button
                v-if="isAdmin"
                class="wr-btn-add wr-btn-add--xs"
                type="button"
                :disabled="batchExporting || batchImporting"
                :title="'导出全部为多文档 YAML'"
                @click="batchExportYaml"
              >
                {{ '导出 YAML' }}
              </button>
              <button
                v-if="isAdmin"
                class="wr-btn-add wr-btn-add--xs"
                type="button"
                :disabled="batchImporting"
                :title="'导入 JSON / YAML 文件并批量创建'"
                @click="batchPickImportFile"
              >
                {{ batchImporting ? '导入中…' : '导入' }}
              </button>
              <button
                v-if="isAdmin"
                class="wr-btn-add wr-btn-add--xs"
                type="button"
                @click="openPasteYaml"
              >
                {{ '粘贴 YAML' }}
              </button>
            </template>
            <template #ha-toolbar-extra>
              <button
                v-if="isAdmin"
                class="wr-btn-add wr-btn-add--xs"
                type="button"
                :disabled="syncing || importFlowImporting"
                @click="bulkImportDiscovered"
              >
                {{ '批量导入发现' }}
              </button>
              <button
                v-if="isAdmin"
                class="wr-btn-add wr-btn-add--xs"
                type="button"
                :disabled="syncing"
                @click="doPullAllHa"
              >
                {{ '导入全部 HA' }}
              </button>
            </template>
            <template #saved-name-extra="{ item }">
              <span v-if="!itemHasGeekGraph(item)" class="wr-mini-badge wr-mini-badge--yaml">{{ 'YAML 还原' }}</span>
            </template>
            <template #saved-row-actions="{ item }">
              <button
                v-if="isAdmin"
                class="wr-btn-weak"
                type="button"
                :disabled="cloningId === item.id"
                :title="'克隆整条场景'"
                :aria-label="'克隆整条场景'"
                @click="cloneItem(item)"
              >
                <CopyPlus v-if="cloningId !== item.id" class="w-3.5 h-3.5" />
                <Loader2 v-else class="w-3.5 h-3.5 animate-spin" />
              </button>
              <button
                v-if="isAdmin"
                class="wr-btn-weak"
                type="button"
                :title="'立即执行'"
                :aria-label="'立即执行'"
                @click="executeScene(item)"
              >
                <Play class="w-3.5 h-3.5" />
              </button>
              <button
                v-if="isAdmin && syncStatusMap[item.id]?.drift"
                class="wr-btn-weak wr-btn-weak--repair"
                type="button"
                :title="'修复漂移（推送本地到 HA）'"
                :aria-label="'修复漂移'"
                @click="doRepair(item)"
              >
                <RefreshCw class="w-3.5 h-3.5" />
              </button>
              <button
                v-if="isAdmin"
                class="wr-btn-weak wr-btn-weak--sync"
                type="button"
                :title="'推送到 HA'"
                :aria-label="'推送到 HA'"
                @click="doSync(item)"
              >
                <Upload class="w-3.5 h-3.5" />
              </button>
            </template>
            <template #ha-row="{ item }">
              <span class="wr-saved-td wr-saved-td--name">
                {{ item.name }}
                <span
                  v-if="item.incomplete"
                  class="wr-mini-badge wr-mini-badge--drift"
                  :title="'Config API 无法读取完整配置，导入后可能缺少实体'"
                  >{{ '不完整' }}</span
                >
              </span>
              <span class="wr-saved-td wr-saved-td--time wr-saved-td--eid">{{ item.entity_id }}</span>
              <span v-if="isAdmin && item.ha_config_id" class="wr-ha-row-actions">
                <button class="wr-btn-add wr-btn-add--xs" type="button" @click="doImport(item)">
                  {{ '导入' }}
                </button>
                <button
                  class="wr-btn-add wr-btn-add--xs wr-btn-add--danger"
                  type="button"
                  :disabled="!!deletingHaId"
                  @click="confirmHaDelete(item)"
                >
                  {{ '删除' }}
                </button>
              </span>
            </template>
      </GeekManagePanel>
    </GeekManageDrawer>

    <GeekTemplatesDrawer
      :open="showTemplates"
      aria-label="场景模板库"
      @close="showTemplates = false"
    >
      <OrchestratorTemplateLibrary
        title="场景模板库"
        :templates="builtinTemplates"
        :installing-id="installingTpl"
        storage-key="homeos_orch_tpl_geek_scene"
        :default-collapsed="false"
        @install="onInstallTemplate"
      />
      <OrchestratorLocalTemplatesPanel
        kind="scene"
        title="我的模板"
        name-placeholder="例如：影院模式"
        empty-hint="当前画布没有实体，无法保存"
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

    <GeekSettingsDrawer
      :open="showSettings"
      aria-label="场景设置"
      title="设置"
      subtitle="HA 执行与画布管理"
      @close="showSettings = false"
    >
      <OrchestratorExecutionEngineBadge
        :needs-ha="haExecutionNeeds"
        :run-on-ha="runOnHa"
        :reasons="haExecutionReasons"
        @enable-ha="enableHaExecution"
      />
      <label class="geek-builder__ha">
        <input v-model="runOnHa" type="checkbox" />
        <span>{{ '由 HA 执行（scene.turn_on）' }}</span>
      </label>
      <label class="geek-builder__ha">
        <input v-model="overlay" type="checkbox" />
        <span>{{ '叠加执行（仅改变声明实体，执行后可用「取消执行」恢复）' }}</span>
      </label>
      <button type="button" class="list-page__link-btn" :disabled="saving" @click="onSettingsStartNew">
        {{ '新建空白场景' }}
      </button>
      <button type="button" class="list-page__link-btn" :disabled="saving" @click="resetCanvasKeepEdit">
        {{ '重置画布' }}
      </button>
      <button
        v-if="editingId"
        type="button"
        class="list-page__link-btn is-danger"
        :disabled="saving"
        @click="confirmDeleteCurrent"
      >
        {{ '删除本条' }}
      </button>
    </GeekSettingsDrawer>

    <GeekYamlPreviewDrawer
      :open="showYaml"
      subtitle="由当前画布实时编译；保存时写入场景记录"
      :yaml-html="yamlHtml"
      @close="showYaml = false"
      @copy="copyYaml"
    />

    <div class="geek-builder__stage">
      <GeekSceneCanvas
        :key="canvasKey"
        ref="canvasRef"
        :graph="graph"
        v-model:selected-node-id="selectedNodeId"
        :allow-paste-yaml="isAdmin"
        @update:graph="onGraphFromCanvas"
        @select-entity="onSelectEntity"
        @remove-entities="removeEntitiesByIndices"
        @copy-selected="copySelectedEntity"
        @paste-entity="pasteEntity"
        @duplicate-selected="duplicateSelectedEntity"
        @add-entity="onAddEntityFromCanvas"
        @clear-selection="clearSelection"
        @open-batch="showBatchPicker = true"
        @open-paste-yaml="openPasteYaml"
        @hint="onCanvasHint"
        @update:multi-count="selectedMultiCount = $event"
      />

      <aside
        :class="['geek-builder__inspector', currentEntity && 'is-open']"
        aria-label="实体参数"
      >
        <header class="geek-builder__inspector-head">
          <div>
            <p class="geek-builder__inspector-kicker">{{ '配置实体' }}</p>
            <h4>{{ entityInspector.title }}</h4>
            <em v-if="entityInspector.sub" class="geek-builder__trace-detail">{{
              entityInspector.sub
            }}</em>
          </div>
          <button type="button" class="list-page__link-btn" @click="clearSelection">
            {{ '收起' }}
          </button>
        </header>
        <div v-if="currentEntity" class="geek-builder__inspector-body">
          <div class="geek-insp-stack">
          <p v-if="selectedEntityNeedsHa" class="geek-hint geek-hint--warn">
            {{ '该实体部分属性未能完整还原；建议勾选「由 HA 执行」以保留完整快照。' }}
          </p>
          <p v-if="selectedMultiCount > 1" class="geek-hint">
            {{ `已多选 ${selectedMultiCount} 个实体；Del 可批量删除，Inspector 编辑当前主选中项。` }}
          </p>
          <div class="geek-scene-inspector-actions">
            <button type="button" class="list-page__link-btn" @click="addEntity()">
              {{ '+ 添加实体' }}
            </button>
            <button type="button" class="list-page__link-btn" @click="copySelectedEntity">
              {{ '复制' }}
            </button>
            <button type="button" class="list-page__link-btn" @click="focusSelectedOnCanvas">
              {{ '定位' }}
            </button>
            <button
              type="button"
              class="list-page__link-btn"
              @click="canvasRef?.removeSelected?.() ?? removeSelectedEntity()"
            >
              {{ selectedMultiCount > 1 ? `删除 ${selectedMultiCount} 个` : '删除' }}
            </button>
          </div>
          <GeekCfgCard title="选择设备" accent>
            <GeekDeviceCatalog
              v-model="currentEntity.entityId"
              mode="action"
              entity-only
              :domain-filter="sceneCatalogDomains"
            />
          </GeekCfgCard>
          <GeekCfgCard title="目标状态" accent>
            <div class="geek-inspector-entity-row__state">
              <div
                v-if="sceneStateSegOptions.length > 0 && sceneStateSegOptions.length <= 4"
                class="geek-seg geek-seg--wrap"
                role="group"
                aria-label="目标状态"
              >
                <button
                  v-for="s in sceneStateSegOptions"
                  :key="s"
                  type="button"
                  :class="['geek-seg__btn', currentEntity.state === s && 'is-on']"
                  @click="setSceneEntityState(s)"
                >
                  {{ stateLabelForEntity(s) }}
                </button>
                <button
                  type="button"
                  :class="['geek-seg__btn', currentEntity.state === '__custom__' && 'is-on']"
                  @click="setSceneEntityState('__custom__')"
                >
                  {{ '自定义' }}
                </button>
              </div>
              <HosSelect
                v-else
                variant="orchestrator"
                size="sm"
                block
                v-model="currentEntity.state"
                @change="onEntityStateChange"
              >
                <option v-for="s in possibleStatesForEntity(currentEntity.entityId)" :key="s" :value="s">
                  {{ stateLabelForEntity(s) }}
                </option>
                <option value="__custom__">{{ '自定义...' }}</option>
              </HosSelect>
              <input
                v-if="currentEntity.state === '__custom__'"
                v-model="currentEntity.customState"
                class="wr-num"
                :placeholder="'值'"
              />
            </div>
            <p v-if="liveEntityStateLine" class="geek-hint">{{ liveEntityStateLine }}</p>
          </GeekCfgCard>
          <SceneEntityParamsPanel
            v-model:entity="graph.entities[selectedEntityIndex]"
            :unit-for-entity="unitForEntity"
          />
          </div>
        </div>
      </aside>
    </div>

    <Teleport :to="teleportTarget" :disabled="teleportDisabled">
      <SceneBatchPickerModal
        :open="showBatchPicker"
        :entities="enrichedBatchEntities"
        :selected-set="selectedBatchSet"
        :selected-count="selectedBatchIds.length"
        :total-count="enrichedBatchEntities.length"
        :batch-domains="batchDomains"
        v-model:batch-domain="batchDomain"
        v-model:batch-filter="batchFilter"
        v-model:batch-common-only="batchCommonOnly"
        :show-preset-bar="showPresetBar"
        :show-advanced-presets="showAdvancedPresets"
        :preset-domain="presetDomain"
        v-model:batch-state="batchState"
        v-model:batch-brightness="batchBrightness"
        v-model:batch-color-temp="batchColorTemp"
        v-model:batch-rgb-color="batchRgbColor"
        v-model:batch-transition="batchTransition"
        v-model:batch-effect="batchEffect"
        v-model:batch-position="batchPosition"
        v-model:batch-temperature="batchTemperature"
        v-model:batch-hvac-mode="batchHvacMode"
        v-model:batch-volume="batchVolume"
        v-model:batch-source="batchSource"
        v-model:batch-fan-percentage="batchFanPercentage"
        v-model:batch-option="batchOption"
        v-model:batch-value="batchValue"
        v-model:batch-humidity="batchHumidity"
        v-model:batch-code="batchCode"
        v-model:batch-fan-speed="batchFanSpeed"
        @close="showBatchPicker = false"
        @confirm="onBatchApply"
        @toggle="toggleBatchEntity"
        @select-all="selectAllFiltered"
        @clear-all="clearBatchSelection"
      />
    </Teleport>

    <Teleport :to="teleportTarget" :disabled="teleportDisabled">
      <Transition name="wr-modal">
        <div v-if="pasteYamlOpen" class="wr-modal-shade" @click.self="closePasteYaml">
          <div class="wr-modal-box wr-modal-box--wide">
            <h4 class="wr-modal-title">{{ '粘贴场景 YAML' }}</h4>
            <p class="wr-modal-desc">
              {{ '粘贴 name / entities 完整 YAML，将创建新场景记录。' }}
            </p>
            <input
              v-model="pasteYamlName"
              class="wr-input-name wr-input-name--block"
              :placeholder="'名称（如：观影模式）'"
            />
            <textarea
              v-model="pasteYamlText"
              class="wr-yaml-edit"
              rows="16"
              spellcheck="false"
              placeholder="name: 观影模式&#10;entities:&#10;  light.living:&#10;    state: on"
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

    <OrchestratorPlaceholderWizard
      :open="phWizardOpen"
      :loading="phWizardLoading"
      :saving="phWizardSaving"
      :automation-name="phWizardName"
      kind-label="场景"
      :rows="phWizardRows"
      v-model:replacements="phWizardReplacements"
      @close="closePlaceholderWizard"
      @apply="onApplyPlaceholders"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, reactive, ref, toRef, watch } from 'vue'
import { Upload, RefreshCw, Play, CopyPlus, Loader2 } from '@lucide/vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import GeekSceneCanvas from '@/components/geek-scene/GeekSceneCanvas.vue'
import SceneEntityParamsPanel from '@/components/dashboard/SceneEntityParamsPanel.vue'
import GeekCfgCard from '@/components/geek-automation/GeekCfgCard.vue'
import GeekDeviceCatalog from '@/components/geek-automation/GeekDeviceCatalog.vue'
import SceneBatchPickerModal from '@/components/dashboard/SceneBatchPickerModal.vue'
import OrchestratorPlaceholderWizard from '@/components/dashboard/OrchestratorPlaceholderWizard.vue'
import OrchestratorSyncAlert from '@/components/dashboard/OrchestratorSyncAlert.vue'
import OrchestratorTemplateLibrary from '@/components/dashboard/OrchestratorTemplateLibrary.vue'
import OrchestratorLocalTemplatesPanel from '@/components/dashboard/OrchestratorLocalTemplatesPanel.vue'
import OrchestratorExecutionEngineBadge from '@/components/dashboard/OrchestratorExecutionEngineBadge.vue'
import GeekManageDrawer from '@/components/geek-automation/GeekManageDrawer.vue'
import GeekManagePanel from '@/components/geek-automation/GeekManagePanel.vue'
import GeekBuilderChrome from '@/components/geek-automation/GeekBuilderChrome.vue'
import GeekSettingsDrawer from '@/components/geek-automation/GeekSettingsDrawer.vue'
import GeekTemplatesDrawer from '@/components/geek-automation/GeekTemplatesDrawer.vue'
import GeekYamlPreviewDrawer from '@/components/geek-automation/GeekYamlPreviewDrawer.vue'
import '@/components/dashboard/styles/AutomationBuilder.css'
import '@/components/dashboard/styles/SceneBatchPickerModal.css'
import '@/components/geek-automation/styles/geek-builder-shared.css'
import { createOrchestratorItem } from '@/services/api/orchestrator'
import { useOrchestratorBatchIo } from '@/composables/orchestrator/useOrchestratorBatchIo'
import { useGeekSceneShell } from '@/composables/orchestrator/useGeekSceneShell'
import { useGeekYamlPreview } from '@/composables/orchestrator/useGeekYamlPreview'
import { useGeekBuilderDrawerChrome } from '@/composables/orchestrator/useGeekBuilderDrawerChrome'
import { useOrchestratorTeleport } from '@/composables/orchestrator/useOrchestratorTeleport'
import { useOrchestratorDriftFocus } from '@/composables/orchestrator/useOrchestratorDriftFocus'
import { useSceneBatchPicker } from '@/composables/orchestrator/useSceneBatchPicker'
import { itemHasGeekGraph } from '@/composables/orchestrator/linkage-hub.types'
import { hasOrchestratorBuilderDirty } from '@/composables/settings/hub-backup-orchestrator.internals'
import {
  createEmptySceneGeekGraph,
  entityNodeId,
  reconcileSceneGraphLayout,
  syncSceneGraphNodeData,
} from '@/utils/geek-scene'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import {
  isLocalCanvasGraphNonEmpty,
  localCanvasTemplateStats,
} from '@/utils/orchestrator/local-canvas-templates.util'
import { newSceneEntityDefaults } from '@/utils/orchestrator/scene-yaml-form.util'
import { clonePlain } from '@/utils/core/clone-plain.util'
import { splitGeekRestoreHint } from '@/utils/orchestrator/geek-restore-hint.util'
import {
  possibleStatesForEntity,
  stateLabelForEntity,
  unitForEntity as resolveUnitForEntity,
} from '@/utils/entity/state-options.util'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'

const props = defineProps({
  visible: Boolean,
  embedded: Boolean,
  showEmbeddedClose: Boolean,
  initialEditId: { type: String, default: '' },
  openPlaceholderWizard: { type: Boolean, default: false },
  initialLocalTemplate: { type: Object, default: null },
})
defineOptions({ inheritAttrs: false })
const emit = defineEmits(['close', 'saved', 'local-template-consumed'])

const entitiesStore = useEntitiesStore()
const chrome = useChromeStore()
const { teleportTarget, teleportDisabled } = useOrchestratorTeleport()

const graph = reactive(createEmptySceneGeekGraph())
const editingId = ref(null)
const runOnHa = ref(false)
/** 叠加执行开关：仅改变声明实体，执行前采集快照（可取消恢复） */
const overlay = ref(false)
const canvasKey = ref(0)
const canvasRef = ref(null)
const selectedNodeId = ref(null)
const selectedEntityIndex = ref(null)
const selectedMultiCount = ref(0)
/** 场景实体剪贴板（Ctrl+C/V） */
let entityClipboard = null
/** 连续粘贴错开偏移（相对锚点） */
let pasteNudge = 0

const sceneCatalogDomains = [
  'light',
  'switch',
  'cover',
  'climate',
  'fan',
  'media_player',
  'lock',
  'vacuum',
  'humidifier',
  'input_boolean',
  'input_select',
  'input_number',
  'binary_sensor',
  'scene',
  'script',
]

/** 实体 Inspector 标题（友好名 + entity_id），需在 shell 之前定义以免 HMR/KeepAlive 漏绑 */
const entityInspector = computed(() => {
  const ent =
    selectedEntityIndex.value != null ? graph.entities[selectedEntityIndex.value] : null
  if (!ent?.entityId) {
    return { title: '实体参数', sub: '编辑状态与域专属参数', entity: ent }
  }
  const live = entitiesStore.entities?.[ent.entityId]
  const title = getEntityDisplayName(ent.entityId, live) || ent.entityId
  return {
    title,
    sub: title === ent.entityId ? '编辑状态与域专属参数' : ent.entityId,
    entity: ent,
  }
})

const showBatchPicker = ref(false)
const {
  showYaml,
  showManage,
  showTemplates,
  showSettings,
  openManageDrawer: openManageDrawerFlags,
  openTemplatesDrawer: openTemplatesDrawerFlags,
  openSettingsDrawer,
  openYamlDrawer,
  closeAllDrawers,
} = useGeekBuilderDrawerChrome()
const selectedBatchIds = ref([])
const batchState = ref('on')
const batchBrightness = ref(null)
const batchColorTemp = ref(null)
const batchRgbColor = ref('')
const batchTransition = ref(null)
const batchEffect = ref('')
const batchFilter = ref('')
const batchDomain = ref('')
const batchPosition = ref(null)
const batchTemperature = ref(null)
const batchHvacMode = ref('')
const batchVolume = ref(null)
const batchSource = ref('')
const batchFanPercentage = ref(null)
const batchOption = ref('')
const batchValue = ref(null)
const batchHumidity = ref(null)
const batchCode = ref('')
const batchFanSpeed = ref('')

function formSignature() {
  return JSON.stringify({
    name: graph.name,
    entities: graph.entities,
    runOnHa: runOnHa.value,
    overlay: overlay.value,
  })
}

const localTemplateMeta = computed(() => ({
  runOnHa: runOnHa.value,
}))

function applyGraph(result) {
  Object.assign(graph, createEmptySceneGeekGraph(result.graph))
  refreshLayout()
}

function resetGraph() {
  Object.assign(graph, createEmptySceneGeekGraph())
  selectedNodeId.value = null
  selectedEntityIndex.value = null
  canvasKey.value += 1
}

function rebindSelection(index = selectedEntityIndex.value) {
  if (index == null || !graph.entities[index]) {
    selectedNodeId.value = null
    selectedEntityIndex.value = null
    return
  }
  selectedEntityIndex.value = index
  selectedNodeId.value = entityNodeId(index, graph.entities[index].entityId)
}

function refreshLayout(opts = {}) {
  const laid = reconcileSceneGraphLayout(graph)
  graph.flowNodes = laid.flowNodes
  graph.flowEdges = laid.flowEdges
  const idx = opts.selectIndex != null ? opts.selectIndex : selectedEntityIndex.value
  rebindSelection(idx)
  if (opts.fitView) {
    void nextTick(() => canvasRef.value?.fitView?.())
  }
}

function syncPresentation() {
  const synced = syncSceneGraphNodeData(graph)
  graph.flowNodes = synced.flowNodes
}

const shell = useGeekSceneShell({
  props,
  graph,
  editingId,
  runOnHa,
  overlay,
  formSignature,
  applyGraph,
  resetGraph,
  onSaved: () => emit('saved'),
})

const {
  isAdmin,
  approximateHint,
  yamlPreview,
  saving,
  pasteYamlOpen,
  pasteYamlText,
  pasteYamlName,
  importFlowImporting,
  batchEntities,
  saveScene,
  copyYaml,
  openPasteYaml,
  closePasteYaml,
  submitPasteYaml,
  resultMsg,
  resultOk,
  dismissAfter,
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
  doPullAllHa,
  doImport,
  bulkImportDiscovered,
  confirmHaDelete,
  confirmDelete,
  closeDeleteConfirm,
  executeDelete,
  executeScene,
  cancelScene,
  cancelableSceneId,
  editItem,
  loadItem,
  startNew,
  mapSceneHistory,
  builtinTemplates,
  installingTpl,
  installTemplate,
  engineCaps,
  sceneEngineSections,
  haExecutionNeeds,
  haExecutionReasons,
  enableHaExecution,
  showDeleteConfirm,
  deleteMode,
  deletingLocal,
  deleteLocalMessage,
  deleteHaMessage,
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
  kind: 'scene',
  entityLabel: '场景',
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

const currentEntity = computed(() => entityInspector.value.entity)

const sceneStateSegOptions = computed(() => {
  const eid = String(currentEntity.value?.entityId || '').trim()
  if (!eid) return []
  return possibleStatesForEntity(eid)
})

const selectedEntityNeedsHa = computed(() => {
  const eid = String(currentEntity.value?.entityId || '').trim()
  if (!eid) return false
  return (graph.lossyEntityIds || []).includes(eid)
})

const liveEntityStateLine = computed(() => {
  const eid = String(currentEntity.value?.entityId || '').trim()
  if (!eid) return ''
  const live = entitiesStore.entities?.[eid]
  const st = live?.state != null && String(live.state) !== '' ? String(live.state) : 'unavailable'
  return `当前 HA 状态：${st}`
})

function unitForEntity(eid) {
  return resolveUnitForEntity(entitiesStore, eid)
}

function onEntityStateChange(ev) {
  const ent = currentEntity.value
  if (!ent) return
  const val = ev?.target?.value ?? ent.state
  if (val !== '__custom__') ent.customState = ''
}

function setSceneEntityState(state) {
  const ent = currentEntity.value
  if (!ent) return
  if (state === '__custom__') {
    if (ent.state !== '__custom__') {
      ent.customState = ent.state || ''
    }
    ent.state = '__custom__'
    return
  }
  ent.state = state
  ent.customState = ''
}

/** 首次从空 ID 选中设备时，用实时状态预填目标 */
watch(
  () => String(currentEntity.value?.entityId || '').trim(),
  (next, prev) => {
    const ent = currentEntity.value
    if (!ent || !next || prev) return
    const live = entitiesStore.entities?.[next]
    const st = live?.state != null ? String(live.state) : ''
    if (!st) return
    const opts = possibleStatesForEntity(next)
    if (opts.includes(st)) {
      ent.state = st
      ent.customState = ''
    } else {
      ent.state = '__custom__'
      ent.customState = st
    }
  },
)

function onGraphFromCanvas(next) {
  Object.assign(graph, next)
}

function onSelectEntity(index) {
  selectedEntityIndex.value = index
}

function clearSelection() {
  selectedNodeId.value = null
  selectedEntityIndex.value = null
  selectedMultiCount.value = 0
}

function flashHint(msg, ok = true) {
  resultMsg.value = msg
  resultOk.value = ok
}

function onCanvasHint(msg, ok) {
  flashHint(msg, ok !== false)
}

function placeEntityStub(index, position) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return
  const ent = graph.entities[index]
  if (!ent) return
  const id = entityNodeId(index, ent.entityId)
  const stub = {
    id,
    type: 'sceneNode',
    position: { x: position.x, y: position.y },
    draggable: true,
    data: {
      kind: 'sceneEntity',
      entityIndex: index,
      entityId: ent.entityId || '',
    },
  }
  const others = (graph.flowNodes || []).filter((n) => n.id !== id)
  graph.flowNodes = [...others, stub]
}

function addEntity(position) {
  graph.entities.push(newSceneEntityDefaults())
  const idx = graph.entities.length - 1
  placeEntityStub(idx, position)
  refreshLayout({ selectIndex: idx, fitView: !position })
  if (position) void nextTick(() => canvasRef.value?.fitView?.({ nodeIds: [selectedNodeId.value] }))
  flashHint('已添加实体，请选择设备并配置状态')
}

function onAddEntityFromCanvas(position) {
  addEntity(position || null)
}

function copySelectedEntity() {
  const idx = selectedEntityIndex.value
  if (idx == null || !graph.entities[idx]) return false
  entityClipboard = clonePlain(graph.entities[idx])
  pasteNudge = 0
  const label = entityClipboard.entityId || `实体 ${idx + 1}`
  flashHint(`已复制「${label}」，Ctrl+V 粘贴`)
  return true
}

function pasteEntity() {
  if (!entityClipboard) {
    flashHint('剪贴板为空，请先选中实体后 Ctrl+C', false)
    return false
  }
  const clone = {
    ...newSceneEntityDefaults(),
    ...clonePlain(entityClipboard),
  }
  // 避免与源实体重复 ID；粘贴后需重新选择设备
  const hadId = String(clone.entityId || '').trim()
  clone.entityId = ''
  const anchor =
    (selectedNodeId.value &&
      graph.flowNodes?.find((n) => n.id === selectedNodeId.value)?.position) ||
    graph.flowNodes?.find((n) => n.data?.kind === 'sceneEntity')?.position ||
    null
  pasteNudge += 1
  const position = anchor
    ? { x: anchor.x + 36 * pasteNudge, y: anchor.y + 28 * pasteNudge }
    : null
  graph.entities.push(clone)
  const idx = graph.entities.length - 1
  placeEntityStub(idx, position)
  refreshLayout({ selectIndex: idx, fitView: !position })
  if (position) void nextTick(() => canvasRef.value?.fitView?.({ nodeIds: [selectedNodeId.value] }))
  flashHint(
    hadId
      ? `已粘贴（请重新选择设备；原 ID：${hadId}）`
      : `已粘贴「实体 ${idx + 1}」`,
  )
  return true
}

function duplicateSelectedEntity() {
  if (!copySelectedEntity()) return false
  return pasteEntity()
}

function focusSelectedOnCanvas() {
  if (!selectedNodeId.value) return
  canvasRef.value?.focusNode?.(selectedNodeId.value)
}

function removeEntitiesByIndices(indices) {
  const list = Array.isArray(indices) ? indices : []
  if (!list.length) return
  const sorted = [...new Set(list.map((n) => Number(n)).filter((n) => Number.isFinite(n)))].sort(
    (a, b) => b - a,
  )
  const labels = sorted.map((i) => graph.entities[i]?.entityId || `实体 ${i + 1}`)
  for (const i of sorted) {
    if (i >= 0 && i < graph.entities.length) graph.entities.splice(i, 1)
  }
  clearSelection()
  refreshLayout({ fitView: true })
  if (labels.length === 1) flashHint(`已删除「${labels[0]}」`)
  else flashHint(`已删除 ${labels.length} 个实体`)
}

function removeSelectedEntity() {
  const indices = canvasRef.value?.getSelectedEntityIndices?.()
  if (Array.isArray(indices) && indices.length) {
    removeEntitiesByIndices(indices)
    return
  }
  const idx = selectedEntityIndex.value
  if (idx == null) return
  removeEntitiesByIndices([idx])
}

function onDismiss() {
  void dismissEditor()
}

async function dismissEditor() {
  if (hasOrchestratorBuilderDirty()) {
    const ok = await chrome.confirm(
      '当前场景有未保存的修改，继续将丢弃更改。是否继续？',
      '未保存的修改',
      { confirmText: '丢弃并继续', cancelText: '继续编辑', type: 'warning' },
    )
    if (!ok) return
  }
  if (props.embedded) {
    resetGraph()
    editingId.value = null
    shell.startNew()
    closeAllDrawers()
  }
  emit('close')
}

function openManageDrawer() {
  openManageDrawerFlags()
  void loadList()
  void discoverHA()
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

function onSettingsStartNew() {
  startNew()
  showSettings.value = false
}

function resetCanvasKeepEdit() {
  const id = editingId.value
  const name = graph.name
  const ha = runOnHa.value
  const ov = overlay.value
  Object.assign(graph, createEmptySceneGeekGraph({ name }))
  refreshLayout()
  runOnHa.value = ha
  overlay.value = ov
  editingId.value = id
  selectedNodeId.value = null
  selectedEntityIndex.value = null
  canvasKey.value += 1
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

async function openSavedItem(item) {
  if (!item?.id) return
  showManage.value = false
  await editItem(item)
}

/** 克隆整条场景：复制 entities + 原图，新副本不推 HA */
const cloningId = ref('')
async function cloneItem(item) {
  const id = String(item?.id || '')
  const entities = item?.entities
  if (!id || entities == null || (typeof entities === 'string' && !entities.trim())) {
    resultOk.value = false
    resultMsg.value = '该场景缺少可克隆的实体配置'
    return
  }
  cloningId.value = id
  try {
    const payload = {
      name: `${item.name || '场景'}（副本）`,
      entities: typeof entities === 'string' ? entities : JSON.stringify(entities),
      runOnHa: false,
    }
    if (item?.geekSceneGraph) payload.geekSceneGraph = item.geekSceneGraph
    const created = await createOrchestratorItem('scene', payload)
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
  if (isLocalCanvasGraphNonEmpty('scene', graph)) {
    const ok = await chrome.confirm(
      `应用「${tpl.name}」将替换当前画布内容，是否继续？`,
      '应用模板',
      { type: 'warning', confirmText: '替换并应用' },
    )
    if (!ok) return
  }
  applyGraph({ graph: tpl.graph, approximateHint: '' })
  if (typeof tpl.meta?.runOnHa === 'boolean') runOnHa.value = tpl.meta.runOnHa
  selectedNodeId.value = null
  selectedEntityIndex.value = null
  canvasKey.value += 1
  showTemplates.value = false
  const ph = localCanvasTemplateStats('scene', graph).placeholders
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

const {
  batchCommonOnly,
  enrichedBatchEntities,
  selectedBatchSet,
  batchDomains,
  presetDomain,
  showAdvancedPresets,
  showPresetBar,
  selectAllFiltered,
  clearBatchSelection,
  toggleBatchEntity,
  applyBatch,
} = useSceneBatchPicker({
  batchEntities,
  selectedBatchIds,
  batchState,
  batchBrightness,
  batchColorTemp,
  batchRgbColor,
  batchTransition,
  batchEffect,
  batchFilter,
  batchDomain,
  batchPosition,
  batchTemperature,
  batchHvacMode,
  batchVolume,
  batchSource,
  batchFanPercentage,
  batchOption,
  batchValue,
  batchHumidity,
  batchCode,
  batchFanSpeed,
  showBatchPicker,
  entities: toRef(graph, 'entities'),
  newEntityDefaults: newSceneEntityDefaults,
  resultMsg,
  resultOk,
  dismissAfter,
})

function onBatchApply() {
  applyBatch()
  refreshLayout({ fitView: true })
}

watch(
  () => graph.entities.length,
  () => refreshLayout(),
)

/** entityId 变更时重算节点 id / 边，并重绑选中高亮 */
watch(
  () => graph.entities.map((e) => String(e.entityId || '').trim()).join('\0'),
  (next, prev) => {
    if (prev != null && next !== prev) refreshLayout()
  },
)

watch(
  () => graph.entities,
  () => syncPresentation(),
  { deep: true },
)

watch(
  () => graph.name,
  () => syncPresentation(),
)
</script>

<style scoped>
/* 场景强调色覆盖（琥珀色） */
.geek-builder__name:focus {
  outline: none;
  border-color: rgba(251, 191, 36, 0.7);
  box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.18);
}
.geek-builder__actions .list-page__btn.is-active {
  border-color: rgba(251, 191, 36, 0.7);
  background: rgba(251, 191, 36, 0.12);
}
:deep(.geek-builder__settings-drawer) {
  width: min(360px, calc(94vw / var(--hos-scale, 1)));
}
:deep(.geek-builder__settings-body) {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.geek-scene-inspector-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--geek-gap-sm, 8px);
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(2, 6, 23, 0.22);
}
.geek-inspector-entity-row {
  display: flex;
  flex-direction: column;
  gap: var(--geek-gap-sm, 8px);
}
.geek-inspector-entity-row__state {
  display: flex;
  flex-direction: column;
  gap: var(--geek-gap-sm, 8px);
  align-items: stretch;
  min-width: 0;
}
.geek-inspector-entity-row__state .wr-num {
  width: 100%;
  min-width: 0;
}
.geek-builder__inspector-body :deep(.wr-line) {
  flex-wrap: wrap;
}
.geek-builder__inspector-head h4 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 240px;
}
.geek-builder__trace-detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
