import { CARD_TEXT_SIZE_PX } from '@app/bridge/presets'
import { formatEntityNumber } from '@app/shared/util/ha-number'
import { domElement } from '@app/shared/util/dom-factory'

export function updateCarCard(containerElement: any, carConfig: any, carOptions: any) {
  let cardElement = containerElement.querySelector('.i3d-car-card')
  if (!cardElement) {
    ;(cardElement = document.createElement('span')),
      (cardElement.className = 'i3d-car-card i3d-temperature-humidity-card')
    for (const [tagName, partName] of [
      ['strong', 'name'],
      ['span', 'reading'],
      ['span', 'track'],
      ['span', 'status'],
    ]) {
      const partElement = document.createElement(tagName)
      ;(partElement.className = 'i3d-car-' + partName), cardElement.append(partElement)
    }
    cardElement.querySelector('.i3d-car-track').append(document.createElement('i')),
      containerElement.replaceChildren(cardElement)
  }
  const state = carState(carConfig, carOptions),
    cardWidth = Math.min(600, Math.max(100, carConfig.cardWidth ?? 180)),
    cardTextSize = carConfig.cardFontSize ?? CARD_TEXT_SIZE_PX
  return (
    (cardElement.querySelector('.i3d-car-name').textContent = carConfig.label || carConfig.deviceName || '汽车'),
    (cardElement.querySelector('.i3d-car-reading').textContent = state.batteryText),
    (cardElement.querySelector('.i3d-car-status').textContent = state.status),
    (cardElement.querySelector('.i3d-car-track i').style.width = (state.battery ?? 0) + '%'),
    (cardElement.querySelector('.i3d-car-track').hidden = !state.batteryAvailable),
    cardElement.classList.toggle('is-charging', state.charging === true),
    cardElement.style.setProperty(
      '--meter-background-opacity',
      String(Math.min(1, Math.max(0, carConfig.cardOpacity ?? 1))),
    ),
    (cardElement.style.width = cardWidth + 'px'),
    // 字号不再夹到 9–32px：用户填多少就多大（后端也只校验正数）。
    (cardElement.style.fontSize = (cardTextSize ?? CARD_TEXT_SIZE_PX) + 'px'),
    // 字号放大后卡片会被 CSS 的 min-width 撑宽：容器跟随实测宽度，避免内容溢出裁切。
    (containerElement.style.width = (cardElement.offsetWidth || cardWidth) + 'px'),
    (containerElement.style.height = cardElement.offsetHeight + 'px'),
    (containerElement.title = (carConfig.label || '汽车') + ' · 电量 ' + state.batteryText + ' · ' + state.status),
    containerElement.setAttribute('aria-label', containerElement.title),
    state
  )
}

