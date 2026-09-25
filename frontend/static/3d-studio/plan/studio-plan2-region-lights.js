/**
 * 按房间区域（region）计算光照的「区域灯」模块，替代逐盏原生灯（PointLight / SpotLight）的实时光照。
 * 为什么：一层可能有几十盏灯，逐盏走 three.js 的光照循环会让每个材质的着色器迅速膨胀，且大量灯在视觉上互相重叠、性价比极低。
 * 做法：每盏灯按其类型 + 用户微调换算成一个「光照体积」（椭圆 / 条状 / 圆角矩形 / 方形），把一层楼所有灯的体积参数（中心、半尺寸、颜色、朝向）打进 uniform 数组或数据纹理；
 * 再给每个接收面材质克隆一份，用 onBeforeCompile 注入一段循环所有体积并做「有界并集」求和的着色器片段（buildShaderChunk），把结果加到 indirectDiffuse 上。
 * 对外：createRegionLightController（控制器工厂）；regionLightKey 与 sampleRegionVolumes 只在本模块内使用。
 * 全局约定：灯节点被强制放到 REGION_LIGHT_LAYER（30）层 —— 原生光照不再渲染它们，但体积仍参与着色，避免「灯本体不画、光也丢了」；
 * uniform 名统一带 plan2 前缀，并与接触阴影模块共享 plan2ViewToWorld / plan2MotionToLayout 的坐标系语义（世界坐标 → 布局坐标）；长度一律米、角度用度（rotation 是用户输入的角度制）；
 * 体积的 axis 分量是「编码位」而非几何方向：xy 存水平朝向单位向量，z 存形状码，w 存软边（softness），详见 buildShaderChunk 上方的说明。
 */

// 数值夹取与换算统一走 utils/numbers.js（唯一实现）。
import { clampNumber, coercedFiniteNumberOr } from "../../utils/numbers.js?v=2609252210";

// 本地沿用短名 clamp：它在本文件的 JS 代码里出现二十余处，而下方 GLSL 源码字符串里还有**同名的
// 着色器内建函数** clamp(...)（那些必须逐字保留）—— 把 JS 侧改名只会让 diff 变大、并让后来者
// 更容易误改着色器字符串。实现只有一份，名字不同而已。
const clamp = clampNumber;

// 区域灯所在的自定义层号：studio-app.js 的 region-light 分支与灯控制器都用它，
// 两边必须同一个值，否则灯会被原生光照重复计算或干脆不参与光照。
export const REGION_LIGHT_LAYER = 30;
// 接收面分类：floor / wall / furniture。同一盏灯对不同类别用不同的增益与体积高度，
// 让地面更亮、墙面稍暗、家具居中，避免整屋亮度一刀切。
const REGION_KINDS = ["floor", "wall", "furniture"];
// uniform 数组长度向上取到 16 的整数倍：GPU 对 uniform 数组的布局更友好，
// 且容量变化不会每加一盏灯就重新编译着色器。
const alignTo16 = sizeValue => Math.max(16, Math.ceil(sizeValue / 16) * 16);
/**
 * 区域灯的稳定键：把楼层 ID 与灯 ID 编码成一个字符串，形如 `["3F","abc-uuid"]`。
 * 选 JSON 而不是 `a:b` 拼接，是因为楼层名与灯 ID 都可能含冒号之类的分隔符，JSON 转义能保证可逆；isRegionLightKey 会用同一函数回写一遍做「往返校验」，确保外部的键一定能解回原值。
 */
const regionLightKey = (floorKeyId, lightKeyId) =>
  JSON.stringify([String(floorKeyId), String(lightKeyId)]);
/**
 * 校验一个字符串是不是本模块生成的合法区域灯键。
 * 除结构检查外还要求「重新编码后与原串完全一致」：这样 `["3F","abc","extra"]` 之类的畸形输入、以及带多余空格的 JSON 都会被拒掉，保证键可作为 Map 的稳定身份。
 */
function isRegionLightKey(keyString) {
  try {
    const parsedKey = JSON.parse(keyString);
    return (
      Array.isArray(parsedKey) &&
      parsedKey.length === 2 &&
      parsedKey.every(keyPart => typeof keyPart == "string") &&
      regionLightKey(...parsedKey) === keyString
    );
  } catch {
    return false;
  }
}
/**
 * 清洗外部传入的区域覆盖配置（用户在编辑器里对某盏灯画的「光斑形状」）。输入是不可信数据（来自持久化文档 / 前端表单），所以逐字段校验 + 夹取：
 * 键必须能通过 isRegionLightKey（否则整条丢弃）；shape 只允许 circle / square / ellipse / strip；width / depth 必须是有限数且夹到 [0.5, 20] 米； 可选字段若给了就必须是有限数，否则整条丢弃（宁可退回默认形状，也不要用 NaN 去算几何）；heightMin > heightMax 这类自相矛盾的区间直接判非法。
 * 通过的条目会被归一成一份新对象（Object.create(null)，不带原型，避免原型污染），数值全部夹到与着色器编码相容的范围里。
 */
function sanitizeRegionOverrides(rawOverrides) {
  const normalizedOverrides = Object.create(null);
  if (!rawOverrides || typeof rawOverrides != "object" || Array.isArray(rawOverrides)) {
    return normalizedOverrides;
  }
  for (const [regionKey, override] of Object.entries(rawOverrides)) {
    if (
      !isRegionLightKey(regionKey) ||
      !override ||
      typeof override != "object" ||
      Array.isArray(override) ||
      !["circle", "square", "ellipse", "strip"].includes(override.shape) ||
      !["width", "depth"].every(
        dimensionField =>
          typeof override[dimensionField] == "number" && Number.isFinite(override[dimensionField])
      ) ||
      ["rotation", "softness"].some(
        numericField =>
          override[numericField] !== undefined &&
          (typeof override[numericField] != "number" || !Number.isFinite(override[numericField]))
      ) ||
      ["offsetX", "offsetZ"].some(
        offsetField =>
          override[offsetField] !== undefined &&
          (typeof override[offsetField] != "number" || !Number.isFinite(override[offsetField]))
      ) ||
      ["heightAbove", "heightBelow", "heightMin", "heightMax"].some(
        heightField =>
          override[heightField] !== undefined &&
          (typeof override[heightField] != "number" || !Number.isFinite(override[heightField]))
      ) ||
      (override.heightMin !== undefined &&
        override.heightMax !== undefined &&
        override.heightMin > override.heightMax) ||
      (override.moveCenterEnabled !== undefined && typeof override.moveCenterEnabled != "boolean")
    ) {
      continue;
    }
    const rotationDeg = override.rotation ?? 0;
    // 夹到 [0.5, 20] 米：光斑小于 0.5m 看不出来（且会退化成噪点），
    // 大于 20m 已超过单个房间尺度，必然是脏数据。
    const clampedWidth = clamp(override.width, 0.5, 20);
    normalizedOverrides[regionKey] = {
      width: clampedWidth,
      depth: clamp(override.depth, 0.5, 20),
      // 角度归一化到 [-180, 180)：先取模到 [0,360)，再偏移 540 后取模保证
      // 负数也能落到正向区间，最后减 180 —— 这样 -370° 会变成 -10°，而不是 350°。
      rotation: (((rotationDeg % 360) + 540) % 360) - 180,
      // softness 下限 0.05：等于 0 会让柔化起点与终点重合，产生除零与硬边。
      softness: clamp(override.softness ?? 1, 0.05, 1),
      shape: override.shape,
      ...(override.heightMin !== undefined
        ? {
            heightMin: clamp(override.heightMin, 0, 20)
          }
        : {}),
      ...(override.heightMax !== undefined
        ? {
            heightMax: clamp(override.heightMax, 0, 20)
          }
        : {}),
      ...(override.heightAbove !== undefined
        ? {
            heightAbove: clamp(override.heightAbove, 0, 20)
          }
        : {}),
      ...(override.heightBelow !== undefined
        ? {
            heightBelow: clamp(override.heightBelow, 0, 20)
          }
        : {}),
      ...(override.offsetX !== undefined
        ? {
            offsetX: clamp(override.offsetX, -100, 100)
          }
        : {}),
      ...(override.offsetZ !== undefined
        ? {
            offsetZ: clamp(override.offsetZ, -100, 100)
          }
        : {}),
      ...(override.moveCenterEnabled !== undefined
        ? {
            moveCenterEnabled: override.moveCenterEnabled
          }
        : {})
    };
  }
  return normalizedOverrides;
}
/**
 * 沿父链向上查找某个 userData 字段。
 */
function findAncestorUserData(startObject, userDataKey) {
  for (let ancestorObject = startObject; ancestorObject; ancestorObject = ancestorObject.parent) {
    if (ancestorObject.userData?.[userDataKey] !== undefined) {
      return ancestorObject.userData[userDataKey];
    }
  }
}
/**
 * 判断材质能否作为区域灯的接收面：只有内置的标准 / 物理 / Phong / Lambert 材质才注入区域灯代码，因为它们都实现了 three.js 的灯光 chunk 结构（lights_fragment_begin 等），注入点一定存在。
 * 自定义 ShaderMaterial 没有这些 chunk，强行注入会在 replace 处静默失效或报错；hbDedicatedWall 是墙壁专用的自定义材质，走另一套注入分支，因此单独放行。
 */
function isRegionReceiverMaterial(materialCandidate) {
  return (
    materialCandidate &&
    (materialCandidate.userData?.hbDedicatedWall ||
      materialCandidate.isMeshStandardMaterial ||
      materialCandidate.isMeshPhysicalMaterial ||
      materialCandidate.isMeshPhongMaterial ||
      materialCandidate.isMeshLambertMaterial)
  );
}
/**
 * 判断 startNode 在 rootNode 子树内且沿途都可见。
 * 与「只看 visible」的区别：向上走到 rootNode 之外还没遇到根，说明节点已被移出场景、它的 matrixWorld 也不可信，返回 false；遍历到 rootNode 即停，避免无谓地爬满父链。
 */
function isVisibleWithin(startNode, rootNode) {
  for (let currentNode = startNode; currentNode; currentNode = currentNode.parent) {
    if (currentNode.visible === false) {
      return false;
    }
    if (currentNode === rootNode) {
      return true;
    }
  }
  return false;
}
/**
 * 判定一个网格属于哪一类接收面（floor / wall / furniture），判定优先级（越靠前越可信）：1. 祖先上的 regionReceiverKind 显式声明 —— 建模 / 导出的规范字段，直接采信；
 * 2. modelLayer：items / lights 归家具、walls 归墙面；3. 网格名里的 wall / floor 关键字（外部模型常见命名约定）。 4. 几何启发式：若没有 modelLayer 且最长轴 > 1.5m、最短轴 < 0.18m，说明是一块又大又薄的面板 —— 判为地板；5. 兜底：有 modelLayer 归家具，否则归墙面。
 * 之所以层层兜底：外部导入的模型不带我们的 userData，只能靠命名与形状猜；猜错的代价只是增益曲线略有差异，不会导致漏光。
 */
