import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { finite as finite2 } from '../../../loaders/studio-normalization'
import { collectSharedMeshRecords } from '../../items/studio-shared-mesh-records'
import { mergeStaticItemMeshesCore } from '../../items/studio-static-item-meshes'
import {
  BATCH_FALLBACK,
  reportDegradation,
  reportDegradationRecovered,
} from '../../../../shared/diagnostics/degradation'

export function countMaterialTextures(_runtime: StudioAppRuntime, countedMaterial: any) {
  if (!countedMaterial || countedMaterial.isMeshBasicMaterial || countedMaterial.isShadowMaterial) return 0
  let textureCount = Object.values(countedMaterial).filter(
    (materialValue: any) => materialValue?.isTexture === true,
  ).length
  return (
    countedMaterial.isMeshPhysicalMaterial && finite2(countedMaterial.transmission, 0) > 0 && (textureCount += 1),
    textureCount
  )
}

export function findMaxMaterialTextures(runtime: StudioAppRuntime, textureSearchRoot = runtime.appCtx.sceneRootNode) {
  let maxTextureUnits = 0
  return (
    textureSearchRoot?.traverse((textureSearchMesh: any) => {
      if (!textureSearchMesh.isMesh) return
      const searchMaterials = Array.isArray(textureSearchMesh.material)
        ? textureSearchMesh.material
        : textureSearchMesh.material
          ? [textureSearchMesh.material]
          : []
      for (const searchMaterial of searchMaterials)
        maxTextureUnits = Math.max(maxTextureUnits, runtime.countMaterialTextures(searchMaterial))
    }),
    runtime.appCtx.threeScene?.environment?.isTexture && (maxTextureUnits += 1),
    maxTextureUnits
  )
}

export function getMaxTextureUnits(runtime: StudioAppRuntime) {
  const glHandle = runtime.appCtx.threeRenderer?.getContext?.(),
    maxTextureImageUnits = glHandle?.getParameter?.(glHandle.MAX_TEXTURE_IMAGE_UNITS)
  return Math.max(
    1,
    Math.floor(finite2(maxTextureImageUnits, runtime.appCtx.threeRenderer?.capabilities?.maxTextures || 16)),
  )
}

/**
 * 构建一组同款物件的 InstancedMesh。
 *
 * 0.8.7 的语义：**失败不销毁原件** —— 合批只是优化，构建抛错时原件必须继续由原对象绘制，
 * 否则整组物件会从画面消失（比性能回退严重得多）。因此这里把「建实例 + 移除原件」
 * 都放在 try 里，任一步抛错就整体放弃该组并上报一次降级。
 *
 * @returns 该组的合批统计；失败时返回 `null`（原件保持不动）
 */
function batchSignatureGroup(
  runtime: StudioAppRuntime,
  batchSceneRoot: any,
  invert3: any,
  signatureGroup: Array<{ item: { type: string; id: string }; group: unknown; descriptors: Array<{ mesh: any }> }>,
): { type: string; instances: number; before: number; after: number } | null {
  const descriptorCount = signatureGroup[0].descriptors.length
  const createdInstances: Array<{ geometry?: { dispose?: () => void } }> = []
  try {
    for (let descriptorIndex = 0; descriptorIndex < descriptorCount; descriptorIndex += 1) {
      const mesh = signatureGroup[0].descriptors[descriptorIndex].mesh,
        instanceMaterial = mesh.userData.externalModelSharedMaterial ? mesh.material : mesh.material.clone(),
        instancedMesh = new ns2.InstancedMesh(mesh.geometry, instanceMaterial, signatureGroup.length)
      ;(instancedMesh.name = 'homeos-instance-' + signatureGroup[0].item.type + '-' + (descriptorIndex + 1)),
        (instancedMesh.castShadow = mesh.castShadow),
        (instancedMesh.receiveShadow = mesh.receiveShadow),
        (instancedMesh.renderOrder = mesh.renderOrder),
        instancedMesh.instanceMatrix.setUsage(ns2.StaticDrawUsage),
        runtime.isEmbeddedStage && (instancedMesh.matrixAutoUpdate = false),
        (instancedMesh.userData.externalModelSharedGeometry = true),
        (instancedMesh.userData.externalModelSharedTextures = true),
        (instancedMesh.userData.externalModelSharedMaterial = mesh.userData.externalModelSharedMaterial === true),
        (instancedMesh.userData.modelLayer = 'items'),
        (instancedMesh.userData.exportRole = 'plan'),
        (instancedMesh.userData.instanceItemType = signatureGroup[0].item.type),
        (instancedMesh.userData.instanceItemIds = signatureGroup.map(
          ({ item: batchItemEntry }: any) => batchItemEntry.id,
        )),
        signatureGroup.forEach(({ descriptors: batchDescriptor }: any, instanceIndex: any) => {
          const multiplyMatrices3 = new ns2.Matrix4().multiplyMatrices(
            invert3,
            batchDescriptor[descriptorIndex].mesh.matrixWorld,
          )
          instancedMesh.setMatrixAt(instanceIndex, multiplyMatrices3)
        }),
        (instancedMesh.instanceMatrix.needsUpdate = true),
        instancedMesh.computeBoundingBox(),
        instancedMesh.computeBoundingSphere(),
        batchSceneRoot.add(instancedMesh)
      createdInstances.push(instancedMesh)
    }
  } catch (batchError) {
    // 已建出的实例要退回：留着会与原件重复绘制（同一物件画两遍）。
    for (const createdInstance of createdInstances) {
      batchSceneRoot.remove(createdInstance)
      runtime.disposeObjectTree(createdInstance)
    }
    reportDegradation(BATCH_FALLBACK, batchError)
    return null
  }
  for (const { group: batchGroup } of signatureGroup)
    batchSceneRoot.remove(batchGroup), runtime.disposeObjectTree(batchGroup)
  // 本组成功了：如果之前有失败批次，报一次恢复（0.8.7 的 `STUDIO_BATCH_PROGRESS_RESUMED`）。
  reportDegradationRecovered(BATCH_FALLBACK)
  return {
    type: signatureGroup[0].item.type,
    instances: signatureGroup.length,
    before: signatureGroup.length * descriptorCount,
    after: descriptorCount,
  }
}

