/**
 * 灯带 gizmo 的 SVG 路径几何（0.8.7 `studio-editor-light-gizmo.js` 的绘制部分）。
 *
 * 只做「世界圆环 / 世界箭头 → 屏幕折线」的换算，不碰 DOM、不读状态：这样圆环投影可以单独断言，
 * 复杂度也不会压在工具条模块里。
 *
 * 采样而不是解析投影：透视相机下圆环投影是椭圆（极端角度还会被裁剪），
 * 40 段折线在 240px 尺度上肉眼无差别，比解椭圆简单且天然处理遮挡。
 */
import type { LightAxis, LightPoseLike } from './editor-light-gizmo'
import { LIGHT_AXIS_LABELS, lightFrame, lightRingAxes, rotateAroundAxis } from './editor-light-gizmo'
import type { Vec3 } from './editor-3d-gesture'

/** 圆环采样段数。0.8.7 用 0..64 共 65 个点，标签取第 8 个（约 45°）。 */
const RING_SAMPLES = 64
/** 标签在环上的采样点序号（0.8.7 `points[8]`）。 */
const RING_LABEL_INDEX = 8
/** 多层环逐层收缩比例（0.8.7 `radius * (1 - index * 0.12)`）。 */
const RING_NEST_SCALE = 0.12
/** 非灯具的中心「平面移动」十字半臂（像素，0.8.7 的 6）。 */
const PLANE_CROSS_HALF = 6
/** 手柄头部（菱形）半径，像素。 */
const HEAD_RADIUS_PX = 4
/** 移动箭头的起点比例（从中心偏出来一点，避免三个箭头在中心挤成一团）。 */
const ARROW_START_RATIO = 0.1
/** 移动箭头的屏幕长度（像素）：上游按 `58px / 每米像素` 反推世界长度，保证恒为 58px。 */
const MOVE_ARROW_LENGTH_PX = 58

export type GizmoHandleKind = 'move' | 'rotate' | 'plane'

export interface GizmoHandleSpec {
  /** `data-light-handle` 的值。 */
  key: string
  kind: GizmoHandleKind
  /** 旋转轴（`kind === 'rotate'` 时有效）。 */
  field: LightAxis | null
  /** 移动轴名称（`X` / `Y` / `Z`）。 */
  axisName: string
  label: string
  /** 手柄上的短标签（「平面方向」/「X」…）。 */
  short: string
  color: string
  /**
   * 旋转方向符号（0.8.7 `handles[i].sign`）。
   *
   * 平面方向环的采样基与 three 的绕 Y 正方向相反，所以它取 `-1`；
   * 少了这个符号，拖动圆环的旋转方向会与读数相反（「正角度反而向左转」）。
   */
  sign: number
  path: string
  head: string
  labelPoint: { x: number; y: number }
  /** 世界轴（旋转环的法线 / 移动方向）。 */
  axis: Vec3
  /** 旋转环所在平面的正交基。 */
  u: Vec3
  v: Vec3
  /** 该轴在屏幕上的像素/米（拖动灵敏度、方向提示用）。 */
  projectedScale: number
}

export const LIGHT_AXIS_COLORS: Record<LightAxis, string> = {
  rotation: '#73c9ef',
  verticalRotation: '#7cd3aa',
  stripRollRotation: '#f19786',
}

const MOVE_AXIS_COLORS: Record<string, string> = { X: '#f19786', Y: '#ffd097', Z: '#7cd3aa' }

/** 与 `axis` 正交的一组基（右手系）；数值退化时回落到 +X。 */
function orthoBasis(axis: Vec3): { u: Vec3; v: Vec3 } {
  const reference = Math.abs(axis.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }
  const u = normalize({
    x: reference.y * axis.z - reference.z * axis.y,
    y: reference.z * axis.x - reference.x * axis.z,
    z: reference.x * axis.y - reference.y * axis.x,
  })
  return {
    u,
    v: {
      x: axis.y * u.z - axis.z * u.y,
      y: axis.z * u.x - axis.x * u.z,
      z: axis.x * u.y - axis.y * u.x,
    },
  }
}

function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length }
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

/** 折线 → SVG path（`Z` 闭合，避免首尾各显出一条断口）。 */
export function toRingPath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return ''
  const head = `M ${round(points[0].x)} ${round(points[0].y)}`
  const rest = points.slice(1).map((point) => `L ${round(point.x)} ${round(point.y)}`)
  return `${head} ${rest.join(' ')} Z`
}

/** 菱形手柄路径（0.8.7 用 path 而不是 circle：缩放时笔画宽度不跟着变）。 */
export function toDiamondPath(center: { x: number; y: number }, radius = HEAD_RADIUS_PX): string {
  const { x, y } = center
  return `M ${round(x)} ${round(y - radius)} L ${round(x + radius)} ${round(y)} L ${round(x)} ${round(y + radius)} L ${round(x - radius)} ${round(y)} Z`
}