export function createCarCharging({
  requestFrame: requestFrame = () => {},
  isVisible: isModelInView = (_target: any) => true,
}: {
  requestFrame?: (...args: any[]) => any
  isVisible?: (target: any) => boolean
} = {}) {
  let currentRoot: any,
    currentRevision: any,
    currentRetainedRoots: any = [],
    chargingEntries: any = [],
    isChargeAnimating = false,
    isDisposed = false,
    presentationGain = 1
  const detectReducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    clearChargingEntries = () => {
      for (const chargingEntry of chargingEntries) disposeChargingEntry(chargingEntry)
      ;(chargingEntries = []), (isChargeAnimating = false)
    },
    disposeChargingEntry = (recordToDispose: any) => {
      recordToDispose.on.value = 0
      for (const surfacePart of recordToDispose.parts)
        surfacePart.mesh.material === surfacePart.replacement && (surfacePart.mesh.material = surfacePart.original),
          surfacePart.materials.forEach((disposedMaterial: any) => disposedMaterial.dispose())
    },
    isVisibleUnderRoot = (candidateObject: any) => {
      for (let ancestorObject = candidateObject; ancestorObject; ancestorObject = ancestorObject.parent) {
        if (ancestorObject.visible === false) return false
        if (ancestorObject === currentRoot) return isModelInView(candidateObject)
      }
      return false
    }
  return {
    setPresentationGain(gain: any) {
      const clampedGain = Number.isFinite(gain) ? Math.min(1, Math.max(0, gain)) : 1
      if (isDisposed || clampedGain === presentationGain) return
      ;(presentationGain = clampedGain), clampedGain === 0 && (isChargeAnimating = false)
      let hasChanged = false
      for (const gainEntry of chargingEntries) {
        const targetGain = gainEntry.charging ? clampedGain : 0
        gainEntry.on.value !== targetGain && ((gainEntry.on.value = targetGain), (hasChanged = true))
      }
      hasChanged && requestFrame()
    },
    sync({
      root: root,
      revision: revision,
      retainedRoots: retainedRoots = [],
      bindings: bindings = [],
      states: states = {},
    }: any) {
      if (!isDisposed) {
        if (
          currentRoot !== root ||
          currentRevision !== revision ||
          currentRetainedRoots.length !== retainedRoots.length ||
          currentRetainedRoots.some((retainedRoot: any, index: any) => retainedRoot !== retainedRoots[index])
        ) {
          const retainedRootSet = new Set([root, ...retainedRoots].filter(Boolean))
          ;(chargingEntries = chargingEntries.filter((retainedEntry: any) => {
            for (let ancestorModel = retainedEntry.model; ancestorModel; ancestorModel = ancestorModel.parent)
              if (retainedRootSet.has(ancestorModel)) return true
            return (disposeChargingEntry(retainedEntry), false)
          })),
            (currentRoot = root),
            (currentRevision = revision),
            (currentRetainedRoots = [...retainedRoots]),
            currentRoot?.traverse((sceneObject: any) => {
              if (
                sceneObject.userData?.environmentModelType !== 'smallcar' ||
                chargingEntries.some((existingRecord: any) => existingRecord.model === sceneObject)
              )
                return
              const chargeRecord = {
                model: sceneObject,
                parts: [] as any[],
                on: {
                  value: 0,
                },
                time: {
                  value: 0,
                },
              }
              sceneObject.traverse((partMesh: any) => {
                if (!partMesh.isMesh || !partMesh.material) return
                const sourceMaterial = partMesh.material,
                  clonedMaterials: any = [],
                  hasVehicleLength = !!partMesh.geometry?.getAttribute('hbVehicleLength'),
                  createChargedMaterial = (materialToClone: any) => {
                    if (!materialToClone.isMeshStandardMaterial) return materialToClone
                    const clonedMaterial = materialToClone.clone(),
                      originalOnBeforeCompile = materialToClone.onBeforeCompile,
                      originalCacheKey = materialToClone.customProgramCacheKey?.call(materialToClone) || ''
                    return (
                      Object.defineProperty(clonedMaterial, 'runtimeSourceMaterial', {
                        value: materialToClone,
                        configurable: true,
                      }),
                      (clonedMaterial.onBeforeCompile = function (shader: any, renderer: any) {
                        originalOnBeforeCompile?.call(this, shader, renderer),
                          (shader.uniforms.hbChargeOn = chargeRecord.on),
                          (shader.uniforms.hbChargeTime = chargeRecord.time),
                          (shader.vertexShader =
                            (hasVehicleLength ? 'attribute float hbVehicleLength;\n' : '') +
                            'varying float hbChargeLength;\n' +
                            shader.vertexShader),
                          (shader.vertexShader = shader.vertexShader.replace(
                            '#include <begin_vertex>',
                            '#include <begin_vertex>\nhbChargeLength = ' +
                              (hasVehicleLength ? 'hbVehicleLength' : '-position.y') +
                              ';',
                          )),
                          (shader.fragmentShader =
                            'varying float hbChargeLength;\nuniform float hbChargeOn;\nuniform float hbChargeTime;\n' +
                            shader.fragmentShader),
                          (shader.fragmentShader = shader.fragmentShader.replace(
                            '#include <opaque_fragment>',
                            '\n                  float hbPhase = fract(hbChargeTime * .36);\n                  float hbBehind = mix(-3.4, 4.1, hbPhase) - hbChargeLength;\n                  float hbFlow = exp(-max(hbBehind, 0.0) * 1.9)\n                    * (1.0 - smoothstep(0.0, .20, -hbBehind)) * (1.0 - smoothstep(.90, 1.0, hbPhase));\n                  float hbRim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.2);\n                  outgoingLight += vec3(.12, 1.2, .69) * hbRim * hbFlow * hbChargeOn * 3.2;\n                  #include <opaque_fragment>',
                          ))
                      }),
                      (clonedMaterial.customProgramCacheKey = () =>
                        originalCacheKey + '|hb-car-charge-surface-v2:' + Number(hasVehicleLength)),
                      clonedMaterials.push(clonedMaterial),
                      clonedMaterial
                    )
                  },
                  chargedMaterial = Array.isArray(sourceMaterial)
                    ? sourceMaterial.map(createChargedMaterial)
                    : createChargedMaterial(sourceMaterial)
                ;(partMesh.material = chargedMaterial),
                  chargeRecord.parts.push({
                    mesh: partMesh,
                    original: sourceMaterial,
                    replacement: chargedMaterial,
                    materials: clonedMaterials,
                  })
              }),
                chargingEntries.push(chargeRecord)
            })
        }
        for (const syncEntry of chargingEntries) {
          const matchedBinding = bindings.find(
            (binding: any) =>
              binding.floorId === syncEntry.model.userData.environmentFloorId &&
              binding.modelId === syncEntry.model.userData.environmentModelId,
          )
          syncEntry.charging = !!(
            matchedBinding &&
            matchedBinding.visible !== false &&
            carState(matchedBinding, states).charging === true
          )
          const targetChargeGain = syncEntry.charging ? presentationGain : 0
          syncEntry.on.value !== targetChargeGain && ((syncEntry.on.value = targetChargeGain), requestFrame())
        }
      }
    },
    tick(deltaMs: any) {
      isChargeAnimating = false
      for (const tickEntry of chargingEntries)
        tickEntry.on.value &&
          isVisibleUnderRoot(tickEntry.model) &&
          ((tickEntry.time.value = detectReducedMotion() ? 1.4 : deltaMs / 1000),
          (isChargeAnimating ||= !detectReducedMotion()))
      return (isChargeAnimating && requestFrame(), isChargeAnimating)
    },
    nextDelay() {
      return isChargeAnimating ? 1000 / 30 : Infinity
    },
    dispose() {
      isDisposed || ((isDisposed = true), clearChargingEntries(), (currentRoot = null), (currentRetainedRoots = []))
    },
  }
}

