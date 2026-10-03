<!--
  SecurityPanelWidget.vue / components/widgets/security
  全屋安防 Hub 总面板：顶部页签式 WidgetHubHeader，主 tab 分布防操作
  （在家/离家/睡眠/撤防）+ 区域勾选 + 告警事件列表与安防策略统计。
  Props: defaultTab 默认激活页签 / tabSelectToken 外部切页令牌 / config 配置
  子组件：SensorAlertPanel / AwaySimulationPanel / AnomalyDetectionPanel
          / LockManagementPanel / FrigateEvents 按页签 v-show 懒挂。
  依赖：services/api/security arm/disarm 模式切换 + 区域配置推后端；
        composables: useHubTabs tab 持久化 + useWidgetDeviceGroups 设备分组；
        Pinia: useEntitiesStore + useLayoutStore + useAuthStore 权限判断。
  注意：arm 布防区可多选可全选；canSelectZones 受 authStore 与配置开关控制。
-->
<template>
  <article class="sp-card widget-hub-root">
    <WidgetHubHeader
      v-model="activeTab"
      title="全屋安防"
      accent="var(--premium-accent-red)"
      :tabs="securityTabsColored"
      stacked
      class="sp-card__head"
    >
      <template #icon><ShieldCheck :class="['w-3.5 h-3.5', modeIconClass]" /></template>
      <template #meta>
        <template v-if="activeTab === 'arm'">
          <span v-if="lastEvent" class="sp-last-event-text">{{ lastEvent }}</span>
          <span
            v-if="!showZonesList && panelZones.length"
            class="sp-zone-summary-meta"
            :title="`${armedZoneCount} 个区域已布防`"
            >{{ `${armedZoneCount}/${panelZones.length} 布防` }}</span
          >
          <span :class="['sp-mode-badge', modeBadgeClass]">{{ modeLabel }}</span>
        </template>
      </template>
    </WidgetHubHeader>

    <div class="sp-card__body">
      <div v-if="activeTab === 'arm'" class="sp-tab-panel">
        <ApiQueryState
          :loading="loading"
          :error="panelError"
          error-title="安防状态加载失败"
          tone="rose"
          @retry="refreshPanel"
        >
          <div class="sp-actions">
            <button
              v-for="action in armActions"
              :key="action.mode"
              :class="[
                'sp-action-btn',
                armModeClass(action.mode),
                currentMode === action.mode && 'sp-action-btn--active',
              ]"
              :disabled="arming === action.mode"
              @click="handleArm(action.mode)"
            >
              <Loader2 v-if="arming === action.mode" class="w-4 h-4 animate-spin" />
              <component v-else :is="action.icon" class="w-4 h-4" />
              <span class="sp-action-label">{{ action.label }}</span>
            </button>
          </div>

          <div v-if="showZonesList && panelZones.length > 0" class="sp-zones sp-glass-block">
            <div class="sp-zone-header">
              <button
                type="button"
                class="sp-zone-toggle"
                :aria-expanded="zonesExpanded"
                @click="zonesExpanded = !zonesExpanded"
              >
                <ChevronDown :class="['sp-zone-chevron', zonesExpanded && 'is-open']" />
                <span class="sp-zone-title">{{ '安防区域' }}</span>
              </button>
              <span class="sp-zone-count">{{ `${armedZoneCount}/${panelZones.length} 布防` }}</span>
            </div>
            <div v-if="canSelectZones && zonesExpanded" class="sp-zone-select-bar">
              <p class="sp-zone-select-hint">
                {{
                  armZoneSelection.length
                    ? `已选 ${armZoneSelection.length}/${panelZones.length} 区，布防时仅启用所选`
                    : '未选择时布防全部区域；勾选后可选择性布防'
                }}
              </p>
              <div class="sp-zone-select-actions">
                <button type="button" class="sp-zone-select-btn" @click="selectAllZones">
                  {{ '全选' }}
                </button>
                <button type="button" class="sp-zone-select-btn" @click="clearZoneSelection">
                  {{ '清空' }}
                </button>
              </div>
            </div>
            <template v-if="zonesExpanded">
              <p v-if="zonesSyncFailed" class="sp-zones-retry">
                {{ '区域配置未同步到后端' }}
                <button type="button" class="sp-zones-retry-btn" @click="pushZonesToBackend">
                  {{ '重试' }}
                </button>
              </p>
              <div v-for="zone in panelZones" :key="zone.id" class="sp-zone-item">
                <label v-if="canSelectZones" class="sp-zone-check">
                  <input
                    type="checkbox"
                    :checked="isZoneSelected(zone.id)"
                    @change="toggleZoneSelect(zone.id)"
                  />
                </label>
                <div
                  :class="[
                    'sp-zone-dot',
                    zone.armed ? 'sp-zone-dot--armed' : 'sp-zone-dot--disarmed',
                  ]"
                />
                <span class="sp-zone-name">{{ zone.name }}</span>
                <span class="sp-zone-sensors">{{ `${(zone.sensors || []).length} 传感器` }}</span>
              </div>
            </template>
          </div>

          <div v-else-if="!loading && panelZones.length === 0" class="sp-empty-zones sp-glass-block">
            <p class="sp-empty-zones__title">{{ '暂无安防区域' }}</p>
            <p class="sp-empty-zones__hint">
              {{ '在设置 → 浮动组件 → 安防区域中配置，或前往安防总览页管理' }}
            </p>
          </div>
        </ApiQueryState>
      </div>
      <SensorAlertPanel
        v-else-if="activeTab === 'sensors'"
        embedded
        :zones="effectiveZones"
        :config="config"
      />
      <AnomalyDetectionPanel
        v-else-if="activeTab === 'anomaly'"
        embedded
        :zones="effectiveZones"
        :config="config"
      />
      <AwaySimulationPanel
        v-else-if="activeTab === 'simulation'"
        embedded
        :zones="effectiveZones"
        :config="config"
      />
      <FrigateEvents v-else embedded />
    </div>
  </article>
