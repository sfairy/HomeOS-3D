<!--
组件：SettingsView.vue
所属模块：frontend / src / views
-->
<template>
  <div
    class="settings-shell"
    :class="{
      'settings-shell--sidebar-collapsed': sidebarCollapsed && showSettingsNav,
      'settings-shell--no-sidebar': !showSettingsNav,
    }"
  >
    <SettingsSidebar
      v-if="showSettingsNav"
      class="settings-sidebar--desktop"
      :groups="navGroups"
      :active-tab="resolvedTab"
      :saving="saving"
      :show-save="isAdmin"
      :uses-independent-save="usesIndependentSave"
      :pending-changes="pendingChanges"
      :app-version="appVersion"
      v-model:search-query="settingsSearchQuery"
      @navigate="navigateTab"
      @save="handleSave"
      @cancel="handleCancel"
      @toggle-collapse="toggleSidebar"
    />

    <SettingsMobileNav
      v-if="showSettingsNav"
      :groups="navGroups"
      :active-tab="resolvedTab"
      v-model:search-query="settingsSearchQuery"
      @navigate="navigateTab"
    />

    <main class="settings-main">
      <button
        v-if="sidebarCollapsed && showSettingsNav"
        type="button"
        class="settings-sidebar-reopen"
        :title="'显示导航'"
        :aria-label="'显示导航'"
        @click="toggleSidebar"
      >
        <PanelLeft class="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>{{ '导航' }}</span>
      </button>
      <header
        v-if="showSettingsNav && navContext"
        class="settings-breadcrumb"
        aria-label="当前设置页"
      >
        <span class="settings-breadcrumb__group">{{ navContext.groupLabel }}</span>
        <ChevronRight class="settings-breadcrumb__sep" aria-hidden="true" />
        <span class="settings-breadcrumb__tab">{{ navContext.tabLabel }}</span>
        <span
          v-if="usesIndependentSave"
          class="settings-breadcrumb__save-hint"
        >{{ '请在页内保存' }}</span>
        <button
          type="button"
          class="settings-breadcrumb__copy"
          title="复制页面链接"
          aria-label="复制页面链接"
          @click="copySettingsPageLink"
        >
          <Link2 class="settings-breadcrumb__copy-icon" aria-hidden="true" />
        </button>
      </header>
      <div class="settings-main__stage">
        <SettingsOverviewStrip
          v-if="isAdmin && resolvedTab === 'general'"
          class="settings-main__overview"
        />
        <!-- keep-alive 与 Transition(out-in) 并用会在切换 Tab 时触发 insertBefore DOM 异常 -->
        <keep-alive :max="SETTINGS_KEEP_ALIVE_MAX" :include="SETTINGS_KEEP_ALIVE_INCLUDE">
          <component :is="activePanel" :key="resolvedTab" :active-tab="resolvedTab" />
        </keep-alive>
      </div>
      <footer class="settings-main__copy">
        <p>版权所有：一埖一丗堺</p>
        <p>程序开发：方长鑫</p>
        <p class="settings-main__copy-ver">HomeOS v{{ appVersion }}</p>
      </footer>
    </main>

    <!-- 仪表板编辑模式退出确认（非设置表单离开守卫；设置离开见 confirmLeaveIfDirty） -->
    <ExitEditConfirmDialog />
    <VConfirmModal />
    <VPromptModal />
  </div>
</template>

<script setup>
import { readLocalStorageFlag, writeLocalStorage } from '@/utils/core/local-storage.util'
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/SettingsView 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
/**
 * 系统设置页面 — 薄壳入口
 * 侧边栏分组导航 + 动态面板加载，样式见 settings/shared/settings-theme.css
 */
