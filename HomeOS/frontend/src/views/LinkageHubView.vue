<!--
  组件文件：LinkageHubView.vue
  所属模块：frontend/src/views
  组件职责：联动中心总览页。顶部 ListPageHero 根据当前 activeTab 动态展示标题/提示语/右上角快捷入口
    （设置编排/执行历史/刷新/模板库）与 KPI 统计；中段为占位横幅（stub 警告与 SMB 异常提示）；
    下方 ListPagePanel 内含 LinkageHubTabs（总览/场景/脚本/自动化/模板 5 Tab）+
    LinkageHubToolbar（搜索/来源/占位/健康/启用筛选 + 双引擎切换 + 创建按钮）+
    OrchestratorListSyncBanner（同步状态横幅），正文总览 Tab 懒加载 LinkageHubOverview 图表卡片，
    其余 Tab 渲染 LinkageHubCard 网格或 HA 发现面板；右侧装配 TemplateModal/BuilderDrawer/ScriptExecuteModal
    三个异步对话框用于创建/编辑/执行。
  依赖关系：组合式函数 useLinkageHub 统一产出 isAdmin/canManageOrchestrator/activeTab/tabMeta/hubTabs/overview/
    trackFilter/搜索与筛选/items/filteredItems/syncStatusMap/driftCount 等状态与事件；
    Pinia useChromeStore；defineAsyncComponent 懒加载 HubOverview 大图表组件；
    utils：orchestrator/list.util、registry/settings-route.util；提供 ORCHESTRATOR_FOCUS_DRIFT_KEY 注入
    供漂移焦点在子组件间传递。
  注意事项：总览大图表使用动态分包避免首屏重；双引擎 trackFilter 在 homeos 与 HA 面板间切换展示；
    activeTab 切换后列表自动重载，同步状态横幅仅 homeos 引擎下展示。
