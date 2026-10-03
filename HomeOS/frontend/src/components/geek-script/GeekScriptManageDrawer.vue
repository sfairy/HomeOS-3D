<!--
  GeekScriptManageDrawer.vue
  职责：geek-script 脚本编辑器的「管理抽屉」组件（从 GeekScriptBuilder 抽离）。
       纯展示/事件转发组件：基于 GeekManageDrawer + GeekManagePanel，
       渲染脚本执行历史、引擎能力、本地/HA 列表，并通过 slots 注入脚本专属的
       批量导入导出、克隆、执行、修复、推送等行操作按钮；列表数据与操作处理全部由父级注入。
  所属模块：geek-script。
  关键依赖：
    - GeekManageDrawer / GeekManagePanel（来自 geek-automation 的共用管理壳与面板）。
    - @lucide/vue 的 Upload / RefreshCw / Play / CopyPlus / Loader2：行操作图标。
    - itemHasGeekGraph：判定列表项是否含 geek 图（否则显示「YAML 还原」徽标）。
  Props：
    - open：抽屉开关。
    - mapScriptHistory：执行历史记录映射函数。
    - scriptEngineSections：引擎能力分组。
    - engineCaps：引擎能力清单（含 limitations）。
    - savedList / haImportList：本地与 HA 列表。
    - syncStatusMap / syncing / deletingHaId / driftCount：HA 同步状态与进行中态。
    - isAdmin：是否管理员，决定批量导入导出/克隆/执行/修复/推送等按钮可见性。
    - batchExporting / batchImporting / importFlowImporting / cloningId：批量与克隆进行中态。
  Emits：
    - close / start-new / sync-all / repair-all / edit / delete / discover / pull-all / import / ha-delete：通用管理动作。
    - batch-export-json / batch-export-yaml / batch-pick-import / open-paste-yaml / bulk-import-discovered：批量导入导出。
    - clone / prompt-execute / repair / sync：行级动作。
  Slots（透传到 GeekManagePanel）：
    - saved-toolbar-extra：本地列表工具栏额外按钮（导出 JSON/YAML、导入、粘贴 YAML）。
    - ha-toolbar-extra：HA 列表工具栏额外按钮（批量导入发现）。
    - saved-name-extra：本地列表项名称额外徽标（YAML 还原）。
    - saved-row-actions：本地列表项行操作（克隆/执行/修复/推送）。
    - ha-row：HA 列表行自定义渲染（含不完整徽标与导入/删除按钮）。
