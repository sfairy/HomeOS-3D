/**
 * 图片元素的「释放」语义（0.8.7）。
 *
 * 浏览器对已解码图片的占有不会因为元素被移出 DOM 自动归还：`remove()` 之后若还持有
 * `src`，在 iOS Safari / 低内存设备上这张图仍算「在用」，反复开关摄像头预览、切换缩略图
 * 会把预算耗尽（表现为后续图片一直白屏）。正确做法是先把 `src` 摘掉再丢弃元素。
 */

/** 释放后写入的占位地址：一个 1×1 透明 GIF，避免空 `src` 触发对当前页面的二次请求。 */
export const RELEASED_IMAGE_SOURCE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/**
 * 释放一张图片：清 `src` / `srcset` 并置占位，随后可选地从 DOM 移除。
 *
 * @param image 目标 `<img>`（也接受 `HTMLVideoElement` 之外的任意带 src 元素）
 * @param remove 是否一并从 DOM 移除（默认 `true`）
 */
export function releaseImageSource(image: HTMLImageElement | null | undefined, remove = true): void {
  if (!image) return
  // 先换占位再移除：直接置空串会让部分浏览器把当前文档当成图片地址再请求一次。
  image.src = RELEASED_IMAGE_SOURCE
  image.removeAttribute('srcset')
  if (remove) image.remove()
}

/** 只清地址、不移动 DOM（元素还要复用，例如列表项里的缩略图）。 */
export function clearImageSource(image: HTMLImageElement | null | undefined): void {
  releaseImageSource(image, false)
}
