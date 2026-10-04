<!--
组件：SecurityOverviewBody.vue
所属模块：frontend / src / views / security
职责：安防总览主体工作区。左侧渲染 ZoneHub（区域布防/编辑），右侧渲染
      OverviewSidebar（传感器列表 + 审计日志双 Tab），并把双向绑定的筛选状态
      透传到子组件。
关键依赖：
  - SecurityZoneHub / SecurityOverviewSidebar：区域中心与侧栏子组件
  - getSecurityPanelZonesFromLayout：从布局配置派生安防区域
  - useLayoutStore：读取布局配置
数据来源：父级 Overview 透传的传感器/区域/事件数据 + layoutStore 的布局配置
-->
<template>
  <div class="sov-workspace">
    <main class="sov-main">
      <SecurityZoneHub
        v-model:arm-selection="armSelection"
        :live-zones="liveZones"
        :layout-zones="layoutZones"
        :backend-zones="backendZones"
        :sec-current-mode="secCurrentMode"
        :sec-panel-loading="secPanelLoading"
        :sec-panel-ready="secPanelReady"
        @saved="$emit('refresh-zones')"
        @filter-audit="onFilterAudit"
      />
    </main>

    <SecurityOverviewSidebar
      v-model:alerts-only="alertsOnly"
      v-model:bound-only="boundOnly"
      v-model:sec-event-filter="secEventFilter"
      :list-sensors="listSensors"
      :grouped-list-sensors="groupedListSensors"
      :sensor-filters="sensorFilters"
      :sensor-filter="sensorFilter"
      :bound-sensor-count="boundSensorCount"
      :live-zones="liveZones"
      :displayed-sec-events="displayedSecEvents"
      :sec-audit-loading="secAuditLoading"
      :sec-audit-error="secAuditError"
      :sec-event-filters="secEventFilters"
      :sec-event-icon-map="secEventIconMap"
      @toggle-sensor-filter="$emit('toggle-sensor-filter', $event)"
      @refresh-audit="$emit('refresh-audit')"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useLayoutStore } from '@/stores/layout.store'
import { getSecurityPanelZonesFromLayout } from '@/utils/security/panel-layout.util'
import SecurityOverviewSidebar from '@/views/security/OverviewSidebar.vue'
import SecurityZoneHub from '@/views/security/ZoneHub.vue'

// 入参：传感器列表 / 分组、筛选选项、当前模式、加载态、审计事件等透传字段
defineProps({
  listSensors: { type: Array, default: () => [] },
  groupedListSensors: { type: Array, default: () => [] },
  sensorFilters: { type: Array, default: () => [] },
  sensorFilter: { type: String, default: 'all' },
  boundSensorCount: { type: Number, default: 0 },
  liveZones: { type: Array, default: () => [] },
  backendZones: { type: Array, default: () => [] },
  secCurrentMode: { type: String, default: 'disarmed' },
  secPanelLoading: Boolean,
  secPanelReady: Boolean,
  displayedSecEvents: { type: Array, default: () => [] },
  secAuditLoading: Boolean,
  secAuditError: { type: String, default: '' },
  secEventFilters: { type: Array, default: () => [] },
  secEventIconMap: { type: Object, default: () => ({}) },
})

// 对外事件：切换传感器筛选、跳转安防模式、刷新审计、刷新区域
defineEmits(['toggle-sensor-filter', 'go-security-modes', 'refresh-audit', 'refresh-zones'])

// 双向绑定：仅看告警 / 仅看已绑定 / 事件筛选维度 / 布防区域选择
const alertsOnly = defineModel('alertsOnly', { type: Boolean, default: false })
const boundOnly = defineModel('boundOnly', { type: Boolean, default: false })
const secEventFilter = defineModel('secEventFilter', { type: String, default: 'all' })
const armSelection = defineModel('armSelection', { type: Array, default: () => [] })

// ZoneHub 中点击某区域审计时，将筛选维度切到 zone:<id> 形式
function onFilterAudit(zoneId) {
  secEventFilter.value = `zone:${zoneId}`
}

const layoutStore = useLayoutStore()

// 从布局配置派生安防区域，供 ZoneHub 与 unassigned 计算使用
const layoutZones = computed(() => getSecurityPanelZonesFromLayout(layoutStore.layoutConfig))
</script>
