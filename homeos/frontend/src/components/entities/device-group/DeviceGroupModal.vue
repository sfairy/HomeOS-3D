/** - 按设备域（light/climate/switch/battery/offline 等）批量展示和控制设备组 */
<template>
  <!-- DeviceGroupModal 设备组模态框：管理和查看设备组详情 -->
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="hos-modal" appear>
      <div v-if="isOpen" ref="rootRef" class="hos-modal-root" @click.self="$emit('close')">
        <div class="hos-modal-backdrop" @click="$emit('close')" />
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
import { computed, watch, ref } from 'vue'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'
import { useEscLayer } from '@/composables/ui/useEscStack'
import { useBackgroundInert } from '@/composables/ui/useBackgroundInert'
import { useBodyScrollLock } from '@/composables/ui/useBodyScrollLock'
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
} from '@/composables/entity/device-group/useDeviceGroupMembers'
import { useDeviceGroupBatch } from '@/composables/entity/device-group/useDeviceGroupBatch'
import { useDeviceGroupEntityIds } from '@/composables/entity/device-group/useDeviceGroupEntityIds'
import { SETTINGS_ROUTES } from '@/shared/utils/registry/settings-route.util'
import { useDeviceGroupOffline } from '@/composables/entity/device-group/useDeviceGroupOffline'
import { useKeepAliveGate } from '@/composables/ui/useKeepAliveGate'
import { useShellTeleportTarget } from '@/composables/ui/shell/useShellTeleportTarget'
import DeviceGroupBatteryPanel from '@/components/entities/device-group/DeviceGroupBatteryPanel.vue'
import DeviceGroupMemberList from '@/components/entities/device-group/DeviceGroupMemberList.vue'
import DeviceGroupOfflinePanel from '@/components/entities/device-group/DeviceGroupOfflinePanel.vue'
// 设备组模态框专属样式，随组件按需加载
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
/** 浮层最外层节点：焦点陷阱管面板，背景隔离要的是整层（含背板）。 */
const rootRef = ref(null)
/** 浮层可见性：焦点陷阱 / Esc 层级 / 背景隔离 / 滚动锁共用同一判据。 */
const isActive = computed(() => !!props.isOpen)

useFocusTrap(panelRef, isActive)
// Esc 走全局层级栈：设备组会叠在抽屉之上，各自监听 window 会让一次 Esc 关掉多层。
useEscLayer(isActive, '设备组弹窗', () => emit('close'))
useBackgroundInert(rootRef, isActive, '设备组弹窗')
useBodyScrollLock(isActive, '设备组弹窗')

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
} = useDeviceGroupOffline(props, entityIds, entitiesStore, layoutStore, getEntity)

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
      void computeEntityIds(props, entitiesStore, layoutStore)
    }
  },
  { immediate: true },
)

watch([() => props.domain, () => layoutStore.layoutConfig.floatingWidgets], () => {
  if (!props.isOpen) return
  showAudit.value = false
  batchExecResult.value = null
  lastBatchPayload.value = null
  void computeEntityIds(props, entitiesStore, layoutStore)
})

watch(
  () => entitiesStore.derivedEpoch,
  () => {
    if (props.isOpen) {
      void computeEntityIds(props, entitiesStore, layoutStore)
    }
  },
)
</script>

<style scoped src="./styles/device-group.css"></style>
