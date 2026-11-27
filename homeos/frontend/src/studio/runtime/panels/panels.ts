import {
  attributesOf,
  extraContextChanged,
  featureFlags,
  haNumber,
  stringOptions,
  brightnessModes,
} from '../device/device'
import { createCameraAudio, mountCameraAudioButton, type CameraAudioHandle } from '@app/shared/camera'
import { createRangeFeedback } from '@app/shared/util/control-timeout'
import { enhancePopupSelects } from '@app/shared/util/select-picker'
import { formatEntityNumber } from '@app/shared/util/ha-number'
import { domElement } from '@app/shared/util/dom-factory'
import { createClimatePanel } from '../climate/climate'
import { createSpeakerPanel } from '../speaker/speaker'
import * as lightRuntime from '@app/shared/device'
import { createLightColorPicker } from '../light/light'
import { createLockPanel } from '../security/security'

/**
 * 摄像头附加面板：开关按钮 + 可见时才挂载实时流/快照。
 *
 * 实时流由 `@app/renderer/registry/camera-media` 统一处理（go2rtc / HLS / 快照回退）；
 * 面板只负责决定"该不该播"：编辑态、实体关闭、滚动出视口都主动卸载。
 * 媒体模块属于面板渲染器，按需加载（runtime 不静态依赖 renderer）。
 */

/** 摄像头能力位：1=支持开关；2=支持实时流。 */
const CAMERA_TURN_ON = 0x1
const CAMERA_STREAM = 0x2

type CameraExtraPanelOptions = {
  element: any
  feedbackSlot?: FeedbackSlot
  onControl?: (command: any) => Promise<any>
  loadMedia?: () => Promise<any>
}

function cameraPowerState(state: any) {
  const attributes = attributesOf(state)
  if (typeof attributes.is_on == 'boolean') return attributes.is_on
  if (state?.state === 'off') return true
  if (state?.state === 'on') return false
  return null
}

export function createCameraExtraPanel(
  {
    element: hostElement,
    feedbackSlot,
    onControl = async () => {},
    loadMedia = () => import('@app/renderer/registry/camera-media'),
  }: CameraExtraPanelOptions = {} as any,
) {
  const ownerDocument = hostElement.ownerDocument || globalThis.document
  const actionsElement = ownerDocument.createElement('div')
  const placeholderElement = ownerDocument.createElement('p')
  const errorElement = ownerDocument.createElement('p')
  const frameElement = ownerDocument.createElement('div')

  frameElement.className = 'i3d-extra-camera-frame'
  placeholderElement.className = 'i3d-extra-camera-placeholder'
  placeholderElement.setAttribute('role', 'status')
  frameElement.append(placeholderElement)
  actionsElement.className = 'i3d-extra-actions i3d-extra-camera-actions'
  errorElement.className = 'i3d-climate-error'
  errorElement.setAttribute('role', 'status')
  // 声音开关挂在画面下方的工具条里：与画面同一视觉组，不挤占开关按钮区。
  const toolbarElement = ownerDocument.createElement('div')
  toolbarElement.className = 'i3d-extra-camera-toolbar'
  hostElement.replaceChildren(actionsElement, frameElement, toolbarElement, errorElement)

  let viewModel: ExtraPanelViewModel | null = null
  let pending = false
  let generation = 0
  let mountedSignature = ''
  let cleanupCallbacks: Array<() => void> = []
  let disposed = false
  /** 当前挂载的摄像头音频控制器（0.8.7：弹窗默认静音，可手动开启）。 */
  let cameraAudio: CameraAudioHandle | null = null

  const powerButtons = (
    [
      ['turn_on', '开启摄像头'],
      ['turn_off', '关闭摄像头'],
    ] as const
  ).map(([service, label]) => {
    const button = ownerDocument.createElement('button')
    button.type = 'button'
    button.className = 'i3d-climate-choice'
    button.textContent = label
    actionsElement.append(button)
    button.addEventListener('click', async () => {
      if (!viewModel || button.disabled || pending) return
      const requestGeneration = generation
      pending = true
      errorElement.textContent = ''
      refresh()
      try {
        await onControl({
          entityId: viewModel.item.entityId,
          domain: 'camera',
          service,
          data: {},
        })
      } catch (error: any) {
        if (!disposed && requestGeneration === generation) {
          errorElement.textContent = error.message || '摄像头开关失败'
        }
      } finally {
        if (!disposed && requestGeneration === generation) {
          pending = false
          refresh()
        }
      }
    })
    return button
  })

  function unmountMedia() {
    generation++
    mountedSignature = ''
    for (const cleanup of cleanupCallbacks.splice(0)) cleanup()
    cameraAudio?.dispose()
    cameraAudio = null
    frameElement.classList.remove?.('is-ready', 'is-connecting', 'is-unavailable', 'is-suspended')
    frameElement.setAttribute('aria-busy', 'false')
    frameElement.dataset.cameraState = 'suspended'
    delete frameElement.dataset.cameraTransport
    frameElement.replaceChildren(placeholderElement)
    placeholderElement.hidden = false
  }

  /** 挂载实时流 / 快照，并顺带绑定声音开关（视频元素建好后才有音轨可探测）。 */
  async function mountMedia(item: ExtraPanelViewModel['item'], streamEnabled: boolean, requestGeneration: number) {
    const stillCurrent = () => !disposed && requestGeneration === generation && gate.visible()
    const shared = {
      container: frameElement,
      entityId: item.entityId,
      label: item.label || item.entityId,
      objectFit: 'contain' as const,
      placeholder: placeholderElement,
      cleanup: (cleanup: () => void) => cleanupCallbacks.push(cleanup),
      onVideoReady: (video: HTMLVideoElement) => {
        if (stillCurrent()) attachCameraAudio(video, requestGeneration)
      },
      onAudioAvailability: (supported: boolean, hasAudio: boolean | null) => {
        cameraAudio?.setMedia(supported, hasAudio)
      },
    }
    try {
      const media = await loadMedia()
      if (!stillCurrent() || viewModel?.editing) return
      if (!streamEnabled) {
        media.mountCameraSnapshot({ ...shared, refreshInterval: 10 })
        return
      }
      media.mountCameraMedia({
        ...shared,
        onReady: () => cameraAudio?.setReady(true),
        onUnavailable: () => cameraAudio?.setReady(false),
      })
    } catch {
      if (!stillCurrent()) return
      frameElement.dataset.cameraState = 'load-failed'
      placeholderElement.hidden = false
      placeholderElement.textContent = '摄像头画面暂时无法加载，请重新打开弹窗'
    }
  }

  function attachCameraAudio(video: HTMLVideoElement, requestGeneration: number) {
    cameraAudio = createCameraAudio({
      video,
      isCurrent: () => !disposed && requestGeneration === generation && gate.visible(),
      onError: () => {
        if (!disposed && requestGeneration === generation) {
          errorElement.textContent = '摄像头声音未能开启，请再次点击声音按钮。'
        }
      },
    })
    mountCameraAudioButton({
      host: toolbarElement,
      audio: cameraAudio,
      cleanup: (cleanup: () => void) => cleanupCallbacks.push(cleanup),
    })
  }

  async function refresh() {
    if (disposed || !viewModel) return
    const { item, state, editing } = viewModel
    const available =
      !!state &&
      state.available !== false &&
      typeof state.state == 'string' &&
      !['', 'unknown', 'unavailable'].includes(state.state)
    const cameraOff = cameraPowerState(state) === false
    const flags = featureFlags(attributesOf(state))
    actionsElement.hidden = !(flags & CAMERA_TURN_ON)

    const disabled = editing || pending || !available || item.modelAvailable === false || actionsElement.hidden
    powerButtons[0].disabled = disabled || cameraPowerState(state) === true
    powerButtons[1].disabled = disabled || cameraOff

    const streamEnabled = !!(flags & CAMERA_STREAM)
    const signature = JSON.stringify([item.entityId, streamEnabled])
    frameElement.setAttribute('aria-label', item.label || item.entityId)

    if (editing || !available || cameraOff || !gate.visible() || item.modelAvailable === false) {
      if (mountedSignature) unmountMedia()
      frameElement.dataset.cameraState = editing
        ? 'preview'
        : available
          ? cameraOff
            ? 'off'
            : 'suspended'
          : 'unavailable'
      placeholderElement.hidden = false
      placeholderElement.textContent = editing
        ? '摄像头画面预览'
        : available
          ? cameraOff
            ? '摄像头已关闭'
            : '画面在可见时加载'
          : '摄像头不可用'
      return
    }

    if (mountedSignature === signature || frameElement.dataset.cameraState === 'connecting') return
    unmountMedia()
    mountedSignature = signature
    placeholderElement.textContent = '正在加载摄像头画面'
    await mountMedia(item, streamEnabled, generation)
  }

  const releaseFeedback = attachFeedback(feedbackSlot, errorElement, {
    source: () => viewModel?.item?.entityId,
    label: () => viewModel?.item?.label,
  })
  const gate = createVisibilityGate(frameElement, () => void refresh())

  return {
    root: hostElement,
    update(nextViewModel: ExtraPanelViewModel) {
      if (disposed) return
      if (extraContextChanged(viewModel, nextViewModel)) {
        generation++
        pending = false
        errorElement.textContent = ''
      }
      viewModel = nextViewModel
      void refresh()
    },
    dispose() {
      if (disposed) return
      disposed = true
      releaseFeedback()
      generation++
      gate.dispose()
      unmountMedia()
      viewModel = null
      hostElement.replaceChildren()
    },
  }
}

/**
 * 复合设备面板：加湿器 / 阀门 / 割草机 / 警报器 / 安防面板 / 扫地机 / 温控。
 *
 * 这些域各自有 2~6 个服务 + 一组能力位，状态词也比开关丰富。面板把
 * "动作按钮 / 参数表单 / 只读读数"三块拆开，动作按 supported_features 裁剪。
 */

export type CompoundField = {
  key: string
  label: string
  type: string
  attribute?: string
  service?: string
  min?: number
  max?: number
  step?: number
  choices?: string[]
  draft?: boolean
  json?: boolean
  lines?: boolean
}

export type CompoundAction = {
  service: string
  label: string
  confirm?: boolean
  form?: boolean
  keys?: string[]
}

export type CompoundSpec = {
  actions: CompoundAction[]
  fields: CompoundField[]
  readouts: Array<[string, string]>
}

const readout = (attributes: any, key: string, unit = '') =>
  attributes[key] == null ? '暂无读数' : `${attributes[key]}${unit}`

/** 各域 supported_features 位。 */
const HUMIDIFIER_MODE = 0x1
const VALVE_OPEN = 0x1
const VALVE_CLOSE = 0x2
const VALVE_SET_POSITION = 0x4
const VALVE_STOP = 0x8
const CLIMATE_HUMIDITY = 0x4
const SIREN_TONES = 0x4
const SIREN_VOLUME = 0x8
const SIREN_DURATION = 0x10
const ALARM_HOME = 0x1
const ALARM_AWAY = 0x2
const ALARM_NIGHT = 0x4
const ALARM_TRIGGER = 0x8
const ALARM_CUSTOM = 0x10
const ALARM_VACATION = 0x20
const VACUUM_PAUSE = 0x4
const VACUUM_STOP = 0x8
const VACUUM_RETURN = 0x10
const VACUUM_LOCATE = 0x200
const VACUUM_CLEAN_SPOT = 0x400
const VACUUM_FAN_SPEED = 0x20
const VACUUM_SEND_COMMAND = 0x100
const VACUUM_START = 0x2000
const VACUUM_CLEAN_AREA = 0x4000

function compoundExtraSpec(domain: string, state: any): CompoundSpec {
  const attributes = attributesOf(state)
  const flags = featureFlags(attributes)
  const actions: CompoundAction[] = []
  const fields: CompoundField[] = []
  const readouts: Array<[string, string]> = []

  const addAction = (service: string, label: string, bit = 0, extra: Partial<CompoundAction> = {}) => {
    if (!bit || flags & bit) actions.push({ service, label, ...extra })
  }
  const addRange = (
    key: string,
    label: string,
    attribute: string,
    min: any,
    max: any,
    step: any,
    service: string,
    bit = 0,
  ) => {
    const numericMin = haNumber(min)
    const numericMax = haNumber(max)
    const numericStep = haNumber(step)
    if (
      (!bit || flags & bit) &&
      numericMin !== null &&
      numericMax !== null &&
      (numericMin as number) < (numericMax as number) &&
      numericStep !== null &&
      (numericStep as number) > 0
    ) {
      fields.push({
        key,
        label,
        attribute,
        min: numericMin as number,
        max: numericMax as number,
        step: numericStep as number,
        service,
        type: 'range',
      })
    }
  }
  const addSelect = (key: string, label: string, attribute: string, choices: any, service: string, bit = 0) => {
    const options = stringOptions(choices)
    if ((!bit || flags & bit) && options.length) {
      fields.push({ key, label, attribute, choices: options, service, type: 'select' })
    }
  }

  if (domain === 'climate') {
    if (attributes.current_humidity != null) {
      readouts.push(['当前湿度', readout(attributes, 'current_humidity', '%')])
    }
    addRange(
      'humidity',
      '目标湿度',
      'humidity',
      attributes.min_humidity,
      attributes.max_humidity,
      1,
      'set_humidity',
      CLIMATE_HUMIDITY,
    )
  } else if (domain === 'humidifier') {
    readouts.push(['当前湿度', readout(attributes, 'current_humidity', '%')])
    addAction('turn_on', '开启')
    addAction('turn_off', '关闭')
    addRange('humidity', '目标湿度', 'humidity', attributes.min_humidity, attributes.max_humidity, 1, 'set_humidity')
    addSelect('mode', '运行模式', 'mode', attributes.available_modes, 'set_mode', HUMIDIFIER_MODE)
  } else if (domain === 'valve') {
    readouts.push(['当前开度', readout(attributes, 'current_position', '%')])
    addAction('open_valve', '打开', VALVE_OPEN, { confirm: attributes.device_class === 'gas' })
    addAction('close_valve', '关闭', VALVE_CLOSE)
    addAction('stop_valve', '停止', VALVE_STOP)
    addRange('position', '目标开度', 'current_position', 0, 100, 1, 'set_valve_position', VALVE_SET_POSITION)
  } else if (domain === 'lawn_mower') {
    addAction('start_mowing', '开始割草', VALVE_OPEN)
    addAction('pause', '暂停', VALVE_CLOSE)
    addAction('dock', '返回充电', VALVE_SET_POSITION)
  } else if (domain === 'siren') {
    if (flags & SIREN_TONES) {
      const tones = attributes.available_tones
      const toneList = Array.isArray(tones) ? tones : tones && typeof tones == 'object' ? Object.keys(tones) : []
      if (toneList.length) {
        fields.push({ key: 'tone', label: '音调', type: 'select', choices: toneList, draft: true })
      }
    }
    if (flags & SIREN_VOLUME) {
      fields.push({
        key: 'volume_level',
        label: '音量（0–1）',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.05,
        draft: true,
      })
    }
    if (flags & SIREN_DURATION) {
      fields.push({
        key: 'duration',
        label: '持续秒数',
        type: 'number',
        min: 1,
        max: 86_400,
        step: 1,
        draft: true,
      })
    }
    addAction('turn_on', '鸣响', SIREN_TONES, { confirm: true, form: false })
    addAction('turn_off', '停止鸣响', SIREN_VOLUME)
  } else if (domain === 'alarm_control_panel') {
    if (attributes.code_format) {
      fields.push({
        key: 'code',
        label: '密码（仅本次操作）',
        type: 'password',
        draft: true,
      })
    }
    addAction('alarm_disarm', '撤防', 0, { confirm: true, form: false })
    for (const [service, label, bit] of [
      ['alarm_arm_home', '在家布防', ALARM_HOME],
      ['alarm_arm_away', '离家布防', ALARM_AWAY],
      ['alarm_arm_night', '夜间布防', ALARM_NIGHT],
      ['alarm_arm_custom_bypass', '自定义布防', ALARM_CUSTOM],
      ['alarm_arm_vacation', '假期布防', ALARM_VACATION],
      ['alarm_trigger', '触发警报', ALARM_TRIGGER],
    ] as const) {
      addAction(service, label, bit, { confirm: true, form: false })
    }
  } else if (domain === 'vacuum') {
    for (const [service, label, bit] of [
      ['start', '开始清扫', VACUUM_START],
      ['pause', '暂停', VACUUM_PAUSE],
      ['stop', '停止', VACUUM_STOP],
      ['return_to_base', '返回充电', VACUUM_RETURN],
      ['locate', '定位', VACUUM_LOCATE],
      ['clean_spot', '局部清扫', VACUUM_CLEAN_SPOT],
    ] as const) {
      addAction(service, label, bit)
    }
    addSelect('fan_speed', '吸力', 'fan_speed', attributes.fan_speed_list, 'set_fan_speed', VACUUM_FAN_SPEED)
    if (flags & VACUUM_SEND_COMMAND) {
      fields.push(
        { key: 'command', label: '设备命令', type: 'text', draft: true },
        {
          key: 'params',
          label: '命令参数（JSON，可留空）',
          type: 'textarea',
          draft: true,
          json: true,
        },
      )
      addAction('send_command', '发送设备命令', 0, {
        form: false,
        confirm: false,
        keys: ['command', 'params'],
      })
    }
    if (flags & VACUUM_CLEAN_AREA) {
      fields.push({
        key: 'cleaning_area_id',
        label: '清洁区域 ID（每行一个）',
        type: 'textarea',
        draft: true,
        lines: true,
      })
      addAction('clean_area', '清洁所选区域', 0, {
        form: false,
        keys: ['cleaning_area_id'],
      })
    }
  }

  return { actions, fields, readouts }
}

