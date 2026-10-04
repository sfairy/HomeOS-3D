<!--
  EarthquakeHistoryView.vue / views
  地震历史视图页面：路由归属一级「地震信息」页面，本地 EEW 与全球地震双 Tab，
  顶部 ListPageHero 标题 + 指标条、ListPageMetrics KPI、中部 Analytics 折线/柱状分析图，
  下方表格展示事件详情，支持按强度/时间筛选、清空本地、模拟演练事件标注。
  路由：由 Vue Router /earthquake-history 挂载；登录态用户进入，访客受限只读。
  依赖：services/api/earthquake 历史/本地/全局 + 清空 接口；
        utils：earthquake/util 烈度与震级格式化 + history-analytics.util 分析聚合；
        Pinia：useChromeStore 全局通知；
        子组件：HosSelect / ApiQueryState / ListPageHero / ListPageMetrics
                / EarthquakeHistoryAnalytics；
        SETTINGS_ROUTES 跳转地震预警参数页。
        @homeos/shared：isEewSimulationEventId 标识演练事件（带样式区分）。
  注意：本地 EEW Tab 显示分析图；global Tab 展示全球 USGS/EMS 数据空态时回退。
-->
<template>
  <div class="list-page earthquake-history-view">
    <ListPageHero
      :title="'地震信息'"
      :hint="tab === 'local' ? '本地 EEW 预警记录 · 数据分析与事件流' : globalHint"
      tone="amber"
    >
      <template #icon>
        <Activity class="w-5 h-5" />
      </template>
      <template #aside>
        <router-link :to="SETTINGS_ROUTES.alerts('earthquake')" class="list-page__link-btn">{{
          '预警设置'
        }}</router-link>
        <button
          type="button"
          class="list-page__btn list-page__btn--primary"
          :disabled="loading"
          @click="load"
        >
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
      </template>
      <template #stats>
        <ListPageMetrics :cells="statCells" />
      </template>
    </ListPageHero>

    <div class="earthquake-history-view__toolbar">
      <div class="earthquake-history-view__dock" role="tablist" aria-label="地震信息视图">
        <button
          type="button"
          role="tab"
          class="earthquake-history-view__tab"
          :class="{ 'earthquake-history-view__tab--active': tab === 'local' }"
          :aria-selected="tab === 'local'"
          @click="switchTab('local')"
        >
          本地预警
        </button>
        <button
          type="button"
          role="tab"
          class="earthquake-history-view__tab"
          :class="{ 'earthquake-history-view__tab--active': tab === 'global' }"
          :aria-selected="tab === 'global'"
          @click="switchTab('global')"
        >
          全球震情
        </button>
      </div>

          <div v-if="tab === 'local'" class="earthquake-history-view__filters">
        <label class="earthquake-history-view__filter">
          <span>数据源</span>
          <HosSelect
            v-model="localSource"
            variant="settings"
            trigger-class="list-page__input earthquake-history-view__select"
            @change="onLocalFilterChange"
          >
            <option v-for="s in LOCAL_EEW_SOURCE_FILTERS" :key="s.id" :value="s.id">
              {{ s.label }}
            </option>
          </HosSelect>
        </label>
        <label class="earthquake-history-view__filter">
          <span>类型</span>
          <HosSelect
            v-model="localKind"
            variant="settings"
            trigger-class="list-page__input earthquake-history-view__select"
            @change="onLocalFilterChange"
          >
            <option v-for="k in LOCAL_EEW_KIND_FILTERS" :key="k.id" :value="k.id">
              {{ k.label }}
            </option>
          </HosSelect>
        </label>
        <button
          v-if="simulationCount > 0"
          type="button"
          class="list-page__btn earthquake-history-view__clear-sim"
          :disabled="loading || deletingSim"
          @click="clearAllSimulations"
        >
          {{ deletingSim ? '清除中…' : `清除演练（${simulationCount}）` }}
        </button>
      </div>

      <div v-else class="earthquake-history-view__filters">
        <label class="earthquake-history-view__filter">
          <span>数据源</span>
          <HosSelect
            v-model="globalSource"
            variant="settings"
            trigger-class="list-page__input earthquake-history-view__select"
            @change="onGlobalFilterChange"
          >
            <option v-for="s in GLOBAL_EARTHQUAKE_SOURCES" :key="s.id" :value="s.id">
              {{ s.label }}
            </option>
          </HosSelect>
        </label>
        <label class="earthquake-history-view__filter">
          <span>时间范围</span>
          <HosSelect
            v-model="globalPeriod"
            variant="settings"
            trigger-class="list-page__input earthquake-history-view__select"
            @change="onGlobalFilterChange"
          >
            <option v-for="p in GLOBAL_EARTHQUAKE_PERIODS" :key="p.id" :value="p.id">
              {{ p.label }}
            </option>
          </HosSelect>
        </label>
        <label class="earthquake-history-view__filter">
          <span>最低震级</span>
          <HosSelect
            v-model="globalMinMag"
            variant="settings"
            trigger-class="list-page__input earthquake-history-view__select"
            number
            @change="onGlobalFilterChange"
          >
            <option v-for="m in EEW_MAGNITUDE_OPTIONS" :key="m" :value="m">M{{ m }}+</option>
          </HosSelect>
        </label>
        <span v-if="globalMeta.stale" class="earthquake-history-view__meta earthquake-history-view__meta--stale"
          >离线缓存</span
        >
        <span v-else-if="globalMeta.cached" class="earthquake-history-view__meta">缓存</span>
        <span v-if="globalMeta.fetchedAt" class="earthquake-history-view__meta">
          {{ formatHistoryTimestamp(globalMeta.fetchedAt) }}
        </span>
      </div>
    </div>

    <section class="earthquake-history-view__content">
      <ApiQueryState
        :loading="loading"
        :error="error"
        tone="amber"
        :error-title="tab === 'local' ? '历史加载失败' : '全球震情加载失败'"
        @retry="load"
      >
        <VEmptyState
          v-if="!allItems.length"
          tone="amber"
          icon="🌍"
          :title="
            tab === 'local' && localItems.length
              ? '无匹配记录'
              : tab === 'local'
                ? '暂无预警记录'
                : '暂无符合条件的全球地震'
          "
          :description="emptyDesc"
        >
          <template v-if="tab === 'local' && !localItems.length" #action>
            <router-link
              :to="SETTINGS_ROUTES.alerts('earthquake')"
              class="list-page__btn list-page__btn--primary"
            >
              {{ '前往预警配置' }}
            </router-link>
          </template>
        </VEmptyState>

        <div v-else class="earthquake-history-view__layout">
          <section class="earthquake-history-view__analytics">
            <EarthquakeHistoryAnalytics
              :items="allItems"
              :tab="tab"
              :period="tab === 'global' ? globalPeriod : 'week'"
            />
          </section>

          <section class="earthquake-history-view__stream">
            <div class="earthquake-history-view__stream-glow" aria-hidden="true" />
            <header class="earthquake-history-view__stream-head">
              <div>
                <h2 class="earthquake-history-view__stream-title">事件流</h2>
                <p class="earthquake-history-view__stream-sub">
                  {{ total }} 条记录 · 第 {{ page }}/{{ totalPages }} 页
                </p>
              </div>
            </header>

            <div class="earthquake-history-view__cards">
              <template v-for="(row, idx) in pageSlots" :key="row ? rowKey(row) : `empty-${idx}`">
                <div
                  v-if="row"
                  class="earthquake-history-view__card"
                  :class="[
                    `earthquake-history-view__card--mag-${magnitudeTone(row.magnitude)}`,
                    tab === 'local' && isSimulationRow(row) && 'earthquake-history-view__card--sim',
                  ]"
                  :title="cardTitle(row)"
                >
                  <span
                    class="earthquake-history-view__mag"
                    :class="`earthquake-history-view__mag--${magnitudeTone(row.magnitude)}`"
                  >
                    <span class="earthquake-history-view__mag-prefix">M</span>
                    <span class="earthquake-history-view__mag-value">{{
                      formatMagnitude(row.magnitude)
                    }}</span>
                  </span>

                  <div class="earthquake-history-view__card-body">
                    <div class="earthquake-history-view__card-main">
                      <span class="earthquake-history-view__place">{{ cardPlace(row) }}</span>
                      <div class="earthquake-history-view__detail">
                        <div
                          v-if="tab === 'local' && (rowSourceLabel(row) || rowKindLabel(row))"
                          class="earthquake-history-view__badges"
                        >
                          <span
                            v-if="rowSourceLabel(row)"
                            class="earthquake-history-view__badge earthquake-history-view__badge--source"
                            :class="`earthquake-history-view__badge--src-${row.source || 'unknown'}`"
                          >
                            {{ rowSourceLabel(row) }}
                          </span>
                          <span
                            v-if="rowKindLabel(row)"
                            class="earthquake-history-view__badge"
                            :class="
                              rowKind(row) === 'confirmation'
                                ? 'earthquake-history-view__badge--confirm'
                                : 'earthquake-history-view__badge--early'
                            "
                          >
                            {{ rowKindLabel(row) }}
                          </span>
                        </div>
                        <div class="earthquake-history-view__metrics">
                          <span
                            v-for="(m, mi) in cardMetrics(row)"
                            :key="`${rowKey(row)}-m-${mi}`"
                            class="earthquake-history-view__metric"
                          >
                            {{ m }}
                          </span>
                          <span
                            v-if="!cardMetrics(row).length"
                            class="earthquake-history-view__metric earthquake-history-view__metric--muted"
                          >
                            {{ tab === 'local' ? '本地 EEW 预警' : '目录事件' }}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      class="earthquake-history-view__card-aside"
                      :class="
                        tab === 'local' && isSimulationRow(row)
                          ? 'earthquake-history-view__card-aside--with-action'
                          : null
                      "
                    >
                      <time class="earthquake-history-view__when">{{ cardWhen(row) }}</time>
                      <button
                        v-if="tab === 'local' && isSimulationRow(row)"
                        type="button"
                        class="earthquake-history-view__delete"
                        :disabled="loading || deletingSim"
                        title="删除该演练记录"
                        aria-label="删除该演练记录"
                        @click.stop="deleteSimulation(row)"
                      >
                        <Trash2 class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
                <div
                  v-else
                  class="earthquake-history-view__card earthquake-history-view__card--empty"
                  aria-hidden="true"
                />
              </template>
            </div>

            <footer class="earthquake-history-view__pager">
              <button
                type="button"
                class="list-page__btn"
                :disabled="page <= 1 || loading"
                @click="goPage(page - 1)"
              >
                上一页
              </button>
              <span class="list-page__muted"
                >{{ page }} / {{ totalPages }}（共 {{ total }} 条）</span
              >
              <button
                type="button"
                class="list-page__btn"
                :disabled="page >= totalPages || loading"
                @click="goPage(page + 1)"
              >
                下一页
              </button>
            </footer>
          </section>
        </div>
      </ApiQueryState>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { Activity, Trash2 } from '@lucide/vue'
