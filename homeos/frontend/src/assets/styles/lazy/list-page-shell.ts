/**
 * 列表页壳层样式 · 按需加载。
 *
 * 首屏预算（`ops/checks/bundle-budget.json` 的 `appCssRawBytes`）只应包含「外壳 +
 * 首屏可见组件」的样式；列表页 / 详情页 / 设置页这三类样式表合计约 45 KB，
 * 却只被懒加载路由消费，跟着 `main.ts` 进入口等于给登录页和 3D 舞台白付这份成本。
 *
 * 消费方式：由「该路由一定会渲染的壳组件」做副作用导入 —— 只要这一份模块被
 * 任意一个懒路由引入，Vite 就会把这几张表打进按需 CSS chunk，路由首次进入时注入。
 * 目前是 `ListPageHero`（列表 / 详情 / 事件 / 通知 / 震情）与
 * `RecommendInsightCard`（设置页与模式编辑器的推荐卡）两处。
 *
 * 注意：首屏仍需的 `.list-page__btn*` / `.list-page__muted` 留在
 * `list-page-eager.css`，不要从入口移除。
 */
import '@/assets/styles/list-page.css'
import '@/assets/styles/list-page-views.css'
import '@/assets/styles/premium-head.css'
