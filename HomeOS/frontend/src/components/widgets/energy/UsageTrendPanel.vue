/**
 * 能源用量趋势面板 EnergyUsageTrendPanel
 *
 * 所属模块：frontend/widgets/energy
 * 职责：以柱状图展示近 30 日 / 近 12 月的能源（电/气/水）用量趋势，
 *       支持按 category 切换数据源与单位。
 * 依赖：
 *   - vue (computed/ref)
 *   - @/composables/energy/useEnergySource（能源原始数据）
 *   - @/composables/life/useLifeChartHost（useHubChart 图表宿主）
 *   - @/utils/chart/energy-usage-chart.util（图表配置构造与数据解析）
 */
<template>
  <!-- 根容器：仅当存在数据时渲染 -->
  <div v-if="hasSeries" class="eut">
    <div class="eut__head">
      <span class="eut__title">{{ '用量趋势' }}</span>
      <!-- 时间范围切换：近30日 / 近12月 -->
      <div class="eut__tabs">
        <button
          type="button"
          :class="['eut__tab', range === 'day' && 'eut__tab--active']"
          @click="range = 'day'"
        >
          {{ '近30日' }}
        </button>
        <button
          type="button"
          :class="['eut__tab', range === 'month' && 'eut__tab--active']"
          @click="range = 'month'"
        >
          {{ '近12月' }}
        </button>
      </div>
    </div>
    <!-- ECharts 图表容器，由 useHubChart 挂载 -->
    <div ref="chartRef" class="eut__chart" />
  </div>
</template>

<script setup lang="ts">
/**
 * @file UsageTrendPanel.vue
 * @module widgets/energy
 * @description 能源用量趋势面板：按 category（gas/water/grid）与 accountIndex 拉取
 *              日/月用量列表，绘制柱状趋势图，支持日/月范围切换。
 * @dependencies
 *  - vue: computed/ref/watch 响应式与监听
 *  - @/composables/energy/useEnergySource: 能源数据访问器
 *  - @/composables/life/useLifeChartHost: ECharts 实例托管
 *  - @/utils/chart/energy-usage-chart.util: 用量图表配置构建与数据解析
 *  - @/services/api/energy: 日/月用量接口
 */
import { computed, ref, watch } from 'vue'
import { useEnergySource } from '@/composables/energy/useEnergySource'
import { useHubChart } from '@/composables/life/useLifeChartHost'
import {
  buildEnergyUsageChartOption,
  parseEnergyUsageList,
  usageUnitForCategory,
} from '@/utils/chart/energy-usage-chart.util'
import { getEnergyUsageDaily, getEnergyUsageMonthly } from '@/services/api/energy'

/**
 * 组件 Props。
 * @property {string} category - 能源类别，gas / water / grid（必填）
 * @property {number} accountIndex - 多账户索引，默认 0
 * @property {string} accent - 主题色（CSS 颜色值），默认 #fbbf24
 */
const props = defineProps({
  category: { type: String, required: true },
  accountIndex: { type: Number, default: 0 },
  accent: { type: String, default: '#fbbf24' },
})

// 时间范围：day / month
const range = ref<'day' | 'month'>('day')
// 图表容器引用，供 useHubChart 挂载
const chartRef = ref(null)
// 获取能源原始数据访问器（raw 用于读取 daylist/monthlist；primaryEntityId 取计量实体 ID）
const { raw, primaryEntityId } = useEnergySource()

/**
 * 规范化能源类别：仅接受 gas / water，其余统一归为 grid（电网）。
 * @returns {string} 规范化后的类别
 */
const cat = computed(() => {
  const c = props.category
  return c === 'gas' || c === 'water' ? c : 'grid'
})

// 本地聚合数据（仅电）：由后端 EnergyUsageDaily / EnergyUsageMonthly 供给，无 Redis 时作为主数据源
interface UsageChartItem {
  _label: string
  _usage: number
  _cost: number
  _usageStr: string
  _costStr: string
  _time: string
}
const aggDayItems = ref<UsageChartItem[]>([])
const aggMonthItems = ref<UsageChartItem[]>([])

/**
 * 将后端日聚合点映射为图表条目（复用 UtilityMeterParsedItem 形状）。
 */
function toDayItems(points: Array<{ day: string; ele: number }>) {
  return points
    .slice()
    .sort((a, b) => String(a.day).localeCompare(String(b.day)))
    .map((p) => {
      const ele = Number(p.ele) || 0
      return {
        _label: String(p.day),
        _usage: ele,
        _cost: 0,
        _usageStr: ele > 0 ? ele.toFixed(1) : '--',
        _costStr: '--',
        _time: String(p.day),
      }
    })
}

