/**
 * 气候设备的**开关态 / 运行态**判据（跨层共享，纯函数，含真实类型）。
 *
 * 为什么抽这一小块
 * ----------------
 * `studio/app/shared/device/climate.ts` 有 580 行、大量 `any`，整体下沉到 `shared/`
 * 会立刻撞上 `shared/**` 的 `noExplicitAny: error`（那条规则是对的：shared 是叶子层，
 * 应当有真类型）。但其中三条判据是**四套实现最容易分叉、又最难测**的地方：
 *
 * 1. 浴霸在 `state === 'off'` 时靠 `preset_mode` 推断是否在吹风（`off` 不等于停机）；
 * 2. 热水器 `current_temperature < target - 0.4` 才算「正在加热」（这是有意留的容差）；
 * 3. `unknown` / `unavailable` 一律不算开机（否则面板会把失联设备画成运行中）。
 *
 * 这三条此前只存在于 3D 侧；Vue 弹窗（`useClimateControlPopup`）、仪表盘卡片
 * （`widgets/climate`）与舞台面板（`runtime/climate`）各自实现了一份近似逻辑。
 * 现在它们都 import 这里，**判据只有一份**，而 3D 侧的复杂渲染逻辑仍留在原文件。
 *
 * 类型口径：入参只声明「读到的字段」，不要求完整 EntityState —— 调用方传
 * `{ state, attributes }` 的快照即可，不必构造整个实体对象。
 */

/** 只读的状态快照：`state` 是 HA 的字符串状态，`attributes` 是属性表。 */
export interface ClimateStateSnapshot {
  state?: string | null
  attributes?: Record<string, unknown> | null
}

/** 设备渲染形态（与 `@homeos/shared/entity/device-kind` 的渲染类型一致）。 */
export type ClimateRenderType = 'air-conditioner' | 'bath-heater' | 'water-heater'

/**
 * 判据的形态入参：接受 `string` 而不是收窄到 `ClimateRenderType`。
 *
 * 原因：调用方（3D 渲染注册表、面板装配、Vue 弹窗）的 deviceType 来自 `any` 配置与
 * `resolveClimateDeviceType()` 的字符串返回，收窄会逼出几十处断言，而**收益为零** ——
 * 三个分支之外的取值在下面一律走空调口径（与历史行为一致）。新代码请用
 * `ClimateRenderType` 声明自己的变量，本模块只保证「认得出三种形态」。
 */
export type ClimateDeviceTypeInput = string | undefined

