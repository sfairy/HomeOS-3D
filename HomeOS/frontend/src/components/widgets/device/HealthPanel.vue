<!--
  DeviceHealthPanel.vue / components/widgets/device
  设备健康总览面板：双 tab（设备健康/电池寿命），低电量/离线/信号弱分组卡片，
  电池寿命按厂商预测衰减率、首换建议与列表百分比进度条，附 HA 降级提示。
  Props: embedded 嵌入态时隐藏 hub header / defaultTab 默认 tab key
  依赖：services/api/system fetchDeviceHealthSummary 健康摘要；
        services/api/advisor fetchDeviceLifespan 寿命预测；
        Pinia: useEntitiesStore 实时状态回查；
        子组件：ApiQueryState 包装查询 + HaStatusDegradeBanner HA 状态条。
  注意：电池寿命按容量衰减曲线近似计算；offline 判定依据 entitiesStore last_changed。
-->
<template>
  <div class="device-card widget-glass-card">
    <div v-if="!embedded" class="device-header">
      <div class="device-tabs">
        <button
          :class="['device-tab', activeTab === 'battery' ? 'device-tab--active' : '']"
          @click="activeTab = 'battery'"
        >
          <BatteryWarning class="w-3 h-3" />
          <span>{{ '电池' }}</span>
          <span v-if="lowBatteryDevices.length > 0" class="device-badge device-badge--warn">{{
            lowBatteryDevices.length
          }}</span>
        </button>
        <button
          :class="['device-tab', activeTab === 'offline' ? 'device-tab--active' : '']"
          @click="activeTab = 'offline'"
        >
          <WifiOff class="w-3 h-3" />
          <span>{{ '离线' }}</span>
          <span v-if="offlineDevices.length > 0" class="device-badge device-badge--danger">{{
            offlineDevices.length
          }}</span>
        </button>
        <button
          :class="['device-tab', activeTab === 'lifespan' ? 'device-tab--active' : '']"
          @click="
            () => {
              activeTab = 'lifespan'
              fetchLifespan()
            }
          "
        >
          <Activity class="w-3 h-3" />
          <span>{{ '寿命' }}</span>
          <span v-if="lifespanAlerts.length > 0" class="device-badge device-badge--warn">{{
            lifespanAlerts.length
          }}</span>
        </button>
      </div>
      <button
        type="button"
        class="device-refresh"
        :disabled="refreshing"
        :aria-label="refreshing ? '刷新中' : '刷新设备健康'"
        @click="refreshPanel"
      >
        <RefreshCw :class="['w-3 h-3', refreshing && 'animate-spin']" />
      </button>
    </div>

    <HaStatusDegradeBanner title="设备健康数据" />

    <ApiQueryState
      :loading="summaryLoading"
      :error="healthSummaryError"
      error-title="健康摘要加载失败"
      @retry="fetchHealthSummary"
    >
      <div v-if="healthSummary" class="device-summary">
        <span>{{ `寿命告警 ${healthSummary.lifespan?.critical ?? 0}` }}</span>
        <span>{{ `离线 ${healthSummary.offline?.count ?? 0}` }}</span>
        <span>{{ `固件更新 ${healthSummary.firmwareUpdates?.count ?? 0}` }}</span>
      </div>
    </ApiQueryState>

    <div class="device-body">
      <div v-if="activeTab === 'battery'">
        <VEmptyState
          v-if="batteryDevices.length === 0"
          compact
          tone="neutral"
          :title="'未检测到电池设备'"
        />
        <div v-else class="device-list">
          <div
            v-for="device in batteryDevices"
            :key="device.entity_id"
            :class="['device-item', getBatteryClass(device.level)]"
          >
            <div class="device-item-left">
              <component
                :is="getBatteryIcon(device.level)"
                :class="['w-4 h-4', getBatteryColor(device.level)]"
              />
              <span class="device-name">{{ device.name }}</span>
            </div>
            <div class="device-item-right">
              <div class="device-bar-wrap">
                <div
                  class="device-bar"
                  :class="getBarClass(device.level)"
                  :style="{ width: device.level + '%' }"
                />
              </div>
              <span :class="['device-pct', getPctClass(device.level)]">{{ device.level }}%</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'offline'">
        <VEmptyState
          v-if="offlineDevices.length === 0"
          compact
          tone="emerald"
          icon="✓"
          :title="'所有设备在线'"
        />
        <div v-else class="device-list">
          <div
            v-for="device in offlineDevices"
            :key="device.entity_id"
            class="device-item device-item--offline"
          >
            <div class="device-item-left">
              <AlertCircle class="w-4 h-4 dh-icon-danger" />
              <div class="flex flex-col">
                <span class="device-name">{{ device.name }}</span>
                <span class="device-domain">{{ device.domain }}</span>
              </div>
            </div>
            <span class="device-time">{{ formatOfflineTime(device.last_changed) }}</span>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'lifespan'">
        <div v-if="lifespanLoading" class="device-loading">
          <RefreshCw class="device-loading__icon animate-spin" />
          <span>{{ '同步设备健康…' }}</span>
        </div>
        <div v-else-if="lifespanAlerts.length === 0">
          <VEmptyState compact tone="emerald" icon="✓" :title="'暂无告警'" />
        </div>
        <div v-else class="device-list">
          <div
            v-for="a in lifespanAlerts"
            :key="a.entityId"
            class="device-item device-item--critical"
          >
            <div class="device-item-left">
              <AlertCircle class="w-4 h-4 dh-icon-warn" />
              <div class="flex flex-col">
                <span class="device-name">{{ a.name }}</span>
                <span class="device-domain">{{ '健康分' }} {{ a.healthScore }}</span>
              </div>
            </div>
            <span class="device-pct dh-rec-warn text-[12px]">{{ a.recommendation }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * @file HealthPanel.vue
 * @module widgets/device
 * @description 设备健康面板：聚合「电池 / 离线 / 寿命」三个 tab，
 *              电池 tab 展示低电量设备与电量条，离线 tab 展示掉线设备及掉线时长，
 *              寿命 tab 调用 advisor 服务获取设备寿命告警。
 * @dependencies
 *  - vue: ref/computed/onMounted 响应式与生命周期
 *  - @lucide/vue: 电池/Wifi/告警/刷新图标
 *  - @/stores/entities.store: 实体状态
 *  - @/services/api/system: 设备健康汇总接口
 *  - @/services/api/advisor: 设备寿命接口
 *  - @/utils/format/locale-format.util: 本地时间格式化
 *  - @/services/notify: 错误通知
 *  - @/components/common/ApiQueryState.vue: 查询状态容器
 *  - @/components/common/HaStatusDegradeBanner.vue: HA 降级提示
 */
import { ref, computed, onMounted } from 'vue'
import {
  BatteryWarning,
  BatteryFull,
  BatteryMedium,
  BatteryLow,
  Battery,
  WifiOff,
  AlertCircle,
  Activity,
  RefreshCw,
} from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { fetchDeviceHealthSummary } from '@/services/api/system'
import { fetchDeviceLifespan } from '@/services/api/advisor'
import { formatLocaleTime } from '@/utils/format/locale-format.util'
import { notifyError } from '@/services/notify'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import HaStatusDegradeBanner from '@/components/common/HaStatusDegradeBanner.vue'

defineProps({
  embedded: { type: Boolean, default: false },
})

const entitiesStore = useEntitiesStore()
const activeTab = ref('battery')
const lifespanLoading = ref(false)
const lifespanAlerts = ref([])
const refreshing = ref(false)
const healthSummary = ref(null)
const healthSummaryError = ref('')
const summaryLoading = ref(true)

async function fetchHealthSummary() {
  healthSummaryError.value = ''
  summaryLoading.value = true
  try {
    const { data } = await fetchDeviceHealthSummary()
    healthSummary.value = data
  } catch {
    healthSummary.value = null
    healthSummaryError.value = '请稍后重试'
  } finally {
    summaryLoading.value = false
  }
}

onMounted(fetchHealthSummary)

const allBatteryDevices = computed(() => entitiesStore.batteryDevices || [])
const batteryDevices = computed(() => allBatteryDevices.value)
const lowBatteryDevices = computed(() => allBatteryDevices.value.filter((d) => d.level <= 20))
const offlineDevices = computed(() => entitiesStore.offlineDevices || [])

async function refreshPanel() {
  refreshing.value = true
  try {
    await fetchHealthSummary()
    if (activeTab.value === 'lifespan') {
      await fetchLifespan(true)
    }
  } finally {
    refreshing.value = false
  }
}

async function fetchLifespan(force = false) {
  if (!force && lifespanAlerts.value.length && !lifespanLoading.value) return
  lifespanLoading.value = true
  try {
    const data = await fetchDeviceLifespan()
    lifespanAlerts.value = data?.alerts || []
  } catch (e) {
    lifespanAlerts.value = []
    if (force) notifyError(e, '加载失败')
    else notifyError(e, '加载失败', { silent: true })
  } finally {
    lifespanLoading.value = false
  }
}

function getBatteryClass(level) {
  if (level <= 10) return 'device-item--critical'
  if (level <= 20) return 'device-item--warn'
  return ''
}
function getBatteryIcon(level) {
  if (level <= 10) return BatteryLow
  if (level <= 30) return BatteryMedium
  if (level <= 60) return Battery
  return BatteryFull
}
function getBatteryColor(level) {
  if (level <= 10) return 'dh-battery-critical'
  if (level <= 20) return 'dh-battery-warn'
  if (level <= 40) return 'dh-battery-low'
  return 'dh-battery-ok'
}
function getBarClass(level) {
  if (level <= 10) return 'device-bar--critical'
  if (level <= 20) return 'device-bar--warn'
  return 'device-bar--ok'
}
function getPctClass(level) {
  if (level <= 10) return 'dh-battery-critical'
  if (level <= 20) return 'dh-battery-warn'
  return 'dh-pct-neutral'
}
function formatOfflineTime(ts) {
  if (!ts) return '--'
  const d = new Date(ts)
  return formatLocaleTime(d, { hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped src="./styles/HealthPanel.css"></style>
