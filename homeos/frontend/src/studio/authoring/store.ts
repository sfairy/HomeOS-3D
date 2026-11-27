import { type WindowRecord } from '@app/shared/scene/window/layout'
import { restoreWindowDeletion as restoreWindowDeletion2, windowDeletionChange as windowDeletionChange2, windowSashTargets as windowSashTargets2 } from '@app/shared/scene/window/window-deletion'
import { sceneUpdatePlan } from '../app/bridge/scene'
import { syncModelRemarks } from '../app/shared/model-remarks'
import { withCsrf } from '@/kernel/http/index'

/**
 * C5 支撑——把“两份文档之间的差异”翻译成 DocumentPatch（跨楼层）。
 *
 * 历史记录采用惰性策略：编辑前只埋一份楼层 scene 快照，真正调用 markDocumentDirty 时
 * 才用本模块 diff 出补丁并入栈。好处：
 * - 只是选中/取消选中、没有内容变化时 diff 为空，不产生历史；
 * - 一次用户操作（多选删除、拖拽 + 属性变化）自然聚合成一个 batch 事务；
 * - 撤销/重做只需要 applyDocumentPatch(inverse)，不再整层 structuredClone 回填。
 *
 * 数组字段按 id 做 add/remove/update/move；顺序变化、无 id 元素才退化成整字段 replace。
 * settings 等纯视图字段（相机、吸附、预览偏好）不参与 diff —— 相机/选择不入历史栈。
 */


/** 明确不参与历史 diff 的楼层 scene 字段：编辑器视图偏好，不属于文档内容。 */
const SKIP_SCENE_FIELDS: ReadonlySet<string> = new Set(['settings', 'id'])

/** 只影响位置/旋转/缩放的键：这类变化记成 move（语义更准，回退/重做行为一致）。 */
const TRANSFORM_KEYS: ReadonlySet<string> = new Set([
  'x',
  'y',
  'z',
  'position',
  'transform',
  'rotation',
  'rotationY',
  'rotationDeg',
  'rotationX',
  'rotationZ',
  'scale',
  'scaleX',
  'scaleY',
  'scaleZ',
  'width',
  'depth',
  'height',
  'thickness',
  'elevation',
])

const compareKey = (value: any): string => {
  try {
    return stableDocumentString(value)
  } catch {
    return String(value)
  }
}

const isPlainObject = (value: any): boolean => !!value && typeof value === 'object' && !Array.isArray(value)

const idOf = (value: any): string | null =>
  isPlainObject(value) && typeof value.id === 'string' && value.id ? value.id : null

const onlyTransformChanged = (beforeValue: any, afterValue: any): boolean => {
  if (!isPlainObject(beforeValue) || !isPlainObject(afterValue)) return false
  const keys = new Set([...Object.keys(beforeValue), ...Object.keys(afterValue)])
  for (const key of keys) {
    if (TRANSFORM_KEYS.has(key)) continue
    if (compareKey(beforeValue[key]) !== compareKey(afterValue[key])) return false
  }
  return true
}

/**
 * 单个数组字段的补丁：
 * - 全量 replace（顺序变化 / 存在无 id 元素 / id 重复）—— 一个 patch 覆盖该字段全部差异；
 * - 否则拆 remove / add / update / move，应用时顺序无关（remove 按 id、add 按 index、update/move 按 id）。
 */
function diffSceneArrayField(
  floorId: string,
  field: FloorSceneField,
  beforeList: any,
  afterList: any,
): DocumentPatch[] {
  const before = Array.isArray(beforeList) ? beforeList : []
  const after = Array.isArray(afterList) ? afterList : []
  if (compareKey(before) === compareKey(after)) return []

  const beforeIds = before.map(idOf)
  const afterIds = after.map(idOf)
  const idsUsable =
    beforeIds.every((id: string | null) => id !== null) &&
    afterIds.every((id: string | null) => id !== null) &&
    new Set(beforeIds).size === beforeIds.length &&
    new Set(afterIds).size === afterIds.length

  if (!idsUsable) {
    return [{ kind: 'replace', floorId, field, before, after }]
  }

  const afterIdSet = new Set(afterIds as string[])
  const beforeIdSet = new Set(beforeIds as string[])
  const commonOrderBefore = (beforeIds as string[]).filter((id) => afterIdSet.has(id))
  const commonOrderAfter = (afterIds as string[]).filter((id) => beforeIdSet.has(id))
  if (commonOrderBefore.join('\u0000') !== commonOrderAfter.join('\u0000')) {
    return [{ kind: 'replace', floorId, field, before, after }]
  }

  const beforeById = new Map<string, { item: any; index: number }>()
  before.forEach((item: any, index: number) => beforeById.set(beforeIds[index] as string, { item, index }))
  const afterById = new Map<string, { item: any; index: number }>()
  after.forEach((item: any, index: number) => afterById.set(afterIds[index] as string, { item, index }))

  const removed: Array<{ item: any; index: number }> = []
  for (const [id, record] of beforeById) {
    if (!afterIdSet.has(id)) removed.push({ item: record.item, index: record.index })
  }
  const added: Array<{ item: any; index: number }> = []
  for (const [id, record] of afterById) {
    if (!beforeIdSet.has(id)) added.push({ item: record.item, index: record.index })
  }
  const changes: Array<{ itemId: string; before: any; after: any }> = []
  const moves: Array<{ itemId: string; before: any; after: any }> = []
  for (const [id, beforeRecord] of beforeById) {
    const afterRecord = afterById.get(id)
    if (!afterRecord) continue
    if (compareKey(beforeRecord.item) === compareKey(afterRecord.item)) continue
    if (onlyTransformChanged(beforeRecord.item, afterRecord.item)) {
      moves.push({ itemId: id, before: beforeRecord.item, after: afterRecord.item })
    } else {
      changes.push({ itemId: id, before: beforeRecord.item, after: afterRecord.item })
    }
  }

  const patches: DocumentPatch[] = []
  if (removed.length) patches.push({ kind: 'remove', floorId, field, entries: removed })
  if (added.length) patches.push({ kind: 'add', floorId, field, entries: added })
  if (changes.length) patches.push({ kind: 'update', floorId, field, changes })
  if (moves.length) patches.push({ kind: 'move', floorId, field, moves })
  return patches
}

/** 一个楼层 scene 的完整补丁集合（含数组字段与 background/name 等非视图字段）。 */
function diffFloorScenePatches(floorId: string, beforeScene: any, afterScene: any): DocumentPatch[] {
  const patches: DocumentPatch[] = []
  const before = isPlainObject(beforeScene) ? beforeScene : {}
  const after = isPlainObject(afterScene) ? afterScene : {}
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const key of keys) {
    if (SKIP_SCENE_FIELDS.has(key)) continue
    const beforeValue = before[key]
    const afterValue = after[key]
    const bothArrays = Array.isArray(beforeValue) || Array.isArray(afterValue)
    if (bothArrays) {
      patches.push(...diffSceneArrayField(floorId, key, beforeValue, afterValue))
      continue
    }
    if (compareKey(beforeValue) === compareKey(afterValue)) continue
    patches.push({ kind: 'replace', floorId, field: key, before: beforeValue, after: afterValue })
  }
  return patches
}

const floorList = (document: any): any[] => (Array.isArray(document?.floors) ? document.floors : [])

/**
 * 文档级 diff：按 floorId 对齐两侧楼层，比较该楼层 scene。
 * 返回 null 表示无内容差异（不产生历史）。多个补丁包成一个 batch（一次撤销 = 一次用户操作）。
 */
export function diffDocumentPatches(beforeDocument: any, afterDocument: any): DocumentPatch | null {
  const beforeFloors = new Map<string, any>()
  for (const floor of floorList(beforeDocument)) {
    if (floor && typeof floor.id === 'string') beforeFloors.set(floor.id, floor)
  }
  const afterFloors = new Map<string, any>()
  for (const floor of floorList(afterDocument)) {
    if (floor && typeof floor.id === 'string') afterFloors.set(floor.id, floor)
  }
  const floorIds = new Set([...beforeFloors.keys(), ...afterFloors.keys()])
  const patches: DocumentPatch[] = []
  for (const floorId of floorIds) {
    const beforeFloor = beforeFloors.get(floorId)
    const afterFloor = afterFloors.get(floorId)
    if (!beforeFloor || !afterFloor) continue // 楼层增删不在本轮历史范围内
    patches.push(...diffFloorScenePatches(floorId, beforeFloor.scene, afterFloor.scene))
  }
  if (patches.length === 0) return null
  if (patches.length === 1) return patches[0]
  return { kind: 'batch', patches }
}

/** 历史条目标签（host 只用来做提示，不参与逻辑）。 */
export function describeDocumentPatch(patch: DocumentPatch): string {
  const count = patch.kind === 'batch' ? patch.patches.length : 1
  if (patch.kind === 'add') return '添加 ' + count + ' 项'
  if (patch.kind === 'remove') return '删除 ' + count + ' 项'
  if (patch.kind === 'move') return '移动 ' + count + ' 项'
  if (patch.kind === 'replace') return '修改 ' + String(patchSceneField(patch))
  if (patch.kind === 'batch') return '编辑（' + count + ' 处）'
  return '编辑 ' + count + ' 项'
}

/**
 * C3 —— 文档 / 版本状态（document store）。
 *
 * 背景：studio 的保存是**整份文档** PUT（`studio_drafts` 单例，revision CAS），
 * 但“哪里脏了”必须按 `DocumentPatch`（add / remove / update / move，覆盖所有楼层）记录，
 * 这样才能接历史栈（C5）、才能在 409 时判断本地/远端是否真的同一份内容。
 *
 * 两条版本线必须分开：
 * - `loadedRevision`：服务端 `studio_drafts.revision`，只由 GET / PUT 成功推进；
 * - `runtimeSceneRevision`：本地累计改动计数，只由 markDirty 推进，保存成功归零；
 *   interaction3d 运行时快照轮询（C4）**只能**读它，不能改写它。
 */


export interface StudioDraftPayload {
  revision: number
  scene: any
  updatedAt?: string | null
}

export type FloorSceneField = string

interface FloorScenePatch {
  floorId: string
  field?: FloorSceneField
}

interface AddItemsPatch extends FloorScenePatch {
  kind: 'add'
  entries: Array<{ item: any; index: number }>
}

