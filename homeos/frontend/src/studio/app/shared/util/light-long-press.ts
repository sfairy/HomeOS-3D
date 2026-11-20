/**
 * 3D 灯光「长按打开弹窗」的秒数契约（0.8.8 `marker-input.js` 的
 * `LIGHT_LONG_PRESS_SECONDS` / `lightLongPressSeconds`）。
 *
 * 三处必须共用同一份区间，否则会出现「面板里能填 0.3、运行时却按 0.6 触发」这类
 * 前后端各说各话的问题：
 * - 配置面板的数值行（`config-editor/rendering/panel-assembly.ts`）
 * - 运行时按住计时（`runtime/core/stage.ts`）
 * - 后端 `config_sections_lights.py` 的 `LIGHT_NUMBER_BOUNDS`（0.3–1.5）
 *
 * 放在 `app/shared` 而不是 runtime：`app` 不能依赖 `runtime`，反之可以。
 */

export const LIGHT_LONG_PRESS_SECONDS = {
  defaultValue: 0.4,
  min: 0.3,
  max: 1.5,
  step: 0.1,
} as const

/**
 * 把任意输入收敛成合法的长按秒数。
 *
 * 与上游逐字同义：**有限数且落在区间内**才采信，否则回落默认值 0.4
 * （注意不是「夹取」—— 0.1 会变成 0.4，而不是 0.3）。
 */
export function lightLongPressSeconds(value: unknown): number {
  const { min, max, defaultValue } = LIGHT_LONG_PRESS_SECONDS
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : defaultValue
}