-->
<template>
  <!-- GeekScriptManageDrawer 脚本管理抽屉：本地/HA 列表、批量导入导出、克隆/执行/修复/推送 -->
  <GeekManageDrawer
    :open="open"
    aria-label="脚本管理"
    title="管理"
    subtitle="全部脚本：打开、推送 HA、修复漂移、执行、粘贴 YAML"
    @close="$emit('close')"
  >
    <GeekManagePanel
      history-title="脚本执行"
      history-endpoint="/script/history/executions"
      :history-map-record="mapScriptHistory"
      history-storage-key="homeos_orch_exec_geek_script"
      engine-storage-key="homeos_orch_engine_geek_script"
      :engine-sections="scriptEngineSections"
      :engine-limitations="engineCaps?.limitations || []"
      :show-engine-caps="!!engineCaps"
      :saved-list="savedList"
      :ha-import-list="haImportList"
      :sync-status-map="syncStatusMap"
      :is-admin="isAdmin"
      :syncing="syncing"
      :deleting-ha-id="deletingHaId"
      :drift-count="driftCount"
      saved-title="HomeOS · 脚本"
      empty-saved-text="暂无保存的脚本"
      ha-empty-text="连接 HA 后自动发现脚本"
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
      <template #saved-toolbar-extra>
        <button
          v-if="isAdmin"
          class="wr-btn-add wr-btn-add--xs"
          type="button"
          :disabled="batchExporting || batchImporting"
          :title="'导出全部为 JSON'"
          @click="$emit('batch-export-json')"
        >
          {{ batchExporting ? '导出中…' : '导出 JSON' }}
        </button>
        <button
          v-if="isAdmin"
          class="wr-btn-add wr-btn-add--xs"
          type="button"
          :disabled="batchExporting || batchImporting"
          :title="'导出全部为多文档 YAML'"
          @click="$emit('batch-export-yaml')"
        >
          {{ '导出 YAML' }}
        </button>
        <button
          v-if="isAdmin"
          class="wr-btn-add wr-btn-add--xs"
          type="button"
          :disabled="batchImporting"
          :title="'导入 JSON / YAML 文件并批量创建'"
          @click="$emit('batch-pick-import')"
        >
          {{ batchImporting ? '导入中…' : '导入' }}
        </button>
        <button
          v-if="isAdmin"
          class="wr-btn-add wr-btn-add--xs"
          type="button"
          @click="$emit('open-paste-yaml')"
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
          @click="$emit('bulk-import-discovered')"
        >
          {{ '批量导入发现' }}
        </button>
      </template>
      <template #saved-name-extra="{ item }">
        <span v-if="!itemHasGeekGraph(item)" class="wr-mini-badge">{{ 'YAML 还原' }}</span>
      </template>
      <template #saved-row-actions="{ item }">
        <button
          v-if="isAdmin"
          class="wr-btn-weak"
          type="button"
          :disabled="cloningId === item.id"
          :title="'克隆整条脚本'"
          :aria-label="'克隆整条脚本'"
          @click="$emit('clone', item)"
        >
          <CopyPlus v-if="cloningId !== item.id" class="w-3.5 h-3.5" />
          <Loader2 v-else class="w-3.5 h-3.5 animate-spin" />
        </button>
        <button
          v-if="isAdmin"
          class="wr-btn-weak"
          type="button"
          :title="'执行脚本'"
          :aria-label="'执行脚本'"
          @click="$emit('prompt-execute', item)"
        >
          <Play class="w-3.5 h-3.5" />
        </button>
        <button
          v-if="isAdmin && syncStatusMap[item.id]?.drift"
          class="wr-btn-weak wr-btn-weak--repair"
          type="button"
          :title="'修复漂移（推送本地到 HA）'"
          :aria-label="'修复漂移'"
          @click="$emit('repair', item)"
        >
          <RefreshCw class="w-3.5 h-3.5" />
        </button>
        <button
          v-if="isAdmin"
          class="wr-btn-weak wr-btn-weak--sync"
          type="button"
          :title="'推送到 HA'"
          :aria-label="'推送到 HA'"
          @click="$emit('sync', item)"
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
            :title="'Config API 无法读取完整配置，导入后可能缺少动作'"
            >{{ '不完整' }}</span
          >
        </span>
        <span class="wr-saved-td wr-saved-td--time wr-saved-td--eid">{{ item.entity_id }}</span>
        <span v-if="isAdmin && item.ha_config_id" class="wr-ha-row-actions">
          <button class="wr-btn-add wr-btn-add--xs" type="button" @click="$emit('import', item)">
            {{ '导入' }}
          </button>
          <button
            class="wr-btn-add wr-btn-add--xs wr-btn-add--danger"
            type="button"
            :disabled="!!deletingHaId"
            @click="$emit('ha-delete', item)"
          >
            {{ '删除' }}
          </button>
        </span>
      </template>
    </GeekManagePanel>
  </GeekManageDrawer>
</template>

<script setup>
/**
 * GeekScriptManageDrawer - 脚本管理抽屉（从 GeekScriptBuilder 抽离）
 * 纯展示/事件转发组件：列表数据与操作处理全部由父级注入
 */
import { Upload, RefreshCw, Play, CopyPlus, Loader2 } from '@lucide/vue'
import GeekManageDrawer from '@/components/geek-automation/GeekManageDrawer.vue'
import GeekManagePanel from '@/components/geek-automation/GeekManagePanel.vue'
import { itemHasGeekGraph } from '@/composables/orchestrator/linkage-hub.types'

defineProps({
  open: { type: Boolean, default: false },
  mapScriptHistory: { type: Function, required: true },
  scriptEngineSections: { type: Array, default: () => [] },
  engineCaps: { type: Object, default: null },
  savedList: { type: Array, default: () => [] },
  haImportList: { type: Array, default: () => [] },
  syncStatusMap: { type: Object, default: () => ({}) },
  isAdmin: { type: Boolean, default: false },
  syncing: { type: Boolean, default: false },
  deletingHaId: { type: String, default: null },
  driftCount: { type: Number, default: 0 },
  batchExporting: { type: Boolean, default: false },
  batchImporting: { type: Boolean, default: false },
  importFlowImporting: { type: Boolean, default: false },
  cloningId: { type: String, default: null },
})

defineEmits([
  'close',
  'start-new',
  'sync-all',
  'repair-all',
  'edit',
  'delete',
  'discover',
  'pull-all',
  'import',
  'ha-delete',
  'batch-export-json',
  'batch-export-yaml',
  'batch-pick-import',
  'open-paste-yaml',
  'bulk-import-discovered',
  'clone',
  'prompt-execute',
  'repair',
  'sync',
])
</script>