</template>

<script setup>
/**
 * 全屋安防布撤防面板（浮动图层版）
 *
 * 接入后端 SecurityPanelService，提供：
 * 1. 一键布防/撤防（离家/在家/夜间）
 * 2. 安防区域状态展示
 * 3. 最近安防事件记录
 *
 * API 端点：/api/v1/security-panel
 * zones 配置通过 FloatingHub 父组件传入；后端无区域时会自动 bootstrap 同步。
 * config.showZones 仅控制布防 Tab 区域明细是否展示，不影响布防/同步逻辑。
 */
import { ref, computed, watch, defineAsyncComponent } from 'vue'
import { ShieldCheck, Shield, ShieldOff, Home, Moon, Loader2, ChevronDown } from '@lucide/vue'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useAuthStore } from '@/stores/auth.store'
import { useSecurityPanelStatus } from '@/composables/security/useSecurityPanelStatus'
import { executeSecurityPanelArm } from '@/utils/security/panel-arm.util'
import {
  postSecurityZonesSafe,
  normalizeZonesForApi,
} from '@/utils/security/zones-api.util'
import { bootstrapSecurityPanelZonesOnce } from '@/utils/security/panel-zones-bootstrap.util'
import { formatLocaleTime } from '@/utils/format/locale-format.util'
import { hapticAlert } from '@/utils/ui/haptics.util'
import { notifyError } from '@/services/notify'
import SensorAlertPanel from './SensorAlertPanel.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import WidgetHubHeader from '@/components/widgets/shared/WidgetHubHeader.vue'
import { useHubTabs } from '@/composables/widget/useHubTabs'

const AnomalyDetectionPanel = defineAsyncComponent(() => import('./AnomalyDetectionPanel.vue'))
const AwaySimulationPanel = defineAsyncComponent(() => import('./AwaySimulationPanel.vue'))
const FrigateEvents = defineAsyncComponent(() => import('./FrigateEvents.vue'))

const chrome = useChromeStore()
const layoutStore = useLayoutStore()
const authStore = useAuthStore()
const {
  currentMode,
  zones: panelZones,
  loading,
  error: panelError,
  refresh,
  patchModeFromSocket,
} = useSecurityPanelStatus()

function refreshPanel() {
  void refresh()
}

const props = defineProps({
  zones: { type: Array, default: () => [] },
  defaultTab: { type: String, default: '' },
  config: { type: Object, default: () => ({}) },
})

const effectiveZones = computed(() => {
  if (panelZones.value.length) return panelZones.value
  if (props.zones?.length) return props.zones
  return props.config?.zones || []
})

const armZoneSelection = ref([])
const canSelectZones = computed(() => authStore.role === 'admin')

const ALL_HUB_TABS = [
  { key: 'arm', label: '布防', accent: 'var(--premium-accent-red, #ff3b30)' },
  { key: 'sensors', label: '传感器', accent: 'var(--premium-accent-amber, #ff9500)' },
  { key: 'anomaly', label: '异常', accent: 'var(--premium-accent-violet, #bf5af2)' },
  { key: 'simulation', label: '模拟', accent: '#6366f1' },
  { key: 'frigate', label: '摄像', accent: 'var(--premium-accent-blue, #0a84ff)' },
]

const TAB_ACCENT_MAP = Object.fromEntries(ALL_HUB_TABS.map((t) => [t.key, t.accent]))

const { hubTabs: securityTabs, activeTab } = useHubTabs({
  hubType: 'securityPanel',
  config: () => props.config,
  defaultTabProp: () => props.defaultTab,
  allTabs: ALL_HUB_TABS,
})

const securityTabsColored = computed(() =>
  securityTabs.value.map((tab) => ({
    ...tab,
    accent: TAB_ACCENT_MAP[tab.key] ?? TAB_ACCENT_MAP.arm,
  })),
)

const arming = ref(null)
const lastEvent = ref('')
const zonesSyncFailed = ref(false)
const zonesExpanded = ref(true)

/** 仅控制布防 Tab 区域明细是否展示，不影响布防/同步等逻辑 */
const showZonesList = computed(() => props.config?.showZones !== false)

