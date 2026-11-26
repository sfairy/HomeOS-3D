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

import { climateRenderTypeFromKind } from '@homeos/shared/entity/device-kind'
import {
  BATH_HEATER_MODE_LABELS,
  CLIMATE_MODE_LABELS,
  HORIZONTAL_POSITION_LABELS,
  HORIZONTAL_SWING_LABELS,
  VERTICAL_SWING_LABELS,
  WATER_HEATER_MODE_LABELS,
} from '@/kernel/constants/climate-labels'
import { deviceProfileKind } from '@/domain/device/device-profile-kind-cache'
// 开关态 / 运行态判据与 Vue 侧、舞台侧共用同一份实现（`shared/device/climate-power`）：
// 这三条是最容易分叉、又最难测的逻辑（浴霸 off 态仍可能换气、热水器 0.4 度容差、
// unknown 不算开机）。此处 re-export 保持既有 `@app/shared/device/climate` 导入不变。
import {
  bathHeaterModeUsesAirflow,
  climateIsPoweredOn,
  climateIsRunning,
  climatePresentationMode,
  normalizeClimateModeKey,
} from '@/domain/entity/model/climate-power'

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
