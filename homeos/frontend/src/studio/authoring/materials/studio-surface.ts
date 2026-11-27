import { applyTextureQuality } from '../render-kit/texture-quality'
import { createCachedCanvasTexture } from './texture-cache'

/**
 * 按**表面族**共享的程序化**细节（bump / 高度）图**（审计 M3 的 S1 策略）。
 *
 * 背景：672 个 GLB 里 660 个既没有 `normalTexture` 也没有 `TANGENT`，645 个连
 * `TEXCOORD_0` 都没有——模型全是「纯色平板」，近看没有任何材质细节。逐模型出贴图
 * 不现实（体积 + 导出流程 + 几十种建模来源），所以按**表面族**各做一张可平铺的
 * 程序化图，共 11 张，运行时按角色配方声明的 `surface` 挂上去：
 *
 * | 表面族 | 细节强度 | 一个纹理单元覆盖 |
 * | --- | --- | --- |
 * | fabric / leather | 0.35 / 0.45 | 0.16m / 0.12m（织纹、皮孔要密） |
 * | wood / marble / stone | 0.5 / 0.25 / 0.55 | 0.8m / 0.9m / 0.6m |
 * | metal / lacquer / glass | 0.4 / 0.2 / 0.15 | 0.4m / 0.7m / 1.2m |
 * | ceramic / foliage / paint | 0.25 / 0.7 / 0.3 | 0.3m / 0.4m / 0.6m |
 *
 * **2026-10-24 的关键切换：`normalMap` → `bumpMap`。**
 * 之前输出的是切线空间法线图，直接喂 `material.normalMap`。three 的 `normalMap`
 * 是「逐纹素查表」——缩小时按像素选 mip 级别，相邻像素落在不同 mip 上而幅度不衰减，
 * 于是 2m 长的电梯门 / 衣柜门 / 出风口上出现**一层层跟随透视的波浪细纹**（实测
 * 衣柜 flicker 0.376 → 关掉法线 0.020）。`bumpMap` 走 `perturbNormalArb` /
 * `dHdxy_fwd`，用 `dFdx`/`dFdy` 在**屏幕空间**取差分：mip 变粗时相邻像素的高度差
 * 同步变小，扰动幅度自动收敛，就不会再有等高条带。所以这里改输出**灰度高度图**。
 *
 * 三条刻意的边界：
 * 1. **不逐材质出图**：11 张纹理全局共享（`CanvasTexture` + 进程内缓存），内存与
 *    显存都是常数，和模型数量无关。
 * 2. **不写进 GLB**：贴图只在加载期生成，GLB 体积 / 导出流程 / 审计基线都不受影响。
 * 3. **可平铺**：高度场只用整数频率的正弦叠加，纹理左右上下都能无缝重复，
 *    配合 `studio-box-uv.ts` 的盒式 UV 才能铺满无 UV 的模型。
 */

/** 与审计 `NORMAL_SCALE_BY_SURFACE` 同一份表面族清单（`ops/checks/studio/audit_glb_materials.mjs`）。 */
export type MaterialSurface =
  | 'fabric'
  | 'leather'
  | 'wood'
  | 'marble'
  | 'stone'
  | 'metal'
  | 'lacquer'
  | 'glass'
  | 'ceramic'
  | 'foliage'
  | 'paint'

/**
 * 表面细节的各向异性过滤上限。
 *
 * 这些细节图是**按米平铺**的程序化条纹（金属 10 条纹 / 0.4m、布艺 10×10 / 0.16m），
 * 比一般贴图密得多。`anisotropy = 1` 时，大平板在掠射角度上采样不足，采样会欠采 ——
 * 2m 长的出风口、油烟机外壳最容易看出来。取 8 与 `createStoneSlabTexture` /
 * 图集贴图的口径一致；纹理内部还会按设备上限再夹一次。
 */
export const SURFACE_DETAIL_ANISOTROPY = 8

/**
 * 细节强度（逐表面族）；与审计报告的表格逐项一致。
 *
 * 数值沿用切换到 `bumpMap` 之前的 `normalScale`，由加载器乘上
 * `SURFACE_DETAIL_BUMP_UNIT` 换算成 `material.bumpScale`。
 */
export const SURFACE_DETAIL_SCALE: Readonly<Record<MaterialSurface, number>> = Object.freeze({
  fabric: 0.35,
  leather: 0.45,
  wood: 0.5,
  marble: 0.25,
  stone: 0.55,
  metal: 0.4,
  lacquer: 0.2,
  glass: 0.15,
  ceramic: 0.25,
  foliage: 0.7,
  paint: 0.3,
})

/**
 * `SURFACE_DETAIL_SCALE`（0..0.7）→ `material.bumpScale` 的换算单位。
 *
 * `bumpMap` 的深度是「高度图的梯度」而不是法线倾角，量纲与 `normalScale` 不同，
 * 所以必须有一个乘积系数。初值 0.12 由一次离线渲染探针的 before/after 标定：
 * 再大布艺会读成「搓衣板」，再小则细节在 1080p 下不可见。
 */
export const SURFACE_DETAIL_BUMP_UNIT = 0.12

/**
 * 一个纹理单元覆盖的世界尺寸（米）。
 *
 * UV 由盒式投影按**米**生成（见 `studio-box-uv.ts`），所以这里直接用
 * `1 / 米数` 作为 `texture.repeat`：同一表面族的所有材质共享同一张纹理，
 * repeat 是纹理级常量，不会出现「同一个木纹在不同柜子上疏密不同」。
 */
export const SURFACE_TILE_METERS: Readonly<Record<MaterialSurface, number>> = Object.freeze({
  fabric: 0.16,
  leather: 0.12,
  wood: 0.8,
  marble: 0.9,
  stone: 0.6,
  metal: 0.4,
  lacquer: 0.7,
  glass: 1.2,
  ceramic: 0.3,
  foliage: 0.4,
  paint: 0.6,
})

const TEXTURE_SIZE = 256
/** 纹理边长（导出给审计 M7：用它换算「一个细节周期占几个纹素」）。 */
export const SURFACE_DETAIL_TEXTURE_SIZE = TEXTURE_SIZE
/**
 * 一个纹理单元内允许的**最高细节周期数**。
 *
 * 这些细节图是按米平铺的假细节，挂在只有几十个三角形的大平板上。频率一旦接近
 * 纹理的 Nyquist（128px 时 41 周期 → 3 像素一个条纹，256px 时也要 6 像素），
 * 远处缩小时会塌成一层层来回摆的波浪 —— 电梯门、衣柜门、餐边柜侧板、2m 长的
 * 出风口最明显（2026-10-24 的「出风口/电梯/衣柜细纹」）。
 *
 * `bumpMap` 的屏幕导数滤波已经能压住条带，但**限频仍然保留**：一是细节本来就该
 * 是「近看才有」的微表面，二是给 `bumpScale` 留出放大深度的余量。
 * 每个单元最多 10 个周期，配合 256px 纹理 = 25 个纹素一个周期。
 */
const MAX_DETAIL_CYCLES = 10
/** 一个纹理单元内的最高周期数（导出给审计 M7：`纹素/周期 = 纹理边长 / 本值`）。 */
export const SURFACE_DETAIL_MAX_CYCLES = MAX_DETAIL_CYCLES
/** 限频并保证整数（整数频率是「纹理可平铺」的前提）。 */
const detailCycles = (frequency: number) => Math.max(1, Math.min(MAX_DETAIL_CYCLES, Math.round(frequency)))