function classifyReceiverKind(candidateMesh) {
  const declaredKind = findAncestorUserData(candidateMesh, "regionReceiverKind");
  if (REGION_KINDS.includes(declaredKind)) {
    return declaredKind;
  }
  const modelLayer = findAncestorUserData(candidateMesh, "modelLayer");
  if (modelLayer === "items" || modelLayer === "lights") {
    return "furniture";
  }
  if (modelLayer === "walls" || /wall/i.test(candidateMesh.name || "")) {
    return "wall";
  }
  if (/floor/i.test(candidateMesh.name || "")) {
    return "floor";
  }
  const geometry = candidateMesh.geometry;
  if (geometry) {
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox?.();
    }
    const boundingBox = geometry.boundingBox;
    if (boundingBox) {
      const sortedExtent = [
        boundingBox.max.x - boundingBox.min.x,
        boundingBox.max.y - boundingBox.min.y,
        boundingBox.max.z - boundingBox.min.z
      ].sort((sizeA, sizeB) => sizeA - sizeB);
      if (!modelLayer && sortedExtent[0] < 0.18 && sortedExtent[1] > 1.5) {
        return "floor";
      }
    }
  }
  if (modelLayer) {
    return "furniture";
  } else {
    return "wall";
  }
}
/**
 * 比较并按需写入 Vector4，返回是否发生变化。
 * 存在意义：uniform 上传有成本，且 three.js 只有在值真的变了时才好判断「这一组材质要不要重新上传 uniform」。
 * 逐分量比较可以避免每帧无条件写 uniform 带来的额外开销，也让上层能用一个 changed 标志汇总。
 */
function setVector4IfChanged(targetVector, xComponent, yComponent, zComponent, wComponent) {
  const didChange =
    targetVector.x !== xComponent ||
    targetVector.y !== yComponent ||
    targetVector.z !== zComponent ||
    targetVector.w !== wComponent;
  targetVector.set(xComponent, yComponent, zComponent, wComponent);
  return didChange;
}
/**
 * 生成注入到接收面材质里的区域灯着色器片段：片段以 buildShaderChunk(group) + 原 fragmentShader 的形式「前置」，其中定义的 uniform / varyings / plan2SurfaceLight 对整个片元着色器可见；调用方随后把 `reflectedLight.indirectDiffuse += ... * plan2SurfaceLight(...)` 插到 `#include <lights_fragment_end>` 之后 —— 那时 three.js 已算完所有原生光照，我们的结果只是叠加，不影响原有管线。
 * uniform 布局两种模式二选一（由容量决定）：纹理模式（PLAN2_TEXTURE_DATA = 1）把数据放在 4 列 × capacity 行的 RGBA32F DataTexture 里，每盏灯占 4 个 texel（0 = center、1 = extent、2 = color、3 = axis），当 `capacity * 4 + 128 > maxFragmentUniforms` 时自动切到这一模式，避开桌面 GL 的 fragment uniform 数量上限；数组模式则是 plan2Centers / plan2Extents / plan2Colors / plan2Axes 四个 vec4 数组，长度即 capacity。 axis 分量编码（着色器据 axis.z 分支选几何）：axis.xy = 体积在水平面的朝向单位向量（rotation 旋转后的结果），axis.z = 0 自动椭圆、1 自动条灯、2 覆盖椭圆、3 覆盖条灯（圆角矩形）、4 覆盖方形，axis.w = softness（仅覆盖模式即 axis.z > 1.5 用作软边起点）；extent 的 x / z 为水平半尺寸、y 为垂直半高、w 为垂直方向软边厚度；center.w 是「点亮强度」（0 表示这盏灯没开，着色器开头就 continue 掉）。
 * 形态差异都在分支里处理，而不是拆成多份着色器：分开编译会让每个房间都产生独立程序、程序数量爆炸；用 uniform 分支只多几次比较。
 */
function buildShaderChunk(volumeGroup) {
  return (
    "\n#define PLAN2_LIGHT_CAPACITY " +
    volumeGroup.capacity +
    "\n#define PLAN2_TEXTURE_DATA " +
    (volumeGroup.textureMode ? 1 : 0) +
    "\nuniform int plan2LightCount;\nuniform float plan2Gain;\nuniform float plan2SunShadowStrength;\nuniform mat4 plan2MotionToLayout;\nvarying vec3 vPlan2WorldPosition;\n#if PLAN2_TEXTURE_DATA\nuniform sampler2D plan2LightData;\nvec4 plan2ReadData(int slot, float column) {\n  return texture2D(plan2LightData, vec2((column + 0.5) / 4.0, (float(slot) + 0.5) / float(PLAN2_LIGHT_CAPACITY)));\n}\n#else\nuniform vec4 plan2Centers[PLAN2_LIGHT_CAPACITY];\nuniform vec4 plan2Extents[PLAN2_LIGHT_CAPACITY];\nuniform vec4 plan2Colors[PLAN2_LIGHT_CAPACITY];\nuniform vec4 plan2Axes[PLAN2_LIGHT_CAPACITY];\n#endif\nvec3 plan2SurfaceLight(vec3 worldPoint) {\n  worldPoint = (plan2MotionToLayout * vec4(worldPoint, 1.0)).xyz;\n  vec3 weightedColor = vec3(0.0);\n  float totalWeight = 0.0;\n  float coverage = 0.0;\n  for (int slot = 0; slot < PLAN2_LIGHT_CAPACITY; slot++) {\n    if (slot >= plan2LightCount) break;\n    #if PLAN2_TEXTURE_DATA\n      vec4 center = plan2ReadData(slot, 0.0);\n    #else\n      vec4 center = plan2Centers[slot];\n    #endif\n    if (center.w < 0.00001) continue;\n    #if PLAN2_TEXTURE_DATA\n      vec4 extent = plan2ReadData(slot, 1.0);\n      vec4 axis = plan2ReadData(slot, 3.0);\n    #else\n      vec4 extent = plan2Extents[slot];\n      vec4 axis = plan2Axes[slot];\n    #endif\n    vec3 offset = worldPoint - center.xyz;\n    vec3 localPoint = vec3(dot(offset.xz, axis.xy), offset.y, dot(offset.xz, vec2(-axis.y, axis.x)));\n    float verticalDistance = max(abs(localPoint.y) - extent.y, 0.0);\n    if (verticalDistance >= extent.w) continue;\n    float fadeStart = axis.z > 1.5 ? 1.0 - clamp(axis.w, 0.05, 1.0) : 0.0;\n    float squareFalloff = 1.0;\n    float radialDistance;\n    if (axis.z > 3.5) {\n      // Retain straight zero-light edges, but fade each axis independently.\n      // Using max(x,z) for brightness changes derivatives on the diagonals,\n      // making four visible triangular wedges. max is only a bounds check.\n      vec2 fromCenter = abs(localPoint.xz) / max(extent.xz, vec2(0.001));\n      radialDistance = max(fromCenter.x, fromCenter.y);\n      vec2 edgeFade = vec2(1.0) - smoothstep(vec2(fadeStart), vec2(1.0), fromCenter);\n      squareFalloff = edgeFade.x * edgeFade.y;\n    } else if (axis.z > 2.5) {\n      // Edited strips are rounded rectangles with their zero-light boundary\n      // exactly at the requested width/depth, including both rounded ends.\n      float radius = max(min(extent.x, extent.z), 0.001);\n      vec2 fromCore = max(abs(localPoint.xz) - (extent.xz - vec2(radius)), vec2(0.0));\n      radialDistance = length(fromCore) / radius;\n    } else if (axis.z > 0.5 && axis.z < 1.5) {\n      // A strip is a line source. Brightness falls away from the line, rather\n      // than remaining constant throughout a wide rectangular room volume.\n      vec2 fromSegment = vec2(max(abs(localPoint.x) - extent.x, 0.0), localPoint.z);\n      radialDistance = length(fromSegment) / max(extent.z, 0.001);\n    } else {\n      radialDistance = length(localPoint.xz / max(extent.xz, vec2(0.001)));\n    }\n    if (radialDistance >= 1.0) continue;\n    float horizontalFalloff = axis.z > 3.5 ? squareFalloff : 1.0 - smoothstep(fadeStart, 1.0, radialDistance);\n    float influence = horizontalFalloff\n      * (1.0 - smoothstep(0.0, extent.w, verticalDistance)) * clamp(center.w, 0.0, 1.5);\n    #if PLAN2_TEXTURE_DATA\n      vec3 lightColor = plan2ReadData(slot, 2.0).rgb;\n    #else\n      vec3 lightColor = plan2Colors[slot].rgb;\n    #endif\n    weightedColor += lightColor * influence;\n    totalWeight += influence;\n    coverage += (1.0 - coverage) * influence;\n  }\n  // Smooth bounded union: max() produced a derivative crease wherever two\n  // lamps exchanged dominance. This preserves single-lamp falloff and blends\n  // overlaps continuously, with coverage capped at one rather than added HDR.\n  return weightedColor / max(totalWeight, 0.00001) * coverage;\n}\n"
  );
}
/**
 * 在 CPU 侧求某点被一组光照体积照亮的颜色（着色器 plan2SurfaceLight 的等价实现）。
 * 为什么要有 CPU 版本：反射、悬浮预览、导出等场景拿不到正在编译的着色器，只能在 JS 里对同一套体积参数求值；两边必须保持一致的公式与分支条件（尤其是 axis.z 的形状码判定阈值 0.5 / 1.5 / 2.5 / 3.5），改一边就要改另一边。
 * 求值方式：逐体积算影响权重 influence（水平衰减 × 垂直衰减 × 强度），颜色按权重加权平均，总覆盖度用「有界并集」公式 1 - Π(1 - influence) 累积 —— 多盏灯重叠时不会像直接相加那样过曝，也不会像取 max 那样产生导数折痕。
 */
