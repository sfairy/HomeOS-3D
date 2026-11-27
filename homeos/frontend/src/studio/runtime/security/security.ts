import { domElement } from '@app/shared/util/dom-factory'
import { createPopupFeedback } from '@app/shared/util/popup-feedback'
import { createStageDeviceVisual } from '../core/stage-device-visual'
import { GAS_ENUM_STATES, SMOKE_ENUM_STATES, SMOKE_EVENT_TYPE, securityAlarmEntityMode } from '@/studio/platform/security-alarm-profile'
import { isWarmSceneStyle } from '@app/shared/scene-styles'
import { openConfigurationPicker, type ConfigurationChoice } from '../config-ui/configuration-picker'
import { lockState } from '@app/bridge/lock-state-runtime'


/** 铰链枢轴的最小结构：本文件只碰 `rotation.y` / `position.x` / `scale.x`。 */
interface HingePivotLike {
  rotation: { y: number }
  position?: { x: number }
  scale?: { x: number }
}

/** 铰链原始姿态快照：首次登记门扇时从枢轴自身取，之后一直沿用。 */
interface HingePoseSnapshot {
  hingeX?: number
  hingeScaleX?: number
}

/** 门模型里与铰链方向有关的字段（其余配置项本文件不读）。 */
interface DoorHingeConfig {
  hinge?: string
  openAngle?: number
  openDirection?: number
}

