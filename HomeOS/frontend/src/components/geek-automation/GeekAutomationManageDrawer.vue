<!--
  GeekAutomationManageDrawer.vue
  职责：自动化编辑器的「管理抽屉」，集中承载本地/HA 列表与批量启停/导入导出/克隆/触发/修复/推送。
  所属模块：geek-automation。
  关键依赖：GeekManageDrawer（外壳抽屉）、GeekManagePanel（列表 + 历史展示）、
    @lucide/vue 图标、itemHasGeekGraph 判定 YAML 还原态、formatExecutionRelativeTime 时间格式化。
  Props：
    - open：抽屉开关。
    - mapAutoHistory：将后端执行历史映射为统一展示结构的函数。
    - automationEngineSections/engineCaps：本地引擎能力说明与限制。
    - savedList/haImportList：本地保存列表与 HA 发现列表。
    - syncStatusMap/syncing/driftCount：HA 同步状态。
    - isAdmin：是否管理员，决定批量导入导出/克隆/触发等按钮可见性。
    - deletingHaId/cloningId/importFlowImporting/batch*：各类异步操作进行中 id/状态。
    - automationRunState：根据最近触发时间与 HA 状态推断运行态。
  Emits：close / start-new / sync-all / repair-all / edit / delete / discover / pull-all /
    import / ha-delete / batch-toggle-all / confirm-batch-toggle / batch-export-json /
    batch-export-yaml / batch-pick-import / open-paste-yaml / bulk-import-discovered /
    toggle-item / repair / sync / clone / trigger-item。
  Slots（通过 GeekManagePanel 透传）：
    - saved-toolbar-extra：本地列表工具栏扩展（全部启停、批量导入导出、粘贴 YAML）。
    - ha-toolbar-extra：HA 列表工具栏扩展（批量导入发现）。
    - saved-name-extra / saved-meta / saved-row-actions / ha-row：自定义列表行展示。
