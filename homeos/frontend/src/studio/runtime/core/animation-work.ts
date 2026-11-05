/**
 * 动画节拍与视锥可见性（0.7.8 `animation-work`）。
 *
 * - `advancePresentationTime`（0.8.4）：按真实时间推进表现时钟，单帧最多补 50ms，
 *   跨过标签页休眠造成的大跨度时间不会被一次性补齐（否则动画会「跳一段」）；
 * - `createAnimationCadence`：按可变帧间隔对齐到帧栅格，返回本次应推进的秒数；
 * - `createAnimationVisibility`：按包围球 + 摄像机视锥判断动画对象是否可见，
 *   反射通道可以额外放行，避免镜子里的动画被剔除。
 */

/** 表现时钟状态（`runtime-document` 里保存的跨帧结构）。 */
export type PresentationClock = {
  started: number
  lastFrame: number | null
  firstFrame: boolean
  elapsed: number
}

/** 单帧最多补的毫秒数：超过这个跨度的间隔视为「掉帧」而不是「时间流逝」。 */
const PRESENTATION_MAX_STEP_MS = 50

/**
 * 推进表现时钟，返回累计的已用毫秒。
 *
 * @param clock            时钟状态（原地改写）
 * @param previousTimeMs   上一次调用传入的时间戳
 * @param currentTimeMs    本次时间戳（默认取 `performance.now()`）
 */
export function advancePresentationTime(
  clock: PresentationClock,
  previousTimeMs: number,
  currentTimeMs: number = performance.now(),
): number {
  // 时间戳倒退或跨度异常大（页面被挂起）时，以「上一帧」为准，不把这段时间算进动画。
  const currentMs = currentTimeMs - previousTimeMs > PRESENTATION_MAX_STEP_MS ? currentTimeMs : previousTimeMs
  const frameTimeMs = Math.max(currentMs, clock.lastFrame ?? clock.started ?? currentMs)
  return (
    clock.firstFrame && ((clock.lastFrame = frameTimeMs), (clock.firstFrame = false)),
    (clock.elapsed += Math.min(PRESENTATION_MAX_STEP_MS, Math.max(0, frameTimeMs - (clock.lastFrame ?? frameTimeMs)))),
    (clock.lastFrame = frameTimeMs),
    clock.elapsed
  )
}

export type AnimationCadence = {
  take: (nowMs: number, frameIntervalMs?: number) => number | null
  /** 距下一个帧栅格还有多少毫秒（用于 `alignDeadlines` 的帧循环）。 */
  nextDelay: (nowMs: number, frameIntervalMs?: number) => number
  reset: () => void
}

/** 创建 30fps（默认）节拍器；`take` 在未到间隔时返回 null。 */
export function createAnimationCadence(frameIntervalMs = 1000 / 30): AnimationCadence {
  let lastTickMs: number | null = null,
    nextTickMs: number | null = null
  /** 把任意时间戳对齐到下一个帧栅格（帧栅格起点保持在相位上）。 */
  const alignToGrid = (nowMs: number) => (Math.floor((nowMs + 1) / frameIntervalMs) + 1) * frameIntervalMs
  /** 运行时切换帧间隔：保持已对齐的相位，避免切换瞬间补一大帧或停一帧。 */
  function setFrameInterval(nextFrameIntervalMs: any) {
    Number.isFinite(nextFrameIntervalMs) &&
      nextFrameIntervalMs > 0 &&
      nextFrameIntervalMs !== frameIntervalMs &&
      ((frameIntervalMs = nextFrameIntervalMs), (nextTickMs = lastTickMs === null ? null : alignToGrid(lastTickMs)))
  }
  return {
    take(nowMs, requestedFrameIntervalMs = frameIntervalMs) {
      setFrameInterval(requestedFrameIntervalMs)
      const previousTickMs = lastTickMs
      // 还没到下一个栅格（留 1ms 余量）就跳过这一帧。
      if (previousTickMs !== null && nowMs >= previousTickMs && nowMs + 1 < (nextTickMs ?? Infinity)) return null
      const elapsedMs = previousTickMs === null ? frameIntervalMs : Math.max(0, nowMs - previousTickMs)
      return (
        (nextTickMs =
          nextTickMs === null ||
          (previousTickMs !== null && nowMs < previousTickMs) ||
          nowMs - nextTickMs >= frameIntervalMs
            ? alignToGrid(nowMs)
            : nextTickMs + frameIntervalMs),
        (lastTickMs = nowMs),
        elapsedMs / 1000
      )
    },
    nextDelay(nowMs, requestedFrameIntervalMs = frameIntervalMs) {
      return (
        setFrameInterval(requestedFrameIntervalMs),
        Number.isFinite(nowMs) ? Math.max(0, (nextTickMs ?? nowMs) - nowMs) : frameIntervalMs
      )
    },
    reset() {
      lastTickMs = nextTickMs = null
    },
  }
}

