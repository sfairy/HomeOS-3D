/**
 * MSE（MediaSource）编解码串的兼容归一化（0.8.8 `renderer/registry.js` 的 `wt()`）。
 *
 * 背景：Safari 的 `isTypeSupported()` 只认 FLAC 的规范写法 `fLaC`，而 go2rtc / HLS 的
 * 清单里给的是小写 `flac`。直接用原串探测会被判成「不支持」，表现为**带 FLAC 音轨的
 * 摄像头在 Safari 上永远开不了声音**（视频本身照常，因为视频编解码串没问题）。
 *
 * 归一化只改 `codecs="…"` 列表里那个独立的 `flac` 记号（大小写不敏感），并且：
 * 1. 先试归一化后的串；
 * 2. 被拒再试原串（个别浏览器/版本只认小写）；
 * 3. 都拒才返回空串，调用方据此判定「不支持」。
 *
 * 不改 `flac` 以外的任何编码名 —— `mp4a.40.2`、`opus` 等大小写敏感，不能顺手统一。
 */

/** 只把编解码列表里独立的 `flac` 记号换成规范写法 `fLaC`。 */
const FLAC_CODEC_TOKEN = /([=",]\s*)flac(?=\s*(?:[,"]|$))/gi

export function normalizeMseCodecType(mediaType: string): string {
  return mediaType.replace(FLAC_CODEC_TOKEN, '$1fLaC')
}

/**
 * 返回**浏览器真正接受**的那个编解码串（可能是归一化后的，也可能是原串）。
 *
 * @param isTypeSupported 通常是 `MediaSource.isTypeSupported` 或 `ManagedMediaSource.isTypeSupported`
 *   （直接传方法引用会在部分实现里丢 `this`，调用方应包一层箭头函数）。
 * @param mediaType 完整 MIME，例如 `video/mp4; codecs="avc1.640029,flac"`。
 * @returns 可用的 MIME 串；不支持时返回空串（与上游一致，便于直接当布尔用）。
 */
export function supportedMseCodecType(isTypeSupported: (mediaType: string) => boolean, mediaType: string): string {
  if (typeof mediaType !== 'string') return ''
  const normalizedType = normalizeMseCodecType(mediaType)
  if (isTypeSupported(normalizedType)) return normalizedType
  // 归一化没改过串时不必重复探测。
  if (normalizedType !== mediaType && isTypeSupported(mediaType)) return mediaType
  return ''
}
