<!--
组件：WidgetBuilderView.vue
所属模块：frontend / src / views
-->
<template>
  <ScaledViewport>
    <div
      class="builder-root"
      :style="{
        '--page-accent': 'var(--module-accent-layout)',
        '--page-accent-rgb': 'var(--module-accent-layout-rgb)',
        '--page-accent-secondary': 'var(--module-accent-layout-sub)',
        '--wcfg-accent-rgb': 'var(--module-accent-layout-rgb)',
      }"
    >
      <header class="builder-header">
        <div class="builder-header-left">
          <button
            type="button"
            class="builder-back-btn icon-btn p-2 rounded-lg transition-colors flex items-center gap-2"
            aria-label="返回"
            @click="goBack"
          >
            <ArrowLeft class="w-4 h-4" />
            <span class="text-sm font-bold">{{ '返回' }}</span>
          </button>
          <div class="builder-divider h-5 w-px" />
          <div class="builder-header-identity">
            <div class="widget-config-shell__orb builder-header-orb" aria-hidden="true">
              <Code class="widget-config-shell__orb-icon" />
            </div>
            <div class="min-w-0">
              <p class="widget-config-shell__eyebrow">{{ '全屏工作台' }}</p>
              <div class="builder-header-title-row">
                <h1 class="builder-title">{{ '自定义面板微件' }}</h1>
                <span class="builder-id-mono">#{{ widgetIdShort }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="builder-header-actions">
          <span class="builder-kbd-hint">{{ 'Ctrl+S 保存' }}</span>
          <span v-if="isDirty" class="widget-config-footer__dirty">{{ '未保存' }}</span>
          <button
            type="button"
            class="builder-cancel-btn widget-config-footer__ghost"
            @click="cancelWidgetEdits"
          >
            <span>{{ '取消' }}</span>
          </button>
          <button
            type="button"
            class="builder-save-btn widget-config-footer__save"
            :disabled="isSaving || !isDirty"
            @click="saveWidget"
          >
            <Save class="w-4 h-4" />
            <span>{{ isSaving ? '保存中…' : '保存到服务端' }}</span>
          </button>
        </div>
      </header>

      <main class="builder-main">
        <section class="builder-editor">
          <div class="builder-editor-tabs">
            <SettingsOrchTabs v-model="builderTab" :tabs="builderTabs" />
          </div>

          <WidgetBuilderScaffoldPanel
            v-show="builderTab === 'scaffold'"
            v-model:kind="scaffoldKind"
            v-model:selected-entity-ids="scaffoldEntityIds"
            @generate="generateScaffold"
            @open-entity-picker="openScaffoldEntityPicker"
          />

          <div v-show="builderTab === 'edit'" class="builder-editor-code flex-1 flex flex-col min-h-0">
            <div class="builder-editor-toolbar">
              <div class="builder-edit-pane-tabs">
                <button
                  v-for="pane in builderEditPanes"
                  :key="pane.id"
                  type="button"
                  class="builder-edit-pane-tab"
                  :class="{ 'builder-edit-pane-tab--active': editPane === pane.id }"
                  @click="editPane = pane.id"
                >
                  {{ pane.label }}
                </button>
                <label v-if="editPane === 'style'" class="builder-scoped-toggle">
                  <input
                    type="checkbox"
                    :checked="editorParts.styleScoped"
                    @change="updateEditorPart('styleScoped', $event.target.checked)"
                  />
                  <span>作用域隔离</span>
                </label>
              </div>
              <div class="builder-editor-toolbar-actions">
                <button type="button" class="builder-toolbar-btn" @click="openInsertEntityPicker">
                  {{ '插入实体' }}
                </button>
                <button type="button" class="builder-toolbar-btn" @click="resetToDefaultTemplate">
                  {{ '恢复示例' }}
                </button>
              </div>
            </div>

            <WidgetBuilderCodePane
              v-if="editPane === 'script'"
              :model-value="editorParts.script"
              label="脚本 · export default { setup(ctx) {} }"
              placeholder="export default { setup({ entityState }) { ... } }"
              @textarea-bind="bindTextarea"
              @update:model-value="updateEditorPart('script', $event)"
              @keydown="onEditPaneKeydown"
            />
            <WidgetBuilderCodePane
              v-else-if="editPane === 'template'"
              :model-value="editorParts.template"
              label="模板 · Vue 模板 + Tailwind"
              placeholder="<div class=&quot;p-4&quot;>{{ entityState('sensor.temp') }}</div>"
              @textarea-bind="bindTextarea"
              @update:model-value="updateEditorPart('template', $event)"
              @keydown="onEditPaneKeydown"
            />
            <WidgetBuilderCodePane
              v-else
              :model-value="editorParts.style"
              label="样式 · 可选作用域隔离"
              placeholder=".card { padding: 1rem; }"
              @textarea-bind="bindTextarea"
              @update:model-value="updateEditorPart('style', $event)"
              @keydown="onEditPaneKeydown"
            />
          </div>

          <div v-show="builderTab === 'source'" class="builder-editor-code flex-1 flex flex-col min-h-0">
            <div class="builder-editor-toolbar">
              <div class="builder-code-tag flex items-center gap-2">
                <Code class="w-4 h-4" />
                <span class="text-xs font-bold tracking-wider">{{ '完整源码' }}</span>
              </div>
              <div class="builder-editor-toolbar-actions">
                <button
                  v-for="item in builderApiInserts"
                  :key="item.label"
                  type="button"
                  class="builder-toolbar-btn builder-toolbar-btn--mini"
                  :title="item.code"
                  @click="insertApiSnippet(item.code)"
                >
                  {{ item.label }}
                </button>
                <button type="button" class="builder-toolbar-btn" @click="openInsertEntityPicker">
                  {{ '插入实体' }}
                </button>
              </div>
            </div>
            <WidgetBuilderCodePane
              :model-value="rawHtml"
              placeholder="<template>...</template>"
              @textarea-bind="bindTextarea"
              @update:model-value="setRawHtml"
              @keydown="onCodeKeydown"
            />
          </div>

          <CustomHtmlSnippetPanel
            v-show="builderTab === 'snippets'"
            :snippets="snippets"
            @apply="onApplySnippet"
            @replace="onReplaceSnippet"
          />

          <div v-show="builderTab === 'tips'" class="builder-tips-panel">
            <div class="builder-tips builder-tips--inline">
              <Info class="w-4 h-4 shrink-0 mt-0.5" />
              <div class="leading-relaxed opacity-80">
                <strong>{{ '推荐流程：' }}</strong>
                {{ '快速搭建 → 分块编辑微调 → 完整源码合并查看。模板写布局，脚本写交互，样式写局部样式。' }}
              </div>
            </div>

            <div class="builder-api-ref">
              <h3 class="builder-api-ref__title">{{ '沙盒 API' }}</h3>
              <div
                v-for="item in builderApiItems"
                :key="item.name"
                class="builder-api-ref__item"
              >
                <code class="builder-api-ref__name">{{ item.name }}</code>
                <p class="builder-api-ref__desc">{{ item.desc }}</p>
                <pre class="builder-api-ref__example">{{ item.example }}</pre>
              </div>
            </div>

            <div class="widget-config-shell__note builder-tips-note">
              <Info class="widget-config-shell__note-icon" aria-hidden="true" />
              <p class="widget-config-shell__note-text">
                {{ 'Ctrl+S 直接保存到服务端；样式建议勾选作用域隔离，避免多个微件样式互相污染。预览宽度跟随侧栏配置，若设置了卡片高度会同步模拟。' }}
              </p>
            </div>
          </div>
        </section>

        <section class="builder-preview">
          <div class="builder-preview-toolbar">
            <Eye class="w-4 h-4" />
            <span class="text-xs font-bold tracking-wider">{{ '侧栏预览' }}</span>
            <span class="builder-preview-meta">{{ previewMeta }}</span>
            <span v-if="previewError" class="builder-preview-err">{{ previewError }}</span>
          </div>
          <div class="builder-preview-area builder-preview-stage">
            <div
              class="builder-preview-frame bg-transparent min-h-[72px]"
              :style="previewFrameStyle"
            >
              <CustomHtmlWidget
                :config="widgetConfig"
                :id="widgetId"
                @compile-error="onPreviewError"
              />
            </div>
          </div>
        </section>
      </main>

      <EntityPickModal
        :is-open="showEntityPicker"
        domain="other"
        domain-label="实体"
        :initial-ids="entityPickerSeed"
        standalone
        @close="showEntityPicker = false"
        @save="onEntityPickerSave"
      />

      <VConfirmModal />
    </div>
  </ScaledViewport>
