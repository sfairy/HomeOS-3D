<!--
组件：OverviewSection.vue
所属模块：frontend / src / views / settings / system / diagnostics
职责：诊断总览区段。通过 OrchTabs 切换总览 / 前端性能 / HA 连接 / 配置健康 / Redis 等子页签，
      展示 KPI、流水线节点、配置健康评分与缺口、连接服务卡片。数据由 useDiagnosticsSection 注入。
关键依赖：
  - SettingsCard / SettingsCardIntro / SettingsOrchTabs / SettingsFlowBand：卡片与流程
  - VProgressBar / FloorplanRendererBenchmark：进度条与渲染基准
  - useEntitiesStore：实体数量统计
  - useDiagnosticsSection：注入总览数据
  - BACKEND_MEM_WARN_PCT：内存告警阈值
数据来源：useDiagnosticsSection() 返回的 overviewTab / summaryKpis / configHealth 等
-->
<template>
  <!-- Tab：系统健康总览 -->
  <div class="settings-hub-section diag-page">
    <div class="diag-overview-shell">
      <SettingsOrchTabs
        v-model="overviewTab"
        :tabs="overviewTabs"
        plain
        class="diag-overview-tabs"
      />

      <div
        v-show="overviewTab === 'summary'"
        class="diag-overview-panel diag-overview-panel--summary"
      >
      <SettingsCard full static extra-class="diag-hero-card">
        <div class="diag-hero-layout">
          <div class="diag-hero-main">
            <div :class="['diag-hero-orb', `diag-hero-orb--${overallStatus.tone}`]">
              <component :is="overallStatus.icon" class="w-5 h-5 shrink-0" />
              <span class="diag-hero-orb__ring" aria-hidden="true" />
            </div>
            <div class="diag-hero-copy">
              <p :class="['diag-hero-eyebrow', `diag-hero-eyebrow--${overallStatus.tone}`]">
                {{ '系统健康' }}
              </p>
              <h3 class="diag-hero-title">{{ overallStatus.label }}</h3>
              <p class="diag-hero-desc">{{ overallStatus.detail }}</p>
            </div>
          </div>
          <div
            v-if="lastFetched"
            class="diag-hero-chip"
            :title="'上次拉取诊断数据的时间'"
          >
            <RefreshCw class="w-4 h-4 shrink-0" />
            <div class="diag-hero-chip__text">
              <span class="diag-hero-chip__label">{{ '上次刷新' }}</span>
              <span class="diag-hero-chip__val">{{ lastFetched }}</span>
            </div>
          </div>
        </div>

        <SettingsFlowBand
          :steps="diagFlowSteps"
          class="diag-flow-band"
          band-class="diag-flow-band__shell"
          collapsible
          default-collapsed
          toggle-label="链路概览"
          :collapsed-summary="diagFlowSummary"
        />
      </SettingsCard>

      <SettingsCard
        v-if="configHealthScore != null"
        full
        static
        extra-class="diag-config-health-card"
      >
        <div class="diag-config-health">
          <div
            :class="['diag-config-health__ring', `diag-config-health__ring--${configHealthTone}`]"
            :style="{ '--health-pct': configHealthScore }"
          >
            <div class="diag-config-health__ring-inner">
              <span class="diag-config-health__score">{{ configHealthScore }}</span>
              <span class="diag-config-health__unit">/100</span>
            </div>
          </div>
          <div class="diag-config-health__copy">
            <p class="diag-config-health__eyebrow">配置健康分</p>
            <h3 class="diag-config-health__title">{{ configHealthTitle }}</h3>
            <p class="diag-config-health__desc">{{ configHealthDesc }}</p>
            <ul v-if="configHealthGaps.length" class="diag-config-health__gaps">
              <li
                v-for="gap in configHealthGaps.slice(0, 6)"
                :key="gap.id"
                class="diag-config-health__gap-card"
              >
                <RouterLink v-if="gap.route" :to="gap.route" class="diag-config-health__gap-link">{{
                  gap.label
                }}</RouterLink>
                <span v-else class="diag-config-health__gap-text">{{ gap.label }}</span>
              </li>
            </ul>
            <RouterLink :to="SETTINGS_ROUTES.bindings()" class="diag-config-health__link"
              >前往绑定配置</RouterLink
            >
          </div>
        </div>
      </SettingsCard>

      <div v-if="issueHints.length" class="diag-alert-stack">
        <div
          v-for="(hint, i) in issueHints"
          :key="i"
          :class="['diag-alert', hint.tone === 'amber' ? 'diag-alert--amber' : 'diag-alert--sky']"
        >
          <AlertCircle class="diag-alert__icon" />
          <span class="diag-alert__text">
            {{ hint.text }}
            <RouterLink v-if="hint.linkTo" :to="hint.linkTo" class="diag-hint-link">{{
              hint.linkLabel
            }}</RouterLink>
            <template v-if="hint.suffix">{{ hint.suffix }}</template>
          </span>
        </div>
      </div>

      <div class="diag-metric-grid">
        <div
          v-for="tile in summaryKpis"
          :key="tile.key"
          class="diag-metric-tile"
          :style="{ '--tile-accent': tile.accent }"
        >
          <div class="diag-metric-tile__icon">
            <component :is="tile.icon" class="w-4 h-4" />
          </div>
          <div class="diag-metric-tile__body">
            <span :class="['diag-metric-tile__val', tile.small && 'diag-metric-tile__val--sm']">
              {{ tile.value
              }}<span v-if="tile.suffix" class="diag-metric-tile__suffix">{{ tile.suffix }}</span>
            </span>
            <span class="diag-metric-tile__lbl">{{ tile.label }}</span>
          </div>
        </div>
      </div>
    </div>

    <div
      v-show="overviewTab === 'connect'"
      class="diag-overview-panel diag-overview-panel--connect"
    >
      <div class="diag-service-grid">
        <div
          v-for="card in connectServiceCards"
          :key="card.id"
          :class="[
            'diag-service-card',
            `diag-service-card--${card.tone}`,
            `diag-service-card--${card.id}`,
          ]"
        >
          <span
            :class="['diag-service-card__dot', `diag-service-card__dot--${card.tone}`]"
            aria-hidden="true"
          />
          <div class="diag-service-card__icon">
            <component :is="card.icon" class="w-6 h-6" />
          </div>
          <div class="diag-service-card__body">
            <span class="diag-service-card__label">{{ card.label }}</span>
            <span class="diag-service-card__primary">{{ card.primary }}</span>
            <span class="diag-service-card__secondary">{{ card.secondary }}</span>
          </div>
        </div>
      </div>

      <SettingsCard full static extra-class="diag-section-card">
        <h4 class="diag-section-title">{{ '连接详情' }}</h4>
        <div class="diag-kv-grid diag-kv-grid--3">
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ 'HA 连接' }}</span>
            <span class="diag-kv-item__v" :class="haOk ? 'do-text-success' : 'do-text-danger'">
              {{ haOk ? '已连接' : '未连接' }}
            </span>
          </div>
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ 'HA 版本' }}</span>
            <span class="diag-kv-item__v diag-kv-item__v--mono diag-kv-item__v--wrap" :title="diag?.ha?.version">{{
              diag?.ha?.version || '—'
            }}</span>
          </div>
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ 'HA WS 角色' }}</span>
            <span class="diag-kv-item__v" :class="haWsModeClass">{{ haWsModeLabel }}</span>
          </div>
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ 'WebSocket' }}</span>
            <span class="diag-kv-item__v font-mono">{{ wsClients }} {{ '客户端' }}</span>
          </div>
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ 'Redis' }}</span>
            <span class="diag-kv-item__v" :class="redisStatusClass">{{ redisStatusLabel }}</span>
          </div>
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ '前端 Trace' }}</span>
            <button
              type="button"
              class="diag-kv-item__v diag-kv-item__v--mono diag-kv-item__v--copy"
              :title="pageTraceId ? '点击复制完整 Trace' : ''"
              :disabled="!pageTraceId"
              @click="copyDiagValue(pageTraceId, 'trace')"
            >
              {{ pageTraceCopied ? '已复制' : pageTraceId || '—' }}
            </button>
          </div>
        </div>
        <div class="diag-quick-links">
          <RouterLink :to="SETTINGS_ROUTES.connection()" class="diag-quick-link">{{
            'HA 连接'
          }}</RouterLink>
          <RouterLink :to="SETTINGS_ROUTES.executionHistory()" class="diag-quick-link">{{
            '执行历史'
          }}</RouterLink>
          <RouterLink to="/security?tab=monitor" class="diag-quick-link">{{
            '监控中心'
          }}</RouterLink>
          <RouterLink to="/events" class="diag-quick-link">{{ '事件历史' }}</RouterLink>
          <RouterLink to="/mode-logs" class="diag-quick-link">{{ '模式触发日志' }}</RouterLink>
        </div>
        <p class="diag-quick-links-note">
          {{
            '本页负责系统/HA 基建诊断；设备健康与用量热图请在仪表板「三合一滑动」中查看对应页。'
          }}
        </p>
      </SettingsCard>

      <SettingsCard
        v-if="licenseStatus?.required"
        full
        static
        extra-class="diag-section-card"
      >
        <h4 class="diag-section-title">{{ '商业授权' }}</h4>
        <div class="diag-kv-grid diag-kv-grid--3">
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ '状态' }}</span>
            <span
              class="diag-kv-item__v"
              :class="licenseStatus.allowed ? 'do-text-success' : 'do-text-danger'"
            >
              {{ licenseStatus.allowed ? '已激活' : '未激活' }}
            </span>
          </div>
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ '许可证 Key' }}</span>
            <button
              type="button"
              class="diag-kv-item__v diag-kv-item__v--mono diag-kv-item__v--copy"
              :title="licenseKeyFull ? '点击复制完整 Key' : ''"
              :disabled="!licenseKeyFull"
              @click="copyDiagValue(licenseKeyFull, 'key')"
            >
              {{ licenseKeyCopied ? '已复制' : licenseKeyDisplay }}
            </button>
          </div>
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ '设备指纹' }}</span>
            <button
              type="button"
              class="diag-kv-item__v diag-kv-item__v--mono diag-kv-item__v--copy"
              :title="licenseStatus.instanceId ? '点击复制完整指纹' : ''"
              :disabled="!licenseStatus.instanceId"
              @click="copyDiagValue(licenseStatus.instanceId, 'hwid')"
            >
              {{ licenseHwidCopied ? '已复制' : licenseHwidDisplay }}
            </button>
          </div>
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ '授权有效期' }}</span>
            <span class="diag-kv-item__v">{{ licenseExpiresLabel }}</span>
          </div>
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ '公钥指纹' }}</span>
            <button
              type="button"
              class="diag-kv-item__v diag-kv-item__v--mono diag-kv-item__v--copy"
              :title="licensePubkeyFp ? '点击复制公钥指纹' : ''"
              :disabled="!licensePubkeyFp"
              @click="copyDiagValue(licensePubkeyFp, 'pubkey')"
            >
              {{ licensePubkeyCopied ? '已复制' : licensePubkeyFp || '—' }}
            </button>
          </div>
        </div>
      </SettingsCard>
    </div>

    <div
      v-show="overviewTab === 'runtime'"
      class="diag-overview-panel diag-overview-panel--runtime"
    >
      <div class="diag-metric-grid diag-metric-grid--compact">
        <div
          v-for="tile in runtimeKpis"
          :key="tile.key"
          class="diag-metric-tile"
          :style="{ '--tile-accent': tile.accent }"
        >
          <div class="diag-metric-tile__icon">
            <component :is="tile.icon" class="w-4 h-4" />
          </div>
          <div class="diag-metric-tile__body">
            <span :class="['diag-metric-tile__val', tile.small && 'diag-metric-tile__val--sm']">
              {{ tile.value
              }}<span v-if="tile.suffix" class="diag-metric-tile__suffix">{{ tile.suffix }}</span>
            </span>
            <span class="diag-metric-tile__lbl">{{ tile.label }}</span>
          </div>
        </div>
      </div>

      <div class="diag-gauge-grid">
        <div class="diag-gauge-card diag-gauge-card--cpu">
          <div class="diag-gauge-card__head">
            <span class="diag-gauge-card__title"><Cpu class="w-5 h-5" /> CPU</span>
            <span :class="['diag-gauge-card__pct', cpuPct >= 85 && 'diag-gauge-card__pct--warn']"
              >{{ cpuPct }}%</span
            >
          </div>
          <VProgressBar
            :value="cpuPct"
            variant="resource"
            :color-value="cpuPct"
            size="sm"
            auto-glow
          />
          <p class="diag-gauge-card__hint">
            {{ cpuPct >= 85 ? '负载偏高，建议排查自动化与 WS 扇出' : 'Node 进程 CPU 占用' }}
          </p>
        </div>
        <div class="diag-gauge-card diag-gauge-card--memory">
          <div class="diag-gauge-card__head">
            <span class="diag-gauge-card__title"><Database class="w-5 h-5" /> {{ '堆内存' }}</span>
            <span
              :class="[
                'diag-gauge-card__pct',
                memPct >= BACKEND_MEM_WARN_PCT && 'diag-gauge-card__pct--warn',
              ]"
              >{{ memPct }}%</span
            >
          </div>
          <VProgressBar
            :value="memPct"
            variant="resource"
            :color-value="memPct"
            size="sm"
            auto-glow
          />
          <p class="diag-gauge-card__hint">
            {{
              memPct >= BACKEND_MEM_WARN_PCT
                ? `堆内存占 V8 上限 ${memPct}%，建议关注实体缓存或重启 backend`
                : `${memLabel} · 占 V8 堆上限 ${memPct}%`
            }}
          </p>
        </div>
      </div>

      <SettingsCard full static extra-class="diag-section-card">
        <h4 class="diag-section-title">{{ '进程与数据库' }}</h4>
        <div class="diag-kv-grid diag-kv-grid--3">
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ '数据库' }}</span>
            <span class="diag-kv-item__v">{{ health?.dbSize ?? '—' }}</span>
          </div>
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ '后端版本' }}</span>
            <span class="diag-kv-item__v font-mono">{{ health?.version ?? '—' }}</span>
          </div>
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ 'RSS / 堆' }}</span>
            <span class="diag-kv-item__v diag-kv-item__v--mono">{{ runtimeMemoryLabel }}</span>
          </div>
          <div v-if="memoryDetail" class="diag-kv-item">
            <span class="diag-kv-item__k">{{ '实体 L1 缓存' }}</span>
            <span class="diag-kv-item__v font-mono"
              >~{{ memoryDetail.estimatedEntityStoreMb }} MB ·
              {{ memoryDetail.entityCount }} 条</span
            >
          </div>
          <div v-if="memoryDetail" class="diag-kv-item">
            <span class="diag-kv-item__k">{{ 'WS 补发缓冲' }}</span>
            <span class="diag-kv-item__v font-mono"
              >{{ memoryDetail.recentChangesCount }} / {{ memoryDetail.recentChangesMax }}</span
            >
          </div>
        </div>
        <div class="diag-quick-links">
          <RouterLink :to="SETTINGS_ROUTES.profiles('backup')" class="diag-quick-link">{{
            '备份与还原'
          }}</RouterLink>
          <RouterLink :to="SETTINGS_ROUTES.retention()" class="diag-quick-link">{{
            '保留天数'
          }}</RouterLink>
        </div>
      </SettingsCard>
    </div>

    <div v-show="overviewTab === 'perf'" class="diag-overview-panel diag-overview-panel--perf">
      <div class="diag-perf-hero">
        <div
          v-for="m in perfHeroMetrics"
          :key="m.label"
          class="diag-perf-hero__card"
          :style="{ '--perf-accent': m.accent }"
        >
          <span class="diag-perf-hero__label">{{ m.label }}</span>
          <span class="diag-perf-hero__val">{{ m.value }}</span>
          <span v-if="m.sub" class="diag-perf-hero__sub">{{ m.sub }}</span>
        </div>
      </div>

      <SettingsCard full static extra-class="diag-section-card">
        <h4 class="diag-section-title">{{ 'HA 同步阶段延迟' }}</h4>
        <div v-if="haSyncLatencyRows.length" class="diag-kv-grid diag-kv-grid--3">
          <div v-for="row in haSyncLatencyRows" :key="row.stage" class="diag-kv-item">
            <span class="diag-kv-item__k">{{ row.label }}</span>
            <span class="diag-kv-item__v font-mono"
              >p50 {{ row.p50 }} · p99 {{ row.p99 }} · n={{ row.count }}</span
            >
          </div>
        </div>
        <p v-else class="diag-section-hint">{{ '暂无样本；前端连接后会上报 apply 延迟' }}</p>
        <p v-if="haWsDeferredDroppedLabel" class="diag-section-hint">
          {{ haWsDeferredDroppedLabel }}
        </p>

        <h4 class="diag-section-title" style="margin-top: 1rem">{{ '实体 Store 统计' }}</h4>
        <div class="diag-kv-grid diag-kv-grid--3">
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ '派生索引重建' }}</span>
            <span class="diag-kv-item__v font-mono">{{
              entitiesStore.perfStats.derivedRebuilds
            }}</span>
          </div>
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ 'WS 批次数' }}</span>
            <span class="diag-kv-item__v font-mono"
              >{{ entitiesStore.perfStats.wsBatchCount }} ·
              {{ entitiesStore.perfStats.lastWsBatchSize }}</span
            >
          </div>
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ '关键 apply' }}</span>
            <span class="diag-kv-item__v font-mono"
              >{{ entitiesStore.perfStats.criticalApplyCount }} ·
              {{ entitiesStore.perfStats.lastCriticalApplyMs }}ms</span
            >
          </div>
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ '传感器 apply' }}</span>
            <span class="diag-kv-item__v font-mono"
              >{{ entitiesStore.perfStats.lastSensorApplyMs }}ms</span
            >
          </div>
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ '状态监听器' }}</span>
            <span class="diag-kv-item__v diag-kv-item__v--wrap">{{ listenerStatsLabel }}</span>
          </div>
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ '待派发队列' }}</span>
            <span class="diag-kv-item__v font-mono">{{
              entitiesStore.getPendingListenerCount()
            }}</span>
          </div>
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ 'WS 域订阅' }}</span>
            <span class="diag-kv-item__v diag-kv-item__v--wrap">{{ subscribeDomainsLabel }}</span>
          </div>
          <div class="diag-kv-item">
            <span class="diag-kv-item__k">{{ 'FPS 调度器' }}</span>
            <span class="diag-kv-item__v">{{ fpsSchedulerLabel }}</span>
          </div>
        </div>

        <div class="diag-action-bar">
          <button
            type="button"
            :class="['diag-action-btn', baselineSampling && 'diag-action-btn--active']"
            @click="toggleBaselineSampling"
          >
            <Activity class="w-5 h-5" />
            {{ baselineSampling ? '停止基线采样' : '开始基线采样' }}
          </button>
          <button
            type="button"
            class="diag-action-btn diag-action-btn--primary"
            :disabled="!canCopyBaseline"
            @click="copyBaselineJson"
          >
            <Copy class="w-5 h-5" />
            {{ '复制基线 JSON' }}
          </button>
        </div>
        <div v-if="baselineSampling || baselinePreview" class="diag-baseline-chip">
          <template v-if="baselineSampling">
            <span class="diag-baseline-chip__live" aria-hidden="true" />
            <span>{{ '采样中…' }}</span>
          </template>
          <span
            >平均 FPS <strong>{{ baselinePreview?.fps?.avg ?? '—' }}</strong></span
          >
          <span class="diag-baseline-chip__sep" />
          <span
            >堆内存峰值 <strong>{{ baselinePreview?.heapMb?.max ?? '—' }} MB</strong></span
          >
          <span v-if="baselinePreview?.fps?.samples" class="diag-baseline-chip__meta">
            {{ baselinePreview.fps.samples }} 帧样本
          </span>
        </div>
      </SettingsCard>

      <SettingsCard full static extra-class="diag-section-card">
        <SettingsCardIntro
          :icon="LayoutGrid"
          icon-class="do-icon-info"
          orb-class="do-orb-info"
          eyebrow="户型图渲染基准"
          :description="'DOM 热点 vs Canvas2D 并排 FPS 对比'"
        />
        <FloorplanRendererBenchmark class="mt-5" />
      </SettingsCard>
    </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  Activity,
  RefreshCw,
  AlertCircle,
  Database,
  LayoutGrid,
  Cpu,
  Copy,
} from '@lucide/vue'
import { RouterLink } from 'vue-router'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/page-shell/SettingsCardIntro.vue'
import SettingsOrchTabs from '@/views/settings/shared/layout/SettingsOrchTabs.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import FloorplanRendererBenchmark from '@/views/settings/display/FloorplanRendererBenchmark.vue'
import VProgressBar from '@/components/common/base/VProgressBar.vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useDiagnosticsSection } from './useDiagnosticsSection'
import { BACKEND_MEM_WARN_PCT } from './constants'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

