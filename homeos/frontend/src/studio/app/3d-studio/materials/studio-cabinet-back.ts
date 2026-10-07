export function repairGlassCabinetBack(three: any, cabinetRoot: any, materialPrefix = "glasscabinet") {
  cabinetRoot.updateMatrixWorld(true);
  let backMesh: any, spanMesh;
  if (
    (cabinetRoot.traverse((mesh: any) => {
      !mesh.isMesh ||
        Array.isArray(mesh.material) ||
        (mesh.material?.name === materialPrefix + "-material-0" && (backMesh = mesh),
        mesh.material?.name ===
          materialPrefix + "-material-" + (materialPrefix === "bookcase" ? 7 : 10) &&
          (spanMesh = mesh));
    }),
    !backMesh || !spanMesh)
  )
    return false;
  (backMesh.geometry.computeBoundingBox(), spanMesh!.geometry.computeBoundingBox());
  const backBounds = backMesh.geometry.boundingBox,
    spanBounds = spanMesh!.geometry.boundingBox
      .clone()
      .applyMatrix4(
        new three.Matrix4().copy(backMesh.matrixWorld).invert().multiply(spanMesh!.matrixWorld!),
      ),
    startZ = Math.min(backBounds.min.z, spanBounds.min.z) - 0.004,
    backBoxGeometry = new three.BoxGeometry(
      spanBounds.max.x - spanBounds.min.x,
      spanBounds.max.y - spanBounds.min.y,
      backBounds.max.z - startZ,
    );
  (backBoxGeometry.translate(
    (spanBounds.min.x + spanBounds.max.x) / 2,
    (spanBounds.min.y + spanBounds.max.y) / 2,
    (startZ + backBounds.max.z) / 2,
  ),
    backBoxGeometry.computeBoundingBox(),
    backBoxGeometry.computeBoundingSphere());
  const previousGeometry = backMesh.geometry;
  backMesh.geometry = backBoxGeometry;
  let isGeometryRetained = false;
  return (
    cabinetRoot.traverse((otherMesh: any) => {
      otherMesh !== backMesh &&
        otherMesh.geometry === previousGeometry &&
        (isGeometryRetained = true);
    }),
    isGeometryRetained || previousGeometry.dispose(),
    true
  );
}
function mergeBoxGeometries(threeBox: any, boxSpecs: any) {
  const positions: any[] = [],
    normals: any[] = [],
    uvs: any[] = [];
  for (const [width, height, depth, offsetX, offsetY, offsetZ] of boxSpecs) {
    const boxGeometry = new threeBox.BoxGeometry(width, height, depth),
      nonIndexedGeometry = boxGeometry.toNonIndexed();
    (boxGeometry.dispose(),
      nonIndexedGeometry.translate(offsetX, offsetY, offsetZ),
      positions.push(...nonIndexedGeometry.attributes.position.array),
      normals.push(...nonIndexedGeometry.attributes.normal.array),
      uvs.push(...nonIndexedGeometry.attributes.uv.array),
      nonIndexedGeometry.dispose());
  }
  const mergedGeometry = new threeBox.BufferGeometry();
  return (
    mergedGeometry.setAttribute("position", new threeBox.Float32BufferAttribute(positions, 3)),
    mergedGeometry.setAttribute("normal", new threeBox.Float32BufferAttribute(normals, 3)),
    mergedGeometry.setAttribute("uv", new threeBox.Float32BufferAttribute(uvs, 2)),
    mergedGeometry.computeBoundingBox(),
    mergedGeometry.computeBoundingSphere(),
    mergedGeometry
  );
}
export function repairSideboardJoints(threeSideboard: any, sideboardRoot: any) {
  const sideboardMaterialMeshByName = new Map();
  sideboardRoot.traverse((sweepMesh: any) => {
    sweepMesh.isMesh &&
      !Array.isArray(sweepMesh.material) &&
      sideboardMaterialMeshByName.set(sweepMesh.material?.name, sweepMesh);
  });
  const sideboardBodyMesh = sideboardMaterialMeshByName.get("sideboard-material-0"),
    sideboardJointMesh = sideboardMaterialMeshByName.get("sideboard-material-1"),
    sideboardSplitMesh = sideboardMaterialMeshByName.get("sideboard-material-2");
  if (!sideboardBodyMesh || !sideboardJointMesh || !sideboardSplitMesh) return false;
  for (const sideboardMesh of [sideboardBodyMesh, sideboardJointMesh, sideboardSplitMesh])
    sideboardMesh.geometry.computeBoundingBox();
  const sideboardBounds = sideboardBodyMesh.geometry.boundingBox,
    jointBounds = sideboardJointMesh.geometry.boundingBox,
    splitPositionAttribute = sideboardSplitMesh.geometry.attributes.position;
  let highestBelowSplit = -Infinity,
    lowestAboveSplit = Infinity;
  for (let vertexIndex = 0; vertexIndex < splitPositionAttribute.count; vertexIndex++) {
    const vertexY = splitPositionAttribute.getY(vertexIndex);
    vertexY <= sideboardBounds.max.y
      ? (highestBelowSplit = Math.max(highestBelowSplit, vertexY))
      : (lowestAboveSplit = Math.min(lowestAboveSplit, vertexY));
  }
  if (
    !Number.isFinite(highestBelowSplit) ||
    !Number.isFinite(lowestAboveSplit) ||
    lowestAboveSplit <= sideboardBounds.max.y
  )
    return false;
  const splitCloneGeometry = sideboardSplitMesh.geometry.clone();
  for (
    let cloneVertexIndex = 0;
    cloneVertexIndex < splitPositionAttribute.count;
    cloneVertexIndex++
  )
    splitPositionAttribute.getY(cloneVertexIndex) === highestBelowSplit &&
      splitCloneGeometry.attributes.position.setY(cloneVertexIndex, sideboardBounds.min.y);
  const sideboardGeometrySwaps = [
    [sideboardSplitMesh, splitCloneGeometry],
    [
      sideboardJointMesh,
      mergeBoxGeometries(threeSideboard, [
        [
          jointBounds.max.x - jointBounds.min.x,
          lowestAboveSplit - sideboardBounds.max.y,
          jointBounds.max.z - jointBounds.min.z,
          (jointBounds.min.x + jointBounds.max.x) / 2,
          (lowestAboveSplit + sideboardBounds.max.y) / 2,
          (jointBounds.min.z + jointBounds.max.z) / 2,
        ],
      ]),
    ],
  ];
  for (const [sideboardSwapMesh, sideboardSwapGeometry] of sideboardGeometrySwaps) {
    (sideboardSwapGeometry.computeBoundingBox(), sideboardSwapGeometry.computeBoundingSphere());
    const sideboardReplacedGeometry = sideboardSwapMesh.geometry;
    sideboardSwapMesh.geometry = sideboardSwapGeometry;
    let isGeometryShared = false;
    (sideboardRoot.traverse((candidateMesh: any) => {
      candidateMesh !== sideboardSwapMesh &&
        candidateMesh.geometry === sideboardReplacedGeometry &&
        (isGeometryShared = true);
    }),
      isGeometryShared || sideboardReplacedGeometry.dispose());
  }
  return true;
}
export function repairWallCabinetSides(threeWall: any, wallCabinetRoot: any) {
  const wallMaterialMeshByName = new Map();
  wallCabinetRoot.traverse((wallMesh: any) => {
    wallMesh.isMesh &&
      !Array.isArray(wallMesh.material) &&
      wallMaterialMeshByName.set(wallMesh.material?.name, wallMesh);
  });
  const wallBodyMesh = wallMaterialMeshByName.get("wallcabinet-material-0"),
    wallJointMesh = wallMaterialMeshByName.get("wallcabinet-material-1"),
    wallSplitMesh = wallMaterialMeshByName.get("wallcabinet-material-2");
  if (!wallBodyMesh || !wallJointMesh || !wallSplitMesh) return false;
  for (const wallCabinetMesh of [wallBodyMesh, wallJointMesh, wallSplitMesh])
    wallCabinetMesh.geometry.computeBoundingBox();
  const wallBodyBounds = wallBodyMesh.geometry.boundingBox,
    wallJointBounds = wallJointMesh.geometry.boundingBox,
    wallSplitBounds = wallSplitMesh.geometry.boundingBox,
    bodyWidth = wallBodyBounds.max.x - wallBodyBounds.min.x,
    jointDepth = wallJointBounds.max.z - wallJointBounds.min.z,
    bodyDepth = wallBodyBounds.max.z - wallBodyBounds.min.z,
    bodyCenterX = (wallBodyBounds.min.x + wallBodyBounds.max.x) / 2,
    jointCenterZ = (wallJointBounds.min.z + wallJointBounds.max.z) / 2,
    splitMinY = wallSplitBounds.min.y,
    jointMaxY = wallJointBounds.max.y,
    splitMaxY = wallSplitBounds.max.y,
    insetWidth = bodyWidth - bodyDepth * 2,
    wallGeometrySwaps = [
      [
        wallJointMesh,
        mergeBoxGeometries(threeWall, [
          [
            bodyDepth,
            jointMaxY - splitMinY,
            jointDepth,
            bodyCenterX - (bodyWidth - bodyDepth) / 2,
            (splitMinY + jointMaxY) / 2,
            jointCenterZ,
          ],
          [
            bodyDepth,
            jointMaxY - splitMinY,
            jointDepth,
            bodyCenterX + (bodyWidth - bodyDepth) / 2,
            (splitMinY + jointMaxY) / 2,
            jointCenterZ,
          ],
          [
            insetWidth,
            jointMaxY - splitMaxY,
            jointDepth,
            bodyCenterX,
            (splitMaxY + jointMaxY) / 2,
            jointCenterZ,
          ],
        ]),
      ],
      [
        wallSplitMesh,
        mergeBoxGeometries(threeWall, [
          [insetWidth, bodyDepth, jointDepth, bodyCenterX, splitMinY + bodyDepth / 2, jointCenterZ],
          [insetWidth, bodyDepth, jointDepth, bodyCenterX, splitMaxY - bodyDepth / 2, jointCenterZ],
        ]),
      ],
      [
        wallBodyMesh,
        mergeBoxGeometries(threeWall, [
          [
            insetWidth,
            splitMaxY - splitMinY - bodyDepth * 2,
            bodyDepth,
            bodyCenterX,
            (splitMinY + splitMaxY) / 2,
            wallJointBounds.min.z + bodyDepth / 2,
          ],
        ]),
      ],
    ];
  for (const [wallSwapMesh, wallSwapGeometry] of wallGeometrySwaps) {
    const wallReplacedGeometry = wallSwapMesh.geometry;
    wallSwapMesh.geometry = wallSwapGeometry;
    let isGeometryReferenced = false;
    (wallCabinetRoot.traverse((siblingMesh: any) => {
      siblingMesh !== wallSwapMesh &&
        siblingMesh.geometry === wallReplacedGeometry &&
        (isGeometryReferenced = true);
    }),
      isGeometryReferenced || wallReplacedGeometry.dispose());
  }
  return true;
}

