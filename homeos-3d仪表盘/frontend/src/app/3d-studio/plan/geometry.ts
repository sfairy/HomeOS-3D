export function clamp(rawValue, minValue, maxValue) {
  return Math.min(maxValue, Math.max(minValue, rawValue));
}
export function spotLightBrightnessResponse(lightType = "downlight", rawBrightness = 0) {
  const normalizedBrightness = clamp(Number(rawBrightness) || 0, 0, 1),
    squaredBrightness = normalizedBrightness * normalizedBrightness;
  if (lightType !== "ceilinglight" || normalizedBrightness <= 0 || normalizedBrightness >= 0.35)
    return squaredBrightness;
  const spillLight = 0.08 * normalizedBrightness * (1 - normalizedBrightness / 0.35);
  return squaredBrightness + spillLight;
}

export function adaptiveLightRenderCost(lights = []) {
  return lights.reduce(
    (accumulatedCost, light) =>
      light?.enabled === false || Math.max(0, Number(light?.brightness) || 0) <= 0
        ? accumulatedCost
        : light?.type === "striplight"
          ? accumulatedCost + 0.3
          : light?.type === "ceilinglight"
            ? accumulatedCost + (Number(light?.angle) >= 140 ? 1.65 : 1.1)
            : light?.type === "downlight"
              ? accumulatedCost + 1
              : accumulatedCost,
    0,
  );
}
export function adaptiveDeviceLightBudget({
  hardwareConcurrency = 4,
  deviceMemory = 8,
  previewPixels = 500000,
} = {}) {
  const concurrencyCount = clamp(Number(hardwareConcurrency) || 4, 2, 24),
    memoryGb = clamp(Number(deviceMemory) || 8, 2, 32),
    previewPixelCount = clamp(Number(previewPixels) || 500000, 120000, 4000000),
    baseFrameCost = 4.5 + Math.min(concurrencyCount, 16) * 0.55,
    memoryFactor = memoryGb <= 4 ? 0.78 : memoryGb < 8 ? 0.88 : memoryGb >= 16 ? 1.1 : 1,
    resolutionFactor = clamp(Math.sqrt(500000 / previewPixelCount), 0.72, 1.2);
  return clamp(baseFrameCost * memoryFactor * resolutionFactor, 4, 16);
}
export function assessAdaptiveRenderFrames(frameTimes = []) {
  const validFrameTimes = frameTimes
    .map(Number)
    .filter(
      (frameTimeMs) => Number.isFinite(frameTimeMs) && frameTimeMs >= 8 && frameTimeMs <= 120,
    );
  if (validFrameTimes.length < 12)
    return {
      sufficient: false,
      sampleCount: validFrameTimes.length,
    };
  const sortedFrameTimes = [...validFrameTimes].sort(
      (leftFrameMs, rightFrameMs) => leftFrameMs - rightFrameMs,
    ),
    sampleAtQuantile = (quantile) =>
      sortedFrameTimes[
        Math.min(Math.floor((sortedFrameTimes.length - 1) * quantile), sortedFrameTimes.length - 1)
      ],
    averageFrameMs =
      validFrameTimes.reduce((runningTotal, frameMs) => runningTotal + frameMs, 0) /
      validFrameTimes.length,
    p75FrameMs = sampleAtQuantile(0.75),
    p90FrameMs = sampleAtQuantile(0.9);
  return {
    sufficient: true,
    sampleCount: validFrameTimes.length,
    averageFrameMs: averageFrameMs,
    p75FrameMs: p75FrameMs,
    p90FrameMs: p90FrameMs,
    fps: 1000 / averageFrameMs,
    severe: averageFrameMs >= 45 || p75FrameMs >= 50 || p90FrameMs >= 68,
    slow: averageFrameMs >= 34 || p75FrameMs >= 38 || p90FrameMs >= 55,
    smooth: averageFrameMs <= 24 && p90FrameMs <= 32,
  };
}
export function planLabelProjectionMetrics(planWidthPx, planHeightPx, baselineRatio = 0.86) {
  const widthPx = Math.max(0, Number(planWidthPx) || 0),
    heightPx = Math.max(0, Number(planHeightPx) || 0),
    clampedBaselineRatio = clamp(
      Number.isFinite(Number(baselineRatio)) ? Number(baselineRatio) : 0.86,
      0.3,
      1,
    );
  return {
    titleStartX: -widthPx * (0.5 - 115 / 2048),
    titleY: heightPx * (130 / 640 - 0.5),
    titleFontSize: (heightPx * 184) / 640,
    titleMaxWidth: (widthPx * 1340) / 2048,
    iconX: widthPx * (1580 / 2048 - 0.5),
    iconY: heightPx * (130 / 640 - 0.5),
    iconSize: (heightPx * 170) / 640,
    subtitleStartX: -widthPx * (0.5 - 72 / 2048),
    subtitleY: heightPx * (410 / 640 - 0.5),
    subtitleFontSize: (heightPx * 310) / 640,
    subtitleMaxWidth: (widthPx * 1880) / 2048,
    baselineY: heightPx * (590 / 640 - 0.5),
    baselineStartX: -widthPx * (0.5 - 74 / 2048),
    baselineLength: ((widthPx * 1880) / 2048) * clampedBaselineRatio,
    baselineLineWidth: (heightPx * 16) / 640,
    baselineCapHalfHeight: (heightPx * 24) / 640,
  };
}
export function selectShadowCastingLightIds(lightEntries = [], maxLightCount = 8) {
  const lightLimit = Math.max(0, Math.floor(Number(maxLightCount) || 0));
  if (lightLimit === 0) return [];
  const normalizedLights = lightEntries
    .map((sourceLight, lightIndex) => ({
      id: String(sourceLight?.id || ""),
      groupId: String(sourceLight?.groupId || ""),
      type: String(sourceLight?.type || ""),
      brightness: Math.max(0, Number(sourceLight?.brightness) || 0),
      enabled: sourceLight?.enabled !== false,
      index: lightIndex,
    }))
    .filter(
      (isShadowCastingLight) =>
        isShadowCastingLight.id &&
        isShadowCastingLight.enabled &&
        isShadowCastingLight.brightness > 0 &&
        isShadowCastingLight.type !== "striplight",
    )
    .map((scoredLight) => ({
      ...scoredLight,
      score: scoredLight.brightness * (scoredLight.type === "ceilinglight" ? 1.08 : 1),
    }));
  if (normalizedLights.length <= lightLimit)
    return normalizedLights.map((mappedLight) => mappedLight.id);
  const compareLights = (leftLight, rightLight) =>
      rightLight.score - leftLight.score || leftLight.index - rightLight.index,
    bestLightByGroup = new Map();
  for (const groupLight of normalizedLights) {
    const groupKey = groupLight.groupId || "__ungrouped-" + groupLight.index,
      currentBestLight = bestLightByGroup.get(groupKey);
    (!currentBestLight || compareLights(groupLight, currentBestLight) < 0) &&
      bestLightByGroup.set(groupKey, groupLight);
  }
  const selectedLights = [...bestLightByGroup.values()].sort(compareLights).slice(0, lightLimit);
  if (selectedLights.length < lightLimit) {
    const selectedLightIdSet = new Set(selectedLights.map((pickedLight) => pickedLight.id)),
      remainingLights = normalizedLights
        .filter((remainingLight) => !selectedLightIdSet.has(remainingLight.id))
        .sort(compareLights);
    selectedLights.push(...remainingLights.slice(0, lightLimit - selectedLights.length));
  }
  return selectedLights.map((selectedLight) => selectedLight.id);
}
export function spotShadowTextureUnitLimit({
  maxTextureUnits = 16,
  materialTextureUnits = 0,
  nonSpotShadowTextureUnits = 1,
  rectAreaLightTextureUnits = 0,
  reservedTextureUnits = 1,
  hardLimit = 8,
} = {}) {
  const availableTextureUnits = Math.max(0, Math.floor(Number(maxTextureUnits) || 0)),
    reservedTextureUnitTotal = [
      materialTextureUnits,
      nonSpotShadowTextureUnits,
      rectAreaLightTextureUnits,
      reservedTextureUnits,
    ].reduce(
      (textureUnitTotal, textureUnitCount) =>
        textureUnitTotal + Math.max(0, Math.floor(Number(textureUnitCount) || 0)),
      0,
    ),
    hardLimitValue = Math.max(0, Math.floor(Number(hardLimit) || 0)),
    softTextureLimit =
      availableTextureUnits <= 16 ? 3 : availableTextureUnits <= 24 ? 6 : hardLimitValue;
  return Math.min(
    hardLimitValue,
    softTextureLimit,
    Math.max(0, availableTextureUnits - reservedTextureUnitTotal),
  );
}
export function localSpotShadowSettings(
  fixtureType = "downlight",
  shadowRangeMeters = 3.5,
  spotAngleDeg = 90,
) {
  const shadowRange = clamp(
      Number.isFinite(Number(shadowRangeMeters)) ? Number(shadowRangeMeters) : 3.5,
      0.5,
      10,
    ),
    clampedAngleDeg = clamp(
      Number.isFinite(Number(spotAngleDeg)) ? Number(spotAngleDeg) : 90,
      15,
      180,
    ),
    usesWideShadowMap = fixtureType === "ceilinglight" && clampedAngleDeg >= 140;
  return {
    mapSize: usesWideShadowMap ? 512 : 256,
    radius: usesWideShadowMap ? 1.25 : 1,
    blurSamples: usesWideShadowMap ? 8 : 4,
    normalBias: 0.018,
    wideCeilingLight: usesWideShadowMap,
    range: shadowRange,
    angle: clampedAngleDeg,
  };
}
export function distance(firstPoint, secondPoint) {
  return Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y);
}
/** 玻璃推拉门的**展示开度**（0 = 两扇对齐合拢，1 = 活动扇完全叠到固定扇上）。 */
export const SLIDING_DOOR_DISPLAY_OPEN_RATIO = 0.8;

