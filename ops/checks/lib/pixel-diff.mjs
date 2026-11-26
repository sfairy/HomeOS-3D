/**
 * PNG 逐像素比较的**唯一实现**（视觉门禁 / 并排验收共用）。
 *
 * 为什么抽出来：`check:duplicates` 曾把 `capture.mjs` 与 `parity-089-groups.mjs` 里
 * 两份 `diffPng` 判成克隆（11 行）。两份实现的差别还很隐蔽 —— 一份把 alpha 计入
 * 通道差、另一份没算，于是同一对图片在两个脚本里可能给出不同的差异比例。
 * 收敛到一处后，语义只有一个：**RGBA 四个通道里最大的那个差 > 容差即算「变了」**。
 */

import { PNG } from 'pngjs'

/** 单通道差超过它才算「像素变了」；低于它属于 PNG 编码与抗锯齿抖动。 */
export const CHANNEL_TOLERANCE = 12

/**
 * 比较两张 PNG 缓冲区。
 *
 * @param actualBuffer 实际截图（PNG）
 * @param baselineBuffer 基线截图（PNG）
 * @param tolerance 单通道容差，默认 {@link CHANNEL_TOLERANCE}
 * @returns `{ sizeMismatch, ratio, maxDelta, different }`；尺寸不一致时 `ratio = 1`
 */
export function diffPng(actualBuffer, baselineBuffer, tolerance = CHANNEL_TOLERANCE) {
  const actual = PNG.sync.read(actualBuffer)
  const baseline = PNG.sync.read(baselineBuffer)
  if (actual.width !== baseline.width || actual.height !== baseline.height) {
    return { sizeMismatch: true, ratio: 1, maxDelta: 255, different: Number.POSITIVE_INFINITY }
  }
  const total = actual.width * actual.height
  const a = actual.data
  const b = baseline.data
  let different = 0
  let maxDelta = 0
  for (let index = 0; index < a.length; index += 4) {
    const delta = Math.max(
      Math.abs(a[index] - b[index]),
      Math.abs(a[index + 1] - b[index + 1]),
      Math.abs(a[index + 2] - b[index + 2]),
      Math.abs(a[index + 3] - b[index + 3]),
    )
    if (delta > maxDelta) maxDelta = delta
    if (delta > tolerance) different += 1
  }
  return { sizeMismatch: false, ratio: different / total, maxDelta, different }
}
