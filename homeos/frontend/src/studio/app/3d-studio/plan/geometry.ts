import { snapEditDelta } from '../authoring/studio-edit-metrics'
import { clamp } from './geometry-clamp'
import {
  cross2d,
  distance,
  lerpPoint,
  pointDelta,
  projectPointToSegment,
  segmentIntersection,
} from './geometry-primitives'
import { pointInPolygon } from './geometry-polygons'

export { clamp } from './geometry-clamp'
export * from './geometry-light-budget'
export * from './geometry-polygons'
export * from './geometry-primitives'

/** 玻璃推拉门的**展示开度**（0 = 两扇对齐合拢，1 = 活动扇完全叠到固定扇上）。 */
export const SLIDING_DOOR_DISPLAY_OPEN_RATIO = 0.8

export function slidingDoorPanelCenters(
  doorWidth: any,
  slideDirection = -1,
  openRatio = SLIDING_DOOR_DISPLAY_OPEN_RATIO,
) {
  const fixedPanelCenter = (slideDirection >= 0 ? 1 : -1) * doorWidth * 0.23,
    movingPanelCenter = -fixedPanelCenter
  return {
    fixed: fixedPanelCenter,
    moving: movingPanelCenter + (fixedPanelCenter - movingPanelCenter) * clamp(openRatio, 0, 1),
  }
}
export function wallIntersections(walls: any) {
  const intersectionPoints: any = []
  for (let firstWallIndex = 0; firstWallIndex < walls.length; firstWallIndex += 1)
    for (let secondWallIndex = firstWallIndex + 1; secondWallIndex < walls.length; secondWallIndex += 1) {
      const wallIntersectionPoint = segmentIntersection(
        walls[firstWallIndex].start,
        walls[firstWallIndex].end,
        walls[secondWallIndex].start,
        walls[secondWallIndex].end,
      )
      !wallIntersectionPoint ||
        intersectionPoints.some((existingPoint: any) => distance(existingPoint, wallIntersectionPoint) <= 1e-7) ||
        intersectionPoints.push(wallIntersectionPoint)
    }
  return intersectionPoints
}
export function splitWallSegments(wallSegments: any, minSplitGap = 0.000001) {
  const splitGap = Math.max(Number(minSplitGap) || 0, 1e-7),
    wallSplitParams = wallSegments.map(() => [0, 1])
  for (let wallIndex = 0; wallIndex < wallSegments.length; wallIndex += 1)
    for (let otherWallIndex = wallIndex + 1; otherWallIndex < wallSegments.length; otherWallIndex += 1) {
      const currentWall = wallSegments[wallIndex],
        otherWall = wallSegments[otherWallIndex],
        wallCrossingPoint = segmentIntersection(currentWall.start, currentWall.end, otherWall.start, otherWall.end)
      if (!wallCrossingPoint) continue
      const currentProjection = projectPointToSegment(wallCrossingPoint, currentWall.start, currentWall.end),
        otherProjection = projectPointToSegment(wallCrossingPoint, otherWall.start, otherWall.end)
      currentProjection.t > splitGap &&
        currentProjection.t < 1 - splitGap &&
        wallSplitParams[wallIndex].push(currentProjection.t),
        otherProjection.t > splitGap &&
          otherProjection.t < 1 - splitGap &&
          wallSplitParams[otherWallIndex].push(otherProjection.t)
    }
  const wallSegmentPieces: any = []
  return (
    wallSegments.forEach((wallItem: any, sourceWallIndex: any) => {
      const wallDeltaX = wallItem.end.x - wallItem.start.x,
        wallDeltaY = wallItem.end.y - wallItem.start.y,
        sortedSplitParams = [...wallSplitParams[sourceWallIndex]]
          .sort((leftParam, rightParam) => leftParam - rightParam)
          .filter(
            (splitParam, paramIndex, paramList) =>
              paramIndex === 0 || splitParam - paramList[paramIndex - 1] > splitGap,
          )
      for (let splitIndex = 0; splitIndex < sortedSplitParams.length - 1; splitIndex += 1) {
        const startT = sortedSplitParams[splitIndex],
          endT = sortedSplitParams[splitIndex + 1]
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
          })
      }
    }),
    wallSegmentPieces
  )
}
export function uncoveredCollinearWallSegments(wallSegment: any, coveredSegments: any, collinearTolerance = 0.001) {
  if (!wallSegment?.start || !wallSegment?.end) return []
  const toleranceValue = Math.max(Number(collinearTolerance) || 0, 1e-7),
    wallVectorX = wallSegment.end.x - wallSegment.start.x,
    wallVectorY = wallSegment.end.y - wallSegment.start.y,
    wallLength = Math.hypot(wallVectorX, wallVectorY)
  if (wallLength <= toleranceValue) return []
  const wallUnitVector = {
      x: wallVectorX / wallLength,
      y: wallVectorY / wallLength,
    },
    normalizedTolerance = toleranceValue / wallLength,
    coveredRanges: any[] = []
  for (const coveredSegment of coveredSegments || []) {
    if (!coveredSegment?.start || !coveredSegment?.end || coveredSegment.id === wallSegment.id) continue
    const coveredDeltaX = coveredSegment.end.x - coveredSegment.start.x,
      coveredDeltaY = coveredSegment.end.y - coveredSegment.start.y,
      coveredLength = Math.hypot(coveredDeltaX, coveredDeltaY)
    if (
      coveredLength <= toleranceValue ||
      Math.abs(
        (wallUnitVector.x * coveredDeltaY) / coveredLength - (wallUnitVector.y * coveredDeltaX) / coveredLength,
      ) > normalizedTolerance
    )
      continue
    const coveredStartVector = {
        x: coveredSegment.start.x - wallSegment.start.x,
        y: coveredSegment.start.y - wallSegment.start.y,
      },
      coveredEndVector = {
        x: coveredSegment.end.x - wallSegment.start.x,
        y: coveredSegment.end.y - wallSegment.start.y,
      },
      startOffsetCross = Math.abs(coveredStartVector.x * wallUnitVector.y - coveredStartVector.y * wallUnitVector.x),
      endOffsetCross = Math.abs(coveredEndVector.x * wallUnitVector.y - coveredEndVector.y * wallUnitVector.x)
    if (Math.max(startOffsetCross, endOffsetCross) > toleranceValue) continue
    const startProjection =
        (coveredStartVector.x * wallUnitVector.x + coveredStartVector.y * wallUnitVector.y) / wallLength,
      endProjection = (coveredEndVector.x * wallUnitVector.x + coveredEndVector.y * wallUnitVector.y) / wallLength,
      rangeStart = clamp(Math.min(startProjection, endProjection), 0, 1),
      rangeEnd = clamp(Math.max(startProjection, endProjection), 0, 1)
    rangeEnd - rangeStart > normalizedTolerance && coveredRanges.push([rangeStart, rangeEnd])
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
    ]
  coveredRanges.sort((leftRange, rightRange) => leftRange[0] - rightRange[0])
  const mergedRanges: any = []
  for (const rangeEntry of coveredRanges) {
    const lastMergedRange = mergedRanges.at(-1)
    lastMergedRange && rangeEntry[0] <= lastMergedRange[1] + normalizedTolerance
      ? (lastMergedRange[1] = Math.max(lastMergedRange[1], rangeEntry[1]))
      : mergedRanges.push([...rangeEntry])
  }
  const gapRanges: any[] = []
  let gapStart = 0
  for (const [mergedStart, mergedEnd] of mergedRanges)
    mergedStart - gapStart > normalizedTolerance && gapRanges.push([gapStart, mergedStart]),
      (gapStart = Math.max(gapStart, mergedEnd))
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
  )
}
export function canonicalPolygonKey(points: any, precision = 5) {
  if (!Array.isArray(points) || !points.length) return ''
  const precisionDigits = clamp(Math.round(Number(precision) || 0), 0, 12),
    normalizedPoints = points.map((polygonPoint) => {
      const normalizedX =
          Math.abs(Number(polygonPoint?.x) || 0) < 10 ** -precisionDigits / 2 ? 0 : Number(polygonPoint?.x) || 0,
        normalizedY =
          Math.abs(Number(polygonPoint?.y) || 0) < 10 ** -precisionDigits / 2 ? 0 : Number(polygonPoint?.y) || 0
      return normalizedX.toFixed(precisionDigits) + ',' + normalizedY.toFixed(precisionDigits)
    }),
    rotationKeys: any[] = []
  for (const pointSequence of [normalizedPoints, [...normalizedPoints].reverse()])
    for (let rotationOffset = 0; rotationOffset < pointSequence.length; rotationOffset += 1)
      rotationKeys.push([...pointSequence.slice(rotationOffset), ...pointSequence.slice(0, rotationOffset)].join(';'))
  return rotationKeys.sort()[0]
}
function findSharedCorner(cornerMapA: any, cornerMapB: any, matchTolerance: any) {
  const matchedPairs = [
    {
      firstKey: 'start',
      secondKey: 'start',
    },
    {
      firstKey: 'start',
      secondKey: 'end',
    },
    {
      firstKey: 'end',
      secondKey: 'start',
    },
    {
      firstKey: 'end',
      secondKey: 'end',
    },
  ].filter(
    ({ firstKey: firstKey, secondKey: secondKey }) =>
      distance(cornerMapA[firstKey], cornerMapB[secondKey]) <= matchTolerance,
  )
  if (matchedPairs.length !== 1) return null
  const matchedPair = matchedPairs[0]
  return {
    point: {
      x: (cornerMapA[matchedPair.firstKey].x + cornerMapB[matchedPair.secondKey].x) / 2,
      y: (cornerMapA[matchedPair.firstKey].y + cornerMapB[matchedPair.secondKey].y) / 2,
    },
    firstKey: matchedPair.firstKey,
    secondKey: matchedPair.secondKey,
    firstOuter: cornerMapA[matchedPair.firstKey === 'start' ? 'end' : 'start'],
    secondOuter: cornerMapB[matchedPair.secondKey === 'start' ? 'end' : 'start'],
  }
}
function isSameWallAppearance(wallAppearanceA: any, wallAppearanceB: any, appearanceTolerance: any) {
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
        : Math.abs(opacityA - opacityB) <= appearanceTolerance
  return (
    Math.abs((Number(wallAppearanceA.height) || 0) - (Number(wallAppearanceB.height) || 0)) <= appearanceTolerance &&
    Math.abs((Number(wallAppearanceA.thickness) || 0) - (Number(wallAppearanceB.thickness) || 0)) <=
      appearanceTolerance &&
    isMatchingProfile &&
    (wallAppearanceA.allowOpenEnd === true) == (wallAppearanceB.allowOpenEnd === true)
  )
}
function countNearbyWallEndpoints(wallList: any, queryPoint: any, proximityTolerance: any) {
  return wallList.reduce(
    (matchCount: any, wallEntry: any) =>
      matchCount +
      (distance(wallEntry.wall.start, queryPoint) <= proximityTolerance ? 1 : 0) +
      (distance(wallEntry.wall.end, queryPoint) <= proximityTolerance ? 1 : 0),
    0,
  )
}
function isCornerAngleValid(corner: any, cornerTolerance: any) {
  const firstOuterVector = pointDelta(corner.firstOuter, corner.point),
    secondOuterVector = pointDelta(corner.secondOuter, corner.point),
    firstOuterLength = Math.hypot(firstOuterVector.x, firstOuterVector.y),
    secondOuterLength = Math.hypot(secondOuterVector.x, secondOuterVector.y)
  if (firstOuterLength <= cornerTolerance || secondOuterLength <= cornerTolerance) return false
  const outerCrossMagnitude = Math.abs(cross2d(firstOuterVector, secondOuterVector))
  return (
    firstOuterVector.x * secondOuterVector.x + firstOuterVector.y * secondOuterVector.y < 0 &&
    outerCrossMagnitude <= cornerTolerance * Math.max(firstOuterLength, secondOuterLength, 1)
  )
}
export function mergeCollinearWallSegments(wallEntries: any, mergeTolerance = 0.000001) {
  const mergeGap = Math.max(Number(mergeTolerance) || 0, 1e-7),
    filteredWalls = (wallEntries || [])
      .filter(
        (wallCandidate: any) =>
          wallCandidate?.start && wallCandidate?.end && distance(wallCandidate.start, wallCandidate.end) > mergeGap,
      )
      .map((normalizedWall: any) => ({
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
      }))
  let hasMerged = true
  for (; hasMerged; ) {
    hasMerged = false
    for (let firstIndex = 0; firstIndex < filteredWalls.length && !hasMerged; firstIndex += 1)
      for (let secondIndex = firstIndex + 1; secondIndex < filteredWalls.length; secondIndex += 1) {
        const firstEntry = filteredWalls[firstIndex],
          secondEntry = filteredWalls[secondIndex]
        if (!isSameWallAppearance(firstEntry.wall, secondEntry.wall, mergeGap)) continue
        const sharedCorner = findSharedCorner(firstEntry.wall, secondEntry.wall, mergeGap)
        if (
          !sharedCorner ||
          countNearbyWallEndpoints(filteredWalls, sharedCorner.point, mergeGap) !== 2 ||
          !isCornerAngleValid(sharedCorner, mergeGap)
        )
          continue
        const mergedWall = {
          ...firstEntry.wall,
          start:
            sharedCorner.firstKey === 'end'
              ? {
                  ...sharedCorner.firstOuter,
                }
              : {
                  ...sharedCorner.secondOuter,
                },
          end:
            sharedCorner.firstKey === 'end'
              ? {
                  ...sharedCorner.secondOuter,
                }
              : {
                  ...sharedCorner.firstOuter,
                },
        }
        ;(filteredWalls[firstIndex] = {
          wall: mergedWall,
          sourceIds: new Set([...firstEntry.sourceIds, ...secondEntry.sourceIds]),
        }),
          filteredWalls.splice(secondIndex, 1),
          (hasMerged = true)
        break
      }
  }
  const wallIdBySourceId = new Map()
  for (const mergedWallEntry of filteredWalls)
    for (const sourceId of mergedWallEntry.sourceIds) wallIdBySourceId.set(sourceId, mergedWallEntry.wall.id)
  return {
    walls: filteredWalls.map((entry: any) => entry.wall),
    wallIdMap: wallIdBySourceId,
  }
}
export function remapWallAttachment(attachment: any, sourceWall: any, targetWall: any) {
  if (!attachment || !sourceWall || !targetWall) return attachment
  const attachmentT = clamp(Number(attachment.t) || 0, 0, 1),
    remappedPoint = lerpPoint(sourceWall.start, sourceWall.end, attachmentT)
  return {
    ...attachment,
    wallId: targetWall.id,
    t: clamp(projectPointToSegment(remappedPoint, targetWall.start, targetWall.end).t, 0, 1),
  }
}
function findClosestAnchor(probePoint: any, anchorCandidates: any, maxAnchorDistance: any) {
  let bestAnchor: any = null
  for (const anchorCandidate of anchorCandidates) {
    const anchorDistance = distance(probePoint, anchorCandidate.point)
    anchorDistance > maxAnchorDistance ||
      (bestAnchor && anchorDistance >= bestAnchor.distance) ||
      (bestAnchor = {
        ...anchorCandidate,
        distance: anchorDistance,
      })
  }
  return bestAnchor
}
export function axisLockedPoint(inputPoint: any, lockedReferencePoint: any) {
  const axisDeltaX = inputPoint.x - lockedReferencePoint.x,
    axisDeltaY = inputPoint.y - lockedReferencePoint.y
  return Math.abs(axisDeltaX) > Math.abs(axisDeltaY)
    ? {
        point: {
          x: inputPoint.x,
          y: lockedReferencePoint.y,
        },
        axis: 'horizontal',
        label: '水平轴',
      }
    : {
        point: {
          x: lockedReferencePoint.x,
          y: inputPoint.y,
        },
        axis: 'vertical',
        label: '垂直轴',
      }
}
function findNearestSegmentHit(
  originProbePoint: any,
  axisAnchorPoint: any,
  segmentCandidates: any,
  maxHitDistance: any,
  lockAxis: any,
) {
  let bestHit: any = null
  for (const segmentCandidate of segmentCandidates) {
    const axisKey = lockAxis === 'vertical' ? 'x' : 'y',
      crossAxisKey = lockAxis === 'vertical' ? 'y' : 'x',
      segmentSpan = segmentCandidate.end[axisKey] - segmentCandidate.start[axisKey]
    if (Math.abs(segmentSpan) <= 1e-7) {
      if (Math.abs(segmentCandidate.start[axisKey] - axisAnchorPoint[axisKey]) > 1e-7) continue
      const projectionHit = projectPointToSegment(originProbePoint, segmentCandidate.start, segmentCandidate.end)
      if (projectionHit.distance > maxHitDistance || (bestHit && projectionHit.distance >= bestHit.distance)) continue
      bestHit = {
        point: {
          ...projectionHit.point,
          [axisKey]: axisAnchorPoint[axisKey],
        },
        kind: 'segment',
        targetId: segmentCandidate.id,
        label: (lockAxis === 'vertical' ? '垂直' : '水平') + ' · 墙线',
        distance: projectionHit.distance,
      }
      continue
    }
    const spanRatio = (axisAnchorPoint[axisKey] - segmentCandidate.start[axisKey]) / segmentSpan
    if (spanRatio < -1e-7 || spanRatio > 1 + 1e-7) continue
    const hitPoint = {
      ...axisAnchorPoint,
    }
    hitPoint[crossAxisKey] =
      segmentCandidate.start[crossAxisKey] +
      (segmentCandidate.end[crossAxisKey] - segmentCandidate.start[crossAxisKey]) * clamp(spanRatio, 0, 1)
    const hitDistance = distance(originProbePoint, hitPoint)
    hitDistance > maxHitDistance ||
      (bestHit && hitDistance >= bestHit.distance) ||
      (bestHit = {
        point: hitPoint,
        kind: 'segment',
        targetId: segmentCandidate.id,
        label: (lockAxis === 'vertical' ? '垂直' : '水平') + ' · 墙线',
        distance: hitDistance,
      })
  }
  return bestHit
}
function findAlignedSegmentHit(
  alignedProbePoint: any,
  alignmentAnchor: any,
  alignedSegmentCandidates: any,
  alignmentTolerance: any,
) {
  if (!alignmentAnchor || Math.abs(alignedProbePoint.x - alignmentAnchor.x) > alignmentTolerance) return null
  const verticalHit = findNearestSegmentHit(
    alignedProbePoint,
    alignmentAnchor,
    alignedSegmentCandidates,
    alignmentTolerance,
    'vertical',
  )
  return (
    verticalHit || {
      point: {
        x: alignmentAnchor.x,
        y: alignedProbePoint.y,
      },
      kind: 'axis',
      label: '垂直轴',
      distance: Math.abs(alignedProbePoint.x - alignmentAnchor.x),
    }
  )
}
function resolveWallAttachment(
  sourcePoint: any,
  anchorPoint: any,
  wallSegmentsForHit: any,
  endpointTolerance: any,
  precomputedIntersections = wallIntersections(wallSegmentsForHit),
  snapOptions: PointSnapOptions = {},
) {
  const axisLock = axisLockedPoint(sourcePoint, anchorPoint),
    axisCoordinateKey = axisLock.axis === 'vertical' ? 'x' : 'y',
    filterTolerance = Math.max(1e-7, endpointTolerance * 0.000001),
    axisLabel = axisLock.axis === 'vertical' ? '垂直' : '水平',
    endpointCandidates = [
      ...(snapOptions.snapEndpoints === false
        ? []
        : wallSegmentsForHit.flatMap((sourceWallSegment: any) => [
            {
              point: sourceWallSegment.start,
              kind: 'endpoint',
              targetId: sourceWallSegment.id,
              label: axisLabel + ' · 端点',
            },
            {
              point: sourceWallSegment.end,
              kind: 'endpoint',
              targetId: sourceWallSegment.id,
              label: axisLabel + ' · 端点',
            },
          ])),
      ...(snapOptions.snapIntersections === false
        ? []
        : precomputedIntersections.map((intersectionPoint: any) => ({
            point: intersectionPoint,
            kind: 'intersection',
            label: axisLabel + ' · 交点',
          }))),
    ].filter(
      (endpointCandidate) =>
        Math.abs(endpointCandidate.point[axisCoordinateKey] - anchorPoint[axisCoordinateKey]) <= filterTolerance,
    ),
    snappedEndpoint = findClosestAnchor(sourcePoint, endpointCandidates, endpointTolerance)
  if (snappedEndpoint) return snappedEndpoint
  if (snapOptions.snapSegments !== false) {
    const snappedHit = findNearestSegmentHit(
      sourcePoint,
      anchorPoint,
      wallSegmentsForHit,
      endpointTolerance,
      axisLock.axis,
    )
    if (snappedHit) return snappedHit
  }
  return {
    ...axisLock,
    kind: 'axis',
    distance: distance(sourcePoint, axisLock.point),
  }
}
export function snapPoint(rawPoint: any, targetWalls: any, pointSnapOptions: PointSnapOptions = {}) {
  const snapOptions: PointSnapOptions = pointSnapOptions || {},
    zoomScale = Math.max(Number(snapOptions.zoom) || 1, 1e-7),
    worldTolerance = (Number(snapOptions.screenTolerance) || 12) / zoomScale,
    providedIntersections = Array.isArray(snapOptions.intersections) ? snapOptions.intersections : null
  if (snapOptions.forceOrthogonalAxis === true && snapOptions.anchor) {
    const resolvedIntersections =
      snapOptions.snapIntersections === false ? [] : providedIntersections || wallIntersections(targetWalls)
    return resolveWallAttachment(
      rawPoint,
      snapOptions.anchor,
      targetWalls,
      worldTolerance,
      resolvedIntersections,
      snapOptions,
    )
  }
  const endpointEntries: any[] = []
  if (snapOptions.snapEndpoints !== false) {
    for (const targetWallItem of targetWalls)
      endpointEntries.push(
        {
          point: targetWallItem.start,
          kind: 'endpoint',
          targetId: targetWallItem.id,
          label: '端点',
        },
        {
          point: targetWallItem.end,
          kind: 'endpoint',
          targetId: targetWallItem.id,
          label: '端点',
        },
      )
  }
  const snappedEndpointHit = findClosestAnchor(rawPoint, endpointEntries, worldTolerance)
  if (snappedEndpointHit) return snappedEndpointHit
  if (snapOptions.snapIntersections !== false) {
    const closestAnchorHit = findClosestAnchor(
      rawPoint,
      (providedIntersections || wallIntersections(targetWalls)).map((intersectionEndpoint: any) => ({
        point: intersectionEndpoint,
        kind: 'intersection',
        label: '交点',
      })),
      worldTolerance,
    )
    if (closestAnchorHit) return closestAnchorHit
  }
  if (snapOptions.preferVerticalAxis === true && snapOptions.snapOrthogonal !== false && snapOptions.anchor) {
    const alignedSegmentHit = findAlignedSegmentHit(rawPoint, snapOptions.anchor, targetWalls, worldTolerance)
    if (alignedSegmentHit) return alignedSegmentHit
  }
  if (snapOptions.snapSegments !== false) {
    const bestTargetWallHit = targetWalls
      .map((targetWallEntry: any) => {
        const segmentProjection = projectPointToSegment(rawPoint, targetWallEntry.start, targetWallEntry.end)
        return {
          point: segmentProjection.point,
          kind: 'segment',
          targetId: targetWallEntry.id,
          label: '墙线',
          distance: segmentProjection.distance,
        }
      })
      .filter((projectionEntry: any) => projectionEntry.distance <= worldTolerance)
      .sort((leftProjection: any, rightProjection: any) => leftProjection.distance - rightProjection.distance)[0]
    if (bestTargetWallHit) return bestTargetWallHit
  }
  if (snapOptions.snapAngles !== false && snapOptions.anchor) {
    const anchorOffsetX = rawPoint.x - snapOptions.anchor.x,
      anchorOffsetY = rawPoint.y - snapOptions.anchor.y,
      anchorOffsetLength = Math.hypot(anchorOffsetX, anchorOffsetY)
    if (anchorOffsetLength > 1e-7) {
      const snapAngleStepRadians = ((Number(snapOptions.angleStepDegrees) || 15) * Math.PI) / 180,
        rawAnchorAngle = Math.atan2(anchorOffsetY, anchorOffsetX),
        snappedAnchorAngle = Math.round(rawAnchorAngle / snapAngleStepRadians) * snapAngleStepRadians,
        rotatedAnchorPoint = {
          x: snapOptions.anchor.x + Math.cos(snappedAnchorAngle) * anchorOffsetLength,
          y: snapOptions.anchor.y + Math.sin(snappedAnchorAngle) * anchorOffsetLength,
        },
        rotatedAnchorDistance = distance(rawPoint, rotatedAnchorPoint)
      if (rotatedAnchorDistance <= worldTolerance) {
        const rotatedAngleDegrees = ((snappedAnchorAngle * 180) / Math.PI + 360) % 360
        return {
          point: rotatedAnchorPoint,
          kind: 'angle',
          label: Math.round(rotatedAngleDegrees) + '°',
          distance: rotatedAnchorDistance,
        }
      }
    }
  }
  const gridStep = Number(snapOptions.gridSize) || 0
  if (snapOptions.snapGrid !== false && gridStep > 1e-7) {
    const gridSnappedPoint = {
        x: Math.round(rawPoint.x / gridStep) * gridStep,
        y: Math.round(rawPoint.y / gridStep) * gridStep,
      },
      gridSnappedDistance = distance(rawPoint, gridSnappedPoint)
    if (gridSnappedDistance <= worldTolerance)
      return {
        point: gridSnappedPoint,
        kind: 'grid',
        label: '网格',
        distance: gridSnappedDistance,
      }
  }
  return {
    point: {
      ...rawPoint,
    },
    kind: null as any,
    label: '',
    distance: 0,
  }
}
export function nearestWall(wallQueryPoint: any, wallCandidates: any, distanceLimit = Infinity) {
  let nearestWallResult: any = null
  for (const candidateWall of wallCandidates) {
    const wallProjection = projectPointToSegment(wallQueryPoint, candidateWall.start, candidateWall.end)
    wallProjection.distance > distanceLimit ||
      (nearestWallResult && wallProjection.distance >= nearestWallResult.distance) ||
      (nearestWallResult = {
        wall: candidateWall,
        ...wallProjection,
      })
  }
  return nearestWallResult
}
export function wallLengthMeters(measuredWall: any, sceneUnitScale: any) {
  return distance(measuredWall.start, measuredWall.end) / Math.max(Number(sceneUnitScale) || 1, 1e-7)
}
export function clampWindowT(windowWall: any, windowOpening: any, openingUnitScale: any) {
  const measuredWallLength = wallLengthMeters(windowWall, openingUnitScale)
  if (measuredWallLength <= 1e-7) return 0.5
  const marginT = Math.min(Math.max(Number(windowOpening.width) || 0, 0) / 2, measuredWallLength / 2)
  return clamp(Number(windowOpening.t) || 0, marginT / measuredWallLength, 1 - marginT / measuredWallLength)
}
export function doorLeafRotation(doorLeaf: any, swingRadians = Math.PI / 2) {
  return -(doorLeaf?.swing === -1 ? -1 : 1) * swingRadians
}

