

import { compactStaticDeviceParts as compactStaticDeviceParts2 } from "../../items/studio-device-batching";




import {
  sceneModelOrigin as sceneModelOrigin2,
} from "../../../plan/courtyard-drawing";
import {
  applyShadowReceiverTrial as applyShadowReceiverTrial2,
} from "../../studio-shadow-receiver-trial";








import { buildStaticMaterialKey } from "../../../materials/studio-static-material-key";


import { validGeometryLoops as validGeometryLoops2 } from "../../../cache/geometry-persistent-cache";








import { compactRuntimeFurniture as compactRuntimeFurniture2 } from "../../items/studio-runtime-furniture";
import { floorOpeningPolygon as floorOpeningPolygon2 } from "../../../plan/studio-floor-openings";
import {
  mergeWallBands as mergeWallBands2,
} from "../../../materials/studio-wall-materials";


import { cacheObjectTransforms as cacheObjectTransforms2 } from "../../../../bridge/scene/scene-matrices";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import { mergeGeometries as mergeGeometries2 } from "/static/vendor/three/0.186.1/BufferGeometryUtils.js";


import {
  polygonArea as polygonArea2,
  subtractPolygonLoops as subtractPolygonLoops2,
} from "../../../plan/geometry";










import {
  isCourtyardDrawing as isCourtyardDrawing2,
} from "../../../loaders/studio-normalization";


import { lampItemTypeSet } from "../../items/item-catalog";
















import { applyItemOrientation } from "../../studio-app/scene/item-orientation";
import { createGroundGrid } from "../../studio-app/scene/ground-grid";

import type { StudioAppContext } from "../studio-app-context";
export interface BuildStudioSceneDeps { appCtx: StudioAppContext; backgroundSettings: any; batchSharedMeshes: any; buildCourtyardFoundation: any; buildGroundShadow: any; buildInteriorScene: any; buildItemModel: any; buildShapesWithHoles: any; closedWallLoops: any; collectLightSourceSpecs: any; createFloorMaterial: any; createSelectionRef: any; defaultWallRuntimeProfile: any; disposeFloorScene: any; geometryCacheHandle: any; getActiveFloor: any; getPixelsPerMeter: any; getSceneContentBounds: any; isEmbedStageMode: any; isEmbeddedStage: any; mergeStaticItemMeshes: any; refreshBaseLighting: any; refreshSceneRender: any; setupSceneShadows: any; }

