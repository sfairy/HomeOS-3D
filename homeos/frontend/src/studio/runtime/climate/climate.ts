import {
  climateState as climateState2,
  climateControl as climateControl2,
  climatePowerControl as climatePowerControl2,
  climateDialogTitle as climateDialogTitle2,
  climateModeLabel as climateModeLabel2,
  climateSwingModeLabel as climateSwingModeLabel2,
  createClimateModeHistory as createClimateModeHistory2,
  createWaterHeaterFeedback as createWaterHeaterFeedback2,
  exhaustFanState as exhaustFanState2,
  exhaustSwitchState as exhaustSwitchState2,
  waterHeaterCapabilityStatusLabel as waterHeaterStatusLabel2,
  createPurifierExtras as createPurifierExtras2,
} from './climate'
import { bathHeaterState as bathHeaterState2 } from '../bath-heater/bath-heater'
import { purifierState as purifierState2 } from '../purifier/purifier-state'
import { fanSpeedColumns, resolveFanBindingState } from '../fan/fan'
import { domElement } from '@app/shared/util/dom-factory'
import { syncHtmlRangeProgress } from '@app/shared/util/range-progress'
import { createRangeFeedback as createRangeFeedback2 } from '@app/shared/util/control-timeout'
import { createPopupPickers } from '@app/shared/util/select-picker'
import { createPopupFeedback } from '@app/shared/util/popup-feedback'
import { createStageDeviceVisual, resolveClimateVisualKind } from '../core/stage-device-visual'
import {
  haNumber,
  attributesOf,
  featureFlags,
  stringOptions,
  fanCapabilities,
  deviceStatusChoices,
  brightnessModes,
} from '../device/device'
import * as climateRendererModule from '@app/shared/device'
import * as waterHeaterRendererModule from '@app/shared/device'
import { formatEntityNumber } from '@app/shared/util/ha-number'
import { createNativeExtraPanel, nativeExtraKind, nativeExtraMinimumWidth } from '../panels/panels'

/**
 * 取暖壁挂炉的**用户文案**（0.8.9 `climate-panel.js` + `config-editor.js` 采暖段）。
 *
 * 为什么单独一份：壁挂炉在数据上是 `climate` 主实体，但它和空调的差别全在文案与
 * 两个开关（`underfloorHeating` / `heatingPanelStyle`）上；把这些散进空调面板的分支里，
 * 后面再加一种采暖设备时又会复制一遍。
 */

export const BOILER_COPY = Object.freeze({
  /** 设备类型名（目录卡片 / 图例 / 面板标题）。 */
  label: '取暖壁挂炉',
  /** 面板 aria 标签（与「空调/浴霸」同构）。 */
  panelLabel: '取暖壁挂炉控制',
  /** 制热态。 */
  heating: '正在制热',

  /** 配置段。 */
  pickPrimaryEntity: '选择采暖主实体',
  primaryEntityHint: '采暖主实体控制本层地暖。盘管按室内地面自动排列，庭院和楼板洞口留空。',
  underfloorToggle: '制热时显示本层地暖盘管',
  heatingPanelStyleThermostat: '温控卡',
  heatingPanelStyleClimate: '空调卡',

  /** 浴霸联动的前置条件（与壁挂炉同属「本层采暖设备」提示）。 */
  needBathHeaterModel: '请先在本层添加浴霸模型',
  bathHeaterMountHint: '浴霸顶部安装面距本层地面的高度，灯面和出风格栅朝下。',
})

/**
 * 是否是采暖壁挂炉。
 *
 * 两条判据都要认：`climateType` 是配置里的显式声明，而旧数据里壁挂炉只被分到
 * `boiler` kind（没有 `climateType`），只看一个会漏掉一半设备。
 */
export function isHeatingBoiler(item: { climateType?: string; climateKind?: string; type?: string } | null): boolean {
  if (!item) return false
  return item.climateType === 'heating-boiler' || item.climateKind === 'boiler' || item.type === 'heating-boiler'
}

/**
 * 壁挂炉是否在制热。
 *
 * 判据顺序：`hvac_action`（HA 给的实时动作）→ `hvac_mode` → `state`。
 * 只看 `state === 'heat'` 会漏掉「mode=heat 但 action=idle（已到温）」这种正常停机。
 */
export function isBoilerHeating(
  deviceState: {
    hvacAction?: string
    action?: string
    mode?: string
    state?: string
  } | null,
): boolean {
  const action = String(deviceState?.hvacAction ?? deviceState?.action ?? '').toLowerCase()
  if (action) return action === 'heating' || action === 'heat'
  const mode = String(deviceState?.mode ?? deviceState?.state ?? '').toLowerCase()
  return mode === 'heat' || mode === 'heating'
}

/** 面板标题：壁挂炉用专属 aria，其余沿用调用方给的名字。 */
export function boilerPanelLabel(item: Parameters<typeof isHeatingBoiler>[0], fallback: string): string {
  return isHeatingBoiler(item) ? BOILER_COPY.panelLabel : fallback
}

/**
 * 壁挂炉的面板形态（0.8.9 `item.heatingPanelStyle`）。
 *
 * 判据就是上游那一行：`heatingPanelStyle === 'climate' ? 'climate' : 'thermostat'`。
 * 也就是说**只有显式空调卡才是空调卡**，缺省、脏值、旧枚举（`air-conditioner`）都按
 * 温控卡处理 —— 宁可少显示几个按钮，也不要给壁挂炉露出空调专属的风速/摆风。
 */
export function heatingPanelStyleOf(
  item: { heatingPanelStyle?: unknown } | null | undefined,
): 'climate' | 'thermostat' {
  return item?.heatingPanelStyle === 'climate' ? 'climate' : 'thermostat'
}

/** 温控卡形态：壁挂炉要隐藏「风速 / 摆风 / 左右摆风」三组。 */
export function isThermostatBoilerPanel(item: Parameters<typeof isHeatingBoiler>[0]): boolean {
  return isHeatingBoiler(item) && heatingPanelStyleOf(item as { heatingPanelStyle?: unknown } | null) === 'thermostat'
}

/** 温控卡形态下不显示的选项组：风速与摆风是空调专属，壁挂炉露出来只会误操作。 */
const THERMOSTAT_HIDDEN_FIELDS: ReadonlyArray<string> = ['fanMode', 'swingMode', 'horizontalSwingMode']

/**
 * 把面板形态落到 DOM 属性上（0.8.9 `dataset.heatingPanelStyle`）。
 *
 * 单独成函数有两个原因：`render` 的圈复杂度贴着棘轮上限（只能加一次调用），
 * 以及"非壁挂炉必须清掉属性"这条容易忘 —— 面板 DOM 会在不同设备间复用。
 */
function syncHeatingPanelStyle(
  rootElement: HTMLElement,
  item: Parameters<typeof isHeatingBoiler>[0] & { heatingPanelStyle?: unknown },
): void {
  const style = isHeatingBoiler(item) ? heatingPanelStyleOf(item) : ''
  if (style) rootElement.dataset.heatingPanelStyle = style
  else delete rootElement.dataset.heatingPanelStyle
}
const formatSwingModeLabel = (swingModeKey: any, swingDirection: any = undefined) =>
    (
      ({
        on: '开启',
        off: '关闭',
        middle: '居中',
      }) as Record<string, string>
    )[swingModeKey] || climateSwingModeLabel2(swingModeKey, swingDirection),
  fanModeLabels = {
    auto: '自动',
    low: '低风',
    medium: '中风',
    high: '高风',
    middle: '中风',
    quiet: '静音',
    silent: '静音',
    turbo: '强劲',
    diffuse: '柔风',
    focus: '集中',
  },
  purifierPresetLabels = {
    auto: '自动',
    silent: '静音',
    quiet: '静音',
    low: '低',
    medium: '中',
    middle: '中',
    high: '高',
    turbo: '强劲',
    sleep: '睡眠',
    favorite: '最爱',
    favorite_level: '最爱',
    strong: '强劲',
    normal: '标准',
    natural: '自然风',
  }
/** 面板的宿主元素与回调； */
type ClimatePanelOptions = {
  element?: any
  onControl?: (...args: any[]) => any
  onLayout?: (...args: any[]) => any
  modeHistory?: any
  /** 宿主已经装好的反馈聚合区（`createPopupFeedback` 实例）；缺省时面板自建。 */
  feedbackSlot?: any
}
/** 面板视图模型由 stage 的 update() 注入：字段是运行时状态袋，按实际访问到的键显式列出并全部可选。 */
type ClimatePanelViewModel = {
  item?: any
  states?: any
  editing?: any
  busy?: any
  state?: any
  error?: any
  /** 实体 → HA 显示精度（`number-formats` 通道）。 */
  numberFormats?: Record<string, number>
}
type ClimateStateBranch = ReturnType<typeof climateState2>
/** 三分支键的并集。 */
type ClimateStateKeys<Branch> = Branch extends unknown ? keyof Branch : never
/** 某个键在各分支中出现的类型的并集。 */
type ClimateStateValue<Key extends PropertyKey, Branch> = Branch extends unknown
  ? Key extends keyof Branch
    ? Branch[Key]
    : never
  : never
