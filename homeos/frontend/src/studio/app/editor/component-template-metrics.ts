/**
 * 控件模板的尺寸推导（时间 / 日期 / 天气按字号与可见项算外框）。
 *
 * 从 `component-templates.ts` 拆出（纯移动）：模板定义的 `create` 与检查器都要用它，
 * 放在独立模块里让「模板数据」与「尺寸公式」各自可读。原文件继续转发这三个导出，
 * 调用点不变。
 */

export function timeComponentDimensions(timeOptions: Record<string, unknown> = {}) {
  const max = Math.max(12, Math.min(500, Number(timeOptions.fontSize || 96))),
    letterSpacing = Math.max(-20, Math.min(100, Number(timeOptions.letterSpacing || 0))),
    shouldShowSeconds = timeOptions.showSeconds === true,
    num = timeOptions.hour12 === true ? (shouldShowSeconds ? 11 : 8) : shouldShowSeconds ? 8 : 5,
    fontWeight = Number(timeOptions.fontWeight ?? 0.4),
    widthScale = (fontWeight > 1 ? (fontWeight - 1) / 899 : fontWeight) >= 0.67 ? 1.035 : 1
  return {
    width: Math.max(max, max * 0.61 * num * widthScale + letterSpacing * Math.max(0, num - 1) + max * 0.16),
    height: Math.max(20, max * 1.18),
  }
}

export function dateComponentDimensions(dateOptions: Record<string, unknown> = {}) {
  const primarySize = Math.max(12, Math.min(500, Number(dateOptions.primarySize || 36))),
    lunarSize = Math.max(10, Math.min(500, Number(dateOptions.lunarSize || 24))),
    primarySpacing = Math.max(-20, Math.min(100, Number(dateOptions.primarySpacing || 1))),
    lunarSpacing = Math.max(-20, Math.min(100, Number(dateOptions.lunarSpacing || 1))),
    lineGap = Math.max(0, Math.min(200, Number(dateOptions.lineGap ?? 8))),
    primaryLineHeight = dateOptions.showWeekday === false ? 6.35 : 9.35,
    lunarLineHeight = 6,
    primaryWidth = primarySize * primaryLineHeight + primarySpacing * 13,
    lunarWidth = lunarSize * lunarLineHeight + lunarSpacing * 5,
    shouldShowLunar = dateOptions.showLunar === true
  return {
    width: Math.max(primarySize, primaryWidth, shouldShowLunar ? lunarWidth : 0) + primarySize * 0.12,
    height: primarySize * 1.16 + (shouldShowLunar ? lunarSize * 1.18 + lineGap : 0),
  }
}

export function weatherComponentDimensions(weatherOptions: Record<string, unknown> = {}) {
  const iconSize = Math.max(12, Math.min(500, Number(weatherOptions.iconSize || 64))),
    temperatureSize = Math.max(12, Math.min(500, Number(weatherOptions.temperatureSize || 32))),
    secondarySize = Math.max(10, Math.min(500, Number(weatherOptions.secondarySize || 18))),
    iconGap = Math.max(0, Math.min(300, Number(weatherOptions.iconGap ?? 22))),
    weatherLineGap = Math.max(0, Math.min(200, Number(weatherOptions.lineGap ?? 7))),
    hasSecondaryReadings =
      weatherOptions.temperatureVisible !== false ||
      weatherOptions.conditionVisible !== false ||
      weatherOptions.humidityVisible !== false,
    temperatureWidth = weatherOptions.temperatureVisible === false ? 0 : temperatureSize * 4.4,
    secondaryWidth =
      weatherOptions.conditionVisible === false && weatherOptions.humidityVisible === false ? 0 : secondarySize * 8.6,
    readingsWidth = hasSecondaryReadings ? Math.max(temperatureWidth, secondaryWidth, secondarySize * 3) : 0,
    readingsHeight =
      (weatherOptions.temperatureVisible === false ? 0 : temperatureSize * 1.12) +
      (weatherOptions.conditionVisible === false && weatherOptions.humidityVisible === false
        ? 0
        : secondarySize * 1.14 + weatherLineGap)
  return {
    width: Math.max(
      20,
      (weatherOptions.iconVisible === false ? 0 : iconSize + (hasSecondaryReadings ? iconGap : 0)) + readingsWidth,
    ),
    height: Math.max(20, weatherOptions.iconVisible === false ? 0 : iconSize, readingsHeight),
  }
}
