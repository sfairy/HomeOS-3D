<!--
组件：LifeEnvTab.vue
所属模块：frontend / src / views/life
职责：居家环境 — 室内 IAQ / 舒适度 + 天启生活指数
布局：左栏复用 HomeEnvironmentPanel（含 overview/life/comfort/trend/rooms/circadian
      六子标签），右栏拼装 KPI / 状态芯片 / 天气预警 / 室外快览 / 生活指数 /
      环境趋势图 / 需关注房间 / 季节建议。
数据来源：
  - KPI / 房间健康桶 / 需关注房间来自 useLifeOverview；
  - 环境趋势、季节建议等来自 useLifeOverviewAnalytics；
  - 生活指数与天气预警来自 useLifeIndices；
  - 初始子标签由路由 query 经 resolveEnvPanelHint 解析。
关键交互：
  - 路由 query 变化时同步切换 Hub 子标签（watch envPanelHint）；
  - 点击图表链接切到对应 Hub 子标签；
  - useHubChart 自动渲染温湿度趋势折线图。
-->
<template>
  <div class="life-module life-module--split life-module--env life-env">
    <section class="life-module__workspace life-module__panel life-env__hero">
      <HomeEnvironmentPanel
        :panel-visible="true"
        :default-tab="panelTab"
        :tab-select-token="tabSelectToken"
        :embedded="false"
      />
    </section>

    <aside class="life-module__analytics life-env__rail">
      <div class="life-module__analytics-glow" aria-hidden="true" />

      <LifeKpiGrid class="life-env__kpis" :kpis="kpis" />

      <LifeStatusChips v-if="statusChips.length" variant="env" :chips="statusChips" />

      <div class="life-env__stack">
        <article v-if="warning?.active" class="life-env__card life-env__card--warn">
          <LifeChartCard
            title="天气预警"
            link-text="生活"
            link-class="life-env__link"
            @link-click="selectPanelTab('life')"
          >
            <strong class="life-env__warn-title">{{ warning.title }}</strong>
            <ul v-if="warning.details.length" class="life-env__warn-list">
              <li v-for="(row, i) in warning.details.slice(0, 3)" :key="i">{{ row }}</li>
            </ul>
          </LifeChartCard>
        </article>

        <article v-if="outdoorOnlyMetrics.length" class="life-env__card">
          <LifeChartCard
            title="室外快览"
            link-text="生活"
            link-class="life-env__link"
            @link-click="selectPanelTab('life')"
          >
            <div class="life-env__iaq-strip life-env__iaq-strip--tight">
              <div
                v-for="(m, idx) in outdoorOnlyMetrics"
                :key="m.key"
                class="life-env__iaq-chip"
                :class="`is-tone-${idx % 4}`"
              >
                <span>{{ m.label }}</span>
                <strong
                  >{{ m.value }}<em v-if="m.unit">{{ m.unit }}</em></strong
                >
              </div>
            </div>
          </LifeChartCard>
        </article>

        <article
          v-if="attentionIndices.length || !availableCount"
          class="life-env__card"
          :class="{ 'life-env__card--compact': !attentionIndices.length }"
        >
          <LifeChartCard
            title="生活指数"
            link-text="全部"
            link-class="life-env__link"
            @link-click="selectPanelTab('life')"
          >
            <div v-if="attentionIndices.length" class="life-env__life-list">
              <button
                v-for="item in attentionIndices"
                :key="item.entityId"
                type="button"
                class="life-env__life-item"
                :class="`is-${item.tone}`"
                :title="item.description || item.friendlyName"
                @click="selectPanelTab('life')"
              >
                <strong>{{ item.label }}</strong>
                <span>{{ item.state }}</span>
              </button>
            </div>
            <p v-else class="life-module__empty life-module__empty--inline">
              {{ '尚未接入生活指数。' }}
              <RouterLink class="life-module__empty-link" :to="bindingsHref">{{
                '去绑定天气'
              }}</RouterLink>
            </p>
          </LifeChartCard>
        </article>

        <article
          class="life-env__card life-env__card--chart"
          :class="{ 'life-env__card--compact': !analytics.envTrend.value.length }"
        >
          <LifeChartCard
            title="环境趋势"
            link-text="完整趋势"
            link-class="life-env__link"
            @link-click="selectPanelTab('trend')"
          >
            <div
              v-show="analytics.envTrend.value.length"
              ref="envChartRef"
              class="life-env__spark"
            />
            <p
              v-if="!analytics.envTrend.value.length"
              class="life-module__empty life-module__empty--inline"
            >
              {{ analytics.loading.value ? '加载中…' : '暂无温湿度历史' }}
            </p>
          </LifeChartCard>
        </article>

        <article v-if="riskRoomStrip.length" class="life-env__card">
          <LifeChartCard
            title="需关注房间"
            link-text="房间"
            link-class="life-env__link"
            @link-click="selectPanelTab('rooms')"
          >
            <div class="life-env__risk-list">
              <button
                v-for="room in riskRoomStrip"
                :key="room.roomId"
                type="button"
                class="life-env__risk-item"
                @click="selectPanelTab('rooms')"
              >
                <strong>{{ room.name }}</strong>
                <span>{{ room.riskLabel }}</span>
                <em v-if="room.temp != null">{{ `${room.temp}°C` }}</em>
                <em v-if="room.humidity != null">{{ `${room.humidity}%` }}</em>
                <em v-if="room.pm25 != null">{{ `PM2.5 ${room.pm25}` }}</em>
              </button>
            </div>
          </LifeChartCard>
        </article>

        <article v-if="analytics.seasonalTips.value.length" class="life-env__card">
          <LifeChartCard
            :title="analytics.seasonalLabel.value"
            link-text="舒适"
            link-class="life-env__link"
            @link-click="selectPanelTab('comfort')"
          >
            <ul class="life-env__tips">
              <li
                v-for="(tip, i) in analytics.seasonalTips.value.slice(0, 3)"
                :key="i"
                :class="`is-tone-${i % 3}`"
              >
                {{ tip }}
              </li>
            </ul>
          </LifeChartCard>
        </article>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useRoute } from 'vue-router'
