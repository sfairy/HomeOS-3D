<template>
  <!-- 同步告警条：当本地与 HA 同步出现问题（待同步/漂移/阻塞）时展示告警 -->
  <div v-if="visible" class="orch-sync-alert" role="status">
    <div class="orch-sync-alert__main">
      <AlertTriangle class="orch-sync-alert__icon" />
      <div class="orch-sync-alert__text">
        <strong>{{ `${entityLabel} HA 同步需关注` }}</strong>
        <span>{{ isAdmin ? summaryText : `${summaryText}（请联系管理员修复漂移或推送）` }}</span>
        <!-- 详情列表：展示前 N 个问题项 -->
        <ul v-if="showDetails && topIssues.length" class="orch-sync-alert__list">
          <li v-for="issue in topIssues" :key="`${issue.id}-${issue.type}`">
            <span class="orch-sync-alert__tag">{{ issue.label }}</span>
            {{ issue.name }} — {{ issue.message }}
          </li>
        </ul>
      </div>
    </div>
    <div class="orch-sync-alert__actions">
      <!-- 修复进度条：批量修复漂移时展示 -->
      <div v-if="repairProgress && repairProgress.total > 0" class="orch-sync-alert__progress">
        <div class="orch-sync-alert__progress-bar">
          <VProgressBar
            :value="Math.round((repairProgress.current / repairProgress.total) * 100)"
            variant="sync"
            size="xs"
          />
        </div>
        <span class="orch-sync-alert__progress-text">
          {{ `修复中 ${repairProgress.current}/${repairProgress.total}` }}
          <template v-if="repairProgress.name"> · {{ repairProgress.name }}</template>
        </span>
      </div>
      <!-- 全部推送：仅在管理员模式且有待同步/缺失项时显示 -->
      <button
        v-if="isAdmin && (summary.pendingCount || summary.missingCount)"
        type="button"
        class="orch-sync-alert__btn"
        :disabled="syncing"
        @click="$emit('sync-all')"
      >
        {{ '全部推送' }}
      </button>
      <!-- 修复漂移：仅在管理员模式且有漂移项时显示 -->
      <button
        v-if="isAdmin && summary.driftCount"
        type="button"
        class="orch-sync-alert__btn orch-sync-alert__btn--danger"
        :disabled="syncing"
        @click="$emit('repair-all')"
      >
        {{ `修复漂移 (${summary.driftCount})` }}
      </button>
      <!-- 详情/收起切换 -->
      <button
        type="button"
        class="orch-sync-alert__btn orch-sync-alert__btn--ghost"
        @click="showDetails = !showDetails"
      >
        {{ showDetails ? '收起' : '详情' }}
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * OrchestratorSyncAlert.vue
 *
 * 所属模块：dashboard / Orchestrator（联动编排器）
 * 职责：在联动项列表上方展示同步告警条。汇总待同步/缺失/漂移/阻塞等问题，
 *      管理员可一键“全部推送”或“修复漂移”；非管理员仅展示提示。
 *      支持展示详情列表（前 maxDetails 项）与修复进度条。
 * 依赖：vue、@lucide/vue（AlertTriangle）、VProgressBar、orchestrator-sync-issues 工具。
 */
import { computed, ref } from 'vue'
import { AlertTriangle } from '@lucide/vue'
import {
  formatSyncIssueSummary,
  summarizeOrchestratorSyncIssues,
} from '@/utils/orchestrator/sync-issues.util'
import VProgressBar from '@/components/common/base/VProgressBar.vue'
/**
 * 组件 Props
 * @property {Array}  items           - 联动项列表（用于汇总同步状态）
 * @property {object} syncStatusMap   - 同步状态映射表，key 为联动项 id
 * @property {boolean} syncing         - 是否正在同步中（按钮禁用）
 * @property {object} repairProgress   - 修复进度对象 {current, total, name}
 * @property {boolean} isAdmin         - 是否为管理员（控制按钮显示）
 * @property {string} entityLabel      - 实体类型文案（如“自动化”“场景”）
 * @property {number} maxDetails       - 详情列表最多展示条数
 */
const props = defineProps({
  items: { type: Array, default: () => [] },
  syncStatusMap: { type: Object, default: () => ({}) },
  syncing: { type: Boolean, default: false },
  repairProgress: { type: Object, default: null },
  isAdmin: { type: Boolean, default: false },
  entityLabel: { type: String, default: '' },
  maxDetails: { type: Number, default: 5 },
})

/** 事件：全部推送 / 修复漂移 */
defineEmits(['sync-all', 'repair-all'])

// 是否展开详情列表
const showDetails = ref(false)

/** 实体类型文案，缺省为“联动项” */
const entityLabel = computed(() => props.entityLabel || '联动项')

/**
 * 同步问题汇总对象
 * @returns {{hasIssues, driftCount, pendingCount, missingCount, blockedCount, issues}}
 */
const summary = computed(() => summarizeOrchestratorSyncIssues(props.items, props.syncStatusMap))

/**
 * 是否显示告警条
 * - 必须存在同步问题
 * - 管理员：始终显示
 * - 非管理员：仅在有漂移或阻塞时显示
 */
const visible = computed(
  () =>
    summary.value.hasIssues &&
    (props.isAdmin || summary.value.driftCount > 0 || summary.value.blockedCount > 0),
)

/** 同步问题汇总文案 */
const summaryText = computed(() => formatSyncIssueSummary(summary.value))

/** 详情列表：取前 maxDetails 条问题 */
const topIssues = computed(() => summary.value.issues.slice(0, props.maxDetails))
</script>

<style scoped src="./styles/OrchestratorSyncAlert.css"></style>