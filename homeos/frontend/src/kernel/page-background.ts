/**
 * 页面背景的**纯类型契约**（0.9.0）。
 *
 * 放在 `shared/types` 的原因：布局配置（`UILayoutConfig.sidebarBackground`）在 store 层
 * 就要引用它，而 store 层不该依赖 `studio/**` 的实现。实现（预设表 / 归一化 / 取图）
 * 在 `kernel/widget/page-background.ts`，这里只描述形状。
 */

/** 背景来源：内置预设 / 自选图片（用户素材）。 */
export type PageBackgroundSource = 'preset' | 'image'

/** 布局方式：铺满 / 自由（保留原位置与尺寸）。 */
export type PageBackgroundLayout = 'fill' | 'free'

/**
 * 组件的像素盒（自由布局）。
 *
 * 0.9.0 的位置存在**组件自身 `position`** 上（px），检查器展示时才换算成百分比。
 */
export type PageBackgroundPosition = {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 旧移植期文档的百分比盒（`properties.position`）。
 *
 * 0.8.9 移植时把位置放在 `properties.position`（0–100 的百分比），与 0.9.0 的
 * 「组件 `position` + 画布 px」不同。归一化保留它只为**读取旧备份**，新数据不写。
 */
export type PageBackgroundLegacyPosition = {
  x: number
  y: number
  width: number
  height: number
}

/** 一份页面背景配置（不含文档组件的 `id` / `type` / 组件 `position`）。 */
export type PageBackgroundConfig = {
  /** 展示名（检查器里的「备注」，≤128）。 */
  label?: string
  /** 0.9.0 字段名：`backgroundSource`（旧文档的 `source` 会被归一化折算）。 */
  backgroundSource: PageBackgroundSource
  /** 内置预设 id；`backgroundSource === 'preset'` 时生效。 */
  preset: string
  /** 用户图片素材 id；`backgroundSource === 'image'` 时生效。 */
  assetId: string
  /** 透明度 0–1（0.9.0 口径）。 */
  opacity: number
  layoutMode: PageBackgroundLayout
  /** 只读兼容旧移植期文档；新数据把位置写在组件 `position` 上。 */
  legacyPosition?: PageBackgroundLegacyPosition
}
