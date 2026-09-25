/**
 * 自建 GLB 模型的生成库：零件 DSL → three 几何 → GLB 文件。
 *
 * 为什么自建而不是找素材：这是个离线私有项目，外部模型站点的授权与体积都不可控，而工作室需要的
 * 恰恰是程序化生成最擅长的东西 —— 「占地正确、材质槽位正确、多边形很少」的占位成品。
 *
 * 三条硬约束，全部来自运行侧的既有约定。写错不会报错，只会静默降级（模型加载失败会悄悄退回
 * 过程几何，看起来「只是有点糊」），所以这里逐条写明：
 *
 * 1. **原点在占地底面中心，+Z 是正面。** 运行侧按 scaleBasis（宽 / 高 / 深）缩放并把原点贴地
 *    （preserveOrigin），原点漂在模型中间会让物件半埋进地板。
 * 2. **材质名必须是 `material-<槽位号>`，或带角色时 `material-<槽位号>-<角色>`**（角色的含义与
 *    词表见 model-roles.mjs）。studio-external-models.js 的 applyFurniturePalette /
 *    applyAppliancePalette 按槽位号与材质名后缀决定取哪个色卡槽；而带角色的型号会被
 *    「档位即组合」那条路接管，按角色取该块自己的颜色与质感（柜体一份、柜面另一份）。
 *    名字对不上等于「模型到位后颜色不跟着风格走」，或「整件被刷成一个颜色」。
 * 3. **同一槽位只出一块材质、一个网格节点。** 槽位是运行侧唯一的语义单位；按材质拆网格只增加
 *    draw call，反正整件物件的颜色最终都会被色卡重刷。
 *
 * 顶点预算是第二条硬指标：lite 版是首屏加载的那一份。做法不是简化算法，而是「完整版多段数 +
 * 保留装饰件，lite 版降段数 + 丢掉只在近看时才成立的小件」。
 */
import { installGltfNodeShims, toArrayBuffer } from "./gltf-node-runtime.mjs";
import { materialNameForSlot } from "./model-roles.mjs";

const THREE_BASE = new URL("../../frontend/static/vendor/three/0.186.0/", import.meta.url);

/** 两种产出版本：full 是完整版，lite 是首屏加载的那一份。 */
export const MODEL_VARIANTS = Object.freeze(["full", "lite"]);

let threeModulePromise = null;
let gltfExporterPromise = null;
let geometryUtilsPromise = null;
let roundedBoxPromise = null;

/**
 * 惰性加载 three：只有真的要生成时才解析，纯校验路径不必付这个代价。
 *
 * RoundedBoxGeometry 不在 three 核心里（它是 addons），要单独并入 —— 因此这里返回的是
 * 「three 命名空间 + 圆角盒」的合并对象，而不是 three 本身。
 */
async function loadThree() {
  if (!threeModulePromise) {
    threeModulePromise = import(new URL("three.module.min.js", THREE_BASE).href);
  }
  if (!roundedBoxPromise) {
    roundedBoxPromise = import(new URL("RoundedBoxGeometry.js", THREE_BASE).href);
  }
  if (!geometryUtilsPromise) {
    geometryUtilsPromise = import(new URL("BufferGeometryUtils.js", THREE_BASE).href);
  }
  const [threeApi, roundedBoxModule, geometryUtils] = await Promise.all([
    threeModulePromise,
    roundedBoxPromise,
    geometryUtilsPromise
  ]);
  return {
    ...threeApi,
    RoundedBoxGeometry: roundedBoxModule.RoundedBoxGeometry,
    mergeGeometries: geometryUtils.mergeGeometries,
    // mergeVertices 不是「可选优化」而是合并的前提：RoundedBoxGeometry 是非索引几何，
    // 与 three 内建的索引几何混在一个槽位里时，mergeGeometries 会直接拒绝合并
    // （"make sure index attribute exists among all geometries, or in none of them"）。
    // 统一过一次 mergeVertices，既保证「全都有索引」，又顺手把重复顶点按属性去重。
    mergeVertices: geometryUtils.mergeVertices
  };
}

async function loadGltfExporter() {
  if (!gltfExporterPromise) {
    installGltfNodeShims();
    gltfExporterPromise = import(new URL("GLTFExporter.js", THREE_BASE).href);
  }
  return (await gltfExporterPromise).GLTFExporter;
}

