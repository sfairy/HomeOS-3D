/** 认证状态管理 Store（homeos-3d 会话模型） */
import { readLocalStorage, readLocalStorageJson, removeLocalStorage, writeLocalStorage, writeLocalStorageJson } from '@/shared/utils/core/local-storage.util'

import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  getMe,
  getSetupStatus as apiGetSetupStatus,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  sendVerificationCode as apiSendVerificationCode,
} from '@/services/api/auth'
import type { RegisterPayload } from '@/services/api/auth'
import { getConfigSection, onConfigChange } from '@/shared/utils/config/frontend-config'
import { isEntityAllowed as checkEntityAllowed } from '@homeos/shared'
import { notifyAuthChanged } from '@/shared/utils/bridge/store-bridge'
import { bumpAuthGeneration } from '@/services/api/client'
import { setLicenseFeatureAccess } from '@/router/license-gate'
import { logger } from '@/shared/utils/core/logger'
import { schedulePoll } from '@/shared/utils/core/poll-scheduler'
import type { AuthUserPayload } from '@/shared/types/auth'

/**
 * 从 localStorage 读取当前用户的实体访问限制列表
 * @returns 限制实体 ID 数组；读取失败时返回空数组，避免阻塞登录流程
 */
function loadRestrictions(): string[] {
  return readLocalStorageJson<string[]>('auth_restrictions', [])
}

