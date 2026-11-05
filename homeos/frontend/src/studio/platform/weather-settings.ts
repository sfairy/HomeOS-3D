/**
 * 天气特效的纯函数层：实体 ID 校验 + 实体显示名 + HA 状态 → 可渲染的天气态。
 *
 * 放在 platform 而不是 runtime：配置面板（`app/bridge/editor.ts` 的天气预览按钮组）
 * 与运行时特效（`runtime/environment/weather-effects.ts`）都要用同一张
 * 「哪些 HA 状态有对应 3D 效果」的表，而 app ↛ runtime 是硬边界。
 *
 * 这张表是**唯一口径**：预览按钮、运行时预设、合法状态校验都从 `WEATHER_EFFECTS` 派生，
 * 新增一种天气只改这里（以及在渲染层补一条同名预设）。
 */

/**
 * 可渲染的天气效果键（等于归一后的 HA `weather.*` state）。
 *
 * 一共六种：雨 / 雪 / 雷雨 / 雨夹雪这四种降水天气，外加**多云**与**晴夜**两种
 * 只画局部元素的天气——多云是一朵朵漂移的云，晴夜是一闪一闪的星。
 *
 * **所有效果都不许有背景遮盖层**：没有全屏天空渐变、没有压下来的云幕、没有雾幕、
 * 没有全屏调色与暗角。天气层是一张透明画布，画面里只能出现「具体的物体」
 * （雨丝、雪花、云朵、星星、地面水痕），绝不能给整屏上一层色。
 * 晴、阴、雾、霾、大风、冰雹仍不出特效。大雨（`pouring`）按普通下雨处理。
 */
export type WeatherEffectKey = 'rainy' | 'snowy' | 'lightning-rainy' | 'snowy-rainy' | 'partlycloudy' | 'clear-night'

/** 单个效果键的元数据：按钮文案、是否可手动预览、HA 同义 state。 */
export type WeatherEffectDefinition = {
  /** 预览按钮与面板内文案用的短标签。 */
  readonly label: string
  /** 是否出现在编辑器的「天气预览」按钮组里。 */
  readonly preview: boolean
  /** HA 里表达同一效果、但写法不同的 state。 */
  readonly aliases: readonly string[]
}

/**
 * 效果键清单。**顺序即预览按钮顺序**（降水在前，只有局部元素的天气在后）。
 *
 * 别名只做「归并到六种效果」，不新增效果种类：雨量档位（毛毛雨 / 大雨 / 暴雨）
 * 全部落到雨，雷电单独出现时也按雷雨处理（只有它有闪电层）。
 */
export const WEATHER_EFFECTS: Readonly<Record<WeatherEffectKey, WeatherEffectDefinition>> = Object.freeze({
  rainy: {
    label: '雨',
    preview: true,
    aliases: [
      'rain',
      'showers',
      'light-rain',
      'drizzle-rain',
      'pouring',
      'heavy-rain',
      'downpour',
      'extreme-rain',
      'moderate-rain',
    ],
  },
  snowy: {
    label: '雪',
    preview: true,
    aliases: ['snow', 'light-snow', 'moderate-snow', 'heavy-snow', 'blizzard'],
  },
  'lightning-rainy': {
    label: '雷雨',
    preview: true,
    aliases: ['storm', 'thunderstorm', 'thunder'],
  },
  'snowy-rainy': { label: '雨夹雪', preview: true, aliases: ['sleet', 'snow-rain', 'rain-snow'] },
  partlycloudy: {
    label: '多云',
    preview: true,
    aliases: ['partly-cloudy', 'partly-cloudy-day', 'partly-cloudy-night', 'broken-clouds'],
  },
  'clear-night': {
    label: '晴夜',
    preview: true,
    aliases: ['night', 'sunny-night', 'clear-night', 'starry'],
  },
})

