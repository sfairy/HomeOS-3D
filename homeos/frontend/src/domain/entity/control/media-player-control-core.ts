/** 媒体播放器（media_player）控制口径：音量 0–1 ↔ 百分比 0–100。 */

/**
 * `volume_level`（0–1）→ 百分比（0–100，四舍五入）。
 *
 * 属性展示（``attr-format`` 的 volume_level 行）、音量滑块初值、以及任何「读回来
 * 显示成百分之几」的地方共用这一份口径。此前各写一遍：属性行夹取到 0–100，
 * 滑块那路不夹，事件日志那路连取整都没有 —— 同一条音量在三个界面显示成 37% / 37.4% / 38%。
 *
 * @param volume HA `volume_level`（0–1）；非有限值返回 ``null``
 * @returns 0–100 的整数百分比
 */
export function volumeLevelToPercent(volume: unknown): number | null {
  const value = Number(volume)
  if (!Number.isFinite(value)) return null
  return Math.round(Math.min(1, Math.max(0, value)) * 100)
}

/**
 * 百分比（0–100）→ HA `volume_level`（0–1）。
 *
 * 与 :func:`volumeLevelToPercent` 严格互逆（0 → 0、100 → 1），保证「拖到 37%
 * 下发、回读仍是 37%」—— 乐观写入写的是 `* 100` 而不是 `* 2.55` 这类魔法数的根因。
 *
 * @param pct 0–100 的百分比；越界会被夹到边界
 * @returns 0–1 的音量值
 */
export function volumeLevelFromPercent(pct: number): number {
  if (!Number.isFinite(pct)) return 0
  return Math.min(1, Math.max(0, pct / 100))
}
