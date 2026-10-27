<script setup lang="ts">
/**
 * 登录页（单用户口径）：账号（用户名或注册邮箱）任填其一 + 密码。
 *
 * 版式由 AuthShell 统一（场景壳 + 面板 + 步骤轨道），这里只管表单与提交；
 * 提交走 Pinia 的 auth store。
 */
import { computed, ref } from 'vue'

import { useStoreLinks } from '@/composables/auth/useStoreLinks'
import SceneStage from '@/components/common/SceneStage.vue'
import AuthShell from '@/shared/components/auth/AuthShell.vue'
import PasswordField from '@homeos/shared/components/PasswordField.vue'
import { useAuthStore } from '@/stores/auth.store'
import { getSystemInitialized } from '@/router/system-init.state'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { AUTH_FLOW_ACCESS, AUTH_FLOW_SETUP, renderAuthSteps } from '@/shared/utils/auth/auth-flow.util'

const authStore = useAuthStore()
/** 商店地址（响应式）：坞脚那两格由它决定「渲染 / 不渲染」。 */
const { storeLinks } = useStoreLinks()

/**
 * 本机是否还没有任何账号（零用户首装）。
 *
 * **同步读路由守卫的结论**，不再自己发一次 `GET /setup/status`。
 *
 * 改前：初始 `false`，挂载后再探测，探测回来把 `needsSetup` 翻成 `true` —— 于是同一块面板
 * 先渲染成「登录」（轨道 01 登录 / 02 找回密码），再整体换成「首次开通」（轨道 01 初始化 /
 * 02 注册 / 03 激活），提示条与多出来的一排按钮又把面板撑高一截。这是登录页最明显的一次跳动。
 *
 * 现在守卫在**放行首个路由之前**就探完了（见 `router/system-init.state.ts`），本页读到的就是
 * 最终结论：首帧即最终形态，之后只允许文本变化。
 *
 * 只在 `=== false`（明确「本机零用户」）时成立：`null`（还没探测）与 `'offline'`（后端不可达）
 * 都按「已初始化」渲染 —— 那时宁可显示普通登录页，也不要在网络抖动时冒出一个「创建本机唯一
 * 账号」的主入口（在已初始化的机器上那是个死链，守卫会把人弹回 `/login`）。
 */
const needsSetup = getSystemInitialized() === false

/** 账号：可填用户名或注册邮箱，服务端按二者其一匹配。 */
const account = ref('')
const password = ref('')
const submitting = ref(false)
const errorMessage = ref('')

/**
 * 步骤轨道跟着页面使命走，而不是写死「回访」。
 *
 * 零用户时这一页其实在讲「开通」，主按钮也是「创建本机唯一账号」；此时还挂着
 * 「01 登录 / 02 找回密码」会替用户宣告「你是来登录的」，和按钮互相打架 ——
 * 轨道切到首次开通的三步，并把当前步标在「注册」上。
 */
const steps = computed(() =>
  needsSetup
    ? renderAuthSteps(AUTH_FLOW_SETUP, 'register')
    : renderAuthSteps(AUTH_FLOW_ACCESS, 'login'),
)
const stepsLabel = computed(() => (needsSetup ? '首次开通进度' : '账号访问进度'))

/** 坞脚里有没有商店入口：两格都取不到地址时整行不渲染（避免留下空行或孤立分隔条）。 */
const hasStoreLinks = computed(
  () => Boolean(storeLinks.value.passwordResetUrl) || Boolean(storeLinks.value.storeHomeUrl),
)

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
    await authStore.login(account.value.trim(), password.value)
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
    :steps-label="stepsLabel"
  >
    <template #scene><SceneStage page="login" /></template>

    <!-- 零用户首装：这台机器还没有任何账号，注册才是第一步。
         提示放在抬头块末尾（紧贴标题），按钮单独占一行放在表单之前 —— 登录表单仍然保留，
         因为「页面是登录页」这件事本身就要让人看懂，把表单藏起来反而像坏了。 -->
    <template #head-extra v-if="needsSetup">
      <p class="hos-notice hos-tone--eco" role="note">
        本机还没有账号。首次部署请先创建这台机器的唯一账号（只有这一个），
        注册完成后会自动打开商店购买授权。
      </p>
    </template>

    <div v-if="needsSetup" class="hos-actions">
      <a class="hos-btn-primary" href="/register">创建本机唯一账号</a>
    </div>

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
      <!-- 零用户时登录必然失败：先说清原因，别让人以为是密码错了。 -->
      <small v-if="needsSetup" class="login-setup-hint">账号创建之后才能用这里登录。</small>
    </form>

    <template #copy>
      <div class="hos-panel__meta">
        <span>失败多次临时限流</span>
        <i class="hos-panel__meta-sep" aria-hidden="true"></i>
        <span>未激活先进激活页</span>
      </div>
      <p>授权失效时不会丢账号：先进入激活页完成绑定，再回到这里。</p>
      <!-- 坞脚入口一律按 storeLinks 条件渲染，**不写占位 href**：地址取不到时这几格
           连同分隔条一起消失，而不是先指到一个不存在的地址（旧实现在这里是写死的
           127.0.0.1:8802，那指向访问者自己的电脑）。
           分隔条也逐格跟着前面那一格走：没有「前一格」就没有分隔条，避免出现孤立竖线。
           借用 .hos-panel__meta 的 flex 排布：分隔条是 1px 的 <i>，只有在 flex 容器里
           才拿得到宽度，否则会缩成看不见的一个点。 -->
      <p v-if="!needsSetup || hasStoreLinks" class="hos-panel__meta">
        <!-- 站内找回：改的是**本机**管理员密码（注册邮箱 + 商店代发验证码），
             不是商店账号。零用户时这一格是死链（没有任何账号可找回），直接不渲染。 -->
        <a v-if="!needsSetup" class="hos-text-button" href="/reset-password">忘记本机密码</a>
        <template v-if="storeLinks.passwordResetUrl">
          <i v-if="!needsSetup" class="hos-panel__meta-sep" aria-hidden="true"></i>
          <a class="hos-text-button" :href="storeLinks.passwordResetUrl" target="_blank"
            rel="noopener noreferrer">重置商店密码</a>
        </template>
        <template v-if="storeLinks.storeHomeUrl">
          <i v-if="!needsSetup || storeLinks.passwordResetUrl" class="hos-panel__meta-sep"
            aria-hidden="true"></i>
          <a class="hos-text-button" :href="storeLinks.storeHomeUrl" target="_blank"
            rel="noopener noreferrer">商店</a>
        </template>
      </p>
    </template>
  </AuthShell>
</template>

<style scoped>
/* 「账号创建之后才能用这里登录」：给零用户场景的登录按钮一句解释，字号压到与坞脚注释同级。 */
.login-setup-hint {
  display: block;
  margin-top: 10px;
  color: rgba(var(--hos-muted-rgb), 0.72);
  font-size: 0.78rem;
  line-height: 1.5;
  text-align: center;
}
</style>
