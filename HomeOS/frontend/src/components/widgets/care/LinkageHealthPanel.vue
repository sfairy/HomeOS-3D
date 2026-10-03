<!--
  LinkageHealthPanel.vue / components/widgets/care
  联动健康指数面板：关爱中心顶部概览卡，展示能源联动、天气联动、
  安防模式、HA 同步连接四项 KPI，附漂移修复向导与成员在家状态徽章。
  Props: embedded 嵌入态时隐藏标题头 / refresh-token 外部触发刷新令牌
  依赖：services/api/system GET linkage-health/scan-drift/repair-drift 接口；
        composables/widget/useScheduledPoll 定时轮询；
        Pinia 无直接 store 依赖，数据来自 REST。
  注意：漂移修复向导分三步：扫描 → 列出差异项推送 → 结果日志；gaps 数展示配置缺口。
-->
<template>
  <div :class="['lh', embedded && 'lh--embedded']">
    <header v-if="!embedded" class="lh__head">
      <h3>{{ '联动健康' }}</h3>
      <button
        type="button"
        class="lh__icon-btn"
        :disabled="loading"
        :aria-label="'刷新'"
        @click="load"
      >
        <RefreshCw class="lh__icon-btn-svg" :class="{ 'is-spin': loading }" />
      </button>
    </header>

    <ApiQueryState
      :loading="loading"
      :error="error"
      tone="emerald"
      error-title="联动健康加载失败"
      @retry="load"
    >
      <template v-if="data">
        <section class="lh__hero" :class="`is-${statusTone}`">
          <div class="lh__hero-main">
            <span class="lh__hero-score">{{ healthScore }}</span>
            <div class="lh__hero-copy">
              <strong>{{ statusText }}</strong>
              <span>{{ '联动健康指数' }}</span>
            </div>
          </div>
          <div class="lh__hero-chips">
            <span class="lh__chip" :class="data.haSync?.connected ? 'is-ok' : 'is-off'">
              <Radio class="lh__chip-icon" />
              {{ data.haSync?.connected ? 'HA 已连' : 'HA 断开' }}
            </span>
            <span class="lh__chip" :class="data.security?.anyoneHome ? 'is-ok' : 'is-muted'">
              <Users class="lh__chip-icon" />
              {{
                data.security?.anyoneHome
                  ? '{n} 人在家'.replace('{n}', String(data.security?.atHomeCount ?? 0))
                  : '无人在家'
              }}
            </span>
            <span
              class="lh__chip"
              :class="data.energyAutoLinkage?.enabled ? 'is-ok' : 'is-off'"
            >
              <Zap class="lh__chip-icon" />
              {{ data.energyAutoLinkage?.enabled ? '能源联动开' : '能源联动关' }}
            </span>
            <span
              class="lh__chip"
              :class="
                data.weatherAutoLinkage?.gaps?.length
                  ? 'is-off'
                  : data.weatherAutoLinkage?.enabled
                    ? 'is-ok'
                    : 'is-muted'
              "
            >
              <CloudSun class="lh__chip-icon" />
              {{
                data.weatherAutoLinkage?.gaps?.length
                  ? '天气联动缺配置'
                  : data.weatherAutoLinkage?.enabled
                    ? '天气联动开'
                    : '天气联动关'
              }}
            </span>
          </div>
        </section>

        <div class="lh__kpis">
          <article class="lh__kpi lh__kpi--energy" :class="{ 'is-off': !data.energyAutoLinkage?.enabled }">
            <span class="lh__kpi-icon" aria-hidden="true"><Zap /></span>
            <div class="lh__kpi-body">
              <em>{{ '能源联动' }}</em>
              <strong>{{ data.energyAutoLinkage?.enabled ? '已启用' : '未启用' }}</strong>
              <span>{{
                data.energyAutoLinkage?.gaps?.[0] ||
                (data.energyAutoLinkage?.enabled ? '配置完整' : '能源自动联动未开启')
              }}</span>
            </div>
          </article>

          <article
            class="lh__kpi lh__kpi--weather"
            :class="{ 'is-off': !!data.weatherAutoLinkage?.gaps?.length }"
          >
            <span class="lh__kpi-icon" aria-hidden="true"><CloudSun /></span>
            <div class="lh__kpi-body">
              <em>{{ '天气预警联动' }}</em>
              <strong>{{
                data.weatherAutoLinkage?.gaps?.length
                  ? '待完善'
                  : data.weatherAutoLinkage?.enabled
                    ? '已启用'
                    : '未启用'
              }}</strong>
              <span>{{
                data.weatherAutoLinkage?.gaps?.[0] ||
                (data.weatherAutoLinkage?.enabled ? '配置完整' : '天气预警联动未开启')
              }}</span>
            </div>
          </article>

          <article class="lh__kpi lh__kpi--security">
            <span class="lh__kpi-icon" aria-hidden="true"><Shield /></span>
            <div class="lh__kpi-body">
              <em>{{ '安防模式' }}</em>
              <strong>{{ modeLabel }}</strong>
              <span>{{
                data.security?.anyoneHome
                  ? '在家 · {n} 人'.replace('{n}', String(data.security?.atHomeCount ?? 0))
                  : '当前无人在家'
              }}</span>
            </div>
          </article>

          <article class="lh__kpi lh__kpi--ha" :class="{ 'is-off': !data.haSync?.connected }">
            <span class="lh__kpi-icon" aria-hidden="true"><Radio /></span>
            <div class="lh__kpi-body">
              <em>{{ 'HA 同步' }}</em>
              <strong :class="data.haSync?.connected ? 'is-ok' : 'is-warn'">
                {{ data.haSync?.connected ? '已连接' : '未连接' }}
              </strong>
              <span>
                {{ data.haSync?.ha_version || '—' }}
                ·
                {{ data.drift?.length ? `${data.drift.length} 条漂移` : '无近期错误' }}
              </span>
            </div>
          </article>
        </div>

        <div v-if="members.length" class="lh__people">
          <span
            v-for="m in members"
            :key="m.id"
            class="lh__person"
            :class="m.atHome ? 'is-home' : 'is-away'"
          >
            <i aria-hidden="true" />
            {{ m.name || m.id }}
            <em>{{ m.atHome ? '在家' : '外出' }}</em>
          </span>
        </div>

        <ul
          v-if="
            (data.energyAutoLinkage?.gaps?.length || 0) +
              (data.weatherAutoLinkage?.gaps?.length || 0) >
            0
          "
          class="lh__gaps"
        >
          <li v-for="gap in data.energyAutoLinkage?.gaps || []" :key="`e-${gap}`">{{ gap }}</li>
          <li v-for="gap in data.weatherAutoLinkage?.gaps || []" :key="`w-${gap}`">{{ gap }}</li>
        </ul>

        <div class="lh__split">
          <section class="lh__panel lh__panel--wizard">
            <header class="lh__panel-head">
              <span class="lh__panel-icon"><ScanSearch /></span>
              <div>
                <h4>{{ '漂移修复向导' }}</h4>
                <p>{{ '扫描联动器与 HA 配置差异' }}</p>
              </div>
            </header>

            <div class="lh__wizard">
              <template v-if="wizardStep === 0">
                <p v-if="scanError" class="lh__error">{{ scanError }}</p>
                <button
                  type="button"
                  class="lh__btn lh__btn--primary"
                  :disabled="scanning"
                  @click="scanDrift"
                >
                  <ScanSearch class="lh__btn-icon" />
                  {{ scanning ? '扫描中…' : '开始扫描' }}
                </button>
              </template>
              <template v-else-if="wizardStep === 1">
                <p class="lh__muted">
                  {{ '{n} 条漂移待修复'.replace('{n}', String(driftItems.length)) }}
                </p>
                <ul class="lh__drift">
                  <li v-for="item in driftItems" :key="`${item.domain}-${item.id}`">
                    <div>
                      <strong>{{ item.name }}</strong>
                      <span>{{ domainLabel[item.domain] || item.domain }}</span>
                    </div>
                    <button
                      type="button"
                      class="lh__btn lh__btn--ghost"
                      :disabled="repairing"
                      @click="repairOne(item, 'push')"
                    >
                      {{ '推送' }}
                    </button>
                  </li>
                </ul>
                <div class="lh__actions">
                  <button
                    type="button"
                    class="lh__btn lh__btn--primary"
                    :disabled="repairing"
                    @click="repairAll('push')"
                  >
                    {{ repairing ? '修复中…' : '全部推送' }}
                  </button>
                  <RouterLink :to="LINKAGE_HUB_ROUTES.root()" class="lh__btn lh__btn--link">
                    {{ '联动中心' }}
                  </RouterLink>
                </div>
              </template>
              <template v-else>
                <p class="lh__ok-banner">{{ '未发现配置漂移' }}</p>
                <RouterLink :to="LINKAGE_HUB_ROUTES.root()" class="lh__btn lh__btn--link">
                  {{ '联动中心' }}
                </RouterLink>
              </template>

              <ul v-if="repairLog.length" class="lh__log">
                <li v-for="(log, idx) in repairLog.slice(0, 4)" :key="idx">
                  <span :class="log.ok ? 'is-ok' : 'is-err'">{{ log.ok ? '✓' : '✗' }}</span>
                  {{ log.label }} — {{ log.message }}
                </li>
              </ul>
            </div>
          </section>

          <section class="lh__panel lh__panel--chart">
            <header class="lh__panel-head">
              <span class="lh__panel-icon"><Activity /></span>
              <div>
                <h4>{{ '事件密度' }}</h4>
                <p>{{ '近窗按小时分布' }}</p>
              </div>
            </header>
            <div ref="chartRef" class="lh__spark" />
          </section>
        </div>

        <section
          v-if="builtinConflicts.length"
          class="lh__panel lh__panel--warn"
        >
          <header class="lh__panel-head">
            <span class="lh__panel-icon is-warn"><AlertTriangle /></span>
            <div>
              <h4>{{ '模板与家庭模式冲突' }}</h4>
              <p>{{ '{n} 项可能互相覆盖'.replace('{n}', String(builtinConflicts.length)) }}</p>
            </div>
          </header>
          <ul class="lh__bullets">
            <li v-for="(c, idx) in builtinConflicts" :key="`${c.templateId}-${idx}`">
              <strong>{{ c.automationName || c.templateId }}</strong>
              <span>↔ {{ c.modeName }}：{{ c.reason }}</span>
            </li>
          </ul>
          <button
            type="button"
            class="lh__btn lh__btn--warn"
            :disabled="resolving"
            @click="resolveConflicts"
          >
            {{ resolving ? '处理中…' : '一键消解（优先家庭模式）' }}
          </button>
        </section>

        <section
          v-if="entityConflicts.length"
          class="lh__panel lh__panel--warn"
        >
          <header class="lh__panel-head">
            <span class="lh__panel-icon is-warn"><AlertTriangle /></span>
            <div>
              <h4>{{ '实体操作冲突' }}</h4>
              <p>{{ '{n} 个实体被多个联动器争抢'.replace('{n}', String(entityConflicts.length)) }}</p>
            </div>
          </header>
          <ul class="lh__bullets">
            <li v-for="(c, idx) in entityConflicts" :key="`entity-${c.entityId}-${idx}`">
              <strong>{{ conflictEntityLabel(c.entityId) }}</strong>
              <span v-if="conflictEntityNames(c).length">
                ：{{ conflictEntityNames(c).join('、') }}<em v-if="c.actionType">（{{ c.actionType }}）</em>
              </span>
              <p class="lh__muted">{{ conflictReason(c) }}</p>
            </li>
          </ul>
          <RouterLink :to="LINKAGE_HUB_ROUTES.root()" class="lh__btn lh__btn--link">
            {{ '前往联动中心检查' }}
          </RouterLink>
        </section>

        <section
          v-if="data.linkageFailures?.length"
          class="lh__panel lh__panel--warn"
        >
          <header class="lh__panel-head">
            <span class="lh__panel-icon is-warn"><AlertTriangle /></span>
            <div>
              <h4>{{ '联动失败' }}</h4>
              <p>{{ '{n} 条近期失败'.replace('{n}', String(data.linkageFailures.length)) }}</p>
            </div>
          </header>
          <ul class="lh__bullets">
            <li v-for="f in data.linkageFailures" :key="f.id">{{ f.detail }}</li>
          </ul>
          <RouterLink
            :to="SETTINGS_ROUTES.securityModes('linkage')"
            class="lh__btn lh__btn--link"
          >
            {{ '查看安防联动配置' }}
          </RouterLink>
        </section>

        <section v-if="timeline.length" class="lh__panel">
          <header class="lh__panel-head">
            <span class="lh__panel-icon"><History /></span>
            <div>
              <h4>{{ '关键事件' }}</h4>
              <p>{{ '模式触发、漂移与联动失败' }}</p>
            </div>
          </header>
          <ul class="lh__timeline">
            <li v-for="ev in timeline" :key="ev.key" :class="`is-${ev.kind || 'other'}`">
              <span class="lh__time">{{ ev.time }}</span>
              <span class="lh__kind">{{ ev.kindLabel }}</span>
              <span class="lh__label">{{ ev.label }}</span>
            </li>
          </ul>
        </section>

        <section v-if="data.modeTriggers?.length" class="lh__panel">
          <header class="lh__panel-head">
            <span class="lh__panel-icon"><Home /></span>
            <div>
              <h4>{{ '家庭模式触发' }}</h4>
            </div>
          </header>
          <ul class="lh__timeline">
            <li v-for="t in data.modeTriggers.slice(0, 5)" :key="t.id">
              <span class="lh__kind">{{ t.modeName }}</span>
              <span class="lh__label">
                {{ homeModeLogSourceLabel(t.source) }} · {{ t.success ? '成功' : '失败' }}
              </span>
            </li>
          </ul>
        </section>

        <section v-if="data.ruleHistory?.length" class="lh__panel">
          <header class="lh__panel-head">
            <span class="lh__panel-icon"><Bell /></span>
            <div>
              <h4>{{ '告警规则修订' }}</h4>
            </div>
          </header>
          <div v-for="r in data.ruleHistory" :key="r.ruleId" class="lh__rule">
            <button type="button" class="lh__rule-head" @click="toggleRule(r.ruleId)">
              <span>{{ r.ruleName }}</span>
              <em>{{ `${r.entries?.length || 0} 条` }}</em>
            </button>
            <ul v-if="expandedRuleId === r.ruleId && r.entries?.length" class="lh__log">
              <li v-for="(e, idx) in r.entries.slice(0, 5)" :key="idx">
                <span class="lh__muted">{{
                  formatShortDateTimeOrDash(e.at, { use24h: true })
                }}</span>
                <code>{{ e.condition }}</code>
              </li>
            </ul>
          </div>
          <RouterLink :to="SETTINGS_ROUTES.alerts()" class="lh__btn lh__btn--link">
            {{ '管理告警规则' }}
          </RouterLink>
        </section>
      </template>
    </ApiQueryState>
  </div>
