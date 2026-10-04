<!--
  数据保留面板：各业务表历史数据保留策略 + 最近一次清理统计
  所属模块：设置 - 系统与账户
  职责：展示 EventLog / EnvironmentRecord / WaterRecord 等 11 张表的数据保留天数、
    估算数据量与最近一次清理统计（删除行数、耗时），并允许调整保留天数（1–365 天）
    支持批量设置：输入天数一键应用到全部表
  依赖：fetchRetentionConfig / updateRetentionConfig（system API）、chrome.notify 提示
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="retention"
    icon-key="database"
    accent="var(--module-accent-admin)"
    layout="single"
    page-class="retention-hub"
  >
    <template #actions>
      <button type="button" class="settings-btn-accent" :disabled="loading" @click="load">
        <RefreshCw :class="['w-5 h-5', loading && 'animate-spin']" />
        {{ '刷新' }}
      </button>
    </template>

    <div v-if="loadError" class="settings-premium-empty settings-premium-empty--amber">
      <AlertCircle class="settings-premium-empty__icon" />
      <p class="settings-premium-empty__title">{{ '数据保留信息加载失败' }}</p>
      <p class="settings-premium-empty__desc">{{ loadError }}</p>
      <div class="settings-premium-empty__actions">
        <button
          type="button"
          class="settings-premium-empty__btn settings-premium-empty__btn--accent"
          :disabled="loading"
          @click="load"
        >
          <RefreshCw :class="['w-3.5 h-3.5', loading && 'animate-spin']" />
          {{ '重试' }}
        </button>
      </div>
    </div>

    <template v-else>
      <!-- 清理概览 -->
      <SettingsCard full static extra-class="retention-card">
        <div class="retention-card__head">
          <div class="retention-card__title">
            <span class="retention-card__icon">🧹</span>
            <div>
              <h3 class="retention-card__name">{{ '清理概览' }}</h3>
              <p class="retention-card__hint">
                {{ '系统每小时自动按保留天数清理历史数据，以下为最近一次执行结果' }}
              </p>
            </div>
          </div>
          <span v-if="lastCleanup" class="retention-status">
            <span class="retention-status__dot" />
            {{ `上次执行 ${formatTime(lastCleanup.at)}` }}
          </span>
        </div>

        <div v-if="lastCleanup" class="retention-stats">
          <div class="retention-stat retention-stat--hero">
            <p class="retention-stat__value">{{ lastCleanup.total.toLocaleString() }}</p>
            <p class="retention-stat__label">{{ '本次删除行数' }}</p>
          </div>
          <div class="retention-stat">
            <p class="retention-stat__value">{{ formatElapsed(lastCleanup.elapsedMs) }}</p>
            <p class="retention-stat__label">{{ '清理耗时' }}</p>
          </div>
          <div class="retention-stat">
            <p class="retention-stat__value">{{ lastCleanup.retentionDays }} 天</p>
            <p class="retention-stat__label">{{ '基准保留期' }}</p>
          </div>
          <div class="retention-stat retention-stat--muted">
            <p class="retention-stat__value">{{ formatTime(lastCleanup.at) }}</p>
            <p class="retention-stat__label">{{ '清理时间' }}</p>
          </div>
        </div>
        <div v-else class="retention-empty">
          <span class="retention-empty__icon">🪄</span>
          <p class="retention-empty__text">{{ '暂无清理记录，服务启动后首次清理将自动记录' }}</p>
        </div>
      </SettingsCard>

      <!-- 保留策略 -->
      <SettingsCard full static extra-class="retention-card">
        <div class="retention-card__head">
          <div class="retention-card__title">
            <span class="retention-card__icon">🗄️</span>
            <div>
              <h3 class="retention-card__name">{{ '保留策略' }}</h3>
              <p class="retention-card__hint">
                {{ '调整保留天数后点击保存，将在下一轮清理生效（1–365 天）' }}
              </p>
            </div>
          </div>
          <div class="retention-card__actions">
            <span v-if="dirty" class="retention-dirty-chip">
              {{ `已修改 ${modifiedCount} 张` }}
            </span>
            <button
              type="button"
              class="settings-btn-accent settings-btn--sm"
              :disabled="saving || !dirty"
              @click="save"
            >
              <Save :class="['w-4 h-4', saving && 'animate-spin']" />
              {{ saving ? '保存中…' : '保存策略' }}
            </button>
          </div>
        </div>

        <!-- 批量设置工具条：一键将同一保留天数应用到全部表 -->
        <div class="retention-batch">
          <span class="retention-batch__label">{{ '批量设置全部表保留天数' }}</span>
          <div class="retention-batch__control">
            <input
              v-model.number="batchDays"
              type="number"
              min="1"
              max="365"
              step="1"
              class="retention-table__input"
              @keyup.enter="applyBatch"
            />
            <span class="retention-batch__unit">{{ '天' }}</span>
          </div>
          <button
            type="button"
            class="settings-btn-accent settings-btn--sm"
            :disabled="!batchValid"
            @click="applyBatch"
          >
            <Layers :class="['w-4 h-4']" />
            {{ '应用到全部' }}
          </button>
          <span class="retention-batch__meta">{{ `共 ${rows.length} 张表` }}</span>
        </div>

        <div class="retention-table">
          <div class="retention-table__head">
            <span>{{ '数据表' }}</span>
            <span>{{ '当前保留' }}</span>
            <span>{{ '数据量（估算）' }}</span>
            <span>{{ '新保留天数' }}</span>
          </div>
          <div
            v-for="row in rows"
            :key="row.key"
            class="retention-table__row"
            :class="{ 'is-modified': rowModified(row.key) }"
          >
            <div class="retention-table__main">
              <p class="retention-table__title">{{ row.label }}</p>
              <p class="retention-table__meta">{{ row.table }}</p>
            </div>
            <div class="retention-table__cell">{{ row.retentionDays }} 天</div>
            <div class="retention-table__cell retention-table__cell--rows">
              {{ formatRows(row.estimatedRows) }}
            </div>
            <div class="retention-table__cell">
              <div class="retention-table__input-wrap">
                <input
                  v-model.number="draft[row.key]"
                  type="number"
                  min="1"
                  max="365"
                  step="1"
                  class="retention-table__input"
                  :class="{ 'is-modified': rowModified(row.key) }"
                  @change="markDirty"
                />
                <span class="retention-table__input-unit">{{ '天' }}</span>
              </div>
            </div>
          </div>
          <div v-if="rows.length" class="retention-table__foot">
            <span>{{ `估算数据量合计 ${formatRows(totalEstimated)}` }}</span>
            <span v-if="dirty">{{ `待保存 ${modifiedCount} 张表` }}</span>
            <span v-else>{{ '已是最新策略' }}</span>
          </div>
        </div>
      </SettingsCard>
    </template>
  </SettingsPageShell>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RefreshCw, AlertCircle, Save, Layers } from '@lucide/vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import { useChromeStore } from '@/stores/chrome.store'
