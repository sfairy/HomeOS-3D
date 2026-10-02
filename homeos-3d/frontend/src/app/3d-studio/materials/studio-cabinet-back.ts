export function repairGlassCabinetBack(three, cabinetRoot, materialPrefix = "glasscabinet") {
  cabinetRoot.updateMatrixWorld(true);
  let backMesh, spanMesh;
  if (
    (cabinetRoot.traverse((mesh) => {
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
  (backMesh.geometry.computeBoundingBox(), spanMesh.geometry.computeBoundingBox());
  const backBounds = backMesh.geometry.boundingBox,
    spanBounds = spanMesh.geometry.boundingBox
      .clone()
      .applyMatrix4(
        new three.Matrix4().copy(backMesh.matrixWorld).invert().multiply(spanMesh.matrixWorld),
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
    cabinetRoot.traverse((otherMesh) => {
      otherMesh !== backMesh &&
        otherMesh.geometry === previousGeometry &&
        (isGeometryRetained = true);
    }),
    isGeometryRetained || previousGeometry.dispose(),
    true
  );
}
function mergeBoxGeometries(threeBox, boxSpecs) {
  const positions = [],
    normals = [],
    uvs = [];
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
export function repairSideboardJoints(threeSideboard, sideboardRoot) {
  const sideboardMaterialMeshByName = new Map();
  sideboardRoot.traverse((sweepMesh) => {
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
    (sideboardRoot.traverse((candidateMesh) => {
      candidateMesh !== sideboardSwapMesh &&
        candidateMesh.geometry === sideboardReplacedGeometry &&
        (isGeometryShared = true);
    }),
      isGeometryShared || sideboardReplacedGeometry.dispose());
  }
  return true;
}
export function repairWallCabinetSides(threeWall, wallCabinetRoot) {
  const wallMaterialMeshByName = new Map();
  wallCabinetRoot.traverse((wallMesh) => {
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
    (wallCabinetRoot.traverse((siblingMesh) => {
      siblingMesh !== wallSwapMesh &&
        siblingMesh.geometry === wallReplacedGeometry &&
        (isGeometryReferenced = true);
    }),
      isGeometryReferenced || wallReplacedGeometry.dispose());
  }
  return true;
}