-->
<template>
  <div
    class="linkage-hub page-enter-stagger list-page"
    :class="[`linkage-hub--${activeTab}`]"
  >
    <ListPageHero :title="tabMeta.label" :hint="tabMeta.hint" :tone="tabMeta.tone">
      <template #icon>
        <component :is="heroIcon" class="w-5 h-5" />
      </template>
      <template #aside>
        <template v-if="activeTab === 'overview'">
          <router-link :to="orchestratorRoute()" class="list-page__link-btn">
            {{ '设置编排' }}
          </router-link>
          <router-link :to="executionHistoryRoute" class="list-page__link-btn">
            {{ '执行历史' }}
          </router-link>
          <button
            type="button"
            class="list-page__btn list-page__btn--primary"
            :disabled="overview.overviewLoading.value"
            @click="overview.reloadOverview()"
          >
            <RefreshCw :class="['w-4 h-4', overview.overviewLoading.value && 'animate-spin']" />
            {{ overview.overviewLoading.value ? '刷新中…' : '刷新' }}
          </button>
        </template>
        <template v-else>
          <button
            v-if="activeTab !== 'template' && canManageOrchestrator"
            type="button"
            class="list-page__link-btn"
            @click="openTemplatePicker"
          >
            {{ '模板库' }}
          </button>
          <router-link :to="orchestratorRoute()" class="list-page__link-btn">
            {{ '设置编排' }}
          </router-link>
        </template>
      </template>
      <template v-if="heroMetrics.length" #stats>
        <ListPageMetrics :cells="heroMetrics" />
      </template>
    </ListPageHero>

    <div
      v-if="placeholderItemCount > 0"
      class="linkage-hub__placeholder-banner"
      role="status"
    >
      <p class="linkage-hub__placeholder-banner-text">
        {{
          `当前列表有 ${placeholderItemCount} 条规则仍含占位实体，启用前请完成实体替换。`
        }}
      </p>
      <button
        type="button"
        class="list-page__btn list-page__btn--primary"
        @click="focusPlaceholders"
      >
        {{ '查看占位项' }}
      </button>
      <button
        type="button"
        class="list-page__link-btn"
        @click="openFirstPlaceholderEditor"
      >
        {{ '打开编辑器' }}
      </button>
    </div>

    <section class="list-page__panel linkage-hub__panel">
      <div class="list-page__panel-toolbar linkage-hub__panel-toolbar">
        <div class="linkage-hub__panel-toolbar-row">
          <LinkageHubTabs
            :model-value="activeTab"
            :tabs="hubTabs"
            @update:model-value="onActiveTabChange"
          />
        </div>
      </div>

      <div class="list-page__panel-body linkage-hub__panel-body">
        <LinkageHubOverview
          v-if="activeTab === 'overview'"
          :kpi-cells="overview.kpiCells.value"
          :analytics-kpi-cells="overview.analyticsKpiCells.value"
          :category-cards="overview.categoryCards.value"
          :health-buckets="overview.healthBuckets.value"
          :kind-buckets="overview.kindBuckets.value"
          :execution-timeline="overview.executionTimeline.value"
          :execution-summary="overview.executionSummary.value"
          :recent-executions="overview.recentExecutions.value"
          :loading="overview.overviewLoading.value"
          :error="overview.overviewError.value"
          @reload="overview.reloadOverview()"
          @navigate="navigateToKind"
        />

        <template v-else>
          <LinkageHubToolbar
            class="linkage-hub__content-toolbar"
            :search-query="searchQuery"
            :search-placeholder="tabMeta.searchPlaceholder"
            :search-options="searchOptions"
            :source-filter="sourceFilter"
            :placeholder-filter="placeholderFilter"
            :health-filter="healthFilter"
            :enabled-filter="enabledFilter"
            :source-filters="sourceFilters"
            :placeholder-filters="placeholderFilters"
            :health-filters="healthFilters"
            :enabled-filters="enabledFilters"
            :show-enabled-filter="activeTab === 'automation'"
            :show-source-filter="activeTab !== 'template'"
            :show-placeholder-filter="activeTab !== 'template'"
            :track="trackFilter"
            :show-track-toggle="activeTab !== 'template'"
            :show-demo-import="activeTab === 'scene' && trackFilter === 'homeos'"
            :importing-demo="importingDemo"
            :create-label="`新建${tabMeta.label}`"
            :show-create="canCreateItem"
            @update:search-query="onSearchQueryChange"
            @select-search="onSearchQueryChange"
            @update:source-filter="sourceFilter = $event"
            @update:placeholder-filter="placeholderFilter = $event"
            @update:health-filter="healthFilter = $event"
            @update:enabled-filter="enabledFilter = $event"
            @update:track="trackFilter = $event"
            @create="onCreateItem"
            @import-demo="importDemoScenes"
          />

          <OrchestratorListSyncBanner
            v-if="trackFilter === 'homeos'"
            :drift-count="driftCount"
            :sync-loading="syncLoading"
            :orchestrator-route="orchestratorRoute()"
            :show-repair="canManageOrchestrator && driftCount > 0"
            :show-sync-all="canManageOrchestrator"
            :action-busy="hubSyncBusy"
            :action-busy-label="hubSyncBusyLabel"
            @repair-all="hubRepairAllDrift"
            @sync-all="hubSyncAllToHa"
          />

          <section
            v-if="trackFilter === 'homeos'"
            class="linkage-hub__list-shell"
          >
            <ApiQueryState
              :loading="listInitialLoading"
              :error="error"
              :error-title="`${tabMeta.label}加载失败`"
              :tone="tabMeta.tone"
              @retry="reloadActiveList"
            >
              <VEmptyState
                v-if="!items.length"
                :icon="tabMeta.emoji"
                :tone="tabMeta.tone"
                :title="tabMeta.emptyTitle"
                :description="tabMeta.emptyDescription"
              >
                <template #action>
                  <div class="linkage-hub__empty-actions">
                    <button
                      v-if="canCreateItem"
                      type="button"
                      class="list-page__btn list-page__btn--primary"
                      @click="onCreateItem"
                    >
                      {{ `新建${tabMeta.label}` }}
                    </button>
                    <button
                      v-if="activeTab === 'scene'"
                      type="button"
                      class="list-page__btn"
                      :disabled="importingDemo"
                      @click="importDemoScenes"
                    >
                      {{ '导入示例' }}
                    </button>
                    <button
                      v-if="activeTab !== 'template' && canManageOrchestrator"
                      type="button"
                      class="list-page__btn"
                      @click="openTemplatePicker"
                    >
                      {{ '模板库' }}
                    </button>
                    <router-link
                      v-if="activeTab === 'template' && canManageOrchestrator"
                      :to="orchestratorRoute()"
                      class="list-page__btn"
                    >
                      {{ '在设置中导入 HA' }}
                    </router-link>
                  </div>
                </template>
              </VEmptyState>
              <VEmptyState
                v-else-if="!filteredItems.length"
                compact
                :tone="tabMeta.tone"
                :title="'无匹配项'"
                :description="'尝试更换搜索关键词或筛选条件'"
              />
              <div v-else class="linkage-hub__grid-wrap">
                <div class="linkage-hub__grid">
                  <LinkageHubCard
                    v-for="item in filteredItems"
                    :key="item.id"
                    :item="item"
                    :kind="activeTab"
                    :highlighted="locateItemId === String(item.id)"
                    :sync-status-map="syncStatusMap"
                    :action-loading="actionId === item.id"
                    :can-action="canPrimaryAction(item)"
                    :disabled-reason="primaryActionDisabledReason(item)"
                    :primary-label="tabMeta.primaryActionLabel"
                    :show-enabled="activeTab === 'automation'"
                    :show-toggle="activeTab === 'automation'"
                    :edit-only="activeTab === 'template'"
                    :settings-route="itemEditRoute(item)"
                    :can-delete="isAdmin"
                    @primary="runPrimaryAction(item)"
                    @edit="onEditItem(item)"
                    @toggle="toggleAutomationEnabled(item)"
                    @delete="onDeleteItem(item)"
                  />
                </div>
              </div>
            </ApiQueryState>
          </section>

          <section
            v-else
            class="linkage-hub__list-shell linkage-hub__ha-panel"
          >
            <div class="list-page__panel-head">
              <h2 class="list-page__section-title">{{ tabMeta.haTitle }}</h2>
            </div>
            <div class="list-page__panel-body">
              <LinkageHubHaPanel :lock-domain="activeTab" />
            </div>
          </section>
        </template>
      </div>
    </section>

    <LinkageTemplateModal
      :open="templatePickerOpen"
      :title="`${tabMeta.label}模板`"
      :templates="templates"
      :loading="templateLoading"
      :installing-id="installingTemplateId"
      :tone="templateModalTone"
      :storage-key="`homeos_linkage_tpl_modal_${activeTab}`"
      :hub-kind="activeKind"
      @close="templatePickerOpen = false"
      @install="installTemplate"
      @apply-local="applyLocalTemplateFromHub"
    />

    <LinkageBuilderDrawer
      :open="builderDrawerOpen"
      :kind="builderDrawerKind || 'scene'"
      :edit-id="builderEditId"
      :open-wizard="builderOpenWizard"
      :remount-epoch="builderRemountEpoch"
      :settings-route="orchestratorRoute(builderEditId || undefined)"
      :initial-local-template="pendingLocalTemplate"
      @close="closeBuilderDrawer"
      @saved="onBuilderSaved"
      @local-template-consumed="clearPendingLocalTemplate"
    />

    <ScriptExecuteModal
      :open="scriptExecOpen"
      :target-name="scriptExecTarget?.name || ''"
      :fields="scriptExecFields"
      :vars="scriptExecVars"
      :running="scriptExecRunning"
      @close="scriptExecOpen = false"
      @confirm="confirmScriptExecute"
      @update:vars="scriptExecVars = $event"
    />
  </div>
