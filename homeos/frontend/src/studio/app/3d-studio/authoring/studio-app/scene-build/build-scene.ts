/**
 * 场景装配：网格构建器、共享网格池、图层组织、载荷解析与总装。
 * 拆分曾让「加一类物体」需要在 5 个文件里各加一段，装配顺序难以一次看全。
 */

import { type StudioAppRuntime } from '../runtime/studio-app-runtime'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { RoundedBoxGeometry as RoundedBoxGeometry2 } from '/static/vendor/three/0.187.0/RoundedBoxGeometry.js'
import { clamp as clamp2, polygonArea as polygonArea2, subtractPolygonLoops as subtractPolygonLoops2 } from '../../../plan/geometry'
import { type ArchitectureMeshOptions, type PlanEditPreviewFlags } from '../../types/studio-app-types'
import { collectChildMeshes } from '../../items/studio-furniture-batching'
import { buildMaterialSignature, collectSharedMeshRecords } from '../../items/studio-shared-mesh-records'
import { addArchitectureMesh as addArchitectureMeshCore, addWindowFrames as addWindowFramesCore } from '../../scene/studio-box-mesh'
import { buildItemModel as buildItemModelCore } from '../../items/studio-item-model'
import { drawDoor as drawDoorCore, drawCourtyardArea as drawCourtyardAreaCore } from '../../../plan/studio-plan-item-drawing'
import { createOutlinePath as createOutlinePathCore, buildShapesWithHoles as buildShapesWithHolesCore, createSceneWallSideMaterial as createWallSideMaterialCore, createWallTopMaterial as createWallTopMaterialCore, expandPolygonOutward as expandPolygonOutwardCore, buildInteriorScene as buildInteriorSceneCore } from '../../scene/walls/studio-walls'
import { wallUnionFallbackCount } from '../../../plan/studio-wall-union'
import { finite as finite2, isCourtyardDrawing as isCourtyardDrawing2 } from '../../../loaders/studio-normalization'
import { mergeStaticItemMeshesCore } from '../../items/studio-static-item-meshes'
import { finishWallFurniture, mountFloorRegionVisualsForScene } from './floor'
import { BATCH_FALLBACK, reportDegradation, reportDegradationRecovered } from '../../../../shared/diagnostics/degradation'
import { compactStaticDeviceParts as compactStaticDeviceParts2 } from '../../items/studio-device-batching'
import { isCourtyardPlanItem as isCourtyardPlanItem2 } from '../../../plan/courtyard-plan'
import { sceneModelOrigin as sceneModelOrigin2 } from '../../../plan/courtyard-drawing'
import { applyShadowReceiverTrial as applyShadowReceiverTrial2 } from '../../studio-shadow-receiver-trial'
import { buildStaticMaterialKey } from '../../../materials/studio-static-material-key'
import { compactRuntimeFurniture as compactRuntimeFurniture2 } from '../../items/studio-runtime-furniture'
import { cacheObjectTransforms as cacheObjectTransforms2 } from '../../../../bridge/scene/scene-matrices'
import { mergeGeometries as mergeGeometries2 } from '/static/vendor/three/0.187.0/BufferGeometryUtils.js'
import { lampItemTypeSet, tvMountStyleSet } from '../../items/item-catalog'
import { isPlacedItemHidden, placedVisibilityKey, placedVisibilityKeyFor } from '../../items/placed-item-state'
import { applyItemOrientation } from '../geometry/geometry'
import { isWarmSceneStyle } from '../../../../shared/scene-styles'
import { MATERIAL_STYLE_AUTO, materialStylePaletteColors, normalizeMaterialStyle } from '../../../materials/studio-material-presets'
import { userDecorationModelDefinition } from '../../../loaders/external-models/user-decoration-models'
import { RENDER_CACHE_VERSION as RENDER_CACHE_VERSION2, cacheSceneDescriptor as cacheSceneDescriptor2, sha256 as sha2562, stableCacheJSON as stableCacheJSON2 } from '../../../../bridge/scene/render-cache'
import { ALL_ITEM_MODELS as ALL_ITEM_MODELS2 } from '../../../loaders/studio-external-models'
import { normalizePillarShape as normalizePillarShape2 } from '../../items/studio-item-posture'
import { STORAGE_SECTION_TYPES, storageSectionModelType } from '../../items/studio-storage-sections'
import { normalizeMaterialSurfaceOverrides } from '../../scene/payload/studio-scene-payload'
import { normalizeStudioDocument } from '../../scene/payload/studio-document-payload'
import { validGeometryLoops as validGeometryLoops2 } from '../../../cache/geometry-persistent-cache'
import { floorOpeningPolygon as floorOpeningPolygon2 } from '../../../plan/studio-floor-openings'
import { mergeWallBands as mergeWallBands2 } from '../../../materials/studio-wall-materials'
import { createGroundGrid } from '../geometry/floor-geometry'
import { type StudioAppContext } from '../studio-app-context'


export function disposeObjectTree(runtime: StudioAppRuntime, disposedRoot: any) {
  const geometrySet = new Set(),
    materialDisposeSet = new Set(),
    textureSet = new Set()
  disposedRoot.traverse((traversedNode: any) => {
    traversedNode.userData.architectureSharedGeometry && (runtime.shouldTrimSharedGeometry = true),
      traversedNode.shadow?.dispose?.(),
      traversedNode.geometry &&
        !geometrySet.has(traversedNode.geometry) &&
        !traversedNode.userData.effectControllerOwned &&
        !traversedNode.userData.externalModelSharedGeometry &&
        !traversedNode.userData.sofaSharedGeometry &&
        !traversedNode.userData.rugSharedGeometry &&
        !traversedNode.userData.architectureSharedGeometry &&
        (geometrySet.add(traversedNode.geometry), traversedNode.geometry.dispose?.())
    const nodeMaterials = Array.isArray(traversedNode.material)
      ? traversedNode.material
      : traversedNode.material
        ? [traversedNode.material]
        : []
    for (const nodeMaterial of nodeMaterials)
      if (!materialDisposeSet.has(nodeMaterial)) {
        if (
          (materialDisposeSet.add(nodeMaterial),
          !traversedNode.userData.effectControllerOwned &&
            !traversedNode.userData.externalModelSharedTextures &&
            !traversedNode.userData.externalModelSharedMaterial &&
            !traversedNode.userData.sofaSharedMaterial &&
            !traversedNode.userData.rugSharedMaterial &&
            !traversedNode.userData.architectureSharedMaterial)
        ) {
          for (const [materialPropertyKey, materialPropertyValue] of Object.entries(nodeMaterial) as [string, any][])
            materialPropertyKey === 'envMap' ||
              !materialPropertyValue?.isTexture ||
              materialPropertyValue.isRenderTargetTexture ||
              textureSet.has(materialPropertyValue) ||
              (textureSet.add(materialPropertyValue), materialPropertyValue.dispose())
        }
        !traversedNode.userData.effectControllerOwned &&
          !traversedNode.userData.sofaSharedMaterial &&
          !traversedNode.userData.rugSharedMaterial &&
          !traversedNode.userData.architectureSharedMaterial &&
          !traversedNode.userData.externalModelSharedMaterial &&
          !runtime.previewResources?.retire(nodeMaterial) &&
          nodeMaterial.dispose?.()
      }
  })
}

export function disposeFloorScene(runtime: StudioAppRuntime) {
  if (runtime.appCtx.sceneRootNode) {
    for (const floorChildObject of [...runtime.appCtx.sceneRootNode.children])
      runtime.appCtx.sceneRootNode.remove(floorChildObject), runtime.disposeObjectTree(floorChildObject)
  }
}

/** 墙体构件（原 studio-app 直系声明，P4 搬进 `scene/studio-walls`，此处绑定外部状态）。 */
export function createOutlinePath(runtime: StudioAppRuntime, outlineShapeConstructor: any, outlinePointList: any) {
  return createOutlinePathCore(runtime.studioWallsDeps(), outlineShapeConstructor, outlinePointList)
}

/** 墙体构件（同族，转发见 `scene/studio-walls`）。 */
export function buildShapesWithHoles(runtime: StudioAppRuntime, polygonLoopList: any) {
  return buildShapesWithHolesCore(runtime.studioWallsDeps(), polygonLoopList)
}

