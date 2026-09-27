/**
 * 小汽车（上游第三方车模 `models/vehicle/car.glb`）的整件车漆着色器与法线修订。
 */

/** 图集里车灯灯罩的多边形（700×700 像素坐标）：前三枚前大灯、后三枚尾灯。 */
export const CAR_LAMP_LENSES = {
  front: [
    [
      [208, 193],
      [238, 197],
      [257, 208],
      [215, 208]
    ],
    [
      [376, 208],
      [404, 195],
      [421, 193],
      [416, 207]
    ],
    [
      [90, 373],
      [117, 360],
      [141, 357],
      [123, 373]
    ]
  ],
  rear: [
    [
      [461, 188],
      [470, 181],
      [482, 181],
      [482, 192]
    ],
    [
      [630, 181],
      [655, 181],
      [675, 189],
      [654, 192]
    ],
    [
      [626, 350],
      [639, 343],
      [657, 341],
      [655, 351]
    ]
  ]
};

/** 图集里车窗玻璃岛的区域（`[x0, y0, x1, y1]`，同一套 700×700 像素坐标）。 */
export const CAR_GLASS_ATLAS_REGIONS = [
  [0.3, 0.655, 0.96, 0.975],
  [0.38, 0.395, 0.81, 0.49]
];

/** 图集边长（像素）。上面两张表的坐标都相对它换算成 UV。 */
const CAR_ATLAS_SIZE_PX = 700;

/** UV 字面量的有效位：图集坐标要落成 GLSL 里的浮点常量，位数多了只是拉长着色器源码。 */
const ATLAS_UV_DECIMALS = 7;

/** 像素坐标 → GLSL 的 `vec2` 字面量（UV 空间）。 */
function atlasUvLiteral(pixelPoint) {
  return (
    "vec2(" +
    (pixelPoint[0] / CAR_ATLAS_SIZE_PX).toFixed(ATLAS_UV_DECIMALS) +
    ", " +
    (pixelPoint[1] / CAR_ATLAS_SIZE_PX).toFixed(ATLAS_UV_DECIMALS) +
    ")"
  );
}

/** 多边形的有向面积（鞋带公式）：用来统一绕向，见 lensPolygonMask。 */
function polygonSignedArea(pixelPoints) {
  return pixelPoints.reduce((area, point, index) => {
    const nextPoint = pixelPoints[(index + 1) % pixelPoints.length];
    return area + point[0] * nextPoint[1] - nextPoint[0] * point[1];
  }, 0);
}

/**
 * 一枚灯罩的「在多边形以内」判据：逐边求有向距离再相乘，全部为正才落在多边形内。
 */
function lensPolygonMask(pixelPoints) {
  const orientedPoints =
    polygonSignedArea(pixelPoints) > 0 ? pixelPoints : [...pixelPoints].reverse();
  return orientedPoints
    .map(
      (point, index) =>
        "hbCarLensEdge(carUv, " +
        atlasUvLiteral(point) +
        ", " +
        atlasUvLiteral(orientedPoints[(index + 1) % orientedPoints.length]) +
        ")"
    )
    .join(" * ");
}

/** 某一侧三枚灯罩的 GLSL 表达式（各枚相乘的判据再相加）。 */
function lampLensExpression(lampSide) {
  return CAR_LAMP_LENSES[lampSide]
    .map(pixelPoints => "(" + lensPolygonMask(pixelPoints) + ")")
    .join(" + ");
}

/** 玻璃岛区域的 GLSL 表达式：落在任一矩形内即为 1（`step` 的乘积就是矩形判据）。 */
function glassIslandExpression() {
  return CAR_GLASS_ATLAS_REGIONS.map(
    ([minX, minY, maxX, maxY]) =>
      "(step(" +
      minX +
      ", glassUv.x) * step(glassUv.x, " +
      maxX +
      ") * step(" +
      minY +
      ", glassUv.y) * step(glassUv.y, " +
      maxY +
      "))"
  ).join(" + ");
}

/**
 * 玻璃：贴图集里的玻璃岛压暗 + 冷色反光。
 */
function carGlassFragmentChunk() {
  return `
      float hbCarGlass = 0.0;
      #ifdef USE_MAP
        vec2 glassUv = fract(vMapUv);
        float glassIsland = clamp(${glassIslandExpression()}, 0.0, 1.0);
        float glassValue = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        hbCarGlass = glassIsland * smoothstep(0.88, 1.05, vHbCarHeight)
          * (1.0 - smoothstep(0.055, 0.13, glassValue));
        // Preserve the windscreen, split sunroof and rear-window seals, and the
        // outer glazing edges. Only soften photographed bands inside the panes.
        // Side-window pillars keep the atlas detail as well.
        float glassSeams = max(1.0 - smoothstep(0.007, 0.019, abs(glassUv.x - 0.505)),
          max(1.0 - smoothstep(0.002, 0.006, abs(glassUv.x - 0.635)),
              1.0 - smoothstep(0.007, 0.020, abs(glassUv.x - 0.792))));
        float paneInterior = smoothstep(0.704, 0.74, glassUv.y)
          * (1.0 - smoothstep(0.907, 0.943, glassUv.y)) * (1.0 - glassSeams);
        vec3 glassAtlas = sampledDiffuseColor.rgb * 0.7 + vec3(0.012, 0.014, 0.017);
        vec3 paneColor = mix(vec3(0.026, 0.031, 0.038), sampledDiffuseColor.rgb, 0.15);
        diffuseColor.rgb = mix(diffuseColor.rgb,
          diffuse * mix(glassAtlas, paneColor, paneInterior), hbCarGlass);
      #endif`;
}