export function createLockMotion(options: any) {
  const motionByMesh = new Map(),
    outlineFlaggedMeshSet = new Set<{ userData: Record<string, any> }>(),
    bumpOutlineRevision = (outlineObject: any) => {
      outlineObject?.userData &&
        (outlineObject.userData.environmentOutlineRevision =
          (outlineObject.userData.environmentOutlineRevision || 0) + 1)
    },
    stashedMotionByMesh = new WeakMap()
  let modelRoot = options.modelRoot,
    lastTickTime: any = null,
    meshListRevision: any,
    doorMeshList: any = null
  const isUnderModelRoot = (node: any) => {
    for (let walkNode = node; walkNode; walkNode = walkNode.parent) if (walkNode === modelRoot) return true
    return false
  }
  function applyRollerTranslation(rollerMesh: any, translationValue: any) {
    rollerMesh.position.y = translationValue
    const openTranslation = Number(
      rollerMesh.userData?.doorRollerOpenTranslation ?? rollerMesh.parent?.userData?.doorRollerOpenTranslation,
    )
    rollerMesh.scale &&
      openTranslation > 0 &&
      (rollerMesh.scale.y = Math.max(0.001, 1 - translationValue / openTranslation))
  }
  /** 关门位：铰链枢轴除了转角，还要把镜像/位置还原成几何侧摆好的原始值。 */
  function restoreHingePose(hingeMesh: HingePivotLike, hingeMotion: { rest: number } & HingePoseSnapshot) {
    hingeMesh.rotation.y = hingeMotion.rest
    const { hingeX, hingeScaleX } = hingeMotion
    typeof hingeX === 'number' && Number.isFinite(hingeX) && hingeMesh.position && (hingeMesh.position.x = hingeX)
    hingeMesh.scale &&
      typeof hingeScaleX === 'number' &&
      Number.isFinite(hingeScaleX) &&
      (hingeMesh.scale.x = hingeScaleX)
  }
  function reset() {
    for (const [mesh, motion] of motionByMesh)
      motion.kind === 'slide'
        ? (mesh.position.x = motion.rest)
        : motion.kind === 'roller'
          ? applyRollerTranslation(mesh, motion.rest)
          : restoreHingePose(mesh, motion),
        bumpOutlineRevision(mesh.parent)
    for (const flaggedMesh of outlineFlaggedMeshSet) delete flaggedMesh.userData.environmentOutlineMoving
    outlineFlaggedMeshSet.clear(), motionByMesh.clear(), (lastTickTime = null), (doorMeshList = null)
  }
  function findDoorModel(parentObject: any, candidateDoorModels: any) {
    return candidateDoorModels.find(
      (model: any) =>
        model.modelId === parentObject?.userData?.environmentModelId &&
        model.floorId === parentObject?.userData?.environmentFloorId,
    )
  }
  /**
   * 门模型配置的铰链侧；模型没写 left/right 时才用枢轴自身的 +x / -x 反推。
   * （0.8.1 `resolveHinge`，镜像判断也走它。）
   */
  function resolveHingeSide(doorModel: DoorHingeConfig | null | undefined, hingeX: number | undefined) {
    return doorModel?.hinge === 'left' || doorModel?.hinge === 'right'
      ? doorModel.hinge
      : Number(hingeX) > 0
        ? 'right'
        : 'left'
  }
  function resolveTarget(
    doorModel: DoorHingeConfig,
    parent: any,
    meshObject: any,
    entityStates: any,
    hingeMotion: HingePoseSnapshot | undefined,
  ) {
    const animationType = parent.userData?.doorAnimationType || 'entry'
    if (animationType === 'static') return null

    const doorOpenRatio = lockState(doorModel, entityStates).doorOpenRatio
    if (doorOpenRatio === null) return null
    const interpolate = (closedValue: any, openValue: any) => closedValue + (openValue - closedValue) * doorOpenRatio
    if (animationType === 'sliding') {
      if (Number.isFinite(meshObject.userData?.doorSlideSide)) {
        const direction = doorModel.openDirection === -1 ? -1 : 1
        return {
          kind: 'slide',
          value:
            meshObject.userData.doorSlideSide === -direction
              ? direction * meshObject.userData.doorSlideTravel * doorOpenRatio
              : 0,
        }
      }
      const slideOpenTranslation = Number(parent.userData?.doorSlideOpenTranslation),
        slideClosedTranslation = Number(parent.userData?.doorSlideClosedTranslation ?? 0)
      return Number.isFinite(slideOpenTranslation)
        ? {
            kind: 'slide',
            value: interpolate(slideClosedTranslation, slideOpenTranslation * (doorModel.openDirection ?? 1)),
          }
        : null
    }
    if (animationType === 'roller') {
      const rollerOpenTranslation = Number(
          parent.userData?.doorRollerOpenTranslation ?? meshObject.userData?.doorRollerOpenTranslation,
        ),
        rollerClosedTranslation = Number(parent.userData?.doorRollerClosedTranslation ?? 0)
      return Number.isFinite(rollerOpenTranslation)
        ? {
            kind: 'roller',
            value: interpolate(rollerClosedTranslation, rollerOpenTranslation),
          }
        : null
    }
    const doorOpenRotation = Number(meshObject.userData?.doorOpenRotation ?? parent.userData?.doorOpenRotation)
    // 固定铰链（子母门的母门、双开门扇）的铰链侧以枢轴自身位置为准，
    // 不再被 doorGroup 上的统一配置带偏。
    const closedRotation = Number(parent.userData?.doorClosedRotation ?? 0),
      interiorSide = Number(parent.userData?.doorInteriorSide)
    /**
     * 0.8.1 的开向规则：门朝「屋里那一侧」开 ——
     * `转角 = |openAngle| × (铰链在右 ? +1 : -1) × 室内侧 × 开门方向`。
     *
     * 只按 `swing`（内外翻转美术开关）或只按铰链侧都不够：同一面墙正反画，
     * `swing` 不变但屋里换到另一侧，门必须跟着换向，否则就朝室外/墙里开。
     */
    if (interiorSide === 1 || interiorSide === -1) {
      const openAngle = Number(doorModel.openAngle),
        angleRadians = Number.isFinite(openAngle)
          ? (Math.abs(openAngle) * Math.PI) / 180
          : Number.isFinite(doorOpenRotation)
            ? Math.abs(doorOpenRotation)
            : (80 * Math.PI) / 180,
        hingeRight =
          meshObject.userData?.doorFixedHinge === true
            ? Number(hingeMotion?.hingeX) > 0
            : resolveHingeSide(doorModel, hingeMotion?.hingeX) === 'right'
      return {
        kind: 'hinge',
        value: interpolate(
          closedRotation,
          angleRadians * (hingeRight ? 1 : -1) * interiorSide * (doorModel.openDirection ?? 1),
        ),
      }
    }
    if (Number.isFinite(doorOpenRotation)) {
      // 拿不到楼层多边形时的回退：沿用几何侧记下的转向符号。
      const openAngle = Number(doorModel.openAngle),
        angleRadians = Number.isFinite(openAngle) ? (Math.abs(openAngle) * Math.PI) / 180 : Math.abs(doorOpenRotation),
        /**
         * 0.8.1 的错位校正：模型显式写了铰链侧、但枢轴实际摆在另一侧时，
         * 几何侧记下的符号是「按枢轴」写的，得整体翻一次才能对齐模型。
         * 固定铰链的门扇（双开门、子母门母门）位置由几何侧决定，不做校正。
         */
        hingeMismatch =
          meshObject.userData?.doorFixedHinge !== true &&
          (resolveHingeSide(doorModel, hingeMotion?.hingeX) === 'right') !== Number(hingeMotion?.hingeX) > 0
      return {
        kind: 'hinge',
        value: interpolate(
          closedRotation,
          Math.sign(doorOpenRotation) * angleRadians * (doorModel.openDirection ?? 1) * (hingeMismatch ? -1 : 1),
        ),
      }
    }
    const fallbackAngle = ((doorModel.openAngle ?? 80) * Math.PI) / 180,
      fallbackHingeSign = resolveHingeSide(doorModel, hingeMotion?.hingeX) === 'right' ? 1 : -1
    return {
      kind: 'hinge',
      value: interpolate(closedRotation, fallbackAngle * (doorModel.openDirection ?? 1) * fallbackHingeSign),
    }
  }
  function tick(time: any, doorModels: any, states: any, forceSync = false) {
    if (
      (modelRoot !== options.modelRoot && (reset(), (modelRoot = options.modelRoot)), !doorModels?.length && !forceSync)
    ) {
      const hasAnyMotion = motionByMesh.size > 0
      return (reset(), hasAnyMotion && (options.invalidateReflections?.(), options.requestRender?.()), false)
    }
    const environmentRevision = options.environmentRevision ?? options.sceneRevision
    ;(!doorMeshList || forceSync || meshListRevision !== environmentRevision) &&
      ((meshListRevision = environmentRevision),
      (doorMeshList = []),
      modelRoot?.traverse((traversedMesh: any) => {
        ;(traversedMesh.userData?.doorHingePivot ||
          traversedMesh.userData?.entryDoorPivot ||
          traversedMesh.userData?.doorSlidePivot ||
          traversedMesh.userData?.doorRollerPivot) &&
          doorMeshList.push(traversedMesh)
      }))
    const deltaSeconds =
      forceSync || lastTickTime === null ? 0 : Math.min(0.1, Math.max(0, (time - lastTickTime) / 1000))
    lastTickTime = time
    const seenMeshSet = new Set(),
      parentHasMotionByMesh = new Map()
    let hasMotion = false,
      shouldRedraw = false
    ;(doorMeshList = doorMeshList.filter(isUnderModelRoot)),
      doorMeshList.forEach((doorMesh: any) => {
        const hingePivot = doorMesh.userData?.doorHingePivot || doorMesh.userData?.entryDoorPivot,
          slidePivot = doorMesh.userData?.doorSlidePivot,
          rollerPivot = doorMesh.userData?.doorRollerPivot
        if (!hingePivot && !slidePivot && !rollerPivot) return
        const doorParent = doorMesh.parent,
          matchedDoorModel = findDoorModel(doorParent, doorModels || []),
          stashedMotion = stashedMotionByMesh.get(doorMesh)
        if ((stashedMotion && stashedMotionByMesh.delete(doorMesh), !doorParent || !matchedDoorModel)) {
          stashedMotion &&
            (stashedMotion.kind === 'slide'
              ? (doorMesh.position.x = stashedMotion.rest)
              : stashedMotion.kind === 'roller'
                ? applyRollerTranslation(doorMesh, stashedMotion.rest)
                : restoreHingePose(doorMesh, stashedMotion),
            (shouldRedraw = true),
            bumpOutlineRevision(doorParent))
          return
        }
        seenMeshSet.add(doorMesh)
        // 铰链的原始位置/镜像在首次登记时从枢轴自身取，之后一直沿用这份快照，
        // 避免被动画过程中改动过的 position/scale 反向污染。
        const hingeMotion = motionByMesh.get(doorMesh) ||
            stashedMotion || { hingeX: doorMesh.position?.x, hingeScaleX: doorMesh.scale?.x },
          poseBefore = [doorMesh.position?.x, doorMesh.position?.y, doorMesh.rotation?.y, doorMesh.scale?.y],
          target = resolveTarget(matchedDoorModel, doorParent, doorMesh, states, hingeMotion),
          kind = slidePivot ? 'slide' : rollerPivot ? 'roller' : 'hinge'
        let trackedMotion = motionByMesh.get(doorMesh)
        if (!trackedMotion || trackedMotion.kind !== kind) {
          ;(trackedMotion = {
            kind: kind,
            hingeX: hingeMotion.hingeX,
            hingeScaleX: hingeMotion.hingeScaleX,
            rest:
              stashedMotion?.rest ??
              (kind === 'slide'
                ? Number(doorMesh.userData?.doorRestTranslation ?? doorMesh.position.x) || 0
                : kind === 'roller'
                  ? Number(doorMesh.userData?.doorRestTranslation ?? doorMesh.position.y) || 0
                  : Number(doorMesh.userData?.doorRestRotation ?? doorMesh.rotation.y) || 0),
            target:
              target?.value ??
              (kind === 'slide' ? doorMesh.position.x : kind === 'roller' ? doorMesh.position.y : doorMesh.rotation.y),
          }),
            motionByMesh.set(doorMesh, trackedMotion)
          target &&
            (kind === 'slide'
              ? (doorMesh.position.x = target.value)
              : kind === 'roller'
                ? applyRollerTranslation(doorMesh, target.value)
                : (doorMesh.rotation.y = target.value),
            (shouldRedraw = true))
        }
        if (
          hingePivot &&
          // 固定铰链的门扇（子母门母门、双开门扇）位置和镜像已由几何侧摆好，
          // 运行时再挪一次会把门扇翻到铰链另一侧，表现就是「绕错边、朝反方向开」。
          doorMesh.userData?.doorFixedHinge !== true
        ) {
          // 铰链位置/镜像以枢轴首次登记的值为准（`hingeMotion`），
          // 只有拿不到时才回退到按门扇宽推算。
          const hingeRight = resolveHingeSide(matchedDoorModel, hingeMotion?.hingeX) === 'right',
            leafWidth = Number(doorParent.userData?.doorLeafWidth ?? doorParent.userData?.entryDoorLeafWidth ?? 0.8),
            hingeX = Number(hingeMotion?.hingeX),
            hingeScaleX = Number(hingeMotion?.hingeScaleX)
          doorMesh.position.x =
            (hingeRight ? 1 : -1) *
            (Number.isFinite(hingeX) && hingeX !== 0 ? Math.abs(hingeX) : Math.abs(leafWidth) / 2)
          doorMesh.scale &&
            Number.isFinite(hingeScaleX) &&
            hingeScaleX !== 0 &&
            (doorMesh.scale.x = hingeScaleX * (hingeRight === hingeX > 0 ? 1 : -1))
        }
        target && (trackedMotion.target = target.value)
        const current =
            kind === 'slide' ? doorMesh.position.x : kind === 'roller' ? doorMesh.position.y : doorMesh.rotation.y,
          difference = trackedMotion.target - current,
          duration = Math.max(0.2, Number(matchedDoorModel.duration) || 0.7),
          maxStep =
            (Math.max(
              kind === 'slide'
                ? Math.abs(Number(doorParent.userData?.doorSlideOpenTranslation) || 0)
                : kind === 'roller'
                  ? Math.abs(
                      Number(
                        doorParent.userData?.doorRollerOpenTranslation ?? doorMesh.userData?.doorRollerOpenTranslation,
                      ) || 0,
                    )
                  : (Math.abs(Number(matchedDoorModel.openAngle) || 80) * Math.PI) / 180,
              0.01,
            ) *
              deltaSeconds) /
            duration
        if (Math.abs(difference) > 0.0001) {
          const next = current + Math.sign(difference) * Math.min(Math.abs(difference), maxStep)
          kind === 'slide'
            ? (doorMesh.position.x = next)
            : kind === 'roller'
              ? applyRollerTranslation(doorMesh, next)
              : (doorMesh.rotation.y = next),
            (hasMotion = true),
            (shouldRedraw = true)
        }
        const poseAfter = [doorMesh.position?.x, doorMesh.position?.y, doorMesh.rotation?.y, doorMesh.scale?.y]
        poseBefore.some((beforeValue, axisIndex) => beforeValue !== poseAfter[axisIndex]) &&
          bumpOutlineRevision(doorParent)
        const latestPosition =
          kind === 'slide' ? doorMesh.position.x : kind === 'roller' ? doorMesh.position.y : doorMesh.rotation.y
        parentHasMotionByMesh.set(
          doorParent,
          !!parentHasMotionByMesh.get(doorParent) || Math.abs(trackedMotion.target - latestPosition) > 0.0001,
        )
      })
    for (const [departingMesh, departingMotion] of motionByMesh)
      seenMeshSet.has(departingMesh) ||
        (findDoorModel(departingMesh.parent, doorModels || [])
          ? stashedMotionByMesh.set(departingMesh, {
              kind: departingMotion.kind,
              rest: departingMotion.rest,
              hingeX: departingMotion.hingeX,
              hingeScaleX: departingMotion.hingeScaleX,
            })
          : departingMotion.kind === 'slide'
            ? (departingMesh.position.x = departingMotion.rest)
            : departingMotion.kind === 'roller'
              ? applyRollerTranslation(departingMesh, departingMotion.rest)
              : restoreHingePose(departingMesh, departingMotion),
        bumpOutlineRevision(departingMesh.parent),
        motionByMesh.delete(departingMesh),
        (shouldRedraw = true))
    for (const candidateOutlineMesh of new Set([...outlineFlaggedMeshSet, ...parentHasMotionByMesh.keys()])) {
      const shouldOutlineMove = parentHasMotionByMesh.get(candidateOutlineMesh) === true
      candidateOutlineMesh.userData.environmentOutlineMoving !== shouldOutlineMove && (shouldRedraw = true),
        (candidateOutlineMesh.userData.environmentOutlineMoving = shouldOutlineMove)
    }
    outlineFlaggedMeshSet.clear()
    for (const movingOutlineMesh of parentHasMotionByMesh.keys()) outlineFlaggedMeshSet.add(movingOutlineMesh)
    return (shouldRedraw && (options.invalidateReflections?.(), options.requestRender?.()), hasMotion)
  }
  return {
    tick: tick,
    sync(syncDoorModels: any, syncStates: any) {
      return tick(null, syncDoorModels, syncStates, true)
    },
    dispose: reset,
  }
}

