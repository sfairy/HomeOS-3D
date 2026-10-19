<script setup lang="ts">
/**
 * 登录页（单用户口径）：账号（用户名或注册邮箱）任填其一 + 密码。
 *
 * 版式由 AuthShell 统一（场景壳 + 面板 + 步骤轨道），这里只管表单与提交；
 * 提交走 Pinia 的 auth store。
 */
import { ref } from 'vue'

import { useStoreLinks } from '@/composables/auth/useStoreLinks'
import SceneStage from '@/components/common/SceneStage.vue'
import AuthShell from '@/shared/components/auth/AuthShell.vue'
import PasswordField from '@homeos/shared/components/PasswordField.vue'
import { useAuthStore } from '@/stores/auth.store'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { AUTH_FLOW_ACCESS, renderAuthSteps } from '@/shared/utils/auth/auth-flow.util'

const authStore = useAuthStore()
useStoreLinks()

/** 账号：可填用户名或注册邮箱，服务端按二者其一匹配。 */
const account = ref('')
const password = ref('')
const submitting = ref(false)
const errorMessage = ref('')

/** 步骤轨道：回访流程（登录 ←→ 找回密码），与首次开通的三步流程分开编号。 */
const steps = renderAuthSteps(AUTH_FLOW_ACCESS, 'login')

/** 登录成功后的落点：仅接受站内绝对路径，避免 `next` 变成开放重定向。 */
function loginDestination(): string {
  const nextPath = new URLSearchParams(window.location.search).get('next') || '/'
  return nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/'
}

async function onSubmit(): Promise<void> {
  if (submitting.value) return
  errorMessage.value = ''
  submitting.value = true
  try {
    await authStore.login(account.value, password.value)
    // 整页跳转而非原地换路由：会话由服务端 HttpOnly Cookie 承载，
    // 重新引导一次能确保所有 store 都按新身份初始化。
    window.location.assign(loginDestination())
  } catch (caughtError) {
    errorMessage.value = getApiErrorMessage(caughtError, '登录失败。')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell
    eyebrow="登录"
    title="进入本机中控"
    description="用注册时的账号或邮箱登录，两者任填其一即可。会话只落在这台机器上，登录后自动检测授权。"
    secure="账号存本机"
    :steps="steps"
    steps-label="账号访问进度"
  >
    <template #scene><SceneStage page="login" /></template>

    <form id="login-form" class="hos-form" @submit.prevent="onSubmit">
      <p v-if="errorMessage" id="message" class="hos-msg is-err" role="alert">{{ errorMessage }}</p>

      <div class="hos-field">
        <div class="hos-label-row"><label for="login-account">账号或邮箱</label></div>
        <!-- 这里不加 minlength：登录只回显长度约束，账号规则不泄露（见 LoginRequest）。 -->
        <!-- 这里是「账号或邮箱」二合一输入框：不加 type="email"（会拦掉纯用户名），
             但用 inputmode="email" 让手机弹出带 @ 的键盘。 -->
        <div class="hos-control">
          <input id="login-account" name="account" v-model="account" :disabled="submitting"
            placeholder="用户名 / 邮箱" autocomplete="username" inputmode="email"
            autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="255" required>
        </div>
      </div>

      <div class="hos-field">
        <div class="hos-label-row"><label for="login-password">密码</label></div>
        <PasswordField id="login-password" v-model="password" autocomplete="current-password"
          placeholder="输入密码" />
      </div>

      <div class="hos-actions">
        <button class="hos-btn-primary" type="submit" :disabled="submitting">
          {{ submitting ? "登录中…" : "登录" }}
        </button>
      </div>
    </form>

    <template #copy>
      <div class="hos-panel__meta">
        <span>失败多次临时限流</span>
        <i class="hos-panel__meta-sep" aria-hidden="true"></i>
        <span>未激活先进激活页</span>
      </div>
      <p>授权失效时不会丢账号：先进入激活页完成绑定，再回到这里。</p>
      <!-- 这一行借用 .hos-panel__meta 的 flex 排布：分隔条是 1px 的 <i>，
           只有在 flex 容器里才拿得到宽度，否则会缩成看不见的一个点。 -->
      <p class="hos-panel__meta">
        <!-- 站内找回：改的是**本机**管理员密码（注册邮箱 + 商店代发验证码），
             不是商店账号。 -->
        <a class="hos-text-button" href="/reset-password">忘记本机密码</a>
        <i class="hos-panel__meta-sep" aria-hidden="true"></i>
        <!-- href 只是挂载前的占位：useStoreLinks 会把它们改写成后端 /public/config
             下发的商店地址（后端会先向商店问回它的对外地址，见
             domains/store/discovery.py）。 -->
        <a class="hos-text-button" data-store-password-reset-link
          href="http://127.0.0.1:8802/user/authentication/forget" target="_blank"
          rel="noopener noreferrer">重置商店密码</a>
        <i class="hos-panel__meta-sep" aria-hidden="true"></i>
        <a class="hos-text-button" data-store-link href="http://127.0.0.1:8802/" target="_blank"
          rel="noopener noreferrer">商店</a>
      </p>
    </template>
  </AuthShell>
</template>
