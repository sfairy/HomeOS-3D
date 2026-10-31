<script setup lang="ts">
/**
 * 注册页（首次部署唯一账号）：账号 + 密码 + 确认密码 + 邮箱 + 邮箱验证码。
 *
 * 验证码由授权商店代发代验（后端 `/auth/verification` → `/auth/register`）；
 * 注册成功后服务端直接建立登录会话，这里整页跳转让所有 store 按新身份初始化。
 * 版式由 AuthShell 统一；本页处在「首次开通」三步轨道的第 2 步。
 */
import { computed, onBeforeUnmount, ref } from 'vue'

import SceneStage from '@/components/common/SceneStage.vue'
import AuthShell from '@/shared/components/auth/AuthShell.vue'
import PasswordField from '@homeos/shared/components/PasswordField.vue'
import { getLicenseAvailability } from '@/services/api/license'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import {
  PASSWORD_POLICY_MESSAGE,
  isPasswordPolicyCompliant,
} from '@homeos/shared/security/password-policy'
import { AUTH_FLOW_SETUP, renderAuthSteps } from '@/shared/utils/auth/auth-flow.util'
import { rememberActivationEmail } from '@/shared/utils/auth/activation-email.util'
import { resolveStoreLinks } from '@/shared/utils/store-links.util'

const authStore = useAuthStore()
const chrome = useChromeStore()

const username = ref('')
const email = ref('')
const code = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const submitting = ref(false)
const sending = ref(false)
const errorMessage = ref('')
const mismatch = computed(() => Boolean(passwordConfirmation.value) && password.value !== passwordConfirmation.value)

/** 步骤轨道：首次开通（初始化 → 注册 → 激活），本页是注册这一步。 */
const steps = renderAuthSteps(AUTH_FLOW_SETUP, 'register')

/** 商店里的购买入口：首次开通要买的是授权（基础版本），不是某个增量包。 */
const STORE_PRODUCTS_PATH = '/products'

/**
 * 商店地址：setup 期就开始解析，注册成功那一刻要**同步**拿到它。
 *
 * 为什么不能等提交后再请求：`window.open` 必须发生在用户手势的同一个任务里（第一个 `await`
 * 之前），否则浏览器按「非用户触发」拦掉弹窗。用户填这段表单（含邮箱验证码）通常要几十秒，
 * 足够 `/public/config` 回来；万一还没回来，就退化成「激活页上的购买按钮」（见下面
 * `store=blocked` 参数）。
 */
let storeProductsUrl = ''

/**
 * 本机是否还缺一份授权（要先去买激活码）。
 *
 * 读公开的 `/license/availability`：`required && !allowed` 就是「有授权门禁但当前没放行」。
 * 读失败按 `false` 处理 —— 那种情况下仍跳 `/`，由路由守卫做权威判定，不能凭一次失败的
 * 探测决定去开商店页。
 */
const needsPurchase = ref(false)

void resolveStoreLinks()
  .then((links) => {
    storeProductsUrl = links.pathUrl(STORE_PRODUCTS_PATH)
  })
  .catch(() => {
    storeProductsUrl = ''
  })

