import { lockState } from '../security/security'

/**
 * 窗扇开合动画（0.8.4 `window-motion.js`）。
 *
 * 与门锁动画同构，但作用对象是 `addCustomWindow` 在枢轴/面板上留下的
 * `userData.windowMotion`：
 *
 * - 平开 / 上悬 / 下悬：`property:'rotation'`，`closed/open` 是铰链侧的角度区间；
 * - 推拉：`property:'position'` + `axis:'x'`，`closed/open` 是面板位移的两端；
 *   一组推拉窗的所有面板共用组模型的同一份行程。
 *
 * 开合量的来源：
 * - 窗磁（`security.windows`）：`lockState().doorOpen` 是布尔量，按 `openPercent` 换算；
 * - 开窗器（`environment.windowOpeners`）：`openingPosition` 是百分比，`poseMoving`
 *   表示设备正忙，动画期间要持续请求帧；
 * - 两者都没有绑定：回到 `rest`（几何侧摆好的默认开度）。
 */

/** 枢轴上的开合行程描述（`addCustomWindow` 写入）。 */
interface WindowMotionSpec {
  property: 'rotation' | 'position'
  axis: string
  closed: number
  open: number
  rest: number
  /** 初始开度（%）：新装的窗默认留一条缝时要按它起步，而不是按 rest 反推。 */
  defaultOpening?: number
}

interface WindowMotionState {
  bindingKey: string
  bindingId: any
  entityId: any
  current: number
  target: number
  /** 开窗器按「直接位置」驱动时的目标（与 `target` 同值，保留上游字段语义）。 */
  directPosition?: number
  /** 上一次消费到的原始状态与派生量，避免每帧重复算 lockState。 */
  open?: boolean | null
  raw?: any
  state?: any
  available?: any
}

interface WindowMotionBinding {
  id?: any
  floorId?: any
  modelId?: any
  doorEntityId?: any
  entityId?: any
  windowOpener?: boolean
  openingPosition?: unknown
  directPosition?: boolean
  poseMoving?: boolean
  duration?: number
  openPercent?: number
}

export interface WindowMotionOptions {
  modelRoot?: any
  environmentRevision?: any
  sceneRevision?: any
  setDynamicRenderObjects?: (kind: string, objects: any[]) => void
  invalidateReflections?: (reason?: any) => void
  requestDynamicRender?: (options?: { sceneEffects?: boolean }) => void
  requestRender?: () => void
}

const clampUnit = (value: number) => Math.max(0, Math.min(1, value))

const bindingKeyOf = (value: { floorId: any; modelId: any }) => JSON.stringify([value.floorId, value.modelId])

/** 设备上报「这个窗扇开到了哪一格」推导出的开合比例。 */
const ratioOf = (spec: WindowMotionSpec, poseValue: number) => {
  const span = spec.open - spec.closed
  return span ? clampUnit((poseValue - spec.closed) / span) : 0
}

const poseOf = (spec: WindowMotionSpec, ratio: number) => spec.closed + (spec.open - spec.closed) * ratio

