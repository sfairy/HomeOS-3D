/**
 * 授权可用性快照（`GET /license/availability`）。
 *
 * 为什么需要它：路由守卫**本来**就要在放行入户路由之前拉一次可用性（门禁判定的输入），
 * 但激活页此前并不知道这件事 —— 它挂载后再自己拉一次，于是首帧只能画骨架，数据回来
 * 再换成状态句 + 表单 / 购买区块，整块面板重排一次。
 *
 * 现在守卫把同一份响应存进这里，激活页在 **setup 顶层**同步读：首帧就是最终形态。
 * 缓存只保存「最近一次真实响应」，不设置过期 —— 激活页挂载后仍会照常轮询，
 * 缓存只负责让第一帧不空着。
 */
import type { getLicenseAvailability } from '@/services/api/license'

/** 可用性响应的 `data` 形状（从 API 函数反推，避免在 services 层再导出一个类型）。 */
export type LicenseAvailabilitySnapshot = Awaited<
  ReturnType<typeof getLicenseAvailability>
>['data']

let snapshot: LicenseAvailabilitySnapshot | null = null

/** 记下守卫刚拿到的一份可用性。 */
export function rememberLicenseAvailability(value: LicenseAvailabilitySnapshot): void {
  snapshot = value
}

/** 同步读取最近一份可用性；没有就是 null（调用方据此保留骨架）。 */
export function peekLicenseAvailability(): LicenseAvailabilitySnapshot | null {
  return snapshot
}

/** 清空（登出 / 重新初始化时调用，避免把上一台机器的授权画到新页面上）。 */
export function forgetLicenseAvailability(): void {
  snapshot = null
}