/** 墙体构件（同族，转发见 `scene/studio-walls`）。 */
export function createWallSideMaterial(
  runtime: StudioAppRuntime,
  wallSideColor: any,
  wallSideOpacity: any,
  wallSideOptions: any = {},
) {
  return createWallSideMaterialCore(runtime.studioWallsDeps(), wallSideColor, wallSideOpacity, wallSideOptions)
}

/** 墙体构件（同族，转发见 `scene/studio-walls`）。 */
export function createWallTopMaterial(
  runtime: StudioAppRuntime,
  wallTopBaseColor: any,
  wallTopOpacity: any,
  wallTopOptions: any = {},
) {
  return createWallTopMaterialCore(runtime.studioWallsDeps(), wallTopBaseColor, wallTopOpacity, wallTopOptions)
}

/** 墙体构件（同族，转发见 `scene/studio-walls`）。 */
export function expandPolygonOutward(runtime: StudioAppRuntime, polygonPointList: any, outwardOffset: any) {
  return expandPolygonOutwardCore(runtime.studioWallsDeps(), polygonPointList, outwardOffset)
}

/** 墙体构件（同族，转发见 `scene/studio-walls`）。 */
export function buildInteriorScene(
  runtime: StudioAppRuntime,
  interiorDeps: { ppm: any; toWorld: any; floorSurfaceY: any },
) {
  const builtWalls = buildInteriorSceneCore(runtime.studioWallsDeps(), interiorDeps),
    diagnosticsElement = runtime.appCtx.threeRenderer?.domElement
  // 并集失败的次数写进 dataset，验收脚本/诊断面板不用打开控制台就能读到。
  diagnosticsElement && (diagnosticsElement.dataset.wallUnionFallbacks = String(wallUnionFallbackCount()))
  return builtWalls
}

/** 物品模型总装（原 studio-app 直系声明，P4 搬进 `items/studio-item-model`，此处只转发句柄）。 */
export function buildItemModel(runtime: StudioAppRuntime, modelItem: any, modelShadowIds: any = null) {
  return buildItemModelCore(runtime.studioItemModelDeps(), modelItem, modelShadowIds)
}

/** 门平面符号（原 studio-app 直系声明，P4 搬进 `plan/studio-plan-item-drawing`，此处只转发句柄）。 */
export function drawDoor(runtime: StudioAppRuntime, doorRecord: any, doorView: PlanEditPreviewFlags = {}) {
  return drawDoorCore(runtime.studioPlanItemDrawingDeps(), doorRecord, doorView)
}

/** 庭院区 / 部件的平面绘制（同上）。 */
export function drawCourtyardArea(runtime: StudioAppRuntime, planItem: any) {
  return drawCourtyardAreaCore(runtime.studioPlanItemDrawingDeps(), planItem)
}

/** 盒子网格构件（原 studio-app 直系声明，P4 搬进 `scene/studio-box-mesh`，此处绑定外部状态）。 */
export function addArchitectureMesh(
  runtime: StudioAppRuntime,
  architectureParent: any,
  architectureSpecs: any,
  architectureColor: any,
  architectureOptions: ArchitectureMeshOptions = {},
) {
  return addArchitectureMeshCore(
    runtime.studioBoxMeshDeps(),
    architectureParent,
    architectureSpecs,
    architectureColor,
    architectureOptions,
  )
}

export function addWindowFrames(
  runtime: StudioAppRuntime,
  windowParent: any,
  windowOpenings: any,
  windowFrameColor: any,
  windowGlassColor: any,
) {
  return addWindowFramesCore(
    runtime.studioBoxMeshDeps(),
    windowParent,
    windowOpenings,
    windowFrameColor,
    windowGlassColor,
  )
}

export function buildRugGeometry(runtime: StudioAppRuntime, rugWidth: any, rugThickness: any, rugDepth: any) {
  const clampedRugThickness = clamp2(rugThickness, 0.004, 0.018),
    rugGeometryKey = rugWidth + ':' + clampedRugThickness + ':' + rugDepth
  if (!runtime.floorGroupCacheByKey.has(rugGeometryKey)) {
    const rugMinDimension = Math.max(Math.min(rugWidth, clampedRugThickness, rugDepth), 0.001),
      rugCornerRadius = Math.min(Math.min(rugWidth, rugDepth) * 0.018, rugMinDimension * 0.45, 0.08),
      rugBaseGeometry = new RoundedBoxGeometry2(rugWidth, clampedRugThickness, rugDepth, 2, rugCornerRadius),
      rugInsetGeometry = new ns2.PlaneGeometry(rugWidth * 0.88, rugDepth * 0.84)
    runtime.floorGroupCacheByKey.set(rugGeometryKey, {
      base: rugBaseGeometry,
      inset: rugInsetGeometry,
      rugThickness: clampedRugThickness,
    })
  }
  return runtime.floorGroupCacheByKey.get(rugGeometryKey)
}

export function createRugMaterial(runtime: StudioAppRuntime, rugColor: any, isInsetMaterial = false) {
  const rugMaterialKey = (isInsetMaterial ? 'inset' : 'base') + ':' + rugColor
  return (
    runtime.materialCacheByKey.has(rugMaterialKey) ||
      runtime.materialCacheByKey.set(
        rugMaterialKey,
        new ns2.MeshStandardMaterial({
          color: rugColor,
          roughness: 1,
          metalness: 0,
          ...(isInsetMaterial
            ? {
                polygonOffset: true,
                polygonOffsetFactor: -2,
                polygonOffsetUnits: -4,
              }
            : {}),
        }),
      ),
    runtime.materialCacheByKey.get(rugMaterialKey)
  )
}

export function addRugMeshes(
  runtime: StudioAppRuntime,
  rugParent: any,
  rugItem: any,
  rugBaseColor: any,
  rugInsetColor: any,
) {
  const bv2 = runtime.buildRugGeometry(rugItem.width, rugItem.height, rugItem.depth)
  if (!bv2) return false
  const ne7 = runtime.createSelectionRef('item', rugItem.id),
    clone3 = ne7 ? runtime.createRugMaterial(rugBaseColor).clone() : runtime.createRugMaterial(rugBaseColor),
    rugBaseMesh = new ns2.Mesh(bv2.base, clone3)
  ;(rugBaseMesh.position.y = bv2.rugThickness * 0.5),
    (rugBaseMesh.castShadow = false),
    (rugBaseMesh.receiveShadow = true),
    (rugBaseMesh.userData.rugSharedGeometry = true),
    (rugBaseMesh.userData.rugSharedMaterial = !ne7),
    rugParent.add(rugBaseMesh)
  const clone4 = ne7
      ? runtime.createRugMaterial(rugInsetColor, true).clone()
      : runtime.createRugMaterial(rugInsetColor, true),
    rugInsetMesh = new ns2.Mesh(bv2.inset, clone4)
  return (
    (rugInsetMesh.rotation.x = -Math.PI / 2),
    (rugInsetMesh.position.y = bv2.rugThickness + 0.001),
    (rugInsetMesh.castShadow = false),
    (rugInsetMesh.receiveShadow = true),
    (rugInsetMesh.renderOrder = 1),
    (rugInsetMesh.userData.rugSharedGeometry = true),
    (rugInsetMesh.userData.rugSharedMaterial = !ne7),
    rugParent.add(rugInsetMesh),
    (rugParent.userData.optimizationStats = {
      type: 'rug',
      before: 2,
      after: 2,
      sharedResources: true,
    }),
    true
  )
}

export function mergeMeshesByType(runtime: StudioAppRuntime, mergeRoot: any, mergeItemType: any) {
  if (!runtime.optimizedItemKeySet.has(mergeItemType)) return
  const gu4 = collectChildMeshes(mergeRoot),
    geometryByKey = new Map(),
    materialBySignature = new Map()
  for (const mergeMesh of gu4) {
    const geometryParameters = mergeMesh.geometry?.parameters,
      meshGeometryKey = geometryParameters ? mergeMesh.geometry.type + ':' + JSON.stringify(geometryParameters) : ''
    meshGeometryKey && geometryByKey.has(meshGeometryKey)
      ? (mergeMesh.geometry.dispose(), (mergeMesh.geometry = geometryByKey.get(meshGeometryKey)))
      : meshGeometryKey && geometryByKey.set(meshGeometryKey, mergeMesh.geometry)
    const tg2 = buildMaterialSignature(mergeMesh)
    tg2 && materialBySignature.has(tg2)
      ? (mergeMesh.material.dispose(), (mergeMesh.material = materialBySignature.get(tg2)))
      : tg2 && materialBySignature.set(tg2, mergeMesh.material)
  }
  mergeRoot.userData.optimizationStats = {
    type: mergeItemType,
    before: gu4.length,
    after: gu4.length,
    uniqueGeometries: new Set(gu4.map((uniqueGeometryMesh: any) => uniqueGeometryMesh.geometry)).size,
    uniqueMaterials: new Set(gu4.map((uniqueMaterialMesh: any) => uniqueMaterialMesh.material)).size,
  }
}

