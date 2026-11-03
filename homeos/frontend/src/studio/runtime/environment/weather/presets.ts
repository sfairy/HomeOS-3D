import type { WeatherEffectKey } from "@/studio/platform/weather-settings";

/** 天空氛围色相；`undefined` 表示这一天气不画天空层。 */
export type WeatherSkyTone =
  | "blue"
  | "dayblue"
  | "warm"
  | "soft"
  | "overcast"
  | "night"
  | "alert"
  | "storm";

/** 云量档位：决定云层贴图的色调、数量与漂移速度。 */
export type WeatherCloudCoverage = "none" | "light" | "broken" | "overcast" | "storm";

/** 全屏调色色温：只做「染」不做「盖」，alpha 由预设控制在 0.1 以内。 */
export type WeatherGradeTone = "warm" | "cool" | "overcast" | "night" | "amber" | "storm";

/**
 * 单个天气态的表现参数。
 *
 * 所有强度都是「相对量」：粒子数还会再乘画布面积系数与自适应画质因子，
 * 所以同一档在平板与 4K 上观感一致。缺省字段等于「不画这一层」。
 */
export type WeatherEffectPreset = {
  /** 雨滴强度，1 约等于满屏细密雨丝。 */
  rain?: number;
  /** 雨丝长度缩放（毛毛雨短、大雨长）。 */
  rainScale?: number;
  /** 雨滴下落速度缩放。 */
  rainSpeed?: number;
  /** 近景雨层占比（0~1），越大越有「雨打在镜头上」的压迫感。 */
  rainDepth?: number;
  snow?: number;
  snowScale?: number;
  hail?: number;
  /** 雾团浓度（0~1）。 */
  fog?: number;
  /** 横向雾带条数；做成两层以上才有前后景纵深。 */
  fogBands?: number;
  /** 雾团颜色 `r,g,b`。 */
  fogTint?: string;
  /** 风线强度（0~1）。 */
  wind?: number;
  /** 落叶数量系数（0~1）。 */
  leaves?: number;
  thunder?: boolean;
  sky?: WeatherSkyTone;
  /** 云量档位。 */
  clouds?: WeatherCloudCoverage;
  /** 云层浓度（0~1）。 */
  cloudDensity?: number;
  /** 星点强度（0~1）；晴夜靠它撑起整片天空。 */
  stars?: number;
  /** 是否可能出现流星（晴夜）。 */
  meteor?: boolean;
  /** 落地水花强度（0~1.4）：每秒溅射次数与溅射水珠数。 */
  splash?: number;
  /** 湿地反光强度（0~1）。 */
  wet?: number;
  /** 目标积雪厚度（0~0.2），会缓慢累积而不是突变。 */
  snowCover?: number;
  /** 全屏调色色温。 */
  grade?: WeatherGradeTone;
  /** 全屏调色强度（建议 ≤ 0.1）。 */
  gradeAlpha?: number;
  /** 暗角强度（0~0.3）。 */
  vignette?: number;
};

/**
 * 效果键 → 表现参数。类型是 `Record<WeatherEffectKey, ...>`，漏写任何一种都会
 * 在 typecheck 阶段报错，不会静默退化成「无效果」。
 *
 * 数值对标主流天气 App 的镜头语言：三层景深、地面是第二主角、低频「呼吸」、
 * 色温叙事（晴暖 / 阴灰蓝 / 雷暴青紫 / 夜深蓝 / 霾琥珀）。
 */
