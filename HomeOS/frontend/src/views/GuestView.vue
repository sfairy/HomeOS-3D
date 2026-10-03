<!--
  组件文件：GuestView.vue
  所属模块：frontend/src/views
  组件职责：访客凭证校验中转页。访客凭分享短码或 Token 访问此页，页面按状态分三栏展示：
    加载态显示 Spinner 与「正在验证访客凭证…」，错误态显示 ShieldX 与错误文案，
    成功态显示 ShieldCheck 与有效期并在 1.2 秒后自动跳转到仪表盘首页。
    通过 exchangeGuestCode（短码）或 guestLogin（Token）两个 API 接口获取会话，
    再由 useAuthStore.applyGuestLogin 写入访客角色凭证，useEntitiesStore.connect 建立实体实时连接。
  依赖关系：vue-router 的 useRoute/useRouter（读 query 参数与跳转）；
    services/api/auth 的 exchangeGuestCode 与 guestLogin；
    Pinia 的 useAuthStore（applyGuestLogin 写入访客身份）与 useEntitiesStore（连接实时数据）；
    ScaledViewport 缩放视口外壳；formatFullDateTime 格式化有效期、getApiErrorMessage 统一错误文案。
  注意事项：onMounted 启动校验，先处理 code 再处理 token；任何结果都写入 loading/error/expiresAt；
    onUnmounted 清理 redirectTimer，避免已卸载组件触发路由跳转。
-->
<template>
  <ScaledViewport>
    <div
      class="guest-root"
      :style="{
        '--page-accent': 'var(--module-accent-admin)',
        '--page-accent-rgb': 'var(--module-accent-admin-rgb)',
        '--page-accent-secondary': 'var(--module-accent-dashboard)',
        '--page-accent-secondary-rgb': 'var(--module-accent-dashboard-rgb)',
      }"
    >
      <div v-if="loading" class="guest-card">
        <Loader2 class="guest-spinner w-8 h-8 mx-auto" />
        <p class="guest-text guest-text--muted mt-4 text-center text-sm">
          {{ '正在验证访客凭证…' }}
        </p>
      </div>

      <div v-else-if="error" class="guest-card guest-card--error">
        <ShieldX class="guest-icon guest-icon--danger w-10 h-10 mx-auto" />
        <h1 class="guest-text guest-text--title mt-4 text-center text-lg font-bold">
          {{ '访问无效' }}
        </h1>
        <p class="guest-text guest-text--muted mt-2 text-center text-sm">{{ error }}</p>
      </div>

      <div v-else class="guest-card guest-card--ok">
        <ShieldCheck class="guest-icon guest-icon--ok w-10 h-10 mx-auto" />
        <h1 class="guest-text guest-text--title mt-4 text-center text-lg font-bold">
          {{ '访客模式' }}
        </h1>
        <p class="guest-text guest-text--muted mt-2 text-center text-sm">
          {{ '凭证有效，正在进入只读/受限面板…' }}
        </p>
        <p v-if="expiresAt" class="guest-text guest-text--micro mt-3 text-center text-[12px]">
          {{ '有效期至 {time}'.replace('{time}', formatFullDateTime(expiresAt)) }}
        </p>
      </div>
    </div>
  </ScaledViewport>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loader2, ShieldCheck, ShieldX } from '@lucide/vue'
import { exchangeGuestCode, guestLogin } from '@/services/api/auth'
import { useAuthStore } from '@/stores/auth.store'
import { useEntitiesStore } from '@/stores/entities.store'
import ScaledViewport from '@/layouts/ScaledViewport.vue'
import { formatFullDateTime } from '@/utils/format/locale-format.util'
import { getApiErrorMessage } from '@/utils/core/error-message'
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const entities = useEntitiesStore()

const loading = ref(true)
const error = ref('')
const expiresAt = ref('')
let redirectTimer = null

onMounted(async () => {
  const code = route.query.code
  const token = route.query.token
  if (code && typeof code === 'string') {
    try {
      const res = await exchangeGuestCode(code)
      auth.applyGuestLogin(res.data || {})
      expiresAt.value = res.data?.expiresAt || ''
      entities.connect()
      redirectTimer = setTimeout(() => router.replace('/'), 1200)
    } catch (e) {
      error.value = getApiErrorMessage(e, '访客短码无效或已过期')
    } finally {
      loading.value = false
    }
    return
  }
  if (!token || typeof token !== 'string') {
    loading.value = false
    error.value = '缺少访客凭证（请使用分享链接）'
    return
  }
  try {
    const res = await guestLogin(token)
    auth.applyGuestLogin(res.data || {})
    expiresAt.value = res.data?.expiresAt || ''
    entities.connect()
    redirectTimer = setTimeout(() => router.replace('/'), 1200)
  } catch (e) {
    error.value = getApiErrorMessage(e, '访客凭证无效或已过期')
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  if (redirectTimer) clearTimeout(redirectTimer)
})
</script>

<style scoped src="./styles/GuestView.css"></style>
