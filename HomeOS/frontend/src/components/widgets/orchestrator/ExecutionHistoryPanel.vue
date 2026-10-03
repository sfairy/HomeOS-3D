<!--
  @module 统一执行历史面板（ExecutionHistoryPanel）
  @description 合并展示自动化 Trace、场景执行、脚本运行、家庭模式切换与告警规则命中记录。
    支持两种布局：compact（仪表板小组件）与 settings（后台设置页，分页布局）。
    支持按类型筛选、仅异常筛选、展开查看自动化 Trace/场景错误详情。
  @dependencies
    - vue（ref/computed/onMounted/watch）
    - @lucide/vue 图标（History/AlertTriangle/RefreshCw/Filter/ChevronDown）
    - ApiQueryState 加载/错误状态
    - services/api/orchestrator fetchExecutionHistory
    - services/api apiDelete（清除历史）
    - utils/orchestrator/execution-history-display-util 显示工具
    - composables/widget/useWidgetStatusPoll 状态轮询
    - stores/chrome.store 确认弹窗/通知
    - utils/config/frontend-config 历史条数上限
  @api GET /api/v1/system/execution-history
-->
<template>
  <div
    :class="[
      'eh-root',
      isSettings && 'eh-root--settings',
      isPaginatedLayout && 'eh-root--settings-paginated',
    ]"
  >
    <!-- compact 模式顶栏：标题 + 异常/记录数徽章 -->
    <div v-if="!isSettings && !embedded" class="eh-header">
      <div class="eh-header-left">
        <History :class="['w-3.5 h-3.5', hasFailures ? 'eh-icon-fail' : 'eh-icon-ok']" />
        <span class="eh-title">{{ isScenePreset ? '场景历史' : '执行历史' }}</span>
      </div>
      <div class="eh-header-right">
        <span v-if="hasFailures" class="eh-badge eh-badge--fail">{{ `${failureCount} 异常` }}</span>
        <span v-else class="eh-badge eh-badge--ok">{{ `${records.length} 条` }}</span>
      </div>
    </div>

    <!-- settings 模式工具栏：记录数 + 刷新按钮 -->
    <div v-else-if="!hideToolbar" class="eh-toolbar">
      <span v-if="hasFailures" class="eh-badge eh-badge--fail">{{ `${failureCount} 条异常` }}</span>
      <span v-else class="eh-badge eh-badge--ok">{{ `共 ${records.length} 条记录` }}</span>
      <button type="button" class="eh-refresh-btn" :disabled="loading" @click="refresh">
        <RefreshCw :class="['w-3.5 h-3.5', loading && 'animate-spin']" /> {{ '刷新' }}
      </button>
    </div>

    <!-- settings 分页布局：类型筛选段控件 + 仅异常切换 -->
    <div v-if="isPaginatedLayout && !isScenePreset" class="eh-control">
      <div class="eh-segments" role="tablist" :aria-label="'执行类型筛选'">
        <button
          v-for="f in filters"
          :key="f.key"
          type="button"
          role="tab"
          :class="['eh-segment', activeFilter === f.key && 'eh-segment--active']"
          :aria-selected="activeFilter === f.key"
          @click="activeFilter = f.key"
        >
          <span class="eh-segment__label">{{ f.label }}</span>
          <span class="eh-segment__count">{{ countForFilterKey(f.key) }}</span>
        </button>
        <!-- 仅异常切换按钮：独立于类型筛选 -->
        <button
          type="button"
          :class="['eh-segment', 'eh-segment--fail', failuresOnly && 'eh-segment--active']"
          @click="failuresOnly = !failuresOnly"
        >
          <span class="eh-segment__label">{{ '仅异常' }}</span>
          <span v-if="scopedFailureCount > 0" class="eh-segment__count eh-segment__count--fail">{{
            scopedFailureCount
          }}</span>
        </button>
      </div>
      <!-- 结果提示文本：当前筛选匹配数与重置按钮 -->
      <p v-if="!loading && !loadError && records.length > 0" class="eh-result-hint">
        {{ resultHint }}
        <button v-if="isFiltered" type="button" class="eh-result-hint__reset" @click="resetFilters">
          {{ '重置' }}
        </button>
      </p>
    </div>

    <!-- 非分页布局：简化筛选按钮组 -->
    <div
      v-else-if="!isScenePreset"
      :class="[
        'eh-filters',
        isSettings && 'eh-filters--settings',
      ]"
    >
      <button
        v-for="f in filters"
        :key="f.key"
        :class="['eh-filter', activeFilter === f.key && 'eh-filter--active']"
        @click="activeFilter = f.key"
      >
        {{ f.label }}
      </button>
      <button
        v-if="isSettings"
        type="button"
        :class="['eh-filter', failuresOnly && 'eh-filter--active eh-filter--fail']"
        @click="failuresOnly = !failuresOnly"
      >
        {{ '仅异常' }}
      </button>
    </div>

    <div class="eh-body">
      <ApiQueryState
        :loading="loading"
        :error="loadError"
        error-title="加载执行历史失败"
        @retry="refresh"
      >
        <!-- 空状态：区分"筛选无匹配"与"无任何记录"两种情形 -->
        <div
          v-if="displayRecords.length === 0"
          :class="[
            'eh-state',
            isEmptyDueToFilter ? 'eh-state--rose' : 'eh-state--emerald',
            isSettings && 'eh-state--settings',
          ]"
        >
          <Filter v-if="isEmptyDueToFilter" class="eh-state__icon" />
          <History v-else class="eh-state__icon" />
          <p class="eh-state__title">
            {{
              isEmptyDueToFilter
                ? '当前筛选无匹配记录'
                : isScenePreset
                  ? '暂无场景执行记录'
                  : '暂无执行记录'
            }}
          </p>
          <p class="eh-state__desc">
            {{
              isEmptyDueToFilter
                ? '尝试切换类型标签，或关闭「仅异常」筛选'
                : isScenePreset
                  ? '场景执行后将在此显示'
                  : '自动化、场景、脚本与告警命中后将在此显示'
            }}
          </p>
          <button v-if="isEmptyDueToFilter" type="button" class="eh-state__btn" @click="resetFilters">
            {{ '清除筛选' }}
          </button>
        </div>
        <template v-else>
          <!-- 执行记录列表：分页布局下使用 spacer 占位避免滚动条 -->
          <div :class="['eh-list', isPaginatedLayout && 'eh-list--paginated']">
            <div
              v-for="record in displayRecords"
              :key="record.id"
              :class="[
                'eh-item',
                record.success ? 'eh-item--ok' : 'eh-item--fail',
              ]"
            >
              <!-- 单条记录主行：状态点 + 类型 + 名称 + 时间 + 展开按钮 -->
              <div class="eh-item-row">
                <div :class="['eh-dot', record.success ? 'eh-dot--ok' : 'eh-dot--fail']" />
                <div class="eh-item-main">
                  <span :class="['eh-type', `eh-type--${record.type}`]">{{
                    typeLabel(record.type)
                  }}</span>
                  <span class="eh-item-name">{{ displayName(record) }}</span>
                  <span class="eh-item-time">{{ formatTime(record.executedAt) }}</span>
                  <p v-if="record.detail" class="eh-item-meta">{{ record.detail }}</p>
                </div>
                <button
                  v-if="hasExpandable(record)"
                  type="button"
                  class="eh-expand-btn"
                  @click="expandedId = expandedId === record.id ? null : record.id"
                >
                  {{ expandedId === record.id ? '收起' : '详情' }}
                  <ChevronDown
                    :class="['eh-expand-btn__icon', expandedId === record.id && 'eh-expand-btn__icon--open']"
                  />
                </button>
              </div>

              <!-- 自动化 Trace 详情：分页模式下截断展示前 N 步 -->
              <div
                v-if="
                  record.type === 'automation' &&
                  record.meta?.trace?.length &&
                  expandedId === record.id
                "
                class="eh-trace"
              >
                <div v-for="(step, idx) in traceSteps(record)" :key="idx" class="eh-trace-step">
                  <span
                    :class="['eh-trace-dot', step.ok ? 'eh-trace-dot--ok' : 'eh-trace-dot--fail']"
                  />
                  <span class="eh-trace-label">{{
                    step.step || step.service || `步骤 ${idx + 1}`
                  }}</span>
                  <span v-if="step.detail" class="eh-trace-detail">{{ step.detail }}</span>
                </div>
                <p v-if="traceOverflowCount(record) > 0" class="eh-trace-more">
                  {{ `还有 ${traceOverflowCount(record)} 步，请缩小筛选范围后查看` }}
                </p>
              </div>
              <!-- 场景错误详情：分页模式下截断展示前 N 条 -->
              <div
                v-if="
                  record.type === 'scene' && record.meta?.errors?.length && expandedId === record.id
                "
                class="eh-errors"
              >
                <div
                  v-for="(err, idx) in sceneErrors(record)"
                  :key="idx"
                  class="eh-error-item"
                >
                  <AlertTriangle class="w-3 h-3 eh-error-icon shrink-0" />
                  <span class="eh-error-text">{{ err }}</span>
                </div>
              </div>
            </div>
            <div v-if="isPaginatedLayout" class="eh-list-spacer" aria-hidden="true" />
          </div>
        </template>
      </ApiQueryState>
    </div>

    <!-- 分页页脚：上一页/下一页 + 页码标签 -->
    <footer
      v-if="isPaginatedLayout && !loading && filteredRecords.length > 0"
      class="eh-pager eh-pager--settings"
    >
      <button
        type="button"
        class="eh-pager-btn"
        :disabled="currentPage <= 1"
        @click="goPage(currentPage - 1)"
      >
        {{ '上一页' }}
      </button>
      <span class="eh-pager-label">{{ pagerLabel }}</span>
      <button
        type="button"
        class="eh-pager-btn"
        :disabled="currentPage >= totalPages"
        @click="goPage(currentPage + 1)"
      >
        {{ '下一页' }}
      </button>
    </footer>
  </div>
