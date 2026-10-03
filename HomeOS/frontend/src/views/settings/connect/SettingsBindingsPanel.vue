<!--
组件：SettingsBindingsPanel.vue
所属模块：frontend / src / views / settings / connect
职责：HA 绑定配置面板根容器。组合天气/监控/扫地机/安防传感器与门铃等绑定子分区，
      管理待保存计数、保存/取消、绑定缺口洞察推荐与一键应用；测试事件通路与安全演习。
关键依赖：
  - useHaBindings / useBindingsRecommend：绑定数据与缺口推荐
  - useLayoutStore / useSystemConfig：布局与系统配置读写
  - useSettingsPendingChanges：待保存快照与回退
  - fetchBindingsGaps / runHazardDrill / executeScene：缺口加载、演习与场景执行
数据来源：layoutStore.layoutConfig.haConfig + 服务端绑定缺口 + 父级透传 activeTab
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="bindings"
    icon-key="wifi"
    accent="var(--module-accent-bindings)"
    layout="single"
    page-class="bindings-hub"
    body-class="bindings-hub__body"
  >
    <template #actions>
      <template v-if="bindingsSection === 'security'">
        <button type="button" class="settings-btn-accent" @click="addDoorbellRoute">
          <Plus class="w-3.5 h-3.5" /> {{ '添加门铃' }}
        </button>
        <SettingsPendingSaveAction
          :pending="pendingChanges"
          :saving="layoutSaving"
          save-text="保存所有配置"
          saving-text="同步中..."
          @save="saveLayoutConfig"
          @cancel="cancelLayoutChanges"
        />
      </template>
      <template v-else-if="bindingsSection === 'cameras'">
        <button type="button" class="settings-btn-accent" @click="addCamera">
          <Video class="w-3.5 h-3.5" /> {{ '添加监控' }}
        </button>
        <SettingsPendingSaveAction
          :pending="pendingChanges"
          :saving="layoutSaving"
          save-text="保存所有配置"
          saving-text="同步中..."
          @save="saveLayoutConfig"
          @cancel="cancelLayoutChanges"
        />
      </template>
      <template v-else-if="bindingsSection === 'vacuum'">
        <button type="button" class="settings-btn-accent" @click="addVacuumMap">
          <Plus class="w-3.5 h-3.5" /> {{ '添加绑定' }}
        </button>
        <SettingsPendingSaveAction
          :pending="pendingChanges"
          :saving="layoutSaving"
          save-text="保存所有配置"
          saving-text="同步中..."
          @save="saveLayoutConfig"
          @cancel="cancelLayoutChanges"
        />
      </template>
      <template v-else>
        <SettingsPendingSaveAction
          :pending="pendingChanges"
          :saving="layoutSaving"
          save-text="保存所有配置"
          saving-text="同步中..."
          @save="saveLayoutConfig"
          @cancel="cancelLayoutChanges"
        />
      </template>
    </template>

    <template #mobile-save>
      <SettingsPendingSaveAction
        :pending="pendingChanges"
        :saving="layoutSaving"
        save-text="保存所有配置"
        saving-text="同步中..."
        @save="saveLayoutConfig"
        @cancel="cancelLayoutChanges"
      />
    </template>

    <template #subnav>
      <SettingsHubSubnav v-model="bindingsSection" :sections="bindingsSubnavSections" />
    </template>

    <div v-if="pendingChanges > 0" class="settings-inline-save-bar">
      <SettingsPendingSaveAction
        :pending="pendingChanges"
        :saving="layoutSaving"
        save-text="保存所有配置"
        saving-text="同步中..."
        @save="saveLayoutConfig"
        @cancel="cancelLayoutChanges"
      />
    </div>

    <!-- 概览：状态条在上，洞察在下 -->
    <SettingsBindingsOverviewSection
      v-show="bindingsSection === 'overview'"
      :weather-bound="!!layoutStore.layoutConfig.haConfig.weatherEntityId?.trim()"
      :camera-count="securityCameras.length"
      :doorbell-count="doorbellList.length"
      :gap-count="bindingGapItems.length"
    />

    <BindingsSectionInsights
      :section="insightsSection"
      :recommendations="sectionRecommendations"
      :gap-items="sectionGapItems"
      :show-link="false"
      @apply="applyAll"
      @chip-click="applyChip"
    />

    <!-- 天气 -->
    <SettingsBindingsWeatherSection
      v-show="bindingsSection === 'weather'"
      v-model:weather-entity-id="layoutStore.layoutConfig.haConfig.weatherEntityId"
    />

    <!-- 监控 -->
    <SettingsBindingsCamerasSection
      v-show="bindingsSection === 'cameras'"
      v-model:security-cameras="securityCameras"
      :doorbell-cameras="doorbellCameraIds"
      :security-camera="layoutStore.layoutConfig.haConfig.securityCamera"
      @toggle-doorbell-cam="toggleDoorbellCam"
      @set-default-camera="setDefaultCamera"
      @remove-camera="removeCamera"
    />

    <SettingsBindingsVacuumSection
      v-show="bindingsSection === 'vacuum'"
      v-model:vacuum-maps="vacuumMaps"
      @remove="removeVacuumMap"
    />

    <!-- 安防传感器与门铃 -->
    <SettingsBindingsSecuritySection
      v-show="bindingsSection === 'security'"
      v-model:bindings-security-tab="bindingsSecurityTab"
      v-model:events-path="layoutStore.layoutConfig.haConfig.eventsPath"
      v-model:doorbell-list="doorbellList"
      v-model:hazard-smoke-entity-ids="layoutStore.layoutConfig.haConfig.hazardSmokeEntityIds"
      v-model:hazard-gas-entity-ids="layoutStore.layoutConfig.haConfig.hazardGasEntityIds"
      v-model:hazard-leak-entity-ids="layoutStore.layoutConfig.haConfig.hazardLeakEntityIds"
      v-model:hazard-emergency-scene-id="layoutStore.layoutConfig.haConfig.hazardEmergencySceneId"
      v-model:hazard-gas-valve-entity-id="layoutStore.layoutConfig.haConfig.hazardGasValveEntityId"
      v-model:hazard-water-valve-entity-id="layoutStore.layoutConfig.haConfig.hazardWaterValveEntityId"
      v-model:hazard-exhaust-fan-entity-ids="
        layoutStore.layoutConfig.haConfig.hazardExhaustFanEntityIds
      "
      v-model:hazard-drill-mode="layoutStore.layoutConfig.haConfig.hazardDrillMode"
      :hazard-testing="hazardTesting"
      :hazard-drill-busy="hazardDrillBusy"
      :hazard-drill-tip="hazardDrillTip"
      :hazard-drill-ok="hazardDrillOk"
      :bindings-security-tabs="bindingsSecurityTabs"
      :events-validating="eventsValidating"
      :events-validate-tip="eventsValidateTip"
      :events-validate-ok="eventsValidateOk"
      @remove-doorbell="removeDoorbellRoute"
      @test-events-path="testEventsPath"
      @test-hazard="testHazardLinkage"
      @hazard-drill="runHazardDrill"
    />
  </SettingsPageShell>
