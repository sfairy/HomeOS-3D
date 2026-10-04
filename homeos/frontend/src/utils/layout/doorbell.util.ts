/**
 * 门铃配置工具。
 *
 * 职责：维护 HaConfig.doorbells[] 列表的增删，解析门铃路由与摄像头绑定关系。
 *
 * 依赖：
 * - @/types/setup-wizard：门铃配置类型
 * - @/types/layout：HA 配置类型
 */
import type { DoorbellConfig } from '@/types/setup-wizard'
import type { HaConfig } from '@/types/layout'

/**
 * 确保 HaConfig 上存在 doorbells 数组（无则初始化为空数组）。
 * @param hc HA 配置对象
 * @returns doorbells 数组引用
 */
export function ensureDoorbellList(hc: HaConfig): DoorbellConfig[] {
  if (!hc.doorbells) hc.doorbells = []
  return hc.doorbells
}

/**
 * 解析有效门铃路由：仅保留配置了触发实体的门铃。
 * @param hc HA 配置对象
 * @returns 有效门铃配置列表
 */
export function resolveDoorbellRoutes(hc: HaConfig): DoorbellConfig[] {
  return Array.isArray(hc.doorbells) ? hc.doorbells.filter((d) => d.triggerEntityId) : []
}

/**
 * 收集所有门铃绑定的摄像头实体 id。
 * @param hc HA 配置对象
 * @returns 去空后的摄像头实体 id 列表
 */
export function collectDoorbellCameraIds(hc: HaConfig): string[] {
  return ensureDoorbellList(hc)
    .map((d) => String(d.cameraEntityId || '').trim())
    .filter(Boolean)
}

/**
 * 切换门铃摄像头绑定：若该摄像头已绑定则解绑，否则绑定到首个未占用门铃。
 * @param hc HA 配置对象
 * @param cam 摄像头实体 id
 * @returns true 表示发生绑定或解绑
 */
export function toggleDoorbellCamera(hc: HaConfig, cam: string): boolean {
  const list = ensureDoorbellList(hc)
  const hit = list.find((d) => d.cameraEntityId === cam)
  if (hit) {
    hit.cameraEntityId = ''
    return true
  }
  const target = list.find((d) => !String(d.cameraEntityId || '').trim()) || list[0]
  if (!target) return false
  target.cameraEntityId = cam
  return true
}

/**
 * 清除指定摄像头在所有门铃上的绑定。
 * @param hc HA 配置对象
 * @param cam 摄像头实体 id
 */
export function clearDoorbellCamera(hc: HaConfig, cam: string): void {
  for (const d of ensureDoorbellList(hc)) {
    if (d.cameraEntityId === cam) d.cameraEntityId = ''
  }
}

/**
 * 获取主门铃摄像头实体 id。
 * @param hc HA 配置对象
 * @returns 摄像头实体 id，无则空串
 */
export function primaryDoorbellCameraId(hc: HaConfig): string {
  return (
    resolveDoorbellRoutes(hc).find((d) => d.cameraEntityId)?.cameraEntityId ||
    ensureDoorbellList(hc).find((d) => d.cameraEntityId)?.cameraEntityId ||
    ''
  )
}
