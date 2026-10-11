/** 通知中心 Vue provide/inject 上下文：定义 InjectionKey 与类型别名。 */
import type { InjectionKey } from 'vue'
import type { useNotificationCenter } from '@/composables/widget/useNotificationCenter'

/** 通知中心上下文类型：等同于 useNotificationCenter 组合式函数的返回值类型，供注入方做类型断言使用 */
type NotificationCenterContext = ReturnType<typeof useNotificationCenter>

/** 通知中心注入键：以 Symbol 形式避免与其它 InjectionKey 冲突，承载完整的上下文对象 */
export const NOTIFICATION_CENTER_KEY: InjectionKey<NotificationCenterContext> =
  Symbol('notificationCenter')