function sampleRegionVolumes(volumes, worldPoint, gain = 1) {
  let coverage = 0;
  let totalWeight = 0;
  const accumulatedColor = [0, 0, 0];
  for (const volume of volumes) {
    const { center: center, extent: extent, color: color, axis: axis } = volume;
    if (center.w <= 0) {
      continue;
    }
    const offsetX = worldPoint.x - center.x;
    const offsetY = worldPoint.y - center.y;
    const offsetZ = worldPoint.z - center.z;
    // 把偏移投到体积的局部水平轴上：localX 沿轴线（条灯的长边方向），localZ 垂直轴线。
    const localX = offsetX * axis.x + offsetZ * axis.y;
    const localZ = -offsetX * axis.y + offsetZ * axis.x;
    // 圆角半径取短边，用于 axis.z > 2.5 的圆角矩形（条灯）分支。
    const cornerRadius = Math.max(Math.min(extent.x, extent.z), 0.001);
    const radialDistance =
      axis.z > 3.5
        ? Math.max(
            Math.abs(localX) / Math.max(extent.x, 0.001),
            Math.abs(localZ) / Math.max(extent.z, 0.001)
          )
        : axis.z > 2.5
          ? Math.hypot(
              Math.max(Math.abs(localX) - (extent.x - cornerRadius), 0),
              Math.max(Math.abs(localZ) - (extent.z - cornerRadius), 0)
            ) / cornerRadius
          : axis.z > 0.5 && axis.z < 1.5
            ? Math.hypot(Math.max(Math.abs(localX) - extent.x, 0), localZ) /
              Math.max(extent.z, 0.001)
            : Math.hypot(localX / Math.max(extent.x, 0.001), localZ / Math.max(extent.z, 0.001));
    const fadeStart = axis.z > 1.5 ? 1 - clamp(axis.w, 0.05, 1) : 0;
    const normalizedDistance = clamp((radialDistance - fadeStart) / (1 - fadeStart), 0, 1);
    // 垂直衰减：超出半高 extent.y 的部分按 extent.w 的厚度过渡，归一化到 [0,1]。
    const verticalRatio = clamp(Math.max(Math.abs(offsetY) - extent.y, 0) / extent.w, 0, 1);
    // smoothstep 的多项式展开：1 - t²(3 - 2t)，与着色器里的 smoothstep 完全一致。
    let horizontalFalloff =
      1 - normalizedDistance * normalizedDistance * (3 - normalizedDistance * 2);
    // axis.z > 3.5（方形）：两个轴独立柔化。用「各轴独立」而不是 max(x,z)，
    // 是因为 max 在对角线上会产生导数不连续，视觉上出现四块三角楔形亮斑。
    if (axis.z > 3.5) {
      const xEdgeRatio = clamp(
        (Math.abs(localX) / Math.max(extent.x, 0.001) - fadeStart) / (1 - fadeStart),
        0,
        1
      );
      const zEdgeRatio = clamp(
        (Math.abs(localZ) / Math.max(extent.z, 0.001) - fadeStart) / (1 - fadeStart),
        0,
        1
      );
      horizontalFalloff =
        (1 - xEdgeRatio * xEdgeRatio * (3 - xEdgeRatio * 2)) *
        (1 - zEdgeRatio * zEdgeRatio * (3 - zEdgeRatio * 2));
    }
    const influence =
      horizontalFalloff *
      (1 - verticalRatio * verticalRatio * (3 - verticalRatio * 2)) *
      clamp(center.w, 0, 1.5);
    totalWeight += influence;
    // 有界并集：新体积只在「尚未被覆盖」的部分叠加，覆盖度天然封顶在 1，
    // 不会像累加那样在灯重叠处暴亮。
    coverage += (1 - coverage) * influence;
    accumulatedColor[0] += color.x * influence;
    accumulatedColor[1] += color.y * influence;
    accumulatedColor[2] += color.z * influence;
  }
  return accumulatedColor.map(channelValue =>
    totalWeight > 0 ? (channelValue / totalWeight) * coverage * gain : 0
  );
}
/**
 * 创建区域灯控制器（一个场景一份；内部的状态与材质克隆缓存跨帧复用）。
 * 主要职责：register 登记一盏灯、把它移到 REGION_LIGHT_LAYER 并停用实时阴影；sync 每帧推进 —— 必要时重建结构（重新扫描场景、换材质、算体积），再把每盏灯的体积参数写进所属楼层 / 分类的 uniform 或数据纹理； 材质侧：所有接收面材质会被克隆并注入区域灯着色器（见 getRegionMaterial）。
 * 与接触阴影的配合：非墙面灯组会顺带把接触阴影的 uniform 一起挂到同一材质上，这样一次注入同时解决「区域光照 + 接触阴影」，不必叠加两层 onBeforeCompile。
 */