const entitiesStore = useEntitiesStore()

const {
  overviewTab,
  overviewTabs,
  overallStatus,
  lastFetched,
  pipelineNodes,
  issueHints,
  configHealthScore,
  configHealthTone,
  configHealthGaps,
  configHealth,
  summaryKpis,
  connectServiceCards,
  haOk,
  diag,
  haWsModeLabel,
  haWsModeClass,
  wsClients,
  redisStatusLabel,
  redisStatusClass,
  pageTraceId,
  runtimeKpis,
  runtimeMemoryLabel,
  cpuPct,
  memPct,
  memLabel,
  memoryDetail,
  health,
  perfHeroMetrics,
  baselineSampling,
  baselinePreview,
  canCopyBaseline,
  toggleBaselineSampling,
  copyBaselineJson,
  listenerStatsLabel,
  subscribeDomainsLabel,
  fpsSchedulerLabel,
  licenseStatus,
} = useDiagnosticsSection([
  'overviewTab',
  'overviewTabs',
  'overallStatus',
  'lastFetched',
  'pipelineNodes',
  'issueHints',
  'configHealthScore',
  'configHealthTone',
  'configHealthGaps',
  'configHealth',
  'summaryKpis',
  'connectServiceCards',
  'haOk',
  'diag',
  'haWsModeLabel',
  'haWsModeClass',
  'wsClients',
  'redisStatusLabel',
  'redisStatusClass',
  'pageTraceId',
  'runtimeKpis',
  'runtimeMemoryLabel',
  'cpuPct',
  'memPct',
  'memLabel',
  'memoryDetail',
  'health',
  'perfHeroMetrics',
  'baselineSampling',
  'baselinePreview',
  'canCopyBaseline',
  'toggleBaselineSampling',
  'copyBaselineJson',
  'listenerStatsLabel',
  'subscribeDomainsLabel',
  'fpsSchedulerLabel',
  'licenseStatus',
])