-->
<template>
  <!-- GeekAutomationManageDrawer：本地/HA 列表、批量启停/导入导出、克隆/触发/修复/推送 -->
  <GeekManageDrawer
    :open="open"
    aria-label="自动化管理"
    title="管理"
    subtitle="全部自动化：打开、启用、推送 HA、修复漂移、粘贴 YAML"
    @close="$emit('close')"
  >
    <GeekManagePanel
      history-title="自动化执行"
      history-endpoint="/automation/history/executions"
      :history-map-record="mapAutoHistory"
      history-storage-key="homeos_orch_exec_geek"
      engine-storage-key="homeos_orch_engine_geek"
      :engine-sections="automationEngineSections"
      :engine-limitations="engineCaps?.limitations || []"
      :show-engine-caps="!!engineCaps"
      :saved-list="savedList"
      :ha-import-list="haImportList"
      :sync-status-map="syncStatusMap"
      :is-admin="isAdmin"
      :syncing="syncing"
      :deleting-ha-id="deletingHaId"
      :drift-count="driftCount"
      saved-title="HomeOS · 自动化"
      empty-saved-text="暂无保存的自动化"
      ha-empty-text="连接 HA 后自动发现自动化"
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
          :disabled="batchBusy || batchImporting || batchExporting"
          :title="'全部启用'"
          @click="$emit('batch-toggle-all', true)"
        >
          {{ batchBusy ? '批量中…' : '全部启用' }}
        </button>
        <button
          v-if="isAdmin"
          class="wr-btn-add wr-btn-add--xs"
          type="button"
          :disabled="batchBusy || batchImporting || batchExporting"
          :title="'全部停用（度假模式一键关闭联动）'"
          @click="$emit('confirm-batch-toggle', false)"
        >
          {{ '全部停用' }}
        </button>
        <button
          v-if="isAdmin"
          class="wr-btn-add wr-btn-add--xs"
          type="button"
          :disabled="batchExporting || batchImporting || batchBusy"
          :title="'导出全部为 JSON'"
          @click="$emit('batch-export-json')"
        >
          {{ batchExporting ? '导出中…' : '导出 JSON' }}
        </button>
        <button
          v-if="isAdmin"
          class="wr-btn-add wr-btn-add--xs"
          type="button"
          :disabled="batchExporting || batchImporting || batchBusy"
          :title="'导出全部为多文档 YAML'"
          @click="$emit('batch-export-yaml')"
        >
          {{ '导出 YAML' }}
        </button>
        <button
          v-if="isAdmin"
          class="wr-btn-add wr-btn-add--xs"
          type="button"
          :disabled="batchImporting || batchBusy"
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
        <span v-if="!item.enabled" class="wr-mini-badge wr-mini-badge--off">{{ '停' }}</span>
        <span v-if="!itemHasGeekGraph(item)" class="wr-mini-badge wr-mini-badge--yaml">{{ 'YAML 还原' }}</span>
      </template>
      <template #saved-meta="{ item }">
        <span class="wr-row-meta wr-meta--dim">
          {{ `最近触发 ${item.lastTriggered ? formatExecutionRelativeTime(item.lastTriggered) : '从未'}` }}
        </span>
        <span
          v-if="automationRunState(item) !== 'idle'"
          class="wr-mini-badge"
          :class="automationRunState(item) === 'running' ? 'wr-mini-badge--run' : 'wr-mini-badge--wait'"
          >{{ automationRunState(item) === 'running' ? '运行中' : '等待中' }}</span
        >
      </template>
      <template #saved-row-actions="{ item }">
        <button
          class="wr-btn-weak"
          :class="item.enabled ? 'wr-btn-weak--on' : ''"
          type="button"
          :title="'启用/禁用'"
          :aria-label="'启用/禁用'"
          @click="$emit('toggle-item', item)"
        >
          <Power class="w-3.5 h-3.5" />
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
        <button
          v-if="isAdmin"
          class="wr-btn-weak"
          type="button"
          :disabled="cloningId === item.id"
          :title="'克隆整条自动化'"
          :aria-label="'克隆整条自动化'"
          @click="$emit('clone', item)"
        >
          <CopyPlus v-if="cloningId !== item.id" class="w-3.5 h-3.5" />
          <Loader2 v-else class="w-3.5 h-3.5 animate-spin" />
        </button>
        <button
          v-if="isAdmin"
          class="wr-btn-weak"
          type="button"
          :title="'手动触发'"
          :aria-label="'手动触发'"
          @click="$emit('trigger-item', item)"
        >
          <Play class="w-3.5 h-3.5" />
        </button>
      </template>
      <template #ha-row="{ item }">
        <span class="wr-saved-td wr-saved-td--name">
          {{ item.name }}
          <span
            v-if="item.incomplete"
            class="wr-mini-badge wr-mini-badge--drift"
            :title="'Config API 无法读取完整配置，导入后可能缺少触发器/动作'"
            >{{ '不完整' }}</span
          >
        </span>
        <span :class="['wr-badge', item.state === 'on' ? 'wr-badge--on' : 'wr-badge--off']">{{
          item.state === 'on' ? '启用' : '停用'
        }}</span>
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
 * GeekAutomationManageDrawer - 从 GeekAutomationBuilder 抽离的管理抽屉
 */
import { Upload, RefreshCw, Play, CopyPlus, Loader2, Power } from '@lucide/vue'
import GeekManageDrawer from '@/components/geek-automation/GeekManageDrawer.vue'
import GeekManagePanel from '@/components/geek-automation/GeekManagePanel.vue'
import { itemHasGeekGraph } from '@/composables/orchestrator/linkage-hub.types'
import { formatExecutionRelativeTime } from '@/utils/orchestrator/execution-history-display.util'

defineProps({
  open: { type: Boolean, default: false },
  mapAutoHistory: { type: Function, required: true },
  automationEngineSections: { type: Array, default: () => [] },
  engineCaps: { type: Object, default: null },
  savedList: { type: Array, default: () => [] },
  haImportList: { type: Array, default: () => [] },
  syncStatusMap: { type: Object, default: () => ({}) },
  isAdmin: { type: Boolean, default: false },
  syncing: { type: Boolean, default: false },
  deletingHaId: { type: String, default: null },
  driftCount: { type: Number, default: 0 },
  batchBusy: { type: Boolean, default: false },
  batchExporting: { type: Boolean, default: false },
  batchImporting: { type: Boolean, default: false },
  importFlowImporting: { type: Boolean, default: false },
  cloningId: { type: String, default: null },
  automationRunState: { type: Function, required: true },
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
  'batch-toggle-all',
  'confirm-batch-toggle',
  'batch-export-json',
  'batch-export-yaml',
  'batch-pick-import',
  'open-paste-yaml',
  'bulk-import-discovered',
  'toggle-item',
  'repair',
  'sync',
  'clone',
  'trigger-item',
])
</script>
