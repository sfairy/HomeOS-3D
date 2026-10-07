import { ShapeUtils, Vector2 } from "/static/vendor/three/0.186.0/three.module.min.js";
import {
  subtractPolygonLoops,
  validatedUnionPolygonLoops,
  polygonArea,
  modelBounds,
} from "./geometry";
const COURTYARD_DRAWING_TYPES = ["courtyard-area", "courtyard-path", "courtyard-fence"];
export const isCourtyardDrawing = (candidateDrawing: any) =>
    COURTYARD_DRAWING_TYPES.includes(candidateDrawing?.type),
  courtyardSurfaceRise = (riseDrawing: any) =>
    riseDrawing?.type === "courtyard-area" && riseDrawing.drawing?.style !== "lawn"
      ? Math.max(0, Number(riseDrawing.height) || 0)
      : 0,
  DRAWING_STYLES = {
    "courtyard-area": {
      lawn: "草坪",
      deck: "木平台",
      paving: "石砖铺装",
    },
    "courtyard-path": {
      stone: "自然汀步",
      square: "方形汀步",
      round: "圆形汀步",
    },
    "courtyard-fence": {
      wall: "实体矮墙",
      slatwall: "矮墙加木栅",
      picket: "竖向木栅",
      horizontal: "横向木栏",
      hedge: "连续绿篱",
    },
  };