export function configureLightSourcePreview(_runtime: StudioAppRuntime, previewSourceMesh: any) {
  return (
    (previewSourceMesh.userData.exportRole = 'light-source-preview'),
    (previewSourceMesh.castShadow = false),
    (previewSourceMesh.receiveShadow = false),
    (previewSourceMesh.renderOrder = 20),
    previewSourceMesh
  )
}


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
  // 本次**声明参与合批**的物品 id：用来校验「批次没有漏件」。被跳过的类型
  // （需要交互/嵌入舞台独占的类型）不算在内，否则任何场景都会因它们而放弃收尾。
  const declaredIds: string[] = []
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
    declaredIds.push(String(batchItem.id))
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
  // 合批后的收尾：给透明/透射件写稳定排序键（0.8.9 `finishWallFurniture`）。
  // 覆盖不完整时返回 0，宁可不优化也不会让家具消失。
  finishWallFurniture(batchSceneRoot, declaredIds)
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


export function previewTransformContext(runtime: StudioAppRuntime) {
  const previewTransformOrigin =
    runtime.appCtx.sceneModelOrigin || sceneModelOrigin2(runtime.appCtx.studioState, runtime.getActiveFloor())
  return {
    items: runtime.appCtx.studioState.items,
    contextKey: JSON.stringify([
      runtime.appCtx.activeFloorId,
      runtime.getPreviewFloorMode(),
      previewTransformOrigin,
      // 0.8.7 `vy()` 的键里带着 `visibilityKey`：隐藏 / 显示后位姿缓存必须失效，
      // 否则「隐藏再显示」会把隐藏前缓存的位移当成新位姿套回去。
      placedVisibilityKey(runtime.appCtx),
      runtime.backgroundSettings(),
      runtime.appCtx.baseLightingSettings,
      runtime.appCtx.studioState.settings,
      runtime.appCtx.studioState.background,
      runtime.appCtx.studioState.walls,
      runtime.appCtx.studioState.windows,
      runtime.appCtx.studioState.doors,
      runtime.appCtx.studioState.railings,
    ]),
    isEligible: (previewCandidate: any) =>
      !lampItemTypeSet.has(previewCandidate.type) &&
      previewCandidate.type !== 'flooropening' &&
      !isPlacedItemHidden(runtime.appCtx, previewCandidate.id) &&
      !isCourtyardPlanItem2(previewCandidate),
    isSelected: (previewCandidate: any) => runtime.createSelectionRef('item', previewCandidate.id),
  }
}

export function capturePreviewTransforms(runtime: StudioAppRuntime, layerItemRecords: any) {
  runtime.isEmbeddedStage ||
    runtime.isEmbedStageMode ||
    !runtime.appCtx.sceneRootNode ||
    runtime.previewTransformCache.capture(runtime.appCtx.sceneRootNode, {
      ...runtime.previewTransformContext(),
      groups: layerItemRecords,
    })
}

export function applyPreviewTransforms(
  runtime: StudioAppRuntime,
  worldMapper: any,
  { preserveLightCache: shouldPreservePreviewLightCache, shadowRoot: previewShadowRoot }: any,
) {
  if (runtime.isEmbeddedStage || runtime.isEmbedStageMode || !runtime.appCtx.sceneRootNode) return false
  const movedTransforms = runtime.previewTransformCache.planReplacements(
    runtime.appCtx.sceneRootNode,
    runtime.previewTransformContext(),
  )
  if (!movedTransforms) return false
  for (const { item: movedItem, group: movedGroup } of movedTransforms) {
    const world = worldMapper.toWorld(movedItem)
    movedGroup.position.set(world.x, movedItem.elevation || 0, world.z), applyItemOrientation(movedGroup, movedItem)
  }
  return (
    runtime.previewTransformCache.commitReplacements(runtime.appCtx.sceneRootNode, movedTransforms),
    movedTransforms.length &&
      (runtime.setupSceneShadows(previewShadowRoot, {
        rebuildAtlas: !shouldPreservePreviewLightCache,
      }),
      runtime.refreshSceneRender({
        shadows: !shouldPreservePreviewLightCache,
        preserveLightCache: shouldPreservePreviewLightCache,
      })),
    true
  )
}

export function buildSceneLayers(runtime: StudioAppRuntime, layerKeyList: any) {
  if (runtime.appCtx.sceneRootNode) {
    for (const layerChildObject of [...runtime.appCtx.sceneRootNode.children])
      layerChildObject.userData.modelLayer === layerKeyList &&
        (runtime.appCtx.sceneRootNode.remove(layerChildObject), runtime.disposeObjectTree(layerChildObject))
  }
}

export function buildLayerGroup(
  runtime: StudioAppRuntime,
  layerKey: any,
  {
    preserveLightCache: preserveLayerLightCache = false,
    shadowRoot: layerShadowRoot = runtime.appCtx.sceneRootNode,
    allowTransforms: allowLayerTransforms = false,
  } = {},
) {
  if (!runtime.appCtx.sceneRootNode) return
  const mg3 = runtime.createFloorWorldMapper()
  if (!mg3) return
  if (
    layerKey === 'items' &&
    allowLayerTransforms &&
    runtime.applyPreviewTransforms(mg3, {
      preserveLightCache: preserveLayerLightCache,
      shadowRoot: layerShadowRoot,
    })
  )
    return
  runtime.buildSceneLayers(layerKey)
  const isLightsLayer = layerKey === 'lights',
    $u3 = isLightsLayer ? runtime.collectLightSourceSpecs() : null,
    layerItemRecords: any[] = []
  for (const layerItem of runtime.appCtx.studioState.items) {
    if (lampItemTypeSet.has(layerItem.type) !== isLightsLayer) continue
    const world = mg3.toWorld(layerItem)
    if (layerItem.type === 'flooropening') continue
    const vu3 = runtime.buildItemModel(layerItem, $u3)
    runtime.isEmbeddedStage &&
      !runtime.createSelectionRef('item', layerItem.id) &&
      compactStaticDeviceParts2(ns2, vu3, layerItem.type, buildStaticMaterialKey),
      runtime.isEmbeddedStage &&
        Object.assign(vu3.userData, {
          editorModelId: layerItem.id,
          editorFloorId: runtime.appCtx.activeFloorId,
        }),
      runtime.isEmbedStageMode &&
        ['smallcar', 'suv', 'scooter'].includes(layerItem.type) &&
        (vu3.userData.preserveDetailedSurface = true),
      runtime.isEmbeddedStage &&
        [
          'airer',
          'fan',
          'ceiling-fan',
          'exhaust-fan',
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
        ].includes(layerItem.type) &&
        ((vu3.userData.environmentModelId = layerItem.id),
        (vu3.userData.environmentModelType = ['smallcar', 'suv', 'scooter'].includes(layerItem.type)
          ? 'smallcar'
          : layerItem.type),
        (vu3.userData.environmentFloorId = runtime.appCtx.activeFloorId)),
      vu3.position.set(world.x, layerItem.elevation || 0, world.z),
      applyItemOrientation(vu3, layerItem),
      /*
       * 3D 视口编辑（0.8.7）的拾取依据。
       * 合批时原件会被移除、只剩 InstancedMesh 的 `instanceItemIds`，所以两处都要能定位物件：
       * 未合批的 Group 靠这里的 tag，合批的靠实例表。
       */
      (vu3.userData.editorItemId = layerItem.id),
      (vu3.userData.modelLayer = layerKey),
      runtime.appCtx.sceneRootNode.add(vu3),
      isLightsLayer ||
        layerItemRecords.push({
          item: layerItem,
          group: vu3,
        })
  }
  isLightsLayer ||
    (runtime.batchSharedMeshes(runtime.appCtx.sceneRootNode, layerItemRecords),
    runtime.isEmbeddedStage &&
      new URLSearchParams(window.location.search).get('furniture-runtime') !== 'baseline' &&
      compactRuntimeFurniture2(
        runtime.appCtx.sceneRootNode,
        layerItemRecords.filter(({ item: layerItemRef }) => !runtime.createSelectionRef('item', layerItemRef.id)),
        {
          THREE: ns2,
          mergeGeometries: mergeGeometries2,
          materialKey: buildStaticMaterialKey,
        },
      ),
    runtime.mergeStaticItemMeshes(runtime.appCtx.sceneRootNode, layerItemRecords),
    runtime.buildCourtyardFoundation(mg3)),
    runtime.setupSceneShadows(layerShadowRoot, {
      rebuildAtlas: !preserveLayerLightCache,
    }),
    applyShadowReceiverTrial2(runtime.appCtx.sceneRootNode),
    runtime.isEmbeddedStage && cacheObjectTransforms2(runtime.appCtx.sceneRootNode, ns2.Object3D),
    isLightsLayer && runtime.requestStudioRender(),
    runtime.refreshSceneRender({
      shadows: !isLightsLayer && !preserveLayerLightCache,
      preserveLightCache: preserveLayerLightCache,
    }),
    isLightsLayer || runtime.capturePreviewTransforms(layerItemRecords)
}

