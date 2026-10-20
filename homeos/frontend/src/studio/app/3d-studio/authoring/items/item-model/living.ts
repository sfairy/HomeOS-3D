/**
 * 物品模型分派族：living。
 *
 * 由 `items/studio-item-model.ts` 的 `buildItemModel` 按固定顺序调用；
 * 命中任一分支返回 true，否则返回 false。正文从原单体逐字切出，仅追加 return。
 */

import { addBoxMesh, addFurnitureAssembly } from "../studio-mesh-primitives";
import { roundTableTypeSet } from "../item-catalog";
import { isTurntableRoundTable } from "../../ui/studio-app-helpers";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import type { ItemModelScope } from "./types";

export function buildLiving(scope: ItemModelScope): boolean {
  const {
    addCylinderMesh,
    applyAccentEmissive,
    createSelectionRef,
    createPlanLabel,
    addLightModel,
    addRugMeshes,
    addStripLightPreview,
    disposeObjectTree,
    mergeMeshesByType,
    createWallSideMaterial,
    createWallTopMaterial,
    applyItemOptimization,
    getPixelsPerMeter,
    closedWallLoops,
    backgroundSettings,
    studioState,
    studioTelevisionDeps,
    activeFloorId,
    isEmbeddedStage,
    isPerformanceDiagnostics,
    lampsLayerIndex,
    meshStatsByType,
    nextTenItemTypeSet,
    optimizationItemTypeSet,
    applianceOptimizationTypeSet,
    itemModelNode,
    modelItem,
    modelShadowIds,
    width6,
    depth,
    height6,
    yt4,
    furniture,
    appliance,
    furnitureSoft,
    furnitureLight,
    furnitureDark,
  } = scope;

  if (modelItem.type === "sofa") {
    const handleOffset = height6 * 0.14,
      handlePositionY = (handleHeight: any) => handleHeight - handleOffset + -0.008;
    (addBoxMesh(
      itemModelNode,
      width6 * 0.92,
      height6 * 0.28,
      depth * 0.72,
      0,
      handlePositionY(height6 * 0.28),
      depth * 0.06,
      furniture,
    ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.92,
        height6 * 0.55,
        depth * 0.18,
        0,
        handlePositionY(height6 * 0.56),
        -depth * 0.35,
        furniture,
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.1,
        height6 * 0.48,
        depth * 0.75,
        -width6 * 0.46,
        handlePositionY(height6 * 0.39),
        depth * 0.03,
        furniture,
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.1,
        height6 * 0.48,
        depth * 0.75,
        width6 * 0.46,
        handlePositionY(height6 * 0.39),
        depth * 0.03,
        furniture,
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.42,
        height6 * 0.12,
        depth * 0.55,
        -width6 * 0.22,
        handlePositionY(height6 * 0.47),
        depth * 0.07,
        furnitureSoft,
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.42,
        height6 * 0.12,
        depth * 0.55,
        width6 * 0.22,
        handlePositionY(height6 * 0.47),
        depth * 0.07,
        furnitureSoft,
      ));
    return true;
  } else if (modelItem.type === "bed") {
    (addBoxMesh(
      itemModelNode,
      width6 * 0.996,
      height6 * 0.3,
      depth * 0.996,
      0,
      height6 * 0.15,
      0,
      furnitureDark,
    ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.96,
        height6 * 0.32,
        depth * 0.92,
        0,
        height6 * 0.43,
        depth * 0.03,
        furnitureSoft,
      ),
      addBoxMesh(
        itemModelNode,
        width6,
        height6 * 0.95,
        depth * 0.09,
        0,
        height6 * 0.48,
        -depth * 0.455,
        furniture,
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.38,
        height6 * 0.14,
        depth * 0.22,
        -width6 * 0.23,
        height6 * 0.66,
        -depth * 0.29,
        furnitureLight,
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.38,
        height6 * 0.14,
        depth * 0.22,
        width6 * 0.23,
        height6 * 0.66,
        -depth * 0.29,
        furnitureLight,
      ));
    return true;
  } else if (modelItem.type === "nightstand") {
    (addBoxMesh(
      itemModelNode,
      width6,
      height6 * 0.78,
      depth,
      0,
      height6 * 0.49,
      0,
      furniture,
    ),
      addBoxMesh(
        itemModelNode,
        width6 * 1.04,
        height6 * 0.07,
        depth * 1.05,
        0,
        height6 * 0.91,
        0,
        furnitureSoft,
        {
          roughness: 0.5,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.9,
        0.014,
        depth * 1.01,
        0,
        height6 * 0.63,
        depth * 0.01,
        furnitureDark,
        {
          rounded: false,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.9,
        0.014,
        depth * 1.01,
        0,
        height6 * 0.38,
        depth * 0.01,
        furnitureDark,
        {
          rounded: false,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.22,
        0.022,
        0.032,
        0,
        height6 * 0.5,
        depth * 0.52,
        furnitureLight,
        {
          metalness: 0.5,
        },
      ));
    for (const drawerOffsetX of [-0.38, 0.38])
      for (const drawerOffsetZ of [-0.35, 0.35])
        addBoxMesh(
          itemModelNode,
          0.035,
          height6 * 0.2,
          0.035,
          width6 * drawerOffsetX,
          height6 * 0.1,
          depth * drawerOffsetZ,
          furnitureDark,
          {
            metalness: 0.18,
          },
        );
    return true;
  } else if (modelItem.type === "table") {
    const topPanelWidth = width6 * 0.64,
      topPanelDepth = depth * 0.48;
    addBoxMesh(
      itemModelNode,
      topPanelWidth,
      height6 * 0.1,
      topPanelDepth,
      0,
      height6 * 0.93,
      0,
      furniture,
    );
    for (const knobOffsetX of [-0.43, 0.43])
      for (const knobOffsetZ of [-0.38, 0.38])
        addBoxMesh(
          itemModelNode,
          0.07,
          height6 * 0.9,
          0.07,
          topPanelWidth * knobOffsetX,
          height6 * 0.45,
          topPanelDepth * knobOffsetZ,
          furnitureDark,
        );
    const doorWidth = Math.min(width6 * 0.2, 0.5),
      doorDepth = Math.min(depth * 0.27, 0.5),
      doorHeight = height6 * 1.18;
    (addFurnitureAssembly(
      itemModelNode,
      doorWidth,
      doorDepth,
      doorHeight,
      -width6 * 0.37,
      0,
      Math.PI / 2,
      furnitureSoft,
      furnitureDark,
    ),
      addFurnitureAssembly(
        itemModelNode,
        doorWidth,
        doorDepth,
        doorHeight,
        width6 * 0.37,
        0,
        -Math.PI / 2,
        furnitureSoft,
        furnitureDark,
      ),
      addFurnitureAssembly(
        itemModelNode,
        doorWidth,
        doorDepth,
        doorHeight,
        0,
        -depth * 0.35,
        0,
        furnitureSoft,
        furnitureDark,
      ),
      addFurnitureAssembly(
        itemModelNode,
        doorWidth,
        doorDepth,
        doorHeight,
        0,
        depth * 0.35,
        Math.PI,
        furnitureSoft,
        furnitureDark,
      ));
    return true;
  } else if (roundTableTypeSet.has(modelItem.type)) {
    const sinkRadius = Math.min(width6, depth) * 0.32,
      sinkDepth = Math.max(height6 * 0.07, 0.045),
      sinkTopY = height6 * 0.92;
    (addCylinderMesh(
      itemModelNode,
      sinkRadius,
      sinkRadius,
      sinkDepth,
      0,
      sinkTopY,
      0,
      furnitureLight,
      {
        segments: 48,
        roughness: 0.5,
        metalness: 0.08,
      },
    ),
      addCylinderMesh(
        itemModelNode,
        Math.min(width6, depth) * 0.22,
        Math.min(width6, depth) * 0.3,
        height6 * 0.68,
        0,
        height6 * 0.43,
        0,
        furniture,
        {
          segments: 36,
          roughness: 0.55,
          metalness: 0.06,
        },
      ),
      addCylinderMesh(
        itemModelNode,
        Math.min(width6, depth) * 0.34,
        Math.min(width6, depth) * 0.34,
        height6 * 0.07,
        0,
        height6 * 0.045,
        0,
        furnitureDark,
        {
          segments: 40,
          roughness: 0.42,
          metalness: 0.12,
        },
      ),
      isTurntableRoundTable(modelItem) &&
        (addCylinderMesh(
          itemModelNode,
          sinkRadius * 0.58,
          sinkRadius * 0.58,
          Math.max(height6 * 0.035, 0.025),
          0,
          sinkTopY + sinkDepth * 0.58,
          0,
          furnitureSoft,
          {
            segments: 48,
            roughness: 0.48,
            metalness: 0.08,
          },
        ),
        addCylinderMesh(
          itemModelNode,
          sinkRadius * 0.44,
          sinkRadius * 0.44,
          0.018,
          0,
          sinkTopY + sinkDepth * 0.58 + 0.036,
          0,
          furnitureDark,
          {
            segments: 48,
            roughness: 0.32,
            metalness: 0.12,
          },
        )));
    const burnerWidth = Math.min(width6 * 0.17, 0.42),
      burnerDepth = Math.min(depth * 0.19, 0.44),
      burnerHeight = height6 * 1.15;
    (addFurnitureAssembly(
      itemModelNode,
      burnerWidth,
      burnerDepth,
      burnerHeight,
      -width6 * 0.38,
      0,
      Math.PI / 2,
      furnitureSoft,
      furnitureDark,
    ),
      addFurnitureAssembly(
        itemModelNode,
        burnerWidth,
        burnerDepth,
        burnerHeight,
        width6 * 0.38,
        0,
        -Math.PI / 2,
        furnitureSoft,
        furnitureDark,
      ),
      addFurnitureAssembly(
        itemModelNode,
        burnerWidth,
        burnerDepth,
        burnerHeight,
        0,
        -depth * 0.38,
        0,
        furnitureSoft,
        furnitureDark,
      ),
      addFurnitureAssembly(
        itemModelNode,
        burnerWidth,
        burnerDepth,
        burnerHeight,
        0,
        depth * 0.38,
        Math.PI,
        furnitureSoft,
        furnitureDark,
      ));
    return true;
  } else if (modelItem.type === "bar") {
    (addBoxMesh(
      itemModelNode,
      width6,
      height6 * 0.12,
      depth,
      0,
      height6 * 0.94,
      0,
      furnitureSoft,
      {
        roughness: 0.5,
      },
    ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.92,
        height6 * 0.78,
        depth * 0.46,
        0,
        height6 * 0.45,
        -depth * 0.18,
        furniture,
        {
          roughness: 0.65,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.86,
        height6 * 0.48,
        0.035,
        0,
        height6 * 0.42,
        depth * 0.28,
        furnitureDark,
        {
          rounded: false,
          roughness: 0.48,
        },
      ));
    for (const burnerOffsetX of [-0.3, 0, 0.3])
      (addCylinderMesh(
        itemModelNode,
        depth * 0.14,
        depth * 0.14,
        0.045,
        width6 * burnerOffsetX,
        height6 * 0.66,
        depth * 0.52,
        furnitureSoft,
        {
          segments: 28,
          roughness: 0.52,
        },
      ),
        addCylinderMesh(
          itemModelNode,
          0.025,
          0.025,
          height6 * 0.62,
          width6 * burnerOffsetX,
          height6 * 0.34,
          depth * 0.52,
          furnitureDark,
          {
            segments: 18,
            metalness: 0.38,
            roughness: 0.28,
          },
        ),
        addCylinderMesh(
          itemModelNode,
          depth * 0.1,
          depth * 0.12,
          0.035,
          width6 * burnerOffsetX,
          0.018,
          depth * 0.52,
          furnitureDark,
          {
            segments: 24,
            metalness: 0.3,
            roughness: 0.34,
          },
        ));
    return true;
  } else if (modelItem.type === "aquarium") {
    const baseCabinetHeight = Math.max(height6 * 0.52, 0.45),
      baseCabinetTopY = baseCabinetHeight,
      upperCabinetHeight = Math.max(height6 - baseCabinetHeight, 0.2),
      cabinetFrameSize = Math.min(
        Math.max(Math.min(width6, depth) * 0.025, 0.012),
        0.028,
      ),
      cabinetOptions = {
        rounded: false,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: ns2.DoubleSide,
        roughness: 0.06,
        metalness: 0.02,
        castShadow: false,
        receiveShadow: false,
        renderOrder: 6,
      };
    (addBoxMesh(
      itemModelNode,
      width6,
      baseCabinetHeight,
      depth,
      0,
      baseCabinetHeight * 0.5,
      0,
      furniture,
      {
        rounded: false,
        roughness: 0.56,
      },
    ),
      addBoxMesh(
        itemModelNode,
        width6,
        0.035,
        depth,
        0,
        baseCabinetHeight,
        0,
        yt4.frame,
        {
          rounded: false,
          metalness: 0.34,
          roughness: 0.3,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 - cabinetFrameSize * 2,
        upperCabinetHeight,
        cabinetFrameSize,
        0,
        baseCabinetTopY + upperCabinetHeight * 0.5,
        -depth * 0.5 + cabinetFrameSize * 0.5,
        yt4.glass,
        cabinetOptions,
      ),
      addBoxMesh(
        itemModelNode,
        width6 - cabinetFrameSize * 2,
        upperCabinetHeight,
        cabinetFrameSize,
        0,
        baseCabinetTopY + upperCabinetHeight * 0.5,
        depth * 0.5 - cabinetFrameSize * 0.5,
        yt4.glass,
        cabinetOptions,
      ),
      addBoxMesh(
        itemModelNode,
        cabinetFrameSize,
        upperCabinetHeight,
        depth - cabinetFrameSize * 2,
        -width6 * 0.5 + cabinetFrameSize * 0.5,
        baseCabinetTopY + upperCabinetHeight * 0.5,
        0,
        yt4.glass,
        cabinetOptions,
      ),
      addBoxMesh(
        itemModelNode,
        cabinetFrameSize,
        upperCabinetHeight,
        depth - cabinetFrameSize * 2,
        width6 * 0.5 - cabinetFrameSize * 0.5,
        baseCabinetTopY + upperCabinetHeight * 0.5,
        0,
        yt4.glass,
        cabinetOptions,
      ));
    return true;
  } else if (modelItem.type === "coffeetable") {
    const handleKnobRadius = Math.min(width6 * 0.34, depth * 0.42),
      handleSmallKnobRadius = Math.min(width6 * 0.23, depth * 0.29),
      knobX = -width6 * 0.16,
      knobZ = depth * 0.08,
      smallKnobX = width6 * 0.24,
      smallKnobZ = -depth * 0.2,
      knobBaseY = height6 * 0.58,
      smallKnobBaseY = height6 * 0.76;
    addCylinderMesh(
      itemModelNode,
      handleKnobRadius * 0.3,
      handleKnobRadius * 0.5,
      knobBaseY,
      knobX,
      knobBaseY * 0.5,
      knobZ,
      furniture,
      {
        segments: 40,
        roughness: 0.82,
      },
    );
    const knobBarDiameter = height6 * 0.07,
      knobCapDiameter = height6 * 0.055,
      knobBarCenterY = knobBaseY + knobBarDiameter * 0.5 + 0.001,
      knobCapCenterY =
        knobBarCenterY +
        (knobBarDiameter + knobCapDiameter) * 0.5 +
        0.001;
    (addCylinderMesh(
      itemModelNode,
      handleKnobRadius * 1.02,
      handleKnobRadius * 1.02,
      knobBarDiameter,
      knobX,
      knobBarCenterY,
      knobZ,
      furnitureDark,
      {
        segments: 48,
        roughness: 0.72,
      },
    ),
      addCylinderMesh(
        itemModelNode,
        handleKnobRadius,
        handleKnobRadius,
        knobCapDiameter,
        knobX,
        knobCapCenterY,
        knobZ,
        furnitureLight,
        {
          segments: 48,
          roughness: 0.9,
        },
      ),
      addCylinderMesh(
        itemModelNode,
        handleSmallKnobRadius * 0.32,
        handleSmallKnobRadius * 0.52,
        smallKnobBaseY,
        smallKnobX,
        smallKnobBaseY * 0.5,
        smallKnobZ,
        furnitureSoft,
        {
          segments: 40,
          roughness: 0.82,
        },
      ));
    const smallKnobBarDiameter = height6 * 0.07,
      smallKnobCapDiameter = height6 * 0.055,
      smallKnobBarCenterY =
        smallKnobBaseY + smallKnobBarDiameter * 0.5 + 0.001,
      smallKnobCapCenterY =
        smallKnobBarCenterY +
        (smallKnobBarDiameter + smallKnobCapDiameter) * 0.5 +
        0.001;
    (addCylinderMesh(
      itemModelNode,
      handleSmallKnobRadius * 1.02,
      handleSmallKnobRadius * 1.02,
      smallKnobBarDiameter,
      smallKnobX,
      smallKnobBarCenterY,
      smallKnobZ,
      furnitureDark,
      {
        segments: 48,
        roughness: 0.72,
      },
    ),
      addCylinderMesh(
        itemModelNode,
        handleSmallKnobRadius,
        handleSmallKnobRadius,
        smallKnobCapDiameter,
        smallKnobX,
        smallKnobCapCenterY,
        smallKnobZ,
        furnitureLight,
        {
          segments: 48,
          roughness: 0.9,
        },
      ));
    return true;
  } else if (modelItem.type === "squarecoffeetable") {
    const drawerFrontHeight = Math.max(height6 * 0.22, 0.085),
      drawerGapHeight = Math.max(height6 * 0.16, 0.065),
      drawerTopOffset = drawerFrontHeight + 0.012,
      drawerPanelHeight = Math.max(
        height6 - drawerTopOffset - drawerGapHeight,
        0.16,
      ),
      drawerSideWidth = Math.max(width6 * 0.075, 0.045),
      drawerFrontDepth = Math.max(depth * 0.035, 0.018),
      drawerFrontPanelHeight = drawerPanelHeight * 0.72,
      drawerFrontPanelY = drawerTopOffset + drawerPanelHeight * 0.48,
      drawerHandleWidth = width6 * 0.27,
      drawerHandleOffset = width6 * 0.34,
      drawerFrontColor = furniture,
      drawerHandleColor = furnitureSoft;
    (addBoxMesh(
      itemModelNode,
      width6 * 0.98,
      drawerGapHeight,
      depth * 1.03,
      0,
      drawerTopOffset + drawerPanelHeight + drawerGapHeight * 0.5,
      0,
      drawerHandleColor,
      {
        radius: Math.min(width6, depth) * 0.035,
        roughness: 0.5,
        metalness: 0.02,
      },
    ),
      addBoxMesh(
        itemModelNode,
        drawerSideWidth,
        drawerPanelHeight,
        depth * 0.92,
        -width6 * 0.5 + drawerSideWidth * 0.5,
        drawerTopOffset + drawerPanelHeight * 0.5,
        0,
        drawerFrontColor,
        {
          rounded: false,
          roughness: 0.6,
        },
      ),
      addBoxMesh(
        itemModelNode,
        drawerSideWidth,
        drawerPanelHeight,
        depth * 0.92,
        width6 * 0.5 - drawerSideWidth * 0.5,
        drawerTopOffset + drawerPanelHeight * 0.5,
        0,
        drawerFrontColor,
        {
          rounded: false,
          roughness: 0.6,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.86,
        drawerPanelHeight * 0.9,
        0.035,
        0,
        drawerTopOffset + drawerPanelHeight * 0.52,
        -depth * 0.45,
        drawerFrontColor,
        {
          rounded: false,
          roughness: 0.75,
        },
      ),
      addBoxMesh(
        itemModelNode,
        width6 * 0.86,
        drawerPanelHeight * 0.1,
        depth * 0.9,
        0,
        drawerTopOffset + drawerPanelHeight * 0.08,
        0,
        drawerFrontColor,
        {
          rounded: false,
          roughness: 0.58,
        },
      ));
    for (const drawerHandleX of [
      -drawerHandleOffset,
      0,
      drawerHandleOffset,
    ]) {
      addBoxMesh(
        itemModelNode,
        drawerHandleWidth,
        drawerFrontPanelHeight,
        drawerFrontDepth,
        drawerHandleX,
        drawerFrontPanelY,
        depth * 0.48,
        drawerHandleColor,
        {
          radius: Math.min(width6, depth) * 0.025,
          roughness: 0.52,
        },
      );
      const handleBarY =
        drawerHandleX === 0
          ? 0
          : drawerHandleX +
            (drawerHandleX < 0
              ? drawerHandleWidth * 0.3
              : -drawerHandleWidth * 0.3);
      addBoxMesh(
        itemModelNode,
        0.022,
        drawerFrontPanelHeight * 0.2,
        0.025,
        handleBarY,
        drawerFrontPanelY,
        depth * 0.505,
        furnitureDark,
        {
          radius: 0.009,
          metalness: 0.22,
          roughness: 0.3,
        },
      );
    }
    const legRadius = Math.max(Math.min(width6, depth) * 0.055, 0.035);
    for (const legOffsetX of [-width6 * 0.4, width6 * 0.4])
      for (const legOffsetZ of [-depth * 0.36, depth * 0.36]) {
        const legMesh = addBoxMesh(
          itemModelNode,
          legRadius,
          drawerFrontHeight,
          legRadius,
          legOffsetX,
          drawerFrontHeight * 0.5,
          legOffsetZ,
          furnitureDark,
          {
            radius: legRadius * 0.22,
            roughness: 0.55,
            metalness: 0.02,
          },
        );
        ((legMesh.rotation.z = (legOffsetX < 0 ? -1 : 1) * 0.09),
          (legMesh.rotation.x = (legOffsetZ < 0 ? -1 : 1) * 0.06));
      }
    return true;
  } else if (modelItem.type === "chair") {
    addFurnitureAssembly(
      itemModelNode,
      width6,
      depth,
      height6,
      0,
      0,
      0,
      furniture,
      furnitureDark,
    );
    return true;
  }
  return false;
}
