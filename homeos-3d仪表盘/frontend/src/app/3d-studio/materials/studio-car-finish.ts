const CAR_LAMP_LENSES = {
    front: [
      [
        [208, 193],
        [238, 197],
        [257, 208],
        [215, 208],
      ],
      [
        [376, 208],
        [404, 195],
        [421, 193],
        [416, 207],
      ],
      [
        [90, 373],
        [117, 360],
        [141, 357],
        [123, 373],
      ],
    ],
    rear: [
      [
        [461, 188],
        [470, 181],
        [482, 181],
        [482, 192],
      ],
      [
        [630, 181],
        [655, 181],
        [675, 189],
        [654, 192],
      ],
      [
        [626, 350],
        [639, 343],
        [657, 341],
        [655, 351],
      ],
    ],
  },
  CAR_GLASS_ATLAS_REGIONS = [
    [0.3, 0.655, 0.96, 0.975],
    [0.38, 0.395, 0.81, 0.49],
  ];
const formatAtlasUvLiteral = (pixelPoint) =>
    "vec2(" + (pixelPoint[0] / 700).toFixed(7) + ", " + (pixelPoint[1] / 700).toFixed(7) + ")",
  buildLensPolygonMask = (polygonPoints) => {
    const orientedPoints =
      polygonPoints.reduce((signedArea, polygonPoint, pointIndex) => {
        const nextPoint = polygonPoints[(pointIndex + 1) % polygonPoints.length];
        return signedArea + polygonPoint[0] * nextPoint[1] - nextPoint[0] * polygonPoint[1];
      }, 0) > 0
        ? polygonPoints
        : [...polygonPoints].reverse();
    return orientedPoints
      .map(
        (edgePoint, edgeIndex) =>
          "hbCarLensEdge(carUv, " +
          formatAtlasUvLiteral(edgePoint) +
          ", " +
          formatAtlasUvLiteral(orientedPoints[(edgeIndex + 1) % orientedPoints.length]) +
          ")",
      )
      .join(" * ");
  },
  buildLampLensExpression = (lampSide) =>
    CAR_LAMP_LENSES[lampSide]
      .map(buildLensPolygonMask)
      .map((lensPoints) => "(" + lensPoints + ")")
      .join(" + ");
