<!--
  组件文件：MainLayout.vue
  所属模块：frontend/src/layouts
  组件职责：横屏大屏主布局外壳。顶部 Tab 导航栏（品牌 Logo、连接状态点、家庭模式切换 HomeModeSwitcher、
    导航 Tab、门铃/管家/通知按钮），中部 router-view + keep-alive(max=8) 缓存页面视图，
    全屏装配全局浮层：门铃 DoorbellAlertModal、地震预警
    EarthquakeAlertOverlay/SetupWizard、设置锁 SettingsLockModal、Entity 控制 EntityControlHost、
    （媒体全屏 MediaPlayerModal 挂在 App.vue 根，供画布 more-info / 展示页共用）
    屏保 Screensaver、引导 GuidedTourOverlay、智能管家 AgentChatPalette、
    通知抽屉 NotificationDrawer，以及 HA 实时降级横幅 HaStatusDegradeBanner +
    SetupChecklistBanner + ColdEntityPerfBanner，另有天气动态背景 WeatherBackground
    按性能自适应档位（full/lite/static/off）渲染。
  依赖关系：composables：useMainLayoutChrome（壳层状态/行为核心）、useEntityWsSubscriptionSync（HA 实体 WS 订阅）、
    useEarthquakeBootstrap（地震引导向导）、useTeleportTargetGuard/useShellTeleportTarget（浮层传送目标）、
    useNotificationCenter（注入通知中心上下文）；stores：auth/layout/chrome/entities；
    utils：adaptive-perf（性能自适应 class 派生）、weather 质量与展示决策、glass-effect 毛玻璃开关、
    popup-position-dropdown/derived-route 派生路由同步、config 读取前端配置。
  注意事项：壳层浮层（MediaPlayer/Doorbell/Earthquake 等 8 项）统一懒加载 shell-overlays 合并 chunk，
    减少首屏请求；横屏 ≥1280px 桌面断点启用；地震/设置锁/儿童模式优先级高于普通浮层。
-->
<script setup>
/**
 * HomeOS 主布局（横屏大屏外壳）- 内部实现说明
 *
 * 职责：
 * 1. 渲染顶部 Tab 导航栏（含品牌 Logo、连接状态点、模式切换、导航 Tab、操作区按钮）
 * 2. 渲染主内容区（router-view + keep-alive 缓存，max=8）
 * 3. 装配全局浮层（媒体播放器、门铃、地震预警、设置锁、Entity 控制、屏保、引导、智能管家、通知抽屉）
 * 4. 装配 HA 实时状态降级横幅、儿童模式顶栏、Setup 引导横幅、冷启动性能横幅
 * 5. 装配天气动态背景（按性能模式/实体数量/帧率档位决定 full/lite/static/off）
 * 6. 装配性能自适应 class、玻璃拟态开关、派生路由同步、地震引导向导
 *
 * 关键依赖：
 * - composables/ui/useMainLayoutChrome：壳层状态/行为（导航、连接、访客模式、门铃、设置锁等）
 * - layouts/ScaledViewport：缩放视口容器（按基准宽度缩放或流体布局）
 * - layouts/shell-overlays：壳层浮层合并 chunk（按需懒加载，减少首屏请求数）
 * - stores：auth / layout / chrome / entities
 * - composables：useNotificationCenter、useTeleportTargetGuard、useEntityWsSubscriptionSync、useEarthquakeBootstrap、useShellTeleportTarget
 * - utils/perf/adaptive-perf.util：性能自适应档位
 * - utils/weather/*：天气背景显示决策与质量解析
 *
 * 详细的壳层逻辑（菜单项计算、访客模式、门铃触发、设置锁等）封装在 useMainLayoutChrome 中。
 */