type CompoundExtraPanelOptions = {
  element: any
  feedbackSlot?: FeedbackSlot
  onControl: (command: any) => Promise<any>
  hideStatus?: boolean
  headerControls?: any
}

export function createCompoundExtraPanel({
  element: hostElement,
  feedbackSlot,
  onControl,
  hideStatus = false,
  headerControls,
}: CompoundExtraPanelOptions) {
  const pickers = enhancePopupSelects(hostElement)
  const ownerDocument = hostElement.ownerDocument || globalThis.document
  const createElement = (tagName: string, textContent = '') => {
    const node = ownerDocument.createElement(tagName)
    node.textContent = textContent
    return node
  }

  const statusElement = createElement('p')
  const powerButton = createElement('button') as HTMLButtonElement
  const readoutsElement = createElement('div')
  const formElement = createElement('div')
  const actionsElement = createElement('div')
  const errorElement = createElement('p')

  hostElement.classList.add('i3d-extra-compound')
  formElement.className = 'i3d-extra-form'
  actionsElement.className = 'i3d-extra-actions'
  readoutsElement.className = 'i3d-extra-readouts'
  errorElement.className = 'i3d-climate-error'
  errorElement.setAttribute('role', 'status')
  hostElement.replaceChildren(
    ...(headerControls ? [] : [statusElement]),
    readoutsElement,
    formElement,
    actionsElement,
    errorElement,
  )
  powerButton.type = 'button'
  powerButton.className = 'i3d-climate-choice'
  powerButton.setAttribute('role', 'switch')
  headerControls?.append(statusElement, powerButton)

  let viewModel: ExtraPanelViewModel | null = null
  let disposed = false
  let generation = 0
  let busy = false
  let confirmSignature = ''
  let specSignature = ''
  const fieldInputs = new Map<string, { input: any; label: HTMLElement; field: CompoundField }>()
  const actionButtons: HTMLButtonElement[] = []
  const feedback = createRangeFeedback({
    onChange: render,
    onTimeout: () => {
      errorElement.textContent = '设备未响应，请重试。'
    },
  })

  const stateOf = () => viewModel?.state?.newState || viewModel?.state
  const domain = () => String(viewModel?.item?.entityId).split('.')[0]
  const isUsable = () =>
    !!viewModel &&
    stateOf() &&
    stateOf().available !== false &&
    !['unknown', 'unavailable', '', undefined].includes(stateOf().state) &&
    viewModel.item.modelAvailable !== false
  const isDisabled = () => disposed || !viewModel || viewModel.editing || busy || !isUsable()

  function collectDraftData(keys?: string[]) {
    const data: any = {}
    for (const [key, { input, field }] of fieldInputs) {
      if (!field.draft || (keys && !keys.includes(key)) || !input.value) continue
      data[key] = field.json
        ? JSON.parse(input.value)
        : field.lines
          ? input.value
              .split('\n')
              .map((line: string) => line.trim())
              .filter(Boolean)
          : field.type === 'number'
            ? Number(input.value)
            : input.value
    }
    return data
  }

  async function triggerRuntimeAction(action: CompoundAction, dataOverride?: any, rangeKey?: string, rangeEntry?: any) {
    if (isDisabled()) return
    if (action.confirm && (confirmSignature !== action.service || !errorElement.textContent)) {
      confirmSignature = action.service
      errorElement.dataset.kind = 'confirm'
      errorElement.textContent = `确认${action.label}？再次点击执行。`
      return
    }
    confirmSignature = ''
    const requestGeneration = generation
    try {
      const data = dataOverride ?? (action.form ? collectDraftData(action.keys) : {})
      // 密码类字段只对本次操作有效，发出后立刻清空，避免留在 DOM 里。
      for (const { input, field } of fieldInputs.values()) {
        if (field.type === 'password') input.value = ''
      }
      busy = true
      errorElement.textContent = ''
      syncDisabled()
      await onControl({
        entityId: viewModel!.item.entityId,
        domain: domain(),
        service: action.service,
        data,
      })
      if (!disposed && requestGeneration === generation) errorElement.textContent = ''
    } catch (error: any) {
      if (!disposed && requestGeneration === generation) {
        if (rangeKey && rangeEntry) feedback.cancel(rangeKey, rangeEntry)
        errorElement.dataset.kind = 'error'
        errorElement.textContent = error?.message || '设备操作失败'
      }
    } finally {
      if (!disposed && requestGeneration === generation) {
        busy = false
        syncDisabled()
      }
    }
  }

  function build(spec: CompoundSpec) {
    feedback.reset()
    fieldInputs.clear()
    readoutsElement.replaceChildren()
    formElement.replaceChildren()
    actionsElement.replaceChildren()
    actionButtons.length = 0

    for (const field of spec.fields) {
      const row = createElement('label')
      const label = createElement('span', field.label)
      const input = createElement(
        field.type === 'select' ? 'select' : field.type === 'textarea' ? 'textarea' : 'input',
      ) as any
      row.className = 'i3d-extra-field'
      input.setAttribute('aria-label', field.label)
      input.name = `i3d-extra-${field.key}`
      if (!['select', 'textarea'].includes(field.type)) input.type = field.type
      if (field.type === 'password') input.autocomplete = 'off'
      for (const key of ['min', 'max', 'step']) {
        if (field[key as 'min'] != null) input[key] = field[key as 'min']
      }
      if (field.type === 'select') {
        if (field.draft) {
          const option = createElement('option', '默认') as HTMLOptionElement
          option.value = ''
          input.append(option)
        }
        for (const choice of field.choices || []) {
          const option = createElement('option', choice) as HTMLOptionElement
          option.value = choice
          input.append(option)
        }
      }
      if (!field.draft) {
        input.addEventListener('input', () => {
          if (field.type !== 'range' || input.disabled) return
          feedback.preview(field.key, Number(input.value))
          label.textContent = `${field.label} ${input.value}`
        })
        input.addEventListener('change', () => {
          if (isDisabled()) return
          const value = field.type === 'select' ? input.value : Number(input.value)
          const rangeEntry = field.type === 'range' ? feedback.commit(field.key, value) : null
          void triggerRuntimeAction(
            { service: field.service!, label: field.label },
            { [field.key]: value },
            field.key,
            rangeEntry,
          )
        })
        for (const eventName of ['blur', 'pointercancel']) {
          input.addEventListener(eventName, () => {
            feedback.cancelPreview(field.key)
            render()
          })
        }
      }
      row.append(label, input)
      formElement.append(row)
      fieldInputs.set(field.key, { input, label: row, field })
    }

    for (const action of spec.actions) {
      if (
        headerControls &&
        String(viewModel?.item.entityId).startsWith('humidifier.') &&
        ['turn_on', 'turn_off'].includes(action.service)
      ) {
        continue
      }
      const button = createElement('button', action.label) as HTMLButtonElement
      button.className = 'i3d-climate-choice'
      button.type = 'button'
      button.addEventListener('click', () => void triggerRuntimeAction(action))
      actionsElement.append(button)
      actionButtons.push(button)
    }
  }

  function syncDisabled() {
    for (const element of hostElement.querySelectorAll('button,input,select,textarea')) {
      ;(element as any).disabled = isDisabled()
    }
    pickers.sync()
  }

  function render() {
    if (disposed || !viewModel) return
    const currentDomain = domain()
    const state = stateOf()
    const spec = compoundExtraSpec(currentDomain, state)
    const signature = JSON.stringify([spec.actions, spec.fields])
    if (signature !== specSignature) {
      specSignature = signature
      build(spec)
    }

    statusElement.textContent = isUsable()
      ? EXTRA_STATE_LABELS[state.state] || state.state
      : state?.state === 'unknown'
        ? '状态未知'
        : '设备不可用'
    statusElement.title = statusElement.textContent
    readoutsElement.replaceChildren(
      ...spec.readouts.map(([label, value]) => createElement('span', `${label} ${value}`)),
    )

    const attributes = attributesOf(state)
    for (const { input, label, field } of fieldInputs.values()) {
      if (field.draft) continue
      const value =
        field.type === 'range'
          ? feedback.read(field.key, haNumber(attributes[field.attribute!]), 0.5)
          : attributes[field.attribute!]
      if (field.type === 'range' || !pickers.focused(input)) {
        input.value = value ?? (field.type === 'range' ? field.min : '')
      }
      label.textContent = field.type === 'range' ? `${field.label} ${value ?? '暂无读数'}` : field.label
    }

    readoutsElement.hidden = !spec.readouts.length
    formElement.hidden = !spec.fields.length
    actionsElement.hidden = !actionButtons.length
    powerButton.hidden = currentDomain !== 'humidifier'
    powerButton.textContent = state?.state === 'on' ? '关闭' : '开启'
    powerButton.setAttribute('aria-checked', String(state?.state === 'on'))
    powerButton.disabled = isDisabled()
    powerButton.setAttribute('aria-label', `${viewModel.item.label || '加湿器'}电源`)
    statusElement.hidden =
      hideStatus || (currentDomain === 'humidifier' && isUsable() && ['on', 'off'].includes(state?.state))
    for (const button of actionButtons) button.disabled = isDisabled()
    pickers.sync()
  }

  powerButton.addEventListener(
    'click',
    () =>
      void triggerRuntimeAction({
        service: stateOf()?.state === 'on' ? 'turn_off' : 'turn_on',
        label: stateOf()?.state === 'on' ? '关闭' : '开启',
      }),
  )

  const releaseFeedback = attachFeedback(feedbackSlot, errorElement, {
    source: () => viewModel?.item?.entityId,
    label: () => viewModel?.item?.label,
    onRetire: () => {
      confirmSignature = ''
    },
  })

  return {
    root: hostElement,
    update(nextViewModel: ExtraPanelViewModel) {
      if (disposed) return
      if (extraContextChanged(viewModel, nextViewModel)) {
        feedback.reset()
        pickers.close()
        generation++
        busy = false
        confirmSignature = ''
        errorElement.textContent = ''
        for (const { input, field } of fieldInputs.values()) {
          if (field.type === 'password') input.value = ''
        }
      }
      viewModel = nextViewModel
      render()
    },
    dispose() {
      feedback.reset()
      disposed = true
      pickers.dispose()
      releaseFeedback()
      generation++
      viewModel = null
      fieldInputs.clear()
      headerControls && (statusElement.remove(), powerButton.remove())
      hostElement.replaceChildren()
    },
  }
}

/**
 * 只读信息面板：空气质量 / 定位 / 事件 / 地理围栏。
 *
 * 这类实体没有可下发的服务，弹窗里只展示"当前值 + 关键属性"。
 * 属性白名单按域给出，避免把 token / 密码之类字段渲染到界面上。
 */

const ATTRIBUTE_LABELS: Record<string, string> = {
  air_quality_index: '空气质量指数',
  particulate_matter_2_5: 'PM2.5',
  particulate_matter_10: 'PM10',
  carbon_dioxide: '二氧化碳',
  carbon_monoxide: '一氧化碳',
  nitrogen_dioxide: '二氧化氮',
  ozone: '臭氧',
  sulphur_dioxide: '二氧化硫',
  volatile_organic_compounds: '挥发性有机物',
  latitude: '纬度',
  longitude: '经度',
  gps_accuracy: '定位精度',
  source_type: '定位来源',
  battery_level: '电量',
  event_type: '最近事件',
  event_types: '支持事件',
  event_data: '事件详情',
  location: '位置',
  distance: '距离',
}

const DOMAIN_ATTRIBUTES: Record<string, string[]> = {
  air_quality: [
    'air_quality_index',
    'particulate_matter_2_5',
    'particulate_matter_10',
    'carbon_dioxide',
    'carbon_monoxide',
    'nitrogen_dioxide',
    'ozone',
    'sulphur_dioxide',
    'volatile_organic_compounds',
  ],
  device_tracker: ['source_type', 'latitude', 'longitude', 'gps_accuracy', 'battery_level'],
  event: ['event_type', 'event_types', 'event_data'],
  geo_location: ['latitude', 'longitude', 'location'],
}

