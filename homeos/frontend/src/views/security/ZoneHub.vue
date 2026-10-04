<!--
组件：SecurityZoneHub.vue
所属模块：frontend / src / views / security
职责：安防区域中心。顶部 Tab 在「运行监控」与「区域配置」间切换，并负责从监控态
      跳转到配置态聚焦某个区域、配置保存后回到监控态。
关键依赖：
  - SecurityZoneMonitor / SecurityZoneConfigPanel：监控与配置子组件
  - Shield / Activity / Settings2 图标来自 @lucide/vue
数据来源：父级 Overview 透传的 liveZones / layoutZones / backendZones 与安防模式
-->
<template>
  <section class="sov-zones glass-shine">
    <div class="sov-zones__glow" aria-hidden="true" />

    <header class="sov-zones__head">
      <div class="sov-zones__head-copy">
        <div class="sov-zones__eyebrow">
          <Shield class="w-3.5 h-3.5" />
          <span>{{ '安防区域' }}</span>
        </div>
        <h2 class="sov-zones__title">
          {{ '安防区域' }}
          <span class="sov-zones__count">{{ liveZoneCount }}</span>
        </h2>
      </div>

      <div class="sov-zones__view-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          :class="['sov-zones__view-tab', view === 'monitor' && 'sov-zones__view-tab--on']"
          :aria-selected="view === 'monitor'"
          @click="view = 'monitor'"
        >
          <Activity class="w-3.5 h-3.5" />
          <span>{{ '运行监控' }}</span>
        </button>
        <button
          type="button"
          role="tab"
          :class="['sov-zones__view-tab', view === 'config' && 'sov-zones__view-tab--on']"
          :aria-selected="view === 'config'"
          @click="view = 'config'"
        >
          <Settings2 class="w-3.5 h-3.5" />
          <span>{{ '区域配置' }}</span>
        </button>
      </div>
    </header>

    <SecurityZoneMonitor
      v-if="view === 'monitor'"
      v-model:arm-selection="armSelection"
      :live-zones="liveZones"
      :layout-zones="layoutZones"
      :sec-current-mode="secCurrentMode"
      :panel-loading="secPanelLoading"
      :panel-ready="secPanelReady"
      @go-config="view = 'config'"
      @edit-zone="onEditZone"
      @filter-audit="$emit('filter-audit', $event)"
    />

    <SecurityZoneConfigPanel
      v-else
      ref="configPanelRef"
      :backend-zones="backendZones"
      :focus-zone-id="configFocusZoneId"
      @saved="onConfigSaved"
    />
  </section>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { Shield, Activity, Settings2 } from '@lucide/vue'
import SecurityZoneMonitor from '@/views/security/ZoneMonitor.vue'
import SecurityZoneConfigPanel from '@/views/security/ZoneConfigPanel.vue'

// 入参：实时区域、布局区域、后端区域、当前安防模式、面板加载/就绪态
const props = defineProps({
  liveZones: { type: Array, default: () => [] },
  layoutZones: { type: Array, default: () => [] },
  backendZones: { type: Array, default: () => [] },
  secCurrentMode: { type: String, default: 'disarmed' },
  secPanelLoading: Boolean,
  secPanelReady: Boolean,
})

// 对外事件：配置保存后向上冒泡、请求按区域筛选审计
const emit = defineEmits(['saved', 'filter-audit'])

// 双向绑定：布防区域选择（用于选择性布防）
const armSelection = defineModel('armSelection', { type: Array, default: () => [] })

// 当前视图：monitor 运行监控 / config 区域配置
const view = ref('monitor')
// 配置态下需聚焦的区域 ID
const configFocusZoneId = ref('')
// 配置面板实例引用，用于调用 focusZone
const configPanelRef = ref(null)

// 区域数量：优先 liveZones，回退 backendZones
const liveZoneCount = computed(() => props.liveZones.length || props.backendZones.length)

// 监控态点击「编辑此区域」：切到配置态并聚焦该区域
function onEditZone(zoneId) {
  configFocusZoneId.value = zoneId
  view.value = 'config'
  nextTick(() => {
    configPanelRef.value?.focusZone(zoneId)
  })
}

// 配置保存后：清空聚焦 ID 并切回监控态，向上冒泡 saved 事件
function onConfigSaved() {
  configFocusZoneId.value = ''
  view.value = 'monitor'
  emit('saved')
}
</script>
