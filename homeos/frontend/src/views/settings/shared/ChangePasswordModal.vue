<!--
组件：ChangePasswordModal.vue
所属模块：frontend / src / views / settings / shared
职责：修改密码弹窗。展示旧密码/新密码/确认密码表单，前端校验长度与一致性后调用 authStore 提交，
      支持焦点陷阱、teleport 到 shell、keep-alive 期间自动关闭。
Props：
  - open：是否打开
Emits：
  - close：关闭弹窗
关键依赖：
  - useAuthStore：提交修改密码
  - useChromeStore：notify
  - useFocusTrap / useKeepAliveGate / useShellTeleportTarget：焦点陷阱与 teleport
  - getApiErrorMessage：错误消息提取
数据来源：useAuthStore 的修改密码接口
-->
<template>
  <Teleport v-if="open" :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="hos-modal" appear>
      <div class="hos-modal-root">
        <div class="hos-modal-backdrop" @click="$emit('close')" />
        <div
          ref="panelRef"
          class="hos-modal-panel hos-modal-panel--sm hos-modal-panel--purple"
          role="dialog"
          aria-modal="true"
          :aria-label="'修改安全凭证'"
        >
          <div class="hos-modal-head">
            <div class="hos-modal-head-left">
              <div class="hos-modal-head-icon"><Lock class="w-5 h-5" /></div>
              <div>
                <h3 class="hos-modal-title">{{ '修改安全凭证' }}</h3>
                <p class="hos-modal-subtitle">{{ '更新管理员登录密码' }}</p>
              </div>
            </div>
            <button
              type="button"
              class="hos-modal-close"
              :aria-label="'关闭'"
              @click="$emit('close')"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
          <div class="hos-modal-body">
            <div class="space-y-4">
              <div>
                <label for="oldPassword" class="hos-modal-label">{{ '当前密码' }}</label>
                <input
                  id="oldPassword"
                  v-model="form.oldPassword"
                  type="password"
                  autocomplete="current-password"
                  class="hos-modal-input"
                  :placeholder="'请输入当前密码'"
                />
              </div>
              <div>
                <label for="newPassword" class="hos-modal-label">{{ '新密码' }}</label>
                <input
                  id="newPassword"
                  v-model="form.newPassword"
                  type="password"
                  autocomplete="new-password"
                  class="hos-modal-input"
                  :placeholder="'请输入新密码'"
                />
              </div>
              <div>
                <label for="confirmPassword" class="hos-modal-label">{{ '确认新密码' }}</label>
                <input
                  id="confirmPassword"
                  v-model="form.confirmPassword"
                  type="password"
                  autocomplete="new-password"
                  class="hos-modal-input"
                  :placeholder="'请再次输入新密码'"
                />
              </div>
              <p
                class="hos-modal-alert"
                style="
                  background: rgba(0, 0, 0, 0.2);
                  border-color: var(--premium-glass-bg-hover);
                  color: var(--hos-text-secondary);
                "
              >
                <span class="cp-alert-label font-bold">{{ '注意：' }}</span
                >{{ '修改密码后，当前所有登录会话将失效，请重新登录。' }}
              </p>
            </div>
          </div>
          <div class="hos-modal-footer hos-modal-footer--split">
            <button
              type="button"
              class="hos-modal-btn hos-modal-btn--ghost"
              :disabled="submitting"
              @click="$emit('close')"
            >
              {{ '取消' }}
            </button>
            <button
              type="button"
              class="hos-modal-btn hos-modal-btn--danger"
              :disabled="submitting"
              @click="submit"
            >
              {{ submitting ? '提交中…' : '确认修改' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { reactive, ref, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { X, Lock } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'
import { useKeepAliveGate } from '@/composables/ui/useKeepAliveGate'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'

const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['close'])
const { teleportDisabled: keepAliveTeleportDisabled } = useKeepAliveGate()
const { teleportTarget, shellTeleportPending } = useShellTeleportTarget()
const teleportDisabled = computed(
  () => keepAliveTeleportDisabled.value || shellTeleportPending.value,
)

watch(keepAliveTeleportDisabled, (disabled) => {
  if (disabled && props.open) emit('close')
})

const router = useRouter()
const authStore = useAuthStore()
const chrome = useChromeStore()
const panelRef = ref(null)
useFocusTrap(
  panelRef,
  computed(() => props.open),
)
const form = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const submitting = ref(false)

watch(
  () => props.open,
  (v) => {
    if (!v) {
      form.oldPassword = ''
      form.newPassword = ''
      form.confirmPassword = ''
    }
  },
)

async function submit() {
  if (submitting.value) return
  if (!form.oldPassword) {
    chrome.notify('请输入当前密码', 'warning')
    return
  }
  if (!form.newPassword) {
    chrome.notify('请输入新密码', 'warning')
    return
  }
  if (
    form.newPassword.length < 8 ||
    !/[a-zA-Z]/.test(form.newPassword) ||
    !/\d/.test(form.newPassword)
  ) {
    chrome.notify('密码至少 8 位，且须同时包含字母和数字', 'warning')
    return
  }
  if (form.newPassword !== form.confirmPassword) {
    chrome.notify('两次输入的新密码不一致', 'warning')
    return
  }
  submitting.value = true
  try {
    const result = await authStore.changePassword(form.oldPassword, form.newPassword)
    if (result.ok) {
      chrome.notify('密码修改成功，请重新登录', 'success')
      emit('close')
      await authStore.logout()
      router.push('/login')
    } else {
      chrome.notify(result.message || '密码修改失败，当前密码不正确', 'error')
    }
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '密码修改失败'), 'error')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped src="./styles/ChangePasswordModal.css"></style>
