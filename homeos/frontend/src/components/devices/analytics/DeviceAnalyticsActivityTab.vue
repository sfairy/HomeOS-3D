<!--
  @file DeviceAnalyticsActivityTab.vue
  @module 设备分析面板/活跃度页签
  @description 设备分析 Dashboard 的"活跃度"子页签：展示最活跃设备指标卡、活动热力图与
               Top 15 设备切换次数排行。
               纯展示组件，所有数据与图表绑定函数均通过 props 透传，本身不持有状态。
               用户点击热力图或排行行时，通过 filter-entity 事件将 entity_id 冒泡至父级用于筛选。
  @dependencies vue（ComponentPublicInstance 类型）、@lucide/vue、DeviceChartHeader、
                DEVICE_CHART_COPY（图表文案常量）。
-->
<template>
  <div
    :id="'device-analytics-panel-activity'"
    role="tabpanel"
    aria-labelledby="device-analytics-tab-activity"
    class="device-analytics__tab-panel"
  >
    <!-- 顶部三指标卡：最高切换次数 / 排行设备数 / 全站日均切换 -->
    <div class="dev-metric-grid device-analytics__usage-metrics device-analytics__usage-metrics--3">
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--amber"><Flame class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ topActiveDevice?.onCount ?? '—' }}</div>
          <div class="dev-metric__label">{{ '最高切换' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon"><BarChart3 class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ summary.topDevices.length }}</div>
          <div class="dev-metric__label">{{ '排行设备' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--green"><TrendingUp class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ usageTotals.avgDaily }}</div>
          <div class="dev-metric__label">{{ '全站日均' }}</div>
        </div>
      </div>
    </div>
    <!-- 最活跃设备高亮条：展示当前周期切换次数最多的实体，点击可触发筛选 -->
    <div v-if="topActiveDevice" class="device-analytics__highlight-bar">
      <Flame class="w-3.5 h-3.5 dad-ic-amber" />
      <span>{{ '最活跃' }}：</span>
      <button
        type="button"
        class="device-analytics__highlight-link"
        @click="emit('filter-entity', topActiveDevice.entityId)"
      >
        {{ entityName(topActiveDevice.entityId) }}
      </button>
      <span class="device-analytics__highlight-meta">{{
        `${topActiveDevice.onCount} 次 · ${formatRuntime(topActiveDevice.totalRuntimeMs)}`
      }}</span>
    </div>
    <!-- 活跃度主面板：左侧为按日切换次数热力图，右侧为设备排行表 -->
      <div class="device-analytics__panel device-analytics__panel--activity">
      <div class="dev-chart-wrap device-analytics__chart-main">
        <DeviceChartHeader
          :icon="Flame"
          icon-class="w-3 h-3 dad-ic-amber"
          :title="DEVICE_CHART_COPY.activityHeatmap.title"
          :description="DEVICE_CHART_COPY.activityHeatmap.desc"
          hint="点击定位设备"
        />
        <div
          v-if="!heatmapDevices.length"
          class="dev-state-block device-analytics__canvas-fallback"
        >
          {{ '暂无活跃设备数据' }}
        </div>
        <div v-else :ref="bindHeatmapChart" class="dev-chart-canvas device-analytics__canvas"></div>
      </div>
      <div class="dev-chart-wrap device-analytics__rank-panel">
        <DeviceChartHeader
          :icon="BarChart3"
          icon-class="w-3 h-3 dad-ic-sky"
          :title="DEVICE_CHART_COPY.activityRank.title"
          :description="DEVICE_CHART_COPY.activityRank.desc"
          :hint="`Top ${Math.min(15, summary.topDevices.length)}`"
        />
        <div class="device-analytics__rank-scroll">
          <table class="dev-rank-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{{ '设备' }}</th>
                <th>{{ '次数' }}</th>
                <th>{{ '时长' }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, idx) in summary.topDevices.slice(0, 15)"
                :key="row.entityId"
                class="dev-rank-table__row"
                @click="emit('filter-entity', row.entityId)"
              >
                <td>{{ idx + 1 }}</td>
                <td>
                  <router-link
                    :to="{ path: '/device', query: { id: row.entityId } }"
                    class="dev-rank-table__link"
                    @click.stop
                  >
                    {{ entityName(row.entityId) }}
                  </router-link>
                </td>
                <td>{{ row.onCount }}</td>
                <td>{{ formatRuntime(row.totalRuntimeMs) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { Flame, BarChart3, TrendingUp } from '@lucide/vue'
import DeviceChartHeader from '@/components/devices/DeviceChartHeader.vue'
import { DEVICE_CHART_COPY } from '@/utils/chart/device-chart-copy.util'

// 父组件透传的展示数据与回调：summary 含 Top 设备列表，heatmapDevices 用于热力图渲染，
// bindHeatmapChart 为 ECharts 实例绑定的 ref 回调，entityName/formatRuntime 为格式化辅助函数。
defineProps<{
  summary: { topDevices: Array<{ entityId: string; onCount: number; totalRuntimeMs: number }> }
  usageTotals: { avgDaily: number }
  topActiveDevice: { entityId: string; onCount: number; totalRuntimeMs: number } | null | undefined
  heatmapDevices: Array<{ entityId: string; daily: Array<{ day: string; onCount: number }> }>
  bindHeatmapChart: (el: Element | ComponentPublicInstance | null) => void
  entityName: (id: string) => string
  formatRuntime: (ms: number) => string
}>()

// 点击实体时向上冒泡 entity_id，父级据此联动设备列表筛选。
const emit = defineEmits<{
  'filter-entity': [entityId: string]
}>()
</script>