/** climateState() 按实体类型返回三个分支（热水器/净化器/空调），每个分支只带本分支的能力字段； */
type ClimateDeviceState = {
  [Key in ClimateStateKeys<ClimateStateBranch>]?: ClimateStateValue<Key, ClimateStateBranch>
}
export function createClimatePanel({
  element: hostElement,
  feedbackSlot: hostFeedbackSlot,
  onControl: onControl = async () => {},
  onLayout: onLayout = () => {},
  modeHistory: modeHistory = createClimateModeHistory2(),
}: ClimatePanelOptions = {}) {
  const document = hostElement?.ownerDocument || globalThis.document,
    createElement = (tagName: any, className: any, textContent = '') =>
      domElement(document, tagName, className, textContent),
    replaceChildren = (containerElement: any, ...children: any[]) => {
      if (typeof containerElement.replaceChildren == 'function') containerElement.replaceChildren(...children)
      else {
        for (const childNode of [...(containerElement.children || [])]) childNode.remove?.()
        containerElement.append(...children)
      }
    },
    rootElement = hostElement || createElement('section', '')
  rootElement.classList.add('i3d-climate-panel')
  const je2 = createPopupPickers(rootElement, createElement),
    headingElement = createElement('div', 'i3d-climate-heading i3d-popup-heading'),
    titleElement = createElement('h3', '', '空调'),
    statusElement = createElement('p', '', '尚未绑定设备'),
    powerButton = createElement('button', 'i3d-climate-power is-visual-replaced')
  powerButton.type = 'button'
  const headingTextElement = createElement('div', 'i3d-climate-heading-text i3d-popup-heading-text')
  const deviceVisual = createStageDeviceVisual({
    kind: 'climate',
    document,
    onActivate: () => togglePower(),
  })
  headingTextElement.append(titleElement, statusElement),
    headingElement.append(headingTextElement, powerButton, deviceVisual.root)
  const thermostatSlotElement = createElement('div', 'i3d-climate-thermostat-slot'),
    thermostatElement = createElement('section', 'hb-climate-thermostat'),
    decreaseButton = createElement('button', 'hb-climate-temperature-step', '−'),
    increaseButton = createElement('button', 'hb-climate-temperature-step', '+')
  ;(decreaseButton.type = increaseButton.type = 'button'),
    decreaseButton.setAttribute('aria-label', '降低设定温度'),
    increaseButton.setAttribute('aria-label', '提高设定温度')
  const temperatureContentElement = createElement('div', 'i3d-climate-temperature-content'),
    targetOutputElement = createElement('output', 'i3d-climate-target'),
    currentTemperatureElement = createElement('span', '', '当前温度 --')
  targetOutputElement.setAttribute('aria-label', '设定温度'),
    temperatureContentElement.append(
      createElement('small', '', '设定温度'),
      targetOutputElement,
      currentTemperatureElement,
    ),
    thermostatElement.append(decreaseButton, temperatureContentElement, increaseButton),
    thermostatSlotElement.append(thermostatElement)
  const awayModeButton = createElement('button', 'i3d-climate-choice')
  ;(awayModeButton.type = 'button'),
    awayModeButton.setAttribute('aria-label', '离家模式'),
    awayModeButton.addEventListener('click', () => requestControl('set_away_mode', !deviceState.away))
  const feedbackElement = createElement('p', 'i3d-climate-feedback')
  feedbackElement.setAttribute('role', 'status'), (feedbackElement.hidden = true)
  const createFeedback = () =>
    createWaterHeaterFeedback2({
      onChange(feedbackText) {
        ;(feedbackElement.textContent = feedbackText), (feedbackElement.hidden = !feedbackText)
      },
    })
  let feedbackTracker = createFeedback()
  /** 风速滑条：拖动时本地预览，松手提交，10 秒没回显提示「设备未响应」。 */
  const speedFeedback = createRangeFeedback2({
    onChange: () => render(),
    onTimeout: () => {
      errorText = '设备未响应，请重试。'
    },
  })
  const temperatureIntervalElement = createElement('p', 'i3d-climate-temperature-interval'),
    mainGroupsElement = createElement('div', 'i3d-climate-groups i3d-climate-main-groups'),
    emptyStateElement = createElement('p', 'i3d-climate-empty'),
    errorElement = createElement('p', 'i3d-climate-error'),
    fanSpeedGroupElement = createElement('section', 'i3d-climate-option-group'),
    fanSpeedLabelElement = createElement('span', '', '风速'),
    fanSpeedRangeElement = createElement('input', 'hos-range-ui')
  ;(fanSpeedRangeElement.type = 'range'),
    (fanSpeedRangeElement.min = '0'),
    (fanSpeedRangeElement.max = '100'),
    fanSpeedRangeElement.setAttribute('aria-label', '净化器风速'),
    fanSpeedRangeElement.addEventListener('input', () => {
      speedFeedback.preview('speed', Number(fanSpeedRangeElement.value)),
        syncHtmlRangeProgress(fanSpeedRangeElement),
        (fanSpeedLabelElement.textContent = '风速 ' + fanSpeedRangeElement.value + '%')
    }),
    fanSpeedRangeElement.addEventListener('change', () => {
      const requestedPercentage = Number(fanSpeedRangeElement.value)
      speedFeedback.commit('speed', requestedPercentage), requestControl('set_percentage', requestedPercentage)
    })
  const speedLevelsElement = createElement('div', 'i3d-climate-choices i3d-climate-speed-levels')
  speedLevelsElement.setAttribute('role', 'group'),
    speedLevelsElement.setAttribute('aria-label', '净化器风速档位'),
    fanSpeedGroupElement.append(fanSpeedLabelElement, fanSpeedRangeElement, speedLevelsElement)
  let lastSpeedSignature = '',
    list: any = []
  emptyStateElement.setAttribute('role', 'status'), errorElement.setAttribute('role', 'status')
  const temperatureRangeElement = createElement('section', 'i3d-climate-range'),
    rangeRows: any = []
  for (const [rangeField, rangeLabel] of [
    ['target_temp_low', '温区下限'],
    ['target_temp_high', '温区上限'],
  ]) {
    const rangeRowElement = createElement('div', 'hb-climate-thermostat'),
      rangeDecreaseButton = createElement('button', 'hb-climate-temperature-step', '−'),
      rangeIncreaseButton = createElement('button', 'hb-climate-temperature-step', '+')
    ;(rangeDecreaseButton.type = rangeIncreaseButton.type = 'button'),
      rangeDecreaseButton.setAttribute('aria-label', '降低' + rangeLabel),
      rangeIncreaseButton.setAttribute('aria-label', '提高' + rangeLabel)
    const rangeContentElement = createElement('div', 'i3d-climate-temperature-content'),
      rangeOutputElement = createElement('output', 'i3d-climate-range-value')
    rangeOutputElement.setAttribute('aria-label', rangeLabel),
      rangeContentElement.append(createElement('small', '', rangeLabel), rangeOutputElement),
      rangeRowElement.append(rangeDecreaseButton, rangeContentElement, rangeIncreaseButton),
      temperatureRangeElement.append(rangeRowElement),
      rangeDecreaseButton.addEventListener('click', () => stepRangeValue(rangeField, -1)),
      rangeIncreaseButton.addEventListener('click', () => stepRangeValue(rangeField, 1)),
      rangeRows.push({
        field: rangeField,
        output: rangeOutputElement,
        decrease: rangeDecreaseButton,
        increase: rangeIncreaseButton,
      })
  }
  const popupBodyElement = createElement('div', 'i3d-popup-body')
  popupBodyElement.append(
    awayModeButton,
    feedbackElement,
    thermostatSlotElement,
    temperatureRangeElement,
    temperatureIntervalElement,
    fanSpeedGroupElement,
    mainGroupsElement,
    emptyStateElement,
    errorElement,
  ),
    replaceChildren(rootElement, headingElement, popupBodyElement)
  const extrasGridElement = createElement('div', 'i3d-climate-groups i3d-extra-grid')
  popupBodyElement.append(extrasGridElement)
  // 宿主没有提供反馈聚合区时自建一个（0.7.8 四个原生面板各自兜底）。
  const ownFeedbackSlot = hostFeedbackSlot ? null : createPopupFeedback({ element: rootElement }),
    feedbackSlot = hostFeedbackSlot || ownFeedbackSlot
  const purifierExtrasController = createPurifierExtras2({
    element: extrasGridElement,
    feedbackSlot,
    onControl: (extraControl: any) =>
      onControl(
        viewModel.item?.climateType === 'bath-heater'
          ? {
              ...extraControl,
              deviceKind: 'climate-extra',
            }
          : viewModel.item?.pedestalFan
            ? {
                ...extraControl,
                deviceKind: 'fan-extra',
              }
            : deviceState.waterHeater
              ? {
                  ...extraControl,
                  deviceKind: 'water-heater-extra',
                }
              : !viewModel.item?.airPurifier && !deviceState.purifier
                ? {
                    ...extraControl,
                    deviceKind: 'climate-extra',
                  }
                : extraControl,
        viewModel.item,
      ),
    onLayout: onLayout,
  })
  let viewModel: ClimatePanelViewModel = {},
    deviceState: ClimateDeviceState = climateState2('', null),
    isDisposed = false,
    isSending = false,
    errorText = '',
    instanceId = 0,
    pendingRangeValues: any = null,
    draftTemperature: any = null,
    draftPowerOn: boolean | null = null,
    draftMode: string | null = null,
    draftPresetMode: string | null = null,
    temperatureTimeoutId: any = null,
    renderedGroupsSignature = '',
    choiceButtons: any = [],
    pendingControlPromise = Promise.resolve(),
    pendingControlCount = 0
  // 错误与进度提示都挂到聚合区：同源重复只留一条，并把 HA 原始报错译成人话。
  const feedbackSource = () => viewModel.item?.entityId || '',
    feedbackLabel = () => titleElement.textContent || '',
    releaseErrorFeedback = feedbackSlot.attach(errorElement, {
      source: feedbackSource,
      label: feedbackLabel,
    }),
    releaseStatusFeedback = feedbackSlot.attach(feedbackElement, {
      source: feedbackSource,
      label: feedbackLabel,
    })
  const canControl = () => !isDisposed && !viewModel.editing && !viewModel.busy && deviceState.available,
    clearTemperatureDraft = () => {
      ;(draftTemperature = null), (pendingRangeValues = null)
    },
    clearModeDraft = () => {
      ;(draftPowerOn = null), (draftMode = null), (draftPresetMode = null)
    },
    clearPendingState = () => {
      temperatureTimeoutId !== null && clearTimeout(temperatureTimeoutId),
        (temperatureTimeoutId = null),
        clearTemperatureDraft(),
        clearModeDraft()
    },
    armPendingTimeout = () => {
      temperatureTimeoutId !== null && clearTimeout(temperatureTimeoutId)
      temperatureTimeoutId = setTimeout(() => {
        ;(temperatureTimeoutId = null), clearTemperatureDraft(), clearModeDraft(), isDisposed || render()
      }, 8000)
    },
    resolvePresetLabel = (presetValue: any) => {
      const key = String(presetValue || '').trim()
      if (!key) return ''
      return (purifierPresetLabels as any)[key.toLowerCase()] || key
    },
    resolveDisplayPowerOn = () => {
      if (draftPowerOn !== null) return !!draftPowerOn
      if (viewModel?.item?.airPurifier) return !!purifierState2(viewModel.item, viewModel.states || {}).on
      if (viewModel?.item?.pedestalFan) {
        const fanSnap = resolveFanBindingState(viewModel.item, {
          ...(viewModel.states || {}),
          ...(deviceState.entityId && deviceState.raw ? { [deviceState.entityId]: deviceState.raw } : {}),
        })
        return !!fanSnap?.on
      }
      return !!deviceState.on
    },
    resolveClimateVisualMode = (modeValue: any, isPoweredOn: any) =>
      !isPoweredOn || modeValue === 'off'
        ? 'off'
        : modeValue === 'cool'
          ? 'cool'
          : modeValue === 'heat'
            ? 'heat'
            : modeValue === 'fan' || modeValue === 'fan_only'
              ? 'fan'
              : 'other',
    resolveClimateAccent = (visualModeValue: any) =>
      visualModeValue === 'cool'
        ? '#73c8ff'
        : visualModeValue === 'heat'
          ? '#ff8a65'
          : visualModeValue === 'off'
            ? '#65717a'
            : '#c9a26d'
  function resolveTemperature() {
    return draftTemperature ?? deviceState.temperature
  }
  function applyOptimisticCommand(command: any) {
    if (!command?.service) return
    if (command.service === 'set_temperature') {
      'temperature' in (command.data || {})
        ? (draftTemperature = command.data.temperature)
        : (pendingRangeValues = {
            ...command.data,
          })
      armPendingTimeout()
      return
    }
    if (command.service === 'set_hvac_mode' || command.service === 'set_operation_mode') {
      const nextMode = String(command.data?.hvac_mode || command.data?.operation_mode || '').trim()
      if (nextMode) {
        ;(draftMode = nextMode), (draftPowerOn = nextMode !== 'off'), armPendingTimeout()
      }
      return
    }
    if (command.service === 'set_preset_mode') {
      const nextPreset = String(command.data?.preset_mode || '').trim()
      if (nextPreset) {
        // 净化器/新风：选运行模式即表示要开机
        ;(draftPresetMode = nextPreset), (draftPowerOn = true), armPendingTimeout()
      }
      return
    }
    if (command.service === 'set_percentage') {
      ;(draftPresetMode = null), (draftPowerOn = true), armPendingTimeout()
      return
    }
    if (command.service === 'turn_off') {
      ;(draftPowerOn = false), (draftMode = 'off'), armPendingTimeout()
      return
    }
    if (command.service === 'turn_on') {
      const restoreMode =
        (deviceState.entityId && modeHistory.get(deviceState.entityId)) ||
        (deviceState.mode && deviceState.mode !== 'off' ? deviceState.mode : '') ||
        'cool'
      ;(draftPowerOn = true), (draftMode = restoreMode), armPendingTimeout()
    }
  }
  function syncTemperature(temperature = resolveTemperature()) {
    ;(targetOutputElement.value = temperature === null ? '' : String(temperature)),
      (targetOutputElement.textContent =
        temperature === null ? '--' : '' + temperature + (deviceState.temperatureUnit || '°')),
      (currentTemperatureElement.textContent =
        deviceState.currentTemperature === null
          ? '当前温度 --'
          : '当前温度 ' + deviceState.currentTemperature + (deviceState.temperatureUnit || '°')),
      (decreaseButton.disabled = !canControl() || (temperature !== null && temperature <= deviceState.minimum!)),
      (increaseButton.disabled = !canControl() || (temperature !== null && temperature >= deviceState.maximum!))
  }
  function resolveRangeValues() {
    return (
      pendingRangeValues || {
        target_temp_low: deviceState.targetLow,
        target_temp_high: deviceState.targetHigh,
      }
    )
  }
  function stepRangeValue(rangeFieldKey: any, delta: any) {
    if (!canControl()) return
    const baseRangeValues = resolveRangeValues(),
      nextRangeValues = {
        target_temp_low: baseRangeValues.target_temp_low ?? deviceState.minimum,
        target_temp_high: baseRangeValues.target_temp_high ?? deviceState.maximum,
      }
    ;((nextRangeValues as any)[rangeFieldKey] +=
      baseRangeValues[rangeFieldKey] === null ? 0 : delta * deviceState.step!),
      ((nextRangeValues as any)[rangeFieldKey] =
        rangeFieldKey === 'target_temp_low'
          ? Math.min((nextRangeValues as any)[rangeFieldKey], nextRangeValues.target_temp_high)
          : Math.max((nextRangeValues as any)[rangeFieldKey], nextRangeValues.target_temp_low)),
      requestControl('set_temperature', nextRangeValues)
  }
  async function sendControl(command: any) {
    if (!canControl()) return
    const instanceAtSend = instanceId,
      previousControlPromise = pendingControlCount ? pendingControlPromise : null
    let resolvePendingControl
    ;(pendingControlPromise = new Promise((resolvePromise) => {
      resolvePendingControl = resolvePromise
    })),
      pendingControlCount++,
      (isSending = true),
      (errorText = ''),
      applyOptimisticCommand(command),
      render()
    let feedbackSession: any = null
    try {
      if (
        (previousControlPromise && (await previousControlPromise),
        isDisposed || instanceAtSend !== instanceId || !canControl())
      )
        return
      deviceState.waterHeater && (feedbackSession = feedbackTracker.begin(command)),
        await onControl(
          viewModel.item?.pedestalFan
            ? {
                ...command,
                deviceKind: 'fan',
              }
            : command,
          viewModel.item,
        ),
        feedbackSession && (feedbackTracker.sent(feedbackSession), feedbackTracker.sync(deviceState.raw))
    } catch (controlError: any) {
      feedbackSession && feedbackTracker.fail(feedbackSession, controlError?.message),
        !isDisposed &&
          instanceAtSend === instanceId &&
          ((errorText = controlError?.message || '设备控制失败，请重试。'),
          pendingControlCount === 1 && clearPendingState())
    } finally {
      resolvePendingControl!(),
        !isDisposed &&
          instanceAtSend === instanceId &&
          (pendingControlCount--, (isSending = pendingControlCount > 0), render())
    }
  }
  function requestControl(requestedService: any, controlValue: any) {
    if (canControl())
      try {
        return sendControl(climateControl2(deviceState, requestedService, controlValue))
      } catch (controlBuildError: any) {
        ;(errorText = controlBuildError.message), render()
      }
  }
  function togglePower({ toggle: shouldToggle = true } = {}) {
    // 与角标/状态同一套电源判定（含新风 airflow 实体），避免连点发重复指令
    const currentOn = resolveDisplayPowerOn()
    if (!canControl() || (!shouldToggle && currentOn)) return Promise.resolve(false)
    try {
      return sendControl(
        climatePowerControl2(deviceState, shouldToggle ? !currentOn : true, modeHistory.get(deviceState.entityId)),
      )
    } catch (powerError: any) {
      return ((errorText = powerError.message), render(), Promise.resolve(false))
    }
  }
  function requestPresetOrMode(serviceName: any, optionValue: any) {
    const needStart = deviceState.purifier && serviceName === 'set_preset_mode' && !resolveDisplayPowerOn()
    const queued = requestControl(serviceName, optionValue)
    // 停机时点运行模式：再补发开机（不能走 togglePower，草稿已把电源标成 on）
    if (needStart && canControl())
      try {
        void sendControl(climatePowerControl2(deviceState, true, modeHistory.get(deviceState.entityId)))
      } catch (powerError: any) {
        ;(errorText = powerError.message), render()
      }
    return queued
  }
  powerButton.addEventListener('click', () => togglePower()),
    decreaseButton.addEventListener('click', () =>
      requestControl(
        'set_temperature',
        resolveTemperature() === null ? deviceState.minimum : resolveTemperature() - deviceState.step!,
      ),
    ),
    increaseButton.addEventListener('click', () =>
      requestControl(
        'set_temperature',
        resolveTemperature() === null ? deviceState.minimum : resolveTemperature() + deviceState.step,
      ),
    )
  function buildChoiceGroups() {
    je2.close(), replaceChildren(mainGroupsElement), (choiceButtons = [])
    // 0.8.9 温控卡形态：壁挂炉只保留「运行模式 / 预设 / 方向」，风速与摆风交给空调卡。
    // 判据与上游一致 —— 只有显式 `climate` 才是空调卡，其余（含未设置）都按温控卡。
    // 注意这里在 `render()` 之外，不能用 `activeItem`，只能直接读 `viewModel.item`。
    const boilerItem = viewModel.item || null
    const thermostatOnly = isHeatingBoiler(boilerItem) && heatingPanelStyleOf(boilerItem) === 'thermostat'
    const primaryGroupsElement = createElement('div', 'i3d-climate-primary-groups')
    ;(primaryGroupsElement.hidden = true), mainGroupsElement.append(primaryGroupsElement)
    for (const [groupLabel, optionValues, field, service, optionLabels] of [
      [
        '运行模式',
        deviceState.purifier
          ? deviceState.presetModes
          : deviceState.waterHeater && !deviceState.nativePower
            ? deviceState.modes
            : deviceState.modes!.filter((mode) => mode !== 'off'),
        deviceState.purifier ? 'presetMode' : 'mode',
        deviceState.purifier ? 'set_preset_mode' : deviceState.waterHeater ? 'set_operation_mode' : 'set_hvac_mode',
        Object.fromEntries(
          (deviceState.purifier ? deviceState.presetModes : deviceState.modes)!.map((modeValue) => [
            modeValue,
            deviceState.purifier
              ? (purifierPresetLabels as any)[String(modeValue).trim().toLowerCase()] || modeValue
              : climateModeLabel2(modeValue, deviceState.waterHeater ? 'water-heater' : 'air-conditioner'),
          ]),
        ),
      ],
      ['风速', deviceState.fanModes, 'fanMode', 'set_fan_mode', fanModeLabels],
      [
        deviceState.horizontalSwingModes?.length ? '上下摆风' : '摆风',
        deviceState.swingModes,
        'swingMode',
        'set_swing_mode',
        Object.fromEntries(deviceState.swingModes!.map((swingMode) => [swingMode, formatSwingModeLabel(swingMode)])),
      ],
      [
        '左右摆风',
        deviceState.horizontalSwingModes || [],
        'horizontalSwingMode',
        'set_swing_horizontal_mode',
        Object.fromEntries(
          (deviceState.horizontalSwingModes || []).map((horizontalSwingValue) => [
            horizontalSwingValue,
            formatSwingModeLabel(horizontalSwingValue, 'horizontal'),
          ]),
        ),
      ],
      [
        '预设模式',
        !deviceState.purifier && !deviceState.waterHeater ? deviceState.presetModes : [],
        'presetMode',
        'set_preset_mode',
        Object.fromEntries(
          (deviceState.presetModes || []).map((presetModeValue) => [
            presetModeValue,
            climateModeLabel2(presetModeValue),
          ]),
        ),
      ],
      [
        '方向',
        deviceState.purifier && deviceState.directionSupported ? ['forward', 'reverse'] : [],
        'direction',
        'set_direction',
        {
          forward: '正向',
          reverse: '反向',
        },
      ],
    ]) {
      if (!optionValues.length) continue
      if (thermostatOnly && THERMOSTAT_HIDDEN_FIELDS.includes(field)) continue
      const groupElement = createElement('section', 'i3d-climate-option-group'),
        groupHeadingElement = createElement('h4', '', groupLabel)
      groupElement.append(groupHeadingElement)
      const includes =
          !deviceState.purifier && !deviceState.waterHeater && ['mode', 'fanMode', 'presetMode'].includes(field),
        groupContainer = includes ? primaryGroupsElement : mainGroupsElement
      if (
        (includes && (primaryGroupsElement.hidden = false),
        includes ||
          (!deviceState.purifier &&
            !deviceState.waterHeater &&
            (optionValues.length > 4 ||
              optionValues.some((listedOption: any) => [...(optionLabels[listedOption] || listedOption)].length > 8))))
      ) {
        const groupPicker = je2.create(groupLabel, optionValues, optionLabels, (pickedValue: any) =>
          deviceState.purifier && service === 'set_preset_mode'
            ? requestPresetOrMode(service, pickedValue)
            : requestControl(service, pickedValue),
        )
        choiceButtons.push(
          Object.assign(groupPicker, {
            field: field,
            select: true,
          }),
        ),
          groupElement.append(groupPicker.picker),
          groupContainer.append(groupElement)
        continue
      }
      const choicesElement = createElement('div', 'i3d-climate-choices')
      choicesElement.setAttribute('role', 'group'),
        choicesElement.setAttribute('aria-label', groupLabel),
        viewModel.item?.pedestalFan && field === 'presetMode' && choicesElement.classList.add('i3d-fan-modes')
      for (const optionValue of optionValues) {
        const optionButton = createElement('button', 'i3d-climate-choice', optionLabels[optionValue] || optionValue)
        ;(optionButton.type = 'button'),
          optionButton.addEventListener('click', () =>
            deviceState.purifier && service === 'set_preset_mode'
              ? requestPresetOrMode(service, optionValue)
              : requestControl(service, optionValue),
          ),
          choiceButtons.push({
            element: optionButton,
            field: field,
            value: optionValue,
          }),
          choicesElement.append(optionButton)
      }
      groupElement.append(choicesElement), groupContainer.append(groupElement)
    }
    if (deviceState.purifier && deviceState.oscillatingSupported) {
      const oscillatingGroupElement = createElement('section', 'i3d-climate-option-group'),
        oscillatingTitleElement = createElement('h4', '', viewModel.item?.pedestalFan ? '摇头' : '摆动'),
        oscillatingButton = createElement('button', 'i3d-climate-choice', deviceState.oscillating ? '已开启' : '已关闭')
      ;(oscillatingButton.type = 'button'),
        oscillatingButton.addEventListener('click', () => requestControl('oscillate', !deviceState.oscillating)),
        choiceButtons.push({
          element: oscillatingButton,
          field: 'oscillating',
          value: true,
        }),
        oscillatingGroupElement.append(oscillatingTitleElement, oscillatingButton),
        mainGroupsElement.append(oscillatingGroupElement)
    }
  }
  function render() {
    if (isDisposed) return
    const activeItem = viewModel.item || {},
      hasEntity = !!activeItem.entityId,
      isControllable = canControl()
    rootElement.setAttribute(
      'aria-label',
      activeItem.climateType === 'bath-heater'
        ? '浴霸控制'
        : deviceState.waterHeater
          ? '热水器控制'
          : activeItem.airPurifier
            ? '空气净化器控制'
            : activeItem.exhaustFan
              ? '排气扇控制'
              : activeItem.pedestalFan
                ? activeItem.ceilingFan
                  ? '吊扇控制'
                  : '风扇控制'
                : deviceState.purifier
                  ? '风扇控制'
                  : '空调控制',
    ),
      (titleElement.textContent = climateDialogTitle2(activeItem.label, deviceState.name, activeItem.climateType)),
      (titleElement.title = titleElement.textContent),
      (statusElement.textContent = viewModel.editing
        ? '控制预览'
        : hasEntity
          ? deviceState.available
            ? (draftPowerOn ?? deviceState.on)
              ? climateModeLabel2(draftMode ?? deviceState.mode)
              : '已关闭'
            : '设备不可用'
          : '尚未绑定设备'),
      deviceState.purifier &&
        deviceState.available &&
        !viewModel.editing &&
        !activeItem.airPurifier &&
        (statusElement.textContent =
          (draftPowerOn ?? deviceState.on)
            ? activeItem.pedestalFan
              ? '运行中'
              : resolvePresetLabel(draftPresetMode ?? deviceState.presetMode) || '净化中'
            : '已关闭'),
      deviceState.waterHeater &&
        deviceState.available &&
        !viewModel.editing &&
        (statusElement.textContent = waterHeaterStatusLabel2(deviceState.raw)),
      activeItem.waterHeater &&
        !hasEntity &&
        !viewModel.editing &&
        (activeItem.deviceId || activeItem.extraControls?.length) &&
        (statusElement.textContent = '各功能独立控制'),
      activeItem.pedestalFan &&
        !hasEntity &&
        !viewModel.editing &&
        (activeItem.deviceId || activeItem.extraControls?.length) &&
        (statusElement.textContent = '各功能独立控制'),
      activeItem.climateType === 'bath-heater' &&
        !viewModel.editing &&
        (statusElement.textContent = bathHeaterState2(activeItem, viewModel.states).label),
      // 0.8.9 取暖壁挂炉：制热时明确写「正在制热」—— 壁挂炉的主实体是 climate，
      // 只显示「制热」会和空调混在一起看不出是地暖在烧。
      isHeatingBoiler(activeItem) &&
        !viewModel.editing &&
        isBoilerHeating(deviceState) &&
        (statusElement.textContent = BOILER_COPY.heating)
    const fanStatus = activeItem.pedestalFan
      ? resolveFanBindingState(activeItem, {
          ...(viewModel.states || {}),
          ...(activeItem.entityId && deviceState.raw ? { [activeItem.entityId]: deviceState.raw } : {}),
        })
      : null
    const purifierStatus = activeItem.airPurifier ? purifierState2(activeItem, viewModel.states) : null
    const effectivePresetMode = String(draftPresetMode ?? deviceState.presetMode ?? '').trim()
    fanStatus && !viewModel.editing && (statusElement.textContent = fanStatus.label || statusElement.textContent),
      // 新风/净化器：状态跟草稿电源，开机时优先显示运行模式名
      purifierStatus &&
        !viewModel.editing &&
        (statusElement.textContent = !hasEntity
          ? '各功能独立控制'
          : !purifierStatus.available
            ? '状态未知'
            : (draftPowerOn ?? purifierStatus.on)
              ? resolvePresetLabel(effectivePresetMode) ||
                (purifierStatus.running || draftPowerOn ? '运行中' : '已开启')
              : '已停止'),
      rootElement.classList.toggle('is-air-conditioner-panel', !deviceState.purifier && !deviceState.waterHeater),
      rootElement.classList.toggle('is-fan-panel', !!activeItem.pedestalFan),
      // 面板形态落成 DOM 属性（与上游 `dataset.heatingPanelStyle` 同名）。
      // 抽成函数是必须的：`render` 的圈复杂度已贴着棘轮上限，这里只能加"一次调用"。
      syncHeatingPanelStyle(rootElement, activeItem),
      (fanSpeedRangeElement.className = 'i3d-control-range'),
      fanSpeedRangeElement.setAttribute(
        'aria-label',
        activeItem.exhaustFan
          ? '排气扇风速'
          : activeItem.pedestalFan
            ? activeItem.ceilingFan
              ? '吊扇风速'
              : '电风扇风速'
            : '净化器风速',
      ),
      speedLevelsElement.setAttribute(
        'aria-label',
        activeItem.exhaustFan
          ? '排气扇风速档位'
          : activeItem.pedestalFan
            ? activeItem.ceilingFan
              ? '吊扇风速档位'
              : '电风扇风速档位'
            : '净化器风速档位',
      )
    const displayState = fanStatus || purifierStatus || deviceState,
      effectiveOn = !!(displayState.available && resolveDisplayPowerOn()),
      effectiveMode = String(draftMode ?? deviceState.mode ?? 'off'),
      effectiveVisualMode = fanStatus
        ? effectiveOn && (fanStatus.running || draftPowerOn === true)
          ? 'fan'
          : 'off'
        : purifierStatus
          ? effectiveOn
            ? 'other'
            : 'off'
          : resolveClimateVisualMode(effectiveMode, effectiveOn),
      effectiveAccent = resolveClimateAccent(effectiveVisualMode),
      effectiveTemperature = resolveTemperature(),
      effectiveRunning = !!(
        displayState.available &&
        effectiveOn &&
        (displayState.running || draftPowerOn === true || draftMode !== null || draftPresetMode !== null)
      )
    ;(rootElement.dataset.climateMode = displayState.available ? effectiveVisualMode : 'off'),
      rootElement.classList.toggle('is-preview', !!viewModel.editing),
      rootElement.classList.toggle('is-on', effectiveOn),
      rootElement.classList.toggle('is-running', effectiveRunning),
      (awayModeButton.hidden = !deviceState.waterHeater || !deviceState.awaySupported),
      (awayModeButton.disabled = !isControllable || isSending),
      (awayModeButton.textContent = deviceState.away ? '离家模式 · 已开启' : '离家模式 · 已关闭'),
      awayModeButton.setAttribute('aria-pressed', String(!!deviceState.away)),
      (powerButton.hidden =
        !!(
          (activeItem.climateType === 'bath-heater' || activeItem.airPurifier || activeItem.pedestalFan) &&
          !activeItem.entityId
        ) || !!(deviceState.waterHeater && !deviceState.canTurnOn && !deviceState.canTurnOff)),
      (powerButton.textContent = effectiveOn ? '关闭' : '开启'),
      rootElement.setAttribute('aria-busy', String(isSending || !!viewModel.busy)),
      (powerButton.disabled =
        !isControllable ||
        (!deviceState.turnOnSupported && !deviceState.modes!.some((modeId) => modeId !== 'off')) ||
        (effectiveOn && !deviceState.waterHeater && !deviceState.modes!.includes('off'))),
      deviceState.waterHeater ||
        (powerButton.disabled = !isControllable || (effectiveOn ? !deviceState.canTurnOff : !deviceState.canTurnOn)),
      deviceState.waterHeater &&
        (powerButton.disabled =
          !isControllable || isSending || (effectiveOn ? !deviceState.canTurnOff : !deviceState.canTurnOn)),
      powerButton.setAttribute('aria-pressed', String(effectiveOn)),
      powerButton.setAttribute(
        'aria-label',
        titleElement.textContent +
          '，' +
          (effectiveOn ? '关闭' : '开启') +
          (activeItem.climateType === 'bath-heater'
            ? '浴霸主实体'
            : deviceState.waterHeater
              ? '热水器'
              : activeItem.pedestalFan
                ? activeItem.ceilingFan
                  ? '吊扇'
                  : '电风扇'
                : deviceState.purifier
                  ? '空气净化器'
                  : '空调'),
      ),
      deviceVisual.sync({
        kind: resolveClimateVisualKind(activeItem, deviceState),
        on: effectiveOn,
        running: effectiveRunning,
        available: !!displayState.available,
        disabled: !!powerButton.disabled,
        interactive: !powerButton.hidden && !powerButton.disabled,
        hidden: !!powerButton.hidden,
        label: titleElement.textContent || '设备',
        accent: effectiveAccent,
        mode: effectiveMode,
        visualMode: effectiveVisualMode,
        targetTemperature: typeof effectiveTemperature === 'number' ? effectiveTemperature : null,
        displayText: statusElement.textContent || '',
      }),
      (thermostatSlotElement.hidden = targetOutputElement.hidden =
        !deviceState.temperatureSupported || deviceState.useTemperatureRange),
      (temperatureRangeElement.hidden = !deviceState.useTemperatureRange),
      (fanSpeedGroupElement.hidden = !deviceState.purifier || !deviceState.percentageSupported),
      (fanSpeedRangeElement.disabled = !isControllable),
      (fanSpeedRangeElement.step = String(deviceState.percentageStep || 1)),
      (fanSpeedRangeElement.value = String(speedFeedback.read('speed', deviceState.percentage ?? 0))),
      syncHtmlRangeProgress(fanSpeedRangeElement),
      (fanSpeedLabelElement.textContent = '风速 ' + (deviceState.percentage ?? '--') + '%')
    const speedLevels = deviceState.speedLevels || [],
      stringify = JSON.stringify([deviceState.entityId, speedLevels])
    ;(fanSpeedRangeElement.hidden = speedLevels.length > 0),
      (speedLevelsElement.hidden = !speedLevels.length),
      lastSpeedSignature !== stringify &&
        ((lastSpeedSignature = stringify),
        replaceChildren(speedLevelsElement),
        speedLevelsElement.style.setProperty('--i3d-speed-columns', fanSpeedColumns(speedLevels.length)),
        (list = speedLevels.map((speedLevel) => {
          const speedChoiceButton = createElement('button', 'i3d-climate-choice', speedLevel.label)
          return (
            (speedChoiceButton.type = 'button'),
            speedChoiceButton.addEventListener('click', () => requestControl('set_percentage', speedLevel.percentage)),
            speedLevelsElement.append(speedChoiceButton),
            {
              button: speedChoiceButton,
              ...speedLevel,
            }
          )
        })))
    let activeSpeedIndex = -1
    deviceState.on &&
      deviceState.percentage! > 0 &&
      (activeSpeedIndex = speedLevels.findIndex(
        (speedEntry) => Math.abs(speedEntry.percentage - deviceState.percentage!) <= 1,
      )),
      speedLevels.length &&
        (fanSpeedLabelElement.textContent =
          activeSpeedIndex >= 0
            ? '风速 · ' + speedLevels[activeSpeedIndex].label
            : effectivePresetMode
              ? '风速 · 由模式控制'
              : resolveDisplayPowerOn()
                ? '风速 ' + (deviceState.percentage ?? '--') + '%'
                : '风速 · 已关闭'),
      list.forEach(({ button: speedButton }: any, speedIndex: any) => {
        ;(speedButton.disabled = !isControllable),
          speedButton.setAttribute('aria-pressed', String(speedIndex === activeSpeedIndex))
      }),
      syncTemperature()
    const rangeValues = resolveRangeValues()
    for (const rangeRow of rangeRows) {
      const rowValue = rangeValues[rangeRow.field],
        isLowerBound = rangeRow.field === 'target_temp_low'
      ;(rangeRow.output.textContent = rowValue == null ? '--' : '' + rowValue + (deviceState.temperatureUnit || '°')),
        (rangeRow.decrease.disabled =
          !isControllable ||
          (rowValue !== null &&
            rowValue <= (isLowerBound ? deviceState.minimum : (rangeValues.target_temp_low ?? deviceState.minimum)))),
        (rangeRow.increase.disabled =
          !isControllable ||
          (rowValue !== null &&
            rowValue >= (isLowerBound ? (rangeValues.target_temp_high ?? deviceState.maximum) : deviceState.maximum)))
    }
    ;(temperatureIntervalElement.hidden = deviceState.waterHeater
      ? deviceState.temperatureSupported ||
        (deviceState.currentTemperature === null && deviceState.temperature === null)
      : !deviceState.useTemperatureRange &&
        (deviceState.temperatureSupported || deviceState.currentTemperature === null || deviceState.purifier)),
      (temperatureIntervalElement.textContent = deviceState.waterHeater
        ? '当前水温 ' +
          (deviceState.currentTemperature ?? '--') +
          deviceState.temperatureUnit +
          ' · 目标 ' +
          (deviceState.temperature ?? '--') +
          deviceState.temperatureUnit +
          '（只读）'
        : '当前温度 ' + (deviceState.currentTemperature ?? '--') + (deviceState.temperatureUnit || '°'))
    const optionsSignature = JSON.stringify([
      deviceState.entityId,
      !!activeItem.pedestalFan,
      deviceState.modes,
      deviceState.fanModes,
      deviceState.swingModes,
      deviceState.horizontalSwingModes,
      deviceState.presetModes,
      deviceState.directionSupported,
      deviceState.oscillatingSupported,
      deviceState.nativePower,
    ])
    renderedGroupsSignature !== optionsSignature && ((renderedGroupsSignature = optionsSignature), buildChoiceGroups())
    for (const controlEntry of choiceButtons)
      if (
        (controlEntry.field === 'oscillating' &&
          (controlEntry.element.textContent = deviceState.oscillating ? '已开启' : '已关闭'),
        (controlEntry.element.disabled = !isControllable),
        controlEntry.select)
      ) {
        const entryValue =
            controlEntry.field === 'mode' ? effectiveMode : (deviceState as any)[controlEntry.field] || '',
          entryLabel =
            controlEntry.labels[entryValue] ||
            (controlEntry.field === 'mode' ? climateModeLabel2(entryValue) : entryValue)
        je2.sync(controlEntry, entryValue, entryLabel, !isControllable)
      } else
        controlEntry.element.setAttribute(
          'aria-pressed',
          String(
            (controlEntry.field === 'mode'
              ? effectiveMode
              : controlEntry.field === 'presetMode'
                ? effectivePresetMode
                : (deviceState as any)[controlEntry.field]) === controlEntry.value,
          ),
        )
    ;(emptyStateElement.hidden =
      deviceState.available &&
      (deviceState.purifier ||
        deviceState.temperatureSupported ||
        deviceState.rangeSupported ||
        deviceState.canTurnOn ||
        deviceState.canTurnOff ||
        choiceButtons.length > 0 ||
        (deviceState.waterHeater && (deviceState.canTurnOn || deviceState.canTurnOff || deviceState.awaySupported)))),
      (activeItem.climateType === 'bath-heater' || activeItem.airPurifier || activeItem.waterHeater) &&
        activeItem.extraControls?.length &&
        (emptyStateElement.hidden = true),
      (emptyStateElement.textContent =
        (activeItem.waterHeater || activeItem.pedestalFan) && !hasEntity && activeItem.deviceId
          ? '请在附加功能中选择要显示的功能'
          : hasEntity
            ? deviceState.raw?.state === 'unavailable'
              ? '设备离线'
              : ''
            : '尚未绑定设备'),
      (emptyStateElement.hidden ||= !emptyStateElement.textContent),
      (errorElement.textContent = viewModel.error || errorText),
      (errorElement.hidden = !errorElement.textContent)
  }
  function update(nextViewModel: ClimatePanelViewModel = {}) {
    if (isDisposed) return
    const nextEntityId = nextViewModel.item?.entityId || ''
    nextEntityId !== deviceState.entityId &&
      (instanceId++,
      (pendingControlCount = 0),
      (pendingControlPromise = Promise.resolve()),
      (isSending = false),
      (errorText = ''),
      clearPendingState(),
      feedbackTracker.dispose(),
      (feedbackTracker = createFeedback()),
      (feedbackElement.textContent = ''),
      (feedbackElement.hidden = true))
    const useTemperatureRange = deviceState.useTemperatureRange
    ;(viewModel = nextViewModel),
      purifierExtrasController.update({
        item: nextViewModel.item,
        states: nextViewModel.states || {},
        editing: nextViewModel.editing || nextViewModel.busy,
        numberFormats: nextViewModel.numberFormats || {},
      }),
      (deviceState =
        nextViewModel.state?.entityId === nextEntityId && Array.isArray(nextViewModel.state?.modes)
          ? nextViewModel.state
          : nextViewModel.item?.exhaustFan
            ? nextEntityId.startsWith('switch.')
              ? exhaustSwitchState2(nextEntityId, nextViewModel.state)
              : exhaustFanState2(nextViewModel.item, nextViewModel.states || {})
            : climateState2(nextEntityId, nextViewModel.state)),
      nextViewModel.item?.pedestalFan &&
        !nextEntityId &&
        (deviceState = {
          ...deviceState,
          purifier: true,
          name: nextViewModel.item?.exhaustFan ? '排气扇' : nextViewModel.item?.ceilingFan ? '吊扇' : '风扇',
        }),
      nextViewModel.item?.airPurifier &&
        !nextEntityId &&
        (deviceState = {
          ...deviceState,
          purifier: true,
          name: '空气净化器',
        }),
      nextViewModel.item?.waterHeater &&
        !nextEntityId &&
        (deviceState = {
          ...deviceState,
          waterHeater: true,
          name: '热水器',
        }),
      useTemperatureRange !== deviceState.useTemperatureRange && clearPendingState(),
      deviceState.waterHeater && feedbackTracker.sync(deviceState.raw),
      nextViewModel.editing || modeHistory.observe(nextEntityId, deviceState.raw),
      draftTemperature !== null &&
        deviceState.temperature !== null &&
        Math.abs(deviceState.temperature - draftTemperature) < Math.max(0.001, deviceState.step! / 100) &&
        clearTemperatureDraft(),
      pendingRangeValues &&
        ['target_temp_low', 'target_temp_high'].every(
          (rangeFieldName, rangeIndex) =>
            [deviceState.targetLow, deviceState.targetHigh][rangeIndex] !== null &&
            Math.abs(
              [deviceState.targetLow, deviceState.targetHigh][rangeIndex]! - pendingRangeValues![rangeFieldName],
            ) < Math.max(0.001, deviceState.step! / 100),
        ) &&
        clearTemperatureDraft(),
      draftMode !== null &&
        ((!deviceState.on && draftMode === 'off') || (deviceState.on && deviceState.mode === draftMode)) &&
        (draftMode = null),
      draftPresetMode !== null && deviceState.presetMode === draftPresetMode && (draftPresetMode = null),
      draftPowerOn !== null &&
        deviceState.on === draftPowerOn &&
        (!viewModel.item?.airPurifier || purifierState2(viewModel.item, viewModel.states || {}).on === draftPowerOn) &&
        (draftPowerOn = null),
      draftMode === null &&
        draftPresetMode === null &&
        draftPowerOn === null &&
        draftTemperature === null &&
        !pendingRangeValues &&
        temperatureTimeoutId !== null &&
        (clearTimeout(temperatureTimeoutId), (temperatureTimeoutId = null)),
      render()
  }
  function dispose() {
    isDisposed ||
      ((isDisposed = true),
      instanceId++,
      je2.close(),
      clearPendingState(),
      speedFeedback.reset(),
      feedbackTracker.dispose(),
      releaseErrorFeedback(),
      releaseStatusFeedback(),
      ownFeedbackSlot?.dispose?.(),
      purifierExtrasController.dispose(),
      deviceVisual.dispose(),
      replaceChildren(rootElement))
  }
  return (
    render(),
    {
      root: rootElement,
      update: update,
      power: togglePower,
      dispose: dispose,
      cancelPending() {
        instanceId++,
          je2.close(),
          (pendingControlCount = 0),
          (pendingControlPromise = Promise.resolve()),
          (isSending = false),
          clearPendingState(),
          feedbackTracker.dispose(),
          (feedbackTracker = createFeedback()),
          (feedbackElement.textContent = ''),
          (feedbackElement.hidden = true)
      },
    }
  )
}