</template>

<script setup>
/**
 * 统一执行历史面板
 * 合并自动化 Trace、场景执行、告警规则命中记录
 * API: GET /api/v1/system/execution-history
 */
import { ref, computed, onMounted, watch } from 'vue'
import { History, AlertTriangle, RefreshCw, Filter, ChevronDown } from '@lucide/vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { fetchExecutionHistory, clearExecutionHistory } from '@/services/api/orchestrator'
import { notifyError } from '@/services/notify'
import {
  executionHistoryTypeLabel,
  executionHistoryDisplayName,
  formatExecutionRelativeTime,
} from '@/utils/orchestrator/execution-history-display.util'
import { useWidgetStatusPoll } from '@/composables/widget/useWidgetStatusPoll'
import { useChromeStore } from '@/stores/chrome.store'
import { getExecutionHistoryLimit } from '@/utils/config/frontend-config'

/** 设置页分页布局每页条数（无列表滚动条，仅翻页） */
const SETTINGS_PAGE_SIZE = 6
/** 分页模式下 Trace 步骤最大展示数 */
const PAGINATED_TRACE_LIMIT = 4
/** 分页模式下场景错误最大展示数 */
const PAGINATED_ERROR_LIMIT = 3
const props = defineProps({
  /** compact：仪表板小组件；settings：后台设置页 */
  variant: {
    type: String,
    default: 'compact',
    validator: (v) => ['compact', 'settings'].includes(v),
  },
  /** 预设过滤：scene 仅显示场景执行记录 */
  preset: { type: String, default: '' },
  /** 初始 activeFilter（可被 preset 覆盖） */
  initialFilter: { type: String, default: '' },
  /** settings 模式下隐藏顶栏（由外层页面头部提供操作按钮） */
  hideToolbar: { type: Boolean, default: false },
  /** settings 独立页：分页布局，列表区域不使用滚动条 */
  paginated: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
})