export function createWindowMotion(options: WindowMotionOptions) {
  /** 枢轴 → 上一帧的动效状态；用对象身份判断「状态被重建过」。 */
  const trackedByPivot = new Map<any, { saved: WindowMotionState }>()
  /** 绑定键 → 动效状态（同一扇被窗磁与开窗器同时引用时共用一份）。 */
  const stateByBindingKey = new Map<string, WindowMotionState>()
  let modelRoot = options.modelRoot,
    pivotList: Array<{ pivot: any; id: string }> | null = null,
    pivotListRevision: any,
    sensorsByKey: Map<string, WindowMotionBinding> | null = null,
    lastBindings: WindowMotionBinding[] | null | undefined,
    lastTickTime: any = null,
    lastScope: any,
    reportedPivotSet = new Set<any>()

  const readPose = (pivot: any) => {
    const spec: WindowMotionSpec = pivot.userData.windowMotion
    return pivot[spec.property][spec.axis]
  }
  const writePose = (pivot: any, value: number) => {
    const spec: WindowMotionSpec = pivot.userData.windowMotion
    pivot[spec.property][spec.axis] = value
  }
  const bumpOutlineRevision = (outlineObject: any) => {
    outlineObject?.userData &&
      (outlineObject.userData.environmentOutlineRevision = (outlineObject.userData.environmentOutlineRevision || 0) + 1)
  }
  const pivotKeyOf = (pivot: any) =>
    bindingKeyOf({
      floorId: pivot.userData.environmentFloorId,
      modelId: pivot.userData.environmentModelId,
    })
  const isUnderModelRoot = (node: any) => {
    for (let walkNode = node; walkNode; walkNode = walkNode.parent) if (walkNode === modelRoot) return true
    return false
  }

  /**
   * 只有内容变了才重发动态渲染对象清单：舞台的反射/光照缓存按这份集合决定
   * 每帧是否重算，每帧发新数组会让缓存永远判脏。
   */
  function syncDynamicRenderObjects() {
    ;(reportedPivotSet.size === trackedByPivot.size &&
      [...trackedByPivot.keys()].every((pivot) => reportedPivotSet.has(pivot))) ||
      ((reportedPivotSet = new Set(trackedByPivot.keys())),
      options.setDynamicRenderObjects?.('window', [...reportedPivotSet]))
  }
  function requestRedraw() {
    options.invalidateReflections?.(),
      options.requestDynamicRender ? options.requestDynamicRender({ sceneEffects: true }) : options.requestRender?.()
  }
  function reset(clearTracking = true) {
    let hasChanged = false
    for (const pivot of trackedByPivot.keys()) {
      const restPose = pivot.userData.windowMotion.rest
      readPose(pivot) !== restPose && (writePose(pivot, restPose), bumpOutlineRevision(pivot), (hasChanged = true)),
        delete pivot.userData.environmentOutlineMoving
    }
    trackedByPivot.clear(),
      (pivotList = null),
      (lastBindings = undefined),
      (sensorsByKey = null),
      (lastTickTime = null),
      syncDynamicRenderObjects(),
      clearTracking && (stateByBindingKey.clear(), (pivotListRevision = undefined)),
      hasChanged && requestRedraw()
  }

  function advance(
    time: any,
    bindings: WindowMotionBinding[] | null | undefined,
    states: any,
    forceSync: boolean,
    animateInitial: boolean,
    scope: any,
  ) {
    if (scope !== lastScope) reset(), (lastScope = scope)
    if (modelRoot !== options.modelRoot) reset(false), (modelRoot = options.modelRoot)

    if (forceSync || lastBindings !== bindings) {
      lastBindings = bindings
      sensorsByKey = new Map(
        (bindings || [])
          .filter((binding) => binding.doorEntityId)
          .map((binding) => [bindingKeyOf({ floorId: binding.floorId, modelId: binding.modelId }), binding]),
      )
      // 绑定 id / 实体换了：旧动效状态不能再复用到新设备上，否则会带着旧目标值滑一下。
      for (const [trackedKey, trackedState] of stateByBindingKey) {
        const currentBinding = sensorsByKey.get(trackedState.bindingKey)
        ;(!currentBinding ||
          trackedState.bindingId !== currentBinding.id ||
          trackedState.entityId !== currentBinding.doorEntityId) &&
          stateByBindingKey.delete(trackedKey)
      }
    }

    const environmentRevision = options.environmentRevision ?? options.sceneRevision
    ;(!pivotList || forceSync || pivotListRevision !== environmentRevision) &&
      ((pivotListRevision = environmentRevision),
      (pivotList = []),
      modelRoot?.traverse((pivot: any) => {
        pivot.userData?.windowMotion &&
          pivot.userData.environmentModelId &&
          pivotList!.push({ pivot, id: pivotKeyOf(pivot) })
      }))

    const deltaSeconds =
      forceSync || lastTickTime === null ? 0 : Math.min(0.1, Math.max(0, (time - lastTickTime) / 1000))
    lastTickTime = time

    const seenPivotSet = new Set<any>(),
      refreshedBindingSet = new Set<string>()
    let hasMotion = false,
      shouldRedraw = false

    for (const { pivot, id } of pivotList) {
      if (!isUnderModelRoot(pivot)) continue
      const binding = sensorsByKey!.get(id),
        baseMotion: WindowMotionSpec = pivot.userData.windowMotion,
        motion = baseMotion

      if (!binding) {
        readPose(pivot) !== motion.rest &&
          (writePose(pivot, motion.rest), bumpOutlineRevision(pivot), (shouldRedraw = true)),
          delete pivot.userData.environmentOutlineMoving
        continue
      }
      seenPivotSet.add(pivot)

      // 一组推拉窗的所有面板共用一个组模型 id，因此动效状态天然按组聚合。
      let motionState = stateByBindingKey.get(id)
      if (!motionState) {
        const initialRatio =
          motion.defaultOpening !== undefined ? motion.defaultOpening / 100 : ratioOf(motion, motion.rest)
        motionState = {
          bindingKey: id,
          bindingId: binding.id,
          entityId: binding.doorEntityId,
          current: initialRatio,
          target: initialRatio,
        }
        stateByBindingKey.set(id, motionState)
      }

      const rawState = states instanceof Map ? states.get(binding.doorEntityId) : states?.[binding.doorEntityId],
        stateData = rawState?.newState || rawState,
        cachedState = trackedByPivot.get(pivot)

      if (!refreshedBindingSet.has(id)) {
        refreshedBindingSet.add(id)
        ;(forceSync ||
          !Object.hasOwn(motionState, 'open') ||
          motionState.raw !== stateData ||
          motionState.state !== stateData?.state ||
          motionState.available !== stateData?.available) &&
          ((motionState.open = lockState(binding, states).doorOpen),
          (motionState.raw = stateData),
          (motionState.state = stateData?.state),
          (motionState.available = stateData?.available))
        const nextTarget = binding.windowOpener
          ? Number.isFinite(binding.openingPosition)
            ? (binding.openingPosition as number) / 100
            : null
          : motionState.open === null
            ? null
            : motionState.open
              ? (binding.openPercent ?? 100) / 100
              : 0
        nextTarget !== null && (motionState.target = nextTarget),
          binding.windowOpener &&
            binding.directPosition &&
            nextTarget !== null &&
            (motionState.directPosition = nextTarget),
          // 状态刚被重建（首次挂载 / 绑定换了）且调用方没要求补间：直接贴到目标位。
          (!cachedState || cachedState.saved !== motionState) &&
            nextTarget !== null &&
            !animateInitial &&
            (motionState.current = nextTarget)
      }

      const distance = motionState.target - motionState.current
      Math.abs(distance) > 0.00001 &&
        ((motionState.current +=
          Math.sign(distance) * Math.min(Math.abs(distance), deltaSeconds / Math.max(0.2, binding.duration ?? 0.7))),
        (hasMotion = true)),
        (hasMotion ||= binding.windowOpener === true && binding.poseMoving === true)

      ;(!cachedState || cachedState.saved !== motionState) && trackedByPivot.set(pivot, { saved: motionState })

      const nextPose = poseOf(motion, motionState.current)
      readPose(pivot) !== nextPose && (writePose(pivot, nextPose), bumpOutlineRevision(pivot), (shouldRedraw = true)),
        // 位置还没追上目标：轮廓光晕要跟着描边，停下后才撤掉。
        (pivot.userData.environmentOutlineMoving = Math.abs(poseOf(motion, motionState.target) - nextPose) > 0.00001)
    }

    for (const [departingPivot, departingTracked] of trackedByPivot) {
      if (seenPivotSet.has(departingPivot)) continue
      sensorsByKey!.has(departingTracked.saved.bindingKey) ||
        (writePose(departingPivot, departingPivot.userData.windowMotion.rest),
        bumpOutlineRevision(departingPivot),
        (shouldRedraw = true))
      delete departingPivot.userData.environmentOutlineMoving, trackedByPivot.delete(departingPivot)
    }

    return (syncDynamicRenderObjects(), shouldRedraw && requestRedraw(), hasMotion)
  }

  return {
    tick(
      time: any,
      bindings: WindowMotionBinding[] | null | undefined,
      states: any,
      tickOptions: { animateInitial?: boolean; scope?: any } = {},
    ) {
      return advance(time, bindings, states, false, tickOptions.animateInitial === true, tickOptions.scope)
    },
    sync(
      bindings: WindowMotionBinding[] | null | undefined,
      states: any,
      syncOptions: { animateInitial?: boolean; scope?: any } = {},
    ) {
      return advance(null, bindings, states, true, syncOptions.animateInitial === true, syncOptions.scope)
    },
    dispose() {
      reset()
    },
  }
}