export const { createWaterHeaterFeedback, waterHeaterCapabilities } = waterHeaterRendererModule
export function waterHeaterCapabilityStatusLabel(entityState: any) {
  const capabilities = waterHeaterRendererModule.waterHeaterCapabilities(entityState)
  if (!capabilities.available)
    return entityState?.state === 'unavailable' || entityState?.available === false ? '设备不可用' : '状态未知'
  if (capabilities.away) return '离家模式'
  if (entityState.state === 'off') return '已关闭'
  const presentationMode = climateRendererModule.climatePresentationMode(entityState, 'water-heater')
  return presentationMode === 'on'
    ? '已开启'
    : '当前模式 · ' +
        (presentationMode === 'high_demand'
          ? '高需求'
          : climateRendererModule.climateModeLabel(presentationMode, 'water-heater'))
}
const {
  climateIsPoweredOn: climateIsPoweredOn,
  climateIsRunning: climateIsRunning,
  climatePowerCommand: climatePowerCommand,
} = climateRendererModule
export const {
  climateModeLabel,
  climateModeIcon,
  climateSwingModeLabel,
  climateOptionPresentation,
  climateDialogTitle,
} = climateRendererModule
function purifierSpeedLevels(percentageStep: any) {
  const step = haNumber(percentageStep)
  if (step === null || step <= 0 || step > 100) return []
  const levelCount = Math.round(100 / step)
  return levelCount < 1 || levelCount > 10 || Math.abs(step - 100 / levelCount) > 0.02
    ? []
    : Array.from(
        {
          length: levelCount,
        },
        (_levelUnused, levelIndex) => ({
          label: levelCount === 3 ? ['低档', '中档', '高档'][levelIndex] : levelIndex + 1 + ' 档',
          percentage: Math.floor((100 * (levelIndex + 1)) / levelCount),
        }),
      )
}
export function climateState(entityId: any, receivedState: any) {
  const stateObject = receivedState?.newState || receivedState || {},
    attributes = attributesOf(stateObject)
  if (/^water_heater\.[a-z0-9_]+$/.test(entityId)) {
    const heaterCapabilities = waterHeaterRendererModule.waterHeaterCapabilities(stateObject),
      isWaterHeaterOn = heaterCapabilities.available && climateIsPoweredOn(stateObject, 'water-heater')
    return {
      entityId: entityId,
      raw: stateObject,
      waterHeater: true,
      ...heaterCapabilities,
      available: heaterCapabilities.available,
      on: isWaterHeaterOn,
      running: false,
      name: attributes.friendly_name || '热水器',
      mode: climateRendererModule.climatePresentationMode(stateObject, 'water-heater'),
      visualMode: isWaterHeaterOn ? 'heat' : 'off',
      temperatureUnit: heaterCapabilities.unit,
      rangeSupported: false,
      fanModes: [] as any[],
      swingModes: [] as any[],
      presetModes: [] as any[],
      turnOnSupported: heaterCapabilities.nativePower,
    }
  }
  if (/^fan\.[a-z0-9_]+$/.test(entityId)) {
    const isPurifierAvailable = stateObject.available !== false && ['on', 'off'].includes(stateObject.state),
      percentage = haNumber(attributes.percentage),
      purifierCapabilities = fanCapabilities(attributes)
    return {
      entityId: entityId,
      raw: stateObject,
      purifier: true,
      available: isPurifierAvailable,
      on: isPurifierAvailable && stateObject.state === 'on',
      running: isPurifierAvailable && stateObject.state === 'on',
      name: attributes.friendly_name || '空气净化器',
      mode: stateObject.state,
      visualMode: stateObject.state === 'on' ? 'other' : 'off',
      temperature: null as any,
      currentTemperature: null as any,
      temperatureSupported: false,
      rangeSupported: false,
      percentage: percentage,
      ...purifierCapabilities,
      percentageStep: haNumber(attributes.percentage_step) || 1,
      speedLevels: purifierCapabilities.percentageSupported ? purifierSpeedLevels(attributes.percentage_step) : [],
      modes: ['off', 'on'],
      fanModes: [] as any[],
      swingModes: [] as any[],
      presetMode: attributes.preset_mode || '',
      oscillating: attributes.oscillating === true,
      direction: attributes.direction || '',
      turnOnSupported: purifierCapabilities.canTurnOn,
      turnOffSupported: purifierCapabilities.canTurnOff,
    }
  }
  const modeOptionsByName = Object.fromEntries(
      Object.entries({
        hvacModes: 'hvac_modes',
        fanModes: 'fan_modes',
        swingModes: 'swing_modes',
        horizontalSwingModes: 'swing_horizontal_modes',
        presetModes: 'preset_modes',
      }).map(([optionGroupName, optionAttributeName]) => [
        optionGroupName,
        stringOptions(attributes[optionAttributeName]),
      ]),
    ),
    stateValue = typeof stateObject.state == 'string' ? stateObject.state : '',
    minimum = haNumber(attributes.min_temp),
    maximum = haNumber(attributes.max_temp),
    temperature = haNumber(attributes.temperature),
    supportedFeatures = featureFlags(attributes),
    targetLow = haNumber(attributes.target_temp_low),
    targetHigh = haNumber(attributes.target_temp_high),
    hasSupportedFeaturesAttribute = Object.hasOwn(attributes, 'supported_features'),
    resolveFeatureSupport = (featureBit: any, fallbackResult: any) =>
      hasSupportedFeaturesAttribute ? !!(supportedFeatures! & featureBit) : fallbackResult,
    hasTemperatureRange = minimum !== null && maximum !== null && maximum > minimum,
    temperatureUnit = ['°C', '°F', 'K'].includes(attributes.temperature_unit) ? attributes.temperature_unit : '°',
    parsedTargetStep = haNumber(attributes.target_temp_step),
    temperatureStep = parsedTargetStep! > 0 ? parsedTargetStep : temperatureUnit === '°F' ? 1 : 0.5,
    hasValidTargetStep = attributes.target_temp_step == null || parsedTargetStep! > 0,
    temperatureSupported = hasTemperatureRange && hasValidTargetStep && resolveFeatureSupport(1, temperature !== null),
    rangeSupported =
      hasTemperatureRange && hasValidTargetStep && resolveFeatureSupport(2, targetLow !== null && targetHigh !== null),
    available =
      /^(climate|water_heater)\.[a-z0-9_]+$/.test(entityId) &&
      stateObject.available !== false &&
      !!stateValue &&
      !['unknown', 'unavailable'].includes(stateValue)
  return {
    entityId: entityId,
    raw: stateObject,
    available: available,
    on: available && climateIsPoweredOn(stateObject, 'air-conditioner'),
    running:
      available &&
      !['unknown', 'unavailable'].includes(
        String(attributes.hvac_action || '')
          .trim()
          .toLowerCase(),
      ) &&
      climateIsRunning(stateObject, 'air-conditioner'),
    name: String(attributes.friendly_name || entityId || '空调'),
    mode: stateValue,
    visualMode:
      !available || !climateIsPoweredOn(stateObject, 'air-conditioner')
        ? 'off'
        : stateValue === 'cool'
          ? 'cool'
          : stateValue === 'heat'
            ? 'heat'
            : 'other',
    temperature: temperature,
    currentTemperature: haNumber(attributes.current_temperature),
    targetLow: targetLow,
    targetHigh: targetHigh,
    minimum: minimum,
    maximum: maximum,
    step: temperatureStep,
    temperatureUnit: temperatureUnit,
    temperatureSupported: temperatureSupported,
    rangeSupported: rangeSupported,
    useTemperatureRange: rangeSupported && (stateValue === 'heat_cool' || !temperatureSupported),
    modes: modeOptionsByName.hvacModes,
    fanModes: resolveFeatureSupport(8, true) ? modeOptionsByName.fanModes : [],
    turnOnSupported: !!(supportedFeatures! & 256),
    turnOffSupported: !!(supportedFeatures! & 128),
    canTurnOn:
      !!(supportedFeatures! & 256) || modeOptionsByName.hvacModes.some((hvacModeName) => hvacModeName !== 'off'),
    canTurnOff: !!(supportedFeatures! & 128) || modeOptionsByName.hvacModes.includes('off'),
    swingModes: resolveFeatureSupport(32, true) ? modeOptionsByName.swingModes : [],
    horizontalSwingModes: resolveFeatureSupport(512, true) ? modeOptionsByName.horizontalSwingModes : [],
    presetModes: resolveFeatureSupport(16, true) ? modeOptionsByName.presetModes : [],
    fanMode: attributes.fan_mode || '',
    swingMode: attributes.swing_mode || '',
    horizontalSwingMode: attributes.swing_horizontal_mode || '',
    presetMode: attributes.preset_mode || '',
  }
}
/**
 * 排气扇**运行状态**：主实体可以是 `switch.*` 或 `fan.*`，只看开关，不带风速 / 方向。
 *
 * `visualMode` 仍返回 `'fan'`（`'off'` 是关态）：面板的风扇插画按 `fan/off` 取图，
 * 不要新造一个 `'exhaust'` 视觉模式。
 */
