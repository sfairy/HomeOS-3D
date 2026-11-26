/**
 * 页面背景的**渲染层**（0.8.9）—— 主页面与侧边栏共用同一个渲染实现。
 *
 * 为什么单独成文件而不是写进两个宿主：
 * 「预设 → 图片地址」「百分比盒 + 透明度」这两条口径一旦在宿主里各写一份，就会出现
 * 「同一个背景在侧边栏铺满、在主页面留白」这类只差几个百分点的错位。这里只暴露一个
 * `mountPageBackgroundLayer`，两个宿主都调它。
 *
 * 三个必须保持的行为：
 *
 * 1. **没有图片就不渲染**：返回 `null`，宿主隐藏背景层。画一块空白比不画更糟
 *    （用户会以为背景坏了）。
 * 2. **背景层不参与命中**：`pointer-events: none` + `aria-hidden`。否则它会吃掉
 *    控件的点击（页面背景是"装饰"，不是"表面"）。
 * 3. **图片地址随容器形状切换**：预设图有横 / 竖 / 方三套，按容器宽高比挑一套，
 *    避免同一张图在窄侧边栏里被拉成马赛克。
 */
import {
  PAGE_BACKGROUND_TYPE,
  normalizePageBackground,
  pageBackgroundPresetSource,
  type PageBackground,
} from '@app/shared/page-background'

/** 用户素材的 URL 生成（与其它控件共用同一套口径：`user:` 前缀走资产接口）。 */
export type ResolveAssetUrl = (assetId: string) => string | undefined

export type MountPageBackgroundOptions = {
  /** 背景配置（任何来源都要先过 `normalizePageBackground`）。 */
  background: unknown
  /** 把素材 id 转成可用的图片地址（预设不需要）。 */
  resolveAssetUrl?: ResolveAssetUrl
  /** 容器尺寸（用于挑预设的横 / 竖 / 方版本）。缺省按 16:9。 */
  width?: number
  height?: number
  /** 额外类名（宿主区分主页面 / 侧边栏）。 */
  className?: string
}

/** 解析出最终要用的图片地址；没有可用地址时返回 `null`。 */
export function resolvePageBackgroundImage(
  background: PageBackground,
  options: Pick<MountPageBackgroundOptions, 'resolveAssetUrl' | 'width' | 'height'> = {},
): string | null {
  if (background.source === 'image') {
    const resolve = options.resolveAssetUrl
    if (!background.assetId || !resolve) return null
    const url = resolve(background.assetId)
    return url || null
  }
  return pageBackgroundPresetSource(background.preset, options.width ?? 1600, options.height ?? 900)
}

/**
 * 建一个背景层元素。
 *
 * 返回 `null` 表示「这份配置画不出东西」（没有素材 / 没有解析器），宿主应当不插入节点。
 */
export function mountPageBackgroundLayer(options: MountPageBackgroundOptions): HTMLElement | null {
  const background = normalizePageBackground(options.background)
  const imageUrl = resolvePageBackgroundImage(background, options)
  if (!imageUrl) return null
  const layer = document.createElement('div')
  layer.className = options.className ? `${LAYER_CLASS} ${options.className}` : LAYER_CLASS
  layer.dataset.pageBackground = background.source
  // 装饰层：不吃指针、不进无障碍树（屏幕阅读器不该读出「一张背景图」）。
  layer.setAttribute('aria-hidden', 'true')
  layer.style.position = 'absolute'
  layer.style.pointerEvents = 'none'
  layer.style.overflow = 'hidden'
  layer.style.zIndex = '0'
  layer.style.backgroundImage = `url('${imageUrl}')`
  layer.style.backgroundSize = '100% 100%'
  layer.style.backgroundRepeat = 'no-repeat'
  layer.style.backgroundPosition = '0 0'
  layer.style.opacity = String(background.opacity / 100)
  // 铺满模式由 normalizePageBackground 保证 position 是 0/0/100/100。
  layer.style.left = `${background.position.x}%`
  layer.style.top = `${background.position.y}%`
  layer.style.width = `${background.position.width}%`
  layer.style.height = `${background.position.height}%`
  return layer
}

/** 背景层的稳定类名（CSS 与测试都依赖它）。 */
export const LAYER_CLASS = 'hb-page-background'

/** 文档组件类型别名（注册表使用同一个常量，避免两处写字符串）。 */
export const PAGE_BACKGROUND_COMPONENT_TYPE = PAGE_BACKGROUND_TYPE
