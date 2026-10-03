/**
 * 一次性拉取在家状态（非轮询场景用；轮询请用 usePresenceHome）
 */
import { fetchPresenceHome } from '@/services/api/security'
import type { PresenceHomeMember } from '@/composables/presence/usePresenceHome'

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
 * @returns 后端 data；失败时返回 null（不抛错）
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