/**
 * 这几个 state 表示「实体根本没有有效天气」，必须直接判空，**不能再去读属性**——
 * 否则离线实体只要属性里还留着上次的 `skycon`，画面就会一直下雪。
 *
 * `unknown` 也算在内：它代表「实体状态读不出来」（刚重连、集成重启、实体被改名），
 * 此时属性里那套机读枚举同样是上一轮的残留，拿来出效果只会画出过期的天气。
 * 空串同理——配置里只写了实体 ID、状态还没到达时，属性一定是空的或过期的。
 */
const UNAVAILABLE_STATES = Object.freeze(['', 'none', 'unknown', 'unavailable'])

/** 预览时长：运行时到期自动恢复真实天气，面板文案用同一份数字。 */
export const WEATHER_PREVIEW_TIMEOUT_MS = 12000

/** 可手动预览的效果键（顺序即按钮顺序）。 */
export const WEATHER_PREVIEW_KEYS: readonly WeatherEffectKey[] = Object.freeze(
  (Object.keys(WEATHER_EFFECTS) as WeatherEffectKey[]).filter((key) => WEATHER_EFFECTS[key].preview),
)

/**
 * 预览按钮清单，保持 `[state, label]` 元组形状（编辑器按它直接生成按钮）。
 */
export const WEATHER_PREVIEWS: ReadonlyArray<readonly [WeatherEffectKey, string]> = Object.freeze(
  WEATHER_PREVIEW_KEYS.map((key) => [key, WEATHER_EFFECTS[key].label] as const),
)

/** 天气实体必须是 `weather.<...>`；长度上限 200 与后端 `config_sections_core` 保持一致。 */
const WEATHER_ENTITY_PATTERN = /^weather\.[a-z0-9_]{1,200}$/

/** HA state → 效果键：效果键自身 + 各条别名的反查表。 */
const WEATHER_STATE_ALIASES: Readonly<Record<string, WeatherEffectKey>> = (() => {
  const aliases: Record<string, WeatherEffectKey> = {}
  for (const key of Object.keys(WEATHER_EFFECTS) as WeatherEffectKey[]) {
    aliases[key] = key
    for (const alias of WEATHER_EFFECTS[key].aliases) aliases[alias] = key
  }
  return Object.freeze(aliases)
})()

/**
 * 去掉分隔符后的反查表：`MODERATE_RAIN_DAY` / `moderateRainDay` 都能落到 `rainy`。
 *
 * 只收录能归并到已支持效果的机读枚举；晴 / 阴 / 雾 / 霾 / 大风这类
 * 「不画特效」的状态**故意不登记**，解析结果为空串时天气层连画布都不会建。
 */
const WEATHER_COMPACT_ALIASES: Readonly<Record<string, WeatherEffectKey>> = (() => {
  const compact: Record<string, WeatherEffectKey> = {}
  for (const [alias, key] of Object.entries(WEATHER_STATE_ALIASES)) compact[alias.replace(/[\s_-]+/g, '')] = key
  return Object.freeze({
    ...compact,
    // 国内天气集成的机读枚举（彩云 / 和风等）用的是另一套词表。
    rainynight: 'rainy',
    lightrainday: 'rainy',
    moderaterainday: 'rainy',
    heavyrainday: 'rainy',
    lightrain: 'rainy',
    moderaterain: 'rainy',
    heavyrain: 'rainy',
    stormrain: 'rainy',
    lightsnow: 'snowy',
    moderatesnow: 'snowy',
    heavysnow: 'snowy',
    stormsnow: 'snowy',
    thunderstorm: 'lightning-rainy',
    thunder: 'lightning-rainy',
    sleet: 'snowy-rainy',
    partlycloudyday: 'partlycloudy',
    partlycloudynight: 'partlycloudy',
    clearnight: 'clear-night',
    sunnynight: 'clear-night',
  })
})()

/**
 * 中文天气描述 → 效果键，**按顺序取第一个命中**。
 *
 * 顺序很重要：`雷阵雨` / `雨夹雪` 必须先于 `雨`，`暴雪` 必须先于 `雪`，
 * `晴夜` 必须先于 `晴`（否则「晴夜」会被当成「晴」而判空），
 * 所以「晴夜」也压在所有含「晴」的片段之前。
 *
 * 表里没有的天气（晴 / 阴 / 雾 / 霾 / 大风 / 冰雹 …）返回空串：它们不产生 3D 特效。
 */
