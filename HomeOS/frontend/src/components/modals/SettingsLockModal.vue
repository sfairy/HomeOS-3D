<template>
  <!-- SettingsLockModal 设置锁弹窗：访客模式下访问受限设置时弹出 PIN 验证 -->
  <Transition name="hos-modal">
    <div v-if="isOpen" class="hos-modal-root">
      <div class="hos-modal-backdrop" />
      <div
        ref="panelRef"
        class="hos-modal-panel hos-modal-panel--pin"
        role="dialog"
        aria-modal="true"
        :aria-label="'设置锁验证'"
        :class="{ 'animate-shake': isError }"
        v-swipe-close="() => emit('close')"
      >
        <div class="hos-modal-glow hos-modal-glow--blue" />
        <div class="hos-modal-glow hos-modal-glow--purple" />

        <div class="relative z-[1] flex flex-col items-center">
          <div
            class="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 border transition-all duration-500"
            :class="
              isSuccess
                ? 'slm-success-bg slm-success-border slm-success-text'
                : isError
                  ? 'slm-error-bg slm-error-border slm-error-text'
                  : 'bg-white/5 border-white/10 slm-default-text'
            "
          >
            <svg
              v-if="isSuccess"
              class="w-8 h-8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <svg
              v-else
              class="w-8 h-8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          <div class="text-center mb-2">
            <div
              class="hos-modal-title"
              style="font-size: 1.15rem; text-transform: uppercase; letter-spacing: 0.04em"
            >
              {{ isSuccess ? '验证成功' : '系统访问限制' }}
            </div>
            <div class="hos-modal-eyebrow" style="margin-top: 6px">
              {{ isSuccess ? '访问已授权' : '访客模式已激活 · 需要管理员 PIN' }}
            </div>
          </div>

          <div class="hos-modal-pin-dots">
            <div
              v-for="i in pinLength"
              :key="i"
              class="hos-modal-pin-dot"
              :class="{
                'hos-modal-pin-dot--filled': pin.length >= i && !isSuccess && !isError,
                'hos-modal-pin-dot--success': pin.length >= i && isSuccess,
                'hos-modal-pin-dot--error': pin.length >= i && isError,
              }"
            />
          </div>

          <div class="hos-modal-pin-grid mb-2">
            <button
              v-for="n in 9"
              :key="n"
              type="button"
              class="hos-modal-pin-key"
              @click="appendDigit(String(n))"
            >
              {{ n }}
            </button>
            <button
              type="button"
              class="hos-modal-pin-key slm-default-text"
              aria-label="清除"
              @click="clearPin"
            >
              C
            </button>
            <button type="button" class="hos-modal-pin-key" @click="appendDigit('0')">0</button>
            <button
              type="button"
              class="hos-modal-pin-key slm-default-text"
              :aria-label="'退格'"
              @click="deleteDigit"
            >
              <svg
                class="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                <line x1="18" y1="9" x2="12" y2="15" />
                <line x1="12" y1="9" x2="18" y2="15" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
/**
 * SettingsLockModal - 设置锁 PIN 码验证弹窗组件
 * 职责：访客模式下访问受限设置前，要求用户输入 PIN 验证。
 * 关键依赖：
 * - useFocusTrap：弹窗打开期间锁定焦点；
 * - useLayoutStore：读取设置锁配置（PIN 长度）并执行 unlockSettings 验证。
 * Props:
 * - isOpen：弹窗是否打开。
 * Emits:
 * - close：关闭弹窗；
 * - success：PIN 验证通过后触发。
 */
import { ref, watch, computed, onUnmounted } from 'vue'
import { useLayoutStore } from '@/stores/layout.store'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'
const props = defineProps({ isOpen: { type: Boolean } })
const emit = defineEmits(['close', 'success'])

const layoutStore = useLayoutStore()
const panelRef = ref(null)
useFocusTrap(
  panelRef,
  computed(() => !!props.isOpen),
)
const pin = ref('')
const isError = ref(false)
const isSuccess = ref(false)

const pinLength = computed(() => layoutStore.layoutConfig.settingsLock?.pin?.length || 4)

let pinTimer = null

function appendDigit(d) {
  // 追加数字到 PIN，达到目标长度后触发自动校验
  if (pin.value.length < pinLength.value) {
    pin.value += d
    isError.value = false
  }
}

function deleteDigit() {
  // 退格删除最后一位
  pin.value = pin.value.slice(0, -1)
  isError.value = false
}
function clearPin() {
  // 清空 PIN 并复位状态
  pin.value = ''
  isError.value = false
  isSuccess.value = false
}

watch(
  () => props.isOpen,
  (val) => {
    if (val) clearPin()
  },
)

watch(pin, (val) => {
  // PIN 达到目标长度时自动校验：成功延迟 600ms 关闭，失败抖动后清空
  const pinLen = layoutStore.layoutConfig.settingsLock?.pin?.length || 4
  if (val.length === pinLen) {
    if (layoutStore.unlockSettings(val)) {
      isSuccess.value = true
      if (pinTimer) clearTimeout(pinTimer)
      pinTimer = setTimeout(() => {
        emit('success')
        emit('close')
        pinTimer = null
      }, 600)
    } else {
      isError.value = true
      if (pinTimer) clearTimeout(pinTimer)
      pinTimer = setTimeout(() => {
        isError.value = false
        pin.value = ''
        pinTimer = null
      }, 500)
    }
  }
})

onUnmounted(() => {
  // 组件卸载时清理未触发的定时器，避免回调泄漏
  if (pinTimer) clearTimeout(pinTimer)
})
</script>

<style scoped src="./styles/SettingsLockModal.css"></style>
