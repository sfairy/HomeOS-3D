import { drawContainedScreenImage, screenUploadSource } from '@app/shared/display-image-source'
import { createPurifierExtras } from '../climate/climate'
import { carState } from '../vehicle/vehicle'
import { createStageDeviceVisual } from '../core/stage-device-visual'
import { createPopupFeedback } from '@app/shared/util/popup-feedback'
import { domElement } from '@app/shared/util/dom-factory'
import { enhancePopupSelects } from '@app/shared/util/select-picker'
import { televisionArtwork } from '../television/television'
import { normalizeModelRemark } from '@app/shared/model-remarks'

/**
 * 电脑屏幕贴图（0.7.8 `computer-screen`）。
 *
 * 开机时把 `screenImage` 资源画到屏幕网格的 CanvasTexture 上，
 * 关机时铺纯黑；图片加载失败按指数退避重试，离线/页面隐藏时暂停。
 */

const SCREEN_CANVAS_WIDTH = 1024,
  SCREEN_CANVAS_HEIGHT = 576,
  LOAD_TIMEOUT_MS = 15000,
  MAX_RETRY_DELAY_MS = 300000

const sceneModelKey = (binding: any) => JSON.stringify([binding.floorId, binding.modelId])

/** 关机画面：纯黑，避免屏幕材质透出场景。 */
function paintOffScreen(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  ;(context.fillStyle = '#050609'), context.fillRect(0, 0, canvas.width, canvas.height)
}

export type ComputerScreensController = {
  sync: (payload: { root: any; revision: any; bindings?: any[]; states?: any }) => void
  setAvailable: (isAvailable: boolean) => void
  dispose: () => void
}

export function createComputerScreens({
  THREE: THREE,
  requestFrame: requestFrame = () => {},
}: {
  THREE?: any
  requestFrame?: (floorIds?: string[]) => void
}): ComputerScreensController {
  let rootObject: any = null,
    rootRevision: any,
    modelsByKey = new Map<string, any>(),
    screensByKey = new Map<string, any>(),
    isDisposed = false,
    isAvailable = true,
    isOffline = globalThis.navigator?.onLine === false

  const ownerDocument = globalThis.document,
    ownerWindow = globalThis.window

  const isScreenActive = (screenRecord: any) =>
    !isDisposed && !screenRecord.removed && isAvailable && !ownerDocument?.hidden && !isOffline

  /** 清掉加载中的图片与计时器（重试前统一收口）。 */
  function cancelImageLoad(screenRecord: any) {
    clearTimeout(screenRecord.retry), clearTimeout(screenRecord.timeout)
    screenRecord.retry = screenRecord.timeout = null
    const pendingImage = screenRecord.loading
    ;(screenRecord.loading = null),
      pendingImage && ((pendingImage.onload = pendingImage.onerror = null), pendingImage.removeAttribute?.('src'))
  }

  function loadScreenImage(screenRecord: any) {
    if (
      !isScreenActive(screenRecord) ||
      !screenRecord.source ||
      screenRecord.image ||
      screenRecord.loading ||
      screenRecord.retry !== null
    )
      return
    const loadingImage = new Image()
    screenRecord.loading = loadingImage
    const isStillCurrent = () => screenRecord.loading === loadingImage && isScreenActive(screenRecord)
    loadingImage.onload = () => {
      isStillCurrent() &&
        (clearTimeout(screenRecord.timeout),
        (screenRecord.timeout = null),
        (screenRecord.image = loadingImage),
        (screenRecord.loading = null),
        (screenRecord.failures = 0),
        redrawScreen(screenRecord))
    }
    const handleFailure = () => {
      isStillCurrent() &&
        (cancelImageLoad(screenRecord),
        screenRecord.failures++,
        redrawScreen(screenRecord),
        (screenRecord.retry = setTimeout(
          () => {
            ;(screenRecord.retry = null), loadScreenImage(screenRecord)
          },
          Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** Math.min(screenRecord.failures - 1, 9)),
        )),
        screenRecord.retry?.['unref']?.())
    }
    ;(loadingImage.onerror = handleFailure),
      (screenRecord.timeout = setTimeout(handleFailure, LOAD_TIMEOUT_MS)),
      screenRecord.timeout?.['unref']?.(),
      // 桌面截图不能裁（留边由画布底色承担），所以 `fit: 'contain'`；纹理只要静帧。
      (loadingImage.src = screenUploadSource(
        screenRecord.source,
        screenRecord.canvas.width,
        screenRecord.canvas.height,
        { fit: 'contain', still: true },
      ))
  }

  /** 在线/可见性变化后重新调度所有屏幕的加载队列。 */
  function refreshLoadQueue() {
    for (const screenRecord of screensByKey.values())
      isScreenActive(screenRecord) ? loadScreenImage(screenRecord) : cancelImageLoad(screenRecord)
  }
  const handleOnline = () => {
    isOffline = false
    for (const screenRecord of screensByKey.values())
      !screenRecord.image && !screenRecord.loading && (clearTimeout(screenRecord.retry), (screenRecord.retry = null))
    refreshLoadQueue()
  }
  const handleOffline = () => {
    ;(isOffline = true), refreshLoadQueue()
  }
  ownerWindow?.addEventListener?.('online', handleOnline),
    ownerWindow?.addEventListener?.('offline', handleOffline),
    ownerDocument?.addEventListener?.('visibilitychange', refreshLoadQueue)

  /** 重绘屏幕贴图：黑底 + 等比居中的屏幕图。 */
  function redrawScreen(screenRecord: any) {
    if (isDisposed || screenRecord.removed || !screenRecord.screen || !isAvailable) return
    const { canvas, context } = screenRecord
    paintOffScreen(canvas, context)
    if (screenRecord.on && screenRecord.image) {
      drawContainedScreenImage(context, screenRecord.image, canvas.width, canvas.height)
    }
    ;(screenRecord.texture.needsUpdate = true), requestFrame([screenRecord.floorId])
  }

  function disposeScreenRecord(screenKey: string, screenRecord: any) {
    screenRecord &&
      !screenRecord.removed &&
      ((screenRecord.removed = true),
      screenRecord.screen.material === screenRecord.material && (screenRecord.screen.material = screenRecord.original),
      cancelImageLoad(screenRecord),
      screenRecord.texture.dispose(),
      screenRecord.material.dispose(),
      screensByKey.get(screenKey) === screenRecord && screensByKey.delete(screenKey))
  }

  return {
    sync({ root, revision, bindings = [], states = {} }) {
      if (isDisposed) return
      ;(rootObject !== root || rootRevision !== revision) &&
        ((rootObject = root),
        (rootRevision = revision),
        (modelsByKey = new Map()),
        rootObject?.traverse((sceneNode: any) => {
          ;['desktop', 'laptop'].includes(sceneNode.userData?.environmentModelType) &&
            modelsByKey.set(
              sceneModelKey({
                floorId: sceneNode.userData.environmentFloorId,
                modelId: sceneNode.userData.environmentModelId,
              }),
              sceneNode,
            )
        }))

      const liveKeySet = new Set<string>()
      for (const binding of bindings) {
        if (binding.visible === false) continue
        const bindingKey = sceneModelKey(binding),
          model = modelsByKey.get(bindingKey)
        if (!model) continue
        let screenMesh: any
        if (
          (model.traverse((sceneNode: any) => {
            !screenMesh && sceneNode.userData?.computerScreen && (screenMesh = sceneNode)
          }),
          !screenMesh)
        )
          continue
        liveKeySet.add(bindingKey)
        let screenRecord = screensByKey.get(bindingKey)
        if (screenRecord && screenRecord.screen !== screenMesh) {
          disposeScreenRecord(bindingKey, screenRecord), (screenRecord = null)
        }
        if (!screenRecord) {
          const canvas = document.createElement('canvas')
          ;(canvas.width = SCREEN_CANVAS_WIDTH), (canvas.height = SCREEN_CANVAS_HEIGHT)
          const context = canvas.getContext('2d')
          if (!context) continue
          const texture = new THREE.CanvasTexture(canvas)
          texture.colorSpace = THREE.SRGBColorSpace
          const screenMaterial = new THREE.MeshBasicMaterial({
              map: texture,
              toneMapped: false,
              polygonOffset: true,
              polygonOffsetFactor: -2,
              polygonOffsetUnits: -2,
            }),
            originalMaterial = screenMesh.material
          ;(screenRecord = {
            floorId: binding.floorId,
            screen: screenMesh,
            original: originalMaterial,
            material: screenMaterial,
            canvas,
            context,
            texture,
            on: false,
            source: '',
            image: null,
            loading: null,
            retry: null,
            timeout: null,
            failures: 0,
            signature: '',
            removed: false,
          }),
            (screenMesh.material = screenRecord.material),
            screensByKey.set(bindingKey, screenRecord)
        }
        const power = computerPower(binding, states),
          screenSource = power.on ? computerScreenImage(binding) : '',
          screenSignature = JSON.stringify([power.on, power.available, screenSource])
        ;(screenRecord.on = power.on),
          screenRecord.source !== screenSource &&
            (cancelImageLoad(screenRecord),
            (screenRecord.source = screenSource),
            (screenRecord.image = null),
            (screenRecord.failures = 0)),
          loadScreenImage(screenRecord),
          screenRecord.signature !== screenSignature &&
            ((screenRecord.signature = screenSignature), redrawScreen(screenRecord))
      }
      for (const [staleKey, staleRecord] of screensByKey)
        liveKeySet.has(staleKey) || disposeScreenRecord(staleKey, staleRecord)
    },
    setAvailable(isNowAvailable: boolean) {
      const availability = !!isNowAvailable
      if (availability !== isAvailable) {
        if (((isAvailable = availability), refreshLoadQueue(), isAvailable))
          for (const screenRecord of screensByKey.values()) redrawScreen(screenRecord)
      }
    },
    dispose() {
      ;(isDisposed = true),
        ownerWindow?.removeEventListener?.('online', handleOnline),
        ownerWindow?.removeEventListener?.('offline', handleOffline),
        ownerDocument?.removeEventListener?.('visibilitychange', refreshLoadQueue)
      for (const [screenKey, screenRecord] of screensByKey) disposeScreenRecord(screenKey, screenRecord)
      screensByKey.clear(), modelsByKey.clear(), (rootObject = null)
    },
  }
}

/**
 * 电脑（computer）电源与屏幕状态（0.7.8 `computer-state`）。
 *
 * 电脑的主实体由普通开关类实体驱动：`switch` / `input_boolean` 才支持
 * 开关机；其它域只读取状态，不提供控制入口。
 */

export type ComputerState = {
  entityId: string
  domain: string
  on: boolean
  available: boolean
  supported: boolean
  service: 'turn_on' | 'turn_off'
  reason: string
  command: {
    entityId: string
    domain: string
    service: 'turn_on' | 'turn_off'
    data: Record<string, unknown>
    deviceKind: 'computer'
  }
  name: string
  status: string
}

const readEntityState = (states: any, entityId: string) =>
  states instanceof Map ? states.get(entityId) : states?.[entityId]
const OFF_STATES = new Set(['off', 'standby', 'false', '0'])

/** 屏幕图资源 → `/api/v1/assets/user/<hash>`；非法 assetId 返回空串。 */
export function computerScreenImage(device: any) {
  const assetId = device?.screenImage?.assetId
  return typeof assetId == 'string' && /^user:[0-9a-f]{32}$/.test(assetId)
    ? '/api/v1/assets/user/' + assetId.slice(5)
    : ''
}