/**
 * 3D 门锁控制面板（栈 D）。
 * 直播与编辑均可经 focusMarkerById / activateMarker 打开；
 * `editing: true` 时禁用操作（模型不可用或控制未就绪），否则可上锁/解锁/释放锁舌。
 */
/**
 * 把门锁原始 state 归一成右上角图形能表达的档位。
 * 关键：拿不到可信锁状态（未绑定锁实体 / unknown / unavailable）时归 `unknown`，
 * 绝不默认成 `unlocked`，否则卡片会摆出开锁图，与实际不符。
 */
const lockVisualStateOf = (snapshot: any, draftLocked: boolean | null) => {
  if (draftLocked !== null) return draftLocked ? 'locking' : 'unlocking'
  switch (
    String(snapshot?.state || '')
      .trim()
      .toLowerCase()
  ) {
    case 'locked':
      return 'locked'
    case 'unlocked':
    case 'open':
      return 'unlocked'
    case 'locking':
      return 'locking'
    case 'unlocking':
    case 'opening':
      return 'unlocking'
    case 'jammed':
      return 'jammed'
    default:
      return 'unknown'
  }
}
const LOCK_STATE_TEXT: Record<string, string> = {
  locked: '已上锁',
  unlocked: '已解锁',
  locking: '正在上锁',
  unlocking: '正在解锁',
  jammed: '门锁卡住',
  unknown: '锁状态未知',
}
const TONE_CLASSES = ['is-locked', 'is-unlocked', 'is-moving', 'is-jammed', 'is-normal', 'is-warning', 'is-unknown']
/** 状态行与芯片共用同一套色调类，CSS 按主题上色。 */
const applyTone = (element: any, tone: string) => {
  for (const toneClass of TONE_CLASSES) element.classList.toggle(toneClass, !!tone && toneClass === tone)
}
const doorTone = (snapshot: any) =>
  snapshot.doorOpenRatio === null ? 'is-unknown' : snapshot.doorOpen ? 'is-warning' : 'is-normal'
/** 电量低于此值转告警色。 */
const LOW_BATTERY_PERCENT = 20

