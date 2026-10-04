/**
 * 认证状态管理 Store
 *
 * HttpOnly Cookie 方案：Token 由服务端设置和管理，前端不接触敏感令牌。
 *
 * 职责：
 * - 维护当前登录用户名、角色（HomeRole）、实体访问限制列表
 * - 持久化登录态到 localStorage（auth_user / auth_role / auth_restrictions）
 * - 提供登录 / MFA 二次验证 / 登出 / 会话刷新 / 初始化向导 / 资料更新 / 修改密码等动作
 * - 维护会话保活定时器（按 frontend.sessionRefreshHours 周期刷新）
 * - 暴露实体访问鉴权工具：isEntityAllowed / canControl / isGuest / isReadOnly
 *
 * 依赖：
 * - @/services/api/auth：HTTP 接口（login、verifyMfa、logout、getAuthStatus 等）
 * - @/utils/config/frontend-config：读取 frontend 配置段及监听变更
 * - @homeos/shared：实体鉴权工具 canControlEntity / isEntityAllowed
 * - @/utils/bridge/store-bridge：认证变化时通知实体 store 重建 WS 连接
 * - @/utils/core/error-message：统一 API 错误消息提取
 */
import { readLocalStorage, readLocalStorageJson, removeLocalStorage, writeLocalStorage, writeLocalStorageJson } from '@/utils/core/local-storage.util'

