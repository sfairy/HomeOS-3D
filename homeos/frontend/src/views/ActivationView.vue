<!--
组件：ActivationView.vue
商业授权激活页（联网租约：购买邮箱 + 激活码）：与登录页同款场景 + 右侧激活坞
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
        live-label="授权激活就绪"
        ver-name="Activate"
        brand-title="商业授权激活"
        brand-tag="商店下单 · 邮箱 + 激活码 · 联网租约"
        :signal-items="['下单邮箱', '激活码', '可激活']"
      />

      <aside class="login-dock">
        <div class="act-panel animate-fade-in-up">
          <span class="act-panel__edge" aria-hidden="true" />
          <span class="act-panel__corner act-panel__corner--tl" aria-hidden="true" />
          <span class="act-panel__corner act-panel__corner--tr" aria-hidden="true" />
          <span class="act-panel__corner act-panel__corner--bl" aria-hidden="true" />
          <span class="act-panel__corner act-panel__corner--br" aria-hidden="true" />

          <div class="act-panel__head">
            <div class="act-panel__eyebrow-row">
              <p class="act-panel__eyebrow">商业授权</p>
              <span class="act-panel__secure">
                <i class="act-panel__secure-dot" aria-hidden="true" />
                联网租约
              </span>
            </div>
            <h2 class="act-panel__title">激活系统</h2>
            <p class="act-panel__desc">
              填写商店下单时使用的邮箱与收到的激活码，激活后系统自动续租并定期在线校验。
            </p>
          </div>

          <div class="act-hub" aria-label="激活步骤">
            <span class="act-hub__scan" aria-hidden="true" />
            <div class="act-hub__item" :class="{ 'act-hub__item--done': Boolean(email.trim()) }">
              <div class="act-hub__top">
                <i class="act-hub__dot" />
                <span class="act-hub__code">01</span>
              </div>
              <span class="act-hub__name">填写邮箱</span>
            </div>
            <div class="act-hub__item" :class="{ 'act-hub__item--done': Boolean(code.trim()) }">
              <div class="act-hub__top">
                <i class="act-hub__dot" />
                <span class="act-hub__code">02</span>
              </div>
              <span class="act-hub__name">输入激活码</span>
            </div>
            <div
              class="act-hub__item"
              :class="{ 'act-hub__item--active': Boolean(email.trim()) && Boolean(code.trim()) }"
            >
              <div class="act-hub__top">
                <i class="act-hub__dot" />
                <span class="act-hub__code">03</span>
              </div>
              <span class="act-hub__name">激活系统</span>
            </div>
          </div>

          <section class="act-block">
            <div class="act-block-head">
              <label class="act-label" for="act-email">购买邮箱</label>
              <span class="act-hint">商店下单账号</span>
            </div>
            <input
              id="act-email"
              v-model="email"
              class="act-input"
              type="email"
              inputmode="email"
              autocomplete="email"
              spellcheck="false"
              placeholder="you@example.com"
            />
          </section>

          <section class="act-block act-block--last">
            <div class="act-block-head">
              <label class="act-label" for="act-code">激活码</label>
              <span class="act-hint">{{ expiresHint || codeHint || '订单邮件 / 商店后台可查' }}</span>
            </div>
            <input
              id="act-code"
              v-model="code"
              class="act-input act-input--code"
              type="text"
              autocomplete="one-time-code"
              spellcheck="false"
              placeholder="XXXX-XXXX-XXXX-XXXX"
              @keyup.enter="handleActivate"
            />
          </section>

          <div v-if="errorMsg" class="act-error" role="alert">{{ errorMsg }}</div>

          <button
            type="button"
            class="act-submit"
            :disabled="!canSubmit"
            @click="handleActivate"
          >
            <span class="act-submit__sheen" aria-hidden="true" />
            <span v-if="isLoading" class="act-spinner" aria-hidden="true" />
            <span>{{ isLoading ? '正在激活…' : '激活系统' }}</span>
          </button>

          <div class="act-panel__copy">
            <div class="act-panel__meta">
              <span>联网租约</span>
              <i class="act-panel__meta-sep" aria-hidden="true" />
              <span>一机一证</span>
              <i class="act-panel__meta-sep" aria-hidden="true" />
              <span>在线验签</span>
            </div>
            <p>版权所有：一埖一丗堺</p>
            <p>程序开发：方长鑫</p>
            <p>激活码为一次性凭据 · 换机请联系发卡方 · HomeOS v{{ pkgVersion }}</p>
          </div>
        </div>
      </aside>
    </div>
  </ScaledViewport>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ScaledViewport from '@/layouts/ScaledViewport.vue'
import LoginBrandPanel from '@/views/login/BrandPanel.vue'
import { DEFAULT_BRAND_LOGO_URL } from '@/utils/layout/nav-tabs.util'
import { activateLicense, getLicenseStatus } from '@/services/api/license'
import { extractErrorMessage } from '@/utils/core/error-message'
import { markLicenseActivated } from '@/router/license-gate'
import pkg from '../../package.json'
import '@/views/login/page.css'
import '@/views/login/brand.css'
import '@/views/login/form.css'

const pkgVersion = pkg.version
const brandLogoUrl = DEFAULT_BRAND_LOGO_URL
const router = useRouter()

/** 商店下单邮箱 */
const email = ref('')
/** 商店发放的激活码 */
const code = ref('')
const errorMsg = ref('')
const isLoading = ref(false)
/** 激活成功后展示的有效期提示（跳转前短暂可见） */
const expiresHint = ref('')
/** 上次激活码提示（如后四位），来自授权状态 */
const codeHint = ref('')

const canSubmit = computed(
  () => Boolean(email.value.trim()) && Boolean(code.value.trim()) && !isLoading.value,
)

function formatExpiresHint(expiresAt: string | null | undefined) {
  if (expiresAt == null) return '有效期：永久'
  const ms = Date.parse(expiresAt)
  if (!Number.isFinite(ms)) return ''
  return `有效期至 ${new Date(ms).toLocaleString()}`
}

/** 归一化激活码：去掉粘贴带入的空白字符，保留连字符等有效字符 */
function normalizeCode(raw: string) {
  return String(raw || '').replace(/\s+/g, '')
}

onMounted(async () => {
  try {
    const status = await getLicenseStatus()
    if (!status.data.required || status.data.allowed) {
      markLicenseActivated(true)
      router.replace('/')
      return
    }
    // 预填上次使用的下单邮箱与激活码提示，便于重新激活
    email.value = status.data.activationEmail || ''
    codeHint.value = status.data.activationCodeHint || ''
  } catch (e) {
    errorMsg.value = extractErrorMessage(e)
  }
})

async function handleActivate() {
  errorMsg.value = ''
  const mail = email.value.trim()
  const activationCode = normalizeCode(code.value)
  code.value = activationCode
  if (!mail || !activationCode) {
    errorMsg.value = '请填写购买邮箱与激活码'
    return
  }
  isLoading.value = true
  try {
    const activated = await activateLicense(mail, activationCode)
    expiresHint.value = formatExpiresHint(activated.data?.leaseExpiresAt)
    const status = await getLicenseStatus()
    if (!status.data.required || status.data.allowed) {
      markLicenseActivated(true)
      router.push('/')
    } else {
      markLicenseActivated(false)
      errorMsg.value = '激活未生效，请确认邮箱与激活码后重试'
    }
  } catch (e) {
    markLicenseActivated(false)
    errorMsg.value = extractErrorMessage(e)
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped src="./styles/ActivationView.css"></style>