import { computed, ref, watch, defineAsyncComponent, onMounted, onBeforeUnmount } from 'vue'
import { PanelLeft, ChevronRight, Link2 } from '@lucide/vue'
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useAuthStore } from '@/stores/auth.store'
import { useSettingsSave } from '@/composables/settings/hub-ui.internals'
import { useSettingsPendingChanges } from '@/composables/settings/pending.internals'
import SettingsSidebar from '@/views/settings/shared/layout/SettingsSidebar.vue'
import SettingsMobileNav from '@/views/settings/shared/layout/SettingsMobileNav.vue'
import SettingsOverviewStrip from '@/views/settings/shared/layout/SettingsOverviewStrip.vue'
import {
  PANEL_MAP,
  buildNavGroups,
  resolveTab,
  DEFAULT_TAB,
  isAdminOnlyTab,
  isValidSettingsTab,
  defaultTabForRole,
  resolveDefaultSettingsTab,
  INDEPENDENT_SAVE_TABS,
} from '@/views/settings/nav'
import {
  hasIndependentSettingsPending,
  getIndependentPendingTabIds,
  isSettingsTabPending,
} from '@/composables/settings/pending.internals'
import {
  registerGlobalLayoutPendingSnapshot,
  registerGlobalPendingPause,
} from '@/composables/settings/pending.internals'
import { tabLabel } from '@/utils/registry/settings-nav.util'
import { countNavTabs, resolveNavTabContext } from '@/views/settings/nav-search.util'
import {
  SETTINGS_KEEP_ALIVE_MAX,
  SETTINGS_KEEP_ALIVE_INCLUDE,
} from '@/views/settings/keep-alive.util'
import { settingsPageShareUrl } from '@/utils/registry/settings-route.util'
import { recordSettingsTabVisit } from '@/utils/registry/settings-recent-tabs.util'
import { copyTextWithNotify } from '@/services/notify'
import pkg from '../../package.json'
import '@/views/settings/shared/settings-theme.css'

const appVersion = pkg.version

const ExitEditConfirmDialog = defineAsyncComponent(
  () => import('@/components/common/ExitEditConfirmDialog.vue'),
)
const VConfirmModal = defineAsyncComponent(
  () => import('@/components/common/base/VConfirmModal.vue'),
)
const VPromptModal = defineAsyncComponent(() => import('@/components/common/base/VPromptModal.vue'))

const router = useRouter()
const route = useRoute()
const entitiesStore = useEntitiesStore()
const layoutStore = useLayoutStore()
const chrome = useChromeStore()
const authStore = useAuthStore()
const { saving, onSave } = useSettingsSave()

const SIDEBAR_COLLAPSED_KEY = 'homeos_settings_sidebar_collapsed'

function readSidebarCollapsed() {
  try {
    return readLocalStorageFlag(SIDEBAR_COLLAPSED_KEY)
  } catch {
    return false
  }
}

const sidebarCollapsed = ref(readSidebarCollapsed())
const settingsSearchQuery = ref('')

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  try {
    writeLocalStorage(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed.value ? '1' : '0')
  } catch {
    /* 忽略 */
  }
}

const isAdmin = computed(() => authStore.role === 'admin')

const navGroups = computed(() => buildNavGroups(isAdmin.value))

const showSettingsNav = computed(() => countNavTabs(navGroups.value) >= 1)

const resolvedTab = computed(() => {
  const explicit = route.query.tab
  const tab = explicit
    ? resolveTab(explicit)
    : resolveDefaultSettingsTab({ isAdmin: isAdmin.value })
  // 非管理员访问管理员专属标签页时回退到账户与安全
  if (!isAdmin.value && isAdminOnlyTab(tab)) return defaultTabForRole(false)
  return tab
})

const navContext = computed(() =>
  showSettingsNav.value ? resolveNavTabContext(navGroups.value, resolvedTab.value) : null,
)

const usesIndependentSave = computed(() => INDEPENDENT_SAVE_TABS.has(resolvedTab.value))

const activePanel = computed(() => PANEL_MAP[resolvedTab.value] || PANEL_MAP[DEFAULT_TAB])

function copySettingsPageLink() {
  copyTextWithNotify(settingsPageShareUrl(route.fullPath), {
    successMessage: '设置页链接已复制',
  })
}

// ── 全局 Dirty 检测 ──
const initialLayoutConfig = ref(null)
const {
  pendingCount: pendingChanges,
  takeSnapshot: snapshotLayoutConfig,
  pause: pausePendingChanges,
  resume: resumePendingChanges,
} = useSettingsPendingChanges({
  snapshot: initialLayoutConfig,
  current: () => layoutStore.layoutConfig,
  ready: () => layoutStore.isConfigLoaded,
})