import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  login as apiLogin,
  verifyMfa as apiVerifyMfa,
  logout as apiLogout,
  getAuthStatus,
  refreshSession as apiRefreshSession,
  setupAuth,
  updateAuthProfile,
} from '@/services/api/auth'
import { getConfigSection, onConfigChange } from '@/utils/config/frontend-config'
import { canControlEntity, isEntityAllowed as checkEntityAllowed } from '@homeos/shared'
import { notifyAuthChanged } from '@/utils/bridge/store-bridge'
import { bumpAuthGeneration } from '@/services/api-client'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { logger } from '@/utils/core/logger'
import { schedulePoll } from '@/utils/core/poll-scheduler'
import type {
  AuthUserPayload,
  ChangePasswordResult,
  GuestLoginPayload,
  HomeRole,
  LoginResult,
} from '@/types/auth'

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
function loadAllowedSceneIds(): string[] {
  try {
    const raw = sessionStorage.getItem('homeos_guest_allowed_scenes')
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

/** useAuthStore：Pinia store 工厂，状态与动作见定义。 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<string | null>(readLocalStorage('auth_user') || null)
  const role = ref<HomeRole | string>(readLocalStorage('auth_role') || 'guest')
  const restrictions = ref<string[]>(loadRestrictions())
  const allowedSceneIds = ref<string[]>(loadAllowedSceneIds())
  const isAuthenticated = ref(false)

  /** 儿童模式门闩：与后端 ChildModeService.canControl 对齐 */
  const childModeGate = ref<{
    enabled: boolean
    overrideActive: boolean
    inAllowedWindow: boolean
    deviceWhitelist: string[]
    dailyMediaLimitMin: number
    mediaUsedMin: number
  } | null>(null)

  /**
   * 设置当前登录用户并同步到 localStorage
   * @param username - 用户名；传 null 表示登出，会清空所有认证相关 localStorage
   * @param userRole - 角色；登出时回退为 'guest'
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
      sessionStorage.removeItem('homeos_guest_allowed_scenes')
      role.value = 'guest'
      restrictions.value = []
      allowedSceneIds.value = []
      childModeGate.value = null
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

  function setAllowedSceneIds(list: string[]): void {
    allowedSceneIds.value = Array.isArray(list) ? list.map(String).filter(Boolean) : []
    try {
      sessionStorage.setItem('homeos_guest_allowed_scenes', JSON.stringify(allowedSceneIds.value))
    } catch {
      /* sessionStorage 不可用时仅保留内存 */
    }
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
    if (!canControlEntity(entityId, accessUser())) return false
    const g = childModeGate.value
    if (!g?.enabled || g.overrideActive) return true
    if (g.deviceWhitelist.length > 0) {
      if (!g.deviceWhitelist.includes(entityId)) return false
      if (!g.inAllowedWindow) return false
    }
    if (g.dailyMediaLimitMin > 0 && entityId.startsWith('media_player.')) {
      if (g.mediaUsedMin >= g.dailyMediaLimitMin) return false
    }
    return true
  }

  /** 同步儿童模式状态到门闩（主布局轮询 / WS 推送） */
  function setChildModeGate(status: Record<string, unknown> | null | undefined): void {
    if (!status) {
      childModeGate.value = null
      return
    }
    childModeGate.value = {
      enabled: status.enabled === true,
      overrideActive: status.overrideActive === true,
      inAllowedWindow: status.inAllowedWindow === true,
      deviceWhitelist: Array.isArray(status.deviceWhitelist)
        ? status.deviceWhitelist.map(String)
        : [],
      dailyMediaLimitMin: Number(status.dailyMediaLimitMin) || 0,
      mediaUsedMin: Number(status.mediaUsedMin) || 0,
    }
  }
  /** 当前是否为访客角色 */
  function isGuest(): boolean {
    return role.value === 'guest'
  }

  /** 访客只读（地震关闭 / 白名单场景由后端 GuestWrite 开口，UI 单独放行） */
  function isReadOnly(): boolean {
    return isGuest()
  }

  /** 家庭级写操作（模式切换、设置）：仅 admin / adult */
  function canManageHousehold(): boolean {
    return role.value === 'admin' || role.value === 'adult'
  }

  /**
   * 从登录 / 刷新接口响应同步用户信息到本 store
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
    // 未携带 restrictions 时重置为默认权限集（空数组）：
    // admin 空集放行全部；guest/child 空集默认不可见不可控；adult 空集由 shared 层按无限制处理。
    // 避免角色降级（如 admin→普通用户）后上一会话的 restrictions 残留导致 canControl 按旧权限放行。
    else setRestrictions([])
    if (Array.isArray(data.allowedSceneIds)) setAllowedSceneIds(data.allowedSceneIds)
    else if (data.role !== 'guest') setAllowedSceneIds([])
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
   * @returns 登录结果；若需要 MFA 则返回 requiresMfa=true
   * @throws 当后端接口异常时抛出
   */
  async function login(username: string, password: string): Promise<LoginResult> {
    const res = await apiLogin(username, password)
    if (res.data?.requiresMfa) {
      return { requiresMfa: true, username: res.data.username || username }
    }
    bumpAuthGeneration()
    syncAuthFromResponse(res.data)
    isAuthenticated.value = true
    startSessionRefresh()
    reconnectEntitiesAfterAuthChange()
    return res.data
  }

  /**
   * 通过 MFA 验证码完成登录
   * @param username - 用户名
   * @param password - 密码
   * @param code - MFA 验证码
   * @returns 后端登录响应数据
   */
  async function loginWithMfa(username: string, password: string, code: string) {
    const res = await apiVerifyMfa(username, password, code)
    bumpAuthGeneration()
    syncAuthFromResponse(res.data)
    isAuthenticated.value = true
    startSessionRefresh()
    reconnectEntitiesAfterAuthChange()
    return res.data
  }

  /**
   * 应用访客登录态。仅允许在 `guestLogin` / `exchangeGuestCode` **成功之后**调用。
   * @param payload - 访客登录载荷，可携带实体访问限制
   */
  function applyGuestLogin(payload?: GuestLoginPayload): void {
    bumpAuthGeneration()
    setRestrictions(payload?.restrictions || [])
    setAllowedSceneIds(payload?.allowedSceneIds || [])
    setUser('访客', 'guest')
    isAuthenticated.value = true
    startSessionRefresh()
    reconnectEntitiesAfterAuthChange()
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
   * 获取系统初始化状态与当前认证状态
   * @returns 系统是否已初始化（undefined 表示后端未返回）
   */
  async function getSetupStatus(): Promise<boolean | undefined> {
    const res = await getAuthStatus()
    isAuthenticated.value = res.data.authenticated === true
    if (res.data.authenticated) {
      syncAuthFromResponse(res.data)
    } else if (res.data.username && !user.value) {
      setUser(res.data.username)
    }
    return res.data.initialized
  }

  /**
   * 刷新当前会话（按定时器周期调用）
   * 未认证时跳过；接口失败时由 401 流程处理，避免重复弹窗
   */
  async function refreshSession(): Promise<void> {
    if (!isAuthenticated.value) return
    try {
      const res = await apiRefreshSession()
      syncAuthFromResponse(res?.data)
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
   * @returns 后端响应数据
   */
  async function setup(usernameParam: string, passwordParam: string) {
    const res = await setupAuth(usernameParam, passwordParam)
    bumpAuthGeneration()
    syncAuthFromResponse(res.data)
    isAuthenticated.value = true
    startSessionRefresh()
    reconnectEntitiesAfterAuthChange()
    return res.data
  }

  /**
   * 更新当前用户资料（用户名）
   * @param data - 待更新字段；包含 username 时同步本地
   * @returns 后端响应数据
   */
  async function updateProfile(data: { username?: string }) {
    const res = await updateAuthProfile(data)
    if (data.username) setUser(data.username)
    return res.data
  }

  /**
   * 修改当前用户密码
   * @param currentPassword - 当前密码
   * @param newPassword - 新密码
   * @returns 修改结果对象：{ ok: boolean, message?: string }
   */
  async function changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<ChangePasswordResult> {
    try {
      await updateAuthProfile({ currentPassword, password: newPassword })
      return { ok: true }
    } catch (e) {
      const message = getApiErrorMessage(e, '')
      return {
        ok: false,
        message: Array.isArray(message) ? String(message[0]) : message || '密码修改失败',
      }
    }
  }

  return {
    user,
    role,
    restrictions,
    allowedSceneIds,
    isAuthenticated,
    login,
    loginWithMfa,
    logout,
    getSetupStatus,
    setup,
    updateProfile,
    changePassword,
    refreshSession,
    startSessionRefresh,
    stopSessionRefresh,
    handleUnauthorized,
    setUser,
    setRestrictions,
    applyGuestLogin,
    isEntityAllowed,
    canControl,
    setChildModeGate,
    isGuest,
    isReadOnly,
    canManageHousehold,
    accessUser,
  }
})