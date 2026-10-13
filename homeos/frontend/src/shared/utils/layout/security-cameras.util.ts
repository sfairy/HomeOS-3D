/** 安防摄像头绑定工具：`string[]`（旧）与 `[{entityId, go2rtcUrl?}]`（0.7.5）双结构兼容。 */
import type { HaConfig, SecurityCameraBinding } from '@/shared/types/layout'

/**
 * 把布局里的安防摄像头绑定归一成结构化列表。
 *
 * 0.7.5 之前这里存的是纯实体 ID 字符串数组；升级后每项可以再带一个局域网
 * go2rtc 地址（走同源 MSE 中继，因此**不必**绑 HA 实体）。旧数据无损升级成
 * `{ entityId }`，读取方无需再关心两种形状。
 *
 * @param rawSecurityCameras haConfig.securityCameras 原始值（任意形状）
 * @returns 归一后的绑定列表（保持原顺序；空卡位保留，便于设置页继续编辑）
 */
export function normalizeSecurityCameras(rawSecurityCameras: unknown): SecurityCameraBinding[] {
  if (!Array.isArray(rawSecurityCameras)) return []
  const normalizedBindings: SecurityCameraBinding[] = []
  for (const rawCameraEntry of rawSecurityCameras) {
    if (rawCameraEntry == null) continue
    const isLegacyString = typeof rawCameraEntry === 'string'
    if (!isLegacyString && typeof rawCameraEntry !== 'object') continue
    const rawBinding = (isLegacyString ? {} : rawCameraEntry) as Partial<SecurityCameraBinding>,
      entityId = String(isLegacyString ? rawCameraEntry : rawBinding.entityId || '').trim(),
      go2rtcUrl = String(rawBinding.go2rtcUrl || '').trim()
    normalizedBindings.push(go2rtcUrl ? { entityId, go2rtcUrl } : { entityId })
  }
  return normalizedBindings
}

/**
 * 取安防摄像头绑定的实体 ID 列表（旧调用点只关心实体，不需要 go2rtc）。
 *
 * @param hc HA 配置对象
 * @returns 去空后的摄像头实体 ID 列表
 */
export function securityCameraEntityIds(hc: HaConfig | null | undefined): string[] {
  return normalizeSecurityCameras(hc?.securityCameras)
    .map((binding) => binding.entityId)
    .filter(Boolean)
}

/**
 * 按实体 ID 取该摄像头的 go2rtc 地址。
 *
 * @param hc HA 配置对象
 * @param entityId 摄像头实体 ID
 * @returns go2rtc 地址，未配置时空串
 */
export function securityCameraGo2rtcUrl(
  hc: HaConfig | null | undefined,
  entityId: string,
): string {
  const normalizedEntityId = String(entityId || '').trim()
  if (!normalizedEntityId) return ''
  return (
    normalizeSecurityCameras(hc?.securityCameras).find(
      (binding) => binding.entityId === normalizedEntityId,
    )?.go2rtcUrl || ''
  )
}
