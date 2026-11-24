/**
 * 多边形 / 墙体轮廓运算：面积、点在多边形内、布尔（差/并）、墙段闭合面与楼层多边形。
 *
 * 从 `geometry.ts` 拆出（纯移动，无逻辑改动）：这 611 行是**纯函数**（无 DOM / 无 three），
 * 依赖面只有三个几何原语与 `clamp`，与墙体的吸附/拖拽/尺寸调整没有交集。
 *
 * 调用方仍从 `./geometry` 导入（那里 `export *` 转发），因此没有任何调用点需要改。
 * 这组函数的正确性由 `check:plan-geometry` / `check:studio-placement` /
 * `check:scene-payload` 三条不变量门禁守着。
 */
import { clamp } from './geometry-clamp'
import {
  cross2d,
  distance,
  lerpPoint,
  pointDelta,
  projectPointToSegment,
  segmentIntersection,
} from './geometry-primitives'

export function polygonArea(polygonPoints: any) {
  let areaSum = 0
  for (let vertexIndex = 0; vertexIndex < polygonPoints.length; vertexIndex += 1) {
    const currentVertex = polygonPoints[vertexIndex],
      nextVertex = polygonPoints[(vertexIndex + 1) % polygonPoints.length]
    areaSum += currentVertex.x * nextVertex.y - nextVertex.x * currentVertex.y
  }
  return areaSum / 2
}
export function pointInPolygon(polygonTestPoint: any, polygonVertices: any, edgeTolerance = 1e-7) {
  if (!Array.isArray(polygonVertices) || polygonVertices.length < 3) return false
  const edgeToleranceValue = Math.max(Number(edgeTolerance) || 0, 1e-7)
  let isInside = false
  for (let polygonIndex = 0; polygonIndex < polygonVertices.length; polygonIndex += 1) {
    const segmentStartVertex = polygonVertices[polygonIndex],
      segmentEndVertex = polygonVertices[(polygonIndex + 1) % polygonVertices.length]
    if (projectPointToSegment(polygonTestPoint, segmentStartVertex, segmentEndVertex).distance <= edgeToleranceValue)
      return true
    if (!(segmentStartVertex.y > polygonTestPoint.y != segmentEndVertex.y > polygonTestPoint.y)) continue
    segmentStartVertex.x +
      ((polygonTestPoint.y - segmentStartVertex.y) * (segmentEndVertex.x - segmentStartVertex.x)) /
        (segmentEndVertex.y - segmentStartVertex.y) >
      polygonTestPoint.x && (isInside = !isInside)
  }
  return isInside
}
function pushClampedT(buckets: any, bucketIndex: any, candidateT: any, tolerance: any) {
  candidateT < -tolerance || candidateT > 1 + tolerance || buckets[bucketIndex].push(clamp(candidateT, 0, 1))
}
function clampT(loopPoints: any, distanceTolerance: any) {
  const dedupedPoints = loopPoints.filter(
    (keptPoint: any, pointIndex: any) =>
      pointIndex === 0 || distance(keptPoint, loopPoints[pointIndex - 1]) > distanceTolerance,
  )
  if (
    (dedupedPoints.length > 1 &&
      distance(dedupedPoints[0], dedupedPoints.at(-1)) <= distanceTolerance &&
      dedupedPoints.pop(),
    dedupedPoints.length < 3)
  )
    return []
  let hasRemovedPoint = true
  for (; hasRemovedPoint && dedupedPoints.length >= 3; ) {
    hasRemovedPoint = false
    for (let loopIndex = 0; loopIndex < dedupedPoints.length; loopIndex += 1) {
      const previousPoint = dedupedPoints[(loopIndex - 1 + dedupedPoints.length) % dedupedPoints.length],
        cornerPoint = dedupedPoints[loopIndex],
        followingPoint = dedupedPoints[(loopIndex + 1) % dedupedPoints.length],
        incomingEdge = pointDelta(cornerPoint, previousPoint),
        outgoingEdge = pointDelta(followingPoint, cornerPoint),
        edgeLengthProduct = Math.max(
          Math.hypot(incomingEdge.x, incomingEdge.y) * Math.hypot(outgoingEdge.x, outgoingEdge.y),
          1,
        )
      if (!(Math.abs(cross2d(incomingEdge, outgoingEdge)) > distanceTolerance * edgeLengthProduct)) {
        dedupedPoints.splice(loopIndex, 1), (hasRemovedPoint = true)
        break
      }
    }
  }
  return dedupedPoints
}
export function subtractPolygonLoops(targetLoops: any, holeLoops: any, loopTolerance = 0.000001) {
  return unionPolygonLoops(targetLoops, loopTolerance, holeLoops)
}
function unionPolygonLoops(sourceLoops: any, unionTolerance = 0.000001, additionalLoops: any[] = []) {
  return unionLoops(sourceLoops, unionTolerance, additionalLoops)
}
function unionLoops(firstLoopSet: any, mergeDistance: any, extraLoops: any[] = [], shouldSkipUnion = false) {
  const epsilon = Math.max(Number(mergeDistance) || 0, 1e-7),
    primaryLoops = (firstLoopSet || [])
      .filter((loopCandidate: any) => Array.isArray(loopCandidate) && loopCandidate.length >= 3)
      .map((loop: any) =>
        loop.map((rawVertex: any) => ({
          x: Number(rawVertex.x) || 0,
          y: Number(rawVertex.y) || 0,
        })),
      )
      .filter((areaLoop: any) => Math.abs(polygonArea(areaLoop)) > epsilon * epsilon)
  if (!primaryLoops.length) return []
  const variantLoops = extraLoops.filter(
      (variantLoop) =>
        Array.isArray(variantLoop) &&
        variantLoop.length >= 3 &&
        variantLoop.every((finiteVertex: any) => Number.isFinite(finiteVertex.x) && Number.isFinite(finiteVertex.y)) &&
        Math.abs(polygonArea(variantLoop)) > epsilon * epsilon,
    ),
    edges: any[] = []
  for (const sourceLoop of [...primaryLoops, ...variantLoops])
    for (let edgeIndex = 0; edgeIndex < sourceLoop.length; edgeIndex += 1) {
      const edgeStart = sourceLoop[edgeIndex],
        edgeEnd = sourceLoop[(edgeIndex + 1) % sourceLoop.length]
      distance(edgeStart, edgeEnd) > epsilon &&
        edges.push({
          start: edgeStart,
          end: edgeEnd,
        })
    }
  const splitParamsByEdge = edges.map(() => [0, 1])
  for (let firstEdgeIndex = 0; firstEdgeIndex < edges.length; firstEdgeIndex += 1) {
    const firstEdge = edges[firstEdgeIndex],
      firstEdgeVector = pointDelta(firstEdge.end, firstEdge.start),
      firstEdgeLengthSquared = firstEdgeVector.x * firstEdgeVector.x + firstEdgeVector.y * firstEdgeVector.y
    for (let secondEdgeIndex = firstEdgeIndex + 1; secondEdgeIndex < edges.length; secondEdgeIndex += 1) {
      const secondEdge = edges[secondEdgeIndex],
        secondEdgeVector = pointDelta(secondEdge.end, secondEdge.start),
        secondEdgeLengthSquared = secondEdgeVector.x * secondEdgeVector.x + secondEdgeVector.y * secondEdgeVector.y,
        edgeStartDelta = pointDelta(secondEdge.start, firstEdge.start),
        edgeCross = cross2d(firstEdgeVector, secondEdgeVector),
        crossTolerance = epsilon * Math.max(Math.sqrt(firstEdgeLengthSquared * secondEdgeLengthSquared), 1)
      if (Math.abs(edgeCross) > crossTolerance) {
        const secondEdgeSplitT = cross2d(edgeStartDelta, secondEdgeVector) / edgeCross,
          firstEdgeSplitT = cross2d(edgeStartDelta, firstEdgeVector) / edgeCross
        if (
          secondEdgeSplitT < -epsilon ||
          secondEdgeSplitT > 1 + epsilon ||
          firstEdgeSplitT < -epsilon ||
          firstEdgeSplitT > 1 + epsilon
        )
          continue
        pushClampedT(splitParamsByEdge, firstEdgeIndex, secondEdgeSplitT, epsilon),
          pushClampedT(splitParamsByEdge, secondEdgeIndex, firstEdgeSplitT, epsilon)
        continue
      }
      if (Math.abs(cross2d(edgeStartDelta, firstEdgeVector)) > epsilon * Math.max(Math.sqrt(firstEdgeLengthSquared), 1))
        continue
      const firstEdgeProjectionT =
          (edgeStartDelta.x * firstEdgeVector.x + edgeStartDelta.y * firstEdgeVector.y) / firstEdgeLengthSquared,
        secondEdgeEndDelta = pointDelta(secondEdge.end, firstEdge.start),
        firstEdgeEndProjectionT =
          (secondEdgeEndDelta.x * firstEdgeVector.x + secondEdgeEndDelta.y * firstEdgeVector.y) / firstEdgeLengthSquared
      pushClampedT(splitParamsByEdge, firstEdgeIndex, firstEdgeProjectionT, epsilon),
        pushClampedT(splitParamsByEdge, firstEdgeIndex, firstEdgeEndProjectionT, epsilon)
      const firstEdgeStartDelta = pointDelta(firstEdge.start, secondEdge.start),
        secondEdgeProjectionT =
          (firstEdgeStartDelta.x * secondEdgeVector.x + firstEdgeStartDelta.y * secondEdgeVector.y) /
          secondEdgeLengthSquared,
        firstEdgeEndDelta = pointDelta(firstEdge.end, secondEdge.start),
        secondEdgeEndProjectionT =
          (firstEdgeEndDelta.x * secondEdgeVector.x + firstEdgeEndDelta.y * secondEdgeVector.y) /
          secondEdgeLengthSquared
      pushClampedT(splitParamsByEdge, secondEdgeIndex, secondEdgeProjectionT, epsilon),
        pushClampedT(splitParamsByEdge, secondEdgeIndex, secondEdgeEndProjectionT, epsilon)
    }
  }
  const isInsidePrimaryLoop = (candidatePoint: any) =>
      primaryLoops.some((primaryLoop: any) => pointInPolygon(candidatePoint, primaryLoop, epsilon)) &&
      !variantLoops.some((exclusionLoop) => pointInPolygon(candidatePoint, exclusionLoop, epsilon)),
    quantizeStep = epsilon * 8,
    quantizedPointMap = new Map(),
    quantizePoint = (inputVertex: any) => {
      const quantizedX = Math.round(inputVertex.x / quantizeStep) * quantizeStep,
        quantizedY = Math.round(inputVertex.y / quantizeStep) * quantizeStep,
        quantizedKey = Math.round(quantizedX / quantizeStep) + ',' + Math.round(quantizedY / quantizeStep)
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
      )
    },
    outputEdges: any = [],
    emittedPointKeySet = new Set()
  edges.forEach((sourceEdge, sourceEdgeIndex) => {
    const splitParams = [...splitParamsByEdge[sourceEdgeIndex]]
      .sort((leftSplitParam, rightSplitParam) => leftSplitParam - rightSplitParam)
      .filter(
        (nextSplitParam, splitParamIndex, splitParamList) =>
          splitParamIndex === 0 || nextSplitParam - splitParamList[splitParamIndex - 1] > epsilon,
      )
    for (let paramCursor = 0; paramCursor < splitParams.length - 1; paramCursor += 1) {
      const segmentStartPoint = lerpPoint(sourceEdge.start, sourceEdge.end, splitParams[paramCursor]),
        segmentEndPoint = lerpPoint(sourceEdge.start, sourceEdge.end, splitParams[paramCursor + 1]),
        segmentDistance = distance(segmentStartPoint, segmentEndPoint)
      if (segmentDistance <= epsilon) continue
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
        isSecondOffsetInside = isInsidePrimaryLoop(offsetPointB)
      if (isFirstOffsetInside === isSecondOffsetInside) continue
      const entryPoint = quantizePoint(isFirstOffsetInside ? segmentStartPoint : segmentEndPoint),
        exitPoint = quantizePoint(isFirstOffsetInside ? segmentEndPoint : segmentStartPoint)
      if (entryPoint.key === exitPoint.key) continue
      const edgeKey = [entryPoint.key, exitPoint.key].sort().join('|')
      emittedPointKeySet.has(edgeKey) ||
        (emittedPointKeySet.add(edgeKey),
        outputEdges.push({
          start: entryPoint,
          end: exitPoint,
        }))
    }
  })
  const edgesByStartKey = new Map()
  outputEdges.forEach((outputEdge: any, outputEdgeIndex: any) => {
    edgesByStartKey.has(outputEdge.start.key) || edgesByStartKey.set(outputEdge.start.key, []),
      edgesByStartKey.get(outputEdge.start.key).push(outputEdgeIndex)
  })
  const remainingEdgeIndexSet = new Set(outputEdges.map((_edgeEntry: any, outputIndex: any) => outputIndex)),
    mergedLoops: any[] = []
  for (; remainingEdgeIndexSet.size; ) {
    const startEdgeIndex: any = remainingEdgeIndexSet.values().next().value,
      startEdge = outputEdges[startEdgeIndex],
      chainPoints = [startEdge.start.point]
    let currentIndex = startEdgeIndex,
      isClosed = false
    for (let stepLimit = 0; stepLimit <= outputEdges.length; stepLimit += 1) {
      const currentEdge = outputEdges[currentIndex]
      if ((remainingEdgeIndexSet.delete(currentIndex), currentEdge.end.key === startEdge.start.key)) {
        isClosed = true
        break
      }
      chainPoints.push(currentEdge.end.point)
      const candidateEdges = (edgesByStartKey.get(currentEdge.end.key) || []).filter((candidateEdgeIndex: any) =>
        remainingEdgeIndexSet.has(candidateEdgeIndex),
      )
      if (!candidateEdges.length) break
      if (candidateEdges.length === 1) {
        currentIndex = candidateEdges[0]
        continue
      }
      const currentEdgeVector = pointDelta(currentEdge.end.point, currentEdge.start.point)
      currentIndex = candidateEdges
        .map((turnCandidateIndex: any) => {
          const turnEdge = outputEdges[turnCandidateIndex],
            turnEdgeVector = pointDelta(turnEdge.end.point, turnEdge.start.point)
          return {
            index: turnCandidateIndex,
            turn: Math.atan2(
              cross2d(currentEdgeVector, turnEdgeVector),
              currentEdgeVector.x * turnEdgeVector.x + currentEdgeVector.y * turnEdgeVector.y,
            ),
          }
        })
        .sort(
          (leftTurnCandidate: any, rightTurnCandidate: any) => rightTurnCandidate.turn - leftTurnCandidate.turn,
        )[0].index
    }
    if (!isClosed) {
      if (shouldSkipUnion) return []
      continue
    }
    const cleanedLoop = clampT(chainPoints, epsilon * 8)
    cleanedLoop.length >= 3 && Math.abs(polygonArea(cleanedLoop)) > epsilon * epsilon && mergedLoops.push(cleanedLoop)
  }
  return mergedLoops.sort(
    (firstAreaLoop, secondAreaLoop) => Math.abs(polygonArea(secondAreaLoop)) - Math.abs(polygonArea(firstAreaLoop)),
  )
}
export function validatedUnionPolygonLoops(rawLoops: any, validationTolerance = 0.000001) {
  const loopAreaTolerance = Math.max(Number(validationTolerance) || 0, 1e-7),
    acceptedLoops = (rawLoops || [])
      .filter((wellFormedLoop: any) => Array.isArray(wellFormedLoop) && wellFormedLoop.length >= 3)
      .filter((sizedLoop: any) => Math.abs(polygonArea(sizedLoop)) > loopAreaTolerance * loopAreaTolerance)
  if (!acceptedLoops.length) return []
  const unionedLoops = unionLoops(acceptedLoops, loopAreaTolerance, [], true)
  if (!unionedLoops.length) return []
  const rawLoopAreaSum = acceptedLoops.reduce(
      (loopAreaTotal: any, measuredLoop: any) => loopAreaTotal + Math.abs(polygonArea(measuredLoop)),
      0,
    ),
    unionedLoopArea = unionedLoops.reduce(
      (unionedAreaTotal, unionedLoop) => unionedAreaTotal + polygonArea(unionedLoop),
      0,
    ),
    areaMismatchTolerance = Math.max(rawLoopAreaSum * 0.001, loopAreaTolerance * loopAreaTolerance * 1024)
  return unionedLoopArea <= areaMismatchTolerance || unionedLoopArea > rawLoopAreaSum + areaMismatchTolerance
    ? []
    : unionedLoops
}
function buildSegmentGrid(sourceSegments: any, cellSize: any) {
  const nodePoints: any = [],
    nodeSegments: any = [],
    nodeIndicesByCell = new Map(),
    nodeIndexForPoint = (gridPoint: any) => {
      const cellX = Math.floor(gridPoint.x / cellSize),
        cellY = Math.floor(gridPoint.y / cellSize)
      let nearestNodeIndex = -1
      for (let cellOffsetX = -1; cellOffsetX <= 1; cellOffsetX += 1)
        for (let cellOffsetY = -1; cellOffsetY <= 1; cellOffsetY += 1)
          for (const candidateNodeIndex of nodeIndicesByCell.get(cellX + cellOffsetX + ',' + (cellY + cellOffsetY)) ||
            [])
            (nearestNodeIndex < 0 || candidateNodeIndex < nearestNodeIndex) &&
              distance(nodePoints[candidateNodeIndex], gridPoint) <= cellSize &&
              (nearestNodeIndex = candidateNodeIndex)
      if (nearestNodeIndex >= 0) return nearestNodeIndex
      const newNodeIndex = nodePoints.length
      nodePoints.push({
        x: gridPoint.x,
        y: gridPoint.y,
      }),
        nodeSegments.push([])
      const cellKey = cellX + ',' + cellY
      return (
        nodeIndicesByCell.has(cellKey) || nodeIndicesByCell.set(cellKey, []),
        nodeIndicesByCell.get(cellKey).push(newNodeIndex),
        newNodeIndex
      )
    },
    orderedPairKey = (leftNodeIndex: any, rightNodeIndex: any) =>
      leftNodeIndex < rightNodeIndex ? leftNodeIndex + ',' + rightNodeIndex : rightNodeIndex + ',' + leftNodeIndex,
    segmentBoxes: any[] = [],
    seenPairKeySet = new Set()
  for (const segment of sourceSegments || []) {
    if (![segment?.start?.x, segment?.start?.y, segment?.end?.x, segment?.end?.y].every(Number.isFinite)) continue
    const segmentStartNode = nodeIndexForPoint(segment.start),
      segmentEndNode = nodeIndexForPoint(segment.end)
    if (segmentStartNode === segmentEndNode) continue
    nodeSegments[segmentStartNode].push(segment), nodeSegments[segmentEndNode].push(segment)
    const segmentKey = orderedPairKey(segmentStartNode, segmentEndNode)
    if (seenPairKeySet.has(segmentKey)) continue
    seenPairKeySet.add(segmentKey)
    const startNodePoint = nodePoints[segmentStartNode],
      endNodePoint = nodePoints[segmentEndNode]
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
    })
  }
  const addSegmentCut = (boxedSegment: any, cutNodeIndex: any) => {
    if (cutNodeIndex === boxedSegment.start || cutNodeIndex === boxedSegment.end) return
    const projectedHit = projectPointToSegment(
      nodePoints[cutNodeIndex],
      nodePoints[boxedSegment.start],
      nodePoints[boxedSegment.end],
    )
    projectedHit.t > 0 &&
      projectedHit.t < 1 &&
      projectedHit.distance <= cellSize &&
      boxedSegment.cuts.push({
        t: projectedHit.t,
        node: cutNodeIndex,
      })
  }
  segmentBoxes.sort((leftBox, rightBox) => leftBox.minX - rightBox.minX)
  for (let outerBoxIndex = 0; outerBoxIndex < segmentBoxes.length; outerBoxIndex += 1) {
    const outerSegmentBox = segmentBoxes[outerBoxIndex]
    for (let innerBoxIndex = outerBoxIndex + 1; innerBoxIndex < segmentBoxes.length; innerBoxIndex += 1) {
      const innerSegmentBox = segmentBoxes[innerBoxIndex]
      if (innerSegmentBox.minX > outerSegmentBox.maxX + cellSize) break
      if (
        innerSegmentBox.minY > outerSegmentBox.maxY + cellSize ||
        innerSegmentBox.maxY < outerSegmentBox.minY - cellSize
      )
        continue
      addSegmentCut(outerSegmentBox, innerSegmentBox.start),
        addSegmentCut(outerSegmentBox, innerSegmentBox.end),
        addSegmentCut(innerSegmentBox, outerSegmentBox.start),
        addSegmentCut(innerSegmentBox, outerSegmentBox.end)
      const segmentCrossingPoint = segmentIntersection(
        nodePoints[outerSegmentBox.start],
        nodePoints[outerSegmentBox.end],
        nodePoints[innerSegmentBox.start],
        nodePoints[innerSegmentBox.end],
      )
      if (segmentCrossingPoint) {
        const crossingNodeIndex = nodeIndexForPoint(segmentCrossingPoint)
        addSegmentCut(outerSegmentBox, crossingNodeIndex), addSegmentCut(innerSegmentBox, crossingNodeIndex)
      }
    }
  }
  const nodeEdges: any[] = [],
    seenEdgeKeySet = new Set()
  for (const cutSegmentBox of segmentBoxes) {
    cutSegmentBox.cuts.sort((firstCut: any, secondCut: any) => firstCut.t - secondCut.t)
    let previousNodeIndex = cutSegmentBox.cuts[0].node
    for (const nextCut of cutSegmentBox.cuts.slice(1)) {
      const nextNodeIndex = nextCut.node,
        faceEdgeKey = orderedPairKey(previousNodeIndex, nextNodeIndex)
      previousNodeIndex !== nextNodeIndex &&
        !seenEdgeKeySet.has(faceEdgeKey) &&
        (seenEdgeKeySet.add(faceEdgeKey),
        nodeEdges.push({
          start: previousNodeIndex,
          end: nextNodeIndex,
        })),
        (previousNodeIndex = nextNodeIndex)
    }
  }
  return {
    nodes: nodePoints,
    edges: nodeEdges,
    endpointWalls: nodeSegments,
  }
}
function wallPolygonFaces(polygonWalls: any, faceTolerance: any) {
  const { nodes: polygonNodes, edges: polygonEdges } = buildSegmentGrid(polygonWalls, faceTolerance),
    nodeEdgeIndices = Array.from(
      {
        length: polygonNodes.length,
      },
      () => [] as any[],
    ),
    edgeRecords: any = []
  for (const edgeRecord of polygonEdges) {
    const edgeRecordIndex = edgeRecords.length
    edgeRecords.push(
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
      nodeEdgeIndices[edgeRecord.end].push(edgeRecordIndex + 1)
  }
  const pairedEdgeIndex = new Int32Array(edgeRecords.length)
  nodeEdgeIndices.forEach((edgeIndicesAtNode, edgeNodeIndex) => {
    const edgeAngleAtNode = (slotEdgeIndex: any) =>
      Math.atan2(
        polygonNodes[edgeRecords[slotEdgeIndex].end].y - polygonNodes[edgeNodeIndex].y,
        polygonNodes[edgeRecords[slotEdgeIndex].end].x - polygonNodes[edgeNodeIndex].x,
      )
    edgeIndicesAtNode.sort(
      (leftEdgeSlot, rightEdgeSlot) => edgeAngleAtNode(leftEdgeSlot) - edgeAngleAtNode(rightEdgeSlot),
    ),
      edgeIndicesAtNode.forEach((edgeSlot, orderedPosition) => {
        pairedEdgeIndex[edgeSlot] = orderedPosition
      })
  })
  const nextSlotByEdge = edgeRecords.map((traversedEdge: any, edgeSlotIndex: any) => {
      const edgeIndicesAtEnd = nodeEdgeIndices[traversedEdge.end]
      return edgeIndicesAtEnd[
        (pairedEdgeIndex[edgeSlotIndex ^ 1] + edgeIndicesAtEnd.length - 1) % edgeIndicesAtEnd.length
      ]
    }),
    visitedEdgeSlots = new Uint8Array(edgeRecords.length),
    faceByKey = new Map(),
    recordFaceLoop = (loopNodeIndices: any) => {
      if (loopNodeIndices.length < 3) return
      const loopVertices = loopNodeIndices.map((loopNodeIndex: any) => polygonNodes[loopNodeIndex]),
        loopAnchorPoint = loopVertices[0],
        signedLoopArea = polygonArea(loopVertices.map((loopPoint: any) => pointDelta(loopPoint, loopAnchorPoint)))
      if (Math.abs(signedLoopArea) <= faceTolerance * faceTolerance) return
      const orientedLoop = signedLoopArea > 0 ? loopNodeIndices : [...loopNodeIndices].reverse()
      let minimumIndex = 0
      for (let loopVertexIndex = 1; loopVertexIndex < orientedLoop.length; loopVertexIndex += 1)
        orientedLoop[loopVertexIndex] < orientedLoop[minimumIndex] && (minimumIndex = loopVertexIndex)
      const canonicalLoopKey = [...orientedLoop.slice(minimumIndex), ...orientedLoop.slice(0, minimumIndex)].join(','),
        existingFace = faceByKey.get(canonicalLoopKey)
      if (existingFace) {
        existingFace.outer ||= signedLoopArea < 0
        return
      }
      const simplifiedLoop = clampT(
        orientedLoop.map((mappedNodeIndex: any) => ({
          ...polygonNodes[mappedNodeIndex],
        })),
        1e-7,
      )
      simplifiedLoop.length >= 3 &&
        faceByKey.set(canonicalLoopKey, {
          polygon: simplifiedLoop,
          area: Math.abs(signedLoopArea),
          outer: signedLoopArea < 0,
        })
    }
  for (let seedEdgeSlot = 0; seedEdgeSlot < edgeRecords.length; seedEdgeSlot += 1) {
    if (visitedEdgeSlots[seedEdgeSlot]) continue
    const pendingNodeIndices: any = [],
      stackIndexByNode = new Map()
    let walkNodeIndex = seedEdgeSlot
    const traverseFaceLoop = (startNodeIndex: any) => {
      const stackPosition = stackIndexByNode.get(startNodeIndex)
      if (stackPosition !== undefined) {
        for (recordFaceLoop(pendingNodeIndices.slice(stackPosition)); pendingNodeIndices.length > stackPosition + 1; )
          stackIndexByNode.delete(pendingNodeIndices.pop())
      } else stackIndexByNode.set(startNodeIndex, pendingNodeIndices.length), pendingNodeIndices.push(startNodeIndex)
    }
    for (; !visitedEdgeSlots[walkNodeIndex]; )
      (visitedEdgeSlots[walkNodeIndex] = 1),
        traverseFaceLoop(edgeRecords[walkNodeIndex].start),
        (walkNodeIndex = nextSlotByEdge[walkNodeIndex])
    walkNodeIndex === seedEdgeSlot && traverseFaceLoop(edgeRecords[seedEdgeSlot].start)
  }
  return [...faceByKey.values()].sort((faceA, faceB) => faceB.area - faceA.area)
}
export function closedWallPolygons(closedWalls: any, closedTolerance = 1) {
  const closedWallTolerance = Math.max(Number(closedTolerance) || 0, 1e-7)
  return wallPolygonFaces(closedWalls, closedWallTolerance).map((face) => face.polygon)
}
function wallEndpointNodes(endpointSourceWalls: any, wallEndpointTolerance = 1) {
  const endpointWallTolerance = Math.max(Number(wallEndpointTolerance) || 0, 1e-7),
    {
      nodes: endpointNodes,
      edges: endpointEdgeList,
      endpointWalls: endpointWalls,
    } = buildSegmentGrid(endpointSourceWalls, endpointWallTolerance),
    nodeDegreeCounts = new Uint32Array(endpointNodes.length)
  for (const countedEdge of endpointEdgeList)
    (nodeDegreeCounts[countedEdge.start] += 1), (nodeDegreeCounts[countedEdge.end] += 1)
  return endpointNodes.flatMap((node: any, nodeIndex: any) =>
    nodeDegreeCounts[nodeIndex] === 1
      ? [
          {
            point: node,
            walls: endpointWalls[nodeIndex],
          },
        ]
      : [],
  )
}

function isPointWithinPolygon(samplePoint: any, boundaryPolygon: any, insideTolerance: any) {
  return pointInPolygon(samplePoint, boundaryPolygon, insideTolerance)
    ? boundaryPolygon.every(
        (edgeVertex: any, edgeVertexIndex: any) =>
          projectPointToSegment(
            samplePoint,
            edgeVertex,
            boundaryPolygon[(edgeVertexIndex + 1) % boundaryPolygon.length],
          ).distance > insideTolerance,
      )
    : false
}
export function unclosedWallEndpoints(unclosedWalls: any, unclosedTolerance = 1, knownFloorPolygons: any = null) {
  const unclosedWallTolerance = Math.max(Number(unclosedTolerance) || 0, 1e-7),
    floorPolygonList = Array.isArray(knownFloorPolygons)
      ? knownFloorPolygons
      : closedWallFloorPolygons(unclosedWalls, unclosedWallTolerance)
  return wallEndpointNodes(unclosedWalls, unclosedWallTolerance)
    .filter(
      (openEndpoint: any) =>
        !openEndpoint.walls.length ||
        openEndpoint.walls.some((endpointWall: any) => endpointWall.allowOpenEnd !== true),
    )
    .filter(
      (candidateEndpoint: any) =>
        !floorPolygonList.some((floorPolygon: any) =>
          isPointWithinPolygon(candidateEndpoint.point, floorPolygon, unclosedWallTolerance),
        ),
    )
    .map((acceptedEndpoint: any) => ({
      ...acceptedEndpoint.point,
    }))
}
function isPolygonInsidePolygon(innerPolygon: any, outerPolygon: any, containmentTolerance: any) {
  const toleranceSquared = containmentTolerance * containmentTolerance,
    polygonAreaMagnitude = (areaPolygon: any) =>
      Math.abs(polygonArea(areaPolygon.map((areaVertex: any) => pointDelta(areaVertex, areaPolygon[0]))))
  return polygonAreaMagnitude(outerPolygon) <= polygonAreaMagnitude(innerPolygon) + toleranceSquared
    ? false
    : innerPolygon.every((containedVertex: any, containedVertexIndex: any) => {
        if (!pointInPolygon(containedVertex, outerPolygon, containmentTolerance)) return false
        const followingVertex = innerPolygon[(containedVertexIndex + 1) % innerPolygon.length],
          midpoint = {
            x: (containedVertex.x + followingVertex.x) / 2,
            y: (containedVertex.y + followingVertex.y) / 2,
          }
        return pointInPolygon(midpoint, outerPolygon, containmentTolerance)
      })
}
export function closedWallFloorPolygons(floorSourceWalls: any, floorTolerance = 1) {
  const floorWallTolerance = Math.max(Number(floorTolerance) || 0, 1e-7),
    keptFloorPolygons: any = []
  for (const { polygon: polygon, outer: outer } of wallPolygonFaces(floorSourceWalls, floorWallTolerance))
    !outer ||
      keptFloorPolygons.some((existingPolygon: any) =>
        isPolygonInsidePolygon(polygon, existingPolygon, floorWallTolerance),
      ) ||
      keptFloorPolygons.push(polygon)
  return keptFloorPolygons
}
