<template>
  <div class="eh-root widget-hub-root">
    <!-- 头部：仅在非嵌入模式下展示，绿色主题色对应健康类目，图标颜色随健康分级动态变化 -->
    <WidgetHubHeader
      v-if="!embedded"
      v-model="activeTab"
      :title="title"
      accent="var(--premium-accent-green)"
      :tabs="hubTabs"
      stacked
    >
      <template #icon><HeartPulse :class="['w-3.5 h-3.5', healthGradeColor]" /></template>
    </WidgetHubHeader>

    <div class="eh-body widget-hub-panel">
      <!-- HA 降级提示横幅：当 HA 不可用时告知用户环境健康数据可能受限 -->
      <HaStatusDegradeBanner title="环境健康数据" />
      <!-- 总览依赖 env/health：单独包 ApiQueryState，避免阻断趋势/舒适度等独立 API 的 tab -->
      <ApiQueryState
        v-if="activeTab === 'overview'"
        :loading="loading"
        :error="loadError"
        tone="emerald"
        error-title="环境健康加载失败"
        @retry="refresh"
      >
        <EnvironmentHealthOverview
          :iaq-result="iaqResult"
          :iaq-score="iaqScore"
          :iaq-color="iaqColor"
          :health-score="healthScore"
          :health-color="healthColor"
          :health-label="healthLabel"
          :iaq-detail-items="iaqDetailItems"
          :unconfigured-rooms="unconfiguredRooms"
          :risk-rooms="riskRooms"
        />
      </ApiQueryState>

      <!-- 生活指数：天启 sensor.{站点}_clothing 等 -->
      <LifeIndices
        v-if="activeTab === 'life'"
        embedded
        class="eh-life-embed"
        :config="config"
        :panel-visible="panelVisible && activeTab === 'life'"
      />

      <!-- 舒适度 tab：自有数据源，不依赖 env/health -->
      <ComfortScore
        v-if="activeTab === 'comfort'"
        :iaq-result="iaqResult"
        :iaq-load-error="iaqLoadError"
        embedded
        :panel-visible="panelVisible"
      />

      <!-- 环境趋势 tab -->
      <EnvTrendPanel
        v-if="activeTab === 'trend'"
        embedded
        class="eh-trend-embed"
        :panel-visible="panelVisible && activeTab === 'trend'"
      />

      <!-- 昼夜节律 tab -->
      <CircadianLightingPanel
        v-if="activeTab === 'circadian'"
        embedded
        class="eh-circadian-embed"
        :panel-visible="panelVisible && activeTab === 'circadian'"
      />

      <!-- 房间空气 tab：列表来自 health，失败时展示空列表而非整页阻断 -->
      <EnvironmentHealthRooms v-if="activeTab === 'rooms'" :room-list="roomList" />
    </div>
  </div>
</template>

<script setup>
/**
 * @file EnvironmentHealthPanel.vue
 * @module widgets/climate
 * @description 环境健康 Hub 面板：聚合「总览 / 生活 / 舒适度 / 趋势 / 房间 / 昼夜节律」，
 *              通过 useEnvironmentHealthPanel composable 统一拉取 IAQ / 健康评分 / 房间数据，
 *              并通过 useHubTabs 维护 tab 持久化与切换。
 * @dependencies
 *  - @lucide/vue: HeartPulse 图标
 *  - @/components/common/ApiQueryState.vue: 通用 loading/error 状态容器
 *  - @/components/widgets/climate/ComfortScore.vue: 舒适度评分组件
 *  - @/components/widgets/weather/LifeIndices.vue: 天启生活指数
 *  - @/components/widgets/shared/WidgetHubHeader.vue: 通用 Hub 头部
 *  - @/components/common/HaStatusDegradeBanner.vue: HA 降级提示
 *  - @/components/widgets/climate/EnvironmentHealthOverview.vue: 总览视图
 *  - @/components/widgets/climate/EnvironmentHealthRooms.vue: 房间视图
 *  - @/components/widgets/climate/EnvTrendPanel.vue: 环境趋势视图
 *  - @/components/widgets/climate/CircadianLightingPanel.vue: 昼夜节律视图
 *  - @/composables/climate/useEnvironmentHealthPanel: 环境健康面板数据 composable
 *  - @/composables/widget/useHubTabs: Hub tab 持久化 composable
 */
import { defineAsyncComponent } from 'vue'
import { HeartPulse } from '@lucide/vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import ComfortScore from '@/components/widgets/climate/ComfortScore.vue'
import WidgetHubHeader from '@/components/widgets/shared/WidgetHubHeader.vue'
import HaStatusDegradeBanner from '@/components/common/HaStatusDegradeBanner.vue'
import EnvironmentHealthOverview from '@/components/widgets/climate/EnvironmentHealthOverview.vue'
import EnvironmentHealthRooms from '@/components/widgets/climate/EnvironmentHealthRooms.vue'
import EnvTrendPanel from '@/components/widgets/climate/EnvTrendPanel.vue'
import CircadianLightingPanel from '@/components/widgets/climate/CircadianLightingPanel.vue'

const LifeIndices = defineAsyncComponent(
  () => import('@/components/widgets/weather/LifeIndices.vue'),
)
import {
  ENV_HEALTH_HUB_TABS,
  useEnvironmentHealthPanel,
} from '@/composables/climate/useEnvironmentHealthPanel'
import { useHubTabs } from '@/composables/widget/useHubTabs'
import './styles/environment-health-panel.css'

const props = defineProps({
  config: { type: Object, default: () => ({}) },
  defaultTab: { type: String, default: '' },
  tabSelectToken: { type: Number, default: 0 },
  panelVisible: { type: Boolean, default: true },
  embedded: { type: Boolean, default: false },
  title: { type: String, default: '环境健康' },
  hubType: { type: String, default: 'homeEnvironment' },
})

// 通过 useHubTabs 维护当前激活 tab，并支持按 hubType 持久化
const { hubTabs, activeTab } = useHubTabs({
  hubType: props.hubType,
  config: () => props.config,
  defaultTabProp: () => props.defaultTab,
  tabSelectToken: () => props.tabSelectToken,
  allTabs: ENV_HEALTH_HUB_TABS,
})

// 通过 useEnvironmentHealthPanel 拉取并聚合面板所需的全部数据
const {
  loading,
  loadError,
  iaqLoadError,
  refresh,
  iaqResult,
  iaqScore,
  healthScore,
  healthColor,
  healthLabel,
  iaqColor,
  healthGradeColor,
  iaqDetailItems,
  roomList,
  unconfiguredRooms,
  riskRooms,
} = useEnvironmentHealthPanel(props)
</script>