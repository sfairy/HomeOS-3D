/**
 * Q02/U12：相机运动时压 anisotropy / 反射分辨率；闲时抬回。
 *
 * 从 `studio-render-loop.ts` 拆出，避免渲染循环宿主继续膨胀。
 */
import { resolveReflectionResolution, resolveTextureAnisotropy } from '../../../studio-resource-policy'

export { resolveReflectionResolution }

type GroundReflectionLike = {
  configure: (settings: Record<string, unknown>) => boolean
  settings: unknown
}

type AppearanceGroundReflection = Record<string, unknown> & {
  resolution?: number
}

type IdleTexture = {
  anisotropy?: number
  needsUpdate?: boolean
}

type IdleMaterial = Record<string, IdleTexture | undefined> | null | undefined

type IdleSceneNode = {
  material?: IdleMaterial | IdleMaterial[]
}

type IdleQualityAppCtx = {
  threeRenderer?: {
    capabilities?: { getMaxAnisotropy?: () => number }
  }
  threeScene?: {
    traverse?: (cb: (node: IdleSceneNode) => void) => void
  }
  reflectionSettingsJson?: string
  scheduleNearbyModelUpgrades?: () => void
}

/** 闲时抬 anisotropy；运动回到运动预算（不改材质，只改过滤上限）。 */
export function applyIdleTextureAnisotropy(
  appCtx: Pick<IdleQualityAppCtx, 'threeRenderer' | 'threeScene'>,
  isIdle: boolean,
): void {
  const deviceMax = appCtx.threeRenderer?.capabilities?.getMaxAnisotropy?.() || 1
  const nextAnisotropy = resolveTextureAnisotropy(isIdle, deviceMax)
  appCtx.threeScene?.traverse?.((node) => {
    const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : []
    for (const material of materials) {
      for (const mapKey of ['map', 'bumpMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
        const texture = material?.[mapKey]
        if (texture && typeof texture.anisotropy === 'number' && texture.anisotropy !== nextAnisotropy) {
          texture.anisotropy = nextAnisotropy
          texture.needsUpdate = true
        }
      }
    }
  })
}

/** 运动压反射分辨率；闲时恢复/保留外观档。 */
export function applyIdleReflectionBudget(params: {
  isIdle: boolean
  appearanceGroundReflection: AppearanceGroundReflection | null | undefined
  normalizeGroundReflection: (value: unknown) => AppearanceGroundReflection
  groundReflections: GroundReflectionLike
  appCtx: Pick<IdleQualityAppCtx, 'reflectionSettingsJson'>
  renderStudioFrame: () => void
}): void {
  const base = params.normalizeGroundReflection(params.appearanceGroundReflection)
  const next = {
    ...base,
    resolution: resolveReflectionResolution(params.isIdle, base.resolution ?? 0),
  }
  params.groundReflections.configure(next) &&
    ((params.appCtx.reflectionSettingsJson = JSON.stringify(params.groundReflections.settings)),
    params.renderStudioFrame())
}

/** 按运动态同步 anisotropy + 反射预算，闲时顺带触发近场模型升级。 */
export function syncIdleRenderQuality(params: {
  isIdle: boolean
  appCtx: IdleQualityAppCtx
  appearanceGroundReflection: AppearanceGroundReflection | null | undefined
  normalizeGroundReflection: (value: unknown) => AppearanceGroundReflection
  groundReflections: GroundReflectionLike
  renderStudioFrame: () => void
}): void {
  applyIdleTextureAnisotropy(params.appCtx, params.isIdle)
  applyIdleReflectionBudget({
    isIdle: params.isIdle,
    appearanceGroundReflection: params.appearanceGroundReflection,
    normalizeGroundReflection: params.normalizeGroundReflection,
    groundReflections: params.groundReflections,
    appCtx: params.appCtx,
    renderStudioFrame: params.renderStudioFrame,
  })
  params.isIdle && params.appCtx.scheduleNearbyModelUpgrades?.()
}

/** 外观配置里的地面反射：按当前是否闲时压分辨率。 */
export function capGroundReflectionForMotion(params: {
  appearanceGroundReflection: unknown
  normalizeGroundReflection: (value: unknown) => AppearanceGroundReflection
  isIdle: boolean
  resolveReflectionResolution: (isIdle: boolean, resolution: number) => number
}): { normalized: AppearanceGroundReflection; capped: AppearanceGroundReflection } {
  const normalized = params.normalizeGroundReflection(params.appearanceGroundReflection)
  return {
    normalized,
    capped: {
      ...normalized,
      resolution: params.resolveReflectionResolution(params.isIdle, normalized.resolution ?? 0),
    },
  }
}

/** 配置外观地面反射并在变更时刷新。 */
export function configureCappedGroundReflection(params: {
  appearanceGroundReflection: unknown
  normalizeGroundReflection: (value: unknown) => AppearanceGroundReflection
  isIdle: boolean
  groundReflections: GroundReflectionLike
  appCtx: Pick<IdleQualityAppCtx, 'reflectionSettingsJson'>
  assignAppearance: (normalized: AppearanceGroundReflection) => void
  onConfigured: () => void
}): void {
  const { normalized, capped } = capGroundReflectionForMotion({
    ...params,
    resolveReflectionResolution,
  })
  params.assignAppearance(normalized)
  params.groundReflections.configure(capped) &&
    ((params.appCtx.reflectionSettingsJson = JSON.stringify(params.groundReflections.settings)), params.onConfigured())
}

/** 创建「运动压画质 / 闲时抬回」回调，供 shadows / reflections 共用。 */
export function createMotionIdleQualityApplier(params: {
  appCtx: IdleQualityAppCtx
  getAppearanceGroundReflection: () => AppearanceGroundReflection | null | undefined
  normalizeGroundReflection: (value: unknown) => AppearanceGroundReflection
  groundReflections: GroundReflectionLike
  renderStudioFrame: () => void
}): (isMoving: boolean) => void {
  return (isMoving: boolean) =>
    syncIdleRenderQuality({
      isIdle: !isMoving,
      appCtx: params.appCtx,
      appearanceGroundReflection: params.getAppearanceGroundReflection(),
      normalizeGroundReflection: params.normalizeGroundReflection,
      groundReflections: params.groundReflections,
      renderStudioFrame: params.renderStudioFrame,
    })
}

export type PageHideBinding = {
  target?: EventTarget | null
  handler: EventListenerOrEventListenerObject
  options?: boolean | AddEventListenerOptions
}

/** F04：具名 pagehide（once）登记，teardown 时对称 remove。 */
export function bindNamedPageHideOnce(
  bindings: PageHideBinding[],
  handler: EventListenerOrEventListenerObject,
  target: EventTarget | null | undefined = globalThis.window,
): void {
  if (!target) return
  const options: AddEventListenerOptions = { once: true }
  target.addEventListener('pagehide', handler, options)
  bindings.push({ target, handler, options })
}