/**
 * 认证 Store：管理登录用户、会话与实体访问权限
 *
 * 状态域：user / restrictions / isAuthenticated
 * 通过 setup 语法保持响应式 ref，所有动作均同步 localStorage 以支持刷新恢复。
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<string | null>(readLocalStorage('auth_user') || null)
  const restrictions = ref<string[]>(loadRestrictions())
  const isAuthenticated = ref(false)

  /**
   * 设置当前登录用户并同步到 localStorage
   * @param username - 用户名；传 null 表示登出，会清空所有认证相关 localStorage
   */
  function setUser(username: string | null): void {
    user.value = username
    if (username) {
      writeLocalStorage('auth_user', username)
    } else {
      removeLocalStorage('auth_user')
      removeLocalStorage('auth_restrictions')
      restrictions.value = []
    }
  }

  /**
   * 设置实体访问限制列表
   * @param list - 实体 ID 数组；非数组时回退为空数组
   */
  function setRestrictions(list: string[]): void {
    restrictions.value = Array.isArray(list) ? list : []
    writeLocalStorageJson('auth_restrictions', restrictions.value)
  }

  /**
   * 返回当前访问上下文（限制列表），供 shared 鉴权工具使用
   * @returns 包含 restrictions 的对象
   */
  function accessUser() {
    return { restrictions: restrictions.value }
  }

  /**
   * 判断当前用户是否被允许查看指定实体
   * @param entityId - 实体完整 ID
   * @returns 是否允许查看
   */
  function isEntityAllowed(entityId: string): boolean {
    return checkEntityAllowed(entityId, accessUser())
  }

  /**
   * 从登录 / 身份接口响应同步用户信息到本 store
   * @param data - 后端返回的用户信息；为空时直接返回
   */
  function syncAuthFromResponse(data: AuthUserPayload | null | undefined): void {
    if (!data) return
    if (data.username) setUser(data.username)
    if (Array.isArray(data.restrictions)) setRestrictions(data.restrictions)
    // 未携带 restrictions 时重置为默认权限集（空数组）：空集放行全部。
    // 避免上一会话的 restrictions 残留导致 isEntityAllowed 按旧权限放行。
    else setRestrictions([])
  }

  /**
   * 通知实体 store 认证状态已变化，需要重建 WS 订阅
   * 副作用：触发 entities store 的 reconnectForAuthChange
   */
  function reconnectEntitiesAfterAuthChange(): void {
    notifyAuthChanged()
  }

  /**
   * 账号（用户名或注册邮箱）+ 密码登录
   * @param account - 用户名或注册邮箱，二者任填其一
   * @param password - 密码
   * @returns 后端返回的用户信息
   * @throws 当后端接口异常时抛出
   */
  async function login(account: string, password: string): Promise<AuthUserPayload> {
    const res = await apiLogin(account.trim(), password)
    bumpAuthGeneration()
    syncAuthFromResponse(res.data)
    isAuthenticated.value = true
    startSessionRefresh()
    reconnectEntitiesAfterAuthChange()
    return res.data
  }

  /**
   * 登出当前用户并清理本地状态
   * 副作用：调用后端 logout 接口（失败忽略）、停止会话刷新、清除用户信息
   */
  async function logout(): Promise<void> {
    try {
      await apiLogout()
    } catch {
      /* 忽略后端登出错误，仍然清理本地态 */
    }
    bumpAuthGeneration()
    setUser(null)
    isAuthenticated.value = false
    stopSessionRefresh()
    // 功能码明细随会话失效：留着会让下一个登录者的导航按上一个账号的授权渲染。
    setLicenseFeatureAccess(null)
    // 断开旧用户的实体 WS 订阅并清空实体缓存：
    // reconnectForAuthChange 内部 connect() 在未认证时直接跳过，此处仅执行断开 + 清空
    reconnectEntitiesAfterAuthChange()
  }

  /**
   * 处理 401 未授权场景：标记未认证并清理用户信息
   * 调用场景：HTTP 拦截器检测到 401 时
   */
  function handleUnauthorized(): void {
    bumpAuthGeneration()
    isAuthenticated.value = false
    setUser(null)
    stopSessionRefresh()
    // 会话失效即清空功能码明细，避免 401 后导航仍按旧授权显隐
    setLicenseFeatureAccess(null)
    // 401 后同样断开实体 WS 并清空实体，避免残留旧用户的连接与订阅
    reconnectEntitiesAfterAuthChange()
  }

  /**
   * 进行中的登录态探测。
   *
   * ``GET /auth/me`` 同时是会话续期端点，并发触发会重复续期、并把 401 重复打进控制台，
   * 因此并发调用共用同一个 Promise（与 api-client 的 CSRF bootstrap 同一思路）。
   */
  let probePromise: Promise<void> | null = null

  /**
   * 探测当前登录态
   *
   * 未登录时的 401 属正常分支：只落 ``isAuthenticated=false``，不触发全局登出流程。
   */
  async function probeSession(): Promise<void> {
    if (!probePromise) {
      probePromise = getMe({ skipAuthRedirect: true })
        .then((me) => {
          isAuthenticated.value = true
          syncAuthFromResponse(me.data)
        })
        .catch(() => {
          isAuthenticated.value = false
          setUser(null)
        })
        .finally(() => {
          probePromise = null
        })
    }
    return probePromise
  }

  /**
   * 获取系统初始化状态与当前登录态（homeos-3d 语义）
   *
   * ``GET /setup/status`` 只回 ``initialized``；是否已登录用 ``GET /auth/me`` 探测。
   *
   * 未初始化时**不探测**：这台机器上还没有任何账号，任何会话都不可能成立，
   * ``GET /auth/me`` 必然 401，只会凭空在控制台留一条误导性的 Unauthorized。
   *
   * @returns 系统是否已初始化
   */
  async function getSetupStatus(): Promise<boolean | undefined> {
    const res = await apiGetSetupStatus()
    if (res.data.initialized) {
      await probeSession()
    } else {
      isAuthenticated.value = false
      setUser(null)
    }
    return res.data.initialized
  }

  /**
   * 刷新当前会话
   *
   * ``GET /auth/me`` 同时是会话保活入口：服务端在 ``lastSeenAt`` 超过阈值时滑动续期。
   * 未认证时跳过；401 时静默返回（由 401 流程统一处理），避免重复弹窗。
   */
  async function refreshSession(): Promise<void> {
    if (!isAuthenticated.value) return
    try {
      const res = await getMe({ skipAuthRedirect: true })
      syncAuthFromResponse(res.data)
    } catch (e: unknown) {
      const status =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { status?: number } }).response?.status
          : undefined
      if (status === 401) return
      logger.debug('会话刷新失败（非 401），沿用当前登录态', e)
    }
  }

  // 会话刷新轮询任务的取消函数（经全局调度器驱动，后台常驻）
  let _refreshCancel: (() => void) | null = null

  /**
   * 计算会话刷新周期（毫秒）
   * @returns sessionRefreshHours * 3600 * 1000；配置无效时回退为 6 小时
   */
  function sessionRefreshMs(): number {
    const h = getConfigSection('frontend')?.sessionRefreshHours
    return (typeof h === 'number' && h > 0 ? h : 6) * 60 * 60 * 1000
  }

  /**
   * 启动会话刷新轮询（若已存在则先取消）
   * @param opts.runImmediately 为 false 时跳过 schedulePoll 的错峰首跑
   *   （调用方已显式 refreshSession 时避免双发竞态）
   */
  function startSessionRefresh(opts?: { runImmediately?: boolean }): void {
    if (_refreshCancel) _refreshCancel()
    const runImmediately = opts?.runImmediately !== false
    // 会话保活属后台常驻服务，页面隐藏时仍需保持（visibilityAware:false）
    _refreshCancel = schedulePoll(
      'auth:session-refresh',
      () => {
        void refreshSession()
      },
      sessionRefreshMs(),
      { visibilityAware: false, runImmediately },
    )
  }

  // 监听 frontend 配置变化：sessionRefreshHours 改动后重启轮询任务
  onConfigChange((sections?: string[] | null) => {
    if (!sections || sections.includes('frontend')) {
      startSessionRefresh()
    }
  })

  /** 停止会话刷新轮询任务 */
  function stopSessionRefresh(): void {
    if (_refreshCancel) {
      _refreshCancel()
      _refreshCancel = null
    }
  }

  /**
   * 请求注册邮箱验证码（商店服务器代发）
   * @param email - 接收验证码的邮箱
   * @returns 发码结果（含重发冷却秒数）
   */
  async function sendVerificationCode(email: string) {
    const res = await apiSendVerificationCode(email)
    return res.data
  }

  /**
   * 系统首次初始化向导：注册本机唯一账号
   *
   * 登录字段：账号（用户名或邮箱）+ 密码；首次注册成功后注册入口即关闭。
   *
   * @param payload - 注册请求体（账号 / 邮箱 / 验证码 / 密码 / 确认密码）
   * @returns 后端响应数据
   */
  async function register(payload: RegisterPayload) {
    const res = await apiRegister(payload)
    bumpAuthGeneration()
    syncAuthFromResponse(res.data)
    isAuthenticated.value = true
    startSessionRefresh()
    reconnectEntitiesAfterAuthChange()
    return res.data
  }

  return {
    user,
    restrictions,
    isAuthenticated,
    login,
    logout,
    getSetupStatus,
    register,
    sendVerificationCode,
    refreshSession,
    startSessionRefresh,
    stopSessionRefresh,
    handleUnauthorized,
    setUser,
    setRestrictions,
    isEntityAllowed,
    accessUser,
  }
})
