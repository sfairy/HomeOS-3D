/**
 * events（事件日志）域根 barrel —— 域的唯一对外出口。
 *
 * 跨域引用只允许 `import { ... } from '@/features/events'`；跨域深引用被
 * `scripts/check-frontend-deps.mjs` 与 ESLint 的域边界规则拦截。
 *
 * ## 命名约定
 *
 * 导出名带 `Events` 前缀（`EventsViewHero` 等）。本域与 `features/notifications`
 * 都有 `ViewHero` / `ViewStream` / `ViewToolbar` / `ViewAnalytics` 这一组同名文件，
 * 前缀可避免「两个 barrel 同时具名导入时撞名」。
 *
 * ## 分层
 *
 * - `analytics.util.ts`（`normalizeByDomain` 等）是**域内**工具，不外借，故不在此导出；
 *   域外消费者走 `events-display.util`。
 * - `events-display.util.ts`（`displayEventState`、`formatCount`、`entityDomain`…）被
 *   `features/settings`、`features/device`、本域共 4 处消费 → 属跨域共享，已落
 *   `@/shared/events/utils/events-display.util`（features → shared 允许深路径）。
 * - 视图模型 `useEventsView` 属域内自持，放本域 `composables/`。
 */

export { default as EventsViewAnalytics } from './ViewAnalytics.vue'
export { default as EventsViewHero } from './ViewHero.vue'
export { default as EventsViewStream } from './ViewStream.vue'
export { default as EventsViewToolbar } from './ViewToolbar.vue'

export { useEventsView } from './composables/useEventsView'
