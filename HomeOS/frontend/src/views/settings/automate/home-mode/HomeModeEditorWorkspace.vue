/**
 * 组件：HomeModeEditorWorkspace.vue
 *
 * 所属模块：frontend / src / views / settings / automate / home-mode
 * 职责：家庭模式编辑器主工作区。组合基础信息、动作、触发、日志四个分区，并提供
 *      分区切换、保存/取消、立即激活/退出/删除等运行态操作；嵌入设置页时保存走壳层。
 * 关键依赖：
 *  - HomeModePresetSidebar / HomeModeBasicSection / HomeModeActionsSection /
 *    HomeModeTriggersSection / HomeModeLogsSection：各分区子组件
 *  - isHomeModeEmojiIcon / resolveHomeModeIcon：头部图标渲染
 * 数据来源：父级透传的 activeDraft（双向）+ 各分区所需的选项/列表/回调
 */
<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/HomeModeEditorWorkspace 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { Play, Power } from '@lucide/vue'
import HomeModePresetSidebar from './HomeModePresetSidebar.vue'
import HomeModeBasicSection from '@/views/settings/automate/home-mode/HomeModeBasicSection.vue'
import HomeModeActionsSection from '@/views/settings/automate/home-mode/HomeModeActionsSection.vue'
import HomeModeTriggersSection from '@/views/settings/automate/home-mode/HomeModeTriggersSection.vue'
import HomeModeLogsSection from '@/views/settings/automate/home-mode/HomeModeLogsSection.vue'
import { isHomeModeEmojiIcon, resolveHomeModeIcon } from '@/utils/home/mode-icon.util'

// 双向绑定：当前激活分区、批量面板域/服务、当前编辑草稿
const activeSection = defineModel('activeSection', { type: String, required: true })
const batchDomain = defineModel('batchDomain', { type: String, required: true })
const batchService = defineModel('batchService', { type: String, required: true })
const activeDraft = defineModel('activeDraft', { type: Object, required: true })

// 入参：当前模式 tab、模式对象、分区 tabs、预设、域/服务/场景/脚本列表、触发与日志、保存/运行态等
defineProps({
  activeTab: { type: String, required: true },
  activeMode: { type: Object, default: null },
  activeDraftDirty: { type: Boolean, default: false },
  sectionTabs: { type: Array, required: true },
  showPresetSidebar: { type: Boolean, default: false },
  modePresets: { type: Array, default: () => [] },
  presetInstalling: { type: [String, null], default: null },
  homeModeIconOptions: { type: Array, default: () => [] },
  exclusiveGroupOptions: { type: Array, default: () => [] },
  actionTemplates: { type: Array, default: () => [] },
  showBatch: { type: Boolean, default: false },
  allDomains: { type: Array, default: () => [] },
  batchChecked: { type: Array, default: () => [] },
  servicesForDomain: { type: Function, required: true },
  batchEntities: { type: Function, required: true },
  actionKindOptions: { type: Array, default: () => [] },
  savedScenes: { type: Array, default: () => [] },
  savedScripts: { type: Array, default: () => [] },
  triggerTypeOptions: { type: Array, default: () => [] },
  triggerLogs: { type: Array, default: () => [] },
  execHistory: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
  acting: { type: Boolean, default: false },
  actionFocusEpoch: { type: Number, default: 0 },
  actionFocusIndex: { type: [Number, null], default: null },
  triggerFocusEpoch: { type: Number, default: 0 },
  triggerFocusIndex: { type: [Number, null], default: null },
  /** 设置页嵌入：保存走壳层，页脚仅保留运行态操作 */
  embedded: { type: Boolean, default: false },
})

const emit = defineEmits([
  'apply-template',
  'duplicate',
  'toggle-batch',
  'add-action',
  'batch-domain-change',
  'apply-batch',
  'cancel-batch',
  'batch-select-all',
  'batch-clear',
  'toggle-batch-check',
  'kind-change',
  'add-trigger',
  'save',
  'cancel',
  'activate',
  'deactivate',
  'delete',
  'install-preset',
])
</script>