const TAU = Math.PI * 2
/** 整数频率的正弦：`u` / `v` 取 0..1 时天然平铺。 */
const wave = (u: number, v: number, freqU: number, freqV: number, phase = 0) =>
  Math.sin(TAU * (u * detailCycles(freqU) + v * detailCycles(freqV) + phase))

/** 折痕类图案：把正弦取绝对值再压平，得到「一条条」而不是「一片片」。 */
const ridge = (value: number, sharpness = 0.55) => Math.pow(Math.abs(value), sharpness)

type HeightPainter = (u: number, v: number) => number

const SURFACE_HEIGHT_PAINTERS: Readonly<Record<MaterialSurface, HeightPainter>> = Object.freeze({
  /** 木纹：顺纹长条 + 轻微弯曲 + 细导管。 */
  wood: (u, v) => {
    const warp = 0.05 * wave(u, v, 1, 0, 0.15) + 0.025 * wave(u, v, 2, 1, 0.4)
    const grain = Math.sin(TAU * (v * detailCycles(9) + warp * detailCycles(7) + 0.06 * wave(u, v, 3, 0)))
    return 0.66 * grain + 0.2 * wave(u, v, 9, 2, 0.3) + 0.1 * wave(u, v, 5, 1, 0.7)
  },
  /** 大理石：一条主脉络 + 两层细脉。 */
  marble: (u, v) => {
    const veinA = Math.sin(TAU * (u * detailCycles(2) + v * detailCycles(3) + 0.3 * wave(u, v, 2, 1, 0.25)))
    const veinB = Math.sin(TAU * (u * detailCycles(5) - v * detailCycles(2) + 0.2 * wave(u, v, 3, 2, 0.6)))
    return (
      0.55 * Math.pow(1 - Math.abs(veinA), 6) + 0.22 * Math.pow(1 - Math.abs(veinB), 8) + 0.08 * wave(u, v, 7, 5, 0.1)
    )
  },
  /** 石材：多频噪声 + 少量凹坑。 */
  stone: (u, v) =>
    0.5 * wave(u, v, 3, 2, 0.1) +
    0.3 * wave(u, v, 7, 5, 0.35) +
    0.18 * wave(u, v, 9, 8, 0.7) +
    0.1 * wave(u, v, 5, 4, 0.2),
  /** 布艺：十字织纹（经纬各一组正弦），叠一点绒毛噪声。 */
  fabric: (u, v) =>
    0.55 * Math.sin(TAU * u * detailCycles(10)) * Math.sin(TAU * v * detailCycles(10)) +
    0.22 * wave(u, v, 9, 10, 0.15) +
    0.1 * wave(u, v, 9, 7, 0.5),
  /** 皮革：粒面孔洞，交叉折痕把表面切成不规则小块。 */
  leather: (u, v) =>
    0.5 * ridge(wave(u, v, 9, 7, 0.1), 0.35) * ridge(wave(u, v, 10, 9, 0.35), 0.35) +
    0.2 * wave(u, v, 9, 7, 0.6) +
    0.12 * wave(u, v, 5, 3, 0.2),
  /** 金属：单向拉丝（沿 u 高频、沿 v 低频）。 */
  metal: (u, v) => 0.7 * wave(u, v, 10, 1, 0.05) + 0.2 * wave(u, v, 9, 2, 0.4) + 0.08 * wave(u, v, 3, 1, 0.7),
  /** 烤漆：极浅的橘皮纹，只有掠射角度能看见。 */
  lacquer: (u, v) => 0.2 * wave(u, v, 5, 3, 0.2) + 0.14 * wave(u, v, 9, 7, 0.55),
  /** 玻璃：近乎全平，只留极微的波纹。 */
  glass: (u, v) => 0.12 * wave(u, v, 1, 1, 0.1) + 0.07 * wave(u, v, 2, 3, 0.45),
  /** 陶瓷：细密釉面颗粒。 */
  ceramic: (u, v) => 0.45 * wave(u, v, 9, 8, 0.25) + 0.28 * wave(u, v, 10, 9, 0.6),
  /** 枝叶：主脉 + 侧脉 + 叶面起伏。 */
  foliage: (u, v) => {
    const midrib = Math.abs(Math.sin(TAU * (v * detailCycles(3) + 0.07 * wave(u, v, 1, 1))))
    const sideVeins = Math.abs(Math.sin(TAU * (u * detailCycles(6) + v * detailCycles(4) + 0.1 * wave(u, v, 2, 3))))
    return 0.5 * Math.pow(midrib, 4) + 0.35 * Math.pow(sideVeins, 6) + 0.12 * wave(u, v, 9, 7, 0.4)
  },
  /** 乳胶漆 / 塑料：细小橘皮。 */
  paint: (u, v) => 0.32 * wave(u, v, 7, 5, 0.1) + 0.2 * wave(u, v, 10, 9, 0.3) + 0.12 * wave(u, v, 6, 4, 0.6),
})

function isMaterialSurface(value: unknown): value is MaterialSurface {
  return typeof value === 'string' && value in SURFACE_HEIGHT_PAINTERS
}

/**
 * 每个 three 实例一张缓存表：纹理带着 three 的类型，不能跨实例复用。
 * 渲染器上传纹理时会在它身上挂 dispose 监听并借此留住自己，所以必须能在回收时遍历释放。
 */
const textureCacheByThree = new Map<object, Map<object, any>>()

/** 回收共享高度图：触发 dispose 让各渲染器摘掉挂在纹理上的监听，下次使用时重建。 */
export function releaseSurfaceDetailTextures(): void {
  for (const cache of textureCacheByThree.values()) for (const texture of cache.values()) texture?.dispose?.()
  textureCacheByThree.clear()
}

/**
 * 高度场的编码幅度：painter 的返回值大致落在 ±1.1 内（wood 0.96 / stone 1.08 / metal 0.98）。
 *
 * 固定幅度（而不是「按每张图的最大值归一化」）是刻意的：归一化会把 `glass`（±0.19）
 * 这种本来就该几乎全平的面也拉满对比，玻璃反而变粗糙。固定幅度保留了表面族之间的
 * 相对强弱。
 */
const HEIGHT_ENCODING_AMPLITUDE = 1.1
/** 灰度高度图只用 8..248：留 8 级余量，避免 `Uint8ClampedArray` 在极值处截断出硬边。 */
const HEIGHT_GRAY_CENTER = 128
const HEIGHT_GRAY_RANGE = 120

/**
 * 取某表面族的共享**高度图**（懒生成 + 缓存），供 `material.bumpMap` 使用。
 *
 * 失败（没有 DOM / 拿不到 2d 上下文）返回 `null`，调用方直接不挂细节，不影响渲染。
 */