/** 由 position / normal / uv 数组拼一块 BufferGeometry（并算好包围盒）。 */
function buildPartGeometry(threePart: any, partData: any) {
  const partGeometry = new threePart.BufferGeometry();
  return (
    partGeometry.setAttribute(
      "position",
      new threePart.Float32BufferAttribute(partData.position, 3),
    ),
    partData.normal.length
      ? partGeometry.setAttribute(
          "normal",
          new threePart.Float32BufferAttribute(partData.normal, 3),
        )
      : partGeometry.computeVertexNormals(),
    partData.uv.length &&
      partGeometry.setAttribute("uv", new threePart.Float32BufferAttribute(partData.uv, 2)),
    partGeometry.computeBoundingBox(),
    partGeometry.computeBoundingSphere(),
    partGeometry
  );
}

/** 把一槽门板（`sideboard-material-3` 这种「6 扇门并进一个图元」的三角面汤）还原成**独立的门板盒子**。 */
function clusterCabinetDoorBoxes(position: any, counterTopY: any) {
  const spans: any[] = [];
  for (let triangleStart = 0; triangleStart < position.count; triangleStart += 3) {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (let cornerIndex = 0; cornerIndex < 3; cornerIndex += 1) {
      const cornerX = position.getX(triangleStart + cornerIndex),
        cornerY = position.getY(triangleStart + cornerIndex),
        cornerZ = position.getZ(triangleStart + cornerIndex);
      ((minX = Math.min(minX, cornerX)),
        (maxX = Math.max(maxX, cornerX)),
        (minY = Math.min(minY, cornerY)),
        (maxY = Math.max(maxY, cornerY)),
        (minZ = Math.min(minZ, cornerZ)),
        (maxZ = Math.max(maxZ, cornerZ)));
    }
    if (Number.isFinite(minX)) spans.push({ minX, maxX, minY, maxY, minZ, maxZ });
  }
  if (!spans.length) return [];
  spans.sort((left, right) => left.minX - right.minX || left.minY - right.minY);
  const columns: any[] = [];
  for (const span of spans) {
    const column: any = columns[columns.length - 1];
    if (!column || span.minX - column.maxX > 0.008) columns.push({ maxX: span.maxX, spans: [span] });
    else (column.spans.push(span), (column.maxX = Math.max(column.maxX, span.maxX)));
  }
  const doorBoxes: any[] = [];
  for (const column of columns) {
    const lowerSpans = column.spans.filter((span: any) => (span.minY + span.maxY) / 2 <= counterTopY),
      upperSpans = column.spans.filter((span: any) => (span.minY + span.maxY) / 2 > counterTopY);
    for (const group of [lowerSpans, upperSpans]) {
      if (!group.length) continue;
      doorBoxes.push({
        minX: Math.min(...group.map((span: any) => span.minX)),
        maxX: Math.max(...group.map((span: any) => span.maxX)),
        minY: Math.min(...group.map((span: any) => span.minY)),
        maxY: Math.max(...group.map((span: any) => span.maxY)),
        minZ: Math.min(...group.map((span: any) => span.minZ)),
        maxZ: Math.max(...group.map((span: any) => span.maxZ)),
      });
    }
  }
  return doorBoxes;
}