interface RemoveItemsPatch extends FloorScenePatch {
  kind: 'remove'
  entries: Array<{ item: any; index: number }>
}

interface UpdateItemsPatch extends FloorScenePatch {
  kind: 'update'
  changes: Array<{ itemId: string; before: any; after: any; sashRestore?: boolean }>
}

interface MoveItemsPatch extends FloorScenePatch {
  kind: 'move'
  moves: Array<{ itemId: string; before: any; after: any }>
}

/** 整字段替换（顺序变化、无 id 元素、settings 等对象字段的兜底）：数组就地 splice 保留元素对象引用。 */
interface ReplaceFieldPatch extends FloorScenePatch {
  kind: 'replace'
  field: FloorSceneField
  before: any
  after: any
}

/** 一次用户操作（多选删除、拖拽+属性变化、跨楼层改动）聚合成一个历史事务。 */
interface BatchPatch {
  kind: 'batch'
  patches: DocumentPatch[]
}

export type DocumentPatch =
  | AddItemsPatch
  | RemoveItemsPatch
  | UpdateItemsPatch
  | MoveItemsPatch
  | ReplaceFieldPatch
  | BatchPatch

/** 文档里属于“版本/时间戳”的易变键：签名必须忽略它们，否则每次保存都像内容变了。 */
const VOLATILE_DOCUMENT_KEYS: ReadonlySet<string> = new Set([
  'revision',
  'updatedAt',
  'savedAt',
  'syncKey',
  'serverRevision',
  'interactionConfirmation',
])

/** 32 位 FNV-1a；用两路不同种子散列降低碰撞概率。 */
function fnv1a32Hex(input: string, seed = 0x811c9dc5): string {
  let hash = seed >>> 0
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * 稳定序列化：对象键排序、按 JSON 语义归一化（NaN/Infinity -> null、函数/undefined 丢弃），
 * 并跳过 `VOLATILE_DOCUMENT_KEYS`。同一份文档无论键顺序如何都得到同一字符串。
 */
export function stableDocumentString(document: any, omittedKeys: ReadonlySet<string> = VOLATILE_DOCUMENT_KEYS): string {
  const normalized = document === undefined ? null : JSON.parse(JSON.stringify(document))
  const walk = (node: any): string => {
    if (node === null) return 'null'
    if (Array.isArray(node)) return '[' + node.map((entry) => walk(entry)).join(',') + ']'
    switch (typeof node) {
      case 'string':
      case 'number':
      case 'boolean':
        return JSON.stringify(node)
      case 'object': {
        const keys = Object.keys(node)
          .filter((key) => !omittedKeys.has(key))
          .sort()
        return '{' + keys.map((key) => JSON.stringify(key) + ':' + walk(node[key])).join(',') + '}'
      }
      default:
        return 'null'
    }
  }
  return walk(normalized)
}

/** 文档内容签名：忽略版本/时间戳字段；用于 local === remote 判定与 no-op 脏标记识别。 */
export function documentSignature(document: any): string {
  const serialized = stableDocumentString(document)
  return (
    'doc1:' + serialized.length.toString(36) + ':' + fnv1a32Hex(serialized) + ':' + fnv1a32Hex(serialized, 0x9e3779b9)
  )
}

function findFloorRecord(document: any, floorId: string): any | null {
  const floorList = document?.floors
  if (!Array.isArray(floorList)) return null
  return floorList.find((floor: any) => floor?.id === floorId) ?? null
}

export function patchSceneField(patch: FloorScenePatch): FloorSceneField {
  return typeof patch.field === 'string' && patch.field ? patch.field : 'items'
}

/** 楼层 scene 的某个数组字段；字段不存在或不是数组返回 null。 */
function floorSceneFieldList(document: any, floorId: string, field: FloorSceneField = 'items'): any[] | null {
  const fieldValue = findFloorRecord(document, floorId)?.scene?.[field]
  return Array.isArray(fieldValue) ? fieldValue : null
}

export function canApplyDocumentPatch(document: any, patch: DocumentPatch): boolean {
  if (!patch || typeof patch !== 'object') return false
  if (patch.kind === 'batch') {
    if (!Array.isArray(patch.patches) || patch.patches.length === 0) return false
    return patch.patches.every((entry) => canApplyDocumentPatch(document, entry))
  }
  if (patch.kind === 'replace') {
    const floorRecord = findFloorRecord(document, patch.floorId)
    if (!floorRecord || !floorRecord.scene) return false
    if (!patchSceneField(patch)) return false
    return patch.before !== undefined && patch.after !== undefined
  }
  const itemList = floorSceneFieldList(document, patch.floorId, patchSceneField(patch))
  if (!itemList) return false
  const existingIds = new Set(itemList.map((item: any) => item?.id))
  switch (patch.kind) {
    case 'add':
      return patch.entries.every((entry) => !!entry && typeof entry.item === 'object' && entry.item !== null)
    case 'remove':
      return patch.entries.every((entry) => existingIds.has(entry?.item?.id))
    case 'update':
      return patch.changes.every((change) => existingIds.has(change.itemId))
    case 'move':
      return patch.moves.every((move) => existingIds.has(move.itemId))
    default:
      return false
  }
}

/** 就地覆盖字段、保留对象引用（three 场景/选中集持的是同一个物件对象）。 */ function replaceItemInPlace(
  target: any,
  replacement: any,
): void {
  for (const key of Object.keys(target)) {
    if (!Object.hasOwn(replacement, key)) delete target[key]
  }
  Object.assign(target, replacement)
}

/** 应用补丁（就地修改文档）；先 canApply 校验，失败不落任何修改。 */
/** 这条 update 是不是一次「删掉可删窗扇」（前向）。只有它才值得在反向时做窗扇级合并。 */
function isWindowSashReduction(change: { before: unknown; after: unknown }): boolean {
  return (
    windowSashTargets2(change.before as WindowRecord).length > windowSashTargets2(change.after as WindowRecord).length
  )
}

/** 窗扇级撤销：只把消失的窗扇加回来；结构已被再次修改时返回 false（不猜）。 */
function applyWindowDeletionRestore(
  item: Record<string, unknown>,
  change: { before: unknown; after: unknown },
): boolean {
  // 反向补丁的 before = 删之后、after = 删之前；`windowDeletionChange` 要的正是这个顺序的反面。
  const deletionChange = windowDeletionChange2(change.after as WindowRecord, change.before as WindowRecord)
  if (!deletionChange) return false
  try {
    replaceItemInPlace(item, restoreWindowDeletion2(item as WindowRecord, deletionChange))
    return true
  } catch {
    // 三方合并判定结构已被再次修改（或校验不过）：返回 false 让调用方走「冲突」出口，
    // 而不是把异常抛到文档层之外 —— 历史 store 只认布尔。
    return false
  }
}

export function applyDocumentPatch(document: any, patch: DocumentPatch): boolean {
  if (!canApplyDocumentPatch(document, patch)) return false
  if (patch.kind === 'batch') {
    // 事务语义：先整体 canApply（上面），再逐个应用；历史补丁按“每个 id/字段只出现一次”生成，不会互相踩踏。
    for (const entry of patch.patches) {
      if (!applyDocumentPatch(document, entry)) return false
    }
    return true
  }
  if (patch.kind === 'replace') {
    const floorRecord = findFloorRecord(document, patch.floorId)
    if (!floorRecord || !floorRecord.scene) return false
    const field = patchSceneField(patch)
    const currentValue = floorRecord.scene[field]
    if (Array.isArray(currentValue) && Array.isArray(patch.after)) {
      currentValue.length = 0
      currentValue.push(...patch.after)
      return true
    }
    if (
      currentValue &&
      typeof currentValue === 'object' &&
      !Array.isArray(currentValue) &&
      patch.after &&
      typeof patch.after === 'object' &&
      !Array.isArray(patch.after)
    ) {
      replaceItemInPlace(currentValue, patch.after)
      return true
    }
    floorRecord.scene[field] = patch.after
    return true
  }
  const itemList = floorSceneFieldList(document, patch.floorId, patchSceneField(patch)) as any[]
  if (!itemList) return false
  if (patch.kind === 'add') {
    const orderedEntries = [...patch.entries].sort((left, right) => left.index - right.index)
    for (const entry of orderedEntries) {
      const requestedIndex = Math.trunc(Number(entry.index) || 0)
      const insertIndex = Math.max(0, Math.min(itemList.length, requestedIndex))
      itemList.splice(insertIndex, 0, entry.item)
    }
    return true
  }
  if (patch.kind === 'remove') {
    const removedIds = new Set(patch.entries.map((entry) => entry?.item?.id))
    for (let itemIndex = itemList.length - 1; itemIndex >= 0; itemIndex -= 1) {
      if (removedIds.has(itemList[itemIndex]?.id)) itemList.splice(itemIndex, 1)
    }
    return true
  }
  const changes = patch.kind === 'update' ? patch.changes : patch.moves
  const isWindowsField = patchSceneField(patch) === 'windows'
  for (const change of changes) if (!applyChangedItem(itemList, change, isWindowsField)) return false
  return true
}

/** 一条 update/move：带 `sashRestore` 标记才走窗扇级合并，其余整件替换。 */
function applyChangedItem(
  itemList: Array<Record<string, unknown>>,
  change: { itemId: string; before: unknown; after: unknown; sashRestore?: boolean },
  isWindowsField: boolean,
): boolean {
  const item = itemList.find((candidate) => String(candidate?.id ?? '') === change.itemId)
  if (!item) return false
  if (isWindowsField && change.sashRestore === true) return applyWindowDeletionRestore(item, change)
  replaceItemInPlace(item, change.after)
  return true
}

/** 逆补丁：历史栈回退/重做使用的精确反向操作（add <-> remove，update/move/replace 交换 before/after，batch 逆序取逆）。 */
export function invertDocumentPatch(patch: DocumentPatch): DocumentPatch {
  const carryFloorScene = (source: FloorScenePatch): FloorScenePatch =>
    typeof source.field === 'string' ? { floorId: source.floorId, field: source.field } : { floorId: source.floorId }
  switch (patch.kind) {
    case 'add':
      return {
        kind: 'remove',
        ...carryFloorScene(patch),
        entries: patch.entries.map((entry) => ({ item: entry.item, index: entry.index })),
      }
    case 'remove':
      return {
        kind: 'add',
        ...carryFloorScene(patch),
        entries: patch.entries.map((entry) => ({ item: entry.item, index: entry.index })),
      }
    case 'update':
      return {
        kind: 'update',
        ...carryFloorScene(patch),
        changes: patch.changes.map((change) => ({
          itemId: change.itemId,
          before: change.after,
          after: change.before,
          /**
           * 反向补丁 = 「把删掉的窗扇放回来」时打标，供 `applyDocumentPatch` 走窗扇级合并。
           *
           * 为什么不能靠数量差推断：正向的「在窗型编辑器里加一扇」与反向的「撤销删扇」
           * 在 before/after 上完全同形（都是 after 扇更多），只看数量会把加扇也当成撤销。
           * 这里只在**前向确实是删扇**（before 扇更多）时才给反向补丁打标，语义唯一。
           */
          ...(isWindowSashReduction(change) ? { sashRestore: true } : {}),
        })),
      }
    case 'move':
      return {
        kind: 'move',
        ...carryFloorScene(patch),
        moves: patch.moves.map((move) => ({
          itemId: move.itemId,
          before: move.after,
          after: move.before,
        })),
      }
    case 'replace':
      return {
        kind: 'replace',
        ...carryFloorScene(patch),
        field: patchSceneField(patch),
        before: patch.after,
        after: patch.before,
      }
    case 'batch':
      return {
        kind: 'batch',
        patches: [...patch.patches].reverse().map((entry) => invertDocumentPatch(entry)),
      }
    default:
      return patch
  }
}

interface StudioDocumentStoreOptions {
  signature?: (document: any) => string
}

interface StudioDocumentState {
  document: any | null
  loadedRevision: number
  runtimeSceneRevision: number
  loadedSignature: string
  dirty: boolean
  dirtyPatchCount: number
}

type ApplyRemoteDocumentResult = { applied: true; revision: number } | { applied: false; reason: 'local-dirty' }

export class StudioDocumentStore {
  private documentValue: any = null
  private loadedRevisionValue = 0
  private runtimeSceneRevisionValue = 0
  private loadedSignatureValue = ''
  private dirtyPatches: DocumentPatch[] = []
  private readonly signature: (document: any) => string

  constructor(options: StudioDocumentStoreOptions = {}) {
    this.signature = options.signature ?? documentSignature
  }

  getState(): StudioDocumentState {
    return {
      document: this.documentValue,
      loadedRevision: this.loadedRevisionValue,
      runtimeSceneRevision: this.runtimeSceneRevisionValue,
      loadedSignature: this.loadedSignatureValue,
      dirty: this.isDirty(),
      dirtyPatchCount: this.dirtyPatches.length,
    }
  }

  getDocument(): any | null {
    return this.documentValue
  }

  getLoadedRevision(): number {
    return this.loadedRevisionValue
  }

  getRuntimeSceneRevision(): number {
    return this.runtimeSceneRevisionValue
  }

  /** GET / PUT 成功：采纳文档与服务端版本，清空脏标记（`runtimeSceneRevision` 归 0）。 */
  applyLoaded(payload: StudioDraftPayload, runtimeSceneRevision = 0): void {
    const revision = Math.max(0, Math.trunc(Number(payload?.revision) || 0))
    this.documentValue = payload?.scene ?? null
    this.loadedRevisionValue = revision
    this.runtimeSceneRevisionValue = Math.max(0, Math.trunc(runtimeSceneRevision) || 0)
    this.loadedSignatureValue = this.signature(this.documentValue)
    this.dirtyPatches = []
  }

  /** PUT 成功（语义同 applyLoaded，命名让调用点表达保存成功）。 */
  applySaved(payload: StudioDraftPayload): void {
    this.applyLoaded(payload, 0)
  }

  /**
   * 只推进服务端版本号，不采纳文档内容。
   *
   * 用于**定向写入**（内嵌自动导图只合并当前主题的光照）：服务器 revision 已经前进，
   * 但本地文档就是写入源，替换整篇反而会丢掉本地视图态。不推进的话，下一次自动保存
   * 会拿着旧 revision 撞 409。
   */
  advanceLoadedRevision(revision: number): void {
    this.loadedRevisionValue = Math.max(this.loadedRevisionValue, Math.max(0, Math.trunc(Number(revision) || 0)))
  }

  /**
   * interaction3d 全量推送 / 远端替换：本地有未保存改动时**拒绝覆盖**（交给 C4 判冲突），
   * 干净时才采纳远端文档。
   */
  applyRemote(payload: StudioDraftPayload): ApplyRemoteDocumentResult {
    if (this.isDirty()) return { applied: false, reason: 'local-dirty' }
    this.applyLoaded(payload, 0)
    return { applied: true, revision: this.loadedRevisionValue }
  }

  /** 本地一次改动（一次用户操作可能聚合成一个 DocumentPatch）。 */
  markDirty(patch: DocumentPatch): void {
    this.dirtyPatches.push(patch)
    this.runtimeSceneRevisionValue += 1
  }

  /**
   * 整文档脏标记（宿主 `markDocumentDirty()` 用）：不生成补丁，只推进 `runtimeSceneRevision`，
   * 让 `isDirty()` 为真。保存成功后由 `applySaved` / `applyLoaded` 归零。
   */
  markWholeDocumentDirty(): void {
    this.runtimeSceneRevisionValue += 1
  }

  isDirty(): boolean {
    return this.dirtyPatches.length > 0 || this.runtimeSceneRevisionValue > 0
  }

  /** 内容级 no-op 脏标记：内容与最近载入/保存一致，但已产生脏标记（不得静默跳过保存）。 */
  isNoopDirty(): boolean {
    return this.isDirty() && this.signature(this.documentValue) === this.loadedSignatureValue
  }

  matchesRemoteDocument(remoteDocument: any): boolean {
    return this.signature(this.documentValue) === this.signature(remoteDocument)
  }

  getDirtyPatches(): readonly DocumentPatch[] {
    return this.dirtyPatches
  }

  setRuntimeSceneRevision(revision: number): void {
    this.runtimeSceneRevisionValue = Math.max(0, Math.trunc(Number(revision) || 0))
  }

  clear(): void {
    this.documentValue = null
    this.loadedRevisionValue = 0
    this.runtimeSceneRevisionValue = 0
    this.loadedSignatureValue = ''
    this.dirtyPatches = []
  }
}

/**
 * C5 —— 历史栈（undo / redo）。
 *
 * 只记录文档补丁 `DocumentPatch`（add / remove / update / move），每条 `HistoryEntry` 都是
 * 「一次用户操作 → 一个补丁 + 其精确逆补丁」，因此：
 * - 多选删除 = 一个含多条 entries 的 remove 补丁；拖拽 = 一个含多条 moves 的 move 补丁，
 *   天然是**一个 transaction**，撤销一次全部回退；
 * - 选择、相机视角、切楼层不产生 DocumentPatch，因此永远不会入栈；
 * - 撤销前先 `canApply` 预检（例如合并墙保护导致的不可逆状态），预检失败**不出栈**；
 *   出栈后应用失败则把条目压回原栈并回调 `onApplyFailure` 提示用户；
 * - 双容量上限：条数 + 字节数（默认 40 条 / 32MB），超限从最旧条目开始丢弃。
 */


interface HistoryEntry {
  patch: DocumentPatch
  inverse: DocumentPatch
  label: string
  at: number
}

interface HistoryStoreOptions {
  /** 应用补丁（就地改文档），返回是否成功。 */
  apply: (patch: DocumentPatch) => boolean
  /** 应用前预检；返回 false 时撤销/重做不落栈也不改文档。 */
  canApply?: (patch: DocumentPatch) => boolean
  maxEntries?: number
  maxBytes?: number
  now?: () => number
  /** 出栈后应用失败（例如物件已被别处删除）。 */
  onApplyFailure?: (entry: HistoryEntry) => void
}

const DEFAULT_HISTORY_MAX_ENTRIES = 40
const DEFAULT_HISTORY_MAX_BYTES = 32 * 1024 * 1024

type HistoryDirection = 'undo' | 'redo'

type HistoryApplyResult =
  | { ok: true; direction: HistoryDirection; entry: HistoryEntry }
  | {
      ok: false
      direction: HistoryDirection
      reason: 'empty' | 'not-applicable' | 'apply-failed'
      entry?: HistoryEntry
    }

/** UTF-8 字节数（浏览器没有 Buffer，手算避免依赖 TextEncoder 的实例化开销）。 */
function utf8ByteLength(text: string): number {
  let bytes = 0
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4
  }
  return bytes
}