export function createSurfaceDetailTexture(
  threeApi: any,
  surface: MaterialSurface | null | undefined,
  maxAnisotropy = 1,
): any {
  if (!surface || !isMaterialSurface(surface) || !threeApi?.CanvasTexture) return null
  let cache = textureCacheByThree.get(threeApi)
  if (!cache) {
    cache = new Map()
    textureCacheByThree.set(threeApi, cache)
  }
  const painter = SURFACE_HEIGHT_PAINTERS[surface]
  const cached = cache.get(painter)
  if (cached) {
    /**
     * 纹理全局共享，先创建者说了算。若后来的调用要更高的各向异性（启动顺序不同时
     * 会发生在 1 → 8 之间），就地升级一次，免得先到的那次把整场景钉死在 1。
     */
    const requestedAnisotropy = Math.min(maxAnisotropy || 1, SURFACE_DETAIL_ANISOTROPY)
    if (requestedAnisotropy > (cached.anisotropy || 1)) {
      cached.anisotropy = requestedAnisotropy
      cached.needsUpdate = true
    }
    return cached
  }

  const canvasElement = document.createElement('canvas')
  canvasElement.width = TEXTURE_SIZE
  canvasElement.height = TEXTURE_SIZE
  const canvasCtx = canvasElement.getContext('2d')
  if (!canvasCtx) return null

  const imageData = canvasCtx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE)
  for (let row = 0; row < TEXTURE_SIZE; row += 1) {
    const v = row / TEXTURE_SIZE
    for (let column = 0; column < TEXTURE_SIZE; column += 1) {
      const height = painter(column / TEXTURE_SIZE, v)
      const gray = HEIGHT_GRAY_CENTER + (height / HEIGHT_ENCODING_AMPLITUDE) * HEIGHT_GRAY_RANGE
      const level = Math.round(Math.max(8, Math.min(248, gray)))
      const offset = (row * TEXTURE_SIZE + column) * 4
      // 三通道同值：`bumpMap` 只读红色通道，但灰度图对任何取法都一致。
      imageData.data[offset] = level
      imageData.data[offset + 1] = level
      imageData.data[offset + 2] = level
      imageData.data[offset + 3] = 255
    }
  }
  canvasCtx.putImageData(imageData, 0, 0)

  const texture = new threeApi.CanvasTexture(canvasElement)
  // 高度图是数据不是颜色：不能进 sRGB 解码（否则高度曲线被 gamma 掰弯）。
  texture.colorSpace = threeApi.NoColorSpace ?? threeApi.LinearSRGBColorSpace
  texture.wrapS = threeApi.RepeatWrapping
  texture.wrapT = threeApi.RepeatWrapping
  texture.repeat.set(1 / SURFACE_TILE_METERS[surface], 1 / SURFACE_TILE_METERS[surface])
  texture.anisotropy = Math.min(maxAnisotropy || 1, SURFACE_DETAIL_ANISOTROPY)
  texture.needsUpdate = true
  cache.set(painter, texture)
  return texture
}

/**
 * 兼容旧名：一期别名，实际返回的是**高度图**（给 `bumpMap` 用）。
 * 审计 M3 会同时检查新旧两个名字是否导出，避免外部脚本在同一轮里断掉。
 */
export const createSurfaceNormalTexture = createSurfaceDetailTexture

const MURAL_ART_STYLES = Object.freeze(['bauhaus', 'colorfield', 'linework', 'blocks', 'ink', 'terrazzo'])

const FEATURE_WALL_STYLES = Object.freeze(['marble', 'wood', 'slat', 'stone', 'concrete', 'fabric', 'metal'])

export const FEATURE_WALL_STYLE_MATERIAL = Object.freeze({
  marble: { color: 0xf7f7f5, roughness: 0.34, metalness: 0.03 },
  wood: { color: 0x9a6f42, roughness: 0.72, metalness: 0.02 },
  slat: { color: 0x6f523a, roughness: 0.74, metalness: 0.02 },
  stone: { color: 0xcec8bd, roughness: 0.46, metalness: 0.02 },
  concrete: { color: 0xb4b1ab, roughness: 0.94, metalness: 0 },
  fabric: { color: 0xc9c0b2, roughness: 0.98, metalness: 0 },
  metal: { color: 0x9ba0a6, roughness: 0.38, metalness: 0.28 },
})

const muralArtStyleSet = new Set(MURAL_ART_STYLES)
const featureWallStyleSet = new Set(FEATURE_WALL_STYLES)

export function normalizeMuralArtStyle(styleValue: any) {
  return muralArtStyleSet.has(styleValue) ? styleValue : MURAL_ART_STYLES[0]
}

export function normalizeFeatureWallStyle(styleValue: any) {
  return featureWallStyleSet.has(styleValue) ? styleValue : FEATURE_WALL_STYLES[0]
}

function seededRandomSource(seed: any) {
  let randomSeed = seed >>> 0
  return () => {
    randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0
    return randomSeed / 4294967296
  }
}

function shadeColor(hexColor: any, factor: any) {
  const red = Math.min(255, Math.max(0, Math.round(((hexColor >> 16) & 255) * factor)))
  const green = Math.min(255, Math.max(0, Math.round(((hexColor >> 8) & 255) * factor)))
  const blue = Math.min(255, Math.max(0, Math.round((hexColor & 255) * factor)))
  return 'rgb(' + red + ', ' + green + ', ' + blue + ')'
}

function strokeSmoothPath(canvasCtx: any, points: any) {
  if (points.length < 2) {
    return
  }
  canvasCtx.beginPath()
  canvasCtx.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length - 1; index += 1) {
    const midX = (points[index].x + points[index + 1].x) / 2
    const midY = (points[index].y + points[index + 1].y) / 2
    canvasCtx.quadraticCurveTo(points[index].x, points[index].y, midX, midY)
  }
  const lastPoint = points[points.length - 1]
  canvasCtx.lineTo(lastPoint.x, lastPoint.y)
  canvasCtx.stroke()
}

function paintMuralBauhaus(canvasCtx: any, width: any, height: any) {
  const muralBase = canvasCtx.createLinearGradient(0, 0, width, height)
  muralBase.addColorStop(0, '#f5f0e6')
  muralBase.addColorStop(0.55, '#ead9c6')
  muralBase.addColorStop(1, '#d8ccba')
  canvasCtx.fillStyle = muralBase
  canvasCtx.fillRect(0, 0, width, height)
  canvasCtx.fillStyle = 'rgba(47, 90, 102, .9)'
  canvasCtx.beginPath()
  canvasCtx.arc(width * 0.28, height * 0.42, height * 0.3, 0, Math.PI * 2)
  canvasCtx.fill()
  canvasCtx.fillStyle = 'rgba(216, 161, 63, .9)'
  canvasCtx.fillRect(width * 0.61, height * 0.14, width * 0.25, height * 0.27)
  canvasCtx.fillStyle = 'rgba(201, 111, 74, .88)'
  canvasCtx.beginPath()
  canvasCtx.arc(width * 0.53, height * 0.64, height * 0.27, Math.PI * 1.05, Math.PI * 1.95)
  canvasCtx.closePath()
  canvasCtx.fill()
  canvasCtx.fillStyle = 'rgba(217, 163, 160, .85)'
  canvasCtx.beginPath()
  canvasCtx.arc(width * 0.73, height * 0.75, height * 0.115, 0, Math.PI * 2)
  canvasCtx.fill()
  canvasCtx.save()
  canvasCtx.translate(width * 0.43, height * 0.28)
  canvasCtx.rotate(Math.PI / 5)
  canvasCtx.fillStyle = 'rgba(43, 47, 56, .9)'
  canvasCtx.fillRect(-height * 0.055, -height * 0.055, height * 0.11, height * 0.11)
  canvasCtx.restore()
  canvasCtx.lineCap = 'round'
  canvasCtx.strokeStyle = 'rgba(43, 47, 56, .92)'
  canvasCtx.lineWidth = height * 0.022
  canvasCtx.beginPath()
  canvasCtx.moveTo(width * 0.09, height * 0.83)
  canvasCtx.bezierCurveTo(width * 0.34, height * 0.61, width * 0.56, height * 0.99, width * 0.91, height * 0.71)
  canvasCtx.stroke()
  canvasCtx.strokeStyle = 'rgba(43, 47, 56, .36)'
  canvasCtx.lineWidth = 2
  canvasCtx.beginPath()
  canvasCtx.moveTo(width * 0.5, height * 0.07)
  canvasCtx.lineTo(width * 0.5, height * 0.93)
  canvasCtx.stroke()
  for (let stripe = 0; stripe < 7; stripe += 1) {
    const stripeY = height * (0.13 + stripe * 0.055)
    canvasCtx.beginPath()
    canvasCtx.moveTo(width * 0.84, stripeY)
    canvasCtx.lineTo(width * 0.94, stripeY)
    canvasCtx.stroke()
  }
}

