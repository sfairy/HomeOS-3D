/**
 * 场景激活：HA scene.* 走 callService；HomeOS 编排场景走 /scene/:id/execute。
 * 访客仅允许白名单内的 HomeOS 场景（与后端 guest-write 对齐）。
 */
import { getEntityDomain } from '@homeos/shared'
import { executeScene } from '@/services/api/orchestrator'

/** 场景激活走到的执行通道 */
export type SceneActivateKind = 'ha' | 'homeos'

/**
 * 是否为 HA 原生场景实体。
 *
 * 实体缓存可能尚未 hydration（`hasHaEntity` 为 false），此时不能仅凭缓存判定为
 * HomeOS 编排场景，否则会把 HA 的 `scene.*` 误路由到 `/scene/:id/execute` 而报错。
 * 故以 `scene.` 前缀（实体域）作为兜底判据。
 *
 * @param id 场景标识（HA 实体 ID 或 HomeOS 编排场景 ID）
 * @param hasHaEntity 本地实体缓存是否命中
 * @returns true 表示按 HA 场景处理
 */
function isHaSceneEntity(id: string, hasHaEntity: boolean): boolean {
  return hasHaEntity || getEntityDomain(id) === 'scene'
}

/**
 * 判断当前账号是否可激活指定场景（纯函数，不产生副作用）。
 *
 * 判定顺序：
 * 1. 白名单命中 → 放行（访客白名单场景也不受 canControl 限制）；
 * 2. 访客且未命中白名单 → 拒绝；
 * 3. HA 场景 → 取决于 canControl；
 * 4. 非 HA 场景（HomeOS 编排）→ 放行。
 *
 * @param input 场景 ID、是否命中 HA 实体、控制权限、访客身份、白名单
 * @returns 是否允许激活
 */
export function canActivateSceneId(input: {
  id: string
  hasHaEntity: boolean
  canControl: boolean
  isGuest: boolean
  allowedSceneIds: string[]
}): boolean {
  const { id, hasHaEntity, canControl, isGuest, allowedSceneIds } = input
  if (allowedSceneIds.includes(id)) return true
  if (isGuest) return false
  if (isHaSceneEntity(id, hasHaEntity)) return canControl
  return true
}

/**
 * 激活收藏/面板中的场景。
 *
 * 路由规则：白名单命中或非 HA 场景 → HomeOS `executeScene`；否则 HA `scene.turn_on`。
 *
 * @param input 场景 ID、是否命中 HA 实体、控制权限、访客身份、白名单、HA 调用函数
 * @returns 实际走到的执行通道（'ha' | 'homeos'）
 * @throws 当前账号无权限执行该场景时抛出 Error
 */
export async function activateSceneById(input: {
  id: string
  hasHaEntity: boolean
  canControl: boolean
  isGuest: boolean
  allowedSceneIds: string[]
  callHaScene: (entityId: string) => Promise<unknown>
}): Promise<SceneActivateKind> {
  const { id, hasHaEntity, allowedSceneIds, callHaScene } = input
  if (!canActivateSceneId(input)) {
    throw new Error('当前账号无权限执行场景')
  }
  const haScene = isHaSceneEntity(id, hasHaEntity)
  const preferHomeos = allowedSceneIds.includes(id) || !haScene
  if (preferHomeos) {
    await executeScene(id)
    return 'homeos'
  }
  await callHaScene(id)
  return 'ha'
}
