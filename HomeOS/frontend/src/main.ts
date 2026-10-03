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

// ======== 触屏/wheel 事件 passive 优化说明 ========
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

// ======== 注册跨层桥接处理器（将非 Vue 模块的回调桥接到 Pinia store） ========
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
// 跳转登录页（保留 redirect 以便竖屏 /m 恢复）
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
  import('./stores/entities.store').then(({ useEntitiesStore }) => {
    useEntitiesStore().reconnectForAuthChange()
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
      import('@/components/entities/popups/SwitchControlPopup.vue')
      import('@/components/entities/popups/ClimateControlPopup.vue')
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