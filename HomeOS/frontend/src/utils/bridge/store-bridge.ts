/**
 * Store 桥接：打破 api / auth / entities / ui 之间的循环依赖。
 * 在 main.ts 安装 Pinia 后注册具体实现。
 *
 * 所属模块：全局桥接层
 * 职责：以注册回调的方式，让非 store 模块（如 api 拦截器、socket 处理器）能够
 *   间接调用 store / router / UI 通知等能力，避免直接 import 导致的循环依赖。
 * 依赖：vue（ref）、notify 类型、core/logger。
 */
import { ref } from 'vue'
import type { NotifyType } from '@/types/notify'
import { logger } from '@/utils/core/logger'

type VoidHandler = () => void
type NotifyHandler = (message: string, type?: NotifyType, duration?: number) => void
/** 安防面板 Socket 推送的负载形状（模式 + 区域列表） */
export type SecurityModeSocketPayload = { mode?: string; zones?: string[] }

let unauthorizedHandler: VoidHandler | null = null
let navigateToLoginHandler: VoidHandler | null = null
/** 401 时尝试无感刷新会话；返回 true 表示已恢复 */
let sessionRefreshHandler: (() => Promise<boolean>) | null = null
let authChangeHandler: VoidHandler | null = null
let uiNotifyHandler: NotifyHandler | null = null
let securityPanelRefreshHandler: VoidHandler | null = null
let securityPanelModeHandler: ((data: SecurityModeSocketPayload) => void) | null = null
let notificationRefreshHandler: VoidHandler | null = null
const eventLogRefreshHandlers = new Set<VoidHandler>()

/**
 * 注册 401 未授权处理器（由 auth store 在 main.ts 安装后调用）。
 * @param handler 处理函数（通常触发登出 / 刷新 token）
 */
export function registerUnauthorizedHandler(handler: VoidHandler): void {
  unauthorizedHandler = handler
}

/**
 * 注册跳转登录处理器（由 router guard 在 main.ts 安装后调用）。
 * @param handler 跳转函数
 */
export function registerNavigateToLoginHandler(handler: VoidHandler): void {
  navigateToLoginHandler = handler
}

/**
 * 注册会话刷新处理器（401 拦截器先无感 refresh，失败再登出）。
 */
export function registerSessionRefreshHandler(handler: () => Promise<boolean>): void {
  sessionRefreshHandler = handler
}

/** 尝试刷新会话；未注册或失败返回 false */
export async function runSessionRefresh(): Promise<boolean> {
  if (!sessionRefreshHandler) return false
  try {
    return await sessionRefreshHandler()
  } catch (err) {
    logger.warn('[Store 桥接] 会话刷新失败', err)
    return false
  }
}

/**
 * 触发已注册的未授权处理器；handler 未就绪时仅 warn 不抛错。
 * @副作用 可能触发登出 / token 刷新
 */
export function runUnauthorizedHandler(): void {
  try {
    unauthorizedHandler?.()
  } catch (err) {
    logger.warn('[Store 桥接] 未授权处理器失败(pinia 未就绪?)', err)
  }
}

/**
 * 触发跳转登录；handler 未就绪时仅 warn 不抛错。
 * @副作用 可能触发路由跳转
 */
export function runNavigateToLogin(): void {
  try {
    navigateToLoginHandler?.()
  } catch (err) {
    logger.warn('[Store 桥接] 跳转登录失败(router 未就绪?)', err)
  }
}

/**
 * 注册认证变更处理器（登录 / 登出 / token 刷新后通知其他模块）。
 * @param handler 处理函数
 */
export function registerAuthChangeHandler(handler: VoidHandler): void {
  authChangeHandler = handler
}

/**
 * 通知认证状态已变更；handler 未就绪时仅 warn 不抛错。
 * @副作用 可能触发实体重连 / UI 刷新
 */
export function notifyAuthChanged(): void {
  try {
    authChangeHandler?.()
  } catch (err) {
    logger.warn('[Store 桥接] 认证变更处理器失败(pinia 未就绪?)', err)
  }
}

