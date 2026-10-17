<!--
  单页应用最顶层根组件，包裹 ErrorBoundary（全局异常边界）与 router-view（路由视图容器），
  通过顶层匹配路由 key 实现 MainLayout 在子路由切换时的复用，并为所有页面切换提供统一淡入淡出过渡动画。
  注意事项：App.vue 不包含任何业务布局，只负责错误兜底 + 路由切换过渡 + 顶层容器样式。
-->
<template>
  <!-- 应用根容器 -->
  <div class="app-container">
    <div class="homeos-theme-atmosphere" aria-hidden="true" />
    <!--
      整屏展示页开关灯背景图：独立整屏展示页（display / homeos）没有主布局壳，
      整屏即布局区域，故 fixed 铺满视口，3D 场景透明叠于其上。
      总览首页（dashboard）有主布局壳，背景层由 MainLayout 渲染在页面布局区域内
      （导航 + 户型图 + 侧边栏 + 底部信息栏），此处不重复挂载。其它管理页保持原样。
    -->
    <div
      v-if="isDisplayBackdropRoute"
      class="homeos-light-backdrop"
      :style="lightBackdropStyle"
      aria-hidden="true"
    />
    <!--
      授权门禁就地渲染：后端在返回 SPA 外壳时给 `<html>`
      标 `data-license-blocked="1"`，此时原样保留当前地址渲染授权恢复页；恢复后重载回到原地址。
    -->
    <LicenseRecoveryView v-if="licenseBlocked" />
    <!-- 路由视图，带淡入淡出过渡动画 -->
    <ErrorBoundary v-else :title="'页面加载失败'">
      <router-view v-slot="{ Component }">
        <!--
          不用 mode="out-in"：与 MainLayout 内 keep-alive、以及 DisplayView 命令式改 DOM
          叠在一起时，out-in 离开阶段容易触发 insertBefore(null)（设置页注释里已踩过）。
        -->
        <transition :name="routeTransitionName" @after-leave="flushDeferredPageAssets">
          <!-- 顶层 matched 作 key：/devices ↔ /scenes 等子路由切换不重建 MainLayout -->
          <div :key="shellRouteKey" class="route-transition-root">
            <component :is="Component" v-if="Component" />
          </div>
        </transition>
      </router-view>
    </ErrorBoundary>
    <!--
      全局 chrome 原语：确认 / 输入 / 媒体全屏挂在 App 根（组件内 Teleport 到
      #teleport-target，无壳时回退 body）。Toast 在主壳里由 ScaledViewport 承载，
      其它路由用本层 fixed 宿主。
    -->
    <VConfirmModal />
    <VPromptModal />
    <MediaPlayerModal
      :key="chrome.activeMediaEntityId || 'media'"
      :is-open="chrome.isMediaPlayerOpen"
      :entity-id="chrome.activeMediaEntityId"
      @close="chrome.closeMediaPlayer()"
    />
    <div v-if="isAppChromeToastHost" class="app-chrome-toast-host" aria-live="off">
      <VNotification />
    </div>
  </div>
</template>

<script setup>
/** HomeOS 应用根组件 */
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useAppTheme } from '@/composables/ui/useAppTheme'
import { logger } from '@/shared/utils/core/logger'
import { useClientPowerReporter } from '@/composables/energy/useClientPowerReporter'
import { useDisplayLightBackdropState } from '@/composables/display/display-light-backdrop'
import ErrorBoundary from '@/components/common/ErrorBoundary.vue'
import VConfirmModal from '@/components/common/base/VConfirmModal.vue'
import VPromptModal from '@/components/common/base/VPromptModal.vue'
import VNotification from '@/components/common/base/VNotification.vue'
import { useChromeStore } from '@/stores/chrome.store'
import { applyPageAssets, listManagedStylesheets, PAGE_ASSETS } from '@/studio'

const LicenseRecoveryView = defineAsyncComponent(() => import('@/views/auth/LicenseRecoveryView.vue'))
const MediaPlayerModal = defineAsyncComponent(() =>
  import('@/layouts/shell-overlays').then((m) => m.MediaPlayerModal),
)

// 初始化应用主题（监听并应用用户偏好的亮/暗主题）
useAppTheme()
// 启动客户端能耗数据上报器（用于在服务端汇总展示各终端功耗）
useClientPowerReporter()
const authStore = useAuthStore()
const layoutStore = useLayoutStore()
const chrome = useChromeStore()
const route = useRoute()
const router = useRouter()

/**
 * 独立整屏展示页路由名集合：只有这些页面（无主布局壳）把开关灯背景图铺满整个视口。
 *
 * `dashboard`（总览首页）不在此列：它挂在 MainLayout 里，背景层由 MainLayout 渲染在
 * 「导航 + 户型图 + 侧边栏 + 底部信息栏」这一页面布局区域内，并随缩放壳层一起缩放。
 * 若把 `dashboard` 加回来，会退回「position: fixed 铺满整个浏览器页面」的旧行为，
 * 在缩放留白处把背景图溢出到布局区域之外。
 */
