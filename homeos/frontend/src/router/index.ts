/**
 * Vue Router 路由配置
 *
 * 职责：
 * 1. 定义全部前端路由表（含认证页、主布局子路由、部件构建器）
 * 2. 注册全局前置守卫 beforeEach：处理系统初始化状态检查、认证拦截、访客模式、profile 解析
 * 3. 提供 markSystemInitialized 供 SetupView 完成初始化后通知路由放行
 *
 * 依赖：vue-router、auth.store、layout.store、chrome.store、logger、api-boot-retry、lazy-component、router-auth.util
 */
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import { logger } from '@/utils/core/logger'
import { getBackendUnreachableHint, isBackendUnreachableError } from '@/utils/core/error-message'
import { withBackendBootRetry } from '@/utils/core/api-boot-retry.util'
import { isDynamicImportFailure, lazyView, reloadOnceForStaleChunk } from '@/utils/core/lazy-component'
import { resolveNavigationTarget } from './auth.util'
import {
  getLicenseActivated,
  setLicenseActivated,
  shouldRefreshLicenseStatus,
} from './license-gate'
import type { SystemInitState } from '@/types/router'
import { getLicenseStatus } from '@/services/api/license'
import { refreshCsrfToken } from '@/services/api-client'
import { defaultTabForRole, isAdminOnlyTab } from '@/utils/registry/settings-nav.util'

/** 系统初始化状态缓存：null=未检查、true=已初始化、false=未初始化、'offline'=后端不可达 */
let systemInitialized: SystemInitState = null
/** 离线通知去重标记，避免每次导航都弹 toast */
let offlineNotified = false

/**
 * 带后端启动重试地获取系统初始化状态。
 *
 * @param auth 认证 store 实例
 * @returns 系统是否已完成初始化（true/false）
 *
 * 调用场景：首次导航时后端可能仍在启动中，withBackendBootRetry 会轮询重试直到后端就绪。
 */
async function fetchSetupStatusWithBootRetry(auth: ReturnType<typeof useAuthStore>) {
  return withBackendBootRetry(() => auth.getSetupStatus())
}

const routes: RouteRecordRaw[] = [
  {
    // 登录页
    path: '/login',
    name: 'login',
    component: lazyView(() => import('@/views/LoginView.vue')),
  },
  {
    // 初始化引导页（首次使用时创建管理员账户）
    path: '/setup',
    name: 'setup',
    component: lazyView(() => import('@/views/SetupView.vue')),
  },
  {
    // 商业授权激活（离线永久 JWT）
    path: '/activate',
    name: 'activation',
    component: lazyView(() => import('@/views/ActivationView.vue')),
  },
  {
    // 访客模式页（无需登录的受限视图）
    path: '/guest',
    name: 'guest',
    component: lazyView(() => import('@/views/GuestView.vue')),
  },
  {
    // 主布局壳：包含侧边栏/顶栏，子路由在内部 <router-view> 渲染
    path: '/',
    component: lazyView(() => import('@/layouts/MainLayout.vue')),
    meta: { requiresAuth: true },
    children: [
      {
        // 仪表盘首页（默认着陆页）
        path: '',
        name: 'dashboard',
        component: lazyView(() => import('@/views/DashboardView.vue')),
      },
      {
        // 设备列表页
        path: 'devices',
        name: 'devices',
        component: lazyView(() => import('@/views/DevicesView.vue')),
      },
      {
        // 设备详情页
        path: 'device',
        name: 'device-detail',
        component: lazyView(() => import('@/views/DeviceDetailView.vue')),
      },
      // 房间管理重定向到设置页房间标签
      { path: 'rooms', redirect: { path: '/settings', query: { tab: 'rooms' } } },
      {
        // 通知中心
        path: 'notifications',
        name: 'notifications',
        component: lazyView(() => import('@/views/NotificationsView.vue')),
      },
      {
        // 地震历史记录页
        path: 'earthquake-history',
        name: 'earthquake-history',
        component: lazyView(() => import('@/views/EarthquakeHistoryView.vue')),
      },
      {
        // 事件日志页
        path: 'events',
        name: 'events',
        component: lazyView(() => import('@/views/EventsView.vue')),
      },
      {
        // 模式触发日志页
        path: 'mode-logs',
        name: 'mode-logs',
        component: lazyView(() => import('@/views/ModeTriggerLogsView.vue')),
      },
      {
        // 安防中心（监控/告警等）
        path: 'security',
        name: 'security',
        component: lazyView(() => import('@/views/SecurityView.vue')),
      },
      {
        // 设置页
        path: 'settings',
        name: 'settings',
        component: lazyView(() => import('@/views/SettingsView.vue')),
      },
      {
        // 嵌入式视图（供 iframe 或外部页面嵌入单个部件）
        path: 'embed/:id',
        name: 'embed',
        component: lazyView(() => import('@/views/EmbedView.vue')),
      },
      // 未匹配路径兜底重定向到仪表盘
      { path: ':pathMatch(.*)*', redirect: { name: 'dashboard' } },
    ],
  },
]