import {
  computed,
  defineAsyncComponent,
  watch,
  onMounted,
  onUnmounted,
  ref,
  provide,
  nextTick,
} from 'vue'
import { Archive, Bell, LayoutDashboard, ChevronDown, MessageCircle } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.store'
import BackupRestoreDialog from '@/components/backup/BackupRestoreDialog.vue'
import { useNotificationCenter } from '@/composables/widget/useNotificationCenter'
import { NOTIFICATION_CENTER_KEY } from '@/composables/widget/notification-center.context'
import { useTeleportTargetGuard } from '@/composables/ui/useTeleportTargetGuard'
import EntityControlHost from '@/components/entities/EntityControlHost.vue'
import ScaledViewport from '@/layouts/ScaledViewport.vue'
import EarthquakeAlertOverlay from '@/components/earthquake/AlertOverlay.vue'
import CencBulletinCard from '@/components/earthquake/CencBulletinCard.vue'
import AgentChatPalette from '@/components/widgets/agent/AgentChatPalette.vue'
/** 壳层浮层合并为同一动态 chunk，避免 8+ 次独立小请求（媒体全屏已挂 App 根） */
const loadShellOverlays = () => import('@/layouts/shell-overlays')
const DoorbellAlertModal = defineAsyncComponent(() =>
  loadShellOverlays().then((m) => m.DoorbellAlertModal),
)
const EarthquakeSetupWizard = defineAsyncComponent(() =>
  loadShellOverlays().then((m) => m.EarthquakeSetupWizard),
)
const SetupChecklistBanner = defineAsyncComponent(() =>
  loadShellOverlays().then((m) => m.SetupChecklistBanner),
)
const ColdEntityPerfBanner = defineAsyncComponent(() =>
  loadShellOverlays().then((m) => m.ColdEntityPerfBanner),
)
const SettingsLockModal = defineAsyncComponent(() =>
  loadShellOverlays().then((m) => m.SettingsLockModal),
)
import HomeModeSwitcher from '@/components/common/HomeModeSwitcher.vue'
import HaStatusDegradeBanner from '@/components/common/HaStatusDegradeBanner.vue'
const NotificationDrawer = defineAsyncComponent(() =>
  loadShellOverlays().then((m) => m.NotificationDrawer),
)
import { useMainLayoutChrome } from '@/composables/ui/useMainLayoutChrome'
import { useEntityWsSubscriptionSync } from '@/composables/entity/useEntityWsSubscriptionSync'
import { useEarthquakeBootstrap } from '@/composables/earthquake/useEarthquakeBootstrap'
import { useDisplayLightBackdropState } from '@/composables/display/display-light-backdrop'
import { setDerivedRoutePath } from '@/utils/entity/derived-route.util'
import { resolvePerfShellClass, useAdaptivePerfState } from '@/utils/perf/adaptive-perf.util'
import { applyGlassEffectDocument } from '@/utils/ui/glass-effect.util'
import { isNavTabRouteActive } from '@/utils/layout/nav-tabs.util'
import {
  buildDropdownFixedStyle,
  rectToDropdownPosition,
  viewportPointToPopupAnchor,
  measureDropdownFitWidth,
} from '@/utils/ui/popup-position-dropdown.util'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
import { useEscLayer } from '@/composables/ui/useEscStack'
import { isLicenseFeatureGranted } from '@/router/license-gate'
import { getTeleportContainerSize } from '@/utils/ui/popup-position-shared.util'
import Screensaver from '@/components/common/Screensaver.vue'
const WeatherBackground = defineAsyncComponent(() => import('@/layouts/WeatherBackground.vue'))
// 仪表盘外壳（并入 homeos-3d 后由 MainLayout 承载）：浮动组件 / 右侧栏 / 页脚。
const FloatingHub = defineAsyncComponent(() => import('@/components/shell/FloatingHub.vue'))
const RightSidebar = defineAsyncComponent(() => import('@/components/dashboard/RightSidebar.vue'))
const DashboardFooter = defineAsyncComponent(() => import('@/components/dashboard/Footer.vue'))
// 设备分组批量弹窗（原 DashboardView 承载）：右栏 quickActions 点击设备组时打开，
// 状态源在 chrome store（isGroupModalOpen / groupModalDomain / groupModalSensors）。
// 与其它壳层浮层合并进 shell-overlays chunk，避免额外小请求。
const DeviceGroupModal = defineAsyncComponent(() =>
  loadShellOverlays().then((m) => m.DeviceGroupModal),
)
import { resolveWeatherQuality } from '@/utils/weather/quality.util'
import { shouldShowWeatherBackground } from '@/utils/weather/display-routes.util'
import { getConfigSection, configEpoch } from '@/utils/config/frontend-config'

