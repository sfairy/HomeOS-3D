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

/** 可渲染的天气效果键（等于归一后的 HA `weather.*` state）。 */
export type WeatherEffectKey =
  | "drizzle"
  | "rainy"
  | "pouring"
  | "snowy"
  | "snowy-rainy"
  | "hail"
  | "lightning"
  | "lightning-rainy"
  | "fog"
  | "haze"
  | "windy"
  | "sunny"
  | "partlycloudy"
  | "cloudy"
  | "clear-night"
  | "exceptional";

/** 单个效果键的元数据：按钮文案、是否可手动预览、HA 同义 state。 */
export type WeatherEffectDefinition = {
  /** 预览按钮与面板内文案用的短标签。 */
  readonly label: string;
  /** 是否出现在编辑器的「天气预览」按钮组里。 */
  readonly preview: boolean;
  /** HA 里表达同一效果、但写法不同的 state。 */
  readonly aliases: readonly string[];
};

/**
 * 效果键清单。**顺序即预览按钮顺序**（先降水、再雾霾风、最后天空氛围）。
 *
 * `exceptional` 是设备异常告警态，不给手动预览入口：它表达的是「天气实体自身异常」，
 * 让用户主动预览一种故障状态没有意义。
 */
export const WEATHER_EFFECTS: Readonly<Record<WeatherEffectKey, WeatherEffectDefinition>> =
  Object.freeze({
    drizzle: { label: "毛毛雨", preview: true, aliases: ["light-rain", "drizzle-rain"] },
    rainy: { label: "雨", preview: true, aliases: ["rain", "showers"] },
    pouring: { label: "大雨", preview: true, aliases: ["heavy-rain", "downpour", "extreme-rain"] },
    lightning: { label: "雷电", preview: true, aliases: ["thunder"] },
    "lightning-rainy": { label: "雷雨", preview: true, aliases: ["storm", "thunderstorm"] },
    snowy: { label: "雪", preview: true, aliases: ["snow"] },
    "snowy-rainy": { label: "雨夹雪", preview: true, aliases: ["sleet", "snow-rain"] },
    hail: { label: "冰雹", preview: true, aliases: ["hailstorm"] },
    fog: { label: "雾", preview: true, aliases: ["mist"] },
    haze: { label: "霾", preview: true, aliases: ["smoke", "dust", "sandy", "sandstorm", "dust-storm"] },
    windy: { label: "大风", preview: true, aliases: ["wind", "windy-variant", "gale"] },
    sunny: { label: "晴", preview: true, aliases: ["clear", "clear-day"] },
    partlycloudy: { label: "多云", preview: true, aliases: ["partly-cloudy"] },
    cloudy: { label: "阴", preview: true, aliases: ["overcast"] },
    "clear-night": { label: "晴夜", preview: true, aliases: ["night", "sunny-night"] },
    exceptional: { label: "异常", preview: false, aliases: [] },
  });

/** HA 里表示「没有有效天气」的 state，命中时不出效果。 */
const EMPTY_STATES = Object.freeze(["", "none", "unknown", "unavailable"]);
/**
 * 这几个 state 是「实体根本不可用」，必须直接判空，不能再去读属性——
 * 否则离线实体只要属性里还留着上次的 `skycon`，画面就会一直下雪。
 */
const UNAVAILABLE_STATES = Object.freeze(["", "none", "unavailable"]);

/** 预览时长：运行时到期自动恢复真实天气，面板文案用同一份数字。 */
export const WEATHER_PREVIEW_TIMEOUT_MS = 12000;

/** 可手动预览的效果键（顺序即按钮顺序）。 */
export const WEATHER_PREVIEW_KEYS: readonly WeatherEffectKey[] = Object.freeze(
  (Object.keys(WEATHER_EFFECTS) as WeatherEffectKey[]).filter(
    (key) => WEATHER_EFFECTS[key].preview,
  ),
);

/**
 * 预览按钮清单，保持 `[state, label]` 元组形状（编辑器按它直接生成按钮）。
 */
export const WEATHER_PREVIEWS: ReadonlyArray<readonly [WeatherEffectKey, string]> = Object.freeze(
  WEATHER_PREVIEW_KEYS.map((key) => [key, WEATHER_EFFECTS[key].label] as const),
);

/** 天气实体必须是 `weather.<...>`；长度上限 200 与后端 `config_sections_core` 保持一致。 */
const WEATHER_ENTITY_PATTERN = /^weather\.[a-z0-9_]{1,200}$/;

