import { climateRenderTypeFromKind } from '@homeos/shared/entity/device-kind'
import { BATH_HEATER_MODE_LABELS, CLIMATE_MODE_LABELS, HORIZONTAL_POSITION_LABELS, HORIZONTAL_SWING_LABELS, VERTICAL_SWING_LABELS, WATER_HEATER_MODE_LABELS } from '@/kernel/constants'
import { deviceProfileKind } from '@/domain/device/device-profile-kind-cache'
import { bathHeaterModeUsesAirflow, climateIsPoweredOn, climateIsRunning, climatePresentationMode, normalizeClimateModeKey } from '@/domain/entity/model/climate-power'
import { type HaEntityAttributes, type HaEntityState, type HaEntityEntry } from '@app/shared/util/ha-entity'

/**
 * 气候 / 热水器 / 浴霸的**能力归一与判据**（纯函数层，无 DOM、无 Vue、无 3D 依赖）。
 *
 * 为什么放在 `shared/device/` 而不是 `studio/app/shared/device/`
 * --------------------------------------------------------------
 * 这套判据此前只存在于 3D 侧（`studio/app/shared/device/climate.ts`），于是同一个问题被
 * 至少四处各答一遍：
 *
 * - `studio/app/renderer/**`（3D 面板渲染，import 本模块）
 * - `studio/runtime/climate/climate-panel.ts`（舞台面板，自己判模式与开关态）
 * - `composables/entity/popup/useClimateControlPopup.ts`（Vue 弹窗，走 `climate-control-core`）
 * - `components/widgets/climate/**`（仪表盘卡片）
 *
 * 四份实现最容易分叉的地方恰恰是最难测的：`climateIsPoweredOn` 对浴霸的判定（`off` 状态下
 * 靠 `preset_mode` 推断吹风）、`climatePowerCommand` 的开机模式优先级、`climateIsRunning`
 * 对水温的容差。放到 `shared/` 之后，Vue 侧与 3D 侧能 import 同一份，不必复制。
 *
 * 边界：本模块只依赖 `@homeos/shared`（跨端类型）与 `shared/`（标签表、画像投影缓存），
 * 不 import `studio/`、`composables/`、`components/`。
 */

// 开关态 / 运行态判据与 Vue 侧、舞台侧共用同一份实现（`shared/device/climate-power`）：
// 这三条是最容易分叉、又最难测的逻辑（浴霸 off 态仍可能换气、热水器 0.4 度容差、
// unknown 不算开机）。此处 re-export 保持既有 `@app/shared/device/climate` 导入不变。

export { bathHeaterModeUsesAirflow, climateIsPoweredOn, climateIsRunning, climatePresentationMode }