/**
 * 注册 UI 通知处理器（由 ui store 注册，供非 store 模块弹通知）。
 * @param handler 通知函数（message, type?, duration?）
 */
export function registerUiNotifyHandler(handler: NotifyHandler): void {
  uiNotifyHandler = handler
}

/**
 * 弹出应用级通知；handler 未就绪时仅 warn 不抛错。
 * @param message 通知文本
 * @param type 通知类型（默认 'error'）
 * @param duration 展示时长（ms）
 */
export function appNotify(message: string, type: NotifyType = 'error', duration?: number): void {
  try {
    uiNotifyHandler?.(message, type, duration)
  } catch (err) {
    logger.warn('[Store 桥接] UI 通知失败(store 未就绪?)', err)
  }
}

/**
 * 注册安防面板刷新处理器（Socket 重连后补拉数据用）。
 * @param handler 刷新函数
 */
export function registerSecurityPanelRefreshHandler(handler: VoidHandler): void {
  securityPanelRefreshHandler = handler
}

/**
 * 注册安防模式应用处理器（Socket 推送模式变更时即时应用）。
 * @param handler 模式应用函数
 */
export function registerSecurityPanelModeHandler(
  handler: (data: SecurityModeSocketPayload) => void,
): void {
  securityPanelModeHandler = handler
}

/**
 * 从 Socket 触发安防面板刷新；handler 未就绪时仅 warn 不抛错。
 * @副作用 可能触发 store 数据重载
 */
export function refreshSecurityPanelFromSocket(): void {
  try {
    securityPanelRefreshHandler?.()
  } catch (err) {
    logger.warn('[Store 桥接] 安防面板刷新失败', err)
  }
}

/**
 * 从 Socket 推送应用安防模式；含 mode 时走专用 handler，否则回退到全量刷新。
 * @param data Socket 推送的安防模式负载
 * @副作用 可能触发安防模式切换 / 面板刷新
 */
export function applySecurityModeFromSocket(data: SecurityModeSocketPayload): void {
  try {
    if (data?.mode && securityPanelModeHandler) {
      securityPanelModeHandler(data)
      return
    }
    refreshSecurityPanelFromSocket()
  } catch (err) {
    logger.warn('[Store 桥接] 安防模式应用失败', err)
  }
}

/**
 * 注册通知刷新处理器（传 null 可取消注册）。
 * @param handler 刷新函数或 null
 */
export function registerNotificationRefreshHandler(handler: VoidHandler | null): void {
  notificationRefreshHandler = handler
}

/** Socket 重连后补拉通知，找回断连期间错过的即时消息（去重后安全幂等） */
export function refreshNotificationsFromSocket(): void {
  try {
    notificationRefreshHandler?.()
  } catch (err) {
    logger.warn('[Store 桥接] 通知刷新失败', err)
  }
}

/**
 * 注册 EventLog 补水回调；返回取消注册函数。
 * @param handler 补水函数；传 null / undefined 时返回 undefined 不注册
 * @returns 取消注册函数（调用即从集合移除）
 */
export function registerEventLogRefreshHandler(handler: VoidHandler | null): (() => void) | void {
  if (!handler) return
  eventLogRefreshHandlers.add(handler)
  return () => {
    eventLogRefreshHandlers.delete(handler)
  }
}

/** Socket 重连后补拉 EventLog，找回断连期间错过的即时消息墙事件 */
export function refreshEventLogFromSocket(): void {
  for (const handler of eventLogRefreshHandlers) {
    try {
      handler()
    } catch (err) {
      logger.warn('[Store 桥接] 事件日志刷新处理器失败', err)
    }
  }
}

/** 能源 Socket 事件触发的刷新序号（供 computed 依赖） */
export const energySocketRefreshSeq = ref(0)

/** Socket 推送 energy_anomaly 后刷新能源相关 UI（递增序号触发 computed 重算） */
export function refreshEnergyFromSocket(_entityId?: string): void {
  energySocketRefreshSeq.value++
}