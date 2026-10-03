<!--
  组件文件：MobileLayout.vue
  所属模块：frontend/src/layouts
  组件职责：竖屏移动端外壳。顶部 HaStatusDegradeBanner + ChildModeStatusBar（与桌面共用），
    中部 router-view（不带 keep-alive，移动端更关注内存与即时渲染），底部毛玻璃椭圆胶囊
    导航栏（5 个主 Tab：Home/Rooms/Energy/Alerts/More）+ 智能管家悬浮按钮，
    全屏装配 EntityControlHost / DeviceGroupModal / VConfirmModal / VPromptModal /
    MediaPlayerModal / DoorbellAlertModal / EarthquakeAlertOverlay / NotificationDrawer /
    Screensaver / AgentChatPalette 共 10 项浮层。
  依赖关系：composables：useMainLayoutDoorbell（门铃监听，与桌面同源但状态隔离）、
    useMainLayoutChildMode（儿童模式顶栏状态与 override 逻辑）、useNotificationCenter +
    NOTIFICATION_CENTER_KEY 注入、useEntityWsSubscriptionSync（HA 实体 WS 订阅）；
    stores：auth/layout/chrome/entities；layouts/shell-overlays（与 MainLayout 共用的浮层合并 chunk）；
    views/mobile/styles/mobile-pages.css：移动端页面通用样式。
  注意事项：与 MainLayout（横屏大屏）状态隔离，仅 mobile-portrait 视口通过路由守卫切换到 /m 路径；
    useMainLayoutDoorbell 实例化两份互不干扰；canUseAgent 需已认证 + 非访客 + 非儿童角色。
-->
<script setup lang="ts">
/**
 * 竖屏移动端外壳 — 毛玻璃椭圆胶囊底栏（Home / Rooms / Energy / Alerts / More）- 内部实现说明
 *
 * 职责：
 * 1. 渲染顶部 HA 实时状态横幅、儿童模式顶栏
 * 2. 渲染主内容区（router-view，不带 keep-alive）
 * 3. 装配移动端底部胶囊导航（5 个主 Tab）
 * 4. 装配智能管家悬浮按钮、Entity 控制浮层、设备分组弹窗
 * 5. 装配全局浮层（确认/输入对话框、媒体播放器、门铃、地震预警、通知抽屉、屏保、智能管家）
 *
 * 所属模块：frontend / src / layouts
 * 关键依赖：
 * - composables/ui/useMainLayoutDoorbell：与桌面 MainLayout 同源的门铃监听逻辑（状态隔离）
 * - composables/ui/useMainLayoutChildMode：儿童模式状态与覆盖逻辑
 * - composables/widget/useNotificationCenter：通知中心上下文（注入供下游消费）
 * - composables/entity/useEntityWsSubscriptionSync：HA 实体 WebSocket 订阅同步
 * - layouts/shell-overlays：与 MainLayout 共用的壳层浮层合并 chunk
 * - stores：auth / layout / chrome / entities
 *
 * 与 MainLayout（横屏大屏）状态隔离，仅在 mobile-portrait 视口使用。
 * 路由守卫会根据视口宽度自动在 / 与 /m 之间切换。
 */
import { computed, defineAsyncComponent, provide, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bell, Home, LayoutGrid, MessageCircle, MoreHorizontal, Zap } from '@lucide/vue'
import EntityControlHost from '@/components/entities/EntityControlHost.vue'
import EarthquakeAlertOverlay from '@/components/earthquake/AlertOverlay.vue'
import CencBulletinCard from '@/components/earthquake/CencBulletinCard.vue'
import VConfirmModal from '@/components/common/base/VConfirmModal.vue'
import VPromptModal from '@/components/common/base/VPromptModal.vue'
import Screensaver from '@/components/common/Screensaver.vue'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useEntitiesStore } from '@/stores/entities.store'
import { useAuthStore } from '@/stores/auth.store'
import { useMainLayoutDoorbell } from '@/composables/ui/useMainLayoutDoorbell'
import { useNotificationCenter } from '@/composables/widget/useNotificationCenter'
import { NOTIFICATION_CENTER_KEY } from '@/composables/widget/notification-center.context'
import { useEntityWsSubscriptionSync } from '@/composables/entity/useEntityWsSubscriptionSync'
import HaStatusDegradeBanner from '@/components/common/HaStatusDegradeBanner.vue'
import ChildModeStatusBar from '@/layouts/ChildModeStatusBar.vue'
import { useMainLayoutChildMode } from '@/composables/ui/useMainLayoutChildMode'
import '@/views/mobile/styles/mobile-pages.css'