const climateDeviceTypesSet = new Set(['auto', 'air-conditioner', 'bath-heater', 'water-heater'])
function normalizeStringList(values: any) {
  return Array.isArray(values) ? [...new Set(values.map((entry) => String(entry ?? '').trim()).filter(Boolean))] : []
}
function toNumberOrDefault(sourceValue: any, fallbackValue: any = null) {
  if (sourceValue == null || sourceValue === '') return fallbackValue
  const parsedNumber = Number(sourceValue)
  return Number.isFinite(parsedNumber) ? parsedNumber : fallbackValue
}
function configuredClimateDeviceType(component: any) {
  const configuredType = String(component?.properties?.deviceType || 'auto')
  return climateDeviceTypesSet.has(configuredType) ? configuredType : 'auto'
}
export function normalizeClimateCapabilities(sourceState: any) {
  const stateAttributes =
      sourceState?.attributes && typeof sourceState.attributes == 'object' ? sourceState.attributes : {},
    hvacModes = normalizeStringList(stateAttributes.hvac_modes),
    fanModes = normalizeStringList(stateAttributes.fan_modes),
    swingModes = normalizeStringList(stateAttributes.swing_modes),
    horizontalSwingModes = normalizeStringList(stateAttributes.swing_horizontal_modes),
    presetModes = normalizeStringList(stateAttributes.preset_modes),
    operationModes = normalizeStringList(stateAttributes.operation_list),
    fanPercentage = toNumberOrDefault(stateAttributes.percentage),
    fanPercentageStep = Math.max(1, toNumberOrDefault(stateAttributes.percentage_step, 1)),
    targetTemperature = toNumberOrDefault(stateAttributes.temperature),
    currentTemperature = toNumberOrDefault(stateAttributes.current_temperature)
  let minimumTemperature = toNumberOrDefault(stateAttributes.min_temp, 16),
    maximumTemperature = toNumberOrDefault(stateAttributes.max_temp, 30)
  maximumTemperature <= minimumTemperature && ((minimumTemperature = 16), (maximumTemperature = 30))
  const temperatureStep = Math.max(0.1, toNumberOrDefault(stateAttributes.target_temp_step, 0.5))
  return {
    attributes: stateAttributes,
    hvacModes: hvacModes,
    fanModes: fanModes,
    swingModes: swingModes,
    horizontalSwingModes: horizontalSwingModes,
    presetModes: presetModes,
    operationModes: operationModes,
    fanPercentage: fanPercentage,
    fanPercentageStep: fanPercentageStep,
    targetTemperature: targetTemperature,
    currentTemperature: currentTemperature,
    minimumTemperature: minimumTemperature,
    maximumTemperature: maximumTemperature,
    temperatureStep: temperatureStep,
    supportsTargetTemperature: targetTemperature !== null,
    hasModeControl:
      hvacModes.some((mode) => mode !== 'off') ||
      operationModes.some((operationMode) => !['off', '空'].includes(operationMode.toLowerCase())),
    hasFanControl: fanModes.length > 0,
    hasSwingControl: swingModes.length > 0,
    hasHorizontalSwingControl: horizontalSwingModes.length > 0,
    hasPresetControl: presetModes.length > 0,
    supportsFanPercentage: fanPercentage !== null,
  }
}
export function climateOperationModeValues(stateEntity: any, deviceType = 'air-conditioner') {
  const capabilities = normalizeClimateCapabilities(stateEntity)
  return deviceType === 'water-heater'
    ? capabilities.operationModes.filter(
        (operationModeKey) => !['off', '空'].includes(String(operationModeKey).trim().toLowerCase()),
      )
    : capabilities.hvacModes
}
export function reconcileClimateTargetTemperature(
  componentTargetTemperature: any,
  confirmedTemperature: any,
  pendingTemperature: any,
  stepOverride = 0.5,
) {
  const confirmedValue = toNumberOrDefault(confirmedTemperature),
    pendingValue = toNumberOrDefault(pendingTemperature)
  if (confirmedValue === null)
    return {
      temperature: componentTargetTemperature,
      pending: pendingTemperature,
      confirmed: false,
    }
  if (pendingValue === null)
    return {
      temperature: confirmedValue,
      pending: null as any,
      confirmed: false,
    }
  const tolerance = Math.max(0.001, Math.abs(toNumberOrDefault(stepOverride, 0.5)) / 2)
  return Math.abs(confirmedValue - pendingValue) <= tolerance
    ? {
        temperature: confirmedValue,
        pending: null as any,
        confirmed: true,
      }
    : {
        temperature: componentTargetTemperature,
        pending: pendingTemperature,
        confirmed: false,
      }
}
export function climateControlStructureKey(entityId: any, structureState: any, deviceTypeHint = 'air-conditioner') {
  const structureCapabilities = normalizeClimateCapabilities(structureState),
    entityDomainName = String(entityId || '').split('.', 1)[0],
    supportsTemperature =
      ['climate', 'water_heater'].includes(entityDomainName) && structureCapabilities.supportsTargetTemperature
  return JSON.stringify({
    temperature: supportsTemperature
      ? [
          structureCapabilities.minimumTemperature,
          structureCapabilities.maximumTemperature,
          structureCapabilities.temperatureStep,
        ]
      : null,
    modes: climateOperationModeValues(structureState, deviceTypeHint),
    fanModes: entityDomainName === 'climate' ? structureCapabilities.fanModes : [],
    fanPercentageStep:
      entityDomainName === 'fan' && structureCapabilities.supportsFanPercentage
        ? structureCapabilities.fanPercentageStep
        : null,
    swingModes: structureCapabilities.swingModes,
    horizontalSwingModes: structureCapabilities.horizontalSwingModes,
    presetModes: structureCapabilities.presetModes,
  })
}
export function resolveClimateDeviceType(deviceComponent: any, deviceState: any, entityId = '') {
  const configuredDeviceType = configuredClimateDeviceType(deviceComponent)
  if (configuredDeviceType !== 'auto') return configuredDeviceType
  // 权威来源：后端 device_profile 的分类结论（人工确认优先，其次规则分类）。
  // 这里**不再**按设备中文名（浴霸 / 风暖）或 hvac_modes 启发式猜型号 ——
  // 猜出来的结论与后端 `classify()` 是两套规则，同一台设备在 3D 面板、
  // 语音选目标与自动化执行里会被判成不同类型。投影由 `device-kind-cache` 提供。
  const profileRenderType = climateRenderTypeFromKind(deviceProfileKind(entityId))
  if (profileRenderType) return profileRenderType
  // 兜底只承认结构事实（实体域），不猜型号：water_heater 域必然是热水器面板，
  // 其余（climate / 未知）沿用历史默认的空调面板，等用户在设置里确认后自动升级。
  const entityDomain = String(entityId || deviceState?.entity_id || '').split('.', 1)[0]
  return entityDomain === 'water_heater' ? 'water-heater' : 'air-conditioner'
}
function measureTextWidth(text: any, fontSizePx: any) {
  return Array.from(String(text || '')).reduce(
    (accumulatedWidth, character) =>
      /\s/u.test(character)
        ? accumulatedWidth + fontSizePx * 0.35
        : // biome-ignore lint/suspicious/noControlCharactersInRegex: ASCII 判定需覆盖 \x00-\x7f 全段
          /[\x00-\x7f]/u.test(character)
          ? /[ilI1.,:;'|!]/u.test(character)
            ? accumulatedWidth + fontSizePx * 0.32
            : /[mwMW@#%&]/u.test(character)
              ? accumulatedWidth + fontSizePx * 0.82
              : accumulatedWidth + fontSizePx * 0.58
          : accumulatedWidth + fontSizePx,
    0,
  )
}
export function climateOptionPresentation(
  modes: any,
  labelLookup: Record<string, any> = {},
  {
    availableWidth: availableWidth = 380,
    buttonGap: buttonGap = 5,
    minimumButtonWidth: minimumButtonWidth = 36,
    horizontalPadding: horizontalPadding = 8,
    iconWidth: iconWidth = 20,
    inlineIcon: inlineIcon = false,
    inlineIconGap: inlineIconGap = 4,
    fontSize: fontSize = 11,
  } = {},
) {
  const modeList = normalizeStringList(modes)
  return modeList.length &&
    modeList
      .map((modeLabelKey) => String((labelLookup as any)?.[modeLabelKey] || modeLabelKey).trim())
      .reduce(
        (totalWidth, label) => {
          const labelWidth = measureTextWidth(label, fontSize),
            buttonWidth = inlineIcon ? iconWidth + inlineIconGap + labelWidth : Math.max(iconWidth, labelWidth)
          return totalWidth + Math.max(minimumButtonWidth, buttonWidth + horizontalPadding)
        },
        Math.max(0, modeList.length - 1) * buttonGap,
      ) > availableWidth
    ? 'select'
    : 'buttons'
}
function climateModeTranslation(
  modeInput: any,
  {
    entityId: translationEntityId = '',
    entityMetadata: entityMetadata = null,
    entityTranslations: entityTranslations = null,
    attributes: attributeOverride = null,
  }: any = {},
) {
  if (!entityTranslations || typeof entityTranslations != 'object') return ''
  const metadata = entityMetadata?.get?.(translationEntityId) || {},
    platform = String(metadata.platform || '').trim(),
    metadataDomain = String(metadata.domain || String(translationEntityId).split('.')[0] || '').trim(),
    translationKey = String(metadata.translationKey || '').trim(),
    modeKey = normalizeClimateModeKey(modeInput)
  if (!platform || !metadataDomain || !translationKey || !modeKey) return ''
  const translationPrefix = 'component.' + platform + '.entity.' + metadataDomain + '.' + translationKey,
    attributeNames =
      Array.isArray(attributeOverride) && attributeOverride.length
        ? attributeOverride
        : ['preset_mode', 'hvac_mode', 'operation_mode', 'fan_mode'],
    trimmedMode = String(modeInput || '').trim(),
    modeCandidates = [...new Set([trimmedMode, trimmedMode.toLowerCase(), modeKey].filter(Boolean))],
    translationKeyCandidates = attributeNames.flatMap((attributeName) =>
      modeCandidates.flatMap((candidate) => [
        translationPrefix + '.state_attributes.' + attributeName + '.state.' + candidate,
        translationPrefix + '.state_attributes.' + attributeName + '.options.' + candidate,
        translationPrefix + '.state_attributes.' + attributeName + '.' + candidate,
      ]),
    )
  for (const candidateTranslationKey of translationKeyCandidates) {
    const translation = String(entityTranslations[candidateTranslationKey] || '').trim()
    if (translation) return translation
  }
  return ''
}
export function climateModeLabel(
  requestedMode: any,
  labelModeDeviceType = 'air-conditioner',
  modeLabelOptions: Record<string, any> = {},
) {
  const rawMode = String(requestedMode || '').trim()
  if (!rawMode) return '—'
  const normalizedModeKey = normalizeClimateModeKey(rawMode),
    modeLabelTable =
      labelModeDeviceType === 'bath-heater'
        ? BATH_HEATER_MODE_LABELS
        : labelModeDeviceType === 'water-heater'
          ? WATER_HEATER_MODE_LABELS
          : CLIMATE_MODE_LABELS,
    candidateTranslation = climateModeTranslation(rawMode, modeLabelOptions)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: 非 ASCII 判定需覆盖 \x00-\x7f 全段
  return candidateTranslation && /[^\x00-\x7f]/u.test(candidateTranslation)
    ? candidateTranslation
    : (modeLabelTable as any)[normalizedModeKey] || candidateTranslation || rawMode
}
export function climateSwingModeLabel(
  swingModeInput: any,
  swingDirection = 'vertical',
  swingLabelOptions: Record<string, any> = {},
) {
  const swingModeName = String(swingModeInput || '').trim()
  if (!swingModeName) return '—'
  const normalizedSwingKey = normalizeClimateModeKey(swingModeName),
    swingLabelTable = swingDirection === 'horizontal' ? HORIZONTAL_SWING_LABELS : VERTICAL_SWING_LABELS
  if ((swingLabelTable as any)[normalizedSwingKey]) return (swingLabelTable as any)[normalizedSwingKey]
  if (swingDirection === 'vertical') {
    const positionMatch = normalizedSwingKey.match(
      /^(horizontal_(?:leftmost|middle_left|middle_right|rightmost))(?:_and_)?vertical_swing$/,
    )
    if (positionMatch) {
      const positionLabel = (HORIZONTAL_POSITION_LABELS as any)[positionMatch[1]]
      if (positionLabel) return positionLabel + '＋上下摆动'
    }
    if ((HORIZONTAL_POSITION_LABELS as any)[normalizedSwingKey])
      return (HORIZONTAL_POSITION_LABELS as any)[normalizedSwingKey]
  }
  return (
    climateModeTranslation(swingModeName, {
      ...swingLabelOptions,
      attributes: [swingDirection === 'horizontal' ? 'swing_horizontal_mode' : 'swing_mode'],
    }) || swingModeName
  )
}
export function climateEffectMode(effectState: any, effectDeviceType = 'air-conditioner') {
  if (!climateIsPoweredOn(effectState, effectDeviceType)) return 'off'
  if (effectDeviceType === 'water-heater') return 'heat'
  const effectModeKey = normalizeClimateModeKey(climatePresentationMode(effectState, effectDeviceType)),
    hvacActionName = String(effectState?.attributes?.hvac_action || '')
      .trim()
      .toLowerCase()
  return effectDeviceType === 'bath-heater'
    ? ['fan', 'fan_only', '吹风'].includes(effectModeKey)
      ? 'cool'
      : [
            'heat',
            'heating',
            'quick_heat',
            'rapid_heat',
            'fast_heat',
            'quick_defog',
            'rapid_defog',
            'fast_defog',
            '取暖',
            '暖风',
            '制热',
          ].includes(effectModeKey)
        ? 'heat'
        : 'other'
    : ['cooling', 'cool'].includes(hvacActionName) || effectModeKey === 'cool'
      ? 'cool'
      : ['heating', 'heat'].includes(hvacActionName) || ['heat', 'heating'].includes(effectModeKey)
        ? 'heat'
        : 'other'
}
/** 返回 MDI 图标名，由 `createUiIcon` 渲染。 */
export function climateModeIcon(iconModeInput: any, iconDeviceType = 'air-conditioner'): string {
  const iconModeKey = normalizeClimateModeKey(iconModeInput)
  const icons: Record<string, string> =
    iconDeviceType === 'water-heater'
      ? {
          off: 'power-standby',
          normal: 'water-boiler',
          standard: 'water-boiler',
          eco: 'leaf',
          adaptive: 'thermostat-auto',
          auto: 'thermostat-auto',
          heat_pump: 'autorenew',
          electric: 'flash-outline',
          gas: 'fire',
          performance: 'lightning-bolt-outline',
          vacation: 'home-outline',
          普通: 'water-boiler',
          自适温: 'thermostat-auto',
          节能: 'leaf',
          加热: 'radiator',
          保温: 'thermometer',
        }
      : iconDeviceType === 'bath-heater'
        ? {
            off: 'power-standby',
            heat: 'radiator',
            heating: 'radiator',
            quick_heat: 'radiator',
            rapid_heat: 'radiator',
            fast_heat: 'radiator',
            fan_only: 'fan',
            fan: 'fan',
            ventilation: 'air-purifier',
            ventilate: 'air-purifier',
            vent: 'air-purifier',
            exhaust: 'air-purifier',
            air_exchange: 'air-purifier',
            defog: 'air-filter',
            defogging: 'air-filter',
            demist: 'air-filter',
            anti_fog: 'air-filter',
            quick_defog: 'radiator',
            rapid_defog: 'radiator',
            fast_defog: 'radiator',
            dry: 'water-percent',
            drying: 'water-percent',
            auto: 'thermostat-auto',
            idle: 'power-standby',
            standby: 'power-standby',
            制热: 'radiator',
            暖风: 'radiator',
            取暖: 'radiator',
            吹风: 'fan',
            换气: 'air-purifier',
            除雾: 'air-filter',
            干燥: 'water-percent',
            待机: 'power-standby',
          }
        : {
            off: 'power-standby',
            cool: 'snowflake',
            heat: 'white-balance-sunny',
            dry: 'water-percent',
            fan_only: 'fan',
            fan: 'fan',
            auto: 'thermostat-auto',
            heat_cool: 'circle-half-full',
            none: 'circle-outline',
            comfort: 'home-thermometer-outline',
            eco: 'leaf',
            boost: 'lightning-bolt-outline',
            sleep: 'weather-night',
            away: 'home-export-outline',
            mold_prev: 'air-filter',
            eco_and_mold_prev: 'leaf',
            eco_mold_prev: 'leaf',
          }
  return icons[iconModeKey] || 'circle-small'
}
export function climateDeviceLabel(deviceLabelType: any) {
  return deviceLabelType === 'bath-heater' ? '浴霸' : deviceLabelType === 'water-heater' ? '热水器' : '空调'
}

/**
 * 气候弹窗标题（0.8.1 `climateDialogTitle`）。
 *
 * 历史遗留：浴霸卡片的默认标签被存成了「空调」，早期只靠「标签非空就用标签」，
 * 于是浴霸弹窗一直显示「空调」。判到「浴霸 + 标签恰好是空调」时才改用兜底
 * （设备名 → 类型中文名），其它情况仍尊重用户自己起的标签。
 */
export function climateDialogTitle(
  deviceLabel: unknown,
  deviceName: unknown = '',
  deviceLabelType = 'air-conditioner',
) {
  const trimmedLabel = String(deviceLabel || '').trim(),
    fallbackLabel = String(deviceName || '').trim() || climateDeviceLabel(deviceLabelType)
  if (!trimmedLabel) return fallbackLabel
  return deviceLabelType === 'bath-heater' && trimmedLabel === '空调' ? fallbackLabel : trimmedLabel
}

export function climatePowerCommand(
  commandEntityId: any,
  commandState: any,
  isTurningOn: any,
  commandDeviceType = 'air-conditioner',
  preferredMode = '',
) {
  const commandDomain = String(commandEntityId || '').split('.', 1)[0]
  if (commandDomain === 'water_heater')
    return {
      domain: 'water_heater',
      service: isTurningOn ? 'turn_on' : 'turn_off',
      data: {} as Record<string, any>,
    }
  if (commandDomain === 'fan')
    return {
      domain: 'fan',
      service: isTurningOn ? 'turn_on' : 'turn_off',
      data: {} as Record<string, any>,
    }
  if (commandDomain !== 'climate')
    return {
      domain: 'homeassistant',
      service: 'toggle',
      data: {} as Record<string, any>,
    }
  const powerCapabilities = normalizeClimateCapabilities(commandState)
  if (!isTurningOn)
    return powerCapabilities.hvacModes.includes('off')
      ? {
          domain: 'climate',
          service: 'set_hvac_mode',
          data: {
            hvac_mode: 'off',
          },
        }
      : {
          domain: 'homeassistant',
          service: 'toggle',
          data: {} as Record<string, any>,
        }
  const availableModes = powerCapabilities.hvacModes.filter((availableMode) => availableMode !== 'off'),
    preferredModes =
      commandDeviceType === 'bath-heater'
        ? ['heat', 'auto', 'fan_only', 'ventilation', 'dry', 'idle']
        : ['auto', 'cool', 'heat_cool', 'heat', 'fan_only', 'dry', 'idle'],
    selectedMode = availableModes.includes(preferredMode)
      ? preferredMode
      : preferredModes.find((candidateMode) => availableModes.includes(candidateMode)) || availableModes[0]
  return selectedMode
    ? {
        domain: 'climate',
        service: 'set_hvac_mode',
        data: {
          hvac_mode: selectedMode,
        },
      }
    : {
        domain: 'homeassistant',
        service: 'toggle',
        data: {} as Record<string, any>,
      }
}
export function climateDefaultIcon(defaultIconDeviceType: any) {
  return defaultIconDeviceType === 'bath-heater'
    ? 'mdi:radiator'
    : defaultIconDeviceType === 'water-heater'
      ? 'mdi:water-boiler'
      : 'mdi:air-conditioner'
}
export function waterHeaterStatusLabel(waterHeaterState: any) {
  const rawState = String(waterHeaterState?.state || '')
    .trim()
    .toLowerCase()
  return rawState === 'unavailable'
    ? '当前不可用'
    : !rawState || rawState === 'unknown'
      ? '状态未知'
      : rawState === 'off'
        ? '已关闭'
        : climateIsRunning(waterHeaterState, 'water-heater')
          ? '正在加热'
          : '保温中'
}

export function entityMetadataIsAvailable(metadata: any) {
  return !!metadata?.entityId && !metadata.disabledBy && metadata.status !== 'missing' && metadata.status !== 'disabled'
}

export function relativeLightColorTemperature(minimumKelvin: any, maximumKelvin: any, relativePercent: any) {
  const parsedMinimumKelvin = Number(minimumKelvin),
    parsedMaximumKelvin = Number(maximumKelvin),
    relativeRatio = Math.max(0, Math.min(100, Number(relativePercent) || 0)) / 100
  return !Number.isFinite(parsedMinimumKelvin) ||
    !Number.isFinite(parsedMaximumKelvin) ||
    parsedMaximumKelvin <= parsedMinimumKelvin
    ? Number.isFinite(parsedMinimumKelvin)
      ? parsedMinimumKelvin
      : 2700
    : parsedMinimumKelvin + (parsedMaximumKelvin - parsedMinimumKelvin) * relativeRatio
}
export function lightVisualValueForCapability(isCapabilitySupported: any, capabilityValue: any, fallbackValue: any) {
  const numericCapabilityValue = Number(capabilityValue)
  return isCapabilitySupported && Number.isFinite(numericCapabilityValue)
    ? numericCapabilityValue
    : Number(fallbackValue)
}
const colorModeSet = new Set(['hs', 'rgb', 'rgbw', 'rgbww', 'xy'])
function resolveSupportedColorModes(attributes: HaEntityAttributes = {}) {
  const normalizedColorModes = Array.isArray(attributes?.supported_color_modes)
    ? attributes.supported_color_modes
        .map((declaredMode) =>
          String(declaredMode || '')
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
    : []
  if (normalizedColorModes.length) return normalizedColorModes
  if (lightColorHs(attributes)) normalizedColorModes.push('hs')
  if (lightRealtimeCapabilities('light.legacy', { attributes }).colorTemperature)
    normalizedColorModes.push('color_temp')
  return normalizedColorModes
}
const isByteChannelArray = (channelArray: any, expectedLength: any) =>
  Array.isArray(channelArray) &&
  channelArray.length === expectedLength &&
  channelArray.every(
    (channelByte) =>
      typeof channelByte == 'number' && Number.isFinite(channelByte) && channelByte >= 0 && channelByte <= 255,
  )
function lightKelvinRgb(kelvinValue: any) {
  const scaledKelvin = Math.max(1000, Math.min(40000, Number(kelvinValue) || 2700)) / 100
  return [
    scaledKelvin <= 66 ? 255 : 329.698727446 * (scaledKelvin - 60) ** -0.1332047592,
    scaledKelvin <= 66
      ? 99.4708025861 * Math.log(scaledKelvin) - 161.1195681661
      : 288.1221695283 * (scaledKelvin - 60) ** -0.0755148492,
    scaledKelvin >= 66 ? 255 : scaledKelvin <= 19 ? 0 : 138.5177312231 * Math.log(scaledKelvin - 10) - 305.0447927307,
  ].map((clampedChannel) => Math.max(0, Math.min(255, clampedChannel)))
}
export function lightColorRgb(colorAttributes: HaEntityAttributes = {}) {
  const colorState = colorAttributes,
    colorMode = colorState.color_mode
  if (colorMode === 'white') return [255, 255, 255]
  if (['color_temp', 'onoff', 'brightness', 'unknown'].includes(colorMode!)) return null
  const resolveHsColor = () =>
      Array.isArray(colorState.hs_color) &&
      colorState.hs_color.length === 2 &&
      colorState.hs_color.every(
        (hsColorComponent) => typeof hsColorComponent == 'number' && Number.isFinite(hsColorComponent),
      )
        ? hsToRgbColor(colorState.hs_color)
        : null,
    resolveRgbColor = () =>
      isByteChannelArray(colorState.rgb_color, 3) ? [...(colorState.rgb_color as number[])] : null,
    resolveRgbwColor = (colorAttributeName: any, componentCount: any) => {
      if (!isByteChannelArray(colorState[colorAttributeName], componentCount)) return null
      const rawColorComponents = colorState[colorAttributeName]
      let baseChannels = [rawColorComponents[3], rawColorComponents[3], rawColorComponents[3]]
      if (componentCount === 5) {
        const [firstWhiteChannel, secondWhiteChannel] = rawColorComponents.slice(3),
          minimumColorTemperatureKelvin = Number(colorState.min_color_temp_kelvin) || 2700,
          maximumColorTemperatureKelvin = Number(colorState.max_color_temp_kelvin) || 6500,
          whiteMixRatio =
            firstWhiteChannel + secondWhiteChannel
              ? secondWhiteChannel / (firstWhiteChannel + secondWhiteChannel)
              : 0.5,
          interpolatedKelvin =
            1000000 /
            (1000000 / maximumColorTemperatureKelvin +
              whiteMixRatio * (1000000 / minimumColorTemperatureKelvin - 1000000 / maximumColorTemperatureKelvin))
        baseChannels = lightKelvinRgb(interpolatedKelvin).map(
          (kelvinChannel) => (kelvinChannel * Math.max(firstWhiteChannel, secondWhiteChannel)) / 255,
        )
      }
      const combinedChannels = rawColorComponents
          .slice(0, 3)
          .map((baseChannel: any, channelIndex: any) => baseChannel + baseChannels[channelIndex]),
        channelScale = Math.max(...combinedChannels)
          ? Math.max(...rawColorComponents) / Math.max(...combinedChannels)
          : 0
      return combinedChannels.map((scaledChannel: any) => Math.round(scaledChannel * channelScale))
    },
    resolveXyColor = () => {
      if (
        !Array.isArray(colorState.xy_color) ||
        colorState.xy_color.length !== 2 ||
        !colorState.xy_color.every((xyComponent) => typeof xyComponent == 'number' && Number.isFinite(xyComponent))
      )
        return null
      const [chromaticityX, chromaticityY] = colorState.xy_color
      if (chromaticityX < 0 || chromaticityY <= 0 || chromaticityX + chromaticityY > 1.00001) return null
      const chromaticityRatioX = chromaticityX / chromaticityY,
        chromaticityRatioY = (1 - chromaticityX - chromaticityY) / chromaticityY,
        linearRgbChannels = [
          1.656492 * chromaticityRatioX - 0.354851 - 0.255038 * chromaticityRatioY,
          -0.707196 * chromaticityRatioX + 1.655397 + 0.036152 * chromaticityRatioY,
          0.051713 * chromaticityRatioX - 0.121364 + 1.01153 * chromaticityRatioY,
        ].map((linearChannel) =>
          linearChannel <= 0.0031308
            ? Math.max(0, linearChannel) * 12.92
            : 1.055 * Math.pow(linearChannel, 1 / 2.4) - 0.055,
        ),
        componentMaximum = Math.max(...linearRgbChannels, 1)
      return linearRgbChannels.map((normalizedChannel) => Math.round((normalizedChannel / componentMaximum) * 255))
    }
  return colorMode === 'hs'
    ? resolveHsColor() || resolveRgbColor()
    : colorMode === 'xy'
      ? resolveRgbColor() || resolveXyColor() || resolveHsColor()
      : colorMode === 'rgbw'
        ? resolveRgbColor() || resolveRgbwColor('rgbw_color', 4) || resolveHsColor()
        : colorMode === 'rgbww'
          ? resolveRgbColor() || resolveRgbwColor('rgbww_color', 5) || resolveHsColor()
          : colorMode === 'rgb'
            ? resolveRgbColor() || resolveHsColor()
            : resolveRgbColor() ||
              resolveRgbwColor('rgbw_color', 4) ||
              resolveRgbwColor('rgbww_color', 5) ||
              resolveHsColor() ||
              resolveXyColor()
}
export function lightColorHs(hsAttributes: HaEntityAttributes = {}) {
  if (
    (!hsAttributes.color_mode || hsAttributes.color_mode === 'hs') &&
    Array.isArray(hsAttributes.hs_color) &&
    hsAttributes.hs_color.length === 2 &&
    hsAttributes.hs_color.every(
      (hsPairComponent) => typeof hsPairComponent == 'number' && Number.isFinite(hsPairComponent),
    )
  )
    return [((hsAttributes.hs_color[0] % 360) + 360) % 360, Math.max(0, Math.min(100, hsAttributes.hs_color[1]))]
  const computedRgbColor = lightColorRgb(hsAttributes)
  return computedRgbColor ? rgbToHsColor(computedRgbColor) : null
}
export function lightControlModes(modeAttributes: Record<string, any> = {}) {
  const resolvedColorModes = resolveSupportedColorModes(modeAttributes)
  return [
    ...(resolvedColorModes.some((colorModeName) => colorModeSet.has(colorModeName)) ? ['color'] : []),
    ...(resolvedColorModes.includes('color_temp') ? ['temperature'] : []),
    ...(resolvedColorModes.includes('white') ? ['white'] : []),
  ]
}
export function lightControlMode(reportedColorMode: any, availableModes: any) {
  const normalizedControlMode =
    reportedColorMode === 'color_temp' ? 'temperature' : reportedColorMode === 'white' ? 'white' : 'color'
  return availableModes.includes(normalizedControlMode) ? normalizedControlMode : availableModes[0] || 'temperature'
}
export function lightSupportsColor(entityAttributes: HaEntityAttributes = {}) {
  return resolveSupportedColorModes(entityAttributes).some((supportedColorMode) => colorModeSet.has(supportedColorMode))
}
export function lightRealtimeCapabilities(entityId = '', entityState: HaEntityState = {}) {
  const stateObject = entityState?.newState || entityState || {},
    stateAttributes = stateObject?.attributes || {},
    isLightEntity = String(entityId || stateObject.entityId || stateObject.domain || '').split('.', 1)[0] === 'light',
    declaredColorModes = Array.isArray(stateAttributes.supported_color_modes)
      ? stateAttributes.supported_color_modes
          .map((declaredMode) => String(declaredMode).trim().toLowerCase())
          .filter(Boolean)
      : [],
    supportedFeatures = Number(stateAttributes.supported_features || 0),
    hasNumericAttribute = (attributeName: any) =>
      stateAttributes[attributeName] !== null &&
      stateAttributes[attributeName] !== undefined &&
      stateAttributes[attributeName] !== '' &&
      typeof stateAttributes[attributeName] != 'boolean' &&
      Number.isFinite(Number(stateAttributes[attributeName]))
  return {
    brightness:
      isLightEntity &&
      (declaredColorModes.length
        ? declaredColorModes.some(
            (declaredMode) =>
              colorModeSet.has(declaredMode) || ['brightness', 'color_temp', 'white'].includes(declaredMode),
          )
        : hasNumericAttribute('brightness') || (supportedFeatures & 1) === 1),
    colorTemperature:
      isLightEntity &&
      (declaredColorModes.length
        ? declaredColorModes.includes('color_temp')
        : hasNumericAttribute('color_temp_kelvin') ||
          hasNumericAttribute('min_color_temp_kelvin') ||
          hasNumericAttribute('max_color_temp_kelvin') ||
          hasNumericAttribute('color_temp') ||
          (supportedFeatures & 2) === 2),
  }
}
export function rgbToHsColor(rgbColor: any) {
  if (!Array.isArray(rgbColor) || rgbColor.length < 3) return null
  const normalizedChannels = rgbColor
      .slice(0, 3)
      .map((channelValue) => Math.max(0, Math.min(255, Number(channelValue) || 0)) / 255),
    maximumChannel = Math.max(...normalizedChannels),
    minimumChannel = Math.min(...normalizedChannels),
    channelRange = maximumChannel - minimumChannel
  let hueDegrees = 0
  channelRange > 0 &&
    (maximumChannel === normalizedChannels[0]
      ? (hueDegrees = 60 * (((normalizedChannels[1] - normalizedChannels[2]) / channelRange) % 6))
      : maximumChannel === normalizedChannels[1]
        ? (hueDegrees = 60 * ((normalizedChannels[2] - normalizedChannels[0]) / channelRange + 2))
        : (hueDegrees = 60 * ((normalizedChannels[0] - normalizedChannels[1]) / channelRange + 4))),
    hueDegrees < 0 && (hueDegrees += 360)
  const saturationRatio = maximumChannel <= 0 ? 0 : channelRange / maximumChannel
  return [hueDegrees, saturationRatio * 100]
}
export function hsToRgbColor(hsColor: any) {
  if (!Array.isArray(hsColor) || hsColor.length < 2) return null
  const normalizedHue = (((Number(hsColor[0]) || 0) % 360) + 360) % 360,
    normalizedSaturation = Math.max(0, Math.min(100, Number(hsColor[1]) || 0)) / 100,
    maximumValue = 1,
    chroma = maximumValue * normalizedSaturation,
    hueSector = normalizedHue / 60,
    secondaryComponent = chroma * (1 - Math.abs((hueSector % 2) - 1)),
    minimumValue = maximumValue - chroma,
    [redComponent, greenComponent, blueComponent] =
      hueSector < 1
        ? [chroma, secondaryComponent, 0]
        : hueSector < 2
          ? [secondaryComponent, chroma, 0]
          : hueSector < 3
            ? [0, chroma, secondaryComponent]
            : hueSector < 4
              ? [0, secondaryComponent, chroma]
              : hueSector < 5
                ? [secondaryComponent, 0, chroma]
                : [chroma, 0, secondaryComponent]
  return [redComponent, greenComponent, blueComponent].map((componentValue) =>
    Math.round((componentValue + minimumValue) * 255),
  )
}
export function lightColorPickerHsFromPoint(normalizedX: any, normalizedY: any, aspectRatio = 1) {
  const clampedX = Math.max(0, Math.min(1, Number(normalizedX) || 0)),
    clampedY = Math.max(0, Math.min(1, Number(normalizedY) || 0)),
    offsetX = clampedX - 0.5,
    offsetY = clampedY - 0.5,
    radialDistance = Math.max(Math.abs(offsetX), Math.abs(offsetY)) * 2,
    effectiveAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1
  return [
    ((((Math.atan2(offsetY, offsetX * effectiveAspectRatio) * 180) / Math.PI + 360) % 360) + 90) % 360,
    radialDistance * 100,
  ]
}
export function lightColorPickerPointFromHs(hueSaturation: any, pickerAspectRatio = 1) {
  const pickerHueDegrees = (((Number(hueSaturation?.[0]) || 0) % 360) + 360) % 360,
    pickerSaturationRatio = Math.max(0, Math.min(100, Number(hueSaturation?.[1]) || 0)) / 100,
    hueRadians = ((pickerHueDegrees - 90) * Math.PI) / 180,
    effectivePickerAspectRatio = Number.isFinite(pickerAspectRatio) && pickerAspectRatio > 0 ? pickerAspectRatio : 1,
    cosineScale = Math.cos(hueRadians) / effectivePickerAspectRatio,
    sineValue = Math.sin(hueRadians),
    pointRadius = (pickerSaturationRatio * 0.5) / Math.max(Math.abs(cosineScale), Math.abs(sineValue))
  return {
    x: Math.max(0, Math.min(1, 0.5 + cosineScale * pointRadius)),
    y: Math.max(0, Math.min(1, 0.5 + sineValue * pointRadius)),
  }
}
export function lightColorServiceData(lightAttributes: any, hsColorPair: any) {
  const colorModes = resolveSupportedColorModes(lightAttributes),
    roundedHsColor = [
      Math.round((((Number(hsColorPair?.[0]) || 0) % 360) + 360) % 360),
      Math.round(Math.max(0, Math.min(100, Number(hsColorPair?.[1]) || 0))),
    ]
  return colorModes.includes('hs') || colorModes.includes('xy') || !colorModes.includes('rgb')
    ? {
        hs_color: roundedHsColor,
      }
    : {
        rgb_color: hsToRgbColor(roundedHsColor),
      }
}
export const UNSUPPORTED_LIGHT_VISUAL_TEMPERATURE_KELVIN = 4600,
  UNSUPPORTED_LIGHT_VISUAL_BRIGHTNESS_PERCENT = 100
export function lightPresetBrightnessServiceData(brightnessPercent: any) {
  const clampedBrightnessPercent = Math.max(1, Math.min(100, Math.round(Number(brightnessPercent) || 1)))
  return clampedBrightnessPercent === 100
    ? {
        brightness: 255,
      }
    : {
        brightness_pct: clampedBrightnessPercent,
      }
}
export const LIGHT_DETAIL_PRESET_DEFINITIONS = Object.freeze([
    Object.freeze({
      label: '柔和',
      detail: '25%',
      brightnessPercent: 25,
      colorTemperaturePercent: 10,
    }),
    Object.freeze({
      label: '日常',
      detail: '60%',
      brightnessPercent: 60,
      colorTemperaturePercent: 50,
    }),
    Object.freeze({
      label: '明亮',
      detail: '100%',
      brightnessPercent: 100,
      colorTemperaturePercent: 100,
    }),
  ]),
  LIGHT_PRESET_MINIMUM_HOLD_MS = 8000,
  LIGHT_PRESET_STABLE_CONFIRMATION_MS = 1200,
  LIGHT_PRESET_MAXIMUM_HOLD_MS = 12000
export function lightPresetPendingDecision(pendingPreset: any, nowMs = Date.now()) {
  if (!pendingPreset) return 'idle'
  const currentTimeMs = Number(nowMs) || 0
  if (currentTimeMs >= Number(pendingPreset.expiresAt || 0)) return 'timeout'
  if (!pendingPreset.latestMatches || !Number.isFinite(Number(pendingPreset.matchStartedAt))) return 'hold'
  const hasReachedMinimumHold = currentTimeMs >= Number(pendingPreset.minimumHoldUntil || 0),
    isStableConfirmationElapsed =
      currentTimeMs - Number(pendingPreset.matchStartedAt) >= LIGHT_PRESET_STABLE_CONFIRMATION_MS
  return hasReachedMinimumHold && isStableConfirmationElapsed ? 'confirmed' : 'hold'
}

/**
 * 扫地机地图能不能用（0.8.1 `vacuumMapAvailable`）。
 *
 * 这里的三道校验都是**否决**：标定点数不足 3、坐标不是有限数、三点共线（行列式≈0）
 * 都意味着地图无法与机器人坐标对齐，继续加载只会得到一张错位的图。
 * 早期实现把这三处写成了 `return true`（等于永不判坏），于是「标定坏了」的户型
 * 会一直显示一张歪的地图，而不是退回「地图暂不可用」。
 */
export function vacuumMapAvailable(stateEntry: any) {
  const entityState = stateEntry && Object.hasOwn(stateEntry, 'newState') ? stateEntry.newState : stateEntry
  if (!entityState || ['unavailable', 'unknown'].includes(String(entityState.state || '').toLowerCase())) return false
  const stateAttributes = entityState.attributes || {}
  // 空地图（还没建图）直接不可用：此时请求到的图片一定是空白页。
  if (stateAttributes.is_empty === true || stateAttributes.empty_map === true) return false
  if (Object.hasOwn(stateAttributes, 'calibration_points')) {
    const calibrationPoints = stateAttributes.calibration_points
    if (!Array.isArray(calibrationPoints) || calibrationPoints.length < 3) return false
    const [firstCalibration, secondCalibration, thirdCalibration] = calibrationPoints
    for (const coordinateSpace of ['map', 'vacuum']) {
      if (
        ![firstCalibration, secondCalibration, thirdCalibration].every(
          (calibrationPoint) =>
            Number.isFinite(calibrationPoint?.[coordinateSpace]?.x) &&
            Number.isFinite(calibrationPoint?.[coordinateSpace]?.y),
        )
      )
        return false
      const barycentricDeterminant =
        (secondCalibration[coordinateSpace].x - firstCalibration[coordinateSpace].x) *
          (thirdCalibration[coordinateSpace].y - firstCalibration[coordinateSpace].y) -
        (secondCalibration[coordinateSpace].y - firstCalibration[coordinateSpace].y) *
          (thirdCalibration[coordinateSpace].x - firstCalibration[coordinateSpace].x)
      if (Math.abs(barycentricDeterminant) < 1e-9) return false
    }
  }
  return true
}

/**
 * 现在是否**值得发起**一次地图请求（0.8.1 `vacuumMapRequestable`）。
 *
 * 与 `vacuumMapAvailable` 的唯一差别：`calibration_points: null` 表示「首次校准还没生成」，
 * 这时地图本身是能看的，只是不能用来做坐标换算 —— 把该字段摘掉再判可用即可。
 * 少了这条，新装机器在第一次校准前会一直空白。
 */
export function vacuumMapRequestable(stateEntry: Parameters<typeof vacuumMapAvailable>[0]) {
  const entityState = stateEntry && Object.hasOwn(stateEntry, 'newState') ? stateEntry.newState : stateEntry
  if (entityState?.attributes?.calibration_points === null) {
    const { calibration_points: _unusableCalibration, ...requestableAttributes } = entityState.attributes
    return vacuumMapAvailable({ ...entityState, attributes: requestableAttributes })
  }
  return vacuumMapAvailable(stateEntry)
}

export function vacuumMapSource(sourceEntityId: string, cacheBustTimestamp: string | number = Date.now()) {
  return /^(camera|image)\.[a-z0-9_]+$/.test(sourceEntityId || '')
    ? '/api/' +
        (sourceEntityId.startsWith('camera.') ? 'camera' : 'image') +
        '_proxy/' +
        encodeURIComponent(sourceEntityId) +
        '?hb=' +
        encodeURIComponent(cacheBustTimestamp) +
        '&hb_live=1'
    : ''
}
export function createVacuumMapImageLoader({
  entityId: entityId,
  getState: getState,
  isActive: isActive,
  onFrame: onFrame,
  onUnavailable: onUnavailable,
}: any) {
  let isDisposed = false,
    hasSynced = false,
    loadingImage: any = null,
    retryTimerId: any = null,
    loadTimeoutId: any = null,
    requestGeneration = 0,
    retryCount = 0,
    lastStateSignature = '',
    lastRequestAtMs = -Infinity,
    isRefreshPending = false
  const cancelImageLoad = () => {
      requestGeneration++,
        clearTimeout(retryTimerId),
        clearTimeout(loadTimeoutId),
        (retryTimerId = loadTimeoutId = null),
        loadingImage &&
          ((loadingImage.onload = loadingImage.onerror = null), (loadingImage.src = ''), (loadingImage = null))
    },
    shouldLoadImage = () => !isDisposed && isActive() && vacuumMapRequestable(getState()),
    scheduleRefresh = (delayMs: any) => {
      clearTimeout(retryTimerId),
        (retryTimerId = setTimeout(() => {
          ;(retryTimerId = null), loadMapImage()
        }, delayMs))
    }
  function loadMapImage() {
    if (!shouldLoadImage()) {
      syncState()
      return
    }
    if (loadingImage) {
      isRefreshPending = true
      return
    }
    ;(lastRequestAtMs = Date.now()), (isRefreshPending = false)
    const mapImage = new Image(),
      generation = ++requestGeneration
    loadingImage = mapImage
    const handleImageResult = (isLoaded: any) => {
      if (!(isDisposed || generation !== requestGeneration)) {
        if (
          (requestGeneration++,
          clearTimeout(loadTimeoutId),
          (loadTimeoutId = null),
          (loadingImage = null),
          (mapImage.onload = mapImage.onerror = null),
          !shouldLoadImage())
        ) {
          ;(mapImage.src = ''), syncState()
          return
        }
        isLoaded ? ((retryCount = 0), onFrame(mapImage)) : ((mapImage.src = ''), retryCount++, onUnavailable()),
          scheduleRefresh(
            isRefreshPending
              ? Math.max(0, 1000 - (Date.now() - lastRequestAtMs))
              : isLoaded
                ? 5000
                : Math.min(30000, 1000 * 2 ** Math.min(retryCount - 1, 5)),
          )
      }
    }
    ;(mapImage.onload = () => handleImageResult(true)),
      (mapImage.onerror = () => handleImageResult(false)),
      (loadTimeoutId = setTimeout(() => handleImageResult(false), 15000)),
      (mapImage.src = vacuumMapSource(entityId, Date.now() + '-' + generation))
  }
  function syncState() {
    if (isDisposed) return
    const isLoadAllowed = shouldLoadImage(),
      reportedState = getState(),
      currentState = reportedState?.newState || reportedState || {},
      vacuumStateAttributes = currentState.attributes || {},
      stateSignature = JSON.stringify([
        currentState.state,
        currentState.updatedAt,
        currentState.last_updated,
        vacuumStateAttributes.image_last_updated,
        vacuumStateAttributes.frame_id,
        vacuumStateAttributes.map_id,
        vacuumStateAttributes.calibration_points,
        vacuumStateAttributes.is_empty,
      ])
    if (!isLoadAllowed) {
      cancelImageLoad(), (hasSynced = false), (lastStateSignature = stateSignature), onUnavailable()
      return
    }
    const isFirstSync = !hasSynced,
      hasStateChanged = lastStateSignature !== stateSignature
    ;(hasSynced = true),
      (lastStateSignature = stateSignature),
      isFirstSync
        ? ((retryCount = 0), loadMapImage())
        : hasStateChanged &&
          (loadingImage
            ? (isRefreshPending = true)
            : scheduleRefresh(Math.max(0, 1000 - (Date.now() - lastRequestAtMs))))
  }
  return {
    sync: syncState,
    dispose() {
      ;(isDisposed = true), cancelImageLoad(), onUnavailable()
    },
  }
}

const VACUUM_FEATURE_FLAGS = Object.freeze({
  turn_on: 1,
  turn_off: 2,
  pause: 4,
  stop: 8,
  return_to_base: 16,
  locate: 512,
  clean_spot: 1024,
  start: 8192,
})
export function vacuumSupportedActions(vacuumState: any) {
  const supportedFeatures = vacuumState?.attributes?.supported_features
  if (supportedFeatures == null || supportedFeatures === '') return ['start', 'pause', 'return_to_base']
  const numericFeatures = Number(supportedFeatures)
  if (!Number.isFinite(numericFeatures)) return ['start', 'pause', 'return_to_base']
  const actions: any[] = []
  return (
    (numericFeatures & VACUUM_FEATURE_FLAGS.start || numericFeatures & VACUUM_FEATURE_FLAGS.turn_on) &&
      actions.push('start'),
    numericFeatures & VACUUM_FEATURE_FLAGS.pause && actions.push('pause'),
    (numericFeatures & VACUUM_FEATURE_FLAGS.stop || numericFeatures & VACUUM_FEATURE_FLAGS.turn_off) &&
      actions.push('stop'),
    numericFeatures & VACUUM_FEATURE_FLAGS.return_to_base && actions.push('return_to_base'),
    numericFeatures & VACUUM_FEATURE_FLAGS.locate && actions.push('locate'),
    numericFeatures & VACUUM_FEATURE_FLAGS.clean_spot && actions.push('clean_spot'),
    actions
  )
}
export function vacuumActionService(vacuumEntity: any, actionName: any) {
  const featureFlags = Number(vacuumEntity?.attributes?.supported_features)
  return Number.isFinite(featureFlags)
    ? actionName === 'start' &&
      !(featureFlags & VACUUM_FEATURE_FLAGS.start) &&
      featureFlags & VACUUM_FEATURE_FLAGS.turn_on
      ? 'turn_on'
      : actionName === 'stop' &&
          !(featureFlags & VACUUM_FEATURE_FLAGS.stop) &&
          featureFlags & VACUUM_FEATURE_FLAGS.turn_off
        ? 'turn_off'
        : actionName
    : actionName
}
function resolveStateEntry(stateEntryOrChange: any) {
  return stateEntryOrChange?.newState || stateEntryOrChange || null
}
const statusLabels = {
    cleaning: '清扫中',
    sweeping: '扫地中',
    mopping: '拖地中',
    sweeping_and_mopping: '扫拖中',
    mopping_after_sweeping: '先扫后拖中',
    spot_cleaning: '局部清扫中',
    zone_cleaning: '区域清扫中',
    segment_cleaning: '房间清扫中',
    auto_cleaning: '自动清扫中',
    second_cleaning: '二次清洁中',
    extra_cleaning: '加强清洁中',
    heading_to_extra_cleaning: '前往加强清洁',
    initial_deep_cleaning: '深度清洁中',
    returning: '回充中',
    returning_to_wash: '返回清洗拖布',
    returning_to_wash_paused: '返回清洗已暂停',
    returning_paused: '回充已暂停',
    returning_auto_empty: '返回集尘',
    returning_install_mop: '返回安装拖布',
    returning_remove_mop: '返回拆卸拖布',
    returning_to_drain: '返回排水',
    washing: '清洗拖布',
    washing_paused: '清洗已暂停',
    drying: '烘干拖布',
    drying_paused: '烘干已暂停',
    auto_emptying: '集尘中',
    station_cleaning: '基站自清洁',
    station_reset: '基站复位中',
    clean_add_water: '补水中',
    water_check: '水路检查中',
    draining: '排水中',
    auto_water_draining: '自动排水中',
    emptying: '排空水箱中',
    dust_bag_drying: '尘袋烘干中',
    dust_bag_drying_paused: '尘袋烘干已暂停',
    installing_mop: '安装拖布中',
    uninstalling_mop: '拆卸拖布中',
    changing_mop: '更换拖布中',
    changing_mop_paused: '更换拖布已暂停',
    sanitizing: '消毒中',
    sanitizing_with_dry: '消毒烘干中',
    charging: '充电中',
    charging_completed: '充电完成',
    smart_charging: '智能充电',
    intelligent_recharging: '智能回充中',
    docked: '已回充',
    idle: '待机',
    paused: '已暂停',
    stopped: '已停止',
    sleeping: '休眠中',
    waiting_for_task: '等待任务',
    upgrading: '固件升级中',
    mapping: '建图中',
    remote_control: '遥控中',
    monitoring: '巡航中',
    monitoring_paused: '巡航已暂停',
    finding_pet: '寻找宠物中',
    finding_pet_paused: '寻找宠物已暂停',
    human_following: '跟随中',
    pet_guarding: '宠物看护中',
    pet_guarding_paused: '宠物看护已暂停',
    clean_summon: '前往指定位置清洁',
    shortcut: '快捷任务中',
    floor_maintaining: '地板养护中',
    floor_maintaining_paused: '地板养护已暂停',
    initial_deep_cleaning_paused: '深度清洁已暂停',
    remote_pickup: '遥控拾取中',
    arranging_items: '整理物品中',
    assisted_cleaning: '辅助清洁中',
    entering_dock: '进入基站',
    leaving_dock: '离开基站',
    navigating_to_climber: '前往爬楼装置',
    docking_to_climber: '连接爬楼装置',
    climber_docked: '已连接爬楼装置',
    climber_navigating: '爬楼装置移动中',
    climbing_stairs: '爬楼中',
    climbing_stairs_completed: '爬楼完成',
    climber_at_dock: '爬楼装置已停靠',
    climber_leaving_dock: '爬楼装置离站中',
    error: '设备异常',
    unavailable: '设备离线',
    unknown: '等待状态',
  },
  statusAliases = {
    vacuuming: 'cleaning',
    standby: 'idle',
    ready: 'idle',
    off: 'stopped',
    returning_to_base: 'returning',
    returning_home: 'returning',
    back_home: 'returning',
    return_to_charge: 'returning',
    returning_to_washing: 'returning_to_wash',
    mop_washing: 'washing',
    self_washing: 'washing',
    cleaning_mop: 'washing',
    mop_drying: 'drying',
    drying_mop: 'drying',
    building: 'mapping',
    fast_mapping: 'mapping',
    automatic: 'auto_cleaning',
    zone: 'zone_cleaning',
    segment: 'segment_cleaning',
    spot: 'spot_cleaning',
    cleaning_paused: 'paused',
    docking_paused: 'returning_paused',
    auto_docking_paused: 'returning_paused',
    segment_docking_paused: 'returning_paused',
    zone_docking_paused: 'returning_paused',
    auto_cleaning_paused: 'paused',
    segment_cleaning_paused: 'paused',
    zone_cleaning_paused: 'paused',
    spot_cleaning_paused: 'paused',
    mopping_paused: 'paused',
    zone_mopping_paused: 'paused',
    segment_mopping_paused: 'paused',
    auto_mopping_paused: 'paused',
    map_cleaning_paused: 'paused',
    adding_water: 'clean_add_water',
    room_cleaning: 'segment_cleaning',
    follow_wall_cleaning: 'cleaning',
    cruising_path: 'monitoring',
    cruising_point: 'monitoring',
    cruising_path_paused: 'monitoring_paused',
    cruising_point_paused: 'monitoring_paused',
    summon_clean: 'clean_summon',
    person_follow: 'human_following',
    ota: 'upgrading',
    power_off: 'stopped',
    pet_finding: 'finding_pet',
  },
  movingStatusSet = new Set(
    'cleaning sweeping mopping sweeping_and_mopping mopping_after_sweeping spot_cleaning zone_cleaning segment_cleaning auto_cleaning second_cleaning extra_cleaning heading_to_extra_cleaning initial_deep_cleaning returning returning_to_wash returning_auto_empty returning_install_mop returning_remove_mop returning_to_drain intelligent_recharging mapping remote_control monitoring finding_pet human_following pet_guarding clean_summon shortcut floor_maintaining remote_pickup arranging_items assisted_cleaning entering_dock leaving_dock navigating_to_climber docking_to_climber climber_navigating climbing_stairs climber_leaving_dock'.split(
      ' ',
    ),
  ),
  stationWorkingStatusSet = new Set(
    'washing drying auto_emptying station_cleaning station_reset clean_add_water water_check draining auto_water_draining emptying dust_bag_drying installing_mop uninstalling_mop changing_mop sanitizing sanitizing_with_dry'.split(
      ' ',
    ),
  ),
  dockedStatusSet = new Set(['docked', 'charging', 'charging_completed', 'smart_charging']),
  statusRoleFields = [
    'self_wash_base_status',
    'auto_empty_status',
    'charging_status',
    'task_status',
    'state',
    'status',
  ],
  normalizeStatusKey = (rawStatus: any) => {
    const normalizedStatus = String(rawStatus ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
    return (statusAliases as any)[normalizedStatus] || normalizedStatus
  },
  isTruthyFlag = (rawFlagValue: any) =>
    rawFlagValue === true || rawFlagValue === 1 || ['true', 'on', '1'].includes(String(rawFlagValue).toLowerCase())
function vacuumStatusRole(entity: HaEntityEntry = {}) {
  if ((entity.domain || entity.entityId?.split('.')[0]) !== 'sensor') return ''
  const translationKey = entity.translationKey || entity.translation_key
  return translationKey
    ? statusRoleFields.includes(translationKey)
      ? translationKey
      : ''
    : statusRoleFields.find((roleCandidate) =>
        new RegExp('(?:^|_)' + roleCandidate + '(?:_\\d+)?$').test(entity.entityId?.split('.')[1] || ''),
      ) || ''
}
export function relatedVacuumStatusEntities(metadataByEntityId: any, vacuumEntityId: any) {
  const vacuumMetadata = metadataByEntityId?.get(vacuumEntityId)
  return vacuumMetadata?.deviceId
    ? [...metadataByEntityId.values()].filter(
        (sensorMetadata) =>
          sensorMetadata.deviceId === vacuumMetadata.deviceId &&
          entityMetadataIsAvailable(sensorMetadata) &&
          !sensorMetadata.disabled_by &&
          sensorMetadata.enabled !== false &&
          vacuumStatusRole(sensorMetadata),
      )
    : []
}
export function vacuumStatusBinding(binding: any, relatedMetadataByEntityId: any) {
  const relatedStatusEntities = relatedVacuumStatusEntities(relatedMetadataByEntityId, binding.entityId)
  return !relatedStatusEntities.length && !relatedMetadataByEntityId?.get(binding.entityId)?.deviceId
    ? binding
    : {
        ...binding,
        relatedEntityIds: [
          ...new Set([
            ...(binding.relatedEntityIds || []),
            ...relatedStatusEntities.map((relatedMetadata) => relatedMetadata.entityId),
          ]),
        ],
        statusEntityRoles: Object.fromEntries(
          relatedStatusEntities.map((relatedEntity) => [relatedEntity.entityId, vacuumStatusRole(relatedEntity)]),
        ),
      }
}
export function vacuumStatus(vacuumStateOrChange: any, relatedEntities: any[] = []) {
  const stateEntry = resolveStateEntry(vacuumStateOrChange),
    stateAttributes: HaEntityAttributes = stateEntry?.attributes || {},
    entityStatusKey = normalizeStatusKey(stateEntry?.state || 'unknown'),
    isAvailable = !['unknown', 'unavailable'].includes(entityStatusKey),
    statusByRole: Record<string, string> = {},
    conflictingRoleSet = new Set<string>()
  for (const relatedEntityEntry of relatedEntities) {
    const relatedRole =
        relatedEntityEntry.role === undefined ? vacuumStatusRole(relatedEntityEntry) : relatedEntityEntry.role,
      relatedStateEntry = resolveStateEntry(relatedEntityEntry.state),
      relatedStatusKey = normalizeStatusKey(relatedStateEntry?.state)
    !relatedRole ||
      !relatedStatusKey ||
      ['unknown', 'unavailable'].includes(relatedStatusKey) ||
      (['state', 'status', 'task_status'].includes(relatedRole) &&
        !(statusLabels as any)[relatedStatusKey] &&
        !/[\u3400-\u9fff]/.test(relatedStatusKey)) ||
      (statusByRole[relatedRole] && statusByRole[relatedRole] !== relatedStatusKey
        ? conflictingRoleSet.add(relatedRole)
        : (statusByRole[relatedRole] = relatedStatusKey))
  }
  for (const conflictingRole of conflictingRoleSet) delete statusByRole[conflictingRole]
  const normalizeKnownStatus = (candidateStatus: any) => {
      const knownStatus = normalizeStatusKey(candidateStatus)
      return !['unknown', 'unavailable'].includes(knownStatus) &&
        ((statusLabels as any)[knownStatus] || /[\u3400-\u9fff]/.test(knownStatus))
        ? knownStatus
        : ''
    },
    vacuumStateKey = normalizeKnownStatus(stateAttributes.vacuum_state) || statusByRole.state,
    resolvedStatusKey =
      vacuumStateKey || normalizeKnownStatus(stateAttributes.status) || statusByRole.status || statusByRole.task_status
  let statusKey = resolvedStatusKey || entityStatusKey
  const selfWashBaseStatus =
      statusByRole.self_wash_base_status || normalizeStatusKey(stateAttributes.self_wash_base_status),
    isTaskRunning =
      !!resolvedStatusKey &&
      (stationWorkingStatusSet.has(statusKey) ||
        statusKey === 'paused' ||
        statusKey.endsWith('_paused') ||
        (movingStatusSet.has(statusKey) && !['cleaning', 'returning'].includes(statusKey)) ||
        (vacuumStateKey &&
          [
            'idle',
            'stopped',
            'sleeping',
            'waiting_for_task',
            'charging_completed',
            'smart_charging',
            'upgrading',
          ].includes(statusKey))),
    isPauseApplicable = !isTaskRunning || entityStatusKey === 'paused',
    isReturningForWashBase = ['returning', 'returning_for_wash', 'returning_for_dry_mop'].includes(selfWashBaseStatus),
    isReturningToWash =
      statusKey === 'returning_to_wash' ||
      (!isTaskRunning && (isTruthyFlag(stateAttributes.returning_to_wash) || isReturningForWashBase)),
    isReturningToWashPaused = isPauseApplicable && isTruthyFlag(stateAttributes.returning_to_wash_paused),
    isWashingPaused =
      statusKey === 'washing_paused' ||
      (isPauseApplicable && (isTruthyFlag(stateAttributes.washing_paused) || selfWashBaseStatus === 'paused')),
    isPaused =
      entityStatusKey === 'paused' ||
      statusKey === 'paused' ||
      isWashingPaused ||
      statusKey.endsWith('_paused') ||
      (isPauseApplicable &&
        (isTruthyFlag(stateAttributes.paused) ||
          isReturningToWashPaused ||
          isTruthyFlag(stateAttributes.returning_paused)))
  isAvailable
    ? entityStatusKey === 'error' || statusKey === 'error' || isTruthyFlag(stateAttributes.has_error)
      ? (statusKey = 'error')
      : isReturningToWashPaused || (isPaused && isReturningToWash)
        ? (statusKey = 'returning_to_wash_paused')
        : isWashingPaused
          ? (statusKey = 'washing_paused')
          : isPaused
            ? (statusKey =
                statusKey.endsWith('_paused') && (statusLabels as any)[statusKey]
                  ? statusKey
                  : isTruthyFlag(stateAttributes.returning_paused)
                    ? 'returning_paused'
                    : 'paused')
            : !isTaskRunning && isReturningToWash
              ? (statusKey = 'returning_to_wash')
              : !isTaskRunning && isTruthyFlag(stateAttributes.draining)
                ? (statusKey = 'draining')
                : isTaskRunning ||
                  (isTruthyFlag(stateAttributes.washing) || selfWashBaseStatus === 'washing'
                    ? (statusKey = 'washing')
                    : isTruthyFlag(stateAttributes.drying) || selfWashBaseStatus === 'drying'
                      ? (statusKey = 'drying')
                      : stationWorkingStatusSet.has(selfWashBaseStatus)
                        ? (statusKey = selfWashBaseStatus)
                        : ['active', 'emptying', 'auto_emptying'].includes(
                              statusByRole.auto_empty_status || normalizeStatusKey(stateAttributes.auto_empty_status),
                            )
                          ? (statusKey = 'auto_emptying')
                          : isTruthyFlag(stateAttributes.mapping)
                            ? (statusKey = 'mapping')
                            : isTruthyFlag(stateAttributes.returning) &&
                                (!resolvedStatusKey || statusKey === 'returning')
                              ? (statusKey = 'returning')
                              : dockedStatusSet.has(entityStatusKey) &&
                                (!resolvedStatusKey || dockedStatusSet.has(statusKey)) &&
                                dockedStatusSet.has(statusByRole.charging_status) &&
                                (statusKey = statusByRole.charging_status))
    : (statusKey = entityStatusKey)
  const isPausedOrError =
      !isAvailable || statusKey === 'error' || statusKey === 'paused' || statusKey.endsWith('_paused'),
    isMoving = !isPausedOrError && movingStatusSet.has(statusKey),
    isStationWorking = !isPausedOrError && stationWorkingStatusSet.has(statusKey),
    isDocked =
      isAvailable &&
      !isMoving &&
      (dockedStatusSet.has(statusKey) ||
        isStationWorking ||
        ['washing_paused', 'drying_paused', 'dust_bag_drying_paused', 'changing_mop_paused'].includes(statusKey) ||
        dockedStatusSet.has(entityStatusKey) ||
        (!isPaused && (isTruthyFlag(stateAttributes.docked) || isTruthyFlag(stateAttributes.charging))))
  return {
    key: statusKey,
    status:
      (statusLabels as any)[statusKey] ||
      (/[\u3400-\u9fff]/.test(statusKey) ? String(resolvedStatusKey || stateEntry?.state).trim() : '状态更新中'),
    available: isAvailable,
    active: !isPausedOrError && (isMoving || isStationWorking),
    moving: isMoving,
    stationWorking: isStationWorking,
    docked: isDocked,
    paused: isAvailable && statusKey !== 'error' && (statusKey === 'paused' || statusKey.endsWith('_paused')),
    returning: isMoving && (statusKey.startsWith('returning') || statusKey === 'intelligent_recharging'),
  }
}
function parsePercent(rawPercent: any) {
  if (rawPercent == null || String(rawPercent).trim() === '') return null
  const parsedPercent = Number.parseFloat(String(rawPercent))
  return Number.isFinite(parsedPercent) ? Math.max(0, Math.min(100, parsedPercent)) : null
}
export function vacuumBatteryPercent(batterySourceState: any, batterySensor: any = null) {
  const batteryAttributes = resolveStateEntry(batterySourceState)?.attributes || {}
  for (const batteryAttribute of [
    batteryAttributes.battery_level,
    batteryAttributes.battery_percentage,
    batteryAttributes.battery,
  ]) {
    const batteryPercent = parsePercent(batteryAttribute)
    if (batteryPercent !== null) return batteryPercent
  }
  return parsePercent(resolveStateEntry(batterySensor)?.state)
}
export function relatedVacuumBatteryEntity(
  batteryMetadataByEntityId: any,
  statesByEntityId: any,
  batteryVacuumEntityId: any,
) {
  const batteryVacuumMetadata = batteryMetadataByEntityId.get(batteryVacuumEntityId)
  return (
    (batteryVacuumMetadata?.deviceId &&
      [...batteryMetadataByEntityId.values()]
        .filter(
          (candidateSensorMetadata) =>
            candidateSensorMetadata.deviceId === batteryVacuumMetadata.deviceId &&
            candidateSensorMetadata.domain === 'sensor' &&
            entityMetadataIsAvailable(candidateSensorMetadata),
        )
        .map((candidateEntityMetadata) => {
          const candidateStateEntry = resolveStateEntry(statesByEntityId.get(candidateEntityMetadata.entityId)),
            candidateAttributes = candidateStateEntry?.attributes || {},
            searchText = (
              (candidateEntityMetadata.entityId || '') +
              ' ' +
              (candidateEntityMetadata.name || '') +
              ' ' +
              (candidateEntityMetadata.originalName || '') +
              ' ' +
              (candidateEntityMetadata.translationKey || '') +
              ' ' +
              (candidateEntityMetadata.icon || '')
            ).toLowerCase(),
            deviceClass = String(candidateAttributes.device_class || '').toLowerCase(),
            measurementUnit = String(candidateAttributes.unit_of_measurement || '').trim()
          let batteryScore = 0
          return (
            deviceClass === 'battery' && (batteryScore += 240),
            String(candidateEntityMetadata.translationKey || '').toLowerCase() === 'battery' && (batteryScore += 210),
            /(?:^|[._\s-])battery(?:_level|_percentage)?(?:$|[._\s-])|电池电量|剩余电量|电量/.test(searchText) &&
              (batteryScore += 150),
            /mdi:battery/.test(searchText) && (batteryScore += 60),
            measurementUnit === '%' && (batteryScore += 25),
            /filter|brush|mop|consumable|life|尘袋|滤芯|主刷|边刷|拖布|耗材/.test(searchText) && (batteryScore -= 260),
            parsePercent(candidateStateEntry?.state) === null && (batteryScore -= 40),
            {
              item: candidateEntityMetadata,
              score: batteryScore,
            }
          )
        })
        .filter(({ score: candidateScore }) => candidateScore > 0)
        .sort(
          (leftCandidate, rightCandidate) =>
            rightCandidate.score - leftCandidate.score ||
            String(leftCandidate.item.entityId || '').length - String(rightCandidate.item.entityId || '').length ||
            String(leftCandidate.item.entityId || '').localeCompare(String(rightCandidate.item.entityId || '')),
        )[0]?.item) ||
    null
  )
}

const resolveFiniteNumber = (numericValue: any) =>
  typeof numericValue == 'number' && Number.isFinite(numericValue) ? numericValue : null
export function waterHeaterCapabilities(entityState: any) {
  const stateAttributes = entityState?.attributes || {},
    hasSupportedFeatures = Object.hasOwn(stateAttributes, 'supported_features'),
    isFeatureSupported = (featureFlag: any, isSupportedByDefault = false) =>
      hasSupportedFeatures
        ? Number.isInteger(stateAttributes.supported_features) &&
          stateAttributes.supported_features >= 0 &&
          !!(stateAttributes.supported_features & featureFlag)
        : isSupportedByDefault,
    operationModes = [
      ...new Set(
        (Array.isArray(stateAttributes.operation_list) ? stateAttributes.operation_list : []).filter(
          (modeName: any) => typeof modeName == 'string' && modeName.trim() && modeName !== '空',
        ),
      ),
    ],
    minimumTemperature = resolveFiniteNumber(stateAttributes.min_temp),
    maximumTemperature = resolveFiniteNumber(stateAttributes.max_temp),
    temperatureStep =
      stateAttributes.target_temp_step == null ? 0.5 : resolveFiniteNumber(stateAttributes.target_temp_step),
    isOperationSupported = isFeatureSupported(2, operationModes.length > 0),
    hasNativePower = isFeatureSupported(8),
    turnOnModes = operationModes.filter((candidateMode) => candidateMode !== 'off')
  return {
    available:
      !!entityState?.state &&
      entityState.available !== false &&
      !['unknown', 'unavailable'].includes(entityState.state),
    temperature: resolveFiniteNumber(stateAttributes.temperature),
    currentTemperature: resolveFiniteNumber(stateAttributes.current_temperature),
    minimum: minimumTemperature,
    maximum: maximumTemperature,
    step: temperatureStep,
    unit: ['°C', '°F', 'K'].includes(stateAttributes.temperature_unit)
      ? stateAttributes.temperature_unit
      : ['°C', '°F', 'K'].includes(stateAttributes.unit_of_measurement)
        ? stateAttributes.unit_of_measurement
        : '°',
    temperatureSupported:
      isFeatureSupported(1, resolveFiniteNumber(stateAttributes.temperature) !== null) &&
      minimumTemperature !== null &&
      maximumTemperature !== null &&
      minimumTemperature < maximumTemperature &&
      temperatureStep! > 0,
    operationSupported: isOperationSupported,
    modes: isOperationSupported ? operationModes : [],
    nativePower: hasNativePower,
    canTurnOff: hasNativePower || (isOperationSupported && operationModes.includes('off')),
    canTurnOn: hasNativePower || (isOperationSupported && turnOnModes.length > 0),
    awaySupported: isFeatureSupported(4),
    away: stateAttributes.away_mode === true || stateAttributes.away_mode === 'on',
  }
}
export function waterHeaterPowerCommand(powerEntityState: any, shouldTurnOn: any, requestedMode = '') {
  const heaterCapabilities = waterHeaterCapabilities(powerEntityState)
  if (!heaterCapabilities.available) throw new Error('热水器当前不可用。')
  if (heaterCapabilities.nativePower)
    return {
      domain: 'water_heater',
      service: shouldTurnOn ? 'turn_on' : 'turn_off',
      data: {} as Record<string, any>,
    }
  const selectableModes = heaterCapabilities.modes.filter((selectableMode) => selectableMode !== 'off'),
    selectedOperationMode = shouldTurnOn
      ? selectableModes.includes(requestedMode)
        ? requestedMode
        : selectableModes.length === 1
          ? selectableModes[0]
          : ''
      : heaterCapabilities.modes.includes('off')
        ? 'off'
        : ''
  if (!selectedOperationMode)
    throw new Error(
      shouldTurnOn && selectableModes.length > 1 ? '请选择要开启的运行模式。' : '热水器未提供此开关能力。',
    )
  return {
    domain: 'water_heater',
    service: 'set_operation_mode',
    data: {
      operation_mode: selectedOperationMode,
    },
  }
}
function waterHeaterCommandConfirmed(confirmedCommand: any, checkedEntityState: any) {
  const entityCapabilities = waterHeaterCapabilities(checkedEntityState)
  if (!entityCapabilities.available) return false
  const currentOperationMode = checkedEntityState.attributes?.operation_mode || checkedEntityState.state
  switch (confirmedCommand.service) {
    case 'turn_on':
      return checkedEntityState.state !== 'off'
    case 'turn_off':
      return checkedEntityState.state === 'off'
    case 'set_operation_mode':
      return currentOperationMode === confirmedCommand.data.operation_mode
    case 'set_away_mode':
      return (
        (checkedEntityState.attributes?.away_mode === 'on' || checkedEntityState.attributes?.away_mode === true) ===
          confirmedCommand.data.away_mode && checkedEntityState.attributes?.away_mode != null
      )
    case 'set_temperature':
      return (
        entityCapabilities.temperature !== null &&
        Math.abs(entityCapabilities.temperature - confirmedCommand.data.temperature) <=
          Math.max(0.001, (entityCapabilities.step || 0.5) / 100)
      )
    default:
      return false
  }
}
export function createWaterHeaterFeedback({
  onChange: onStatusChange = () => {},
  timeout: responseTimeoutMs = 10000,
  schedule: scheduleTimeout = setTimeout,
  cancel: cancelTimeout = clearTimeout,
}: {
  onChange?: (message: string) => void
  timeout?: number
  schedule?: (callback: () => void, delayMs: number) => number
  cancel?: (timerId: number) => void
} = {}) {
  const pendingCommandsByMode = new Map()
  let isDisposed = false
  const resolveCommandKey = (serviceCommand: any) =>
      ['turn_on', 'turn_off', 'set_operation_mode'].includes(serviceCommand.service) ? 'mode' : serviceCommand.service,
    emitFeedback = (feedbackMessage: any) => {
      isDisposed || onStatusChange(feedbackMessage)
    },
    clearPendingCommand = (commandRecord: any) => {
      cancelTimeout(commandRecord.timer),
        pendingCommandsByMode.get(commandRecord.key) === commandRecord &&
          pendingCommandsByMode.delete(commandRecord.key)
    }
  return {
    begin(requestedCommand: any) {
      const commandKey = resolveCommandKey(requestedCommand)
      pendingCommandsByMode.has(commandKey) && clearPendingCommand(pendingCommandsByMode.get(commandKey))
      const pendingCommandRecord = {
        key: commandKey,
        command: requestedCommand,
      }
      return (pendingCommandsByMode.set(commandKey, pendingCommandRecord), emitFeedback(''), pendingCommandRecord)
    },
    sent(sentCommandRecord: any) {
      isDisposed ||
        pendingCommandsByMode.get(sentCommandRecord.key) !== sentCommandRecord ||
        (emitFeedback(''),
        (sentCommandRecord.timer = scheduleTimeout(() => {
          isDisposed ||
            pendingCommandsByMode.get(sentCommandRecord.key) !== sentCommandRecord ||
            (clearPendingCommand(sentCommandRecord), emitFeedback('设备未响应，请重试'))
        }, responseTimeoutMs)),
        sentCommandRecord.timer?.unref?.())
    },
    fail(failedCommandRecord: any, failureMessage: any) {
      isDisposed ||
        pendingCommandsByMode.get(failedCommandRecord.key) !== failedCommandRecord ||
        (clearPendingCommand(failedCommandRecord), emitFeedback(failureMessage || '设备控制失败，请重试'))
    },
    sync(syncEntityState: any) {
      if (isDisposed || !pendingCommandsByMode.size) return
      if (!waterHeaterCapabilities(syncEntityState).available) {
        for (const offlineCommandRecord of pendingCommandsByMode.values()) cancelTimeout(offlineCommandRecord.timer)
        pendingCommandsByMode.clear(), emitFeedback('设备已离线，操作结果未确认')
        return
      }
      let hasConfirmedCommand = false
      for (const syncCommandRecord of [...pendingCommandsByMode.values()])
        waterHeaterCommandConfirmed(syncCommandRecord.command, syncEntityState) &&
          (clearPendingCommand(syncCommandRecord), (hasConfirmedCommand = true))
      hasConfirmedCommand && emitFeedback('')
    },
    dispose() {
      isDisposed = true
      for (const disposeCommandRecord of pendingCommandsByMode.values()) cancelTimeout(disposeCommandRecord.timer)
      pendingCommandsByMode.clear()
    },
  }
}