</template>

<script setup>
import { computed } from 'vue'
import { defineAsyncComponent } from 'vue'
import SettingsOrchTabs from '@/views/settings/shared/layout/SettingsOrchTabs.vue'
import '@/views/settings/shared/styles/settings-tokens.css'
import '@/views/settings/shared/styles/settings-orch-tabs.css'
import '@/views/settings/display/styles/layout-panels.css'
import './styles/widget-builder-view.css'
import { ArrowLeft, Save, Code, Info, Eye } from '@lucide/vue'
import CustomHtmlSnippetPanel from '@/components/widgets/custom-html/CustomHtmlSnippetPanel.vue'
import WidgetBuilderCodePane from '@/components/widgets/custom-html/WidgetBuilderCodePane.vue'
import WidgetBuilderScaffoldPanel from '@/components/widgets/custom-html/WidgetBuilderScaffoldPanel.vue'
import ScaledViewport from '@/layouts/ScaledViewport.vue'
import { useWidgetBuilderView } from '@/composables/widget/useWidgetBuilderView'

const EntityPickModal = defineAsyncComponent(
  () => import('@/components/entities/EntityPickModal.vue'),
)
const VConfirmModal = defineAsyncComponent(
  () => import('@/components/common/base/VConfirmModal.vue'),
)
const CustomHtmlWidget = defineAsyncComponent(
  () => import('@/components/widgets/CustomHtmlWidget.vue'),
)

