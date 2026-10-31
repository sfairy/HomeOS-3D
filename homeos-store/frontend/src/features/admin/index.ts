/**
 * admin 域根 barrel —— 域的唯一对外出口（跨域只经本 barrel，禁深引用）。
 *
 * 后台这一片（`views/` 14 个面板按业务对象分四簇 + `layouts/` 宿主布局 + `components/` 9 个子块 + 4 个 store + `useAdminTabs`）
 * 是完整的一域：跨域只能 `import { … } from "@store/features/admin"`，域内细节不外借。
 *
 * 这里**刻意只导出跨域真正用到的成员**，不做「整域再导出」：
 * admin 是 40 文件的域，全量 barrel 会把这 14 个面板拖进任何引用方的 chunk。
 * 当前唯一的外部消费者是路由表（后台闸门要读会话态）：
 * `router/index.ts` 的 `beforeEach` 用 `useAdminStore()` 判断「有 cookie 但不是管理员」。
 * 后台的**路由组件**不走这里 —— 懒加载路由组件经 barrel 转出会把 14 个面板并进同一个
 * chunk，直接毁掉后台整片分包（见门禁 R6 的说明）。
 */
export { useAdminStore } from "./stores/admin";
