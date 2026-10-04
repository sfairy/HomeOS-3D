<template>
  <!-- NotificationDrawer 通知中心抽屉：右侧侧拉的全局通知列表 -->
  <Teleport v-if="isOpen" :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="notification-drawer">
      <div v-if="isOpen" class="notification-drawer-overlay" role="presentation" @keydown="onOverlayKeydown">
        <div class="notification-drawer-backdrop" aria-hidden="true" @click="emit('close')" />
        <aside
          id="global-notification-panel"
          ref="panelRef"
          class="notification-drawer-panel"
          role="dialog"
          aria-modal="true"
          aria-label="通知中心"
          tabindex="-1"
        >
          <div class="notification-drawer-handle" aria-hidden="true" />
          <header class="notification-drawer-header">
            <div class="notification-drawer-header__left">
              <div class="notification-drawer-header__icon" aria-hidden="true">
                <Bell class="w-4 h-4" />
              </div>
              <h2 class="notification-drawer-header__title">{{ '通知中心' }}</h2>
              <span v-if="unreadCount > 0" class="notification-drawer-header__badge">{{
                unreadCount > 99 ? '99+' : unreadCount
              }}</span>
            </div>
            <button
              type="button"
              class="notification-drawer-header__close"
              :title="'关闭'"
              :aria-label="'关闭通知中心'"
              @click="emit('close')"
            >
              <X class="w-4 h-4" />
            </button>
          </header>
          <div class="notification-drawer-body custom-scrollbar">
            <NotificationCenter drawer />
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/**
 * NotificationDrawer - 通知中心抽屉组件
 * 职责：右侧侧拉式通知中心面板，内部委托 NotificationCenter 渲染通知列表。
 * 关键依赖：
 * - useShellTeleportTarget：将面板传送到 shell 容器以避免裁剪；
 * - useFocusTrap：在面板打开期间捕获焦点，无障碍支持；
 * - NOTIFICATION_CENTER_KEY：注入未读数等通知中心上下文。
 * Emits:
 * - close：关闭抽屉（点击遮罩或按 Esc）。
 */
import { computed, inject, ref, toRef, watch } from 'vue'
import { Bell, X } from '@lucide/vue'
import NotificationCenter from '@/components/widgets/system/NotificationCenter.vue'
import { NOTIFICATION_CENTER_KEY } from '@/composables/widget/notification-center.context'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'

const props = defineProps({
  isOpen: { type: Boolean, default: false },
})

const { teleportTarget, shellTeleportPending, refreshShellTeleport } = useShellTeleportTarget()
const teleportDisabled = shellTeleportPending
const panelRef = ref(null)
useFocusTrap(panelRef, toRef(props, 'isOpen'))

watch(
  () => props.isOpen,
  (open) => {
    if (open) refreshShellTeleport()
  },
)

const emit = defineEmits(['close'])

function onOverlayKeydown(ev) {
  // Esc 关闭抽屉，避免冒泡影响背后页面
  if (ev.key === 'Escape') {
    ev.preventDefault()
    emit('close')
  }
}

// 注入通知中心上下文以显示未读数；缺省回退为 0
const nc = inject(NOTIFICATION_CENTER_KEY, null)
const unreadCount = computed(() => nc?.unreadCount?.value ?? 0)
</script>

<style scoped>
@import './styles/notification-drawer.css';
</style>
