/**
 * HomeOS 前端入口文件
 *
 * 启动流程：
 * 1. 全局注入 passive 事件监听器优化触屏性能
 * 2. 创建 Vue 3 应用实例
 * 3. 安装 Pinia 状态管理
 * 4. 安装 Vue Router
 * 5. 挂载到 #app 根节点
 *
 * 将受限 Vue API 暴露到 window，供 CustomHtmlWidget 动态编译使用（避免整包挂全局）。
 */

// 触屏/wheel 事件 passive 优化说明
// 全局 monkey-patch 已移除：劫持 addEventListener 强制 passive:true 会破坏
// 第三方库（vue-flow / hls.js / echarts 等）与自身代码的 preventDefault()。
// 需要 passive 的监听点改为显式传 { passive: true }；需要 preventDefault 的
// 显式传 { passive: false }（如 floorplan 的 wheel/touchmove 拖拽）。

import {
  createApp,
  ref,
  computed,
  watch,
  reactive,
  shallowRef,
  shallowReactive,
  onMounted,
  onUnmounted,
  onBeforeUnmount,
  defineComponent,
} from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router/index'
import './assets/styles/main.css'
import './assets/styles/app-premium-tokens.css'
import './assets/styles/hos-design-system.css'
import './assets/styles/hos-panel.css'
import './assets/styles/app-typography.css'
import './assets/styles/premium-head.css'
import './assets/styles/premium-accordion.css'
import './assets/styles/scaled-viewport.css'
import './assets/styles/modal-theme.css'
import './assets/styles/widget-glass.css'
import './assets/styles/widget-hub-theme.css'
import './assets/styles/motion.css'
import './assets/styles/list-page.css'
import './assets/styles/list-page-views.css'
import './assets/styles/degrade-banner.css'
import './assets/styles/multi-color.css'
import {
  loadFrontendConfig,
  setupFrontendConfigVisibilitySync,
} from './utils/config/frontend-config'
import { setupGlassEffectSync } from './utils/ui/glass-effect.util'
import { applyHomeOsTheme } from './utils/ui/theme.util'
import { setupSmartPerformanceMode } from './utils/perf/smart-performance.util'
import {
  registerAuthChangeHandler,
  registerUnauthorizedHandler,
  registerNavigateToLoginHandler,
  registerSessionRefreshHandler,
  registerUiNotifyHandler,
} from './utils/bridge/store-bridge'
import { useAuthStore } from './stores/auth.store'
import { useLayoutStore } from './stores/layout.store'
import { useChromeStore } from './stores/chrome.store'
import VSkeleton from './components/common/base/VSkeleton.vue'
import VEmptyState from './components/common/base/VEmptyState.vue'
import VPanelSkeleton from './components/common/base/VPanelSkeleton.vue'
import { swipeClose } from './swipe-close.directive'

// CSRF 兜底注入已收敛到单 HTTP 栈：`services/api-client` 在模块求值时调用
// `services/api/csrf.ts#installFetchCsrf()`，覆盖 studio 遗留的裸 fetch 写请求。

// CustomHtmlWidget 可用的最小 Vue 运行时 API 导出
window.__homeos_vue__ = {
  ref,
  computed,
  watch,
  reactive,
  shallowRef,
  shallowReactive,
  onMounted,
  onUnmounted,
  onBeforeUnmount,
  defineComponent,
}
// 优先加载系统配置（阻塞直到完成，确保 stores 使用正确参数）
const app = createApp(App)
// 注册全局基础组件，避免在每个使用处重复 import
app.component('VSkeleton', VSkeleton)
app.component('VEmptyState', VEmptyState)
app.component('VPanelSkeleton', VPanelSkeleton)
// 注册全局指令 v-swipe-close
app.directive('swipe-close', swipeClose)
app.use(createPinia())
app.use(router)

