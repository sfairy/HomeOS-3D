/**
 * Vue Router 路由配置
 *
 * 职责：
 * 1. 定义全部前端路由表（含认证页、主布局子路由、部件构建器）
 * 2. 注册全局前置守卫 beforeEach：按「注册 → 登录 → 商业授权 → profile 解析」的顺序放行
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
import { registerShellNavigation } from '@/studio/platform/shell-navigation'
import {
  getLicenseActivated,
  hasLicenseFeatureAccess,
  isLicenseFeatureGranted,
  setLicenseActivated,
  setLicenseFeatureAccess,
  shouldRefreshLicenseStatus,
} from './license-gate'
import type { SystemInitState } from '@/types/router'
import { getLicenseAvailability, getLicenseStatus } from '@/services/api/license'
import { defaultTabForRole, isAdminOnlyTab } from '@/utils/registry/settings-nav.util'
import { PAGE_ASSETS as STUDIO_ASSETS } from '@/studio/page-assets'
import LoginView from '@/studio/views/LoginView.vue'
import RegisterView from '@/studio/views/RegisterView.vue'
import LicenseView from '@/studio/views/LicenseView.vue'
import LicenseRecoveryView from '@/studio/views/LicenseRecoveryView.vue'

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
    // 登录页：同步入主包，避免冷开再等 lazy chunk 造成空壳一闪。
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { assets: STUDIO_ASSETS.login },
  },
  {
    // 注册页（首次部署零用户时的唯一入口：账号 + 密码 + 邮箱 + 验证码）
    path: '/register',
    name: 'register',
    component: RegisterView,
    meta: { assets: STUDIO_ASSETS.register },
  },
  {
    // 兼容旧入口：初始化页并入注册语义，整页跳转到 /register
    path: '/setup',
    name: 'setup',
    redirect: '/register',
  },
  {
    // 商业授权激活
    path: '/activate',
    name: 'activation',
    component: LicenseView,
    meta: { assets: STUDIO_ASSETS.license },
  },
  {
    // 兼容旧入口与部署文档里的 /license：授权页现为 /activate（后台「授权状态」面板另有入口）
    path: '/license',
    redirect: '/activate',
  },
  {
    // 授权恢复页（独立路由；授权门禁也会在任意地址就地渲染同一视图）
    path: '/license-recovery',
    name: 'license-recovery',
    component: LicenseRecoveryView,
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
        // 通知中心（功能码 module.notifications 门禁）
        path: 'notifications',
        name: 'notifications',
        component: lazyView(() => import('@/views/NotificationsView.vue')),
        meta: { requiresFeature: 'module.notifications' },
      },
      {
        // 地震历史记录页（功能码 module.earthquake 门禁）
        path: 'earthquake-history',
        name: 'earthquake-history',
        component: lazyView(() => import('@/views/EarthquakeHistoryView.vue')),
        meta: { requiresFeature: 'module.earthquake' },
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
        // 安防中心（监控/告警等；功能码 module.security 门禁）
        path: 'security',
        name: 'security',
        component: lazyView(() => import('@/views/SecurityView.vue')),
        meta: { requiresFeature: 'module.security' },
      },
      {
        // 设置页
        path: 'settings',
        name: 'settings',
        component: lazyView(() => import('@/views/SettingsView.vue')),
      },
      {
        // MoviePilot 影视库：需 module.media；须写在通用 embed/:id 之前以免被吞掉
        path: 'embed/movie-pilot',
        name: 'embed-movie-pilot',
        component: lazyView(() => import('@/views/EmbedView.vue')),
        meta: { requiresFeature: 'module.media' },
      },
      {
        // 嵌入式视图（供 iframe 或外部页面嵌入单个部件）
        path: 'embed/:id',
        name: 'embed',
        component: lazyView(() => import('@/views/EmbedView.vue')),
      },
      // 未匹配路径兜底重定向到仪表盘。
      // 用函数形式，避免把 catch-all 的 pathMatch 参数带到无该 param 的目标路由上
      // （Vue Router R0100：Discarded invalid param(s) "pathMatch"）。
      { path: ':pathMatch(.*)*', redirect: () => ({ name: 'dashboard' }) },
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
  // 使用真实路径历史路由：studio 运行时经 ``navigateInShell`` 走本 router；
  // hash 路由会把 ``/3d-studio`` / ``/display/*`` 等路径解析错。
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

  // ── 1. 系统初始化 + 登录会话探测（首装流程的第一、二段）──
  //
  // 必须先于授权探测：全新部署时本机零用户、也没有授权，若先跑授权门禁会把用户直接
  // 送进激活页，永远到不了注册页。`GET /setup/status` 兼任 CSRF 引导，故无需再叠一次
  // refreshCsrfToken；首屏后端可能仍在启动，用 withBackendBootRetry 轮询重试。
  if (systemInitialized === null || systemInitialized === 'offline') {
    try {
      const initialized =
        systemInitialized === 'offline'
          ? await auth.getSetupStatus()
          : await fetchSetupStatusWithBootRetry(auth)
      systemInitialized = initialized ?? false
      offlineNotified = false
      if (auth.isAuthenticated) {
        // getSetupStatus 内已探测过一次 /auth/me（即续期端点），不必再补一发 refreshSession；
        // 轮询跳过首跑，避免紧随其后的双发与 CSRF 竞态。
        auth.startSessionRefresh({ runImmediately: false })
      }
    } catch (err) {
      logger.error('系统初始化状态检查失败:', err)
      if (isBackendUnreachableError(err)) {
        // 后端不可达：进入 offline 模式，允许重试但不阻塞入户页
        systemInitialized = 'offline'
        if (!offlineNotified) {
          offlineNotified = true
          chrome.notify(getBackendUnreachableHint(), 'error')
        }
      } else {
        // 其他错误按未初始化处理：本机零用户 → 注册页
        systemInitialized = false
      }
    }
  }

  // 初始化状态仍未确定时暂不放行（等待下次探测完成）
  if (systemInitialized === null) return

  // ── 2. 注册 → 登录（授权检测之前）──
  // 未初始化：本机零用户，只能去注册页。
  if (systemInitialized === false) {
    if (to.name === 'register' || to.name === 'setup') return
    return '/register'
  }

  // 后端不可达：放行入户页，其余阻断（不假装已授权）
  if (systemInitialized === 'offline') {
    if (
      to.name === 'register' ||
      to.name === 'setup' ||
      to.name === 'login' ||
      to.name === 'activation'
    ) {
      return
    }
    return false
  }

  // 已初始化仍在注册页：注册入口已关闭，按登录态分流
  if (to.name === 'register' || to.name === 'setup') return auth.isAuthenticated ? '/' : '/login'

  // 需认证但未登录：先登录，登录后再谈授权
  if (!auth.isAuthenticated && to.meta?.requiresAuth) return '/login'

  // ── 3. 商业授权检测（登录之后）──
  //
  // 走 `/license/availability` 而不是 `/license/status`：后者要求登录会话，而这里可能
  // 还没建立会话（公开展示页）；`/availability` 公开脱敏，同样返回 `required` / `allowed`。
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
          // 不可达时不假装已授权（否则随后重试成功会误拉业务 API）
          // 保持 null，下面兜底分支会进入 offline
        } else {
          setLicenseActivated(false)
        }
      }
    }
  }

  // 功能码门禁明细：公开的 `/availability` 不下发它（要求登录会话的 `/status` 才有），
  // 因此登录后拉一次缓存下来，供导航栏与模块入口显隐。
  // 未加载时 fail-closed（入口先收起）；拉取失败则记空明细并标记已加载，
  // 未登记码按放行、真正拦截仍由后端 403 兜底。
  if (auth.isAuthenticated && !hasLicenseFeatureAccess() && getLicenseActivated()) {
    try {
      setLicenseFeatureAccess((await getLicenseStatus()).data.featureAccess)
    } catch (err) {
      logger.warn('功能码门禁明细读取失败，界面按未登记码放行渲染', err)
      setLicenseFeatureAccess({})
    }
  }

  // 未激活：激活需本机会话，故放行 login / activation；其余按登录态分流，
  // 避免「未登录 → 激活页 401 → 想去登录又被踢回激活」的死锁。
  if (getLicenseActivated() === false) {
    if (to.name === 'activation' || to.name === 'login') return
    return auth.isAuthenticated ? '/activate' : '/login'
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

  // 功能码门禁：未授权模块直链一律回总览并提示，避免点进去才发现接口 403。
  // 明细未加载时 fail-closed（上面已尽量拉取；仍未加载则先挡直链，避免闪现）。
  const requiredFeature = typeof to.meta?.requiresFeature === 'string' ? to.meta.requiresFeature : ''
  if (requiredFeature && !isLicenseFeatureGranted(requiredFeature)) {
    if (!hasLicenseFeatureAccess()) {
      chrome.notify('正在确认授权模块…', 'info')
      return { name: 'dashboard' }
    }
    chrome.notify('当前授权未包含该模块，请联系授权管理员。', 'warning')
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