/**
 * 组件模板列表的**缩略图**构建（0.8.9 增量）。
 *
 * 为什么要抽出来：模板卡片的构建函数已经是一长串 `if / else if`（交互式 3D / 流光线 /
 * 情景模式 / 百分比条各自一段内联 SVG），再加一个「页面背景 = 六图网格」的分支会让
 * 它继续膨胀，而这个函数每天都被改。
 *
 * 页面背景的缩略图特殊：它是 **6 张预设图拼的 3×2 网格**（`page-background-template-preview`），
 * 不是单张 `component-thumbnails/*.jpg`。用网格而不是单图，是因为「一张图代表六种可选背景」
 * 会让用户以为只有一种。
 */
import { PAGE_BACKGROUND_PRESETS, PAGE_BACKGROUND_TYPE, pageBackgroundPresetSource } from '@app/shared/page-background'

/** 模板卡片缩略图的显示尺寸（与 `aspect-ratio: 520 / 260` 的容器一致）。 */
const PREVIEW_WIDTH = 520
const PREVIEW_HEIGHT = 260

/**
 * 往预览容器里放缩略图（`preview` 已带 `component-template-preview` 类）。
 *
 * 页面背景走六图网格，其余沿用「`thumbnailId` 或 `id` 对应的 jpg」。
 */
export function appendTemplatePreview(preview: HTMLElement, template: { id: string; thumbnailId?: string }): void {
  if (template.id === PAGE_BACKGROUND_TYPE) {
    preview.classList.add('page-background-template-preview')
    preview.append(...PAGE_BACKGROUND_PRESETS.map(([presetId]) => presetImage(presetId)))
    return
  }
  const thumbnail = document.createElement('img')
  thumbnail.src = `/static/component-thumbnails/${encodeURIComponent(template.thumbnailId || template.id)}.jpg`
  thumbnail.alt = ''
  preview.append(thumbnail)
}

function presetImage(presetId: string): HTMLImageElement {
  const image = document.createElement('img')
  image.src = pageBackgroundPresetSource(presetId, PREVIEW_WIDTH, PREVIEW_HEIGHT)
  // 装饰图：模板卡片本身已带名称，读屏不需要逐个念出六张背景。
  image.alt = ''
  return image
}