const emit = defineEmits(['stats'])

const chrome = useChromeStore()
/** 清除操作进行中标记，避免重复触发 */
const clearing = ref(false)

/** 是否为设置页布局 */
const isSettings = computed(() => props.variant === 'settings')
/** 是否为分页布局（settings + paginated 同时为真） */
const isPaginatedLayout = computed(() => isSettings.value && props.paginated)
/** 是否为场景历史预设（仅展示场景类型） */
const isScenePreset = computed(() => props.preset === 'scene')

const loading = ref(true)
const loadError = ref('')
const records = ref([])
/** 当前展开详情的记录 id（null 表示全部收起） */
const expandedId = ref(null)
const activeFilter = ref(props.preset === 'scene' ? 'scene' : props.initialFilter || 'all')
const failuresOnly = ref(false)
const currentPage = ref(1)

/** 全部类型筛选选项（场景预设下仅保留 scene） */
const allFilters = computed(() => [
  { key: 'all', label: '全部' },
  { key: 'automation', label: '自动化' },
  { key: 'scene', label: '场景' },
  { key: 'script', label: '脚本' },
  { key: 'home_mode', label: '家庭模式' },
  { key: 'alert', label: '告警' },
])
const filters = computed(() => {
  if (isScenePreset.value) {
    return allFilters.value.filter((f) => f.key === 'scene')
  }
  return allFilters.value
})