/** HA state → 效果键：效果键自身 + 各条别名的反查表。 */
const WEATHER_STATE_ALIASES: Readonly<Record<string, WeatherEffectKey>> = (() => {
  const aliases: Record<string, WeatherEffectKey> = {};
  for (const key of Object.keys(WEATHER_EFFECTS) as WeatherEffectKey[]) {
    aliases[key] = key;
    for (const alias of WEATHER_EFFECTS[key].aliases) aliases[alias] = key;
  }
  return Object.freeze(aliases);
})();

/** 去掉分隔符后的反查表：`PARTLY_CLOUDY_DAY` / `partlyCloudyDay` 都能落到 `partlycloudy`。 */
const WEATHER_COMPACT_ALIASES: Readonly<Record<string, WeatherEffectKey>> = (() => {
  const compact: Record<string, WeatherEffectKey> = {};
  for (const [alias, key] of Object.entries(WEATHER_STATE_ALIASES)) compact[alias.replace(/[\s_-]+/g, "")] = key;
  return Object.freeze({
    ...compact,
    // 国内天气集成的机读枚举（彩云 / 和风等）用的是另一套词表。
    clearday: "sunny",
    clearnight: "clear-night",
    partlycloudyday: "partlycloudy",
    partlycloudynight: "partlycloudy",
    lightrain: "rainy",
    moderaterain: "rainy",
    heavyrain: "pouring",
    stormrain: "pouring",
    lightsnow: "snowy",
    moderatesnow: "snowy",
    heavysnow: "snowy",
    stormsnow: "snowy",
    lighthaze: "haze",
    moderatehaze: "haze",
    heavyhaze: "haze",
    dust: "haze",
    sand: "haze",
    duststorm: "haze",
    sandstorm: "haze",
    thunderstorm: "lightning-rainy",
    thunder: "lightning",
    wind: "windy",
    windspeed: "windy",
  });
})();

/**
 * 中文天气描述 → 效果键，**按顺序取第一个命中**。
 *
 * 顺序很重要：`暴雨` 必须先于 `雨`，`雨夹雪` 必须先于 `雪` 与 `雨`，
 * 否则「雨夹雪」会被拆成单纯的雨或雪。
 */
const WEATHER_TEXT_ALIASES: ReadonlyArray<readonly [string, WeatherEffectKey]> = Object.freeze([
  ["雷阵雨", "lightning-rainy"],
  ["雷雨", "lightning-rainy"],
  ["雷电", "lightning"],
  ["雨夹雪", "snowy-rainy"],
  ["雨雪", "snowy-rainy"],
  ["冰雹", "hail"],
  ["特大暴雨", "pouring"],
  ["大暴雨", "pouring"],
  ["暴雨", "pouring"],
  ["大雨", "pouring"],
  ["中雨", "rainy"],
  ["阵雨", "rainy"],
  ["小雨", "rainy"],
  ["毛毛雨", "drizzle"],
  ["细雨", "drizzle"],
  ["暴雪", "snowy"],
  ["大雪", "snowy"],
  ["中雪", "snowy"],
  ["小雪", "snowy"],
  ["阵雪", "snowy"],
  ["雾", "fog"],
  ["霾", "haze"],
  ["浮尘", "haze"],
  ["扬沙", "haze"],
  ["沙尘", "haze"],
  ["台风", "windy"],
  ["大风", "windy"],
  ["强风", "windy"],
  ["多云", "partlycloudy"],
  ["阴", "cloudy"],
  ["晴", "sunny"],
  ["雨", "rainy"],
  ["雪", "snowy"],
]);

/**
 * 把任意一种「天气文本」翻译成效果键：英文 state、机读枚举、中文描述都吃。
 *
 * 这是「绑了实体却不出效果」的主因修复：国内天气集成常把 `state` 写成
 * 「多云」，机读值放在 `attributes.skycon`（如 `PARTLY_CLOUDY_DAY`），
 * 只认 `weather.partlycloudy` 的实现会直接判空。
 */
export function resolveWeatherEffectText(value: unknown): WeatherEffectKey | "" {
  const text = normalizeWeatherState(value);
  if (!text) return "";
  const direct = WEATHER_STATE_ALIASES[text];
  if (direct) return direct;
  const compact = WEATHER_COMPACT_ALIASES[text.replace(/[\s_-]+/g, "")];
  if (compact) return compact;
  for (const [fragment, key] of WEATHER_TEXT_ALIASES) if (text.includes(fragment)) return key;
  return "";
}

