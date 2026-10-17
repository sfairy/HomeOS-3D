/**
 * 认证 / 授权入口页（登录、初始化、激活、授权恢复）共用的挂载期副作用。
 *
 * 副作用随组件挂载 / 卸载成对出现，由 composable 负责重新绑定。
 *
 * - 商店链接（`a[data-store-link]` / `a[data-store-password-reset-link]`）在挂载后改写为
 *   后端 `/public/config` 下发的地址，取不到时回落到内置兜底值；
 * - 密码可见性切换由模板里的 `v-model` + `:type` 直接驱动。
 *
 * @module studio/app/shared/entry-view
 */
import { onMounted } from 'vue'

import { applyStoreLinks } from '@/shared/utils/store-links.util'

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