function paintMuralColorField(canvasCtx: any, width: any, height: any) {
  const colorFieldRandom = seededRandomSource(74123)
  const muralBase = canvasCtx.createLinearGradient(0, 0, 0, height)
  muralBase.addColorStop(0, '#f7f3ec')
  muralBase.addColorStop(1, '#e7ded0')
  canvasCtx.fillStyle = muralBase
  canvasCtx.fillRect(0, 0, width, height)
  const colorFields = [
    { x: 0.12, y: 0.26, w: 0.46, h: 0.54, color: 'rgba(72, 122, 148, .5)' },
    { x: 0.44, y: 0.14, w: 0.4, h: 0.46, color: 'rgba(213, 156, 88, .5)' },
    { x: 0.56, y: 0.47, w: 0.36, h: 0.44, color: 'rgba(184, 101, 94, .44)' },
    { x: 0.24, y: 0.58, w: 0.36, h: 0.3, color: 'rgba(120, 133, 97, .4)' },
  ]
  for (const colorField of colorFields) {
    const fieldRadius = Math.min(width, height) * (0.05 + colorFieldRandom() * 0.09)
    canvasCtx.fillStyle = colorField.color
    canvasCtx.beginPath()
    canvasCtx.roundRect(
      width * colorField.x,
      height * colorField.y,
      width * colorField.w,
      height * colorField.h,
      fieldRadius,
    )
    canvasCtx.fill()
  }
  canvasCtx.fillStyle = 'rgba(255, 253, 248, .3)'
  for (let band = 0; band < 5; band += 1) {
    canvasCtx.fillRect(width * (0.06 + band * 0.19), 0, width * 0.045, height)
  }
  canvasCtx.strokeStyle = 'rgba(53, 62, 70, .5)'
  canvasCtx.lineWidth = 2
  canvasCtx.strokeRect(width * 0.07, height * 0.09, width * 0.86, height * 0.82)
}

function paintMuralLinework(canvasCtx: any, width: any, height: any) {
  const lineworkRandom = seededRandomSource(90211)
  canvasCtx.fillStyle = '#f6f3ec'
  canvasCtx.fillRect(0, 0, width, height)
  canvasCtx.lineCap = 'round'
  for (let line = 0; line < 46; line += 1) {
    const lineOffset = lineworkRandom()
    const lineLength = height * (0.24 + lineworkRandom() * 0.55)
    const lineStartX = width * (-0.08 + lineOffset * 1.16)
    const lineStartY = height * (lineworkRandom() * 0.5)
    canvasCtx.strokeStyle = 'rgba(48, 55, 63, ' + (0.1 + lineworkRandom() * 0.36).toFixed(2) + ')'
    canvasCtx.lineWidth = 1 + lineworkRandom() * 2.4
    canvasCtx.beginPath()
    canvasCtx.moveTo(lineStartX, lineStartY)
    canvasCtx.lineTo(lineStartX + lineLength * 0.34, lineStartY + lineLength)
    canvasCtx.stroke()
  }
  canvasCtx.strokeStyle = 'rgba(43, 92, 112, .82)'
  canvasCtx.lineWidth = height * 0.032
  canvasCtx.beginPath()
  canvasCtx.arc(width * 0.62, height * 0.68, height * 0.34, Math.PI * 1.06, Math.PI * 1.72)
  canvasCtx.stroke()
  canvasCtx.fillStyle = 'rgba(201, 96, 68, .92)'
  canvasCtx.beginPath()
  canvasCtx.arc(width * 0.26, height * 0.34, height * 0.045, 0, Math.PI * 2)
  canvasCtx.fill()
  canvasCtx.strokeStyle = 'rgba(48, 55, 63, .55)'
  canvasCtx.lineWidth = 1.6
  canvasCtx.beginPath()
  canvasCtx.moveTo(0, height * 0.5)
  canvasCtx.lineTo(width, height * 0.5)
  canvasCtx.stroke()
}

function paintMuralBlocks(canvasCtx: any, width: any, height: any) {
  const blocksRandom = seededRandomSource(31577)
  canvasCtx.fillStyle = '#f2ece1'
  canvasCtx.fillRect(0, 0, width, height)
  const blockColumns = [0.06, 0.3, 0.52, 0.72]
  const blockPalette = ['#2f5a66', '#c98f45', '#b8604c', '#8f9c74', '#3d4550', '#d9a3a0', '#5d7f92']
  for (let column = 0; column < blockColumns.length; column += 1) {
    let blockCursor = 0.07
    const columnWidth = column === blockColumns.length - 1 ? 0.22 : 0.18 + blocksRandom() * 0.06
    while (blockCursor < 0.92) {
      const blockHeight = 0.12 + blocksRandom() * 0.3
      canvasCtx.fillStyle = blockPalette[Math.floor(blocksRandom() * blockPalette.length)]
      canvasCtx.fillRect(
        width * blockColumns[column],
        height * blockCursor,
        width * columnWidth,
        height * Math.min(blockHeight, 0.93 - blockCursor),
      )
      blockCursor += blockHeight + 0.015
    }
  }
  canvasCtx.fillStyle = 'rgba(255, 252, 246, .9)'
  for (let gap = 0; gap < blockColumns.length - 1; gap += 1) {
    canvasCtx.fillRect(width * (blockColumns[gap] + 0.19), 0, width * 0.012, height)
  }
  canvasCtx.fillStyle = 'rgba(255, 252, 246, .9)'
  canvasCtx.fillRect(width * 0.52, height * 0.44, width * 0.06, height * 0.14)
}

function paintMuralInk(canvasCtx: any, width: any, height: any) {
  const inkRandom = seededRandomSource(60413)
  canvasCtx.fillStyle = '#f7f2e8'
  canvasCtx.fillRect(0, 0, width, height)
  for (let wash = 0; wash < 14; wash += 1) {
    const washCenterX = width * (0.08 + inkRandom() * 0.84)
    const washCenterY = height * (0.12 + inkRandom() * 0.76)
    const washRadius = height * (0.08 + inkRandom() * 0.24)
    const washGradient = canvasCtx.createRadialGradient(
      washCenterX,
      washCenterY,
      0,
      washCenterX,
      washCenterY,
      washRadius,
    )
    const washTone = Math.floor(40 + inkRandom() * 60)
    washGradient.addColorStop(
      0,
      'rgba(' +
        washTone +
        ', ' +
        (washTone + 6) +
        ', ' +
        (washTone + 14) +
        ', ' +
        (0.1 + inkRandom() * 0.2).toFixed(2) +
        ')',
    )
    washGradient.addColorStop(1, 'rgba(' + washTone + ', ' + (washTone + 6) + ', ' + (washTone + 14) + ', 0)')
    canvasCtx.fillStyle = washGradient
    canvasCtx.beginPath()
    canvasCtx.arc(washCenterX, washCenterY, washRadius, 0, Math.PI * 2)
    canvasCtx.fill()
  }
  canvasCtx.strokeStyle = 'rgba(38, 44, 51, .82)'
  canvasCtx.lineCap = 'round'
  canvasCtx.lineWidth = height * 0.018
  canvasCtx.beginPath()
  canvasCtx.moveTo(width * 0.1, height * 0.68)
  canvasCtx.bezierCurveTo(width * 0.32, height * 0.42, width * 0.52, height * 0.78, width * 0.78, height * 0.44)
  canvasCtx.stroke()
  canvasCtx.strokeStyle = 'rgba(178, 64, 46, .92)'
  canvasCtx.lineWidth = height * 0.03
  canvasCtx.beginPath()
  canvasCtx.moveTo(width * 0.58, height * 0.26)
  canvasCtx.lineTo(width * 0.88, height * 0.3)
  canvasCtx.stroke()
  canvasCtx.fillStyle = 'rgba(178, 64, 46, .9)'
  canvasCtx.beginPath()
  canvasCtx.arc(width * 0.5, height * 0.3, height * 0.035, 0, Math.PI * 2)
  canvasCtx.fill()
}