/** 实体属性里可能存天气的字段，按可信度排序。 */
const WEATHER_ATTRIBUTE_KEYS = [
  "condition_desc",
  "skycon",
  "condition",
  "condition_code",
  "weather",
] as const;

function textAttribute(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

type WeatherStateRecord = {
  state?: unknown;
  available?: unknown;
  attributes?: Record<string, unknown> | null;
};

/** 事件载荷可能包一层 `newState`；普通状态对象与纯 state 字符串也一并吃下。 */
function unwrapWeatherState(input: unknown): WeatherStateRecord | null {
  if (typeof input === "string") return { state: input };
  if (!input || typeof input !== "object") return null;
  const wrapped = (input as { newState?: unknown }).newState;
  return (wrapped && typeof wrapped === "object" ? wrapped : input) as WeatherStateRecord;
}

function normalizeWeatherState(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * 从场景配置的 `weather` 段取天气实体 ID。
 *
 * 非法值（缺省、域名写成了别的域、超长）一律返回空串，调用方据此判定「未绑定」。
 */
export function weatherEntityId(properties: unknown): string {
  const entityId = (properties as { entityId?: unknown } | null | undefined)?.entityId;
  return typeof entityId === "string" && WEATHER_ENTITY_PATTERN.test(entityId) ? entityId : "";
}

/**
 * 读一个实体状态。状态中枢（`renderer.states`）是 `Map`，而配置草稿 / 序列化快照里
 * 是普通对象，两种形状都要能吃下 —— 否则绑定按钮就只能显示实体 ID。
 */
export function weatherEntityState(states: unknown, entityId: string): unknown {
  if (!entityId || !states) return null;
  if (states instanceof Map) return states.get(entityId) ?? null;
  return (states as Record<string, unknown>)[entityId] ?? null;
}

function attributeName(source: unknown): string {
  if (!source || typeof source !== "object") return "";
  const record = source as { attributes?: { friendly_name?: unknown } | null; name?: unknown };
  const friendlyName = record.attributes?.friendly_name;
  if (typeof friendlyName === "string" && friendlyName.trim()) return friendlyName.trim();
  return typeof record.name === "string" ? record.name.trim() : "";
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
  if (!entityId) return "";
  for (const candidate of [state, unwrapWeatherState(state), entity]) {
    const text = attributeName(candidate);
    if (text) return text;
  }
  return entityId.trim();
}

/**
 * 把 HA 的天气实体状态翻译成可渲染的效果键，无法渲染时返回空串。
 *
 * 入参既可以是状态对象、带 `newState` 的事件载荷，也可以是预览用的裸 state 字符串。
 * `available: false`（实体不可用）不算天气态 —— 否则离线实体也会一直下雪。
 */
export function weatherEffectKey(input: unknown): WeatherEffectKey | "" {
  const source = unwrapWeatherState(input);
  if (!source || source.available === false) return "";
  const state = normalizeWeatherState(source.state);
  if (UNAVAILABLE_STATES.includes(state)) return "";
  const fromState = EMPTY_STATES.includes(state) ? "" : resolveWeatherEffectText(state);
  if (fromState) return fromState;
  // state 是人话（中文「多云」）或干脆是 `unknown` 时，退到属性的机读枚举。
  const attributes = source.attributes;
  if (!attributes) return "";
  for (const attributeKey of WEATHER_ATTRIBUTE_KEYS) {
    const resolved = resolveWeatherEffectText(textAttribute(attributes, attributeKey));
    if (resolved) return resolved;
  }
  return "";
}

/** 风速单位换算：国内集成常用 km/h，而风速归一基准是 m/s。 */
const WIND_UNIT_TO_MPS: Readonly<Record<string, number>> = Object.freeze({
  "km/h": 1 / 3.6,
  kmh: 1 / 3.6,
  kph: 1 / 3.6,
  mph: 0.44704,
  "m/s": 1,
  ms: 1,
});

/** 天气实体的风速（m/s）；缺失或非法时按 0 处理，上限 30 钳制异常值。 */
export function weatherWindSpeed(input: unknown): number {
  const source = unwrapWeatherState(input);
  const value = Number(source?.attributes?.wind_speed);
  if (!Number.isFinite(value)) return 0;
  const unit = normalizeWeatherState(source?.attributes?.wind_speed_unit);
  const scale = WIND_UNIT_TO_MPS[unit] ?? 1;
  return Math.min(30, Math.max(0, value * scale));
}
