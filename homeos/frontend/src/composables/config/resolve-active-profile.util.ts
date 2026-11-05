/**
 * 显示方案解析与终端绑定。
 *
 * 解析优先级：URL ?profile= > 服务端终端绑定 > localStorage > 新终端默认策略 > default。
 *
 * 关键点：**服务端绑定是权威源**。这个功能的意义就是「云端给每台设备指定方案」，
 * 所以在已登录、无 URL 覆盖时，本机必须先问服务端；localStorage 只作为
 * 离线 / 服务不可达时的兜底，以及首屏的即时值。
 * 反过来（本地优先）会让「在 B 设备上把 A 设备改绑到另一个方案」永远不生效。
 */
import { fetchProject, resolveTerminalProfile, updateSelfTerminalBinding } from '@/services/api/config'
import { getClientDeviceId } from '@/shared/client/utils/system.util'
import { inferTerminalLabel } from '@/shared/client/utils/infer-terminal-label.util'
import {
  hasStoredProfileId,
  hasTerminalRegistered,
  markTerminalRegistered,
  readStoredProfileId,
  writeStoredProfileId,
} from '@/stores/ui/create-layout-state'
import { logger } from '@/shared/utils/core/logger'
import type { UILayoutConfig } from '@/shared/types/layout'

/** profile 解析来源标签，用于调试与埋点 */
type ProfileResolveSource = 'url' | 'local' | 'binding' | 'activeProfile' | 'default'

/** 一次解析的结果：方案 id + 来源标签。 */
interface ResolvedProfile {
  profileId: string
  source: ProfileResolveSource
}

/**
 * URL 覆盖（kiosk 场景）：方案存在才算数。
 *
 * 命中时必须同时落成服务端绑定，否则下一次导航 URL 参数已被消费掉，服务端绑定会把
 * 设备拉回旧方案，表现为「刷新就跳走」。绑定必须 await：路由守卫紧接着会删掉
 * `?profile=` 再解析一次，若绑定还没落库，第二次解析会读到旧绑定并把设备切回去。
 */
async function resolveFromUrl(urlProfile: string): Promise<ResolvedProfile | null> {
  if (!urlProfile) return null
  if (!(await validateProfileExists(urlProfile))) {
    logger.warn(`URL 指定的方案 "${urlProfile}" 不存在,继续按其他来源解析`)
    return null
  }
  writeStoredProfileId(urlProfile)
  await bindSelfTerminalProfile(urlProfile, inferTerminalLabel())
  return { profileId: urlProfile, source: 'url' }
}

/**
 * 服务端解析的三段优先级：云端绑定 > 本机记录 > 新终端默认策略。
 *
 * 网络异常由调用方兜底（这里只管「服务端有答复」的分支）。
 */
async function resolveFromServer(local: string, hasLocal: boolean): Promise<ResolvedProfile> {
  const { data } = await resolveTerminalProfile(getClientDeviceId())
  const payload = data?.data ?? data
  const profileId = String(payload?.profileId || 'default').trim() || 'default'
  const source = (payload?.source as ProfileResolveSource) || 'default'

  // 1) 云端给这台设备指定过方案：以云端为准（管理员改绑立刻生效）
  if (source === 'binding') {
    writeStoredProfileId(profileId)
    return { profileId, source }
  }

  // 2) 没有绑定：本机记录的方案优先，但要先确认它还在（可能已被别的终端删掉）
  if (hasLocal) {
    if (await validateProfileExists(local)) {
      ensureTerminalRegistered(local)
      return { profileId: local, source: 'local' }
    }
    logger.warn(`本机记录的方案 "${local}" 已不存在,改用服务端策略结果`)
  }

  // 3) 新终端：按「新终端默认策略」兜底，并顺手登记，让设置页能看到这台设备
  writeStoredProfileId(profileId)
  ensureTerminalRegistered(profileId)
  return { profileId, source }
}

/**
 * 按优先级解析当前终端应使用的 display profile。
 *
 * @param routeQueryProfile 来自路由 query 的 profile 候选值
 * @returns 解析结果：profileId + 来源标签
 * @sideeffect 命中 URL / 服务端绑定 / 本地时会写入 localStorage；首次解析会登记终端绑定
 */
export async function resolveActiveProfileId(routeQueryProfile?: string): Promise<ResolvedProfile> {
  const urlProfile = String(routeQueryProfile || '').trim()
  const fromUrl = await resolveFromUrl(urlProfile)
  if (fromUrl) return fromUrl

  const local = readStoredProfileId()
  const hasLocal = hasStoredProfileId()
  try {
    return await resolveFromServer(local, hasLocal)
  } catch (err) {
    logger.warn('服务端终端方案解析失败,回退本地/默认', err)
    if (hasLocal) return { profileId: local, source: 'local' }
    return { profileId: 'default', source: 'default' }
  }
}

/**
 * 校验指定 profileId 是否存在。
 *
 * 依赖后端在方案不存在时返回 404：以前后端对缺失方案回 200 + 空 layout，
 * 这里永远返回 true，导致「URL 里随便写一个 id」都会被当成有效方案写进本地。
 *
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
 * 首次解析时把本终端登记到服务端（只做一次，见 ``TERMINAL_REGISTERED_KEY``）。
 *
 * 不 await：解析在路由守卫里，首屏不该为一次绑定写入多等一个往返。
 * @param profileId 要绑定的方案 id
 */
function ensureTerminalRegistered(profileId: string): void {
  if (hasTerminalRegistered()) return
  void bindSelfTerminalProfile(profileId, inferTerminalLabel())
}

/**
 * 本机绑定当前方案到服务端（切换方案 / 首次登记时调用）。
 *
 * @param profileId 目标方案 id
 * @param label 可选方案标签
 * @returns 是否绑定成功（失败只 warn，不抛出：绑定失败不影响本机使用）
 * @sideeffect 成功时标记「已登记」，阻止后续自动登记重复写入
 */
export async function bindSelfTerminalProfile(profileId: string, label?: string): Promise<boolean> {
  try {
    await updateSelfTerminalBinding({
      clientId: getClientDeviceId(),
      profileId,
      label: label || undefined,
    })
    markTerminalRegistered()
    return true
  } catch (err) {
    logger.warn('同步终端方案绑定到服务端失败', err)
    return false
  }
}

/**
 * 统一天气实体 ID：layout 优先，其次 circadian。
 * @param layoutId layout 配置中的天气实体 ID
 * @param circadianId 昼夜节律模块提供的天气实体 ID
 * @returns 优先取 layoutId，为空则取 circadianId
 */
export function resolveWeatherEntityId(layoutId?: string | null, circadianId?: string | null): string {
  return String(layoutId || '').trim() || String(circadianId || '').trim()
}

/**
 * 将解析出的天气实体 ID 写回 layout 配置的 haConfig.weatherEntityId。
 * @param layoutConfig 布局配置对象（会就地修改）
 * @param entityId 天气实体 ID
 * @sideeffect 就地修改 layoutConfig.haConfig.weatherEntityId
 */
export function applyWeatherEntityIdToLayout(layoutConfig: UILayoutConfig, entityId: string): void {
  if (!layoutConfig.haConfig) layoutConfig.haConfig = {} as UILayoutConfig['haConfig']
  layoutConfig.haConfig.weatherEntityId = entityId
}
