/** 语音房间标签常量 */
import { getDefaultVoiceRoomLabels } from '@homeos/shared'

let cachedVoiceRoomLabels: string[] | null = null

/**
 * 语音房间标签回退（优先使用配置 voice.rooms / envSensorMap）。
 *
 * 不能在模块顶层直接取 `getDefaultVoiceRoomLabels()`：本模块与 `@homeos/shared`
 * 的房间目录可能被 rolldown 分到互相 import 的 shared-* chunk（跨 chunk 环），
 * 环内先求值的一侧读到的 `DEFAULT_ROOM_CATALOG` 仍是 `var` 的 undefined 初值，
 * 于是目录函数在 `.map` 上抛 `TypeError: ... is not iterable / undefined`，
 * 使整条懒加载路由 chunk 求值失败（Uncaught (in promise)）。
 * 延迟到首次使用时构建，彻底摆脱 chunk 求值顺序依赖。
 */
export function getVoiceRoomLabels(): string[] {
  return (cachedVoiceRoomLabels ??= getDefaultVoiceRoomLabels())
}
