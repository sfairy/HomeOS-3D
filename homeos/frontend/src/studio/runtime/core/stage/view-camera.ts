/**
 * 浏览手势 → 相机（0.8.9）。
 *
 * `installViewGestures` 只产出**意图**（rotate / pan / zoom），这里把意图落到
 * `OrbitControls` 上。单独成模块的理由：
 *
 * - `stage.ts` 不导入 three（它靠 `mountOptions` 抽象），这里也不导入 —— 只依赖
 *   `{ position, target }` 这两个**鸭子类型的向量**，所以能在 node 里直接断言；
 * - 旋转/平移/缩放的数学错了的表现是「方向反了 / 画面跑偏 / 缩放穿过地板」，
 *   这类错误肉眼能看但很难定位，必须能重放。
 *
 * 三个约束：
 *
 * 1. **旋转绕 Y 轴 + 限制俯仰**：不允许翻到地面以下（`minPolar` 默认 0.08 rad ≈ 4.6°）；
 * 2. **平移沿地面**（XZ 平面）：拖动画布时用户期望「推动这张图纸」，而不是沿相机上方向
 *    把视角抬起来；
 * 3. **缩放按比例而不是按距离**：`factor` 是乘数，因此连续滚轮是等比累积，两端不会突变。
 */

/** 三维向量（只读用途；`three.Vector3` 满足这个形状）。 */
export type Vec3Like = { x: number; y: number; z: number }

/** 相机控制的最小接口（`OrbitControls` 满足）。 */
export type OrbitLike = { position: Vec3Like; target: Vec3Like }

/**
 * 俯仰限制。
 *
 * 两个值都以「目标所在水平面」为界：`polar < π/2` 时相机在面上方。
 * 因此上界取 `π/2 - 0.08`（离水平面 4.6°），**不是** `π - 0.08` ——
 * 后者会让相机翻到地面以下（y 变成负数），画面里地板消失、只剩背面。
 */
export const VIEW_CAMERA_MIN_POLAR = 0.08
export const VIEW_CAMERA_MAX_POLAR = Math.PI / 2 - 0.08

/** 缩放的最近 / 最远距离（米）。太近会穿进墙体，太远整个户型变成一个小点。 */
export const VIEW_CAMERA_MIN_DISTANCE = 1.2
export const VIEW_CAMERA_MAX_DISTANCE = 240

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/** 把值写回向量（兼容 `Vector3` 的 set 与纯对象）。 */
function writeVec(target: Vec3Like, x: number, y: number, z: number): void {
  const mutable = target as Vec3Like & { set?: (x: number, y: number, z: number) => void }
  if (typeof mutable.set === 'function') mutable.set(x, y, z)
  else Object.assign(mutable, { x, y, z })
}

/** `position - target`。 */
export function cameraOffset(orbit: OrbitLike): Vec3Like {
  return {
    x: orbit.position.x - orbit.target.x,
    y: orbit.position.y - orbit.target.y,
    z: orbit.position.z - orbit.target.z,
  }
}

/** 相机到目标的距离。 */
export function cameraDistance(orbit: OrbitLike): number {
  const offset = cameraOffset(orbit)
  return Math.hypot(offset.x, offset.y, offset.z)
}

/**
 * 绕目标**水平**旋转 + 俯仰。
 *
 * @param azimuthDelta 水平角增量（弧度，正为逆时针俯视）
 * @param polarDelta   俯仰增量（弧度，正为抬高相机）
 * @returns 是否真的改变（距离为 0 时无法确定方位角，返回 false）
 */
