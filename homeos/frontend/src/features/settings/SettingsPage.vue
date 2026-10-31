<template>
  <div
    class="settings-shell"
    :class="{
      'settings-shell--sidebar-collapsed': !isCompactSettings && sidebarCollapsed && showSettingsNav,
      'settings-shell--compact': isCompactSettings,
      'settings-shell--compact-nav-open': isCompactSettings && showSettingsNav && compactNavOpen,
      'settings-shell--no-sidebar': !showSettingsNav,
    }"
    @keydown="onSettingsShellKeydown"
  >
    <SettingsSidebar
      v-if="showSettingsNav"
      ref="settingsSidebarRef"
      class="settings-sidebar--desktop"
      :inert="isCompactSettings && !compactNavOpen"
      :groups="navGroups"
      :active-tab="resolvedTab"
      :saving="saving"
      :show-save="true"
      :uses-independent-save="usesIndependentSave"
      :pending-changes="pendingChanges"
      :app-version="appVersion"
      v-model:search-query="settingsSearchQuery"
      @navigate="navigateTab"
      @save="handleSave"
      @cancel="handleCancel"
      @toggle-collapse="toggleSidebar"
      @logout="handleLogout"
      @change-password="changePasswordDialog?.open()"
    />

    <button
      v-if="isCompactSettings && compactNavOpen"
      type="button"
      class="settings-nav-backdrop"
      tabindex="-1"
      :aria-label="'关闭设置导航'"
      @click="closeCompactNav()"
    />

    <div
      ref="settingsMainRef"
      class="settings-main"
      tabindex="-1"
      :inert="isCompactSettings && compactNavOpen"
    >
      <button
        v-if="isNavHidden"
        ref="reopenButtonRef"
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
        <!-- 侧栏收起时账号动作不能跟着消失：侧栏是靠 CSS 压到 0 宽 + pointer-events:none
             藏起来的，组件还在，按钮却点不到 —— 那会让「改密码 / 退出」在设置里彻底没有入口。
             这里补一组等价图标按钮（同一套 handler），推到行尾，与复制链接分开。 -->
        <div
          v-if="isNavHidden"
          class="settings-breadcrumb__account"
          role="group"
          aria-label="账号"
        >
          <button
            type="button"
            class="settings-breadcrumb__copy"
            title="修改本机密码"
            aria-label="修改本机密码"
            @click="changePasswordDialog?.open()"
          >
            <KeyRound class="settings-breadcrumb__copy-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="settings-breadcrumb__copy settings-breadcrumb__copy--danger"
            title="退出登录"
            aria-label="退出登录"
            @click="handleLogout"
          >
            <LogOut class="settings-breadcrumb__copy-icon" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div class="settings-main__stage">
        <SettingsOverviewStrip
          v-if="resolvedTab === 'general'"
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
    </div>

    <!-- 仪表板编辑模式退出确认（非设置表单离开守卫；设置离开见 confirmLeaveIfDirty） -->
    <ExitEditConfirmDialog />
    <!-- 修改本机密码：与退出登录同属「账号」动作，挂在这里而不是某个面板里，
         这样侧栏账号条在任何 Tab 上都能叫出它（面板会被 keep-alive / 懒加载替换）。 -->
    <ChangePasswordDialog ref="changePasswordDialog" />
    <!-- 确认 / 输入对话框已提升到 App.vue 根，避免设置页与主壳双重挂载 -->
  </div>
</template>

<script setup>
import { readLocalStorageFlag, writeLocalStorage } from '@/shared/utils/core/local-storage.util'
/**
 * 系统设置页面 — 薄壳入口
 * 侧边栏分组导航 + 动态面板加载，样式见 settings/shared/settings-theme.css
 */
