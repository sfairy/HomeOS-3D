/**
 * @file VPromptModal.vue
 * @module components/common/base
 * @description 全局输入对话框组件。Teleport 到缩放壳 #teleport-target（未就绪时回退 body），
 *  提供单行文本输入、必填校验与确认/取消。打开时自动聚焦并全选输入框。
 *  依赖：vue、@lucide/vue、chrome.store、useFocusTrap、useShellTeleportTarget。
 */
<template>
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="hos-modal">
      <div v-if="chrome.activePrompt" class="hos-modal-root" @click.self="cancel">
        <div class="hos-modal-backdrop" />
        <div
          ref="panelRef"
          class="hos-modal-panel hos-modal-panel--sm hos-modal-panel--purple"
          role="dialog"
          aria-modal="true"
        >
          <div class="hos-modal-head">
            <div class="hos-modal-head-left">
              <div class="hos-modal-head-icon">
                <PencilLine class="w-5 h-5" />
              </div>
              <div>
                <h3 class="hos-modal-title">{{ chrome.activePrompt.title }}</h3>
                <p v-if="chrome.activePrompt.message" class="hos-modal-subtitle">
                  {{ chrome.activePrompt.message }}
                </p>
              </div>
            </div>
            <button type="button" class="hos-modal-close" :aria-label="'取消'" @click="cancel">
              &times;
            </button>
          </div>
          <div class="hos-modal-body">
            <label v-if="chrome.activePrompt.label" class="hos-modal-label" :for="inputId">
              {{ chrome.activePrompt.label }}
            </label>
            <input
              :id="inputId"
              ref="inputRef"
              v-model="inputValue"
              type="text"
              class="hos-modal-input"
              :placeholder="chrome.activePrompt.placeholder"
              autocomplete="off"
              @keydown.enter.prevent="submit"
            />
            <!-- 校验错误提示 -->
            <p v-if="validationError" class="hos-modal-prompt-error">{{ validationError }}</p>
          </div>
          <div class="hos-modal-footer">
            <button type="button" class="hos-modal-btn hos-modal-btn--ghost" @click="cancel">
              {{ chrome.activePrompt.cancelText }}
            </button>
            <button type="button" class="hos-modal-btn hos-modal-btn--primary" @click="submit">
              {{ chrome.activePrompt.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/**
 * 职责：实现 VPromptModal 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { ref, computed, watch, nextTick } from 'vue'
import { PencilLine } from '@lucide/vue'
import { useChromeStore } from '@/stores/chrome.store'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'
import { useBodyScrollLock } from '@/composables/ui/useBodyScrollLock'
import { useEscLayer } from '@/composables/ui/useEscStack'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
const chrome = useChromeStore()
const { teleportTarget, shellTeleportPending } = useShellTeleportTarget()
const teleportDisabled = shellTeleportPending
const panelRef = ref(null)
// 焦点陷阱激活条件：存在激活的提示弹窗
const trapActive = computed(() => !!chrome.activePrompt)
useFocusTrap(panelRef, trapActive)
// 滚动锁激活条件（与 trapActive 同源，语义上拆开便于日后单独调整）
const promptActive = computed(() => !!chrome.activePrompt)
const inputRef = ref(null)
/** 输入框绑定值 */
const inputValue = ref('')
/** 校验错误信息 */
const validationError = ref('')
// 输入框 id，用于 label 关联
const inputId = `hos-prompt-input-${Math.random().toString(36).slice(2, 9)}`

/**
 * 取消操作：清空错误并返回 null。
 */
function cancel() {
  validationError.value = ''
  chrome.resolvePrompt(null)
}

/**
 * 提交输入值：必填时进行非空校验，通过后 resolve。
 */
function submit() {
  const cfg = chrome.activePrompt
  if (!cfg) return
  const val = inputValue.value.trim()
  // 必填校验：为空时显示错误并重新聚焦
  if (cfg.required && !val) {
    validationError.value = cfg.requiredMessage
    inputRef.value?.focus()
    return
  }
  validationError.value = ''
  chrome.resolvePrompt(cfg.required ? val : (inputValue.value ?? ''))
}

/**
 * Esc 取消：入全局 Esc 层级栈（只关栈顶那一层）。
 * 之前是 window 级监听：输入框可以叠在查看器/抽屉之上，各自都响应 window 上的 Esc，
 * 一次按键会把两层一起关掉。
 */
useEscLayer(promptActive, '全局输入框', () => cancel())

// 监听弹窗状态：打开时回填默认值并聚焦选中（滚动锁由 useBodyScrollLock 统一管理）
watch(
  () => chrome.activePrompt,
  async (val) => {
    if (val) {
      inputValue.value = val.defaultValue ?? ''
      validationError.value = ''
      await nextTick()
      inputRef.value?.focus()
      inputRef.value?.select()
    }
  },
)

// 滚动锁：引用计数，与同时打开的确认框 / 抽屉共享同一把锁，不会提前放行
useBodyScrollLock(promptActive, '全局输入框')
</script>

<style scoped>
.hos-modal-prompt-error {
  margin-top: 8px;
  font-size: var(--premium-fs-caption);
  color: #fca5a5;
}
</style>