const WEATHER_TEXT_ALIASES: ReadonlyArray<readonly [string, WeatherEffectKey]> = Object.freeze([
  ['雷阵雨', 'lightning-rainy'],
  ['雷雨', 'lightning-rainy'],
  ['雷暴', 'lightning-rainy'],
  ['雷电', 'lightning-rainy'],
  ['雨夹雪', 'snowy-rainy'],
  ['雨雪', 'snowy-rainy'],
  ['特大暴雨', 'rainy'],
  ['大暴雨', 'rainy'],
  ['暴雨', 'rainy'],
  ['大雨', 'rainy'],
  ['中雨', 'rainy'],
  ['阵雨', 'rainy'],
  ['小雨', 'rainy'],
  ['毛毛雨', 'rainy'],
  ['细雨', 'rainy'],
  ['暴雪', 'snowy'],
  ['大雪', 'snowy'],
  ['中雪', 'snowy'],
  ['小雪', 'snowy'],
  ['阵雪', 'snowy'],
  // 「晴夜」系列必须整体命中，绝不能落到含「晴」的片段上去。
  ['晴夜', 'clear-night'],
  ['晴朗夜晚', 'clear-night'],
  ['星空', 'clear-night'],
  ['夜晚', 'clear-night'],
  ['夜间', 'clear-night'],
  ['多云', 'partlycloudy'],
  ['局部多云', 'partlycloudy'],
  ['晴间多云', 'partlycloudy'],
  ['雨', 'rainy'],
  ['雪', 'snowy'],
])

/**
 * 把任意一种「天气文本」翻译成效果键：英文 state、机读枚举、中文描述都吃。
 *
 * 这是「绑了实体却不出效果」的主因修复：国内天气集成常把 `state` 写成
 * 「中雨」，机读值放在 `attributes.skycon`（如 `MODERATE_RAIN_DAY`），
 * 只认 `weather.rainy` 的实现会直接判空。
 */
export function resolveWeatherEffectText(value: unknown): WeatherEffectKey | '' {
  const text = normalizeWeatherState(value)
  if (!text) return ''
  const direct = WEATHER_STATE_ALIASES[text]
  if (direct) return direct
  const compact = WEATHER_COMPACT_ALIASES[text.replace(/[\s_-]+/g, '')]
  if (compact) return compact
  for (const [fragment, key] of WEATHER_TEXT_ALIASES) if (text.includes(fragment)) return key
  return ''
}

/**
 * 明确「不产生 3D 特效」的天气。
 *
 * 这类 state 必须与「解不出来」区分开：解不出来时可以退到属性里的机读枚举，
 * 而「晴」是**确定没有特效**——它的属性里若还留着上一轮的 `skycon: "SNOWY"`，
 * 继续退下去就会在晴天飘雪。命中这里直接判空。
 *
 * 多云（`partlycloudy`）与晴夜（`clear-night`）**不在这里**：它们是要出云 / 出星的。
 */
const NON_EFFECT_STATES = Object.freeze([
  'sunny',
  'clearday',
  'clear',
  'clear-day',
  'cloudy',
  'cloudynight',
  'overcast',
  'fog',
  'mist',
  'haze',
  'smoke',
  'dust',
  'sand',
  'duststorm',
  'sandstorm',
  'sandy',
  'wind',
  'windy',
  'windyvariant',
  'windynight',
  'gale',
  'hail',
  'hailstorm',
  'exceptional',
])

/** 中文的「晴 / 阴 / 雾 / 霾 / 风 / 冰雹」等不产生特效的天气片段。 */
const NON_EFFECT_TEXT_FRAGMENTS = Object.freeze([
  '晴',
  '阴',
  '雾',
  '霾',
  '浮尘',
  '扬沙',
  '沙尘',
  '大风',
  '台风',
  '强风',
  '冰雹',
])