const {
  route,
  entitiesStore,
  layoutStore,
  chrome,
  navFrameStyle,
  siteTitle,
  brandLogoUrl,
  handleTripleClick,
  isGuestMode,
  menuItems,
  dropdownMenuItems,
  navMoreOpen,
  navMoreActive,
  showWholeHomeOff,
  haControlBlocked,
  onWholeHomeOff,
  showSettingsTab,
  isSettingsLocked,
  onSettingsClick,
  toggleFullscreen,
  statusRail,
  doorbellCameraId,
  doorbellTriggerEntityId,
  doorbellLockEntityId,
  doorbellLabel,
  isSettingsLockOpen,
  onUnlockSuccess,
  Settings,
  Maximize2,
  Loader2,
  PowerOff,
} = useMainLayoutChrome()

const authStore = useAuthStore()
const showBackupChrome = computed(
  () => authStore.isAuthenticated && authStore.role === 'admin',
)
const backupDialogRef = ref(null)
function openBackupSettings() {
  backupDialogRef.value?.open?.()
}
// 三类全屏/抽屉浮层互斥开关：同一时刻只能打开一个，打开新面板时主动关闭其余两个
const showNotificationDrawer = ref(false)
const notificationCenterState = useNotificationCenter()
// 注入通知中心上下文，供 NotificationDrawer 与下游组件通过 inject 消费
provide(NOTIFICATION_CENTER_KEY, notificationCenterState)

/** 壳层入口：未授权模块收起入口（后端仍是权威 403）。明细未加载时 fail-closed，避免闪现。 */
const showAgentChrome = computed(
  () =>
    authStore.isAuthenticated &&
    !isGuestMode.value &&
    authStore.role !== 'child' &&
    isLicenseFeatureGranted('module.agent'),
)
const showHomeModeChrome = computed(() => isLicenseFeatureGranted('module.home_mode'))
const showNotificationChrome = computed(
  () => authStore.isAuthenticated && isLicenseFeatureGranted('module.notifications'),
)

// 智能管家弹层开关提升到 chrome store：与仪表板入口共享同一状态源（首页卡片 / 悬浮按钮 / 顶栏按钮互通）
const showAgentChat = computed({
  get: () => chrome.isAgentChatOpen,
  set: (v) => (v ? chrome.openAgentChat() : chrome.closeAgentChat()),
})

const notificationUnread = computed(() => notificationCenterState?.unreadCount?.value ?? 0)

// 授权收回时关掉已打开的壳层浮层，避免无入口却仍挂着面板。
watch(showAgentChrome, (ok) => {
  if (!ok) showAgentChat.value = false
})
watch(showNotificationChrome, (ok) => {
  if (!ok) closeNotificationDrawer()
})

/** 打开通知抽屉：关闭智能管家，确保浮层互斥 */
function openNotificationDrawer() {
  showAgentChat.value = false
  showNotificationDrawer.value = true
}

/** 关闭通知抽屉 */
function closeNotificationDrawer() {
  showNotificationDrawer.value = false
}

/** 切换智能管家面板：关闭通知，确保浮层互斥 */
function toggleAgentChat() {
  showNotificationDrawer.value = false
  showAgentChat.value = !showAgentChat.value
}

/**
 * 主布局自身浮层（智能管家面板 / 通知抽屉 / “更多”菜单）是否有任一层在场上。
 * 任一在场上时主布局才参与 Esc 层级栈，否则不占层。
 */
const mainLayoutEscLayerOpen = computed(
  () => showAgentChat.value || showNotificationDrawer.value || navMoreOpen.value,
)

/**
 * 主布局浮层的 Esc 处理：只关自己这三层里最上面那一个。
 *
 * 这三层由主布局统一持有状态（子组件只 emit），所以合并成一层入栈；
 * 主布局 setup 早于子组件，压栈位置天然在更晚打开的浮层之下，优先级正确。
 */
function onEscLayer() {
  if (showAgentChat.value) {
    showAgentChat.value = false
    return
  }
  if (showNotificationDrawer.value) {
    closeNotificationDrawer()
    return
  }
  navMoreOpen.value = false
}

useEscLayer(mainLayoutEscLayerOpen, '主布局导航浮层', onEscLayer)

const navMoreAnchorRef = ref(null)
const navMoreMenuRef = ref(null)
// “更多”菜单的定位样式：未打开时隐藏（visibility:hidden），避免空白占用导致布局抖动
const navMoreMenuStyle = ref({ visibility: 'hidden' })
const { teleportTarget: navMoreTeleportTo, shellTeleportPending, refreshShellTeleport } =
  useShellTeleportTarget()
