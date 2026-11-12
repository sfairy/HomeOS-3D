import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { RoundedBoxGeometry as RoundedBoxGeometry2 } from '/static/vendor/three/0.187.0/RoundedBoxGeometry.js'
import { clamp as clamp2 } from '../../../plan/geometry'
import type { ArchitectureMeshOptions, PlanEditPreviewFlags } from '../../types/studio-app-types'
import { collectChildMeshes } from '../../items/studio-furniture-batching'
import { buildMaterialSignature } from '../../items/studio-shared-mesh-records'
import {
  addArchitectureMesh as addArchitectureMeshCore,
  addWindowFrames as addWindowFramesCore,
} from '../../scene/studio-box-mesh'
import { buildItemModel as buildItemModelCore } from '../../items/studio-item-model'
import {
  drawDoor as drawDoorCore,
  drawCourtyardArea as drawCourtyardAreaCore,
} from '../../../plan/studio-plan-item-drawing'
import {
  createOutlinePath as createOutlinePathCore,
  buildShapesWithHoles as buildShapesWithHolesCore,
  createSceneWallSideMaterial as createWallSideMaterialCore,
  createWallTopMaterial as createWallTopMaterialCore,
  expandPolygonOutward as expandPolygonOutwardCore,
  buildInteriorScene as buildInteriorSceneCore,
} from '../../scene/walls/studio-walls'
import { wallUnionFallbackCount } from '../../../plan/studio-wall-union'

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
