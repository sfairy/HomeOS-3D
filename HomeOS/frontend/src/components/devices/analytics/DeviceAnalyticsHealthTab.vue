<!--
  @file DeviceAnalyticsHealthTab.vue
  @module 设备分析面板/健康趋势页签
  @description 设备分析 Dashboard 的"健康"子页签：展示事件总数、涉及域、当前离线数三项指标，
               并渲染健康趋势折线图、按域事件分布图与高频事件实体排行表。
               纯展示组件，图表实例通过 bindHealthTrend/bindEventsChart ref 回调交由父级 ECharts 管理。
  @dependencies vue（ComponentPublicInstance 类型）、@lucide/vue、DeviceChartHeader、
                DEVICE_CHART_COPY（图表文案常量）。
-->
<template>
  <div
    :id="'device-analytics-panel-health'"
    role="tabpanel"
    aria-labelledby="device-analytics-tab-health"
    class="device-analytics__tab-panel"
  >
    <!-- 顶部三指标卡：事件总数 / 涉及域数量 / 当前离线设备数 -->
    <div class="dev-metric-grid device-analytics__usage-metrics device-analytics__usage-metrics--3">
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--green"><Activity class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ eventsStats.total }}</div>
          <div class="dev-metric__label">{{ '事件总数' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon"><Grid3x3 class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ eventDomainEntries.length }}</div>
          <div class="dev-metric__label">{{ '涉及域' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--red"><HeartPulse class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ healthCurrent.offline }}</div>
          <div class="dev-metric__label">{{ '当前离线' }}</div>
        </div>
      </div>
    </div>
    <!-- 健康主面板：健康趋势图 + 按域事件分布图 + 高频事件实体排行表 -->
      <div class="device-analytics__panel device-analytics__panel--health">
      <div class="dev-chart-wrap">
        <DeviceChartHeader
          :icon="HeartPulse"
          icon-class="w-3 h-3 dad-ic-danger"
          :title="DEVICE_CHART_COPY.healthTrend.title"
          :description="DEVICE_CHART_COPY.healthTrend.desc"
        />
        <div
          v-if="healthTrend.length < 2"
          class="dev-state-block device-analytics__canvas-fallback"
        >
          {{ '数据积累中，需至少 2 天快照' }}
        </div>
        <div v-else :ref="bindHealthTrend" class="dev-chart-canvas device-analytics__canvas"></div>
      </div>
      <div class="dev-chart-wrap">
        <DeviceChartHeader
          :icon="Activity"
          icon-class="w-3 h-3 dad-ic-success"
          :title="DEVICE_CHART_COPY.eventsByDomain.title"
          :description="DEVICE_CHART_COPY.eventsByDomain.desc"
          :hint="eventsStats.total ? `${eventsStats.total} 条` : undefined"
        />
        <div
          v-if="!eventDomainEntries.length"
          class="dev-state-block device-analytics__canvas-fallback"
        >
          {{ '暂无事件数据' }}
        </div>
        <div v-else :ref="bindEventsChart" class="dev-chart-canvas device-analytics__canvas"></div>
      </div>
      <!-- 高频事件实体排行表：展示事件数 Top 12 实体，点击行触发 filter-entity -->
        <div class="dev-chart-wrap device-analytics__events-rank">
        <div class="dev-chart-wrap__title">
          <AlertCircle class="w-3 h-3 dad-ic-amber" />
          <span>{{ '高频事件实体' }}</span>
        </div>
        <div
          v-if="!eventsStats.topEntities.length"
          class="dev-state-block device-analytics__canvas-fallback"
        >
          {{ '暂无实体事件' }}
        </div>
        <div v-else class="device-analytics__rank-scroll">
          <table class="dev-rank-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{{ '实体' }}</th>
                <th>{{ '事件' }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, idx) in eventsStats.topEntities.slice(0, 12)"
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
                <td>{{ row.count }}</td>
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
import { Activity, Grid3x3, HeartPulse, AlertCircle } from '@lucide/vue'
import DeviceChartHeader from '@/components/devices/DeviceChartHeader.vue'
import { DEVICE_CHART_COPY } from '@/utils/chart/device-chart-copy.util'

// 父组件透传数据：eventsStats 含事件总数与 Top 实体，eventDomainEntries 为按域聚合的 [domain,count] 元组，
// healthTrend/healthCurrent 用于健康趋势与离线计数；bindHealthTrend/bindEventsChart 为 ECharts ref 回调。
defineProps<{
  eventsStats: { total: number; topEntities: Array<{ entityId: string; count: number }> }
  eventDomainEntries: Array<[string, number]>
  healthTrend: Array<unknown>
  healthCurrent: { offline: number }
  bindHealthTrend: (el: Element | ComponentPublicInstance | null) => void
  bindEventsChart: (el: Element | ComponentPublicInstance | null) => void
  entityName: (id: string) => string
}>()

// 点击高频事件实体行时向上冒泡 entity_id，父级据此联动设备列表筛选。
const emit = defineEmits<{
  'filter-entity': [entityId: string]
}>()
</script>
