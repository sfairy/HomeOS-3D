/**
 * device 域页面入口 —— **设备列表页**。
 *
 * 为什么本域有两个 entry 而不是一个：`/devices` 与 `/device` 是两条独立懒加载路由，
 * 若两者都从同一个 `entry.ts` 取页面，Rollup 会把这个模块连同两个页面合并进同一个
 * chunk，`/devices` 就会把详情页一起下载（实测 140KB），懒加载边界失效。
 * 按页拆 entry（`entry-devices` / `entry-device-detail`）才能保住边界。
 *
 * 门禁：`views/**` 只允许 `@/features/<域>` 或 `@/features/<域>/entry(-<page>)`，
 * 见 scripts/check-frontend-deps.mjs 的 isFeatureEntry。
 */
export { default as DevicesPage } from './DevicesPage.vue'
