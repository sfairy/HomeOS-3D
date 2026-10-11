/**
 * notifications（通知中心）域根 barrel：域的唯一对外出口，跨域深引用被 check-frontend-deps 拦截。
 *
 * 导出名带 `Notifications` 前缀，避免与 features/events 的同名组件撞名。
 * 纯逻辑在 `@/shared/notifications/utils/*`（部分被 composables 反向依赖，不能放进本域）。
 */

export { default as NotificationsViewAnalytics } from './ViewAnalytics.vue'
export { default as NotificationsViewHero } from './ViewHero.vue'
export { default as NotificationsViewStream } from './ViewStream.vue'
export { default as NotificationsViewToolbar } from './ViewToolbar.vue'

export { useNotificationsView } from './composables/useNotificationsView'
// `useNotificationsViewAnalytics` 不在此导出：它只被同域的 `ViewAnalytics.vue` 用（相对路径），
// 跨域消费者拿的是 `NotificationsViewAnalytics` 组件本身。
