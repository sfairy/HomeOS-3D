/**
 * HA URL 部署校验：封装 @homeos/shared 校验逻辑，开发环境允许 localhost。
 * HA 离线高风险控制拦截。
 *
 * 依赖：
 * - @homeos/shared：提供 HA URL 部署校验与高风险控制判定
 * - @/utils/bridge/store-bridge：提供 toast 通知能力
 */
import { isDangerousHaControl, validateHaUrlForDeploy as validateHaUrlForDeployShared } from '@homeos/shared'
import { appNotify } from '@/utils/bridge/store-bridge'

/**
 * 校验 HA URL 是否可用于部署。
 * @param url 待校验的 HA 地址
 * @param allowLocalhost 是否允许 localhost，默认仅开发环境允许
 * @returns 校验通过返回 null，否则返回错误信息
 */
export function validateHaUrlForDeploy(
  url: string,
  { allowLocalhost = import.meta.env.DEV }: { allowLocalhost?: boolean } = {},
): string | null {
  return validateHaUrlForDeployShared(url, { allowLocalhost })
}

/** HA 离线时拦截高风险操作的提示文案 */
export const HA_OFFLINE_DANGEROUS_CONTROL_MSG = 'Home Assistant 未连接，已拦截高风险操作'

/**
 * HA 离线时拦截阀/锁/报警等高风险 service 调用；返回 true 表示已拦截。
 * @param connected HA 是否已连接
 * @param domain service 的 domain
 * @param service service 名
 * @param entityId 实体 id
 * @returns true 表示已拦截（并弹出 warning toast）；false 表示放行
 */
export function blockDangerousHaServiceWhenOffline(
  connected: boolean,
  domain: string,
  service: string,
  entityId: string,
): boolean {
  if (connected) return false
  if (!isDangerousHaControl(domain, service, entityId)) return false
  appNotify(HA_OFFLINE_DANGEROUS_CONTROL_MSG, 'warning')
  return true
}