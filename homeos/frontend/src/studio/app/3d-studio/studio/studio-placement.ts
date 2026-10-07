import {
  drawingPlanPoints,
  isCourtyardGate,
  syncCourtyardGates,
} from "../plan/courtyard-drawing";
const overlapEpsilon = 0.001,
  overlapLength = (startA: any, endA: any, startB: any, endB: any) => Math.min(endA, endB) - Math.max(startA, startB);
function createOrientedBox(
  centerX: any,
  centerY: any,
  boxWidth: any,
  boxDepth: any,
  angleRad: any,
  bottomElevation: any,
  boxHeight: any,
) {
  const cosAngle = Math.cos(angleRad),
    sinAngle = Math.sin(angleRad);
  return {
    x: centerX,
    y: centerY,
    width: boxWidth,
    depth: boxDepth,
    axes: [
      {
        x: cosAngle,
        y: sinAngle,
      },
      {
        x: -sinAngle,
        y: cosAngle,
      },
    ],
    bottom: bottomElevation,
    top: bottomElevation + boxHeight,
  };
}
function boxOverlapArea(boxA: any, boxB: any, isFencePair = false) {
  if (
    isFencePair &&
    Math.abs(boxA.axes[0].x * boxB.axes[0].y - boxA.axes[0].y * boxB.axes[0].x) > 0.001
  )
    return 0;
  const verticalOverlap = overlapLength(boxA.bottom, boxA.top, boxB.bottom, boxB.top);
  if (verticalOverlap <= overlapEpsilon) return 0;
  let minLateralOverlap = Infinity;
  for (const axis of [...boxA.axes, ...boxB.axes]) {
    const halfExtentOnAxis = (box: any) =>
        (Math.abs(axis.x * box.axes[0].x + axis.y * box.axes[0].y) * box.width) / 2 +
        (Math.abs(axis.x * box.axes[1].x + axis.y * box.axes[1].y) * box.depth) / 2,
      projectionA = boxA.x * axis.x + boxA.y * axis.y,
      projectionB = boxB.x * axis.x + boxB.y * axis.y,
      lateralOverlap = overlapLength(
        projectionA - halfExtentOnAxis(boxA),
        projectionA + halfExtentOnAxis(boxA),
        projectionB - halfExtentOnAxis(boxB),
        projectionB + halfExtentOnAxis(boxB),
      );
    if (lateralOverlap <= overlapEpsilon) return 0;
    minLateralOverlap = Math.min(minLateralOverlap, lateralOverlap);
  }
  return minLateralOverlap * verticalOverlap;
}
/** 定位开洞时需要用到的最小墙体结构：两端坐标 + 厚度。 */
type PlacementWall = {
  id: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  thickness?: number;
};

