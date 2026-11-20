/**
 * 「已放置」会话状态（隐藏 / 锁定）的跨模块读取口。
 *
 * 为什么单独一个模块：这份状态由**壳层**（已放置面板）写入，却要被**引擎**读取
 * （画布绘制、命中测试、拖拽拦截）。两边分属不同层，直接互相 import 会绕出环；
 * 用 `WeakMap<StudioAppContext, session>` 做注册表后，读取方只依赖本模块。
 *
 * 语义（与面板一致）：
 * - `hidden`：本次编辑内不画、不可命中。它是可视状态，**不进户型文档**。
 * - `locked`：可以选中（否则没法解锁），但拒绝拖动 / 旋转 / 改尺寸。
 *
 * 未注册时一律返回「不隐藏、不锁定」——引擎可以在面板挂载之前就正常工作。
 */
import type { StudioAppContext } from '../studio-app/studio-app-context'

/** 只声明读取需要的那几个方法，避免把面板实现拖进引擎依赖图。 */
export type PlacedVisibilitySource = {
  get(floorId: string, itemId: string): { hidden: boolean; locked: boolean }
  /** 隐藏集合的指纹；场景缓存用它判断「可见性变了没」（0.8.7 `visibilityKey`）。 */
  visibilityKey?: (floorId: string) => string
}

const sources = new WeakMap<StudioAppContext, PlacedVisibilitySource>()

export function registerPlacedVisibilitySource(appCtx: StudioAppContext, source: PlacedVisibilitySource): void {
  sources.set(appCtx, source)
}

const NEVER = { hidden: false, locked: false } as const

export function placedItemFlags(appCtx: StudioAppContext, itemId: unknown): { hidden: boolean; locked: boolean } {
  const source = sources.get(appCtx)
  if (!source) return { ...NEVER }
  return source.get(String(appCtx.activeFloorId ?? ''), String(itemId ?? ''))
}

export function isPlacedItemHidden(appCtx: StudioAppContext, itemId: unknown): boolean {
  return placedItemFlags(appCtx, itemId).hidden
}

export function isPlacedItemLocked(appCtx: StudioAppContext, itemId: unknown): boolean {
  return placedItemFlags(appCtx, itemId).locked
}

/**
 * 某一层隐藏集合的指纹（0.8.7 `session.visibilityKey(floorId)`）。
 *
 * 3D 渲染缓存 / 位姿缓存都按它失效：不带上这个键，隐藏后再切回来会命中隐藏前的缓存，
 * 画面上又出现那件已经藏起来的家具。未注册面板（嵌入舞台）时是空串。
 */
export function placedVisibilityKeyFor(appCtx: StudioAppContext, floorId: unknown): string {
  return sources.get(appCtx)?.visibilityKey?.(String(floorId ?? '')) ?? ''
}

/** 当前楼层的隐藏集合指纹（最常见的那次查询）。 */
export function placedVisibilityKey(appCtx: StudioAppContext): string {
  return placedVisibilityKeyFor(appCtx, appCtx.activeFloorId)
}
