<!--
组件：SettingsOrchestrator.vue
所属模块：frontend / src / views / settings / automate
职责：「联动编排」设置面板。在自动化 / 场景 / 脚本 / 模板实体四个 Tab 间切换，
      KeepAlive 缓存对应 Builder；集成 HA 同步健康卡片、占位实体提示、配置漂移
      定位、统一执行历史弹层，并负责路由查询参数与编辑器状态的同步。
关键依赖：
  - SettingsPageShell / SettingsOrchTabs / OrchestratorSyncHealthCard：壳与子组件
  - GeekAutomationBuilder / GeekSceneBuilder / GeekScriptBuilder / GeekTemplateBuilder：四个 Builder
  - useOrchestratorOverview：拉取各域计数与刷新
  - useOrchestratorTeleport：执行历史弹层 Teleport 目标
  - useRegisterSettingsTabPending：注册 Tab 离开前的脏检查
  - collectOrchestratorDriftItems / fetchOrchestratorDomainLists：扫描漂移与占位
数据来源：useOrchestratorOverview + 路由查询参数 + 后端联动列表
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="orchestrator"
    icon-key="zap"
    accent="var(--module-accent-automation)"
    layout="single"
    page-class="orchestrator-hub"
    :scroll-body="false"
    body-class="settings-page__stage--workspace settings-page__workspace--inset"
  >
    <template #actions>
      <OrchestratorSyncHealthCard
        ref="syncHealthRef"
        embed
        :drift-count="counts.drift"
        :collapsible="true"
        :collapsed="syncHealthCollapsed"
        @drift-click="onDriftClick"
        @toggle-collapse="syncHealthCollapsed = !syncHealthCollapsed"
      />
    </template>

    <template #tabs>
      <div class="settings-page-inset settings-page-inset--tabs">
        <div
          class="orch-placeholder-banner orch-placeholder-banner--hub"
          role="note"
        >
          <p class="orch-placeholder-banner__text">
            {{ '日常场景、自动化、脚本请到联动中心处理。本页用于 HA 同步、占位修复与高级编排。' }}
          </p>
          <RouterLink class="orch-toolbar-btn orch-toolbar-btn--accent" :to="LINKAGE_HUB_ROUTES.root()">
            {{ '打开联动中心' }}
          </RouterLink>
        </div>
        <div
          v-if="placeholderCount > 0"
          class="orch-placeholder-banner"
          role="status"
        >
          <p class="orch-placeholder-banner__text">
            {{
              `当前联动有 ${placeholderCount} 条仍含占位实体，启用前请完成实体替换。`
            }}
          </p>
          <button type="button" class="orch-toolbar-btn orch-toolbar-btn--accent" @click="focusPlaceholders">
            {{ '查看占位项' }}
          </button>
          <RouterLink
            class="orch-toolbar-btn"
            :to="LINKAGE_HUB_ROUTES.tab(firstPlaceholder?.domain || 'automation')"
          >
            {{ '打开列表页' }}
          </RouterLink>
        </div>
        <div class="orch-header">
          <p v-if="fetchError" class="orch-fetch-error">{{ fetchError }}</p>
          <SettingsOrchTabs v-model="orchTab" :tabs="orchTabsWithCounts" toolbar>
            <template #actions>
              <button
                type="button"
                class="orch-toolbar-btn"
                :disabled="overviewLoading"
                :title="'刷新统计'"
                @click="refreshOverview"
              >
                <RefreshCw :class="['w-4 h-4', overviewLoading && 'animate-spin']" />
                <span class="orch-toolbar-btn-label">{{ '刷新统计' }}</span>
              </button>
              <button
                type="button"
                class="orch-toolbar-btn orch-toolbar-btn--accent"
                :title="'统一执行历史'"
                @click="showHistory = true"
              >
                <History class="w-4 h-4" />
                <span class="orch-toolbar-btn-label">{{ '统一执行历史' }}</span>
              </button>
            </template>
          </SettingsOrchTabs>
        </div>
      </div>
    </template>

    <div class="settings-orchestrator-workspace">
      <KeepAlive :max="4">
        <GeekAutomationBuilder
          v-if="orchTab === 'automation'"
          :key="`automation-${orchEditId || 'new'}-${orchBuilderEpoch.automation}`"
          :visible="true"
          :embedded="true"
          :initial-edit-id="orchEditId"
          :open-placeholder-wizard="orchOpenWizard"
          @close="onBuilderClose"
          @saved="refreshOverview"
          class="orch-builder-panel flex-1 h-full"
        />
        <GeekSceneBuilder
          v-else-if="orchTab === 'scene'"
          :key="`scene-v2-${orchEditId || 'new'}-${orchBuilderEpoch.scene}`"
          :visible="true"
          :embedded="true"
          :initial-edit-id="orchEditId"
          :open-placeholder-wizard="orchOpenWizard"
          @close="onBuilderClose"
          @saved="refreshOverview"
          class="orch-builder-panel flex-1 h-full"
        />
        <GeekScriptBuilder
          v-else-if="orchTab === 'script'"
          :key="`script-v2-${orchEditId || 'new'}-${orchBuilderEpoch.script}`"
          :visible="true"
          :embedded="true"
          :initial-edit-id="orchEditId"
          :open-placeholder-wizard="orchOpenWizard"
          @close="onBuilderClose"
          @saved="refreshOverview"
          class="orch-builder-panel flex-1 h-full"
        />
        <GeekTemplateBuilder
          v-else-if="orchTab === 'template'"
          :key="`template-${orchEditId || 'new'}-${orchBuilderEpoch.template}`"
          :visible="true"
          :embedded="true"
          show-embedded-close
          :initial-edit-id="orchEditId"
          @close="onBuilderClose"
          @saved="refreshOverview"
          class="orch-builder-panel flex-1 h-full"
        />
      </KeepAlive>
    </div>

    <template #mobile-save>
      <p v-if="orchestratorBuilderDirty" class="settings-mobile-dirty-hint" role="status">
        {{ '当前联动有未保存修改，请先在编辑器内保存后再切换标签或离开页面' }}
      </p>
    </template>

    <template #overlay>
      <Teleport :to="teleportTarget" :disabled="teleportDisabled">
        <Transition name="wr-modal">
          <div v-if="showHistory" class="orch-history-overlay" @click.self="showHistory = false">
            <div class="orch-history-panel">
              <div class="orch-history-head">
                <div class="orch-history-head__main">
                  <History class="orch-history-head__icon" />
                  <div>
                    <p class="orch-history-head__eyebrow">{{ '全屋联动' }}</p>
                    <span class="orch-history-head__title">{{ '执行历史' }}</span>
                  </div>
                </div>
                <button
                  type="button"
                  class="orch-toolbar-btn"
                  aria-label="关闭"
                  @click="showHistory = false"
                >
                  <X class="w-4 h-4" />
                </button>
              </div>
              <div class="orch-history-body">
                <ExecutionHistoryPanel variant="settings" />
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>
    </template>
  </SettingsPageShell>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch, provide, nextTick } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useChromeStore } from '@/stores/chrome.store'
