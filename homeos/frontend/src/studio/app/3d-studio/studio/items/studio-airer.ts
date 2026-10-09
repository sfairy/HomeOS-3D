import { RoundedBoxGeometry } from "/static/vendor/three/0.186.0/RoundedBoxGeometry.js";

type AirerDimensionOptions = {
  elevation?: unknown;
  airerExtension?: unknown;
  airerPreview?: unknown;
  airerStyle?: unknown;
  width?: unknown;
  depth?: unknown;
};
export function airerDimensions(options: AirerDimensionOptions = {}) {
  const toFiniteNumber = (rawValue: any, fallback: any) =>
      rawValue !== null && rawValue !== "" && Number.isFinite(Number(rawValue))
        ? Number(rawValue)
        : fallback,
    clamp = (numericValue: any, minValue: any, maxValue: any) =>
      Math.max(minValue, Math.min(maxValue, numericValue)),
    elevation = clamp(toFiniteNumber(options.elevation, 2.7), 0.5, 6),
    airerExtension = clamp(
      toFiniteNumber(options.airerExtension, 1.2),
      0.3,
      Math.min(2.4, elevation - 0.12),
    ),
    airerStyle = String(options.airerStyle || "double") === "single" ? "single" : "double";
  return {
    elevation: elevation,
    airerExtension: airerExtension,
    airerPreview: clamp(toFiniteNumber(options.airerPreview, 55), 0, 100),
    airerStyle,
    width: clamp(toFiniteNumber(options.width, 2.24), 1, 3.5),
    depth: clamp(toFiniteNumber(options.depth, 0.57), 0.4, 1),
    height: airerExtension,
  };
}

/** 0.7.2 电动单杆晾衣架（吊线）。 */
function createSingleAirerModel(three: any, airerConfig: any, palette: any) {
  const dimensions = airerDimensions(airerConfig),
    materialColors = {
      body: palette.appliance,
      soft: palette.applianceSoft,
      dark: palette.applianceDark,
      metal: palette.applianceDark,
    },
    airerGroup = new three.Group();
  airerGroup.name = "ceiling-single-airer";
  const materialsByRole = Object.fromEntries(
      ["body", "soft", "dark", "metal"].map((materialSlot) => [
        materialSlot,
        new three.MeshStandardMaterial({
          color: (materialColors as any)[materialSlot],
          roughness: materialSlot === "metal" || materialSlot === "dark" ? 0.4 : 0.72,
          metalness: materialSlot === "metal" || materialSlot === "dark" ? 0.45 : 0.06,
        }),
      ]),
    ),
    addMesh = (meshGeometry: any, meshRole: any, meshParent = airerGroup) => {
      const mesh = new three.Mesh(meshGeometry, materialsByRole[meshRole]);
      return ((mesh.castShadow = true), (mesh.receiveShadow = true), meshParent.add(mesh), mesh);
    };
  addMesh(new RoundedBoxGeometry(dimensions.width * 0.92, 0.08, 0.14, 2, 0.02), "body").name =
    "fixed-housing";
  const movingRack = new three.Group();
  ((movingRack.name = "moving-rack"), airerGroup.add(movingRack));
  const rail = addMesh(
    new three.CylinderGeometry(0.018, 0.018, dimensions.width * 0.85, 16),
    "metal",
    movingRack,
  );
  ((rail.rotation.z = Math.PI / 2), (rail.name = "rack-rail"));
  for (const side of [-1, 1])
    addMesh(new RoundedBoxGeometry(0.05, 0.05, 0.05, 2, 0.01), "soft", movingRack).position.set(
      side * dimensions.width * 0.42,
      0,
      0,
    );
  const cableGroup = new three.Group();
  ((cableGroup.name = "lift-cables"), airerGroup.add(cableGroup));
  const cables = [-dimensions.width * 0.32, dimensions.width * 0.32].map((offsetX) => {
    const cable = addMesh(new three.CylinderGeometry(0.004, 0.004, 1, 8), "dark", cableGroup);
    return (cable.position.set(offsetX, 0, 0), cable);
  });
  function updateRackPose(previewPercent: any) {
    const previewRatio = three.MathUtils.clamp(previewPercent, 0, 100) / 100,
      extensionSpan = 0.18 + (1 - previewRatio) * (dimensions.airerExtension - 0.18);
    movingRack.position.y = -extensionSpan;
    for (const cable of cables) {
      cable.scale.y = Math.max(0.05, extensionSpan);
      cable.position.y = -extensionSpan / 2;
    }
  }
  (airerGroup.scale.set(1, 1, dimensions.depth / 0.57), updateRackPose(dimensions.airerPreview));
  for (const restShadowNode of [movingRack, ...cables])
    (restShadowNode.updateMatrix(),
      (restShadowNode.userData.contactShadowRestMatrix = restShadowNode.matrix.toArray()));
  return (
    (airerGroup.userData.airerRig = {
      preview: dimensions.airerPreview,
      pose: updateRackPose,
      setLight: () => {},
      airerStyle: "single",
    }),
    (airerGroup.userData.airerStyle = "single"),
    airerGroup
  );
}