</template>

<script setup>
import '@/views/settings/shared/styles/orchestrator-premium.css'
import '@/views/settings/shared/styles/settings-forms.css'
import '@/assets/styles/linkage-hub.css'
import '@/assets/styles/linkage-hub-premium.css'
import { computed, defineAsyncComponent, nextTick, provide, ref } from 'vue'
import {
  RefreshCw,
  LayoutDashboard,
  Sparkles,
  Zap,
  FileCode,
  Boxes,
} from '@lucide/vue'
import ListPageHero from '@/components/common/list-page/ListPageHero.vue'
import ListPageMetrics from '@/components/common/list-page/ListPageMetrics.vue'
import LinkageHubTabs from '@/components/linkage/HubTabs.vue'
import LinkageHubToolbar from '@/components/linkage/HubToolbar.vue'
import LinkageHubHaPanel from '@/components/linkage/HubHaPanel.vue'
import LinkageHubCard from '@/components/linkage/HubCard.vue'
import LinkageTemplateModal from '@/components/linkage/TemplateModal.vue'
import LinkageBuilderDrawer from '@/components/linkage/BuilderDrawer.vue'
import ScriptExecuteModal from '@/components/linkage/ScriptExecuteModal.vue'
import OrchestratorListSyncBanner from '@/components/common/list-page/OrchestratorListSyncBanner.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import { useLinkageHub } from '@/composables/orchestrator/useLinkageHub'
import { ORCHESTRATOR_FOCUS_DRIFT_KEY } from '@/composables/orchestrator/orchestrator-inject-keys'
import { useChromeStore } from '@/stores/chrome.store'
import { orchestratorHasPlaceholder } from '@/utils/orchestrator/list.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

const LinkageHubOverview = defineAsyncComponent(() => import('@/components/linkage/HubOverview.vue'))

const chrome = useChromeStore()
const executionHistoryRoute = SETTINGS_ROUTES.executionHistory()
const driftFocusToken = ref(0)
provide(ORCHESTRATOR_FOCUS_DRIFT_KEY, driftFocusToken)