export type AnimationVisibility = {
  visible: (target: any, options?: { reflected?: boolean; padding?: number }) => boolean
  invalidate: () => void
}

/**
 * 创建可见性判定器。
 *
 * @param THREE             three 命名空间
 * @param getCamera         目标对象 → 摄像机（可返回 null）
 * @param getRevision       场景版本号；变化时清空包围球缓存
 * @param mayReflect        反射通道是否放行该对象
 */
export function createAnimationVisibility({
  THREE: THREE,
  getCamera: getCamera,
  getRevision: getRevision,
  mayReflect: mayReflect = () => true,
}: {
  THREE?: any
  getCamera?: (target: any) => any
  getRevision?: () => any
  mayReflect?: (target: any) => boolean
} = {}): AnimationVisibility {
  let boundsCache = new WeakMap<any, number>(),
    cachedRevision: any
  const sphere = new THREE.Sphere(),
    projectionMatrix = new THREE.Matrix4(),
    frustum = new THREE.Frustum()

  /** 对象自身几何 + 子节点偏移的保守包围半径。 */
  function boundRadius(target: any): number {
    let radius = 0
    if (target.geometry) {
      target.geometry.computeBoundingSphere?.()
      const boundingSphere = target.geometry.boundingSphere
      if (boundingSphere) radius = boundingSphere.center.length() + boundingSphere.radius
    }
    for (const child of target.children || []) {
      if (child.userData?.environmentEffect) continue
      const childScale = Math.max(Math.abs(child.scale.x), Math.abs(child.scale.y), Math.abs(child.scale.z))
      radius = Math.max(radius, child.position.length() + boundRadius(child) * childScale)
    }
    return radius
  }

  return {
    visible(target, { reflected = false, padding = 0 } = {}) {
      if (!target) return true
      for (let ancestor = target; ancestor; ancestor = ancestor.parent) if (ancestor.visible === false) return false
      if (reflected && mayReflect(target)) return true
      const revision = getRevision?.()
      if (revision !== cachedRevision) {
        cachedRevision = revision
        boundsCache = new WeakMap()
      }
      const camera = getCamera?.(target)
      if (!camera?.projectionMatrix || !target.matrixWorld) return true
      let radius = boundsCache.get(target)
      if (radius === undefined) {
        radius = boundRadius(target)
        boundsCache.set(target, radius)
      }
      if (!Number.isFinite(radius)) return true
      target.updateWorldMatrix(true, false)
      camera.updateMatrixWorld()
      sphere.center.set(0, 0, 0)
      sphere.radius = radius + padding
      sphere.applyMatrix4(target.matrixWorld)
      // 稍微收缩投影矩阵，避免贴边对象在剔除边界上闪烁。
      projectionMatrix.copy(camera.projectionMatrix)
      for (const elementIndex of [0, 4, 8, 12, 1, 5, 9, 13]) projectionMatrix.elements[elementIndex] *= 0.9
      return frustum
        .setFromProjectionMatrix(projectionMatrix.multiply(camera.matrixWorldInverse))
        .intersectsSphere(sphere)
    },
    invalidate() {
      boundsCache = new WeakMap()
      cachedRevision = undefined
    },
  }
}
