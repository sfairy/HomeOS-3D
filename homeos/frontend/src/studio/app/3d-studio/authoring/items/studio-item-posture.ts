/** 立柱造型（pillarShape）与立柱 / 灯带布置轴（pillarAxis / stripAxis）的共用口径。 */
import * as threeModuleMin from "/static/vendor/three/0.186.1/three.module.min.js";

/** 立柱可选造型； */
const PILLAR_SHAPES = ["square", "round", "semicircle", "quarter", "quarterinner"];

/** 立柱 / 灯带的布置轴：vertical 立姿，horizontal 躺姿。 */
const ITEM_AXES = ["vertical", "horizontal"];

export const DEFAULT_PILLAR_SHAPE = "square";
/** 立柱出厂即站立。 */
export const DEFAULT_PILLAR_AXIS = "vertical";
/** 灯带出厂即平躺。 */
export const DEFAULT_STRIP_AXIS = "horizontal";

const pillarShapeSet = new Set(PILLAR_SHAPES);
const itemAxisSet = new Set(ITEM_AXES);

const toFiniteNumber = (rawValue: any, fallback: number) =>
  rawValue !== null && rawValue !== "" && Number.isFinite(Number(rawValue))
    ? Number(rawValue)
    : fallback;

export function normalizePillarShape(rawShape: any) {
  return pillarShapeSet.has(rawShape) ? rawShape : DEFAULT_PILLAR_SHAPE;
}

export function normalizePillarAxis(rawAxis: any) {
  return itemAxisSet.has(rawAxis) ? rawAxis : DEFAULT_PILLAR_AXIS;
}

export function normalizeStripAxis(rawAxis: any) {
  return itemAxisSet.has(rawAxis) ? rawAxis : DEFAULT_STRIP_AXIS;
}

/** 立柱是否处于躺姿（而非立姿）。 */
export function pillarIsLying(item: any) {
  return item?.type === "pillar" && normalizePillarAxis(item.pillarAxis) === "horizontal";
}

/** 灯带是否处于立姿（而非平躺）。 */
export function stripIsStanding(item: any) {
  return item?.type === "striplight" && normalizeStripAxis(item.stripAxis) === "vertical";
}

/** 平面占位是否无法直接用「宽 x 深」表示、必须另行推导。 */
function itemFootprintSwapped(item: any) {
  return pillarIsLying(item) || stripIsStanding(item);
}

/** 平面占位（单位：米）。 */
export function itemPlanFootprint(item: any) {
  if (pillarIsLying(item)) {
    return {
      width: toFiniteNumber(item?.width, 0),
      depth: toFiniteNumber(item?.height, 0),
    };
  }
  if (stripIsStanding(item)) {
    return {
      width: toFiniteNumber(item?.height, 0),
      depth: toFiniteNumber(item?.depth, 0),
    };
  }
  return {
    width: toFiniteNumber(item?.width, 0),
    depth: toFiniteNumber(item?.depth, 0),
  };
}

/**
 * 平面占位 / 缩放只读到的物件字段子集。
 *
 * 这一族辅助函数只读 `type` / 姿态 / 摆放 / 尺寸，就用结构类型收口，不再新开宽松标注
 * ——显式宽松类型有「只许变少」的棘轮门禁（`ops/checks/` 下的基线检查）。
 */
type PlanFootprintItem = {
  type?: string;
  pillarShape?: string;
  pillarAxis?: string;
  stripAxis?: string;
  x?: number;
  y?: number;
  rotation?: number;
  width?: number;
  depth?: number;
  height?: number;
};

/** 把「平面局部偏移」按摆放角度转到平面世界坐标（与 `rotateLocalPoint` 同口径）。 */
function rotatePlanLocalOffset(item: PlanFootprintItem, localOffset: { x: number; y: number }) {
  const rotationRad = ((Number(item?.rotation) || 0) * Math.PI) / 180;
  if (!rotationRad) return { x: localOffset.x, y: localOffset.y };
  const rotationCos = Math.cos(rotationRad),
    rotationSin = Math.sin(rotationRad);
  return {
    x: localOffset.x * rotationCos - localOffset.y * rotationSin,
    y: localOffset.x * rotationSin + localOffset.y * rotationCos,
  };
}