function estimateHistoryEntryBytes(entry: HistoryEntry): number {
  return utf8ByteLength(JSON.stringify(entry.patch)) + utf8ByteLength(JSON.stringify(entry.inverse))
}

export class StudioHistoryStore {
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  private undoBytesValue = 0
  private redoBytesValue = 0
  private readonly applyPatch: (patch: DocumentPatch) => boolean
  private readonly canApplyPatch: ((patch: DocumentPatch) => boolean) | null
  private readonly maxEntries: number
  private readonly maxBytes: number
  private readonly now: () => number
  private readonly onApplyFailure: ((entry: HistoryEntry) => void) | null

  constructor(options: HistoryStoreOptions) {
    this.applyPatch = options.apply
    this.canApplyPatch = options.canApply ?? null
    this.maxEntries = Math.max(1, Math.trunc(options.maxEntries ?? DEFAULT_HISTORY_MAX_ENTRIES))
    this.maxBytes = Math.max(1, Math.trunc(options.maxBytes ?? DEFAULT_HISTORY_MAX_BYTES))
    this.now = options.now ?? Date.now
    this.onApplyFailure = options.onApplyFailure ?? null
  }

  /** 记录一次用户操作；新操作会清空 redo 栈。 */
  record(patch: DocumentPatch, label: string, inverse?: DocumentPatch): HistoryEntry {
    const entry: HistoryEntry = {
      patch,
      inverse: inverse ?? invertDocumentPatch(patch),
      label,
      at: this.now(),
    }
    this.undoStack.push(entry)
    this.undoBytesValue += estimateHistoryEntryBytes(entry)
    this.dropRedoStack()
    this.enforceCaps()
    return entry
  }