/**
 * 声明一个零件。
 *
 * @param {number} slot 材质槽位号，落成 `material-<slot>`。
 * @param {"box"|"roundedbox"|"cyl"|"sphere"|"lathe"|"torus"|"capsule"|"extrude"} kind 几何种类。
 * @param {number[]} size 逐 kind 不同：
 *   - box / roundedbox：[宽, 高, 深]（米）；
 *   - cyl：[半径, 高, 段数]；
 *   - sphere：[半径, 经段, 纬段]；
 *   - lathe：[母线点集, 段数]，母线是 `[半径, 高度]` 数组且**必须闭合**；
 *   - torus：[环半径, 管半径]；
 *   - capsule：[半径, 直段长]；
 *   - extrude：[平面轮廓, 拉伸厚度]（轮廓形状见 extrude 助手）。
 * @param {number[]} at 位置 [x, y, z]（米）。y 的含义由 align 决定，见下。
 * @param {object} [options]
 *   - align："bottom"（默认，y 是零件底面）/ "center" / "top"；
 *   - rot：[rx, ry, rz] 角度制，绕零件自身中心旋转；
 *   - fullOnly：true 表示「只在完整版保留」（近看才成立的小件，如旋钮、把手细节）；
 *   - segments：圆角盒的圆角分段覆盖；radius：圆角盒的圆角半径覆盖；radiusTop：圆柱上半径；
 *   - curveSegments：extrude 轮廓的曲线分段覆盖（只对 arcTo / curveTo 生效）。
 *   - axis：torus 的轴（默认 "y"，即平放的环；"z" 是立起来朝向观察者的环）；
 *   - mirrorX：把这块零件沿 x = 0 镜像（对称家具成对零件用，见 mirrorPair 助手）。
 *
 * 零件的最终摆放是「自己的 rot → 落位（align / centered）→ 环列（spin）→ 镜像（mirrorX）」，
 * 这个顺序不可颠倒：后两步描述的是「在整件里的位置」，必须建立在前两步之上。
 */
export function part(slot, kind, size, at, options = {}) {
  return { slot, kind, size, at, ...options };
}

/** 便捷写法：底部对齐的方盒。 */
export function box(slot, size, at, options = {}) {
  return part(slot, "box", size, at, options);
}

/** 便捷写法：竖轴圆柱，y 是底面高度。 */
export function cyl(slot, radius, height, segments, at, options = {}) {
  return part(slot, "cyl", [radius, height, segments], at, options);
}

/** 便捷写法：圆角盒（沙发 / 坐垫 / 软包用，近看才不像一排石膏块）。 */
export function roundedBox(slot, size, at, options = {}) {
  return part(slot, "roundedbox", size, at, { segments: 3, ...options });
}

/** 便捷写法：球（灯罩、花器、旋钮）。 */
export function sphere(slot, radius, at, options = {}) {
  return part(slot, "sphere", [radius, 16, 12], at, options);
}

/**
 * 便捷写法：回转体（圆桌面、花器、灯罩、圆盆、酒杯）。
 *
 * `profile` 是母线 —— 一串 `[半径, 高度]` 点，绕竖直轴转一圈成形。**首尾必须重合**：
 * 不闭合得到的是一个单面壳，而槽位用的 MeshStandardMaterial 是单面渲染，从背面看整块消失
 * （浏览器里只表现为「这个物件时有时无」，极难归因）。母线贴着轴（半径 0）时回转结果是实心体。
 */
export function lathe(slot, profile, segments, at, options = {}) {
  return part(slot, "lathe", [profile, segments], at, options);
}

export function clathe(slot, profile, segments, at, options = {}) {
  return part(slot, "lathe", [profile, segments], at, { centered: true, ...options });
}

/**
 * 便捷写法：环（桌面描边、凳圈踏脚、风扇护网、盆沿）。
 * 默认平放（轴为 y）；`axis: "z"` 得到立起来朝向观察者的环。
 */
export function torus(slot, radius, tube, at, options = {}) {
  return part(slot, "torus", [radius, tube], at, options);
}

export function ctorus(slot, radius, tube, at, options = {}) {
  return part(slot, "torus", [radius, tube], at, { centered: true, ...options });
}

