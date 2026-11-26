/**
 * 页面背景的**纯类型契约**（0.8.9）。
 *
 * 放在 `shared/types` 的原因：布局配置（`UILayoutConfig.sidebarBackground`）在 store 层
 * 就要引用它，而 store 层不该依赖 `studio/**` 的实现。实现（预设表 / 归一化 / 取图）
 * 在 `studio/app/shared/page-background.ts`，这里只描述形状。
 */

/** 背景来源：内置预设 / 自选图片（用户素材）。 */
export type PageBackgroundSource = 'preset' | 'image'

/** 布局方式：铺满 / 自由（保留原位置与尺寸）。 */
export type PageBackgroundLayout = 'fill' | 'free'

/** 自由布局的位置与尺寸，全部是**百分比**（0–100）。 */
export type PageBackgroundPosition = {
  x: number
  y: number
  width: number
  height: number
}

/** 一份页面背景配置（不含文档组件的 `id` / `type`）。 */
export type PageBackgroundConfig = {
  /** 展示名（检查器里的「备注」，≤128）。 */
  label?: string
  source: PageBackgroundSource
  /** 内置预设 id；`source === 'preset'` 时生效。 */
  preset: string
  /** 用户图片素材 id；`source === 'image'` 时生效。 */
  assetId: string
  /** 透明度 0–100。 */
  opacity: number
  layoutMode: PageBackgroundLayout
  position: PageBackgroundPosition
}
