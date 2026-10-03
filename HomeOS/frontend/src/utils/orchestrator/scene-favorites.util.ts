/**
 * 场景收藏：优先读写 layout.favoriteSceneIds（随 display profile 落盘），
 * localStorage 仅作迁移兜底。
 */
import { loadSceneFavorites, saveSceneFavorites } from '@/utils/bridge/quick-actions-bridge'

/** resolveFavoriteSceneIds：函数，按签名入参返回处理结果。 */
export function resolveFavoriteSceneIds(layoutIds: unknown): string[] {
  if (Array.isArray(layoutIds) && layoutIds.length) {
    return layoutIds.map(String).filter(Boolean)
  }
  return loadSceneFavorites().map(String).filter(Boolean)
}

/** persistFavoriteSceneIds：函数，按签名入参返回处理结果。 */
export function persistFavoriteSceneIds(
  ids: unknown,
  layout: { favoriteSceneIds?: string[] },
): string[] {
  const next = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))]
  layout.favoriteSceneIds = next
  saveSceneFavorites(next)
  return next
}