export function computerPower(
  device: any,
  states: any = {},
  requestedOn?: boolean,
): Omit<ComputerState, 'name' | 'status'> {
  const entityId = device?.powerEntityId || '',
    domain = entityId.split('.')[0],
    rawState = readEntityState(states, entityId),
    entityState = rawState?.newState || rawState || {},
    available =
      !!entityId &&
      entityState.available !== false &&
      typeof entityState.state == 'string' &&
      !['unknown', 'unavailable', ''].includes(entityState.state),
    isOn = available && !OFF_STATES.has(String(entityState.state).toLowerCase()),
    targetOn = typeof requestedOn == 'boolean' ? requestedOn : !isOn,
    supported = domain === 'switch' || domain === 'input_boolean'
  return {
    entityId,
    domain,
    on: isOn,
    available,
    supported,
    service: targetOn ? 'turn_on' : 'turn_off',
    reason: available ? (supported ? '' : '此实体不支持开关机') : '电源状态不可用',
    command: {
      entityId,
      domain,
      service: targetOn ? 'turn_on' : 'turn_off',
      data: {},
      deviceKind: 'computer',
    },
  }
}

export function computerState(device: any, states: any = {}): ComputerState {
  const power = computerPower(device, states)
  return {
    ...power,
    name: device?.label || device?.deviceName || '电脑',
    status: device?.powerEntityId
      ? power.available
        ? power.on
          ? '已开启'
          : '已关闭'
        : '设备不可用'
      : '尚未绑定电源实体',
  }
}

/** 电源指令等待 HA 回执的上限；超时给出「设备未响应」。 */
const POWER_RESPONSE_TIMEOUT_MS = 14_000
export function createDevicePanel({ onControl: onControl, onLayout: onLayout = () => {} }: any) {
  const rootElement = document.createElement('div')
  ;(rootElement.className = 'i3d-climate-panel i3d-nas-panel i3d-device-panel'), (rootElement.hidden = true)
  const titleElement = document.createElement('h3'),
    statusElement = document.createElement('p'),
    extraGridElement = document.createElement('div'),
    hintElement = document.createElement('p'),
    badgeElement = document.createElement('p'),
    powerButton = document.createElement('button')
  ;(extraGridElement.className = 'i3d-climate-groups i3d-extra-grid'),
    (hintElement.textContent = '请在设备配置中选择弹窗内容。'),
    (powerButton.className = 'i3d-device-power'),
    (powerButton.type = 'button'),
    (powerButton.hidden = true)
  let powerRequest: { desired: boolean; accepted: boolean } | null = null,
    powerTimer: any = null,
    powerSignature = '',
    isDisposed = false,
    lastItem: any = null
  const extraErrorElement = document.createElement('p')
  ;(extraErrorElement.className = 'i3d-extra-error'), extraErrorElement.setAttribute('role', 'status')
  const headingElement = domElement(document, 'div', 'i3d-climate-heading i3d-nas-heading i3d-popup-heading')
  const headingTextElement = document.createElement('div')
  const deviceVisual = createStageDeviceVisual({
    kind: 'generic',
    onActivate: undefined,
  })
  ;(headingTextElement.className = 'i3d-climate-heading-text i3d-popup-heading-text'),
    (badgeElement.hidden = true),
    headingTextElement.append(titleElement, statusElement),
    headingElement.append(headingTextElement, badgeElement, powerButton, deviceVisual.root)
  // 游戏机主屏（0.8.4）：封面 / 账号 / 唤醒休眠 / 选源，只有主机类设备才显示。
  const gameMainElement = document.createElement('div')
  ;(gameMainElement.className = 'i3d-game-main'), (gameMainElement.hidden = true)
  const bodyElement = document.createElement('div')
  ;(bodyElement.className = 'i3d-popup-body'),
    bodyElement.append(gameMainElement, extraGridElement, hintElement),
    rootElement.append(headingElement, bodyElement)
  // 电源键失败/超时提示统一走弹窗反馈聚合区（0.7.8 `device-panel.js`）。
  const feedbackSlot = createPopupFeedback({ element: rootElement }),
    releaseExtraError = feedbackSlot.attach(extraErrorElement, {
      source: 'power',
      label: () => titleElement.textContent || '',
    })
  let gameConsoleMain: any = null
  const purifierExtras = createPurifierExtras({
    element: extraGridElement,
    feedbackSlot,
    onLayout: onLayout,
    onControl: (controlEvent: any) =>
      onControl({
        ...controlEvent,
        deviceKind: 'device-extra',
      }),
  })
  const readPower = () =>
      lastItem?.item?.deviceKind === 'computer' ? computerPower(lastItem.item, lastItem.states) : null,
    clearPowerRequest = () => {
      clearTimeout(powerTimer), (powerTimer = null), (powerRequest = null)
    }
  /**
   * 电源键只服务电脑（0.7.8 `device-panel.js`）：实体可用、支持开关机、
   * 非编辑预览时才可点；等待回执期间显示「开机中… / 关机中…」。
   */
  function refreshPower() {
    if (isDisposed || !lastItem) return
    const power = readPower()
    if (powerRequest && !power?.available) {
      clearPowerRequest(), (extraErrorElement.textContent = '设备已离线')
    }
    if (powerRequest?.accepted && powerRequest.desired === power?.on) {
      clearPowerRequest(), (extraErrorElement.textContent = '')
    }
    powerButton.hidden = !power || !lastItem.item?.powerEntityId
    powerButton.disabled = !!lastItem.editing || !!powerRequest || !power?.available || !power?.supported
    powerButton.setAttribute('aria-pressed', String(power?.on === true)),
      (powerButton.textContent = powerRequest
        ? powerRequest.desired
          ? '开机中…'
          : '关机中…'
        : power?.on
          ? '关机'
          : '开机'),
      (powerButton.title = lastItem.editing ? '编辑预览不可控制设备' : power?.reason || ''),
      (extraErrorElement.hidden = !extraErrorElement.textContent),
      rootElement.setAttribute('aria-busy', String(!!powerRequest))
  }
  powerButton.addEventListener('click', async () => {
    if (!lastItem || isDisposed || powerButton.disabled || powerButton.hidden || powerRequest) return
    const power = readPower()
    if (!power) return
    const nextRequest = { desired: !power.on, accepted: false }
    ;(powerRequest = nextRequest),
      (extraErrorElement.textContent = ''),
      refreshPower(),
      (powerTimer = setTimeout(() => {
        if (isDisposed || powerRequest !== nextRequest) return
        clearPowerRequest(), (extraErrorElement.textContent = '设备未响应，请重试'), refreshPower()
      }, POWER_RESPONSE_TIMEOUT_MS)),
      powerTimer.unref?.()
    try {
      await onControl(power.command)
      if (isDisposed || powerRequest !== nextRequest) return
      ;(nextRequest.accepted = true), refreshPower()
    } catch (powerError: any) {
      if (isDisposed || powerRequest !== nextRequest) return
      clearPowerRequest(),
        (extraErrorElement.textContent = powerError?.message || '开关机失败，请重试。'),
        refreshPower()
    }
  })
  return {
    root: rootElement,
    update(incomingState: any) {
      if (isDisposed) return
      lastItem = incomingState
      const nextPowerSignature = JSON.stringify([
        incomingState.item?.deviceKind,
        incomingState.item?.id,
        incomingState.item?.floorId,
        incomingState.item?.modelId,
        incomingState.item?.powerEntityId,
        !!incomingState.editing,
      ])
      nextPowerSignature !== powerSignature &&
        ((powerSignature = nextPowerSignature), clearPowerRequest(), (extraErrorElement.textContent = ''))
      refreshPower()
      // 游戏机：惰性建主屏（只为主机类设备付这份开销），状态行改用它归一后的 label / 颜色。
      const isGameConsole = isGameConsoleKind(incomingState.item.deviceKind)
      ;(gameMainElement.hidden = !isGameConsole),
        isGameConsole
          ? ((gameConsoleMain ||= createGameConsoleMain({
              element: gameMainElement,
              feedbackSlot: feedbackSlot,
              onControl: onControl,
            })),
            gameConsoleMain.update(incomingState),
            gameConsoleMain.setVisible(true))
          : gameConsoleMain?.setVisible(false)
      if (isGameConsole) {
        const gameConsoleView = gameConsoleState(incomingState.item, incomingState.states)
        ;(statusElement.hidden = false),
          (statusElement.textContent = gameConsoleView.label),
          (statusElement.style.color = gameConsoleView.color),
          (hintElement.hidden = true)
      }
      ;(titleElement.title = titleElement.textContent || ''), (statusElement.title = statusElement.textContent || '')
      titleElement.textContent =
        incomingState.item.label ||
        incomingState.item.deviceName ||
        incomingState.item.deviceLabel ||
        genericDeviceProfile(incomingState.item.deviceKind)?.label ||
        '设备'
      // 舞台会在载荷里带上带迟滞记忆的判定结果；直接单独调用时退回无记忆求值（与旧行为一致）。
      const status = incomingState.statusResult || deviceStatus(incomingState.item, incomingState.states)
      if (
        ((statusElement.hidden = !status.visible),
        (statusElement.textContent =
          (
            {
              normal: '正常',
              warning: '异常',
              off: '已关闭',
              unknown: '状态未知',
            } as Record<string, string>
          )[String(status.status)] || ''),
        (statusElement.style.color = status.color
          ? 'var(--i3d-device-status-' + status.status + ',' + status.color + ')'
          : ''),
        (badgeElement.textContent = ''),
        // 0.8.1：车辆配置了附加功能（extraControls）时不再清空，与其它设备一样在弹窗里渲染功能卡片。
        (hintElement.hidden = !!incomingState.item.extraControls?.length),
        incomingState.item.deviceKind === 'smallcar')
      ) {
        const carStatus = carState(incomingState.item, incomingState.states)
        ;(statusElement.hidden = false),
          (statusElement.textContent = '电量 ' + carStatus.batteryText + ' · ' + carStatus.status),
          (hintElement.hidden = true)
      }
      purifierExtras.update(incomingState)
      // 冰箱用专属图形（对开门 + 两层抽屉），开口开合由门磁实时驱动；其余通用设备仍是通用图形。
      const isFridge = incomingState.item.deviceKind === 'fridge'
      deviceVisual.sync({
        kind: isFridge ? 'fridge' : 'generic',
        on: status.status === 'normal',
        available: status.status !== 'unknown',
        interactive: false,
        disabled: true,
        status: status.status || 'unknown',
        accent: status.color || '#c9a26d',
        label: titleElement.textContent || '设备',
        fridgeOpenings: isFridge ? resolveFridgeOpenings(incomingState.item, incomingState.states) : null,
      })
    },
    setVisible(nextVisible: any) {
      purifierExtras.setVisible?.(nextVisible), gameConsoleMain?.setVisible(!!nextVisible && !gameMainElement.hidden)
    },
    clearFeedback() {
      feedbackSlot.clear()
    },
    dispose() {
      isDisposed ||
        ((isDisposed = true),
        clearTimeout(powerTimer),
        gameConsoleMain?.dispose(),
        releaseExtraError(),
        feedbackSlot.dispose(),
        purifierExtras.dispose(),
        deviceVisual.dispose(),
        rootElement.remove())
    },
  }
}

