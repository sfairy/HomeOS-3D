/**
 * 灯带的三轴方向操作（0.8.7 `studio-editor-light-gizmo.js` 的几何部分）。
 *
 * 灯带和普通物件不同：它除了位置，还有三个彼此独立的角度。
 * - `rotation`            平面方向（绕竖轴转，决定灯带沿着哪面墙）
 * - `verticalRotation`    安装倾斜（绕长度轴外的那根水平轴，决定发光面倾角）
 * - `stripRollRotation`   出光方向（绕长度轴翻滚，决定朝上 / 朝下 / 洗墙）
 *
 * 0.8.7 用四元数把三轴叠成 `yaw → installation → emission`；这里用等价的向量旋转实现，
 * 避免把 three 引入纯几何模块（圆环投影与角度换算要能单独断言）。
 * 顺序必须与 `strip-light-spec.ts` 的渲染顺序一致，否则工具条上的「正角度」会与实际方向相反。
 */
import type { Ray, Vec3 } from './editor-3d-gesture'

export type LightAxis = 'rotation' | 'verticalRotation' | 'stripRollRotation'

export const LIGHT_AXIS_LABELS: Record<LightAxis, string> = {
  rotation: '平面方向',
  verticalRotation: '安装倾斜',
  stripRollRotation: '出光方向',
}

/** 灯带位姿字段（只读需要的）。 */
export interface LightPoseLike {
  type?: unknown
  rotation?: unknown
  verticalRotation?: unknown
  stripRollRotation?: unknown
  stripMount?: unknown
  elevation?: unknown
  x?: unknown
  y?: unknown
}

export type LightFrame = {
  /** 长度轴（出光方向环的旋转轴）。 */
  longAxis: Vec3
  /** 发光面法线（平面方向环的参考轴）。 */
  normalAxis: Vec3
  /** 安装轴（竖直方向经安装旋转后的朝向）。 */
  upAxis: Vec3
  /** 安装倾斜环的旋转轴。 */
  tiltAxis: Vec3
}

function finite(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360
}

function cross(first: Vec3, second: Vec3): Vec3 {
  return {
    x: first.y * second.z - first.z * second.y,
    y: first.z * second.x - first.x * second.z,
    z: first.x * second.y - first.y * second.x,
  }
}

function dot(first: Vec3, second: Vec3): number {
  return first.x * second.x + first.y * second.y + first.z * second.z
}

/** 罗德里格斯公式：把向量绕单位轴转 `angleRadians`。 */
export function rotateAroundAxis(vector: Vec3, axis: Vec3, angleRadians: number): Vec3 {
  const cos = Math.cos(angleRadians)
  const sin = Math.sin(angleRadians)
  const term1 = { x: vector.x * cos, y: vector.y * cos, z: vector.z * cos }
  const term2 = cross(axis, vector)
  const term3 = dot(axis, vector) * (1 - cos)
  return {
    x: term1.x + term2.x * sin + axis.x * term3,
    y: term1.y + term2.y * sin + axis.y * term3,
    z: term1.z + term2.z * sin + axis.z * term3,
  }
}

const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 }

/**
 * 射线与「过 `point`、法线为 `normal`」的平面求交。
 *
 * 法线与射线的夹角余量取 0.035（约 2°）：再平就求不出稳定的交点，
 * 硬算会把指针位置放大成几十米外的点。
 */
export function planeRayPoint(ray: Ray, point: Vec3, normal: Vec3): Vec3 | null {
  const denominator = dot(normal, ray.direction)
  if (Math.abs(denominator) < 0.035) return null
  const offset = { x: point.x - ray.origin.x, y: point.y - ray.origin.y, z: point.z - ray.origin.z }
  const t = dot(offset, normal) / denominator
  if (!Number.isFinite(t) || t < 0) return null
  return {
    x: ray.origin.x + ray.direction.x * t,
    y: ray.origin.y + ray.direction.y * t,
    z: ray.origin.z + ray.direction.z * t,
  }
}

/** 轴射线最近点参数（上游 `axisRayParameter`）：轴与射线近平行时返回 `null`。 */
export function axisRayParameter(ray: Ray, point: Vec3, axis: Vec3): number | null {
  const along = dot(ray.direction, axis)
  const denominator = 1 - along * along
  if (denominator < 0.00001) return null
  const offset = { x: point.x - ray.origin.x, y: point.y - ray.origin.y, z: point.z - ray.origin.z }
  return (along * dot(ray.direction, offset) - dot(axis, offset)) / denominator
}

const LONG_AXIS_LOCAL: Vec3 = { x: 1, y: 0, z: 0 }

