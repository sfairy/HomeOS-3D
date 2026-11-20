/**
 * 3D 视口编辑的几何计算（0.8.7 `studio-editor-3d.js` 中 `verticalRayParameter` /
 * `snapEditorElevation` / `projectedHeightHandle` 的对应实现）。
 *
 * 全部是纯函数：输入射线 / 平面 / 屏幕坐标，输出世界坐标或角度。
 * 交互层（`editor-3d-overlay.ts`）只负责事件与 DOM，几何错误不会藏在事件回调里。
 */

export type Vec3 = { x: number; y: number; z: number }
export type Ray = { origin: Vec3; direction: Vec3 }

/** 世界坐标（米）↔ 平面像素：原点与比例尺由 `createFloorWorldMapper` 给。 */
export interface PlanMapper {
  pixelsPerMeter: number
  origin: { x: number; y: number }
}

export function worldToPlan(mapper: PlanMapper, worldX: number, worldZ: number): { x: number; y: number } {
  return {
    x: worldX * mapper.pixelsPerMeter + mapper.origin.x,
    y: worldZ * mapper.pixelsPerMeter + mapper.origin.y,
  }
}

/** 射线与水平面 `y = planeY` 的交点；射线平行于平面或交点在背后时返回 `null`。 */
export function groundPointFromRay(ray: Ray, planeY: number): Vec3 | null {
  const directionY = ray.direction.y
  if (Math.abs(directionY) < 1e-6) return null
  const t = (planeY - ray.origin.y) / directionY
  if (!Number.isFinite(t) || t <= 0) return null
  return {
    x: ray.origin.x + ray.direction.x * t,
    y: planeY,
    z: ray.origin.z + ray.direction.z * t,
  }
}

function dotProduct(first: Vec3, second: Vec3): number {
  return first.x * second.x + first.y * second.y + first.z * second.z
}

/**
 * 射线与「过 `point`、方向为 `axis`」的直线最近点的参数（直线上的 t）。
 *
 * 轴与射线几乎平行时返回 `null`：那时整条轴退化成屏幕上的一个点，
 * 任何屏幕位移都对应无穷大的世界位移，拖动会直接飞掉。
 */
export function axisRayParameter(ray: Ray, point: Vec3, axis: Vec3): number | null {
  const along = dotProduct(ray.direction, axis)
  const denominator = 1 - along * along
  if (denominator < 0.00001) return null
  const offset = { x: point.x - ray.origin.x, y: point.y - ray.origin.y, z: point.z - ray.origin.z }
  return (along * dotProduct(ray.direction, offset) - dotProduct(axis, offset)) / denominator
}

/**
 * 离地高度手柄用的「竖直射线参数」（0.8.7 `verticalRayParameter`）。
 *
 * 手柄在屏幕上上下拖，但物件在世界上只能沿 Y 移动；把指针射线投影到过物件的竖直轴上，
 * 取参数差就是世界高度差。早期版本投影到「朝向相机的竖直平面」，相机接近俯视时平面
 * 与视线几乎平行，参数会剧烈放大 —— 这是「抬高时物件突然飞到天花板」的根因。
 */
export function verticalRayParameter(ray: Ray, point: Vec3): number | null {
  return axisRayParameter(ray, point, { x: 0, y: 1, z: 0 })
}

/** 世界高度 → 状态里的 `elevation`（米）。两者同量纲，保留函数是为了语义清楚。 */
export function elevationFromWorldY(worldY: number): number {
  return worldY
}

export type ElevationTarget = { value: number; label: string }

export type SnapElevationInput = {
  /** 未吸附的目标高度（米）。 */
  raw: number
  /** 拖动开始时的原始高度：按步长取整时以它为基准，避免累积误差。 */
  original: number
  minimum?: number
  maximum?: number
  /** 步长（米）；`0` 表示不量化。 */
  step?: number
  /** 吸附目标（贴合地面 / 落台 …），优先于步长。 */
  targets?: ElevationTarget[]
  /** 目标的吸附容差（米）。 */
  tolerance?: number
}

/**
 * 把离地高度吸附到「目标 > 步长 > 原值」。
 *
 * 目标优先且只在容差内命中：用户把物件拖到桌面上方 2cm 时应该落到桌面，
 * 拖到离桌面 40cm 时不该被吸过去。
 */
export function snapEditorElevation({
  raw,
  original,
  minimum = 0,
  maximum = 6,
  step = 0.05,
  targets = [],
  tolerance = 0,
}: SnapElevationInput): { value: number; label: string } {
  let value = raw
  let label = ''
  const nearest = targets
    .filter(
      (target) =>
        Number.isFinite(target.value) &&
        target.value >= minimum &&
        target.value <= maximum &&
        Math.abs(target.value - raw) <= tolerance,
    )
    .sort((first, second) => Math.abs(first.value - raw) - Math.abs(second.value - raw))[0]
  if (nearest) {
    value = nearest.value
    label = nearest.label
  } else if (step > 0) {
    value = Number((original + Math.round((raw - original) / step) * step).toFixed(12))
  }
  return { value: Math.max(minimum, Math.min(maximum, value)), label }
}

/** 旋转吸附：默认 15°，按住 Shift 关闭。 */
export function snapEditorRotation(degrees: number, step = 15, enabled = true): number {
  if (!enabled) return ((degrees % 360) + 360) % 360
  return (((Math.round(degrees / step) * step) % 360) + 360) % 360
}

/**
 * 高度手柄的屏幕几何：`base` 是物件顶面中心的投影，`tip` 是同一位置抬高 30px
 * 对应世界高度后的投影。
 *
 * @returns `angle`（弧度，0 = 正上方）与 `length`（像素）；长度小于 14px 时返回 `null`
 *          —— 手柄短到这个程度已经点不中，显示出来只会挡住物件。
 */
export function projectedHeightHandle(
  base: { x: number; y: number } | null,
  tip: { x: number; y: number } | null,
): { angle: number; length: number; tip: { x: number; y: number } } | null {
  if (!base || !tip) return null
  const deltaX = tip.x - base.x
  const deltaY = tip.y - base.y
  const length = Math.hypot(deltaX, deltaY)
  if (!Number.isFinite(length) || length < 14) return null
  return { angle: Math.atan2(deltaX, -deltaY), length, tip: { x: tip.x, y: tip.y } }
}

/**
 * 两个世界点在屏幕上的距离（像素）——「这个方向上 1m 等于多少 px」的通用换算。
 *
 * 相机右向与竖直方向的尺度**不同**：俯视时竖直方向几乎退化成 0，而右向不变。
 * 离地吸附容差必须用竖直方向（0.8.7 `gS()` 的 `point + (0,1,0)`），
 * 高度手柄臂长却用右向（`fS()`），混用会让吸附半径差好几倍。
 *
 * 任一投影失败（点在相机背后）返回 0，由调用方按「不可用」处理。
 */
export function projectedPixelsPerMeter(
  project: (world: Vec3) => { x: number; y: number } | null,
  from: Vec3,
  to: Vec3,
): number {
  const start = project(from)
  const end = project(to)
  if (!start || !end) return 0
  const distance = Math.hypot(end.x - start.x, end.y - start.y)
  return Number.isFinite(distance) ? distance : 0
}

/** 屏幕坐标 → 归一化设备坐标（-1..1，Y 轴翻转）。 */ export function screenToNdc(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  return {
    x: ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
    y: -((clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
  }
}