/** 渲染 DisplayView 的路由名：这些页面按整屏大屏语义给 <html> 加 display-embedded。 */
const DISPLAY_FAMILY_ROUTES = new Set(['dashboard', 'display', 'homeos'])
/** 渲染 3D 编辑器 / 绘制台的路由名：这些页面按 1020px 基准缩放并加 editor-viewport-fit。 */
const EDITOR_FAMILY_ROUTES = new Set(['studio', 'studio-editor', 'stage'])

// 首个路由成功渲染后置就绪标记：外壳的启动覆盖层（/static/boot-guard.js）据此收起，
// 从而把「后端冷启动窗口里 router.beforeEach 阻塞约 2 分钟」的纯空白页变成可见的等待态。
// 只在导航成功（无 failure）时置位 —— 被守卫中止的导航不算「已渲染」。
router.afterEach((to, _from, failure) => {
  if (failure) return
  document.documentElement.setAttribute('data-homeos-ready', '1')
  // 按路由同步「页面档位」body class：声明了 meta.bodyClass 的页面加上，其余页面移除。
  //
  // 3D 舞台（.interaction3d-stage）与导出嵌入态（.auto-diagram-embedded）都会给 body 加
  // class，而 spa-shell.css 里这两条规则会隐藏 `#app` 的**全部**子元素
  // （见 public/static/spa-shell.css）。SPA 下模块只加载一次、class 只加不删，离开该页后
  // class 仍残留 —— 再导航到普通页面就会整页不可见：全黑、且零报错。
  // 反向也成立：后端已把 `interaction3d-stage` 写进 stage 页的 HTML，若这里只做「移除」，
  // 首次导航后 class 就没了，舞台会退回带绘制工具的全量界面。
  const stageClass = 'interaction3d-stage'
  const isStageRoute = to.meta?.bodyClass === stageClass
  if (isStageRoute) document.body.classList.add(stageClass)
  else document.body.classList.remove(stageClass)
  // 与 body class 同步「本页是 3D 舞台」标记：boot-guard.js 据此把舞台的 interaction3d-stage
  // 视为页面档位（永不当作残留 class 移除），避免总览舞台退回带绘制工具的全量编辑器界面。
  if (isStageRoute) document.documentElement.setAttribute('data-homeos-stage', '1')
  else document.documentElement.removeAttribute('data-homeos-stage')
  // 导出嵌入态由 studio 模块在加载时按 `auto-diagram-embed=1` 自行加上，这里只负责回收。
  if (to.query?.['auto-diagram-embed'] !== '1') {
    document.body.classList.remove('auto-diagram-embedded')
  }
  // 回收只在整屏大屏 / 编辑器里成立的 html 档位与内联尺寸变量：SPA 导航离开后残留会污染
  // 普通页面（display-embedded 让 #display-shell 走嵌入布局；editor-viewport-fit 会把内容
  // 按 1020px 缩放）。display.ts / editor home.ts 只加不删，这里按路由名反向回收。
  if (!DISPLAY_FAMILY_ROUTES.has(String(to.name || ''))) {
    document.documentElement.classList.remove('display-embedded')
  }
  if (!EDITOR_FAMILY_ROUTES.has(String(to.name || ''))) {
    document.documentElement.classList.remove('editor-viewport-fit')
    document.documentElement.style.removeProperty('--editor-viewport-scale')
    document.documentElement.style.removeProperty('--editor-layout-height')
  }
})