/**
 * 平面占位盒中心相对**摆放锚点**的局部偏移（米）。
 *
 * 半圆柱 / 四分之一圆柱的锚点是圆弧圆心（`scripts/models/recenter-pillar-arc.mjs`，
 * 运行期 `preserveOrigin`），实体只朝 +x / +y（世界 +z）一侧长：半圆柱的占位盒中心在
 * 直径面前半个进深处，四分之一圆柱在 +x / +y 方向各半个占位处。其余造型的锚点就是
 * 占位中心，偏移为零。
 *
 * 选中框、角手柄、点选判定、框选与拖拽缩放都必须走这一份偏移，否则「框」和「形状」
 * 差半个进深 —— 画面上就是选中后框歪在一边。
 */
export function itemPlanFootprintOffset(item: PlanFootprintItem) {
  if (item?.type !== "pillar" || pillarIsLying(item)) return { x: 0, y: 0 };
  const pillarShape = normalizePillarShape(item?.pillarShape);
  if (pillarShape !== "semicircle" && pillarShape !== "quarter") return { x: 0, y: 0 };
  const footprint = itemPlanFootprint(item);
  return {
    x: pillarShape === "quarter" ? footprint.width / 2 : 0,
    y: footprint.depth / 2,
  };
}

/**
 * 平面占位盒中心（平面像素坐标 = `item.x / y` 的口径）。
 *
 * `item.x / y` 是**平面像素**，而偏移是**米**：这里必须乘 `pixelsPerMeter` 再相加。
 * 少乘一次只会挪「1 像素 / 米」，框与形状就整体差半个进深 —— 手柄、点选、缩放全都
 * 跟着错位，而且缩放时锚点会被写成框中心，每拖一次形状就跳走。
 */
export function itemPlanFootprintCenter(item: PlanFootprintItem, pixelsPerMeter: number) {
  const anchorX = toFiniteNumber(item?.x, 0),
    anchorY = toFiniteNumber(item?.y, 0),
    localOffset = itemPlanFootprintOffset(item);
  if (!localOffset.x && !localOffset.y) return { x: anchorX, y: anchorY };
  const offsetScale = toFiniteNumber(pixelsPerMeter, 1) > 0 ? Number(pixelsPerMeter) : 1,
    worldOffset = rotatePlanLocalOffset(item, localOffset);
  return {
    x: anchorX + worldOffset.x * offsetScale,
    y: anchorY + worldOffset.y * offsetScale,
  };
}

/**
 * 返回**平面占位矩形**：宽 / 深按当前姿态换算，x / y 挪到占位盒中心。
 *
 * 注意 x / y 已不是摆放锚点：半圆柱 / 四分之一圆柱的锚点在圆弧圆心，占位盒整体偏出
 * 半个进深。命中判定、框选、角手柄与拖拽缩放都按「框」工作，所以统一从这里取框。
 */
export function itemWithPlanFootprint(item: any, pixelsPerMeter: number) {
  const footprint = itemPlanFootprint(item),
    center = itemPlanFootprintCenter(item, pixelsPerMeter);
  if (!itemFootprintSwapped(item) && center.x === item.x && center.y === item.y) {
    return item;
  }
  return {
    ...item,
    width: footprint.width,
    depth: footprint.depth,
    x: center.x,
    y: center.y,
  };
}

/**
 * 把「按平面占位缩放」的结果换算回物件在当前姿态下的标准字段（x / y 回到锚点）。
 *
 * `resized` 来自 `resizeRotatedItemFromCorner`，**只有 x / y / 宽 / 深**，没有造型与姿态
 * 字段。所以偏移必须拿「原物件 + 新尺寸」合并后再算：直接用 `resized` 算，造型判不出来、
 * 偏移恒为 0，锚点会被写成占位框中心 —— 半圆柱 / 四分之一圆柱每拖一次框就整体错开半个
 * 占位（框还在原地，形状却跳走），四条角手柄也跟着离开指针。
 */
