/**
 * 外部柜类模型的几何修补。
 *
 * 加载玻璃柜 / 书柜 / 吊柜的 glTF 后调用本模块，修掉导出模型里背板与侧板缺失或错位的问题，
 * 使柜体看起来是封闭的箱体。对外：repairGlassCabinetBack、repairWallCabinetSides。靠材质名
 * 定位部件，命名规则为 `<类型>-material-<序号>`，序号与导出脚本绑定；长度单位米，就地替换
 * 网格 geometry，不改动变换与材质。
 */

/**
 * 为玻璃柜 / 书柜补一块完整背板：导出模型的背板常比外框小或偏内，背面会露缝。
 * 以外框与背板在面板局部空间的包围盒为准重建，宽高对齐外框，进深从前表面延伸到最深处外 4 毫米。
 */
export function repairGlassCabinetBack(THREE, root, cabinetKind = "glasscabinet") {
  // 包围盒要用世界矩阵换算，先强制刷新一次矩阵，避免用到上一帧的陈旧变换。
  root.updateMatrixWorld(true);
  let panelMesh;
  let frameMesh;
  root.traverse(child => {
    // 多材质网格的 material 是数组，无法按名字判断，直接跳过。
    if (!!child.isMesh && !Array.isArray(child.material)) {
      if (child.material?.name === cabinetKind + "-material-0") {
        panelMesh = child;
      }
      // 书柜的外框序号与玻璃柜不同，按类型区分取材质名。
      if (
        child.material?.name ===
        cabinetKind + "-material-" + (cabinetKind === "bookcase" ? 7 : 10)
      ) {
        frameMesh = child;
      }
    }
  });
  if (!panelMesh || !frameMesh) {
    // 两个部件缺任一都不修补：宁可保持原样，也不要凭空造一块位置错误的板。
    return false;
  }
  panelMesh.geometry.computeBoundingBox();
  frameMesh.geometry.computeBoundingBox();
  const panelBounds = panelMesh.geometry.boundingBox;
  // 外框的顶点在它自己的局部空间里，先右乘外框世界矩阵、再左乘面板世界矩阵的逆，
  // 换算到面板局部空间后才能与面板包围盒直接比较。
  const frameBounds = frameMesh.geometry.boundingBox
    .clone()
    .applyMatrix4(
      new THREE.Matrix4().copy(panelMesh.matrixWorld).invert().multiply(frameMesh.matrixWorld)
    );
  // 背板背面比两者都深 4 毫米，盖住外框背边的接缝，同时不至于明显凸出柜体。
  const backFaceZ = Math.min(panelBounds.min.z, frameBounds.min.z) - 0.004;
  const repairGeometry = new THREE.BoxGeometry(
    frameBounds.max.x - frameBounds.min.x,
    frameBounds.max.y - frameBounds.min.y,
    panelBounds.max.z - backFaceZ
  );
  // BoxGeometry 以中心为原点，这里平移到包围盒的实际中心位置。
  repairGeometry.translate(
    (frameBounds.min.x + frameBounds.max.x) / 2,
    (frameBounds.min.y + frameBounds.max.y) / 2,
    (backFaceZ + panelBounds.max.z) / 2
  );
  // 新几何要参与后续的阴影 / 拾取计算，包围盒与包围球都需重建。
  repairGeometry.computeBoundingBox();
  repairGeometry.computeBoundingSphere();
  const originalGeometry = panelMesh.geometry;
  panelMesh.geometry = repairGeometry;
  // 原几何可能被同一模型里的其它网格共用，只有确认无人引用时才释放。
  let isShared = false;
  root.traverse(traversedNode => {
    if (traversedNode !== panelMesh && traversedNode.geometry === originalGeometry) {
      isShared = true;
    }
  });
  if (!isShared) {
    originalGeometry.dispose();
  }
  return true;
}

  /**
   * 把多块盒体合并成一个几何体。
   * 先 toNonIndexed 再拼接：索引形式需重算索引偏移；顶点数不多，牺牲一点重复换实现简单。
   */
