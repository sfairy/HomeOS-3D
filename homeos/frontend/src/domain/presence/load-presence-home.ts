/**
 * 一次性拉取在家状态（非轮询场景用；轮询请用 usePresenceHome）
 */
import { fetchPresenceHome } from '@/domain/api/security'
import type { PresenceHomeMember } from '@/domain/presence/use-presence-home'

type PresenceHomeData = {
  members?: PresenceHomeMember[]
  autoMode?: boolean
  entityIds?: string[]
  persons?: Array<{ id?: string; name?: string }>
  atHomeCount?: number
  totalPersons?: number
  [key: string]: unknown
}

/**
 * @returns 后端 data；请求失败时返回 `null`（不抛错）
 *
 * 注意：`null` 表示「这次没读到」，与「读到了但没人」(`{ members: [] }`) 是两件事。
 * 调用方必须区分 —— 把失败当成空列表会让墙屏上的在家卡片在单次网络抖动后显示
 * 「无人在家」，那是安全敏感信息，不能用一次失败去改写。
 */
export async function loadPresenceHome(): Promise<PresenceHomeData | null> {
  try {
    const { data } = await fetchPresenceHome()
    if (data && typeof data === 'object') return data as PresenceHomeData
    return {}
  } catch {
    return null
  }
}
