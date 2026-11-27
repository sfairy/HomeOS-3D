/**
 * 车辆四门 / 前备箱 / 后备箱的开合动画（0.9.0 `car-opening-motion.js`）。
 *
 * ## 为什么需要独立的可动件模型
 *
 * 车身是一整块网格，门/舱盖不是它的子节点。上游把可动件拆成单独的
 * `car-openings.glb` / `suv-openings.glb`：每个可动件是**绕自身枢轴**的独立节点，
 * `extras` 里带 `vehicleOpening`（部件名）、`openingAxis`（`x` / `y`）、
 * `openingAngle`（全开时的弧度）。运行时按 `progress` 在 `0 … openingAngle` 之间插值。
 *
 * ## 挂载约定
 *
 * 开合件的根要带上**被绑定车辆**的 `environmentFloorId` / `environmentModelId`，
 * 这样同一个 (floorId, modelId) 才能把「车身」与「可动件」配成一对。
 *
 * ## 时长
 *
 * 舱盖（`hood` / `tail`）730ms，车门 530ms —— 门更短更利落；两者都按 `√|Δ|` 缩放，
 * 缓动 `t²(3−2t)`（与驶离动画同一曲线，视觉上一致）。
 */

import { CAR_OPENING_PARTS, carOpeningMappingError, carOpeningReading } from './vehicle'

/** 舱盖（前备箱 / 后备箱）的单段时长。 */
export const CAR_OPENING_LID_MS = 730

/** 车门的单段时长。 */
export const CAR_OPENING_DOOR_MS = 530

/** 开合角度插值曲线：与驶离动画一致的两端平滑。 */
export function carOpeningEase(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return clamped * clamped * (3 - 2 * clamped)
}

/** 该部件的单段时长。 */
export function carOpeningDuration(part: string): number {
  return part === 'hood' || part === 'tail' ? CAR_OPENING_LID_MS : CAR_OPENING_DOOR_MS
}

/** 可动件节点上的元数据（来自 GLB 的 `extras`）。 */
type CarOpeningNode = {
  node: any
  part: string
  axis: 'x' | 'y'
  /** 全开角度（弧度）。 */
  angle: number
  floorId?: string
  /** 是否属于主根（保留根上的副本不参与补间）。 */
  resident: boolean
}

type CarOpeningMotion = { from: number; target: number; start: number; duration: number }

type CarOpeningEntry = {
  signature: string
  /** 上一次的读数：`null` 表示未匹配。 */
  known: boolean | null
  /** 0 = 关闭、1 = 全开。 */
  amount: number
  motion: CarOpeningMotion | null
}

/** 一条车辆的绑定（含六块开合件配置）。 */
export type CarOpeningBinding = {
  id?: string
  floorId?: string
  modelId?: string
  openings?: Partial<Record<string, { openingEntityId?: string; states?: { open?: string[]; closed?: string[] } }>>
}

export type CarOpeningOptions = {
  setRenderObjects?: (renderObjects: unknown[]) => void
  requestFrame?: () => void
  /** three 命名空间（只为 `Box3` 记录改前包围盒；缺省时不记录）。 */
  THREE?: any
  now?: () => number
}

