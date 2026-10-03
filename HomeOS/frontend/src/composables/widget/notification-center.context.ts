/**
 * 通知中心 Vue provide/inject 上下文：定义 InjectionKey 与类型别名。
 *
 * 所属模块：widget/composables（widget 通知中心相关组合式函数）
 * 职责：声明通知中心在组件树中跨层级传递所用的依赖注入键（InjectionKey），
 *      并将 useNotificationCenter 的返回类型导出为共享别名，避免各使用方重复推导。
 * 依赖：vue（InjectionKey 类型）、@/composables/widget/useNotificationCenter（注入实例类型来源）。
 */
import type { InjectionKey } from 'vue'
import type { useNotificationCenter } from '@/composables/widget/useNotificationCenter'

/** 通知中心上下文类型：等同于 useNotificationCenter 组合式函数的返回值类型，供注入方做类型断言使用 */
type NotificationCenterContext = ReturnType<typeof useNotificationCenter>

/** 通知中心注入键：以 Symbol 形式避免与其它 InjectionKey 冲突，承载完整的上下文对象 */
export const NOTIFICATION_CENTER_KEY: InjectionKey<NotificationCenterContext> =
  Symbol('notificationCenter')