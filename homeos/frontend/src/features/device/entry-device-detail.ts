/**
 * device 域页面入口 —— **设备详情页**。
 *
 * 与 `entry-devices.ts` 分开的原因见该文件头部：两条路由共用 entry 会让 Rollup
 * 把两个页面合并进同一个 chunk，懒加载边界失效。
 */
export { default as DeviceDetailPage } from './DeviceDetailPage.vue'
