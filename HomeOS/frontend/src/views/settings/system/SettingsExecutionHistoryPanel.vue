<!--
组件：SettingsExecutionHistoryPanel.vue
所属模块：frontend / src / views / settings / system
职责：执行历史面板。展示联动器执行记录统计（总数/异常），内嵌 ExecutionHistoryPanel 组件，
      支持刷新、过滤与异常清理。
Props：
  - activeTab：当前 Tab
关键依赖：
  - SettingsPageShell / SettingsCard / SettingsFlowBand / SettingsFlowStat：卡片与流程
  - ExecutionHistoryPanel：执行历史组件
  - @lucide/vue 的 RefreshCw / Trash2 / Zap / Server 等
数据来源：ExecutionHistoryPanel 内部统计回调
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="execution-history"
    icon-key="history"
    accent="var(--module-accent-admin)"
    layout="single"
    :scroll-body="false"
    body-class="exec-history-page settings-page__workspace--inset"
  >
    <template #actions>
      <span
        v-if="historyStats.loaded"
        :class="[
          'exec-history-status',
          historyStats.hasFailures && 'exec-history-status--fail',
        ]"
      >
        {{
          historyStats.hasFailures
            ? `${historyStats.failureCount} 条异常`
            : historyStats.recordCount
              ? `共 ${historyStats.recordCount} 条`
              : '暂无记录'
        }}
      </span>
      <button
        type="button"
        class="settings-btn-ghost"
        :disabled="historyStats.loading"
        @click="refreshHistory"
      >
        <RefreshCw :class="['w-3.5 h-3.5', historyStats.loading && 'animate-spin']" />
        {{ '刷新' }}
      </button>
      <button
        type="button"
        class="settings-btn-ghost settings-btn-ghost--danger"
        :disabled="historyStats.loading || !historyStats.recordCount"
        @click="clearHistory"
      >
        <Trash2 class="w-3.5 h-3.5" />
        {{ '清除历史' }}
      </button>
    </template>

    <SettingsCard full flat static extra-class="exec-history-card settings-card--keep-flat">
      <SettingsFlowBand
        :steps="execFlowSteps"
        class="exec-flow-band"
        band-class="exec-flow-band__shell"
        collapsible
        default-collapsed
        toggle-label="执行流程"
        :collapsed-summary="execFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'记录'"
            :value="historyStats.recordCount || 0"
            tone="accent"
            val-tone="accent"
          />
          <SettingsFlowStat
            :label="'异常'"
            :value="historyStats.failureCount || 0"
            :tone="historyStats.hasFailures ? 'rose' : 'emerald'"
            :val-tone="historyStats.hasFailures ? 'rose' : 'emerald'"
          />
        </template>
      </SettingsFlowBand>
      <ExecutionHistoryPanel
        ref="panelRef"
        class="exec-history-panel"
        variant="settings"
        hide-toolbar
        paginated
        @stats="historyStats = $event"
      />
    </SettingsCard>
  </SettingsPageShell>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { RefreshCw, Trash2, Zap, Server, FileText, Filter, AlertTriangle } from '@lucide/vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import ExecutionHistoryPanel from '@/components/widgets/orchestrator/ExecutionHistoryPanel.vue'

defineProps({ activeTab: { type: String, default: 'execution-history' } })

const panelRef = ref(null)
const historyStats = ref({
  loading: true,
  loaded: false,
  recordCount: 0,
  failureCount: 0,
  hasFailures: false,
  filteredRecordCount: 0,
  filteredFailureCount: 0,
  hasFilteredFailures: false,
  isFiltered: false,
  activeFilter: 'all',
  failuresOnly: false,
})

const execFlowSummary = computed(() => {
  const n = historyStats.value.recordCount || 0
  const fails = historyStats.value.failureCount || 0
  return `${n} 条 · ${fails} 异常`
})

const execFlowSteps = computed(() => [
  { label: '联动触发', meta: '自动化/场景/脚本', icon: Zap, tone: 'in' },
  { label: '后端执行', meta: '联动引擎', icon: Server, tone: 'sky' },
  {
    label: '写入日志',
    meta: `${historyStats.value.recordCount || 0} 条`,
    icon: FileText,
    tone: 'mid',
  },
  {
    label: '筛选/分页',
    meta: historyStats.value.activeFilter || 'all',
    icon: Filter,
    tone: 'exec',
  },
  {
    label: '异常排查',
    meta: `${historyStats.value.failureCount || 0} 异常`,
    icon: AlertTriangle,
    tone: historyStats.value.hasFailures ? 'amber' : 'out',
  },
])

function refreshHistory() {
  panelRef.value?.refresh()
}

async function clearHistory() {
  await panelRef.value?.clearHistory?.()
}

onBeforeUnmount(() => {
  historyStats.value = { ...historyStats.value, loading: false }
})
</script>

<style scoped src="./styles/SettingsExecutionHistoryPanel.css"></style>