const DISPLAY_BACKDROP_ROUTES = new Set(['display', 'homeos'])
const isDisplayBackdropRoute = computed(() => DISPLAY_BACKDROP_ROUTES.has(String(route.name ?? '')))
// 独立整屏展示页的整页背景图状态（灯亮 → light_on，全关 → light_off）
const displayLightBackdrop = useDisplayLightBackdropState()
const lightBackdropStyle = computed(() =>
  isDisplayBackdropRoute.value
    ? { backgroundImage: `url('${displayLightBackdrop.value.url}')` }
    : {},
)

/**
 * 切换 <html data-display-backdrop>：供全局样式把展示页的外壳/视口底层背景改为透明，
 * 让固定背景层透出；离开展示页时移除，恢复管理页原有的不透明底。
 */
watch(
  isDisplayBackdropRoute,
  (active) => {
    if (typeof document === 'undefined') return
    if (active) document.documentElement.dataset.displayBackdrop = '1'
    else delete document.documentElement.dataset.displayBackdrop
  },
  { immediate: true },
)

/**
 * 仅顶层路由变化时重建壳（MainLayout / Login 等），子路由切换不 remount 整页。
 *
 * 取 matched[0].path 作为 key：
 * - /devices ↔ /scenes 等同属 MainLayout 的子路由切换时 key 不变，避免整页重建
 * - /login ↔ /dashboard 等顶层路由切换时 key 变化，触发壳重建
 */
const shellRouteKey = computed(() => route.matched[0]?.path ?? route.path)

/**
 * 创作面（仪表编辑器 / 户型图绘制）各有一套互斥的 static 全局 CSS。
 * 旧行为是 `location.assign` 整页换装；SPA 滑动会让两页并存 + 两套 CSS 叠层，
 * 背景里会出现无样式文字或样式串味。凡进出创作面都切成瞬时换页（route-cut）。
 */
const STUDIO_CREATOR_ROUTES = new Set(['studio', 'studio-editor'])
/** `route-fade`：普通壳切换滑动；`route-cut`：创作面相关瞬时切换。
    路由族刻意不叫 `fade`：那个名字归组件级淡入淡出（modal-theme.css），
    同名会让整屏换页的「绝对定位 + 横向位移」泄漏到组件内的淡入淡出元素上。 */
const routeTransitionName = ref('route-fade')

const removeRouteTransitionGuard = router.beforeEach((to, from) => {
  const toName = String(to.name ?? '')
  const fromName = String(from.name ?? '')
  const involvesCreator =
    STUDIO_CREATOR_ROUTES.has(toName) || STUDIO_CREATOR_ROUTES.has(fromName)
  routeTransitionName.value = involvesCreator ? 'route-cut' : 'route-fade'
})
onBeforeUnmount(removeRouteTransitionGuard)

/**
 * 主壳（MainLayout）路由：matched 至少两层（壳 + 子页）。
 * 其它顶层路由（编辑器 / 户型图 / 整屏展示 / 入户页）不在缩放壳内，需要 App 层 toast 宿主。
 */
const isAppChromeToastHost = computed(() => route.matched.length <= 1)

// ── 3D Studio 页面资产调度 ──
// 后端在返回 SPA 外壳时给 <html> 标 data-license-blocked="1"：此时就地渲染授权恢复页。
const licenseBlocked = ref(
  typeof document !== 'undefined' && document.documentElement.dataset.licenseBlocked === '1',
)

/**
 * 按路由同步 <head> 资产（标题 / viewport / theme-color / manifest / 样式表）。
 *
 * 这不是旧的「整页跳转换装」：样式表按路由声明安装/卸载，离开 studio 路由时
 * ``PAGE_ASSETS.shell``（空样式表）会把 display.css / renderer.css 等清掉，避免残留。
 * 必须监听 route.name 而不是 fullPath：SPA 首次导航前 route 是 START_LOCATION
 * （fullPath 恰好也是 "/"），当目标路由就是 "/" 时 fullPath 不变、immediate watcher
 * 不会再触发，页面资产就永远不会挂上。
 *
 * `fade` 壳切换会短暂双页并存：先保留旧表 + 装新表，after-leave 再严格收敛。
 * `route-cut`（创作面）离开页立刻隐藏，必须马上严格换装，不能两套全局 CSS 叠在一起。
 */
let previousShellRouteKey = shellRouteKey.value
/** 是否已经有一次**真正的路由**定过档。START_LOCATION（matched 为空）不算，见下面的 watcher。 */
let routeAssetsResolved = false
/** 是否有一次「等 leave 结束再卸旧 CSS」的挂起收敛。 */
let pageAssetsFlushPending = false

function resolveRoutePageAssets() {
  if (licenseBlocked.value) return PAGE_ASSETS.licenseRecovery
  return route.meta.assets ?? PAGE_ASSETS.shell
}