  undo(): HistoryApplyResult {
    const entry = this.undoStack[this.undoStack.length - 1]
    if (!entry) return { ok: false, direction: 'undo', reason: 'empty' }
    if (!this.canApply(entry.inverse)) {
      return { ok: false, direction: 'undo', reason: 'not-applicable', entry }
    }
    const entryBytes = estimateHistoryEntryBytes(entry)
    this.undoStack.pop()
    this.undoBytesValue -= entryBytes
    if (!this.applyWithGuard(entry.inverse)) {
      this.undoStack.push(entry)
      this.undoBytesValue += entryBytes
      this.onApplyFailure?.(entry)
      return { ok: false, direction: 'undo', reason: 'apply-failed', entry }
    }
    this.redoStack.push(entry)
    this.redoBytesValue += entryBytes
    return { ok: true, direction: 'undo', entry }
  }

  redo(): HistoryApplyResult {
    const entry = this.redoStack[this.redoStack.length - 1]
    if (!entry) return { ok: false, direction: 'redo', reason: 'empty' }
    if (!this.canApply(entry.patch)) {
      return { ok: false, direction: 'redo', reason: 'not-applicable', entry }
    }
    const entryBytes = estimateHistoryEntryBytes(entry)
    this.redoStack.pop()
    this.redoBytesValue -= entryBytes
    if (!this.applyWithGuard(entry.patch)) {
      this.redoStack.push(entry)
      this.redoBytesValue += entryBytes
      this.onApplyFailure?.(entry)
      return { ok: false, direction: 'redo', reason: 'apply-failed', entry }
    }
    this.undoStack.push(entry)
    this.undoBytesValue += entryBytes
    this.enforceCaps()
    return { ok: true, direction: 'redo', entry }
  }

  peekUndo(): HistoryEntry | null {
    return this.undoStack[this.undoStack.length - 1] ?? null
  }

  peekRedo(): HistoryEntry | null {
    return this.redoStack[this.redoStack.length - 1] ?? null
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
    this.undoBytesValue = 0
    this.redoBytesValue = 0
  }

  get undoDepth(): number {
    return this.undoStack.length
  }

  get redoDepth(): number {
    return this.redoStack.length
  }

  get byteSizes(): { undo: number; redo: number } {
    return { undo: this.undoBytesValue, redo: this.redoBytesValue }
  }

  private canApply(patch: DocumentPatch): boolean {
    return this.canApplyPatch ? this.canApplyPatch(patch) : true
  }

  private applyWithGuard(patch: DocumentPatch): boolean {
    try {
      return this.applyPatch(patch) === true
    } catch {
      return false
    }
  }

  private dropRedoStack(): void {
    this.redoStack = []
    this.redoBytesValue = 0
  }

  private enforceCaps(): void {
    while (this.undoStack.length > this.maxEntries) this.dropOldestUndo()
    while (this.undoBytesValue > this.maxBytes && this.undoStack.length > 1) {
      this.dropOldestUndo()
    }
  }

  private dropOldestUndo(): void {
    const dropped = this.undoStack.shift()
    if (dropped) this.undoBytesValue -= estimateHistoryEntryBytes(dropped)
  }
}

/**
 * C2 —— 保存状态机（自动保存 / 失败重试 / 409 冲突 / 428 交互确认 / 退出与 pagehide）。
 *
 * 设计要点：
 * 1. 状态机集中在 store：status、连续失败次数、退避时间、冲突/确认待决状态、在途 PUT、
 *    自动保存防抖与最大延迟都在这里，宿主只负责调用 markDirty() 和读 getState()。
 * 2. 版本线来自 document-store（C3）：flushNow() 一律使用 loadedRevision，成功后 applySaved()
 *    推进；runtimeSceneRevision 由 C3 自己维护，本模块不碰。
 * 3. 纯函数可测：错误分类 classifySaveError、退避 backoffDelay、防抖 computeAutosaveDelay
 *    都是纯函数；传输（GET/PUT/sendBeacon）与定时器由宿主注入。
 * 4. local === remote 不静默跳过：内容与服务器相同时仍然发一次 PUT 以推进 revision，
 *    只有服务器 ACK 之后才算保存成功（isNoopDirty 只用于展示“无实质改动”）。
 * 5. 409 三出口：载入服务器版本 / 覆盖服务器（用 currentRevision）/ 导出本地副本；
 *    在用户选择前不自动重试，也不让退出静默丢改动。
 * 6. 428 交互确认：把 token 存下，用户确认后带 token 重试；未确认前 status=blocked。
 * 7. pagehide：sendBeacon 尽力而为，不做乐观推进 revision（下次 GET 为准）。
 */


const AUTOSAVE_DEBOUNCE_MS = 3000
const AUTOSAVE_MAX_DELAY_MS = 15000
const SAVE_RETRY_BASE_MS = 2000
const SAVE_RETRY_MAX_MS = 30000
const SAVE_RETRY_EXPONENT_CAP = 4

type SaveStatus =
  | 'idle'
  | 'loading'
  | 'blocked-readonly'
  | 'saved'
  | 'dirty'
  | 'saving'
  | 'retrying'
  | 'offline'
  | 'conflict'
  | 'blocked'
  | 'failed'

export interface SaveRequestError {
  /** HTTP 状态码；网络错误时缺省。 */
  status?: number
  /** 后端返回的 detail（409/428 携带结构化字段）。 */
  detail?: any
  message?: string
}

type SaveErrorCategory = 'conflict' | 'confirmation' | 'payload-too-large' | 'auth' | 'invalid' | 'retryable'

function classifySaveError(error: SaveRequestError): SaveErrorCategory {
  const status = error.status
  if (status === 409) return 'conflict'
  if (status === 428) return 'confirmation'
  if (status === 413) return 'payload-too-large'
  if (status === 401 || status === 403) return 'auth'
  if (status === 422) return 'invalid'
  if (status === undefined || status === 408 || status === 425 || status === 429 || status >= 500) {
    return 'retryable'
  }
  return 'invalid'
}

/** 退避：2s → 4s → 8s → 16s → 30s（cap），与旧实现的 min(30000, 2000*2**(n-1)) 一致。 */
function backoffDelay(attempt: number): number {
  const normalized = Math.max(1, Math.trunc(attempt))
  return Math.min(SAVE_RETRY_MAX_MS, SAVE_RETRY_BASE_MS * 2 ** Math.min(normalized - 1, SAVE_RETRY_EXPONENT_CAP))
}

/**
 * 自动保存延迟：防抖 3s，但首个改动后最多等 15s 必须发一次。
 * firstDirtyAt === null 表示当前没有待保存改动。
 */
function computeAutosaveDelay(now: number, firstDirtyAt: number | null): number {
  if (firstDirtyAt === null) return AUTOSAVE_DEBOUNCE_MS
  const deadline = firstDirtyAt + AUTOSAVE_MAX_DELAY_MS
  return Math.max(0, Math.min(AUTOSAVE_DEBOUNCE_MS, deadline - now))
}

export interface SaveTransportPutRequest {
  revision: number
  scene: any
  interactionConfirmation?: string
}

export type SaveTransportResult = { ok: true; payload: StudioDraftPayload } | { ok: false; error: SaveRequestError }

export interface SaveTransport {
  /** GET /api/v1/studio3d；空场景返回 revision=0 / scene=null。 */
  load(): Promise<SaveTransportResult>
  /** PUT /api/v1/studio3d。 */
  put(request: SaveTransportPutRequest): Promise<SaveTransportResult>
  /** pagehide keepalive（sendBeacon / fetch keepalive）。 */
  beacon?: (request: SaveTransportPutRequest) => boolean
}

interface SaveStoreTimers {
  setTimeout: (handler: () => void, delayMs: number) => number
  clearTimeout: (handle: number) => void
}

interface SaveConflictState {
  /** 冲突时服务器的 revision（来自 409 detail.currentRevision）。 */
  currentRevision: number | null
  detectedAt: number
}

interface SaveConfirmationState {
  token: string
  message: string
  impacts: any
  projects: any
  requestedAt: number
}

export interface SaveStoreState {
  status: SaveStatus
  /** 连续可重试失败次数（成功后归零）。 */
  attempt: number
  /** 下次重试时间戳；非 retrying 时为 null。 */
  nextRetryAt: number | null
  /** 首次变脏时间（用于 15s 最大延迟）；无待保存改动时 null。 */
  firstDirtyAt: number | null
  isSaveInFlight: boolean
  pendingConflict: SaveConflictState | null
  pendingConfirmation: SaveConfirmationState | null
  lastError: SaveRequestError | null
  lastErrorCategory: SaveErrorCategory | null
  lastSavedAt: number | null
  /** 覆盖场景下使用的 PUT revision（409 第二出口）。 */
  revisionOverride: number | null
  /** 已确认的交互 token（428 后由用户确认写入）。 */
  interactionToken: string | null
  online: boolean
}

interface SaveStoreDeps {
  documentStore: StudioDocumentStore
  transport: SaveTransport
  /**
   * 取当前要保存的场景（宿主传 `getLocalSaveRevision`）。
   * 文档 store 里的 document 只是“最近一次载入/保存”的副本；本地修改是就地发生的，
   * 所以 PUT / beacon 都必须重新取一次宿主快照，不能直接发 documentStore.getDocument()。
   */
  getScene?: () => any
  timers?: SaveStoreTimers
  now?: () => number
  /** 是否处于 embedded 预览舞台（不自动保存）。 */
  isEmbedded?: () => boolean
  /** 页面是否挂起（隐藏/冻结），暂时不保存。 */
  isPageSuspended?: () => boolean
  isOnline?: () => boolean
  /** 导出本地副本（409 第三出口）；未提供时返回 export-unavailable。 */
  exportLocalCopy?: (scene: any) => void | Promise<void>
  onStateChange?: (state: SaveStoreState) => void
}

export type FlushResult =
  | { ok: true; reason: 'saved' | 'clean'; revision: number }
  | { ok: false; reason: 'conflict'; currentRevision: number | null }
  | { ok: false; reason: 'confirmation-required'; token: string }
  | { ok: false; reason: 'fatal'; error: SaveRequestError; category: SaveErrorCategory }
  | { ok: false; reason: 'retry-scheduled'; retryAt: number; error: SaveRequestError }
  | { ok: false; reason: 'offline' }
  | { ok: false; reason: 'deferred' }
  | { ok: false; reason: 'blocked' }

