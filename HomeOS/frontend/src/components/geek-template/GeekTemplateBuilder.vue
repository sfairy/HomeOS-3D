<!--
  GeekTemplateBuilder.vue
  职责：geek-template 模板实体编辑器的顶层组件。
       组合 模板画布（GeekTemplateCanvas）+ 右侧配置面板 + 管理/设置/YAML 抽屉，
       支持多类模板实体（家电映射 appliance / 触发式传感器 trigger_sensor / YAML 导入 yaml_import）的
       创建、编辑、保存，以及 configuration.yaml 的导入/导出与 HA 同步/修复。
  所属模块：geek-template。
  关键依赖：
    - GeekTemplateCanvas（模板画布）、TemplateEntityTypeSelect（模板类型选择）、EntityInput（实体映射输入）。
    - GeekBuilderChrome / GeekManageDrawer / GeekSettingsDrawer / GeekYamlPreviewDrawer：编辑器外壳与抽屉。
    - GeekCfgCard / FooterIconPicker / TemplateEntitySavedFooter：配置卡片与页脚图标选择/已保存列表。
    - OrchestratorSyncAlert：漂移/同步告警。
    - useGeekTemplateShell / useGeekYamlPreview / useGeekBuilderDrawerChrome / useOrchestratorTeleport / useOrchestratorDriftFocus：组合式逻辑。
    - chrome.store：全局确认弹窗；useExclusiveDropdown：JSON 菜单独占。
  Props：
    - visible：是否可见。
    - embedded：嵌入式模式（关闭按钮变为「清除」，并显示「+ 新建」按钮）。
    - showEmbeddedClose：嵌入式下是否展示关闭按钮。
    - initialEditId：初始编辑的模板实体 id。
  Emits：
    - close：关闭编辑器。
    - saved：保存成功（带回模板实体信息）。
  关键交互：
    - 顶部 chrome 提供 新建/JSON 导入导出/保存 等动作；JSON 菜单为 details 独占下拉。
    - 画布根据 mode（pick_type/appliance/trigger_sensor/yaml_import）渲染不同节点结构与配置面板。
    - 设置抽屉配置模板类型、名称、图标与各模式专属字段；YAML 抽屉实时预览编译结果。
    - 漂移/同步告警联动 OrchestratorSyncAlert，支持同步/修复。
