/**
 * Q02/U12：相机运动时压 anisotropy / 反射分辨率；闲时抬回。
 *
 * 从 `studio-render-loop.ts` 拆出，避免渲染循环宿主继续膨胀。
 */
import {
  applyTreeTextureAnisotropy,
  isLegacyTextureQuality,
  textureAnisotropyFor,
} from '../../../render-kit/texture-quality'
import { urlFlag } from '../../../render-kit/url-flags'
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

const legacyTextureQuality = isLegacyTextureQuality()

/**
 * 反射分辨率默认不随运动切换：256 ↔ 512 每次都要 setSize 重分配渲染目标并整批重捕，
 * 起步与停下各卡一拍。`?reflection-motion-resolution=cap` 恢复旧的运动压分辨率（计划 0.9 移除）。
 * 低端设备在 `resolveReflectionResolution` 里全程封顶，不受影响。
 */
const capReflectionDuringMotion = urlFlag('reflection-motion-resolution') === 'cap'

const reflectionBudgetIdle = (isIdle: boolean) => isIdle || !capReflectionDuringMotion

/**
 * 仅 `?texture-quality=legacy`：闲时抬 anisotropy、运动回到运动预算。
 * 默认路径下各向异性由 `render-kit/texture-quality` 在上传前一次定好，这里不再触发全场重传。
 */
function applyIdleTextureAnisotropy(
  appCtx: Pick<IdleQualityAppCtx, 'threeRenderer' | 'threeScene'>,
  isIdle: boolean,
): void {
  if (!legacyTextureQuality) return
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
function applyIdleReflectionBudget(params: {
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
    resolution: resolveReflectionResolution(reflectionBudgetIdle(params.isIdle), base.resolution ?? 0),
  }
  params.groundReflections.configure(next) &&
    ((params.appCtx.reflectionSettingsJson = JSON.stringify(params.groundReflections.settings)),
    params.renderStudioFrame())
}

/** 按运动态同步 anisotropy + 反射预算，闲时顺带触发近场模型升级。 */
function syncIdleRenderQuality(params: {
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
function capGroundReflectionForMotion(params: {
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
      resolution: params.resolveReflectionResolution(reflectionBudgetIdle(params.isIdle), normalized.resolution ?? 0),
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

type RevisionedSceneCtx = {
  sceneRevisionCount?: number
  modelRevisionCounter?: number
  threeRenderer?: Parameters<typeof textureAnisotropyFor>[0]
  threeScene?: {
    traverse?: (visit: (node: ShadowCasterNode & IdleSceneNode) => void) => void
  }
}

type ShadowCasterNode = {
  isLight?: boolean
  castShadow?: boolean
  shadow?: { intensity?: number } | null
}

const revisionKey = (appCtx: RevisionedSceneCtx) => `${appCtx.sceneRevisionCount}:${appCtx.modelRevisionCounter}`

/** 场景/模型版本变化后的首帧之前补齐各向异性（只升不降、不触发重传）。 */
export function createSceneTextureAnisotropySync(appCtx: RevisionedSceneCtx): () => void {
  let appliedKey = ''
  return () => {
    const nextKey = revisionKey(appCtx)
    if (legacyTextureQuality || nextKey === appliedKey) return
    appliedKey = nextKey
    applyTreeTextureAnisotropy(appCtx.threeScene, textureAnisotropyFor(appCtx.threeRenderer))
  }
}

/** 运动起步要静音的投影灯：按场景/模型版本缓存，不在每次起步都遍历整棵场景树。 */
export function createShadowCasterMuter(
  appCtx: RevisionedSceneCtx,
  baselineIntensities: Map<NonNullable<ShadowCasterNode['shadow']>, number>,
): () => void {
  let casterKey = ''
  let casters: ShadowCasterNode[] = []
  return () => {
    const nextKey = revisionKey(appCtx)
    if (nextKey !== casterKey) {
      casterKey = nextKey
      casters = []
      appCtx.threeScene?.traverse?.((node) => {
        node.isLight && node.castShadow && node.shadow && casters.push(node)
      })
    }
    for (const caster of casters) {
      const shadow = caster.castShadow ? caster.shadow : null
      if (!shadow) continue
      baselineIntensities.has(shadow) || baselineIntensities.set(shadow, shadow.intensity ?? 1)
      shadow.intensity = 0
    }
  }
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
