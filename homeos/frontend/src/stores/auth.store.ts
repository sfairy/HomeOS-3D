/**
 * 认证状态管理 Store（homeos-3d 会话模型）
 *
 * HttpOnly Cookie 方案：会话令牌由服务端设置和管理，前端不接触敏感令牌。
 *
 * 职责：
 * - 维护当前登录用户、角色（HomeRole）与实体访问限制列表
 * - 持久化登录态到 localStorage（auth_user / auth_role / auth_restrictions）
 * - 提供登录 / 登出 / 会话保活 / 初始化状态检查
 * - 暴露实体访问鉴权工具：isEntityAllowed / canControl
 *
 * 与 homeos-3d 契约对应关系：
 * - 系统初始化状态 → ``GET /api/v1/setup/status``
 * - 登录 → ``POST /api/v1/auth/login``
 * - 登出 → ``POST /api/v1/auth/logout``
 * - 当前身份 / 会话保活 → ``GET /api/v1/auth/me``（服务端据此滑动续期）
 *
 * 依赖：
 * - @/services/api/auth：HTTP 接口
 * - @/utils/config/frontend-config：读取 frontend 配置段及监听变更
 * - @homeos/shared：实体鉴权工具 canControlEntity / isEntityAllowed
 * - @/utils/bridge/store-bridge：认证变化时通知实体 store 重建 WS 连接
 */
import { readLocalStorage, readLocalStorageJson, removeLocalStorage, writeLocalStorage, writeLocalStorageJson } from '@/utils/core/local-storage.util'

import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  getMe,
  getSetupStatus as apiGetSetupStatus,
  login as apiLogin,
  logout as apiLogout,
  setupAdmin,
} from '@/services/api/auth'
import { getConfigSection, onConfigChange } from '@/utils/config/frontend-config'
import { canControlEntity, isEntityAllowed as checkEntityAllowed } from '@homeos/shared'
import { notifyAuthChanged } from '@/utils/bridge/store-bridge'
import { bumpAuthGeneration } from '@/services/api-client'
import { logger } from '@/utils/core/logger'
import { schedulePoll } from '@/utils/core/poll-scheduler'
import type { AuthUserPayload, HomeRole } from '@/types/auth'

/**
 * 从 localStorage 读取当前用户的实体访问限制列表
 * @returns 限制实体 ID 数组；读取失败时返回空数组，避免阻塞登录流程
 */
function loadRestrictions(): string[] {
  return readLocalStorageJson<string[]>('auth_restrictions', [])
}

/**
 * 认证 Store：管理登录用户、角色、会话与实体访问权限
 *
 * 状态域：user / role / restrictions / isAuthenticated
 * 通过 setup 语法保持响应式 ref，所有动作均同步 localStorage 以支持刷新恢复。
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<string | null>(readLocalStorage('auth_user') || null)
  const role = ref<HomeRole | string>(readLocalStorage('auth_role') || 'admin')
  const restrictions = ref<string[]>(loadRestrictions())
  const isAuthenticated = ref(false)

  /**
   * 设置当前登录用户并同步到 localStorage
   * @param username - 用户名；传 null 表示登出，会清空所有认证相关 localStorage
   * @param userRole - 角色；登出时回退为 'admin'
   */
  function setUser(username: string | null, userRole?: HomeRole | string): void {
    user.value = username
    if (username) {
      writeLocalStorage('auth_user', username)
      if (userRole) {
        role.value = userRole
        writeLocalStorage('auth_role', userRole)
      }
    } else {
      removeLocalStorage('auth_user')
      removeLocalStorage('auth_role')
      removeLocalStorage('auth_restrictions')
      role.value = 'admin'
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
   * 返回当前访问上下文（角色 + 限制列表），供 shared 鉴权工具使用
   * @returns 包含 role 与 restrictions 的对象
   */
  function accessUser() {
    return { role: role.value, restrictions: restrictions.value }
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
   * 判断当前用户是否可以控制（操作）指定实体
   * @param entityId - 实体完整 ID
   * @returns 是否允许控制
   */
  function canControl(entityId: string): boolean {
    return canControlEntity(entityId, accessUser())
  }

  /** 当前是否为访客角色（homeos-3d 模型下恒为 false，保留以兼容既有调用点） */
  function isGuest(): boolean {
    return role.value === 'guest'
  }

  /** 只读视角（homeos-3d 单一管理员模型下恒为 false） */
  function isReadOnly(): boolean {
    return isGuest()
  }

  /** 家庭级写操作（模式切换、设置）：仅 admin / adult */
  function canManageHousehold(): boolean {
    return role.value === 'admin' || role.value === 'adult'
  }

  /**
   * 从登录 / 身份接口响应同步用户信息到本 store
   * @param data - 后端返回的用户信息；为空时直接返回
   */
  function syncAuthFromResponse(data: AuthUserPayload | null | undefined): void {
    if (!data) return
    if (data.username) setUser(data.username, data.role)
    else if (data.role) {
      role.value = data.role
      writeLocalStorage('auth_role', data.role)
    }
    if (Array.isArray(data.restrictions)) setRestrictions(data.restrictions)
    // 未携带 restrictions 时重置为默认权限集（空数组）：admin 空集放行全部。
    // 避免角色变化后上一会话的 restrictions 残留导致 canControl 按旧权限放行。
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
   * 用户名 + 密码登录
   * @param username - 用户名
   * @param password - 密码
   * @returns 后端返回的用户信息
   * @throws 当后端接口异常时抛出
   */
  async function login(username: string, password: string): Promise<AuthUserPayload> {
    const res = await apiLogin(username, password)
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
   * 系统首次初始化向导：创建管理员账号
   * @param usernameParam - 管理员用户名
   * @param passwordParam - 管理员密码
   * @param passwordConfirmationParam - 二次输入的管理员密码
   * @returns 后端响应数据
   */
  async function setup(
    usernameParam: string,
    passwordParam: string,
    passwordConfirmationParam: string,
  ) {
    const res = await setupAdmin(usernameParam, passwordParam, passwordConfirmationParam)
    bumpAuthGeneration()
    syncAuthFromResponse(res.data)
    isAuthenticated.value = true
    startSessionRefresh()
    reconnectEntitiesAfterAuthChange()
    return res.data
  }

  return {
    user,
    role,
    restrictions,
    isAuthenticated,
    login,
    logout,
    getSetupStatus,
    setup,
    refreshSession,
    startSessionRefresh,
    stopSessionRefresh,
    handleUnauthorized,
    setUser,
    setRestrictions,
    isEntityAllowed,
    canControl,
    isGuest,
    isReadOnly,
    canManageHousehold,
    accessUser,
  }
})
