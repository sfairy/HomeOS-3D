/**
 * 汽车模型的着色增强：车漆高光、车窗玻璃与车灯发光。
 *
 * 外部导入的汽车模型只有基础 PBR 材质，本模块在材质编译阶段注入自定义 GLSL，补上拍照贴图里
 * 缺失的镜面感与灯带亮度。约定：两张常量表的坐标相对 700×700 车体贴图（单位 = 贴图像素），
 * 与车模 UV 布局绑定，换模型必须同步更新。注入的 GLSL 字符串里保留了原有英文注释 —— 那属于
 * 字符串内容，按原文保留。
 */

// 前后车灯灯罩的轮廓多边形（贴图像素坐标），一盏灯由多段灯带组成。
// 顶点顺序不限：生成着色器表达式前会按带符号面积统一环绕方向。
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
// 车玻璃在贴图图集里的两块「岛区」，格式为 [minU, minV, maxU, maxV]（归一化 UV）：
// 一块是侧窗 / 后窗带，另一块是风挡带；着色器据此判断当前像素是否落在玻璃上。
export const CAR_GLASS_ATLAS_REGIONS = [
  [0.3, 0.655, 0.96, 0.975],
  [0.38, 0.395, 0.81, 0.49]
];
// 把 700×700 贴图像素坐标转成 GLSL 的 vec2 字面量；
// 固定 7 位小数是为了让常量在不同 GPU 的浮点精度下保持稳定，避免编译期出现细微分歧。
const toGlslVec2 = uvPoint =>
  "vec2(" + (uvPoint[0] / 700).toFixed(7) + ", " + (uvPoint[1] / 700).toFixed(7) + ")";
/**
 * 生成「UV 是否落在该多边形内」的 GLSL 表达式：逐边做半平面判定再相乘（凸多边形内判定）。
 * 必须先统一环绕方向，否则不同朝向的多边形会得到相反的符号。
 */
const buildLensEdgeExpression = lens => {
  // 鞋带公式求带符号面积：为负说明是顺时针，反转后保证每条边的判定符号一致。
  const windingOrdered =
    lens.reduce((signedArea, point, index) => {
      const nextPoint = lens[(index + 1) % lens.length];
      return signedArea + point[0] * nextPoint[1] - nextPoint[0] * point[1];
    }, 0) > 0
      ? lens
      : [...lens].reverse();
  return windingOrdered
    .map(
      (lensPoint, lensIndex) =>
        "hbCarLensEdge(carUv, " +
        toGlslVec2(lensPoint) +
        ", " +
        toGlslVec2(windingOrdered[(lensIndex + 1) % windingOrdered.length]) +
        ")"
    )
    .join(" * ");
};
// 同一盏灯的多个灯带取并集：各多边形的判定结果直接相加，由着色器侧再 clamp 到 1。
const buildLampGlowExpression = lampId =>
  CAR_LAMP_LENSES[lampId]
    .map(buildLensEdgeExpression)
    .map(edgeExpression => "(" + edgeExpression + ")")
    .join(" + ");
/**
 * 按空间位置合并重复顶点的法线，让车漆表面平滑着色。
 * 车模常因 UV 或材质分组把同一位置拆成多个顶点、各自独立法线，渲染出接缝；这里按位置聚类做面积加权平均，
 * 但只合并夹角 50° 以内的邻居，以保住车身折角的硬边。
 */