function paintMuralTerrazzo(canvasCtx: any, width: any, height: any) {
  const terrazzoRandom = seededRandomSource(52019)
  canvasCtx.fillStyle = '#f3eee4'
  canvasCtx.fillRect(0, 0, width, height)
  const chipPalette = ['#2f5a66', '#c98f45', '#b8604c', '#8f9c74', '#3d4550', '#d9a3a0', '#5d7f92', '#b9a88f']
  for (let chip = 0; chip < 340; chip += 1) {
    const chipCenterX = terrazzoRandom() * width
    const chipCenterY = terrazzoRandom() * height
    const chipSize = 3 + terrazzoRandom() * 12
    canvasCtx.save()
    canvasCtx.translate(chipCenterX, chipCenterY)
    canvasCtx.rotate(terrazzoRandom() * Math.PI)
    canvasCtx.fillStyle = chipPalette[Math.floor(terrazzoRandom() * chipPalette.length)]
    canvasCtx.beginPath()
    canvasCtx.moveTo(-chipSize, -chipSize * 0.5)
    canvasCtx.lineTo(chipSize * 0.8, -chipSize)
    canvasCtx.lineTo(chipSize, chipSize * 0.7)
    canvasCtx.lineTo(-chipSize * 0.6, chipSize)
    canvasCtx.closePath()
    canvasCtx.fill()
    canvasCtx.restore()
  }
  canvasCtx.fillStyle = 'rgba(243, 238, 228, .72)'
  canvasCtx.beginPath()
  canvasCtx.arc(width * 0.3, height * 0.42, height * 0.28, 0, Math.PI * 2)
  canvasCtx.fill()
  canvasCtx.strokeStyle = 'rgba(47, 90, 102, .8)'
  canvasCtx.lineWidth = height * 0.026
  canvasCtx.beginPath()
  canvasCtx.arc(width * 0.3, height * 0.42, height * 0.28, Math.PI * 0.9, Math.PI * 1.9)
  canvasCtx.stroke()
  canvasCtx.strokeStyle = 'rgba(184, 96, 76, .82)'
  canvasCtx.lineWidth = height * 0.02
  canvasCtx.beginPath()
  canvasCtx.arc(width * 0.72, height * 0.62, height * 0.19, Math.PI * 1.7, Math.PI * 0.7)
  canvasCtx.stroke()
}

const muralPainters = Object.freeze({
  bauhaus: paintMuralBauhaus,
  colorfield: paintMuralColorField,
  linework: paintMuralLinework,
  blocks: paintMuralBlocks,
  ink: paintMuralInk,
  terrazzo: paintMuralTerrazzo,
})

const muralArtTextures = new Map()

/**
 * 回收模块级画布纹理缓存（壁画 / 特色墙 / 石板）。
 *
 * 这三张表按「样式枚举」做 key，样本有限但代价高：一张 1024×768 的 RGBA 画布约 3MB，
 * 合起来是几十 MB 的常驻后备存储。更要紧的是渲染器上传纹理时会在纹理身上挂 dispose
 * 监听并借此留住渲染器与画布 —— 不在这里统一释放，跨次进出 studio 会一直累积
 * 旧渲染器的记账（与 `releaseMetalEnvironmentTextures` 是同一类问题）。
 *
 * 下次用到某样式时会重新绘制（像素绘制是确定性的），视觉完全一致。
 */
export function releaseSurfaceStyleTextures(): void {
  for (const texturesByStyle of [muralArtTextures, featureWallTextures, stoneSlabTextures])
    for (const texture of texturesByStyle.values()) texture?.dispose?.()
  muralArtTextures.clear()
  featureWallTextures.clear()
  stoneSlabTextures.clear()
}

export function createMuralArtTexture(threeApi: any, styleValue: any, maxAnisotropy = 1) {
  const muralStyle = normalizeMuralArtStyle(styleValue)
  return createCachedCanvasTexture(muralArtTextures, threeApi, muralStyle, {
    width: 768,
    height: 512,
    maxAnisotropy,
    paint: (canvasCtx: any, width: number, height: number) =>
      (muralPainters as any)[muralStyle](canvasCtx, width, height),
  })
}

const MARBLE_TONES = Object.freeze({
  white: Object.freeze({
    seed: 88117,
    baseStops: Object.freeze([
      [0, '#ffffff'],
      [0.5, '#fbfbfa'],
      [1, '#f2f2f0'],
    ]),
    cloudLightTone: '255, 255, 255',
    cloudLightAlpha: Object.freeze([0.08, 0.18]),
    cloudDarkTone: '214, 216, 220',
    cloudDarkAlpha: Object.freeze([0.03, 0.08]),
    mainVeinTone: '16, 17, 20',
    mainVeinAlpha: Object.freeze([0.34, 0.42]),
    mainVeinWidth: Object.freeze([1.6, 5.2]),
    fineVeinTone: '38, 40, 45',
    fineVeinAlpha: Object.freeze([0.14, 0.3]),
    fineVeinWidth: Object.freeze([0.7, 1.9]),
    speckLightTone: '255, 255, 255',
    speckLightAlpha: '.5',
    speckDarkTone: '24, 25, 28',
    speckDarkAlpha: '.3',
  }),

  dark: Object.freeze({
    seed: 20260924,
    baseStops: Object.freeze([
      [0, '#14161a'],
      [0.5, '#1b1e23'],
      [1, '#0d0f12'],
    ]),
    cloudLightTone: '122, 130, 142',
    cloudLightAlpha: Object.freeze([0.05, 0.1]),
    cloudDarkTone: '4, 5, 7',
    cloudDarkAlpha: Object.freeze([0.05, 0.12]),
    mainVeinTone: '236, 239, 244',
    mainVeinAlpha: Object.freeze([0.34, 0.42]),
    mainVeinWidth: Object.freeze([1.4, 4.0]),
    fineVeinTone: '176, 186, 198',
    fineVeinAlpha: Object.freeze([0.12, 0.26]),
    fineVeinWidth: Object.freeze([0.6, 1.6]),
    speckLightTone: '235, 240, 246',
    speckLightAlpha: '.34',
    speckDarkTone: '6, 7, 9',
    speckDarkAlpha: '.42',
  }),
})

