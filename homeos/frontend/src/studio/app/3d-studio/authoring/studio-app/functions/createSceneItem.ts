

import {
  isCourtyardPlanItem as isCourtyardPlanItem2,
} from "../../../plan/courtyard-plan";


import {
  anchorGate as anchorGate2,
  syncCourtyardGates as syncCourtyardGates2,
} from "../../../plan/courtyard-drawing";










import {
  normalizeCurtainTrack as normalizeCurtainTrack2,
} from "../../../loaders/studio-curtain-track";




















import {
  DEFAULT_STRIP_AXIS as DEFAULT_STRIP_AXIS2,
} from "../../items/studio-item-posture";
import { itemTypeCatalog, lampItemTypeSet, openStairTypeSet, roundTableTypeSet } from "../../items/item-catalog";


import type {
  SceneItemSizeOverrides,
} from '../../types/studio-app-types';
import {
  generateId,
} from '../../ui/studio-app-helpers';
import {
  lightPresetCatalog,
} from '../../lights/studio-app-light-data';
import { planLabelDefaultColor } from "../../scene/studio-scene-payload";









import type { StudioAppContext } from "../studio-app-context";
export interface CreateSceneItemDeps { appCtx: StudioAppContext; applyPlacementChange: any; captureUndoSnapshot: any; ensureCalibrationReady: any; finalizeAddedItem: any; getChargingLightGroups: any; getLightGroups: any; getPixelsPerMeter: any; getScreenLightGroups: any; markDocumentDirty: any; pushUndoEntry: any; refreshScopeItems: any; resolvePreviewScope: any; selectSceneObject: any; selectStudioTool: any; showToast: any; validateSelectionChange: any; }

export function createSceneItem(deps: CreateSceneItemDeps, 
  sceneItemType: any,
  itemPosition: any,
  sizeOverrides: SceneItemSizeOverrides = {},
) {
  const { appCtx, applyPlacementChange, captureUndoSnapshot, ensureCalibrationReady, finalizeAddedItem, getChargingLightGroups, getLightGroups, getPixelsPerMeter, getScreenLightGroups, markDocumentDirty, pushUndoEntry, refreshScopeItems, resolvePreviewScope, selectSceneObject, selectStudioTool, showToast, validateSelectionChange } = deps;

  const typeDefinition = (itemTypeCatalog as any)[sceneItemType];
  if (!typeDefinition || !ensureCalibrationReady()) return;
  if (
    appCtx.activeLibraryCategory === "courtyard" &&
    !isCourtyardPlanItem2({
      type: sceneItemType,
    })
  ) {
    showToast("庭院编辑中其他对象已锁定，请先切换分类。");
    return;
  }
  const downlight3 = (lightPresetCatalog as any)[sceneItemType] || lightPresetCatalog.downlight,
    _a2 = lampItemTypeSet.has(sceneItemType) ? getLightGroups() : null,
    ft2 = captureUndoSnapshot(),
    createdItem = {
      id: generateId("item"),
      type: sceneItemType,
      x: itemPosition.x,
      y: itemPosition.y,
      rotation: 0,
      width: sizeOverrides.width ?? typeDefinition.width,
      depth: sizeOverrides.depth ?? typeDefinition.depth,
      height: typeDefinition.height,
      elevation: typeDefinition.elevation || 0,
      color: typeDefinition.color,
      ...(sceneItemType === "planlabel"
        ? {
            title: "家庭总览",
            subtitle: "HOME PLAN",
            titleSpacing: 1.05,
            subtitleSpacing: 0.08,
            lineLength: 0.86,
            labelColor: planLabelDefaultColor,
          }
        : {}),
      ...(["camera", "presence"].includes(sceneItemType)
        ? {
            verticalRotation: 0,
          }
        : {}),
      ...(sceneItemType === "tv"
        ? {
            screenEnabled: true,
            screenLayerName: "电视画面 " + (getScreenLightGroups().length + 1),
            tvMountStyle: "standard",
          }
        : {}),
      ...(["smallcar", "suv", "scooter"].includes(sceneItemType)
        ? {
            chargingEnabled: false,
            chargingLayerName: "汽车充电 " + (getChargingLightGroups().length + 1),
          }
        : {}),
      ...(sceneItemType === "curtain"
        ? {
            curtainPosition: "split",
            ...normalizeCurtainTrack2({
              curtainFabric: "cloth",
            }),
          }
        : {}),
      ...(openStairTypeSet.has(sceneItemType)
        ? {
            stairDirection: "right",
          }
        : {}),
      ...(sceneItemType === "shoecabinet"
        ? {
            shoeCabinetMirrored: false,
          }
        : {}),
      ...(sceneItemType === "pillar"
        ? {
            pillarShape: typeDefinition.pillarShape,
            pillarAxis: typeDefinition.pillarAxis,
          }
        : {}),
      ...(sceneItemType === "mural"
        ? {
            muralStyle: typeDefinition.muralStyle || "bauhaus",
          }
        : {}),
      ...(sceneItemType === "featurewall"
        ? {
            wallStyle: typeDefinition.wallStyle || "marble",
          }
        : {}),
      ...(sceneItemType === "sofa-l"
        ? {
            sofaChaiseSide: "right",
          }
        : {}),
      ...(roundTableTypeSet.has(sceneItemType)
        ? {
            roundTableTurntable: false,
          }
        : {}),
      ...(lampItemTypeSet.has(sceneItemType)
        ? {
            lightGroupId: _a2!.id,
            verticalRotation: 0,
            ...(sceneItemType === "striplight"
              ? {
                  stripAxis: DEFAULT_STRIP_AXIS2,
                  stripRollRotation: 0,
                  lightSourceVisible: true,
                }
              : {}),
            lightTemperature: downlight3.temperature,
            lightBrightness: downlight3.brightness,
            lightRange: downlight3.range,
            lightAngle: downlight3.angle,
          }
        : {}),
    };
  (pushUndoEntry([createdItem]),
    finalizeAddedItem(createdItem),
    anchorGate2(createdItem, appCtx.studioState.items, getPixelsPerMeter(), 24 / appCtx.planView.zoom),
    appCtx.studioState.items.push(createdItem),
    syncCourtyardGates2(appCtx.studioState.items, getPixelsPerMeter()),
    validateSelectionChange(ft2) &&
      (applyPlacementChange(ft2),
      selectSceneObject("item", createdItem.id),
      appCtx.activeToolName !== "courtyard-gate" && selectStudioTool("select"),
      refreshScopeItems(resolvePreviewScope(createdItem)),
      markDocumentDirty()));

}