import { isEewSimulationEventId } from '@homeos/shared'
import {
  deleteEarthquakeSimulationHistory,
  fetchEarthquakeHistory,
  fetchGlobalEarthquakes,
} from '@/services/api/earthquake'
import HosSelect from '@/components/common/base/HosSelect.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import ListPageHero from '@/components/common/list-page/ListPageHero.vue'
import ListPageMetrics from '@/components/common/list-page/ListPageMetrics.vue'
import EarthquakeHistoryAnalytics from '@/components/earthquake/HistoryAnalytics.vue'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { useChromeStore } from '@/stores/chrome.store'
import {
  buildFixedPageSlots,
  computeAnalyticsSummary,
  shortenPlace,
} from '@/utils/earthquake/history-analytics.util'
import {
  formatEarthquakeMagnitude,
  earthquakeMagnitudeTone,
} from '@/utils/earthquake/util'
import { formatLocaleString } from '@/utils/format/locale-format.util'
import {
  EEW_MAGNITUDE_OPTIONS,
  GLOBAL_EARTHQUAKE_PERIODS,
  GLOBAL_EARTHQUAKE_SOURCES,
  LOCAL_EEW_KIND_FILTERS,
  LOCAL_EEW_SOURCE_FILTERS,
  eewAlertKindLabel,
  eewSourceLabel,
} from '@/types/earthquake'
import './styles/earthquake-history.css'

