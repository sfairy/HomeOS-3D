import { ShapeUtils, Vector2 } from "/static/vendor/three/0.186.0/three.module.min.js";
import {
  subtractPolygonLoops,
  validatedUnionPolygonLoops,
  polygonArea,
  modelBounds,
} from "./geometry";
export const COURTYARD_DRAWING_TYPES = ["courtyard-area", "courtyard-path", "courtyard-fence"],
  isCourtyardDrawing = (candidateDrawing) =>
    COURTYARD_DRAWING_TYPES.includes(candidateDrawing?.type),
  courtyardSurfaceRise = (riseDrawing) =>
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
const clamp = (valueToClamp, lowerLimit, upperLimit) =>
    Math.max(lowerLimit, Math.min(upperLimit, valueToClamp)),
  finiteOr = (valueToCheck, defaultNumber) =>
    Number.isFinite(Number(valueToCheck)) ? Number(valueToCheck) : defaultNumber;
export function normalizeCourtyardDrawing(drawingInput) {
  if (!isCourtyardDrawing(drawingInput)) return {};
  const normalizePoints = (pointSource) =>
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
        Object.hasOwn(DRAWING_STYLES[drawingInput.type], drawingInput.drawing?.style) ||
        (drawingInput.type === "courtyard-fence" &&
          ["brick", "metal", "lattice"].includes(drawingInput.drawing?.style))
          ? drawingInput.drawing.style
          : Object.keys(DRAWING_STYLES[drawingInput.type])[0],
      points: normalizePoints(drawingInput.drawing?.points),
      holes: Array.isArray(drawingInput.drawing?.holes)
        ? drawingInput.drawing.holes
            .slice(0, 16)
            .map(normalizePoints)
            .filter((holePoints) => holePoints.length >= 3)
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
export function localPoints(drawing, sourcePoints = drawing.drawing.points) {
  return sourcePoints.map((normalizedPoint) => ({
    x: normalizedPoint.x * drawing.width,
    y: normalizedPoint.y * drawing.depth,
  }));
}
export function drawingPlanPoints(
  planDrawing,
  pixelScale,
  drawingPoints = planDrawing.drawing.points,
) {
  const rotationRad = ((planDrawing.rotation || 0) * Math.PI) / 180,
    rotationCos = Math.cos(rotationRad),
    rotationSin = Math.sin(rotationRad);
  return localPoints(planDrawing, drawingPoints).map((localPoint) => ({
    x: planDrawing.x + (localPoint.x * rotationCos - localPoint.y * rotationSin) * pixelScale,
    y: planDrawing.y + (localPoint.x * rotationSin + localPoint.y * rotationCos) * pixelScale,
  }));
}
export function packDrawingPoints(planPoints, pixelsPerMeter, holePointLists = []) {
  const xValues = planPoints.map((pointForX) => pointForX.x),
    yValues = planPoints.map((pointForY) => pointForY.y),
    centerX = (Math.min(...xValues) + Math.max(...xValues)) / 2,
    centerY = (Math.min(...yValues) + Math.max(...yValues)) / 2,
    normalizedWidth = Math.max(0.1, (Math.max(...xValues) - Math.min(...xValues)) / pixelsPerMeter),
    normalizedDepth = Math.max(0.1, (Math.max(...yValues) - Math.min(...yValues)) / pixelsPerMeter),
    packPointList = (pointsToPack) =>
      pointsToPack.map((pointToPack) => ({
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
export function inside(testPoint, polygonLoop) {
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
export function segmentDistance(distancePoint, segmentStart, segmentEnd) {
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
function crossProduct2d(originPoint, pointA, pointB) {
  return (
    (pointA.x - originPoint.x) * (pointB.y - originPoint.y) -
    (pointA.y - originPoint.y) * (pointB.x - originPoint.x)
  );
}
function doSegmentsIntersect(segmentStartA, segmentEndA, segmentStartB, segmentEndB) {
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
export function validLoop(loopToValidate) {
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
export function validHole(holeLoop, outlineLoop, otherHoleLoops = []) {
  if (!validLoop(holeLoop) || !holeLoop.every((holePoint) => inside(holePoint, outlineLoop)))
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
export function pathPoints(pathDrawing) {
  const localPathPoints = localPoints(pathDrawing),
    curvedPoints = [];
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
        splineComponent = (axisKey) =>
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
export function samplePath(pathPointList, stepLength) {
  const sampledPoints = [];
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
  targetDrawing,
  hitPoint,
  hitPixelsPerMeter,
  toleranceMeters,
  obstacleLoops = [],
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
      (region) =>
        inside(localHitPoint, region.outline) &&
        !region.holes.some((regionHole) => inside(localHitPoint, regionHole)),
    );
  const hitPathPoints = pathPoints(targetDrawing),
    hitRadius = Math.max(
      toleranceMeters / hitPixelsPerMeter,
      targetDrawing.type === "courtyard-path"
        ? targetDrawing.drawing.stoneWidth / 2
        : targetDrawing.drawing.thickness / 2,
    );
  return hitPathPoints.some(
    (hitSegmentEnd, pointIndex) =>
      pointIndex > 0 &&
      segmentDistance(localHitPoint, hitPathPoints[pointIndex - 1], hitSegmentEnd) <= hitRadius,
  );
}
export function clippedLine(lineStart, lineEnd, clipLoops) {
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
  const clippedSegments = [];
  for (let ratioIndex = 1; ratioIndex < intersectionRatios.length; ratioIndex++) {
    if (intersectionRatios[ratioIndex] - intersectionRatios[ratioIndex - 1] < 0.000001) continue;
    const midRatio = (intersectionRatios[ratioIndex] + intersectionRatios[ratioIndex - 1]) / 2,
      midPoint = {
        x: lineStart.x + midRatio * lineDeltaX,
        y: lineStart.y + midRatio * lineDeltaY,
      };
    inside(midPoint, clipLoops[0]) &&
      !clipLoops.slice(1).some((otherClipLoop) => inside(midPoint, otherClipLoop)) &&
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
export function buildingFootprints(wallList, baseFootprintLoops, wallPixelsPerMeter) {
  const footprintLoops = baseFootprintLoops.map((footprintLoop) =>
    footprintLoop.map((footprintPoint) => ({
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
export function localBuildingFootprints(localDrawing, worldFootprintLoops, localPixelsPerMeter) {
  const negativeRotationRad = (-(localDrawing.rotation || 0) * Math.PI) / 180,
    localRotationCos = Math.cos(negativeRotationRad),
    localRotationSin = Math.sin(negativeRotationRad);
  return worldFootprintLoops.map((worldFootprintLoop) =>
    worldFootprintLoop.map((worldFootprintPoint) => {
      const localOffsetX = (worldFootprintPoint.x - localDrawing.x) / localPixelsPerMeter,
        localOffsetY = (worldFootprintPoint.y - localDrawing.y) / localPixelsPerMeter;
      return {
        x: localOffsetX * localRotationCos - localOffsetY * localRotationSin,
        y: localOffsetX * localRotationSin + localOffsetY * localRotationCos,
      };
    }),
  );
}
export function snapToWallFace(probePoint, snapWalls, snapPixelsPerMeter, snapDistanceLimit) {
  let nearestSnap = null;
  for (const candidateWall of snapWalls) {
    const candidateWallStart = candidateWall.start,
      candidateWallEnd = candidateWall.end,
      wallDeltaX = candidateWallEnd.x - candidateWallStart.x,
      wallDeltaY = candidateWallEnd.y - candidateWallStart.y,
      candidateWallLength = Math.hypot(wallDeltaX, wallDeltaY);
    if (!candidateWallLength) continue;
    const wallProjectionRatio = clamp(
        ((probePoint.x - candidateWallStart.x) * wallDeltaX +
          (probePoint.y - candidateWallStart.y) * wallDeltaY) /
          (candidateWallLength * candidateWallLength),
        0,
        1,
      ),
      sideSign =
        wallDeltaX * (probePoint.y - candidateWallStart.y) -
          wallDeltaY * (probePoint.x - candidateWallStart.x) >=
        0
          ? 1
          : -1,
      wallHalfThickness = (candidateWall.thickness * snapPixelsPerMeter) / 2,
      facePoint = {
        x:
          candidateWallStart.x +
          wallProjectionRatio * wallDeltaX -
          (wallDeltaY / candidateWallLength) * wallHalfThickness * sideSign,
        y:
          candidateWallStart.y +
          wallProjectionRatio * wallDeltaY +
          (wallDeltaX / candidateWallLength) * wallHalfThickness * sideSign,
      },
      pointDistance = Math.hypot(probePoint.x - facePoint.x, probePoint.y - facePoint.y);
    pointDistance <= snapDistanceLimit &&
      (!nearestSnap || pointDistance < nearestSnap.distance) &&
      (nearestSnap = {
        point: facePoint,
        distance: pointDistance,
      });
  }
  return nearestSnap;
}
const regionCacheMap = new Map();
export function surfaceRegions(surfaceDrawing, exclusionLoops = []) {
  const outlinePoints = localPoints(surfaceDrawing);
  if (!validLoop(outlinePoints)) return [];
  const holeLoops = [];
  for (const validHoleLoop of surfaceDrawing.drawing.holes.map((rawHole) =>
    localPoints(surfaceDrawing, rawHole),
  ))
    validHole(validHoleLoop, outlinePoints, holeLoops) && holeLoops.push(validHoleLoop);
  const overlappingLoops = exclusionLoops.filter(
    (exclusionLoop) =>
      exclusionLoop.some(
        (overlapExclusionPoint) =>
          overlapExclusionPoint.x >= -surfaceDrawing.width / 2 &&
          overlapExclusionPoint.x <= surfaceDrawing.width / 2 &&
          overlapExclusionPoint.y >= -surfaceDrawing.depth / 2 &&
          overlapExclusionPoint.y <= surfaceDrawing.depth / 2,
      ) ||
      outlinePoints.some((outlinePoint) => inside(outlinePoint, exclusionLoop)) ||
      exclusionLoop.some((overlapPoint, overlapIndex) =>
        outlinePoints.some((outlineEdgePoint, outlineEdgeIndex) =>
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
        holes: [],
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
export function courtyardBoundaryPoints(sceneModel, boundaryPixelsPerMeter) {
  const boundaryPoints = (sceneModel.walls || [])
    .flatMap((sceneWall) => [sceneWall.start, sceneWall.end])
    .filter(
      (boundaryPoint) => Number.isFinite(boundaryPoint?.x) && Number.isFinite(boundaryPoint?.y),
    );
  for (const sceneItem of sceneModel.items || [])
    isCourtyardDrawing(sceneItem) &&
      boundaryPoints.push(...drawingPlanPoints(sceneItem, boundaryPixelsPerMeter));
  return boundaryPoints;
}
export function courtyardFootprintLoops(
  baseLoops,
  sceneItems,
  footprintPixelsPerMeter,
  toGroundPoint,
  walls = [],
) {
  const resultLoops = baseLoops.map((baseLoop) =>
    baseLoop.map((basePoint) => ({
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
      .map((groundProjectedPoint) => ({
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
    const acceptedHoleLoops = [];
    if (courtyardItem.type === "courtyard-area")
      for (const courtyardHole of courtyardItem.drawing.holes || []) {
        const plannedHolePoints = drawingPlanPoints(
          courtyardItem,
          footprintPixelsPerMeter,
          courtyardHole,
        )
          .map(toGroundPoint)
          .map((projectedHolePoint) => ({
            x: projectedHolePoint.x,
            y: projectedHolePoint.z,
          }));
        validHole(plannedHolePoints, plannedPoints, acceptedHoleLoops) &&
          acceptedHoleLoops.push(plannedHolePoints);
      }
    if (acceptedHoleLoops.length) {
      const vectorLoops = [plannedPoints, ...acceptedHoleLoops].map((loopToVectorize) =>
          loopToVectorize.map((loopPoint) => new Vector2(loopPoint.x, loopPoint.y)),
        ),
        flatVertexList = vectorLoops.flat();
      resultLoops.push(
        ...ShapeUtils.triangulateShape(vectorLoops[0], vectorLoops.slice(1)).map((triangle) =>
          triangle.map((triangleVertexIndex) => flatVertexList[triangleVertexIndex]),
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
        buildingLoop.map(toGroundPoint).map((buildingPoint) => ({
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
export function courtyardPerimeterLoops(
  perimeterBaseLoops,
  perimeterSceneItems,
  perimeterPixelsPerMeter,
  perimeterToGroundPoint,
  perimeterWalls = [],
) {
  return perimeterSceneItems.some(
    (perimeterItem) =>
      perimeterItem.type === "courtyard-area" || perimeterItem.type === "courtyard-fence",
  )
    ? courtyardFootprintLoops(
        perimeterBaseLoops,
        perimeterSceneItems,
        perimeterPixelsPerMeter,
        perimeterToGroundPoint,
        perimeterWalls,
      )
        .filter((perimeterRegionLoop) => polygonArea(perimeterRegionLoop) > 0)
        .map((loopToConvert) =>
          loopToConvert.map((convertedPoint) => ({
            x: convertedPoint.x,
            z: convertedPoint.y,
          })),
        )
    : perimeterBaseLoops;
}
export function outerPerimeterLine(perimeterLoop, offsetDistance = 0.025) {
  const windingSign = polygonArea(perimeterLoop) >= 0 ? 1 : -1;
  return perimeterLoop.map((vertexPoint, vertexIndex) => {
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
export function courtyardContentBounds(contentSceneModel, contentPixelsPerMeter) {
  const contentBoundaryPoints = courtyardBoundaryPoints(contentSceneModel, contentPixelsPerMeter);
  if (!contentBoundaryPoints.length) return modelBounds(contentSceneModel);
  const minX = Math.min(...contentBoundaryPoints.map((xBoundaryPoint) => xBoundaryPoint.x)),
    minY = Math.min(...contentBoundaryPoints.map((yBoundaryPoint) => yBoundaryPoint.y)),
    maxX = Math.max(...contentBoundaryPoints.map((maxXBoundaryPoint) => maxXBoundaryPoint.x)),
    maxY = Math.max(...contentBoundaryPoints.map((maxYBoundaryPoint) => maxYBoundaryPoint.y));
  return {
    minX: minX,
    minY: minY,
    maxX: maxX,
    maxY: maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}
export function sceneContentBounds(boundsSceneModel) {
  return (boundsSceneModel.items || []).some(isCourtyardDrawing)
    ? courtyardContentBounds(boundsSceneModel, boundsSceneModel.calibration?.pixelsPerMeter || 100)
    : boundsSceneModel.walls?.length
      ? modelBounds({
          background: null,
          walls: boundsSceneModel.walls,
          items: [],
        })
      : boundsSceneModel.items?.length
        ? modelBounds({
            background: null,
            walls: [],
            items: boundsSceneModel.items,
          })
        : modelBounds(boundsSceneModel);
}
// originFallback 允许只给部分轴：缺省轴按 0 兜底（调用方常常只想覆盖其中一轴）。
export function sceneModelOrigin(
  originSceneModel,
  originFallback: { originX?: number; originY?: number } = {},
) {
  if (!originSceneModel.walls?.length && (originSceneModel.items || []).some(isCourtyardDrawing))
    return {
      x: finiteOr(originFallback?.originX, 0),
      y: finiteOr(originFallback?.originY, 0),
    };
  const bounds = originSceneModel.walls?.length
    ? modelBounds({
        background: null,
        walls: originSceneModel.walls,
        items: [],
      })
    : sceneContentBounds(originSceneModel);
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}
export const isCourtyardGate = (gateItem) =>
  ["garden-gate", "garden-gate-solid", "garden-gate-arch"].includes(gateItem?.type);
export function anchorGate(
  anchorGateItem,
  gateSceneItems,
  gatePixelsPerMeter,
  gateSnapDistanceLimit,
) {
  if (!isCourtyardGate(anchorGateItem)) return false;
  let nearestAnchor = null;
  for (const fenceItem of gateSceneItems.filter(
    (candidateFence) => candidateFence.type === "courtyard-fence",
  )) {
    const gateFencePoints = drawingPlanPoints(fenceItem, gatePixelsPerMeter);
    fenceItem.drawing.closed && gateFencePoints.push(gateFencePoints[0]);
    let travelledDistance = 0;
    const fenceTotalLength = gateFencePoints
      .slice(1)
      .reduce(
        (accumulatedLength, pathPoint, fencePointIndex) =>
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
            (otherItem) => otherItem !== anchorGateItem && otherItem.type === "courtyard-fence",
          ),
          anchorGateItem,
        ],
        gatePixelsPerMeter,
      ),
      true)
    : (delete anchorGateItem.courtyardGate, false);
}
export function syncCourtyardGates(syncSceneItems, syncPixelsPerMeter) {
  for (const syncedGate of syncSceneItems.filter(isCourtyardGate)) {
    if (!syncedGate.courtyardGate) continue;
    const linkedFence = syncSceneItems.find(
      (candidateItem) =>
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
      .map((pathSegmentEnd, segmentStartIndex) =>
        Math.hypot(
          pathSegmentEnd.x - linkedFencePoints[segmentStartIndex].x,
          pathSegmentEnd.y - linkedFencePoints[segmentStartIndex].y,
        ),
      );
    let targetDistance =
      segmentLengths.reduce((sumLength, lengthSummand) => sumLength + lengthSummand, 0) *
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
export function fenceOpenings(openingFence, openingSceneItems) {
  const openingFencePoints = pathPoints(openingFence),
    openingFenceLength = openingFencePoints
      .slice(1)
      .reduce(
        (runningLength, openingPathPoint, openingPointIndex) =>
          runningLength +
          Math.hypot(
            openingPathPoint.x - openingFencePoints[openingPointIndex].x,
            openingPathPoint.y - openingFencePoints[openingPointIndex].y,
          ),
        0,
      );
  return openingSceneItems
    .filter(
      (candidateGate) =>
        isCourtyardGate(candidateGate) && candidateGate.courtyardGate?.fenceId === openingFence.id,
    )
    .map((openingGate) => ({
      offset: Math.max(
        0,
        openingFenceLength * openingGate.courtyardGate.fraction - openingGate.width / 2,
      ),
      width: openingGate.width,
    }));
}
export function surfaceExclusions(
  exclusionSurfaceDrawing,
  exclusionSceneItems,
  buildingLoops,
  exclusionPixelsPerMeter,
) {
  const exclusionFootprints = localBuildingFootprints(
      exclusionSurfaceDrawing,
      buildingLoops,
      exclusionPixelsPerMeter,
    ),
    surfaceIndex = exclusionSceneItems.findIndex(
      (indexedItem) => indexedItem.id === exclusionSurfaceDrawing.id,
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
      otherHolePointLists = otherSurface.drawing.holes.map((exclusionHole) =>
        drawingPlanPoints(otherSurface, exclusionPixelsPerMeter, exclusionHole),
      );
    if (!validLoop(otherOutlinePoints)) continue;
    const validHoleLoops = otherHolePointLists.filter((holeLoopCandidate, holeCandidateIndex) =>
        validHole(
          holeLoopCandidate,
          otherOutlinePoints,
          otherHolePointLists.filter(
            (compareHoleLoop, compareHoleIndex) => holeCandidateIndex !== compareHoleIndex,
          ),
        ),
      ),
      exclusionVectorLoops = [otherOutlinePoints, ...validHoleLoops].map(
        (exclusionLoopToVectorize) =>
          exclusionLoopToVectorize.map(
            (exclusionLoopPoint) => new Vector2(exclusionLoopPoint.x, exclusionLoopPoint.y),
          ),
      ),
      exclusionFlatVertices = exclusionVectorLoops.flat(),
      triangulatedTriangles = ShapeUtils.triangulateShape(
        exclusionVectorLoops[0],
        exclusionVectorLoops.slice(1),
      ).map((exclusionTriangle) =>
        exclusionTriangle.map(
          (exclusionVertexIndex) => exclusionFlatVertices[exclusionVertexIndex],
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
export function fenceSegments(segmentFence, gateOpenings = []) {
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
    keptSegments = [];
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
    const pointAtDistance = (distanceAlongSegment) => ({
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
export function remapCourtyardAttachments(previousItems, nextItems) {
  const newIdByOldId = new Map(
    previousItems.map((previousItem, itemIndex) => [previousItem.id, nextItems[itemIndex].id]),
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
export function hedgeSamples(hedgeFence, hedgeGateOpenings = []) {
  const hedgePoints = [],
    emittedPointKeysSet = new Set(),
    hedgeSpacing = clamp(finiteOr(hedgeFence.drawing.hedgeSpacing, 0.4), 0.2, 5);
  for (const [hedgeSegmentStart, hedgeSegmentEnd] of fenceSegments(hedgeFence, hedgeGateOpenings)) {
    const hedgeSegmentLength = Math.hypot(
        hedgeSegmentEnd.x - hedgeSegmentStart.x,
        hedgeSegmentEnd.y - hedgeSegmentStart.y,
      ),
      endInset = Math.min(hedgeFence.drawing.thickness * 1.5, hedgeSegmentLength / 2),
      pointAlongHedge = (distanceAlong) => ({
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
  snapPoint,
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
    // 吸附开关：只有显式传 false 才关掉对应类型的吸附目标。
    settings: snapSettings = {} as { snapEndpoints?: boolean; snapSegments?: boolean },
  },
) {
  if (!isSnapEnabled) return baseSnap;
  const snapTargets = snapSceneItems
      .filter(isCourtyardDrawing)
      .filter((snapCandidateItem) => snapCandidateItem.id !== excludeItemId)
      .flatMap((snapDrawingItem) => [
        {
          points: drawingPlanPoints(snapDrawingItem, snapScalePixelsPerMeter),
          closed: snapDrawingItem.type === "courtyard-area" || snapDrawingItem.drawing.closed,
        },
        ...snapDrawingItem.drawing.holes.map((snapHolePoints) => ({
          points: drawingPlanPoints(snapDrawingItem, snapScalePixelsPerMeter, snapHolePoints),
          closed: true,
        })),
      ]),
    wallFootprints = buildingFootprints(snapWallList, [], snapScalePixelsPerMeter),
    matchesAxis = (candidatePoint) =>
      !shouldForceAxis ||
      !anchorPoint ||
      (Math.abs(baseSnap.point.x - anchorPoint.x) < 0.000001
        ? Math.abs(candidatePoint.x - anchorPoint.x) < 0.000001
        : Math.abs(candidatePoint.y - anchorPoint.y) < 0.000001),
    nearestTarget = (targetList) =>
      targetList
        .filter((target) => matchesAxis(target.point))
        .map((targetWithDistance) => ({
          ...targetWithDistance,
          distance: Math.hypot(
            targetWithDistance.point.x - snapPoint.x,
            targetWithDistance.point.y - snapPoint.y,
          ),
        }))
        .filter((nearTarget) => nearTarget.distance <= tolerancePixels)
        .sort((targetA, targetB) => targetA.distance - targetB.distance)[0];
  if (snapSettings.snapEndpoints !== false) {
    const endpointTargets = [
        ...draftPoints.map((draftPoint, draftIndex) => ({
          point: draftPoint,
          kind: "endpoint",
          label: draftIndex === 0 && draftPoints.length >= 3 ? "点击闭合地面" : "绘制节点",
        })),
        ...snapTargets.flatMap((snapTarget) =>
          snapTarget.points.map((snapTargetPoint) => ({
            point: snapTargetPoint,
            kind: "endpoint",
            label: "庭院节点",
          })),
        ),
        ...wallFootprints.flatMap((wallFootprint) =>
          wallFootprint.map((wallFootprintPoint) => ({
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
    const segmentTargets = [];
    for (const snapGeometry of [
      ...snapTargets,
      ...wallFootprints.map((wallLoop) => ({
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
export function trimCourtyardArea(areaDrawing, cutStart, cutEnd, cutSidePoint, trimPixelsPerMeter) {
  const areaOutlinePoints = drawingPlanPoints(areaDrawing, trimPixelsPerMeter),
    areaHolePointLists = areaDrawing.drawing.holes.map((areaHole) =>
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
        ...areaOutlinePoints.map((areaOutlinePoint) =>
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
        holes: [],
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