/** 餐边柜「最右吊柜改玻璃柜」。 */
export function repairSideboardGlassDoor(threeSideboard: any, sideboardRoot: any) {
  const meshByMaterialName = new Map();
  sideboardRoot.traverse((candidateMesh: any) => {
    candidateMesh.isMesh &&
      !Array.isArray(candidateMesh.material) &&
      candidateMesh.material?.name &&
      meshByMaterialName.set(candidateMesh.material.name, candidateMesh);
  });
  const doorMesh = meshByMaterialName.get("sideboard-material-3"),
    bodyMesh = meshByMaterialName.get("sideboard-material-2"),
    nicheMesh = meshByMaterialName.get("sideboard-material-1"),
    counterMesh = meshByMaterialName.get("sideboard-material-0");
  if (!doorMesh || !bodyMesh) return false;
  for (const sideboardPartMesh of [doorMesh, bodyMesh, nicheMesh, counterMesh])
    sideboardPartMesh?.geometry?.computeBoundingBox?.();
  const doorBounds = doorMesh.geometry?.boundingBox,
    bodyBounds = bodyMesh.geometry?.boundingBox;
  if (!doorBounds || !bodyBounds) return false;

  const     counterTopY = counterMesh?.geometry?.boundingBox?.max.y,
    upperDoorFloorY =
      Number.isFinite(counterTopY) && counterTopY > doorBounds.min.y
        ? counterTopY
        : doorBounds.min.y + (doorBounds.max.y - doorBounds.min.y) / 2,
    lowerTop = counterMesh?.geometry?.boundingBox?.min.y ?? bodyBounds.min.y,


    nicheBackTopY = nicheMesh?.geometry?.boundingBox?.max.y,
    rightColumnStart = bodyBounds.min.x + (bodyBounds.max.x - bodyBounds.min.x) * (2 / 3),
    sourceGeometry = doorMesh.geometry.index ? doorMesh.geometry.toNonIndexed() : doorMesh.geometry,
    sourcePosition = sourceGeometry.attributes.position,
    sourceNormal = sourceGeometry.attributes.normal,
    sourceUv = sourceGeometry.attributes.uv,
    keptDoorParts = { position: [] as any[], normal: [] as any[], uv: [] as any[] };


  let rightColumnSplitX = rightColumnStart;
  const upperDoorCentroidXs: any[] = [];
  for (let triangleStart = 0; triangleStart < sourcePosition.count; triangleStart += 3)
    (sourcePosition.getY(triangleStart) +
      sourcePosition.getY(triangleStart + 1) +
      sourcePosition.getY(triangleStart + 2)) /
      3 >
      upperDoorFloorY &&
      upperDoorCentroidXs.push(
        (sourcePosition.getX(triangleStart) +
          sourcePosition.getX(triangleStart + 1) +
          sourcePosition.getX(triangleStart + 2)) /
          3,
      );
  const leftOfSplitCentroids = upperDoorCentroidXs.filter((x) => x <= rightColumnSplitX),
    rightOfSplitCentroids = upperDoorCentroidXs.filter((x) => x > rightColumnSplitX);
  leftOfSplitCentroids.length &&
    rightOfSplitCentroids.length &&
    (rightColumnSplitX =
      (Math.max(...leftOfSplitCentroids) + Math.min(...rightOfSplitCentroids)) / 2);

  let removedTriangleCount = 0,
    openingMinX = Infinity,
    openingMaxX = -Infinity,
    openingMinY = Infinity,
    openingMaxY = -Infinity,
    openingMinZ = Infinity,
    openingMaxZ = -Infinity;
  for (let triangleStart = 0; triangleStart < sourcePosition.count; triangleStart += 3) {
    const centroidX =
        (sourcePosition.getX(triangleStart) +
          sourcePosition.getX(triangleStart + 1) +
          sourcePosition.getX(triangleStart + 2)) /
        3,
      centroidY =
        (sourcePosition.getY(triangleStart) +
          sourcePosition.getY(triangleStart + 1) +
          sourcePosition.getY(triangleStart + 2)) /
        3,
      isRightUpperDoor = centroidX > rightColumnSplitX && centroidY > upperDoorFloorY;
    if (isRightUpperDoor) {
      removedTriangleCount += 1;
      for (let cornerIndex = 0; cornerIndex < 3; cornerIndex += 1) {
        const cornerX = sourcePosition.getX(triangleStart + cornerIndex),
          cornerY = sourcePosition.getY(triangleStart + cornerIndex),
          cornerZ = sourcePosition.getZ(triangleStart + cornerIndex);
        ((openingMinX = Math.min(openingMinX, cornerX)),
          (openingMaxX = Math.max(openingMaxX, cornerX)),
          (openingMinY = Math.min(openingMinY, cornerY)),
          (openingMaxY = Math.max(openingMaxY, cornerY)),
          (openingMinZ = Math.min(openingMinZ, cornerZ)),
          (openingMaxZ = Math.max(openingMaxZ, cornerZ)));
      }
      continue;
    }
    for (let cornerIndex = 0; cornerIndex < 3; cornerIndex += 1)
      (keptDoorParts.position.push(
        sourcePosition.getX(triangleStart + cornerIndex),
        sourcePosition.getY(triangleStart + cornerIndex),
        sourcePosition.getZ(triangleStart + cornerIndex),
      ),
        sourceNormal &&
          keptDoorParts.normal.push(
            sourceNormal.getX(triangleStart + cornerIndex),
            sourceNormal.getY(triangleStart + cornerIndex),
            sourceNormal.getZ(triangleStart + cornerIndex),
          ),
        sourceUv &&
          keptDoorParts.uv.push(
            sourceUv.getX(triangleStart + cornerIndex),
            sourceUv.getY(triangleStart + cornerIndex),
          ));
  }
  if (!removedTriangleCount || !Number.isFinite(openingMinX)) return false;


  const doorBoxes = clusterCabinetDoorBoxes(sourcePosition, counterTopY),
    upperDoorBoxes = doorBoxes.filter((box) => box.minY > upperDoorFloorY),
    glassDoorBox = upperDoorBoxes.reduce(
      (closestBox, box) =>
        !closestBox || Math.abs(box.minX - openingMinX) < Math.abs(closestBox.minX - openingMinX)
          ? box
          : closestBox,
      null,
    ),

    upperWoodDoorBoxes = upperDoorBoxes.filter((box) => box !== glassDoorBox);


  const doorFrontZ = openingMaxZ,
    doorBackZ = Math.max(
      openingMinZ,
      Math.min(bodyBounds.max.z, openingMaxZ - 0.012),
    ),
    doorDepth = Math.max(doorFrontZ - doorBackZ, 0.012),
    compartmentMinX = openingMinX,
    compartmentMaxX = bodyBounds.max.x,
    compartmentMinY = openingMinY,
    compartmentMaxY = bodyBounds.max.y,
    compartmentWidth = compartmentMaxX - compartmentMinX,
    compartmentHeight = compartmentMaxY - compartmentMinY,
    compartmentCenterX = (compartmentMinX + compartmentMaxX) / 2,
    compartmentCenterY = (compartmentMinY + compartmentMaxY) / 2;

  if (compartmentWidth < 0.12 || compartmentHeight < 0.12) return false;
  const frameBead = Math.min(
      Math.max(Math.min(compartmentWidth, compartmentHeight) * 0.055, 0.022),
      0.032,
    ),
    frameRabbet = 0.006,
    frameWidth = frameBead + frameRabbet,
    frameBeadDepth = 0.006,
    glassThickness = 0.006,
    glassRecess = 0.006,
    rabbetFrontZ = doorFrontZ - frameBeadDepth,
    glassFrontZ = rabbetFrontZ - glassRecess,
    beadCenterZ = (doorFrontZ + doorBackZ) / 2,
    rabbetCenterZ = (rabbetFrontZ + doorBackZ) / 2,
    glassCenterZ = glassFrontZ - glassThickness / 2,
    rabbetDepth = Math.max(doorDepth - frameBeadDepth, 0.012),
    stileHeight = Math.max(compartmentHeight - frameWidth * 2, 0.05),
    mullionCenterY = compartmentCenterY,


    mullionHalfHeight = frameBead / 2 + frameRabbet,


    leafGap = 0.004,
    leafSplitX = compartmentCenterX,

    leafSpans =
      (compartmentWidth - leafGap) / 2 >= frameWidth * 2 + 0.01
        ? [
            [compartmentMinX, leafSplitX - leafGap / 2],
            [leafSplitX + leafGap / 2, compartmentMaxX],
          ]
        : null;
  if (!leafSpans) return false;

  const glassLeaves = leafSpans.map(([leafMinX, leafMaxX], leafIndex) => {
    const leafWidth = leafMaxX - leafMinX,
      leafCenterX = (leafMinX + leafMaxX) / 2,
      paneMinX = leafMinX + frameWidth,
      paneMaxX = leafMaxX - frameWidth,
      paneWidth = Math.max(paneMaxX - paneMinX, 0.02),
      paneCenterX = (paneMinX + paneMaxX) / 2,
      upperPaneMinY = mullionCenterY + mullionHalfHeight,
      upperPaneMaxY = compartmentMaxY - frameWidth,
      lowerPaneMinY = compartmentMinY + frameWidth,
      lowerPaneMaxY = mullionCenterY - mullionHalfHeight;
    return {

      handleX: leafIndex === 0 ? leafMaxX - 0.015 : leafMinX + 0.015,

      hingeX: leafIndex === 0 ? leafMinX + frameBead / 2 : leafMaxX - frameBead / 2,


      frameBoxes: [
        [leafWidth, frameBead, doorDepth, leafCenterX, compartmentMaxY - frameBead / 2, beadCenterZ],
        [
          leafWidth,
          frameRabbet,
          rabbetDepth,
          leafCenterX,
          compartmentMaxY - frameBead - frameRabbet / 2,
          rabbetCenterZ,
        ],
        [leafWidth, frameBead, doorDepth, leafCenterX, compartmentMinY + frameBead / 2, beadCenterZ],
        [
          leafWidth,
          frameRabbet,
          rabbetDepth,
          leafCenterX,
          compartmentMinY + frameBead + frameRabbet / 2,
          rabbetCenterZ,
        ],
        [frameBead, stileHeight, doorDepth, leafMinX + frameBead / 2, compartmentCenterY, beadCenterZ],
        [
          frameRabbet,
          stileHeight,
          rabbetDepth,
          leafMinX + frameBead + frameRabbet / 2,
          compartmentCenterY,
          rabbetCenterZ,
        ],
        [frameBead, stileHeight, doorDepth, leafMaxX - frameBead / 2, compartmentCenterY, beadCenterZ],
        [
          frameRabbet,
          stileHeight,
          rabbetDepth,
          leafMaxX - frameBead - frameRabbet / 2,
          compartmentCenterY,
          rabbetCenterZ,
        ],
        [paneWidth, frameBead, doorDepth, paneCenterX, mullionCenterY, beadCenterZ],
        [
          paneWidth,
          frameRabbet,
          rabbetDepth,
          paneCenterX,
          mullionCenterY + frameBead / 2 + frameRabbet / 2,
          rabbetCenterZ,
        ],
        [
          paneWidth,
          frameRabbet,
          rabbetDepth,
          paneCenterX,
          mullionCenterY - frameBead / 2 - frameRabbet / 2,
          rabbetCenterZ,
        ],
      ],


      glassBoxes: [
        [
          paneWidth,
          Math.max(upperPaneMaxY - upperPaneMinY, 0.02),
          glassThickness,
          paneCenterX,
          (upperPaneMinY + upperPaneMaxY) / 2,
          glassCenterZ,
        ],
        [
          paneWidth,
          Math.max(lowerPaneMaxY - lowerPaneMinY, 0.02),
          glassThickness,
          paneCenterX,
          (lowerPaneMinY + lowerPaneMaxY) / 2,
          glassCenterZ,
        ],
      ],
    };
  });


  const frameBoxes = glassLeaves.flatMap((glassLeaf) => glassLeaf.frameBoxes),
    glassBoxes = glassLeaves.flatMap((glassLeaf) => glassLeaf.glassBoxes),


    doorExtensionBoxes = upperWoodDoorBoxes.map((doorBox) => [
      doorBox.maxX - doorBox.minX,
      Math.max(bodyBounds.max.y - doorBox.maxY, 0.001),
      Math.max(doorBox.maxZ - bodyBounds.max.z, 0.001),
      (doorBox.minX + doorBox.maxX) / 2,
      (doorBox.maxY + bodyBounds.max.y) / 2,
      (bodyBounds.max.z + doorBox.maxZ) / 2,
    ]),
    frameGeometry = mergeBoxGeometries(threeSideboard, [
      ...frameBoxes,
      ...doorExtensionBoxes,
    ]),
    hasSourceNormals = keptDoorParts.normal.length > 0,
    hasSourceUv = keptDoorParts.uv.length > 0;


  for (const frameAttributeName of ["position", "normal", "uv"])
    (frameAttributeName === "normal" && !hasSourceNormals) ||
      (frameAttributeName === "uv" && !hasSourceUv) ||
      (keptDoorParts as any)[frameAttributeName].push(
        ...frameGeometry.attributes[frameAttributeName].array,
      );
  frameGeometry.dispose();
  const previousDoorGeometry = doorMesh.geometry;
  doorMesh.geometry = buildPartGeometry(threeSideboard, keptDoorParts);


  sourceGeometry !== previousDoorGeometry && sourceGeometry.dispose();
  let isDoorGeometryShared = false;
  (sideboardRoot.traverse((siblingMesh: any) => {
    siblingMesh !== doorMesh &&
      siblingMesh.geometry === previousDoorGeometry &&
      (isDoorGeometryShared = true);
  }),
    isDoorGeometryShared || previousDoorGeometry.dispose());


  const glassMaterial = new threeSideboard.MeshStandardMaterial({
    color: 0xbfe0ea,
    roughness: 0.14,
    metalness: 0.06,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  ((glassMaterial.name = "sideboard-material-4"),
    (glassMaterial.userData.homeosSideboardGlass = true));


  const glassMesh = new threeSideboard.Mesh(
    mergeBoxGeometries(threeSideboard, glassBoxes),
    glassMaterial,
  );
  ((glassMesh.name = "sideboard-glass-double-door"),
    (glassMesh.castShadow = false),
    (glassMesh.receiveShadow = false),
    doorMesh.add(glassMesh));


  const postStandoff = 0.02,
    buildHandleBoxes = (handleCenterX: any, doorCenterY: any, doorFaceZ: any, doorHeight: any) => {
      const barLength = Math.min(0.17, doorHeight * 0.26),
        postInsetY = Math.max(barLength / 2 - 0.012, 0.005);
      return [

        [0.012, barLength, 0.012, handleCenterX, doorCenterY, doorFaceZ + postStandoff + 0.006],

        [0.01, 0.01, postStandoff, handleCenterX, doorCenterY + postInsetY, doorFaceZ + postStandoff / 2],
        [0.01, 0.01, postStandoff, handleCenterX, doorCenterY - postInsetY, doorFaceZ + postStandoff / 2],
      ];
    },
    doorHandleBoxes = (doorBox: any) =>
      buildHandleBoxes(
        doorBox.minX + 0.015,
        (doorBox.minY + doorBox.maxY) / 2,
        doorBox.maxZ,
        doorBox.maxY - doorBox.minY,
      ),
    plateThickness = 0.005,
    glassLeafHandleBoxes = glassLeaves.flatMap((glassLeaf) =>
      buildHandleBoxes(glassLeaf.handleX, compartmentCenterY, doorFrontZ, compartmentHeight),
    ),
    hingeBoxes = glassLeaves.flatMap((glassLeaf) =>
      [0.22, 0.78].flatMap((heightRatio) => {
        const hingeY = compartmentMinY + compartmentHeight * heightRatio,
          knuckleThickness = 0.018;
        return [

          [
            frameBead * 0.78,
            0.052,
            plateThickness,
            glassLeaf.hingeX,
            hingeY,
            doorFrontZ + plateThickness / 2,
          ],

          [
            0.016,
            knuckleThickness,
            knuckleThickness,
            glassLeaf.hingeX,
            hingeY + 0.026,
            doorFrontZ + plateThickness + knuckleThickness / 2,
          ],
        ];
      }),
    ),
    handleMaterial = new threeSideboard.MeshStandardMaterial({
      color: 0xa7adb4,
      roughness: 0.32,
      metalness: 0.85,
    });
  ((handleMaterial.name = "sideboard-material-5"),
    (handleMaterial.userData.homeosSideboardHandle = true));
  const hardwareBoxes = [

    ...doorBoxes.filter((doorBox) => doorBox !== glassDoorBox).flatMap(doorHandleBoxes),
    ...glassLeafHandleBoxes,
    ...hingeBoxes,
  ];
  if (hardwareBoxes.length) {
    const hardwareMesh = new threeSideboard.Mesh(
      mergeBoxGeometries(threeSideboard, hardwareBoxes),
      handleMaterial,
    );
    ((hardwareMesh.name = "sideboard-hardware"),
      (hardwareMesh.castShadow = false),
      (hardwareMesh.receiveShadow = false),
      sideboardRoot.add(hardwareMesh));
  }


  const bodyMinX = bodyBounds.min.x,
    bodyMaxX = bodyBounds.max.x,
    bodyMinY = bodyBounds.min.y,
    bodyMaxY = bodyBounds.max.y,
    bodyMinZ = bodyBounds.min.z,
    bodyMaxZ = bodyBounds.max.z,
    bodyWidth = bodyMaxX - bodyMinX,
    bodyDepth = bodyMaxZ - bodyMinZ,
    bodyCenterX = (bodyMinX + bodyMaxX) / 2,
    bodyCenterZ = (bodyMinZ + bodyMaxZ) / 2,


    hutchBaseY = Math.min(
      Number.isFinite(nicheBackTopY) ? nicheBackTopY : lowerTop,
      compartmentMinY,
    ),
    linerThickness = Math.min(0.006, Math.max(frameWidth * 0.12, 0.003)),
    wallThickness = Math.min(0.018, Math.max(frameWidth * 0.4, 0.006)),
    lidThickness = Math.min(0.02, Math.max(frameWidth * 0.5, 0.008)),
    shelfThickness = Math.min(0.022, compartmentHeight * 0.05),

    linerBackZ = Number.isFinite(nicheMesh?.geometry?.boundingBox?.max.z)
      ? nicheMesh.geometry.boundingBox.max.z
      : bodyMinZ + 0.03,
    linerBackDepth = Math.max(linerBackZ - bodyMinZ, 0.012);


  const lidFrontZ = bodyBounds.max.z,
    lidDepth = Math.max(lidFrontZ - bodyMinZ, 0.02),
    lidUndersideY = bodyMaxY - lidThickness,
    previousBodyGeometry = bodyMesh.geometry,


    compartmentBoxes = [
      [
        bodyWidth,
        lowerTop - bodyMinY,
        bodyDepth,
        bodyCenterX,
        (bodyMinY + lowerTop) / 2,
        bodyCenterZ,
      ],
      [
        compartmentMinX - bodyMinX,
        bodyMaxY - hutchBaseY,
        bodyDepth,
        (bodyMinX + compartmentMinX) / 2,
        (hutchBaseY + bodyMaxY) / 2,
        bodyCenterZ,
      ],
      [
        wallThickness,
        bodyMaxY - hutchBaseY,
        bodyDepth,
        bodyMaxX - wallThickness / 2,
        (hutchBaseY + bodyMaxY) / 2,
        bodyCenterZ,
      ],
      [
        compartmentWidth,
        lidThickness,
        lidDepth,
        compartmentCenterX,
        bodyMaxY - lidThickness / 2,
        (bodyMinZ + lidFrontZ) / 2,
      ],
      [
        compartmentWidth,
        compartmentMinY - hutchBaseY,
        bodyDepth,
        compartmentCenterX,
        (hutchBaseY + compartmentMinY) / 2,
        bodyCenterZ,
      ],
    ];
  bodyMesh.geometry = mergeBoxGeometries(
    threeSideboard,
    compartmentBoxes.filter(
      ([boxWidth, boxHeight, boxDepth]) =>
        boxWidth > 1e-4 && boxHeight > 1e-4 && boxDepth > 1e-4,
    ),
  );
  let isBodyGeometryShared = false;
  sideboardRoot.traverse((siblingMesh: any) => {
    siblingMesh !== bodyMesh &&
      siblingMesh.geometry === previousBodyGeometry &&
      (isBodyGeometryShared = true);
  });
  isBodyGeometryShared || previousBodyGeometry.dispose();


  const linerDepth = Math.max(lidFrontZ - linerBackZ, 0.02),
    linerCenterZ = (linerBackZ + lidFrontZ) / 2,
    linerInnerMinX = compartmentMinX + linerThickness,
    linerInnerMaxX = bodyMaxX - wallThickness - linerThickness,
    linerInnerWidth = Math.max(linerInnerMaxX - linerInnerMinX, 0.05),
    linerInnerCenterX = (linerInnerMinX + linerInnerMaxX) / 2,
    linerSideHeight = Math.max(lidUndersideY - compartmentMinY, 0.05),
    linerCenterY = (compartmentMinY + lidUndersideY) / 2,
    linerBackHeight = Math.max(lidUndersideY - hutchBaseY, 0.05),

    nichePanelBounds = nicheMesh?.geometry?.boundingBox,
    nichePanelWidth = nichePanelBounds ? nichePanelBounds.max.x - nichePanelBounds.min.x : bodyWidth,
    nichePanelHeight = nichePanelBounds
      ? nichePanelBounds.max.y - nichePanelBounds.min.y
      : linerBackHeight,
    nichePanelCenterX = nichePanelBounds
      ? (nichePanelBounds.min.x + nichePanelBounds.max.x) / 2
      : bodyCenterX,
    nichePanelCenterY = nichePanelBounds
      ? (nichePanelBounds.min.y + nichePanelBounds.max.y) / 2
      : (hutchBaseY + lidUndersideY) / 2,
    previousNicheGeometry = nicheMesh?.geometry,


    linerEpsilon = 0.0004,
    linerBoxes = nicheMesh
      ? [

          [
            Math.max(compartmentWidth - linerEpsilon * 2, 0.05),
            Math.max(lidUndersideY - hutchBaseY - linerEpsilon, 0.02),
            Math.max(linerBackDepth - linerEpsilon, 0.012),
            compartmentCenterX,
            (hutchBaseY + linerEpsilon + lidUndersideY) / 2,
            (bodyMinZ + linerEpsilon + linerBackZ) / 2,
          ],
          [
            linerInnerWidth,
            linerThickness,
            linerDepth,
            linerInnerCenterX,
            lidUndersideY - linerThickness / 2,
            linerCenterZ,
          ],
          [
            linerInnerWidth,
            linerThickness,
            linerDepth,
            linerInnerCenterX,
            compartmentMinY + linerThickness / 2,
            linerCenterZ,
          ],
          [
            linerThickness,
            linerSideHeight,
            linerDepth,
            linerInnerMinX - linerThickness / 2,
            linerCenterY,
            linerCenterZ,
          ],
          [
            linerThickness,
            linerSideHeight,
            linerDepth,
            linerInnerMaxX + linerThickness / 2,
            linerCenterY,
            linerCenterZ,
          ],


          [
            linerInnerWidth,
            shelfThickness,
            linerDepth,
            linerInnerCenterX,
            compartmentMinY + linerSideHeight / 4,
            linerCenterZ,
          ],
          [
            linerInnerWidth,
            shelfThickness,
            linerDepth,
            linerInnerCenterX,
            compartmentMinY + linerSideHeight / 2,
            linerCenterZ,
          ],
          [
            linerInnerWidth,
            shelfThickness,
            linerDepth,
            linerInnerCenterX,
            compartmentMinY + (linerSideHeight * 3) / 4,
            linerCenterZ,
          ],
        ]
      : null;
  if (nicheMesh && linerBoxes && previousNicheGeometry) {
    nicheMesh.geometry = mergeBoxGeometries(threeSideboard, [
      [
        nichePanelWidth,
        nichePanelHeight,
        linerBackDepth,
        nichePanelCenterX,
        nichePanelCenterY,
        bodyMinZ + linerBackDepth / 2,
      ],
      ...linerBoxes,
    ]);
    let isNicheGeometryShared = false;
    sideboardRoot.traverse((siblingMesh: any) => {
      siblingMesh !== nicheMesh &&
        siblingMesh.geometry === previousNicheGeometry &&
        (isNicheGeometryShared = true);
    });
    isNicheGeometryShared || previousNicheGeometry.dispose();
  }
  return true;
}