const {
  layoutStore,
  builderTab,
  builderTabs,
  builderEditPanes,
  builderApiItems,
  builderApiInserts,
  editPane,
  editorParts,
  updateEditorPart,
  previewFrameStyle,
  scaffoldEntityIds,
  scaffoldKind,
  widgetId,
  widgetIdShort,
  isSaving,
  isDirty,
  previewError,
  rawHtml,
  widgetConfig,
  onPreviewError,
  goBack,
  saveWidget,
  cancelWidgetEdits,
  resetToDefaultTemplate,
  generateScaffold,
  openScaffoldEntityPicker,
  openInsertEntityPicker,
  onEntityPickerSave,
  insertApiSnippet,
  onCodeKeydown,
  onEditPaneKeydown,
  setRawHtml,
  bindTextarea,
  snippets,
  showEntityPicker,
  entityPickerSeed,
  insertSnippetInBuilder,
} = useWidgetBuilderView()

const previewMeta = computed(() => {
  const w = layoutStore.layoutConfig.rightPanelWidth || 260
  const h = Number(
    layoutStore.layoutConfig.rightPanelWidgets?.find((item) => item.id === widgetId.value)?.config
      ?.cardHeight,
  )
  return h > 0 ? `${w}px × ${h}px` : `${w}px 宽`
})

function onApplySnippet(id) {
  insertSnippetInBuilder(id)
  if (builderTab.value !== 'edit') {
    builderTab.value = 'edit'
    editPane.value = 'template'
  }
}

function onReplaceSnippet(id) {
  insertSnippetInBuilder(id, 'replace')
}
</script>