import { useRegisterSettingsTabPending } from '@/composables/settings/pending.internals'
import { fetchRetentionConfig, updateRetentionConfig } from '@/services/api/system'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { formatFullDateTime } from '@/utils/format/locale-format.util'

defineProps({ activeTab: { type: String, default: 'retention' } })

const chrome = useChromeStore()

const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const policies = ref([])
const lastCleanup = ref(null)
const estimatedRows = ref({})
const draft = ref({})
const dirty = ref(false)
/** 批量设置工具条输入值 */
const batchDays = ref(7)
/** 批量输入是否合法（1–365 的整数） */
const batchValid = computed(() => {
  const v = Number(batchDays.value)
  return Number.isInteger(v) && v >= 1 && v <= 365
})

useRegisterSettingsTabPending('retention', () => dirty.value)

/** 表格行：策略 + 估算数据量合并 */
const rows = computed(() =>
  policies.value.map((p) => ({
    ...p,
    estimatedRows: estimatedRows.value?.[p.key] ?? 0,
  })),
)

/** 已修改的表数量 */
const modifiedCount = computed(
  () => policies.value.filter((p) => Number(draft.value[p.key]) !== Number(p.retentionDays)).length,
)

/** 估算数据量合计 */
const totalEstimated = computed(() =>
  Object.values(estimatedRows.value).reduce((sum, n) => sum + (Number(n) || 0), 0),
)

/** 该表草稿是否与当前策略不一致 */
function rowModified(key) {
  const policy = policies.value.find((p) => p.key === key)
  return !!policy && Number(draft.value[key]) !== Number(policy.retentionDays)
}

/** 用后端策略初始化草稿（仅登记可编辑天数） */
function buildDraft() {
  draft.value = Object.fromEntries(policies.value.map((p) => [p.key, p.retentionDays]))
  dirty.value = false
}

function markDirty() {
  dirty.value = true
}

