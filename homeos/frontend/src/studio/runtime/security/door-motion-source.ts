/**
 * 门扇的**动画来源**与**动画类型**判定（0.9.0 `lock-motion.js` 的重构口径）。
 *
 * ## 为什么要把「来源」抽象出来
 *
 * 0.8.x 用一组并列字段描述门扇怎么动：`doorSource`（`single-event` / `dual-event`）、
 * `doorEntityId`、`doorOpenEntityId`、`doorCloseEntityId`、`doorEventEntityId` 各管一段。
 * 加一种来源就要在每处 `if` 里再补一个分支，最终没人能说清「这扇门到底由谁驱动」。
 *
 * 0.9.0 收敛成两个概念：
 *
 * - **`motionSource`**：`auto` / `opener` / `contact` —— 「谁是动画的权威」；
 * - **`contactIdentity`**：门磁的身份（确认用），与「谁驱动」解耦。
 *
 * 旧文档里的 `doorSource` 仍然认，落到同一套判定里（见 `legacyMotionSource`），
 * 这样存量户型不需要迁移。
 *
 * ## 三类动画类型
 *
 * - `entry` / `static`：平开（绕铰链）/ 不动；
 * - `sliding`：推拉（平移）；
 * - `roller`：卷帘（**绕顶部轴卷收**，不是上下平移 —— 见 `rollerPose`）。
 */

/** 动画来源枚举（与后端 `DOOR_OPENER_MOTION_SOURCES` 同值）。 */
export const DOOR_MOTION_SOURCES = ['auto', 'opener', 'contact'] as const

export type DoorMotionSource = (typeof DOOR_MOTION_SOURCES)[number]

/** 动画类型：平开 / 推拉 / 卷帘 / 不动。 */
export const DOOR_ANIMATION_TYPES = ['entry', 'sliding', 'roller', 'static'] as const

export type DoorAnimationType = (typeof DOOR_ANIMATION_TYPES)[number]

/** 归一化 `motionSource`：未知值按 `auto`（与后端默认一致）。 */
export function normalizeDoorMotionSource(motionSource: unknown): DoorMotionSource {
  return typeof motionSource === 'string' && (DOOR_MOTION_SOURCES as readonly string[]).includes(motionSource)
    ? (motionSource as DoorMotionSource)
    : 'auto'
}

/** 归一化 `doorAnimationType`：未知值按 `entry`（0.8.x 的门全是平开）。 */
export function normalizeDoorAnimationType(animationType: unknown): DoorAnimationType {
  return typeof animationType === 'string' && (DOOR_ANIMATION_TYPES as readonly string[]).includes(animationType)
    ? (animationType as DoorAnimationType)
    : 'entry'
}

/**
 * 旧文档的 `doorSource` → 新口径。
 *
 * `single-event` / `dual-event` 都是「靠事件实体判断开合」，语义上归 `contact`；
 * 其余（含缺省）交给 `auto` 自己挑。
 */
export function legacyMotionSource(doorSource: unknown): DoorMotionSource {
  return doorSource === 'single-event' || doorSource === 'dual-event' ? 'contact' : 'auto'
}

/** 一路来源的读数：`openRatio` 为 `null` 表示这一路给不出确定答案。 */
export type DoorSourceReading = { identity: string; openRatio: number | null }

export type DoorMotionResolution = {
  /** 最终采用哪一路；`none` = 两路都不可用，动画保持当前姿态。 */
  source: 'opener' | 'contact' | 'none'
  /** 采纳的身份（实体 id）。 */
  identity: string
  /** 采纳的开合比例 0–1；`null` = 未知。 */
  openRatio: number | null
  /** 是否由 `auto` 自动挑的（供面板显示「自动识别为…」）。 */
  automatic: boolean
}

/**
 * 决定这扇门用哪一路驱动。
 *
 * `auto` 的优先级与开窗器同口径：**有位置回报的优先**。门机（开窗器式行程）能给出
 * 连续位置，门磁只有开/关两态，所以 `opener` 有确定读数时优先用它 —— 门半开时
 * 只有门机能如实表现。
 *
 * 显式选了某一路但该路没绑定时**不静默回退**：返回 `none`，让面板显示
 * 「门扇动画会保留当前姿态」而不是偷偷换成另一路（那样用户会以为配置生效了）。
 */