export function buildArchitectureLayer(
  runtime: StudioAppRuntime,
  {
    preserveLightCache: preserveArchitectureLightCache = false,
    shadowRoot: architectureShadowRoot = runtime.appCtx.sceneRootNode,
  } = {},
) {
  const mg4 = runtime.createFloorWorldMapper()
  !runtime.appCtx.sceneRootNode ||
    !mg4 ||
    (runtime.buildSceneLayers('architecture'),
    runtime.buildInteriorScene(mg4),
    // 0.8.9 地面分区 / 铺面色档 / 地暖盘管：在整板建好之后覆盖，幂等（自己会清上一轮）。
    mountFloorRegionVisualsForScene({
      appCtx: runtime.appCtx,
      toWorld: mg4.toWorld,
      floorSurfaceY: mg4.floorSurfaceY,
      floorColor: runtime.backgroundSettings().floor,
    }),
    preserveArchitectureLightCache || runtime.appCtx.contactShadowController?.invalidate(),
    runtime.setupSceneShadows(architectureShadowRoot, {
      rebuildAtlas: !preserveArchitectureLightCache,
    }),
    runtime.refreshSceneRender({
      shadows: !preserveArchitectureLightCache,
      scene: true,
      preserveLightCache: preserveArchitectureLightCache,
    }))
}

export function buildItemsLayer(runtime: StudioAppRuntime, itemsLayerOptions: Record<string, any> = {}) {
  runtime.buildLayerGroup('items', itemsLayerOptions)
}

export function buildLightsLayer(runtime: StudioAppRuntime, lightsLayerOptions: Record<string, any> = {}) {
  runtime.buildLayerGroup('lights', lightsLayerOptions)
}


export function sceneCacheDescriptor(runtime: StudioAppRuntime, descriptorWidth: any, descriptorHeight: any) {
  const floors =
    runtime.getPreviewFloorMode() === 'all' ? runtime.appCtx.studioProject.floors : [runtime.getActiveFloor()]
  runtime.appCtx.threeCamera.updateMatrixWorld()
  const roundMatrixNumbers = (matrixElements: any) =>
      matrixElements.map((matrixElementValue: any) => Math.round(matrixElementValue * 100000000) / 100000000),
    list: any = []
  return (
    runtime.appCtx.sceneRootNode.traverse((sceneObject: any) => {
      ;['background', 'grid'].includes(sceneObject.userData?.exportRole) &&
        list.push([sceneObject.userData.exportRole, sceneObject.visible])
    }),
    sha2562(
      stableCacheJSON2({
        ...(floors.some((floorRecord: any) => floorRecord.scene.items.some(isCourtyardDrawing2))
          ? {
              courtyardGeometry: 'v5-foundation-finish-perimeter',
            }
          : {}),
        version: RENDER_CACHE_VERSION2,
        doorGeometry: 'v5-default-opening',
        windowGeometry: 'v2-opening-clearance',
        regionFalloff: 'v2-broad',
        regionLightGain: 'v3-default80',
        wallUnion: 'v3-near-collinear',
        scene: cacheSceneDescriptor2(floors),
        // 0.8.7 `Pc().contextKey` 的第一项：隐藏 / 显示会改变这一层该画什么，
        // 缓存描述里不带它就会复用隐藏前的渲染结果。**逐层**取指纹 ——
        // 全楼视图下在第 2 层隐藏物件，第 1 层是当前层，只取当前层会漏。
        placedVisibility: floors
          .map((floorRecord: { id: string }) => placedVisibilityKeyFor(runtime.appCtx, floorRecord.id))
          .join('|'),
        mode: runtime.getPreviewFloorMode(),
        gap: runtime.appCtx.studioProject.previewFloorGap,
        uniformOverviewStack: runtime.appCtx.studioProject.uniformOverviewStack === true,
        ...(runtime.appCtx.studioProject.uniformOverviewStack === true
          ? {
              overviewProjection: 'saved-camera-v1',
            }
          : {}),
        ...(runtime.isEmbedStageMode && isWarmSceneStyle(runtime.appCtx.sceneStyle)
          ? {
              warmRegionLighting: 'v13-balanced-wash',
            }
          : {}),
        lighting: runtime.appCtx.baseLightingSettings,
        style: runtime.backgroundSettings(),
        wallOpacity: runtime.appCtx.wallOpacityValue,
        visibility: list,
        reflections: runtime.appCtx.reflectionSettingsJson,
        curtains: runtime.appCtx.curtainStructureJson,
        ...(runtime.appCtx.backgroundThemeName !== 'grid'
          ? {
              backgroundTheme: 'v6:' + runtime.appCtx.backgroundThemeName,
            }
          : {}),
        models: runtime.externalModelRegistry.cacheRepresentation(
          floors.flatMap((sceneItem: any) => sceneItem.scene.items),
        ),
        camera: {
          world: roundMatrixNumbers(runtime.appCtx.threeCamera.matrixWorld.elements),
          projection: roundMatrixNumbers(runtime.appCtx.threeCamera.projectionMatrix.elements),
        },
        width: descriptorWidth,
        height: descriptorHeight,
        toneMapping: runtime.appCtx.threeRenderer.toneMapping,
        exposure: runtime.appCtx.threeRenderer.toneMappingExposure,
        colorSpace: runtime.appCtx.threeRenderer.outputColorSpace,
        shadows: runtime.appCtx.threeRenderer.shadowMap.type,
      }),
    )
  )
}

export function checkModelInUse(runtime: StudioAppRuntime, modelKey: any) {
  return !!runtime.appCtx.studioProject?.floors?.some((floorSelection: any) =>
    floorSelection.scene?.items?.some((floorItem: any) => {
      /** 两节柜是同一 `type` 的变体模型：按实际解析出的模型类型反查“已放置”。 */
      if (STORAGE_SECTION_TYPES.has(floorItem.type) && storageSectionModelType(floorItem) === modelKey) return true
      if (modelKey.startsWith('tv_')) {
        const tvMountStyle = tvMountStyleSet.has(floorItem.tvMountStyle) ? floorItem.tvMountStyle : 'standard'
        return floorItem.type === 'tv' && modelKey === 'tv_' + tvMountStyle
      }
      if (modelKey.startsWith('pillar_')) {
        const pillarShape = modelKey.slice('pillar_'.length)
        return floorItem.type === 'pillar' && normalizePillarShape2(floorItem.pillarShape) === pillarShape
      }
      return floorItem.type === modelKey
    }),
  )
}