import { logger } from '@/utils/core/logger'
import {
  collectOrchestratorDriftItems,
  fetchOrchestratorDomainLists,
  ORCHESTRATOR_DOMAIN_LABELS,
} from '@/utils/orchestrator/sync-issues.util'
import { orchestratorHasPlaceholder } from '@/utils/orchestrator/list.util'
import { LINKAGE_HUB_ROUTES } from '@/utils/registry/linkage-route.util'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import { X, History, RefreshCw } from '@lucide/vue'
import SettingsOrchTabs from '@/views/settings/shared/layout/SettingsOrchTabs.vue'
import OrchestratorSyncHealthCard from './OrchestratorSyncHealthCard.vue'
import GeekAutomationBuilder from '@/components/geek-automation/GeekAutomationBuilder.vue'
import GeekSceneBuilder from '@/components/geek-scene/GeekSceneBuilder.vue'
import GeekScriptBuilder from '@/components/geek-script/GeekScriptBuilder.vue'
import GeekTemplateBuilder from '@/components/geek-template/GeekTemplateBuilder.vue'
import ExecutionHistoryPanel from '@/components/widgets/orchestrator/ExecutionHistoryPanel.vue'
import { useOrchestratorOverview } from '@/composables/settings/hub-backup-orchestrator.internals'
import { ORCHESTRATOR_FOCUS_DRIFT_KEY, ORCHESTRATOR_REFRESH_OVERVIEW_KEY } from '@/composables/orchestrator/orchestrator-inject-keys'
import { useOrchestratorTeleport } from '@/composables/orchestrator/useOrchestratorTeleport'
import { useRegisterSettingsTabPending } from '@/composables/settings/pending.internals'
import {
  orchestratorBuilderDirty,
  hasOrchestratorBuilderDirty,
  clearOrchestratorBuilderDirty,
} from '@/composables/settings/hub-backup-orchestrator.internals'

