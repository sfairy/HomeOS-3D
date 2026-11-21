/**
 * 屏保几何 / 显示默认值（唯一真源）。
 *
 * 两个消费方原本各抄了一份 25 个键：`composables/ui/screensaver/screensaver.defaults.ts`
 * （面板草稿的兜底）与 `shared/utils/config/frontend-config.ts`（公开配置拉取前的兜底）。
 * 抄两份的后果是「改了字号只改一处」—— 面板预览和真实配置从此不一致。
 *
 * 放在 `shared/constants` 而不是 composables：`shared/**` 不允许反向引用 composables，
 * 而配置兜底必须能在面板之外（无 UI 的启动路径）拿到同一份数字。
 */

/** 屏保默认配置（与配置文件合并使用） */
export const SS_DEFAULTS = {
  scale: 1.35,
  defaultMode: 'random',
  enableWeatherMode: false,
  instantEnter: true,
  instantLeave: true,
  brightness: 1,
  showBrand: true,
  showSeconds: true,
  showGregorianDate: true,
  showLunar: true,
  showWeatherIcon: true,
  showWeatherDesc: true,
  showWeatherStats: true,
  showWeatherMeta: true,
  timeSizeVw: 24,
  sepSizeVw: 17,
  secSizeVw: 7,
  metaSizeVw: 3,
  subMetaSizeVw: 2,
  brandSizePx: 22,
  weatherTempSizeVw: 22,
  weatherIconSizeVw: 10,
  weatherStatsSizePx: 15,
  brandTopVh: 5,
  contentShiftVh: 0,
} as const

export type ScreensaverDefaults = typeof SS_DEFAULTS
