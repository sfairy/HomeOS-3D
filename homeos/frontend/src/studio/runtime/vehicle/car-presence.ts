/**
 * 车辆「在家 / 离家」的驶离与倒回动画（0.9.0 `car-presence.js`）。
 *
 * ## 语义
 *
 * `progress 0` = 停在本位（在家），`1` = 已驶离（离家）。车**不在远处停留**：
 * 驶离动画播完就把车模隐藏，回来时从本位重新出现 —— 否则远景里会多出一台浮空的车。
 *
 * ## 为什么单独成控制器
 *
 * 它必须与其余动画共用同一条节流通道（`setRenderObjects` → 反射 / 阴影重算），
 * 并且要在**编辑态**下直接落位、不补间：编辑器里拖家具时车在动会让人以为拖错了对象。
 *
 * ## 与上游的字面差异
 *
 * 上游是混淆产物，部分字符串偏移已不可靠；本实现保留**全部可核实的数值**：
 * 位移 `clamp(车长 × 1.1, 1.2, 6)`、时长 `(驶离 1350ms / 回来 1600ms) × √|Δprogress|`、
 * 缓动 `t²(3−2t)`，以及「无动画时 `nextDelay` 返回 `Infinity`」的休眠约定。
 */

import { carPresenceMappingError, carPresenceReading } from './vehicle'

/** 驶离（在家 → 离家）的基础时长。 */
export const CAR_PRESENCE_AWAY_MS = 1350

/** 归来（离家 → 在家）的基础时长。比驶离长一档，视觉上更「稳」。 */
export const CAR_PRESENCE_HOME_MS = 1600

/** 车模位移长度上限（米）。 */
export const CAR_PRESENCE_MAX_DISTANCE_M = 6

/** 车模位移长度下限（米）。 */
export const CAR_PRESENCE_MIN_DISTANCE_M = 1.2

/** 位移 = 车长 × 该系数（留出一点余量，避免车头刚好顶到墙）。 */
export const CAR_PRESENCE_DISTANCE_RATIO = 1.1

/** 车型缺省车长（米）：没有注册表信息时的兜底。 */
export const DEFAULT_VEHICLE_LENGTH_M = 4.8

/** 哪些模型类型算「车」。与 `supportsCarOpenings` 同源，但电瓶车也支持驶离。 */
export const CAR_PRESENCE_MODEL_TYPES: readonly string[] = Object.freeze(['smallcar', 'suv', 'scooter'])

/** 平滑缓动 `t²(3−2t)`：两端速度为 0，起步与收尾都不突兀。 */
export function carPresenceEase(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return clamped * clamped * (3 - 2 * clamped)
}

/** 驶离/归来的时长（毫秒），随位移比例开方缩放。 */
export function carPresenceDuration(fromProgress: number, targetProgress: number): number {
  const baseMs = targetProgress === 1 ? CAR_PRESENCE_AWAY_MS : CAR_PRESENCE_HOME_MS
  return baseMs * Math.sqrt(Math.abs(targetProgress - fromProgress))
}

/** 车模驶离的位移（米）。 */
export function carPresenceDistance(vehicleLength?: number | null): number {
  const length =
    Number.isFinite(vehicleLength) && (vehicleLength as number) > 0
      ? (vehicleLength as number)
      : DEFAULT_VEHICLE_LENGTH_M
  return Math.min(
    CAR_PRESENCE_MAX_DISTANCE_M,
    Math.max(CAR_PRESENCE_MIN_DISTANCE_M, length * CAR_PRESENCE_DISTANCE_RATIO),
  )
}

/** 一条绑定（车辆配置）在舞台侧的输入。 */
export type CarPresenceBinding = {
  id?: string
  floorId?: string
  modelId?: string
  presenceEntityId?: string
  presenceStates?: { home?: string[]; away?: string[] }
}

type CarPresenceMotion = { from: number; target: number; start: number; duration: number }

