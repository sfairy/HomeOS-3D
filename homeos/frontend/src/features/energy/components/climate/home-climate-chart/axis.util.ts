/**
 * @file axis.util.ts
 * @module widgets/climate/home-climate-chart
 * @description 家居气候图表 Y 轴自适应工具：依据数据范围动态计算温度/湿度坐标轴上下界，
 *              保证单点或窄幅数据不会导致轴线塌缩，并预留约 12% 视觉边距。
 */

/**
 * 按数据范围自适应 Y 轴：不强制含 0，上下留约 12% 边距。
 * 湿度夹在 0–100；单点/窄幅数据保证最小跨度，避免轴塌缩。
 */
export function adaptiveAxisBound(
  kind: 'temp' | 'hum',
  edge: 'min' | 'max',
): (value: { min: number; max: number }) => number {
  return (value) => {
    const dataMin = Number(value.min)
    const dataMax = Number(value.max)
    if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
      return edge === 'min' ? 0 : kind === 'hum' ? 100 : 40
    }

    const minSpan = kind === 'hum' ? 8 : 2
    let lo = Math.min(dataMin, dataMax)
    let hi = Math.max(dataMin, dataMax)
    if (hi - lo < minSpan) {
      const mid = (lo + hi) / 2
      lo = mid - minSpan / 2
      hi = mid + minSpan / 2
    }

    const pad = (hi - lo) * 0.12
    lo -= pad
    hi += pad

    if (kind === 'hum') {
      lo = Math.max(0, lo)
      hi = Math.min(100, hi)
    }

    return edge === 'min' ? Math.floor(lo * 10) / 10 : Math.ceil(hi * 10) / 10
  }
}