/**
 * 珍珠白漆面（暖阳原木档）：把图集里的亮面刷成暖白。
 */
function carPearlPaintChunk() {
  return `
      #ifdef USE_MAP
        // Keep atlas seams and shadow detail; exclude dark glazing, rubber and trim.
        float pearlLuma = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float pearlPaint = smoothstep(0.20, 0.48, pearlLuma) * (1.0 - hbCarGlass);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.925, 0.89) * (0.68 + 0.32 * pearlLuma), pearlPaint);
      #endif`;
}

/**
 * 车身反光与车灯：接在 `opaque_fragment` 之前，直接往 outgoingLight 上叠。
 */
function carReflectionChunk(pearlWhite) {
  return `
      float carDark = 1.0 - smoothstep(0.035, 0.16, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));
      float carUpper = smoothstep(0.68, 1.02, vHbCarHeight);
      vec3 carView = normalize(vViewPosition);
      vec3 carReflection = inverseTransformDirection(reflect(-carView, normal), viewMatrix);
      float carSky = smoothstep(-0.15, 0.85, carReflection.y);
      float carSoftbox = pow(max(dot(carReflection, normalize(vec3(-0.35, 0.8, 0.48))), 0.0), 12.0);
      float carFresnel = pow(1.0 - max(dot(normal, carView), 0.0), 4.0);
      ${
        pearlWhite
          ? `#ifdef USE_MAP
        // Retain most of the real lighting/shadow contrast on pearl paint.
        // Strong fixed fill previously flattened the body into a uniform white.
        vec3 pearlNormal = inverseTransformDirection(normal, viewMatrix);
        float pearlFill = 0.64 + 0.20 * max(pearlNormal.y, 0.0)
          + 0.12 * max(dot(pearlNormal, normalize(vec3(-0.4, 0.85, 0.32))), 0.0);
        outgoingLight = mix(outgoingLight, diffuseColor.rgb * pearlFill, pearlPaint * 0.45);
      #endif`
          : ""
      }
      outgoingLight += carDark * carUpper * vec3(0.68, 0.79, 0.94)
        * (0.012 + 0.025 * carSky + 0.07 * carSoftbox + 0.035 * carFresnel);
      // Keep the sheen restrained so it cannot wash out the glazing seams.
      outgoingLight += hbCarGlass * vec3(0.76, 0.84, 0.94)
        * (0.008 + 0.014 * carSky + 0.02 * carSoftbox);
      #ifdef USE_MAP
        vec2 carUv = fract(vMapUv);
        float carFrontLamp = clamp(${lampLensExpression("front")}, 0.0, 1.0)
          * (1.0 - smoothstep(-1.95, -1.85, vHbCarLength));
        float carRearLamp = clamp(${lampLensExpression("rear")}, 0.0, 1.0)
          * smoothstep(1.85, 1.95, vHbCarLength);
        outgoingLight += carFrontLamp * vec3(2.0, 2.3, 2.6)
          + carRearLamp * vec3(0.84, 0.036, 0.018);
      #endif`;
}

const CAR_FINISH_CACHE_KEY = "hb-car-finish-v8-pearl-shadow";

/**
 * 按位置合并重合顶点后重算法线，修掉「按平面烘焙」带来的硬棱线。
 */