</template>

<script setup>
import { ref, shallowRef, computed, watch, onMounted } from 'vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import { Video, Plus } from '@lucide/vue'
import SettingsBindingsOverviewSection from '@/views/settings/connect/bindings/SettingsBindingsOverviewSection.vue'
import SettingsBindingsWeatherSection from '@/views/settings/connect/bindings/SettingsBindingsWeatherSection.vue'
import SettingsBindingsSecuritySection from '@/views/settings/connect/bindings/SettingsBindingsSecuritySection.vue'
import SettingsBindingsCamerasSection from '@/views/settings/connect/bindings/SettingsBindingsCamerasSection.vue'
import SettingsBindingsVacuumSection from '@/views/settings/connect/bindings/SettingsBindingsVacuumSection.vue'
import BindingsSectionInsights from '@/views/settings/connect/bindings/SectionInsights.vue'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useAuthStore } from '@/stores/auth.store'
import { useHaBindings } from '@/composables/settings/connect/bindings.internals'
import SettingsHubSubnav from '@/views/settings/shared/layout/SettingsHubSubnav.vue'
import { ensureDoorbellList, collectDoorbellCameraIds } from '@/utils/layout/doorbell.util'
import { ensureVacuumMaps } from '@/utils/vacuum/map.util'
import { applyBindingsLayoutSlice, liveBindingsLayoutSlice, pickBindingsLayoutSlice } from '@/composables/settings/display/layout-dashboard.internals'
import { afterLayoutCancelSync } from '@/composables/settings/pending.internals'
import { useSettingsPendingChanges } from '@/composables/settings/pending.internals'
import { useRegisterSettingsTabPending } from '@/composables/settings/pending.internals'
import {
  syncGlobalLayoutPendingSnapshot,
  pauseGlobalPendingChanges,
  resumeGlobalPendingChanges,
} from '@/composables/settings/pending.internals'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { executeScene } from '@/services/api/orchestrator'
import { fetchBindingsGaps } from '@/services/api/system'
import { runHazardDrill as runHazardDrillApi } from '@/services/api/security'
import { useYamlValidation } from '@/composables/orchestrator/useYamlValidation'
import { useSettingsSidebarReentryReset } from '@/composables/ui/hub-viewport.internals'
import { useSettingsHubRouteSection } from '@/composables/settings/hub-ui.internals'
import SettingsPendingSaveAction from '@/views/settings/shared/SettingsPendingSaveAction.vue'
import { useBindingsRecommend } from '@/composables/settings/connect/bindings.internals'
import {
  handleSystemConfigPatchError,
  patchSystemConfig,
  useSystemConfig,
} from '@/composables/config/system-config-core.internals'
import {
  applyWeatherEntityIdToLayout,
  resolveWeatherEntityId,
} from '@/utils/config/resolve-active-profile.util'

