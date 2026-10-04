<!--
组件：JobsSection.vue
所属模块：frontend / src / views / settings / system / diagnostics
职责：调度作业统一仪表盘。展示后端 setInterval / Cron 作业的心跳、耗时与错误（admin，只读）。
      数据由 useDiagnosticsSection 注入。
关键依赖：
  - useDiagnosticsSection：注入 jobs / loading / fetchAll 等
数据来源：useDiagnosticsSection() 返回的 jobs 列表
-->
<template>
  <div class="settings-hub-section diag-page">
    <div class="diag-jobs-shell">
      <div class="diag-jobs-toolbar">
        <div class="diag-runtime-toolbar__meta">
          <p class="diag-hero-eyebrow">{{ '调度作业' }}</p>
          <h3 class="diag-runtime-toolbar__title">{{ '定时任务仪表盘' }}</h3>
          <p class="diag-runtime-toolbar__desc">
            {{ 'setInterval 周期循环与 Cron 的统一心跳；含最近运行耗时与错误状态（只读）' }}
            <span class="diag-runtime-toolbar__stat">
              {{ enabledCount }} / {{ jobs.length }} {{ '启用' }}
              <template v-if="errorCount"> · {{ errorCount }} {{ '异常' }}</template>
            </span>
          </p>
        </div>
        <div class="diag-runtime-toolbar__actions">
          <button type="button" class="diag-action-btn" :disabled="loading" @click="refresh">
            <RefreshCw :class="['w-5 h-5', loading && 'animate-spin']" /> {{ '刷新' }}
          </button>
        </div>
      </div>

      <div
        v-if="loadError"
        class="settings-premium-empty settings-premium-empty--amber diag-runtime-error"
      >
        <AlertCircle class="settings-premium-empty__icon" />
        <p class="settings-premium-empty__title">{{ '作业数据加载失败' }}</p>
        <p class="settings-premium-empty__desc">{{ loadError }}</p>
        <button
          type="button"
          class="settings-premium-empty__btn settings-premium-empty__btn--accent"
          :disabled="loading"
          @click="refresh"
        >
          <RefreshCw :class="['w-3.5 h-3.5', loading && 'animate-spin']" />
          {{ '重试' }}
        </button>
      </div>

      <div v-else-if="loading && !jobs.length" class="diag-runtime-empty">
        <RefreshCw class="w-6 h-6 animate-spin" />
        <span>{{ '正在拉取作业状态…' }}</span>
      </div>

      <div v-else-if="!jobs.length" class="diag-runtime-empty">
        <Clock3 class="w-6 h-6 opacity-50" />
        <span>{{ '暂未登记任何调度作业' }}</span>
      </div>

      <div v-else class="diag-jobs-grid">
        <div v-for="job in jobs" :key="job.name" class="diag-job-card" :class="jobCardClass(job)">
          <div class="diag-job-card__head">
            <span
              class="diag-job-state"
              :class="jobStateClass(job)"
              role="status"
              :aria-label="jobStateLabel(job)"
            ></span>
            <span class="diag-job-card__name" :title="job.name">{{ job.name }}</span>
            <span v-if="!job.enabled" class="diag-job-badge diag-job-badge--warn">
              {{ '已停用' }}
            </span>
            <span v-else-if="job.lastError" class="diag-job-badge diag-job-badge--error">
              {{ '异常' }}
            </span>
            <span v-else-if="job.runs > 0" class="diag-job-badge diag-job-badge--ok">
              {{ '正常' }}
            </span>
          </div>

          <p class="diag-job-card__desc">{{ job.description || '—' }}</p>

          <dl class="diag-job-card__meta">
            <div class="diag-job-card__meta-item">
              <dt>{{ '周期' }}</dt>
              <dd>{{ formatInterval(job.intervalMs) }}</dd>
            </div>
            <div class="diag-job-card__meta-item">
              <dt>{{ '运行次数' }}</dt>
              <dd>{{ job.runs }}</dd>
            </div>
            <div class="diag-job-card__meta-item">
              <dt>{{ '最近耗时' }}</dt>
              <dd>{{ formatDuration(job.lastDurationMs) }}</dd>
            </div>
            <div class="diag-job-card__meta-item">
              <dt>{{ '上次运行' }}</dt>
              <dd>{{ formatTime(job.lastRunAt) }}</dd>
            </div>
            <div class="diag-job-card__meta-item">
              <dt>{{ '下次运行' }}</dt>
              <dd>{{ formatTime(job.nextRunAt) }}</dd>
            </div>
          </dl>

          <p v-if="job.lastError" class="diag-job-card__error" :title="job.lastError">
            {{ job.lastError }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { RefreshCw, AlertCircle, Clock3 } from '@lucide/vue'
import {
  fetchSystemJobs,
} from '@/services/api/system'
import { extractErrorMessage } from '@/utils/core/error-message'
import { formatDetailedDateTimeOrDash } from '@/utils/format/locale-format.util'
import { useDiagnosticsSection } from './useDiagnosticsSection'

const props = defineProps({
  active: { type: Boolean, default: true },
})

const { registerSectionRefresh } = useDiagnosticsSection(['registerSectionRefresh'])

const jobs = ref([])
const loading = ref(false)
const loadError = ref('')

const enabledCount = computed(() => jobs.value.filter((j) => j.enabled).length)
const errorCount = computed(() => jobs.value.filter((j) => j.enabled && j.lastError).length)

async function refresh() {
  loading.value = true
  try {
    const { data } = await fetchSystemJobs()
    jobs.value = (data?.data || []).sort((a, b) => a.name.localeCompare(b.name))
    loadError.value = ''
  } catch (e) {
    loadError.value = extractErrorMessage(e)
    jobs.value = []
  } finally {
    loading.value = false
  }
}

function jobCardClass(job) {
  if (!job.enabled) return 'diag-job-card--disabled'
  if (job.lastError) return 'diag-job-card--error'
  return 'diag-job-card--ok'
}

function jobStateClass(job) {
  if (!job.enabled) return 'diag-job-state--off'
  if (job.lastError) return 'diag-job-state--error'
  if (job.runs > 0) return 'diag-job-state--ok'
  return 'diag-job-state--idle'
}

function jobStateLabel(job) {
  if (!job.enabled) return '已停用'
  if (job.lastError) return '运行异常'
  if (job.runs > 0) return '运行正常'
  return '已登记未运行'
}

function formatInterval(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`
  return `${(ms / 86_400_000).toFixed(1)}d`
}

function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTime(iso) {
  return formatDetailedDateTimeOrDash(iso)
}

watch(
  () => props.active,
  (isActive) => {
    if (isActive) {
      registerSectionRefresh(refresh)
      void refresh()
    } else {
      registerSectionRefresh(null)
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  registerSectionRefresh(null)
})
</script>

<style scoped src="./styles/diagnostics-theme.css"></style>
