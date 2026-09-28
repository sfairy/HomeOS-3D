/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";
import { finite } from "../loaders/studio-normalization.js";
import { TELEVISION_PLAN_MIN_DEPTH } from "./studio-config-tables.js";
import {
  LIGHT_ITEM_TYPES,
  STAIR_DIRECTION_ITEM_TYPES
} from "./studio-item-types.js";
import {
  clamp,
  clampWindowT,
  pointInPolygon,
  polygonArea,
  segmentIntersection,
  splitWallSegments
} from "../plan/geometry.js";

/**
 * 世界坐标（米）→ 平面像素点，是 floorPointToScenePoint 的逆运算：先减楼层偏移
 */
export function scenePointToFloorPoint(scenePointToConvert: any, scenePoint: any) {
  const floorPixelsPerMeter = scenePointToConvert?.scene?.calibration?.pixelsPerMeter || 1;
  const targetFloorRotationRad = -threeModuleMin.MathUtils.degToRad(
    finite(scenePointToConvert?.rotation, 0)
  );
  const offsetSceneX = scenePoint.x - finite(scenePointToConvert?.offsetX, 0);
  const offsetSceneZ = scenePoint.z - finite(scenePointToConvert?.offsetZ, 0);
  return {
    x:
      finite(scenePointToConvert?.originX, 0) +
      (Math.cos(targetFloorRotationRad) * offsetSceneX -
        Math.sin(targetFloorRotationRad) * offsetSceneZ) *
        floorPixelsPerMeter,
    y:
      finite(scenePointToConvert?.originY, 0) +
      (Math.sin(targetFloorRotationRad) * offsetSceneX +
        Math.cos(targetFloorRotationRad) * offsetSceneZ) *
        floorPixelsPerMeter
  };
}

/**
 * 按几何交点切分墙体，并把门窗栏杆重新挂到切分后的墙上。墙体必须在相交处断开，
 */
export function splitWallsWithOpenings(walls: any, windows: any, doors: any, planPixelsPerMeter: any, railings: any = []) {
  const wallPieces = splitWallSegments(walls);
  const piecesByWallId = new Map();
  const splitWalls = [];
  for (const piece of wallPieces) {
    const splitWall = {
      ...piece.sourceWall,
      id: piece.pieceIndex === 0 ? piece.sourceWall.id : createId("wall"),
      start: piece.start,
      end: piece.end
    };
    const attachmentReference = {
      ...piece,
      wall: splitWall
    };
    if (!piecesByWallId.has(piece.sourceWall.id)) {
      piecesByWallId.set(piece.sourceWall.id, []);
    }
    piecesByWallId.get(piece.sourceWall.id).push(attachmentReference);
    splitWalls.push(splitWall);
  }
  const remapAttachment = (attachmentRef: any) => {
    const pieces = piecesByWallId.get(attachmentRef.wallId);
    if (!pieces?.length) {
      return attachmentRef;
    }
    const wallT = clamp(finite(attachmentRef.t, 0.5), 0, 1);
    const targetPiece =
      pieces.find(
        (candidatePiece: any) =>
          wallT >= candidatePiece.startT - 1e-7 && wallT <= candidatePiece.endT + 1e-7
      ) || pieces.at(-1);
    const pieceSpan = Math.max(targetPiece.endT - targetPiece.startT, 1e-7);
    const remapped = {
      ...attachmentRef,
      wallId: targetPiece.wall.id,
      t: clamp((wallT - targetPiece.startT) / pieceSpan, 0, 1)
    };
    remapped.t = clampWindowT(targetPiece.wall, remapped, planPixelsPerMeter || 1);
    return remapped;
  };
  return {
    walls: splitWalls,
    windows: windows.map(remapAttachment),
    doors: doors.map(remapAttachment),
    railings: railings.map(remapAttachment)
  };
}

/**
 * 生成带类型前缀的唯一 ID。优先 crypto.randomUUID；非安全上下文（http 局域网、老浏览器）
 */
export function createId(prefix: any) {
  const uniquePart =
    globalThis.crypto?.randomUUID?.() ||
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  return prefix + "-" + uniquePart;
}

/**
 * 判断点是否落在轴对齐包围盒内（含边界）。
 */