const DeviceGroupModal = defineAsyncComponent(
  () => import('@/components/entities/device-group/DeviceGroupModal.vue'),
)
/** 壳层浮层合并为同一动态 chunk，避免多次独立小请求（与 MainLayout 共用） */
const loadShellOverlays = () => import('@/layouts/shell-overlays')
const MediaPlayerModal = defineAsyncComponent(() =>
  loadShellOverlays().then((m) => m.MediaPlayerModal),
)
const DoorbellAlertModal = defineAsyncComponent(() =>
  loadShellOverlays().then((m) => m.DoorbellAlertModal),
)
const NotificationDrawer = defineAsyncComponent(() =>
  loadShellOverlays().then((m) => m.NotificationDrawer),
)
const AgentChatPalette = defineAsyncComponent(
  () => import('@/components/widgets/agent/AgentChatPalette.vue'),
)

const route = useRoute()
const router = useRouter()
const layoutStore = useLayoutStore()
const chrome = useChromeStore()
const entitiesStore = useEntitiesStore()
const authStore = useAuthStore()

// 门铃状态：与桌面主布局同源 composable，监听门铃触发并联动弹窗
// 注：状态隔离 — useMainLayoutDoorbell 实例化两次（桌面/移动各一份），互不影响
const { doorbellCameraId, doorbellTriggerEntityId, doorbellLockEntityId, doorbellLabel } =
  useMainLayoutDoorbell({ layoutStore, chrome, entitiesStore })

// 通知抽屉开关与通知中心上下文（与 MainLayout 保持一致，供 NotificationDrawer 注入）
const showNotificationDrawer = ref(false)
// 智能管家弹层状态提升到 chrome store：首页 AI 管家卡片与悬浮按钮共用同一开关
const showAgentChat = computed({
  get: () => chrome.isAgentChatOpen,
  set: (v: boolean) => (v ? chrome.openAgentChat() : chrome.closeAgentChat()),
})
// 智能管家按钮可见条件：已认证、非访客、非儿童角色
const canUseAgent = computed(
  () => authStore.isAuthenticated && !authStore.isGuest() && authStore.role !== 'child',
)
const notificationCenterState = useNotificationCenter()
provide(NOTIFICATION_CENTER_KEY, notificationCenterState)

// 实体 WebSocket 订阅同步：与桌面 MainLayout 行为一致
useEntityWsSubscriptionSync()

// 儿童模式顶栏状态：是否显示、文案、是否允许临时解除
const {
  showChildModeBar,
  childModeBarText,
  childModeStatus,
  canChildOverride,
  childModeOverride,
} = useMainLayoutChildMode({ authStore, entitiesStore, chrome })

/** 关闭通知抽屉 */
function closeNotificationDrawer() {
  showNotificationDrawer.value = false
}

// 底部胶囊导航 5 个主 Tab：首页 / 房间 / 能耗 / 告警 / 更多
const tabs = [
  { id: 'home', label: '首页', icon: Home, path: '/m' },
  { id: 'rooms', label: '房间', icon: LayoutGrid, path: '/m/rooms' },
  { id: 'energy', label: '能耗', icon: Zap, path: '/m/energy' },
  { id: 'alerts', label: '告警', icon: Bell, path: '/m/alerts' },
  { id: 'more', label: '更多', icon: MoreHorizontal, path: '/m/more' },
] as const

// 根据当前路由高亮对应 Tab：more 同时覆盖 devices/security/settings 子页
const activeId = computed(() => {
  const p = route.path
  if (p.startsWith('/m/rooms')) return 'rooms'
  if (p.startsWith('/m/energy')) return 'energy'
  if (p.startsWith('/m/alerts')) return 'alerts'
  if (
    p.startsWith('/m/more') ||
    p.startsWith('/m/devices') ||
    p.startsWith('/m/security') ||
    p.startsWith('/m/settings')
  ) {
    return 'more'
  }
  return 'home'
})

/** 点击 Tab 跳转：仅当目标 path 与当前不同时才 push，避免重复入栈 */
function go(path: string) {
  if (route.path !== path) void router.push(path)
}
</script>

