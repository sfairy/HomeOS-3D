import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { compactStaticDeviceParts as compactStaticDeviceParts2 } from '../../items/studio-device-batching'
import { isCourtyardPlanItem as isCourtyardPlanItem2 } from '../../../plan/courtyard-plan'
import { sceneModelOrigin as sceneModelOrigin2 } from '../../../plan/courtyard-drawing'
import { applyShadowReceiverTrial as applyShadowReceiverTrial2 } from '../../studio-shadow-receiver-trial'
import { buildStaticMaterialKey } from '../../../materials/studio-static-material-key'
import { compactRuntimeFurniture as compactRuntimeFurniture2 } from '../../items/studio-runtime-furniture'
import { cacheObjectTransforms as cacheObjectTransforms2 } from '../../../../bridge/scene/scene-matrices'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { mergeGeometries as mergeGeometries2 } from '/static/vendor/three/0.187.0/BufferGeometryUtils.js'
import { lampItemTypeSet } from '../../items/item-catalog'
import { applyItemOrientation } from '../geometry/item-orientation'

export function previewTransformContext(runtime: StudioAppRuntime) {
  const previewTransformOrigin =
    runtime.appCtx.sceneModelOrigin || sceneModelOrigin2(runtime.appCtx.studioState, runtime.getActiveFloor())
  return {
    items: runtime.appCtx.studioState.items,
    contextKey: JSON.stringify([
      runtime.appCtx.activeFloorId,
      runtime.getPreviewFloorMode(),
      previewTransformOrigin,
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
