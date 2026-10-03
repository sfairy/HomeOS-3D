<template>
  <div class="et-root">
    <!-- 工具栏：标题、时间范围选择、导出按钮 -->
    <div :class="['et-toolbar', embedded && 'et-toolbar--embedded']">
      <div v-if="!embedded" class="et-header-left">
        <TrendingUp class="w-3.5 h-3.5 et-icon" />
        <span class="et-title">{{ '环境趋势' }}</span>
      </div>
      <div v-else class="et-toolbar-label">{{ '温湿度走势' }}</div>
      <div class="et-header-actions">
        <!-- 时间范围切换：近 7/14/30 天 -->
        <HosSelect variant="widget" v-model.number="days">
          <option :value="7">{{ '近 7 天' }}</option>
          <option :value="14">{{ '近 14 天' }}</option>
          <option :value="30">{{ '近 30 天' }}</option>
        </HosSelect>
        <!-- 导出 CSV：无数据时禁用 -->
        <button
          type="button"
          class="et-export"
          :disabled="exporting || trend.length === 0"
          @click="exportCsv"
        >
          {{ exporting ? '…' : '导出' }}
        </button>
      </div>
    </div>

    <div class="et-body">
      <!-- API 查询状态容器：tone=violet 紫色主题 -->
      <ApiQueryState
        :loading="loading"
        :error="loadError"
        :degraded="query.degraded"
        tone="violet"
        error-title="环境趋势加载失败"
        @retry="query.retry()"
      >
        <template #default>
          <div class="et-layout">
            <!-- 左侧：季节提醒与 KPI 卡片 -->
            <aside class="et-aside">
              <!-- 未绑定传感器时的占位提醒 -->
              <div
                v-if="seasonal.reason === 'no_sensors' && !seasonal.tips?.length"
                class="et-tips et-tips--muted"
              >
                <div class="et-tips-head">
                  <Sparkles class="w-3 h-3 et-sparkles" />
                  <span>{{ '季节提醒' }}</span>
                </div>
                <div class="et-tip">{{ '未绑定环境传感器，无法生成个性化提醒' }}</div>
              </div>
              <!-- 有季节提醒时按条目展示 -->
              <div v-else-if="seasonal.tips?.length" class="et-tips">
                <div class="et-tips-head">
                  <Sparkles class="w-3 h-3 et-sparkles" />
                  <span>{{ `${seasonal.season || ''}季提醒` }}</span>
                </div>
                <div v-for="(tip, i) in seasonal.tips" :key="i" class="et-tip">{{ tip }}</div>
              </div>

              <!-- KPI 卡片：均温 / 均湿 / 温差 -->
              <div v-if="kpiCards.length" class="et-kpis et-kpis--stack">
                <div v-for="k in kpiCards" :key="k.label" class="et-kpi">
                  <span class="et-kpi__label">{{ k.label }}</span>
                  <div class="et-kpi__main">
                    <span class="et-kpi__val" :style="{ color: k.color }">{{ k.value }}</span>
                    <span v-if="k.unit" class="et-kpi__unit">{{ k.unit }}</span>
                  </div>
                </div>
              </div>
            </aside>

            <!-- 右侧：图表主体或空态 -->
            <section class="et-main">
              <VEmptyState
                v-if="trend.length === 0"
                compact
                tone="emerald"
                :title="emptyHint"
                :description="'绑定温湿度传感器并保存环境配置后，系统会按房间持续采样。'"
              />
              <div v-else ref="chartRef" class="et-echart" />
            </section>
          </div>
        </template>
      </ApiQueryState>
    </div>
  </div>
</template>
<script setup>
/**
 * @file EnvTrendPanel.vue
 * @module widgets/climate
 * @description 环境趋势面板：按天展示温湿度均值走势，并叠加季节性提醒与 KPI 卡片。
 *              支持近 7/14/30 天范围切换与 CSV 导出，依赖 Redis 持久化历史采样数据。
 *
 * API:
 *  - GET /environment/trend?days=N   趋势数据
 *  - GET /environment/seasonal-tips  季节提醒
 *  - GET /environment/export          导出 CSV
 *
 * @dependencies
 *  - vue: ref/computed/watch 响应式与监听
 *  - @/components/common/base/HosSelect.vue: 下拉选择
 *  - @/composables/api/useWidgetApiQuery: Widget 数据查询 composable
 *  - @/stores/entities.store: 实体状态（用于 Redis 状态判断）
 *  - @/components/common/ApiQueryState.vue: 通用查询状态容器
 *  - @/components/common/base/VEmptyState.vue: 空态组件
 *  - @lucide/vue: TrendingUp/Sparkles 图标
 *  - @/composables/life/useLifeChartHost: ECharts 实例托管
 *  - @/utils/chart/env-energy-hub-charts.util: 趋势图 ECharts 配置构建
 *  - @/services/api/system: 趋势、提醒、导出接口
 *  - @/services/notify: 错误通知
 *  - @/utils/telemetry/redis-status: Redis 状态判断
 *  - @/utils/core/misc.util: Blob 下载工具
 */
