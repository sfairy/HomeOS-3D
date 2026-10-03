<!--
  UsageHeatmap.vue / components/widgets/device
  设备使用热力图：智能顾问/设备 Hub 下的 Top 使用排名卡片，
  统计每个实体过去 24h/7d 的触发次数与时长条形百分比，支持按开关手动刷新。
  Props: embedded 嵌入态隐藏标题与刷新按钮 / days 回看天数（默认 7）
         / max-items 展示上限
  依赖：services/api/advisor fetchUsageReport 统计接口；
        composables/widget/useScheduledPoll 5min 周期刷新；
        Pinia: useEntitiesStore 实体名查询；
        子组件：ApiQueryState + VProgressBar 百分比条；
        utils: error-message + notifyError 错误处理。
  注意：报告仅返回有触发记录的前 N 实体，空态时显示等待数据。
-->
<template>
  <div class="hm-card">
    <div v-if="!embedded" class="hm-header">
      <BarChart3 class="w-3.5 h-3.5 hm-icon" />
      <span class="hm-title">{{ '设备使用' }}</span>
      <span class="hm-sub">{{ '切换次数' }}</span>
      <button
        type="button"
        class="hm-refresh"
        :disabled="loading"
        :aria-label="loading ? '刷新中' : '刷新使用统计'"
        @click="fetchReport"
      >
        <RefreshCw :class="['w-3 h-3', loading && 'animate-spin']" />
      </button>
    </div>
    <div class="hm-body">
      <ApiQueryState
        :loading="loading"
        :error="loadError"
        error-title="设备使用统计加载失败"
        tone="violet"
        @retry="fetchReport"
      >
        <VEmptyState
          v-if="devices.length === 0"
          compact
          tone="neutral"
          :title="'暂无使用统计'"
          :description="'系统正在收集设备切换数据'"
        />
        <div v-else class="hm-list">
          <div v-for="d in devices" :key="d.id" class="hm-item">
            <div class="hm-item-left">
              <div :class="['hm-dot', d.on ? 'hm-dot--on' : 'hm-dot--off']" />
              <span class="hm-name">{{ d.name }}</span>
            </div>
            <div class="hm-item-right">
              <div class="hm-bar">
                <VProgressBar :value="d.pct" variant="purple" size="xs" />
              </div>
              <span class="hm-dur">{{ d.short }}</span>
            </div>
          </div>
        </div>
      </ApiQueryState>
    </div>
  </div>
</template>

<script setup>
/**
 * @file UsageHeatmap.vue
 * @module widgets/device
 * @description 设备使用统计热图：拉取 advisor 服务的 Top 设备切换次数报告，
 *              以进度条形式展示高频使用设备，并叠加当前开关状态。
 * @dependencies
 *  - vue: ref/computed/watch 响应式与监听
 *  - @/composables/widget/useScheduledPoll: 定时轮询
 *  - @lucide/vue: BarChart3 / RefreshCw 图标
 *  - @/stores/entities.store: 实体状态（用于叠加开关状态）
 *  - @/services/api/advisor: 使用统计接口
 *  - @/components/common/ApiQueryState.vue: 查询状态容器
 *  - @/components/common/base/VProgressBar.vue: 进度条组件
 *  - @/utils/core/error-message: 错误信息提取
 *  - @/services/notify: 错误通知
 *  - @/utils/entity/derived.util: 实体友好名生成
 */
import { ref, computed, watch } from 'vue'
import { useScheduledPoll } from '@/composables/widget/useScheduledPoll'
import { BarChart3, RefreshCw } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { fetchUsageReport } from '@/services/api/advisor'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import VProgressBar from '@/components/common/base/VProgressBar.vue'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { notifyError } from '@/services/notify'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

const props = defineProps({
  embedded: { type: Boolean, default: false },
  panelVisible: { type: Boolean, default: true },
})

const entitiesStore = useEntitiesStore()
const loading = ref(true)
const loadError = ref('')
const report = ref({ topDevices: [], totalDevices: 0 })

async function fetchReport(opts = {}) {
  if (!props.panelVisible) return
  const { quiet = false } = opts
  loading.value = true
  loadError.value = ''
  try {
    const data = await fetchUsageReport()
    report.value = data || { topDevices: [], totalDevices: 0 }
  } catch (e) {
    report.value = { topDevices: [], totalDevices: 0 }
    loadError.value = getApiErrorMessage(e, '请检查网络或稍后重试')
    if (quiet) notifyError(e, '加载失败', { silent: true })
    else notifyError(e, '加载失败')
  } finally {
    loading.value = false
  }
}

const devices = computed(() => {
  const top = report.value.topDevices || []
  if (!top.length) return []
  const max = Math.max(...top.map((d) => d.onCount), 1)
  return top.map((d) => {
    const ent = entitiesStore.entities[d.entityId]
    const isOn =
      ent?.state === 'on' || (ent?.state && ent.state !== 'off' && ent.state !== 'unavailable')
    return {
      id: d.entityId,
      name: getEntityDisplayName(d.entityId, ent),
      on: isOn,
      pct: Math.round((d.onCount / max) * 100),
      short: `${d.onCount}x`,
    }
  })
})

watch(
  () => props.panelVisible,
  (visible) => {
    if (visible) void fetchReport({ quiet: true })
  },
  { immediate: true },
)

useScheduledPoll(() => fetchReport({ quiet: true }), 5 * 60 * 1000, {
  key: 'widget:DeviceUsageHeatmap',
  immediate: false,
})
</script>

<style scoped src="./styles/UsageHeatmap.css"></style>