export function resolveDoorMotion(
  doorConfig: {
    motionSource?: unknown
    doorSource?: unknown
    doorEntityId?: unknown
  },
  readings: { opener?: DoorSourceReading | null; contact?: DoorSourceReading | null },
): DoorMotionResolution {
  const explicitSource =
      doorConfig?.motionSource === undefined ? null : normalizeDoorMotionSource(doorConfig.motionSource),
    motionSource = explicitSource ?? legacyMotionSource(doorConfig?.doorSource),
    openerReading = readings.opener ?? null,
    // 旧文档没有 `contactIdentity`，门磁身份就是 `doorEntityId`。
    contactReading =
      readings.contact ??
      (typeof doorConfig?.doorEntityId === 'string' && doorConfig.doorEntityId
        ? { identity: doorConfig.doorEntityId, openRatio: null }
        : null)
  if (motionSource === 'opener')
    return {
      source: openerReading ? 'opener' : 'none',
      identity: openerReading?.identity ?? '',
      openRatio: openerReading?.openRatio ?? null,
      automatic: false,
    }
  if (motionSource === 'contact')
    return {
      source: contactReading ? 'contact' : 'none',
      identity: contactReading?.identity ?? '',
      openRatio: contactReading?.openRatio ?? null,
      automatic: false,
    }
  // auto：有确定读数的优先，opener 在前。
  const candidateReadings: Array<['opener' | 'contact', DoorSourceReading | null]> = [
    ['opener', openerReading],
    ['contact', contactReading],
  ]
  for (const [candidateSource, candidateReading] of candidateReadings)
    if (candidateReading && candidateReading.openRatio !== null)
      return {
        source: candidateSource,
        identity: candidateReading.identity,
        openRatio: candidateReading.openRatio,
        automatic: true,
      }
  // 都不确定：仍选一路「已绑定」的，让面板能显示状态，但比例交给调用方保持原姿态。
  for (const [candidateSource, candidateReading] of candidateReadings)
    if (candidateReading)
      return {
        source: candidateSource,
        identity: candidateReading.identity,
        openRatio: null,
        automatic: true,
      }
  return { source: 'none', identity: '', openRatio: null, automatic: true }
}

/** 卷帘的两种收放姿态。 */
export type DoorRollerPose = {
  /** 竖直平移量（米，向下为正）——无 pivot 时用。 */
  translation: number
  /** 绕顶部轴的转角（弧度）——有 pivot 时用。 */
  rotation: number
  /** 竖直缩放：平移模式用缩高假装「卷上去」，pivot 模式恒为 1。 */
  scaleY: number
}

/**
 * 卷帘按比例算姿态。
 *
 * 平移 + 缩高只是**近似**：真实卷帘是帘片绕顶部轴一圈圈卷起来，中段会看到弧度。
 * 0.9.0 带 `doorRollerPivot` 的模型改真转（`rotation`），没有 pivot 的旧模型继续
 * 用平移近似 —— 否则旧模型会绕错轴、看起来像整扇门在翻。
 *
 * @param openRatio     0 = 全关、1 = 全开
 * @param openTranslation 全开时的竖直位移（米）
 * @param openRotation  全开时的转角（弧度），只有 pivot 模式用
 * @param hasRollerPivot 模型是否带顶部枢轴
 */
export function rollerPose(
  openRatio: number,
  openTranslation: number,
  openRotation: number,
  hasRollerPivot: boolean,
): DoorRollerPose {
  const clampedRatio = Math.min(1, Math.max(0, Number.isFinite(openRatio) ? openRatio : 0)),
    translation = (Number.isFinite(openTranslation) ? openTranslation : 0) * clampedRatio
  if (!hasRollerPivot) return { translation, rotation: 0, scaleY: Math.max(0.001, 1 - clampedRatio) }
  return { translation: 0, rotation: (Number.isFinite(openRotation) ? openRotation : 0) * clampedRatio, scaleY: 1 }
}