import HosSelect from '@/components/common/base/HosSelect.vue'
import { ref, computed, watch } from 'vue'
import { useWidgetApiQuery } from '@/composables/api/useWidgetApiQuery'
import { useEntitiesStore } from '@/stores/entities.store'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import { TrendingUp, Sparkles } from '@lucide/vue'
import { useHubChart } from '@/composables/life/useLifeChartHost'
import { buildEnvTrendHubOption } from '@/utils/chart/env-energy-hub-charts.util'

import { fetchEnvTrend, fetchEnvSeasonalTips, exportEnvData } from '@/services/api/system'
import { notifyError } from '@/services/notify'
import { isRedisReadyStatus, isRedisUnavailableStatus } from '@/utils/telemetry/redis-status'
import { downloadBlob } from '@/utils/core/misc.util'

const props = defineProps({
  embedded: { type: Boolean, default: false },
  panelVisible: { type: Boolean, default: true },
})

const entitiesStore = useEntitiesStore()
// 是否正在导出 CSV
const exporting = ref(false)
// 当前选中的时间范围（天数）
const days = ref(7)
// ECharts 容器 DOM 引用
const chartRef = ref(null)

// 数据查询：并行拉取趋势与季节提醒，每 5 分钟刷新一次；仅面板可见时轮询
const query = useWidgetApiQuery(
  'envTrend',
  async () => {
    const [trendRes, tipsRes] = await Promise.all([
      fetchEnvTrend({ days: days.value }),
      fetchEnvSeasonalTips(),
    ])
    const trend = Array.isArray(trendRes.data) ? trendRes.data : []
    const seasonal = tipsRes?.data || {}
    return {
      data: { trend, seasonal },
      meta: {
        // 当未绑定传感器或 Redis 不可用时标记为降级
        degraded:
          seasonal?.reason === 'no_sensors' || isRedisUnavailableStatus(entitiesStore.redisStatus),
        reason: seasonal?.reason,
      },
    }
  },
  300_000,
  {
    pollKey: 'widget:EnvTrendPanel',
    panelVisible: () => props.panelVisible !== false,
  },
)

const loading = query.loading
const loadError = query.error
// 趋势数据数组
const trend = computed(() => query.data?.value?.trend || [])
// 季节提醒对象
const seasonal = computed(() => query.data?.value?.seasonal || {})

/**
 * 计算 KPI 卡片：均温、均湿、温差（温差需至少 2 个采样点）。
 * @returns {Array<{label:string,value:string,unit:string,color:string}>} KPI 卡片数组
 */
const kpiCards = computed(() => {
  const rows = trend.value.filter((d) => d.avgTemperature != null || d.avgHumidity != null)
  if (!rows.length) return []
  const temps = rows.map((d) => d.avgTemperature).filter((v) => v != null)
  const hums = rows.map((d) => d.avgHumidity).filter((v) => v != null)
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
  const tAvg = avg(temps)
  const hAvg = avg(hums)
  const cards = []
  if (tAvg != null) {
    cards.push({
      label: '均温',
      value: tAvg.toFixed(1),
      unit: '°C',
      color: '#fb7185',
    })
  }
  if (hAvg != null) {
    cards.push({
      label: '均湿',
      value: Math.round(hAvg).toString(),
      unit: '%',
      color: '#38bdf8',
    })
  }
  if (temps.length >= 2) {
    cards.push({
      label: '温差',
      value: (Math.max(...temps) - Math.min(...temps)).toFixed(1),
      unit: '°C',
      color: '#fbbf24',
    })
  }
  return cards
})

/**
 * 空态提示：根据 Redis 状态给出更具针对性的文案。
 * @returns {string} 空态标题文案
 */
const emptyHint = computed(() => {
  if (isRedisUnavailableStatus(entitiesStore.redisStatus)) {
    return '暂无环境历史（Redis 未就绪，趋势数据无法持久化）'
  }
  return '暂无环境历史数据（等待 EnvironmentHistory 采集）'
})

// 通过 useHubChart 托管 ECharts 实例，依赖 trend 与 days 变化时自动重建
const { schedule: scheduleChart } = useHubChart(
  chartRef,
  () => buildEnvTrendHubOption(trend.value),
  [trend, days],
)

// 加载结束、图表 DOM 刚挂上时再调度一次，避免 loading 骨架期间尺寸为 0 导致放弃渲染
watch(loading, (v) => {
  if (!v && trend.value.length) scheduleChart()
})

/**
 * 导出当前时间范围的 CSV 文件。
 * 调用 exportEnvData 接口以 blob 形式返回，并通过 downloadBlob 触发浏览器下载。
 * @returns {Promise<void>}
 * @throws {Error} 导出失败时通过 notifyError 提示
 */
async function exportCsv() {
  exporting.value = true
  try {
    const { data } = await exportEnvData({
      params: { days: days.value },
      responseType: 'blob',
    })
    downloadBlob(
      new Blob([data], { type: 'text/csv;charset=utf-8' }),
      `env-trend-${days.value}d.csv`,
    )
  } catch (e) {
    notifyError(e, '操作失败')
  } finally {
    exporting.value = false
  }
}

// 时间范围切换时重新拉取数据
watch(days, () => {
  void query.execute()
})

// Redis 恢复就绪时立即重试一次查询，避免长时间空态
watch(
  () => entitiesStore.redisStatus,
  (status) => {
    if (isRedisReadyStatus(status)) void query.execute()
  },
)
</script>

<style scoped src="./styles/EnvTrendPanel.css"></style>