const readEntityState = (stateSource: any, entityId: any) => {
    const resolvedEntityState = stateSource?.get?.(entityId) ?? stateSource?.[entityId]
    return resolvedEntityState?.newState ?? resolvedEntityState
  },
  hasUsableState = (entityState: any) =>
    entityState &&
    entityState.available !== false &&
    entityState.state != null &&
    !['', 'unknown', 'unavailable', 'none', 'null'].includes(String(entityState.state).trim().toLowerCase())
export function carChargingMappingError(chargingStateConfig: any) {
  const rawStateValues = [chargingStateConfig?.inactive, chargingStateConfig?.active]
  return rawStateValues.some((rawStateValue) => typeof rawStateValue != 'string' || !rawStateValue.trim())
    ? '自定义时，请同时填写不充电和充电的原始状态值；两项都留空可恢复自动识别。'
    : rawStateValues.some((rawStateText) => rawStateText.length > 120 || /[\r\n]/.test(rawStateText))
      ? '每个输入框只填一个原始状态值，不超过 120 个字符。'
      : rawStateValues.some((normalizedStateValue) =>
            ['unknown', 'unavailable', 'none', 'null'].includes(normalizedStateValue.trim().toLowerCase()),
          )
        ? 'unknown、unavailable、none、null 表示未知或不可用，不能用作充电或不充电的状态值。'
        : chargingStateConfig.active.trim() === chargingStateConfig.inactive.trim()
          ? '充电和不充电的状态值不能相同。'
          : ''
}
const chargingStateLabels = {
  charging: '充电中',
  not_charging: '未充电',
  disconnected: '未连接',
  stopped: '已停止',
  complete: '充电完成',
  completed: '充电完成',
  paused: '充电暂停',
  idle: '空闲',
}
export function carState(carConfig: any, entityStateStore: Record<string, any> = {}) {
  const batteryState = readEntityState(entityStateStore, carConfig.batteryEntityId),
    chargingState = readEntityState(entityStateStore, carConfig.chargingEntityId),
    batteryLevel =
      hasUsableState(batteryState) && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(batteryState.state).trim())
        ? Number(batteryState.state)
        : NaN,
    unitOfMeasurement = batteryState?.attributes?.unit_of_measurement,
    isBatteryLevelValid =
      Number.isFinite(batteryLevel) &&
      batteryLevel >= 0 &&
      batteryLevel <= 100 &&
      (!unitOfMeasurement || unitOfMeasurement === '%'),
    chargingStateMapping = carConfig.chargingStates,
    rawChargingState = hasUsableState(chargingState) ? String(chargingState.state).trim() : '',
    isBinarySensor = carConfig.chargingEntityId?.startsWith('binary_sensor.'),
    normalizedChargingState = rawChargingState.toLowerCase(),
    isCharging = rawChargingState
      ? chargingStateMapping
        ? carChargingMappingError(chargingStateMapping)
          ? null
          : rawChargingState === chargingStateMapping.active.trim()
            ? true
            : rawChargingState === chargingStateMapping.inactive.trim()
              ? false
              : null
        : isBinarySensor
          ? normalizedChargingState === 'on'
            ? true
            : normalizedChargingState === 'off'
              ? false
              : null
          : ['charging', '充电中', '正在充电'].includes(normalizedChargingState)
            ? true
            : [
                  'not_charging',
                  'disconnected',
                  'stopped',
                  'complete',
                  'completed',
                  'paused',
                  'idle',
                  '未充电',
                  '充电完成',
                  '未连接',
                  '充电暂停',
                ].includes(normalizedChargingState)
              ? false
              : null
      : null,
    isChargingUnavailable =
      chargingState?.available === false || String(chargingState?.state).trim().toLowerCase() === 'unavailable',
    chargingStatusText = rawChargingState
      ? isBinarySensor && isCharging !== null
        ? isCharging
          ? '充电中'
          : '未充电'
        : !chargingStateMapping && Object.hasOwn(chargingStateLabels, normalizedChargingState)
          ? (chargingStateLabels as any)[normalizedChargingState]
          : rawChargingState
      : isChargingUnavailable
        ? '充电状态不可用'
        : '充电状态未知'
  return {
    battery: isBatteryLevelValid ? batteryLevel : null,
    batteryAvailable: isBatteryLevelValid,
    charging: isCharging,
    chargingRaw: rawChargingState,
    available: isBatteryLevelValid || !!rawChargingState,
    on: isCharging === true,
    batteryText: isBatteryLevelValid ? Math.round(batteryLevel * 10) / 10 + '%' : '—',
    status: chargingStatusText,
  }
}
export function standardCarBindings(entities: any[] = []) {
  const findEntityId = (entityDomain: any, deviceClass: any) => {
    const matchingEntities = entities.filter(
      (entityConfig) =>
        entityConfig.entityId?.startsWith(entityDomain + '.') &&
        entityConfig.attributes?.device_class === deviceClass &&
        entityConfig.enabled !== false &&
        !entityConfig.disabledBy &&
        !entityConfig.disabled_by &&
        !['missing', 'disabled'].includes(entityConfig.status),
    )
    return matchingEntities.length === 1 ? matchingEntities[0].entityId : ''
  }
  return {
    batteryEntityId: findEntityId('sensor', 'battery'),
    chargingEntityId: findEntityId('binary_sensor', 'battery_charging'),
  }
}

