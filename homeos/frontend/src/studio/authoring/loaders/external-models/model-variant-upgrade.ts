/**
 * Q03/U14：近场 / 聚焦时把已加载的 lite 升到 full GLB（冷启动仍走 lite）。
 *
 * 从 `studio-external-models.ts` 拆出，宿主只负责注入闭包依赖。
 */

export type ModelVariant = 'lite' | 'full'

type ModelDefinition = {
  url?: string
  fallbackUrl?: string
}

type WorldPositionTarget = {
  getWorldPosition?: (target: { distanceTo: (other: unknown) => number }) => void
}

type TraversableRoot = {
  traverse?: (cb: (node: ExternalModelNode) => void) => void
}

type ExternalModelNode = WorldPositionTarget & {
  userData?: { externalModelType?: string; modelType?: string }
  isObject3D?: boolean
}

type ThreeVector3Ns = {
  Vector3: new () => {
    distanceTo: (other: unknown) => number
  }
}

export type ModelVariantUpgradeDeps = {
  threeNamespace: ThreeVector3Ns
  allItemModels: Record<string, ModelDefinition | undefined>
  isDisposed: () => boolean
  preparedVariantByItemType: Map<string, ModelVariant>
  preparedTemplatesByItemType: Map<string, unknown>
  inflightLoadsByItemType: Map<string, unknown>
  loadTemplateForItem: (
    itemDefinition: ModelDefinition,
    itemTypeName: string,
    options?: { skipPersistentRestore?: boolean; preferFull?: boolean },
  ) => Promise<unknown>
  applyLoadedTemplate: (loadedItemType: string, loadResult: unknown) => unknown
  releaseModelAsset: (asset: unknown) => void
}

/** 单类型 lite→full；不做 Draco full；失败则保持 lite。 */
export async function upgradeExternalModelToFull(
  deps: ModelVariantUpgradeDeps,
  modelItemType: string,
): Promise<boolean> {
  if (deps.isDisposed() || !modelItemType) return false
  if (deps.preparedVariantByItemType.get(modelItemType) === 'full') return false
  const targetModelDefinition = deps.allItemModels[modelItemType]
  if (!targetModelDefinition?.fallbackUrl) return false
  if (deps.inflightLoadsByItemType.has(modelItemType)) return false
  const previousTemplate = deps.preparedTemplatesByItemType.get(modelItemType)
  try {
    const fullLoad = await deps.loadTemplateForItem(targetModelDefinition, modelItemType, {
      skipPersistentRestore: true,
      preferFull: true,
    })
    const nextTemplate = deps.applyLoadedTemplate(modelItemType, { ...(fullLoad as object), loadedVariant: 'full' })
    if (!nextTemplate) return false
    previousTemplate && previousTemplate !== nextTemplate && deps.releaseModelAsset(previousTemplate)
    deps.preparedVariantByItemType.set(modelItemType, 'full')
    return true
  } catch {
    return false
  }
}

/** 收集近场 / 聚焦候选类型（已是 full 的跳过）。 */
function collectNearCameraModelTypes(params: {
  threeNamespace: ThreeVector3Ns
  camera?: WorldPositionTarget
  root?: TraversableRoot
  nearDistance?: number
  focusTypes?: string[]
  preparedVariantByItemType: Map<string, ModelVariant>
}): Set<string> {
  const candidates = new Set<string>(
    (params.focusTypes || []).map((typeName) => String(typeName || '')).filter(Boolean),
  )
  const { camera, root } = params
  if (!camera || !root) return candidates
  const cameraWorld = new params.threeNamespace.Vector3()
  camera.getWorldPosition?.(cameraWorld)
  const nearDistance = params.nearDistance ?? 4
  root.traverse?.((node) => {
    const modelType = node?.userData?.externalModelType || node?.userData?.modelType
    if (!modelType || params.preparedVariantByItemType.get(modelType) === 'full') return
    if (!node.isObject3D) return
    const worldPos = new params.threeNamespace.Vector3()
    node.getWorldPosition?.(worldPos)
    if (worldPos.distanceTo(cameraWorld) <= nearDistance) candidates.add(String(modelType))
  })
  return candidates
}

/**
 * 收集**场景里实际用到**的全部模型类型（不看距离）。
 *
 * 为什么编辑器要这个：`lite` 是降面件，边缘是多段折线；俯瞰全屋时相机到家具通常 >4m，
 * 「近场升级」几乎不会触发，于是编辑时看到的一直是低模 —— 用户会以为是自己改坏了。
 * 编辑器是「看清楚再动手」的场景，宁可多占内存也要全量 full。
 */
