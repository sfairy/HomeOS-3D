/**
 * 天气特效 UI 常量（滑块 / 预设 / 场景分组）
 *
 * 职责：
 * - 维护天气特效设置页的全局滑块定义（粒子密度 / 风速 / 属性混合权重 等）。
 * - 维护特效预设档位（逼真 / 均衡 / 电影）与展示路由分组。
 * - 维护天气场景字段与场景分组，供设置页天气特效面板渲染。
 *
 * 依赖：
 * - @/utils/weather/display-routes.util 的展示路由分组。
 * - @/utils/settings/range-steps.util 的滑块步长与场景字段定义。
 * - @lucide/vue 图标组件。
 *
 * 注意：
 * - `id` / `key`（realistic / densityMultiplier / ...）为配置 key，不翻译。
 * - `accent` 为 CSS 颜色值，不翻译。
 * - 仅面向用户的 label / desc / hint 使用简体中文。
 */
/** 天气特效 UI 常量（滑块/预设/场景分组） */
import { SETTINGS_RANGE_STEP, weatherSceneField } from '@/utils/settings/range-steps.util'
import { Clapperboard, Scale, Sun } from '@lucide/vue'

/** presetOptions：常量集合，成员语义见定义处。 */
export const presetOptions = [
  { id: 'realistic', label: '逼真', desc: '贴合实况', icon: Sun, accent: '#38bdf8' },
  { id: 'balanced', label: '均衡', desc: '默认效果', icon: Scale, accent: '#60a5fa' },
  { id: 'cinematic', label: '电影', desc: '高密度光效', icon: Clapperboard, accent: '#c084fc' },
]

/** globalSliders：常量集合，成员语义见定义处。 */
export const globalSliders = [
  {
    key: 'densityMultiplier',
    label: '粒子密度倍率',
    min: 0.3,
    max: 2,
    step: SETTINGS_RANGE_STEP.multiplier,
    unit: '×',
    hint: '影响雨雪、飘叶等粒子数量',
  },
  {
    key: 'windMultiplier',
    label: '风速倍率',
    min: 0,
    max: 3,
    step: SETTINGS_RANGE_STEP.multiplier,
    unit: '×',
    hint: '放大或减弱风向对粒子的影响',
  },
  {
    key: 'attributeBlend',
    label: '实体属性混合权重',
    min: 0,
    max: 1,
    step: SETTINGS_RANGE_STEP.weight,
    hint: '逼真模式下实体数据与用户值的混合比例',
  },
  { key: 'starCount', label: '星星数量', min: 50, max: 800, step: SETTINGS_RANGE_STEP.starCount },
  { key: 'cloudLayers', label: '云层数量', min: 2, max: 12, step: SETTINGS_RANGE_STEP.integer },
  {
    key: 'shootingStarRate',
    label: '流星概率',
    min: 0,
    max: 0.01,
    step: SETTINGS_RANGE_STEP.probabilityTiny,
    hint: '每帧出现流星的概率，建议小幅调整',
  },
]

/** 所有场景共用的天空氛围滑块（着色/压暗） */
const skySceneFields = [
  weatherSceneField('skyTint', '天空着色', 'effectStrength'),
  weatherSceneField('skyDarken', '顶部压暗', 'effectStrength'),
]