export function collectScenePayload(
  runtime: StudioAppRuntime,
  floorRecords: any[] = [],
  { includeCurtains: includeCurtainFlag = false } = {},
) {
  return [
    ...new Set(
      floorRecords.flatMap((floorEntry) =>
        (floorEntry?.scene?.items || [])
          .filter((itemEntry: any) => includeCurtainFlag || itemEntry.type !== 'curtain')
          .map((itemRecord: any) => runtime.modelTypeForItem(itemRecord))
          // 用户装饰的键是 `model:<assetId>`，不在静态清单里。只按静态清单过滤会让
          // 装饰模型**永远进不了预加载列表** —— 舞台（仪表盘 3D 控件）里于是什么都看不到。
          .filter(
            (assetModelKey: any) =>
              (ALL_ITEM_MODELS2 as any)[assetModelKey] || userDecorationModelDefinition(assetModelKey),
          ),
      ),
    ),
  ]
}

export function collectSelectedFloors(runtime: StudioAppRuntime) {
  const activeFloorRecords =
    runtime.getPreviewFloorMode() === 'all'
      ? runtime.appCtx.studioProject?.floors || []
      : [runtime.getActiveFloor()].filter(Boolean)
  return runtime.collectScenePayload(activeFloorRecords)
}

export function scheduleModelLoadFlush(runtime: StudioAppRuntime, flushDelayMs = 900) {
  window.clearTimeout(runtime.appCtx.modelLoadDebounceId),
    (runtime.appCtx.modelLoadDebounceId = window.setTimeout(
      () => {
        if (
          ((runtime.appCtx.modelLoadDebounceId = null),
          !runtime.appCtx.isExternalModelLoadDeferred ||
            document.hidden ||
            runtime.appCtx.isWindowHidden ||
            runtime.appCtx.isRenderSuppressed)
        ) {
          runtime.appCtx.isExternalModelLoadDeferred && runtime.scheduleModelLoadFlush(300)
          return
        }
        const uniqueModelTypes = [...new Set(runtime.appCtx.deferredModelTypes)]
        ;(runtime.appCtx.deferredModelTypes = []), Promise.allSettled(runtime.loadModelsForTypes(uniqueModelTypes))
      },
      Math.max(0, flushDelayMs),
    ))
}

export function loadModelsForTypes(runtime: StudioAppRuntime, requestedModelTypes: any[] = []) {
  window.clearTimeout(runtime.appCtx.modelLoadDebounceId),
    (runtime.appCtx.modelLoadDebounceId = null),
    (runtime.appCtx.isExternalModelLoadDeferred = false),
    (window.externalModelLoadsDeferred = false)
  const filter = [...new Set(requestedModelTypes)].filter(
    (modelTypeFilterKey) =>
      (ALL_ITEM_MODELS2 as any)[modelTypeFilterKey] || userDecorationModelDefinition(modelTypeFilterKey),
  )
  if (!filter.length) return []
  window.__homeosReleasingDeferredModels = true
  const map = filter.map((modelTypeEntry) => runtime.ensureExternalModelLoaded(modelTypeEntry))
  return ((window.__homeosReleasingDeferredModels = false), map)
}

export function preloadDefaultModels(runtime: StudioAppRuntime) {
  return runtime.loadModelsForTypes(runtime.collectSelectedFloors())
}

export function requestSceneRender(runtime: StudioAppRuntime) {
  if (typeof runtime.appCtx.isExternalModelPending < 'u' && runtime.appCtx.isExternalModelPending) {
    runtime.appCtx.isModelLoadPending = true
    return
  }
  if (runtime.isAutoDiagramEmbed || runtime.appCtx.isModelLoadDeferred) {
    runtime.publishModelLoadState()
    return
  }
  ;(runtime.appCtx.isModelLoadPending = true),
    runtime.publishModelLoadState(),
    runtime.appCtx.isModelLoadPending &&
      (runtime.appCtx.isWindowHidden ||
        runtime.appCtx.isRenderSuppressed ||
        (runtime.appCtx.modelLoadTimeoutId === null &&
          (runtime.appCtx.modelLoadTimeoutId = window.setTimeout(() => {
            ;(runtime.appCtx.modelLoadTimeoutId = null),
              !(runtime.appCtx.isWindowHidden || runtime.appCtx.isRenderSuppressed) && runtime.finishModelLoad()
          }, 500))))
}

export function finishModelLoad(runtime: StudioAppRuntime) {
  ;(!runtime.appCtx.isModelLoadPending && !runtime.isAutoDiagramEmbed && !runtime.appCtx.isModelLoadDeferred) ||
    ((runtime.appCtx.isModelLoadPending = false),
    window.clearTimeout(runtime.appCtx.modelLoadTimeoutId),
    (runtime.appCtx.modelLoadTimeoutId = null),
    (runtime.appCtx.replacementFrameCount += 1),
    runtime.publishModelLoadState(),
    typeof runtime.appCtx.isRuntimeWarmupDone < 'u' &&
      runtime.isEmbeddedStage &&
      runtime.appCtx.sceneRootNode?.children?.length &&
      (runtime.appCtx.isRuntimeWarmupDone = true),
    runtime.requestSceneRebuild({
      force: true,
      precompile: true,
      externalModelsOnly: true,
    }),
    window.requestAnimationFrame(() => {
      ;(runtime.appCtx.replacementFrameCount -= 1), runtime.publishModelLoadState()
    }))
}

export function publishModelLoadState(
  runtime: StudioAppRuntime,
  modelLoaderEntry = runtime.externalModelRegistry.modelLoadState(),
) {
  const pending = modelLoaderEntry.pending ?? modelLoaderEntry.active + modelLoaderEntry.queued,
    isModelLoadSettled = runtime.appCtx.isModelLoadActive && pending === 0
  if (
    ((runtime.appCtx.isModelLoadActive = pending > 0),
    !pending &&
      runtime.appCtx.isModelLoadPending &&
      !runtime.isAutoDiagramEmbed &&
      !runtime.appCtx.isModelLoadDeferred &&
      !runtime.appCtx.isWindowHidden &&
      !runtime.appCtx.isRenderSuppressed &&
      (typeof runtime.appCtx.isExternalModelPending > 'u' || !runtime.appCtx.isExternalModelPending))
  ) {
    runtime.finishModelLoad()
    return
  }
  isModelLoadSettled &&
    !runtime.appCtx.isModelLoadPending &&
    runtime.appCtx.replacementFrameCount === 0 &&
    runtime.renderStudioFrame()
  const hn2 = pending > 0 || runtime.appCtx.isModelLoadPending || runtime.appCtx.replacementFrameCount > 0
  runtime.updateModelLoadIndicator(modelLoaderEntry, hn2),
    runtime.modelLoadingStatusElement &&
      (runtime.appCtx.orbitControls &&
        !runtime.appCtx.isInteractionLocked &&
        (runtime.appCtx.orbitControls.enabled = !hn2),
      (runtime.modelLoadingStatusElement.hidden = !hn2),
      runtime.modelLoadingStatusElement
        .querySelector('span:last-child')
        ?.replaceChildren(
          document.createTextNode(pending > 0 ? '正在加载模型… ' + pending : hn2 ? '正在完成模型…' : ''),
        ))

  runtime.appCtx.isMaterialSlotPanelPending &&
    runtime.appCtx.selectedItem?.kind === 'item' &&
    runtime.renderMaterialSlotPanel(runtime.getSelectedObject())
}