import HomeEnvironmentPanel from '@/components/widgets/climate/HomeEnvironmentPanel.vue'
import LifeKpiGrid from '@/components/life/LifeKpiGrid.vue'
import LifeStatusChips from '@/components/life/LifeStatusChips.vue'
import LifeChartCard from '@/components/life/LifeChartCard.vue'
import { useLifeOverview } from '@/composables/life/useLifeOverview'
import { useLifeOverviewAnalytics } from '@/composables/life/useLifeOverviewAnalytics'
import { useLifeIndices } from '@/composables/life/useLifeIndices'
import { useLifeHubPanelTab } from '@/composables/life/useLifeHubPanelTab'
import { resolveEnvPanelHint } from '@/composables/life/useLifeView'
import { useHubChart } from '@/composables/life/useLifeChartHost'
import { buildEnvTrendOption } from '@/utils/chart/life-charts.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

// 环境面板合法子标签集合：用于校验路由 query 与初始 tab
const ENV_PANELS = new Set(['overview', 'life', 'comfort', 'trend', 'rooms', 'circadian'])

const route = useRoute()
const { tabMetricCells, roomHealthBuckets, riskRoomStrip } = useLifeOverview()
const analytics = useLifeOverviewAnalytics()
const { availableCount, attentionIndices, warning, liveMetrics } = useLifeIndices()
const bindingsHref = SETTINGS_ROUTES.bindings()

/** 室外独有指标（AQI / 天气 / 降水等），不再重复温湿度 PM2.5 */
const outdoorOnlyMetrics = computed(() =>
  liveMetrics.value
    .filter((m) => !['temperature', 'humidity', 'pm25'].includes(m.key))
    .slice(0, 4),
)

// 路由 query 解析出环境子标签：未命中合法集合时回退 overview
const envPanelHint = computed(() => resolveEnvPanelHint(route.query as Record<string, unknown>))
const initialPanel = ENV_PANELS.has(envPanelHint.value) ? envPanelHint.value : 'overview'
const { panelTab, tabSelectToken, selectPanelTab } = useLifeHubPanelTab(initialPanel)

// 路由变化时同步切换 Hub 子标签：支持外部链接直接定位 trend/rooms 等
watch(envPanelHint, (hint) => {
  if (ENV_PANELS.has(hint)) selectPanelTab(hint)
})

const kpis = computed(() => tabMetricCells.value.env || [])
/** 跳过「关注」桶：与 KPI「需关注」重复，房间明细见下方列表 */
const statusChips = computed(() =>
  roomHealthBuckets.value
    .filter((b) => b.count > 0 && b.key !== 'risk')
    .map((b) => ({ key: b.key, label: b.label, value: b.count })),
)

const envChartRef = ref<HTMLElement | null>(null)

useHubChart(
  envChartRef,
  () => buildEnvTrendOption(analytics.envTrend.value),
  [() => analytics.envTrend.value],
)
</script>