export function createLockPanel({ onControl: onControl, feedbackSlot: hostFeedbackSlot = undefined }: any) {
  const createTextElement = (tagName: any, textContent = '') => domElement(document, tagName, '', textContent),
    panelElement = createTextElement('section'),
    headingElement = createTextElement('div'),
    titleElement = createTextElement('h3'),
    metaElement = createTextElement('p'),
    statusElement = createTextElement('p'),
    detailsElement = createTextElement('div'),
    actionsElement = createTextElement('div'),
    codeInputElement = createTextElement('input'),
    messageElement = createTextElement('p')
  const deviceVisual = createStageDeviceVisual({
    kind: 'lock',
    // 门锁不通过角标直接开锁，避免绕过二次确认。
    onActivate: undefined,
  })
  /** 状态芯片：名称 + 数值 + 可选底部电量条。 */
  const createChip = (withGauge = false) => {
    const chipElement = createTextElement('span'),
      nameElement = createTextElement('span'),
      valueElement = createTextElement('strong'),
      gaugeElement = createTextElement('i')
    return (
      (chipElement.className = 'i3d-lock-detail'),
      (nameElement.className = 'i3d-lock-detail-name'),
      (valueElement.className = 'i3d-lock-detail-value'),
      (gaugeElement.className = 'i3d-lock-detail-gauge'),
      (gaugeElement.hidden = !withGauge),
      chipElement.append(nameElement, valueElement, gaugeElement),
      { chipElement, nameElement, valueElement, gaugeElement }
    )
  }
  const doorChip = createChip(),
    batteryChip = createChip(true),
    battery2Chip = createChip(true)
  // 门磁芯片在双电量并排的网格里独占整行（见 stage.css 的 .i3d-lock-details）。
  doorChip.chipElement.classList.add('is-door')
  ;(panelElement.className = 'i3d-lock-panel i3d-nas-panel'),
    (headingElement.className = 'i3d-nas-heading i3d-popup-heading'),
    (metaElement.className = 'i3d-nas-meta'),
    (statusElement.className = 'i3d-nas-status'),
    (detailsElement.className = 'i3d-lock-details'),
    (actionsElement.className = 'i3d-focus-actions'),
    messageElement.setAttribute('role', 'status'),
    (codeInputElement.type = 'password'),
    (codeInputElement.autocomplete = 'off'),
    (codeInputElement.maxLength = 128),
    (codeInputElement.placeholder = '门密码（仅本次操作）'),
    codeInputElement.setAttribute('aria-label', '门密码')
  let currentComponent: any = null,
    isEditing = true,
    isSubmitting = false,
    isDisposed = false,
    pendingAction = '',
    updateEpoch = 0,
    draftLocked: boolean | null = null,
    draftTimeoutId: any = null
  const clearLockDraft = () => {
      draftTimeoutId !== null && clearTimeout(draftTimeoutId), (draftTimeoutId = null), (draftLocked = null)
    },
    armLockDraftTimeout = () => {
      draftTimeoutId !== null && clearTimeout(draftTimeoutId)
      draftTimeoutId = setTimeout(() => {
        ;(draftTimeoutId = null), (draftLocked = null), isDisposed || refreshPanel()
      }, 8000)
    }
  const buttonsByActionName = new Map()
  for (const [actionName, actionLabel] of [
    ['lock', '上锁'],
    ['unlock', '解锁'],
    ['open', '释放锁舌'],
  ]) {
    const actionButton = createTextElement('button', actionLabel)
    ;(actionButton.type = 'button'),
      buttonsByActionName.set(actionName, actionButton),
      actionsElement.append(actionButton),
      actionButton.addEventListener('click', async () => {
        if (isEditing || isSubmitting || !currentComponent) return
        if (actionName !== 'lock' && (pendingAction !== actionName || !messageElement.textContent)) {
          ;(pendingAction = actionName),
            (messageElement.textContent = '确认要' + actionLabel + '吗？再次点击执行。'),
            refreshPanel()
          return
        }
        ;(pendingAction = ''), (isSubmitting = true), (draftLocked = actionName === 'lock'), armLockDraftTimeout()
        const submitEpoch = updateEpoch,
          submittedComponent = currentComponent
        refreshPanel()
        const serviceData = codeInputElement.value
          ? {
              code: codeInputElement.value,
            }
          : {}
        codeInputElement.value = ''
        try {
          await onControl({
            deviceKind: 'lock',
            domain: 'lock',
            service: actionName,
            entityId: submittedComponent.entityId,
            data: serviceData,
          }),
            !isDisposed && submitEpoch === updateEpoch && (messageElement.textContent = '')
        } catch (error: any) {
          !isDisposed &&
            submitEpoch === updateEpoch &&
            (clearLockDraft(), (messageElement.textContent = error.message || '操作失败。'))
        } finally {
          !isDisposed && submitEpoch === updateEpoch && ((isSubmitting = false), refreshPanel())
        }
      })
  }
  let lockSnapshot = lockState({})
  /** 电量芯片：名称（锂电池 / 干电池）+ 数值 + 底部电量条。 */
  function paintBatteryChip(chip: any, labelText: string, batteryText: string, batteryLevel: any) {
    const level = typeof batteryLevel === 'number' ? batteryLevel : null
    ;(chip.nameElement.textContent = labelText), (chip.valueElement.textContent = batteryText)
    if (level === null) chip.gaugeElement.hidden = true
    else (chip.gaugeElement.hidden = false), (chip.gaugeElement.style.width = Math.max(0, Math.min(100, level)) + '%')
    applyTone(
      chip.chipElement,
      level === null ? 'is-unknown' : level <= LOW_BATTERY_PERCENT ? 'is-warning' : 'is-normal',
    )
  }
  function refreshPanel() {
    const isLockedNow = lockSnapshot.state === 'locked'
    draftLocked !== null && isLockedNow === draftLocked && clearLockDraft()
    const hasLockEntity = !!currentComponent?.entityId,
      visualLockState = lockVisualStateOf(lockSnapshot, draftLocked),
      // 「已上锁 / 正在上锁」都算锁已就位：上锁按钮据此置灰，避免重复下发。
      effectiveLocked = visualLockState === 'locked' || visualLockState === 'locking'
    // 主状态：绑了锁实体就以锁为准，门磁降为芯片；否则门磁顶上，都没有才说「仅电量」。
    ;(statusElement.textContent = hasLockEntity
      ? LOCK_STATE_TEXT[visualLockState]
      : currentComponent?.doorEntityId
        ? lockSnapshot.doorOpenLabel
        : '仅电量监测'),
      applyTone(
        statusElement,
        hasLockEntity
          ? (
              {
                locked: 'is-locked',
                unlocked: 'is-unlocked',
                locking: 'is-moving',
                unlocking: 'is-moving',
                jammed: 'is-jammed',
              } as Record<string, string>
            )[visualLockState] || 'is-unknown'
          : doorTone(lockSnapshot),
      ),
      (metaElement.textContent = isEditing
        ? '控制预览'
        : !lockSnapshot.available
          ? '设备不可用'
          : lockSnapshot.busy || isSubmitting || draftLocked !== null
            ? '设备正在动作'
            : hasLockEntity
              ? '状态实时更新'
              : '仅门磁监测')
    const chipQueue: any[] = [],
      hasPrimaryBattery = !!currentComponent?.batteryEntityId,
      hasSecondaryBattery = !!currentComponent?.battery2EntityId
    // 门磁芯片：只有锁状态接管了主行时才需要补这一条。
    if (hasLockEntity && currentComponent?.doorEntityId) {
      ;(doorChip.nameElement.textContent = '门磁'),
        (doorChip.valueElement.textContent = lockSnapshot.doorOpenLabel),
        (doorChip.gaugeElement.hidden = true),
        applyTone(doorChip.chipElement, doorTone(lockSnapshot)),
        chipQueue.push(doorChip.chipElement)
    }
    if (hasPrimaryBattery) {
      paintBatteryChip(batteryChip, '锂电池', lockSnapshot.battery, lockSnapshot.batteryLevel)
      chipQueue.push(batteryChip.chipElement)
    }
    // 第二槽位固定是干电池；只绑这一路时它就是该门锁唯一的电量来源。
    if (hasSecondaryBattery) {
      paintBatteryChip(battery2Chip, '干电池', lockSnapshot.battery2, lockSnapshot.battery2Level)
      chipQueue.push(battery2Chip.chipElement)
    }
    detailsElement.replaceChildren(...chipQueue), (detailsElement.hidden = !chipQueue.length)
    codeInputElement.hidden = !lockSnapshot.codeRequired
    let hasVisibleAction = false
    for (const [actionKey, actionButtonElement] of buttonsByActionName) {
      const actionHidden = !hasLockEntity || (actionKey === 'open' && !lockSnapshot.canOpen)
      ;(actionButtonElement.hidden = actionHidden),
        (actionButtonElement.disabled =
          isEditing ||
          isSubmitting ||
          !lockSnapshot.available ||
          lockSnapshot.busy ||
          (actionKey === 'lock' && effectiveLocked))
      actionHidden || (hasVisibleAction = true)
    }
    // 没绑锁实体时三个按钮全隐藏，别让空行继续占位。
    actionsElement.hidden = !hasVisibleAction
    deviceVisual.sync({
      kind: 'lock',
      on: visualLockState === 'unlocked',
      lockState: visualLockState,
      locked: visualLockState === 'locked',
      jammed: visualLockState === 'jammed',
      available: !!lockSnapshot.available,
      busy: !!lockSnapshot.busy || isSubmitting || draftLocked !== null,
      interactive: false,
      disabled: true,
      label: titleElement.textContent || '门',
    })
  }
  const headingTextElement = createTextElement('div')
  headingTextElement.className = 'i3d-popup-heading-text'
  headingTextElement.append(titleElement, metaElement)
  headingElement.append(headingTextElement, deviceVisual.root)
  panelElement.append(headingElement, statusElement, detailsElement, codeInputElement, actionsElement, messageElement)
  // 门锁提示统一走弹窗反馈聚合区（0.7.8 `lock-panel.js`）。
  const ownFeedbackSlot = hostFeedbackSlot ? null : createPopupFeedback({ element: panelElement }),
    feedbackSlot = hostFeedbackSlot || ownFeedbackSlot,
    releaseMessage = feedbackSlot.attach(messageElement, {
      source: () => currentComponent?.entityId || '',
      label: () => titleElement.textContent || '',
      onRetire: () => {
        pendingAction = ''
      },
    })
  return {
    root: panelElement,
    update({ item: component, states: entityStates, editing: editing }: any) {
      ;(currentComponent?.id !== component.id || currentComponent?.entityId !== component.entityId) &&
        (updateEpoch++,
        (isSubmitting = false),
        (pendingAction = ''),
        clearLockDraft(),
        (codeInputElement.value = ''),
        (messageElement.textContent = '')),
        (currentComponent = component),
        (isEditing = editing),
        (lockSnapshot = lockState(component, entityStates)),
        (titleElement.textContent = component.label || '门'),
        refreshPanel()
    },
    hide() {
      updateEpoch++,
        (isSubmitting = false),
        (pendingAction = ''),
        clearLockDraft(),
        (codeInputElement.value = ''),
        (messageElement.textContent = ''),
        (panelElement.hidden = true)
    },
    dispose() {
      ;(isDisposed = true),
        clearLockDraft(),
        (codeInputElement.value = ''),
        releaseMessage(),
        ownFeedbackSlot?.dispose?.(),
        deviceVisual.dispose(),
        panelElement.remove()
    },
  }
}

export {
  lockState,
  doorOpenState,
  doorModels,
  identifyLockEntities,
  lockEntityRole,
  LOCK_ENTITY_FIELDS,
} from '@app/bridge/lock-state-runtime'


const MDI_SVG = '/static/vendor/mdi/7.4.47/svg/'

export const SECURITY_ALARM_KINDS = ['moisture', 'smoke', 'gas'] as const