<template>
  <div class="mobile-shell">
    <HaStatusDegradeBanner class="mobile-shell__ha-banner" title="实时状态" />
    <ChildModeStatusBar
      v-if="showChildModeBar"
      :text="childModeBarText"
      :can-override="!!(childModeStatus?.enabled && canChildOverride)"
      @override="childModeOverride"
    />
    <main class="mobile-shell__main">
      <router-view />
    </main>
    <button
      v-if="canUseAgent"
      type="button"
      class="mobile-shell__agent"
      :class="{ 'mobile-shell__agent--on': showAgentChat }"
      aria-label="智能管家"
      @click="showAgentChat = !showAgentChat"
    >
      <MessageCircle class="mobile-shell__agent-icon" :stroke-width="2" />
    </button>
    <nav class="mobile-shell__nav" aria-label="移动端主导航">
      <div class="mobile-shell__capsule">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          class="mobile-shell__tab"
          :class="{ 'mobile-shell__tab--active': activeId === tab.id }"
          :aria-current="activeId === tab.id ? 'page' : undefined"
          @click="go(tab.path)"
        >
          <component :is="tab.icon" class="mobile-shell__icon" :stroke-width="2" />
          <span class="mobile-shell__label">{{ tab.label }}</span>
        </button>
      </div>
    </nav>
    <EntityControlHost
      :entity-id="chrome.entityControlEntityId"
      :open="chrome.isEntityControlOpen"
      @close="chrome.closeEntityControl()"
    />
    <DeviceGroupModal
      :is-open="chrome.isGroupModalOpen"
      :domain="chrome.groupModalDomain"
      :stats-sensors="chrome.groupModalSensors"
      @close="chrome.closeGroupModal()"
    />
    <!-- 全局确认/输入对话框（配合 chrome.confirm() / chrome.prompt() 使用） -->
    <VConfirmModal />
    <VPromptModal />
    <!-- 媒体播放器弹窗 -->
    <MediaPlayerModal
      :key="chrome.activeMediaEntityId || 'media'"
      :is-open="chrome.isMediaPlayerOpen"
      :entity-id="chrome.activeMediaEntityId"
      @close="chrome.closeMediaPlayer()"
    />
    <!-- 门铃提醒弹窗 -->
    <DoorbellAlertModal
      :is-open="chrome.isDoorbellModalOpen"
      :camera-id="doorbellCameraId"
      :trigger-id="doorbellTriggerEntityId"
      :lock-entity-id="doorbellLockEntityId"
      :label="doorbellLabel"
      @close="chrome.closeDoorbellModal()"
    />
    <!-- 地震预警覆盖层 -->
    <EarthquakeAlertOverlay />
    <CencBulletinCard />
    <!-- 通知抽屉 -->
    <NotificationDrawer
      v-if="authStore.isAuthenticated"
      :is-open="showNotificationDrawer"
      @close="closeNotificationDrawer"
    />
    <AgentChatPalette
      v-if="canUseAgent"
      :open="showAgentChat"
      @close="chrome.closeAgentChat()"
    />
    <!-- 屏保 -->
    <Screensaver />
  </div>
</template>

<style scoped>
.mobile-shell {
  --mobile-nav-h: 72px;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(120% 80% at 50% -10%, rgba(56, 189, 248, 0.16), transparent 55%),
    radial-gradient(90% 60% at 100% 100%, rgba(52, 211, 153, 0.08), transparent 50%),
    linear-gradient(180deg, #0f1419 0%, #151c26 48%, #1a222c 100%);
  color: var(--set-text-primary, #f4f7fb);
}

.mobile-shell__ha-banner {
  flex-shrink: 0;
  margin: calc(env(safe-area-inset-top, 0px) + 8px) var(--hos-space-lg, 16px) 0;
}

.mobile-shell__main {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: calc(var(--hos-space-lg, 16px) + env(safe-area-inset-top, 0px))
    var(--hos-space-lg, 16px)
    calc(var(--mobile-nav-h) + var(--hos-space-xl, 20px));
  -webkit-overflow-scrolling: touch;
}

.mobile-shell__nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  display: flex;
  justify-content: center;
  padding: 0 var(--hos-space-lg, 16px) calc(10px + env(safe-area-inset-bottom, 0px));
  pointer-events: none;
}

.mobile-shell__capsule {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 2px;
  width: min(420px, 100%);
  padding: 8px 10px;
  border-radius: var(--hos-radius-pill, 999px);
  background: var(--premium-glass-bg, rgba(255, 255, 255, 0.1));
  border: var(--hos-hairline, 1px) solid var(--premium-border-strong, rgba(255, 255, 255, 0.16));
  backdrop-filter: blur(18px) saturate(1.35);
  -webkit-backdrop-filter: blur(18px) saturate(1.35);
  box-shadow:
    0 10px 32px rgba(0, 0, 0, 0.35),
    var(--hos-surface-inset, inset 0 1px 0 rgba(255, 255, 255, 0.08));
}

.mobile-shell__tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px;
  border: 0;
  border-radius: var(--hos-radius-pill, 999px);
  background: transparent;
  color: var(--set-text-secondary, rgba(244, 247, 251, 0.55));
  font-size: var(--premium-fs-micro, 11px);
  font-weight: 650;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease;
}

.mobile-shell__tab--active {
  background: var(--set-glass-bg-hover, rgba(255, 255, 255, 0.14));
  color: var(--set-text-heading, #fff);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.mobile-shell__icon {
  width: 20px;
  height: 20px;
}

.mobile-shell__agent {
  position: fixed;
  right: var(--hos-space-lg, 16px);
  bottom: calc(var(--mobile-nav-h) + 12px + env(safe-area-inset-bottom, 0px));
  z-index: 41;
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border: var(--hos-hairline, 1px) solid var(--premium-border-strong, rgba(255, 255, 255, 0.16));
  border-radius: var(--hos-radius-panel);
  background: var(--premium-glass-bg, rgba(255, 255, 255, 0.12));
  color: var(--set-text-heading, #fff);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  cursor: pointer;
}

.mobile-shell__agent--on {
  background: color-mix(in srgb, var(--page-accent, #34d399) 28%, rgba(255, 255, 255, 0.12));
}

.mobile-shell__agent-icon {
  width: 22px;
  height: 22px;
}
</style>