/**
 * 统计指定类型筛选下的记录数
 * @param {string} key 类型 key（all/automation/scene/...）
 * @returns {number}
 */
function countForFilterKey(key) {
  if (key === 'all') return records.value.length
  return records.value.filter((r) => r.type === key).length
}

/** 底部结果提示文本：显示条数 / 总计 / 异常数 */
const resultHint = computed(() => {
  const total = records.value.length
  const shown = filteredRecords.value.length
  const parts = []
  if (isFiltered.value) {
    parts.push(`显示 ${shown} 条`)
    if (shown !== total) parts.push(`总计 ${total} 条`)
  } else {
    parts.push(`共 ${shown} 条`)
  }
  const failN = isFiltered.value ? filteredFailureCount.value : failureCount.value
  if (failN > 0) parts.push(`${failN} 条异常`)
  return parts.join(' · ')
})

/** 应用类型 + 仅异常筛选后的记录列表 */
const filteredRecords = computed(() => {
  let list = records.value
  if (activeFilter.value !== 'all') {
    list = list.filter((r) => r.type === activeFilter.value)
  }
  if (failuresOnly.value) {
    list = list.filter((r) => !r.success)
  }
  return list
})

/** 分页总页数（非分页布局恒为 1） */
const totalPages = computed(() => {
  if (!isPaginatedLayout.value) return 1
  return Math.max(1, Math.ceil(filteredRecords.value.length / SETTINGS_PAGE_SIZE))
})

/** 当前页展示的记录（分页布局下做切片） */
const displayRecords = computed(() => {
  if (!isPaginatedLayout.value) return filteredRecords.value
  const start = (currentPage.value - 1) * SETTINGS_PAGE_SIZE
  return filteredRecords.value.slice(start, start + SETTINGS_PAGE_SIZE)
})

/** 分页标签文本：当前页/总页数 · 起止区间/总数 */
const pagerLabel = computed(() => {
  const total = filteredRecords.value.length
  const start = total ? (currentPage.value - 1) * SETTINGS_PAGE_SIZE + 1 : 0
  const end = Math.min(currentPage.value * SETTINGS_PAGE_SIZE, total)
  return `${currentPage.value} / ${totalPages.value} · ${start}-${end} / ${total}`
})

