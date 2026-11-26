/**
 * 地面铺面的**材质参数**（0.8.9 `studio-floor-finish.js`）。
 *
 * 三层数据，刻意分开：
 *
 * 1. **铺面类型**（`theme` / `wood` / `tile`）—— 决定用哪套贴图与明度基线；
 * 2. **色档**（`-5..5`）—— 同层同 `toneKind` 的分区共用一个档位（见 `studio-floor-regions.ts`）；
 * 3. **主题**（`default` / `warm-wood` / `natural-wood`）—— `theme` 铺面跟随它。
 *
 * 深浅的实现不是换贴图，而是在**同一张贴图上调明度**：换贴图会让相邻分区出现
 * 纹理错位（木纹对不上），而明度调整在视觉上等价于「同一批木料的不同深浅」。
 *
 * 本模块只产出**数值**（明度偏移、粗糙度、砖缝参数），不碰 three —— 这样
 * 「±5 档到底差多少」「哪种铺面支持调深浅」可以直接断言。
 */

import { FLOOR_TONE_LIMIT, type FloorFinish, type FloorToneKind } from './studio-floor-regions'

/** 一档色档对应的明度偏移（相对 1.0 的乘数）。±5 档 → 约 ±30%。 */
export const FLOOR_TONE_STEP = 0.06

/** 每种铺面的基线参数。`theme` 没有自己的基线：它由场景风格决定。 */
export type FloorFinishProfile = {
  /** 贴图资源 id（由资源层解析成 URL；这里是稳定键）。 */
  texture: string
  /** 纹理在 1m × 1m 内的重复次数（木地板条 vs 瓷砖）。 */
  tileRepeat: number
  /** 基线粗糙度（木地板更哑光，瓷砖更亮）。 */
  roughness: number
  /** 基线明度乘数。 */
  brightness: number
}

/** 木地板与瓷砖的基线。 */
export const FLOOR_FINISH_PROFILES: Readonly<Record<FloorToneKind, FloorFinishProfile>> = Object.freeze({
  wood: { texture: 'floor-wood', tileRepeat: 1, roughness: 0.72, brightness: 1 },
  tile: { texture: 'floor-tile', tileRepeat: 2, roughness: 0.38, brightness: 1 },
})

/**
 * `theme` 铺面在各场景风格下的落点。
 *
 * 三种风格都落到「木地板」，但基线明度不同：暖阳原木整体偏暖亮，自然木语偏中性。
 * 没登记的风格回落到 `default`（与「未知风格按默认渲染」的既有口径一致）。
 */
export const THEME_FLOOR_BY_SCENE_STYLE: Readonly<Record<string, { kind: FloorToneKind; brightness: number }>> =
  Object.freeze({
    default: { kind: 'wood', brightness: 1 },
    'warm-wood': { kind: 'wood', brightness: 1.08 },
    'natural-wood': { kind: 'wood', brightness: 0.94 },
  })

/** 该铺面是否允许调深浅（`theme` 由场景风格决定，不给用户调）。 */
export function floorFinishSupportsTone(finish: FloorFinish): boolean {
  return finish === 'wood' || finish === 'tile'
}

/** 铺面对应的色档键（`theme` 跟随它的落点）。 */
export function floorFinishToneKind(finish: FloorFinish, sceneStyle: string): FloorToneKind {
  if (finish === 'wood' || finish === 'tile') return finish
  return THEME_FLOOR_BY_SCENE_STYLE[sceneStyle]?.kind ?? 'wood'
}

/** 夹取并取整色档。 */
export function clampFloorTone(tone: unknown): number {
  const parsed = Number(tone)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(-FLOOR_TONE_LIMIT, Math.min(FLOOR_TONE_LIMIT, Math.round(parsed)))
}

/** 色档 → 明度乘数（0 档为 1，正档更亮、负档更暗）。 */
export function floorToneBrightness(tone: number): number {
  return Number((1 + clampFloorTone(tone) * FLOOR_TONE_STEP).toFixed(4))
}

