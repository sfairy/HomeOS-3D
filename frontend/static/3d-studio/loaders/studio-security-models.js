/**
 * 摄像 / 人体存在传感器的程序化建模。
 */

/**
 * 往分组里生成一台安防设备。
 */
export function addSecurityModel(THREE, modelGroup, modelSpec, palette) {
  const { width: modelWidth, depth: modelDepth, height: modelHeight } = modelSpec;
  // 四套共用材质：外壳、装饰件（金属感）、深色件、镜头玻璃。
  const materialsByPart = {
    shell: new THREE.MeshStandardMaterial({
      color: palette.applianceSoft ?? palette.furnitureLight,
      roughness: 0.5
    }),
    trim: new THREE.MeshStandardMaterial({
      color: palette.appliance ?? palette.furniture,
      roughness: 0.42
    }),
    dark: new THREE.MeshStandardMaterial({
      color: palette.applianceDark ?? palette.furnitureDark,
      roughness: 0.23,
      metalness: 0.12
    }),
    lens: new THREE.MeshStandardMaterial({
      color: palette.furnitureDark,
      roughness: 0.12,
      metalness: 0.3
    })
  };
  // 统一入口：建网格 → 摆位置 → 可选缩放 → 开投影收发 → 挂到分组。
  const addPartMesh = (geometry, materialKey, positionX, positionY, positionZ, scaleFactors) => {
    const mesh = new THREE.Mesh(geometry, materialsByPart[materialKey]);
    mesh.position.set(positionX, positionY, positionZ);
    if (scaleFactors) {
      mesh.scale.set(...scaleFactors);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    modelGroup.add(mesh);
    return mesh;
  };
  // 回转体部件都落在中轴线上（x = z = 0），只有高度与上下半径不同，这里收敛成一个快捷方法。
  const addCylinderPart = (topRadius, bottomRadius, partHeight, partY, partMaterial = "shell") =>
    addPartMesh(
      new THREE.CylinderGeometry(topRadius, bottomRadius, partHeight, 24),
      partMaterial,
      0,
      partY,
      0
    );
  // 球体一律用单位球 + 非等比缩放，这样同一段缩放值可以直接表达椭球（镜头罩、传感器罩）。
  const addSpherePart = (sphereMaterial, sphereX, sphereY, sphereZ, scaleX, scaleY, scaleZ) =>
    addPartMesh(new THREE.SphereGeometry(1, 24, 16), sphereMaterial, sphereX, sphereY, sphereZ, [
      scaleX,
      scaleY,
      scaleZ
    ]);
  if (modelSpec.type === "camera") {
    // 半球摄像机：自下而上依次是底座、机身、球罩、镜头面板、双镜头与支架环。
    addCylinderPart(
      modelWidth * 0.35,
      modelWidth * 0.36,
      modelHeight * 0.075,
      modelHeight * 0.0375,
      "trim"
    );
    // 机身：上大下小的圆柱，形成锥形的过渡段。
    addCylinderPart(modelWidth * 0.27, modelWidth * 0.4, modelHeight * 0.35, modelHeight * 0.245);
    addSpherePart(
      "shell",
      0,
      modelHeight * 0.71,
      0,
      modelWidth * 0.49,
      modelHeight * 0.29,
      modelDepth * 0.48
    );
    // 镜头面板：贴在球罩正面的一块深色扁椭球，Z 向偏移表示它在球罩前方。
    addSpherePart(
      "dark",
      0,
      modelHeight * 0.71,
      modelDepth * 0.34,
      modelWidth * 0.385,
      modelHeight * 0.215,
      modelDepth * 0.16
    );
    // 两个镜头左右对称布置，偏移量取外形宽度的 ±14.5%。
    for (const lensOffsetX of [-modelWidth * 0.145, modelWidth * 0.145]) {
      const lensBarrelMesh = addPartMesh(
        new THREE.CylinderGeometry(modelWidth * 0.115, modelWidth * 0.115, modelDepth * 0.065, 20),
        "trim",
        lensOffsetX,
        modelHeight * 0.71,
        modelDepth * 0.485
      );
      // 圆柱默认沿 Y 轴，绕 X 轴转 90° 后轴向变成 Z（镜头朝前）。
      lensBarrelMesh.rotation.x = Math.PI / 2;
      const lensGlassMesh = addPartMesh(
        new THREE.CylinderGeometry(modelWidth * 0.078, modelWidth * 0.078, modelDepth * 0.018, 20),
        "lens",
        lensOffsetX,
        modelHeight * 0.71,
        modelDepth * 0.525
      );
      lensGlassMesh.rotation.x = Math.PI / 2;
      // 镜头旁的小高光点：极薄的椭球，位于镜头左上角，用来暗示玻璃反光。
      addSpherePart(
        "trim",
        lensOffsetX - modelWidth * 0.018,
        modelHeight * 0.733,
        modelDepth * 0.538,
        modelWidth * 0.018,
        modelHeight * 0.01,
        modelDepth * 0.006
      );
    }
    // 机身与球罩交界处的环形装饰件；绕 X 轴略微前倾以贴合球罩曲面。
    const mountRingMesh = addPartMesh(
      new THREE.TorusGeometry(modelWidth * 0.043, modelWidth * 0.006, 4, 20),
      "trim",
      0,
      modelHeight * 0.3,
      modelDepth * 0.355
    );
    mountRingMesh.rotation.x = 0.1;
  } else {
    // 非摄像机（presence 人体存在传感器）走柱状外形：底座、支柱、主体与上下端盖。
    addCylinderPart(modelWidth * 0.09, modelWidth * 0.49, modelHeight * 0.31, modelHeight * 0.155);
    addCylinderPart(
      modelWidth * 0.065,
      modelWidth * 0.065,
      modelHeight * 0.18,
      modelHeight * 0.38,
      "trim"
    );
    addCylinderPart(modelWidth * 0.44, modelWidth * 0.44, modelHeight * 0.43, modelHeight * 0.755);
    // 顶部与腰部各一圈略外凸的窄环，作为接缝装饰。
    addCylinderPart(
      modelWidth * 0.45,
      modelWidth * 0.45,
      modelHeight * 0.035,
      modelHeight * 0.9825,
      "trim"
    );
    addCylinderPart(
      modelWidth * 0.45,
      modelWidth * 0.45,
      modelHeight * 0.04,
      modelHeight * 0.52,
      "trim"
    );
    // 传感器视窗：开口圆柱只保留约 130° 的一段圆弧（起始 -0.36π、跨度 0.72π），
    const sensorBodyMesh = addPartMesh(
      new THREE.CylinderGeometry(
        modelWidth * 0.446,
        modelWidth * 0.446,
        modelHeight * 0.31,
        16,
        1,
        true,
        -Math.PI * 0.36,
        Math.PI * 0.72
      ),
      "trim",
      0,
      modelHeight * 0.755,
      0
    );
    // 圆柱是圆的，传感器多为扁圆外形，这里沿 Z 轴压扁到进深 / 宽度的比例。
    sensorBodyMesh.scale.z = modelDepth / modelWidth;
  }
  if (modelSpec.type === "presence") {
    // 人体存在传感器整体都是回转体，逐个子网格压扁即可；
    for (const childMesh of modelGroup.children) {
      if (
        childMesh.geometry?.type !== "CylinderGeometry" ||
        !childMesh.geometry.parameters.openEnded
      ) {
        childMesh.scale.z = modelDepth / modelWidth;
      }
    }
  }
  // 收集实际被引用的材质，把没用上的释放掉（上面按最大部件集预建了四套）。
  const usedMaterials = new Set(modelGroup.children.map(child => child.material));
  for (const material of Object.values(materialsByPart)) {
    if (!usedMaterials.has(material)) {
      material.dispose();
    }
  }
  return modelGroup;
}
