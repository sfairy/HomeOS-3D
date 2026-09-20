/**
 * 「暖阳原木」主题下的树叶放大。
 *
 * 位置：暖阳主题的整体观感偏「茂密、柔软」，但外部导入的模型里叶片是按原设计
 *   尺寸烘进去的，直接换色会显得单薄。本模块在几何层面把 foliage 材质的三角形
 *   按连通分量整簇放大并轻微旋转，让树冠在没有额外模型资源的前提下变蓬松。
 * 对外：enlargeWarmLeaves（返回新几何，不修改入参）。
 * 约定：只处理材质名匹配 /foliage/i 的几何分组；非叶片材质原样保留。
 */

/**
 * 按连通分量放大树叶几何。
 *
 * 算法分三步：
 * 1) 只在 foliage 分组内按三角形建并查集，把「共享顶点」与「位置相同但被拆开
 *    的顶点」都并到同一簇（导入的模型常因 UV / 材质分组拆点，只按索引相连会
 *    把一片叶子拆成好几块，放大后互相穿插）；
 * 2) 每簇求出包围盒中心，整簇绕 Y 轴旋转 (簇序号 % 3 - 1) × 60°；
 * 3) 以簇中心为原点把顶点相对坐标乘以 scale，再落回旋转后的位置。
 *
 * 注意：结果写在几何副本上，原几何与传入的法线都不改动。
 */
export function enlargeWarmLeaves(geometry, materials, scale = 1.85) {
  const positionAttribute = geometry.attributes.position;
  if (!positionAttribute) {
    return geometry;
  }
  const indexAttribute = geometry.index;
  // 没有 groups 时把整块几何当成一个默认分组，避免下面直接跳过。
  const geometryGroups = geometry.groups.length
    ? geometry.groups
    : [
        {
          start: 0,
          count: indexAttribute?.count ?? positionAttribute.count,
          materialIndex: 0
        }
      ];
  // 并查集：值指向父节点，根节点指向自己。
  const parentByVertex = new Map();
  const findRoot = vertexIndex => {
    let root = vertexIndex;
    while (parentByVertex.get(root) !== root) {
      root = parentByVertex.get(root);
    }
    // 路径压缩：把沿途节点直接挂到根上。
    while (vertexIndex !== root) {
      const previousParent = parentByVertex.get(vertexIndex);
      parentByVertex.set(vertexIndex, root);
      vertexIndex = previousParent;
    }
    return root;
  };
  const unionRoots = (firstVertex, secondVertex) => {
    parentByVertex.set(findRoot(firstVertex), findRoot(secondVertex));
  };
  // 位置键 → 第一个见到的顶点下标，用于把拆开的同名顶点并回同一簇。
  const firstVertexByPosition = new Map();
  for (const group of geometryGroups) {
    if (/foliage/i.test(materials[group.materialIndex]?.name ?? "")) {
      for (
        let triangleOffset = group.start;
        triangleOffset < group.start + group.count;
        triangleOffset += 3
      ) {
        const triangleVertices = [];
        for (let cornerIndex = 0; cornerIndex < 3; cornerIndex++) {
          const vertexIndex = indexAttribute
            ? indexAttribute.getX(triangleOffset + cornerIndex)
            : triangleOffset + cornerIndex;
          // 首次见到该顶点才登记为独立集合，并按位置做一次同位置合并。
          if (!parentByVertex.has(vertexIndex)) {
            parentByVertex.set(vertexIndex, vertexIndex);
            const positionKey = [
              positionAttribute.getX(vertexIndex),
              positionAttribute.getY(vertexIndex),
              positionAttribute.getZ(vertexIndex)
            ]
              .map(coordinate => Math.round(coordinate * 10000))
              .join(",");
            if (firstVertexByPosition.has(positionKey)) {
              unionRoots(vertexIndex, firstVertexByPosition.get(positionKey));
            } else {
              firstVertexByPosition.set(positionKey, vertexIndex);
            }
          }
          triangleVertices.push(vertexIndex);
        }
        // 三角形三边相连：一条边的两端同簇，整片叶子才会是一个分量。
        unionRoots(triangleVertices[0], triangleVertices[1]);
        unionRoots(triangleVertices[1], triangleVertices[2]);
      }
    }
  }
  // 一个 foliage 顶点都没碰到：这个模型没有树叶，直接退回原几何。
  if (!parentByVertex.size) {
    return geometry;
  }
  // 按根分组。遍历顺序即 parentByVertex 的插入顺序，簇序号依赖它，
  // 而簇序号决定旋转角度 —— 这里的顺序不能随意调整，否则叶片旋转会整体错位。
  const verticesByRoot = new Map();
  for (const vertexIndex of parentByVertex.keys()) {
    const root = findRoot(vertexIndex);
    if (!verticesByRoot.has(root)) {
      verticesByRoot.set(root, []);
    }
    verticesByRoot.get(root).push(vertexIndex);
  }
  const enlargedGeometry = geometry.clone();
  const enlargedPosition = enlargedGeometry.attributes.position;
  let clusterIndex = 0;
  for (const clusterVertices of verticesByRoot.values()) {
    // 先求这一簇的包围盒，再取中心作为缩放与旋转的基准点。
    const clusterMin = [Infinity, Infinity, Infinity];
    const clusterMax = [-Infinity, -Infinity, -Infinity];
    for (const vertexIndex of clusterVertices) {
      const vertexPosition = [
        positionAttribute.getX(vertexIndex),
        positionAttribute.getY(vertexIndex),
        positionAttribute.getZ(vertexIndex)
      ];
      for (let axisIndex = 0; axisIndex < 3; axisIndex++) {
        clusterMin[axisIndex] = Math.min(clusterMin[axisIndex], vertexPosition[axisIndex]);
        clusterMax[axisIndex] = Math.max(clusterMax[axisIndex], vertexPosition[axisIndex]);
      }
    }
    const clusterCenter = clusterMin.map(
      (minimumValue, axisIndex) => (minimumValue + clusterMax[axisIndex]) * 0.5
    );
    // 相邻三簇分别转 -60° / 0° / +60°：整棵树不会呈现统一的朝向，看起来更自然。
    const clusterRotation = ((clusterIndex++ % 3) - 1) * Math.PI / 3;
    const rotationCos = Math.cos(clusterRotation);
    const rotationSin = Math.sin(clusterRotation);
    for (const vertexIndex of clusterVertices) {
      // 先在 xz 平面上把相对坐标放大，再按上面的角度旋转回簇中心周边；
      // Y 方向同样以簇中心为基准放大，叶片才会整体变厚而不只是变宽。
      const offsetX = (positionAttribute.getX(vertexIndex) - clusterCenter[0]) * scale;
      const offsetZ = (positionAttribute.getZ(vertexIndex) - clusterCenter[2]) * scale;
      enlargedPosition.setXYZ(
        vertexIndex,
        clusterCenter[0] + offsetX * rotationCos - offsetZ * rotationSin,
        clusterCenter[1] + (positionAttribute.getY(vertexIndex) - clusterCenter[1]) * scale,
        clusterCenter[2] + offsetX * rotationSin + offsetZ * rotationCos
      );
    }
  }
  enlargedPosition.needsUpdate = true;
  // 顶点整体挪过位置，法线与包围体都要重算，否则光照与剔除都会出错。
  enlargedGeometry.computeVertexNormals();
  enlargedGeometry.computeBoundingBox();
  enlargedGeometry.computeBoundingSphere();
  // 簇数留给上层做调试 / 统计，也便于确认放大确实生效。
  enlargedGeometry.userData.warmLeafCount = verticesByRoot.size;
  return enlargedGeometry;
}
