/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import { state } from "./studio-state.js";
import {
  clampWindowT,
  distance,
  slidingDoorPanelCenters,
  unclosedWallEndpoints,
  wallLengthMeters
} from "../plan/geometry.js";
import {
  PLAN_ACCENT,
  PLAN_ACCENT_BRIGHT,
  currentPixelsPerMeter,
  drawPlanItem,
  getCurrentFloor,
  planContext,
  planToScreen,
  selectElement
} from "./studio-plan-render.js";
import {
  isSelected,
  wallDerivedData
} from "./studio-architecture.js";
import {
  DOOR_TYPE_DIMENSIONS,
  ITEM_TYPE_DEFINITIONS
} from "./studio-config-tables.js";
import { LIGHT_ITEM_TYPES } from "./studio-item-types.js";
import { paletteColor } from "../../utils/colors.js";
import { createPlanDrawingTools } from "../plan/studio-plan-drawing.js";
import { floorPolygonsForWalls } from "./studio-render-pipeline.js";
import { scenePointToFloorPoint } from "./studio-plan-geometry.js";
import { floorPointToScenePoint } from "./studio-overview-center.js";

export const STUDIO_AURA_FALLBACK = "#c9a0ff";

export const STUDIO_ECO_FALLBACK = "#5fd0a8";

/** 吸附点 / 量测读数 / 窗默认描边。 */
export const PLAN_GUIDE = () => paletteColor("--guide", STUDIO_AURA_FALLBACK);

/** 闭合空间有效。 */
export const PLAN_DONE = () => paletteColor("--done", STUDIO_ECO_FALLBACK);

export const STUDIO_PAPER_FALLBACK = "#0b0f12";

/** 户型画布的「纸」底色（导出与截图时先把整张画布铺满它）。原来是 #0d1319。 */
export const PLAN_PAPER = () => paletteColor("--hos-tool-bg", STUDIO_PAPER_FALLBACK);

export const zoomValueElement = selectElement("#zoom-value");

export const {
  drawMetricGrid: drawMetricGrid,
  drawLine: drawPlanLine,
  drawPoint: drawPlanPoint,
  drawOpenEndpointWarning: drawOpenEndpointWarning,
  drawFloatingLabel: drawFloatingLabel
} = createPlanDrawingTools({
  context: planContext,
  planToScreen: planToScreen,
  screenToPlan: screenToPlan,
  pixelsPerMeter: currentPixelsPerMeter,
  getCanvasSize: () => ({
    width: state.viewportWidthPx,
    height: state.viewportHeightPx
  }),
  getViewZoom: () => state.viewTransform.zoom
});

export const selectedDoorType = "solid";

/**
 * 把平面像素点从一层楼层的坐标系换算到另一层。实现是「先转到世界、再转回平面」两步
 */
export function convertBetweenFloors(planPoint: any, fromFloor: any, toFloor: any) {
  return scenePointToFloorPoint(toFloor, floorPointToScenePoint(fromFloor, planPoint));
}

/**
 * 取参照层的墙并换算到当前层坐标系，供对齐时吸附使用。
 */
export function referenceWallsForAlignment() {
  if (!state.floorAlignState) {
    return [];
  }
  const alignmentFloor = getCurrentFloor();
  return state.floorAlignState.referenceFloor.scene.walls.map((sourceWall: any) => ({
    ...sourceWall,
    start: convertBetweenFloors(sourceWall.start, state.floorAlignState.referenceFloor, alignmentFloor),
    end: convertBetweenFloors(sourceWall.end, state.floorAlignState.referenceFloor, alignmentFloor)
  }));
}

/**
 * 把画布坐标绕视口中心旋转，得到屏幕上实际显示的位置。角度取负：document 里存的是
 */
export function rotateScreenPoint(screenCoordinates: any) {
  const centerX = state.viewportWidthPx / 2;
  const centerY = state.viewportHeightPx / 2;
  const viewRotationRad = (-state.viewTransform.rotation * Math.PI) / 180;
  const cosRotation = Math.cos(viewRotationRad);
  const sinRotation = Math.sin(viewRotationRad);
  const offsetX = screenCoordinates.x - centerX;
  const offsetY = screenCoordinates.y - centerY;
  return {
    x: centerX + offsetX * cosRotation - offsetY * sinRotation,
    y: centerY + offsetX * sinRotation + offsetY * cosRotation
  };
}

/**
 * 画布坐标 → 平面坐标，是 planToScreen 与 rotateScreenPoint 的联合逆运算。顺序与正向
 */