export const SECURITY_ALARM_TYPES: Record<string, { label: string; icon: string; alarm: string; normal: string }> = {
  moisture: {
    label: '水浸',
    icon: 'water-alert',
    alarm: '检测到水浸',
    normal: '未检测到水浸',
  },
  smoke: {
    label: '烟雾',
    icon: 'smoke-detector-alert',
    alarm: '检测到烟雾',
    normal: '未检测到烟雾',
  },
  gas: {
    label: '天然气',
    icon: 'gas-cylinder',
    alarm: '检测到气体',
    normal: '未检测到气体',
  },
}

export const isSecurityAlarmKind = (kind: any) => Object.hasOwn(SECURITY_ALARM_TYPES, kind)

export function securityAlarmKindLabel(kind: any) {
  return SECURITY_ALARM_TYPES[String(kind || '')]?.label || '安防'
}

const readEntityState = (stateSource: any, entityId: any) =>
  stateSource instanceof Map ? stateSource.get(entityId) : stateSource?.[entityId]

function binaryAlarmStatus(entityState: any) {
  if (!entityState) return 'unbound'
  const rawState = entityState.state
  if (entityState.available === false || rawState === 'unavailable') return 'unavailable'
  if (rawState === 'on') return 'alarm'
  if (rawState === 'off') return 'normal'
  return 'unknown'
}

function moistureSourceDetail(status: string, isSpray = false) {
  // 0.7.9 口径：报警统一叫「水浸报警」；正常时浸没侧是「干燥」、淋水侧是「关闭」。
  if (status === 'alarm') return '水浸报警'
  if (status === 'normal') return isSpray ? '关闭' : '干燥'
  if (status === 'unavailable') return '设备不可用'
  if (status === 'unbound') return '未绑定实体'
  return '状态未知'
}

/** 超过此时长的烟雾事件只作卡片「最近事件」，不再全屏弹窗 / 红卡报警 */
const SMOKE_EVENT_ALERT_MAX_AGE_MS = 30 * 60 * 1000

/**
 * 烟雾 event 实体的 state 本身是 ISO 时间戳。
 * 解析成功返回 { key, label, ms }；label 用 zh-CN 本地化（如 2026/10/3 09:13:19）。
 * HA event.* 会长期保留「最近一次」时间戳与 event_type，不能把历史记录当成正在报警。
 */

function parseSmokeEventTime(rawState: any) {
  if (typeof rawState !== 'string') return null
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(rawState)
  if (!match) return null
  const parsedMs = Date.parse(rawState)
  if (!Number.isFinite(parsedMs)) return null
  return {
    key: new Date(parsedMs).toISOString().slice(0, 19) + '.' + (match[2] || '').padEnd(9, '0') + 'Z',
    label: new Date(parsedMs).toLocaleString('zh-CN', { hour12: false }),
    ms: parsedMs,
  }
}

function isFreshSmokeEvent(parsed: { ms: number } | null | undefined) {
  if (!parsed || !Number.isFinite(parsed.ms)) return false
  const ageMs = Date.now() - parsed.ms
  return ageMs >= 0 && ageMs <= SMOKE_EVENT_ALERT_MAX_AGE_MS
}

export function securityAlarmReading(alarmConfig: any, stateSource: any = {}) {
  const kind = isSecurityAlarmKind(alarmConfig?.kind) ? alarmConfig.kind : 'moisture'
  const typeProfile = SECURITY_ALARM_TYPES[kind] || SECURITY_ALARM_TYPES.moisture
  const entityEntry = readEntityState(stateSource, alarmConfig?.entityId)
  const entityState = entityEntry?.newState || entityEntry
  const rawState = entityState?.state
  // event.* 烟雾源：即便当前 state 未带回 event_types，仍按 smoke-event 解读
  let mode =
    securityAlarmEntityMode(kind, alarmConfig, entityState) ||
    (kind === 'smoke' && /^event\.[a-z0-9_]+$/.test(alarmConfig?.entityId || '') ? 'smoke-event' : '')
  let status = 'unbound'
  let eventStamp = ''
  let immersionStatus = ''
  let sprayStatus = ''
  let sources: { name: string; detail: string; status: string }[] | null = null
  let smokeEventParsed: ReturnType<typeof parseSmokeEventTime> = null

  if (kind === 'moisture') {
    // 浸没 = entityId，淋水 = secondaryEntityId（可选）；任一个 on 即报警
    immersionStatus = alarmConfig?.entityId ? binaryAlarmStatus(entityState) : 'unbound'
    const sprayEntry = readEntityState(stateSource, alarmConfig?.secondaryEntityId)
    const sprayState = sprayEntry?.newState || sprayEntry
    sprayStatus = alarmConfig?.secondaryEntityId ? binaryAlarmStatus(sprayState) : ''
    const statuses = [immersionStatus, sprayStatus].filter(Boolean)
    if (!statuses.length) status = 'unbound'
    else if (statuses.includes('alarm')) status = 'alarm'
    else if (statuses.every((item) => item === 'normal')) status = 'normal'
    else if (statuses.includes('unavailable') && !statuses.includes('alarm'))
      status = statuses.includes('unknown') ? 'unknown' : 'unavailable'
    else if (statuses.includes('unknown')) status = 'unknown'
    else status = immersionStatus !== 'unbound' ? immersionStatus : sprayStatus || 'unbound'

    sources = []
    if (alarmConfig?.entityId || immersionStatus) {
      sources.push({
        name: '浸没状态',
        detail: moistureSourceDetail(immersionStatus || 'unbound', false),
        status: immersionStatus || 'unbound',
      })
    }
    if (alarmConfig?.secondaryEntityId) {
      sources.push({
        name: '淋水状态',
        detail: moistureSourceDetail(sprayStatus || 'unbound', true),
        status: sprayStatus || 'unbound',
      })
    }
    if (!sources.length) sources = null
  } else if (alarmConfig?.entityId) {
    const eventType = entityState?.attributes?.event_type || entityState?.attributes?.eventType || null
    smokeEventParsed = mode === 'smoke-event' && eventType === SMOKE_EVENT_TYPE ? parseSmokeEventTime(rawState) : null
    if (mode === 'smoke-event') {
      // event.*：新鲜高浓度烟雾 → event（可弹窗）；过期/空闲 → event-idle。
      // HA 会长期保留上次事件时间戳，必须按年龄区分，否则几天前的事件会反复全屏报警。
      // HA / 小米常把空闲标成 state=unavailable 且不带 availabilityReason=event-idle，
      // 若按普通 unavailable 处理会误显示「设备不可用」（电量仍 100%）。
      if (smokeEventParsed) {
        eventStamp = smokeEventParsed.key
        status = isFreshSmokeEvent(smokeEventParsed) ? 'event' : 'event-idle'
      } else {
        status = 'event-idle'
      }
    } else if (entityState?.available === false || rawState === 'unavailable') {
      status = 'unavailable'
    } else if (mode) {
      if (mode === 'gas-enum') {
        status = Object.hasOwn(GAS_ENUM_STATES, rawState) ? GAS_ENUM_STATES[rawState] : 'unknown'
      } else if (mode === 'smoke-enum') {
        status = Object.hasOwn(SMOKE_ENUM_STATES, rawState) ? SMOKE_ENUM_STATES[rawState] : 'unknown'
      } else if (rawState === 'on') status = 'alarm'
      else if (rawState === 'off') status = 'normal'
      else status = 'unknown'
    } else status = 'unknown'
  }

  const gasEnumLabel =
    (mode === 'gas-enum' || mode === 'smoke-enum') &&
    Object.hasOwn(mode === 'smoke-enum' ? SMOKE_ENUM_STATES : GAS_ENUM_STATES, rawState) &&
    status !== 'unavailable'
      ? String(rawState)
      : null

  // 烟雾 event：有 event_type+时间戳时展示「最近事件」（含过期，卡片不标红）；否则「尚未收到烟雾事件」
  let detail: string | null = null
  let detailLines: string[] | null = null
  if (kind === 'moisture' && sources?.length) {
    detail = sources.map((source) => source.name + '：' + source.detail).join('；')
  } else if (mode === 'smoke-event' && smokeEventParsed) {
    detailLines = ['最近事件：' + SMOKE_EVENT_TYPE, smokeEventParsed.label]
    detail = detailLines.join('\n')
  } else if (mode === 'smoke-event' && status === 'event-idle') {
    detail = '尚未收到烟雾事件'
  } else if (gasEnumLabel) {
    detail = gasEnumLabel
  }

  const detailMap: Record<string, string> = {
    alarm: typeProfile.alarm,
    event: typeProfile.alarm,
    normal: typeProfile.normal,
    unknown: '状态未知',
    unavailable: '设备不可用',
    unbound: '未绑定实体',
    warming: '预热',
    testing: '自检',
    expired: '传感器寿命到期',
    fault: '设备故障',
    dirty: '烟室积灰',
    'event-idle': '尚未收到烟雾事件',
  }
  const isEventSource = kind === 'smoke' && /^event\.[a-z0-9_]+$/.test(alarmConfig?.entityId || '')
  return {
    status,
    // reading.on 仅 binary/enum 报警；烟雾 event 由 overlay 按「新事件」置 on
    on: status === 'alarm',
    available: ['alarm', 'event', 'normal', 'warming', 'testing', 'expired', 'fault', 'dirty', 'event-idle'].includes(
      status,
    ),
    label: alarmConfig?.label || typeProfile.label,
    icon: typeProfile.icon,
    detail: detail || detailMap[status] || detailMap.unknown,
    detailLines,
    kind,
    mode,
    eventStamp,
    immersionStatus,
    sprayStatus,
    sources,
    ...(isEventSource
      ? {
          eventSource: true,
          // 过期事件也带上时间戳，供 overlay 建档；仅新鲜事件带 incidentKey 才会弹窗
          eventTimeKey: smokeEventParsed?.key || eventStamp || null,
          incidentKey:
            status === 'event' && (smokeEventParsed?.key || eventStamp)
              ? (alarmConfig?.entityId || '') + ':' + (smokeEventParsed?.key || eventStamp)
              : null,
          alarmDetail:
            status === 'event' && smokeEventParsed ? SMOKE_EVENT_TYPE + ' · ' + smokeEventParsed.label : null,
        }
      : {}),
  }
}