/**
 * 设备型号档案（0.7.8 `modules/interaction3d/device-profiles.js`）。
 *
 * 与后端 `DEVICE_PROFILES` 保持同一份口径：`collection` 是 3D 配置
 * `devices` 分区里的集合名，`modelType/modelTypes` 是场景模型类型。
 * 展示名、图标、默认高度与模型别名只在这里维护，避免两端各写一份白名单。
 */

export type DeviceProfile = {
  collection: string
  modelType: string
  modelTypes?: readonly string[]
  /** 一个集合收纳多种模型时，按模型类型覆盖展示名（0.7.8 `modelLabels`）。 */
  modelLabels?: Readonly<Record<string, string>>
  label: string
  icon?: string
  height?: number
  statusIndicator?: boolean
  /** 电脑屏幕：允许把画面贴到模型屏幕上。 */
  screen?: boolean
}

/** 绿植集合收纳的 11 种室内植物模型（0.7.8 `INDOOR_PLANT_MODEL_TYPES`）。 */
export const INDOOR_PLANT_MODEL_TYPES = Object.freeze([
  'decor-small-plant',
  'plant',
  'plant-monstera',
  'plant-snake',
  'plant-palm',
  'plant-rubber',
  'plant-pothos',
  'flower-orchid',
  'flower-peace-lily',
  'flower-anthurium',
  'flower-hydrangea',
])

/** 床集合收纳的两种模型（0.7.8 `INDOOR_BED_MODEL_TYPES`）。 */
export const INDOOR_BED_MODEL_TYPES = Object.freeze(['bed', 'round-double-bed'])

/**
 * 沙发集合收纳的三种模型（0.7.9 `INDOOR_SOFA_MODEL_TYPES`）。
 *
 * `sofa-l` 的贵妃位朝向由 `sofaChaiseSide`（`left` / `right`）决定，
 * 该字段与朝向逻辑在 0.7.8 已存在，0.7.9 只是把沙发并入设备档案表。
 */
export const INDOOR_SOFA_MODEL_TYPES = Object.freeze(['sofa', 'sofa-single', 'sofa-l'])

/** 场景模型（车、绿植、床、电脑）：高度取自模型自身，不参与状态灯扫描。 */
const SCENE_DEVICE_PROFILES: Record<string, DeviceProfile> = {
  smallcar: {
    collection: 'cars',
    modelType: 'smallcar',
    modelTypes: Object.freeze(['smallcar', 'suv', 'scooter']),
    label: '汽车',
    icon: 'mdi:car-electric',
    height: 1.5,
    statusIndicator: false,
  },
  plant: {
    collection: 'plants',
    modelType: 'plant',
    modelTypes: INDOOR_PLANT_MODEL_TYPES,
    label: '绿植',
    icon: 'mdi:flower',
    height: 1.6,
    statusIndicator: false,
  },
  bed: {
    collection: 'beds',
    modelType: 'bed',
    modelTypes: INDOOR_BED_MODEL_TYPES,
    modelLabels: Object.freeze({
      bed: '双人床',
      'round-double-bed': '圆形双人床',
    }),
    label: '床',
    icon: 'mdi:bed-king-outline',
    height: 1.02,
    statusIndicator: false,
  },
  computer: {
    collection: 'computers',
    modelType: 'desktop',
    modelTypes: Object.freeze(['desktop', 'laptop']),
    label: '电脑',
    icon: 'mdi:desktop-classic',
    height: 0.5,
    statusIndicator: false,
    screen: true,
  },
  sofa: {
    collection: 'sofas',
    modelType: 'sofa',
    modelTypes: INDOOR_SOFA_MODEL_TYPES,
    modelLabels: Object.freeze({
      sofa: '沙发',
      'sofa-single': '单人沙发',
      'sofa-l': 'L 型沙发',
    }),
    label: '沙发',
    icon: 'mdi:sofa-outline',
    height: 0.82,
    statusIndicator: false,
  },
}

/** 家用电器：冰箱 / 清洁 / 厨房 / 环境类。 */
const HOUSEHOLD_DEVICE_PROFILES: Record<string, DeviceProfile> = {
  fridge: {
    collection: 'fridges',
    modelType: 'fridge',
    label: '冰箱',
    icon: 'mdi:fridge-outline',
    height: 1.85,
  },
  'water-purifier': {
    collection: 'waterPurifiers',
    modelType: 'water-purifier',
    label: '净水器',
    icon: 'mdi:water-pump',
    height: 0.415,
  },
  dishwasher: {
    collection: 'dishwashers',
    modelType: 'dishwasher',
    label: '洗碗机',
    icon: 'mdi:dishwasher',
    height: 0.82,
  },
  washer: {
    collection: 'washers',
    modelType: 'washer',
    label: '洗衣机',
    icon: 'mdi:washing-machine',
    height: 0.85,
  },
  'floor-washer': {
    collection: 'floorWashers',
    modelType: 'floor-washer',
    label: '洗地机',
    icon: 'mdi:vacuum',
    height: 1.209281,
  },
  rangehood: {
    collection: 'rangehoods',
    modelType: 'rangehood',
    label: '油烟机',
    icon: 'mdi:air-filter',
    height: 0.55,
    statusIndicator: false,
  },
  dryer: {
    collection: 'dryers',
    modelType: 'dryer',
    label: '烘干机',
    icon: 'mdi:tumble-dryer',
    height: 0.85,
  },
  humidifier: {
    collection: 'humidifiers',
    modelType: 'humidifier',
    label: '加湿器',
    icon: 'mdi:air-humidifier',
    height: 0.323,
  },
  // 0.8.9：取暖器 / 除湿机 / 电动阀门。与后端 `DEVICE_PROFILES` 同名同集合；
  // 三者复用通用家电面板（不新增渲染形态）。
  heater: {
    collection: 'heaters',
    modelType: 'heater',
    label: '取暖器',
    icon: 'mdi:radiator',
    height: 0.62,
  },
  dehumidifier: {
    collection: 'dehumidifiers',
    modelType: 'dehumidifier',
    label: '除湿机',
    icon: 'mdi:water-percent',
    height: 0.53,
  },
  'electric-valve': {
    collection: 'electricValves',
    modelType: 'electric-valve',
    label: '电动阀门',
    icon: 'mdi:valve',
    height: 0.22,
  },
  'aroma-diffuser': {
    collection: 'aromaDiffusers',
    modelType: 'aroma-diffuser',
    label: '香氛机',
    icon: 'mdi:spray',
    height: 0.1745,
  },
  'disinfection-cabinet': {
    collection: 'disinfectionCabinets',
    modelType: 'disinfection-cabinet',
    label: '消毒柜',
    icon: 'mdi:cupboard-outline',
    height: 0.41,
  },
  toilet: {
    collection: 'toilets',
    modelType: 'toilet',
    label: '智能马桶',
    icon: 'mdi:toilet',
    height: 0.52,
  },
}

/** 厨房小家电。 */
const KITCHEN_DEVICE_PROFILES: Record<string, DeviceProfile> = {
  ricecooker: {
    collection: 'riceCookers',
    modelType: 'ricecooker',
    label: '电饭煲',
    icon: 'mdi:rice',
    height: 0.25,
  },
  steamoven: {
    collection: 'steamOvens',
    modelType: 'steamoven',
    label: '蒸烤箱',
    icon: 'mdi:stove',
    height: 0.6,
  },
  'air-fryer': {
    collection: 'airFryers',
    modelType: 'air-fryer',
    label: '空气炸锅',
    icon: 'mdi:pot-steam',
    height: 0.34,
  },
  'pressure-cooker': {
    collection: 'pressureCookers',
    modelType: 'pressure-cooker',
    label: '电压力锅',
    icon: 'mdi:pot-steam',
    height: 0.3555,
  },
  tea_bar_machine: {
    collection: 'teaBarMachines',
    modelType: 'tea_bar_machine',
    label: '茶吧机',
    icon: 'mdi:kettle',
    height: 1.8,
  },
  pipelinewaterpurifier: {
    collection: 'pipelineWaterPurifiers',
    modelType: 'pipelinewaterpurifier',
    label: '管线机',
    icon: 'mdi:water-pump',
    height: 0.68,
  },
  juicer: {
    collection: 'juicers',
    modelType: 'juicer',
    label: '榨汁机',
    icon: 'mdi:blender',
    height: 0.529,
  },
  'bread-maker': {
    collection: 'breadMakers',
    modelType: 'bread-maker',
    label: '面包机',
    icon: 'mdi:bread-slice-outline',
    height: 0.346872,
  },
  'power-blender': {
    collection: 'powerBlenders',
    modelType: 'power-blender',
    label: '破壁机',
    icon: 'mdi:blender',
    height: 0.495,
  },
  microwave: {
    collection: 'microwaves',
    modelType: 'microwave',
    label: '微波炉',
    icon: 'mdi:microwave',
    height: 0.32,
  },
  'coffee-machine': {
    collection: 'coffeeMachines',
    modelType: 'coffee-machine',
    label: '咖啡机',
    icon: 'mdi:coffee-maker',
    height: 0.418,
  },
}

/** 宠物、办公与网络设备。 */
const OTHER_DEVICE_PROFILES: Record<string, DeviceProfile> = {
  /**
   * 0.8.4 主机：Switch 是 `sensor.*`（nxapi presence），PlayStation 是 `media_player.*`。
   * 图标用 mdi 的官方品牌图标；高度取模型实测值，不参与状态灯扫描。
   */
  'switch-console': {
    collection: 'switchConsoles',
    modelType: 'switch-console',
    label: 'Switch 游戏机',
    icon: 'mdi:nintendo-switch',
    height: 0.128302,
  },
  playstation: {
    collection: 'playstations',
    modelType: 'playstation',
    modelTypes: Object.freeze(['playstation', 'ps5']),
    label: 'PlayStation',
    icon: 'mdi:sony-playstation',
    height: 0.421,
  },
  'pet-feeder': {
    collection: 'petFeeders',
    modelType: 'pet-feeder',
    label: '自动喂食器',
    icon: 'mdi:food-drumstick',
    height: 0.33,
  },
  'smart-litter-box': {
    collection: 'smartLitterBoxes',
    modelType: 'smart-litter-box',
    label: '智能猫砂盆',
    icon: 'mdi:cat',
    height: 0.55,
  },
  'pet-fountain': {
    collection: 'petFountains',
    modelType: 'pet-fountain',
    label: '宠物饮水机',
    icon: 'mdi:fountain',
    height: 0.200819,
  },
  'pet-dryer': {
    collection: 'petDryers',
    modelType: 'pet-dryer',
    label: '宠物烘干机',
    icon: 'mdi:cat',
    height: 0.562,
  },
  printer: {
    collection: 'printers',
    modelType: 'printer',
    label: '打印机',
    icon: 'mdi:printer',
    height: 0.3,
  },
  '3d-printer': {
    collection: 'printers3d',
    modelType: '3d-printer',
    label: '3D打印机',
    icon: 'mdi:printer-3d',
    height: 0.694,
  },
  router: {
    collection: 'routers',
    modelType: 'router',
    label: '路由器',
    icon: 'mdi:router-wireless',
    height: 0.205,
  },
  'home-network-cabinet': {
    collection: 'networkCabinets',
    modelType: 'home-network-cabinet',
    label: '机柜',
    icon: 'mdi:server-network',
    height: 0.64,
  },
  'smart-socket-86': {
    collection: 'smartSockets86',
    modelType: 'smart-socket-86',
    label: '86型智能插座',
    icon: 'mdi:power-socket-eu',
    height: 0.086,
  },
}