/** 门的展示开度（0–100）。显式值优先；否则玻璃推拉门常开 200/3，入户/卷帘/仅门框常闭，其余全开。 */
export function defaultDoorOpening(door: { defaultOpening?: number; doorType?: string }, closedWhenUnbound = false) {
  if (Number.isFinite(door?.defaultOpening)) return clamp(door.defaultOpening as number, 0, 100)
  if (door?.doorType === 'sliding-glass') return closedWhenUnbound ? 0 : 200 / 3
  if (door?.doorType === 'entry' || door?.doorType === 'roller-shutter' || door?.doorType === 'frame-only') return 0
  return 100
}

/** 门扇的展示角：按开度比例收放；比例为 0 时明确落到关闭位（`0 * 角` 的 `-0` 归零）。 */
export function doorDisplayRotation(rotation: number, openRatio: number) {
  return rotation * openRatio || 0
}
export function wallJoinExtensions(joinWalls: any, endpointEpsilon = 0.001, maxExtensionRatio = 4) {
  const endpointEpsilonValue = Math.max(Number(endpointEpsilon) || 0, 1e-7),
    extensionRatio = Math.max(Number(maxExtensionRatio) || 0, 1),
    endpointsByWallId = Object.fromEntries(
      (joinWalls || []).map((joinWall: any) => [
        joinWall.id,
        {
          start: 0,
          end: 0,
        },
      ]),
    ),
    junctionGroups: any = [],
    junctionAt = (junctionPoint: any) => {
      let existingJunction = junctionGroups.find(
        (candidateJunction: any) => distance(candidateJunction.point, junctionPoint) <= endpointEpsilonValue,
      )
      return (
        existingJunction ||
          ((existingJunction = {
            point: {
              ...junctionPoint,
            },
            incidents: [] as any[],
          }),
          junctionGroups.push(existingJunction)),
        existingJunction
      )
    }
  for (const solidWall of joinWalls || []) {
    const solidWallDeltaX = solidWall.end.x - solidWall.start.x,
      solidWallDeltaY = solidWall.end.y - solidWall.start.y,
      solidWallSpan = Math.hypot(solidWallDeltaX, solidWallDeltaY)
    if (solidWallSpan <= endpointEpsilonValue) continue
    const halfThickness = Math.max(Number(solidWall.thickness) || 0, 0) / 2
    junctionAt(solidWall.start).incidents.push({
      wallId: solidWall.id,
      endpoint: 'start',
      x: solidWallDeltaX / solidWallSpan,
      y: solidWallDeltaY / solidWallSpan,
      halfThickness: halfThickness,
    }),
      junctionAt(solidWall.end).incidents.push({
        wallId: solidWall.id,
        endpoint: 'end',
        x: -solidWallDeltaX / solidWallSpan,
        y: -solidWallDeltaY / solidWallSpan,
        halfThickness: halfThickness,
      })
  }
  const ANGLE_EPSILON = 0.0001
  for (const junctionGroup of junctionGroups) {
    if (junctionGroup.incidents.length < 2) continue
    const junctionIncidents = junctionGroup.incidents
      .map((incidentVector: any) => ({
        ...incidentVector,
        angle: Math.atan2(incidentVector.y, incidentVector.x),
      }))
      .sort((leftIncident: any, rightIncident: any) => leftIncident.angle - rightIncident.angle)
    for (let incidentIndex = 0; incidentIndex < junctionIncidents.length; incidentIndex += 1) {
      const currentIncident = junctionIncidents[incidentIndex],
        nextIncident = junctionIncidents[(incidentIndex + 1) % junctionIncidents.length],
        incidentAngleGap = (nextIncident.angle - currentIncident.angle + Math.PI * 2) % (Math.PI * 2)
      if (incidentAngleGap <= ANGLE_EPSILON || incidentAngleGap >= Math.PI - ANGLE_EPSILON) continue
      const gapSine = Math.sin(incidentAngleGap),
        gapCosine = Math.cos(incidentAngleGap)
      if (gapSine <= ANGLE_EPSILON) continue
      const joinOffsetBase =
          Math.max(currentIncident.halfThickness, nextIncident.halfThickness, 0.000001) * extensionRatio,
        startJoinOffset = clamp(
          (nextIncident.halfThickness + currentIncident.halfThickness * gapCosine) / gapSine,
          0,
          joinOffsetBase,
        ),
        endJoinOffset = clamp(
          (currentIncident.halfThickness + nextIncident.halfThickness * gapCosine) / gapSine,
          0,
          joinOffsetBase,
        )
      ;(endpointsByWallId[currentIncident.wallId][currentIncident.endpoint] = Math.max(
        endpointsByWallId[currentIncident.wallId][currentIncident.endpoint],
        startJoinOffset,
      )),
        (endpointsByWallId[nextIncident.wallId][nextIncident.endpoint] = Math.max(
          endpointsByWallId[nextIncident.wallId][nextIncident.endpoint],
          endJoinOffset,
        ))
    }
  }
  return endpointsByWallId
}
export function wallSolidPieces(solidTargetWall: any, wallSegmentList: any, wallUnitScale: any, wallHeight: any) {
  const targetWallLength = wallLengthMeters(solidTargetWall, wallUnitScale),
    wallHeightValue = Math.max(Number(wallHeight) || 0, 0)
  if (targetWallLength <= 1e-7 || wallHeightValue <= 1e-7) return []
  const filteredSegments = wallSegmentList
      .filter((segmentEntry: any) => segmentEntry.wallId === solidTargetWall.id)
      .map((opening: any) => {
        const openingWidth = clamp(Number(opening.width) || 0, 0, targetWallLength),
          openingCenter = clampWindowT(solidTargetWall, opening, wallUnitScale) * targetWallLength,
          openingBottom = clamp(Number(opening.sill) || 0, 0, wallHeightValue),
          openingTop = clamp(openingBottom + Math.max(Number(opening.height) || 0, 0), openingBottom, wallHeightValue)
        return {
          start: clamp(openingCenter - openingWidth / 2, 0, targetWallLength),
          end: clamp(openingCenter + openingWidth / 2, 0, targetWallLength),
          bottom: openingBottom,
          top: openingTop,
        }
      })
      .filter(
        (openingPiece: any) =>
          openingPiece.end - openingPiece.start > 1e-7 && openingPiece.top - openingPiece.bottom > 1e-7,
      ),
    splitPositions = [
      ...new Set([
        0,
        targetWallLength,
        ...filteredSegments.flatMap((solidSegment: any) => [solidSegment.start, solidSegment.end]),
      ]),
    ].sort((leftPosition, rightPosition) => leftPosition - rightPosition),
    solidPieces: any[] = []
  for (let positionIndex = 0; positionIndex < splitPositions.length - 1; positionIndex += 1) {
    const currentPosition = splitPositions[positionIndex],
      nextPosition = splitPositions[positionIndex + 1]
    if (nextPosition - currentPosition <= 1e-7) continue
    const positionMidpoint = (currentPosition + nextPosition) / 2,
      coveringSegments = filteredSegments
        .filter(
          (coveringSegment: any) =>
            positionMidpoint > coveringSegment.start - 1e-7 && positionMidpoint < coveringSegment.end + 1e-7,
        )
        .map((openingSpan: any) => [openingSpan.bottom, openingSpan.top])
        .sort((leftSpan: any, rightSpan: any) => leftSpan[0] - rightSpan[0])
    if (!coveringSegments.length) {
      solidPieces.push({
        start: currentPosition,
        end: nextPosition,
        bottom: 0,
        top: wallHeightValue,
      })
      continue
    }
    const mergedSpans: any = []
    for (const currentSpan of coveringSegments) {
      const lastSpan = mergedSpans.at(-1)
      lastSpan && currentSpan[0] <= lastSpan[1] + 1e-7
        ? (lastSpan[1] = Math.max(lastSpan[1], currentSpan[1]))
        : mergedSpans.push([...currentSpan])
    }
    let cursorBottom = 0
    for (const [spanStart, spanEnd] of mergedSpans)
      spanStart - cursorBottom > 1e-7 &&
        solidPieces.push({
          start: currentPosition,
          end: nextPosition,
          bottom: cursorBottom,
          top: spanStart,
        }),
        (cursorBottom = Math.max(cursorBottom, spanEnd))
    wallHeightValue - cursorBottom > 1e-7 &&
      solidPieces.push({
        start: currentPosition,
        end: nextPosition,
        bottom: cursorBottom,
        top: wallHeightValue,
      })
  }
  return solidPieces
}
/** 点吸附选项。 */
type PointSnapOptions = {
  /** 端点吸附，默认开。 */
  snapEndpoints?: boolean
  /** 交点吸附，默认开。 */
  snapIntersections?: boolean
  /** 投影到已有墙线上，默认开。 */
  snapSegments?: boolean
  /** 角度吸附，默认开（需要 anchor）。 */
  snapAngles?: boolean
  /** 栅格吸附，默认开（需要 gridSize）。 */
  snapGrid?: boolean
  /** 正交吸附，默认开。 */
  snapOrthogonal?: boolean
  /** 优先吸附到垂直轴。 */
  preferVerticalAxis?: boolean
  /** 强制走轴锁定 + 贴墙分支。 */
  forceOrthogonalAxis?: boolean
  /** 当前缩放，用于把 screenTolerance 换算成世界容差。 */
  zoom?: number
  /** 屏幕像素容差，默认 12px。 */
  screenTolerance?: number
  /** 角度吸附步长（度），默认 15。 */
  angleStepDegrees?: number
  /** 栅格尺寸（世界单位）。 */
  gridSize?: number
  /** 吸附锚点。 */
  anchor?: any
  /** 预计算好的墙线交点，避免重复求交。 */
  intersections?: any[] | null
}