export function screenToPlan(screenPointToConvert: any) {
  const rotatedPoint = rotateScreenPoint(screenPointToConvert);
  return {
    x: (rotatedPoint.x - state.viewTransform.offsetX) / state.viewTransform.zoom,
    y: (rotatedPoint.y - state.viewTransform.offsetY) / state.viewTransform.zoom
  };
}

/**
 * 取（并缓存）没有闭合的墙端点，用于提示「这一圈墙还没围成房间」。判定依赖楼板多边形：
 */
export function unclosedEndpointsForWalls(endpointToleranceMeters: any) {
  const endpointDerived = wallDerivedData(endpointToleranceMeters);
  endpointDerived.unclosedEndpoints ||= unclosedWallEndpoints(
    state.activeScene.walls,
    endpointDerived.tolerance,
    floorPolygonsForWalls(endpointToleranceMeters)
  );
  return endpointDerived.unclosedEndpoints;
}

/**
 * 算出门 / 窗 / 栏杆在平面上的落位：中心点、两端点与墙方向单位向量。洞口位置以「沿墙比例 t」
 */
export function openingPlacementInfo(opening: any) {
  const hostWallRecord = state.activeScene.walls.find((hostWall: any) => hostWall.id === opening.wallId);
  if (!hostWallRecord) {
    return null;
  }
  const deltaX = hostWallRecord.end.x - hostWallRecord.start.x;
  const deltaY = hostWallRecord.end.y - hostWallRecord.start.y;
  const wallLengthPlan = Math.hypot(deltaX, deltaY);
  if (!wallLengthPlan) {
    return null;
  }
  const clampedT = clampWindowT(hostWallRecord, opening, currentPixelsPerMeter() || 1);
  const position = {
    x: hostWallRecord.start.x + deltaX * clampedT,
    y: hostWallRecord.start.y + deltaY * clampedT
  };
  const halfWidthPlan = Math.min(
    (opening.width * (currentPixelsPerMeter() || 1)) / 2,
    wallLengthPlan / 2
  );
  const direction = {
    x: deltaX / wallLengthPlan,
    y: deltaY / wallLengthPlan
  };
  return {
    wall: hostWallRecord,
    center: position,
    start: {
      x: position.x - direction.x * halfWidthPlan,
      y: position.y - direction.y * halfWidthPlan
    },
    end: {
      x: position.x + direction.x * halfWidthPlan,
      y: position.y + direction.y * halfWidthPlan
    },
    unit: direction
  };
}

/**
 * 在平面图上绘制一段栏杆（三层描边 + 两端圆点 + 选中时的浮动标签）。最外层用近黑色、宽度为
 */
export function drawPlanRailing(railing: any, railingOptions: any = {}) {
  const railingPlacement = openingPlacementInfo(railing);
  if (!railingPlacement) {
    return;
  }
  const isRailingSelected = isSelected("railing", railing.id);
  const railingStrokeColor = railingOptions.preview
    ? "rgba(123, 220, 240, .72)"
    : isRailingSelected
      ? PLAN_ACCENT_BRIGHT()
      : "#8bd7e8";
  const railingOutlineWidthPx = Math.max(
    10,
    railingPlacement.wall.thickness * (currentPixelsPerMeter() || 100) * state.viewTransform.zoom + 5
  );
  drawPlanLine(railingPlacement.start, railingPlacement.end, {
    color: "rgba(7, 16, 21, .94)",
    width: railingOutlineWidthPx,
    cap: "butt"
  });
  drawPlanLine(railingPlacement.start, railingPlacement.end, {
    color: railingStrokeColor,
    width: isRailingSelected ? 5 : 3,
    cap: "butt"
  });
  drawPlanLine(railingPlacement.start, railingPlacement.end, {
    color: "rgba(224, 250, 255, .72)",
    width: 1,
    cap: "butt"
  });
  drawPlanPoint(railingPlacement.start, railingStrokeColor, isRailingSelected ? 3 : 2);
  drawPlanPoint(railingPlacement.end, railingStrokeColor, isRailingSelected ? 3 : 2);
  if (isRailingSelected && !railingOptions.preview) {
    drawFloatingLabel(
      railingPlacement.center,
      "玻璃栏杆 · " + railing.width.toFixed(2) + " m",
      "#8bd7e8"
    );
  }
}