// ── keep-alive 页面滚动位置记忆 ──
// 浏览器后退/前进（popstate）标记：仅此类导航恢复记忆的滚动位置
let isPopNavigation = false
window.addEventListener('popstate', () => {
  isPopNavigation = true
})

// 页面级可滚动容器选择器：html/body 滚动被禁用，列表/面板的实际滚动发生这些容器上
const SCROLL_CONTAINER_SELECTORS = [
  '.list-page',
  '.list-page__panel-body',
  '.settings-page',
  '.settings-page-inset--scroll',
  '.events-page',
  '.settings-main',
]

interface ScrollContainerRecord {
  /** 匹配选择器 */
  selector: string
  /** 各匹配容器的 scrollTop（同选择器可能有多个实例） */
  tops: number[]
}

interface RememberedScroll {
  windowTop: number
  containers: ScrollContainerRecord[]
}

// 记录每个路由离开时的滚动位置（fullPath 为键），供 keep-alive 返回时恢复
const rememberedScrollPositions = new Map<string, RememberedScroll>()
// 待恢复记录：scrollBehavior 命中记忆后交由 afterEach 在渲染完成后应用
let pendingScrollRestore: RememberedScroll | null = null

/** 读取当前页面滚动位置：window + 主要内层可滚动容器 */
function readScrollPositions(): RememberedScroll {
  const containers: ScrollContainerRecord[] = []
  for (const selector of SCROLL_CONTAINER_SELECTORS) {
    const tops: number[] = []
    document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      // 仅记录实际可滚动（有溢出）或已滚动的容器，避免空记录
      if (el.scrollHeight > el.clientHeight + 8 || el.scrollTop > 0) tops.push(el.scrollTop)
    })
    if (tops.length) containers.push({ selector, tops })
  }
  return { windowTop: window.scrollY || window.pageYOffset || 0, containers }
}

/** 恢复页面滚动位置：等渲染帧后应用，确保 keep-alive 恢复的容器已挂载 */
function restoreScrollPositions(remembered: RememberedScroll) {
  requestAnimationFrame(() => {
    window.scrollTo(0, remembered.windowTop)
    for (const { selector, tops } of remembered.containers) {
      document.querySelectorAll<HTMLElement>(selector).forEach((el, i) => {
        if (tops[i] !== undefined) el.scrollTop = tops[i]
      })
    }
  })
}

const router = createRouter({
  // 使用 hash 路由，避免后端需要配置 history fallback
  history: createWebHashHistory(),
  routes,
  // keep-alive 页面返回（后退/前进）时恢复滚动位置；新进入页面保持回到顶部
  scrollBehavior(to, from, savedPosition) {
    // 离开页面时记录其滚动位置（window + 内层容器），供 keep-alive 返回时恢复
    if (from.name) {
      rememberedScrollPositions.set(from.fullPath, readScrollPositions())
      // 限制记忆条目数量，防止设备详情等大量不同 fullPath 累积
      if (rememberedScrollPositions.size > 40) {
        const oldest = rememberedScrollPositions.keys().next().value
        if (oldest !== undefined) rememberedScrollPositions.delete(oldest)
      }
    }
    const popNavigation = isPopNavigation
    isPopNavigation = false
    if (popNavigation) {
      // 后退/前进：命中记忆时暂存，由 afterEach 在渲染完成后恢复内层容器滚动
      pendingScrollRestore = rememberedScrollPositions.get(to.fullPath) || null
      return savedPosition || { top: pendingScrollRestore?.windowTop ?? 0 }
    }
    // 部分浏览器在 hash 路由下仍会提供 savedPosition，兼容处理
    if (savedPosition) return savedPosition
    // 新进入页面回到顶部
    return { top: 0 }
  },
})