/** 尺寸缩放限制（resizeRotatedItemFromCorner）。 */
type ResizeSizeLimits = {
  /** 最小边长，默认 0.1。 */
  minimumDimension?: number
  /** 最大边长，默认 8（与场景载荷对普通物件的收敛上限一致）。 */
  maximumDimension?: number
  /** 最小缩放比，默认 0。 */
  minimum?: number
  /** 最大缩放比，默认正无穷。 */
  maximum?: number
  /** 宽度吸附粒度（米）；0 / 缺省表示不吸附。 */
  widthStep?: number
  /** 深度吸附粒度（米）；0 / 缺省表示不吸附。 */
  depthStep?: number
}

/** resizeRotatedItemFromCorner 的结果矩形； */
type ResizedRectangle = {
  x: number
  y: number
  width: number
  depth: number
  height?: number
}

export function pointInRotatedRectangle(testPoint: any, rotatedRectangle: any, sizeScale: any) {
  const rotationRadians = (-(Number(rotatedRectangle.rotation) || 0) * Math.PI) / 180,
    localDeltaX = testPoint.x - rotatedRectangle.x,
    localDeltaY = testPoint.y - rotatedRectangle.y,
    rotatedX = localDeltaX * Math.cos(rotationRadians) - localDeltaY * Math.sin(rotationRadians),
    rotatedY = localDeltaX * Math.sin(rotationRadians) + localDeltaY * Math.cos(rotationRadians),
    halfWidth = (Math.max(Number(rotatedRectangle.width) || 0, 0) * sizeScale) / 2,
    halfDepth = (Math.max(Number(rotatedRectangle.depth) || 0, 0) * sizeScale) / 2
  return Math.abs(rotatedX) <= halfWidth && Math.abs(rotatedY) <= halfDepth
}
/**
 * 鼠标拖动的位移（平面像素）。
 *
 * 拖动是「跟手」手势：结果**不做网格量化**，松手就落在指针下的任意位置。鼠标本身只有
 * 像素精度，再按 5cm / 1cm 步进取整只会让物件跳过光标位置、贴不上墙线和家具边 ——
 * 键盘方向键才是按步长走的编辑动作（`studio-app` 的 keydown）。
 *
 * `lockAxis`（Shift）只保留位移较大的一个轴，与被锁轴无关的分量直接归零。
 */