export function rotateCamera(
  orbit: OrbitLike,
  azimuthDelta: number,
  polarDelta: number,
  minPolar = VIEW_CAMERA_MIN_POLAR,
  maxPolar = VIEW_CAMERA_MAX_POLAR,
): boolean {
  const offset = cameraOffset(orbit)
  const radius = Math.hypot(offset.x, offset.y, offset.z)
  if (!(radius > 1e-6) || !Number.isFinite(azimuthDelta) || !Number.isFinite(polarDelta)) return false
  const azimuth = Math.atan2(offset.x, offset.z) + azimuthDelta
  // `acos(y / r)` 是「从 +Y 轴量起」的极角：0 在正上方，π 在正下方。
  const polar = clamp(Math.acos(clamp(offset.y / radius, -1, 1)) + polarDelta, minPolar, maxPolar)
  const horizontal = Math.sin(polar) * radius
  writeVec(
    orbit.position,
    orbit.target.x + Math.sin(azimuth) * horizontal,
    orbit.target.y + Math.cos(polar) * radius,
    orbit.target.z + Math.cos(azimuth) * horizontal,
  )
  return true
}

/**
 * 沿地面平移（相机与目标一起移动）。
 *
 * `dx` / `dy` 是**屏幕方向**的位移（右 / 下为正），内部换算成世界方向：
 * - 右 = 相机朝向叉乘世界 up；
 * - 前 = 相机朝向投影到地面。
 *
 * 这样无论视角转到哪个方向，拖动都是「跟着手指推画布」。
 */
export function panCamera(orbit: OrbitLike, dx: number, dy: number): boolean {
  const offset = cameraOffset(orbit)
  const horizontalLength = Math.hypot(offset.x, offset.z)
  if (!(horizontalLength > 1e-6) || !Number.isFinite(dx) || !Number.isFinite(dy)) return false
  // 相机指向目标的地面方向（单位化）。
  const forwardX = -offset.x / horizontalLength
  const forwardZ = -offset.z / horizontalLength
  // 右方向 = 前方向绕 Y 轴顺时针 90°：(x,z) → (-z, x)。
  const rightX = -forwardZ
  const rightZ = forwardX
  // 画布跟随手指：手指往右，内容往右 → 相机往左（所以 `dx` 取负）。
  // 手指往下，内容往下 → 相机沿视线前进（所以 `dy` 取正）。
  const moveX = -rightX * dx + forwardX * dy
  const moveZ = -rightZ * dx + forwardZ * dy
  writeVec(orbit.target, orbit.target.x + moveX, orbit.target.y, orbit.target.z + moveZ)
  writeVec(orbit.position, orbit.position.x + moveX, orbit.position.y, orbit.position.z + moveZ)
  return true
}

/**
 * 缩放：按比例改变相机到目标的距离。
 *
 * `factor > 1` 拉远、`< 1` 拉近。夹取到 `[MIN_DISTANCE, MAX_DISTANCE]`，
 * 因此连续滚轮到底后会停住，而不是把相机推到无穷远或穿进地面。
 */
export function zoomCamera(
  orbit: OrbitLike,
  factor: number,
  minDistance = VIEW_CAMERA_MIN_DISTANCE,
  maxDistance = VIEW_CAMERA_MAX_DISTANCE,
): boolean {
  if (!Number.isFinite(factor) || factor <= 0) return false
  const offset = cameraOffset(orbit)
  const distance = Math.hypot(offset.x, offset.y, offset.z)
  if (!(distance > 1e-6)) return false
  const next = clamp(distance * factor, minDistance, maxDistance)
  if (Math.abs(next - distance) < 1e-9) return false
  const ratio = next / distance
  writeVec(
    orbit.position,
    orbit.target.x + offset.x * ratio,
    orbit.target.y + offset.y * ratio,
    orbit.target.z + offset.z * ratio,
  )
  return true
}

/** 把一次手势意图应用到相机；返回相机是否变了（宿主据此决定要不要重绘）。 */
export function applyViewGestureIntent(
  orbit: OrbitLike,
  intent: { kind: 'rotate' | 'pan' | 'zoom'; dx: number; dy: number; scale: number },
): boolean {
  if (intent.kind === 'rotate') return rotateCamera(orbit, intent.dx, intent.dy)
  if (intent.kind === 'pan') return panCamera(orbit, intent.dx, intent.dy)
  return zoomCamera(orbit, intent.scale)
}