export function smoothCarSurfaceNormals(THREE, geometry) {
  const positionAttribute = geometry?.attributes?.position;
  const normalAttribute = geometry?.attributes?.normal;
  if (!positionAttribute || !normalAttribute || positionAttribute.count !== normalAttribute.count) {
    return geometry;
  }
  // 位置键 → 落在同一位置上的全部顶点下标，供下面的法线聚类使用。
  const vertexIndexByPosition = new Map();
  const vertexWeights = new Float64Array(positionAttribute.count);
  const triangleA = new THREE.Vector3();
  const triangleB = new THREE.Vector3();
  const triangleC = new THREE.Vector3();
  const crossVector = new THREE.Vector3();
  const indexAttribute = geometry.index;
  const triangleVertexCount = indexAttribute?.count ?? positionAttribute.count;
  // 第一遍遍历三角形并按面积给顶点加权：面积越大，它的法线对平滑结果影响越大。
  for (let triangleOffset = 0; triangleOffset + 2 < triangleVertexCount; triangleOffset += 3) {
    const triangleIndices = [0, 1, 2].map(corner =>
      indexAttribute ? indexAttribute.getX(triangleOffset + corner) : triangleOffset + corner
    );
    triangleA.fromBufferAttribute(positionAttribute, triangleIndices[0]);
    triangleB.fromBufferAttribute(positionAttribute, triangleIndices[1]);
    triangleC.fromBufferAttribute(positionAttribute, triangleIndices[2]);
    const triangleArea = crossVector
      .subVectors(triangleB, triangleA)
      .cross(triangleC.sub(triangleA))
      .length();
    for (const cornerIndex of triangleIndices) {
      vertexWeights[cornerIndex] += triangleArea;
    }
  }
  // 第二遍按位置建索引。坐标乘以 1e4 再取整作为键：车模尺度约数米，
  // 这样既能容忍浮点误差，又不至于把相邻顶点误并成同一个。
  for (let vertexIndex = 0; vertexIndex < positionAttribute.count; vertexIndex++) {
    const positionKey = [
      positionAttribute.getX(vertexIndex),
      positionAttribute.getY(vertexIndex),
      positionAttribute.getZ(vertexIndex)
    ]
      .map(coordinate => Math.round(coordinate * 10000))
      .join("/");
    if (!vertexIndexByPosition.has(positionKey)) {
      vertexIndexByPosition.set(positionKey, []);
    }
    vertexIndexByPosition.get(positionKey).push(vertexIndex);
  }
  // 先克隆几何与法线属性：聚类计算始终读原始法线，写入落在副本上。
  const smoothedGeometry = geometry.clone();
  const smoothedNormals = normalAttribute.clone();
  const accumulatedNormal = new THREE.Vector3();
  // 50° 的余弦阈值：只跟朝向接近的邻居做平均，避免把车窗与车身之间的硬边一并磨平。
  const cosineThreshold = Math.cos(THREE.MathUtils.degToRad(50));
  // 同一位置的每个顶点都要重算：以自身原始法线为参考，只累积夹角够小的邻居法线。
  for (const samePositionIndices of vertexIndexByPosition.values()) {
    for (const sourceVertexIndex of samePositionIndices) {
      triangleA.fromBufferAttribute(normalAttribute, sourceVertexIndex).normalize();
      accumulatedNormal.set(0, 0, 0);
      for (const neighborIndex of samePositionIndices) {
        triangleB.fromBufferAttribute(normalAttribute, neighborIndex).normalize();
        if (triangleA.dot(triangleB) >= cosineThreshold) {
          accumulatedNormal.addScaledVector(triangleB, vertexWeights[neighborIndex]);
        }
      }
      if (accumulatedNormal.lengthSq() > 1e-16) {
        accumulatedNormal.normalize();
        smoothedNormals.setXYZ(
          sourceVertexIndex,
          accumulatedNormal.x,
          accumulatedNormal.y,
          accumulatedNormal.z
        );
      }
    }
  }
  smoothedGeometry.setAttribute("normal", smoothedNormals);
  smoothedNormals.needsUpdate = true;
  return smoothedGeometry;
}
/**
 * 给车身材质注入车漆 / 玻璃 / 车灯效果：通过 onBeforeCompile 挂到标准材质上，不改几何与贴图；
 * 已注入过（userData.hbCarFinish）或非标准材质的对象原样返回。
 */