/** 工作状态实体 → 卡片右上角徽标（binary / 小米 enum） */
function securityAlarmWorkState(kind: any, entityState: any = null, entityId = '') {
  if (!entityId) {
    return { status: '', label: '', available: false }
  }
  if (!entityState) {
    return { status: 'unbound', label: '未绑定', available: false }
  }
  const rawState = entityState.state
  if (entityState.available === false || rawState === 'unavailable') {
    return { status: 'unavailable', label: '不可用', available: false }
  }
  const alarmKind = isSecurityAlarmKind(kind) ? kind : 'smoke'
  if (/^binary_sensor\./.test(entityId)) {
    if (rawState === 'on') return { status: 'alarm', label: '报警', available: true }
    if (rawState === 'off') return { status: 'normal', label: '正常', available: true }
    return { status: 'unknown', label: '未知', available: false }
  }
  const enumMap =
    alarmKind === 'gas'
      ? GAS_ENUM_STATES
      : alarmKind === 'smoke'
        ? { ...SMOKE_ENUM_STATES, ...GAS_ENUM_STATES }
        : { ...SMOKE_ENUM_STATES, ...GAS_ENUM_STATES }
  if (enumMap && Object.hasOwn(enumMap, rawState)) {
    const status = enumMap[rawState]
    return {
      status,
      label: String(rawState),
      available: ['alarm', 'normal', 'warming', 'testing', 'expired', 'fault', 'dirty'].includes(status),
    }
  }
  // 监测中 / monitoring 等同正常，右上角绿色
  if (typeof rawState === 'string' && /^(监测中|监测正常|monitoring|normal)$/i.test(rawState.trim())) {
    return { status: 'normal', label: String(rawState).trim(), available: true }
  }
  if (typeof rawState === 'string' && rawState.trim()) {
    return { status: 'unknown', label: String(rawState), available: false }
  }
  return { status: 'unknown', label: '未知', available: false }
}

export function securityAlarmEntities(alarms: any[] = []) {
  return [
    ...new Set(
      alarms
        .flatMap((alarm) => [
          alarm?.entityId,
          alarm?.secondaryEntityId,
          alarm?.batteryEntityId,
          alarm?.workStateEntityId,
        ])
        .filter(Boolean),
    ),
  ].map((entityId) => ({ entityId }))
}

export function securityAlarmReadings(alarms: any[] = [], stateSource: any = {}) {
  return alarms.map((alarm) => ({
    ...securityAlarmReading(alarm, stateSource),
    id: alarm.id,
    entityId: alarm.entityId,
    floorId: alarm.floorId,
  }))
}

export function activeSecurityAlarms(alarms: any[] = [], stateSource: any = {}) {
  return securityAlarmReadings(alarms, stateSource).filter((reading) => reading.on)
}

/** 参与全屏/画布报警遮罩的卡片（隐藏卡片不弹遮罩；overlay:false 仅 HomOS 扩展）。 */
export function overlayEligibleAlarms(alarms: any[] = []) {
  return (alarms || []).filter((alarm) => alarm?.visible !== false && alarm?.overlay !== false)
}

export function renderSecurityAlarmCard(markerElement: HTMLElement, alarmConfig: any, stateSource: any = {}) {
  const documentNode = markerElement.ownerDocument
  const reading = securityAlarmReading(alarmConfig, stateSource)
  let cardElement = markerElement.querySelector<HTMLElement>('.i3d-alarm-card')
  if (!cardElement) {
    cardElement = documentNode.createElement('span')
    cardElement.className = 'i3d-alarm-card'
    const iconElement = domElement(documentNode, 'i', 'i3d-alarm-icon')
    iconElement.setAttribute('aria-hidden', 'true')
    const textElement = domElement(documentNode, 'span', 'i3d-alarm-card-text')
    const titleElement = domElement(documentNode, 'strong', 'i3d-alarm-card-title')
    const detailElement = domElement(documentNode, 'span', 'i3d-alarm-card-detail')
    const batteryElement = domElement(documentNode, 'small', 'i3d-alarm-card-battery')
    const workElement = domElement(documentNode, 'em', 'i3d-alarm-card-work')
    textElement.append(titleElement, detailElement, batteryElement)
    cardElement.append(iconElement, textElement, workElement)
    markerElement.replaceChildren(cardElement)
  }
  let workElement = cardElement.querySelector<HTMLElement>('.i3d-alarm-card-work')
  if (!workElement) {
    workElement = documentNode.createElement('em')
    workElement.className = 'i3d-alarm-card-work'
    cardElement.append(workElement)
  }
  // event 态卡片按 alarm 配色；event-idle / dirty 走对应 data-status 样式
  cardElement.dataset.status = reading.status === 'event' ? 'alarm' : reading.status
  // 卡片宽度仍按配置定格；字号放大时由 CSS 的 min-width（calc(66px + 1em)）兜底撑开。
  // ⚠ 不要在这里改读 `cardElement.offsetWidth`：那会把「实测宽度」写回自身，width 会随
  //    字号单向递增（大字号改回小字号后卡片再也缩不回来）。要跟随实测宽度的是下面的标记层。
  cardElement.style.width = (alarmConfig?.size ?? 340) + 'px'
  cardElement.style.fontSize = (alarmConfig?.fontSize ?? 21) + 'px'
  cardElement.style.setProperty('--label-background-opacity', String(alarmConfig?.opacity ?? 1))
  const iconElement = cardElement.querySelector<HTMLElement>('.i3d-alarm-icon')!
  const maskUrl = "url('" + MDI_SVG + reading.icon + ".svg')"
  iconElement.style.maskImage = maskUrl
  iconElement.style.webkitMaskImage = maskUrl
  cardElement.querySelector('strong')!.textContent = reading.label
  const detailElement = cardElement.querySelector<HTMLElement>('.i3d-alarm-card-detail')!
  if (reading.sources?.length) {
    detailElement.replaceChildren(
      ...reading.sources.map((source: any) => {
        const sourceElement = domElement(documentNode, 'span', 'i3d-alarm-source')
        sourceElement.dataset.status = source.status
        sourceElement.textContent = source.name + '：' + source.detail
        return sourceElement
      }),
    )
  } else if (reading.detailLines?.length) {
    const detailLines = reading.detailLines
    detailElement.replaceChildren(
      ...detailLines.map((line: string, lineIndex: number) => {
        const lineElement = documentNode.createElement('span')
        lineElement.className = 'i3d-alarm-detail-line' + (lineIndex === detailLines.length - 1 ? ' is-event-time' : '')
        lineElement.textContent = line
        return lineElement
      }),
    )
  } else {
    detailElement.textContent = reading.detail
  }
  const batteryElement = cardElement.querySelector<HTMLElement>('.i3d-alarm-card-battery')!
  batteryElement.hidden = !alarmConfig?.batteryEntityId
  const batteryEntry = readEntityState(stateSource, alarmConfig?.batteryEntityId)
  const batteryState = batteryEntry?.newState || batteryEntry
  const batteryText =
    batteryState?.available !== false &&
    String(batteryState?.state ?? '').trim() &&
    Number.isFinite(Number(batteryState?.state))
      ? String(batteryState.state) + (batteryState?.attributes?.unit_of_measurement || '%')
      : '—'
  batteryElement.textContent = alarmConfig?.batteryEntityId ? '电量 ' + batteryText : ''

  const workEntry = readEntityState(stateSource, alarmConfig?.workStateEntityId)
  const workState = securityAlarmWorkState(
    alarmConfig?.kind || reading.kind,
    workEntry?.newState || workEntry,
    alarmConfig?.workStateEntityId || '',
  )
  const showWork = !!alarmConfig?.workStateEntityId
  workElement.hidden = !showWork
  cardElement.classList.toggle('has-work-state', showWork)
  if (showWork) {
    workElement.dataset.status = workState.status || 'unknown'
    workElement.textContent = workState.label || '—'
    workElement.title = '工作状态：' + (workState.label || '—')
  } else {
    workElement.textContent = ''
    delete workElement.dataset.status
  }

  markerElement.setAttribute(
    'aria-label',
    reading.label + ' · ' + reading.detail + (showWork ? ' · 工作状态 ' + (workState.label || '—') : ''),
  )
  markerElement.style.width = (cardElement.offsetWidth || alarmConfig?.size || 340) + 'px'
  markerElement.style.height = (cardElement.offsetHeight || 58) + 'px'
}

