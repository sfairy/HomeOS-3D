/**
 * 把后端设备画像（`/api/v1/device-profiles`）的分类结论投影到 3D 面板的同步缓存。
 *
 * 为什么是「投影」而不是「调用」：3D 面板在每一帧 / 每次交互里同步问
 * `resolveClimateDeviceType()`，等不了 HTTP；而分类结论的权威来源只能是后端
 * （人工确认优先，其次规则分类）。于是这里负责唯一的异步入口，缓存只负责同步读。
 *
 * 放在 `services/`（叶子层）而不是 studio：它依赖 API 客户端（会拖进 axios），
 * 而 `studio/runtime/**` 会被 `vite.runtime.config.ts` 逐个编成独立产物，
 * 多出的几十 KB 与浏览器直载语义都不划算。
 */

import { listDeviceProfiles } from '@/domain/api/device'
import { replaceDeviceProfileKinds, resetDeviceProfileKinds } from '@/domain/device/device-profile-kind-cache'

let loaded = false
let inFlight: Promise<number> | null = null

/**
 * 拉取画像并整体替换投影。
 *
 * 失败时静默返回 0：面板会退回空调面板兜底，设置页仍可手动确认。
 * 首屏不该因为「画像还没就绪」而阻塞或报错。
 */
export function hydrateDeviceProfileKinds(force = false): Promise<number> {
  if (!force && loaded) return Promise.resolve(0)
  if (inFlight) return inFlight
  inFlight = listDeviceProfiles()
    .then(({ data }) => {
      const items = Array.isArray(data?.items) ? data.items : []
      replaceDeviceProfileKinds(items)
      loaded = true
      return items.length
    })
    .catch(() => 0)
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/** 登出 / 换账号：清空投影，避免上个会话的分类结论泄漏给下一个用户。 */
export function forgetDeviceProfileKinds(): void {
  loaded = false
  inFlight = null
  resetDeviceProfileKinds()
}