/** 一台车模的位姿记录（同一辆车可能有多个副本：主场景 + 保留根）。 */
type CarPresencePose = {
  /** 本位（停在家时）的位置。首次出现时从模型当前位置抄下来。 */
  rest: any
  /** 上一帧应用过的位置：与模型当前位置不一致时说明有人外部挪过它，要重抄本位。 */
  applied: any
  /** 位移方向（单位向量，模型局部 +Z 经朝向旋转）。 */
  forward: any
  /** 该副本当前是否在动。 */
  moving: boolean
}

type CarPresenceEntry = {
  key: string
  floorId?: string
  /** 配置签名：绑定变化就重建补间状态，避免沿用旧目标。 */
  signature: string
  home: boolean | null
  progress: number
  motion: CarPresenceMotion | null
  distance: number
  poses: Map<any, CarPresencePose>
}

export type CarPresenceOptions = {
  requestFrame?: () => void
  setRenderObjects?: (renderObjects: unknown[]) => void
  /** 车长（米）。上游从摆放物品的 depth 取，这里让调用方注入。 */
  vehicleLength?: (binding: CarPresenceBinding) => number | null | undefined
  now?: () => number
}

export function createCarPresence({
  requestFrame: requestFrame = () => {},
  setRenderObjects: setRenderObjects = () => {},
  vehicleLength: vehicleLengthOf = () => null,
  now: now = () => performance.now(),
}: CarPresenceOptions = {}) {
  let entries = new Map<string, CarPresenceEntry>(),
    /** 模型 → (key, floorId)。同时存在同一辆车的多个副本。 */
    modelIndex = new Map<any, { key: string; floorId?: string }>(),
    indexedRoots: any[] = [],
    indexedRevision: any,
    movingModels: any[] = [],
    lastSceneId: any,
    lastHaSource: any,
    presentationRevision = 0,
    isDisposed = false

  const modelKey = (floorId: unknown, modelId: unknown) => String(floorId ?? '') + '/' + String(modelId ?? '')

  /** 重建「模型 → (floorId, modelId)」索引。根集合或版本变了才重建。 */
  function reindexModels(rootList: any[], revision: any) {
    if (
      revision === indexedRevision &&
      rootList.length === indexedRoots.length &&
      rootList.every((candidate, index) => candidate === indexedRoots[index])
    )
      return
    ;(indexedRoots = rootList), (indexedRevision = revision), (modelIndex = new Map())
    for (const root of rootList)
      root?.traverse?.((sceneObject: any) => {
        const { environmentModelType, environmentFloorId, environmentModelId } = sceneObject.userData || {}
        // 只认车模：其它环境模型带同样字段，误收会把地板/墙当车开走。
        if (!environmentModelId || !CAR_PRESENCE_MODEL_TYPES.includes(environmentModelType)) return
        modelIndex.set(sceneObject, {
          key: modelKey(environmentFloorId, environmentModelId),
          floorId: environmentFloorId,
        })
      })
  }

  /** 该 (floorId, modelId) 对应的模型是否在给定根之下（决定要不要为它补间）。 */
  function isUnderRoot(bindingKey: string, root: any): boolean {
    if (!root) return false
    for (const [model, record] of modelIndex)
      if (record.key === bindingKey)
        for (let ancestor = model; ancestor; ancestor = ancestor.parent) if (ancestor === root) return true
    return false
  }

  /** 取（必要时创建）某台车模的位姿记录。 */
  function poseOf(entry: CarPresenceEntry, model: any): CarPresencePose {
    let pose = entry.poses.get(model)
    if (!pose) {
      pose = {
        rest: model.position.clone(),
        applied: model.position.clone(),
        forward: model.position.clone(),
        moving: false,
      }
      entry.poses.set(model, pose)
    }
    return pose
  }

  /** 应用一台车的位姿：本位 + 朝向 × (位移 × progress)，到位后隐藏。 */
  function applyPose(entry: CarPresenceEntry, model: any): boolean {
    const pose = poseOf(entry, model),
      amount = entry.progress
    // 有人从外部挪过模型（拖拽 / 换楼层）→ 重抄本位，否则车会「飞回去」。
    model.position.equals(pose.applied) || pose.rest.copy(model.position)
    const targetPosition = pose.rest.clone(),
      isMoving = amount > 0 && amount < 1
    if (entry.distance > 0 && amount > 0) {
      pose.forward.set(0, 0, 1).applyQuaternion(model.quaternion),
        targetPosition.addScaledVector(pose.forward, entry.distance * amount)
    }
    // 驶离到位即隐藏：车不留在远处。回来途中（amount < 1）已经可见。
    const visible = amount < 1
    if (model.visible === visible && model.position.equals(targetPosition) && pose.moving === isMoving) return false
    return (
      model.position.copy(targetPosition),
      (model.visible = visible),
      model.updateMatrix(),
      pose.applied.copy(model.position),
      (pose.moving = isMoving),
      true
    )
  }

  /** 逐模型落地一次，返回是否有变化（有变化才请求重画）。 */
  function applyAll(): boolean {
    let hasChanged = false
    for (const [model, record] of modelIndex) {
      const entry = entries.get(record.key)
      if (entry && applyPose(entry, model)) hasChanged = true
    }
    syncRenderObjects()
    hasChanged && requestFrame()
    return hasChanged
  }

  /** 把「正在动的车」同步给宿主的动态渲染名单（反射 / 阴影据此决定重算）。 */
  function syncRenderObjects() {
    const nextMovingModels: any[] = []
    for (const [model, record] of modelIndex) {
      const pose = entries.get(record.key)?.poses.get(model)
      pose?.moving && nextMovingModels.push(model)
    }
    nextMovingModels.length === movingModels.length &&
    nextMovingModels.every((candidate, index) => candidate === movingModels[index])
      ? undefined
      : ((movingModels = nextMovingModels), setRenderObjects(nextMovingModels))
  }

  return {
    /** 表现版本号：宿主的反射 / 阴影缓存用它判断「要不要重画」。 */
    get presentationRevision() {
      return presentationRevision
    },

    /** 该绑定是否已经「停在家」（未驶离）。 */
    parked(binding: CarPresenceBinding): boolean {
      const entry = entries.get(modelKey(binding.floorId, binding.modelId))
      return !entry || (entry.home !== false && entry.progress === 0)
    },

    sync({
      root: rootModel,
      retainedRoots: retainedModelRoots = [],
      revision: sceneRevision,
      sceneId: currentSceneId,
      haSource: currentHaSource = '',
      bindings: presenceBindings = [],
      states: entityStates = {},
      editing: isEditing = false,
      canAnimate: canAnimateBinding = () => true,
      time: timestamp = now(),
    }: {
      root?: any
      retainedRoots?: any[]
      revision?: any
      sceneId?: any
      haSource?: string
      bindings?: readonly CarPresenceBinding[]
      states?: Record<string, any>
      editing?: boolean
      canAnimate?: (binding: CarPresenceBinding) => boolean
      time?: number
    }): boolean {
      if (isDisposed) return false
      // 既没有在动的车、也没有任何绑定配了在家/离家 → 完全不用管（热路径）。
      if (!entries.size && !presenceBindings.some((binding) => binding.presenceEntityId)) return false
      reindexModels([rootModel, ...retainedModelRoots].filter(Boolean), sceneRevision)

      // 换场景 / 换 HA 来源时不沿用旧补间：目标可能整批变了。
      const sameSource = lastSceneId === currentSceneId && lastHaSource === currentHaSource,
        previousEntries = sameSource ? entries : new Map<string, CarPresenceEntry>()
      ;(lastSceneId = currentSceneId), (lastHaSource = currentHaSource)
      const nextEntries = new Map<string, CarPresenceEntry>()
      let hasChanged = false

      for (const binding of presenceBindings) {
        if (!binding.presenceEntityId || carPresenceMappingError(binding)) continue
        const bindingKey = modelKey(binding.floorId, binding.modelId),
          signature = JSON.stringify([
            binding.id,
            binding.presenceEntityId,
            binding.presenceStates?.home || [],
            binding.presenceStates?.away || [],
          ]),
          previousEntry = previousEntries.get(bindingKey),
          previousParked = !previousEntry || (previousEntry.home !== false && previousEntry.progress === 0),
          reading = carPresenceReading(binding, entityStates, currentHaSource),
          targetProgress = reading.home === false ? 1 : 0,
          reusableEntry: CarPresenceEntry =
            previousEntry?.signature === signature
              ? previousEntry
              : {
                  key: bindingKey,
                  floorId: binding.floorId,
                  signature,
                  home: reading.home,
                  progress: 0,
                  motion: null,
                  distance: 0,
                  poses: new Map(),
                }
        // 读数匹配上才更新 home；`null`（未匹配）保留上次的判定，避免瞬时抖动把车开走。
        // 注意：`reusableEntry` 可能是 `previousEntry` 本身，所以**先存旧值再写**，
        // 否则下面的「home 变化了没」永远比对成未变化，补间一步都不会起。
        const previousHome = reusableEntry.home
        reading.home !== null && (reusableEntry.home = reading.home)
        reusableEntry.distance = carPresenceDistance(vehicleLengthOf(binding))
        if (isEditing || !canAnimateBinding(binding)) {
          // 编辑态 / 不允许动画：直接落位，不补间。
          reusableEntry.progress = isEditing ? 0 : targetProgress
          reusableEntry.motion = null
        } else if (
          reading.home !== null &&
          previousHome !== reading.home &&
          reusableEntry.progress !== targetProgress &&
          isUnderRoot(bindingKey, rootModel)
        ) {
          reusableEntry.motion = {
            from: reusableEntry.progress,
            target: targetProgress,
            start: timestamp,
            duration: carPresenceDuration(reusableEntry.progress, targetProgress),
          }
        } else if (!reusableEntry.motion || reusableEntry.motion.target !== targetProgress) {
          reusableEntry.progress = targetProgress
          reusableEntry.motion = null
        }
        nextEntries.set(bindingKey, reusableEntry)
        hasChanged ||= previousParked !== (reusableEntry.home !== false && reusableEntry.progress === 0)
      }
      // 绑定被删掉的条目：如果它原本不在家，也算一次可见变化（车要留在原位）。
      for (const [previousKey, previousEntry] of previousEntries)
        !nextEntries.has(previousKey) &&
          !(previousEntry.home !== false && previousEntry.progress === 0) &&
          (hasChanged = true)

      entries = nextEntries
      hasChanged && presentationRevision++
      applyAll()
      entries.size || ((modelIndex = new Map()), (indexedRoots = []))
      return hasChanged
    },

    /** 推进补间。返回「这一步是否有车刚刚落位」。 */
    tick(timestamp: number = now()): boolean {
      let hasSettled = false,
        hasMotion = false
      for (const entry of entries.values()) {
        const motion = entry.motion
        if (!motion) continue
        const rawProgress = Math.min(1, Math.max(0, (timestamp - motion.start) / motion.duration))
        entry.progress = motion.from + (motion.target - motion.from) * carPresenceEase(rawProgress)
        rawProgress === 1 && ((entry.progress = motion.target), (entry.motion = null), (hasSettled = true))
        hasMotion = true
      }
      hasSettled && presentationRevision++
      hasMotion && applyAll()
      return hasSettled
    },

    /** 下一帧的延时：有车在动 → 下一帧；全部静止 → `Infinity`（休眠，不空转）。 */
    nextDelay(): number {
      for (const entry of entries.values()) if (entry.motion) return 0
      return Infinity
    },

    dispose() {
      if (isDisposed) return
      ;(isDisposed = true), entries.clear(), modelIndex.clear(), (indexedRoots = []), (movingModels = [])
      setRenderObjects([])
    },
  }
}
