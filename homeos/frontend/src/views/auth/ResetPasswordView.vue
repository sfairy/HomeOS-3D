<script setup lang="ts">
/**
 * 找回本机密码（未登录可访问）：注册邮箱 + 邮箱验证码 + 新密码。
 *
 * 验证码由授权商店代发代验（后端 `/auth/verification?purpose=reset` →
 * `/auth/password/reset`），因此这台机器**不需要**自带 SMTP。重置成功后服务端会吊销
 * 该账号全部会话，这里直接整页跳登录页。
 *
 * 安全口径：发码接口对「邮箱不是本机账号」也回同形状的成功响应，所以页面上只承诺
 * 「若该邮箱与本机账号一致，验证码已发送」，不承诺账号存在。
 */
import { computed, onBeforeUnmount, ref } from 'vue'

import SceneStage from '@/components/common/SceneStage.vue'
import PasswordField from '@homeos/shared/components/PasswordField.vue'
import AuthShell from '@/shared/components/auth/AuthShell.vue'
import { AUTH_FLOW_ACCESS, renderAuthSteps } from '@/shared/utils/auth/auth-flow.util'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import {
  PASSWORD_POLICY_MESSAGE,
  isPasswordPolicyCompliant,
} from '@homeos/shared/security/password-policy'

const authStore = useAuthStore()
const chrome = useChromeStore()

const email = ref('')
const code = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const submitting = ref(false)
const sending = ref(false)
const sent = ref(false)
const errorMessage = ref('')
const mismatch = computed(
  () => Boolean(passwordConfirmation.value) && password.value !== passwordConfirmation.value,
)

/** 发码倒计时（秒）；商店会返回 resendAfter，缺省取商店默认冷却 60 秒。 */
const cooldown = ref(0)
let cooldownTimer: number | undefined

function startCooldown(seconds: number): void {
  cooldown.value = Math.max(1, Math.floor(seconds) || 120)
  window.clearInterval(cooldownTimer)
  cooldownTimer = window.setInterval(() => {
    cooldown.value -= 1
    if (cooldown.value <= 0) window.clearInterval(cooldownTimer)
  }, 1000)
}

onBeforeUnmount(() => window.clearInterval(cooldownTimer))

async function onSendCode(): Promise<void> {
  if (sending.value || cooldown.value > 0) return
  errorMessage.value = ''
  const target = email.value.trim()
  if (!target) {
    errorMessage.value = '请先填写注册邮箱。'
    return
  }
  sending.value = true
  try {
    const result = await authStore.sendVerificationCode(target, 'reset')
    sent.value = true
    startCooldown(Number(result.resendAfter) || 60)
    chrome.notify(
      result.delivered === false
        ? '验证码已生成，但邮件投递失败，请联系客服。'
        : '若该邮箱与本机账号一致，验证码已发送，请检查邮箱。',
      result.delivered === false ? 'warning' : 'success',
    )
  } catch (caughtError) {
    errorMessage.value = getApiErrorMessage(caughtError, '验证码发送失败。')
  } finally {
    sending.value = false
  }
}

async function onSubmit(): Promise<void> {
  if (submitting.value) return
  errorMessage.value = ''
  if (!isPasswordPolicyCompliant(password.value)) {
    errorMessage.value = PASSWORD_POLICY_MESSAGE
    return
  }
  if (mismatch.value) {
    errorMessage.value = '两次输入的密码不一致。'
    return
  }
  submitting.value = true
  try {
    await authStore.resetPassword({
      email: email.value.trim(),
      code: code.value.trim(),
      password: password.value,
      passwordConfirmation: passwordConfirmation.value,
    })
    chrome.notify('密码已重置，请用新密码登录。', 'success')
    // 服务端已吊销全部会话并清掉 Cookie，整页跳转让所有 store 按未登录态重新初始化。
    window.setTimeout(() => window.location.assign('/login'), 600)
  } catch (caughtError) {
    errorMessage.value = getApiErrorMessage(caughtError, '密码重置失败。')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell
    eyebrow="找回密码"
    title="重置本机管理员密码"
    description="用注册时登记的邮箱收验证码，验证通过即可设置新密码；重置后这台机器上的旧会话全部失效。"
    secure="邮箱验证"
    :steps="renderAuthSteps(AUTH_FLOW_ACCESS, 'reset')"
    steps-label="账号访问进度"
  >
    <template #scene><SceneStage page="reset" /></template>

    <form id="reset-form" class="hos-form" @submit.prevent="onSubmit">
      <p v-if="errorMessage" id="message" class="hos-msg is-err" role="alert">{{ errorMessage }}</p>

      <div class="hos-field">
        <div class="hos-label-row"><label for="reset-email">注册邮箱</label></div>
        <div class="hos-control">
          <input id="reset-email" name="email" v-model="email" :disabled="submitting"
            type="email" placeholder="name@example.com" autocomplete="email" required>
        </div>
      </div>

      <div class="hos-field hos-field--action">
        <div class="hos-label-row" aria-hidden="true">&nbsp;</div>
        <button type="button" class="hos-btn-ghost" :disabled="sending || submitting || cooldown > 0" @click="onSendCode">
          {{ cooldown > 0 ? `${cooldown} 秒后重发` : sending ? "发送中…" : "获取验证码" }}
        </button>
      </div>

      <div class="hos-field">
        <div class="hos-label-row"><label for="reset-code">邮箱验证码</label></div>
        <div class="hos-control">
          <input id="reset-code" name="code" v-model="code" :disabled="submitting"
            type="text" inputmode="numeric" maxlength="12" placeholder="邮箱收到的验证码" autocomplete="one-time-code" required>
        </div>
        <small v-if="sent">没收到？请确认该邮箱就是注册本机账号时用的那个。</small>
      </div>

      <div class="hos-row-2">
        <div class="hos-field">
          <div class="hos-label-row"><label for="reset-password">新密码</label></div>
          <PasswordField id="reset-password" v-model="password" autocomplete="new-password"
            placeholder="至少 8 位，含字母与数字" :minlength="8" />
        </div>
        <div class="hos-field">
          <div class="hos-label-row"><label for="reset-confirm">确认新密码</label></div>
          <PasswordField id="reset-confirm" v-model="passwordConfirmation" autocomplete="new-password"
            placeholder="请再次输入新密码" :minlength="8" />
        </div>
      </div>

      <div class="hos-actions">
        <button class="hos-btn-primary" type="submit" :disabled="submitting">
          {{ submitting ? "重置中…" : "重置密码" }}
        </button>
      </div>
    </form>

    <template #copy>
      <div class="hos-panel__meta">
        <span>验证码由商店代发</span>
        <i class="hos-panel__meta-sep" aria-hidden="true"></i>
        <span>重置后需重新登录</span>
      </div>
      <p class="hos-panel__meta">
        <a class="hos-text-button" href="/login">返回登录</a>
      </p>
    </template>
  </AuthShell>
</template>
