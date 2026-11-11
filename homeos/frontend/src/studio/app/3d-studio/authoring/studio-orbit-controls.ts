/**
 * OrbitControls 本地包装（0.8.1 B6）。
 *
 * vendor 的 0.187.0 没有 `rotateSmoothing` / `rotateSmoothingThreshold` /
 * `touchDragThreshold` 这三个字段，直接赋值等于写进对象但没人读：
 * 视觉上就是「没有平滑」，触屏还会被 1px 抖动带跑。这里在包装层实现：
 *
 * - `_rotateLeft/_rotateUp` 只累积目标增量，由 `update(dt)` 按指数平滑消费；
 * - damping 按 `dt` 归一化，120Hz 与 60Hz 的手感一致；
 * - 触摸移动小于 `touchDragThreshold` 时拦截事件，避免误触旋转。
 */
type StudioOrbitControlsOptions = {
  rotateSmoothing?: number
  rotateSmoothingThreshold?: number
  touchDragThreshold?: number
}

/**
 * 松手后的惯性滑行剩余量低于这两个值就直接停：剩下的总位移约 1px，肉眼看不出「提前停」，
 * 但 vendor 只在每帧位移 < 1e-3 世界单位时才报静止，按阻尼衰减要多渲染约 2s 的亚像素帧。
 */
const GLIDE_STOP_RADIANS = 0.002
const GLIDE_STOP_PAN = 0.001
/** vendor `_STATE.NONE`：没有按住的指针（拖拽中剩余增量里还有未消费的输入，不能截断）。 */
const ORBIT_STATE_NONE = -1

/** 包装层实际读写的 vendor 字段（其余字段由泛型 T 原样透传）。 */
type RotatableOrbitControls = {
  dampingFactor?: number
  state?: number
  _sphericalDelta?: { theta: number; phi: number }
  _panOffset?: { lengthSq(): number; set(x: number, y: number, z: number): unknown }
  _rotateLeft: (angle: number) => void
  _rotateUp: (angle: number) => void
  update: (deltaSeconds?: number | null) => unknown
  dispose?: () => void
}

type OrbitControlsConstructor = new (camera: object, domElement: HTMLElement) => RotatableOrbitControls

function settleSphericalGlide(sphericalDelta: RotatableOrbitControls['_sphericalDelta']) {
  sphericalDelta &&
    Math.abs(sphericalDelta.theta) < GLIDE_STOP_RADIANS &&
    Math.abs(sphericalDelta.phi) < GLIDE_STOP_RADIANS &&
    (sphericalDelta.theta = sphericalDelta.phi = 0)
}

export function createStudioOrbitControls<C extends OrbitControlsConstructor>(
  OrbitControlsClass: C,
  camera: object,
  domElement: HTMLElement,
  { rotateSmoothing = 8, rotateSmoothingThreshold = 0.000001, touchDragThreshold = 0 }: StudioOrbitControlsOptions = {},
) {
  const controls = new OrbitControlsClass(camera, domElement) as InstanceType<C> & RotatableOrbitControls,
    baseDampingFactor = Number(controls.dampingFactor) || 0.22,
    baseRotateLeft = controls._rotateLeft.bind(controls),
    baseRotateUp = controls._rotateUp.bind(controls),
    baseUpdate = controls.update.bind(controls)
  let pendingTheta = 0,
    pendingPhi = 0,
    touchStart: { x: number; y: number; moved: boolean } | null = null

  // 输入只入队，统一在 update 里按时间消费。
  controls._rotateLeft = (angle: number) => {
    pendingTheta += angle
  }
  controls._rotateUp = (angle: number) => {
    pendingPhi += angle
  }

  controls.update = (deltaSeconds: number | null = null) => {
    const deltaTime = Math.max(
        1 / 240,
        Math.min(1 / 20, Number.isFinite(deltaSeconds as number) ? Number(deltaSeconds) : 1 / 60),
      ),
      smoothingAlpha = rotateSmoothing > 0 ? 1 - Math.exp(-rotateSmoothing * deltaTime) : 1,
      appliedTheta = pendingTheta * smoothingAlpha,
      appliedPhi = pendingPhi * smoothingAlpha
    ;(pendingTheta -= appliedTheta), (pendingPhi -= appliedPhi)
    Math.abs(pendingTheta) < rotateSmoothingThreshold && (pendingTheta = 0)
    Math.abs(pendingPhi) < rotateSmoothingThreshold && (pendingPhi = 0)
    appliedTheta && baseRotateLeft(appliedTheta), appliedPhi && baseRotateUp(appliedPhi)
    // 阻尼原本按「每次 update 衰减 22%」写死，帧率翻倍衰减也翻倍；
    // 用 60Hz 等效换算回本帧的衰减系数。
    controls.dampingFactor =
      deltaTime === 1 / 60 ? baseDampingFactor : 1 - Math.pow(1 - baseDampingFactor, deltaTime * 60)
    try {
      return baseUpdate(deltaSeconds)
    } finally {
      controls.dampingFactor = baseDampingFactor
      stopSubPixelGlide()
    }
  }

  function stopSubPixelGlide() {
    if (controls.state !== ORBIT_STATE_NONE || pendingTheta || pendingPhi) return
    settleSphericalGlide(controls._sphericalDelta)
    const panOffset = controls._panOffset
    panOffset && panOffset.lengthSq() < GLIDE_STOP_PAN * GLIDE_STOP_PAN && panOffset.set(0, 0, 0)
  }

  if (touchDragThreshold > 0) {
    const handleTouchPointerDown = (pointerEvent: PointerEvent) => {
        pointerEvent.pointerType === 'touch' &&
          (touchStart = { x: pointerEvent.clientX, y: pointerEvent.clientY, moved: false })
      },
      handleTouchPointerMove = (pointerEvent: PointerEvent) => {
        if (!touchStart || pointerEvent.pointerType !== 'touch' || touchStart.moved) return
        // 捕获阶段先于 OrbitControls 的监听器执行：阈值内直接吞掉，防止误旋转。
        if (Math.hypot(pointerEvent.clientX - touchStart.x, pointerEvent.clientY - touchStart.y) < touchDragThreshold) {
          pointerEvent.stopImmediatePropagation()
          return
        }
        touchStart.moved = true
      },
      handleTouchPointerEnd = () => {
        touchStart = null
      },
      touchListenerOptions = { capture: true } as const
    domElement.addEventListener('pointerdown', handleTouchPointerDown, touchListenerOptions)
    domElement.addEventListener('pointermove', handleTouchPointerMove, touchListenerOptions)
    domElement.addEventListener('pointerup', handleTouchPointerEnd, touchListenerOptions)
    domElement.addEventListener('pointercancel', handleTouchPointerEnd, touchListenerOptions)
    const baseDispose = controls.dispose?.bind(controls)
    controls.dispose = () => {
      domElement.removeEventListener('pointerdown', handleTouchPointerDown, touchListenerOptions),
        domElement.removeEventListener('pointermove', handleTouchPointerMove, touchListenerOptions),
        domElement.removeEventListener('pointerup', handleTouchPointerEnd, touchListenerOptions),
        domElement.removeEventListener('pointercancel', handleTouchPointerEnd, touchListenerOptions),
        baseDispose?.()
    }
  }

  return Object.assign(controls, {
    rotateSmoothing,
    rotateSmoothingThreshold,
    touchDragThreshold,
  }) as InstanceType<C> & Required<StudioOrbitControlsOptions>
}