/** 合并后的设备型号档案表（33 类，与后端 `DEVICE_PROFILES` 同口径；沙发为 0.7.9 新增）。 */
export const DEVICE_PROFILE_TABLE: Readonly<Record<string, DeviceProfile>> = Object.freeze({
  ...SCENE_DEVICE_PROFILES,
  ...HOUSEHOLD_DEVICE_PROFILES,
  ...KITCHEN_DEVICE_PROFILES,
  ...OTHER_DEVICE_PROFILES,
})

/** 设备类型列表。 */
export const DEVICE_KINDS = Object.freeze(Object.keys(DEVICE_PROFILE_TABLE))

export function deviceProfile(deviceKind: any): DeviceProfile | null {
  return Object.hasOwn(DEVICE_PROFILE_TABLE, deviceKind) ? (DEVICE_PROFILE_TABLE as any)[deviceKind] : null
}

export function isDeviceKind(candidateKind: any) {
  return Object.hasOwn(DEVICE_PROFILE_TABLE, candidateKind)
}

/** 某个设备类型在场景里的全部模型类型（`modelTypes` 优先）。 */
export function deviceModelTypes(deviceKind: any): readonly string[] {
  const profile = deviceProfile(deviceKind)
  return profile ? profile.modelTypes || [profile.modelType] : []
}

/** 指示灯「正常」色：设备状态、NAS、音响、电视共用同一处来源，避免各写一份字面量。 */
export const DEVICE_STATUS_NORMAL_COLOR = '#43ce82'

const deviceClassLabels = {
    door: ['打开', '关闭'],
    garage_door: ['打开', '关闭'],
    window: ['打开', '关闭'],
    opening: ['打开', '关闭'],
    moisture: ['有漏水', '无漏水'],
    problem: ['有故障', '无故障'],
    safety: ['不安全', '安全'],
    smoke: ['有烟雾', '无烟雾'],
    gas: ['有气体', '无气体'],
    tamper: ['被拆动', '未拆动'],
    carbon_monoxide: ['有一氧化碳', '无一氧化碳'],
    connectivity: ['在线', '离线'],
    plug: ['已插电', '未插电'],
    power: ['有电', '无电'],
    battery: ['电量低', '电量正常'],
    battery_charging: ['充电', '未充电'],
    lock: ['未锁定', '已锁定'],
    running: ['运行', '停止'],
    moving: ['移动', '静止'],
    occupancy: ['有人', '无人'],
    presence: ['有人', '无人'],
    motion: ['有移动', '无移动'],
    vibration: ['有振动', '无振动'],
    sound: ['有声音', '无声音'],
    light: ['有光', '无光'],
    heat: ['过热', '正常'],
    cold: ['过冷', '正常'],
    update: ['有更新', '无更新'],
  },
  stateLabels = {
    on: '开启',
    off: '关闭',
    open: '打开',
    closed: '关闭',
    online: '在线',
    offline: '离线',
    normal: '正常',
    fault: '故障',
    error: '错误',
  }
/** 实体描述来自 Home Assistant 的实体注册表，字段既有 camelCase 也有 snake_case，且 attributes 是自由字典，所以这里显式声明两个命名变体。 */
type EntityDescriptor = {
  entityId?: unknown
  entity_id?: unknown
  deviceClass?: unknown
  device_class?: unknown
  attributes?: Record<string, any>
}
export function deviceStatusChoices(entityDescriptor: EntityDescriptor = {}, stateUpdate: any) {
  const newState = stateUpdate?.newState || stateUpdate,
    entityDomain = String(entityDescriptor.entityId || entityDescriptor.entity_id || '').split('.')[0],
    stateAttributes = {
      ...entityDescriptor.attributes,
      ...newState?.attributes,
    },
    deviceClass = stateAttributes.device_class || entityDescriptor.deviceClass || entityDescriptor.device_class
  if (
    ['binary_sensor', 'switch', 'input_boolean', 'light', 'fan', 'remote', 'siren', 'humidifier'].includes(entityDomain)
  ) {
    const choiceLabels =
      entityDomain === 'binary_sensor' ? (deviceClassLabels as any)[deviceClass] || ['开启', '关闭'] : ['开启', '关闭']
    return {
      options: ['on', 'off'].map((choiceValue, choiceIndex) => ({
        value: choiceValue,
        label: choiceLabels[choiceIndex],
      })),
      reminderValue:
        entityDomain === 'binary_sensor' && ['connectivity', 'plug', 'power'].includes(deviceClass) ? 'off' : 'on',
    }
  }
  const optionValues = stateAttributes.options
  return !Array.isArray(optionValues) ||
    optionValues.length !== 2 ||
    new Set(optionValues).size !== 2 ||
    optionValues.some(
      (candidateOption) =>
        typeof candidateOption != 'string' ||
        !candidateOption.trim() ||
        ['unknown', 'unavailable'].includes(candidateOption),
    )
    ? null
    : {
        options: optionValues.map((optionValue) => ({
          value: optionValue,
          label: (stateLabels as any)[optionValue] || optionValue,
        })),
        reminderValue: optionValues[0],
      }
}
export function defaultDeviceStatusRule(entityRule: any, currentState: any, ruleKind: any) {
  const statusChoices = deviceStatusChoices(entityRule, currentState)
  if (!statusChoices) return null
  const activeValue = ruleKind === 'health' ? statusChoices.reminderValue : statusChoices.options[0].value
  return {
    entityId: entityRule.entityId,
    active: activeValue,
    inactive: statusChoices.options.find((choiceOption) => choiceOption.value !== activeValue)!.value,
  }
}

/** 数值比较运算符 → 中文标签。顺序与 0.7.9 的下拉一致，便于逐项比对。 */
export const NUMERIC_OPERATORS = Object.freeze({
  gt: '大于 >',
  gte: '大于等于 ≥',
  lt: '小于 <',
  lte: '小于等于 ≤',
  eq: '等于 =',
  ne: '不等于 ≠',
})

/**
 * 反向比较：`gt↔lte`、`gte↔lt`、`eq↔ne`。
 *
 * 注意 `gt 30` 的反向是 `lte 30` 而不是 `lt 30`：两者合起来才对实数轴做无缝划分，
 * 所以「单阈值对称规则」放行的正是 `gt/lte`、`gte/lt`、`eq/ne` 这三种搭档。
 */
export const INVERSE_OPERATOR: Record<string, string> = Object.freeze({
  gt: 'lte',
  gte: 'lt',
  lt: 'gte',
  lte: 'gt',
  eq: 'ne',
  ne: 'eq',
})

