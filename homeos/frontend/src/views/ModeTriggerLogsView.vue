<!--
  ModeTriggerLogsView.vue / views
  模式触发日志视图：HomeOS 居家模式（回家/离家/睡眠/自定义）触发历史列表页，
  顶部 ListPageHero（模式专色 accent）+ ListPageMetrics 聚合统计，
  中部复用 ModeLogsAnalyticsRail 三个 ECharts 分析图，下方按触发源分页日志表。
  路由：Vue Router /logs/home-modes 挂载；登录后可访问，管理员可查看全家庭日志。
  数据来源：services/api/home-modes fetchHomeModeTriggerLogs 触发日志 REST。
  依赖：composables/home/useModeLogsAnalytics 汇总分析（buildModeSourcePieOption 等）；
        composables/life/useLifeChartHost（useHubChart）图表托管；
        Pinia：useAuthStore 权限；
        子组件：HosSelect / ApiQueryState / ListPageHero / ListPageMetrics
                / ModeLogsAnalyticsRail；
        SETTINGS_ROUTES 跳转模式与触发配置；locale-format 详细时间格式化。
        支持按触发源/状态过滤；分页由 useModeLogsAnalytics.results$ 驱动。
  注意：手动触发 vs 自动触发（geo-fence/时段/实体联动）按 source 徽章区分颜色。
