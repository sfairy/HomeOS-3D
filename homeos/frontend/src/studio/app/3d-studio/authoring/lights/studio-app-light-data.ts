/**
 * studio-app.ts 的灯光属性数据与工具函数。
 *
 * 仅依赖自身参数与导入的几何工具。
 */

import { clamp as clamp2 } from '../../plan/geometry'
import { finite as finite2 } from '../../loaders/studio-normalization'

/** 灯光预设目录（色温 / 亮度 / 范围 / 角度）。 */
export const lightPresetCatalog = {
  downlight: {
    temperature: 3000,
    brightness: 48,
    range: 3.2,
    angle: 48,
  },
  ceilinglight: {
    temperature: 3500,
    brightness: 62,
    range: 5,
    angle: 110,
  },
  striplight: {
    temperature: 3000,
    brightness: 42,
    range: 3.5,
    angle: 100,
  },
}

/** 灯光强度系数（按类型冻结）。 */
export const lightIntensityFactor = Object.freeze({
  downlight: 1.1,
  ceilinglight: 0.792,
  striplight: 1.3,
})

/**
 * 灯具额定光通量（流明）。灯带按「每米」计。
 *
 * 这组数字是光度模型的输入：筒灯 420 lm、吊灯 1800 lm、灯带 350 lm·m⁻¹，
 * 都在家用成品的常见档位里（筒灯 300–600、客厅吊灯 1200–2400、软灯带 300–800）。
 * 之前走的是「常量坎德拉」（筒灯 520 / 吊灯 680），跟光束角完全脱钩 ——
 * 用户把光束角从 48° 收到 24°，光通量没变，亮度却一分不涨，等于「收窄光束 = 变暗」。
 * 现在统一由 `candelaFromFlux` 按光束角换算，收窄光束才会真的变亮。
 */
export const lightFluxLumens: Readonly<Record<string, number>> = Object.freeze({
  downlight: 420,
  ceilinglight: 1800,
  striplight: 350,
})

/** 圆锥光束的立体角（球面度，sr）。θ 是整个光束角，不是半角。 */
function coneSolidAngle(beamAngleDeg: number) {
  const halfAngle = (clamp2(finite2(beamAngleDeg, 90), 1, 179) * Math.PI) / 360
  // 下限兜底：极窄光束（<2°）时立体角趋近 0，坎德拉会算到无穷大。
  return Math.max(2 * Math.PI * (1 - Math.cos(halfAngle)), 2e-4)
}

/**
 * 光通量（lm）+ 光束角（°）→ 轴向光强（cd）。
 *
 * 假设光通量在圆锥内均匀分布：I = Φ / Ω，Ω = 2π(1 - cos(θ/2))。
 * 这是灯具手册里「坎德拉 @ 光束角」的算法，也是 Three.js `SpotLight.intensity` 的单位。
 */
export function candelaFromFlux(fluxLumens: number, beamAngleDeg: number) {
  return Math.max(finite2(fluxLumens, 0), 0) / coneSolidAngle(beamAngleDeg)
}

/**
 * 面光源亮度（cd·m⁻²，Three.js `RectAreaLight.intensity` 的单位）。
 *
 * 余弦辐射体的总光通量与亮度关系是 Φ = π·L·A，反解得 L = Φ / (π·A)。
 * 灯带的光通量按长度给（`lightFluxLumens.striplight`），长度取发光面长边，
 * 于是「灯带越长 / 越宽」自然越亮，不再是一个和尺寸无关的常量 48。
 */
export function rectAreaLuminanceFromFlux(fluxPerMeter: number, lengthMeters: number, widthMeters: number) {
  const area = Math.max(finite2(lengthMeters, 0.1) * finite2(widthMeters, 0.1), 1e-3)
  return (Math.max(finite2(fluxPerMeter, 0), 0) * Math.max(finite2(lengthMeters, 0.1), 0.1)) / (Math.PI * area)
}

/**
 * 光度 → 渲染亮度 的标定增益（每个灯型一个）。
 *
 * 物理量本身没错，但 Three.js 里的「1.0 = 白」不是 1 cd·m⁻²：它是这套基础光
 * （日光 2.05 / 半球 0.58 / 环境 0.16）手调到不过曝时的那把尺子。把真实流明直接
 * 塞进来，同一盏灯带的地面照度会比筒灯高一个量级（实测灯带 2832 cd·m⁻²、
 * 正下方照度 390，筒灯只有 35），整屋立刻变成一片过曝的暖粉：
 * R 通道 26% 像素打满 255，墙和地彻底没有层次。
 *
 * 所以分成两层：
 * - **物理层**（`candelaFromFlux` / `rectAreaLuminanceFromFlux`）保留形状关系：
 *   收窄光束变亮、灯带越长越亮越宽越摊薄、光通量变大的响应曲线不变；
 * - **标定层**（本表）把绝对刻度拉回渲染器白点：出厂参数下等于改造前手调好的
 *   坎德拉（筒灯 520 / 吊灯 680 / 灯带 48），于是「默认亮度」还是原来那个观感，
 *   只有几何/角度真的变了才会更亮或更暗。
 *
 * 标定值由下面 `lightRenderCalibrationReference` 现算，避免出现第二个魔数。
 */
