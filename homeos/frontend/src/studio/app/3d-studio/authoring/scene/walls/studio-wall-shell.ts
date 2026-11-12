/**
 * 墙体盖面（顶盖 / 洞口过梁底面）。
 *
 * ## 为什么要单独一个文件
 *
 * 墙体的挤出体是**上下开口的壳**：`buildWallBandMesh` 给挤出面挂的是
 * `[隐藏材质, 侧面材质]`，封盖组（`materialIndex 0`）永远不画 —— 这样墙才能被看成
 * 一层「看进室内的膜」。代价是每个体块的上下边界都必须由这层薄盖面补上：
 *
 * - **顶盖**：墙顶（原来的实现）；
 * - **底盖（soffit）**：门/窗过梁的下沿。以前只有顶盖，于是门洞正上方那块墙的底面
 *   是通的，俯视时能顺着洞口看见墙体内部 —— 现场表现就是「洞口上沿一条黑缝」。
 *
 * 两者几何相同、只是高度差一个 epsilon，所以合并成一个 `facing` 参数。
 *
 * `resolveShapes` / `createMaterial` 由 `studio-walls` 注入：并集缓存与「专用墙面
 * 着色器」分支都在那边，这里只管把形状变成一层平铺面片。
 */
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { mergeGeometries } from '/static/vendor/three/0.187.0/BufferGeometryUtils.js'

import type { WallTopSurfaceOptions } from '../../types/studio-app-types'
import type { StudioWallsDeps } from './studio-walls'
import { isWallPartVisible } from './studio-wall-debug'

/** 墙体平面环（世界米制）。 */
export type WallCapLoop = { x: number; y: number }

/**
 * three 的 `Shape`。浏览器直载模块在编译期只有影子声明（`ShapeGeometry` 无类型），
 * 这里只标记「几何输入对象」，不引入 three 的类型。
 */
type WallCapShape = ns2.Shape

type WallCapMaterial = ns2.Material

/** 盖面朝向：`up` 顶盖，`down` 洞口过梁底面。 */
type WallCapFacing = 'up' | 'down'

/** 并集结果：`unionValid` 决定是否退回「更保守」的深度设置（与原顶盖分支同义）。 */
interface WallCapShapes {
  shapes: WallCapShape[]
  unionValid: boolean
}

export interface WallCapContext {
  deps: StudioWallsDeps
  /** 并集 + 带洞形状（由 `studio-walls` 注入，含并集失败回退）。 */
  resolveShapes: (loops: WallCapLoop[][]) => WallCapShapes
  /** 盖面材质（墙顶材质，含半透明膜浓度）。 */
  createMaterial: (color: number, opacity: number, options: WallTopSurfaceOptions) => WallCapMaterial
}

export function createWallCapContext(
  deps: StudioWallsDeps,
  resolveShapes: WallCapContext['resolveShapes'],
  createMaterial: WallCapContext['createMaterial'],
): WallCapContext {
  return { deps, resolveShapes, createMaterial }
}

/** 按比例压暗一个 sRGB 色值（过梁底面比顶面暗一档，符合「朝下的面吃不到天光」）。 */
export function shadeTint(colorValue: number, factor: number) {
  return new ns2.Color(colorValue).multiplyScalar(factor).getHex()
}

/**
 * 并集失败时给半透明盖面一个「只写深度」的兜底：宁可盖住后面的墙，也不要让两层膜叠亮。
 */
function resolveCapRenderOptions(options: WallTopSurfaceOptions, unionValid: boolean, opacity: number) {
  if (unionValid || opacity >= 0.999 || options.depthWrite !== undefined) return options
  return { ...options, depthWrite: true, depthFunc: ns2.LessDepth }
}

/**
 * 把同一层的盖面合并成一张几何：一层墙顶/一圈过梁底面就一个 draw call。
 * 分开画时相邻盖面的半透明边缘还会互相叠一层，俯视能看到细亮线。
 */
function mergeCapGeometries(shapes: WallCapShape[]) {
  const shapeGeometries = shapes.map((capShape) => new ns2.ShapeGeometry(capShape, 1)),
    mergedGeometry = shapeGeometries.length === 1 ? shapeGeometries[0] : mergeGeometries(shapeGeometries)
  if (shapeGeometries.length > 1) {
    for (const geometry of shapeGeometries) geometry.dispose()
    if (!mergedGeometry) return null
  }
  return mergedGeometry
}

/** 摆好面片：绕 X +90°（法线朝 -Y）、抬到 `height`，并按盖面用途打标记。 */
function attachCapMesh(
  context: WallCapContext,
  geometry: ns2.BufferGeometry,
  material: WallCapMaterial,
  height: number,
  facing: WallCapFacing,
  renderOrder: number,
) {
  const capMesh = new ns2.Mesh(geometry, material)
  ;(capMesh.rotation.x = Math.PI / 2),
    (capMesh.position.y = height + (facing === 'up' ? 0.0005 : -0.0005)),
    (capMesh.userData.reflectionRole = 'wall'),
    (capMesh.userData.wallCapFacing = facing),
    // 盖面属于墙：不显式声明的话，`classifyReceiverKind` 会沿祖先读到 `modelLayer =
    // 'architecture'`，落到 `furniture` 受光体 —— 吃 `furnitureGain`（1.0）而不是墙的
    // `wallGain`（0.9），于是同一段墙的顶面永远比立面亮一档，看起来像另贴了一条白边。
    (capMesh.userData.regionReceiverKind = 'wall'),
    (capMesh.castShadow = false),
    // 过梁底面（`facing === 'down'`）是朝下的，柜体/窗框的影子落上去才有「洞口进深」；
    // 顶盖朝上，收不收阴影无所谓，但两边共用一份材质与程序，一起打开更省一次分支。
    (capMesh.receiveShadow = true),
    (capMesh.renderOrder = renderOrder),
    context.deps.isEmbeddedStage && material.transparent && (material.forceSinglePass = true),
    context.deps.sceneRootNode.add(capMesh)
}

/**
 * 在 `height` 处铺一层盖面。
 *
 * 面片本身是 `ShapeGeometry`（法线 +Z），绕 X 轴 +90° 之后法线朝 **-Y**；
 * 材质是 `DoubleSide`，所以 `up` / `down` 的差别只在高度 epsilon 与压暗，不在朝向 ——
 * 保持与原顶盖完全一致的朝向，避免改变既有观感。
 */
export function buildWallCapSurface(
  context: WallCapContext,
  {
    loops,
    height,
    color,
    opacity,
    options = {},
    facing,
  }: {
    loops: WallCapLoop[][]
    height: number
    color: number
    opacity: number
    options?: WallTopSurfaceOptions
    facing: WallCapFacing
  },
) {
  if (!isWallPartVisible(facing === 'up' ? 'top' : 'soffit') || !loops.length) return
  const { shapes, unionValid } = context.resolveShapes(loops)
  if (!shapes.length) return
  const resolvedOptions = resolveCapRenderOptions(options, unionValid, opacity),
    capGeometry = mergeCapGeometries(shapes)
  if (!capGeometry) return
  const capMaterial = context.createMaterial(color, opacity, resolvedOptions)
  attachCapMesh(context, capGeometry, capMaterial, height, facing, resolvedOptions.renderOrder ?? 4)
}
