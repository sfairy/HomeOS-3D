/**
 * 舞台浏览手势的**装配**（0.8.9）。
 *
 * 从 `stage.ts` 抽出来的理由：舞台编排文件已 4800+ 行、有扇入棘轮（import 条数）。
 * 把「装手势 + 落相机 + 同步标记」压成一个函数，编排文件只需多一条 import。
 *
 * 只有一处需要舞台上下文（哪些状态下允许手势），因此用回调注入而不是把 `ctx` 传进来 ——
 * 这样本模块可以在 node 里被 import 而不碰 DOM。
 */

import { applyViewGestureIntent, type OrbitLike } from './view-camera'
import { installViewGestures } from '../view-gestures'

/** 舞台手势装配的可注入依赖。 */
export type StageViewGesturesOptions = {
  /** 手势监听的画布。 */
  surface: Element
  /** 是否允许开始手势（编辑态 / 面板编辑 / 照射范围编辑 / 跟随扫地机时返回 false）。 */
  canStart: () => boolean
  /** 相机控制（`OrbitControls` 满足 `{ position, target }`）。 */
  controls: OrbitLike
  /** 相机变化后同步标记位置（标签不能留在旧投影上）。 */
  onCameraChanged: () => void
  /** 请求一次重绘。 */
  requestRender: () => void
  /** 手势认领时清空点击候选（让 tap 判定直接失败）。 */
  clearPointerTap: () => void
}

/**
 * 装上手势，返回句柄。
 *
 * `claim` 恒为 true：能否开始已经由 `canStart` 判定过；这里再拒绝一次只会让
 * 「拖到一半发现不认」这种半途状态出现。
 */
export function installStageViewGestures(options: StageViewGesturesOptions) {
  return installViewGestures({
    surface: options.surface,
    minIntervalMs: 16,
    canStart: options.canStart,
    claim: () => true,
    begin: (intent) => {
      // 手势一旦认领就结束点击路径：清空候选让 tap 判定直接失败。
      options.clearPointerTap()
      if (!applyViewGestureIntent(options.controls, intent)) return // 相机变了必须让轨道控制器与标记位置同步。
      ;(options.controls as OrbitLike & { update?: () => void }).update?.()
      options.onCameraChanged()
      options.requestRender()
    },
  })
}