export function buildStudioScene(deps: BuildStudioSceneDeps, { preserveLightCache: preserveLightCache = false } = {}) {
  const { appCtx, backgroundSettings, batchSharedMeshes, buildCourtyardFoundation, buildGroundShadow, buildInteriorScene, buildItemModel, buildShapesWithHoles, closedWallLoops, collectLightSourceSpecs, createFloorMaterial, createSelectionRef, defaultWallRuntimeProfile, disposeFloorScene, geometryCacheHandle, getActiveFloor, getPixelsPerMeter, getSceneContentBounds, isEmbedStageMode, isEmbeddedStage, mergeStaticItemMeshes, refreshBaseLighting, refreshSceneRender, setupSceneShadows } = deps;

  if (
    (appCtx.contactShadowController?.invalidate(),
    isEmbedStageMode && appCtx.sceneRootNode && (appCtx.sceneRootNode.userData.regionFloorId = appCtx.activeFloorId),
    !appCtx.sceneRootNode)
  )
    return;
  (refreshBaseLighting(),
    disposeFloorScene(),
    refreshSceneRender({
      shadows: true,
      scene: true,
      preserveLightCache: preserveLightCache,
    }));
  const buildStudioSceneScenePixelsPerMeter = getPixelsPerMeter();
  if (!buildStudioSceneScenePixelsPerMeter) return;
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
    );
  ((groundPlane.rotation.x = -Math.PI / 2),
    (groundPlane.position.y = groundShadowPlaneY),
    (groundPlane.receiveShadow = false),
    (groundPlane.userData.exportRole = "background"),
    (groundPlane.userData.groundReflectionReceiver = true),
    (groundPlane.userData.regionFloorId = appCtx.activeFloorId),
    appCtx.sceneRootNode.add(groundPlane),
    createGroundGrid(appCtx, groundPlaneSize, yt7, groundShadowPlaneY));
  const mg2 = createFloorMaterial(),
    mr2 = closedWallLoops(buildStudioSceneScenePixelsPerMeter);
  ((appCtx.sceneRootNode.userData.floorEdgeIndoorLoops = []), delete appCtx.sceneRootNode.userData.floorEdgeKey);
  const floorOpeningLoops = appCtx.studioState.items
    .filter(
      (buildStudioSceneFloorOpeningItem) =>
        buildStudioSceneFloorOpeningItem.type === "flooropening",
    )
    .map((floorOpeningDrawing) =>
      floorOpeningPolygon2(floorOpeningDrawing, buildStudioSceneScenePixelsPerMeter).map(
        (floorOpeningPoint) => {
          const floorOpeningWorldPoint = planPointToWorld(floorOpeningPoint);
          return {
            x: floorOpeningWorldPoint.x,
            y: floorOpeningWorldPoint.z,
          };
        },
      ),
    );
  appCtx.sceneRootNode.userData.floorEdgeOpenings = floorOpeningLoops;
  const addFloorIndoorLoop = (floorOpeningIndoorLoop: any) => {
      (buildGroundShadow(floorOpeningIndoorLoop, groundShadowPlaneY),
        appCtx.sceneRootNode.userData.floorEdgeIndoorLoops.push(floorOpeningIndoorLoop));
    },
    addGroundPlateMesh = (floorPlateGeometry: any, groundPlateGeometry: any, isVerticalFloorPlate: any) => {
      const groundPlateMesh = new ns2.Mesh(groundPlateGeometry, mg2);
      ((groundPlateMesh.rotation.x = isVerticalFloorPlate ? Math.PI / 2 : 0),
        (groundPlateMesh.position.y = isVerticalFloorPlate
          ? groundPlaneY
          : groundPlaneY - groundPlaneGap / 2),
        (groundPlateMesh.castShadow = false),
        (groundPlateMesh.receiveShadow = true),
        (groundPlateMesh.userData.exportRole = "plan"),
        (groundPlateMesh.userData.regionReceiverKind = "floor"),
        (groundPlateMesh.userData.regionFloorId = appCtx.activeFloorId),
        appCtx.sceneRootNode.add(groundPlateMesh),
        floorOpeningLoops.length || addFloorIndoorLoop(floorPlateGeometry));
    };
  if (floorOpeningLoops.length) {
    const floorOpeningWorldLoops = mr2.length
        ? mr2.map((floorOpeningWorldMap: any) =>
            floorOpeningWorldMap.map((floorOpeningPlanPoint: any) => {
              const floorOpeningPlanWorldPoint = planPointToWorld(floorOpeningPlanPoint);
              return {
                x: floorOpeningPlanWorldPoint.x,
                y: floorOpeningPlanWorldPoint.z,
              };
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
            "floor-openings",
            [floorOpeningWorldLoops, floorOpeningLoops],
            () => subtractPolygonLoops2(floorOpeningWorldLoops, floorOpeningLoops),
            validGeometryLoops2,
          )
        : subtractPolygonLoops2(floorOpeningWorldLoops, floorOpeningLoops),
      ms6 = buildShapesWithHoles(floorOpeningSubtractLoops);
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
      : mg2.dispose();
    for (const openingDifferenceOuterLoop of floorOpeningSubtractLoops.filter(
      (openingDifferenceLoop: any) => polygonArea2(openingDifferenceLoop) > 0,
    )) {
      const openingDifferenceWorldLoop = openingDifferenceOuterLoop.map((differenceLoopPoint: any) => ({
        x: differenceLoopPoint.x,
        z: differenceLoopPoint.y,
      }));
      (buildGroundShadow(openingDifferenceWorldLoop, groundShadowPlaneY, floorOpeningLoops),
        appCtx.sceneRootNode.userData.floorEdgeIndoorLoops.push(openingDifferenceWorldLoop));
    }
  } else {
    if (mr2.length) {
      const modelWorldLoops = mr2.map((modelLoopGroup: any) => modelLoopGroup.map(planPointToWorld)),
        modelShapeList = modelWorldLoops.map((modelWorldLoop: any) => {
          const modelShape = new ns2.Shape();
          return (
            modelWorldLoop.forEach((modelShapePoint: any, modelShapePointIndex: any) => {
              modelShapePointIndex === 0
                ? modelShape.moveTo(modelShapePoint.x, modelShapePoint.z)
                : modelShape.lineTo(modelShapePoint.x, modelShapePoint.z);
            }),
            modelShape.closePath(),
            modelShape
          );
        });
      addGroundPlateMesh(
        modelWorldLoops[0],
        new ns2.ExtrudeGeometry(modelShapeList, {
          depth: groundPlaneGap,
          bevelEnabled: false,
          steps: 1,
        }),
        true,
      );
      for (const extraModelLoop of modelWorldLoops.slice(1)) addFloorIndoorLoop(extraModelLoop);
    } else {
      if (
        appCtx.studioState.items.some(
          (gardenOrCourtyardItem) =>
            isCourtyardDrawing2(gardenOrCourtyardItem) ||
            gardenOrCourtyardItem.type.startsWith("garden-"),
        )
      )
        mg2.dispose();
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
        ];
        addGroundPlateMesh(
          groundCornerPoints,
          new ns2.BoxGeometry(planWidth, groundPlaneGap, planHeight),
          false,
        );
      }
    }
  }
  (buildCourtyardFoundation({
    ppm: buildStudioSceneScenePixelsPerMeter,
    toWorld: planPointToWorld,
  }),
    buildInteriorScene({
      ppm: buildStudioSceneScenePixelsPerMeter,
      toWorld: planPointToWorld,
      floorSurfaceY: groundPlaneY,
    }));
  const $u2 = collectLightSourceSpecs(),
    placedItemRecords: any[] = [];
  for (const placedItem of appCtx.studioState.items) {
    const placedItemWorldPoint = planPointToWorld(placedItem);
    if (placedItem.type === "flooropening") continue;
    const vu2 = buildItemModel(placedItem, $u2);
    (isEmbeddedStage &&
      !createSelectionRef("item", placedItem.id) &&
      compactStaticDeviceParts2(ns2, vu2, placedItem.type, buildStaticMaterialKey),
      isEmbeddedStage &&
        Object.assign(vu2.userData, {
          editorModelId: placedItem.id,
          editorFloorId: appCtx.activeFloorId,
        }),
      isEmbedStageMode &&
        ["smallcar", "suv", "scooter"].includes(placedItem.type) &&
        (vu2.userData.preserveDetailedSurface = true),
      isEmbeddedStage &&
        [
          "airer",
          "fan",
          "ceiling-fan",
          "exhaust-fan",
          "storagewaterheater",
          "gaswaterheater",
          "airpurifier",
          "wallac",
          "floorac",
          "airoutlet",
          "curtain",
          "nas",
          "fridge",
          "freezer",
          "dishwasher",
          "washer",
          "dryer",
          "plant",
          "camera",
          "presence",
          "speaker",
          "tv",
          "robotvacuum",
          "smallcar",
          "suv",
          "scooter",
        ].includes(placedItem.type) &&
        ((vu2.userData.environmentModelId = placedItem.id),
        (vu2.userData.environmentModelType = ["smallcar", "suv", "scooter"].includes(
          placedItem.type,
        )
          ? "smallcar"
          : placedItem.type),
        (vu2.userData.environmentFloorId = appCtx.activeFloorId)),
      vu2.position.set(placedItemWorldPoint.x, placedItem.elevation || 0, placedItemWorldPoint.z),
      applyItemOrientation(vu2, placedItem),
      (vu2.userData.modelLayer = lampItemTypeSet.has(placedItem.type) ? "lights" : "items"),
      (vu2.userData.exportRole = placedItem.type === "planlabel" ? "label" : "plan"),
      appCtx.sceneRootNode.add(vu2),
      lampItemTypeSet.has(placedItem.type) ||
        placedItemRecords.push({
          item: placedItem,
          group: vu2,
        }));
  }
  (batchSharedMeshes(appCtx.sceneRootNode, placedItemRecords),
    isEmbedStageMode &&
      (new URLSearchParams(window.location.search).get("wall-trial") ?? defaultWallRuntimeProfile)
        .split(",")
        .includes("merge") &&
      mergeWallBands2(ns2, appCtx.sceneRootNode, mergeGeometries2),
    isEmbeddedStage &&
      new URLSearchParams(window.location.search).get("furniture-runtime") !== "baseline" &&
      compactRuntimeFurniture2(
        appCtx.sceneRootNode,
        placedItemRecords.filter(
          ({ item: locatedItemRef }) => !createSelectionRef("item", locatedItemRef.id),
        ),
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
        (sceneNodeForFlags.userData.exportRole = "plan");
    }),
    setupSceneShadows(appCtx.sceneRootNode, {
      rebuildAtlas: !preserveLightCache,
    }),
    applyShadowReceiverTrial2(appCtx.sceneRootNode),
    isEmbeddedStage && cacheObjectTransforms2(appCtx.sceneRootNode, ns2.Object3D),
    appCtx.sceneStyle === "warm-wood" &&
      appCtx.sceneRootNode.traverse((sceneNodeVisibility: any) => {
        (["background", "grid"].includes(sceneNodeVisibility.userData?.exportRole) ||
          sceneNodeVisibility.userData?.floorPlanGroundShadow === true ||
          sceneNodeVisibility.userData?.batchedWallContactShadowCount != null) &&
          ((sceneNodeVisibility.userData.backgroundThemeHidden = true),
          (sceneNodeVisibility.visible = false));
      }));

}