import {
  computed,
  nextTick,
  ref,
  watch,
  defineAsyncComponent,
  onMounted,
  onBeforeUnmount,
  onScopeDispose,
} from 'vue'
import { PanelLeft, ChevronRight, Link2, KeyRound, LogOut } from '@lucide/vue'
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router'
import { useEntitiesStore } from '@/stores/entities.store'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useSettingsSave } from '@/composables/settings-kernel/save.internals'
import {
  resetAllSettingsTabDrafts,
  resetSettingsTabDraft,
  useSettingsPendingChanges,
} from '@/composables/settings-kernel/pending.internals'
import SettingsSidebar from './shared/layout/SettingsSidebar.vue'
import SettingsOverviewStrip from './shared/layout/SettingsOverviewStrip.vue'
import {
  PANEL_MAP,
  buildNavGroups,
  resolveTab,
  DEFAULT_TAB,
  isValidSettingsTab,
  INDEPENDENT_SAVE_TABS,
} from './nav'
import { isTabFeatureGranted } from '@/shared/utils/registry/settings-nav.util'
import { useLicenseFeatureAccess } from '@/router/license-gate'
import {
  hasIndependentSettingsPending,
  getIndependentPendingTabIds,
  isSettingsTabPending,
  globalLayoutPendingCount,
} from '@/composables/settings-kernel/pending.internals'
import {
  registerGlobalLayoutPendingSnapshot,
  registerGlobalPendingPause,
} from '@/composables/settings-kernel/pending.internals'
import { tabLabel } from '@/shared/utils/registry/settings-nav.util'
import { countNavTabs, resolveNavTabContext } from './nav-search.util'
import {
  SETTINGS_KEEP_ALIVE_MAX,
  SETTINGS_KEEP_ALIVE_INCLUDE,
} from './keep-alive.util'
import { settingsPageShareUrl } from '@/shared/utils/registry/settings-route.util'
import { recordSettingsTabVisit } from '@/shared/utils/registry/settings-recent-tabs.util'
import { copyTextWithNotify } from '@/services/notify'
import pkg from '../../../package.json'
import './shared/settings-theme.css'

const appVersion = pkg.version

const ExitEditConfirmDialog = defineAsyncComponent(
  () => import('@/components/common/ExitEditConfirmDialog.vue'),
)

// 同步引入而不是 defineAsyncComponent：侧栏账号条是一进来就可见的，
// 异步组件的模板 ref 要等解析完成才拿得到 open()，会让第一次点击落空。
import ChangePasswordDialog from './display/ChangePasswordDialog.vue'

/** 修改密码弹窗句柄：`ref="changePasswordDialog"` 需要同名变量才拿得到实例。 */
const changePasswordDialog = ref(null)

const router = useRouter()
const route = useRoute()
const entitiesStore = useEntitiesStore()
const layoutStore = useLayoutStore()
const authStore = useAuthStore()
const chrome = useChromeStore()
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
const settingsSidebarRef = ref(null)
const settingsMainRef = ref(null)
const reopenButtonRef = ref(null)

// 900px 以下侧栏改为覆盖式抽屉：固定 260px 侧栏会把主内容压到约 130px，
// 而手动折叠状态来自 localStorage，首次进入窄屏时不会自动收起。
const compactMediaQuery =
  typeof window !== 'undefined' ? window.matchMedia('(max-width: 900px)') : null
const isCompactSettings = ref(compactMediaQuery?.matches ?? false)
const compactNavOpen = ref(false)

function openCompactNav() {
  if (!showSettingsNav.value) return
  compactNavOpen.value = true
  nextTick(() => settingsSidebarRef.value?.focusFirstControl?.())
}

function closeCompactNav({ restoreFocus = true } = {}) {
  if (!compactNavOpen.value) return
  compactNavOpen.value = false
  if (restoreFocus) nextTick(() => reopenButtonRef.value?.focus())
}

function toggleSidebar() {
  if (isCompactSettings.value) {
    if (compactNavOpen.value) closeCompactNav()
    else openCompactNav()
    return
  }
  sidebarCollapsed.value = !sidebarCollapsed.value
  try {
    writeLocalStorage(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed.value ? '1' : '0')
  } catch {
    /* 忽略 */
  }
}