import { clampNumber as clamp, finiteNumberOrCoerced as finiteOr } from "@app/utils/number";
export function normalizeCourtyardDrawing(drawingInput: any) {
  if (!isCourtyardDrawing(drawingInput)) return {};
  const normalizePoints = (pointSource: any) =>
    Array.isArray(pointSource)
      ? pointSource
          .slice(0, 128)
          .filter(
            (filteredPoint) =>
              Number.isFinite(filteredPoint?.x) && Number.isFinite(filteredPoint?.y),
          )
          .map((clampedPoint) => ({
            x: clamp(clampedPoint.x, -1, 1),
            y: clamp(clampedPoint.y, -1, 1),
          }))
      : [];
  return {
    drawing: {
      style:
        Object.hasOwn((DRAWING_STYLES as any)[drawingInput.type], drawingInput.drawing?.style) ||
        (drawingInput.type === "courtyard-fence" &&
          ["brick", "metal", "lattice"].includes(drawingInput.drawing?.style))
          ? drawingInput.drawing.style
          : Object.keys((DRAWING_STYLES as any)[drawingInput.type])[0],
      points: normalizePoints(drawingInput.drawing?.points),
      holes: Array.isArray(drawingInput.drawing?.holes)
        ? drawingInput.drawing.holes
            .slice(0, 16)
            .map(normalizePoints)
            .filter((holePoints: any) => holePoints.length >= 3)
        : [],
      closed: drawingInput.type === "courtyard-area" || drawingInput.drawing?.closed === true,
      curve: drawingInput.type === "courtyard-path" && drawingInput.drawing?.curve === true,
      spacing: clamp(
        finiteOr(
          drawingInput.drawing?.spacing,
          drawingInput.type === "courtyard-fence" ? 1.8 : 0.8,
        ),
        0.2,
        5,
      ),
      hedgeSpacing: clamp(finiteOr(drawingInput.drawing?.hedgeSpacing, 0.4), 0.2, 5),
      thickness: clamp(finiteOr(drawingInput.drawing?.thickness, 0.18), 0.06, 0.8),
      stoneWidth: clamp(finiteOr(drawingInput.drawing?.stoneWidth, 0.6), 0.15, 1.5),
      stoneDepth: clamp(finiteOr(drawingInput.drawing?.stoneDepth, 0.42), 0.15, 1.5),
      patternWidth: clamp(
        finiteOr(
          drawingInput.drawing?.patternWidth,
          drawingInput.drawing?.style === "deck" ? 0.16 : 0.6,
        ),
        0.08,
        2,
      ),
      patternLength: clamp(finiteOr(drawingInput.drawing?.patternLength, 0.9), 0.1, 3),
      angle: clamp(finiteOr(drawingInput.drawing?.angle, 0), -180, 180),
      gateWidth: clamp(finiteOr(drawingInput.drawing?.gateWidth, 0), 0, 4),
      gateOffset: clamp(finiteOr(drawingInput.drawing?.gateOffset, 1), 0, 200),
    },
  };
}
export function localPoints(drawing: any, sourcePoints = drawing.drawing.points) {
  return sourcePoints.map((normalizedPoint: any) => ({
    x: normalizedPoint.x * drawing.width,
    y: normalizedPoint.y * drawing.depth,
  }));
}
export function drawingPlanPoints(
  planDrawing: any,
  pixelScale: any,
  drawingPoints = planDrawing.drawing.points,
) {
  const rotationRad = ((planDrawing.rotation || 0) * Math.PI) / 180,
    rotationCos = Math.cos(rotationRad),
    rotationSin = Math.sin(rotationRad);
  return localPoints(planDrawing, drawingPoints).map((localPoint: any) => ({
    x: planDrawing.x + (localPoint.x * rotationCos - localPoint.y * rotationSin) * pixelScale,
    y: planDrawing.y + (localPoint.x * rotationSin + localPoint.y * rotationCos) * pixelScale,
  }));
}
export function packDrawingPoints(planPoints: any, pixelsPerMeter: any, holePointLists: any[] = []) {
  const xValues = planPoints.map((pointForX: any) => pointForX.x),
    yValues = planPoints.map((pointForY: any) => pointForY.y),
    centerX = (Math.min(...xValues) + Math.max(...xValues)) / 2,
    centerY = (Math.min(...yValues) + Math.max(...yValues)) / 2,
    normalizedWidth = Math.max(0.1, (Math.max(...xValues) - Math.min(...xValues)) / pixelsPerMeter),
    normalizedDepth = Math.max(0.1, (Math.max(...yValues) - Math.min(...yValues)) / pixelsPerMeter),
    packPointList = (pointsToPack: any) =>
      pointsToPack.map((pointToPack: any) => ({
        x: (pointToPack.x - centerX) / pixelsPerMeter / normalizedWidth,
        y: (pointToPack.y - centerY) / pixelsPerMeter / normalizedDepth,
      }));
  return {
    x: centerX,
    y: centerY,
    width: normalizedWidth,
    depth: normalizedDepth,
    rotation: 0,
    points: packPointList(planPoints),
    holes: holePointLists.map(packPointList),
  };
}
export function inside(testPoint: any, polygonLoop: any) {
  let isInsidePolygon = false;
  for (
    let currentIndex = 0, previousIndex = polygonLoop.length - 1;
    currentIndex < polygonLoop.length;
    previousIndex = currentIndex++
  ) {
    const currentPoint = polygonLoop[currentIndex],
      previousPoint = polygonLoop[previousIndex];
    currentPoint.y > testPoint.y != previousPoint.y > testPoint.y &&
      testPoint.x <
        ((previousPoint.x - currentPoint.x) * (testPoint.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x &&
      (isInsidePolygon = !isInsidePolygon);
  }
  return isInsidePolygon;
}
export function segmentDistance(distancePoint: any, segmentStart: any, segmentEnd: any) {
  const deltaX = segmentEnd.x - segmentStart.x,
    deltaY = segmentEnd.y - segmentStart.y,
    projectionRatio = clamp(
      ((distancePoint.x - segmentStart.x) * deltaX + (distancePoint.y - segmentStart.y) * deltaY) /
        (deltaX * deltaX + deltaY * deltaY || 1),
      0,
      1,
    );
  return Math.hypot(
    distancePoint.x - segmentStart.x - deltaX * projectionRatio,
    distancePoint.y - segmentStart.y - deltaY * projectionRatio,
  );
}
function crossProduct2d(originPoint: any, pointA: any, pointB: any) {
  return (
    (pointA.x - originPoint.x) * (pointB.y - originPoint.y) -
    (pointA.y - originPoint.y) * (pointB.x - originPoint.x)
  );
}
function doSegmentsIntersect(segmentStartA: any, segmentEndA: any, segmentStartB: any, segmentEndB: any) {
  const crossValues = [
    crossProduct2d(segmentStartA, segmentEndA, segmentStartB),
    crossProduct2d(segmentStartA, segmentEndA, segmentEndB),
    crossProduct2d(segmentStartB, segmentEndB, segmentStartA),
    crossProduct2d(segmentStartB, segmentEndB, segmentEndA),
  ];
  return crossValues[0] * crossValues[1] < -1e-10 && crossValues[2] * crossValues[3] < -1e-10
    ? true
    : (Math.abs(crossValues[0]) < 1e-8 &&
        segmentDistance(segmentStartB, segmentStartA, segmentEndA) < 1e-8) ||
        (Math.abs(crossValues[1]) < 1e-8 &&
          segmentDistance(segmentEndB, segmentStartA, segmentEndA) < 1e-8) ||
        (Math.abs(crossValues[2]) < 1e-8 &&
          segmentDistance(segmentStartA, segmentStartB, segmentEndB) < 1e-8) ||
        (Math.abs(crossValues[3]) < 1e-8 &&
          segmentDistance(segmentEndA, segmentStartB, segmentEndB) < 1e-8);
}
export function validLoop(loopToValidate: any) {
  if (loopToValidate.length < 3 || loopToValidate.length > 128) return false;
  let areaAccumulator = 0;
  for (let loopIndex = 0; loopIndex < loopToValidate.length; loopIndex++) {
    const edgeStartPoint = loopToValidate[loopIndex],
      edgeEndPoint = loopToValidate[(loopIndex + 1) % loopToValidate.length];
    if (Math.hypot(edgeEndPoint.x - edgeStartPoint.x, edgeEndPoint.y - edgeStartPoint.y) < 0.00001)
      return false;
    areaAccumulator += edgeStartPoint.x * edgeEndPoint.y - edgeEndPoint.x * edgeStartPoint.y;
    for (let compareIndex = loopIndex + 2; compareIndex < loopToValidate.length; compareIndex++)
      if (
        !(loopIndex === 0 && compareIndex === loopToValidate.length - 1) &&
        doSegmentsIntersect(
          edgeStartPoint,
          edgeEndPoint,
          loopToValidate[compareIndex],
          loopToValidate[(compareIndex + 1) % loopToValidate.length],
        )
      )
        return false;
  }
  return Math.abs(areaAccumulator) > 0.00001;
}
export function validHole(holeLoop: any, outlineLoop: any, otherHoleLoops: any[] = []) {
  if (!validLoop(holeLoop) || !holeLoop.every((holePoint: any) => inside(holePoint, outlineLoop)))
    return false;
  for (const compareLoop of [outlineLoop, ...otherHoleLoops])
    for (let holeIndex = 0; holeIndex < holeLoop.length; holeIndex++)
      for (let compareLoopIndex = 0; compareLoopIndex < compareLoop.length; compareLoopIndex++)
        if (
          doSegmentsIntersect(
            holeLoop[holeIndex],
            holeLoop[(holeIndex + 1) % holeLoop.length],
            compareLoop[compareLoopIndex],
            compareLoop[(compareLoopIndex + 1) % compareLoop.length],
          )
        )
          return false;
  return !otherHoleLoops.some(
    (otherHole) => inside(holeLoop[0], otherHole) || inside(otherHole[0], holeLoop),
  );
}
export function pathPoints(pathDrawing: any) {
  const localPathPoints = localPoints(pathDrawing),
    curvedPoints: any[] = [];
  if (!pathDrawing.drawing.curve || localPathPoints.length < 3)
    return pathDrawing.drawing.closed ? [...localPathPoints, localPathPoints[0]] : localPathPoints;
  for (let segmentIndex = 0; segmentIndex < localPathPoints.length - 1; segmentIndex++) {
    const priorPoint = localPathPoints[Math.max(segmentIndex - 1, 0)],
      segmentStartPoint = localPathPoints[segmentIndex],
      segmentEndPoint = localPathPoints[segmentIndex + 1],
      followingPoint = localPathPoints[Math.min(segmentIndex + 2, localPathPoints.length - 1)],
      subdivisionCount = clamp(
        Math.ceil(
          Math.hypot(
            segmentEndPoint.x - segmentStartPoint.x,
            segmentEndPoint.y - segmentStartPoint.y,
          ) / 0.12,
        ),
        4,
        40,
      );
    for (let subdivisionIndex = 0; subdivisionIndex < subdivisionCount; subdivisionIndex++) {
      const subdivisionRatio = subdivisionIndex / subdivisionCount,
        subdivisionRatioSquared = subdivisionRatio * subdivisionRatio,
        subdivisionRatioCubed = subdivisionRatioSquared * subdivisionRatio,
        splineComponent = (axisKey: any) =>
          0.5 *
          (2 * segmentStartPoint[axisKey] +
            (-priorPoint[axisKey] + segmentEndPoint[axisKey]) * subdivisionRatio +
            (2 * priorPoint[axisKey] -
              5 * segmentStartPoint[axisKey] +
              4 * segmentEndPoint[axisKey] -
              followingPoint[axisKey]) *
              subdivisionRatioSquared +
            (-priorPoint[axisKey] +
              3 * segmentStartPoint[axisKey] -
              3 * segmentEndPoint[axisKey] +
              followingPoint[axisKey]) *
              subdivisionRatioCubed);
      curvedPoints.push({
        x: splineComponent("x"),
        y: splineComponent("y"),
      });
    }
  }
  return (curvedPoints.push(localPathPoints.at(-1)), curvedPoints);
}
export function samplePath(pathPointList: any, stepLength: any) {
  const sampledPoints: any[] = [];
  let segmentStartDistance = 0,
    sampleDistance = 0;
  for (let pathSegmentIndex = 1; pathSegmentIndex < pathPointList.length; pathSegmentIndex++) {
    const sampleSegmentStart = pathPointList[pathSegmentIndex - 1],
      sampleSegmentEnd = pathPointList[pathSegmentIndex],
      segmentLength = Math.hypot(
        sampleSegmentEnd.x - sampleSegmentStart.x,
        sampleSegmentEnd.y - sampleSegmentStart.y,
      );
    if (!(segmentLength < 1e-8)) {
      for (
        ;
        sampleDistance <= segmentStartDistance + segmentLength + 1e-8 &&
        sampledPoints.length < 1200;
      ) {
        const sampleRatio = clamp((sampleDistance - segmentStartDistance) / segmentLength, 0, 1);
        (sampledPoints.push({
          x: sampleSegmentStart.x + (sampleSegmentEnd.x - sampleSegmentStart.x) * sampleRatio,
          y: sampleSegmentStart.y + (sampleSegmentEnd.y - sampleSegmentStart.y) * sampleRatio,
          angle: Math.atan2(
            sampleSegmentEnd.y - sampleSegmentStart.y,
            sampleSegmentEnd.x - sampleSegmentStart.x,
          ),
        }),
          (sampleDistance += stepLength));
      }
      segmentStartDistance += segmentLength;
    }
  }
  return sampledPoints;
}
export function hitDrawing(
  targetDrawing: any,
  hitPoint: any,
  hitPixelsPerMeter: any,
  toleranceMeters: any,
  obstacleLoops: any[] = [],
) {
  const inverseRotationRad = (-(targetDrawing.rotation || 0) * Math.PI) / 180,
    offsetX = (hitPoint.x - targetDrawing.x) / hitPixelsPerMeter,
    offsetY = (hitPoint.y - targetDrawing.y) / hitPixelsPerMeter,
    localHitPoint = {
      x: offsetX * Math.cos(inverseRotationRad) - offsetY * Math.sin(inverseRotationRad),
      y: offsetX * Math.sin(inverseRotationRad) + offsetY * Math.cos(inverseRotationRad),
    };
  if (targetDrawing.type === "courtyard-area")
    return surfaceRegions(targetDrawing, obstacleLoops).some(
      (region: any) =>
        inside(localHitPoint, region.outline) &&
        !region.holes.some((regionHole: any) => inside(localHitPoint, regionHole)),
    );
  const hitPathPoints = pathPoints(targetDrawing),
    hitRadius = Math.max(
      toleranceMeters / hitPixelsPerMeter,
      targetDrawing.type === "courtyard-path"
        ? targetDrawing.drawing.stoneWidth / 2
        : targetDrawing.drawing.thickness / 2,
    );
  return hitPathPoints.some(
    (hitSegmentEnd: any, pointIndex: any) =>
      pointIndex > 0 &&
      segmentDistance(localHitPoint, hitPathPoints[pointIndex - 1], hitSegmentEnd) <= hitRadius,
  );
}
export function clippedLine(lineStart: any, lineEnd: any, clipLoops: any) {
  const lineDeltaX = lineEnd.x - lineStart.x,
    lineDeltaY = lineEnd.y - lineStart.y,
    intersectionRatios = [0, 1];
  for (const clipLoop of clipLoops)
    for (let edgeIndex = 0; edgeIndex < clipLoop.length; edgeIndex++) {
      const edgeStart = clipLoop[edgeIndex],
        edgeEnd = clipLoop[(edgeIndex + 1) % clipLoop.length],
        edgeDeltaX = edgeEnd.x - edgeStart.x,
        edgeDeltaY = edgeEnd.y - edgeStart.y,
        directionCross = lineDeltaX * edgeDeltaY - lineDeltaY * edgeDeltaX;
      if (Math.abs(directionCross) < 1e-10) continue;
      const lineRatio =
          ((edgeStart.x - lineStart.x) * edgeDeltaY - (edgeStart.y - lineStart.y) * edgeDeltaX) /
          directionCross,
        edgeRatio =
          ((edgeStart.x - lineStart.x) * lineDeltaY - (edgeStart.y - lineStart.y) * lineDeltaX) /
          directionCross;
      lineRatio > 0 &&
        lineRatio < 1 &&
        edgeRatio >= 0 &&
        edgeRatio <= 1 &&
        intersectionRatios.push(lineRatio);
    }
  intersectionRatios.sort((firstRatio, secondRatio) => firstRatio - secondRatio);
  const clippedSegments: any[] = [];
  for (let ratioIndex = 1; ratioIndex < intersectionRatios.length; ratioIndex++) {
    if (intersectionRatios[ratioIndex] - intersectionRatios[ratioIndex - 1] < 0.000001) continue;
    const midRatio = (intersectionRatios[ratioIndex] + intersectionRatios[ratioIndex - 1]) / 2,
      midPoint = {
        x: lineStart.x + midRatio * lineDeltaX,
        y: lineStart.y + midRatio * lineDeltaY,
      };
    inside(midPoint, clipLoops[0]) &&
      !clipLoops.slice(1).some((otherClipLoop: any) => inside(midPoint, otherClipLoop)) &&
      clippedSegments.push([
        {
          x: lineStart.x + intersectionRatios[ratioIndex - 1] * lineDeltaX,
          y: lineStart.y + intersectionRatios[ratioIndex - 1] * lineDeltaY,
        },
        {
          x: lineStart.x + intersectionRatios[ratioIndex] * lineDeltaX,
          y: lineStart.y + intersectionRatios[ratioIndex] * lineDeltaY,
        },
      ]);
  }
  return clippedSegments;
}
export function buildingFootprints(wallList: any, baseFootprintLoops: any, wallPixelsPerMeter: any) {
  const footprintLoops = baseFootprintLoops.map((footprintLoop: any) =>
    footprintLoop.map((footprintPoint: any) => ({
      ...footprintPoint,
    })),
  );
  for (const wall of wallList) {
    const wallStart = wall.start,
      wallEnd = wall.end,
      wallLength = Math.hypot(wallEnd.x - wallStart.x, wallEnd.y - wallStart.y);
    if (wallLength < 0.000001) continue;
    const halfThickness = (wall.thickness * wallPixelsPerMeter) / 2,
      thicknessOffset = {
        x: (-(wallEnd.y - wallStart.y) / wallLength) * halfThickness,
        y: ((wallEnd.x - wallStart.x) / wallLength) * halfThickness,
      };
    footprintLoops.push([
      {
        x: wallStart.x + thicknessOffset.x,
        y: wallStart.y + thicknessOffset.y,
      },
      {
        x: wallEnd.x + thicknessOffset.x,
        y: wallEnd.y + thicknessOffset.y,
      },
      {
        x: wallEnd.x - thicknessOffset.x,
        y: wallEnd.y - thicknessOffset.y,
      },
      {
        x: wallStart.x - thicknessOffset.x,
        y: wallStart.y - thicknessOffset.y,
      },
    ]);
  }
  return footprintLoops;
}
function localBuildingFootprints(localDrawing: any, worldFootprintLoops: any, localPixelsPerMeter: any) {
  const negativeRotationRad = (-(localDrawing.rotation || 0) * Math.PI) / 180,
    localRotationCos = Math.cos(negativeRotationRad),
    localRotationSin = Math.sin(negativeRotationRad);
  return worldFootprintLoops.map((worldFootprintLoop: any) =>
    worldFootprintLoop.map((worldFootprintPoint: any) => {
      const localOffsetX = (worldFootprintPoint.x - localDrawing.x) / localPixelsPerMeter,
        localOffsetY = (worldFootprintPoint.y - localDrawing.y) / localPixelsPerMeter;
      return {
        x: localOffsetX * localRotationCos - localOffsetY * localRotationSin,
        y: localOffsetX * localRotationSin + localOffsetY * localRotationCos,
      };
    }),
  );
}

const regionCacheMap = new Map();
export function surfaceRegions(surfaceDrawing: any, exclusionLoops: any[] = []) {
  const outlinePoints = localPoints(surfaceDrawing);
  if (!validLoop(outlinePoints)) return [];
  const holeLoops: any[] = [];
  for (const validHoleLoop of surfaceDrawing.drawing.holes.map((rawHole: any) =>
    localPoints(surfaceDrawing, rawHole),
  ))
    validHole(validHoleLoop, outlinePoints, holeLoops) && holeLoops.push(validHoleLoop);
  const overlappingLoops = exclusionLoops.filter(
    (exclusionLoop) =>
      exclusionLoop.some(
        (overlapExclusionPoint: any) =>
          overlapExclusionPoint.x >= -surfaceDrawing.width / 2 &&
          overlapExclusionPoint.x <= surfaceDrawing.width / 2 &&
          overlapExclusionPoint.y >= -surfaceDrawing.depth / 2 &&
          overlapExclusionPoint.y <= surfaceDrawing.depth / 2,
      ) ||
      outlinePoints.some((outlinePoint: any) => inside(outlinePoint, exclusionLoop)) ||
      exclusionLoop.some((overlapPoint: any, overlapIndex: any) =>
        outlinePoints.some((outlineEdgePoint: any, outlineEdgeIndex: any) =>
          doSegmentsIntersect(
            overlapPoint,
            exclusionLoop[(overlapIndex + 1) % exclusionLoop.length],
            outlineEdgePoint,
            outlinePoints[(outlineEdgeIndex + 1) % outlinePoints.length],
          ),
        ),
      ),
  );
  if (!overlappingLoops.length)
    return [
      {
        outline: outlinePoints,
        holes: holeLoops,
      },
    ];
  const cacheKey = JSON.stringify([outlinePoints, holeLoops, overlappingLoops]);
  if (regionCacheMap.has(cacheKey)) return regionCacheMap.get(cacheKey);
  const subtractedLoops = subtractPolygonLoops(
      [outlinePoints],
      [...holeLoops, ...overlappingLoops],
    ),
    positiveRegionList = subtractedLoops
      .filter((regionLoop) => polygonArea(regionLoop) > 0)
      .map((positiveLoop) => ({
        outline: positiveLoop,
        holes: [] as any[],
      }));
  for (const negativeLoop of subtractedLoops.filter(
    (negativeRegionLoop) => polygonArea(negativeRegionLoop) < 0,
  )) {
    const parentRegion = positiveRegionList
      .filter((candidateRegion) => inside(negativeLoop[0], candidateRegion.outline))
      .sort(
        (regionA, regionB) =>
          Math.abs(polygonArea(regionA.outline)) - Math.abs(polygonArea(regionB.outline)),
      )[0];
    parentRegion && parentRegion.holes.push(negativeLoop);
  }
  return (
    regionCacheMap.size > 32 && regionCacheMap.delete(regionCacheMap.keys().next().value),
    regionCacheMap.set(cacheKey, positiveRegionList),
    positiveRegionList
  );
}
export function courtyardBoundaryPoints(sceneModel: any, boundaryPixelsPerMeter: any) {
  const boundaryPoints = (sceneModel.walls || [])
    .flatMap((sceneWall: any) => [sceneWall.start, sceneWall.end])
    .filter(
      (boundaryPoint: any) => Number.isFinite(boundaryPoint?.x) && Number.isFinite(boundaryPoint?.y),
    );
  for (const sceneItem of sceneModel.items || [])
    isCourtyardDrawing(sceneItem) &&
      boundaryPoints.push(...drawingPlanPoints(sceneItem, boundaryPixelsPerMeter));
  return boundaryPoints;
}
export function courtyardFootprintLoops(
  baseLoops: any,
  sceneItems: any,
  footprintPixelsPerMeter: any,
  toGroundPoint: any,
  walls: any[] = [],
) {
  const resultLoops = baseLoops.map((baseLoop: any) =>
    baseLoop.map((basePoint: any) => ({
      x: basePoint.x,
      y: basePoint.z,
    })),
  );
  let hasCourtyardDrawing = false;
  for (const courtyardItem of sceneItems) {
    if (courtyardItem.type !== "courtyard-area" && courtyardItem.type !== "courtyard-fence")
      continue;
    const plannedPoints = drawingPlanPoints(courtyardItem, footprintPixelsPerMeter)
      .map(toGroundPoint)
      .map((groundProjectedPoint: any) => ({
        x: groundProjectedPoint.x,
        y: groundProjectedPoint.z,
      }));
    if (courtyardItem.type === "courtyard-fence") {
      const fenceHalfWidth =
          courtyardItem.drawing.thickness * (courtyardItem.drawing.style === "hedge" ? 1.5 : 0.6),
        fencePathPoints = courtyardItem.drawing.closed
          ? [...plannedPoints, plannedPoints[0]]
          : plannedPoints;
      for (let fenceIndex = 1; fenceIndex < fencePathPoints.length; fenceIndex++) {
        const fenceStart = fencePathPoints[fenceIndex - 1],
          fenceEnd = fencePathPoints[fenceIndex],
          fenceSegmentLength = Math.hypot(fenceEnd.x - fenceStart.x, fenceEnd.y - fenceStart.y);
        if (fenceSegmentLength < 1e-7) continue;
        const fenceDirectionX = (fenceEnd.x - fenceStart.x) / fenceSegmentLength,
          fenceDirectionY = (fenceEnd.y - fenceStart.y) / fenceSegmentLength;
        (resultLoops.push([
          {
            x: fenceStart.x - fenceDirectionX * fenceHalfWidth - fenceDirectionY * fenceHalfWidth,
            y: fenceStart.y - fenceDirectionY * fenceHalfWidth + fenceDirectionX * fenceHalfWidth,
          },
          {
            x: fenceEnd.x + fenceDirectionX * fenceHalfWidth - fenceDirectionY * fenceHalfWidth,
            y: fenceEnd.y + fenceDirectionY * fenceHalfWidth + fenceDirectionX * fenceHalfWidth,
          },
          {
            x: fenceEnd.x + fenceDirectionX * fenceHalfWidth + fenceDirectionY * fenceHalfWidth,
            y: fenceEnd.y + fenceDirectionY * fenceHalfWidth - fenceDirectionX * fenceHalfWidth,
          },
          {
            x: fenceStart.x - fenceDirectionX * fenceHalfWidth + fenceDirectionY * fenceHalfWidth,
            y: fenceStart.y - fenceDirectionY * fenceHalfWidth - fenceDirectionX * fenceHalfWidth,
          },
        ]),
          (hasCourtyardDrawing = true));
      }
      if (!courtyardItem.drawing.closed) continue;
    }
    if (!validLoop(plannedPoints)) continue;
    const acceptedHoleLoops: any[] = [];
    if (courtyardItem.type === "courtyard-area")
      for (const courtyardHole of courtyardItem.drawing.holes || []) {
        const plannedHolePoints = drawingPlanPoints(
          courtyardItem,
          footprintPixelsPerMeter,
          courtyardHole,
        )
          .map(toGroundPoint)
          .map((projectedHolePoint: any) => ({
            x: projectedHolePoint.x,
            y: projectedHolePoint.z,
          }));
        validHole(plannedHolePoints, plannedPoints, acceptedHoleLoops) &&
          acceptedHoleLoops.push(plannedHolePoints);
      }
    if (acceptedHoleLoops.length) {
      const vectorLoops = [plannedPoints, ...acceptedHoleLoops].map((loopToVectorize) =>
          loopToVectorize.map((loopPoint: any) => new Vector2(loopPoint.x, loopPoint.y)),
        ),
        flatVertexList = vectorLoops.flat();
      resultLoops.push(
        ...ShapeUtils.triangulateShape(vectorLoops[0], vectorLoops.slice(1)).map((triangle: any) =>
          triangle.map((triangleVertexIndex: any) => flatVertexList[triangleVertexIndex]),
        ),
      );
    } else resultLoops.push(plannedPoints);
    hasCourtyardDrawing = true;
  }
  if (!hasCourtyardDrawing) return resultLoops;
  const combinedLoops = [...resultLoops];
  if (baseLoops.length) {
    for (const buildingLoop of buildingFootprints(walls, [], footprintPixelsPerMeter))
      combinedLoops.push(
        buildingLoop.map(toGroundPoint).map((buildingPoint: any) => ({
          x: buildingPoint.x,
          y: buildingPoint.z,
        })),
      );
  }
  for (const loopsToUnion of [combinedLoops, resultLoops])
    for (const unionTolerance of [1e-7, 0.00001]) {
      const unionedLoops = validatedUnionPolygonLoops(loopsToUnion, unionTolerance);
      if (unionedLoops.length) return unionedLoops;
    }
  return [];
}

export function outerPerimeterLine(perimeterLoop: any, offsetDistance = 0.025) {
  const windingSign = polygonArea(perimeterLoop) >= 0 ? 1 : -1;
  return perimeterLoop.map((vertexPoint: any, vertexIndex: any) => {
    const previousVertex =
        perimeterLoop[(vertexIndex + perimeterLoop.length - 1) % perimeterLoop.length],
      nextVertex = perimeterLoop[(vertexIndex + 1) % perimeterLoop.length],
      previousEdgeLength =
        Math.hypot(vertexPoint.x - previousVertex.x, vertexPoint.y - previousVertex.y) || 1,
      nextEdgeLength = Math.hypot(nextVertex.x - vertexPoint.x, nextVertex.y - vertexPoint.y) || 1,
      previousOffsetNormal = {
        x: ((vertexPoint.y - previousVertex.y) / previousEdgeLength) * windingSign,
        y: (-(vertexPoint.x - previousVertex.x) / previousEdgeLength) * windingSign,
      },
      nextOffsetNormal = {
        x: ((nextVertex.y - vertexPoint.y) / nextEdgeLength) * windingSign,
        y: (-(nextVertex.x - vertexPoint.x) / nextEdgeLength) * windingSign,
      },
      normalDotProductPlusOne =
        1 +
        previousOffsetNormal.x * nextOffsetNormal.x +
        previousOffsetNormal.y * nextOffsetNormal.y;
    let outerOffsetX =
        normalDotProductPlusOne > 0.000001
          ? ((previousOffsetNormal.x + nextOffsetNormal.x) * offsetDistance) /
            normalDotProductPlusOne
          : nextOffsetNormal.x * offsetDistance,
      outerOffsetY =
        normalDotProductPlusOne > 0.000001
          ? ((previousOffsetNormal.y + nextOffsetNormal.y) * offsetDistance) /
            normalDotProductPlusOne
          : nextOffsetNormal.y * offsetDistance;
    const offsetLength = Math.hypot(outerOffsetX, outerOffsetY);
    return (
      offsetLength > offsetDistance * 3 &&
        ((outerOffsetX *= (offsetDistance * 3) / offsetLength),
        (outerOffsetY *= (offsetDistance * 3) / offsetLength)),
      {
        x: vertexPoint.x + outerOffsetX,
        z: vertexPoint.y + outerOffsetY,
      }
    );
  });
}
function courtyardContentBounds(contentSceneModel: any, contentPixelsPerMeter: any) {
  const contentBoundaryPoints = courtyardBoundaryPoints(contentSceneModel, contentPixelsPerMeter);
  if (!contentBoundaryPoints.length) return modelBounds(contentSceneModel);
  const minX = Math.min(...contentBoundaryPoints.map((xBoundaryPoint: any) => xBoundaryPoint.x)),
    minY = Math.min(...contentBoundaryPoints.map((yBoundaryPoint: any) => yBoundaryPoint.y)),
    maxX = Math.max(...contentBoundaryPoints.map((maxXBoundaryPoint: any) => maxXBoundaryPoint.x)),
    maxY = Math.max(...contentBoundaryPoints.map((maxYBoundaryPoint: any) => maxYBoundaryPoint.y));
  return {
    minX: minX,
    minY: minY,
    maxX: maxX,
    maxY: maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}
export function sceneContentBounds(boundsSceneModel: any) {
  return (boundsSceneModel.items || []).some(isCourtyardDrawing)
    ? courtyardContentBounds(boundsSceneModel, boundsSceneModel.calibration?.pixelsPerMeter || 100)
    : boundsSceneModel.walls?.length
      ? modelBounds({
          background: null as any,
          walls: boundsSceneModel.walls,
          items: [] as any[],
        })
      : boundsSceneModel.items?.length
        ? modelBounds({
            background: null as any,
            walls: [] as any[],
            items: boundsSceneModel.items,
          })
        : modelBounds(boundsSceneModel);
}

export function sceneModelOrigin(
  originSceneModel: any,
  originFallback: { originX?: number; originY?: number } = {},
) {
  if (!originSceneModel.walls?.length && (originSceneModel.items || []).some(isCourtyardDrawing))
    return {
      x: finiteOr(originFallback?.originX, 0),
      y: finiteOr(originFallback?.originY, 0),
    };
  const bounds = originSceneModel.walls?.length
    ? modelBounds({
        background: null as any,
        walls: originSceneModel.walls,
        items: [] as any[],
      })
    : sceneContentBounds(originSceneModel);
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}
export const isCourtyardGate = (gateItem: any) =>
  ["garden-gate", "garden-gate-solid", "garden-gate-arch"].includes(gateItem?.type);
export function anchorGate(
  anchorGateItem: any,
  gateSceneItems: any,
  gatePixelsPerMeter: any,
  gateSnapDistanceLimit: any,
) {
  if (!isCourtyardGate(anchorGateItem)) return false;
  let nearestAnchor: any = null;
  for (const fenceItem of gateSceneItems.filter(
    (candidateFence: any) => candidateFence.type === "courtyard-fence",
  )) {
    const gateFencePoints = drawingPlanPoints(fenceItem, gatePixelsPerMeter);
    fenceItem.drawing.closed && gateFencePoints.push(gateFencePoints[0]);
    let travelledDistance = 0;
    const fenceTotalLength = gateFencePoints
      .slice(1)
      .reduce(
        (accumulatedLength: any, pathPoint: any, fencePointIndex: any) =>
          accumulatedLength +
          Math.hypot(
            pathPoint.x - gateFencePoints[fencePointIndex].x,
            pathPoint.y - gateFencePoints[fencePointIndex].y,
          ),
        0,
      );
    for (let gateFenceIndex = 1; gateFenceIndex < gateFencePoints.length; gateFenceIndex++) {
      const gateFenceStart = gateFencePoints[gateFenceIndex - 1],
        gateFenceEnd = gateFencePoints[gateFenceIndex],
        segDeltaX = gateFenceEnd.x - gateFenceStart.x,
        segDeltaY = gateFenceEnd.y - gateFenceStart.y,
        segLength = Math.hypot(segDeltaX, segDeltaY);
      if (segLength < anchorGateItem.width * gatePixelsPerMeter) {
        travelledDistance += segLength;
        continue;
      }
      const gateProjectionRatio = clamp(
          ((anchorGateItem.x - gateFenceStart.x) * segDeltaX +
            (anchorGateItem.y - gateFenceStart.y) * segDeltaY) /
            (segLength * segLength),
          (anchorGateItem.width * gatePixelsPerMeter) / 2 / segLength,
          1 - (anchorGateItem.width * gatePixelsPerMeter) / 2 / segLength,
        ),
        projectedPoint = {
          x: gateFenceStart.x + gateProjectionRatio * segDeltaX,
          y: gateFenceStart.y + gateProjectionRatio * segDeltaY,
        },
        gateDistance = Math.hypot(
          anchorGateItem.x - projectedPoint.x,
          anchorGateItem.y - projectedPoint.y,
        );
      (gateDistance <= gateSnapDistanceLimit &&
        (!nearestAnchor || gateDistance < nearestAnchor.distance) &&
        (nearestAnchor = {
          fenceId: fenceItem.id,
          fraction: (travelledDistance + gateProjectionRatio * segLength) / fenceTotalLength,
          distance: gateDistance,
        }),
        (travelledDistance += segLength));
    }
  }
  return nearestAnchor
    ? ((anchorGateItem.courtyardGate = {
        fenceId: nearestAnchor.fenceId,
        fraction: nearestAnchor.fraction,
      }),
      syncCourtyardGates(
        [
          ...gateSceneItems.filter(
            (otherItem: any) => otherItem !== anchorGateItem && otherItem.type === "courtyard-fence",
          ),
          anchorGateItem,
        ],
        gatePixelsPerMeter,
      ),
      true)
    : (delete anchorGateItem.courtyardGate, false);
}
export function syncCourtyardGates(syncSceneItems: any, syncPixelsPerMeter: any) {
  for (const syncedGate of syncSceneItems.filter(isCourtyardGate)) {
    if (!syncedGate.courtyardGate) continue;
    const linkedFence = syncSceneItems.find(
      (candidateItem: any) =>
        candidateItem.id === syncedGate.courtyardGate.fenceId &&
        candidateItem.type === "courtyard-fence",
    );
    if (!linkedFence) {
      delete syncedGate.courtyardGate;
      continue;
    }
    const linkedFencePoints = drawingPlanPoints(linkedFence, syncPixelsPerMeter);
    linkedFence.drawing.closed && linkedFencePoints.push(linkedFencePoints[0]);
    const segmentLengths = linkedFencePoints
      .slice(1)
      .map((pathSegmentEnd: any, segmentStartIndex: any) =>
        Math.hypot(
          pathSegmentEnd.x - linkedFencePoints[segmentStartIndex].x,
          pathSegmentEnd.y - linkedFencePoints[segmentStartIndex].y,
        ),
      );
    let targetDistance =
      segmentLengths.reduce((sumLength: any, lengthSummand: any) => sumLength + lengthSummand, 0) *
      syncedGate.courtyardGate.fraction;
    for (let segmentCursor = 0; segmentCursor < segmentLengths.length; segmentCursor++) {
      if (
        targetDistance > segmentLengths[segmentCursor] &&
        segmentCursor < segmentLengths.length - 1
      ) {
        targetDistance -= segmentLengths[segmentCursor];
        continue;
      }
      const fenceSegmentStart = linkedFencePoints[segmentCursor],
        fenceSegmentEnd = linkedFencePoints[segmentCursor + 1],
        positionRatio = clamp(targetDistance / (segmentLengths[segmentCursor] || 1), 0, 1);
      ((syncedGate.x =
        fenceSegmentStart.x + (fenceSegmentEnd.x - fenceSegmentStart.x) * positionRatio),
        (syncedGate.y =
          fenceSegmentStart.y + (fenceSegmentEnd.y - fenceSegmentStart.y) * positionRatio),
        (syncedGate.rotation =
          (Math.atan2(
            fenceSegmentEnd.y - fenceSegmentStart.y,
            fenceSegmentEnd.x - fenceSegmentStart.x,
          ) *
            180) /
          Math.PI),
        (syncedGate.elevation = linkedFence.elevation || 0));
      break;
    }
  }
}
export function fenceOpenings(openingFence: any, openingSceneItems: any) {
  const openingFencePoints = pathPoints(openingFence),
    openingFenceLength = openingFencePoints
      .slice(1)
      .reduce(
        (runningLength: any, openingPathPoint: any, openingPointIndex: any) =>
          runningLength +
          Math.hypot(
            openingPathPoint.x - openingFencePoints[openingPointIndex].x,
            openingPathPoint.y - openingFencePoints[openingPointIndex].y,
          ),
        0,
      );
  return openingSceneItems
    .filter(
      (candidateGate: any) =>
        isCourtyardGate(candidateGate) && candidateGate.courtyardGate?.fenceId === openingFence.id,
    )
    .map((openingGate: any) => ({
      offset: Math.max(
        0,
        openingFenceLength * openingGate.courtyardGate.fraction - openingGate.width / 2,
      ),
      width: openingGate.width,
    }));
}
export function surfaceExclusions(
  exclusionSurfaceDrawing: any,
  exclusionSceneItems: any,
  buildingLoops: any,
  exclusionPixelsPerMeter: any,
) {
  const exclusionFootprints = localBuildingFootprints(
      exclusionSurfaceDrawing,
      buildingLoops,
      exclusionPixelsPerMeter,
    ),
    surfaceIndex = exclusionSceneItems.findIndex(
      (indexedItem: any) => indexedItem.id === exclusionSurfaceDrawing.id,
    );
  for (const otherSurface of exclusionSceneItems.slice(surfaceIndex + 1)) {
    if (
      otherSurface.type !== "courtyard-area" ||
      Math.abs(
        (otherSurface.elevation || 0) +
          courtyardSurfaceRise(otherSurface) -
          (exclusionSurfaceDrawing.elevation || 0) -
          courtyardSurfaceRise(exclusionSurfaceDrawing),
      ) > 0.003
    )
      continue;
    const otherOutlinePoints = drawingPlanPoints(otherSurface, exclusionPixelsPerMeter),
      otherHolePointLists = otherSurface.drawing.holes.map((exclusionHole: any) =>
        drawingPlanPoints(otherSurface, exclusionPixelsPerMeter, exclusionHole),
      );
    if (!validLoop(otherOutlinePoints)) continue;
    const validHoleLoops = otherHolePointLists.filter((holeLoopCandidate: any, holeCandidateIndex: any) =>
        validHole(
          holeLoopCandidate,
          otherOutlinePoints,
          otherHolePointLists.filter(
            (_compareHoleLoop: any, compareHoleIndex: any) => holeCandidateIndex !== compareHoleIndex,
          ),
        ),
      ),
      exclusionVectorLoops = [otherOutlinePoints, ...validHoleLoops].map(
        (exclusionLoopToVectorize) =>
          exclusionLoopToVectorize.map(
            (exclusionLoopPoint: any) => new Vector2(exclusionLoopPoint.x, exclusionLoopPoint.y),
          ),
      ),
      exclusionFlatVertices = exclusionVectorLoops.flat(),
      triangulatedTriangles = ShapeUtils.triangulateShape(
        exclusionVectorLoops[0],
        exclusionVectorLoops.slice(1),
      ).map((exclusionTriangle: any) =>
        exclusionTriangle.map(
          (exclusionVertexIndex: any) => exclusionFlatVertices[exclusionVertexIndex],
        ),
      );
    exclusionFootprints.push(
      ...localBuildingFootprints(
        exclusionSurfaceDrawing,
        triangulatedTriangles,
        exclusionPixelsPerMeter,
      ),
    );
  }
  return exclusionFootprints;
}
export function fenceSegments(segmentFence: any, gateOpenings: any[] = []) {
  const segmentFencePoints = pathPoints(segmentFence),
    openingRanges = [
      ...gateOpenings,
      ...(segmentFence.drawing.gateWidth > 0
        ? [
            {
              offset: segmentFence.drawing.gateOffset,
              width: segmentFence.drawing.gateWidth,
            },
          ]
        : []),
    ],
    keptSegments: any[] = [];
  let coveredDistance = 0;
  for (
    let segmentPointIndex = 1;
    segmentPointIndex < segmentFencePoints.length;
    segmentPointIndex++
  ) {
    const currentSegmentStart = segmentFencePoints[segmentPointIndex - 1],
      currentSegmentEnd = segmentFencePoints[segmentPointIndex],
      currentSegmentLength = Math.hypot(
        currentSegmentEnd.x - currentSegmentStart.x,
        currentSegmentEnd.y - currentSegmentStart.y,
      );
    if (currentSegmentLength < 1e-8) continue;
    const cutDistances = [0, currentSegmentLength];
    for (const opening of openingRanges)
      for (const cutDistance of [opening.offset, opening.offset + opening.width])
        cutDistance > coveredDistance &&
          cutDistance < coveredDistance + currentSegmentLength &&
          cutDistances.push(cutDistance - coveredDistance);
    cutDistances.sort((distanceA, distanceB) => distanceA - distanceB);
    const pointAtDistance = (distanceAlongSegment: any) => ({
      x:
        currentSegmentStart.x +
        ((currentSegmentEnd.x - currentSegmentStart.x) * distanceAlongSegment) /
          currentSegmentLength,
      y:
        currentSegmentStart.y +
        ((currentSegmentEnd.y - currentSegmentStart.y) * distanceAlongSegment) /
          currentSegmentLength,
    });
    for (let cutIndex = 1; cutIndex < cutDistances.length; cutIndex++) {
      const midDistance =
        coveredDistance + (cutDistances[cutIndex - 1] + cutDistances[cutIndex]) / 2;
      openingRanges.some(
        (openingToTest) =>
          midDistance > openingToTest.offset &&
          midDistance < openingToTest.offset + openingToTest.width,
      ) ||
        keptSegments.push([
          pointAtDistance(cutDistances[cutIndex - 1]),
          pointAtDistance(cutDistances[cutIndex]),
        ]);
    }
    coveredDistance += currentSegmentLength;
  }
  return keptSegments;
}
export function remapCourtyardAttachments(previousItems: any, nextItems: any) {
  const newIdByOldId = new Map(
    previousItems.map((previousItem: any, itemIndex: any) => [previousItem.id, nextItems[itemIndex].id]),
  );
  for (const nextItem of nextItems) {
    if (!nextItem.courtyardGate) continue;
    const remappedFenceId = newIdByOldId.get(nextItem.courtyardGate.fenceId);
    remappedFenceId
      ? (nextItem.courtyardGate = {
          ...nextItem.courtyardGate,
          fenceId: remappedFenceId,
        })
      : delete nextItem.courtyardGate;
  }
}
export function hedgeSamples(hedgeFence: any, hedgeGateOpenings: any[] = []) {
  const hedgePoints: any[] = [],
    emittedPointKeysSet = new Set(),
    hedgeSpacing = clamp(finiteOr(hedgeFence.drawing.hedgeSpacing, 0.4), 0.2, 5);
  for (const [hedgeSegmentStart, hedgeSegmentEnd] of fenceSegments(hedgeFence, hedgeGateOpenings)) {
    const hedgeSegmentLength = Math.hypot(
        hedgeSegmentEnd.x - hedgeSegmentStart.x,
        hedgeSegmentEnd.y - hedgeSegmentStart.y,
      ),
      endInset = Math.min(hedgeFence.drawing.thickness * 1.5, hedgeSegmentLength / 2),
      pointAlongHedge = (distanceAlong: any) => ({
        x:
          hedgeSegmentStart.x +
          ((hedgeSegmentEnd.x - hedgeSegmentStart.x) * distanceAlong) / hedgeSegmentLength,
        y:
          hedgeSegmentStart.y +
          ((hedgeSegmentEnd.y - hedgeSegmentStart.y) * distanceAlong) / hedgeSegmentLength,
      }),
      hedgeSamplePoints =
        hedgeSegmentLength <= endInset * 2 + 0.000001
          ? [pointAlongHedge(hedgeSegmentLength / 2)]
          : samplePath(
              [pointAlongHedge(endInset), pointAlongHedge(hedgeSegmentLength - endInset)],
              hedgeSpacing,
            );
    for (const hedgeSamplePoint of hedgeSamplePoints) {
      const sampleKey = hedgeSamplePoint.x.toFixed(4) + ":" + hedgeSamplePoint.y.toFixed(4);
      if (
        !emittedPointKeysSet.has(sampleKey) &&
        (emittedPointKeysSet.add(sampleKey),
        hedgePoints.push(hedgeSamplePoint),
        hedgePoints.length >= 1200)
      )
        return hedgePoints;
    }
  }
  return hedgePoints;
}
export function snapCourtyardPoint(
  snapPoint: any,
  {
    base: baseSnap,
    walls: snapWallList = [],
    items: snapSceneItems = [],
    draft: draftPoints = [],
    ppm: snapScalePixelsPerMeter = 100,
    tolerance: tolerancePixels = 12,
    enabled: isSnapEnabled = true,
    anchor: anchorPoint,
    forceAxis: shouldForceAxis = false,
    excludeId: excludeItemId,

    settings: snapSettings = {} as { snapEndpoints?: boolean; snapSegments?: boolean },
  }: any,
) {
  if (!isSnapEnabled) return baseSnap;
  const snapTargets = snapSceneItems
      .filter(isCourtyardDrawing)
      .filter((snapCandidateItem: any) => snapCandidateItem.id !== excludeItemId)
      .flatMap((snapDrawingItem: any) => [
        {
          points: drawingPlanPoints(snapDrawingItem, snapScalePixelsPerMeter),
          closed: snapDrawingItem.type === "courtyard-area" || snapDrawingItem.drawing.closed,
        },
        ...snapDrawingItem.drawing.holes.map((snapHolePoints: any) => ({
          points: drawingPlanPoints(snapDrawingItem, snapScalePixelsPerMeter, snapHolePoints),
          closed: true,
        })),
      ]),
    wallFootprints = buildingFootprints(snapWallList, [], snapScalePixelsPerMeter),
    matchesAxis = (candidatePoint: any) =>
      !shouldForceAxis ||
      !anchorPoint ||
      (Math.abs(baseSnap.point.x - anchorPoint.x) < 0.000001
        ? Math.abs(candidatePoint.x - anchorPoint.x) < 0.000001
        : Math.abs(candidatePoint.y - anchorPoint.y) < 0.000001),
    nearestTarget = (targetList: any) =>
      targetList
        .filter((target: any) => matchesAxis(target.point))
        .map((targetWithDistance: any) => ({
          ...targetWithDistance,
          distance: Math.hypot(
            targetWithDistance.point.x - snapPoint.x,
            targetWithDistance.point.y - snapPoint.y,
          ),
        }))
        .filter((nearTarget: any) => nearTarget.distance <= tolerancePixels)
        .sort((targetA: any, targetB: any) => targetA.distance - targetB.distance)[0];
  if (snapSettings.snapEndpoints !== false) {
    const endpointTargets = [
        ...draftPoints.map((draftPoint: any, draftIndex: any) => ({
          point: draftPoint,
          kind: "endpoint",
          label: draftIndex === 0 && draftPoints.length >= 3 ? "点击闭合地面" : "绘制节点",
        })),
        ...snapTargets.flatMap((snapTarget: any) =>
          snapTarget.points.map((snapTargetPoint: any) => ({
            point: snapTargetPoint,
            kind: "endpoint",
            label: "庭院节点",
          })),
        ),
        ...wallFootprints.flatMap((wallFootprint: any) =>
          wallFootprint.map((wallFootprintPoint: any) => ({
            point: wallFootprintPoint,
            kind: "endpoint",
            label: "墙面端点",
          })),
        ),
      ],
      endpointSnap = nearestTarget(endpointTargets);
    if (endpointSnap) return endpointSnap;
  }
  if (snapSettings.snapSegments !== false) {
    const segmentTargets: any[] = [];
    for (const snapGeometry of [
      ...snapTargets,
      ...wallFootprints.map((wallLoop: any) => ({
        points: wallLoop,
        closed: true,
        wall: true,
      })),
    ])
      for (
        let segmentPointCursor = 0;
        segmentPointCursor < snapGeometry.points.length - (snapGeometry.closed ? 0 : 1);
        segmentPointCursor++
      ) {
        const snapSegmentStart = snapGeometry.points[segmentPointCursor],
          snapSegmentEnd =
            snapGeometry.points[(segmentPointCursor + 1) % snapGeometry.points.length],
          segmentDeltaX = snapSegmentEnd.x - snapSegmentStart.x,
          segmentDeltaY = snapSegmentEnd.y - snapSegmentStart.y,
          segmentLengthSquared = segmentDeltaX * segmentDeltaX + segmentDeltaY * segmentDeltaY;
        if (!segmentLengthSquared) continue;
        let snapProjectionRatio = clamp(
          ((snapPoint.x - snapSegmentStart.x) * segmentDeltaX +
            (snapPoint.y - snapSegmentStart.y) * segmentDeltaY) /
            segmentLengthSquared,
          0,
          1,
        );
        if (shouldForceAxis && anchorPoint) {
          const isVerticalAxis = Math.abs(baseSnap.point.x - anchorPoint.x) < 0.000001,
            axisDelta = isVerticalAxis ? segmentDeltaX : segmentDeltaY;
          if (
            Math.abs(axisDelta) > 1e-8 &&
            ((snapProjectionRatio =
              ((isVerticalAxis ? anchorPoint.x : anchorPoint.y) -
                (isVerticalAxis ? snapSegmentStart.x : snapSegmentStart.y)) /
              axisDelta),
            snapProjectionRatio < 0 || snapProjectionRatio > 1)
          )
            continue;
        }
        segmentTargets.push({
          point: {
            x: snapSegmentStart.x + snapProjectionRatio * segmentDeltaX,
            y: snapSegmentStart.y + snapProjectionRatio * segmentDeltaY,
          },
          kind: "segment",
          label: snapGeometry.wall ? "墙面" : "庭院边线",
        });
      }
    const segmentSnap = nearestTarget(segmentTargets);
    if (segmentSnap) return segmentSnap;
  }
  return baseSnap;
}
export function trimCourtyardArea(areaDrawing: any, cutStart: any, cutEnd: any, cutSidePoint: any, trimPixelsPerMeter: any) {
  const areaOutlinePoints = drawingPlanPoints(areaDrawing, trimPixelsPerMeter),
    areaHolePointLists = areaDrawing.drawing.holes.map((areaHole: any) =>
      drawingPlanPoints(areaDrawing, trimPixelsPerMeter, areaHole),
    ),
    cutDeltaX = cutEnd.x - cutStart.x,
    cutDeltaY = cutEnd.y - cutStart.y,
    cutLength = Math.hypot(cutDeltaX, cutDeltaY);
  if (cutLength < trimPixelsPerMeter * 0.01) return null;
  const trimSideSign = Math.sign(
    cutDeltaX * (cutSidePoint.y - cutStart.y) - cutDeltaY * (cutSidePoint.x - cutStart.x),
  );
  if (!trimSideSign) return null;
  const trimExtent =
      Math.max(
        ...areaOutlinePoints.map((areaOutlinePoint: any) =>
          Math.hypot(areaOutlinePoint.x - cutStart.x, areaOutlinePoint.y - cutStart.y),
        ),
        cutLength,
        trimPixelsPerMeter,
      ) * 4,
    alongCutOffset = {
      x: (cutDeltaX / cutLength) * trimExtent,
      y: (cutDeltaY / cutLength) * trimExtent,
    },
    perpendicularOffset = {
      x: (-cutDeltaY / cutLength) * trimExtent * trimSideSign,
      y: (cutDeltaX / cutLength) * trimExtent * trimSideSign,
    },
    cutQuadLoop = [
      {
        x: cutStart.x - alongCutOffset.x,
        y: cutStart.y - alongCutOffset.y,
      },
      {
        x: cutStart.x + alongCutOffset.x,
        y: cutStart.y + alongCutOffset.y,
      },
      {
        x: cutStart.x + alongCutOffset.x + perpendicularOffset.x,
        y: cutStart.y + alongCutOffset.y + perpendicularOffset.y,
      },
      {
        x: cutStart.x - alongCutOffset.x + perpendicularOffset.x,
        y: cutStart.y - alongCutOffset.y + perpendicularOffset.y,
      },
    ],
    trimSubtractedLoops = subtractPolygonLoops(
      [areaOutlinePoints],
      [...areaHolePointLists, cutQuadLoop],
    ),
    trimRegionList = trimSubtractedLoops
      .filter((trimRegionLoop) => polygonArea(trimRegionLoop) > 0)
      .map((trimPositiveLoop) => ({
        outline: trimPositiveLoop,
        holes: [] as any[],
      }));
  for (const trimNegativeLoop of trimSubtractedLoops.filter(
    (trimNegativeRegionLoop) => polygonArea(trimNegativeRegionLoop) < 0,
  )) {
    const trimParentRegion = trimRegionList
      .filter((trimCandidateRegion) => inside(trimNegativeLoop[0], trimCandidateRegion.outline))
      .sort(
        (trimRegionA, trimRegionB) =>
          Math.abs(polygonArea(trimRegionA.outline)) - Math.abs(polygonArea(trimRegionB.outline)),
      )[0];
    trimParentRegion && trimParentRegion.holes.push(trimNegativeLoop);
  }
  return trimRegionList;
}