// 注册全局暂停/恢复函数，供首装向导等场景使用
registerGlobalPendingPause(pausePendingChanges, resumePendingChanges)

function describeUnsavedChanges() {
  const independent = getIndependentPendingTabIds()
  if (independent.length) {
    const labels = independent.map((id) => tabLabel(id)).join('、')
    return `「${labels}」有未保存的更改，请到对应页点击保存后再离开。`
  }
  if (pendingChanges.value > 0) {
    return `全局布局有 ${pendingChanges.value} 项未保存的更改。`
  }
  return '当前有未保存的更改。'
}

function describeUnsavedChangesForCurrentTab() {
  const tab = resolvedTab.value
  // 任意 tab 上注册的 pendingByTab（含非独立旁路 dirty）优先提示
  if (isSettingsTabPending(tab)) {
    return `「${tabLabel(tab)}」有未保存的更改，请在本页保存后再离开。`
  }
  if (pendingChanges.value > 0) {
    return `全局布局有 ${pendingChanges.value} 项未保存的更改。`
  }
  return '当前有未保存的更改。'
}

function hasUnsavedSettingsChanges() {
  if (hasIndependentSettingsPending()) return true
  // 仅当内容确有差异时才视为「未保存」。
  // 不能单凭 layoutStore.layoutDirty：全局 deep watch 会把任何对 layoutConfig 的改动（含面板挂载时
  // 补默认值、v-model 初始化等「程序化写回」，例如 customEmbeds=[]）都标记为 dirty，
  // 但这些改动其实与已保存快照内容一致（pendingChanges 仍为 0），否则会误弹「未保存的更改」。
  return pendingChanges.value > 0
}

/** 设置页内切换 tab：只检查当前 tab，避免 keep-alive 中其它面板误报 pending */
function hasUnsavedForCurrentTab() {
  const tab = resolvedTab.value
  // 非独立 tab 也可注册 pendingByTab（天气特效、access 偏好等旁路 dirty）
  if (isSettingsTabPending(tab)) return true
  if (INDEPENDENT_SAVE_TABS.has(tab)) return false
  return pendingChanges.value > 0
}

async function confirmLeaveIfDirty() {
  if (!hasUnsavedSettingsChanges()) return true
  return chrome.confirm(
    `${describeUnsavedChanges()}离开后这些修改将丢失。确定要离开吗？`,
    '未保存的更改',
    { type: 'danger', confirmText: '离开', cancelText: '留在此页' },
  )
}

async function confirmLeaveCurrentTabIfDirty() {
  if (!hasUnsavedForCurrentTab()) return true
  return chrome.confirm(
    `${describeUnsavedChangesForCurrentTab()}离开后这些修改将丢失。确定要离开吗？`,
    '未保存的更改',
    { type: 'danger', confirmText: '离开', cancelText: '留在此页' },
  )
}

function isOnSettingsRoute() {
  return route.name === 'settings' || route.path === '/settings'
}

async function navigateTab(tabId) {
  if (tabId === resolvedTab.value) return
  const ok = await confirmLeaveCurrentTabIfDirty()
  if (!ok) return
  settingsSearchQuery.value = ''
  // 显式 path，避免仅改 query 时与站外路由竞态
  router.push({ path: '/settings', query: { tab: tabId } })
}

// 记录最近访问的设置面板，供「最近使用」首页快捷直达
watch(
  resolvedTab,
  (tab) => {
    if (tab) recordSettingsTabVisit(tab)
  },
  { immediate: true },
)

onBeforeRouteLeave(async () => confirmLeaveIfDirty())

/** 刷新/关页：有未保存更改时触发浏览器原生离开确认 */
function onSettingsBeforeUnload(e) {
  if (!hasUnsavedSettingsChanges()) return
  e.preventDefault()
  e.returnValue = ''
}

onMounted(() => {
  window.addEventListener('beforeunload', onSettingsBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onSettingsBeforeUnload)
})