/** 敏感字段名：命中即整条丢弃。 */
const SENSITIVE_KEY = /token|password|passwd|secret|credential|authorization|cookie|api_key/i
/** 通用展示时跳过的属性。 */
const IGNORED_ATTRIBUTES = new Set(['friendly_name', 'icon', 'entity_picture', 'supported_features'])

function sanitizeAttributeValue(value: any, depth = 0): any {
  if (depth > 3) return '…'
  if (Array.isArray(value)) return value.map((entry) => sanitizeAttributeValue(entry, depth + 1))
  if (value && typeof value == 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_KEY.test(key))
        .map(([key, entry]) => [key, sanitizeAttributeValue(entry, depth + 1)]),
    )
  }
  return value
}

function displayExtraRows(entityId: string, state: any): [string, string][] {
  const domain = String(entityId).split('.')[0]
  const attributes = attributesOf(state)
  const keys =
    DOMAIN_ATTRIBUTES[domain] ||
    Object.keys(attributes).filter((key) => !SENSITIVE_KEY.test(key) && !IGNORED_ATTRIBUTES.has(key))
  return keys
    .filter((key) => attributes[key] != null)
    .map((key) => [
      ATTRIBUTE_LABELS[key] || key,
      typeof attributes[key] == 'object'
        ? JSON.stringify(sanitizeAttributeValue(attributes[key]))
        : String(attributes[key]),
    ])
}

export function createDisplayExtraPanel({ element: hostElement }: { element: any }) {
  const ownerDocument = hostElement.ownerDocument || globalThis.document
  const statusElement = ownerDocument.createElement('p')
  const rowsElement = domElement(ownerDocument, 'dl', 'i3d-extra-display-rows')
  hostElement.replaceChildren(statusElement, rowsElement)

  return {
    root: hostElement,
    update({ item, state, numberFormats }: ExtraPanelViewModel) {
      const liveState = state?.newState || state
      const attributes = attributesOf(liveState)
      const unknown = liveState?.state === 'unknown'
      // 数值走 HA 显示精度（`number-formats`）；非数值实体原样返回。
      statusElement.textContent =
        !liveState || liveState.state === 'unavailable' || (liveState.available === false && !unknown)
          ? '设备不可用'
          : unknown
            ? '状态未知'
            : formatEntityNumber(
                String(item?.entityId || ''),
                liveState,
                numberFormats?.[String(item?.entityId || '')],
              ) + (attributes.unit_of_measurement ? ` ${attributes.unit_of_measurement}` : '')

      if (
        String(item?.entityId).startsWith('event.') &&
        liveState?.state &&
        !['unknown', 'unavailable'].includes(liveState.state)
      ) {
        const eventTime = new Date(liveState.state)
        if (Number.isFinite(eventTime.valueOf())) {
          statusElement.textContent = `最近发生 ${eventTime.toLocaleString()}`
        }
      }

      rowsElement.replaceChildren()
      for (const [label, value] of displayExtraRows(String(item?.entityId), liveState)) {
        const term = ownerDocument.createElement('dt')
        const detail = ownerDocument.createElement('dd')
        term.textContent = label
        detail.textContent = value
        rowsElement.append(term, detail)
      }
    },
    dispose() {
      hostElement.replaceChildren()
    },
  }
}

/**
 * 扩展面板：气候 / 播放器这类"主面板 + 附加操作"的复合弹窗。
 *
 * 主面板负责设备主交互（温度、风速、播放控制），附加区补上 0.7.8 新增的
 * 参数化服务（加湿目标、播放队列、搜索媒体等）。两块都按需独立刷新。
 */

type ExtendedExtraPanelOptions = {
  element: any
  kind: string
  onControl: (command: any) => Promise<any>
  feedbackSlot?: FeedbackSlot
}

export function createExtendedExtraPanel({
  element: hostElement,
  kind,
  onControl,
  feedbackSlot,
}: ExtendedExtraPanelOptions) {
  const ownerDocument = hostElement.ownerDocument || globalThis.document
  const primaryElement = ownerDocument.createElement('div')
  const secondaryElement = ownerDocument.createElement('div')
  hostElement.replaceChildren(primaryElement, secondaryElement)

  const primary =
    kind === 'climate'
      ? createClimatePanel({
          element: primaryElement,
          onControl,
          feedbackSlot,
        })
      : createSpeakerPanel({ onControl, feedbackSlot })
  const primaryRoot = primary.root
  if (kind !== 'climate') primaryElement.append(primaryRoot)
  primaryRoot.classList.add('i3d-extra-native-panel')

  const secondary =
    kind === 'climate'
      ? createCompoundExtraPanel({
          element: secondaryElement,
          onControl,
          feedbackSlot,
          hideStatus: true,
        })
      : createServiceExtraPanel({
          element: secondaryElement,
          onControl,
          feedbackSlot,
          hideStatus: true,
        })

  let viewModel: ExtraPanelViewModel | null = null
  let disposed = false

  // 气候主面板带实时动画与图表，滚出视口时停掉，避免弹窗缩略时仍跑 requestAnimationFrame。
  const view = ownerDocument.defaultView
  const Observer = view?.IntersectionObserver || (globalThis as any).IntersectionObserver
  let active = !Observer
  const observer = Observer
    ? new Observer((entries: any[]) => {
        active = entries.some((entry) => entry.isIntersecting)
        refresh()
      })
    : null
  observer?.observe(hostElement)

  function refresh() {
    if (!viewModel || disposed) return
    primaryRoot.hidden = false
    ;(primary as any).update?.({ ...viewModel, active })
    secondary.update(viewModel)
  }

  return {
    root: hostElement,
    update(nextViewModel: ExtraPanelViewModel) {
      viewModel = nextViewModel
      refresh()
    },
    dispose() {
      if (disposed) return
      disposed = true
      observer?.disconnect?.()
      ;(primary as any).dispose?.()
      secondary.dispose()
      viewModel = null
      hostElement.replaceChildren()
    },
  }
}

/**
 * 图片实体面板：经 HA 图片代理取图，滚到可见区才加载。
 *
 * 图片走 `/api/image_proxy/<entity_id>`，带实体状态做缓存键；编辑态只显示占位，
 * 避免编辑器里反复拉流。取图失败给"重新加载图片"入口，而不是反复自动重试。
 */

type ImageExtraPanelOptions = {
  element: any
  feedbackSlot?: FeedbackSlot
  fetchImage?: (input: string, init?: RequestInit) => Promise<Response>
}

export function createImageExtraPanel({
  element: hostElement,
  feedbackSlot,
  fetchImage = (...args) => fetch(...args),
}: ImageExtraPanelOptions) {
  const ownerDocument = hostElement.ownerDocument || globalThis.document
  const frameElement = ownerDocument.createElement('div')
  const imageElement = ownerDocument.createElement('img')
  const placeholderElement = ownerDocument.createElement('p')
  const retryElement = ownerDocument.createElement('button')

  frameElement.className = 'i3d-extra-camera-frame'
  imageElement.alt = '实体图片'
  placeholderElement.className = 'i3d-extra-camera-placeholder'
  placeholderElement.setAttribute('role', 'status')
  retryElement.type = 'button'
  retryElement.textContent = '重新加载图片'
  retryElement.className = 'i3d-climate-choice i3d-extra-image-retry'
  retryElement.hidden = true
  frameElement.append(imageElement, placeholderElement, retryElement)
  hostElement.replaceChildren(frameElement)

  const errorElement = domElement(ownerDocument, 'p', 'i3d-climate-error')
  hostElement.append(errorElement)

  let viewModel: ExtraPanelViewModel | null = null
  let disposed = false
  let controller: AbortController | null = null
  let objectUrl = ''
  let loadedSignature = ''
  let generation = 0

  const releaseFeedback = attachFeedback(feedbackSlot, errorElement, {
    source: () => viewModel?.item?.entityId,
    label: () => viewModel?.item?.label,
  })

  function resetImage() {
    generation++
    controller?.abort()
    controller = null
    imageElement.removeAttribute('src')
    imageElement.hidden = true
    errorElement.textContent = ''
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = ''
    loadedSignature = ''
  }

  function refresh() {
    if (disposed || !viewModel) return
    const { item, state, editing } = viewModel
    const available =
      !!state && state.available !== false && !['unknown', 'unavailable', '', undefined].includes(state.state)

    if (editing || !gate.visible() || !available || item?.modelAvailable === false) {
      resetImage()
      retryElement.hidden = true
      placeholderElement.hidden = false
      placeholderElement.textContent = editing ? '图片预览' : available ? '图片在可见时加载' : '图片不可用'
      return
    }

    const signature = JSON.stringify([item.entityId, state.state, state.updatedAt])
    if (signature === loadedSignature) return
    resetImage()
    loadedSignature = signature
    controller = new AbortController()
    const signal = controller.signal
    const requestGeneration = generation

    placeholderElement.hidden = false
    placeholderElement.textContent = '正在加载图片'
    retryElement.hidden = true
    fetchImage(`/api/image_proxy/${encodeURIComponent(item.entityId)}?v=${encodeURIComponent(state.state)}`, {
      credentials: 'same-origin',
      signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('图片读取失败')
        const blob = await response.blob()
        if (disposed || requestGeneration !== generation) return
        objectUrl = URL.createObjectURL(blob)
        imageElement.onload = () => {
          if (requestGeneration !== generation) return
          imageElement.hidden = false
          placeholderElement.hidden = true
        }
        imageElement.onerror = () => {
          if (requestGeneration !== generation) return
          placeholderElement.hidden = false
          placeholderElement.textContent = '暂无图片'
          errorElement.textContent = '图片无法显示，请重新加载'
          retryElement.hidden = false
        }
        imageElement.src = objectUrl
        imageElement.alt = item.label || '实体图片'
      })
      .catch((_error: any) => {
        if (disposed || requestGeneration !== generation || signal.aborted) return
        placeholderElement.textContent = '暂无图片'
        errorElement.textContent = '图片暂时无法读取，请重新加载'
        retryElement.hidden = false
      })
      .finally(() => {
        if (requestGeneration === generation) controller = null
      })
  }

  retryElement.addEventListener('click', () => {
    resetImage()
    refresh()
  })

  const gate = createVisibilityGate(frameElement, refresh)

  return {
    root: hostElement,
    update(nextViewModel: ExtraPanelViewModel) {
      viewModel = nextViewModel
      refresh()
    },
    dispose() {
      disposed = true
      releaseFeedback()
      gate.dispose()
      resetImage()
      viewModel = null
      hostElement.replaceChildren()
    },
  }
}

/**
 * 文本 / 日期 / 时间 / 日期时间输入面板。
 *
 * 校验全部在 `inputCommand` 里完成（长度范围、格式转换、空值），面板只负责
 * "编辑中不写回"：用户正在输入时，状态刷新不能把光标位置冲掉。
 */

const inputDomains = new Set(['text', 'date', 'time', 'datetime'])

const pad2 = (value: any) => String(value).padStart(2, '0')