/** 抽屉打开时把 Tab 焦点圈在侧栏首尾，别漏到被 inert 的主内容。 */
function trapCompactNavFocus(event) {
  const items = settingsSidebarRef.value?.getFocusableElements?.() ?? []
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  if (!items.includes(active)) {
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
    return
  }
  if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

/** Esc 关闭抽屉；Tab 交给焦点循环处理。 */
function onSettingsShellKeydown(event) {
  if (!isCompactSettings.value || !compactNavOpen.value) return
  if (event.key === 'Escape') {
    event.stopPropagation()
    closeCompactNav()
    return
  }
  if (event.key === 'Tab') trapCompactNavFocus(event)
}

function onCompactMediaChange(event) {
  const next = event.matches
  if (next === isCompactSettings.value) return
  const focusWasInSidebar = settingsSidebarRef.value?.$el?.contains(document.activeElement)
  isCompactSettings.value = next
  compactNavOpen.value = false
  nextTick(() => {
    if (next) {
      if (focusWasInSidebar) reopenButtonRef.value?.focus()
    } else if (focusWasInSidebar) {
      settingsSidebarRef.value?.focusFirstControl?.()
    }
  })
}

// 功能码明细（``GET /license/status`` 的 featureAccess）：只用于侧栏与落地页显隐，
// 未加载时为空对象 → isTabFeatureGranted 一律放行，接口层 403 才是权威拦截点。
const licenseFeatureAccess = useLicenseFeatureAccess()

const navGroups = computed(() => buildNavGroups(licenseFeatureAccess.value))

const showSettingsNav = computed(() => countNavTabs(navGroups.value) >= 1)

const isNavHidden = computed(
  () =>
    showSettingsNav.value &&
    (isCompactSettings.value ? !compactNavOpen.value : sidebarCollapsed.value),
)

const resolvedTab = computed(() => {
  const explicit = route.query.tab
  const tab = explicit ? resolveTab(explicit) : DEFAULT_TAB
  // 未授权增量模块的 Tab 同样回退：直接带 ?tab=voice 进来时不能渲染一个必然被 403 的配置页
  if (!isTabFeatureGranted(tab, licenseFeatureAccess.value)) {
    return DEFAULT_TAB
  }
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

// 对外暴露全局布局脏计数：方案切换等「会重拉布局」的操作据此提醒，避免静默丢弃草稿
watch(
  pendingChanges,
  (n) => {
    globalLayoutPendingCount.value = n
  },
  { immediate: true },
)
onScopeDispose(() => {
  globalLayoutPendingCount.value = 0
})

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

/**
 * 「即将离开」场景的未保存摘要（退出登录用）。
 *
 * 不能复用 `describeUnsavedChanges()`：那句带着「**请到对应页点击保存后再离开**」的行动指令，
 * 而调用方要在后面接「退出后这些修改将丢失」—— 两句连起来是自相矛盾的
 * （一边让人先去保存，一边宣告已经保不住了）。这里只陈述事实，处置由调用方说。
 */
function summarizeUnsavedChanges() {
  const independent = getIndependentPendingTabIds()
  if (independent.length) {
    const labels = independent.map((id) => tabLabel(id)).join('、')
    return `「${labels}」还有未保存的更改。`
  }
  if (pendingChanges.value > 0) {
    return `全局布局还有 ${pendingChanges.value} 项未保存的更改。`
  }
  return '当前还有未保存的更改。'
}

/** 设置页内切换 tab：只检查当前 tab，避免 keep-alive 中其它面板误报 pending */
function hasUnsavedForCurrentTab() {
  const tab = resolvedTab.value
  // 非独立 tab 也可注册 pendingByTab（如 access 偏好等旁路 dirty）
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

/**
 * 真正放弃全局布局的未保存改动：回到上次保存的基线并重拍快照。
 *
 * 只弹确认框不回滚是「假放弃」：这些改动仍留在 layoutConfig 里，之后任意自动保存
 * （悬浮伴侣拖动、收藏、地震向导…）都会把它们写进库，而且每次切页都会再弹一次
 * 同样的「全局布局有 N 项未保存的更改」。
 */
function discardGlobalLayoutChanges() {
  if (pendingChanges.value <= 0) return
  const baseline = initialLayoutConfig.value
  if (!baseline) return
  layoutStore.revertLayoutConfig(baseline)
  snapshotLayoutConfig(layoutStore.layoutConfig)
}

function isOnSettingsRoute() {
  return route.name === 'settings' || route.path === '/settings'
}

/** 已单独确认过「放弃改动」的导航（退出登录）：跳过路由离开守卫，避免二次确认 */
let skipLeaveGuard = false

/**
 * 侧栏账号条的「退出」。
 *
 * 只吊销本机会话，不动商店授权（解绑是另一件事，见授权状态页）。两步确认合并成一步：
 * 有未保存改动时把这句话并进同一条确认框，避免「要不要离开」+「真的退出吗」连弹两次。
 *
 * 用 `router.replace` 而不是 `push`：退出后不该留一条能按回退键回到设置页的历史，
 * 那条记录会在守卫里再被弹一次，看起来像闪屏。
 */
async function handleLogout() {
  const message = hasUnsavedSettingsChanges()
    ? `${summarizeUnsavedChanges()}退出后这些更改会丢失，并且需要重新输入密码才能进入这台终端。`
    : '退出后需要重新输入密码才能进入这台终端；家中自动化、场景与授权都不受影响。'
  const confirmed = await chrome.confirm(message, '退出登录', {
    type: 'danger',
    confirmText: '退出登录',
    cancelText: '留在设置',
  })
  if (!confirmed) return
  // 退出登录的确认框已经把「未保存改动会丢失」说清楚：这里真正回滚，
  // 并跳过路由离开守卫，避免刚确认过退出又弹一次「未保存的更改」。
  resetAllSettingsTabDrafts()
  discardGlobalLayoutChanges()
  skipLeaveGuard = true
  try {
    await authStore.logout()
    await router.replace('/login')
  } finally {
    skipLeaveGuard = false
  }
}

async function navigateTab(tabId) {
  if (tabId === resolvedTab.value) {
    if (isCompactSettings.value) closeCompactNav({ restoreFocus: false })
    return
  }
  // 只有「确实为当前页报过未保存」才做丢弃：没弹确认就回滚等于背着用户丢数据
  // （例如全局布局因其它面板变脏、而当前独立页自己并不脏）。
  const hadUnsaved = hasUnsavedForCurrentTab()
  const ok = await confirmLeaveCurrentTabIfDirty()
  if (!ok) return
  if (hadUnsaved) {
    // 确认框说「离开后这些修改将丢失」，就得真的丢。
    // - 独立保存页：草稿活在 keep-alive 面板里，交给面板自己回滚（它最清楚自己那份基线），
    //   否则回到该 Tab 还能看到改动与待保存角标（甚至被下一次自动保存写进库）。
    // - 其余页：改动直接落在全局 layoutConfig 上，回滚到本页基线。
    if (INDEPENDENT_SAVE_TABS.has(resolvedTab.value)) {
      resetSettingsTabDraft(resolvedTab.value)
    } else {
      discardGlobalLayoutChanges()
    }
  }
  settingsSearchQuery.value = ''
  const wasCompact = isCompactSettings.value
  if (wasCompact) closeCompactNav({ restoreFocus: false })
  // 显式 path，避免仅改 query 时与站外路由竞态
  await router.push({ path: '/settings', query: { tab: tabId } })
  if (wasCompact) nextTick(() => settingsMainRef.value?.focus())
}

// 记录最近访问的设置面板，供「最近使用」首页快捷直达
watch(
  resolvedTab,
  (tab) => {
    if (tab) recordSettingsTabVisit(tab)
    if (isCompactSettings.value && compactNavOpen.value) closeCompactNav({ restoreFocus: false })
  },
  { immediate: true },
)

onBeforeRouteLeave(async () => {
  if (skipLeaveGuard) return true
  const ok = await confirmLeaveIfDirty()
  // 离开设置页时同样真正回滚，避免「已确认放弃」的改动被后续自动保存写进库
  if (ok) {
    resetAllSettingsTabDrafts()
    discardGlobalLayoutChanges()
  }
  return ok
})

/** 刷新/关页：有未保存更改时触发浏览器原生离开确认 */
function onSettingsBeforeUnload(e) {
  if (!hasUnsavedSettingsChanges()) return
  e.preventDefault()
  e.returnValue = ''
}

function syncCompactSettings() {
  if (!compactMediaQuery) return
  isCompactSettings.value = compactMediaQuery.matches
}

onMounted(() => {
  syncCompactSettings()
  compactMediaQuery?.addEventListener('change', onCompactMediaChange)
  window.addEventListener('beforeunload', onSettingsBeforeUnload)
})

onBeforeUnmount(() => {
  compactMediaQuery?.removeEventListener('change', onCompactMediaChange)
  window.removeEventListener('beforeunload', onSettingsBeforeUnload)
})

// 无 ?tab= 时同步 URL 为默认落地页（首装向导）
// 必须限定在 /settings：离开设置时 query.tab 变空会触发本 watch，若无守卫会把 tab=setup-wizard 写到 /devices、/security 等页面
watch(
  [() => route.query.tab, () => layoutStore.isConfigLoaded, () => route.path],
  ([tab]) => {
    if (!isOnSettingsRoute()) return
    if (tab) return
    if (!layoutStore.isConfigLoaded) return
    router.replace({ path: '/settings', query: { ...route.query, tab: DEFAULT_TAB } })
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
// 用 nextTick 延后一拍：保存调用方会在 await 返回后做收尾写入（例如把密钥回填成
// 脱敏占位、补 apiKeyConfigured）。若在归位的同时立刻拍快照，会拍到「保存中途」的
// 状态，收尾写入反而变成新的待保存项（典型症状：保存完立刻提示「全局布局有 1 项未保存」）。
watch(
  () => layoutStore.layoutDirty,
  (dirty) => {
    if (dirty || !layoutStore.isConfigLoaded) return
    void nextTick(() => {
      if (!layoutStore.layoutDirty && layoutStore.isConfigLoaded) {
        snapshotLayoutConfig(layoutStore.layoutConfig)
      }
    })
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