export function batchSharedMeshes(runtime: StudioAppRuntime, batchSceneRoot: any, batchItemEntries: any) {
  const signatureGroupsByKey = new Map()
  for (const { item: batchItem, group: batchItemGroup } of batchItemEntries) {
    if (
      runtime.instanceTestTypeSet.has(batchItem.type) ||
      (runtime.isEmbeddedStage &&
        [
          'airer',
          'fan',
          'storagewaterheater',
          'gaswaterheater',
          'airpurifier',
          'wallac',
          'floorac',
          'airoutlet',
          'curtain',
          'nas',
          'fridge',
          'freezer',
          'dishwasher',
          'washer',
          'dryer',
          'plant',
          'camera',
          'presence',
          'speaker',
          'tv',
          'robotvacuum',
          'smallcar',
          'suv',
          'scooter',
        ].includes(batchItem.type)) ||
      runtime.createSelectionRef('item', batchItem.id)
    )
      continue
    const kv2 = collectSharedMeshRecords(batchItemGroup)
    if (!kv2) continue
    const batchSignature = JSON.stringify([batchItem.type, kv2.map((meshDescriptor: any) => meshDescriptor.signature)])
    signatureGroupsByKey.has(batchSignature) || signatureGroupsByKey.set(batchSignature, []),
      signatureGroupsByKey.get(batchSignature).push({
        item: batchItem,
        group: batchItemGroup,
        descriptors: kv2,
      })
  }
  batchSceneRoot.updateMatrixWorld(true)
  const invert3 = batchSceneRoot.matrixWorld.clone().invert(),
    instanceBatchStats: any[] = []
  for (const signatureGroup of signatureGroupsByKey.values()) {
    if (signatureGroup.length < 2) continue
    const groupStats = batchSignatureGroup(runtime, batchSceneRoot, invert3, signatureGroup)
    // 失败时返回 null：原件保持不动（由原对象继续绘制），继续处理下一组。
    groupStats && instanceBatchStats.push(groupStats)
  }
  return (
    (batchSceneRoot.userData.instanceBatchStats = instanceBatchStats),
    runtime.appCtx.threeRenderer?.domElement &&
      ((runtime.appCtx.threeRenderer.domElement.dataset.instanceBatchCount = String(instanceBatchStats.length)),
      (runtime.appCtx.threeRenderer.domElement.dataset.instanceCount = String(
        instanceBatchStats.reduce(
          (instanceCountAccumulator, batchStat) => instanceCountAccumulator + batchStat.instances,
          0,
        ),
      )),
      (runtime.appCtx.threeRenderer.domElement.dataset.instanceDrawCallsSaved = String(
        instanceBatchStats.reduce(
          (savedCountAccumulator, savedStat) => savedCountAccumulator + savedStat.before - savedStat.after,
          0,
        ),
      ))),
    instanceBatchStats
  )
}

/** 静态物品网格合批（原 studio-app 直系声明，P4 搬进 `items/studio-static-item-meshes`，此处只转发句柄）。 */
export function mergeStaticItemMeshes(runtime: StudioAppRuntime, mergeSceneRoot: any, mergeItemEntries: any) {
  return mergeStaticItemMeshesCore(runtime.studioStaticItemMeshesDeps(), mergeSceneRoot, mergeItemEntries)
}

export function collectSharedMaterials(runtime: StudioAppRuntime) {
  const sharedMaterialSet = new Set()
  return (
    runtime.appCtx.sceneRootNode?.traverse((sharedMesh: any) => {
      if (!sharedMesh.isMesh || !sharedMesh.userData.externalModelSharedGeometry) return
      const meshMaterials = Array.isArray(sharedMesh.material)
        ? sharedMesh.material
        : sharedMesh.material
          ? [sharedMesh.material]
          : []
      for (const sharedMaterial of meshMaterials)
        sharedMaterial && !runtime.disposedMaterialSet.has(sharedMaterial) && sharedMaterialSet.add(sharedMaterial)
    }),
    [...sharedMaterialSet]
  )
}

export function updateExternalModelDataset(runtime: StudioAppRuntime) {
  if (!runtime.appCtx.threeRenderer?.domElement) return
  const modelLoadState3 = runtime.externalModelRegistry.modelLoadState()
  ;(runtime.appCtx.threeRenderer.domElement.dataset.externalSharedMaterialCount = String(modelLoadState3.materials)),
    (runtime.appCtx.threeRenderer.domElement.dataset.externalMaterialReuseCount = String(
      modelLoadState3.materialReuses,
    )),
    (runtime.appCtx.threeRenderer.domElement.dataset.externalPrecompilePassCount = String(
      runtime.appCtx.externalPrecompilePassCount,
    )),
    (runtime.appCtx.threeRenderer.domElement.dataset.lightPrecompilePassCount = String(
      runtime.appCtx.lightPrecompilePassCount,
    ))
}