// 无 ?tab= 时同步 URL 为默认落地页（管理员 → 首装向导）
// 必须限定在 /settings：离开设置时 query.tab 变空会触发本 watch，若无守卫会把 tab=setup-wizard 写到 /devices、/security 等页面
watch(
  [() => route.query.tab, () => layoutStore.isConfigLoaded, isAdmin, () => route.path],
  ([tab]) => {
    if (!isOnSettingsRoute()) return
    if (tab) return
    if (!layoutStore.isConfigLoaded) return
    const desired = resolveDefaultSettingsTab({ isAdmin: isAdmin.value })
    router.replace({ path: '/settings', query: { ...route.query, tab: desired } })
  },
  { immediate: true },
)

// 旧深链 ?tab=orchestrator&orchTab=home-mode → ?tab=home-mode
watch(
  () => [route.query.tab, route.query.orchTab, route.path],
  ([tab, orchTab]) => {
    if (!isOnSettingsRoute()) return
    if (String(tab || '') === 'orchestrator' && orchTab === 'home-mode') {
      const query = { ...route.query, tab: 'home-mode' }
      delete query.orchTab
      delete query.edit
      delete query.wizard
      router.replace({ path: '/settings', query })
    }
  },
  { immediate: true },
)

// 无效 ?tab= 纠偏
watch(
  () => [route.query.tab, route.path],
  ([tab]) => {
    if (!isOnSettingsRoute()) return
    const raw = String(tab || '')
    if (raw && !isValidSettingsTab(raw)) {
      router.replace({ path: '/settings', query: { ...route.query, tab: DEFAULT_TAB } })
    }
  },
  { immediate: true },
)

// 非管理员越权标签页纠偏
watch(
  [() => route.query.tab, isAdmin, () => route.path],
  ([tab, admin]) => {
    if (!isOnSettingsRoute()) return
    const resolved = resolveTab(String(tab || DEFAULT_TAB))
    if (!admin && isAdminOnlyTab(resolved)) {
      router.replace({ path: '/settings', query: { tab: defaultTabForRole(false) } })
    }
  },
  { immediate: true },
)

const hasReconnected = ref(false)
watch(
  () => entitiesStore.connected,
  async (connected, prev) => {
    if (connected && prev === false && hasReconnected.value) {
      const dirty = hasUnsavedSettingsChanges()
      if (dirty) {
        const ok = await chrome.confirm(
          '检测到服务器已恢复连接。刷新页面将应用新版本，但会丢失未保存的设置更改。是否继续刷新？',
          '应用新版本',
          { type: 'danger', confirmText: '刷新页面', cancelText: '暂不刷新' },
        )
        if (!ok) return
        window.location.reload()
        return
      }
      chrome.notify('检测到服务器已完成重构并恢复连接，正在应用新版本...', 'success')
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    }
    if (connected) hasReconnected.value = true
  },
)

watch(
  () => layoutStore.isConfigLoaded,
  (loaded) => {
    if (loaded) snapshotLayoutConfig(layoutStore.layoutConfig)
  },
  { immediate: true },
)

registerGlobalLayoutPendingSnapshot((source) => {
  if (layoutStore.isConfigLoaded) snapshotLayoutConfig(source)
})

// 任意来源的保存/重置都会把 layoutDirty 归位，此时以当前 layoutConfig 重拍快照，
// 使 pendingChanges 基线与「已保存状态」对齐，避免站外保存后残留陈旧快照导致误判。
watch(
  () => layoutStore.layoutDirty,
  (dirty) => {
    if (!dirty && layoutStore.isConfigLoaded) snapshotLayoutConfig(layoutStore.layoutConfig)
  },
)

async function handleSave() {
  const ok = await onSave()
  if (ok) {
    snapshotLayoutConfig(layoutStore.layoutConfig)
  }
  return ok
}

async function handleCancel() {
  if (pendingChanges.value === 0) return
  const ok = await chrome.confirm('确定放弃所有未保存的更改？此操作不可撤销。', '放弃更改', {
    type: 'danger',
    confirmText: '放弃更改',
    cancelText: '继续编辑',
  })
  if (!ok) return
  if (!initialLayoutConfig.value) {
    await layoutStore.loadConfig()
  } else {
    layoutStore.revertLayoutConfig(initialLayoutConfig.value)
  }
  snapshotLayoutConfig(layoutStore.layoutConfig)
  chrome.notify('已恢复为上次保存的配置', 'info')
}
</script>
