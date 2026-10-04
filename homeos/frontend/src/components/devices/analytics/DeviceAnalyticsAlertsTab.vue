<!--
  @file DeviceAnalyticsAlertsTab.vue
  @module 设备分析面板/异常告警页签
  @description 设备分析 Dashboard 的"告警"子页签：聚合展示异常提示卡（异常活跃/可能遗忘/零使用），
               并以表格形式列出低活跃设备，便于发现长期闲置或异常频繁触发的实体。
               纯展示组件，数据通过 props 透传；点击告警卡或低活跃行触发 filter-entity 事件。
  @dependencies vue、@lucide/vue、DeviceChartHeader、useDeviceAnalyticsDashboardShell
                （提供 hintTypeLabel/hintClass 辅助函数）。
-->
<template>
  <div
    :id="'device-analytics-panel-alerts'"
    role="tabpanel"
    aria-labelledby="device-analytics-tab-alerts"
    class="device-analytics__tab-panel"
  >
    <!-- 顶部四指标卡：异常提示总数 / 异常活跃数 / 可能遗忘数 / 零使用数 -->
    <div class="dev-metric-grid device-analytics__usage-metrics">
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--amber"><AlertCircle class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ summary.anomalyHints.length }}</div>
          <div class="dev-metric__label">{{ '异常提示' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon"><Zap class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ alertCounts.spike }}</div>
          <div class="dev-metric__label">{{ '异常活跃' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--red"><BatteryWarning class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ alertCounts.forgotten }}</div>
          <div class="dev-metric__label">{{ '可能遗忘' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon"><Clock class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ alertCounts.unused }}</div>
          <div class="dev-metric__label">{{ '零使用' }}</div>
        </div>
      </div>
    </div>
    <!-- 告警主面板：上方为异常提示卡网格，无异常时展示健康横幅；下方为低活跃设备排行 -->
      <div class="device-analytics__panel device-analytics__panel--alerts">
      <!-- 异常提示卡网格：遍历 anomalyHints 渲染每条异常，按 type 应用不同样式与跳转 tab -->
        <div v-if="summary.anomalyHints.length" class="device-analytics__alert-grid">
        <div
          v-for="(hint, idx) in summary.anomalyHints"
          :key="`${hint.entityId}-${idx}`"
          :class="['dev-hint-item device-analytics__alert-card', hintClass(hint.type)]"
        >
          <span
            :class="['device-analytics__hint-badge', `device-analytics__hint-badge--${hint.type}`]"
          >
            {{ hintTypeLabel(hint.type) }}
          </span>
          <div class="device-analytics__hint-body">
            <router-link
              :to="{
                path: '/device',
                query: { id: hint.entityId, tab: hint.type === 'forgotten' ? 'usage' : 'overview' },
              }"
              class="dev-rank-table__link"
            >
              {{ entityName(hint.entityId) }}
            </router-link>
            <span>{{ hint.message }}</span>
          </div>
        </div>
      </div>
      <div v-else class="device-analytics__alerts-ok">
        <div class="device-analytics__alerts-ok-banner">
          <HeartPulse class="w-5 h-5 dad-ic-success" />
          <div>
            <strong>{{ '未发现明显异常' }}</strong>
            <p>{{ '当前周期内设备使用模式正常，可继续观察趋势变化' }}</p>
          </div>
        </div>
      </div>
      <!-- 低活跃设备列表：展示切换次数 ≤ lowActivityThreshold 的实体，点击行触发筛选 -->
        <div class="dev-chart-wrap device-analytics__low-activity">
        <DeviceChartHeader
          :icon="Clock"
          icon-class="w-3 h-3 dad-ic-sky"
          title="低活跃设备"
          description="近周期内切换次数极少的实体，便于发现长期未使用的设备。"
          :hint="`切换 ≤ ${lowActivityThreshold} 次`"
        />
        <div
          v-if="!lowActivityDevices.length"
          class="dev-state-block device-analytics__canvas-fallback"
        >
          {{ '暂无低活跃设备记录' }}
        </div>
        <div v-else class="device-analytics__rank-scroll">
          <table class="dev-rank-table">
            <thead>
              <tr>
                <th>{{ '设备' }}</th>
                <th>{{ '次数' }}</th>
                <th>{{ '时长' }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in lowActivityDevices"
                :key="row.entityId"
                class="dev-rank-table__row"
                @click="emit('filter-entity', row.entityId)"
              >
                <td>
                  <router-link
                    :to="{ path: '/device', query: { id: row.entityId, tab: 'usage' } }"
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
import { AlertCircle, Zap, BatteryWarning, Clock, HeartPulse } from '@lucide/vue'
import DeviceChartHeader from '@/components/devices/DeviceChartHeader.vue'
import { hintTypeLabel, hintClass } from '@/composables/device/useDeviceAnalyticsDashboardShell'

// 父组件透传数据：summary.anomalyHints 为异常提示数组，alertCounts 为四类告警计数，
// lowActivityDevices/lowActivityThreshold 用于低活跃表格；entityName/formatRuntime 为格式化辅助。
defineProps<{
  summary: { anomalyHints: Array<{ entityId: string; type: string; message: string }> }
  alertCounts: { spike: number; forgotten: number; unused: number }
  lowActivityDevices: Array<{ entityId: string; onCount: number; totalRuntimeMs: number }>
  lowActivityThreshold: number
  entityName: (id: string) => string
  formatRuntime: (ms: number) => string
}>()

// 点击告警卡或低活跃行时向上冒泡 entity_id，父级据此联动设备列表筛选。
const emit = defineEmits<{
  'filter-entity': [entityId: string]
}>()
</script>