const { load: loadSystemConfig } = useSystemConfig()

// 入参：当前激活的设置 Tab
const props = defineProps({ activeTab: { type: String, default: 'bindings' } })

const layoutStore = useLayoutStore()
const chrome = useChromeStore()
const authStore = useAuthStore()

const bindingsSection = ref('overview')
const bindingsSecurityTab = ref('doorbell')
// 事件通路 YAML 校验器：调用后端 /security/events/validate 接口
const eventsValidation = useYamlValidation({
  method: 'get',
  endpoint: '/security/events/validate',
  mapMessage: (data, ok) => data?.message || (ok ? '连通正常' : '校验失败'),
})
const eventsValidating = eventsValidation.validating
const eventsValidateTip = eventsValidation.message
const eventsValidateOk = eventsValidation.valid
const layoutSaving = ref(false)

// 切换绑定子分区时重置安防子 Tab 到门铃
watch(bindingsSection, () => {
  bindingsSecurityTab.value = 'doorbell'
})

function resetBindingsHubTabs() {
  bindingsSection.value = 'overview'
  bindingsSecurityTab.value = 'doorbell'
}

useSettingsSidebarReentryReset(() => props.activeTab, 'bindings', resetBindingsHubTabs)

// 测试事件通路：有未保存修改时提示先保存，否则触发校验
async function testEventsPath() {
  if (pendingChanges.value > 0) {
    chrome.notify('eventsPath 已修改，请先保存配置后再测试', 'warning')
    return
  }
  await eventsValidation.validate('')
}

const hazardTesting = ref(false)
const hazardDrillBusy = ref(false)
const hazardDrillTip = ref('')
const hazardDrillOk = ref(true)
// 测试安全联动：依次执行配置的紧急场景，验证告警链路
async function testHazardLinkage() {
  const raw = layoutStore.layoutConfig.haConfig?.hazardEmergencySceneId?.trim()
  const sceneIds = raw
    ? raw
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  if (!sceneIds.length) {
    chrome.notify('请先配置紧急场景', 'warning')
    return
  }
  if (pendingChanges.value > 0) {
    chrome.notify('请先保存绑定配置后再测试', 'warning')
    return
  }
  hazardTesting.value = true
  try {
    for (const sceneId of sceneIds) {
      await executeScene(sceneId)
    }
    chrome.notify(
      sceneIds.length > 1
        ? `已触发 ${sceneIds.length} 个紧急场景（测试）`
        : '已触发紧急场景（测试）',
      'success',
    )
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '场景执行失败'), 'error')
  } finally {
    hazardTesting.value = false
  }
}

