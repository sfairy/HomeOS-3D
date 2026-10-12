const canvasCacheByDocument = new WeakMap();
function getCanvasCache(contentDocument: any) {
  let cacheEntry = canvasCacheByDocument.get(contentDocument);
  return (
    cacheEntry ||
      ((cacheEntry = {
        weave: null as any,
        grilles: new Map(),
      }),
      canvasCacheByDocument.set(contentDocument, cacheEntry)),
    cacheEntry
  );
}
function createWeaveCanvas(weaveDocument: any) {
  const canvasCache = getCanvasCache(weaveDocument);
  if (canvasCache.weave) return canvasCache.weave;
  const weaveCanvas = weaveDocument.createElement("canvas");
  ((weaveCanvas.width = 512), (weaveCanvas.height = 512));
  const weavePainter = weaveCanvas.getContext("2d"),
    weavePixels = weavePainter.createImageData(512, 512);
  for (let sampleRowIndex = 0; sampleRowIndex < 512; sampleRowIndex++)
    for (let sampleColumnIndex = 0; sampleColumnIndex < 512; sampleColumnIndex++) {
      const sampleUAngle = (sampleColumnIndex / 512) * Math.PI * 2 * 64,
        sampleVAngle = (sampleRowIndex / 512) * Math.PI * 2 * 64,
        grayLevel = Math.round(
          128 +
            55 * Math.sin(sampleUAngle) * Math.sin(sampleVAngle) +
            20 * Math.cos(sampleUAngle * 2 + sampleVAngle),
        ),
        pixelOffset = (sampleRowIndex * 512 + sampleColumnIndex) * 4;
      ((weavePixels.data[pixelOffset] =
        weavePixels.data[pixelOffset + 1] =
        weavePixels.data[pixelOffset + 2] =
          grayLevel),
        (weavePixels.data[pixelOffset + 3] = 255));
    }
  return (
    weavePainter.putImageData(weavePixels, 0, 0),
    (canvasCache.weave = weaveCanvas),
    weaveCanvas
  );
}
function createGrilleCanvas(grilleDocument: any, backgroundColorHex: any, holeColorHex: any) {
  const documentCache = getCanvasCache(grilleDocument),
    grilleCacheKey = backgroundColorHex + "|" + holeColorHex;
  if (documentCache.grilles.has(grilleCacheKey)) return documentCache.grilles.get(grilleCacheKey);
  const grilleCanvas = grilleDocument.createElement("canvas");
  ((grilleCanvas.width = 2048), (grilleCanvas.height = 1024));
  const grillePainter = grilleCanvas.getContext("2d"),
    toHexColor = (colorCode: any) => "#" + colorCode.toString(16).padStart(6, "0");
  ((grillePainter.fillStyle = toHexColor(backgroundColorHex)),
    grillePainter.fillRect(0, 0, 2048, 1024),
    (grillePainter.fillStyle = toHexColor(holeColorHex)));
  for (let holeRowIndex = 0; holeRowIndex < 48; holeRowIndex++)
    for (let holeColumnIndex = 0; holeColumnIndex < 128; holeColumnIndex++) {
      const holeRowRatio = 0.042 + holeRowIndex * 0.00345;
      (grillePainter.beginPath(),
        grillePainter.ellipse(
          (holeColumnIndex + (holeRowIndex % 2) * 0.5) * 16,
          1024 * (1 - holeRowRatio / 0.227),
          2.2,
          2.5,
          0,
          0,
          Math.PI * 2,
        ),
        grillePainter.fill());
    }
  return (
    documentCache.grilles.size >= 2 &&
      documentCache.grilles.delete(documentCache.grilles.keys().next().value),
    documentCache.grilles.set(grilleCacheKey, grilleCanvas),
    grilleCanvas
  );
}
export function createSpeakerModel(three: any, dimensions: any, options: any) {
  const isWarmWood = !!options.warmWood,
    speakerWeaveCanvas = createWeaveCanvas(document),
    weaveTexture = new three.CanvasTexture(speakerWeaveCanvas);
  ((weaveTexture.wrapS = weaveTexture.wrapT = three.RepeatWrapping), weaveTexture.repeat.set(1, 1));
  const createMaterial = (baseColor: any, roughness = 0.65, metalness = 0) =>
      new three.MeshStandardMaterial({
        color: baseColor,
        roughness: roughness,
        metalness: metalness,
      }),
    bodyMaterial = createMaterial(isWarmWood ? options.furnitureLight : options.appliance, 0.92);
  ((bodyMaterial.bumpMap = weaveTexture),
    (bodyMaterial.bumpScale = 0.00022),
    (weaveTexture.anisotropy = 4));
  const footRingMaterial = createMaterial(
      isWarmWood ? options.wood : options.applianceDark,
      0.52,
      0.08,
    ),
    topPlateMaterial = createMaterial(
      isWarmWood ? options.appliance : options.applianceDark,
      0.53,
      0.05,
    ),
    darkMaterial = createMaterial(options.applianceDark, 0.8),
    accentMaterial = createMaterial(isWarmWood ? options.woodDark : options.applianceSoft, 0.5),
    speakerGroup = new three.Group();
  function addMesh(meshGeometry: any, meshMaterial: any, positionX = 0, positionY = 0, positionZ = 0) {
    const partMesh = new three.Mesh(meshGeometry, meshMaterial);
    return (
      partMesh.position.set(positionX, positionY, positionZ),
      (partMesh.castShadow = true),
      (partMesh.receiveShadow = false),
      speakerGroup.add(partMesh),
      partMesh
    );
  }
  function addLatheMesh(profilePoints: any, latheMaterial: any) {
    return addMesh(
      new three.LatheGeometry(
        profilePoints.map(([pointX, pointY]: any) => new three.Vector2(pointX, pointY)),
        96,
      ),
      latheMaterial,
    );
  }
  function addCylinder(radius: any, height: any, offsetY: any, cylinderMaterial: any) {
    return addMesh(
      new three.CylinderGeometry(radius, radius, height, 96),
      cylinderMaterial,
      0,
      offsetY,
    );
  }
  (addCylinder(0.069, 0.006, 0.004, darkMaterial),
    addLatheMesh(
      [
        [0, 0.006],
        [0.069, 0.006],
        [0.076, 0.008],
        [0.081, 0.012],
        [0.083, 0.018],
        [0.083, 0.025],
        [0.081, 0.03],
        [0, 0.03],
      ],
      footRingMaterial,
    ),
    addLatheMesh(
      [
        [0, 0.024],
        [0.077, 0.024],
        [0.081, 0.028],
        [0.0835, 0.036],
        [0.085, 0.05],
        [0.085, 0.182],
        [0.084, 0.202],
        [0.08, 0.215],
        [0.075, 0.224],
        [0.071, 0.227],
        [0.0698, 0.227],
        [0.0698, 0.223],
      ],
      bodyMaterial,
    ));
  const speakerGrilleCanvas = createGrilleCanvas(
      document,
      isWarmWood ? options.furnitureLight : options.appliance,
      isWarmWood ? options.solidDoorFrame : options.applianceDark,
    ),
    grilleTexture = new three.CanvasTexture(speakerGrilleCanvas);
  ((grilleTexture.colorSpace = three.SRGBColorSpace), (grilleTexture.anisotropy = 4));
  const topPlateMesh = speakerGroup.children[speakerGroup.children.length - 1],
    platePositionAttribute = topPlateMesh.geometry.attributes.position,
    plateUvAttribute = topPlateMesh.geometry.attributes.uv;
  for (let uvIndex = 0; uvIndex < plateUvAttribute.count; uvIndex++)
    plateUvAttribute.setY(uvIndex, platePositionAttribute.getY(uvIndex) / 0.227);
  ((plateUvAttribute.needsUpdate = true),
    (bodyMaterial.map = grilleTexture),
    bodyMaterial.color.setRGB(1, 1, 1),
    addCylinder(0.0715, 0.002, 0.2278, darkMaterial));
  function createRingGeometry(tubeRadius: any) {
    const ringGeometry = new three.TorusGeometry(0.0709, tubeRadius, 12, 160),
      ringPositionAttribute = ringGeometry.attributes.position,
      colorComponents: any[] = [],
      ringColor = new three.Color();
    for (
      let ringVertexIndex = 0;
      ringVertexIndex < ringPositionAttribute.count;
      ringVertexIndex++
    ) {
      const hue =
        (Math.atan2(
          ringPositionAttribute.getY(ringVertexIndex),
          ringPositionAttribute.getX(ringVertexIndex),
        ) /
          (Math.PI * 2) +
          1) %
        1;
      (ringColor.setHSL(hue, 0.95, 0.48),
        colorComponents.push(ringColor.r, ringColor.g, ringColor.b));
    }
    return (
      ringGeometry.setAttribute("color", new three.Float32BufferAttribute(colorComponents, 3)),
      ringGeometry
    );
  }
  const ringMaterial = new three.MeshBasicMaterial({
      color: 16777215,
      vertexColors: true,
      toneMapped: false,
    }),
    ringMesh = addMesh(createRingGeometry(0.0016), ringMaterial, 0, 0.232, 0);
  ((ringMesh.rotation.x = Math.PI / 2), (ringMesh.castShadow = false));
  const haloRings = [0.0025, 0.004, 0.006].map((haloRadius, haloIndex) => {
    const haloMaterial = new three.MeshBasicMaterial({
        color: 16777215,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: three.AdditiveBlending,
        toneMapped: false,
      }),
      haloMesh = addMesh(createRingGeometry(haloRadius), haloMaterial, 0, 0.232, 0);
    return (
      (haloMesh.rotation.x = Math.PI / 2),
      (haloMesh.castShadow = false),
      (haloMesh.renderOrder = 2 + haloIndex),
      {
        mesh: haloMesh,
        material: haloMaterial,
        peak: [0.3, 0.14, 0.06][haloIndex],
      }
    );
  });
  addLatheMesh(
    [
      [0, 0.229],
      [0.066, 0.229],
      [0.069, 0.23],
      [0.069, 0.231],
      [0.0675, 0.232],
      [0, 0.232],
    ],
    topPlateMaterial,
  );
  const addTopBox = (boxWidth: any, boxDepth: any, boxX: any, boxZ: any) => {
    const detailMesh = addMesh(
      new three.BoxGeometry(boxWidth, 0.0006, boxDepth),
      accentMaterial,
      boxX,
      0.2324,
      boxZ,
    );
    return ((detailMesh.castShadow = false), detailMesh);
  };
  (addTopBox(0.01, 0.0015, -0.034, 0),
    addTopBox(0.0015, 0.00425, -0.034, -0.002875),
    addTopBox(0.0015, 0.00425, -0.034, 0.002875),
    addTopBox(0.01, 0.0015, 0.034, 0),
    addTopBox(0.0017, 0.009, -0.0024, 0),
    addTopBox(0.0017, 0.009, 0.0024, 0));
  for (const screwX of [-0.029, 0.029])
    for (const screwZ of [-0.037, 0.037]) {
      const pinMesh = addCylinder(0.0011, 0.0005, 0.2324, darkMaterial);
      (pinMesh.position.set(screwX, 0.2324, screwZ), (pinMesh.castShadow = false));
    }
  (addMesh(new three.BoxGeometry(0.013, 0.004, 0.0018), darkMaterial, 0, 0.017, -0.083),
    addMesh(new three.BoxGeometry(0.009, 0.0013, 0.0019), accentMaterial, 0, 0.017, -0.084),
    (ringMesh.userData.speakerRing = true),
    (ringMesh.visible = false));
  for (const haloRing of haloRings)
    ((haloRing.mesh.userData.speakerHalo = haloRing.peak), (haloRing.mesh.visible = false));
  return (
    speakerGroup.scale.set(
      dimensions.width / 0.17,
      dimensions.height / 0.2336,
      dimensions.depth / 0.17,
    ),
    speakerGroup
  );
}
