/**
 * events（事件日志）域根 barrel：域的唯一对外出口，跨域深引用被 check-frontend-deps 拦截。
 *
 * 导出名带 `Events` 前缀，避免与 features/notifications 的同名组件撞名。
 * 域内工具不外借；跨域共享的 `events-display.util` 落在 `@/shared/events/utils/`。
 */

export { default as EventsViewAnalytics } from './ViewAnalytics.vue'
export { default as EventsViewHero } from './ViewHero.vue'
export { default as EventsViewStream } from './ViewStream.vue'
export { default as EventsViewToolbar } from './ViewToolbar.vue'

export { useEventsView } from './composables/useEventsView'
