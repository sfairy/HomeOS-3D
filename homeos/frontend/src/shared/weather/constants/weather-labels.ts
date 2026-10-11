/**
 * HA weather 实体 state → 中文天气文案与视觉分类
 *
 * 职责：
 * - 把 Home Assistant `weather` 域实体的 state 翻译为简体中文
 * - 把近义状态收敛为展示用 visual key（卡片/预报/顶栏共用）
 */
const WEATHER_LABELS: Record<string, string> = {
  'clear-night': '晴朗(夜)',
  cloudy: '阴天',
  overcast: '阴天',
  fog: '大雾',
  mist: '薄雾',
  haze: '霾',
  smoke: '烟霾',
  lightning: '雷阵雨',
  'lightning-rainy': '雷阵雨',
  thunderstorm: '雷暴',
  storm: '暴风雨',
  partlycloudy: '局部多云',
  'partly-cloudy': '局部多云',
  pouring: '大雨',
  rainy: '下雨',
  rain: '下雨',
  drizzle: '毛毛雨',
  snowy: '下雪',
  snow: '下雪',
  'snowy-rainy': '雨夹雪',
  sleet: '雨夹雪',
  sunny: '晴朗',
  clear: '晴朗',
  windy: '大风',
  'windy-variant': '大风',
  hail: '冰雹',
  rainbow: '彩虹',
  sandstorm: '沙尘暴',
  dust: '扬尘',
  'dust-storm': '沙尘暴',
  sandy: '沙尘',
  exceptional: '极端天气',
  aurora: '极光',
}

export type WeatherVisualKey =
  | 'sunny'
  | 'clear-night'
  | 'cloudy'
  | 'partlycloudy'
  | 'rainy'
  | 'pouring'
  | 'drizzle'
  | 'lightning'
  | 'snowy'
  | 'sleet'
  | 'windy'
  | 'fog'
  | 'haze'
  | 'hail'
  | 'sandstorm'

const VISUAL_KEY_MAP: Record<string, WeatherVisualKey> = {
  sunny: 'sunny',
  clear: 'sunny',
  'clear-night': 'clear-night',
  cloudy: 'cloudy',
  overcast: 'cloudy',
  partlycloudy: 'partlycloudy',
  'partly-cloudy': 'partlycloudy',
  rainy: 'rainy',
  rain: 'rainy',
  pouring: 'pouring',
  drizzle: 'drizzle',
  lightning: 'lightning',
  'lightning-rainy': 'lightning',
  thunderstorm: 'lightning',
  storm: 'lightning',
  snowy: 'snowy',
  snow: 'snowy',
  'snowy-rainy': 'sleet',
  sleet: 'sleet',
  windy: 'windy',
  'windy-variant': 'windy',
  fog: 'fog',
  mist: 'fog',
  haze: 'haze',
  smoke: 'haze',
  hail: 'hail',
  rainbow: 'partlycloudy',
  sandstorm: 'sandstorm',
  dust: 'sandstorm',
  'dust-storm': 'sandstorm',
  sandy: 'sandstorm',
  exceptional: 'cloudy',
  aurora: 'clear-night',
}

/** 将 HA / 调试 state 收敛为展示用 visual key */
export function weatherVisualKey(state: string | undefined | null): WeatherVisualKey {
  const s = String(state || '')
    .toLowerCase()
    .trim()
  if (VISUAL_KEY_MAP[s]) return VISUAL_KEY_MAP[s]
  if (s.includes('hail')) return 'hail'
  if (s.includes('thunder') || s.includes('lightning')) return 'lightning'
  if (s.includes('pouring') || s.includes('heavy')) return 'pouring'
  if (s.includes('drizzle')) return 'drizzle'
  if (s.includes('sleet') || s.includes('snowy-rainy')) return 'sleet'
  if (s.includes('snow')) return 'snowy'
  if (s.includes('haze') || s.includes('smoke')) return 'haze'
  if (s.includes('fog') || s.includes('mist')) return 'fog'
  if (s.includes('sand') || s.includes('dust')) return 'sandstorm'
  if (s.includes('wind')) return 'windy'
  if (s.includes('rain')) return 'rainy'
  if (s.includes('partly')) return 'partlycloudy'
  if (s.includes('cloud') || s.includes('overcast')) return 'cloudy'
  if (s.includes('night') || s === 'clear-night') return 'clear-night'
  if (s.includes('clear') || s.includes('sunny') || s === 'day') return 'sunny'
  return 'sunny'
}

export function weatherStateLabel(state: string | undefined | null): string {
  const s = String(state || '')
    .toLowerCase()
    .trim()
  if (!s) return '未知'
  return WEATHER_LABELS[s] || WEATHER_LABELS[weatherVisualKey(s)] || s
}