export function createCarOpeningMotion({
  setRenderObjects: setRenderObjects = () => {},
  requestFrame: requestFrame = () => {},
  THREE,
  now: now = () => performance.now(),
}: CarOpeningOptions = {}) {
  let entries = new Map<string, Map<string, CarOpeningEntry>>(),
    openingIndex = new Map<string, CarOpeningNode[]>(),
    indexedRoots: any[] = [],
    indexedRevision: any,
    movingNodes: any[] = [],
    lastSceneId: any,
    lastHaSource: any,
    isDisposed = false

  const modelKey = (floorId: unknown, modelId: unknown) => String(floorId ?? '') + '/' + String(modelId ?? '')

  /** 重建「(floorId, modelId) → 可动件节点表」。 */
  function reindexOpenings(rootList: any[], revision: any) {
    if (
      revision === indexedRevision &&
      rootList.length === indexedRoots.length &&
      rootList.every((candidate, index) => candidate === indexedRoots[index])
    )
      return
    ;(indexedRoots = rootList), (indexedRevision = revision), (openingIndex = new Map())
    rootList.forEach((root, rootIndex) => {
      root?.traverse?.((modelNode: any) => {
        const { environmentModelType, environmentFloorId, environmentModelId } = modelNode.userData || {}
        if (!environmentModelId) return
        // 开合件本身就是车模（`environmentModelType` 为 smallcar / suv），
        // 因此这里继续往下找带 `vehicleOpening` 的子节点。
        if (!['smallcar', 'suv'].includes(environmentModelType)) return
        const indexKey = modelKey(environmentFloorId, environmentModelId)
        modelNode.traverse?.((partNode: any) => {
          const { vehicleOpening, openingAxis, openingAngle } = partNode.userData || {}
          if (
            !Object.hasOwn(CAR_OPENING_PARTS, vehicleOpening) ||
            (openingAxis !== 'x' && openingAxis !== 'y') ||
            !Number.isFinite(openingAngle)
          )
            return
          const nodeList = openingIndex.get(indexKey) || []
          openingIndex.has(indexKey) || openingIndex.set(indexKey, nodeList)
          nodeList.push({
            node: partNode,
            part: vehicleOpening,
            axis: openingAxis,
            angle: openingAngle,
            floorId: environmentFloorId,
            // 只有主根（索引 0）上的副本参与补间：保留根是「备用的同一辆车」，
            // 让它跟着开门会在画面里出现两辆同时在动的车。
            resident: rootIndex === 0,
          })
        })
      })
    })
  }

  /** 把某个可动件转到目标角度；返回是否真的改了。 */
  function applyRotation(partNode: CarOpeningNode, amount: number, isMoving: boolean, changes: any[]): void {
    const targetRotation = amount === 0 ? 0 : partNode.angle * amount,
      currentRotation = partNode.node.rotation[partNode.axis],
      poseChanged = currentRotation !== targetRotation,
      movingChanged = !!partNode.node.userData.__hbOpeningMoving !== isMoving
    if (!poseChanged && !movingChanged) return
    // 角度变了：先把世界矩阵补齐，再记录改前的包围盒（阴影 / 遮挡要据此重算）。
    let previousBounds: any = null
    if (poseChanged && partNode.node.parent && THREE?.Box3) {
      partNode.node.updateWorldMatrix(true, false)
      previousBounds = new THREE.Box3().setFromObject(partNode.node)
    }
    ;(partNode.node.rotation[partNode.axis] = targetRotation),
      partNode.node.updateMatrix(),
      (partNode.node.userData.__hbOpeningMoving = isMoving),
      changes.push({ model: partNode.node, floorId: partNode.floorId, moving: isMoving, previousBounds })
  }

  /** 把当前 progress 写到所有可动件上。 */
  function applyAll(): boolean {
    const changes: any[] = [],
      nextMovingNodes: any[] = []
    for (const [indexKey, nodeList] of openingIndex) {
      const entryMap = entries.get(indexKey)
      if (!entryMap) continue
      for (const partNode of nodeList) {
        const entry = entryMap.get(partNode.part)
        if (!entry) continue
        // 只有主根上的副本参与补间：保留根（备用的同款车）跟着走会让画面出现两辆车在开门。
        const isMoving = partNode.resident && !!entry.motion
        applyRotation(partNode, entry.amount, isMoving, changes)
        isMoving && nextMovingNodes.push(partNode.node)
      }
    }
    // 上一帧在动、这一帧不在动的节点也要收一次尾（把角度归到终点）。
    for (const previousNode of movingNodes)
      !nextMovingNodes.includes(previousNode) && (previousNode.userData.__hbOpeningMoving = false)
    nextMovingNodes.length === movingNodes.length &&
    nextMovingNodes.every((candidate, index) => candidate === movingNodes[index])
      ? undefined
      : ((movingNodes = nextMovingNodes), setRenderObjects(nextMovingNodes))
    changes.length && requestFrame()
    return changes.length > 0
  }

  return {
    sync({
      root: rootModel,
      retainedRoots: retainedModelRoots = [],
      revision: sceneRevision,
      sceneId: currentSceneId,
      haSource: currentHaSource = '',
      bindings: openingBindings = [],
      states: entityStates = {},
      editing: isEditing = false,
      preview: openingPreview = null,
      canAnimate: canAnimateBinding = () => true,
      time: timestamp = now(),
    }: {
      root?: any
      retainedRoots?: any[]
      revision?: any
      sceneId?: any
      haSource?: string
      bindings?: readonly CarOpeningBinding[]
      states?: Record<string, any>
      editing?: boolean
      /** 配置面预览：`{ id, parts: { [part]: boolean } }`。 */
      preview?: { id?: string; parts?: Record<string, boolean> } | null
      canAnimate?: (binding: CarOpeningBinding) => boolean
      time?: number
    }): void {
      if (isDisposed) return
      if (!entries.size && !openingPreview && !openingBindings.some((binding) => binding.openings)) return
      reindexOpenings([rootModel, ...retainedModelRoots].filter(Boolean), sceneRevision)

      const sameSource = lastSceneId === currentSceneId && lastHaSource === currentHaSource,
        previousEntries = sameSource ? entries : new Map<string, Map<string, CarOpeningEntry>>()
      ;(lastSceneId = currentSceneId), (lastHaSource = currentHaSource)

      const nextEntries = new Map<string, Map<string, CarOpeningEntry>>()
      for (const binding of openingBindings) {
        const indexKey = modelKey(binding.floorId, binding.modelId),
          isPreviewTarget = isEditing && !!openingPreview && openingPreview.id === binding.id
        // 编辑态只预览当前选中的那台车；其余车辆保持几何默认姿态。
        if (isEditing ? !isPreviewTarget : !binding.openings) continue
        const partEntries = new Map<string, CarOpeningEntry>()
        for (const part of Object.keys(CAR_OPENING_PARTS)) {
          const partConfig = binding.openings?.[part]
          // 非预览时，未配置或配置有错的部件直接跳过（不动作，也不占用动画名额）。
          if (!isPreviewTarget && (!partConfig || carOpeningMappingError(partConfig))) continue
          const previewOpen = openingPreview?.parts?.[part]
          if (isPreviewTarget && previewOpen === undefined) continue

          const signature = JSON.stringify([
              binding.id,
              isPreviewTarget ? 'preview' : partConfig?.openingEntityId,
              isPreviewTarget ? null : (partConfig?.states ?? null),
            ]),
            previousPartEntry = previousEntries.get(indexKey)?.get(part),
            entry: CarOpeningEntry =
              previousPartEntry?.signature === signature
                ? previousPartEntry
                : { signature, known: null, amount: 0, motion: null }

          // 预览时 `parts[part]` 就是目标开合；正常运行时走三态读数。
          const openReading = isPreviewTarget
              ? previewOpen === true
              : carOpeningReading(partConfig, entityStates, currentHaSource).open,
            // `null` = 未匹配：保持上次判定，不动作。
            isKnown = openReading !== null,
            targetAmount = openReading === true ? 1 : 0,
            // 只有主根上真有这件可动件时才补间，否则算出来的运动没人消费。
            hasResidentNode = (openingIndex.get(indexKey) || []).some(
              (partNode) => partNode.part === part && partNode.resident,
            ),
            canTween = hasResidentNode && !isEditing && canAnimateBinding(binding),
            isValueChanged = isKnown && openReading !== entry.known
          if (isKnown) entry.known = openReading
          if (canTween && isValueChanged && entry.amount !== targetAmount) {
            entry.motion = {
              from: entry.amount,
              target: targetAmount,
              start: timestamp,
              duration: carOpeningDuration(part) * Math.sqrt(Math.abs(targetAmount - entry.amount)),
            }
          } else if (!canTween || !entry.motion || entry.motion.target !== targetAmount) {
            // 不允许动画 / 没有在途补间 / 目标被改：直接落位。
            entry.amount = targetAmount
            entry.motion = null
          }
          partEntries.set(part, entry)
        }
        partEntries.size && nextEntries.set(indexKey, partEntries)
      }
      entries = nextEntries
      applyAll()
      entries.size || (openingIndex = new Map())
    },

    tick(timestamp: number = now()): void {
      if (isDisposed || !movingNodes.length) return
      for (const entryMap of entries.values())
        for (const entry of entryMap.values()) {
          const motion = entry.motion
          if (!motion) continue
          const rawProgress = Math.max(0, Math.min(1, (timestamp - motion.start) / motion.duration))
          entry.amount = motion.from + (motion.target - motion.from) * carOpeningEase(rawProgress)
          rawProgress === 1 && (entry.motion = null)
        }
      applyAll()
    },

    /** 有可动件在动 → 下一帧；否则休眠。 */
    nextDelay(): number {
      return movingNodes.length ? 0 : Infinity
    },

    dispose() {
      if (isDisposed) return
      ;(isDisposed = true), entries.clear(), openingIndex.clear(), (indexedRoots = []), (movingNodes = [])
      setRenderObjects([])
    },
  }
}