const failureCount = computed(() => records.value.filter((r) => !r.success).length)
const hasFailures = computed(() => failureCount.value > 0)
const filteredFailureCount = computed(() => filteredRecords.value.filter((r) => !r.success).length)
const hasFilteredFailures = computed(() => filteredFailureCount.value > 0)
/** 是否处于筛选状态（非全部类型或开启仅异常） */
const isFiltered = computed(() => activeFilter.value !== 'all' || failuresOnly.value)
/** 因筛选导致空列表（区分于"无任何记录"） */
const isEmptyDueToFilter = computed(
  () => records.value.length > 0 && filteredRecords.value.length === 0,
)

/** 当前类型下（不含仅异常）的失败数，用于段控件徽章 */
const scopedFailureCount = computed(() => {
  let list = records.value
  if (activeFilter.value !== 'all') {
    list = list.filter((r) => r.type === activeFilter.value)
  }
  return list.filter((r) => !r.success).length
})

/** 重置筛选：场景预设下保留 scene，否则回到 all */
function resetFilters() {
  activeFilter.value = isScenePreset.value ? 'scene' : 'all'
  failuresOnly.value = false
}

/** 向外 emit 统计数据（仅 settings 模式触发，供外层展示徽章） */
function emitStats() {
  if (!isSettings.value) return
  emit('stats', {
    loading: loading.value,
    loaded: !loading.value && !loadError.value,
    recordCount: records.value.length,
    failureCount: failureCount.value,
    hasFailures: hasFailures.value,
    filteredRecordCount: filteredRecords.value.length,
    filteredFailureCount: filteredFailureCount.value,
    hasFilteredFailures: hasFilteredFailures.value,
    isFiltered: isFiltered.value,
    activeFilter: activeFilter.value,
    failuresOnly: failuresOnly.value,
  })
}

// 监听所有影响统计的字段，统一触发 emitStats
watch(
  [
    loading,
    loadError,
    records,
    failureCount,
    hasFailures,
    filteredRecords,
    filteredFailureCount,
    hasFilteredFailures,
    isFiltered,
    activeFilter,
    failuresOnly,
  ],
  emitStats,
  { deep: true },
)

const typeLabel = executionHistoryTypeLabel
const displayName = executionHistoryDisplayName
/**
 * 判断记录是否包含可展开详情
 * - scene：有 errors 数组
 * - automation：有 trace 数组
 * @param {Object} record 执行记录
 * @returns {boolean}
 */
function hasExpandable(record) {
  if (record.type === 'scene' && record.meta?.errors?.length) return true
  if (record.type === 'automation' && record.meta?.trace?.length) return true
  return false
}

/**
 * 获取记录的 Trace 步骤（分页模式下截断）
 * @param {Object} record 执行记录
 * @returns {Array}
 */
function traceSteps(record) {
  const trace = Array.isArray(record.meta?.trace) ? record.meta.trace : []
  if (!isPaginatedLayout.value) return trace
  return trace.slice(0, PAGINATED_TRACE_LIMIT)
}

/**
 * 计算分页模式下被截断的 Trace 步骤数
 * @param {Object} record 执行记录
 * @returns {number}
 */
function traceOverflowCount(record) {
  const trace = Array.isArray(record.meta?.trace) ? record.meta.trace : []
  if (!isPaginatedLayout.value) return 0
  return Math.max(0, trace.length - PAGINATED_TRACE_LIMIT)
}

/**
 * 获取记录的场景错误列表（分页模式下截断）
 * @param {Object} record 执行记录
 * @returns {Array}
 */
function sceneErrors(record) {
  const errors = Array.isArray(record.meta?.errors) ? record.meta.errors : []
  if (!isPaginatedLayout.value) return errors
  return errors.slice(0, PAGINATED_ERROR_LIMIT)
}

