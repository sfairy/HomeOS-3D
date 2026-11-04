/**
 * 墙体轮廓并集的**保守回退**（纯函数，不依赖 three）。
 *
 * `validatedUnionPolygonLoops` 一旦判定输入「有歧义 / 自交 / 顶点数对不上」就直接返回
 * 空数组。调用方原来的做法是把**原始环**原样丢给挤出：于是两段相互重叠的墙各自画
 * 一层双面半透明壳，重叠处比别处亮一档 —— 现场表现就是「接缝 / 重影 / 亮边」。
 *
 * 这里给出一个不会把墙画丢的回退：只丢掉**被其它环完全包住**的环（它在轮廓上不贡献
 * 任何面积，但会叠一层膜）；真正交叉的两个环（T 字墙）保持原样 —— 宁可留一条细缝，
 * 也不能把一面墙整段删掉。
 *
 * 失败次数对外暴露（`wallUnionFallbackCount`），由宿主写进
 * `renderer.domElement.dataset.wallUnionFallbacks`，验收脚本不用开控制台就能读到。
 */

/** 平面环（与 `plan/geometry` 的环同构，只要求 x / y）。 */
export type WallPlanLoop = { x: number; y: number }[];

let wallUnionFallbackTotal = 0;

/** 墙体并集失败的累计次数（本页生命周期）。 */
export function wallUnionFallbackCount() {
  return wallUnionFallbackTotal;
}

/** 只给测试用：把计数清零。 */
export function resetWallUnionFallbackCount() {
  wallUnionFallbackTotal = 0;
}

function polygonSignedArea(loop: WallPlanLoop) {
  let area = 0;
  for (let index = 0; index < loop.length; index += 1) {
    const current = loop[index],
      next = loop[(index + 1) % loop.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

/** 射线法：点是否在多边形内部（环坐标是平面米制）。 */
export function pointInsideWallLoop(point: { x: number; y: number }, loop: WallPlanLoop) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
    const current = loop[i],
      previous = loop[j],
      crossesRay =
        current.y > point.y !== previous.y > point.y &&
        point.x <
          ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y || 1e-12) +
            current.x;
    crossesRay && (inside = !inside);
  }
  return inside;
}

/**
 * 丢掉被其它环完全包住的环；全部被包住时保持原样（绝不让整组消失）。
 *
 * 判定是「**所有顶点**都落在另一个环内」，不是只看重心：T 字拼接的两个环重心可能
 * 都落在对方内部，只比重心会把一面墙整段删掉。
 */
export function dropContainedWallLoops<T extends WallPlanLoop>(loopList: T[]): T[] {
  if (loopList.length <= 1) return loopList;
  const entries = loopList.map((loop) => ({ loop, area: Math.abs(polygonSignedArea(loop)) })),
    contained = new Set<(typeof entries)[number]>();
  for (const candidate of entries) {
    if (contained.has(candidate)) continue;
    for (const hostEntry of entries) {
      if (hostEntry === candidate || contained.has(hostEntry)) continue;
      const fullyInside =
        hostEntry.area >= candidate.area &&
        candidate.loop.every((vertex) => pointInsideWallLoop(vertex, hostEntry.loop));
      if (fullyInside) {
        contained.add(candidate);
        break;
      }
    }
  }
  const keptLoops = entries.filter((entry) => !contained.has(entry)).map((entry) => entry.loop);
  return keptLoops.length ? keptLoops : loopList;
}

/** 记录一次并集失败并返回保守回退后的环。 */
export function recordWallUnionFallback<T extends WallPlanLoop>(loopList: T[]): T[] {
  wallUnionFallbackTotal += 1;
  return dropContainedWallLoops(loopList);
}
