<!--
组件：LoginView.vue
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
      <LoginBrandPanel :brand-logo-url="brandLogoUrl" :pkg-version="pkgVersion" />

      <LoginFormPanel
        v-model:username="username"
        v-model:password="password"
        v-model:mfa-code="mfaCode"
        v-model:show-password="showPassword"
        :check-setup="checkSetup"
        :requires-mfa="requiresMfa"
        :error-msg="errorMsg"
        :is-loading="isLoading"
        :handle-login="handleLogin"
      />
    </div>
  </ScaledViewport>
</template>

<script setup>
/**
 * 登录页面
 * 高大山 × 智能家居管理中枢：全幅场景 + 右侧悬浮接入坞。
 */
import { onMounted } from 'vue'
import ScaledViewport from '@/layouts/ScaledViewport.vue'
import LoginBrandPanel from '@/views/login/BrandPanel.vue'
import LoginFormPanel from '@/views/login/FormPanel.vue'
import { useLoginView } from '@/composables/auth/useLoginView'
import { scalingEnabled } from '@/composables/ui/useScaling'
import { isPhoneViewport } from '@/utils/config/viewport-breakpoints.util'
import '@/views/login/page.css'
import '@/views/login/brand.css'
import '@/views/login/form.css'

const {
  pkgVersion,
  brandLogoUrl,
  username,
  password,
  mfaCode,
  requiresMfa,
  errorMsg,
  isLoading,
  checkSetup,
  showPassword,
  handleLogin,
} = useLoginView()

// 手机视口（含横屏手机）下禁用整页等比缩放，避免登录页被 0.38 倍缩放裁切；
// 桌面 / 平板视口保持原有整页缩放表现不受影响
onMounted(() => {
  if (isPhoneViewport()) {
    scalingEnabled.value = false
  }
})
</script>