const hub = useLinkageHub()
const {
  isAdmin,
  canManageOrchestrator,
  activeTab,
  activeKind,
  onActiveTabChange,
  tabMeta,
  hubTabs,
  overview,
  navigateToKind,
  trackFilter,
  searchQuery,
  sourceFilter,
  placeholderFilter,
  healthFilter,
  enabledFilter,
  sourceFilters,
  placeholderFilters,
  healthFilters,
  enabledFilters,
  items,
  filteredItems,
  searchOptions,
  placeholderItemCount,
  listInitialLoading,
  error,
  syncLoading,
  syncStatusMap,
  driftCount,
  actionId,
  importingDemo,
  templatePickerOpen,
  templateLoading,
  templates,
  installingTemplateId,
  builderDrawerOpen,
  builderDrawerKind,
  builderEditId,
  builderOpenWizard,
  builderRemountEpoch,
  scriptExecOpen,
  scriptExecTarget,
  scriptExecFields,
  scriptExecVars,
  scriptExecRunning,
  reloadActiveList,
  orchestratorRoute,
  openBuilderDrawer,
  closeBuilderDrawer,
  onBuilderSaved,
  itemEditRoute,
  canPrimaryAction,
  primaryActionDisabledReason,
  runPrimaryAction,
  confirmScriptExecute,
  toggleAutomationEnabled,
  deleteItem,
  openTemplatePicker,
  installTemplate,
  applyLocalTemplateFromHub,
  clearPendingLocalTemplate,
  pendingLocalTemplate,
  importDemoScenes,
  focusPlaceholders,
  hubSyncBusy,
  hubSyncBusyLabel,
  hubSyncAllToHa,
  hubRepairAllDrift,
} = hub

const canCreateItem = computed(() => {
  if (activeTab.value === 'template') return isAdmin.value
  return canManageOrchestrator.value
})

function onCreateItem() {
  if (activeTab.value === 'template' && !isAdmin.value) {
    chrome.notify('仅管理员可新建模板实体', 'warning')
    return
  }
  if (activeTab.value !== 'template' && !canManageOrchestrator.value) {
    chrome.notify('仅管理员或成人可新建', 'warning')
    return
  }
  openBuilderDrawer()
}

function openFirstPlaceholderEditor() {
  void focusPlaceholders()
}

const HERO_ICONS = {
  overview: LayoutDashboard,
  scene: Sparkles,
  automation: Zap,
  script: FileCode,
  template: Boxes,
}

const heroIcon = computed(() => HERO_ICONS[activeTab.value] || LayoutDashboard)

const heroMetrics = computed(() => {
  if (activeTab.value === 'overview') {
    return (overview.kpiCells.value || []).slice(0, 4)
  }
  const count = filteredItems.value?.length ?? items.value?.length ?? 0
  const attention = (items.value || []).filter((i) => orchestratorHasPlaceholder(i)).length
  return [
    {
      key: 'count',
      label: tabMeta.value.label,
      value: String(count),
      tone: count ? tabMeta.value.tone || 'cyan' : 'muted',
    },
    {
      key: 'attention',
      label: '需关注',
      value: String(attention),
      tone: attention ? 'amber' : 'muted',
    },
    {
      key: 'drift',
      label: '漂移',
      value: String(driftCount.value || 0),
      tone: driftCount.value ? 'amber' : 'muted',
    },
  ]
})

/** 列表定位高亮 */
const locateItemId = ref(null)
let locateTimer = 0

const templateModalTone = computed(() => {
  const tone = tabMeta.value.tone
  if (tone === 'amber') return 'amber'
  if (tone === 'emerald') return 'emerald'
  if (tone === 'sky') return 'sky'
  return 'purple'
})

function onSearchQueryChange(value) {
  if (!value) {
    searchQuery.value = ''
    locateItemId.value = null
    return
  }
  const option = searchOptions.value.find((opt) => opt.value === value)
  if (option) {
    searchQuery.value = option.label
    locateOrchestratorItem(option.value)
    return
  }
  searchQuery.value = value
  locateItemId.value = null
}

function locateOrchestratorItem(itemId) {
  locateItemId.value = itemId
  nextTick(() => {
    document
      .querySelector(`[data-orch-item-id="${CSS.escape(itemId)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
  clearTimeout(locateTimer)
  locateTimer = window.setTimeout(() => {
    if (locateItemId.value === itemId) locateItemId.value = null
  }, 2400)
}

function onEditItem(item) {
  openBuilderDrawer(item.id, orchestratorHasPlaceholder(item))
  if (syncStatusMap.value?.[item.id]?.drift) {
    nextTick(() => {
      driftFocusToken.value += 1
    })
  }
}

async function onDeleteItem(item) {
  const ok = await chrome.confirm(`确定删除「${item.name}」？`, '删除后不可恢复')
  if (!ok) return
  await deleteItem(item)
}
</script>