/**
 * 开窗器 / 窗磁的「这扇窗现在开到哪」解析（0.8.4 `window-opener.js`）。
 *
 * 同一扇窗可能有两种传感器，语义完全不同：
 * - **窗磁**（`security.windows`）：只有 open / closed，开度全场统一（`openPercent`）；
 * - **开窗器**（`environment.windowOpeners`）：具备 `current_position`，能报 0–100%。
 *
 * `motionSource` 允许把某扇窗钉死在某一路（`contact` / `opener`），
 * `auto`（默认）按「有没有位置能力 + 有没有窗磁」自动选：
 * 能报位置就信开窗器，否则只要有窗磁就信窗磁。
 *
 * 两路都在且对不上时（开窗器说开着、窗磁说关着），先记 2 秒再报冲突，
 * 避免设备刚上电的瞬时错位也弹「状态不一致」。
 */

export interface WindowBindingLike {
  id?: any
  entityId?: any
  floorId?: any
  modelId?: any
  motionSource?: string
  openPercent?: number
}

export interface WindowContactLike {
  id?: any
  floorId?: any
  modelId?: any
  doorEntityId?: any
  openPercent?: number
  duration?: number
}

export interface WindowCoverStateLike {
  position?: number | null
  positionReported?: boolean
  positionSupported?: boolean
  available?: boolean
  state?: string
  moving?: boolean
  raw?: any
}