-->
<template>
  <div class="geek-builder geek-template-builder orch-builder-workspace">
    <GeekBuilderChrome
      v-model:name="entName"
      :name-placeholder="namePlaceholder"
      name-class="geek-template-head__name"
      :manage-active="showManage"
      :settings-active="showSettings"
      :yaml-active="showYaml"
      :saving="saving"
      :save-label="saving ? '保存中…' : editingId ? '保存' : '创建并保存'"
      :dismiss-label="embedded ? '清除' : '关闭'"
      :dismiss-title="embedded ? '清空当前编辑' : '关闭'"
      @manage="toggleManageDrawer"
      @settings="openSettingsDrawer"
      @save="saveBtn"
      @yaml="toggleYamlDrawer"
      @dismiss="onDismiss"
    >
      <template #actions-mid>
        <button
          v-if="embedded"
          type="button"
          class="list-page__btn"
          :title="'新建模板实体'"
          @click="startNew"
        >
          {{ '+ 新建' }}
        </button>
        <details class="geek-template-json-menu" @toggle="onExclusiveDetailsToggle">
          <summary class="list-page__btn" :title="'配置 JSON 导入/导出'">
            {{ 'JSON' }}
          </summary>
          <div class="geek-template-json-menu__panel">
            <button type="button" class="geek-template-json-menu__item" @click="exportConfigJson">
              {{ '导出 JSON' }}
            </button>
            <button
              type="button"
              class="geek-template-json-menu__item"
              @click="openConfigJsonImport('editor')"
            >
              {{ '导入到编辑器' }}
            </button>
            <button
              type="button"
              class="geek-template-json-menu__item geek-template-json-menu__item--primary"
              @click="openConfigJsonImport('save')"
            >
              {{ '导入并保存' }}
            </button>
          </div>
        </details>
        <input
          ref="configImportInput"
          type="file"
          accept="application/json,.json"
          class="wr-file-hidden"
          @change="onConfigJsonFileChange"
        />
        <button
          v-if="isAdmin"
          type="button"
          class="list-page__btn"
          @click="openPasteYaml"
        >
          {{ '粘贴 YAML' }}
        </button>
      </template>
    </GeekBuilderChrome>

    <OrchestratorSyncAlert
      v-if="showManage"
      class="geek-builder__sync-alert"
      :items="savedList"
      :sync-status-map="syncStatusMap"
      :syncing="syncing"
      :repair-progress="repairProgress"
      :is-admin="isAdmin"
      :entity-label="'模板实体'"
      @sync-all="doSyncAll"
      @repair-all="doRepairAll"
    />

    <p v-if="resultMsg" :class="['geek-builder__msg', resultOk ? 'is-ok' : 'is-err']">
      {{ resultMsg }}
    </p>

    <GeekManageDrawer
      :open="showManage"
      aria-label="模板实体管理"
      title="管理"
      subtitle="已保存模板实体：打开、同步 HA、修复漂移、导入"
      drawer-class="geek-template-manage-drawer"
      body-class="geek-template-manage-drawer__body"
      @close="showManage = false"
    >
      <template v-if="isAdmin && haConfigStatus" #side>
          <div class="wr-deploy-hint">
            <span class="wr-deploy-hint__label">部署模式</span>
            <span v-if="haConfigReady">configuration.yaml 可读写（trigger / 复杂模板推荐）</span>
            <span v-else-if="haConfigStatus?.configured">已配置 haConfigDir 但不可访问</span>
            <span v-else>未配置 haConfigDir：简单模板可走 Template Helper</span>
          </div>
      </template>
          <TemplateEntitySavedFooter
            :saved-list="savedList"
            :ha-import-list="haImportList"
            :stub-item-count="stubItemCount"
            :is-admin="isAdmin"
            :syncing="syncing"
            :ha-discovering="haDiscovering"
            :importing-id="importingId"
            :deleting="deleting"
            :deleting-ha-id="deletingHaId"
            :ha-config-status="haConfigStatus"
            :ha-config-ready="haConfigReady"
            :ha-config-readable="haConfigReadable"
            :sync-status-map="syncStatusMap"
            :embedded="true"
            :collapsible="false"
            @start-new="onManageStartNew"
            @open-paste="openPasteYaml"
            @sync-all="doSyncAll"
            @repair="doRepair"
            @repair-pull="doRepairPull"
            @reimport="doReimport"
            @pull-ha-item="doPullHaConfigItem"
            @write-ha-item="doWriteHaConfigItem"
            @sync-item="doSync"
            @edit="onManageEditItem"
            @delete="delConfirm"
            @discover="discoverHA"
            @pull-all="doPullAll"
            @import="doImport"
            @ha-delete="confirmHaDelete"
          />
    </GeekManageDrawer>

    <GeekSettingsDrawer
      :open="showSettings"
      aria-label="模板设置"
      title="设置"
      subtitle="模板类型、家电预设与额外属性"
      @close="showSettings = false"
    >
      <TemplateEntityTypeSelect
        :model-value="entType"
        :groups="typeSelectGroups"
        @update:model-value="onEntTypeUpdate"
      />
      <div v-if="selectedTypeMeta || selectedTypeOption" class="wr-type-meta">
        <div class="wr-type-meta__tags">
          <span v-if="selectedTypeMeta?.platform" class="wr-badge wr-badge--platform">{{
            selectedTypeMeta.platform
          }}</span>
          <span v-if="selectedKindLabel" class="wr-badge wr-badge--muted">{{
            selectedKindLabel
          }}</span>
          <span v-if="selectedTypeMeta?.deployMode === 'config_yaml'" class="wr-badge">{{
            '需 configuration.yaml'
          }}</span>
          <span
            v-else-if="selectedTypeMeta?.deployMode === 'helper'"
            class="wr-badge wr-badge--muted"
            >{{ 'Helper 即可' }}</span
          >
        </div>
        <p v-if="selectedTypeMeta?.description" class="wr-type-meta__desc">
          {{ selectedTypeMeta.description }}
        </p>
        <p v-else-if="selectedTypeOption?.value === 'trigger_sensor'" class="wr-type-meta__desc">
          {{ '基于 trigger 的派生传感器，适合功率阈值判断设备开关状态。' }}
        </p>
        <p v-else-if="selectedTypeOption?.value === 'yaml_import'" class="wr-type-meta__desc">
          {{ '直接编辑 HA configuration.yaml 原文，适合复杂或已存在的模板。' }}
        </p>
      </div>
      <details v-if="appliancePresetGroups?.length" class="geek-template-presets">
        <summary>{{ '家电快速创建' }}</summary>
        <p class="wr-cap-line">{{ '一键选择常用家电，自动加载映射槽位骨架。' }}</p>
        <div v-for="group in appliancePresetGroups" :key="group.id" class="wr-preset-group">
          <div class="wr-preset-group__head">{{ group.label }}</div>
          <div class="wr-preset-chips">
            <button
              v-for="opt in group.options"
              :key="opt.value"
              type="button"
              class="wr-preset-chip"
              :class="{ 'wr-preset-chip--active': entType === opt.value }"
              @click="applyAppliancePreset(opt.value)"
            >
              <span v-if="opt.platform" class="wr-preset-chip__platform">{{ opt.platform }}</span>
              <span class="wr-preset-chip__label">{{ opt.label }}</span>
            </button>
          </div>
        </div>
      </details>
      <section v-if="entType && !isYamlOnlyMode" class="wr-sec geek-template-extra">
        <div class="wr-sec-label">
          <div class="wr-sec-dot wr-sec-dot--green"></div>
          <h3>{{ '额外属性' }}</h3>
          <em v-if="extraUnit || extraDeviceClass || extraIcon">{{ '已配置' }}</em>
          <em v-else class="wr-sec-label--dim">{{ '可选' }}</em>
        </div>
        <div class="wr-sec-body">
          <div class="wr-extra-panel">
            <p class="wr-extra-panel__hint">
              {{ '追加到生成 YAML 的可选字段，一般留空即可由家电类型自动推断。' }}
            </p>
            <div class="wr-extra-grid">
              <label class="wr-extra-field">
                <span>{{ '单位' }}</span>
                <input v-model="extraUnit" class="wr-field-input" :placeholder="'如 °C、%、W'" />
              </label>
              <label class="wr-extra-field">
                <span>{{ '设备类型' }}</span>
                <HosSelect variant="orchestrator" block v-model="extraDeviceClass">
                  <option value="">{{ '不指定' }}</option>
                  <option value="temperature">temperature · 温度</option>
                  <option value="humidity">humidity · 湿度</option>
                  <option value="power">power · 功率</option>
                  <option value="energy">energy · 能耗</option>
                  <option value="pressure">pressure · 气压</option>
                  <option value="illuminance">illuminance · 照度</option>
                </HosSelect>
              </label>
              <label class="wr-extra-field">
                <span>{{ '图标' }}</span>
                <div class="wr-extra-icon-row">
                  <span v-if="extraIcon.trim()" class="wr-extra-icon-preview" :title="extraIcon">{{
                    extraIconPreviewLabel
                  }}</span>
                  <input
                    v-model="extraIcon"
                    class="wr-field-input wr-field-input--grow"
                    :placeholder="'mdi:television'"
                  />
                </div>
              </label>
            </div>
          </div>
        </div>
      </section>
    </GeekSettingsDrawer>

    <GeekYamlPreviewDrawer
      :open="showYaml"
      subtitle="由当前配置实时编译；保存时写入模板实体记录"
      :yaml-html="yamlHtml"
      @close="showYaml = false"
      @copy="copyYaml"
    />

    <div class="geek-builder__stage">
      <GeekTemplateCanvas
        :nodes="canvasGraph.nodes"
        :edges="canvasGraph.edges"
        v-model:selected-node-id="selectedNodeId"
        :mode="canvasMode"
        :allow-paste-yaml="isAdmin"
        @select-slot="onSelectSlotFromCanvas"
        @select-root="onSelectRootFromCanvas"
        @select-section="onSelectSectionFromCanvas"
        @add-slot="onOpenAddSlot"
        @open-settings="ensureSettingsDrawerOpen"
        @open-paste-yaml="openPasteYaml"
        @clear-selection="collapseInspector"
        @hint="flashCanvasHint"
      />

      <aside
        :class="['geek-builder__inspector', inspectorOpen && 'is-open']"
        aria-label="模板配置"
      >
        <header class="geek-builder__inspector-head">
          <div>
            <p class="geek-builder__inspector-kicker">{{ '模板配置' }}</p>
            <h4>{{ inspectorTitle }}</h4>
            <em v-if="inspectorSub" class="geek-builder__trace-detail">{{ inspectorSub }}</em>
          </div>
          <button
            v-if="canCollapseInspector"
            type="button"
            class="list-page__link-btn"
            @click="onInspectorHeadAction"
          >
            {{ canvasMode === 'appliance' && (showSlotDrawer || showAddSlot) ? '返回列表' : '收起' }}
          </button>
        </header>

        <div class="geek-builder__inspector-body">
          <div class="geek-insp-stack">
          <!-- pick_type -->
          <template v-if="canvasMode === 'pick_type'">
            <p class="geek-hint">{{ '请选择家电类型、触发式传感器或 YAML 导入模式' }}</p>
            <TemplateEntityTypeSelect
              :model-value="entType"
              :groups="typeSelectGroups"
              @update:model-value="onEntTypeUpdate"
            />
            <button type="button" class="list-page__btn" @click="ensureSettingsDrawerOpen">
              {{ '打开设置（预设与额外属性）' }}
            </button>
          </template>

          <!-- yaml_import -->
          <template v-else-if="canvasMode === 'yaml_import'">
            <GeekCfgCard title="纯 YAML 模式" accent desc="直接编辑模板 YAML；保存后写入本地库。">
              <div class="geek-template-yaml-pane__actions">
                <button
                  v-if="canSwitchToTriggerVisual"
                  type="button"
                  class="wr-btn-add wr-btn-add--blu wr-btn-add--xs"
                  @click="switchToTriggerVisual"
                >
                  {{ '切换到可视化编辑' }}
                </button>
                <button
                  v-if="entType === 'trigger_sensor'"
                  type="button"
                  class="wr-btn-add wr-btn-add--xs"
                  @click="switchFromTriggerRawYaml"
                >
                  {{ '返回可视化表单' }}
                </button>
                <button
                  v-if="isAdmin"
                  type="button"
                  class="wr-btn-add wr-btn-add--xs"
                  @click="openPasteYaml"
                >
                  {{ '粘贴 YAML' }}
                </button>
                <button
                  v-if="isAdmin && editingId"
                  type="button"
                  class="wr-btn-add wr-btn-add--xs"
                  :disabled="configFileBusy || !haConfigReady"
                  :title="haConfigStatus?.message"
                  @click="doWriteHaConfig"
                >
                  {{ '写入 configuration.yaml' }}
                </button>
                <button
                  v-if="isAdmin && editingId"
                  type="button"
                  class="wr-btn-add wr-btn-add--xs"
                  :disabled="configFileBusy || !haConfigReadable"
                  :title="haConfigStatus?.message"
                  @click="doPullHaConfig"
                >
                  {{ '从 configuration.yaml 读取' }}
                </button>
                <button
                  v-if="isAdmin && editingId"
                  type="button"
                  class="wr-btn-add wr-btn-add--xs"
                  @click="applyStoredYamlToDb"
                >
                  {{ '保存当前 YAML 到库' }}
                </button>
              </div>
              <textarea
                v-model="storedYaml"
                class="wr-yaml-edit geek-template-yaml-pane__edit"
                rows="18"
                spellcheck="false"
                placeholder="template:&#10;  - trigger: ..."
              />
            </GeekCfgCard>
          </template>

          <!-- trigger_sensor -->
          <template v-else-if="canvasMode === 'trigger_sensor'">
            <div
              ref="triggerFormEl"
              :class="[
                'geek-template-trigger-form',
                triggerFormFocused && 'geek-template-trigger-form--focus',
              ]"
            >
              <div
                v-if="!triggerSensorForm.triggerEntityId"
                class="wr-hint wr-hint--mb8 wr-hint--warn"
              >
                {{ '请选择触发实体后 YAML 才会填入真实 sensor entity_id' }}
              </div>
              <GeekCfgCard title="触发配置" accent>
                <div class="wr-trigger-grid">
                  <div
                    class="wr-trigger-section wr-trigger-section--wide"
                    data-section="sensor"
                    :class="triggerFocusSection === 'sensor' && 'is-section-focus'"
                  >
                    <label class="wr-trigger-field">
                      <span>{{ '唯一 ID' }}</span>
                      <input v-model="triggerSensorForm.uniqueId" class="wr-num wr-num--full-left" />
                    </label>
                    <label class="wr-trigger-field">
                      <span>{{ '平台' }}</span>
                      <HosSelect variant="orchestrator" block v-model="triggerSensorForm.platform">
                        <option value="sensor">sensor</option>
                        <option value="binary_sensor">binary_sensor</option>
                      </HosSelect>
                    </label>
                  </div>
                  <div
                    class="wr-trigger-section wr-trigger-section--wide"
                    data-section="trigger"
                    :class="triggerFocusSection === 'trigger' && 'is-section-focus'"
                  >
                    <label class="wr-trigger-field wr-trigger-field--wide">
                      <span>{{ '触发实体' }}</span>
                      <EntityInput
                        v-model="triggerSensorForm.triggerEntityId"
                        domain-filter="sensor"
                        :placeholder="'功率/状态传感器'"
                      />
                    </label>
                    <label class="wr-trigger-check">
                      <input v-model="triggerSensorForm.homeassistantStart" type="checkbox" />
                      <span>{{ 'HA 启动时刷新' }}</span>
                    </label>
                  </div>
                  <div
                    class="wr-trigger-section wr-trigger-section--wide"
                    data-section="logic"
                    :class="triggerFocusSection === 'logic' && 'is-section-focus'"
                  >
                    <label class="wr-trigger-field">
                      <span>{{ '状态逻辑' }}</span>
                      <HosSelect variant="orchestrator" block v-model="triggerSensorForm.stateMode">
                        <option value="power_threshold">{{ '功率阈值 on/off' }}</option>
                        <option value="direct">{{ '直接引用 states()' }}</option>
                        <option value="custom">{{ '自定义 Jinja' }}</option>
                      </HosSelect>
                    </label>
                    <template v-if="triggerSensorForm.stateMode === 'power_threshold'">
                      <label class="wr-trigger-field">
                        <span>{{ '比较符' }}</span>
                        <HosSelect
                          variant="orchestrator"
                          size="sm"
                          block
                          v-model="triggerSensorForm.thresholdOp"
                        >
                          <option value=">=">&gt;=</option>
                          <option value=">">&gt;</option>
                          <option value="<=">&lt;=</option>
                          <option value="<">&lt;</option>
                          <option value="==">==</option>
                          <option value="!=">!=</option>
                        </HosSelect>
                      </label>
                      <label class="wr-trigger-field">
                        <span>{{ '阈值（W）' }}</span>
                        <input
                          v-model.number="triggerSensorForm.threshold"
                          type="number"
                          class="wr-num wr-num--full-left"
                        />
                      </label>
                      <label class="wr-trigger-field">
                        <span>{{ '开（on）值' }}</span>
                        <input
                          v-model="triggerSensorForm.onValue"
                          class="wr-num wr-num--full-left"
                          :placeholder="'如 on'"
                        />
                      </label>
                      <label class="wr-trigger-field">
                        <span>{{ '关（off）值' }}</span>
                        <input
                          v-model="triggerSensorForm.offValue"
                          class="wr-num wr-num--full-left"
                          :placeholder="'如 off'"
                        />
                      </label>
                    </template>
                    <label
                      v-if="triggerSensorForm.stateMode === 'custom'"
                      class="wr-trigger-field wr-trigger-field--wide"
                    >
                      <span>{{ '状态表达式' }}</span>
                      <textarea
                        v-model="triggerSensorForm.customState"
                        class="wr-yaml-edit"
                        rows="3"
                        spellcheck="false"
                      />
                    </label>
                  </div>
                </div>
              </GeekCfgCard>
              <div class="wr-flex-row--md--mt10 geek-template-trigger-form__actions">
                <button
                  v-if="isAdmin"
                  type="button"
                  class="wr-btn-add wr-btn-add--blu wr-btn-add--xs"
                  @click="openTriggerPasteYaml"
                >
                  {{ '粘贴 configuration.yaml 原文' }}
                </button>
                <button
                  v-if="isAdmin && editingId"
                  type="button"
                  class="wr-btn-add wr-btn-add--xs"
                  :disabled="configFileBusy || !haConfigReady"
                  :title="haConfigStatus?.message"
                  @click="doWriteHaConfig"
                >
                  {{ '写入 configuration.yaml' }}
                </button>
                <button
                  v-if="isAdmin && editingId"
                  type="button"
                  class="wr-btn-add wr-btn-add--xs"
                  :disabled="configFileBusy || !haConfigReadable"
                  :title="haConfigStatus?.message"
                  @click="doPullHaConfig"
                >
                  {{ '从 configuration.yaml 读取' }}
                </button>
                <button type="button" class="wr-btn-add wr-btn-add--xs" @click="switchToTriggerRawYaml">
                  {{ '高级 YAML 编辑' }}
                </button>
              </div>
            </div>
          </template>

          <!-- appliance: add slot（优先于槽位编辑，避免被挡住） -->
          <template v-else-if="canvasMode === 'appliance' && showAddSlot">
            <div class="wr-slot-add geek-template-slot-add">
              <div class="wr-slot-add__label">{{ '新建映射槽位' }}</div>
              <div class="geek-template-slot-drawer__edit-stack">
                <div class="geek-template-slot-add__row">
                  <label class="geek-field geek-template-slot-add__icon">
                    <span>{{ '图标' }}</span>
                    <FooterIconPicker
                      v-model="newIcon"
                      compact
                      fallback-icon="📌"
                      :icons="slotIconOptions"
                    />
                  </label>
                  <label class="geek-field geek-template-slot-add__grow">
                    <span>{{ '标签' }}</span>
                    <input v-model="newLabel" class="wr-num" :placeholder="'标签名'" />
                  </label>
                </div>
                <label class="geek-field">
                  <span>{{ '提示' }}</span>
                  <input v-model="newHint" class="wr-num" :placeholder="'提示文字，如：客厅温度传感器'" />
                </label>
                <label class="geek-field">
                  <span>{{ '域过滤' }}</span>
                  <HosSelect variant="orchestrator" size="sm" block v-model="newDomain">
                    <option v-for="d in allDomains" :key="d" :value="d">{{ d }}</option>
                  </HosSelect>
                </label>
                <div class="geek-template-slot-add__actions">
                  <button type="button" class="wr-btn-add wr-btn-add--xs" @click="onCancelAddSlot">
                    {{ '取消' }}
                  </button>
                  <button
                    type="button"
                    class="wr-btn-add wr-btn-add--blu"
                    :disabled="!newLabel.trim()"
                    @click="onConfirmAddSlot"
                  >
                    {{ '添加' }}
                  </button>
                </div>
              </div>
            </div>
          </template>

          <!-- appliance: active slot editor -->
          <template v-else-if="canvasMode === 'appliance' && showSlotDrawer && activeSlot">
            <GeekCfgCard title="槽位映射" accent>
              <EntityInput
                v-model="slots[activeSlot.slot._key || activeSlot.slot.key]"
                :domain-filter="
                  editSlotIdx === activeSlot.idx ? editSlot.domain : activeSlot.slot.domain
                "
                :placeholder="`选择 ${activeSlot.slot.hint}`"
              />
              <p
                v-if="slotIsRequired(activeSlot.slot._key || activeSlot.slot.key)"
                class="wr-hint wr-hint--warn"
              >
                {{ '此槽位为必填' }}
              </p>
              <details
                class="geek-template-slot-drawer__meta"
                :open="editSlotIdx === activeSlot.idx"
                @toggle="onSlotMetaToggle"
              >
                <summary>{{ '槽位属性（图标 / 标签 / 域）' }}</summary>
                <div class="geek-template-slot-drawer__edit-stack">
                  <div class="geek-template-slot-add__row">
                    <label class="geek-field geek-template-slot-add__icon">
                      <span>{{ '图标' }}</span>
                      <FooterIconPicker
                        v-model="editSlot.icon"
                        compact
                        fallback-icon="📌"
                        :icons="slotIconOptions"
                      />
                    </label>
                    <label class="geek-field geek-template-slot-add__grow">
                      <span>{{ '标签' }}</span>
                      <input
                        v-model="editSlot.label"
                        class="wr-num"
                        :placeholder="'标签名'"
                      />
                    </label>
                  </div>
                  <label class="geek-field">
                    <span>{{ '提示' }}</span>
                    <input
                      v-model="editSlot.hint"
                      class="wr-num"
                      :placeholder="'提示文字'"
                    />
                  </label>
                  <label class="geek-field">
                    <span>{{ '域过滤' }}</span>
                    <HosSelect variant="orchestrator" size="sm" block v-model="editSlot.domain">
                      <option v-for="d in allDomains" :key="d" :value="d">{{ d }}</option>
                    </HosSelect>
                  </label>
                </div>
                <div class="geek-template-slot-drawer__actions">
                  <button type="button" class="wr-btn-add wr-btn-add--xs" @click="cancelEditSlot">
                    {{ '取消' }}
                  </button>
                  <button
                    type="button"
                    class="wr-btn-add wr-btn-add--blu"
                    @click="applyEditSlot(activeSlot.idx)"
                  >
                    {{ '保存属性' }}
                  </button>
                </div>
              </details>
            </GeekCfgCard>
            <div class="geek-template-slot-drawer__actions">
              <button
                type="button"
                class="wr-btn-x geek-template-slot-drawer__del"
                :title="'删除映射'"
                @click="removeSlot(activeSlot.idx)"
              >
                {{ '删除槽位' }}
              </button>
            </div>
          </template>

          <!-- appliance: slot list overview -->
          <template v-else-if="canvasMode === 'appliance'">
            <div class="geek-template-appliance__meta">
              <span v-if="hasMissingRequired" class="wr-sec-label--warn">
                {{ `缺 ${missingRequiredCount} 项必填槽位` }}
              </span>
              <span class="geek-template-appliance__count">{{
                `${filledCount}/${slotsList.length} 已填`
              }}</span>
            </div>
            <div v-if="hasMissingRequired" class="wr-slot-alert geek-template-appliance__alert">
              {{ '请填写带 * 标记的必填槽位后再保存；其余槽位可按需映射。' }}
            </div>
            <ul v-if="slotsList.length" class="geek-template-slot-list__items">
              <li
                v-for="slot in slotsList"
                :key="slot._key || slot.key"
                class="geek-template-slot-list__item"
                :class="[
                  slotRowClass(slot._key || slot.key),
                  selectedNodeId === `slot_${slot._key || slot.key}` && 'is-active',
                ]"
              >
                <button
                  type="button"
                  class="geek-template-slot-list__btn"
                  @click="onSelectSlotFromCanvas(slot._key || slot.key)"
                >
                  <span class="geek-template-slot-list__icon">{{ slot.icon }}</span>
                  <span class="geek-template-slot-list__label">
                    {{ slot.label }}
                    <span v-if="slotIsRequired(slot._key || slot.key)" class="wr-slot-req">*</span>
                  </span>
                </button>
                <span class="geek-template-slot-list__val">{{
                  slots[slot._key || slot.key] || '未映射'
                }}</span>
              </li>
            </ul>
            <p v-else class="geek-hint">{{ '暂无槽位，点击下方添加映射' }}</p>
            <button
              type="button"
              class="wr-btn-add wr-btn-add--blu wr-btn-add--xs"
              @click="onOpenAddSlot"
            >
              {{ '+ 添加映射' }}
            </button>
          </template>
          </div>
        </div>
      </aside>
    </div>

    <Teleport :to="teleportTarget" :disabled="teleportDisabled">
      <Transition name="wr-modal">
        <div v-if="pasteYamlOpen" class="wr-modal-shade" @click.self="closePasteYaml">
          <div class="wr-modal-box wr-modal-box--wide">
            <h4 class="wr-modal-title">{{ '粘贴 configuration.yaml 原文' }}</h4>
            <input
              v-model="pasteYamlName"
              class="wr-input-name wr-input-name--block"
              :placeholder="'名称'"
            />
            <textarea
              v-model="pasteYamlText"
              class="wr-yaml-edit"
              rows="16"
              spellcheck="false"
              placeholder="template:&#10;  - trigger: ..."
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
            <h4 class="wr-modal-title">{{ '确认删除模板实体' }}</h4>
            <p class="wr-modal-desc">
              {{ deleteMode === 'ha' ? deleteHaMessage : deleteLocalMessage }}
            </p>
            <div class="wr-modal-actions">
              <button
                class="wr-btn-primary wr-btn-primary--ghost"
                type="button"
                :disabled="deleting || !!deletingHaId"
                @click="closeDeleteConfirm"
              >
                {{ '取消' }}
              </button>
              <button
                class="wr-btn-primary wr-btn-primary--danger"
                type="button"
                :disabled="deleting || !!deletingHaId"
                @click="executeDelete"
              >
                {{ deleting || deletingHaId ? '删除中…' : '确认删除' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import HosSelect from '@/components/common/base/HosSelect.vue'
import TemplateEntityTypeSelect from '@/components/dashboard/TemplateEntityTypeSelect.vue'
import EntityInput from '@/components/common/EntityInput.vue'
import OrchestratorSyncAlert from '@/components/dashboard/OrchestratorSyncAlert.vue'
import TemplateEntitySavedFooter from '@/components/dashboard/TemplateEntitySavedFooter.vue'
import GeekCfgCard from '@/components/geek-automation/GeekCfgCard.vue'
import GeekYamlPreviewDrawer from '@/components/geek-automation/GeekYamlPreviewDrawer.vue'
import GeekSettingsDrawer from '@/components/geek-automation/GeekSettingsDrawer.vue'
import GeekManageDrawer from '@/components/geek-automation/GeekManageDrawer.vue'
import GeekBuilderChrome from '@/components/geek-automation/GeekBuilderChrome.vue'
import GeekTemplateCanvas from '@/components/geek-template/GeekTemplateCanvas.vue'
import FooterIconPicker from '@/components/common/FooterIconPicker.vue'
import { DASHBOARD_FOOTER_ICONS } from '@/constants/dashboard-footer'
import { useGeekTemplateShell } from '@/composables/orchestrator/useGeekTemplateShell'
import { useGeekYamlPreview } from '@/composables/orchestrator/useGeekYamlPreview'
import { useGeekBuilderDrawerChrome } from '@/composables/orchestrator/useGeekBuilderDrawerChrome'
import { useOrchestratorTeleport } from '@/composables/orchestrator/useOrchestratorTeleport'
import { useOrchestratorDriftFocus } from '@/composables/orchestrator/useOrchestratorDriftFocus'
import { hasOrchestratorBuilderDirty } from '@/composables/settings/hub-backup-orchestrator.internals'
import { useChromeStore } from '@/stores/chrome.store'
import { computed, nextTick, ref, watch } from 'vue'
import { onExclusiveDetailsToggle } from '@/composables/ui/useExclusiveDropdown'
import '@/components/dashboard/styles/TemplateEntityBuilder.css'
import '@/components/geek-automation/styles/geek-builder-shared.css'
import './styles/GeekTemplateBuilder.css'

const props = defineProps({
  visible: Boolean,
  embedded: Boolean,
  showEmbeddedClose: Boolean,
  initialEditId: { type: String, default: '' },
})
const emit = defineEmits(['close', 'saved'])
const chrome = useChromeStore()
const { teleportTarget, teleportDisabled } = useOrchestratorTeleport()
const {
  showYaml,
  showManage,
  showSettings,
  closeAllDrawers,
  openManageDrawer: openManageDrawerFlags,
  openYamlDrawer: openYamlDrawerFlags,
  openSettingsDrawer,
} = useGeekBuilderDrawerChrome()
/** 用户主动收起 Inspector；选中节点 / 添加映射时自动重新打开 */
const inspectorCollapsed = ref(false)

function flashCanvasHint(msg) {
  if (!msg) return
  chrome.notify(String(msg), 'success', 1800)
}

const {
  savedList,
  haImportList,
  haDiscovering,
  showDeleteConfirm,
  deleteMode,
  deleting,
  resultMsg,
  resultOk,
  editingId,
  saving,
  syncing,
  syncStatusMap,
  repairProgress,
  deletingHaId,
  stubItemCount,
  deleteLocalMessage,
  deleteHaMessage,
  entName,
  entType,
  storedYaml,
  extraUnit,
  extraDeviceClass,
  extraIcon,
  triggerSensorForm,
  slots,
  slotsList,
  showAddSlot,
  newIcon,
  newLabel,
  newHint,
  newDomain,
  editSlotIdx,
  editSlot,
  importingId,
  pasteYamlName,
  typeSelectGroups,
  selectedTypeMeta,
  selectedTypeOption,
  selectedKindLabel,
  allDomains,
  isYamlOnlyMode,
  canSwitchToTriggerVisual,
  filledCount,
  namePlaceholder,
  hasMissingRequired,
  missingRequiredCount,
  slotIsRequired,
  slotRowClass,
  appliancePresetGroups,
  applyAppliancePreset,
  onEntTypeUpdate,
  yamlPreview,
  haConfigStatus,
  configFileBusy,
  haConfigReady,
  haConfigReadable,
  isAdmin,
  pasteYamlOpen,
  pasteYamlText,
  importFlowImporting,
  canvasMode,
  canvasGraph,
  selectedNodeId,
  showSlotDrawer,
  activeSlot,
  onSelectSlot,
  onSelectRoot,
  closeSlotDrawer,
  backToSlotList,
  removeSlot,
  openAddSlot,
  cancelAddSlot,
  startEditSlot,
  applyEditSlot,
  cancelEditSlot,
  confirmAddSlot,
  startNew,
  switchToTriggerVisual,
  switchToTriggerRawYaml,
  switchFromTriggerRawYaml,
  copyYaml,
  saveBtn,
  doSync,
  doRepair,
  doRepairPull,
  doSyncAll,
  doRepairAll,
  doPullAll,
  openPasteYaml,
  closePasteYaml,
  submitPasteYaml,
  applyStoredYamlToDb,
  doReimport,
  doImport,
  confirmHaDelete,
  editItem,
  delConfirm,
  closeDeleteConfirm,
  executeDelete,
  close,
  doWriteHaConfig,
  doPullHaConfig,
  doWriteHaConfigItem,
  doPullHaConfigItem,
  discoverHA,
  loadList,
  exportConfigJson,
  openConfigJsonImport,
  onConfigJsonFileChange,
  configImportInput,
} = useGeekTemplateShell(props, emit)

const yamlHtml = useGeekYamlPreview(yamlPreview)
const triggerFormEl = ref(null)
const triggerFormFocused = ref(false)
const triggerFocusSection = ref('')
let triggerFormFocusTimer = 0

watch(selectedNodeId, (id) => {
  if (id) inspectorCollapsed.value = false
  if (canvasMode.value !== 'trigger_sensor' || !id) return
  triggerFormFocused.value = true
  nextTick(() => {
    triggerFormEl.value?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  })
  window.clearTimeout(triggerFormFocusTimer)
  triggerFormFocusTimer = window.setTimeout(() => {
    triggerFormFocused.value = false
  }, 1200)
})

function onSelectSectionFromCanvas(kind) {
  revealInspector()
  if (canvasMode.value !== 'trigger_sensor') return
  triggerFocusSection.value = String(kind || '')
  triggerFormFocused.value = true
  nextTick(() => {
    const root = triggerFormEl.value
    const el = root?.querySelector?.(`[data-section="${kind}"]`)
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  })
  window.clearTimeout(triggerFormFocusTimer)
  triggerFormFocusTimer = window.setTimeout(() => {
    triggerFormFocused.value = false
    triggerFocusSection.value = ''
  }, 1400)
}

watch(canvasMode, () => {
  inspectorCollapsed.value = false
})

useOrchestratorDriftFocus(async () => {
  openManageDrawer()
})

function openManageDrawer() {
  openManageDrawerFlags()
  void loadList()
  void discoverHA()
}

function toggleManageDrawer() {
  if (showManage.value) {
    showManage.value = false
    return
  }
  openManageDrawer()
}

function ensureSettingsDrawerOpen() {
  if (showSettings.value) return
  openSettingsDrawer()
}

function toggleYamlDrawer() {
  if (showYaml.value) {
    showYaml.value = false
    return
  }
  openYamlDrawerFlags()
}

function onManageStartNew() {
  startNew()
  showManage.value = false
}

async function onManageEditItem(item) {
  showManage.value = false
  await editItem(item)
}

async function onDismiss() {
  if (props.embedded) {
    if (hasOrchestratorBuilderDirty()) {
      const ok = await chrome.confirm(
        '当前模板有未保存的修改，继续将丢弃更改。是否继续？',
        '未保存的修改',
        { confirmText: '丢弃并继续', cancelText: '继续编辑', type: 'warning' },
      )
      if (!ok) return
    }
    startNew()
    closeAllDrawers()
    return
  }
  await close()
}

function onSlotMetaToggle(ev) {
  if (!activeSlot.value) return
  const open = !!ev?.target?.open
  if (open) {
    if (editSlotIdx.value !== activeSlot.value.idx) startEditSlot(activeSlot.value.idx)
  } else if (editSlotIdx.value === activeSlot.value.idx) {
    cancelEditSlot()
  }
}

function revealInspector() {
  inspectorCollapsed.value = false
}

function onSelectSlotFromCanvas(slotKey) {
  revealInspector()
  onSelectSlot(slotKey)
}

function onSelectRootFromCanvas() {
  revealInspector()
  onSelectRoot()
}

function onOpenAddSlot() {
  revealInspector()
  openAddSlot()
}

function onConfirmAddSlot() {
  if (!String(newLabel.value || '').trim()) {
    chrome.notify('请填写标签名', 'warning')
    return
  }
  if (confirmAddSlot()) {
    flashCanvasHint('已添加映射槽位')
  }
}

function onCancelAddSlot() {
  cancelAddSlot()
  backToSlotList()
  revealInspector()
}

function onClearCanvasSelection() {
  selectedNodeId.value = ''
  closeSlotDrawer()
  if (showAddSlot.value) cancelAddSlot()
}

/** 槽位编辑/新建时「返回列表」；其它模式才收起整个 Inspector */
function onInspectorHeadAction() {
  if (canvasMode.value === 'appliance' && (showSlotDrawer.value || showAddSlot.value)) {
    backToSlotList()
    revealInspector()
    return
  }
  collapseInspector()
}

/** 点画布空白 / 收起：清选中并关闭 Inspector（对齐场景/自动化） */
function collapseInspector() {
  onClearCanvasSelection()
  inspectorCollapsed.value = true
}

function openTriggerPasteYaml() {
  openPasteYaml({
    name: entName.value,
    haConfigId: triggerSensorForm.uniqueId,
    haEntityId: editingId.value
      ? savedList.value.find((i) => i.id === editingId.value)?.haEntityId || ''
      : '',
  })
}

const inspectorOpen = computed(() => {
  // 未选类型：默认不显示 Inspector，走画布空态 /「设置」选类型
  if (canvasMode.value === 'pick_type') return false
  if (inspectorCollapsed.value) return false
  const mode = canvasMode.value
  // yaml / trigger：未收起时显示表单；点空白会置 collapsed
  if (mode === 'yaml_import' || mode === 'trigger_sensor') return true
  if (mode === 'appliance') {
    return (
      showSlotDrawer.value ||
      showAddSlot.value ||
      selectedNodeId.value === 'template_root'
    )
  }
  return false
})

const canCollapseInspector = computed(() => inspectorOpen.value)

const inspectorTitle = computed(() => {
  const mode = canvasMode.value
  if (mode === 'pick_type') return '选择模板类型'
  if (mode === 'yaml_import') return '纯 YAML 模式'
  if (mode === 'trigger_sensor') return '触发式传感器'
  if (showAddSlot.value) return '添加映射'
  if (showSlotDrawer.value && activeSlot.value) {
    const slot = activeSlot.value.slot
    if (editSlotIdx.value === activeSlot.value.idx && editSlot.label) return editSlot.label
    return slot.label || '槽位映射'
  }
  if (mode === 'appliance') return '槽位列表'
  return '模板配置'
})

const inspectorSub = computed(() => {
  if (canvasMode.value === 'appliance' && showSlotDrawer.value && activeSlot.value) {
    const slot = activeSlot.value.slot
    const hint =
      editSlotIdx.value === activeSlot.value.idx && editSlot.hint ? editSlot.hint : slot.hint
    const domain =
      editSlotIdx.value === activeSlot.value.idx && editSlot.domain ? editSlot.domain : slot.domain
    return `${hint || '槽位映射'} · ${domain || ''}`
  }
  if (canvasMode.value === 'appliance' && !showSlotDrawer.value && !showAddSlot.value) {
    const total = Array.isArray(slotsList) ? slotsList.length : 0
    return `${filledCount.value ?? 0}/${total} 已填`
  }
  return ''
})

const extraIconPreviewLabel = computed(() => {
  const raw = (extraIcon.value || '').trim()
  if (!raw) return ''
  return raw.replace(/^mdi:/, '')
})

/** 槽位图标候选：常用家电/传感器 emoji + 底栏图标集 */
const slotIconOptions = [
  '📌',
  '📍',
  '🔌',
  '💡',
  '🌡️',
  '🔋',
  '💧',
  '🔥',
  '❄️',
  '🧊',
  '🌬',
  '🧹',
  '📺',
  '🔊',
  '🪟',
  '🔐',
  '👕',
  '🍽',
  '🍳',
  '🏠',
  '⚙️',
  '📊',
  '✨',
  ...DASHBOARD_FOOTER_ICONS.filter((ic) => !['📌', '📍', '🔌', '💡', '🌡️', '🔋', '💧', '🔥', '❄️', '🧊', '🏠', '📊', '✨'].includes(ic)),
]
</script>

<style scoped>
:deep(.geek-builder__settings-drawer) {
  width: min(360px, calc(94vw / var(--hos-scale, 1)));
}
:deep(.geek-builder__settings-body) {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
.geek-template-json-menu {
  position: relative;
}
.geek-template-json-menu > summary {
  list-style: none;
  cursor: pointer;
}
.geek-template-json-menu > summary::-webkit-details-marker {
  display: none;
}
.geek-template-json-menu__panel {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 20;
  min-width: 140px;
  padding: 6px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: #0f172a;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
}
.geek-template-json-menu__item {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font-size: var(--premium-fs-caption);
  text-align: left;
  cursor: pointer;
}
.geek-template-json-menu__item:hover {
  background: rgba(148, 163, 184, 0.12);
}
.geek-template-json-menu__item--primary {
  color: #93c5fd;
}
.geek-template-presets {
  margin-top: 4px;
  font-size: var(--premium-fs-caption);
}
.geek-template-presets summary {
  cursor: pointer;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.9);
  padding: 4px 0;
}
</style>