export function exhaustFanState(binding: any = {}, stateSource: any = {}) {
  const entityRecord = stateSource?.get?.(binding.entityId) || stateSource?.[binding.entityId],
    entityState = entityRecord?.newState || entityRecord || {},
    available = !!(
      binding.entityId &&
      entityState.available !== false &&
      entityRecord?.available !== false &&
      ['on', 'off'].includes(entityState.state)
    )
  return {
    available,
    on: available && entityState.state === 'on',
    running: available && entityState.state === 'on',
    visualMode: available && entityState.state === 'on' ? 'fan' : 'off',
    label: binding.entityId
      ? available
        ? entityState.state === 'on'
          ? '运行中'
          : '已关闭'
        : '设备不可用'
      : '未绑定运行实体',
  }
}

/**
 * 排气扇的 `switch.*` 主实体：底子是**没有风速能力**的净化器面板 —— 因此
 * `percentageSupported` / `speedLevels` 都不存在，风速滑杆与档位按钮自然隐藏；
 * 开关命令由 `climatePowerControl` 特判成 `switch.turn_on/off`。
 */
export function exhaustSwitchState(entityId: any, receivedState: any) {
  const stateObject = receivedState?.newState || receivedState || {},
    available = stateObject.available !== false && ['on', 'off'].includes(stateObject.state)
  return {
    ...climateState('', null),
    entityId,
    raw: stateObject,
    available,
    purifier: true,
    exhaustSwitch: true,
    name: attributesOf(stateObject).friendly_name || '排气扇',
    mode: stateObject.state,
    modes: ['off', 'on'] as string[],
    on: available && stateObject.state === 'on',
    running: available && stateObject.state === 'on',
    canTurnOn: true,
    canTurnOff: true,
    turnOnSupported: true,
    turnOffSupported: true,
  }
}

