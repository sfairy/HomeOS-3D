/**
 * HA 来源变化时的两条提示（0.9.0）。
 *
 * 切换 Home Assistant 后，设备目录与实体选择器都会经历「旧来源的响应还在路上」的窗口。
 * 这两句是**给用户看的解释**，不是错误码：不说清「来源变了」，用户只会以为功能坏了。
 *
 * 放在这里而不是各调用点各写一遍，是因为它们会在多个面（仪表盘刷新、编辑器选择器）
 * 同时出现，文案一旦分叉，排查「到底哪句才是真的」会非常费时。
 */

import { HA_ERROR_CODES, readApiErrorCode } from './api-error-codes'

/** 设备目录后台刷新时代替通用失败文案。 */
export const HA_SOURCE_CHANGED_CATALOG_MESSAGE = 'HA 来源已变化，请重试实体目录刷新。'

/** 实体选择器打开时发现来源已变。 */
export const HA_SOURCE_CHANGED_PICKER_MESSAGE = 'HA 来源已变化，请稍后重新打开选择器。'

/** 该错误是不是「HA 来源已变化」。 */
export function isHaSourceChangedError(error: unknown): boolean {
  return readApiErrorCode(error) === HA_ERROR_CODES.sourceChanged
}

/**
 * 把错误翻译成一句给用户看的话。
 *
 * 只有来源变化会改写：其余错误原样返回 `undefined`，让调用方沿用自己更具体的文案
 * （各处的通用错误提示比这里更贴近上下文）。
 */
export function haSourceChangedMessage(error: unknown, surface: 'catalog' | 'picker'): string | undefined {
  return isHaSourceChangedError(error)
    ? surface === 'catalog'
      ? HA_SOURCE_CHANGED_CATALOG_MESSAGE
      : HA_SOURCE_CHANGED_PICKER_MESSAGE
    : undefined
}