export function planDragDelta(
  startPoint: { x: number; y: number },
  currentPoint: { x: number; y: number },
  lockAxis = false,
) {
  const dragDeltaX = roundPlanLength(Number(currentPoint?.x) - Number(startPoint?.x)),
    dragDeltaY = roundPlanLength(Number(currentPoint?.y) - Number(startPoint?.y))
  if (!lockAxis) return { x: dragDeltaX, y: dragDeltaY }
  return Math.abs(dragDeltaX) >= Math.abs(dragDeltaY) ? { x: dragDeltaX, y: 0 } : { x: 0, y: dragDeltaY }
}

/** 平面长度的浮点去尾巴精度：1e-6 像素（远细于一个像素，但足以洗掉 13.370000000000005）。 */
const PLAN_LENGTH_PRECISION = 1e6
function roundPlanLength(rawLength: number) {
  return Number.isFinite(rawLength)
    ? Math.round(rawLength * PLAN_LENGTH_PRECISION) / PLAN_LENGTH_PRECISION + 0
    : rawLength
}

/**
 * 缩放结果的取值精度：1 微米。
 *
 * 拖拽是像素 → 米的换算，结果天然带浮点尾巴（0.47299999999999997）。这里只去尾巴、
 * 不量化 —— 用户拖出来的任意尺寸照原样保留，只是不会把 17 位小数写进草稿与面板。
 */