export function smoothCarSurfaceNormals(three, inputGeometry) {
  const positionAttribute = inputGeometry?.attributes?.position,
    normalAttribute = inputGeometry?.attributes?.normal;
  if (!positionAttribute || !normalAttribute || positionAttribute.count !== normalAttribute.count)
    return inputGeometry;
  const verticesByPosition = new Map(),
    vertexAreaSum = new Float64Array(positionAttribute.count),
    firstVertex = new three.Vector3(),
    secondVertex = new three.Vector3(),
    thirdVertex = new three.Vector3(),
    edgeNormal = new three.Vector3(),
    geometryIndex = inputGeometry.index,
    triangleVertexCount = geometryIndex?.count ?? positionAttribute.count;
  for (
    let triangleStartIndex = 0;
    triangleStartIndex + 2 < triangleVertexCount;
    triangleStartIndex += 3
  ) {
    const triangleVertices = [0, 1, 2].map((triangleCorner) =>
      geometryIndex
        ? geometryIndex.getX(triangleStartIndex + triangleCorner)
        : triangleStartIndex + triangleCorner,
    );
    (firstVertex.fromBufferAttribute(positionAttribute, triangleVertices[0]),
      secondVertex.fromBufferAttribute(positionAttribute, triangleVertices[1]),
      thirdVertex.fromBufferAttribute(positionAttribute, triangleVertices[2]));
    const triangleArea = edgeNormal
      .subVectors(secondVertex, firstVertex)
      .cross(thirdVertex.sub(firstVertex))
      .length();
    for (const triangleVertexIndex of triangleVertices)
      vertexAreaSum[triangleVertexIndex] += triangleArea;
  }
  for (let vertexIndex = 0; vertexIndex < positionAttribute.count; vertexIndex++) {
    const positionKey = [
      positionAttribute.getX(vertexIndex),
      positionAttribute.getY(vertexIndex),
      positionAttribute.getZ(vertexIndex),
    ]
      .map((coordinate) => Math.round(coordinate * 10000))
      .join("/");
    (verticesByPosition.has(positionKey) || verticesByPosition.set(positionKey, []),
      verticesByPosition.get(positionKey).push(vertexIndex));
  }
  const smoothedGeometry = inputGeometry.clone(),
    smoothedNormals = normalAttribute.clone(),
    blendedNormal = new three.Vector3(),
    normalMergeCosine = Math.cos(three.MathUtils.degToRad(50));
  for (const coincidentVertices of verticesByPosition.values())
    for (const candidateVertexIndex of coincidentVertices) {
      (firstVertex.fromBufferAttribute(normalAttribute, candidateVertexIndex).normalize(),
        blendedNormal.set(0, 0, 0));
      for (const neighborVertexIndex of coincidentVertices)
        (secondVertex.fromBufferAttribute(normalAttribute, neighborVertexIndex).normalize(),
          firstVertex.dot(secondVertex) >= normalMergeCosine &&
            blendedNormal.addScaledVector(secondVertex, vertexAreaSum[neighborVertexIndex]));
      blendedNormal.lengthSq() > 1e-16 &&
        (blendedNormal.normalize(),
        smoothedNormals.setXYZ(
          candidateVertexIndex,
          blendedNormal.x,
          blendedNormal.y,
          blendedNormal.z,
        ));
    }
  return (
    smoothedGeometry.setAttribute("normal", smoothedNormals),
    (smoothedNormals.needsUpdate = true),
    smoothedGeometry
  );
}
const sceneLightUniform = {
  value: 0.85,
};
export function applyCarFinish(material, { pearlWhite: isPearlWhite = false } = {}) {
  if (!material?.isMeshStandardMaterial || material.userData.hbCarFinish) return material;
  const previousOnBeforeCompile = material.onBeforeCompile,
    previousProgramCacheKey = material.customProgramCacheKey?.call(material) || "";
  return (
    (material.onBeforeCompile = function (shader, renderer) {
      (previousOnBeforeCompile?.call(this, shader, renderer),
        (shader.uniforms.hbCarSceneLight = sceneLightUniform),
        (shader.vertexShader =
          "varying float vHbCarHeight;\nvarying float vHbCarLength;\n" + shader.vertexShader),
        (shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvHbCarHeight = position.z;\nvHbCarLength = position.y;",
        )),
        (shader.fragmentShader =
          "#define HB_CAR_GLASS_FINISH\n      uniform float hbCarSceneLight;\n      varying float vHbCarHeight;\n      varying float vHbCarLength;\n      vec3 hbCarRoofTex(sampler2D atlas, vec2 uv) {\n        vec3 center = mix(texture2D(atlas, vec2(uv.x, 0.770)).rgb,\n          texture2D(atlas, vec2(uv.x, 0.895)).rgb,\n          smoothstep(0.770, 0.895, uv.y));\n        float band = smoothstep(0.765, 0.795, uv.y)\n          * (1.0 - smoothstep(0.875, 0.902, uv.y));\n        return mix(texture2D(atlas, uv).rgb, center, band);\n      }\n      float hbCarLensEdge(vec2 uv, vec2 a, vec2 b) {\n        vec2 edge = b - a, offset = uv - a;\n        float distance = (edge.x * offset.y - edge.y * offset.x) / length(edge);\n        return smoothstep(-0.0005, 0.001, distance);\n      }\n      " +
          shader.fragmentShader),
        (shader.fragmentShader = shader.fragmentShader.replace(
          "#include <color_fragment>",
          "\n      #include <color_fragment>\n      float hbCarGlass = 0.0;\n      float hbRoofInterior = 0.0;\n      #ifdef USE_MAP\n        vec2 glassUv = fract(vMapUv);\n        float glassIsland = clamp(" +
            CAR_GLASS_ATLAS_REGIONS.map(
              ([minX, minY, maxX, maxY]) =>
                "(step(" +
                minX +
                ", glassUv.x) * step(glassUv.x, " +
                maxX +
                ") * step(" +
                minY +
                ", glassUv.y) * step(glassUv.y, " +
                maxY +
                "))",
            ).join(" + ") +
            ", 0.0, 1.0);\n        float glassValue = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));\n        hbCarGlass = glassIsland * smoothstep(0.72, 0.92, vHbCarHeight)\n          * (1.0 - smoothstep(0.12, 0.30, glassValue));\n        // The atlas has a photographed exposure step across its lateral\n        // center (v ~= .82), which becomes the longitudinal stripe on the car.\n        // Reconstruct only that band from the neighboring rows at the same u:\n        // the real front/roof/rear boundaries and frame details remain in u.\n        float paneInterior = smoothstep(0.700, 0.718, glassUv.y)\n          * (1.0 - smoothstep(0.930, 0.945, glassUv.y));\n        hbRoofInterior = paneInterior * hbCarGlass;\n        vec3 glassAtlas = sampledDiffuseColor.rgb * 0.85;\n        vec3 upperRow = texture2D(map, vec2(glassUv.x, 0.770)).rgb;\n        vec3 lowerRow = texture2D(map, vec2(glassUv.x, 0.895)).rgb;\n        vec3 restoredBand = mix(upperRow, lowerRow, smoothstep(0.770, 0.895, glassUv.y));\n        float stripeBand = smoothstep(0.765, 0.795, glassUv.y)\n          * (1.0 - smoothstep(0.875, 0.902, glassUv.y));\n        vec3 roofAtlas = mix(sampledDiffuseColor.rgb, restoredBand, stripeBand);\n        // Remove the photographed double crease above the windscreen locally.\n        // Sample both sides with the same center-stripe correction so this\n        // repair cannot bring back the old longitudinal exposure boundary.\n        vec3 frontClean = mix(texture2D(map, vec2(0.460, glassUv.y)).rgb,\n          mix(texture2D(map, vec2(0.460, 0.770)).rgb,\n              texture2D(map, vec2(0.460, 0.895)).rgb,\n              smoothstep(0.770, 0.895, glassUv.y)), stripeBand);\n        vec3 roofClean = mix(texture2D(map, vec2(0.565, glassUv.y)).rgb,\n          mix(texture2D(map, vec2(0.565, 0.770)).rgb,\n              texture2D(map, vec2(0.565, 0.895)).rgb,\n              smoothstep(0.770, 0.895, glassUv.y)), stripeBand);\n        float creaseRepair = smoothstep(0.460, 0.483, glassUv.x)\n          * (1.0 - smoothstep(0.535, 0.565, glassUv.x));\n        roofAtlas = mix(roofAtlas, mix(frontClean, roofClean,\n          smoothstep(0.460, 0.565, glassUv.x)), creaseRepair);\n        // Transfer the existing rear roof joint's local texture contrast,\n        // including its soft bevel, instead of drawing a flat dark stroke.\n        // Normalize against neighboring glass to retain the front pane tone.\n        float sealAcross = clamp((glassUv.y - 0.823) / 0.123, -1.0, 1.0);\n        float sealU = 0.493 + 0.017 * sealAcross * sealAcross;\n        float sealOffset = glassUv.x - sealU;\n        float jointU = 0.635 + sealOffset;\n        vec3 jointTexel = hbCarRoofTex(map, vec2(jointU, glassUv.y));\n        vec3 jointBase = mix(hbCarRoofTex(map, vec2(0.610, glassUv.y)),\n          hbCarRoofTex(map, vec2(0.660, glassUv.y)),\n          clamp((jointU - 0.610) / 0.050, 0.0, 1.0));\n        vec3 jointRelief = clamp(jointTexel / max(jointBase, vec3(0.001)),\n          vec3(0.40), vec3(1.50));\n        float jointBlend = 1.0 - smoothstep(0.018, 0.025, abs(sealOffset));\n        roofAtlas *= mix(vec3(1.0), jointRelief, jointBlend);\n        diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * glassAtlas, hbCarGlass);\n        diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * roofAtlas, hbRoofInterior);\n      #endif",
        )),
        (shader.fragmentShader = shader.fragmentShader.replace(
          "#include <roughnessmap_fragment>",
          "\n      #include <roughnessmap_fragment>\n      roughnessFactor = mix(roughnessFactor, 0.32, hbCarGlass * (1.0 - hbRoofInterior));",
        )),
        isPearlWhite &&
          (shader.fragmentShader = shader.fragmentShader.replace(
            "#include <roughnessmap_fragment>",
            "\n      #ifdef USE_MAP\n        // Keep atlas seams and shadow detail; exclude dark glazing, rubber and trim.\n        float pearlLuma = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));\n        float pearlPaint = smoothstep(0.20, 0.48, pearlLuma) * (1.0 - hbCarGlass);\n        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.925, 0.89) * (0.68 + 0.32 * pearlLuma), pearlPaint);\n      #endif\n      #include <roughnessmap_fragment>",
          )),
        (shader.fragmentShader = shader.fragmentShader.replace(
          "#include <opaque_fragment>",
          "\n      float carDark = 1.0 - smoothstep(0.035, 0.16, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));\n      float carUpper = smoothstep(0.68, 1.02, vHbCarHeight);\n      vec3 carView = normalize(vViewPosition);\n      vec3 carReflection = inverseTransformDirection(reflect(-carView, normal), viewMatrix);\n      float carSky = smoothstep(-0.15, 0.85, carReflection.y);\n      float carSoftbox = pow(max(dot(carReflection, normalize(vec3(-0.35, 0.8, 0.48))), 0.0), 12.0);\n      float carFresnel = pow(1.0 - max(dot(normal, carView), 0.0), 4.0);\n      " +
            (isPearlWhite
              ? "\n      #ifdef USE_MAP\n        // Retain most of the real lighting/shadow contrast on pearl paint.\n        // Strong fixed fill previously flattened the body into a uniform white.\n        vec3 pearlNormal = inverseTransformDirection(normal, viewMatrix);\n        float pearlFill = 0.64 + 0.20 * max(pearlNormal.y, 0.0)\n          + 0.12 * max(dot(pearlNormal, normalize(vec3(-0.4, 0.85, 0.32))), 0.0);\n        outgoingLight = mix(outgoingLight, diffuseColor.rgb * pearlFill, pearlPaint * 0.45);\n      #endif"
              : "") +
            "\n      // A continuous reflection across the roof avoids a black center with\n      // pale edge strips. The scene switch dims this environment approximation.\n      float roofReflection = mix(1.0, 0.85,\n        step(0.655, fract(vMapUv.y)) * hbCarGlass);\n      outgoingLight += carDark * carUpper * vec3(0.68, 0.79, 0.94)\n        * (0.012 + 0.025 * carSky + 0.07 * carSoftbox + 0.035 * carFresnel)\n        * roofReflection * hbCarSceneLight;\n      // Keep the sheen restrained so it cannot wash out the glazing seams.\n      outgoingLight += hbCarGlass * vec3(0.76, 0.84, 0.94)\n        * (0.008 + 0.014 * carSky + 0.02 * carSoftbox)\n        * roofReflection * hbCarSceneLight;\n      #ifdef USE_MAP\n        vec2 carUv = fract(vMapUv);\n        float carFrontLamp = clamp(" +
            buildLampLensExpression("front") +
            ", 0.0, 1.0)\n          * (1.0 - smoothstep(-1.95, -1.85, vHbCarLength));\n        float carRearLamp = clamp(" +
            buildLampLensExpression("rear") +
            ", 0.0, 1.0)\n          * smoothstep(1.85, 1.95, vHbCarLength);\n        outgoingLight += carFrontLamp * vec3(2.0, 2.3, 2.6)\n          + carRearLamp * vec3(0.84, 0.036, 0.018);\n      #endif\n      #include <opaque_fragment>",
        )));
    }),
    (material.customProgramCacheKey = () =>
      previousProgramCacheKey +
      "|hb-car-finish-v10-matched-roof-joint|pearl-" +
      Number(isPearlWhite)),
    (material.userData.hbCarFinish = true),
    (material.userData.plan2SurfaceContact = false),
    material
  );
}