const lightRenderCalibrationReference = Object.freeze({
  downlight: { fluxLumens: 420, beamAngleDeg: 48, renderValue: 520 },
  ceilinglight: { fluxLumens: 1800, beamAngleDeg: 110, renderValue: 680 },
  // 灯带取「出厂尺寸」2 m × 0.28 m（`addLightModel` 里还会各乘 0.94 的发光面系数）。
  striplight: { fluxPerMeter: 350, lengthMeters: 2 * 0.94, widthMeters: 0.28 * 0.94, renderValue: 48 },
})

export const lightRenderGain: Readonly<Record<string, number>> = Object.freeze({
  downlight:
    lightRenderCalibrationReference.downlight.renderValue /
    candelaFromFlux(
      lightRenderCalibrationReference.downlight.fluxLumens,
      lightRenderCalibrationReference.downlight.beamAngleDeg,
    ),
  ceilinglight:
    lightRenderCalibrationReference.ceilinglight.renderValue /
    candelaFromFlux(
      lightRenderCalibrationReference.ceilinglight.fluxLumens,
      lightRenderCalibrationReference.ceilinglight.beamAngleDeg,
    ),
  striplight:
    lightRenderCalibrationReference.striplight.renderValue /
    rectAreaLuminanceFromFlux(
      lightRenderCalibrationReference.striplight.fluxPerMeter,
      lightRenderCalibrationReference.striplight.lengthMeters,
      lightRenderCalibrationReference.striplight.widthMeters,
    ),
})

/**
 * 窄光束下的坎德拉上限（相对标定参考值的倍数）。
 *
 * 15° 的 420 lm 筒灯在物理上是 7800 cd，正下方能到 1000 lx —— 现实里那确实是一块
 * 刺眼的光斑，但渲染器没有相机的高光宽容度（白点 1.0 就截断），成片打满反而更假。
 * 收在 3 倍：既能体现「收窄光束会变亮」，又不会把整面墙打成纯白。
 */
const LIGHT_CANDELA_MAX_RATIO = 3

/** 按灯型取「光通量 + 光束角 → 渲染坎德拉」，含标定与上限。 */
export function renderCandelaFromFlux(lightTypeKey: string, fluxLumens: number, beamAngleDeg: number) {
  const reference = lightRenderCalibrationReference[lightTypeKey as keyof typeof lightRenderCalibrationReference] as
      | { renderValue?: number }
      | undefined,
    calibrated =
      candelaFromFlux(fluxLumens, beamAngleDeg) * (lightRenderGain[lightTypeKey] ?? lightRenderGain.downlight)
  return reference?.renderValue ? Math.min(calibrated, reference.renderValue * LIGHT_CANDELA_MAX_RATIO) : calibrated
}

/** 按灯型取「光通量 + 发光面 → 渲染亮度」，含标定。 */
export function renderLuminanceFromFlux(
  lightTypeKey: string,
  fluxPerMeter: number,
  lengthMeters: number,
  widthMeters: number,
) {
  return (
    rectAreaLuminanceFromFlux(fluxPerMeter, lengthMeters, widthMeters) *
    (lightRenderGain[lightTypeKey] ?? lightRenderGain.striplight)
  )
}

/** 灯光角度上限（按类型）。 */
const lightAngleLimit = {
  downlight: 120,
  ceilinglight: 150,
  striplight: 120,
}

/** 按灯光类型取角度上限（未知类型默认 120）。 */
export function lightAngleLimitForType(lightTypeKey: any) {
  return (lightAngleLimit as any)[lightTypeKey] || 120
}

/** 灯光属性字段表（label / input 选择器 / 单位）。 */
export const lightPropertyFields = {
  lightTemperature: {
    label: '色温',
    input: '#light-temperature',
    unit: 'K',
  },
  lightBrightness: {
    label: '亮度',
    input: '#light-brightness',
    unit: '%',
  },
  lightRange: {
    label: '照射范围',
    input: '#light-range',
    unit: 'm',
  },
  lightAngle: {
    label: '光束角',
    input: '#light-angle',
    unit: '°',
  },
  elevation: {
    label: '离地高度',
    input: '#item-elevation',
    unit: 'm',
  },
}