/**
 * 将后端月聚合点映射为图表条目（复用 UtilityMeterParsedItem 形状）。
 */
function toMonthItems(points: Array<{ month: string; ele: number }>) {
  return points
    .slice()
    .sort((a, b) => String(a.month).localeCompare(String(b.month)))
    .map((p) => {
      const ele = Number(p.ele) || 0
      return {
        _label: String(p.month),
        _usage: ele,
        _cost: 0,
        _usageStr: ele > 0 ? ele.toFixed(1) : '--',
        _costStr: '--',
        _time: String(p.month),
      }
    })
}

/**
 * 加载本地聚合（仅电）：成功后写入 agg refs；
 * 接口抛错或返回空 points 时置空，由 daySeries / monthSeries 回退到原始 utility_meter 属性路径。
 * @returns {Promise<void>}
 */
async function loadAggregates() {
  const entityId = cat.value === 'grid' ? primaryEntityId(cat.value, props.accountIndex) : ''
  if (!entityId) {
    aggDayItems.value = []
    aggMonthItems.value = []
    return
  }
  try {
    const [daily, monthly] = await Promise.all([
      getEnergyUsageDaily(entityId, 30),
      getEnergyUsageMonthly(entityId, 12),
    ])
    aggDayItems.value = toDayItems(daily.points || [])
    aggMonthItems.value = toMonthItems(monthly.points || [])
  } catch {
    // 聚合接口异常时静默回退到原始属性路径（不阻塞面板渲染）
    aggDayItems.value = []
    aggMonthItems.value = []
  }
}

// 类别 / 账户切换时重新加载聚合；grid 无计量实体或接口异常时自动走回退
watch(
  () => [cat.value, props.accountIndex, primaryEntityId(cat.value, props.accountIndex)],
  () => {
    void loadAggregates()
  },
  { immediate: true },
)

/**
 * 解析近 30 日用量序列：grid 优先使用本地聚合，否则解析原始 daylist 属性（gas/water 仅走原始属性）。
 * @returns {Array} 用量数据点数组
 */
const daySeries = computed(() => {
  if (cat.value === 'grid' && aggDayItems.value.length > 0) return aggDayItems.value
  return parseEnergyUsageList(raw(cat.value, 'daylist', props.accountIndex), cat.value, 'day')
})
/**
 * 解析近 12 月用量序列：grid 优先使用本地聚合，否则解析原始 monthlist 属性（gas/water 仅走原始属性）。
 * @returns {Array} 用量数据点数组
 */
const monthSeries = computed(() => {
  if (cat.value === 'grid' && aggMonthItems.value.length > 0) return aggMonthItems.value
  return parseEnergyUsageList(raw(cat.value, 'monthlist', props.accountIndex), cat.value, 'month')
})
/**
 * 当前激活的用量序列：根据 range 选择日或月序列。
 * @returns {Array} 当前用量数据点数组
 */
const activeSeries = computed(() => (range.value === 'day' ? daySeries.value : monthSeries.value))
/**
 * 是否存在任何可用数据（控制根容器渲染）。
 * @returns {boolean}
 */
const hasSeries = computed(() => daySeries.value.length > 0 || monthSeries.value.length > 0)

// 通过 useHubChart 将图表配置绑定到 chartRef，依赖变化时自动重绘
useHubChart(
  chartRef,
  () =>
    buildEnergyUsageChartOption(
      activeSeries.value,
      usageUnitForCategory(cat.value),
      range.value,
      props.accent,
    ),
  [activeSeries, range, () => props.accent],
)
</script>

<style scoped>
.eut {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: var(--hos-panel-padding-compact-y) var(--hos-panel-padding-compact-x);
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(0, 0, 0, 0.16);
}

.eut__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.eut__title {
  font-size: var(--premium-fs-micro);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.55);
}

.eut__tabs {
  display: flex;
  gap: 4px;
}

.eut__tab {
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: transparent;
  color: var(--hos-text-secondary);
  font-size: var(--premium-fs-micro);
  font-weight: 650;
  cursor: pointer;
}

.eut__tab--active {
  color: #fcd34d;
  border-color: rgba(251, 191, 36, 0.28);
  background: rgba(251, 191, 36, 0.1);
}

.eut__chart {
  width: 100%;
  height: 140px;
  min-height: 140px;
}
</style>
