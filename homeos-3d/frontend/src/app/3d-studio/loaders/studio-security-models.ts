export function addSecurityModel(three, modelGroup, modelSpec, colorPalette) {
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
      meshGeometry,
      materialRole,
      positionX,
      positionY,
      positionZ,
      scaleVector = null,
    ) => {
      const partMesh = new three.Mesh(meshGeometry, materialsByRole[materialRole]);
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
      radiusTop,
      radiusBottom,
      cylinderHeight,
      centerY,
      cylinderMaterialRole = "shell",
    ) =>
      addMeshPart(
        new three.CylinderGeometry(radiusTop, radiusBottom, cylinderHeight, 24),
        cylinderMaterialRole,
        0,
        centerY,
        0,
      ),
    addSpherePart = (sphereMaterialRole, sphereX, sphereY, sphereZ, scaleX, scaleY, scaleZ) =>
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
  const usedMaterialSet = new Set(modelGroup.children.map((childMesh) => childMesh.material));
  for (const paletteMaterial of Object.values(materialsByRole))
    usedMaterialSet.has(paletteMaterial) || paletteMaterial.dispose();
  return modelGroup;
}