const HA_SYNC_STAGE_LABELS = {
  ha_deferred_dwell: 'HA 延期排队',
  ha_receive: 'HA 解析路由',
  ingress_coalesce_dwell: 'Ingress 合并等待',
  ingress_flush: 'Ingress 发出',
  hot_apply: 'Hot apply',
  ws_emit: 'WS emit',
  fe_critical_apply: 'FE 关键',
  fe_sensor_apply: 'FE 传感器',
  fe_e2e_apply: 'FE E2E',
}

const haSyncLatencyRows = computed(() => {
  const rows = diag.value?.haSyncLatency
  if (!Array.isArray(rows)) return []
  return rows
    .filter((r) => r && ((r.count ?? 0) > 0 || (r.p99 ?? 0) > 0))
    .map((r) => ({
      stage: String(r.stage),
      label: HA_SYNC_STAGE_LABELS[String(r.stage)] || String(r.stage),
      count: r.count ?? 0,
      p50: r.p50 ?? 0,
      p99: r.p99 ?? 0,
    }))
})

const haWsDeferredDroppedLabel = computed(() => {
  const n = Number(diag.value?.haWsDeferredDroppedTotal)
  if (!Number.isFinite(n) || n <= 0) return ''
  return `HA WS 延期队列累计丢弃 ${n} 条（洪峰过载）`
})