/** 车辆点击行为（0.8.1）：车辆标签与车模共用同一设置，默认不响应点击。
 *  `interactionEnabled` 是开关本身，`clickAction` 只在开关打开且值合法时生效。 */
export function carClickAction(
  carEntry: { interactionEnabled?: boolean; clickAction?: string } | null | undefined,
): string {
  if (carEntry?.interactionEnabled !== true) return 'none'
  const clickAction = carEntry.clickAction
  return clickAction && ['focus', 'focus-panel', 'panel'].includes(clickAction) ? clickAction : 'none'
}

/**
 * 四轮胎压叠加层（0.8.0 `car-tires.js` 的等价实现）。
 *
 * 与普通标记不同，胎压标签**跟车模走**：位置由车模包围盒推出四个轮位锚点，
 * 每帧把锚点投影到屏幕，再用 12px 引线把标签推到车身外侧。因此这里不能复用
 * `i3d-marker` 的“世界坐标点 → 屏幕”流程，而是自己维护一张标签表。
 *
 * 三条容易翻车的约束：
 * - 包围盒必须跳过 `userData.environmentEffect` 网格：气幕/光环会把盒撑大，轮位会飘；
 * - 标签只随 `tirePressure.enabled === true` 且车型受支持（四轮车 / 电瓶车）生成；
 * - `pending` 用来告诉调用方“模型或包围盒还没算出来”，下一帧需要重算。
 */

/** 轮位轴：`side` 为车宽方向（左右轮），`front` 为车长方向（前后轮），
 *  `labelSide` 仅双轮车型使用 —— 前后轮都在中线上，靠这一侧把标签推到车身外侧。 */
export type CarTireWheel = {
  key: string
  label: string
  side: number
  front: number
  labelSide: number
}

export const CAR_TIRE_WHEELS: readonly CarTireWheel[] = Object.freeze([
  { key: 'fl', label: '左前', side: 1, front: 1, labelSide: 1 },
  { key: 'fr', label: '右前', side: -1, front: 1, labelSide: -1 },
  { key: 'rl', label: '左后', side: 1, front: -1, labelSide: 1 },
  { key: 'rr', label: '右后', side: -1, front: -1, labelSide: -1 },
])

/** 电瓶车（0.8.1）：只有前后两只轮，且都落在车身中线上。 */
export const SCOOTER_TIRE_WHEELS: readonly CarTireWheel[] = Object.freeze([
  { key: 'front', label: '前轮', side: 0, front: 1, labelSide: 1 },
  { key: 'rear', label: '后轮', side: 0, front: -1, labelSide: -1 },
])