/** 箭头头部（三角形），沿屏幕方向 `direction` 指出去。 */
function toArrowHead(tip: { x: number; y: number }, direction: { x: number; y: number }, size = 7): string {
  const normal = { x: -direction.y, y: direction.x }
  return `M ${round(tip.x)} ${round(tip.y)} L ${round(tip.x - direction.x * size - normal.x * size * 0.55)} ${round(
    tip.y - direction.y * size - normal.y * size * 0.55,
  )} L ${round(tip.x - direction.x * size + normal.x * size * 0.55)} ${round(
    tip.y - direction.y * size + normal.y * size * 0.55,
  )} Z`
}

export interface RingInput {
  center: Vec3
  axis: Vec3
  /** 世界半径（米）。 */
  radius: number
  project: (world: Vec3) => { x: number; y: number } | null
}

/** 世界圆环 → 屏幕折线；任一点投影失败（在相机背后）就整体放弃，避免画出横穿屏幕的假线。 */
export function projectRing(
  input: RingInput,
): { path: string; head: string; labelPoint: { x: number; y: number } } | null {
  const { u, v } = orthoBasis(input.axis)
  const points: Array<{ x: number; y: number }> = []
  for (let index = 0; index < RING_SAMPLES; index += 1) {
    const angle = (index / RING_SAMPLES) * Math.PI * 2
    const world: Vec3 = {
      x: input.center.x + (u.x * Math.cos(angle) + v.x * Math.sin(angle)) * input.radius,
      y: input.center.y + (u.y * Math.cos(angle) + v.y * Math.sin(angle)) * input.radius,
      z: input.center.z + (u.z * Math.cos(angle) + v.z * Math.sin(angle)) * input.radius,
    }
    const screen = input.project(world)
    if (!screen) return null
    points.push(screen)
  }
  return {
    path: toRingPath(points),
    head: toDiamondPath(points[0]),
    // 0.8.7 把标签放在环上第 8 个采样点：约 45°，不会压住顶部的移动/高度手柄。
    labelPoint: points[Math.min(RING_LABEL_INDEX, points.length - 1)],
  }
}

/** 屏幕上的像素/米：把世界点沿 `axis` 推 1m 再投影。 */
function projectedAxisScale(
  center: Vec3,
  axis: Vec3,
  project: (world: Vec3) => { x: number; y: number } | null,
): { scale: number; direction: { x: number; y: number } } {
  const base = project(center)
  const tip = project({ x: center.x + axis.x, y: center.y + axis.y, z: center.z + axis.z })
  if (!base || !tip) return { scale: 0, direction: { x: 0, y: -1 } }
  const deltaX = tip.x - base.x
  const deltaY = tip.y - base.y
  const length = Math.hypot(deltaX, deltaY)
  return { scale: length, direction: length > 1e-6 ? { x: deltaX / length, y: deltaY / length } : { x: 0, y: -1 } }
}

/** 三根旋转轴各自的圆环（0.8.7 的 `handles` 列表，rotate 模式）。 */
function rotateHandles(input: {
  center: Vec3
  pose: LightPoseLike
  radius: number
  project: (world: Vec3) => { x: number; y: number } | null
  /** 环上短标签：灯具「平面方向」/ 家具「平面旋转」（0.8.7 同名）。 */
  rotationLabel?: string
}): GizmoHandleSpec[] {
  const handles: GizmoHandleSpec[] = []
  const axes = lightRingAxes(input.pose)
  axes.forEach(({ field, axis }, index) => {
    // 0.8.7：多层环逐层收缩 12%，否则灯带三个自由度会画出三条重合的圆环。
    const radius = input.radius * (1 - index * RING_NEST_SCALE)
    const ring = projectRing({ center: input.center, axis, radius, project: input.project })
    if (!ring) return
    const basis = orthoBasis(axis)
    const { scale } = projectedAxisScale(input.center, axis, input.project)
    const label = field === 'rotation' ? (input.rotationLabel ?? LIGHT_AXIS_LABELS[field]) : LIGHT_AXIS_LABELS[field]
    handles.push({
      key: `rotate-${field}`,
      kind: 'rotate',
      field,
      axisName: '',
      label: `${label}，完整360度`,
      // 0.8.7 的环标签就是完整文案（不是「平面」这种缩写）。
      short: label,
      color: LIGHT_AXIS_COLORS[field],
      // 平面方向环取 −1：它的采样基与绕 Y 的正方向相反（0.8.7 列表里的第三个元素）。
      sign: field === 'rotation' ? -1 : 1,
      axis,
      u: basis.u,
      v: basis.v,
      projectedScale: scale,
      ...ring,
    })
  })
  return handles
}

/**
 * 非灯具的中心「平面移动」十字（0.8.7 `move-center`）。
 *
 * 家具的旋转环里没有三根轴箭头，用户仍需要一个「按住这里在平面上拖」的抓手；
 * 0.8.7 画一个 12px 的 `#ffc071` 十字，命中后按水平面求交移动物件。
 */