// “更多”下拉菜单的宽度上下限：项目估算高度 44px/行 + 16px padding
const NAV_MORE_MIN_WIDTH = 120
const NAV_MORE_MAX_WIDTH = 280

/**
 * 重新计算“更多”下拉菜单的固定定位。
 *
 * 流程：读取锚点 rect → 估算高度 → 测量容器宽度 → 测量菜单内容适配宽度 →
 *      转换为 fixed 坐标（兼容 transform/scale 缩放）→ 边界对齐到视口内。
 *
 * @remarks 由于 app-shell 在 ScaledViewport 中可能被 transform 缩放，必须用
 * viewportPointToPopupAnchor 把视口坐标转换为 Teleport 容器坐标，否则会出现偏移。
 */
function updateNavMorePosition() {
  const anchor = navMoreAnchorRef.value
  if (!navMoreOpen.value || !anchor) {
    navMoreMenuStyle.value = { visibility: 'hidden' }
    return
  }
  const rect = anchor.getBoundingClientRect()
  const estimatedHeight = dropdownMenuItems.value.length * 44 + 16
  const { cw } = getTeleportContainerSize()
  const maxW = Math.min(NAV_MORE_MAX_WIDTH, Math.max(NAV_MORE_MIN_WIDTH, cw - 16))
  const menuWidth = measureDropdownFitWidth(navMoreMenuRef.value, {
    minWidth: NAV_MORE_MIN_WIDTH,
    maxWidth: maxW,
  })
  const pos = rectToDropdownPosition(rect, 8, menuWidth, {
    estimatedHeight,
    margin: 8,
  })
  const { anchorX: anchorRight } = viewportPointToPopupAnchor(rect.right, rect.top)
  let left = Math.max(8, anchorRight - menuWidth)
  if (left + menuWidth > cw - 8) left = Math.max(8, cw - 8 - menuWidth)
  const baseStyle = buildDropdownFixedStyle({ ...pos, left, width: menuWidth })
  navMoreMenuStyle.value = {
    ...baseStyle,
    left: `${left}px`,
    width: `${menuWidth}px`,
  }
}

/**
 * 排队重算“更多”菜单位置：Teleport 容器刷新 + 同步/下一帧/RAF 三次重算。
 *
 * @remarks 多次重算是因为 Teleport 目标挂载、菜单 DOM 渲染、字体测量都存在延迟；
 * 下一帧 + RAF 双保险确保菜单最终位置准确，避免首次打开时闪位。
 */
function scheduleNavMorePosition() {
  refreshShellTeleport()
  updateNavMorePosition()
  nextTick(() => {
    updateNavMorePosition()
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(updateNavMorePosition)
    }
  })
}

/** 视口变化（resize/scroll/visualViewport）回调：仅在菜单打开时重算位置 */
function onNavMoreViewportChange() {
  if (navMoreOpen.value) scheduleNavMorePosition()
}

watch(navMoreOpen, (open) => {
  if (open) scheduleNavMorePosition()
})

watch(dropdownMenuItems, () => {
  if (navMoreOpen.value) scheduleNavMorePosition()
})

// 注册视口/滚动变化监听（用于重算“更多”菜单位置）
// 注：resize/scroll 使用 passive:true，因为这里不需要 preventDefault
// Esc 不在这里注册：已改走全局 Esc 层级栈（useEscLayer），避免与其它浮层抢同一次按键
onMounted(() => {
  window.addEventListener('resize', onNavMoreViewportChange, { passive: true })
  window.addEventListener('scroll', onNavMoreViewportChange, { passive: true, capture: true })
  window.visualViewport?.addEventListener('resize', onNavMoreViewportChange)
  window.visualViewport?.addEventListener('scroll', onNavMoreViewportChange)
})
// 卸载时同步移除监听，参数需与 add 完全一致（含 capture）
onUnmounted(() => {
  window.removeEventListener('resize', onNavMoreViewportChange)
  window.removeEventListener('scroll', onNavMoreViewportChange, { capture: true })
  window.visualViewport?.removeEventListener('resize', onNavMoreViewportChange)
  window.visualViewport?.removeEventListener('scroll', onNavMoreViewportChange)
})

// 路由切换时清理所有全屏浮层与残留遮罩
watch(
  () => route.path,
  () => {
    closeNotificationDrawer()
    showAgentChat.value = false
  },
)

