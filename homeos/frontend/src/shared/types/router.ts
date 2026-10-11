/**
 * 路由守卫相关类型：系统初始化状态、导航上下文与决策。
 * 依赖：vue-router（RouteLocationNormalized）。
 */
import type { RouteLocationNormalized } from 'vue-router'

/** 系统初始化状态：null=未检查，offline=后端不可达 */
export type SystemInitState = boolean | 'offline' | null

/** 导航上下文（守卫判断所需的最小信息） */
export interface NavigationContext {
  systemInitialized: SystemInitState // 系统是否已初始化
  isAuthenticated: boolean // 是否已认证
  licenseActivated?: boolean | null // 商业授权：null=未检查，true/false=已探测
  settingsLockEnabled?: boolean // 是否启用设置锁定
  isSettingsUnlocked?: boolean // 设置是否已解锁
}

/** 导航决策：string=重定向路径；null=放行；false=取消；undefined=暂停 */
export type NavigationDecision = string | null | false | undefined

/** 可路由目标（仅取 name / path / meta 字段） */
export type RoutableLocation = Pick<RouteLocationNormalized, 'name' | 'path' | 'meta'>