type LoadResult =
  | { ok: true; revision: number }
  | { ok: false; reason: 'fatal'; error: SaveRequestError }
  | { ok: false; reason: 'retryable'; error: SaveRequestError }

const defaultTimers: SaveStoreTimers = {
  setTimeout: (handler, delayMs) => globalThis.setTimeout(handler, delayMs) as unknown as number,
  clearTimeout: (handle) => globalThis.clearTimeout(handle as any),
}

function createInitialState(online: boolean): SaveStoreState {
  return {
    status: 'idle',
    attempt: 0,
    nextRetryAt: null,
    firstDirtyAt: null,
    isSaveInFlight: false,
    pendingConflict: null,
    pendingConfirmation: null,
    lastError: null,
    lastErrorCategory: null,
    lastSavedAt: null,
    revisionOverride: null,
    interactionToken: null,
    online,
  }
}

function detailOf(error: SaveRequestError): any {
  return error.detail && typeof error.detail === 'object' ? error.detail : {}
}

export class StudioSaveStore {
  private readonly deps: SaveStoreDeps
  private readonly documentStore: StudioDocumentStore
  private readonly timers: SaveStoreTimers
  private readonly now: () => number
  private state: SaveStoreState
  private autosaveTimer: number | null = null
  private inFlight: Promise<FlushResult> | null = null
  private readonly listeners = new Set<(state: SaveStoreState) => void>()

  constructor(deps: SaveStoreDeps) {
    this.deps = deps
    this.documentStore = deps.documentStore
    this.timers = deps.timers ?? defaultTimers
    this.now = deps.now ?? Date.now
    this.state = createInitialState(deps.isOnline ? deps.isOnline() : true)
  }

  getState(): SaveStoreState {
    return { ...this.state }
  }