function collectUsedModelTypes(params: {
  root?: TraversableRoot
  preparedVariantByItemType: Map<string, ModelVariant>
}): Set<string> {
  const used = new Set<string>()
  params.root?.traverse?.((node) => {
    const modelType = node?.userData?.externalModelType || node?.userData?.modelType
    if (!modelType) return
    const typeName = String(modelType)
    if (params.preparedVariantByItemType.get(typeName) === 'full') return
    used.add(typeName)
  })
  return used
}

/**
 * 编辑器专用：把场景里用到的模型**全部**升到 full，按批推进。
 *
 * 一次升完会同时发起几十个 GLB 请求并另存一份几何 —— 编辑时正要点选、拖拽，卡顿比模糊更烦。
 * 所以每轮只升 `batchSize` 个，用 `requestIdleCallback` 接着下一轮，直到没有剩的。
 * 返回本轮升级的类型名（调用方据此决定要不要重建）。
 */
export async function upgradeAllModelsInScene(
  deps: ModelVariantUpgradeDeps,
  {
    root,
    batchSize = 3,
    isStillWanted = () => true,
  }: { root?: TraversableRoot; batchSize?: number; isStillWanted?: () => boolean } = {},
): Promise<string[]> {
  if (deps.isDisposed() || !isStillWanted()) return []
  const candidates = collectUsedModelTypes({ root, preparedVariantByItemType: deps.preparedVariantByItemType })
  const upgraded: string[] = []
  for (const modelType of candidates) {
    if (upgraded.length >= batchSize) break
    if (deps.isDisposed() || !isStillWanted()) break
    if (!deps.allItemModels[modelType]?.fallbackUrl) continue
    ;(await upgradeExternalModelToFull(deps, modelType)) && upgraded.push(modelType)
  }
  return upgraded
}

/** 相机近场内的外部模型类型升 full；每轮最多 maxUpgrades 个，避免卡顿。 */
export async function upgradeModelsNearCamera(
  deps: ModelVariantUpgradeDeps,
  {
    camera,
    root,
    nearDistance = 4,
    maxUpgrades = 2,
    focusTypes = [],
  }: {
    camera?: WorldPositionTarget
    root?: TraversableRoot
    nearDistance?: number
    maxUpgrades?: number
    focusTypes?: string[]
  } = {},
): Promise<string[]> {
  if (deps.isDisposed()) return []
  const candidates = collectNearCameraModelTypes({
    threeNamespace: deps.threeNamespace,
    camera,
    root,
    nearDistance,
    focusTypes,
    preparedVariantByItemType: deps.preparedVariantByItemType,
  })
  const upgraded: string[] = []
  for (const modelType of candidates) {
    if (upgraded.length >= maxUpgrades) break
    if (deps.preparedVariantByItemType.get(modelType) === 'full') continue
    if (!deps.allItemModels[modelType]?.fallbackUrl) continue
    ;(await upgradeExternalModelToFull(deps, modelType)) && upgraded.push(modelType)
  }
  return upgraded
}

/** 宿主闭包只注入一次依赖，返回可挂到 manager API 的升级方法。 */
export function createVariantUpgradeApi(deps: ModelVariantUpgradeDeps) {
  return {
    upgradeExternalModelToFull: (modelItemType: string) => upgradeExternalModelToFull(deps, modelItemType),
    upgradeModelsNearCamera: (opts?: Parameters<typeof upgradeModelsNearCamera>[1]) =>
      upgradeModelsNearCamera(deps, opts),
    upgradeAllModelsInScene: (opts?: Parameters<typeof upgradeAllModelsInScene>[1]) =>
      upgradeAllModelsInScene(deps, opts),
  }
}

/** preferFull 时优先完整件 URL，否则走 lite。 */
export function resolveModelLoadTarget(
  itemDefinition: { url?: string; fallbackUrl?: string },
  preferFull: boolean,
): { primaryUrl: string; primaryVariant: ModelVariant; cachePrepared: boolean } {
  const useFull = preferFull && !!itemDefinition.fallbackUrl
  return {
    primaryUrl: (useFull ? itemDefinition.fallbackUrl : itemDefinition.url) || '',
    primaryVariant: useFull ? 'full' : 'lite',
    cachePrepared: !preferFull,
  }
}