export interface WindowPreviewStateLike {
  position?: number | null
  moving?: boolean
  preview?: boolean
}

export interface WindowOpenerResolution {
  position: number | null
  direct: boolean
  moving: boolean
  source: 'contact' | 'opener'
  contactOpen: boolean | null
  conflict: boolean
  notice: string
}

const CONFLICT_GRACE_MS = 2000

/**
 * 找出与某扇窗同层、且绑定到同一扇的窗磁。
 * 推拉组只有组模型一个绑定身份，所以这里按组 id 匹配。
 */
export function windowContacts(
  model: WindowBindingLike | null | undefined,
  sensors: WindowContactLike[] | null | undefined,
  windowModel: WindowBindingLike | null | undefined,
): WindowContactLike[] {
  if (!model) return []
  const modelIds = new Set<string>([
    String(model.modelId ?? model.id ?? ''),
    String(windowModel?.modelId ?? windowModel?.id ?? ''),
  ])
  return (sensors || []).filter(
    (sensor) => sensor.floorId === model.floorId && modelIds.has(String(sensor.modelId || '')) && sensor.doorEntityId,
  )
}

export function createWindowOpenerResolver({ now = () => performance.now() }: { now?: () => number } = {}) {
  const stateByBindingId = new Map<any, { identity: string; numeric: boolean; mismatch: number | null }>()
  let lastOwner: any,
    nextDelayMs = Infinity

  function begin(owner: any, bindingIds: any[]) {
    lastOwner !== owner && (stateByBindingId.clear(), (lastOwner = owner))
    const retainedBindingIdSet = new Set(bindingIds)
    for (const trackedBindingId of stateByBindingId.keys())
      retainedBindingIdSet.has(trackedBindingId) || stateByBindingId.delete(trackedBindingId)
    nextDelayMs = Infinity
  }

  function resolve(
    opener: WindowBindingLike,
    contacts: WindowContactLike[],
    states: Record<string, any>,
    coverState: WindowCoverStateLike,
    previewState: WindowPreviewStateLike,
  ): WindowOpenerResolution {
    // 身份里带上窗磁名单：用户改了窗磁绑定，缓存的位置能力与冲突计时都要作废。
    const identity = JSON.stringify([
      opener.entityId,
      opener.floorId,
      opener.modelId,
      opener.motionSource,
      contacts.map((contact) => [contact.id, contact.doorEntityId]),
    ])
    let openerState = stateByBindingId.get(opener.id)
    ;(!openerState || openerState.identity !== identity) &&
      ((openerState = { identity: identity, numeric: false, mismatch: null }),
      stateByBindingId.set(opener.id, openerState))
    // 设备能报位置的能力位可能晚一拍才到：见过一次就记一辈子，别每帧重判。
    openerState.numeric ||=
      coverState.positionReported || coverState.positionSupported || !!coverState.raw?.coverMemory?.position

    const contactOpenValues = contacts.map((contact) => lockState(contact, states).doorOpen),
      contactOpen = contactOpenValues.some((open) => open === true)
        ? true
        : contactOpenValues.length && contactOpenValues.every((open) => open === false)
          ? false
          : null,
      source: 'contact' | 'opener' =
        opener.motionSource && opener.motionSource !== 'auto'
          ? (opener.motionSource as 'contact' | 'opener')
          : openerState.numeric || !contacts.length
            ? 'opener'
            : 'contact'
    let position: number | null = null,
      direct = false,
      moving = false
    if (source === 'contact') {
      position = contactOpen === null ? null : contactOpen ? (opener.openPercent ?? contacts[0]?.openPercent ?? 100) : 0
    } else {
      const reportedPosition = coverState.position,
        previewPosition = previewState.position ?? reportedPosition,
        effectivePosition = previewPosition ?? reportedPosition
      effectivePosition != null
        ? ((position = (effectivePosition * (opener.openPercent ?? 100)) / 100),
          (direct = true),
          (moving = !!previewState.moving))
        : coverState.positionReported && coverState.state === 'open' && (position = opener.openPercent ?? 100)
    }
    const reportedOpen =
        coverState.available && coverState.position !== null
          ? (coverState.position as number) > 0
          : coverState.positionReported && coverState.state === 'open'
            ? true
            : coverState.positionReported && coverState.state === 'closed'
              ? false
              : null,
      isMismatch =
        contactOpen !== null &&
        reportedOpen !== null &&
        contactOpen !== reportedOpen &&
        !coverState.moving &&
        !previewState.moving &&
        !previewState.preview
    isMismatch ? (openerState.mismatch ??= now()) : (openerState.mismatch = null)
    const conflict = isMismatch && now() - (openerState.mismatch as number) >= CONFLICT_GRACE_MS
    isMismatch &&
      !conflict &&
      (nextDelayMs = Math.min(nextDelayMs, (openerState.mismatch as number) + CONFLICT_GRACE_MS))
    return {
      position: position,
      direct: direct,
      moving: moving,
      source: source,
      contactOpen: contactOpen,
      conflict: conflict,
      notice: conflict ? '开窗器与窗磁状态不一致，请核对窗户或设备回报。' : '',
    }
  }

  return {
    begin: begin,
    resolve: resolve,
    nextDelay: () => Math.max(0, nextDelayMs - now()),
    clear() {
      stateByBindingId.clear()
      nextDelayMs = Infinity
    },
  }
}
