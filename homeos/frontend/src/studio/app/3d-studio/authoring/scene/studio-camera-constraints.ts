export const MAX_CAMERA_POLAR_ANGLE = Math.PI * 0.49
const minTargetHeight = 0.02,
  maxPolarCosine = Math.cos(MAX_CAMERA_POLAR_ANGLE)
export function constrainCameraPosition(position: any, target: any) {
  const deltaX = position.x - target.x,
    deltaY = position.y - target.y,
    deltaZ = position.z - target.z,
    distance = Math.max(Math.hypot(deltaX, deltaY, deltaZ), 0.001),
    minHeight = Math.max(distance * maxPolarCosine, minTargetHeight - target.y)
  if (deltaY >= minHeight - 1e-9) return false
  const horizontalDistance = Math.hypot(deltaX, deltaZ),
    maxDistance = Math.max(distance, minHeight),
    lateralDistance = Math.sqrt(Math.max(0, maxDistance * maxDistance - minHeight * minHeight))
  return (
    (position.x = target.x + (horizontalDistance > 1e-9 ? deltaX / horizontalDistance : 0) * lateralDistance),
    (position.z = target.z + (horizontalDistance > 1e-9 ? deltaZ / horizontalDistance : 1) * lateralDistance),
    (position.y = target.y + minHeight),
    true
  )
}
export function constrainCameraPose(pose: any) {
  if (!pose) return pose
  const [positionX, positionY, positionZ] = pose.position,
    [targetX, targetY, targetZ] = pose.target,
    nextPosition = {
      x: positionX,
      y: positionY,
      z: positionZ,
    }
  return constrainCameraPosition(nextPosition, {
    x: targetX,
    y: targetY,
    z: targetZ,
  })
    ? {
        ...pose,
        position: [nextPosition.x, nextPosition.y, nextPosition.z],
      }
    : pose
}

/**
 * 透视视锥限制（0.8.9 `createPerspectiveViewLimit`）：返回一个可复用的「限位器」。
 *
 * 与 `constrainCameraPose` 的区别只是形状：那个是纯函数（输入位姿 → 输出位姿），
 * 这个是闭包（记住上一次合法位姿），供相机连续拖动时逐帧调用。
 */
export function createPerspectiveViewLimit(initial: Record<string, unknown> = {}) {
  let last = { ...initial }
  return {
    apply(pose: Record<string, unknown>) {
      last = constrainCameraPose({ ...last, ...pose })
      return last
    },
    get current() {
      return last
    },
  }
}

/** 可见视图面（0.8.9 `visibleViewSurface`）：相机在该位姿下能看到的地面覆盖率（0..1）。 */
export function visibleViewSurface(pose: {
  position?: { x?: number; y?: number; z?: number }
  target?: { x?: number; y?: number; z?: number }
}): number {
  const cameraHeight = Math.abs(Number(pose?.position?.y ?? 0) - Number(pose?.target?.y ?? 0))
  if (!Number.isFinite(cameraHeight) || cameraHeight <= 0) return 0
  // 视角越斜、越贴近地面，可见面越大；用 1 - 1/(1+h) 做饱和曲线，h 以米计。
  return Math.min(1, cameraHeight / (cameraHeight + 1))
}