export function climatePowerControl(state: any, desiredOn = !state.on, lastMode = '') {
  if (!state.available) throw new Error('设备当前不可用。')
  /**
   * 排气扇的 `switch.*` 主实体：走 `switch.turn_on/off`（不是 `fan.*`，也不是 `climate.*`）。
   * 必须放在 `purifier` 分支之前 —— 那个分支会把命令写成 `fan.turn_on`。
   */
  if (state.exhaustSwitch)
    return {
      entityId: state.entityId,
      domain: 'switch',
      service: desiredOn ? 'turn_on' : 'turn_off',
      data: {} as Record<string, any>,
    }
  if (state.waterHeater)
    return {
      entityId: state.entityId,
      ...waterHeaterRendererModule.waterHeaterPowerCommand(state.raw, desiredOn, lastMode),
    }
  if (state.purifier) {
    if (desiredOn ? !state.canTurnOn : !state.canTurnOff) throw new Error('设备不支持此开关操作。')
    return {
      entityId: state.entityId,
      domain: 'fan',
      service: desiredOn ? 'turn_on' : 'turn_off',
      data: {} as Record<string, any>,
    }
  }
  if (desiredOn ? !state.canTurnOn : !state.canTurnOff) throw new Error('设备尚未提供可用的开关模式。')
  if (!desiredOn && state.turnOffSupported)
    return {
      entityId: state.entityId,
      domain: 'climate',
      service: 'turn_off',
      data: {} as Record<string, any>,
    }
  if (desiredOn) {
    const restoreMode = lastMode || (state.on ? state.mode : '')
    if (restoreMode && restoreMode !== 'off' && state.modes.includes(restoreMode))
      return {
        entityId: state.entityId,
        domain: 'climate',
        service: 'set_hvac_mode',
        data: {
          hvac_mode: restoreMode,
        },
      }
    if (state.turnOnSupported)
      return {
        entityId: state.entityId,
        domain: 'climate',
        service: 'turn_on',
        data: {} as Record<string, any>,
      }
  }
  const command = climatePowerCommand(
    state.entityId,
    {
      ...state.raw,
      attributes: {
        ...attributesOf(state.raw),
        hvac_modes: state.modes,
      },
    },
    desiredOn,
    'air-conditioner',
    lastMode,
  )
  if (command.domain !== 'climate' || command.service !== 'set_hvac_mode')
    throw new Error('设备尚未提供可用的开关模式。')
  return {
    entityId: state.entityId,
    domain: 'climate',
    service: command.service,
    data: command.data,
  }
}
export function createClimateModeHistory({
  storage: storage,
  scope: scope = '',
}: {
  storage?: Storage
  scope?: string
} = {}) {
  const modesByEntityId = new Map()
  let isStorageUsable = true
  const isUsableMode = (candidateMode: any) =>
      typeof candidateMode == 'string' &&
      !!candidateMode.trim() &&
      candidateMode.length <= 120 &&
      // biome-ignore lint/suspicious/noControlCharactersInRegex: 模式名清洗：控制字符与括号属于非法输入
      !/[{}\[\]\x00-\x1f]/.test(candidateMode) &&
      !['off', 'unknown', 'unavailable'].includes(candidateMode),
    storageKeyFor = (historyEntityId: any) =>
      scope && /^(climate|water_heater)\.[a-z0-9_]+$/.test(historyEntityId)
        ? 'homeos:i3d-climate-mode:v1:' + scope + ':' + historyEntityId
        : ''
  function getStoredMode(lookupEntityId: any) {
    const storageKey = storageKeyFor(lookupEntityId)
    try {
      const storedMode = isStorageUsable && storageKey && storage?.getItem(storageKey)
      if (isUsableMode(storedMode)) return (modesByEntityId.set(lookupEntityId, storedMode), storedMode)
    } catch {
      isStorageUsable = false
    }
    return modesByEntityId.get(lookupEntityId) || ''
  }
  function observeClimateState(observedEntityId: any, observedReceivedState: any) {
    const observedState = climateState(observedEntityId, observedReceivedState)
    if (
      !(
        !observedState.available ||
        !observedState.on ||
        !isUsableMode(observedState.mode) ||
        !observedState.modes.includes(observedState.mode)
      ) &&
      getStoredMode(observedEntityId) !== observedState.mode
    ) {
      modesByEntityId.set(observedEntityId, observedState.mode)
      try {
        const observedStorageKey = storageKeyFor(observedEntityId)
        isStorageUsable && observedStorageKey && storage?.setItem(observedStorageKey, observedState.mode)
      } catch {
        isStorageUsable = false
      }
    }
  }
  return {
    get: getStoredMode,
    observe: observeClimateState,
  }
}
export function climateControl(deviceState: any, service: any, value: any) {
  if (deviceState.purifier) {
    if (!deviceState.available) throw new Error('设备当前不可用。')
    if (
      service === 'set_percentage' &&
      deviceState.percentageSupported &&
      haNumber(value) !== null &&
      haNumber!(value)! >= 0 &&
      haNumber!(value)! <= 100
    )
      return {
        entityId: deviceState.entityId,
        domain: 'fan',
        service: service,
        data: {
          percentage: haNumber(value),
        },
      }
    if (service === 'set_preset_mode' && deviceState.presetModes.includes(value))
      return {
        entityId: deviceState.entityId,
        domain: 'fan',
        service: service,
        data: {
          preset_mode: value,
        },
      }
    if (service === 'oscillate' && deviceState.oscillatingSupported && typeof value == 'boolean')
      return {
        entityId: deviceState.entityId,
        domain: 'fan',
        service: service,
        data: {
          oscillating: value,
        },
      }
    if (service === 'set_direction' && deviceState.directionSupported && ['forward', 'reverse'].includes(value))
      return {
        entityId: deviceState.entityId,
        domain: 'fan',
        service: service,
        data: {
          direction: value,
        },
      }
    throw new Error('空气净化器不支持此操作。')
  }
  if (!deviceState.available) throw new Error('设备当前不可用。')
  let serviceData
  if (deviceState.waterHeater && service === 'set_away_mode') {
    if (!deviceState.awaySupported || typeof value != 'boolean') throw new Error('设备不支持离家模式。')
    return {
      entityId: deviceState.entityId,
      domain: 'water_heater',
      service: service,
      data: {
        away_mode: value,
      },
    }
  }
  if (service === 'set_temperature') {
    const isRangeRequest = value !== null && typeof value == 'object'
    if (
      isRangeRequest
        ? !deviceState.rangeSupported || Object.keys(value).sort().join(',') !== 'target_temp_high,target_temp_low'
        : !deviceState.temperatureSupported
    )
      throw new Error('设备尚未提供可用的温度控制。')
    const fractionDigits = Math.min(
        8,
        Math.max(
          String(deviceState.step).split('.')[1]?.length || 0,
          String(deviceState.minimum).split('.')[1]?.length || 0,
        ),
      ),
      alignTemperature = (requestedTemperature: any) => {
        const parsedTemperature = haNumber(requestedTemperature)
        if (parsedTemperature === null) throw new Error('设备尚未提供可用的温度控制。')
        const maxSteps = Math.floor((deviceState.maximum - deviceState.minimum) / deviceState.step + 1e-8),
          stepIndex = Math.max(
            0,
            Math.min(maxSteps, Math.round((parsedTemperature - deviceState.minimum) / deviceState.step)),
          )
        return Number((deviceState.minimum + stepIndex * deviceState.step).toFixed(fractionDigits))
      }
    if (
      ((serviceData = isRangeRequest
        ? {
            target_temp_low: alignTemperature(value.target_temp_low),
            target_temp_high: alignTemperature(value.target_temp_high),
          }
        : {
            temperature: alignTemperature(value),
          }),
      isRangeRequest && serviceData.target_temp_low! > serviceData.target_temp_high!)
    )
      throw new Error('温区下限不能高于上限。')
  } else {
    const serviceSpec = (
      (deviceState.waterHeater
        ? {
            set_operation_mode: ['modes', 'operation_mode'],
          }
        : {
            set_hvac_mode: ['modes', 'hvac_mode'],
            set_fan_mode: ['fanModes', 'fan_mode'],
            set_swing_mode: ['swingModes', 'swing_mode'],
            set_swing_horizontal_mode: ['horizontalSwingModes', 'swing_horizontal_mode'],
            set_preset_mode: ['presetModes', 'preset_mode'],
          }) as Record<string, string[] | undefined>
    )[service]
    if (!serviceSpec || !deviceState[serviceSpec[0]].includes(value)) throw new Error('设备不支持此控制选项。')
    serviceData = {
      [serviceSpec[1]]: value,
    }
  }
  return {
    entityId: deviceState.entityId,
    domain: deviceState.waterHeater ? 'water_heater' : 'climate',
    service: service,
    data: serviceData,
  }
}

/** 实体可用性判定：离线/未知态不可用，但 button/input_button 的 unknown 态视为可执行。 */
function entityUsable(entityId: any, state: any) {
  return !!(
    state &&
    state.available !== false &&
    typeof state.state == 'string' &&
    !['', 'unavailable'].includes(state.state) &&
    (!String(entityId).startsWith('fan.') || ['on', 'off'].includes(state.state)) &&
    (state.state !== 'unknown' || /^(button|input_button|scene)\./.test(entityId))
  )
}
function extraStateLabel(entityId: any, state: any, displayPrecision: number | null = null) {
  const liveState = state?.newState || state
  return liveState?.state === 'unknown' && !/^(button|input_button|scene)\./.test(entityId)
    ? '状态未知'
    : entityUsable(entityId, liveState)
      ? String(entityId).startsWith('scene.')
        ? liveState.state === 'unknown'
          ? '尚未运行'
          : '可运行'
        : liveState.state === 'unknown'
          ? '可执行'
          : String(entityId).startsWith('binary_sensor.')
            ? liveState.attributes?.device_class === 'running' && ['on', 'off'].includes(liveState.state)
              ? liveState.state === 'on'
                ? '正在运行'
                : '未在运行'
              : deviceStatusChoices(
                  {
                    entityId: entityId,
                  },
                  liveState,
                )?.options.find((choice) => choice.value === liveState.state)?.label || liveState.state
            : (
                {
                  on: '已开启',
                  off: '已关闭',
                } as any
              )[liveState.state] ||
              // 兜底交给精度格式化：传感器数值按 HA 精度显示，非数值原样返回。
              formatEntityNumber(entityId, liveState, displayPrecision)
      : '不可用'
}
export function extraTypes(rawEntityId: any) {
  const domain = String(rawEntityId).split('.')[0]
  if (
    [
      'humidifier',
      'valve',
      'lawn_mower',
      'siren',
      'alarm_control_panel',
      'vacuum',
      'lock',
      'calendar',
      'todo',
      'weather',
      'update',
      'ai_task',
      'assist_satellite',
      'conversation',
      'notify',
      'remote',
      'tts',
      'image_processing',
      'stt',
      'wake_word',
      'infrared',
      'radio_frequency',
    ].includes(domain)
  )
    return ['panel', 'state']
  const mapped = {
    text: 'panel',
    date: 'panel',
    time: 'panel',
    datetime: 'panel',
    scene: 'button',
    camera: 'picture',
    image: 'picture',
    climate: 'panel',
    cover: 'panel',
    water_heater: 'panel',
    media_player: 'panel',
    switch: 'switch',
    input_boolean: 'switch',
    light: 'switch',
    fan: 'switch',
    select: 'select',
    input_select: 'select',
    number: 'number',
    input_number: 'number',
    button: 'button',
    input_button: 'button',
  }[domain]
  return mapped ? [mapped, 'state'] : ['state']
}
export const extraLabels = {
  picture: '画面显示',
  panel: '设备面板',
  switch: '开关',
  select: '选项',
  number: '数值',
  button: '按钮',
  state: '状态显示',
}
export function purifierRelatedEntities(entities: any, targetEntityId: any) {
  const target = entities.find((entity: any) => entity.entityId === targetEntityId),
    deviceId = target?.deviceId || target?.device_id
  return deviceId
    ? entities.filter(
        (relatedEntity: any) =>
          relatedEntity.entityId !== targetEntityId && (relatedEntity.deviceId || relatedEntity.device_id) === deviceId,
      )
    : []
}
export function purifierDeviceChanged(deviceEntities: any, previousEntityId: any, nextEntityId: any) {
  if (previousEntityId === nextEntityId) return false
  const deviceIdOf = (lookupEntityId: any) => {
    const found = deviceEntities.find((candidateEntity: any) => candidateEntity.entityId === lookupEntityId)
    return found?.deviceId || found?.device_id
  }
  return !deviceIdOf(previousEntityId) || deviceIdOf(previousEntityId) !== deviceIdOf(nextEntityId)
}
function extraRanges(rangeEntityId: any, rangeState: any) {
  const attributes = attributesOf(rangeState?.newState || rangeState)
  if (rangeEntityId.startsWith('fan.') && fanCapabilities(attributes).percentageSupported)
    return [
      {
        key: 'percentage',
        label: '风速',
        min: 0,
        max: 100,
        step: 1,
        value: haNumber(attributes.percentage) ?? 0,
      },
    ]
  if (!rangeEntityId.startsWith('light.')) return []
  const colorModes = stringOptions(attributes.supported_color_modes),
    ranges: any[] = []
  colorModes.some((mode) => brightnessModes.has(mode)) &&
    ranges.push({
      key: 'brightness',
      label: '亮度',
      min: 0,
      max: 255,
      step: 1,
      value: (rangeState?.newState || rangeState)?.state === 'off' ? 0 : (haNumber(attributes.brightness) ?? 0),
    })
  const minKelvin = haNumber(attributes.min_color_temp_kelvin),
    maxKelvin = haNumber(attributes.max_color_temp_kelvin)
  return (
    colorModes.includes('color_temp') &&
      minKelvin !== null &&
      minKelvin > 0 &&
      maxKelvin !== null &&
      maxKelvin >= minKelvin &&
      ranges.push({
        key: 'color_temp_kelvin',
        label: '色温 K',
        min: minKelvin,
        max: maxKelvin,
        step: 1,
        value: haNumber(attributes.color_temp_kelvin) ?? minKelvin,
      }),
    ranges
  )
}
function extraRangeCommand(item: any, commandState: any, key: any, rawValue: any) {
  const commandLiveState = commandState?.newState || commandState,
    range = extraRanges(item.entityId, commandLiveState).find((candidate) => candidate.key === key),
    numericValue = haNumber(rawValue)
  if (
    !entityUsable(item.entityId, commandLiveState) ||
    item.type !== 'switch' ||
    !range ||
    numericValue === null ||
    numericValue < range.min ||
    numericValue > range.max
  )
    throw new Error('设备不支持此调节或数值超出范围')
  const entityDomain = item.entityId.split('.')[0]
  return entityDomain === 'light' && key === 'brightness' && numericValue === 0
    ? {
        entityId: item.entityId,
        domain: entityDomain,
        service: 'turn_off',
        data: {},
        deviceKind: 'purifier-extra',
      }
    : {
        entityId: item.entityId,
        domain: entityDomain,
        service: entityDomain === 'fan' ? 'set_percentage' : 'turn_on',
        data: {
          [key]: numericValue,
        },
        deviceKind: 'purifier-extra',
      }
}
/** 命令 data 按控件类型择一携带 option/value，运行时动态挂载，故字段全部可选。 */
type PurifierCommandData = { option?: any; value?: any }
/** 面板视图模型由调用方 update() 注入：字段是运行时状态袋，按实际访问到的键显式列出并全部可选。 */
type PurifierExtrasViewModel = {
  item?: any
  editing?: any
  states?: any
  /** 实体 → HA 显示精度（`number-formats` 通道）。 */
  numberFormats?: Record<string, number>
}
/** 卡片运行时状态袋：除建卡时的固定字段外，卡片在渲染/交互过程中还会挂上description/submit/menu/choices/confirm/ranges 等成员，故按实际访问到的键显式列出并全部可选。 */
type PurifierCard = {
  item?: any
  section?: any
  title?: any
  status?: any
  error?: any
  control?: any
  pending?: boolean
  description?: any
  submit?: any
  expected?: any
  timer?: any
  menu?: any
  choices?: any
  confirm?: any
  ranges?: any[]
  rangePending?: boolean
  rangeExpected?: any
  rangeTimer?: any
  native?: any
  nativeRoot?: any
  /** 0.8.1：状态类卡片（NAS 指标）的百分比条。 */
  presentationBar?: HTMLElement | null
}
function numberConstraints(state: any) {
  const attributes = attributesOf(state)
  return {
    min: haNumber(attributes.min),
    max: haNumber(attributes.max),
    step: haNumber(Object.hasOwn(attributes, 'step') ? attributes.step : 1),
  }
}
function extraCommand(controlItem: any, controlState: any, controlValue: any) {
  const controlLiveState = controlState?.newState || controlState
  if (!entityUsable(controlItem.entityId, controlLiveState)) throw new Error('该实体当前不可用')
  if (
    !extraTypes(controlItem.entityId).includes(controlItem.type) ||
    ['state', 'panel', 'picture'].includes(controlItem.type)
  )
    throw new Error('不支持此操作')
  const controlDomain = controlItem.entityId.split('.')[0],
    controlAttributes = attributesOf(controlLiveState),
    data: PurifierCommandData = {}
  let service
  if (
    (controlItem.type === 'switch' && (service = controlLiveState.state === 'on' ? 'turn_off' : 'turn_on'),
    controlItem.type === 'switch' &&
      controlDomain === 'fan' &&
      (!['on', 'off'].includes(controlLiveState.state) ||
        !fanCapabilities(controlAttributes)[service === 'turn_on' ? 'canTurnOn' : 'canTurnOff']))
  )
    throw new Error('设备不支持此开关操作')
  if (
    (controlItem.type === 'button' && (service = controlDomain === 'scene' ? 'turn_on' : 'press'),
    controlItem.type === 'select')
  ) {
    if (!stringOptions(controlAttributes.options).includes(controlValue)) throw new Error('选项已失效')
    ;(service = 'select_option'), (data.option = controlValue)
  }
  if (controlItem.type === 'number') {
    const { min: min, max: max, step: step } = numberConstraints(controlLiveState),
      numeric = haNumber(controlValue)
    if (
      numeric === null ||
      min === null ||
      max === null ||
      step === null ||
      step <= 0 ||
      min > max ||
      numeric < min ||
      numeric > max
    )
      throw new Error('数值超出设备范围')
    if (Math.abs((numeric - min) / step - Math.round((numeric - min) / step)) > 0.00001)
      throw new Error('数值不符合设备步长')
    ;(service = 'set_value'), (data.value = numeric)
  }
  return {
    entityId: controlItem.entityId,
    domain: controlDomain,
    service: service,
    data: data,
    deviceKind: 'purifier-extra',
  }
}
function extraLayout(controls: any) {
  return controls.map(({ label: label, ...rest }: any) => ({
    ...rest,
    type: extraTypes(rest.entityId)[0],
    columns: [1, 2, 3, 4].includes(rest.columns)
      ? rest.columns
      : extraTypes(rest.entityId)[0] === 'picture'
        ? 2
        : ['select', 'number'].includes(extraTypes(rest.entityId)[0])
          ? 1
          : 3,
    rows: rest.rows === 2 ? 2 : 1,
  }))
}
function moveExtra(controlList: any, movedEntityId: any, targetPositionEntityId: any) {
  const currentLayout = extraLayout(controlList),
    fromIndex = currentLayout.findIndex((layoutItem: any) => layoutItem.entityId === movedEntityId),
    toIndex = currentLayout.findIndex((candidateItem: any) => candidateItem.entityId === targetPositionEntityId)
  if (fromIndex < 0 || toIndex < 0) return currentLayout
  const [moved] = currentLayout.splice(fromIndex, 1)
  return (currentLayout.splice(toIndex, 0, moved), currentLayout)
}
const purifierResizeLiveRegions = new WeakMap<Document, HTMLElement>()
/**
 * 每个 document 一个隐藏 live region，用于播报「已到最大宽度 / 已到内容最小高度」等拖拽缩放边界。
 * 复用一个节点可避免每次重建面板都往 `body` 里塞新的 `<p>`。
 */