const overlayRegistry = new WeakMap<HTMLElement, any>()

export function createSecurityAlarmOverlay(hostElement: HTMLElement, { onDismiss }: { onDismiss?: () => void } = {}) {
  const documentNode = hostElement?.ownerDocument
  if (!documentNode?.createElement) {
    return { update() {}, dispose() {} }
  }
  let shared = overlayRegistry.get(hostElement)
  if (!shared) {
    const root = domElement(documentNode, 'div', 'i3d-alarm-overlay')
    root.hidden = true
    root.dataset.scope = hostElement === documentNode.body ? 'screen' : 'preview'
    const glow = domElement(documentNode, 'div', 'i3d-alarm-glow')
    glow.setAttribute('aria-hidden', 'true')
    const list = domElement(documentNode, 'div', 'i3d-alarm-messages')
    list.setAttribute('role', 'alert')
    list.setAttribute('aria-atomic', 'true')
    const dismiss = documentNode.createElement('button')
    dismiss.type = 'button'
    dismiss.className = 'i3d-alarm-dismiss'
    dismiss.textContent = '关闭本次提示'
    dismiss.addEventListener('click', () => {
      const visible = new Set(shared.visibleKeys)
      for (const key of visible) shared.acknowledged.add(key)
      refresh()
      for (const [owner, readings] of shared.owners) {
        if (readings.some((reading: any) => visible.has(reading.incidentKey || reading.entityId || reading.id))) {
          shared.dismissHandlers.get(owner)?.()
        }
      }
    })
    root.append(glow, list)
    hostElement.append(root)
    shared = {
      root,
      list,
      dismiss,
      owners: new Map(),
      eventSources: new Map(),
      events: new Map(),
      sceneStyles: new Map(),
      dismissHandlers: new Map(),
      acknowledged: new Set(),
      visibleKeys: [] as string[],
      signature: '',
      timer: null as any,
    }
    overlayRegistry.set(hostElement, shared)
  }
  if (shared.root.parentNode !== hostElement) hostElement.append(shared.root)
  const ownerKey = Symbol('alarm-owner')
  let disposed = false
  shared.owners.set(ownerKey, [])
  if (onDismiss) shared.dismissHandlers.set(ownerKey, onDismiss)

  // incidentKey 优先；烟雾 event 按「新事件」才弹，确认后同一次不重弹
  const readingKey = (reading: any) => reading.incidentKey || reading.entityId || reading.id || ''
  const isAlerting = (reading: any) =>
    reading?.eventSource
      ? reading?.on === true
      : reading?.on === true || reading?.status === 'alarm' || !reading?.status

  function refresh() {
    // 追踪各 event 实体最新时间戳。
    // 历史/过期事件：reading.incidentKey 为空，只建档不弹。
    // 新鲜事件：首见或时间推进时带上 incidentKey，才会全屏报警。
    const latestByEntity = new Map<string, any>()
    for (const reading of [...shared.owners.values()].flat()) {
      if (!reading?.eventSource || !['event', 'event-idle'].includes(reading.status) || !reading.entityId) continue
      const previous = latestByEntity.get(reading.entityId)
      if (!previous || (reading.eventTimeKey || '') > (previous.eventTimeKey || '')) {
        latestByEntity.set(reading.entityId, reading)
      }
    }
    // 仅在仍有启用中的 event 源时裁剪已移除的实体；
    // 编辑态 / 未授权时的 update([], false) 会暂时清空 eventSources，不能因此丢掉追踪与已确认。
    const liveEntityIds = new Set([...shared.eventSources.values()].flatMap((ids: Set<string>) => [...ids]))
    if (liveEntityIds.size) {
      for (const [entityId, tracked] of shared.events) {
        if (!liveEntityIds.has(entityId)) {
          if (tracked.incidentKey) shared.acknowledged.delete(tracked.incidentKey)
          shared.events.delete(entityId)
        }
      }
    }
    for (const [entityId, reading] of latestByEntity) {
      const nextTime = reading.eventTimeKey || ''
      const tracked = shared.events.get(entityId)
      if (tracked) {
        if (nextTime > tracked.time) {
          if (tracked.incidentKey) shared.acknowledged.delete(tracked.incidentKey)
          tracked.time = nextTime
          // 空闲→时间戳：过期事件 incidentKey 为空（只建档）；新鲜事件才会弹
          tracked.incidentKey = reading.incidentKey || null
        }
      } else {
        // 首见：新鲜事件直接采用 incidentKey（进页时仍在报警窗口内应弹出）
        shared.events.set(entityId, {
          time: nextTime,
          incidentKey: reading.incidentKey || null,
        })
      }
    }

    const allReadings = [...shared.owners].flatMap(([, readings]) =>
      readings.map((reading: any) =>
        reading?.eventSource
          ? {
              ...reading,
              on: !!reading.incidentKey && shared.events.get(reading.entityId)?.incidentKey === reading.incidentKey,
              detail: reading.alarmDetail || reading.detail,
            }
          : reading,
      ),
    )
    for (const reading of allReadings) {
      if (
        reading.status === 'normal' &&
        !allReadings.some((other) => readingKey(other) === readingKey(reading) && isAlerting(other))
      ) {
        shared.acknowledged.delete(readingKey(reading))
      }
    }
    const active = [
      ...new Map(
        allReadings
          .filter((reading) => isAlerting(reading) && !shared.acknowledged.has(readingKey(reading)))
          .map((reading) => [readingKey(reading), reading]),
      ).values(),
    ]
    shared.visibleKeys = active.map(readingKey)
    const styleOwner =
      active.length > 0 ? [...shared.owners].find(([, readings]) => readings.includes(active[0]))?.[0] : null
    shared.root.dataset.sceneStyle = shared.sceneStyles.get(styleOwner) || 'default'
    const signature = JSON.stringify(
      active.map((reading) => [reading.entityId, reading.label, reading.detail, reading.icon]),
    )
    if (signature === shared.signature) return
    shared.signature = signature
    if (active.length) {
      clearTimeout(shared.timer)
      shared.timer = null
      shared.list.replaceChildren(
        ...active.map((reading) => {
          const message = domElement(documentNode, 'div', 'i3d-alarm-message')
          const icon = domElement(documentNode, 'i', 'i3d-alarm-icon')
          icon.setAttribute('aria-hidden', 'true')
          const maskUrl = "url('" + MDI_SVG + reading.icon + ".svg')"
          icon.style.maskImage = maskUrl
          icon.style.webkitMaskImage = maskUrl
          const text = documentNode.createElement('span')
          const title = documentNode.createElement('strong')
          const detail = documentNode.createElement('span')
          title.textContent = reading.label
          detail.textContent = reading.detail
          text.append(title, detail)
          message.append(icon, text)
          return message
        }),
        shared.dismiss,
      )
      shared.root.hidden = false
      shared.root.classList.add('is-alarming')
    } else {
      shared.root.classList.remove('is-alarming')
      shared.list.replaceChildren()
      clearTimeout(shared.timer)
      shared.timer = setTimeout(() => {
        shared.root.hidden = true
        shared.timer = null
      }, 300)
    }
  }

  return {
    update(readings: any[] = [], enabled = true, sceneStyle = 'default') {
      if (disposed) return
      if (shared.root.parentNode !== hostElement) hostElement.append(shared.root)
      shared.sceneStyles.set(ownerKey, isWarmSceneStyle(sceneStyle) ? 'warm-wood' : 'default')
      shared.eventSources.set(
        ownerKey,
        new Set(
          readings
            .filter((reading: any) => reading?.eventSource)
            .map((reading: any) => reading.entityId)
            .filter(Boolean),
        ),
      )
      shared.owners.set(ownerKey, enabled ? readings : [])
      refresh()
    },
    dispose() {
      if (disposed) return
      disposed = true
      shared.owners.delete(ownerKey)
      shared.eventSources.delete(ownerKey)
      shared.sceneStyles.delete(ownerKey)
      shared.dismissHandlers.delete(ownerKey)
      if (shared.owners.size) refresh()
      else {
        clearTimeout(shared.timer)
        shared.root.remove()
        overlayRegistry.delete(hostElement)
      }
    },
  }
}

