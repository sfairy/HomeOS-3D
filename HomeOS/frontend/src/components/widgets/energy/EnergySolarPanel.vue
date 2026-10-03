<template>
  <div class="energy-solar">
    <!-- 头部：标题 + 刷新按钮 -->
    <header
      :class="['energy-solar__head', embedded && 'energy-solar__head--embedded']"
    >
      <span v-if="!embedded" class="energy-solar__label">{{ '光伏/储能' }}</span>
      <span v-else class="energy-solar__label">{{ '光伏/储能' }}</span>
      <button
        type="button"
        class="energy-solar__refresh"
        :disabled="solar.loading.value"
        @click="solar.retry()"
      >
        {{ '刷新' }}
      </button>
    </header>

    <ApiQueryState
      :loading="solar.loading.value"
      :error="solar.loadError.value"
      error-title="发电监控加载失败"
      @retry="solar.retry()"
    >
      <!-- 未检测到发电/储能实体：卡片隐藏 + 提示文案 -->
      <VEmptyState
        v-if="!solar.configured.value"
        compact
        tone="amber"
        title="未检测到光伏/储能实体"
        description="绑定含 pv_/solar_/inverter 的功率实体或 battery 域储能实体后，此处将展示发电-用电-充电三流数据"
      />

      <template v-else>
        <!-- 发电-用电-充电三流卡片 -->
        <div class="energy-solar__flows">
          <div class="energy-solar__flow energy-solar__flow--gen">
            <span class="energy-solar__flow-icon">
              <Sun class="w-3.5 h-3.5" />
            </span>
            <span class="energy-solar__flow-label">{{ '发电' }}</span>
            <span class="energy-solar__flow-val">{{ fmtPower(solar.currentPowerW.value) }}</span>
            <span class="energy-solar__flow-unit">W</span>
            <span class="energy-solar__flow-sub"
              >今日 {{ fmtKwh(solar.todayGenerationKwh.value) }} kWh</span
            >
          </div>

          <div class="energy-solar__flow energy-solar__flow--use">
            <span class="energy-solar__flow-icon">
              <Zap class="w-3.5 h-3.5" />
            </span>
            <span class="energy-solar__flow-label">{{ '用电' }}</span>
            <span class="energy-solar__flow-val">{{ fmtKwh(solar.todayUsageKwh.value) }}</span>
            <span class="energy-solar__flow-unit">kWh</span>
            <span class="energy-solar__flow-sub">{{ '今日用电' }}</span>
          </div>

          <div class="energy-solar__flow energy-solar__flow--charge">
            <span class="energy-solar__flow-icon">
              <BatteryCharging class="w-3.5 h-3.5" />
            </span>
            <span class="energy-solar__flow-label">{{ '充电' }}</span>
            <span class="energy-solar__flow-val">{{ fmtPower(solar.chargePowerW.value) }}</span>
            <span class="energy-solar__flow-unit">W</span>
            <span class="energy-solar__flow-sub"
              >SOC {{ solar.batterySoc.value != null ? `${solar.batterySoc.value}%` : '--' }}</span
            >
          </div>
        </div>

        <!-- 电池 SOC + 自消纳率 -->
        <div class="energy-solar__meta">
          <div class="energy-solar__meta-item">
            <span class="energy-solar__meta-label">{{ '储能电量' }}</span>
            <span class="energy-solar__meta-val">{{
              solar.batterySoc.value != null ? `${solar.batterySoc.value}%` : '--'
            }}</span>
          </div>
          <div class="energy-solar__meta-item">
            <span class="energy-solar__meta-label">{{ '自消纳率' }}</span>
            <span class="energy-solar__meta-val">{{
              solar.selfConsumptionRate.value != null
                ? `${solar.selfConsumptionRate.value}%`
                : '--'
            }}</span>
          </div>
        </div>

        <!-- 储能峰谷调度状态（谷充峰放） -->
        <div
          v-if="solar.batterySoc.value != null || solar.dispatchEnabled.value"
          class="energy-solar__dispatch"
        >
          <span
            :class="[
              'energy-solar__dispatch-badge',
              `energy-solar__dispatch-badge--${solar.period.value}`,
            ]"
          >
            {{
              solar.period.value === 'peak'
                ? '峰段'
                : solar.period.value === 'valley'
                  ? '谷段'
                  : '平段'
            }}
          </span>
          <span class="energy-solar__dispatch-text">
            {{
              solar.dispatchEnabled.value
                ? solar.dispatchStatus.value?.lastActionReason ||
                  '储能峰谷调度已启用，等待时段切换'
                : '储能调度未启用'
            }}
          </span>
          <button
            v-if="solar.dispatchEnabled.value && solar.dispatchStatus.value?.cooldownRemainingSec"
            type="button"
            class="energy-solar__dispatch-cd"
            :title="`调度冷却剩余 ${solar.dispatchStatus.value.cooldownRemainingSec}s`"
          >
            {{ `${Math.ceil(solar.dispatchStatus.value.cooldownRemainingSec / 60)}min` }}
          </button>
          <button
            v-if="canRunDispatch && solar.dispatchEnabled.value"
            type="button"
            class="energy-solar__dispatch-run"
            :disabled="solar.dispatchRunning.value"
            @click="onRunDispatch"
          >
            {{ solar.dispatchRunning.value ? '调度中…' : '立即调度' }}
          </button>
        </div>
        <p v-if="solar.dispatchRunError.value" class="energy-solar__dispatch-error">
          {{ solar.dispatchRunError.value }}
        </p>

        <!-- 发电量趋势（日/周聚合） -->
        <div class="energy-solar__chart-block">
          <div class="energy-solar__chart-head">
            <h4>{{ range === 'day' ? '近 7 日发电量' : '近 4 周发电量' }}</h4>
            <div class="energy-solar__seg">
              <button
                type="button"
                :class="['energy-solar__seg-btn', range === 'day' && 'energy-solar__seg-btn--on']"
                @click="range = 'day'"
              >
                {{ '日' }}
              </button>
              <button
                type="button"
                :class="['energy-solar__seg-btn', range === 'week' && 'energy-solar__seg-btn--on']"
                @click="range = 'week'"
              >
                {{ '周' }}
              </button>
            </div>
          </div>
          <div ref="chartRef" class="energy-solar__chart" />
        </div>
      </template>
    </ApiQueryState>
  </div>