// 校验 teleport-target 容器是否被外部代码误清空，必要时重建（防御性 HA 集成处理）
useTeleportTargetGuard()

// 性能自适应：根据 layoutConfig.performanceMode 解析需要附加到 app-shell 的 class
// （如降级到静态背景、关闭粒子、降低 backdrop-filter 等）
const perfShellClass = computed(() => resolvePerfShellClass(layoutStore.layoutConfig.performanceMode))

const { adaptiveTier } = useAdaptivePerfState()
// 天气背景质量综合决策：性能模式 + 实体数量 + 实测帧率档位
const weatherQuality = computed(() =>
  resolveWeatherQuality({
    performanceMode: layoutStore.layoutConfig.performanceMode,
    entityCount: entitiesStore.totalCount,
    fpsTier: adaptiveTier.value,
  }),
)

// 是否显示天气背景：全局开关 + 当前路由允许显示 + 质量档位非 off
const showWeatherBackground = computed(() => {
  // 读取 configEpoch 以建立对前端配置变更的响应式依赖（配置热更后自动重算）
  void configEpoch.value
  const we = getConfigSection('weatherEffects')
  const enabled = we?.enabled !== false
  return (
    enabled &&
    shouldShowWeatherBackground(route.path, we?.displayRoutes, route.query) &&
    weatherQuality.value !== 'off'
  )
})

// static 档位下用纯 CSS 渐变替代 Canvas，传给 ScaledViewport 切换层级顺序（避免遮挡 UI）
const weatherFxStatic = computed(() => weatherQuality.value === 'static')

/**
 * 开关灯背景图（复刻原 homeos `DashboardView` 的 `absolute inset-0` 背景层）：
 * 只在总览首页（`dashboard`）启用。
 *
 * 关键：本层渲染在 `.app-shell__content` 内（`position: absolute`），因此覆盖范围恰好是
 * **页面布局区域** —— 导航（tab-bar）+ 户型图（main-content）+ 侧边栏（shell-right-sidebar）
 * + 底部信息栏（shell-footer），并随缩放壳层等比缩放。
 *
 * 不能用 `position: fixed`：那会铺满整个浏览器页面，在缩放留白处溢出到布局区域之外。
 * 独立整屏大屏（`display` / `homeos`，无 `.app-shell`）仍由 App.vue 的固定层负责。
 */
const showLightBackdrop = computed(() => route.name === 'dashboard')
const lightBackdrop = useDisplayLightBackdropState()
const lightBackdropStyle = computed(() =>
  showLightBackdrop.value ? { backgroundImage: `url('${lightBackdrop.value.url}')` } : {},
)

// 实体 WebSocket 订阅同步：根据当前可见实体范围订阅 HA 实体状态推送
useEntityWsSubscriptionSync()
// 地震功能引导向导：首次使用或缺少地震传感器时弹出引导
const { showSetupWizard } = useEarthquakeBootstrap()
// 将当前路由同步给派生路由工具，供实体详情等派生页面回退使用
watch(
  () => route.path,
  (path) => setDerivedRoutePath(path),
  { immediate: true },
)
// 玻璃拟态开关随配置变化：性能模式降级时强制关闭毛玻璃，避免低端设备掉帧
watch(
  () => [layoutStore.layoutConfig.glassEffect, layoutStore.layoutConfig.performanceMode],
  () =>
    applyGlassEffectDocument(
      layoutStore.layoutConfig.glassEffect,
      layoutStore.layoutConfig.performanceMode,
    ),
  { immediate: true },
)
</script>