function buildPlacementGroups(scene: any, ppm: any) {
  const placementGroups: any[] = [],

    wallsById = new Map<string, PlacementWall>(
      (scene.walls || []).map((wall: any) => [wall.id, wall] as [string, PlacementWall]),
    );
  for (const openingKind of ["doors", "windows", "railings"])
    for (const opening of scene[openingKind] || []) {
      const openingWall = wallsById.get(opening.wallId);
      if (!openingWall) continue;
      const wallDeltaX = openingWall.end.x - openingWall.start.x,
        wallDeltaY = openingWall.end.y - openingWall.start.y,
        wallLength = Math.hypot(wallDeltaX, wallDeltaY) / ppm;
      if (!wallLength) continue;
      const halfOpeningWidth = Math.min(opening.width / 2, wallLength / 2),
        openingRatio = Math.max(
          halfOpeningWidth / wallLength,
          Math.min(1 - halfOpeningWidth / wallLength, opening.t || 0),
        );
      placementGroups.push({
        key: openingKind + ":" + opening.id,
        group: "opening",
        parts: [
          createOrientedBox(
            (openingWall.start.x + wallDeltaX * openingRatio) / ppm,
            (openingWall.start.y + wallDeltaY * openingRatio) / ppm,
            opening.width,
            openingWall.thickness || 0.2,
            Math.atan2(wallDeltaY, wallDeltaX),
            opening.sill || 0,
            opening.height,
          ),
        ],
      });
    }
  for (const item of scene.items || []) {
    if (
      (isCourtyardGate(item) &&
        placementGroups.push({
          key: "items:" + item.id,
          group: "gate",
          parts: [
            createOrientedBox(
              item.x / ppm,
              item.y / ppm,
              item.width,
              item.depth || 0.22,
              ((item.rotation || 0) * Math.PI) / 180,
              item.elevation || 0,
              item.height || 1.55,
            ),
          ],
        }),
      item.type !== "courtyard-fence")
    )
      continue;
    const planPoints = drawingPlanPoints(item, ppm);
    item.drawing.closed && planPoints.length && planPoints.push(planPoints[0]);
    const segmentParts: any[] = [];
    for (let pointIndex = 1; pointIndex < planPoints.length; pointIndex++) {
      const segmentStart = planPoints[pointIndex - 1],
        segmentEnd = planPoints[pointIndex],
        segmentDeltaX = segmentEnd.x - segmentStart.x,
        segmentDeltaY = segmentEnd.y - segmentStart.y,
        segmentLength = Math.hypot(segmentDeltaX, segmentDeltaY) / ppm;
      segmentLength <= overlapEpsilon ||
        segmentParts.push(
          createOrientedBox(
            (segmentStart.x + segmentEnd.x) / 2 / ppm,
            (segmentStart.y + segmentEnd.y) / 2 / ppm,
            segmentLength,
            (item.drawing.thickness || 0.18) * (item.drawing.style === "hedge" ? 3 : 1),
            Math.atan2(segmentDeltaY, segmentDeltaX),
            item.elevation || 0,
            item.height || 1.2,
          ),
        );
    }
    placementGroups.push({
      key: "items:" + item.id,
      group: "fence",
      parts: segmentParts,
    });
  }
  return placementGroups;
}
function collectSceneOverlaps(overlapScene: any, overlapPpm: any) {
  const groups = buildPlacementGroups(overlapScene, overlapPpm),
    overlapsByPair = new Map();
  for (let groupIndexA = 0; groupIndexA < groups.length; groupIndexA++)
    for (let groupIndexB = groupIndexA; groupIndexB < groups.length; groupIndexB++) {
      const groupA = groups[groupIndexA],
        groupB = groups[groupIndexB];
      if (
        groupA.group !== groupB.group ||
        (groupIndexA === groupIndexB && groupA.group !== "fence")
      )
        continue;
      let overlapAmount = 0;
      for (let partIndexA = 0; partIndexA < groupA.parts.length; partIndexA++)
        for (
          let partIndexB = groupIndexA === groupIndexB ? partIndexA + 1 : 0;
          partIndexB < groupB.parts.length;
          partIndexB++
        )
          overlapAmount += boxOverlapArea(
            groupA.parts[partIndexA],
            groupB.parts[partIndexB],
            groupA.group === "fence",
          );
      overlapAmount > 0 &&
        overlapsByPair.set(JSON.stringify([groupA.key, groupB.key].sort()), {
          amount: overlapAmount,
          group: groupA.group,
        });
    }
  return overlapsByPair;
}
function placementConflict(baselineScene: any, candidateScene: any, conflictPpm = 100) {
  const baselineOverlaps = collectSceneOverlaps(baselineScene, conflictPpm);
  for (const [pairKey, overlapEntry] of collectSceneOverlaps(candidateScene, conflictPpm))
    if (!(overlapEntry.amount <= (baselineOverlaps.get(pairKey)?.amount || 0) + 1e-8))
      return overlapEntry.group === "opening"
        ? "该位置与已有门、窗户或栏杆重叠，请调整位置或尺寸。"
        : overlapEntry.group === "gate"
          ? "该位置与已有庭院门重叠，请调整位置或尺寸。"
          : "围挡与已有围挡或自身线段重叠，请调整路线、位置或尺寸。";
  return "";
}
export function restorePlacementScene(targetScene: any, sourceScene: any) {
  for (const collectionKey of ["items", "walls", "doors", "windows", "railings"]) {
    if (!sourceScene[collectionKey]) continue;
    const existingById = new Map(
      (targetScene[collectionKey] || []).map((targetEntry: any) => [targetEntry.id, targetEntry]),
    );
    targetScene[collectionKey] = sourceScene[collectionKey].map((sourceEntry: any) => {
      const currentEntry = existingById.get(sourceEntry.id) || {};
      for (const propertyKey of Object.keys(currentEntry)) delete (currentEntry as any)[propertyKey];
      return Object.assign(currentEntry, structuredClone(sourceEntry));
    });
  }
}
export function validatePlacementChange(savedScene: any, draftScene: any, changePpm = 100) {
  syncCourtyardGates(draftScene.items || [], changePpm);
  const conflictMessage = placementConflict(savedScene, draftScene, changePpm);
  return (conflictMessage && restorePlacementScene(draftScene, savedScene), conflictMessage);
}
