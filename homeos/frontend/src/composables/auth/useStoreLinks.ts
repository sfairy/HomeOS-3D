/**
 * 商店入口链接的注入点。
 *
 * 页面不再由脚本去改写写死的 `href`，而是直接绑定 `storeLinks`（响应式）：
 * 地址为空串时视图条件渲染掉整个入口，因此「渲染出来的链接」永远等于「解析到的链接」，
 * 不会出现首帧假地址或 `v-if` 重建后变回死链的情况。
 *
 * @module composables/auth/useStoreLinks
 */
import { onMounted, shallowRef, type ShallowRef } from 'vue'

import {
  EMPTY_STORE_LINKS,
  resolveStoreLinks,
  type StoreLinks,
} from '@/shared/utils/store-links.util'

/** `useStoreLinks` 的返回值：页面按需取用，不用也不影响副作用。 */
export interface StoreLinksBinding {
  /** 商店地址（响应式）。解析完成前是空地址，页面据此不渲染任何链接。 */
  storeLinks: ShallowRef<StoreLinks>
}

/**
 * 在挂载后解析商店地址。
 *
 * 放在 `onMounted` 而不是 setup 顶层：`/public/config` 是网络请求，不该在 SSR / 首帧前
 * 阻塞渲染；解析完成前 `storeLinks` 保持 `EMPTY_STORE_LINKS`，页面渲染出来的就是「没有入口」。
 */
export function useStoreLinks(): StoreLinksBinding {
  const storeLinks = shallowRef<StoreLinks>(EMPTY_STORE_LINKS)
  onMounted(async () => {
    storeLinks.value = await resolveStoreLinks()
  })
  return { storeLinks }
}