/** HA 的 datetime 是 ISO 字符串，`<input type="datetime-local">` 要本地时间。 */
export function inputValue(domain: string, state: any): string {
  if (domain !== 'datetime') return String(state ?? '')
  const parsed = new Date(state)
  if (!Number.isFinite(parsed.getTime())) return ''
  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}T${pad2(
    parsed.getHours(),
  )}:${pad2(parsed.getMinutes())}:${pad2(parsed.getSeconds())}`
}

const SERVICE_DATA_KEYS: Record<string, string> = {
  text: 'value',
  date: 'date',
  time: 'time',
  datetime: 'datetime',
}

function inputCommand(entityId: string, state: any, rawValue: any) {
  const domain = String(entityId).split('.')[0]
  const attributes = attributesOf(state)
  if (
    !inputDomains.has(domain) ||
    state?.available === false ||
    typeof state?.state != 'string' ||
    ['unknown', 'unavailable'].includes(state.state) ||
    (domain !== 'text' && !state.state) ||
    typeof rawValue != 'string'
  ) {
    throw Error('该输入实体当前不可用')
  }

  if (domain === 'text') {
    const min = haNumber(attributes.min ?? 0)
    const max = haNumber(attributes.max ?? 64)
    const length = [...rawValue].length
    if (
      !Number.isInteger(min) ||
      !Number.isInteger(max) ||
      (min as number) < 0 ||
      (max as number) < (min as number) ||
      length < (min as number) ||
      length > (max as number)
    ) {
      throw Error('文本长度不符合设备要求')
    }
  } else if (!rawValue) {
    throw Error('请先填写完整内容')
  }

  let value = rawValue
  if (domain === 'datetime') {
    const parsed = new Date(value)
    if (!Number.isFinite(parsed.getTime())) throw Error('日期时间无效')
    value = parsed.toISOString()
  } else if (domain === 'time' && /^\d{2}:\d{2}$/.test(value)) {
    value += ':00'
  }

  return {
    entityId,
    domain,
    service: 'set_value',
    data: { [SERVICE_DATA_KEYS[domain]]: value },
    deviceKind: 'purifier-extra',
  }
}

type InputExtraPanelOptions = {
  element: any
  feedbackSlot?: FeedbackSlot
  onControl?: (command: any) => Promise<any>
}

export function createInputExtraPanel({
  element: hostElement,
  feedbackSlot,
  onControl = async () => {},
}: InputExtraPanelOptions) {
  const ownerDocument = hostElement.ownerDocument || globalThis.document
  const createElement = (tagName: string, textContent = '') => {
    const node = ownerDocument.createElement(tagName)
    node.textContent = textContent
    return node
  }
  const formElement = createElement('form')
  const inputElement = createElement('input') as HTMLInputElement
  const applyButton = createElement('button', '应用') as HTMLButtonElement
  const errorElement = createElement('p')
  const hintElement = createElement('p')

  formElement.className = 'i3d-extra-input-form'
  inputElement.className = 'i3d-extra-input-value'
  applyButton.className = 'i3d-climate-choice'
  applyButton.type = 'submit'
  inputElement.autocomplete = 'off'
  inputElement.spellcheck = false
  hintElement.className = 'i3d-extra-input-hint'
  errorElement.className = 'i3d-climate-error'
  errorElement.setAttribute('role', 'status')
  formElement.append(inputElement, applyButton, hintElement, errorElement)
  hostElement.replaceChildren(formElement)

  let viewModel: ExtraPanelViewModel | null = null
  let contextSignature = ''
  let lastAvailable: boolean | null = null
  let textDirty = false
  let submitting = false
  let expectedValue: any = null
  let disposed = false
  let generation = 0
  let submitTimer: any = null
  let errorText = ''

  function clearPending() {
    clearTimeout(submitTimer)
    submitTimer = null
    submitting = false
    expectedValue = null
  }

  function readState() {
    return viewModel?.state?.newState || viewModel?.state
  }

  function refresh() {
    if (disposed || !viewModel) return
    const { item, editing } = viewModel
    const state = readState()
    const domain = String(item.entityId).split('.')[0]
    const attributes = attributesOf(state)
    const available =
      !!state &&
      state.available !== false &&
      typeof state.state == 'string' &&
      !['unknown', 'unavailable'].includes(state.state) &&
      (domain === 'text' || state.state !== '')
    const signature = JSON.stringify([item.entityId, domain === 'text' ? attributes.mode : domain, !!editing])

    if (contextSignature !== signature) {
      generation++
      clearPending()
      textDirty = false
      errorText = ''
      contextSignature = signature
    }

    if (!available) {
      generation++
      clearPending()
      textDirty = false
      errorText = state?.state === 'unknown' ? '状态未知' : '设备不可用'
    } else if (lastAvailable === false) {
      errorText = ''
    }
    lastAvailable = !!available

    if (
      submitting &&
      (domain === 'datetime'
        ? new Date(state.state).getTime() === new Date(expectedValue).getTime()
        : domain === 'time'
          ? String(state.state).slice(0, 8) === expectedValue
          : state.state === expectedValue)
    ) {
      generation++
      clearPending()
      textDirty = false
      errorText = ''
    }

    inputElement.type =
      domain === 'text'
        ? attributes.mode === 'password'
          ? 'password'
          : 'text'
        : domain === 'datetime'
          ? 'datetime-local'
          : domain
    inputElement.step = '1'
    inputElement.setAttribute('aria-label', item.label || item.entityId)

    const min = haNumber(attributes.min ?? 0)
    const max = haNumber(attributes.max ?? 64)
    const textRangeValid =
      domain !== 'text' ||
      (Number.isInteger(min) && Number.isInteger(max) && (min as number) >= 0 && (max as number) >= (min as number))

    inputElement.disabled = !!(editing || !available || submitting || item.modelAvailable === false || !textRangeValid)
    applyButton.disabled = inputElement.disabled
    applyButton.textContent = '应用'
    applyButton.setAttribute('aria-busy', String(submitting))

    if (!textDirty && !submitting) {
      inputElement.value = available ? inputValue(domain, state.state) : ''
    }

    hintElement.textContent =
      domain === 'text'
        ? textRangeValid
          ? `允许 ${min}–${max} 个字符${attributes.pattern ? ' · 格式按设备规则校验' : ''}`
          : '设备的文本范围无效'
        : domain === 'datetime'
          ? '按当前浏览器时区填写'
          : ''
    errorElement.textContent = errorText
  }

  inputElement.addEventListener('input', () => {
    if (inputElement.disabled) return
    textDirty = true
    errorText = ''
    errorElement.textContent = ''
  })

  inputElement.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !submitting) {
      textDirty = false
      errorText = ''
      refresh()
    }
  })

  formElement.addEventListener('submit', async (event: Event) => {
    event.preventDefault()
    if (disposed || !viewModel || inputElement.disabled || submitting) return
    const requestGeneration = ++generation
    try {
      if (typeof inputElement.checkValidity == 'function' && !inputElement.checkValidity()) {
        inputElement.reportValidity?.()
        return
      }
      const command = inputCommand(viewModel.item.entityId, viewModel.state, inputElement.value)
      expectedValue = Object.values(command.data)[0]
      submitting = true
      errorText = ''
      refresh()
      if (submitting) {
        submitTimer = setTimeout(() => {
          if (disposed || requestGeneration !== generation) return
          clearPending()
          textDirty = false
          errorText = '设备响应超时，请重试'
          refresh()
        }, 10_000)
        submitTimer?.unref?.()
      }
      await onControl(command)
    } catch (error: any) {
      if (!disposed && requestGeneration === generation) {
        clearPending()
        errorText = error?.message || '更新失败，请重试'
        refresh()
      }
    }
  })

  const releaseFeedback = attachFeedback(feedbackSlot, errorElement, {
    source: () => viewModel?.item?.entityId,
    label: () => viewModel?.item?.label,
  })

  return {
    root: hostElement,
    update(nextViewModel: ExtraPanelViewModel) {
      if (disposed) return
      if (extraContextChanged(viewModel, nextViewModel)) {
        generation++
        clearPending()
        textDirty = false
        errorText = ''
      }
      viewModel = nextViewModel
      refresh()
    },
    dispose() {
      disposed = true
      releaseFeedback()
      generation++
      clearPending()
      viewModel = null
      hostElement.replaceChildren()
    },
  }
}

/**
 * 灯光附加面板：电源、亮度、色温、色盘、RGBW/RGBWW 通道、灯效、闪烁、渐变。
 *
 * 与 0.7.8 保持一致的能力裁剪：
 * - 有 `brightness` 模式才给亮度条；
 * - `color_temp` 且色温上下限合法才给色温条；
 * - 灯效 / 闪烁 / 渐变分别受 supported_features 的 4 / 8 / 32 位控制；
 * - 亮度拖到 0 直接 `turn_off`，而不是 `turn_on(brightness=0)`。
 */

/** supported_features 位：灯效 / 闪烁 / 渐变。 */
const LIGHT_EFFECT = 0x4
const LIGHT_FLASH = 0x8
const LIGHT_TRANSITION = 0x20

const CHANNEL_LABELS = ['红', '绿', '蓝', '白', '暖白']

function lightExtraCapabilities(state: any) {
  const attributes = attributesOf(state)
  const modes = stringOptions(attributes.supported_color_modes)
  const flags = featureFlags(attributes)
  const minKelvin = haNumber(attributes.min_color_temp_kelvin)
  const maxKelvin = haNumber(attributes.max_color_temp_kelvin)
  return {
    a: attributes,
    modes,
    brightness: modes.some((mode) => brightnessModes.has(mode)),
    color: lightRuntime.lightSupportsColor(attributes),
    temperature:
      modes.includes('color_temp') &&
      minKelvin !== null &&
      (minKelvin as number) > 0 &&
      maxKelvin !== null &&
      (maxKelvin as number) >= (minKelvin as number),
    white: modes.includes('white'),
    effects: flags & LIGHT_EFFECT ? stringOptions(attributes.effect_list) : [],
    flash: !!(flags & LIGHT_FLASH),
    transition: !!(flags & LIGHT_TRANSITION),
  }
}

type LightExtraPanelOptions = {
  element: any
  headerControls?: any
  feedbackSlot?: FeedbackSlot
  onControl?: (command: any) => Promise<any>
}

export function createLightExtraPanel({
  element: hostElement,
  headerControls,
  feedbackSlot,
  onControl = async () => {},
}: LightExtraPanelOptions) {
  const pickers = enhancePopupSelects(hostElement)
  const ownerDocument = hostElement.ownerDocument || globalThis.document
  const createElement = (tagName: string, textContent = '') => {
    const node = ownerDocument.createElement(tagName)
    node.textContent = textContent
    return node
  }

  hostElement.classList.add('i3d-extra-light')
  const statusElement = createElement('p')
  const powerButton = createElement('button') as HTMLButtonElement
  const formElement = createElement('div')
  const errorElement = createElement('p')
  powerButton.type = 'button'
  powerButton.className = 'i3d-climate-choice'
  powerButton.setAttribute('role', 'switch')
  formElement.className = 'i3d-extra-form'
  errorElement.className = 'i3d-climate-error'
  errorElement.setAttribute('role', 'status')

  let viewModel: ExtraPanelViewModel | null = null
  let disposed = false
  let generation = 0
  let busy = false
  let contextSignature = ''

  const feedback = createRangeFeedback({
    onChange: refresh,
    onTimeout: () => {
      errorElement.textContent = '设备未响应，请重试。'
    },
  })
  const fields = new Map<string, any>()

  const colorPicker = createLightColorPicker({
    onPreview: () => null,
    onCancel: () => {},
    onCommit: (hsColor: any) =>
      void sendCommand('turn_on', lightRuntime.lightColorServiceData(attributesOf(viewModel?.state), hsColor)),
  })

  const isUsable = () =>
    !!viewModel &&
    viewModel.state?.available !== false &&
    !['unknown', 'unavailable', '', undefined].includes(viewModel.state?.state) &&
    viewModel.item?.modelAvailable !== false

  const isDisabled = () => busy || !viewModel || viewModel.editing || !isUsable()

  async function sendCommand(service: string, data: any = {}, rangeKey?: string, rangeEntry?: any) {
    if (isDisabled()) return
    const requestGeneration = generation
    busy = true
    errorElement.textContent = ''
    refresh()
    try {
      await onControl({
        entityId: viewModel!.item.entityId,
        domain: 'light',
        service,
        data,
      })
      if (disposed || requestGeneration !== generation) return
      errorElement.textContent = ''
    } catch (error: any) {
      if (!disposed && requestGeneration === generation) {
        if (rangeKey && rangeEntry) feedback.cancel(rangeKey, rangeEntry)
        errorElement.textContent = error?.message || '灯光控制失败'
      }
    } finally {
      if (!disposed && requestGeneration === generation) {
        busy = false
        refresh()
      }
    }
  }

  function buildField(
    key: string,
    labelText: string,
    type: string,
    min: any = null,
    max: any = null,
    step: any = null,
    service = 'turn_on',
    dataKey = key,
  ) {
    const row = createElement('label')
    const readout = createElement('span', labelText)
    const input = createElement(type === 'select' ? 'select' : 'input') as any
    row.className = 'i3d-extra-field'
    input.setAttribute('aria-label', labelText)
    input.name = `i3d-extra-light-${key}`
    if (type !== 'select') {
      input.type = type
      input.min = min
      input.max = max
      input.step = step
    }
    if (type === 'range') {
      input.addEventListener('input', () => {
        if (input.disabled) return
        feedback.preview(key, Number(input.value))
        readout.textContent = `${labelText} ${input.value}`
      })
    }
    input.addEventListener('change', () => {
      const value = type === 'select' ? input.value : Number(input.value)
      if (key === 'transition' || isDisabled()) return
      const rangeEntry = type === 'range' ? feedback.commit(key, value) : null
      const data: any = { [dataKey]: value }
      const transitionField = fields.get('transition')
      if (transitionField && Number(transitionField.input.value) > 0) {
        data.transition = Number(transitionField.input.value)
      }
      if (key === 'brightness' && value === 0) {
        delete data.brightness
        void sendCommand('turn_off', data, key, rangeEntry)
      } else {
        void sendCommand(service, data, key, rangeEntry)
      }
    })
    for (const eventName of ['blur', 'pointercancel']) {
      input.addEventListener(eventName, () => {
        feedback.cancelPreview(key)
        refresh()
      })
    }
    row.append(readout, input)
    formElement.append(row)
    fields.set(key, { row, input, readout, label: labelText, type })
    return input
  }

  function rebuild(capabilities: any) {
    feedback.reset()
    fields.clear()
    formElement.replaceChildren()
    colorPicker.root.hidden = true

    if (capabilities.brightness) buildField('brightness', '亮度', 'range', 0, 255, 1)
    if (capabilities.temperature) {
      buildField(
        'color_temp_kelvin',
        '色温 K',
        'range',
        capabilities.a.min_color_temp_kelvin,
        capabilities.a.max_color_temp_kelvin,
        1,
      )
    }
    if (capabilities.color) formElement.append(colorPicker.root)
    if (capabilities.white) buildField('white', '独立白光', 'range', 0, 255, 1)

    for (const [mode, channels] of [
      ['rgbw', 4],
      ['rgbww', 5],
    ] as const) {
      if (!capabilities.modes.includes(mode)) continue
      const channelSet = createElement('fieldset')
      const legend = createElement('legend', mode === 'rgbw' ? 'RGBW 通道' : 'RGBWW 通道')
      channelSet.append(legend)
      channelSet.className = 'i3d-extra-channels'
      formElement.append(channelSet)
      const inputs: HTMLInputElement[] = []
      for (let index = 0; index < channels; index++) {
        const channelRow = createElement('label')
        const channelInput = createElement('input') as HTMLInputElement
        channelRow.append(createElement('span', CHANNEL_LABELS[index]), channelInput)
        channelInput.type = 'number'
        channelInput.min = '0'
        channelInput.max = '255'
        channelInput.step = '1'
        channelInput.setAttribute('aria-label', `${mode.toUpperCase()} ${CHANNEL_LABELS[index]}`)
        channelSet.append(channelRow)
        inputs.push(channelInput)
      }
      const applyButton = createElement('button', '应用通道') as HTMLButtonElement
      applyButton.type = 'button'
      applyButton.className = 'i3d-climate-choice'
      channelSet.append(applyButton)
      applyButton.addEventListener('click', () => {
        const values = inputs.map((input) => (input.value === '' ? NaN : Number(input.value)))
        if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
          errorElement.textContent = '每个通道请输入 0–255。'
          return
        }
        void sendCommand('turn_on', { [`${mode}_color`]: values })
      })
      fields.set(mode, { row: channelSet, inputs, apply: applyButton, channel: true })
    }

    if (capabilities.effects.length) {
      const effectSelect = buildField('effect', '灯效', 'select')
      for (const effect of capabilities.effects) {
        const option = createElement('option', effect) as HTMLOptionElement
        option.value = effect
        effectSelect.append(option)
      }
    }
    if (capabilities.flash) {
      const flashSelect = buildField('flash', '闪烁', 'select')
      for (const [value, label] of [
        ['', '选择闪烁'],
        ['short', '短闪'],
        ['long', '长闪'],
      ]) {
        const option = createElement('option', label) as HTMLOptionElement
        option.value = value
        flashSelect.append(option)
      }
      flashSelect.addEventListener('change', () => {
        flashSelect.value = ''
      })
    }
    if (capabilities.transition) {
      const transitionInput = buildField('transition', '渐变秒数', 'number', 0, 300, 0.1)
      transitionInput.value = '0'
    }
    pickers.close()
  }

  function refresh() {
    if (!viewModel || disposed) return
    const capabilities = lightExtraCapabilities(viewModel.state)
    const signature = JSON.stringify([
      capabilities.modes,
      capabilities.effects,
      capabilities.flash,
      capabilities.transition,
      capabilities.a.min_color_temp_kelvin,
      capabilities.a.max_color_temp_kelvin,
    ])
    if (signature !== contextSignature) {
      contextSignature = signature
      rebuild(capabilities)
    }

    const isOn = viewModel.state?.state === 'on'
    const unknown = viewModel.state?.state === 'unknown'
    statusElement.textContent = isUsable() ? (isOn ? '已开启' : '已关闭') : unknown ? '状态未知' : '设备不可用'
    statusElement.hidden = isUsable()
    statusElement.title = statusElement.textContent
    powerButton.textContent = isOn ? '关闭' : '开启'
    powerButton.setAttribute('aria-checked', String(isOn))
    powerButton.disabled = isDisabled()
    powerButton.setAttribute('aria-label', `${viewModel.item.label || '灯光'}电源`)

    for (const [key, field] of fields) {
      if (field.channel) {
        const channelColor = capabilities.a[`${key}_color`]
        field.inputs.forEach((input: HTMLInputElement, index: number) => {
          input.disabled = isDisabled()
          if (ownerDocument.activeElement !== input) {
            input.value =
              Array.isArray(channelColor) && haNumber(channelColor[index]) !== null ? channelColor[index] : ''
          }
        })
        field.apply.disabled = isDisabled()
        continue
      }
      field.input.disabled = isDisabled()
      let value =
        key === 'brightness'
          ? isOn
            ? haNumber(capabilities.a.brightness)
            : 0
          : key === 'white'
            ? capabilities.a.color_mode === 'white'
              ? haNumber(capabilities.a.brightness)
              : null
            : capabilities.a[key]
      if (!['transition', 'flash'].includes(key)) {
        if (field.type === 'range') value = feedback.read(key, haNumber(value), 0.5)
        if (field.type === 'range' || !pickers.focused(field.input)) {
          field.input.value = value ?? (field.type === 'range' ? field.input.min : '')
        }
        field.readout.textContent = field.type === 'range' ? `${field.label} ${value ?? '暂无读数'}` : field.label
      }
    }

    colorPicker.update({
      entityId: viewModel.item.entityId,
      enabled: !isDisabled(),
      visible: capabilities.color,
      hs: lightRuntime.lightColorHs(capabilities.a) || [0, 0],
    })
    if (headerControls) hostElement.hidden = !formElement.childElementCount && !errorElement.textContent
    pickers.sync()
  }

  powerButton.addEventListener(
    'click',
    () => void sendCommand(viewModel?.state?.state === 'on' ? 'turn_off' : 'turn_on'),
  )
  if (headerControls) {
    headerControls.replaceChildren(statusElement, powerButton)
    hostElement.replaceChildren(formElement, errorElement)
  } else {
    const heading = createElement('div')
    heading.className = 'i3d-extra-light-heading'
    heading.append(statusElement, powerButton)
    hostElement.replaceChildren(heading, formElement, errorElement)
  }
  const releaseFeedback = attachFeedback(feedbackSlot, errorElement, {
    source: () => viewModel?.item?.entityId,
    label: () => viewModel?.item?.label,
  })

  return {
    root: hostElement,
    update(nextViewModel: ExtraPanelViewModel) {
      if (disposed) return
      if (extraContextChanged(viewModel, nextViewModel)) {
        feedback.reset()
        pickers.close()
        generation++
        busy = false
        errorElement.textContent = ''
      }
      viewModel = nextViewModel
      refresh()
    },
    dispose() {
      feedback.reset()
      disposed = true
      pickers.dispose()
      releaseFeedback()
      generation++
      colorPicker.dispose()
      viewModel = null
      headerControls?.replaceChildren()
      hostElement.replaceChildren()
    },
  }
}

/**
 * 列表型实体面板：日程 / 待办 / 天气 / 固件更新。
 *
 * 共同点：状态只能表达"有/无"，真正的数据要按需调用 `list_events`、`get_items`、
 * `get_forecasts` 等带返回值的服务。所以这里全部按需拉取（滚到可见区 + 空闲时），
 * 并把写操作做成"二次点击确认"，避免误删日程 / 待办。
 */

/** 服务返回值可能是 `{ service_response: {...} }`，也可能直接是结果体。 */
export function unwrapExtraResponse(response: any, entityId: string) {
  const payload = response?.service_response ?? response
  return payload?.[entityId] ?? payload
}

const toLocalDateTimeInput = (value: any) => {
  if (!value) return ''
  const parsed = new Date(value)
  return Number.isFinite(parsed.valueOf())
    ? new Date(parsed.valueOf() - parsed.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
    : ''
}

const toIsoDateTime = (value: any) => {
  const parsed = new Date(value)
  if (!value || !Number.isFinite(parsed.valueOf())) throw Error('请填写有效时间。')
  return parsed.toISOString()
}

/** calendar 能力位：1=创建；2=删除；4=更新。 */
const CALENDAR_CREATE = 0x1
const CALENDAR_DELETE = 0x2
const CALENDAR_UPDATE = 0x4
/** todo 能力位：1=新增；2=删除；4=更新状态；8=排序；16=清理已完成。 */
const TODO_ADD = 0x1
const TODO_REMOVE = 0x2
const TODO_UPDATE = 0x4
const TODO_MOVE = 0x8
const TODO_CLEAR = 0x10
/** todo supported_features 位：32=到期时间；64=描述。 */
const TODO_DUE_DATETIME = 0x20
const TODO_DESCRIPTION = 0x40
/** weather 能力位：1=每日；2=每小时；4=半日。 */
const WEATHER_DAILY = 0x1
const WEATHER_HOURLY = 0x2
const WEATHER_TWICE_DAILY = 0x4
/** update 能力位：1=安装；2=指定版本；4=跳过；8=备份；16=更新说明。 */
const UPDATE_INSTALL = 0x1
const UPDATE_VERSION = 0x2
const UPDATE_BACKUP = 0x8
const UPDATE_RELEASE_NOTES = 0x10

type ListExtraPanelOptions = {
  element: any
  feedbackSlot?: FeedbackSlot
  onControl?: (command: any) => Promise<any>
}

export function createListExtraPanel({
  element: hostElement,
  feedbackSlot,
  onControl = async () => {},
}: ListExtraPanelOptions) {
  const pickers = enhancePopupSelects(hostElement)
  const ownerDocument = hostElement.ownerDocument || globalThis.document
  const createElement = (tagName: string, textContent = '') => {
    const node = ownerDocument.createElement(tagName)
    node.textContent = textContent
    return node
  }

  const statusElement = createElement('p')
  const readoutsElement = createElement('div')
  const actionsElement = createElement('div')
  const contentElement = createElement('div')
  const formElement = createElement('div')
  const errorElement = createElement('p')
  const refreshButton = createElement('button', '刷新内容') as HTMLButtonElement

  hostElement.classList.add('i3d-extra-list-panel')
  actionsElement.className = 'i3d-extra-actions'
  formElement.className = 'i3d-extra-form'
  contentElement.className = 'i3d-extra-list-content'
  readoutsElement.className = 'i3d-extra-readouts'
  errorElement.className = 'i3d-climate-error'
  errorElement.setAttribute('role', 'status')
  refreshButton.type = 'button'
  refreshButton.className = 'i3d-climate-choice'
  actionsElement.append(refreshButton)
  hostElement.replaceChildren(statusElement, readoutsElement, actionsElement, contentElement, formElement, errorElement)

  let viewModel: ExtraPanelViewModel | null = null
  let disposed = false
  let generation = 0
  let busyCount = 0
  let contentLoading = false
  let contentSignature = ''
  let confirmSignature = ''
  let payload: any = null
  const inputs = new Map<string, any>()

  const stateOf = () => viewModel?.state?.newState || viewModel?.state
  const attributes = () => attributesOf(stateOf())
  const flags = () => featureFlags(attributes())
  const isUsable = () =>
    !!viewModel &&
    viewModel.item.modelAvailable !== false &&
    stateOf()?.available !== false &&
    !['', 'unavailable', 'unknown', undefined].includes(stateOf()?.state)
  const isDisabled = () => disposed || !viewModel || viewModel.editing || !isUsable() || busyCount > 0
  const domain = () => String(viewModel?.item?.entityId).split('.')[0]

  function addButton(parent: any, label: string, onClick: () => any) {
    const button = createElement('button', label) as HTMLButtonElement
    button.type = 'button'
    button.className = 'i3d-climate-choice'
    button.addEventListener('click', onClick)
    parent.append(button)
    return button
  }

  function addField(key: string, label: string, type = 'text', options: any = {}) {
    const row = createElement('label')
    const input = createElement(type === 'select' ? 'select' : type === 'textarea' ? 'textarea' : 'input') as any
    row.className = 'i3d-extra-field'
    row.append(createElement('span', label), input)
    input.setAttribute('aria-label', label)
    if (!['select', 'textarea'].includes(type)) input.type = type
    if (options.choices) {
      for (const [value, text] of options.choices) {
        const option = createElement('option', text) as HTMLOptionElement
        option.value = value
        input.append(option)
      }
    }
    if (options.value !== undefined) input.value = options.value
    if (type === 'checkbox') input.checked = !!options.value
    ;(options.parent || formElement).append(row)
    inputs.set(key, input)
    return input
  }

  async function callService(service: string, data: any = {}, refreshContent = false, confirm = false) {
    if (isDisabled()) return
    if (confirm && (confirmSignature !== JSON.stringify([service, data]) || !errorElement.textContent)) {
      confirmSignature = JSON.stringify([service, data])
      errorElement.dataset.kind = 'confirm'
      errorElement.textContent = '请再次点击确认此操作。'
      return
    }
    confirmSignature = ''
    const requestGeneration = generation
    busyCount++
    errorElement.textContent = ''
    syncDisabled()
    try {
      const response = await onControl({
        entityId: viewModel!.item.entityId,
        domain: domain(),
        service,
        data,
      })
      if (disposed || requestGeneration !== generation) return
      if (refreshContent) {
        contentLoading = false
        busyCount--
        await loadContent()
        if (disposed || requestGeneration !== generation) return
        busyCount++
      } else {
        return response
      }
    } catch (error: any) {
      if (!disposed && requestGeneration === generation) {
        errorElement.dataset.kind = 'error'
        errorElement.textContent = error?.message || '内容操作失败'
      }
    } finally {
      if (!disposed && requestGeneration === generation) {
        busyCount--
        syncDisabled()
      }
    }
  }

  const inputValue = (key: string) => inputs.get(key)?.value || ''
  const readRange = () => ({
    start: toIsoDateTime(inputValue('range-start')),
    end: toIsoDateTime(inputValue('range-end')),
  })

  async function loadContent() {
    if (isDisabled() || !gate.visible() || disposed) return
    const requestGeneration = generation
    let service: string | undefined
    let data: any = {}
    try {
      if (domain() === 'calendar') {
        service = 'list_events'
        data = readRange()
      } else if (domain() === 'todo') {
        service = 'get_items'
      } else if (domain() === 'weather') {
        service = 'get_forecasts'
        data = { type: inputValue('forecast') }
        if (!data.type) {
          contentLoading = false
          return
        }
      }
      if (!service) {
        contentLoading = false
        return
      }
      contentLoading = true
      const response = await callService(service, data)
      if (disposed || requestGeneration !== generation || response === undefined) return
      payload = unwrapExtraResponse(response, viewModel!.item.entityId)
      contentLoading = false
      renderContent()
    } catch (error: any) {
      if (requestGeneration !== generation || disposed) return
      errorElement.dataset.kind = 'error'
      errorElement.textContent = error?.message
    }
  }

  function addCalendarForm(parent: any, event: any = null) {
    const details = createElement('details')
    const summary = createElement('summary', event ? '编辑日程' : '新增日程')
    const body = createElement('div')
    details.append(summary, body)
    body.className = 'i3d-extra-form'
    parent.append(details)
    const localInputs = new Map<string, any>()
    const addLocal = (key: string, label: string, type: string, value: any) => {
      const row = createElement('label')
      const input = createElement(type === 'textarea' ? 'textarea' : 'input') as any
      row.className = 'i3d-extra-field'
      if (type !== 'textarea') input.type = type
      input.value = value || ''
      input.setAttribute('aria-label', label)
      row.append(createElement('span', label), input)
      body.append(row)
      localInputs.set(key, input)
      return input
    }
    addLocal('summary', '日程标题', 'text', event?.summary)
    const allDay = addLocal('allDay', '全天日程', 'checkbox', '') as HTMLInputElement
    allDay.checked = !!(
      event?.all_day ||
      event?.start?.date ||
      (typeof event?.start == 'string' && !event.start.includes('T'))
    )
    const eventTime = (key: string) =>
      typeof event?.[key] == 'object' ? event[key].dateTime || event[key].date : event?.[key]
    const startInput = addLocal('start', '开始', 'datetime-local', toLocalDateTimeInput(eventTime('start')))
    const endInput = addLocal('end', '结束', 'datetime-local', toLocalDateTimeInput(eventTime('end')))
    const syncAllDay = () => {
      for (const input of [startInput, endInput]) {
        const current = input.value
        input.type = allDay.checked ? 'date' : 'datetime-local'
        input.value = allDay.checked ? current.slice(0, 10) : current.length === 10 ? `${current}T00:00` : current
      }
    }
    allDay.addEventListener('change', syncAllDay)
    if (allDay.checked) {
      syncAllDay()
      startInput.value = String(eventTime('start') || '').slice(0, 10)
      endInput.value = String(eventTime('end') || '').slice(0, 10)
    }
    addLocal('description', '日程说明', 'textarea', event?.description)
    addLocal('location', '地点', 'text', event?.location)
    addButton(body, event ? '保存日程' : '创建日程', () => {
      try {
        const core = {
          summary: localInputs.get('summary').value,
          description: localInputs.get('description').value,
          location: localInputs.get('location').value,
        }
        const start = allDay.checked ? startInput.value : toIsoDateTime(startInput.value)
        const end = allDay.checked ? endInput.value : toIsoDateTime(endInput.value)
        if (event) {
          void callService(
            'update_event',
            {
              uid: event.uid,
              event: { ...core, start, end },
              ...(event.recurrence_id ? { recurrence_id: event.recurrence_id } : {}),
            },
            true,
          )
        } else {
          void callService(
            'create_event',
            {
              ...core,
              [allDay.checked ? 'start_date' : 'start_date_time']: start,
              [allDay.checked ? 'end_date' : 'end_date_time']: end,
            },
            true,
          )
        }
      } catch (error: any) {
        errorElement.dataset.kind = 'error'
        errorElement.textContent = error?.message
      }
    })
  }

  function addTodoForm(parent: any, item: any = null) {
    const details = createElement('details')
    const summary = createElement('summary', item ? '编辑待办' : '新增待办')
    const body = createElement('div')
    details.append(summary, body)
    body.className = 'i3d-extra-form'
    parent.append(details)
    const localFlags = flags()
    const addLocal = (label: string, type: string, value: any) => {
      const row = createElement('label')
      const input = createElement(type === 'textarea' ? 'textarea' : 'input') as any
      row.className = 'i3d-extra-field'
      if (type !== 'textarea') input.type = type
      input.value = value || ''
      input.setAttribute('aria-label', label)
      row.append(createElement('span', label), input)
      body.append(row)
      return input
    }
    const titleInput = addLocal('待办标题', 'text', item?.summary)
    const descriptionInput = localFlags & TODO_DESCRIPTION ? addLocal('待办说明', 'textarea', item?.description) : null
    const dueInput =
      localFlags & (TODO_DUE_DATETIME | 0x10)
        ? addLocal(
            localFlags & TODO_DUE_DATETIME ? '到期时间' : '到期日期',
            localFlags & TODO_DUE_DATETIME ? 'datetime-local' : 'date',
            localFlags & TODO_DUE_DATETIME ? toLocalDateTimeInput(item?.due) : item?.due?.slice(0, 10),
          )
        : null
    addButton(body, item ? '保存待办' : '添加待办', () => {
      try {
        const data: any = item
          ? { item: item.uid || item.summary, rename: titleInput.value }
          : { item: titleInput.value }
        if (descriptionInput) data.description = descriptionInput.value
        if (dueInput?.value) {
          data[localFlags & TODO_DUE_DATETIME ? 'due_datetime' : 'due_date'] =
            localFlags & TODO_DUE_DATETIME ? toIsoDateTime(dueInput.value) : dueInput.value
        }
        void callService(item ? 'update_item' : 'add_item', data, true)
      } catch (error: any) {
        errorElement.dataset.kind = 'error'
        errorElement.textContent = error?.message
      }
    })
  }

  function renderContent() {
    contentElement.replaceChildren()
    const localFlags = flags()
    const currentDomain = domain()

    if (currentDomain === 'calendar') {
      const events = Array.isArray(payload) ? payload : payload?.events || []
      if (!events.length) contentElement.append(createElement('p', '此时间段暂无日程'))
      for (const event of events) {
        const article = createElement('article')
        article.append(createElement('strong', event.summary || '无标题日程'))
        const eventTime = (value: any) => (typeof value == 'object' ? value.dateTime || value.date : value)
        article.append(createElement('p', `${eventTime(event.start)} → ${eventTime(event.end)}`))
        if (event.location) article.append(createElement('p', event.location))
        if (event.description) article.append(createElement('p', event.description))
        if (localFlags & CALENDAR_UPDATE && event.uid) addCalendarForm(article, event)
        if (localFlags & CALENDAR_DELETE && event.uid) {
          addButton(
            article,
            '删除日程',
            () =>
              void callService(
                'delete_event',
                {
                  uid: event.uid,
                  ...(event.recurrence_id ? { recurrence_id: event.recurrence_id } : {}),
                },
                true,
                true,
              ),
          )
        }
        contentElement.append(article)
      }
    } else if (currentDomain === 'todo') {
      const items = payload?.items || []
      if (!items.length) contentElement.append(createElement('p', '暂无待办事项'))
      items.forEach((todo: any, index: number) => {
        const article = createElement('article')
        article.append(createElement('strong', todo.summary || '无标题待办'))
        if (todo.description) article.append(createElement('p', todo.description))
        if (todo.due) article.append(createElement('p', `到期 ${todo.due}`))
        if (localFlags & TODO_UPDATE) {
          addButton(
            article,
            todo.status === 'completed' ? '恢复待办' : '标记完成',
            () =>
              void callService(
                'update_item',
                {
                  item: todo.uid || todo.summary,
                  status: todo.status === 'completed' ? 'needs_action' : 'completed',
                },
                true,
              ),
          )
        } else {
          article.append(createElement('span', todo.status === 'completed' ? '已完成' : '待完成'))
        }
        if (localFlags & TODO_UPDATE) addTodoForm(article, todo)
        if (localFlags & TODO_MOVE && todo.uid && index > 0) {
          addButton(
            article,
            '上移',
            () =>
              void callService(
                'move_item',
                {
                  uid: todo.uid,
                  ...(index > 1 ? { previous_uid: items[index - 2].uid } : {}),
                },
                true,
              ),
          )
        }
        if (localFlags & TODO_REMOVE) {
          addButton(
            article,
            '删除待办',
            () => void callService('remove_item', { item: todo.uid || todo.summary }, true, true),
          )
        }
        contentElement.append(article)
      })
    } else if (currentDomain === 'weather') {
      const forecast = payload?.forecast || []
      if (!forecast.length) contentElement.append(createElement('p', '暂无预报数据'))
      for (const entry of forecast) {
        const article = createElement('article')
        article.append(createElement('strong', entry.datetime ? new Date(entry.datetime).toLocaleString() : ''))
        for (const [key, label, unit] of [
          ['condition', '天气', ''],
          ['temperature', '温度', attributes().temperature_unit || ''],
          ['templow', '最低温', attributes().temperature_unit || ''],
          ['precipitation_probability', '降水概率', '%'],
          ['precipitation', '降水', attributes().precipitation_unit || ''],
          ['wind_speed', '风速', attributes().wind_speed_unit || ''],
          ['humidity', '湿度', '%'],
        ] as const) {
          if (entry[key] != null) article.append(createElement('span', `${label} ${entry[key]}${unit}`))
        }
        contentElement.append(article)
      }
    }
    syncDisabled()
  }

  function buildForms() {
    inputs.clear()
    formElement.replaceChildren()
    actionsElement.replaceChildren(refreshButton)
    contentElement.replaceChildren()
    const localFlags = flags()
    const currentDomain = domain()
    refreshButton.hidden = currentDomain === 'update'

    if (currentDomain === 'calendar') {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(end.getDate() + 7)
      addField('range-start', '查看开始', 'datetime-local', {
        parent: actionsElement,
        value: toLocalDateTimeInput(start),
      })
      addField('range-end', '查看结束', 'datetime-local', {
        parent: actionsElement,
        value: toLocalDateTimeInput(end),
      })
      if (localFlags & CALENDAR_CREATE) addCalendarForm(formElement)
    } else if (currentDomain === 'todo') {
      if (localFlags & TODO_ADD) addTodoForm(formElement)
      if (localFlags & TODO_CLEAR) {
        addButton(formElement, '清理已完成待办', () => void callService('remove_completed_items', {}, true, true))
      }
    } else if (currentDomain === 'weather') {
      const forecasts = (
        [
          ['daily', '每日', WEATHER_DAILY],
          ['hourly', '每小时', WEATHER_HOURLY],
          ['twice_daily', '半日', WEATHER_TWICE_DAILY],
        ] as const
      )
        .filter(([, , bit]) => localFlags & bit)
        .map(([value, label]) => [value, label])
      if (forecasts.length) {
        addField('forecast', '预报方式', 'select', {
          parent: actionsElement,
          choices: forecasts,
        }).addEventListener('change', () => void loadContent())
      } else {
        refreshButton.hidden = true
      }
    } else if (currentDomain === 'update') {
      if (localFlags & UPDATE_VERSION) addField('version', '指定版本（留空为最新）')
      if (localFlags & UPDATE_BACKUP) addField('backup', '更新前备份', 'checkbox')
      if (localFlags & UPDATE_INSTALL) {
        const installButton = addButton(
          formElement,
          '安装更新',
          () =>
            void callService(
              'install',
              {
                ...(inputValue('version') ? { version: inputValue('version') } : {}),
                ...(localFlags & UPDATE_BACKUP ? { backup: !!inputs.get('backup')?.checked } : {}),
              },
              false,
              true,
            ),
        )
        installButton.dataset.install = 'true'
        addButton(formElement, '跳过此版本', () => void callService('skip'))
        addButton(formElement, '清除跳过版本', () => void callService('clear_skipped'))
        if (localFlags & UPDATE_RELEASE_NOTES) {
          addButton(formElement, '查看更新说明', async () => {
            const requestGeneration = generation
            const response = await callService('release_notes')
            if (disposed || requestGeneration !== generation || response === undefined) return
            contentElement.replaceChildren(
              createElement('p', typeof response == 'string' ? response : response?.release_notes || '暂无更新说明'),
            )
          })
        }
      }
    }
    pickers.sync()
  }

  function syncDisabled() {
    for (const element of hostElement.querySelectorAll('button,input,select,textarea')) {
      element.disabled = isDisabled() || (element.dataset.install === 'true' && !!attributes().in_progress)
    }
    pickers.sync()
  }

  function render() {
    if (disposed || !viewModel) return
    const currentDomain = domain()
    const state = stateOf()
    const stateAttributes = attributes()
    const signature = JSON.stringify([viewModel.item.entityId, flags()])
    if (signature !== contentSignature) {
      contentSignature = signature
      contentLoading = false
      payload = null
      buildForms()
    }

    statusElement.textContent = isUsable()
      ? currentDomain === 'update'
        ? state.state === 'on'
          ? '有可用更新'
          : '已是最新版本'
        : currentDomain === 'todo'
          ? `未完成 ${state.state} 项`
          : currentDomain === 'calendar'
            ? state.state === 'on'
              ? '当前有日程'
              : '当前无进行中的日程'
            : state.state
      : state?.state === 'unknown'
        ? '状态未知'
        : '设备不可用'

    const entries =
      currentDomain === 'update'
        ? [
            ['当前版本', stateAttributes.installed_version],
            ['最新版本', stateAttributes.latest_version],
            ['已跳过', stateAttributes.skipped_version],
            [
              '安装进度',
              stateAttributes.update_percentage == null
                ? stateAttributes.in_progress
                  ? '进行中'
                  : null
                : `${stateAttributes.update_percentage}%`,
            ],
          ]
        : currentDomain === 'weather'
          ? [
              [
                '温度',
                stateAttributes.temperature == null
                  ? null
                  : `${stateAttributes.temperature}${stateAttributes.temperature_unit || ''}`,
              ],
              ['湿度', stateAttributes.humidity == null ? null : `${stateAttributes.humidity}%`],
              [
                '气压',
                stateAttributes.pressure == null
                  ? null
                  : `${stateAttributes.pressure}${stateAttributes.pressure_unit || ''}`,
              ],
              [
                '风速',
                stateAttributes.wind_speed == null
                  ? null
                  : `${stateAttributes.wind_speed}${stateAttributes.wind_speed_unit || ''}`,
              ],
            ]
          : []
    readoutsElement.replaceChildren(
      ...entries
        .filter(([, value]) => value != null)
        .map(([label, value]) => createElement('span', `${label} ${value}`)),
    )

    syncDisabled()
    if (isUsable() && !viewModel.editing && gate.visible() && !contentLoading && !busyCount) {
      void loadContent()
    }
  }

  refreshButton.addEventListener('click', () => void loadContent())
  const gate = createVisibilityGate(hostElement, render)
  const releaseFeedback = attachFeedback(feedbackSlot, errorElement, {
    source: () => viewModel?.item?.entityId,
    label: () => viewModel?.item?.label,
    onRetire: () => {
      confirmSignature = ''
    },
  })

  return {
    root: hostElement,
    update(nextViewModel: ExtraPanelViewModel) {
      if (disposed) return
      if (extraContextChanged(viewModel, nextViewModel)) {
        pickers.close()
        generation++
        busyCount = 0
        contentLoading = false
        confirmSignature = ''
        errorElement.textContent = ''
      }
      viewModel = nextViewModel
      render()
    },
    dispose() {
      disposed = true
      pickers.dispose()
      releaseFeedback()
      generation++
      gate.dispose()
      viewModel = null
      inputs.clear()
      hostElement.replaceChildren()
    },
  }
}

/**
 * 原生附加面板分发器。
 *
 * 3D 弹窗里每类 HA 实体都可能有"额外功能"：灯的颜色/特效、门锁密码、日历列表……
 * 这里按实体域挑一个面板实现。面板在首次渲染时异步加载，加载完成后只做状态刷新；
 * 实体切换或能力结构变化时销毁重建，避免每次轮询都重建 DOM。
 */

/** 只读展示型域：没有可下发的服务，仅展示状态与属性。 */
const DISPLAY_DOMAINS = ['air_quality', 'device_tracker', 'event', 'geo_location']

const SERVICE_DOMAINS = [
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
]

const LIST_DOMAINS = ['calendar', 'todo', 'weather', 'update']

const COMPOUND_DOMAINS = ['humidifier', 'valve', 'lawn_mower', 'siren', 'alarm_control_panel', 'vacuum']

const INPUT_DOMAINS = ['text', 'date', 'time', 'datetime']

function domainOf(entityIdOrDomain: any) {
  return String(entityIdOrDomain || '').split('.')[0]
}

/** 判断实体应该用哪种附加面板；返回域本身作为 kind，便于按域分派。 */
export function nativeExtraKind(entityIdOrDomain: any, state: any): string | null {
  const domain = domainOf(entityIdOrDomain)
  if (DISPLAY_DOMAINS.includes(domain)) return 'display'
  if (SERVICE_DOMAINS.includes(domain)) return 'service'
  if (LIST_DOMAINS.includes(domain)) return 'list'
  if (COMPOUND_DOMAINS.includes(domain)) return 'compound'
  if (INPUT_DOMAINS.includes(domain)) return domain
  if (domain === 'lock') return 'lock'
  if (domain === 'light') return 'light'
  if (domain === 'image') return 'image'
  if (domain === 'camera') return 'camera'
  if (domain === 'climate') return 'climate'
  if (domain === 'water_heater') return 'water_heater'
  if (domain === 'media_player') return 'media_player'
  if (domain === 'cover') return 'cover'
  if (domain === 'fan') {
    const attributes = (state?.newState || state)?.attributes || {}
    // 只有带"可调速"等能力的风扇才值得单开面板，普通开关风扇交给通用卡片。
    return featureFlags(attributes) & 0xe ? domain : null
  }
  return null
}

/** 各面板的可读最小宽度（px）：低于这个宽度标签会被压成竖排，宁可让弹窗变宽。 */
export function nativeExtraMinimumWidth(entityIdOrDomain: any, state: any): number {
  const domain = domainOf(entityIdOrDomain)
  const attributes = (state?.newState || state)?.attributes || {}
  const flags = featureFlags(attributes)
  const inputWidth = { text: 144, date: 196, time: 160, datetime: 260 } as Record<string, number>
  if (inputWidth[domain]) return inputWidth[domain]
  if (domain === 'light')
    return (Array.isArray(attributes.supported_color_modes) ? attributes.supported_color_modes : []).some(
      (mode: string) => mode !== 'onoff',
    ) || flags & 0x2c
      ? 155
      : 124
  if (
    [
      'air_quality',
      'device_tracker',
      'event',
      'geo_location',
      'image_processing',
      'stt',
      'wake_word',
      'infrared',
      'radio_frequency',
    ].includes(domain)
  )
    return 124
  if (domain === 'lawn_mower') return 145
  if (domain === 'valve') return flags & 0x4 ? 155 : 145
  if (domain === 'humidifier') return 155
  if (domain === 'siren') return flags & 0x1c ? 155 : 124
  if (domain === 'alarm_control_panel') return attributes.code_format ? 210 : flags ? 155 : 145
  if (domain === 'lock') return 145
  if (domain === 'vacuum') return flags & 0x4100 ? 210 : 155
  if (domain === 'fan') return 155
  if (domain === 'cover') return flags & 0x84 ? 210 : 155
  if (domain === 'camera' || domain === 'image') return 96
  return 210
}

type NativeExtraPanelOptions = {
  element: any
  headerControls?: any
  feedbackSlot?: FeedbackSlot
  kind: string
  onControl: (command: any) => Promise<any>
  onResize?: () => void
}

type MountedPanel = {
  root?: any
  update?: (viewModel: any) => void
  dispose?: () => void
}

export function createNativeExtraPanel({
  element: hostElement,
  headerControls,
  feedbackSlot,
  kind,
  onControl,
  onResize = () => {},
}: NativeExtraPanelOptions) {
  let mountPanel: MountedPanel | null = null
  let viewModel: ExtraPanelViewModel | null = null
  let disposed = false

  const errorElement = hostElement.ownerDocument.createElement('p')
  errorElement.className = 'i3d-climate-error'
  errorElement.setAttribute('role', 'status')
  hostElement.append(errorElement)

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => onResize()) : null

  /** 原生面板只关心实体自身，附加卡片列表必须清空，否则会递归渲染。 */
  function panelItem() {
    const item = viewModel?.item || {}
    return {
      id: `${item.id}:${item.entityId}`,
      entityId: item.entityId,
      label: item.label,
      modelAvailable: item.modelAvailable,
      extraControls: [],
      ...(kind === 'water_heater' ? { waterHeater: true } : {}),
      ...(kind === 'fan' ? { pedestalFan: true } : {}),
    }
  }

  function refresh() {
    if (!mountPanel || !viewModel || disposed) return
    mountPanel.root && (mountPanel.root.hidden = false)
    mountPanel.update?.({
      item: panelItem(),
      state: viewModel.state,
      states: viewModel.states,
      editing: viewModel.editing,
      numberFormats: viewModel.numberFormats || {},
    })
    onResize()
  }

  function sendControl(command: any) {
    if (disposed || !viewModel || viewModel.editing || command.entityId !== viewModel.item.entityId) return
    return onControl({ ...command, deviceKind: 'purifier-extra' })
  }

  // 空调 / 窗帘面板自己的附加卡片又会经 purifier-extras 回到这里：这三类按需加载，
  // 静态引用会形成 climate-panel → purifier-extras → native-extra-panel → climate-panel 的值循环。
  async function makePanel(): Promise<MountedPanel> {
    const options = {
      element: hostElement,
      feedbackSlot,
      onControl: sendControl,
    } as any
    if (kind === 'display') return createDisplayExtraPanel(options)
    if (kind === 'climate' || kind === 'media_player') {
      const { createExtendedExtraPanel } = await import('./panels')
      return createExtendedExtraPanel({ ...options, kind })
    }
    if (kind === 'service') return createServiceExtraPanel(options)
    if (kind === 'list') return createListExtraPanel(options)
    if (kind === 'compound') return createCompoundExtraPanel({ ...options, headerControls })
    if (kind === 'light') return createLightExtraPanel({ ...options, headerControls })
    if (kind === 'image') return createImageExtraPanel({ ...options })
    if (kind === 'camera') return createCameraExtraPanel(options)
    if (kind === 'lock') {
      const panel = createLockPanel({ onControl: sendControl, feedbackSlot })
      hostElement.append(panel.root)
      return {
        root: panel.root,
        update: (model: any) => panel.update({ item: model.item, states: model.states || {}, editing: model.editing }),
        dispose: () => {
          panel.dispose?.()
          panel.root?.remove?.()
        },
      }
    }
    if (kind === 'cover') {
      const { createCoverPanel } = await import('../cover/cover')
      return createCoverPanel({
        element: hostElement,
        feedbackSlot,
        onControl: sendControl,
        onExtraControl: sendControl,
      })
    }
    if (INPUT_DOMAINS.includes(kind)) return createInputExtraPanel(options)
    if (kind === 'water_heater' || kind === 'fan') {
      const { createClimatePanel } = await import('../climate/climate')
      return createClimatePanel({ element: hostElement, feedbackSlot, onControl: sendControl })
    }
    return createServiceExtraPanel(options)
  }

  const ready = Promise.resolve()
    .then(async () => {
      if (disposed) return
      const panel = await makePanel()
      if (disposed) {
        panel.dispose?.()
        return
      }
      mountPanel = panel
      hostElement.classList.add('i3d-extra-native-panel')
      resizeObserver?.observe(hostElement)
      refresh()
    })
    .catch((error: any) => {
      if (disposed) return
      hostElement.replaceChildren(errorElement)
      errorElement.textContent = error?.message || '控制面板加载失败'
      onResize()
    })

  return {
    ready,
    update(nextViewModel: ExtraPanelViewModel) {
      if (disposed) return
      viewModel = nextViewModel
      refresh()
    },
    dispose() {
      if (disposed) return
      disposed = true
      viewModel = null
      resizeObserver?.disconnect()
      mountPanel?.dispose?.()
      mountPanel = null
      hostElement.replaceChildren()
    },
  }
}

/**
 * 附加面板的公共小工具。
 *
 * 0.7.8 的附加面板按实体域拆成 10 个模块，但它们的宿主契约一致：
 * `createXxxExtraPanel({ element, feedbackSlot?, onControl?, ... })` 返回
 * `{ root, update(model), dispose() }`。这里只收拢重复的 DOM / 反馈 / 可见性逻辑。
 */

/** 面板视图模型：由 `purifier-extras` 注入，字段来自运行时状态袋。 */
export type ExtraPanelViewModel = {
  item?: any
  state?: any
  states?: any
  editing?: any
  active?: boolean
  /** 实体 → HA 显示精度（`number-formats` 通道下发）；缺省时数值原样显示。 */
  numberFormats?: Record<string, number>
}

/** 面板反馈槽（`createPopupFeedback` 的实例）；面板只用到 attach。 */
export type FeedbackSlot = {
  attach?: (node: any, options?: any) => (() => void) | undefined
  begin?: (source: string) => void
  clear?: () => void
  root?: any
}

export function createPanelElement(ownerDocument: Document, tagName: string, textContent = '') {
  const element = ownerDocument.createElement(tagName)
  element.textContent = textContent
  return element
}

/** 反馈节点卸载函数的安全包装：反馈槽可缺省，卸载可重复调用。 */
export function attachFeedback(feedbackSlot: FeedbackSlot | undefined, node: any, options: any): () => void {
  const release = feedbackSlot?.attach?.(node, options)
  return () => release?.()
}

/** 读取实体实时状态（兼容 `state.newState` 包装）。 */
function liveStateOf(viewModel: ExtraPanelViewModel | null | undefined) {
  return viewModel?.state?.newState || viewModel?.state
}

/** 实体属性（统一走 entity-capabilities，避免各处重复判空）。 */
export function liveAttributesOf(viewModel: ExtraPanelViewModel | null | undefined) {
  return attributesOf(liveStateOf(viewModel))
}

function modelEntityId(viewModel: ExtraPanelViewModel | null | undefined) {
  return String(viewModel?.item?.entityId || '')
}

export function modelDomain(viewModel: ExtraPanelViewModel | null | undefined) {
  return modelEntityId(viewModel).split('.')[0]
}

/** 面板是否处于"可交互"态：未编辑、模型可用、实体可用、未在提交。 */
export function panelEntityUsable(
  viewModel: ExtraPanelViewModel | null | undefined,
  options: { allowStatelessUnknown?: boolean } = {},
) {
  if (!viewModel || viewModel.item?.modelAvailable === false) return false
  const state = liveStateOf(viewModel)
  if (!state || state.available === false) return false
  if (state.state === 'unknown' && options.allowStatelessUnknown) return true
  return !['unknown', 'unavailable', '', undefined].includes(state.state)
}

/**
 * 滚动到可视区才加载重型内容（摄像头 / 图片 / 列表）。
 *
 * 返回 `visible` 读取器与 `dispose()`；没有 `IntersectionObserver` 时视为一直可见。
 */
export function createVisibilityGate(hostElement: any, onChange: () => void) {
  const view = hostElement?.ownerDocument?.defaultView
  const Observer = view?.IntersectionObserver || (globalThis as any).IntersectionObserver
  if (!Observer) {
    return { visible: () => true, observe: () => {}, dispose: () => {} }
  }
  let visible = false
  const observer = new Observer((entries: any[]) => {
    const nextVisible = entries.some((entry) => entry.isIntersecting)
    if (nextVisible === visible) return
    visible = nextVisible
    onChange()
  })
  observer.observe(hostElement)
  return {
    visible: () => visible,
    observe: () => observer.observe(hostElement),
    dispose: () => observer.disconnect?.(),
  }
}

/** 统一的状态词表（复合设备 / 服务设备共用）。 */
export const EXTRA_STATE_LABELS: Record<string, string> = {
  on: '已开启',
  off: '已关闭',
  open: '已打开',
  closed: '已关闭',
  opening: '正在打开',
  closing: '正在关闭',
  cleaning: '清扫中',
  docked: '已停靠',
  returning: '返回中',
  paused: '已暂停',
  idle: '待机',
  mowing: '割草中',
  error: '设备故障',
  disarmed: '已撤防',
  armed_home: '在家布防',
  armed_away: '离家布防',
  armed_night: '夜间布防',
  armed_vacation: '假期布防',
  armed_custom_bypass: '自定义布防',
  pending: '等待触发',
  arming: '正在布防',
  disarming: '正在撤防',
  triggered: '已触发警报',
  listening: '正在聆听',
  processing: '正在处理',
  responding: '正在回复',
}

export function extraStateText(viewModel: ExtraPanelViewModel | null | undefined) {
  const state = liveStateOf(viewModel)
  if (!state) return '设备不可用'
  if (state.state === 'unknown') return '状态未知'
  return EXTRA_STATE_LABELS[state.state] || String(state.state || '')
}

/**
 * 服务型实体面板：通知 / 对话 / AI 任务 / 语音助手 / 遥控 / TTS / 图像识别 /
 * 播放器扩展 / 语音识别 / 唤醒词 / 射频。
 *
 * 这些实体"状态"几乎没有意义（`unknown` 才是正常态），真正的交互是一组
 * 带参数的 service。表单按 supported_features 动态裁剪；需要返回值的服务
 * （AI 生图、搜索媒体、引擎能力）在下发后把结果渲染到响应区。
 */

export type ServiceField = {
  key: string
  label: string
  type?: string
  required?: boolean
  json?: boolean
  lines?: boolean
  min?: number
  max?: number
  step?: number
  value?: any
  choices?: Array<[string, string]>
}

export type ServiceForm = {
  service: string
  label: string
  fields: ServiceField[]
  confirm?: boolean
  response?: boolean
}

/** assistant 能力位：1=播报；2=语音对话。 */
const ASSIST_ANNOUNCE = 0x1
const ASSIST_CONVERSATION = 0x2
/** remote 能力位：1=学习；2=删除；4=活动列表。 */
const REMOTE_LEARN = 0x1
const REMOTE_DELETE = 0x2
const REMOTE_ACTIVITIES = 0x4
/** ai_task 能力位：1=生成内容；2=附件；4=生成图片。 */
const AI_TASK_DATA = 0x1
const AI_TASK_ATTACHMENTS = 0x2
const AI_TASK_IMAGE = 0x4
/** notify 能力位：1=标题。 */
const NOTIFY_TITLE = 0x1
/** media_player 能力位（HA 标准位）。 */
const MEDIA_PLAY_MEDIA = 0x200
const MEDIA_CLEAR_PLAYLIST = 0x2000
const MEDIA_GROUPING = 0x80000
const MEDIA_ANNOUNCE = 0x100000
const MEDIA_ENQUEUE = 0x200000
const MEDIA_SEARCH = 0x400000

const STATELESS_DOMAINS = new Set([
  'ai_task',
  'notify',
  'tts',
  'stt',
  'wake_word',
  'infrared',
  'radio_frequency',
  'conversation',
])
const CONNECTED_DOMAINS = new Set(['ai_task', 'notify', 'tts', 'stt', 'wake_word', 'infrared', 'radio_frequency'])

const SERVICE_STATE_LABELS: Record<string, string> = {
  on: '已开启',
  off: '已关闭',
  idle: '待机',
  listening: '正在聆听',
  processing: '正在处理',
  responding: '正在回复',
}

function serviceExtraSpec(domain: string, state: any, states: any = {}) {
  const attributes = attributesOf(state)
  const flags = featureFlags(attributes)
  const forms: ServiceForm[] = []

  const field = (key: string, label: string, extra: Partial<ServiceField> = {}): ServiceField => ({
    key,
    label,
    type: 'text',
    ...extra,
  })
  const messageField = field('message', '内容', { type: 'textarea', required: true })
  const jsonField = (key: string, label: string) => field(key, label, { type: 'textarea', json: true })
  const selectField = (key: string, label: string, choices: Array<[string, string]>) =>
    field(key, label, { type: 'select', choices })
  const addForm = (service: string, label: string, fields: ServiceField[] = [], extra: Partial<ServiceForm> = {}) => {
    forms.push({ service, label, fields, ...extra })
  }
  const mediaPlayers = () =>
    Object.entries(states)
      .filter(([entityId]) => entityId.startsWith('media_player.'))
      .map(
        ([entityId, entry]: [string, any]) =>
          [entityId, attributesOf(entry?.newState || entry).friendly_name || entityId] as [string, string],
      )

  if (domain === 'notify') {
    addForm('send_message', '发送通知', [messageField, ...(flags & NOTIFY_TITLE ? [field('title', '标题')] : [])], {
      confirm: true,
    })
  }
  if (domain === 'conversation') {
    addForm(
      'process',
      '对话',
      [field('text', '对话内容', { type: 'textarea', required: true }), field('language', '语言（可选）')],
      { response: true },
    )
  }
  if (domain === 'ai_task') {
    const base = [
      field('task_name', '任务名称', { required: true }),
      field('instructions', '任务要求', { type: 'textarea', required: true }),
    ]
    const attachmentFields =
      flags & AI_TASK_ATTACHMENTS ? [jsonField('attachments', '附件（HA 媒体 ID 与类型 JSON）')] : []
    if (flags & AI_TASK_DATA) {
      addForm(
        'generate_data',
        '生成内容',
        [...base, jsonField('structure', '输出结构（可选 JSON）'), ...attachmentFields],
        {
          response: true,
        },
      )
    }
    if (flags & AI_TASK_IMAGE) {
      addForm('generate_image', '生成图片', [...base, ...attachmentFields], { response: true })
    }
  }
  if (domain === 'assist_satellite') {
    if (flags & ASSIST_ANNOUNCE) {
      addForm(
        'announce',
        '播报',
        [
          field('message', '播报文本', { type: 'textarea' }),
          field('media_id', '播报媒体 ID（可选）'),
          field('preannounce', '播放提示音', { type: 'checkbox', value: true }),
          field('preannounce_media_id', '提示音媒体 ID（可选）'),
        ],
        { confirm: true },
      )
    }
    if (flags & ASSIST_CONVERSATION) {
      addForm(
        'start_conversation',
        '开始语音对话',
        [
          field('start_message', '开场文本'),
          field('start_media_id', '开场媒体 ID（可选）'),
          field('extra_system_prompt', '补充要求', { type: 'textarea' }),
        ],
        { confirm: true },
      )
      addForm(
        'ask_question',
        '提问并等待回答',
        [
          field('question', '问题', { type: 'textarea', required: true }),
          jsonField('answers', '匹配答案（可选 JSON）'),
        ],
        { response: true, confirm: true },
      )
    }
  }
  if (domain === 'remote') {
    addForm(
      'turn_on',
      '开启遥控器',
      flags & REMOTE_ACTIVITIES
        ? [
            selectField('activity', '活动', [
              ['', '默认'],
              ...stringOptions(attributes.activity_list).map((activity) => [activity, activity] as [string, string]),
            ]),
          ]
        : [],
    )
    addForm('turn_off', '关闭遥控器')
    const commandFields = [
      field('device', '目标设备（可选）'),
      field('command', '命令（每行一个）', { type: 'textarea', required: true, lines: true }),
    ]
    addForm('send_command', '发送命令', [
      ...commandFields,
      field('num_repeats', '重复次数', { type: 'number', min: 0, max: 255, step: 1 }),
      field('delay_secs', '命令间隔（秒）', { type: 'number', min: 0, max: 60, step: 0.1 }),
      field('hold_secs', '持续时间（秒）', { type: 'number', min: 0, max: 60, step: 0.1 }),
    ])
    if (flags & REMOTE_LEARN) {
      addForm(
        'learn_command',
        '学习命令',
        [
          ...commandFields,
          selectField('command_type', '信号类型', [
            ['ir', 'ir'],
            ['rf', 'rf'],
          ]),
          field('timeout', '等待秒数', { type: 'number', min: 0, max: 60, step: 1 }),
        ],
        { confirm: true },
      )
    }
    if (flags & REMOTE_DELETE) {
      addForm('delete_command', '删除已学命令', commandFields, { confirm: true })
    }
  }
  if (domain === 'tts') {
    const players = mediaPlayers()
    addForm(
      'speak',
      '朗读文本',
      [
        messageField,
        players.length
          ? selectField('media_player_entity_id', '播放设备', [['', '选择播放设备'], ...players])
          : field('media_player_entity_id', '播放设备实体 ID', { required: true }),
        field('language', '语言（可选）'),
        field('cache', '缓存语音', { type: 'checkbox', value: true }),
        jsonField('options', '语音参数（可选 JSON）'),
      ],
      { confirm: true },
    )
  }
  if (domain === 'image_processing') addForm('scan', '重新识别画面')
  if (domain === 'media_player') {
    if (flags & MEDIA_PLAY_MEDIA) {
      addForm('play_media', '播放指定媒体', [
        field('media_content_id', '媒体 ID 或地址', { required: true }),
        field('media_content_type', '媒体类型', { required: true }),
        ...(flags & MEDIA_ENQUEUE
          ? [
              selectField('enqueue', '队列方式', [
                ['', '直接播放'],
                ['play', '立即播放'],
                ['next', '下一项'],
                ['add', '加入末尾'],
                ['replace', '替换队列'],
              ]),
            ]
          : []),
        ...(flags & MEDIA_ANNOUNCE ? [field('announce', '临时播报', { type: 'checkbox' })] : []),
      ])
    }
    if (flags & MEDIA_CLEAR_PLAYLIST) addForm('clear_playlist', '清空播放队列', [], { confirm: true })
    if (flags & MEDIA_GROUPING) {
      addForm('join', '组合播放', [
        field('group_members', '组合成员实体 ID（每行一个）', {
          type: 'textarea',
          required: true,
          lines: true,
        }),
      ])
      addForm('unjoin', '退出组合')
    }
    if (flags & MEDIA_SEARCH) {
      addForm('search_media', '搜索媒体', [field('search_query', '搜索关键词', { required: true })], {
        response: true,
      })
    }
  }
  if (['stt', 'wake_word', 'radio_frequency'].includes(domain)) {
    addForm('info', '查看引擎能力', [], { response: true })
  }

  const note =
    {
      stt: '语音识别服务',
      wake_word: '唤醒词检测服务',
      infrared: attributes.device_class === 'receiver' ? '红外接收器' : '红外发射器',
      radio_frequency: '射频发射器',
    }[domain] || ''

  return { forms, note }
}

type ServiceExtraPanelOptions = {
  element: any
  feedbackSlot?: FeedbackSlot
  onControl: (command: any) => Promise<any>
  hideStatus?: boolean
}

export function createServiceExtraPanel({
  element: hostElement,
  feedbackSlot,
  onControl,
  hideStatus = false,
}: ServiceExtraPanelOptions) {
  const pickers = enhancePopupSelects(hostElement)
  const ownerDocument = hostElement.ownerDocument || globalThis.document
  const createElement = (tagName: string, textContent = '') => {
    const node = ownerDocument.createElement(tagName)
    node.textContent = textContent
    return node
  }

  const statusElement = createElement('p')
  const noteElement = createElement('p')
  const formElement = createElement('div')
  const responseElement = createElement('div')
  const errorElement = createElement('p')

  hostElement.classList.add('i3d-extra-service')
  formElement.className = 'i3d-extra-form'
  responseElement.className = 'i3d-extra-response'
  errorElement.className = 'i3d-climate-error'
  errorElement.setAttribute('role', 'status')
  hostElement.replaceChildren(statusElement, noteElement, formElement, responseElement, errorElement)

  let viewModel: ExtraPanelViewModel | null = null
  let disposed = false
  let generation = 0
  let busy = false
  let specSignature = ''
  let confirmSignature = ''

  const stateOf = () => viewModel?.state?.newState || viewModel?.state
  const domain = () => String(viewModel?.item?.entityId).split('.')[0]
  const statelessUnknown = () => {
    const state = stateOf()
    return (
      state?.state === 'unknown' &&
      STATELESS_DOMAINS.has(domain()) &&
      (state.available !== false || state.availabilityReason === 'unknown')
    )
  }
  const isUsable = () =>
    !!viewModel &&
    viewModel.item.modelAvailable !== false &&
    (statelessUnknown() ||
      (stateOf()?.available !== false && !['unknown', 'unavailable', '', undefined].includes(stateOf()?.state)))
  const isDisabled = () =>
    disposed ||
    !viewModel ||
    viewModel.editing ||
    busy ||
    !isUsable() ||
    (String(viewModel.item.entityId).startsWith('media_player.') && ['off', 'standby'].includes(stateOf()?.state))

  function syncDisabled() {
    for (const element of hostElement.querySelectorAll('button,input,select,textarea')) {
      ;(element as any).disabled = isDisabled()
    }
    pickers.sync()
  }

  function renderResponse(response: any, service: string) {
    const result = unwrapExtraResponse(response, viewModel!.item.entityId)
    responseElement.replaceChildren()
    if (typeof result?.image == 'string' && /^data:image\/(?:png|jpeg|webp|gif);base64,/.test(result.image)) {
      const image = createElement('img') as HTMLImageElement
      image.alt = 'AI 生成图片'
      image.src = result.image
      responseElement.append(image)
      if (result.revised_prompt) responseElement.append(createElement('p', result.revised_prompt))
      return
    }

    if (service === 'search_media') {
      const results = Array.isArray(result?.result) ? result.result : Array.isArray(result) ? result : []
      if (!results.length) responseElement.append(createElement('p', '暂无搜索结果'))
      for (const media of results) {
        const article = createElement('article')
        article.append(createElement('p', media.title || '未命名媒体'))
        if (
          media.can_play &&
          media.media_content_id &&
          media.media_content_type &&
          featureFlags(attributesOf(stateOf())) & MEDIA_PLAY_MEDIA
        ) {
          const playButton = createElement('button', '播放') as HTMLButtonElement
          playButton.type = 'button'
          playButton.className = 'i3d-climate-choice'
          article.append(playButton)
          playButton.addEventListener(
            'click',
            () =>
              void dispatch(
                { service: 'play_media', label: '播放' },
                {
                  media_content_id: media.media_content_id,
                  media_content_type: media.media_content_type,
                },
              ),
          )
        }
        responseElement.append(article)
      }
      syncDisabled()
      return
    }

    const speech = result?.response?.speech?.plain?.speech
    if (speech) {
      responseElement.append(createElement('p', speech))
    } else if (typeof result == 'string') {
      responseElement.append(createElement('p', result))
    } else if (result?.data !== undefined) {
      responseElement.append(
        createElement('p', typeof result.data == 'string' ? result.data : JSON.stringify(result.data, null, 2)),
      )
    } else if (result?.wake_words) {
      for (const wakeWord of result.wake_words) {
        responseElement.append(createElement('p', wakeWord.name || wakeWord.id))
      }
    } else if (result?.supported_languages) {
      responseElement.append(createElement('p', `支持语言：${result.supported_languages.join('、')}`))
    } else if (result?.supported_frequency_ranges) {
      for (const [low, high] of result.supported_frequency_ranges) {
        responseElement.append(createElement('p', `频率范围 ${low / 1_000_000}–${high / 1_000_000} MHz`))
      }
      if (result.supported_modulations) {
        responseElement.append(createElement('p', `调制方式 ${result.supported_modulations.join('、')}`))
      }
    } else {
      responseElement.append(createElement('pre', JSON.stringify(result, null, 2) || '操作完成'))
    }
  }

  async function dispatch(form: any, dataOverride?: any) {
    if (isDisabled()) return
    const requestGeneration = generation
    try {
      const requestSignature = JSON.stringify([form.service, dataOverride])
      if (form.confirm && (confirmSignature !== requestSignature || !errorElement.textContent)) {
        confirmSignature = requestSignature
        errorElement.dataset.kind = 'confirm'
        errorElement.textContent = `确认${form.label}？再次点击执行。`
        return
      }
      confirmSignature = ''
      busy = true
      errorElement.textContent = ''
      errorElement.dataset.kind = ''
      syncDisabled()
      const response = await onControl({
        entityId: viewModel!.item.entityId,
        domain: domain(),
        service: form.service,
        data: dataOverride,
      })
      if (disposed || requestGeneration !== generation) return
      if (form.response) renderResponse(response, form.service)
      else errorElement.textContent = ''
    } catch (error: any) {
      if (!disposed && requestGeneration === generation) {
        errorElement.dataset.kind = 'error'
        errorElement.textContent = error?.message || '操作失败'
      }
    } finally {
      if (!disposed && requestGeneration === generation) {
        busy = false
        syncDisabled()
      }
    }
  }

  function buildForms(spec: ReturnType<typeof serviceExtraSpec>) {
    formElement.replaceChildren()
    for (const form of spec.forms) {
      const wrapper = createElement(form.fields.length ? 'details' : 'div')
      const body = createElement('div')
      body.className = 'i3d-extra-form'
      if (form.fields.length) wrapper.append(createElement('summary', form.label))
      wrapper.append(body)
      formElement.append(wrapper)
      const entries = new Map<string, { field: ServiceField; input: any }>()

      for (const formField of form.fields) {
        const row = createElement('label')
        const input = createElement(
          ['textarea', 'select'].includes(formField.type || '') ? formField.type! : 'input',
        ) as any
        row.className = 'i3d-extra-field'
        row.append(createElement('span', formField.label), input)
        input.setAttribute('aria-label', formField.label)
        if (!['textarea', 'select'].includes(formField.type || '')) input.type = formField.type
        for (const key of ['min', 'max', 'step']) {
          if (formField[key as 'min'] != null) input[key] = formField[key as 'min']
        }
        if (formField.type === 'select') {
          for (const [value, text] of formField.choices || []) {
            const option = createElement('option', text) as HTMLOptionElement
            option.value = value
            input.append(option)
          }
        }
        if (formField.type === 'checkbox') input.checked = !!formField.value
        body.append(row)
        entries.set(formField.key, { field: formField, input })
      }

      const submitButton = createElement('button', form.label) as HTMLButtonElement
      submitButton.type = 'button'
      submitButton.className = 'i3d-climate-choice'
      body.append(submitButton)
      submitButton.addEventListener('click', async () => {
        if (isDisabled()) return
        const requestGeneration = generation
        const data: any = {}
        try {
          for (const [key, { field: formField, input }] of entries) {
            if (formField.required && !input.value.trim()) {
              throw Error(`请填写${formField.label}。`)
            }
            if (formField.type === 'checkbox') {
              data[key] = input.checked
              continue
            }
            if (!input.value) continue
            data[key] = formField.json
              ? JSON.parse(input.value)
              : formField.lines
                ? input.value
                    .split('\n')
                    .map((line: string) => line.trim())
                    .filter(Boolean)
                : formField.type === 'number'
                  ? Number(input.value)
                  : input.value
          }
          if (form.service === 'play_media') {
            if (data.announce !== true) delete data.announce
            if (data.announce && data.enqueue) throw Error('临时播报与队列方式请只选择一种。')
          }
          await dispatch(form, data)
        } catch (error: any) {
          if (!disposed && requestGeneration === generation) {
            errorElement.dataset.kind = 'error'
            errorElement.textContent = error?.message || '参数无效'
          }
        }
      })
    }
  }

  function render() {
    if (disposed || !viewModel) return
    const spec = serviceExtraSpec(domain(), stateOf(), viewModel.states)
    const signature = JSON.stringify([viewModel.item.entityId, spec])
    if (signature !== specSignature) {
      specSignature = signature
      buildForms(spec)
    }
    noteElement.textContent = spec.note
    noteElement.hidden = !spec.note

    if (isUsable()) {
      statusElement.textContent = statelessUnknown()
        ? '尚无使用记录'
        : SERVICE_STATE_LABELS[stateOf().state] || (CONNECTED_DOMAINS.has(domain()) ? '已连接' : stateOf().state)
    } else {
      statusElement.textContent = stateOf()?.state === 'unknown' ? '状态未知' : '设备不可用'
    }
    statusElement.hidden = hideStatus
    syncDisabled()
  }

  const releaseFeedback = attachFeedback(feedbackSlot, errorElement, {
    source: () => viewModel?.item?.entityId,
    label: () => viewModel?.item?.label,
    onRetire: () => {
      confirmSignature = ''
    },
  })

  return {
    root: hostElement,
    update(nextViewModel: ExtraPanelViewModel) {
      if (disposed) return
      if (extraContextChanged(viewModel, nextViewModel)) {
        pickers.close()
        generation++
        busy = false
        confirmSignature = ''
        errorElement.textContent = ''
        responseElement.replaceChildren()
      }
      viewModel = nextViewModel
      render()
    },
    dispose() {
      disposed = true
      pickers.dispose()
      releaseFeedback()
      generation++
      viewModel = null
      hostElement.replaceChildren()
    },
  }
}
