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

/** 由 position / normal / uv 数组拼一块 BufferGeometry（并算好包围盒）。 */
function buildPartGeometry(threePart, partData) {
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

/**
 * 把一槽门板（`sideboard-material-3` 这种「6 扇门并进一个图元」的三角面汤）还原成**独立的门板盒子**。
 *
 * 分两步聚：先按 x 区间合并成一列（门缝约 32mm，间隔 ≤ 8mm 视为同一扇门），
 * 每一列再按台面顶把「吊柜门 / 下柜门」断开。原模型里 6 扇门都是**纯盒子**（没有倒角），
 * 所以聚出来的包围盒就是门板本身，可以直接拿来摆补块 / 拉手。
 *
 * 取不到（门板有倒角、或门缝异常宽）时返回空数组，调用方按「没有门板信息」退化处理。
 */
function clusterCabinetDoorBoxes(position, counterTopY) {
  const spans = [];
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
  const columns = [];
  for (const span of spans) {
    const column = columns[columns.length - 1];
    if (!column || span.minX - column.maxX > 0.008) columns.push({ maxX: span.maxX, spans: [span] });
    else (column.spans.push(span), (column.maxX = Math.max(column.maxX, span.maxX)));
  }
  const doorBoxes = [];
  for (const column of columns) {
    const lowerSpans = column.spans.filter((span) => (span.minY + span.maxY) / 2 <= counterTopY),
      upperSpans = column.spans.filter((span) => (span.minY + span.maxY) / 2 > counterTopY);
    for (const group of [lowerSpans, upperSpans]) {
      if (!group.length) continue;
      doorBoxes.push({
        minX: Math.min(...group.map((span) => span.minX)),
        maxX: Math.max(...group.map((span) => span.maxX)),
        minY: Math.min(...group.map((span) => span.minY)),
        maxY: Math.max(...group.map((span) => span.maxY)),
        minZ: Math.min(...group.map((span) => span.minZ)),
        maxZ: Math.max(...group.map((span) => span.maxZ)),
      });
    }
  }
  return doorBoxes;
}

/**
 * 餐边柜「最右吊柜改玻璃柜」。
 *
 * 为什么需要它：新 GLB 的 6 扇柜门（下柜 3 + 吊柜 3）并进**同一个 `sideboard-material-3` 图元**，
 * 单靠材质角色表改不动「其中一扇」。这里在加载后：
 *   1. 按三角形重心把「最右列且位于吊柜高度区间」的那扇门板从门图元里摘出来；
 *   2. 在同一门图元里补**两扇对开**的玻璃门框（每扇：上下冒头 + 左右边梃 + 中冒头），
 *      每扇框内两格留给玻璃；
 *   3. 把柜体（`sideboard-material-2`）右列吊柜整格挖空：内腔 + 三块层板，外轮廓那几条壁
 *      全部退到门框后面（正面看不到它们的前沿）；
 *   4. 补 `sideboard-material-4` 的四片玻璃芯（两扇 × 两格），铺满各自框内，也退在门框之后。
 *
 * 这几步都是被用户反馈逼出来的：
 *  - 「边框和其他门颜色一致」：门框必须和其余五扇门同槽 —— 所以它并进 `sideboard-material-3`
 *    （走 `door` 槽），而不是用 `body` 或新建槽位。之前那圈「白色边框」就是柜体前脸透出来的。
 *  - 「玻璃柜门占满整个宽高」+「顶部还是白色柜体」：格子范围取**门缝 → 柜体右缘、
 *    吊柜底 → 柜顶**，四周不再内缩。原先留的那 4mm 是柜体色，柜顶一道压在玻璃前面的亮条，
 *    正是用户看到的「顶部白色柜体」。
 *  - 「没有玻璃门的效果」：默认档位的玻璃不透明度只有 0.34，一格到底的整片玻璃几乎看不见。
 *    门框 + 中冒头负责「看得出这是一扇门」，玻璃只留「透过它看见内腔」这一个职责。
 *  - 「比左右两扇木门高一截很突兀」：门框铺到柜顶之后就跟邻门对不齐了，所以这里反过来
 *    把吊柜那两扇**木门也加高到柜顶**（`doorExtensionBoxes`），三扇吊柜门一条顶线。
 *  - 「门框太粗太平像个画框」：门框剖面改成两级（面子 + 后退 6mm 的返边），柜门材质的
 *    「返边压暗」在正面画出两道凹槽线；单边宽度也从 44mm 收到 ~35mm。
 *  - 「没有铰链 / 拉手，像贴上去的一块板」：木门五扇各补一根竖拉手（`handle` 槽），
 *    玻璃门补两扇 × （一根拉手 + 两片明铰链）—— 五金件归一个槽位，换档位时不会脱色。
 *  - 「玻璃柜要双开门」：原来的一整扇改成**两扇对开**（合缝 4mm / 取门洞中心），两扇各自
 *    完整的面框、两片玻璃、一根朝中缝的拉手、两片挂外侧的明铰链。
 *
 * 上下柜的分界线只用**台面顶**（`sideboard-material-0`）：`repairSideboardJoints` 会把壁龛 /
 * 背板（material-1）拉成「台面顶 → 柜顶」的一整根，若拿背板的 max.y 当阈值，上层门一块都选
 * 不出来，本函数会静默失效（模型看起来就是原样：实心吊柜、没有玻璃门）。
 *
 * `sideboard-material-4` / `sideboard-material-5` 由 `MODEL_SLOT_ROLES.sideboard` 分别登记为
 * `glass` / `handle` 角色，于是玻璃的透明度、五金的颜色 / 粗糙度都走既有角色配方，
 * 和「材质风格」档位链共用同一套逻辑。
 */
export function repairSideboardGlassDoor(threeSideboard, sideboardRoot) {
  const meshByMaterialName = new Map();
  sideboardRoot.traverse((candidateMesh) => {
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
    // 吊柜箱体的底 = 壁龛背板顶。原始模型的结构是「下柜（0 → 台面底）+ 台面 + **敞开的壁龛**
    // （台面顶 → 吊柜底，只有一片深色背板）+ 吊柜（壁龛顶 → 柜顶）」，吊柜与下柜之间那段是
    // 空的。柜体（material-2）重建时必须把吊柜箱体照原样摆回 1.342 起，否则会把整条壁龛
    // 填成木色 / 白色柜体 —— 正面看就是「柜体色从中间一直糊到顶」。真正的格子底由
    // `compartmentMinY`（门洞底）决定，两者之差就是吊柜那一圈柜体色收边。
    nicheBackTopY = nicheMesh?.geometry?.boundingBox?.max.y,
    rightColumnStart = bodyBounds.min.x + (bodyBounds.max.x - bodyBounds.min.x) * (2 / 3),
    sourceGeometry = doorMesh.geometry.index ? doorMesh.geometry.toNonIndexed() : doorMesh.geometry,
    sourcePosition = sourceGeometry.attributes.position,
    sourceNormal = sourceGeometry.attributes.normal,
    sourceUv = sourceGeometry.attributes.uv,
    keptDoorParts = { position: [], normal: [], uv: [] };

  // 三等分只是「三列等宽」的经验初值；真正的分列线应该是**门缝中间**。上柜门各三角面的
  // 重心 x 天然按列聚团（中列最右重心、右列最左重心之间就是缝），把阈值吸附到这两点的
  // 中点，模型的门缝宽窄稍有出入也不会切进右列门板（切歪会在玻璃边上留一条木条）。
  let rightColumnSplitX = rightColumnStart;
  const upperDoorCentroidXs = [];
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

  // ── 先把「哪一块是哪扇门」找回来 ────────────────────────────────────────────
  //
  // 6 扇门并进同一个图元，要加高吊柜那两扇木门、要给每扇门摆拉手，都得先拿到每扇门的盒子。
  // 聚类失败（空数组）也不硬做：宁可退回「只改玻璃门」的老样子，也不要把补块摆到门外去。
  const doorBoxes = clusterCabinetDoorBoxes(sourcePosition, counterTopY),
    upperDoorBoxes = doorBoxes.filter((box) => box.minY > upperDoorFloorY),
    glassDoorBox = upperDoorBoxes.reduce(
      (closestBox, box) =>
        !closestBox || Math.abs(box.minX - openingMinX) < Math.abs(closestBox.minX - openingMinX)
          ? box
          : closestBox,
      null,
    ),
    // 吊柜里**除玻璃门以外**的那两扇（左 / 中）：它们要跟着玻璃门一起加高到柜顶。
    upperWoodDoorBoxes = upperDoorBoxes.filter((box) => box !== glassDoorBox);

  // 格子范围 = 门缝 → 柜体右缘、吊柜底 → 柜顶，四周**不留内缩**。原先那 4mm 内缩露出来的
  // 正是柜体前脸（`body` 槽）：柜顶那道压条比玻璃更靠前、又正对光，在深色内腔上就是一条
  // 亮带 —— 用户说的「顶部还是白色柜体」就是它。门框的上 / 右冒头铺到柜顶和柜体右缘之后，
  // 这一圈亮边被门框同色盖住，正面只剩「门框 + 玻璃 + 内腔」。
  //
  // 门框整块落在**柜体前脸之外**（z ≥ 柜体最前沿）：原门板是往里嵌 6.4mm 的，门框若照抄
  // 门板自己的 z 区间，边梃 / 冒头的侧面与顶面就会和柜体外皮、右壁落在同一个坐标面上
  // —— 同向共面就是 z-fighting。整块前移到柜体前脸之前后，两者只在棱上相接。
  //
  // 门框**剖面分两级**，这是「看着像个画框」的解药：
  //   1. **面子**（bead）占满整个门厚，正面与其余五扇门齐平；
  //   2. **返边**（rabbet）比面子后退 6mm、又往内让 6mm —— 正面看就是「面子 + 一道凹槽」；
  //   3. **玻璃**再退 6mm，压在返边后面（返边就是压玻璃的压条）。
  // 面子↔返边、返边↔玻璃之间各有一道 6mm 高的侧壁，柜门材质会把「不朝正面的面」压暗，
  // 于是正面读出两道清楚的凹槽线，而不是一整条平的宽边框（单边宽度也从 44mm 收到 ~35mm）。
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
  // 门缝 / 门洞读歪时宁可整段不动：格子取反会做出「比柜体还大的玻璃门」。
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
    // 中冒头把每扇门分成上下两格：默认档位的玻璃不透明度只有 0.34，一格到底的整片玻璃几乎
    // 读不出「这是一扇门」，分格之后「门」的存在感由门框承担。
    mullionHalfHeight = frameBead / 2 + frameRabbet,
    // ── 对开门（双开，用户点名的改法）──────────────────────────────────────────
    //
    // 原先这里是**一整扇**玻璃门：一根中冒头分上下格、一根拉手、两片明铰链。现在拆成
    // **两扇对开**，每扇各自有完整的面框（上下冒头 + 左右边梃 + 中冒头）、自己的两片玻璃、
    // 一根拉手、两片明铰链。
    //
    // 合缝留 4mm（每扇各让 2mm）：一是正面能读出「这是两扇」而不是一整块玻璃，二是两扇的
    // 边梃若直接贴合就是**同向共面**，门缝处会闪出一条亮线（z-fighting）。合缝取门洞中心。
    leafGap = 0.004,
    leafSplitX = compartmentCenterX,
    // 每扇门窄于「两个框宽 + 一点玻璃」时整段不动：门洞读歪了还硬做，会拼出比柜体还大的门。
    leafSpans =
      (compartmentWidth - leafGap) / 2 >= frameWidth * 2 + 0.01
        ? [
            [compartmentMinX, leafSplitX - leafGap / 2],
            [leafSplitX + leafGap / 2, compartmentMaxX],
          ]
        : null;
  if (!leafSpans) return false;
  // 每扇门的面框 / 玻璃 / 拉手 / 铰链锚点：只有「合缝侧」与「外侧」互换，其余完全对称。
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
      // 拉手落在**合缝侧**的边梃上（左扇靠右沿、右扇靠左沿）：两根对称朝中缝才是双开门的样子。
      handleX: leafIndex === 0 ? leafMaxX - 0.015 : leafMinX + 0.015,
      // 明铰链挂在**外侧**边梃上（远离中缝的那一侧）：左扇左挂、右扇右挂。
      hingeX: leafIndex === 0 ? leafMinX + frameBead / 2 : leafMaxX - frameBead / 2,
      // 面框 11 根：上下冒头 / 左右边梃 / 中冒头，各「面子（满门厚）+ 返边（后退 6mm）」两级。
      // 边梃只铺到上下冒头之间（不铺满整格高）：铺满的话，边梃与冒头会在四个拐角处**同槽共面
      // 重叠**，正面看拐角就是一小块闪色。
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
      // 每扇两片玻璃（中冒头上下各一格），铺满框内、退在**返边**后面 —— 四周边缘被面子压住，
      // 正面只看到框内那一片，不会有玻璃边从框里露出来。
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
  // 门框并进**门**图元（`sideboard-material-3`）：和其余五扇门同槽，颜色天然一致 —— 用户要的
  // 「边框和其他门颜色一致」在几何上就是这么兑现的，换任何材质风格都不会脱色。
  const frameBoxes = glassLeaves.flatMap((glassLeaf) => glassLeaf.frameBoxes),
    glassBoxes = glassLeaves.flatMap((glassLeaf) => glassLeaf.glassBoxes),
    // 吊柜那两扇**木门也加高到柜顶**：玻璃门铺到柜顶之后就跟邻门差 6cm，用户看着「很突兀」
    // （原模型的门本来只到 2.1399，上面那 6cm 是柜体色压条）。加高块只补「露在柜体前脸
    // 之外」的那一段（z ≥ 柜体前脸），于是顶面正好落在柜顶高度、和柜体顶面只在棱上相接
    // 而不共面，门板原本嵌在柜体里的那 6.4mm 也不必补。
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
  // normal / uv 只在门板自己有这两路属性时才补：缺一路就交给 buildPartGeometry 现算，
  // 免得拼出「位置比法线多」的错位属性。
  for (const frameAttributeName of ["position", "normal", "uv"])
    (frameAttributeName === "normal" && !hasSourceNormals) ||
      (frameAttributeName === "uv" && !hasSourceUv) ||
      keptDoorParts[frameAttributeName].push(
        ...frameGeometry.attributes[frameAttributeName].array,
      );
  frameGeometry.dispose();
  const previousDoorGeometry = doorMesh.geometry;
  doorMesh.geometry = buildPartGeometry(threeSideboard, keptDoorParts);
  // `sourceGeometry` 在索引几何上是一次临时展开（toNonIndexed），用完即弃；
  // 原几何若没有别的网格共用，也一并释放。
  sourceGeometry !== previousDoorGeometry && sourceGeometry.dispose();
  let isDoorGeometryShared = false;
  (sideboardRoot.traverse((siblingMesh) => {
    siblingMesh !== doorMesh &&
      siblingMesh.geometry === previousDoorGeometry &&
      (isDoorGeometryShared = true);
  }),
    isDoorGeometryShared || previousDoorGeometry.dispose());

  // 玻璃门芯：新槽位 `sideboard-material-4` → glass 角色（透明走既有配方）。
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
  // 四片玻璃（两扇各两格），铺满各自框内、退在**返边**后面 —— 四周边缘被面子压住，
  // 正面只看到框内那一片，不会有玻璃边从框里露出来。
  const glassMesh = new threeSideboard.Mesh(
    mergeBoxGeometries(threeSideboard, glassBoxes),
    glassMaterial,
  );
  ((glassMesh.name = "sideboard-glass-double-door"),
    (glassMesh.castShadow = false),
    (glassMesh.receiveShadow = false),
    doorMesh.add(glassMesh));

  // ── 五金：七根竖拉手 + 四片明铰链 ──────────────────────────────────────────
  //
  // 都并进**同一个新槽位** `sideboard-material-5`（handle 角色）。木门那五根的拉手位置统一取
  // 「门板左沿内 15mm」，留在门缝侧、上下两排竖着对齐。
  // 对开玻璃门的两根一反「一律靠左」的规则：各自落在**合缝侧**的边梃上（左扇靠右沿、右扇靠
  // 左沿），两根对称朝中缝 —— 这才是双开门该有的样子；明铰链则挂在两扇的**外侧**边梃上
  // （左扇左挂、右扇右挂，每扇 0.22 / 0.78 高度各一片）。既是玻璃展示柜的常见做法，也是
  // 「这是一扇门」最直接的一句话 —— 用户说的「像贴上去的一块板」缺的正是这些。
  const postStandoff = 0.02,
    buildHandleBoxes = (handleCenterX, doorCenterY, doorFaceZ, doorHeight) => {
      const barLength = Math.min(0.17, doorHeight * 0.26),
        postInsetY = Math.max(barLength / 2 - 0.012, 0.005);
      return [
        // 杆：悬在门面之前 20mm
        [0.012, barLength, 0.012, handleCenterX, doorCenterY, doorFaceZ + postStandoff + 0.006],
        // 上下两根立柱
        [0.01, 0.01, postStandoff, handleCenterX, doorCenterY + postInsetY, doorFaceZ + postStandoff / 2],
        [0.01, 0.01, postStandoff, handleCenterX, doorCenterY - postInsetY, doorFaceZ + postStandoff / 2],
      ];
    },
    doorHandleBoxes = (doorBox) =>
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
          // 底板：贴在边梃的面子上
          [
            frameBead * 0.78,
            0.052,
            plateThickness,
            glassLeaf.hingeX,
            hingeY,
            doorFrontZ + plateThickness / 2,
          ],
          // 铰链头：从底板上沿再凸出来一点
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
    // 木门那五扇：拉手一律靠门板左沿。玻璃门**排除在外** —— 它的两扇在下面单独摆。
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

  // 柜体右列吊柜整格挖空。
  //
  // 原始柜体（`sideboard-material-2`）是**两只实心箱体**：下柜（0 → 台面底）与吊柜（壁龛顶 →
  // 柜顶）；中间那条壁龛（台面顶 → 吊柜底）在原始模型里就是**空**的，只有一片深色背板。
  // 所以重建柜体时有三条硬约束：
  //   1. 吊柜箱体必须照原样从壁龛顶（`hutchBaseY`）起，**不能**从台面顶起 —— 从台面顶起会
  //      把整条壁龛填成柜体色（正面看就是「柜体从中间糊到顶」，也就是「顶部还是白色柜体」
  //      的另一种表现），还会盖掉台面前脸；
  //   2. 挖空只发生在吊柜右列的**门洞**那一块（`compartmentMinY` → 柜顶）；
  //   3. 外轮廓那几条壁（右壁 / 顶板）一律退到门框后面（z ≤ `openingMinZ`）：门框的边梃 /
  //      上冒头正好压住它们的前沿，正面看不到一点柜体色。
  //
  // 内腔（背 / 顶 / 底 / 两侧）另铺一层 `sideboard-material-1`（interior 槽）内衬：玻璃柜
  // 的内腔得是深色内衬，裸着柜体色的内壁透过玻璃看过去就是「一片白柜体」。
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
    // 吊柜箱体的底：优先取壁龛背板顶（就是原始吊柜箱体的底），取不到退回台面底。
    // 再夹到门洞底以内，保证「格子以下」那块收边不会变成负高度。
    hutchBaseY = Math.min(
      Number.isFinite(nicheBackTopY) ? nicheBackTopY : lowerTop,
      compartmentMinY,
    ),
    linerThickness = Math.min(0.006, Math.max(frameWidth * 0.12, 0.003)),
    wallThickness = Math.min(0.018, Math.max(frameWidth * 0.4, 0.006)),
    lidThickness = Math.min(0.02, Math.max(frameWidth * 0.5, 0.008)),
    shelfThickness = Math.min(0.022, compartmentHeight * 0.05),
    // 内衬的前后范围：后沿贴着壁龛背板的正面（同一片深色背景），前沿铺到柜体前脸。
    linerBackZ = Number.isFinite(nicheMesh?.geometry?.boundingBox?.max.z)
      ? nicheMesh.geometry.boundingBox.max.z
      : bodyMinZ + 0.03,
    linerBackDepth = Math.max(linerBackZ - bodyMinZ, 0.012);
  // 顶板 / 内衬铺到**柜体前脸**（`bodyBounds.max.z`）：门框已经整块前移到柜体前脸之外，
  // 顶板再往前也不会和上冒头共面；这时柜顶是一整片平的（顶板 → 门框上冒头只在棱上相接），
  // 内衬也一路铺到前脸，玻璃后面不会露出没有内衬的柜体顶板下沿。
  const lidFrontZ = bodyBounds.max.z,
    lidDepth = Math.max(lidFrontZ - bodyMinZ, 0.02),
    lidUndersideY = bodyMaxY - lidThickness,
    previousBodyGeometry = bodyMesh.geometry,
    // 5 块板：下柜实心体 + 左两列实心体 + 右壁 + 顶板 + 门洞以下收边。
    // 右壁 / 顶板只保柜体外轮廓，尺寸极端时会被下面的 filter 丢掉，不会留下零体积盒子。
    // 内腔的层板不在这里 —— 层板透过玻璃看得见，必须和四壁一样走 `interior` 槽（见下面的
    // 内衬列表），否则白柜体风格下整格会变成「深色内壁 + 两块白层板」。
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
  sideboardRoot.traverse((siblingMesh) => {
    siblingMesh !== bodyMesh &&
      siblingMesh.geometry === previousBodyGeometry &&
      (isBodyGeometryShared = true);
  });
  isBodyGeometryShared || previousBodyGeometry.dispose();

  // 玻璃柜内腔的深色内衬（`sideboard-material-1` = interior 槽）。
  //
  // `repairSideboardJoints` 已经把这条槽位改成「整片壁龛背板」，这里在原样保留那片背板的前提下，
  // 再把吊柜右列那一格的内壁补齐：背 / 顶 / 底 / 左右四壁。全部退在门框后沿以内，正面只透过
  // 玻璃看得到 —— 于是「透过玻璃看到的」是深色内衬 + 层板，而不是柜体色的内壁。
  const linerDepth = Math.max(lidFrontZ - linerBackZ, 0.02),
    linerCenterZ = (linerBackZ + lidFrontZ) / 2,
    linerInnerMinX = compartmentMinX + linerThickness,
    linerInnerMaxX = bodyMaxX - wallThickness - linerThickness,
    linerInnerWidth = Math.max(linerInnerMaxX - linerInnerMinX, 0.05),
    linerInnerCenterX = (linerInnerMinX + linerInnerMaxX) / 2,
    linerSideHeight = Math.max(lidUndersideY - compartmentMinY, 0.05),
    linerCenterY = (compartmentMinY + lidUndersideY) / 2,
    linerBackHeight = Math.max(lidUndersideY - hutchBaseY, 0.05),
    // 原壁龛背板（`repairSideboardJoints` 换成的那只盒子）原样保留：内衬是在它之外补内壁。
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
    // 内衬一律缩进 0.4mm，绝不和柜体的外皮 / 内壁落在同一个坐标面上：同向共面就是
    // z-fighting（柜体色和深色内衬互闪），尤其在柜子右侧面、背面、吊柜底面这几处。
    linerEpsilon = 0.0004,
    linerBoxes = nicheMesh
      ? [
          // 背衬：与壁龛背板同一片深色，一直铺到顶板下沿。左右 / 背 / 底各缩 0.4mm。
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
          // 三块层板（1/4、2/4、3/4 高处）：和四壁同槽，玻璃后面只看到深色内衬。
          // 2/4 那块正对门的中冒头 —— 正面读起来就像「中冒头压在一层层板上」，四格均分；
          // 原先只有 1/3、2/3 两块，层板正好歪在每格中间，用户看到的「层板位置奇怪」就是它。
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
    sideboardRoot.traverse((siblingMesh) => {
      siblingMesh !== nicheMesh &&
        siblingMesh.geometry === previousNicheGeometry &&
        (isNicheGeometryShared = true);
    });
    isNicheGeometryShared || previousNicheGeometry.dispose();
  }
  return true;
}
