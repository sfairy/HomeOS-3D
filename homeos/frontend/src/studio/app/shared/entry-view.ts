/**
 * 认证 / 授权入口页（登录、初始化、激活、授权恢复）共用的挂载期副作用。
 *
 * 并入前的实现是「模块顶层副作用 + init*() 函数」：模块在 SPA 内只求值一次，
 * 所以必须靠显式 init 把监听器重新挂到新渲染出来的 DOM 上。改为 composable 后，
 * 副作用随组件挂载 / 卸载成对出现，不再需要手工清理列表。
 *
 * 行为保持：
 * - 商店链接（`a[data-store-link]` / `a[data-store-password-reset-link]`）在挂载后改写为
 *   后端 `/public/config` 下发的地址，取不到时回落到内置兜底值；
 * - 密码可见性切换改由模板里的 `v-model` + `:type` 直接驱动，不再做 DOM 改写。
 *
 * @module studio/app/shared/entry-view
 */
import { onMounted } from 'vue'

import { applyStoreLinks } from './store-links'

/**
 * 在挂载后把页面里写死的商店入口 href 换成后端下发的地址。
 *
 * 必须等本次渲染的 DOM 落地后再改写，否则 `querySelectorAll` 找不到目标锚点。
 */
export function useStoreLinks(): void {
  onMounted(() => {
    void applyStoreLinks()
  })
}
