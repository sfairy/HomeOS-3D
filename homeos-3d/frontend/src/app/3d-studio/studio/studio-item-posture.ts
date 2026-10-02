/**
 * 立柱造型（pillarShape）与立柱 / 灯带布置轴（pillarAxis / stripAxis）的共用口径。
 *
 * 口径来自 0.6.5 的模型属性：立柱有 5 种造型（方形 / 圆形 / 半圆 / 1/4 圆 / 1/4 内弧）；
 * 立柱与灯带各有一条「立 / 躺」轴。轴会同时影响三件事，必须同步：
 *   - 三维姿态：躺倒的立柱绕 X 转 -90°、立起的灯带绕 Z 转 +90°，并落到地面；
 *   - 平面占位：姿态换位后平面能占的那块地，不再是 width × depth；
 *   - 检查器：字段显隐、轴相关的标签与「按占位缩放」的换算。
 */
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";

/** 立柱可选造型；非法值一律兜底成 "square"。 */
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

/**
 * 平面占位（单位：米）。姿态会让物件的长度轴与房间换位，故平面占位不能一律直接取 width / depth：
 *   立姿立柱取横截面（宽 × 深），躺姿立柱的「长」落在 height 上，占的是 宽 × 长；
 *   平躺灯带取 发光长度 × 发光宽度，立起来的灯带只剩 高 × 发光宽度 那块地。
 */
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
    // resized.depth 才是新的长度；resized.height 仍是拖拽前的旧长度，必须丢弃。
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

/** 为立柱轮廓描一段弧。调用方需已把画笔移到弧的起点。 */
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

/** 立柱截面轮廓（three 的 Shape，单位米，中心在原点）。方形以外的造型由它挤出。 */
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
    path.moveTo(-halfWidth, halfDepth);
    path.lineTo(halfWidth, halfDepth);
    appendPillarOutlineArc(path, 0, halfDepth, halfWidth, depth, 0, -Math.PI, 32);
    return path;
  }
  if (shape === "quarter") {
    path.moveTo(-halfWidth, halfDepth);
    path.lineTo(halfWidth, halfDepth);
    appendPillarOutlineArc(path, -halfWidth, halfDepth, width, depth, 0, -Math.PI / 2, 32);
    return path;
  }
  if (shape === "quarterinner") {
    // 在同一占位内与 "quarter" 互补：凹弧从远端角切进来。
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

/**
 * 为非方形造型生成封闭无缝隙的立柱实体。结果与方盒采用同一套约定：
 * 几何中心在原点、沿 Y 轴高 height，因此调用方仍按 BoxGeometry 那样把网格抬到 height / 2。
 */
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

/**
 * 按布置轴摆正已建好的物件：躺倒的立柱绕 X 转 -90°、立起的灯带绕 Z 转 +90°，
 * 再把整组推回原处——躺姿让底面贴地并沿进深居中，立姿让发光面贴地并沿平面居中。
 */
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
  /** 需要的居中位移量；包围盒无效时为 0。 */
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
    // 平直边落在背面（-y），且弧的起点正好接在直线终点上。
    plan2dContext.moveTo(-halfWidth, -halfDepth);
    plan2dContext.lineTo(halfWidth, -halfDepth);
    plan2dContext.ellipse(0, -halfDepth, halfWidth, depthPx, 0, 0, Math.PI, false);
    return;
  }
  if (shape === "quarter") {
    plan2dContext.moveTo(-halfWidth, -halfDepth);
    plan2dContext.lineTo(halfWidth, -halfDepth);
    plan2dContext.ellipse(-halfWidth, -halfDepth, widthPx, depthPx, 0, 0, Math.PI / 2, false);
    plan2dContext.closePath();
    return;
  }
  if (shape === "quarterinner") {
    // quarter 的镜像：顶点相同，但弧朝回收，使符号成为其互补形。
    plan2dContext.moveTo(halfWidth, -halfDepth);
    plan2dContext.lineTo(halfWidth, halfDepth);
    plan2dContext.lineTo(-halfWidth, halfDepth);
    plan2dContext.ellipse(-halfWidth, -halfDepth, widthPx, depthPx, 0, Math.PI / 2, 0, true);
    return;
  }
  plan2dContext.rect(-halfWidth, -halfDepth, widthPx, depthPx);
}