/** 便捷写法：胶囊（软包扶手、抱枕、瓶身 —— 两端半球，比圆柱少一道硬棱）。 */
export function capsule(slot, radius, length, at, options = {}) {
  return part(slot, "capsule", [radius, length], at, options);
}

export function ccapsule(slot, radius, length, at, options = {}) {
  return part(slot, "capsule", [radius, length], at, { centered: true, ...options });
}

/**
 * 便捷写法：锥形圆柱（真实家具的腿几乎都是上粗下细）。
 * 复用 cyl 分支，只是把「上半径」这个参数提到显眼位置 —— 写 `taper(0, 0.022, 0.016, 0.42, 16, …)`
 * 一眼就知道是「底 22mm、顶 16mm、高 420mm 的锥形腿」。
 */
export function taper(slot, radiusBottom, radiusTop, height, segments, at, options = {}) {
  return part(slot, "cyl", [radiusBottom, height, segments], at, { radiusTop, ...options });
}

export function ctaper(slot, radiusBottom, radiusTop, height, segments, at, options = {}) {
  return part(slot, "cyl", [radiusBottom, height, segments], at, {
    centered: true,
    radiusTop,
    ...options
  });
}

/**
 * 便捷写法：把一段**平面轮廓**拉成体（大钢琴的弯背、异形台面、弧形靠背）。
 *
 * 为什么需要它：`lathe` 只能转出**回转体**，方盒只能拼出直角 —— 而实物里有一整类物件的外形是
 * 「平面上一圈任意曲线、沿高度等截面」。三角钢琴的弯背（bentside）是最典型的一例：俯视轮廓是
 * 「一条直边 + 一条大弧」，用方盒拼只能拼出阶梯，一眼就看得出是方块堆的。
 *
 * `outline` 是**声明式**的（规格文件拿不到 three），形状为：
 *
 *   {
 *     start: [x, y],                                  // 起点，隐式 moveTo
 *     path: [
 *       { lineTo: [x, y] },                           // 直线段
 *       { arcTo: [cx, cy, radius, 起点角, 终点角], clockwise? },  // 圆弧段（角度制）
 *       { curveTo: [[控制点x, 控制点y], [终点x, y]] }  // 二次曲线段
 *     ]
 *   }
 *
 * 轮廓**必须自行闭合**（末点回到 start，或由弧段接回去）：不闭合的轮廓拉出来是一张侧壁缺失的
 * 壳，而单面渲染从背面看整块消失 —— 与 lathe 母线不闭合是同一类静默故障，所以这里也当场报错。
 *
 * 坐标约定：轮廓画在**水平面**上（x 是同 x、y 会落到 z），拉出的厚度沿竖直方向。`rot` / `align` /
 * `centered` 全部照常生效，因此要「立起来」时写 `rot: [90, 0, 0]` 即可（见 piano 规格）。
 *
 * 曲面段数是 lite 版的一条实质杠杆：弧段在 lite 里降到 5 段（完整版 14 段），曲线轮廓的顶点数
 * 因此按段数下降。直线段不受影响。
 */
export function extrude(slot, outline, depth, at, options = {}) {
  return part(slot, "extrude", [outline, depth], at, options);
}

/**
 * 取一组零件**以及它们沿 x = 0 的镜像**（成对的扶手、腿、把手）。
 *
 * 为什么要有它：对称家具里「左边那个」与「右边那个」是同一件事的两份，手写两遍就一定会有一遍
 * 算错半个尺寸或角度 —— 而错的那一遍在成品里表现为「这张椅子左右不一样」，肉眼扫过去未必看得见。
 *
 * 返回的是「原件 + 镜像」两批（不是只有镜像件）：成对零件在规格里总是同时出现，只给镜像件会让
 * 每处调用都得写成 `[...parts, ...mirrorPair(parts)]`，那是把易漏的负担留给调用方。
 *
 * 镜像是**在几何上**做的（见 mirrorGeometryX），不是把坐标取反：取反只对轴对齐的方盒成立，
 * 遇到带旋转的零件（斜腿、外八脚）就会得到方向错误的镜像，而且错得不明显。
 */
