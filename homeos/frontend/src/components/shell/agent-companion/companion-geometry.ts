/**
 * 小管家（AgentCompanion）的**纯几何**：把「把圆脸夹在视口内」「气泡宽度/位移/箭头/翻面」
 * 这些只依赖数字的计算从组件里拆出来。
 *
 * 为什么单独成文件：这一段是 SFC 里唯一**没有副作用**的部分，也是回归时最容易算错的部分
 * （边缘留白、缩放换算、气泡被推出屏幕）。拆出来之后可以用普通单测钉住边界值，组件只负责
 * 把响应式数据喂进来。
 *
 * 约定：入参与返回值一律是**屏幕像素**（已乘过壳层缩放）或百分比，不做任何 DOM 读取。
 */

import { AGENT_COMPANION_FACE_SIZE, roundCompanionPercent } from '@/shared/utils/layout/agent-companion.util'

/** 拖动/定位时圆脸离视口边缘的最小间距（px，设计坐标系）。 */
export const DRAG_EDGE_MARGIN = 8
/** 气泡与视口边缘的最小留白（px，设计坐标系）。 */
export const BUBBLE_EDGE_GAP = 10
/** 气泡宽度区间（px，设计坐标系）。 */
export const BUBBLE_MIN_WIDTH = 236
export const BUBBLE_MAX_WIDTH = 300
/** 机器人中心低于该高度（px）就认为上方放不下气泡，改到下方展开。 */
export const BUBBLE_FLIP_TOP = 236
/** 箭头离气泡左右边缘的最小距离（px），避免箭头压到圆角上。 */
export const BUBBLE_ARROW_INSET = 18

export interface Size {
  width: number
  height: number
}

export interface Center {
  x: number
  y: number
}

/**
 * 把中心点夹在视口内，保证圆脸完整可见。
 *
 * `scale` 是壳层等比缩放的系数：边距按设计尺寸算，再乘回屏幕像素，
 * 否则缩放后小屏上的「贴边」会变成「裁掉一半」。
 */
export function clampCompanionCenter(center: Center, viewport: Size, scale = 1): Center {
  const margin = (AGENT_COMPANION_FACE_SIZE / 2 + DRAG_EDGE_MARGIN) * scale
  return {
    x: Math.min(Math.max(center.x, margin), Math.max(margin, viewport.width - margin)),
    y: Math.min(Math.max(center.y, margin), Math.max(margin, viewport.height - margin)),
  }
}

/** 中心点 → 视口百分比（保留一位小数，避免持久化时写入无意义的长小数）。 */
export function centerToPercent(center: Center, viewport: Size): { xPercent: number; yPercent: number } {
  return {
    xPercent: roundCompanionPercent((center.x / viewport.width) * 100),
    yPercent: roundCompanionPercent((center.y / viewport.height) * 100),
  }
}

/** 气泡宽度：随画面宽度收缩，但保持在可读区间。 */
export function companionBubbleWidth(stageWidth: number): number {
  return Math.min(BUBBLE_MAX_WIDTH, Math.max(BUBBLE_MIN_WIDTH, stageWidth * 0.46))
}

/** 气泡水平位移：让气泡整体留在视口内，又不离开机器人太远。 */
export function companionBubbleShift(anchorX: number, stageWidth: number, width: number): number {
  const half = width / 2
  const min = BUBBLE_EDGE_GAP - (anchorX - half)
  const max = stageWidth - BUBBLE_EDGE_GAP - (anchorX + half)
  if (min > max) return (min + max) / 2
  return Math.min(Math.max(0, min), max)
}

/** 箭头始终指向机器人，而不是跟着气泡一起被推走。 */
export function companionBubbleArrowLeft(width: number, shift: number): number {
  const offset = width / 2 - shift
  return Math.min(Math.max(offset, BUBBLE_ARROW_INSET), width - BUBBLE_ARROW_INSET)
}

/** 顶部放不下气泡就翻到机器人下方（箭头同步翻面）。 */
export function companionBubbleFlipped(anchorY: number): boolean {
  return anchorY - AGENT_COMPANION_FACE_SIZE / 2 < BUBBLE_FLIP_TOP
}