export function createRegionLightController({
  THREE: THREE,
  renderer: renderer,
  scene: scene,
  getRoot: getRoot,
  contactShadows: contactShadows = null,
  requestFrame: requestFrame = () => {}
}) {
  const registrationsByLight = new Map();
  // listenedNodes：给每个节点挂 childadded / childremoved 监听，用于自动发现结构变化。
  // 用 Set 记录已挂载的节点，避免重复 addEventListener（重复挂会累积调用）。
  const listenedNodes = new Set();
  const assignmentsByMesh = new Map();
  // 克隆材质 → 原始材质：用于还原（导出 / 释放时把场景恢复成原样）。
  const sourceMaterialByClone = new WeakMap();
  // 原始材质 → (变体键 → 克隆材质)：同一份材质在不同楼层 / 分类 / 变体下各有一份克隆，
  // 因为 uniform 必须按「楼层 + 分类」分组，材质也就必须分组。
  const clonesByMaterial = new Map();
  const groupsByKey = new Map();
  // retainedRoots：外部（楼层缓存）声明「这些子树还在用」，避免被当作陈旧节点回收。
  const retainedRoots = new Set();
  // 这些临时向量 / 矩阵在闭包里建一次，避免在每帧对每盏灯的热路径上反复 new。
  const lightWorldPosition = new THREE.Vector3();
  const floorRootPosition = new THREE.Vector3();
  const sampleWorldPoint = new THREE.Vector3();
  const lightWorldMatrix = new THREE.Matrix4();
  let motionTransformProvider = null;
  const viewToWorldUniform = {
    value: new THREE.Matrix4()
  };
  const floorBrightnessUniform = {
    value: 1
  };
  const volumeInputsScratch = [];
  const settings = {
    // 全局总增益。3 是让区域灯的推导亮度与旧版逐盏实时光照对齐的标定值，
    // 改它相当于整体调亮 / 调暗，各分类的相对关系由下面的 xxxGain 控制。
    gain: 3,
    floorGain: 1,
    // 墙面略暗（0.9）：墙是大面积浅色，按地面同等增益会显得发灰、失去层次。
    wallGain: 0.9,
    furnitureGain: 1,
    // 体积范围相对灯本身标称 range 的缩放；0.8 收紧一点，避免相邻房间互相串光。
    rangeScale: 0.8,
    // 区域灯仍复用场景里唯一投射阴影的平行光（太阳）的阴影图，
    // 0.6 是把它压到不喧宾夺主的程度 —— 区域灯负责亮度，阴影只负责轮廓。
    sunShadowStrength: 0.6
  };
  const stats = {
    mode: "region",
    registered: 0,
    slotCount: 0,
    active: 0,
    capacity: 0,
    floorCount: 0,
    materials: 0,
    detailedMaterials: 0,
    meshCount: 0,
    nativeLights: 0,
    structureScans: 0,
    uniformUpdates: 0,
    volumeCacheHits: 0,
    shaderCompiles: 0,
    textureFloors: 0,
    disposed: false
  };
  let rootObject = null;
  let shouldRescanStructure = true;
  let isDisposed = false;
  let nativeLights = [];
  let registrationsByFloorId = new Map();
  let overrides = Object.create(null);
  let previewKeys = null;
  let isMotionEnabled = false;
  let isMotionInstant = false;
  // 退出运动模式后的「亮度淡回」起点时间戳（280ms）；null 表示当前不需要淡回。
  let motionFadeStartMs = null;
  // 结构脏标记：任何「场景里多/少了一个节点」的事件都会把它置位，
  // 下一次 sync 才真正重扫，避免在遍历过程中修改场景引发重入。
  const markStructureDirty = () => {
    shouldRescanStructure = true;
  };
  const originalOnBeforeRender = scene.onBeforeRender;
  /**
   * 取（必要时创建）某个「楼层 + 接收面分类」的灯组，并把容量对齐到 16 的倍数。
   * 灯组是 uniform 的载体：同一楼层的同一分类共用一组 uniform，于是同一份克隆材质可以覆盖该分类的所有网格，材质数量被压到很低。
   * 容量变化时要做三件事：重建 slot 数组、按需重建数据纹理、让已缓存的材质 needsUpdate = true —— 因为着色器里的 PLAN2_LIGHT_CAPACITY 变了，必须重新编译才能拿到新的数组长度（three.js 不会自动感知宏变化）。
   */
  function ensureLightGroup(groupFloorId, requestedKind, lightCount) {
    const groupKey = groupFloorId + "\0" + requestedKind;
    let lightGroup = groupsByKey.get(groupKey);
    if (!lightGroup) {
      lightGroup = {
        key: groupKey,
        floorId: groupFloorId,
        kind: requestedKind,
        // capacity：uniform 数组的实际长度（16 的倍数），>= 实际灯数。
        capacity: 0,
        // textureMode：超过 fragment uniform 上限时改走数据纹理（见 buildShaderChunk）。
        textureMode: false,
        // slots：每盏灯一个 vec4 组（center / extent / color / axis），是 uniform 的底层存储。
        slots: [],
        materials: new Set(),
        uniforms: {
          plan2LightCount: {
            value: lightCount
          },
          plan2Gain: {
            value: 1
          },
          plan2SunShadowStrength: {
            value: 0
          },
          plan2Centers: {
            value: []
          },
          plan2Extents: {
            value: []
          },
          plan2Colors: {
            value: []
          },
          plan2Axes: {
            value: []
          },
          plan2ViewToWorld: viewToWorldUniform,
          plan2MotionToLayout: {
            value: new THREE.Matrix4()
          },
          plan2LightData: {
            value: null
          }
        }
      };
      if (requestedKind !== "wall" && contactShadows) {
        // 墙面不接收接触阴影（墙脚本来就不会有贴地阴影），因此不挂它的 uniform。
        // Object.assign 让两组 uniform 共享同一对象引用：材质注入时一次拿齐。
        Object.assign(lightGroup.uniforms, contactShadows.getUniforms(groupFloorId));
      }
      groupsByKey.set(groupKey, lightGroup);
    }
    const capacity = alignTo16(lightCount);
    if (lightGroup.capacity !== capacity) {
      lightGroup.capacity = capacity;
      const maxFragmentUniforms = coercedFiniteNumberOr(renderer?.capabilities?.maxFragmentUniforms, 1024);
      // 每盏灯 4 个 vec4（占 4 个 uniform 槽），另留 128 给 three.js 自身的 uniform。
      // 超出上限就只能改用数据纹理 —— 这是低端 / 移动 GPU 上常见的兼容分支。
      lightGroup.textureMode = capacity * 4 + 128 > maxFragmentUniforms;
      lightGroup.texture?.dispose();
      lightGroup.texture = null;
      lightGroup.slots = Array.from(
        {
          length: capacity
        },
        () => ({
          center: new THREE.Vector4(),
          extent: new THREE.Vector4(),
          color: new THREE.Vector4(),
          axis: new THREE.Vector4()
        })
      );
      for (const [uniformName, slotProperty] of [
        ["plan2Centers", "center"],
        ["plan2Extents", "extent"],
        ["plan2Colors", "color"],
        ["plan2Axes", "axis"]
      ]) {
        lightGroup.uniforms[uniformName].value = lightGroup.slots.map(slot => slot[slotProperty]);
      }
      if (lightGroup.textureMode) {
        const maxTextureSize = coercedFiniteNumberOr(renderer?.capabilities?.maxTextureSize, 4096);
        if (capacity > maxTextureSize) {
          throw new RangeError(
            "区域灯数量 " + lightCount + " 超出本机数据纹理容量 " + maxTextureSize
          );
        }
        lightGroup.texture = new THREE.DataTexture(
          new Float32Array(capacity * 16),
          4,
          capacity,
          THREE.RGBAFormat,
          THREE.FloatType
        );
        // 数据纹理必须用 Nearest 过滤、关掉 mipmap：这是「按 texel 精确取数」的查表，
        // 任何插值都会把相邻灯的参数混在一起，产生完全不合理的体积。
        lightGroup.texture.minFilter = lightGroup.texture.magFilter = THREE.NearestFilter;
        lightGroup.texture.generateMipmaps = false;
        lightGroup.texture.needsUpdate = true;
      }
      lightGroup.uniforms.plan2LightData.value = lightGroup.texture;
      for (const cachedMaterial of lightGroup.materials) {
        cachedMaterial.needsUpdate = true;
      }
    }
    lightGroup.uniforms.plan2LightCount.value = lightCount;
    return lightGroup;
  }
  /**
   * 取（必要时克隆并注入）区域灯材质。
   * 为什么必须克隆：区域灯是「按楼层 + 分类分组」的，同一份原始材质在不同分组下要绑定不同的 uniform 对象，而 uniform 是挂在材质上的，所以只能一份分组一份克隆；变体键由「楼层 + 分类 + 是否保留细节面 + 是否地面调色」组成，同键复用。 注入内容（onBeforeCompile 里按顺序）：1. 先调用原始材质的 onBeforeCompile，保证不破坏它自己的注入；2. 把灯组 uniform 合并进 shader.uniforms；3. 地面调色额外乘 plan2FloorBrightness（用户在编辑器里调的地面亮度）；
   * 4. 顶点把世界坐标写到 vPlan2WorldPosition（用 viewToWorld 矩阵从 mvPosition 还原）；5. 片元前置 buildShaderChunk，再把区域的贡献加到 indirectDiffuse，墙面走专用分支（只补 diffuse / opacity，不叠间接光）；6. 非墙面灯组还会注入接触阴影采样（opaque_fragment 处乘上遮蔽）；7. 对「不需要细节、非 alpha 墙、非透明」的材质，改用一套廉价的简单光照，把 three.js 的原生光照 chunk 整段删掉，只留我们注入的计算。
   */
  function getRegionMaterial(
    sourceMaterial,
    materialFloorId,
    materialKind,
    resultMaterials,
    isDetailedSurface = false,
    isFloorTone = false
  ) {
    const environmentSourceMaterial = sourceMaterial?.environmentSourceMaterial;
    // 环境层（天空盒 / 环境贴图代理）用自己的材质参与渲染，不能换成区域灯克隆，
    // 否则环境会跟着房间亮度一起被压暗。这里只登记、直接返回。
    if (environmentSourceMaterial && sourceMaterialByClone.has(environmentSourceMaterial)) {
      resultMaterials.add(environmentSourceMaterial);
      return sourceMaterial;
    }
    sourceMaterial = sourceMaterialByClone.get(sourceMaterial) || sourceMaterial;
    if (!isRegionReceiverMaterial(sourceMaterial)) {
      return sourceMaterial;
    }
    let materialClones = clonesByMaterial.get(sourceMaterial);
    if (!materialClones) {
      materialClones = new Map();
      clonesByMaterial.set(sourceMaterial, materialClones);
    }
    const materialGroupKey = materialFloorId + "\0" + materialKind;
    // 变体键用 \0 做分隔（与 materialGroupKey 里的一致）：它不可能出现在楼层 ID 或
    // 材质名里，因此不会出现「A+B|C」和「A|B+C」撞键的情况。
    const variantKey =
      materialGroupKey +
      "\0" +
      (isDetailedSurface ? "detailed" : "simple") +
      (isFloorTone ? "-floor-tone" : "");
    let cloneMaterial = materialClones.get(variantKey);
    const materialGroup = groupsByKey.get(materialGroupKey);
    if (!cloneMaterial) {
      cloneMaterial = sourceMaterial.clone();
      if (sourceMaterial.userData.hbDedicatedWall) {
        // 专用墙材质被 clone 后颜色是共享引用，必须再 clone 一次，
        // 否则调一面墙的颜色会影响所有墙。
        cloneMaterial.color = sourceMaterial.color.clone();
      }
      cloneMaterial.name =
        (sourceMaterial.name || sourceMaterial.type || "material") + " / region " + materialKind;
      const originalOnBeforeCompile = sourceMaterial.onBeforeCompile;
      // 注意用 function 而非箭头函数：three.js 会用 this 指向材质调用它，
      // 原材质若依赖 this 就会被破坏，因此必须透传。
      cloneMaterial.onBeforeCompile = function (shader, webglRenderer) {
        originalOnBeforeCompile?.call(this, shader, webglRenderer);
        // 关键一步：把灯组的 uniform 对象合并进着色器。因为合并的是「同一批对象引用」，
        // sync 里改 uniform.value 就等价于改所有共用该灯组的材质。
        Object.assign(shader.uniforms, materialGroup.uniforms);
        if (isFloorTone) {
          // 地面亮度调色：挂在共享的 floorBrightnessUniform 上，
          // 改一次数值即可让所有楼层的地面同时响应，无需重编译。
          shader.uniforms.plan2FloorBrightness = floorBrightnessUniform;
          shader.fragmentShader = "uniform float plan2FloorBrightness;\n" + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <color_fragment>",
            "#include <color_fragment>\ndiffuseColor.rgb *= plan2FloorBrightness;"
          );
        }
        shader.uniforms.plan2ContactViewToWorld = materialGroup.uniforms.plan2ViewToWorld;
        // 顶点阶段只做一件事：把 mvPosition（已包含实例化 / 骨骼 / 世界变换）乘回 world 矩阵，得到世界坐标交给片元。
        // 之所以从 mvPosition 反推而不是直接用 position：这样能自然继承 three.js 的全部顶点变换链，不需要自己重算矩阵。
        shader.vertexShader =
          "uniform mat4 plan2ViewToWorld;\nvarying vec3 vPlan2WorldPosition;\n" +
          shader.vertexShader;
        const PROJECT_VERTEX_INCLUDE = "#include <project_vertex>";
        if (!shader.vertexShader.includes(PROJECT_VERTEX_INCLUDE)) {
          // 注入点缺失时立刻报错：静默跳过会导致「区域灯完全不亮」且很难排查，
          // 多半是 three.js 升级后 chunk 被改名。
          throw new Error("区域灯材质缺少 project_vertex");
        }
        shader.vertexShader = shader.vertexShader.replace(
          PROJECT_VERTEX_INCLUDE,
          PROJECT_VERTEX_INCLUDE + "\nvPlan2WorldPosition = (plan2ViewToWorld * mvPosition).xyz;"
        );
        shader.fragmentShader = buildShaderChunk(materialGroup) + shader.fragmentShader;
        if (sourceMaterial.userData.hbDedicatedWall) {
          // 专用墙材质是自绘的简单着色器，只有 diffuse / opacity 两个 uniform，
          // 不需要（也不能）叠加间接光，因此注入到此为止。
          shader.uniforms.diffuse = {
            value: cloneMaterial.color
          };
          shader.uniforms.opacity = {
            // 用 getter 代理到克隆材质的 opacity：外部改材质透明度时无需重新编译，
            // 也不会因为快照取值而丢失后续更新。
            get value() {
              return cloneMaterial.opacity;
            }
          };
          stats.shaderCompiles += 1;
          return;
        }
        const LIGHTS_FRAGMENT_END_INCLUDE = "#include <lights_fragment_end>";
        if (!shader.fragmentShader.includes(LIGHTS_FRAGMENT_END_INCLUDE)) {
          throw new Error("区域灯材质缺少 lights_fragment_end");
        }
        // 区域灯的结果叠加在 three.js 算完原生光照之后。plan2ReceivingColor 是「提亮后的反照率」：对 albedo 取平方根再混 60%，等价于 gamma 提亮，让深色家具在区域灯下不至于死黑又保留材质色相。
        // 车的玻璃饰面（HB_CAR_GLASS_FINISH）另走一条混法，避免把拍摄贴图的打光再叠加一遍造成过曝。
        const sunShadowSnippet =
          materialKind === "wall"
            ? ""
            : "\n          #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0\n            if (receiveShadow && plan2SunShadowStrength > 0.0 && directionalLightShadows[0].shadowIntensity > 0.0) {\n              // The studio's single shadow-casting directional light is the\n              // first shadow slot. Reuse its resident VSM map; no new capture.\n              DirectionalLightShadow plan2SunShadow = directionalLightShadows[0];\n              plan2ShadowMask = getShadow(directionalShadowMap[0], plan2SunShadow.shadowMapSize,\n                min(1.0, plan2SunShadow.shadowIntensity * plan2SunShadowStrength / 0.18),\n                plan2SunShadow.shadowBias, plan2SunShadow.shadowRadius, vDirectionalShadowCoord[0]);\n            }\n          #endif";
        shader.fragmentShader = shader.fragmentShader.replace(
          LIGHTS_FRAGMENT_END_INCLUDE,
          LIGHTS_FRAGMENT_END_INCLUDE +
            "\nvec3 plan2ReceivingColor = mix(diffuseColor.rgb, sqrt(max(diffuseColor.rgb, vec3(0.0))), 0.6);\n          #ifdef HB_CAR_GLASS_FINISH\n            // Keep moderate fill on glass while avoiding the full furniture\n            // albedo lift, which exaggerates the atlas' photographed lighting.\n            plan2ReceivingColor = mix(plan2ReceivingColor, diffuseColor.rgb, hbCarGlass * 0.6);\n          #endif\n          float plan2ShadowMask = 1.0;" +
            sunShadowSnippet +
            "\n          reflectedLight.indirectDiffuse += plan2ReceivingColor * plan2SurfaceLight(vPlan2WorldPosition) * plan2Gain * plan2ShadowMask;"
        );
        if (materialKind !== "wall" && contactShadows) {
          // 接触阴影 uniform 与区域灯一起声明在前置片段里（材质只允许一次前置拼接，
          // 所以两块内容合并到这里），随后在 opaque_fragment 处把遮蔽乘进最终颜色。
          shader.fragmentShader =
            "uniform sampler2D plan2ContactMap;\n            uniform mat4 plan2ContactTransform;\n            uniform vec4 plan2ContactBounds;\n            uniform float plan2ContactY, plan2ContactOpacity;\n            uniform sampler2D plan2SurfaceMap;\n            uniform vec4 plan2SurfaceBounds;\n            uniform sampler2D plan2SurfaceLookup;\n            uniform vec2 plan2SurfaceLayout;\n            uniform mat4 plan2ContactViewToWorld;\n            uniform float plan2SurfaceOpacity;\n" +
            shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <opaque_fragment>",
            "\n            vec3 contactPosition = (plan2ContactTransform * vec4(vPlan2WorldPosition, 1.0)).xyz;\n            vec2 contactUv = (contactPosition.xz - plan2ContactBounds.xy) / plan2ContactBounds.zw;\n            float contactHeight = contactPosition.y - plan2ContactY;\n            if (contactHeight >= -0.015 && contactHeight < 0.12\n                && all(greaterThanEqual(contactUv, vec2(0.0))) && all(lessThanEqual(contactUv, vec2(1.0)))) {\n              // Rugs and the lowest furniture surfaces also receive contact\n              // shading. Fade it over the first 12cm; upper surfaces stay lit.\n              float contactWeight = 1.0 - smoothstep(0.035, 0.12, max(contactHeight, 0.0));\n              outgoingLight *= 1.0 - texture2D(plan2ContactMap, contactUv).r * plan2ContactOpacity * contactWeight;\n            }\n            " +
              (sourceMaterial.userData?.plan2SurfaceContact === false
                ? ""
                : "if (contactHeight > 0.12 && plan2SurfaceOpacity > 0.0) {\n              // These are already baked shadow pixels, not an occluder depth\n              // map. No shadow comparison or light-space projection per frame.\n              vec4 tile = texture2D(plan2SurfaceLookup, vec2(clamp(contactHeight / plan2SurfaceLayout.y, 0.0, 1.0), 0.5));\n              vec2 localUv = (contactPosition.xz - plan2SurfaceBounds.xy) / plan2SurfaceBounds.zw;\n              if (tile.b > 0.5 && all(greaterThanEqual(localUv, vec2(0.0))) && all(lessThanEqual(localUv, vec2(1.0)))) {\n                float upward = smoothstep(0.8, 0.98, normalize(mat3(plan2ContactTransform) * mat3(plan2ContactViewToWorld) * normal).y);\n                vec2 tileOrigin = floor(tile.rg * 255.0 + 0.5);\n                vec2 surfaceUv = (tileOrigin + clamp(localUv, vec2(0.002), vec2(0.998))) / plan2SurfaceLayout.x;\n                outgoingLight *= 1.0 - texture2D(plan2SurfaceMap, surfaceUv).r * plan2SurfaceOpacity * upward;\n              }\n            }") +
              "\n            #include <opaque_fragment>"
          );
        }
        if (
          !isDetailedSurface &&
          // alphaWallBand：带透明渐变的墙（比如玻璃隔断）需要原生光照的透明处理。
          !sourceMaterial.userData.alphaWallBand &&
          // 有 transmission 的玻璃必须保留原生管线，否则折射会失效。
          (sourceMaterial.transmission == null || sourceMaterial.transmission === 0)
        ) {
          // 廉价光照分支：把 three.js 的原生光照 chunk 整段删掉，只留一个方向性很弱的半球光近似（上半球偏亮、下半球偏冷，再叠一点主光方向的高光）。
          // 目的：不参与区域灯的物件（比如没有体积数据的装饰件）仍要有基本明暗，但不为它们付出逐灯计算的代价。
          shader.fragmentShader = "uniform mat4 plan2ViewToWorld;\n" + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <lights_fragment_begin>",
              "\n              vec3 simpleNormal = normalize(mat3(plan2MotionToLayout) * mat3(plan2ViewToWorld) * normal);\n              float simpleUp = simpleNormal.y * 0.5 + 0.5;\n              float simpleKey = max(dot(simpleNormal, normalize(vec3(-0.4, 0.85, 0.32))), 0.0);\n              vec3 simpleTint = mix(vec3(0.82, 0.85, 0.91), vec3(1.0, 1.0, 1.0), simpleUp);\n              reflectedLight.indirectDiffuse = diffuseColor.rgb * simpleTint * (0.30 + 0.40 * simpleUp + 0.18 * simpleKey);\n            "
            )
            .replace("#include <lights_fragment_maps>", "")
            .replace("#include <lights_fragment_end>", "");
        }
        stats.shaderCompiles += 1;
      };
      const baseProgramCacheKey = sourceMaterial.customProgramCacheKey?.call(sourceMaterial) || "";
      // 缓存键必须把「所有会改变注入代码形态的因素」列全，否则 two 份本应不同的
      // 着色器会共用同一个已编译程序。版本串（v10-glass-albedo）在改动注入逻辑时手动递增，
      // 用来强制丢开上一版缓存的程序。
      cloneMaterial.customProgramCacheKey = () =>
        baseProgramCacheKey +
        "|plan2-baked-surface-v10-glass-albedo|" +
        +(sourceMaterial.userData?.plan2SurfaceContact !== false) +
        "|" +
        +!!sourceMaterial.userData.alphaWallBand +
        "|" +
        Number(isDetailedSurface) +
        "|" +
        Number(isFloorTone) +
        "|" +
        materialKind +
        "|" +
        materialGroup.capacity +
        "|" +
        Number(materialGroup.textureMode) +
        "|" +
        !!contactShadows;
      // 打上标记：后续扫描（重新材质替换 / 清理）靠这两个字段快速识别「这是我们的克隆」，
      // 也供外部（如统计、导出）区分细节面与普通面。
      cloneMaterial.userData.plan2RegionMaterial = true;
      cloneMaterial.userData.plan2DetailedSurface = isDetailedSurface;
      sourceMaterialByClone.set(cloneMaterial, sourceMaterial);
      materialClones.set(variantKey, cloneMaterial);
      materialGroup.materials.add(cloneMaterial);
    }
    resultMaterials.add(cloneMaterial);
    return cloneMaterial;
  }
  /**
   * 重新扫描整个场景结构（材质替换、分组容量、监听器、统计的唯一重算入口）。
   * 流程：1. 遍历一次收集节点表与网格表，顺带找出已登记的灯；2. 维护 childadded / childremoved 监听（新增节点挂上、消失的摘掉），这样后续结构变化能自动把 shouldRescanStructure 置位； 3. 回填每盏灯的楼层 ID、槽位键与楼层根节点；4. 按「楼层 × 分类」建灯组（容量按实际灯数对齐到 16）；5. 逐网格分类接收面并换材质，收集 liveMaterials；
   * 6. 回收：不再使用的网格还原原材质、不再使用的克隆材质 dispose、空灯组销毁 —— 全部依据本轮的 liveMaterials / swappedMeshes 判断；7. 统计原生灯（未登记的灯）数量，便于排查「还有实时光照在跑」。
   */
  function rebuildStructure() {
    stats.structureScans += 1;
    const currentNodes = new Set();
    const meshList = [];
    const registeredLights = new Set();
    rootObject?.traverse(node => {
      currentNodes.add(node);
      if (registrationsByLight.has(node)) {
        registeredLights.add(node);
      }
      if (node.isMesh) {
        meshList.push(node);
      }
    });
    for (const staleNode of listenedNodes) {
      if (!currentNodes.has(staleNode)) {
        staleNode.removeEventListener("childadded", markStructureDirty);
        staleNode.removeEventListener("childremoved", markStructureDirty);
        listenedNodes.delete(staleNode);
      }
    }
    for (const newNode of currentNodes) {
      if (!listenedNodes.has(newNode)) {
        newNode.addEventListener("childadded", markStructureDirty);
        newNode.addEventListener("childremoved", markStructureDirty);
        listenedNodes.add(newNode);
      }
    }
    for (const [registeredLight, registrationRecord] of registrationsByLight) {
      if (!registeredLights.has(registeredLight)) {
        // 灯被移出场景了：把图层掩码还原，让它在别处仍按原生灯工作，
        // 并注销登记（否则会一直占着渲染层 30 不参与任何光照）。
        registeredLight.layers.mask = registrationRecord.originalLayers;
        registrationsByLight.delete(registeredLight);
      }
    }
    registrationsByFloorId = new Map();
    for (const registration of registrationsByLight.values()) {
      registration.floorId = String(
        registration.light.userData?.regionFloorId ??
          registration.light.userData?.lightFloorId ??
          findAncestorUserData(registration.light, "regionFloorId") ??
          findAncestorUserData(registration.light, "floorId") ??
          "default"
      );
      registration.id = String(registration.item.id ?? registration.light.uuid);
      registration.key = regionLightKey(registration.floorId, registration.id);
      let floorRoot = rootObject;
      // 向上找第一个带楼层字段的祖先作为「楼层根」：灯的高度是相对楼层算的
      // （floorElevation），楼层根一旦找错，竖直方向的体积就会整体偏移。
      for (
        let ancestor = registration.light.parent;
        ancestor && ancestor !== rootObject;
        ancestor = ancestor.parent
      ) {
        if (
          ancestor.userData?.regionFloorId !== undefined ||
          ancestor.userData?.floorId !== undefined
        ) {
          floorRoot = ancestor;
          break;
        }
      }
      registration.floorRoot = floorRoot;
      const floorRecords = registrationsByFloorId.get(registration.floorId) || [];
      floorRecords.push(registration);
      registrationsByFloorId.set(registration.floorId, floorRecords);
    }
    const defaultFloorId =
      registrationsByFloorId.size === 1 ? registrationsByFloorId.keys().next().value : "default";
    // 一盏都没有时也要留一个 "default" 楼层键：否则下面的接收面分组会因为找不到
    // 楼层而反复创建空组，且 sampleFloorVolume 的默认楼层取不到值。
    if (!registrationsByFloorId.size) {
      registrationsByFloorId.set(defaultFloorId, []);
    }
    for (const [entryFloorId, floorRegistrations] of registrationsByFloorId) {
      for (const groupKindName of REGION_KINDS) {
        ensureLightGroup(entryFloorId, groupKindName, floorRegistrations.length);
      }
    }
    const liveMaterials = new Set();
    const swappedMeshes = new Set();
    for (const mesh of meshList) {
      // 辅助物件（背景、网格线、轮廓、灯的示意外观）不接收区域光：
      // 它们是编辑器标记而不是房屋组成部分，被照亮会显得很怪。
      if (
        ["background", "grid", "outline", "light-source-preview"].includes(
          findAncestorUserData(mesh, "exportRole")
        )
      ) {
        continue;
      }
      const meshFloorId = String(
        findAncestorUserData(mesh, "regionFloorId") ??
          findAncestorUserData(mesh, "floorId") ??
          defaultFloorId
      );
      if (!registrationsByFloorId.has(meshFloorId)) {
        // 网格的楼层没有灯：仍然要建 0 容量的灯组，让这些接收面也有 uniform
        // （否则材质里的 uniform 为 undefined，着色器编译会失败）。
        registrationsByFloorId.set(meshFloorId, []);
        for (const emptyKindName of REGION_KINDS) {
          ensureLightGroup(meshFloorId, emptyKindName, 0);
        }
      }
      const receiverKind = classifyReceiverKind(mesh);
      const material = mesh.material;
      // 外部模型需要保留自己的 PBR 细节，用这个字段声明后跳过「廉价光照」分支。
      const shouldPreserveDetailed = findAncestorUserData(mesh, "preserveDetailedSurface") === true;
      const isFloorReceiver = findAncestorUserData(mesh, "regionReceiverKind") === "floor";
      const assignedMaterial = Array.isArray(material)
        ? material.map(sourceMaterialItem =>
            getRegionMaterial(
              sourceMaterialItem,
              meshFloorId,
              receiverKind,
              liveMaterials,
              shouldPreserveDetailed,
              isFloorReceiver
            )
          )
        : getRegionMaterial(
            material,
            meshFloorId,
            receiverKind,
            liveMaterials,
            shouldPreserveDetailed,
            isFloorReceiver
          );
      // 只在真的换了材质时才写回：receiverKind / 楼层变了但克隆恰好相同的情况
      // 很常见（比如都是 simple 变体），无条件赋值会让 three.js 误以为材质变了。
      if (
        Array.isArray(material)
          ? assignedMaterial.some(
              (swappedMaterial, materialIndex) => swappedMaterial !== material[materialIndex]
            )
          : assignedMaterial !== material
      ) {
        mesh.material = assignedMaterial;
      }
      if (
        Array.isArray(assignedMaterial)
          ? assignedMaterial.some(regionMaterial => sourceMaterialByClone.has(regionMaterial))
          : sourceMaterialByClone.has(assignedMaterial)
      ) {
        swappedMeshes.add(mesh);
        assignmentsByMesh.set(mesh, {
          assigned: mesh.material
        });
      }
    }
    const stillAssignedMeshes = new Set();
    // retainedRoots 里的子树可能是「被楼层缓存保留、没挂回主场景」的：
    // 逐个遍历它们，把它们用到的材质补进 liveMaterials，避免被下面的回收逻辑误删。
    for (const trackedRoot of retainedRoots) {
      trackedRoot.traverse(traversedNode => {
        if (assignmentsByMesh.has(traversedNode)) {
          stillAssignedMeshes.add(traversedNode);
          for (const meshMaterial of Array.isArray(traversedNode.material)
            ? traversedNode.material
            : [traversedNode.material]) {
            const environmentMaterial = meshMaterial?.environmentSourceMaterial || meshMaterial;
            if (sourceMaterialByClone.has(environmentMaterial)) {
              liveMaterials.add(environmentMaterial);
            }
          }
        }
      });
    }
    for (const [assignedMesh, meshAssignment] of assignmentsByMesh) {
      // 既不在本轮换过材质、也不在保留子树里 → 该网格已经不再需要区域灯材质，还原。
      if (!swappedMeshes.has(assignedMesh) && !stillAssignedMeshes.has(assignedMesh)) {
        restoreMeshMaterial(assignedMesh, meshAssignment);
        assignmentsByMesh.delete(assignedMesh);
      }
    }
    for (const [cloneSourceMaterial, cloneMap] of clonesByMaterial) {
      for (const [staleVariantKey, staleClone] of cloneMap) {
        if (!liveMaterials.has(staleClone)) {
          // 变体键形如 `楼层\0分类\0变体`，取最后一个 \0 之前的部分即所属灯组，
          // 顺手把克隆从灯组的材质集合里摘掉，否则灯组永远不空、不会被回收。
          groupsByKey
            .get(staleVariantKey.slice(0, staleVariantKey.lastIndexOf("\0")))
            ?.materials.delete(staleClone);
          staleClone.dispose();
          cloneMap.delete(staleVariantKey);
        }
      }
      if (!cloneMap.size) {
        clonesByMaterial.delete(cloneSourceMaterial);
      }
    }
    for (const [staleGroupKey, staleGroup] of groupsByKey) {
      if (!registrationsByFloorId.has(staleGroup.floorId) && !staleGroup.materials.size) {
        staleGroup.texture?.dispose();
        groupsByKey.delete(staleGroupKey);
      }
    }
    nativeLights = [];
    scene.traverse(sceneNode => {
      // 未登记的灯会继续走 three.js 的实时光照。收集它们是为了 stat 里能报警，
      // 避免出现「灯在场景里但完全没被区域灯接管」的隐蔽问题。
      if (sceneNode.isLight && !registrationsByLight.has(sceneNode)) {
        nativeLights.push(sceneNode);
      }
    });
    stats.registered = stats.slotCount = registrationsByLight.size;
    stats.materials = liveMaterials.size;
    stats.meshCount = swappedMeshes.size;
    stats.floorCount = registrationsByFloorId.size;
    // 「细节材质」= 保留了原生 PBR 光照的材质：外部模型、带 alpha 渐变的墙、透明玻璃。
    // 它们的数量直接决定着色器会不会退化得只剩区域灯。
    stats.detailedMaterials = [...liveMaterials].filter(
      surfaceMaterial =>
        surfaceMaterial.userData.plan2DetailedSurface ||
        surfaceMaterial.userData.alphaWallBand ||
        surfaceMaterial.transmission > 0
    ).length;
    stats.capacity = [...registrationsByFloorId].reduce(
      (totalCapacity, [, floorEntryList]) => totalCapacity + alignTo16(floorEntryList.length),
      0
    );
    stats.textureFloors = [...registrationsByFloorId.keys()].filter(
      floorKey => groupsByKey.get(floorKey + "\0floor")?.textureMode
    ).length;
    shouldRescanStructure = false;
  }
  /**
   * 把网格的材质还原成区域灯克隆之前的原始材质。
   * 只有「当前挂载的仍是我们当初赋上去的那一份」时才还原：中途被别的模块换过材质（比如反射通道临时替换）说明这份分配已失效，强行还原会覆盖别人的改动。
   */
  function restoreMeshMaterial(swappedMesh, assignmentRecord) {
    if (swappedMesh.material === assignmentRecord.assigned) {
      swappedMesh.material = Array.isArray(swappedMesh.material)
        ? swappedMesh.material.map(
            restoredMaterial => sourceMaterialByClone.get(restoredMaterial) || restoredMaterial
          )
        : sourceMaterialByClone.get(swappedMesh.material) || swappedMesh.material;
    }
  }
  /**
   * 登记一盏灯，让它由区域灯接管。
   * 重复登记同一盏灯不会重置已有记录（保留 fullIntensity 的原始基准），只刷新图层并再次标记结构脏 —— 这样「改亮度」不会把基准值也一起改掉。
   * @param {object} lightObject 灯对象（必须 isLight）。
   */
  function registerLight(lightObject, lightConfig = {}) {
    if (isDisposed || !lightObject?.isLight) {
      return;
    }
    if (!registrationsByLight.get(lightObject)) {
      registrationsByLight.set(lightObject, {
        light: lightObject,
        item: {
          ...lightConfig
        },
        originalLayers: lightObject.layers.mask,
        // fullIntensity 是「这盏灯的标称满值」，用于把当前 intensity 归一化成 0~1 的
        // 点亮比例；取 userData 里的自定义值优先，退回 lightOnIntensity / 当前 intensity。
        // 用 max(0.00001) 兜底，避免除以 0 得到 Infinity。
        fullIntensity: Math.max(
          0.00001,
          coercedFiniteNumberOr(
            lightObject.userData?.regionFullIntensity,
            coercedFiniteNumberOr(lightObject.userData?.lightOnIntensity, lightObject.intensity) || 1
          )
        )
      });
    }
    lightObject.layers.set(REGION_LIGHT_LAYER);
    // 区域灯用自己的光照体积，不需要 three.js 的实时阴影：那套阴影图会随每盏灯
    // 多一次投影渲染，而这里统一复用场景里唯一那盏平行光的阴影（见 sunShadowSnippet）。
    lightObject.castShadow = false;
    shouldRescanStructure = true;
  }
  /**
   * 记录当前相机的世界矩阵，供注入的着色器把 mvPosition 还原成世界坐标。
   */
  function syncCamera(camera) {
    if (!isDisposed && camera?.matrixWorld) {
      viewToWorldUniform.value = camera.matrixWorld;
    }
  }
  /**
   * 每帧入口：必要时重建结构，然后把每盏灯的体积参数写进 uniform / 数据纹理。
   */
  function sync(activeCamera, skipStructureScan = false) {
    if (isDisposed) {
      return;
    }
    if (!skipStructureScan) {
      // 先推进接触阴影：区域灯材质会采样它的 uniform，晚一帧就会读到过期贴图。
      contactShadows?.sync();
      const nextRootObject = getRoot?.() || null;
      if (nextRootObject !== rootObject) {
        rootObject = nextRootObject;
        shouldRescanStructure = true;
      }
      // 运动模式（且非瞬时）下不重扫：过渡中场景每帧都在变，重扫会不断换材质、
      // 不断触发着色器编译，直接把帧率打穿。过渡结束由 setMotion 再置一次脏标记。
      if (shouldRescanStructure && (!isMotionEnabled || isMotionInstant)) {
        rebuildStructure();
      }
    }
    syncCamera(activeCamera);
    // 运动模式：亮度直接归零（见 setMotion），这里不再更新 uniform，直接返回。
    if (isMotionEnabled && !isMotionInstant) {
      return;
    }
    // 280ms 的淡回：退出运动模式时亮度不是瞬间跳回，而是平滑过渡，
    // 否则家具落位的瞬间会看到整屋亮度闪一下。
    const motionFadeProgress =
      motionFadeStartMs === null
        ? 1
        : Math.min(1, Math.max(0, (performance.now() - motionFadeStartMs) / 280));
    if (motionFadeProgress < 1) {
      requestFrame();
    } else {
      motionFadeStartMs = null;
    }
    stats.active = 0;
    let shouldUpdateUniforms = false;
    for (const [loopFloorId, loopRegistrations] of registrationsByFloorId) {
      const loopGroups = REGION_KINDS.map(groupKind =>
        groupsByKey.get(loopFloorId + "\0" + groupKind)
      );
      const motionMatrix =
        isMotionEnabled && isMotionInstant ? motionTransformProvider?.(loopFloorId) : null;
      for (const activeLightGroup of loopGroups) {
        if (motionMatrix) {
          activeLightGroup.uniforms.plan2MotionToLayout.value.copy(motionMatrix);
        } else {
          activeLightGroup.uniforms.plan2MotionToLayout.value.identity();
        }
        // 总增益 × 分类增益 × 淡回进度：三者相乘得到该灯组本帧的最终增益，
        // 一个数就同时表达了「整体亮度」「地面/墙面/家具差异」「过渡动画」。
        const gainValue =
          settings.gain * settings[activeLightGroup.kind + "Gain"] * motionFadeProgress;
        shouldUpdateUniforms ||= activeLightGroup.uniforms.plan2Gain.value !== gainValue;
        activeLightGroup.uniforms.plan2Gain.value = gainValue;
        const sunShadowStrength =
          activeLightGroup.kind === "wall"
            ? 0
            : clamp(coercedFiniteNumberOr(settings.sunShadowStrength, 0.6), 0, 1) * motionFadeProgress;
        shouldUpdateUniforms ||=
          activeLightGroup.uniforms.plan2SunShadowStrength.value !== sunShadowStrength;
        activeLightGroup.uniforms.plan2SunShadowStrength.value = sunShadowStrength;
        activeLightGroup.changed = false;
      }
      loopRegistrations.forEach((floorEntry, slotIndex) => {
        const { light: light, item: lightItem } = floorEntry;
        // 只刷新自身与祖先的世界矩阵（不递归子节点）：灯通常没有子节点，
        // 递归在几十盏灯的循环里是纯开销。
        light.updateWorldMatrix(true, false);
        lightWorldMatrix.copy(light.matrixWorld);
        if (motionMatrix) {
          lightWorldMatrix.premultiply(motionMatrix);
        }
        lightWorldPosition.setFromMatrixPosition(lightWorldMatrix);
        if (floorEntry.floorRoot) {
          floorEntry.floorRoot.updateWorldMatrix(true, false);
          floorRootPosition.setFromMatrixPosition(floorEntry.floorRoot.matrixWorld);
        }
        if (motionMatrix) {
          floorRootPosition.applyMatrix4(motionMatrix);
        }
        const floorElevation = floorEntry.floorRoot ? floorRootPosition.y : 0;
        // 可见性两重判断：灯被隐藏 / 移出场景时 amount 直接为 0；
        // 否则按「当前 intensity ÷ 标称满值」归一化成点亮比例。
        const actualAmount = isVisibleWithin(light, rootObject)
          ? clamp(coercedFiniteNumberOr(light.intensity, 0) / floorEntry.fullIntensity, 0, 1.5)
          : 0;
        // 预览模式：只亮被选中的灯（并把暗着的也提到 0.6 便于看形状），其余全灭。
        const effectiveAmount =
          previewKeys === null
            ? actualAmount
            : previewKeys.has(floorEntry.key)
              ? Math.max(0.6, actualAmount)
              : 0;
        if (effectiveAmount > 0.00001) {
          stats.active += 1;
        }
        volumeInputsScratch.length = 0;
        volumeInputsScratch.push(
          ...lightWorldMatrix.elements,
          floorElevation,
          effectiveAmount,
          actualAmount,
          settings.rangeScale,
          lightItem.type,
          lightItem.lightRange,
          lightItem.width,
          lightItem.depth,
          light.width,
          light.height,
          light.color.r,
          light.color.g,
          light.color.b,
          overrides[floorEntry.key],
          stats.structureScans
        );
        // 体积参数签名逐项比对：全部一致就说明这盏灯的输入没变，
        // 可以跳过下面几十行的体积重算（拖拽相机、拖别的家具时大量命中）。
        if (
          floorEntry.volumeInputs &&
          volumeInputsScratch.every(
            (signatureValue, signatureIndex) =>
              signatureValue === floorEntry.volumeInputs[signatureIndex]
          )
        ) {
          stats.volumeCacheHits++;
          return;
        }
        floorEntry.volumeInputs = volumeInputsScratch.slice();
        const scaledRange =
          clamp(coercedFiniteNumberOr(lightItem.lightRange, 3.5), 0.5, 10) *
          clamp(coercedFiniteNumberOr(settings.rangeScale, 1), 0.2, 3);
        const isStripLight = lightItem.type === "striplight" || light.isRectAreaLight;
        // 默认半径 = 灯范围 × 类型系数：吸顶灯 0.45（更宽的光斑），其余 0.33。
        // 这两个系数是把「标称照射范围」换算成「视觉上的亮区半径」的标定结果。
        const defaultRadius = scaledRange * (lightItem.type === "ceilinglight" ? 0.45 : 0.33);
        const halfWidth = Math.max(0.05, coercedFiniteNumberOr(lightItem.width, light.width || 2) / 2);
        const halfDepth = Math.max(0.025, coercedFiniteNumberOr(lightItem.depth, light.height || 0.2) / 2);
        const matrixElements = lightWorldMatrix.elements;
        // 从世界矩阵的第 0 / 2 列取水平朝向（灯的前方在 XZ 平面的投影），
        // 归一化成单位向量，作为体积的局部轴 —— axis.xy 就是这么来的。
        const horizontalDistance = Math.hypot(matrixElements[0], matrixElements[2]);
        const directionX =
          horizontalDistance > 0.00001 ? matrixElements[0] / horizontalDistance : 1;
        const directionZ =
          horizontalDistance > 0.00001 ? matrixElements[2] / horizontalDistance : 0;
        const lightOverride = overrides[floorEntry.key];
        // 用户设定的是角度制；这里转成弧度做二维旋转，结果写进 region.axis（不写回 override）。
        const rotationRad = ((lightOverride?.rotation || 0) * Math.PI) / 180;
        const rotatedDirectionX = rotationRad
          ? directionX * Math.cos(rotationRad) - directionZ * Math.sin(rotationRad)
          : directionX;
        const rotatedDirectionZ = rotationRad
          ? directionX * Math.sin(rotationRad) + directionZ * Math.cos(rotationRad)
          : directionZ;
        // softEdgeSize 给体积留出一圈软边：取范围与 0.3m 的较大值，
        // 避免小范围灯因为软边过窄而出现硬边。
        const softEdgeSize = Math.max(0.3, scaledRange * 0.23);
        // 条灯以「短边的一半 + 少量余量 + 软边」为基准半径；其它灯用 defaultRadius + 软边。
        const baseRadius = isStripLight
          ? halfDepth + scaledRange * 0.07 + softEdgeSize
          : defaultRadius + softEdgeSize;
        // region 是这盏灯「当前生效的几何描述」，复用对象避免每帧分配；
        // 它同时是 listRegions / inspect 对外暴露的数据来源，也是覆盖字段的落点。
        const region = (floorEntry.region ||= {
          center: [0, 0, 0],
          lampCenter: [0, 0, 0],
          axis: [1, 0],
          defaults: {
            axis: [1, 0],
            rotation: 0,
            softness: 1
          }
        });
        const regionDefaults = region.defaults;
        regionDefaults.width = (isStripLight ? halfWidth + baseRadius : baseRadius) * 2;
        regionDefaults.depth = baseRadius * 2;
        regionDefaults.shape = isStripLight ? "strip" : "ellipse";
        regionDefaults.axis[0] = directionX;
        regionDefaults.axis[1] = directionZ;
        region.floorId = loopFloorId;
        region.id = floorEntry.id;
        region.key = floorEntry.key;
        region.type = lightItem.type;
        region.lampCenter[0] = lightWorldPosition.x;
        region.lampCenter[1] = lightWorldPosition.y;
        region.lampCenter[2] = lightWorldPosition.z;
        region.offsetX = lightOverride?.offsetX ?? 0;
        region.offsetZ = lightOverride?.offsetZ ?? 0;
        region.moveCenterEnabled = lightOverride?.moveCenterEnabled === true;
        region.center[0] = lightWorldPosition.x + region.offsetX;
        region.center[1] = lightWorldPosition.y;
        region.center[2] = lightWorldPosition.z + region.offsetZ;
        region.axis[0] = rotatedDirectionX;
        region.axis[1] = rotatedDirectionZ;
        region.width = lightOverride?.width ?? regionDefaults.width;
        region.depth = lightOverride?.depth ?? regionDefaults.depth;
        region.rotation = lightOverride?.rotation ?? 0;
        region.softness = lightOverride?.softness ?? 1;
        region.shape = lightOverride?.shape ?? regionDefaults.shape;
        region.overridden = !!lightOverride;
        region.amount = effectiveAmount;
        region.realAmount = actualAmount;
        // heightAbove / heightBelow 是「相对灯的高度」写法，换算成绝对高度区间；
        // heightMin / heightMax 则是直接给的绝对高度，优先级更高（见下）。
        region.heightAbove = lightOverride?.heightAbove;
        region.heightBelow = lightOverride?.heightBelow;
        region.lampHeight = lightWorldPosition.y - floorElevation;
        region.heightMin =
          lightOverride?.heightMin ??
          (lightOverride?.heightBelow === undefined
            ? undefined
            : region.lampHeight - lightOverride.heightBelow);
        region.heightMax =
          lightOverride?.heightMax ??
          (lightOverride?.heightAbove === undefined
            ? undefined
            : region.lampHeight + lightOverride.heightAbove);
        for (const loopLightGroup of loopGroups) {
          const loopSlot = loopLightGroup.slots[slotIndex];
          const loopKind = loopLightGroup.kind;
          // 垂直范围按分类微调：地面略微下沉 0.18（把地板下沿也包住），
          // 墙面 / 家具只下沉 0.1（不让光渗到楼下一层）。
          let bottomY = floorElevation - (loopKind === "floor" ? 0.18 : 0.1);
          // 上沿至少比地面高 0.2m，保证体积不会退化成零高度；
          // 墙面额外抬 0.55m（墙面本来就高），家具抬 0.2m。
          let topY = Math.max(
            floorElevation + 0.2,
            lightWorldPosition.y + (loopKind === "wall" ? 0.55 : 0.2)
          );
          // 边缘柔化厚度按分类取不同系数：地面 0.23（最大，贴近真实的地面溢光）、
          // 墙面 0.18（墙脚过渡要短一些）、家具 0.2。
          let edgeFade = Math.max(
            0.3,
            scaledRange * (loopKind === "floor" ? 0.23 : loopKind === "wall" ? 0.18 : 0.2)
          );
          let slotAmount = effectiveAmount;
          if (
            lightOverride?.heightAbove !== undefined ||
            lightOverride?.heightBelow !== undefined ||
            lightOverride?.heightMin !== undefined ||
            lightOverride?.heightMax !== undefined
          ) {
            // 给了高度限制就重算 [bottomLimit, topLimit]：heightMin/Max 是绝对高度，
            // heightBelow/Above 是相对灯高；heightMin === 0 被特判成「贴地」（含地板下沿）。
            const bottomLimit =
              lightOverride.heightMin !== undefined
                ? lightOverride.heightMin === 0
                  ? floorElevation - 0.18 - edgeFade
                  : floorElevation + lightOverride.heightMin
                : lightOverride.heightBelow === undefined
                  ? bottomY - edgeFade
                  : lightWorldPosition.y - lightOverride.heightBelow;
            const topLimit =
              lightOverride.heightMax !== undefined
                ? floorElevation + lightOverride.heightMax
                : lightOverride.heightAbove === undefined
                  ? topY + edgeFade
                  : lightWorldPosition.y + lightOverride.heightAbove;
            const heightSpan = Math.max(0, topLimit - bottomLimit);
            // 软边不能超过总高度的一半：否则上下两端的柔化会互相重叠，
            // 中间就没有「实心」区域了（甚至算出负的净高）。
            edgeFade = Math.max(0.00001, Math.min(edgeFade, heightSpan / 2));
            bottomY = bottomLimit + edgeFade;
            topY = Math.max(bottomY, topLimit - edgeFade);
            if (heightSpan <= 0.00001) {
              // 区间退化（min >= max）→ 这盏灯在该分类下不产生光照，直接灭掉。
              slotAmount = 0;
            }
          }
          // 覆盖模式下尺寸完全由用户给定（不再随灯型变化）；否则条灯用半宽 + 余量 + 软边，
          // 其它灯用 defaultRadius + 软边。
          const slotHalfWidth = lightOverride
            ? lightOverride.width / 2
            : isStripLight
              ? halfWidth
              : defaultRadius + edgeFade;
          const slotHalfDepth = lightOverride
            ? lightOverride.depth / 2
            : isStripLight
              ? halfDepth + scaledRange * 0.07 + edgeFade
              : defaultRadius + edgeFade;
          let slotChanged = setVector4IfChanged(
            loopSlot.center,
            region.center[0],
            (bottomY + topY) / 2,
            region.center[2],
            slotAmount
          );
          slotChanged =
            setVector4IfChanged(
              loopSlot.extent,
              slotHalfWidth,
              (topY - bottomY) / 2,
              slotHalfDepth,
              edgeFade
            ) || slotChanged;
          slotChanged =
            setVector4IfChanged(loopSlot.color, light.color.r, light.color.g, light.color.b, 0) ||
            slotChanged;
          // 形状码（axis.z）：覆盖模式 4 = 方形、3 = 条灯（圆角矩形）、2 = 椭圆（circle 也走椭圆）；
          // 未覆盖时 1 = 自动条灯、0 = 自动椭圆。着色器按这些阈值分支出不同的距离场。
          slotChanged =
            setVector4IfChanged(
              loopSlot.axis,
              rotatedDirectionX,
              rotatedDirectionZ,
              lightOverride
                ? lightOverride.shape === "square"
                  ? 4
                  : lightOverride.shape === "strip"
                    ? 3
                    : 2
                : isStripLight
                  ? 1
                  : 0,
              lightOverride?.softness ?? 0
            ) || slotChanged;
          loopLightGroup.changed ||= slotChanged;
          if (slotChanged && loopLightGroup.texture) {
            // 纹理模式下数据不会自动跟着 Vector4 变：必须把四个 vec4 按 16 个 float
            // 写回纹理缓冲。偏移量 slotIndex * 16 对应「每盏灯 4 列 × 每列 4 通道」。
            const textureData = loopLightGroup.texture.image.data;
            const slotByteOffset = slotIndex * 16;
            loopSlot.center.toArray(textureData, slotByteOffset);
            loopSlot.extent.toArray(textureData, slotByteOffset + 4);
            loopSlot.color.toArray(textureData, slotByteOffset + 8);
            loopSlot.axis.toArray(textureData, slotByteOffset + 12);
          }
        }
      });
      for (const dirtyLightGroup of loopGroups) {
        if (dirtyLightGroup.changed && dirtyLightGroup.texture) {
          // 只在真正改了 slot 时才重传整张数据纹理；否则每帧上传几十 KB 是纯浪费。
          dirtyLightGroup.texture.needsUpdate = true;
        }
        shouldUpdateUniforms ||= dirtyLightGroup.changed;
      }
    }
    if (shouldUpdateUniforms) {
      // 统计「本帧是否真的写过 uniform」：长期居高不下说明体积签名命中率太低，
      // 需要检查是不是每帧都在重建灯具（比如灯的世界矩阵被别处反复改动）。
      stats.uniformUpdates += 1;
    }
    // 只统计「可见且落在相机图层里」的原生灯：图层不匹配的灯虽然存在但不会被渲染，
    // 统计进去会误导排查。
    stats.nativeLights = nativeLights.filter(
      sceneLight =>
        isVisibleWithin(sceneLight, scene) &&
        (!activeCamera || sceneLight.layers.test(activeCamera.layers))
    ).length;
  }
  /**
   * 导出一份「本帧区域灯状态」的快照，供调试面板 / 自动化测试读取。
   * 全部是深拷贝（数组手动展开）：调用方拿到的对象不会被下一帧的原地更新悄悄改掉，可以安全地序列化或延迟比较。
   */
  function inspect() {
    return {
      ...stats,
      settings: {
        ...settings
      },
      overrides: getOverrides(),
      previewKeys: previewKeys ? [...previewKeys] : null,
      regions: listRegions(),
      floors: [...registrationsByFloorId].map(([inspectFloorId, inspectRegistrations]) => ({
        floorId: inspectFloorId,
        slots: inspectRegistrations.length,
        capacity: groupsByKey.get(inspectFloorId + "\0floor")?.capacity,
        lights: inspectRegistrations.map(inspectEntry => ({
          id: inspectEntry.item.id || inspectEntry.light.uuid,
          type: inspectEntry.item.type,
          intensity: inspectEntry.light.intensity,
          fullIntensity: inspectEntry.fullIntensity,
          amount: clamp(
            coercedFiniteNumberOr(inspectEntry.light.intensity, 0) / inspectEntry.fullIntensity,
            0,
            1.5
          ),
          effectiveAmount: inspectEntry.region?.amount ?? 0,
          regionKey: inspectEntry.key,
          visible: isVisibleWithin(inspectEntry.light, rootObject)
        }))
      }))
    };
  }
  /**
   * 设置区域覆盖表（编辑器里给某盏灯画的形状）。
   * 先清洗再写入，随后立即同步一次：传入的 save/apply 期望「调用完就生效」，不能等到下一帧。
   * 第二个参数 true 表示跳过结构扫描 —— 形状变化只影响体积参数，不需要重扫场景换材质。
   */
  function setOverrides(rawOverrideInput) {
    overrides = sanitizeRegionOverrides(rawOverrideInput);
    sync(undefined, true);
    return getOverrides();
  }
  /**
   * 取覆盖表的副本（键值各复制一层）：直接返回内部对象会让调用方改到我们的状态，所以必须复制；值里的都是标量，复制一层值对象即可。
   */
  function getOverrides() {
    return Object.fromEntries(
      Object.entries(overrides).map(([overrideKey, overrideValue]) => [
        overrideKey,
        {
          ...overrideValue
        }
      ])
    );
  }
  /**
   * 列出所有「已经算出体积」的灯（即至少 sync 过一次的灯）。
   *
   * 返回的是深拷贝：region 内部对象在每帧被原地复用，直接返回会被下一帧改掉。
   */
  function listRegions() {
    return [...registrationsByLight.values()]
      .filter(regionEntry => regionEntry.region)
      .map(({ region: regionRecord }) => ({
        ...regionRecord,
        center: [...regionRecord.center],
        lampCenter: [...regionRecord.lampCenter],
        axis: [...regionRecord.axis],
        defaults: {
          ...regionRecord.defaults,
          axis: [...regionRecord.defaults.axis]
        }
      }));
  }
  /**
   * 进入 / 退出「单灯预览」模式：预览时被选中的灯至少按 0.6 的强度渲染（即使实际是灭的）、其余灯归零，以便在编辑器里看清每盏灯的光斑形状与边界；传非数组即退出预览。
   */
  function setPreview(previewKeyList) {
    previewKeys = Array.isArray(previewKeyList)
      ? new Set(
          previewKeyList.filter(
            previewKey => typeof previewKey == "string" && isRegionLightKey(previewKey)
          )
        )
      : null;
    sync(undefined, true);
  }
  /**
   * 在 CPU 侧采样某楼层某个分类的区域光照结果（走 sampleRegionVolumes）。
   * 会把采样点先乘上 plan2MotionToLayout，保证与着色器处于同一坐标系 —— 运动模式下世界坐标与布局坐标不一致，漏掉这一步会采到错误位置。
   */
  function sampleFloorVolume(
    samplePoint,
    sampleFloorId = registrationsByFloorId.keys().next().value,
    sampleKind = "floor"
  ) {
    const sampleGroup = groupsByKey.get(sampleFloorId + "\0" + sampleKind);
    if (sampleGroup) {
      return sampleRegionVolumes(
        sampleGroup.slots.slice(0, sampleGroup.uniforms.plan2LightCount.value),
        sampleWorldPoint
          .copy(samplePoint)
          .applyMatrix4(sampleGroup.uniforms.plan2MotionToLayout.value),
        sampleGroup.uniforms.plan2Gain.value
      );
    } else {
      return [0, 0, 0];
    }
  }
  /**
   * 释放控制器：还原所有被换掉的材质与灯的图层掩码，销毁克隆材质与数据纹理。
   * 幂等；释放后 controller 上的方法仍可调用（内部有 isDisposed 守卫）但不再生效。
   * 顺序上先还原场景（restoreMeshMaterial）再销毁资源，避免场景里残留指向已销毁材质的引用。
   */
  function dispose() {
    if (!isDisposed) {
      isDisposed = true;
      stats.disposed = true;
      if (scene.onBeforeRender === onBeforeRender) {
        scene.onBeforeRender = originalOnBeforeRender;
      }
      for (const listenedNode of listenedNodes) {
        listenedNode.removeEventListener("childadded", markStructureDirty);
        listenedNode.removeEventListener("childremoved", markStructureDirty);
      }
      for (const [swappedMeshEntry, meshAssignmentRecord] of assignmentsByMesh) {
        restoreMeshMaterial(swappedMeshEntry, meshAssignmentRecord);
      }
      for (const cloneMapToDispose of clonesByMaterial.values()) {
        for (const cloneToDispose of cloneMapToDispose.values()) {
          cloneToDispose.dispose();
        }
      }
      for (const disposedLightGroup of groupsByKey.values()) {
        disposedLightGroup.texture?.dispose();
      }
      for (const restoredLight of registrationsByLight.values()) {
        restoredLight.light.layers.mask = restoredLight.originalLayers;
      }
      listenedNodes.clear();
      assignmentsByMesh.clear();
      clonesByMaterial.clear();
      registrationsByLight.clear();
      groupsByKey.clear();
      retainedRoots.clear();
      if (typeof window !== "undefined" && window.__plan2Region === controller) {
        delete window.__plan2Region;
      }
    }
  }
  /**
   * 场景的 onBeforeRender 钩子：借渲染前的时机做一次同步。
   * 之所以挂在这里而不是主循环：three.js 每次渲染都会调它，能保证「相机 / 图层刚被外部改过」之后用的是最新状态；renderArgs[2] 即当前相机。
   */
  function onBeforeRender(...renderArgs) {
    originalOnBeforeRender?.apply(this, renderArgs);
    sync(renderArgs[2]);
  }
  /**
   * 设置地面亮度百分比（100 = 原样，50~150 之间夹取）。
   *
   * 走共享 uniform，所以改一次就作用于所有楼层的地面，不触发任何重编译。
   */
  const setFloorBrightness = brightnessPercent => {
    const brightnessRatio = clamp(coercedFiniteNumberOr(brightnessPercent, 100), 50, 150) / 100;
    if (brightnessRatio === floorBrightnessUniform.value) {
      return false;
    } else {
      floorBrightnessUniform.value = brightnessRatio;
      stats.uniformUpdates += 1;
      return true;
    }
  };
  /**
   * 进入 / 退出运动模式。两种粒度：
   * 普通运动模式（motionInstant = false）：亮度直接归零，过渡期间不更新 uniform，等退出时再用 280ms 淡回（motionFadeStartMs），用于楼层过渡这种大范围位移；
   * 瞬时模式（motionInstant = true）：仍按每帧重算体积，只是把坐标换到布局空间（plan2MotionToLayout），用于家具小幅拖拽，要求光跟着走。
   */
  function setMotion(motionEnabled, motionInstant = false) {
    if (isMotionEnabled === (motionEnabled === true) && isMotionInstant === motionInstant) {
      return;
    }
    const previousMotionInstant = isMotionInstant;
    isMotionInstant = motionInstant;
    isMotionEnabled = motionEnabled === true;
    motionFadeStartMs =
      isMotionEnabled || motionInstant || previousMotionInstant ? null : performance.now();
    if (isMotionEnabled && !isMotionInstant) {
      // 普通运动模式下把增益与阴影强度都清零：宁可短暂没有区域光，
      // 也不要让光斑跟着旧位置残留在画面上。
      for (const frozenLightGroup of groupsByKey.values()) {
        frozenLightGroup.uniforms.plan2Gain.value = 0;
        frozenLightGroup.uniforms.plan2SunShadowStrength.value = 0;
      }
    }
    shouldRescanStructure = true;
    requestFrame();
  }
  // 对外接口。sync 由 studio-app 的渲染循环调用，也通过 scene.onBeforeRender 兜底；
  // 其余方法都是「改状态 + 让下一次 sync 生效」的模式，不会在调用栈里直接做重活。
  const controller = {
    register: registerLight,
    sync: sync,
    syncCamera: syncCamera,
    dispose: dispose,
    stats: stats,
    settings: settings,
    inspect: inspect,
    sample: sampleFloorVolume,
    invalidate: markStructureDirty,
    setFloorBrightness: setFloorBrightness,
    setMotion: setMotion,
    setMotionTransformProvider(provider) {
      motionTransformProvider = provider;
    },
    setOverrides: setOverrides,
    getOverrides: getOverrides,
    listRegions: listRegions,
    setPreview: setPreview,
    retainRoot(retainedRoot) {
      retainedRoots.add(retainedRoot);
      markStructureDirty();
    },
    releaseRoot(releasedRoot) {
      retainedRoots.delete(releasedRoot);
      markStructureDirty();
    }
  };
  scene.onBeforeRender = onBeforeRender;
  if (typeof window !== "undefined") {
    window.__plan2Region = controller;
  }
  return controller;
}