/** 批量应用：将输入天数写入全部表草稿 */
function applyBatch() {
  const v = Number(batchDays.value)
  if (!Number.isInteger(v) || v < 1 || v > 365) {
    chrome.notify('请输入 1–365 之间的整数天数', 'error')
    return
  }
  for (const p of policies.value) {
    draft.value[p.key] = v
  }
  batchDays.value = v
  dirty.value = true
  chrome.notify(`已批量设置全部表保留 ${v} 天，请点击保存策略生效`, 'success')
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const { data } = await fetchRetentionConfig()
    policies.value = data?.policies || []
    lastCleanup.value = data?.lastCleanup || null
    estimatedRows.value = data?.estimatedRows || {}
    buildDraft()
    // 批量输入预填：全部表保留天数一致时取该值，否则取事件日志当前值
    const common = new Set(policies.value.map((p) => p.retentionDays))
    batchDays.value =
      common.size === 1
        ? policies.value[0]?.retentionDays ?? 7
        : policies.value.find((p) => p.key === 'eventLog')?.retentionDays ?? 7
  } catch (err) {
    loadError.value = getApiErrorMessage(err, '加载数据保留信息失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  const retention = {}
  for (const key of Object.keys(draft.value)) {
    const value = Number(draft.value[key])
    if (Number.isFinite(value)) retention[key] = value
  }
  saving.value = true
  try {
    const { data } = await updateRetentionConfig({ retention })
    policies.value = data?.policies || []
    lastCleanup.value = data?.lastCleanup || null
    estimatedRows.value = data?.estimatedRows || {}
    buildDraft()
    chrome.notify('数据保留策略已保存，下一轮清理生效', 'success')
  } catch (err) {
    chrome.notify(getApiErrorMessage(err, '保存数据保留策略失败'), 'error')
  } finally {
    saving.value = false
  }
}

function formatTime(iso) {
  if (!iso) return '-'
  return formatFullDateTime(iso) || '-'
}

function formatElapsed(ms) {
  if (ms == null || Number.isNaN(ms)) return '-'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
}

function formatRows(n) {
  if (!n) return '0'
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(n)
}

onMounted(load)
</script>

<style scoped>
.retention-card {
  margin-bottom: var(--hos-space-6, 24px);
}

.retention-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 18px 20px 14px;
  border-bottom: var(--hos-hairline) solid var(--hos-border, rgba(255, 255, 255, 0.08));
}