/** 归一模式名：大小写 / 空格 / 连字符不敏感（与 3D 侧 `normalizeClimateModeKey` 同口径）。 */
export function normalizeClimateModeKey(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .replace(/[+&]/g, '_and_')
    .toLowerCase()
    .replace(/[\s./-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

/** 浴霸的「停机类」模式：这些档位不代表设备在工作（含中文集成下发的写法）。 */
const INACTIVE_BATH_MODES: ReadonlySet<string> = new Set([
  'off',
  'idle',
  'standby',
  'unknown',
  'unavailable',
  '待机',
  '关闭',
])

/**
 * 浴霸当前是否在吹风（换气 / 送风）。
 *
 * 浴霸的 `state` 常常一直是 `on`，真正在做什么由 `preset_mode` 决定；
 * 反之 `state === 'off'` 时也可能仍在吹风（换气档独立于主开关）。
 */
export function bathHeaterModeUsesAirflow(airflowMode: unknown): boolean {
  const key = normalizeClimateModeKey(airflowMode)
  return key ? !INACTIVE_BATH_MODES.has(key) : false
}

/**
 * 浴霸的「当前呈现模式」：`preset_mode` > `mode` > `fan_mode` > `state`。
 *
 * `state === 'off'` 时**不**直接返回 `off`：要先看 preset 里是否在吹风或换气，
 * 否则「关着主开关但在换气」会被画成完全停机。
 */
export function bathHeaterPresentationMode(snapshot: ClimateStateSnapshot): string {
  const attributes = snapshot.attributes ?? {}
  const rawState = String(snapshot.state ?? 'off')
    .trim()
    .toLowerCase()
  const presetMode = String(attributes.preset_mode ?? attributes.mode ?? '').trim()
  if (rawState === 'off') return bathHeaterModeUsesAirflow(presetMode) ? presetMode : 'off'
  return String(attributes.preset_mode ?? attributes.mode ?? attributes.fan_mode ?? rawState).trim()
}

/** 空调 / 热水器的模式：热水器读 `operation_mode`，空调直接看 `state`。 */
export function climatePresentationMode(
  snapshot: ClimateStateSnapshot,
  deviceType: ClimateDeviceTypeInput = 'air-conditioner',
): string {
  const rawState = String(snapshot.state ?? 'off').trim()
  const lower = rawState.toLowerCase()
  if (deviceType === 'water-heater') {
    if (['off', 'unknown', 'unavailable'].includes(lower)) return rawState
    return String(snapshot.attributes?.operation_mode ?? rawState).trim()
  }
  if (deviceType !== 'bath-heater' || ['unknown', 'unavailable'].includes(lower)) return rawState
  return bathHeaterPresentationMode(snapshot)
}

/**
 * 设备是否开机。
 *
 * - `unknown` / `unavailable` 一律 false（失联设备不能画成运行中）；
 * - 浴霸额外看呈现模式：主开关关着但仍在换气 = 开机；
 * - 热水器与空调：`state` 不是 `off` 即视为开机。
 */
export function climateIsPoweredOn(
  snapshot: ClimateStateSnapshot,
  deviceType: ClimateDeviceTypeInput = 'air-conditioner',
): boolean {
  const lower = String(snapshot.state ?? 'off')
    .trim()
    .toLowerCase()
  if (deviceType === 'bath-heater') {
    if (!lower || lower === 'unknown' || lower === 'unavailable') return false
    const presentation = normalizeClimateModeKey(bathHeaterPresentationMode(snapshot))
    // 呈现模式落在停机档（off / idle / standby / 待机 / 关闭）即视为未开机；
    // 主开关写着 off 但仍能读出吹风/换气档时，按「在换气」处理。
    if (!presentation || INACTIVE_BATH_MODES.has(presentation)) return false
    return lower === 'off' ? bathHeaterModeUsesAirflow(presentation) : true
  }
  return !['off', 'unknown', 'unavailable'].includes(lower)
}

/** 热水器「正在加热」的判定容差（摄氏度）：小于目标 0.4 度视为已达温、转保温。 */
export const WATER_HEATER_HEATING_TOLERANCE_C = 0.4

/**
 * 设备是否「正在运行」（不是开机，而是真的在做功）。
 *
 * - 热水器：测得温度至少比目标低 0.4 度才算正在加热，否则是保温；
 * - 浴霸：正在吹风 / 换气才算运行；
 * - 空调：`hvac_action` 不是 `idle` / `off`。
 */
export function climateIsRunning(
  snapshot: ClimateStateSnapshot,
  deviceType: ClimateDeviceTypeInput = 'air-conditioner',
): boolean {
  if (!climateIsPoweredOn(snapshot, deviceType)) return false
  const attributes = snapshot.attributes ?? {}
  if (deviceType === 'water-heater') {
    const measured = asNumber(attributes.current_temperature)
    const target = asNumber(attributes.temperature)
    if (measured === null || target === null) return true
    return measured < target - WATER_HEATER_HEATING_TOLERANCE_C
  }
  if (deviceType === 'bath-heater') {
    return bathHeaterModeUsesAirflow(climatePresentationMode(snapshot, deviceType))
  }
  const hvacAction = String(attributes.hvac_action ?? '')
    .trim()
    .toLowerCase()
  return !['idle', 'off'].includes(hvacAction)
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