export function emitRuntimeDiagnostic(
  runtime: StudioAppRuntime,
  eventName: any,
  timingRecord: Record<string, any> = {},
) {
  try {
    if (!runtime.isEmbeddedStage && ['gpu-lost', 'gpu-restored'].includes(eventName)) {
      const isContextRestored = eventName === 'gpu-restored',
        contextCanvas = runtime.appCtx.threeRenderer?.domElement
      ;(window.HomeOSLog?.report as any)?.(
        isContextRestored ? 'success' : 'warning',
        '3D 图形',
        isContextRestored
          ? '3D 图形上下文已恢复，正在重建画面与阴影缓存'
          : '3D 图形上下文已丢失，预览暂时停止，等待浏览器恢复',
        {
          phase: 'studio-webgl-context',
          code: eventName,
        },
        '画布像素：' +
          (contextCanvas?.width || 0) +
          ' × ' +
          (contextCanvas?.height || 0) +
          '\n像素比：' +
          (runtime.appCtx.threeRenderer?.getPixelRatio?.() || 1),
      )
      return
    }
    if (
      !runtime.isEmbeddedStage ||
      window.parent === window ||
      ![
        'category-switch-start',
        'category-switch-applied',
        'source-adopt-start',
        'source-adopt-complete',
        'source-adopt-failed',
        'gpu-lost',
        'gpu-restored',
        'models-loading-resumed',
        'models-completion-resumed',
      ].includes(eventName)
    )
      return
    const options: Record<string, any> = {}
    for (const timingKey of [
      'sourceRevision',
      'floorCount',
      'durationMs',
      'pending',
      'active',
      'queued',
      'replacementFrames',
      'fromCategory',
      'toCategory',
      'mapPixels',
      'mapTextures',
    ])
      typeof timingRecord?.[timingKey] == 'number' &&
        Number.isFinite(timingRecord[timingKey]) &&
        (options[timingKey] = Math.max(0, Math.min(1000000000, timingRecord[timingKey])))
    if (
      (eventName.startsWith('gpu-') || eventName.startsWith('category-switch-')) &&
      typeof runtime.appCtx.threeRenderer < 'u'
    ) {
      if (eventName.startsWith('category-switch-')) {
        const rendererSnapshot = runtime.appCtx.threeRenderer?.info
        for (const [metricKey, metricValue] of Object.entries({
          geometries: rendererSnapshot?.memory?.geometries,
          textures: rendererSnapshot?.memory?.textures,
          programs: rendererSnapshot?.programs?.length,
        }))
          typeof metricValue == 'number' &&
            Number.isFinite(metricValue) &&
            (options[metricKey] = Math.max(0, Math.min(1000000000, metricValue)))
      }
      const runtimeStatsReport = {
        width: runtime.appCtx.threeRenderer?.domElement?.width,
        height: runtime.appCtx.threeRenderer?.domElement?.height,
        dpr: runtime.appCtx.threeRenderer?.getPixelRatio?.(),
      }
      for (const [statKey, statValue] of Object.entries(runtimeStatsReport))
        typeof statValue == 'number' &&
          Number.isFinite(statValue) &&
          (options[statKey] = Math.max(0, Math.min(1000000000, statValue)))
    }
    typeof timingRecord?.replacementPending == 'boolean' &&
      (options.replacementPending = timingRecord.replacementPending),
      window.parent.postMessage(
        {
          channel: 'hb-i3d-v1',
          type: 'runtime-diagnostic',
          code: eventName,
          counts: options,
        },
        window.location.origin,
      )
  } catch {
    /* Worker / 广播通道不可用（环境不支持或扩展未加载）：功能降级为单通道，不影响主流程 */
  }
}

export function updateModelLoadIndicator(
  runtime: StudioAppRuntime,
  loadStateSnapshot: any,
  isPresentationPending: any,
) {
  try {
    const pending2 = runtime.modelPresentationState.pending
    if (
      ((runtime.modelPresentationState.pending = isPresentationPending),
      !runtime.modelPresentationState.presented || pending2 || !isPresentationPending)
    )
      return
    const pending3 = loadStateSnapshot.pending ?? loadStateSnapshot.active + loadStateSnapshot.queued
    runtime.emitRuntimeDiagnostic(pending3 > 0 ? 'models-loading-resumed' : 'models-completion-resumed', {
      pending: pending3,
      active: loadStateSnapshot.active,
      queued: loadStateSnapshot.queued,
      replacementPending: runtime.appCtx.isModelLoadPending,
      replacementFrames: runtime.appCtx.replacementFrameCount,
    })
  } catch {
    /* 诊断上报 best-effort：加载状态快照上报失败不应中断加载流程 */
  }
}

/** 某物件的模型加载选项 = 当前主题调色板 + 该物件自己的材质档位 + 该物件自己的覆盖色+ 该物件自己的逐槽表面参数。 */
export function materialLoadOptionsForItem(runtime: StudioAppRuntime, itemRecordRef: any) {
  const itemModelType = runtime.externalModelRegistry.modelTypeForItem(itemRecordRef),
    itemMaterialStyle = normalizeMaterialStyle(itemModelType, itemRecordRef?.materialStyle),
    itemMaterialOverrides =
      itemRecordRef?.materialOverrides &&
      typeof itemRecordRef.materialOverrides == 'object' &&
      !Array.isArray(itemRecordRef.materialOverrides)
        ? itemRecordRef.materialOverrides
        : null,
    itemMaterialSurfaceOverrides = normalizeMaterialSurfaceOverrides(itemRecordRef?.materialSurfaceOverrides),
    materialOverrideEntries = itemMaterialOverrides ? Object.keys(itemMaterialOverrides) : [],
    materialSurfaceOverrideEntries = Object.keys(itemMaterialSurfaceOverrides)
  const itemLoadOptions = {
    ...runtime.backgroundSettings(),
    ...materialStylePaletteColors(itemModelType, itemMaterialStyle),
    /**
     * 墙体**实际**的透过率（用户可能拖过滑条 / 单面墙有自定义 opacity）。
     * `backgroundSettings().wallOpacity` 只是主题默认值，配墙的柱体只能读这里的实时值，
     * 否则调完墙体透明度，柱子还停在 0.36。
     */
    wallOpacity: runtime.appCtx.wallOpacityValue ?? runtime.appCtx.studioState.settings.wallOpacity,
  }
  itemMaterialStyle !== MATERIAL_STYLE_AUTO && (itemLoadOptions.materialStyle = itemMaterialStyle)
  materialOverrideEntries.length && (itemLoadOptions.materialOverrides = itemMaterialOverrides)
  materialSurfaceOverrideEntries.length && (itemLoadOptions.materialSurfaceOverrides = itemMaterialSurfaceOverrides)
  return itemLoadOptions
}

export function applyItemOptimization(
  runtime: StudioAppRuntime,
  modelSource: any,
  itemRecordRef: any,
  modelLoadOptions = runtime.materialLoadOptionsForItem(itemRecordRef),
) {
  const addExternalItemModel = runtime.externalModelRegistry.addExternalItemModel(
    modelSource,
    itemRecordRef,
    modelLoadOptions,
    {
      selected: runtime.createSelectionRef('item', itemRecordRef.id),
      staticMaterialKey: buildStaticMaterialKey,
      staticVertexTint: runtime.isEmbeddedStage,
    },
  )
  return (runtime.publishModelLoadState(), addExternalItemModel)
}

export function getActiveFloor(runtime: StudioAppRuntime) {
  const oe2 = runtime.appCtx.pendingRuntimeSettings?.selectedFloorId || runtime.appCtx.activeFloorId
  return (
    runtime.appCtx.studioProject?.floors.find((floorMatch: any) => floorMatch.id === oe2) ||
    runtime.appCtx.studioProject?.floors[0] ||
    null
  )
}

export function captureStudioSnapshot(runtime: StudioAppRuntime) {
  return structuredClone(
    runtime.appCtx.studioProject || normalizeStudioDocument(runtime.appCtx.studioState, runtime.studioDocumentDeps()),
  )
}

export function getLocalSaveRevision(runtime: StudioAppRuntime) {
  const runtimeSnapshot = runtime.captureStudioSnapshot()
  if (!runtime.appCtx.pendingRuntimeSettings) return runtimeSnapshot
  runtimeSnapshot.previewFloorMode = runtime.appCtx.pendingRuntimeSettings.floorMode
  for (const snapshotFloor of runtimeSnapshot.floors || []) {
    const floorCameraSetting = runtime.appCtx.pendingRuntimeSettings.floorCameraSettings.get(snapshotFloor.id)
    floorCameraSetting &&
      ((snapshotFloor.scene.settings.cameraMode = floorCameraSetting.mode),
      (snapshotFloor.scene.settings.cameraView = floorCameraSetting.view),
      (snapshotFloor.scene.settings.cameraTopRotation = floorCameraSetting.topRotation),
      (snapshotFloor.scene.settings.cameraFocalLength = floorCameraSetting.focalLength))
  }
  return (
    (runtimeSnapshot.combinedCameraSettings = {
      ...runtime.appCtx.pendingRuntimeSettings.combinedCameraSettings,
    }),
    runtimeSnapshot
  )
}