/**
 * 生活场景 → 色温分档。
 *
 * 现实里一个家不会全屋一个色温：卧室要暖（2700K）才有睡前感，客厅/餐厅
 * 用 3000K 让木饰面和织物显色，厨房/卫浴/书房要 4000K 才看得清操作面。
 * 这里按**灯组名**里的房间关键词分档 —— 灯组名是用户唯一会写的「这是哪个房间」，
 * 而且改名很容易（"灯组 2" → "卧室灯"）。
 *
 * 顺序有意义：先卧室（"主卧"会同时命中"卧"），再厨卫书房，最后客厅餐厅。
 */
const ROOM_KELVIN_RULES: ReadonlyArray<{ kelvin: number; pattern: RegExp }> = Object.freeze([
  { kelvin: 2700, pattern: /卧室|主卧|次卧|儿童房|老人房|床头|衣帽间|bed\s*room/i },
  { kelvin: 4000, pattern: /厨房|卫浴|卫生间|浴室|洗手间|书房|办公|工作区|kitchen|bath|study/i },
  { kelvin: 3000, pattern: /客厅|起居|餐厅|火锅|玄关|走廊|过道|楼梯|阳台|living|dining|hall/i },
])

/** 按灯组名取建议色温；没命中任何房间关键词时返回 null（保持原值）。 */
export function roomLightKelvin(lightGroupName: unknown): number | null {
  const groupName = typeof lightGroupName === 'string' ? lightGroupName : ''
  if (!groupName) return null
  for (const rule of ROOM_KELVIN_RULES) if (rule.pattern.test(groupName)) return rule.kelvin
  return null
}

/**
 * 新建灯具时的色温：只有在「仍是该灯型的出厂色温」时才按房间改，
 * 用户手调过的（或者从其他灯复制过来的）一律不覆盖。
 */
/** 按灯型取预设；未知灯型按筒灯处理。 */
function lightPresetFor(lightTypeKey: string) {
  return (
    (lightPresetCatalog as unknown as Record<string, typeof lightPresetCatalog.downlight>)[lightTypeKey] ??
    lightPresetCatalog.downlight
  )
}

export function autoLightKelvin(
  lightTypeKey: string,
  lightGroupName: unknown,
  currentKelvin: number | null | undefined,
) {
  const preset = lightPresetFor(lightTypeKey),
    resolvedKelvin = finite2(currentKelvin, preset.temperature),
    suggestedKelvin = roomLightKelvin(lightGroupName)
  if (suggestedKelvin === null || Math.abs(resolvedKelvin - preset.temperature) > 1) {
    if (typeof document !== 'undefined')
      document.documentElement.dataset.lightAutoKelvin = suggestedKelvin === null ? '' : 'manual'
    return resolvedKelvin
  }
  if (typeof document !== 'undefined')
    document.documentElement.dataset.lightAutoKelvin = String(lightGroupName) + '@' + suggestedKelvin + 'K'
  return suggestedKelvin
}

/** 按字段名规范化灯光属性值（范围 / 精度 / 角度上限）。 */
export function normalizeLightPropertyValue(lightPropertyName: any, propertyValue: any, maxAngleLimit: any) {
  return lightPropertyName === 'lightTemperature'
    ? Math.round(clamp2(finite2(propertyValue, 3000), 2200, 6500))
    : lightPropertyName === 'lightBrightness'
      ? Math.round(clamp2(finite2(propertyValue, 50), 0, 100))
      : lightPropertyName === 'lightRange'
        ? Math.round(clamp2(finite2(propertyValue, 3.5), 0.5, 10) * 10) / 10
        : lightPropertyName === 'lightAngle'
          ? Math.round(clamp2(finite2(propertyValue, 90), 15, lightAngleLimitForType(maxAngleLimit)))
          : lightPropertyName === 'elevation'
            ? Math.round(clamp2(finite2(propertyValue, 2.7), 0, 6) * 100) / 100
            : finite2(propertyValue)
}

/** 按字段名格式化灯光属性值（附加单位）。 */
export function formatLightPropertyValue(fieldName: any, fieldValue: any) {
  const fieldSpec = (lightPropertyFields as any)[fieldName]
  if (!fieldSpec) return String(fieldValue)
  const fixed = ['lightRange', 'elevation'].includes(fieldName)
    ? Number(fieldValue).toFixed(fieldName === 'elevation' ? 2 : 1)
    : Math.round(fieldValue)
  return ['%', '°'].includes(fieldSpec.unit) ? '' + fixed + fieldSpec.unit : fixed + ' ' + fieldSpec.unit
}