const RESIZE_LENGTH_PRECISION = 1e6
function roundResizeLength(rawLength: number) {
  return Number.isFinite(rawLength)
    ? Math.round(rawLength * RESIZE_LENGTH_PRECISION) / RESIZE_LENGTH_PRECISION
    : rawLength
}

/** 由「相对锚点的半宽 / 半深」反算旋转后的中心点（角手柄与边手柄共用）。 */
function rotatedCenterFromSpan(
  anchorPosition: { x: number; y: number },
  halfWidthSpan: number,
  halfDepthSpan: number,
  rotationDegrees: number | undefined,
): { x: number; y: number } {
  const radians = ((Number(rotationDegrees) || 0) * Math.PI) / 180
  return {
    x: anchorPosition.x + halfWidthSpan * Math.cos(radians) - halfDepthSpan * Math.sin(radians),
    y: anchorPosition.y + halfWidthSpan * Math.sin(radians) + halfDepthSpan * Math.cos(radians),
  }
}

/** 边手柄缩放（0.8.7 `resizeItemFromEdge`）：只改拖的那一个方向，另一个维度保持。 */
export interface PlanResizePoint {
  x: number
  y: number
}

/** 边手柄某一维度的取值：未拖的那一维保持原值。 */
function edgeResizeDimension(
  enabled: boolean,
  localDelta: number,
  referenceSpan: number,
  originalValue: number,
  minimum: number,
  maximum: number,
  step: number,
): number {
  if (!enabled) return Math.max(originalValue, minimum)
  return clamp(roundResizeLength(snapEditDelta(Math.abs(localDelta) / referenceSpan, step)), minimum, maximum)
}

