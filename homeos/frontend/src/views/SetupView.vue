<!--
组件：SetupView.vue
所属模块：frontend / src / views
-->
<template>
  <ScaledViewport>
    <div
      class="login-page"
      :style="{
        '--page-accent': 'var(--module-accent-login)',
        '--page-accent-rgb': 'var(--module-accent-login-rgb)',
        '--page-accent-secondary': 'var(--module-accent-login-sub)',
        '--page-accent-secondary-rgb': 'var(--module-accent-login-sub-rgb)',
      }"
    >
      <LoginBrandPanel
        :brand-logo-url="brandLogoUrl"
        :pkg-version="pkgVersion"
        live-label="首次部署就绪"
        ver-name="Setup"
        brand-title="智能家居管理中枢"
        brand-tag="初始化首个管理员 · 静默守护整屋"
        :signal-items="['数据库就绪', '待创建', '可部署']"
      />

      <aside class="login-dock">
        <div class="login-panel login-panel--setup animate-fade-in-up">
          <span class="login-panel__edge" aria-hidden="true" />
          <span class="login-panel__corner login-panel__corner--tl" aria-hidden="true" />
          <span class="login-panel__corner login-panel__corner--tr" aria-hidden="true" />
          <span class="login-panel__corner login-panel__corner--bl" aria-hidden="true" />
          <span class="login-panel__corner login-panel__corner--br" aria-hidden="true" />

          <div class="login-panel__head">
            <div class="login-panel__eyebrow-row">
              <p class="login-panel__eyebrow">首次运行引导</p>
              <span class="login-panel__secure">
                <i class="login-panel__secure-dot" aria-hidden="true" />
                本地初始化
              </span>
            </div>
            <h2 class="login-panel__title">创建管理员</h2>
            <p class="login-panel__desc">
              数据库尚无用户，请在此创建首个账号，系统将自动授予管理员权限。
            </p>
          </div>

          <div class="login-hub setup-hub" aria-hidden="true">
            <span class="login-hub__scan" />
            <div class="login-hub__item login-hub__item--secure">
              <div class="login-hub__top">
                <i class="login-hub__dot" />
                <span class="login-hub__code">01</span>
              </div>
              <span class="login-hub__name">创建账号</span>
            </div>
            <div class="login-hub__item login-hub__item--climate">
              <div class="login-hub__top">
                <i class="login-hub__dot" />
                <span class="login-hub__code">02</span>
              </div>
              <span class="login-hub__name">设置密码</span>
            </div>
            <div class="login-hub__item login-hub__item--scene">
              <div class="login-hub__top">
                <i class="login-hub__dot" />
                <span class="login-hub__code">03</span>
              </div>
              <span class="login-hub__name">完成部署</span>
            </div>
          </div>

          <form class="login-form" @submit.prevent="handleSetup">
            <div class="login-field">
              <label for="username">管理员账号</label>
              <div class="login-field__control">
                <input
                  id="username"
                  ref="usernameInput"
                  v-model="adminUsername"
                  type="text"
                  autocomplete="username"
                  class="login-input"
                  placeholder="例如：admin"
                  required
                />
              </div>
            </div>

            <div class="login-field">
              <label for="password">设置密码</label>
              <div class="login-field__control login-pw">
                <input
                  id="password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  class="login-input login-input--secret"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  class="login-pw__btn"
                  :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                  :aria-pressed="showPassword"
                  @click="showPassword = !showPassword"
                >
                  <Eye v-if="!showPassword" class="w-4 h-4" />
                  <EyeOff v-else class="w-4 h-4" />
                </button>
              </div>
            </div>

            <div class="login-field">
              <label for="confirm">确认密码</label>
              <div class="login-field__control login-pw">
                <input
                  id="confirm"
                  v-model="confirmPassword"
                  :type="showConfirmPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  class="login-input login-input--secret"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  class="login-pw__btn"
                  :aria-label="showConfirmPassword ? '隐藏密码' : '显示密码'"
                  :aria-pressed="showConfirmPassword"
                  @click="showConfirmPassword = !showConfirmPassword"
                >
                  <Eye v-if="!showConfirmPassword" class="w-4 h-4" />
                  <EyeOff v-else class="w-4 h-4" />
                </button>
              </div>
            </div>

            <Transition name="fade">
              <div v-if="errorMsg" class="login-error" role="alert">
                <p>{{ errorMsg }}</p>
              </div>
            </Transition>

            <button type="submit" :disabled="isLoading" class="login-submit">
              <span class="login-submit__sheen" aria-hidden="true" />
              <span>{{ isLoading ? '正在初始化…' : '完成部署并进入系统' }}</span>
            </button>
          </form>

          <div class="login-panel__copy">
            <div class="login-panel__meta">
              <span>本地鉴权</span>
              <i class="login-panel__meta-sep" aria-hidden="true" />
              <span>管理员角色</span>
              <i class="login-panel__meta-sep" aria-hidden="true" />
              <span>首次部署</span>
            </div>
            <p>版权所有：一埖一丗堺</p>
            <p>程序开发：方长鑫</p>
          </div>
        </div>
      </aside>
    </div>
  </ScaledViewport>
</template>

<script setup>
/**
 * 系统初始化设置页面
 * 仅首次运行时显示，用于创建管理员账号。与登录页共用同一套场景背景与接入坞视觉语言。
 *
 * 安全要求：
 * - 两次密码必须一致
 * - 密码至少 8 位，且须同时包含字母和数字
 * - 成功后跳转到连接设置页
 */
import { onMounted, ref, nextTick } from 'vue'
import { Eye, EyeOff } from '@lucide/vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { markSystemInitialized } from '@/router/index'
import { extractErrorMessage } from '@/utils/core/error-message'
import ScaledViewport from '@/layouts/ScaledViewport.vue'
import LoginBrandPanel from '@/views/login/BrandPanel.vue'
import { DEFAULT_BRAND_LOGO_URL } from '@/utils/layout/nav-tabs.util'
import pkg from '../../package.json'
import '@/views/login/page.css'
import '@/views/login/brand.css'
import '@/views/login/form.css'

const pkgVersion = pkg.version
const brandLogoUrl = DEFAULT_BRAND_LOGO_URL

const router = useRouter()
const authStore = useAuthStore()

// 用户名由安装界面填写，不预填；首个账号后端固定为 admin 角色
const adminUsername = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const errorMsg = ref('')
const isLoading = ref(false)

const usernameInput = ref(null)

async function handleSetup() {
  const username = adminUsername.value.trim()
  if (!username) {
    errorMsg.value = '请输入管理员账号'
    return
  }
  if (password.value !== confirmPassword.value) {
    errorMsg.value = '两次输入的密码不一致'
    return
  }
  if (password.value.length < 8 || !/[a-zA-Z]/.test(password.value) || !/\d/.test(password.value)) {
    errorMsg.value = '密码至少 8 位，且须同时包含字母和数字'
    return
  }
  errorMsg.value = ''
  isLoading.value = true
  try {
    await authStore.setup(username, password.value)
    markSystemInitialized()
    router.push({ path: '/settings', query: { tab: 'connection' } })
  } catch (e) {
    errorMsg.value = extractErrorMessage(e)
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await nextTick()
  usernameInput.value?.focus?.()
})
</script>

<style scoped src="./styles/SetupView.css"></style>