export function drawPlanDoor(door: any, doorOptions: any = {}) {
  const doorPlacement = openingPlacementInfo(door);
  if (!doorPlacement) {
    return;
  }
  const isDoorSelected = isSelected("door", door.id);
  const doorType = door.doorType || "solid";
  const doorStrokeColor = doorOptions.preview
    ? "rgba(255, 189, 110, .76)"
    : isDoorSelected
      ? PLAN_ACCENT_BRIGHT()
      : ["solid", "double", "entry", "roller-shutter", "frame-only"].includes(doorType)
        ? "#edf2f7"
        : "#bfe9ff";
  const doorOutlineWidthPx = Math.max(
    10,
    doorPlacement.wall.thickness * (currentPixelsPerMeter() || 100) * state.viewTransform.zoom + 5
  );
  drawPlanLine(doorPlacement.start, doorPlacement.end, {
    color: "rgba(7, 16, 21, .94)",
    width: doorOutlineWidthPx,
    cap: "butt"
  });
  if (doorType === "frame-only") {
    const frameNormal = {
      x: -doorPlacement.unit.y,
      y: doorPlacement.unit.x
    };
    const frameJambHalfWidthPx = Math.max(
      5 / state.viewTransform.zoom,
      doorPlacement.wall.thickness * (currentPixelsPerMeter() || 100) * 0.55
    );
    for (const frameJambPoint of [doorPlacement.start, doorPlacement.end]) {
      drawPlanLine(
        {
          x: frameJambPoint.x - frameNormal.x * frameJambHalfWidthPx,
          y: frameJambPoint.y - frameNormal.y * frameJambHalfWidthPx
        },
        {
          x: frameJambPoint.x + frameNormal.x * frameJambHalfWidthPx,
          y: frameJambPoint.y + frameNormal.y * frameJambHalfWidthPx
        },
        {
          color: doorStrokeColor,
          width: isDoorSelected ? 4 : 3,
          cap: "butt"
        }
      );
    }
    if (isDoorSelected) {
      drawFloatingLabel(
        doorPlacement.center,
        "仅门框 · " + door.width.toFixed(2) + " m",
        PLAN_ACCENT_BRIGHT()
      );
    }
    return;
  }
  if (doorType === "sliding-glass") {
    const panelNormal = {
      x: -doorPlacement.unit.y,
      y: doorPlacement.unit.x
    };
    const panelOffsetPx = Math.max(
      2.5 / state.viewTransform.zoom,
      doorPlacement.wall.thickness * (currentPixelsPerMeter() || 100) * 0.16
    );
    const openingLengthPx = distance(doorPlacement.start, doorPlacement.end);
    const hingeDirection = door.hinge === "right" ? 1 : -1;
    // 两扇门板分别贴在墙的两个面上；「内外翻转」就是交换哪一扇在哪个面。
    const panelFlipSign = door.swing === -1 ? -1 : 1;
    const panelCenters = slidingDoorPanelCenters(openingLengthPx, hingeDirection);
    const panelHalfWidthPx = openingLengthPx * 0.27;
    for (const [panelCenterOffset, panelSideSign] of [
      [panelCenters.fixed, -panelFlipSign],
      [panelCenters.moving, panelFlipSign]
    ]) {
      const panelCenterPoint = {
        x: doorPlacement.center.x + doorPlacement.unit.x * panelCenterOffset,
        y: doorPlacement.center.y + doorPlacement.unit.y * panelCenterOffset
      };
      const panelNormalOffset = {
        x: panelNormal.x * panelOffsetPx * panelSideSign,
        y: panelNormal.y * panelOffsetPx * panelSideSign
      };
      const panelStartPoint = {
        x: panelCenterPoint.x - doorPlacement.unit.x * panelHalfWidthPx + panelNormalOffset.x,
        y: panelCenterPoint.y - doorPlacement.unit.y * panelHalfWidthPx + panelNormalOffset.y
      };
      const panelEndPoint = {
        x: panelCenterPoint.x + doorPlacement.unit.x * panelHalfWidthPx + panelNormalOffset.x,
        y: panelCenterPoint.y + doorPlacement.unit.y * panelHalfWidthPx + panelNormalOffset.y
      };
      drawPlanLine(panelStartPoint, panelEndPoint, {
        color: doorStrokeColor,
        width: isDoorSelected ? 4 : 3,
        cap: "butt"
      });
      drawPlanPoint(panelSideSign < 0 ? panelEndPoint : panelStartPoint, doorStrokeColor, 2);
    }
    if (isDoorSelected) {
      drawFloatingLabel(
        doorPlacement.center,
        "玻璃推拉门 · " + door.width.toFixed(2) + " m",
        PLAN_ACCENT_BRIGHT()
      );
    }
    return;
  }
  if (doorType === "roller-shutter") {
    const shutterNormal = {
      x: -doorPlacement.unit.y,
      y: doorPlacement.unit.x
    };
    const shutterOffsetPx =
      Math.max(
        2 / state.viewTransform.zoom,
        doorPlacement.wall.thickness * (currentPixelsPerMeter() || 100) * 0.08
      ) * (door.swing === -1 ? -1 : 1);
    drawPlanLine(
      {
        x: doorPlacement.start.x + shutterNormal.x * shutterOffsetPx,
        y: doorPlacement.start.y + shutterNormal.y * shutterOffsetPx
      },
      {
        x: doorPlacement.end.x + shutterNormal.x * shutterOffsetPx,
        y: doorPlacement.end.y + shutterNormal.y * shutterOffsetPx
      },
      {
        color: doorStrokeColor,
        width: isDoorSelected ? 5 : 4,
        cap: "butt"
      }
    );
    const shutterLengthPx = distance(doorPlacement.start, doorPlacement.end);
    const slatCount = Math.max(3, Math.min(18, Math.round(door.width / 0.35)));
    for (let slatIndex = 1; slatIndex < slatCount; slatIndex += 1) {
      const slatOffset = shutterLengthPx * (slatIndex / slatCount - 0.5);
      const slatPoint = {
        x:
          doorPlacement.center.x +
          doorPlacement.unit.x * slatOffset +
          shutterNormal.x * shutterOffsetPx,
        y:
          doorPlacement.center.y +
          doorPlacement.unit.y * slatOffset +
          shutterNormal.y * shutterOffsetPx
      };
      drawPlanLine(
        {
          x: slatPoint.x - (shutterNormal.x * 3) / state.viewTransform.zoom,
          y: slatPoint.y - (shutterNormal.y * 3) / state.viewTransform.zoom
        },
        {
          x: slatPoint.x + (shutterNormal.x * 3) / state.viewTransform.zoom,
          y: slatPoint.y + (shutterNormal.y * 3) / state.viewTransform.zoom
        },
        {
          color: "rgba(167, 178, 188, .72)",
          width: 1,
          cap: "butt"
        }
      );
    }
    if (isDoorSelected) {
      drawFloatingLabel(
        doorPlacement.center,
        "卷帘门 · " + door.width.toFixed(2) + " m",
        PLAN_ACCENT_BRIGHT()
      );
    }
    return;
  }
  if (doorType === "entry") {
    const entryNormal = {
      x: -doorPlacement.unit.y,
      y: doorPlacement.unit.x
    };
    // 内外翻转 = 把这一对门带以墙中心线镜像，整体换到墙的另一面。
    const entryFlipSign = door.swing === -1 ? -1 : 1;
    const entryOffsetPx =
      Math.max(
        2 / state.viewTransform.zoom,
        doorPlacement.wall.thickness * (currentPixelsPerMeter() || 100) * 0.08
      ) * entryFlipSign;
    drawPlanLine(
      {
        x: doorPlacement.start.x + entryNormal.x * entryOffsetPx,
        y: doorPlacement.start.y + entryNormal.y * entryOffsetPx
      },
      {
        x: doorPlacement.end.x + entryNormal.x * entryOffsetPx,
        y: doorPlacement.end.y + entryNormal.y * entryOffsetPx
      },
      {
        color: doorStrokeColor,
        width: doorOptions.preview ? 3 : isDoorSelected ? 5 : 4,
        cap: "butt"
      }
    );
    drawPlanLine(
      {
        x: doorPlacement.start.x - entryNormal.x * entryOffsetPx,
        y: doorPlacement.start.y - entryNormal.y * entryOffsetPx
      },
      {
        x: doorPlacement.end.x - entryNormal.x * entryOffsetPx,
        y: doorPlacement.end.y - entryNormal.y * entryOffsetPx
      },
      {
        color: "rgba(167, 178, 188, .72)",
        width: 1,
        cap: "butt"
      }
    );
    const entryHandleDirection = door.hinge === "right" ? -1 : 1;
    drawPlanPoint(
      {
        x: doorPlacement.center.x + doorPlacement.unit.x * door.width * entryHandleDirection * 0.34,
        y: doorPlacement.center.y + doorPlacement.unit.y * door.width * entryHandleDirection * 0.34
      },
      doorStrokeColor,
      isDoorSelected ? 3 : 2
    );
    if (isDoorSelected) {
      drawFloatingLabel(
        doorPlacement.center,
        "入户门（常闭）· " + door.width.toFixed(2) + " m",
        PLAN_ACCENT_BRIGHT()
      );
    }
    return;
  }
  if (doorType === "double") {
    const doubleDoorNormal = {
      x: -doorPlacement.unit.y,
      y: doorPlacement.unit.x
    };
    const doubleSwingSign = door.swing === -1 ? -1 : 1;
    const leafOffsetPx = (distance(doorPlacement.start, doorPlacement.end) / 2) * doubleSwingSign;
    const firstLeafPoint = {
      x: doorPlacement.start.x + doubleDoorNormal.x * leafOffsetPx,
      y: doorPlacement.start.y + doubleDoorNormal.y * leafOffsetPx
    };
    const secondLeafPoint = {
      x: doorPlacement.end.x + doubleDoorNormal.x * leafOffsetPx,
      y: doorPlacement.end.y + doubleDoorNormal.y * leafOffsetPx
    };
    drawPlanLine(doorPlacement.start, firstLeafPoint, {
      color: doorStrokeColor,
      width: doorOptions.preview ? 2 : isDoorSelected ? 4 : 3,
      cap: "butt"
    });
    drawPlanLine(doorPlacement.end, secondLeafPoint, {
      color: doorStrokeColor,
      width: doorOptions.preview ? 2 : isDoorSelected ? 4 : 3,
      cap: "butt"
    });
    drawPlanPoint(doorPlacement.start, doorStrokeColor, isDoorSelected ? 3.5 : 2.5);
    drawPlanPoint(doorPlacement.end, doorStrokeColor, isDoorSelected ? 3.5 : 2.5);
    if (isDoorSelected) {
      drawFloatingLabel(
        doorPlacement.center,
        "双开门 · " + door.width.toFixed(2) + " m",
        PLAN_ACCENT_BRIGHT()
      );
    }
    return;
  }
  const isRightHinged = door.hinge === "right";
  const hingePoint = isRightHinged ? doorPlacement.end : doorPlacement.start;
  const freePoint = isRightHinged ? doorPlacement.start : doorPlacement.end;
  const doorVector = {
    x: freePoint.x - hingePoint.x,
    y: freePoint.y - hingePoint.y
  };
  const swingSign = door.swing === -1 ? -1 : 1;
  const swingEndPoint = {
    x: hingePoint.x - doorVector.y * swingSign,
    y: hingePoint.y + doorVector.x * swingSign
  };
  drawPlanLine(hingePoint, swingEndPoint, {
    color: doorStrokeColor,
    width: doorOptions.preview ? 2 : isDoorSelected ? 4 : 3,
    cap: "butt",
    dash: doorOptions.preview ? [5, 4] : undefined
  });
  if (doorType === "glass") {
    const glassInsetVector = {
      x: (doorPlacement.unit.x * 3) / state.viewTransform.zoom,
      y: (doorPlacement.unit.y * 3) / state.viewTransform.zoom
    };
    drawPlanLine(
      {
        x: hingePoint.x + glassInsetVector.x,
        y: hingePoint.y + glassInsetVector.y
      },
      {
        x: swingEndPoint.x + glassInsetVector.x,
        y: swingEndPoint.y + glassInsetVector.y
      },
      {
        color: "rgba(183, 229, 247, .58)",
        width: 1,
        cap: "butt"
      }
    );
  }
  const hingeScreenPoint = planToScreen(hingePoint);
  const doorRadiusPx = distance(hingePoint, freePoint) * state.viewTransform.zoom;
  const doorStartAngleRad = Math.atan2(doorVector.y, doorVector.x);
  const doorEndAngleRad = doorStartAngleRad + (swingSign * Math.PI) / 2;
  planContext.save();
  planContext.strokeStyle = doorStrokeColor;
  planContext.lineWidth = doorOptions.preview ? 1 : isDoorSelected ? 2 : 1.25;
  if (doorOptions.preview) {
    planContext.setLineDash([5, 4]);
  }
  planContext.beginPath();
  planContext.arc(
    hingeScreenPoint.x,
    hingeScreenPoint.y,
    doorRadiusPx,
    doorStartAngleRad,
    doorEndAngleRad,
    swingSign < 0
  );
  planContext.stroke();
  planContext.restore();
  drawPlanPoint(hingePoint, doorStrokeColor, isDoorSelected ? 3.5 : 2.5);
  if (isDoorSelected) {
    drawFloatingLabel(
      doorPlacement.center,
      "" + (doorType === "glass" ? "玻璃门 · " : "") + door.width.toFixed(2) + " m",
      PLAN_ACCENT_BRIGHT()
    );
  }
}