export function pointInBounds(point: any, pointBounds: any) {
  return (
    point.x >= pointBounds.minX &&
    point.x <= pointBounds.maxX &&
    point.y >= pointBounds.minY &&
    point.y <= pointBounds.maxY
  );
}

/**
 * 判断线段是否与轴对齐包围盒相交（框选墙体等线性实体用）。先做一次端点快速包含判定
 */
export function segmentIntersectsBounds(segmentStartPoint: any, segmentEndPoint: any, segmentBounds: any) {
  if (
    pointInBounds(segmentStartPoint, segmentBounds) ||
    pointInBounds(segmentEndPoint, segmentBounds)
  ) {
    return true;
  }
  const boundsCorners = [
    {
      x: segmentBounds.minX,
      y: segmentBounds.minY
    },
    {
      x: segmentBounds.maxX,
      y: segmentBounds.minY
    },
    {
      x: segmentBounds.maxX,
      y: segmentBounds.maxY
    },
    {
      x: segmentBounds.minX,
      y: segmentBounds.maxY
    }
  ];
  for (let cornerIndex = 0; cornerIndex < boundsCorners.length; cornerIndex += 1) {
    if (
      segmentIntersection(
        segmentStartPoint,
        segmentEndPoint,
        boundsCorners[cornerIndex],
        boundsCorners[(cornerIndex + 1) % boundsCorners.length]
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 物件的姿态是「立起来」还是「沿平面躺下」。轴线指的是物件的长度方向：
 */
export const ITEM_AXES = Object.freeze(["vertical", "horizontal"]);

export const itemAxisSet = new Set(ITEM_AXES);

/** 立柱出厂即立姿，缺省轴线按 "vertical" 处理。 */
export function normalizePillarAxis(value: any) {
  return itemAxisSet.has(value) ? value : "vertical";
}

/** 灯带出厂即平躺，缺省轴线按 "horizontal" 处理。 */
export function normalizeStripAxis(value: any) {
  return itemAxisSet.has(value) ? value : "horizontal";
}

/** 立柱是否处于躺姿（而非立姿）。 */
export function pillarIsLying(item: any) {
  return item?.type === "pillar" && normalizePillarAxis(item.pillarAxis) === "horizontal";
}

/** 灯带是否处于立姿（而非平躺）。 */
export function stripIsStanding(item: any) {
  return item?.type === "striplight" && normalizeStripAxis(item.stripAxis) === "vertical";
}

/**
 * 平面占位（单位：米）。姿态会让物件的长度轴与房间换位，故平面占位不能一律直接取 width/depth：立姿立柱取横截面
 */
export function itemPlanFootprint(item: any) {
  if (pillarIsLying(item)) {
    return {
      width: finite(item?.width, 0),
      depth: finite(item?.height, 0)
    };
  }
  if (stripIsStanding(item)) {
    return {
      width: finite(item?.height, 0),
      depth: finite(item?.depth, 0)
    };
  }
  if (item?.type === "tv") {
    // 壁挂电视的进深是真身 60mm，直接画会细成一条线；平面符号与缩放手柄都按下限兜一下，
    return {
      width: finite(item?.width, 0),
      depth: Math.max(finite(item?.depth, 0), TELEVISION_PLAN_MIN_DEPTH)
    };
  }
  return {
    width: finite(item?.width, 0),
    depth: finite(item?.depth, 0)
  };
}

/** 把「按平面占位缩放」的结果换算回物件在当前姿态下的标准字段。 */
export function itemFromPlanFootprintResize(item: any, resized: any) {
  if (pillarIsLying(item)) {
    // resized.depth 才是新的长度；resized.height 仍是拖拽前的旧长度，必须丢弃。
    const { height: ignoredHeight, ...rest } = resized;
    return {
      ...rest,
      height: finite(resized?.depth, finite(item?.height, 0)),
      depth: finite(item?.depth, finite(resized?.depth, 0.1))
    };
  }
  if (stripIsStanding(item)) {
    return {
      ...resized,
      width: finite(item?.width, 0),
      height: finite(item?.height, 0)
    };
  }
  if (item?.type === "tv") {
    // 电视进深是「挂装方式 + 真身」决定的物理量（壁挂 60mm / 座装 180mm / 移动支架 550mm），
    return {
      ...resized,
      depth: finite(item?.depth, finite(resized?.depth, 0.1))
    };
  }
  return resized;
}

export function applyItemPosture(group: any, item: any) {
  const lyingPillar = pillarIsLying(item);
  const standingStrip = stripIsStanding(item);
  if ((!lyingPillar && !standingStrip) || !group.children.length) {
    return;
  }
  const posturePivot = new threeModuleMin.Group();
  for (const postureChild of [...group.children]) {
    posturePivot.add(postureChild);
  }
  posturePivot.rotation[lyingPillar ? "x" : "z"] = lyingPillar ? -Math.PI / 2 : Math.PI / 2;
  posturePivot.updateMatrixWorld(true);
  const pivotContent = new threeModuleMin.Box3().setFromObject(posturePivot);
  /**
   * @returns {number} 需要的位移量；包围盒无效时为 0。
   */
  const pivotCenterOf = (minValue: any, maxValue: any) =>
    Number.isFinite(minValue) && Number.isFinite(maxValue) ? -(minValue + maxValue) / 2 : 0;
  if (lyingPillar) {
    posturePivot.position.set(
      0,
      Number.isFinite(pivotContent.min.y) ? -pivotContent.min.y : 0,
      pivotCenterOf(pivotContent.min.z, pivotContent.max.z)
    );
  } else {
    posturePivot.position.set(
      pivotCenterOf(pivotContent.min.x, pivotContent.max.x),
      Number.isFinite(pivotContent.max.y) ? -pivotContent.max.y : 0,
      pivotCenterOf(pivotContent.min.z, pivotContent.max.z)
    );
  }
  group.add(posturePivot);
}

/** 为立柱轮廓描一段弧。调用方需已把画笔移到弧的起点。 */
export function appendPillarOutlineArc(
  path: any,
  centerX: any,
  centerY: any,
  radiusX: any,
  radiusY: any,
  startAngle: any,
  endAngle: any,
  segments: any
) {
  for (let arcStep = 1; arcStep <= segments; arcStep += 1) {
    const arcAngle = startAngle + ((endAngle - startAngle) * arcStep) / segments;
    path.lineTo(centerX + Math.cos(arcAngle) * radiusX, centerY + Math.sin(arcAngle) * radiusY);
  }
}

export function buildPillarOutline(shape: any, width: any, depth: any) {
  const path = new threeModuleMin.Shape();
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  if (shape === "round") {
    path.moveTo(halfWidth, 0);
    appendPillarOutlineArc(path, 0, 0, halfWidth, halfDepth, 0, Math.PI * 2, 64);
    return path;
  }
  if (shape === "semicircle") {
    path.moveTo(-halfWidth, halfDepth);
    path.lineTo(halfWidth, halfDepth);
    appendPillarOutlineArc(path, 0, halfDepth, halfWidth, depth, 0, -Math.PI, 32);
    return path;
  }
  if (shape === "quarter") {
    path.moveTo(-halfWidth, halfDepth);
    path.lineTo(halfWidth, halfDepth);
    appendPillarOutlineArc(path, -halfWidth, halfDepth, width, depth, 0, -Math.PI / 2, 32);
    return path;
  }
  if (shape === "quarterinner") {
    // 在同一占位内与 "quarter" 互补：凹弧从远端角切进来，
    path.moveTo(halfWidth, halfDepth);
    path.lineTo(halfWidth, -halfDepth);
    path.lineTo(-halfWidth, -halfDepth);
    appendPillarOutlineArc(path, -halfWidth, halfDepth, width, depth, -Math.PI / 2, 0, 32);
    return path;
  }
  path.moveTo(-halfWidth, -halfDepth);
  path.lineTo(halfWidth, -halfDepth);
  path.lineTo(halfWidth, halfDepth);
  path.lineTo(-halfWidth, halfDepth);
  return path;
}

/** 平面画布版的 buildPillarOutline：平面 +y 对应世界 +z，因此平直面始终留在背面。 */
export function tracePillarPlanPath(plan2dContext: any, shape: any, widthPx: any, depthPx: any) {
  const halfWidth = widthPx / 2;
  const halfDepth = depthPx / 2;
  plan2dContext.beginPath();
  if (shape === "round") {
    plan2dContext.ellipse(0, 0, halfWidth, halfDepth, 0, 0, Math.PI * 2);
    return;
  }
  if (shape === "semicircle") {
    // 平直边落在背面（-y），且弧的起点正好接在直线终点上。
    plan2dContext.moveTo(-halfWidth, -halfDepth);
    plan2dContext.lineTo(halfWidth, -halfDepth);
    plan2dContext.ellipse(0, -halfDepth, halfWidth, depthPx, 0, 0, Math.PI, false);
    return;
  }
  if (shape === "quarter") {
    plan2dContext.moveTo(-halfWidth, -halfDepth);
    plan2dContext.lineTo(halfWidth, -halfDepth);
    plan2dContext.ellipse(-halfWidth, -halfDepth, widthPx, depthPx, 0, 0, Math.PI / 2, false);
    plan2dContext.closePath();
    return;
  }
  if (shape === "quarterinner") {
    // quarter 的镜像：顶点相同，但弧朝回收，使符号成为其互补形。
    plan2dContext.moveTo(halfWidth, -halfDepth);
    plan2dContext.lineTo(halfWidth, halfDepth);
    plan2dContext.lineTo(-halfWidth, halfDepth);
    plan2dContext.ellipse(-halfWidth, -halfDepth, widthPx, depthPx, 0, Math.PI / 2, 0, true);
    return;
  }
  plan2dContext.rect(-halfWidth, -halfDepth, widthPx, depthPx);
}

export function applyItemOrientation(itemGroupObject: any, orientedItemSpec: any) {
  itemGroupObject.rotation.y = -threeModuleMin.MathUtils.degToRad(
    finite(orientedItemSpec.rotation, 0)
  );
  if (STAIR_DIRECTION_ITEM_TYPES.has(orientedItemSpec.type)) {
    itemGroupObject.scale.x = orientedItemSpec.stairDirection === "left" ? -1 : 1;
  }
  if (orientedItemSpec.type === "shoecabinet" && orientedItemSpec.shoeCabinetMirrored === true) {
    itemGroupObject.scale.x = -1;
  }
  if (["camera", "presence"].includes(orientedItemSpec.type)) {
    itemGroupObject.rotation.order = "YXZ";
    itemGroupObject.rotation.x = threeModuleMin.MathUtils.degToRad(
      clamp(finite(orientedItemSpec.verticalRotation, 0), -180, 180)
    );
    return;
  }
  if (LIGHT_ITEM_TYPES.has(orientedItemSpec.type)) {
    if (orientedItemSpec.type === "striplight") {
      itemGroupObject.rotation.order = "YXZ";
      itemGroupObject.rotation.x = 0;
      itemGroupObject.rotation.z = 0;
    } else {
      const striplightTiltRad = threeModuleMin.MathUtils.degToRad(
        clamp(finite(orientedItemSpec.verticalRotation, 0), -90, 90)
      );
      itemGroupObject.rotation.order = "YXZ";
      itemGroupObject.rotation.x = striplightTiltRad;
    }
  }
}

/**
 * 由一段墙实体算出它在世界坐标（米）下的矩形足迹（四个角点）。墙体挤出与地面接触阴影都靠它：先求墙两端的方向向量与其法线，
 */
export function buildWallFootprint(
  footprintWall: any,
  wallSolidPiece: any,
  footprintToWorld: any,
  extensions: any = {}
) {
  const footprintStart = footprintToWorld(footprintWall.start);
  const footprintEnd = footprintToWorld(footprintWall.end);
  const footprintDeltaX = footprintEnd.x - footprintStart.x;
  const footprintDeltaZ = footprintEnd.z - footprintStart.z;
  const footprintLength = Math.hypot(footprintDeltaX, footprintDeltaZ);
  if (footprintLength <= 1e-7) {
    return null;
  }
  const footprintDirection = {
    x: footprintDeltaX / footprintLength,
    y: footprintDeltaZ / footprintLength
  };
  const wallNormal = {
    x: -footprintDirection.y,
    y: footprintDirection.x
  };
  const halfThickness = footprintWall.thickness / 2;
  const startExtension =
    wallSolidPiece.start <= 0.000001
      ? wallSolidPiece.start - Math.max(Number(extensions.start) || 0, 0)
      : wallSolidPiece.start;
  const endExtension =
    wallSolidPiece.end >= footprintLength - 0.000001
      ? wallSolidPiece.end + Math.max(Number(extensions.end) || 0, 0)
      : wallSolidPiece.end;
  const startCenter = {
    x: footprintStart.x + footprintDirection.x * startExtension,
    y: footprintStart.z + footprintDirection.y * startExtension
  };
  const endCenter = {
    x: footprintStart.x + footprintDirection.x * endExtension,
    y: footprintStart.z + footprintDirection.y * endExtension
  };
  return [
    {
      x: startCenter.x + wallNormal.x * halfThickness,
      y: startCenter.y + wallNormal.y * halfThickness
    },
    {
      x: startCenter.x - wallNormal.x * halfThickness,
      y: startCenter.y - wallNormal.y * halfThickness
    },
    {
      x: endCenter.x - wallNormal.x * halfThickness,
      y: endCenter.y - wallNormal.y * halfThickness
    },
    {
      x: endCenter.x + wallNormal.x * halfThickness,
      y: endCenter.y + wallNormal.y * halfThickness
    }
  ];
}

/**
 * 把一个平面闭环点集写进 three.js 的 Shape / Path。
 * @param {Function} PathConstructor Shape 或 Path 构造器（两者接口一致，区别只在 Shape 可作为几何体外轮廓）。
 * @returns {object} 配置好的路径对象（已 closePath）。
 */
export function polygonLoopToPath(PathConstructor: any, loopPoints: any) {
  const path = new PathConstructor();
  loopPoints.forEach((loopPoint: any, loopPointIndex: any) => {
    if (loopPointIndex === 0) {
      path.moveTo(loopPoint.x, loopPoint.y);
    } else {
      path.lineTo(loopPoint.x, loopPoint.y);
    }
  });
  path.closePath();
  return path;
}

export function buildPolygonShapes(polygonLoops: any) {
  const outerLoopEntries = [];
  const holeLoops = [];
  for (const loop of polygonLoops) {
    const loopArea = polygonArea(loop);
    if (loopArea > 0) {
      outerLoopEntries.push({
        loop: loop,
        area: loopArea,
        holes: []
      });
    } else if (loopArea < 0) {
      holeLoops.push(loop);
    }
  }
  if (!outerLoopEntries.length) {
    for (const pendingHoleLoop of holeLoops.splice(0)) {
      const reversedHoleLoop = [...pendingHoleLoop].reverse();
      outerLoopEntries.push({
        loop: reversedHoleLoop,
        area: Math.abs(polygonArea(reversedHoleLoop)),
        holes: []
      });
    }
  }
  for (const containedHoleLoop of holeLoops) {
    const parentLoop = outerLoopEntries
      .filter(parentOuterEntry =>
        pointInPolygon(containedHoleLoop[0], parentOuterEntry.loop, 0.000001)
      )
      .sort((firstEntry, secondEntry) => firstEntry.area - secondEntry.area)[0];
    if (parentLoop) {
      (parentLoop.holes as any[]).push(containedHoleLoop);
    }
  }
  return outerLoopEntries.map(mappedOuterEntry => {
    const outerShape = polygonLoopToPath(threeModuleMin.Shape, mappedOuterEntry.loop);
    for (const hole of mappedOuterEntry.holes) {
      outerShape.holes.push(polygonLoopToPath(threeModuleMin.Path, hole));
    }
    return outerShape;
  });
}

export function offsetPolygonOutward(polygonOffsetPoints: any, offset: any) {
  const centroid = polygonOffsetPoints.reduce(
    (accumulator: any, accumulatedPoint: any) => ({
      x: accumulator.x + accumulatedPoint.x / polygonOffsetPoints.length,
      y: accumulator.y + accumulatedPoint.y / polygonOffsetPoints.length
    }),
    {
      x: 0,
      y: 0
    }
  );
  return polygonOffsetPoints.map((offsetSourcePoint: any) => {
    const radialDeltaX = offsetSourcePoint.x - centroid.x;
    const radialDeltaY = offsetSourcePoint.y - centroid.y;
    const distanceValue = Math.max(Math.hypot(radialDeltaX, radialDeltaY), 0.000001);
    return {
      x: offsetSourcePoint.x + (radialDeltaX / distanceValue) * offset,
      y: offsetSourcePoint.y + (radialDeltaY / distanceValue) * offset
    };
  });
}