const pageTraceCopied = ref(false)
const licenseKeyCopied = ref(false)
const licenseHwidCopied = ref(false)
const licensePubkeyCopied = ref(false)

/** 复制反馈旗标：kind 必须与按钮一一对应，禁止共用 */
const COPY_FLAGS = {
  trace: pageTraceCopied,
  key: licenseKeyCopied,
  hwid: licenseHwidCopied,
  pubkey: licensePubkeyCopied,
}

const licenseKeyFull = computed(() => {
  const key = licenseStatus.value?.activationCodeHint
  if (typeof key === 'string' && key.trim()) return key.trim()
  return ''
})

const licenseKeyDisplay = computed(() => {
  if (licenseKeyFull.value) return licenseKeyFull.value
  if (licenseStatus.value?.allowed) return '（无编号）'
  return '—'
})

/** 完整指纹展示：每 4 位分组便于扫读，复制仍用原始指纹 */
const licenseHwidDisplay = computed(() => {
  const hwid = String(licenseStatus.value?.instanceId || '').trim()
  if (!hwid) return '—'
  return hwid.replace(/(.{4})(?=.)/g, '$1 ')
})

const licensePubkeyFp = computed(() =>
  String(licenseStatus.value?.publicKeyFingerprint || '').trim(),
)

const licenseExpiresLabel = computed(() => {
  if (!licenseStatus.value?.allowed) return '—'
  const raw = licenseStatus.value?.leaseExpiresAt
  if (!raw) return '永久'
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms)) return '—'
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return '—'
  }
})