/**
 * 在快照之上叠画框选矩形（只画框，不重绘平面）。与 blitMetricsCanvas 配套：先贴回快照
 */
export function drawMarqueeOverlay() {
  if (state.pointerInteraction?.type !== "marquee") {
    return;
  }
  const marqueeStartScreen = planToScreen(state.pointerInteraction.start);
  const marqueeEndScreen = planToScreen(state.pointerInteraction.current);
  const marqueeLeftPx = Math.min(marqueeStartScreen.x, marqueeEndScreen.x);
  const marqueeTopPx = Math.min(marqueeStartScreen.y, marqueeEndScreen.y);
  const marqueeWidthPx = Math.abs(marqueeEndScreen.x - marqueeStartScreen.x);
  const marqueeHeightPx = Math.abs(marqueeEndScreen.y - marqueeStartScreen.y);
  planContext.save();
  planContext.translate(state.viewportWidthPx / 2, state.viewportHeightPx / 2);
  planContext.rotate((state.viewTransform.rotation * Math.PI) / 180);
  planContext.translate(-state.viewportWidthPx / 2, -state.viewportHeightPx / 2);
  planContext.fillStyle = "rgba(255, 157, 46, .10)";
  planContext.strokeStyle = "rgba(255, 176, 74, .92)";
  planContext.lineWidth = 1;
  planContext.setLineDash([6, 4]);
  planContext.fillRect(marqueeLeftPx, marqueeTopPx, marqueeWidthPx, marqueeHeightPx);
  planContext.strokeRect(
    marqueeLeftPx + 0.5,
    marqueeTopPx + 0.5,
    Math.max(marqueeWidthPx - 1, 0),
    Math.max(marqueeHeightPx - 1, 0)
  );
  planContext.restore();
}

