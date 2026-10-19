/**
 * 全量备份恢复后的落点。
 *
 * 恢复是「整库原样覆盖」，两件东西不会随备份回到可用状态：
 *
 * 1. **登录会话**：`sessions` 表在快照里就是空的（见 `business_backup.EXCLUDED_DB_TABLES`），
 *    恢复后当前浏览器持有的 Cookie 已失效；
 * 2. **本机授权绑定**：签名租约与硬件指纹派生出的 `instanceId` 一一对应，
 *    换机恢复后租约直接作废（`INSTANCE_CHANGED`），必须重新激活。
 *
 * 所以恢复成功后**不能原地 `location.reload()`**：设置页这类深链接不在授权门禁的白名单里，
 * 未激活时后端会回 JSON 401，浏览器把响应体当网页渲染 —— 用户看到的就是屏幕上一段代码。
 * 这里统一把用户送到登录 / 激活引导页，让授权页自己说明下一步。
 */
import { getLicenseAvailability } from '@/services/api/license'

/** 未激活：登录成功后直接进激活页。 */
const LOGIN_WITH_ACTIVATION = '/login?next=/activate'
/** 已激活（或不需要授权）：只需重新登录。 */
const LOGIN_ONLY = '/login'

export type PostRestoreDestination = {
  /** 登录页地址。 */
  path: string
  /** 登录后是否还需要重新激活本机授权。 */
  needsActivation: boolean
  /** 给用户看的一句提示（不出现状态码 / 英文标识）。 */
  message: string
}

/**
 * 恢复后的目标地址（纯函数，便于单测）。
 *
 * @param licenseUsable `true` 授权可用 / 不需要授权；`false` 需要（重新）激活；
 *   `null` 状态读取失败 —— 仍回登录页，登录后由路由守卫重新判定。
 */
export function postRestoreDestination(licenseUsable: boolean | null): PostRestoreDestination {
  if (licenseUsable === false) {
    return {
      path: LOGIN_WITH_ACTIVATION,
      needsActivation: true,
      message: '全量数据已恢复。登录会话已清空，授权需要在本机重新激活：请先登录，随后进入激活页。',
    }
  }
  return {
    path: LOGIN_ONLY,
    needsActivation: false,
    message: '全量数据已恢复。登录会话已清空，请重新登录。',
  }
}

/**
 * 探测授权状态，得到恢复后的落点。
 *
 * 读取失败（后端刚换完库、仍在重建运行时）不阻塞恢复流程：回登录页，登录后由路由守卫再判。
 */
export async function resolvePostRestoreDestination(): Promise<PostRestoreDestination> {
  try {
    const { data } = await getLicenseAvailability()
    return postRestoreDestination(!data?.required || Boolean(data?.allowed))
  } catch {
    return postRestoreDestination(null)
  }
}

/**
 * 整页跳转到落点。
 *
 * 用 `location.replace` 而不是 `push` / `reload`：恢复后的已登录界面已经失效，
 * 不该留在历史栈里让用户按「后退」回去。
 *
 * @param destination `resolvePostRestoreDestination` 的返回值
 * @param delayMs 留一小段停留时间，让用户看清弹窗 / 通知里的结果再跳
 */
export function navigateAfterRestore(
  destination: PostRestoreDestination,
  delayMs = 800,
): void {
  window.setTimeout(() => window.location.replace(destination.path), delayMs)
}