export function mirrorPair(parts) {
  const list = Array.isArray(parts) ? parts : [parts];
  return [...list, ...list.map(item => ({ ...item, mirrorX: !item.mirrorX }))];
}

/**
 * 环列一组零件：桌子 / 凳子的多腿、风扇叶片、圆桌的支撑辐条。
 *
 * `build(index, angle)` 返回的零件写在**基准位**上 —— 想象它站在「+z 方向上、离中心 radius」处、
 * 正面朝外；ringOf 会把它推到半径并绕竖直轴转到自己的角度。于是你只需要写一次零件（比如一根
 * 斜向外八的腿），环列 4 份时另外三份的朝向自动正确，不必自己算 sin / cos。
 *
 * 角度从 `startAngle` 起、每份均分一圈；直角放 +z 方向的零件用 `startAngle: 45` 就落在对角上。
 */
export function ringOf(count, { radius, startAngle = 0, center = [0, 0] }, build) {
  const parts = [];
  for (let index = 0; index < count; index += 1) {
    const angle = startAngle + (360 / count) * index;
    const built = build(index, angle);
    for (const item of Array.isArray(built) ? built : [built]) {
      parts.push({ ...item, spin: { angle, radius, center } });
    }
  }
  return parts;
}

/**
 * 以「水平中心」定位的便捷写法。
 *
 * 默认写法里 at 的 x / z 是零件的**占地最小角**，写对称家具（四条腿、两个扶手）时要反复心算
 * 半个尺寸，很易错。这一组把 x / z 换成零件中心：规格里写 `cbox(0, [0.05,0.16,0.05], [0.4, 0, 0.375])`
 * 就是「腿心在 0.4 / 0.375 处」，读起来就是设计意图。y 的含义仍由 align 决定。
 */
export function cbox(slot, size, at, options = {}) {
  return part(slot, "box", size, at, { centered: true, ...options });
}

export function croundedBox(slot, size, at, options = {}) {
  return part(slot, "roundedbox", size, at, { centered: true, segments: 3, ...options });
}

export function ccyl(slot, radius, height, segments, at, options = {}) {
  return part(slot, "cyl", [radius, height, segments], at, { centered: true, ...options });
}

/** 度 → 弧度。零件表的 rot 写角度，读起来直观。 */
function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * 生成单个零件的几何（已烘入自身旋转与位置）。
 *
 * 旋转烘进几何而不是写在网格节点上：同一槽位常有多个朝向不同的零件（四条腿、两个把手），
 * 而合并几何要求变换一致 —— 只有在几何上烘好旋转，同一槽位的零件才能并成一个网格。
 */