function buildBoxGeometry(three, boxes) {
  const positions = [];
  const normals = [];
  const uvs = [];
  for (const [boxWidth, boxHeight, boxDepth, offsetX, offsetY, offsetZ] of boxes) {
    const boxGeometry = new three.BoxGeometry(boxWidth, boxHeight, boxDepth);
    const nonIndexed = boxGeometry.toNonIndexed();
    // 索引版的临时几何此时已无用，立即释放。
    boxGeometry.dispose();
    nonIndexed.translate(offsetX, offsetY, offsetZ);
    // 属性数组展开后顺序追加，多块盒体在同一个几何里共存。
    positions.push(...nonIndexed.attributes.position.array);
    normals.push(...nonIndexed.attributes.normal.array);
    uvs.push(...nonIndexed.attributes.uv.array);
    nonIndexed.dispose();
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute("position", new three.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new three.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new three.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * 重建吊柜的侧板与顶板。
 * 导入模型的三种材质贴错了板块，导致侧面漏空、顶板悬空；按外框包围盒反推正确位置，把三块板各
 * 替换成盒体的合并几何（侧板拆左右两片加顶部封条，顶板拆上下两片，左板改背板）。
 */
export function repairWallCabinetSides(threeLib, meshRoot) {
  // 材质名到网格的映射：吊柜每个部件用独立材质，名字唯一，可以据此定位。
  const meshByMaterialName = new Map();
  meshRoot.traverse(mesh => {
    if (mesh.isMesh && !Array.isArray(mesh.material)) {
      meshByMaterialName.set(mesh.material?.name, mesh);
    }
  });
  const leftPanelMesh = meshByMaterialName.get("wallcabinet-material-0");
  const sidePanelMesh = meshByMaterialName.get("wallcabinet-material-1");
  const topPanelMesh = meshByMaterialName.get("wallcabinet-material-2");
  if (!leftPanelMesh || !sidePanelMesh || !topPanelMesh) {
    return false;
  }
  for (const panelMeshEntry of [leftPanelMesh, sidePanelMesh, topPanelMesh]) {
    panelMeshEntry.geometry.computeBoundingBox();
  }
  // 三块板的包围盒都以同一模型坐标系为准，下面直接用它们推板厚与边界。
  const leftBounds = leftPanelMesh.geometry.boundingBox;
  const sideBounds = sidePanelMesh.geometry.boundingBox;
  const topBounds = topPanelMesh.geometry.boundingBox;
  const leftPanelWidth = leftBounds.max.x - leftBounds.min.x;
  const sidePanelDepth = sideBounds.max.z - sideBounds.min.z;
  // 板厚取左板自身的进深（导出模型里左板就是一块厚度方向的薄板）。
  const leftPanelDepth = leftBounds.max.z - leftBounds.min.z;
  // 左立板在模型坐标系里的 X 中心，用来把新几何体摆回原位。
  const leftPanelCenterX = (leftBounds.min.x + leftBounds.max.x) / 2;
  // 侧板在模型坐标系里的 Z 中心，同上用于定位。
  const sidePanelCenterZ = (sideBounds.min.z + sideBounds.max.z) / 2;
  const bottomY = topBounds.min.y;
  const topY = sideBounds.max.y;
  const innerTopY = topBounds.max.y;
  // 去掉两侧板厚后的可用内宽，上下的横板与背板都按这个宽度做。
  const innerPanelWidth = leftPanelWidth - leftPanelDepth * 2;
  // 三个部件的替换几何：侧板组（左右立板 + 顶部封条）、顶板组（上下横板）、左板（背板）。
  // 每个盒体的偏移量都按上一步推出的边界算出，保证拼接后恰好围成封闭柜体。
  const repairs = [
    [
      sidePanelMesh,
      buildBoxGeometry(threeLib, [
        [
          leftPanelDepth,
          topY - bottomY,
          sidePanelDepth,
          leftPanelCenterX - (leftPanelWidth - leftPanelDepth) / 2,
          (bottomY + topY) / 2,
          sidePanelCenterZ
        ],
        [
          leftPanelDepth,
          topY - bottomY,
          sidePanelDepth,
          leftPanelCenterX + (leftPanelWidth - leftPanelDepth) / 2,
          (bottomY + topY) / 2,
          sidePanelCenterZ
        ],
        [
          innerPanelWidth,
          topY - innerTopY,
          sidePanelDepth,
          leftPanelCenterX,
          (innerTopY + topY) / 2,
          sidePanelCenterZ
        ]
      ])
    ],
    [
      topPanelMesh,
      buildBoxGeometry(threeLib, [
        [
          innerPanelWidth,
          leftPanelDepth,
          sidePanelDepth,
          leftPanelCenterX,
          bottomY + leftPanelDepth / 2,
          sidePanelCenterZ
        ],
        [
          innerPanelWidth,
          leftPanelDepth,
          sidePanelDepth,
          leftPanelCenterX,
          innerTopY - leftPanelDepth / 2,
          sidePanelCenterZ
        ]
      ])
    ],
    [
      leftPanelMesh,
      buildBoxGeometry(threeLib, [
        [
          innerPanelWidth,
          innerTopY - bottomY - leftPanelDepth * 2,
          leftPanelDepth,
          leftPanelCenterX,
          (bottomY + innerTopY) / 2,
          sideBounds.min.z + leftPanelDepth / 2
        ]
      ])
    ]
  ];
  for (const [targetMesh, replacementGeometry] of repairs) {
    const savedGeometry = targetMesh.geometry;
    targetMesh.geometry = replacementGeometry;
    // 被换下的旧几何若仍被其它网格引用就不能释放，否则会连带破坏那些网格。
    let isReferenced = false;
    meshRoot.traverse(otherNode => {
      if (otherNode !== targetMesh && otherNode.geometry === savedGeometry) {
        isReferenced = true;
      }
    });
    if (!isReferenced) {
      savedGeometry.dispose();
    }
  }
  return true;
}