</template>

<script setup>
/**
 * LinkageHealthPanel - 联动健康面板组件
 * 职责：聚合展示联动健康指数、HA 同步状态、能源/天气/安防联动健康、漂移修复向导、
 *      模板与实体冲突、关键事件时间线、家庭模式触发与告警规则修订记录。
 * 关键依赖：
 * - useLinkageHealthPanel：提供所有数据与操作（扫描、修复、消解冲突等）；
 * - useHubChart + buildHourAreaOption：渲染事件密度按小时分布的小图。
 * Props:
 * - embedded：嵌入模式开关，影响头布局显示。
 */
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  RefreshCw,
  Zap,
  Shield,
  Radio,
  Activity,
  CloudSun,
  ScanSearch,
  AlertTriangle,
  History,
  Home,
  Bell,
  Users,
} from '@lucide/vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { useLinkageHealthPanel } from '@/composables/orchestrator/useLinkageHealthPanel'
import { useHubChart } from '@/composables/life/useLifeChartHost'
import { buildHourAreaOption } from '@/utils/chart/life-charts.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { LINKAGE_HUB_ROUTES } from '@/utils/registry/linkage-route.util'

defineProps({
  embedded: { type: Boolean, default: false },
})

const {
  loading,
  error,
  data,
  expandedRuleId,
  resolving,
  modeLabel,
  members,
  healthScore,
  statusTone,
  statusText,
  eventSeries,
  timeline,
  builtinConflicts,
  entityConflicts,
  conflictEntityNames,
  conflictEntityLabel,
  conflictReason,
  load,
  resolveConflicts,
  toggleRule,
  formatShortDateTimeOrDash,
  homeModeLogSourceLabel,
  driftItems,
  scanning,
  repairing,
  wizardStep,
  repairLog,
  scanError,
  scanDrift,
  repairOne,
  repairAll,
  domainLabel,
} = useLinkageHealthPanel()

const chartRef = ref(null)
// 事件密度按小时分布的小图；eventSeries 变化时自动重绘
useHubChart(
  chartRef,
  () =>
    buildHourAreaOption(eventSeries.value, {
      accent: '#2dd4bf',
      name: '事件数',
      emptyLabel: '暂无事件',
    }),
  [eventSeries],
)

defineExpose({ load })
</script>

<style src="./styles/LinkageHealthPanel.css"></style>
