<!--
  修改本机管理员密码弹窗。

  三个字段（当前密码 / 新密码 / 确认新密码）+ 显隐切换。后端在成功响应里会轮换会话
  Cookie，所以成功后这里只提示并关闭，不需要前端手动处理 Cookie。
-->
<template>
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
    <dialog ref="dialogRef" class="change-password" aria-labelledby="change-password-title" @cancel="onCancel" @close="onClose">
      <div class="change-password__head">
        <div>
          <span class="change-password__eyebrow">SECURITY</span>
          <h2 id="change-password-title">修改密码</h2>
        </div>
        <button type="button" class="change-password__close" aria-label="关闭修改密码" :disabled="busy" @click="close">
          ×
        </button>
      </div>

      <form class="change-password__body" @submit.prevent="onSubmit">
        <p class="change-password__guide">
          修改成功后，这台机器上其它浏览器与终端上的登录会话会全部失效，需要用新密码重新登录。
        </p>

        <label class="change-password__field">
          <span>当前密码</span>
          <input
            v-model="currentPassword"
            type="password"
            autocomplete="current-password"
            placeholder="请输入当前密码"
            :disabled="busy"
            required
          >
        </label>

        <label class="change-password__field">
          <span>新密码</span>
          <input
            v-model="newPassword"
            :type="revealNew ? 'text' : 'password'"
            autocomplete="new-password"
            placeholder="至少 8 位，含字母与数字"
            minlength="8"
            maxlength="128"
            :disabled="busy"
            required
          >
        </label>

        <label class="change-password__field">
          <span>确认新密码</span>
          <input
            v-model="newPasswordConfirmation"
            :type="revealNew ? 'text' : 'password'"
            autocomplete="new-password"
            placeholder="请再次输入新密码"
            minlength="8"
            maxlength="128"
            :disabled="busy"
            required
          >
        </label>

        <label class="change-password__reveal">
          <input v-model="revealNew" type="checkbox" :disabled="busy">
          显示新密码
        </label>

        <p v-if="message" class="change-password__message" :class="messageTone" role="alert" aria-live="polite">
          {{ message }}
        </p>

        <div class="change-password__actions">
          <button type="button" class="settings-btn-ghost" :disabled="busy" @click="close">取消</button>
          <button type="submit" class="settings-btn-ghost settings-btn-ghost--purple" :disabled="busy">
            {{ busy ? "提交中…" : "确认修改" }}
          </button>
        </div>
      </form>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import {
  PASSWORD_POLICY_MESSAGE,
  isPasswordPolicyCompliant,
} from '@/shared/utils/core/password.util'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'

const authStore = useAuthStore()
const chrome = useChromeStore()
const { teleportTarget, shellTeleportPending } = useShellTeleportTarget()
const teleportDisabled = shellTeleportPending

const dialogRef = ref<HTMLDialogElement | null>(null)
const currentPassword = ref('')
const newPassword = ref('')
const newPasswordConfirmation = ref('')
const revealNew = ref(false)
const busy = ref(false)
const message = ref('')
const messageTone = ref('')

function setMessage(text: string, tone = 'error'): void {
  message.value = text
  messageTone.value = tone
}

function reset(): void {
  currentPassword.value = ''
  newPassword.value = ''
  newPasswordConfirmation.value = ''
  revealNew.value = false
  busy.value = false
  message.value = ''
  messageTone.value = ''
}

function open(): void {
  reset()
  dialogRef.value?.showModal()
}

function close(): void {
  if (!busy.value) dialogRef.value?.close()
}

function onCancel(event: Event): void {
  if (busy.value) event.preventDefault()
}

function onClose(): void {
  reset()
}

async function onSubmit(): Promise<void> {
  if (busy.value) return
  message.value = ''
  if (!currentPassword.value) {
    setMessage('请输入当前密码。')
    return
  }
  if (!isPasswordPolicyCompliant(newPassword.value)) {
    setMessage(PASSWORD_POLICY_MESSAGE)
    return
  }
  if (newPassword.value !== newPasswordConfirmation.value) {
    setMessage('两次输入的新密码不一致。')
    return
  }
  if (newPassword.value === currentPassword.value) {
    setMessage('新密码不能与当前密码相同。')
    return
  }
  busy.value = true
  try {
    await authStore.changePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
      newPasswordConfirmation: newPasswordConfirmation.value,
    })
    chrome.notify('密码已更新，其它终端上的旧会话已失效。', 'success')
    close()
  } catch (error) {
    setMessage(getApiErrorMessage(error, '修改密码失败。'))
  } finally {
    busy.value = false
  }
}

defineExpose({ open, close })
</script>

<style scoped>
.change-password {
  width: min(420px, calc(100vw - 32px));
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 18px;
  background: #0f172a;
  color: #e2e8f0;
  padding: 0;
}

.change-password::backdrop {
  background: rgba(2, 6, 23, 0.66);
  backdrop-filter: blur(6px);
}

.change-password__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 22px 8px;
}

.change-password__eyebrow {
  font-size: 11px;
  letter-spacing: 0.18em;
  color: #7c8aa5;
}

.change-password__head h2 {
  margin: 4px 0 0;
  font-size: 18px;
  font-weight: 600;
}

.change-password__close {
  border: 0;
  background: transparent;
  color: #94a3b8;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.change-password__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 8px 22px 22px;
}

.change-password__guide {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #94a3b8;
}

.change-password__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #cbd5e1;
}

.change-password__field input {
  height: 38px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(15, 23, 42, 0.9);
  color: #e2e8f0;
  font-size: 13px;
}

.change-password__field input:focus {
  outline: none;
  border-color: rgba(56, 189, 248, 0.7);
}

.change-password__reveal {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #94a3b8;
}

.change-password__message {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.change-password__message.error {
  color: #fca5a5;
}

.change-password__message.success {
  color: #6ee7b7;
}

.change-password__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}
</style>
