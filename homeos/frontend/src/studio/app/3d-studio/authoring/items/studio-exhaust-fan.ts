/**
 * 排气扇的挂墙定位（0.8.0 `studio-exhaust-fan.js` 的等价实现）。
 *
 * 与门窗不同，排气扇是普通场景条目（`items`），它的洞口由自身位置反推：
 * - `snapExhaustFan` 把条目吸到最近的墙段中心线上（只认 `t ∈ [0,1]`、≤ 0.2 m）；
 * - `exhaustFanInstallation` 再按 84% 开洞，并检查洞口是否完整落在墙高内。
 *
 * 新建路径先 `{ orient: true }` 吸墙对齐，拖动路径保持当前朝向（`orient: false`），
 * 朝向没对齐时不会吸过去 —— 这是 0.8.0 的实际行为，不要合并成一种模式。
 */

type ExhaustFanWall = {
  id: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  thickness?: number;
  height?: number;
};

type ExhaustFanOpening = {
  id: string;
  wallId: string;
  t: number;
  width: number;
  height: number;
  sill: number;
};

type ExhaustFanInstallation = {
  wall: ExhaustFanWall;
  distance: number;
  opening: ExhaustFanOpening;
};

type ExhaustFanSnap = {
  wall: ExhaustFanWall;
  x: number;
  y: number;
  distance: number;
  angle: number;
};

const EXHAUST_FAN_TYPE = "exhaust-fan",
  /** 洞口宽度 / 高度占设备包围盒的比例（0.8.0 固定 84%）。 */
  OPENING_RATIO = 0.84,
  /** 设备中心允许偏离墙中心线的距离（米）。 */
  INSTALL_TOLERANCE = 0.012,
  /** 吸墙半径（米）。 */
  SNAP_RADIUS = 0.2,
  /** 朝向对齐的余弦阈值（约 2.6°）。 */
  ALIGN_COS = 0.999;

function wallMetrics(wall: ExhaustFanWall) {
  const deltaX = wall.end.x - wall.start.x,
    deltaY = wall.end.y - wall.start.y,
    length = Math.hypot(deltaX, deltaY);
  return { deltaX, deltaY, length };
}

/**
 * 计算排气扇在墙上的洞口。找不到合适的墙返回 `null`。
 *
 * `tolerance` 是「像素/米」（调用处统一 `getPixelsPerMeter() || 100`），
 * 因为 `item.x/y` 与墙体坐标都是像素。
 */
export function exhaustFanInstallation(
  item: any,
  walls: ExhaustFanWall[] = [],
  tolerance = 100,
  wallHeight = 2.8,
): ExhaustFanInstallation | null {
  if (item?.type !== EXHAUST_FAN_TYPE || !(tolerance > 0)) return null;
  const rotationRad = ((Number(item.rotation) || 0) * Math.PI) / 180;
  let bestInstallation: ExhaustFanInstallation | null = null;
  for (const wall of walls) {
    const { deltaX, deltaY, length } = wallMetrics(wall);
    if (!length) continue;
    /** 设备朝向必须与墙走向平行（正反都行）。 */
    if (Math.abs((Math.cos(rotationRad) * deltaX) / length + (Math.sin(rotationRad) * deltaY) / length) < ALIGN_COS)
      continue;
    const wallT = ((item.x - wall.start.x) * deltaX + (item.y - wall.start.y) * deltaY) / (length * length),
      distance = Math.abs((item.x - wall.start.x) * deltaY - (item.y - wall.start.y) * deltaX) / length / tolerance,
      openingWidth = (Number(item.width) || 0) * OPENING_RATIO,
      openingHeight = (Number(item.height) || 0) * OPENING_RATIO,
      sill = (Number(item.elevation) || 0) + (Number(item.height) || 0) * 0.08;
    if (
      distance > INSTALL_TOLERANCE ||
      (wallT * length) / tolerance < openingWidth / 2 ||
      ((1 - wallT) * length) / tolerance < openingWidth / 2 ||
      sill < 0 ||
      sill + openingHeight > (wall.height || wallHeight)
    )
      continue;
    if (!bestInstallation || distance < bestInstallation.distance)
      bestInstallation = {
        wall,
        distance,
        opening: {
          id: "exhaust:" + item.id,
          wallId: wall.id,
          t: wallT,
          width: openingWidth,
          height: openingHeight,
          sill,
        },
      };
  }
  return bestInstallation;
}

/**
 * 把排气扇吸到最近的墙中心线上并写回 `x/y/depth`（以及可选的 `rotation`）。
 *
 * 返回命中的墙段信息（供调用方判断是否真的贴上了墙），未命中返回 `null`。
 */
export function snapExhaustFan(
  item: any,
  walls: ExhaustFanWall[] = [],
  tolerance = 100,
  { orient = false }: { orient?: boolean } = {},
): ExhaustFanSnap | null {
  if (item?.type !== EXHAUST_FAN_TYPE || !(tolerance > 0)) return null;
  let bestSnap: ExhaustFanSnap | null = null;
  for (const wall of walls) {
    const { deltaX, deltaY, length } = wallMetrics(wall);
    if (!length) continue;
    const wallT = ((item.x - wall.start.x) * deltaX + (item.y - wall.start.y) * deltaY) / (length * length),
      projectedX = wall.start.x + deltaX * wallT,
      projectedY = wall.start.y + deltaY * wallT,
      distance = Math.hypot(item.x - projectedX, item.y - projectedY) / tolerance,
      angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
    if (
      wallT < 0 ||
      wallT > 1 ||
      distance > SNAP_RADIUS ||
      (!orient && Math.abs(Math.cos((((item.rotation || 0) - angle) * Math.PI) / 180)) < ALIGN_COS)
    )
      continue;
    if (!bestSnap || distance < bestSnap.distance)
      bestSnap = { wall, x: projectedX, y: projectedY, distance, angle };
  }
  if (!bestSnap) return null;
  item.x = bestSnap.x;
  item.y = bestSnap.y;
  item.depth = bestSnap.wall.thickness || 0.16;
  orient && (item.rotation = bestSnap.angle);
  return bestSnap;
}

/**
 * 把一批排气扇条目换算成墙体洞口：`buildInteriorScene` 与占位冲突检查共用。
 *
 * 与 `snapExhaustFan` 不同，这里**不改**条目，只读当前位置。
 */
export function collectExhaustFanOpenings(
  items: any[] = [],
  walls: ExhaustFanWall[] = [],
  tolerance = 100,
  wallHeight = 2.8,
): { item: any; installation: ExhaustFanInstallation }[] {
  const results: { item: any; installation: ExhaustFanInstallation }[] = [];
  for (const item of items) {
    if (item?.type !== EXHAUST_FAN_TYPE) continue;
    const installation = exhaustFanInstallation(item, walls, tolerance, wallHeight);
    installation && results.push({ item, installation });
  }
  return results;
}
