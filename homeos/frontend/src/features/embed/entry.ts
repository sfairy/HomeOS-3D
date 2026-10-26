/**
 * embed 域页面入口：`views/**` 只能从这里取页面组件（check-frontend-deps 的
 * `views→feature-deep` 规则）。两条 embed 路由（`/embed/movie-pilot`、`/embed/:id`）
 * 共用同一页面组件。
 */
export { default as EmbedPage } from './EmbedPage.vue'