// 导航渲染完成后恢复内层可滚动容器的滚动位置（window 滚动由 scrollBehavior 返回值处理）
router.afterEach(() => {
  if (!pendingScrollRestore) return
  const record = pendingScrollRestore
  pendingScrollRestore = null
  restoreScrollPositions(record)
})
/**
 * 全局前置守卫：
 * 1. 首次导航时检查系统初始化状态（带后端启动重试）
 * 2. 后端不可达时进入 offline 模式并提示用户
 * 3. 调用 resolveNavigationTarget 决策目标路由
 * 4. 访客模式下拦截 embed 访问
 * 5. 已认证用户解析 URL 中的 profile 参数并清理
 *
 * @param to 目标路由
 * @param from 来源路由
 * @returns 重定向目标或 undefined（放行）
 */
router.beforeEach(async (to, from) => {
  const auth = useAuthStore()
  const layout = useLayoutStore()
  const chrome = useChromeStore()

  // 商业授权：首次 / TTL 过期 / 进入激活页时拉取（避免每次子路由导航都打 status）
  const forceLicenseRefresh = to.name === 'activation'
  if (shouldRefreshLicenseStatus(forceLicenseRefresh)) {
    try {
      const status =
        getLicenseActivated() === null
          ? await withBackendBootRetry(() => getLicenseStatus())
          : await getLicenseStatus()
      setLicenseActivated(!status.data.required || status.data.allowed)
    } catch (err) {
      logger.error('商业授权状态检查失败:', err)
      if (getLicenseActivated() === null) {
        if (isBackendUnreachableError(err)) {
          // 不可达时不假装已授权（否则随后 setup 重试成功会误拉业务 API）
          // 保持 null，下面 setup 探测会进入 offline
        } else {
          setLicenseActivated(false)
        }
      }
    }
  }

  // 未激活：立刻去激活页，且不要先跑 getSetupStatus（会触发已登录副作用拉业务 API）
  if (getLicenseActivated() === false) {
    if (to.name === 'activation') return
    return '/activate'
  }

  // 授权状态仍未知（多半后端不可达）：跳过登录探测副作用，交给 offline 分支
  if (getLicenseActivated() === null) {
    if (systemInitialized === null) {
      systemInitialized = 'offline'
      if (!offlineNotified) {
        offlineNotified = true
        chrome.notify(getBackendUnreachableHint(), 'error')
      }
    }
    if (to.name === 'login' || to.name === 'setup' || to.name === 'activation') return
    return false
  }

  // 系统初始化状态未检查或处于离线态时，重新探测
  if (systemInitialized === null || systemInitialized === 'offline') {
    try {
      const initialized =
        systemInitialized === 'offline'
          ? await auth.getSetupStatus()
          : await fetchSetupStatusWithBootRetry(auth)
      systemInitialized = initialized ?? false
      offlineNotified = false
      // 已认证状态下启动会话刷新，避免 token 过期
      if (auth.isAuthenticated) {
        void auth.refreshSession()
        // 走 api-client 共享的 CSRF bootstrap Promise：与首个突变请求的 refreshCsrfToken 合并，
        // 防止并发两次 GET /auth/status → 两次 set-cookie 覆盖造成 header/cookie 对不上的 403。
        void refreshCsrfToken()
        // 已显式刷新一次，轮询跳过首跑，避免双发 refresh 与 CSRF 竞态
        auth.startSessionRefresh({ runImmediately: false })
      } else {
        // 访客 / 未登录用户也需要一个 CSRF cookie（登录表单 POST、初始 POST 交互等）
        void refreshCsrfToken()
      }
    } catch (err) {
      logger.error('系统初始化状态检查失败:', err)
      if (isBackendUnreachableError(err)) {
        // 后端不可达：进入 offline 模式，允许重试但不阻塞导航
        systemInitialized = 'offline'
        if (!offlineNotified) {
          offlineNotified = true
          chrome.notify(getBackendUnreachableHint(), 'error')
        }
      } else {
        // 其他错误视为未初始化，跳转 setup 页
        systemInitialized = false
        if (to.name !== 'setup' && to.name !== 'activation') return '/setup'
      }
    }
  }

  // 初始化状态仍未确定时暂不放行（等待下次探测完成）
  if (systemInitialized === null) return

  // 委托纯函数决策导航目标
  const target = resolveNavigationTarget(to, {
    systemInitialized,
    isAuthenticated: auth.isAuthenticated,
    licenseActivated: getLicenseActivated(),
    settingsLockEnabled: layout.layoutConfig.settingsLock?.enabled,
    isSettingsUnlocked: layout.isSettingsUnlocked,
  })

  // undefined 表示需要中止导航（等待异步状态确定）
  if (target === undefined) return

  // 访客模式拦截设置类页面
  if (target === '/') {
    // 激活页完成或设置锁回退都会到 '/'；仅设置锁场景弹访客提示易误导，保留原逻辑需区分
    if (
      to.path?.startsWith('/settings') &&
      layout.layoutConfig.settingsLock?.enabled &&
      !layout.isSettingsUnlocked
    ) {
      chrome.notify('系统已进入访客模式，访问设置需先进行身份验证', 'warning')
    }
    return '/'
  }

  // 非 null 的 target 表示需要重定向
  if (target !== null) return target

  // 访客用户不可访问 embed 嵌入页，回退到首页
  if (auth.isGuest() && to.name === 'embed') {
    return '/'
  }

  // 角色硬拦设置页：guest 一律回首页；非 admin 直链 admin-only Tab 时归一到默认 Tab
  // （SettingsView 内仍有 resolvedTab 回退兜底，此处为守卫层防御纵深）
  if (to.path?.startsWith('/settings')) {
    if (auth.isGuest()) {
      return '/'
    }
    if (auth.role !== 'admin') {
      const tab = typeof to.query.tab === 'string' ? to.query.tab : undefined
      if (tab && isAdminOnlyTab(tab)) {
        return {
          path: '/settings',
          query: { ...to.query, tab: defaultTabForRole(false) },
          replace: true,
        }
      }
    }
  }

  // 已认证用户（非 login/setup/guest/activation 路由）解析 profile 参数
  if (
    auth.isAuthenticated &&
    to.name !== 'login' &&
    to.name !== 'setup' &&
    to.name !== 'activation' &&
    to.name !== 'guest'
  ) {
    const queryProfile = typeof to.query.profile === 'string' ? to.query.profile : undefined
    // 同 path 仅改 query（Hub Tab 等）时跳过 profile 解析，避免 await 拖慢并造成 replace 竞态
    const samePathQueryOnly =
      from.matched.length > 0 &&
      to.path === from.path &&
      to.name === from.name &&
      !queryProfile &&
      layout.isConfigLoaded
    if (!samePathQueryOnly) {
      try {
        await layout.ensureActiveProfileResolved(queryProfile)
      } catch (err) {
        logger.warn('解析 display profile 失败', err)
      }
    }
    // profile 参数消费后从 URL 中移除，保持地址栏整洁
    if (queryProfile) {
      const nextQuery = { ...to.query }
      delete nextQuery.profile
      return { path: to.path, query: nextQuery, hash: to.hash, replace: true }
    }
  }
})

/**
 * 标记系统已完成初始化。
 *
 * 调用场景：SetupView 完成管理员账户创建后调用，使路由守卫放行后续导航到主界面。
 */
export function markSystemInitialized(): void {
  systemInitialized = true
}

/** HMR / 部署后 chunk 失效时，导航错误走一次整页刷新恢复 */
router.onError((error) => {
  if (reloadOnceForStaleChunk(error)) return
  if (isDynamicImportFailure(error)) {
    logger.warn('路由懒加载失败', error)
    return
  }
  logger.error('路由导航错误', error)
})

export default router