.retention-card__title {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.retention-card__icon {
  font-size: 22px;
  line-height: 1;
}

.retention-card__name {
  margin: 0;
  font-size: var(--premium-fs-title);
  font-weight: 600;
  color: var(--hos-text-strong, #f4f4f5);
}

.retention-card__hint {
  margin: 4px 0 0;
  font-size: var(--set-fs-micro, 12px);
  line-height: 1.5;
  color: var(--hos-text-dim, #a1a1aa);
}

.retention-card__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 上次清理状态徽标 */
.retention-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--hos-radius-pill);
  font-size: var(--set-fs-micro, 12px);
  color: var(--hos-text-dim, #a1a1aa);
  background: rgba(255, 255, 255, 0.04);
  border: var(--hos-hairline) solid var(--hos-border, rgba(255, 255, 255, 0.08));
  white-space: nowrap;
}

.retention-status__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--module-accent-admin, #facc15);
  box-shadow: 0 0 6px rgba(250, 204, 21, 0.6);
}

/* 已修改提示 chip */
.retention-dirty-chip {
  padding: 4px 10px;
  border-radius: var(--hos-radius-pill);
  font-size: var(--set-fs-micro, 12px);
  color: var(--module-accent-admin, #facc15);
  background: rgba(var(--module-accent-admin-rgb, 250, 204, 21), 0.1);
  border: var(--hos-hairline) solid rgba(var(--module-accent-admin-rgb, 250, 204, 21), 0.25);
  white-space: nowrap;
}

.settings-btn--sm {
  padding: 6px 12px;
  font-size: var(--set-fs-micro, 12px);
}

/* 批量设置工具条 */
.retention-batch {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px 20px;
  border-bottom: var(--hos-hairline) solid var(--hos-border, rgba(255, 255, 255, 0.06));
  background: linear-gradient(
    90deg,
    rgba(var(--module-accent-admin-rgb, 250, 204, 21), 0.07),
    rgba(var(--module-accent-admin-rgb, 250, 204, 21), 0.02)
  );
}

.retention-batch__label {
  font-size: var(--set-fs-micro, 12px);
  color: var(--hos-text-dim, #a1a1aa);
}

.retention-batch__control {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.retention-batch__unit {
  position: absolute;
  right: 8px;
  font-size: var(--set-fs-micro, 12px);
  color: var(--hos-text-dim, #a1a1aa);
  pointer-events: none;
}

.retention-batch__meta {
  margin-left: auto;
  font-size: var(--set-fs-micro, 12px);
  color: var(--hos-text-dim, #a1a1aa);
}

/* 清理统计 */
.retention-stats {
  display: grid;
  grid-template-columns: 1.6fr repeat(3, 1fr);
  gap: 12px;
  padding: 18px 20px;
}

.retention-stat {
  padding: 14px 16px;
  border-radius: var(--hos-radius-card);
  background: rgba(255, 255, 255, 0.03);
  border: var(--hos-hairline) solid var(--hos-border, rgba(255, 255, 255, 0.07));
}

.retention-stat--hero {
  background: rgba(var(--module-accent-admin-rgb, 250, 204, 21), 0.08);
  border-color: rgba(var(--module-accent-admin-rgb, 250, 204, 21), 0.22);
}

.retention-stat--muted .retention-stat__value {
  font-size: var(--premium-fs-caption);
  font-weight: 500;
  word-break: break-all;
}

.retention-stat__value {
  margin: 0;
  font-size: var(--premium-fs-title);
  font-weight: 600;
  color: var(--hos-text-strong, #f4f4f5);
}

.retention-stat--hero .retention-stat__value {
  font-size: 24px;
  color: var(--module-accent-admin, #facc15);
}

.retention-stat__label {
  margin: 4px 0 0;
  font-size: var(--set-fs-micro, 12px);
  color: var(--hos-text-dim, #a1a1aa);
}

.retention-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px 20px;
}

.retention-empty__icon {
  font-size: 26px;
  line-height: 1;
}

.retention-empty__text {
  margin: 0;
  font-size: var(--premium-fs-caption);
  color: var(--hos-text-dim, #a1a1aa);
}

/* 保留策略表格 */
.retention-table {
  display: flex;
  flex-direction: column;
}

.retention-table__head,
.retention-table__row {
  display: grid;
  grid-template-columns: 1.6fr 0.7fr 0.8fr 0.9fr;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
}

.retention-table__head {
  font-size: var(--set-fs-micro, 12px);
  color: var(--hos-text-dim, #a1a1aa);
  border-bottom: var(--hos-hairline) solid var(--hos-border, rgba(255, 255, 255, 0.06));
}

.retention-table__row {
  position: relative;
  border-bottom: var(--hos-hairline) solid var(--hos-border, rgba(255, 255, 255, 0.06));
  transition: background-color 0.15s ease;
}

.retention-table__row:hover {
  background: rgba(255, 255, 255, 0.03);
}

.retention-table__row:last-child {
  border-bottom: none;
}

/* 已修改行：accent 竖条 + 微亮背景 */
.retention-table__row.is-modified {
  background: rgba(var(--module-accent-admin-rgb, 250, 204, 21), 0.05);
}

.retention-table__row.is-modified::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--module-accent-admin, #facc15);
  border-radius: 0 3px 3px 0;
}

.retention-table__main {
  min-width: 0;
}

.retention-table__title {
  margin: 0;
  font-size: var(--premium-fs-body-sm);
  font-weight: 500;
  color: var(--hos-text, #e4e4e7);
}

.retention-table__meta {
  margin: 3px 0 0;
  font-size: var(--set-fs-micro, 12px);
  color: var(--hos-text-dim, #a1a1aa);
}

.retention-table__cell {
  font-size: var(--premium-fs-caption);
  color: var(--hos-text, #e4e4e7);
  white-space: nowrap;
}

.retention-table__cell--rows {
  color: var(--hos-text-dim, #a1a1aa);
}

.retention-table__input-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.retention-table__input {
  width: 76px;
  padding: 6px 28px 6px 8px;
  border-radius: 8px;
  border: var(--hos-hairline) solid var(--hos-border, rgba(255, 255, 255, 0.14));
  background: rgba(255, 255, 255, 0.04);
  color: var(--hos-text, #e4e4e7);
  font-size: var(--premium-fs-caption);
  outline: none;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.retention-table__input:focus {
  border-color: var(--module-accent-admin, #facc15);
  background: rgba(255, 255, 255, 0.06);
}

.retention-table__input.is-modified {
  border-color: rgba(var(--module-accent-admin-rgb, 250, 204, 21), 0.55);
}

.retention-table__input-unit {
  position: absolute;
  right: 8px;
  font-size: var(--set-fs-micro, 12px);
  color: var(--hos-text-dim, #a1a1aa);
  pointer-events: none;
}

/* 表格底部汇总行 */
.retention-table__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 20px;
  font-size: var(--set-fs-micro, 12px);
  color: var(--hos-text-dim, #a1a1aa);
  border-top: var(--hos-hairline) solid var(--hos-border, rgba(255, 255, 255, 0.06));
  background: rgba(255, 255, 255, 0.02);
}

@media (max-width: 900px) {
  .retention-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 720px) {
  .retention-table__head,
  .retention-table__row {
    grid-template-columns: 1.3fr 0.6fr 0.7fr 0.8fr;
    padding: 10px 14px;
  }
  .retention-card__head {
    padding: 16px 14px 12px;
  }
  .retention-batch {
    padding: 10px 14px;
  }
  .retention-batch__meta {
    margin-left: 0;
    width: 100%;
  }
  .retention-stats {
    padding: 14px;
    gap: 10px;
  }
  .retention-table__foot {
    padding: 10px 14px;
  }
}
</style>
