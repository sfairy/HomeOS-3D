/**
 * `airpurifier`（340 × 700 × 340 mm 塔式空气净化器）参数化重建。
 *
 * 槽位：0 机身 / 1 前格栅 / 2 内凹滤芯窗 / 3 上下饰环 / 4 顶部触控盘。
 * 原模型是一个光面方盒，进风格栅、滤芯窗与出风盘都没有。
 */
import { cylinder, merge, transform } from '../lib/primitive-kit.mjs'
import { b } from '../lib/parts.mjs'

export const spec = { size: [0.34, 0.7, 0.34], mount: 'tabletop', topologyClass: 'solid' }

const W = 0.34
const H = 0.7
const D = 0.34
const BODY_TOP = 0.665

const body = merge([
  b(W - 0.02, BODY_TOP, D - 0.02, 0, BODY_TOP / 2, 0),
  b(W, 0.018, D, 0, BODY_TOP - 0.009, 0),
  b(W, 0.018, D, 0, 0.009, 0),
])
const panel = b(W - 0.09, 0.5, 0.008, 0, 0.36, D / 2 - 0.012)
const recess = b(W - 0.13, 0.42, 0.006, 0, 0.36, D / 2 - 0.018)
const trims = merge([
  b(W, 0.016, D, 0, BODY_TOP - 0.008, 0),
  b(W, 0.014, D, 0, 0.019, 0),
])
const control = merge([
  transform(cylinder({ radiusTop: 0.11, height: 0.02, segments: 32 }), {
    translate: [0, H - 0.01, 0],
  }),
  transform(cylinder({ radiusTop: 0.055, height: 0.012, segments: 24 }), {
    translate: [0, H - 0.004, 0],
  }),
])

export function build() {
  return {
    groups: [
      { name: 'airpurifier-body', material: 0, geometry: body },
      { name: 'airpurifier-panel', material: 1, geometry: panel },
      { name: 'airpurifier-recess', material: 2, geometry: recess },
      { name: 'airpurifier-trim', material: 3, geometry: trims },
      { name: 'airpurifier-control', material: 4, geometry: control },
    ],
  }
}
