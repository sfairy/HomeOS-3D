/**
 * Vue Router 路由配置
 *
 * 职责：
 * 1. 定义全部前端路由表（含认证页、主布局子路由、部件构建器）
 * 2. 注册全局前置守卫 beforeEach：处理系统初始化状态检查、认证拦截、商业授权与 profile 解析
 * 3. 提供 markSystemInitialized 供 SetupView 完成初始化后通知路由放行
 *
 * 依赖：vue-router、auth.store、layout.store、chrome.store、logger、api-boot-retry、lazy-component、router-auth.util
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import { logger } from '@/utils/core/logger'
import { getBackendUnreachableHint, isBackendUnreachableError } from '@/utils/core/error-message'
import { withBackendBootRetry } from '@/utils/core/api-boot-retry.util'
import { isDynamicImportFailure, lazyView, reloadOnceForStaleChunk } from '@/utils/core/lazy-component'
import { resolveNavigationTarget } from './auth.util'
import { registerShellNavigation } from '@/studio/runtime/shell-navigation'
import {
  getLicenseActivated,
  setLicenseActivated,
  shouldRefreshLicenseStatus,
} from './license-gate'
import type { SystemInitState } from '@/types/router'
import { getLicenseAvailability } from '@/services/api/license'
import { defaultTabForRole, isAdminOnlyTab } from '@/utils/registry/settings-nav.util'
import { PAGE_ASSETS as STUDIO_ASSETS } from '@/studio/page-assets'

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
    // 登录页（并入 homeos-3d 授权场景 UI）
    path: '/login',
    name: 'login',
    component: lazyView(() => import('@/studio/views/LoginView.vue')),
    meta: { assets: STUDIO_ASSETS.login },
  },
  {
    // 初始化引导页（首次使用时创建管理员账户）
    path: '/setup',
    name: 'setup',
    component: lazyView(() => import('@/studio/views/SetupView.vue')),
    meta: { assets: STUDIO_ASSETS.setup },
  },
  {
    // 商业授权激活（并入 homeos-3d 授权场景 UI）
    path: '/activate',
    name: 'activation',
    component: lazyView(() => import('@/studio/views/LicenseView.vue')),
    meta: { assets: STUDIO_ASSETS.license },
  },
  {
    // 授权恢复页（独立路由；授权门禁也会在任意地址就地渲染同一视图）
    path: '/license-recovery',
    name: 'license-recovery',
    component: lazyView(() => import('@/studio/views/LicenseRecoveryView.vue')),
    meta: { assets: STUDIO_ASSETS.licenseRecovery },
  },
  // ── 3D Studio 视图（并入 homeos-3d 的 SPA 路由；hash 历史）──
  // 展示页（渲染 3D 仪表盘）
  {
    path: '/display/:projectId',
    name: 'display',
    component: lazyView(() => import('@/studio/views/DisplayView.vue')),
    meta: { assets: STUDIO_ASSETS.display },
  },
  {
    // 后端是 `/homeos/{project_name:path}`，display.ts 按 `pathname.slice("/homeos/".length)`
    // 整体取用，因此参数必须吃下斜杠。
    path: '/homeos/:name(.*)',
    name: 'homeos',
    component: lazyView(() => import('@/studio/views/DisplayView.vue')),
    meta: { assets: STUDIO_ASSETS.display },
  },
  // 户型图绘制工具（管理员专属；仅从「设置 → 布局」进入）
  {
    path: '/3d-studio',
    name: 'studio',
    component: lazyView(() => import('@/studio/views/StudioView.vue')),
    meta: { assets: STUDIO_ASSETS.studio, requiresAuth: true, requiresAdmin: true },
  },
  // 仪表盘编辑器（管理员专属；仅从「设置 → 布局」进入）。
  // 总览首页已经改为只读展示，创作能力集中在这里。
  {
    path: '/studio/editor',
    name: 'studio-editor',
    component: lazyView(() => import('@/studio/views/EditorView.vue')),
    meta: { assets: STUDIO_ASSETS.editor, requiresAuth: true, requiresAdmin: true },
  },
  {
    // 后端 get_stage() 直接把 SPA 入口作为 stage 页下发；同一 StudioView 在此路径下以
    // `interaction3d-stage` 模式渲染。
    //
    // `bodyClass` 必须声明：`body.interaction3d-stage` 是 stage.css 的开关，用于把舞台裁成
    // 「只剩 #preview-3d」的只读 3D 视图（隐藏绘制工具、属性面板、模型库）。后端已按该
    // 路径把 class 写进 HTML body，但 main.ts 的 afterEach 会按 meta 回收未声明的 body class
    // ——漏声明时 class 会在首次导航后被摘掉，总览里的 3D 部件就会退化成整套户型图绘制页。
    path: '/api/v1/modules/interaction3d/stage.html',
    name: 'stage',
    component: lazyView(() => import('@/studio/views/StudioView.vue')),
    meta: { assets: STUDIO_ASSETS.studio, bodyClass: 'interaction3d-stage' },
  },
  {
    // 主布局壳：包含侧边栏/顶栏，子路由在内部 <router-view> 渲染
    path: '/',
    component: lazyView(() => import('@/layouts/MainLayout.vue')),
    meta: { requiresAuth: true },
    children: [
      {
        // 总览首页 = 3D 仪表盘「只读展示」（display）。
        // 编辑 / 户型图绘制等创作能力不再出现在总览，只能从「设置 → 布局」进入。
        path: '',
        name: 'dashboard',
        component: lazyView(() => import('@/studio/views/DisplayView.vue')),
        meta: { assets: STUDIO_ASSETS.display },
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
  // 使用真实路径历史路由：与 homeos-3d 架构一致，studio 应用内含大量
  // `window.location.assign("/3d-studio" | "/display/*" | "/license" | ...)` 的整页
  // 跳转，hash 路由会把这些路径解析错。
  // 后端已注册 SPA fallback（非 /api/* 的未命中路径返回 index.html），无需额外配置。
  history: createWebHistory('/'),
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

// 把外壳导航入口交给 studio 内的旧命令式运行时：编辑器 / 户型图绘制 / 展示页之间的
// 跳转原本是 `window.location.assign(...)` 整页导航（那些模块只能求值一次），现在它们
// 具备 boot/teardown 生命周期，可以同文档内路由；未注册时 `navigateInShell` 仍退回整页
// 跳转，保证嵌入式 stage 壳等场景行为不变。
registerShellNavigation((path) => router.push(path))

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
 * 4. 已认证用户解析 URL 中的 profile 参数并清理
 *
 * @param to 目标路由
 * @param from 来源路由
 * @returns 重定向目标或 undefined（放行）
 */