const formatTime = formatExecutionRelativeTime

/**
 * 拉取执行历史数据
 * @param {Object} opts 选项：silent=true 时不切换 loading 状态（用于轮询）
 * @returns {Promise<void>}
 */
async function fetchData(opts = {}) {
  const silent = opts.silent === true
  try {
    if (!silent) loading.value = true
    const limit = getExecutionHistoryLimit()
    const { data } = await fetchExecutionHistory({ limit })
    // 后端返回可能为数组或 { items: [] } 对象，统一兼容
    if (isSettings.value) {
      records.value = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []
    } else if (Array.isArray(data)) {
      records.value = data
    } else {
      records.value = []
    }
    loadError.value = ''
  } catch (e) {
    // 已有缓存数据时不覆盖错误信息，避免列表闪烁
    if (!records.value.length) loadError.value = getApiErrorMessage(e, '请检查网络连接后重试')
    notifyError(e, '加载执行历史', { silent: true })
  } finally {
    if (!silent) loading.value = false
    emitStats()
  }
}

/** 跳转到指定页码（越界或重复则忽略） */
function goPage(page) {
  if (page < 1 || page > totalPages.value || page === currentPage.value) return
  currentPage.value = page
  expandedId.value = null
}

/** 手动刷新：重置展开与页码后拉取 */
async function refresh() {
  expandedId.value = null
  currentPage.value = 1
  await fetchData()
}

// 筛选变化时重置页码与展开状态
watch([activeFilter, failuresOnly], () => {
  if (!isSettings.value) return
  currentPage.value = 1
  expandedId.value = null
})

// 总页数缩小时修正当前页，避免停留在不存在的页码
watch(totalPages, (tp) => {
  if (currentPage.value > tp) currentPage.value = Math.max(1, tp)
})

/** 计算清除接口的 type 参数（all 时返回 undefined 表示全部） */
function clearTypeParam() {
  if (activeFilter.value === 'all') return undefined
  return activeFilter.value
}

/** 生成清除历史操作的二次确认文案 */
function clearConfirmMessage() {
  const type = clearTypeParam()
  if (type) {
    return `确定清除全部「${typeLabel(type)}」执行记录？此操作不可恢复。`
  }
  return '确定清除全部执行历史？此操作不可恢复。'
}

/**
 * 清除执行历史（按当前类型筛选）
 * - 弹出二次确认
 * - 调用 DELETE /system/execution-history
 * - 清空后重新拉取首页
 * @returns {Promise<void>}
 */
async function clearHistory() {
  if (clearing.value || loading.value) return
  const ok = await chrome.confirm(clearConfirmMessage(), '清除执行历史', {
    confirmText: '清除',
    type: 'danger',
  })
  if (!ok) return

  clearing.value = true
  try {
    const type = clearTypeParam()
    const params = type ? { type } : undefined
    const { data } = await clearExecutionHistory(params)
    const deleted = data?.deleted ?? 0
    chrome.notify(deleted ? `已清除 ${deleted} 条记录` : '暂无可清除的记录', 'success')
    expandedId.value = null
    currentPage.value = 1
    await fetchData()
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '清除失败'), 'error')
  } finally {
    clearing.value = false
  }
}

defineExpose({ refresh, clearHistory, clearing })

onMounted(() => {
  fetchData()
})
// 轮询配置：场景历史 15s，其他 20s
const pollKey = props.preset === 'scene' ? 'sceneHistory' : 'executionHistory'
const pollInterval = props.preset === 'scene' ? 15_000 : 20_000
useWidgetStatusPoll(pollKey, () => fetchData({ silent: true }), pollInterval, {
  key: props.preset === 'scene' ? 'widget:SceneHistoryPanel' : 'widget:ExecutionHistoryPanel',
})
</script>

<style scoped src="./styles/ExecutionHistoryPanel.css"></style>