const securityModes = computed(() => layoutStore.layoutConfig.securityModes || [])

const modeLabel = computed(() => {
  const mode = currentMode.value
  const sm = securityModes.value.find((m) => m.key === mode)
  return sm?.name || mode
})

const modeIconClass = computed(() => {
  if (currentMode.value === 'disarmed') return 'sp-icon-disarmed'
  if (currentMode.value === 'armed_home') return 'sp-icon-home'
  if (currentMode.value === 'armed_away') return 'sp-icon-away'
  if (currentMode.value === 'armed_night') return 'sp-icon-night'
  return 'sp-icon-default'
})

const modeBadgeClass = computed(() => {
  const mode = currentMode.value
  if (mode === 'disarmed') return 'sp-badge--disarmed'
  if (mode === 'armed_home') return 'sp-badge--home'
  if (mode === 'armed_away') return 'sp-badge--away'
  if (mode === 'armed_night') return 'sp-badge--night'
  return 'sp-badge--armed'
})

const armedZoneCount = computed(() => panelZones.value.filter((z) => z.armed).length)

const iconMap = { Shield, ShieldOff, Home, Moon }

function armModeClass(mode) {
  return `sp-action-btn--${String(mode).replace(/_/g, '-')}`
}

const armActions = computed(() =>
  securityModes.value.map((m) => ({
    mode: m.key,
    label: m.name,
    icon: iconMap[m.icon] || Shield,
  })),
)

async function handleArm(mode) {
  if (arming.value) return
  if (authStore.role !== 'admin') {
    chrome.notify('仅管理员可切换安防模式', 'warning')
    return
  }
  if (mode !== 'disarmed' && panelZones.value.length === 0) {
    chrome.notify('请先配置安防区域', 'warning')
    return
  }
  // 二次确认：布防/撤防为危险操作，需用户确认后执行
  const isDisarm = mode === 'disarmed'
  const modeName = securityModes.value.find((m) => m.key === mode)?.name
  const ok = await chrome.confirm(
    isDisarm ? '确定撤防？撤防后监控将关闭' : `确定布防${modeName || mode}？布防期间将联动安防设备`,
    isDisarm ? '撤防确认' : '布防确认',
    { type: 'danger', confirmText: isDisarm ? '确认撤防' : '确认布防' },
  )
  if (!ok) return
  arming.value = mode
  try {
    const zoneIds = armZoneSelection.value.length ? armZoneSelection.value : []
    const data = await executeSecurityPanelArm(mode, zoneIds, panelZones.value, patchModeFromSocket)
    const sm = securityModes.value.find((m) => m.key === mode)
    if (data?.success === false) {
      const failed = data?.actions?.failed ?? 0
      chrome.notify(
        failed > 0
          ? `${sm?.name || mode}未生效：${failed} 条联动失败，布防已取消`
          : `${sm?.name || mode}未生效`,
        'error',
      )
      return
    }
    if (data?.skipped) {
      chrome.notify(`已是${sm?.name || mode}，跳过重复联动`, 'info')
    } else {
      hapticAlert()
      lastEvent.value = `${formatLocaleTime(new Date(), { hour: '2-digit', minute: '2-digit' })} ${sm?.name || mode}`
    }
  } catch (err) {
    const status = err?.response?.status
    notifyError(err, status === 403 ? '权限不足，需管理员账号' : '安防布防')
  } finally {
    arming.value = null
  }
}

function isZoneSelected(id) {
  return armZoneSelection.value.includes(id)
}

function toggleZoneSelect(id) {
  const set = new Set(armZoneSelection.value)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  armZoneSelection.value = [...set]
}

function selectAllZones() {
  armZoneSelection.value = panelZones.value.map((z) => z.id)
}

function clearZoneSelection() {
  armZoneSelection.value = []
}

const zonesBootstrapDone = ref(false)

watch(
  () => [loading.value, panelZones.value.length, effectiveZones.value.length],
  async () => {
    if (zonesBootstrapDone.value || loading.value) return
    if (panelZones.value.length > 0) {
      zonesBootstrapDone.value = true
      return
    }
    if (!effectiveZones.value.length) return
    const ok = await bootstrapSecurityPanelZonesOnce(pushZonesToBackend)
    if (ok) zonesBootstrapDone.value = true
  },
  { immediate: true },
)

async function pushZonesToBackend() {
  const zonesPayload = normalizeZonesForApi(effectiveZones.value)
  if (!zonesPayload.length) return false
  const result = await postSecurityZonesSafe(zonesPayload)
  if (result.ok) {
    zonesSyncFailed.value = false
    await refreshPanel()
    return true
  }
  zonesSyncFailed.value = true
  // 会话失效由全局 401 拦截器跳转登录并提示，后台 bootstrap 不再重复弹错误
  if (!result.unauthorized) {
    chrome.notify(result.error, 'error')
  }
  return false
}
</script>

<style src="./styles/security-panel-widget.css"></style>

<style scoped src="./styles/SecurityPanelWidget-scoped.css"></style>