// 注册跨层桥接处理器（将非 Vue 模块的回调桥接到 Pinia store）
// 401 未授权时触发认证 store 的登出处理
registerUnauthorizedHandler(() => useAuthStore().handleUnauthorized())
// 401 先尝试无感刷新会话
registerSessionRefreshHandler(async () => {
  const auth = useAuthStore()
  if (!auth.isAuthenticated) return false
  try {
    await auth.refreshSession()
    return auth.isAuthenticated
  } catch {
    return false
  }
})
// 跳转登录页（保留 redirect 以便登录后回到原页面）
registerNavigateToLoginHandler(() => {
  if (router.currentRoute.value.name !== 'login') {
    useChromeStore().notify('登录已过期，请重新登录', 'warning')
    const redirect = router.currentRoute.value.fullPath
    router.push({
      name: 'login',
      query: redirect && redirect !== '/login' ? { redirect } : undefined,
    })
  }
})
// 认证状态变化时重连 entities 实时通道
registerAuthChangeHandler(() => {
  void import('./stores/entities.store').then(({ useEntitiesStore }) => {
    useEntitiesStore().reconnectForAuthChange()
  })
  // 登出 / 401 时（isAuthenticated=false）额外清理用户态 store，避免下一个会话残留上一个用户的数据
  void import('./stores/auth.store').then(({ useAuthStore }) => {
    if (useAuthStore().isAuthenticated) return
    void import('./stores/layout.store').then(({ useLayoutStore }) => {
      useLayoutStore().resetForAuthChange()
    })
    void import('./stores/earthquake.store').then(({ useEarthquakeStore }) => {
      useEarthquakeStore().reset()
    })
  })
})
// 桥接通知消息到 Chrome store 的 notify
registerUiNotifyHandler((message, type, duration) => useChromeStore().notify(message, type, duration))

// 设置文档语言与文字方向，确保无障碍辅助技术正确朗读
if (typeof document !== 'undefined') {
  document.documentElement.lang = 'zh-Hans'
  document.documentElement.dir = 'ltr'
}

// 尽早应用主题 token（html[data-theme]），避免首屏闪色
applyHomeOsTheme()

// 加载前端配置完成后再挂载应用，保证 stores 初始化时能读取到正确配置
loadFrontendConfig().then(() => {
  // 建立配置可见性同步（控制台日志等仅在开发环境输出）
  setupFrontendConfigVisibilitySync()
  // 玻璃拟态效果同步（根据布局配置开/关毛玻璃）
  setupGlassEffectSync(() => useLayoutStore().layoutConfig)
  // 智能性能模式（根据设备能力动态调整渲染策略）
  setupSmartPerformanceMode(() => useLayoutStore().layoutConfig)
  app.mount('#app')
  // 挂载完成标记：与 data-homeos-ready（首个路由解析完成）区分开。
  // boot-guard.js 用它判断「#app 为空」是仍在正常启动（等配置加载）还是真的没渲染出来。
  document.documentElement.setAttribute('data-homeos-mounted', '1')
  // 挂载后启动 FPS 自适应监控，低帧率时自动降级
  import('@/utils/perf/adaptive-perf.util').then(({ startFpsAdaptiveMonitor }) => {
    startFpsAdaptiveMonitor()
  })
  // 空闲时段预加载大体积模态/高频控制弹窗，减少首次打开/首点设备的延迟
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => {
      import('@/components/modals/MediaPlayerModal.vue')
      import('@/components/modals/DoorbellAlertModal.vue')
      // 首点设备控制是墙屏核心交互，预取 popups 组 chunk，避免首点 150–600ms 现场加载
      import('@/components/entities/popups/LightControlPopup.vue')
      import('@/components/entities/popups/ClimateControlPopup.vue')
      import('@/components/entities/popups/CoverControlPopup.vue')
    })
  }
  // 生产环境注册 PWA 更新提示（用户确认式：确认后激活新 SW 并刷新）
  if (import.meta.env.PROD) {
    import('./utils/core/pwa-update').then(({ setupPwaUpdatePrompt }) => {
      setupPwaUpdatePrompt(async (applyUpdate) => {
        const ok = await useChromeStore().confirm(
          '检测到新版本已就绪。立即更新将刷新页面，未保存的编辑可能丢失。',
          '发现新版本',
          { confirmText: '立即更新', cancelText: '稍后', type: 'primary' },
        )
        if (ok) applyUpdate()
      })
    })
  }
})