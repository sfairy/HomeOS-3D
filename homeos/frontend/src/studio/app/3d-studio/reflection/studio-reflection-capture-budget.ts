/**
 * 「本帧重捕哪几条地面反射记录」的判定。
 *
 * 两种帧的口径必须分开：
 * - 相机位姿变化（拖拽旋转 / 平移）：必须整批重捕。按记录轮转会让排在预算外的记录继续
 *   用上一帧纹理，相邻楼层的倒影就停在不同的相机位姿上 —— 旋转时整片地面互相错位，
 *   看起来就是倒影「甩尾」/ 拖影。ab5432b0a 之前本来是每帧全捕，所以那时没有这个现象。
 * - 相机没动、只是场景 / 灯光变脏：按每帧预算轮转，避免 presented 相位一次撞满所有记录
 *   造成长阻塞；被推迟的记录沿用上一帧纹理（相机没动，位姿一致，肉眼看不出）。
 */

interface CaptureSelection<T> {
  /** 本帧要重捕的记录。 */
  records: T[]
  /** 下一次轮转的起点，保证排在后面的记录不会长期饿死。 */
  rotation: number
  /** 本帧被推迟的记录数：>0 时收尾必须继续 requestFrame。 */
  deferred: number
}

/**
 * 从变脏的记录里挑出本帧要重捕的那一批。
 *
 * @param records 本帧变脏的记录（已按 eligibility 过滤）。
 * @param budget 每帧最多重捕多少条（至少 1）。
 * @param rotation 轮转起点。
 * @param cameraChanged 相机位姿是否变化：为真时整批捕获，不能轮转。
 */
export function selectFrameCaptures<T>(
  records: readonly T[],
  { budget, rotation, cameraChanged }: { budget: number; rotation: number; cameraChanged: boolean },
): CaptureSelection<T> {
  if (cameraChanged || records.length <= Math.max(1, Math.floor(budget)))
    return { records: [...records], rotation, deferred: 0 }
  const end = Math.max(1, Math.floor(budget)),
    start = ((Math.floor(rotation) % records.length) + records.length) % records.length,
    picked: T[] = []
  for (let pickedIndex = 0; pickedIndex < end; pickedIndex += 1)
    picked.push(records[(start + pickedIndex) % records.length])
  return {
    records: picked,
    rotation: (start + end) % records.length,
    deferred: records.length - picked.length,
  }
}
