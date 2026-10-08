/**
 * @file VConfirmModal.vue
 * @module components/common/base
 * @description 全局确认对话框组件。Teleport 到缩放壳 #teleport-target（未就绪时回退 body），
 *  与 VNotification 配合使用。支持键盘快捷键：Enter 确认、Escape 取消。打开时锁定 body 滚动。
 *  依赖：vue（ref/computed/watch/onMounted/onUnmounted）、chrome.store（确认弹窗状态）、
 *  useFocusTrap、useBodyScrollLock、useShellTeleportTarget。
 */
<template>
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="hos-modal">
      <div
        v-if="chrome.activeConfirm"
        class="hos-modal-root"
        @click.self="chrome.resolveConfirm(false)"
      >
        <div class="hos-modal-backdrop" />
        <div
          ref="panelRef"
          class="hos-modal-panel hos-modal-panel--sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hos-confirm-title"
          aria-describedby="hos-confirm-message"
          :class="chrome.activeConfirm.type === 'danger' ? 'hos-modal-panel--danger' : ''"
        >
          <div class="hos-modal-head">
            <h3 id="hos-confirm-title" class="hos-modal-title">{{ chrome.activeConfirm.title }}</h3>
            <button
              type="button"
              class="hos-modal-close"
              :aria-label="'关闭'"
              @click="chrome.resolveConfirm(false)"
            >
              &times;
            </button>
          </div>
          <div class="hos-modal-body">
            <p id="hos-confirm-message">{{ chrome.activeConfirm.message }}</p>
          </div>
          <div class="hos-modal-footer">
            <!-- 取消按钮：点击即拒绝 -->
            <button
              type="button"
              class="hos-modal-btn hos-modal-btn--ghost"
              @click="chrome.resolveConfirm(false)"
            >
              {{ chrome.activeConfirm.cancelText }}
            </button>
            <!-- 确认按钮：danger 类型使用红色样式强调风险 -->
            <button
              type="button"
              class="hos-modal-btn"
              :class="
                chrome.activeConfirm.type === 'danger'
                  ? 'hos-modal-btn--danger'
                  : 'hos-modal-btn--primary'
              "
              @click="chrome.resolveConfirm(true)"
            >
              {{ chrome.activeConfirm.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/**
 * 职责：实现 VConfirmModal 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useChromeStore } from '@/stores/chrome.store'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'
import { useBodyScrollLock } from '@/composables/ui/useBodyScrollLock'
import { useEscLayer } from '@/composables/ui/useEscStack'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
const chrome = useChromeStore()
const { teleportTarget, shellTeleportPending } = useShellTeleportTarget()
const teleportDisabled = shellTeleportPending
const panelRef = ref(null)
// 焦点陷阱激活条件：存在激活的确认弹窗
const trapActive = computed(() => !!chrome.activeConfirm)
useFocusTrap(panelRef, trapActive)

/**
 * 防误确认窗口（毫秒）。
 * 弹窗常由「刚刚按下 Enter/Space 的那次交互」间接触发（如按钮激活后异步弹确认），
 * 键盘事件仍可能在同一帧落到 window 上；再加上长按 Enter 的自动重复，
 * 会直接把「确定」按掉。打开后的这段时间内忽略确认键，只接受 Escape。
 */
const CONFIRM_GUARD_MS = 350
/** 弹窗打开的时间戳；0 表示当前没有弹窗。 */
let openedAt = 0

watch(trapActive, (isActive) => {
  openedAt = isActive ? Date.now() : 0
})

/**
 * 全局键盘事件处理：Enter 确认（Escape 走全局 Esc 层级栈，见下方 useEscLayer）。
 * @param e 键盘事件
 */
function onKeyDown(e) {
  if (!chrome.activeConfirm) return
  if (e.key !== 'Enter') return
  // 危险档（删除 / 撤销授权等）必须点击确认：Enter 与「刚才那次回车」无法区分，
  // 误判代价不可逆，这里直接不响应键盘确认。
  if (chrome.activeConfirm.type === 'danger') return
  if (Date.now() - openedAt < CONFIRM_GUARD_MS) return
  chrome.resolveConfirm(true)
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})

// Esc 取消：入全局 Esc 层级栈，只关栈顶那一层。
// 确认框可以叠在查看器/抽屉/下拉之上，若各自都响应 window 上的 Esc，一次按键会关掉多层。
useEscLayer(trapActive, '全局确认框', () => chrome.resolveConfirm(false))

// 弹窗打开时锁定 body 滚动（引用计数，与同一时刻的其它浮层共享锁）
useBodyScrollLock(trapActive, '全局确认框')
</script>