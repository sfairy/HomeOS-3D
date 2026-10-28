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

/** 返回同一个物件，但把平面占位写进 width / depth，供整件级别的辅助函数使用。 */
export function itemWithPlanFootprint(item: any) {
  if (!itemFootprintSwapped(item)) {
    return item;
  }
  const footprint = itemPlanFootprint(item);
  return {
    ...item,
    width: footprint.width,
    depth: footprint.depth,
  };
}

/** 把「按平面占位缩放」的结果换算回物件在当前姿态下的标准字段。 */
export function itemFromPlanFootprintResize(item: any, resized: any) {
  if (pillarIsLying(item)) {

    const { height: ignoredHeight, ...rest } = resized;
    return {
      ...rest,
      height: toFiniteNumber(resized?.depth, toFiniteNumber(item?.height, 0)),
      depth: toFiniteNumber(item?.depth, toFiniteNumber(resized?.depth, 0.1)),
    };
  }
  if (stripIsStanding(item)) {
    return {
      ...resized,
      width: toFiniteNumber(item?.width, 0),
      height: toFiniteNumber(item?.height, 0),
    };
  }
  return resized;
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
