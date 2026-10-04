<!--
组件：SettingsOverviewStrip.vue
所属模块：frontend / src / views / settings / shared / layout
职责：设置总览条。两栏 hub-stat（配置健康评分 + 首装清单），整卡可跳转，不参与 stage 纵向撑满。
      挂载时拉取配置健康评分与最近设置 Tab。
关键依赖：
  - fetchConfigHealth：配置健康评分 API
  - useSetupChecklist：首装清单
  - SETTINGS_ROUTES / getRecentSettingsTabs / tabLabel：路由与标签
  - logger：日志
数据来源：fetchConfigHealth 与 useSetupChecklist
-->
<script setup lang="ts">
/**
 * 职责：渲染 views/SettingsOverviewStrip 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { fetchConfigHealth } from '@/services/api/system'
import { useSetupChecklist } from '@/composables/settings/useSetupChecklist'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { getRecentSettingsTabs } from '@/utils/registry/settings-recent-tabs.util'
import { tabLabel } from '@/utils/registry/settings-nav.util'
import { logger } from '@/utils/core/logger'

type ConfigHealth = {
  score?: number
  haConnected?: boolean
  bindingGapCount?: number
  placeholderAutomationCount?: number
  placeholderSceneCount?: number
}

/** 最近访问的设置面板 → 深链构建（无 section 时落到面板默认页） */
const TAB_DEEP_LINKS: Record<string, () => string> = {
  favorites: () => SETTINGS_ROUTES.favorites(),
  general: () => SETTINGS_ROUTES.general(),
  params: () => SETTINGS_ROUTES.params(),
  profiles: () => SETTINGS_ROUTES.profiles(),
  'home-mode': () => SETTINGS_ROUTES.homeMode(),
  bindings: () => SETTINGS_ROUTES.bindings(),
  rooms: () => SETTINGS_ROUTES.rooms(),
  layout: () => SETTINGS_ROUTES.layout(),
  alerts: () => SETTINGS_ROUTES.alerts(),
  'security-modes': () => SETTINGS_ROUTES.securityModes(),
  voice: () => SETTINGS_ROUTES.voice(),
  agent: () => SETTINGS_ROUTES.agent(),
  diagnostics: () => SETTINGS_ROUTES.diagnostics(),
  connection: () => SETTINGS_ROUTES.connection(),
  'setup-wizard': () => SETTINGS_ROUTES.setupWizard(),
  access: () => SETTINGS_ROUTES.access(),
  widgets: () => SETTINGS_ROUTES.widgets(),
  assets: () => SETTINGS_ROUTES.assets(),
  embeds: () => SETTINGS_ROUTES.embeds(),
  'smart-charge': () => SETTINGS_ROUTES.smartCharge(),
  family: () => SETTINGS_ROUTES.family(),
  floating: () => SETTINGS_ROUTES.floating(),
  retention: () => SETTINGS_ROUTES.retention(),
  devices: () => SETTINGS_ROUTES.devices(),
}

const health = ref<ConfigHealth | null>(null)

const { checklist } = useSetupChecklist()

/** 最近访问设置面板（最近在前，最多 4 个） */
const recentTabs = computed(() =>
  getRecentSettingsTabs(4).filter((id) => TAB_DEEP_LINKS[id]),
)

function recentTabLink(id: string) {
  return TAB_DEEP_LINKS[id]?.() ?? SETTINGS_ROUTES.general()
}

const score = computed(() => {
  const s = health.value?.score
  return typeof s === 'number' && Number.isFinite(s) ? Math.round(s) : null
})

const scoreTone = computed(() => {
  const s = score.value
  if (s == null) return 'muted'
  if (s >= 80) return 'ok'
  if (s >= 55) return 'warn'
  return 'bad'
})

const pendingChecklist = computed(() =>
  (checklist.value?.items || []).filter((i) => !i.done).slice(0, 2),
)

const healthHint = computed(() => {
  const h = health.value
  if (!h) return '查看诊断与绑定缺口'
  const parts: string[] = []
  if (h.haConnected === false) parts.push('HA 未连接')
  if ((h.bindingGapCount || 0) > 0) parts.push(`${h.bindingGapCount} 项绑定缺口`)
  const ph = (h.placeholderAutomationCount || 0) + (h.placeholderSceneCount || 0)
  if (ph > 0) parts.push(`${ph} 条占位`)
  return parts.length ? parts.join(' · ') : '状态良好'
})

const checklistHint = computed(() => {
  if (!checklist.value) return '继续完成首装步骤'
  if (pendingChecklist.value.length) {
    return pendingChecklist.value.map((i) => i.label).join(' · ')
  }
  if (checklist.value.completed >= checklist.value.total) return '清单已完成'
  return '继续完成首装步骤'
})

const checklistTone = computed(() => {
  if (!checklist.value) return 'sky'
  if (checklist.value.completed >= checklist.value.total) return 'ok'
  if (checklist.value.completed === 0) return 'warn'
  return 'sky'
})

async function loadHealth() {
  try {
    const { data } = await fetchConfigHealth()
    health.value = (data || null) as ConfigHealth | null
  } catch (e) {
    logger.debug('配置健康加载失败', e)
    health.value = null
  }
}

onMounted(() => {
  void loadHealth()
})
</script>

