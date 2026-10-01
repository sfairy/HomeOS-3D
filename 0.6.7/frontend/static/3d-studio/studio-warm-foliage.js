export function enlargeWarmLeaves(sourceGeometry, materials, enlargeFactor = 1.85) {
  const positionAttribute = sourceGeometry.attributes.position;
  if (!positionAttribute) return sourceGeometry;
  const indexAttribute = sourceGeometry.index,
    geometryGroups = sourceGeometry.groups.length
      ? sourceGeometry.groups
      : [
          {
            start: 0,
            count: indexAttribute?.count ?? positionAttribute.count,
            materialIndex: 0,
          },
        ],
    parentVertexMap = new Map(),
    resolveRootIndex = (vertexIndex) => {
      let currentRootIndex = vertexIndex;
      for (; parentVertexMap.get(currentRootIndex) !== currentRootIndex;)
        currentRootIndex = parentVertexMap.get(currentRootIndex);
      for (; vertexIndex !== currentRootIndex;) {
        const parentVertexIndex = parentVertexMap.get(vertexIndex);
        (parentVertexMap.set(vertexIndex, currentRootIndex), (vertexIndex = parentVertexIndex));
      }
      return currentRootIndex;
    },
    unionVertices = (firstVertexIndex, secondVertexIndex) => {
      parentVertexMap.set(resolveRootIndex(firstVertexIndex), resolveRootIndex(secondVertexIndex));
    },
    vertexIndexByPositionKey = new Map();
  for (const geometryGroup of geometryGroups)
    if (/foliage/i.test(materials[geometryGroup.materialIndex]?.name ?? ""))
      for (
        let triangleStartIndex = geometryGroup.start;
        triangleStartIndex < geometryGroup.start + geometryGroup.count;
        triangleStartIndex += 3
      ) {
        const triangleVertexIndices = [];
        for (let triangleCornerIndex = 0; triangleCornerIndex < 3; triangleCornerIndex++) {
          const cornerVertexIndex = indexAttribute
            ? indexAttribute.getX(triangleStartIndex + triangleCornerIndex)
            : triangleStartIndex + triangleCornerIndex;
          if (!parentVertexMap.has(cornerVertexIndex)) {
            parentVertexMap.set(cornerVertexIndex, cornerVertexIndex);
            const positionKey = [
              positionAttribute.getX(cornerVertexIndex),
              positionAttribute.getY(cornerVertexIndex),
              positionAttribute.getZ(cornerVertexIndex),
            ]
              .map((coordinateComponent) => Math.round(coordinateComponent * 10000))
              .join(",");
            vertexIndexByPositionKey.has(positionKey)
              ? unionVertices(cornerVertexIndex, vertexIndexByPositionKey.get(positionKey))
              : vertexIndexByPositionKey.set(positionKey, cornerVertexIndex);
          }
          triangleVertexIndices.push(cornerVertexIndex);
        }
        (unionVertices(triangleVertexIndices[0], triangleVertexIndices[1]),
          unionVertices(triangleVertexIndices[1], triangleVertexIndices[2]));
      }
  if (!parentVertexMap.size) return sourceGeometry;
  const vertexIndicesByRoot = new Map();
  for (const sourceVertexIndex of parentVertexMap.keys()) {
    const rootVertexIndex = resolveRootIndex(sourceVertexIndex);
    (vertexIndicesByRoot.has(rootVertexIndex) || vertexIndicesByRoot.set(rootVertexIndex, []),
      vertexIndicesByRoot.get(rootVertexIndex).push(sourceVertexIndex));
  }
  const enlargedGeometry = sourceGeometry.clone(),
    enlargedPositionAttribute = enlargedGeometry.attributes.position;
  let groupCounter = 0;
  for (const groupVertexIndices of vertexIndicesByRoot.values()) {
    const minBounds = [Infinity, Infinity, Infinity],
      maxBounds = [-Infinity, -Infinity, -Infinity];
    for (const memberVertexIndex of groupVertexIndices) {
      const vertexCoordinates = [
        positionAttribute.getX(memberVertexIndex),
        positionAttribute.getY(memberVertexIndex),
        positionAttribute.getZ(memberVertexIndex),
      ];
      for (let axisIndex = 0; axisIndex < 3; axisIndex++)
        ((minBounds[axisIndex] = Math.min(minBounds[axisIndex], vertexCoordinates[axisIndex])),
          (maxBounds[axisIndex] = Math.max(maxBounds[axisIndex], vertexCoordinates[axisIndex])));
    }
    const groupCenter = minBounds.map(
        (minBoundCoordinate, boundAxisIndex) =>
          (minBoundCoordinate + maxBounds[boundAxisIndex]) * 0.5,
      ),
      rotationAngle = (((groupCounter++ % 3) - 1) * Math.PI) / 3,
      rotationCos = Math.cos(rotationAngle),
      rotationSin = Math.sin(rotationAngle);
    for (const targetVertexIndex of groupVertexIndices) {
      const centerOffsetX =
          (positionAttribute.getX(targetVertexIndex) - groupCenter[0]) * enlargeFactor,
        centerOffsetZ =
          (positionAttribute.getZ(targetVertexIndex) - groupCenter[2]) * enlargeFactor;
      enlargedPositionAttribute.setXYZ(
        targetVertexIndex,
        groupCenter[0] + centerOffsetX * rotationCos - centerOffsetZ * rotationSin,
        groupCenter[1] +
          (positionAttribute.getY(targetVertexIndex) - groupCenter[1]) * enlargeFactor,
        groupCenter[2] + centerOffsetX * rotationSin + centerOffsetZ * rotationCos,
      );
    }
  }
  return (
    (enlargedPositionAttribute.needsUpdate = true),
    enlargedGeometry.computeVertexNormals(),
    enlargedGeometry.computeBoundingBox(),
    enlargedGeometry.computeBoundingSphere(),
    (enlargedGeometry.userData.warmLeafCount = vertexIndicesByRoot.size),
    enlargedGeometry
  );
}