export const WEATHER_EFFECT_PRESETS: Readonly<Record<WeatherEffectKey, WeatherEffectPreset>> =
  Object.freeze({
    // 毛毛雨：雨丝极细极短，地面要等一会儿才出现一朵小水花。
    drizzle: {
      rain: 0.22,
      rainScale: 0.5,
      rainSpeed: 0.7,
      rainDepth: 0.2,
      splash: 0.5,
      wet: 0.35,
      grade: "cool",
      gradeAlpha: 0.05,
    },
    rainy: {
      rain: 0.66,
      rainDepth: 0.55,
      splash: 0.9,
      wet: 0.62,
      // 雨天是「一片灰」，只画云幕不画白云团。
      clouds: "overcast",
      cloudDensity: 0.5,
      sky: "soft",
      grade: "cool",
      gradeAlpha: 0.06,
    },
    // 大雨：更长更快更斜，地面水花密集成片，底部要有积水反光。
    pouring: {
      rain: 1.05,
      rainScale: 1.3,
      rainSpeed: 1.35,
      rainDepth: 0.85,
      splash: 1.35,
      wet: 0.85,
      clouds: "storm",
      cloudDensity: 0.85,
      sky: "storm",
      grade: "storm",
      gradeAlpha: 0.09,
      vignette: 0.22,
    },
    // 纯雷电：没有降水，只有云层被从内部点亮。
    lightning: {
      thunder: true,
      clouds: "storm",
      cloudDensity: 0.8,
      sky: "storm",
      grade: "storm",
      gradeAlpha: 0.08,
      vignette: 0.2,
    },
    "lightning-rainy": {
      rain: 1.05,
      rainScale: 1.3,
      rainSpeed: 1.35,
      rainDepth: 0.85,
      thunder: true,
      splash: 1.35,
      wet: 0.85,
      clouds: "storm",
      cloudDensity: 0.85,
      sky: "storm",
      grade: "storm",
      gradeAlpha: 0.1,
      vignette: 0.22,
    },
    snowy: {
      snow: 0.72,
      snowScale: 1.05,
      snowCover: 0.16,
      clouds: "overcast",
      cloudDensity: 0.45,
      sky: "soft",
      grade: "cool",
      gradeAlpha: 0.05,
    },
    "snowy-rainy": {
      rain: 0.42,
      rainScale: 0.85,
      rainSpeed: 0.85,
      rainDepth: 0.45,
      snow: 0.6,
      snowScale: 0.95,
      splash: 0.5,
      wet: 0.4,
      snowCover: 0.08,
      clouds: "overcast",
      cloudDensity: 0.55,
      grade: "cool",
      gradeAlpha: 0.05,
    },
    // 冰雹：小而亮的短条，落地弹跳并溅碎屑，涟漪密而小。
    hail: {
      hail: 0.95,
      rain: 0.2,
      rainScale: 0.65,
      splash: 1.1,
      wet: 0.55,
      snowCover: 0.04,
      clouds: "storm",
      cloudDensity: 0.7,
      sky: "storm",
      grade: "storm",
      gradeAlpha: 0.08,
      vignette: 0.18,
    },
    fog: {
      fog: 0.85,
      fogBands: 3,
      fogTint: "196,204,212",
      wet: 0.18,
      // 雾天能见度靠雾层表达，天空不再叠云幕，否则整屏发灰。
      sky: "soft",
      grade: "overcast",
      gradeAlpha: 0.06,
    },
    haze: {
      fog: 0.5,
      fogBands: 2,
      fogTint: "196,176,138",
      sky: "alert",
      grade: "amber",
      gradeAlpha: 0.08,
      vignette: 0.14,
    },
    windy: {
      wind: 1,
      leaves: 1,
      clouds: "overcast",
      cloudDensity: 0.3,
      sky: "soft",
      grade: "cool",
      gradeAlpha: 0.03,
    },
    // 只有晴天与晴间多云才出「白云团」，且都压在画面顶部窄带里。
    sunny: {
      clouds: "light",
      cloudDensity: 0.55,
      sky: "blue",
      grade: "warm",
      gradeAlpha: 0.03,
      vignette: 0.12,
    },
    partlycloudy: {
      clouds: "light",
      cloudDensity: 0.8,
      sky: "dayblue",
      grade: "warm",
      gradeAlpha: 0.02,
    },
    cloudy: {
      clouds: "overcast",
      cloudDensity: 0.9,
      fog: 0.2,
      fogTint: "168,176,184",
      sky: "overcast",
      grade: "overcast",
      gradeAlpha: 0.07,
    },
    "clear-night": {
      sky: "night",
      // 晴夜唯一的视觉主体就是星：强度拉满，靠星芒与慢闪撑画面，不要云。
      stars: 1.4,
      meteor: true,
      grade: "night",
      gradeAlpha: 0.08,
      vignette: 0.22,
    },
    // 异常：低透明琥珀色边缘警示，只做呼吸闪烁，不参与降水。
    exceptional: {
      sky: "alert",
      fog: 0.3,
      fogTint: "214,150,96",
      grade: "amber",
      gradeAlpha: 0.1,
      vignette: 0.18,
    },
  });
