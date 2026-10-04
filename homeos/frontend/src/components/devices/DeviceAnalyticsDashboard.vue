<!--
  @file DeviceAnalyticsDashboard.vue
  @module 设备分析/总览仪表盘
  @description 设备分析总览仪表盘：通过 Tab 切换总览/活跃度/健康/告警四个子页签，
               顶部提供时间范围切换（天数）、刷新与导出 CSV。加载/错误/空状态分别处理。
               所有数据与图表绑定函数由 useDeviceAnalyticsDashboardShell 组合式函数统一管理，
               子页签点击实体/域时通过 filter-entity/filter-domain 事件冒泡至父级联动筛选。
  @dependencies vue（toRef）、@lucide/vue、VSkeleton、analytics 子目录四个 Tab 组件、
                useDeviceAnalyticsDashboardShell。
-->

<template>
  <div ref="rootRef" class="device-analytics">
    <div class="device-analytics__chrome">
      <nav class="list-page__tabs device-analytics__tabs" role="tablist" :aria-label="'分析视图'">
        <button
          v-for="tab in analyticsTabs"
          :key="tab.id"
          type="button"
          role="tab"
          :id="`device-analytics-tab-${tab.id}`"
          :aria-selected="activeTab === tab.id"
          :aria-controls="`device-analytics-panel-${tab.id}`"
          :class="['list-page__tab', activeTab === tab.id && 'list-page__tab--on']"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
          <span v-if="tab.count != null" class="list-page__tab-count">{{ tab.count }}</span>
        </button>
      </nav>
      <!-- 工具栏操作：设备数与周期提示 chip + 范围切换 + 刷新 + 导出 -->
      <div class="device-analytics__chrome-actions">
        <span v-if="summary.totalDevices && hasData" class="device-analytics__meta-chip">
          {{ `${summary.totalDevices} 设备有记录 · ${periodLabel}` }}
        </span>
        <div class="dev-range">
          <button
            v-for="r in rangeOptions"
            :key="r.value"
            type="button"
            :class="['dev-range__btn', days === r.value && 'dev-range__btn--active']"
            @click="days = r.value"
          >
            {{ r.label }}
          </button>
          <button
            type="button"
            class="dev-btn-refresh"
            :disabled="loading"
            :aria-label="'刷新'"
            :title="'刷新'"
            @click="reload"
          >
            <RefreshCw :class="['w-3 h-3', loading && 'animate-spin']" />
          </button>
          <button
            type="button"
            class="dev-range__btn"
            :disabled="!summary.topDevices.length"
            @click="exportCsv"
          >
            {{ '导出' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 加载中（且无缓存）：骨架屏占位 -->
    <div v-if="loading && !hasData" class="device-analytics__body">
      <div class="device-analytics__skeleton">
        <VSkeleton v-for="i in 4" :key="`m-${i}`" variant="text" height="48px" />
        <VSkeleton variant="text" height="240px" class="device-analytics__skeleton-chart" />
      </div>
    </div>

    <!-- 加载出错：错误信息与重试按钮 -->
    <div v-else-if="error" class="device-analytics__body">
      <div class="dev-state-block dev-state-block--error">
        <AlertCircle class="w-4 h-4" />
        <span>{{ error }}</span>
        <button type="button" class="dev-range__btn" @click="reload">{{ '重试' }}</button>
      </div>
    </div>

    <!-- 空数据：无统计记录提示 -->
    <div v-else-if="!hasData" class="device-analytics__body">
      <div class="dev-state-block">
        <BarChart3 class="w-5 h-5 opacity-40" />
        <span>{{ '暂无使用统计数据' }}</span>
        <p class="device-analytics__empty-hint">
          {{ '系统会在设备状态变更时自动收集，请稍后再查看' }}
        </p>
      </div>
    </div>

    <div v-else class="device-analytics__body">
      <div class="device-analytics__kpi-strip" role="group" :aria-label="'设备健康概览'">
        <div class="device-analytics__kpi">
          <Layers class="w-3.5 h-3.5 dad-ic-sky" />
          <span class="device-analytics__kpi-value">{{ healthCurrent.total }}</span>
          <span class="device-analytics__kpi-label">{{ '总数' }}</span>
        </div>
        <div class="device-analytics__kpi device-analytics__kpi--green">
          <Wifi class="w-3.5 h-3.5" />
          <span class="device-analytics__kpi-value">{{
            healthCurrent.total - healthCurrent.offline
          }}</span>
          <span class="device-analytics__kpi-label">{{ '在线' }}</span>
        </div>
        <div class="device-analytics__kpi device-analytics__kpi--red">
          <WifiOff class="w-3.5 h-3.5" />
          <span class="device-analytics__kpi-value">{{ healthCurrent.offline }}</span>
          <span class="device-analytics__kpi-label">{{ '离线' }}</span>
        </div>
        <div class="device-analytics__kpi device-analytics__kpi--amber">
          <BatteryWarning class="w-3.5 h-3.5" />
          <span class="device-analytics__kpi-value">{{ healthCurrent.lowBattery }}</span>
          <span class="device-analytics__kpi-label">{{ '低电量' }}</span>
        </div>
      </div>

      <!-- 子页签容器：四个 Tab 组件通过 v-show 切换显示，保持各 Tab 内部状态不销毁 -->
        <div class="device-analytics__tab-stack">
        <DeviceAnalyticsOverviewTab
          v-show="activeTab === 'overview'"
          :summary="summary"
          :usage-totals="usageTotals"
          :bind-trend-chart="bindTrendChart"
          :bind-domain-chart="bindDomainChart"
          :format-runtime="formatRuntime"
          :get-domain-label="getDomainLabel"
          @filter-domain="emit('filter-domain', $event)"
        />
        <DeviceAnalyticsActivityTab
          v-show="activeTab === 'activity'"
          :summary="summary"
          :usage-totals="usageTotals"
          :top-active-device="topActiveDevice"
          :heatmap-devices="heatmapDevices"
          :bind-heatmap-chart="bindHeatmapChart"
          :entity-name="entityName"
          :format-runtime="formatRuntime"
          @filter-entity="emit('filter-entity', $event)"
        />
        <DeviceAnalyticsHealthTab
          v-show="activeTab === 'health'"
          :events-stats="eventsStats"
          :event-domain-entries="eventDomainEntries"
          :health-trend="healthTrend"
          :health-current="healthCurrent"
          :bind-health-trend="bindHealthTrend"
          :bind-events-chart="bindEventsChart"
          :entity-name="entityName"
          @filter-entity="emit('filter-entity', $event)"
        />
        <DeviceAnalyticsAlertsTab
          v-show="activeTab === 'alerts'"
          :summary="summary"
          :alert-counts="alertCounts"
          :low-activity-devices="lowActivityDevices"
          :low-activity-threshold="LOW_ACTIVITY_THRESHOLD"
          :entity-name="entityName"
          :format-runtime="formatRuntime"
          @filter-entity="emit('filter-entity', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { toRef } from 'vue'
import {
  BarChart3,
  RefreshCw,
  AlertCircle,
  Layers,
  Wifi,
  WifiOff,
  BatteryWarning,
} from '@lucide/vue'
import VSkeleton from '@/components/common/base/VSkeleton.vue'
import DeviceAnalyticsOverviewTab from '@/components/devices/analytics/DeviceAnalyticsOverviewTab.vue'
import DeviceAnalyticsActivityTab from '@/components/devices/analytics/DeviceAnalyticsActivityTab.vue'
import DeviceAnalyticsHealthTab from '@/components/devices/analytics/DeviceAnalyticsHealthTab.vue'
import DeviceAnalyticsAlertsTab from '@/components/devices/analytics/DeviceAnalyticsAlertsTab.vue'
import { useDeviceAnalyticsDashboardShell } from '@/composables/device/useDeviceAnalyticsDashboardShell'

// 组件属性：visible 控制是否加载数据与初始化图表。
const props = withDefaults(
  defineProps<{
    visible?: boolean
  }>(),
  {
    visible: true,
  },
)

/**
 * 事件定义：
 * - filter-domain：子页签点击域时冒泡 domain 字符串；
 * - filter-entity：子页签点击实体时冒泡 entity_id。
 */
const emit = defineEmits<{
  'filter-domain': [domain: string]
  'filter-entity': [entityId: string]
}>()

const {
  rootRef,
  days,
  activeTab,
  rangeOptions,
  loading,
  error,
  summary,
  eventsStats,
  healthTrend,
  healthCurrent,
  LOW_ACTIVITY_THRESHOLD,
  hasData,
  periodLabel,
  usageTotals,
  topActiveDevice,
  lowActivityDevices,
  alertCounts,
  heatmapDevices,
  eventDomainEntries,
  analyticsTabs,
  bindTrendChart,
  bindDomainChart,
  bindHeatmapChart,
  bindEventsChart,
  bindHealthTrend,
  reload,
  exportCsv,
  entityName,
  getDomainLabel,
  formatRuntime,
// 分析仪表盘核心组合式函数：统一管理天数、Tab、加载/错误状态、汇总数据、各图表 ref 绑定与刷新/导出。
// onFilterDomain/onFilterEntity 回调将子页签的筛选事件桥接为本组件的 emit。
} = useDeviceAnalyticsDashboardShell({
  visible: toRef(props, 'visible'),
  onFilterDomain: (domain) => emit('filter-domain', domain),
  onFilterEntity: (entityId) => emit('filter-entity', entityId),
})
</script>

<style>
@import './styles/DevicePanels.css';
</style>