async function createPartGeometry(threeApi, partDefinition, variant) {
  const isLite = variant === "lite";
  // 护栏：镜像 / 环列助手返回的是**数组**，用 `.map` 而不是 `.flatMap` 会得到「数组套数组」，
  // 展开之后那个数组就成了一个没有 size 的零件 —— 报错点会飘到几何构造里，很难归因。
  if (!Array.isArray(partDefinition.size)) {
    throw new Error(
      `零件缺少 size（多半是 mirrorPair / ringOf 的结果没有摊平）：${JSON.stringify(partDefinition).slice(0, 120)}`
    );
  }
  const [sizeX, sizeY, sizeZ] = partDefinition.size;
  let geometry;
  if (partDefinition.kind === "box") {
    geometry = new threeApi.BoxGeometry(sizeX, sizeY, sizeZ);
  } else if (partDefinition.kind === "roundedbox") {
    const shortestEdge = Math.min(sizeX, sizeY, sizeZ);
    const radius = partDefinition.radius ?? shortestEdge * 0.18;
    // 圆角分段是「顶点数 × 段数²」的增长点：lite 压到 2 段，这一档省下的顶点最多。
    const segments = isLite ? 2 : (partDefinition.segments ?? 3);
    geometry = new threeApi.RoundedBoxGeometry(sizeX, sizeY, sizeZ, segments, radius);
  } else if (partDefinition.kind === "cyl") {
    const [radius, height, segments] = partDefinition.size;
    const radialSegments = isLite ? Math.max(10, Math.round(segments * 0.5)) : segments;
    geometry = new threeApi.CylinderGeometry(
      partDefinition.radiusTop ?? radius,
      radius,
      height,
      radialSegments,
      1
    );
  } else if (partDefinition.kind === "sphere") {
    const [radius, widthSegments, heightSegments] = partDefinition.size;
    geometry = new threeApi.SphereGeometry(
      radius,
      isLite ? Math.max(10, Math.round(widthSegments * 0.5)) : widthSegments,
      isLite ? Math.max(8, Math.round(heightSegments * 0.5)) : heightSegments
    );
  } else if (partDefinition.kind === "lathe") {
    const [profile, segments] = partDefinition.size;
    const first = profile[0];
    const last = profile[profile.length - 1];
    if (
      !first ||
      !last ||
      Math.abs(first[0] - last[0]) > 1e-6 ||
      Math.abs(first[1] - last[1]) > 1e-6
    ) {
      // 不闭合的母线回转出来是单面壳，单面渲染从背面看整块消失 —— 浏览器里只表现为
      // 「这个物件时有时无」，归因成本极高。宁可在这里拦住。
      throw new Error(
        `lathe 的母线必须闭合（首点 == 末点）：首 ${JSON.stringify(first)}、末 ${JSON.stringify(last)}`
      );
    }
    geometry = new threeApi.LatheGeometry(
      profile.map(([profileRadius, profileHeight]) => new threeApi.Vector2(profileRadius, profileHeight)),
      isLite ? Math.max(12, Math.round(segments * 0.5)) : segments
    );
  } else if (partDefinition.kind === "torus") {
    const [ringRadius, tubeRadius] = partDefinition.size;
    const radialSegments = isLite ? 6 : 10;
    const tubularSegments = isLite ? 16 : 32;
    geometry = new threeApi.TorusGeometry(ringRadius, tubeRadius, radialSegments, tubularSegments);
    // TorusGeometry 的轴是 +z（环睡在 xy 平面上）；家具里的环几乎都是平放的，
    // 所以默认转成「轴为 +y」，要立起来的环再显式写 axis: "z"。
    if ((partDefinition.axis ?? "y") === "y") {
      geometry.rotateX(Math.PI / 2);
    }
  } else if (partDefinition.kind === "capsule") {
    const [radius, length] = partDefinition.size;
    geometry = new threeApi.CapsuleGeometry(
      radius,
      length,
      isLite ? 6 : 12,
      isLite ? 10 : 20
    );
  } else if (partDefinition.kind === "extrude") {
    const [outline, depth] = partDefinition.size;
    if (!outline || !Array.isArray(outline.start)) {
      throw new Error(
        `extrude 的轮廓缺少 start（应为 [x, y]）：${JSON.stringify(outline).slice(0, 120)}`
      );
    }
    const shape = new threeApi.Shape();
    shape.moveTo(outline.start[0], outline.start[1]);
    for (const segment of outline.path ?? []) {
      if (Array.isArray(segment.lineTo)) {
        shape.lineTo(segment.lineTo[0], segment.lineTo[1]);
      } else if (Array.isArray(segment.arcTo)) {
        const [centerX, centerY, arcRadius, startDegrees, endDegrees] = segment.arcTo;
        // 角度制入参、弧度制 API：规格里写角度比写 3.14159 好核对得多。
        shape.absarc(
          centerX,
          centerY,
          arcRadius,
          toRadians(startDegrees),
          toRadians(endDegrees),
          segment.clockwise === true
        );
      } else if (Array.isArray(segment.curveTo)) {
        const [controlPoint, endPoint] = segment.curveTo;
        shape.quadraticCurveTo(controlPoint[0], controlPoint[1], endPoint[0], endPoint[1]);
      } else {
        throw new Error(`extrude 的轮廓里有无法识别的段：${JSON.stringify(segment).slice(0, 80)}`);
      }
    }
    // 轮廓必须闭合：不闭合即侧壁缺失，单面渲染下整块从背面消失（与 lathe 母线同责）。
    const shapePoints = shape.getPoints();
    const firstPoint = shapePoints[0];
    const lastPoint = shapePoints[shapePoints.length - 1];
    if (firstPoint.distanceTo(lastPoint) > 1e-4) {
      throw new Error(
        `extrude 的轮廓必须闭合（末点要回到起点）：首 ${firstPoint.toArray()}、末 ${lastPoint.toArray()}`
      );
    }
    geometry = new threeApi.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      // `curveSegments` 只对 arcTo / curveTo 生效（纯 lineTo 的轮廓它管不着）。逐零件的覆盖值
      // 给「轮廓本身就是一条曲线、但不需要 14 段那么细」的族用（叶面就是这一类：14 段一条边
      // 让一株绿植的完整版涨到 5200 顶点，10 段已经看不出折线，省下三分之一）。
      curveSegments: isLite ? 5 : (partDefinition.curveSegments ?? 14)
    });
  } else {
    throw new Error(`未知的零件几何种类：${partDefinition.kind}`);
  }
  const [rotationX, rotationY, rotationZ] = partDefinition.rot || [0, 0, 0];
  if (rotationX) {
    geometry.rotateX(toRadians(rotationX));
  }
  if (rotationY) {
    geometry.rotateY(toRadians(rotationY));
  }
  if (rotationZ) {
    geometry.rotateZ(toRadians(rotationZ));
  }
  // 定位统一按「旋转后包围盒」来算，两条分支同一套公式：
  //   x / z —— 把零件包围盒的 min 角落到 at[0] / at[2]（即 at 是**占地最小角**，不是中心）；
  //   y     —— 按 align 落到 at[1]（bottom = 最低点，center = 中心，top = 最高点）。
  // 旋转前后共用这条规则很关键：否则把一根横梁转 90° 之后，它的落位会莫名其妙偏移半个自身高度。
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const alignOffsetY =
    partDefinition.align === "center"
      ? partDefinition.at[1] - (bounds.min.y + bounds.max.y) / 2
      : partDefinition.align === "top"
        ? partDefinition.at[1] - bounds.max.y
        : partDefinition.at[1] - bounds.min.y;
  const anchorOffsetX = partDefinition.centered
    ? partDefinition.at[0] - (bounds.min.x + bounds.max.x) / 2
    : partDefinition.at[0] - bounds.min.x;
  const anchorOffsetZ = partDefinition.centered
    ? partDefinition.at[2] - (bounds.min.z + bounds.max.z) / 2
    : partDefinition.at[2] - bounds.min.z;
  geometry.translate(anchorOffsetX, alignOffsetY, anchorOffsetZ);
  // 环列是刚体变换（行列式为正），先做；镜像必须排在 mergeVertices **之后** —— 它要反转
  // 三角形绕序，而索引是 mergeVertices 建立起来的（见 mirrorGeometryX）。
  if (partDefinition.spin) {
    const { angle, radius, center } = partDefinition.spin;
    // 先把零件沿 +z 推到环半径上（这是基准位），再绕竖直轴转到自己的角度。
    geometry.translate(0, 0, radius);
    geometry.translate(-center[0], 0, -center[1]);
    geometry.rotateY(toRadians(angle));
    geometry.translate(center[0], 0, center[1]);
  }
  // 统一成带索引的几何：见 loadThree 里关于 mergeVertices 的说明。
  const merged = threeApi.mergeVertices(geometry, 1e-5);
  if (partDefinition.mirrorX) {
    mirrorGeometryX(merged);
  }
  return { geometry: merged };
}

