/**
 * @file useLoginView.ts
 * @module composables/auth
 * @description 登录视图 composable：封装登录表单状态、登录流程与 MFA 二步验证。
 *
 * 职责：
 * - 维护用户名 / 密码 / MFA 验证码 / 错误文案 / 加载态等表单状态；
 * - 处理登录流程（含 MFA 二步验证）：成功后按 redirect 跳转；
 * - 处理 401/403 等错误状态码，给出对应中文文案；
 * - 在挂载时检查系统是否已初始化，未初始化跳转安装向导。
 *
 * 依赖：
 * - vue（ref、onMounted）
 * - vue-router（useRouter）
 * - @/stores/auth.store（login / loginWithMfa）
 * - @/services/api/auth（getAuthStatus 检查初始化）
 * - @/utils/layout/nav-tabs.util（品牌 logo）
 * - @/utils/core/error-message（错误文案兜底）
 * - 包级 package.json（取版本号）
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { getAuthStatus } from '@/services/api/auth'
import { DEFAULT_BRAND_LOGO_URL } from '@/utils/layout/nav-tabs.util'
import { extractErrorMessage } from '@/utils/core/error-message'
import pkg from '../../../../package.json'

/**
 * 登录视图 composable。
 *
 * @returns pkgVersion 前端版本号；brandLogoUrl 品牌 logo URL；
 *          username/password/mfaCode 表单输入；requiresMfa 是否进入 MFA 二步；
 *          errorMsg 错误文案；isLoading 加载中标志；checkSetup 初始化检查中标志；showPassword 是否显示密码；
 *          handleLogin 登录处理方法
 */
export function useLoginView() {
  const router = useRouter()
  const authStore = useAuthStore()

  // 包版本与品牌 logo（模块级常量，无需响应式）
  const pkgVersion = pkg.version
  const brandLogoUrl = DEFAULT_BRAND_LOGO_URL

  const username = ref('')
  const password = ref('')
  const mfaCode = ref('')
  // 是否进入 MFA 二步验证（首次登录返回 requiresMfa 时置为 true）
  const requiresMfa = ref(false)
  const errorMsg = ref('')
  const isLoading = ref(false)
  // 初始化检查中标志：避免挂载期间闪现登录页
  const checkSetup = ref(true)
  const showPassword = ref(false)

  /**
   * 处理登录：先做客户端校验，再调用 authStore 登录；
   * 首次登录返回 requiresMfa 时进入 MFA 二步；MFA 成功后清空状态并跳转。
   */
  async function handleLogin() {
    if (!username.value.trim()) {
      errorMsg.value = '请输入用户名'
      return
    }
    if (password.value.length < 8) {
      errorMsg.value = '密码长度至少为 8 位'
      return
    }
    errorMsg.value = ''
    isLoading.value = true
    try {
      // 解析 redirect：仅允许以单个 / 开头的本站相对路径，防止开放重定向
      const redirectRaw = router.currentRoute.value.query.redirect
      const redirect =
        typeof redirectRaw === 'string' && redirectRaw.startsWith('/') && !redirectRaw.startsWith('//')
          ? redirectRaw
          : '/'
      if (requiresMfa.value) {
        if (!/^\d{6}$/.test(mfaCode.value)) {
          errorMsg.value = '请输入 6 位验证码'
          return
        }
        await authStore.loginWithMfa(username.value, password.value, mfaCode.value)
        // MFA 验证成功：重置 MFA 状态与验证码，避免登录页复用时残留旧状态
        requiresMfa.value = false
        mfaCode.value = ''
        router.push(redirect)
        return
      }
      const res = await authStore.login(username.value, password.value)
      // 后端要求 MFA：进入二步验证
      if (res?.requiresMfa) {
        requiresMfa.value = true
        return
      }
      router.push(redirect)
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status
      if (status === 401) {
        errorMsg.value = '用户名或密码错误'
      } else if (status === 403) {
        errorMsg.value = '账户已被锁定或禁止'
      } else {
        errorMsg.value = extractErrorMessage(e)
      }
    } finally {
      isLoading.value = false
    }
  }

  // 挂载时检查系统是否已初始化：未初始化则跳转安装向导
  onMounted(async () => {
    try {
      const res = await getAuthStatus()
      if (!res.data?.initialized) router.push('/setup')
    } catch {
      // 网络/5xx 不等于未安装，留在登录页避免误进安装向导
    } finally {
      checkSetup.value = false
    }
  })

  return {
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
  }
}