export function renderPlanView() {
  const isLightPlanView = state.activeAssetTab === "light";
  planContext.clearRect(0, 0, state.viewportWidthPx, state.viewportHeightPx);
  planContext.fillStyle = PLAN_PAPER();
  planContext.fillRect(0, 0, state.viewportWidthPx, state.viewportHeightPx);
  planContext.save();
  planContext.translate(state.viewportWidthPx / 2, state.viewportHeightPx / 2);
  planContext.rotate((state.viewTransform.rotation * Math.PI) / 180);
  planContext.translate(-state.viewportWidthPx / 2, -state.viewportHeightPx / 2);
  if (state.backgroundTexture && state.activeScene.background && state.activeScene.settings.backgroundVisible) {
    const planOriginScreen = planToScreen({
      x: 0,
      y: 0
    });
    planContext.save();
    planContext.globalAlpha = isLightPlanView ? 0.3 : 0.54;
    planContext.drawImage(
      state.backgroundTexture,
      planOriginScreen.x,
      planOriginScreen.y,
      state.activeScene.background.width * state.viewTransform.zoom,
      state.activeScene.background.height * state.viewTransform.zoom
    );
    planContext.restore();
  }
  drawMetricGrid();
  const planRenderPixelsPerMeter = currentPixelsPerMeter() || 100;
  if (state.floorAlignState) {
    planContext.save();
    planContext.globalAlpha = 0.58;
    for (const alignmentWall of referenceWallsForAlignment()) {
      drawPlanLine(alignmentWall.start, alignmentWall.end, {
        color: "#52cfe0",
        width: Math.max(2, alignmentWall.thickness * planRenderPixelsPerMeter * state.viewTransform.zoom),
        dash: [7, 5],
        cap: "square"
      });
    }
    planContext.restore();
    if (state.floorAlignState.referencePoint) {
      const alignmentReferencePoint = convertBetweenFloors(
        state.floorAlignState.referencePoint,
        state.floorAlignState.referenceFloor,
        getCurrentFloor()
      );
      drawPlanPoint(alignmentReferencePoint, "#ffb14f", 4.5);
      drawFloatingLabel(alignmentReferencePoint, "参照点", "#ffb14f");
    }
  }
  planContext.save();
  if (isLightPlanView) {
    planContext.globalAlpha = 0.48;
  }
  for (const planWall of state.activeScene.walls) {
    const isPlanWallSelected = isSelected("wall", planWall.id);
    const planWallWidthPx = Math.max(
      planWall.thickness * planRenderPixelsPerMeter * state.viewTransform.zoom,
      4
    );
    if (isPlanWallSelected) {
      drawPlanLine(planWall.start, planWall.end, {
        color: "rgba(255, 157, 46, .38)",
        width: planWallWidthPx + 7,
        cap: "square"
      });
    }
    drawPlanLine(planWall.start, planWall.end, {
      color: isPlanWallSelected ? "#f1d7b9" : "#c7d0d7",
      width: planWallWidthPx,
      cap: "square"
    });
    drawPlanLine(planWall.start, planWall.end, {
      color: "rgba(39, 51, 61, .82)",
      width: 1
    });
    if (state.activeTool === "wall" || isPlanWallSelected) {
      drawPlanPoint(planWall.start, isPlanWallSelected ? PLAN_ACCENT() : "#6c7c88", 3.5);
      drawPlanPoint(planWall.end, isPlanWallSelected ? PLAN_ACCENT() : "#6c7c88", 3.5);
    }
    if (isPlanWallSelected && state.multiSelection.length <= 1) {
      drawFloatingLabel(
        {
          x: (planWall.start.x + planWall.end.x) / 2,
          y: (planWall.start.y + planWall.end.y) / 2
        },
        wallLengthMeters(planWall, planRenderPixelsPerMeter).toFixed(2) + " m",
        "#ffb14f"
      );
    }
  }
  for (const planWindow of state.activeScene.windows) {
    const planWindowPlacement = openingPlacementInfo(planWindow);
    if (!planWindowPlacement) {
      continue;
    }
    const isPlanWindowSelected = isSelected("window", planWindow.id);
    drawPlanLine(planWindowPlacement.start, planWindowPlacement.end, {
      color: "rgba(7, 16, 21, .9)",
      width: Math.max(
        10,
        planWindowPlacement.wall.thickness * planRenderPixelsPerMeter * state.viewTransform.zoom + 5
      ),
      cap: "butt"
    });
    drawPlanLine(planWindowPlacement.start, planWindowPlacement.end, {
      color: isPlanWindowSelected ? PLAN_ACCENT_BRIGHT() : PLAN_GUIDE(),
      width: isPlanWindowSelected ? 5 : 3,
      cap: "butt"
    });
    drawPlanLine(planWindowPlacement.start, planWindowPlacement.end, {
      color: "rgba(224, 250, 255, .9)",
      width: 1,
      cap: "butt"
    });
    if (planWindow.hasDivider !== false && planWindow.width > 1.2) {
      const windowDividerNormal = {
        x: -planWindowPlacement.unit.y,
        y: planWindowPlacement.unit.x
      };
      const windowDividerHalfWidthPx = Math.max(
        planWindowPlacement.wall.thickness * planRenderPixelsPerMeter * state.viewTransform.zoom * 0.72,
        5 / state.viewTransform.zoom
      );
      drawPlanLine(
        {
          x: planWindowPlacement.center.x - windowDividerNormal.x * windowDividerHalfWidthPx,
          y: planWindowPlacement.center.y - windowDividerNormal.y * windowDividerHalfWidthPx
        },
        {
          x: planWindowPlacement.center.x + windowDividerNormal.x * windowDividerHalfWidthPx,
          y: planWindowPlacement.center.y + windowDividerNormal.y * windowDividerHalfWidthPx
        },
        {
          color: isPlanWindowSelected ? PLAN_ACCENT_BRIGHT() : "rgba(224, 250, 255, .9)",
          width: 1.5,
          cap: "butt"
        }
      );
    }
    if (isPlanWindowSelected && state.multiSelection.length <= 1) {
      drawFloatingLabel(planWindowPlacement.center, planWindow.width.toFixed(2) + " m", PLAN_GUIDE());
    }
  }
  for (const planDoor of state.activeScene.doors) {
    drawPlanDoor(planDoor);
  }
  for (const planRailing of state.activeScene.railings) {
    drawPlanRailing(planRailing);
  }
  if (state.pointerInteraction?.type === "draw-flooropening") {
    const { start: floorOpeningDragStart, current: floorOpeningDragEnd } = state.pointerInteraction;
    drawPlanItem({
      ...ITEM_TYPE_DEFINITIONS.flooropening,
      type: "flooropening",
      id: "opening-preview",
      rotation: 0,
      x: (floorOpeningDragStart.x + floorOpeningDragEnd.x) / 2,
      y: (floorOpeningDragStart.y + floorOpeningDragEnd.y) / 2,
      width: Math.abs(floorOpeningDragEnd.x - floorOpeningDragStart.x) / planRenderPixelsPerMeter,
      depth: Math.abs(floorOpeningDragEnd.y - floorOpeningDragStart.y) / planRenderPixelsPerMeter
    });
  }
  for (const planItem of state.activeScene.items) {
    if (!LIGHT_ITEM_TYPES.has(planItem.type)) {
      drawPlanItem(planItem);
    }
  }
  if (!state.floorAlignState) {
    const detectedOpenEndpoints = unclosedEndpointsForWalls(planRenderPixelsPerMeter);
    for (const detectedOpenEndpoint of detectedOpenEndpoints) {
      drawOpenEndpointWarning(detectedOpenEndpoint);
      if (detectedOpenEndpoints.length <= 3) {
        drawFloatingLabel(detectedOpenEndpoint, "未闭合", "#ff766e");
      }
    }
  }
  planContext.restore();
  if (isLightPlanView) {
    for (const planLightItem of state.activeScene.items) {
      if (LIGHT_ITEM_TYPES.has(planLightItem.type)) {
        drawPlanItem(planLightItem);
      }
    }
  }
  const calibrationReference = state.activeScene.calibration?.reference;
  if (calibrationReference && state.activeTool === "scale") {
    drawPlanLine(calibrationReference.start, calibrationReference.end, {
      color: "rgba(255, 157, 46, .72)",
      width: 2,
      dash: [7, 5]
    });
    drawPlanPoint(calibrationReference.start, PLAN_ACCENT(), 3.5);
    drawPlanPoint(calibrationReference.end, PLAN_ACCENT(), 3.5);
    drawFloatingLabel(
      {
        x: (calibrationReference.start.x + calibrationReference.end.x) / 2,
        y: (calibrationReference.start.y + calibrationReference.end.y) / 2
      },
      calibrationReference.meters.toFixed(2) + " m 参考",
      "#ffad45"
    );
  }
  if (state.scalePreviewStart && state.scalePreviewCurrent) {
    drawPlanLine(state.scalePreviewStart, state.scalePreviewCurrent, {
      color: PLAN_ACCENT(),
      width: 2,
      dash: [7, 5]
    });
    drawPlanPoint(state.scalePreviewStart, PLAN_ACCENT());
    drawPlanPoint(state.scalePreviewCurrent, PLAN_ACCENT());
  }
  if (state.scaleStartPoint && state.snapTarget) {
    const isClosingSpace = isSnapClosingSpace(state.snapTarget);
    drawPlanLine(state.scaleStartPoint, state.snapTarget.point, {
      color: PLAN_ACCENT(),
      width: 2,
      dash: [7, 5]
    });
    drawPlanPoint(state.scaleStartPoint, PLAN_ACCENT());
    drawPlanPoint(
      state.snapTarget.point,
      isClosingSpace ? PLAN_DONE() : state.snapTarget.kind ? PLAN_GUIDE() : PLAN_ACCENT(),
      isClosingSpace ? 5 : 3.5
    );
    const scaleDistanceMeters =
      distance(state.scaleStartPoint, state.snapTarget.point) / planRenderPixelsPerMeter;
    drawFloatingLabel(
      {
        x: (state.scaleStartPoint.x + state.snapTarget.point.x) / 2,
        y: (state.scaleStartPoint.y + state.snapTarget.point.y) / 2
      },
      scaleDistanceMeters.toFixed(2) + " m",
      "#ffb04a"
    );
    if (isClosingSpace) {
      drawFloatingLabel(state.snapTarget.point, "点击闭合空间", PLAN_DONE());
    }
  } else if (state.snapTarget?.kind && ["wall", "scale"].includes(state.activeTool)) {
    drawPlanPoint(state.snapTarget.point, PLAN_GUIDE());
    drawFloatingLabel(state.snapTarget.point, state.snapTarget.label, PLAN_GUIDE());
  }
  if (state.activeTool === "window" && state.windowSnapTarget) {
    const previewWindowRecord = {
      wallId: state.windowSnapTarget.wall.id,
      t: state.windowSnapTarget.t,
      width: 1.4
    };
    const previewWindowPlacement = openingPlacementInfo(previewWindowRecord);
    if (previewWindowPlacement) {
      drawPlanLine(previewWindowPlacement.start, previewWindowPlacement.end, {
        color: "rgba(67, 210, 230, .75)",
        width: 5,
        dash: [5, 4],
        cap: "butt"
      });
    }
  }
  if (state.activeTool === "door" && state.doorSnapTarget) {
    const doorTypeDimensions = DOOR_TYPE_DIMENSIONS[selectedDoorType] || DOOR_TYPE_DIMENSIONS.solid;
    drawPlanDoor(
      {
        wallId: state.doorSnapTarget.wall.id,
        t: state.doorSnapTarget.t,
        width: doorTypeDimensions.width,
        height: doorTypeDimensions.height,
        doorType: selectedDoorType,
        hinge: "left",
        swing: 1
      },
      {
        preview: true
      }
    );
  }
  if (state.activeTool === "railing" && state.railingSnapTarget) {
    drawPlanRailing(
      {
        wallId: state.railingSnapTarget.wall.id,
        t: state.railingSnapTarget.t,
        width: 2,
        height: 1.1
      },
      {
        preview: true
      }
    );
  }
  planContext.restore();
  drawMarqueeOverlay();
  zoomValueElement.textContent = Math.round(state.viewTransform.zoom * 100) + "%";
}

/**
 * @returns {boolean} true 表示吸附到起点、应当闭合。
 */
export function isSnapClosingSpace(snapTargetCandidate = state.snapTarget) {
  if (!state.snapEndpointCandidate || state.scalePointCount < 2 || !snapTargetCandidate?.point) {
    return false;
  }
  const endpointTolerance = Math.max(1, (currentPixelsPerMeter() || 100) * 0.01);
  return (
    snapTargetCandidate.kind === "endpoint" &&
    distance(snapTargetCandidate.point, state.snapEndpointCandidate) <= endpointTolerance
  );
}