const route = useRoute()
const router = useRouter()
const chrome = useChromeStore()
const { teleportTarget, teleportDisabled } = useOrchestratorTeleport()

// 注册 orchestrator Tab 的脏检查：离开前若有未保存修改会拦截
useRegisterSettingsTabPending('orchestrator', () => hasOrchestratorBuilderDirty())

// 合法的联动域 Tab 集合
const VALID_ORCH_TABS = new Set(['automation', 'scene', 'script', 'template'])
// 当前激活的联动域 Tab
const orchTab = ref('automation')
// 当前编辑的联动条目 ID（空表示新建）
const orchEditId = ref('')
// 是否打开占位实体向导
const orchOpenWizard = ref(false)
/** 丢弃未保存后递增，迫使 KeepAlive 重建干净实例 */
const orchBuilderEpoch = reactive({
  automation: 0,
  scene: 0,
  script: 0,
  template: 0,
})
// 是否展示执行历史弹层
const showHistory = ref(false)
const syncHealthRef = ref(null)
// 同步健康卡片默认折叠
const syncHealthCollapsed = ref(true)
// 漂移聚焦令牌：递增以通知子组件定位漂移条目
const driftFocusToken = ref(0)
const {
  counts,
  loading: overviewLoading,
  fetchError,
  refresh: refreshOverviewBase,
} = useOrchestratorOverview()

// 占位实体总数与首个占位项（用于占位横幅跳转）
const placeholderCount = ref(0)
/** @type {import('vue').Ref<{ domain: string; id: string } | null>} */
const firstPlaceholder = ref(null)

// 扫描联动列表中的占位实体，统计数量并记录首个占位项（跳过 template 域）
async function refreshPlaceholderBanner() {
  try {
    const { lists } = await fetchOrchestratorDomainLists()
    let count = 0
    /** @type {{ domain: string; id: string } | null} */
    let first = null
    for (const entry of lists) {
      if (entry.domain === 'template') continue
      for (const row of entry.rows || []) {
        if (!orchestratorHasPlaceholder(row)) continue
        count += 1
        if (!first && row?.id) first = { domain: entry.domain, id: String(row.id) }
      }
    }
    placeholderCount.value = count
    firstPlaceholder.value = first
  } catch (e) {
    logger.debug('扫描联动占位失败', e)
    placeholderCount.value = 0
    firstPlaceholder.value = null
  }
}

// 并行刷新概览计数与占位横幅
async function refreshOverview() {
  await Promise.all([refreshOverviewBase(), refreshPlaceholderBanner()])
}

// 点击「查看占位项」：切到首个占位所在域，打开编辑器与向导，并同步路由
function focusPlaceholders() {
  const target = firstPlaceholder.value
  if (!target) return
  orchTab.value = target.domain
  orchEditId.value = target.id
  orchOpenWizard.value = true
  router.replace({
    query: {
      ...route.query,
      orchTab: target.domain,
      edit: target.id,
      wizard: '1',
    },
  })
}

// 向子组件 provide 刷新与漂移聚焦能力
provide(ORCHESTRATOR_REFRESH_OVERVIEW_KEY, refreshOverview)
provide(ORCHESTRATOR_FOCUS_DRIFT_KEY, driftFocusToken)

// 四个联动域 Tab 定义：id / 标签 / emoji / 主题色 / 计数字段
const orchTabDefs = [
  { id: 'automation', label: '自动化', emoji: '⚡', accent: 'var(--module-accent-automation)', countKey: 'automation' },
  { id: 'scene', label: '场景', emoji: '🎬', accent: 'var(--module-accent-scenes)', countKey: 'scene' },
  { id: 'script', label: '脚本', emoji: '📜', accent: 'var(--module-accent-script)', countKey: 'script' },
  { id: 'template', label: '模板实体', emoji: '🧩', accent: 'var(--module-accent-template)', countKey: 'template' },
]

