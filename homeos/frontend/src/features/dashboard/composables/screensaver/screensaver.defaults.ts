/**
 * @file screensaver.defaults.ts
 * @module frontend/src/composables/ui
 */

/**
 * 屏保默认配置的唯一真源在 `shared/constants/screensaver-defaults`：
 * 配置兜底（shared/utils/config/frontend-config.ts）与面板草稿必须用同一份数字，
 * 而 `shared/**` 不能反向引用 composables，所以常量放在 shared、这里只做转出。
 */
export { SS_DEFAULTS } from '@/kernel/constants/screensaver-defaults'
export type { ScreensaverDefaults } from '@/kernel/constants/screensaver-defaults'

/** 天气状态 → emoji 映射（与 WEATHER_LABELS 键对齐） */
export const WEATHER_ICON_EMOJI = {
  sunny: '☀️',
  'clear-day': '☀️',
  clear: '☀️',
  excellent: '☀️',
  fine: '☀️',
  'clear-night': '🌙',
  partlycloudy: '⛅',
  'partly-cloudy': '⛅',
  cloudy: '☁️',
  rainy: '🌧️',
  pouring: '🌧️',
  drizzle: '🌦️',
  lightning: '⛈️',
  thunderstorm: '⛈️',
  storm: '⛈️',
  snowy: '❄️',
  sleet: '🌨️',
  'snowy-rainy': '🌨️',
  hail: '🧊',
  windy: '💨',
  wind: '💨',
  fog: '🌫️',
  mist: '🌫️',
  haze: '🌫️',
  smoke: '🌫️',
  sandstorm: '🏜️',
  dust: '🏜️',
  tornado: '🌪️',
}