function paintMarbleSlab(canvasCtx: any, width: any, height: any, tone: any) {
  const marbleRandom = seededRandomSource(tone.seed)
  const surfaceBase = canvasCtx.createLinearGradient(0, 0, width, height)
  for (const [stopOffset, stopColor] of tone.baseStops) {
    surfaceBase.addColorStop(stopOffset, stopColor)
  }
  canvasCtx.fillStyle = surfaceBase
  canvasCtx.fillRect(0, 0, width, height)
  for (let cloud = 0; cloud < 24; cloud += 1) {
    const cloudX = marbleRandom() * width
    const cloudY = marbleRandom() * height
    const cloudRadius = Math.min(width, height) * (0.08 + marbleRandom() * 0.32)
    const cloudLighter = marbleRandom() > 0.35
    const cloudTone = cloudLighter ? tone.cloudLightTone : tone.cloudDarkTone

    const cloudAlphaRange = cloudLighter ? tone.cloudLightAlpha : tone.cloudDarkAlpha
    const cloudAlpha = cloudAlphaRange[0] + marbleRandom() * cloudAlphaRange[1]
    const cloudGradient = canvasCtx.createRadialGradient(cloudX, cloudY, 0, cloudX, cloudY, cloudRadius)
    cloudGradient.addColorStop(0, 'rgba(' + cloudTone + ', ' + cloudAlpha.toFixed(2) + ')')
    cloudGradient.addColorStop(1, 'rgba(' + cloudTone + ', 0)')
    canvasCtx.fillStyle = cloudGradient
    canvasCtx.fillRect(cloudX - cloudRadius, cloudY - cloudRadius, cloudRadius * 2, cloudRadius * 2)
  }
  canvasCtx.lineCap = 'round'

  for (let vein = 0; vein < 9; vein += 1) {
    const veinPoints: any[] = []
    let veinX = width * (-0.04 + marbleRandom() * 1.08)
    let veinY = -height * 0.12
    veinPoints.push({ x: veinX, y: veinY })
    while (veinY < height * 1.1) {
      veinX += (marbleRandom() - 0.5) * width * 0.23
      veinY += height * (0.07 + marbleRandom() * 0.13)
      veinPoints.push({ x: veinX, y: veinY })
    }
    canvasCtx.strokeStyle =
      'rgba(' +
      tone.mainVeinTone +
      ', ' +
      (tone.mainVeinAlpha[0] + marbleRandom() * tone.mainVeinAlpha[1]).toFixed(2) +
      ')'
    canvasCtx.lineWidth = tone.mainVeinWidth[0] + marbleRandom() * tone.mainVeinWidth[1]
    strokeSmoothPath(canvasCtx, veinPoints)
  }

  for (let fine = 0; fine < 46; fine += 1) {
    const finePoints: any[] = []
    let fineX = marbleRandom() * width
    let fineY = -height * 0.06
    finePoints.push({ x: fineX, y: fineY })
    const fineSteps = 3 + Math.floor(marbleRandom() * 5)
    for (let step = 0; step < fineSteps; step += 1) {
      fineX += (marbleRandom() - 0.5) * width * 0.16
      fineY += height * (0.05 + marbleRandom() * 0.1)
      finePoints.push({ x: fineX, y: fineY })
    }
    canvasCtx.strokeStyle =
      'rgba(' +
      tone.fineVeinTone +
      ', ' +
      (tone.fineVeinAlpha[0] + marbleRandom() * tone.fineVeinAlpha[1]).toFixed(2) +
      ')'
    canvasCtx.lineWidth = tone.fineVeinWidth[0] + marbleRandom() * tone.fineVeinWidth[1]
    strokeSmoothPath(canvasCtx, finePoints)
  }
  canvasCtx.fillStyle = 'rgba(' + tone.speckLightTone + ', ' + tone.speckLightAlpha + ')'
  for (let speck = 0; speck < 700; speck += 1) {
    canvasCtx.fillRect(marbleRandom() * width, marbleRandom() * height, 1.2, 1.2)
  }
  canvasCtx.fillStyle = 'rgba(' + tone.speckDarkTone + ', ' + tone.speckDarkAlpha + ')'
  for (let speck = 0; speck < 260; speck += 1) {
    canvasCtx.fillRect(marbleRandom() * width, marbleRandom() * height, 1.3, 1.3)
  }
}

function paintFeatureWallMarble(canvasCtx: any, width: any, height: any) {
  paintMarbleSlab(canvasCtx, width, height, MARBLE_TONES.white)
}

function paintFeatureWallWood(canvasCtx: any, width: any, height: any) {
  const woodRandom = seededRandomSource(45119)
  const grainPalette = [0xa4713f, 0x8c5c31, 0xb98a54]
  const plankCount = 4
  const plankWidth = width / plankCount
  for (let plank = 0; plank < plankCount; plank += 1) {
    const plankX = plank * plankWidth
    const plankTone = 0.86 + woodRandom() * 0.3
    const plankGradient = canvasCtx.createLinearGradient(plankX, 0, plankX + plankWidth, 0)
    plankGradient.addColorStop(0, shadeColor(grainPalette[plank % grainPalette.length], plankTone * 0.92))
    plankGradient.addColorStop(0.45, shadeColor(grainPalette[plank % grainPalette.length], plankTone * 1.08))
    plankGradient.addColorStop(1, shadeColor(grainPalette[plank % grainPalette.length], plankTone * 0.88))
    canvasCtx.fillStyle = plankGradient
    canvasCtx.fillRect(plankX, 0, plankWidth, height)
    canvasCtx.lineCap = 'round'
    for (let grain = 0; grain < 120; grain += 1) {
      const grainPoints: any[] = []
      let grainX = plankX + woodRandom() * plankWidth
      let grainY = -height * 0.06

      const grainDrift = (woodRandom() - 0.5) * plankWidth * 0.09
      grainPoints.push({ x: grainX, y: grainY })
      while (grainY < height * 1.06) {
        grainX += grainDrift + (woodRandom() - 0.5) * plankWidth * 0.045
        grainY += height * (0.1 + woodRandom() * 0.2)
        grainPoints.push({ x: grainX, y: grainY })
      }
      const grainDark = woodRandom() > 0.35
      canvasCtx.strokeStyle = grainDark
        ? 'rgba(62, 38, 18, ' + (0.05 + woodRandom() * 0.2).toFixed(2) + ')'
        : 'rgba(246, 214, 172, ' + (0.04 + woodRandom() * 0.14).toFixed(2) + ')'
      canvasCtx.lineWidth = 0.6 + woodRandom() * 3
      strokeSmoothPath(canvasCtx, grainPoints)
    }
    const knotCount = woodRandom() > 0.5 ? 2 : 1
    for (let knot = 0; knot < knotCount; knot += 1) {
      const knotX = plankX + plankWidth * (0.2 + woodRandom() * 0.6)
      const knotY = height * (0.12 + woodRandom() * 0.76)
      const knotRadius = Math.min(plankWidth, height) * (0.04 + woodRandom() * 0.05)
      for (let ring = 4; ring >= 1; ring -= 1) {
        canvasCtx.strokeStyle = 'rgba(58, 34, 15, ' + (0.1 + ring * 0.05).toFixed(2) + ')'
        canvasCtx.lineWidth = 1.1
        canvasCtx.beginPath()
        canvasCtx.ellipse(knotX, knotY, knotRadius * ring * 0.5, knotRadius * ring * 0.82, 0, 0, Math.PI * 2)
        canvasCtx.stroke()
      }
    }
    canvasCtx.fillStyle = 'rgba(46, 28, 12, .5)'
    canvasCtx.fillRect(plankX, 0, 2.4, height)
  }
  canvasCtx.fillStyle = 'rgba(46, 28, 12, .5)'
  canvasCtx.fillRect(width - 2.4, 0, 2.4, height)
}