function purifierResizeLiveRegion(doc: Document): HTMLElement {
  const existing = purifierResizeLiveRegions.get(doc)
  if (existing?.isConnected) return existing
  const liveElement = doc.createElement('p')
  ;(liveElement.className = 'i3d-extra-resize-live'),
    liveElement.setAttribute('aria-live', 'polite'),
    liveElement.setAttribute('aria-atomic', 'true')
  ;(doc.body || doc.documentElement).append(liveElement)
  purifierResizeLiveRegions.set(doc, liveElement)
  return liveElement
}
export function createPurifierExtras({
  element: hostElement,
  onControl: onControl,
  feedbackSlot = undefined,
  onLayout = (..._args: any[]) => {},
  // 0.8.1：NAS 等「状态类」卡片由调用方决定状态文案与进度条（`nasMetricValue`）。
  statePresentation = null as
    | null
    | ((
        item: unknown,
        state: unknown,
        numberFormat: number | null,
      ) => { text: string; available?: boolean; warning?: boolean; percent?: number | null }),
  // 0.8.1：拖拽时的自动滚动容器；缺省回落到弹窗体/灯光面板。
  scrollContainer = null as HTMLElement | null,
}: any) {
  const doc = hostElement.ownerDocument || globalThis.document
  // 拖拽缩放的边界播报（0.7.9 `purifier-extras.js` 的隐藏 live region）：
  // 视觉提示由 ghost 承担，屏幕阅读器需要独立节点，且不能污染 `i3d-climate-error` 的报错。
  const resizeLiveElement = purifierResizeLiveRegion(doc)
  let viewModel: PurifierExtrasViewModel = {},
    layoutSignature = '',
    // 0.8.1：面板可见性；隐藏期间跳过重排，重新可见时按最新 viewModel 重算。
    isVisible = true,
    cards: any = [],
    generation = 0,
    dragState: any = null,
    resizeLiveTimer: any = null,
    selectedEntityId: any = null
  const createEl = (tag: any, text = '') => domElement(doc, tag, '', text)
  let openSelect: any = null,
    rafId: any = null
  function closeSelect(restoreFocus = false) {
    if (!openSelect) return
    const current = openSelect
    ;(openSelect = null),
      rafId != null && doc.defaultView?.cancelAnimationFrame?.(rafId),
      (rafId = null),
      current.menu.hidePopover?.(),
      (current.menu.hidden = true),
      current.portal && (current.section.append(current.menu), (current.portal = false)),
      current.control.setAttribute('aria-expanded', 'false'),
      restoreFocus &&
        current.control.focus?.({
          preventScroll: true,
        })
  }
  const onDocumentPointerDown = (event: any) => {
      openSelect &&
        !openSelect.section.contains?.(event.target) &&
        !openSelect.menu.contains?.(event.target) &&
        closeSelect()
    },
    onDocumentScroll = (scrollEvent: any) => {
      openSelect && !openSelect.menu.contains?.(scrollEvent.target) && closeSelect()
    }
  doc.addEventListener?.('pointerdown', onDocumentPointerDown), doc.addEventListener?.('scroll', onDocumentScroll, true)
  function measureElement(element: any) {
    const nodeRect = element.getBoundingClientRect(),
      nodeStyle = doc.defaultView?.getComputedStyle?.(element),
      resolveBoxSize = (prop: any, fallback: any) => {
        let size = parseFloat(nodeStyle?.[prop])
        if (size > 0 && nodeStyle.boxSizing === 'content-box') {
          const sides = prop === 'width' ? ['Left', 'Right'] : ['Top', 'Bottom']
          for (const side of sides)
            size +=
              (parseFloat(nodeStyle['padding' + side]) || 0) + (parseFloat(nodeStyle['border' + side + 'Width']) || 0)
        }
        return size > 0 ? size : fallback
      },
      measuredWidth = resolveBoxSize('width', element.offsetWidth || nodeRect.width || 1),
      measuredHeight = resolveBoxSize('height', element.offsetHeight || nodeRect.height || 1)
    return {
      rect: nodeRect,
      width: measuredWidth,
      height: measuredHeight,
      sx: nodeRect.width / measuredWidth || 1,
      sy: nodeRect.height / measuredHeight || 1,
    }
  }
  function positionSelectMenu() {
    if (!openSelect) return
    const { rect: controlRect, width: controlWidth, sx: scaleX, sy: scaleY } = measureElement(openSelect.control),
      menu = openSelect.menu,
      win = doc.defaultView,
      stageRect = hostElement.closest?.('.interaction3d-stage')?.getBoundingClientRect(),
      viewportLeft = Math.max(0, stageRect?.left || 0) + 8,
      viewportTop = Math.max(0, stageRect?.top || 0) + 8,
      viewportRight = Math.min(win?.innerWidth || 1024, stageRect?.right ?? Infinity) - 8,
      viewportBottom = Math.min(win?.innerHeight || 768, stageRect?.bottom ?? Infinity) - 8,
      menuWidth = Math.min(controlWidth, Math.max(0, viewportRight - viewportLeft) / scaleX)
    Object.assign(menu.style, {
      width: menuWidth + 'px',
      bottom: 'auto',
      transformOrigin: '0 0',
      transform: 'scale(' + scaleX + ',' + scaleY + ')',
    })
    const menuStyle = win?.getComputedStyle?.(menu),
      borderHeight = (parseFloat(menuStyle?.borderTopWidth) || 0) + (parseFloat(menuStyle?.borderBottomWidth) || 0),
      menuHeight = Math.min(260, (menu.scrollHeight || openSelect.choices.length * 42 + 12) + borderHeight) * scaleY,
      spaceBelow = Math.max(0, viewportBottom - controlRect.bottom - 4 * scaleY),
      spaceAbove = Math.max(0, controlRect.top - viewportTop - 4 * scaleY),
      preferAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow,
      availableHeight = Math.min(Math.max(0, viewportBottom - viewportTop), preferAbove ? spaceAbove : spaceBelow),
      maxHeight = Math.min(menuHeight, availableHeight)
    ;(menu.style.maxHeight = Math.min(260, availableHeight / scaleY) + 'px'),
      (menu.style.left = Math.max(viewportLeft, Math.min(controlRect.left, viewportRight - menuWidth * scaleX)) + 'px'),
      (menu.style.top =
        Math.max(
          viewportTop,
          Math.min(
            preferAbove ? controlRect.top - 4 * scaleY - maxHeight : controlRect.bottom + 4 * scaleY,
            viewportBottom - maxHeight,
          ),
        ) + 'px')
  }
  function tickPosition() {
    if (((rafId = null), !!openSelect)) {
      if (doc.hidden) {
        closeSelect()
        return
      }
      positionSelectMenu(), (rafId = doc.defaultView?.requestAnimationFrame?.(tickPosition) ?? null)
    }
  }
  const defaultView = doc.defaultView
  defaultView?.addEventListener?.('resize', positionSelectMenu)
  function openSelectMenu(record: any) {
    if (record.control.disabled) return
    if (openSelect === record) {
      closeSelect(true)
      return
    }
    closeSelect(),
      (openSelect = record),
      !record.menu.showPopover &&
        doc.body &&
        ((record.menu.dataset.theme = hostElement.closest?.('[data-scene-style]')?.dataset.sceneStyle || ''),
        doc.body.append(record.menu),
        (record.portal = true)),
      (record.menu.hidden = false),
      record.control.setAttribute('aria-expanded', 'true'),
      positionSelectMenu(),
      record.menu.showPopover?.(),
      tickPosition(),
      (
        record.choices.find((choiceOption: any) => choiceOption.value === record.control.value) || record.choices[0]
      )?.focus?.({
        preventScroll: true,
      })
  }
  const COLUMN_SPAN = {
      3: 2,
      4: 4,
      1: 3,
      2: 6,
    },
    COLUMN_ORDER = [3, 1, 4, 2]
  function fitLayout(cardParams: any, entry = cardParams.item) {
    const gridWidth = hostElement.clientWidth,
      minRows = cardParams.ranges?.length
        ? 1 + cardParams.ranges.length
        : ['select', 'number'].includes(entry.type)
          ? 2
          : 1
    if (!gridWidth)
      return {
        ...entry,
        rows: Math.max(entry.rows, minRows),
      }
    const nativeKind = nativeExtraKind(entry.entityId, readState(entry.entityId)),
      cardMinWidth =
        entry.type === 'picture'
          ? 96
          : nativeKind
            ? nativeExtraMinimumWidth(entry.entityId, readState(entry.entityId))
            : 64,
      neededSpan = (COLUMN_SPAN as any)[entry.columns],
      rangeMinSpan = cardParams.ranges?.length || nativeKind === 'light' ? 3 : 2,
      span =
        [2, 3, 4, 6].find(
          (spanCandidate) =>
            spanCandidate >= neededSpan &&
            spanCandidate >= rangeMinSpan &&
            ((gridWidth + 8) * spanCandidate) / 6 - 8 >= cardMinWidth,
        ) || 6
    return {
      ...entry,
      columns: COLUMN_ORDER.find((columnCandidate) => (COLUMN_SPAN as any)[columnCandidate] === span),
      rows: Math.max(entry.rows, minRows, cardMinWidth > gridWidth ? 2 : 1),
    }
  }
  function measureRows(measureRecord: any, rowCount: any) {
    const rowStyle = doc.defaultView?.getComputedStyle?.(measureRecord.section)
    if (!rowStyle) return rowCount
    const toPx = (cssValue: any) => Number.parseFloat(cssValue) || 0,
      measured = (fieldNode: any) => (fieldNode && !fieldNode.hidden && fieldNode.offsetHeight) || 0,
      gap = toPx(rowStyle.rowGap),
      descriptionHeight = measured(measureRecord.description),
      controlHeight = measured(measureRecord.control),
      nativeHeight = measured(measureRecord.nativeRoot)
    let content = nativeHeight
      ? descriptionHeight + nativeHeight + (descriptionHeight && nativeHeight ? gap : 0)
      : ['select', 'number'].includes(measureRecord.item.type)
        ? descriptionHeight + controlHeight + (descriptionHeight && controlHeight ? gap : 0)
        : Math.max(descriptionHeight, controlHeight)
    for (const extraRange of measureRecord.ranges || []) content += measured(extraRange.label) + gap
    for (const field of [measureRecord.confirm, measureRecord.error]) {
      const fieldHeight = measured(field)
      fieldHeight && (content += gap + fieldHeight)
    }
    return (
      (content +=
        toPx(rowStyle.paddingTop) +
        toPx(rowStyle.paddingBottom) +
        toPx(rowStyle.borderTopWidth) +
        toPx(rowStyle.borderBottomWidth)),
      Math.max(rowCount, Math.ceil((content + 8) / 44))
    )
  }
  function syncCardMetrics(metricsRecord: any) {
    if (dragState) return
    const fitted = fitLayout(metricsRecord),
      nextColumns = String((COLUMN_SPAN as any)[fitted.columns]),
      nextRows = String(measureRows(metricsRecord, fitted.rows))
    // ResizeObserver 会因自身写入再次触发；值没变就别碰 DOM，避免无限抖动。
    metricsRecord.section.style.getPropertyValue('--extra-columns') !== nextColumns &&
      metricsRecord.section.style.setProperty('--extra-columns', nextColumns)
    metricsRecord.section.style.getPropertyValue('--extra-rows') !== nextRows &&
      metricsRecord.section.style.setProperty('--extra-rows', nextRows)
  }
  const resizeObserver =
    typeof ResizeObserver == 'function'
      ? new ResizeObserver(() => {
          cards.forEach(syncCardMetrics), positionSelectMenu()
        })
      : null
  resizeObserver?.observe(hostElement)
  function applyLayout(layoutItems: any) {
    layoutItems.forEach((itemEntry: any, index: any) => {
      const matchingRecord = cards.find((matchingCard: any) => matchingCard.item.entityId === itemEntry.entityId)
      if (!matchingRecord) return
      const itemFitted = fitLayout(matchingRecord, itemEntry)
      ;(matchingRecord.section.style.order = index),
        matchingRecord.section.style.setProperty('--extra-columns', (COLUMN_SPAN as any)[itemFitted.columns]),
        matchingRecord.section.style.setProperty('--extra-rows', measureRows(matchingRecord, itemFitted.rows))
    })
  }
  /** 屏幕阅读器播报：拖拽缩放走到边界（与键盘缩放同一套文案）。 */
  function clearResizeLive() {
    clearTimeout(resizeLiveTimer), (resizeLiveTimer = null), (resizeLiveElement.textContent = '')
  }
  function announceResizeLimit(message: string) {
    clearTimeout(resizeLiveTimer),
      (resizeLiveTimer = null),
      resizeLiveElement.textContent !== message && (resizeLiveElement.textContent = message),
      (resizeLiveTimer = setTimeout(clearResizeLive, 2000)),
      resizeLiveTimer?.unref?.()
  }
  function finishDrag(cancelled = false) {
    if (!dragState) return
    const drag = dragState
    drag.resize && clearResizeLive(),
      (dragState = null),
      clearTimeout(drag.timer),
      drag.ghost?.remove?.(),
      drag.section.classList.toggle('is-dragging', false),
      // 排序时被拖动的那张卡是「占位」（透明），拖拽结束要还原。
      drag.section.classList.toggle('is-sort-placeholder', false),
      cards.forEach((otherCard: any) => otherCard.section.classList.toggle('is-drop-target', false))
    const freshLayout = extraLayout(viewModel.item.extraControls),
      appliedLayout =
        !cancelled && drag.active && !drag.resize && drag.lastTarget
          ? moveExtra(drag.layout, drag.item.entityId, drag.lastTarget)
          : drag.layout
    applyLayout(cancelled ? freshLayout : appliedLayout),
      (cancelled || !drag.active) && cards.forEach(syncCardMetrics),
      drag.handle.hasPointerCapture?.(drag.pointerId) && drag.handle.releasePointerCapture(drag.pointerId),
      !cancelled &&
        drag.active &&
        viewModel.editing &&
        JSON.stringify(appliedLayout) !== JSON.stringify(freshLayout) &&
        onLayout(appliedLayout)
  }
  const onEscapeKeydown = (escapeEvent: any) => {
    escapeEvent.key === 'Escape' &&
      dragState &&
      (escapeEvent.preventDefault(), escapeEvent.stopPropagation(), finishDrag(true))
  }
  doc.addEventListener?.('keydown', onEscapeKeydown, true)
  function bindDrag(handle: any, section: any, dragItem: any, resize: any) {
    handle.addEventListener('pointerdown', (pointerEvent: any) => {
      if (!viewModel.editing || (pointerEvent.button != null && pointerEvent.button !== 0)) return
      ;(pointerEvent.pointerType !== 'touch' || resize) && pointerEvent.preventDefault(),
        pointerEvent.stopPropagation(),
        finishDrag(true),
        (selectedEntityId = dragItem.entityId),
        cards.forEach((selectionCard: any) =>
          selectionCard.section.classList.toggle('is-selected', selectionCard.item.entityId === dragItem.entityId),
        ),
        handle.focus?.({
          preventScroll: true,
        }),
        (pointerEvent.pointerType !== 'touch' || resize) && handle.setPointerCapture(pointerEvent.pointerId)
      const metrics = measureElement(section),
        sectionRect = metrics.rect,
        gridRect = measureElement(hostElement),
        scroller = hostElement.closest?.('.i3d-light-panel')
      ;(dragState = {
        handle: handle,
        section: section,
        item: dragItem,
        resize: resize,
        pointerId: pointerEvent.pointerId,
        x: pointerEvent.clientX,
        y: pointerEvent.clientY,
        rect: sectionRect,
        grid: gridRect,
        metrics: metrics,
        scroller: scroller,
        scrollTop: scroller?.scrollTop || 0,
        active: false,
        layout: extraLayout(viewModel.item.extraControls),
        touchReady: resize || pointerEvent.pointerType !== 'touch',
        targets: cards.map((targetCard: any) => ({
          row: targetCard,
          rect: targetCard.section.getBoundingClientRect(),
        })),
      }),
        dragState.touchReady ||
          (dragState.timer = setTimeout(() => {
            dragState?.handle === handle && ((dragState.touchReady = true), section.classList.add('is-dragging'))
          }, 300))
    }),
      handle.addEventListener(
        'touchmove',
        (touchEvent: any) => {
          dragState?.handle === handle && dragState.touchReady && touchEvent.preventDefault()
        },
        {
          passive: false,
        },
      ),
      handle.addEventListener('pointermove', (moveEvent: any) => {
        const gesture = dragState
        if (!gesture || gesture.handle !== handle || moveEvent.pointerId !== gesture.pointerId) return
        const deltaX = moveEvent.clientX - gesture.x,
          deltaY = moveEvent.clientY - gesture.y
        if (!gesture.touchReady) {
          Math.hypot(deltaX, deltaY) > 6 && finishDrag(true)
          return
        }
        if (
          (gesture.handle.hasPointerCapture?.(moveEvent.pointerId) ||
            gesture.handle.setPointerCapture?.(moveEvent.pointerId),
          !gesture.active && Math.hypot(deltaX, deltaY) < 6)
        )
          return
        moveEvent.preventDefault(), (gesture.active = true), section.classList.toggle('is-dragging', true)
        const dragScrollContainer =
          scrollContainer || hostElement.closest?.('.i3d-popup-body') || hostElement.closest?.('.i3d-light-panel')
        if (dragScrollContainer) {
          const scrollBounds = dragScrollContainer.getBoundingClientRect()
          moveEvent.clientY > scrollBounds.bottom - 32
            ? (dragScrollContainer.scrollTop += 12)
            : moveEvent.clientY < scrollBounds.top + 32 && (dragScrollContainer.scrollTop -= 12)
        }
        gesture.ghost ||
          ((gesture.ghost = createEl('div')),
          // 两种拖拽用两套外观（0.9.0 同口径）：缩放是「虚线尺寸框」，排序是「卡片形状的影子」。
          // 类名分开，样式才不会互相打架（`.is-size-outline` 会把 padding/背景改成半透明）。
          (gesture.ghost.className = resize ? 'i3d-extra-gesture-hint' : 'i3d-extra-sort-ghost'),
          (doc.body || hostElement).append(gesture.ghost))
        const { sx: dragScaleX, sy: dragScaleY } = gesture.metrics
        if (
          (Object.assign(gesture.ghost.style, {
            left: moveEvent.clientX + 12 * dragScaleX + 'px',
            top: moveEvent.clientY + 12 * dragScaleY + 'px',
            transformOrigin: '0 0',
            transform: 'scale(' + dragScaleX + ',' + dragScaleY + ')',
          }),
          resize)
        ) {
          const targetWidth = gesture.metrics.width + deltaX / dragScaleX,
            snappedColumns = COLUMN_ORDER.reduce(
              (best, orderCandidate) =>
                Math.abs(((gesture.grid.width + 8) * (COLUMN_SPAN as any)[orderCandidate]) / 6 - 8 - targetWidth) <
                Math.abs(((gesture.grid.width + 8) * (COLUMN_SPAN as any)[best]) / 6 - 8 - targetWidth)
                  ? orderCandidate
                  : best,
              gesture.item.columns,
            ),
            snappedRows = ['select', 'number'].includes(dragItem.type)
              ? 2
              : Math.abs(deltaY / dragScaleY) < 12
                ? gesture.item.rows
                : gesture.metrics.height + deltaY / dragScaleY >= 58
                  ? 2
                  : 1,
            dragRecord = cards.find((draggedCard: any) => draggedCard.section === section),
            snappedItem = fitLayout(dragRecord, {
              ...dragItem,
              columns: snappedColumns,
              rows: snappedRows,
            })
          ;(gesture.layout = extraLayout(viewModel.item.extraControls).map((layoutCandidate: any) =>
            layoutCandidate.entityId === dragItem.entityId ? snappedItem : layoutCandidate,
          )),
            (gesture.ghost.textContent =
              (
                {
                  3: '1/3 行',
                  4: '2/3 行',
                  1: '半行',
                  2: '整行',
                } as any
              )[snappedItem.columns] +
              ' · ' +
              (snappedItem.rows === 1 ? '36' : '80') +
              'px' +
              (snappedItem.columns !== snappedColumns ? '（内容最小宽度）' : '')),
            gesture.ghost.classList.add('is-size-outline'),
            (gesture.ghost.style.left = gesture.rect.left + 'px'),
            (gesture.ghost.style.top = gesture.rect.top + 'px'),
            (gesture.ghost.style.width =
              ((gesture.grid.width + 8) * (COLUMN_SPAN as any)[snappedItem.columns]) / 6 - 8 + 'px'),
            (gesture.ghost.style.height = 44 * snappedItem.rows - 8 + 'px')
          // 0.7.9 的拖拽缩放边界播报：宽度/高度贴边时把命中项合并成一条播报。
          const columnWidth = (columns: any) => ((gesture.grid.width + 8) * (COLUMN_SPAN as any)[columns]) / 6 - 8,
            minimumItem = fitLayout(dragRecord, {
              ...dragItem,
              columns: COLUMN_ORDER[0],
              rows: 1,
            }),
            currentWidth = columnWidth(snappedItem.columns),
            currentHeight = gesture.metrics.height + deltaY / dragScaleY,
            maximumHeight = 44 * measureRows(dragRecord, 2) - 8,
            minimumHeight = 44 * measureRows(dragRecord, 1) - 8,
            hitLimits: string[] = []
          currentWidth > gesture.grid.width + 6 && hitLimits.push('已到最大宽度'),
            currentWidth < columnWidth(minimumItem.columns) - 6 &&
              hitLimits.push(snappedItem.columns !== dragItem.columns ? '已到内容最小宽度' : '已到最小宽度'),
            currentHeight > maximumHeight + 6 && hitLimits.push('已到最大高度'),
            currentHeight < minimumHeight - 6 &&
              hitLimits.push(minimumHeight > 36 ? '已到内容最小高度' : '已到最小高度'),
            hitLimits.length
              ? announceResizeLimit((dragRecord?.title?.textContent || '') + '：' + hitLimits.join('，'))
              : clearResizeLive()
        } else {
          const scrollDeltaY = ((gesture.scroller?.scrollTop || 0) - gesture.scrollTop) * dragScaleY,
            nearestTarget = gesture.targets.reduce((closestTarget: any, candidateTarget: any) => {
              const targetRect = candidateTarget.rect,
                distance = Math.hypot(
                  targetRect.left + targetRect.width / 2 - moveEvent.clientX,
                  targetRect.top - scrollDeltaY + targetRect.height / 2 - moveEvent.clientY,
                )
              return !closestTarget || distance < closestTarget.distance
                ? {
                    ...candidateTarget,
                    distance: distance,
                  }
                : closestTarget
            }, null)
          ;(gesture.lastTarget = nearestTarget?.row.item.entityId),
            cards.forEach((dropCard: any) =>
              dropCard.section.classList.toggle(
                'is-drop-target',
                dropCard === nearestTarget?.row && dropCard.section !== section,
              ),
            )
          const sourceRecord = cards.find((sourceCard: any) => sourceCard.section === section)
          // 0.9.0：排序时把被拖动的那张卡变成「占位」（子节点透明、卡片无底色），
          // 这样网格里看得见「它原来的位置空着」，而不是卡片跟着指针走、原位仍留在那儿。
          section.classList.toggle('is-sort-placeholder', true)
          // 影子按卡片形状显示：边框 + 卡片宽度，与落点位置视觉对齐（不是一句小标签）。
          Object.assign(gesture.ghost.style, {
            left: gesture.rect.left + 'px',
            top: gesture.rect.top - ((gesture.scroller?.scrollTop || 0) - gesture.scrollTop) * dragScaleY + 'px',
            width: gesture.rect.width + 'px',
          })
          gesture.ghost.textContent =
            (sourceRecord?.title.textContent || '附加功能') + ' → ' + (nearestTarget?.row.title.textContent || '原位置')
        }
      }),
      handle.addEventListener('pointerup', () => finishDrag(false)),
      handle.addEventListener('pointercancel', () => finishDrag(true)),
      handle.addEventListener('lostpointercapture', () => finishDrag(true))
  }
  function readState(trackedEntityId: any) {
    const stateEntry = viewModel.states?.[trackedEntityId]
    return stateEntry?.newState || stateEntry
  }
  function refreshRows() {
    for (const row of cards) {
      const entityState = readState(row.item.entityId),
        stateAttributes = attributesOf(entityState),
        available = entityUsable(row.item.entityId, entityState)
      if (
        (row.pending &&
          row.expected != null &&
          String(entityState?.state) === String(row.expected) &&
          (clearTimeout(row.timer), (row.pending = false), (row.expected = null), (row.error.textContent = '')),
        row.pending &&
          !available &&
          (clearTimeout(row.timer),
          (row.pending = false),
          (row.expected = null),
          (row.error.textContent = '设备已离线')),
        (row.title.textContent = row.item.label || stateAttributes.friendly_name || row.item.entityId),
        (row.title.title = row.title.textContent),
        row.presentationBar
          ? // 0.8.1：状态类卡片（NAS 指标）由调用方给出文案、告警与百分比条。
            (() => {
              const presentation = statePresentation(
                row.item,
                entityState,
                (viewModel.numberFormats || {})[row.item.entityId] ?? null,
              )
              ;(row.status.textContent = presentation.text),
                row.section.classList.toggle('is-warning', !!presentation.warning),
                row.section.classList.toggle('is-unavailable', presentation.available === false),
                (row.presentationBar.hidden = presentation.percent == null),
                (row.presentationBar.style.width = (presentation.percent ?? 0) + '%')
            })()
          : (row.status.textContent = available
              ? '' +
                extraStateLabel(row.item.entityId, entityState, (viewModel.numberFormats || {})[row.item.entityId]) +
                (stateAttributes.unit_of_measurement ? ' ' + stateAttributes.unit_of_measurement : '')
              : '不可用'),
        (row.status.hidden =
          !!available &&
          (row.item.type === 'select' || (row.item.type === 'number' && !stateAttributes.unit_of_measurement))),
        row.native &&
          ((row.status.hidden = true),
          row.native.update({
            item: {
              id: viewModel.item?.id,
              entityId: row.item.entityId,
              label: row.title.textContent,
              modelAvailable: viewModel.item?.modelAvailable,
            },
            state: entityState,
            states: viewModel.states || {},
            editing: !!viewModel.editing,
            numberFormats: viewModel.numberFormats || {},
          }),
          syncCardMetrics(row)),
        row.native || !row.control)
      ) {
        syncCardMetrics(row)
        continue
      }
      if (
        ((row.control.disabled = !!(viewModel.editing || row.pending || !available)),
        row.item.type === 'switch' &&
          ((row.control.textContent = entityState?.state === 'on' ? '已开启' : '已关闭'),
          row.control.setAttribute('role', 'switch'),
          row.control.setAttribute('aria-checked', String(entityState?.state === 'on')),
          row.control.setAttribute('aria-pressed', String(entityState?.state === 'on'))),
        row.item.type === 'switch' &&
          row.item.entityId.startsWith('fan.') &&
          (row.control.disabled ||=
            !fanCapabilities(stateAttributes)[entityState?.state === 'on' ? 'canTurnOff' : 'canTurnOn']),
        row.item.type === 'select')
      ) {
        const options = stringOptions(stateAttributes.options)
        row.options !== JSON.stringify(options) &&
          (openSelect === row && closeSelect(),
          (row.options = JSON.stringify(options)),
          (row.choices = options.map((optionText) => {
            const button = createEl('button', optionText)
            return (
              (button.type = 'button'),
              (button.value = optionText),
              button.setAttribute('role', 'option'),
              button.addEventListener('click', () => {
                row.control.disabled || (closeSelect(true), (row.control.value = optionText), row.submit())
              }),
              button
            )
          })),
          row.menu.replaceChildren(...row.choices)),
          (row.control.value = row.pending && row.expected != null ? row.expected : available ? entityState.state : ''),
          (row.control.disabled ||= !options.length),
          (row.control.textContent =
            row.pending && row.expected != null ? String(row.expected) : available ? entityState.state : '不可用')
        for (const choiceButton of row.choices)
          choiceButton.setAttribute('aria-selected', String(choiceButton.value === row.control.value))
        row.control.disabled && openSelect === row && closeSelect()
      }
      if (row.item.type === 'number') {
        const { min: min, max: max, step: step } = numberConstraints(entityState)
        ;(row.control.min = min ?? ''),
          (row.control.max = max ?? ''),
          (row.control.step = step ?? ''),
          doc.activeElement !== row.control &&
            (row.control.value =
              row.pending && row.expected != null ? row.expected : available ? entityState.state : ''),
          (row.control.disabled ||= min === null || max === null || min > max || step === null || step <= 0)
      }
      for (const rangeEntry of row.ranges || []) {
        const rangeInfo = extraRanges(row.item.entityId, entityState).find(
          (rangeCandidate) => rangeCandidate.key === rangeEntry.key,
        )
        row.rangeExpected?.key === rangeEntry.key &&
          (Math.abs((rangeInfo?.value ?? Infinity) - row.rangeExpected.value) < 1 || !available) &&
          (clearTimeout(row.rangeTimer),
          (row.rangePending = false),
          (row.rangeExpected = null),
          (row.error.textContent = available ? '' : '实体已离线，调节结果未确认')),
          (rangeEntry.input.disabled = !!(viewModel.editing || row.rangePending || !available || !rangeInfo)),
          rangeInfo &&
            doc.activeElement !== rangeEntry.input &&
            ((rangeEntry.input.value = String(
              row.rangeExpected?.key === rangeEntry.key ? row.rangeExpected.value : rangeInfo.value,
            )),
            syncHtmlRangeProgress(rangeEntry.input)),
          (rangeEntry.output.textContent = rangeInfo ? rangeInfo.label + ' ' + rangeInfo.value : '')
      }
      syncCardMetrics(row)
    }
  }
  function update(nextViewModel: any) {
    viewModel = nextViewModel
    // 0.8.1：面板不可见（弹窗未展示）时不重排卡片，避免隐藏状态下的无谓布局与测量。
    if (!isVisible) return
    const layout = extraLayout(nextViewModel.item?.extraControls || []),
      signature = JSON.stringify([
        nextViewModel.item?.id,
        layout,
        layout.map((layoutEntry: any) =>
          extraRanges(layoutEntry.entityId, readState(layoutEntry.entityId)).map(
            ({ value: optionValue, ...restEntry }) => restEntry,
          ),
        ),
        !!nextViewModel.editing,
      ])
    if (((hostElement.hidden = !layout.length), signature !== layoutSignature)) {
      closeSelect(),
        finishDrag(true),
        resizeObserver?.disconnect(),
        resizeObserver?.observe(hostElement),
        cards.forEach((staleCard: any) => {
          clearTimeout(staleCard.timer), clearTimeout(staleCard.rangeTimer), staleCard.native?.dispose?.()
        }),
        (layoutSignature = signature),
        generation++,
        hostElement.replaceChildren(),
        (cards = [])
      for (const control of layout) {
        const cardSection = createEl('section')
        if (
          ((cardSection.className = 'i3d-climate-option-group i3d-extra-card i3d-extra-' + control.type),
          cardSection.style.setProperty('--extra-columns', (COLUMN_SPAN as any)[control.columns]),
          cardSection.style.setProperty('--extra-rows', control.rows),
          nextViewModel.editing)
        ) {
          const dragHandle = createEl('button', '⠿')
          ;(dragHandle.type = 'button'),
            (dragHandle.className = 'i3d-extra-drag'),
            dragHandle.setAttribute('aria-label', '调整顺序 ' + control.entityId),
            (dragHandle.title = '拖动排序，方向键移动，Esc取消'),
            cardSection.classList.toggle('is-selected', selectedEntityId === control.entityId),
            cardSection.addEventListener('click', () => {
              ;(selectedEntityId = control.entityId),
                cards.forEach((listCard: any) =>
                  listCard.section.classList.toggle('is-selected', listCard.section === cardSection),
                )
            }),
            bindDrag(dragHandle, cardSection, control, false),
            bindDrag(cardSection, cardSection, control, false),
            dragHandle.addEventListener('keydown', (dragKeyEvent: any) => {
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(dragKeyEvent.key)) return
              dragKeyEvent.preventDefault()
              const controlIndex = layout.findIndex((controlEntry: any) => controlEntry.entityId === control.entityId),
                neighbour = layout[controlIndex + (['ArrowLeft', 'ArrowUp'].includes(dragKeyEvent.key) ? -1 : 1)]
              neighbour && onLayout(moveExtra(layout, control.entityId, neighbour.entityId))
            })
          const resizeHandle = createEl('button', '↘')
          ;(resizeHandle.type = 'button'),
            (resizeHandle.className = 'i3d-extra-resize'),
            resizeHandle.setAttribute('aria-label', '调整大小 ' + control.entityId),
            resizeHandle.setAttribute('aria-description', '拖动实时调整大小，松手保存，Esc取消，方向键调整'),
            (resizeHandle.title = '拖动调整：1/3行、2/3行、半行、整行；36/80px；Esc取消，方向键调整')
          const emitResize = (nextColumns: any, nextRows: any) => {
            viewModel.editing &&
              onLayout(
                extraLayout(
                  extraLayout(viewModel.item.extraControls).map((layoutControl: any) =>
                    layoutControl.entityId === control.entityId
                      ? {
                          ...layoutControl,
                          columns: nextColumns,
                          rows: nextRows,
                        }
                      : layoutControl,
                  ),
                ),
              )
          }
          bindDrag(resizeHandle, cardSection, control, true),
            resizeHandle.addEventListener('keydown', (resizeKeyEvent: any) => {
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(resizeKeyEvent.key)) return
              resizeKeyEvent.preventDefault()
              const resizeRecord = cards.find((resizeCard: any) => resizeCard.section === cardSection)
              if (!resizeRecord) return
              const currentItem = resizeRecord.item,
                columnIndex = COLUMN_ORDER.indexOf(currentItem.columns),
                requestedColumns =
                  resizeKeyEvent.key === 'ArrowLeft'
                    ? COLUMN_ORDER[Math.max(0, columnIndex - 1)]
                    : resizeKeyEvent.key === 'ArrowRight'
                      ? COLUMN_ORDER[Math.min(COLUMN_ORDER.length - 1, columnIndex + 1)]
                      : currentItem.columns,
                requestedRows =
                  resizeKeyEvent.key === 'ArrowUp' ? 1 : resizeKeyEvent.key === 'ArrowDown' ? 2 : currentItem.rows,
                // 方向键同样要过 `fitLayout`：内容装不下时自动放大并提示已到边界
                // （0.7.8 `purifier-extras.js` 的键盘缩放分支）。
                fittedNext = fitLayout(resizeRecord, {
                  ...currentItem,
                  columns: requestedColumns,
                  rows: requestedRows,
                }),
                fittedCurrent = fitLayout(resizeRecord, currentItem),
                fittedMinimum = fitLayout(resizeRecord, {
                  ...currentItem,
                  columns: COLUMN_ORDER[0],
                  rows: 1,
                }),
                currentHeight = measureRows(resizeRecord, fittedCurrent.rows),
                nextHeight = measureRows(resizeRecord, fittedNext.rows),
                limitMessage =
                  resizeKeyEvent.key === 'ArrowLeft' &&
                  fittedCurrent.columns === fittedNext.columns &&
                  fittedNext.columns === fittedMinimum.columns
                    ? '已到内容最小宽度'
                    : resizeKeyEvent.key === 'ArrowRight' && fittedCurrent.columns === 2
                      ? '已到最大宽度'
                      : resizeKeyEvent.key === 'ArrowUp' && currentHeight === nextHeight
                        ? '已到内容最小高度'
                        : resizeKeyEvent.key === 'ArrowDown' && currentHeight === nextHeight
                          ? '已到最大高度'
                          : ''
              emitResize(fittedNext.columns, requestedRows)
              limitMessage
                ? announceResizeLimit((resizeRecord.title.textContent || '') + '：' + limitMessage)
                : clearResizeLive()
            }),
            cardSection.append(dragHandle, resizeHandle),
            cardSection.classList.add('is-layout-editing')
        }
        const titleElement = createEl('h4'),
          statusElement = createEl('p'),
          errorElement = createEl('p')
        errorElement.setAttribute('role', 'status'), (errorElement.className = 'i3d-climate-error')
        const configuredType = extraTypes(control.entityId).includes(control.type) ? control.type : 'state',
          nativeKind = nativeExtraKind(control.entityId, readState(control.entityId)),
          controlType = nativeKind ? 'panel' : configuredType,
          controlElement =
            nativeKind || controlType === 'state'
              ? null
              : createEl(
                  controlType === 'number' ? 'input' : 'button',
                  // 场景实体不是"执行"，用户心智里是"运行场景"（0.7.8 `purifier-extras.js`）。
                  String(control.entityId).startsWith('scene.') ? '运行场景' : '执行',
                ),
          cardState: PurifierCard = {
            item: {
              ...control,
              type: controlType,
            },
            section: cardSection,
            title: titleElement,
            status: statusElement,
            error: errorElement,
            control: controlElement,
            pending: false,
          }
        cards.push(cardState)
        const descriptionElement = createEl('div')
        ;(cardState.description = descriptionElement),
          (descriptionElement.className = 'i3d-extra-description'),
          descriptionElement.append(titleElement, statusElement),
          cardSection.append(descriptionElement)
        // 0.8.1：状态类卡片追加百分比条（NAS 用量/温度等），由 `statePresentation` 提供。
        if (statePresentation && controlType === 'state') {
          const presentationBarElement = createEl('i')
          ;(cardState.presentationBar = presentationBarElement),
            (presentationBarElement.className = 'i3d-extra-state-bar'),
            cardSection.append(presentationBarElement)
        }
        if (nativeKind) {
          cardSection.classList.add('i3d-extra-native')
          const headerControlsElement = createEl('div')
          headerControlsElement.className = 'i3d-extra-header-controls'
          descriptionElement.append(headerControlsElement)
          const nativeRootElement = createEl('div')
          nativeRootElement.className = 'i3d-extra-native-root'
          cardSection.append(nativeRootElement)
          cardState.nativeRoot = nativeRootElement
          cardState.native = createNativeExtraPanel({
            element: nativeRootElement,
            headerControls: headerControlsElement,
            feedbackSlot,
            kind: nativeKind,
            onControl: onControl,
            onResize: () => syncCardMetrics(cardState),
          })
        }
        if (controlElement) {
          if (
            ((controlElement.className = 'i3d-climate-choice'),
            controlElement.setAttribute('aria-label', control.label || control.entityId),
            controlType === 'number' ? (controlElement.type = 'number') : (controlElement.type = 'button'),
            (cardState.submit = async () => {
              if (viewModel.editing || cardState.pending) return
              const generationAtSend = generation
              try {
                const command = extraCommand(cardState.item, readState(control.entityId), controlElement.value)
                if (
                  ((cardState.expected =
                    controlType === 'switch'
                      ? command.service === 'turn_on'
                        ? 'on'
                        : 'off'
                      : controlType === 'select'
                        ? command.data.option
                        : controlType === 'number'
                          ? command.data.value
                          : null),
                  (cardState.pending = true),
                  (errorElement.textContent = ''),
                  refreshRows(),
                  await onControl(command),
                  generationAtSend !== generation)
                )
                  return
                controlType === 'button'
                  ? ((cardState.pending = false), (errorElement.textContent = '指令已发送'))
                  : cardState.pending &&
                    ((errorElement.textContent = ''),
                    (cardState.timer = setTimeout(() => {
                      generationAtSend === generation &&
                        ((cardState.pending = false),
                        (cardState.expected = null),
                        (errorElement.textContent = '设备未响应，请重试'),
                        refreshRows())
                    }, 10000)),
                    cardState.timer.unref?.())
              } catch (error: any) {
                generationAtSend === generation &&
                  ((cardState.pending = false),
                  (cardState.expected = null),
                  (errorElement.textContent = error.message || '操作失败'))
              } finally {
                generationAtSend === generation && refreshRows()
              }
            }),
            controlType === 'select')
          ) {
            controlElement.classList.add('i3d-extra-select-trigger'),
              controlElement.setAttribute('aria-haspopup', 'listbox'),
              controlElement.setAttribute('aria-expanded', 'false')
            const menuElement = createEl('div')
            ;(cardState.menu = menuElement),
              (cardState.choices = []),
              (menuElement.className = 'i3d-extra-select-menu'),
              menuElement.setAttribute('popover', 'auto'),
              menuElement.setAttribute('role', 'listbox'),
              menuElement.setAttribute('aria-label', (control.label || control.entityId) + ' 选项'),
              (menuElement.hidden = true),
              cardSection.append(menuElement),
              controlElement.addEventListener('click', () => openSelectMenu(cardState)),
              controlElement.addEventListener('keydown', (triggerKeyEvent: any) => {
                ;['ArrowDown', 'ArrowUp'].includes(triggerKeyEvent.key) &&
                  (triggerKeyEvent.preventDefault(), openSelectMenu(cardState))
              }),
              menuElement.addEventListener('toggle', (toggleEvent: any) => {
                toggleEvent.newState === 'closed' && openSelect === cardState && closeSelect()
              }),
              menuElement.addEventListener('keydown', (menuKeyEvent: any) => {
                if (menuKeyEvent.key === 'Escape') {
                  menuKeyEvent.preventDefault(), menuKeyEvent.stopPropagation(), closeSelect(true)
                  return
                }
                if (menuKeyEvent.key === 'Tab') {
                  closeSelect(true)
                  return
                }
                if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(menuKeyEvent.key)) return
                menuKeyEvent.preventDefault()
                const activeIndex = cardState.choices.indexOf(doc.activeElement),
                  choiceCount = cardState.choices.length,
                  nextIndex =
                    menuKeyEvent.key === 'Home'
                      ? 0
                      : menuKeyEvent.key === 'End'
                        ? choiceCount - 1
                        : (activeIndex + (menuKeyEvent.key === 'ArrowDown' ? 1 : -1) + choiceCount) % choiceCount
                cardState.choices[nextIndex]?.focus?.()
              })
          } else {
            if (controlType === 'button') {
              const confirmElement = createEl('div')
              ;(confirmElement.className = 'i3d-extra-confirm'), (confirmElement.hidden = true)
              const confirmText = createEl('span', '确认执行此操作？'),
                confirmButton = createEl('button', '确认'),
                cancelButton = createEl('button', '取消')
              ;(confirmButton.type = cancelButton.type = 'button'),
                confirmButton.addEventListener('click', () => {
                  ;(confirmElement.hidden = true), cardState.submit()
                }),
                cancelButton.addEventListener('click', () => {
                  ;(confirmElement.hidden = true), syncCardMetrics(cardState), controlElement.focus?.()
                }),
                confirmElement.append(confirmText, confirmButton, cancelButton),
                (cardState.confirm = confirmElement),
                controlElement.addEventListener('click', () => {
                  !viewModel.editing &&
                    !controlElement.disabled &&
                    ((confirmElement.hidden = false), syncCardMetrics(cardState))
                })
            } else controlElement.addEventListener(controlType === 'number' ? 'change' : 'click', cardState.submit)
          }
          cardSection.append(controlElement), cardState.confirm && cardSection.append(cardState.confirm)
        }
        if (((cardState.ranges = []), controlType === 'switch'))
          for (const rangeSpec of extraRanges(control.entityId, readState(control.entityId))) {
            const rangeLabel = createEl('label'),
              rangeOutput = createEl('span'),
              rangeInput = createEl('input')
            ;(rangeLabel.className = 'i3d-extra-range'),
              (rangeInput.type = 'range'),
              rangeInput.classList.add('i3d-control-range'),
              (rangeInput.min = rangeSpec.min),
              (rangeInput.max = rangeSpec.max),
              (rangeInput.step = rangeSpec.step),
              (rangeInput.value = rangeSpec.value),
              syncHtmlRangeProgress(rangeInput),
              rangeInput.setAttribute('aria-label', control.entityId + ' ' + rangeSpec.label),
              rangeInput.addEventListener('input', () => {
                syncHtmlRangeProgress(rangeInput), (rangeOutput.textContent = rangeSpec.label + ' ' + rangeInput.value)
              }),
              rangeInput.addEventListener('change', async () => {
                if (viewModel.editing || cardState.rangePending) return
                const rangeGenerationAtSend = generation
                try {
                  const rangeCommand = extraRangeCommand(
                    cardState.item,
                    readState(control.entityId),
                    rangeSpec.key,
                    rangeInput.value,
                  )
                  ;(cardState.rangePending = true),
                    (cardState.rangeExpected = {
                      key: rangeSpec.key,
                      value: Number(rangeInput.value),
                    }),
                    (errorElement.textContent = ''),
                    refreshRows(),
                    await onControl(rangeCommand),
                    rangeGenerationAtSend === generation &&
                      cardState.rangePending &&
                      ((errorElement.textContent = ''),
                      (cardState.rangeTimer = setTimeout(() => {
                        rangeGenerationAtSend === generation &&
                          ((cardState.rangePending = false),
                          (cardState.rangeExpected = null),
                          (errorElement.textContent = '设备未响应，请重试'),
                          refreshRows())
                      }, 10000)))
                } catch (rangeError: any) {
                  rangeGenerationAtSend === generation &&
                    ((cardState.rangePending = false),
                    (cardState.rangeExpected = null),
                    (errorElement.textContent = rangeError.message || '调节失败'))
                } finally {
                  rangeGenerationAtSend === generation && refreshRows()
                }
              }),
              rangeLabel.append(rangeOutput, rangeInput),
              cardSection.append(rangeLabel),
              cardState.ranges.push({
                key: rangeSpec.key,
                label: rangeLabel,
                output: rangeOutput,
                input: rangeInput,
              })
          }
        cardSection.append(errorElement), hostElement.append(cardSection)
        for (const observedNode of [
          descriptionElement,
          controlElement,
          cardState.nativeRoot,
          errorElement,
          cardState.confirm,
        ])
          observedNode && resizeObserver?.observe(observedNode)
      }
    }
    refreshRows()
  }
  return {
    update: update,
    /** 0.8.1：弹窗隐藏时暂停卡片重排；重新可见时立即按最新状态重算。 */
    setVisible(nextVisible: boolean) {
      isVisible !== nextVisible && ((isVisible = nextVisible), isVisible ? update(viewModel) : closeSelect())
    },
    dispose() {
      defaultView?.removeEventListener?.('resize', positionSelectMenu),
        (isVisible = false),
        closeSelect(),
        finishDrag(true),
        resizeObserver?.disconnect(),
        cards.forEach((cleanupCard: any) => {
          clearTimeout(cleanupCard.timer), clearTimeout(cleanupCard.rangeTimer), cleanupCard.native?.dispose?.()
        }),
        doc.removeEventListener?.('pointerdown', onDocumentPointerDown),
        doc.removeEventListener?.('scroll', onDocumentScroll, true),
        doc.removeEventListener?.('keydown', onEscapeKeydown, true),
        generation++,
        (cards = []),
        hostElement.replaceChildren()
    },
  }
}