export function mergeSecurityAlarmPresentations(presentations: any[] = []) {
  const list = presentations.filter(Boolean)
  if (!list.length) return null
  if (list.length === 1) return list[0]
  const alerting = list.filter((entry) => entry.alerting || entry.on)
  const primary = alerting[0] || list[0]
  return {
    ...primary,
    merged: true,
    mergeCount: list.length,
    statusLabel: alerting.length
      ? alerting.map((entry) => entry.label + '：' + entry.detail).join(' · ')
      : list.map((entry) => entry.detail).join(' · '),
    alerting: alerting.length > 0,
    on: alerting.length > 0,
  }
}

/**
 * 推拉窗「整组配置」合并弹窗（0.8.9 `security-editor.js` 的 `选择整组使用的配置`）。
 *
 * ## 为什么需要它
 *
 * 0.8.2 的窗磁 / 开窗器配置是**按扇**存的（`window:<窗>:<面板>`），0.8.4 起推拉组改成
 * **整组一条**（`window:<窗>:<组>`）。老户型升级后，同一组推拉窗会同时存在组配置和若干
 * 扇配置 —— 面板里会看到重复条目，删掉哪一条都会丢一部分绑定（窗磁 / 电量 / 标签）。
 *
 * 这里按上游做法给一次「合并」机会：从重复项里挑一条保留，其余移除，并把保留那条的
 * `modelId` 归一到整组 id。
 *
 * ## 触发条件（与上游同口径）
 *
 * 只有当这条窗扇模型的 `legacyModels` 非空、**且**本层确实存在 >1 条解析到同一组的配置时
 * 才弹。数据干净时它不会出现，所以这是纯迁移路径。
 */


/** 一条窗户安防配置（只声明本段读到的字段）。 */
export type WindowSecurityConfig = {
  id: string
  modelId?: string
  floorId?: string
  label?: string
  doorEntityId?: string
  batteryEntityId?: string
  [key: string]: unknown
}

/** 窗扇模型（只声明本段读到的字段）。 */
export type WindowModelEntry = {
  modelId?: string
  id?: string
  name?: string
  legacyModels?: ReadonlyArray<{ modelId?: string; id?: string }>
}

/** 同一条窗模型可接受的身份集合（整组 id + 旧扇 id）。 */
export function windowModelIdSet(windowModel: WindowModelEntry | null | undefined): Set<string> {
  const ids = new Set<string>()
  const groupId = String(windowModel?.modelId || windowModel?.id || '')
  groupId && ids.add(groupId)
  for (const legacyModel of windowModel?.legacyModels || []) {
    const legacyId = String(legacyModel?.modelId || legacyModel?.id || '')
    legacyId && ids.add(legacyId)
  }
  return ids
}

/** 本层解析到同一组推拉窗的全部配置（>1 条即有重复需要合并）。 */
export function duplicateWindowConfigs(
  windows: ReadonlyArray<WindowSecurityConfig>,
  floorId: string,
  windowModel: WindowModelEntry | null | undefined,
): WindowSecurityConfig[] {
  const ids = windowModelIdSet(windowModel)
  return ids.size
    ? windows.filter(
        (windowConfig) => (windowConfig.floorId || '') === floorId && ids.has(String(windowConfig.modelId || '')),
      )
    : []
}

/** 选项明细行：`窗磁：<实体或未绑定>；电量：<实体或未绑定>`。 */
function configDetail(windowConfig: WindowSecurityConfig): string {
  return '窗磁：' + (windowConfig.doorEntityId || '未绑定') + '；电量：' + (windowConfig.batteryEntityId || '未绑定')
}

export type WindowConfigMergeOptions = {
  document: Document
  /** 本层全部窗户配置（合并会从这里移除未保留的项）。 */
  windows: WindowSecurityConfig[]
  floorId: string
  windowModel: WindowModelEntry
  /** 合并完成：`kept` 是被保留并已归一 `modelId` 的那条。 */
  onMerged: (kept: WindowSecurityConfig) => void
  /** 弹窗关闭（含取消）。 */
  onClose?: () => void
}

/**
 * 打开「选择整组使用的配置」。返回弹窗句柄；没有重复项时返回 `null`（不弹）。
 */
export function openWindowConfigMergeDialog({
  document,
  windows,
  floorId,
  windowModel,
  onMerged,
  onClose,
}: WindowConfigMergeOptions) {
  const duplicates = duplicateWindowConfigs(windows, floorId, windowModel)
  if (duplicates.length < 2) return null
  const snapshot = JSON.stringify(duplicates),
    choices: ConfigurationChoice[] = duplicates.map((windowConfig) => ({
      id: windowConfig.id,
      label: windowConfig.label || '窗户配置',
      wrapLabel: true,
      detail: configDetail(windowConfig),
    }))
  let isMerging = false
  return openConfigurationPicker({
    document,
    title: '选择整组使用的配置',
    kicker: 'SLIDING WINDOW',
    description:
      '这组推拉窗现有 ' +
      duplicates.length +
      ' 份配置。选择要保留的窗磁、电量和标签设置后，合并为一条整组配置；其他重复项将移除。点击“保存配置”后应用，也可以关闭本窗口取消。',
    sections: [{ options: choices }],
    async onSelect(keptConfigId: string) {
      if (isMerging) return
      isMerging = true
      try {
        // 弹窗打开期间数据变了（另开窗口删了配置 / 改了窗型）：让用户重来，不要按旧快照合并。
        if (JSON.stringify(duplicateWindowConfigs(windows, floorId, windowModel)) !== snapshot)
          throw new Error('窗户配置已变化，请关闭后重新选择。')
        const keptConfig = duplicates.find((windowConfig) => windowConfig.id === keptConfigId)
        if (!keptConfig) throw new Error('窗户配置已变化，请关闭后重新选择。')
        const groupModelId = String(windowModel.modelId || windowModel.id || ''),
          removedIds = new Set(duplicates.filter((windowConfig) => windowConfig !== keptConfig).map(({ id }) => id))
        keptConfig.modelId = groupModelId
        // 就地替换数组内容：调用方持有的是同一份 `security.windows` 引用。
        windows.splice(0, windows.length, ...windows.filter((windowConfig) => !removedIds.has(windowConfig.id)))
        onMerged(keptConfig)
      } finally {
        isMerging = false
      }
    },
    onClose,
  })
}