const PAGE_SIZE = 8

const chrome = useChromeStore()
const tab = ref('local')
const localItems = ref([])
const globalItems = ref([])
const localSource = ref('all')
const localKind = ref('all')
const globalSource = ref('cenc')
const globalPeriod = ref('day')
const globalMinMag = ref(3)
const globalMeta = ref({ cached: false, stale: false, fetchedAt: 0 })
const page = ref(1)
const loading = ref(false)
const deletingSim = ref(false)
const error = ref('')

function isSimulationRow(row) {
  return row?.source === 'test' || isEewSimulationEventId(row?.eventId)
}

const filteredLocalItems = computed(() => {
  return localItems.value.filter((row) => {
    if (localSource.value !== 'all' && (row.source || '') !== localSource.value) return false
    if (localKind.value !== 'all' && rowKind(row) !== localKind.value) return false
    return true
  })
})

const simulationCount = computed(
  () => localItems.value.filter((row) => isSimulationRow(row)).length,
)

const allItems = computed(() =>
  tab.value === 'local' ? filteredLocalItems.value : globalItems.value,
)
const total = computed(() => allItems.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const normalizedItems = computed(() => allItems.value.map(normalizeRow))
const pageSlots = computed(() => buildFixedPageSlots(normalizedItems.value, page.value, PAGE_SIZE))

const analyticsSummary = computed(() => {
  if (tab.value === 'local') {
    return computeAnalyticsSummary(allItems.value, {
      getMagnitude: (row) => row.magnitude,
      getDistanceKm: (row) => row.distance,
      getPlace: (row) => row.epicenter,
    })
  }
  return computeAnalyticsSummary(allItems.value, {
    getMagnitude: (row) => row.magnitude,
    getDistanceKm: (row) => row.distanceKm,
    getPlace: (row) => row.place,
  })
})

const statCells = computed(() => [
  {
    key: 'total',
    label: tab.value === 'local' ? '本地记录' : '震情事件',
    value: String(analyticsSummary.value.total),
    tone: analyticsSummary.value.total ? 'amber' : 'muted',
  },
  {
    key: 'max',
    label: '最大震级',
    value:
      analyticsSummary.value.maxMagnitude != null
        ? `M${formatEarthquakeMagnitude(analyticsSummary.value.maxMagnitude)}`
        : '—',
    tone:
      analyticsSummary.value.maxMagnitude != null && analyticsSummary.value.maxMagnitude >= 5
        ? 'danger'
        : 'sky',
  },
  {
    key: 'near',
    label: '距家最近',
    value:
      analyticsSummary.value.nearestKm != null ? `${analyticsSummary.value.nearestKm} km` : '—',
    tone:
      analyticsSummary.value.nearestKm != null && analyticsSummary.value.nearestKm <= 200
        ? 'warn'
        : 'muted',
  },
])

const emptyDesc = computed(() => {
  if (tab.value === 'local') {
    if (localItems.value.length && !filteredLocalItems.value.length) {
      return '当前筛选无匹配记录，试试「全部来源 / 全部类型」'
    }
    return '启用地震预警后，通过震级/距离/烈度阈值的 EEW 与台网震情将显示在此'
  }
  return '尝试降低最低震级或扩大时间范围'
})

const globalHint = computed(() => {
  const base =
    globalSource.value === 'cenc'
      ? '中国地震台网震情目录 · 左栏分析 · 右栏事件流'
      : 'USGS 全球地震目录 · 左栏分析 · 右栏事件流'
  return globalMeta.value.stale ? `${base} · 当前为离线缓存` : base
})

function normalizeRow(row) {
  if (tab.value === 'local') {
    return {
      ...row,
      place: row.epicenter,
      whenMs: row.savedAt || row.originTime,
    }
  }
  return {
    ...row,
    place: row.place,
    whenMs: row.originTime,
  }
}

function rowKey(row) {
  return row.eventId || row.id || `${row.whenMs}-${row.place}`
}

function formatHistoryTimestamp(ts, compact = false) {
  if (ts == null || ts === '') return '—'
  const n = Number(ts)
  const date =
    Number.isFinite(n) && n > 0
      ? new Date(n > 1e12 ? n : n * 1000)
      : new Date(ts)
  if (Number.isNaN(date.getTime())) return '—'
  try {
    if (compact) {
      return formatLocaleString(date, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    }
    return formatLocaleString(date, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return '—'
  }
}

function formatMagnitude(magnitude) {
  return formatEarthquakeMagnitude(magnitude)
}

function magnitudeTone(magnitude) {
  return earthquakeMagnitudeTone(magnitude)
}

function cardPlace(row) {
  return shortenPlace(row.place || row.epicenter, 18)
}

function cardWhen(row) {
  return formatHistoryTimestamp(row.whenMs)
}

function rowKind(row) {
  if (row.alertKind === 'confirmation' || row.alertKind === 'early') return row.alertKind
  // 旧记录无 alertKind：与后端一致，countdown < -60 视为确认通报
  if (row.countdown != null && Number(row.countdown) < -60) return 'confirmation'
  return 'early'
}

function rowSourceLabel(row) {
  return eewSourceLabel(row.source)
}

function rowKindLabel(row) {
  return eewAlertKindLabel(rowKind(row))
}

function cardTitle(row) {
  const parts = []
  const place = row.place || row.epicenter
  if (place) parts.push(place)
  if (row.placeEn && row.placeEn !== place) parts.push(row.placeEn)
  if (tab.value === 'local') {
    const src = rowSourceLabel(row)
    const kind = rowKindLabel(row)
    if (src) parts.push(src)
    if (kind) parts.push(kind)
  }
  parts.push(formatHistoryTimestamp(row.whenMs))
  return parts.join(' · ')
}

function cardMetrics(row) {
  if (tab.value === 'local') {
    const parts = []
    if (row.distance != null) parts.push(`${row.distance} km`)
    const intensity = row.localIntensity ?? row.maxIntensity
    if (intensity != null) parts.push(`烈度 ${intensity}`)
    if (row.countdown != null) parts.push(`${row.countdown}s`)
    return parts
  }
  const parts = []
  if (row.distanceKm != null) parts.push(`${row.distanceKm} km`)
  if (row.depth != null) parts.push(`深 ${row.depth} km`)
  if (globalSource.value === 'cenc' && row.intensity != null) parts.push(`烈度 ${row.intensity}`)
  if (globalSource.value === 'usgs' && row.tsunami) parts.push('海啸风险')
  return parts
}

function resetPage() {
  page.value = 1
}

function goPage(next) {
  const p = Math.min(Math.max(1, Number(next) || 1), totalPages.value)
  if (p === page.value) return
  page.value = p
}

function switchTab(next) {
  if (tab.value === next) return
  tab.value = next
  resetPage()
  load()
}

function onLocalFilterChange() {
  resetPage()
}

function onGlobalFilterChange() {
  resetPage()
  load()
}

async function loadGlobal() {
  const data = await fetchGlobalEarthquakes({
    source: globalSource.value,
    period: globalPeriod.value,
    minMag: globalMinMag.value,
    limit: 100,
  })
  globalItems.value = Array.isArray(data?.items) ? data.items : []
  globalMeta.value = {
    cached: !!data?.cached,
    stale: !!data?.stale,
    fetchedAt: data?.fetchedAt || 0,
  }
  if (data?.source === 'cenc' || data?.source === 'usgs') {
    globalSource.value = data.source
  }
}

async function loadLocal() {
  const { data } = await fetchEarthquakeHistory()
  localItems.value = Array.isArray(data?.items) ? data.items : []
}

async function deleteSimulation(row) {
  const eventId = String(row?.eventId || '').trim()
  if (!eventId || !isSimulationRow(row)) return
  const ok = await chrome.confirm('删除这条模拟演练记录？', '删除演练', {
    confirmText: '删除',
    type: 'danger',
  })
  if (!ok) return
  deletingSim.value = true
  try {
    const res = await deleteEarthquakeSimulationHistory(eventId)
    const deleted = Number(res?.data?.deleted ?? res?.deleted ?? 0)
    chrome.notify(deleted ? '已删除演练记录' : '未找到对应演练记录', deleted ? 'success' : 'info')
    await loadLocal()
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '删除失败'), 'error')
  } finally {
    deletingSim.value = false
  }
}

async function clearAllSimulations() {
  if (!simulationCount.value) return
  const ok = await chrome.confirm(
    `清除全部 ${simulationCount.value} 条模拟演练记录？真实预警不会受影响。`,
    '清除演练',
    { confirmText: '清除', type: 'danger' },
  )
  if (!ok) return
  deletingSim.value = true
  try {
    const res = await deleteEarthquakeSimulationHistory()
    const deleted = Number(res?.data?.deleted ?? res?.deleted ?? 0)
    chrome.notify(
      deleted ? `已清除 ${deleted} 条演练记录` : '暂无演练记录',
      deleted ? 'success' : 'info',
    )
    await loadLocal()
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '清除失败'), 'error')
  } finally {
    deletingSim.value = false
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (tab.value === 'local') await loadLocal()
    else await loadGlobal()
  } catch (e) {
    const raw = getApiErrorMessage(e, '加载失败')
    error.value =
      tab.value === 'global'
        ? `数据源暂不可用：${raw}。可切换 CENC/USGS 或稍后重试。`
        : raw
    if (tab.value === 'local') localItems.value = []
    else globalItems.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)

watch(totalPages, (max) => {
  if (page.value > max) page.value = max
})
</script>
