/**
 * @file VConfirmModal.vue
 * @module components/common/base
 * @description 全局确认对话框组件。通过 Teleport 渲染到 body 层级，与 VNotification 配合使用。
 *  支持键盘快捷键：Enter 确认、Escape 取消。模态框打开时锁定 body 滚动。
 *  依赖：vue（ref/computed/watch/onMounted/onUnmounted）、chrome.store（确认弹窗状态）、
 *  useFocusTrap（焦点陷阱，辅助无障碍）。
 */
<template>
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
        :class="chrome.activeConfirm.type === 'danger' ? 'hos-modal-panel--danger' : ''"
      >
        <div class="hos-modal-head">
          <h3 class="hos-modal-title">{{ chrome.activeConfirm.title }}</h3>
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
          <p>{{ chrome.activeConfirm.message }}</p>
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
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 VConfirmModal 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useChromeStore } from '@/stores/chrome.store'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'
const chrome = useChromeStore()
const panelRef = ref(null)
// 焦点陷阱激活条件：存在激活的确认弹窗
const trapActive = computed(() => !!chrome.activeConfirm)
useFocusTrap(panelRef, trapActive)

/**
 * 全局键盘事件处理：Escape 取消、Enter 确认。
 * @param e 键盘事件
 */
function onKeyDown(e) {
  if (!chrome.activeConfirm) return
  if (e.key === 'Escape') chrome.resolveConfirm(false)
  if (e.key === 'Enter') chrome.resolveConfirm(true)
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})

// 弹窗打开时锁定 body 滚动，关闭时恢复
watch(
  () => chrome.activeConfirm,
  (val) => {
    document.body.style.overflow = val ? 'hidden' : ''
  },
)
</script>