function isKnownNonEffectWeather(text: string): boolean {
  const compact = text.replace(/[\s_-]+/g, '')
  return NON_EFFECT_STATES.includes(compact) || NON_EFFECT_TEXT_FRAGMENTS.some((fragment) => text.includes(fragment))
}

/** 实体属性里可能存天气的字段，按可信度排序。 */
const WEATHER_ATTRIBUTE_KEYS = ['condition_desc', 'skycon', 'condition', 'condition_code', 'weather'] as const

function textAttribute(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  return typeof value === 'string' ? value : ''
}

type WeatherStateRecord = {
  state?: unknown
  available?: unknown
  attributes?: Record<string, unknown> | null
}

/** 事件载荷可能包一层 `newState`；普通状态对象与纯 state 字符串也一并吃下。 */
function unwrapWeatherState(input: unknown): WeatherStateRecord | null {
  if (typeof input === 'string') return { state: input }
  if (!input || typeof input !== 'object') return null
  const wrapped = (input as { newState?: unknown }).newState
  return (wrapped && typeof wrapped === 'object' ? wrapped : input) as WeatherStateRecord
}

function normalizeWeatherState(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

/**
 * 从场景配置的 `weather` 段取天气实体 ID。
 *
 * 非法值（缺省、域名写成了别的域、超长）一律返回空串，调用方据此判定「未绑定」。
 */
export function weatherEntityId(properties: unknown): string {
  const entityId = (properties as { entityId?: unknown } | null | undefined)?.entityId
  return typeof entityId === 'string' && WEATHER_ENTITY_PATTERN.test(entityId) ? entityId : ''
}

/**
 * 场景配置里所有可能的天气绑定字段（按可信度排序、已去重、已校验）。
 *
 * 标准形状是 `weather.entityId`；旧版配置与部分集成还会写顶层 `weatherEntityId`
 * 或 `weather.entity_id`。**订阅与读取必须用同一份清单**：
 * 运行时按第一个合法值取天气，订阅却只认标准形状时，实体状态根本不会推下来——
 * 表现就是「绑了天气实体却一直是原样」，而实体选择器里明明显示已绑定。
 */
export function weatherEntityIds(properties: unknown): string[] {
  const record = (properties || {}) as Record<string, unknown>
  const weatherSection = record.weather as { entityId?: unknown; entity_id?: unknown } | null | undefined
  const entityIds: string[] = []
  for (const candidate of [weatherSection?.entityId, record.weatherEntityId, weatherSection?.entity_id]) {
    const entityId = weatherEntityId({ entityId: candidate })
    if (entityId && !entityIds.includes(entityId)) entityIds.push(entityId)
  }
  return entityIds
}

/** 运行时实际跟随的天气实体：清单里的第一项，没有绑定就是空串。 */
export function boundWeatherEntityId(properties: unknown): string {
  return weatherEntityIds(properties)[0] || ''
}

/**
 * 读一个实体状态。状态中枢（`renderer.states`）是 `Map`，而配置草稿 / 序列化快照里
 * 是普通对象，两种形状都要能吃下 —— 否则绑定按钮就只能显示实体 ID。
 */
export function weatherEntityState(states: unknown, entityId: string): unknown {
  if (!entityId || !states) return null
  if (states instanceof Map) return states.get(entityId) ?? null
  return (states as Record<string, unknown>)[entityId] ?? null
}

function attributeName(source: unknown): string {
  if (!source || typeof source !== 'object') return ''
  const record = source as { attributes?: { friendly_name?: unknown } | null; name?: unknown }
  const friendlyName = record.attributes?.friendly_name
  if (typeof friendlyName === 'string' && friendlyName.trim()) return friendlyName.trim()
  return typeof record.name === 'string' ? record.name.trim() : ''
}

/**
 * 天气绑定按钮的显示文案：优先 HA 实时 `friendly_name`，其次实体目录里的 `name`，
 * 最后才回落到实体 ID。
 *
 * 按钮显示名而不是 `entityId`（如 `weather.wulumuqi`），ID 退到按钮的 `title`
 * （悬停可见），排障时仍拿得到。
 */
export function weatherEntityLabel(entityId: string, entity?: unknown, state?: unknown): string {
  // 空 ID 就是「未绑定」：哪怕调用方顺手塞了实体对象，也不能把名字当成已绑定。
  if (!entityId) return ''
  for (const candidate of [state, unwrapWeatherState(state), entity]) {
    const text = attributeName(candidate)
    if (text) return text
  }
  return entityId.trim()
}

/**
 * 把 HA 的天气实体状态翻译成可渲染的效果键，无法渲染时返回空串。
 *
 * 入参既可以是状态对象、带 `newState` 的事件载荷，也可以是预览用的裸 state 字符串。
 * `available: false`（实体不可用）不算天气态 —— 否则离线实体也会一直下雪。
 */
export function weatherEffectKey(input: unknown): WeatherEffectKey | '' {
  const source = unwrapWeatherState(input)
  if (!source || source.available === false) return ''
  const state = normalizeWeatherState(source.state)
  // 空 / none / unknown / unavailable：实体当前没有可用天气，属性里那套机读枚举
  // 也是上一轮的残留，不能拿来出效果（否则离线实体会一直下雪）。
  if (UNAVAILABLE_STATES.includes(state)) return ''
  const fromState = resolveWeatherEffectText(state)
  if (fromState) return fromState
  // 「晴 / 多云 / 阴 / 雾 / 霾 / 大风 / 冰雹 / 夜间」等明确不出特效：直接判空，
  // 不能退到属性——属性里的机读枚举可能是上一轮残留（晴天飘雪就是这么来的）。
  if (isKnownNonEffectWeather(state)) return ''
  // state 是人话但不在词表里（如厂商自定义「小雨转多云」）：退到属性的机读枚举。
  const attributes = source.attributes
  if (!attributes) return ''
  for (const attributeKey of WEATHER_ATTRIBUTE_KEYS) {
    const attributeText = normalizeWeatherState(textAttribute(attributes, attributeKey))
    const resolved = resolveWeatherEffectText(attributeText)
    if (resolved) return resolved
    // 优先级更高的属性已经明确说了「晴 / 多云 …」：同样不该被更低的机读枚举推翻。
    if (attributeText && isKnownNonEffectWeather(attributeText)) return ''
  }
  return ''
}

/** 风速单位换算：国内集成常用 km/h，而风速归一基准是 m/s。 */
const WIND_UNIT_TO_MPS: Readonly<Record<string, number>> = Object.freeze({
  'km/h': 1 / 3.6,
  kmh: 1 / 3.6,
  kph: 1 / 3.6,
  '公里/小时': 1 / 3.6,
  '千米/小时': 1 / 3.6,
  mph: 0.44704,
  'm/s': 1,
  ms: 1,
  mps: 1,
  '米/秒': 1,
  kn: 0.514444,
  kt: 0.514444,
  knots: 0.514444,
  节: 0.514444,
})

/**
 * 没有 `wind_speed_unit` 时的缺省换算：按 m/s 读。
 *
 * HA 的气象实体会把 `wind_speed` 与 `wind_speed_unit` 一起下发，所以有单位时走
 * 上表；没有单位时只能取最保守的 m/s —— 把 km/h 当 m/s 只会让风偏大，
 * 而把 m/s 当 km/h 会让大风天完全没反应。
 */
const DEFAULT_WIND_UNIT_SCALE = 1

/** 天气实体的风速（m/s）；缺失或非法时按 0 处理，上限 30 钳制异常值。 */
export function weatherWindSpeed(input: unknown): number {
  const source = unwrapWeatherState(input)
  const value = Number(source?.attributes?.wind_speed)
  if (!Number.isFinite(value)) return 0
  const unit = normalizeWeatherState(source?.attributes?.wind_speed_unit)
  const scale = unit ? (WIND_UNIT_TO_MPS[unit] ?? DEFAULT_WIND_UNIT_SCALE) : DEFAULT_WIND_UNIT_SCALE
  return Math.min(30, Math.max(0, value * scale))
}