const copyResetTimers = /** @type {Record<keyof typeof COPY_FLAGS, number>} */ ({
  trace: 0,
  key: 0,
  hwid: 0,
  pubkey: 0,
})

/**
 * @param {unknown} raw
 * @param {keyof typeof COPY_FLAGS} kind
 */
async function copyDiagValue(raw, kind) {
  const text = String(raw || '').trim()
  const flag = COPY_FLAGS[kind]
  if (!text || !flag) return
  try {
    await navigator.clipboard.writeText(text)
    flag.value = true
    window.clearTimeout(copyResetTimers[kind])
    copyResetTimers[kind] = window.setTimeout(() => {
      flag.value = false
    }, 2000)
  } catch {
    /* 忽略 */
  }
}

const configHealthTitle = computed(() => {
  const s = configHealthScore.value
  if (s == null) return '—'
  if (s >= 85) return '配置完整'
  if (s >= 70) return '基本可用'
  return '需完善绑定'
})

const configHealthDesc = computed(() => {
  const ch = configHealth.value
  if (!ch) return ''
  const parts = []
  if (!ch.haConnected) parts.push('HA 未连接')
  if (ch.bindingGapCount > 0) parts.push(`绑定缺口 ${ch.bindingGapCount} 项`)
  if (ch.placeholderAutomationCount > 0)
    parts.push(`占位自动化 ${ch.placeholderAutomationCount} 条`)
  if (ch.placeholderSceneCount > 0) parts.push(`占位场景 ${ch.placeholderSceneCount} 条`)
  if (ch.advisorActionsBound === 0) parts.push('顾问快捷动作未绑定')
  return parts.length ? parts.join('；') : '绑定与联动配置良好'
})

const diagFlowSummary = computed(() => {
  const ha = haOk.value ? 'HA 在线' : 'HA 离线'
  return `${ha} · ${redisStatusLabel.value}`
})

const diagFlowSteps = computed(() =>
  (pipelineNodes.value || []).map((node) => ({
    label: node.label,
    meta: node.meta,
    icon: node.icon,
    tone: node.tone === 'ok' ? 'emerald' : node.tone === 'bad' ? 'rose' : 'sky',
  })),
)
</script>

<style scoped src="./styles/diagnostics-theme.css"></style>
