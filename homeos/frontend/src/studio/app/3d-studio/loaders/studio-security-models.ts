import { applyReviewedShells } from "../authoring/scene/studio-reviewed-shells";

export function addSecurityModel(
  three: any,
  modelGroup: any,
  modelSpec: any,
  colorPalette: any,
  /**
   * 复核外壳剔除。上游默认开，本项目**默认关**，理由是实测的：
   * `studio-reviewed-shell-data.ts` 的掩码是按上游几何的指纹人工复核的，本仓机型几何
   * 是 0.8.0 期移植版，指纹对不上（fan / airer / camera / presence 实测命中 0 条），
   * 开着只会为每个模型多付一遍全量顶点+索引哈希（实测风扇 +8.5ms/个），一个三角形都剔不掉。
   * 重新按本仓几何复核掩码后，把这里的默认值改回 true 即可。
   */
  { pruneShell = false }: { pruneShell?: boolean } = {},
) {
  const { width: modelWidth, depth: modelDepth, height: modelHeight } = modelSpec,
    materialsByRole = {
      shell: new three.MeshStandardMaterial({
        color: colorPalette.applianceSoft ?? colorPalette.furnitureLight,
        roughness: 0.5,
      }),
      trim: new three.MeshStandardMaterial({
        color: colorPalette.appliance ?? colorPalette.furniture,
        roughness: 0.42,
      }),
      dark: new three.MeshStandardMaterial({
        color: colorPalette.applianceDark ?? colorPalette.furnitureDark,
        roughness: 0.23,
        metalness: 0.12,
      }),
      lens: new three.MeshStandardMaterial({
        color: colorPalette.furnitureDark,
        roughness: 0.12,
        metalness: 0.3,
      }),
    },

    addMeshPart = (
      meshGeometry: any,
      materialRole: any,
      positionX: any,
      positionY: any,
      positionZ: any,
      scaleVector: any = null,
    ) => {
      const partMesh = new three.Mesh(meshGeometry, (materialsByRole as any)[materialRole]);
      return (
        partMesh.position.set(positionX, positionY, positionZ),
        scaleVector && partMesh.scale.set(...scaleVector),
        (partMesh.castShadow = true),
        (partMesh.receiveShadow = true),
        modelGroup.add(partMesh),
        partMesh
      );
    },
    addCylinderPart = (
      radiusTop: any,
      radiusBottom: any,
      cylinderHeight: any,
      centerY: any,
      cylinderMaterialRole = "shell",
    ) =>
      addMeshPart(
        new three.CylinderGeometry(radiusTop, radiusBottom, cylinderHeight, 24),
        cylinderMaterialRole,
        0,
        centerY,
        0,
      ),
    addSpherePart = (sphereMaterialRole: any, sphereX: any, sphereY: any, sphereZ: any, scaleX: any, scaleY: any, scaleZ: any) =>
      addMeshPart(
        new three.SphereGeometry(1, 24, 16),
        sphereMaterialRole,
        sphereX,
        sphereY,
        sphereZ,
        [scaleX, scaleY, scaleZ],
      );
  if (modelSpec.type === "camera") {
    (addCylinderPart(
      modelWidth * 0.35,
      modelWidth * 0.36,
      modelHeight * 0.075,
      modelHeight * 0.0375,
      "trim",
    ),
      addCylinderPart(modelWidth * 0.27, modelWidth * 0.4, modelHeight * 0.35, modelHeight * 0.245),
      addSpherePart(
        "shell",
        0,
        modelHeight * 0.71,
        0,
        modelWidth * 0.49,
        modelHeight * 0.29,
        modelDepth * 0.48,
      ),
      addSpherePart(
        "dark",
        0,
        modelHeight * 0.71,
        modelDepth * 0.34,
        modelWidth * 0.385,
        modelHeight * 0.215,
        modelDepth * 0.16,
      ));
    for (const lensOffsetX of [-modelWidth * 0.145, modelWidth * 0.145]) {
      const lensTubeMesh = addMeshPart(
        new three.CylinderGeometry(modelWidth * 0.115, modelWidth * 0.115, modelDepth * 0.065, 20),
        "trim",
        lensOffsetX,
        modelHeight * 0.71,
        modelDepth * 0.485,
      );
      lensTubeMesh.rotation.x = Math.PI / 2;
      const lensMesh = addMeshPart(
        new three.CylinderGeometry(modelWidth * 0.078, modelWidth * 0.078, modelDepth * 0.018, 20),
        "lens",
        lensOffsetX,
        modelHeight * 0.71,
        modelDepth * 0.525,
      );
      ((lensMesh.rotation.x = Math.PI / 2),
        addSpherePart(
          "trim",
          lensOffsetX - modelWidth * 0.018,
          modelHeight * 0.733,
          modelDepth * 0.538,
          modelWidth * 0.018,
          modelHeight * 0.01,
          modelDepth * 0.006,
        ));
    }
    const lensRingMesh = addMeshPart(
      new three.TorusGeometry(modelWidth * 0.043, modelWidth * 0.006, 4, 20),
      "trim",
      0,
      modelHeight * 0.3,
      modelDepth * 0.355,
    );
    lensRingMesh.rotation.x = 0.1;
  } else {
    (addCylinderPart(modelWidth * 0.09, modelWidth * 0.49, modelHeight * 0.31, modelHeight * 0.155),
      addCylinderPart(
        modelWidth * 0.065,
        modelWidth * 0.065,
        modelHeight * 0.18,
        modelHeight * 0.38,
        "trim",
      ),
      addCylinderPart(
        modelWidth * 0.44,
        modelWidth * 0.44,
        modelHeight * 0.43,
        modelHeight * 0.755,
      ),
      addCylinderPart(
        modelWidth * 0.45,
        modelWidth * 0.45,
        modelHeight * 0.035,
        modelHeight * 0.9825,
        "trim",
      ),
      addCylinderPart(
        modelWidth * 0.45,
        modelWidth * 0.45,
        modelHeight * 0.04,
        modelHeight * 0.52,
        "trim",
      ));
    const bodyShellMesh = addMeshPart(
      new three.CylinderGeometry(
        modelWidth * 0.446,
        modelWidth * 0.446,
        modelHeight * 0.31,
        16,
        1,
        true,
        -Math.PI * 0.36,
        Math.PI * 0.72,
      ),
      "trim",
      0,
      modelHeight * 0.755,
      0,
    );
    bodyShellMesh.scale.z = modelDepth / modelWidth;
  }
  if (modelSpec.type === "presence") {
    for (const presenceChild of modelGroup.children)
      (presenceChild.geometry?.type !== "CylinderGeometry" ||
        !presenceChild.geometry.parameters.openEnded) &&
        (presenceChild.scale.z = modelDepth / modelWidth);
  }
  const usedMaterialSet = new Set(modelGroup.children.map((childMesh: any) => childMesh.material));
  for (const paletteMaterial of Object.values(materialsByRole))
    usedMaterialSet.has(paletteMaterial) || paletteMaterial.dispose();
  // 掩码按机型（camera / presence）分开复核，未收录的机型在这里就是零改动。
  return (pruneShell && applyReviewedShells(three, modelGroup, modelSpec.type), modelGroup);
}