export function slidingDoorPanelCenters(
  doorWidth,
  slideDirection = -1,
  openRatio = SLIDING_DOOR_DISPLAY_OPEN_RATIO,
) {
  const fixedPanelCenter = (slideDirection >= 0 ? 1 : -1) * doorWidth * 0.23,
    movingPanelCenter = -fixedPanelCenter;
  return {
    fixed: fixedPanelCenter,
    moving: movingPanelCenter + (fixedPanelCenter - movingPanelCenter) * clamp(openRatio, 0, 1),
  };
}
export function projectPointToSegment(point, segmentStart, segmentEnd) {
  const segmentDeltaX = segmentEnd.x - segmentStart.x,
    segmentDeltaY = segmentEnd.y - segmentStart.y,
    segmentLengthSquared = segmentDeltaX * segmentDeltaX + segmentDeltaY * segmentDeltaY;
  if (segmentLengthSquared <= 1e-7)
    return {
      point: {
        ...segmentStart,
      },
      t: 0,
      distance: distance(point, segmentStart),
    };
  const projectionRatio = clamp(
      ((point.x - segmentStart.x) * segmentDeltaX + (point.y - segmentStart.y) * segmentDeltaY) /
        segmentLengthSquared,
      0,
      1,
    ),
    projectedPoint = {
      x: segmentStart.x + segmentDeltaX * projectionRatio,
      y: segmentStart.y + segmentDeltaY * projectionRatio,
    };
  return {
    point: projectedPoint,
    t: projectionRatio,
    distance: distance(point, projectedPoint),
  };
}
export function segmentIntersection(firstStart, firstEnd, secondStart, secondEnd) {
  const firstDeltaX = firstEnd.x - firstStart.x,
    firstDeltaY = firstEnd.y - firstStart.y,
    secondDeltaX = secondEnd.x - secondStart.x,
    secondDeltaY = secondEnd.y - secondStart.y,
    crossProduct = firstDeltaX * secondDeltaY - firstDeltaY * secondDeltaX;
  if (Math.abs(crossProduct) <= 1e-7) return null;
  const startOffsetX = secondStart.x - firstStart.x,
    startOffsetY = secondStart.y - firstStart.y,
    firstParam = (startOffsetX * secondDeltaY - startOffsetY * secondDeltaX) / crossProduct,
    secondParam = (startOffsetX * firstDeltaY - startOffsetY * firstDeltaX) / crossProduct;
  return firstParam < -1e-7 ||
    firstParam > 1 + 1e-7 ||
    secondParam < -1e-7 ||
    secondParam > 1 + 1e-7
    ? null
    : {
        x: firstStart.x + firstDeltaX * clamp(firstParam, 0, 1),
        y: firstStart.y + firstDeltaY * clamp(firstParam, 0, 1),
      };
}
export function wallIntersections(walls) {
  const intersectionPoints = [];
  for (let firstWallIndex = 0; firstWallIndex < walls.length; firstWallIndex += 1)
    for (
      let secondWallIndex = firstWallIndex + 1;
      secondWallIndex < walls.length;
      secondWallIndex += 1
    ) {
      const wallIntersectionPoint = segmentIntersection(
        walls[firstWallIndex].start,
        walls[firstWallIndex].end,
        walls[secondWallIndex].start,
        walls[secondWallIndex].end,
      );
      !wallIntersectionPoint ||
        intersectionPoints.some(
          (existingPoint) => distance(existingPoint, wallIntersectionPoint) <= 1e-7,
        ) ||
        intersectionPoints.push(wallIntersectionPoint);
    }
  return intersectionPoints;
}
export function splitWallSegments(wallSegments, minSplitGap = 0.000001) {
  const splitGap = Math.max(Number(minSplitGap) || 0, 1e-7),
    wallSplitParams = wallSegments.map(() => [0, 1]);
  for (let wallIndex = 0; wallIndex < wallSegments.length; wallIndex += 1)
    for (
      let otherWallIndex = wallIndex + 1;
      otherWallIndex < wallSegments.length;
      otherWallIndex += 1
    ) {
      const currentWall = wallSegments[wallIndex],
        otherWall = wallSegments[otherWallIndex],
        wallCrossingPoint = segmentIntersection(
          currentWall.start,
          currentWall.end,
          otherWall.start,
          otherWall.end,
        );
      if (!wallCrossingPoint) continue;
      const currentProjection = projectPointToSegment(
          wallCrossingPoint,
          currentWall.start,
          currentWall.end,
        ),
        otherProjection = projectPointToSegment(wallCrossingPoint, otherWall.start, otherWall.end);
      (currentProjection.t > splitGap &&
        currentProjection.t < 1 - splitGap &&
        wallSplitParams[wallIndex].push(currentProjection.t),
        otherProjection.t > splitGap &&
          otherProjection.t < 1 - splitGap &&
          wallSplitParams[otherWallIndex].push(otherProjection.t));
    }
  const wallSegmentPieces = [];
  return (
    wallSegments.forEach((wallItem, sourceWallIndex) => {
      const wallDeltaX = wallItem.end.x - wallItem.start.x,
        wallDeltaY = wallItem.end.y - wallItem.start.y,
        sortedSplitParams = [...wallSplitParams[sourceWallIndex]]
          .sort((leftParam, rightParam) => leftParam - rightParam)
          .filter(
            (splitParam, paramIndex, paramList) =>
              paramIndex === 0 || splitParam - paramList[paramIndex - 1] > splitGap,
          );
      for (let splitIndex = 0; splitIndex < sortedSplitParams.length - 1; splitIndex += 1) {
        const startT = sortedSplitParams[splitIndex],
          endT = sortedSplitParams[splitIndex + 1];
        endT - startT <= splitGap ||
          wallSegmentPieces.push({
            sourceWall: wallItem,
            sourceIndex: sourceWallIndex,
            pieceIndex: splitIndex,
            pieceCount: sortedSplitParams.length - 1,
            startT: startT,
            endT: endT,
            start: {
              x: wallItem.start.x + wallDeltaX * startT,
              y: wallItem.start.y + wallDeltaY * startT,
            },
            end: {
              x: wallItem.start.x + wallDeltaX * endT,
              y: wallItem.start.y + wallDeltaY * endT,
            },
          });
      }
    }),
    wallSegmentPieces
  );
}
export function uncoveredCollinearWallSegments(
  wallSegment,
  coveredSegments,
  collinearTolerance = 0.001,
) {
  if (!wallSegment?.start || !wallSegment?.end) return [];
  const toleranceValue = Math.max(Number(collinearTolerance) || 0, 1e-7),
    wallVectorX = wallSegment.end.x - wallSegment.start.x,
    wallVectorY = wallSegment.end.y - wallSegment.start.y,
    wallLength = Math.hypot(wallVectorX, wallVectorY);
  if (wallLength <= toleranceValue) return [];
  const wallUnitVector = {
      x: wallVectorX / wallLength,
      y: wallVectorY / wallLength,
    },
    normalizedTolerance = toleranceValue / wallLength,
    coveredRanges = [];
  for (const coveredSegment of coveredSegments || []) {
    if (!coveredSegment?.start || !coveredSegment?.end || coveredSegment.id === wallSegment.id)
      continue;
    const coveredDeltaX = coveredSegment.end.x - coveredSegment.start.x,
      coveredDeltaY = coveredSegment.end.y - coveredSegment.start.y,
      coveredLength = Math.hypot(coveredDeltaX, coveredDeltaY);
    if (
      coveredLength <= toleranceValue ||
      Math.abs(
        (wallUnitVector.x * coveredDeltaY) / coveredLength -
          (wallUnitVector.y * coveredDeltaX) / coveredLength,
      ) > normalizedTolerance
    )
      continue;
    const coveredStartVector = {
        x: coveredSegment.start.x - wallSegment.start.x,
        y: coveredSegment.start.y - wallSegment.start.y,
      },
      coveredEndVector = {
        x: coveredSegment.end.x - wallSegment.start.x,
        y: coveredSegment.end.y - wallSegment.start.y,
      },
      startOffsetCross = Math.abs(
        coveredStartVector.x * wallUnitVector.y - coveredStartVector.y * wallUnitVector.x,
      ),
      endOffsetCross = Math.abs(
        coveredEndVector.x * wallUnitVector.y - coveredEndVector.y * wallUnitVector.x,
      );
    if (Math.max(startOffsetCross, endOffsetCross) > toleranceValue) continue;
    const startProjection =
        (coveredStartVector.x * wallUnitVector.x + coveredStartVector.y * wallUnitVector.y) /
        wallLength,
      endProjection =
        (coveredEndVector.x * wallUnitVector.x + coveredEndVector.y * wallUnitVector.y) /
        wallLength,
      rangeStart = clamp(Math.min(startProjection, endProjection), 0, 1),
      rangeEnd = clamp(Math.max(startProjection, endProjection), 0, 1);
    rangeEnd - rangeStart > normalizedTolerance && coveredRanges.push([rangeStart, rangeEnd]);
  }
  if (!coveredRanges.length)
    return [
      {
        start: {
          ...wallSegment.start,
        },
        end: {
          ...wallSegment.end,
        },
      },
    ];
  coveredRanges.sort((leftRange, rightRange) => leftRange[0] - rightRange[0]);
  const mergedRanges = [];
  for (const rangeEntry of coveredRanges) {
    const lastMergedRange = mergedRanges.at(-1);
    lastMergedRange && rangeEntry[0] <= lastMergedRange[1] + normalizedTolerance
      ? (lastMergedRange[1] = Math.max(lastMergedRange[1], rangeEntry[1]))
      : mergedRanges.push([...rangeEntry]);
  }
  const gapRanges = [];
  let gapStart = 0;
  for (const [mergedStart, mergedEnd] of mergedRanges)
    (mergedStart - gapStart > normalizedTolerance && gapRanges.push([gapStart, mergedStart]),
      (gapStart = Math.max(gapStart, mergedEnd)));
  return (
    1 - gapStart > normalizedTolerance && gapRanges.push([gapStart, 1]),
    gapRanges.map(([gapStartT, gapEndT]) => ({
      start: {
        x: wallSegment.start.x + wallVectorX * gapStartT,
        y: wallSegment.start.y + wallVectorY * gapStartT,
      },
      end: {
        x: wallSegment.start.x + wallVectorX * gapEndT,
        y: wallSegment.start.y + wallVectorY * gapEndT,
      },
    }))
  );
}
export function canonicalPolygonKey(points, precision = 5) {
  if (!Array.isArray(points) || !points.length) return "";
  const precisionDigits = clamp(Math.round(Number(precision) || 0), 0, 12),
    normalizedPoints = points.map((polygonPoint) => {
      const normalizedX =
          Math.abs(Number(polygonPoint?.x) || 0) < 10 ** -precisionDigits / 2
            ? 0
            : Number(polygonPoint?.x) || 0,
        normalizedY =
          Math.abs(Number(polygonPoint?.y) || 0) < 10 ** -precisionDigits / 2
            ? 0
            : Number(polygonPoint?.y) || 0;
      return normalizedX.toFixed(precisionDigits) + "," + normalizedY.toFixed(precisionDigits);
    }),
    rotationKeys = [];
  for (const pointSequence of [normalizedPoints, [...normalizedPoints].reverse()])
    for (let rotationOffset = 0; rotationOffset < pointSequence.length; rotationOffset += 1)
      rotationKeys.push(
        [...pointSequence.slice(rotationOffset), ...pointSequence.slice(0, rotationOffset)].join(
          ";",
        ),
      );
  return rotationKeys.sort()[0];
}
function findSharedCorner(cornerMapA, cornerMapB, matchTolerance) {
  const matchedPairs = [
    {
      firstKey: "start",
      secondKey: "start",
    },
    {
      firstKey: "start",
      secondKey: "end",
    },
    {
      firstKey: "end",
      secondKey: "start",
    },
    {
      firstKey: "end",
      secondKey: "end",
    },
  ].filter(
    ({ firstKey: firstKey, secondKey: secondKey }) =>
      distance(cornerMapA[firstKey], cornerMapB[secondKey]) <= matchTolerance,
  );
  if (matchedPairs.length !== 1) return null;
  const matchedPair = matchedPairs[0];
  return {
    point: {
      x: (cornerMapA[matchedPair.firstKey].x + cornerMapB[matchedPair.secondKey].x) / 2,
      y: (cornerMapA[matchedPair.firstKey].y + cornerMapB[matchedPair.secondKey].y) / 2,
    },
    firstKey: matchedPair.firstKey,
    secondKey: matchedPair.secondKey,
    firstOuter: cornerMapA[matchedPair.firstKey === "start" ? "end" : "start"],
    secondOuter: cornerMapB[matchedPair.secondKey === "start" ? "end" : "start"],
  };
}
function isSameWallAppearance(wallAppearanceA, wallAppearanceB, appearanceTolerance) {
  const opacityA =
      wallAppearanceA.opacity === null || wallAppearanceA.opacity === undefined
        ? null
        : Number(wallAppearanceA.opacity),
    opacityB =
      wallAppearanceB.opacity === null || wallAppearanceB.opacity === undefined
        ? null
        : Number(wallAppearanceB.opacity),
    isMatchingProfile =
      opacityA === null || opacityB === null
        ? opacityA === opacityB
        : Math.abs(opacityA - opacityB) <= appearanceTolerance;
  return (
    Math.abs((Number(wallAppearanceA.height) || 0) - (Number(wallAppearanceB.height) || 0)) <=
      appearanceTolerance &&
    Math.abs((Number(wallAppearanceA.thickness) || 0) - (Number(wallAppearanceB.thickness) || 0)) <=
      appearanceTolerance &&
    isMatchingProfile &&
    (wallAppearanceA.allowOpenEnd === true) == (wallAppearanceB.allowOpenEnd === true)
  );
}
function countNearbyWallEndpoints(wallList, queryPoint, proximityTolerance) {
  return wallList.reduce(
    (matchCount, wallEntry) =>
      matchCount +
      (distance(wallEntry.wall.start, queryPoint) <= proximityTolerance ? 1 : 0) +
      (distance(wallEntry.wall.end, queryPoint) <= proximityTolerance ? 1 : 0),
    0,
  );
}
function isCornerAngleValid(corner, cornerTolerance) {
  const firstOuterVector = pointDelta(corner.firstOuter, corner.point),
    secondOuterVector = pointDelta(corner.secondOuter, corner.point),
    firstOuterLength = Math.hypot(firstOuterVector.x, firstOuterVector.y),
    secondOuterLength = Math.hypot(secondOuterVector.x, secondOuterVector.y);
  if (firstOuterLength <= cornerTolerance || secondOuterLength <= cornerTolerance) return false;
  const outerCrossMagnitude = Math.abs(cross2d(firstOuterVector, secondOuterVector));
  return (
    firstOuterVector.x * secondOuterVector.x + firstOuterVector.y * secondOuterVector.y < 0 &&
    outerCrossMagnitude <= cornerTolerance * Math.max(firstOuterLength, secondOuterLength, 1)
  );
}
export function mergeCollinearWallSegments(wallEntries, mergeTolerance = 0.000001) {
  const mergeGap = Math.max(Number(mergeTolerance) || 0, 1e-7),
    filteredWalls = (wallEntries || [])
      .filter(
        (wallCandidate) =>
          wallCandidate?.start &&
          wallCandidate?.end &&
          distance(wallCandidate.start, wallCandidate.end) > mergeGap,
      )
      .map((normalizedWall) => ({
        wall: {
          ...normalizedWall,
          start: {
            ...normalizedWall.start,
          },
          end: {
            ...normalizedWall.end,
          },
        },
        sourceIds: new Set([normalizedWall.id]),
      }));
  let hasMerged = true;
  for (; hasMerged;) {
    hasMerged = false;
    for (let firstIndex = 0; firstIndex < filteredWalls.length && !hasMerged; firstIndex += 1)
      for (let secondIndex = firstIndex + 1; secondIndex < filteredWalls.length; secondIndex += 1) {
        const firstEntry = filteredWalls[firstIndex],
          secondEntry = filteredWalls[secondIndex];
        if (!isSameWallAppearance(firstEntry.wall, secondEntry.wall, mergeGap)) continue;
        const sharedCorner = findSharedCorner(firstEntry.wall, secondEntry.wall, mergeGap);
        if (
          !sharedCorner ||
          countNearbyWallEndpoints(filteredWalls, sharedCorner.point, mergeGap) !== 2 ||
          !isCornerAngleValid(sharedCorner, mergeGap)
        )
          continue;
        const mergedWall = {
          ...firstEntry.wall,
          start:
            sharedCorner.firstKey === "end"
              ? {
                  ...sharedCorner.firstOuter,
                }
              : {
                  ...sharedCorner.secondOuter,
                },
          end:
            sharedCorner.firstKey === "end"
              ? {
                  ...sharedCorner.secondOuter,
                }
              : {
                  ...sharedCorner.firstOuter,
                },
        };
        ((filteredWalls[firstIndex] = {
          wall: mergedWall,
          sourceIds: new Set([...firstEntry.sourceIds, ...secondEntry.sourceIds]),
        }),
          filteredWalls.splice(secondIndex, 1),
          (hasMerged = true));
        break;
      }
  }
  const wallIdBySourceId = new Map();
  for (const mergedWallEntry of filteredWalls)
    for (const sourceId of mergedWallEntry.sourceIds)
      wallIdBySourceId.set(sourceId, mergedWallEntry.wall.id);
  return {
    walls: filteredWalls.map((entry) => entry.wall),
    wallIdMap: wallIdBySourceId,
  };
}
export function remapWallAttachment(attachment, sourceWall, targetWall) {
  if (!attachment || !sourceWall || !targetWall) return attachment;
  const attachmentT = clamp(Number(attachment.t) || 0, 0, 1),
    remappedPoint = lerpPoint(sourceWall.start, sourceWall.end, attachmentT);
  return {
    ...attachment,
    wallId: targetWall.id,
    t: clamp(projectPointToSegment(remappedPoint, targetWall.start, targetWall.end).t, 0, 1),
  };
}
function findClosestAnchor(probePoint, anchorCandidates, maxAnchorDistance) {
  let bestAnchor = null;
  for (const anchorCandidate of anchorCandidates) {
    const anchorDistance = distance(probePoint, anchorCandidate.point);
    anchorDistance > maxAnchorDistance ||
      (bestAnchor && anchorDistance >= bestAnchor.distance) ||
      (bestAnchor = {
        ...anchorCandidate,
        distance: anchorDistance,
      });
  }
  return bestAnchor;
}
export function axisLockedPoint(inputPoint, lockedReferencePoint) {
  const axisDeltaX = inputPoint.x - lockedReferencePoint.x,
    axisDeltaY = inputPoint.y - lockedReferencePoint.y;
  return Math.abs(axisDeltaX) > Math.abs(axisDeltaY)
    ? {
        point: {
          x: inputPoint.x,
          y: lockedReferencePoint.y,
        },
        axis: "horizontal",
        label: "水平轴",
      }
    : {
        point: {
          x: lockedReferencePoint.x,
          y: inputPoint.y,
        },
        axis: "vertical",
        label: "垂直轴",
      };
}
function findNearestSegmentHit(
  originProbePoint,
  axisAnchorPoint,
  segmentCandidates,
  maxHitDistance,
  lockAxis,
) {
  let bestHit = null;
  for (const segmentCandidate of segmentCandidates) {
    const axisKey = lockAxis === "vertical" ? "x" : "y",
      crossAxisKey = lockAxis === "vertical" ? "y" : "x",
      segmentSpan = segmentCandidate.end[axisKey] - segmentCandidate.start[axisKey];
    if (Math.abs(segmentSpan) <= 1e-7) {
      if (Math.abs(segmentCandidate.start[axisKey] - axisAnchorPoint[axisKey]) > 1e-7) continue;
      const projectionHit = projectPointToSegment(
        originProbePoint,
        segmentCandidate.start,
        segmentCandidate.end,
      );
      if (
        projectionHit.distance > maxHitDistance ||
        (bestHit && projectionHit.distance >= bestHit.distance)
      )
        continue;
      bestHit = {
        point: {
          ...projectionHit.point,
          [axisKey]: axisAnchorPoint[axisKey],
        },
        kind: "segment",
        targetId: segmentCandidate.id,
        label: (lockAxis === "vertical" ? "垂直" : "水平") + " · 墙线",
        distance: projectionHit.distance,
      };
      continue;
    }
    const spanRatio = (axisAnchorPoint[axisKey] - segmentCandidate.start[axisKey]) / segmentSpan;
    if (spanRatio < -1e-7 || spanRatio > 1 + 1e-7) continue;
    const hitPoint = {
      ...axisAnchorPoint,
    };
    hitPoint[crossAxisKey] =
      segmentCandidate.start[crossAxisKey] +
      (segmentCandidate.end[crossAxisKey] - segmentCandidate.start[crossAxisKey]) *
        clamp(spanRatio, 0, 1);
    const hitDistance = distance(originProbePoint, hitPoint);
    hitDistance > maxHitDistance ||
      (bestHit && hitDistance >= bestHit.distance) ||
      (bestHit = {
        point: hitPoint,
        kind: "segment",
        targetId: segmentCandidate.id,
        label: (lockAxis === "vertical" ? "垂直" : "水平") + " · 墙线",
        distance: hitDistance,
      });
  }
  return bestHit;
}
function findAlignedSegmentHit(
  alignedProbePoint,
  alignmentAnchor,
  alignedSegmentCandidates,
  alignmentTolerance,
) {
  if (!alignmentAnchor || Math.abs(alignedProbePoint.x - alignmentAnchor.x) > alignmentTolerance)
    return null;
  const verticalHit = findNearestSegmentHit(
    alignedProbePoint,
    alignmentAnchor,
    alignedSegmentCandidates,
    alignmentTolerance,
    "vertical",
  );
  return (
    verticalHit || {
      point: {
        x: alignmentAnchor.x,
        y: alignedProbePoint.y,
      },
      kind: "axis",
      label: "垂直轴",
      distance: Math.abs(alignedProbePoint.x - alignmentAnchor.x),
    }
  );
}
function resolveWallAttachment(
  sourcePoint,
  anchorPoint,
  wallSegmentsForHit,
  endpointTolerance,
  precomputedIntersections = wallIntersections(wallSegmentsForHit),
  snapOptions: PointSnapOptions = {},
) {
  const axisLock = axisLockedPoint(sourcePoint, anchorPoint),
    axisCoordinateKey = axisLock.axis === "vertical" ? "x" : "y",
    filterTolerance = Math.max(1e-7, endpointTolerance * 0.000001),
    axisLabel = axisLock.axis === "vertical" ? "垂直" : "水平",
    endpointCandidates = [
      ...(snapOptions.snapEndpoints === false
        ? []
        : wallSegmentsForHit.flatMap((sourceWallSegment) => [
            {
              point: sourceWallSegment.start,
              kind: "endpoint",
              targetId: sourceWallSegment.id,
              label: axisLabel + " · 端点",
            },
            {
              point: sourceWallSegment.end,
              kind: "endpoint",
              targetId: sourceWallSegment.id,
              label: axisLabel + " · 端点",
            },
          ])),
      ...(snapOptions.snapIntersections === false
        ? []
        : precomputedIntersections.map((intersectionPoint) => ({
            point: intersectionPoint,
            kind: "intersection",
            label: axisLabel + " · 交点",
          }))),
    ].filter(
      (endpointCandidate) =>
        Math.abs(endpointCandidate.point[axisCoordinateKey] - anchorPoint[axisCoordinateKey]) <=
        filterTolerance,
    ),
    snappedEndpoint = findClosestAnchor(sourcePoint, endpointCandidates, endpointTolerance);
  if (snappedEndpoint) return snappedEndpoint;
  if (snapOptions.snapSegments !== false) {
    const snappedHit = findNearestSegmentHit(
      sourcePoint,
      anchorPoint,
      wallSegmentsForHit,
      endpointTolerance,
      axisLock.axis,
    );
    if (snappedHit) return snappedHit;
  }
  return {
    ...axisLock,
    kind: "axis",
    distance: distance(sourcePoint, axisLock.point),
  };
}
export function snapPoint(
  rawPoint,
  targetWalls,
  pointSnapOptions: PointSnapOptions = {},
) {
  const snapOptions: PointSnapOptions = pointSnapOptions || {},
    zoomScale = Math.max(Number(snapOptions.zoom) || 1, 1e-7),
    worldTolerance = (Number(snapOptions.screenTolerance) || 12) / zoomScale,
    providedIntersections = Array.isArray(snapOptions.intersections)
      ? snapOptions.intersections
      : null;
  if (snapOptions.forceOrthogonalAxis === true && snapOptions.anchor) {
    const resolvedIntersections =
      snapOptions.snapIntersections === false
        ? []
        : providedIntersections || wallIntersections(targetWalls);
    return resolveWallAttachment(
      rawPoint,
      snapOptions.anchor,
      targetWalls,
      worldTolerance,
      resolvedIntersections,
      snapOptions,
    );
  }
  const endpointEntries = [];
  if (snapOptions.snapEndpoints !== false) {
    for (const targetWallItem of targetWalls)
      endpointEntries.push(
        {
          point: targetWallItem.start,
          kind: "endpoint",
          targetId: targetWallItem.id,
          label: "端点",
        },
        {
          point: targetWallItem.end,
          kind: "endpoint",
          targetId: targetWallItem.id,
          label: "端点",
        },
      );
  }
  const snappedEndpointHit = findClosestAnchor(rawPoint, endpointEntries, worldTolerance);
  if (snappedEndpointHit) return snappedEndpointHit;
  if (snapOptions.snapIntersections !== false) {
    const closestAnchorHit = findClosestAnchor(
      rawPoint,
      (providedIntersections || wallIntersections(targetWalls)).map((intersectionEndpoint) => ({
        point: intersectionEndpoint,
        kind: "intersection",
        label: "交点",
      })),
      worldTolerance,
    );
    if (closestAnchorHit) return closestAnchorHit;
  }
  if (
    snapOptions.preferVerticalAxis === true &&
    snapOptions.snapOrthogonal !== false &&
    snapOptions.anchor
  ) {
    const alignedSegmentHit = findAlignedSegmentHit(
      rawPoint,
      snapOptions.anchor,
      targetWalls,
      worldTolerance,
    );
    if (alignedSegmentHit) return alignedSegmentHit;
  }
  if (snapOptions.snapSegments !== false) {
    const bestTargetWallHit = targetWalls
      .map((targetWallEntry) => {
        const segmentProjection = projectPointToSegment(
          rawPoint,
          targetWallEntry.start,
          targetWallEntry.end,
        );
        return {
          point: segmentProjection.point,
          kind: "segment",
          targetId: targetWallEntry.id,
          label: "墙线",
          distance: segmentProjection.distance,
        };
      })
      .filter((projectionEntry) => projectionEntry.distance <= worldTolerance)
      .sort(
        (leftProjection, rightProjection) => leftProjection.distance - rightProjection.distance,
      )[0];
    if (bestTargetWallHit) return bestTargetWallHit;
  }
  if (snapOptions.snapAngles !== false && snapOptions.anchor) {
    const anchorOffsetX = rawPoint.x - snapOptions.anchor.x,
      anchorOffsetY = rawPoint.y - snapOptions.anchor.y,
      anchorOffsetLength = Math.hypot(anchorOffsetX, anchorOffsetY);
    if (anchorOffsetLength > 1e-7) {
      const snapAngleStepRadians =
          ((Number(snapOptions.angleStepDegrees) || 15) * Math.PI) / 180,
        rawAnchorAngle = Math.atan2(anchorOffsetY, anchorOffsetX),
        snappedAnchorAngle =
          Math.round(rawAnchorAngle / snapAngleStepRadians) * snapAngleStepRadians,
        rotatedAnchorPoint = {
          x: snapOptions.anchor.x + Math.cos(snappedAnchorAngle) * anchorOffsetLength,
          y: snapOptions.anchor.y + Math.sin(snappedAnchorAngle) * anchorOffsetLength,
        },
        rotatedAnchorDistance = distance(rawPoint, rotatedAnchorPoint);
      if (rotatedAnchorDistance <= worldTolerance) {
        const rotatedAngleDegrees = ((snappedAnchorAngle * 180) / Math.PI + 360) % 360;
        return {
          point: rotatedAnchorPoint,
          kind: "angle",
          label: Math.round(rotatedAngleDegrees) + "°",
          distance: rotatedAnchorDistance,
        };
      }
    }
  }
  const gridStep = Number(snapOptions.gridSize) || 0;
  if (snapOptions.snapGrid !== false && gridStep > 1e-7) {
    const gridSnappedPoint = {
        x: Math.round(rawPoint.x / gridStep) * gridStep,
        y: Math.round(rawPoint.y / gridStep) * gridStep,
      },
      gridSnappedDistance = distance(rawPoint, gridSnappedPoint);
    if (gridSnappedDistance <= worldTolerance)
      return {
        point: gridSnappedPoint,
        kind: "grid",
        label: "网格",
        distance: gridSnappedDistance,
      };
  }
  return {
    point: {
      ...rawPoint,
    },
    kind: null,
    label: "",
    distance: 0,
  };
}
export function nearestWall(wallQueryPoint, wallCandidates, distanceLimit = Infinity) {
  let nearestWallResult = null;
  for (const candidateWall of wallCandidates) {
    const wallProjection = projectPointToSegment(
      wallQueryPoint,
      candidateWall.start,
      candidateWall.end,
    );
    wallProjection.distance > distanceLimit ||
      (nearestWallResult && wallProjection.distance >= nearestWallResult.distance) ||
      (nearestWallResult = {
        wall: candidateWall,
        ...wallProjection,
      });
  }
  return nearestWallResult;
}
export function wallLengthMeters(measuredWall, sceneUnitScale) {
  return (
    distance(measuredWall.start, measuredWall.end) / Math.max(Number(sceneUnitScale) || 1, 1e-7)
  );
}
export function clampWindowT(windowWall, windowOpening, openingUnitScale) {
  const measuredWallLength = wallLengthMeters(windowWall, openingUnitScale);
  if (measuredWallLength <= 1e-7) return 0.5;
  const marginT = Math.min(
    Math.max(Number(windowOpening.width) || 0, 0) / 2,
    measuredWallLength / 2,
  );
  return clamp(
    Number(windowOpening.t) || 0,
    marginT / measuredWallLength,
    1 - marginT / measuredWallLength,
  );
}
export function doorLeafRotation(doorLeaf, swingRadians = Math.PI / 2) {
  return -(doorLeaf?.swing === -1 ? -1 : 1) * swingRadians;
}
export function wallJoinExtensions(joinWalls, endpointEpsilon = 0.001, maxExtensionRatio = 4) {
  const endpointEpsilonValue = Math.max(Number(endpointEpsilon) || 0, 1e-7),
    extensionRatio = Math.max(Number(maxExtensionRatio) || 0, 1),
    endpointsByWallId = Object.fromEntries(
      (joinWalls || []).map((joinWall) => [
        joinWall.id,
        {
          start: 0,
          end: 0,
        },
      ]),
    ),
    junctionGroups = [],
    junctionAt = (junctionPoint) => {
      let existingJunction = junctionGroups.find(
        (candidateJunction) =>
          distance(candidateJunction.point, junctionPoint) <= endpointEpsilonValue,
      );
      return (
        existingJunction ||
          ((existingJunction = {
            point: {
              ...junctionPoint,
            },
            incidents: [],
          }),
          junctionGroups.push(existingJunction)),
        existingJunction
      );
    };
  for (const solidWall of joinWalls || []) {
    const solidWallDeltaX = solidWall.end.x - solidWall.start.x,
      solidWallDeltaY = solidWall.end.y - solidWall.start.y,
      solidWallSpan = Math.hypot(solidWallDeltaX, solidWallDeltaY);
    if (solidWallSpan <= endpointEpsilonValue) continue;
    const halfThickness = Math.max(Number(solidWall.thickness) || 0, 0) / 2;
    (junctionAt(solidWall.start).incidents.push({
      wallId: solidWall.id,
      endpoint: "start",
      x: solidWallDeltaX / solidWallSpan,
      y: solidWallDeltaY / solidWallSpan,
      halfThickness: halfThickness,
    }),
      junctionAt(solidWall.end).incidents.push({
        wallId: solidWall.id,
        endpoint: "end",
        x: -solidWallDeltaX / solidWallSpan,
        y: -solidWallDeltaY / solidWallSpan,
        halfThickness: halfThickness,
      }));
  }
  const ANGLE_EPSILON = 0.0001;
  for (const junctionGroup of junctionGroups) {
    if (junctionGroup.incidents.length < 2) continue;
    const junctionIncidents = junctionGroup.incidents
      .map((incidentVector) => ({
        ...incidentVector,
        angle: Math.atan2(incidentVector.y, incidentVector.x),
      }))
      .sort((leftIncident, rightIncident) => leftIncident.angle - rightIncident.angle);
    for (let incidentIndex = 0; incidentIndex < junctionIncidents.length; incidentIndex += 1) {
      const currentIncident = junctionIncidents[incidentIndex],
        nextIncident = junctionIncidents[(incidentIndex + 1) % junctionIncidents.length],
        incidentAngleGap =
          (nextIncident.angle - currentIncident.angle + Math.PI * 2) % (Math.PI * 2);
      if (incidentAngleGap <= ANGLE_EPSILON || incidentAngleGap >= Math.PI - ANGLE_EPSILON)
        continue;
      const gapSine = Math.sin(incidentAngleGap),
        gapCosine = Math.cos(incidentAngleGap);
      if (gapSine <= ANGLE_EPSILON) continue;
      const joinOffsetBase =
          Math.max(currentIncident.halfThickness, nextIncident.halfThickness, 0.000001) *
          extensionRatio,
        startJoinOffset = clamp(
          (nextIncident.halfThickness + currentIncident.halfThickness * gapCosine) / gapSine,
          0,
          joinOffsetBase,
        ),
        endJoinOffset = clamp(
          (currentIncident.halfThickness + nextIncident.halfThickness * gapCosine) / gapSine,
          0,
          joinOffsetBase,
        );
      ((endpointsByWallId[currentIncident.wallId][currentIncident.endpoint] = Math.max(
        endpointsByWallId[currentIncident.wallId][currentIncident.endpoint],
        startJoinOffset,
      )),
        (endpointsByWallId[nextIncident.wallId][nextIncident.endpoint] = Math.max(
          endpointsByWallId[nextIncident.wallId][nextIncident.endpoint],
          endJoinOffset,
        )));
    }
  }
  return endpointsByWallId;
}
export function wallSolidPieces(solidTargetWall, wallSegmentList, wallUnitScale, wallHeight) {
  const targetWallLength = wallLengthMeters(solidTargetWall, wallUnitScale),
    wallHeightValue = Math.max(Number(wallHeight) || 0, 0);
  if (targetWallLength <= 1e-7 || wallHeightValue <= 1e-7) return [];
  const filteredSegments = wallSegmentList
      .filter((segmentEntry) => segmentEntry.wallId === solidTargetWall.id)
      .map((opening) => {
        const openingWidth = clamp(Number(opening.width) || 0, 0, targetWallLength),
          openingCenter = clampWindowT(solidTargetWall, opening, wallUnitScale) * targetWallLength,
          openingBottom = clamp(Number(opening.sill) || 0, 0, wallHeightValue),
          openingTop = clamp(
            openingBottom + Math.max(Number(opening.height) || 0, 0),
            openingBottom,
            wallHeightValue,
          );
        return {
          start: clamp(openingCenter - openingWidth / 2, 0, targetWallLength),
          end: clamp(openingCenter + openingWidth / 2, 0, targetWallLength),
          bottom: openingBottom,
          top: openingTop,
        };
      })
      .filter(
        (openingPiece) =>
          openingPiece.end - openingPiece.start > 1e-7 &&
          openingPiece.top - openingPiece.bottom > 1e-7,
      ),
    splitPositions = [
      ...new Set([
        0,
        targetWallLength,
        ...filteredSegments.flatMap((solidSegment) => [solidSegment.start, solidSegment.end]),
      ]),
    ].sort((leftPosition, rightPosition) => leftPosition - rightPosition),
    solidPieces = [];
  for (let positionIndex = 0; positionIndex < splitPositions.length - 1; positionIndex += 1) {
    const currentPosition = splitPositions[positionIndex],
      nextPosition = splitPositions[positionIndex + 1];
    if (nextPosition - currentPosition <= 1e-7) continue;
    const positionMidpoint = (currentPosition + nextPosition) / 2,
      coveringSegments = filteredSegments
        .filter(
          (coveringSegment) =>
            positionMidpoint > coveringSegment.start - 1e-7 &&
            positionMidpoint < coveringSegment.end + 1e-7,
        )
        .map((openingSpan) => [openingSpan.bottom, openingSpan.top])
        .sort((leftSpan, rightSpan) => leftSpan[0] - rightSpan[0]);
    if (!coveringSegments.length) {
      solidPieces.push({
        start: currentPosition,
        end: nextPosition,
        bottom: 0,
        top: wallHeightValue,
      });
      continue;
    }
    const mergedSpans = [];
    for (const currentSpan of coveringSegments) {
      const lastSpan = mergedSpans.at(-1);
      lastSpan && currentSpan[0] <= lastSpan[1] + 1e-7
        ? (lastSpan[1] = Math.max(lastSpan[1], currentSpan[1]))
        : mergedSpans.push([...currentSpan]);
    }
    let cursorBottom = 0;
    for (const [spanStart, spanEnd] of mergedSpans)
      (spanStart - cursorBottom > 1e-7 &&
        solidPieces.push({
          start: currentPosition,
          end: nextPosition,
          bottom: cursorBottom,
          top: spanStart,
        }),
        (cursorBottom = Math.max(cursorBottom, spanEnd)));
    wallHeightValue - cursorBottom > 1e-7 &&
      solidPieces.push({
        start: currentPosition,
        end: nextPosition,
        bottom: cursorBottom,
        top: wallHeightValue,
      });
  }
  return solidPieces;
}
/** 点吸附选项。 */
type PointSnapOptions = {
  /** 端点吸附，默认开。 */
  snapEndpoints?: boolean;
  /** 交点吸附，默认开。 */
  snapIntersections?: boolean;
  /** 投影到已有墙线上，默认开。 */
  snapSegments?: boolean;
  /** 角度吸附，默认开（需要 anchor）。 */
  snapAngles?: boolean;
  /** 栅格吸附，默认开（需要 gridSize）。 */
  snapGrid?: boolean;
  /** 正交吸附，默认开。 */
  snapOrthogonal?: boolean;
  /** 优先吸附到垂直轴。 */
  preferVerticalAxis?: boolean;
  /** 强制走轴锁定 + 贴墙分支。 */
  forceOrthogonalAxis?: boolean;
  /** 当前缩放，用于把 screenTolerance 换算成世界容差。 */
  zoom?: number;
  /** 屏幕像素容差，默认 12px。 */
  screenTolerance?: number;
  /** 角度吸附步长（度），默认 15。 */
  angleStepDegrees?: number;
  /** 栅格尺寸（世界单位）。 */
  gridSize?: number;
  /** 吸附锚点。 */
  anchor?: any;
  /** 预计算好的墙线交点，避免重复求交。 */
  intersections?: any[] | null;
};

