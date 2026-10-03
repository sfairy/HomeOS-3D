<template>
  <div :class="['smart-hub widget-hub-root widget-glass-card', embed && 'smart-hub--embed']">
    <header class="smart-hub__head">
      <div class="smart-hub__row">
        <!-- 品牌区：图标 + 标题 + 状态 -->
        <div class="smart-hub__brand">
          <div class="smart-hub__glyph" aria-hidden="true">
            <Brain class="smart-hub__glyph-icon" />
          </div>
          <div class="smart-hub__meta">
            <h3 class="smart-hub__title">{{ '智能中心' }}</h3>
            <p class="smart-hub__status" :class="{ 'smart-hub__status--alert': pendingCount > 0 }">
              {{ statusText }}
            </p>
          </div>
        </div>
        <!-- 刷新当前 Tab 视图 -->
        <button
          type="button"
          class="smart-hub__refresh"
          :disabled="refreshing"
          :aria-label="refreshing ? '刷新中' : '刷新当前视图'"
          @click="refreshActive"
        >
          <RefreshCw
            class="smart-hub__refresh-icon"
            :class="{ 'smart-hub__refresh-icon--spin': refreshing }"
          />
        </button>
      </div>

      <!-- Tab 导航 -->
      <nav
        class="smart-hub__tabs"
        :class="{ 'smart-hub__tabs--fill': hubTabs.length >= 4 }"
        role="tablist"
        :aria-label="'智能中心视图'"
      >
        <button
          v-for="tab in hubTabs"
          :key="tab.key"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.key"
          :class="[
            'smart-hub__tab',
            `smart-hub__tab--${tab.key}`,
            activeTab === tab.key && 'smart-hub__tab--active',
          ]"
          @click="selectTab(tab.key)"
        >
          <component :is="tabIcons[tab.key]" class="smart-hub__tab-icon" aria-hidden="true" />
          <span class="smart-hub__tab-label">{{ tab.label }}</span>
          <span
            v-if="tab.badge != null && tab.badge !== '' && tab.badge !== 0"
            class="smart-hub__tab-badge"
            >{{ tab.badge }}</span
          >
        </button>
      </nav>

      <p class="smart-hub__hint">
        {{ activeTabHint }}
        <RouterLink
          v-if="activeTab === 'advisor'"
          :to="SETTINGS_ROUTES.smartServices('advisor')"
          class="smart-hub__settings-link"
        >
          {{ '顾问设置' }}
        </RouterLink>
      </p>
    </header>

    <div class="smart-hub__body">
      <!-- 外壳独立控制显隐，避免子组件 display/height 盖掉隐藏规则 -->
      <section
        class="smart-hub__panel"
        :class="{ 'is-active': activeTab === 'overview' }"
      >
        <SmartOverviewPanel ref="overviewRef" @goto="selectTab" />
      </section>
      <section
        v-if="mountedTabs.has('advisor')"
        class="smart-hub__panel"
        :class="{ 'is-active': activeTab === 'advisor' }"
      >
        <SmartAdvisorWidget ref="advisorRef" embedded @stats="onAdvisorStats" />
      </section>
      <section
        v-if="mountedTabs.has('habits')"
        class="smart-hub__panel"
        :class="{ 'is-active': activeTab === 'habits' }"
      >
        <RecommendationsPanel ref="habitsRef" embedded @stats="onHabitsStats" />
      </section>
      <section
        v-if="mountedTabs.has('config')"
        class="smart-hub__panel"
        :class="{ 'is-active': activeTab === 'config' }"
      >
        <ConfigRecommendationsPanel ref="configRef" embedded @stats="onConfigStats" />
      </section>
      <section
        v-if="mountedTabs.has('timeline')"
        class="smart-hub__panel"
        :class="{ 'is-active': activeTab === 'timeline' }"
      >
        <SystemTimelineWidget
          ref="timelineRef"
          embedded
          :panel-visible="panelVisible"
        />
      </section>
      <section
        v-if="mountedTabs.has('linkage')"
        class="smart-hub__panel"
        :class="{ 'is-active': activeTab === 'linkage' }"
      >
        <LinkageHealthPanel ref="linkageRef" embedded />
      </section>
      <section
        v-if="mountedTabs.has('analytics')"
        class="smart-hub__panel"
        :class="{ 'is-active': activeTab === 'analytics' }"
      >
        <AutomationAnalyticsPanel ref="analyticsRef" embedded />
      </section>
    </div>
  </div>
</template>

<script setup>
/**
 * 智能中心 Hub 面板
 * 聚合总览 / 顾问 / 习惯 / 配置 / 时间线 / 联动健康 / 自动化分析等 Tab。
 */
import { defineAsyncComponent } from 'vue'
import { RouterLink } from 'vue-router'
import { useSmartHubPanel } from '@/composables/widget/useSmartHubPanel'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import SmartOverviewPanel from '@/components/widgets/orchestrator/SmartOverviewPanel.vue'
import LinkageHealthPanel from '@/components/widgets/care/LinkageHealthPanel.vue'
import './styles/smart-hub-panel.css'

const SmartAdvisorWidget = defineAsyncComponent(
  () => import('@/components/widgets/orchestrator/SmartAdvisorWidget.vue'),
)
const RecommendationsPanel = defineAsyncComponent(
  () => import('@/components/widgets/orchestrator/RecommendationsPanel.vue'),
)
const ConfigRecommendationsPanel = defineAsyncComponent(
  () => import('@/components/widgets/orchestrator/ConfigRecommendationsPanel.vue'),
)
const SystemTimelineWidget = defineAsyncComponent(
  () => import('@/components/widgets/system/TimelineWidget.vue'),
)
const AutomationAnalyticsPanel = defineAsyncComponent(
  () => import('@/components/widgets/orchestrator/AutomationAnalyticsPanel.vue'),
)

const props = defineProps({
  defaultTab: { type: String, default: '' },
  tabSelectToken: { type: Number, default: 0 },
  panelVisible: { type: Boolean, default: true },
  embed: { type: Boolean, default: false },
  config: { type: Object, default: () => ({}) },
})

const {
  tabIcons,
  hubTabs,
  activeTab,
  pendingCount,
  statusText,
  activeTabHint,
  mountedTabs,
  overviewRef,
  advisorRef,
  habitsRef,
  configRef,
  timelineRef,
  linkageRef,
  analyticsRef,
  refreshing,
  selectTab,
  onAdvisorStats,
  onHabitsStats,
  onConfigStats,
  refreshActive,
  Brain,
  RefreshCw,
} = useSmartHubPanel(props)

defineExpose({ load: refreshActive })
</script>