<template>
  <div>
    <!-- 无障碍跳转链接：键盘用户跳过顶栏直达主内容 -->
    <a href="#main-content" class="skip-link">{{ '跳到主内容' }}</a>
    <ScaledViewport
      :frame-style="navFrameStyle"
      :shell-class="[perfShellClass, { 'app-shell--light-backdrop': showLightBackdrop }]"
      :weather-fx-static="weatherFxStatic"
    >
      <!--
        开关灯背景图层（原 homeos DashboardView 效果）：定位基准是 `.app-shell__content`，
        即「导航 + 户型图 + 侧边栏 + 底部信息栏」这一页面布局区域；3D 场景与各区域叠于其上。
        必须是 ScaledViewport 默认插槽的第一个子节点，才能随缩放壳层一起等比缩放。
      -->
      <div
        v-if="showLightBackdrop"
        class="homeos-light-backdrop homeos-light-backdrop--layout"
        :style="lightBackdropStyle"
        aria-hidden="true"
      />
      <!-- 天气动态背景插槽：根据质量档位渲染 Canvas 或 CSS 静态渐变 -->
      <template #weather-fx>
        <WeatherBackground v-show="showWeatherBackground" :quality="weatherQuality" />
      </template>
      <!-- 顶栏：品牌 + 模式切换 + 导航 Tab + 操作按钮；handleTripleClick 用于三连击触发隐藏功能 -->
      <header class="tab-bar" role="banner" :style="navFrameStyle" @click="handleTripleClick">
        <div class="tab-bar__brand">
          <div class="logo-wrapper">
            <img :src="brandLogoUrl" class="logo-img" :alt="'标志'" />
          </div>
          <div class="tab-bar__brand-text">
            <span class="tab-bar__title">{{ siteTitle }}</span>
            <span v-if="isGuestMode" class="guest-readonly-badge">{{ '访客只读' }}</span>
          </div>
        </div>
        <HomeModeSwitcher v-if="showHomeModeChrome" class="tab-bar__mode-switcher" />
        <div class="tab-bar__nav-wrap" :class="{ 'tab-bar__nav-wrap--menu-open': navMoreOpen }">
          <nav class="tab-bar__tabs" role="navigation" :aria-label="'主导航'">
            <router-link
              v-for="item in menuItems"
              :key="item.id"
              :to="item.path"
              custom
              v-slot="{ navigate, href }"
            >
              <a
                :href="href"
                class="tab-bar__tab"
                :class="{ 'tab-bar__tab--active': isNavTabRouteActive(item.path, route.path) }"
                :style="{
                  '--tab-accent': item.accent,
                  '--tab-icon-accent': item.accent,
                }"
                :aria-label="item.label"
                :aria-current="isNavTabRouteActive(item.path, route.path) ? 'page' : undefined"
                :title="item.label"
                @click="navigate"
              >
                <span class="tab-bar__tab-icon">
                  <img
                    v-if="item.type === 'svg'"
                    :src="item.icon"
                    class="tab-bar__tab-svg"
                    alt=""
                  />
                  <component v-else :is="item.icon" class="tab-bar__tab-svg" />
                </span>
                <span class="tab-bar__tab-label">{{ item.label }}</span>
              </a>
            </router-link>
            <div
              v-if="dropdownMenuItems.length"
              ref="navMoreAnchorRef"
              class="tab-bar__more-wrap"
              :class="{ 'tab-bar__more-wrap--open': navMoreOpen }"
            >
              <button
                type="button"
                class="tab-bar__tab tab-bar__tab--more"
                :class="{ 'tab-bar__tab--active': navMoreActive || navMoreOpen }"
                :style="{ '--tab-accent': '#94a3b8', '--tab-icon-accent': '#94a3b8' }"
                :aria-label="'更多导航'"
                :aria-expanded="navMoreOpen"
                aria-haspopup="menu"
                @click.stop="navMoreOpen = !navMoreOpen"
              >
                <span class="tab-bar__tab-icon">
                  <LayoutDashboard class="tab-bar__tab-svg" />
                </span>
                <span class="tab-bar__tab-label">{{ '更多' }}</span>
                <ChevronDown class="tab-bar__more-chevron" aria-hidden="true" />
              </button>
            </div>
          </nav>
        </div>
        <Teleport
          v-if="navMoreOpen"
          :to="navMoreTeleportTo"
          :disabled="shellTeleportPending"
        >
          <div class="tab-bar__more-portal">
            <div class="tab-bar__more-backdrop" aria-hidden="true" @click="navMoreOpen = false" />
            <div
              ref="navMoreMenuRef"
              class="tab-bar__more-menu"
              role="menu"
              :aria-label="'更多导航'"
              :style="navMoreMenuStyle"
              @click.stop
            >
              <router-link
                v-for="item in dropdownMenuItems"
                :key="item.id"
                :to="item.path"
                custom
                v-slot="{ navigate, href }"
              >
                <a
                  :href="href"
                  role="menuitem"
                  class="tab-bar__more-item"
                  :class="{
                    'tab-bar__more-item--active': isNavTabRouteActive(item.path, route.path),
                  }"
                  :style="{ '--tab-accent': item.accent, '--tab-icon-accent': item.accent }"
                  :aria-current="isNavTabRouteActive(item.path, route.path) ? 'page' : undefined"
                  @click="
                    () => {
                      navigate()
                      navMoreOpen = false
                    }
                  "
                >
                  <span class="tab-bar__more-item-icon">
                    <img
                      v-if="item.type === 'svg'"
                      :src="item.icon"
                      class="tab-bar__tab-svg"
                      alt=""
                    />
                    <component v-else :is="item.icon" class="tab-bar__tab-svg" />
                  </span>
                  <span>{{ item.label }}</span>
                </a>
              </router-link>
            </div>
          </div>
        </Teleport>
        <div class="tab-bar__actions">
          <button
            v-if="showAgentChrome"
            type="button"
            class="icon-btn"
            :class="{ 'icon-btn--active': showAgentChat }"
            :title="'智能管家'"
            :aria-label="'智能管家'"
            :aria-expanded="showAgentChat"
            @click="toggleAgentChat"
          >
            <MessageCircle class="w-4 h-4" />
          </button>
          <button
            v-if="showBackupChrome"
            type="button"
            class="icon-btn"
            title="备份与恢复"
            aria-label="备份与恢复"
            @click="openBackupSettings"
          >
            <Archive class="w-4 h-4" />
          </button>
          <div v-if="showNotificationChrome" class="notify-anchor">
            <button
              type="button"
              class="icon-btn icon-btn--notify"
              :class="{ 'icon-btn--active': showNotificationDrawer }"
              :title="
                notificationUnread > 0 ? `通知中心（${notificationUnread} 条未读）` : '通知中心'
              "
              :aria-label="
                notificationUnread > 0 ? `通知中心，${notificationUnread} 条未读` : '通知中心'
              "
              :aria-expanded="showNotificationDrawer"
              aria-controls="global-notification-panel"
              @click.stop="openNotificationDrawer"
            >
              <Bell class="w-4 h-4" />
              <span v-if="notificationUnread > 0" class="notify-badge" aria-hidden="true">
                {{ notificationUnread > 99 ? '99+' : notificationUnread }}
              </span>
            </button>
          </div>
          <button
            v-if="showWholeHomeOff"
            type="button"
            class="icon-btn"
            :disabled="haControlBlocked"
            :title="haControlBlocked ? 'HA 未就绪，暂不可全屋关闭' : '全屋关闭'"
            :aria-label="haControlBlocked ? 'HA 未就绪，暂不可全屋关闭' : '全屋关闭'"
            @click="onWholeHomeOff"
          >
            <PowerOff class="w-4 h-4" />
          </button>
          <template v-if="showSettingsTab">
            <button
              v-if="isSettingsLocked"
              type="button"
              class="icon-btn"
              :title="'设置'"
              :aria-label="'设置'"
              @click="onSettingsClick"
            >
              <Settings class="w-4 h-4" />
            </button>
            <router-link
              v-else
              to="/settings"
              custom
              v-slot="{ navigate, href }"
            >
              <a
                :href="href"
                class="icon-btn"
                :title="'设置'"
                :aria-label="'设置'"
                @click="navigate"
              >
                <Settings class="w-4 h-4" />
              </a>
            </router-link>
          </template>
          <button @click="toggleFullscreen" class="icon-btn" :title="'全屏'" :aria-label="'全屏'">
            <Maximize2 class="w-4 h-4" />
          </button>
        </div>
      </header>

      <SetupChecklistBanner />
      <ColdEntityPerfBanner />
      <!-- HA 断连 / 重连 / 实体过期 / 丢弃指令统一走 HaStatusDegradeBanner -->
      <HaStatusDegradeBanner class="main-layout__ha-banner" title="实时状态" />
      <div
        v-if="statusRail"
        class="ha-status-bar"
        :class="{
          'ha-status-bar--danger': statusRail.severity === 'danger',
          'ha-status-bar--info': statusRail.severity === 'info',
        }"
        role="status"
      >
        <Loader2 class="w-4 h-4 shrink-0 animate-spin" />
        <span class="ha-status-bar__text">{{ statusRail.text }}</span>
      </div>

      <!-- 内容行：仪表盘路由下与右侧栏并排（等价原 DashboardView 的 .dashboard-main），
           其余路由只渲染内容区，不改变原有几何。 -->
      <div
        class="dashboard-shell"
        :class="{ 'dashboard-shell--dashboard': route.name === 'dashboard' }"
      >
        <main id="main-content" class="main-content" tabindex="-1">
          <router-view v-slot="{ Component, route: childRoute }">
            <!-- keep-alive 缓存最多 8 个路由组件实例：通过 childRoute.path 作为 key 决定何时复用/重建 -->
            <keep-alive :max="8">
              <component :is="Component" v-if="Component" :key="childRoute.path" />
            </keep-alive>
          </router-view>

          <!-- 浮动控制中心：与原 homeos 一致锚定在内容区（原户型图 Canvas 内）。
               部件按 xPct/yPct 相对内容区定位；若挂到外壳层，坐标基准会变成整屏，
               yPct:100 的部件（如全屋安防）就会正好压到底部页脚上。 -->
          <FloatingHub v-if="route.name === 'dashboard'" class="shell-floating-hub" />
        </main>

        <!-- 右侧栏（信息面板，时钟/天气/快捷操作）：仅仪表盘路由显示，位于内容行末尾 -->
        <RightSidebar
          v-if="route.name === 'dashboard'"
          class="shell-right-sidebar"
          :panel-position="layoutStore.layoutConfig.panelPosition || 'right'"
          @open-group="chrome.openGroupModal"
        />
      </div>

      <!-- 仪表盘外壳（并入 homeos-3d 后由 MainLayout 承载，仅仪表盘路由显示）：
           底部能耗页脚，横跨内容区 + 右栏下方。 -->
      <DashboardFooter v-if="route.name === 'dashboard'" class="shell-footer" />

      <!-- teleport-target：所有需要脱离正常文档流的全屏浮层/弹窗挂载容器 -->
      <div class="teleport-target">
        <!-- 确认 / 输入 / 媒体全屏已提升到 App.vue 根（编辑器 / 展示页 / more-info 也要用） -->
        <!-- 门铃提醒弹窗 -->
        <DoorbellAlertModal
          :is-open="chrome.isDoorbellModalOpen"
          :camera-id="doorbellCameraId"
          :trigger-id="doorbellTriggerEntityId"
          :lock-entity-id="doorbellLockEntityId"
          :label="doorbellLabel"
          @close="chrome.closeDoorbellModal()"
        />
        <!-- 地震实时预警覆盖层 -->
        <EarthquakeAlertOverlay />
        <CencBulletinCard />
        <!-- 地震功能配置向导（首次启用引导） -->
        <EarthquakeSetupWizard v-model="showSetupWizard" />
        <!-- 设置锁弹窗 -->
        <SettingsLockModal
          :is-open="isSettingsLockOpen"
          @close="isSettingsLockOpen = false"
          @success="onUnlockSuccess"
        />
        <!-- 实体快捷控制浮层宿主（灯/开关/空调等设备弹窗） -->
        <EntityControlHost
          :entity-id="chrome.entityControlEntityId"
          :open="chrome.isEntityControlOpen"
          @close="chrome.closeEntityControl()"
        />
        <!-- 屏保 -->
        <Screensaver />
        <!-- 智能管家对话面板（认证 + module.agent） -->
        <AgentChatPalette
          v-if="showAgentChrome"
          :open="showAgentChat"
          @close="showAgentChat = false"
        />
        <!-- 通知抽屉（认证 + module.notifications） -->
        <NotificationDrawer
          v-if="showNotificationChrome"
          :is-open="showNotificationDrawer"
          @close="closeNotificationDrawer"
        />
        <!-- 设备分组批量控制弹窗（右栏 / 部件卡片点击设备组时打开） -->
        <DeviceGroupModal
          :is-open="chrome.isGroupModalOpen"
          :domain="chrome.groupModalDomain"
          :stats-sensors="chrome.groupModalSensors"
          @close="chrome.closeGroupModal()"
        />
      </div>
    </ScaledViewport>
    <BackupRestoreDialog v-if="showBackupChrome" ref="backupDialogRef" />
  </div>
</template>

<style scoped>
@import './styles/main-layout.css';
</style>
<!-- 非 scoped：覆盖子组件 HomeModeSwitcher 芯片，仅限 .tab-bar -->
<style src="./styles/tab-bar-mode-switcher.css"></style>