/** 数值直取：数字须有限；字符串须是纯十进制（可带指数），不允许单位或比较符。 */
export function indicatorNumber(value: unknown): number | null {
  if (typeof value == 'number') return Number.isFinite(value) ? value : null
  if (typeof value != 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** 与后端 `validate_device_status_rules` 同口径的前端预检，返回错误文案（合法时为空串）。 */
export function numericIndicatorRuleError(rule: any) {
  for (const condition of [rule?.active, rule?.inactive])
    if (
      !condition ||
      !Object.hasOwn(NUMERIC_OPERATORS, condition.operator) ||
      typeof condition.value != 'number' ||
      !Number.isFinite(condition.value)
    )
      return '请填写有效的比较条件和数值。'
  const activeCondition = rule.active,
    inactiveCondition = rule.inactive
  if (
    inactiveCondition.operator === INVERSE_OPERATOR[activeCondition.operator] &&
    activeCondition.value === inactiveCondition.value
  )
    return ''
  const highCondition = ['gt', 'gte'].includes(activeCondition.operator)
      ? activeCondition
      : ['gt', 'gte'].includes(inactiveCondition.operator)
        ? inactiveCondition
        : null,
    lowCondition = ['lt', 'lte'].includes(activeCondition.operator)
      ? activeCondition
      : ['lt', 'lte'].includes(inactiveCondition.operator)
        ? inactiveCondition
        : null
  return !highCondition ||
    !lowCondition ||
    lowCondition.value > highCondition.value ||
    (lowCondition.value === highCondition.value && highCondition.operator === 'gte' && lowCondition.operator === 'lte')
    ? '两组条件不能重叠；独立恢复条件需使用方向相反的大小比较，并留出恢复区间。'
    : ''
}

const toList = (value: any) => (Array.isArray(value) ? value : [value])

const healthRulesOf = (statusRules: any): any[] =>
  Array.isArray(statusRules?.health) ? statusRules.health : statusRules?.health ? [statusRules.health] : []

const compareIndicatorNumber = (value: number, condition: any) => {
  switch (condition.operator) {
    case 'gt':
      return value > condition.value
    case 'gte':
      return value >= condition.value
    case 'lt':
      return value < condition.value
    case 'lte':
      return value <= condition.value
    case 'eq':
      return value === condition.value
    case 'ne':
      return value !== condition.value
    default:
      return false
  }
}

/**
 * 指示灯读取器：为每台设备维护一份规则快照 + 迟滞记忆。
 *
 * 记忆按设备隔离（不是按实体），键为 `power` / `health:<i>`；规则或机型签名变化时整份重建，
 * 避免「改完阈值仍沿用旧记忆」。设备数组刷新时用 {@link DeviceStatusReader.retain} 剪枝，
 * 实体被删除时用 {@link DeviceStatusReader.forgetEntities} 只清相关记忆。
 */
export type DeviceStatusReader = {
  (device: any, entityStates?: Record<string, any> | Map<string, any>): any
  retain(devices: any[]): void
  clear(): void
  forgetEntities(entityIds: string[]): void
}

export function createDeviceStatusReader(): DeviceStatusReader {
  const registry = new Map<string, { signature: string; rules: any; memory: Map<string, any> }>(),
    deviceKey = (device: any) =>
      JSON.stringify([device?.floorId, device?.modelId, device?.statusBindingId ?? device?.id]),
    ruleSignature = (device: any) => JSON.stringify([device?.deviceId, device?.entityId, device?.statusRules]),
    ensureEntry = (device: any) => {
      const key = deviceKey(device),
        signature = ruleSignature(device)
      let entry = registry.get(key)
      if (!entry || entry.signature !== signature) {
        entry = { signature, rules: device?.statusRules, memory: new Map() }
        registry.set(key, entry)
      }
      return entry
    },
    read = ((device: any, entityStates: any = {}) =>
      deviceStatus(device, entityStates, ensureEntry(device).memory)) as DeviceStatusReader
  read.retain = (devices) => {
    const signatures = new Map(devices.map((device) => [deviceKey(device), ruleSignature(device)]))
    for (const [key, entry] of registry) if (signatures.get(key) !== entry.signature) registry.delete(key)
  }
  read.clear = () => registry.clear()
  read.forgetEntities = (entityIds) => {
    const targets = new Set(entityIds)
    for (const entry of registry.values()) {
      if (targets.has(entry.rules?.power?.entityId)) entry.memory.delete('power')
      healthRulesOf(entry.rules).forEach((rule: any, ruleIndex: number) => {
        if (targets.has(rule?.entityId)) entry.memory.delete('health:' + ruleIndex)
      })
    }
  }
  return read
}

export function deviceStatus(
  device: any,
  entityStates: Record<string, any> | Map<string, any> = {},
  memory?: Map<string, any>,
) {
  const statusRules = device?.statusRules,
    healthRules = healthRulesOf(statusRules)
  if (!statusRules?.power?.entityId && !healthRules.some((healthRule: any) => healthRule?.entityId))
    return {
      visible: false,
      // 0.7.9 在「没有配置任何指示灯规则」时同样标记为不可用（而不是可用但不可见）。
      available: false,
      on: false,
      status: 'none',
    }
  const resolveRuleStatus = (statusRule: any, memoryKey: string) => {
      if (!statusRule?.entityId) return null
      const stateEntry =
          entityStates instanceof Map
            ? entityStates.get(statusRule.entityId)
            : (entityStates as any)[statusRule.entityId],
        entityState = stateEntry?.newState || stateEntry,
        stateValue = String(entityState?.state ?? '')
      const forgetMemory = () => (memory?.delete(memoryKey), 'unknown')
      if (!entityState || entityState.available === false || ['', 'unknown', 'unavailable'].includes(stateValue))
        return forgetMemory()
      if (statusRule.kind === 'numeric') {
        const numericValue = indicatorNumber(entityState.state)
        if (numericValue === null || numericIndicatorRuleError(statusRule)) return forgetMemory()
        const ruleStatus = compareIndicatorNumber(numericValue, statusRule.active)
          ? 'active'
          : compareIndicatorNumber(numericValue, statusRule.inactive)
            ? 'inactive'
            : (memory?.get(memoryKey) ?? 'unknown')
        if (ruleStatus !== 'unknown') memory?.set(memoryKey, ruleStatus)
        return ruleStatus
      }
      return toList(statusRule.active).includes(stateValue)
        ? 'active'
        : toList(statusRule.inactive).includes(stateValue)
          ? 'inactive'
          : 'unknown'
    },
    healthRuleStatuses = healthRules.map((healthRule: any, healthIndex: number) =>
      resolveRuleStatus(healthRule, 'health:' + healthIndex),
    ),
    powerRuleStatus = resolveRuleStatus(statusRules.power, 'power'),
    overallStatus = healthRuleStatuses.includes('active')
      ? 'warning'
      : healthRuleStatuses.includes('unknown') || powerRuleStatus === 'unknown'
        ? 'unknown'
        : powerRuleStatus === 'inactive'
          ? 'off'
          : 'normal'
  return {
    visible: true,
    available: overallStatus !== 'unknown',
    on: overallStatus === 'normal',
    status: overallStatus,
    color: {
      normal: DEVICE_STATUS_NORMAL_COLOR,
      warning: '#efa33d',
      unknown: '#89929b',
      off: '#89929b',
    }[overallStatus],
  }
}
export function deviceEntityIds(device: any) {
  const healthRules = healthRulesOf(device?.statusRules)
  return [
    ...new Set(
      [
        ...(device?.extraControls || []).map((control: any) => control.entityId),
        device?.statusRules?.power?.entityId,
        ...healthRules.map((healthRule: any) => healthRule?.entityId),
      ].filter(Boolean),
    ),
  ]
}

/** 状态指示可选项：优先按实体自身能力，其次按域内置状态表（门锁/扫地机/空调模式等）。 */
export function deviceIndicatorChoices(entityDescriptor: EntityDescriptor = {}, stateUpdate: any) {
  const binaryChoices = deviceStatusChoices(entityDescriptor, stateUpdate)
  if (binaryChoices) return binaryChoices
  const domain = String(entityDescriptor.entityId || entityDescriptor.entity_id || '').split('.')[0],
    newState = stateUpdate?.newState || stateUpdate,
    attributes = {
      ...entityDescriptor.attributes,
      ...newState?.attributes,
    },
    domainStates: Record<string, string[]> = {
      camera: ['off', 'idle', 'recording', 'streaming'],
      cover: ['open', 'closed', 'opening', 'closing'],
      valve: ['open', 'closed', 'opening', 'closing'],
      vacuum: ['cleaning', 'docked', 'idle', 'paused', 'returning', 'error'],
      lawn_mower: ['mowing', 'docked', 'paused', 'returning', 'error'],
      lock: ['locked', 'unlocked', 'locking', 'unlocking', 'open', 'opening', 'jammed'],
      alarm_control_panel: [
        'disarmed',
        'armed_home',
        'armed_away',
        'armed_night',
        'armed_vacation',
        'armed_custom_bypass',
        'pending',
        'arming',
        'disarming',
        'triggered',
      ],
      media_player: ['off', 'on', 'idle', 'playing', 'paused', 'buffering', 'standby'],
      calendar: ['on', 'off'],
      update: ['on', 'off'],
    },
    values =
      domain === 'climate'
        ? attributes.hvac_modes
        : domain === 'water_heater'
          ? attributes.operation_list
          : Array.isArray(attributes.options)
            ? attributes.options
            : domainStates[domain]
  if (!Array.isArray(values) || values.length < 2) return null
  const labels: Record<string, string> = {
      ...stateLabels,
      idle: '待机',
      recording: '录像中',
      streaming: '播放画面',
      opening: '正在打开',
      closing: '正在关闭',
      cleaning: '清扫中',
      docked: '已停靠',
      paused: '已暂停',
      returning: '返回中',
      mowing: '割草中',
      locked: '已上锁',
      unlocked: '已解锁',
      locking: '上锁中',
      unlocking: '解锁中',
      jammed: '锁已卡住',
      disarmed: '已撤防',
      armed_home: '在家布防',
      armed_away: '离家布防',
      armed_night: '夜间布防',
      armed_vacation: '假期布防',
      armed_custom_bypass: '自定义布防',
      pending: '等待触发',
      arming: '布防中',
      disarming: '撤防中',
      triggered: '已触发警报',
      playing: '播放中',
      buffering: '缓冲中',
      standby: '待机',
      heat: '制热',
      cool: '制冷',
      auto: '自动',
      dry: '除湿',
      fan_only: '送风',
      heat_cool: '制冷/制热',
    },
    options = [...new Set(values)]
      .filter((value) => typeof value === 'string' && value.trim() && !['unknown', 'unavailable'].includes(value))
      .map((value) => ({ value, label: labels[value] || value }))
  // 0.7.9 在这里不额外判空：即便过滤后为空也返回 `{options: []}`。
  return { options }
}

export function haNumber(rawValue: any) {
  if (typeof rawValue == 'string') {
    if (((rawValue = rawValue.trim()), !/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(rawValue)))
      return null
    rawValue = Number(rawValue)
  }
  return typeof rawValue == 'number' && Number.isFinite(rawValue) ? rawValue : null
}
export function attributesOf(entityState: any) {
  const attributes = entityState?.attributes
  return attributes && typeof attributes == 'object' && !Array.isArray(attributes) ? attributes : {}
}
export function featureFlags(attributes: any) {
  const parsedFeatures = haNumber(attributes.supported_features)
  return Number.isInteger(parsedFeatures) && parsedFeatures! >= 0 && parsedFeatures! <= 2147483647
    ? (parsedFeatures as number)
    : 0
}
export const stringOptions = (values: any) =>
    Array.isArray(values) ? [...new Set(values.filter((value) => typeof value == 'string' && value.trim()))] : [],
  brightnessModes = new Set(['brightness', 'color_temp', 'hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'white'])
/** 无状态动作实体：`unknown` 表示"可执行"而不是离线。 */
const STATELESS_ACTION_DOMAINS = new Set(['button', 'input_button', 'scene'])
/** 只在"有调用记录"时才有状态的服务域：`unknown` 属于正常态。 */
const STATELESS_SERVICE_DOMAINS = new Set([
  'ai_task',
  'notify',
  'tts',
  'stt',
  'wake_word',
  'infrared',
  'radio_frequency',
  'conversation',
])

/**
 * 附加面板是否需要整体重建。
 *
 * 只比较"会改变控件结构"的字段：换设备、进入/退出编辑、实体可用性翻转、
 * 能力位变化。状态值本身变化不触发重建，交给面板的 update 增量刷新。
 */
export function extraContextChanged(previousContext: any, nextContext: any) {
  const signatureOf = (context: any) => {
    const liveState = context?.state?.newState || context?.state
    const attributes = attributesOf(liveState)
    const domain = String(context?.item?.entityId || '').split('.')[0]
    const statelessUnknown =
      liveState?.state === 'unknown' &&
      ((STATELESS_ACTION_DOMAINS.has(domain) && liveState.available !== false) ||
        (STATELESS_SERVICE_DOMAINS.has(domain) && liveState.availabilityReason === 'unknown'))
    return [
      context?.item?.id,
      context?.item?.entityId,
      !!context?.editing,
      context?.item?.modelAvailable !== false,
      liveState?.available !== false || statelessUnknown,
      statelessUnknown
        ? 'ready'
        : ['unknown', 'unavailable'].includes(liveState?.state)
          ? liveState.state
          : liveState
            ? 'ready'
            : 'missing',
      attributes.supported_features,
      attributes.supported_color_modes,
    ]
  }
  return JSON.stringify(signatureOf(previousContext)) !== JSON.stringify(signatureOf(nextContext))
}

export function fanCapabilities(attributes: any) {
  const flags = featureFlags(attributes),
    unversioned = !Object.hasOwn(attributes, 'supported_features')
  return {
    canTurnOn: unversioned || !!(flags! & 32),
    canTurnOff: unversioned || !!(flags! & 16),
    percentageSupported: unversioned ? haNumber(attributes.percentage) !== null : !!(flags! & 1),
    oscillatingSupported: !!(flags! & 2),
    directionSupported: !!(flags! & 4),
    presetModes: unversioned || flags! & 8 ? stringOptions(attributes.preset_modes) : [],
  }
}

/**
 * 多设备合并（0.8.4 `extra-sources`）：一台舞台设备背后可以挂多个 HA 设备的实体。
 *
 * 数据形态（与后端 `config.extraDevices` / `device.extraControls` 一致）：
 * - `item.deviceId` + `item.extraDevices[{deviceId, deviceName}]`：参与合并的设备清单；
 * - `control.sourceDeviceId`：该控件来自哪个附加设备；空 = 主设备。
 *
 * 这里只放纯函数，编辑器和舞台共用，避免两侧各写一份「主设备优先、去重、清理」的逻辑。
 */

/** 设备项的主设备 id：`deviceId` 优先，其次从实体目录里按主实体反查。 */
export function primaryDeviceId(item: any, entityEntries: any = []): string {
  const matchedEntry = entityEntries?.get
    ? entityEntries.get(item.entityId)
    : entityEntries?.find((entityEntry: any) => entityEntry.entityId === item.entityId)
  return item.deviceId || matchedEntry?.deviceId || matchedEntry?.device_id || ''
}

/** 合并后的设备清单：主设备排第一，其余按配置顺序去重（同 id 只留一条）。 */
export function extraSourceDevices(item: any, entityEntries: any = []) {
  const primaryId = primaryDeviceId(item, entityEntries),
    seenDeviceIds = new Set<string>()
  return [
    ...(primaryId ? [{ deviceId: primaryId, deviceName: item.deviceName || '当前设备', primary: true }] : []),
    ...(item.extraDevices || []),
  ].filter(
    (deviceEntry: any) =>
      deviceEntry.deviceId && !seenDeviceIds.has(deviceEntry.deviceId) && seenDeviceIds.add(deviceEntry.deviceId),
  )
}

/** 某个控件的归属设备：显式 `sourceDeviceId` 优先，否则算主设备。 */
export function extraSourceId(control: any, item: any, entityEntries: any = []): string {
  return control.sourceDeviceId || primaryDeviceId(item, entityEntries)
}

/** 该控件是否来自主设备（主设备的控件不写 `sourceDeviceId`）。 */
export function isPrimaryExtra(control: any): boolean {
  return !control.sourceDeviceId
}

/** 当前挂在主设备下的控件实体 id 集合。 */
export function primaryExtraIds(item: any): Set<any> {
  return new Set((item.extraControls || []).filter(isPrimaryExtra).map((control: any) => control.entityId))
}

/**
 * 把「主设备下」的控件整体转交给某个附加设备（或清空交回主设备）。
 *
 * @param sourceDeviceId 目标设备 id；空串表示交回主设备（去掉 `sourceDeviceId`）
 */
export function replacePrimaryExtras(item: any, sourceDeviceId = '') {
  ;(item.extraControls = (item.extraControls || [])
    .filter((control: any) => control.sourceDeviceId)
    .map((control: any) => {
      if (control.sourceDeviceId !== sourceDeviceId) return control
      const { sourceDeviceId: _handedOverSourceId, ...restControl } = control
      return restControl
    })),
    item.extraDevices &&
      (item.extraDevices = item.extraDevices.filter((deviceEntry: any) => deviceEntry.deviceId !== sourceDeviceId))
}

/** 移除一个附加设备：连同它名下的控件一起清掉（主设备控件不受影响）。 */
export function removeExtraDevice(item: any, deviceId: string) {
  ;(item.extraDevices = (item.extraDevices || []).filter((deviceEntry: any) => deviceEntry.deviceId !== deviceId)),
    (item.extraControls = (item.extraControls || []).filter((control: any) => control.sourceDeviceId !== deviceId))
}

/** 该实体能否被选进「附加实体」：必须有 id、未停用、未离线/丢失。 */
export function selectableExtraEntity(entityEntry: any): boolean {
  return (
    !!entityEntry?.entityId &&
    !entityEntry.disabledBy &&
    !entityEntry.disabled_by &&
    entityEntry.enabled !== false &&
    !['disabled', 'missing'].includes(entityEntry.status || entityEntry.syncStatus)
  )
}

/**
 * 冰箱弹窗右上角图形的开口状态解析。
 *
 * 冰箱模型是「上冷藏室左右对开门 + 下冷冻室两层抽屉」，图形固定按这四个槽位渲染。
 * 这里从弹窗的附加实体（门磁 binary_sensor）里挑出开口实体，映射到对应槽位：
 *   - 冷藏 / 变温 → 上层对开门（left / right）
 *   - 冷冻        → 下层抽屉（top / bottom）
 * 槽位分配优先认名称里的「左/右」「上层/下层」，没有显式线索时按用户在面板里配置的顺序
 * 依次填（第一个门当左门、第一个抽屉当上层），不做字母序排序 —— 排序会把「门2」排到「门」前面。
 */

const CLOSED_OPENINGS = { left: false, right: false, top: false, bottom: false }

export type FridgeOpenings = typeof CLOSED_OPENINGS

type OpeningSlot = 'left' | 'right' | 'top' | 'bottom'

/** 开口实体的兜底关键词：门磁类 device_class 缺失时靠名称识别「门 / 抽屉」。 */
const OPENING_TEXT_PATTERN = /(门|抽屉|door|drawer|冷藏|冷冻|fridge|freezer)/i
const OPEN_DEVICE_CLASSES = new Set(['door', 'garage_door', 'opening', 'window'])
const OPEN_STATE_VALUES = new Set(['on', 'open', 'opened', 'opening', 'true', '1', '开', '打开', '开启'])

type OpeningEntry = {
  /** 用户填写的名称，仅用于槽位线索（不含实体 ID）。 */
  labelText: string
  /** 名称 + 实体 ID，用于「冷藏 / 冷冻」分厢判断。 */
  text: string
  hint: OpeningSlot | ''
  open: boolean
  compartment: 'upper' | 'lower' | ''
}

function liveState(states: any, entityId: string) {
  const entry = states instanceof Map ? states.get(entityId) : states?.[entityId]
  return entry?.newState || entry || null
}

/** 只认门磁类实体：binary_sensor 且 device_class 是门磁，或名称里有「门 / 抽屉」。 */
function isOpeningControl(control: any, state: any) {
  const entityId = String(control?.entityId || '')
  if (!entityId.startsWith('binary_sensor.')) return false
  const deviceClass = String(
    state?.attributes?.device_class || state?.deviceClass || state?.device_class || '',
  ).toLowerCase()
  const text = [control?.label, control?.name, state?.attributes?.friendly_name, entityId].filter(Boolean).join(' ')
  return OPEN_DEVICE_CLASSES.has(deviceClass) || OPENING_TEXT_PATTERN.test(text)
}

/** 名称里显式写明的槽位。只看用户填的名称：实体 ID 里的 top / bottom 是随意的，不能当线索。 */
function slotHintOf(labelText: string): OpeningSlot | '' {
  if (/左|left/.test(labelText)) return 'left'
  if (/右|right/.test(labelText)) return 'right'
  if (/上层|上格|上抽屉|upper/.test(labelText)) return 'top'
  if (/下层|下格|下抽屉|lower/.test(labelText)) return 'bottom'
  return ''
}

function compartmentOf(text: string): OpeningEntry['compartment'] {
  if (/冷冻|freezer/.test(text)) return 'lower'
  if (/冷藏|变温|fridge|refrigerator/.test(text)) return 'upper'
  return ''
}

/** 按分厢把开口分成「门」和「抽屉」；没有分厢线索时按面板顺序前一半当门、后一半当抽屉。 */
function splitCompartments(entries: OpeningEntry[]) {
  const doors = entries.filter((entry) => entry.compartment === 'upper')
  const drawers = entries.filter((entry) => entry.compartment === 'lower')
  if (!doors.length && !drawers.length) {
    const half = Math.ceil(entries.length / 2)
    return { doors: entries.slice(0, half), drawers: entries.slice(half) }
  }
  for (const entry of entries.filter((candidate) => !candidate.compartment))
    (doors.length <= drawers.length ? doors : drawers).push(entry)
  return { doors, drawers }
}

/** 显式线索优先占位，其余按配置顺序填进空槽位。 */
function assignSlots(entries: OpeningEntry[], primary: OpeningSlot, secondary: OpeningSlot) {
  const slots: Partial<Record<OpeningSlot, OpeningEntry>> = {}
  const pending: OpeningEntry[] = []
  for (const entry of entries) {
    if ((entry.hint === primary || entry.hint === secondary) && !slots[entry.hint]) {
      slots[entry.hint] = entry
      continue
    }
    pending.push(entry)
  }
  for (const entry of pending) {
    if (!slots[primary]) slots[primary] = entry
    else if (!slots[secondary]) slots[secondary] = entry
  }
  return slots
}

export function resolveFridgeOpenings(item: any, states: any): FridgeOpenings {
  const controls = Array.isArray(item?.extraControls) ? item.extraControls : []
  const openings = controls
    .map((control: any): OpeningEntry | null => {
      const state = liveState(states, control?.entityId)
      if (!isOpeningControl(control, state)) return null
      const labelText = [control?.label, control?.name, state?.attributes?.friendly_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      const text = labelText + ' ' + String(control?.entityId || '').toLowerCase()
      return {
        labelText,
        text,
        hint: slotHintOf(labelText),
        open: OPEN_STATE_VALUES.has(
          String(state?.state ?? '')
            .trim()
            .toLowerCase(),
        ),
        compartment: compartmentOf(text),
      }
    })
    .filter((entry: OpeningEntry | null): entry is OpeningEntry => !!entry)
  if (!openings.length) return { ...CLOSED_OPENINGS }

  const { doors, drawers } = splitCompartments(openings)
  const doorSlots = assignSlots(doors, 'left', 'right')
  const drawerSlots = assignSlots(drawers, 'top', 'bottom')
  return {
    left: !!doorSlots.left?.open,
    right: !!doorSlots.right?.open,
    top: !!drawerSlots.top?.open,
    bottom: !!drawerSlots.bottom?.open,
  }
}

/**
 * 游戏机主屏（0.8.4 `game-console-panel`）：封面 + 账号 + 累计时长 + 唤醒 / 休眠 + 选游戏。
 *
 * 封面与头像都是「先取二进制再转 blob URL」：后端 `/game-image/{entity}/{role}` 会把
 * 上游图片代理回来并做域校验，直接 `<img src>` 会绕过后端的兜底与超时控制，
 * 所以这里用 `fetch` + `AbortController`，并用 `version` 计数丢弃迟到的响应。
 */

/** 单张封面 / 头像的大小上限（4MB）：超过视为后端代理出了问题。 */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
/** 允许的图片 MIME：只放行位图，避免 SVG 里带脚本。 */
const ALLOWED_IMAGE_TYPES = /^image\/(png|jpeg|webp|gif)$/
/** 指令发出后等主机回报的上限。 */
const COMMAND_ACK_TIMEOUT_MS = 14_000

export function createGameConsoleMain({
  element: hostElement,
  feedbackSlot: inheritedFeedbackSlot,
  onControl: onControl,
  fetchImage: fetchImage = (input: any, init?: any) => fetch(input, init),
}: any) {
  const ownerDocument = hostElement.ownerDocument || globalThis.document,
    createElement = (tagName: any, className = '', textContent = '') => {
      const createdElement = ownerDocument.createElement(tagName)
      return ((createdElement.className = className), (createdElement.textContent = textContent), createdElement)
    },
    contentElement = createElement('div', 'i3d-game-content'),
    coverElement = createElement('img', 'i3d-game-cover'),
    detailElement = createElement('div', 'i3d-game-detail'),
    titleElement = createElement('strong', 'i3d-game-title'),
    accountElement = createElement('div', 'i3d-game-account'),
    avatarElement = createElement('img', 'i3d-game-avatar'),
    accountTextElement = createElement('span'),
    hoursElement = createElement('span', 'i3d-game-hours'),
    artworkMessageElement = createElement('span', 'i3d-game-art-message'),
    reloadArtworkButton = createElement('button', '', '重新加载封面')
  reloadArtworkButton.type = 'button'
  const actionsElement = createElement('div', 'i3d-game-actions'),
    powerOnButton = createElement('button', '', '唤醒'),
    powerOffButton = createElement('button', '', '休眠')
  powerOnButton.type = powerOffButton.type = 'button'
  const sourceLabelElement = createElement('label', 'i3d-game-source'),
    sourceSelectElement = createElement('select')
  ;(sourceSelectElement.name = 'i3d-game-source'), sourceSelectElement.setAttribute('aria-label', '游戏 / 应用')
  const errorElement = createElement('p', 'i3d-extra-error')
  errorElement.setAttribute('role', 'status'),
    (avatarElement.alt = '玩家头像'),
    (coverElement.alt = '当前游戏或应用封面'),
    (avatarElement.hidden = coverElement.hidden = reloadArtworkButton.hidden = true),
    accountElement.append(avatarElement, accountTextElement),
    detailElement.append(titleElement, accountElement, hoursElement, artworkMessageElement, reloadArtworkButton),
    contentElement.append(coverElement, detailElement),
    actionsElement.append(powerOnButton, powerOffButton),
    sourceLabelElement.append(createElement('span', '', '游戏 / 应用'), sourceSelectElement),
    hostElement.append(contentElement, actionsElement, sourceLabelElement, errorElement)
  const pickers = enhancePopupSelects(hostElement)
  let lastItem: any = null,
    lastSignature = '',
    isDisposed = false,
    isVisible = false,
    generation = 0,
    pendingRequest: any = null,
    ackTimeoutId: any = null,
    lastSourcesJson = ''
  const feedbackSlot = inheritedFeedbackSlot || createPopupFeedback({ element: hostElement }),
    releaseError = feedbackSlot.attach(errorElement, {
      source: () => lastItem?.item?.mainEntityId,
      label: () => lastItem?.item?.label || '游戏机',
    }),
    imageSlots = [coverElement, avatarElement].map((imageElement: any) => ({
      image: imageElement,
      source: '',
      controller: null as AbortController | null,
      blob: '',
      version: 0,
    }))

  /** 清掉一个图片槽位：中止在途请求、释放 blob、隐藏 `<img>`。 */
  function resetImageSlot(imageSlot: any) {
    imageSlot.version++,
      imageSlot.controller?.abort(),
      (imageSlot.controller = null),
      (imageSlot.image.onload = imageSlot.image.onerror = null),
      imageSlot.image.removeAttribute?.('src'),
      (imageSlot.image.hidden = true),
      imageSlot.blob && URL.revokeObjectURL(imageSlot.blob),
      (imageSlot.blob = ''),
      (imageSlot.source = '')
  }

  /**
   * 加载一张封面 / 头像。
   *
   * @param imageSlot   槽位
   * @param imageSource 后端图片 URL（空串表示无图）
   * @param force       地址相同也强制重取（「重新加载封面」）
   */
  function loadImage(imageSlot: any, imageSource: any, force = false) {
    if (
      (!force && imageSlot.source === imageSource) ||
      (resetImageSlot(imageSlot), (imageSlot.source = imageSource), !imageSource || !isVisible)
    )
      return
    const slotVersion = imageSlot.version,
      controller = new AbortController()
    imageSlot.controller = controller
    // 迟到的响应 / 关闭弹窗 / 换了设备，一律丢弃。
    const isCurrentRequest = () =>
        !isDisposed && isVisible && imageSlot.version === slotVersion && !controller.signal.aborted,
      onFailure = () => {
        isCurrentRequest() &&
          ((imageSlot.image.hidden = true),
          imageSlot === imageSlots[0] &&
            ((artworkMessageElement.textContent = '封面暂不可用'), (reloadArtworkButton.hidden = false)))
      }
    fetchImage(imageSource, { credentials: 'same-origin', signal: controller.signal })
      .then(async (imageResponse: any) => {
        if (!imageResponse.ok) throw new Error('图片读取失败')
        const imageBlob = await imageResponse.blob()
        if (!isCurrentRequest()) return
        if (imageBlob.size > MAX_IMAGE_BYTES || !ALLOWED_IMAGE_TYPES.test(imageBlob.type))
          throw new Error('图片格式不可用')
        ;(imageSlot.blob = URL.createObjectURL(imageBlob)),
          (imageSlot.image.onload = () => {
            isCurrentRequest() &&
              ((imageSlot.image.hidden = false),
              imageSlot === imageSlots[0] &&
                ((artworkMessageElement.textContent = ''), (reloadArtworkButton.hidden = true)))
          }),
          (imageSlot.image.onerror = onFailure),
          (imageSlot.image.src = imageSlot.blob)
      })
      .catch(onFailure)
      .finally(() => {
        imageSlot.version === slotVersion && (imageSlot.controller = null)
      })
  }

  /** 结束一次等待回报的指令（成功、超时、失败都走这里）。 */
  function clearPendingRequest() {
    clearTimeout(ackTimeoutId), (ackTimeoutId = null), (pendingRequest = null)
  }

  /** 主机回报的状态是否已经满足这次指令（用于「唤醒中…」自动收起）。 */
  function isRequestSatisfied(consoleState: any, request: any) {
    return request.service === 'select_source'
      ? consoleState.source === request.data.source || consoleState.title === request.data.source
      : consoleState.available && consoleState.on === (request.service === 'turn_on')
  }

  function refresh() {
    if (!lastItem || isDisposed) return
    const consoleState = gameConsoleState(lastItem.item, lastItem.states)
    pendingRequest &&
      !consoleState.available &&
      (clearPendingRequest(), (errorElement.textContent = '主实体状态不可用')),
      pendingRequest?.accepted &&
        isRequestSatisfied(consoleState, pendingRequest) &&
        (clearPendingRequest(), (errorElement.textContent = '')),
      (titleElement.textContent =
        consoleState.title || (consoleState.mode === 'unknown' ? '等待状态回报' : '暂无运行内容')),
      (accountTextElement.textContent = [consoleState.account, consoleState.platform].filter(Boolean).join(' · ')),
      (accountElement.hidden = !accountTextElement.textContent && !consoleState.avatar),
      (hoursElement.hidden = consoleState.hours === null),
      (hoursElement.textContent =
        consoleState.hours === null
          ? ''
          : '本作累计 ' +
            (consoleState.hours as number).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) +
            ' 小时'),
      // 换了游戏（封面地址变了）才清掉上一条「暂无封面」提示。
      imageSlots[0].source !== consoleState.artwork &&
        ((artworkMessageElement.textContent = consoleState.artwork ? '' : '暂无游戏封面'),
        (reloadArtworkButton.hidden = true)),
      loadImage(imageSlots[0], isVisible ? consoleState.artwork : ''),
      loadImage(imageSlots[1], isVisible ? consoleState.avatar : ''),
      // 只有 PlayStation 支持开关机 / 选源（Switch 是只读 sensor）。
      (powerOnButton.hidden = consoleState.kind !== 'playstation' || !(consoleState.features & 0x80)),
      (powerOffButton.hidden = consoleState.kind !== 'playstation' || !(consoleState.features & 0x100)),
      (powerOnButton.disabled =
        !isVisible ||
        !!(lastItem.editing || pendingRequest) ||
        !gameConsoleCommand(lastItem.item, lastItem.states, 'turn_on').enabled),
      (powerOffButton.disabled =
        !isVisible ||
        !!(lastItem.editing || pendingRequest) ||
        !gameConsoleCommand(lastItem.item, lastItem.states, 'turn_off').enabled),
      (actionsElement.hidden = powerOnButton.hidden && powerOffButton.hidden),
      (powerOnButton.textContent = pendingRequest?.service === 'turn_on' ? '唤醒中…' : '唤醒'),
      (powerOffButton.textContent = pendingRequest?.service === 'turn_off' ? '休眠中…' : '休眠'),
      (sourceLabelElement.hidden = consoleState.kind !== 'playstation' || !(consoleState.features & 0x800))
    const sourcesJson = JSON.stringify(consoleState.sources)
    if (sourcesJson !== lastSourcesJson) {
      ;(lastSourcesJson = sourcesJson), sourceSelectElement.replaceChildren()
      const placeholderOption = createElement('option', '', '选择游戏或应用')
      ;(placeholderOption.value = ''), sourceSelectElement.append(placeholderOption)
      for (const sourceName of consoleState.sources) {
        const sourceOption = createElement('option', '', sourceName)
        ;(sourceOption.value = sourceName), sourceSelectElement.append(sourceOption)
      }
    }
    pickers.focused(sourceSelectElement) ||
      (sourceSelectElement.value = consoleState.sources.includes(consoleState.source) ? consoleState.source : ''),
      (sourceSelectElement.disabled =
        !isVisible ||
        !!(lastItem.editing || pendingRequest) ||
        !consoleState.available ||
        !consoleState.on ||
        !consoleState.sources.length),
      hostElement.setAttribute('aria-busy', String(!!pendingRequest)),
      pickers.sync()
  }

  /**
   * 发一条指令并等回报。
   *
   * 期间面板保持「唤醒中… / 休眠中…」，`accepted` 由 `refresh()` 在状态真正变化后置位；
   * 超时给出「主机未回报操作结果」，而不是假装成功。
   */
  async function runCommand(service: any, serviceData: Record<string, any> = {}) {
    if (isDisposed || !isVisible || !lastItem || lastItem.editing || pendingRequest) return
    const command = gameConsoleCommand(lastItem.item, lastItem.states, service, serviceData)
    if (!command.enabled) return
    const request = { service: service, data: serviceData, generation: generation, accepted: false }
    ;(pendingRequest = request),
      (errorElement.textContent = ''),
      refresh(),
      (ackTimeoutId = setTimeout(() => {
        pendingRequest !== request ||
          isDisposed ||
          (clearPendingRequest(), (errorElement.textContent = '主机未回报操作结果，请检查状态后重试。'), refresh())
      }, COMMAND_ACK_TIMEOUT_MS)),
      ackTimeoutId.unref?.()
    try {
      await onControl(command.command),
        !isDisposed &&
          pendingRequest === request &&
          generation === request.generation &&
          ((request.accepted = true), refresh())
    } catch (commandError: any) {
      !isDisposed &&
        pendingRequest === request &&
        generation === request.generation &&
        (clearPendingRequest(), (errorElement.textContent = commandError?.message || '主机控制失败'), refresh())
    }
  }

  return (
    (powerOnButton.onclick = () => runCommand('turn_on')),
    (powerOffButton.onclick = () => runCommand('turn_off')),
    sourceSelectElement.addEventListener('change', () => {
      sourceSelectElement.disabled || runCommand('select_source', { source: (sourceSelectElement as any).value })
    }),
    (reloadArtworkButton.onclick = () => {
      !lastItem ||
        isDisposed ||
        !isVisible ||
        ((reloadArtworkButton.hidden = true),
        (artworkMessageElement.textContent = ''),
        loadImage(imageSlots[0], gameConsoleState(lastItem.item, lastItem.states).artwork, true))
    }),
    {
      update(incomingState: any) {
        if (isDisposed) return
        // 换设备 / 换主实体 / 进出编辑预览：清掉所有在途请求与图片。
        const nextSignature = JSON.stringify([
          incomingState.item.id,
          incomingState.item.floorId,
          incomingState.item.modelId,
          incomingState.item.deviceKind,
          incomingState.item.mainEntityId,
          !!incomingState.editing,
        ])
        nextSignature !== lastSignature &&
          ((lastSignature = nextSignature),
          generation++,
          clearPendingRequest(),
          (errorElement.textContent = ''),
          pickers.close(),
          imageSlots.forEach(resetImageSlot)),
          (lastItem = incomingState),
          refresh()
      },
      setVisible(nextVisible: any) {
        ;(isVisible = !!nextVisible),
          isVisible || (generation++, clearPendingRequest(), imageSlots.forEach(resetImageSlot), pickers.close()),
          refresh()
      },
      dispose() {
        isDisposed ||
          ((isDisposed = true),
          generation++,
          clearPendingRequest(),
          imageSlots.forEach(resetImageSlot),
          pickers.dispose(),
          releaseError(),
          (lastItem = null),
          hostElement.replaceChildren())
      },
    }
  )
}

/**
 * 游戏机（Switch / PlayStation）状态与指令（0.8.4 `game-console-state`）。
 *
 * 两类主机在 HA 里的形态完全不同：
 * - `playstation`：`media_player.*`，靠 `state` + `supported_features` 位图；
 * - `switch-console`：`sensor.*`，靠 `Status` / `Game Name` / `Game Image URL` 等属性。
 *
 * 这里把两者归一成同一份视图（`mode` / `title` / `artwork` / `avatar` / `hours` / `sources`），
 * 面板只管照着渲染，不再关心底层差异。
 */

/** 支持主机控制面板的设备类型。 */
export const GAME_CONSOLE_KINDS = Object.freeze(['switch-console', 'playstation'])

export function isGameConsoleKind(deviceKind: any): boolean {
  return GAME_CONSOLE_KINDS.includes(deviceKind)
}

/** HA 的哨兵值（`unknown` / `unavailable` …）一律当空串，避免渲染出「unknown」。 */
const readText = (value: any) =>
    typeof value === 'string' && !['', 'unknown', 'unavailable', 'none', 'null'].includes(value.trim().toLowerCase())
      ? value.trim()
      : '',
  /** 读主实体状态：`states` 既可能是 Map，也可能是普通对象。 */
  readMainState = (gameConfig: any, stateSource: any) => {
    const stateEntry = stateSource?.get
      ? stateSource.get(gameConfig.mainEntityId)
      : stateSource?.[gameConfig.mainEntityId]
    return stateEntry?.newState || stateEntry || {}
  }

/** FNV-1a 32 位：给图片 URL 加内容指纹，状态变了才换 URL（浏览器缓存才不会命中旧图）。 */
function contentHash(payload: any) {
  const serialized = JSON.stringify(payload)
  let hash = 0x811c9dc5
  for (let characterIndex = 0; characterIndex < serialized.length; characterIndex += 1)
    hash = Math.imul(hash ^ serialized.charCodeAt(characterIndex), 0x01000193)
  return (hash >>> 0).toString(36)
}

const gameImageUrl = (entityId: any, role: any, versionSeed: any) =>
  '/api/v1/modules/interaction3d/game-image/' +
  encodeURIComponent(entityId) +
  '/' +
  role +
  '?v=' +
  contentHash(versionSeed)

/** PlayStation 的 `state` → 归一后的 `mode`。 */
const PLAYSTATION_MODES: Record<string, string> = {
  off: 'offline',
  standby: 'offline',
  on: 'online',
  idle: 'online',
  playing: 'running',
  paused: 'running',
  buffering: 'running',
}

/** 归一后的 `mode` → 状态文案。 */
const MODE_LABELS: Record<string, string> = {
  offline: '离线',
  online: '在线',
  running: '运行中',
}

/** 归一后的 `mode` → 状态点颜色。 */
const MODE_COLORS: Record<string, string> = {
  offline: '#89929b',
  online: '#5ca9f4',
  running: '#43ce82',
  unknown: '#89929b',
}

/**
 * 生成游戏机视图。
 *
 * @param gameConfig 舞台上的设备项（`deviceKind` / `mainEntityId`）
 * @param stateSource HA 实体状态（Map 或普通对象）
 */
export function gameConsoleState(gameConfig: any, stateSource: any = {}) {
  const deviceKind = gameConfig.deviceKind,
    mainState = readMainState(gameConfig, stateSource),
    stateAttributes = mainState.attributes || {},
    entityStateCode = String(mainState.state || '').trim(),
    hasMainEntity = !!gameConfig.mainEntityId,
    isAvailable =
      hasMainEntity &&
      mainState.available !== false &&
      !['', 'unknown', 'unavailable'].includes(entityStateCode.toLowerCase())
  let mode = 'unknown',
    title = '',
    artwork = '',
    avatar = '',
    account = '',
    platform = '',
    hours: number | null = null
  if (deviceKind === 'playstation') {
    isAvailable && (mode = PLAYSTATION_MODES[entityStateCode.toLowerCase()] || 'unknown'),
      mode === 'running' &&
        ((title = readText(stateAttributes.media_title) || readText(stateAttributes.source)),
        (artwork = televisionArtwork(stateAttributes)),
        artwork &&
          (artwork +=
            (artwork.includes('?') ? '&' : '?') +
            'hb_game=' +
            contentHash([stateAttributes.media_content_id, title, stateAttributes.source]))),
      (platform = 'PlayStation')
  } else if (deviceKind === 'switch-console') {
    const upperState = entityStateCode.toUpperCase(),
      gameName = readText(stateAttributes['Game Name'])
    isAvailable &&
      (mode =
        upperState === 'OFFLINE'
          ? 'offline'
          : upperState === 'INACTIVE'
            ? 'online'
            : upperState === 'PLAYING' || (upperState === 'ONLINE' && gameName)
              ? 'running'
              : upperState === 'ONLINE'
                ? 'online'
                : 'unknown'),
      (account = readText(stateAttributes['Account Name']) || readText(stateAttributes.Name)),
      (platform = readText(stateAttributes.Platform)),
      mode !== 'unknown' &&
        readText(stateAttributes.entity_picture) &&
        (avatar = gameImageUrl(gameConfig.mainEntityId, 'avatar', [stateAttributes.entity_picture])),
      mode === 'running' &&
        ((title = gameName),
        readText(stateAttributes['Game Image URL']) &&
          (artwork = gameImageUrl(gameConfig.mainEntityId, 'game', [stateAttributes['Game Image URL'], title])))
    const totalPlayTime = stateAttributes['Total Play Time']
    hours =
      (typeof totalPlayTime == 'number' || (typeof totalPlayTime == 'string' && totalPlayTime.trim())) &&
      Number.isFinite(Number(totalPlayTime)) &&
      Number(totalPlayTime) >= 0
        ? Number(totalPlayTime)
        : null
  }
  const isAvailableMode = isAvailable && mode !== 'unknown',
    isOn = isAvailableMode && mode !== 'offline',
    supportedFeatures =
      Number.isInteger(stateAttributes.supported_features) && stateAttributes.supported_features >= 0
        ? stateAttributes.supported_features
        : 0,
    sources: string[] = Array.isArray(stateAttributes.source_list)
      ? [...new Set<string>(stateAttributes.source_list.filter((sourceEntry: any) => readText(sourceEntry)))]
      : []
  return {
    kind: deviceKind,
    entityId: gameConfig.mainEntityId || '',
    state: entityStateCode,
    mode: mode,
    available: isAvailableMode,
    on: isOn,
    title: title,
    artwork: artwork,
    avatar: avatar,
    account: account,
    platform: platform,
    hours: hours,
    sources: sources,
    source: typeof stateAttributes.source == 'string' ? stateAttributes.source : '',
    features: supportedFeatures,
    contentType: readText(stateAttributes.media_content_type),
    // PlayStation 的 standby 在玩家眼里就是「关机」，Switch 没有这个态。
    label: hasMainEntity
      ? isAvailableMode
        ? mode === 'offline' && deviceKind === 'playstation'
          ? '休眠 / 关闭'
          : MODE_LABELS[mode]
        : '状态不可用'
      : '尚未选择主实体',
    color: MODE_COLORS[mode],
  }
}

/** 舞台图标用的指示灯视图。 */
export function gameConsoleIndicator(gameConfig: any, stateSource: any) {
  const consoleState = gameConsoleState(gameConfig, stateSource)
  return {
    ...consoleState,
    visible: !!gameConfig.mainEntityId && consoleState.available,
    status: consoleState.mode,
    steady: true,
  }
}

/**
 * 生成一条主机控制指令（`turn_on` / `turn_off` / `select_source`）。
 *
 * `enabled` 同时校验：类型是 PlayStation（只有它有 `supported_features`）、实体可用、
 * 对应位图位已打开、本次调用没有多余参数、以及「开关」方向与当前状态相反。
 */
export function gameConsoleCommand(
  gameConfig: any,
  stateSource: any,
  service: any,
  serviceData: Record<string, any> = {},
) {
  const consoleState = gameConsoleState(gameConfig, stateSource),
    featureBit = ({ turn_on: 0x80, turn_off: 0x100, select_source: 0x800 } as Record<string, number>)[service],
    hasValidData =
      service === 'select_source'
        ? serviceData && Object.keys(serviceData).length === 1 && consoleState.sources.includes(serviceData.source)
        : serviceData && Object.keys(serviceData).length === 0
  return {
    enabled:
      consoleState.kind === 'playstation' &&
      consoleState.available &&
      !!(featureBit && consoleState.features & featureBit) &&
      hasValidData &&
      (service === 'turn_on' ? !consoleState.on : consoleState.on),
    command: {
      entityId: gameConfig.mainEntityId,
      domain: 'media_player',
      service: service,
      data: serviceData,
      deviceKind: 'game-console',
    },
  }
}

/** 主实体类型校验：PS 必须是 `media_player.*`，Switch 必须是 `sensor.*`。 */
export function gameMainEntityAllowed(deviceKind: any, entityEntry: any): boolean {
  const entityId = entityEntry?.entityId || entityEntry?.entity_id || ''
  return deviceKind === 'playstation'
    ? entityId.startsWith('media_player.')
    : deviceKind === 'switch-console' && entityId.startsWith('sensor.')
}

/**
 * 从实体目录里挑默认主实体：唯一候选才自动选中，多个候选时留空让用户自己选。
 */
export function preferredGameMainEntity(deviceKind: any, entityEntries: any[] = []): string {
  const candidates = entityEntries.filter((entityEntry: any) => gameMainEntityAllowed(deviceKind, entityEntry)),
    preferred =
      deviceKind === 'playstation'
        ? candidates.filter((entityEntry: any) => entityEntry.platform === 'ps4')
        : candidates.filter(
            (entityEntry: any) =>
              Object.hasOwn(entityEntry.attributes || {}, 'Status') ||
              /^switch_profile_/.test(entityEntry.uniqueId || entityEntry.unique_id || ''),
          )
  return preferred.length === 1
    ? preferred[0].entityId
    : deviceKind === 'playstation' && candidates.length === 1
      ? candidates[0].entityId
      : ''
}

/**
 * 设备档案统一由 `device-profiles` 提供；这里只保留 3D 场景需要的
 * 默认高度与状态灯开关，避免前后端/各面板各写一份白名单。
 */
const GENERIC_DEVICE_PROFILES = Object.freeze(
  Object.fromEntries(
    Object.entries(DEVICE_PROFILE_TABLE).map(([deviceKind, profile]) => [
      deviceKind,
      Object.freeze({
        ...profile,
        icon: profile.icon || 'mdi:devices',
        height: profile.height ?? 0.9,
        statusIndicator: profile.statusIndicator !== false,
      }),
    ]),
  ),
)
export const GENERIC_DEVICE_KINDS = Object.freeze(Object.keys(GENERIC_DEVICE_PROFILES)),
  isGenericDeviceKind = (candidateKind: any) => Object.hasOwn(GENERIC_DEVICE_PROFILES, candidateKind),
  genericDeviceProfile = (requestedKind: any) =>
    isGenericDeviceKind(requestedKind) ? (GENERIC_DEVICE_PROFILES as any)[requestedKind] : null
export function genericDeviceMetadata(placements: any[] = []) {
  return Object.fromEntries(
    GENERIC_DEVICE_KINDS.map((deviceKind) => {
      const deviceProfile = genericDeviceProfile(deviceKind)
      return [
        deviceProfile.collection,
        placements
          .filter((placement) => (deviceProfile.modelTypes || [deviceProfile.modelType]).includes(placement.type))
          .map((entry, entryIndex) => ({
            id: entry.id,
            type: entry.type,
            remark: normalizeModelRemark(entry.remark),
            name:
              entry.name || (deviceProfile.modelLabels?.[entry.type] || deviceProfile.label) + ' ' + (entryIndex + 1),
            x: entry.x,
            y: entry.y,
            height:
              (Number(entry.elevation) || 0) +
              (Number(entry.height) || deviceProfile.height) * (deviceKind === 'smallcar' ? 1 : 0.5) +
              (deviceKind === 'smallcar' ? 0.25 : 0),
          })),
      ]
    }),
  )
}