/** 把「锚点 → 指针」换算到物件本地坐标（绕 Z 反向旋转）。 */
function edgeLocalDelta(
  rotationDegrees: number | undefined,
  anchorPosition: PlanResizePoint,
  targetPosition: PlanResizePoint,
): PlanResizePoint {
  const radians = (-Number(rotationDegrees || 0) * Math.PI) / 180
  const deltaX = targetPosition.x - anchorPosition.x
  const deltaY = targetPosition.y - anchorPosition.y
  return {
    x: deltaX * Math.cos(radians) - deltaY * Math.sin(radians),
    y: deltaX * Math.sin(radians) + deltaY * Math.cos(radians),
  }
}

/** 尺寸上下限（未配置时给与角手柄一致的默认值）。 */
function resizeBoundsOf(sizeLimits: ResizeSizeLimits): { minimum: number; maximum: number } {
  const minimum = Math.max(Number(sizeLimits.minimumDimension) || 0.1, 1e-7)
  return { minimum, maximum: Math.max(Number(sizeLimits.maximumDimension) || 8, minimum) }
}

export function resizeRotatedItemFromEdge(
  sourceRectangle: ResizedRectangle & { rotation?: number },
  directionVector: PlanResizePoint,
  anchorPosition: PlanResizePoint,
  targetPosition: PlanResizePoint,
  referenceDistance: number,
  sizeLimits: ResizeSizeLimits = {},
) {
  const referenceSpan = Math.max(Number(referenceDistance) || 0, 1e-7)
  const directionSignX = Math.sign(Number(directionVector?.x) || 0)
  const directionSignY = Math.sign(Number(directionVector?.y) || 0)
  const localDelta = edgeLocalDelta(sourceRectangle.rotation, anchorPosition, targetPosition)
  const { minimum: minimumDimension, maximum: maximumDimension } = resizeBoundsOf(sizeLimits)
  const scaledWidth = edgeResizeDimension(
    directionSignX !== 0,
    localDelta.x,
    referenceSpan,
    Number(sourceRectangle.width) || minimumDimension,
    minimumDimension,
    maximumDimension,
    Number(sizeLimits.widthStep) || 0,
  )
  const scaledDepth = edgeResizeDimension(
    directionSignY !== 0,
    localDelta.y,
    referenceSpan,
    Number(sourceRectangle.depth) || minimumDimension,
    minimumDimension,
    maximumDimension,
    Number(sizeLimits.depthStep) || 0,
  )
  const center = rotatedCenterFromSpan(
    anchorPosition,
    (directionSignX * scaledWidth * referenceSpan) / 2,
    (directionSignY * scaledDepth * referenceSpan) / 2,
    sourceRectangle.rotation,
  )
  return { ...center, width: scaledWidth, depth: scaledDepth }
}