export function smoothCarSurfaceNormals(THREE, inputGeometry) {
  const positionAttribute = inputGeometry?.attributes?.position;
  const normalAttribute = inputGeometry?.attributes?.normal;
  if (
    !positionAttribute ||
    !normalAttribute ||
    positionAttribute.count !== normalAttribute.count
  ) {
    return inputGeometry;
  }
  const verticesByPosition = new Map();
  const areaByVertex = new Float64Array(positionAttribute.count);
  const firstVertex = new THREE.Vector3();
  const secondVertex = new THREE.Vector3();
  const thirdVertex = new THREE.Vector3();
  const edgeNormal = new THREE.Vector3();
  const geometryIndex = inputGeometry.index;
  const triangleVertexCount = geometryIndex?.count ?? positionAttribute.count;
  for (let index = 0; index + 2 < triangleVertexCount; index += 3) {
    const triangleVertices = [0, 1, 2].map(triangleCorner =>
      geometryIndex ? geometryIndex.getX(index + triangleCorner) : index + triangleCorner
    );
    firstVertex.fromBufferAttribute(positionAttribute, triangleVertices[0]);
    secondVertex.fromBufferAttribute(positionAttribute, triangleVertices[1]);
    thirdVertex.fromBufferAttribute(positionAttribute, triangleVertices[2]);
    const triangleArea = edgeNormal
      .subVectors(secondVertex, firstVertex)
      .cross(thirdVertex.sub(firstVertex))
      .length();
    for (const vertexIndex of triangleVertices) {
      areaByVertex[vertexIndex] += triangleArea;
    }
  }
  for (let vertexIndex = 0; vertexIndex < positionAttribute.count; vertexIndex += 1) {
    const positionKey = [
      positionAttribute.getX(vertexIndex),
      positionAttribute.getY(vertexIndex),
      positionAttribute.getZ(vertexIndex)
    ]
      .map(coordinate => Math.round(coordinate * 10000))
      .join("/");
    if (!verticesByPosition.has(positionKey)) {
      verticesByPosition.set(positionKey, []);
    }
    verticesByPosition.get(positionKey).push(vertexIndex);
  }
  const smoothedGeometry = inputGeometry.clone();
  const smoothedNormals = normalAttribute.clone();
  const blendedNormal = new THREE.Vector3();
  const neighborNormal = new THREE.Vector3();
  const normalMergeCosine = Math.cos(THREE.MathUtils.degToRad(50));
  for (const coincidentVertices of verticesByPosition.values()) {
    for (const vertexIndex of coincidentVertices) {
      firstVertex.fromBufferAttribute(normalAttribute, vertexIndex).normalize();
      blendedNormal.set(0, 0, 0);
      for (const neighborIndex of coincidentVertices) {
        neighborNormal.fromBufferAttribute(normalAttribute, neighborIndex).normalize();
        if (firstVertex.dot(neighborNormal) >= normalMergeCosine) {
          blendedNormal.addScaledVector(neighborNormal, areaByVertex[neighborIndex]);
        }
      }
      if (blendedNormal.lengthSq() > 1e-16) {
        blendedNormal.normalize();
        smoothedNormals.setXYZ(
          vertexIndex,
          blendedNormal.x,
          blendedNormal.y,
          blendedNormal.z
        );
      }
    }
  }
  smoothedGeometry.setAttribute("normal", smoothedNormals);
  smoothedNormals.needsUpdate = true;
  return smoothedGeometry;
}

/**
 * 给整棵模型树做一遍上面的法线平滑：按「源几何 → 平滑后的几何」去重，同一份几何只算一次，
 */
export function smoothCarSceneSurface(THREE, scene) {
  const smoothedBySourceGeometry = new Map();
  scene.traverse?.(carMesh => {
    if (!carMesh.isMesh) {
      return;
    }
    const sourceGeometry = carMesh.geometry;
    if (!smoothedBySourceGeometry.has(sourceGeometry)) {
      smoothedBySourceGeometry.set(
        sourceGeometry,
        smoothCarSurfaceNormals(THREE, sourceGeometry)
      );
    }
    carMesh.geometry = smoothedBySourceGeometry.get(sourceGeometry);
  });
  for (const [sourceGeometry, smoothedGeometry] of smoothedBySourceGeometry) {
    if (sourceGeometry !== smoothedGeometry) {
      sourceGeometry.dispose();
    }
  }
}

/**
 * 给小车材质套上车漆 / 玻璃 / 车灯那层着色器（只对这台贴图集车模成立）。
 */
export function applyCarFinish(material, { pearlWhite = false } = {}) {
  if (!material?.isMeshStandardMaterial || material.userData.hbCarFinish) {
    return material;
  }
  const previousOnBeforeCompile = material.onBeforeCompile;
  const previousProgramCacheKey = material.customProgramCacheKey?.call(material) || "";
  material.onBeforeCompile = function (shader, renderer) {
    previousOnBeforeCompile?.call(this, shader, renderer);
    shader.vertexShader =
      "varying float vHbCarHeight;\nvarying float vHbCarLength;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvHbCarHeight = position.z;\nvHbCarLength = position.y;"
    );
    shader.fragmentShader =
      "#define HB_CAR_GLASS_FINISH\n" +
      "varying float vHbCarHeight;\n" +
      "varying float vHbCarLength;\n" +
      "float hbCarLensEdge(vec2 uv, vec2 a, vec2 b) {\n" +
      "  vec2 edge = b - a, offset = uv - a;\n" +
      "  float distance = (edge.x * offset.y - edge.y * offset.x) / length(edge);\n" +
      "  return smoothstep(-0.0005, 0.001, distance);\n" +
      "}\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      "#include <color_fragment>" + carGlassFragmentChunk()
    );
    if (pearlWhite) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        carPearlPaintChunk() + "\n      #include <roughnessmap_fragment>"
      );
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      carReflectionChunk(pearlWhite) + "\n      #include <opaque_fragment>"
    );
  };
  material.customProgramCacheKey = () =>
    previousProgramCacheKey + "|" + CAR_FINISH_CACHE_KEY + "|pearl-" + Number(pearlWhite);
  material.userData.hbCarFinish = true;
  // 车漆是整件一层着色器：表面烘焙（plan2）会在它上面再叠一层接触阴影，
  material.userData.plan2SurfaceContact = false;
  return material;
}
