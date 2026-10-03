<!--
  @file DeviceAnalyticsOverviewTab.vue
  @module 设备分析面板/总览页签
  @description 设备分析 Dashboard 的"总览"子页签：展示总切换次数、总运行时长、日均切换、活跃设备数
               四项指标，并渲染全局趋势图、域分布饼图与域使用明细表。
               纯展示组件，图表实例通过 bindTrendChart/bindDomainChart ref 回调交由父级 ECharts 管理。
               点击明细行触发 filter-domain 事件，用于按域筛选设备列表。
  @dependencies vue（ComponentPublicInstance 类型）、@lucide/vue、DeviceChartHeader、
                DEVICE_CHART_COPY（图表文案常量）。
-->
<template>
  <div
    :id="'device-analytics-panel-overview'"
    role="tabpanel"
    aria-labelledby="device-analytics-tab-overview"
    class="device-analytics__tab-panel"
  >
    <!-- 顶部四指标卡：总切换次数 / 总运行时长 / 日均切换 / 活跃设备数 -->
    <div class="dev-metric-grid device-analytics__usage-metrics">
      <div class="dev-metric">
        <div class="dev-metric__icon"><Zap class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ usageTotals.onCount }}</div>
          <div class="dev-metric__label">{{ '总切换次数' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--green"><Clock class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ formatRuntime(usageTotals.totalRuntimeMs) }}</div>
          <div class="dev-metric__label">{{ '总运行时长' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon"><TrendingUp class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ usageTotals.avgDaily }}</div>
          <div class="dev-metric__label">{{ '日均切换' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--amber"><Cpu class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ summary.totalDevices }}</div>
          <div class="dev-metric__label">{{ '活跃设备' }}</div>
        </div>
      </div>
    </div>
    <!-- 总览主面板：左侧全局趋势图，右侧上方域分布饼图、下方域使用明细表 -->
      <div class="device-analytics__panel device-analytics__panel--overview">
      <!-- 全局趋势主图：按日聚合的切换次数折线图 -->
        <div class="dev-chart-wrap device-analytics__chart-main">
        <DeviceChartHeader
          :icon="TrendingUp"
          icon-class="w-3 h-3 dad-ic-sky"
          :title="DEVICE_CHART_COPY.globalTrend.title"
          :description="DEVICE_CHART_COPY.globalTrend.desc"
        />
        <div :ref="bindTrendChart" class="dev-chart-canvas device-analytics__canvas"></div>
      </div>
      <!-- 右侧侧栏：饼图 + 域使用明细表纵向堆叠 -->
        <div class="device-analytics__side-stack">
        <div class="dev-chart-wrap device-analytics__chart-side">
          <DeviceChartHeader
            :icon="Grid3x3"
            icon-class="w-3 h-3 dad-ic-purple"
            :title="DEVICE_CHART_COPY.domainPie.title"
            :description="DEVICE_CHART_COPY.domainPie.desc"
            hint="点击筛选"
          />
          <div :ref="bindDomainChart" class="dev-chart-canvas device-analytics__canvas"></div>
        </div>
        <!-- 域使用明细表：展示各域设备数/切换次数/运行时长，点击行触发 filter-domain -->
          <div class="dev-chart-wrap device-analytics__domain-panel">
          <DeviceChartHeader
            :icon="Layers"
            icon-class="w-3 h-3 dad-ic-cyan"
            title="域使用明细"
            description="各域的活跃设备数、切换次数与运行时长，点击行筛选域。"
          />
          <div class="device-analytics__rank-scroll device-analytics__domain-scroll">
            <table class="dev-rank-table device-analytics__domain-table">
              <thead>
                <tr>
                  <th>{{ '域' }}</th>
                  <th>{{ '设备' }}</th>
                  <th>{{ '次数' }}</th>
                  <th>{{ '时长' }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in summary.domainBreakdown.slice(0, 8)"
                  :key="row.domain"
                  class="dev-rank-table__row"
                  @click="emit('filter-domain', row.domain)"
                >
                  <td>{{ getDomainLabel(row.domain) }}</td>
                  <td>{{ row.deviceCount }}</td>
                  <td>{{ row.onCount }}</td>
                  <td>{{ formatRuntime(row.totalRuntimeMs) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { Zap, Clock, TrendingUp, Cpu, Grid3x3, Layers } from '@lucide/vue'
import DeviceChartHeader from '@/components/devices/DeviceChartHeader.vue'
import { DEVICE_CHART_COPY } from '@/utils/chart/device-chart-copy.util'

// 父组件透传数据：summary.totalDevices/domainBreakdown 为设备总数与按域聚合明细，
// usageTotals 为切换次数/运行时长/日均汇总；bindTrendChart/bindDomainChart 为 ECharts ref 回调，
// formatRuntime/getDomainLabel 为格式化与域标签解析辅助函数。
defineProps<{
  summary: {
    totalDevices: number
    domainBreakdown: Array<{
      domain: string
      deviceCount: number
      onCount: number
      totalRuntimeMs: number
    }>
  }
  usageTotals: { onCount: number; totalRuntimeMs: number; avgDaily: number }
  bindTrendChart: (el: Element | ComponentPublicInstance | null) => void
  bindDomainChart: (el: Element | ComponentPublicInstance | null) => void
  formatRuntime: (ms: number) => string
  getDomainLabel: (domain: string) => string
}>()

// 点击域使用明细行时向上冒泡 domain，父级据此联动设备列表按域筛选。
const emit = defineEmits<{
  'filter-domain': [domain: string]
}>()
</script>