export function itemFromPlanFootprintResize(item: any, resized: any, pixelsPerMeter: number) {
  // 先把「占位矩形」按当前姿态换回宽 / 深 / 高（躺姿立柱与立姿灯带的宽深要对调）。
  let resizedItem = resized;
  if (pillarIsLying(item)) {
    const { height: ignoredHeight, ...rest } = resized;
    resizedItem = {
      ...rest,
      height: toFiniteNumber(resized?.depth, toFiniteNumber(item?.height, 0)),
      depth: toFiniteNumber(item?.depth, toFiniteNumber(resized?.depth, 0.1)),
    };
  } else if (stripIsStanding(item)) {
    resizedItem = {
      ...resized,
      // 立姿灯带的平面「宽」就是灯带长度（`item.height`），平面「深」才是 `item.depth`；
      // 灯的自身厚度 `item.width` 不由平面框驱动。把 height 抄回旧值会让左右拖动完全失效。
      width: toFiniteNumber(item?.width, 0),
      height: toFiniteNumber(resized?.width, toFiniteNumber(item?.height, 0)),
    };
  }
  const footprintItem = { ...item, ...resizedItem },
    localOffset = itemPlanFootprintOffset(footprintItem);
  if (!localOffset.x && !localOffset.y) return resizedItem;
  // `resized.x / y` 是新的占位盒中心（平面像素），减掉新占位盒的偏移（米 × ppm）才是锚点。
  const offsetScale = toFiniteNumber(pixelsPerMeter, 1) > 0 ? Number(pixelsPerMeter) : 1,
    worldOffset = rotatePlanLocalOffset(footprintItem, localOffset);
  return {
    ...resizedItem,
    x: toFiniteNumber(resized?.x, resizedItem.x) - worldOffset.x * offsetScale,
    y: toFiniteNumber(resized?.y, resizedItem.y) - worldOffset.y * offsetScale,
  };
}

/** 为立柱轮廓描一段弧。 */
function appendPillarOutlineArc(
  path: any,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  startAngle: number,
  endAngle: number,
  segments: number,
) {
  for (let arcStep = 1; arcStep <= segments; arcStep += 1) {
    const arcAngle = startAngle + ((endAngle - startAngle) * arcStep) / segments;
    path.lineTo(centerX + Math.cos(arcAngle) * radiusX, centerY + Math.sin(arcAngle) * radiusY);
  }
}

/**
 * 立柱截面轮廓（three 的 Shape，单位米）。
 *
 * 原点口径与资产一致（见 `scripts/models/recenter-pillar-arc.mjs`）：
 * - `semicircle` / `quarter` 以**圆弧圆心**为原点 —— 半圆柱的圆心在直径面（墙线）上，
 *   四分之一圆柱的圆心在两片平背面相交的转角上；
 * - `round` / `square` / `quarterinner` 仍以包围盒中心为原点。
 *
 * Shape 的 y 经 `buildPillarSolidGeometry` 的 `rotateX(-π/2)` 映射到世界 -z，
 * 所以「弧朝 +z 鼓」在这里写成「弧朝 -y 鼓」。
 */
function buildPillarOutline(shape: any, width: number, depth: number) {
  const path = new threeModuleMin.Shape();
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  if (shape === "round") {
    path.moveTo(halfWidth, 0);
    appendPillarOutlineArc(path, 0, 0, halfWidth, halfDepth, 0, Math.PI * 2, 64);
    return path;
  }
  if (shape === "semicircle") {
    path.moveTo(-halfWidth, 0);
    path.lineTo(halfWidth, 0);
    appendPillarOutlineArc(path, 0, 0, halfWidth, depth, 0, -Math.PI, 32);
    return path;
  }
  if (shape === "quarter") {
    path.moveTo(0, 0);
    path.lineTo(width, 0);
    appendPillarOutlineArc(path, 0, 0, width, depth, 0, -Math.PI / 2, 32);
    return path;
  }
  if (shape === "quarterinner") {

    path.moveTo(halfWidth, halfDepth);
    path.lineTo(halfWidth, -halfDepth);
    path.lineTo(-halfWidth, -halfDepth);
    appendPillarOutlineArc(path, -halfWidth, halfDepth, width, depth, -Math.PI / 2, 0, 32);
    return path;
  }
  path.moveTo(-halfWidth, -halfDepth);
  path.lineTo(halfWidth, -halfDepth);
  path.lineTo(halfWidth, halfDepth);
  path.lineTo(-halfWidth, halfDepth);
  return path;
}