void getLicenseAvailability()
  .then(({ data }) => {
    needsPurchase.value = Boolean(data.required) && !data.allowed
  })
  .catch(() => {
    needsPurchase.value = false
  })

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
    errorMessage.value = '请先填写邮箱。'
    return
  }
  sending.value = true
  try {
    const result = await authStore.sendVerificationCode(target)
    startCooldown(Number(result.resendAfter) || 60)
    chrome.notify(result.delivered === false ? '验证码已生成，但邮件投递失败，请联系客服。' : '验证码已发送，请检查邮箱。', result.delivered === false ? 'warning' : 'success')
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

  // ── 同步段：必须发生在第一个 `await` 之前 ──
  //
  // 弹窗只能在「用户手势的同一个任务」里打开。放到 `await register()` 之后，浏览器会认为
  // 不是用户触发的而拦掉，于是首次开通的用户拿不到任何购买入口。
  //
  // 不用 `window.open(url, '_blank', 'noopener')`：带 noopener 时返回值恒为 null，
  // 注册失败就关不掉这个标签页，用户会被丢在一个「其实没注册成功」的商店页上。
  const storeTab = needsPurchase.value && storeProductsUrl
    ? window.open(storeProductsUrl, '_blank')
    : null
  if (storeTab) {
    // 等价于 noopener，但保留句柄（可以关）：防反向劫持。
    try {
      storeTab.opener = null
    } catch {
      // 跨源后赋值可能被拒：拦不住劫持也不该打断注册
    }
  }

  const registeredEmail = email.value.trim()
  try {
    await authStore.register({
      username: username.value.trim(),
      email: registeredEmail,
      code: code.value.trim(),
      password: password.value,
      passwordConfirmation: passwordConfirmation.value,
    })
    rememberActivationEmail(registeredEmail)
    // 整页跳转而不是 router.push：`systemInitialized` 是 router 模块级变量，注册时仍是
    // false，SPA 跳转会立刻被守卫弹回 /login。整页重载才能让它重新探测「已有账号」。
    if (needsPurchase.value) {
      // 只有「地址已知、弹窗确实没开成」才带 store=blocked：这时激活页必须明说被拦截，
      // 用户再点一次按钮就能买到。地址压根没解析出来是另一种失败，激活页的兜底话
      // （「商店地址当前不可用，请联系厂商」）才是对的，重试弹窗没有意义。
      const blocked = !storeTab && Boolean(storeProductsUrl)
      window.location.assign(
        blocked ? '/activate?from=register&store=blocked' : '/activate?from=register',
      )
      return
    }
    window.location.assign('/')
  } catch (caughtError) {
    // 注册没成：把刚打开的那个商店页关掉，别让人以为已经买成了。
    try {
      storeTab?.close()
    } catch {
      // 已经跨源 / 已被用户接管：关不掉就算了
    }
    errorMessage.value = getApiErrorMessage(caughtError, '注册失败。')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell
    eyebrow="注册"
    title="创建这台机器的唯一账号"
    description="账号用于登录，邮箱收验证码；之后填「账号或邮箱」任一个都能进。注册完成后本入口即关闭，并自动打开商店购买授权。"
    secure="账号 + 邮箱验证"
    :steps="steps"
    steps-label="首次开通进度"
  >
    <template #scene><SceneStage page="register" /></template>

    <form id="register-form" class="hos-form" @submit.prevent="onSubmit">
      <p v-if="errorMessage" id="message" class="hos-msg is-err" role="alert">{{ errorMessage }}</p>

      <div class="hos-row-id">
        <div class="hos-field">
          <div class="hos-label-row"><label for="register-username">账号</label></div>
          <div class="hos-control">
            <input id="register-username" name="username" v-model="username" :disabled="submitting"
              placeholder="登录用账号" autocomplete="username" minlength="3" maxlength="64"
              pattern="[^@\s]{3,64}" title="账号至少 3 位，不能包含 @ 或空格（@ 保留给邮箱登录）" required>
          </div>
        </div>
        <div class="hos-field">
          <div class="hos-label-row"><label for="register-email">邮箱</label></div>
          <div class="hos-control">
            <input id="register-email" name="email" v-model="email" :disabled="submitting"
              type="email" placeholder="name@example.com" autocomplete="email" required>
          </div>
        </div>
        <div class="hos-field hos-field--action">
          <div class="hos-label-row" aria-hidden="true">&nbsp;</div>
          <button type="button" class="hos-btn-ghost" :disabled="sending || cooldown > 0" @click="onSendCode">
            {{ cooldown > 0 ? `${cooldown} 秒后重发` : sending ? "发送中…" : "获取验证码" }}
          </button>
        </div>
      </div>

      <div class="hos-field">
        <div class="hos-label-row"><label for="register-code">邮箱验证码</label></div>
        <div class="hos-control">
          <input id="register-code" name="code" v-model="code" :disabled="submitting"
            type="text" inputmode="numeric" maxlength="12" placeholder="邮箱收到的验证码" autocomplete="one-time-code" required>
        </div>
      </div>

      <div class="hos-row-2">
        <div class="hos-field">
          <div class="hos-label-row"><label for="register-password">密码</label></div>
          <PasswordField id="register-password" v-model="password" autocomplete="new-password"
            placeholder="至少 8 位，含字母与数字" :minlength="8" />
        </div>
        <div class="hos-field">
          <div class="hos-label-row"><label for="register-confirm">确认密码</label></div>
          <PasswordField id="register-confirm" v-model="passwordConfirmation" autocomplete="new-password"
            placeholder="请再次输入密码" :minlength="8" />
        </div>
      </div>

      <p v-if="mismatch" class="hos-msg is-err" role="alert">两次输入的密码不一致。</p>

      <div class="hos-actions">
        <button class="hos-btn-primary" type="submit" :disabled="submitting">
          {{ submitting ? "注册中…" : "注册并登录" }}
        </button>
      </div>
    </form>

    <template #copy>
      <div class="hos-panel__meta">
        <span>本机唯一账号</span>
        <i class="hos-panel__meta-sep" aria-hidden="true"></i>
        <span>密码至少 8 位，含字母与数字</span>
        <i class="hos-panel__meta-sep" aria-hidden="true"></i>
        <span>注册后打开商店购买授权</span>
      </div>
      <p>忘记口令不必删账号：登录页「忘记本机密码」用注册邮箱验证码即可重置。</p>
    </template>
  </AuthShell>
</template>