/** 尺寸缩放限制（resizeRotatedItemFromCorner）。 */
type ResizeSizeLimits = {
  /** 最小边长，默认 0.1。 */
  minimumDimension?: number;
  /** 最小缩放比，默认 0。 */
  minimum?: number;
  /** 最大缩放比，默认正无穷。 */
  maximum?: number;
};

/** resizeRotatedItemFromCorner 的结果矩形； */
type ResizedRectangle = {
  x: number;
  y: number;
  width: number;
  depth: number;
  height?: number;
};

export function pointInRotatedRectangle(testPoint, rotatedRectangle, sizeScale) {
  const rotationRadians = (-(Number(rotatedRectangle.rotation) || 0) * Math.PI) / 180,
    localDeltaX = testPoint.x - rotatedRectangle.x,
    localDeltaY = testPoint.y - rotatedRectangle.y,
    rotatedX = localDeltaX * Math.cos(rotationRadians) - localDeltaY * Math.sin(rotationRadians),
    rotatedY = localDeltaX * Math.sin(rotationRadians) + localDeltaY * Math.cos(rotationRadians),
    halfWidth = (Math.max(Number(rotatedRectangle.width) || 0, 0) * sizeScale) / 2,
    halfDepth = (Math.max(Number(rotatedRectangle.depth) || 0, 0) * sizeScale) / 2;
  return Math.abs(rotatedX) <= halfWidth && Math.abs(rotatedY) <= halfDepth;
}
export function resizeRotatedItemFromCorner(
  sourceRectangle,
  directionVector,
  anchorPosition,
  targetPosition,
  referenceDistance,
  shouldScaleHeight = false,
  sizeLimits: ResizeSizeLimits = {},
) {
  const referenceSpan = Math.max(Number(referenceDistance) || 0, 1e-7),
    directionSignX = directionVector?.x < 0 ? -1 : 1,
    directionSignY = directionVector?.y < 0 ? -1 : 1,
    sourceRotationRadians = (-(Number(sourceRectangle.rotation) || 0) * Math.PI) / 180,
    targetDeltaX = targetPosition.x - anchorPosition.x,
    targetDeltaY = targetPosition.y - anchorPosition.y,
    sourceDeltaX =
      targetDeltaX * Math.cos(sourceRotationRadians) -
      targetDeltaY * Math.sin(sourceRotationRadians),
    sourceDeltaY =
      targetDeltaX * Math.sin(sourceRotationRadians) +
      targetDeltaY * Math.cos(sourceRotationRadians),
    ratioX = (directionSignX * sourceDeltaX) / referenceSpan,
    ratioY = (directionSignY * sourceDeltaY) / referenceSpan,
    minimumDimension = Math.max(Number(sizeLimits.minimumDimension) || 0.1, 1e-7),
    rectangleWidth = Math.max(Number(sourceRectangle.width) || minimumDimension, minimumDimension),
    rectangleDepth = Math.max(Number(sourceRectangle.depth) || minimumDimension, minimumDimension),
    rectangleHeight = Number(sourceRectangle.height);
  let scaledWidth = clamp(ratioX, minimumDimension, 8),
    scaledDepth = clamp(ratioY, minimumDimension, 8),
    dimensionScale = 1;
  if (shouldScaleHeight) {
    const minimumScale = Math.max(Number(sizeLimits.minimum) || 0, 1e-7),
      maximumScale = Math.max(Number(sizeLimits.maximum) || Number.POSITIVE_INFINITY, minimumScale);
    ((dimensionScale = clamp(
      Math.max(ratioX / rectangleWidth, ratioY / rectangleDepth),
      minimumScale,
      maximumScale,
    )),
      (scaledWidth = rectangleWidth * dimensionScale),
      (scaledDepth = rectangleDepth * dimensionScale));
  }
  const scaledHalfWidth = (directionSignX * scaledWidth * referenceSpan) / 2,
    scaledHalfDepth = (directionSignY * scaledDepth * referenceSpan) / 2,
    rectangleRotationRadians = ((Number(sourceRectangle.rotation) || 0) * Math.PI) / 180,
    snappedRectangle: ResizedRectangle = {
      x:
        anchorPosition.x +
        scaledHalfWidth * Math.cos(rectangleRotationRadians) -
        scaledHalfDepth * Math.sin(rectangleRotationRadians),
      y:
        anchorPosition.y +
        scaledHalfWidth * Math.sin(rectangleRotationRadians) +
        scaledHalfDepth * Math.cos(rectangleRotationRadians),
      width: scaledWidth,
      depth: scaledDepth,
    };
  return (
    Number.isFinite(rectangleHeight) &&
      rectangleHeight > 0 &&
      (snappedRectangle.height = shouldScaleHeight
        ? rectangleHeight * dimensionScale
        : rectangleHeight),
    snappedRectangle
  );
}
export function itemRotationFromPointers(
  initialRotation,
  referencePoint,
  firstPointer,
  secondPointer,
  angleStepDegrees = 0,
) {
  const firstPointerAngle = Math.atan2(
      firstPointer.y - referencePoint.y,
      firstPointer.x - referencePoint.x,
    ),
    secondPointerAngle = Math.atan2(
      secondPointer.y - referencePoint.y,
      secondPointer.x - referencePoint.x,
    );
  let rotationDegrees =
    (Number(initialRotation) || 0) + ((secondPointerAngle - firstPointerAngle) * 180) / Math.PI;
  const angleStepValue = Math.max(Number(angleStepDegrees) || 0, 0);
  return (
    angleStepValue > 0 &&
      (rotationDegrees = Math.round(rotationDegrees / angleStepValue) * angleStepValue),
    ((rotationDegrees % 360) + 360) % 360
  );
}
export function polygonArea(polygonPoints) {
  let areaSum = 0;
  for (let vertexIndex = 0; vertexIndex < polygonPoints.length; vertexIndex += 1) {
    const currentVertex = polygonPoints[vertexIndex],
      nextVertex = polygonPoints[(vertexIndex + 1) % polygonPoints.length];
    areaSum += currentVertex.x * nextVertex.y - nextVertex.x * currentVertex.y;
  }
  return areaSum / 2;
}
export function pointInPolygon(polygonTestPoint, polygonVertices, edgeTolerance = 1e-7) {
  if (!Array.isArray(polygonVertices) || polygonVertices.length < 3) return false;
  const edgeToleranceValue = Math.max(Number(edgeTolerance) || 0, 1e-7);
  let isInside = false;
  for (let polygonIndex = 0; polygonIndex < polygonVertices.length; polygonIndex += 1) {
    const segmentStartVertex = polygonVertices[polygonIndex],
      segmentEndVertex = polygonVertices[(polygonIndex + 1) % polygonVertices.length];
    if (
      projectPointToSegment(polygonTestPoint, segmentStartVertex, segmentEndVertex).distance <=
      edgeToleranceValue
    )
      return true;
    if (!(segmentStartVertex.y > polygonTestPoint.y != segmentEndVertex.y > polygonTestPoint.y))
      continue;
    segmentStartVertex.x +
      ((polygonTestPoint.y - segmentStartVertex.y) * (segmentEndVertex.x - segmentStartVertex.x)) /
        (segmentEndVertex.y - segmentStartVertex.y) >
      polygonTestPoint.x && (isInside = !isInside);
  }
  return isInside;
}
function cross2d(firstVector, secondVector) {
  return firstVector.x * secondVector.y - firstVector.y * secondVector.x;
}
function pointDelta(tipPoint, originPoint) {
  return {
    x: tipPoint.x - originPoint.x,
    y: tipPoint.y - originPoint.y,
  };
}
function lerpPoint(startPoint, endPoint, ratio) {
  return {
    x: startPoint.x + (endPoint.x - startPoint.x) * ratio,
    y: startPoint.y + (endPoint.y - startPoint.y) * ratio,
  };
}
function pushClampedT(buckets, bucketIndex, candidateT, tolerance) {
  candidateT < -tolerance ||
    candidateT > 1 + tolerance ||
    buckets[bucketIndex].push(clamp(candidateT, 0, 1));
}
function clampT(loopPoints, distanceTolerance) {
  const dedupedPoints = loopPoints.filter(
    (keptPoint, pointIndex) =>
      pointIndex === 0 || distance(keptPoint, loopPoints[pointIndex - 1]) > distanceTolerance,
  );
  if (
    (dedupedPoints.length > 1 &&
      distance(dedupedPoints[0], dedupedPoints.at(-1)) <= distanceTolerance &&
      dedupedPoints.pop(),
    dedupedPoints.length < 3)
  )
    return [];
  let hasRemovedPoint = true;
  for (; hasRemovedPoint && dedupedPoints.length >= 3;) {
    hasRemovedPoint = false;
    for (let loopIndex = 0; loopIndex < dedupedPoints.length; loopIndex += 1) {
      const previousPoint =
          dedupedPoints[(loopIndex - 1 + dedupedPoints.length) % dedupedPoints.length],
        cornerPoint = dedupedPoints[loopIndex],
        followingPoint = dedupedPoints[(loopIndex + 1) % dedupedPoints.length],
        incomingEdge = pointDelta(cornerPoint, previousPoint),
        outgoingEdge = pointDelta(followingPoint, cornerPoint),
        edgeLengthProduct = Math.max(
          Math.hypot(incomingEdge.x, incomingEdge.y) * Math.hypot(outgoingEdge.x, outgoingEdge.y),
          1,
        );
      if (
        !(Math.abs(cross2d(incomingEdge, outgoingEdge)) > distanceTolerance * edgeLengthProduct)
      ) {
        (dedupedPoints.splice(loopIndex, 1), (hasRemovedPoint = true));
        break;
      }
    }
  }
  return dedupedPoints;
}
export function subtractPolygonLoops(targetLoops, holeLoops, loopTolerance = 0.000001) {
  return unionPolygonLoops(targetLoops, loopTolerance, holeLoops);
}
function unionPolygonLoops(sourceLoops, unionTolerance = 0.000001, additionalLoops = []) {
  return unionLoops(sourceLoops, unionTolerance, additionalLoops);
}
function unionLoops(firstLoopSet, mergeDistance, extraLoops = [], shouldSkipUnion = false) {
  const epsilon = Math.max(Number(mergeDistance) || 0, 1e-7),
    primaryLoops = (firstLoopSet || [])
      .filter((loopCandidate) => Array.isArray(loopCandidate) && loopCandidate.length >= 3)
      .map((loop) =>
        loop.map((rawVertex) => ({
          x: Number(rawVertex.x) || 0,
          y: Number(rawVertex.y) || 0,
        })),
      )
      .filter((areaLoop) => Math.abs(polygonArea(areaLoop)) > epsilon * epsilon);
  if (!primaryLoops.length) return [];
  const variantLoops = extraLoops.filter(
      (variantLoop) =>
        Array.isArray(variantLoop) &&
        variantLoop.length >= 3 &&
        variantLoop.every(
          (finiteVertex) => Number.isFinite(finiteVertex.x) && Number.isFinite(finiteVertex.y),
        ) &&
        Math.abs(polygonArea(variantLoop)) > epsilon * epsilon,
    ),
    edges = [];
  for (const sourceLoop of [...primaryLoops, ...variantLoops])
    for (let edgeIndex = 0; edgeIndex < sourceLoop.length; edgeIndex += 1) {
      const edgeStart = sourceLoop[edgeIndex],
        edgeEnd = sourceLoop[(edgeIndex + 1) % sourceLoop.length];
      distance(edgeStart, edgeEnd) > epsilon &&
        edges.push({
          start: edgeStart,
          end: edgeEnd,
        });
    }
  const splitParamsByEdge = edges.map(() => [0, 1]);
  for (let firstEdgeIndex = 0; firstEdgeIndex < edges.length; firstEdgeIndex += 1) {
    const firstEdge = edges[firstEdgeIndex],
      firstEdgeVector = pointDelta(firstEdge.end, firstEdge.start),
      firstEdgeLengthSquared =
        firstEdgeVector.x * firstEdgeVector.x + firstEdgeVector.y * firstEdgeVector.y;
    for (
      let secondEdgeIndex = firstEdgeIndex + 1;
      secondEdgeIndex < edges.length;
      secondEdgeIndex += 1
    ) {
      const secondEdge = edges[secondEdgeIndex],
        secondEdgeVector = pointDelta(secondEdge.end, secondEdge.start),
        secondEdgeLengthSquared =
          secondEdgeVector.x * secondEdgeVector.x + secondEdgeVector.y * secondEdgeVector.y,
        edgeStartDelta = pointDelta(secondEdge.start, firstEdge.start),
        edgeCross = cross2d(firstEdgeVector, secondEdgeVector),
        crossTolerance =
          epsilon * Math.max(Math.sqrt(firstEdgeLengthSquared * secondEdgeLengthSquared), 1);
      if (Math.abs(edgeCross) > crossTolerance) {
        const secondEdgeSplitT = cross2d(edgeStartDelta, secondEdgeVector) / edgeCross,
          firstEdgeSplitT = cross2d(edgeStartDelta, firstEdgeVector) / edgeCross;
        if (
          secondEdgeSplitT < -epsilon ||
          secondEdgeSplitT > 1 + epsilon ||
          firstEdgeSplitT < -epsilon ||
          firstEdgeSplitT > 1 + epsilon
        )
          continue;
        (pushClampedT(splitParamsByEdge, firstEdgeIndex, secondEdgeSplitT, epsilon),
          pushClampedT(splitParamsByEdge, secondEdgeIndex, firstEdgeSplitT, epsilon));
        continue;
      }
      if (
        Math.abs(cross2d(edgeStartDelta, firstEdgeVector)) >
        epsilon * Math.max(Math.sqrt(firstEdgeLengthSquared), 1)
      )
        continue;
      const firstEdgeProjectionT =
          (edgeStartDelta.x * firstEdgeVector.x + edgeStartDelta.y * firstEdgeVector.y) /
          firstEdgeLengthSquared,
        secondEdgeEndDelta = pointDelta(secondEdge.end, firstEdge.start),
        firstEdgeEndProjectionT =
          (secondEdgeEndDelta.x * firstEdgeVector.x + secondEdgeEndDelta.y * firstEdgeVector.y) /
          firstEdgeLengthSquared;
      (pushClampedT(splitParamsByEdge, firstEdgeIndex, firstEdgeProjectionT, epsilon),
        pushClampedT(splitParamsByEdge, firstEdgeIndex, firstEdgeEndProjectionT, epsilon));
      const firstEdgeStartDelta = pointDelta(firstEdge.start, secondEdge.start),
        secondEdgeProjectionT =
          (firstEdgeStartDelta.x * secondEdgeVector.x +
            firstEdgeStartDelta.y * secondEdgeVector.y) /
          secondEdgeLengthSquared,
        firstEdgeEndDelta = pointDelta(firstEdge.end, secondEdge.start),
        secondEdgeEndProjectionT =
          (firstEdgeEndDelta.x * secondEdgeVector.x + firstEdgeEndDelta.y * secondEdgeVector.y) /
          secondEdgeLengthSquared;
      (pushClampedT(splitParamsByEdge, secondEdgeIndex, secondEdgeProjectionT, epsilon),
        pushClampedT(splitParamsByEdge, secondEdgeIndex, secondEdgeEndProjectionT, epsilon));
    }
  }
  const isInsidePrimaryLoop = (candidatePoint) =>
      primaryLoops.some((primaryLoop) => pointInPolygon(candidatePoint, primaryLoop, epsilon)) &&
      !variantLoops.some((exclusionLoop) => pointInPolygon(candidatePoint, exclusionLoop, epsilon)),
    quantizeStep = epsilon * 8,
    quantizedPointMap = new Map(),
    quantizePoint = (inputVertex) => {
      const quantizedX = Math.round(inputVertex.x / quantizeStep) * quantizeStep,
        quantizedY = Math.round(inputVertex.y / quantizeStep) * quantizeStep,
        quantizedKey =
          Math.round(quantizedX / quantizeStep) + "," + Math.round(quantizedY / quantizeStep);
      return (
        quantizedPointMap.has(quantizedKey) ||
          quantizedPointMap.set(quantizedKey, {
            key: quantizedKey,
            point: {
              x: quantizedX,
              y: quantizedY,
            },
          }),
        quantizedPointMap.get(quantizedKey)
      );
    },
    outputEdges = [],
    emittedPointKeySet = new Set();
  edges.forEach((sourceEdge, sourceEdgeIndex) => {
    const splitParams = [...splitParamsByEdge[sourceEdgeIndex]]
      .sort((leftSplitParam, rightSplitParam) => leftSplitParam - rightSplitParam)
      .filter(
        (nextSplitParam, splitParamIndex, splitParamList) =>
          splitParamIndex === 0 || nextSplitParam - splitParamList[splitParamIndex - 1] > epsilon,
      );
    for (let paramCursor = 0; paramCursor < splitParams.length - 1; paramCursor += 1) {
      const segmentStartPoint = lerpPoint(
          sourceEdge.start,
          sourceEdge.end,
          splitParams[paramCursor],
        ),
        segmentEndPoint = lerpPoint(sourceEdge.start, sourceEdge.end, splitParams[paramCursor + 1]),
        segmentDistance = distance(segmentStartPoint, segmentEndPoint);
      if (segmentDistance <= epsilon) continue;
      const edgeNormal = {
          x: (segmentEndPoint.x - segmentStartPoint.x) / segmentDistance,
          y: (segmentEndPoint.y - segmentStartPoint.y) / segmentDistance,
        },
        segmentMidpoint = lerpPoint(segmentStartPoint, segmentEndPoint, 0.5),
        offsetDistance = Math.min(segmentDistance * 0.2, epsilon * 8),
        offsetPointA = {
          x: segmentMidpoint.x - edgeNormal.y * offsetDistance,
          y: segmentMidpoint.y + edgeNormal.x * offsetDistance,
        },
        offsetPointB = {
          x: segmentMidpoint.x + edgeNormal.y * offsetDistance,
          y: segmentMidpoint.y - edgeNormal.x * offsetDistance,
        },
        isFirstOffsetInside = isInsidePrimaryLoop(offsetPointA),
        isSecondOffsetInside = isInsidePrimaryLoop(offsetPointB);
      if (isFirstOffsetInside === isSecondOffsetInside) continue;
      const entryPoint = quantizePoint(isFirstOffsetInside ? segmentStartPoint : segmentEndPoint),
        exitPoint = quantizePoint(isFirstOffsetInside ? segmentEndPoint : segmentStartPoint);
      if (entryPoint.key === exitPoint.key) continue;
      const edgeKey = [entryPoint.key, exitPoint.key].sort().join("|");
      emittedPointKeySet.has(edgeKey) ||
        (emittedPointKeySet.add(edgeKey),
        outputEdges.push({
          start: entryPoint,
          end: exitPoint,
        }));
    }
  });
  const edgesByStartKey = new Map();
  outputEdges.forEach((outputEdge, outputEdgeIndex) => {
    (edgesByStartKey.has(outputEdge.start.key) || edgesByStartKey.set(outputEdge.start.key, []),
      edgesByStartKey.get(outputEdge.start.key).push(outputEdgeIndex));
  });
  const remainingEdgeIndexSet = new Set(outputEdges.map((_edgeEntry, outputIndex) => outputIndex)),
    mergedLoops = [];
  for (; remainingEdgeIndexSet.size;) {
    const startEdgeIndex = remainingEdgeIndexSet.values().next().value,
      startEdge = outputEdges[startEdgeIndex],
      chainPoints = [startEdge.start.point];
    let currentIndex = startEdgeIndex,
      isClosed = false;
    for (let stepLimit = 0; stepLimit <= outputEdges.length; stepLimit += 1) {
      const currentEdge = outputEdges[currentIndex];
      if (
        (remainingEdgeIndexSet.delete(currentIndex), currentEdge.end.key === startEdge.start.key)
      ) {
        isClosed = true;
        break;
      }
      chainPoints.push(currentEdge.end.point);
      const candidateEdges = (edgesByStartKey.get(currentEdge.end.key) || []).filter(
        (candidateEdgeIndex) => remainingEdgeIndexSet.has(candidateEdgeIndex),
      );
      if (!candidateEdges.length) break;
      if (candidateEdges.length === 1) {
        currentIndex = candidateEdges[0];
        continue;
      }
      const currentEdgeVector = pointDelta(currentEdge.end.point, currentEdge.start.point);
      currentIndex = candidateEdges
        .map((turnCandidateIndex) => {
          const turnEdge = outputEdges[turnCandidateIndex],
            turnEdgeVector = pointDelta(turnEdge.end.point, turnEdge.start.point);
          return {
            index: turnCandidateIndex,
            turn: Math.atan2(
              cross2d(currentEdgeVector, turnEdgeVector),
              currentEdgeVector.x * turnEdgeVector.x + currentEdgeVector.y * turnEdgeVector.y,
            ),
          };
        })
        .sort(
          (leftTurnCandidate, rightTurnCandidate) =>
            rightTurnCandidate.turn - leftTurnCandidate.turn,
        )[0].index;
    }
    if (!isClosed) {
      if (shouldSkipUnion) return [];
      continue;
    }
    const cleanedLoop = clampT(chainPoints, epsilon * 8);
    cleanedLoop.length >= 3 &&
      Math.abs(polygonArea(cleanedLoop)) > epsilon * epsilon &&
      mergedLoops.push(cleanedLoop);
  }
  return mergedLoops.sort(
    (firstAreaLoop, secondAreaLoop) =>
      Math.abs(polygonArea(secondAreaLoop)) - Math.abs(polygonArea(firstAreaLoop)),
  );
}
export function validatedUnionPolygonLoops(rawLoops, validationTolerance = 0.000001) {
  const loopAreaTolerance = Math.max(Number(validationTolerance) || 0, 1e-7),
    acceptedLoops = (rawLoops || [])
      .filter((wellFormedLoop) => Array.isArray(wellFormedLoop) && wellFormedLoop.length >= 3)
      .filter(
        (sizedLoop) => Math.abs(polygonArea(sizedLoop)) > loopAreaTolerance * loopAreaTolerance,
      );
  if (!acceptedLoops.length) return [];
  const unionedLoops = unionLoops(acceptedLoops, loopAreaTolerance, [], true);
  if (!unionedLoops.length) return [];
  const rawLoopAreaSum = acceptedLoops.reduce(
      (loopAreaTotal, measuredLoop) => loopAreaTotal + Math.abs(polygonArea(measuredLoop)),
      0,
    ),
    unionedLoopArea = unionedLoops.reduce(
      (unionedAreaTotal, unionedLoop) => unionedAreaTotal + polygonArea(unionedLoop),
      0,
    ),
    areaMismatchTolerance = Math.max(
      rawLoopAreaSum * 0.001,
      loopAreaTolerance * loopAreaTolerance * 1024,
    );
  return unionedLoopArea <= areaMismatchTolerance ||
    unionedLoopArea > rawLoopAreaSum + areaMismatchTolerance
    ? []
    : unionedLoops;
}
function buildSegmentGrid(sourceSegments, cellSize) {
  const nodePoints = [],
    nodeSegments = [],
    nodeIndicesByCell = new Map(),
    nodeIndexForPoint = (gridPoint) => {
      const cellX = Math.floor(gridPoint.x / cellSize),
        cellY = Math.floor(gridPoint.y / cellSize);
      let nearestNodeIndex = -1;
      for (let cellOffsetX = -1; cellOffsetX <= 1; cellOffsetX += 1)
        for (let cellOffsetY = -1; cellOffsetY <= 1; cellOffsetY += 1)
          for (const candidateNodeIndex of nodeIndicesByCell.get(
            cellX + cellOffsetX + "," + (cellY + cellOffsetY),
          ) || [])
            (nearestNodeIndex < 0 || candidateNodeIndex < nearestNodeIndex) &&
              distance(nodePoints[candidateNodeIndex], gridPoint) <= cellSize &&
              (nearestNodeIndex = candidateNodeIndex);
      if (nearestNodeIndex >= 0) return nearestNodeIndex;
      const newNodeIndex = nodePoints.length;
      (nodePoints.push({
        x: gridPoint.x,
        y: gridPoint.y,
      }),
        nodeSegments.push([]));
      const cellKey = cellX + "," + cellY;
      return (
        nodeIndicesByCell.has(cellKey) || nodeIndicesByCell.set(cellKey, []),
        nodeIndicesByCell.get(cellKey).push(newNodeIndex),
        newNodeIndex
      );
    },
    orderedPairKey = (leftNodeIndex, rightNodeIndex) =>
      leftNodeIndex < rightNodeIndex
        ? leftNodeIndex + "," + rightNodeIndex
        : rightNodeIndex + "," + leftNodeIndex,
    segmentBoxes = [],
    seenPairKeySet = new Set();
  for (const segment of sourceSegments || []) {
    if (
      ![segment?.start?.x, segment?.start?.y, segment?.end?.x, segment?.end?.y].every(
        Number.isFinite,
      )
    )
      continue;
    const segmentStartNode = nodeIndexForPoint(segment.start),
      segmentEndNode = nodeIndexForPoint(segment.end);
    if (segmentStartNode === segmentEndNode) continue;
    (nodeSegments[segmentStartNode].push(segment), nodeSegments[segmentEndNode].push(segment));
    const segmentKey = orderedPairKey(segmentStartNode, segmentEndNode);
    if (seenPairKeySet.has(segmentKey)) continue;
    seenPairKeySet.add(segmentKey);
    const startNodePoint = nodePoints[segmentStartNode],
      endNodePoint = nodePoints[segmentEndNode];
    segmentBoxes.push({
      start: segmentStartNode,
      end: segmentEndNode,
      minX: Math.min(startNodePoint.x, endNodePoint.x),
      maxX: Math.max(startNodePoint.x, endNodePoint.x),
      minY: Math.min(startNodePoint.y, endNodePoint.y),
      maxY: Math.max(startNodePoint.y, endNodePoint.y),
      cuts: [
        {
          t: 0,
          node: segmentStartNode,
        },
        {
          t: 1,
          node: segmentEndNode,
        },
      ],
    });
  }
  const addSegmentCut = (boxedSegment, cutNodeIndex) => {
    if (cutNodeIndex === boxedSegment.start || cutNodeIndex === boxedSegment.end) return;
    const projectedHit = projectPointToSegment(
      nodePoints[cutNodeIndex],
      nodePoints[boxedSegment.start],
      nodePoints[boxedSegment.end],
    );
    projectedHit.t > 0 &&
      projectedHit.t < 1 &&
      projectedHit.distance <= cellSize &&
      boxedSegment.cuts.push({
        t: projectedHit.t,
        node: cutNodeIndex,
      });
  };
  segmentBoxes.sort((leftBox, rightBox) => leftBox.minX - rightBox.minX);
  for (let outerBoxIndex = 0; outerBoxIndex < segmentBoxes.length; outerBoxIndex += 1) {
    const outerSegmentBox = segmentBoxes[outerBoxIndex];
    for (
      let innerBoxIndex = outerBoxIndex + 1;
      innerBoxIndex < segmentBoxes.length;
      innerBoxIndex += 1
    ) {
      const innerSegmentBox = segmentBoxes[innerBoxIndex];
      if (innerSegmentBox.minX > outerSegmentBox.maxX + cellSize) break;
      if (
        innerSegmentBox.minY > outerSegmentBox.maxY + cellSize ||
        innerSegmentBox.maxY < outerSegmentBox.minY - cellSize
      )
        continue;
      (addSegmentCut(outerSegmentBox, innerSegmentBox.start),
        addSegmentCut(outerSegmentBox, innerSegmentBox.end),
        addSegmentCut(innerSegmentBox, outerSegmentBox.start),
        addSegmentCut(innerSegmentBox, outerSegmentBox.end));
      const segmentCrossingPoint = segmentIntersection(
        nodePoints[outerSegmentBox.start],
        nodePoints[outerSegmentBox.end],
        nodePoints[innerSegmentBox.start],
        nodePoints[innerSegmentBox.end],
      );
      if (segmentCrossingPoint) {
        const crossingNodeIndex = nodeIndexForPoint(segmentCrossingPoint);
        (addSegmentCut(outerSegmentBox, crossingNodeIndex),
          addSegmentCut(innerSegmentBox, crossingNodeIndex));
      }
    }
  }
  const nodeEdges = [],
    seenEdgeKeySet = new Set();
  for (const cutSegmentBox of segmentBoxes) {
    cutSegmentBox.cuts.sort((firstCut, secondCut) => firstCut.t - secondCut.t);
    let previousNodeIndex = cutSegmentBox.cuts[0].node;
    for (const nextCut of cutSegmentBox.cuts.slice(1)) {
      const nextNodeIndex = nextCut.node,
        faceEdgeKey = orderedPairKey(previousNodeIndex, nextNodeIndex);
      (previousNodeIndex !== nextNodeIndex &&
        !seenEdgeKeySet.has(faceEdgeKey) &&
        (seenEdgeKeySet.add(faceEdgeKey),
        nodeEdges.push({
          start: previousNodeIndex,
          end: nextNodeIndex,
        })),
        (previousNodeIndex = nextNodeIndex));
    }
  }
  return {
    nodes: nodePoints,
    edges: nodeEdges,
    endpointWalls: nodeSegments,
  };
}
function wallPolygonFaces(polygonWalls, faceTolerance) {
  const { nodes: polygonNodes, edges: polygonEdges } = buildSegmentGrid(
      polygonWalls,
      faceTolerance,
    ),
    nodeEdgeIndices = Array.from(
      {
        length: polygonNodes.length,
      },
      () => [],
    ),
    edgeRecords = [];
  for (const edgeRecord of polygonEdges) {
    const edgeRecordIndex = edgeRecords.length;
    (edgeRecords.push(
      {
        start: edgeRecord.start,
        end: edgeRecord.end,
      },
      {
        start: edgeRecord.end,
        end: edgeRecord.start,
      },
    ),
      nodeEdgeIndices[edgeRecord.start].push(edgeRecordIndex),
      nodeEdgeIndices[edgeRecord.end].push(edgeRecordIndex + 1));
  }
  const pairedEdgeIndex = new Int32Array(edgeRecords.length);
  nodeEdgeIndices.forEach((edgeIndicesAtNode, edgeNodeIndex) => {
    const edgeAngleAtNode = (slotEdgeIndex) =>
      Math.atan2(
        polygonNodes[edgeRecords[slotEdgeIndex].end].y - polygonNodes[edgeNodeIndex].y,
        polygonNodes[edgeRecords[slotEdgeIndex].end].x - polygonNodes[edgeNodeIndex].x,
      );
    (edgeIndicesAtNode.sort(
      (leftEdgeSlot, rightEdgeSlot) =>
        edgeAngleAtNode(leftEdgeSlot) - edgeAngleAtNode(rightEdgeSlot),
    ),
      edgeIndicesAtNode.forEach((edgeSlot, orderedPosition) => {
        pairedEdgeIndex[edgeSlot] = orderedPosition;
      }));
  });
  const nextSlotByEdge = edgeRecords.map((traversedEdge, edgeSlotIndex) => {
      const edgeIndicesAtEnd = nodeEdgeIndices[traversedEdge.end];
      return edgeIndicesAtEnd[
        (pairedEdgeIndex[edgeSlotIndex ^ 1] + edgeIndicesAtEnd.length - 1) % edgeIndicesAtEnd.length
      ];
    }),
    visitedEdgeSlots = new Uint8Array(edgeRecords.length),
    faceByKey = new Map(),
    recordFaceLoop = (loopNodeIndices) => {
      if (loopNodeIndices.length < 3) return;
      const loopVertices = loopNodeIndices.map((loopNodeIndex) => polygonNodes[loopNodeIndex]),
        loopAnchorPoint = loopVertices[0],
        signedLoopArea = polygonArea(
          loopVertices.map((loopPoint) => pointDelta(loopPoint, loopAnchorPoint)),
        );
      if (Math.abs(signedLoopArea) <= faceTolerance * faceTolerance) return;
      const orientedLoop = signedLoopArea > 0 ? loopNodeIndices : [...loopNodeIndices].reverse();
      let minimumIndex = 0;
      for (let loopVertexIndex = 1; loopVertexIndex < orientedLoop.length; loopVertexIndex += 1)
        orientedLoop[loopVertexIndex] < orientedLoop[minimumIndex] &&
          (minimumIndex = loopVertexIndex);
      const canonicalLoopKey = [
          ...orientedLoop.slice(minimumIndex),
          ...orientedLoop.slice(0, minimumIndex),
        ].join(","),
        existingFace = faceByKey.get(canonicalLoopKey);
      if (existingFace) {
        existingFace.outer ||= signedLoopArea < 0;
        return;
      }
      const simplifiedLoop = clampT(
        orientedLoop.map((mappedNodeIndex) => ({
          ...polygonNodes[mappedNodeIndex],
        })),
        1e-7,
      );
      simplifiedLoop.length >= 3 &&
        faceByKey.set(canonicalLoopKey, {
          polygon: simplifiedLoop,
          area: Math.abs(signedLoopArea),
          outer: signedLoopArea < 0,
        });
    };
  for (let seedEdgeSlot = 0; seedEdgeSlot < edgeRecords.length; seedEdgeSlot += 1) {
    if (visitedEdgeSlots[seedEdgeSlot]) continue;
    const pendingNodeIndices = [],
      stackIndexByNode = new Map();
    let walkNodeIndex = seedEdgeSlot;
    const traverseFaceLoop = (startNodeIndex) => {
      const stackPosition = stackIndexByNode.get(startNodeIndex);
      if (stackPosition !== undefined) {
        for (
          recordFaceLoop(pendingNodeIndices.slice(stackPosition));
          pendingNodeIndices.length > stackPosition + 1;
        )
          stackIndexByNode.delete(pendingNodeIndices.pop());
      } else
        (stackIndexByNode.set(startNodeIndex, pendingNodeIndices.length),
          pendingNodeIndices.push(startNodeIndex));
    };
    for (; !visitedEdgeSlots[walkNodeIndex];)
      ((visitedEdgeSlots[walkNodeIndex] = 1),
        traverseFaceLoop(edgeRecords[walkNodeIndex].start),
        (walkNodeIndex = nextSlotByEdge[walkNodeIndex]));
    walkNodeIndex === seedEdgeSlot && traverseFaceLoop(edgeRecords[seedEdgeSlot].start);
  }
  return [...faceByKey.values()].sort((faceA, faceB) => faceB.area - faceA.area);
}
export function closedWallPolygons(closedWalls, closedTolerance = 1) {
  const closedWallTolerance = Math.max(Number(closedTolerance) || 0, 1e-7);
  return wallPolygonFaces(closedWalls, closedWallTolerance).map((face) => face.polygon);
}
function wallEndpointNodes(endpointSourceWalls, wallEndpointTolerance = 1) {
  const endpointWallTolerance = Math.max(Number(wallEndpointTolerance) || 0, 1e-7),
    {
      nodes: endpointNodes,
      edges: endpointEdgeList,
      endpointWalls: endpointWalls,
    } = buildSegmentGrid(endpointSourceWalls, endpointWallTolerance),
    nodeDegreeCounts = new Uint32Array(endpointNodes.length);
  for (const countedEdge of endpointEdgeList)
    ((nodeDegreeCounts[countedEdge.start] += 1), (nodeDegreeCounts[countedEdge.end] += 1));
  return endpointNodes.flatMap((node, nodeIndex) =>
    nodeDegreeCounts[nodeIndex] === 1
      ? [
          {
            point: node,
            walls: endpointWalls[nodeIndex],
          },
        ]
      : [],
  );
}

