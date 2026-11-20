/**
 * 场景风格（默认 / 暖阳原木 / 自然木语）的唯一真源。
 *
 * 为什么单独一个模块：这套 id 同时出现在**四条链路**上 —— 户型绘制（`authoring/**`）、
 * 运行时舞台（`runtime/core/**`）、编辑器属性面板（`bridge/editor.ts`）与导出/导图。
 * 只要有一处手写 `'natural-wood'` 字符串，就可能出现「编辑器能选、舞台不认」。
 */

export type SceneStyleId = 'default' | 'warm-wood' | 'natural-wood'

/** id 与中文标签。顺序即选择器顺序，第一个是默认值。 */
export const SCENE_STYLES: ReadonlyArray<readonly [SceneStyleId, string]> = Object.freeze([
  ['default', '默认风格'],
  ['warm-wood', '暖阳原木'],
  ['natural-wood', '自然木语'],
]) as ReadonlyArray<readonly [SceneStyleId, string]>

/** 任意输入 → 合法风格 id（未知一律回落默认，绝不抛错）。 */
export function normalizeSceneStyle(value: unknown): SceneStyleId {
  return SCENE_STYLES.some(([id]) => id === value) ? (value as SceneStyleId) : 'default'
}

/**
 * 「暖色系」判定：暖阳原木与自然木语共用同一批暖色材质分支，但背景与光照预设不同。
 *
 * 需要区分两者时**不要**再写 `=== 'warm-wood'`：这条已经漏过一次自然木语。
 */
export function isWarmSceneStyle(value: unknown): boolean {
  const style = normalizeSceneStyle(value)
  return style === 'warm-wood' || style === 'natural-wood'
}

/** 选择器/面板上显示的风格名。 */
export function sceneStyleLabel(value: unknown): string {
  const style = normalizeSceneStyle(value)
  return SCENE_STYLES.find(([id]) => id === style)?.[1] ?? '默认风格'
}

/**
 * 背景主题选项：自然木语用「纸上林庭 / 暮林静影」，暖阳原木仍用「暖阳微光 / 暖阳暮色」。
 *
 * 值是写进户型/控件配置的稳定 id（`warm-sunlight` / `warm-dusk`），中文名只是展示。
 */
export function warmBackgroundChoices(value: unknown): Array<[string, string]> {
  return normalizeSceneStyle(value) === 'natural-wood'
    ? [
        ['warm-sunlight', '纸上林庭'],
        ['warm-dusk', '暮林静影'],
      ]
    : [
        ['warm-sunlight', '暖阳微光'],
        ['warm-dusk', '暖阳暮色'],
      ]
}

/** 自然木语在弹窗/标签上的默认配色（暖木底 + 深褐字），与舞台 CSS 变量同值。 */
export const NATURAL_SCENE_POPUP_COLORS = Object.freeze({
  mainColor: 0x4d453b,
  secondaryColor: 0x857660,
  iconColor: 0x8c7659,
})

/** 暖阳原木的弹窗配色。 */
export const WARM_SCENE_POPUP_COLORS = Object.freeze({
  mainColor: 0x3d3b35,
  secondaryColor: 0x777a70,
  iconColor: 0x74796b,
})

/** 默认风格的弹窗配色（深色玻璃）。 */
export const DEFAULT_SCENE_POPUP_COLORS = Object.freeze({
  mainColor: 0xf4f5f6,
  secondaryColor: 0x85929b,
  iconColor: 0xc5cfd6,
})

/** 弹窗配色按风格取值。 */
export function scenePopupDefaultColors(value: unknown) {
  const style = normalizeSceneStyle(value)
  if (style === 'natural-wood') return NATURAL_SCENE_POPUP_COLORS
  if (style === 'warm-wood') return WARM_SCENE_POPUP_COLORS
  return DEFAULT_SCENE_POPUP_COLORS
}

/**
 * 动态渲染缩放：自然木语默认满速（它靠静态材质与光照出效果，不需要降采样掩盖噪点），
 * 其余风格沿用配置值；未配置时返回 `null` 表示「不覆盖调用方的默认」。
 */
export function sceneMotionRenderScale(settings: unknown): number | null {
  const source = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>
  const configured = source.motionRenderScale
  if (typeof configured === 'number' && Number.isFinite(configured)) {
    return Math.max(0.25, Math.min(1, configured))
  }
  return normalizeSceneStyle(source.sceneStyle) === 'natural-wood' ? 1 : null
}

/** 自然木语的背景叶影版本号：改它即让缓存的背景图失效。 */
export const NATURAL_BACKDROP_REVISION = 'natural-leaf-responsive-v6'

/** 主题是否支持「背景动态」（飘叶/风动）开关。 */
export function sceneStyleHasBackgroundMotion(value: unknown): boolean {
  return isWarmSceneStyle(value)
}