function paintFeatureWallSlat(canvasCtx: any, width: any, height: any) {
  const slatRandom = seededRandomSource(70841)
  const slatCount = Math.max(12, Math.round(width / 34))
  const slatPitch = width / slatCount
  const recessGradient = canvasCtx.createLinearGradient(0, 0, 0, height)
  recessGradient.addColorStop(0, '#241b14')
  recessGradient.addColorStop(0.5, '#180f0a')
  recessGradient.addColorStop(1, '#241b14')
  canvasCtx.fillStyle = recessGradient
  canvasCtx.fillRect(0, 0, width, height)
  for (let slat = 0; slat < slatCount; slat += 1) {
    const slatX = slatPitch * slat
    const slatGradient = canvasCtx.createLinearGradient(slatX, 0, slatX + slatPitch, 0)
    slatGradient.addColorStop(0, 'rgba(20, 12, 7, .94)')
    slatGradient.addColorStop(0.5, 'rgba(46, 32, 21, .5)')
    slatGradient.addColorStop(1, 'rgba(20, 12, 7, .94)')
    canvasCtx.fillStyle = slatGradient
    canvasCtx.fillRect(slatX, 0, slatPitch * 0.96, height)
    canvasCtx.strokeStyle = 'rgba(148, 112, 76, ' + (0.06 + slatRandom() * 0.1).toFixed(2) + ')'
    canvasCtx.lineWidth = 1
    canvasCtx.beginPath()
    canvasCtx.moveTo(slatX + slatPitch * 0.5, 0)
    canvasCtx.lineTo(slatX + slatPitch * 0.5, height)
    canvasCtx.stroke()
  }
  const castShadow = canvasCtx.createLinearGradient(0, 0, 0, height)
  castShadow.addColorStop(0, 'rgba(0, 0, 0, .4)')
  castShadow.addColorStop(0.16, 'rgba(0, 0, 0, 0)')
  castShadow.addColorStop(0.84, 'rgba(0, 0, 0, 0)')
  castShadow.addColorStop(1, 'rgba(0, 0, 0, .4)')
  canvasCtx.fillStyle = castShadow
  canvasCtx.fillRect(0, 0, width, height)
}

function paintFeatureWallStone(canvasCtx: any, width: any, height: any) {
  const stoneRandom = seededRandomSource(25309)
  const slabColumns = 3
  const slabRows = 2
  canvasCtx.fillStyle = '#6f6b64'
  canvasCtx.fillRect(0, 0, width, height)
  const slabWidth = width / slabColumns
  const slabHeight = height / slabRows
  const slabBases = [214, 208, 197, 201, 197, 186, 224, 218, 208]
  for (let row = 0; row < slabRows; row += 1) {
    for (let column = 0; column < slabColumns; column += 1) {
      const slabX = column * slabWidth
      const slabY = row * slabHeight
      const slabTone = 0.9 + stoneRandom() * 0.24
      canvasCtx.fillStyle = shadeColor(slabBases[row * slabColumns + column], slabTone)
      canvasCtx.fillRect(slabX + 1.6, slabY + 1.6, slabWidth - 3.2, slabHeight - 3.2)
      for (let mottle = 0; mottle < 20; mottle += 1) {
        const mottleX = slabX + stoneRandom() * slabWidth
        const mottleY = slabY + stoneRandom() * slabHeight
        const mottleRadius = Math.min(slabWidth, slabHeight) * (0.1 + stoneRandom() * 0.4)
        const mottleDark = stoneRandom() > 0.5
        const mottleTone = mottleDark ? '150, 144, 133' : '246, 243, 236'
        const mottleGradient = canvasCtx.createRadialGradient(mottleX, mottleY, 0, mottleX, mottleY, mottleRadius)
        mottleGradient.addColorStop(0, 'rgba(' + mottleTone + ', ' + (0.08 + stoneRandom() * 0.2).toFixed(2) + ')')
        mottleGradient.addColorStop(1, 'rgba(' + mottleTone + ', 0)')
        canvasCtx.fillStyle = mottleGradient
        canvasCtx.fillRect(mottleX - mottleRadius, mottleY - mottleRadius, mottleRadius * 2, mottleRadius * 2)
      }
      canvasCtx.lineCap = 'round'
      for (let vein = 0; vein < 3; vein += 1) {
        const veinPoints: any[] = []
        let veinX = slabX + stoneRandom() * slabWidth
        let veinY = slabY + stoneRandom() * slabHeight
        veinPoints.push({ x: veinX, y: veinY })
        for (let step = 0; step < 4; step += 1) {
          veinX += (stoneRandom() - 0.5) * slabWidth * 0.4
          veinY += (stoneRandom() - 0.4) * slabHeight * 0.4
          veinPoints.push({ x: veinX, y: veinY })
        }
        canvasCtx.strokeStyle = 'rgba(126, 120, 110, ' + (0.1 + stoneRandom() * 0.22).toFixed(2) + ')'
        canvasCtx.lineWidth = 0.8 + stoneRandom() * 2.2
        strokeSmoothPath(canvasCtx, veinPoints)
      }
    }
  }
  canvasCtx.fillStyle = 'rgba(255, 255, 255, .34)'
  for (let speck = 0; speck < 900; speck += 1) {
    canvasCtx.fillRect(stoneRandom() * width, stoneRandom() * height, 1.3, 1.3)
  }
}

function paintFeatureWallConcrete(canvasCtx: any, width: any, height: any) {
  const concreteRandom = seededRandomSource(13627)
  const surfaceBase = canvasCtx.createLinearGradient(0, 0, width, height)
  surfaceBase.addColorStop(0, '#bcb9b3')
  surfaceBase.addColorStop(0.5, '#b2afa9')
  surfaceBase.addColorStop(1, '#a8a5a0')
  canvasCtx.fillStyle = surfaceBase
  canvasCtx.fillRect(0, 0, width, height)
  for (let cloud = 0; cloud < 34; cloud += 1) {
    const cloudX = concreteRandom() * width
    const cloudY = concreteRandom() * height
    const cloudRadius = Math.min(width, height) * (0.1 + concreteRandom() * 0.4)
    const cloudLighter = concreteRandom() > 0.5
    const cloudTone = cloudLighter ? '226, 224, 219' : '138, 136, 131'
    const cloudGradient = canvasCtx.createRadialGradient(cloudX, cloudY, 0, cloudX, cloudY, cloudRadius)
    cloudGradient.addColorStop(0, 'rgba(' + cloudTone + ', ' + (0.1 + concreteRandom() * 0.22).toFixed(2) + ')')
    cloudGradient.addColorStop(1, 'rgba(' + cloudTone + ', 0)')
    canvasCtx.fillStyle = cloudGradient
    canvasCtx.fillRect(cloudX - cloudRadius, cloudY - cloudRadius, cloudRadius * 2, cloudRadius * 2)
  }
  for (let trowel = 0; trowel < 16; trowel += 1) {
    const trowelX = concreteRandom() * width
    const trowelY = concreteRandom() * height
    const trowelRadius = Math.min(width, height) * (0.18 + concreteRandom() * 0.34)
    canvasCtx.strokeStyle = 'rgba(240, 238, 233, ' + (0.05 + concreteRandom() * 0.12).toFixed(2) + ')'
    canvasCtx.lineWidth = 6 + concreteRandom() * 22
    canvasCtx.beginPath()
    canvasCtx.arc(
      trowelX,
      trowelY,
      trowelRadius,
      Math.PI * (0.7 + concreteRandom() * 0.6),
      Math.PI * (1.3 + concreteRandom() * 0.7),
    )
    canvasCtx.stroke()
  }
  canvasCtx.fillStyle = 'rgba(255, 255, 255, .3)'
  for (let speck = 0; speck < 1100; speck += 1) {
    canvasCtx.fillRect(concreteRandom() * width, concreteRandom() * height, 1.3, 1.3)
  }
  canvasCtx.fillStyle = 'rgba(64, 62, 59, .12)'
  for (let speck = 0; speck < 900; speck += 1) {
    canvasCtx.fillRect(concreteRandom() * width, concreteRandom() * height, 1.6, 1.6)
  }
}

