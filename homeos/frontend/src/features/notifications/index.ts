/**
 * notifications（通知中心）域根 barrel —— 域的唯一对外出口。
 *
 * 跨域引用只允许 `import { ... } from '@/features/notifications'`；跨域深引用被
 * `scripts/check-frontend-deps.mjs` 与 ESLint 的域边界规则拦截。
 *
 * ## 命名约定
 *
 * 导出名带 `Notifications` 前缀（`NotificationsViewHero` 等）。本域与 `features/events`
 * 都有 `ViewHero` / `ViewStream` / `ViewToolbar` / `ViewAnalytics` 这一组同名文件，
 * 前缀可避免「两个 barrel 同时具名导入时撞名」；`views/*` 原本就用的这套别名，现在由
 * barrel 统一承担。
 *
 * ## 分层
 *
 * 纯逻辑（无 Vue / 无 store）在 `@/shared/notifications/utils/*`（`analytics`、`dnd`、`ws-sync`）——
 * 注意 `dnd.util` 被 `composables/widget/useNotificationCenter.ts`、`ws-sync.util` 被
 * `composables/entity/ws-bind.ts` 反向依赖，故**不能**放进本域（会撞 `composables → features`）。
 * 视图模型（`useNotificationsView` / `useNotificationsViewAnalytics`）属域内自持，放本域 `composables/`。
 */

export { default as NotificationsViewAnalytics } from './ViewAnalytics.vue'
export { default as NotificationsViewHero } from './ViewHero.vue'
export { default as NotificationsViewStream } from './ViewStream.vue'
export { default as NotificationsViewToolbar } from './ViewToolbar.vue'

export { useNotificationsView } from './composables/useNotificationsView'
// `useNotificationsViewAnalytics` 不在此导出：它只被同域的 `ViewAnalytics.vue` 用（相对路径），
// 跨域消费者拿的是 `NotificationsViewAnalytics` 组件本身。
