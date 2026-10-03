<!--
  GeekAutomationSettingsDrawer.vue
  职责：自动化编辑器的「设置抽屉」，承载运行模式、启用状态、HA 执行与执行轨迹回放控制。
  所属模块：geek-automation。
  关键依赖：GeekSettingsDrawer（外壳）、OrchestratorExecutionEngineBadge（HA 执行提示徽章）、HosSelect。
  Props：
    - open：抽屉开关。
    - haExecutionNeeds/runOnHa/haExecutionReasons：是否需要 HA 执行、当前是否运行在 HA、原因说明。
    - mode：自动化运行模式（single/restart/queued/parallel）。
    - enabled：自动化是否启用。
    - saving/actionBusy/editingId：保存/异步操作进行中态与当前编辑 id。
    - lastTrace/traceStep：最近一次执行轨迹与当前回放步骤。
  Emits：close / enable-ha / update:mode / update:enabled / update:runOnHa /
    start-new / reset / delete-current / trace-prev / trace-next / trace-reset。
-->
<template>
  <!-- GeekAutomationSettingsDrawer：运行模式 / 启用 / HA 执行 / 轨迹回放 -->
  <GeekSettingsDrawer
    :open="open"
    aria-label="自动化设置"
    title="设置"
    subtitle="运行模式、启用状态与 HA 执行"
    @close="$emit('close')"
  >
    <OrchestratorExecutionEngineBadge
      :needs-ha="haExecutionNeeds"
      :run-on-ha="runOnHa"
      :reasons="haExecutionReasons"
      @enable-ha="$emit('enable-ha')"
    />
    <label class="geek-field">
      <span>{{ '运行模式' }}</span>
      <HosSelect :model-value="mode" variant="orchestrator" size="sm" block @update:model-value="$emit('update:mode', $event)">
        <option value="single">{{ '单次' }}</option>
        <option value="restart">{{ '可重启' }}</option>
        <option value="queued">{{ '排队' }}</option>
        <option value="parallel">{{ '并行' }}</option>
      </HosSelect>
    </label>
    <label class="geek-builder__ha">
      <input :checked="enabled" type="checkbox" @change="$emit('update:enabled', $event.target.checked)" />
      <span>{{ '启用自动化' }}</span>
    </label>
    <label class="geek-builder__ha">
      <input :checked="runOnHa" type="checkbox" @change="$emit('update:runOnHa', $event.target.checked)" />
      <span>{{ '由 HA 执行' }}</span>
    </label>
    <button type="button" class="list-page__link-btn" :disabled="saving" @click="$emit('start-new')">
      {{ '新建空白自动化' }}
    </button>
    <button type="button" class="list-page__link-btn" :disabled="saving" @click="$emit('reset')">
      {{ '重置画布' }}
    </button>
    <button
      v-if="editingId"
      type="button"
      class="list-page__link-btn is-danger"
      :disabled="actionBusy || saving"
      @click="$emit('delete-current')"
    >
      {{ '删除本条' }}
    </button>
    <div v-if="lastTrace.length" class="geek-builder__playback">
      <span class="geek-builder__playback-label">{{ '执行轨迹' }}</span>
      <button type="button" class="list-page__btn" :disabled="traceStep <= 0" @click="$emit('trace-prev')">
        {{ '上一步' }}
      </button>
      <span>{{ `轨迹 ${Math.min(traceStep + 1, lastTrace.length)}/${lastTrace.length}` }}</span>
      <button
        type="button"
        class="list-page__btn"
        :disabled="traceStep >= lastTrace.length - 1"
        @click="$emit('trace-next')"
      >
        {{ '下一步' }}
      </button>
      <button type="button" class="list-page__link-btn" @click="$emit('trace-reset')">
        {{ '全部' }}
      </button>
    </div>
  </GeekSettingsDrawer>
</template>

<script setup>
/**
 * GeekAutomationSettingsDrawer - 从 GeekAutomationBuilder 抽离的设置抽屉
 */
import GeekSettingsDrawer from '@/components/geek-automation/GeekSettingsDrawer.vue'
import OrchestratorExecutionEngineBadge from '@/components/dashboard/OrchestratorExecutionEngineBadge.vue'
import HosSelect from '@/components/common/base/HosSelect.vue'

defineProps({
  open: { type: Boolean, default: false },
  haExecutionNeeds: { type: Boolean, default: false },
  runOnHa: { type: Boolean, default: false },
  haExecutionReasons: { type: Array, default: () => [] },
  mode: { type: String, default: 'single' },
  enabled: { type: Boolean, default: true },
  saving: { type: Boolean, default: false },
  editingId: { type: [String, Number], default: null },
  actionBusy: { type: Boolean, default: false },
  lastTrace: { type: Array, default: () => [] },
  traceStep: { type: Number, default: 0 },
})

defineEmits([
  'close',
  'enable-ha',
  'update:mode',
  'update:enabled',
  'update:runOnHa',
  'start-new',
  'reset',
  'delete-current',
  'trace-prev',
  'trace-next',
  'trace-reset',
])
</script>
