
type FanDimensionConfig = {
  fanScale?: unknown;
  fanHeight?: unknown;
  width?: unknown;
  height?: unknown;
};
export function fanDimensions(config: FanDimensionConfig = {}) {
  const numberOrDefault = (candidate, fallback) =>
      Number.isFinite(Number(candidate)) ? Number(candidate) : fallback,
    fanScale = Math.max(
      0.6,
      Math.min(1.6, numberOrDefault(config.fanScale, numberOrDefault(config.width, 0.434) / 0.434)),
    ),
    fanHeight = Math.max(
      0.65,
      Math.min(
        1.8,
        numberOrDefault(config.fanHeight, numberOrDefault(config.height, 1.23) / fanScale),
      ),
    );
  return {
    fanScale: fanScale,
    fanHeight: fanHeight,
    width: 0.434 * fanScale,
    depth: 0.324 * fanScale,
    height: fanHeight * fanScale,
  };
}
export function createFanModel(three, mergeGeometries, options, theme) {
  const palette = {
    body: theme.appliance,
    soft: theme.applianceSoft,
    dark: theme.applianceDark,
    accent: theme.warmWood ? theme.woodDark : theme.furnitureDark,
    stem: theme.warmWood ? theme.wood : theme.appliance,
    base: theme.appliance,
    blade: theme.warmWood ? theme.woodLight : theme.applianceDark,
  };
  function addMesh(parent, geometry, material, partName, offsetX = 0, offsetY = 0, offsetZ = 0) {
    const mesh = new three.Mesh(geometry, material);
    return (
      (mesh.name = partName),
      mesh.position.set(offsetX, offsetY, offsetZ),
      (mesh.castShadow = true),
      (mesh.receiveShadow = true),
      parent.add(mesh),
      mesh
    );
  }
  function addCylinder(
    cylinderParent,
    radiusTop,
    radiusBottom,
    height,
    cylinderMaterial,
    cylinderName,
    cylinderX = 0,
    cylinderY = 0,
    cylinderZ = 0,
  ) {
    return addMesh(
      cylinderParent,
      new three.CylinderGeometry(radiusTop, radiusBottom, height, 48),
      cylinderMaterial,
      cylinderName,
      cylinderX,
      cylinderY,
      cylinderZ,
    );
  }
  function addCrossCylinder(
    crossParent,
    topRadius,
    bottomRadius,
    length,
    crossMaterial,
    crossName,
    crossX = 0,
    crossY = 0,
    crossZ = 0,
  ) {
    const crossMesh = addCylinder(
      crossParent,
      topRadius,
      bottomRadius,
      length,
      crossMaterial,
      crossName,
      crossX,
      crossY,
      crossZ,
    );
    return ((crossMesh.rotation.x = Math.PI / 2), crossMesh);
  }
  function addTorus(torusParent, ringRadius, tubeRadius, torusMaterial, torusName, torusZ = 0) {
    return addMesh(
      torusParent,
      new three.TorusGeometry(ringRadius, tubeRadius, 6, 80),
      torusMaterial,
      torusName,
      0,
      0,
      torusZ,
    );
  }
  function addLathe(latheParent, points, latheMaterial, latheName) {
    return addMesh(
      latheParent,
      new three.LatheGeometry(
        points.map(([pointX, pointY]) => new three.Vector2(pointX, pointY)),
        64,
      ),
      latheMaterial,
      latheName,
    );
  }
  function buildTube(path, thickness = 0.0011) {
    return new three.TubeGeometry(new three.CatmullRomCurve3(path), 12, thickness, 4, false);
  }
  function buildFan(colorPalette) {
    const root = new three.Group();
    root.name = "pedestal-fan";
    const materialMap = Object.fromEntries(
      Object.entries(colorPalette)
        .filter(([entryKey]) => entryKey !== "ground")
        .map(([slotKey, slotColor]) => [
          slotKey,
          new three.MeshStandardMaterial({
            color: slotColor,
            roughness: slotKey === "stem" ? 0.48 : 0.64,
            metalness: slotKey === "dark" ? 0.13 : 0.04,
          }),
        ]),
    );
    (addCylinder(root, 0.153, 0.146, 0.012, materialMap.dark, "base-foot", 0, 0.009, 0),
      addLathe(
        root,
        [
          [0, 0.012],
          [0.138, 0.012],
          [0.154, 0.016],
          [0.162, 0.027],
          [0.162, 0.038],
          [0.157, 0.046],
          [0.144, 0.05],
          [0.07, 0.053],
          [0, 0.053],
        ],
        materialMap.base,
        "weighted-base",
      ),
      addCylinder(root, 0.034, 0.048, 0.024, materialMap.body, "stem-socket", 0, 0.061, -0.028));
    const lowerColumn = addCylinder(
        root,
        0.018,
        0.022,
        0.615,
        materialMap.stem,
        "lower-column",
        0,
        0.374,
        -0.028,
      ),
      heightCollar = addCylinder(
        root,
        0.0186,
        0.0186,
        0.017,
        materialMap.accent,
        "height-collar",
        0,
        0.678,
        -0.028,
      ),
      upperColumn = addCylinder(
        root,
        0.014,
        0.014,
        0.192,
        materialMap.soft,
        "upper-column",
        0,
        0.779,
        -0.028,
      ),
      neck = addCylinder(root, 0.026, 0.02, 0.035, materialMap.body, "neck", 0, 0.885, -0.028),
      touchPad = addCylinder(
        root,
        0.025,
        0.025,
        0.002,
        materialMap.dark,
        "touch-pad",
        0,
        0.054,
        0.094,
      );
    ((touchPad.scale.z = 0.77),
      addMesh(
        root,
        new three.TorusGeometry(0.006, 0.0007, 4, 22, Math.PI * 1.55),
        materialMap.soft,
        "power-symbol",
        0,
        0.0555,
        0.093,
      ).rotation.set(-Math.PI / 2, 0, Math.PI * 0.725));
    addMesh(
      root,
      new three.BoxGeometry(0.0011, 0.0007, 0.0055),
      materialMap.soft,
      "power-stroke",
      0,
      0.056,
      0.088,
    );
    for (let dotIndex = 0; dotIndex < 3; dotIndex++)
      addCylinder(
        root,
        0.0013,
        0.0013,
        0.0008,
        materialMap.soft,
        "speed-dot",
        -0.009 + dotIndex * 0.009,
        0.055,
        0.106,
      );
    const pivot = new three.Group();
    ((pivot.name = "oscillation-pivot"), pivot.position.set(0, 0.885, -0.028), root.add(pivot));
    const head = new three.Group();
    ((head.name = "head-tilt"),
      (head.position.y = 0.125),
      (head.rotation.x = -0.075),
      pivot.add(head),
      addCrossCylinder(
        head,
        0.018,
        0.018,
        0.045,
        materialMap.body,
        "tilt-joint",
        0,
        -0.047,
        -0.071,
      ).rotation.set(0, 0, Math.PI / 2));
    const neckStart = new three.Vector3(0, -0.132, -0.01),
      neckEnd = new three.Vector3(0, -0.047, -0.071),
      neckMid = neckStart.clone().add(neckEnd).multiplyScalar(0.5);
    (addCylinder(
      head,
      0.013,
      0.016,
      neckStart.distanceTo(neckEnd),
      materialMap.body,
      "neck-arm",
      ...neckMid.toArray(),
    ).quaternion.setFromUnitVectors(
      new three.Vector3(0, 1, 0),
      neckEnd.clone().sub(neckStart).normalize(),
    ),
      addCrossCylinder(head, 0.061, 0.051, 0.115, materialMap.body, "motor-shell", 0, 0, -0.059),
      addCrossCylinder(head, 0.05, 0.05, 0.009, materialMap.dark, "rear-vent-recess", 0, 0, -0.12));
    const ventBars = [];
    for (let barIndex = 0; barIndex < 10; barIndex++) {
      const barOffset = (barIndex - 4.5) * 0.0072,
        barLength = 2 * Math.sqrt(0.044 ** 2 - barOffset * barOffset),
        barGeometry = new three.BoxGeometry(0.003, barLength, 0.004);
      (barGeometry.translate(barOffset, 0, -0.126), ventBars.push(barGeometry));
    }
    (addMesh(head, mergeGeometries(ventBars), materialMap.body, "rear-vent-bars"),
      ventBars.forEach((ventBarGeometry) => ventBarGeometry.dispose()),
      addCrossCylinder(head, 0.014, 0.014, 0.003, materialMap.soft, "rear-badge", 0, 0, -0.131),
      addCylinder(
        head,
        0.007,
        0.007,
        0.018,
        materialMap.dark,
        "oscillation-knob",
        0,
        0.059,
        -0.075,
      ),
      addCylinder(
        head,
        0.01,
        0.01,
        0.005,
        materialMap.soft,
        "oscillation-knob-cap",
        0,
        0.069,
        -0.075,
      ));
    const rotor = new three.Group();
    ((rotor.name = "blade-rotor"), (rotor.position.z = 0.024), head.add(rotor));
    const bladeShape = new three.Shape();
    (bladeShape.moveTo(0.025, -0.019),
      bladeShape.bezierCurveTo(0.077, -0.064, 0.152, -0.056, 0.179, -0.011),
      bladeShape.bezierCurveTo(0.195, 0.015, 0.18, 0.049, 0.16, 0.061),
      bladeShape.bezierCurveTo(0.128, 0.081, 0.081, 0.052, 0.025, 0.022),
      bladeShape.quadraticCurveTo(0.016, 0, 0.025, -0.019));
    const bladeGeometry = new three.ExtrudeGeometry(bladeShape, {
      depth: 0.003,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.002,
      bevelThickness: 0.001,
      curveSegments: 14,
    });
    for (let bladeIndex = 0; bladeIndex < 5; bladeIndex++) {
      const blade = addMesh(rotor, bladeGeometry, materialMap.blade, "blade-" + (bladeIndex + 1));
      ((blade.rotation.z = (bladeIndex * Math.PI * 2) / 5), (blade.rotation.y = -0.09));
    }
    (addCrossCylinder(rotor, 0.037, 0.035, 0.025, materialMap.body, "rotor-hub", 0, 0, 0.009),
      addCrossCylinder(rotor, 0.021, 0.027, 0.01, materialMap.soft, "rotor-cap", 0, 0, 0.026),
      addTorus(head, 0.211, 0.006, materialMap.body, "cage-rim", 0.01),
      addTorus(head, 0.209, 0.002, materialMap.soft, "cage-front-seam", 0.025),
      addTorus(head, 0.209, 0.002, materialMap.dark, "cage-rear-seam", -0.008));
    const frontCurves = [],
      rearCurves = [];
    for (let segmentIndex = 0; segmentIndex < 56; segmentIndex++) {
      const angle = (segmentIndex * Math.PI * 2) / 56,
        frontPoints = [],
        rearPoints = [];
      for (let pointIndex = 0; pointIndex <= 6; pointIndex++) {
        const radius = 0.036 + (0.172 * pointIndex) / 6,
          bulge = Math.sqrt(Math.max(0, 1 - (radius / 0.214) ** 2));
        (frontPoints.push(
          new three.Vector3(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius,
            0.024 + 0.046 * bulge,
          ),
        ),
          segmentIndex % 2 === 0 &&
            rearPoints.push(
              new three.Vector3(
                Math.cos(angle) * radius,
                Math.sin(angle) * radius,
                0.006 - 0.047 * bulge,
              ),
            ));
      }
      (frontCurves.push(buildTube(frontPoints, 0.00095)),
        rearPoints.length && rearCurves.push(buildTube(rearPoints, 0.00115)));
    }
    const frontGrille = addMesh(
      head,
      mergeGeometries(frontCurves),
      materialMap.soft,
      "front-safety-grille",
    );
    frontGrille.castShadow = false;
    const rearGrille = addMesh(
      head,
      mergeGeometries(rearCurves),
      materialMap.body,
      "rear-safety-grille",
    );
    ((rearGrille.castShadow = false),
      [...frontCurves, ...rearCurves].forEach((grilleCurve) => grilleCurve.dispose()),
      addTorus(head, 0.139, 0.0012, materialMap.soft, "front-brace-ring", 0.059),
      addTorus(head, 0.146, 0.0013, materialMap.body, "rear-brace-ring", -0.028),
      addCrossCylinder(head, 0.037, 0.038, 0.009, materialMap.body, "grille-centre", 0, 0, 0.073),
      addCrossCylinder(head, 0.03, 0.03, 0.002, materialMap.soft, "centre-inlay", 0, 0, 0.079),
      addMesh(
        head,
        new three.BoxGeometry(0.012, 0.0015, 0.001),
        materialMap.accent,
        "centre-mark",
        0,
        0,
        0.0805,
      ));
    for (const clipAngle of [Math.PI / 2, (Math.PI * 7) / 6, (Math.PI * 11) / 6]) {
      const clip = addMesh(
        head,
        new three.BoxGeometry(0.014, 0.01, 0.022),
        materialMap.body,
        "cage-clip",
        Math.cos(clipAngle) * 0.211,
        Math.sin(clipAngle) * 0.211,
        0.008,
      );
      clip.rotation.z = clipAngle - Math.PI / 2;
    }
    ((root.userData.dimensions = {
      width: 0.434,
      height: 1.23,
      depth: 0.324,
    }),
      (root.userData.theme = colorPalette));
    function setHeight(targetHeight) {
      const clampedHeight = three.MathUtils.clamp(targetHeight, 0.65, 1.8),
        heightDelta = clampedHeight - 1.23,
        baseY = 0.0665,
        topY = 0.875 + heightDelta,
        collarY = topY - baseY,
        columnHeight = Math.min(0.615, Math.max(0.145, collarY - 0.09)),
        upperTop = baseY + columnHeight - 0.01,
        upperHeight = topY - upperTop;
      ((lowerColumn.scale.y = columnHeight / 0.615),
        (lowerColumn.position.y = baseY + columnHeight / 2),
        (heightCollar.position.y = baseY + columnHeight - 0.0035),
        (upperColumn.scale.y = upperHeight / 0.192),
        (upperColumn.position.y = upperTop + upperHeight / 2),
        (neck.position.y = 0.885 + heightDelta),
        (pivot.position.y = 0.885 + heightDelta),
        (root.userData.dimensions.height = clampedHeight));
    }
    function setScale(scale) {
      root.scale.setScalar(three.MathUtils.clamp(scale, 0.6, 1.6));
    }
    return {
      root: root,
      yaw: pivot,
      rotor: rotor,
      head: head,
      setHeight: setHeight,
      setScale: setScale,
    };
  }
  const fan = buildFan(palette),
    dimensions = fanDimensions(options);
  (fan.setHeight(dimensions.fanHeight),
    fan.setScale(dimensions.fanScale),
    (fan.yaw.userData.fanPart = "yaw"),
    (fan.rotor.userData.fanPart = "rotor"));
  for (const restShadowNode of [fan.yaw, fan.rotor])
    (restShadowNode.updateMatrix(),
      (restShadowNode.userData.contactShadowRestMatrix = restShadowNode.matrix.toArray()));
  return fan.root;
}