/** sceneGroups：常量集合，成员语义见定义处。 */
export const sceneGroups = [
  {
    key: 'clearDay',
    emoji: '☀️',
    label: '晴天',
    accent: '#fbbf24',
    desc: '太阳晕、热浪与尘埃微粒（无天空罩色）',
    fields: [
      weatherSceneField('sunGlow', '太阳晕强度', 'effectStrength'),
      weatherSceneField('heatHaze', '热浪扭曲', 'effectStrength'),
      weatherSceneField('dustMotes', '尘埃微粒', 'effectStrength'),
    ],
  },
  {
    key: 'clearNight',
    emoji: '🌙',
    label: '晴朗夜间',
    accent: '#818cf8',
    desc: '星空亮度与月光晕（无天空罩色）',
    fields: [
      weatherSceneField('starBrightness', '星星亮度', 'effectStrength'),
      weatherSceneField('moonGlow', '月光晕', 'effectStrength'),
    ],
  },
  {
    key: 'partlyCloudy',
    emoji: '⛅',
    label: '局部多云',
    accent: '#38bdf8',
    desc: '阳光束、尘埃与云层漂移',
    fields: [
      weatherSceneField('sunbeam', '阳光束强度', 'effectStrength'),
      weatherSceneField('dustMotes', '尘埃微粒', 'effectStrength'),
      weatherSceneField('driftSpeed', '云层漂移', 'driftSpeed'),
      ...skySceneFields,
    ],
  },
  {
    key: 'cloudy',
    emoji: '☁️',
    label: '阴天',
    accent: '#94a3b8',
    desc: '云层浓度与漂移',
    fields: [
      weatherSceneField('opacity', '云层浓度', 'effectStrength'),
      weatherSceneField('driftSpeed', '云层漂移', 'driftSpeed'),
      ...skySceneFields,
    ],
  },
  {
    key: 'drizzle',
    emoji: '🌦️',
    label: '毛毛雨',
    accent: '#7dd3fc',
    desc: '细小雨丝与雨雾',
    fields: [
      weatherSceneField('intensity', '雨丝强度', 'effectStrength'),
      weatherSceneField('mist', '雨雾浓度', 'effectStrength'),
      ...skySceneFields,
    ],
  },
  {
    key: 'rain',
    emoji: '🌧️',
    label: '下雨',
    accent: '#60a5fa',
    hasPuddle: true,
    desc: '降雨强度与玻璃雨滴',
    fields: [
      weatherSceneField('intensity', '降雨强度', 'effectStrength'),
      weatherSceneField('glassDrops', '玻璃雨滴', 'effectStrength'),
      ...skySceneFields,
    ],
  },
  {
    key: 'heavyRain',
    emoji: '🌧️',
    label: '大雨',
    accent: '#3b82f6',
    desc: '暴雨强度与顶部压暗',
    fields: [
      weatherSceneField('intensity', '暴雨强度', 'effectStrength'),
      weatherSceneField('darkening', '顶部压暗', 'effectStrength'),
      ...skySceneFields,
    ],
  },
  {
    key: 'thunderstorm',
    emoji: '⛈️',
    label: '雷阵雨',
    accent: '#a78bfa',
    desc: '闪电间隔与局部闪光',
    fields: [
      weatherSceneField('rainIntensity', '暴雨强度', 'effectStrength'),
      weatherSceneField('lightningMinMs', '闪电最短间隔 (ms)', 'lightningMinMs'),
      weatherSceneField('lightningMaxMs', '闪电最长间隔 (ms)', 'lightningMaxMs'),
      weatherSceneField('flashStrength', '闪光强度', 'effectStrength'),
      ...skySceneFields,
    ],
  },
  {
    key: 'snow',
    emoji: '❄️',
    label: '下雪',
    accent: '#e2e8f0',
    desc: '降雪、积雪与冷色调',
    fields: [
      weatherSceneField('intensity', '降雪强度', 'effectStrength'),
      weatherSceneField('accumulation', '积雪层', 'effectStrength'),
      weatherSceneField('coldTint', '冷色色调', 'effectStrength'),
      ...skySceneFields,
    ],
  },
  {
    key: 'sleet',
    emoji: '🌨️',
    label: '雨雪混合',
    accent: '#cbd5e1',
    desc: '雨水与雪花占比',
    fields: [
      weatherSceneField('rainRatio', '雨水占比', 'ratio'),
      weatherSceneField('snowRatio', '雪花占比', 'ratio'),
      ...skySceneFields,
    ],
  },
  {
    key: 'windy',
    emoji: '💨',
    label: '大风',
    accent: '#86efac',
    desc: '飘叶密度与阵风强度',
    fields: [
      weatherSceneField('leafParticles', '飘叶密度', 'effectStrength'),
      weatherSceneField('gustStrength', '阵风强度', 'effectStrength'),
      ...skySceneFields,
    ],
  },
  {
    key: 'hail',
    emoji: '🧊',
    label: '冰雹',
    accent: '#bae6fd',
    desc: '冰雹密度与落地反弹',
    fields: [
      weatherSceneField('hailDensity', '冰雹密度', 'effectStrength'),
      weatherSceneField('hailBounce', '落地反弹', 'effectStrength'),
      ...skySceneFields,
    ],
  },
  {
    key: 'sandstorm',
    emoji: '🏜️',
    label: '沙尘暴',
    accent: '#d6a354',
    desc: '尘带、尘粒与近地尘锋',
    fields: [
      weatherSceneField('opacity', '尘带浓度', 'effectStrength'),
      weatherSceneField('intensity', '尘粒强度', 'effectStrength'),
      weatherSceneField('driftSpeed', '尘带漂移', 'driftSpeed'),
      ...skySceneFields,
    ],
  },
]
