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

/**
 * 允许轻微越界：地面被相机切到画面外时，投影点可能略微超出 0~1。
 *
 * 相机推进（低角度俯视或贴地）时，地板四角会远远落到画面外，四边形的坐标可以
 * 到 -3 或 4 这个量级。旧上限 0.4 会把这类帧整块丢掉，表现是「一靠近地面，
 * 水花就冻在上一个视角的位置」。越界本身由采样端跳过屏幕外的点来处理。
 */
const QUAD_COORD_LIMIT = 8;
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
  if (Math.abs(u - 0.5) > QUAD_COORD_LIMIT || Math.abs(v - 0.5) > QUAD_COORD_LIMIT) return null;
  return [u, v];
}

/**
 * 校验并把舞台发来的地面四边形转成「近左 → 近右 → 远右 → 远左」的口径。
 *
 * 舞台按**世界轴**顺序发角点（minX/minZ 起），相机绕户型转一圈时，屏幕上哪个角
 * 是「近」会变，世界顺序与屏幕远近没有固定关系。这里只做一件与相机无关的事：
 * 取平均 y 最大（最靠画面底部）的边为近边，再按 x 把两端排成左、右。
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
  return quadArea(quad) >= MIN_QUAD_AREA ? orientQuad(quad) : null;
}

/** 边的平均纵向位置；越大越靠近画面底部，也就是离相机越近。 */
function edgeAverageY(quad: WeatherGroundQuad, index: number) {
  return (quad[index][1] + quad[(index + 1) % 4][1]) / 2;
}

/** 边的屏幕长度（归一化坐标）。透视下同向的远边一定比近边短。 */
function edgeLength(quad: WeatherGroundQuad, index: number) {
  const [x1, y1] = quad[index];
  const [x2, y2] = quad[(index + 1) % 4];
  return Math.hypot(x2 - x1, y2 - y1);
}

/** 两条边的平均纵向位置相差在这个范围内时，认为它们在纵向上「打平」。 */
const NEAR_EDGE_TIE = 0.02;

/**
 * 近边下标。
 *
 * 主判据是中点更靠画面底部；但相机绕到 45° 时，地板的投影接近菱形，
 * **相邻两条边的中点纵向位置会几乎相同**（实测差 0.0005），这时只比 y 会选到
 * 一条侧边，`u/v` 方向随之歪掉。打平时改用边长决胜负：透视下近边一定比
 * 它对面的远边长，所以长度更大的那条才是近边。
 */
function pickNearEdgeIndex(quad: WeatherGroundQuad): number {
  let best = 0;
  for (let index = 1; index < 4; index += 1) {
    const deltaY = edgeAverageY(quad, index) - edgeAverageY(quad, best);
    if (deltaY > NEAR_EDGE_TIE) best = index;
    else if (Math.abs(deltaY) <= NEAR_EDGE_TIE && edgeLength(quad, index) > edgeLength(quad, best))
      best = index;
  }
  return best;
}

/**
 * 把任意起点的凸四边形重排成「近左 → 近右 → 远右 → 远左」。
 *
 * 近边确定后，剩下的两个角自然构成对边（远边）；左右顺序由近边两端的 x 决定，
 * 整个序列随之反向以保持四边形的绕向一致。
 */
function orientQuad(quad: WeatherGroundQuad): WeatherGroundQuad {
  const nearIndex = pickNearEdgeIndex(quad);
  const nearA = quad[nearIndex];
  const nearB = quad[(nearIndex + 1) % 4];
  const farB = quad[(nearIndex + 2) % 4];
  const farA = quad[(nearIndex + 3) % 4];
  return nearA[0] <= nearB[0] ? [nearA, nearB, farB, farA] : [nearB, nearA, farA, farB];
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

/**
 * 「近地面」的下限：四边形屏幕纵向范围的这个比例以下才算近处。
 *
 * 为什么按屏幕纵向位置、而不是四边形参数 `v`：相机绕户型转一圈时，地板投影在
 * 屏幕上是个**旋转的**四边形（常常接近菱形）。`v` 的方向跟着四边形一起转，
 * 于是同一个 `v` 一会儿表示「靠下」、一会儿表示「靠左」——按 `v` 加权时，
 * 水花会挤在画布中间，而不是画面下部（用户实际反馈）。
 * 按屏幕纵向位置取点，无论相机怎么转，水花与积雪都落在画面下部。
 */
export const NEAR_GROUND_BAND_START = 0.5;

/** 一个地面落点：`u/v` 是四边形参数（相机变动后据此重新投影），`x/y` 是归一化屏幕坐标。 */
export type GroundSample = {
  u: number;
  v: number;
  x: number;
  y: number;
  /** 远近系数：0 = 画面最上（远），1 = 画面最下（近）。 */
  depth: number;
};

/** 屏幕纵向位置 → 0~1 的远近系数：越靠画面底部越接近 1。 */
export function quadDepthAt(quad: WeatherGroundQuad, y: number): number {
  const [minY, maxY] = quadVerticalRange(quad);
  const depth = (y - minY) / (maxY - minY);
  return depth <= 0 ? 0 : depth >= 1 ? 1 : depth;
}

/**
 * 湿地 / 积雪的纵向覆盖范围 `[topY, bottomY]`：只铺四边形纵向范围里靠下的 `band` 段。
 *
 * 屏幕纵向是唯一与相机方位无关的「远近」轴（越靠下越近），所以地面上的大面积
 * 效果按纵向铺：上界之外完全不铺，上界处 alpha 为 0，画面里既看不到横向分界线，
 * 也不会像以前那样整块盖在地板中间。
 */
export function quadSheenSpan(
  quad: WeatherGroundQuad,
  band = 0.68,
): readonly [number, number] {
  const [minY, maxY] = quadVerticalRange(quad);
  const share = Math.min(1, Math.max(0.05, band));
  return [maxY - (maxY - minY) * share, maxY];
}

/** 「近地面」的屏幕纵向分界线（归一化 y）：只有低于它的区域才允许出现落点。 */
export function nearGroundCutY(
  quad: WeatherGroundQuad,
  bandStart = NEAR_GROUND_BAND_START,
): number {
  const [minY, maxY] = quadVerticalRange(quad);
  return minY + (maxY - minY) * Math.min(0.98, Math.max(0, bandStart));
}

/**
 * 固定序列的伪随机数（mulberry32）。
 *
 * 不用「乘法取模」的线性同余：它的连续两个输出在二维平面上会落在少数几条直线上
 * （谱测试失败），而这里恰好是**成对**取 `u/v` 的——落点会排成几条斜线，
 * 静态涟漪看起来像画出来的线，而不是随机溅在地上。
 */
export function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 在「靠画面底部的一段」里采一个落点。
 *
 * 先按 `u/v` 均匀采，再按屏幕纵向位置做拒绝采样：落在上半段的点直接丢弃。
 * 这样水花永远出现在画面下部，而 `u/v` 仍然参与双线性插值，相机移动后
 * 落点依然贴在同一块地板上。`attempts` 用完仍没采到就返回 null（这一滴不画），
 * 调用方不会因此卡住。
 */
export function sampleNearGroundPoint(
  quad: WeatherGroundQuad,
  random: () => number = Math.random,
  bandStart = NEAR_GROUND_BAND_START,
  attempts = 12,
): GroundSample | null {
  const cutY = nearGroundCutY(quad, bandStart);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const u = random();
    const v = random();
    const [x, y] = pointOnQuad(quad, u, v);
    if (y < cutY) continue;
    return { u, v, x, y, depth: quadDepthAt(quad, y) };
  }
  return null;
}
