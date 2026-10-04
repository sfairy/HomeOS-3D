/**
 * @file DeviceGroupModal.vue
 * @module components/entities/device-group
 * @brief 设备群组控制弹窗
 *
 * 职责：
 * - 按设备域（light/climate/switch/battery/offline 等）批量展示和控制设备组
 * - 通过 Teleport 渲染模态框，含域名标题、关闭、审计等操作
 * - 根据 domain 切换不同子面板：成员列表（DeviceGroupMemberList）、
 *   电量面板（DeviceGroupBatteryPanel）、离线面板（DeviceGroupOfflinePanel）
 * - 离线域支持系统审计模式（showAudit）
 *
 * 依赖：
 * - vue（computed/watch/ref）、@lucide/vue、vue-router（RouterLink）
 * - useFocusTrap、useShellTeleportTarget
 * - entities.store、chrome.store
 * - DeviceGroupMemberList/DeviceGroupBatteryPanel/DeviceGroupOfflinePanel 子组件
 * - useDeviceGroupModal 组合式函数（聚合群组数据与操作）
 */
<template>
  <!-- DeviceGroupModal 设备组模态框：管理和查看设备组详情 -->
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="fade" appear>
      <div v-if="isOpen" class="hos-modal-backdrop" @click.self="$emit('close')" />
    </Transition>
    <Transition name="modal-pop" appear>
      <div v-if="isOpen" class="hos-modal-root">
        <div
          ref="panelRef"
          :class="[
            'hos-modal-panel hos-modal-panel--xl flex flex-col pointer-events-auto',
            domain === 'offline' && showAudit && 'hos-modal-panel--offline-audit-open',
          ]"
          role="dialog"
          aria-modal="true"
          :aria-label="domainInfo.label"
        >
          <div class="hos-modal-head dgm-modal-head" :class="`dgm-modal-head--${domain}`">
            <div class="hos-modal-head-left">
              <div class="hos-modal-head-icon">
                <component :is="domainInfo.icon" class="w-5 h-5" :style="{ color: domainInfo.color }" />
              </div>
              <div>
                <h2 class="hos-modal-title">{{ domainInfo.label }}</h2>
                <p class="hos-modal-subtitle">{{ `共 ${entityIds.length} 个设备` }}</p>
              </div>
            </div>
            <div
              v-if="floors.length > 1 && ['light', 'climate', 'switch'].includes(domain)"
              class="dgm-floors"
            >
              <button
                v-for="f in floors"
                :key="f.id"
                type="button"
                :class="[
                  'dgm-floor-btn',
                  layoutStore.layoutConfig.activeFloorId === f.id ? 'dgm-floor-btn--active' : '',
                ]"
                @click="layoutStore.setActiveFloor(f.id)"
              >
                {{ f.name }}
              </button>
            </div>
            <button
              type="button"
              class="hos-modal-close"
              :aria-label="'关闭'"
              @click="$emit('close')"
            >
              <X class="w-5 h-5" />
            </button>
          </div>

          <div
            v-if="domain === 'offline' && offlineStats?.others?.length > 0"
            class="dgm-section-head dgm-section-head--audit-bar"
          >
            <div class="dgm-audit-bar-left">
              <h3 class="dgm-section-title">{{ '系统审计' }}</h3>
              <span v-if="!showAudit" class="dgm-audit-inline">{{
                `发现 ${offlineStats.others.length} 个次要连接问题`
              }}</span>
            </div>
            <button type="button" class="dgm-section-toggle" @click="showAudit = !showAudit">
              {{ showAudit ? '收起' : `展开 (${offlineStats.others.length})` }}
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-5 sm:p-6 scrollbar-hide">
            <div v-if="entityIds.length === 0" class="dgm-empty">
              <template v-if="domain === 'offline'">
                <AlertTriangle class="dgm-empty-icon dgm-empty-ok-icon" />
                <p class="dgm-empty-title dgm-empty-ok-title">{{ '全网通讯正常' }}</p>
                <p class="dgm-empty-desc">
                  {{
                    '当前关注的常用设备均在线。如需监控更多掉线设备，请前往设置「其它实体追踪」添加。'
                  }}
                </p>
              </template>
              <template v-else-if="domain === 'battery'">
                <BatteryWarning class="dgm-empty-icon" />
                <p class="dgm-empty-title">{{ '暂无电量设备' }}</p>
                <p class="dgm-empty-desc">{{ '网关内没有扫描到含电量属性的实体。' }}</p>
              </template>
              <template v-else>
                <component :is="domainInfo.icon" class="dgm-empty-icon" :style="{ color: domainInfo.color }" />
                <p class="dgm-empty-title">{{ '暂无常用设备' }}</p>
                <p class="dgm-empty-desc">{{ '请前往设置页添加常用设备' }}</p>
                <RouterLink
                  :to="SETTINGS_ROUTES.favorites()"
                  class="dgm-empty-link"
                  @click="$emit('close')"
                  >{{ '前往设置添加' }}</RouterLink
                >
              </template>
            </div>

            <DeviceGroupOfflinePanel
              v-if="domain === 'offline'"
              :stats="offlineStats"
              v-model:show-audit="showAudit"
              :get-entity="getEntity"
              :offline-icon="offlineIcon"
              :offline-reason="offlineReason"
              :short-reason="shortReason"
              :time-ago="timeAgo"
            />

            <DeviceGroupBatteryPanel
              v-if="domain === 'battery'"
              :stats="batteryStats"
              :battery-color="batteryColor"
            />

            <DeviceGroupMemberList
              v-if="domain !== 'battery' && domain !== 'offline'"
              :domain="domain"
              :entity-ids="entityIds"
              :domain-info="domainInfo"
              :batch-executing="batchExecuting"
              :batch-exec-result="batchExecResult"
              @batch-toggle="handleBatchToggle"
              @retry="retryFailed"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/**
 * 职责：实现 DeviceGroupModal 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed, watch, ref } from 'vue'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'
import { RouterLink } from 'vue-router'
import {
  X,
  Sun,
  Thermometer,
  Bell,
  AlertTriangle,
  Lock,
  Camera,
  Fan,
  Music,
  Rabbit,
  Plug,
  BatteryWarning,
  Blinds,
} from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import {
  getDomainMap,
  getEntityFromStore,
} from '@/composables/entity/useDeviceGroupMembers'
import { useDeviceGroupBatch } from '@/composables/entity/useDeviceGroupBatch'
import { useDeviceGroupEntityIds } from '@/composables/entity/useDeviceGroupEntityIds'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { useDeviceGroupOffline } from '@/composables/entity/useDeviceGroupOffline'
import { useKeepAliveGate } from '@/composables/ui/useKeepAliveGate'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
import DeviceGroupBatteryPanel from '@/components/entities/device-group/DeviceGroupBatteryPanel.vue'
import DeviceGroupMemberList from '@/components/entities/device-group/DeviceGroupMemberList.vue'
import DeviceGroupOfflinePanel from '@/components/entities/device-group/DeviceGroupOfflinePanel.vue'
// 设备组模态框专属样式，随组件按需加载（从 main.ts 全局导入拆分而来）
import '@/components/entities/styles/DeviceGroupModal.css'

const props = defineProps({
  domain: { type: String, default: '' },
  isOpen: { type: Boolean },
  statsSensors: {},
})

const emit = defineEmits(['close'])
const { teleportDisabled: keepAliveTeleportDisabled } = useKeepAliveGate()
const { teleportTarget, shellTeleportPending } = useShellTeleportTarget()
const teleportDisabled = computed(
  () => keepAliveTeleportDisabled.value || shellTeleportPending.value,
)

watch(keepAliveTeleportDisabled, (disabled) => {
  if (disabled && props.isOpen) emit('close')
})

const entitiesStore = useEntitiesStore()
const layoutStore = useLayoutStore()
const panelRef = ref(null)
useFocusTrap(
  panelRef,
  computed(() => !!props.isOpen),
)

const floors = computed(() => layoutStore.layoutConfig.floors || [])

const domainMap = computed(() => {
  const base = getDomainMap()
  return {
    light: { ...base.light, icon: Sun },
    climate: { ...base.climate, icon: Thermometer },
    sensor: { ...base.sensor, icon: Bell },
    switch: { ...base.switch, icon: Plug },
    battery: { ...base.battery, icon: BatteryWarning },
    offline: { ...base.offline, icon: AlertTriangle },
    lock: { ...base.lock, icon: Lock },
    cover: { ...base.cover, icon: Blinds },
    camera: { ...base.camera, icon: Camera },
    media_player: { ...base.media_player, icon: Music },
    fan: { ...base.fan, icon: Fan },
    vacuum: { ...base.vacuum, icon: Rabbit },
  }
})

const domainInfo = computed(
  () =>
    domainMap.value[props.domain] || { label: '常用设备', icon: Sun, color: 'dgm-domain-default' },
)

const { entityIds, showAudit, computeEntityIds } = useDeviceGroupEntityIds()

function getEntity(eid) {
  return getEntityFromStore(entitiesStore.entities, eid)
}

const {
  offlineStats,
  batteryStats,
  offlineIcon,
  offlineReason,
  shortReason,
  timeAgo,
  batteryColor,
} = useDeviceGroupOffline(props, entityIds, entitiesStore, layoutStore, floors, getEntity)

const { batchExecuting, batchExecResult, lastBatchPayload, batchToggle, retryFailed } =
  useDeviceGroupBatch(entityIds, entitiesStore)

function inferBatchDomain() {
  return props.domain
}

function handleBatchToggle(turnOn) {
  batchToggle(turnOn, inferBatchDomain)
}

watch(
  () => props.isOpen,
  (open, wasOpen) => {
    if (open && !wasOpen) {
      showAudit.value = false
      batchExecResult.value = null
      lastBatchPayload.value = null
    }
    if (open) {
      void computeEntityIds(props, entitiesStore, layoutStore, floors)
    }
  },
  { immediate: true },
)

watch([() => props.domain, () => layoutStore.layoutConfig.activeFloorId], () => {
  if (!props.isOpen) return
  showAudit.value = false
  batchExecResult.value = null
  lastBatchPayload.value = null
  void computeEntityIds(props, entitiesStore, layoutStore, floors)
})

watch(
  () => entitiesStore.derivedEpoch,
  () => {
    if (props.isOpen) {
      void computeEntityIds(props, entitiesStore, layoutStore, floors)
    }
  },
)
</script>

<style scoped src="./styles/device-group.css"></style>