/**
 * 把几何沿 x = 0 镜像。
 *
 * 两件事缺一不可：
 *   1. `scale(-1, 1, 1)` 同时变换顶点与法线（three 的法线矩阵对反射恰好等于反射本身）；
 *   2. **反转三角形绕序** —— 镜像的行列式为负，绕序跟着翻了。不翻回来，整块几何就是里外翻转的，
 *      背面剔除之后直接看不见（或者看起来「法线全黑」）。
 *
 * 刻意不用「坐标取反」代替：那种做法只对轴对齐的方盒成立，带旋转的零件（斜腿、外八脚）
 * 镜像后会朝错误的方向歪，而且错得不明显。
 */
function mirrorGeometryX(geometry) {
  geometry.scale(-1, 1, 1);
  const index = geometry.index;
  if (!index) {
    throw new Error("镜像要求几何带索引（mergeVertices 之后应恒为索引几何）");
  }
  for (let position = 0; position < index.count; position += 3) {
    const first = index.getX(position);
    index.setX(position, index.getX(position + 2));
    index.setX(position + 2, first);
  }
  index.needsUpdate = true;
  return geometry;
}

/**
 * 把一份模型规格构建成 three 的 Group。
 *
 * 规格形状：
 * ```
 * {
 *   slots: [{ color, roughness, metalness }],  // 下标即槽位号
 *   parts: [ part(...) ]
 * }
 * ```
 */
