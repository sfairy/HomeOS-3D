/**
 * 叠层避让的障碍物登记表。
 *
 * 3D 标签（`.editor-3d-label`）与标尺标签都要避开「可点击但不在同一个坐标系里」的元素：
 * 工作区切换条、灯带工具条。它们分别由不同模块创建，直接在两边互相 import 会形成环
 * （`studio-workspace-view` → `editor-3d-wiring` → `studio-workspace-view`）。
 *
 * 这里只放一个 WeakMap：创建方 `register`，使用方 `collect`。两边都只依赖本模块。
 */
export type OverlayObstacleRect = { left: number; right: number; top: number; bottom: number }
export type OverlayObstacleProvider = (root: HTMLElement) => OverlayObstacleRect[]

const providers = new WeakMap<object, Set<OverlayObstacleProvider>>()

/** 登记一个障碍物来源；返回注销函数。 */
export function registerOverlayObstacles(appCtx: object, provider: OverlayObstacleProvider): () => void {
  let set = providers.get(appCtx)
  if (!set) {
    set = new Set()
    providers.set(appCtx, set)
  }
  set.add(provider)
  return () => {
    set?.delete(provider)
    if (set && set.size === 0) providers.delete(appCtx)
  }
}

/** 收集某个宿主内所有已登记的障碍物矩形。 */
export function collectOverlayObstacles(appCtx: object, root: HTMLElement): OverlayObstacleRect[] {
  const set = providers.get(appCtx)
  if (!set) return []
  const rects: OverlayObstacleRect[] = []
  for (const provider of set) {
    try {
      rects.push(...provider(root))
    } catch {
      /* 单个来源失效（元素被卸载）不影响其它来源 */
    }
  }
  return rects
}