export function planeCenterHandle(
  center: Vec3,
  project: (world: Vec3) => { x: number; y: number } | null,
): GizmoHandleSpec | null {
  const screen = project(center)
  if (!screen) return null
  // 十字中心不取整：与圆环一样用浮点，旋转 / 缩放时两者才会同步平滑移动（0.8.7 同）。
  const { x, y } = screen
  const { scale } = projectedAxisScale(center, { x: 1, y: 0, z: 0 }, project)
  return {
    key: 'move-center',
    kind: 'plane',
    field: null,
    axisName: '',
    label: '按住拖动平面移动',
    short: '',
    color: '#ffc071',
    sign: 1,
    path: `M ${x - PLANE_CROSS_HALF} ${y} H ${x + PLANE_CROSS_HALF} M ${x} ${y - PLANE_CROSS_HALF} V ${y + PLANE_CROSS_HALF}`,
    head: '',
    labelPoint: screen,
    axis: { x: 0, y: 1, z: 0 },
    u: { x: 0, y: 0, z: 0 },
    v: { x: 0, y: 0, z: 0 },
    projectedScale: scale,
  }
}

/** X / Y / Z 三根移动箭头（move 模式；`space === 'local'` 时用灯具自身基）。 */
function moveHandles(input: {
  center: Vec3
  pose: LightPoseLike
  radius: number
  space: 'world' | 'local'
  project: (world: Vec3) => { x: number; y: number } | null
}): GizmoHandleSpec[] {
  const frame = lightFrame(input.pose)
  const basis =
    input.space === 'local'
      ? [frame.longAxis, frame.upAxis, rotateAroundAxis(frame.longAxis, frame.upAxis, Math.PI / 2)]
      : [
          { x: 1, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
          { x: 0, y: 0, z: 1 },
        ]
  const names = ['X', 'Y', 'Z']
  const handles: GizmoHandleSpec[] = []
  basis.forEach((rawAxis, index) => {
    const axis = normalize(rawAxis)
    // 箭头**屏幕长度固定 58px**（上游 `0x3a / pixelsPerMeter`）：
    // 用物件尺寸当世界长度会让小灯的箭头只有 20px 出头，尺规上「点不中就走 14px 阈值」，
    // 于是顶视图下 Y 轴消失、Z 轴偶尔消失 —— 看起来像「手柄少了一根」。
    const { scale, direction } = projectedAxisScale(input.center, axis, input.project)
    const armWorld = scale > 1e-6 ? Math.max(input.radius, MOVE_ARROW_LENGTH_PX / scale) : input.radius
    const startWorld: Vec3 = {
      x: input.center.x + axis.x * armWorld * ARROW_START_RATIO,
      y: input.center.y + axis.y * armWorld * ARROW_START_RATIO,
      z: input.center.z + axis.z * armWorld * ARROW_START_RATIO,
    }
    const tipWorld: Vec3 = {
      x: input.center.x + axis.x * armWorld,
      y: input.center.y + axis.y * armWorld,
      z: input.center.z + axis.z * armWorld,
    }
    const start = input.project(startWorld)
    const tip = input.project(tipWorld)
    if (!start || !tip) return
    // 轴几乎与视线平行（投影退化成一个点）时才跳过，长度已由上面保证。
    if (Math.hypot(tip.x - start.x, tip.y - start.y) < 14) return
    handles.push({
      key: `move-${names[index].toLowerCase()}`,
      kind: 'move',
      field: null,
      axisName: names[index],
      label: `沿${input.space === 'local' ? '灯具自身' : '世界'} ${names[index]} 轴移动`,
      short: names[index],
      color: MOVE_AXIS_COLORS[names[index]] ?? '#ffd097',
      sign: 1,
      axis,
      u: { x: 0, y: 0, z: 0 },
      v: { x: 0, y: 0, z: 0 },
      projectedScale: scale,
      path: `M ${round(start.x)} ${round(start.y)} L ${round(tip.x)} ${round(tip.y)}`,
      head: toArrowHead(tip, direction),
      labelPoint: tip,
    })
  })
  return handles
}

/** gizmo 手柄列表：按模式生成（move = 三根箭头；rotate = 三轴圆环）。 */
export function lightGizmoHandles(input: {
  center: Vec3
  pose: LightPoseLike
  /** 世界半径（米），通常取物件最大边的一半再放大一点。 */
  radius: number
  project: (world: Vec3) => { x: number; y: number } | null
  mode?: 'move' | 'rotate'
  space?: 'world' | 'local'
  /** 环标签：灯具「平面方向」、家具「平面旋转」。 */
  rotationLabel?: string
  /** 非灯具：额外画中心「平面移动」十字（0.8.7 `move-center`）。 */
  planeCenter?: boolean
}): GizmoHandleSpec[] {
  if (input.mode !== 'rotate') return moveHandles({ ...input, space: input.space ?? 'local' })
  const handles = rotateHandles(input)
  if (input.planeCenter && handles.length) {
    const plane = planeCenterHandle(input.center, input.project)
    if (plane) handles.push(plane)
  }
  return handles
}
