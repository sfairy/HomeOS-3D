/**
 * 小汽车（上游第三方车模 `models/vehicle/car.glb`）的整件车漆着色器与法线修订。
 *
 * 为什么是「整件一层着色器」而不是按角色取料：这台车是**贴图集**模型 —— 车漆、车窗、车灯、
 * 轮毂、格栅全部烘在一张 PNG 上，几何只有一块网格、一个材质（`car_tms`）。所以运行侧读不出
 * 「这一块是玻璃」这件事，只能按**贴图 UV 里的区域**认件：CAR_GLASS_ATLAS_REGIONS 是玻璃岛、
 * CAR_LAMP_LENSES 是六枚灯罩，坐标单位是 700×700 的图集像素。
 *
 * 坐标口径（改这里之前先看这一段）：着色器读的是**网格局部坐标**，而这台车的局部空间是
 * 「Y 是车长、Z 是车高」——文件里的节点层级带一次旋转把它摆成运行侧要的 Y 朝上，但顶点着色器
 * 里的 `position` 仍是旋转之前的局部值。于是：
 *   vHbCarHeight = position.z（车高）、vHbCarLength = position.y（车长，+y 是车头）。
 * 这不是笔误、也不是「旧资产 Z 朝上的后遗症」：换成流水线自建车（Y 朝上、按角色分件）之后
 * `position.z` 不再等于车高，整段判断就全部失效 —— 那正是它 2026-09 被删掉的原因。
 * 2026-09-26 换回上游车模后，它与资产一起回来（见 loaders/studio-external-models.js 的 smallcar 条目）。
 *
 * 四件事：
 *   1. 车窗：按图集里的玻璃岛压暗、加一层冷色反光，并保住风挡 / 天窗 / 后窗的密封条与侧窗柱
 *      （只柔化玻璃内部的照片纹理，不能把整块玻璃糊成一片）；
 *   2. 车身：按「上表面 + 深色区域」叠天光蓝反光 —— 无环境贴图的场景里，车漆的高光只能这么读出来；
 *   3. 车灯：前大灯暖白、尾灯红，按灯位多边形与车长位置点亮（车灯是光源，不是被照亮的塑料）；
 *   4. `pearlWhite` 档（暖阳原木）：把图集里的亮面刷成珍珠白，同时保住真实的明暗对比。
 *
 * 另一处补丁是 `smoothCarSurfaceNormals`：这台车的法线按**平面**烘焙，
 * 直接渲染会在车顶与翼子板上出现一圈圈硬棱线。按位置合并重合顶点后重算，只让曲面更顺，
 * 不改任何一处顶点位置（包围盒逐值不变）。
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
 *
 * 绕向必须先统一成有向面积为正 —— hbCarLensEdge 的符号就是内外之分，多边形反着写会让
 * 整枚灯罩的判据反过来（灯亮在车漆上、灯罩本身不亮）。图集坐标是人手标的，两种绕向都出现过，
 * 所以这里不假定顺序，一律按面积判一次。
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
 *
 * 这一段必须整块留在 `#ifdef USE_MAP` 里：判据全部来自贴图 UV，没有贴图时
 * `vMapUv` 根本不存在（着色器编译不过），而且没有贴图的模型也无从判断哪里是玻璃。
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
 *
 * 位置在 `roughnessmap_fragment` 之前是刻意的 —— 它要改的是**基色**，而粗糙度贴图那一步
 * 之后基色就已经进过光照计算了。`pearlPaint` 供后面的车漆反光一段复用，所以在这里落地。
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
 *
 * 三段各有各的判据，注意别互相串：
 *   - 天光蓝反光只给「上表面 + 深色区域」（carDark * carUpper），车漆的亮面本来就够亮；
 *   - 玻璃反光由 hbCarGlass 收口，强度刻意压低，否则会把玻璃的密封条洗掉；
 *   - 车灯按 `vHbCarLength` 分前后（±1.85 附近各一段过渡），再乘灯位多边形的判据。
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

/** 车漆着色器版本：它进 customProgramCacheKey，改了着色器必须动这个串，否则旧 program 会被复用。 */
const CAR_FINISH_CACHE_KEY = "hb-car-finish-v8-pearl-shadow";

/**
 * 按位置合并重合顶点后重算法线，修掉「按平面烘焙」带来的硬棱线。
 *
 * 做法是**面积加权**的邻域平滑：先按三角形面积累加到每个顶点，再把落在同一位置的顶点
 * （位置量化到 1e-4，即 0.1mm）归成一组，组内只吸收法线夹角 ≤ 50° 的邻居（cos 0.64）。
 * 夹角阈值是必需的：车身上相邻但朝向差得远的两个面（翼子板与车门）本来就该有一条硬边，
 * 无条件平均会把整台车揉成一个圆角面包。
 *
 * 不改任何一处顶点位置，因此包围盒与贴图 UV 逐值不变；返回的是**新的几何**（调用方负责
 * 替换与 dispose，见 smoothCarSceneSurface），没有位置或法线属性时原样返回。
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
 * 替换掉的原几何**必须显式 dispose** —— 实例之间共享几何，被替换下来的那份没有任何引用者再
 * 指向它，留着就是纯显存泄漏（一份 8 千顶点的车模 ×  每次进编辑器各来一次）。
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
 *
 * `pearlWhite` 是暖阳原木档的珍珠白漆面。两条硬约束：
 *   1. 幂等 —— 同一份材质可能被多个实例复用，重复套会把着色器注入两遍；
 *   2. 必须带上 customProgramCacheKey —— 材质缓存（buildMaterialCacheKey）按它判等价，
 *      不写的话珍珠白与默认档会被判成同一份材质，先来的那个档位赢，另一个档位静默不变色。
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
  // 而车身的明暗本来就由图集与上面的反光决定，叠上去只会把车读成一块灰饼。
  material.userData.plan2SurfaceContact = false;
  return material;
}
