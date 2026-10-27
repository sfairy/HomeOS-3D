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
  peekStoreLinks,
  prefetchStoreLinks,
  type StoreLinks,
} from '@/shared/utils/store-links.util'

/** `useStoreLinks` 的返回值：页面按需取用，不用也不影响副作用。 */
interface StoreLinksBinding {
  /** 商店地址（响应式）。解析完成前是空地址，页面据此不渲染任何链接。 */
  storeLinks: ShallowRef<StoreLinks>
}

/**
 * 取商店地址。
 *
 * **初始值优先读预取结果**：路由守卫在放行入户页之前已经 `prefetchStoreLinks()`（不 await），
 * 正常情况下 setup 执行到这里缓存已经有了 —— 于是坞脚在第一帧就是最终的三格，面板高度不变。
 * 缓存没命中（冷开竞态 / 首次直达）就退回 `EMPTY_STORE_LINKS`，并在挂载后补上，
 * 与改造前行为一致，只是那条路径已经不是常态。
 *
 * 仍然放在 `onMounted` 里补取（而不是 setup 顶层 await 阻塞首帧）：`/public/config` 是网络请求，
 * 不该为了三个脚注链接把人挡在首屏外面。
 */
export function useStoreLinks(): StoreLinksBinding {
  const storeLinks = shallowRef<StoreLinks>(peekStoreLinks() ?? EMPTY_STORE_LINKS)
  onMounted(async () => {
    const links = await prefetchStoreLinks()
    // 只在确实变了的时候赋值：同一个对象反复写入会触发一次无意义的渲染。
    if (links !== storeLinks.value) storeLinks.value = links
  })
  return { storeLinks }
}