export function resizeRotatedItemFromCorner(
  sourceRectangle: any,
  directionVector: any,
  anchorPosition: any,
  targetPosition: any,
  referenceDistance: any,
  shouldScaleHeight = false,
  sizeLimits: ResizeSizeLimits = {},
) {
  const referenceSpan = Math.max(Number(referenceDistance) || 0, 1e-7),
    directionSignX = directionVector?.x < 0 ? -1 : 1,
    directionSignY = directionVector?.y < 0 ? -1 : 1,
    sourceRotationRadians = (-(Number(sourceRectangle.rotation) || 0) * Math.PI) / 180,
    targetDeltaX = targetPosition.x - anchorPosition.x,
    targetDeltaY = targetPosition.y - anchorPosition.y,
    sourceDeltaX = targetDeltaX * Math.cos(sourceRotationRadians) - targetDeltaY * Math.sin(sourceRotationRadians),
    sourceDeltaY = targetDeltaX * Math.sin(sourceRotationRadians) + targetDeltaY * Math.cos(sourceRotationRadians),
    ratioX = (directionSignX * sourceDeltaX) / referenceSpan,
    ratioY = (directionSignY * sourceDeltaY) / referenceSpan,
    minimumDimension = Math.max(Number(sizeLimits.minimumDimension) || 0.1, 1e-7),
    maximumDimension = Math.max(Number(sizeLimits.maximumDimension) || 8, minimumDimension),
    rectangleWidth = Math.max(Number(sourceRectangle.width) || minimumDimension, minimumDimension),
    rectangleDepth = Math.max(Number(sourceRectangle.depth) || minimumDimension, minimumDimension),
    rectangleHeight = Number(sourceRectangle.height),
    // 步进由调用方决定：鼠标拖拽默认不吸附（任意尺寸），按 Alt 才按家具步进取整。
    snappedWidth = rectangleWidth + snapEditDelta(ratioX - rectangleWidth, Number(sizeLimits.widthStep) || 0),
    snappedDepth = rectangleDepth + snapEditDelta(ratioY - rectangleDepth, Number(sizeLimits.depthStep) || 0)
  let scaledWidth = clamp(snappedWidth, minimumDimension, maximumDimension),
    scaledDepth = clamp(snappedDepth, minimumDimension, maximumDimension),
    dimensionScale = 1
  if (shouldScaleHeight) {
    const minimumScale = Math.max(Number(sizeLimits.minimum) || 0, 1e-7),
      maximumScale = Math.max(Number(sizeLimits.maximum) || Number.POSITIVE_INFINITY, minimumScale)
    ;(dimensionScale = clamp(
      ratioX / rectangleWidth >= ratioY / rectangleDepth
        ? snappedWidth / rectangleWidth
        : snappedDepth / rectangleDepth,
      minimumScale,
      maximumScale,
    )),
      (scaledWidth = rectangleWidth * dimensionScale),
      (scaledDepth = rectangleDepth * dimensionScale)
  }
  // 像素 → 米的换算会留下一串浮点尾巴（0.47299999999999997），去尾巴但不量化：
  // 任意尺寸仍然任意，只是不会把垃圾位数写进属性面板和草稿。
  ;(scaledWidth = roundResizeLength(scaledWidth)), (scaledDepth = roundResizeLength(scaledDepth))
  const snappedRectangle: ResizedRectangle = {
    ...rotatedCenterFromSpan(
      anchorPosition,
      (directionSignX * scaledWidth * referenceSpan) / 2,
      (directionSignY * scaledDepth * referenceSpan) / 2,
      sourceRectangle.rotation,
    ),
    width: scaledWidth,
    depth: scaledDepth,
  }
  return (
    Number.isFinite(rectangleHeight) &&
      rectangleHeight > 0 &&
      (snappedRectangle.height = roundResizeLength(
        shouldScaleHeight ? rectangleHeight * dimensionScale : rectangleHeight,
      )),
    snappedRectangle
  )
}
export function itemRotationFromPointers(
  initialRotation: any,
  referencePoint: any,
  firstPointer: any,
  secondPointer: any,
  angleStepDegrees = 0,
) {
  const firstPointerAngle = Math.atan2(firstPointer.y - referencePoint.y, firstPointer.x - referencePoint.x),
    secondPointerAngle = Math.atan2(secondPointer.y - referencePoint.y, secondPointer.x - referencePoint.x)
  let rotationDegrees = (Number(initialRotation) || 0) + ((secondPointerAngle - firstPointerAngle) * 180) / Math.PI
  const angleStepValue = Math.max(Number(angleStepDegrees) || 0, 0)
  return (
    angleStepValue > 0 && (rotationDegrees = Math.round(rotationDegrees / angleStepValue) * angleStepValue),
    ((rotationDegrees % 360) + 360) % 360
  )
}
export function modelBounds(model: any) {
  const boundsPoints: any[] = []
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
    )
  for (const modelWall of model.walls || []) boundsPoints.push(modelWall.start, modelWall.end)
  for (const item of model.items || [])
    boundsPoints.push({
      x: item.x,
      y: item.y,
    })
  if (!boundsPoints.length)
    return {
      minX: 0,
      minY: 0,
      maxX: 1200,
      maxY: 800,
      width: 1200,
      height: 800,
    }
  const minX = Math.min(...boundsPoints.map((minXPoint) => minXPoint.x)),
    minY = Math.min(...boundsPoints.map((minYPoint) => minYPoint.y)),
    maxX = Math.max(...boundsPoints.map((maxXPoint) => maxXPoint.x)),
    maxY = Math.max(...boundsPoints.map((maxYPoint) => maxYPoint.y))
  return {
    minX: minX,
    minY: minY,
    maxX: Math.max(maxX, minX + 1),
    maxY: Math.max(maxY, minY + 1),
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  }
}