export async function buildModelGroup(modelSpec, variant) {
  const threeApi = await loadThree();
  const { mergeGeometries } = threeApi;
  const builtParts = [];
  for (const partDefinition of modelSpec.parts) {
    if (variant === "lite" && partDefinition.fullOnly === true) {
      continue;
    }
    const built = await createPartGeometry(threeApi, partDefinition, variant);
    builtParts.push({ slot: partDefinition.slot, ...built });
  }
  // 占地居中：运行侧把模型的**占地中心**当原点贴地（scaleBasis 描述的就是这块占地），
  // 所以横纵必须关于原点对称。放在这里统一做而不是让每条规格自己算 —— 规格只需要写「各零件
  // 相对彼此的尺寸」，不必同时心算一个全局偏移，也就不会再出现「腿在一处、座面在另一处」。
  // 只动 x / z：y 的零点是有语义的（地面），必须由规格自己写对，写错要报错而不是被悄悄抹平。
  if (builtParts.length) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const built of builtParts) {
      built.geometry.computeBoundingBox();
      minX = Math.min(minX, built.geometry.boundingBox.min.x);
      maxX = Math.max(maxX, built.geometry.boundingBox.max.x);
      minZ = Math.min(minZ, built.geometry.boundingBox.min.z);
      maxZ = Math.max(maxZ, built.geometry.boundingBox.max.z);
    }
    const centerOffsetX = -(minX + maxX) / 2;
    const centerOffsetZ = -(minZ + maxZ) / 2;
    if (Math.abs(centerOffsetX) > 1e-9 || Math.abs(centerOffsetZ) > 1e-9) {
      for (const built of builtParts) {
        built.geometry.translate(centerOffsetX, 0, centerOffsetZ);
      }
    }
  }
  const geometriesBySlot = new Map();
  for (const built of builtParts) {
    const bucket = geometriesBySlot.get(built.slot);
    if (bucket) {
      bucket.push(built.geometry);
    } else {
      geometriesBySlot.set(built.slot, [built.geometry]);
    }
  }
  const group = new threeApi.Group();
  for (const slot of [...geometriesBySlot.keys()].sort((left, right) => left - right)) {
    const slotDefinition = modelSpec.slots[slot] || modelSpec.slots[0];
    // 角色随材质名一起落盘：运行侧按角色把「这一个槽位」的实物语义认出来，
    // 再给它自己的颜色与质感（见 model-roles.mjs 的模块头）。
    const slotMaterialName = materialNameForSlot(slot, slotDefinition.role);
    const mesh = new threeApi.Mesh(
      mergeGeometries(geometriesBySlot.get(slot), false),
      new threeApi.MeshStandardMaterial({
        name: slotMaterialName,
        color: slotDefinition.color,
        roughness: slotDefinition.roughness ?? 0.6,
        metalness: slotDefinition.metalness ?? 0
      })
    );
    mesh.name = slotMaterialName;
    // 零件的位移与旋转都已烘进几何，网格节点保持在原点：导出的 GLB 里没有多余的节点变换。
    group.add(mesh);
  }
  return group;
}

/** 统计一个模型组的三角形与顶点数，用于顶点预算校验。 */
export function measureModelGroup(group) {
  let triangles = 0;
  let vertices = 0;
  group.traverse(object => {
    const geometry = object.geometry;
    if (!geometry) {
      return;
    }
    vertices += geometry.attributes.position.count;
    triangles += geometry.index
      ? geometry.index.count / 3
      : geometry.attributes.position.count / 3;
  });
  return { triangles: Math.round(triangles), vertices };
}

/** 导出 GLB（binary 模式）。 */
export async function exportGlb(group) {
  const GLTFExporter = await loadGltfExporter();
  const exporter = new GLTFExporter();
  const exported = await new Promise((resolve, reject) => {
    exporter.parse(group, resolve, reject, { binary: true, onlyVisible: false });
  });
  return Buffer.from(await toArrayBuffer(exported));
}