<template>
  <section class="settings-overview-strip" aria-label="设置总览">
    <RouterLink
      class="settings-overview-tile"
      :class="`is-${scoreTone}`"
      :to="SETTINGS_ROUTES.diagnostics()"
    >
      <span class="settings-overview-tile__val">{{ score == null ? '—' : score }}</span>
      <span class="settings-overview-tile__copy">
        <span class="settings-overview-tile__label">
          {{ '配置健康' }}
          <span class="settings-overview-tile__cta">{{ '诊断' }}</span>
        </span>
        <span class="settings-overview-tile__hint">{{ healthHint }}</span>
      </span>
    </RouterLink>

    <RouterLink
      class="settings-overview-tile"
      :class="`is-${checklistTone}`"
      :to="SETTINGS_ROUTES.setupWizard()"
    >
      <span class="settings-overview-tile__val">
        {{ checklist ? `${checklist.completed}/${checklist.total}` : '—' }}
      </span>
      <span class="settings-overview-tile__copy">
        <span class="settings-overview-tile__label">
          {{ '首装清单' }}
          <span class="settings-overview-tile__cta">{{ '向导' }}</span>
        </span>
        <span class="settings-overview-tile__hint">{{ checklistHint }}</span>
      </span>
    </RouterLink>

    <!-- 最近使用：最近访问过的设置面板直达入口，降低 2-3 级导航成本 -->
    <div v-if="recentTabs.length" class="settings-overview-recent" aria-label="最近访问的设置面板">
      <span class="settings-overview-recent__label">{{ '最近使用' }}</span>
      <div class="settings-overview-recent__chips">
        <RouterLink
          v-for="id in recentTabs"
          :key="id"
          class="settings-overview-recent__chip"
          :to="recentTabLink(id)"
        >
          {{ tabLabel(id) }}
        </RouterLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings-overview-strip {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  flex: 0 0 auto !important;
  width: 100%;
  box-sizing: border-box;
  min-height: 0;
  margin: 0 0 12px;
}

.settings-overview-tile {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  min-height: 52px;
  padding: 8px 12px 8px 14px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-left-width: 3px;
  background: rgba(255, 255, 255, 0.04);
  text-decoration: none;
  color: inherit;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.settings-overview-tile:hover {
  background: rgba(255, 255, 255, 0.07);
}

.settings-overview-tile.is-ok {
  border-left-color: var(--set-success, #34d399);
  background: linear-gradient(165deg, rgba(52, 211, 153, 0.14) 0%, rgba(0, 0, 0, 0.22) 100%);
}

.settings-overview-tile.is-warn {
  border-left-color: var(--set-warn, #fbbf24);
  background: linear-gradient(165deg, rgba(251, 191, 36, 0.14) 0%, rgba(0, 0, 0, 0.22) 100%);
}

.settings-overview-tile.is-bad {
  border-left-color: #f43f5e;
  background: linear-gradient(165deg, rgba(244, 63, 94, 0.14) 0%, rgba(0, 0, 0, 0.22) 100%);
}

.settings-overview-tile.is-sky {
  border-left-color: var(--set-info, #38bdf8);
  background: linear-gradient(165deg, rgba(56, 189, 248, 0.12) 0%, rgba(0, 0, 0, 0.22) 100%);
}

.settings-overview-tile.is-muted {
  border-left-color: rgba(255, 255, 255, 0.28);
}

.settings-overview-tile__val {
  flex-shrink: 0;
  min-width: 2.2ch;
  font-size: 22px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
  line-height: 1;
  color: #fff;
}

.settings-overview-tile.is-ok .settings-overview-tile__val {
  color: var(--set-success, #6ee7b7);
}

.settings-overview-tile.is-warn .settings-overview-tile__val {
  color: var(--set-warn, #fcd34d);
}

.settings-overview-tile.is-bad .settings-overview-tile__val {
  color: #fda4af;
}

.settings-overview-tile.is-sky .settings-overview-tile__val {
  color: var(--set-info, #7dd3fc);
}

.settings-overview-tile__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}

.settings-overview-tile__label {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: var(--set-fs-micro, 12px);
  font-weight: 700;
  color: rgba(255, 255, 255, 0.82);
  line-height: 1.2;
}

.settings-overview-tile__cta {
  font-size: var(--premium-fs-micro, 12px);
  font-weight: 700;
  color: #7dd3fc;
  opacity: 0.9;
}

.settings-overview-tile:hover .settings-overview-tile__cta {
  text-decoration: underline;
}

.settings-overview-tile__hint {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--premium-fs-micro, 12px);
  font-weight: 600;
  line-height: 1.25;
  color: var(--hos-text-secondary);
}

.settings-overview-recent {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 6px 2px 0;
}

.settings-overview-recent__label {
  flex-shrink: 0;
  font-size: var(--premium-fs-micro, 12px);
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--hos-text-secondary);
}

.settings-overview-recent__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.settings-overview-recent__chip {
  padding: 5px 10px;
  border-radius: var(--hos-radius-pill);
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.85);
  font-size: var(--premium-fs-micro, 12px);
  font-weight: 600;
  text-decoration: none;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.settings-overview-recent__chip:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.24);
  color: #fff;
}

@media (max-width: 639px) {
  .settings-overview-strip {
    grid-template-columns: 1fr;
  }
}
</style>