-->
<template>
  <div
    class="list-page mode-logs-view"
    :style="{
      '--page-accent': 'var(--module-accent-home-mode)',
      '--page-accent-rgb': 'var(--module-accent-home-mode-rgb)',
      '--page-accent-secondary': 'var(--module-accent-home-mode-sub)',
    }"
  >
    <ListPageHero
      :title="'家庭模式触发日志'"
      :hint="'记录手动、触发器、日历、安防与能源联动等来源的模式切换事件'"
      tone="amber"
    >
      <template #icon>
        <History class="w-5 h-5" />
      </template>
      <template #aside>
        <div class="mode-logs-view__links">
          <router-link :to="SETTINGS_ROUTES.diagnostics()" class="list-page__link-btn">{{
            '运维诊断'
          }}</router-link>
          <router-link :to="SETTINGS_ROUTES.homeMode()" class="list-page__link-btn">{{
            '家庭模式设置'
          }}</router-link>
        </div>
      </template>
      <template v-if="!loading" #stats>
        <ListPageMetrics :cells="logStatCells" />
      </template>
      <template #toolbar>
        <div class="list-page__toolbar-filters" role="group" :aria-label="'日志筛选'">
          <HosSelect
            variant="inline"
            trigger-class="mode-logs-view__filter"
            v-model="sourceFilter"
            @change="onFilterChange"
          >
            <option value="">{{ '全部来源' }}</option>
            <option
              v-for="(label, key) in HOME_MODE_LOG_SOURCE_LABELS"
              :key="key"
              :value="key"
            >
              {{ label }}
            </option>
          </HosSelect>
          <HosSelect
            variant="inline"
            trigger-class="mode-logs-view__filter"
            v-model="successFilter"
            @change="onFilterChange"
          >
            <option value="">{{ '全部结果' }}</option>
            <option value="ok">{{ '成功' }}</option>
            <option value="fail">{{ '失败' }}</option>
          </HosSelect>
        </div>
        <div class="list-page__toolbar-actions" role="group" :aria-label="'日志操作'">
          <button
            type="button"
            class="list-page__btn"
            :disabled="loading || !logs.length"
            @click="exportCsv"
          >
            {{ '导出 CSV' }}
          </button>
          <button
            type="button"
            class="list-page__btn list-page__btn--primary"
            :disabled="loading"
            @click="load"
          >
            {{ loading ? '刷新中…' : '刷新' }}
          </button>
        </div>
      </template>
    </ListPageHero>

    <ModeLogsAnalyticsRail :analytics="analytics" />

    <section class="list-page__panel">
      <div class="list-page__panel-body">
        <ApiQueryState
          :loading="loading"
          :error="error"
          tone="amber"
          error-title="触发日志加载失败"
          @retry="load"
        >
          <div v-if="!logs.length && !hasActiveFilter" class="mode-logs-empty">
            <History class="mode-logs-empty__icon" />
            <p class="mode-logs-empty__title">{{ '暂无触发记录' }}</p>
            <p class="mode-logs-empty__desc">{{ '切换家庭模式后，触发记录将显示在此' }}</p>
            <router-link
              :to="SETTINGS_ROUTES.homeMode()"
              class="mode-logs-empty__btn mode-logs-empty__btn--link"
            >
              {{ '前往家庭模式设置' }}
            </router-link>
          </div>
          <div v-else-if="!logs.length" class="mode-logs-empty">
            <History class="mode-logs-empty__icon" />
            <p class="mode-logs-empty__title">{{ '无匹配记录' }}</p>
            <p class="mode-logs-empty__desc">
              {{ '当前筛选条件下没有触发记录，请调整来源或结果筛选' }}
            </p>
            <button type="button" class="mode-logs-empty__btn" @click="clearFilters">
              {{ '清除筛选' }}
            </button>
          </div>
          <div v-else class="mode-logs-view__table-wrap">
            <table class="mode-logs-view__table" aria-label="家庭模式触发日志">
              <thead>
                <tr>
                  <th>{{ '时间' }}</th>
                  <th>{{ '模式' }}</th>
                  <th class="mode-logs-view__col-source">{{ '来源' }}</th>
                  <th class="mode-logs-view__col-reason">{{ '原因' }}</th>
                  <th>{{ '结果' }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in logs" :key="row.id">
                  <td class="mode-logs-view__time">
                    {{ formatDetailedDateTimeOrDash(row.executedAt) }}
                  </td>
                  <td>{{ row.modeName || '—' }}</td>
                  <td class="mode-logs-view__col-source">{{ sourceLabel(row.source) }}</td>
                  <td class="mode-logs-view__reason" :title="row.reason || ''">
                    {{ reasonLabel(row.reason) }}
                  </td>
                  <td>
                    <span
                      :class="row.success === false ? 'mode-logs-view__fail' : 'mode-logs-view__ok'"
                    >
                      {{ row.success === false ? '失败' : '成功' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </ApiQueryState>
      </div>
    </section>

    <footer v-if="totalPages > 1" class="list-page__pager">
      <button
        type="button"
        class="list-page__btn"
        :disabled="page <= 1 || loading"
        @click="goPage(page - 1)"
      >
        {{ '上一页' }}
      </button>
      <span class="list-page__muted">{{
        '{page} / {totalPages}（{total} 条）'
          .replace('{page}', String(page))
          .replace('{totalPages}', String(totalPages))
          .replace('{total}', String(total))
      }}</span>
      <button
        type="button"
        class="list-page__btn"
        :disabled="page >= totalPages || loading"
        @click="goPage(page + 1)"
      >
        {{ '下一页' }}
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import HosSelect from '@/components/common/base/HosSelect.vue'
import { ref, computed, onMounted } from 'vue'
import { History } from '@lucide/vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { fetchHomeModeTriggerLogs } from '@/services/api/home-modes'
import ListPageHero from '@/components/common/list-page/ListPageHero.vue'
import ListPageMetrics from '@/components/common/list-page/ListPageMetrics.vue'
import ModeLogsAnalyticsRail from '@/views/ModeLogsAnalyticsRail.vue'
import {
  EMPTY_MODE_LOG_ANALYTICS,
  type ModeLogAnalytics,
} from '@/composables/home/useModeLogsAnalytics'
import { formatDetailedDateTimeOrDash } from '@/utils/format/locale-format.util'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

import {
  homeModeLogSourceLabel,
  homeModeLogReasonLabel,
  HOME_MODE_LOG_SOURCE_LABELS,
} from '@homeos/shared'

type TriggerLogRow = {
  id?: string | number
  modeName?: string | null
  source?: string | null
  reason?: string | null
  success?: boolean | null
  executedAt?: string | null
}

type ResultFilter = '' | 'ok' | 'fail'

const logs = ref<TriggerLogRow[]>([])
const analytics = ref<ModeLogAnalytics>({ ...EMPTY_MODE_LOG_ANALYTICS })
const sourceFilter = ref('')
const successFilter = ref<ResultFilter>('')
const page = ref(1)
const pageSize = 100
const total = ref(0)
const totalPages = ref(1)
const loading = ref(false)
const error = ref('')

const hasActiveFilter = computed(() => Boolean(sourceFilter.value || successFilter.value))

const logStatCells = computed(() => {
  const fail = analytics.value.fail
  const ok = analytics.value.ok
  return [
    { key: 'total', label: '总记录', value: String(total.value), tone: 'amber' },
    { key: 'ok', label: '成功', value: String(ok), tone: 'emerald' },
    { key: 'fail', label: '失败', value: String(fail), tone: fail ? 'rose' : 'muted' },
    { key: 'page', label: '当前页', value: String(logs.value.length), tone: 'sky' },
  ]
})

/** 筛选条件变化：回到第一页并服务端重新查询 */
function onFilterChange() {
  page.value = 1
  void load()
}

function clearFilters() {
  sourceFilter.value = ''
  successFilter.value = ''
  onFilterChange()
}

function exportCsv() {
  const header = ['时间', '模式', '来源', '原因', '结果']
  const lines = logs.value.map((row) =>
    [
      formatDetailedDateTimeOrDash(row.executedAt),
      row.modeName || '',
      sourceLabel(row.source),
      reasonLabel(row.reason),
      row.success === false ? '失败' : '成功',
    ]
      .map((c) => `"${c}"`)
      .join(','),
  )
  const blob = new Blob([`\uFEFF${header.join(',')}\n${lines.join('\n')}`], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mode-trigger-logs-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function sourceLabel(source?: string | null) {
  return homeModeLogSourceLabel(source || '')
}

function reasonLabel(reason?: string | null) {
  return homeModeLogReasonLabel(reason || '')
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const { data } = await fetchHomeModeTriggerLogs({
      page: page.value,
      limit: pageSize,
      source: sourceFilter.value || undefined,
      result: successFilter.value || undefined,
    })
    if (Array.isArray(data)) {
      logs.value = data
      total.value = data.length
      totalPages.value = 1
      page.value = 1
      analytics.value = { ...EMPTY_MODE_LOG_ANALYTICS }
    } else {
      logs.value = data?.items || []
      total.value = data?.total ?? logs.value.length
      totalPages.value = data?.totalPages ?? 1
      page.value = data?.page ?? page.value
      analytics.value = data?.analytics || { ...EMPTY_MODE_LOG_ANALYTICS }
    }
  } catch (e) {
    error.value = getApiErrorMessage(e, '加载失败')
    logs.value = []
    analytics.value = { ...EMPTY_MODE_LOG_ANALYTICS }
  } finally {
    loading.value = false
  }
}

function goPage(p: number) {
  page.value = p
  void load()
}

onMounted(load)
</script>

<style scoped src="./styles/ModeTriggerLogsView.css"></style>