/**
 * 门扇朝室内的一侧（0.8.1 `doorInteriorSide`）：贴着门洞中心往墙体法线两侧各探一点，
 * 落在楼层闭合多边形里的一侧就是室内。
 *
 * 返回值 **1 / -1 / 0**：1 表示室内在 `(-dy, dx)` 那一侧，-1 表示在另一侧，
 * 0 表示两侧都一样（墙不在闭合房间上）或拿不到楼层多边形 —— 这时调用方要走回退路径。
 * `lock-motion` 用它和铰链侧一起决定开门转向，所以它必须来自几何而不是 `swing`：
 * `swing` 只是「内外翻转」的美术开关，和这面墙到底哪边是屋里没有关系。
 */
export function doorInteriorSide(
  wall:
    | {
        start: { x: number; y: number }
        end: { x: number; y: number }
        thickness?: number
      }
    | null
    | undefined,
  door: { t?: number; width?: number } | null | undefined,
  floorPolygons: Array<Array<{ x: number; y: number }>> | null | undefined,
  pixelsPerMeter = 1,
) {
  if (!wall) return 0
  const wallDeltaX = wall.end.x - wall.start.x,
    wallDeltaY = wall.end.y - wall.start.y,
    wallSpan = Math.hypot(wallDeltaX, wallDeltaY)
  if (!(wallSpan > 1e-7) || !floorPolygons?.length) return 0
  const doorCenterT = clampWindowT(wall, door, pixelsPerMeter),
    doorCenter = {
      x: wall.start.x + wallDeltaX * doorCenterT,
      y: wall.start.y + wallDeltaY * doorCenterT,
    },
    probeDistance = (Math.max(0, Number(wall.thickness) || 0) / 2 + 0.1) * Math.max(Number(pixelsPerMeter) || 1, 1e-7),
    probePoint = (direction: number) => ({
      x: doorCenter.x - (wallDeltaY / wallSpan) * probeDistance * direction,
      y: doorCenter.y + (wallDeltaX / wallSpan) * probeDistance * direction,
    }),
    positiveSideInside = floorPolygons.some((polygon) => pointInPolygon(probePoint(1), polygon)),
    negativeSideInside = floorPolygons.some((polygon) => pointInPolygon(probePoint(-1), polygon))
  return positiveSideInside === negativeSideInside ? 0 : positiveSideInside ? 1 : -1
}

/**
 * 门铰链的横向位置与镜像系数（0.8.1 `hingeX` / `hingeScaleX`）。
 *
 * 右铰门的枢纽在 +x、左铰门在 -x；`hingeScaleX` 用 ±1 表示门扇是否镜像，
 * 供 `lock-motion` 在不重算几何的情况下把铰链链到正确一侧。
 */
export function doorHingePlacement(door: { hinge?: string } | null | undefined, leafWidth: number) {
  const hingeSign = door?.hinge === 'right' ? 1 : -1
  return {
    hingeX: (hingeSign * Math.abs(Number(leafWidth) || 0)) / 2,
    hingeScaleX: hingeSign,
  }
}