export interface BuildStudioSceneDeps {
  appCtx: StudioAppContext
  backgroundSettings: any
  batchSharedMeshes: any
  buildCourtyardFoundation: any
  buildGroundShadow: any
  buildInteriorScene: any
  buildItemModel: any
  buildShapesWithHoles: any
  closedWallLoops: any
  collectLightSourceSpecs: any
  createFloorMaterial: any
  createSelectionRef: any
  defaultWallRuntimeProfile: any
  disposeFloorScene: any
  geometryCacheHandle: any
  getActiveFloor: any
  getPixelsPerMeter: any
  getSceneContentBounds: any
  isEmbedStageMode: any
  isEmbeddedStage: any
  mergeStaticItemMeshes: any
  refreshBaseLighting: any
  refreshSceneRender: any
  setupSceneShadows: any
}

/**
 * 给场景根挂当前楼层号（0.8.2 的 `I.userData.regionFloorId = j`，且是无条件挂）。
 *
 * 分层灯光 `bind()` 用 `objectFloorId(object)` 选 UBO：墙带 / 门窗这些构件自己没有楼层
 * 字段，只能从根上继承。不挂就等于把它们绑到空的根缓冲，射灯一盏也读不到 —— 地面亮、
 * 墙面一片死平。此前只在区域光照那一档才挂，编辑器与标准舞台都漏了这一段。
 */
function bindSceneRootFloor(
  sceneRoot: { userData: Record<string, unknown> } | null | undefined,
  activeFloorId: unknown,
) {
  if (!sceneRoot || typeof activeFloorId != 'string' || !activeFloorId) return
  sceneRoot.userData.regionFloorId = activeFloorId
}