<template>
  <div class="hm-split flex-1 min-h-0">
    <div class="hm-split__main flex flex-col min-h-0 hm-workspace">
      <div class="hm-editor-head shrink-0 hm-editor-head--compact">
        <div class="hm-editor-head__card">
          <div class="hm-editor-head__top">
            <div class="hm-editor-head__icon" aria-hidden="true">
              <span
                v-if="isHomeModeEmojiIcon(activeDraft.icon || '🏠')"
                class="hm-editor-head__emoji"
                >{{ activeDraft.icon || '🏠' }}</span
              >
              <component
                v-else
                :is="resolveHomeModeIcon(activeDraft.icon)"
                class="hm-editor-head__lucide"
              />
            </div>
            <div class="hm-editor-head__identity">
              <div class="hm-editor-head__title-row">
                <h3 class="hm-editor-head__title">{{ activeDraft.name || '此模式' }}</h3>
                <span v-if="activeMode?.id === activeTab" class="hm-editor-head__live">
                  <span class="hm-editor-head__live-dot" />{{ '激活中' }}
                </span>
                <span v-if="activeDraft.isNew || activeDraftDirty" class="hm-editor-head__draft">{{
                  '未保存'
                }}</span>
                <span class="hm-editor-head__meta">
                  <span>{{ '动作' }} {{ activeDraft.actions?.length || 0 }}</span>
                  <span class="hm-editor-head__sep" aria-hidden="true">·</span>
                  <span>{{ '触发' }} {{ activeDraft.triggers?.length || 0 }}</span>
                </span>
              </div>
            </div>
          </div>
          <nav class="hm-segments" aria-label="模式分区">
            <button
              v-for="sec in sectionTabs"
              :key="sec.id"
              type="button"
              :class="['hm-segment', activeSection === sec.id && 'hm-segment--active']"
              @click="activeSection = sec.id"
            >
              <span v-if="sec.emoji" class="hm-segment__emoji">{{ sec.emoji }}</span>
              <component v-else-if="sec.icon" :is="sec.icon" class="w-3.5 h-3.5 shrink-0" />
              <span>{{ sec.label }}</span>
              <span v-if="sec.count != null" class="hm-segment__count">{{ sec.count }}</span>
            </button>
          </nav>
        </div>
      </div>

      <div class="hm-panel-scroll flex-1 min-h-0 flex flex-col overflow-hidden">
        <section :key="activeTab" class="hm-panel hm-panel--fill">
          <HomeModeBasicSection
            v-show="activeSection === 'basic'"
            v-model:active-draft="activeDraft"
            :home-mode-icon-options="homeModeIconOptions"
            :exclusive-group-options="exclusiveGroupOptions"
            :action-templates="actionTemplates"
            @apply-template="emit('apply-template', $event)"
          />

          <HomeModeActionsSection
            v-show="activeSection === 'actions'"
            v-model:batch-domain="batchDomain"
            v-model:batch-service="batchService"
            v-model:active-draft="activeDraft"
            :show-batch="showBatch"
            :all-domains="allDomains"
            :batch-checked="batchChecked"
            :services-for-domain="servicesForDomain"
            :batch-entities="batchEntities"
            :action-kind-options="actionKindOptions"
            :saved-scenes="savedScenes"
            :saved-scripts="savedScripts"
            :action-focus-epoch="actionFocusEpoch"
            :action-focus-index="actionFocusIndex"
            @duplicate="emit('duplicate')"
            @toggle-batch="emit('toggle-batch')"
            @add-action="emit('add-action')"
            @batch-domain-change="emit('batch-domain-change')"
            @apply-batch="emit('apply-batch')"
            @cancel-batch="emit('cancel-batch')"
            @batch-select-all="emit('batch-select-all')"
            @batch-clear="emit('batch-clear')"
            @toggle-batch-check="emit('toggle-batch-check', $event)"
            @kind-change="emit('kind-change', $event)"
          />

          <HomeModeTriggersSection
            v-show="activeSection === 'triggers'"
            v-model:active-draft="activeDraft"
            :trigger-type-options="triggerTypeOptions"
            :trigger-focus-epoch="triggerFocusEpoch"
            :trigger-focus-index="triggerFocusIndex"
            :trigger-logs="triggerLogs"
            :active-mode="activeMode"
            @add-trigger="emit('add-trigger')"
          />

          <HomeModeLogsSection
            v-show="activeSection === 'logs'"
            :trigger-logs="triggerLogs"
            :exec-history="execHistory"
            :active-mode-id="activeTab"
          />
        </section>
      </div>

      <div class="hm-mode-footer shrink-0" :class="{ 'hm-mode-footer--runtime-only': embedded }">
        <p v-if="activeDraftDirty && !embedded" class="hm-mode-footer__hint">
          {{ '有未保存修改，请先保存后再激活以确保使用最新配置' }}
        </p>
        <div class="hm-mode-footer__row">
          <div v-if="!embedded" class="hm-mode-footer__primary">
            <button
              type="button"
              class="hm-toolbar-btn hm-toolbar-btn--accent"
              :disabled="saving"
              @click="emit('save')"
            >
              {{ saving ? '保存中…' : '保存模式' }}
            </button>
            <button
              v-if="activeDraftDirty"
              type="button"
              class="hm-toolbar-btn"
              :disabled="saving"
              @click="emit('cancel')"
            >
              {{ '取消修改' }}
            </button>
          </div>
          <p v-else-if="activeDraftDirty" class="hm-mode-footer__hint hm-mode-footer__hint--inline">
            {{ '有未保存修改，请先保存后再激活' }}
          </p>
          <div class="hm-mode-footer__runtime">
            <button
              v-if="!activeDraft.isNew"
              type="button"
              class="hm-toolbar-btn hm-toolbar-btn--success"
              :disabled="acting || activeDraftDirty"
              :title="activeDraftDirty ? '请先保存修改' : ''"
              @click="emit('activate')"
            >
              <Play class="w-3.5 h-3.5" /> {{ '立即激活' }}
            </button>
            <button
              v-if="activeMode?.id === activeTab && !activeDraft.isNew"
              type="button"
              class="hm-toolbar-btn hm-toolbar-btn--danger"
              :disabled="acting"
              @click="emit('deactivate')"
            >
              <Power class="w-3.5 h-3.5" /> {{ '退出模式' }}
            </button>
          </div>
          <button
            type="button"
            class="hm-delete-mode-btn hm-mode-footer__delete"
            @click="emit('delete')"
          >
            {{ '删除此模式' }}
          </button>
        </div>
      </div>
    </div>

    <HomeModePresetSidebar
      v-if="showPresetSidebar"
      :presets="modePresets"
      :installing="presetInstalling"
      @install="emit('install-preset', $event)"
    />
  </div>
</template>