/** 为非方形造型生成封闭无缝隙的立柱实体。 */
export function buildPillarSolidGeometry(shape: any, width: number, depth: number, height: number) {
  const solidGeometry = new threeModuleMin.ExtrudeGeometry(
    buildPillarOutline(shape, width, depth),
    {
      depth: height,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1,
    },
  );
  solidGeometry.rotateX(-Math.PI / 2);
  solidGeometry.translate(0, -height / 2, 0);
  solidGeometry.computeVertexNormals();
  return solidGeometry;
}

/** 按布置轴摆正已建好的物件：躺倒的立柱绕 X 转 -90°、立起的灯带绕 Z 转 +90°，再把整组推回原处——躺姿让底面贴地并沿进深居中，立姿让发光面贴地并沿平面居中。 */
export function applyItemPosture(group: any, item: any) {
  const lyingPillar = pillarIsLying(item);
  const standingStrip = stripIsStanding(item);
  if ((!lyingPillar && !standingStrip) || !group.children.length) {
    return;
  }
  const posturePivot = new threeModuleMin.Group();
  for (const postureChild of [...group.children]) {
    posturePivot.add(postureChild);
  }
  posturePivot.rotation[lyingPillar ? "x" : "z"] = lyingPillar ? -Math.PI / 2 : Math.PI / 2;
  posturePivot.updateMatrixWorld(true);
  const pivotContent = new threeModuleMin.Box3().setFromObject(posturePivot);
  /** 需要的居中位移量； */
  const pivotCenterOf = (minValue: any, maxValue: any) =>
    Number.isFinite(minValue) && Number.isFinite(maxValue) ? -(minValue + maxValue) / 2 : 0;
  if (lyingPillar) {
    posturePivot.position.set(
      0,
      Number.isFinite(pivotContent.min.y) ? -pivotContent.min.y : 0,
      pivotCenterOf(pivotContent.min.z, pivotContent.max.z),
    );
  } else {
    posturePivot.position.set(
      pivotCenterOf(pivotContent.min.x, pivotContent.max.x),
      Number.isFinite(pivotContent.max.y) ? -pivotContent.max.y : 0,
      pivotCenterOf(pivotContent.min.z, pivotContent.max.z),
    );
  }
  group.add(posturePivot);
}

/** 平面画布版的 buildPillarOutline：平面 +y 对应世界 +z，因此平直面始终留在背面。 */
/**
 * 平面符号的立柱轮廓：原点与 3D 资产同口径 —— 半圆柱 / 四分之一圆柱以**圆弧圆心**为
 * 落笔原点（`scripts/models/recenter-pillar-arc.mjs`），其余造型仍以包围盒中心为原点。
 *
 * 画布 y 与 3D 世界的 +z 同向（既有符号把平背面画在 -y、弧朝 +y 鼓）。
 */
export function tracePillarPlanPath(
  plan2dContext: any,
  shape: any,
  widthPx: number,
  depthPx: number,
) {
  const halfWidth = widthPx / 2;
  const halfDepth = depthPx / 2;
  plan2dContext.beginPath();
  if (shape === "round") {
    plan2dContext.ellipse(0, 0, halfWidth, halfDepth, 0, 0, Math.PI * 2);
    return;
  }
  if (shape === "semicircle") {
    // 圆心即原点、平背面是过圆心的直径面（墙线），弧朝 +y（世界 +z）鼓。
    plan2dContext.moveTo(-halfWidth, 0);
    plan2dContext.lineTo(halfWidth, 0);
    plan2dContext.ellipse(0, 0, halfWidth, depthPx, 0, 0, Math.PI, false);
    return;
  }
  if (shape === "quarter") {
    // 圆心即原点、两块平背面分别贴 x=0 / y=0，占位落在 +x/+y 象限。
    plan2dContext.moveTo(0, 0);
    plan2dContext.lineTo(widthPx, 0);
    plan2dContext.ellipse(0, 0, widthPx, depthPx, 0, 0, Math.PI / 2, false);
    plan2dContext.closePath();
    return;
  }
  if (shape === "quarterinner") {

    plan2dContext.moveTo(halfWidth, -halfDepth);
    plan2dContext.lineTo(halfWidth, halfDepth);
    plan2dContext.lineTo(-halfWidth, halfDepth);
    plan2dContext.ellipse(-halfWidth, -halfDepth, widthPx, depthPx, 0, Math.PI / 2, 0, true);
    return;
  }
  plan2dContext.rect(-halfWidth, -halfDepth, widthPx, depthPx);
}