  subscribe(listener: (state: SaveStoreState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  hasUnsavedChanges(): boolean {
    return this.documentStore.isDirty()
  }

  hasPendingDialog(): boolean {
    return this.state.pendingConflict !== null || this.state.pendingConfirmation !== null
  }

  /** 载入草稿；失败后进入 blocked-readonly（只读、可重试/导出/放弃）。 */
  async load(): Promise<LoadResult> {
    this.cancelTimers()
    this.patch({ status: 'loading', lastError: null, lastErrorCategory: null })
    const result = await this.deps.transport.load()
    if (result.ok) {
      const payload = result.payload
      this.documentStore.applyLoaded(
        { revision: payload.revision, scene: payload.scene },
        this.documentStore.getRuntimeSceneRevision(),
      )
      this.patch({
        status: 'saved',
        attempt: 0,
        nextRetryAt: null,
        firstDirtyAt: null,
        lastError: null,
        lastErrorCategory: null,
        lastSavedAt: this.now(),
        pendingConflict: null,
        pendingConfirmation: null,
        revisionOverride: null,
        interactionToken: null,
      })
      return { ok: true, revision: payload.revision }
    }
    const category = classifySaveError(result.error)
    this.patch({
      status: 'blocked-readonly',
      lastError: result.error,
      lastErrorCategory: category,
    })
    return { ok: false, reason: category === 'retryable' ? 'retryable' : 'fatal', error: result.error }
  }

  /**
   * 宿主已经用自己的 GET 应用了草稿（boot 载入 / 409「加载服务器版本」/ 只读重试）：
   * 同步状态机为 saved，不重复请求。`payload` 仅供宿主未先行 applyLoaded 时补写文档 store。
   */
  acceptLoaded(payload?: StudioDraftPayload): void {
    if (payload) {
      this.documentStore.applyLoaded({
        revision: payload.revision,
        scene: payload.scene,
      })
    }
    this.cancelTimers()
    this.patch({
      status: 'saved',
      attempt: 0,
      nextRetryAt: null,
      firstDirtyAt: null,
      lastError: null,
      lastErrorCategory: null,
      lastSavedAt: this.now(),
      pendingConflict: null,
      pendingConfirmation: null,
      revisionOverride: null,
      interactionToken: null,
    })
  }

  /** 载入失败：进入只读（禁止自动保存），宿主负责横幅 / 重试 / 导出本地副本。 */
  markLoadFailed(error: SaveRequestError): void {
    this.cancelTimers()
    this.patch({
      status: 'blocked-readonly',
      isSaveInFlight: false,
      lastError: error,
      lastErrorCategory: classifySaveError(error),
      pendingConflict: null,
      pendingConfirmation: null,
    })
  }

  /** 文档已被就地修改后调用；记录脏标记并调度自动保存。 */
  markDirty(): void {
    if (!this.documentStore.isDirty()) {
      // 文档已追平（例如撤销回原状），清掉待保存状态。
      if (this.state.firstDirtyAt !== null && !this.state.isSaveInFlight) {
        this.cancelAutosaveTimer()
        this.patch({ status: 'saved', firstDirtyAt: null, attempt: 0, nextRetryAt: null })
      }
      return
    }
    // 非重试性失败（422 窗型几何 / 413 体量 / 401 / 403）之后用户**已经改了内容**：
    // 必须放行下一次保存。否则 computeDirtyStatus() 见到 failed 就原样返回 →
    // 自动保存不再排期、flushNow() 直接返回 fatal，header 上那句「保存失败，修改后重试」
    // 是空话 —— 用户改多少次都不会再发一次 PUT，只有刷新页面才恢复。
    // 没有新改动时（上面未返回的分支之外）仍保持 failed，不拿同一份坏数据反复打后端。
    if (this.state.status === 'failed')
      this.patch({ status: 'dirty', attempt: 0, lastError: null, lastErrorCategory: null })
    const firstDirtyAt = this.state.firstDirtyAt ?? this.now()
    const nextStatus = this.computeDirtyStatus()
    this.patch({ status: nextStatus, firstDirtyAt })
    if (nextStatus === 'dirty' || nextStatus === 'retrying') this.scheduleAutosave()
  }

  /** 手动调度（取消已有定时器后按防抖/最大延迟重排；`explicitDelayMs` 供宿主立即保存）。 */
  scheduleAutosave(explicitDelayMs?: number): void {
    if (this.isSchedulingBlocked()) return
    this.cancelAutosaveTimer()
    const delay =
      explicitDelayMs !== undefined
        ? Math.max(0, Math.trunc(explicitDelayMs) || 0)
        : this.state.status === 'retrying' && this.state.nextRetryAt !== null
          ? Math.max(0, this.state.nextRetryAt - this.now())
          : computeAutosaveDelay(this.now(), this.state.firstDirtyAt)
    this.autosaveTimer = this.timers.setTimeout(() => {
      this.autosaveTimer = null
      void this.flushNow()
    }, delay)
  }

  /** 冲突 / 待确认 / 致命失败时不发 PUT，直接给出对应结果。 */
  private stateFlushResult(): FlushResult | null {
    if (this.state.status === 'conflict') {
      return { ok: false, reason: 'conflict', currentRevision: this.state.pendingConflict?.currentRevision ?? null }
    }
    // 428 待确认 / 用户刚取消确认：禁止再发无 token 的 PUT，否则会立刻再撞 428 并反复弹窗。
    // confirmInteraction() 会先把 status 改回 dirty 并写入 interactionToken，再走本入口。
    if (this.state.status === 'blocked') {
      const pending = this.state.pendingConfirmation
      return pending
        ? { ok: false, reason: 'confirmation-required', token: pending.token }
        : { ok: false, reason: 'blocked' }
    }
    if (this.state.status === 'failed') {
      return {
        ok: false,
        reason: 'fatal',
        error: this.state.lastError ?? {},
        category: this.state.lastErrorCategory ?? 'invalid',
      }
    }
    return null
  }

  /** 立即保存（自动保存、退出确认、手动保存共用入口，对在途 PUT 去重）。 */
  async flushNow(): Promise<FlushResult> {
    if (this.inFlight) return this.inFlight
    if (this.deps.isEmbedded?.() || this.deps.isPageSuspended?.()) return { ok: false, reason: 'deferred' }
    if (this.sceneForSave() == null || this.state.status === 'blocked-readonly') {
      return { ok: false, reason: 'blocked' }
    }
    const stateResult = this.stateFlushResult()
    if (stateResult) return stateResult
    if (!this.state.online) {
      this.patch({ status: 'offline' })
      return { ok: false, reason: 'offline' }
    }
    if (!this.documentStore.isDirty()) {
      this.patch({ status: 'saved', firstDirtyAt: null })
      return { ok: true, reason: 'clean', revision: this.documentStore.getLoadedRevision() }
    }

    this.cancelTimers()
    const promise = this.performSave()
    this.inFlight = promise
    try {
      return await promise
    } finally {
      this.inFlight = null
    }
  }

  /** 退出流程：等保存结束；冲突/确认未决时返回失败，交由三态对话框处理。 */
  async requestExit(): Promise<FlushResult> {
    const result = await this.flushNow()
    if (result.ok) return result
    if (result.reason === 'retry-scheduled') return this.flushNowAfterResetAttempt()
    return result
  }

  private async flushNowAfterResetAttempt(): Promise<FlushResult> {
    if (this.inFlight) return this.inFlight
    this.patch({ status: 'dirty', attempt: 0, nextRetryAt: null })
    const promise = this.performSave()
    this.inFlight = promise
    try {
      return await promise
    } finally {
      this.inFlight = null
    }
  }

  /** pagehide：sendBeacon 尽力而为，不推进 revision、不改状态机。 */
  flushOnPageHide(): { sent: boolean } {
    const beacon = this.deps.transport.beacon
    if (!beacon) return { sent: false }
    if (!this.documentStore.isDirty()) return { sent: false }
    if (this.state.isSaveInFlight || this.inFlight) return { sent: false }
    const revision = this.state.revisionOverride ?? this.documentStore.getLoadedRevision()
    try {
      const sent = beacon({
        revision,
        scene: this.sceneForSave(),
        ...(this.state.interactionToken ? { interactionConfirmation: this.state.interactionToken } : {}),
      })
      return { sent: sent === true }
    } catch {
      return { sent: false }
    }
  }

  setOnline(online: boolean): void {
    const wasOffline = !this.state.online
    this.patch({ online })
    if (!online) {
      this.cancelTimers()
      if (this.documentStore.isDirty()) this.patch({ status: 'offline' })
      return
    }
    if (wasOffline && this.documentStore.isDirty()) {
      this.patch({ status: this.computeDirtyStatus() })
      this.scheduleAutosave()
    }
  }

  /** 409 第一出口：放弃本地改动，载入服务器最新版本。 */
  async resolveConflictLoadRemote(): Promise<LoadResult> {
    this.cancelTimers()
    return this.load()
  }

  /** 409 第二出口：用服务器 currentRevision 覆盖远端。 */
  async resolveConflictOverwrite(): Promise<FlushResult> {
    const currentRevision = this.state.pendingConflict?.currentRevision
    if (typeof currentRevision !== 'number') {
      return { ok: false, reason: 'conflict', currentRevision: currentRevision ?? null }
    }
    this.patch({
      pendingConflict: null,
      status: 'dirty',
      revisionOverride: currentRevision,
      attempt: 0,
      nextRetryAt: null,
    })
    return this.flushNow()
  }

  /** 409 第三出口：导出本地副本（不改变与服务端的冲突状态）。 */
  async exportLocalCopy(): Promise<{ ok: boolean; reason?: 'export-unavailable' }> {
    const exporter = this.deps.exportLocalCopy
    if (!exporter) return { ok: false, reason: 'export-unavailable' }
    await exporter(this.documentStore.getDocument())
    return { ok: true }
  }

  /** 428 用户确认删除交互配置后：记下 token 并立即重试。 */
  async confirmInteraction(token?: string): Promise<FlushResult> {
    const confirmation = this.state.pendingConfirmation
    const nextToken = token ?? confirmation?.token ?? this.state.interactionToken
    if (!nextToken) return { ok: false, reason: 'confirmation-required', token: '' }
    this.patch({
      pendingConfirmation: null,
      interactionToken: nextToken,
      status: 'dirty',
      attempt: 0,
      nextRetryAt: null,
    })
    return this.flushNow()
  }

  /** 428 用户取消（保留本地改动；保持 blocked，不自动重试）。 */
  cancelConfirmation(): void {
    // 清掉 token，但 status 留在 blocked：否则 flushAutosave 的 finally → scheduleAutosave
    // 会立刻再发一次无 confirmation 的 PUT，控制台里就变成 428 连打。
    // 用户再改一笔时 markDirty() 会经 computeDirtyStatus 回到 dirty 并重新排期。
    this.patch({
      pendingConfirmation: null,
      interactionToken: null,
      status: 'blocked',
      nextRetryAt: null,
    })
  }

  dispose(): void {
    this.cancelTimers()
    this.listeners.clear()
  }

  /** 当前要保存的场景：优先宿主快照（本地修改就地发生），退化为文档 store。 */
  private sceneForSave(): any {
    const scene = this.deps.getScene ? this.deps.getScene() : this.documentStore.getDocument()
    return scene ?? null
  }

  private async performSave(): Promise<FlushResult> {
    const revision = this.state.revisionOverride ?? this.documentStore.getLoadedRevision()
    const scene = this.sceneForSave()
    const request: SaveTransportPutRequest = {
      revision,
      scene,
      ...(this.state.interactionToken ? { interactionConfirmation: this.state.interactionToken } : {}),
    }
    this.patch({ status: 'saving', isSaveInFlight: true, lastError: null, lastErrorCategory: null })
    const result = await this.deps.transport.put(request)
    if (result.ok) {
      const payload = result.payload
      this.documentStore.applySaved({ revision: payload.revision, scene: payload.scene ?? scene })
      this.patch({
        status: 'saved',
        isSaveInFlight: false,
        attempt: 0,
        nextRetryAt: null,
        firstDirtyAt: null,
        lastError: null,
        lastErrorCategory: null,
        lastSavedAt: this.now(),
        revisionOverride: null,
        pendingConflict: null,
        pendingConfirmation: null,
        interactionToken: null,
      })
      return { ok: true, reason: 'saved', revision: payload.revision }
    }

    const error = result.error
    const category = classifySaveError(error)
    this.patch({ isSaveInFlight: false, lastError: error, lastErrorCategory: category })

    if (category === 'conflict') {
      const detail = detailOf(error)
      const currentRevision = typeof detail.currentRevision === 'number' ? detail.currentRevision : null
      this.cancelTimers()
      this.patch({
        status: 'conflict',
        pendingConflict: { currentRevision, detectedAt: this.now() },
        revisionOverride: null,
      })
      return { ok: false, reason: 'conflict', currentRevision }
    }

    if (category === 'confirmation') {
      const detail = detailOf(error)
      const token = typeof detail.token === 'string' ? detail.token : ''
      this.cancelTimers()
      this.patch({
        status: 'blocked',
        pendingConfirmation: {
          token,
          message: typeof detail.message === 'string' ? detail.message : '',
          impacts: detail.impacts ?? null,
          projects: detail.projects ?? null,
          requestedAt: this.now(),
        },
      })
      return { ok: false, reason: 'confirmation-required', token }
    }

    if (category === 'retryable') {
      const attempt = this.state.attempt + 1
      const retryAt = this.now() + backoffDelay(attempt)
      this.patch({
        status: 'retrying',
        attempt,
        nextRetryAt: retryAt,
      })
      this.scheduleAutosave()
      return { ok: false, reason: 'retry-scheduled', retryAt, error }
    }

    this.cancelTimers()
    this.patch({ status: 'failed', revisionOverride: null })
    return { ok: false, reason: 'fatal', error, category }
  }

  private computeDirtyStatus(): SaveStatus {
    if (!this.state.online) return 'offline'
    if (this.state.pendingConflict) return 'conflict'
    if (this.state.pendingConfirmation) return 'blocked'
    if (this.state.status === 'failed') return 'failed'
    if (this.state.status === 'blocked-readonly') return 'blocked-readonly'
    if (this.state.status === 'saving') return 'saving'
    if (this.state.attempt > 0) return 'retrying'
    return 'dirty'
  }

  private isSchedulingBlocked(): boolean {
    if (this.deps.isEmbedded?.() || this.deps.isPageSuspended?.()) return true
    if (!this.state.online) return true
    if (!this.documentStore.getDocument()) return true
    if (this.state.status === 'conflict' || this.state.status === 'blocked') return true
    if (this.state.status === 'failed' || this.state.status === 'blocked-readonly') return true
    return false
  }

  private cancelAutosaveTimer(): void {
    if (this.autosaveTimer !== null) {
      this.timers.clearTimeout(this.autosaveTimer)
      this.autosaveTimer = null
    }
  }

  private cancelTimers(): void {
    this.cancelAutosaveTimer()
  }

  private patch(partial: Partial<SaveStoreState>): void {
    this.state = { ...this.state, ...partial }
    const snapshot = this.getState()
    this.deps.onStateChange?.(snapshot)
    for (const listener of this.listeners) {
      try {
        listener(snapshot)
      } catch {
        // 监听器异常不得影响保存流程。
      }
    }
  }
}

/**
 * C4 —— 场景同步控制器（轮询 / 实时推送）。
 *
 * 设计约束（对应重构目标）：
 * 1. **决策是纯函数**：`decideSceneSync` 只吃「运行时场景快照 + 远端场景 + 本地脏标记 +
 *    页面状态」，不发起请求、不改文档、不写历史；便于覆盖所有分支。
 * 2. **只读运行时快照，不碰保存版本线**：轮询路径绝不读取/推进 `loadedRevision`，
 *    也不从远端载荷里取 revision —— 避让「轮询推进了保存版本、导致 CAS 失败」的竞态。
 * 3. **非全量只更新运行时**：楼层内容变化 → 只替换该楼层 scene（保留本地视图设置）；
 *    仅灯光/楼层名变化 → 只同步 `baseLighting` 与楼层名；不重建场景、不弹确认。
 * 4. **全量先 flush**：本地脏时先 `flush()` 保存，保存成功才重建；保存冲突则**不覆盖**
 *    本地（outcome=conflict，交给 save-store 的 409 三出口），保存失败则本轮搁置。
 * 5. embedded 预览舞台不参与同步；页面挂起时延后。
 */


/** 与 scene-update.ts 保持一致：这些键属于「视图/会话」状态，不参与同步比较。 */
const VIEW_SETTING_KEYS = [
  'planViewRotation',
  'cameraView',
  'cameraTopRotation',
  'cameraMode',
  'cameraFocalLength',
  'fixedCameraView',
  'livePreviewEnabled',
  'backgroundVisible',
  'snapEnabled',
  'snapEndpoints',
  'snapIntersections',
  'snapSegments',
  'snapOrthogonal',
  'snapAngles',
  'snapGrid',
  'snapTolerance',
  'previewPanelRatio',
  'detailsPanelWidthRatio',
]

type FloorNameChange = { floorId: string; from: string; to: string }

type SceneSyncDecision =
  | { kind: 'ignored'; reason: 'embedded' | 'no-visual-change' }
  | { kind: 'deferred'; reason: 'page-suspended' }
  | { kind: 'metadata-only'; floorNameChanges: FloorNameChange[] }
  | { kind: 'lighting-only'; lighting: boolean; floorNameChanges: FloorNameChange[] }
  | { kind: 'merge-floors'; floorIds: string[]; lighting: boolean; floorNameChanges: FloorNameChange[] }
  | { kind: 'full-reload' }
  | { kind: 'flush-then-reload' }
  | { kind: 'conflict'; reason: 'local-dirty' }

export type SceneSyncOutcome =
  | { kind: 'ignored'; reason: 'embedded' | 'no-visual-change' }
  /**
   * `reload-unavailable`：需要全量重建但没人实现 `replaceScene`。
   *
   * 以前 studio-app 注入的是空实现 `replaceScene: () => {}`，全量变更会被吞掉却仍上报
   * `full-reload` —— 调用方按「已重建」继续走，界面停在旧场景上且没有任何线索。现在把这条
   * 分支显式化，让「没实现」可被观测。
   */
  | { kind: 'deferred'; reason: 'page-suspended' | 'reload-unavailable' }
  | { kind: 'metadata-only'; floorNameChanges: FloorNameChange[] }
  | { kind: 'lighting-only'; lighting: boolean; floorNameChanges: FloorNameChange[] }
  | { kind: 'merge-floors'; floorIds: string[]; lighting: boolean; floorNameChanges: FloorNameChange[] }
  | { kind: 'full-reload'; afterFlush: boolean }
  | { kind: 'conflict'; reason: 'local-dirty' }
  | { kind: 'stalled'; reason: 'flush-failed' }

interface SceneSyncInput {
  /** 运行时场景快照（含视图设置），不是保存文档。 */
  runtimeScene: any
  remoteScene: any
  isDirty: boolean
  isEmbedded: boolean
  isPageSuspended: boolean
}

/** 预算「楼层集合」的 id 顺序，用于稳定比较。 */
function floorIdsOf(scene: any): string[] {
  return Array.isArray(scene?.floors) ? scene.floors.map((floor: any) => String(floor?.id ?? '')) : []
}

function diffFloorNames(runtimeScene: any, remoteScene: any): FloorNameChange[] {
  const localById = new Map<string, any>()
  for (const floor of runtimeScene?.floors ?? []) localById.set(String(floor?.id ?? ''), floor)
  const changes: FloorNameChange[] = []
  for (const remoteFloor of remoteScene?.floors ?? []) {
    const floorId = String(remoteFloor?.id ?? '')
    const localFloor = localById.get(floorId)
    if (!localFloor) continue
    const from = typeof localFloor.name === 'string' ? localFloor.name : ''
    const floorName = typeof remoteFloor.name === 'string' ? remoteFloor.name : ''
    if (from !== floorName) changes.push({ floorId, from, to: floorName })
  }
  return changes
}

/** 场景楼层数组（保持对象引用，供就地回填）。 */
function sceneFloorRecords(scene: unknown): Record<string, unknown>[] {
  const floors = (scene as { floors?: unknown } | null | undefined)?.floors
  if (!Array.isArray(floors)) return []
  return floors.filter((floor): floor is Record<string, unknown> => !!floor && typeof floor === 'object')
}

/** 模型备注指纹：`集合/id → remark`，只用于判断「备注是不是别人改过」。 */
function floorRemarkFingerprint(scene: unknown): string {
  const floorScene = (scene ?? {}) as Record<string, unknown>,
    entries: Array<[string, string, string]> = []
  for (const collectionKey of ['items', 'doors']) {
    const collection = floorScene[collectionKey]
    if (!Array.isArray(collection)) continue
    for (const entry of collection)
      entries.push([
        collectionKey,
        String((entry as Record<string, unknown> | null)?.id ?? ''),
        String((entry as Record<string, unknown> | null)?.remark ?? ''),
      ])
  }
  return JSON.stringify(entries)
}

/**
 * 备注变化**不会**进 `sceneUpdatePlan`（`withoutModelRemarks` 把它们剔掉了），
 * 否则改个备注就要重建整个楼层。但「只改备注」的远端变更仍然要落到本地，
 * 否则配置弹窗里看到的是旧备注 —— 这里单独认出来，走 metadata-only。
 */
function hasFloorRemarkChanges(runtimeScene: unknown, remoteScene: unknown): boolean {
  const localById = new Map<string, Record<string, unknown>>()
  for (const floor of sceneFloorRecords(runtimeScene)) localById.set(String(floor.id ?? ''), floor)
  for (const remoteFloor of sceneFloorRecords(remoteScene)) {
    const localFloor = localById.get(String(remoteFloor.id ?? ''))
    if (!localFloor) continue
    if (floorRemarkFingerprint(localFloor.scene) !== floorRemarkFingerprint(remoteFloor.scene)) return true
  }
  return false
}

/**
 * 纯决策：给定输入返回本轮同步动作。
 * 顺序敏感：embedded → 挂起 → 无视觉变化 → 全量 → 楼层合并 → 仅灯光 → 仅楼层名。
 */
function decideSceneSync(input: SceneSyncInput): SceneSyncDecision {
  if (input.isEmbedded) return { kind: 'ignored', reason: 'embedded' }
  if (input.isPageSuspended) return { kind: 'deferred', reason: 'page-suspended' }
  const plan = sceneUpdatePlan(input.runtimeScene, input.remoteScene)
  const floorNameChanges = diffFloorNames(input.runtimeScene, input.remoteScene)
  const hasChanges =
    plan.visual || floorNameChanges.length > 0 || hasFloorRemarkChanges(input.runtimeScene, input.remoteScene)
  if (!hasChanges) return { kind: 'ignored', reason: 'no-visual-change' }
  if (plan.full) return input.isDirty ? { kind: 'flush-then-reload' } : { kind: 'full-reload' }
  if (plan.floors.length > 0) {
    return { kind: 'merge-floors', floorIds: [...plan.floors], lighting: plan.lighting, floorNameChanges }
  }
  if (plan.lighting) return { kind: 'lighting-only', lighting: true, floorNameChanges }
  return { kind: 'metadata-only', floorNameChanges }
}

/** 仅同步灯光：就地替换 baseLighting（保留引用，避免重渲染拿旧对象）。 */
function applyBaseLighting(runtimeScene: any, remoteScene: any): boolean {
  if (!runtimeScene || !remoteScene) return false
  if (runtimeScene.baseLighting === remoteScene.baseLighting) return false
  runtimeScene.baseLighting = remoteScene.baseLighting
  return true
}

function applyFloorNames(runtimeScene: any, changes: FloorNameChange[]): number {
  if (!runtimeScene || !Array.isArray(runtimeScene.floors) || changes.length === 0) return 0
  const byId = new Map(changes.map((change) => [change.floorId, change.to]))
  let applied = 0
  for (const floor of runtimeScene.floors) {
    const nextName = byId.get(String(floor?.id ?? ''))
    if (nextName === undefined || floor.name === nextName) continue
    floor.name = nextName
    applied += 1
  }
  return applied
}

/**
 * 合并指定楼层：只替换这些楼层的 scene 内容（对象引用保持），并保留本地视图设置。
 * 返回实际替换的楼层 id（远端缺失的楼层会被跳过）。
 */
export function mergeFloors(runtimeScene: any, remoteScene: any, floorIds: readonly string[]): string[] {
  if (!runtimeScene || !remoteScene || !Array.isArray(runtimeScene.floors)) return []
  const localById = new Map<string, any>()
  for (const floor of runtimeScene.floors) localById.set(String(floor?.id ?? ''), floor)
  const remoteById = new Map<string, any>()
  for (const floor of remoteScene.floors ?? []) remoteById.set(String(floor?.id ?? ''), floor)
  const replaced: string[] = []
  for (const floorId of floorIds) {
    const localFloor = localById.get(floorId)
    const remoteFloor = remoteById.get(floorId)
    if (!localFloor || !remoteFloor) continue
    const localSettings = localFloor.scene?.settings
    const nextScene = { ...remoteFloor.scene }
    if (localSettings && typeof localSettings === 'object') {
      // 视图键（相机/吸附/面板宽度）以本地为准：远端不覆盖用户当前视图状态。
      const mergedSettings: Record<string, unknown> = { ...(remoteFloor.scene?.settings ?? {}) }
      for (const key of VIEW_SETTING_KEYS) {
        if (key in localSettings) mergedSettings[key] = localSettings[key]
      }
      nextScene.settings = mergedSettings
    }
    localFloor.scene = nextScene
    replaced.push(floorId)
  }
  return replaced
}

interface SceneSyncDeps {
  /** 运行时场景快照读取器。 */
  getRuntimeScene: () => any
  /** 来自 document-store 的脏标记（不得读取保存 revision）。 */
  isDirty: () => boolean
  /** 脏时先推送保存；返回 saved / conflict / failed。 */
  flush: () => Promise<'saved' | 'conflict' | 'failed'>
  /**
   * 全量重建场景。
   *
   * **可选**：3D 舞台有自己的 adopt 流程（`readSceneUpdate` → `adoptSceneUpdate`），
   * 编辑器侧通常不需要再重建一次。未注入时控制器会返回
   * `{ kind: "deferred", reason: "reload-unavailable" }`，而不是假装重建完成。
   */
  replaceScene?: (remoteScene: any) => void
  isEmbedded?: () => boolean
  isPageSuspended?: () => boolean
  onOutcome?: (outcome: SceneSyncOutcome) => void
}

export class StudioSceneSyncController {
  private readonly deps: SceneSyncDeps
  private pendingFlush: Promise<'saved' | 'conflict' | 'failed'> | null = null
  private flushInFlight = false
  private pendingReload: Promise<SceneSyncOutcome> | null = null

  constructor(deps: SceneSyncDeps) {
    this.deps = deps
  }

  /** 只做决策，不产生副作用（供轮询前判断/测试）。 */
  decide(remoteScene: any): SceneSyncDecision {
    return decideSceneSync({
      runtimeScene: this.deps.getRuntimeScene(),
      remoteScene,
      isDirty: this.deps.isDirty(),
      isEmbedded: this.deps.isEmbedded?.() ?? false,
      isPageSuspended: this.deps.isPageSuspended?.() ?? false,
    })
  }

  /** 处理一次远端场景；并发调用复用同一个在途 flush。 */
  async handleRemoteScene(remoteScene: any): Promise<SceneSyncOutcome> {
    const outcome = await this.run(this.decide(remoteScene), remoteScene)
    this.deps.onOutcome?.(outcome)
    return outcome
  }

  private async run(decision: SceneSyncDecision, remoteScene: any): Promise<SceneSyncOutcome> {
    switch (decision.kind) {
      case 'ignored':
      case 'deferred':
        return decision
      case 'metadata-only':
        this.applyNames(decision.floorNameChanges)
        this.applyRemarks(remoteScene)
        return decision
      case 'lighting-only': {
        const runtimeScene = this.deps.getRuntimeScene()
        const lighting = applyBaseLighting(runtimeScene, remoteScene)
        this.applyNames(decision.floorNameChanges)
        this.applyRemarks(remoteScene)
        return { kind: 'lighting-only', lighting, floorNameChanges: decision.floorNameChanges }
      }
      case 'merge-floors': {
        const runtimeScene = this.deps.getRuntimeScene()
        const replaced = mergeFloors(runtimeScene, remoteScene, decision.floorIds)
        const lighting = decision.lighting ? applyBaseLighting(runtimeScene, remoteScene) : false
        this.applyNames(decision.floorNameChanges)
        return {
          kind: 'merge-floors',
          floorIds: replaced,
          lighting,
          floorNameChanges: decision.floorNameChanges,
        }
      }
      case 'full-reload':
        return this.reloadOnce(remoteScene, false)
      case 'flush-then-reload':
        return this.reloadOnce(remoteScene, true)
      case 'conflict':
        return decision
    }
  }

  /**
   * 全量重建；并发轮询复用同一个在途重建（首个请求的远端载荷胜出，后续轮询会再决策）。
   */
  private reloadOnce(remoteScene: any, afterFlush: boolean): Promise<SceneSyncOutcome> {
    // 没有重建实现就别先 flush：保存一次却仍然停在旧场景，等于白推一次版本。
    const replaceScene = this.deps.replaceScene
    if (!replaceScene) {
      return Promise.resolve<SceneSyncOutcome>({ kind: 'deferred', reason: 'reload-unavailable' })
    }
    if (this.pendingReload) return this.pendingReload
    const pending = (async (): Promise<SceneSyncOutcome> => {
      if (afterFlush) {
        const flushResult = await this.flushOnce()
        if (flushResult === 'conflict') return { kind: 'conflict', reason: 'local-dirty' }
        if (flushResult === 'failed') return { kind: 'stalled', reason: 'flush-failed' }
      }
      replaceScene(remoteScene)
      return { kind: 'full-reload', afterFlush }
    })().finally(() => {
      this.pendingReload = null
    })
    this.pendingReload = pending
    return pending
  }

  private applyNames(changes: FloorNameChange[]): void {
    if (changes.length === 0) return
    applyFloorNames(this.deps.getRuntimeScene(), changes)
  }

  /** 备注只在对齐 id 后回填：远端删掉备注要跟着删，不能留着旧的。 */
  private applyRemarks(remoteScene: unknown): void {
    const runtimeScene = this.deps.getRuntimeScene(),
      remoteById = new Map<string, Record<string, unknown>>()
    for (const remoteFloor of sceneFloorRecords(remoteScene)) remoteById.set(String(remoteFloor.id ?? ''), remoteFloor)
    for (const localFloor of sceneFloorRecords(runtimeScene)) {
      const remoteFloor = remoteById.get(String(localFloor.id ?? ''))
      if (!remoteFloor) continue
      syncModelRemarks(localFloor.scene, remoteFloor.scene)
    }
  }

  private flushOnce(): Promise<'saved' | 'conflict' | 'failed'> {
    if (this.pendingFlush) return this.pendingFlush
    this.flushInFlight = true
    const pending = this.deps
      .flush()
      .catch((): 'failed' => 'failed')
      .finally(() => {
        this.flushInFlight = false
        this.pendingFlush = null
      })
    this.pendingFlush = pending
    return pending
  }

  /** 是否有在途 flush（save-store / 退出流程可据此避免并行 PUT）。 */
  get isFlushing(): boolean {
    return this.flushInFlight
  }

  /** 场景内部 id 列表（调试/测试用，保持稳定顺序）。 */
  static floorIds(scene: any): string[] {
    return floorIdsOf(scene)
  }
}

/**
 * C3 —— studio 草稿仓储（把 C2 保存状态机接到真实 HTTP 契约上）。
 *
 * 职责边界：本文件只做**传输**——URL、请求体、CSRF、超时、错误归一化；
 * 状态机（dirty / saving / conflict / blocked）在 save-store，文档与版本线在 document-store。
 * 因此它是 \`SaveTransport\` 的一个实现，不持有任何 UI 或 DOM 状态。
 *
 * 后端契约（homeos/backend/src/api/studio3d.py + domains/studio3d/service.py）：
 * - GET  /api/v1/studio3d                      → {revision, scene, updatedAt}；空场景是 {revision:0, scene:null, updatedAt:null}
 * - PUT  /api/v1/studio3d {revision, scene, interactionConfirmation}
 *                                              → 200 {revision, scene, updatedAt}
 * - 409 detail {code:"STUDIO3D_REVISION_CONFLICT", message, currentRevision}
 * - 428 detail {code:"STUDIO3D_INTERACTION_CONFIRMATION", token, message, impacts, projects}
 * - 413 体积超限 / 422 非法请求 / 401、403 鉴权
 *
 * 传输失败（断网、超时、非 JSON 响应）一律归一化成 \`status: undefined\`，
 * 由 save-store 的 classifySaveError 判成可重试；绝不吞掉 409/428 的结构化 detail。
 */


const STUDIO3D_DRAFT_URL = '/api/v1/studio3d'
const STUDIO3D_REQUEST_TIMEOUT_MS = 15000

interface StudioDraftRepositoryOptions {
  /** 默认 \`/api/v1/studio3d\`；测试可覆盖成全路径。 */
  url?: string
  /** 注入 fetch（测试用）；默认 \`globalThis.fetch.bind(globalThis)\`。 */
  fetchImpl?: typeof fetch
  /** 注入 CSRF 头（测试用）；默认走 \`withCsrf\`，与 studio 其它裸 fetch 一致。 */
  csrfHeaders?: (method: string) => Record<string, string>
  /** 单次请求超时；超时按网络错误处理（可重试）。 */
  timeoutMs?: number
  /** 读取 csrf cookie 的方法，仅供 beacon 兜底路径使用。 */
  csrfToken?: () => string
}

function nonNegativeInteger(value: any): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0
}

/** 从后端响应体里取 detail；字符串 detail 也保留，便于上报原始文案。 */
function draftErrorDetail(body: any): any {
  return body && typeof body === 'object' ? body.detail : undefined
}

/** HTTP 错误 → \`SaveRequestError\`；保留 detail.code / currentRevision / token。 */
function draftHttpError(status: number, body: any): SaveRequestError {
  const detail = draftErrorDetail(body)
  const message =
    (detail && typeof detail === 'object' && typeof detail.message === 'string' && detail.message) ||
    (typeof detail === 'string' && detail) ||
    '请求失败（HTTP ' + status + '）'
  return { status, detail, message }
}

/** 传输层失败（断网 / 超时 / 非 JSON）：不带 status，状态机会按可重试处理。 */
function draftTransportError(message: string): SaveRequestError {
  return { message }
}

function isRecord(value: any): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** 校验并归一化 GET / PUT 成功响应；缺字段时抛出可重试的传输错误。 */
function normalizeDraftPayload(body: any, fallbackScene: any = null): StudioDraftPayload {
  if (!isRecord(body)) throw draftTransportError('草稿响应不是 JSON 对象。')
  if (!('revision' in body)) throw draftTransportError('草稿响应缺少 revision。')
  const scene = 'scene' in body ? body.scene : fallbackScene
  if (scene !== null && scene !== undefined && !isRecord(scene))
    throw draftTransportError('草稿响应的 scene 不是对象。')
  const payload: StudioDraftPayload = {
    revision: nonNegativeInteger(body.revision),
    scene: scene ?? null,
  }
  if (typeof body.updatedAt === 'string' || body.updatedAt === null) {
    payload.updatedAt = body.updatedAt
  }
  return payload
}

async function readJsonBody(response: Response): Promise<any> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * 建立真实 HTTP 传输。
 *
 * \`load()\` 用 GET（\`cache: "no-store"\`，避免浏览器把空草稿缓存住）；
 * \`put()\` 用 JSON body + CSRF 头；\`beacon()\` 走 fetch keepalive，
 * 让 pagehide 时的最后一笔保存在标签页销毁后仍能发出去。
 */
export function createStudioDraftRepository(options: StudioDraftRepositoryOptions = {}): SaveTransport {
  const url = options.url || STUDIO3D_DRAFT_URL
  const timeoutMs = options.timeoutMs ?? STUDIO3D_REQUEST_TIMEOUT_MS
  const csrfHeaders = options.csrfHeaders || ((method: string) => withCsrf(undefined, method))
  const csrfToken = options.csrfToken || (() => '')
  const fetchImpl: typeof fetch = options.fetchImpl || ((input: any, init?: any) => globalThis.fetch(input, init))

  async function request(method: 'GET' | 'PUT', body?: any): Promise<SaveTransportResult> {
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timer = controller && timeoutMs > 0 ? globalThis.setTimeout(() => controller.abort(), timeoutMs) : null
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...csrfHeaders(method),
      }
      const response = await fetchImpl(url, {
        method,
        cache: 'no-store',
        credentials: 'same-origin',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller ? controller.signal : undefined,
      })
      if (response.status === 204) return { ok: true, payload: { revision: 0, scene: null } }
      const parsed = await readJsonBody(response)
      if (!response.ok) return { ok: false, error: draftHttpError(response.status, parsed) }
      try {
        return { ok: true, payload: normalizeDraftPayload(parsed, body?.scene) }
      } catch (error: any) {
        return {
          ok: false,
          error: error?.message
            ? draftTransportError(String(error.message))
            : draftTransportError('草稿响应无法解析。'),
        }
      }
    } catch (error: any) {
      const reason =
        error && (error.name === 'AbortError' || /abort/i.test(String(error.message || '')))
          ? '保存请求超时。'
          : String(error?.message || '网络请求失败。')
      return { ok: false, error: draftTransportError(reason) }
    } finally {
      if (timer !== null) globalThis.clearTimeout(timer)
    }
  }

  function putBody(requestBody: SaveTransportPutRequest): any {
    const body: any = { revision: nonNegativeInteger(requestBody.revision), scene: requestBody.scene }
    if (requestBody.interactionConfirmation) body.interactionConfirmation = requestBody.interactionConfirmation
    return body
  }

  return {
    load: () => request('GET'),
    put: (requestBody) => request('PUT', putBody(requestBody)),
    /** pagehide 尽力而为：keepalive fetch 成功排队即返回 true，结果不阻塞卸载。 */
    beacon: (requestBody) => {
      try {
        const body = JSON.stringify(putBody(requestBody))
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...csrfHeaders('PUT'),
        }
        if (!headers['X-CSRF-Token']) {
          const token = csrfToken()
          if (token) headers['X-CSRF-Token'] = token
        }
        const pending = fetchImpl(url, {
          method: 'PUT',
          keepalive: true,
          credentials: 'same-origin',
          headers,
          body,
        }) as Promise<any>
        if (pending && typeof pending.catch === 'function') pending.catch(() => {})
        return true
      } catch {
        return false
      }
    },
  }
}