/** 四轮车与电瓶车都支持胎压。 */
export function supportsCarTires(modelType: string | undefined | null): boolean {
  return modelType === 'smallcar' || modelType === 'suv' || modelType === 'scooter'
}

/** 车型对应的轮位表；未知车型返回 undefined（调用方据此跳过整段胎压）。 */
export function carTireWheels(modelType: string | undefined | null): readonly CarTireWheel[] | undefined {
  if (modelType === 'scooter') return SCOOTER_TIRE_WHEELS
  return modelType === 'smallcar' || modelType === 'suv' ? CAR_TIRE_WHEELS : undefined
}

/** 车型切换（四轮 ↔ 双轮）后清掉不属于新轮位表的键，避免旧绑定跟着车型漂移。
 *  上游返回值整块换掉 `tirePressure`：开关只在还有轮位绑定时保持打开，样式字段沿用。 */
export function retargetCarTires(tires: CarTireConfig, modelType: string | undefined | null): CarTireConfig {
  if (!supportsCarTires(modelType)) return tires
  const nextWheels: Record<string, string> = {},
    allowedKeys = new Set((carTireWheels(modelType) ?? []).map((wheelEntry) => wheelEntry.key))
  for (const [wheelKey, wheelEntityId] of Object.entries(tires.wheels ?? {}))
    allowedKeys.has(wheelKey) && (nextWheels[wheelKey] = wheelEntityId)
  return {
    ...tires,
    enabled: tires.enabled === true && Object.keys(nextWheels).length > 0,
    wheels: nextWheels,
  }
}

/** 从场景元数据里取车辆型号：订阅侧拿不到绑定带宽的车型，只能查元数据。 */
export function carTireModelType(
  carItem: { floorId?: string; modelId?: string } | null | undefined,
  sceneMetadata: CarSceneMetadata | null | undefined,
): string | undefined {
  return sceneMetadata?.floors
    ?.find((metadataFloor) => metadataFloor.id === carItem?.floorId)
    ?.cars?.find((metadataCar) => metadataCar.id === carItem?.modelId)?.type
}

/** 场景元数据里只关心「楼层 → 车辆 → 型号」这一条链。 */
export type CarSceneMetadata = {
  floors?: readonly {
    id?: string
    cars?: readonly { id?: string; type?: string }[]
  }[]
}

/** 胎压配置（写进 `cars[]` 条目）：样式字段与四轮/双轮无关，轮位键由车型决定。 */
export type CarTireConfig = {
  enabled: boolean
  mode: 'compact' | 'named'
  fontSize: number
  opacity: number
  wheels: Record<string, string>
}

/** 默认（关闭）胎压配置；样式字段保留，便于开关时沿用。 */
export function defaultCarTires(): CarTireConfig {
  return { enabled: false, mode: 'compact', fontSize: 14, opacity: 0.8, wheels: {} }
}

/** 当前条目实际要订阅的轮位实体；未启用 / 车型不支持 / 非 `sensor.*` 一律忽略。
 *  `modelType` 省略时只查 `enabled` 与 `sensor.*` —— 订阅侧拿不到车型（绑定不带宽），
 *  车型门禁交给编辑器与舞台。 */
export function carTireEntities(
  item: { tirePressure?: CarTireConfig } | null | undefined,
  modelType?: string | null,
): string[] {
  if (item?.tirePressure?.enabled !== true) return []
  if (modelType != null && !supportsCarTires(modelType)) return []
  /** 拿到车型就按车型取轮位；拿不到（订阅侧尚未收到元数据）就把两套轮位都算上，宁多订不漏订。 */
  const wheelCatalog = (modelType != null ? carTireWheels(modelType) : undefined) ?? [
    ...CAR_TIRE_WHEELS,
    ...SCOOTER_TIRE_WHEELS,
  ]
  return wheelCatalog
    .map((wheelEntry) => item.tirePressure?.wheels?.[wheelEntry.key])
    .filter(
      (wheelEntityId): wheelEntityId is string =>
        typeof wheelEntityId === 'string' && wheelEntityId.startsWith('sensor.'),
    )
}

/** 只接受非负数值（不含负号），否则显示 `—`；单位沿用实体自带值，不做换算。 */
function carTireReading(entityId: any, states: any, formats: any = {}) {
  const entityRecord = states?.get?.(entityId) ?? states?.[entityId],
    entityState = entityRecord?.newState || entityRecord,
    rawState = entityState?.state,
    unit =
      typeof entityState?.attributes?.unit_of_measurement === 'string'
        ? entityState.attributes.unit_of_measurement
        : '',
    available =
      entityState?.available !== false &&
      ['number', 'string'].includes(typeof rawState) &&
      /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(String(rawState).trim()) &&
      Number.isFinite(Number(rawState))
  return {
    available,
    text: available ? formatEntityNumber(entityId, entityState, formats?.[entityId]) : '—',
    unit,
  }
}