export function applyCarFinish(material, { pearlWhite = false } = {}) {
  if (!material?.isMeshStandardMaterial || material.userData.hbCarFinish) {
    return material;
  }
  // 记下原有的编译钩子与缓存键：材质可能已被上层改过，
  // 必须在原基础上叠加，否则会丢掉别人注入的效果，或让着色器缓存串味。
  const previousOnBeforeCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey?.call(material) || "";
  // 用函数表达式而非箭头函数：three.js 调用时 this 指向材质，箭头函数拿不到。
  material.onBeforeCompile = function (shader, renderer) {
    previousOnBeforeCompile?.call(this, shader, renderer);
    shader.vertexShader =
      "varying float vHbCarHeight;\nvarying float vHbCarLength;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvHbCarHeight = position.z;\nvHbCarLength = position.y;"
    );
    shader.fragmentShader =
      "#define HB_CAR_GLASS_FINISH\n      varying float vHbCarHeight;\n      varying float vHbCarLength;\n      float hbCarLensEdge(vec2 uv, vec2 a, vec2 b) {\n        vec2 edge = b - a, offset = uv - a;\n        float distance = (edge.x * offset.y - edge.y * offset.x) / length(edge);\n        return smoothstep(-0.0005, 0.001, distance);\n      }\n      " +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      "\n      #include <color_fragment>\n      float hbCarGlass = 0.0;\n      #ifdef USE_MAP\n        vec2 glassUv = fract(vMapUv);\n        float glassIsland = clamp(" +
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
            "))"
        ).join(" + ") +
        ", 0.0, 1.0);\n        float glassValue = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));\n        hbCarGlass = glassIsland * smoothstep(0.88, 1.05, vHbCarHeight)\n          * (1.0 - smoothstep(0.055, 0.13, glassValue));\n        // Preserve the windscreen, split sunroof and rear-window seals, and the\n        // outer glazing edges. Only soften photographed bands inside the panes.\n        // Side-window pillars keep the atlas detail as well.\n        float glassSeams = max(1.0 - smoothstep(0.007, 0.019, abs(glassUv.x - 0.505)),\n          max(1.0 - smoothstep(0.002, 0.006, abs(glassUv.x - 0.635)),\n              1.0 - smoothstep(0.007, 0.020, abs(glassUv.x - 0.792))));\n        float paneInterior = smoothstep(0.704, 0.74, glassUv.y)\n          * (1.0 - smoothstep(0.907, 0.943, glassUv.y)) * (1.0 - glassSeams);\n        vec3 glassAtlas = sampledDiffuseColor.rgb * 0.7 + vec3(0.012, 0.014, 0.017);\n        vec3 paneColor = mix(vec3(0.026, 0.031, 0.038), sampledDiffuseColor.rgb, 0.15);\n        diffuseColor.rgb = mix(diffuseColor.rgb,\n          diffuse * mix(glassAtlas, paneColor, paneInterior), hbCarGlass);\n      #endif"
    );
    if (pearlWhite) {
      // 珠光白底漆：只在暖阳原木主题下注入。用贴图亮度挑出「车身漆面」（深色玻璃、胶条与包围件亮度
      // 均低于 0.20），再叠加 (1.0 - hbCarGlass) 排除玻璃，避免把车窗一起刷白；
      // 混入基色带暖调并随亮度微调明度，保留贴图接缝与阴影细节。
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        "\n      #ifdef USE_MAP\n        // Keep atlas seams and shadow detail; exclude dark glazing, rubber and trim.\n        float pearlLuma = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));\n        float pearlPaint = smoothstep(0.20, 0.48, pearlLuma) * (1.0 - hbCarGlass);\n        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.925, 0.89) * (0.68 + 0.32 * pearlLuma), pearlPaint);\n      #endif\n      #include <roughnessmap_fragment>"
      );
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      "\n      float carDark = 1.0 - smoothstep(0.035, 0.16, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));\n      float carUpper = smoothstep(0.68, 1.02, vHbCarHeight);\n      vec3 carView = normalize(vViewPosition);\n      vec3 carReflection = inverseTransformDirection(reflect(-carView, normal), viewMatrix);\n      float carSky = smoothstep(-0.15, 0.85, carReflection.y);\n      float carSoftbox = pow(max(dot(carReflection, normalize(vec3(-0.35, 0.8, 0.48))), 0.0), 12.0);\n      float carFresnel = pow(1.0 - max(dot(normal, carView), 0.0), 4.0);\n      " +
        (pearlWhite
          ? // 珠光漆的整体提亮：与暖阳原木主题里家具的提亮口径一致（顶部 + 侧上方补光），
            // 且不作用于玻璃，避免车窗一起发白。0.82 的混入系数给反射高光留了余量。
            "\n      #ifdef USE_MAP\n        // Match the bright furniture fill in this theme without bleaching glass.\n        vec3 pearlNormal = inverseTransformDirection(normal, viewMatrix);\n        float pearlFill = 0.64 + 0.20 * max(pearlNormal.y, 0.0)\n          + 0.12 * max(dot(pearlNormal, normalize(vec3(-0.4, 0.85, 0.32))), 0.0);\n        outgoingLight = mix(outgoingLight, diffuseColor.rgb * pearlFill, pearlPaint * 0.82);\n      #endif"
          : "") +
        "\n      outgoingLight += carDark * carUpper * vec3(0.68, 0.79, 0.94)\n        * (0.012 + 0.025 * carSky + 0.07 * carSoftbox + 0.035 * carFresnel);\n      // Keep the sheen restrained so it cannot wash out the glazing seams.\n      outgoingLight += hbCarGlass * vec3(0.76, 0.84, 0.94)\n        * (0.008 + 0.014 * carSky + 0.02 * carSoftbox);\n      #ifdef USE_MAP\n        vec2 carUv = fract(vMapUv);\n        float carFrontLamp = clamp(" +
        buildLampGlowExpression("front") +
        ", 0.0, 1.0)\n          * (1.0 - smoothstep(-1.95, -1.85, vHbCarLength));\n        float carRearLamp = clamp(" +
        buildLampGlowExpression("rear") +
        ", 0.0, 1.0)\n          * smoothstep(1.85, 1.95, vHbCarLength);\n        outgoingLight += carFrontLamp * vec3(2.0, 2.3, 2.6)\n          + carRearLamp * vec3(0.84, 0.036, 0.018);\n      #endif\n      #include <opaque_fragment>"
    );
  };
  // 缓存键后缀带上版本号与开关：着色器源码一变就必须让旧编译结果失效，
  // 否则升级后仍会命中旧程序，表现为新效果不生效。珠光白是两个不同的着色器
  // 变体，必须各自落到独立的缓存键上，否则两种风格会互相串味。
  material.customProgramCacheKey = () =>
    previousCacheKey + "|hb-car-finish-v7-glazing-detail|pearl-" + Number(pearlWhite);
  // 标记已注入，避免同一材质被重复包装导致着色器里出现重复定义；
  // 同时关掉平面二期的表面接触效果——车漆高光已由本模块的着色器接管，再叠加会发白。
  material.userData.hbCarFinish = true;
  material.userData.plan2SurfaceContact = false;
  return material;
}