// 在 Tab 定义上叠加计数与计数标题，驱动 Tab 上的徽标
const orchTabsWithCounts = computed(() =>
  orchTabDefs.map((tab) => {
    const count = counts.value[tab.countKey] || 0
    return {
      ...tab,
      count,
      countTitle: count > 0 ? `${count} 条` : '暂无条目',
    }
  }),
)

// 入参：当前激活的 Tab ID（默认 orchestrator）
const props = defineProps({ activeTab: { type: String, default: 'orchestrator' } })

// 从路由查询参数同步：orchTab / edit / wizard
function syncFromRoute() {
  const tab = route.query.orchTab
  if (typeof tab === 'string' && VALID_ORCH_TABS.has(tab)) {
    orchTab.value = tab
  }
  const edit = route.query.edit
  orchEditId.value = typeof edit === 'string' ? edit : ''
  orchOpenWizard.value = route.query.wizard === '1' || route.query.wizard === 'true'
}

// Builder 关闭：清空编辑状态并移除路由中的 edit/wizard 参数
function onBuilderClose() {
  orchEditId.value = ''
  orchOpenWizard.value = false
  if (route.query.edit || route.query.wizard) {
    const query = { ...route.query }
    delete query.edit
    delete query.wizard
    router.replace({ query })
  }
}

// 点击漂移条目：折叠健康卡片，扫描漂移并定位到首个漂移域，递增令牌触发子组件聚焦
async function onDriftClick() {
  syncHealthCollapsed.value = true
  try {
    const { lists } = await fetchOrchestratorDomainLists()
    const items = await collectOrchestratorDriftItems(lists)
    if (!items.length) {
      await refreshOverview()
      chrome.notify('当前没有配置漂移', 'success')
      return
    }
    const domains = [...new Set(items.map((i) => i.domain))]
    const target = domains.includes(orchTab.value) ? orchTab.value : domains[0]
    const countInTab = items.filter((i) => i.domain === target).length
    if (orchTab.value !== target) orchTab.value = target
    await nextTick()
    driftFocusToken.value += 1
    const label = ORCHESTRATOR_DOMAIN_LABELS[target] || target
    chrome.notify(`已定位到「${label}」${countInTab} 条漂移，请在列表中修复`, 'info')
  } catch (e) {
    logger.warn('定位配置漂移失败', e)
    chrome.notify('无法定位漂移条目', 'warning')
  }
}

onMounted(() => {
  syncFromRoute()
  refreshOverview()
})
// 切换到 orchestrator Tab 时重新从路由同步状态
watch(
  () => props.activeTab,
  (tab) => {
    if (tab === 'orchestrator') syncFromRoute()
  },
)
watch(() => [route.query.orchTab, route.query.edit], syncFromRoute)
// 切换联动域 Tab：若有未保存修改需二次确认；通过 epoch 重建实例以丢弃修改
watch(orchTab, async (tab, prevTab) => {
  if (prevTab && tab !== prevTab && hasOrchestratorBuilderDirty()) {
    const ok = await chrome.confirm(
      '当前联动有未保存的修改，切换将丢弃更改。是否继续？',
      '未保存的修改',
      { confirmText: '丢弃并切换', cancelText: '继续编辑', type: 'warning' },
    )
    if (!ok) {
      orchTab.value = prevTab
      return
    }
    if (VALID_ORCH_TABS.has(prevTab)) {
      orchBuilderEpoch[prevTab] += 1
      clearOrchestratorBuilderDirty(prevTab)
    }
  }
  refreshOverview()
  orchOpenWizard.value = false
  if (route.query.orchTab === tab && !route.query.edit && !route.query.wizard) return
  const query = { ...route.query, orchTab: tab }
  delete query.edit
  delete query.wizard
  orchEditId.value = ''
  router.replace({ query })
})
</script>

<style scoped src="./styles/SettingsOrchestrator.css"></style>