/** 轮位锚点（模型局部坐标）：车身外侧再偏移一点，给引线留出起点。
 *  双轮车型 `side === 0`，轮子在车身中线上，横向偏移改由 `labelSide` 决定。 */
function carTireWheelPoints(THREE: any, bounds: any, wheel: CarTireWheel) {
  const size = bounds.getSize(new THREE.Vector3()),
    center = bounds.getCenter(new THREE.Vector3()),
    isTwoWheeler = wheel.side === 0,
    // 两轮车的轮子在车身中线上：锚点必须用包围盒中心 x，
    // 左右偏移只体现在引线外侧（labelSide），否则前轮会被推到车身一侧。
    anchor = new THREE.Vector3(
      isTwoWheeler ? center.x : center.x + wheel.side * 0.46 * size.x,
      bounds.min.y + size.y * (isTwoWheeler ? 0.16 : 0.2),
      center.z + wheel.front * size.z * (isTwoWheeler ? 0.35 : 0.32),
    ),
    outside = anchor.clone()
  outside.x += (isTwoWheeler ? wheel.labelSide * 0.6 : wheel.side * 0.12) * size.x
  outside.y += size.y * 0.08
  return { anchor, outside }
}

type CarTireRecord = {
  label: any
  line: any
  wheel: CarTireWheel
  item: any
  entityId: string
  model?: any
  bounds?: any
  shape?: string
  anchor?: any
  outside?: any
  textSignature?: string
  metrics?: { w: number; h: number } | null
  viewportWidth?: number
}