</template>

<script setup>
/**
 * @file EnergySolarPanel.vue
 * @module widgets/energy
 * @description 光伏/储能监控面板：展示当前发电功率、储能电量、峰谷调度状态与发电量趋势，
 *              管理员可触发「立即调度」；通过 useEnergySolar 5 分钟轮询刷新数据。
 * @dependencies
 *  - vue: computed/ref/watch 响应式与监听
 *  - @lucide/vue: Sun / Zap / BatteryCharging 图标
 *  - @/components/common/ApiQueryState.vue: 查询状态容器
 *  - @/components/common/base/VEmptyState.vue: 空态组件
 *  - @/composables/energy/useEnergySolar: 光伏/储能数据源 composable
 *  - @/stores/auth.store: 鉴权状态（判断 admin 角色）
 *  - @/services/notify: 错误通知
 *  - @/composables/life/useLifeChartHost: ECharts 实例托管
 *  - @/utils/chart/life-charts.util: 图表基础配置与 tooltip
 */
import { computed, ref, watch } from 'vue'
import { Sun, Zap, BatteryCharging } from '@lucide/vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import { useEnergySolar } from '@/composables/energy/useEnergySolar'
import { useAuthStore } from '@/stores/auth.store'
import { notifyError } from '@/services/notify'
import { useHubChart } from '@/composables/life/useLifeChartHost'
import { lifeChartBase, lifeChartTooltip } from '@/utils/chart/life-charts.util'
import './styles/EnergySolarPanel.css'

const props = defineProps({
  embedded: { type: Boolean, default: false },
  panelVisible: { type: Boolean, default: true },
})

const authStore = useAuthStore()
const canRunDispatch = computed(() => authStore.role === 'admin')

/** 发电监控数据源（5 分钟轮询，面板可见时刷新） */
const solar = useEnergySolar({ panelVisible: () => props.panelVisible })

async function onRunDispatch() {
  try {
    await solar.runDispatchOnce()
  } catch (e) {
    notifyError(e, '储能调度')
  }
}

/** 趋势粒度：日 / 周 */
const range = ref('day')
/** 图表容器引用 */
const chartRef = ref(null)

/** 当前粒度对应的聚合点（近 7 日 / 近 4 周） */
const chartPoints = computed(() =>
  range.value === 'day' ? solar.dayHistory.value : solar.weekHistory.value,
)

/** 功率格式化：≥1000 W 显示 kW */
function fmtPower(w) {
  const n = Number(w) || 0
  if (n >= 1000) return (n / 1000).toFixed(2).replace(/\.?0+$/, '')
  return String(Math.round(n))
}

/** 电量格式化：保留 2 位小数 */
function fmtKwh(kwh) {
  const n = Number(kwh) || 0
  return n.toFixed(2)
}

/** 发电量柱状图 option（绿色渐变，复用 life 图表基础封装） */
function buildSolarBarOption(points) {
  const labels = points.map((p) => p.label)
  const values = points.map((p) => p.value)
  const empty = !values.length
  const tip = lifeChartTooltip('rgba(52, 211, 153, 0.32)')
  return {
    ...lifeChartBase(),
    grid: { left: 34, right: 10, top: 12, bottom: 22 },
    tooltip: { ...tip, trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: empty ? ['—'] : labels,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } },
      axisLabel: {
        color: 'rgba(255,255,255,0.58)',
        fontSize: 9,
        interval: 0,
        rotate: labels.length > 4 ? 24 : 0,
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
      axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
    },
    series: [
      {
        type: 'bar',
        data: empty ? [] : values,
        barWidth: 12,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#34d399' },
              { offset: 1, color: 'rgba(52, 211, 153, 0.28)' },
            ],
          },
        },
      },
    ],
  }
}

useHubChart(chartRef, () => buildSolarBarOption(chartPoints.value), [chartPoints])

// 面板可见时立即执行一次查询
watch(
  () => props.panelVisible,
  (visible) => {
    if (visible) {
      void solar.execute()
      void solar.dispatchRefresh()
    }
  },
  { immediate: true },
)
</script>

<style scoped src="./styles/EnergySolarPanel.css"></style>
