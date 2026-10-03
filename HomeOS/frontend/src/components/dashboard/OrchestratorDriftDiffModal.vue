<template>
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="wr-modal">
      <!-- 漂移对比弹窗：在本地与 HA 两端 YAML 不一致时由 useOrchestratorDriftDialog 触发 -->
      <div v-if="driftDialogState.open" class="wr-modal-shade" @click.self="cancelDriftDialog">
        <div class="wr-modal-box wr-modal-box--wide orch-drift-modal">
          <h4 class="wr-modal-title">{{ 'YAML 漂移对比' }}</h4>
          <p class="wr-modal-desc">
            {{ `${driftDialogState.payload?.itemName || '联动项'} · ${directionLabel}` }}
            <span v-if="statsText" class="orch-drift-modal__stats">{{ statsText }}</span>
          </p>
          <!-- 左右两栏对比：本地 HomeOS 与 Home Assistant 的 YAML -->
          <div class="orch-drift-modal__panes">
            <div class="orch-drift-pane">
              <header>{{ '本地 HomeOS' }}</header>
              <pre class="orch-drift-pre">{{ driftDialogState.payload?.localYaml || '—' }}</pre>
            </div>
            <div class="orch-drift-pane">
              <header>{{ 'Home Assistant' }}</header>
              <pre class="orch-drift-pre">{{ driftDialogState.payload?.haYaml || '—' }}</pre>
            </div>
          </div>
          <!-- 行级 diff 预览，仅在存在 diffPreview 时渲染 -->
          <details v-if="previewLines.length" class="orch-drift-modal__diff">
            <summary>{{ '行级 diff 预览' }}</summary>
            <pre class="orch-drift-pre orch-drift-pre--diff">{{ previewLines.join('\n') }}</pre>
          </details>
          <div class="wr-modal-actions mt-4">
            <button
              type="button"
              class="wr-btn-primary wr-btn-primary--ghost"
              @click="cancelDriftDialog"
            >
              {{ '取消' }}
            </button>
            <button type="button" class="wr-btn-primary" @click="confirmDriftDialog">
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/**
 * OrchestratorDriftDiffModal.vue
 *
 * 所属模块：dashboard / Orchestrator（联动编排器）
 * 职责：YAML 漂移对比弹窗。当本地与 HA 两端 YAML 出现差异时，
 *      并排展示两端 YAML 与可选的行级 diff 预览，由用户决定推/拉方向覆盖。
 * 依赖：vue（computed）、orchestratorDriftDialog 全局状态、useOrchestratorTeleport。
 */
import { computed } from 'vue'
import { orchestratorDriftDialog } from '@/composables/orchestrator/useOrchestratorDriftDialog'
import { useOrchestratorTeleport } from '@/composables/orchestrator/useOrchestratorTeleport'

// 漂移对话框全局状态与回调：open / payload / confirmDriftDialog / cancelDriftDialog
const { driftDialogState, confirmDriftDialog, cancelDriftDialog } = orchestratorDriftDialog
const { teleportTarget, teleportDisabled } = useOrchestratorTeleport()

/**
 * 操作方向文案
 * @returns {string} '从 HA 拉回覆盖本地' 或 '推送本地覆盖 HA'
 */
const directionLabel = computed(() =>
  driftDialogState.payload?.direction === 'pull' ? '从 HA 拉回覆盖本地' : '推送本地覆盖 HA',
)

/**
 * 主操作按钮文案
 * @returns {string} '确认拉回' 或 '确认推送'
 */
const confirmLabel = computed(() =>
  driftDialogState.payload?.direction === 'pull' ? '确认拉回' : '确认推送',
)

/** 行级 diff 预览行数组（来自 payload.diffPreview） */
const previewLines = computed(() => driftDialogState.payload?.diffPreview || [])

/**
 * 差异统计文案：+/~/~ 三类变更数量
 * @returns {string} 形如 `+3 / -1 / ~2`；无统计时为空字符串
 */
const statsText = computed(() => {
  const s = driftDialogState.payload?.diffStats
  if (!s) return ''
  return `+${s.added} / -${s.removed} / ~${s.changed}`
})
</script>

<style scoped src="./styles/OrchestratorDriftDiffModal.css"></style>