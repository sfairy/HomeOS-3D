/**
 * 地面四边形的纯几何层：舞台把 3D 地板投影成 0~1 的四边形发上来，
 * 天气层用它把水花、涟漪、湿地反光、积雪精确地铺在真实地面上。
 *
 * 这里只有纯函数（不碰 DOM、不碰 canvas），便于单独校验：
 * 归一化、双线性插值、面积、屏幕纵向范围。
 */

/** 归一化屏幕坐标点（0~1，y 向下）。 */
export type GroundPoint = readonly [number, number];

/**
 * 地面四边形，顺序固定为「近左 → 近右 → 远右 → 远左」。
 *
 * 双线性插值时 `u` 沿近边、`v` 从近到远：(0,0) 是近左、(1,1) 是远右。
 */
export type WeatherGroundQuad = readonly [GroundPoint, GroundPoint, GroundPoint, GroundPoint];

/** 允许轻微越界：地面被相机切到画面外时，投影点可能略微超出 0~1。 */
const QUAD_COORD_LIMIT = 0.4;
/** 面积下限（归一化单位²）：再小就当成「地面几乎侧对镜头」，按无效处理。 */
const MIN_QUAD_AREA = 0.012;

/** 未收到舞台投影时的兜底地面：取画面下半部的一块梯形，够水花落地用。 */
export function fallbackGroundQuad(): WeatherGroundQuad {
  return [
    [0.02, 0.96],
    [0.98, 0.96],
    [0.82, 0.5],
    [0.18, 0.5],
  ];
}

function readPoint(input: unknown): GroundPoint | null {
  if (!Array.isArray(input) || input.length < 2) return null;
  const u = Number(input[0]);
  const v = Number(input[1]);
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  const limit = 0.5 + QUAD_COORD_LIMIT;
  if (Math.abs(u - 0.5) > limit || Math.abs(v - 0.5) > limit) return null;
  return [u, v];
}

/**
 * 校验并归一化舞台发来的地面四边形。
 *
 * 相机贴地或穿进地面时，四角投影会退化成一条线甚至自交；这类帧直接返回 null，
 * 让调用方沿用上一块有效地面，而不是让水花糊成一片。
 */
export function normalizeGroundQuad(input: unknown): WeatherGroundQuad | null {
  if (!Array.isArray(input) || input.length !== 4) return null;
  const points = input.map(readPoint);
  if (points.some((point) => point === null)) return null;
  const quad = points as unknown as WeatherGroundQuad;
  if (!isConvexQuad(quad)) return null;
  return quadArea(quad) >= MIN_QUAD_AREA ? quad : null;
}

function cross(from: GroundPoint, to: GroundPoint, next: GroundPoint) {
  return (to[0] - from[0]) * (next[1] - to[1]) - (to[1] - from[1]) * (next[0] - to[0]);
}

/** 四条边的转向必须同号：同号才是不自交的凸四边形。 */
function isConvexQuad(quad: WeatherGroundQuad) {
  const signs = quad.map((point, index) =>
    Math.sign(cross(point, quad[(index + 1) % 4], quad[(index + 2) % 4])),
  );
  return signs.every((sign) => sign !== 0 && sign === signs[0]);
}

/** 鞋带公式面积（归一化单位²）。 */
export function quadArea(quad: WeatherGroundQuad): number {
  let sum = 0;
  for (let index = 0; index < 4; index++) {
    const [x1, y1] = quad[index];
    const [x2, y2] = quad[(index + 1) % 4];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** 双线性插值：`u` 沿近边、`v` 从近到远，返回归一化屏幕坐标。 */
export function pointOnQuad(quad: WeatherGroundQuad, u: number, v: number): GroundPoint {
  const [nearLeft, nearRight, farRight, farLeft] = quad;
  const nearX = nearLeft[0] + (nearRight[0] - nearLeft[0]) * u;
  const nearY = nearLeft[1] + (nearRight[1] - nearLeft[1]) * u;
  const farX = farLeft[0] + (farRight[0] - farLeft[0]) * u;
  const farY = farLeft[1] + (farRight[1] - farLeft[1]) * u;
  return [nearX + (farX - nearX) * v, nearY + (farY - nearY) * v];
}

/** 四边形的屏幕纵向范围 `[minY, maxY]`，用于把屏幕高度换算成「远近」。 */
export function quadVerticalRange(quad: WeatherGroundQuad): readonly [number, number] {
  const ys = quad.map((point) => point[1]);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return maxY - minY < 0.02 ? [minY, minY + 0.02] : [minY, maxY];
}
