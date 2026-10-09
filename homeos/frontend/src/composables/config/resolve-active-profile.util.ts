/**
 * @module config/resolve-active-profile
 * @description 解析当前终端应使用的 display profile（布局方案）的工具。
 *
 * 解析优先级：URL ?profile= > localStorage > 服务端终端绑定 > 新终端默认策略 > default。
 *
 * 依赖：
 *  - @/services/api/config（项目 / 终端绑定接口）；
 *  - @/utils/client/client-system.util（客户端设备 ID）；
 *  - @/stores/ui/create-layout-state（本地 profileId 持久化）；
 *  - @/utils/core/logger。
 */
import {
  fetchProject,
  resolveTerminalProfile,
  updateSelfTerminalBinding,
} from '@/services/api/config'
import { getClientDeviceId } from '@/utils/client/system.util'
import {
  readStoredProfileId,
  hasStoredProfileId,
  writeStoredProfileId,
} from '@/stores/ui/create-layout-state'
import { logger } from '@/utils/core/logger'
import type { UILayoutConfig } from '@/types/layout'

/** profile 解析来源标签，用于调试与埋点 */
type ProfileResolveSource = 'url' | 'local' | 'binding' | 'activeProfile' | 'default'

/**
 * 按优先级解析当前终端应使用的 display profile：
 * URL ?profile= > localStorage > 服务端终端绑定 > 新终端默认策略 > default
 *
 * @param routeQueryProfile 来自路由 query 的 profile 候选值
 * @returns 解析结果：profileId + 来源标签
 * @sideeffect URL/local 命中时会写入 localStorage；服务端绑定命中时也会写入
 */
export async function resolveActiveProfileId(routeQueryProfile?: string): Promise<{
  profileId: string
  source: ProfileResolveSource
}> {
  const urlProfile = String(routeQueryProfile || '').trim()
  if (urlProfile) {
    const valid = await validateProfileExists(urlProfile)
    if (valid) {
      writeStoredProfileId(urlProfile)
      return { profileId: urlProfile, source: 'url' }
    }
    logger.warn(`URL 指定的方案 "${urlProfile}" 不存在,继续按其他来源解析`)
  }

  const local = readStoredProfileId()
  if (local !== 'default' || hasStoredProfileId()) {
    return { profileId: local, source: 'local' }
  }

  // 无本地记录：查询服务端终端绑定（新终端首次进入会走这里）
  try {
    const clientId = getClientDeviceId()
    const { data } = await resolveTerminalProfile(clientId)
    const payload = data?.data ?? data
    const profileId = String(payload?.profileId || 'default').trim() || 'default'
    const source = (payload?.source as ProfileResolveSource) || 'default'
    writeStoredProfileId(profileId)
    return { profileId, source }
  } catch (err) {
    logger.warn('服务端终端方案解析失败,回退 default', err)
    return { profileId: 'default', source: 'default' }
  }
}

/**
 * 校验指定 profileId 是否存在（通过 fetchProject 探测）。
 * @param profileId 待校验方案 id
 * @returns 是否存在
 */
async function validateProfileExists(profileId: string): Promise<boolean> {
  try {
    await fetchProject(profileId)
    return true
  } catch {
    return false
  }
}

/**
 * 本机绑定当前方案到服务端（切换方案时调用）。
 * @param profileId 目标方案 id
 * @param label 可选方案标签
 * @sideeffect 失败仅 warn，不抛出（绑定失败不影响本地使用）
 */
export async function bindSelfTerminalProfile(profileId: string, label?: string): Promise<void> {
  try {
    await updateSelfTerminalBinding({
      clientId: getClientDeviceId(),
      profileId,
      label: label || undefined,
    })
  } catch (err) {
    logger.warn('同步终端方案绑定到服务端失败', err)
  }
}

/**
 * 统一天气实体 ID：layout 优先，其次 circadian。
 * @param layoutId layout 配置中的天气实体 ID
 * @param circadianId 昼夜节律模块提供的天气实体 ID
 * @returns 优先取 layoutId，为空则取 circadianId
 */
export function resolveWeatherEntityId(
  layoutId?: string | null,
  circadianId?: string | null,
): string {
  return String(layoutId || '').trim() || String(circadianId || '').trim()
}

/**
 * 将解析出的天气实体 ID 写回 layout 配置的 haConfig.weatherEntityId。
 * @param layoutConfig 布局配置对象（会就地修改）
 * @param entityId 天气实体 ID
 * @sideeffect 就地修改 layoutConfig.haConfig.weatherEntityId
 */
export function applyWeatherEntityIdToLayout(
  layoutConfig: UILayoutConfig,
  entityId: string,
): void {
  if (!layoutConfig.haConfig) layoutConfig.haConfig = {} as UILayoutConfig['haConfig']
  layoutConfig.haConfig.weatherEntityId = entityId
}