// 触发安全演习（烟雾/燃气等），展示演习结果文案
async function runHazardDrill(kind = 'smoke') {
  hazardDrillBusy.value = true
  try {
    const { data } = await runHazardDrillApi(kind)
    hazardDrillTip.value = data?.message || '演习已触发'
    hazardDrillOk.value = data?.success !== false
    chrome.notify(hazardDrillTip.value, hazardDrillOk.value ? 'success' : 'warning')
  } catch (e) {
    hazardDrillTip.value = getApiErrorMessage(e, '演习失败')
    hazardDrillOk.value = false
    chrome.notify(hazardDrillTip.value, 'error')
  } finally {
    hazardDrillBusy.value = false
  }
}

const serverBindingGaps = ref([])

async function loadServerBindingGaps() {
  if (authStore.role !== 'admin') return
  try {
    const { data } = await fetchBindingsGaps()
    serverBindingGaps.value = Array.isArray(data?.gaps) ? data.gaps : []
  } catch {
    serverBindingGaps.value = []
  }
}

onMounted(loadServerBindingGaps)

const { bindingGapItems, bindingGapItemsFor, recommendationsFor, applyChip, applyAll } =
  useBindingsRecommend(() => serverBindingGaps.value)

const insightsSection = computed(() => {
  const s = bindingsSection.value
  if (s === 'weather' || s === 'cameras' || s === 'security' || s === 'vacuum' || s === 'overview')
    return s
  return 'overview'
})

const sectionGapItems = computed(() => bindingGapItemsFor(insightsSection.value))
const sectionRecommendations = computed(() => recommendationsFor(insightsSection.value))

const layoutConfig = shallowRef(layoutStore.layoutConfig)
watch(
  () => layoutStore.layoutConfig.haConfig,
  () => {
    layoutConfig.value = layoutStore.layoutConfig
  },
  { deep: true },
)

const initialLayoutConfig = ref(null)

const {
  pendingCount: pendingChanges,
  takeSnapshot: takeLayoutSnapshot,
  confirmAndRevert,
} = useSettingsPendingChanges({
  snapshot: initialLayoutConfig,
  current: () => liveBindingsLayoutSlice(layoutStore.layoutConfig),
  ready: () => layoutStore.isConfigLoaded,
})

const { securityCameras, addCamera, removeCamera, toggleDoorbellCam, setDefaultCamera } =
  useHaBindings(layoutConfig)

useRegisterSettingsTabPending('bindings', () => pendingChanges.value > 0)

function snapshotConfig() {
  takeLayoutSnapshot(pickBindingsLayoutSlice(layoutStore.layoutConfig))
}

const doorbellCameraIds = computed(() => collectDoorbellCameraIds(layoutStore.layoutConfig.haConfig))

const doorbellList = computed({
  get() {
    const hc = layoutStore.layoutConfig.haConfig
    return hc.doorbells || []
  },
  set(v) {
    layoutStore.layoutConfig.haConfig.doorbells = v
  },
})

const vacuumMaps = computed({
  get() {
    return ensureVacuumMaps(layoutStore.layoutConfig.haConfig)
  },
  set(v) {
    layoutStore.layoutConfig.haConfig.vacuumMaps = v
  },
})

function addVacuumMap() {
  ensureVacuumMaps(layoutStore.layoutConfig.haConfig).push({
    vacuumEntityId: '',
    mapCameraEntityId: '',
  })
}

function removeVacuumMap(idx) {
  const list = [...ensureVacuumMaps(layoutStore.layoutConfig.haConfig)]
  list.splice(idx, 1)
  layoutStore.layoutConfig.haConfig.vacuumMaps = list
}