/** 灯带的三个基向量（上游 `lightFrame` 的等价实现）。 */
export function lightFrame(pose: LightPoseLike): LightFrame {
  const isStrip = pose.type === 'striplight'
  const yawRadians = (-finite(pose.rotation) * Math.PI) / 180
  const tiltRadians = (finite(pose.verticalRotation) * Math.PI) / 180
  const rollRadians = isStrip ? (finite(pose.stripRollRotation) * Math.PI) / 180 : 0
  // 倾斜轴：灯带绕自身 Z（截面轴）倾，其它灯具绕自身 X。
  const tiltAxisLocal: Vec3 = isStrip ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 }
  const tiltAxis = rotateAroundAxis(tiltAxisLocal, WORLD_UP, yawRadians)
  const install = (vector: Vec3): Vec3 =>
    rotateAroundAxis(rotateAroundAxis(vector, tiltAxisLocal, tiltRadians), WORLD_UP, yawRadians)
  const emit = (vector: Vec3): Vec3 => install(rotateAroundAxis(vector, LONG_AXIS_LOCAL, rollRadians))
  return {
    longAxis: emit(LONG_AXIS_LOCAL),
    normalAxis: emit(WORLD_UP),
    upAxis: install(WORLD_UP),
    tiltAxis,
  }
}

/** 三根旋转轴（世界空间）：平面方向 = 世界竖轴；倾斜 = 安装倾斜轴；出光 = 长度轴。 */
export function lightRingAxes(pose: LightPoseLike): Array<{ field: LightAxis; axis: Vec3 }> {
  const frame = lightFrame(pose)
  const axes: Array<{ field: LightAxis; axis: Vec3 }> = [{ field: 'rotation', axis: WORLD_UP }]
  // 只有灯带才有「安装倾斜 / 出光方向」两个自由度（上游同）。
  if (pose.type === 'striplight') {
    axes.push({ field: 'verticalRotation', axis: frame.tiltAxis })
    axes.push({ field: 'stripRollRotation', axis: frame.longAxis })
  }
  return axes
}

/** 把角度差收拢到 [-180, 180]，避免从 359° 拖到 1° 时整圈倒转。 */
export function unwrapRingDelta(deltaDegrees: number): number {
  return (((deltaDegrees % 360) + 540) % 360) - 180
}

/** 两个弧度的最小差值（上游 `unwrapRingDelta(last, current)` 的弧度版）。 */
export function unwrapRingRadians(lastRadians: number, currentRadians: number): number {
  const delta = currentRadians - lastRadians
  return Math.atan2(Math.sin(delta), Math.cos(delta))
}

/**
 * 射线在「垂直于 `axis`、过 `center`」的平面上的方位角（弧度）。
 *
 * `u / v` 是平面内的一组正交基，由调用方按手柄定义给出 —— 只用 `axis` 推导基
 * 会在轴接近 ±Y 时翻转，两端手柄的「正方向」跟着对调。
 */
export function ringRayAngle(ray: Ray, center: Vec3, axis: Vec3, u: Vec3, v: Vec3): number | null {
  const planePoint = planeRayPoint(ray, center, axis)
  if (!planePoint) return null
  const offset = { x: planePoint.x - center.x, y: planePoint.y - center.y, z: planePoint.z - center.z }
  const x = dot(offset, u)
  const y = dot(offset, v)
  if (Math.hypot(x, y) < 1e-6) return null
  return Math.atan2(y, x)
}

/** 灯带沿 `axis` 移动 `t` 米后的位姿（平面像素 + 米）。 */
export function lightMovePosition(
  pose: LightPoseLike,
  t: number,
  axis: Vec3,
  pixelsPerMeter: number,
  { minimum = 0, maximum = 6 }: { minimum?: number; maximum?: number } = {},
): { x: number; y: number; elevation: number } {
  const scale = pixelsPerMeter || 100
  const startElevation = finite(pose.elevation)
  let distance = t
  // 只钳制「会越界的那一段」：垂直轴上下都是边界，水平轴不受影响。
  if (Math.abs(axis.y) > 1e-10) {
    const toMinimum = (minimum - startElevation) / axis.y
    const toMaximum = (maximum - startElevation) / axis.y
    const low = Math.min(toMinimum, toMaximum)
    const high = Math.max(toMinimum, toMaximum)
    distance = Math.max(low, Math.min(high, distance))
  }
  return {
    x: finite(pose.x) + axis.x * distance * scale,
    y: finite(pose.y) + axis.z * distance * scale,
    elevation: startElevation + axis.y * distance,
  }
}

/** 把某个轴的角度加上增量（已归一化到 0–360）。 */
export function applyLightAxisDelta(pose: LightPoseLike, axis: LightAxis, deltaDegrees: number): number {
  return normalizeDegrees(finite(pose[axis]) + deltaDegrees)
}

/**
 * 拖动期间的角度增量：用指针在画布上的水平位移换算，1 像素 = 1°（Shift 精细到 0.25°）。
 * 比三维圆环投影更稳：相机几乎侧视时圆环会退化成一条线，水平拖动仍然可靠。
 */
export function dragAngleDelta(deltaPixels: number, fine = false): number {
  return deltaPixels * (fine ? 0.25 : 1)
}

/** 轴是否接近侧视（用于「当前轴接近侧视」的提示）。 */
export function axisNearlyParallel(ray: Ray, axis: Vec3): boolean {
  const along = dot(ray.direction, axis)
  return 1 - along * along < 0.00001
}