export function createCarTires({ THREE, container }: { THREE: any; container: any }) {
  const rootElement = domElement(document, 'div', 'i3d-car-tires')
  const lineCanvas = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  lineCanvas.classList.add('i3d-car-tire-lines')
  rootElement.append(lineCanvas)
  const records = new Map<string, CarTireRecord>(),
    boundsCache = new WeakMap<any, { bounds: any; shape: string }>()
  let rootNode: any,
    sceneRevision: any,
    isDisposed = false,
    isPending = false
  const recordKey = (bindingEntry: any) => JSON.stringify([bindingEntry.id, bindingEntry.floorId, bindingEntry.modelId])

  const removeRecord = (record: CarTireRecord) => {
    record.label.remove()
    record.line.remove()
  }
  const clearRecords = () => {
    for (const record of records.values()) removeRecord(record)
    records.clear()
  }

  /** 按 `environmentFloorId / environmentModelId` 把标签绑到车模节点上。 */
  const resolveModels = () => {
    const modelByKey = new Map<string, any>()
    rootNode?.traverse((sceneNode: any) => {
      sceneNode.userData?.environmentModelId &&
        modelByKey.set(
          JSON.stringify([sceneNode.userData.environmentFloorId, sceneNode.userData.environmentModelId]),
          sceneNode,
        )
    })
    for (const record of records.values()) {
      record.model = modelByKey.get(JSON.stringify([record.item.floorId, record.item.modelId]))
      record.bounds = null
      record.shape = ''
    }
    isPending = [...records.values()].some((pendingRecord) => !pendingRecord.model)
  }

  /** 车模包围盒：形状签名变了才重算；缓存命中直接复用锚点。 */
  const ensureBounds = (record: CarTireRecord) => {
    const tireModel = record.model
    if (!tireModel) return false
    const shapeSignature =
      sceneRevision +
      ':' +
      tireModel.children.map((childNode: any) => childNode.uuid + ':' + (childNode.geometry?.uuid || '')).join('|')
    if (record.bounds && shapeSignature === record.shape) return true
    const cachedBounds = boundsCache.get(tireModel)
    if (cachedBounds?.shape === shapeSignature) {
      ;(record.bounds = cachedBounds.bounds),
        (record.shape = shapeSignature),
        Object.assign(record, carTireWheelPoints(THREE, record.bounds, record.wheel))
      return true
    }
    tireModel.updateWorldMatrix(true, true)
    const invertMatrix = tireModel.matrixWorld.clone().invert(),
      localMatrix = new THREE.Matrix4(),
      boundsBox = new THREE.Box3(),
      scratchVector = new THREE.Vector3()
    tireModel.traverse((meshNode: any) => {
      /** 气幕 / 光环不是车身，算进来会把包围盒撑大。 */
      if (!meshNode.isMesh || !meshNode.geometry || meshNode.userData.environmentEffect) return
      meshNode.geometry.computeBoundingBox()
      meshNode.geometry.boundingBox &&
        boundsBox.union(
          scratchVector
            .copy(meshNode.geometry.boundingBox)
            .applyMatrix4(localMatrix.multiplyMatrices(invertMatrix, meshNode.matrixWorld)),
        )
    })
    if (boundsBox.isEmpty()) return false
    ;(record.bounds = boundsBox),
      (record.shape = shapeSignature),
      boundsCache.set(tireModel, { bounds: boundsBox, shape: shapeSignature }),
      Object.assign(record, carTireWheelPoints(THREE, boundsBox, record.wheel))
    return true
  }

  const updateRecordText = (record: CarTireRecord, states: any, formats: any) => {
    const tireConfig = record.item.tirePressure,
      reading = carTireReading(record.entityId, states, formats),
      textSignature = JSON.stringify([tireConfig.mode, tireConfig.fontSize, tireConfig.opacity, reading])
    if (textSignature === record.textSignature) return false
    ;(record.textSignature = textSignature), record.label.replaceChildren()
    if (tireConfig.mode === 'named') {
      const nameElement = document.createElement('div')
      ;(nameElement.className = 'i3d-car-tire-name'),
        (nameElement.textContent = record.wheel.label),
        record.label.append(nameElement)
    }
    const readingElement = document.createElement('span')
    if (
      ((readingElement.className = 'i3d-car-tire-reading'), (readingElement.textContent = reading.text), reading.unit)
    ) {
      const unitElement = document.createElement('small')
      ;(unitElement.textContent = reading.unit), readingElement.append(unitElement)
    }
    record.label.append(readingElement),
      (record.label.style.fontSize = (tireConfig.fontSize ?? 14) + 'px'),
      record.label.style.setProperty('--meter-background-opacity', String(tireConfig.opacity ?? 0.8)),
      record.label.classList.toggle('is-unavailable', !reading.available)
    const accessibleText =
      (record.item.label || '汽车') +
      ' · ' +
      record.wheel.label +
      ' · ' +
      (reading.available ? (reading.text + ' ' + reading.unit).trim() : '胎压不可用')
    return (
      (record.label.title = accessibleText),
      record.label.setAttribute('aria-label', accessibleText),
      (record.metrics = null),
      true
    )
  }

  return {
    get pending() {
      return isPending || [...records.values()].some((pendingRecord) => !pendingRecord.bounds)
    },
    sync({
      root,
      revision,
      bindings = [],
      states = {},
      formats = {},
    }: {
      root: any
      revision: any
      bindings?: any[]
      states?: any
      formats?: any
    }) {
      if (isDisposed) return false
      const hasRootOrRevisionChange = rootNode !== root || sceneRevision !== revision
      let hasChange = hasRootOrRevisionChange
      ;(rootNode = root), (sceneRevision = revision)
      const wantedKeySet = new Set<string>()
      for (const tireBinding of bindings) {
        if (!carTireEntities(tireBinding, tireBinding.modelType).length) continue
        for (const wheelEntry of carTireWheels(tireBinding.modelType) ?? []) {
          const wheelEntityId = tireBinding.tirePressure.wheels?.[wheelEntry.key]
          if (!wheelEntityId) continue
          const tireKey = recordKey(tireBinding) + ':' + wheelEntry.key
          wantedKeySet.add(tireKey)
          let tireRecord = records.get(tireKey)
          if (!tireRecord) {
            const labelElement = document.createElement('span')
            ;(labelElement.className = 'i3d-car-tire i3d-temperature-humidity-card'),
              labelElement.setAttribute('role', 'img'),
              (labelElement.dataset.wheel = wheelEntry.key),
              (labelElement.dataset.bindingId = tireBinding.id)
            const leaderLine = document.createElementNS(lineCanvas.namespaceURI, 'line')
            lineCanvas.append(leaderLine),
              rootElement.append(labelElement),
              (tireRecord = { label: labelElement, line: leaderLine, wheel: wheelEntry } as CarTireRecord),
              records.set(tireKey, tireRecord),
              (isPending = true)
          }
          ;(tireRecord.item = tireBinding),
            (tireRecord.entityId = wheelEntityId),
            (hasChange = updateRecordText(tireRecord, states, formats) || hasChange)
        }
      }
      for (const [existingKey, existingRecord] of records)
        !wantedKeySet.has(existingKey) &&
          (removeRecord(existingRecord), records.delete(existingKey), (hasChange = true))
      ;(hasRootOrRevisionChange || isPending) && resolveModels()
      rootElement.hidden = records.size === 0
      if (rootElement.hidden) rootElement.remove()
      else if (rootElement.parentElement !== container) container.append(rootElement)
      return hasChange
    },
    project({ width, height, camera }: { width: number; height: number; camera: any }) {
      if (isDisposed || rootElement.hidden || !width || !height) return
      isPending && resolveModels()
      const layoutEntries: any[] = [],
        placedEntries: any[] = []
      lineCanvas.setAttribute('viewBox', '0 0 ' + width + ' ' + height)
      for (const layoutRecord of records.values()) {
        let isVisible = !!layoutRecord.model && ensureBounds(layoutRecord)
        for (let parentNode = layoutRecord.model; parentNode; parentNode = parentNode.parent)
          parentNode.visible === false && (isVisible = false)
        const layoutCamera = typeof camera === 'function' ? camera(layoutRecord.model) : camera
        layoutCamera || (isVisible = false)
        let anchorNdc: any, outsideNdc: any
        if (isVisible) {
          layoutCamera.updateMatrixWorld(),
            (anchorNdc = layoutRecord.model.localToWorld(layoutRecord.anchor.clone()).project(layoutCamera)),
            (outsideNdc = layoutRecord.model.localToWorld(layoutRecord.outside.clone()).project(layoutCamera)),
            (isVisible =
              anchorNdc.z >= -1 && anchorNdc.z <= 1 && Math.abs(anchorNdc.x) <= 1.05 && Math.abs(anchorNdc.y) <= 1.05)
        }
        ;(layoutRecord.label.hidden = !isVisible), (layoutRecord.line.style.display = isVisible ? '' : 'none')
        if (!isVisible) continue
        const anchorX = ((anchorNdc.x + 1) * width) / 2,
          anchorY = ((1 - anchorNdc.y) * height) / 2,
          outsideX = ((outsideNdc.x + 1) * width) / 2,
          outsideY = ((1 - outsideNdc.y) * height) / 2,
          deltaX = outsideX - anchorX,
          deltaY = outsideY - anchorY,
          deltaLength = Math.hypot(deltaX, deltaY) || 1
        layoutRecord.viewportWidth !== width &&
          ((layoutRecord.label.style.maxWidth = Math.max(1, width - 10) + 'px'),
          (layoutRecord.viewportWidth = width),
          (layoutRecord.metrics = null))
        layoutRecord.metrics ||= {
          w: layoutRecord.label.offsetWidth,
          h: layoutRecord.label.offsetHeight,
        }
        layoutEntries.push({
          record: layoutRecord,
          px: anchorX,
          py: anchorY,
          x: outsideX + (deltaX / deltaLength) * 12,
          y: outsideY + (deltaY / deltaLength) * 12,
          ...layoutRecord.metrics,
        })
      }
      layoutEntries.sort(
        (firstEntry: any, secondEntry: any) => firstEntry.y - secondEntry.y || firstEntry.x - secondEntry.x,
      )
      for (const layoutEntry of layoutEntries) {
        const { record: placedRecord, w: layoutWidth, h: layoutHeight } = layoutEntry
        ;(layoutEntry.x = Math.max(layoutWidth / 2 + 5, Math.min(width - layoutWidth / 2 - 5, layoutEntry.x))),
          (layoutEntry.y = Math.max(layoutHeight / 2 + 5, Math.min(height - layoutHeight / 2 - 5, layoutEntry.y)))
        /** 重叠下推：同列（x 相交）且 y 相交时，推到对方下沿。 */
        for (let pushCount = 0; pushCount <= placedEntries.length; pushCount++) {
          const overlappingEntry = placedEntries.find(
            (otherEntry: any) =>
              Math.abs(layoutEntry.x - otherEntry.x) < (layoutWidth + otherEntry.w) / 2 + 3 &&
              Math.abs(layoutEntry.y - otherEntry.y) < (layoutHeight + otherEntry.h) / 2 + 3,
          )
          if (!overlappingEntry) break
          layoutEntry.y = overlappingEntry.y + (overlappingEntry.h + layoutHeight) / 2 + 4
        }
        ;(layoutEntry.y = Math.min(height - layoutHeight / 2 - 5, layoutEntry.y)),
          placedEntries.push(layoutEntry),
          (placedRecord.label.style.transform =
            'translate3d(' + layoutEntry.x + 'px,' + layoutEntry.y + 'px,0) translate(-50%,-50%)')
        for (const [attributeName, attributeValue] of Object.entries({
          x1: layoutEntry.px,
          y1: layoutEntry.py,
          x2: layoutEntry.x,
          y2: layoutEntry.y,
        }))
          placedRecord.line.setAttribute(attributeName, String(attributeValue))
      }
    },
    dispose() {
      isDisposed || ((isDisposed = true), clearRecords(), rootElement.remove(), (rootNode = null))
    },
  }
}