export function createAirerModel(three: any, airerConfig: any, palette: any) {
  if (airerDimensions(airerConfig).airerStyle === "single")
    return createSingleAirerModel(three, airerConfig, palette);
  const dimensions = airerDimensions(airerConfig),
    armSegmentCount = Math.max(3, Math.ceil(dimensions.airerExtension / 0.4)),
    materialColors = {
      body: palette.appliance,
      soft: palette.applianceSoft,
      dark: palette.applianceDark,
      trim: palette.warmWood ? palette.wood : palette.appliance,
    },
    airerGroup = new three.Group();
  airerGroup.name = "electric-airer";
  airerGroup.userData.airerStyle = "double";
  const materialsByRole = Object.fromEntries(
      ["body", "soft", "dark", "trim"].map((materialSlot) => [
        materialSlot,
        new three.MeshStandardMaterial({
          color: (materialColors as any)[materialSlot],
          roughness: materialSlot === "dark" ? 0.55 : 0.75,
          metalness: materialSlot === "dark" ? 0.18 : 0.04,
        }),
      ]),
    ),
    addMesh = (meshGeometry: any, meshRole: any, meshParent = airerGroup) => {
      const mesh = new three.Mesh(meshGeometry, materialsByRole[meshRole]);
      return ((mesh.castShadow = true), (mesh.receiveShadow = true), meshParent.add(mesh), mesh);
    },
    addRoundedBox = (
      boxWidth: any,
      boxHeight: any,
      boxDepth: any,
      positionX: any,
      positionY: any,
      positionZ: any,
      boxRole: any,
      boxParent = airerGroup,
      cornerRadius = 0.012,
    ) => {
      const boxMesh = addMesh(
        new RoundedBoxGeometry(
          boxWidth,
          boxHeight,
          boxDepth,
          2,
          Math.min(cornerRadius, boxWidth / 3, boxHeight / 3, boxDepth / 3),
        ),
        boxRole,
        boxParent,
      );
      return (boxMesh.position.set(positionX, positionY, positionZ), boxMesh);
    },
    addStrut = (startPoint: any, endPoint: any, strutRadius: any, strutRole: any, strutParent = airerGroup) => {
      const startVector = new three.Vector3(...startPoint),
        endVector = new three.Vector3(...endPoint),
        strutMesh = addMesh(
          new three.CylinderGeometry(
            strutRadius,
            strutRadius,
            startVector.distanceTo(endVector),
            10,
          ),
          strutRole,
          strutParent,
        );
      return (
        strutMesh.position.copy(startVector).add(endVector).multiplyScalar(0.5),
        strutMesh.quaternion.setFromUnitVectors(
          new three.Vector3(0, 1, 0),
          endVector.sub(startVector).normalize(),
        ),
        strutMesh
      );
    },
    rackBaseY = 0,
    movingRack = new three.Group();
  ((movingRack.name = "moving-rack"), airerGroup.add(movingRack));
  for (const railOffsetZ of [-0.26, 0.26]) {
    addStrut([-1.02, 0, railOffsetZ], [1.02, 0, railOffsetZ], 0.02, "soft", movingRack);
    for (const railSideSign of [-1, 1])
      (addStrut(
        [railSideSign * 0.95, 0, railOffsetZ],
        [railSideSign * 1.1, 0, railOffsetZ],
        0.014,
        "body",
        movingRack,
      ),
        addRoundedBox(
          0.04,
          0.048,
          0.048,
          railSideSign * 1.1,
          0,
          railOffsetZ,
          "trim",
          movingRack,
          0.01,
        ));
    for (let toothIndex = 0; toothIndex < 13; toothIndex++)
      addMesh(new three.TorusGeometry(0.016, 0.004, 6, 12), "body", movingRack).position.set(
        (toothIndex - 6) * 0.142,
        -0.023,
        railOffsetZ,
      );
  }
  for (const hangerOffset of [-0.68, 0.68])
    (addRoundedBox(0.056, 0.04, 0.55, hangerOffset, 0.012, 0, "trim", movingRack, 0.012),
      addRoundedBox(0.074, 0.055, 0.13, hangerOffset, 0.02, 0, "body", movingRack));
  for (const crossBarX of [-0.96, 0.96])
    addStrut([crossBarX, 0, -0.26], [crossBarX, 0, 0.26], 0.01, "body", movingRack);
  const rackSides: any = [];
  for (const armSide of [-1, 1]) {
    const armX = armSide * 0.68,
      armMeshes: any[] = [],
      pinMeshes: any[] = [];
    for (let segmentIndex = 0; segmentIndex < armSegmentCount; segmentIndex++)
      for (let rowIndex = 0; rowIndex < 2; rowIndex++) {
        const armBarMesh = addRoundedBox(0.016, 1, 0.024, 0, 0, 0, rowIndex ? "body" : "dark");
        armMeshes.push(armBarMesh);
      }
    for (let pinIndex = 0; pinIndex < armSegmentCount * 3 + 2; pinIndex++) {
      const pinMesh = addMesh(new three.CylinderGeometry(0.019, 0.019, 0.032, 12), "trim");
      ((pinMesh.rotation.z = Math.PI / 2), pinMeshes.push(pinMesh));
    }
    (rackSides.push({
      x: armX,
      arms: armMeshes,
      pins: pinMeshes,
    }),
      (addRoundedBox(0.065, 0.018, 0.3, armX, rackBaseY, 0, "body").name =
        armSide < 0 ? "mount-left" : "mount-right"));
  }
  function updateRackPose(previewPercent: any) {
    const previewRatio = three.MathUtils.clamp(previewPercent, 0, 100) / 100,
      extensionSpan = 0.22 + (1 - previewRatio) * (dimensions.airerExtension - 0.22),
      segmentLength = extensionSpan / armSegmentCount,
      segmentArmLength = Math.hypot(dimensions.airerExtension / armSegmentCount, 0.12),
      armSpread = Math.sqrt(
        Math.max(0, segmentArmLength * segmentArmLength - segmentLength * segmentLength),
      );
    movingRack.position.y = rackBaseY - extensionSpan;
    for (const { x: rackX, arms: arms, pins: pins } of rackSides) {
      let armMeshIndex = 0,
        pinMeshIndex = 0;
      for (let stepIndex = 0; stepIndex < armSegmentCount; stepIndex++) {
        const segmentY = rackBaseY - stepIndex * segmentLength;
        for (const armSign of [-1, 1]) {
          const armStart = new three.Vector3(
              rackX + (armSign > 0 ? 0.011 : -0.011),
              segmentY,
              (armSign * armSpread) / 2,
            ),
            armEnd = new three.Vector3(
              armStart.x,
              segmentY - segmentLength,
              (-armSign * armSpread) / 2,
            ),
            armMesh = arms[armMeshIndex++];
          (armMesh.position.copy(armStart).add(armEnd).multiplyScalar(0.5),
            (armMesh.scale.y = segmentArmLength),
            armMesh.quaternion.setFromUnitVectors(
              new three.Vector3(0, 1, 0),
              armEnd.sub(armStart).normalize(),
            ));
        }
        pins[pinMeshIndex++].position.set(rackX, segmentY - segmentLength / 2, 0);
      }
      for (let pinRowIndex = 0; pinRowIndex <= armSegmentCount; pinRowIndex++)
        for (const pinSide of [-1, 1])
          pins[pinMeshIndex++].position.set(
            rackX,
            rackBaseY - pinRowIndex * segmentLength,
            (pinSide * armSpread) / 2,
          );
    }
  }
  (airerGroup.scale.set(dimensions.width / 2.24, 1, dimensions.depth / 0.57),
    updateRackPose(dimensions.airerPreview));
  for (const restShadowNode of [
    movingRack,
    ...rackSides.flatMap(({ arms, pins }: any) => [...arms, ...pins]),
  ])
    (restShadowNode.updateMatrix(),
      (restShadowNode.userData.contactShadowRestMatrix = restShadowNode.matrix.toArray()));
  return (
    (airerGroup.userData.airerRig = {
      preview: dimensions.airerPreview,
      pose: updateRackPose,
      setLight: () => {},
    }),
    airerGroup
  );
}