router.beforeEach(async (to, from) => {
  const auth = useAuthStore()
  const layout = useLayoutStore()
  const chrome = useChromeStore()

  // 商业授权：首次 / TTL 过期 / 进入激活页时拉取（避免每次子路由导航都打一次探测）
  //
  // 走 `/license/availability` 而不是 `/license/status`：后者要求登录会话，而门禁探测
  // 恰恰发生在「会话可能还不存在」的首屏 —— 用 `/status` 的 401 会被下面的 catch 误判成
  // 「未激活」，把已激活实例的未登录用户送到激活页。`/availability` 是公开脱敏的，
  // 同样返回 `required` / `allowed`。
  const forceLicenseRefresh = to.name === 'activation'
  if (shouldRefreshLicenseStatus(forceLicenseRefresh)) {
    try {
      const status =
        getLicenseActivated() === null
          ? await withBackendBootRetry(() => getLicenseAvailability())
          : await getLicenseAvailability()
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
      // CSRF 引导已由上面这发 GET /setup/status 完成（该端点兼任引导，见后端 api/auth.py）：
      // 此处不必再叠一次 refreshCsrfToken，否则同一次首屏会打两发 /setup/status。
      // 首个突变请求若仍缺 token，api-client 会自行 bootstrap 并在 403 时强制重置。
      if (auth.isAuthenticated) {
        // getSetupStatus 内已探测过一次 /auth/me（即续期端点），不必再补一发 refreshSession；
        // 轮询跳过首跑，避免紧随其后的双发与 CSRF 竞态。
        auth.startSessionRefresh({ runImmediately: false })
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

  // 角色硬拦设置页：非 admin 直链 admin-only Tab 时归一到默认 Tab
  // （SettingsView 内仍有 resolvedTab 回退兜底，此处为守卫层防御纵深）
  if (to.path?.startsWith('/settings')) {
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

  // 创作类路由（仪表盘编辑器 / 户型图绘制）：仅管理员可从「设置 → 布局」进入，
  // 普通家庭成员直链一律回总览（总览是只读展示，不会误改仪表盘）。
  if (to.meta?.requiresAdmin && auth.role !== 'admin') {
    chrome.notify('仅管理员可以进入仪表盘编辑与户型图绘制', 'warning')
    return { name: 'dashboard' }
  }

  // 已认证用户（非 login/setup/activation 路由）解析 profile 参数
  if (
    auth.isAuthenticated &&
    to.name !== 'login' &&
    to.name !== 'setup' &&
    to.name !== 'activation'
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