const bindingsSecurityTabs = computed(() => [
  {
    id: 'doorbell',
    label: '门铃路由',
    emoji: '🔔',
    accent: 'var(--module-accent-bindings)',
    count: doorbellList.value.length || undefined,
  },
  { id: 'hazard', label: '安全传感器', emoji: '⚠️', accent: 'var(--set-danger)' },
  { id: 'events', label: '事件与抓拍', emoji: '📡', accent: 'var(--set-info)' },
])

const bindingsSubnavSections = computed(() => [
  {
    id: 'overview',
    label: '概览',
    emoji: '📋',
    badge: bindingGapItems.value.length || '',
  },
  { id: 'weather', label: '天气', emoji: '☁️' },
  { id: 'cameras', label: '监控摄像', emoji: '📹', badge: securityCameras.value.length || '' },
  {
    id: 'vacuum',
    label: '扫地机地图',
    emoji: '🧹',
    badge: vacuumMaps.value.filter((r) => r?.vacuumEntityId && r?.mapCameraEntityId).length || '',
  },
  {
    id: 'security',
    label: '安防传感器与门铃',
    emoji: '🔔',
    badge: doorbellList.value.length || '',
  },
])

useSettingsHubRouteSection(bindingsSection, bindingsSubnavSections, {
  tabId: 'bindings',
  activeTab: () => props.activeTab,
})

function addDoorbellRoute() {
  doorbellList.value.push({
    id: `db_${Date.now()}`,
    label: '新门铃',
    triggerEntityId: '',
    cameraEntityId: '',
    lockEntityId: '',
  })
}

function removeDoorbellRoute(idx) {
  doorbellList.value = doorbellList.value.filter((_, i) => i !== idx)
}

// 取消布局修改：确认后用快照基线回滚绑定切片，并同步全局待保存状态
async function cancelLayoutChanges() {
  await confirmAndRevert(
    chrome,
    (baseline) => {
      applyBindingsLayoutSlice(layoutStore.layoutConfig, baseline)
    },
    { onReverted: () => afterLayoutCancelSync(layoutStore.layoutConfig) },
  )
}

// 保存绑定配置：先保存布局，再同步天气实体到系统配置 circadian，最后刷新快照
async function saveLayoutConfig() {
  layoutSaving.value = true
  try {
    const ok = await layoutStore.saveLayout(true)
    if (!ok) return
    const weatherEntityId = String(layoutStore.layoutConfig.haConfig?.weatherEntityId || '').trim()
    await patchSystemConfig({ circadian: { weatherEntityId } })
    chrome.notify('已保存', 'success')
    snapshotConfig()
    syncGlobalLayoutPendingSnapshot(layoutStore.layoutConfig)
  } catch (e) {
    if (await handleSystemConfigPatchError(e, chrome)) return
    chrome.notify(getApiErrorMessage(e, '保存失败，请稍后重试'), 'error')
  } finally {
    layoutSaving.value = false
  }
}

onMounted(async () => {
  pauseGlobalPendingChanges()
  ensureDoorbellList(layoutStore.layoutConfig.haConfig)
  if (!layoutStore.layoutConfig.haConfig.doorbells) layoutStore.layoutConfig.haConfig.doorbells = []
  ensureVacuumMaps(layoutStore.layoutConfig.haConfig)
  try {
    const cfg = await loadSystemConfig()
    const circadianId = String(cfg?.circadian?.weatherEntityId || '').trim()
    const layoutId = String(layoutStore.layoutConfig.haConfig?.weatherEntityId || '').trim()
    const unified = resolveWeatherEntityId(layoutId, circadianId)
    if (unified && layoutId !== unified) {
      applyWeatherEntityIdToLayout(layoutStore.layoutConfig, unified)
    }
  } catch {
    /* 天气实体对齐失败不阻塞绑定页 */
  }
  syncGlobalLayoutPendingSnapshot(layoutStore.layoutConfig)
  snapshotConfig()
  resumeGlobalPendingChanges()
})
</script>

<style scoped src="../shared/styles/bindings-theme.css"></style>