function paintFeatureWallFabric(canvasCtx: any, width: any, height: any) {
  const fabricRandom = seededRandomSource(38971)
  canvasCtx.fillStyle = shadeColor(0xc9c0b2, 1)
  canvasCtx.fillRect(0, 0, width, height)
  for (let blotch = 0; blotch < 22; blotch += 1) {
    const blotchX = fabricRandom() * width
    const blotchY = fabricRandom() * height
    const blotchRadius = Math.min(width, height) * (0.12 + fabricRandom() * 0.38)
    const blotchLighter = fabricRandom() > 0.5
    const blotchGradient = canvasCtx.createRadialGradient(blotchX, blotchY, 0, blotchX, blotchY, blotchRadius)
    blotchGradient.addColorStop(0, blotchLighter ? 'rgba(238, 232, 220, .22)' : 'rgba(150, 140, 124, .18)')
    blotchGradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    canvasCtx.fillStyle = blotchGradient
    canvasCtx.fillRect(blotchX - blotchRadius, blotchY - blotchRadius, blotchRadius * 2, blotchRadius * 2)
  }
  const weavePitch = 3
  for (let column = 0; column < width; column += weavePitch) {
    canvasCtx.fillStyle = (column / weavePitch) % 2 === 0 ? 'rgba(96, 86, 72, .12)' : 'rgba(252, 248, 240, .14)'
    canvasCtx.fillRect(column, 0, 1.2, height)
  }
  for (let row = 0; row < height; row += weavePitch) {
    canvasCtx.fillStyle = (row / weavePitch) % 2 === 0 ? 'rgba(96, 86, 72, .1)' : 'rgba(252, 248, 240, .12)'
    canvasCtx.fillRect(0, row, width, 1.2)
  }
  for (let slub = 0; slub < 90; slub += 1) {
    const slubY = fabricRandom() * height
    const slubLength = width * (0.04 + fabricRandom() * 0.16)
    const slubX = fabricRandom() * (width - slubLength)
    canvasCtx.fillStyle = 'rgba(255, 252, 246, ' + (0.08 + fabricRandom() * 0.2).toFixed(2) + ')'
    canvasCtx.fillRect(slubX, slubY, slubLength, 1.6 + fabricRandom() * 1.6)
  }
}

function paintFeatureWallMetal(canvasCtx: any, width: any, height: any) {
  const metalRandom = seededRandomSource(19237)
  const surfaceBase = canvasCtx.createLinearGradient(0, 0, 0, height)
  surfaceBase.addColorStop(0, '#8f959c')
  surfaceBase.addColorStop(0.24, '#b3b8be')
  surfaceBase.addColorStop(0.52, '#9aa0a7')
  surfaceBase.addColorStop(0.78, '#b8bdc3')
  surfaceBase.addColorStop(1, '#8b9198')
  canvasCtx.fillStyle = surfaceBase
  canvasCtx.fillRect(0, 0, width, height)
  for (let brush = 0; brush < 900; brush += 1) {
    const brushY = metalRandom() * height
    const brushLength = width * (0.2 + metalRandom() * 0.8)
    const brushX = metalRandom() * (width - brushLength)
    const brushLighter = metalRandom() > 0.5
    canvasCtx.fillStyle = brushLighter
      ? 'rgba(255, 255, 255, ' + (0.03 + metalRandom() * 0.12).toFixed(2) + ')'
      : 'rgba(56, 60, 66, ' + (0.03 + metalRandom() * 0.11).toFixed(2) + ')'
    canvasCtx.fillRect(brushX, brushY, brushLength, 0.6 + metalRandom() * 1.4)
  }
  for (let streak = 0; streak < 12; streak += 1) {
    const streakY = metalRandom() * height
    const streakGradient = canvasCtx.createLinearGradient(0, streakY - height * 0.05, 0, streakY + height * 0.05)
    streakGradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
    streakGradient.addColorStop(0.5, 'rgba(255, 255, 255, ' + (0.06 + metalRandom() * 0.12).toFixed(2) + ')')
    streakGradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
    canvasCtx.fillStyle = streakGradient
    canvasCtx.fillRect(0, streakY - height * 0.05, width, height * 0.1)
  }
}

const featureWallPainters = Object.freeze({
  marble: paintFeatureWallMarble,
  wood: paintFeatureWallWood,
  slat: paintFeatureWallSlat,
  stone: paintFeatureWallStone,
  concrete: paintFeatureWallConcrete,
  fabric: paintFeatureWallFabric,
  metal: paintFeatureWallMetal,
})

const featureWallTextures = new Map()

export function createFeatureWallTexture(threeApi: any, styleValue: any, maxAnisotropy = 1) {
  const wallStyle = normalizeFeatureWallStyle(styleValue)
  return createCachedCanvasTexture(featureWallTextures, threeApi, wallStyle, {
    width: 1024,
    height: 768,
    maxAnisotropy,
    paint: (canvasCtx: any, width: number, height: number) =>
      (featureWallPainters as any)[wallStyle](canvasCtx, width, height),
  })
}

const STONE_SLAB_TONES = Object.freeze({
  marble: MARBLE_TONES.white,
  'marble-dark': MARBLE_TONES.dark,
})

/**
 * 石材板色号的**代表色**，给「材质风格」色卡预览用。
 *
 * 为什么需要：石材板的角色配方里 `color` 常常是 `0xffffff`（白底），真正的深浅全在
 * 贴图上 —— 色卡若只看 `color`，「白石黑座」的黑座与白石会画成同一块白，
 * 看上去就像档位没生效。这里取纹理基色的中间那一档，色卡才和实际出图一致。
 */
export function stoneSlabSwatchHex(flavor: unknown): string | null {
  const tone = (STONE_SLAB_TONES as any)[flavor as string]
  const stops = tone?.baseStops as ReadonlyArray<readonly [number, string]> | undefined
  if (!stops?.length) return null
  return stops[Math.floor(stops.length / 2)][1]
}

const stoneSlabTextures = new Map()

export function createStoneSlabTexture(threeApi: any, flavor: any, maxAnisotropy = 1) {
  if (flavor === 'marble') {
    return createFeatureWallTexture(threeApi, 'marble', maxAnisotropy)
  }
  const tone = (STONE_SLAB_TONES as any)[flavor]
  if (!tone || typeof document === 'undefined' || typeof threeApi?.CanvasTexture !== 'function') {
    return null
  }
  if (stoneSlabTextures.has(flavor)) {
    return stoneSlabTextures.get(flavor)
  }

  const canvasElement = document.createElement('canvas')
  canvasElement.width = 1024
  canvasElement.height = 768
  const canvasCtx = canvasElement.getContext('2d')
  if (!canvasCtx) {
    return null
  }
  paintMarbleSlab(canvasCtx, canvasElement.width, canvasElement.height, tone)
  const texture = new threeApi.CanvasTexture(canvasElement)
  applyTextureQuality(texture, maxAnisotropy, threeApi.SRGBColorSpace)
  texture.needsUpdate = true
  stoneSlabTextures.set(flavor, texture)
  return texture
}
