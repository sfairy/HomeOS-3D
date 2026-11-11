/**
 * 相机/物体位姿的零分配变更检测。
 *
 * 渲染热路径上原来每帧把 `matrixWorld.elements` 与 `projectionMatrix.elements` `join(',')`
 * 成字符串再比较：两条 16 元素矩阵每帧生成 ~600 字节的临时串，只为判断「动了没有」。
 * 这里按元素拷进一块固定的 Float64Array 比较，变化时把版本号 +1。
 */

type MatrixLike = { elements: ArrayLike<number> }

export type MatrixPoseTracker = {
  /** 读入当前矩阵；与上次读入不同则版本号 +1。返回当前版本号。 */
  observe: (first: MatrixLike, second?: MatrixLike | null) => number
  /** 当前版本号（未 observe 过时为 0）。 */
  readonly version: number
  /** 最近一次 observe 的矩阵内容拼成的稳定字符串；仅供跨会话持久化键使用，不要放进每帧路径。 */
  key: () => string
}

export function createMatrixPoseTracker(): MatrixPoseTracker {
  const snapshot = new Float64Array(32)
  let length = 0
  let version = 0

  const copyIfChanged = (matrix: MatrixLike | null | undefined, offset: number, changed: boolean) => {
    const elements = matrix?.elements
    if (!elements) return changed
    for (let index = 0; index < 16; index++) {
      const value = elements[index]
      if (snapshot[offset + index] !== value) {
        snapshot[offset + index] = value
        changed = true
      }
    }
    return changed
  }

  return {
    observe(first, second) {
      const nextLength = second ? 32 : 16
      let changed = version === 0 || nextLength !== length
      length = nextLength
      changed = copyIfChanged(first, 0, changed)
      if (second) changed = copyIfChanged(second, 16, changed)
      if (changed) version++
      return version
    },
    get version() {
      return version
    },
    /** 与旧的 `a.elements.join(',') + b.elements.join(',')` 逐字相同（两段之间没有分隔符）。 */
    key() {
      const first = Array.prototype.join.call(snapshot.subarray(0, 16), ',')
      return length === 32 ? first + Array.prototype.join.call(snapshot.subarray(16, 32), ',') : first
    },
  }
}
