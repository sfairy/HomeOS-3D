<!--
  GeekManagePanel.vue
  职责：geek-builder 管理抽屉的主体内容组件，承载执行历史 + 引擎能力 + 已保存列表。
       域差异通过 props（history/engine/saved）与 slots 注入；Template 域勿用本组件。
  所属模块：geek-automation（自动化、场景、脚本均复用）。
  关键依赖：
    - BuilderExecHistory：执行历史展示。
    - OrchestratorEngineCapsPanel：本地引擎能力展示。
    - OrchestratorSavedFooter：已保存列表 + HA 发现列表 + 同步/修复/编辑/删除按钮。
  Props：
    - history*：执行历史标题 / 接口 / 记录映射 / 缓存 key。
    - engine*：引擎能力标题 / 缓存 key / 分组 / 限制列表 / 是否展示。
    - savedList/haImportList：本地与 HA 列表。
    - syncStatusMap/syncing/deletingHaId/driftCount：HA 同步状态与进行中态。
    - isAdmin：是否管理员，决定同步/修复/删除等按钮可见性。
    - saved*：本地列表标题与空提示文案。
    - haEmptyText：HA 列表空提示文案。
  Emits：start-new / sync-all / repair-all / edit / delete / discover / pull-all / import / ha-delete。
  Slots（透传到 OrchestratorSavedFooter）：saved-toolbar-extra / ha-toolbar-extra /
    saved-name-extra / saved-meta / saved-row-actions / ha-row。
-->
<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 GeekManagePanel 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * Geek 管理抽屉主体：执行历史 + 引擎能力 + OrchestratorSavedFooter
 * 域差异通过 slots / history·engine props 注入；Template 域勿用本组件。
 */
import BuilderExecHistory from '@/components/orchestrator/BuilderExecHistory.vue'
import OrchestratorEngineCapsPanel from '@/components/dashboard/OrchestratorEngineCapsPanel.vue'
import OrchestratorSavedFooter from '@/components/dashboard/OrchestratorSavedFooter.vue'

defineProps({
  historyTitle: { type: String, required: true },
  historyEndpoint: { type: String, required: true },
  historyMapRecord: { type: Function, default: null },
  historyStorageKey: { type: String, required: true },
  engineTitle: { type: String, default: '本地引擎能力' },
  engineStorageKey: { type: String, default: '' },
  engineSections: { type: Array, default: null },
  engineLimitations: { type: Array, default: () => [] },
  showEngineCaps: { type: Boolean, default: true },
  savedList: { type: Array, default: () => [] },
  haImportList: { type: Array, default: () => [] },
  syncStatusMap: { type: Object, default: () => ({}) },
  isAdmin: { type: Boolean, default: false },
  syncing: { type: Boolean, default: false },
  deletingHaId: { type: [String, Number], default: '' },
  driftCount: { type: Number, default: 0 },
  savedTitle: { type: String, required: true },
  emptySavedText: { type: String, default: '' },
  haEmptyText: { type: String, default: '' },
})

defineEmits([
  'start-new',
  'sync-all',
  'repair-all',
  'edit',
  'delete',
  'discover',
  'pull-all',
  'import',
  'ha-delete',
])
</script>

<template>
  <div class="geek-builder__manage-side">
    <BuilderExecHistory
      :title="historyTitle"
      :endpoint="historyEndpoint"
      :limit="6"
      :map-record="historyMapRecord"
      compact
      flow
      :storage-key="historyStorageKey"
    />
    <OrchestratorEngineCapsPanel
      v-if="showEngineCaps && engineSections"
      :title="engineTitle"
      :storage-key="engineStorageKey"
      :sections="engineSections"
      :limitations="engineLimitations"
    />
  </div>
  <OrchestratorSavedFooter
    :saved-list="savedList"
    :ha-import-list="haImportList"
    :sync-status-map="syncStatusMap"
    :is-admin="isAdmin"
    :syncing="syncing"
    :deleting-ha-id="deletingHaId"
    :drift-count="driftCount"
    :embedded="true"
    :saved-title="savedTitle"
    :empty-saved-text="emptySavedText"
    :ha-empty-text="haEmptyText"
    @start-new="$emit('start-new')"
    @sync-all="$emit('sync-all')"
    @repair-all="$emit('repair-all')"
    @edit="$emit('edit', $event)"
    @delete="$emit('delete', $event)"
    @discover="$emit('discover')"
    @pull-all="$emit('pull-all')"
    @import="$emit('import', $event)"
    @ha-delete="$emit('ha-delete', $event)"
  >
    <template v-if="$slots['saved-toolbar-extra']" #saved-toolbar-extra>
      <slot name="saved-toolbar-extra" />
    </template>
    <template v-if="$slots['ha-toolbar-extra']" #ha-toolbar-extra>
      <slot name="ha-toolbar-extra" />
    </template>
    <template v-if="$slots['saved-name-extra']" #saved-name-extra="slotProps">
      <slot name="saved-name-extra" v-bind="slotProps" />
    </template>
    <template v-if="$slots['saved-meta']" #saved-meta="slotProps">
      <slot name="saved-meta" v-bind="slotProps" />
    </template>
    <template v-if="$slots['saved-row-actions']" #saved-row-actions="slotProps">
      <slot name="saved-row-actions" v-bind="slotProps" />
    </template>
    <template v-if="$slots['ha-row']" #ha-row="slotProps">
      <slot name="ha-row" v-bind="slotProps" />
    </template>
    <template v-if="$slots['ha-name-extra']" #ha-name-extra="slotProps">
      <slot name="ha-name-extra" v-bind="slotProps" />
    </template>
    <template v-if="$slots['ha-meta']" #ha-meta="slotProps">
      <slot name="ha-meta" v-bind="slotProps" />
    </template>
    <template v-if="$slots['ha-row-actions']" #ha-row-actions="slotProps">
      <slot name="ha-row-actions" v-bind="slotProps" />
    </template>
  </OrchestratorSavedFooter>
</template>