function flushDeferredPageAssets() {
  if (!pageAssetsFlushPending) return
  pageAssetsFlushPending = false
  applyPageAssets(resolveRoutePageAssets())
}

watch(
  () => route.name,
  () => {
    /**
     * 首个路由还没落地（START_LOCATION：matched 为空、meta 为空）时**一律不动样式表**。
     *
     * 入户页是 `mountApp()` 先挂载、`router.isReady()` 后完成（见 main.ts 的 isEntryAuthRoute），
     * 所以这个 watcher 的 immediate 首跑发生在路由解析之前：`route.meta.assets` 为空 →
     * `resolveRoutePageAssets()` 落到 `PAGE_ASSETS.shell`（stylesheets 为空）→ 把
     * index.html 预装的认证场景四片 + appearance.css **整批摘掉**。
     *
     * 实测代价：摘除后约 55ms 内 `document.styleSheets` 6→25、`--hos-tone-rgb` 从
     * `255, 196, 106` 变成 EMPTY（场景整片掉色），随后这 5 张表被重新创建、重新下载
     * （`link.sheet` 回到 pending）再挂回 —— 就是用户看到的「反复闪 / 发黑」。
     * 等真正的路由落地再定档；这一次「什么都不做」正是入户页冷开不闪的前提。
     */
    if (route.matched.length === 0) return

    const nextAssets = resolveRoutePageAssets()
    const nextShellKey = shellRouteKey.value
    // 首次真正定档不算「壳切换」：目标清单与预装清单一致时应当原样留用（applyStylesheets
    // 已在位就一条 DOM 变更都不产生），不一致时必须**严格**换装 —— 首次渲染没有 leave 事件，
    // 靠 after-leave 收敛的旧表会永远留在 <head> 里。
    const shellKeyChanged = routeAssetsResolved && nextShellKey !== previousShellRouteKey
    previousShellRouteKey = nextShellKey
    routeAssetsResolved = true

    const deferStyles =
      shellKeyChanged && routeTransitionName.value === 'route-fade'

    if (deferStyles) {
      applyPageAssets(nextAssets, { keepStylesheets: listManagedStylesheets() })
      pageAssetsFlushPending = true
      return
    }

    pageAssetsFlushPending = false
    applyPageAssets(nextAssets)
  },
  { immediate: true },
)

async function disconnectEntities() {
  const { useEntitiesStore } = await import('@/stores/entities.store')
  useEntitiesStore().disconnect()
}

/**
 * 监听认证 / 授权 / 路由变化，联动管理 Socket.IO 连接与 UI 配置加载。
 *
 * 行为：
 * - 登录且授权放行（非 login/activation）：解析 profile、按需连接 entities、按需加载 UI 配置
 * - 登出、未授权、或进入 activation：断开 entities 的 Socket.IO 连接
 * - login：已登录时不主动断连（避免登录瞬间 connect→disconnect 打断 polling→websocket 升级）
 * - immediate: true 保证在组件挂载后立即执行一次，恢复已登录会话的连接
 */
watch(
  () => [authStore.isAuthenticated, route.name],
  async (curr, prev) => {
    const isAuth = curr?.[0]
    const wasAuth = prev?.[0]
    const onLogin = route.name === 'login'
    const onActivation = route.name === 'activation'

    if (isAuth) {
      if (onActivation) {
        // 已登录但未授权 / 激活页：必须断开，避免未激活读通道残留
        await disconnectEntities()
        return
      }
      if (onLogin) {
        // 登录成功后仍短暂停留在 login：交给 auth 侧重连，离开页面后再由下方分支接管
        return
      }
      // watch 回调是 fire-and-forget：这里任何一处 rejection 都不会有调用方接住，
      // 会变成 unhandledrejection 被 client-log 当作前端异常上报。统一兜底为 warn，
      // 真正的错误提示仍由 api-client / toast 负责。
      try {
        const queryProfile = typeof route.query.profile === 'string' ? route.query.profile : undefined
        await layoutStore.ensureActiveProfileResolved(queryProfile)
        const { useEntitiesStore } = await import('@/stores/entities.store')
        const entitiesStore = useEntitiesStore()
        // ensure：已在握手/升级中则不拆掉现有 socket（避免二次 connect 打断 websocket）
        entitiesStore.ensureWsConnected()
        if (!layoutStore.isConfigLoaded && !layoutStore.isConfigLoading) {
          await layoutStore.loadConfig()
        }
      } catch (err) {
        logger.warn('登录后连接实时通道 / 加载 UI 配置失败', err)
      }
    } else if (wasAuth) {
      await disconnectEntities()
    }
  },
  { immediate: true },
)
</script>

<style src="./assets/styles/route-transitions.css"></style>

<style scoped>
/* 非主壳路由的 toast 宿主：VNotification 默认 position:absolute，这里改成 fixed 铺满视口。 */
.app-chrome-toast-host {
  position: fixed;
  inset: 0;
  z-index: var(--z-notification, 10000);
  pointer-events: none;
}
.app-chrome-toast-host :deep(.notification-container) {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
}
</style>