function isPointWithinPolygon(samplePoint, boundaryPolygon, insideTolerance) {
  return pointInPolygon(samplePoint, boundaryPolygon, insideTolerance)
    ? boundaryPolygon.every(
        (edgeVertex, edgeVertexIndex) =>
          projectPointToSegment(
            samplePoint,
            edgeVertex,
            boundaryPolygon[(edgeVertexIndex + 1) % boundaryPolygon.length],
          ).distance > insideTolerance,
      )
    : false;
}
export function unclosedWallEndpoints(
  unclosedWalls,
  unclosedTolerance = 1,
  knownFloorPolygons = null,
) {
  const unclosedWallTolerance = Math.max(Number(unclosedTolerance) || 0, 1e-7),
    floorPolygonList = Array.isArray(knownFloorPolygons)
      ? knownFloorPolygons
      : closedWallFloorPolygons(unclosedWalls, unclosedWallTolerance);
  return wallEndpointNodes(unclosedWalls, unclosedWallTolerance)
    .filter(
      (openEndpoint) =>
        !openEndpoint.walls.length ||
        openEndpoint.walls.some((endpointWall) => endpointWall.allowOpenEnd !== true),
    )
    .filter(
      (candidateEndpoint) =>
        !floorPolygonList.some((floorPolygon) =>
          isPointWithinPolygon(candidateEndpoint.point, floorPolygon, unclosedWallTolerance),
        ),
    )
    .map((acceptedEndpoint) => ({
      ...acceptedEndpoint.point,
    }));
}
function isPolygonInsidePolygon(innerPolygon, outerPolygon, containmentTolerance) {
  const toleranceSquared = containmentTolerance * containmentTolerance,
    polygonAreaMagnitude = (areaPolygon) =>
      Math.abs(
        polygonArea(areaPolygon.map((areaVertex) => pointDelta(areaVertex, areaPolygon[0]))),
      );
  return polygonAreaMagnitude(outerPolygon) <= polygonAreaMagnitude(innerPolygon) + toleranceSquared
    ? false
    : innerPolygon.every((containedVertex, containedVertexIndex) => {
        if (!pointInPolygon(containedVertex, outerPolygon, containmentTolerance)) return false;
        const followingVertex = innerPolygon[(containedVertexIndex + 1) % innerPolygon.length],
          midpoint = {
            x: (containedVertex.x + followingVertex.x) / 2,
            y: (containedVertex.y + followingVertex.y) / 2,
          };
        return pointInPolygon(midpoint, outerPolygon, containmentTolerance);
      });
}
export function closedWallFloorPolygons(floorSourceWalls, floorTolerance = 1) {
  const floorWallTolerance = Math.max(Number(floorTolerance) || 0, 1e-7),
    keptFloorPolygons = [];
  for (const { polygon: polygon, outer: outer } of wallPolygonFaces(
    floorSourceWalls,
    floorWallTolerance,
  ))
    !outer ||
      keptFloorPolygons.some((existingPolygon) =>
        isPolygonInsidePolygon(polygon, existingPolygon, floorWallTolerance),
      ) ||
      keptFloorPolygons.push(polygon);
  return keptFloorPolygons;
}
export function modelBounds(model) {
  const boundsPoints = [];
  model.background?.width &&
    model.background?.height &&
    boundsPoints.push(
      {
        x: 0,
        y: 0,
      },
      {
        x: model.background.width,
        y: model.background.height,
      },
    );
  for (const modelWall of model.walls || []) boundsPoints.push(modelWall.start, modelWall.end);
  for (const item of model.items || [])
    boundsPoints.push({
      x: item.x,
      y: item.y,
    });
  if (!boundsPoints.length)
    return {
      minX: 0,
      minY: 0,
      maxX: 1200,
      maxY: 800,
      width: 1200,
      height: 800,
    };
  const minX = Math.min(...boundsPoints.map((minXPoint) => minXPoint.x)),
    minY = Math.min(...boundsPoints.map((minYPoint) => minYPoint.y)),
    maxX = Math.max(...boundsPoints.map((maxXPoint) => maxXPoint.x)),
    maxY = Math.max(...boundsPoints.map((maxYPoint) => maxYPoint.y));
  return {
    minX: minX,
    minY: minY,
    maxX: Math.max(maxX, minX + 1),
    maxY: Math.max(maxY, minY + 1),
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
}