export function buildStudioScene(deps: BuildStudioSceneDeps, { preserveLightCache: preserveLightCache = false } = {}) {
  const {
    appCtx,
    backgroundSettings,
    batchSharedMeshes,
    buildCourtyardFoundation,
    buildGroundShadow,
    buildInteriorScene,
    buildItemModel,
    buildShapesWithHoles,
    closedWallLoops,
    collectLightSourceSpecs,
    createFloorMaterial,
    createSelectionRef,
    defaultWallRuntimeProfile,
    disposeFloorScene,
    geometryCacheHandle,
    getActiveFloor,
    getPixelsPerMeter,
    getSceneContentBounds,
    isEmbedStageMode,
    isEmbeddedStage,
    mergeStaticItemMeshes,
    refreshBaseLighting,
    refreshSceneRender,
    setupSceneShadows,
  } = deps

  if (
    (appCtx.contactShadowController?.invalidate(),
    bindSceneRootFloor(appCtx.sceneRootNode, appCtx.activeFloorId),
    !appCtx.sceneRootNode)
  )
    return
  refreshBaseLighting(),
    disposeFloorScene(),
    refreshSceneRender({
      shadows: true,
      scene: true,
      preserveLightCache: preserveLightCache,
    })
  const buildStudioSceneScenePixelsPerMeter = getPixelsPerMeter()
  if (!buildStudioSceneScenePixelsPerMeter) return
  const yt7 = backgroundSettings(),
    qu2 = getSceneContentBounds(),
    nn2 = appCtx.sceneModelOrigin || sceneModelOrigin2(appCtx.studioState, getActiveFloor()),
    planOriginX = nn2.x,
    planOriginY = nn2.y,
    planPointToWorld = (buildStudioScenePlanPoint: any) => ({
      x: (buildStudioScenePlanPoint.x - planOriginX) / buildStudioSceneScenePixelsPerMeter,
      z: (buildStudioScenePlanPoint.y - planOriginY) / buildStudioSceneScenePixelsPerMeter,
    }),
    planWidth = Math.max(qu2.width / buildStudioSceneScenePixelsPerMeter + 1, 3),
    planHeight = Math.max(qu2.height / buildStudioSceneScenePixelsPerMeter + 1, 3),
    groundPlaneY = -0.008,
    groundPlaneGap = 0.16,
    groundShadowPlaneY = groundPlaneY - groundPlaneGap - 0.035,
    groundPlaneSize = Math.max(Math.max(planWidth, planHeight) * 16, 260),
    groundPlane = new ns2.Mesh(
      new ns2.PlaneGeometry(groundPlaneSize, groundPlaneSize),
      new ns2.MeshBasicMaterial({
        color: yt7.ground,
        toneMapped: false,
      }),
    )
  ;(groundPlane.rotation.x = -Math.PI / 2),
    (groundPlane.position.y = groundShadowPlaneY),
    (groundPlane.receiveShadow = false),
    (groundPlane.userData.exportRole = 'background'),
    (groundPlane.userData.groundReflectionReceiver = true),
    (groundPlane.userData.regionFloorId = appCtx.activeFloorId),
    appCtx.sceneRootNode.add(groundPlane),
    createGroundGrid(appCtx, groundPlaneSize, yt7, groundShadowPlaneY)
  const mg2 = createFloorMaterial(),
    mr2 = closedWallLoops(buildStudioSceneScenePixelsPerMeter)
  ;(appCtx.sceneRootNode.userData.floorEdgeIndoorLoops = []), delete appCtx.sceneRootNode.userData.floorEdgeKey
  const floorOpeningLoops = appCtx.studioState.items
    .filter(
      (buildStudioSceneFloorOpeningItem) =>
        buildStudioSceneFloorOpeningItem.type === 'flooropening' &&
        !isPlacedItemHidden(appCtx, buildStudioSceneFloorOpeningItem.id),
    )
    .map((floorOpeningDrawing) =>
      floorOpeningPolygon2(floorOpeningDrawing, buildStudioSceneScenePixelsPerMeter).map((floorOpeningPoint) => {
        const floorOpeningWorldPoint = planPointToWorld(floorOpeningPoint)
        return {
          x: floorOpeningWorldPoint.x,
          y: floorOpeningWorldPoint.z,
        }
      }),
    )
  appCtx.sceneRootNode.userData.floorEdgeOpenings = floorOpeningLoops
  const addFloorIndoorLoop = (floorOpeningIndoorLoop: any) => {
      buildGroundShadow(floorOpeningIndoorLoop, groundShadowPlaneY),
        appCtx.sceneRootNode.userData.floorEdgeIndoorLoops.push(floorOpeningIndoorLoop)
    },
    addGroundPlateMesh = (floorPlateGeometry: any, groundPlateGeometry: any, isVerticalFloorPlate: any) => {
      const groundPlateMesh = new ns2.Mesh(groundPlateGeometry, mg2)
      ;(groundPlateMesh.rotation.x = isVerticalFloorPlate ? Math.PI / 2 : 0),
        (groundPlateMesh.position.y = isVerticalFloorPlate ? groundPlaneY : groundPlaneY - groundPlaneGap / 2),
        (groundPlateMesh.castShadow = false),
        (groundPlateMesh.receiveShadow = true),
        (groundPlateMesh.userData.exportRole = 'plan'),
        (groundPlateMesh.userData.regionReceiverKind = 'floor'),
        (groundPlateMesh.userData.regionFloorId = appCtx.activeFloorId),
        appCtx.sceneRootNode.add(groundPlateMesh),
        floorOpeningLoops.length || addFloorIndoorLoop(floorPlateGeometry)
    }
  if (floorOpeningLoops.length) {
    const floorOpeningWorldLoops = mr2.length
        ? mr2.map((floorOpeningWorldMap: any) =>
            floorOpeningWorldMap.map((floorOpeningPlanPoint: any) => {
              const floorOpeningPlanWorldPoint = planPointToWorld(floorOpeningPlanPoint)
              return {
                x: floorOpeningPlanWorldPoint.x,
                y: floorOpeningPlanWorldPoint.z,
              }
            }),
          )
        : [
            [
              {
                x: -planWidth / 2,
                y: -planHeight / 2,
              },
              {
                x: planWidth / 2,
                y: -planHeight / 2,
              },
              {
                x: planWidth / 2,
                y: planHeight / 2,
              },
              {
                x: -planWidth / 2,
                y: planHeight / 2,
              },
            ],
          ],
      floorOpeningSubtractLoops = geometryCacheHandle
        ? geometryCacheHandle.value(
            'floor-openings',
            [floorOpeningWorldLoops, floorOpeningLoops],
            () => subtractPolygonLoops2(floorOpeningWorldLoops, floorOpeningLoops),
            validGeometryLoops2,
          )
        : subtractPolygonLoops2(floorOpeningWorldLoops, floorOpeningLoops),
      ms6 = buildShapesWithHoles(floorOpeningSubtractLoops)
    ms6.length
      ? addGroundPlateMesh(
          [],
          new ns2.ExtrudeGeometry(ms6, {
            depth: groundPlaneGap,
            bevelEnabled: false,
            steps: 1,
          }),
          true,
        )
      : mg2.dispose()
    for (const openingDifferenceOuterLoop of floorOpeningSubtractLoops.filter(
      (openingDifferenceLoop: any) => polygonArea2(openingDifferenceLoop) > 0,
    )) {
      const openingDifferenceWorldLoop = openingDifferenceOuterLoop.map((differenceLoopPoint: any) => ({
        x: differenceLoopPoint.x,
        z: differenceLoopPoint.y,
      }))
      buildGroundShadow(openingDifferenceWorldLoop, groundShadowPlaneY, floorOpeningLoops),
        appCtx.sceneRootNode.userData.floorEdgeIndoorLoops.push(openingDifferenceWorldLoop)
    }
  } else {
    if (mr2.length) {
      const modelWorldLoops = mr2.map((modelLoopGroup: any) => modelLoopGroup.map(planPointToWorld)),
        modelShapeList = modelWorldLoops.map((modelWorldLoop: any) => {
          const modelShape = new ns2.Shape()
          return (
            modelWorldLoop.forEach((modelShapePoint: any, modelShapePointIndex: any) => {
              modelShapePointIndex === 0
                ? modelShape.moveTo(modelShapePoint.x, modelShapePoint.z)
                : modelShape.lineTo(modelShapePoint.x, modelShapePoint.z)
            }),
            modelShape.closePath(),
            modelShape
          )
        })
      addGroundPlateMesh(
        modelWorldLoops[0],
        new ns2.ExtrudeGeometry(modelShapeList, {
          depth: groundPlaneGap,
          bevelEnabled: false,
          steps: 1,
        }),
        true,
      )
      for (const extraModelLoop of modelWorldLoops.slice(1)) addFloorIndoorLoop(extraModelLoop)
    } else {
      if (
        appCtx.studioState.items.some(
          (gardenOrCourtyardItem) =>
            isCourtyardDrawing2(gardenOrCourtyardItem) || gardenOrCourtyardItem.type.startsWith('garden-'),
        )
      )
        mg2.dispose()
      else {
        const groundCornerPoints = [
          {
            x: -planWidth / 2,
            z: -planHeight / 2,
          },
          {
            x: planWidth / 2,
            z: -planHeight / 2,
          },
          {
            x: planWidth / 2,
            z: planHeight / 2,
          },
          {
            x: -planWidth / 2,
            z: planHeight / 2,
          },
        ]
        addGroundPlateMesh(groundCornerPoints, new ns2.BoxGeometry(planWidth, groundPlaneGap, planHeight), false)
      }
    }
  }
  buildCourtyardFoundation({
    ppm: buildStudioSceneScenePixelsPerMeter,
    toWorld: planPointToWorld,
  }),
    buildInteriorScene({
      ppm: buildStudioSceneScenePixelsPerMeter,
      toWorld: planPointToWorld,
      floorSurfaceY: groundPlaneY,
    })
  // 0.8.9 地面分区 / 铺面色档 / 地暖盘管：单层模式下整板刚建好，这里覆盖成按分区的板。
  // 只是一行调用、不带分支（`buildStudioScene` 的复杂度是 80+，不能加条件）。
  mountFloorRegionVisualsForScene({
    appCtx,
    toWorld: planPointToWorld,
    floorSurfaceY: groundPlaneY,
    floorColor: yt7.floor,
  })
  const $u2 = collectLightSourceSpecs(),
    placedItemRecords: Array<{ item: { id: string }; group: unknown }> = [],
    // 0.8.7 建场景时逐个跳过 `!En(item)`（`if (type==='flooropening' || !En(item)) continue`）：
    // 「已放置」里的隐藏是**本次编辑内真的不画**，不只是 2D 少一笔 —— 灯具因此也不再发光。
    // 用 filter 而不是循环里的 continue：回调是独立函数，不把过滤判断混进建场景那一段。
    drawableItemRecords = appCtx.studioState.items.filter(
      (sceneItemCandidate: { type?: string; id: string }) =>
        sceneItemCandidate.type !== 'flooropening' && !isPlacedItemHidden(appCtx, sceneItemCandidate.id),
    )
  for (const placedItem of drawableItemRecords) {
    const placedItemWorldPoint = planPointToWorld(placedItem)
    const vu2 = buildItemModel(placedItem, $u2)
    isEmbeddedStage &&
      !createSelectionRef('item', placedItem.id) &&
      compactStaticDeviceParts2(ns2, vu2, placedItem.type, buildStaticMaterialKey),
      isEmbeddedStage &&
        Object.assign(vu2.userData, {
          editorModelId: placedItem.id,
          editorFloorId: appCtx.activeFloorId,
        }),
      isEmbedStageMode &&
        ['smallcar', 'suv', 'scooter'].includes(placedItem.type) &&
        (vu2.userData.preserveDetailedSurface = true),
      isEmbeddedStage &&
        [
          'airer',
          'fan',
          'ceiling-fan',
          'exhaust-fan',
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
        ].includes(placedItem.type) &&
        ((vu2.userData.environmentModelId = placedItem.id),
        (vu2.userData.environmentModelType = ['smallcar', 'suv', 'scooter'].includes(placedItem.type)
          ? 'smallcar'
          : placedItem.type),
        (vu2.userData.environmentFloorId = appCtx.activeFloorId)),
      vu2.position.set(placedItemWorldPoint.x, placedItem.elevation || 0, placedItemWorldPoint.z),
      applyItemOrientation(vu2, placedItem),
      (vu2.userData.modelLayer = lampItemTypeSet.has(placedItem.type) ? 'lights' : 'items'),
      (vu2.userData.exportRole = placedItem.type === 'planlabel' ? 'label' : 'plan'),
      appCtx.sceneRootNode.add(vu2),
      lampItemTypeSet.has(placedItem.type) ||
        placedItemRecords.push({
          item: placedItem,
          group: vu2,
        })
  }
  batchSharedMeshes(appCtx.sceneRootNode, placedItemRecords),
    isEmbedStageMode &&
      (new URLSearchParams(window.location.search).get('wall-trial') ?? defaultWallRuntimeProfile)
        .split(',')
        .includes('merge') &&
      mergeWallBands2(ns2, appCtx.sceneRootNode, mergeGeometries2),
    isEmbeddedStage &&
      new URLSearchParams(window.location.search).get('furniture-runtime') !== 'baseline' &&
      compactRuntimeFurniture2(
        appCtx.sceneRootNode,
        placedItemRecords.filter(({ item: locatedItemRef }) => !createSelectionRef('item', locatedItemRef.id)),
        {
          THREE: ns2,
          mergeGeometries: mergeGeometries2,
          materialKey: buildStaticMaterialKey,
        },
      ),
    mergeStaticItemMeshes(appCtx.sceneRootNode, placedItemRecords),
    appCtx.sceneRootNode.traverse((sceneNodeForFlags: any) => {
      sceneNodeForFlags !== appCtx.sceneRootNode &&
        !sceneNodeForFlags.userData.exportRole &&
        (sceneNodeForFlags.userData.exportRole = 'plan')
    }),
    setupSceneShadows(appCtx.sceneRootNode, {
      rebuildAtlas: !preserveLightCache,
    }),
    applyShadowReceiverTrial2(appCtx.sceneRootNode),
    isEmbeddedStage && cacheObjectTransforms2(appCtx.sceneRootNode, ns2.Object3D),
    isWarmSceneStyle(appCtx.sceneStyle) &&
      appCtx.sceneRootNode.traverse((sceneNodeVisibility: any) => {
        ;(['background', 'grid'].includes(sceneNodeVisibility.userData?.exportRole) ||
          sceneNodeVisibility.userData?.floorPlanGroundShadow === true ||
          sceneNodeVisibility.userData?.batchedWallContactShadowCount != null) &&
          ((sceneNodeVisibility.userData.backgroundThemeHidden = true), (sceneNodeVisibility.visible = false))
      })
}
