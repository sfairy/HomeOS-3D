/**
 * 安防区域后端同步工具模块。
 *
 * 职责：
 * - 将安防区域配置规范化后同步到后端；
 * - 提供保存前清洗、API 归一化、安全提交（不抛异常）等能力；
 * - postSecurityZonesSafe 包装异常为统一错误消息，供 UI 层直接展示。
 *
 * 依赖：updateSecurityPanelZones（services/api/security）、getApiErrorMessage。
 */
/** 将安防区域配置同步到后端 */
import { updateSecurityPanelZones } from '@/services/api/security'
import { getApiErrorMessage, isUnauthorizedError } from '@/utils/core/error-message'

/** 安防区域 payload 结构（与后端 API 对齐） */
export interface SecurityZonePayload {
  id: string
  name: string
  zoneType?: string
  sensors?: string[]
  roomId?: string
}

/**
 * 保存前清洗区域配置：name 去空白，空名补「未命名区域」。
 *
 * @param zones 原始区域列表
 * @returns 清洗后的区域列表（浅拷贝）
 */
export function prepareZonesForSave(zones: SecurityZonePayload[]): SecurityZonePayload[] {
  return zones.map((z) => ({
    ...z,
    name: z.name?.trim() || '未命名区域',
  }))
}

/**
 * 将区域配置归一化为后端 API 所需格式。
 *
 * 规则：
 * - 过滤掉 id 或 name 为空的项；
 * - zoneType 缺失默认 'all'；
 * - sensors 去空白并过滤空值；
 * - roomId 为空时不包含该字段。
 *
 * @param zones 原始区域列表
 * @returns API payload 数组
 */
export function normalizeZonesForApi(zones: SecurityZonePayload[]) {
  return prepareZonesForSave(zones)
    .filter((z) => z.id && z.name?.trim())
    .map((z) => ({
      id: z.id,
      name: z.name.trim(),
      zoneType: z.zoneType || 'all',
      sensors: Array.isArray(z.sensors)
        ? z.sensors.map((s) => String(s || '').trim()).filter(Boolean)
        : [],
      ...(z.roomId?.trim() ? { roomId: z.roomId.trim() } : {}),
    }))
}

/**
 * 提交安防区域配置到后端。
 *
 * @param zones 区域列表
 * @returns 归一化后的 payload（已发送给后端）
 */
export async function postSecurityZones(zones: SecurityZonePayload[]) {
  const payload = normalizeZonesForApi(zones)
  await updateSecurityPanelZones(payload)
  return payload
}

/**
 * 安全提交安防区域配置（不抛异常）。
 *
 * 成功返回 { ok: true, payload }，失败返回 { ok: false, error }，
 * 错误消息经 getApiErrorMessage 归一化，默认「同步安防区域失败」。
 * 401 时额外标记 unauthorized，便于 UI 交给全局登录引导、避免重复报错。
 *
 * @param zones 区域列表
 * @returns 成功/失败联合类型结果
 */
export async function postSecurityZonesSafe(zones: SecurityZonePayload[]) {
  try {
    const payload = await postSecurityZones(zones)
    return { ok: true as const, payload }
  } catch (e) {
    return {
      ok: false as const,
      error: getApiErrorMessage(e, '同步安防区域失败'),
      unauthorized: isUnauthorizedError(e),
    }
  }
}