/** 最终材质参数：铺面基线 × 场景风格亮度 × 色档亮度。 */
export type FloorMaterialParams = FloorFinishProfile & {
  /** 最终明度乘数（已合成三者）。 */
  brightness: number
  /** 是否使用了自定义色档（供 UI 显示「已调整」）。 */
  toned: boolean
}

/**
 * 算出一个分区实际使用的材质参数。
 *
 * @param finish     分区铺面
 * @param tone       该分区所在层、该 `toneKind` 的色档
 * @param sceneStyle 当前场景风格（只影响 `theme` 铺面）
 */
export function floorMaterialParams(finish: FloorFinish, tone: number, sceneStyle = 'default'): FloorMaterialParams {
  const toneKind = floorFinishToneKind(finish, sceneStyle)
  const profile = FLOOR_FINISH_PROFILES[toneKind]
  const themeBrightness = finish === 'theme' ? (THEME_FLOOR_BY_SCENE_STYLE[sceneStyle]?.brightness ?? 1) : 1
  const toneValue = floorFinishSupportsTone(finish) ? clampFloorTone(tone) : 0
  return {
    ...profile,
    brightness: Number((profile.brightness * themeBrightness * floorToneBrightness(toneValue)).toFixed(4)),
    toned: floorFinishSupportsTone(finish) && toneValue !== 0,
  }
}

/**
 * 铺面切换时的色档处理（0.8.9 §3.2 的「缺省即旧行为」）。
 *
 * 从 `theme` 切到 `wood` / `tile`：沿用当前层该 `toneKind` 的色档（用户的深浅偏好已表达过）。
 * 切回 `theme`：色档不再生效，但**不清零** —— 用户可能只是临时看一眼默认铺面。
 */
export function floorToneForFinish(
  tones: Readonly<Record<FloorToneKind, number>>,
  finish: FloorFinish,
  sceneStyle = 'default',
): number {
  if (!floorFinishSupportsTone(finish)) return 0
  return clampFloorTone(tones[floorFinishToneKind(finish, sceneStyle)])
}

/**
 * 上游导出名别名（0.8.9 `studio-floor-finish.js`）。
 *
 * 本项目的边界是「纯函数只出参数，three 构造留在渲染层」，所以下面四个函数
 * 都返回**描述**而不是 three 对象。名字保留是为了让排障时能按上游名检索到。
 */
export const createFloorFinishMaterial = floorMaterialParams

/** 「去掉顶面的整板」（0.8.9 `floorSlabWithoutTop`）：分区铺面时隐藏原整板顶面。 */
export function floorSlabWithoutTop<T extends { userData?: Record<string, unknown> }>(slab: T): T {
  const userData = (slab.userData ??= {})
  userData.regionReceiverKind = 'floor'
  userData.slabTopVisible = false
  return slab
}

/** 分区板的顶面几何描述（0.8.9 `floorTopGeometry`）：环 + 洞 + 色档参数。 */
export function floorTopGeometry(
  outline: ReadonlyArray<{ x: number; y: number }>,
  holes: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>> = [],
  finish: FloorFinish = 'theme',
  tone = 0,
  sceneStyle = 'default',
): {
  outline: Array<{ x: number; y: number }>
  holes: Array<Array<{ x: number; y: number }>>
  params: FloorMaterialParams
} {
  return {
    outline: outline.map((point) => ({ x: point.x, y: point.y })),
    holes: holes.map((ring) => ring.map((point) => ({ x: point.x, y: point.y }))),
    params: floorMaterialParams(finish, tone, sceneStyle),
  }
}

/**
 * 实心铺面色档（0.8.9 `setSolidFloorTone`）：返回某一档位下的参数，不改任何对象。
 *
 * 纯函数化是必须的：色档要参与撤销/重做与「按层聚合」，直接改材质会让这两条都失效。
 */
export function setSolidFloorTone(finish: FloorFinish, tone: number, sceneStyle = 'default'): FloorMaterialParams {
  return floorMaterialParams(finish, clampFloorTone(tone), sceneStyle)
}
